import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { ReadOnlyFetch } from "./pasta-readonly-retry";
import {
  assertPastaProofRestartCounterBoundary,
  assertPastaProofRestartOrigination,
  assertPastaProofRestartTransaction,
  authenticatePastaProofRestartInitialCounters,
  capturePastaProofRestartInitialCounters,
  projectPastaProofRestartValue,
  readPastaProofRestartActorState,
  reconcilePastaProofRestartOperation,
  reconcilePastaProofRestartPin,
  type PastaProofRestartPendingOperation,
} from "./pasta-proof-restart-chain";
import type { PastaProofRestartStep } from "./pasta-proof-restart-journal";
import {
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const CONTRACT = "KT1L6QfNDBRXZkECFo9QpfjGF4qyBnizTara";
const OPERATION_HASH = "opZjYmzbdMacbte9VfPFUfX8fzUbFKtmcrH6yr3eiHARfsXKu1v";
const CID = `bafkrei${"a".repeat(52)}`;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mempool(input: { active?: boolean; rejected?: boolean } = {}): Record<string, unknown[]> {
  const operation = { contents: [{ source: CREATOR }] };
  return {
    applied: [],
    validated: input.active ? [[OPERATION_HASH, operation]] : [],
    branch_delayed: [],
    unprocessed: [],
    branch_refused: input.rejected ? [[OPERATION_HASH, operation, []]] : [],
    refused: [],
    outdated: [],
  };
}

function chainFetch(input: {
  counter: number;
  rows?: unknown[];
  active?: boolean;
  rejected?: boolean;
}): ReadOnlyFetch {
  return async (raw) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith("/chains/main/chain_id")) return json(SHADOWNET_CHAIN_ID);
    if (url.pathname.endsWith(`/context/contracts/${CREATOR}/counter`)) return json(String(input.counter));
    if (url.pathname.endsWith("/mempool/pending_operations")) {
      return json(mempool({ active: input.active, rejected: input.rejected }));
    }
    if (url.origin === new URL(SHADOWNET_TZKT_API).origin && /\/operations\/(?:transactions|originations)$/.test(url.pathname)) {
      return json(input.rows ?? []);
    }
    throw new Error(`unexpected read ${url}`);
  };
}

const CALL_STEP: PastaProofRestartStep = {
  id: "buy",
  actor: "collector",
  kind: "operation",
  action: "call",
  entrypoint: "buy",
};

function pending(overrides: Partial<PastaProofRestartPendingOperation> = {}): PastaProofRestartPendingOperation {
  return {
    step: CALL_STEP,
    phase: "SUBMITTED",
    operationSequence: 1,
    descriptor: {
      kind: "call",
      call: {
        contractAddress: CONTRACT,
        entrypoint: "buy",
        payload: { amount: 1, token_id: 0 },
      },
      sendOptions: { amount: 1_000, mutez: true },
    },
    descriptorSha256: "a".repeat(64),
    operationHash: OPERATION_HASH,
    contractAddress: CONTRACT,
    expectedCounter: 101,
    ...overrides,
  };
}

function appliedTransaction(status = "applied"): Record<string, unknown> {
  return {
    type: "transaction",
    status,
    hash: OPERATION_HASH,
    sender: { address: CREATOR },
    target: { address: CONTRACT },
    counter: 101,
    amount: 1_000,
    parameter: { entrypoint: "buy", value: { amount: "1", token_id: "0" } },
    level: 123,
    timestamp: "2026-08-08T12:00:00Z",
  };
}

test("dual-RPC restart counters and mempools bind journal creation, open, and pre-submit", async () => {
  const clean = chainFetch({ counter: 100 });
  assert.deepEqual(
    await capturePastaProofRestartInitialCounters({ actors: { creator: CREATOR }, fetchImpl: clean }),
    { creator: 100 },
  );
  await authenticatePastaProofRestartInitialCounters({
    counters: { creator: 100 },
    actors: { creator: CREATOR },
    plan: [
      { id: "one", actor: "creator", kind: "operation", action: "call", entrypoint: "one" },
      { id: "two", actor: "creator", kind: "operation", action: "call", entrypoint: "two" },
    ],
    fetchImpl: chainFetch({ counter: 102 }),
  });
  await assertPastaProofRestartCounterBoundary({
    signerAddress: CREATOR,
    expectedCounter: 100,
    label: "pre-submit",
    fetchImpl: clean,
  });
  await assert.rejects(
    assertPastaProofRestartCounterBoundary({
      signerAddress: CREATOR,
      expectedCounter: 100,
      label: "pre-submit",
      fetchImpl: chainFetch({ counter: 100, active: true }),
    }),
    /active signer operation/,
  );
  await assert.rejects(
    authenticatePastaProofRestartInitialCounters({
      counters: { creator: 103 },
      actors: { creator: CREATOR },
      plan: [{ id: "one", actor: "creator", kind: "operation", action: "call", entrypoint: "one" }],
      fetchImpl: chainFetch({ counter: 102 }),
    }),
    /predates/,
  );
});

test("restart payload comparison normalizes projected maps and nat representations but rejects drift", () => {
  assert.deepEqual(
    projectPastaProofRestartValue({ __map: [["", "69706673"], ["supply", 2]] }),
    { "": { __integer: "69706673" }, supply: { __integer: "2" } },
  );
  const exact = assertPastaProofRestartTransaction({
    row: appliedTransaction(),
    pending: pending(),
    signerAddress: CREATOR,
  });
  assert.deepEqual(exact, { contractAddress: CONTRACT, entrypoints: ["buy"] });
  assert.throws(
    () => assertPastaProofRestartTransaction({
      row: { ...appliedTransaction(), parameter: { entrypoint: "buy", value: { amount: "2", token_id: "0" } } },
      pending: pending(),
      signerAddress: CREATOR,
    }),
    /payload differs/,
  );
});

test("restart origination binds exact hash, signer, manager counter, and originated KT1", () => {
  const originateStep: PastaProofRestartStep = {
    id: "originate",
    actor: "creator",
    kind: "operation",
    action: "originate",
  };
  const originatePending: PastaProofRestartPendingOperation = {
    step: originateStep,
    phase: "SUBMITTED",
    operationSequence: 1,
    descriptor: { kind: "originate", code: [], storage: {} },
    descriptorSha256: "a".repeat(64),
    operationHash: OPERATION_HASH,
    contractAddress: CONTRACT,
    expectedCounter: 101,
  };
  const row = {
    type: "origination",
    status: "applied",
    hash: OPERATION_HASH,
    sender: { address: CREATOR },
    originatedContract: { address: CONTRACT },
    counter: 101,
    level: 123,
    timestamp: "2026-08-08T12:00:00Z",
  };
  assert.deepEqual(
    assertPastaProofRestartOrigination({ row, pending: originatePending, signerAddress: CREATOR }),
    { contractAddress: CONTRACT, entrypoints: [] },
  );
  assert.throws(
    () => assertPastaProofRestartOrigination({
      row: { ...row, counter: 102 },
      pending: originatePending,
      signerAddress: CREATOR,
    }),
    /counter differs/,
  );
});

test("operation reconciliation distinguishes exact applied, terminal rejection, absent, active, and consumed-unknown states", async () => {
  const applied = await reconcilePastaProofRestartOperation({
    label: "exact call",
    pending: pending(),
    signerAddress: CREATOR,
    fetchImpl: chainFetch({ counter: 101, rows: [appliedTransaction()] }),
    validateApplied: async (row) => assertPastaProofRestartTransaction({ row, pending: pending(), signerAddress: CREATOR }),
  });
  assert.deepEqual(applied, {
    status: "applied",
    operationHash: OPERATION_HASH,
    contractAddress: CONTRACT,
    timestampUtc: "2026-08-08T12:00:00Z",
    entrypoints: ["buy"],
  });

  assert.deepEqual(
    await reconcilePastaProofRestartOperation({
      label: "rejected call",
      pending: pending(),
      signerAddress: CREATOR,
      fetchImpl: chainFetch({ counter: 101, rows: [appliedTransaction("failed")], rejected: true }),
      validateApplied: async () => { throw new Error("must not validate a rejected row"); },
    }),
    { status: "rejected", operationHash: OPERATION_HASH, reason: "failed", counterConsumed: true },
  );
  assert.deepEqual(
    await reconcilePastaProofRestartOperation({
      label: "terminal mempool rejection",
      pending: pending(),
      signerAddress: CREATOR,
      fetchImpl: chainFetch({ counter: 100, rejected: true }),
      validateApplied: async () => { throw new Error("must not validate a terminal mempool rejection"); },
    }),
    {
      status: "rejected",
      operationHash: OPERATION_HASH,
      reason: "dual-rpc-terminal-mempool-rejection",
      counterConsumed: false,
    },
  );

  assert.deepEqual(
    await reconcilePastaProofRestartOperation({
      label: "absent call",
      pending: pending({ phase: "PREPARED", operationHash: undefined }),
      signerAddress: CREATOR,
      fetchImpl: chainFetch({ counter: 100 }),
      validateApplied: async () => { throw new Error("must not validate an absent row"); },
    }),
    { status: "absent" },
  );

  await assert.rejects(
    reconcilePastaProofRestartOperation({
      label: "active call",
      pending: pending(),
      signerAddress: CREATOR,
      fetchImpl: chainFetch({ counter: 100, active: true }),
      validateApplied: async () => { throw new Error("must not validate an active row"); },
    }),
    /still active/,
  );
  await assert.rejects(
    reconcilePastaProofRestartOperation({
      label: "unknown call",
      pending: pending(),
      signerAddress: CREATOR,
      fetchImpl: chainFetch({ counter: 101 }),
      validateApplied: async () => { throw new Error("must not validate an unknown row"); },
    }),
    /consumed without exact indexed/,
  );
});

test("prepared pin recovery derives the exact CID and never repeats an existing Kubo pin", async () => {
  const bytes = Buffer.from("restart-pin-proof");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const ipfs: IpfsProofConfig = {
    apiUrl: "http://127.0.0.1:5001",
    localGatewayUrl: "http://127.0.0.1:8080/ipfs",
    publicGatewayUrl: "https://ipfs.io/ipfs",
    requestTimeoutMs: 1,
    verifyAttempts: 1,
    verifyDelayMs: 0,
  };
  const requests: Array<{ url: string; method: string }> = [];
  const presentFetch: ReadOnlyFetch = async (raw, init) => {
    const url = new URL(String(raw));
    const method = init?.method || "GET";
    requests.push({ url: url.toString(), method });
    if (url.pathname.endsWith("/api/v0/add")) {
      assert.equal(url.searchParams.get("only-hash"), "true");
      assert.equal(url.searchParams.get("pin"), "false");
      return new Response(`${JSON.stringify({ Hash: CID })}\n`);
    }
    if (url.pathname.endsWith("/api/v0/pin/ls")) return json({ Keys: { [CID]: { Type: "recursive" } } });
    if (url.pathname.endsWith(`/ipfs/${CID}`)) return new Response(bytes);
    throw new Error(`unexpected pin recovery request ${url}`);
  };
  const present = await reconcilePastaProofRestartPin({
    bytes,
    fileName: "token.json",
    mimeType: "application/json",
    sha256: digest,
    ipfs,
    fetchImpl: presentFetch,
  });
  assert.equal(present.status, "present");
  assert.equal(present.status === "present" ? present.proof.cid : "", CID);
  assert.equal(requests.filter((request) => request.url.includes("/api/v0/add")).length, 1);
  assert.ok(requests.every((request) => !request.url.includes("pin=true")));

  const absent = await reconcilePastaProofRestartPin({
    bytes,
    fileName: "token.json",
    mimeType: "application/json",
    sha256: digest,
    ipfs,
    fetchImpl: async (raw) => {
      const url = new URL(String(raw));
      if (url.pathname.endsWith("/api/v0/add")) return new Response(`${JSON.stringify({ Hash: CID })}\n`);
      if (url.pathname.endsWith("/api/v0/pin/ls")) return json({ Message: "not pinned" }, 500);
      throw new Error(`unexpected absent pin request ${url}`);
    },
  });
  assert.deepEqual(absent, { status: "absent" });
  await assert.rejects(
    reconcilePastaProofRestartPin({
      bytes,
      fileName: "token.json",
      mimeType: "application/json",
      sha256: "0".repeat(64),
      ipfs,
      fetchImpl: presentFetch,
    }),
    /bytes differ/,
  );
});

test("restart verifier always reads both configured Shadownet RPC lanes", async () => {
  const seen = new Set<string>();
  const base = chainFetch({ counter: 100 });
  await readPastaProofRestartActorState({
    signerAddress: CREATOR,
    fetchImpl: async (raw, init) => {
      seen.add(new URL(String(raw)).origin);
      return base(raw, init);
    },
  });
  assert.deepEqual(
    [...seen].sort(),
    [new URL(SHADOWNET_RPC_PRIMARY).origin, new URL(SHADOWNET_RPC_FALLBACK).origin].sort(),
  );
});
