import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TezosWatcher } from "../src/adapters/tezos-watcher.mjs";

const OPERATION = `o${"1".repeat(50)}`;

function pendingOperations(overrides = {}) {
  return {
    validated: [],
    branch_delayed: [],
    branch_refused: [],
    refused: [],
    outdated: [],
    unprocessed: [],
    ...overrides,
  };
}

function watcherFixture({
  headLevel = 200,
  branchLevel = 100,
  ttl = 50,
  counter = "4",
  pending = pendingOperations(),
  includedAt = null,
  storage = {},
} = {}) {
  const observedRequests = [];
  const watcher = new TezosWatcher({
    rpcUrl: "https://rpc.invalid",
    indexerUrl: "https://indexer.invalid/v1",
    duplicateCheckUrl: "https://objkt.invalid/graphql",
    network: "shadownet",
    expectedChainId: "NetXsqzbfFenSTS",
    signerKeyFile: "/unused",
    abiPath: "/unused",
    fetchImpl: async (url, init) => {
      observedRequests.push({ url: String(url), init });
      if (String(url).startsWith("https://indexer.invalid")) return new Response("[]", { status: 200 });
      const match = String(url).match(/blocks\/(\d+)\/operation_hashes$/);
      if (match) {
        const level = Number(match[1]);
        return Response.json(level === includedAt ? [[OPERATION], [], [], []] : [[], [], [], []]);
      }
      throw new Error(`unexpected request ${url}`);
    },
  });
  watcher.signerAddress = "tz1finalizer";
  watcher.toolkit = {
    rpc: {
      getPendingOperations: async () => pending,
      getContract: async () => ({ counter }),
      getBlockHeader: async (options) => options?.block ? { level: branchLevel } : { level: headLevel },
      getConstants: async () => ({ max_operations_time_to_live: ttl }),
    },
  };
  watcher.contractStorage = async () => ({
    next_claim_to_settle: 0,
    claim_token: { get: async () => null },
    setup_finalized: true,
    sale_activated: false,
    sale_permanently_closed: false,
    fulfillment_armed: false,
    claims_created: 0,
    ...storage,
  });
  return { watcher, observedRequests };
}

const project = { contract_address: "KT1-test" };

test("finalized contract snapshots select head-2, never head or head-1", async () => {
  const { watcher } = watcherFixture({ headLevel: 101 });
  let requestedBlock = null;
  watcher.toolkit.rpc.getBlockHash = async ({ block }) => {
    requestedBlock = block;
    return "BLockAt99";
  };
  const snapshot = await watcher.finalizedHeadSnapshot();
  assert.deepEqual(snapshot, { level: 99, blockHash: "BLockAt99", observedHeadLevel: 101 });
  assert.equal(requestedBlock, "99");
});

test("attached code accepts reordered top-level sections but rejects changed Michelson", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-code-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifact = [{ prim: "storage", args: [{ prim: "nat" }] }, { prim: "parameter", args: [{ prim: "unit" }] }, { prim: "code", args: [[]] }];
  const file = path.join(root, "reviewed.json");
  await writeFile(file, JSON.stringify(artifact));
  const { watcher } = watcherFixture();
  watcher.abiPath = file;
  watcher.toolkit.rpc.getScript = async () => ({ code: [artifact[1], artifact[0], artifact[2]] });
  const matched = await watcher.verifyContractCode("KT1contract", "Bfinalized");
  assert.equal(matched.expected, matched.observed);
  watcher.toolkit.rpc.getScript = async () => ({ code: [{ prim: "parameter", args: [{ prim: "nat" }] }, artifact[0], artifact[2]] });
  await assert.rejects(() => watcher.verifyContractCode("KT1contract", "Bfinalized"), /does not match/);
});

test("sellout policy releases existing claims after irreversible undersold close", () => {
  const { watcher } = watcherFixture();
  assert.equal(watcher.releaseEligibleAt({
    release_policy: { sellout: {} },
    claims_created: 2,
    supply: 10,
    sale_permanently_closed: false,
  }, {}, 123), null);
  assert.equal(watcher.releaseEligibleAt({
    release_policy: { sellout: {} },
    claims_created: 2,
    supply: 10,
    sale_permanently_closed: true,
  }, {}, 123), 123);
});

test("expired signed bytes are replaceable only after canonical-chain absence proof", async () => {
  const { watcher, observedRequests } = watcherFixture();
  const result = await watcher.preparedSettlementStatus({
    project,
    claimId: 0,
    operationHash: OPERATION,
    managerCounter: "5",
    branch: "BLockHash",
    branchLevel: 100,
  });
  assert.equal(result.state, "safe_to_replace_expired");
  assert.equal(result.reason, "branch_beyond_protocol_ttl");
  assert.ok(observedRequests.some(({ url }) => url.endsWith("/blocks/151/operation_hashes")));
});

test("an old attempt found in its canonical TTL window is reconciled, never replaced", async () => {
  const { watcher } = watcherFixture({ includedAt: 140 });
  const result = await watcher.preparedSettlementStatus({
    project,
    claimId: 0,
    operationHash: OPERATION,
    managerCounter: "5",
    branch: "BLockHash",
    branchLevel: 100,
  });
  assert.deepEqual(result, { state: "chain_included", canonicalInclusionLevel: 140 });
});

test("counter consumption is not treated as final replacement evidence before branch expiry", async () => {
  const { watcher } = watcherFixture({ branchLevel: 190, ttl: 120, counter: "5", includedAt: 197 });
  const result = await watcher.preparedSettlementStatus({
    project,
    claimId: 0,
    operationHash: OPERATION,
    managerCounter: "5",
    branch: "BLockHash",
    branchLevel: 190,
  });
  assert.equal(result.state, "wait_for_branch_expiry");
  assert.equal(result.reason, "manager_counter_changed_without_final_absence_proof");
});

test("one RPC node's rejected classification cannot authorize a replacement", async () => {
  const { watcher } = watcherFixture({
    branchLevel: 190,
    ttl: 120,
    pending: pendingOperations({ refused: [{ hash: OPERATION }] }),
  });
  const result = await watcher.preparedSettlementStatus({
    project,
    claimId: 0,
    operationHash: OPERATION,
    managerCounter: "5",
    branch: "BLockHash",
    branchLevel: 190,
  });
  assert.equal(result.state, "wait_for_branch_expiry");
  assert.equal(result.reason, "one_rpc_reports_rejected");
});

test("active mempool presence prevents replacement", async () => {
  const { watcher } = watcherFixture({
    pending: pendingOperations({ validated: [{ hash: OPERATION }] }),
    counter: "999",
  });
  const result = await watcher.preparedSettlementStatus({
    project,
    claimId: 0,
    operationHash: OPERATION,
    managerCounter: "5",
    branch: "BLockHash",
    branchLevel: 100,
  });
  assert.equal(result.state, "mempool");
});

test("private duplicate scan never sends target CIDs to Objkt", async () => {
  const bodies = [];
  const watcher = new TezosWatcher({
    rpcUrl: "https://rpc.invalid",
    indexerUrl: "https://indexer.invalid",
    duplicateCheckUrl: "https://objkt.invalid/graphql",
    duplicateCheckMode: "private_full_scan",
    network: "shadownet",
    expectedChainId: "NetXsqzbfFenSTS",
    signerKeyFile: "/unused",
    abiPath: "/unused",
    fetchImpl: async (_url, init) => {
      bodies.push(String(init.body));
      return Response.json({ data: { token: [] } });
    },
  });
  const privateCid = "ipfs://bafy-private-target";
  const result = await watcher.duplicateCidCheck([{ tokenId: 0, artifactUri: privateCid, metadataUri: `${privateCid}-metadata` }]);
  assert.equal(result.matches.length, 0);
  assert.equal(bodies.some((body) => body.includes(privateCid)), false);
});

test("private duplicate scan resumes the same public cursor after Objkt rate limiting", async () => {
  const requests = [];
  const responses = [
    new Response("rate limit", { status: 429 }),
    Response.json({ data: { token: [{ pk: 7, artifact_uri: "ipfs://public-other", metadata: null, fa_contract: "KT1public", token_id: "0", flag: "none" }] } }),
    Response.json({ data: { token: [] } }),
  ];
  const watcher = new TezosWatcher({
    rpcUrl: "https://rpc.invalid", indexerUrl: "https://indexer.invalid",
    duplicateCheckUrl: "https://objkt.invalid/graphql", duplicateCheckMode: "private_full_scan",
    network: "shadownet", expectedChainId: "NetXsqzbfFenSTS",
    signerKeyFile: "/unused", abiPath: "/unused",
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return responses.shift();
    },
  });
  const result = await watcher.duplicateCidCheck([{ tokenId: 0, artifactUri: "ipfs://private-artifact", metadataUri: "ipfs://private-metadata" }]);
  assert.deepEqual(requests.map((row) => row.variables.cursor), ["-1", "-1", "7"]);
  assert.equal(requests.some((row) => JSON.stringify(row).includes("private-artifact")), false);
  assert.equal(result.matches.length, 0);
});

test("claim ingestion reads head-2 storage and ignores both non-final head levels", async () => {
  const watcher = new TezosWatcher({
    rpcUrl: "https://rpc.invalid",
    indexerUrl: "https://indexer.invalid",
    duplicateCheckUrl: "https://objkt.invalid/graphql",
    network: "shadownet",
    expectedChainId: "NetXsqzbfFenSTS",
    signerKeyFile: "/unused",
    abiPath: "/unused",
  });
  const calls = [];
  const finalizedStorage = {
    claims_created: 1,
    claims_settled: 0,
    next_claim_to_settle: 0,
    supply: 2,
    claims: { get: async () => ({
      buyer: "tz1-final-buyer",
      recipient: "tz1-final-buyer",
      unit: 0,
      purchase_level: 99,
      purchase_time: new Date("2026-01-01T00:00:00Z"),
      stage_id: 0,
    }) },
  };
  watcher.toolkit = {
    rpc: {
      getBlockHeader: async () => ({ level: 101 }),
      getBlockHash: async ({ block }) => {
        calls.push(["hash", block]);
        return "B-finalized-99";
      },
    },
    contract: {
      at: async (_address, _composer, block) => {
        calls.push(["contract", block]);
        return { storage: async () => finalizedStorage };
      },
    },
  };
  const result = await watcher.scanClaims({
    project: { contract_address: "KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG" },
    fromClaimId: 0,
  });
  assert.equal(result.level, 99);
  assert.equal(result.claims[0].buyer, "tz1-final-buyer");
  assert.deepEqual(calls, [["hash", "99"], ["contract", "B-finalized-99"]]);
});

test("settlement reconciliation rejects one block on top and requires two plus exact token, digest, and URI", async () => {
  const { watcher } = watcherFixture();
  watcher.signerAddress = "tz1-finalizer";
  const metadataUri = "ipfs://bafy-final-metadata";
  const allocationDigest = "ab".repeat(32);
  watcher.exactOperation = async () => [{
    id: 7,
    hash: OPERATION,
    target: { address: "KT1-target" },
    sender: { address: "tz1-finalizer" },
    parameter: { entrypoint: "settle_claims_v35" },
    status: "applied",
    level: 100,
  }];
  let headLevel = 100;
  watcher.toolkit.rpc.getBlockHeader = async () => ({ level: headLevel });
  watcher.contractStorage = async () => ({
    claim_token: { get: async () => 3 },
    claim_allocation_digest: { get: async () => allocationDigest },
    token_metadata: { get: async () => ({ token_info: new Map([["", Buffer.from(metadataUri).toString("hex")]]) }) },
  });
  const input = {
    project: { contract_address: "KT1-target" },
    claimId: 0,
    tokenId: 3,
    allocationDigest,
    metadataUri,
    operationHash: OPERATION,
  };
  assert.equal((await watcher.reconcileSettlement(input)).reason, "waiting_for_tenderbake_finality");
  headLevel = 101;
  assert.equal((await watcher.reconcileSettlement(input)).reason, "waiting_for_tenderbake_finality");
  headLevel = 102;
  const applied = await watcher.reconcileSettlement(input);
  assert.equal(applied.status, "applied");
  assert.equal(applied.confirmations, 3);
  watcher.contractStorage = async () => ({
    claim_token: { get: async () => 3 },
    claim_allocation_digest: { get: async () => "cd".repeat(32) },
    token_metadata: { get: async () => ({ token_info: new Map([["", Buffer.from(metadataUri).toString("hex")]]) }) },
  });
  assert.equal((await watcher.reconcileSettlement(input)).reason, "chain_postcondition_not_observed");
});

test("fulfillment arm rejects one block on top and requires two before readiness", async () => {
  const { watcher } = watcherFixture();
  watcher.signerAddress = "tz1-finalizer";
  watcher.exactOperation = async () => [{
    id: 8,
    target: { address: "KT1-target" },
    sender: { address: "tz1-finalizer" },
    parameter: { entrypoint: "arm_fulfillment" },
    status: "applied",
    level: 200,
  }];
  let headLevel = 200;
  watcher.toolkit.rpc.getBlockHeader = async () => ({ level: headLevel });
  watcher.verifyContractBinding = async () => ({ storage: { fulfillment_armed: true } });
  const input = { project: { contract_address: "KT1-target" }, operationHash: OPERATION };
  assert.equal((await watcher.reconcileArmFulfillment(input)).reason, "waiting_for_tenderbake_finality");
  headLevel = 201;
  assert.equal((await watcher.reconcileArmFulfillment(input)).reason, "waiting_for_tenderbake_finality");
  headLevel = 202;
  assert.equal((await watcher.reconcileArmFulfillment(input)).status, "applied");
});

test("settlement signing fails before forging when estimate exceeds subsidy", async () => {
  const { watcher } = watcherFixture();
  watcher.toolkit.estimate = {
    contractCall: async () => ({ suggestedFeeMutez: 90000, burnFeeMutez: 20000 }),
  };
  await assert.rejects(() => watcher.prepareManagerCall({
    method: {},
    contractAddress: "KT1-target",
    entrypoint: "settle_claims_v35",
    maximumCostMutez: 100000,
  }), /exceeds.*fulfillment subsidy/);
});

test("manager signing fails closed when the finalizer is unrevealed", async () => {
  const { watcher } = watcherFixture();
  watcher.toolkit.estimate = {
    contractCall: async () => ({ suggestedFeeMutez: 1000, burnFeeMutez: 0 }),
  };
  watcher.finalizerFunding = async () => ({ revealed: false, sufficient: true, balanceMutez: 500000n, requiredMutez: 1000n });
  await assert.rejects(() => watcher.prepareManagerCall({
    method: {},
    contractAddress: "KT1-target",
    entrypoint: "settle_claims_v35",
    maximumCostMutez: 100000,
  }), /must be revealed/);
});

test("manager signing fails closed when the revealed finalizer is underfunded", async () => {
  const { watcher } = watcherFixture();
  watcher.toolkit.estimate = {
    contractCall: async () => ({ suggestedFeeMutez: 1000, burnFeeMutez: 0 }),
  };
  watcher.finalizerFunding = async () => ({ revealed: true, sufficient: false, balanceMutez: 999n, requiredMutez: 1000n });
  await assert.rejects(() => watcher.prepareManagerCall({
    method: {},
    contractAddress: "KT1-target",
    entrypoint: "settle_claims_v35",
    maximumCostMutez: 151180,
  }), /has 999 mutez.*requires 1000 mutez/);
});

test("purchase status remains confirming until two blocks sit on top", async () => {
  let headLevel = 301;
  let eventRequests = 0;
  const watcher = new TezosWatcher({
    rpcUrl: "https://rpc.invalid",
    indexerUrl: "https://indexer.invalid/v1",
    duplicateCheckUrl: "https://objkt.invalid/graphql",
    network: "shadownet",
    expectedChainId: "NetXsqzbfFenSTS",
    signerKeyFile: "/unused",
    abiPath: "/unused",
    fetchImpl: async () => {
      eventRequests += 1;
      return Response.json([{ payload: { claim_id: 0, buyer: "tz1-buyer", recipient: "tz1-buyer" } }]);
    },
  });
  watcher.toolkit = { rpc: { getBlockHeader: async () => ({ level: headLevel }) } };
  watcher.exactOperation = async () => [{
    id: 44,
    target: { address: "KT1-target" },
    sender: { address: "tz1-buyer" },
    parameter: { entrypoint: "purchase" },
    status: "applied",
    level: 300,
  }];
  assert.equal((await watcher.purchaseStatus({ contractAddress: "KT1-target", operationHash: OPERATION })).state, "confirming");
  assert.equal(eventRequests, 0);
  headLevel = 302;
  const result = await watcher.purchaseStatus({ contractAddress: "KT1-target", operationHash: OPERATION });
  assert.equal(result.state, "purchase_confirmed");
  assert.equal(result.confirmations, 3);
  assert.equal(eventRequests, 1);
});

test("creator origination live estimate uses encoded init and carries positive operation size", async () => {
  const { watcher } = watcherFixture();
  let estimateOptions;
  let preparedOptions;
  watcher.creatorEstimateToolkit = () => ({
    estimate: {
      originate: async (input) => {
        estimateOptions = input;
        return { gasLimit: 20_934, storageLimit: 22_000, suggestedFeeMutez: 2_000, totalCost: 5_896_549, opSize: 22_783 };
      },
    },
    prepare: {
      originate: async (input) => {
        preparedOptions = input;
        return { opOb: { branch: "B", contents: [] } };
      },
      toForge: (prepared) => prepared.opOb,
    },
    rpc: {
      // 22,719 forged bytes plus a 64-byte manager signature.
      forgeOperations: async () => "aa".repeat(22_719),
    },
  });
  const storage = { prim: "Pair", args: [] };
  const result = await watcher.estimateCreatorOrigination({ project: { administrator: "tz1-creator" }, publicKey: "edpk-test", code: [], storage });
  assert.equal(estimateOptions.init, storage);
  assert.equal(Object.hasOwn(estimateOptions, "storage"), false);
  assert.equal(preparedOptions.init, storage);
  assert.equal(Object.hasOwn(preparedOptions, "storage"), false);
  assert.equal(preparedOptions.gasLimit, 74_542);
  assert.equal(preparedOptions.storageLimit, 33_120);
  assert.equal(result.opSize, 22_783);
  assert.equal(result.finalOperationSizeBytes, 22_783);
  assert.equal(result.totalCostMutez, 5_896_549);
});

test("exact final forged creator size accounts for its signature at the 32,768-byte boundary", async () => {
  const { watcher } = watcherFixture();
  let forgedBytes = 32_704;
  watcher.creatorEstimateToolkit = () => ({
    estimate: {
      transfer: async () => ({ gasLimit: 1, storageLimit: 0, suggestedFeeMutez: 1, totalCost: 1, opSize: 1 }),
    },
    prepare: {
      transaction: async () => ({ opOb: { branch: "B", contents: [] } }),
      toForge: (prepared) => prepared.opOb,
    },
    rpc: { forgeOperations: async () => "aa".repeat(forgedBytes) },
  });
  const input = {
    project: { administrator: "tz1-creator" },
    publicKey: "edpk-test",
    target: "KT1-target",
    amountMutez: 0,
  };
  assert.equal((await watcher.estimateCreatorTransfer(input)).finalOperationSizeBytes, 32_768);
  forgedBytes += 1;
  assert.equal((await watcher.estimateCreatorTransfer(input)).finalOperationSizeBytes, 32_769);
});

test("late renderer hash reporting scans the full issuance window before creator retry", async () => {
  const { watcher } = watcherFixture({ headLevel: 400, ttl: 50 });
  watcher.exactOperation = async () => [];
  let searched;
  watcher.canonicalOperationLevel = async (_hash, from, through) => {
    searched = { from, through };
    return 150;
  };
  const attempt = {
    entrypoint: "append_token_slots_v35",
    operation_hash: OPERATION,
    issued_head_level: 100,
    submitted_head_level: 300,
  };
  const included = await watcher.creatorSubmissionStatus(attempt);
  assert.equal(included.state, "canonical_inclusion_not_indexed");
  assert.deepEqual(searched, { from: 100, through: 398 });

  watcher.canonicalOperationLevel = async (_hash, from, through) => {
    searched = { from, through };
    return null;
  };
  const absent = await watcher.creatorSubmissionStatus(attempt);
  assert.equal(absent.state, "expired_absent");
  assert.deepEqual(searched, { from: 100, through: 398 });
});

test("final creator reconciliation uses the raw canonical RPC operation instead of normalized indexer JSON", async () => {
  const { watcher } = watcherFixture({ headLevel: 104 });
  watcher.toolkit.rpc.getBlockHash = async ({ block }) => {
    assert.equal(block, "100");
    return "B100";
  };
  watcher.exactOrigination = async () => [{ hash: OPERATION, level: 100, code: [{ prim: "parameter" }], storage: { bytes: "00" } }];
  watcher.fetch = async (url) => {
    assert.equal(String(url), "https://rpc.invalid/chains/main/blocks/B100/operations");
    return Response.json([[{ hash: OPERATION, contents: [{
      kind: "origination", source: "tz1creator", balance: "0",
      script: { code: [{ prim: "storage" }, { prim: "parameter" }], storage: { string: "raw" } },
      metadata: { operation_result: { status: "applied", originated_contracts: ["KT1contract"] } },
    }] }]]);
  };
  const result = await watcher.creatorSubmissionStatus({ entrypoint: "origination", operation_hash: OPERATION });
  assert.equal(result.state, "indexed_final");
  assert.deepEqual(result.rows[0].code, [{ prim: "storage" }, { prim: "parameter" }]);
  assert.deepEqual(result.rows[0].storage, { string: "raw" });
  assert.equal(result.rows[0].originatedContract.address, "KT1contract");
});

test("hashless creator candidates are bound to canonical RPC rows before intent matching", async () => {
  const { watcher } = watcherFixture({ headLevel: 104 });
  watcher.finalizedHeadSnapshot = async () => ({ level: 102, blockHash: "B102", observedHeadLevel: 104 });
  watcher.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/indexer\.invalid\/v1\/operations\/originations\?/);
    return Response.json([{ hash: OPERATION, level: 100, storage: { bytes: "normalized" } }]);
  };
  watcher.canonicalCreatorOperationRows = async (hash, level) => {
    assert.equal(hash, OPERATION);
    assert.equal(level, 100);
    return [{ hash, level, storage: { string: "raw" } }];
  };
  const result = await watcher.findFinalCreatorIntentCandidates({
    entrypoint: "origination", signer: "tz1creator", issued_head_level: 98,
  });
  assert.deepEqual(result.rows, [{ hash: OPERATION, level: 100, storage: { string: "raw" } }]);
});

test("a hashless wallet prompt never expires from chain time because the wallet may forge later", async () => {
  const { watcher } = watcherFixture({ headLevel: 10_000, ttl: 5 });
  watcher.findFinalCreatorIntentCandidates = async () => ({
    finalized: { level: 9_998, blockHash: "B9998", observedHeadLevel: 10_000 },
    rows: [],
  });
  const result = await watcher.hashlessCreatorIntentWindow({
    entrypoint: "origination",
    signer: "tz1creator",
    issued_head_level: 100,
    prompt_started_head_level: 101,
  });
  assert.equal(result.expired, false);
  assert.equal(result.promptHeadLevel, 101);
  assert.deepEqual(result.indexedRows, []);
  assert.deepEqual(result.pendingRows, []);
});
