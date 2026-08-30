import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
  PASTA_UI_LIVE_RECEIPT_SCHEMA,
  type PastaUiLiveBridgeRequest,
  type PastaUiLivePinProof,
  type PastaUiLivePreparedOperation,
  type PastaUiLivePublicReceipt,
  type PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import {
  PastaProofRestartJournal,
  type PastaProofRestartActor,
  type PastaProofRestartStep,
} from "./pasta-proof-restart-journal";
import { deterministicJsonBytes, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";
import { PENNE_RESTART_PLAN } from "./shadownet-penne-ui-live";
import { SPAGHETTI_RESTART_PLAN } from "./shadownet-spaghetti-ui-live";

const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const COLLECTOR = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const INITIAL_COUNTERS = Object.freeze({ creator: 1_000, collector: 2_000 });
const CREATED_AT = "2026-08-08T12:00:00.000Z";
const OPERATION_HASHES = [
  "ooCwn7Po9nnWcNgsXQm2WD1BZTKjKzEkEoiT18oHQAD5hzv7rGr",
  "opZjYmzbdMacbte9VfPFUfX8fzUbFKtmcrH6yr3eiHARfsXKu1v",
  "ooYuYtCF2aFQjSTTPLLnR8Wxsra1wH534FsKKr63VEqQRUPm56Z",
  "op3ZHQRjWKtiWUfjV41UcWw1BLt143VRK8KiijCxYWFNovZ9615",
  "oovEJ1kuJjZQXLNXrVJmj9GWyaS5m81xNRohPYnSFU77WT6R3Sf",
  "ooUaGMHBeymnt8myHuciuoE7ThNnS6AWoiPUQvKPXgkzoed1Kng",
  "opLhbHgEmva6aCRArHJorMkjRc9jUBiM8eHBdBB4XSgKBJLr3po",
] as const;

type Fixture = Readonly<{
  app: "spaghetti" | "penne";
  plan: readonly PastaProofRestartStep[];
  contractAddress: string;
  sourcePath: string;
}>;

type Harness = Readonly<{
  fixture: Fixture;
  directory: string;
  filePath: string;
  runId: string;
  intent: Readonly<Record<string, unknown>>;
}>;

const FIXTURES: readonly Fixture[] = [
  {
    app: "spaghetti",
    plan: SPAGHETTI_RESTART_PLAN,
    contractAddress: "KT1L6QfNDBRXZkECFo9QpfjGF4qyBnizTara",
    sourcePath: path.join(import.meta.dirname, "shadownet-spaghetti-ui-live.ts"),
  },
  {
    app: "penne",
    plan: PENNE_RESTART_PLAN,
    contractAddress: "KT1Di38dfxiKXdMyBHUMbA6kYndNXs3Y67gy",
    sourcePath: path.join(import.meta.dirname, "shadownet-penne-ui-live.ts"),
  },
];

function actorAddress(actor: PastaProofRestartActor): string {
  if (actor === "creator") return CREATOR;
  if (actor === "collector") return COLLECTOR;
  throw new Error(`unexpected restart actor ${actor}`);
}

function initialCounter(actor: PastaProofRestartActor): number {
  if (actor === "creator") return INITIAL_COUNTERS.creator;
  if (actor === "collector") return INITIAL_COUNTERS.collector;
  throw new Error(`unexpected restart actor ${actor}`);
}

function pinInput(fixture: Fixture, step: PastaProofRestartStep): {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  value?: unknown;
} {
  assert.equal(step.kind, "pin");
  assert.ok(step.fileName);
  if (step.transport === "direct") {
    return {
      bytes: Uint8Array.from([137, 80, 78, 71, ...Buffer.from(fixture.app, "utf8")]),
      fileName: step.fileName,
      mimeType: "image/png",
    };
  }
  const value = { app: fixture.app, step: step.id };
  return {
    bytes: deterministicJsonBytes(value),
    fileName: step.fileName,
    mimeType: "application/json",
    value,
  };
}

function proofForPin(fixture: Fixture, step: PastaProofRestartStep): PastaUiLivePinProof {
  const input = pinInput(fixture, step);
  const digest = createHash("sha256").update(input.bytes).digest("hex");
  const cid = `bafkrei${digest.slice(0, 52)}`;
  return {
    cid,
    uri: `ipfs://${cid}`,
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteLength: input.bytes.byteLength,
    sha256: digest,
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

function operationDescriptor(fixture: Fixture, step: PastaProofRestartStep) {
  if (step.action === "originate") {
    return {
      kind: "originate" as const,
      code: [{ prim: "parameter", args: [{ prim: "unit" }] }],
      storage: { administrator: CREATOR, app: fixture.app },
    };
  }
  if (step.action === "call") {
    return {
      kind: "call" as const,
      call: {
        contractAddress: fixture.contractAddress,
        entrypoint: step.entrypoint!,
        payload: { app: fixture.app, step: step.id },
      },
      sendOptions: {},
    };
  }
  assert.equal(step.action, "batch");
  return {
    kind: "batch" as const,
    calls: step.entrypoints!.map((entrypoint, index) => ({
      contractAddress: fixture.contractAddress,
      entrypoint,
      payload: { app: fixture.app, step: step.id, index },
    })),
  };
}

function preparedOperation(
  journal: PastaProofRestartJournal,
  fixture: Fixture,
  step: PastaProofRestartStep,
): PastaUiLivePreparedOperation {
  assert.equal(step.kind, "operation");
  assert.ok(step.action);
  return {
    status: "PREPARED",
    operationSequence: journal.completedOperationCount(step.actor) + 1,
    timestampUtc: CREATED_AT,
    action: step.action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: actorAddress(step.actor),
    ...(step.action === "originate" ? {} : { contractAddress: fixture.contractAddress }),
    entrypoints: step.entrypoints ? [...step.entrypoints] : step.entrypoint ? [step.entrypoint] : [],
    descriptor: operationDescriptor(fixture, step),
  };
}

function requestForStep(fixture: Fixture, step: PastaProofRestartStep, id: string): PastaUiLiveBridgeRequest {
  if (step.kind === "pin") {
    const input = pinInput(fixture, step);
    assert.notEqual(step.transport, "direct", "direct pins are not bridge requests");
    return {
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id,
      action: "pin_json",
      payload: { value: input.value, fileName: input.fileName },
    };
  }
  const descriptor = operationDescriptor(fixture, step);
  if (descriptor.kind === "originate") {
    return {
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id,
      action: "originate",
      payload: { code: descriptor.code, storage: descriptor.storage },
    };
  }
  if (descriptor.kind === "call") {
    return {
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id,
      action: "call",
      payload: { call: descriptor.call, sendOptions: descriptor.sendOptions },
    };
  }
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action: "batch",
    payload: { calls: descriptor.calls },
  };
}

function operationHash(fixture: Fixture, step: PastaProofRestartStep): string {
  const operationSteps = fixture.plan.filter((candidate) => candidate.kind === "operation");
  const index = operationSteps.indexOf(step);
  assert.notEqual(index, -1);
  return OPERATION_HASHES[index];
}

async function createHarness(fixture: Fixture): Promise<{
  harness: Harness;
  journal: PastaProofRestartJournal;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), `${fixture.app}-restart-boundary-`));
  const runId = `${fixture.app}-restart-boundary-proof`;
  const filePath = path.join(directory, "checkpoint.json");
  const intent = Object.freeze({
    app: fixture.app,
    contractArtifactSha256: fixture.app === "spaghetti" ? "a".repeat(64) : "b".repeat(64),
    mediaSha256: "c".repeat(64),
    relationshipGroup: `${fixture.app}-ui-live-${runId}`,
  });
  const journal = await PastaProofRestartJournal.create({
    filePath,
    app: fixture.app,
    runId,
    actors: { creator: CREATOR, collector: COLLECTOR },
    initialCounters: INITIAL_COUNTERS,
    plan: fixture.plan,
    intent,
    createdAt: CREATED_AT,
  });
  return { journal, harness: { fixture, directory, filePath, runId, intent } };
}

async function reopen(harness: Harness): Promise<PastaProofRestartJournal> {
  let countersAuthenticated = false;
  const journal = await PastaProofRestartJournal.open(harness.filePath, {
    app: harness.fixture.app,
    runId: harness.runId,
    actors: { creator: CREATOR, collector: COLLECTOR },
    plan: harness.fixture.plan,
    intent: harness.intent,
    authenticateInitialCounters(counters) {
      assert.deepEqual(counters, INITIAL_COUNTERS);
      countersAuthenticated = true;
    },
  });
  assert.equal(countersAuthenticated, true, "restart did not authenticate persisted initial counters");
  return journal;
}

async function withHarness(
  fixture: Fixture,
  run: (journal: PastaProofRestartJournal, harness: Harness) => Promise<void>,
): Promise<void> {
  const { journal, harness } = await createHarness(fixture);
  try {
    await run(journal, harness);
  } finally {
    await rm(harness.directory, { recursive: true, force: true });
  }
}

async function applyPin(
  journal: PastaProofRestartJournal,
  fixture: Fixture,
  step: PastaProofRestartStep,
): Promise<void> {
  const input = pinInput(fixture, step);
  await journal.beforePin(step.actor, input);
  await journal.onPin(step.actor, { proof: proofForPin(fixture, step) });
}

async function applyOperation(
  journal: PastaProofRestartJournal,
  fixture: Fixture,
  step: PastaProofRestartStep,
  onSend: () => void = () => undefined,
  receiptSequence?: number,
): Promise<void> {
  const prepared = preparedOperation(journal, fixture, step);
  await journal.beforeOperationSubmit(step.actor, prepared);
  onSend();
  const submitted: PastaUiLiveSubmittedOperation = {
    ...prepared,
    status: "SUBMITTED",
    timestampUtc: CREATED_AT,
    operationHash: operationHash(fixture, step),
  };
  await journal.onOperationSubmitted(step.actor, submitted);
  const receipt: PastaUiLivePublicReceipt = {
    schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
    sequence: receiptSequence ?? prepared.operationSequence,
    timestampUtc: CREATED_AT,
    action: step.action!,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: actorAddress(step.actor),
    contractAddress: fixture.contractAddress,
    operationHash: submitted.operationHash,
    ...(prepared.entrypoints.length ? { entrypoints: prepared.entrypoints } : {}),
  };
  await journal.onReceipt(step.actor, receipt);
}

async function applyPrefix(
  journal: PastaProofRestartJournal,
  fixture: Fixture,
  boundary: number,
): Promise<void> {
  for (const step of fixture.plan.slice(0, boundary)) {
    if (step.kind === "pin") await applyPin(journal, fixture, step);
    else await applyOperation(journal, fixture, step);
  }
}

async function assertRecoveredWithoutReplay(
  journal: PastaProofRestartJournal,
  fixture: Fixture,
  boundary: number,
): Promise<unknown> {
  const step = fixture.plan[boundary];
  if (step.kind === "pin" && step.transport === "direct") {
    const recovered = journal.appliedPin(step.id);
    assert.ok(recovered, `${fixture.app} direct pin was not recovered`);
    assert.deepEqual(recovered.bytes, pinInput(fixture, step).bytes);
    return recovered;
  }
  let delegated = 0;
  let result: unknown;
  for (const [index, completed] of fixture.plan.slice(0, boundary + 1).entries()) {
    if (completed.actor !== step.actor || completed.transport === "direct") continue;
    result = await journal.replayOrHandle(
      step.actor,
      requestForStep(fixture, completed, `${fixture.app}-${step.id}-${index}`),
      async () => {
        delegated += 1;
        throw new Error("a completed restart step attempted a duplicate side effect");
      },
    );
  }
  assert.equal(delegated, 0);
  assert.ok(result, `${fixture.app} ${step.id} did not return recovered bridge evidence`);
  return result;
}

for (const fixture of FIXTURES) {
  test(`${fixture.app} fresh bridge progress is never mistaken for restart replay`, async () => {
    await withHarness(fixture, async (journal) => {
      const directPrefix = fixture.plan.filter((step) => step.transport === "direct");
      for (const step of directPrefix) {
        assert.equal(step.kind, "pin");
        await applyPin(journal, fixture, step);
      }

      const bridgeSteps = fixture.plan.filter((step) => step.actor === "creator" && step.transport === "bridge").slice(0, 2);
      let delegated = 0;
      for (const [index, step] of bridgeSteps.entries()) {
        await journal.replayOrHandle(
          "creator",
          requestForStep(fixture, step, `${fixture.app}-fresh-${index}`),
          async () => {
            delegated += 1;
            if (step.kind === "pin") await applyPin(journal, fixture, step);
            else await applyOperation(journal, fixture, step, () => undefined, 7 + index);
            return { delegated: step.id };
          },
        );
      }

      assert.equal(delegated, bridgeSteps.length, "fresh semantic steps must delegate exactly once");
    });
  });

  for (const [boundary, step] of fixture.plan.entries()) {
    test(`${fixture.app} ${step.id} survives every durable ${step.kind} interruption boundary`, async () => {
      if (step.kind === "pin") {
        await withHarness(fixture, async (initial, harness) => {
          await applyPrefix(initial, fixture, boundary);
          const input = pinInput(fixture, step);
          await initial.beforePin(step.actor, input);

          let journal = await reopen(harness);
          let pinAttempts = 0;
          await journal.reconcilePin(async (pending) => {
            assert.equal(pending.step.id, step.id);
            assert.deepEqual(Buffer.from(pending.bytes), Buffer.from(input.bytes));
            return { status: "absent" };
          });
          pinAttempts += 1;
          await applyPin(journal, fixture, step);
          assert.equal(pinAttempts, 1, "absent PIN_PREPARED must be retried exactly once by the caller");

          journal = await reopen(harness);
          const recovered = await assertRecoveredWithoutReplay(journal, fixture, boundary);
          if (step.transport !== "direct") {
            assert.equal((recovered as { pin?: PastaUiLivePinProof }).pin?.sha256, proofForPin(fixture, step).sha256);
          }
        });

        await withHarness(fixture, async (initial, harness) => {
          await applyPrefix(initial, fixture, boundary);
          await initial.beforePin(step.actor, pinInput(fixture, step));

          let journal = await reopen(harness);
          let pinAttempts = 0;
          await journal.reconcilePin(async () => ({
            status: "present",
            proof: proofForPin(fixture, step),
          }));
          assert.equal(pinAttempts, 0, "present PIN_PREPARED must not repeat the pin side effect");

          journal = await reopen(harness);
          await assertRecoveredWithoutReplay(journal, fixture, boundary);
        });

        await withHarness(fixture, async (initial, harness) => {
          await applyPrefix(initial, fixture, boundary);
          await applyPin(initial, fixture, step);
          const journal = await reopen(harness);
          await assertRecoveredWithoutReplay(journal, fixture, boundary);
        });
        return;
      }

      await withHarness(fixture, async (initial, harness) => {
        await applyPrefix(initial, fixture, boundary);
        const prepared = preparedOperation(initial, fixture, step);
        await initial.beforeOperationSubmit(step.actor, prepared);

        let journal = await reopen(harness);
        assert.equal(journal.pending()?.expectedCounter, initialCounter(step.actor) + prepared.operationSequence);
        let sends = 0;
        await journal.reconcile(async () => ({ status: "absent" }));
        await applyOperation(journal, fixture, step, () => { sends += 1; });
        assert.equal(sends, 1, "absent PREPARED operation must be submitted exactly once by the caller");

        journal = await reopen(harness);
        const recovered = await assertRecoveredWithoutReplay(journal, fixture, boundary);
        assert.equal((recovered as { operationHash?: string }).operationHash, operationHash(fixture, step));
      });

      await withHarness(fixture, async (initial, harness) => {
        await applyPrefix(initial, fixture, boundary);
        const prepared = preparedOperation(initial, fixture, step);
        await initial.beforeOperationSubmit(step.actor, prepared);
        await initial.onOperationSubmitted(step.actor, {
          ...prepared,
          status: "SUBMITTED",
          operationHash: operationHash(fixture, step),
        });

        let journal = await reopen(harness);
        let sends = 0;
        await journal.reconcile(async (pending) => {
          assert.equal(pending.operationHash, operationHash(fixture, step));
          return {
            status: "applied",
            operationHash: operationHash(fixture, step),
            contractAddress: fixture.contractAddress,
            timestampUtc: CREATED_AT,
            entrypoints: prepared.entrypoints,
          };
        });
        assert.equal(sends, 0, "SUBMITTED operation must reconcile its exact hash without another send");

        await assertRecoveredWithoutReplay(journal, fixture, boundary);
        journal = await reopen(harness);
        await assertRecoveredWithoutReplay(journal, fixture, boundary);
      });

      await withHarness(fixture, async (initial, harness) => {
        await applyPrefix(initial, fixture, boundary);
        await applyOperation(initial, fixture, step);
        const journal = await reopen(harness);
        await assertRecoveredWithoutReplay(journal, fixture, boundary);
        assert.equal(
          journal.expectedCurrentCounter(step.actor),
          initialCounter(step.actor) + journal.completedOperationCount(step.actor),
        );
      });
    });
  }

  test(`${fixture.app} runner binds handoff identity to runId and authenticates restart counters`, async () => {
    const source = await readFile(fixture.sourcePath, "utf8");
    assert.doesNotMatch(source, /Date\.now\(\)/);
    assert.ok(
      source.includes(`collection_group: \`${fixture.app}-ui-live-\${runId}\``),
      `${fixture.app} handoff relationship must be derived from runId`,
    );
    assert.match(source, /authenticatePastaProofRestartInitialCounters/);
    assert.match(source, /assertPastaProofRestartCounterBoundary/);
    assert.match(source, /replayOrHandle/);
    assert.match(source, /restart-checkpoint/);
  });
}
