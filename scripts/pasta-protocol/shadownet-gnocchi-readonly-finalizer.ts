#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";

import {
  assertMichelsonScriptCodeIdentity,
  hashMichelsonScriptCode,
} from "./pasta-michelson-script-identity";
import {
  createHttpGetReader,
  readWithBoundedRetry,
  type ReadOnlyFetch,
} from "./pasta-readonly-retry";
import {
  deterministicJsonBytes,
  hexToUtf8,
  normalizeBase,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
} from "./shadownet-proof-kit";
import { buildGnocchiRavioliDependencyEvidence } from "./shadownet-gnocchi-ui-live";

const EXECUTE_FLAG = "PASTA_SHADOWNET_GNOCCHI_READONLY_FINALIZE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const APP = "gnocchi";
const FINALIZATION_RECEIPT_PATH = "artifacts/gnocchi-ui-readonly-finalization.json";
const RECONCILIATION_PATH = "artifacts/gnocchi-chain-reconciliation-snapshot.json";
const CONTRACT_CODE_PATH = "artifacts/gnocchi-current-contract-code.json";
const CURRENT_RECOVERY_RECEIPT_PATH = "artifacts/gnocchi-current-recovery-final.json";
const CURRENT_RECOVERY_CHECKPOINT_ROOT = "artifacts/gnocchi-current-recovery";
const CURRENT_RECOVERY_CLASSIFICATION = "UI-LIVE-RECOVERED-CHECKPOINTED";
const EXPECTED_SCREENSHOTS = 19;
const EXPECTED_TOKEN_SUPPLIES = [4, 4, 3] as const;
const EXPECTED_CONTENT_FILES = [
  "token-0-media.png",
  "collection-metadata.json",
  "token-0-metadata.json",
  "token-1-media.png",
  "token-1-metadata.json",
  "token-2-media.png",
  "token-2-metadata.json",
] as const;
const CONTRACT_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/creation-tools/gnocchi/contract/pasta-open-edition.contract.json",
);
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IPFS_URI = /^ipfs:\/\/[a-zA-Z0-9]+(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)?$/;

type JsonObject = Record<string, any>;
type FetchLike = ReadOnlyFetch;

type JsonFetch = {
  url: string;
  value: any;
  rawSha256: string;
  retrievedAt: string;
};

type ScreenshotEvidence = {
  sidecar: JsonObject;
  screenshot: {
    caption: string;
    path: string;
    sha256: string;
    stage: string;
  };
  sidecarArtifact: {
    id: string;
    kind: "screenshot-sidecar";
    path: string;
    sha256: string;
  };
};

type RecoveredOperationEvidence = {
  creator: string;
  collectorOne: string;
  collectorTwo: string;
  indexedReceipts: JsonObject[];
  manifestOperations: JsonObject[];
  operationHashes: string[];
  terminalLevel: number;
  terminalOperationHash: string;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function objectValue(value: unknown, label: string): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function arrayValue(value: unknown, label: string): any[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  return value;
}

function safeInteger(value: unknown, label: string): number {
  const number = Number(value);
  assert.ok(Number.isSafeInteger(number) && number >= 0, `${label} must be a non-negative safe integer`);
  return number;
}

function requireIpfsUri(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(value as string, IPFS_URI, `${label} must be an ipfs:// URI`);
  return value as string;
}

function gatewayUrl(base: string, uri: string): string {
  return `${normalizeBase(base)}/${uri.slice("ipfs://".length)}`;
}

async function fetchBytesWithRetry(
  fetchImpl: FetchLike,
  url: string,
  label: string,
  attempts = 6,
): Promise<{ bytes: Uint8Array; retrievedAt: string }> {
  return readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      redirect: "follow",
      fetchImpl,
      parse: async (response) => ({
        bytes: new Uint8Array(await response.arrayBuffer()),
        retrievedAt: new Date().toISOString(),
      }),
    }),
  }, {
    maxAttempts: attempts,
    deadlineMs: 30_000,
    baseDelayMs: 250,
    maxDelayMs: 4_000,
    maxRetryAfterMs: 5_000,
    jitterRatio: 0,
  });
}

async function fetchJsonWithRetry(fetchImpl: FetchLike, url: string, label: string): Promise<JsonFetch> {
  const fetched = await fetchBytesWithRetry(fetchImpl, url, label);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(fetched.bytes).toString("utf8"));
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { url, value, rawSha256: sha256(fetched.bytes), retrievedAt: fetched.retrievedAt };
}

async function readRegularFile(filePath: string, label: string): Promise<Uint8Array> {
  const details = await lstat(filePath).catch(() => undefined);
  assert.ok(details?.isFile() && !details.isSymbolicLink(), `${label} must be an existing regular non-symlink file`);
  return readFile(filePath);
}

async function writeNewOrIdentical(filePath: string, bytes: Uint8Array): Promise<void> {
  const details = await lstat(filePath).catch(() => undefined);
  if (details) {
    assert.ok(details.isFile() && !details.isSymbolicLink(), `${filePath} must remain a regular file`);
    assert.deepEqual(await readFile(filePath), Buffer.from(bytes), `${filePath} differs from the deterministic recovered evidence`);
    return;
  }
  await writeFile(filePath, bytes, { flag: "wx" });
}

async function listRecoveryFiles(rootPath: string, relative = ""): Promise<string[]> {
  const directory = path.join(rootPath, relative);
  const names = (await readdir(directory)).sort();
  const output: string[] = [];
  for (const name of names) {
    const childRelative = relative ? `${relative}/${name}` : name;
    const details = await lstat(path.join(rootPath, childRelative));
    assert.equal(details.isSymbolicLink(), false, `${childRelative} recovery evidence must not be a symlink`);
    if (details.isDirectory()) {
      output.push(...await listRecoveryFiles(rootPath, childRelative));
    } else {
      assert.ok(details.isFile(), `${childRelative} recovery evidence must be a regular file`);
      output.push(childRelative);
    }
  }
  return output;
}

function recoveryContentIdentity(value: unknown, label: string): JsonObject {
  const content = objectValue(value, label);
  assert.ok(typeof content.id === "string" && content.id.length > 0, `${label} id is required`);
  assert.ok(typeof content.fileName === "string" && content.fileName.length > 0, `${label} filename is required`);
  assert.ok(typeof content.cid === "string" && content.cid.length > 0, `${label} CID is required`);
  assert.match(String(content.sha256 || ""), SHA256, `${label} SHA-256 is invalid`);
  return {
    id: content.id,
    fileName: content.fileName,
    cid: content.cid,
    sha256: content.sha256,
    byteLength: safeInteger(content.byteLength, `${label} byte length`),
  };
}

function screenshotOrdinalFromPath(value: unknown, label: string): number {
  assert.equal(typeof value, "string", `${label} must be a string`);
  const match = String(value).match(/(?:^|\/)(?:screenshot-)?(\d{3})-[^/]+\.(?:json|png)$/);
  assert.ok(match, `${label} must retain a canonical screenshot ordinal`);
  return safeInteger(match[1], `${label} ordinal`);
}

/**
 * Validates the recovery boundary from the immutable, hash-chained checkpoint
 * documents. The split is intentionally derived from those documents: the
 * retired 3+9/2-pin checkpoint and the current 6+6/0-pin checkpoint therefore
 * use the same invariant set without a run-id-specific bypass.
 */
export function validateGnocchiRecoveryBoundary(input: {
  operationHashes: readonly string[];
  intent: unknown;
  final: unknown;
  receipt: unknown;
  eventCount: number;
  phases: Record<string, number>;
  appliedHashes: readonly string[];
  screenshotOrdinals: readonly number[];
  rejectionReasons: readonly string[];
  pinFiles: readonly string[];
}): {
  recoveredOperations: number;
  liveOperations: number;
  recoveredContentObjects: number;
  nativeContinuationContentObjects: number;
  preservedScreenshotOrdinals: number[];
  continuationScreenshotOrdinals: number[];
} {
  const intent = objectValue(input.intent, "Gnocchi recovery intent");
  const final = objectValue(input.final, "Gnocchi recovery final checkpoint");
  const receipt = objectValue(input.receipt, "Gnocchi current-recovery receipt");
  const recoveredPrefix = objectValue(intent.recoveredPrefix, "Gnocchi recovery intent prefix");
  const receiptPrefix = objectValue(receipt.prefix, "Gnocchi recovery receipt prefix");
  const continuation = objectValue(receipt.continuation, "Gnocchi recovery receipt continuation");

  assert.equal(input.operationHashes.length, 12, "Gnocchi recovery terminal chain must retain all 12 operations");
  const recoveredOperations = safeInteger(final.recoveredOperations, "Gnocchi recovered operation count");
  const liveOperations = safeInteger(final.liveOperations, "Gnocchi live operation count");
  assert.ok(recoveredOperations > 0, "Gnocchi recovery must authenticate an applied prefix");
  assert.ok(liveOperations > 0, "Gnocchi recovery must authenticate a native continuation");
  assert.equal(recoveredOperations + liveOperations, input.operationHashes.length, "Gnocchi recovery operation split is incomplete");

  const prefixOperations = arrayValue(recoveredPrefix.operations, "Gnocchi intent recovered operations");
  const receiptPrefixOperations = arrayValue(receiptPrefix.recoveredOperations, "Gnocchi receipt recovered operations");
  assert.equal(prefixOperations.length, recoveredOperations);
  assert.deepEqual(receiptPrefixOperations, prefixOperations, "Gnocchi receipt recovered operations differ from the immutable intent");
  assert.deepEqual(
    prefixOperations.map((operation, index) => String(objectValue(operation, `Gnocchi recovered operation ${index + 1}`).hash || "")),
    input.operationHashes.slice(0, recoveredOperations),
    "Gnocchi recovered operation hashes differ from the terminal chain prefix",
  );

  const remainingOperationMatrix = arrayValue(intent.remainingOperationMatrix, "Gnocchi remaining operation matrix");
  const expectedLiveOrdinals = Array.from({ length: liveOperations }, (_, index) => recoveredOperations + index + 1);
  assert.equal(remainingOperationMatrix.length, liveOperations);
  assert.deepEqual(
    remainingOperationMatrix.map((operation, index) => safeInteger(
      objectValue(operation, `Gnocchi remaining operation ${index + 1}`).globalOrdinal,
      `Gnocchi remaining operation ${index + 1} global ordinal`,
    )),
    expectedLiveOrdinals,
    "Gnocchi remaining operation ordinals do not continue the recovered prefix",
  );
  assert.deepEqual(
    arrayValue(continuation.liveOperationOrdinals, "Gnocchi receipt live operation ordinals")
      .map((ordinal, index) => safeInteger(ordinal, `Gnocchi receipt live operation ordinal ${index + 1}`)),
    expectedLiveOrdinals,
  );
  assert.deepEqual(input.appliedHashes, input.operationHashes.slice(recoveredOperations), "Gnocchi APPLIED events differ from the native continuation");

  const recoveredContent = arrayValue(recoveredPrefix.content, "Gnocchi intent recovered content")
    .map((content, index) => recoveryContentIdentity(content, `Gnocchi intent recovered content ${index + 1}`));
  const receiptRecoveredContent = arrayValue(receiptPrefix.recoveredContent, "Gnocchi receipt recovered content")
    .map((content, index) => recoveryContentIdentity(content, `Gnocchi receipt recovered content ${index + 1}`));
  const expectedNewPins = arrayValue(intent.expectedNewPins, "Gnocchi expected new pins")
    .map((content, index) => recoveryContentIdentity(content, `Gnocchi expected new pin ${index + 1}`));
  const receiptNewContent = arrayValue(continuation.newContent, "Gnocchi receipt new content")
    .map((content, index) => recoveryContentIdentity(content, `Gnocchi receipt new content ${index + 1}`));
  assert.deepEqual(receiptRecoveredContent, recoveredContent, "Gnocchi recovered content differs between intent and receipt");
  assert.deepEqual(receiptNewContent, expectedNewPins, "Gnocchi native continuation content differs between intent and receipt");
  assert.deepEqual(
    [...recoveredContent, ...expectedNewPins].map((content) => content.fileName),
    [...EXPECTED_CONTENT_FILES],
    "Gnocchi recovery content inventory is incomplete or reordered",
  );
  const pinCount = safeInteger(final.pins, "Gnocchi recovery pin count");
  assert.equal(pinCount, expectedNewPins.length, "Gnocchi final pin count differs from the immutable intent");
  assert.deepEqual(
    input.pinFiles,
    expectedNewPins.map((content, index) => `pins/${String(index + 1).padStart(3, "0")}-${content.fileName}`),
    "Gnocchi recovery pin file inventory differs from the immutable intent",
  );

  const prefixFiles = arrayValue(recoveredPrefix.files, "Gnocchi recovered prefix files")
    .map((file, index) => String(objectValue(file, `Gnocchi recovered prefix file ${index + 1}`).path || ""));
  const prefixScreenshotOrdinals = prefixFiles
    .filter((filePath) => filePath.startsWith("screenshots/"))
    .map((filePath, index) => screenshotOrdinalFromPath(filePath, `Gnocchi recovered screenshot ${index + 1}`));
  const prefixSidecarOrdinals = prefixFiles
    .filter((filePath) => filePath.startsWith("artifacts/screenshot-"))
    .map((filePath, index) => screenshotOrdinalFromPath(filePath, `Gnocchi recovered screenshot sidecar ${index + 1}`));
  const preservedScreenshotOrdinals = arrayValue(receiptPrefix.preservedScreenshots, "Gnocchi preserved screenshot ordinals")
    .map((ordinal, index) => safeInteger(ordinal, `Gnocchi preserved screenshot ordinal ${index + 1}`));
  assert.ok(preservedScreenshotOrdinals.length > 0 && preservedScreenshotOrdinals.length < EXPECTED_SCREENSHOTS);
  assert.deepEqual(
    preservedScreenshotOrdinals,
    Array.from({ length: preservedScreenshotOrdinals.length }, (_, index) => index + 1),
    "Gnocchi preserved screenshots must be a contiguous prefix",
  );
  assert.deepEqual(prefixScreenshotOrdinals, preservedScreenshotOrdinals, "Gnocchi intent screenshot inventory differs from the receipt");
  assert.deepEqual(prefixSidecarOrdinals, preservedScreenshotOrdinals, "Gnocchi intent screenshot-sidecar inventory differs from the receipt");
  const continuationScreenshotOrdinals = Array.from(
    { length: EXPECTED_SCREENSHOTS - preservedScreenshotOrdinals.length },
    (_, index) => preservedScreenshotOrdinals.length + index + 1,
  );
  assert.deepEqual(input.screenshotOrdinals, continuationScreenshotOrdinals, "Gnocchi SCREENSHOT_ACCEPTED events do not complete the proof sequence");
  assert.deepEqual(
    arrayValue(continuation.appendedScreenshots, "Gnocchi appended screenshots")
      .map((screenshot, index) => screenshotOrdinalFromPath(
        objectValue(screenshot, `Gnocchi appended screenshot ${index + 1}`).path,
        `Gnocchi appended screenshot ${index + 1}`,
      )),
    continuationScreenshotOrdinals,
    "Gnocchi receipt screenshot continuation is incomplete",
  );

  const expectedPhases: Record<string, number> = {
    SCREENSHOT_ACCEPTED: continuationScreenshotOrdinals.length,
    ...(pinCount > 0 ? { PIN_PREPARED: pinCount, PIN_CONFIRMED: pinCount } : {}),
    PREPARED: liveOperations,
    SUBMITTED: liveOperations,
    APPLIED: liveOperations,
    EXPECTED_REJECTION: 2,
  };
  const sortedPhaseEntries = (phases: Record<string, number>): Array<[string, number]> =>
    Object.entries(phases).sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(sortedPhaseEntries(input.phases), sortedPhaseEntries(expectedPhases), "Gnocchi recovery phase inventory drift");
  const expectedEventCount = Object.values(expectedPhases).reduce((total, count) => total + count, 0);
  assert.equal(safeInteger(final.events, "Gnocchi recovery event count"), expectedEventCount);
  assert.equal(input.eventCount, expectedEventCount, "Gnocchi recovery event file count drift");
  assert.deepEqual([...input.rejectionReasons].sort(), ["not enough supply left", "this sale is paused"]);

  const receiptCheckpoint = objectValue(receipt.checkpoint, "Gnocchi receipt checkpoint");
  assert.equal(safeInteger(receiptCheckpoint.events, "Gnocchi receipt event count"), expectedEventCount);
  assert.equal(safeInteger(receiptCheckpoint.pins, "Gnocchi receipt pin count"), pinCount);
  assert.equal(safeInteger(receiptCheckpoint.recoveredOperations, "Gnocchi receipt recovered operation count"), recoveredOperations);
  assert.equal(safeInteger(receiptCheckpoint.liveOperations, "Gnocchi receipt live operation count"), liveOperations);
  const intentInterruption = objectValue(intent.interruption, "Gnocchi intent interruption");
  const receiptInterruption = objectValue(receipt.interruption, "Gnocchi receipt interruption");
  assert.match(
    String(intentInterruption.code || ""),
    /^POST_CONFIRMATION_(?:READ_STORAGE_HTTP_(?:429|5\d\d)|SCREENSHOT_RESOURCE_HTTP_5\d\d)$/,
  );
  assert.equal(receiptInterruption.code, intentInterruption.code);
  assert.equal(receiptInterruption.stage, intentInterruption.stage);
  assert.equal(intentInterruption.chainMutationApplied, true);
  assert.equal(intentInterruption.ordinaryRerunForbidden, true);
  assert.equal(receiptInterruption.recoveredWithoutReplayingAppliedPrefix, true);

  return {
    recoveredOperations,
    liveOperations,
    recoveredContentObjects: recoveredContent.length,
    nativeContinuationContentObjects: expectedNewPins.length,
    preservedScreenshotOrdinals,
    continuationScreenshotOrdinals,
  };
}

async function readCurrentRecoveryEvidence(input: {
  appRoot: string;
  runId: string;
  contractAddress: string;
  operationHashes: string[];
}): Promise<{
  classification: typeof CURRENT_RECOVERY_CLASSIFICATION;
  artifacts: JsonObject[];
  summary: JsonObject;
} | undefined> {
  const receiptPath = path.join(input.appRoot, CURRENT_RECOVERY_RECEIPT_PATH);
  const receiptDetails = await lstat(receiptPath).catch(() => undefined);
  if (!receiptDetails) return undefined;
  assert.ok(receiptDetails.isFile() && !receiptDetails.isSymbolicLink(), "Gnocchi current-recovery receipt must be a regular file");
  const receiptBytes = await readFile(receiptPath);
  const receipt = objectValue(JSON.parse(receiptBytes.toString("utf8")), "Gnocchi current-recovery receipt");
  assert.equal(receipt.schema, "pastaprotocol-gnocchi-current-recovery@1");
  assert.equal(receipt.classification, CURRENT_RECOVERY_CLASSIFICATION);
  assert.equal(receipt.status, "PASSED");
  assert.equal(receipt.runId, input.runId);
  assert.equal(receipt.network, "shadownet");
  assert.equal(receipt.chainId, SHADOWNET_CHAIN_ID);
  assert.equal(receipt.contract?.address, input.contractAddress);
  assert.deepEqual(receipt.terminalChain?.operationHashes, input.operationHashes);

  const checkpointRoot = path.join(input.appRoot, CURRENT_RECOVERY_CHECKPOINT_ROOT);
  const checkpointDetails = await lstat(checkpointRoot).catch(() => undefined);
  assert.ok(checkpointDetails?.isDirectory() && !checkpointDetails.isSymbolicLink(), "Gnocchi recovery checkpoint directory is missing");
  const relativeFiles = await listRecoveryFiles(checkpointRoot);
  for (const required of ["intent.json", "final.json", "terminal-chain.json"]) {
    assert.ok(relativeFiles.includes(required), `Gnocchi recovery checkpoint lacks ${required}`);
  }

  const [intentBytes, finalBytes, terminalBytes] = await Promise.all([
    readRegularFile(path.join(checkpointRoot, "intent.json"), "Gnocchi recovery intent"),
    readRegularFile(path.join(checkpointRoot, "final.json"), "Gnocchi recovery final checkpoint"),
    readRegularFile(path.join(checkpointRoot, "terminal-chain.json"), "Gnocchi recovery terminal chain"),
  ]);
  const intent = objectValue(JSON.parse(Buffer.from(intentBytes).toString("utf8")), "Gnocchi recovery intent");
  const final = objectValue(JSON.parse(Buffer.from(finalBytes).toString("utf8")), "Gnocchi recovery final checkpoint");
  const terminal = objectValue(JSON.parse(Buffer.from(terminalBytes).toString("utf8")), "Gnocchi recovery terminal chain");
  assert.equal(intent.schema, "pastaprotocol-gnocchi-current-recovery-intent@1");
  assert.equal(intent.status, "IMMUTABLE");
  assert.equal(intent.runId, input.runId);
  assert.equal(intent.contract?.address, input.contractAddress);
  assert.equal(intent.interruption?.ordinaryRerunForbidden, true);
  assert.equal(final.schema, "pastaprotocol-gnocchi-current-recovery-checkpoint-final@1");
  assert.equal(final.status, "FINALIZED");
  assert.equal(final.checkpointId, intent.checkpointId);
  assert.equal(final.intentSha256, sha256(intentBytes));
  assert.equal(receipt.checkpoint?.checkpointId, final.checkpointId);
  assert.equal(receipt.checkpoint?.finalArtifactSha256, sha256(finalBytes));
  assert.equal(receipt.checkpoint?.intentSha256, final.intentSha256);
  assert.equal(receipt.checkpoint?.finalRecordSha256, final.finalRecordSha256);
  assert.equal(receipt.checkpoint?.terminalSha256, final.terminalSha256);
  assert.equal(receipt.terminalChain?.sha256, sha256(terminalBytes));
  assert.equal(final.terminalSha256, sha256(terminalBytes));
  assert.deepEqual(terminal.operationHashes, input.operationHashes);

  const eventNames = relativeFiles.filter((name) => name.startsWith("events/"));
  const pinFiles = relativeFiles.filter((name) => name.startsWith("pins/"));
  assert.equal(eventNames.length, safeInteger(final.events, "Gnocchi recovery event count"));
  assert.equal(pinFiles.length, safeInteger(final.pins, "Gnocchi recovery pin count"));
  assert.equal(
    relativeFiles.length,
    3 + eventNames.length + pinFiles.length,
    "Gnocchi recovery checkpoint file inventory drift",
  );

  let previousRecordSha256 = sha256(intentBytes);
  const phases: Record<string, number> = {};
  const appliedHashes: string[] = [];
  const screenshotOrdinals: number[] = [];
  const rejectionReasons: string[] = [];
  for (const [index, name] of eventNames.entries()) {
    assert.ok(
      name.startsWith(`events/${String(index + 1).padStart(6, "0")}-`),
      `Gnocchi recovery event ${index + 1} filename must retain its canonical ordinal`,
    );
    const bytes = await readRegularFile(path.join(checkpointRoot, name), `Gnocchi recovery event ${index + 1}`);
    const event = objectValue(JSON.parse(Buffer.from(bytes).toString("utf8")), `Gnocchi recovery event ${index + 1}`);
    assert.equal(event.schema, "pastaprotocol-gnocchi-current-recovery-event@1");
    assert.equal(event.checkpointId, final.checkpointId);
    assert.equal(event.eventIndex, index + 1);
    assert.equal(event.previousRecordSha256, previousRecordSha256);
    assert.ok(typeof event.phase === "string" && event.phase.length > 0);
    phases[event.phase] = (phases[event.phase] || 0) + 1;
    if (event.phase === "APPLIED") appliedHashes.push(String(event.operationHash || ""));
    if (event.phase === "SCREENSHOT_ACCEPTED") screenshotOrdinals.push(safeInteger(event.stageOrdinal, "recovery screenshot ordinal"));
    if (event.phase === "EXPECTED_REJECTION") {
      assert.equal(event.transactionCountBefore, event.transactionCountAfter);
      rejectionReasons.push(String(event.reason || ""));
    }
    previousRecordSha256 = sha256(bytes);
  }
  assert.equal(previousRecordSha256, final.finalRecordSha256);
  const boundary = validateGnocchiRecoveryBoundary({
    operationHashes: input.operationHashes,
    intent,
    final,
    receipt,
    eventCount: eventNames.length,
    phases,
    appliedHashes,
    screenshotOrdinals,
    rejectionReasons,
    pinFiles,
  });

  const artifacts: JsonObject[] = [];
  const addArtifact = async (relativePath: string, kind: string): Promise<void> => {
    const bytes = await readRegularFile(path.join(input.appRoot, relativePath), `Gnocchi recovery artifact ${relativePath}`);
    const digest = sha256(bytes);
    const pathId = relativePath.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 155);
    artifacts.push({
      id: `gnocchi-recovery-${pathId}-${digest.slice(0, 12)}`,
      kind,
      path: relativePath,
      sha256: digest,
      durability: "package-only",
    });
  };
  await addArtifact(CURRENT_RECOVERY_RECEIPT_PATH, "ui-live-recovery-receipt");
  for (const relativePath of relativeFiles) {
    await addArtifact(
      `${CURRENT_RECOVERY_CHECKPOINT_ROOT}/${relativePath}`,
      relativePath.startsWith("events/")
        ? "durable-recovery-event"
        : relativePath.startsWith("pins/")
          ? "durable-recovery-pin-bytes"
          : relativePath === "intent.json"
            ? "durable-recovery-intent"
            : relativePath === "final.json"
              ? "durable-recovery-finalization"
              : "chain-reconciliation-source",
    );
  }
  assert.equal(new Set(artifacts.map((artifact) => artifact.id)).size, artifacts.length);
  return {
    classification: CURRENT_RECOVERY_CLASSIFICATION,
    artifacts,
    summary: {
      interruption: receipt.interruption,
      checkpoint: {
        checkpointId: final.checkpointId,
        intentSha256: final.intentSha256,
        finalRecordSha256: final.finalRecordSha256,
        finalArtifactSha256: sha256(finalBytes),
        terminalSha256: final.terminalSha256,
        events: final.events,
        pins: final.pins,
        recoveredOperations: final.recoveredOperations,
        liveOperations: final.liveOperations,
      },
      provenance: {
        recoveredPrefixOperations: input.operationHashes.slice(0, boundary.recoveredOperations),
        nativeContinuationOperations: appliedHashes,
        replayedAppliedOperations: 0,
        recoveredContentObjects: boundary.recoveredContentObjects,
        nativeContinuationContentObjects: boundary.nativeContinuationContentObjects,
      },
    },
  };
}

export function assertGnocchiReadonlyFinalizationAllowed(environment: Record<string, string | undefined>): void {
  assert.equal(environment[EXECUTE_FLAG], "1", `${EXECUTE_FLAG}=1 is required`);
  assert.equal((environment.TEZOS_NETWORK || "shadownet").toLowerCase(), "shadownet", "Gnocchi finalization only permits Shadownet");
  assert.ok(environment[OUTPUT_ENV]?.trim(), `${OUTPUT_ENV} is required`);
}

async function readScreenshots(appRoot: string): Promise<ScreenshotEvidence[]> {
  const screenshotRoot = path.join(appRoot, "screenshots");
  const artifactRoot = path.join(appRoot, "artifacts");
  const screenshotNames = (await readdir(screenshotRoot)).filter((name) => name.endsWith(".png")).sort();
  assert.equal(screenshotNames.length, EXPECTED_SCREENSHOTS, "Gnocchi finalization requires all 19 screenshots");
  const output: ScreenshotEvidence[] = [];
  let previousTimestamp = 0;
  for (const [index, name] of screenshotNames.entries()) {
    const ordinal = index + 1;
    const prefix = String(ordinal).padStart(3, "0");
    assert.ok(name.startsWith(`${prefix}-`), `screenshot ${ordinal} must retain its canonical ordinal`);
    const stage = name.slice(0, -".png".length);
    const sidecarName = `screenshot-${stage}.json`;
    const [screenshotBytes, sidecarBytes] = await Promise.all([
      readRegularFile(path.join(screenshotRoot, name), `screenshot ${ordinal}`),
      readRegularFile(path.join(artifactRoot, sidecarName), `screenshot ${ordinal} sidecar`),
    ]);
    const sidecar = objectValue(JSON.parse(Buffer.from(sidecarBytes).toString("utf8")), `screenshot ${ordinal} sidecar`);
    assert.equal(sidecar.schema, "pastaprotocol-screenshot-evidence@1");
    assert.equal(sidecar.app, APP);
    assert.equal(sidecar.classification, "UI-LIVE");
    assert.equal(safeInteger(sidecar.stageOrdinal, `screenshot ${ordinal} stage ordinal`), ordinal);
    assert.equal(sidecar.sha256, sha256(screenshotBytes), `screenshot ${ordinal} hash differs from its sidecar`);
    assert.equal(safeInteger(sidecar.byteCount, `screenshot ${ordinal} byte count`), screenshotBytes.byteLength);
    assert.equal(sidecar.viewport?.width, 1440);
    assert.equal(sidecar.viewport?.height, 900);
    assert.equal(sidecar.viewport?.deviceScaleFactor, 1);
    assert.match(String(sidecar.url || ""), /^http:\/\/127\.0\.0\.1:\d+\/creation-tools\/gnocchi\/index\.html$/);
    const timestamp = Date.parse(String(sidecar.timestampUtc || ""));
    assert.ok(Number.isFinite(timestamp) && timestamp >= previousTimestamp, `screenshot ${ordinal} timestamp is invalid or out of order`);
    previousTimestamp = timestamp;
    const domEvidence = arrayValue(sidecar.domEvidence, `screenshot ${ordinal} DOM evidence`);
    assert.ok(domEvidence.length > 0, `screenshot ${ordinal} must retain DOM evidence`);
    for (const [evidenceIndex, evidenceValue] of domEvidence.entries()) {
      const evidence = objectValue(evidenceValue, `screenshot ${ordinal} DOM evidence ${evidenceIndex}`);
      assert.ok(typeof evidence.selector === "string" && evidence.selector.length > 0);
      assert.ok(safeInteger(evidence.matchCount, `screenshot ${ordinal} match count`) > 0);
      assert.equal(typeof evidence.text, "string");
    }
    output.push({
      sidecar,
      screenshot: {
        caption: `${APP}: ${sidecar.capability} — ${sidecar.stageName}`,
        path: `screenshots/${name}`,
        sha256: sha256(screenshotBytes),
        stage,
      },
      sidecarArtifact: {
        id: `screenshot-sidecar-${stage}`,
        kind: "screenshot-sidecar",
        path: `artifacts/${sidecarName}`,
        sha256: sha256(sidecarBytes),
      },
    });
  }
  const flattenedDom = output.flatMap(({ sidecar }) => sidecar.domEvidence.map((entry: JsonObject) => String(entry.text || ""))).join("\n");
  assert.match(flattenedDom, /POLICY LOCKED/);
  assert.match(flattenedDom, /mint failed: (?:this )?sale is paused/);
  assert.match(flattenedDom, /mint failed: not enough supply left/);
  assert.match(flattenedDom, /3 lifetime minted \/ 4 cap/);
  return output;
}

function contractFromScreenshots(screenshots: ScreenshotEvidence[]): string {
  const addresses = new Set<string>();
  for (const { sidecar } of screenshots) {
    for (const entry of sidecar.domEvidence as JsonObject[]) {
      for (const match of String(entry.text || "").matchAll(/KT1[1-9A-HJ-NP-Za-km-z]{33}/g)) addresses.add(match[0]);
    }
  }
  assert.equal(addresses.size, 1, "Gnocchi screenshots must bind exactly one contract address");
  const address = [...addresses][0];
  assert.equal(validateContractAddress(address), ValidationResult.VALID);
  return address;
}

export function validateRecoveredGnocchiOperations(input: {
  contractAddress: string;
  originations: unknown;
  transactions: unknown;
}): RecoveredOperationEvidence {
  const originations = arrayValue(input.originations, "Gnocchi originations");
  assert.equal(originations.length, 1, "Gnocchi finalization requires exactly one origination");
  const origin = objectValue(originations[0], "Gnocchi origination");
  const originContract = String(origin.originatedContract?.address || "");
  const creator = String(origin.sender?.address || "");
  assert.equal(originContract, input.contractAddress);
  assert.equal(origin.status, "applied");
  assert.equal(validateAddress(creator), ValidationResult.VALID);
  assert.equal(validateOperation(String(origin.hash || "")), ValidationResult.VALID);

  const transactions = arrayValue(input.transactions, "Gnocchi transactions")
    .map((value, index) => objectValue(value, `Gnocchi transaction ${index}`))
    .sort((left, right) => safeInteger(left.level, "transaction level") - safeInteger(right.level, "transaction level"));
  assert.equal(transactions.length, 11, "Gnocchi finalization requires exactly 11 applied root calls");
  const expectedEntrypoints = [
    "create_open_edition", "create_open_edition", "create_open_edition",
    "open_mint", "open_mint", "open_mint",
    "set_sale_active", "set_sale_active",
    "open_mint", "open_mint", "open_mint",
  ];
  const openSenders: Array<{ address: string; level: number }> = [];
  for (const [index, transaction] of transactions.entries()) {
    assert.equal(transaction.status, "applied", `Gnocchi transaction ${index} must be applied`);
    assert.equal(transaction.target?.address, input.contractAddress, `Gnocchi transaction ${index} target drift`);
    assert.equal(transaction.parameter?.entrypoint, expectedEntrypoints[index], `Gnocchi transaction ${index} action order drift`);
    assert.equal(validateOperation(String(transaction.hash || "")), ValidationResult.VALID);
    const sender = String(transaction.sender?.address || "");
    assert.equal(validateAddress(sender), ValidationResult.VALID);
    if (transaction.parameter.entrypoint === "open_mint") {
      assert.equal(safeInteger(transaction.amount, `Gnocchi mint ${index} amount`), 1);
      openSenders.push({ address: sender, level: safeInteger(transaction.level, `Gnocchi mint ${index} level`) });
    } else {
      assert.equal(sender, creator, `Gnocchi creator call ${index} signer drift`);
      assert.equal(safeInteger(transaction.amount, `Gnocchi creator call ${index} amount`), 0);
    }
  }
  const senderFirstLevel = new Map<string, number>();
  for (const sender of openSenders) {
    senderFirstLevel.set(sender.address, Math.min(senderFirstLevel.get(sender.address) ?? Number.MAX_SAFE_INTEGER, sender.level));
  }
  assert.equal(senderFirstLevel.size, 2, "Gnocchi finalization requires two independent collector signers");
  const collectors = [...senderFirstLevel.entries()].sort((left, right) => left[1] - right[1]).map(([address]) => address);
  for (const collector of collectors) {
    assert.notEqual(collector, creator);
    assert.equal(openSenders.filter(({ address }) => address === collector).length, 3, `${collector} must have exactly three mints`);
  }
  const ordered = [origin, ...transactions];
  const operationHashes = ordered.map((operation) => String(operation.hash || ""));
  assert.equal(new Set(operationHashes).size, operationHashes.length, "Gnocchi operation hashes must be unique");
  const indexedReceipts = ordered.map((operation, index) => {
    const isOrigination = index === 0;
    const entrypoint = isOrigination ? undefined : String(operation.parameter.entrypoint);
    return {
      schema: "pastaprotocol-indexed-operation-receipt@1",
      source: "tzkt",
      action: isOrigination ? "originate" : "call",
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress: String(operation.sender.address),
      timestampUtc: String(operation.timestamp),
      operationHash: String(operation.hash),
      contractAddress: input.contractAddress,
      status: "applied",
      level: safeInteger(operation.level, `operation ${index} level`),
      counter: operation.counter === undefined ? null : safeInteger(operation.counter, `operation ${index} counter`),
      ...(entrypoint ? { entrypoints: [entrypoint] } : {}),
    };
  });
  const manifestOperations = indexedReceipts.map((receipt) => {
    const entrypoint = receipt.entrypoints?.[0];
    return {
      kind: receipt.action === "originate"
        ? "origination"
        : entrypoint === "create_open_edition"
          ? "create"
          : entrypoint === "open_mint"
            ? "mint"
            : "manage",
      hash: receipt.operationHash,
      contractAddress: input.contractAddress,
      ...(entrypoint ? { entrypoint } : {}),
      status: "applied",
      explorerUrl: `https://shadownet.tzkt.io/${receipt.operationHash}`,
    };
  });
  const terminal = indexedReceipts[indexedReceipts.length - 1];
  return {
    creator,
    collectorOne: collectors[0],
    collectorTwo: collectors[1],
    indexedReceipts,
    manifestOperations,
    operationHashes,
    terminalLevel: terminal.level,
    terminalOperationHash: terminal.operationHash,
  };
}

function activeRows(value: unknown, label: string, expectedLength: number): JsonObject[] {
  const rows = arrayValue(value, label).map((row, index) => objectValue(row, `${label} ${index}`));
  assert.equal(rows.length, expectedLength, `${label} must expose exactly ${expectedLength} rows`);
  rows.forEach((row, index) => assert.equal(row.active, true, `${label} ${index} must be active`));
  return rows;
}

function tokenRowsById(value: unknown, label: string): Map<number, JsonObject> {
  const rows = activeRows(value, label, 3);
  const output = new Map<number, JsonObject>();
  for (const row of rows) {
    const tokenId = safeInteger(row.key, `${label} token id`);
    assert.ok(tokenId <= 2 && !output.has(tokenId), `${label} contains an invalid or duplicate token id`);
    output.set(tokenId, row);
  }
  return output;
}

async function existingFinalizedAt(appRoot: string): Promise<string | undefined> {
  for (const relativePath of [RECONCILIATION_PATH, FINALIZATION_RECEIPT_PATH]) {
    const filePath = path.join(appRoot, relativePath);
    const details = await lstat(filePath).catch(() => undefined);
    if (!details) continue;
    assert.ok(details.isFile() && !details.isSymbolicLink(), `${relativePath} must remain a regular file`);
    const parsed = objectValue(JSON.parse(await readFile(filePath, "utf8")), relativePath);
    const candidate = parsed.finalizedAt || parsed.proofWindow?.finalizedAt;
    if (typeof candidate === "string" && Number.isFinite(Date.parse(candidate))) return candidate;
  }
  return undefined;
}

async function existingAcceptedFinalization(appRoot: string, runId: string): Promise<{
  contractAddress: string;
  receiptPath: string;
  manifestPath: string;
  operationHashes: string[];
} | undefined> {
  const manifestPath = path.join(appRoot, "manifest.json");
  const details = await lstat(manifestPath).catch(() => undefined);
  if (!details) return undefined;
  assert.ok(details.isFile() && !details.isSymbolicLink(), "existing Gnocchi manifest must be a regular non-symlink file");
  const manifest = objectValue(JSON.parse(await readFile(manifestPath, "utf8")), "existing Gnocchi manifest");
  assert.equal(manifest.schema, "pastaprotocol-app-proof@1");
  assert.equal(manifest.app, APP);
  assert.equal(manifest.runId, runId);
  assert.ok(
    new Set(["UI-LIVE-READ-ONLY-FINALIZATION", CURRENT_RECOVERY_CLASSIFICATION]).has(manifest.classification),
    "existing Gnocchi manifest classification is unsupported",
  );
  const contracts = arrayValue(manifest.contracts, "existing Gnocchi contracts");
  assert.equal(contracts.length, 1);
  const contractAddress = String(contracts[0]?.address || "");
  assert.equal(validateContractAddress(contractAddress), ValidationResult.VALID);
  const operations = arrayValue(manifest.operations, "existing Gnocchi operations");
  assert.equal(operations.length, 12);
  const operationHashes = operations.map((operation, index) => {
    assert.equal(operation?.status, "applied", `existing Gnocchi operation ${index} status`);
    assert.equal(operation?.contractAddress, contractAddress, `existing Gnocchi operation ${index} contract`);
    const hash = String(operation?.hash || "");
    assert.equal(validateOperation(hash), ValidationResult.VALID, `existing Gnocchi operation ${index} hash`);
    return hash;
  });
  assert.equal(new Set(operationHashes).size, operationHashes.length);
  const artifacts = arrayValue(manifest.artifacts, "existing Gnocchi artifacts");
  for (const [id, relativePath] of [
    ["ui-live-readonly-finalization", FINALIZATION_RECEIPT_PATH],
    ["gnocchi-chain-reconciliation-snapshot", RECONCILIATION_PATH],
  ] as const) {
    const matches = artifacts.filter((artifact) => artifact?.id === id && artifact?.path === relativePath);
    assert.equal(matches.length, 1, `existing Gnocchi manifest must bind ${id} exactly once`);
    const bytes = await readRegularFile(path.join(appRoot, relativePath), `existing Gnocchi ${id}`);
    assert.equal(sha256(bytes), matches[0].sha256, `existing Gnocchi ${id} hash`);
  }
  const receiptPath = path.join(appRoot, FINALIZATION_RECEIPT_PATH);
  const receipt = objectValue(JSON.parse(await readFile(receiptPath, "utf8")), "existing Gnocchi finalization receipt");
  assert.equal(receipt.schema, "pastaprotocol-gnocchi-ui-live-finalized@1");
  assert.equal(receipt.classification, manifest.classification);
  assert.equal(receipt.originalBridgeReceiptStream?.synthesized, false);
  assert.equal(receipt.sideEffects?.signerMaterialLoaded, false);
  assert.equal(receipt.sideEffects?.chainWrites, 0);
  assert.equal(receipt.sideEffects?.ipfsWrites, 0);
  if (manifest.classification === CURRENT_RECOVERY_CLASSIFICATION) {
    const recovery = await readCurrentRecoveryEvidence({ appRoot, runId, contractAddress, operationHashes });
    assert.ok(recovery, "existing recovered Gnocchi finalization lost its checkpoint evidence");
    assert.equal(receipt.recovery?.checkpoint?.checkpointId, recovery.summary.checkpoint.checkpointId);
  }
  return { contractAddress, receiptPath, manifestPath, operationHashes };
}

export async function finalizeGnocchiUiLiveReadOnly(input: {
  runRoot: string;
  fetchImpl?: FetchLike;
  publicIpfsGateway?: string;
}): Promise<{ contractAddress: string; receiptPath: string; manifestPath: string; operationHashes: string[] }> {
  const fetchImpl = input.fetchImpl || fetch;
  const runRoot = path.resolve(input.runRoot);
  const runId = path.basename(runRoot);
  assert.match(runId, SAFE_RUN_ID, "proof run id is unsafe");
  const appRoot = path.join(runRoot, APP);
  const appDetails = await lstat(appRoot).catch(() => undefined);
  assert.ok(appDetails?.isDirectory() && !appDetails.isSymbolicLink(), `Gnocchi proof directory is missing at ${appRoot}`);
  const manifestPath = path.join(appRoot, "manifest.json");
  const existing = await existingAcceptedFinalization(appRoot, runId);
  if (existing) return existing;

  const screenshots = await readScreenshots(appRoot);
  const contractAddress = contractFromScreenshots(screenshots);
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const encodedContract = encodeURIComponent(contractAddress);
  const sourceUrls = {
    contract: `${base}/contracts/${encodedContract}`,
    storage: `${base}/contracts/${encodedContract}/storage`,
    code: `${base}/contracts/${encodedContract}/code`,
    originations: `${base}/operations/originations?originatedContract=${encodedContract}&status=applied&limit=10`,
    transactions: `${base}/operations/transactions?target=${encodedContract}&status=applied&limit=100`,
    tokens: `${base}/tokens?contract=${encodedContract}&limit=20`,
  };
  const contractFetch = await fetchJsonWithRetry(fetchImpl, sourceUrls.contract, "Gnocchi indexed contract");
  const storageFetch = await fetchJsonWithRetry(fetchImpl, sourceUrls.storage, "Gnocchi indexed storage");
  const codeFetch = await fetchJsonWithRetry(fetchImpl, sourceUrls.code, "Gnocchi indexed Michelson code");
  const originationFetch = await fetchJsonWithRetry(fetchImpl, sourceUrls.originations, "Gnocchi indexed origination");
  const transactionFetch = await fetchJsonWithRetry(fetchImpl, sourceUrls.transactions, "Gnocchi indexed transactions");
  const tokenFetch = await fetchJsonWithRetry(fetchImpl, sourceUrls.tokens, "Gnocchi indexed tokens");
  const contract = objectValue(contractFetch.value, "Gnocchi indexed contract");
  assert.equal(contract.address, contractAddress);
  assert.equal(contract.kind, "asset");
  assert.ok(arrayValue(contract.tzips, "Gnocchi indexed TZIPs").includes("fa2"));
  const storage = objectValue(storageFetch.value, "Gnocchi indexed storage");
  assert.equal(safeInteger(storage.next_token_id, "Gnocchi next token id"), 3);
  const operationEvidence = validateRecoveredGnocchiOperations({
    contractAddress,
    originations: originationFetch.value,
    transactions: transactionFetch.value,
  });
  assert.equal(storage.administrator, operationEvidence.creator);
  const currentRecovery = await readCurrentRecoveryEvidence({
    appRoot,
    runId,
    contractAddress,
    operationHashes: operationEvidence.operationHashes,
  });
  const classification = currentRecovery?.classification || "UI-LIVE-READ-ONLY-FINALIZATION";

  const mapIds = {
    ledger: safeInteger(storage.ledger, "Gnocchi ledger big-map id"),
    metadata: safeInteger(storage.metadata, "Gnocchi metadata big-map id"),
    policyLocked: safeInteger(storage.policy_locked, "Gnocchi policy-lock big-map id"),
    sales: safeInteger(storage.sales, "Gnocchi sales big-map id"),
    tokenMetadata: safeInteger(storage.token_metadata, "Gnocchi token metadata big-map id"),
    totalMinted: safeInteger(storage.total_minted, "Gnocchi total-minted big-map id"),
    totalReserved: safeInteger(storage.total_reserved, "Gnocchi total-reserved big-map id"),
    totalSupply: safeInteger(storage.total_supply, "Gnocchi total-supply big-map id"),
  };
  const mapUrls = Object.fromEntries(Object.entries(mapIds).map(([key, id]) => [key, `${base}/bigmaps/${id}/keys?active=true&limit=100`])) as Record<keyof typeof mapIds, string>;
  const ledgerFetch = await fetchJsonWithRetry(fetchImpl, mapUrls.ledger, "Gnocchi ledger");
  const metadataFetch = await fetchJsonWithRetry(fetchImpl, mapUrls.metadata, "Gnocchi collection metadata");
  const policyFetch = await fetchJsonWithRetry(fetchImpl, mapUrls.policyLocked, "Gnocchi policy locks");
  const salesFetch = await fetchJsonWithRetry(fetchImpl, mapUrls.sales, "Gnocchi sales");
  const tokenMetadataFetch = await fetchJsonWithRetry(fetchImpl, mapUrls.tokenMetadata, "Gnocchi token metadata");
  const totalMintedFetch = await fetchJsonWithRetry(fetchImpl, mapUrls.totalMinted, "Gnocchi total minted");
  const totalReservedFetch = await fetchJsonWithRetry(fetchImpl, mapUrls.totalReserved, "Gnocchi total reserved");
  const totalSupplyFetch = await fetchJsonWithRetry(fetchImpl, mapUrls.totalSupply, "Gnocchi total supply");

  const metadataRows = activeRows(metadataFetch.value, "Gnocchi collection metadata", 1);
  assert.equal(metadataRows[0].key, "");
  const collectionMetadataUri = requireIpfsUri(hexToUtf8(String(metadataRows[0].value)), "Gnocchi collection metadata URI");
  const tokenMetadataRows = tokenRowsById(tokenMetadataFetch.value, "Gnocchi token metadata");
  const tokenMetadataUris = [0, 1, 2].map((tokenId) =>
    requireIpfsUri(hexToUtf8(String(tokenMetadataRows.get(tokenId)?.value?.token_info?.[""] || "")), `Gnocchi token ${tokenId} metadata URI`)
  );
  const sales = tokenRowsById(salesFetch.value, "Gnocchi sales");
  const policyLocks = tokenRowsById(policyFetch.value, "Gnocchi policy locks");
  const totalMinted = tokenRowsById(totalMintedFetch.value, "Gnocchi total minted");
  const totalReserved = tokenRowsById(totalReservedFetch.value, "Gnocchi total reserved");
  const totalSupply = tokenRowsById(totalSupplyFetch.value, "Gnocchi total supply");
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    assert.equal(policyLocks.get(tokenId)?.value, true, `Gnocchi token ${tokenId} policy must be locked`);
    assert.equal(safeInteger(totalMinted.get(tokenId)?.value, `Gnocchi token ${tokenId} total minted`), EXPECTED_TOKEN_SUPPLIES[tokenId]);
    assert.equal(safeInteger(totalReserved.get(tokenId)?.value, `Gnocchi token ${tokenId} total reserved`), 0);
    assert.equal(safeInteger(totalSupply.get(tokenId)?.value, `Gnocchi token ${tokenId} total supply`), EXPECTED_TOKEN_SUPPLIES[tokenId]);
  }
  const timedSale = objectValue(sales.get(0)?.value, "Gnocchi timed OE sale");
  const foreverSale = objectValue(sales.get(1)?.value, "Gnocchi forever OE sale");
  const limitedSale = objectValue(sales.get(2)?.value, "Gnocchi LE sale");
  assert.equal(timedSale.active, true);
  assert.ok(timedSale.start && timedSale.end && timedSale.max_supply === null);
  assert.equal(foreverSale.active, true);
  assert.equal(foreverSale.start, null);
  assert.equal(foreverSale.end, null);
  assert.equal(foreverSale.max_supply, null);
  assert.equal(limitedSale.active, true);
  assert.ok(limitedSale.start && limitedSale.end);
  assert.equal(safeInteger(limitedSale.max_supply, "Gnocchi LE max supply"), 4);

  const ledgerRows = activeRows(ledgerFetch.value, "Gnocchi ledger", 9);
  const balance = (owner: string, tokenId: number): number => {
    const matches = ledgerRows.filter((row) => row.key?.owner === owner && safeInteger(row.key?.token_id, "ledger token id") === tokenId);
    assert.equal(matches.length, 1, `Gnocchi ledger must contain ${owner} token ${tokenId} exactly once`);
    return safeInteger(matches[0].value, `${owner} token ${tokenId} balance`);
  };
  for (const [owner, expected] of [
    [operationEvidence.creator, [2, 2, 1]],
    [operationEvidence.collectorOne, [1, 1, 1]],
    [operationEvidence.collectorTwo, [1, 1, 1]],
  ] as const) {
    expected.forEach((amount, tokenId) => assert.equal(balance(owner, tokenId), amount));
  }
  const indexedTokens = arrayValue(tokenFetch.value, "Gnocchi indexed tokens");
  assert.equal(indexedTokens.length, 3);
  indexedTokens.sort((left, right) => safeInteger(left.tokenId, "indexed token id") - safeInteger(right.tokenId, "indexed token id"));
  indexedTokens.forEach((token, tokenId) => {
    assert.equal(safeInteger(token.tokenId, "indexed token id"), tokenId);
    assert.equal(safeInteger(token.totalSupply, `indexed token ${tokenId} supply`), EXPECTED_TOKEN_SUPPLIES[tokenId]);
  });

  const proofContractBytes = await readRegularFile(path.join(appRoot, CONTRACT_CODE_PATH), "Gnocchi saved contract artifact");
  const currentContractBytes = await readRegularFile(CONTRACT_ARTIFACT_PATH, "Gnocchi current compiled contract artifact");
  assert.deepEqual(proofContractBytes, currentContractBytes, "Gnocchi saved contract artifact differs from the current compiled artifact");
  const artifactCode = JSON.parse(Buffer.from(currentContractBytes).toString("utf8"));
  const artifactCodeSha256 = hashMichelsonScriptCode(artifactCode);
  const onChainCodeSha256 = assertMichelsonScriptCodeIdentity(
    codeFetch.value,
    artifactCode,
    "Gnocchi indexed Michelson differs from the current compiled contract",
  );
  assert.equal(onChainCodeSha256, artifactCodeSha256);
  const artifactSha256 = sha256(currentContractBytes);

  const artifactRoot = path.join(appRoot, "artifacts");
  for (const fileName of EXPECTED_CONTENT_FILES) await readRegularFile(path.join(artifactRoot, fileName), `Gnocchi content artifact ${fileName}`);
  const metadataValues: JsonObject[] = [];
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    metadataValues[tokenId] = objectValue(
      JSON.parse(await readFile(path.join(artifactRoot, `token-${tokenId}-metadata.json`), "utf8")),
      `Gnocchi token ${tokenId} metadata`,
    );
  }
  const collectionBytes = await readRegularFile(path.join(artifactRoot, "collection-metadata.json"), "Gnocchi collection metadata artifact");
  objectValue(JSON.parse(Buffer.from(collectionBytes).toString("utf8")), "Gnocchi collection metadata artifact");
  const mediaUris = metadataValues.map((metadata, tokenId) => requireIpfsUri(metadata.artifactUri, `Gnocchi token ${tokenId} media URI`));
  const publicGateway = input.publicIpfsGateway || process.env.PASTA_SHADOWNET_IPFS_GATEWAY || "https://ipfs.io/ipfs";
  const contentDefinitions = [
    { id: "token-0-media", kind: "token-media", fileName: "token-0-media.png", uri: mediaUris[0] },
    { id: "collection-metadata", kind: "collection-metadata", fileName: "collection-metadata.json", uri: collectionMetadataUri },
    { id: "token-0-metadata", kind: "token-metadata", fileName: "token-0-metadata.json", uri: tokenMetadataUris[0] },
    { id: "token-1-media", kind: "token-media", fileName: "token-1-media.png", uri: mediaUris[1] },
    { id: "token-1-metadata", kind: "token-metadata", fileName: "token-1-metadata.json", uri: tokenMetadataUris[1] },
    { id: "token-2-media", kind: "token-media", fileName: "token-2-media.png", uri: mediaUris[2] },
    { id: "token-2-metadata", kind: "token-metadata", fileName: "token-2-metadata.json", uri: tokenMetadataUris[2] },
  ];
  const contentArtifacts: JsonObject[] = [];
  const contentRetrievals: JsonObject[] = [];
  for (const definition of contentDefinitions) {
    const localBytes = await readRegularFile(path.join(artifactRoot, definition.fileName), `Gnocchi ${definition.id}`);
    const url = gatewayUrl(publicGateway, definition.uri);
    const remote = await fetchBytesWithRetry(fetchImpl, url, `Gnocchi public content ${definition.id}`);
    assert.deepEqual(
      Buffer.from(remote.bytes),
      Buffer.from(localBytes),
      `${definition.id} public gateway bytes differ from the saved content`,
    );
    const digest = sha256(localBytes);
    contentArtifacts.push({
      id: definition.id,
      kind: definition.kind,
      path: `artifacts/${definition.fileName}`,
      sha256: digest,
      ipfsUri: definition.uri,
      gatewayUrl: url,
      retrievedSha256: digest,
    });
    contentRetrievals.push({
      id: definition.id,
      ipfsUri: definition.uri,
      gatewayUrl: url,
      localSha256: digest,
      retrievedSha256: digest,
      byteLength: localBytes.byteLength,
      retrievedAt: remote.retrievedAt,
    });
  }

  const ravioliDependency = buildGnocchiRavioliDependencyEvidence({
    contractAddress,
    administrator: operationEvidence.creator,
    collectorOne: operationEvidence.collectorOne,
    collectorTwo: operationEvidence.collectorTwo,
    metadataUri: tokenMetadataUris[2],
    sale: {
      active: limitedSale.active === true,
      start: limitedSale.start,
      end: limitedSale.end,
      base_price: safeInteger(limitedSale.base_price, "Gnocchi LE base price"),
      increment: safeInteger(limitedSale.increment, "Gnocchi LE increment"),
      step_size: safeInteger(limitedSale.step_size, "Gnocchi LE step size"),
      min_price: limitedSale.min_price === null ? null : safeInteger(limitedSale.min_price, "Gnocchi LE min price"),
      max_price: limitedSale.max_price === null ? null : safeInteger(limitedSale.max_price, "Gnocchi LE max price"),
      max_supply: safeInteger(limitedSale.max_supply, "Gnocchi LE max supply"),
      treasury: String(limitedSale.treasury),
    },
    policyLocked: policyLocks.get(2)?.value === true,
    totalSupply: safeInteger(totalSupply.get(2)?.value, "Gnocchi LE total supply"),
    totalMinted: safeInteger(totalMinted.get(2)?.value, "Gnocchi LE total minted"),
    totalReserved: safeInteger(totalReserved.get(2)?.value, "Gnocchi LE total reserved"),
    creatorBalance: balance(operationEvidence.creator, 2),
    collectorOneBalance: balance(operationEvidence.collectorOne, 2),
    collectorTwoBalance: balance(operationEvidence.collectorTwo, 2),
    artifactSha256,
    artifactCodeSha256,
    onChainCodeSha256,
  });

  const indexed = {
    storageBigMaps: {
      ledger: mapIds.ledger,
      metadata: mapIds.metadata,
      sales: mapIds.sales,
      tokenMetadata: mapIds.tokenMetadata,
    },
    indexedLedgerEntries: ledgerRows.length,
    indexedCollectionMetadataEntries: metadataRows.length,
    indexedSaleEntries: sales.size,
    indexedMintTransactions: operationEvidence.indexedReceipts.filter((receipt) => receipt.entrypoints?.includes("open_mint")).length,
    indexedTokenMetadataUris: tokenMetadataUris,
  };
  const firstScreenshotAt = String(screenshots[0].sidecar.timestampUtc);
  const lastScreenshotAt = String(screenshots[screenshots.length - 1].sidecar.timestampUtc);
  const finalizedAt = await existingFinalizedAt(appRoot) || new Date().toISOString();
  const recoveryInterruption = currentRecovery
    ? objectValue(currentRecovery.summary.interruption, "Gnocchi recovery interruption summary")
    : undefined;
  const recoveryCheckpoint = currentRecovery
    ? objectValue(currentRecovery.summary.checkpoint, "Gnocchi recovery checkpoint summary")
    : undefined;
  const isRetiredRecoveryBoundary = recoveryCheckpoint?.recoveredOperations === 3 &&
    recoveryCheckpoint?.liveOperations === 9;
  const recoveryBridgeReason = !currentRecovery
    ? "The native UI run completed its visible actions, then exited on a terminal read-only RPC 429 before its in-memory bridge stream was packaged."
    : isRetiredRecoveryBoundary
      ? "The first native UI process exited after a transient post-confirmation projected-storage HTTP 500. An immutable exact-boundary checkpoint then preserved the three applied prefix operations, performed the nine remaining operations without replay, and retained native receipts for the continuation."
      : `The first native UI process exited after a transient post-confirmation projected-storage read failure. An immutable exact-boundary checkpoint then preserved ${recoveryCheckpoint?.recoveredOperations} applied prefix operations, performed ${recoveryCheckpoint?.liveOperations} remaining operations without replay, and retained native receipts for the continuation.`;
  const endpointEvidence = [
    contractFetch, storageFetch, codeFetch, originationFetch, transactionFetch, tokenFetch,
    ledgerFetch, metadataFetch, policyFetch, salesFetch, tokenMetadataFetch,
    totalMintedFetch, totalReservedFetch, totalSupplyFetch,
  ].map(({ url, rawSha256, retrievedAt }) => ({ url, method: "GET", rawSha256, retrievedAt }));
  const reconciliation = {
    schema: "pastaprotocol-gnocchi-chain-reconciliation@1",
    classification,
    status: "RECOVERED",
    runId,
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    finalizedAt,
    proofWindow: { firstScreenshotAt, lastScreenshotAt, terminalLevel: operationEvidence.terminalLevel },
    sideEffects: {
      signerMaterialLoaded: false,
      chainWrites: 0,
      ipfsWrites: 0,
      httpMethods: ["GET"],
    },
    originalFailure: currentRecovery
      ? {
        code: recoveryInterruption?.code,
        stage: recoveryInterruption?.stage,
        bridgeReceiptStreamAvailable: false,
        bridgeReceiptStreamSynthesized: false,
      }
      : {
        code: "RPC_HTTP_429_AFTER_CONFIRMED_WRITES",
        bridgeReceiptStreamAvailable: false,
        bridgeReceiptStreamSynthesized: false,
      },
    contract: {
      address: contractAddress,
      explorerUrl: `https://shadownet.tzkt.io/${contractAddress}`,
      kind: contract.kind,
      tzips: contract.tzips,
      typeHash: contract.typeHash,
      codeHash: contract.codeHash,
      artifactPath: CONTRACT_CODE_PATH,
      artifactSha256,
      artifactCodeSha256,
      onChainCodeSha256,
      exactMatch: true,
    },
    actors: {
      creator: operationEvidence.creator,
      collectorOne: operationEvidence.collectorOne,
      collectorTwo: operationEvidence.collectorTwo,
    },
    operations: operationEvidence.indexedReceipts,
    contentRetrievals,
    screenshots: screenshots.map(({ screenshot }) => screenshot),
    endpointEvidence,
    indexed,
    ravioliDependency,
    ...(currentRecovery ? { recovery: currentRecovery.summary } : {}),
  };
  const reconciliationBytes = deterministicJsonBytes(reconciliation);
  await writeNewOrIdentical(path.join(appRoot, RECONCILIATION_PATH), reconciliationBytes);
  const reconciliationArtifact = {
    id: "gnocchi-chain-reconciliation-snapshot",
    kind: "chain-reconciliation-snapshot",
    path: RECONCILIATION_PATH,
    sha256: sha256(reconciliationBytes),
    durability: "package-only",
  };
  const contractCodeArtifact = {
    id: "gnocchi-current-contract-code",
    kind: "contract-code",
    path: CONTRACT_CODE_PATH,
    sha256: artifactSha256,
  };
  const receipt = {
    schema: "pastaprotocol-gnocchi-ui-live-finalized@1",
    classification,
    status: "RECOVERED",
    runId,
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    rpcUrl: SHADOWNET_RPC_PRIMARY,
    tzktApi: base,
    startedAt: firstScreenshotAt,
    completedAt: lastScreenshotAt,
    finalizedAt,
    actors: {
      creator: operationEvidence.creator,
      collectorOne: operationEvidence.collectorOne,
      collectorTwo: operationEvidence.collectorTwo,
    },
    contract: {
      address: contractAddress,
      explorerUrl: `https://shadownet.tzkt.io/${contractAddress}`,
      scriptSha256: artifactSha256,
    },
    originalBridgeReceiptStream: {
      available: false,
      synthesized: false,
      reason: recoveryBridgeReason,
    },
    fundingEvidence: { available: false, synthesized: false },
    sideEffects: reconciliation.sideEffects,
    indexedOperationReceipts: operationEvidence.indexedReceipts,
    contentArtifacts,
    indexed,
    ravioliDependency,
    screenshots: screenshots.map(({ screenshot }) => screenshot),
    screenshotSidecars: screenshots.map(({ sidecarArtifact }) => sidecarArtifact),
    chainReconciliation: reconciliationArtifact,
    ...(currentRecovery ? { recovery: currentRecovery.summary } : {}),
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptPath = path.join(appRoot, FINALIZATION_RECEIPT_PATH);
  await writeNewOrIdentical(receiptPath, receiptBytes);
  const receiptArtifact = {
    id: "ui-live-readonly-finalization",
    kind: "readonly-finalization-receipt",
    path: FINALIZATION_RECEIPT_PATH,
    sha256: sha256(receiptBytes),
  };
  const sidecarArtifacts = screenshots.map(({ sidecarArtifact }) => sidecarArtifact);
  const recoveryArtifacts = currentRecovery?.artifacts || [];
  const artifacts = [
    ...contentArtifacts,
    contractCodeArtifact,
    ...recoveryArtifacts,
    reconciliationArtifact,
    receiptArtifact,
    ...sidecarArtifacts,
  ];
  const tokens = [0, 1, 2].map((tokenId) => ({
    id: `gnocchi-token-${tokenId}`,
    contractAddress,
    tokenId: String(tokenId),
    explorerUrl: `https://shadownet.tzkt.io/${contractAddress}/tokens/${tokenId}`,
    metadataArtifactId: `token-${tokenId}-metadata`,
    mediaArtifactId: `token-${tokenId}-media`,
    metadataUri: tokenMetadataUris[tokenId],
    artifactUri: mediaUris[tokenId],
  }));
  const allUrls = [
    `https://shadownet.tzkt.io/${contractAddress}`,
    ...tokens.map((token) => token.explorerUrl),
    ...contentArtifacts.map((artifact) => artifact.gatewayUrl),
  ];
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: APP,
    role: "token-publisher",
    runId,
    capturedAt: lastScreenshotAt,
    finalizedAt,
    classification,
    network: {
      name: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
      rpcUrl: SHADOWNET_RPC_PRIMARY,
      tzktApi: base,
    },
    capabilities: [{
      id: "three-policy-collector-and-lifecycle-proof",
      description: currentRecovery
        ? "Originate one Gnocchi collection, publish timed OE, forever OE, and a timed capped LE, mint each from two independent collectors, reject paused and over-cap minting, vault then reopen forever issuance through the real UI, recover an exact post-confirmation read failure without replaying any applied operation, and bind the complete continuation to an immutable checkpoint."
        : "Originate one Gnocchi collection, publish timed OE, forever OE, and a timed capped LE, mint each from two independent collectors, reject over-cap minting, vault then reopen forever issuance through the real UI, and finalize the complete evidence signer-free after a terminal read-only RPC rate limit.",
      evidence: {
        screenshots: screenshots.map(({ screenshot }) => screenshot.stage),
        artifacts: artifacts.map((artifact) => artifact.id),
        contracts: [contractAddress],
        operations: operationEvidence.operationHashes,
        tokens: tokens.map((token) => token.id),
        roleEvidence: [],
        urls: allUrls,
      },
    }],
    screenshots: screenshots.map(({ screenshot }) => screenshot),
    artifacts,
    contracts: [{ address: contractAddress, kind: "open-edition-collection", explorerUrl: `https://shadownet.tzkt.io/${contractAddress}` }],
    operations: operationEvidence.manifestOperations,
    tokens,
    roleEvidence: [],
  };
  await writeNewOrIdentical(manifestPath, deterministicJsonBytes(manifest));
  return { contractAddress, receiptPath, manifestPath, operationHashes: operationEvidence.operationHashes };
}

async function main(): Promise<void> {
  try {
    assertGnocchiReadonlyFinalizationAllowed(process.env);
    const result = await finalizeGnocchiUiLiveReadOnly({
      runRoot: String(process.env[OUTPUT_ENV]),
      publicIpfsGateway: process.env.PASTA_SHADOWNET_IPFS_GATEWAY,
    });
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    process.stdout.write(`${JSON.stringify({ status: "PASSED", classification: manifest.classification, ...result }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
