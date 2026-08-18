import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertGnocchiTerminalRecoveryAllowed,
  assertGnocchiTerminalSnapshotUnchanged,
  createGnocchiTerminalReadOnlyBridgeHandler,
  GNOCCHI_TERMINAL_RECOVERY_CONTRACT,
  GNOCCHI_TERMINAL_RECOVERY_EXECUTE_FLAG,
  GNOCCHI_TERMINAL_RECOVERY_OUTPUT_ENV,
  GNOCCHI_TERMINAL_RECOVERY_RUN_ID,
  GNOCCHI_TERMINAL_OPERATION_PLAN,
  isGnocchiTerminalPrefixFile,
  validateGnocchiTerminalOperationGraph,
} from "./shadownet-gnocchi-terminal-readonly-recovery";

function operationFixture() {
  const [origin, ...transactions] = GNOCCHI_TERMINAL_OPERATION_PLAN;
  return {
    originations: [{
      hash: origin.hash,
      status: "applied",
      level: origin.level,
      counter: origin.counter,
      timestamp: origin.timestamp,
      sender: { address: origin.sender },
      originatedContract: { address: GNOCCHI_TERMINAL_RECOVERY_CONTRACT },
    }],
    transactions: transactions.map((operation) => ({
      hash: operation.hash,
      status: "applied",
      level: operation.level,
      counter: operation.counter,
      timestamp: operation.timestamp,
      sender: { address: operation.sender },
      target: { address: GNOCCHI_TERMINAL_RECOVERY_CONTRACT },
      amount: operation.amount,
      parameter: {
        entrypoint: operation.entrypoint,
        value: operation.entrypoint === "open_mint"
          ? { token_id: String(operation.tokenId), amount: "1" }
          : operation.entrypoint === "set_sale_active"
            ? { token_id: "1", active: operation.active }
            : {
              creator_reserve: String(operation.creatorReserve),
              lock_policy: true,
              token_info: {
                "": Buffer.from(String(operation.metadataUri), "utf8").toString("hex"),
              },
              sale: {
                active: true,
                treasury: GNOCCHI_TERMINAL_OPERATION_PLAN[0].sender,
                base_price: "1",
                increment: "0",
                step_size: "1",
                min_price: null,
                max_price: null,
                start: operation.tokenId === 1 ? null : "2026-08-08T18:09:00Z",
                end: operation.tokenId === 1 ? null : "9999-12-31T23:58:00Z",
                max_supply: operation.tokenId === 2 ? "4" : null,
              },
            },
      },
    })),
  };
}

function immutableSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    operationGraphSha256: "1".repeat(64),
    contractStateSha256: "2".repeat(64),
    scriptSha256: "3".repeat(64),
    supplies: [4, 4, 3],
    actorCounters: { creator: 100, collectorOne: 200, collectorTwo: 300 },
    actorPendingOperations: [],
    ...overrides,
  };
}

test("terminal Gnocchi recovery is gated to the one incomplete Shadownet run", () => {
  const exactRoot = `/tmp/${GNOCCHI_TERMINAL_RECOVERY_RUN_ID}`;
  assert.equal(assertGnocchiTerminalRecoveryAllowed({
    [GNOCCHI_TERMINAL_RECOVERY_EXECUTE_FLAG]: "1",
    [GNOCCHI_TERMINAL_RECOVERY_OUTPUT_ENV]: exactRoot,
    TEZOS_NETWORK: "shadownet",
  }), exactRoot);
  assert.throws(() => assertGnocchiTerminalRecoveryAllowed({}), /EXECUTE=1 is required/);
  assert.throws(() => assertGnocchiTerminalRecoveryAllowed({
    [GNOCCHI_TERMINAL_RECOVERY_EXECUTE_FLAG]: "1",
    [GNOCCHI_TERMINAL_RECOVERY_OUTPUT_ENV]: exactRoot,
    TEZOS_NETWORK: "mainnet",
  }), /only permits Shadownet/);
  assert.throws(() => assertGnocchiTerminalRecoveryAllowed({
    [GNOCCHI_TERMINAL_RECOVERY_EXECUTE_FLAG]: "1",
    [GNOCCHI_TERMINAL_RECOVERY_OUTPUT_ENV]: "/tmp/wrong-run",
    TEZOS_NETWORK: "shadownet",
  }), /run id drift/);
});

test("terminal Gnocchi recovery preserves the complete 001-017 screenshot prefix", () => {
  for (const ordinal of [1, 9, 10, 17]) {
    const prefix = String(ordinal).padStart(3, "0");
    assert.equal(isGnocchiTerminalPrefixFile(`screenshots/${prefix}-stage.png`), true);
    assert.equal(isGnocchiTerminalPrefixFile(`artifacts/screenshot-${prefix}-stage.json`), true);
  }
  assert.equal(isGnocchiTerminalPrefixFile("artifacts/gnocchi-current-contract-code.json"), true);
  assert.equal(isGnocchiTerminalPrefixFile("screenshots/000-stage.png"), false);
  assert.equal(isGnocchiTerminalPrefixFile("screenshots/018-stage.png"), false);
});

test("terminal Gnocchi recovery authenticates the exact already-applied 12-operation graph", () => {
  const fixture = operationFixture();
  const evidence = validateGnocchiTerminalOperationGraph(fixture);
  assert.equal(evidence.contractAddress, GNOCCHI_TERMINAL_RECOVERY_CONTRACT);
  assert.deepEqual(evidence.operationHashes, GNOCCHI_TERMINAL_OPERATION_PLAN.map(({ hash }) => hash));
  assert.equal(evidence.terminalOperationHash, GNOCCHI_TERMINAL_OPERATION_PLAN.at(-1)?.hash);

  for (const [label, mutate, pattern] of [
    ["hash", (value: ReturnType<typeof operationFixture>) => { value.transactions[10].hash = value.transactions[9].hash; }, /hash drift/],
    ["signer", (value: ReturnType<typeof operationFixture>) => { value.transactions[10].sender.address = GNOCCHI_TERMINAL_OPERATION_PLAN[0].sender; }, /sender drift/],
    ["entrypoint", (value: ReturnType<typeof operationFixture>) => { value.transactions[10].parameter.entrypoint = "set_sale_active"; }, /entrypoint drift/],
    ["count", (value: ReturnType<typeof operationFixture>) => { value.transactions.pop(); }, /exactly 11/],
  ] as const) {
    const changed = operationFixture();
    mutate(changed);
    assert.throws(() => validateGnocchiTerminalOperationGraph(changed), pattern, label);
  }
});

test("terminal Gnocchi recovery retries only allowlisted read-only bridge actions", async () => {
  let delegateCalls = 0;
  const bridge = createGnocchiTerminalReadOnlyBridgeHandler({
    actor: "collectorOne",
    delegate: async (request) => {
      delegateCalls += 1;
      if (request.action === "read_storage" && delegateCalls === 1) {
        throw Object.assign(new Error("rate limited"), { status: 429 });
      }
      return { action: request.action };
    },
  });
  assert.deepEqual(
    await bridge.handleAction({ action: "read_storage", payload: {} } as never),
    { action: "read_storage" },
  );
  assert.equal(delegateCalls, 2);
  await assert.rejects(
    bridge.handleAction({ action: "call", payload: {} } as never),
    /not allowed by terminal read-only recovery/,
  );
  assert.equal(delegateCalls, 2, "a write-shaped request must never reach the delegate");
  assert.equal(bridge.audit.writeActionRequests, 1);
  assert.deepEqual(bridge.audit.delegatedActions, ["read_storage", "read_storage"]);
});

test("terminal Gnocchi recovery requires unchanged state, counters, and empty actor mempool", () => {
  const before = immutableSnapshot();
  const after = immutableSnapshot();
  assert.doesNotThrow(() => assertGnocchiTerminalSnapshotUnchanged(before, after));
  for (const [label, changed, pattern] of [
    ["graph", immutableSnapshot({ operationGraphSha256: "4".repeat(64) }), /operation graph changed/],
    ["state", immutableSnapshot({ contractStateSha256: "4".repeat(64) }), /contract state changed/],
    ["counter", immutableSnapshot({ actorCounters: { creator: 101, collectorOne: 200, collectorTwo: 300 } }), /actor counters changed/],
    ["mempool", immutableSnapshot({ actorPendingOperations: [{ source: "tz1pending" }] }), /mempool/],
    ["supply", immutableSnapshot({ supplies: [4, 4, 4] }), /4\/4\/3/],
  ] as const) {
    assert.throws(() => assertGnocchiTerminalSnapshotUnchanged(before, changed), pattern, label);
  }
});

test("terminal Gnocchi recovery has no signer, pin, send, or injection path", async () => {
  const source = await readFile(new URL("./shadownet-gnocchi-terminal-readonly-recovery.ts", import.meta.url), "utf8");
  assert.match(source, /authorizeReadOnlyContract/);
  assert.match(source, /signerMaterialLoaded: false/);
  assert.match(source, /assert\.equal\(submittedOperations, 0\)/);
  assert.match(source, /assert\.equal\(injectedOperations, 0\)/);
  assert.doesNotMatch(source, /loadSignerSet|signerEnv|pinIpfsProof|\.send\(|\.originate\(/);
});
