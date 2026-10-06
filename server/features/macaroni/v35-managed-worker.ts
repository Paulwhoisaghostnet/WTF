import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { InMemorySigner } from "@taquito/signer";
import { TezosToolkit } from "@taquito/taquito";
import { encodeOpHash } from "@taquito/utils";
import { db } from "../../db";
import {
  macaroniV35ClaimFulfillments,
  macaroniV35Drops,
  macaroniV35FundingLedger,
  macaroniV35OperationAttempts,
  macaroniV35PrivateAssets,
  macaroniV35SetupSteps,
  macaroniV35WorkItems,
} from "@shared/schema";
import {
  createMacaroniV35WorkerReadyAttempt,
  digestMacaroniV35OperationIntent,
  enqueueMacaroniV35ClaimWorkflow,
  leaseNextMacaroniV35Work,
  markMacaroniV35SignedOperationInjected,
  persistMacaroniV35PreparedSignedOperation,
  replaceExpiredMacaroniV35WorkerAttempt,
  type MacaroniV35LeasedWork,
  type MacaroniV35OperationIntent,
} from "./v35-worker";
import {
  decryptMacaroniV35PrivatePayload,
  encryptMacaroniV35PrivatePayload,
  managedMacaroniV35AssetKeyVersion,
  managedMacaroniV35AssetRuntimeConfigured,
  materializeManagedMacaroniV35Car,
  publishManagedMacaroniV35Car,
  recheckManagedMacaroniV35IndexedDuplicates,
  verifyPublishedMacaroniV35Cid,
} from "./v35-managed-assets";
import {
  recoverManagedMacaroniV35Entropy,
  verifyManagedMacaroniV35EntropyRecovery,
} from "./v35-service";
import {
  macaroniV35AllocationDigest,
  macaroniV35DrawIndex,
  macaroniV35MetadataCommitment,
} from "./v35-crypto";
import { hashMacaroniV35Payload, measuredMacaroniV35FundingPolicy } from "./v35-types";

type V35Network = "mainnet" | "shadownet";
type V35Drop = typeof macaroniV35Drops.$inferSelect;
type V35Claim = typeof macaroniV35ClaimFulfillments.$inferSelect;

function trustedManagedRpc(network: V35Network) {
  const value = String(process.env[
    network === "mainnet"
      ? "MACARONI_V35_TRUSTED_MAINNET_RPC_URL"
      : "MACARONI_V35_TRUSTED_SHADOWNET_RPC_URL"
  ] || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const TZKT: Record<V35Network, string> = {
  mainnet: "https://api.tzkt.io/v1",
  shadownet: (process.env.SHADOWNET_TZKT_API_URL || "https://api.shadownet.tzkt.io/v1").replace(/\/+$/, ""),
};

function positiveConfiguredInteger(name: string) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonnegativeConfiguredInteger(name: string) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function macaroniV35ManagedWorkerPollIntervalMs() {
  return positiveConfiguredInteger("MACARONI_V35_WORKER_INTERVAL_MS");
}

function macaroniV35ManagedLeaseMs() {
  return positiveConfiguredInteger("MACARONI_V35_WORKER_LEASE_MS");
}

function macaroniV35IndexerConfirmations() {
  const configured = nonnegativeConfiguredInteger("MACARONI_V35_INDEX_MIN_CONFIRMATIONS");
  return configured != null && configured >= 2 ? configured : null;
}

function operatorSecret(network: V35Network) {
  return String(process.env[
    network === "mainnet"
      ? "MACARONI_V35_FINALIZER_MAINNET_SECRET_KEY"
      : "MACARONI_V35_FINALIZER_SHADOWNET_SECRET_KEY"
  ] || "").trim();
}

function operatorGasMinimumMutez(phase: "arm" | "settlement" = "arm") {
  const policy = measuredMacaroniV35FundingPolicy();
  if (!policy) return null;
  return phase === "arm"
    ? policy.finalizerLiquidStartupFloorMutez
    : policy.initialContractReserveMutez;
}

export function managedMacaroniV35WorkerEnvironment(network?: V35Network) {
  const networks = network ? [network] : (["mainnet", "shadownet"] as const);
  const checks = {
    pollInterval: macaroniV35ManagedWorkerPollIntervalMs() != null,
    durableLease: macaroniV35ManagedLeaseMs() != null,
    indexerConfirmations: macaroniV35IndexerConfirmations() != null,
    privateAssetStoreAndPublisher: managedMacaroniV35AssetRuntimeConfigured(),
    measuredOperatorGasMinimum: operatorGasMinimumMutez() != null,
    trustedTezosRpc: networks.every((item) => Boolean(trustedManagedRpc(item))),
    finalizerSigner: networks.every((item) => Boolean(operatorSecret(item))),
  };
  return { ready: Object.values(checks).every(Boolean), checks };
}

async function tzktJson<T>(network: V35Network, route: string): Promise<T> {
  const response = await fetch(`${TZKT[network]}${route}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`TzKT ${network} request failed with HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function safeNat(value: unknown, label: string) {
  const converted = typeof value === "object" && value && "toNumber" in value
    ? Number((value as { toNumber(): number }).toNumber())
    : Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) throw new Error(`${label} is not a safe natural number`);
  return converted;
}

function normalizedHex(value: unknown) {
  return String(value ?? "").replace(/^0x/i, "").toLowerCase();
}

async function withContract<T>(input: {
  network: V35Network;
  contract: string;
  signer?: InMemorySigner;
  run: (toolkit: TezosToolkit, contract: any, storage: any) => Promise<T>;
}) {
  let lastError: unknown;
  const trustedRpc = trustedManagedRpc(input.network);
  if (!trustedRpc) {
    throw new Error(`Managed ${input.network} fulfillment requires an explicitly configured trusted Tezos RPC`);
  }
  for (const rpc of [trustedRpc]) {
    try {
      const toolkit = new TezosToolkit(rpc);
      if (input.signer) toolkit.setProvider({ signer: input.signer });
      const contract = await toolkit.contract.at(input.contract);
      const storage = await contract.storage<any>();
      return await input.run(toolkit, contract, storage);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not access ${input.network} Macaroni V3.5 contract`);
}

async function assertManagedOperatorChainReady(input: {
  toolkit: TezosToolkit;
  drop: V35Drop;
  signerAddress: string;
  phase: "arm" | "settlement";
}) {
  const minimum = operatorGasMinimumMutez(input.phase);
  if (!minimum) throw new Error("The evidence-derived V3.5 finalizer funding policy is unavailable");
  const [balanceValue, managerKey] = await Promise.all([
    input.toolkit.rpc.getBalance(input.signerAddress),
    input.toolkit.rpc.getManagerKey(input.signerAddress),
  ]);
  const balance = Number(balanceValue.toString());
  const ready = Number.isSafeInteger(balance) && balance >= minimum && Boolean(managerKey);
  await db.update(macaroniV35Drops).set({
    operatorGasObservedMutez: Number.isSafeInteger(balance) && balance >= 0 ? balance : 0,
    operatorGasReady: ready,
    updatedAt: new Date(),
  }).where(eq(macaroniV35Drops.id, input.drop.id));
  if (!managerKey) throw new Error("Managed finalizer public key is not revealed on-chain");
  if (!Number.isSafeInteger(balance) || balance < minimum) {
    throw new Error("Managed finalizer wallet is below the measured operation-gas reserve");
  }
  return { balance, minimum };
}

async function prepareAndPreapplyManagedOperation(input: {
  toolkit: TezosToolkit;
  signer: InMemorySigner;
  transfer: Record<string, unknown>;
  availableBalanceMutez: number;
  maximumReimbursedCostMutez?: number;
}) {
  const estimate = await input.toolkit.estimate.transfer(input.transfer as never);
  const estimatedCost = estimate.totalCost;
  if (!Number.isSafeInteger(estimatedCost) || estimatedCost <= 0) {
    throw new Error("Tezos estimator did not return a safe positive manager-operation cost");
  }
  if (estimatedCost > input.availableBalanceMutez) {
    throw new Error("Managed finalizer wallet cannot cover the freshly estimated operation cost");
  }
  if (input.maximumReimbursedCostMutez != null && estimatedCost > input.maximumReimbursedCostMutez) {
    throw new Error("Fresh settlement estimate exceeds the measured on-chain reimbursement subsidy");
  }
  const prepared = await input.toolkit.prepare.transaction({
    ...input.transfer,
    fee: estimate.suggestedFeeMutez,
    gasLimit: estimate.gasLimit,
    storageLimit: estimate.storageLimit,
  } as never);
  const forged = await input.toolkit.rpc.forgeOperations(input.toolkit.prepare.toForge(prepared));
  const signed = await input.signer.sign(forged, new Uint8Array([3]));
  const preapply = await input.toolkit.rpc.preapplyOperations([{
    ...prepared.opOb,
    signature: signed.prefixSig,
  }]);
  const errors: Array<{ id?: string; status?: string }> = [];
  const inspectResult = (result: unknown) => {
    if (!result || typeof result !== "object") return;
    const record = result as Record<string, unknown>;
    const status = typeof record.status === "string" ? record.status : null;
    if (status && status !== "applied") {
      const resultErrors = Array.isArray(record.errors) ? record.errors : [];
      if (resultErrors.length) {
        for (const error of resultErrors) {
          errors.push(error && typeof error === "object" ? error as { id?: string } : { status });
        }
      } else {
        errors.push({ status });
      }
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(inspectResult);
      else if (value && typeof value === "object") inspectResult(value);
    }
  };
  preapply.forEach(inspectResult);
  if (errors.length) {
    throw new Error(`Tezos preapply rejected the signed manager operation: ${errors.map((error) => error.id || error.status || "failed").join(", ")}`);
  }
  const signedOperationBranch = String(prepared.opOb.branch || "");
  const branchHeader = await input.toolkit.rpc.getBlockHeader({ block: signedOperationBranch });
  const signedBranchLevel = Number(branchHeader.level);
  const counters = prepared.opOb.contents
    .map((content) => Number("counter" in content ? content.counter : Number.NaN))
    .filter((counter: number) => Number.isSafeInteger(counter) && counter >= 0);
  const signerCounter = counters.length ? Math.max(...counters) : Number.NaN;
  if (!/^B[1-9A-HJ-NP-Za-km-z]{50}$/.test(signedOperationBranch)
    || !Number.isSafeInteger(signedBranchLevel) || signedBranchLevel < 0
    || !Number.isSafeInteger(signerCounter) || signerCounter < 0) {
    throw new Error("Prepared manager operation has no durable branch level or signer counter");
  }
  return {
    prepared,
    signed,
    estimate,
    estimatedCost,
    signedOperationBranch,
    signedBranchLevel,
    signerCounter,
  };
}

async function bindActiveWorkerAttempt(
  work: MacaroniV35LeasedWork,
  intent: MacaroniV35OperationIntent,
  digest: string
) {
  const active = (await db.select().from(macaroniV35OperationAttempts).where(and(
    eq(macaroniV35OperationAttempts.workItemId, work.id),
    isNull(macaroniV35OperationAttempts.reconciledAt)
  )).orderBy(desc(macaroniV35OperationAttempts.id)).limit(1))[0];
  if (!active) return { intent, attempt: null };
  if (active.intentDigest !== digest || active.workItemId !== work.id) {
    throw new Error("Active worker attempt does not match the immutable semantic intent");
  }
  return { intent: { ...intent, requestId: active.requestId }, attempt: active };
}

export function pendingMacaroniV35OperationContainsHash(pending: Record<string, unknown>, operationHash: string) {
  for (const key of ["validated", "refused", "outdated", "branch_refused", "branch_delayed", "unprocessed"]) {
    const rows = pending[key];
    if (Array.isArray(rows) && rows.some((row) => row && typeof row === "object"
      && (row as { hash?: string }).hash === operationHash)) return true;
  }
  return false;
}

export function macaroniV35SignedBranchIsIrreversiblyExpired(input: {
  signedBranchLevel: number;
  protocolMaxOperationsTtl: number;
  confirmations: number;
  rpcHeadLevel: number;
  indexedHeadLevel: number;
}) {
  const values = Object.values(input);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)
    || input.protocolMaxOperationsTtl === 0 || input.confirmations === 0) return false;
  const expiryProofLevel = input.signedBranchLevel
    + input.protocolMaxOperationsTtl
    + input.confirmations;
  return input.rpcHeadLevel > expiryProofLevel && input.indexedHeadLevel > expiryProofLevel;
}

async function proveExpiredOperationCanBeReplaced(input: {
  toolkit: TezosToolkit;
  drop: V35Drop;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
  operationHash: string;
  assertExactPostconditionStillPending: () => Promise<void>;
}) {
  if (input.attempt.operationHash !== input.operationHash
    || !input.attempt.signedOperationBranch
    || input.attempt.signedBranchLevel == null
    || input.attempt.signerCounter == null) {
    throw new Error("Signed operation lacks immutable branch/counter evidence; replacement is unsafe");
  }
  const pending = await input.toolkit.rpc.getPendingOperations({
    version: 2,
    operationHash: input.operationHash,
  }) as unknown as Record<string, unknown>;
  if (pendingMacaroniV35OperationContainsHash(pending, input.operationHash)) {
    return null;
  }
  const [constants, rpcHead, indexerHead] = await Promise.all([
    input.toolkit.rpc.getConstants(),
    input.toolkit.rpc.getBlockHeader(),
    indexedHeadLevel(input.drop.network),
  ]);
  const protocolMaxOperationsTtl = Number(constants.max_operations_time_to_live);
  const rpcHeadLevel = Number(rpcHead.level);
  if (!Number.isSafeInteger(protocolMaxOperationsTtl) || protocolMaxOperationsTtl <= 0
    || !Number.isSafeInteger(rpcHeadLevel) || rpcHeadLevel < 1) {
    throw new Error("Tezos RPC did not provide a safe operation branch TTL/head for replacement proof");
  }
  const confirmations = macaroniV35IndexerConfirmations();
  if (confirmations == null) throw new Error("Managed finality depth is not configured");
  if (!macaroniV35SignedBranchIsIrreversiblyExpired({
    signedBranchLevel: input.attempt.signedBranchLevel,
    protocolMaxOperationsTtl,
    confirmations,
    rpcHeadLevel,
    indexedHeadLevel: indexerHead,
  })) {
    return null;
  }
  await input.assertExactPostconditionStillPending();
  return {
    absentFromIndexer: true as const,
    absentFromMempool: true as const,
    signedBranchExpired: true as const,
    branchLevel: input.attempt.signedBranchLevel,
    indexedHeadLevel: indexerHead,
    protocolMaxOperationsTtl,
    exactPostconditionStillPending: true as const,
  };
}

async function openExpiredWorkerReplacement(input: {
  toolkit: TezosToolkit;
  drop: V35Drop;
  work: MacaroniV35LeasedWork;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
  intent: MacaroniV35OperationIntent;
  digest: string;
  assertExactPostconditionStillPending: () => Promise<void>;
}) {
  if (!input.work.operationHash) return null;
  const proof = await proveExpiredOperationCanBeReplaced({
    toolkit: input.toolkit,
    drop: input.drop,
    attempt: input.attempt,
    operationHash: input.work.operationHash,
    assertExactPostconditionStillPending: input.assertExactPostconditionStillPending,
  });
  if (!proof) return null;
  const suffix = `:r${input.attempt.id}`;
  const replacementIntent = {
    ...input.intent,
    requestId: `${input.intent.requestId.slice(0, 160 - suffix.length)}${suffix}`,
  };
  await replaceExpiredMacaroniV35WorkerAttempt({
    work: input.work,
    priorAttemptId: input.attempt.id,
    priorOperationHash: input.work.operationHash,
    replacementIntent,
    digest: input.digest,
    proof,
  });
  input.work.operationHash = null;
  return replacementIntent;
}

type PurchaseEvent = {
  id: number;
  level: number;
  timestamp: string;
  transactionId: number;
  payload: {
    claim_id?: number | string;
    buyer?: string;
    recipient?: string;
    unit?: number | string;
    purchase_level?: number | string;
  };
};

type PurchaseTransaction = {
  id: number;
  hash: string;
  status: string;
  amount?: number | string;
  sender?: { address?: string };
  target?: { address?: string };
  parameter?: { entrypoint?: string; value?: unknown };
};

async function indexedHeadLevel(network: V35Network) {
  const head = await tzktJson<{ level?: number }>(network, "/head");
  return safeNat(head.level, "TzKT head level");
}

async function finalizedManagedStorage(input: {
  toolkit: TezosToolkit;
  contract: any;
  network: V35Network;
}) {
  const confirmations = macaroniV35IndexerConfirmations();
  if (confirmations == null) throw new Error("MACARONI_V35_INDEX_MIN_CONFIRMATIONS must be at least 2");
  const indexedHead = await indexedHeadLevel(input.network);
  const finalizedLevel = indexedHead - confirmations;
  if (!Number.isSafeInteger(finalizedLevel) || finalizedLevel < 1) {
    throw new Error("The indexed Tezos head is not deep enough for managed finality checks");
  }
  const storage = await input.toolkit.contract.getStorage<any>(
    input.contract.address,
    input.contract.schema,
    finalizedLevel
  );
  return { finalizedLevel, storage };
}

/**
 * Arming is the trust boundary between creator setup and the managed signer.
 * Re-read every immutable inventory row at a finalized block so an out-of-band
 * replace/add/slot operation can never silently diverge from private staging.
 */
async function assertFinalizedInventoryMatchesPrivateStaging(input: {
  toolkit: TezosToolkit;
  contract: any;
  drop: V35Drop;
  allowAlreadyArmed?: boolean;
}) {
  const staged = await db.select({
    tokenSlot: macaroniV35PrivateAssets.tokenSlot,
    quantity: macaroniV35PrivateAssets.quantity,
    commitment: macaroniV35PrivateAssets.commitment,
  }).from(macaroniV35PrivateAssets).where(and(
    eq(macaroniV35PrivateAssets.dropId, input.drop.id),
    eq(macaroniV35PrivateAssets.kind, "metadata")
  )).orderBy(asc(macaroniV35PrivateAssets.tokenSlot));
  if (!input.drop.physicalSupply || !staged.length || staged.length > input.drop.physicalSupply) {
    throw new Error("Private staging has no coherent token inventory to arm");
  }
  const { finalizedLevel, storage } = await finalizedManagedStorage({
    toolkit: input.toolkit,
    contract: input.contract,
    network: input.drop.network,
  });
  const physicalSupply = staged.reduce((total, row) => total + row.quantity, 0);
  const scalarInventoryMatches = storage.setup_finalized === true
    && storage.sale_activated === false
    && storage.sale_permanently_closed === false
    && (storage.fulfillment_armed === false
      || (input.allowAlreadyArmed === true && storage.fulfillment_armed === true))
    && safeNat(storage.token_count, "finalized token count") === staged.length
    && safeNat(storage.supply, "finalized physical supply") === physicalSupply
    && physicalSupply === input.drop.physicalSupply
    && safeNat(storage.slots_loaded, "finalized loaded slots") === physicalSupply
    && safeNat(storage.next_slot_token_id, "finalized slot cursor") === staged.length;
  if (!scalarInventoryMatches) {
    throw new Error("Finalized contract inventory counters do not exactly match private staging");
  }
  for (let tokenId = 0; tokenId < staged.length; tokenId += 1) {
    const row = staged[tokenId];
    if (row.tokenSlot !== tokenId) {
      throw new Error("Private staging token rows are not contiguous from zero");
    }
    const [commitment, supply, loaded] = await Promise.all([
      storage.token_commitments.get(tokenId),
      storage.token_supply.get(tokenId),
      storage.token_slots_loaded.get(tokenId),
    ]);
    if (normalizedHex(commitment) !== normalizedHex(row.commitment)
      || safeNat(supply, `finalized token ${tokenId} supply`) !== row.quantity
      || safeNat(loaded, `finalized token ${tokenId} loaded slots`) !== row.quantity) {
      throw new Error(`Finalized token ${tokenId} commitment, supply, or slot count differs from private staging`);
    }
  }
  return {
    finalizedLevel,
    storage,
    tokenRows: staged.length,
    physicalSupply,
    inventoryDigest: hashMacaroniV35Payload(staged),
  };
}

async function purchaseTransaction(network: V35Network, transactionId: number) {
  const rows = await tzktJson<PurchaseTransaction[]>(
    network,
    `/operations/transactions?id=${transactionId}&micheline=2&limit=1`
  );
  return rows[0] ?? null;
}

function claimEligibleAt(input: {
  drop: V35Drop;
  purchaseTime: Date;
  soldOut: boolean;
}) {
  switch (input.drop.fulfillmentTrigger) {
    case "immediate": return input.purchaseTime;
    case "rolling_delay":
      return new Date(input.purchaseTime.getTime() + input.drop.claimDelaySeconds * 1_000);
    case "absolute_time":
      if (!input.drop.fulfillmentScheduledAt) throw new Error("Scheduled drop has no absolute fulfillment time");
      return input.drop.fulfillmentScheduledAt;
    case "sellout":
      if (!input.soldOut) return null;
      return new Date();
  }
}

async function findPriorSettlementWork(dropId: number, claimPosition: number) {
  if (claimPosition === 0) return null;
  const previousClaim = (await db.select({ id: macaroniV35ClaimFulfillments.id })
    .from(macaroniV35ClaimFulfillments).where(and(
      eq(macaroniV35ClaimFulfillments.dropId, dropId),
      eq(macaroniV35ClaimFulfillments.claimPosition, claimPosition - 1)
    )).limit(1))[0];
  if (!previousClaim) throw new Error("FIFO purchase event stream has a missing prior claim");
  return (await db.select({ id: macaroniV35WorkItems.id })
    .from(macaroniV35WorkItems).where(and(
      eq(macaroniV35WorkItems.dropId, dropId),
      eq(macaroniV35WorkItems.claimFulfillmentId, previousClaim.id),
      eq(macaroniV35WorkItems.workType, "settle_claim")
    )).limit(1))[0]?.id ?? null;
}

async function scanManagedMacaroniV35Drop(drop: V35Drop) {
  if (!drop.contract || !drop.serviceReady || (drop.status !== "active" && drop.status !== "closed")) {
    return { scanned: 0, queued: 0 };
  }
  const confirmations = macaroniV35IndexerConfirmations();
  if (confirmations == null) throw new Error("MACARONI_V35_INDEX_MIN_CONFIRMATIONS must be at least 2");
  const finalizedLevel = (await indexedHeadLevel(drop.network)) - confirmations;
  const observedLifecycle = await contractReleaseState(drop);
  if (observedLifecycle.permanentlyClosed && drop.status !== "closed") {
    const now = new Date();
    const completed = observedLifecycle.finalSweepComplete
      && observedLifecycle.claimsSettled === observedLifecycle.claimsCreated;
    await db.update(macaroniV35Drops).set({
      status: completed ? "completed" : "closed",
      salePermanentlyClosedAt: drop.salePermanentlyClosedAt ?? now,
      finalFulfillmentAt: completed ? now : drop.finalFulfillmentAt,
      completedAt: completed ? now : drop.completedAt,
      publicStatus: {
        state: completed ? "completed" : "closed",
        message: completed
          ? "Sale permanently closed; every purchased NFT is fulfilled and the remaining contract balance was swept automatically."
          : "Sale permanently closed. Existing purchases remain secured and automatic fulfillment is continuing.",
        fulfilledClaims: observedLifecycle.claimsSettled,
        pendingClaims: Math.max(0, observedLifecycle.claimsCreated - observedLifecycle.claimsSettled),
      },
      updatedAt: now,
    }).where(eq(macaroniV35Drops.id, drop.id));
    drop.status = completed ? "completed" : "closed";
    if (completed) return { scanned: 0, queued: 0 };
  }
  let cursor = drop.lastScannedPurchaseEventId;
  let scanned = 0;
  let queued = 0;
  const pageLimit = 10_000; // TzKT's documented endpoint maximum.
  while (true) {
    const params = new URLSearchParams({
      contract: drop.contract,
      tag: "purchase_claim",
      "id.gt": String(cursor),
      "level.le": String(finalizedLevel),
      sort: "asc",
      limit: String(pageLimit),
      select: "id,level,timestamp,payload,transactionId",
    });
    const events = await tzktJson<PurchaseEvent[]>(drop.network, `/contracts/events?${params}`);
    if (!events.length) break;
    const grouped = new Map<number, PurchaseEvent[]>();
    for (const event of events) {
      if (!Number.isSafeInteger(event.id) || !Number.isSafeInteger(event.transactionId)) {
        throw new Error("Purchase event lacks a stable TzKT event or transaction id");
      }
      const group = grouped.get(event.transactionId) ?? [];
      group.push(event);
      grouped.set(event.transactionId, group);
    }
    for (const [transactionId, transactionEvents] of grouped) {
      const transaction = await purchaseTransaction(drop.network, transactionId);
      if (!transaction || transaction.status !== "applied" || transaction.hash?.[0] !== "o"
        || transaction.target?.address !== drop.contract || transaction.parameter?.entrypoint !== "purchase") {
        throw new Error("Purchase event is not bound to an exact applied purchase operation");
      }
      transactionEvents.sort((left, right) => left.id - right.id);
      for (let eventIndex = 0; eventIndex < transactionEvents.length; eventIndex += 1) {
        const event = transactionEvents[eventIndex];
        const claimPosition = safeNat(event.payload?.claim_id, "purchase claim id");
        const buyer = String(event.payload?.buyer || "");
        const recipient = String(event.payload?.recipient || "");
        const unit = safeNat(event.payload?.unit, "purchase claim unit");
        const purchaseLevel = safeNat(event.payload?.purchase_level, "purchase level");
        if (claimPosition !== drop.indexedPurchaseClaims + scanned
          || transaction.sender?.address !== buyer || buyer !== recipient) {
          throw new Error("Purchase claim events are not the exact contiguous FIFO operation stream");
        }
        const purchaseTime = new Date(event.timestamp);
        if (!Number.isFinite(purchaseTime.getTime())) throw new Error("Purchase event timestamp is invalid");
        const onchain = await withContract({
          network: drop.network,
          contract: drop.contract,
          run: async (_toolkit, _contract, storage) => storage.claims.get(claimPosition),
        });
        if (!onchain
          || String(onchain.buyer) !== buyer
          || String(onchain.recipient) !== recipient
          || safeNat(onchain.unit, "on-chain claim unit") !== unit
          || safeNat(onchain.purchase_level, "on-chain purchase level") !== purchaseLevel) {
          throw new Error("Indexed purchase event does not match the on-chain claim record");
        }
        const [inserted] = await db.insert(macaroniV35ClaimFulfillments).values({
          dropId: drop.id,
          claimId: String(claimPosition),
          purchaseOperationHash: transaction.hash,
          purchaseTransactionId: transactionId,
          purchaseEventId: event.id,
          purchaseEventIndex: eventIndex,
          buyer,
          recipient,
          unit,
          purchaseLevel,
          purchaseTime,
          stageId: safeNat(onchain.stage_id, "on-chain stage id"),
          claimPosition,
          state: "secured",
        }).onConflictDoNothing({
          target: [macaroniV35ClaimFulfillments.dropId, macaroniV35ClaimFulfillments.purchaseEventId],
        }).returning();
        const claim = inserted ?? (await db.select().from(macaroniV35ClaimFulfillments).where(and(
          eq(macaroniV35ClaimFulfillments.dropId, drop.id),
          eq(macaroniV35ClaimFulfillments.purchaseEventId, event.id)
        )).limit(1))[0];
        if (!claim || claim.claimId !== String(claimPosition)
          || claim.purchaseOperationHash !== transaction.hash) {
          throw new Error("Purchase event id is already bound to a different claim");
        }
        if (Number(transaction.amount ?? 0) > 0 && drop.fulfillmentSubsidyMutez > 0) {
          await db.insert(macaroniV35FundingLedger).values({
            dropId: drop.id,
            direction: "credit",
            account: "contract_reserve",
            kind: "sale_subsidy",
            amountMutez: drop.fulfillmentSubsidyMutez,
            semanticEventKey: `purchase-subsidy-claim:${claim.claimId}`,
            operationHash: transaction.hash,
            sourceRef: `purchase-event:${event.id}`,
            details: { claimId: claim.claimId, stageId: claim.stageId },
            occurredAt: purchaseTime,
          }).onConflictDoNothing({
            target: [macaroniV35FundingLedger.dropId, macaroniV35FundingLedger.semanticEventKey],
          });
        }
        const lifecycle = drop.fulfillmentTrigger === "sellout"
          ? await contractReleaseState(drop)
          : { soldOut: false, permanentlyClosed: drop.status === "closed", claimsCreated: 0, claimsSettled: 0, finalSweepComplete: false };
        const soldOut = lifecycle.soldOut || lifecycle.permanentlyClosed;
        const eligibleAt = claimEligibleAt({ drop, purchaseTime, soldOut });
        if (eligibleAt) {
          const workflow = await enqueueMacaroniV35ClaimWorkflow({
            dropId: drop.id,
            claimFulfillmentId: claim.id,
            claimId: claim.claimId,
            eligibleAt,
            dependsOnPriorSettlementId: await findPriorSettlementWork(drop.id, claimPosition),
          });
          if (workflow.allocation.created) queued += 1;
        }
        cursor = event.id;
        scanned += 1;
      }
    }
    await db.update(macaroniV35Drops).set({
      indexedPurchaseClaims: drop.indexedPurchaseClaims + scanned,
      lastScannedPurchaseEventId: cursor,
      publicStatus: {
        state: drop.status === "closed" ? "closed" : "active",
        message: drop.status === "closed"
          ? "Sale permanently closed. Existing purchases remain secured and automatic fulfillment is continuing."
          : "Purchases are secured and automatic fulfillment is running.",
        fulfilledClaims: Number(drop.publicStatus.fulfilledClaims || 0),
        pendingClaims: drop.indexedPurchaseClaims + scanned - Number(drop.publicStatus.fulfilledClaims || 0),
      },
      updatedAt: new Date(),
    }).where(eq(macaroniV35Drops.id, drop.id));
    if (events.length < pageLimit) break;
  }
  // Sellout policy intentionally queues nothing before the last purchase. Once
  // the contract itself reports sold out, revisit every exact indexed claim;
  // semantic work keys make this idempotent across wakes and restarts.
  const lifecycle = await contractReleaseState(drop);
  if (drop.fulfillmentTrigger === "sellout" && (lifecycle.soldOut || lifecycle.permanentlyClosed)) {
    const claims = await db.select().from(macaroniV35ClaimFulfillments)
      .where(eq(macaroniV35ClaimFulfillments.dropId, drop.id))
      .orderBy(asc(macaroniV35ClaimFulfillments.claimPosition));
    for (const claim of claims) {
      const workflow = await enqueueMacaroniV35ClaimWorkflow({
        dropId: drop.id,
        claimFulfillmentId: claim.id,
        claimId: claim.claimId,
        eligibleAt: new Date(),
        dependsOnPriorSettlementId: await findPriorSettlementWork(drop.id, claim.claimPosition),
      });
      if (workflow.allocation.created) queued += 1;
    }
  }
  return { scanned, queued };
}

async function contractReleaseState(drop: V35Drop) {
  if (!drop.contract || !drop.physicalSupply) {
    return { soldOut: false, permanentlyClosed: false, claimsCreated: 0, claimsSettled: 0, finalSweepComplete: false };
  }
  return withContract({
    network: drop.network,
    contract: drop.contract,
    run: async (toolkit, contract) => {
      // Sellout and permanent-close are reveal gates. Read them from the same
      // finalized chain window used for indexed purchase events, never head.
      const { storage } = await finalizedManagedStorage({
        toolkit,
        contract,
        network: drop.network,
      });
      const claimsCreated = safeNat(storage.claims_created, "claims created");
      const claimsSettled = safeNat(storage.claims_settled, "claims settled");
      return {
        soldOut: claimsCreated === drop.physicalSupply,
        permanentlyClosed: storage.sale_permanently_closed === true,
        claimsCreated,
        claimsSettled,
        finalSweepComplete: storage.final_sweep_complete === true,
      };
    },
  });
}

async function workContext(work: MacaroniV35LeasedWork) {
  if (!work.claimFulfillmentId) throw new Error(`${work.workType} has no durable claim reference`);
  const [drop, claim] = await Promise.all([
    (await db.select().from(macaroniV35Drops).where(eq(macaroniV35Drops.id, work.dropId)).limit(1))[0],
    (await db.select().from(macaroniV35ClaimFulfillments).where(and(
      eq(macaroniV35ClaimFulfillments.id, work.claimFulfillmentId),
      eq(macaroniV35ClaimFulfillments.dropId, work.dropId)
    )).limit(1))[0],
  ]);
  if (!drop?.contract || !claim) throw new Error("Managed work references a missing drop or claim");
  return { drop, claim };
}

async function markWorkCompleted(work: MacaroniV35LeasedWork, state: "completed" | "applied" = "completed") {
  await db.update(macaroniV35WorkItems).set({
    state,
    leaseOwner: null,
    leaseExpiresAt: null,
    appliedAt: state === "applied" ? new Date() : null,
    lastError: null,
    errorClass: null,
    updatedAt: new Date(),
  }).where(and(
    eq(macaroniV35WorkItems.id, work.id),
    eq(macaroniV35WorkItems.payloadHash, work.payloadHash)
  ));
}

async function retryWork(work: MacaroniV35LeasedWork, error: unknown) {
  const interval = macaroniV35ManagedWorkerPollIntervalMs();
  if (!interval) throw error;
  await db.update(macaroniV35WorkItems).set({
    state: "retry_wait",
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: new Date(Date.now() + interval),
    lastError: error instanceof Error ? error.message : String(error),
    errorClass: "transient",
    updatedAt: new Date(),
  }).where(eq(macaroniV35WorkItems.id, work.id));
}

async function deferWorkUntil(work: MacaroniV35LeasedWork, eligibleAt: Date) {
  await db.update(macaroniV35WorkItems).set({
    state: "retry_wait",
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: eligibleAt,
    lastError: null,
    errorClass: null,
    updatedAt: new Date(),
  }).where(eq(macaroniV35WorkItems.id, work.id));
}

async function manualReview(work: MacaroniV35LeasedWork, error: unknown) {
  await db.update(macaroniV35WorkItems).set({
    state: "manual_review",
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: error instanceof Error ? error.message : String(error),
    errorClass: "invariant",
    updatedAt: new Date(),
  }).where(eq(macaroniV35WorkItems.id, work.id));
  if (work.claimFulfillmentId) {
    await db.update(macaroniV35ClaimFulfillments).set({
      state: "needs_reconciliation",
      updatedAt: new Date(),
    }).where(eq(macaroniV35ClaimFulfillments.id, work.claimFulfillmentId));
  }
}

async function appliedArmOperation(input: {
  drop: V35Drop;
  work: MacaroniV35LeasedWork;
  signer: string;
  parameterDigest: string;
}) {
  if (!input.work.operationHash) return "missing" as const;
  const rows = await tzktJson<Array<{
    level?: number;
    status?: string;
    sender?: { address?: string };
    target?: { address?: string };
    parameter?: { entrypoint?: string; value?: unknown };
  }>>(input.drop.network, `/operations/transactions/${encodeURIComponent(input.work.operationHash)}?micheline=2`);
  if (!rows.length) return "missing" as const;
  const confirmations = macaroniV35IndexerConfirmations();
  if (confirmations == null) throw new Error("Managed finality depth must be at least two successor blocks");
  const finalizedLevel = (await indexedHeadLevel(input.drop.network)) - confirmations;
  const exact = rows.find((row) => row.status === "applied"
    && row.sender?.address === input.signer
    && row.target?.address === input.drop.contract
    && row.parameter?.entrypoint === "arm_fulfillment"
    && hashMacaroniV35Payload(row.parameter?.value) === input.parameterDigest);
  if (!exact) return "failed" as const;
  if (!Number.isSafeInteger(exact.level) || Number(exact.level) > finalizedLevel) return "pending" as const;
  return withContract({
    network: input.drop.network,
    contract: input.drop.contract!,
    run: async (toolkit, contract) => {
      const { storage } = await finalizedManagedStorage({
        toolkit,
        contract,
        network: input.drop.network,
      });
      return storage.fulfillment_armed === true
        ? "applied" as const
        : "failed" as const;
    },
  });
}

export function macaroniV35ClosedArmDisposition(input: {
  hasSignedOperation: boolean;
  exactApplied: boolean;
  fulfillmentWasArmed: boolean;
  signedOperationIrrecoverablyAbsent: boolean;
}) {
  if (input.exactApplied) return "applied" as const;
  if (input.hasSignedOperation && !input.signedOperationIrrecoverablyAbsent) return "hold_single_flight" as const;
  if (input.fulfillmentWasArmed) return "manual_review" as const;
  return "cancelled" as const;
}

async function terminalizeArmAfterPermanentClose(input: {
  toolkit: TezosToolkit;
  drop: V35Drop;
  work: MacaroniV35LeasedWork;
  signer: string;
  parameterDigest: string;
  finalizedStorage: any;
}) {
  const status = input.work.operationHash
    ? await appliedArmOperation({
        drop: input.drop,
        work: input.work,
        signer: input.signer,
        parameterDigest: input.parameterDigest,
      })
    : "missing" as const;
  const wasArmed = input.finalizedStorage.fulfillment_armed === true;
  const exactApplied = status === "applied";
  let signedOperationIrrecoverablyAbsent = false;
  if (input.work.operationHash && !exactApplied) {
    const activeAttempt = (await db.select().from(macaroniV35OperationAttempts).where(and(
      eq(macaroniV35OperationAttempts.workItemId, input.work.id),
      eq(macaroniV35OperationAttempts.operationHash, input.work.operationHash),
      isNull(macaroniV35OperationAttempts.reconciledAt)
    )).limit(1))[0];
    if (!activeAttempt) {
      throw new Error("Closed fulfillment-arm work is missing its unreconciled signed attempt");
    }
    const proof = await proveExpiredOperationCanBeReplaced({
      toolkit: input.toolkit,
      drop: input.drop,
      attempt: activeAttempt,
      operationHash: input.work.operationHash,
      assertExactPostconditionStillPending: async () => {
        const contract = await input.toolkit.contract.at(input.drop.contract!);
        const { storage } = await finalizedManagedStorage({
          toolkit: input.toolkit,
          contract,
          network: input.drop.network,
        });
        if (storage.sale_permanently_closed !== true) {
          throw new Error("Permanent-close terminal condition changed during signed-operation expiry proof");
        }
      },
    });
    if (!proof) {
      // Keep the global signer/counter gate occupied while the exact signed
      // bytes may still be accepted from a mempool or canonical-chain race.
      throw new Error("Signed fulfillment arm remains ambiguous after permanent close until its branch irreversibly expires");
    }
    signedOperationIrrecoverablyAbsent = true;
  }
  const disposition = macaroniV35ClosedArmDisposition({
    hasSignedOperation: Boolean(input.work.operationHash),
    exactApplied,
    fulfillmentWasArmed: wasArmed,
    signedOperationIrrecoverablyAbsent,
  });
  if (disposition === "hold_single_flight") {
    throw new Error("Signed fulfillment arm remains ambiguous after permanent close until its branch irreversibly expires");
  }
  const ambiguous = disposition === "manual_review";
  const now = new Date();
  await db.transaction(async (tx) => {
    if (input.work.operationHash) {
      await tx.update(macaroniV35OperationAttempts).set({
        state: exactApplied ? "applied" : ambiguous ? "needs_reconciliation" : "failed",
        error: exactApplied
          ? null
          : ambiguous
            ? "Contract was armed before permanent close, but this signed hash is not yet proven as the exact arm operation"
            : signedOperationIrrecoverablyAbsent
              ? "Permanent close made this fulfillment-arm operation obsolete after branch-expiry and mempool-absence proof"
              : "Permanent close made this unsigned fulfillment-arm work obsolete",
        reconciliation: {
          salePermanentlyClosed: true,
          fulfillmentArmedAtFinalizedState: wasArmed,
          exactArmOperationApplied: exactApplied,
        },
        reconciledAt: ambiguous ? null : now,
        appliedAt: exactApplied ? now : null,
        updatedAt: now,
      }).where(and(
        eq(macaroniV35OperationAttempts.workItemId, input.work.id),
        eq(macaroniV35OperationAttempts.operationHash, input.work.operationHash)
      ));
    }
    await tx.update(macaroniV35WorkItems).set({
      state: exactApplied ? "applied" : ambiguous ? "manual_review" : "cancelled",
      appliedAt: exactApplied ? now : null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: ambiguous
        ? "Finalized contract is armed and permanently closed, but the exact arm operation still needs reconciliation"
        : null,
      errorClass: ambiguous ? "arm_close_reconciliation" : null,
      updatedAt: now,
    }).where(eq(macaroniV35WorkItems.id, input.work.id));
  });
}

async function armManagedFulfillment(work: MacaroniV35LeasedWork) {
  const drop = (await db.select().from(macaroniV35Drops)
    .where(eq(macaroniV35Drops.id, work.dropId)).limit(1))[0];
  if (!drop?.contract || !drop.operatorAddress) {
    throw new Error("Managed fulfillment arm work references an incomplete contract setup");
  }
  const environment = managedMacaroniV35WorkerEnvironment(drop.network);
  if (!environment.ready) throw new Error("Managed fulfillment cannot be armed until every worker dependency is ready");
  await verifyManagedMacaroniV35EntropyRecovery(drop);
  await recheckManagedMacaroniV35IndexedDuplicates(drop.id);
  const signer = new InMemorySigner(operatorSecret(drop.network));
  const signerAddress = await signer.publicKeyHash();
  if (signerAddress !== drop.operatorAddress) {
    throw new Error("Configured finalizer signer differs from the originated contract intent");
  }
  await withContract({
    network: drop.network,
    contract: drop.contract,
    signer,
    run: async (toolkit, contract, storage) => {
      const armMethod = contract.methodsObject.arm_fulfillment();
      const armTransfer = armMethod.toTransferParams();
      const armParameterDigest = hashMacaroniV35Payload(armTransfer.parameter?.value);
      const finalized = await finalizedManagedStorage({ toolkit, contract, network: drop.network });
      if (finalized.storage.sale_permanently_closed === true) {
        await terminalizeArmAfterPermanentClose({
          toolkit,
          drop,
          work,
          signer: signerAddress,
          parameterDigest: armParameterDigest,
          finalizedStorage: finalized.storage,
        });
        return;
      }
      const operator = await assertManagedOperatorChainReady({ toolkit, drop, signerAddress, phase: "arm" });
      if (String(storage.finalizer) !== signerAddress || storage.setup_finalized !== true
        || storage.sale_activated === true || storage.sale_permanently_closed === true) {
        throw new Error("Contract is not in the exact finalized, pre-activation state required for fulfillment arming");
      }
      const finalizedInventory = await assertFinalizedInventoryMatchesPrivateStaging({
        toolkit,
        contract,
        drop,
        allowAlreadyArmed: Boolean(work.operationHash),
      });
      const balance = Number((await toolkit.rpc.getBalance(drop.contract!)).toString());
      if (!Number.isSafeInteger(balance) || balance < drop.contractReserveRequiredMutez) {
        throw new Error("Contract-held fulfillment reserve is not fully funded on-chain");
      }
      if (storage.fulfillment_armed === true && !work.operationHash) {
        throw new Error("Fulfillment was armed outside this durable managed operation journal");
      }
      const transfer = armTransfer;
      const parameterDigest = hashMacaroniV35Payload(transfer.parameter?.value);
      let intent: MacaroniV35OperationIntent = {
        requestId: `macaroni-v35-worker:${drop.id}:arm-fulfillment`,
        intent: "arm_fulfillment",
        network: drop.network,
        signer: signerAddress,
        target: drop.contract,
        entrypoint: "arm_fulfillment",
        amountMutez: 0,
        expectedPostcondition: {
          fulfillmentArmed: true,
          setupFinalized: true,
          saleActivated: false,
          contractReserveRequiredMutez: drop.contractReserveRequiredMutez,
          exactTokenRows: finalizedInventory.tokenRows,
          exactPhysicalSupply: finalizedInventory.physicalSupply,
          privateInventoryDigest: finalizedInventory.inventoryDigest,
        },
        parameters: { michelineDigest: parameterDigest },
      };
      const digest = digestMacaroniV35OperationIntent(intent);
      const bound = await bindActiveWorkerAttempt(work, intent, digest);
      intent = bound.intent;
      let activeAttempt = bound.attempt;
      let operationHash = work.operationHash;
      let status = await appliedArmOperation({
        drop,
        work,
        signer: signerAddress,
        parameterDigest,
      });
      if (operationHash && status === "missing" && activeAttempt) {
        const replacementIntent = await openExpiredWorkerReplacement({
          toolkit,
          drop,
          work,
          attempt: activeAttempt,
          intent,
          digest,
          assertExactPostconditionStillPending: async () => {
            const exact = await assertFinalizedInventoryMatchesPrivateStaging({ toolkit, contract, drop });
            if (exact.storage.fulfillment_armed !== false
              || exact.storage.sale_activated !== false
              || exact.storage.sale_permanently_closed !== false) {
              throw new Error("Fulfillment-arm postcondition is no longer safely pending");
            }
            const finalizedBalance = Number((await toolkit.rpc.getBalance(drop.contract!, {
              block: String(exact.finalizedLevel),
            })).toString());
            if (!Number.isSafeInteger(finalizedBalance) || finalizedBalance < drop.contractReserveRequiredMutez) {
              throw new Error("Contract reserve changed before expired arm replacement");
            }
          },
        });
        if (replacementIntent) {
          intent = replacementIntent;
          operationHash = null;
          activeAttempt = null;
          status = "missing";
        }
      }
      if (!operationHash) {
        await createMacaroniV35WorkerReadyAttempt({ work, intent, digest });
        const preparedOperation = await prepareAndPreapplyManagedOperation({
          toolkit,
          signer,
          transfer,
          availableBalanceMutez: operator.balance,
        });
        const { signed } = preparedOperation;
        operationHash = encodeOpHash(signed.sbytes);
        await persistMacaroniV35PreparedSignedOperation({
          work,
          intent,
          digest,
          operationHash,
          encryptedSignedBytes: encryptMacaroniV35PrivatePayload({
            signedBytes: signed.sbytes,
            operationHash,
          }),
          signedBytesKeyVersion: managedMacaroniV35AssetKeyVersion(),
          signedOperationBranch: preparedOperation.signedOperationBranch,
          signedBranchLevel: preparedOperation.signedBranchLevel,
          signerCounter: preparedOperation.signerCounter,
        });
        work.operationHash = operationHash;
        status = "missing";
      }
      if (status === "pending") {
        throw new Error("Submitted fulfillment arm is awaiting final indexer reconciliation");
      }
      if (status === "missing") {
        const attempt = (await db.select().from(macaroniV35OperationAttempts).where(and(
          eq(macaroniV35OperationAttempts.workItemId, work.id),
          eq(macaroniV35OperationAttempts.operationHash, operationHash)
        )).limit(1))[0];
        if (!attempt?.encryptedSignedBytes) {
          throw new Error("Prepared fulfillment arm is missing its encrypted signed bytes");
        }
        const signed = decryptMacaroniV35PrivatePayload<{ signedBytes: string; operationHash: string }>(
          attempt.encryptedSignedBytes
        );
        if (signed.operationHash !== operationHash || encodeOpHash(signed.signedBytes) !== operationHash) {
          throw new Error("Durable fulfillment-arm bytes do not match their immutable operation hash");
        }
        const injectedHash = await toolkit.rpc.injectOperation(signed.signedBytes);
        if (injectedHash !== operationHash) throw new Error("RPC returned a different fulfillment-arm operation hash");
        await markMacaroniV35SignedOperationInjected({
          workId: work.id,
          requestId: intent.requestId,
          operationHash,
        });
        status = await appliedArmOperation({ drop, work, signer: signerAddress, parameterDigest });
      }
      if (status === "pending") throw new Error("Submitted fulfillment arm is awaiting indexer reconciliation");
      if (status !== "applied") throw new Error("Submitted fulfillment arm failed immutable reconciliation");
      const now = new Date();
      const expectedPostcondition = intent.expectedPostcondition;
      const setupIntentDigest = hashMacaroniV35Payload({
        stepKey: "fulfillment_armed",
        expectedPostcondition,
        operationHash,
      });
      await db.transaction(async (tx) => {
        await tx.update(macaroniV35WorkItems).set({
          state: "applied",
          appliedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          updatedAt: now,
        }).where(eq(macaroniV35WorkItems.id, work.id));
        await tx.update(macaroniV35OperationAttempts).set({
          state: "applied",
          reconciledAt: now,
          appliedAt: now,
          reconciliation: { exactFinalizerArmAndStorage: true },
          error: null,
          updatedAt: now,
        }).where(and(
          eq(macaroniV35OperationAttempts.workItemId, work.id),
          eq(macaroniV35OperationAttempts.operationHash, operationHash!)
        ));
        await tx.insert(macaroniV35SetupSteps).values({
          dropId: drop.id,
          stepKey: "fulfillment_armed",
          status: "complete",
          intentDigest: setupIntentDigest,
          expectedPostcondition,
          parameters: { michelineDigest: parameterDigest },
          network: drop.network,
          signer: signerAddress,
          target: drop.contract,
          entrypoint: "arm_fulfillment",
          amountMutez: 0,
          operationHash,
          details: { automatedManagedFinalizer: true, workItemId: work.id },
          completedAt: now,
        }).onConflictDoNothing({
          target: [macaroniV35SetupSteps.dropId, macaroniV35SetupSteps.stepKey],
        });
        await tx.update(macaroniV35Drops).set({
          serviceReady: true,
          status: "ready",
          contractReserveObservedMutez: balance,
          publicStatus: {
            state: "ready",
            message: "Automatic fulfillment is armed. The creator can now sign the final sale activation.",
            fulfilledClaims: 0,
            pendingClaims: 0,
          },
          updatedAt: now,
        }).where(eq(macaroniV35Drops.id, drop.id));
      });
    },
  });
}

async function simulateAllocation(work: MacaroniV35LeasedWork) {
  const { drop, claim } = await workContext(work);
  const entropy = recoverManagedMacaroniV35Entropy(drop);
  try {
    const preimage = entropy.preimages[claim.claimPosition];
    if (!preimage) throw new Error("Entropy chain has no preimage for the FIFO claim position");
    const result = await withContract({
      network: drop.network,
      contract: drop.contract!,
      run: async (toolkit, _contract, storage) => {
        const alreadySettled = await storage.claim_token.get(claim.claimPosition);
        const nextClaim = safeNat(storage.next_claim_to_settle, "next FIFO claim");
        if (alreadySettled == null && nextClaim !== claim.claimPosition) {
          throw new Error("Claim is not the contract's next forced FIFO settlement");
        }
        const digest = macaroniV35AllocationDigest({
          buyer: claim.buyer,
          chainId: await toolkit.rpc.getChainId(),
          claimId: claim.claimPosition,
          contractAddress: drop.contract!,
          creator: String(storage.creator),
          entropyPreimage: preimage,
          purchaseLevel: claim.purchaseLevel,
          recipient: claim.recipient,
          unit: claim.unit,
        });
        const remaining = safeNat(storage.supply, "physical supply") - safeNat(storage.claims_settled, "settled claims");
        const tokenId = alreadySettled == null
          ? safeNat(await storage.slots.get(macaroniV35DrawIndex(digest, remaining)), "selected token id")
          : safeNat(alreadySettled, "settled token id");
        return { digest, tokenId };
      },
    });
    const metadata = (await db.select().from(macaroniV35PrivateAssets).where(and(
      eq(macaroniV35PrivateAssets.dropId, drop.id),
      eq(macaroniV35PrivateAssets.tokenSlot, result.tokenId),
      eq(macaroniV35PrivateAssets.kind, "metadata")
    )).limit(1))[0];
    if (!metadata) throw new Error("Forced allocation references no private metadata row");
    if (claim.allocatedTokenSlot != null && (claim.allocatedTokenSlot !== result.tokenId
      || claim.allocationDigest !== result.digest)) {
      throw new Error("Forced allocation differs from the durable prior simulation");
    }
    await db.update(macaroniV35ClaimFulfillments).set({
      allocatedTokenSlot: result.tokenId,
      allocationDigest: result.digest,
      metadataCommitment: metadata.commitment,
      state: "allocation_simulated",
      updatedAt: new Date(),
    }).where(eq(macaroniV35ClaimFulfillments.id, claim.id));
    await markWorkCompleted(work);
  } finally {
    entropy.seed.fill(0);
  }
}

async function settlementAssets(dropId: number, tokenId: number) {
  const assets = await db.select().from(macaroniV35PrivateAssets).where(and(
    eq(macaroniV35PrivateAssets.dropId, dropId),
    eq(macaroniV35PrivateAssets.tokenSlot, tokenId)
  ));
  const artifact = assets.find((asset) => asset.kind === "artifact");
  const display = assets.find((asset) => asset.kind === "display") ?? null;
  const thumbnail = assets.find((asset) => asset.kind === "thumbnail") ?? null;
  const metadata = assets.find((asset) => asset.kind === "metadata");
  if (!artifact?.encryptedCidPayload || !metadata?.encryptedCidPayload) {
    throw new Error("Forced token row is missing its encrypted artifact or metadata commitment");
  }
  return { artifact, display, thumbnail, metadata };
}

type MetadataPrivate = { cid: string; metadataUri: string; metadataNonce: string; carSha256: string };

async function appliedSettlementOperation(input: {
  drop: V35Drop;
  claim: V35Claim;
  work: MacaroniV35LeasedWork;
  signer: string;
  parameterDigest: string;
}) {
  if (!input.work.operationHash) return "missing" as const;
  const rows = await tzktJson<Array<{
    level?: number;
    status?: string;
    sender?: { address?: string };
    target?: { address?: string };
    parameter?: { entrypoint?: string; value?: unknown };
  }>>(input.drop.network, `/operations/transactions/${encodeURIComponent(input.work.operationHash)}?micheline=2`);
  if (!rows.length) return "missing" as const;
  const finalizedLevel = (await indexedHeadLevel(input.drop.network)) - (macaroniV35IndexerConfirmations() ?? 1);
  const exact = rows.find((row) => row.status === "applied"
    && row.sender?.address === input.signer
    && row.target?.address === input.drop.contract
    && row.parameter?.entrypoint === "settle_claims_v35"
    && hashMacaroniV35Payload(row.parameter?.value) === input.parameterDigest);
  if (!exact) return "failed" as const;
  if (!Number.isSafeInteger(exact.level) || Number(exact.level) > finalizedLevel) return "pending" as const;
  const settledToken = await withContract({
    network: input.drop.network,
    contract: input.drop.contract!,
    run: async (toolkit, contract) => {
      const { storage } = await finalizedManagedStorage({
        toolkit,
        contract,
        network: input.drop.network,
      });
      return storage.claim_token.get(input.claim.claimPosition);
    },
  });
  return safeNat(settledToken, "settled token") === input.claim.allocatedTokenSlot ? "applied" as const : "failed" as const;
}

async function settleClaim(work: MacaroniV35LeasedWork) {
  const { drop, claim } = await workContext(work);
  if (claim.allocatedTokenSlot == null || !claim.allocationDigest || !claim.metadataCommitment) {
    throw new Error("Settlement cannot choose a token outside the prior forced FIFO simulation");
  }
  if (drop.fulfillmentTrigger === "rolling_delay" && drop.claimIntervalSeconds > 0 && claim.claimPosition > 0) {
    const previous = (await db.select({ settledAt: macaroniV35ClaimFulfillments.settledAt })
      .from(macaroniV35ClaimFulfillments).where(and(
        eq(macaroniV35ClaimFulfillments.dropId, drop.id),
        eq(macaroniV35ClaimFulfillments.claimPosition, claim.claimPosition - 1)
      )).limit(1))[0];
    if (!previous?.settledAt) throw new Error("FIFO interval pacing is missing the prior settled claim");
    const due = new Date(previous.settledAt.getTime() + drop.claimIntervalSeconds * 1_000);
    if (due.getTime() > Date.now()) {
      await deferWorkUntil(work, due);
      return;
    }
  }
  const signer = new InMemorySigner(operatorSecret(drop.network));
  const signerAddress = await signer.publicKeyHash();
  if (signerAddress !== drop.operatorAddress) throw new Error("Configured finalizer signer differs from the originated contract intent");
  const { metadata } = await settlementAssets(drop.id, claim.allocatedTokenSlot);
  const privateMetadata = decryptMacaroniV35PrivatePayload<MetadataPrivate>(metadata.encryptedCidPayload!);
  if (macaroniV35MetadataCommitment({
    tokenId: claim.allocatedTokenSlot,
    metadataUri: privateMetadata.metadataUri,
    metadataNonce: privateMetadata.metadataNonce,
  }) !== claim.metadataCommitment) {
    throw new Error("Private metadata reveal does not match the immutable on-chain commitment");
  }
  const entropy = recoverManagedMacaroniV35Entropy(drop);
  try {
    const settlementItem = {
      claim_id: claim.claimPosition,
      entropy_preimage: entropy.preimages[claim.claimPosition],
      metadata_uri: Buffer.from(privateMetadata.metadataUri, "utf8").toString("hex"),
      metadata_nonce: privateMetadata.metadataNonce,
    };
    await withContract({
      network: drop.network,
      contract: drop.contract!,
      signer,
      run: async (toolkit, contract) => {
        const operator = await assertManagedOperatorChainReady({ toolkit, drop, signerAddress, phase: "settlement" });
        const method = contract.methodsObject.settle_claims_v35([settlementItem]);
        const transfer = method.toTransferParams();
        const parameterValue = transfer.parameter?.value;
        const parameterDigest = hashMacaroniV35Payload(parameterValue);
        let intent: MacaroniV35OperationIntent = {
          requestId: `macaroni-v35-worker:${drop.id}:${claim.claimId}:settle`,
          intent: "settle_claims_v35",
          network: drop.network,
          signer: signerAddress,
          target: drop.contract,
          entrypoint: "settle_claims_v35",
          amountMutez: 0,
          expectedPostcondition: {
            claimId: claim.claimId,
            forcedTokenId: claim.allocatedTokenSlot,
            allocationDigest: claim.allocationDigest,
          },
          // Secrets and plaintext CIDs never enter the durable journal. The
          // exact public Micheline is bound by digest and checked on reconcile.
          parameters: { michelineDigest: parameterDigest },
        };
        const digest = digestMacaroniV35OperationIntent(intent);
        const bound = await bindActiveWorkerAttempt(work, intent, digest);
        intent = bound.intent;
        let activeAttempt = bound.attempt;
        let operationHash = work.operationHash;
        let status = await appliedSettlementOperation({
          drop,
          claim,
          work,
          signer: signerAddress,
          parameterDigest,
        });
        if (operationHash && status === "missing" && activeAttempt) {
          const replacementIntent = await openExpiredWorkerReplacement({
            toolkit,
            drop,
            work,
            attempt: activeAttempt,
            intent,
            digest,
            assertExactPostconditionStillPending: async () => {
              const { storage } = await finalizedManagedStorage({
                toolkit,
                contract,
                network: drop.network,
              });
              const [settledToken, allocationDigest, onchainCommitment] = await Promise.all([
                storage.claim_token.get(claim.claimPosition),
                storage.claim_allocation_digest.get(claim.claimPosition),
                storage.token_commitments.get(claim.allocatedTokenSlot),
              ]);
              if (settledToken != null || allocationDigest != null
                || safeNat(storage.next_claim_to_settle, "finalized FIFO claim cursor") !== claim.claimPosition
                || safeNat(storage.claims_settled, "finalized settled claims") !== claim.claimPosition
                || normalizedHex(onchainCommitment) !== normalizedHex(claim.metadataCommitment)) {
                throw new Error("Claim/FIFO/commitment state changed before expired settlement replacement");
              }
            },
          });
          if (replacementIntent) {
            intent = replacementIntent;
            operationHash = null;
            activeAttempt = null;
            status = "missing";
          }
        }
        if (!operationHash) {
          await createMacaroniV35WorkerReadyAttempt({ work, intent, digest });
          const preparedOperation = await prepareAndPreapplyManagedOperation({
            toolkit,
            signer,
            transfer,
            availableBalanceMutez: operator.balance,
            maximumReimbursedCostMutez: drop.fulfillmentSubsidyMutez,
          });
          const { signed } = preparedOperation;
          operationHash = encodeOpHash(signed.sbytes);
          await persistMacaroniV35PreparedSignedOperation({
            work,
            intent,
            digest,
            operationHash,
            encryptedSignedBytes: encryptMacaroniV35PrivatePayload({
              signedBytes: signed.sbytes,
              operationHash,
            }),
            signedBytesKeyVersion: managedMacaroniV35AssetKeyVersion(),
            signedOperationBranch: preparedOperation.signedOperationBranch,
            signedBranchLevel: preparedOperation.signedBranchLevel,
            signerCounter: preparedOperation.signerCounter,
          });
          work.operationHash = operationHash;
          status = "missing";
        }
        if (status === "pending") {
          throw new Error("Submitted settlement is awaiting final indexer reconciliation");
        }
        if (status === "missing") {
          const attempt = (await db.select().from(macaroniV35OperationAttempts).where(and(
            eq(macaroniV35OperationAttempts.workItemId, work.id),
            eq(macaroniV35OperationAttempts.operationHash, operationHash)
          )).limit(1))[0];
          if (!attempt?.encryptedSignedBytes) {
            throw new Error("Prepared settlement is missing its encrypted signed bytes; refusing to forge a replacement");
          }
          const signed = decryptMacaroniV35PrivatePayload<{
            signedBytes: string;
            operationHash: string;
          }>(attempt.encryptedSignedBytes);
          if (signed.operationHash !== operationHash || encodeOpHash(signed.signedBytes) !== operationHash) {
            throw new Error("Durable signed settlement bytes do not match their immutable operation hash");
          }
          const injectedHash = await toolkit.rpc.injectOperation(signed.signedBytes);
          if (injectedHash !== operationHash) throw new Error("RPC returned a different operation hash for durable signed bytes");
          await markMacaroniV35SignedOperationInjected({
            workId: work.id,
            requestId: intent.requestId,
            operationHash,
          });
          await db.update(macaroniV35ClaimFulfillments).set({
            state: "settling",
            settlementOperationHash: operationHash,
            updatedAt: new Date(),
          }).where(eq(macaroniV35ClaimFulfillments.id, claim.id));
          status = await appliedSettlementOperation({
            drop,
            claim,
            work,
            signer: signerAddress,
            parameterDigest,
          });
        }
      if (status === "pending") throw new Error("Submitted settlement is awaiting indexer reconciliation");
      if (status !== "applied") throw new Error("Submitted settlement failed immutable operation or claim-token reconciliation");
      const fundingState = await withContract({
        network: drop.network,
        contract: drop.contract!,
        run: async (freshToolkit, _freshContract, freshStorage) => ({
          balance: Number((await freshToolkit.rpc.getBalance(drop.contract!)).toString()),
          finalSweepComplete: freshStorage.final_sweep_complete === true,
          finalSweepAmount: safeNat(freshStorage.final_sweep_amount, "final sweep amount"),
        }),
      });
      const now = new Date();
      await db.transaction(async (tx) => {
          await tx.update(macaroniV35WorkItems).set({
            state: "applied",
            appliedAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
            updatedAt: now,
          }).where(eq(macaroniV35WorkItems.id, work.id));
          await tx.update(macaroniV35OperationAttempts).set({
            state: "applied",
            reconciledAt: now,
            appliedAt: now,
            reconciliation: { exactOperationAndClaimToken: true },
            error: null,
            updatedAt: now,
          }).where(and(
            eq(macaroniV35OperationAttempts.workItemId, work.id),
            eq(macaroniV35OperationAttempts.operationHash, operationHash!)
          ));
          await tx.update(macaroniV35ClaimFulfillments).set({
            state: "artwork_secured",
            settlementOperationHash: operationHash,
            settledAt: now,
            updatedAt: now,
          }).where(eq(macaroniV35ClaimFulfillments.id, claim.id));
          await tx.insert(macaroniV35FundingLedger).values({
            dropId: drop.id,
            direction: "debit",
            account: "contract_reserve",
            kind: "finalizer_reimbursement",
            amountMutez: drop.fulfillmentSubsidyMutez,
            balanceAfterMutez: Number.isSafeInteger(fundingState.balance) && fundingState.balance >= 0
              ? fundingState.balance
              : null,
            semanticEventKey: `finalizer-reimbursement-claim:${claim.claimId}`,
            operationHash,
            sourceRef: `claim:${claim.claimId}`,
            details: { paidOnlyAfterSuccessfulSettlement: true },
            occurredAt: now,
          }).onConflictDoNothing({
            target: [macaroniV35FundingLedger.dropId, macaroniV35FundingLedger.semanticEventKey],
          });
          if (fundingState.finalSweepComplete) {
            await tx.insert(macaroniV35FundingLedger).values({
              dropId: drop.id,
              direction: "debit",
              account: "contract_reserve",
              kind: "automatic_final_sweep",
              amountMutez: fundingState.finalSweepAmount,
              balanceAfterMutez: 0,
              semanticEventKey: "automatic-final-sweep",
              operationHash,
              sourceRef: `claim:${claim.claimId}`,
              details: { afterFinalSuccessfulSettlement: true },
              occurredAt: now,
            }).onConflictDoNothing({
              target: [macaroniV35FundingLedger.dropId, macaroniV35FundingLedger.semanticEventKey],
            });
            await tx.update(macaroniV35Drops).set({
              finalSweepOperationHash: operationHash,
              updatedAt: now,
            }).where(eq(macaroniV35Drops.id, drop.id));
          }
        });
      },
    });
  } finally {
    entropy.seed.fill(0);
  }
}

async function publishClaimAsset(work: MacaroniV35LeasedWork, kind: "artifact" | "metadata") {
  const { drop, claim } = await workContext(work);
  if (claim.allocatedTokenSlot == null || !claim.settlementOperationHash || !claim.settledAt) {
    throw new Error("Private CAR publishing is forbidden until the final NFT settlement is applied");
  }
  const assets = await settlementAssets(drop.id, claim.allocatedTokenSlot);
  const selected = kind === "metadata"
    ? [assets.metadata]
    : [assets.artifact, assets.display, assets.thumbnail].filter(Boolean) as Array<typeof assets.artifact>;
  const workspace = await mkdtemp(path.join(tmpdir(), `macaroni-v35-publish-${kind}-`));
  try {
    const published: Array<{ id: number; cid: string }> = [];
    for (const asset of selected) {
      if (!asset.encryptedCidPayload) throw new Error(`Forced token ${asset.kind} is missing its encrypted CID mapping`);
      const privateData = decryptMacaroniV35PrivatePayload<{ cid: string; carSha256: string }>(asset.encryptedCidPayload);
      const carPath = path.join(workspace, `${asset.kind}.car`);
      const materialized = await materializeManagedMacaroniV35Car({
        encryptedStorageRef: asset.encryptedStorageRef,
        encryptedCidPayload: asset.encryptedCidPayload,
        destinationPath: carPath,
      });
      if (materialized.cid !== privateData.cid) throw new Error("Recovered CAR root changed after commitment");
      await publishManagedMacaroniV35Car({ carPath, expectedCid: privateData.cid });
      published.push({ id: asset.id, cid: privateData.cid });
    }
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const item of published) {
        await tx.update(macaroniV35PrivateAssets).set({
          publishedCid: item.cid,
          status: "published",
          publishedAt: now,
          updatedAt: now,
        }).where(eq(macaroniV35PrivateAssets.id, item.id));
      }
      await tx.update(macaroniV35ClaimFulfillments).set({
        state: "publishing_ipfs",
        publishedAt: kind === "metadata" ? now : claim.publishedAt,
        updatedAt: now,
      }).where(eq(macaroniV35ClaimFulfillments.id, claim.id));
      await tx.update(macaroniV35WorkItems).set({
        state: "completed",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: now,
      }).where(eq(macaroniV35WorkItems.id, work.id));
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function verifyClaimReady(work: MacaroniV35LeasedWork) {
  const { drop, claim } = await workContext(work);
  if (claim.allocatedTokenSlot == null || !claim.settlementOperationHash) {
    throw new Error("Cannot publish readiness for an unsettled claim");
  }
  const { artifact, display, thumbnail, metadata } = await settlementAssets(drop.id, claim.allocatedTokenSlot);
  if (!artifact.publishedCid || !metadata.publishedCid) throw new Error("Committed CAR publication is incomplete");
  const publishedAssets = [artifact, display, thumbnail, metadata].filter(Boolean) as Array<typeof artifact>;
  if (publishedAssets.some((asset) => !asset.publishedCid)) {
    throw new Error("A metadata-bound artifact, display, or thumbnail CAR has not been published");
  }
  const [availability, onchainToken] = await Promise.all([
    Promise.all(publishedAssets.map((asset) => verifyPublishedMacaroniV35Cid(asset.publishedCid!))),
    withContract({
      network: drop.network,
      contract: drop.contract!,
      run: async (_toolkit, _contract, storage) => storage.claim_token.get(claim.claimPosition),
    }),
  ]);
  if (availability.some((ready) => !ready)
    || safeNat(onchainToken, "ready claim token") !== claim.allocatedTokenSlot) {
    throw new Error("NFT readiness verification has not observed every committed postcondition");
  }
  const lifecycle = await contractReleaseState(drop);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(macaroniV35ClaimFulfillments).set({ state: "nft_ready", readyAt: now, updatedAt: now })
      .where(eq(macaroniV35ClaimFulfillments.id, claim.id));
    await tx.update(macaroniV35WorkItems).set({
      state: "completed",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: now,
    }).where(eq(macaroniV35WorkItems.id, work.id));
    const fulfilled = (await tx.select({ id: macaroniV35ClaimFulfillments.id })
      .from(macaroniV35ClaimFulfillments).where(and(
        eq(macaroniV35ClaimFulfillments.dropId, drop.id),
        eq(macaroniV35ClaimFulfillments.state, "nft_ready")
      ))).length + (claim.state === "nft_ready" ? 0 : 1);
    const completed = fulfilled === lifecycle.claimsCreated
      && lifecycle.claimsSettled === lifecycle.claimsCreated
      && lifecycle.finalSweepComplete
      && (lifecycle.soldOut || lifecycle.permanentlyClosed);
    const continuingState = lifecycle.permanentlyClosed ? "closed" : "active";
    await tx.update(macaroniV35Drops).set({
      status: completed ? "completed" : drop.status,
      finalFulfillmentAt: completed ? now : drop.finalFulfillmentAt,
      finalSweepOperationHash: completed ? claim.settlementOperationHash : drop.finalSweepOperationHash,
      completedAt: completed ? now : drop.completedAt,
      publicStatus: {
        state: completed ? "completed" : continuingState,
        message: completed
          ? "Every purchased NFT is ready and the remaining contract balance was swept automatically."
          : lifecycle.permanentlyClosed
            ? "Sale permanently closed. Existing purchases remain secured and automatic fulfillment is continuing."
            : "Purchases are secured and automatic fulfillment is running.",
        fulfilledClaims: fulfilled,
        pendingClaims: Math.max(0, drop.indexedPurchaseClaims - fulfilled),
      },
      updatedAt: now,
    }).where(eq(macaroniV35Drops.id, drop.id));
  });
}

async function processManagedWork(work: MacaroniV35LeasedWork) {
  try {
    switch (work.workType) {
      case "scan_claims": {
        const drop = (await db.select().from(macaroniV35Drops).where(eq(macaroniV35Drops.id, work.dropId)).limit(1))[0];
        if (!drop) throw new Error("Scan work references a missing drop");
        await scanManagedMacaroniV35Drop(drop);
        await markWorkCompleted(work);
        return;
      }
      case "arm_fulfillment": await armManagedFulfillment(work); return;
      case "simulate_allocation": await simulateAllocation(work); return;
      case "settle_claim": await settleClaim(work); return;
      case "publish_artifact_car": await publishClaimAsset(work, "artifact"); return;
      case "publish_metadata_car": await publishClaimAsset(work, "metadata"); return;
      case "verify_nft_ready": await verifyClaimReady(work); return;
      case "sweep_funds":
        throw new Error("V3.5 final sweep is atomic in the final successful settlement and has no standalone worker call");
    }
  } catch (error) {
    const invariant = /differs|mismatch|forbidden|missing|outside|not bound|does not match|failed immutable/i.test(
      error instanceof Error ? error.message : String(error)
    );
    if (invariant) await manualReview(work, error);
    else await retryWork(work, error);
  }
}

export async function refreshManagedMacaroniV35DropReadiness(dropId: number) {
  const drop = (await db.select().from(macaroniV35Drops).where(eq(macaroniV35Drops.id, dropId)).limit(1))[0];
  if (!drop) return null;
  const environment = managedMacaroniV35WorkerEnvironment(drop.network);
  let entropyReady = false;
  if (environment.ready) {
    try {
      await verifyManagedMacaroniV35EntropyRecovery(drop);
      entropyReady = true;
    } catch {
      entropyReady = false;
    }
  }
  const ready = environment.ready && entropyReady && Boolean(drop.contract && drop.abiValidatedAt && drop.operatorAddress);
  const lifecycleState = drop.status === "closed" ? "closed" : drop.status === "active" ? "active" : "ready";
  const [updated] = await db.update(macaroniV35Drops).set({
    serviceReady: ready,
    publicStatus: {
      ...drop.publicStatus,
      state: ready ? lifecycleState : "blocked",
      message: ready
        ? "Automatic fulfillment is ready."
        : "Automatic fulfillment remains blocked until managed runtime and independent entropy recovery checks pass.",
    },
    updatedAt: new Date(),
  }).where(eq(macaroniV35Drops.id, drop.id)).returning();
  return updated;
}

export async function runManagedMacaroniV35Worker() {
  const leaseDurationMs = macaroniV35ManagedLeaseMs();
  if (!leaseDurationMs || !macaroniV35ManagedWorkerPollIntervalMs()) {
    return { itemsIn: 0, itemsOut: 0, cursorAfter: { configured: false } };
  }
  const drops = await db.select().from(macaroniV35Drops).where(and(
    eq(macaroniV35Drops.provider, "wtfos_managed"),
    inArray(macaroniV35Drops.status, ["active", "closed"]),
    eq(macaroniV35Drops.serviceReady, true)
  ));
  let scanned = 0;
  for (const drop of drops) {
    const result = await scanManagedMacaroniV35Drop(drop);
    scanned += result.scanned;
  }
  const leaseOwner = `macaroni-v35:${process.pid}:${randomUUID()}`;
  let processed = 0;
  while (true) {
    const work = await leaseNextMacaroniV35Work({ leaseOwner, leaseDurationMs });
    if (!work) break;
    await processManagedWork(work);
    processed += 1;
  }
  return {
    itemsIn: scanned + processed,
    itemsOut: processed,
    cursorAfter: { configured: true, drops: drops.length, claimsScanned: scanned },
  };
}
