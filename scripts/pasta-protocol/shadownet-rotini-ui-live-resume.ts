#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { TezosToolkit } from "@taquito/taquito";
import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { chromium, type Browser, type Page } from "playwright";

import {
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLivePinProof,
} from "./pasta-ui-live-bridge-kit";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  verifyScreenshotSidecar,
} from "./pasta-proof-screenshot-kit";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import { declareReadOnlyReader, readWithBoundedRetry } from "./pasta-readonly-retry";
import {
  openRotiniUiLiveCheckpoint,
  ROTINI_UI_LIVE_CHECKPOINT_EVENT_SCHEMA,
  ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
  type RotiniUiLiveCheckpoint,
} from "./shadownet-rotini-ui-live-checkpoint";
import {
  assertShadownet,
  block,
  buildToolkit,
  deterministicJsonBytes,
  hexToUtf8,
  loadSignerPair,
  normalizeBase,
  pinIpfsProofBytes,
  pinIpfsProofJson,
  probeRpcChainId,
  resolveIpfsProofConfig,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  signerEnv,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";
import {
  createRotiniAppliedOperationBinding,
  installRotiniBrowserAdapters,
  readRotiniBrowserProjection,
  validateRotiniOutputBytes,
} from "./shadownet-rotini-ui-live";

export const ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG = "PASTA_SHADOWNET_ROTINI_UI_LIVE_RESUME_EXECUTE";
export const ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG =
  "PASTA_SHADOWNET_ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE";
export const ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG =
  "PASTA_SHADOWNET_ROTINI_UI_LIVE_GIF_RESUME_EXECUTE";
export const ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG =
  "PASTA_SHADOWNET_ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE";
export const ROTINI_UI_LIVE_RESUME_OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const APP = "rotini";
const STATIC_ROOT = path.join(root, "public");
const CHECKPOINT_PATH = "artifacts/rotini-ui-live-checkpoint";
const CONTRACT_ARTIFACT_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "rotini",
  "contract",
  "pasta-generative-collection.contract.json",
);
const CONTRACT_CODE_EVIDENCE_PATH = "artifacts/rotini-current-contract-code.json";
const COLLECTOR_OPERATION_RESERVE_MUTEZ = 500_000;
const MINIMUM_RESERVATION_HEADROOM_MS = 10 * 60 * 1_000;
const EXPECTED_PARTIAL_SCREENSHOTS = 6;
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const GIF_RESERVATION_PENDING_RUN_ID = "pasta-alpha-proof-20260724t053947z";
const GIF_RESERVATION_PENDING_CHECKPOINT_ID =
  "ff7a9d6b097ab2ebefa05a1a3a67ef1a19b60a8080bc1bb11c872d7f7ef45c58";
const GIF_RESERVATION_PENDING_CONTRACT = "KT1Ckw2WQ88vSzrVqeC2LnjmdspeFupTSpZt";

type JsonObject = Record<string, any>;
type RotiniMode = "png" | "gif" | "zip";
type RotiniResumePhase =
  | "reservation-pending"
  | "project-zero-finalized"
  | "gif-reservation-pending"
  | "zip-reservation-pending";

type ResumePin = {
  sequence: number;
  actor: "creator" | "collector";
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  proof: PastaUiLivePinProof;
};

type ActiveResumeEvidence = {
  appRoot: string;
  runRoot: string;
  runId: string;
  checkpoint: RotiniUiLiveCheckpoint;
  creator: string;
  collector: string;
  contractAddress: string;
  reservationOperationHash: string;
  pins: ResumePin[];
  contractCode: unknown[];
  contractRawSha256: string;
  contractCanonicalSha256: string;
};

type ResumeChainState = {
  projection: Awaited<ReturnType<typeof readRotiniBrowserProjection>>;
  administrator: string;
  pendingAdministrator: unknown;
  projects: JsonObject[];
  reservation: JsonObject | undefined;
  laterReservations: unknown[];
  latestReservation: unknown;
  reservedBy: unknown;
  tokenState: Record<string, unknown>;
  reservationsById: Array<JsonObject | undefined>;
  reservedByProject: unknown[];
  tokenStatesById: Array<Record<string, unknown>>;
  scriptCode: unknown[];
};

const PARTIAL_PIN_DEFINITIONS = Object.freeze([
  ["creator", "rotini-collection-preview.png", "image/png"],
  ["creator", "rotini-layer-1.png", "image/png"],
  ["creator", "rotini-layer-2.png", "image/png"],
  ["creator", "rotini-generator.json", "application/json"],
  ["creator", "collection.json", "application/json"],
  ["creator", "rotini-collection-preview.png", "image/png"],
  ["creator", "rotini-layer-1.png", "image/png"],
  ["creator", "rotini-layer-2.png", "image/png"],
  ["creator", "rotini-generator.json", "application/json"],
  ["creator", "rotini-collection-preview.png", "image/png"],
  ["creator", "rotini-layer-1.png", "image/png"],
  ["creator", "rotini-layer-2.png", "image/png"],
  ["creator", "rotini-generator.json", "application/json"],
] as const);

const RESUME_PIN_DEFINITIONS = Object.freeze([
  { tokenId: 0, projectId: 0, mode: "png", kind: "artifact", fileName: "rotini-0.png", mimeType: "image/png" },
  { tokenId: 0, projectId: 0, mode: "png", kind: "metadata", fileName: "rotini-0.json", mimeType: "application/json" },
  { tokenId: 1, projectId: 1, mode: "gif", kind: "artifact", fileName: "rotini-1.gif", mimeType: "image/gif" },
  { tokenId: 1, projectId: 1, mode: "gif", kind: "metadata", fileName: "rotini-1.json", mimeType: "application/json" },
  { tokenId: 2, projectId: 2, mode: "zip", kind: "artifact", fileName: "rotini-2.zip", mimeType: "application/zip" },
  { tokenId: 2, projectId: 2, mode: "png", kind: "cover", fileName: "rotini-2-cover.png", mimeType: "image/png" },
  { tokenId: 2, projectId: 2, mode: "zip", kind: "metadata", fileName: "rotini-2.json", mimeType: "application/json" },
] as const);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function objectValue(value: unknown, label: string): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function mapLikeValue(value: unknown, key: string, label: string): unknown {
  const candidate = value as { get?: (entry: string) => unknown } | null;
  if (candidate && typeof candidate.get === "function") {
    const result = candidate.get(key);
    assert.ok(!(result instanceof Promise), `${label} unexpectedly returned an asynchronous map value`);
    return result;
  }
  return objectValue(value, label)[key];
}

function safeNumber(value: unknown, label: string): number {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if ("Some" in value) value = (value as JsonObject).Some;
    else if ("some" in value) value = (value as JsonObject).some;
  }
  const candidate = value as { toNumber?: () => number; toString?: () => string } | null;
  const converted = typeof value === "number"
    ? value
    : candidate && typeof candidate.toNumber === "function"
      ? candidate.toNumber()
      : Number(candidate && typeof candidate.toString === "function" ? candidate.toString() : value);
  assert.ok(Number.isSafeInteger(converted) && converted >= 0, `${label} must be a non-negative safe integer`);
  return converted;
}

function optionNumber(value: unknown, label: string): number {
  return safeNumber(value, label);
}

async function mapGet(map: unknown, key: unknown): Promise<unknown> {
  const candidate = map as { get?: (value: unknown) => Promise<unknown> | unknown } | null;
  if (!candidate || typeof candidate.get !== "function") return undefined;
  const direct = await candidate.get(key);
  if (direct !== undefined && direct !== null) return direct;
  if (typeof key === "number") return candidate.get(String(key));
  return undefined;
}

async function regularFile(filePath: string, label: string): Promise<Uint8Array> {
  const info = await lstat(filePath).catch(() => undefined);
  assert.ok(info?.isFile() && !info.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  return readFile(filePath);
}

export function assertRotiniUiLiveResumeAllowed(environment: Record<string, string | undefined>): void {
  if (environment[ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG] !== "1") {
    block("explicit Rotini UI-live resume flag is required", [
      `Set \`${ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG}=1\` only for the exact checkpointed partial lane.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Rotini UI-live resume only permits Shadownet", ["Mainnet recovery is refused."]);
  }
  if (!environment[ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [`Set \`${ROTINI_UI_LIVE_RESUME_OUTPUT_ENV}\`.`]);
  }
  if (environment[ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG]?.trim()) {
    block("Rotini reservation resume and post-submitted continuation are mutually exclusive", [
      `Unset \`${ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG}\`.`,
    ]);
  }
  if (environment[ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG]?.trim()) {
    block("Rotini reservation resume and ZIP recovery are mutually exclusive", [
      `Unset \`${ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG}\`.`,
    ]);
  }
  if (environment[ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG]?.trim()) {
    block("Rotini reservation resume and GIF recovery are mutually exclusive", [
      `Unset \`${ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG}\`.`,
    ]);
  }
  for (const key of [
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE",
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_ROTINI_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) {
      block("Rotini resume refuses fresh-run or contract override flags", [`Unset \`${key}\`.`]);
    }
  }
}

export function assertRotiniUiLivePostSubmittedResumeAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG] !== "1") {
    block("explicit Rotini post-submitted continuation flag is required", [
      `Set \`${ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG}=1\` only after operation 2 is independently reconciled.`,
    ]);
  }
  if (environment[ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG]?.trim()) {
    block("Rotini reservation resume and post-submitted continuation are mutually exclusive", [
      `Unset \`${ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG}\`.`,
    ]);
  }
  if (environment[ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG]?.trim()) {
    block("Rotini post-submitted continuation and ZIP recovery are mutually exclusive", [
      `Unset \`${ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG}\`.`,
    ]);
  }
  if (environment[ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG]?.trim()) {
    block("Rotini post-submitted continuation and GIF recovery are mutually exclusive", [
      `Unset \`${ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG}\`.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Rotini post-submitted continuation only permits Shadownet", ["Mainnet recovery is refused."]);
  }
  if (!environment[ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [`Set \`${ROTINI_UI_LIVE_RESUME_OUTPUT_ENV}\`.`]);
  }
  for (const key of [
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE",
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_ROTINI_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) {
      block("Rotini post-submitted continuation refuses fresh-run or contract override flags", [`Unset \`${key}\`.`]);
    }
  }
}

export function assertRotiniUiLiveZipResumeAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG] !== "1") {
    block("explicit Rotini ZIP reservation recovery flag is required", [
      `Set \`${ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG}=1\` only for the exact checkpointed reservation 2.`,
    ]);
  }
  for (const key of [
    ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG,
    ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG,
    ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG,
  ]) {
    if (environment[key]?.trim()) {
      block("Rotini ZIP reservation recovery is mutually exclusive", [`Unset \`${key}\`.`]);
    }
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Rotini ZIP reservation recovery only permits Shadownet", ["Mainnet recovery is refused."]);
  }
  if (!environment[ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [`Set \`${ROTINI_UI_LIVE_RESUME_OUTPUT_ENV}\`.`]);
  }
  for (const key of [
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE",
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_ROTINI_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) {
      block("Rotini ZIP reservation recovery refuses fresh-run or contract override flags", [`Unset \`${key}\`.`]);
    }
  }
}

export function assertRotiniUiLiveGifResumeAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG] !== "1") {
    block("explicit Rotini GIF reservation recovery flag is required", [
      `Set \`${ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG}=1\` only for the exact checkpointed reservation 1.`,
    ]);
  }
  for (const key of [
    ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG,
    ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG,
    ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG,
  ]) {
    if (environment[key]?.trim()) {
      block("Rotini GIF reservation recovery is mutually exclusive", [`Unset \`${key}\`.`]);
    }
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Rotini GIF reservation recovery only permits Shadownet", ["Mainnet recovery is refused."]);
  }
  if (!environment[ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [`Set \`${ROTINI_UI_LIVE_RESUME_OUTPUT_ENV}\`.`]);
  }
  for (const key of [
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE",
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_ROTINI_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) {
      block("Rotini GIF reservation recovery refuses fresh-run or contract override flags", [`Unset \`${key}\`.`]);
    }
  }
}

async function existingAppRoot(runRootInput: string): Promise<{ runRoot: string; appRoot: string; runId: string }> {
  const runRoot = path.resolve(runRootInput);
  const runId = path.basename(runRoot);
  assert.match(runId, SAFE_RUN_ID, "Rotini resume run id is unsafe");
  for (const [candidate, label] of [[runRoot, "run root"], [path.join(runRoot, APP), "app root"]] as const) {
    const info = await lstat(candidate).catch(() => undefined);
    assert.ok(info?.isDirectory() && !info.isSymbolicLink(), `Rotini resume ${label} must be a real directory`);
  }
  return { runRoot, appRoot: path.join(runRoot, APP), runId };
}

async function readPartialScreenshots(appRoot: string, phase: RotiniResumePhase): Promise<void> {
  const screenshotRoot = path.join(appRoot, "screenshots");
  const names = (await readdir(screenshotRoot)).filter((name) => name.endsWith(".png")).sort();
  const expectedScreenshotCount = phase === "zip-reservation-pending"
    ? 8
    : phase === "gif-reservation-pending"
      ? 7
      : EXPECTED_PARTIAL_SCREENSHOTS;
  assert.equal(
    names.length,
    expectedScreenshotCount,
    `Rotini ${phase} requires exactly screenshots 1 through ${expectedScreenshotCount}`,
  );
  const observedText: string[] = [];
  for (const [index, name] of names.entries()) {
    const ordinal = index + 1;
    assert.ok(name.startsWith(`${String(ordinal).padStart(3, "0")}-`), `Rotini screenshot ${ordinal} ordinal drift`);
    const stem = name.slice(0, -4);
    const sidecarPath = path.join(appRoot, "artifacts", `screenshot-${stem}.json`);
    const sidecar = await verifyScreenshotSidecar(path.join(screenshotRoot, name), sidecarPath);
    assert.equal(sidecar.app, APP);
    assert.equal(sidecar.classification, "UI-LIVE");
    assert.equal(sidecar.stageOrdinal, ordinal);
    observedText.push(...sidecar.domEvidence.map((entry) => entry.text));
  }
  const joined = observedText.join("\n");
  for (const expected of [
    "generated 4 edition(s)",
    "Published PNG generator project 0",
    "Published GIF generator project 1",
    "Published ZIP generator project 2",
  ]) assert.match(joined, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  if (phase === "gif-reservation-pending") {
    assert.match(joined, /PNG iteration 0 finalized/);
    assert.match(joined, /collector finalized PNG token 0/);
  }
  if (phase === "zip-reservation-pending") {
    assert.match(joined, /PNG token post-confirmation state reconciled|1 finalized/);
    assert.match(joined, /GIF iteration 1 finalized/);
    assert.match(joined, /collector finalized GIF token 1/);
  }
}

async function readActiveCheckpoint(input: {
  appRoot: string;
  runRoot: string;
  runId: string;
  contractCode: unknown[];
  contractBytes: Uint8Array;
  phase: RotiniResumePhase;
}): Promise<ActiveResumeEvidence> {
  const checkpointRoot = path.join(input.appRoot, CHECKPOINT_PATH);
  const checkpoint = await openRotiniUiLiveCheckpoint(checkpointRoot);
  const validated = await checkpoint.validatedEvidence();
  const expected = input.phase === "reservation-pending"
    ? {
        summary: {
          status: "ACTIVE" as const,
          completedOperations: 5,
          pins: 13,
          nonOperationReceipts: 19,
          pendingOperation: null,
          pendingPin: null,
          pendingPinReceipts: [],
        },
        eventCount: 60,
        confirmedOperations: 5,
        pinCount: 13,
        terminalReceiptSequence: 3,
      }
    : input.phase === "project-zero-finalized"
      ? {
        summary: {
          status: "ACTIVE" as const,
          completedOperations: 6,
          pins: 15,
          nonOperationReceipts: 23,
          pendingOperation: null,
          pendingPin: null,
          pendingPinReceipts: [],
        },
        eventCount: 71,
        confirmedOperations: 6,
        pinCount: 15,
        terminalReceiptSequence: 8,
      }
      : input.phase === "gif-reservation-pending"
        ? {
            summary: {
              status: "ACTIVE" as const,
              completedOperations: 7,
              pins: 15,
              nonOperationReceipts: 22,
              pendingOperation: null,
              pendingPin: null,
              pendingPinReceipts: [],
            },
            eventCount: 73,
            confirmedOperations: 7,
            pinCount: 15,
            terminalReceiptSequence: 8,
          }
        : {
        summary: {
          status: "ACTIVE" as const,
          completedOperations: 9,
          pins: 17,
          nonOperationReceipts: 28,
          pendingOperation: null,
          pendingPin: null,
          pendingPinReceipts: [],
        },
        eventCount: 89,
        confirmedOperations: 9,
        pinCount: 17,
        terminalReceiptSequence: 16,
      };
  assert.deepEqual(validated.summary, expected.summary);
  if (input.phase === "gif-reservation-pending") {
    assert.equal(input.runId, GIF_RESERVATION_PENDING_RUN_ID, "Rotini GIF recovery run id drift");
    assert.equal(
      validated.checkpointId,
      GIF_RESERVATION_PENDING_CHECKPOINT_ID,
      "Rotini GIF recovery checkpoint identity drift",
    );
  }
  const intent = objectValue(validated.intent, "Rotini checkpoint intent");
  assert.equal(intent.runId, input.runId);
  assert.deepEqual(intent.network, { name: "shadownet", chainId: SHADOWNET_CHAIN_ID });
  assert.equal(intent.contractIdentity?.artifactPath, "public/creation-tools/rotini/contract/pasta-generative-collection.contract.json");
  const rawHash = sha256(input.contractBytes);
  const canonicalHash = hashMichelsonScriptCode(input.contractCode);
  assert.equal(intent.contractIdentity?.rawArtifactSha256, rawHash, "Rotini current raw artifact differs from checkpoint intent");
  assert.equal(intent.contractIdentity?.canonicalMichelsonCodeSha256, canonicalHash, "Rotini current canonical artifact differs from checkpoint intent");
  const creator = String(intent.actors?.creator || "");
  const collector = String(intent.actors?.collector || "");
  assert.equal(validateAddress(creator), ValidationResult.VALID);
  assert.equal(validateAddress(collector), ValidationResult.VALID);
  assert.notEqual(creator, collector);

  const eventRoot = path.join(checkpointRoot, "events");
  const eventNames = (await readdir(eventRoot)).sort();
  assert.equal(
    eventNames.length,
    expected.eventCount,
    `Rotini ${input.phase} checkpoint durable event count drift`,
  );
  const confirmed: JsonObject[] = [];
  for (const name of eventNames) {
    const value = objectValue(JSON.parse(Buffer.from(await regularFile(path.join(eventRoot, name), `Rotini event ${name}`)).toString("utf8")), `Rotini event ${name}`);
    assert.equal(value.schema, ROTINI_UI_LIVE_CHECKPOINT_EVENT_SCHEMA);
    if (value.phase === "CONFIRMED") confirmed.push(value);
  }
  assert.equal(confirmed.length, expected.confirmedOperations);
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
  if (input.phase === "gif-reservation-pending") {
    assert.equal(contractAddress, GIF_RESERVATION_PENDING_CONTRACT, "Rotini GIF recovery contract drift");
  }
  confirmed.forEach((event) => assert.equal(event.receipt?.contractAddress, contractAddress));
  assert.equal(confirmed.at(-1)?.receipt?.signerAddress, collector);
  assert.equal(
    confirmed.at(-1)?.receipt?.sequence,
    expected.terminalReceiptSequence,
    `Rotini ${input.phase} collector receipt sequence drift`,
  );
  const reservationOperationHash = String(confirmed[4].operationHash);

  const pins: ResumePin[] = [];
  for (let sequence = 1; sequence <= expected.pinCount; sequence += 1) {
    const prefix = String(sequence).padStart(6, "0");
    const durable = objectValue(JSON.parse(Buffer.from(await regularFile(
      path.join(checkpointRoot, "pins", `${prefix}.proof.json`),
      `Rotini checkpoint pin ${sequence} proof`,
    )).toString("utf8")), `Rotini checkpoint pin ${sequence}`);
    const bytes = await regularFile(path.join(checkpointRoot, "pins", `${prefix}.bin`), `Rotini checkpoint pin ${sequence} bytes`);
    assert.equal(durable.bytes?.sha256, sha256(bytes));
    assert.equal(durable.bytes?.byteLength, bytes.byteLength);
    assert.equal(durable.proof?.sha256, sha256(bytes));
    assert.equal(durable.proof?.byteLength, bytes.byteLength);
    assert.equal(durable.proof?.publicGatewayVerified, true);
    const partialDefinition = PARTIAL_PIN_DEFINITIONS[sequence - 1];
    const resumedDefinition = RESUME_PIN_DEFINITIONS[sequence - PARTIAL_PIN_DEFINITIONS.length - 1];
    const definition = partialDefinition
      ? { actor: partialDefinition[0], fileName: partialDefinition[1], mimeType: partialDefinition[2] }
      : { actor: "collector", fileName: resumedDefinition?.fileName, mimeType: resumedDefinition?.mimeType };
    assert.ok(definition.fileName && definition.mimeType, `Rotini checkpoint pin ${sequence} has no exact definition`);
    assert.equal(durable.actor, definition.actor);
    assert.equal(durable.source?.fileName, definition.fileName);
    assert.equal(durable.source?.mimeType, definition.mimeType);
    pins.push({
      sequence,
      actor: durable.actor,
      fileName: durable.source.fileName,
      mimeType: durable.source.mimeType,
      bytes,
      proof: durable.proof as PastaUiLivePinProof,
    });
  }
  assert.equal(validated.artifacts.some((artifact) => artifact.path === "final.json"), false);
  await assertAbsent(path.join(input.appRoot, "manifest.json"), "Rotini manifest");
  await assertAbsent(path.join(input.appRoot, "artifacts", "rotini-ui-readonly-finalization.json"), "Rotini read-only finalization receipt");
  await readPartialScreenshots(input.appRoot, input.phase);
  const evidenceCode = await regularFile(path.join(input.appRoot, CONTRACT_CODE_EVIDENCE_PATH), "Rotini contract code evidence");
  assert.equal(sha256(evidenceCode), rawHash);
  return {
    appRoot: input.appRoot,
    runRoot: input.runRoot,
    runId: input.runId,
    checkpoint,
    creator,
    collector,
    contractAddress,
    reservationOperationHash,
    pins,
    contractCode: input.contractCode,
    contractRawSha256: rawHash,
    contractCanonicalSha256: canonicalHash,
  };
}

async function assertAbsent(filePath: string, label: string): Promise<void> {
  const info = await lstat(filePath).catch(() => undefined);
  assert.equal(info, undefined, `${label} must not exist before Rotini resume`);
}

async function readChainState(tezos: TezosToolkit, evidence: ActiveResumeEvidence): Promise<ResumeChainState> {
  await assertShadownet(tezos, "Rotini resume read-only preflight");
  const contract = await tezos.contract.at(evidence.contractAddress);
  const storage = await contract.storage() as JsonObject;
  const projects: JsonObject[] = [];
  for (let projectId = 0; projectId < 3; projectId += 1) {
    projects.push(objectValue(await mapGet(storage.projects, projectId), `Rotini project ${projectId}`));
  }
  const reservationsById = await Promise.all(
    [0, 1, 2].map(async (reservationId) => await mapGet(storage.reservations, reservationId) as JsonObject | undefined),
  );
  const reservation = reservationsById[0];
  const laterReservations = reservationsById.slice(1);
  const script = await tezos.rpc.getScript(evidence.contractAddress) as { code?: unknown };
  assert.ok(Array.isArray(script.code), "Rotini originated script code is missing");
  const tokenStatesById: Array<Record<string, unknown>> = [];
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    const tokenState: Record<string, unknown> = {};
    for (const name of ["token_metadata", "total_supply", "token_project", "token_seed", "token_artifact"] as const) {
      tokenState[name] = await mapGet(storage[name], tokenId);
    }
    tokenState.ledger = await mapGet(storage.ledger, { owner: evidence.collector, token_id: tokenId });
    tokenState.minted_by = await mapGet(storage.minted_by, { owner: evidence.collector, token_id: tokenId });
    tokenStatesById.push(tokenState);
  }
  const reservedByProject = await Promise.all(
    [0, 1, 2].map((projectId) => mapGet(storage.reserved_by, { owner: evidence.collector, token_id: projectId })),
  );
  return {
    projection: await readRotiniBrowserProjection(tezos, evidence.contractAddress, evidence.collector),
    administrator: String(storage.administrator || ""),
    pendingAdministrator: storage.pending_administrator,
    projects,
    reservation,
    laterReservations,
    latestReservation: await mapGet(storage.latest_reservation, evidence.collector),
    reservedBy: reservedByProject[0],
    tokenState: tokenStatesById[0],
    reservationsById,
    reservedByProject,
    tokenStatesById,
    scriptCode: script.code,
  };
}

export function assertExactRotiniResumeChainState(input: {
  state: ResumeChainState;
  evidence: Pick<ActiveResumeEvidence, "creator" | "collector" | "pins" | "contractCanonicalSha256">;
  nowMs?: number;
}): void {
  const { state, evidence } = input;
  assert.equal(state.administrator, evidence.creator);
  assert.ok(state.pendingAdministrator == null, "Rotini pending administrator must be empty");
  assert.equal(hashMichelsonScriptCode(state.scriptCode), evidence.contractCanonicalSha256, "Rotini on-chain script differs from checkpoint contract");
  assert.deepEqual({
    nextProjectId: state.projection.next_project_id,
    nextReservationId: state.projection.next_reservation_id,
    nextTokenId: state.projection.next_token_id,
  }, { nextProjectId: 3, nextReservationId: 1, nextTokenId: 1 });
  const expectedModes: RotiniMode[] = ["png", "gif", "zip"];
  const expectedPrices = [0, 1, 1];
  const generatorPins = [3, 8, 12];
  const displayPins = [0, 5, 9];
  state.projects.forEach((project, projectId) => {
    assert.equal(project.active, true);
    assert.equal(hexToUtf8(String(project.output_mode || "")), expectedModes[projectId]);
    assert.equal(safeNumber(project.price, `Rotini project ${projectId} price`), expectedPrices[projectId]);
    assert.equal(optionNumber(project.max_supply, `Rotini project ${projectId} max supply`), 4);
    assert.equal(optionNumber(project.max_per_wallet, `Rotini project ${projectId} wallet cap`), 4);
    assert.equal(safeNumber(project.reservation_ttl, `Rotini project ${projectId} reservation TTL`), 3_600);
    assert.equal(safeNumber(project.minted, `Rotini project ${projectId} minted`), 0);
    assert.equal(safeNumber(project.reserved, `Rotini project ${projectId} reserved`), projectId === 0 ? 1 : 0);
    assert.equal(String(project.treasury || ""), evidence.creator);
    assert.equal(hexToUtf8(String(project.generator_uri || "")), evidence.pins[generatorPins[projectId]].proof.uri);
    assert.equal(hexToUtf8(String(project.display_uri || "")), evidence.pins[displayPins[projectId]].proof.uri);
  });
  const reservation = objectValue(state.reservation, "Rotini reservation 0");
  assert.equal(String(reservation.owner || ""), evidence.collector);
  assert.equal(safeNumber(reservation.project_id, "Rotini reservation project"), 0);
  assert.equal(safeNumber(reservation.token_id, "Rotini reservation token"), 0);
  assert.equal(safeNumber(reservation.iteration, "Rotini reservation iteration"), 0);
  assert.equal(safeNumber(reservation.price, "Rotini reservation price"), 0);
  assert.match(String(reservation.seed || ""), /^[0-9a-f]{64}$/);
  assert.equal(safeNumber(state.latestReservation, "Rotini latest reservation"), 0);
  assert.equal(safeNumber(state.reservedBy, "Rotini collector project-zero reserved count"), 1);
  assert.ok(state.laterReservations.every((value) => value == null), "Rotini partial state contains an unexpected later reservation");
  const expiresAt = Date.parse(String(reservation.expires_at || ""));
  assert.ok(Number.isFinite(expiresAt), "Rotini reservation expiry is invalid");
  assert.ok(
    expiresAt - (input.nowMs ?? Date.now()) >= MINIMUM_RESERVATION_HEADROOM_MS,
    "Rotini reservation lacks ten minutes of safe recovery headroom",
  );
  for (const [name, value] of Object.entries(state.tokenState)) {
    assert.ok(value == null, `Rotini partial state already contains token 0 ${name}`);
  }
}

export function assertExactRotiniPostSubmittedResumeChainState(input: {
  state: ResumeChainState;
  evidence: Pick<ActiveResumeEvidence, "creator" | "collector" | "pins" | "contractCanonicalSha256">;
}): void {
  const { state, evidence } = input;
  assert.equal(state.administrator, evidence.creator);
  assert.ok(state.pendingAdministrator == null, "Rotini pending administrator must be empty");
  assert.equal(
    hashMichelsonScriptCode(state.scriptCode),
    evidence.contractCanonicalSha256,
    "Rotini on-chain script differs from checkpoint contract",
  );
  assert.deepEqual({
    nextProjectId: state.projection.next_project_id,
    nextReservationId: state.projection.next_reservation_id,
    nextTokenId: state.projection.next_token_id,
  }, { nextProjectId: 3, nextReservationId: 1, nextTokenId: 1 });
  assert.deepEqual(state.projection.reservations, {}, "Rotini project-zero reservation must be consumed");
  assert.deepEqual(state.projection.latest_reservation, {}, "Rotini browser projection must expose no open reservation");

  const expectedModes: RotiniMode[] = ["png", "gif", "zip"];
  const expectedPrices = [0, 1, 1];
  const generatorPins = [3, 8, 12];
  const displayPins = [0, 5, 9];
  state.projects.forEach((project, projectId) => {
    assert.equal(project.active, true);
    assert.equal(hexToUtf8(String(project.output_mode || "")), expectedModes[projectId]);
    assert.equal(safeNumber(project.price, `Rotini project ${projectId} price`), expectedPrices[projectId]);
    assert.equal(optionNumber(project.max_supply, `Rotini project ${projectId} max supply`), 4);
    assert.equal(optionNumber(project.max_per_wallet, `Rotini project ${projectId} wallet cap`), 4);
    assert.equal(safeNumber(project.reservation_ttl, `Rotini project ${projectId} reservation TTL`), 3_600);
    assert.equal(safeNumber(project.minted, `Rotini project ${projectId} minted`), projectId === 0 ? 1 : 0);
    assert.equal(
      safeNumber(project.reserved, `Rotini project ${projectId} reserved`),
      0,
      `Rotini project ${projectId} reserved count drift`,
    );
    assert.equal(String(project.treasury || ""), evidence.creator);
    assert.equal(hexToUtf8(String(project.generator_uri || "")), evidence.pins[generatorPins[projectId]].proof.uri);
    assert.equal(hexToUtf8(String(project.display_uri || "")), evidence.pins[displayPins[projectId]].proof.uri);
  });

  assert.ok(state.reservation == null, "Rotini reservation 0 must be absent after finalization");
  assert.ok(state.laterReservations.every((value) => value == null), "Rotini post-submitted state contains a later reservation");
  assert.equal(safeNumber(state.latestReservation, "Rotini latest reservation"), 0);
  assert.ok(state.reservedBy == null, "Rotini collector project-zero reserved count must be cleared");

  const mediaPin = evidence.pins[13]?.proof;
  const metadataPin = evidence.pins[14]?.proof;
  assert.ok(mediaPin && metadataPin, "Rotini post-submitted continuation requires exact token-zero pins 14 and 15");
  const tokenMetadata = objectValue(state.tokenState.token_metadata, "Rotini token 0 metadata");
  const tokenInfo = objectValue(tokenMetadata.token_info, "Rotini token 0 token info");
  const tokenArtifact = objectValue(state.tokenState.token_artifact, "Rotini token 0 artifact");
  assert.equal(safeNumber(tokenMetadata.token_id, "Rotini token metadata id"), 0);
  assert.equal(hexToUtf8(String(mapLikeValue(tokenInfo, "", "Rotini token 0 token info") || "")), metadataPin.uri);
  assert.equal(hexToUtf8(String(mapLikeValue(tokenInfo, "artifactUri", "Rotini token 0 token info") || "")), mediaPin.uri);
  assert.equal(hexToUtf8(String(mapLikeValue(tokenInfo, "displayUri", "Rotini token 0 token info") || "")), mediaPin.uri);
  assert.equal(hexToUtf8(String(mapLikeValue(tokenInfo, "thumbnailUri", "Rotini token 0 token info") || "")), mediaPin.uri);
  assert.equal(hexToUtf8(String(tokenArtifact.artifact_uri || "")), mediaPin.uri);
  assert.equal(hexToUtf8(String(tokenArtifact.display_uri || "")), mediaPin.uri);
  assert.equal(hexToUtf8(String(tokenArtifact.thumbnail_uri || "")), mediaPin.uri);
  assert.equal(hexToUtf8(String(tokenArtifact.mime_type || "")), "image/png");
  assert.equal(String(tokenArtifact.artifact_hash || "").toLowerCase(), mediaPin.sha256);
  assert.equal(safeNumber(state.tokenState.total_supply, "Rotini token 0 total supply"), 1);
  assert.equal(safeNumber(state.tokenState.token_project, "Rotini token 0 project"), 0);
  assert.match(String(state.tokenState.token_seed || "").toLowerCase(), /^[0-9a-f]{64}$/);
  assert.equal(safeNumber(state.tokenState.ledger, "Rotini token 0 collector balance"), 1);
  assert.equal(safeNumber(state.tokenState.minted_by, "Rotini project-zero collector mint count"), 1);
}

function assertFinalizedRotiniToken(input: {
  state: Record<string, unknown>;
  tokenId: number;
  projectId: number;
  mimeType: string;
  mediaPin: PastaUiLivePinProof;
  metadataPin: PastaUiLivePinProof;
}): void {
  const tokenMetadata = objectValue(input.state.token_metadata, `Rotini token ${input.tokenId} metadata`);
  const tokenInfo = objectValue(tokenMetadata.token_info, `Rotini token ${input.tokenId} token info`);
  const tokenArtifact = objectValue(input.state.token_artifact, `Rotini token ${input.tokenId} artifact`);
  assert.equal(safeNumber(tokenMetadata.token_id, `Rotini token ${input.tokenId} metadata id`), input.tokenId);
  assert.equal(
    hexToUtf8(String(mapLikeValue(tokenInfo, "", `Rotini token ${input.tokenId} token info`) || "")),
    input.metadataPin.uri,
  );
  for (const key of ["artifactUri", "displayUri", "thumbnailUri"] as const) {
    assert.equal(
      hexToUtf8(String(mapLikeValue(tokenInfo, key, `Rotini token ${input.tokenId} token info`) || "")),
      input.mediaPin.uri,
    );
  }
  assert.equal(hexToUtf8(String(tokenArtifact.artifact_uri || "")), input.mediaPin.uri);
  assert.equal(hexToUtf8(String(tokenArtifact.display_uri || "")), input.mediaPin.uri);
  assert.equal(hexToUtf8(String(tokenArtifact.thumbnail_uri || "")), input.mediaPin.uri);
  assert.equal(hexToUtf8(String(tokenArtifact.mime_type || "")), input.mimeType);
  assert.equal(String(tokenArtifact.artifact_hash || "").toLowerCase(), input.mediaPin.sha256);
  assert.equal(safeNumber(input.state.total_supply, `Rotini token ${input.tokenId} total supply`), 1);
  assert.equal(safeNumber(input.state.token_project, `Rotini token ${input.tokenId} project`), input.projectId);
  assert.match(String(input.state.token_seed || "").toLowerCase(), /^[0-9a-f]{64}$/);
  assert.equal(safeNumber(input.state.ledger, `Rotini token ${input.tokenId} collector balance`), 1);
  assert.equal(safeNumber(input.state.minted_by, `Rotini project ${input.projectId} collector mint count`), 1);
}

export function assertExactRotiniGifResumeChainState(input: {
  state: ResumeChainState;
  evidence: Pick<ActiveResumeEvidence, "creator" | "collector" | "pins" | "contractCanonicalSha256">;
  nowMs?: number;
}): void {
  const { state, evidence } = input;
  assert.equal(state.administrator, evidence.creator);
  assert.ok(state.pendingAdministrator == null, "Rotini pending administrator must be empty");
  assert.equal(
    hashMichelsonScriptCode(state.scriptCode),
    evidence.contractCanonicalSha256,
    "Rotini on-chain script differs from checkpoint contract",
  );
  assertProgressProjection(state.projection, {
    reservedProjects: [0, 1],
    finalizedReservations: [0],
  });

  const expectedModes: RotiniMode[] = ["png", "gif", "zip"];
  const expectedPrices = [0, 1, 1];
  const generatorPins = [3, 8, 12];
  const displayPins = [0, 5, 9];
  state.projects.forEach((project, projectId) => {
    assert.equal(project.active, true);
    assert.equal(hexToUtf8(String(project.output_mode || "")), expectedModes[projectId]);
    assert.equal(safeNumber(project.price, `Rotini project ${projectId} price`), expectedPrices[projectId]);
    assert.equal(optionNumber(project.max_supply, `Rotini project ${projectId} max supply`), 4);
    assert.equal(optionNumber(project.max_per_wallet, `Rotini project ${projectId} wallet cap`), 4);
    assert.equal(safeNumber(project.reservation_ttl, `Rotini project ${projectId} reservation TTL`), 3_600);
    assert.equal(safeNumber(project.minted, `Rotini project ${projectId} minted`), projectId === 0 ? 1 : 0);
    assert.equal(safeNumber(project.reserved, `Rotini project ${projectId} reserved`), projectId === 1 ? 1 : 0);
    assert.equal(String(project.treasury || ""), evidence.creator);
    assert.equal(hexToUtf8(String(project.generator_uri || "")), evidence.pins[generatorPins[projectId]].proof.uri);
    assert.equal(hexToUtf8(String(project.display_uri || "")), evidence.pins[displayPins[projectId]].proof.uri);
  });

  assert.equal(state.reservationsById[0], undefined, "Rotini reservation 0 must be consumed");
  const reservation = objectValue(state.reservationsById[1], "Rotini reservation 1");
  assert.equal(state.reservationsById[2], undefined, "Rotini reservation 2 must be absent");
  assert.equal(String(reservation.owner || ""), evidence.collector);
  assert.equal(safeNumber(reservation.project_id, "Rotini GIF reservation project"), 1);
  assert.equal(safeNumber(reservation.token_id, "Rotini GIF reservation token"), 1);
  assert.equal(safeNumber(reservation.iteration, "Rotini GIF reservation iteration"), 0);
  assert.equal(safeNumber(reservation.price, "Rotini GIF reservation price"), 1);
  assert.match(String(reservation.seed || ""), /^[0-9a-f]{64}$/);
  assert.equal(safeNumber(state.latestReservation, "Rotini latest reservation"), 1);
  assert.ok(state.reservedByProject[0] == null, "Rotini project-zero reservation count must be cleared");
  assert.equal(safeNumber(state.reservedByProject[1], "Rotini project-one reserved count"), 1);
  assert.ok(state.reservedByProject[2] == null, "Rotini project-two reservation count must be empty");
  const expiresAt = Date.parse(String(reservation.expires_at || ""));
  assert.ok(Number.isFinite(expiresAt), "Rotini GIF reservation expiry is invalid");
  assert.ok(
    expiresAt - (input.nowMs ?? Date.now()) >= MINIMUM_RESERVATION_HEADROOM_MS,
    "Rotini GIF reservation lacks ten minutes of safe recovery headroom",
  );

  const pngPin = evidence.pins[13]?.proof;
  const pngMetadata = evidence.pins[14]?.proof;
  assert.ok(pngPin && pngMetadata, "Rotini GIF recovery requires exact PNG pins 14 and 15");
  assertFinalizedRotiniToken({
    state: state.tokenStatesById[0],
    tokenId: 0,
    projectId: 0,
    mimeType: "image/png",
    mediaPin: pngPin,
    metadataPin: pngMetadata,
  });
  for (const tokenId of [1, 2]) {
    for (const [name, value] of Object.entries(state.tokenStatesById[tokenId])) {
      assert.ok(value == null, `Rotini GIF recovery already contains token ${tokenId} ${name}`);
    }
  }
}

export function assertExactRotiniZipResumeChainState(input: {
  state: ResumeChainState;
  evidence: Pick<ActiveResumeEvidence, "creator" | "collector" | "pins" | "contractCanonicalSha256">;
  nowMs?: number;
}): void {
  const { state, evidence } = input;
  assert.equal(state.administrator, evidence.creator);
  assert.ok(state.pendingAdministrator == null, "Rotini pending administrator must be empty");
  assert.equal(
    hashMichelsonScriptCode(state.scriptCode),
    evidence.contractCanonicalSha256,
    "Rotini on-chain script differs from checkpoint contract",
  );
  assertProgressProjection(state.projection, {
    reservedProjects: [0, 1, 2],
    finalizedReservations: [0, 1],
  });

  const expectedModes: RotiniMode[] = ["png", "gif", "zip"];
  const expectedPrices = [0, 1, 1];
  const generatorPins = [3, 8, 12];
  const displayPins = [0, 5, 9];
  state.projects.forEach((project, projectId) => {
    assert.equal(project.active, true);
    assert.equal(hexToUtf8(String(project.output_mode || "")), expectedModes[projectId]);
    assert.equal(safeNumber(project.price, `Rotini project ${projectId} price`), expectedPrices[projectId]);
    assert.equal(optionNumber(project.max_supply, `Rotini project ${projectId} max supply`), 4);
    assert.equal(optionNumber(project.max_per_wallet, `Rotini project ${projectId} wallet cap`), 4);
    assert.equal(safeNumber(project.reservation_ttl, `Rotini project ${projectId} reservation TTL`), 3_600);
    assert.equal(safeNumber(project.minted, `Rotini project ${projectId} minted`), projectId < 2 ? 1 : 0);
    assert.equal(safeNumber(project.reserved, `Rotini project ${projectId} reserved`), projectId === 2 ? 1 : 0);
    assert.equal(String(project.treasury || ""), evidence.creator);
    assert.equal(hexToUtf8(String(project.generator_uri || "")), evidence.pins[generatorPins[projectId]].proof.uri);
    assert.equal(hexToUtf8(String(project.display_uri || "")), evidence.pins[displayPins[projectId]].proof.uri);
  });

  assert.equal(state.reservationsById[0], undefined, "Rotini reservation 0 must be consumed");
  assert.equal(state.reservationsById[1], undefined, "Rotini reservation 1 must be consumed");
  const reservation = objectValue(state.reservationsById[2], "Rotini reservation 2");
  assert.equal(String(reservation.owner || ""), evidence.collector);
  assert.equal(safeNumber(reservation.project_id, "Rotini ZIP reservation project"), 2);
  assert.equal(safeNumber(reservation.token_id, "Rotini ZIP reservation token"), 2);
  assert.equal(safeNumber(reservation.iteration, "Rotini ZIP reservation iteration"), 0);
  assert.equal(safeNumber(reservation.price, "Rotini ZIP reservation price"), 1);
  assert.match(String(reservation.seed || ""), /^[0-9a-f]{64}$/);
  assert.equal(safeNumber(state.latestReservation, "Rotini latest reservation"), 2);
  assert.ok(state.reservedByProject[0] == null, "Rotini project-zero reservation count must be cleared");
  assert.ok(state.reservedByProject[1] == null, "Rotini project-one reservation count must be cleared");
  assert.equal(safeNumber(state.reservedByProject[2], "Rotini project-two reserved count"), 1);
  const expiresAt = Date.parse(String(reservation.expires_at || ""));
  assert.ok(Number.isFinite(expiresAt), "Rotini ZIP reservation expiry is invalid");
  assert.ok(
    expiresAt - (input.nowMs ?? Date.now()) >= MINIMUM_RESERVATION_HEADROOM_MS,
    "Rotini ZIP reservation lacks ten minutes of safe recovery headroom",
  );

  const pngPin = evidence.pins[13]?.proof;
  const pngMetadata = evidence.pins[14]?.proof;
  const gifPin = evidence.pins[15]?.proof;
  const gifMetadata = evidence.pins[16]?.proof;
  assert.ok(pngPin && pngMetadata && gifPin && gifMetadata, "Rotini ZIP recovery requires exact token pins 14 through 17");
  assertFinalizedRotiniToken({
    state: state.tokenStatesById[0],
    tokenId: 0,
    projectId: 0,
    mimeType: "image/png",
    mediaPin: pngPin,
    metadataPin: pngMetadata,
  });
  assertFinalizedRotiniToken({
    state: state.tokenStatesById[1],
    tokenId: 1,
    projectId: 1,
    mimeType: "image/gif",
    mediaPin: gifPin,
    metadataPin: gifMetadata,
  });
  for (const [name, value] of Object.entries(state.tokenStatesById[2])) {
    assert.ok(value == null, `Rotini ZIP recovery already contains token 2 ${name}`);
  }
}

async function verifyExistingPublicPins(pins: readonly ResumePin[]): Promise<void> {
  await Promise.all(pins.map(async (pin) => {
    const fetched = await readWithBoundedRetry({
      primary: declareReadOnlyReader(`Rotini checkpoint pin ${pin.sequence} public bytes`, async () => {
        const response = await fetch(pin.proof.publicGatewayUrl, {
          method: "GET",
          headers: { "user-agent": "wtfos-pasta-rotini-resume-preflight" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
        return new Uint8Array(await response.arrayBuffer());
      }),
    }, { maxAttempts: 4, deadlineMs: 60_000, maxRetryAfterMs: 5_000 });
    assert.equal(sha256(fetched), pin.proof.sha256, `Rotini public pin ${pin.sequence} bytes drift`);
    assert.deepEqual(
      Buffer.from(fetched),
      Buffer.from(pin.bytes),
      `Rotini public pin ${pin.sequence} differs from checkpoint bytes`,
    );
  }));
}

async function performResumePreflight(
  runRootInput: string,
  phase: RotiniResumePhase,
): Promise<{
  evidence: ActiveResumeEvidence;
  readRpc: string;
  fallbackReadTezos: TezosToolkit;
  initialProjection: ResumeChainState["projection"];
  ipfs: IpfsProofConfig;
}> {
  const { runRoot, appRoot, runId } = await existingAppRoot(runRootInput);
  const contractBytes = await regularFile(CONTRACT_ARTIFACT_PATH, "Rotini compiled contract");
  const contractCode = JSON.parse(Buffer.from(contractBytes).toString("utf8"));
  assert.ok(Array.isArray(contractCode), "Rotini compiled contract must be a Micheline array");
  const evidence = await readActiveCheckpoint({ appRoot, runRoot, runId, contractCode, contractBytes, phase });
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const primaryReadTezos = new TezosToolkit(rpc.rpcUrl);
  const alternateReadRpc = normalizeBase(rpc.rpcUrl) === normalizeBase(SHADOWNET_RPC_FALLBACK)
    ? SHADOWNET_RPC_PRIMARY
    : SHADOWNET_RPC_FALLBACK;
  const fallbackReadTezos = new TezosToolkit(alternateReadRpc);
  const state = await readWithBoundedRetry({
    primary: declareReadOnlyReader(`Rotini exact ${phase} state primary`, () => readChainState(primaryReadTezos, evidence)),
    fallback: declareReadOnlyReader(`Rotini exact ${phase} state fallback`, () => readChainState(fallbackReadTezos, evidence)),
  }, { maxAttempts: 6, deadlineMs: 60_000, maxRetryAfterMs: 5_000 });
  if (phase === "reservation-pending") assertExactRotiniResumeChainState({ state, evidence });
  else if (phase === "project-zero-finalized") assertExactRotiniPostSubmittedResumeChainState({ state, evidence });
  else if (phase === "gif-reservation-pending") assertExactRotiniGifResumeChainState({ state, evidence });
  else assertExactRotiniZipResumeChainState({ state, evidence });
  await verifyExistingPublicPins(evidence.pins);
  return {
    evidence,
    readRpc: rpc.rpcUrl,
    fallbackReadTezos,
    initialProjection: state.projection,
    ipfs: resolveIpfsProofConfig(),
  };
}

class RotiniResumeChoreography {
  readonly reservedProjects: number[];
  readonly finalizedReservations: number[];
  private readonly newPinProofs: PastaUiLivePinProof[];
  private readonly initialPinCount: number;

  constructor(
    private readonly checkpoint: RotiniUiLiveCheckpoint,
    private readonly collector: string,
    initial: {
      reservedProjects?: readonly number[];
      finalizedReservations?: readonly number[];
      pinProofs?: readonly PastaUiLivePinProof[];
    } = {},
  ) {
    this.reservedProjects = [...(initial.reservedProjects ?? [0])];
    this.finalizedReservations = [...(initial.finalizedReservations ?? [])];
    this.newPinProofs = [...(initial.pinProofs ?? [])];
    this.initialPinCount = this.newPinProofs.length;
  }

  get completedPins(): number {
    return this.newPinProofs.length - this.initialPinCount;
  }

  private definition() {
    const definition = RESUME_PIN_DEFINITIONS[this.newPinProofs.length];
    assert.ok(definition, "Rotini resume UI attempted more than seven pins");
    return definition;
  }

  async beforePin(input: { bytes: Uint8Array; fileName: string; mimeType: string }): Promise<void> {
    const definition = this.definition();
    assert.equal(input.fileName, definition.fileName, "Rotini resume pin file-name order drift");
    assert.equal(input.mimeType, definition.mimeType, "Rotini resume pin MIME order drift");
    if (definition.kind === "artifact" || definition.kind === "cover") {
      validateRotiniOutputBytes(definition.mode, input.bytes);
    } else {
      const metadata = objectValue(
        JSON.parse(Buffer.from(input.bytes).toString("utf8")),
        `Rotini token ${definition.tokenId} metadata`,
      );
      const artifactOffset = definition.tokenId === 0 ? 0 : definition.tokenId === 1 ? 2 : 4;
      const displayOffset = definition.tokenId === 2 ? 5 : artifactOffset;
      const artifact = this.newPinProofs[artifactOffset];
      const display = this.newPinProofs[displayOffset];
      assert.ok(artifact && display, "Rotini metadata arrived before its exact artifact/display pins");
      assert.equal(metadata.artifactUri, artifact.uri);
      assert.equal(metadata.displayUri, display.uri);
      assert.equal(metadata.thumbnailUri, display.uri);
      assert.equal(metadata.minter, this.collector);
      assert.equal(safeNumber(metadata["pasta:projectId"], "Rotini metadata project id"), definition.projectId);
      assert.equal(safeNumber(metadata["pasta:iteration"], "Rotini metadata iteration"), 0);
      assert.equal(metadata["pasta:artifactSha256"], artifact.sha256);
      assert.equal(metadata.formats?.[0]?.mimeType, definition.mimeType === "application/json" ? RESUME_PIN_DEFINITIONS[artifactOffset].mimeType : definition.mimeType);
    }
    await this.checkpoint.beforePin("collector", input);
  }

  async onPin(proof: PastaUiLivePinProof): Promise<void> {
    const definition = this.definition();
    assert.equal(proof.fileName, definition.fileName);
    assert.equal(proof.mimeType, definition.mimeType);
    assert.equal(proof.publicGatewayVerified, true);
    assert.match(proof.sha256, HASH_RE);
    await this.checkpoint.onPin("collector", { proof });
    this.newPinProofs.push(proof);
  }

  validateCall(input: { entrypoint: string; payload: unknown }): void {
    if (input.entrypoint === "reserve_iteration") {
      const projectId = safeNumber(input.payload, "Rotini resumed reserve project id");
      assert.equal(projectId, this.reservedProjects.length, "Rotini resume must reserve only projects 1 then 2");
      this.reservedProjects.push(projectId);
      return;
    }
    assert.equal(input.entrypoint, "finalize_iteration", `Rotini resume attempted unexpected ${input.entrypoint}`);
    const payload = objectValue(input.payload, "Rotini resumed finalization payload");
    const reservationId = safeNumber(payload.reservation_id, "Rotini resumed reservation id");
    assert.equal(reservationId, this.finalizedReservations.length, "Rotini resume must finalize reservations 0, 1, and 2 once");
    assert.ok(this.reservedProjects.includes(reservationId), "Rotini resume cannot finalize an unreserved project");
    const artifactOffsets = [0, 2, 4];
    const metadataOffsets = [1, 3, 6];
    const displayOffsets = [0, 2, 5];
    const artifact = this.newPinProofs[artifactOffsets[reservationId]];
    const metadata = this.newPinProofs[metadataOffsets[reservationId]];
    const display = this.newPinProofs[displayOffsets[reservationId]];
    assert.ok(artifact && metadata && display, "Rotini finalization arrived before exact pins were checkpointed");
    assert.equal(hexToUtf8(String(payload.artifact_uri || "")), artifact.uri);
    assert.equal(hexToUtf8(String(payload.metadata_uri || "")), metadata.uri);
    assert.equal(hexToUtf8(String(payload.display_uri || "")), display.uri);
    assert.equal(hexToUtf8(String(payload.thumbnail_uri || "")), display.uri);
    assert.equal(String(payload.artifact_hash || ""), artifact.sha256);
    assert.equal(hexToUtf8(String(payload.mime_type || "")), RESUME_PIN_DEFINITIONS[artifactOffsets[reservationId]].mimeType);
    this.finalizedReservations.push(reservationId);
  }
}

function assertProgressProjection(
  projection: Awaited<ReturnType<typeof readRotiniBrowserProjection>>,
  choreography: Pick<RotiniResumeChoreography, "reservedProjects" | "finalizedReservations">,
): void {
  assert.equal(projection.next_project_id, 3);
  assert.equal(projection.next_reservation_id, choreography.reservedProjects.length);
  assert.equal(projection.next_token_id, choreography.reservedProjects.length);
  for (let projectId = 0; projectId < 3; projectId += 1) {
    const project = objectValue(projection.projects[String(projectId)], `Rotini progress project ${projectId}`);
    const expectedMinted = projectId < choreography.finalizedReservations.length ? 1 : 0;
    const expectedReserved = projectId < choreography.reservedProjects.length && projectId >= choreography.finalizedReservations.length ? 1 : 0;
    assert.equal(safeNumber(project.minted, `Rotini progress project ${projectId} minted`), expectedMinted);
    assert.equal(safeNumber(project.reserved, `Rotini progress project ${projectId} reserved`), expectedReserved);
  }
  if (choreography.reservedProjects.length > choreography.finalizedReservations.length) {
    const reservationId = choreography.reservedProjects.length - 1;
    assert.equal(projection.latest_reservation[Object.keys(projection.latest_reservation)[0]], reservationId);
    const reservation = objectValue(projection.reservations[String(reservationId)], `Rotini progress reservation ${reservationId}`);
    assert.equal(safeNumber(reservation.project_id, "Rotini progress reservation project"), reservationId);
    assert.equal(safeNumber(reservation.token_id, "Rotini progress reservation token"), reservationId);
    assert.equal(safeNumber(reservation.iteration, "Rotini progress reservation iteration"), 0);
  } else {
    assert.deepEqual(projection.reservations, {});
    assert.deepEqual(projection.latest_reservation, {});
  }
}

function applyConfirmedFinalize(
  projection: Awaited<ReturnType<typeof readRotiniBrowserProjection>>,
  reservationId: number,
): Awaited<ReturnType<typeof readRotiniBrowserProjection>> {
  const next = structuredClone(projection);
  const project = objectValue(next.projects[String(reservationId)], `Rotini finalized project ${reservationId}`);
  project.minted = 1;
  project.reserved = 0;
  delete next.reservations[String(reservationId)];
  next.latest_reservation = {};
  return next;
}

async function readProgressProjection(input: {
  primary: TezosToolkit;
  fallback: TezosToolkit;
  contractAddress: string;
  collector: string;
  choreography: Pick<RotiniResumeChoreography, "reservedProjects" | "finalizedReservations">;
}): Promise<Awaited<ReturnType<typeof readRotiniBrowserProjection>>> {
  const read = async (tezos: TezosToolkit, lane: "primary" | "fallback") => {
    await assertShadownet(tezos, `Rotini resume ${lane} projection`);
    const projection = await readRotiniBrowserProjection(tezos, input.contractAddress, input.collector);
    assertProgressProjection(projection, input.choreography);
    return projection;
  };
  return readWithBoundedRetry({
    primary: declareReadOnlyReader("Rotini resumed primary projection", () => read(input.primary, "primary")),
    fallback: declareReadOnlyReader("Rotini resumed fallback projection", () => read(input.fallback, "fallback")),
  }, {
    maxAttempts: 8,
    deadlineMs: 90_000,
    baseDelayMs: 250,
    maxDelayMs: 5_000,
    maxRetryAfterMs: 5_000,
  });
}

async function waitForText(page: Page, selector: string, expected: string, timeout = 120_000): Promise<void> {
  await page.waitForFunction(
    ({ selector: target, expectedText }) => document.querySelector(target)?.textContent?.includes(expectedText),
    { selector, expectedText: expected },
    { timeout },
  );
}

async function waitForIterationOutcome(page: Page, successText: string, timeout = 180_000): Promise<void> {
  try {
    const handle = await page.waitForFunction(
      ({ success }) => {
        const log = document.getElementById("log")?.textContent || "";
        const notice = document.getElementById("ppNotice")?.textContent || "";
        if (notice.includes("Iteration mint failed:")) return { status: "error", message: notice };
        if (log.includes(success)) return { status: "success", message: log };
        return false;
      },
      { success: successText },
      { timeout },
    );
    const result = await handle.jsonValue() as { status: string; message: string };
    if (result.status !== "success") throw new Error(`Rotini browser reported a failed stage: ${result.message.slice(-2_000)}`);
  } catch (error) {
    const [notice, log] = await Promise.all([
      page.locator("#ppNotice").innerText().catch(() => "<unreadable>"),
      page.locator("#log").innerText().catch(() => "<unreadable>"),
    ]);
    throw new Error(
      `Rotini iteration outcome failed; notice=${JSON.stringify(notice)} logTail=${JSON.stringify(log.slice(-2_000))}`,
      { cause: error },
    );
  }
}

async function captureResumeStage(input: {
  page: Page;
  monitor: ReturnType<typeof monitorPastaProofPage>;
  runRoot: string;
  ordinal: number;
  mode: RotiniMode;
  tokenId: number;
}): Promise<void> {
  const upper = input.mode.toUpperCase();
  await input.page.locator("#mintInfo").scrollIntoViewIfNeeded();
  await capturePastaProofStage({
    page: input.page,
    monitor: input.monitor,
    outputRoot: input.runRoot,
    app: APP,
    capability: `collector finalize ${upper} token`,
    stageOrdinal: input.ordinal,
    stageName: `${upper} token reserved rendered pinned and finalized`,
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "h1", name: "application", expectedText: "Rotini" },
      { selector: "#ppNotice", name: `${input.mode} finalization`, expectedText: `${upper} iteration ${input.tokenId} finalized` },
      { selector: "#mintInfo", name: `${input.mode} supply`, expectedText: "1 finalized" },
      { selector: "#log", name: `${input.mode} operation`, expectedText: `collector finalized ${upper} token ${input.tokenId}` },
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function capturePostSubmittedReconciliationStage(input: {
  page: Page;
  monitor: ReturnType<typeof monitorPastaProofPage>;
  runRoot: string;
  collector: string;
}): Promise<void> {
  await input.page.locator("#mintInfo").scrollIntoViewIfNeeded();
  await capturePastaProofStage({
    page: input.page,
    monitor: input.monitor,
    outputRoot: input.runRoot,
    app: APP,
    capability: "collector reconcile PNG token",
    stageOrdinal: 7,
    stageName: "PNG token post-confirmation state reconciled",
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "h1", name: "application", expectedText: "Rotini" },
      { selector: "#mintInfo", name: "reconciled PNG output", expectedText: "PNG" },
      { selector: "#mintInfo", name: "reconciled finalized supply", expectedText: "1 finalized" },
      { selector: "#log", name: "connected read-only collector session", expectedText: `connected ${input.collector} on shadownet` },
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function openBrowser(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  return { browser, page: await context.newPage() };
}

async function installExactZipCheckpointRoutes(
  page: Page,
  pins: readonly ResumePin[],
  publicGatewayBaseUrl: string,
): Promise<void> {
  await installExactCheckpointRoutes(page, pins, publicGatewayBaseUrl, [
    { sequence: 11, fileName: "rotini-layer-1.png", mimeType: "image/png" },
    { sequence: 12, fileName: "rotini-layer-2.png", mimeType: "image/png" },
    { sequence: 13, fileName: "rotini-generator.json", mimeType: "application/json" },
  ]);
}

async function installExactGifCheckpointRoutes(
  page: Page,
  pins: readonly ResumePin[],
  publicGatewayBaseUrl: string,
): Promise<void> {
  await installExactCheckpointRoutes(page, pins, publicGatewayBaseUrl, [
    { sequence: 7, fileName: "rotini-layer-1.png", mimeType: "image/png" },
    { sequence: 8, fileName: "rotini-layer-2.png", mimeType: "image/png" },
    { sequence: 9, fileName: "rotini-generator.json", mimeType: "application/json" },
    { sequence: 11, fileName: "rotini-layer-1.png", mimeType: "image/png" },
    { sequence: 12, fileName: "rotini-layer-2.png", mimeType: "image/png" },
    { sequence: 13, fileName: "rotini-generator.json", mimeType: "application/json" },
  ]);
}

async function installExactCheckpointRoutes(
  page: Page,
  pins: readonly ResumePin[],
  publicGatewayBaseUrl: string,
  expected: ReadonlyArray<{
    sequence: number;
    fileName: string;
    mimeType: string;
  }>,
): Promise<void> {
  const gateway = normalizeBase(publicGatewayBaseUrl);
  const installed = new Map<string, { sha256: string; mimeType: string }>();
  for (const definition of expected) {
    const pin = pins[definition.sequence - 1];
    assert.ok(pin, `Rotini exact recovery checkpoint pin ${definition.sequence} is missing`);
    assert.equal(pin.sequence, definition.sequence);
    assert.equal(pin.actor, "creator");
    assert.equal(pin.fileName, definition.fileName);
    assert.equal(pin.mimeType, definition.mimeType);
    assert.equal(pin.proof.sha256, sha256(pin.bytes));
    const exactUrl = `${gateway}/${pin.proof.cid}`;
    assert.equal(pin.proof.publicGatewayUrl, exactUrl);
    const duplicate = installed.get(exactUrl);
    if (duplicate) {
      assert.deepEqual(
        duplicate,
        { sha256: pin.proof.sha256, mimeType: definition.mimeType },
        `Rotini duplicate checkpoint route ${exactUrl} bytes drift`,
      );
      continue;
    }
    installed.set(exactUrl, { sha256: pin.proof.sha256, mimeType: definition.mimeType });
    await page.route(exactUrl, async (route) => {
      assert.equal(route.request().method(), "GET", `Rotini exact checkpoint route only permits GET ${exactUrl}`);
      await route.fulfill({
        status: 200,
        contentType: definition.mimeType,
        body: Buffer.from(pin.bytes),
        headers: { "cache-control": "no-store", "x-pasta-proof-source": "checkpoint" },
      });
    });
  }
}

export type RotiniUiLiveResumeResult = {
  status: "RECOVERY_ACTIONS_COMPLETED";
  contractAddress: string;
  operationHashes: string[];
  checkpointFinalSha256: string;
};

async function runRotiniUiLiveResumePhase(phase: RotiniResumePhase): Promise<RotiniUiLiveResumeResult> {
  const postSubmitted = phase === "project-zero-finalized";
  const gifResume = phase === "gif-reservation-pending";
  const zipResume = phase === "zip-reservation-pending";
  const preflight = await performResumePreflight(
    process.env[ROTINI_UI_LIVE_RESUME_OUTPUT_ENV] || "",
    phase,
  );

  // Signer/keyring access is intentionally below every immutable checkpoint,
  // public-IPFS, screenshot, contract-identity, and exact live-state check.
  const env = await signerEnv(preflight.readRpc);
  const { creator, collector, collectorSigner } = await loadSignerPair(env);
  assert.equal(creator.address, preflight.evidence.creator, "Rotini resume creator keyring identity drift");
  assert.equal(collector.address, preflight.evidence.collector, "Rotini resume collector keyring identity drift");
  const collectorTezos = buildToolkit(collectorSigner, preflight.readRpc);
  await assertShadownet(collectorTezos, "Rotini resume signer startup");
  const balance = await collectorTezos.tz.getBalance(collector.address);
  const balanceMutez = Number(balance.toString());
  const requiredBalanceMutez = COLLECTOR_OPERATION_RESERVE_MUTEZ + 2;
  if (!Number.isSafeInteger(balanceMutez) || balanceMutez < requiredBalanceMutez) {
    block("Rotini resume collector is underfunded before any new pin or operation", [
      `Collector \`${collector.address}\` has \`${balance.toString()}\` mutez; at least \`${requiredBalanceMutez}\` is required.`,
    ]);
  }

  const choreography = new RotiniResumeChoreography(
    preflight.evidence.checkpoint,
    collector.address,
    postSubmitted
      ? {
          reservedProjects: [0],
          finalizedReservations: [0],
          pinProofs: preflight.evidence.pins.slice(13, 15).map((pin) => pin.proof),
        }
      : zipResume
        ? {
            reservedProjects: [0, 1, 2],
            finalizedReservations: [0, 1],
            pinProofs: preflight.evidence.pins.slice(13, 17).map((pin) => pin.proof),
          }
        : gifResume
          ? {
              reservedProjects: [0, 1],
              finalizedReservations: [0],
              pinProofs: preflight.evidence.pins.slice(13, 15).map((pin) => pin.proof),
            }
          : undefined,
  );
  let collectorProjection = preflight.initialProjection;
  assertProgressProjection(collectorProjection, choreography);
  const appliedOperations = createRotiniAppliedOperationBinding({
    signerAddress: collector.address,
  });
  const session = new TaquitoPastaUiLiveSession({
    tezos: collectorTezos,
    signerAddress: collector.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    initialOperationSequence: zipResume ? 5 : gifResume ? 3 : postSubmitted ? 2 : 1,
    initialReceiptSequence: zipResume ? 16 : gifResume ? 8 : postSubmitted ? 8 : 3,
    allowedContractAddresses: new Set([preflight.evidence.contractAddress]),
    allowedEntrypoints: new Set(["reserve_iteration", "finalize_iteration"]),
    assertExpectedChain: async (stage) => {
      await assertShadownet(collectorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: preflight.ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: preflight.ipfs }),
    validateCall: (input) => choreography.validateCall(input),
    projectStorage: () => collectorProjection,
    beforeOperationSubmit: (operation) => preflight.evidence.checkpoint.beforeOperationSubmit("collector", operation),
    onOperationSubmitted: (operation) => preflight.evidence.checkpoint.onOperationSubmitted("collector", operation),
    assertOperationApplied: appliedOperations.assertOperationApplied,
    beforePin: (input) => choreography.beforePin(input),
    onPin: ({ proof }) => choreography.onPin(proof),
    onReceipt: async (receipt) => {
      await appliedOperations.bindReceipt(receipt, async () => {
        await preflight.evidence.checkpoint.onReceipt("collector", receipt);
        if (!receipt.operationHash) return;
        const entrypoint = receipt.entrypoints?.[0];
        if (entrypoint === "finalize_iteration") {
          collectorProjection = applyConfirmedFinalize(
            collectorProjection,
            choreography.finalizedReservations.length - 1,
          );
          assertProgressProjection(collectorProjection, choreography);
        } else if (entrypoint === "reserve_iteration") {
          collectorProjection = await readProgressProjection({
            primary: collectorTezos,
            fallback: preflight.fallbackReadTezos,
            contractAddress: preflight.evidence.contractAddress,
            collector: collector.address,
            choreography,
          });
        } else {
          throw new Error(`Rotini resume received unexpected confirmed entrypoint ${String(entrypoint)}`);
        }
      });
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez,
    requiredBalanceMutez,
    estimatedOriginationMutez: 0,
    operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
  });

  const server = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: (request) => session.handle(request),
  });
  let browser: Browser | null = null;
  let monitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  try {
    const opened = await openBrowser();
    browser = opened.browser;
    monitor = monitorPastaProofPage(opened.page);
    if (gifResume) {
      await installExactGifCheckpointRoutes(opened.page, preflight.evidence.pins, preflight.ipfs.publicGatewayUrl);
    } else if (zipResume) {
      await installExactZipCheckpointRoutes(opened.page, preflight.evidence.pins, preflight.ipfs.publicGatewayUrl);
    }
    await opened.page.goto(`${server.origin}/creation-tools/rotini/index.html`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await opened.page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap && (window as any).RotiniArtifacts));
    await installPastaUiLiveBrowserProxy(opened.page, server, "UI-LIVE");
    await installRotiniBrowserAdapters(opened.page, preflight.ipfs.publicGatewayUrl);
    await opened.page.selectOption("#network", "shadownet");
    await opened.page.selectOption("#pinProvider", "node");
    await opened.page.fill("#pinNode", preflight.ipfs.apiUrl);
    await opened.page.fill("#mintKt", preflight.evidence.contractAddress);
    await opened.page.click("#btnConnect");
    await waitForText(opened.page, "#log", `connected ${collector.address} on shadownet`, 30_000);

    const modes = ["png", "gif", "zip"] as const;
    if (postSubmitted) {
      await opened.page.fill("#mintProjectId", "0");
      await opened.page.click("#btnLoadProject");
      await waitForText(opened.page, "#mintInfo", "PNG", 30_000);
      await waitForText(opened.page, "#mintInfo", "1 finalized", 30_000);
      const reconciledInfo = await opened.page.locator("#mintInfo").innerText();
      assert.match(reconciledInfo, /1 finalized \+ 0 rendering \/ 4 · PNG/);
      assert.doesNotMatch(reconciledInfo, /\[object Object\]/);
      await capturePostSubmittedReconciliationStage({
        page: opened.page,
        monitor,
        runRoot: preflight.evidence.runRoot,
        collector: collector.address,
      });
    }

    for (let projectId = zipResume ? 2 : gifResume ? 1 : postSubmitted ? 1 : 0; projectId < modes.length; projectId += 1) {
      const mode = modes[projectId];
      const upper = mode.toUpperCase();
      await opened.page.fill("#mintProjectId", String(projectId));
      await opened.page.click("#btnLoadProject");
      await waitForText(opened.page, "#mintInfo", upper, 30_000);
      assert.match(await opened.page.locator("#mintInfo").innerText(), new RegExp(`/ 4 · ${upper}`));
      assert.doesNotMatch(await opened.page.locator("#mintInfo").innerText(), /\[object Object\]/);
      await opened.page.click("#btnMintIteration");
      await waitForIterationOutcome(opened.page, `collector finalized ${upper} token ${projectId}`);
      if (projectId === 0) await waitForText(opened.page, "#log", "resuming unfinalized reservation 0", 30_000);
      if (gifResume && projectId === 1) {
        await waitForText(opened.page, "#log", "resuming unfinalized reservation 1", 30_000);
      }
      if (zipResume) await waitForText(opened.page, "#log", "resuming unfinalized reservation 2", 30_000);
      await waitForText(opened.page, "#ppNotice", `${upper} iteration ${projectId} finalized`, 30_000);
      await waitForText(opened.page, "#mintInfo", "1 finalized", 30_000);
      await captureResumeStage({
        page: opened.page,
        monitor,
        runRoot: preflight.evidence.runRoot,
        ordinal: projectId + 7,
        mode,
        tokenId: projectId,
      });
    }
  } finally {
    monitor?.dispose();
    await browser?.close();
    await server.close();
  }

  assert.deepEqual(choreography.reservedProjects, [0, 1, 2]);
  assert.deepEqual(choreography.finalizedReservations, [0, 1, 2]);
  appliedOperations.assertSettled();
  assert.equal(choreography.completedPins, zipResume ? 3 : gifResume ? 5 : postSubmitted ? 5 : 7);
  const operations = session.getReceipts().filter((receipt) => receipt.operationHash);
  assert.deepEqual(
    operations.map((receipt) => receipt.entrypoints?.[0]),
    zipResume
      ? ["finalize_iteration"]
      : gifResume
        ? ["finalize_iteration", "reserve_iteration", "finalize_iteration"]
      : postSubmitted
        ? ["reserve_iteration", "finalize_iteration", "reserve_iteration", "finalize_iteration"]
        : ["finalize_iteration", "reserve_iteration", "finalize_iteration", "reserve_iteration", "finalize_iteration"],
  );
  const operationHashes = operations.map((receipt) => String(receipt.operationHash || ""));
  operationHashes.forEach((hash) => assert.equal(validateOperation(hash), ValidationResult.VALID));
  const expectedFinalNonOperationReceipts = zipResume ? 33 : postSubmitted ? 31 : 30;
  assert.deepEqual(preflight.evidence.checkpoint.summary(), {
    status: "ACTIVE",
    completedOperations: 10,
    pins: 20,
    nonOperationReceipts: expectedFinalNonOperationReceipts,
    pendingOperation: null,
    pendingPin: null,
    pendingPinReceipts: [],
  });
  const screenshotNames = (await readdir(path.join(preflight.evidence.appRoot, "screenshots")))
    .filter((name) => name.endsWith(".png"));
  assert.equal(screenshotNames.length, 9, "Rotini resume must capture screenshots 7 through 9 before finalization");
  const finalization = await preflight.evidence.checkpoint.finalize(new Date().toISOString());
  assert.equal(finalization.status, "FINALIZED");
  assert.deepEqual(finalization.counts.actors, { creator: 4, collector: 6 });
  assert.equal(finalization.counts.operations, 10);
  assert.equal(finalization.counts.pins, 20);
  assert.equal(finalization.counts.nonOperationReceipts, expectedFinalNonOperationReceipts);
  assert.equal(
    finalization.counts.events,
    (3 * finalization.counts.operations) + (2 * finalization.counts.pins) + finalization.counts.nonOperationReceipts,
    "Rotini final event count must derive from operation, pin, and non-operation journal behavior",
  );
  await assertAbsent(path.join(preflight.evidence.appRoot, "manifest.json"), "Rotini manifest");
  return {
    status: "RECOVERY_ACTIONS_COMPLETED",
    contractAddress: preflight.evidence.contractAddress,
    operationHashes,
    checkpointFinalSha256: finalization.finalSha256,
  };
}

export async function runRotiniUiLiveResume(): Promise<RotiniUiLiveResumeResult> {
  assertRotiniUiLiveResumeAllowed(process.env);
  return runRotiniUiLiveResumePhase("reservation-pending");
}

export async function runRotiniUiLivePostSubmittedResume(): Promise<RotiniUiLiveResumeResult> {
  assertRotiniUiLivePostSubmittedResumeAllowed(process.env);
  return runRotiniUiLiveResumePhase("project-zero-finalized");
}

export async function runRotiniUiLiveGifResume(): Promise<RotiniUiLiveResumeResult> {
  assertRotiniUiLiveGifResumeAllowed(process.env);
  return runRotiniUiLiveResumePhase("gif-reservation-pending");
}

export async function runRotiniUiLiveZipResume(): Promise<RotiniUiLiveResumeResult> {
  assertRotiniUiLiveZipResumeAllowed(process.env);
  return runRotiniUiLiveResumePhase("zip-reservation-pending");
}

async function main(): Promise<void> {
  const result = process.env[ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG] === "1"
    ? await runRotiniUiLiveGifResume()
    : process.env[ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG] === "1"
    ? await runRotiniUiLiveZipResume()
    : process.env[ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG] === "1"
      ? await runRotiniUiLivePostSubmittedResume()
      : await runRotiniUiLiveResume();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    if (error instanceof Error) process.stderr.write(`${error.stack || error.message}\n`);
    else process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
