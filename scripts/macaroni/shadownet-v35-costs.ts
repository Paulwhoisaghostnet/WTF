#!/usr/bin/env tsx

import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { MichelsonMap, UnitValue } from "@taquito/taquito";

import {
  macaroniV35AllocationDigest,
  macaroniV35MetadataCommitment,
  simulateMacaroniV35SwapPop,
} from "../../server/features/macaroni/v35-crypto";
import { generateMacaroniV35EntropyChain } from "../../server/features/macaroni/v35-entropy";
import { stageMacaroniPrivateToken } from "../../server/features/macaroni/v35-private-staging";
import {
  assertShadownet,
  buildToolkit,
  loadSignerPair,
  normalizeBase,
  probeRpcChainId,
  root,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
} from "../pasta-protocol/shadownet-proof-kit";

const CONTRACT_PATH = path.join(
  root,
  "public/creation-tools/macaroni/contract/macaroni-v35.contract.json",
);
const REPORT_JSON_PATH = path.join(
  root,
  ".agents/docs/archive/contracts/macaroni-v35-shadownet-costs.json",
);
const REPORT_MD_PATH = path.join(
  root,
  ".agents/docs/archive/contracts/macaroni-v35-shadownet-costs.md",
);
const EXECUTE = process.env.MACARONI_V35_COST_EXECUTE === "1";
const VERIFY_HISTORY_ONLY = process.argv.includes("--verify-history");
const FULFILLMENT_SUBSIDY_MUTEZ = 151_180;
const SALE_PRICE_MUTEZ = 160_000;
const INITIAL_RESERVE_MUTEZ = FULFILLMENT_SUBSIDY_MUTEZ * 5;
const COLLECTOR_TARGET_BALANCE_MUTEZ = 15_000_000;
const METADATA_CID_URI_BYTES = 66;
const HISTORICAL_REVEAL_OPERATION =
  "ooUFUqK6Ffpb8HKcSoxCnCPmQ4tYsrkEWYM57GZYEVnKu83j6zA";
const HISTORICAL_REVEAL_BAKER_FEE_MUTEZ = 53_680;
const HISTORICAL_MACARONI_V2_SEED_CONTRACT = "KT1FXzFiRTVMnrtRzorLRVgdkq4SyPgL4TsF";
const HISTORICAL_MACARONI_V2_CODE_HASH = -2_085_531_756;
const HISTORICAL_MACARONI_V2_TYPE_HASH = -1_198_466_749;

type FixtureSpec = {
  label: "SMALL" | "LARGE" | "MIXED";
  quantities: number[];
  artifactSize(index: number): number;
  settlementBatchSize: number;
};

type PreparedToken = {
  artifactBytes: number;
  artifactCid: string;
  metadataCid: string;
  metadataCommitment: string;
  metadataNonce: string;
  metadataUri: string;
  quantity: number;
  tokenId: number;
};

type OperationCost = {
  allocationFeeMutez: number;
  bakerFeeMutez: number;
  gasUsed: number;
  hash: string;
  label: string;
  paidStorageDiff: number;
  storageFeeMutez: number;
  totalCostMutez: number;
};

const FIXTURES: FixtureSpec[] = [
  {
    label: "SMALL",
    quantities: [1, 1, 1, 1, 1],
    artifactSize: () => 64 * 1024,
    settlementBatchSize: 1,
  },
  {
    label: "LARGE",
    quantities: Array.from({ length: 40 }, () => 1),
    artifactSize: () => 2 * 1024 * 1024,
    settlementBatchSize: 5,
  },
  {
    label: "MIXED",
    quantities: [20, 20, 10, 1, 1, 1, 1, 1, 1, 1],
    artifactSize: (index) => (index % 2 === 0 ? 64 * 1024 : 2 * 1024 * 1024),
    settlementBatchSize: 5,
  },
];

function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  assert.ok(Number.isSafeInteger(parsed) && parsed >= 0, `unsafe natural number: ${String(value)}`);
  return parsed;
}

function deterministicBytes(label: string, size: number): Uint8Array {
  const output = Buffer.alloc(size);
  const seed = createHash("sha256").update(label).digest();
  for (let offset = 0; offset < output.length; offset += seed.length) {
    seed.copy(output, offset, 0, Math.min(seed.length, output.length - offset));
  }
  return output;
}

function deterministicNonce(label: string): string {
  return createHash("sha256").update(`macaroni-v35-cost-nonce:${label}`).digest("hex");
}

async function prepareTokens(input: {
  creator: string;
  fixture: FixtureSpec;
  runId: string;
  tempRoot: string;
}): Promise<PreparedToken[]> {
  const tokens: PreparedToken[] = [];
  for (const [tokenId, quantity] of input.fixture.quantities.entries()) {
    const artifactBytes = input.fixture.artifactSize(tokenId);
    const tokenRoot = path.join(input.tempRoot, input.fixture.label.toLowerCase(), String(tokenId));
    await mkdir(tokenRoot, { recursive: true });
    const staged = await stageMacaroniPrivateToken({
      artifactSource: deterministicBytes(`${input.runId}:${input.fixture.label}:${tokenId}`, artifactBytes),
      artifactCarPath: path.join(tokenRoot, "artifact.car"),
      metadataCarPath: path.join(tokenRoot, "metadata.car"),
      metadata: {
        name: `${input.fixture.label} V3.5 cost token ${tokenId}`,
        description: "Disposable Shadownet cost fixture for Macaroni V3.5.",
        decimals: 0,
        editions: quantity,
        isBooleanAmount: quantity === 1,
        creators: [input.creator],
        tags: ["macaroni-v35", "shadownet", "cost-fixture"],
      },
    });
    const metadataUri = `ipfs://${staged.metadata.cid}`;
    assert.equal(
      Buffer.byteLength(metadataUri, "utf8"),
      METADATA_CID_URI_BYTES,
      "cost fixture must use the standard 66-byte CIDv1 metadata URI",
    );
    const metadataNonce = deterministicNonce(`${input.runId}:${input.fixture.label}:${tokenId}`);
    tokens.push({
      artifactBytes,
      artifactCid: staged.artifact.cid,
      metadataCid: staged.metadata.cid,
      metadataCommitment: macaroniV35MetadataCommitment({
        metadataNonce,
        metadataUri,
        tokenId,
      }),
      metadataNonce,
      metadataUri,
      quantity,
      tokenId,
    });
  }
  return tokens;
}

function originationStorage(input: {
  creator: string;
  entropyHead: string;
  entropyLength: number;
  runId: string;
}) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set(
    "",
    utf8ToHex(`data:application/json,%7B%22name%22%3A%22Macaroni%20V3.5%20${input.runId}%22%7D`),
  );
  return {
    creator: input.creator,
    treasury: input.creator,
    release_policy: { immediate: UnitValue },
    entropy_commitment: input.entropyHead,
    entropy_length: input.entropyLength,
    fulfillment_subsidy: FULFILLMENT_SUBSIDY_MUTEZ,
    minter_royalty_config: {
      enabled: false,
      bps: 0,
      mode: 0,
      updater: input.creator,
    },
    administrator: input.creator,
    pending_administrator: null,
    finalizer: input.creator,
    pending_finalizer: null,
    metadata,
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    token_commitments: new MichelsonMap(),
    commitment_owner: new MichelsonMap(),
    token_supply: new MichelsonMap(),
    token_minted: new MichelsonMap(),
    slots: new MichelsonMap(),
    token_slots_loaded: new MichelsonMap(),
    metadata_uri_owner: new MichelsonMap(),
    supply: 0,
    slots_loaded: 0,
    next_slot_token_id: 0,
    token_count: 0,
    stages: new MichelsonMap(),
    allowlist: new MichelsonMap(),
    stage_minted: new MichelsonMap(),
    setup_finalized: false,
    sale_activated: false,
    sale_active: false,
    sale_permanently_closed: false,
    fulfillment_armed: false,
    paused: false,
    claims: new MichelsonMap(),
    claim_token: new MichelsonMap(),
    claim_allocation_digest: new MichelsonMap(),
    claims_created: 0,
    claims_settled: 0,
    next_claim_to_settle: 0,
    entropy_cursor: input.entropyHead,
    entropy_remaining: input.entropyLength,
    total_sales_received: 0,
    total_treasury_paid: 0,
    total_subsidy_retained: 0,
    total_reimbursements: 0,
    activation_reserve_required: 0,
    final_sweep_amount: 0,
    final_sweep_complete: false,
    first_minter: new MichelsonMap(),
    minter_pool: new MichelsonMap(),
    minter_pool_count: new MichelsonMap(),
    royalty_revision: new MichelsonMap(),
  };
}

async function fetchOperationRows(hash: string, kind: "transactions" | "originations") {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  let last = "not indexed";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/operations/${kind}/${hash}?micheline=2`, {
        headers: { "user-agent": "wtfos-macaroni-v35-cost-proof" },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.text();
      if (response.ok) {
        const rows = JSON.parse(body);
        if (Array.isArray(rows) && rows.length) return rows;
      }
      last = `HTTP ${response.status}: ${body.slice(0, 160)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`TzKT did not index ${hash}: ${last}`);
}

async function historicalRevealFeeEvidence() {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const familyUrl = new URL(`${base}/contracts/${HISTORICAL_MACARONI_V2_SEED_CONTRACT}/same`);
  familyUrl.searchParams.set("select", "address,codeHash,typeHash");
  familyUrl.searchParams.set("limit", "10000");
  const familyResponse = await fetch(familyUrl, {
    headers: { "user-agent": "wtfos-macaroni-v35-cost-proof" },
    signal: AbortSignal.timeout(15_000),
  });
  const familyRows = await familyResponse.json();
  assert.equal(familyResponse.ok, true, "historical Macaroni V2 contract-family evidence is unavailable");
  assert.ok(Array.isArray(familyRows) && familyRows.length > 0, "historical Macaroni V2 contract family is empty");
  assert.ok(familyRows.length < 10_000, "historical Macaroni V2 contract-family response may be truncated");
  const contracts = familyRows.map((row: any) => {
    assert.match(String(row?.address || ""), /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/);
    assert.equal(Number(row?.codeHash), HISTORICAL_MACARONI_V2_CODE_HASH, "contract family code hash changed");
    assert.equal(Number(row?.typeHash), HISTORICAL_MACARONI_V2_TYPE_HASH, "contract family type hash changed");
    return String(row.address);
  }).sort();
  assert.ok(contracts.includes(HISTORICAL_MACARONI_V2_SEED_CONTRACT), "contract family omitted its seed contract");

  const revealUrl = new URL(`${base}/operations/transactions`);
  revealUrl.searchParams.set("target.in", contracts.join(","));
  revealUrl.searchParams.set("entrypoint", "reveal");
  revealUrl.searchParams.set("status", "applied");
  revealUrl.searchParams.set(
    "select",
    "hash,target,level,bakerFee,storageFee,allocationFee,gasUsed",
  );
  revealUrl.searchParams.set("limit", "10000");
  const revealResponse = await fetch(revealUrl, {
    headers: { "user-agent": "wtfos-macaroni-v35-cost-proof" },
    signal: AbortSignal.timeout(15_000),
  });
  const revealRows = await revealResponse.json();
  assert.equal(revealResponse.ok, true, "historical Macaroni V2 reveal-family evidence is unavailable");
  assert.ok(Array.isArray(revealRows) && revealRows.length > 0, "historical Macaroni V2 family has no applied reveals");
  assert.ok(revealRows.length < 10_000, "historical Macaroni V2 reveal-family response may be truncated");
  const appliedReveals = revealRows.map((row: any) => ({
    operationHash: String(row?.hash || ""),
    contract: String(row?.target?.address || row?.target || ""),
    level: safeNumber(row?.level),
    bakerFeeMutez: safeNumber(row?.bakerFee),
    storageFeeMutez: safeNumber(row?.storageFee),
    allocationFeeMutez: safeNumber(row?.allocationFee),
    gasUsed: safeNumber(row?.gasUsed),
  })).sort((left: any, right: any) =>
    right.bakerFeeMutez - left.bakerFeeMutez || left.operationHash.localeCompare(right.operationHash));
  for (const row of appliedReveals) {
    assert.match(row.operationHash, /^o[1-9A-HJ-NP-Za-km-z]{50}$/);
    assert.ok(contracts.includes(row.contract), "reveal scan returned a contract outside the reviewed family");
  }
  const row = appliedReveals[0];
  assert.equal(row.operationHash, HISTORICAL_REVEAL_OPERATION, "historical Macaroni reveal-fee maximum changed");
  assert.equal(
    row.bakerFeeMutez,
    HISTORICAL_REVEAL_BAKER_FEE_MUTEZ,
    "historical Macaroni reveal-fee maximum changed",
  );
  return {
    ...row,
    source: `${base}/operations/transactions/${HISTORICAL_REVEAL_OPERATION}`,
    familyEvidence: {
      seedContract: HISTORICAL_MACARONI_V2_SEED_CONTRACT,
      codeHash: HISTORICAL_MACARONI_V2_CODE_HASH,
      typeHash: HISTORICAL_MACARONI_V2_TYPE_HASH,
      sameTypeContractCount: contracts.length,
      contracts,
      appliedRevealOperationCount: appliedReveals.length,
      appliedReveals,
      contractFamilySource: familyUrl.toString(),
      appliedRevealSource: revealUrl.toString(),
    },
  };
}

async function operationCost(
  label: string,
  hash: string,
  kind: "transactions" | "originations" = "transactions",
): Promise<OperationCost> {
  const rows = await fetchOperationRows(hash, kind);
  assert.ok(rows.some((row: any) => row.status === "applied"), `${label} was not applied`);
  const applied = rows.filter((row: any) => row.status === "applied");
  const bakerFeeMutez = applied.reduce((sum: number, row: any) => sum + safeNumber(row.bakerFee), 0);
  const storageFeeMutez = applied.reduce((sum: number, row: any) => sum + safeNumber(row.storageFee), 0);
  const allocationFeeMutez = applied.reduce((sum: number, row: any) => sum + safeNumber(row.allocationFee), 0);
  return {
    allocationFeeMutez,
    bakerFeeMutez,
    gasUsed: applied.reduce((sum: number, row: any) => sum + safeNumber(row.gasUsed), 0),
    hash,
    label,
    paidStorageDiff: applied.reduce((sum: number, row: any) => sum + safeNumber(row.paidStorageDiff), 0),
    storageFeeMutez,
    totalCostMutez: bakerFeeMutez + storageFeeMutez + allocationFeeMutez,
  };
}

async function confirmAndCost(
  label: string,
  operation: any,
  kind: "transactions" | "originations" = "transactions",
) {
  await operation.confirmation(1);
  const hash = String(operation.hash || operation.opHash || "");
  assert.match(hash, /^o[1-9A-HJ-NP-Za-km-z]{50}$/);
  const cost = await operationCost(label, hash, kind);
  console.log(
    `[${label}] ${hash} cost=${cost.totalCostMutez} fee=${cost.bakerFeeMutez} storage=${cost.storageFeeMutez} allocation=${cost.allocationFeeMutez}`,
  );
  return cost;
}

async function runFixture(input: {
  code: unknown[];
  creator: { address: string };
  creatorTezos: any;
  collector: { address: string };
  collectorTezos: any;
  fixture: FixtureSpec;
  runId: string;
  tempRoot: string;
}) {
  const physicalSupply = input.fixture.quantities.reduce((sum, quantity) => sum + quantity, 0);
  const tokens = await prepareTokens({
    creator: input.creator.address,
    fixture: input.fixture,
    runId: input.runId,
    tempRoot: input.tempRoot,
  });
  const entropy = generateMacaroniV35EntropyChain({ physicalSupply });
  const storage = originationStorage({
    creator: input.creator.address,
    entropyHead: entropy.head,
    entropyLength: entropy.length,
    runId: `${input.fixture.label}-${input.runId}`,
  });
  const operations: OperationCost[] = [];

  const originate = await input.creatorTezos.contract.originate({ code: input.code, storage });
  operations.push(await confirmAndCost(`${input.fixture.label}:originate`, originate, "originations"));
  const originated = await originate.contract();
  const contract = originated.address;
  console.log(`[${input.fixture.label}] contract=${contract} supply=${physicalSupply} rows=${tokens.length}`);

  const creatorContract = await input.creatorTezos.contract.at(contract);
  const collectorContract = await input.collectorTezos.contract.at(contract);
  const add = await creatorContract.methodsObject.add_tokens_v35(tokens.map((token) => ({
    token_id: token.tokenId,
    metadata_commitment: token.metadataCommitment,
    quantity: token.quantity,
  }))).send();
  operations.push(await confirmAndCost(`${input.fixture.label}:add_tokens`, add));
  const appendSlots = await creatorContract.methodsObject.append_token_slots_v35(
    tokens.map((token) => ({
      token_id: token.tokenId,
      count: token.quantity,
    })),
  ).send();
  operations.push(await confirmAndCost(`${input.fixture.label}:append_slots`, appendSlots));

  const stages = new MichelsonMap<number, Record<string, unknown>>();
  stages.set(0, {
    start: new Date(Date.now() - 60_000).toISOString(),
    price: SALE_PRICE_MUTEZ,
    use_allowlist: false,
    max_per_wallet: null,
  });
  const stage = await creatorContract.methodsObject.set_stages(stages).send();
  operations.push(await confirmAndCost(`${input.fixture.label}:set_stages`, stage));
  const finalize = await creatorContract.methodsObject.finalize_setup(UnitValue).send();
  operations.push(await confirmAndCost(`${input.fixture.label}:finalize_setup`, finalize));
  const fund = await creatorContract.methodsObject.fund_fulfillment_reserve(UnitValue).send({
    amount: INITIAL_RESERVE_MUTEZ,
    mutez: true,
  });
  operations.push(await confirmAndCost(`${input.fixture.label}:fund_reserve`, fund));
  const arm = await creatorContract.methodsObject.arm_fulfillment(UnitValue).send();
  operations.push(await confirmAndCost(`${input.fixture.label}:arm_fulfillment`, arm));
  const activate = await creatorContract.methodsObject.activate_sale(UnitValue).send();
  operations.push(await confirmAndCost(`${input.fixture.label}:activate_sale`, activate));

  const purchase = await collectorContract.methodsObject.purchase(physicalSupply).send({
    amount: SALE_PRICE_MUTEZ * physicalSupply,
    mutez: true,
  });
  operations.push(await confirmAndCost(`${input.fixture.label}:purchase`, purchase));

  const chainId = await input.creatorTezos.rpc.getChainId();
  const afterPurchase: any = await (await input.creatorTezos.contract.at(contract)).storage();
  const claims = [];
  for (let claimId = 0; claimId < physicalSupply; claimId += 1) {
    const claim = await afterPurchase.claims.get(claimId);
    assert.ok(claim, `claim ${claimId} missing after purchase`);
    claims.push(claim);
  }

  let slots = tokens.flatMap((token) => Array.from({ length: token.quantity }, () => token.tokenId));
  const settlementCosts: Array<OperationCost & { claims: number; perClaimMutez: number }> = [];
  for (let start = 0; start < physicalSupply; start += input.fixture.settlementBatchSize) {
    const end = Math.min(physicalSupply, start + input.fixture.settlementBatchSize);
    const items = [];
    for (let claimId = start; claimId < end; claimId += 1) {
      const claim = claims[claimId];
      const digest = macaroniV35AllocationDigest({
        buyer: claim.buyer,
        chainId,
        claimId,
        contractAddress: contract,
        creator: input.creator.address,
        entropyPreimage: entropy.preimages[claimId],
        purchaseLevel: safeNumber(claim.purchase_level),
        recipient: claim.recipient,
        unit: safeNumber(claim.unit),
      });
      const allocation = simulateMacaroniV35SwapPop({ slots, allocationDigest: digest });
      slots = allocation.remainingSlots;
      const token = tokens[allocation.tokenId];
      assert.ok(token, `allocation selected missing token row ${allocation.tokenId}`);
      items.push({
        claim_id: claimId,
        entropy_preimage: entropy.preimages[claimId],
        metadata_uri: utf8ToHex(token.metadataUri),
        metadata_nonce: token.metadataNonce,
      });
    }
    const settle = await creatorContract.methodsObject.settle_claims_v35(items).send();
    const cost = await confirmAndCost(`${input.fixture.label}:settle:${start}-${end - 1}`, settle);
    settlementCosts.push({
      ...cost,
      claims: end - start,
      perClaimMutez: cost.totalCostMutez / (end - start),
    });
  }

  const finalStorage: any = await (await input.creatorTezos.contract.at(contract)).storage();
  assert.equal(safeNumber(finalStorage.claims_created), physicalSupply);
  assert.equal(safeNumber(finalStorage.claims_settled), physicalSupply);
  assert.equal(Boolean(finalStorage.final_sweep_complete), true);
  assert.equal(slots.length, 0);
  for (let claimId = 0; claimId < physicalSupply; claimId += 1) {
    assert.notEqual(await finalStorage.claim_token.get(claimId), undefined);
  }

  return {
    artifactBytes: {
      maximum: Math.max(...tokens.map((token) => token.artifactBytes)),
      minimum: Math.min(...tokens.map((token) => token.artifactBytes)),
      total: tokens.reduce((sum, token) => sum + token.artifactBytes, 0),
    },
    contract,
    contractFinalSweepMutez: safeNumber(finalStorage.final_sweep_amount),
    fixture: input.fixture.label,
    initialReserveMutez: INITIAL_RESERVE_MUTEZ,
    metadataUriBytes: METADATA_CID_URI_BYTES,
    operationCosts: operations,
    physicalSupply,
    settlementBatchSize: input.fixture.settlementBatchSize,
    settlementCosts,
    tokenRows: tokens.length,
  };
}

async function main() {
  if (VERIFY_HISTORY_ONLY) {
    const historicalReveal = await historicalRevealFeeEvidence();
    console.log(JSON.stringify({
      schema: "wtfos.macaroni-v35-historical-reveal-fee-proof.v1",
      verifiedAt: new Date().toISOString(),
      network: "shadownet",
      historicalRevealFeeEvidence: historicalReveal,
    }, null, 2));
    return;
  }
  if (!EXECUTE) {
    throw new Error(
      "This script originates disposable Shadownet contracts. Set MACARONI_V35_COST_EXECUTE=1 after selecting the isolated Shadownet keyring, or pass --verify-history for the read-only fee-family proof.",
    );
  }
  const probe = await probeRpcChainId();
  const [protocols, protocolConstants, historicalReveal] = await Promise.all([
    fetch(`${probe.rpcUrl}/chains/main/blocks/head/protocols`).then((response) => response.json()),
    fetch(`${probe.rpcUrl}/chains/main/blocks/head/context/constants`).then((response) => response.json()),
    historicalRevealFeeEvidence(),
  ]);
  const env = await signerEnv(probe.rpcUrl);
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(env);
  const creatorTezos = buildToolkit(creatorSigner, probe.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, probe.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "V3.5 cost creator preflight"),
    assertShadownet(collectorTezos, "V3.5 cost collector preflight"),
  ]);

  const collectorBalance = safeNumber(await collectorTezos.tz.getBalance(collector.address));
  const fundingOperations: OperationCost[] = [];
  if (collectorBalance < COLLECTOR_TARGET_BALANCE_MUTEZ) {
    const needed = COLLECTOR_TARGET_BALANCE_MUTEZ - collectorBalance;
    const funding = await creatorTezos.contract.transfer({
      to: collector.address,
      amount: needed,
      mutez: true,
    });
    fundingOperations.push(await confirmAndCost("fund isolated collector", funding));
  }

  const contractArtifactBytes = await readFile(CONTRACT_PATH);
  const contractArtifactSha256 = createHash("sha256").update(contractArtifactBytes).digest("hex");
  const code = JSON.parse(contractArtifactBytes.toString("utf8"));
  assert.ok(Array.isArray(code) && code.length > 0, "reviewed V3.5 artifact is missing");
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "macaroni-v35-costs-"));
  try {
    const fixtures = [];
    for (const fixture of FIXTURES) {
      fixtures.push(await runFixture({
        code,
        creator,
        creatorTezos,
        collector,
        collectorTezos,
        fixture,
        runId,
        tempRoot,
      }));
    }
    const allSettlements = fixtures.flatMap((fixture) => fixture.settlementCosts);
    const maximumObservedSettlementMutez = Math.max(...allSettlements.map((cost) => cost.totalCostMutez));
    const maximumObservedPerClaimMutez = Math.max(...allSettlements.map((cost) => cost.perClaimMutez));
    const singletonSettlements = fixtures
      .flatMap((fixture) => fixture.settlementCosts)
      .filter((cost) => cost.claims === 1);
    const maximumObservedSingletonMutez = Math.max(...singletonSettlements.map((cost) => cost.totalCostMutez));
    const maximumObservedStorageBurnMutez = Math.max(
      ...allSettlements.map((cost) => cost.storageFeeMutez + cost.allocationFeeMutez),
    );
    const evidenceDerivedSubsidyMutez =
      maximumObservedStorageBurnMutez + historicalReveal.bakerFeeMutez;
    assert.equal(
      evidenceDerivedSubsidyMutez,
      FULFILLMENT_SUBSIDY_MUTEZ,
      "configured subsidy must equal measured storage burn plus the historical Macaroni reveal fee envelope",
    );
    const maximumArmCostMutez = Math.max(
      ...fixtures.flatMap((fixture) => fixture.operationCosts)
        .filter((cost) => cost.label.endsWith(":arm_fulfillment"))
        .map((cost) => cost.totalCostMutez),
    );
    const report = {
      schema: "wtfos.macaroni-v35-shadownet-costs.v1",
      measuredAt: new Date().toISOString(),
      network: "shadownet",
      chainId: probe.chainId,
      rpc: probe.rpcUrl,
      tzkt: normalizeBase(SHADOWNET_TZKT_API),
      contractArtifact: "public/creation-tools/macaroni/contract/macaroni-v35.contract.json",
      contractArtifactSha256,
      protocol: {
        hash: protocols.protocol,
        nextHash: protocols.next_protocol,
        costPerByteMutez: safeNumber(protocolConstants.cost_per_byte),
        hardGasLimitPerOperation: safeNumber(protocolConstants.hard_gas_limit_per_operation),
        hardStorageLimitPerOperation: safeNumber(protocolConstants.hard_storage_limit_per_operation),
        hardGasLimitPerBlock: safeNumber(protocolConstants.hard_gas_limit_per_block),
        minimalBlockDelaySeconds: safeNumber(protocolConstants.minimal_block_delay),
      },
      creator: creator.address,
      collector: collector.address,
      fixturePolicy: {
        metadataUriBytes: METADATA_CID_URI_BYTES,
        initialReserveReimbursements: 5,
        initialReserveMutez: INITIAL_RESERVE_MUTEZ,
        fulfillmentSubsidyMutez: FULFILLMENT_SUBSIDY_MUTEZ,
        salePriceMutez: SALE_PRICE_MUTEZ,
        note: "Artifact bytes are off-chain and do not change Michelson settlement storage. Fixture sizes still exercise deterministic private CAR creation; on-chain cost follows claim count, newly allocated metadata rows, URI bytes, and current contract storage high-water state.",
      },
      fundingOperations,
      historicalRevealFeeEvidence: historicalReveal,
      fixtures,
      observed: {
        maximumObservedSettlementMutez,
        maximumObservedPerClaimMutez,
        maximumObservedSingletonMutez,
        maximumObservedStorageBurnMutez,
        maximumArmCostMutez,
        exactFiveSingletonReserveMutez: maximumObservedSingletonMutez * 5,
      },
      recommendedFundingPolicy: {
        derivation:
          "maximum observed V3.5 settlement storage/allocation burn + highest historical applied Macaroni V2 reveal baker fee",
        minimumFulfillmentSubsidyMutez: evidenceDerivedSubsidyMutez,
        initialContractReserveClaims: 5,
        initialContractReserveMutez: evidenceDerivedSubsidyMutez * 5,
        finalizerStartupMutez: evidenceDerivedSubsidyMutez * 5 + maximumArmCostMutez,
      },
    };
    await mkdir(path.dirname(REPORT_JSON_PATH), { recursive: true });
    await writeFile(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(
      REPORT_MD_PATH,
      [
        "# Macaroni V3.5 Shadownet cost evidence",
        "",
        `- Measured: ${report.measuredAt}`,
        `- Chain: ${report.chainId}`,
        `- Contract artifact: \`${report.contractArtifact}\``,
        `- Contract artifact SHA-256: \`${contractArtifactSha256}\``,
        `- Protocol: \`${protocols.protocol}\``,
        `- Standard metadata URI length: ${METADATA_CID_URI_BYTES} bytes`,
        `- Highest applied singleton settlement cost: ${maximumObservedSingletonMutez} mutez`,
        `- Five times that observed singleton cost: ${maximumObservedSingletonMutez * 5} mutez`,
        `- Highest applied batch cost: ${maximumObservedSettlementMutez} mutez`,
        `- Highest observed per-claim cost: ${maximumObservedPerClaimMutez} mutez`,
        `- Highest observed settlement storage burn: ${maximumObservedStorageBurnMutez} mutez`,
        `- Highest historical applied Macaroni reveal baker fee: ${historicalReveal.bakerFeeMutez} mutez (\`${historicalReveal.operationHash}\`)`,
        `- Evidence-derived per-claim subsidy: ${evidenceDerivedSubsidyMutez} mutez`,
        `- Initial five-claim contract reserve: ${evidenceDerivedSubsidyMutez * 5} mutez`,
        `- Finalizer startup balance (five envelopes plus arm): ${evidenceDerivedSubsidyMutez * 5 + maximumArmCostMutez} mutez`,
        "",
        "The raw receipt rows and every disposable KT1/operation hash are in the adjacent JSON report. Artifact byte size is an off-chain storage/pinning concern; the Tezos settlement cost is driven by the final URI and contract state written on-chain.",
        "",
      ].join("\n"),
      "utf8",
    );
    console.log(JSON.stringify({ report: REPORT_JSON_PATH, observed: report.observed }, null, 2));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
