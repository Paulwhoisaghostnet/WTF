import assert from "node:assert/strict";
import { copyFile, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { PastaUiLiveBridgeRequest } from "./pasta-ui-live-bridge-kit";
import { PASTA_UI_LIVE_BRIDGE_SCHEMA } from "./pasta-ui-live-bridge-kit";
import {
  openRavioliUiLiveJournal,
  type RavioliUiLiveJournalActor,
} from "./shadownet-ravioli-ui-live-journal";
import {
  createRavioliCurrentResumeCoordinator,
  reconcileRavioliCurrentResume,
  type RavioliCurrentResumeExpectedIdentity,
  type RavioliCurrentResumePlan,
} from "./shadownet-ravioli-current-resume";

const CURRENT_OP23_JOURNAL = path.resolve(
  "artifacts/pasta-protocol-proof-runs/pasta-alpha-proof-20260808t140453z/ravioli/artifacts/journal",
);
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

function callRequest(id: string, entrypoint: string): PastaUiLiveBridgeRequest {
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action: "call",
    payload: {
      call: {
        contractAddress: "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i",
        entrypoint,
        payload: null,
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
  }>,
): Promise<RavioliCurrentResumePlan | null> {
  try {
    const info = await lstat(CURRENT_OP23_JOURNAL);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("journal is not a real directory");
  } catch {
    t.skip(`current op23 journal fixture is unavailable at ${CURRENT_OP23_JOURNAL}`);
    return null;
  }
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-current-op23-priming-"));
  const frozenRoot = path.join(parent, "journal");
  try {
    await mkdir(path.join(frozenRoot, "events"), { recursive: true });
    await mkdir(path.join(frozenRoot, "pins"), { recursive: true });
    await copyFile(
      path.join(CURRENT_OP23_JOURNAL, "intent.json"),
      path.join(frozenRoot, "intent.json"),
    );
    const eventNames = (await readdir(path.join(CURRENT_OP23_JOURNAL, "events")))
      .sort()
      .slice(0, prefix.eventCount);
    const pinNames = (await readdir(path.join(CURRENT_OP23_JOURNAL, "pins")))
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
      path.join(CURRENT_OP23_JOURNAL, "events", name),
      path.join(frozenRoot, "events", name),
    )));
    await Promise.all(pinNames.map((name) => copyFile(
      path.join(CURRENT_OP23_JOURNAL, "pins", name),
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

function createCoordinator(
  plan: RavioliCurrentResumePlan,
  primingMode?: "browser-exact" | "authenticated-state",
) {
  const delegated: Record<RavioliUiLiveJournalActor, PastaUiLiveBridgeRequest[]> = {
    creator: [],
    collector1: [],
    collector2: [],
  };
  const coordinator = createRavioliCurrentResumeCoordinator({
    plan,
    ...(primingMode ? { primingMode } : {}),
    delegates: Object.fromEntries(ACTORS.map((actor) => [
      actor,
      async (request: PastaUiLiveBridgeRequest) => {
        delegated[actor].push(request);
        return { delegated: actor };
      },
    ])) as any,
  });
  return { coordinator, delegated };
}

test("authenticated-state priming starts exact op23 at Rotini adapter op24 and rejects drift or historical duplication", async (t) => {
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
    /refusing duplicate recovered side effect/,
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
  await assert.rejects(
    primed.coordinator.handles[historicalOperation.actor](
      replayRequest(historicalOperation, "historical-duplicate-after-op24"),
    ),
    /refusing duplicate recovered side effect/,
  );
  assert.equal(primed.delegated.creator.length, 2);
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
  await assert.rejects(
    primed.coordinator.handles.creator(callRequest("wrong-op10-entrypoint", "commit_recipe")),
    /first continuation mutation differs from global operation 10/,
  );
  assert.equal(primed.delegated.creator.length, 0);
  assert.equal(primed.coordinator.continuationStarted(), false);

  await primed.coordinator.handles.creator(callRequest("exact-op10-entrypoint", "create_pack"));
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
