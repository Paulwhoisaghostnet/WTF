#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
  SHADOWNET_TZKT_API,
} from "./shadownet-proof-kit";
import {
  openRotiniUiLiveCheckpoint,
  ROTINI_UI_LIVE_CHECKPOINT_EVENT_SCHEMA,
  ROTINI_UI_LIVE_CHECKPOINT_FINAL_SCHEMA,
  ROTINI_UI_LIVE_CHECKPOINT_INTENT_SCHEMA,
  ROTINI_UI_LIVE_CHECKPOINT_PIN_PROOF_SCHEMA,
  ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
} from "./shadownet-rotini-ui-live-checkpoint";
import {
  buildRotiniRavioliDependencyEvidence,
  validateRotiniOutputBytes,
} from "./shadownet-rotini-ui-live";

const EXECUTE_FLAG = "PASTA_SHADOWNET_ROTINI_READONLY_FINALIZE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const APP = "rotini";
const CHECKPOINT_ROOT_PATH = "artifacts/rotini-ui-live-checkpoint";
const CONTRACT_CODE_PATH = "artifacts/rotini-current-contract-code.json";
const FINALIZATION_RECEIPT_PATH = "artifacts/rotini-ui-readonly-finalization.json";
const RECONCILIATION_PATH = "artifacts/rotini-chain-reconciliation-snapshot.json";
const TZKT_EVIDENCE_PATH = "artifacts/rotini-ui-live-tzkt-index.json";
const EXPECTED_SCREENSHOTS = 9;
const MAX_SUPPLY = 4;
const RESERVATION_TTL_SECONDS = 3_600;
export const ROTINI_PNG_RECONCILIATION_CAPABILITY = "collector reconcile PNG token";
export const ROTINI_PNG_RECONCILIATION_STAGE_NAME = "PNG token post-confirmation state reconciled";
const ROTINI_PNG_RECONCILIATION_STAGE = "007-collector-reconcile-png-token-png-token-post-confirmation-state-reconciled";
const CONTRACT_ARTIFACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/creation-tools/rotini/contract/pasta-generative-collection.contract.json",
);
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const IPFS_URI = /^ipfs:\/\/[a-zA-Z0-9]+(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)?$/;

type JsonObject = Record<string, any>;

type JsonFetch = {
  url: string;
  value: any;
  rawSha256: string;
  retrievedAt: string;
};

type CheckpointPin = {
  sequence: number;
  actor: "creator" | "collector";
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  sha256: string;
  cid: string;
  ipfsUri: string;
  publicGatewayUrl: string;
};

type CheckpointEvidence = {
  root: string;
  intent: JsonObject;
  intentSha256: string;
  finalization: JsonObject;
  finalSha256: string;
  creator: string;
  collector: string;
  contractAddress: string;
  confirmed: JsonObject[];
  pins: CheckpointPin[];
  completedAt: string;
  checkpointId: string;
};

type ScreenshotEvidence = {
  sidecar: JsonObject;
  screenshot: { caption: string; path: string; sha256: string; stage: string };
  sidecarArtifact: { id: string; kind: "screenshot-sidecar"; path: string; sha256: string };
};

type ContentDefinition = {
  id: string;
  kind: string;
  path: string;
  actor: "creator" | "collector";
  fileName: string;
  mimeType: string;
};

const CONTENT_DEFINITIONS: readonly ContentDefinition[] = Object.freeze([
  { id: "pin-001-generator-preview", kind: "generator-preview", path: "artifacts/pins/001-creator-rotini-collection-preview.png", actor: "creator", fileName: "rotini-collection-preview.png", mimeType: "image/png" },
  { id: "pin-002-generator-layer", kind: "generator-layer", path: "artifacts/pins/002-creator-rotini-layer-1.png", actor: "creator", fileName: "rotini-layer-1.png", mimeType: "image/png" },
  { id: "pin-003-generator-layer", kind: "generator-layer", path: "artifacts/pins/003-creator-rotini-layer-2.png", actor: "creator", fileName: "rotini-layer-2.png", mimeType: "image/png" },
  { id: "pin-004-generator-metadata", kind: "generator-metadata", path: "artifacts/pins/004-creator-rotini-generator.json", actor: "creator", fileName: "rotini-generator.json", mimeType: "application/json" },
  { id: "pin-005-collection-metadata", kind: "collection-metadata", path: "artifacts/pins/005-creator-collection.json", actor: "creator", fileName: "collection.json", mimeType: "application/json" },
  { id: "pin-006-generator-preview", kind: "generator-preview", path: "artifacts/pins/006-creator-rotini-collection-preview.png", actor: "creator", fileName: "rotini-collection-preview.png", mimeType: "image/png" },
  { id: "pin-007-generator-layer", kind: "generator-layer", path: "artifacts/pins/007-creator-rotini-layer-1.png", actor: "creator", fileName: "rotini-layer-1.png", mimeType: "image/png" },
  { id: "pin-008-generator-layer", kind: "generator-layer", path: "artifacts/pins/008-creator-rotini-layer-2.png", actor: "creator", fileName: "rotini-layer-2.png", mimeType: "image/png" },
  { id: "pin-009-generator-metadata", kind: "generator-metadata", path: "artifacts/pins/009-creator-rotini-generator.json", actor: "creator", fileName: "rotini-generator.json", mimeType: "application/json" },
  { id: "pin-010-generator-preview", kind: "generator-preview", path: "artifacts/pins/010-creator-rotini-collection-preview.png", actor: "creator", fileName: "rotini-collection-preview.png", mimeType: "image/png" },
  { id: "pin-011-generator-layer", kind: "generator-layer", path: "artifacts/pins/011-creator-rotini-layer-1.png", actor: "creator", fileName: "rotini-layer-1.png", mimeType: "image/png" },
  { id: "pin-012-generator-layer", kind: "generator-layer", path: "artifacts/pins/012-creator-rotini-layer-2.png", actor: "creator", fileName: "rotini-layer-2.png", mimeType: "image/png" },
  { id: "pin-013-generator-metadata", kind: "generator-metadata", path: "artifacts/pins/013-creator-rotini-generator.json", actor: "creator", fileName: "rotini-generator.json", mimeType: "application/json" },
  { id: "pin-014-token-media", kind: "token-media", path: "artifacts/pins/014-collector-rotini-0.png", actor: "collector", fileName: "rotini-0.png", mimeType: "image/png" },
  { id: "pin-015-token-metadata", kind: "token-metadata", path: "artifacts/pins/015-collector-rotini-0.json", actor: "collector", fileName: "rotini-0.json", mimeType: "application/json" },
  { id: "pin-016-token-media", kind: "token-media", path: "artifacts/pins/016-collector-rotini-1.gif", actor: "collector", fileName: "rotini-1.gif", mimeType: "image/gif" },
  { id: "pin-017-token-metadata", kind: "token-metadata", path: "artifacts/pins/017-collector-rotini-1.json", actor: "collector", fileName: "rotini-1.json", mimeType: "application/json" },
  { id: "pin-018-token-media", kind: "token-media", path: "artifacts/pins/018-collector-rotini-2.zip", actor: "collector", fileName: "rotini-2.zip", mimeType: "application/zip" },
  { id: "pin-019-token-display", kind: "token-display", path: "artifacts/pins/019-collector-rotini-2-cover.png", actor: "collector", fileName: "rotini-2-cover.png", mimeType: "image/png" },
  { id: "pin-020-token-metadata", kind: "token-metadata", path: "artifacts/pins/020-collector-rotini-2.json", actor: "collector", fileName: "rotini-2.json", mimeType: "application/json" },
]);

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
  const converted = Number(value);
  assert.ok(Number.isSafeInteger(converted) && converted >= 0, `${label} must be a non-negative safe integer`);
  return converted;
}

function timestamp(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} must be a timestamp string`);
  assert.ok(Number.isFinite(Date.parse(value as string)), `${label} is invalid`);
  return value as string;
}

function ipfsUri(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(value as string, IPFS_URI, `${label} must be an ipfs:// URI`);
  return value as string;
}

function hexText(value: unknown): string {
  return hexToUtf8(String(value || ""));
}

function optionNumber(value: unknown, label: string): number {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as JsonObject;
    if ("Some" in record) value = record.Some;
    else if ("some" in record) value = record.some;
  }
  return safeInteger(value, label);
}

async function readRegularFile(filePath: string, label: string): Promise<Uint8Array> {
  const info = await lstat(filePath).catch(() => undefined);
  assert.ok(info?.isFile() && !info.isSymbolicLink(), `${label} must be an existing regular non-symlink file`);
  return readFile(filePath);
}

async function writeNewOrIdentical(filePath: string, bytes: Uint8Array): Promise<void> {
  const info = await lstat(filePath).catch(() => undefined);
  if (info) {
    assert.ok(info.isFile() && !info.isSymbolicLink(), `${filePath} must remain a regular non-symlink file`);
    assert.deepEqual(await readFile(filePath), Buffer.from(bytes), `${filePath} differs from deterministic recovery evidence`);
    return;
  }
  await writeFile(filePath, bytes, { flag: "wx" });
}

export function assertRotiniReadonlyFinalizationAllowed(environment: Record<string, string | undefined>): void {
  assert.equal(environment[EXECUTE_FLAG], "1", `${EXECUTE_FLAG}=1 is required`);
  assert.equal((environment.TEZOS_NETWORK || "shadownet").toLowerCase(), "shadownet", "Rotini finalization only permits Shadownet");
  assert.ok(environment[OUTPUT_ENV]?.trim(), `${OUTPUT_ENV} is required`);
}

async function getBytes(fetchImpl: ReadOnlyFetch, url: string, label: string): Promise<{ bytes: Uint8Array; retrievedAt: string }> {
  return readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      fetchImpl,
      parse: async (response) => ({
        bytes: new Uint8Array(await response.arrayBuffer()),
        retrievedAt: new Date().toISOString(),
      }),
    }),
  }, { maxAttempts: 6, deadlineMs: 60_000, maxRetryAfterMs: 5_000 });
}

async function getJson(fetchImpl: ReadOnlyFetch, url: string, label: string): Promise<JsonFetch> {
  const fetched = await getBytes(fetchImpl, url, label);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(fetched.bytes).toString("utf8"));
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { url, value, rawSha256: sha256(fetched.bytes), retrievedAt: fetched.retrievedAt };
}

function checkpointRelativePath(root: string, value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} must be a string`);
  const relative = value as string;
  assert.ok(!path.isAbsolute(relative) && !relative.includes("\\") && path.posix.normalize(relative) === relative, `${label} is unsafe`);
  assert.ok(!relative.startsWith("../") && relative !== "..", `${label} escapes the checkpoint`);
  return path.join(root, relative);
}

export async function readFinalizedRotiniCheckpoint(appRoot: string): Promise<CheckpointEvidence> {
  const root = path.join(appRoot, CHECKPOINT_ROOT_PATH);
  const checkpoint = await openRotiniUiLiveCheckpoint(root);
  const validatedCheckpoint = await checkpoint.validatedEvidence();
  assert.deepEqual(validatedCheckpoint.summary, {
    status: "FINALIZED",
    completedOperations: 10,
    pins: 20,
    nonOperationReceipts: validatedCheckpoint.summary.nonOperationReceipts,
    pendingOperation: null,
    pendingPin: null,
    pendingPinReceipts: [],
  });
  const [intentBytes, finalBytes] = await Promise.all([
    readRegularFile(path.join(root, "intent.json"), "Rotini checkpoint intent"),
    readRegularFile(path.join(root, "final.json"), "Rotini checkpoint finalization"),
  ]);
  const intent = objectValue(JSON.parse(Buffer.from(intentBytes).toString("utf8")), "Rotini checkpoint intent");
  const finalization = objectValue(JSON.parse(Buffer.from(finalBytes).toString("utf8")), "Rotini checkpoint finalization");
  assert.equal(intent.schema, ROTINI_UI_LIVE_CHECKPOINT_INTENT_SCHEMA);
  assert.equal(intent.status, "IMMUTABLE");
  assert.equal(intent.network?.name, "shadownet");
  assert.equal(intent.network?.chainId, SHADOWNET_CHAIN_ID);
  assert.equal(
    intent.contractIdentity?.artifactPath,
    "public/creation-tools/rotini/contract/pasta-generative-collection.contract.json",
  );
  assert.equal(finalization.schema, ROTINI_UI_LIVE_CHECKPOINT_FINAL_SCHEMA);
  assert.equal(finalization.status, "FINALIZED");
  assert.equal(finalization.intentSha256, sha256(intentBytes));
  assert.equal(validatedCheckpoint.checkpointId, intent.checkpointId);
  assert.equal(validatedCheckpoint.intentSha256, sha256(intentBytes));
  assert.deepEqual(validatedCheckpoint.intent, intent);
  const strictFinalArtifacts = validatedCheckpoint.artifacts.filter((artifact) => artifact.path === "final.json");
  assert.equal(strictFinalArtifacts.length, 1);
  assert.equal(strictFinalArtifacts[0].sha256, sha256(finalBytes));
  assert.equal(finalization.counts?.operations, 10);
  assert.equal(finalization.counts?.pins, 20);
  assert.deepEqual(finalization.counts?.actors, { creator: 4, collector: 6 });
  const creator = String(intent.actors?.creator || "");
  const collector = String(intent.actors?.collector || "");
  assert.equal(validateAddress(creator), ValidationResult.VALID);
  assert.equal(validateAddress(collector), ValidationResult.VALID);
  assert.notEqual(creator, collector);

  const eventNames = (await readdir(path.join(root, "events"))).sort();
  const confirmed: JsonObject[] = [];
  for (const name of eventNames) {
    const bytes = await readRegularFile(path.join(root, "events", name), `Rotini checkpoint event ${name}`);
    const event = objectValue(JSON.parse(Buffer.from(bytes).toString("utf8")), `Rotini checkpoint event ${name}`);
    assert.equal(event.schema, ROTINI_UI_LIVE_CHECKPOINT_EVENT_SCHEMA);
    if (event.phase === "CONFIRMED") confirmed.push(event);
  }
  assert.equal(confirmed.length, 10);
  confirmed.forEach((event, index) => {
    const expected = ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[index];
    assert.equal(event.globalOrdinal, expected.globalOrdinal);
    assert.equal(event.operationSequence, expected.operationSequence);
    assert.equal(event.actor, expected.actor);
    assert.equal(event.receipt?.action, expected.action);
    assert.deepEqual(event.receipt?.entrypoints || [], expected.entrypoint ? [expected.entrypoint] : []);
    assert.equal(validateOperation(String(event.operationHash || "")), ValidationResult.VALID);
  });
  const contractAddress = String(confirmed[0].receipt?.contractAddress || "");
  assert.equal(validateContractAddress(contractAddress), ValidationResult.VALID);
  confirmed.forEach((event) => assert.equal(event.receipt?.contractAddress, contractAddress));

  const pins: CheckpointPin[] = [];
  for (let sequence = 1; sequence <= 20; sequence += 1) {
    const prefix = String(sequence).padStart(6, "0");
    const proofBytes = await readRegularFile(path.join(root, "pins", `${prefix}.proof.json`), `Rotini checkpoint pin ${sequence} proof`);
    const durable = objectValue(JSON.parse(Buffer.from(proofBytes).toString("utf8")), `Rotini checkpoint pin ${sequence} proof`);
    assert.equal(durable.schema, ROTINI_UI_LIVE_CHECKPOINT_PIN_PROOF_SCHEMA);
    assert.equal(durable.pinSequence, sequence);
    const bytesPath = checkpointRelativePath(root, durable.bytes?.path, `Rotini checkpoint pin ${sequence} byte path`);
    const bytes = await readRegularFile(bytesPath, `Rotini checkpoint pin ${sequence} bytes`);
    assert.equal(durable.bytes?.sha256, sha256(bytes));
    assert.equal(durable.bytes?.byteLength, bytes.byteLength);
    assert.equal(durable.proof?.sha256, sha256(bytes));
    assert.equal(durable.proof?.byteLength, bytes.byteLength);
    assert.equal(durable.proof?.publicGatewayVerified, true);
    assert.equal(durable.proof?.uri, `ipfs://${durable.proof?.cid}`);
    pins.push({
      sequence,
      actor: durable.actor,
      fileName: durable.source?.fileName,
      mimeType: durable.source?.mimeType,
      bytes,
      sha256: sha256(bytes),
      cid: durable.proof.cid,
      ipfsUri: durable.proof.uri,
      publicGatewayUrl: durable.proof.publicGatewayUrl,
    });
  }
  CONTENT_DEFINITIONS.forEach((definition, index) => {
    const pin = pins[index];
    assert.equal(pin.actor, definition.actor, `Rotini pin ${index + 1} actor drift`);
    assert.equal(pin.fileName, definition.fileName, `Rotini pin ${index + 1} file-name drift`);
    assert.equal(pin.mimeType, definition.mimeType, `Rotini pin ${index + 1} MIME drift`);
  });
  assert.equal(intent.contractIdentity?.rawArtifactSha256, sha256(await readRegularFile(CONTRACT_ARTIFACT_PATH, "Rotini compiled contract")));
  return {
    root,
    intent,
    intentSha256: sha256(intentBytes),
    finalization,
    finalSha256: sha256(finalBytes),
    creator,
    collector,
    contractAddress,
    confirmed,
    pins,
    completedAt: timestamp(finalization.completedAt, "Rotini checkpoint completion time"),
    checkpointId: String(intent.checkpointId),
  };
}

async function readScreenshots(appRoot: string, collector: string): Promise<ScreenshotEvidence[]> {
  const screenshotRoot = path.join(appRoot, "screenshots");
  const artifactRoot = path.join(appRoot, "artifacts");
  const names = (await readdir(screenshotRoot)).filter((name) => name.endsWith(".png")).sort();
  assert.equal(names.length, EXPECTED_SCREENSHOTS, "Rotini finalization requires all 9 original UI screenshots");
  const output: ScreenshotEvidence[] = [];
  let priorTimestamp = 0;
  for (const [index, name] of names.entries()) {
    const ordinal = index + 1;
    const prefix = String(ordinal).padStart(3, "0");
    assert.ok(name.startsWith(`${prefix}-`), `Rotini screenshot ${ordinal} ordinal drift`);
    const stage = name.slice(0, -4);
    const sidecarName = `screenshot-${stage}.json`;
    const [screenshotBytes, sidecarBytes] = await Promise.all([
      readRegularFile(path.join(screenshotRoot, name), `Rotini screenshot ${ordinal}`),
      readRegularFile(path.join(artifactRoot, sidecarName), `Rotini screenshot ${ordinal} sidecar`),
    ]);
    const sidecar = objectValue(JSON.parse(Buffer.from(sidecarBytes).toString("utf8")), `Rotini screenshot ${ordinal} sidecar`);
    assert.equal(sidecar.schema, "pastaprotocol-screenshot-evidence@1");
    assert.equal(sidecar.app, APP);
    assert.equal(sidecar.classification, "UI-LIVE");
    assert.equal(sidecar.stageOrdinal, ordinal);
    assert.equal(sidecar.sha256, sha256(screenshotBytes));
    assert.equal(sidecar.byteCount, screenshotBytes.byteLength);
    assert.deepEqual(sidecar.viewport, { width: 1440, height: 900, deviceScaleFactor: 1 });
    assert.match(String(sidecar.url || ""), /^http:\/\/127\.0\.0\.1:\d+\/creation-tools\/rotini\/index\.html$/);
    const observedAt = Date.parse(timestamp(sidecar.timestampUtc, `Rotini screenshot ${ordinal} timestamp`));
    assert.ok(observedAt >= priorTimestamp, `Rotini screenshot ${ordinal} timestamp order drift`);
    priorTimestamp = observedAt;
    const dom = arrayValue(sidecar.domEvidence, `Rotini screenshot ${ordinal} DOM evidence`);
    assert.ok(dom.length > 0 && dom.every((entry) => entry && safeInteger(entry.matchCount, "DOM match count") > 0));
    output.push({
      sidecar,
      screenshot: {
        caption: `rotini: ${sidecar.capability} — ${sidecar.stageName}`,
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
  const text = output.flatMap(({ sidecar }) => sidecar.domEvidence.map((entry: JsonObject) => String(entry.text || ""))).join("\n");
  for (const required of [
    "generated 4 edition(s)",
    "Published PNG generator project 0",
    "Published GIF generator project 1",
    "Published ZIP generator project 2",
    "GIF iteration 1 finalized",
    "ZIP iteration 2 finalized",
  ]) assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  if (!text.includes("PNG iteration 0 finalized")) {
    const reconciliation = output[6];
    assert.equal(
      reconciliation.screenshot.stage,
      ROTINI_PNG_RECONCILIATION_STAGE,
      "Rotini stage 7 without the native PNG finalization notice must be the exact reconciliation stage",
    );
    assert.equal(reconciliation.sidecar.capability, ROTINI_PNG_RECONCILIATION_CAPABILITY);
    assert.equal(reconciliation.sidecar.stageName, ROTINI_PNG_RECONCILIATION_STAGE_NAME);
    const dom = arrayValue(reconciliation.sidecar.domEvidence, "Rotini PNG reconciliation DOM evidence")
      .map((entry, index) => objectValue(entry, `Rotini PNG reconciliation DOM evidence ${index}`));
    const mintInfo = dom.find((entry) => entry.selector === "#mintInfo");
    assert.ok(mintInfo, "Rotini PNG reconciliation must visibly bind #mintInfo");
    const mintInfoText = String(mintInfo.text || "");
    assert.match(mintInfoText, /PNG/, "Rotini PNG reconciliation #mintInfo must show PNG");
    assert.match(mintInfoText, /1 finalized/, "Rotini PNG reconciliation #mintInfo must show one finalized token");
    const log = dom.find((entry) => entry.selector === "#log");
    assert.ok(log, "Rotini PNG reconciliation must visibly bind #log");
    assert.match(
      String(log.text || ""),
      new RegExp(`connected ${collector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} on shadownet`),
      "Rotini PNG reconciliation log must bind the checkpoint collector",
    );
  }
  return output;
}

function activeRows(value: unknown, label: string, expected: number): JsonObject[] {
  const rows = arrayValue(value, label).map((entry, index) => objectValue(entry, `${label} ${index}`));
  assert.equal(rows.length, expected, `${label} must contain exactly ${expected} active rows`);
  rows.forEach((row) => assert.equal(row.active, true, `${label} contains inactive history`));
  return rows;
}

function rowsByNatKey(value: unknown, label: string, expected: number): Map<number, JsonObject> {
  const rows = activeRows(value, label, expected);
  const result = new Map<number, JsonObject>();
  for (const row of rows) {
    const key = safeInteger(row.key, `${label} key`);
    assert.ok(!result.has(key), `${label} contains a duplicate key`);
    result.set(key, row);
  }
  return result;
}

function tokenMetadataValues(checkpoint: CheckpointEvidence): JsonObject[] {
  const expectedMimeTypes = ["image/png", "image/gif", "application/zip"] as const;
  return [15, 17, 20].map((sequence, tokenId) => {
    const pin = checkpoint.pins[sequence - 1];
    const metadata = objectValue(JSON.parse(Buffer.from(pin.bytes).toString("utf8")), `Rotini token ${tokenId} metadata`);
    assert.equal(metadata.creators?.[0], checkpoint.creator);
    assert.equal(metadata.minter, checkpoint.collector);
    assert.equal(metadata["pasta:projectId"], tokenId);
    assert.equal(metadata["pasta:iteration"], 0);
    assert.equal(metadata.formats?.[0]?.mimeType, expectedMimeTypes[tokenId]);
    return metadata;
  });
}

export function validateRecoveredRotiniOperations(input: {
  checkpoint: CheckpointEvidence;
  originations: unknown;
  transactions: unknown;
}): { indexedReceipts: JsonObject[]; manifestOperations: JsonObject[]; operationHashes: string[]; terminalLevel: number } {
  const originations = arrayValue(input.originations, "Rotini originations");
  const transactions = arrayValue(input.transactions, "Rotini transactions");
  assert.equal(originations.length, 1, "Rotini finalization requires exactly one origination");
  assert.equal(transactions.length, 9, "Rotini finalization requires exactly nine root transactions");
  const records = [objectValue(originations[0], "Rotini origination"), ...transactions.map((entry, index) => objectValue(entry, `Rotini transaction ${index}`))];
  const byHash = new Map(records.map((record) => [String(record.hash || ""), record]));
  assert.equal(byHash.size, 10, "Rotini indexed operations must be unique");
  const ordered = input.checkpoint.confirmed.map((event, index) => {
    const hash = String(event.operationHash || "");
    const record = byHash.get(hash);
    assert.ok(record, `Rotini checkpoint operation ${index} is absent from TzKT`);
    const expected = ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[index];
    assert.equal(record.status, "applied");
    assert.equal(record.sender?.address, input.checkpoint.intent.actors[expected.actor]);
    const target = record.originatedContract?.address || record.target?.address;
    assert.equal(target, input.checkpoint.contractAddress);
    if (expected.entrypoint) assert.equal(record.parameter?.entrypoint, expected.entrypoint);
    if (index > 0) {
      const expectedAmount = expected.entrypoint === "reserve_iteration" && index > 4 ? 1 : 0;
      assert.equal(safeInteger(record.amount || 0, `Rotini operation ${index} amount`), expectedAmount);
    }
    return record;
  });
  assert.equal(new Set(ordered).size, 10, "Rotini TzKT operation set contains extra or reused rows");
  const indexedReceipts = ordered.map((record, index) => {
    const expected = ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[index];
    return {
      schema: "pastaprotocol-indexed-operation-receipt@1",
      source: "tzkt",
      action: expected.action,
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress: record.sender.address,
      timestampUtc: record.timestamp,
      operationHash: record.hash,
      contractAddress: input.checkpoint.contractAddress,
      status: "applied",
      level: safeInteger(record.level, `Rotini operation ${index} level`),
      counter: record.counter === undefined ? null : safeInteger(record.counter, `Rotini operation ${index} counter`),
      ...(expected.entrypoint ? { entrypoints: [expected.entrypoint] } : {}),
    };
  });
  const operationHashes = indexedReceipts.map((receipt) => receipt.operationHash);
  const manifestOperations = indexedReceipts.map((receipt, index) => {
    const entrypoint = receipt.entrypoints?.[0];
    return {
      kind: index === 0 ? "origination" : entrypoint === "create_project" ? "publish" : entrypoint === "reserve_iteration" ? "reserve" : "finalize",
      hash: receipt.operationHash,
      contractAddress: input.checkpoint.contractAddress,
      ...(entrypoint ? { entrypoint } : {}),
      status: "applied",
      explorerUrl: `https://shadownet.tzkt.io/${receipt.operationHash}`,
    };
  });
  return {
    indexedReceipts,
    manifestOperations,
    operationHashes,
    terminalLevel: Math.max(...indexedReceipts.map((receipt) => receipt.level)),
  };
}

export type RotiniReadonlyFinalizationResult = {
  contractAddress: string;
  receiptPath: string;
  manifestPath: string;
  operationHashes: string[];
};

async function existingAcceptedFinalization(
  appRoot: string,
  runId: string,
): Promise<RotiniReadonlyFinalizationResult | undefined> {
  const manifestPath = path.join(appRoot, "manifest.json");
  const existingManifest = await lstat(manifestPath).catch(() => undefined);
  if (!existingManifest) return undefined;
  assert.ok(existingManifest.isFile() && !existingManifest.isSymbolicLink(), "existing Rotini manifest must be a regular non-symlink file");
  const manifest = objectValue(JSON.parse(await readFile(manifestPath, "utf8")), "existing Rotini manifest");
  assert.equal(manifest.schema, "pastaprotocol-app-proof@1");
  assert.equal(manifest.app, APP);
  assert.equal(manifest.runId, runId);
  assert.equal(manifest.classification, "UI-LIVE-READ-ONLY-FINALIZATION");
  const checkpoint = await readFinalizedRotiniCheckpoint(appRoot);
  assert.equal(checkpoint.intent.runId, runId);
  const contracts = arrayValue(manifest.contracts, "existing Rotini contracts");
  assert.equal(contracts.length, 1);
  assert.equal(contracts[0]?.address, checkpoint.contractAddress);
  const operations = arrayValue(manifest.operations, "existing Rotini operations");
  assert.equal(operations.length, ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX.length);
  const checkpointHashes = checkpoint.confirmed.map((event) => String(event.operationHash));
  const operationHashes = operations.map((operation, index) => {
    assert.equal(operation?.status, "applied", `existing Rotini operation ${index} status`);
    assert.equal(operation?.contractAddress, checkpoint.contractAddress, `existing Rotini operation ${index} contract`);
    assert.equal(operation?.hash, checkpointHashes[index], `existing Rotini operation ${index} checkpoint hash`);
    return String(operation.hash);
  });
  assert.equal(new Set(operationHashes).size, operationHashes.length);
  const artifacts = arrayValue(manifest.artifacts, "existing Rotini artifacts");
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  for (const [index, artifact] of artifacts.entries()) {
    const record = objectValue(artifact, `existing Rotini artifact ${index}`);
    const id = String(record.id || "");
    assert.ok(id && !seenIds.has(id), `existing Rotini artifact ${index} id must be unique`);
    seenIds.add(id);
    const relative = String(record.path || "");
    assert.ok(relative && !seenPaths.has(relative), `existing Rotini artifact ${index} path must be unique`);
    seenPaths.add(relative);
    const bytes = await readRegularFile(
      checkpointRelativePath(appRoot, relative, `existing Rotini artifact ${id} path`),
      `existing Rotini artifact ${id}`,
    );
    assert.equal(sha256(bytes), record.sha256, `existing Rotini artifact ${id} hash`);
  }
  const receiptMatches = artifacts.filter((artifact) => artifact?.id === "ui-live-readonly-finalization" && artifact?.path === FINALIZATION_RECEIPT_PATH);
  assert.equal(receiptMatches.length, 1, "existing Rotini manifest must bind the recovered receipt exactly once");
  const receiptPath = path.join(appRoot, FINALIZATION_RECEIPT_PATH);
  const receipt = objectValue(JSON.parse(await readFile(receiptPath, "utf8")), "existing Rotini receipt");
  assert.equal(receipt.schema, "pastaprotocol-rotini-ui-live-finalized@1");
  assert.equal(receipt.classification, "UI-LIVE-READ-ONLY-FINALIZATION");
  assert.equal(receipt.status, "RECOVERED");
  assert.equal(receipt.runId, runId);
  assert.equal(receipt.contract?.address, checkpoint.contractAddress);
  assert.equal(receipt.checkpoint?.checkpointId, checkpoint.checkpointId);
  assert.deepEqual(receipt.terminalInterruption, {
    classification: "TERMINAL_POST_WRITE_FAILURE_CAUSE_UNAVAILABLE",
    exactCauseAvailable: false,
    synthesized: false,
  });
  assert.equal(receipt.originalBridgeReceiptStream?.available, false);
  assert.equal(receipt.originalBridgeReceiptStream?.synthesized, false);
  assert.equal(receipt.fundingEvidence?.available, false);
  assert.equal(receipt.fundingEvidence?.synthesized, false);
  assert.deepEqual(receipt.sideEffects, { signerMaterialLoaded: false, chainWrites: 0, ipfsWrites: 0, httpMethods: ["GET"] });
  const indexedOperations = arrayValue(receipt.indexedOperationReceipts, "existing Rotini indexed operations");
  assert.deepEqual(indexedOperations.map((operation) => operation?.operationHash), operationHashes);
  assert.equal(arrayValue(receipt.contentArtifacts, "existing Rotini content artifacts").length, 20);
  const screenshots = await readScreenshots(appRoot, checkpoint.collector);
  assert.deepEqual(
    arrayValue(receipt.screenshots, "existing Rotini screenshots"),
    screenshots.map(({ screenshot }) => screenshot),
  );
  return {
    contractAddress: checkpoint.contractAddress,
    receiptPath,
    manifestPath,
    operationHashes,
  };
}

export async function finalizeRotiniUiLiveReadOnly(input: {
  runRoot: string;
  fetchImpl?: ReadOnlyFetch;
  publicIpfsGateway?: string;
}): Promise<RotiniReadonlyFinalizationResult> {
  const fetchImpl = input.fetchImpl || fetch;
  const runRoot = path.resolve(input.runRoot);
  const runId = path.basename(runRoot);
  assert.match(runId, SAFE_RUN_ID, "Rotini proof run id is unsafe");
  const appRoot = path.join(runRoot, APP);
  const appInfo = await lstat(appRoot).catch(() => undefined);
  assert.ok(appInfo?.isDirectory() && !appInfo.isSymbolicLink(), `Rotini proof directory is missing at ${appRoot}`);
  const manifestPath = path.join(appRoot, "manifest.json");
  const existing = await existingAcceptedFinalization(appRoot, runId);
  if (existing) return existing;

  const checkpoint = await readFinalizedRotiniCheckpoint(appRoot);
  assert.equal(checkpoint.intent.runId, runId);
  const screenshots = await readScreenshots(appRoot, checkpoint.collector);
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const encodedContract = encodeURIComponent(checkpoint.contractAddress);
  const sourceUrls = {
    contract: `${base}/contracts/${encodedContract}`,
    storage: `${base}/contracts/${encodedContract}/storage`,
    code: `${base}/contracts/${encodedContract}/code`,
    originations: `${base}/operations/originations?originatedContract=${encodedContract}&status=applied&limit=10`,
    transactions: `${base}/operations/transactions?target=${encodedContract}&status=applied&limit=100`,
    tokens: `${base}/tokens?contract=${encodedContract}&limit=20`,
    balances: `${base}/tokens/balances?account=${encodeURIComponent(checkpoint.collector)}&token.contract=${encodedContract}&balance.ne=0&limit=20`,
  };
  const [contractFetch, storageFetch, codeFetch, originationFetch, transactionFetch, tokenFetch, balanceFetch] = await Promise.all([
    getJson(fetchImpl, sourceUrls.contract, "Rotini indexed contract"),
    getJson(fetchImpl, sourceUrls.storage, "Rotini indexed storage"),
    getJson(fetchImpl, sourceUrls.code, "Rotini indexed Michelson code"),
    getJson(fetchImpl, sourceUrls.originations, "Rotini indexed origination"),
    getJson(fetchImpl, sourceUrls.transactions, "Rotini indexed transactions"),
    getJson(fetchImpl, sourceUrls.tokens, "Rotini indexed tokens"),
    getJson(fetchImpl, sourceUrls.balances, "Rotini indexed collector balances"),
  ]);
  const contract = objectValue(contractFetch.value, "Rotini indexed contract");
  assert.equal(contract.address, checkpoint.contractAddress);
  assert.equal(contract.kind, "asset");
  assert.ok(arrayValue(contract.tzips, "Rotini indexed TZIPs").includes("fa2"));
  assert.equal(safeInteger(contract.tokensCount, "Rotini token count"), 3);
  const storage = objectValue(storageFetch.value, "Rotini indexed storage");
  assert.equal(storage.administrator, checkpoint.creator);
  assert.equal(safeInteger(storage.next_project_id, "Rotini next project id"), 3);
  assert.equal(safeInteger(storage.next_reservation_id, "Rotini next reservation id"), 3);
  assert.equal(safeInteger(storage.next_token_id, "Rotini next token id"), 3);
  const operations = validateRecoveredRotiniOperations({
    checkpoint,
    originations: originationFetch.value,
    transactions: transactionFetch.value,
  });

  const mapNames = [
    "metadata", "projects", "reservations", "latest_reservation", "ledger", "token_metadata",
    "total_supply", "token_project", "token_seed", "token_artifact", "minted_by", "reserved_by",
    "operators", "pack_minters", "pack_reserved",
  ] as const;
  const mapIds = Object.fromEntries(mapNames.map((name) => [name, safeInteger(storage[name], `Rotini ${name} big-map id`)])) as Record<typeof mapNames[number], number>;
  const mapFetches = Object.fromEntries(await Promise.all(mapNames.map(async (name) => {
    const url = `${base}/bigmaps/${mapIds[name]}/keys?active=true&limit=100`;
    return [name, await getJson(fetchImpl, url, `Rotini ${name} big map`)] as const;
  }))) as Record<typeof mapNames[number], JsonFetch>;

  const metadataRows = activeRows(mapFetches.metadata.value, "Rotini collection metadata", 1);
  assert.equal(metadataRows[0].key, "");
  assert.equal(ipfsUri(hexText(metadataRows[0].value), "Rotini collection metadata URI"), checkpoint.pins[4].ipfsUri);
  const projectRows = rowsByNatKey(mapFetches.projects.value, "Rotini projects", 3);
  const modes = ["png", "gif", "zip"] as const;
  const prices = [0, 1, 1] as const;
  const generatorPinIndexes = [3, 8, 12] as const;
  const displayPinIndexes = [0, 5, 9] as const;
  for (let projectId = 0; projectId < 3; projectId += 1) {
    const value = objectValue(projectRows.get(projectId)?.value, `Rotini project ${projectId}`);
    assert.equal(value.active, true);
    assert.equal(hexText(value.output_mode), modes[projectId]);
    assert.equal(safeInteger(value.price, `Rotini project ${projectId} price`), prices[projectId]);
    assert.equal(optionNumber(value.max_supply, `Rotini project ${projectId} max supply`), MAX_SUPPLY);
    assert.equal(optionNumber(value.max_per_wallet, `Rotini project ${projectId} wallet cap`), MAX_SUPPLY);
    assert.equal(safeInteger(value.reservation_ttl, `Rotini project ${projectId} reservation TTL`), RESERVATION_TTL_SECONDS);
    assert.equal(safeInteger(value.minted, `Rotini project ${projectId} minted`), 1);
    assert.equal(safeInteger(value.reserved, `Rotini project ${projectId} reserved`), 0);
    assert.equal(value.treasury, checkpoint.creator);
    assert.equal(hexText(value.generator_uri), checkpoint.pins[generatorPinIndexes[projectId]].ipfsUri);
    assert.equal(hexText(value.display_uri), checkpoint.pins[displayPinIndexes[projectId]].ipfsUri);
  }
  for (const name of ["reservations", "reserved_by", "operators", "pack_minters", "pack_reserved"] as const) {
    assert.equal(activeRows(mapFetches[name].value, `Rotini ${name}`, 0).length, 0);
  }
  const latest = activeRows(mapFetches.latest_reservation.value, "Rotini latest reservation", 1)[0];
  assert.equal(latest.key, checkpoint.collector);
  assert.equal(safeInteger(latest.value, "Rotini latest reservation id"), 2);
  const ledger = activeRows(mapFetches.ledger.value, "Rotini ledger", 3);
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    assert.ok(ledger.some((row) => row.key?.owner === checkpoint.collector && safeInteger(row.key?.token_id, "Rotini ledger token id") === tokenId && safeInteger(row.value, "Rotini ledger balance") === 1));
  }
  const tokenMetadata = rowsByNatKey(mapFetches.token_metadata.value, "Rotini token metadata", 3);
  const totalSupply = rowsByNatKey(mapFetches.total_supply.value, "Rotini total supply", 3);
  const tokenProject = rowsByNatKey(mapFetches.token_project.value, "Rotini token project", 3);
  const tokenSeed = rowsByNatKey(mapFetches.token_seed.value, "Rotini token seed", 3);
  const tokenArtifact = rowsByNatKey(mapFetches.token_artifact.value, "Rotini token artifacts", 3);
  const mintedBy = activeRows(mapFetches.minted_by.value, "Rotini minted by", 3);
  const tokenMetadataJson = tokenMetadataValues(checkpoint);
  const mediaPinIndexes = [13, 15, 17] as const;
  const metadataPinIndexes = [14, 16, 19] as const;
  const mimeTypes = ["image/png", "image/gif", "application/zip"] as const;
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    const metadataValue = objectValue(tokenMetadata.get(tokenId)?.value, `Rotini token ${tokenId} metadata`);
    const artifactValue = objectValue(tokenArtifact.get(tokenId)?.value, `Rotini token ${tokenId} artifact`);
    const metadata = tokenMetadataJson[tokenId];
    const mediaPin = checkpoint.pins[mediaPinIndexes[tokenId]];
    const metadataPin = checkpoint.pins[metadataPinIndexes[tokenId]];
    assert.equal(hexText(metadataValue.token_info?.[""]), metadataPin.ipfsUri);
    assert.equal(hexText(metadataValue.token_info?.artifactUri), mediaPin.ipfsUri);
    assert.equal(hexText(artifactValue.artifact_uri), mediaPin.ipfsUri);
    assert.equal(hexText(artifactValue.mime_type), mimeTypes[tokenId]);
    assert.equal(String(artifactValue.artifact_hash || "").toLowerCase(), mediaPin.sha256);
    assert.equal(safeInteger(totalSupply.get(tokenId)?.value, `Rotini token ${tokenId} supply`), 1);
    assert.equal(safeInteger(tokenProject.get(tokenId)?.value, `Rotini token ${tokenId} project`), tokenId);
    const seed = String(tokenSeed.get(tokenId)?.value || "").toLowerCase();
    assert.equal(seed, metadata["pasta:seed"]);
    assert.equal(metadata.artifactUri, mediaPin.ipfsUri);
    assert.equal(metadata["pasta:artifactSha256"], mediaPin.sha256);
    assert.equal(metadata.formats?.[0]?.mimeType, mimeTypes[tokenId]);
    assert.ok(mintedBy.some((row) => row.key?.owner === checkpoint.collector && safeInteger(row.key?.token_id, "Rotini minted-by project") === tokenId && safeInteger(row.value, "Rotini minted-by amount") === 1));
  }
  const indexedTokens = arrayValue(tokenFetch.value, "Rotini indexed tokens");
  const indexedBalances = arrayValue(balanceFetch.value, "Rotini indexed balances");
  assert.equal(indexedTokens.length, 3);
  assert.equal(indexedBalances.length, 3);
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    assert.ok(indexedTokens.some((token) => token.contract?.address === checkpoint.contractAddress && safeInteger(token.tokenId, "Rotini indexed token id") === tokenId && token.standard === "fa2" && safeInteger(token.totalSupply, "Rotini indexed token supply") === 1));
    assert.ok(indexedBalances.some((balance) => balance.account?.address === checkpoint.collector && balance.token?.contract?.address === checkpoint.contractAddress && safeInteger(balance.token?.tokenId, "Rotini balance token id") === tokenId && safeInteger(balance.balance, "Rotini indexed balance") === 1));
  }

  const proofContractBytes = await readRegularFile(path.join(appRoot, CONTRACT_CODE_PATH), "Rotini saved contract artifact");
  const currentContractBytes = await readRegularFile(CONTRACT_ARTIFACT_PATH, "Rotini current compiled contract artifact");
  assert.deepEqual(proofContractBytes, currentContractBytes, "Rotini saved contract artifact differs from current compiled bytes");
  const artifactCode = JSON.parse(Buffer.from(currentContractBytes).toString("utf8"));
  const artifactCodeSha256 = hashMichelsonScriptCode(artifactCode);
  assert.equal(checkpoint.intent.contractIdentity.canonicalMichelsonCodeSha256, artifactCodeSha256);
  const onChainCodeSha256 = assertMichelsonScriptCodeIdentity(codeFetch.value, artifactCode, "Rotini indexed Michelson differs from current compiled contract");
  assert.equal(onChainCodeSha256, artifactCodeSha256);
  const artifactSha256 = sha256(currentContractBytes);

  const publicGateway = input.publicIpfsGateway || process.env.PASTA_SHADOWNET_IPFS_GATEWAY || "https://ipfs.fileship.xyz";
  const contentArtifacts: JsonObject[] = [];
  const contentRetrievals: JsonObject[] = [];
  for (const [index, definition] of CONTENT_DEFINITIONS.entries()) {
    const pin = checkpoint.pins[index];
    const url = `${normalizeBase(publicGateway)}/${pin.ipfsUri.slice("ipfs://".length)}`;
    const remote = await getBytes(fetchImpl, url, `Rotini public content ${definition.id}`);
    assert.deepEqual(Buffer.from(remote.bytes), Buffer.from(pin.bytes), `Rotini public bytes differ for ${definition.id}`);
    contentArtifacts.push({
      id: definition.id,
      kind: definition.kind,
      path: definition.path,
      sha256: pin.sha256,
      ipfsUri: pin.ipfsUri,
      gatewayUrl: url,
      retrievedSha256: pin.sha256,
      fileName: definition.fileName,
      actor: definition.actor,
    });
    contentRetrievals.push({
      id: definition.id,
      ipfsUri: pin.ipfsUri,
      gatewayUrl: url,
      localSha256: pin.sha256,
      retrievedSha256: pin.sha256,
      byteLength: pin.bytes.byteLength,
      retrievedAt: remote.retrievedAt,
    });
  }
  validateRotiniOutputBytes("png", checkpoint.pins[13].bytes);
  validateRotiniOutputBytes("gif", checkpoint.pins[15].bytes);
  validateRotiniOutputBytes("zip", checkpoint.pins[17].bytes);

  const ravioliDependency = buildRotiniRavioliDependencyEvidence({
    contractAddress: checkpoint.contractAddress,
    administrator: checkpoint.creator,
    projectId: 0,
    active: true,
    outputMode: "png",
    priceMutez: 0,
    maxSupply: MAX_SUPPLY,
    maxPerWallet: MAX_SUPPLY,
    reservationTtlSeconds: RESERVATION_TTL_SECONDS,
    minted: 1,
    reserved: 0,
    treasury: checkpoint.creator,
    generatorUri: checkpoint.pins[3].ipfsUri,
    displayUri: checkpoint.pins[0].ipfsUri,
    nextTokenId: 3,
    artifactSha256,
    artifactCodeSha256,
    onChainCodeSha256,
  });
  const tzktEvidence = {
    schema: "pastaprotocol-rotini-tzkt-index@1",
    contractAddress: checkpoint.contractAddress,
    collectorAddress: checkpoint.collector,
    contract: { address: contract.address, kind: contract.kind, tzips: contract.tzips, tokensCount: 3 },
    storage: {
      nextProjectId: 3,
      nextReservationId: 3,
      nextTokenId: 3,
      ...Object.fromEntries(Object.entries(mapIds).map(([name, id]) => [`${name}BigMap`, id])),
    },
    projects: projectRows.size ? [...projectRows.values()].map((row) => ({ key: row.key, value: row.value })) : [],
    ravioliCompatibility: { projectId: 0, outputMode: "png", priceMutez: 0, maxSupply: 4, minted: 1, reserved: 0, remainingReservable: 3, reservePackCapacityRequirement: "price == 0" },
    ledger: ledger.map((row) => ({ key: row.key, value: row.value })),
    tokenMetadata: [...tokenMetadata.values()].map((row) => ({ key: row.key, value: row.value })),
    tokenArtifacts: [...tokenArtifact.values()].map((row) => ({ key: row.key, value: row.value })),
    indexedTokens,
    indexedBalances,
    operations: operations.indexedReceipts.map((receipt) => ({
      hash: receipt.operationHash,
      status: receipt.status,
      type: receipt.action === "originate" ? "origination" : "transaction",
      sender: receipt.signerAddress,
      target: checkpoint.contractAddress,
      entrypoint: receipt.entrypoints?.[0] || null,
      level: receipt.level,
    })),
  };
  const tzktBytes = deterministicJsonBytes(tzktEvidence);
  const firstScreenshotAt = timestamp(screenshots[0].sidecar.timestampUtc, "Rotini first screenshot time");
  const lastScreenshotAt = timestamp(screenshots.at(-1)?.sidecar.timestampUtc, "Rotini last screenshot time");
  const finalizedAt = new Date().toISOString();
  const endpointEvidence = [
    contractFetch, storageFetch, codeFetch, originationFetch, transactionFetch, tokenFetch, balanceFetch,
    ...mapNames.map((name) => mapFetches[name]),
  ].map(({ url, rawSha256, retrievedAt }) => ({ url, method: "GET", rawSha256, retrievedAt }));
  const checkpointIntentArtifact = {
    id: "rotini-ui-live-checkpoint-intent",
    kind: "checkpoint-intent",
    path: `${CHECKPOINT_ROOT_PATH}/intent.json`,
    sha256: checkpoint.intentSha256,
  };
  const checkpointFinalArtifact = {
    id: "rotini-ui-live-checkpoint-final",
    kind: "checkpoint-finalization",
    path: `${CHECKPOINT_ROOT_PATH}/final.json`,
    sha256: checkpoint.finalSha256,
  };
  const reconciliation = {
    schema: "pastaprotocol-rotini-chain-reconciliation@1",
    classification: "UI-LIVE-READ-ONLY-FINALIZATION",
    status: "RECOVERED",
    runId,
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    finalizedAt,
    proofWindow: { firstScreenshotAt, lastScreenshotAt, checkpointCompletedAt: checkpoint.completedAt, terminalLevel: operations.terminalLevel },
    sideEffects: { signerMaterialLoaded: false, chainWrites: 0, ipfsWrites: 0, httpMethods: ["GET"] },
    originalFailure: {
      classification: "TERMINAL_POST_WRITE_FAILURE_CAUSE_UNAVAILABLE",
      exactCauseAvailable: false,
      synthesized: false,
      bridgeReceiptStreamAvailable: false,
      bridgeReceiptStreamSynthesized: false,
    },
    checkpoint: {
      checkpointId: checkpoint.checkpointId,
      intentSha256: checkpoint.intentSha256,
      finalSha256: checkpoint.finalSha256,
      completedOperations: 10,
      pins: 20,
    },
    contract: {
      address: checkpoint.contractAddress,
      explorerUrl: `https://shadownet.tzkt.io/${checkpoint.contractAddress}`,
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
    actors: { creator: checkpoint.creator, collector: checkpoint.collector },
    operations: operations.indexedReceipts,
    contentRetrievals,
    screenshots: screenshots.map(({ screenshot }) => screenshot),
    endpointEvidence,
    indexed: tzktEvidence,
    ravioliDependency,
  };
  const reconciliationBytes = deterministicJsonBytes(reconciliation);
  const reconciliationArtifact = { id: "rotini-chain-reconciliation-snapshot", kind: "chain-reconciliation-snapshot", path: RECONCILIATION_PATH, sha256: sha256(reconciliationBytes), durability: "package-only" };
  const contractCodeArtifact = { id: "rotini-current-contract-code", kind: "contract-code", path: CONTRACT_CODE_PATH, sha256: artifactSha256 };
  const tzktArtifact = { id: "rotini-ui-live-tzkt-index", kind: "indexer-evidence", path: TZKT_EVIDENCE_PATH, sha256: sha256(tzktBytes) };
  const projects = modes.map((mode, projectId) => ({ projectId, outputMode: mode, mimeType: mimeTypes[projectId], priceMutez: prices[projectId], maxSupply: 4, minted: 1, reserved: 0, remainingReservable: 3, ravioliPackCompatible: projectId === 0 }));
  const tokens = modes.map((mode, tokenId) => ({
    id: `rotini-${mode}-token-${tokenId}`,
    contractAddress: checkpoint.contractAddress,
    tokenId: String(tokenId),
    explorerUrl: `https://shadownet.tzkt.io/${checkpoint.contractAddress}/tokens/${tokenId}`,
    metadataArtifactId: CONTENT_DEFINITIONS[metadataPinIndexes[tokenId]].id,
    mediaArtifactId: CONTENT_DEFINITIONS[mediaPinIndexes[tokenId]].id,
    metadataUri: checkpoint.pins[metadataPinIndexes[tokenId]].ipfsUri,
    artifactUri: checkpoint.pins[mediaPinIndexes[tokenId]].ipfsUri,
  }));
  const receipt = {
    schema: "pastaprotocol-rotini-ui-live-finalized@1",
    classification: "UI-LIVE-READ-ONLY-FINALIZATION",
    status: "RECOVERED",
    runId,
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    rpcUrl: null,
    tzktApi: base,
    startedAt: firstScreenshotAt,
    completedAt: lastScreenshotAt,
    finalizedAt,
    actors: { creator: checkpoint.creator, collector: checkpoint.collector, independent: true },
    contract: { address: checkpoint.contractAddress, explorerUrl: `https://shadownet.tzkt.io/${checkpoint.contractAddress}`, scriptSha256: artifactSha256 },
    terminalInterruption: {
      classification: "TERMINAL_POST_WRITE_FAILURE_CAUSE_UNAVAILABLE",
      exactCauseAvailable: false,
      synthesized: false,
    },
    originalBridgeReceiptStream: { available: false, synthesized: false, reason: "The accepted operation and pin evidence is the immutable checkpoint plus independent GET-only reconciliation; native in-memory bridge receipts were not reconstructed." },
    fundingEvidence: { available: false, synthesized: false },
    sideEffects: reconciliation.sideEffects,
    checkpoint: { intentArtifactId: checkpointIntentArtifact.id, finalArtifactId: checkpointFinalArtifact.id, checkpointId: checkpoint.checkpointId },
    indexedOperationReceipts: operations.indexedReceipts,
    contentArtifacts,
    projects,
    tokens,
    screenshots: screenshots.map(({ screenshot }) => screenshot),
    screenshotSidecars: screenshots.map(({ sidecarArtifact }) => sidecarArtifact),
    tzktEvidence: { path: TZKT_EVIDENCE_PATH, sha256: tzktArtifact.sha256 },
    chainReconciliation: reconciliationArtifact,
    ravioliDependency,
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptArtifact = { id: "ui-live-readonly-finalization", kind: "readonly-finalization-receipt", path: FINALIZATION_RECEIPT_PATH, sha256: sha256(receiptBytes) };
  const artifacts = [
    ...contentArtifacts,
    contractCodeArtifact,
    checkpointIntentArtifact,
    checkpointFinalArtifact,
    tzktArtifact,
    reconciliationArtifact,
    receiptArtifact,
    ...screenshots.map(({ sidecarArtifact }) => sidecarArtifact),
  ];
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: APP,
    role: "token-publisher",
    runId,
    capturedAt: lastScreenshotAt,
    finalizedAt,
    classification: "UI-LIVE-READ-ONLY-FINALIZATION",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: null, tzktApi: base },
    capabilities: [
      {
        id: "publish-png-gif-zip-generators",
        description: "Use the actual Rotini studio to pin generator inputs, originate one exact current collection, and publish PNG, animated GIF, and offline interactive ZIP projects; recover only from its durable checkpoint without another signer or pin write.",
        evidence: { screenshots: screenshots.slice(0, 5).map(({ screenshot }) => screenshot.stage), artifacts: artifacts.map((artifact) => artifact.id), contracts: [checkpoint.contractAddress], operations: operations.operationHashes.slice(0, 4), tokens: [], roleEvidence: [], urls: [`https://shadownet.tzkt.io/${checkpoint.contractAddress}`, ...contentArtifacts.map((artifact) => artifact.gatewayUrl)] },
      },
      {
        id: "reserve-render-pin-finalize-tokens",
        description: "Use an independent collector through the actual Rotini mint UI to reserve immutable seeds, render and pin every supported output, and finalize three directly viewable FA2 tokens.",
        evidence: { screenshots: screenshots.slice(5).map(({ screenshot }) => screenshot.stage), artifacts: artifacts.map((artifact) => artifact.id), contracts: [checkpoint.contractAddress], operations: operations.operationHashes.slice(4), tokens: tokens.map((token) => token.id), roleEvidence: [], urls: tokens.map((token) => token.explorerUrl) },
      },
    ],
    screenshots: screenshots.map(({ screenshot }) => screenshot),
    artifacts,
    contracts: [{ address: checkpoint.contractAddress, kind: "generative-collection", explorerUrl: `https://shadownet.tzkt.io/${checkpoint.contractAddress}` }],
    operations: operations.manifestOperations,
    tokens,
    roleEvidence: [],
  };

  await mkdir(path.join(appRoot, "artifacts", "pins"), { recursive: true });
  for (const [index, definition] of CONTENT_DEFINITIONS.entries()) {
    await writeNewOrIdentical(path.join(appRoot, definition.path), checkpoint.pins[index].bytes);
  }
  await writeNewOrIdentical(path.join(appRoot, TZKT_EVIDENCE_PATH), tzktBytes);
  await writeNewOrIdentical(path.join(appRoot, RECONCILIATION_PATH), reconciliationBytes);
  await writeNewOrIdentical(path.join(appRoot, FINALIZATION_RECEIPT_PATH), receiptBytes);
  await writeNewOrIdentical(manifestPath, deterministicJsonBytes(manifest));
  return { contractAddress: checkpoint.contractAddress, receiptPath: path.join(appRoot, FINALIZATION_RECEIPT_PATH), manifestPath, operationHashes: operations.operationHashes };
}

async function main(): Promise<void> {
  try {
    assertRotiniReadonlyFinalizationAllowed(process.env);
    const result = await finalizeRotiniUiLiveReadOnly({
      runRoot: String(process.env[OUTPUT_ENV]),
      publicIpfsGateway: process.env.PASTA_SHADOWNET_IPFS_GATEWAY,
    });
    process.stdout.write(`${JSON.stringify({ status: "PASSED", classification: "UI-LIVE-READ-ONLY-FINALIZATION", ...result }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
