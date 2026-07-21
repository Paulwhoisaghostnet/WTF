#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { validateOperation, ValidationResult } from "@taquito/utils";

import {
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveBridgeRequest,
} from "./pasta-ui-live-bridge-kit";
import {
  assertShadownet,
  buildToolkit,
  deterministicJsonBytes,
  loadSignerSet,
  normalizeBase,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
} from "./shadownet-proof-kit";

const EXECUTE_FLAG = "PASTA_SHADOWNET_RAVIOLI_RECOVERY_EXECUTE";
const RECONCILE_FLAG = "PASTA_SHADOWNET_RAVIOLI_RECOVERY_RECONCILE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const EXPECTED_RUN_ID = "pasta-alpha-proof-20260718a";
const EXPECTED_GNOCCHI_CONTRACT = "KT1NJJ55w4TLkRVfuweeRfvT9jvWFf4viaup";
const EXPECTED_ADMINISTRATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const RECOVERY_DIRECTORY = "ravioli-dependency-recovery";
const RECOVERY_OPERATION_RESERVE_MUTEZ = 2_000_000;
const RECOVERY_FEE_HEADROOM_MUTEZ = 100;

type JsonObject = Record<string, any>;

export type RavioliRecoveryCall = {
  contractAddress: string;
  entrypoint: "mint";
  payload: { to_: string; token_id: number; amount: number };
};

export type RavioliRecoveryState = {
  level: number;
  administrator: string;
  balances: { "0": number; "1": number };
  totalSupplies: { "0": number; "1": number };
};

export type AcceptedGnocchiProof = {
  runId: string;
  contractAddress: string;
  administrator: string;
  originationHash: string;
  historicalSnapshotPath: string;
  historicalSnapshotSha256: string;
};

export type AcceptedEvidenceHashes = {
  manifestSha256: string;
  receiptSha256: string;
  historicalSnapshotSha256: string;
};

export type RavioliRecoveryOperation = {
  hash: string;
  counter: number;
  level: number;
  timestamp: string;
  explorerUrl: string;
  call: RavioliRecoveryCall;
};

export type RavioliRecoverySendOptions = {
  amount: 0;
  mutez: true;
  fee: number;
  gasLimit: number;
  storageLimit: number;
};

export type RavioliRecoveryEstimate = {
  call: RavioliRecoveryCall;
  gasLimit: number;
  storageLimit: number;
  suggestedFeeMutez: number;
  minimalFeeMutez: number;
  burnFeeMutez: number;
  sendOptions: RavioliRecoverySendOptions;
};

type LoadedAcceptedEvidence = {
  accepted: AcceptedGnocchiProof;
  hashes: AcceptedEvidenceHashes;
  paths: { manifest: string; receipt: string; historicalSnapshot: string };
};

export type RavioliRecoveryLaneSnapshot = {
  counter: number;
  balanceMutez: number;
  activeOperationCount: 0;
};

export type RavioliRecoveryReconciliationIo = {
  loadAcceptedEvidence: (runRoot: string) => Promise<LoadedAcceptedEvidence>;
  readIntent: (recoveryRoot: string) => Promise<JsonObject>;
  readProgress: (recoveryRoot: string) => Promise<JsonObject | undefined>;
  readOperationRows: (beforeLevel: number) => Promise<JsonObject[]>;
  readState: () => Promise<RavioliRecoveryState>;
  readLane: (rpcUrl: string) => Promise<RavioliRecoveryLaneSnapshot>;
  rehashAcceptedEvidence: (paths: LoadedAcceptedEvidence["paths"]) => Promise<AcceptedEvidenceHashes>;
  writeFinalReceipt: (recoveryRoot: string, receipt: JsonObject) => Promise<string>;
  now: () => string;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function asSafeInteger(value: unknown, label: string): number {
  const number = Number(value);
  assert.ok(Number.isSafeInteger(number) && number >= 0, `${label} must be a non-negative safe integer`);
  return number;
}

function exactNetwork(value: JsonObject, label: string): void {
  if (typeof value.network === "string") {
    assert.equal(value.network, "shadownet", `${label} network must be Shadownet`);
    assert.equal(value.chainId, SHADOWNET_CHAIN_ID, `${label} chain id drift`);
    return;
  }
  assert.equal(value.network?.name, "shadownet", `${label} network must be Shadownet`);
  assert.equal(value.network?.chainId, SHADOWNET_CHAIN_ID, `${label} chain id drift`);
}

export function assertRavioliRecoveryExecutionAllowed(
  environment: Record<string, string | undefined>,
): string {
  assert.equal(
    environment[EXECUTE_FLAG],
    "1",
    `explicit Ravioli dependency-recovery execute flag ${EXECUTE_FLAG}=1 is required`,
  );
  assert.equal(
    (environment.TEZOS_NETWORK || "shadownet").toLowerCase(),
    "shadownet",
    "Ravioli dependency recovery only permits Shadownet",
  );
  const runRoot = environment[OUTPUT_ENV]?.trim();
  assert.ok(runRoot, `${OUTPUT_ENV} must point to the exact accepted proof run`);
  assert.equal(path.basename(path.resolve(runRoot)), EXPECTED_RUN_ID, "Ravioli recovery requires the exact accepted proof run");
  for (const forbidden of [
    "PASTA_SHADOWNET_RAVIOLI_RECOVERY_CONTRACT",
    "PASTA_SHADOWNET_RAVIOLI_RECOVERY_ADMIN",
    "PASTA_SHADOWNET_RAVIOLI_RECOVERY_RESUME",
  ]) {
    assert.ok(!environment[forbidden]?.trim(), `Ravioli recovery forbids override ${forbidden}`);
  }
  return runRoot;
}

export function assertRavioliRecoveryReconciliationAllowed(
  environment: Record<string, string | undefined>,
): string {
  assert.equal(
    environment[RECONCILE_FLAG],
    "1",
    `explicit read-only Ravioli recovery reconciliation flag ${RECONCILE_FLAG}=1 is required`,
  );
  assert.ok(!environment[EXECUTE_FLAG]?.trim(), "read-only Ravioli recovery reconciliation forbids the execution flag");
  assert.equal(
    (environment.TEZOS_NETWORK || "shadownet").toLowerCase(),
    "shadownet",
    "Ravioli recovery reconciliation only permits Shadownet",
  );
  const runRoot = environment[OUTPUT_ENV]?.trim();
  assert.ok(runRoot, `${OUTPUT_ENV} must point to the exact accepted proof run`);
  assert.equal(
    path.basename(path.resolve(runRoot)),
    EXPECTED_RUN_ID,
    "Ravioli recovery reconciliation requires the exact accepted proof run",
  );
  for (const forbidden of [
    "PASTA_SHADOWNET_RAVIOLI_RECOVERY_CONTRACT",
    "PASTA_SHADOWNET_RAVIOLI_RECOVERY_ADMIN",
    "PASTA_SHADOWNET_RAVIOLI_RECOVERY_RESUME",
  ]) {
    assert.ok(!environment[forbidden]?.trim(), `Ravioli recovery reconciliation forbids override ${forbidden}`);
  }
  return runRoot;
}

export function validateAcceptedGnocchiProof(
  manifest: JsonObject,
  receipt: JsonObject,
): AcceptedGnocchiProof {
  assert.equal(manifest.schema, "pastaprotocol-app-proof@1");
  assert.equal(manifest.app, "gnocchi");
  assert.equal(manifest.role, "token-publisher");
  assert.equal(manifest.runId, EXPECTED_RUN_ID, "Gnocchi manifest is not the exact accepted proof run");
  exactNetwork(manifest, "Gnocchi manifest");
  assert.ok(Array.isArray(manifest.contracts) && manifest.contracts.length === 1);
  assert.equal(manifest.contracts[0]?.address, EXPECTED_GNOCCHI_CONTRACT, "Gnocchi manifest does not name the exact accepted Gnocchi contract");

  assert.equal(receipt.schema, "pastaprotocol-gnocchi-ui-live-run@1");
  assert.equal(receipt.classification, "UI-LIVE");
  exactNetwork(receipt, "Gnocchi receipt");
  assert.equal(receipt.actors?.creator, EXPECTED_ADMINISTRATOR, "Gnocchi receipt does not name the exact accepted creator");
  assert.equal(receipt.contract?.address, EXPECTED_GNOCCHI_CONTRACT, "Gnocchi receipt contract drift");

  const originations = (manifest.operations || []).filter((operation: JsonObject) => operation.kind === "origination");
  assert.equal(originations.length, 1, "accepted Gnocchi manifest must contain one origination");
  const origination = originations[0];
  assert.equal(origination.contractAddress, EXPECTED_GNOCCHI_CONTRACT);
  assert.equal(origination.status, "applied");
  assert.equal(validateOperation(origination.hash), ValidationResult.VALID);
  const receipts = Array.isArray(receipt.bridgeReceipts?.creator)
    ? receipt.bridgeReceipts.creator
    : Array.isArray(receipt.receipts)
      ? receipt.receipts
      : [];
  const receiptOriginations = receipts.filter((entry: JsonObject) => entry.action === "originate");
  assert.equal(receiptOriginations.length, 1, "accepted Gnocchi receipt must contain one creator origination");
  assert.equal(receiptOriginations[0].operationHash, origination.hash, "Gnocchi origination hash differs between manifest and receipt");
  assert.equal(receiptOriginations[0].contractAddress, EXPECTED_GNOCCHI_CONTRACT);
  assert.equal(receiptOriginations[0].signerAddress, EXPECTED_ADMINISTRATOR);
  assert.equal(receiptOriginations[0].chainId, SHADOWNET_CHAIN_ID);

  const historical = (manifest.artifacts || []).filter((artifact: JsonObject) => artifact.kind === "historical-indexer-snapshot");
  assert.equal(historical.length, 1, "accepted Gnocchi manifest must bind one historical snapshot");
  assert.match(String(historical[0].sha256 || ""), /^[0-9a-f]{64}$/);
  assert.equal(historical[0].path, "artifacts/gnocchi-proof-time-indexer-snapshot.json");
  return {
    runId: EXPECTED_RUN_ID,
    contractAddress: EXPECTED_GNOCCHI_CONTRACT,
    administrator: EXPECTED_ADMINISTRATOR,
    originationHash: origination.hash,
    historicalSnapshotPath: historical[0].path,
    historicalSnapshotSha256: historical[0].sha256,
  };
}

export function assertRavioliRecoveryState(
  state: RavioliRecoveryState,
  phase: "before" | "after",
): void {
  assert.ok(Number.isSafeInteger(state.level) && state.level > 0, `${phase} recovery level is invalid`);
  assert.equal(state.administrator, EXPECTED_ADMINISTRATOR, `${phase} recovery administrator drift`);
  const expected = phase === "before"
    ? { balances: { "0": 0, "1": 1 }, totalSupplies: { "0": 4, "1": 4 } }
    : { balances: { "0": 2, "1": 2 }, totalSupplies: { "0": 6, "1": 5 } };
  for (const tokenId of ["0", "1"] as const) {
    assert.equal(state.balances[tokenId], expected.balances[tokenId], `${phase} token ${tokenId} balance drift`);
    assert.equal(state.totalSupplies[tokenId], expected.totalSupplies[tokenId], `${phase} token ${tokenId} total supply drift`);
  }
}

export function ravioliRecoveryMintCalls(): RavioliRecoveryCall[] {
  return [
    {
      contractAddress: EXPECTED_GNOCCHI_CONTRACT,
      entrypoint: "mint",
      payload: { to_: EXPECTED_ADMINISTRATOR, token_id: 0, amount: 2 },
    },
    {
      contractAddress: EXPECTED_GNOCCHI_CONTRACT,
      entrypoint: "mint",
      payload: { to_: EXPECTED_ADMINISTRATOR, token_id: 1, amount: 1 },
    },
  ];
}

export function ravioliRecoverySendOptions(estimate: JsonObject): RavioliRecoverySendOptions {
  const gasLimit = asSafeInteger(estimate.gasLimit, "recovery estimated gas limit");
  const storageLimit = asSafeInteger(estimate.storageLimit, "recovery estimated storage limit");
  const suggestedFeeMutez = asSafeInteger(estimate.suggestedFeeMutez, "recovery suggested fee");
  const minimalFeeMutez = asSafeInteger(estimate.minimalFeeMutez, "recovery minimal fee");
  assert.ok(gasLimit > 0, "recovery estimated gas limit must be positive");
  return {
    amount: 0,
    mutez: true,
    // Limits are not padded, so a fixed tip over the estimator's larger fee is sufficient
    // and keeps the declared fee consistent with the exact gas limit being submitted.
    fee: Math.max(suggestedFeeMutez, minimalFeeMutez) + RECOVERY_FEE_HEADROOM_MUTEZ,
    gasLimit,
    storageLimit,
  };
}

function assertExactRecoveryCall(actual: JsonObject, expected: RavioliRecoveryCall): void {
  assert.equal(actual.contractAddress, expected.contractAddress, "recovery call target drift");
  assert.equal(actual.entrypoint, "mint", "recovery call entrypoint drift");
  assert.deepEqual(
    {
      to_: String(actual.payload?.to_ || ""),
      token_id: asSafeInteger(actual.payload?.token_id, "recovery token id"),
      amount: asSafeInteger(actual.payload?.amount, "recovery amount"),
    },
    expected.payload,
    "recovery call payload drift",
  );
}

export function validateRavioliRecoveryIntent(
  intent: JsonObject,
  acceptedEvidence: AcceptedGnocchiProof & AcceptedEvidenceHashes,
): JsonObject {
  assert.equal(intent.schema, "pastaprotocol-ravioli-dependency-recovery-intent@1", "Ravioli recovery intent schema drift");
  assert.equal(intent.status, "AUTHORIZED-NOT-YET-SUBMITTED", "Ravioli recovery intent status drift");
  exactNetwork(intent, "Ravioli recovery intent");
  assert.ok(
    [normalizeBase(SHADOWNET_RPC_PRIMARY), normalizeBase(SHADOWNET_RPC_FALLBACK)].includes(
      normalizeBase(String(intent.network?.rpcUrl || "")),
    ),
    "Ravioli recovery intent RPC is not a configured Shadownet endpoint",
  );
  assert.deepEqual(intent.acceptedEvidence, acceptedEvidence, "Ravioli recovery intent accepted-evidence drift");
  assertRavioliRecoveryState(intent.before as RavioliRecoveryState, "before");

  const calls = ravioliRecoveryMintCalls();
  assert.deepEqual(intent.exactMintPlan, calls, "Ravioli recovery intent mint plan drift");
  assert.ok(Array.isArray(intent.estimates), "Ravioli recovery intent estimates must be an array");
  assert.equal(intent.estimates.length, calls.length, "Ravioli recovery intent must bind exactly two estimates");
  intent.estimates.forEach((estimate: JsonObject, index: number) => {
    assertExactRecoveryCall(estimate.call, calls[index]);
    assert.ok(asSafeInteger(estimate.gasLimit, `recovery intent estimate ${index} gas limit`) > 0);
    for (const field of ["storageLimit", "suggestedFeeMutez", "minimalFeeMutez", "burnFeeMutez"] as const) {
      asSafeInteger(estimate[field], `recovery intent estimate ${index} ${field}`);
    }
    assert.deepEqual(
      estimate.sendOptions,
      ravioliRecoverySendOptions(estimate),
      `recovery intent estimate ${index} is not bound to its exact send options`,
    );
  });
  return intent;
}

export function validateRavioliRecoveryOperation(
  rows: unknown,
  input: {
    operationHash: string;
    expectedCounter: number;
    call: RavioliRecoveryCall;
  },
): RavioliRecoveryOperation {
  assert.equal(validateOperation(input.operationHash), ValidationResult.VALID, "recovery operation hash is invalid");
  assert.ok(Array.isArray(rows), "TzKT recovery response must be an array");
  const matches = rows.filter((row: JsonObject) =>
    row?.hash === input.operationHash &&
    row?.status === "applied" &&
    row?.sender?.address === EXPECTED_ADMINISTRATOR &&
    row?.target?.address === EXPECTED_GNOCCHI_CONTRACT &&
    row?.parameter?.entrypoint === "mint",
  );
  assert.equal(matches.length, 1, "TzKT lacks the exact applied recovery operation");
  const row = matches[0];
  assert.equal(asSafeInteger(row.counter, "recovery operation counter"), input.expectedCounter, "recovery operation counter drift");
  assert.equal(asSafeInteger(row.amount, "recovery operation tez amount"), 0, "recovery operation unexpectedly transferred tez");
  assertExactRecoveryCall({
    contractAddress: row.target.address,
    entrypoint: row.parameter.entrypoint,
    payload: row.parameter.value,
  }, input.call);
  const level = asSafeInteger(row.level, "recovery operation level");
  assert.ok(level > 0);
  const timestamp = String(row.timestamp || "");
  assert.ok(Number.isFinite(Date.parse(timestamp)), "recovery operation timestamp is invalid");
  return {
    hash: input.operationHash,
    counter: input.expectedCounter,
    level,
    timestamp,
    explorerUrl: `https://shadownet.tzkt.io/${input.operationHash}`,
    call: input.call,
  };
}

export function validateRavioliRecoveryOperationRows(
  rows: unknown,
  input: {
    beforeLevel: number;
    progress?: JsonObject;
    before: RavioliRecoveryState;
  },
): RavioliRecoveryOperation[] {
  assert.ok(Array.isArray(rows), "TzKT recovery candidate response must be an array");
  const calls = ravioliRecoveryMintCalls();
  const candidates = rows.filter((row: JsonObject) =>
    row?.sender?.address === EXPECTED_ADMINISTRATOR &&
    row?.target?.address === EXPECTED_GNOCCHI_CONTRACT &&
    row?.parameter?.entrypoint === "mint" &&
    asSafeInteger(row?.level, "recovery candidate level") >= input.beforeLevel,
  );
  assert.equal(candidates.length, calls.length, "TzKT must expose exactly the two recovery mint candidates after the intent pre-state");
  candidates.sort((left: JsonObject, right: JsonObject) =>
    asSafeInteger(left.counter, "recovery candidate counter") - asSafeInteger(right.counter, "recovery candidate counter"),
  );

  const operations = candidates.map((row: JsonObject, index: number) => validateRavioliRecoveryOperation([row], {
    operationHash: String(row.hash || ""),
    expectedCounter: asSafeInteger(row.counter, `recovery candidate ${index} counter`),
    call: calls[index],
  }));
  assert.equal(
    operations[1].counter,
    operations[0].counter + 1,
    "Ravioli recovery TzKT counters must be consecutive",
  );
  assert.ok(operations[1].level >= operations[0].level, "Ravioli recovery operation levels are out of order");

  if (input.progress !== undefined) {
    assert.equal(
      input.progress.schema,
      "pastaprotocol-ravioli-dependency-recovery-progress@1",
      "Ravioli recovery progress schema drift",
    );
    assert.equal(input.progress.status, "IN_PROGRESS", "Ravioli recovery progress status drift");
    assert.deepEqual(input.progress.before, input.before, "Ravioli recovery progress pre-state drift");
    assert.ok(Array.isArray(input.progress.appliedOperations), "Ravioli recovery progress operations must be an array");
    assert.ok(
      input.progress.appliedOperations.length > 0 && input.progress.appliedOperations.length <= operations.length,
      "Ravioli recovery progress must bind a non-empty prefix of the exact operation plan",
    );
    assert.deepEqual(
      input.progress.appliedOperations,
      operations.slice(0, input.progress.appliedOperations.length),
      "Ravioli recovery progress differs from the exact TzKT-applied operation prefix",
    );
  }
  return operations;
}

export function assertAcceptedEvidenceHashesUnchanged(
  before: AcceptedEvidenceHashes,
  after: AcceptedEvidenceHashes,
): void {
  assert.equal(after.manifestSha256, before.manifestSha256, "accepted Gnocchi manifest changed during recovery");
  assert.equal(after.receiptSha256, before.receiptSha256, "accepted Gnocchi receipt changed during recovery");
  assert.equal(
    after.historicalSnapshotSha256,
    before.historicalSnapshotSha256,
    "accepted Gnocchi historical snapshot changed during recovery",
  );
}

export function buildRavioliRecoveryReceipt(input: {
  startedAt: string;
  completedAt: string;
  rpcUrl: string;
  acceptedEvidence: AcceptedGnocchiProof & AcceptedEvidenceHashes;
  before: RavioliRecoveryState;
  estimates: JsonObject[];
  operations: RavioliRecoveryOperation[];
  after: RavioliRecoveryState;
}): JsonObject {
  assertRavioliRecoveryState(input.before, "before");
  assertRavioliRecoveryState(input.after, "after");
  assert.equal(input.estimates.length, 2, "Ravioli recovery requires two successful estimates");
  assert.equal(input.operations.length, 2, "Ravioli recovery requires two applied operations");
  assert.deepEqual(input.operations.map((operation) => operation.counter), [
    input.operations[0].counter,
    input.operations[0].counter + 1,
  ], "Ravioli recovery counters must be consecutive");
  assert.deepEqual(input.operations.map((operation) => operation.call), ravioliRecoveryMintCalls());
  assert.ok(input.after.level >= Math.max(...input.operations.map((operation) => operation.level)));
  return {
    schema: "pastaprotocol-ravioli-dependency-recovery@1",
    classification: "CHAIN-LIVE-RECOVERY",
    status: "PASSED",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: input.rpcUrl },
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    reason: "Restore exact creator escrow inventory consumed by the quarantined Ravioli OOM attempt without changing accepted Gnocchi proof files.",
    acceptedEvidence: input.acceptedEvidence,
    before: input.before,
    estimates: input.estimates,
    operations: input.operations,
    after: input.after,
    links: {
      contract: `https://shadownet.tzkt.io/${EXPECTED_GNOCCHI_CONTRACT}`,
      tokens: [0, 1].map((tokenId) => `https://shadownet.tzkt.io/${EXPECTED_GNOCCHI_CONTRACT}/tokens/${tokenId}`),
      operations: input.operations.map((operation) => operation.explorerUrl),
    },
    invariants: {
      acceptedManifestMutated: false,
      acceptedReceiptMutated: false,
      historicalSnapshotMutated: false,
      signer: EXPECTED_ADMINISTRATOR,
      entrypoint: "mint",
      exactMintPlan: ravioliRecoveryMintCalls(),
    },
  };
}

export function validateRavioliRecoveryReceipt(
  receipt: JsonObject,
  expectedHashes: AcceptedEvidenceHashes,
): void {
  assert.equal(receipt.schema, "pastaprotocol-ravioli-dependency-recovery@1", "Ravioli recovery receipt schema drift");
  assert.equal(receipt.classification, "CHAIN-LIVE-RECOVERY", "Ravioli recovery receipt classification drift");
  assert.equal(receipt.status, "PASSED", "Ravioli recovery receipt is not passed");
  exactNetwork(receipt, "Ravioli recovery receipt");

  const startedAt = Date.parse(String(receipt.startedAt || ""));
  const completedAt = Date.parse(String(receipt.completedAt || ""));
  assert.ok(Number.isFinite(startedAt), "Ravioli recovery receipt start time is invalid");
  assert.ok(Number.isFinite(completedAt) && completedAt >= startedAt, "Ravioli recovery receipt completion time is invalid");

  const accepted = receipt.acceptedEvidence as JsonObject;
  assert.ok(accepted && typeof accepted === "object", "Ravioli recovery receipt lacks accepted Gnocchi evidence");
  assert.equal(accepted.runId, EXPECTED_RUN_ID, "Ravioli recovery accepted run drift");
  assert.equal(accepted.contractAddress, EXPECTED_GNOCCHI_CONTRACT, "Ravioli recovery accepted contract drift");
  assert.equal(accepted.administrator, EXPECTED_ADMINISTRATOR, "Ravioli recovery accepted administrator drift");
  assert.equal(validateOperation(String(accepted.originationHash || "")), ValidationResult.VALID, "Ravioli recovery accepted origination hash is invalid");
  assert.equal(accepted.historicalSnapshotPath, "artifacts/gnocchi-proof-time-indexer-snapshot.json", "Ravioli recovery historical snapshot path drift");
  assert.equal(accepted.manifestSha256, expectedHashes.manifestSha256, "accepted manifest hash drift");
  assert.equal(accepted.receiptSha256, expectedHashes.receiptSha256, "accepted receipt hash drift");
  assert.equal(
    accepted.historicalSnapshotSha256,
    expectedHashes.historicalSnapshotSha256,
    "accepted historical snapshot hash drift",
  );

  assertRavioliRecoveryState(receipt.before as RavioliRecoveryState, "before");
  assertRavioliRecoveryState(receipt.after as RavioliRecoveryState, "after");
  const calls = ravioliRecoveryMintCalls();
  assert.ok(Array.isArray(receipt.estimates), "Ravioli recovery estimates must be an array");
  assert.equal(receipt.estimates.length, calls.length, "Ravioli recovery receipt must bind two estimates");
  receipt.estimates.forEach((estimate: JsonObject, index: number) => {
    assertExactRecoveryCall(estimate.call, calls[index]);
    assert.ok(asSafeInteger(estimate.gasLimit, `recovery estimate ${index} gas limit`) > 0);
    for (const field of ["storageLimit", "suggestedFeeMutez", "minimalFeeMutez", "burnFeeMutez"] as const) {
      if (estimate[field] !== undefined) asSafeInteger(estimate[field], `recovery estimate ${index} ${field}`);
    }
    assert.deepEqual(
      estimate.sendOptions,
      ravioliRecoverySendOptions(estimate),
      `recovery estimate ${index} is not bound to its exact send options`,
    );
  });

  assert.ok(Array.isArray(receipt.operations), "Ravioli recovery operations must be an array");
  assert.equal(receipt.operations.length, calls.length, "Ravioli recovery receipt must bind two operations");
  receipt.operations.forEach((operation: JsonObject, index: number) => {
    assert.equal(validateOperation(String(operation.hash || "")), ValidationResult.VALID, `recovery operation ${index} hash is invalid`);
    assertExactRecoveryCall(operation.call, calls[index]);
    assert.ok(asSafeInteger(operation.counter, `recovery operation ${index} counter`) > 0);
    assert.ok(asSafeInteger(operation.level, `recovery operation ${index} level`) > 0);
    const timestamp = Date.parse(String(operation.timestamp || ""));
    assert.ok(
      Number.isFinite(timestamp) && timestamp >= startedAt && timestamp <= completedAt,
      `recovery operation ${index} timestamp is outside the recovery window`,
    );
    assert.equal(
      operation.explorerUrl,
      `https://shadownet.tzkt.io/${operation.hash}`,
      `recovery operation ${index} explorer URL drift`,
    );
  });
  assert.equal(
    asSafeInteger(receipt.operations[1].counter, "second recovery counter"),
    asSafeInteger(receipt.operations[0].counter, "first recovery counter") + 1,
    "Ravioli recovery operation counters must be consecutive",
  );
  assert.ok(
    asSafeInteger(receipt.after.level, "Ravioli recovery post-state level") >=
      Math.max(...receipt.operations.map((operation: JsonObject) => asSafeInteger(operation.level, "recovery operation level"))),
    "Ravioli recovery post-state predates an applied recovery operation",
  );

  assert.deepEqual(receipt.links, {
    contract: `https://shadownet.tzkt.io/${EXPECTED_GNOCCHI_CONTRACT}`,
    tokens: [0, 1].map((tokenId) => `https://shadownet.tzkt.io/${EXPECTED_GNOCCHI_CONTRACT}/tokens/${tokenId}`),
    operations: receipt.operations.map((operation: JsonObject) => operation.explorerUrl),
  }, "Ravioli recovery evidence links drift");
  assert.equal(receipt.invariants?.acceptedManifestMutated, false);
  assert.equal(receipt.invariants?.acceptedReceiptMutated, false);
  assert.equal(receipt.invariants?.historicalSnapshotMutated, false);
  assert.equal(receipt.invariants?.signer, EXPECTED_ADMINISTRATOR);
  assert.equal(receipt.invariants?.entrypoint, "mint");
  assert.deepEqual(receipt.invariants?.exactMintPlan, calls);
}

async function readJsonBytes(filePath: string): Promise<{ bytes: Uint8Array; value: JsonObject; digest: string }> {
  const bytes = await readFile(filePath);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), digest: sha256(bytes) };
}

async function loadAcceptedEvidence(runRoot: string): Promise<LoadedAcceptedEvidence> {
  const gnocchiRoot = path.join(runRoot, "gnocchi");
  const manifestPath = path.join(gnocchiRoot, "manifest.json");
  const receiptPath = path.join(gnocchiRoot, "artifacts", "gnocchi-ui-live-run.json");
  const [manifest, receipt] = await Promise.all([readJsonBytes(manifestPath), readJsonBytes(receiptPath)]);
  const accepted = validateAcceptedGnocchiProof(manifest.value, receipt.value);
  const historicalSnapshotPath = path.resolve(gnocchiRoot, accepted.historicalSnapshotPath);
  assert.ok(historicalSnapshotPath.startsWith(`${path.resolve(gnocchiRoot)}${path.sep}`), "historical snapshot escapes Gnocchi proof root");
  const historicalSnapshot = await readFile(historicalSnapshotPath);
  const historicalSnapshotSha256 = sha256(historicalSnapshot);
  assert.equal(historicalSnapshotSha256, accepted.historicalSnapshotSha256, "accepted historical snapshot bytes differ from manifest");
  return {
    accepted,
    hashes: {
      manifestSha256: manifest.digest,
      receiptSha256: receipt.digest,
      historicalSnapshotSha256,
    },
    paths: { manifest: manifestPath, receipt: receiptPath, historicalSnapshot: historicalSnapshotPath },
  };
}

async function rehashAcceptedEvidence(paths: {
  manifest: string;
  receipt: string;
  historicalSnapshot: string;
}): Promise<AcceptedEvidenceHashes> {
  const [manifest, receipt, historicalSnapshot] = await Promise.all([
    readFile(paths.manifest),
    readFile(paths.receipt),
    readFile(paths.historicalSnapshot),
  ]);
  return {
    manifestSha256: sha256(manifest),
    receiptSha256: sha256(receipt),
    historicalSnapshotSha256: sha256(historicalSnapshot),
  };
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert.ok(response.ok, `${url} returned HTTP ${response.status}`);
  return response.json();
}

function balanceFromLedger(entries: JsonObject[], owner: string, tokenId: number): number {
  const row = entries.find((entry) =>
    entry?.active === true &&
    entry?.key?.owner === owner &&
    Number(entry?.key?.token_id) === tokenId,
  );
  return row ? asSafeInteger(row.value, `token ${tokenId} ledger balance`) : 0;
}

function valueForToken(entries: JsonObject[], tokenId: number, label: string): number {
  const row = entries.find((entry) => entry?.active === true && Number(entry?.key) === tokenId);
  return row ? asSafeInteger(row.value, `${label} token ${tokenId}`) : 0;
}

async function readRavioliRecoveryState(): Promise<RavioliRecoveryState> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [head, contract, storage] = await Promise.all([
    fetchJson(`${base}/head`),
    fetchJson(`${base}/contracts/${EXPECTED_GNOCCHI_CONTRACT}`),
    fetchJson(`${base}/contracts/${EXPECTED_GNOCCHI_CONTRACT}/storage`),
  ]);
  assert.equal(contract?.kind, "asset", "accepted Gnocchi contract is not indexed as an asset");
  assert.ok(Array.isArray(contract?.tzips) && contract.tzips.map((entry: unknown) => String(entry).toLowerCase()).includes("fa2"));
  assert.equal(contract?.creator?.address, EXPECTED_ADMINISTRATOR, "accepted Gnocchi indexed creator drift");
  assert.equal(storage?.administrator, EXPECTED_ADMINISTRATOR, "accepted Gnocchi storage administrator drift");
  const ledgerId = asSafeInteger(storage?.ledger, "Gnocchi ledger big-map id");
  const supplyId = asSafeInteger(storage?.total_supply, "Gnocchi total-supply big-map id");
  const [ledger, supplies] = await Promise.all([
    fetchJson(`${base}/bigmaps/${ledgerId}/keys?active=true&limit=10000`),
    fetchJson(`${base}/bigmaps/${supplyId}/keys?active=true&limit=10000`),
  ]);
  assert.ok(Array.isArray(ledger) && Array.isArray(supplies));
  return {
    level: asSafeInteger(head?.level, "TzKT head level"),
    administrator: storage.administrator,
    balances: {
      "0": balanceFromLedger(ledger, EXPECTED_ADMINISTRATOR, 0),
      "1": balanceFromLedger(ledger, EXPECTED_ADMINISTRATOR, 1),
    },
    totalSupplies: {
      "0": valueForToken(supplies, 0, "total supply"),
      "1": valueForToken(supplies, 1, "total supply"),
    },
  };
}

async function pollRavioliRecoveryState(
  phase: "after",
  options: { attempts?: number; delayMs?: number } = {},
): Promise<RavioliRecoveryState> {
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 4_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const state = await readRavioliRecoveryState();
      assertRavioliRecoveryState(state, phase);
      return state;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `Ravioli dependency recovery ${phase} state did not converge after ${attempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function readRpcCounter(rpcUrl: string): Promise<number> {
  const base = normalizeBase(rpcUrl);
  const response = await fetch(`${base}/chains/main/blocks/head/context/contracts/${EXPECTED_ADMINISTRATOR}/counter`, {
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok, `${rpcUrl} counter read returned HTTP ${response.status}`);
  return asSafeInteger(JSON.parse(await response.text()), `${rpcUrl} creator counter`);
}

async function assertSignerLaneClear(rpcUrl: string, expectedCounter?: number): Promise<RavioliRecoveryLaneSnapshot> {
  const base = normalizeBase(rpcUrl);
  const [chainIdResponse, counter, balanceResponse, mempool] = await Promise.all([
    fetch(`${base}/chains/main/chain_id`, { signal: AbortSignal.timeout(30_000) }),
    readRpcCounter(rpcUrl),
    fetch(`${base}/chains/main/blocks/head/context/contracts/${EXPECTED_ADMINISTRATOR}/balance`, { signal: AbortSignal.timeout(30_000) }),
    fetchJson(`${base}/chains/main/mempool/pending_operations`),
  ]);
  assert.ok(chainIdResponse.ok && balanceResponse.ok);
  assert.equal(JSON.parse(await chainIdResponse.text()), SHADOWNET_CHAIN_ID);
  if (expectedCounter !== undefined) assert.equal(counter, expectedCounter, `${rpcUrl} creator counter drift`);
  const balanceMutez = asSafeInteger(JSON.parse(await balanceResponse.text()), `${rpcUrl} creator balance`);
  const liveBuckets = ["applied", "validated", "branch_delayed", "unprocessed"];
  const active = liveBuckets.flatMap((bucket) => (Array.isArray(mempool?.[bucket]) ? mempool[bucket] : []))
    .map((entry: JsonObject | [string, JsonObject]) =>
      Array.isArray(entry) && entry.length === 2 && entry[1] && typeof entry[1] === "object" ? entry[1] : entry,
    )
    .filter((operation: JsonObject) => operation?.contents?.some((content: JsonObject) => content?.source === EXPECTED_ADMINISTRATOR));
  assert.equal(active.length, 0, `${rpcUrl} has an active creator operation in the mempool`);
  return { counter, balanceMutez, activeOperationCount: 0 };
}

async function requireFreshRecoveryDirectory(runRoot: string): Promise<string> {
  const recoveryRoot = path.join(path.resolve(runRoot), RECOVERY_DIRECTORY);
  try {
    await stat(recoveryRoot);
    assert.fail(`Ravioli dependency recovery directory already exists: ${recoveryRoot}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return recoveryRoot;
}

async function readOptionalRecoveryProgress(recoveryRoot: string): Promise<JsonObject | undefined> {
  try {
    return (await readJsonBytes(path.join(recoveryRoot, "recovery-progress.json"))).value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function readReconciliationOperationRows(beforeLevel: number): Promise<JsonObject[]> {
  const query = new URLSearchParams({
    sender: EXPECTED_ADMINISTRATOR,
    target: EXPECTED_GNOCCHI_CONTRACT,
    entrypoint: "mint",
    "level.ge": String(beforeLevel),
    "sort.asc": "id",
    limit: "100",
  });
  const rows = await fetchJson(`${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions?${query.toString()}`);
  assert.ok(Array.isArray(rows), "TzKT recovery candidate response must be an array");
  return rows;
}

async function writeReconciledReceipt(recoveryRoot: string, receipt: JsonObject): Promise<string> {
  const artifactRoot = path.join(recoveryRoot, "artifacts");
  await mkdir(artifactRoot, { recursive: false });
  const receiptPath = path.join(artifactRoot, "gnocchi-inventory-recovery.json");
  await writeFile(receiptPath, deterministicJsonBytes(receipt), { flag: "wx" });
  return receiptPath;
}

const DEFAULT_RECONCILIATION_IO: RavioliRecoveryReconciliationIo = {
  loadAcceptedEvidence,
  readIntent: async (recoveryRoot) => (await readJsonBytes(path.join(recoveryRoot, "recovery-intent.json"))).value,
  readProgress: readOptionalRecoveryProgress,
  readOperationRows: readReconciliationOperationRows,
  readState: readRavioliRecoveryState,
  readLane: (rpcUrl) => assertSignerLaneClear(rpcUrl),
  rehashAcceptedEvidence,
  writeFinalReceipt: writeReconciledReceipt,
  now: () => new Date().toISOString(),
};

function request(
  action: "estimate_call" | "call",
  id: string,
  call: RavioliRecoveryCall,
  sendOptions: RavioliRecoverySendOptions | { amount: 0; mutez: true },
): PastaUiLiveBridgeRequest {
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action,
    payload: { call, sendOptions },
  };
}

export async function executeRavioliRecoveryCallPlan(input: {
  session: Pick<TaquitoPastaUiLiveSession, "handle">;
  beforeSubmit: (estimates: RavioliRecoveryEstimate[]) => Promise<void>;
}): Promise<RavioliRecoveryEstimate[]> {
  const calls = ravioliRecoveryMintCalls();
  const estimates: RavioliRecoveryEstimate[] = [];
  for (let index = 0; index < calls.length; index += 1) {
    const response = await input.session.handle(request(
      "estimate_call",
      `recovery-estimate-${index}`,
      calls[index],
      { amount: 0, mutez: true },
    )) as JsonObject;
    assert.equal(response.contractAddress, calls[index].contractAddress, `recovery estimate ${index} target drift`);
    assert.equal(response.entrypoint, calls[index].entrypoint, `recovery estimate ${index} entrypoint drift`);
    const estimate = {
      call: calls[index],
      gasLimit: asSafeInteger(response.estimate?.gasLimit, `recovery estimate ${index} gas limit`),
      storageLimit: asSafeInteger(response.estimate?.storageLimit, `recovery estimate ${index} storage limit`),
      suggestedFeeMutez: asSafeInteger(response.estimate?.suggestedFeeMutez, `recovery estimate ${index} suggested fee`),
      minimalFeeMutez: asSafeInteger(response.estimate?.minimalFeeMutez, `recovery estimate ${index} minimal fee`),
      burnFeeMutez: asSafeInteger(response.estimate?.burnFeeMutez, `recovery estimate ${index} burn fee`),
      sendOptions: ravioliRecoverySendOptions(response.estimate),
    } satisfies RavioliRecoveryEstimate;
    assert.ok(estimate.gasLimit > 0);
    assertExactRecoveryCall(estimate.call, calls[index]);
    estimates.push(estimate);
  }
  assert.equal(estimates.length, calls.length, "both recovery estimates must complete before submission");
  await input.beforeSubmit(estimates);
  for (let index = 0; index < calls.length; index += 1) {
    await input.session.handle(request(
      "call",
      `recovery-call-${index}`,
      calls[index],
      estimates[index].sendOptions,
    ));
  }
  return estimates;
}

async function verifyAppliedRecoveryOperation(
  operationHash: string,
  expectedCounter: number,
  call: RavioliRecoveryCall,
): Promise<RavioliRecoveryOperation> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const rows = await pollJson(
    `Ravioli recovery operation ${operationHash}`,
    `${base}/operations/transactions/${encodeURIComponent(operationHash)}`,
    (value) => Array.isArray(value) && value.some((row: JsonObject) =>
      row?.hash === operationHash &&
      row?.status === "applied" &&
      row?.sender?.address === EXPECTED_ADMINISTRATOR &&
      row?.target?.address === EXPECTED_GNOCCHI_CONTRACT &&
      row?.parameter?.entrypoint === "mint",
    ),
  );
  return validateRavioliRecoveryOperation(rows, { operationHash, expectedCounter, call });
}

export async function runRavioliDependencyRecoveryReconciliation(options: {
  environment?: Record<string, string | undefined>;
  io?: RavioliRecoveryReconciliationIo;
} = {}): Promise<JsonObject> {
  const environment = options.environment ?? process.env;
  const io = options.io ?? DEFAULT_RECONCILIATION_IO;
  const runRoot = path.resolve(assertRavioliRecoveryReconciliationAllowed(environment));
  const recoveryRoot = path.join(runRoot, RECOVERY_DIRECTORY);

  const [acceptedEvidence, intent, progress] = await Promise.all([
    io.loadAcceptedEvidence(runRoot),
    io.readIntent(recoveryRoot),
    io.readProgress(recoveryRoot),
  ]);
  const acceptedWithHashes = { ...acceptedEvidence.accepted, ...acceptedEvidence.hashes };
  validateRavioliRecoveryIntent(intent, acceptedWithHashes);

  const [operationRows, after, primaryLane, fallbackLane, currentHashes] = await Promise.all([
    io.readOperationRows(asSafeInteger(intent.before?.level, "Ravioli recovery intent pre-state level")),
    io.readState(),
    io.readLane(SHADOWNET_RPC_PRIMARY),
    io.readLane(SHADOWNET_RPC_FALLBACK),
    io.rehashAcceptedEvidence(acceptedEvidence.paths),
  ]);
  assertAcceptedEvidenceHashesUnchanged(acceptedEvidence.hashes, currentHashes);
  assertRavioliRecoveryState(after, "after");
  const operations = validateRavioliRecoveryOperationRows(operationRows, {
    beforeLevel: asSafeInteger(intent.before.level, "Ravioli recovery intent pre-state level"),
    progress,
    before: intent.before as RavioliRecoveryState,
  });
  const terminalCounter = operations[operations.length - 1].counter;
  assert.equal(primaryLane.activeOperationCount, 0, "primary Shadownet RPC creator mempool is not clear");
  assert.equal(fallbackLane.activeOperationCount, 0, "fallback Shadownet RPC creator mempool is not clear");
  assert.equal(primaryLane.counter, terminalCounter, "primary Shadownet RPC counter does not terminate at the second recovery mint");
  assert.equal(fallbackLane.counter, terminalCounter, "fallback Shadownet RPC counter does not terminate at the second recovery mint");
  assert.equal(primaryLane.counter, fallbackLane.counter, "configured Shadownet RPC creator counters disagree");

  const receipt = buildRavioliRecoveryReceipt({
    startedAt: operations[0].timestamp,
    completedAt: io.now(),
    rpcUrl: String(intent.network.rpcUrl),
    acceptedEvidence: acceptedWithHashes,
    before: intent.before as RavioliRecoveryState,
    estimates: intent.estimates,
    operations,
    after,
  });
  validateRavioliRecoveryReceipt(receipt, acceptedEvidence.hashes);
  const receiptPath = await io.writeFinalReceipt(recoveryRoot, receipt);
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    mode: "READ-ONLY-RECONCILIATION",
    receiptPath,
    operations,
  }, null, 2)}\n`);
  return receipt;
}

export async function runRavioliDependencyRecovery(): Promise<JsonObject> {
  const runRoot = path.resolve(assertRavioliRecoveryExecutionAllowed(process.env));
  const recoveryRoot = await requireFreshRecoveryDirectory(runRoot);
  const acceptedEvidence = await loadAcceptedEvidence(runRoot);
  assert.equal(acceptedEvidence.accepted.contractAddress, EXPECTED_GNOCCHI_CONTRACT);
  assert.equal(acceptedEvidence.accepted.administrator, EXPECTED_ADMINISTRATOR);

  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const signerConfiguration = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-ravioli-recovery.sock",
    authToken: "local-pasta-shadownet-ravioli-recovery",
    auditLog: "/tmp/wtf-pasta-shadownet-ravioli-recovery-audit.log",
  });
  const signerSet = await loadSignerSet(signerConfiguration);
  assert.equal(signerSet.creator.address, EXPECTED_ADMINISTRATOR, "recovery keyring creator is not the exact accepted administrator");
  const tezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "Ravioli dependency recovery startup");

  const [primaryLane, fallbackLane, before] = await Promise.all([
    assertSignerLaneClear(SHADOWNET_RPC_PRIMARY),
    assertSignerLaneClear(SHADOWNET_RPC_FALLBACK),
    readRavioliRecoveryState(),
  ]);
  assert.equal(primaryLane.counter, fallbackLane.counter, "configured RPC creator counters disagree");
  assert.equal(primaryLane.balanceMutez, fallbackLane.balanceMutez, "configured RPC creator balances disagree");
  assert.ok(primaryLane.balanceMutez >= RECOVERY_OPERATION_RESERVE_MUTEZ, "creator balance is below the recovery reserve");
  assertRavioliRecoveryState(before, "before");

  const calls = ravioliRecoveryMintCalls();
  const validationPlan = calls;
  let validatedCallCount = 0;
  const operationEvidence: RavioliRecoveryOperation[] = [];
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: EXPECTED_ADMINISTRATOR,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([EXPECTED_GNOCCHI_CONTRACT]),
    allowedEntrypoints: new Set(["mint"]),
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async (stage) => {
      await assertShadownet(tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: async () => { throw new Error("Ravioli recovery cannot pin"); },
    validateCall: (call) => {
      const expected = validationPlan[validatedCallCount];
      assert.ok(expected, "Ravioli recovery refuses any call outside its exact estimate-and-submit plan");
      assertExactRecoveryCall(call, expected);
      validatedCallCount += 1;
    },
    assertOperationApplied: async ({ operationHash }) => {
      const expected = calls[operationEvidence.length];
      assert.ok(expected && operationHash);
      const evidence = await verifyAppliedRecoveryOperation(
        operationHash,
        primaryLane.counter + operationEvidence.length + 1,
        expected,
      );
      operationEvidence.push(evidence);
      await writeFile(
        path.join(recoveryRoot, "recovery-progress.json"),
        deterministicJsonBytes({
          schema: "pastaprotocol-ravioli-dependency-recovery-progress@1",
          status: "IN_PROGRESS",
          before,
          appliedOperations: operationEvidence,
        }),
      );
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: primaryLane.balanceMutez,
    requiredBalanceMutez: RECOVERY_OPERATION_RESERVE_MUTEZ,
    estimatedOriginationMutez: 0,
    operationReserveMutez: RECOVERY_OPERATION_RESERVE_MUTEZ,
  });

  let startedAt = "";
  const estimates = await executeRavioliRecoveryCallPlan({
    session,
    beforeSubmit: async (acceptedEstimates) => {
      assert.deepEqual(acceptedEstimates.map((estimate) => estimate.call), calls);
      await mkdir(recoveryRoot, { recursive: false });
      startedAt = new Date().toISOString();
      await writeFile(
        path.join(recoveryRoot, "recovery-intent.json"),
        deterministicJsonBytes({
          schema: "pastaprotocol-ravioli-dependency-recovery-intent@1",
          status: "AUTHORIZED-NOT-YET-SUBMITTED",
          network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
          acceptedEvidence: { ...acceptedEvidence.accepted, ...acceptedEvidence.hashes },
          before,
          estimates: acceptedEstimates,
          exactMintPlan: calls,
        }),
      );
    },
  });
  assert.ok(startedAt, "Ravioli recovery intent must exist before submission");
  assert.equal(validatedCallCount, validationPlan.length, "Ravioli recovery did not validate its exact full call plan");
  assert.equal(operationEvidence.length, 2);

  const after = await pollRavioliRecoveryState("after");
  assertRavioliRecoveryState(after, "after");
  await Promise.all([
    assertSignerLaneClear(SHADOWNET_RPC_PRIMARY, primaryLane.counter + 2),
    assertSignerLaneClear(SHADOWNET_RPC_FALLBACK, primaryLane.counter + 2),
  ]);
  const afterHashes = await rehashAcceptedEvidence(acceptedEvidence.paths);
  assertAcceptedEvidenceHashesUnchanged(acceptedEvidence.hashes, afterHashes);
  const receipt = buildRavioliRecoveryReceipt({
    startedAt,
    completedAt: new Date().toISOString(),
    rpcUrl: rpc.rpcUrl,
    acceptedEvidence: { ...acceptedEvidence.accepted, ...acceptedEvidence.hashes },
    before,
    estimates,
    operations: operationEvidence,
    after,
  });
  validateRavioliRecoveryReceipt(receipt, acceptedEvidence.hashes);
  const artifactRoot = path.join(recoveryRoot, "artifacts");
  await mkdir(artifactRoot, { recursive: false });
  const receiptPath = path.join(artifactRoot, "gnocchi-inventory-recovery.json");
  await writeFile(receiptPath, deterministicJsonBytes(receipt));
  process.stdout.write(`${JSON.stringify({ status: "PASSED", receiptPath, operations: operationEvidence }, null, 2)}\n`);
  return receipt;
}

async function main(): Promise<void> {
  try {
    if (process.env[RECONCILE_FLAG] !== undefined) {
      await runRavioliDependencyRecoveryReconciliation();
    } else {
      await runRavioliDependencyRecovery();
    }
  } catch (error) {
    if (error instanceof ProofBlocked) {
      process.stderr.write(`BLOCKED: ${error.message}\n${error.lines.join("\n")}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
