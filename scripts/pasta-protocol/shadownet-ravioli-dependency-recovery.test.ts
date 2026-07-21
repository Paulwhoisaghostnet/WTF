import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertAcceptedEvidenceHashesUnchanged,
  assertRavioliRecoveryExecutionAllowed,
  assertRavioliRecoveryReconciliationAllowed,
  assertRavioliRecoveryState,
  buildRavioliRecoveryReceipt,
  executeRavioliRecoveryCallPlan,
  ravioliRecoveryMintCalls,
  ravioliRecoverySendOptions,
  runRavioliDependencyRecoveryReconciliation,
  validateAcceptedGnocchiProof,
  validateRavioliRecoveryIntent,
  validateRavioliRecoveryOperationRows,
  validateRavioliRecoveryReceipt,
  validateRavioliRecoveryOperation,
  type RavioliRecoveryReconciliationIo,
} from "./shadownet-ravioli-dependency-recovery";
import { TaquitoPastaUiLiveSession } from "./pasta-ui-live-bridge-kit";
import { SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

const RUN_ID = "pasta-alpha-proof-20260718a";
const CONTRACT = "KT1NJJ55w4TLkRVfuweeRfvT9jvWFf4viaup";
const ADMIN = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const ORIGINATION = "ooqQerwmFGorWABitNHN2fHYiTszK9VYB7UJhaRSciFp1pBEXKD";
const MINT_ZERO = "ooEpdZm9iKVmUT49PJVUPiLNpDhVFDZxzvFuUsMizmKBUdwucbi";
const MINT_ONE = "oosszNJNwHVbahod9yB5eguwR2tLXAyXSK7CizaMqxwt6nitoTT";

function acceptedFixtures() {
  return {
    manifest: {
      schema: "pastaprotocol-app-proof@1",
      app: "gnocchi",
      role: "token-publisher",
      runId: RUN_ID,
      network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: "https://tezos-shadownet.octez.io" },
      contracts: [{ address: CONTRACT, kind: "open-edition-collection", explorerUrl: `https://shadownet.tzkt.io/${CONTRACT}` }],
      operations: [{ kind: "origination", hash: ORIGINATION, contractAddress: CONTRACT, status: "applied" }],
      artifacts: [{
        id: "gnocchi-proof-time-indexer-snapshot",
        kind: "historical-indexer-snapshot",
        path: "artifacts/gnocchi-proof-time-indexer-snapshot.json",
        sha256: "0a37661d4f2588cb3410426f45591039be92cb1fac03e2f5cdf0aa41e2cb4936",
      }],
    },
    receipt: {
      schema: "pastaprotocol-gnocchi-ui-live-run@1",
      classification: "UI-LIVE",
      network: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
      actors: { creator: ADMIN },
      contract: { address: CONTRACT, explorerUrl: `https://shadownet.tzkt.io/${CONTRACT}` },
      bridgeReceipts: {
        creator: [{
          action: "originate",
          chainId: SHADOWNET_CHAIN_ID,
          contractAddress: CONTRACT,
          operationHash: ORIGINATION,
          signerAddress: ADMIN,
        }],
      },
    },
  };
}

const HASHES = {
  manifestSha256: "11".repeat(32),
  receiptSha256: "22".repeat(32),
  historicalSnapshotSha256: "33".repeat(32),
};

const BEFORE = {
  level: 4_259_626,
  administrator: ADMIN,
  balances: { "0": 0, "1": 1 },
  totalSupplies: { "0": 4, "1": 4 },
};

const AFTER = {
  level: 4_259_635,
  administrator: ADMIN,
  balances: { "0": 2, "1": 2 },
  totalSupplies: { "0": 6, "1": 5 },
};

function acceptedEvidenceFixture() {
  const fixtures = acceptedFixtures();
  return { ...validateAcceptedGnocchiProof(fixtures.manifest, fixtures.receipt), ...HASHES };
}

function recoveryIntentFixture() {
  const calls = ravioliRecoveryMintCalls();
  const profiles = [
    { gasLimit: 4_208, storageLimit: 87, suggestedFeeMutez: 753, minimalFeeMutez: 733, burnFeeMutez: 21_750 },
    { gasLimit: 4_438, storageLimit: 0, suggestedFeeMutez: 776, minimalFeeMutez: 756, burnFeeMutez: 0 },
  ];
  return {
    schema: "pastaprotocol-ravioli-dependency-recovery-intent@1",
    status: "AUTHORIZED-NOT-YET-SUBMITTED",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: "https://tezos-shadownet.octez.io" },
    acceptedEvidence: acceptedEvidenceFixture(),
    before: structuredClone(BEFORE),
    estimates: calls.map((call, index) => ({
      call,
      ...profiles[index],
      sendOptions: ravioliRecoverySendOptions(profiles[index]),
    })),
    exactMintPlan: calls,
  };
}

function recoveryOperationRowsFixture() {
  const calls = ravioliRecoveryMintCalls();
  return [
    {
      hash: MINT_ZERO,
      status: "applied",
      counter: "23831420",
      level: 4_259_629,
      timestamp: "2026-07-19T12:47:03Z",
      sender: { address: ADMIN },
      target: { address: CONTRACT },
      amount: 0,
      parameter: { entrypoint: "mint", value: { to_: calls[0].payload.to_, amount: "2", token_id: "0" } },
    },
    {
      hash: MINT_ONE,
      status: "applied",
      counter: "23831421",
      level: 4_259_631,
      timestamp: "2026-07-19T12:47:15Z",
      sender: { address: ADMIN },
      target: { address: CONTRACT },
      amount: 0,
      parameter: { entrypoint: "mint", value: { to_: calls[1].payload.to_, amount: "1", token_id: "1" } },
    },
  ];
}

function recoveryProgressFixture() {
  const calls = ravioliRecoveryMintCalls();
  return {
    schema: "pastaprotocol-ravioli-dependency-recovery-progress@1",
    status: "IN_PROGRESS",
    before: structuredClone(BEFORE),
    appliedOperations: [{
      hash: MINT_ZERO,
      counter: 23_831_420,
      level: 4_259_629,
      timestamp: "2026-07-19T12:47:03Z",
      explorerUrl: `https://shadownet.tzkt.io/${MINT_ZERO}`,
      call: calls[0],
    }],
  };
}

test("Ravioli recovery gate is explicit, Shadownet-only, exact-run, and fresh-only", () => {
  assert.throws(() => assertRavioliRecoveryExecutionAllowed({}), /explicit Ravioli dependency-recovery execute flag/);
  assert.throws(() => assertRavioliRecoveryExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_RECOVERY_EXECUTE: "1",
    TEZOS_NETWORK: "mainnet",
    PASTA_PROOF_RUN_DIR: `/tmp/${RUN_ID}`,
  }), /only permits Shadownet/);
  assert.throws(() => assertRavioliRecoveryExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_RECOVERY_EXECUTE: "1",
    TEZOS_NETWORK: "shadownet",
    PASTA_PROOF_RUN_DIR: "/tmp/a-different-run",
  }), /exact accepted proof run/);
  assert.equal(assertRavioliRecoveryExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_RECOVERY_EXECUTE: "1",
    TEZOS_NETWORK: "shadownet",
    PASTA_PROOF_RUN_DIR: `/tmp/${RUN_ID}`,
  }), `/tmp/${RUN_ID}`);
});

test("read-only reconciliation gate is explicit, exact-run, and mutually exclusive with execution", () => {
  assert.throws(() => assertRavioliRecoveryReconciliationAllowed({}), /explicit read-only Ravioli recovery reconciliation flag/);
  assert.throws(() => assertRavioliRecoveryReconciliationAllowed({
    PASTA_SHADOWNET_RAVIOLI_RECOVERY_RECONCILE: "1",
    PASTA_SHADOWNET_RAVIOLI_RECOVERY_EXECUTE: "1",
    TEZOS_NETWORK: "shadownet",
    PASTA_PROOF_RUN_DIR: `/tmp/${RUN_ID}`,
  }), /forbids the execution flag/);
  assert.throws(() => assertRavioliRecoveryReconciliationAllowed({
    PASTA_SHADOWNET_RAVIOLI_RECOVERY_RECONCILE: "1",
    TEZOS_NETWORK: "mainnet",
    PASTA_PROOF_RUN_DIR: `/tmp/${RUN_ID}`,
  }), /only permits Shadownet/);
  assert.equal(assertRavioliRecoveryReconciliationAllowed({
    PASTA_SHADOWNET_RAVIOLI_RECOVERY_RECONCILE: "1",
    TEZOS_NETWORK: "shadownet",
    PASTA_PROOF_RUN_DIR: `/tmp/${RUN_ID}`,
  }), `/tmp/${RUN_ID}`);
});

test("accepted Gnocchi manifest and receipt are cross-bound to the exact run, contract, creator, and origination", () => {
  const fixtures = acceptedFixtures();
  const accepted = validateAcceptedGnocchiProof(fixtures.manifest, fixtures.receipt);
  assert.deepEqual(accepted, {
    runId: RUN_ID,
    contractAddress: CONTRACT,
    administrator: ADMIN,
    originationHash: ORIGINATION,
    historicalSnapshotPath: "artifacts/gnocchi-proof-time-indexer-snapshot.json",
    historicalSnapshotSha256: "0a37661d4f2588cb3410426f45591039be92cb1fac03e2f5cdf0aa41e2cb4936",
  });

  assert.throws(
    () => validateAcceptedGnocchiProof({ ...fixtures.manifest, runId: "wrong" }, fixtures.receipt),
    /exact accepted proof run/,
  );
  assert.throws(
    () => validateAcceptedGnocchiProof(fixtures.manifest, { ...fixtures.receipt, actors: { creator: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej" } }),
    /exact accepted creator/,
  );
  assert.throws(
    () => validateAcceptedGnocchiProof({ ...fixtures.manifest, network: { name: "mainnet", chainId: SHADOWNET_CHAIN_ID } }, fixtures.receipt),
    /manifest network/,
  );
  assert.throws(
    () => validateAcceptedGnocchiProof({ ...fixtures.manifest, contracts: [{ address: "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy" }] }, fixtures.receipt),
    /exact accepted Gnocchi contract/,
  );
});

test("recovery state and mint plan are exact and reject all state drift", () => {
  const before = {
    level: 4_255_000,
    administrator: ADMIN,
    balances: { "0": 0, "1": 1 },
    totalSupplies: { "0": 4, "1": 4 },
  };
  const after = {
    level: 4_255_010,
    administrator: ADMIN,
    balances: { "0": 2, "1": 2 },
    totalSupplies: { "0": 6, "1": 5 },
  };
  assert.doesNotThrow(() => assertRavioliRecoveryState(before, "before"));
  assert.doesNotThrow(() => assertRavioliRecoveryState(after, "after"));
  assert.throws(() => assertRavioliRecoveryState({ ...before, balances: { "0": 1, "1": 1 } }, "before"), /token 0 balance/);
  assert.throws(() => assertRavioliRecoveryState({ ...after, totalSupplies: { "0": 6, "1": 6 } }, "after"), /token 1 total supply/);
  assert.deepEqual(ravioliRecoveryMintCalls(), [
    { contractAddress: CONTRACT, entrypoint: "mint", payload: { to_: ADMIN, token_id: 0, amount: 2 } },
    { contractAddress: CONTRACT, entrypoint: "mint", payload: { to_: ADMIN, token_id: 1, amount: 1 } },
  ]);
});

test("TzKT recovery acceptance requires exact applied hash, signer, target, payload, and consecutive counter", () => {
  const calls = ravioliRecoveryMintCalls();
  const row = {
    hash: MINT_ZERO,
    status: "applied",
    counter: "23831410",
    level: 4_255_006,
    timestamp: "2026-07-19T05:00:00Z",
    sender: { address: ADMIN },
    target: { address: CONTRACT },
    amount: 0,
    parameter: { entrypoint: "mint", value: calls[0].payload },
  };
  const accepted = validateRavioliRecoveryOperation([row], {
    operationHash: MINT_ZERO,
    expectedCounter: 23_831_410,
    call: calls[0],
  });
  assert.equal(accepted.counter, 23_831_410);
  assert.equal(accepted.level, 4_255_006);
  assert.equal(accepted.explorerUrl, `https://shadownet.tzkt.io/${MINT_ZERO}`);
  assert.throws(() => validateRavioliRecoveryOperation([{ ...row, status: "backtracked" }], {
    operationHash: MINT_ZERO, expectedCounter: 23_831_410, call: calls[0],
  }), /exact applied recovery operation/);
  assert.throws(() => validateRavioliRecoveryOperation([{ ...row, counter: "23831411" }], {
    operationHash: MINT_ZERO, expectedCounter: 23_831_410, call: calls[0],
  }), /counter/);
  assert.throws(() => validateRavioliRecoveryOperation([{ ...row, parameter: { entrypoint: "mint", value: { ...calls[0].payload, amount: 3 } } }], {
    operationHash: MINT_ZERO, expectedCounter: 23_831_410, call: calls[0],
  }), /payload/);
  assert.throws(() => validateRavioliRecoveryOperation([{ ...row, amount: 1 }], {
    operationHash: MINT_ZERO, expectedCounter: 23_831_410, call: calls[0],
  }), /unexpectedly transferred tez/);
});

test("canonical intent is immutable, exact, and sufficient to bind reconciliation estimates", () => {
  const intent = recoveryIntentFixture();
  assert.equal(validateRavioliRecoveryIntent(intent, acceptedEvidenceFixture()), intent);
  assert.throws(
    () => validateRavioliRecoveryIntent({
      ...intent,
      acceptedEvidence: { ...intent.acceptedEvidence, manifestSha256: "44".repeat(32) },
    }, acceptedEvidenceFixture()),
    /accepted-evidence drift/,
  );
  assert.throws(
    () => validateRavioliRecoveryIntent({
      ...intent,
      exactMintPlan: [intent.exactMintPlan[0], {
        ...intent.exactMintPlan[1],
        payload: { ...intent.exactMintPlan[1].payload, amount: 2 },
      }],
    }, acceptedEvidenceFixture()),
    /mint plan drift/,
  );
  const estimates = structuredClone(intent.estimates);
  estimates[0].sendOptions.fee += 1;
  assert.throws(
    () => validateRavioliRecoveryIntent({ ...intent, estimates }, acceptedEvidenceFixture()),
    /not bound to its exact send options/,
  );
});

test("reconciliation discovers the two exact applied mint operations and binds optional progress", () => {
  const operations = validateRavioliRecoveryOperationRows(recoveryOperationRowsFixture(), {
    beforeLevel: BEFORE.level,
    before: BEFORE,
    progress: recoveryProgressFixture(),
  });
  assert.deepEqual(operations.map(({ hash, counter, level }) => ({ hash, counter, level })), [
    { hash: MINT_ZERO, counter: 23_831_420, level: 4_259_629 },
    { hash: MINT_ONE, counter: 23_831_421, level: 4_259_631 },
  ]);
  assert.deepEqual(
    validateRavioliRecoveryOperationRows(recoveryOperationRowsFixture(), {
      beforeLevel: BEFORE.level,
      before: BEFORE,
    }).map((operation) => operation.hash),
    [MINT_ZERO, MINT_ONE],
    "progress is optional because TzKT plus the immutable intent remains authoritative",
  );
});

test("reconciliation rejects status, signer, payload, counter, candidate-set, and progress drift", () => {
  const input = { beforeLevel: BEFORE.level, before: BEFORE, progress: recoveryProgressFixture() };
  const withMutation = (mutate: (rows: any[]) => void) => {
    const rows = recoveryOperationRowsFixture();
    mutate(rows);
    return rows;
  };
  assert.throws(
    () => validateRavioliRecoveryOperationRows(withMutation((rows) => { rows[1].status = "backtracked"; }), input),
    /exact applied recovery operation/,
  );
  assert.throws(
    () => validateRavioliRecoveryOperationRows(withMutation((rows) => { rows[1].sender.address = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej"; }), input),
    /exactly the two recovery mint candidates/,
  );
  assert.throws(
    () => validateRavioliRecoveryOperationRows(withMutation((rows) => { rows[1].parameter.value.amount = "2"; }), input),
    /payload drift/,
  );
  assert.throws(
    () => validateRavioliRecoveryOperationRows(withMutation((rows) => { rows[1].counter = "23831422"; }), input),
    /counters must be consecutive/,
  );
  assert.throws(
    () => validateRavioliRecoveryOperationRows([...recoveryOperationRowsFixture(), recoveryOperationRowsFixture()[0]], input),
    /exactly the two recovery mint candidates/,
  );
  const progress = recoveryProgressFixture();
  progress.appliedOperations[0].hash = MINT_ONE;
  assert.throws(
    () => validateRavioliRecoveryOperationRows(recoveryOperationRowsFixture(), { ...input, progress }),
    /progress differs/,
  );
});

test("recovery receipt preserves immutable evidence hashes and before/after levels and links", () => {
  const beforeHashes = {
    manifestSha256: "11".repeat(32),
    receiptSha256: "22".repeat(32),
    historicalSnapshotSha256: "33".repeat(32),
  };
  assert.doesNotThrow(() => assertAcceptedEvidenceHashesUnchanged(beforeHashes, { ...beforeHashes }));
  assert.throws(() => assertAcceptedEvidenceHashesUnchanged(beforeHashes, { ...beforeHashes, manifestSha256: "44".repeat(32) }), /accepted Gnocchi manifest changed/);
  const calls = ravioliRecoveryMintCalls();
  const estimateProfile = { gasLimit: 10_000, storageLimit: 100, suggestedFeeMutez: 1_000, minimalFeeMutez: 900, burnFeeMutez: 250 };
  const receipt = buildRavioliRecoveryReceipt({
    startedAt: "2026-07-19T05:00:00.000Z",
    completedAt: "2026-07-19T05:01:00.000Z",
    rpcUrl: "https://tezos-shadownet.octez.io",
    acceptedEvidence: {
      ...validateAcceptedGnocchiProof(acceptedFixtures().manifest, acceptedFixtures().receipt),
      ...beforeHashes,
    },
    before: { level: 4_255_000, administrator: ADMIN, balances: { "0": 0, "1": 1 }, totalSupplies: { "0": 4, "1": 4 } },
    estimates: calls.map((call) => ({ call, ...estimateProfile, sendOptions: ravioliRecoverySendOptions(estimateProfile) })),
    operations: [
      { hash: MINT_ZERO, counter: 23_831_410, level: 4_255_006, timestamp: "2026-07-19T05:00:20Z", explorerUrl: `https://shadownet.tzkt.io/${MINT_ZERO}`, call: calls[0] },
      { hash: MINT_ONE, counter: 23_831_411, level: 4_255_007, timestamp: "2026-07-19T05:00:40Z", explorerUrl: `https://shadownet.tzkt.io/${MINT_ONE}`, call: calls[1] },
    ],
    after: { level: 4_255_010, administrator: ADMIN, balances: { "0": 2, "1": 2 }, totalSupplies: { "0": 6, "1": 5 } },
  });
  assert.equal(receipt.schema, "pastaprotocol-ravioli-dependency-recovery@1");
  assert.equal(receipt.before.level, 4_255_000);
  assert.equal(receipt.after.level, 4_255_010);
  assert.equal(receipt.operations.length, 2);
  assert.deepEqual(receipt.links.tokens, [
    `https://shadownet.tzkt.io/${CONTRACT}/tokens/0`,
    `https://shadownet.tzkt.io/${CONTRACT}/tokens/1`,
  ]);
  assert.doesNotThrow(() => validateRavioliRecoveryReceipt(receipt, beforeHashes));
  assert.throws(
    () => validateRavioliRecoveryReceipt({ ...receipt, acceptedEvidence: { ...receipt.acceptedEvidence, receiptSha256: "55".repeat(32) } }, beforeHashes),
    /accepted receipt hash drift/,
  );
  assert.throws(
    () => validateRavioliRecoveryReceipt({ ...receipt, operations: [receipt.operations[0], { ...receipt.operations[1], counter: receipt.operations[0].counter + 2 }] }, beforeHashes),
    /consecutive/,
  );
  assert.throws(
    () => validateRavioliRecoveryReceipt({
      ...receipt,
      estimates: [{
        ...receipt.estimates[0],
        sendOptions: { ...receipt.estimates[0].sendOptions, fee: receipt.estimates[0].sendOptions.fee + 1 },
      }, receipt.estimates[1]],
    }, beforeHashes),
    /not bound to its exact send options/,
  );
});

function reconciliationIoFixture(overrides: Partial<RavioliRecoveryReconciliationIo> = {}) {
  const fixtures = acceptedFixtures();
  const writes: Array<{ recoveryRoot: string; receipt: any }> = [];
  const io: RavioliRecoveryReconciliationIo = {
    loadAcceptedEvidence: async () => ({
      accepted: validateAcceptedGnocchiProof(fixtures.manifest, fixtures.receipt),
      hashes: HASHES,
      paths: { manifest: "/proof/gnocchi/manifest.json", receipt: "/proof/gnocchi/receipt.json", historicalSnapshot: "/proof/gnocchi/snapshot.json" },
    }),
    readIntent: async () => structuredClone(recoveryIntentFixture()),
    readProgress: async () => structuredClone(recoveryProgressFixture()),
    readOperationRows: async () => structuredClone(recoveryOperationRowsFixture()),
    readState: async () => structuredClone(AFTER),
    readLane: async () => ({ counter: 23_831_421, balanceMutez: 36_900_000, activeOperationCount: 0 }),
    rehashAcceptedEvidence: async () => HASHES,
    writeFinalReceipt: async (recoveryRoot, receipt) => {
      writes.push({ recoveryRoot, receipt: structuredClone(receipt) });
      return `${recoveryRoot}/artifacts/gnocchi-inventory-recovery.json`;
    },
    now: () => "2026-07-19T12:48:00.000Z",
    ...overrides,
  };
  for (const forbidden of ["session", "signer", "estimate", "pin"] as const) {
    Object.defineProperty(io, forbidden, {
      configurable: false,
      get() {
        throw new Error(`read-only reconciliation touched forbidden ${forbidden} capability`);
      },
    });
  }
  return { io, writes };
}

test("read-only reconciliation finalizes exact chain evidence with zero session, signer, estimate, or pin use", async () => {
  const { io, writes } = reconciliationIoFixture();
  const receipt = await runRavioliDependencyRecoveryReconciliation({
    environment: {
      PASTA_SHADOWNET_RAVIOLI_RECOVERY_RECONCILE: "1",
      TEZOS_NETWORK: "shadownet",
      PASTA_PROOF_RUN_DIR: `/tmp/${RUN_ID}`,
    },
    io,
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].recoveryRoot, `/tmp/${RUN_ID}/ravioli-dependency-recovery`);
  assert.deepEqual(receipt.operations.map((operation: any) => [operation.hash, operation.counter]), [
    [MINT_ZERO, 23_831_420],
    [MINT_ONE, 23_831_421],
  ]);
  assert.deepEqual(receipt.after, AFTER);
  assert.doesNotMatch(runRavioliDependencyRecoveryReconciliation.toString(), /Taquito|loadSignerSet|buildToolkit|estimate_call|pinJson|\.send\(/);
});

test("read-only reconciliation writes no receipt on evidence, counter, mempool, or state drift", async () => {
  const cases: Array<[string, Partial<RavioliRecoveryReconciliationIo>, RegExp]> = [
    ["accepted hash", { rehashAcceptedEvidence: async () => ({ ...HASHES, manifestSha256: "44".repeat(32) }) }, /manifest changed/],
    ["counter", { readLane: async (rpcUrl) => ({ counter: rpcUrl.includes("octez") ? 23_831_420 : 23_831_421, balanceMutez: 1, activeOperationCount: 0 }) }, /does not terminate/],
    ["mempool", { readLane: async () => ({ counter: 23_831_421, balanceMutez: 1, activeOperationCount: 1 as 0 }) }, /mempool is not clear/],
    ["post-state", { readState: async () => ({ ...AFTER, balances: { "0": 1, "1": 2 } }) }, /after token 0 balance drift/],
    ["operation payload", {
      readOperationRows: async () => {
        const rows = recoveryOperationRowsFixture();
        rows[1].parameter.value.amount = "2";
        return rows;
      },
    }, /payload drift/],
  ];
  for (const [label, overrides, expected] of cases) {
    const { io, writes } = reconciliationIoFixture(overrides);
    await assert.rejects(
      runRavioliDependencyRecoveryReconciliation({
        environment: {
          PASTA_SHADOWNET_RAVIOLI_RECOVERY_RECONCILE: "1",
          TEZOS_NETWORK: "shadownet",
          PASTA_PROOF_RUN_DIR: `/tmp/${RUN_ID}`,
        },
        io,
      }),
      expected,
      label,
    );
    assert.equal(writes.length, 0, `${label} drift must not create a final receipt`);
  }
});

test("two explicit estimates become bounded send options and send cannot invoke an automatic third estimate", async () => {
  const calls = ravioliRecoveryMintCalls();
  const profiles = [
    { gasLimit: 4_208, storageLimit: 87, suggestedFeeMutez: 753, minimalFeeMutez: 733, burnFeeMutez: 21_750 },
    { gasLimit: 4_438, storageLimit: 0, suggestedFeeMutez: 776, minimalFeeMutez: 756, burnFeeMutez: 0 },
  ];
  assert.deepEqual(ravioliRecoverySendOptions(profiles[0]), {
    amount: 0,
    mutez: true,
    fee: 853,
    gasLimit: 4_208,
    storageLimit: 87,
  });

  const estimatorInputs: any[] = [];
  const submitted: any[] = [];
  const operationHashes = [MINT_ZERO, MINT_ONE];
  const tezos: any = {
    tz: { getBalance: async () => ({ toString: () => "36926547" }) },
    estimate: {
      transfer: async (params: any) => {
        if (estimatorInputs.length >= profiles.length) {
          throw new Error("automatic send-time estimate is prohibited");
        }
        estimatorInputs.push(structuredClone(params));
        return profiles[estimatorInputs.length - 1];
      },
    },
    contract: {
      at: async (contractAddress: string) => ({
        methodsObject: {
          mint: (payload: any) => ({
            toTransferParams: (sendOptions: any = {}) => ({ contractAddress, entrypoint: "mint", payload, sendOptions }),
            send: async (sendOptions: any = {}) => {
              if (sendOptions.fee === undefined || sendOptions.gasLimit === undefined || sendOptions.storageLimit === undefined) {
                await tezos.estimate.transfer({ contractAddress, entrypoint: "mint", payload, sendOptions });
              }
              submitted.push({ contractAddress, entrypoint: "mint", payload: structuredClone(payload), sendOptions: structuredClone(sendOptions) });
              const hash = operationHashes[submitted.length - 1];
              return { hash, confirmation: async () => 1 };
            },
          }),
        },
      }),
    },
  };
  const validatedCalls: any[] = [];
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: ADMIN,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["mint"]),
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
    pinJson: async () => { throw new Error("pinning is prohibited"); },
    validateCall: (call) => validatedCalls.push(structuredClone(call)),
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 36_926_547,
    requiredBalanceMutez: 2_000_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 2_000_000,
  });
  let beforeSubmit = false;
  const estimates = await executeRavioliRecoveryCallPlan({
    session,
    beforeSubmit: async (acceptedEstimates) => {
      beforeSubmit = true;
      assert.equal(acceptedEstimates.length, 2);
      assert.deepEqual(acceptedEstimates.map((entry) => entry.call), calls);
      assert.deepEqual(acceptedEstimates.map((entry) => entry.sendOptions.fee), [853, 876]);
      assert.equal(submitted.length, 0, "both estimates must finish before the first submission");
    },
  });
  assert.equal(beforeSubmit, true);
  assert.equal(estimatorInputs.length, 2, "only the two authorized estimate_call requests may reach the estimator");
  assert.deepEqual(estimatorInputs.map((entry) => entry.payload), calls.map((call) => call.payload));
  assert.deepEqual(submitted.map(({ contractAddress, entrypoint, payload }) => ({ contractAddress, entrypoint, payload })), calls);
  assert.deepEqual(submitted.map((entry) => entry.sendOptions), estimates.map((entry) => entry.sendOptions));
  assert.deepEqual(validatedCalls, calls, "the bridge validates only the two live calls; estimates are bound separately");
});

test("production recovery source uses guarded estimate-before-call flow and cannot pin or broaden targets", async () => {
  const source = await readFile(new URL("./shadownet-ravioli-dependency-recovery.ts", import.meta.url), "utf8");
  assert.match(source, /PASTA_SHADOWNET_RAVIOLI_RECOVERY_EXECUTE/);
  assert.match(source, /new TaquitoPastaUiLiveSession/);
  assert.match(source, /allowedContractAddresses: new Set\(\[EXPECTED_GNOCCHI_CONTRACT\]\)/);
  assert.match(source, /allowedEntrypoints: new Set\(\["mint"\]\)/);
  assert.match(source, /const validationPlan = calls/);
  assert.match(source, /ravioliRecoverySendOptions/);
  assert.match(source, /await pollRavioliRecoveryState\("after"\)/);
  assert.ok(source.indexOf('"estimate_call"') < source.indexOf("await input.beforeSubmit(estimates)"));
  assert.ok(source.indexOf("await input.beforeSubmit(estimates)") < source.indexOf("`recovery-call-${index}`"));
  assert.match(source, /pinJson: async \(\) => \{ throw new Error\("Ravioli recovery cannot pin"\); \}/);
  assert.match(source, /ravioli-dependency-recovery/);
  assert.match(source, /assertAcceptedEvidenceHashesUnchanged/);
  assert.doesNotMatch(source, /pinIpfs|pinJsonProof|pinBlob/);
  assert.match(source, /PASTA_SHADOWNET_RAVIOLI_RECOVERY_RECONCILE/);
  assert.match(source, /runRavioliDependencyRecoveryReconciliation/);
  const readOnlyDefaults = source.slice(
    source.indexOf("const DEFAULT_RECONCILIATION_IO"),
    source.indexOf("function request("),
  );
  assert.doesNotMatch(readOnlyDefaults, /TaquitoPastaUiLiveSession|loadSignerSet|buildToolkit|estimate_call|pinJson|\.send\(/);
});
