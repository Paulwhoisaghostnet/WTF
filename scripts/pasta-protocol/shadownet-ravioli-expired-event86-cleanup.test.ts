import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertExactRavioliExpiredCleanupInitialState,
  assertRavioliExpiredCleanupExecutionAllowed,
  assertRavioliExpiredCleanupRestartBoundary,
  classifyRavioliExpiredCleanupState,
  expectedRavioliExpiredCleanupStateAfterPrefix,
  RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY,
  RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN,
  readRavioliExpiredCleanupJson,
  reconcileRavioliExpiredCleanupOperations,
  selectExactRavioliExpiredCleanupOperation,
  type RavioliExpiredCleanupData,
  type RavioliExpiredCleanupOperation,
  type RavioliExpiredCleanupStep,
} from "./shadownet-ravioli-expired-event86-cleanup";

test("cleanup GET retries a transient RPC 429 without retrying any mutation", async () => {
  const methods: string[] = [];
  let calls = 0;
  const result = await readRavioliExpiredCleanupJson(
    `https://rpc.example.test/chains/main/blocks/head/context/contracts/${"K".repeat(40)}/storage?${"key=value&".repeat(30)}`,
    async (_input, init) => {
      methods.push(init?.method || "GET");
      calls += 1;
      if (calls === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return new Response('{"level":4531863}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  assert.deepEqual(result, { level: 4_531_863 });
  assert.equal(calls, 2);
  assert.deepEqual(methods, ["GET", "GET"]);
});

const OPERATION_HASHES = [
  "oohab5WsDHZciSmfXK5FWmjA4wfKPLqR96YKUAYgeRJ9Fcjckxx",
  "op7cPb54JaiDmsktr7vqQTZinwQTkTvTRTYZPJGswWaJNEq6sHp",
  "oooRHXy1CoMRUYFRoEmWGsrp7KXAVhGftPgZZah4Zw2uc7CmWDi",
  "opQAUWfW2qTqwzGpSiRrCFzS13SRio3Cz5KU8mDEx9AtzrZpxoJ",
  "op1BRfgKihyYLL3D36R3qnfSQuu36qXYTvjCcd969bTY6eUSdue",
  "opX3RskT6UGBXTkxAbgvqHVMVCNnAed9jMwksUD1hLi9jZPzUWh",
  "oouBQxK47DyPD2RRrMApzHbqcTadhwqQ6Jwz1T1HY3ZBCeCngRr",
] as const;

function initialState(): RavioliExpiredCleanupData {
  return {
    router: {
      administrator: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.creator,
      blindController: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.controller,
      nextTokenId: 3,
      token1: {
        mode: 1,
        blind: true,
        finalized: true,
        cancelled: false,
        contentsPublished: false,
        revealDeadline: "2026-07-27T20:02:00Z",
        openDeadline: "2026-08-01T20:02:00Z",
        minted: 2,
        totalSupply: 2,
        holderBalance: 2,
        saleActive: true,
        saleRemaining: 0,
        asset0Allowance: 1,
        asset1Allowance: 1,
      },
      token2: {
        mode: 2,
        blind: true,
        finalized: true,
        cancelled: false,
        contentsPublished: false,
        wrapperSaleEnd: "2026-07-31T18:40:00Z",
        revealDeadline: "2026-07-31T19:10:00Z",
        openDeadline: "2026-07-31T20:40:00Z",
        minted: 1,
        totalSupply: 1,
        creatorBalance: 1,
        saleActive: true,
        saleRemaining: 1,
        adapterAllowance: 1,
      },
    },
    controller: {
      token1: {
        revealed: false,
        cancelled: false,
        outstanding: 2,
        unclaimed: 0,
        escrowedMutez: 2,
        claimCount: 2,
        claimSlots: [
          { slot: 0, claimId: 1, paidMutez: 1 },
          { slot: 1, claimId: 0, paidMutez: 1 },
        ],
        holderCreditMutez: 0,
      },
      token2: {
        revealed: false,
        cancelled: false,
        outstanding: 0,
        unclaimed: 1,
        escrowedMutez: 0,
      },
    },
    gnocchiAssets: {
      routerToken0: 2,
      creatorToken0: 0,
      routerToken1: 1,
      creatorToken1: 1,
    },
    adapter: {
      administrator: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.creator,
      routerAuthorized: true,
      resource0: {
        target: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.gnocchi,
        tokenId: 2,
        amountPerOpen: 1,
        active: true,
      },
      token2Reservation: 1,
    },
    gnocchi: {
      administrator: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.creator,
      adapterAuthorized: true,
      token2PolicyLocked: true,
      token2PolicyEnd: "2026-07-31T19:40:00Z",
      token2MaxSupply: 4,
      token2TotalMinted: 3,
      token2TotalSupply: 3,
      token2AdapterReservation: 1,
      token2TotalReserved: 1,
    },
  };
}

function tzktPayload(value: unknown): unknown {
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(tzktPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, tzktPayload(child)]),
    );
  }
  return value;
}

function operationRow(
  step: RavioliExpiredCleanupStep,
  overrides: Record<string, unknown> = {},
): Record<string, any> {
  return {
    hash: OPERATION_HASHES[step.ordinal - 1],
    status: "applied",
    amount: "0",
    sender: {
      address: step.actor === "creator"
        ? RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.creator
        : RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.collectorTwo,
    },
    target: { address: step.contractAddress },
    parameter: {
      entrypoint: step.entrypoint,
      value: tzktPayload(step.payload),
    },
    counter: String(24_000_000 + step.ordinal),
    level: 4_600_000 + step.ordinal,
    timestamp: `2026-08-08T14:00:0${step.ordinal}Z`,
    ...overrides,
  };
}

test("event-86 cleanup plan is the exact seven-call terminal path and never closes active token 0", () => {
  assert.deepEqual(
    RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.map((step) => [
      step.ordinal,
      step.actor,
      step.entrypoint,
    ]),
    [
      [1, "creator", "refund_blind_claims"],
      [2, "creator", "cancel_unrevealed_pack"],
      [3, "collector2", "withdraw_refund"],
      [4, "creator", "recover_asset"],
      [5, "creator", "recover_asset"],
      [6, "creator", "cancel_unrevealed_pack"],
      [7, "creator", "recover_adapter"],
    ],
  );
  assert.deepEqual(RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN[0].payload, {
    token_id: 1,
    holder: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.collectorTwo,
    amount: 2,
    expected_claim_id: 0,
  });
  assert.deepEqual(RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN[6].payload, {
    token_id: 2,
    adapter: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.gnocchiAdapter,
    kind: 1,
    resource_id: 0,
    capacity: 1,
  });
  assert.ok(
    RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.every((step) => {
      const payload = step.payload as Record<string, unknown>;
      return step.entrypoint === "cancel_unrevealed_pack"
        ? step.payload !== 0
        : payload.token_id !== 0;
    }),
    "active deterministic token 0 must remain untouched",
  );
});

test("all eight cleanup states classify as one exact prefix and terminal state clears credits, assets, and reservations", () => {
  const initial = initialState();
  assertExactRavioliExpiredCleanupInitialState(initial);
  for (let prefix = 0; prefix <= RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.length; prefix += 1) {
    const state = expectedRavioliExpiredCleanupStateAfterPrefix(initial, prefix);
    const classification = classifyRavioliExpiredCleanupState(initial, state);
    assert.equal(classification.completedPrefix, prefix);
    assert.equal(
      classification.status,
      prefix === RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.length ? "COMPLETE" : "PENDING",
    );
    assert.equal(
      classification.nextStep?.ordinal || null,
      prefix === RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.length ? null : prefix + 1,
    );
  }
  const terminal = expectedRavioliExpiredCleanupStateAfterPrefix(initial, 7);
  assert.deepEqual(
    {
      token1Supply: terminal.router.token1.totalSupply,
      token1Credit: terminal.controller.token1.holderCreditMutez,
      token1AssetAllowances: [
        terminal.router.token1.asset0Allowance,
        terminal.router.token1.asset1Allowance,
      ],
      token2Supply: terminal.router.token2.totalSupply,
      token2RouterAllowance: terminal.router.token2.adapterAllowance,
      token2AdapterReservation: terminal.adapter.token2Reservation,
      token2GnocchiOwnerReservation: terminal.gnocchi.token2AdapterReservation,
      token2TargetReservation: terminal.gnocchi.token2TotalReserved,
    },
    {
      token1Supply: 0,
      token1Credit: 0,
      token1AssetAllowances: [0, 0],
      token2Supply: 0,
      token2RouterAllowance: 0,
      token2AdapterReservation: 0,
      token2GnocchiOwnerReservation: 0,
      token2TargetReservation: 0,
    },
  );
});

test("cleanup classification rejects a non-prefix partial mutation", () => {
  const initial = initialState();
  const invalid = expectedRavioliExpiredCleanupStateAfterPrefix(initial, 1);
  invalid.router.token2.adapterAllowance = 0;
  assert.throws(
    () => classifyRavioliExpiredCleanupState(initial, invalid),
    /not an exact plan prefix/,
  );
});

test("exact TzKT selector binds root actor, target, entrypoint, payload, zero tez, and applied status", () => {
  const step = RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN[0];
  const row = operationRow(step);
  const selected = selectExactRavioliExpiredCleanupOperation([row], step);
  assert.deepEqual(
    selected,
    {
      ordinal: 1,
      id: step.id,
      hash: OPERATION_HASHES[0],
      status: "applied",
      actor: "creator",
      signerAddress: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.creator,
      contractAddress: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.router,
      entrypoint: "refund_blind_claims",
      payload: step.payload,
      counter: 24_000_001,
      level: 4_600_001,
      timestamp: "2026-08-08T14:00:01.000Z",
      explorerUrl: `https://shadownet.tzkt.io/${OPERATION_HASHES[0]}`,
    },
  );
  assert.equal(
    selectExactRavioliExpiredCleanupOperation([
      operationRow(step, { sender: { address: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.collectorTwo } }),
    ], step),
    null,
  );
  assert.equal(
    selectExactRavioliExpiredCleanupOperation([
      operationRow(step, {
        parameter: {
          entrypoint: step.entrypoint,
          value: { ...tzktPayload(step.payload) as Record<string, unknown>, amount: "1" },
        },
      }),
    ], step),
    null,
  );
  assert.throws(
    () => selectExactRavioliExpiredCleanupOperation([
      operationRow(step, { status: "failed" }),
    ], step),
    /non-applied TzKT operation/,
  );
  assert.throws(
    () => selectExactRavioliExpiredCleanupOperation([row, { ...row }], step),
    /duplicate exact applied/,
  );
});

test("TzKT reconciliation accepts only one contiguous, unique operation prefix", () => {
  const fullRows = new Map<number, unknown>();
  for (const step of RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN) {
    fullRows.set(step.ordinal, [operationRow(step)]);
  }
  const complete = reconcileRavioliExpiredCleanupOperations(fullRows);
  assert.equal(complete.length, 7);
  assert.deepEqual(complete.map((operation) => operation.ordinal), [1, 2, 3, 4, 5, 6, 7]);

  const prefixRows = new Map(fullRows);
  prefixRows.set(4, []);
  prefixRows.set(5, []);
  prefixRows.set(6, []);
  prefixRows.set(7, []);
  assert.equal(reconcileRavioliExpiredCleanupOperations(prefixRows).length, 3);

  const gap = new Map(fullRows);
  gap.set(2, []);
  assert.throws(
    () => reconcileRavioliExpiredCleanupOperations(gap),
    /do not form an exact applied prefix/,
  );

  const duplicateHash = new Map(fullRows);
  duplicateHash.set(2, [operationRow(RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN[1], {
    hash: OPERATION_HASHES[0],
  })]);
  assert.throws(
    () => reconcileRavioliExpiredCleanupOperations(duplicateHash),
    /hashes must be unique/,
  );
});

test("restart boundary permits a prepared-only crash window but rejects unprepared, gapped, or state-divergent history", () => {
  const step = RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN[0];
  const operation = selectExactRavioliExpiredCleanupOperation([operationRow(step)], step)!;
  assertRavioliExpiredCleanupRestartBoundary({
    preparedOrdinals: new Set([1]),
    operations: [],
    statePrefix: 0,
  });
  assertRavioliExpiredCleanupRestartBoundary({
    preparedOrdinals: new Set([1]),
    operations: [operation],
    statePrefix: 1,
  });
  assert.throws(
    () => assertRavioliExpiredCleanupRestartBoundary({
      preparedOrdinals: new Set(),
      operations: [operation],
      statePrefix: 1,
    }),
    /lacks its prior PREPARED/,
  );
  assert.throws(
    () => assertRavioliExpiredCleanupRestartBoundary({
      preparedOrdinals: new Set([1, 3]),
      operations: [operation],
      statePrefix: 1,
    }),
    /beyond the next exact prefix step/,
  );
  assert.throws(
    () => assertRavioliExpiredCleanupRestartBoundary({
      preparedOrdinals: new Set([1]),
      operations: [operation],
      statePrefix: 0,
    }),
    /state and exact TzKT operation prefix disagree/,
  );
  assert.throws(
    () => assertRavioliExpiredCleanupRestartBoundary({
      preparedOrdinals: new Set([1]),
      operations: [{ ...operation, ordinal: 2 } as RavioliExpiredCleanupOperation],
      statePrefix: 1,
    }),
    /not an exact ordinal prefix/,
  );
});

test("execution guard is exact-run, Shadownet, and dual-opt-in", () => {
  const allowed = {
    PASTA_SHADOWNET_E2E_EXECUTE: "1",
    PASTA_SHADOWNET_RAVIOLI_EXPIRED_EVENT86_CLEANUP_EXECUTE: "1",
    TEZOS_NETWORK: "shadownet",
    PASTA_PROOF_RUN_DIR: `/tmp/${RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.runId}`,
  };
  assertRavioliExpiredCleanupExecutionAllowed(allowed);
  assert.throws(
    () => assertRavioliExpiredCleanupExecutionAllowed({ ...allowed, PASTA_SHADOWNET_E2E_EXECUTE: undefined }),
    /PASTA_SHADOWNET_E2E_EXECUTE=1/,
  );
  assert.throws(
    () => assertRavioliExpiredCleanupExecutionAllowed({
      ...allowed,
      PASTA_SHADOWNET_RAVIOLI_EXPIRED_EVENT86_CLEANUP_EXECUTE: undefined,
    }),
    /PASTA_SHADOWNET_RAVIOLI_EXPIRED_EVENT86_CLEANUP_EXECUTE=1/,
  );
  assert.throws(
    () => assertRavioliExpiredCleanupExecutionAllowed({ ...allowed, TEZOS_NETWORK: "mainnet" }),
    /only permits Shadownet/,
  );
  assert.throws(
    () => assertRavioliExpiredCleanupExecutionAllowed({ ...allowed, PASTA_PROOF_RUN_DIR: "/tmp/wrong-run" }),
    /exact event-86 proof run/,
  );
});

test("source keeps original event 86 read-only and loads signers only after live preflight", async () => {
  const source = await readFile(
    new URL("./shadownet-ravioli-expired-event86-cleanup.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /cleanup source event-86 digest drift/);
  assert.match(source, /event\.nextGlobalOrdinal, 24/);
  assert.doesNotMatch(source, /writeExclusiveJson\(eventPath/);
  const execution = source.indexOf("export async function runRavioliExpiredEvent86Cleanup(");
  const preflight = source.indexOf("runRavioliExpiredEvent86CleanupPreflight(environment)", execution);
  const signer = source.indexOf("await loadSignerSet(signerConfiguration)", execution);
  assert.ok(execution >= 0 && preflight > execution && signer > preflight);
  assert.match(source, /signerConfigurationLoaded: false/);
  assert.match(source, /writesPerformed: 0/);
});
