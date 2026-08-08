import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RAVIOLI_PREPACK_GNOCCHI_PROTECTED_BIG_MAPS,
  RAVIOLI_PREPACK_NON_TARGET_OPERATORS,
  RAVIOLI_PREPACK_RECOVERY_CREATOR,
  RAVIOLI_PREPACK_RECOVERY_DIRECTORY,
  RAVIOLI_PREPACK_RECOVERY_EXECUTE_FLAG,
  RAVIOLI_PREPACK_RECOVERY_GNOCCHI,
  RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_COUNTER,
  RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_HASH,
  RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_LEVEL,
  RAVIOLI_PREPACK_RECOVERY_OPERATION_COUNTER,
  RAVIOLI_PREPACK_RECOVERY_ORIGINATION_COUNTER,
  RAVIOLI_PREPACK_RECOVERY_ORIGINATION_HASH,
  RAVIOLI_PREPACK_RECOVERY_ORIGINATION_LEVEL,
  RAVIOLI_PREPACK_RECOVERY_RECONCILE_FLAG,
  RAVIOLI_PREPACK_RECOVERY_ROUTER,
  RAVIOLI_PREPACK_RECOVERY_RUN_ID,
  RAVIOLI_PREPACK_ROUTER_BIG_MAPS,
  assertRavioliPrepackRecoveryExecutionAllowed,
  assertRavioliPrepackRecoveryPreSubmitUnchanged,
  assertRavioliPrepackRecoveryReconciliationAllowed,
  assertRavioliPrepackRecoveryState,
  assertRavioliPrepackRecoveryTransition,
  buildRavioliPrepackRecoveryIntent,
  buildRavioliPrepackRecoveryPreflight,
  buildRavioliPrepackRecoveryReceipt,
  executeRavioliPrepackRecoveryCall,
  ravioliPrepackRecoveryCall,
  ravioliPrepackRecoverySendOptions,
  runRavioliPrepackRecoveryReconciliation,
  validateRavioliPrepackCauseOperations,
  validateRavioliPrepackRecoveryIntent,
  validateRavioliPrepackRecoveryOperation,
  validateRavioliPrepackRecoveryPreflight,
  validateRavioliPrepackRecoveryProgress,
  validateRavioliPrepackRecoveryReceipt,
  type RavioliPrepackCauseEvidence,
  type RavioliPrepackLaneSnapshot,
  type RavioliPrepackRecoveryEstimate,
  type RavioliPrepackRecoveryOperation,
  type RavioliPrepackRecoveryReconciliationIo,
  type RavioliPrepackRecoveryState,
} from "./shadownet-ravioli-prepack-recovery";
import {
  deterministicJsonBytes,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
} from "./shadownet-proof-kit";

const RECOVERY_HASH = "ooS483ZAHMoykvnoqvqNjpkpKgbTbYiYUv4Ty8dmAwQeSE4biW8";
const OPERATION_LEVEL = 4_307_889;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function originRows(): any[] {
  return [{
    hash: RAVIOLI_PREPACK_RECOVERY_ORIGINATION_HASH,
    status: "applied",
    counter: String(RAVIOLI_PREPACK_RECOVERY_ORIGINATION_COUNTER),
    level: RAVIOLI_PREPACK_RECOVERY_ORIGINATION_LEVEL,
    timestamp: "2026-07-22T21:25:12Z",
    sender: { address: RAVIOLI_PREPACK_RECOVERY_CREATOR },
    originatedContract: {
      address: RAVIOLI_PREPACK_RECOVERY_ROUTER,
      kind: "asset",
      typeHash: -67_338_764,
      codeHash: -843_707_541,
      tzips: ["fa2"],
    },
  }];
}

function operatorAddRows(): any[] {
  return [{
    hash: RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_HASH,
    status: "applied",
    counter: String(RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_COUNTER),
    level: RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_LEVEL,
    timestamp: "2026-07-22T21:25:24Z",
    sender: { address: RAVIOLI_PREPACK_RECOVERY_CREATOR },
    target: { address: RAVIOLI_PREPACK_RECOVERY_GNOCCHI },
    amount: 0,
    parameter: {
      entrypoint: "update_operators",
      value: [{ add_operator: {
        owner: RAVIOLI_PREPACK_RECOVERY_CREATOR,
        operator: RAVIOLI_PREPACK_RECOVERY_ROUTER,
        token_id: "0",
      } }],
    },
    hasInternals: false,
  }];
}

function causeFixture(): RavioliPrepackCauseEvidence {
  return validateRavioliPrepackCauseOperations(originRows(), operatorAddRows());
}

function stateFixture(phase: "before" | "after" = "before"): RavioliPrepackRecoveryState {
  return {
    level: phase === "before" ? 4_307_885 : 4_307_892,
    router: {
      address: RAVIOLI_PREPACK_RECOVERY_ROUTER,
      kind: "asset",
      tzips: ["fa2"],
      typeHash: -67_338_764,
      codeHash: -843_707_541,
      creator: RAVIOLI_PREPACK_RECOVERY_CREATOR,
      administrator: RAVIOLI_PREPACK_RECOVERY_CREATOR,
      pendingAdministrator: null,
      nextTokenId: 0,
      indexFacts: {
        numTransactions: 0,
        tokensCount: 0,
        activeTokensCount: 0,
        tokenBalancesCount: 0,
        tokenTransfersCount: 0,
      },
      bigMaps: structuredClone(RAVIOLI_PREPACK_ROUTER_BIG_MAPS),
    },
    gnocchi: {
      address: RAVIOLI_PREPACK_RECOVERY_GNOCCHI,
      kind: "asset",
      tzips: ["fa2"],
      typeHash: -878_131_369,
      codeHash: -1_402_518_412,
      creator: RAVIOLI_PREPACK_RECOVERY_CREATOR,
      administrator: RAVIOLI_PREPACK_RECOVERY_CREATOR,
      pendingAdministrator: null,
      nextTokenId: 4,
      operatorBigMapId: 28_738,
      targetOperator: {
        active: phase === "before",
        hash: "expruX91U9dQiFwxHYddhYS6xWCLy8Gs1fZNBGaQWyfg3LQjfw3No4",
        key: {
          owner: RAVIOLI_PREPACK_RECOVERY_CREATOR,
          operator: RAVIOLI_PREPACK_RECOVERY_ROUTER,
          tokenId: 0,
        },
        firstLevel: RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_LEVEL,
        lastLevel: phase === "before" ? RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_LEVEL : OPERATION_LEVEL,
        updates: phase === "before" ? 1 : 2,
      },
      nonTargetOperators: [...structuredClone(RAVIOLI_PREPACK_NON_TARGET_OPERATORS)],
      protectedBigMaps: structuredClone(RAVIOLI_PREPACK_GNOCCHI_PROTECTED_BIG_MAPS),
    },
  };
}

function lane(counter: number, which: "primary" | "fallback"): RavioliPrepackLaneSnapshot {
  return {
    rpcUrl: which === "primary" ? SHADOWNET_RPC_PRIMARY : SHADOWNET_RPC_FALLBACK,
    counter,
    balanceMutez: 32_000_000,
    headLevel: 4_307_900,
    activeOperationCount: 0,
  };
}

function estimateFixture(): RavioliPrepackRecoveryEstimate {
  const raw = {
    gasLimit: 1_100,
    storageLimit: 0,
    suggestedFeeMutez: 500,
    minimalFeeMutez: 450,
    burnFeeMutez: 0,
  };
  return {
    call: ravioliPrepackRecoveryCall(),
    ...raw,
    sendOptions: ravioliPrepackRecoverySendOptions(raw),
  };
}

function operationRows(overrides: Record<string, unknown> = {}): any[] {
  return [{
    hash: RECOVERY_HASH,
    status: "applied",
    counter: String(RAVIOLI_PREPACK_RECOVERY_OPERATION_COUNTER),
    level: OPERATION_LEVEL,
    timestamp: "2026-07-22T21:27:12Z",
    sender: { address: RAVIOLI_PREPACK_RECOVERY_CREATOR },
    target: { address: RAVIOLI_PREPACK_RECOVERY_GNOCCHI },
    amount: 0,
    parameter: {
      entrypoint: "update_operators",
      value: ravioliPrepackRecoveryCall().payload,
    },
    hasInternals: false,
    ...overrides,
  }];
}

function operationFixture(): RavioliPrepackRecoveryOperation {
  return validateRavioliPrepackRecoveryOperation(operationRows(), RECOVERY_HASH);
}

function preflightFixture(): any {
  return buildRavioliPrepackRecoveryPreflight({
    createdAt: "2026-07-22T21:26:00.000Z",
    rpcUrl: SHADOWNET_RPC_PRIMARY,
    cause: causeFixture(),
    before: stateFixture("before"),
    lanes: {
      primary: lane(RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_COUNTER, "primary"),
      fallback: lane(RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_COUNTER, "fallback"),
    },
  });
}

function artifact(value: any): { value: any; bytes: Uint8Array; sha256: string } {
  const bytes = deterministicJsonBytes(value);
  return { value, bytes, sha256: digest(bytes) };
}

function intentFixture(preflightArtifact = artifact(preflightFixture())): any {
  return buildRavioliPrepackRecoveryIntent({
    createdAt: "2026-07-22T21:27:00.000Z",
    rpcUrl: SHADOWNET_RPC_PRIMARY,
    preflightSha256: preflightArtifact.sha256,
    before: preflightArtifact.value.before,
    preSubmit: { ...stateFixture("before"), level: 4_307_887 },
    lanes: {
      primary: lane(RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_COUNTER, "primary"),
      fallback: lane(RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_COUNTER, "fallback"),
    },
    estimate: estimateFixture(),
  });
}

test("execution and reconciliation require explicit mutually exclusive exact-run gates", () => {
  const runRoot = `/tmp/${RAVIOLI_PREPACK_RECOVERY_RUN_ID}`;
  assert.equal(assertRavioliPrepackRecoveryExecutionAllowed({
    [RAVIOLI_PREPACK_RECOVERY_EXECUTE_FLAG]: "1",
    TEZOS_NETWORK: "shadownet",
    PASTA_PROOF_RUN_DIR: runRoot,
  }), runRoot);
  assert.equal(assertRavioliPrepackRecoveryReconciliationAllowed({
    [RAVIOLI_PREPACK_RECOVERY_RECONCILE_FLAG]: "1",
    TEZOS_NETWORK: "shadownet",
    PASTA_PROOF_RUN_DIR: runRoot,
  }), runRoot);
  assert.throws(() => assertRavioliPrepackRecoveryExecutionAllowed({
    PASTA_PROOF_RUN_DIR: runRoot,
  }), /explicit/);
  assert.throws(() => assertRavioliPrepackRecoveryExecutionAllowed({
    [RAVIOLI_PREPACK_RECOVERY_EXECUTE_FLAG]: "1",
    [RAVIOLI_PREPACK_RECOVERY_RECONCILE_FLAG]: "1",
    PASTA_PROOF_RUN_DIR: runRoot,
  }), /forbids/);
  assert.throws(() => assertRavioliPrepackRecoveryReconciliationAllowed({
    [RAVIOLI_PREPACK_RECOVERY_RECONCILE_FLAG]: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/wrong-run",
  }), /exact accepted run/);
});

test("partial-attempt evidence is bound to the exact origination and exact add_operator operation", () => {
  const evidence = causeFixture();
  assert.equal(evidence.origination.hash, RAVIOLI_PREPACK_RECOVERY_ORIGINATION_HASH);
  assert.equal(evidence.origination.counter, RAVIOLI_PREPACK_RECOVERY_ORIGINATION_COUNTER);
  assert.equal(evidence.operatorAddition.hash, RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_HASH);
  assert.equal(evidence.operatorAddition.counter, RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_COUNTER);
  const changedPayload = operatorAddRows();
  changedPayload[0].parameter.value[0].add_operator.token_id = "1";
  assert.throws(() => validateRavioliPrepackCauseOperations(originRows(), changedPayload), /payload drift/);
  assert.throws(() => validateRavioliPrepackCauseOperations([
    { ...originRows()[0], originatedContract: { ...originRows()[0].originatedContract, codeHash: 1 } },
  ], operatorAddRows()), /Expected values to be strictly equal/);
});

test("state gate proves an empty router, exact protected maps, and only the target operator phase change", () => {
  const before = stateFixture("before");
  const after = stateFixture("after");
  const operation = operationFixture();
  assert.doesNotThrow(() => assertRavioliPrepackRecoveryState(before, "before"));
  assert.doesNotThrow(() => assertRavioliPrepackRecoveryState(after, "after"));
  assert.doesNotThrow(() => assertRavioliPrepackRecoveryPreSubmitUnchanged(before, { ...before, level: before.level + 1 }));
  assert.doesNotThrow(() => assertRavioliPrepackRecoveryTransition(before, after, operation));

  const packDrift = structuredClone(before);
  packDrift.router.bigMaps.packs.activeKeyCount = 1;
  assert.throws(() => assertRavioliPrepackRecoveryState(packDrift, "before"), /packs active-key count drift/);
  const protectedDrift = structuredClone(after);
  protectedDrift.gnocchi.protectedBigMaps.ledger.sha256 = "00".repeat(32);
  assert.throws(() => assertRavioliPrepackRecoveryState(protectedDrift, "after"), /ledger state fingerprint drift/);
  const unrelatedOperatorDrift = structuredClone(after);
  unrelatedOperatorDrift.gnocchi.nonTargetOperators.pop();
  assert.throws(() => assertRavioliPrepackRecoveryState(unrelatedOperatorDrift, "after"), /unrelated Gnocchi operators drift/);
  const wrongTombstone = structuredClone(after);
  wrongTombstone.gnocchi.targetOperator.lastLevel += 1;
  assert.throws(() => assertRavioliPrepackRecoveryTransition(before, wrongTombstone, operation), /does not bind/);
});

test("the sole authorized call removes the exact token-0 key and estimate options prevent automatic re-estimation", async () => {
  assert.deepEqual(ravioliPrepackRecoveryCall(), {
    contractAddress: RAVIOLI_PREPACK_RECOVERY_GNOCCHI,
    entrypoint: "update_operators",
    payload: [{ remove_operator: {
      owner: RAVIOLI_PREPACK_RECOVERY_CREATOR,
      operator: RAVIOLI_PREPACK_RECOVERY_ROUTER,
      token_id: 0,
    } }],
  });
  assert.deepEqual(ravioliPrepackRecoverySendOptions({
    gasLimit: 1_100,
    storageLimit: 0,
    suggestedFeeMutez: 500,
    minimalFeeMutez: 450,
  }), { amount: 0, mutez: true, fee: 600, gasLimit: 1_100, storageLimit: 0 });

  const requests: any[] = [];
  let intentPersisted = false;
  const session = {
    handle: async (request: any) => {
      requests.push(structuredClone(request));
      if (request.action === "estimate_call") {
        assert.equal(intentPersisted, false);
        return {
          contractAddress: RAVIOLI_PREPACK_RECOVERY_GNOCCHI,
          entrypoint: "update_operators",
          estimate: {
            gasLimit: 1_100,
            storageLimit: 0,
            suggestedFeeMutez: 500,
            minimalFeeMutez: 450,
            burnFeeMutez: 0,
          },
        };
      }
      assert.equal(intentPersisted, true, "call reached submission before intent persistence");
      return { operationHash: RECOVERY_HASH };
    },
  };
  const estimate = await executeRavioliPrepackRecoveryCall({
    session,
    beforeSubmit: async (accepted) => {
      assert.equal(requests.length, 1);
      assert.deepEqual(accepted.call, ravioliPrepackRecoveryCall());
      intentPersisted = true;
    },
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((request) => request.action), ["estimate_call", "call"]);
  assert.deepEqual(requests[1].payload.sendOptions, estimate.sendOptions);
  assert.deepEqual(requests[1].payload.call, ravioliPrepackRecoveryCall());
});

test("TzKT operation acceptance requires counter 23831479, exact remove payload, zero tez, and no internals", () => {
  const operation = operationFixture();
  assert.equal(operation.counter, RAVIOLI_PREPACK_RECOVERY_OPERATION_COUNTER);
  assert.equal(operation.level, OPERATION_LEVEL);
  assert.equal(operation.explorerUrl, `https://shadownet.tzkt.io/${RECOVERY_HASH}`);
  assert.throws(() => validateRavioliPrepackRecoveryOperation(operationRows({ status: "backtracked" }), RECOVERY_HASH), /exact applied/);
  assert.throws(() => validateRavioliPrepackRecoveryOperation(operationRows({ counter: "23831480" }), RECOVERY_HASH), /exact applied/);
  assert.throws(() => validateRavioliPrepackRecoveryOperation(operationRows({ amount: 1 }), RECOVERY_HASH), /transferred tez/);
  assert.throws(() => validateRavioliPrepackRecoveryOperation(operationRows({ hasInternals: true }), RECOVERY_HASH), /internal/);
  const payloadDrift = operationRows();
  payloadDrift[0].parameter.value[0].remove_operator.token_id = "1";
  assert.throws(() => validateRavioliPrepackRecoveryOperation(payloadDrift, RECOVERY_HASH), /one-key removal plan/);
});

test("durable preflight, intent, progress, and receipt cross-bind every state boundary", () => {
  const preflight = preflightFixture();
  const preflightArtifact = artifact(preflight);
  const intent = intentFixture(preflightArtifact);
  const intentArtifact = artifact(intent);
  const operation = operationFixture();
  assert.equal(validateRavioliPrepackRecoveryPreflight(preflight), preflight);
  assert.equal(validateRavioliPrepackRecoveryIntent(intent, preflight, preflightArtifact.sha256), intent);
  assert.doesNotThrow(() => validateRavioliPrepackRecoveryProgress({
    schema: "pastaprotocol-ravioli-prepack-recovery-progress@1",
    status: "APPLIED",
    preflightSha256: preflightArtifact.sha256,
    intentSha256: intentArtifact.sha256,
    operation,
  }, preflightArtifact.sha256, intentArtifact.sha256, operation));
  const receipt = buildRavioliPrepackRecoveryReceipt({
    completedAt: "2026-07-22T21:28:00.000Z",
    preflight,
    preflightSha256: preflightArtifact.sha256,
    intent,
    intentSha256: intentArtifact.sha256,
    operation,
    after: stateFixture("after"),
    lanesAfter: {
      primary: lane(RAVIOLI_PREPACK_RECOVERY_OPERATION_COUNTER, "primary"),
      fallback: lane(RAVIOLI_PREPACK_RECOVERY_OPERATION_COUNTER, "fallback"),
    },
  });
  assert.doesNotThrow(() => validateRavioliPrepackRecoveryReceipt(
    receipt,
    preflight,
    preflightArtifact.sha256,
    intent,
    intentArtifact.sha256,
  ));
  assert.equal(receipt.invariants.callCount, 1);
  assert.equal(receipt.invariants.orphanRouterPackCount, 0);
  assert.throws(() => validateRavioliPrepackRecoveryIntent(
    { ...intent, preflightSha256: "00".repeat(32) },
    preflight,
    preflightArtifact.sha256,
  ), /preflight SHA-256 drift/);
  assert.throws(() => validateRavioliPrepackRecoveryReceipt(
    { ...receipt, intentSha256: "00".repeat(32) },
    preflight,
    preflightArtifact.sha256,
    intent,
    intentArtifact.sha256,
  ), /intent SHA-256 drift/);
});

function reconciliationFixture(overrides: Partial<RavioliPrepackRecoveryReconciliationIo> = {}) {
  const preflight = preflightFixture();
  const preflightArtifact = artifact(preflight);
  const intent = intentFixture(preflightArtifact);
  const intentArtifact = artifact(intent);
  const operation = operationFixture();
  const writes: Array<{ root: string; receipt: any }> = [];
  const io: RavioliPrepackRecoveryReconciliationIo = {
    readPreflight: async () => structuredClone(preflightArtifact),
    readIntent: async () => structuredClone(intentArtifact),
    readProgress: async () => ({
      schema: "pastaprotocol-ravioli-prepack-recovery-progress@1",
      status: "APPLIED",
      preflightSha256: preflightArtifact.sha256,
      intentSha256: intentArtifact.sha256,
      operation,
    }),
    readCauseOperations: async () => causeFixture(),
    readOperationRows: async () => operationRows(),
    readState: async () => stateFixture("after"),
    readLane: async (rpcUrl) => lane(
      RAVIOLI_PREPACK_RECOVERY_OPERATION_COUNTER,
      rpcUrl.includes("octez") ? "primary" : "fallback",
    ),
    writeReceipt: async (root, receipt) => {
      writes.push({ root, receipt: structuredClone(receipt) });
      return `${root}/artifacts/ravioli-prepack-recovery.json`;
    },
    now: () => "2026-07-22T21:28:00.000Z",
    ...overrides,
  };
  for (const forbidden of ["signer", "session", "estimate", "pin"] as const) {
    Object.defineProperty(io, forbidden, {
      configurable: false,
      get() {
        throw new Error(`read-only reconciliation touched forbidden ${forbidden}`);
      },
    });
  }
  return { io, writes };
}

test("read-only reconciliation produces the terminal receipt without signer, session, estimate, pin, or resubmission", async () => {
  const { io, writes } = reconciliationFixture();
  const receipt = await runRavioliPrepackRecoveryReconciliation({
    environment: {
      [RAVIOLI_PREPACK_RECOVERY_RECONCILE_FLAG]: "1",
      TEZOS_NETWORK: "shadownet",
      PASTA_PROOF_RUN_DIR: `/tmp/${RAVIOLI_PREPACK_RECOVERY_RUN_ID}`,
    },
    io,
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].root, `/tmp/${RAVIOLI_PREPACK_RECOVERY_RUN_ID}/${RAVIOLI_PREPACK_RECOVERY_DIRECTORY}`);
  assert.equal(receipt.operation.hash, RECOVERY_HASH);
  assert.equal(receipt.lanes.after.primary.counter, RAVIOLI_PREPACK_RECOVERY_OPERATION_COUNTER);
  assert.doesNotMatch(runRavioliPrepackRecoveryReconciliation.toString(), /loadSignerSet|buildToolkit|TaquitoPastaUiLiveSession|estimate_call|\.send\(/);
});

test("reconciliation suppresses the receipt on evidence, payload, state, counter, mempool, or progress drift", async () => {
  const cases: Array<[string, Partial<RavioliPrepackRecoveryReconciliationIo>, RegExp]> = [
    ["cause", { readCauseOperations: async () => ({ ...causeFixture(), operatorAddition: { ...causeFixture().operatorAddition, hash: RAVIOLI_PREPACK_RECOVERY_ORIGINATION_HASH as any } }) }, /operation evidence changed/],
    ["payload", { readOperationRows: async () => {
      const rows = operationRows();
      rows[0].parameter.value[0].remove_operator.token_id = "1";
      return rows;
    } }, /one-key removal plan/],
    ["router", { readState: async () => {
      const state = stateFixture("after");
      state.router.bigMaps.packs.activeKeyCount = 1;
      return state;
    } }, /packs active-key count drift/],
    ["counter", { readLane: async (rpcUrl) => lane(
      rpcUrl.includes("octez") ? RAVIOLI_PREPACK_RECOVERY_OPERATOR_ADD_COUNTER : RAVIOLI_PREPACK_RECOVERY_OPERATION_COUNTER,
      rpcUrl.includes("octez") ? "primary" : "fallback",
    ) }, /counter drift/],
    ["mempool", { readLane: async (rpcUrl) => ({
      ...lane(RAVIOLI_PREPACK_RECOVERY_OPERATION_COUNTER, rpcUrl.includes("octez") ? "primary" : "fallback"),
      activeOperationCount: 1 as 0,
    }) }, /mempool is not clear/],
    ["progress", { readProgress: async () => ({
      schema: "pastaprotocol-ravioli-prepack-recovery-progress@1",
      status: "APPLIED",
      preflightSha256: "00".repeat(32),
      intentSha256: "11".repeat(32),
      operation: operationFixture(),
    }) }, /progress preflight SHA-256 drift/],
  ];
  for (const [label, overrides, expected] of cases) {
    const { io, writes } = reconciliationFixture(overrides);
    await assert.rejects(runRavioliPrepackRecoveryReconciliation({
      environment: {
        [RAVIOLI_PREPACK_RECOVERY_RECONCILE_FLAG]: "1",
        TEZOS_NETWORK: "shadownet",
        PASTA_PROOF_RUN_DIR: `/tmp/${RAVIOLI_PREPACK_RECOVERY_RUN_ID}`,
      },
      io,
    }), expected, label);
    assert.equal(writes.length, 0, `${label} drift wrote a receipt`);
  }
});

test("production source keeps the signer lane to one exact update_operators removal and a signer-free reconciler", async () => {
  const source = await readFile(new URL("./shadownet-ravioli-prepack-recovery.ts", import.meta.url), "utf8");
  assert.match(source, /allowedContractAddresses: new Set\(\[RAVIOLI_PREPACK_RECOVERY_GNOCCHI\]\)/);
  assert.match(source, /allowedEntrypoints: new Set\(\["update_operators"\]\)/);
  assert.match(source, /remove_operator/);
  assert.match(source, /assert\.equal\(validatedCalls, 0, "pre-pack recovery refuses a second call"\)/);
  assert.match(source, /recovery-preflight\.json/);
  assert.match(source, /recovery-intent\.json/);
  assert.match(source, /recovery-progress\.json/);
  assert.match(source, /ravioli-prepack-recovery\.json/);
  assert.match(source, /pre-pack recovery cannot pin/);
  assert.match(source, /pre-pack recovery cannot originate/);
  const reconciliation = source.slice(
    source.indexOf("export async function runRavioliPrepackRecoveryReconciliation"),
    source.indexOf("export async function runRavioliPrepackRecovery()"),
  );
  assert.doesNotMatch(reconciliation, /loadSignerSet|buildToolkit|TaquitoPastaUiLiveSession|estimate_call|\.send\(/);
});
