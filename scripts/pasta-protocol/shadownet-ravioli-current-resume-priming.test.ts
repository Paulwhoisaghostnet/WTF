import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { PastaUiLiveBridgeRequest } from "./pasta-ui-live-bridge-kit";
import { PASTA_UI_LIVE_BRIDGE_SCHEMA } from "./pasta-ui-live-bridge-kit";
import { deterministicJsonBytes } from "./shadownet-proof-kit";
import {
  openRavioliUiLiveJournal,
  type RavioliUiLiveJournalActor,
} from "./shadownet-ravioli-ui-live-journal";
import {
  createRavioliCurrentResumeCoordinator,
  reconcileRavioliPreparedSealedPinRecovery,
  reconcileRavioliRejectedPreDelegationRecovery,
  reconcileRavioliCurrentResume,
  type RavioliCurrentResumeExpectedIdentity,
  type RavioliCurrentResumePlan,
  type RavioliPreparedSealedPinRecoveryBridge,
} from "./shadownet-ravioli-current-resume";

const CURRENT_JOURNAL = path.resolve(
  "artifacts/pasta-protocol-proof-runs/pasta-alpha-proof-20260808t140453z/ravioli/artifacts/journal",
);
const CURRENT_PRIVATE_RECOVERY =
  "/private/tmp/pasta-ravioli-private-recovery-20260808t140453z";
const CURRENT_OP30_PRIVATE_RECOVERY_SNAPSHOT = path.join(
  CURRENT_PRIVATE_RECOVERY,
  "ravioli-private-recovery-f6d98d97a728a8970695184b",
);
const AGGREGATE_OP20_JOURNAL = path.resolve(
  "artifacts/pasta-protocol-proof-runs/pasta-alpha-proof-20260808t181046z-v2/ravioli/artifacts/journal",
);
const AGGREGATE_OP20_PRIVATE_RECOVERY =
  "/private/tmp/pasta-ravioli-private-pasta-alpha-proof-20260808t181046z-v2";
const AGGREGATE_OP20_PRIVATE_RECOVERY_SNAPSHOT = path.join(
  AGGREGATE_OP20_PRIVATE_RECOVERY,
  "ravioli-private-recovery-c4f55a1cf46362128216186f",
);
const AGGREGATE_OP20_CID =
  "bafkreicfhwjzpot3zxbfulpjzhjr6j2idsamxbwptjfpqcryxysmtoa42a";
const ACTORS = ["creator", "collector1", "collector2"] as const;
const TEST_IPFS = Object.freeze({
  localGatewayUrl: "http://127.0.0.1:18080/ipfs",
  publicGatewayUrl: "https://ipfs.io/ipfs",
});

function encodeBridgeValue(value: unknown): unknown {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) return value;
  if (Array.isArray(value)) return value.map(encodeBridgeValue);
  if (
    value
    && typeof value === "object"
    && typeof (value as any).entries === "function"
    && typeof (value as any).get === "function"
  ) {
    return {
      __pastaBridgeType: "map",
      entries: [...(value as Map<unknown, unknown>).entries()].map(([key, entry]) => [
        encodeBridgeValue(key),
        encodeBridgeValue(entry),
      ]),
    };
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      encodeBridgeValue(entry),
    ]),
  );
}

function replayRequest(
  step: RavioliCurrentResumePlan["pins"][number] | RavioliCurrentResumePlan["operations"][number],
  id: string,
): PastaUiLiveBridgeRequest {
  if (step.kind === "pin") {
    return {
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id,
      action: step.action,
      payload: step.action === "pin_json"
        ? { fileName: step.proof.fileName, value: encodeBridgeValue(step.value) }
        : {
            dataBase64: Buffer.from(step.bytes).toString("base64"),
            fileName: step.proof.fileName,
            mimeType: step.proof.mimeType,
          },
    };
  }
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action: step.action,
    payload: step.descriptor.kind === "originate"
      ? {
          code: encodeBridgeValue(step.descriptor.code),
          storage: encodeBridgeValue(step.descriptor.storage),
        }
      : {
          call: encodeBridgeValue(step.descriptor.call),
          sendOptions: encodeBridgeValue(step.descriptor.sendOptions),
        },
  };
}

function op24Origination(id: string): PastaUiLiveBridgeRequest {
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action: "originate",
    payload: {
      code: [{ prim: "parameter", args: [{ prim: "unit" }] }],
      storage: { prim: "Unit" },
    },
  };
}

function callRequest(
  id: string,
  entrypoint: string,
  options: { contractAddress?: string; payload?: unknown } = {},
): PastaUiLiveBridgeRequest {
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action: "call",
    payload: {
      call: {
        contractAddress: options.contractAddress || "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i",
        entrypoint,
        payload: options.payload ?? null,
      },
      sendOptions: {},
    },
  };
}

function newPin(id: string): PastaUiLiveBridgeRequest {
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action: "pin_blob",
    payload: {
      dataBase64: Buffer.from("new-mode-3-adapter-metadata", "utf8").toString("base64"),
      fileName: "mode-3-adapter-metadata.json",
      mimeType: "application/json",
    },
  };
}

async function loadCurrentPrefixPlan(
  t: test.TestContext,
  prefix: Readonly<{
    eventCount: number;
    pinCount: number;
    completedOperationCount: number;
    privateRecoveryRoot?: string;
    journalRoot?: string;
  }>,
): Promise<RavioliCurrentResumePlan | null> {
  const sourceJournal = prefix.journalRoot || CURRENT_JOURNAL;
  try {
    const info = await lstat(sourceJournal);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("journal is not a real directory");
  } catch {
    t.skip(`current journal fixture is unavailable at ${sourceJournal}`);
    return null;
  }
  if (prefix.privateRecoveryRoot) {
    try {
      const info = await lstat(prefix.privateRecoveryRoot);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("private recovery is not a real directory");
    } catch {
      t.skip("current operation-30 private recovery fixture is unavailable");
      return null;
    }
  }
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-current-op23-priming-"));
  const frozenRoot = path.join(parent, "journal");
  try {
    await mkdir(path.join(frozenRoot, "events"), { recursive: true });
    await mkdir(path.join(frozenRoot, "pins"), { recursive: true });
    await copyFile(
      path.join(sourceJournal, "intent.json"),
      path.join(frozenRoot, "intent.json"),
    );
    const eventNames = (await readdir(path.join(sourceJournal, "events")))
      .sort()
      .slice(0, prefix.eventCount);
    const pinNames = (await readdir(path.join(sourceJournal, "pins")))
      .sort()
      .slice(0, prefix.pinCount);
    assert.equal(
      eventNames.length,
      prefix.eventCount,
      `current journal no longer retains the exact event-${prefix.eventCount} prefix`,
    );
    assert.equal(
      pinNames.length,
      prefix.pinCount,
      `current journal no longer retains the exact ${prefix.pinCount}-pin prefix`,
    );
    await Promise.all(eventNames.map((name) => copyFile(
      path.join(sourceJournal, "events", name),
      path.join(frozenRoot, "events", name),
    )));
    await Promise.all(pinNames.map((name) => copyFile(
      path.join(sourceJournal, "pins", name),
      path.join(frozenRoot, "pins", name),
    )));
    const journal = await openRavioliUiLiveJournal(frozenRoot);
    const state = await journal.restartState();
    const expected: RavioliCurrentResumeExpectedIdentity = {
      actors: {
        creator: journal.intent.actors.creator.signerAddress,
        collector1: journal.intent.actors.collector1.signerAddress,
        collector2: journal.intent.actors.collector2.signerAddress,
      },
      dependencyAddresses: journal.intent.dependencyAddresses,
      dependencyHashes: journal.intent.dependencyHashes,
      artifactHashes: journal.intent.artifactHashes,
    };
    const plan = await reconcileRavioliCurrentResume({
      journal,
      expected,
      ipfs: TEST_IPFS,
      verifier: {
        readActorCounter: async ({ actor, lane }) => (
          journal.intent.actors[actor].counters[lane].counter
          + state.actorAppliedCounts[actor]
          + state.actorCounterOffsets[actor]
        ),
        verifyOperation: async (operation) => operation.evidence,
        verifyPin: async () => undefined,
        verifyTarget: async () => undefined,
      },
      ...(prefix.privateRecoveryRoot
        ? { privateRecoveryRoot: prefix.privateRecoveryRoot }
        : {}),
    });
    assert.equal(plan.completedOperationCount, prefix.completedOperationCount);
    return plan;
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function loadCurrentOp23Plan(t: test.TestContext): Promise<RavioliCurrentResumePlan | null> {
  return loadCurrentPrefixPlan(t, {
    eventCount: 85,
    pinCount: 15,
    completedOperationCount: 23,
  });
}

function loadCurrentOp14Plan(t: test.TestContext): Promise<RavioliCurrentResumePlan | null> {
  return loadCurrentPrefixPlan(t, {
    eventCount: 53,
    pinCount: 10,
    completedOperationCount: 14,
  });
}

function loadCurrentOp20Plan(t: test.TestContext): Promise<RavioliCurrentResumePlan | null> {
  return loadCurrentPrefixPlan(t, {
    eventCount: 74,
    pinCount: 13,
    completedOperationCount: 20,
  });
}

function loadCurrentOp30Plan(t: test.TestContext): Promise<RavioliCurrentResumePlan | null> {
  return loadCurrentPrefixPlan(t, {
    eventCount: 112,
    pinCount: 21,
    completedOperationCount: 30,
  });
}

function loadCurrentOp55Plan(t: test.TestContext): Promise<RavioliCurrentResumePlan | null> {
  return loadCurrentPrefixPlan(t, {
    journalRoot: AGGREGATE_OP20_JOURNAL,
    eventCount: 196,
    pinCount: 30,
    completedOperationCount: 55,
  });
}

function loadCurrentOp63Plan(t: test.TestContext): Promise<RavioliCurrentResumePlan | null> {
  return loadCurrentPrefixPlan(t, {
    journalRoot: AGGREGATE_OP20_JOURNAL,
    eventCount: 224,
    pinCount: 34,
    completedOperationCount: 63,
  });
}

function loadCurrentOp64Plan(t: test.TestContext): Promise<RavioliCurrentResumePlan | null> {
  return loadCurrentPrefixPlan(t, {
    journalRoot: AGGREGATE_OP20_JOURNAL,
    eventCount: 227,
    pinCount: 34,
    completedOperationCount: 64,
  });
}

function loadCurrentOp66Plan(t: test.TestContext): Promise<RavioliCurrentResumePlan | null> {
  return loadCurrentPrefixPlan(t, {
    journalRoot: AGGREGATE_OP20_JOURNAL,
    eventCount: 233,
    pinCount: 34,
    completedOperationCount: 66,
  });
}

function loadCurrentOp67Plan(t: test.TestContext): Promise<RavioliCurrentResumePlan | null> {
  return loadCurrentPrefixPlan(t, {
    journalRoot: AGGREGATE_OP20_JOURNAL,
    eventCount: 236,
    pinCount: 34,
    completedOperationCount: 67,
  });
}

async function exactOp30PrivateRecoveryRoot(t: test.TestContext): Promise<string> {
  const sourceInfo = await lstat(CURRENT_OP30_PRIVATE_RECOVERY_SNAPSHOT);
  assert.equal(sourceInfo.isDirectory(), true, "operation-30 private snapshot is not a directory");
  assert.equal(sourceInfo.isSymbolicLink(), false, "operation-30 private snapshot must not be a symlink");
  const manifestInfo = await lstat(path.join(CURRENT_OP30_PRIVATE_RECOVERY_SNAPSHOT, "manifest.json"));
  const recordsInfo = await lstat(path.join(CURRENT_OP30_PRIVATE_RECOVERY_SNAPSHOT, "records"));
  assert.equal(manifestInfo.isFile() && !manifestInfo.isSymbolicLink(), true);
  assert.equal(recordsInfo.isDirectory() && !recordsInfo.isSymbolicLink(), true);
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-private-op30-exact-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "recovery");
  await mkdir(root, { recursive: true });
  await cp(
    CURRENT_OP30_PRIVATE_RECOVERY_SNAPSHOT,
    path.join(root, path.basename(CURRENT_OP30_PRIVATE_RECOVERY_SNAPSHOT)),
    { recursive: true },
  );
  return root;
}

async function exactOp20PrivateRecoveryRoot(t: test.TestContext): Promise<string> {
  const sourceInfo = await lstat(AGGREGATE_OP20_PRIVATE_RECOVERY_SNAPSHOT);
  assert.equal(sourceInfo.isDirectory(), true, "operation-20 private snapshot is not a directory");
  assert.equal(sourceInfo.isSymbolicLink(), false, "operation-20 private snapshot must not be a symlink");
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-private-op20-exact-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "recovery");
  await mkdir(root, { recursive: true });
  await cp(
    AGGREGATE_OP20_PRIVATE_RECOVERY_SNAPSHOT,
    path.join(root, path.basename(AGGREGATE_OP20_PRIVATE_RECOVERY_SNAPSHOT)),
    { recursive: true },
  );
  return root;
}

async function loadCurrentOp30PrivateRecoveryPlan(
  t: test.TestContext,
): Promise<RavioliCurrentResumePlan | null> {
  let privateRecoveryRoot: string;
  try {
    privateRecoveryRoot = await exactOp30PrivateRecoveryRoot(t);
  } catch {
    t.skip("exact operation-30 private recovery snapshot is unavailable");
    return null;
  }
  return loadCurrentPrefixPlan(t, {
    eventCount: 112,
    pinCount: 21,
    completedOperationCount: 30,
    privateRecoveryRoot,
  });
}

async function immutableFileInventory(root: string): Promise<readonly string[]> {
  const inventory: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const name of (await readdir(directory)).sort()) {
      const absolute = path.join(directory, name);
      const relative = path.relative(root, absolute);
      const info = await lstat(absolute);
      if (info.isDirectory()) {
        inventory.push(`d:${relative}`);
        await visit(absolute);
      } else {
        const digest = createHash("sha256").update(await readFile(absolute)).digest("hex");
        inventory.push(`f:${relative}:${info.size}:${digest}`);
      }
    }
  };
  await visit(root);
  return inventory;
}

async function mutatedPrivateRecoveryRoot(
  t: test.TestContext,
  label: string,
  mutate: (record: any) => void,
): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), `ravioli-private-${label}-`));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "recovery");
  await mkdir(root, { recursive: true });
  await cp(
    CURRENT_OP30_PRIVATE_RECOVERY_SNAPSHOT,
    path.join(root, path.basename(CURRENT_OP30_PRIVATE_RECOVERY_SNAPSHOT)),
    { recursive: true },
  );
  const snapshots = [];
  for (const name of (await readdir(root)).sort()) {
    const snapshotPath = path.join(root, name);
    const manifestPath = path.join(snapshotPath, "manifest.json");
    const manifest = JSON.parse((await readFile(manifestPath)).toString("utf8"));
    snapshots.push({ snapshotPath, manifestPath, manifest });
  }
  snapshots.sort((left, right) =>
    String(left.manifest.capturedAt).localeCompare(String(right.manifest.capturedAt)));
  const latest = snapshots.at(-1)!;
  let targetIndex = -1;
  let targetPath = "";
  let targetRecord: any = null;
  for (let index = 0; index < latest.manifest.records.length; index += 1) {
    const file = path.join(latest.snapshotPath, String(latest.manifest.records[index].file));
    const candidate = JSON.parse((await readFile(file)).toString("utf8"));
    if (candidate.status !== "COMPLETE") {
      targetIndex = index;
      targetPath = file;
      targetRecord = candidate;
      break;
    }
  }
  assert.ok(targetIndex >= 0 && targetRecord, `mutation fixture ${label} has no unfinished record`);
  mutate(targetRecord);
  const bytes = Buffer.from(JSON.stringify(targetRecord), "utf8");
  await writeFile(targetPath, bytes);
  latest.manifest.records[targetIndex].byteLength = bytes.byteLength;
  latest.manifest.records[targetIndex].sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(latest.manifestPath, JSON.stringify(latest.manifest));
  return root;
}

function createCoordinator(
  plan: RavioliCurrentResumePlan,
  primingMode?: "browser-exact" | "authenticated-state",
  preparedSealedPinRecovery?: RavioliPreparedSealedPinRecoveryBridge,
  rejectFirstContinuation = false,
) {
  const delegated: Record<RavioliUiLiveJournalActor, PastaUiLiveBridgeRequest[]> = {
    creator: [],
    collector1: [],
    collector2: [],
  };
  let remainingRejections = rejectFirstContinuation ? 1 : 0;
  const coordinator = createRavioliCurrentResumeCoordinator({
    plan,
    ...(primingMode ? { primingMode } : {}),
    ...(preparedSealedPinRecovery ? { preparedSealedPinRecovery } : {}),
    delegates: Object.fromEntries(ACTORS.map((actor) => [
      actor,
      async (request: PastaUiLiveBridgeRequest) => {
        if (remainingRejections > 0) {
          remainingRejections -= 1;
          throw new Error("simulated continuation preflight rejection");
        }
        delegated[actor].push(request);
        return { delegated: actor };
      },
    ])) as any,
  });
  return { coordinator, delegated };
}

test("browser-exact operation-14 recovery replays the settled collector purchase and delegates operation 15 first", async (t) => {
  const plan = await loadCurrentOp14Plan(t);
  if (!plan) return;
  assert.equal(plan.completedOperationCount, 14);
  assert.equal(plan.operations.length, 14);
  assert.equal(plan.pins.length, 10);
  assert.equal(plan.nextOperation?.globalOrdinal, 15);
  assert.equal(plan.nextOperation?.actor, "collector2");
  assert.equal(plan.nextOperation?.action, "call");
  assert.equal(plan.nextOperation?.entrypoint, "buy");

  const operation14 = plan.operations.at(-1);
  assert.ok(operation14);
  assert.equal(operation14.expected.globalOrdinal, 14);
  assert.equal(operation14.actor, "collector1");
  assert.equal(operation14.expected.entrypoint, "buy");
  assert.equal(operation14.eventIndex, 53);

  const exact = createCoordinator(plan);
  const creatorSteps = [
    ...plan.pins.filter((pin) => pin.actor === "creator"),
    ...plan.operations.filter((operation) => operation.actor === "creator"),
  ].sort((left, right) => left.eventIndex - right.eventIndex);
  for (const [index, step] of creatorSteps.entries()) {
    await exact.coordinator.handles.creator(replayRequest(step, `creator-prefix-${index + 1}`));
  }
  assert.equal(exact.coordinator.isReplayComplete(), false);
  assert.equal(exact.coordinator.getRemainingReplayStepCount(), 1);
  assert.equal(exact.coordinator.continuationStarted(), false);
  assert.deepEqual(
    Object.fromEntries(ACTORS.map((actor) => [actor, exact.delegated[actor].length])),
    { creator: 0, collector1: 0, collector2: 0 },
  );

  await assert.rejects(
    exact.coordinator.handles.collector2(callRequest("premature-op15", "buy")),
    /attempted a new mutation before every actor replayed its authenticated prefix/,
  );
  const replayed = await exact.coordinator.handles.collector1(
    replayRequest(operation14, "exact-operation-14"),
  );
  assert.deepEqual(replayed, {
    operationHash: operation14.operationHash,
    confirmationLevel: 1,
  });
  assert.equal(exact.coordinator.isReplayComplete(), true);
  assert.equal(exact.coordinator.getRemainingReplayStepCount(), 0);
  assert.equal(exact.coordinator.continuationStarted(), false);
  assert.equal(exact.delegated.collector1.length, 0);

  await exact.coordinator.handles.collector2(callRequest("exact-operation-15", "buy", {
    contractAddress: plan.targetBindings.router,
    payload: { token_id: 1, amount: 1 },
  }));
  assert.equal(exact.coordinator.continuationStarted(), true);
  assert.equal(exact.delegated.collector2.length, 1);
  assert.equal(exact.delegated.creator.length, 0);
});

test("authenticated-state operation-14 recovery makes the historical buyer write unreachable and admits only operation 15", async (t) => {
  const plan = await loadCurrentOp14Plan(t);
  if (!plan) return;
  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 0);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 24);
  assert.equal(primed.coordinator.continuationStarted(), false);
  const operation14 = plan.operations.at(-1)!;
  await assert.rejects(
    primed.coordinator.handles.collector1(
      replayRequest(operation14, "forbidden-operation-14-replay"),
    ),
    /first continuation mutation differs from global operation 15/,
  );
  assert.equal(primed.delegated.collector1.length, 0);
  assert.equal(primed.coordinator.continuationStarted(), false);
  await primed.coordinator.handles.collector2(callRequest("exact-operation-15", "buy", {
    contractAddress: plan.targetBindings.router,
    payload: { token_id: 1, amount: 1 },
  }));
  assert.equal(primed.coordinator.continuationStarted(), true);
  assert.equal(primed.delegated.collector2.length, 1);
});

test("authenticated-state operation-20 replays only the exact event-60-to-74 browser suffix and delegates operation 21 first", async (t) => {
  const plan = await loadCurrentOp20Plan(t);
  if (!plan) return;
  assert.equal(plan.completedOperationCount, 20);
  assert.equal(plan.operations.length, 20);
  assert.equal(plan.pins.length, 13);
  assert.deepEqual({
    globalOrdinal: plan.nextOperation?.globalOrdinal,
    id: plan.nextOperation?.id,
    actor: plan.nextOperation?.actor,
    action: plan.nextOperation?.action,
    entrypoint: plan.nextOperation?.entrypoint,
  }, {
    globalOrdinal: 21,
    id: "mode-2-blind-allocated-mint:create-pack",
    actor: "creator",
    action: "call",
    entrypoint: "create_pack",
  });

  const suffix = [
    ...plan.pins,
    ...plan.operations,
  ].filter((step) => step.eventIndex > 59)
    .sort((left, right) => left.eventIndex - right.eventIndex);
  assert.deepEqual(suffix.map((step) => step.kind === "pin"
    ? [step.eventIndex, step.kind, step.pinSequence]
    : [step.eventIndex, step.kind, step.expected.globalOrdinal]), [
    [60, "pin", 11],
    [61, "pin", 12],
    [64, "operation", 17],
    [67, "operation", 18],
    [70, "operation", 19],
    [73, "operation", 20],
    [74, "pin", 13],
  ]);

  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), false);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 26);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 7);
  assert.equal(primed.coordinator.getRemainingReplayStepCount("creator"), 7);
  assert.equal(primed.coordinator.getRemainingReplayStepCount("collector1"), 0);
  assert.equal(primed.coordinator.getRemainingReplayStepCount("collector2"), 0);

  await assert.rejects(
    primed.coordinator.handles.creator(callRequest("premature-operation-21", "create_pack")),
    /expected creator replay step 24 \(pin_blob\), received call/,
  );
  for (const [index, step] of suffix.entries()) {
    const replayed = await primed.coordinator.handles[step.actor](
      replayRequest(step, `operation-20-browser-suffix-${index + 1}`),
    );
    assert.deepEqual(
      replayed,
      step.kind === "pin"
        ? { pin: step.proof }
        : {
            ...(step.action === "originate" ? { contractAddress: step.contractAddress } : {}),
            operationHash: step.operationHash,
            confirmationLevel: 1,
          },
    );
    assert.deepEqual(
      Object.fromEntries(ACTORS.map((actor) => [actor, primed.delegated[actor].length])),
      { creator: 0, collector1: 0, collector2: 0 },
      `authenticated event ${step.eventIndex} escaped to a side-effect delegate`,
    );
  }
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 33);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 0);
  assert.equal(primed.coordinator.continuationStarted(), false);

  for (const step of suffix.filter((candidate) =>
    (candidate.kind === "pin" && candidate.pinSequence <= 12)
    || (candidate.kind === "operation" && candidate.expected.globalOrdinal <= 20))) {
    await assert.rejects(
      primed.coordinator.handles[step.actor](replayRequest(step, "forbidden-historical-repeat")),
      /refusing duplicate recovered side effect|first continuation mutation differs from global operation 21/,
    );
  }
  assert.deepEqual(
    Object.fromEntries(ACTORS.map((actor) => [actor, primed.delegated[actor].length])),
    { creator: 0, collector1: 0, collector2: 0 },
  );

  await primed.coordinator.handles.creator(callRequest("exact-operation-21", "create_pack", {
    contractAddress: plan.targetBindings.router,
    payload: { expected_token_id: 2 },
  }));
  assert.equal(primed.coordinator.continuationStarted(), true);
  assert.equal(primed.delegated.creator.length, 1);
  assert.equal(primed.delegated.creator[0]?.action, "call");
  assert.equal((primed.delegated.creator[0]?.payload as any).call.entrypoint, "create_pack");
});

test("authenticated-state operation-20 rejects a valid journal that stops before exact event 74 and pin 13", async (t) => {
  const incomplete = await loadCurrentPrefixPlan(t, {
    eventCount: 73,
    pinCount: 12,
    completedOperationCount: 20,
  });
  if (!incomplete) return;
  assert.throws(
    () => createCoordinator(incomplete, "authenticated-state"),
    /operation-20\/event-74\/thirteen-pin authenticated boundary drift/,
  );
});

test("operation-20 authenticates and adopts only its exact prepared sealed pin without mutating recovery", async (t) => {
  let exactPrivateRecoveryRoot: string;
  try {
    exactPrivateRecoveryRoot = await exactOp20PrivateRecoveryRoot(t);
  } catch {
    t.skip("the exact operation-20 private recovery snapshot is unavailable");
    return;
  }
  const plan = await loadCurrentPrefixPlan(t, {
    eventCount: 74,
    pinCount: 13,
    completedOperationCount: 20,
    journalRoot: AGGREGATE_OP20_JOURNAL,
    privateRecoveryRoot: exactPrivateRecoveryRoot,
  });
  if (!plan) return;
  let envelopeBytes: Uint8Array;
  try {
    const response = await fetch(`http://127.0.0.1:8080/ipfs/${AGGREGATE_OP20_CID}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    envelopeBytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    t.skip("the exact operation-20 prepared Kubo block is unavailable");
    return;
  }
  const beforeFiles = await immutableFileInventory(exactPrivateRecoveryRoot);
  const source = plan.privateRecovery;
  assert.ok(source);
  const sourceRecord = source.records.find((record) =>
    record.status === "IN_PROGRESS" && record.tokenId === 2);
  assert.ok(sourceRecord);

  const bridge = reconcileRavioliPreparedSealedPinRecovery({ plan, envelopeBytes });
  assert.equal(bridge.evidence.completedOperationCount, 20);
  assert.equal(bridge.evidence.nextGlobalOperation, 21);
  assert.equal(bridge.evidence.authenticatedThroughEventIndex, 59);
  assert.equal(bridge.evidence.preparedPinCid, AGGREGATE_OP20_CID);
  assert.equal(bridge.evidence.preparedPinSha256, sourceRecord.stage === "PIN_SEALED_REVEAL:PREPARED"
    ? createHash("sha256").update(envelopeBytes).digest("hex")
    : "");
  assert.equal(bridge.envelope.cid, AGGREGATE_OP20_CID);
  assert.deepEqual(Buffer.from(bridge.envelope.bytes), Buffer.from(envelopeBytes));
  assert.equal(bridge.entropy.iv.byteLength, 12);
  assert.match(bridge.entropy.nonceHex, /^[0-9a-f]{64}$/);
  assert.match(bridge.entropy.saltHex, /^[0-9a-f]{64}$/);
  const serialized = JSON.stringify(bridge);
  assert.equal(serialized.includes(exactPrivateRecoveryRoot), false);
  assert.equal(serialized.includes(sourceRecord.storageKey), false);
  assert.equal(serialized.includes(bridge.entropy.nonceHex), false);
  assert.equal(serialized.includes(bridge.entropy.saltHex), false);
  const restored = bridge.restoration.records.find((record) =>
    record.storageKey === sourceRecord.storageKey);
  assert.ok(restored);
  assert.equal(restored.status, "COMPLETE");
  assert.equal(restored.stage, "RECOVERY_PREPARED_PIN_AUTHENTICATED_FOR_REPLAY");
  assert.equal(sourceRecord.status, "IN_PROGRESS");
  assert.deepEqual(await immutableFileInventory(exactPrivateRecoveryRoot), beforeFiles);

  const suffix = [...plan.pins, ...plan.operations]
    .filter((step) => step.eventIndex > 59
      && !(step.kind === "pin" && step.pinSequence === 12)
      && !(step.kind === "operation" && step.expected.globalOrdinal === 17))
    .sort((left, right) => left.eventIndex - right.eventIndex);
  assert.deepEqual(
    suffix.map((step) => step.kind === "pin"
      ? `pin-${step.pinSequence}`
      : `operation-${step.expected.globalOrdinal}`),
    ["pin-11", "operation-18", "operation-19", "operation-20", "pin-13"],
  );
  const primed = createCoordinator(plan, "authenticated-state", bridge);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 26);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 5);
  for (const [index, step] of suffix.entries()) {
    await primed.coordinator.handles[step.actor](
      replayRequest(step, `prepared-operation-20-browser-suffix-${index + 1}`),
    );
  }
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 0);
  assert.equal(primed.coordinator.continuationStarted(), false);
  await primed.coordinator.handles.creator({
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: "adopt-exact-prepared-sealed-pin",
    action: "pin_json",
    payload: {
      fileName: bridge.envelope.fileName,
      value: encodeBridgeValue(bridge.envelope.value),
    },
  });
  assert.equal(primed.coordinator.continuationStarted(), false);
  assert.equal(primed.delegated.creator.length, 1);
  assert.equal(primed.delegated.creator[0]?.action, "pin_json");

  const drifted = Uint8Array.from(envelopeBytes);
  drifted[drifted.length - 1] ^= 1;
  assert.throws(
    () => reconcileRavioliPreparedSealedPinRecovery({ plan, envelopeBytes: drifted }),
    /envelope bytes differ from the durable checkpoint/,
  );
  assert.throws(
    () => reconcileRavioliPreparedSealedPinRecovery({
      plan: { ...plan } as RavioliCurrentResumePlan,
      envelopeBytes,
    }),
    /requires the exact live-reconciled plan object/,
  );
});

test("authenticated-state priming starts exact op23 at Rotini adapter op24 and leaves later semantic validation to the delegate", async (t) => {
  const plan = await loadCurrentOp23Plan(t);
  if (!plan) return;
  assert.equal(plan.completedOperationCount, 23);
  assert.equal(plan.operations.length, 23);
  assert.equal(plan.pins.length, 15);
  assert.equal(plan.nextOperation?.globalOrdinal, 24);
  assert.equal(plan.nextOperation?.id, "mode-3-blind-generative-mint:originate-rotini-adapter");
  assert.equal(plan.nextOperation?.actor, "creator");
  assert.equal(plan.nextOperation?.action, "originate");
  assert.equal(plan.nextOperation?.entrypoint, undefined);

  assert.throws(
    () => createCoordinator({ ...plan } as RavioliCurrentResumePlan, "authenticated-state"),
    /authenticated-state priming requires the exact live-reconciled plan object/,
  );

  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 0);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 38);
  assert.equal(primed.coordinator.continuationStarted(), false);

  await assert.rejects(
    primed.coordinator.handles.collector1(op24Origination("wrong-actor")),
    /first continuation mutation differs from global operation 24/,
  );
  await assert.rejects(
    primed.coordinator.handles.creator(callRequest("wrong-action-entrypoint", "add_pack_minter")),
    /first continuation mutation differs from global operation 24/,
  );
  const historicalOperation = plan.operations[0];
  assert.ok(historicalOperation);
  await assert.rejects(
    primed.coordinator.handles[historicalOperation.actor](
      replayRequest(historicalOperation, "historical-duplicate-before-op24"),
    ),
    /first continuation mutation differs from global operation 24/,
  );
  assert.deepEqual(
    Object.fromEntries(ACTORS.map((actor) => [actor, primed.delegated[actor].length])),
    { creator: 0, collector1: 0, collector2: 0 },
  );

  await primed.coordinator.handles.creator(newPin("new-mode-3-pin"));
  assert.equal(primed.coordinator.continuationStarted(), false);
  assert.equal(primed.delegated.creator.length, 1);
  await primed.coordinator.handles.creator(op24Origination("exact-op24"));
  assert.equal(primed.coordinator.continuationStarted(), true);
  assert.equal(primed.delegated.creator.length, 2);
  await primed.coordinator.handles[historicalOperation.actor](
    replayRequest(historicalOperation, "semantic-hook-validates-after-op24"),
  );
  assert.equal(primed.delegated[historicalOperation.actor].length, 3);
});

test("authenticated-state op30 replays its trailing pin and admits duplicated op18 descriptor only as semantic op31", async (t) => {
  const plan = await loadCurrentOp30Plan(t);
  if (!plan) return;
  assert.equal(plan.completedOperationCount, 30);
  assert.equal(plan.operations.length, 30);
  assert.equal(plan.pins.length, 21);
  assert.equal(plan.nextOperation?.globalOrdinal, 31);
  assert.equal(plan.nextOperation?.id, "mode-4-hybrid-atomic-pack:authorize-gnocchi-adapter");
  assert.equal(plan.nextOperation?.actor, "creator");
  assert.equal(plan.nextOperation?.action, "call");
  assert.equal(plan.nextOperation?.entrypoint, "add_minter");

  const lastAppliedOperation = plan.operations.at(-1);
  const trailingPin = plan.pins.at(-1);
  const historicalOp18 = plan.operations[17];
  const wrongHistoricalSigner = plan.operations.find(
    (operation) => operation.action === "call" && operation.expected.entrypoint !== "add_minter",
  );
  assert.ok(lastAppliedOperation);
  assert.ok(trailingPin);
  assert.ok(historicalOp18);
  assert.ok(wrongHistoricalSigner);
  assert.equal(lastAppliedOperation.eventIndex, 111);
  assert.equal(trailingPin.eventIndex, 112);
  assert.equal(historicalOp18.expected.globalOrdinal, 18);
  assert.equal(historicalOp18.expected.actor, "creator");
  assert.equal(historicalOp18.expected.action, "call");
  assert.equal(historicalOp18.expected.entrypoint, "add_minter");

  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), false);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 1);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 50);

  await assert.rejects(
    primed.coordinator.handles[trailingPin.actor](newPin("drifted-trailing-pin-21")),
    /creator replay step 48 bytes or descriptor drifted/,
  );
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 1);
  assert.equal(primed.delegated[trailingPin.actor].length, 0);

  const replayedPin = await primed.coordinator.handles[trailingPin.actor](
    replayRequest(trailingPin, "exact-trailing-pin-21"),
  );
  assert.deepEqual(replayedPin, { pin: trailingPin.proof });
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 0);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 51);
  assert.equal(primed.delegated[trailingPin.actor].length, 0);

  await assert.rejects(
    primed.coordinator.handles[wrongHistoricalSigner.actor](
      replayRequest(wrongHistoricalSigner, "wrong-historical-first-signer"),
    ),
    /first continuation mutation differs from global operation 31/,
  );
  assert.equal(primed.coordinator.continuationStarted(), false);
  assert.equal(primed.delegated[wrongHistoricalSigner.actor].length, 0);

  await primed.coordinator.handles.creator(
    replayRequest(historicalOp18, "op31-reuses-op18-descriptor"),
  );
  assert.equal(primed.coordinator.continuationStarted(), true);
  assert.equal(primed.delegated.creator.length, 1);

  await primed.coordinator.handles.creator(
    replayRequest(historicalOp18, "semantic-hook-validates-after-op31"),
  );
  assert.equal(primed.delegated.creator.length, 2);
});

test("authenticated-state op55 authenticates the terminal five-mode boundary and admits only operation 56", async (t) => {
  const plan = await loadCurrentOp55Plan(t);
  if (!plan) return;
  assert.equal(plan.completedOperationCount, 55);
  assert.equal(plan.operations.length, 55);
  assert.equal(plan.pins.length, 30);
  assert.equal(plan.nextOperation?.globalOrdinal, 56);
  assert.equal(plan.nextOperation?.id, "withheld-reveal-refund:authorize-adapter");
  assert.equal(plan.nextOperation?.actor, "creator");
  assert.equal(plan.nextOperation?.action, "call");
  assert.equal(plan.nextOperation?.entrypoint, "add_minter");

  const historicalOpen = plan.operations.at(-1)!;
  const historicalAddMinter = plan.operations.find(
    (operation) => operation.expected.globalOrdinal === 18,
  )!;
  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 0);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 85);
  assert.equal(primed.coordinator.continuationStarted(), false);

  await assert.rejects(
    primed.coordinator.handles.collector1(
      replayRequest(historicalOpen, "duplicate-op55"),
    ),
    /first continuation mutation differs from global operation 56/,
  );
  assert.equal(primed.coordinator.continuationStarted(), false);
  assert.equal(primed.delegated.collector1.length, 0);

  await primed.coordinator.handles.creator(
    replayRequest(historicalAddMinter, "operation-56-reuses-authorized-entrypoint"),
  );
  assert.equal(primed.coordinator.continuationStarted(), true);
  assert.equal(primed.delegated.creator.length, 1);
});

test("authenticated-state op63 authenticates the purchased withheld fixture and admits only operation 64", async (t) => {
  const plan = await loadCurrentOp63Plan(t);
  if (!plan) return;
  assert.equal(plan.completedOperationCount, 63);
  assert.equal(plan.operations.length, 63);
  assert.equal(plan.pins.length, 34);
  assert.equal(plan.nextOperation?.globalOrdinal, 64);
  assert.equal(plan.nextOperation?.id, "withheld-reveal-refund:collector2-credit-holder-refund");
  assert.equal(plan.nextOperation?.actor, "collector2");
  assert.equal(plan.nextOperation?.action, "call");
  assert.equal(plan.nextOperation?.entrypoint, "refund_blind_claims");

  const historicalPurchase = plan.operations.at(-1)!;
  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 0);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 97);
  assert.equal(primed.coordinator.continuationStarted(), false);

  await assert.rejects(
    primed.coordinator.handles.collector1(
      replayRequest(historicalPurchase, "duplicate-op63"),
    ),
    /first continuation mutation differs from global operation 64/,
  );
  assert.equal(primed.coordinator.continuationStarted(), false);
  assert.equal(primed.delegated.collector1.length, 0);

  await assert.rejects(
    primed.coordinator.handles.collector2(callRequest("operation-64-wrong-target", "refund_blind_claims", {
      contractAddress: plan.targetBindings.blindController,
      payload: {
        token_id: 5,
        holder: historicalPurchase.evidence.signerAddress,
        amount: 1,
        expected_claim_id: 0,
      },
    })),
    /first continuation mutation differs from global operation 64/,
  );
  await assert.rejects(
    primed.coordinator.handles.collector2(callRequest("operation-64-wrong-token", "refund_blind_claims", {
      contractAddress: plan.targetBindings.router,
      payload: {
        token_id: 4,
        holder: historicalPurchase.evidence.signerAddress,
        amount: 1,
        expected_claim_id: 0,
      },
    })),
    /first continuation mutation differs from global operation 64/,
  );
  await primed.coordinator.handles.collector2(callRequest("operation-64", "refund_blind_claims", {
    contractAddress: plan.targetBindings.router,
    payload: {
      token_id: 5,
      holder: historicalPurchase.evidence.signerAddress,
      amount: 1,
      expected_claim_id: 0,
    },
  }));
  assert.equal(primed.coordinator.continuationStarted(), true);
  assert.equal(primed.delegated.collector2.length, 1);

  const retryable = createCoordinator(plan, "authenticated-state", undefined, true);
  const exactRefund = callRequest("operation-64-retryable", "refund_blind_claims", {
    contractAddress: plan.targetBindings.router,
    payload: {
      token_id: 5,
      holder: historicalPurchase.evidence.signerAddress,
      amount: 1,
      expected_claim_id: 0,
    },
  });
  await assert.rejects(
    retryable.coordinator.handles.collector2(exactRefund),
    /simulated continuation preflight rejection/,
  );
  assert.equal(retryable.coordinator.continuationStarted(), false);
  assert.equal(retryable.delegated.collector2.length, 0);
  await retryable.coordinator.handles.collector2(exactRefund);
  assert.equal(retryable.coordinator.continuationStarted(), true);
  assert.equal(retryable.delegated.collector2.length, 1);
});

test("authenticated-state op64 authenticates the refund and admits only operation 65 cancellation", async (t) => {
  const plan = await loadCurrentOp64Plan(t);
  if (!plan) return;
  assert.equal(plan.completedOperationCount, 64);
  assert.equal(plan.operations.length, 64);
  assert.equal(plan.pins.length, 34);
  assert.equal(plan.nextOperation?.globalOrdinal, 65);
  assert.equal(plan.nextOperation?.id, "withheld-reveal-refund:collector2-cancel-after-refunds");
  assert.equal(plan.nextOperation?.actor, "collector2");
  assert.equal(plan.nextOperation?.action, "call");
  assert.equal(plan.nextOperation?.entrypoint, "cancel_unrevealed_pack");
  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 98);
  assert.equal(primed.coordinator.continuationStarted(), false);
  await primed.coordinator.handles.collector2({
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: "op65-head-timestamp-preflight",
    action: "block_header",
    payload: { block: "head" },
  });
  assert.equal(primed.coordinator.continuationStarted(), false);
  assert.equal(primed.delegated.collector2.length, 1);
  await assert.rejects(
    primed.coordinator.handles.collector2(callRequest("wrong-op65-token", "cancel_unrevealed_pack", {
      contractAddress: plan.targetBindings.router,
      payload: 4,
    })),
    /first continuation mutation differs from global operation 65/,
  );
  await primed.coordinator.handles.collector2(callRequest("exact-op65", "cancel_unrevealed_pack", {
    contractAddress: plan.targetBindings.router,
    payload: 5,
  }));
  assert.equal(primed.coordinator.continuationStarted(), true);
  assert.equal(primed.delegated.collector2.length, 2);
});

test("authenticated-state op66 authenticates closure and withdrawal and admits only operation 67 recovery", async (t) => {
  const plan = await loadCurrentOp66Plan(t);
  if (!plan) return;
  assert.equal(plan.completedOperationCount, 66);
  assert.equal(plan.operations.length, 66);
  assert.equal(plan.pins.length, 34);
  assert.equal(plan.nextOperation?.globalOrdinal, 67);
  assert.equal(plan.nextOperation?.id, "withheld-reveal-refund:creator-recover-adapter");
  assert.equal(plan.nextOperation?.actor, "creator");
  assert.equal(plan.nextOperation?.action, "call");
  assert.equal(plan.nextOperation?.entrypoint, "recover_adapter");
  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 100);
  assert.equal(primed.coordinator.continuationStarted(), false);
  const exactPayload = {
    token_id: 5,
    adapter: plan.targetBindings.gnocchiAdapter,
    kind: 1,
    resource_id: 2,
    capacity: 2,
  };
  await assert.rejects(
    primed.coordinator.handles.creator(callRequest("wrong-op67-capacity", "recover_adapter", {
      contractAddress: plan.targetBindings.router,
      payload: { ...exactPayload, capacity: 1 },
    })),
    /first continuation mutation differs from global operation 67/,
  );
  assert.equal(primed.coordinator.continuationStarted(), false);
  await primed.coordinator.handles.creator(callRequest("exact-op67", "recover_adapter", {
    contractAddress: plan.targetBindings.router,
    payload: exactPayload,
  }));
  assert.equal(primed.coordinator.continuationStarted(), true);
  assert.equal(primed.delegated.creator.length, 1);
});

test("authenticated-state op67 is terminal and refuses every further signer mutation", async (t) => {
  const plan = await loadCurrentOp67Plan(t);
  if (!plan) return;
  assert.equal(plan.classification, "CURRENT_TERMINAL");
  assert.equal(plan.completedOperationCount, 67);
  assert.equal(plan.operations.length, 67);
  assert.equal(plan.pins.length, 34);
  assert.equal(plan.nextOperation, null);
  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getCompletedReplayStepCount(), 101);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 0);
  assert.equal(primed.coordinator.continuationStarted(), false);
  await primed.coordinator.handles.creator({
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: "terminal-head-read",
    action: "block_header",
    payload: { block: "head" },
  });
  assert.equal(primed.coordinator.continuationStarted(), false);
  assert.equal(primed.delegated.creator.length, 1);
  await assert.rejects(
    primed.coordinator.handles.creator(callRequest("forbidden-op68", "recover_adapter", {
      contractAddress: plan.targetBindings.router,
      payload: {
        token_id: 5,
        adapter: plan.targetBindings.gnocchiAdapter,
        kind: 1,
        resource_id: 2,
        capacity: 2,
      },
    })),
    /terminal journal refuses another bridge mutation/,
  );
  assert.equal(primed.coordinator.continuationStarted(), false);
  assert.equal(primed.delegated.creator.length, 1);
  await assert.rejects(
    primed.coordinator.handles.creator(newPin("forbidden-terminal-pin")),
    /terminal journal refuses another bridge mutation/,
  );
  assert.equal(primed.coordinator.continuationStarted(), false);
  assert.equal(primed.delegated.creator.length, 1);
});

test("op30 reconciles only the exact rejected-before-delegation private record in memory", async (t) => {
  const plan = await loadCurrentOp30PrivateRecoveryPlan(t);
  if (!plan) return;
  const beforeFiles = await immutableFileInventory(CURRENT_PRIVATE_RECOVERY);
  const source = plan.privateRecovery;
  assert.ok(source);
  const sourceUnfinished = source.records.filter((record) => record.status !== "COMPLETE");
  assert.equal(sourceUnfinished.length, 1);
  const sourceRecord = sourceUnfinished[0]!;
  const sourceValue = JSON.parse(sourceRecord.value);
  assert.equal(sourceRecord.tokenId, 4);
  assert.equal(sourceRecord.status, "FAILED");
  assert.equal(sourceRecord.stage, "PUBLISH_FAILED");
  assert.deepEqual(sourceRecord.operationHashes, []);

  const bridge = reconcileRavioliRejectedPreDelegationRecovery(plan);
  assert.equal(bridge.evidence.disposition, "VERIFIED_REJECTED_BEFORE_DELEGATION");
  assert.equal(bridge.evidence.sourceRecordSha256, sourceRecord.sha256);
  assert.equal(bridge.evidence.operationHashAbsent, true);
  assert.equal(bridge.evidence.diskSnapshotMutated, false);
  assert.notEqual(bridge.evidence.reconciledRecordSha256, sourceRecord.sha256);
  assert.equal(JSON.stringify(bridge).includes(CURRENT_PRIVATE_RECOVERY), false);
  assert.equal(JSON.stringify(bridge).includes(sourceRecord.storageKey), false);
  const restored = bridge.restoration.records.find(
    (record) => record.storageKey === sourceRecord.storageKey,
  );
  assert.ok(restored);
  assert.equal(restored.status, "COMPLETE");
  assert.equal(restored.stage, "RECOVERY_BRIDGE_REJECTION_VERIFIED_NO_SUBMISSION");
  assert.deepEqual(restored.operationHashes, []);
  const restoredValue = JSON.parse(restored.value);
  assert.deepEqual(restoredValue.history.slice(0, -1), sourceValue.history);
  assert.deepEqual(
    Object.fromEntries(Object.entries(restoredValue).filter(([key]) =>
      !["status", "history", "updatedAt"].includes(key))),
    Object.fromEntries(Object.entries(sourceValue).filter(([key]) =>
      !["status", "history", "updatedAt"].includes(key))),
  );
  assert.equal(restoredValue.status, "COMPLETE");
  assert.equal(restoredValue.history.at(-1).stage, bridge.evidence.terminalStage);
  assert.equal(restoredValue.history.at(-1).details.sourceRecoverySha256, sourceRecord.sha256);
  assert.equal(plan.privateRecovery!.records.find(
    (record) => record.storageKey === sourceRecord.storageKey,
  )!.status, "FAILED");
  assert.deepEqual(await immutableFileInventory(CURRENT_PRIVATE_RECOVERY), beforeFiles);

  assert.throws(
    () => reconcileRavioliRejectedPreDelegationRecovery({ ...plan } as RavioliCurrentResumePlan),
    /requires the exact live-reconciled plan object/,
  );
});

test("op30 rejected-before-delegation recovery fails closed on message, pin, intent, and hash drift", async (t) => {
  try {
    const info = await lstat(CURRENT_PRIVATE_RECOVERY);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("not a real directory");
    const manifestInfo = await lstat(path.join(CURRENT_OP30_PRIVATE_RECOVERY_SNAPSHOT, "manifest.json"));
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw new Error("manifest is unavailable");
  } catch {
    t.skip("current operation-30 private recovery fixture is unavailable");
    return;
  }
  const cases: Array<readonly [string, (record: any) => void, RegExp]> = [
    ["message", (record) => {
      record.history[4].details.message = "different pre-delegation failure";
    }, /failure drift/],
    ["pin", (record) => {
      record.history[2].details.valueSha256 = "0".repeat(64);
    }, /wrapper pin confirmation drift/],
    ["intent", (record) => {
      const details = record.history[3].details;
      details.intent.target = record.contract;
      details.intent.payload = record.contract;
      details.intentSha256 = createHash("sha256")
        .update(deterministicJsonBytes(details.intent))
        .digest("hex");
    }, /signer intent drift/],
    ["operation-hash", (record) => {
      record.history[3].operationHash =
        "oo8HnV5wXxJDoCW8rG8NGqxzTaTVcgB4mbww5T9wcEhJdbsMYMD";
    }, /public record identity drift/],
  ];
  for (const [label, mutate, expected] of cases) {
    const privateRecoveryRoot = await mutatedPrivateRecoveryRoot(t, label, mutate);
    const plan = await loadCurrentPrefixPlan(t, {
      eventCount: 112,
      pinCount: 21,
      completedOperationCount: 30,
      privateRecoveryRoot,
    });
    assert.ok(plan, `${label} plan was unexpectedly skipped`);
    assert.throws(
      () => reconcileRavioliRejectedPreDelegationRecovery(plan),
      expected,
      `${label} drift was not rejected`,
    );
  }
});

test("authenticated-state call continuation rejects an exact actor/action with the wrong entrypoint", async (t) => {
  const plan = await loadCurrentPrefixPlan(t, {
    eventCount: 38,
    pinCount: 10,
    completedOperationCount: 9,
  });
  if (!plan) return;
  assert.equal(plan.nextOperation?.globalOrdinal, 10);
  assert.equal(plan.nextOperation?.actor, "creator");
  assert.equal(plan.nextOperation?.action, "call");
  assert.equal(plan.nextOperation?.entrypoint, "create_pack");

  const primed = createCoordinator(plan, "authenticated-state");
  assert.equal(primed.coordinator.isReplayComplete(), true);
  assert.equal(primed.coordinator.getRemainingReplayStepCount(), 0);
  await assert.rejects(
    primed.coordinator.handles.creator(callRequest("wrong-op10-entrypoint", "commit_recipe")),
    /first continuation mutation differs from global operation 10/,
  );
  assert.equal(primed.delegated.creator.length, 0);
  assert.equal(primed.coordinator.continuationStarted(), false);

  await primed.coordinator.handles.creator(callRequest("exact-op10-entrypoint", "create_pack", {
    contractAddress: plan.targetBindings.router,
    payload: { expected_token_id: 1 },
  }));
  assert.equal(primed.delegated.creator.length, 1);
  assert.equal(primed.coordinator.continuationStarted(), true);
});

test("browser-exact remains the default and replays the authenticated prefix without delegation", async (t) => {
  const plan = await loadCurrentOp23Plan(t);
  if (!plan) return;
  const exact = createCoordinator(plan);
  assert.equal(exact.coordinator.isReplayComplete(), false);
  assert.equal(exact.coordinator.getRemainingReplayStepCount(), 38);
  assert.equal(exact.coordinator.getCompletedReplayStepCount(), 0);

  const firstCreatorStep = [
    ...plan.pins.filter((pin) => pin.actor === "creator"),
    ...plan.operations.filter((operation) => operation.actor === "creator"),
  ].sort((left, right) => left.eventIndex - right.eventIndex)[0];
  assert.ok(firstCreatorStep);
  await exact.coordinator.handles.creator(replayRequest(firstCreatorStep, "first-exact-replay"));
  assert.equal(exact.coordinator.getCompletedReplayStepCount(), 1);
  assert.equal(exact.delegated.creator.length, 0);
  await assert.rejects(
    exact.coordinator.handles.creator(op24Origination("premature-op24")),
    /expected creator replay step 2/,
  );
  assert.equal(exact.delegated.creator.length, 0);
});
