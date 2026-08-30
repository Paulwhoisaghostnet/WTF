import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
  PASTA_UI_LIVE_RECEIPT_SCHEMA,
  type PastaUiLiveBridgeRequest,
  type PastaUiLivePreparedOperation,
  type PastaUiLivePublicReceipt,
  type PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import {
  PastaProofRestartJournal,
  readPastaProofRestartRpcSnapshot,
  type PastaProofRestartActor,
  type PastaProofRestartStep,
} from "./pasta-proof-restart-journal";
import { SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const CURATOR = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const CONTRACT = "KT1TP6Q4fzj4csiJ9MgkgUdFoNcEg396Vyer";
const HASHES = [
  "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq",
  "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp",
  "ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM",
  "ontvJUZ9vNVusfHbcvzSX8xpPZMutmmwqqarvj4N78u2tUQn4oz",
  "onwA9NfZ61x8n7QAPnTVXpL7ZvR9C3gFATds1YDmFLGwAFrdgso",
  "oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h",
] as const;

const LASAGNA_PLAN: readonly PastaProofRestartStep[] = [
  { id: "pin-0", actor: "creator", kind: "pin", fileName: "exhibition.json" },
  { id: "originate", actor: "creator", kind: "operation", action: "originate" },
  { id: "add", actor: "creator", kind: "operation", action: "call", entrypoint: "add_curator" },
  { id: "pin-1", actor: "curator", kind: "pin", fileName: "revision.json" },
  { id: "publish-0", actor: "curator", kind: "operation", action: "call", entrypoint: "publish_revision" },
  { id: "pin-2", actor: "creator", kind: "pin", fileName: "revision.json" },
  { id: "publish-1", actor: "creator", kind: "operation", action: "call", entrypoint: "publish_revision" },
  { id: "current", actor: "curator", kind: "operation", action: "call", entrypoint: "set_current_revision" },
  { id: "remove", actor: "creator", kind: "operation", action: "call", entrypoint: "remove_curator" },
];

function actorAddress(actor: PastaProofRestartActor): string {
  return actor === "curator" ? CURATOR : CREATOR;
}

function prepared(step: PastaProofRestartStep, sequence: number): PastaUiLivePreparedOperation {
  const descriptor = step.action === "originate"
    ? { kind: "originate" as const, code: [], storage: {} }
    : {
        kind: "call" as const,
        call: { contractAddress: CONTRACT, entrypoint: step.entrypoint!, payload: step.entrypoint === "set_current_revision" ? 0 : CURATOR },
        sendOptions: {},
      };
  return {
    status: "PREPARED",
    operationSequence: sequence,
    timestampUtc: "2026-08-08T12:00:00.000Z",
    action: step.action!,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: actorAddress(step.actor),
    ...(step.action === "originate" ? {} : { contractAddress: CONTRACT }),
    entrypoints: step.entrypoint ? [step.entrypoint] : [],
    descriptor,
  };
}

async function createJournal(plan = LASAGNA_PLAN): Promise<PastaProofRestartJournal> {
  const directory = await mkdtemp(path.join(tmpdir(), "pasta-restart-journal-"));
  return PastaProofRestartJournal.create({
    filePath: path.join(directory, "checkpoint.json"),
    app: plan === LASAGNA_PLAN ? "lasagna" : "colander",
    runId: "pasta-alpha-proof-test",
    actors: { creator: CREATOR, curator: CURATOR },
    initialCounters: { creator: 100, curator: 200 },
    plan,
    intent: { contractArtifactSha256: "a".repeat(64), mediaSha256: "b".repeat(64) },
    createdAt: "2026-08-08T12:00:00.000Z",
  });
}

async function reopenJournal(
  journal: PastaProofRestartJournal,
  plan = LASAGNA_PLAN,
): Promise<PastaProofRestartJournal> {
  return PastaProofRestartJournal.open(journal.filePath, {
    app: plan === LASAGNA_PLAN ? "lasagna" : "colander",
    runId: "pasta-alpha-proof-test",
    actors: { creator: CREATOR, curator: CURATOR },
    plan,
    intent: { contractArtifactSha256: "a".repeat(64), mediaSha256: "b".repeat(64) },
    authenticateInitialCounters(counters) {
      assert.deepEqual(counters, { creator: 100, curator: 200 });
    },
  });
}

async function applyPin(
  journal: PastaProofRestartJournal,
  step: PastaProofRestartStep,
  input: { bytes?: Uint8Array; mimeType?: string } = {},
): Promise<void> {
  const bytes = input.bytes ?? Buffer.from(JSON.stringify({ step: step.id }));
  const mimeType = input.mimeType ?? "application/json";
  await journal.beforePin(step.actor, { bytes, fileName: step.fileName!, mimeType });
  await journal.onPin(step.actor, {
    proof: {
      cid: `bafkrei${"a".repeat(52)}`,
      uri: `ipfs://bafkrei${"a".repeat(52)}`,
      fileName: step.fileName!,
      mimeType,
      byteLength: bytes.byteLength,
      sha256: (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex"),
      localGatewayUrl: "http://127.0.0.1:8080/ipfs/test",
      publicGatewayUrl: "https://ipfs.io/ipfs/test",
      publicGatewayVerified: true,
      verificationAttempts: 1,
    },
  });
}

function requestForStep(step: PastaProofRestartStep, id: string): PastaUiLiveBridgeRequest {
  if (step.kind === "pin") {
    return {
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id,
      action: "pin_json",
      payload: { value: { step: step.id }, fileName: step.fileName },
    };
  }
  if (step.action === "originate") {
    return {
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id,
      action: "originate",
      payload: { code: [], storage: {} },
    };
  }
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action: "call",
    payload: {
      call: {
        contractAddress: CONTRACT,
        entrypoint: step.entrypoint,
        payload: step.entrypoint === "set_current_revision" ? 0 : CURATOR,
      },
      sendOptions: {},
    },
  };
}

async function applyOperation(journal: PastaProofRestartJournal, step: PastaProofRestartStep, hash: string): Promise<void> {
  const sequence = journal.completedOperationCount(step.actor) + 1;
  const before = prepared(step, sequence);
  await journal.beforeOperationSubmit(step.actor, before);
  const submitted: PastaUiLiveSubmittedOperation = { ...before, status: "SUBMITTED", timestampUtc: before.timestampUtc, operationHash: hash };
  await journal.onOperationSubmitted(step.actor, submitted);
  const receipt: PastaUiLivePublicReceipt = {
    schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
    sequence,
    timestampUtc: before.timestampUtc,
    action: step.action!,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: actorAddress(step.actor),
    contractAddress: CONTRACT,
    operationHash: hash,
    ...(step.entrypoint ? { entrypoints: [step.entrypoint] } : {}),
  };
  await journal.onReceipt(step.actor, receipt);
}

async function applyPrefix(journal: PastaProofRestartJournal, boundary: number): Promise<void> {
  let operation = 0;
  for (let index = 0; index < boundary; index += 1) {
    const step = LASAGNA_PLAN[index];
    if (step.kind === "pin") await applyPin(journal, step);
    else await applyOperation(journal, step, HASHES[operation++]);
  }
}

for (const [operationIndex, step] of LASAGNA_PLAN.filter((candidate) => candidate.kind === "operation").entries()) {
  test(`Lasagna ${step.id} resumes safely from PREPARED, SUBMITTED, and APPLIED`, async () => {
    const boundary = LASAGNA_PLAN.indexOf(step);
    const preparedJournal = await createJournal();
    await applyPrefix(preparedJournal, boundary);
    const sequence = preparedJournal.completedOperationCount(step.actor) + 1;
    await preparedJournal.beforeOperationSubmit(step.actor, prepared(step, sequence));
    await preparedJournal.reconcile(async ({ expectedCounter }) => {
      assert.equal(expectedCounter, (step.actor === "curator" ? 200 : 100) + sequence);
      return { status: "absent" };
    });
    await applyOperation(preparedJournal, step, HASHES[operationIndex]);

    const submittedJournal = await createJournal();
    await applyPrefix(submittedJournal, boundary);
    const before = prepared(step, submittedJournal.completedOperationCount(step.actor) + 1);
    await submittedJournal.beforeOperationSubmit(step.actor, before);
    await submittedJournal.onOperationSubmitted(step.actor, { ...before, status: "SUBMITTED", operationHash: HASHES[operationIndex] });
    await submittedJournal.reconcile(async () => ({
      status: "applied",
      operationHash: HASHES[operationIndex],
      contractAddress: CONTRACT,
      timestampUtc: before.timestampUtc,
      entrypoints: step.entrypoint ? [step.entrypoint] : [],
    }));
    assert.equal(submittedJournal.operationReceipts().at(-1)?.operationHash, HASHES[operationIndex]);

    const appliedJournal = await createJournal();
    await applyPrefix(appliedJournal, boundary);
    await applyOperation(appliedJournal, step, HASHES[operationIndex]);
    const replayJournal = await reopenJournal(appliedJournal);
    let delegated = 0;
    let replay: unknown;
    for (const [index, completed] of LASAGNA_PLAN.slice(0, boundary + 1).entries()) {
      if (completed.actor !== step.actor || completed.transport === "direct") continue;
      replay = await replayJournal.replayOrHandle(
        step.actor,
        requestForStep(completed, `request-${operationIndex}-${index}`),
        async () => { delegated += 1; return null; },
      );
    }
    assert.equal(delegated, 0);
    assert.equal((replay as any).operationHash, HASHES[operationIndex]);
  });
}

test("applied pin replay returns the durable proof without calling the pinner and direct pins do not block bridge replay", async () => {
  const plan: readonly PastaProofRestartStep[] = [
    { id: "media", actor: "creator", kind: "pin", fileName: "media.png", transport: "direct" },
    { id: "metadata", actor: "creator", kind: "pin", fileName: "token.json" },
  ];
  const journal = await createJournal(plan);
  await applyPin(journal, plan[0], { bytes: Uint8Array.from([137, 80, 78, 71]), mimeType: "image/png" });
  await applyPin(journal, plan[1]);
  assert.ok(journal.appliedPin("media"));
  assert.equal(journal.pinRecords()[0].value, undefined);
  const replayJournal = await reopenJournal(journal, plan);
  let delegated = 0;
  await assert.rejects(
    replayJournal.replayOrHandle("creator", {
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id: "pin-replay-drift",
      action: "pin_json",
      payload: { value: { step: "wrong" }, fileName: "token.json" },
    }, async () => { delegated += 1; return null; }),
    /differs from completed step/,
  );
  const replay = await replayJournal.replayOrHandle("creator", {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: "pin-replay",
    action: "pin_json",
    payload: { value: { step: "metadata" }, fileName: "token.json" },
  }, async () => { delegated += 1; return null; });
  assert.equal(delegated, 0);
  assert.equal((replay as any).pin.fileName, "token.json");
});

test("PIN_PREPARED reconciliation either abandons absent bytes or records the exact recovered proof", async () => {
  const plan: readonly PastaProofRestartStep[] = [
    { id: "metadata", actor: "creator", kind: "pin", fileName: "token.json" },
  ];
  const absent = await createJournal(plan);
  const bytes = Buffer.from(JSON.stringify({ hello: "world" }));
  await absent.beforePin("creator", { bytes, fileName: "token.json", mimeType: "application/json" });
  await absent.reconcilePin(async (pending) => {
    assert.deepEqual(Buffer.from(pending.bytes), bytes);
    return { status: "absent" };
  });
  await applyPin(absent, plan[0]);

  const present = await createJournal(plan);
  await present.beforePin("creator", { bytes, fileName: "token.json", mimeType: "application/json" });
  const digest = (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");
  await present.reconcilePin(async () => ({
    status: "present",
    proof: {
      cid: `bafkrei${"a".repeat(52)}`,
      uri: `ipfs://bafkrei${"a".repeat(52)}`,
      fileName: "token.json",
      mimeType: "application/json",
      byteLength: bytes.byteLength,
      sha256: digest,
      localGatewayUrl: "http://127.0.0.1:8080/ipfs/test",
      publicGatewayUrl: "https://ipfs.io/ipfs/test",
      publicGatewayVerified: true,
      verificationAttempts: 2,
    },
  }));
  assert.equal(present.pinRecords()[0].proof.sha256, digest);
});

test("Colander exact submitted hash can reconcile or be terminally rejected without replay", async () => {
  const plan: readonly PastaProofRestartStep[] = [
    { id: "manage", actor: "creator", kind: "operation", action: "call", entrypoint: "set_current_revision" },
  ];
  const journal = await createJournal(plan);
  const before = prepared(plan[0], 1);
  await journal.beforeOperationSubmit("creator", before);
  await journal.onOperationSubmitted("creator", { ...before, status: "SUBMITTED", operationHash: HASHES[0] });
  await journal.reconcile(async ({ expectedCounter }) => {
    assert.equal(expectedCounter, 101);
    return { status: "rejected", operationHash: HASHES[0], reason: "included failure", counterConsumed: true };
  });
  await journal.beforeOperationSubmit("creator", prepared(plan[0], 1));
  assert.equal(journal.pending()?.expectedCounter, 102);
  await journal.reconcile(async () => ({ status: "absent" }));
  await applyOperation(journal, plan[0], HASHES[1]);
  assert.equal(journal.operationReceipts()[0].operationHash, HASHES[1]);
});

test("Colander replays an already-applied management call without delegating a second send", async () => {
  const plan: readonly PastaProofRestartStep[] = [
    { id: "manage", actor: "creator", kind: "operation", action: "call", entrypoint: "set_current_revision" },
  ];
  const journal = await createJournal(plan);
  await applyOperation(journal, plan[0], HASHES[0]);
  const replayJournal = await reopenJournal(journal, plan);
  let delegated = 0;
  const replay = await replayJournal.replayOrHandle("creator", requestForStep(plan[0], "colander-replay"), async () => {
    delegated += 1;
    return null;
  });
  assert.equal(delegated, 0);
  assert.equal((replay as any).operationHash, HASHES[0]);
});

test("journal rejects immutable intent and event-chain drift", async () => {
  const journal = await createJournal();
  await assert.rejects(
    PastaProofRestartJournal.open(journal.filePath, {
      app: "lasagna",
      runId: "pasta-alpha-proof-test",
      actors: { creator: CREATOR, curator: CURATOR },
      plan: LASAGNA_PLAN,
      intent: { contractArtifactSha256: "c".repeat(64), mediaSha256: "b".repeat(64) },
      authenticateInitialCounters: () => undefined,
    }),
    /intent differs/,
  );
});

test("journal open requires the caller to authenticate persisted counter floors", async () => {
  const journal = await createJournal();
  let authenticated = false;
  await PastaProofRestartJournal.open(journal.filePath, {
    app: "lasagna",
    runId: "pasta-alpha-proof-test",
    actors: { creator: CREATOR, curator: CURATOR },
    plan: LASAGNA_PLAN,
    intent: { contractArtifactSha256: "a".repeat(64), mediaSha256: "b".repeat(64) },
    authenticateInitialCounters(counters) {
      assert.deepEqual(counters, { creator: 100, curator: 200 });
      authenticated = true;
    },
  });
  assert.equal(authenticated, true);
});

test("approved-RPC snapshot normalizes active and terminal manager-operation lanes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/chains/main/chain_id")) return Response.json(SHADOWNET_CHAIN_ID);
    if (url.includes(`/contracts/${CREATOR}/counter`)) return Response.json("100");
    if (url.includes(`/contracts/${CURATOR}/counter`)) return Response.json("200");
    if (url.endsWith("/chains/main/mempool/pending_operations")) {
      return Response.json({
        applied: [{ hash: HASHES[0], contents: [{ source: CREATOR, counter: "101" }] }],
        validated: [["ignored-key", { hash: HASHES[1], contents: [{ source: CURATOR, counter: "201" }] }]],
        branch_delayed: [],
        unprocessed: [],
        refused: [[{ hash: HASHES[2], contents: [{ source: CREATOR, counter: "102" }] }, [{ id: "proto.error" }]]],
        branch_refused: [],
        outdated: [],
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  try {
    const snapshot = await readPastaProofRestartRpcSnapshot("https://rpc.example.test/", {
      creator: CREATOR,
      curator: CURATOR,
    });
    assert.deepEqual(snapshot.counters, { creator: 100, curator: 200 });
    assert.deepEqual(
      snapshot.activeManagerOperations.map(({ bucket, source, counter }) => ({ bucket, source, counter })),
      [
        { bucket: "applied", source: CREATOR, counter: 101 },
        { bucket: "validated", source: CURATOR, counter: 201 },
      ],
    );
    assert.deepEqual(
      snapshot.terminalManagerOperations.map(({ bucket, hash, counter }) => ({ bucket, hash, counter })),
      [{ bucket: "refused", hash: HASHES[2], counter: 102 }],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
