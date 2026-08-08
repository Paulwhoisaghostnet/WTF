import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  loadRavioliCurrentV6Resume,
  RAVIOLI_CURRENT_V6_RESUME_IDENTITY,
  type RavioliCurrentV6Resume,
} from "./shadownet-ravioli-current-v6-resume";
import {
  RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA,
  openRavioliUiLiveJournal,
  type RavioliUiLiveJournal,
} from "./shadownet-ravioli-ui-live-journal";
import {
  deterministicJsonBytes,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

const EVENT_86_FILE_NAME = "000086-counter_advance-creator.json";
const EVENT_86_SHA256 = "fa25e3744bd09305b968b17a264557d1c8009b7aa9fc6387379356361fda1f10";
const EVENT_87_FILE_NAME = "000087-plan_extension-creator.json";

export const RAVIOLI_CURRENT_V7_RESUME_IDENTITY = Object.freeze({
  ...RAVIOLI_CURRENT_V6_RESUME_IDENTITY,
  classification: "RAVIOLI-CURRENT-V7-AUTHENTICATED-EVENT86-CONTINUATION",
  boundaryEventCount: 86,
  boundaryFinalEventSha256: EVENT_86_SHA256,
  predecessorSemanticEventSha256:
    RAVIOLI_CURRENT_V6_RESUME_IDENTITY.boundaryFinalEventSha256,
  recoveredFileCount: 128,
});

export type RavioliCurrentV7Resume = RavioliCurrentV6Resume & Readonly<{
  v7Identity: typeof RAVIOLI_CURRENT_V7_RESUME_IDENTITY;
  planExtensionBoundary: null | Readonly<{
    eventIndex: 87;
    path: typeof EVENT_87_FILE_NAME;
    recordSha256: string;
  }>;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateRavioliCurrentV7BoundaryEvent(
  bytes: Uint8Array,
): Readonly<Record<string, unknown>> {
  assert.equal(sha256(bytes), EVENT_86_SHA256, "Ravioli current-v7 event-86 digest drift");
  const value = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, any>;
  assert.equal(
    Buffer.compare(Buffer.from(bytes), Buffer.from(deterministicJsonBytes(value))),
    0,
    "Ravioli current-v7 event 86 is not canonical JSON",
  );
  assert.equal(value.schema, RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA);
  assert.equal(value.phase, "COUNTER_ADVANCE");
  assert.equal(value.actor, "creator");
  assert.equal(value.eventIndex, 86);
  assert.equal(value.journalId, RAVIOLI_CURRENT_V7_RESUME_IDENTITY.journalId);
  assert.equal(value.intentSha256, RAVIOLI_CURRENT_V7_RESUME_IDENTITY.intentSha256);
  assert.equal(
    value.previousRecordSha256,
    RAVIOLI_CURRENT_V7_RESUME_IDENTITY.predecessorSemanticEventSha256,
  );
  assert.equal(value.semanticBoundary, 23);
  assert.equal(value.nextGlobalOrdinal, 24);
  assert.equal(
    value.recoveryContractAddress,
    RAVIOLI_CURRENT_V7_RESUME_IDENTITY.recoveryContractAddress,
  );
  assert.equal(value.recoveryId, RAVIOLI_CURRENT_V7_RESUME_IDENTITY.recoveryId);
  assert.equal(value.timestampUtc, "2026-07-24T20:16:00.000Z");
  assert.ok(Array.isArray(value.advances));
  assert.deepEqual(
    value.advances.map((advance: Record<string, any>) => ({
      actor: advance.actor,
      advanceBy: advance.advanceBy,
      hashes: Array.isArray(advance.operations)
        ? advance.operations.map((operation: Record<string, any>) => operation.operationHash)
        : [],
    })),
    [
      {
        actor: "creator",
        advanceBy: 3,
        hashes: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.externalOperations
          .filter((operation) => operation.actor === "creator")
          .map((operation) => operation.operationHash),
      },
      {
        actor: "collector1",
        advanceBy: 1,
        hashes: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.externalOperations
          .filter((operation) => operation.actor === "collector1")
          .map((operation) => operation.operationHash),
      },
    ],
  );
  return Object.freeze(value);
}

export async function loadRavioliCurrentV7Resume(input: {
  journal: RavioliUiLiveJournal;
  privateRecoveryRoot: string;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  expected: Parameters<typeof loadRavioliCurrentV6Resume>[0]["expected"];
}): Promise<RavioliCurrentV7Resume> {
  const eventCount = input.journal.getEventCount();
  assert.equal(
    eventCount === RAVIOLI_CURRENT_V7_RESUME_IDENTITY.boundaryEventCount
      || eventCount === RAVIOLI_CURRENT_V7_RESUME_IDENTITY.boundaryEventCount + 1,
    true,
    "current-v7 requires the exact event-86 or authenticated event-87 boundary",
  );
  assert.equal(input.journal.getCompletedOperationCount(), 23);
  assert.equal(input.journal.hasCounterAdvance(), true);
  assert.equal(
    input.journal.hasPlanExtension(),
    eventCount === 87,
    "current-v7 plan-extension boundary state drift",
  );
  assert.equal(input.journal.getCounterOffset("creator"), 3);
  assert.equal(input.journal.getCounterOffset("collector1"), 1);
  assert.equal(input.journal.getCounterOffset("collector2"), 0);
  const eventPath = path.join(
    input.journal.journalRoot,
    "events",
    EVENT_86_FILE_NAME,
  );
  validateRavioliCurrentV7BoundaryEvent(await readFile(eventPath));

  // The V6 authenticator remains the frozen validator for the 85-event semantic
  // prefix plus its one durable counter-advance record. At event 86 it performs
  // no append and no replay; V7 adds the exact terminal event identity that V6
  // could not know until its local checkpoint had been durably written.
  const base = await loadRavioliCurrentV6Resume({
    ...input,
    allowAuthenticatedPostEvent86PlanExtension: true,
  });
  assert.equal(
    input.journal.getEventCount(),
    eventCount,
    "current-v7 authentication mutated its event boundary",
  );
  assert.equal(input.journal.getCompletedOperationCount(), 23);
  let planExtensionBoundary: RavioliCurrentV7Resume["planExtensionBoundary"] =
    null;
  if (eventCount === 87) {
    const extensionPath = path.join(
      input.journal.journalRoot,
      "events",
      EVENT_87_FILE_NAME,
    );
    const extensionBytes = await readFile(extensionPath);
    const extension = JSON.parse(
      Buffer.from(extensionBytes).toString("utf8"),
    ) as Record<string, any>;
    assert.equal(
      Buffer.compare(
        Buffer.from(extensionBytes),
        Buffer.from(deterministicJsonBytes(extension)),
      ),
      0,
      "Ravioli current-v7 event 87 is not canonical JSON",
    );
    assert.equal(extension.schema, RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA);
    assert.equal(extension.phase, "PLAN_EXTENSION");
    assert.equal(extension.actor, "creator");
    assert.equal(extension.eventIndex, 87);
    assert.equal(extension.journalId, RAVIOLI_CURRENT_V7_RESUME_IDENTITY.journalId);
    assert.equal(extension.intentSha256, RAVIOLI_CURRENT_V7_RESUME_IDENTITY.intentSha256);
    assert.equal(extension.previousRecordSha256, EVENT_86_SHA256);
    planExtensionBoundary = Object.freeze({
      eventIndex: 87,
      path: EVENT_87_FILE_NAME,
      recordSha256: sha256(extensionBytes),
    });
  }
  return Object.freeze({
    ...base,
    v7Identity: RAVIOLI_CURRENT_V7_RESUME_IDENTITY,
    planExtensionBoundary,
  });
}

export async function reopenRavioliCurrentV7Resume(input: {
  journalRoot: string;
  privateRecoveryRoot: string;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  expected: Parameters<typeof loadRavioliCurrentV6Resume>[0]["expected"];
}): Promise<{ journal: RavioliUiLiveJournal; resume: RavioliCurrentV7Resume }> {
  const journal = await openRavioliUiLiveJournal(input.journalRoot);
  const resume = await loadRavioliCurrentV7Resume({
    journal,
    privateRecoveryRoot: input.privateRecoveryRoot,
    ipfs: input.ipfs,
    expected: input.expected,
  });
  return { journal, resume };
}
