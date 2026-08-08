#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import type { PastaUiLivePublicReceipt } from "./pasta-ui-live-bridge-kit";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import {
  createHttpGetReader,
  readWithBoundedRetry,
  type ReadOnlyFetch,
} from "./pasta-readonly-retry";
import {
  openRotiniUiLiveCheckpoint,
  ROTINI_UI_LIVE_CHECKPOINT_EVENT_SCHEMA,
  type RotiniUiLiveCheckpoint,
  type RotiniUiLiveCheckpointActor,
  type RotiniUiLiveCheckpointArtifact,
  type RotiniUiLiveCheckpointEvidence,
  type RotiniUiLiveCheckpointSummary,
} from "./shadownet-rotini-ui-live-checkpoint";
import {
  deterministicJsonBytes,
  root,
  SHADOWNET_CHAIN_ID,
} from "./shadownet-proof-kit";

type JsonObject = Record<string, any>;

export const ROTINI_SUBMITTED_RECONCILE_FLAG =
  "PASTA_SHADOWNET_ROTINI_SUBMITTED_RECONCILE";
export const ROTINI_SUBMITTED_RECONCILE_OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";

/**
 * This lane was reconciled once with a one-off script whose assumptions were
 * hard-coded to a single 2026-07-22 operation. It is evidence, not an input to
 * the generic reconciler, and is deliberately impossible to select here.
 */
export const ROTINI_LEGACY_SUBMITTED_RECONCILE_RUN_ID =
  "pasta-alpha-proof-20260722b";

const SHADOWNET_RPC_ENDPOINTS = Object.freeze([
  "https://tezos-shadownet.octez.io/",
  "https://tcinfra.net/rpc/tezos/shadownet",
] as const);
const SHADOWNET_TZKT_ENDPOINT = "https://api.shadownet.tzkt.io/v1";
const CHECKPOINT_RELATIVE = "artifacts/rotini-ui-live-checkpoint";
const EVENT_PATH_RE =
  /^events\/[0-9]{6}-(?:prepared|submitted|confirmed|pin_prepared|pin_confirmed|receipt)-(?:creator|collector)\.json$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const ADDRESS_RE = /^(?:tz[1-4][1-9A-HJ-NP-Za-km-z]{33}|KT1[1-9A-HJ-NP-Za-km-z]{33})$/;
const OPERATION_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;

type CheckpointLike = Pick<
  RotiniUiLiveCheckpoint,
  "summary" | "validatedEvidence" | "onReceipt"
>;

export type RotiniSubmittedReconcilerIo = Readonly<{
  fetchImpl?: ReadOnlyFetch;
  readFileImpl?: typeof readFile;
  lstatImpl?: typeof lstat;
  realpathImpl?: typeof realpath;
  openCheckpoint?: (checkpointRoot: string) => Promise<CheckpointLike>;
}>;

export type RotiniSubmittedReconciliationStatus =
  | "APPLIED"
  | "FAILED"
  | "PENDING"
  | "AMBIGUOUS";

export type RotiniSubmittedReconciliationResult = Readonly<{
  schema: "pastaprotocol-rotini-submitted-reconciliation@2";
  status: RotiniSubmittedReconciliationStatus;
  reason: string;
  runId: string;
  checkpointId: string;
  operationHash: string;
  actor: RotiniUiLiveCheckpointActor;
  action: "originate" | "call";
  checkpointMutation: "CONFIRMED_APPENDED" | "NONE";
  receipt?: PastaUiLivePublicReceipt;
  externalMethods: readonly ["GET"];
  observations: Readonly<{
    tzktStatus: string;
    primaryRpcHeadLevel: number;
    fallbackRpcHeadLevel: number;
    primaryMempool: "ACTIVE" | "REJECTED" | "ABSENT";
    fallbackMempool: "ACTIVE" | "REJECTED" | "ABSENT";
  }>;
  integrity: Readonly<{
    intentSha256: string;
    checkpointBeforeSha256: string;
    checkpointAfterSha256?: string;
    contractArtifactSha256: string;
    contractCodeSha256: string;
    observationSha256: string;
    appendedArtifact?: RotiniUiLiveCheckpointArtifact;
  }>;
  sideEffects: Readonly<{
    signerLoaded: false;
    chainWrites: 0;
    ipfsWrites: 0;
    retriesOfWrites: 0;
    checkpointConfirmationEvents: 0 | 1;
  }>;
}>;

type DurablePendingOperation = Readonly<{
  actor: RotiniUiLiveCheckpointActor;
  actorAddress: string;
  action: "originate" | "call";
  operationSequence: number;
  globalOrdinal: number;
  operationHash: string;
  contractAddress?: string;
  entrypoints: string[];
  descriptor: JsonObject;
  descriptorSha256: string;
  receiptSequence: number;
}>;

type RpcLaneObservation = Readonly<{
  endpoint: string;
  chainId: string;
  headLevel: number;
  headTimestamp: string;
  mempool: unknown;
  operationDisposition: "ACTIVE" | "REJECTED" | "ABSENT";
}>;

type TzktAssessment = Readonly<{
  classification: "APPLIED" | "FAILED" | "PENDING" | "ABSENT" | "AMBIGUOUS";
  reason: string;
  status: string;
  row?: JsonObject;
  level?: number;
  timestampUtc?: string;
  contractAddress?: string;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function objectValue(value: unknown, label: string): JsonObject {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as JsonObject;
}

function arrayValue(value: unknown, label: string): any[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  return value;
}

function stringValue(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok((value as string).length > 0, `${label} must not be empty`);
  return value as string;
}

function hashValue(value: unknown, label: string): string {
  const digest = stringValue(value, label);
  assert.match(digest, HASH_RE, `${label} must be a SHA-256 digest`);
  return digest;
}

function addressValue(value: unknown, label: string, originated = false): string {
  const address = stringValue(value, label);
  assert.match(address, ADDRESS_RE, `${label} must be a Tezos address`);
  if (originated) assert.ok(address.startsWith("KT1"), `${label} must be an originated address`);
  return address;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  const parsed =
    typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)
      ? Number(value)
      : value;
  assert.ok(
    Number.isSafeInteger(parsed) && Number(parsed) >= minimum,
    `${label} must be a safe integer of at least ${minimum}`,
  );
  return Number(parsed);
}

function canonicalTimestamp(value: unknown, label: string): string {
  const timestamp = stringValue(value, label);
  const milliseconds = Date.parse(timestamp);
  assert.ok(Number.isFinite(milliseconds), `${label} is invalid`);
  return new Date(milliseconds).toISOString();
}

function normalizeBase(value: string): string {
  return value.replace(/\/+$/, "");
}

function rpcUrl(base: string, relative: string): string {
  return `${normalizeBase(base)}/${relative.replace(/^\/+/, "")}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return Buffer.from(deterministicJsonBytes(left)).equals(
    Buffer.from(deterministicJsonBytes(right)),
  );
}

async function readOnlyJson(
  label: string,
  url: string,
  fetchImpl: ReadOnlyFetch,
): Promise<unknown> {
  return readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      fetchImpl,
      headers: { accept: "application/json" },
      redirect: "error",
      parse: (response) => response.json(),
    }),
  }, {
    maxAttempts: 4,
    deadlineMs: 45_000,
    maxRetryAfterMs: 5_000,
  });
}

async function assertRealDirectory(
  directory: string,
  label: string,
  lstatImpl: typeof lstat,
): Promise<void> {
  const info = await lstatImpl(directory);
  assert.ok(
    info.isDirectory() && !info.isSymbolicLink(),
    `${label} must be a real directory and not a symbolic link`,
  );
}

function assertEvidenceSame(
  before: RotiniUiLiveCheckpointEvidence,
  current: RotiniUiLiveCheckpointEvidence,
): void {
  assert.equal(current.checkpointId, before.checkpointId, "Rotini checkpoint id changed during reconciliation");
  assert.equal(current.intentSha256, before.intentSha256, "Rotini checkpoint intent changed during reconciliation");
  assert.equal(current.chainHeadSha256, before.chainHeadSha256, "Rotini checkpoint event chain changed during reconciliation");
  assert.deepEqual(current.summary, before.summary, "Rotini checkpoint state changed during reconciliation");
  assert.deepEqual(current.artifacts, before.artifacts, "Rotini checkpoint artifacts changed during reconciliation");
}

async function readAndVerifyCheckpointArtifacts(input: Readonly<{
  checkpointRoot: string;
  evidence: RotiniUiLiveCheckpointEvidence;
  readFileImpl: typeof readFile;
  lstatImpl: typeof lstat;
}>): Promise<Map<string, Uint8Array>> {
  const output = new Map<string, Uint8Array>();
  const rootPrefix = `${path.resolve(input.checkpointRoot)}${path.sep}`;
  for (const artifact of input.evidence.artifacts) {
    const relative = stringValue(artifact.path, "Rotini checkpoint artifact path");
    assert.ok(
      relative === "intent.json" ||
        relative === "final.json" ||
        EVENT_PATH_RE.test(relative) ||
        /^pins\/[0-9]{6}\.(?:bin|proof\.json)$/.test(relative),
      `unexpected Rotini checkpoint artifact path: ${relative}`,
    );
    const absolute = path.resolve(input.checkpointRoot, relative);
    assert.ok(absolute.startsWith(rootPrefix), `Rotini checkpoint artifact escapes its root: ${relative}`);
    const info = await input.lstatImpl(absolute);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `${relative} is not a real checkpoint file`);
    const bytes = await input.readFileImpl(absolute);
    assert.equal(bytes.byteLength, artifact.byteLength, `${relative} checkpoint byte length drift`);
    assert.equal(sha256(bytes), artifact.sha256, `${relative} checkpoint hash drift`);
    output.set(relative, bytes);
  }
  return output;
}

function parseCanonicalEvent(bytes: Uint8Array, label: string): JsonObject {
  const value = objectValue(JSON.parse(Buffer.from(bytes).toString("utf8")), label);
  assert.deepEqual(
    Buffer.from(bytes),
    Buffer.from(deterministicJsonBytes(value)),
    `${label} is not canonical JSON`,
  );
  assert.equal(value.schema, ROTINI_UI_LIVE_CHECKPOINT_EVENT_SCHEMA, `${label} schema drift`);
  return value;
}

function receiptSequenceForActor(
  actor: RotiniUiLiveCheckpointActor,
  events: readonly JsonObject[],
): number {
  const sequences = events
    .filter((event) =>
      event.actor === actor &&
      (event.phase === "RECEIPT" || event.phase === "CONFIRMED"),
    )
    .map((event) => {
      const receipt = objectValue(event.receipt, "Rotini persisted receipt");
      return safeInteger(receipt.sequence, "Rotini persisted receipt sequence", 1);
    })
    .sort((left, right) => left - right);
  assert.equal(
    new Set(sequences).size,
    sequences.length,
    `Rotini ${actor} receipt sequences are duplicated`,
  );
  for (let index = 0; index < sequences.length; index += 1) {
    assert.equal(
      sequences[index],
      index + 1,
      `Rotini ${actor} receipt sequence has a gap; signer-free sequence recovery is unsafe`,
    );
  }
  return sequences.length + 1;
}

async function validateCurrentContractArtifact(input: Readonly<{
  contractIdentity: JsonObject;
  readFileImpl: typeof readFile;
  lstatImpl: typeof lstat;
  realpathImpl: typeof realpath;
}>): Promise<{ rawSha256: string; codeSha256: string }> {
  const relative = stringValue(
    input.contractIdentity.artifactPath,
    "Rotini contract artifact path",
  );
  assert.ok(!path.isAbsolute(relative), "Rotini contract artifact path must remain repository-relative");
  const repositoryRoot = await input.realpathImpl(root);
  const artifactPath = path.resolve(root, relative);
  const artifactRealPath = await input.realpathImpl(artifactPath);
  assert.ok(
    artifactRealPath.startsWith(`${repositoryRoot}${path.sep}`),
    "Rotini contract artifact resolves outside the repository",
  );
  const info = await input.lstatImpl(artifactPath);
  assert.ok(info.isFile() && !info.isSymbolicLink(), "Rotini contract artifact must be a real file");
  const bytes = await input.readFileImpl(artifactPath);
  const rawSha256 = sha256(bytes);
  assert.equal(
    rawSha256,
    hashValue(input.contractIdentity.rawArtifactSha256, "Rotini expected raw artifact hash"),
    "Rotini current contract artifact hash drift",
  );
  const artifact = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  const artifactCode = Array.isArray(artifact)
    ? artifact
    : objectValue(artifact, "Rotini contract artifact").code;
  const codeSha256 = hashMichelsonScriptCode(artifactCode);
  assert.equal(
    codeSha256,
    hashValue(
      input.contractIdentity.canonicalMichelsonCodeSha256,
      "Rotini expected contract code hash",
    ),
    "Rotini current contract code identity drift",
  );
  return { rawSha256, codeSha256 };
}

async function loadDurablePendingOperation(input: Readonly<{
  runRoot: string;
  checkpointRoot: string;
  checkpoint: CheckpointLike;
  readFileImpl: typeof readFile;
  lstatImpl: typeof lstat;
  realpathImpl: typeof realpath;
}>): Promise<{
  evidence: RotiniUiLiveCheckpointEvidence;
  pending: DurablePendingOperation;
  artifact: { rawSha256: string; codeSha256: string };
}> {
  const evidence = await input.checkpoint.validatedEvidence();
  const summary = input.checkpoint.summary();
  assert.deepEqual(summary, evidence.summary, "Rotini checkpoint summary/evidence drift");
  assert.equal(summary.status, "ACTIVE", "Rotini submitted reconciler refuses finalized evidence");
  assert.equal(summary.pendingOperation?.phase, "SUBMITTED", "Rotini checkpoint has no durable SUBMITTED boundary");
  assert.equal(summary.pendingPin, null, "Rotini checkpoint has a concurrent pending pin");
  assert.deepEqual(summary.pendingPinReceipts, [], "Rotini checkpoint has unreceipted durable pins");

  const intent = objectValue(evidence.intent, "Rotini checkpoint intent");
  assert.equal(
    intent.runId,
    path.basename(path.resolve(input.runRoot)),
    "Rotini checkpoint run id does not bind to the explicit run root",
  );
  assert.equal(intent.checkpointId, evidence.checkpointId, "Rotini checkpoint id binding drift");
  const network = objectValue(intent.network, "Rotini checkpoint network");
  assert.deepEqual(
    network,
    { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
    "Rotini checkpoint is not bound to Shadownet",
  );
  const actors = objectValue(intent.actors, "Rotini checkpoint actors");
  const creator = addressValue(actors.creator, "Rotini creator");
  const collector = addressValue(actors.collector, "Rotini collector");
  assert.notEqual(creator, collector, "Rotini checkpoint creator and collector must differ");
  const contractIdentity = objectValue(intent.contractIdentity, "Rotini contract identity");
  const artifact = await validateCurrentContractArtifact({
    contractIdentity,
    readFileImpl: input.readFileImpl,
    lstatImpl: input.lstatImpl,
    realpathImpl: input.realpathImpl,
  });

  const files = await readAndVerifyCheckpointArtifacts({
    checkpointRoot: input.checkpointRoot,
    evidence,
    readFileImpl: input.readFileImpl,
    lstatImpl: input.lstatImpl,
  });
  const events = [...files.entries()]
    .filter(([relative]) => EVENT_PATH_RE.test(relative))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relative, bytes]) => ({
      relative,
      bytes,
      hash: sha256(bytes),
      value: parseCanonicalEvent(bytes, relative),
    }));
  const confirmedHashes = new Set(
    events
      .filter(({ value }) => value.phase === "CONFIRMED")
      .map(({ value }) => stringValue(value.operationHash, "Rotini CONFIRMED operation hash")),
  );
  const unresolved = events.filter(({ value }) =>
    value.phase === "SUBMITTED" &&
    !confirmedHashes.has(String(value.operationHash || "")),
  );
  assert.equal(
    unresolved.length,
    1,
    "Rotini checkpoint must contain exactly one durable SUBMITTED event not already CONFIRMED",
  );
  const submitted = unresolved[0];
  const submittedEvent = submitted.value;
  assert.equal(
    submittedEvent.operationHash,
    summary.pendingOperation?.operationHash,
    "Rotini pending summary hash differs from durable SUBMITTED event",
  );
  const operationHash = stringValue(submittedEvent.operationHash, "Rotini submitted operation hash");
  assert.match(operationHash, OPERATION_RE, "Rotini submitted operation hash is invalid");
  const preparedRecordSha256 = hashValue(
    submittedEvent.preparedRecordSha256,
    "Rotini submitted prepared-record hash",
  );
  const prepared = events.filter(({ hash, value }) =>
    hash === preparedRecordSha256 && value.phase === "PREPARED",
  );
  assert.equal(prepared.length, 1, "Rotini SUBMITTED event does not link to exactly one PREPARED event");
  const preparedEvent = prepared[0].value;
  assert.equal(preparedEvent.actor, submittedEvent.actor, "Rotini PREPARED/SUBMITTED actor drift");
  assert.equal(
    preparedEvent.descriptorSha256,
    submittedEvent.descriptorSha256,
    "Rotini PREPARED/SUBMITTED descriptor hash drift",
  );
  assert.equal(
    preparedEvent.globalOrdinal,
    submittedEvent.globalOrdinal,
    "Rotini PREPARED/SUBMITTED global ordinal drift",
  );
  assert.equal(
    preparedEvent.operationSequence,
    submittedEvent.operationSequence,
    "Rotini PREPARED/SUBMITTED sequence drift",
  );

  const actor = stringValue(submittedEvent.actor, "Rotini pending actor");
  assert.ok(actor === "creator" || actor === "collector", "Rotini pending actor is invalid");
  const operation = objectValue(preparedEvent.operation, "Rotini PREPARED operation");
  const action = stringValue(operation.action, "Rotini PREPARED action");
  assert.ok(action === "originate" || action === "call", "Rotini reconciler only accepts originate/call");
  assert.equal(operation.chainId, SHADOWNET_CHAIN_ID, "Rotini PREPARED operation chain drift");
  assert.equal(
    operation.signerAddress,
    actors[actor],
    "Rotini PREPARED operation signer/actor drift",
  );
  const operationSequence = safeInteger(
    submittedEvent.operationSequence,
    "Rotini submitted operation sequence",
    1,
  );
  const globalOrdinal = safeInteger(
    submittedEvent.globalOrdinal,
    "Rotini submitted global ordinal",
    1,
  );
  const matrix = arrayValue(intent.operationMatrix, "Rotini operation matrix");
  const expected = matrix.filter((entry) =>
    entry?.globalOrdinal === globalOrdinal &&
    entry?.actor === actor &&
    entry?.operationSequence === operationSequence,
  );
  assert.equal(expected.length, 1, "Rotini submitted operation does not bind to its matrix entry");
  assert.equal(expected[0].action, action, "Rotini submitted action/matrix drift");

  const descriptor = objectValue(operation.descriptor, "Rotini PREPARED descriptor");
  const descriptorSha256 = hashValue(
    submittedEvent.descriptorSha256,
    "Rotini submitted descriptor hash",
  );
  assert.equal(
    sha256(deterministicJsonBytes(descriptor)),
    descriptorSha256,
    "Rotini PREPARED descriptor hash drift",
  );
  const entrypoints = arrayValue(operation.entrypoints, "Rotini PREPARED entrypoints")
    .map((entry) => stringValue(entry, "Rotini PREPARED entrypoint"));
  let contractAddress: string | undefined;
  if (action === "originate") {
    assert.equal(descriptor.kind, "originate", "Rotini origination descriptor kind drift");
    assert.deepEqual(entrypoints, [], "Rotini origination must not claim entrypoints");
    assert.equal(
      hashMichelsonScriptCode(descriptor.code),
      artifact.codeSha256,
      "Rotini durable origination code differs from current artifact",
    );
    if (submittedEvent.contractAddress !== undefined) {
      contractAddress = addressValue(
        submittedEvent.contractAddress,
        "Rotini submitted originated contract",
        true,
      );
    }
  } else {
    assert.equal(descriptor.kind, "call", "Rotini call descriptor kind drift");
    const call = objectValue(descriptor.call, "Rotini durable call");
    contractAddress = addressValue(call.contractAddress, "Rotini call contract", true);
    assert.equal(operation.contractAddress, contractAddress, "Rotini call target drift");
    assert.deepEqual(entrypoints, [stringValue(call.entrypoint, "Rotini call entrypoint")]);
    assert.equal(expected[0].entrypoint, entrypoints[0], "Rotini call matrix entrypoint drift");
  }
  const eventValues = events.map(({ value }) => value);
  return {
    evidence,
    artifact,
    pending: {
      actor,
      actorAddress: addressValue(actors[actor], `Rotini ${actor}`),
      action,
      operationSequence,
      globalOrdinal,
      operationHash,
      ...(contractAddress ? { contractAddress } : {}),
      entrypoints,
      descriptor,
      descriptorSha256,
      receiptSequence: receiptSequenceForActor(actor, eventValues),
    },
  };
}

function decimalString(value: unknown, label: string): string {
  if (typeof value === "number") {
    assert.ok(Number.isSafeInteger(value), `${label} number is not exact`);
    return String(value);
  }
  if (typeof value === "string" && /^-?(?:0|[1-9]\d*)$/.test(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as JsonObject).type === "integer" &&
    typeof (value as JsonObject).value === "string" &&
    /^-?(?:0|[1-9]\d*)$/.test((value as JsonObject).value)
  ) {
    return (value as JsonObject).value;
  }
  throw new Error(`${label} is not an exact integer`);
}

function semanticMatch(actual: unknown, expected: unknown): boolean {
  if (
    typeof expected === "number" ||
    (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      (expected as JsonObject).type === "integer"
    )
  ) {
    try {
      return BigInt(decimalString(actual, "actual integer")) ===
        BigInt(decimalString(expected, "expected integer"));
    } catch {
      return false;
    }
  }
  if (expected === null || typeof expected !== "object") return Object.is(actual, expected);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((entry, index) => semanticMatch(actual[index], entry));
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const expectedRecord = expected as JsonObject;
  const actualRecord = actual as JsonObject;
  const expectedKeys = Object.keys(expectedRecord).sort();
  const actualKeys = Object.keys(actualRecord).sort();
  return (
    sameJson(expectedKeys, actualKeys) &&
    expectedKeys.every((key) => semanticMatch(actualRecord[key], expectedRecord[key]))
  );
}

function expectedAmountMutez(descriptor: JsonObject): bigint {
  const sendOptions = objectValue(descriptor.sendOptions ?? {}, "Rotini call send options");
  if (sendOptions.amount === undefined) return 0n;
  const amount = decimalString(sendOptions.amount, "Rotini call amount");
  if (sendOptions.mutez === true) return BigInt(amount);
  const match = amount.match(/^(-?)(\d+)(?:\.(\d{1,6}))?$/);
  assert.ok(match, "Rotini tez amount cannot be converted exactly to mutez");
  assert.notEqual(match[1], "-", "Rotini tez amount cannot be negative");
  return BigInt(match[2]) * 1_000_000n +
    BigInt((match[3] || "").padEnd(6, "0"));
}

function exactTopLevelOperationMatches(
  row: JsonObject,
  pending: DurablePendingOperation,
): { matches: boolean; reason: string; contractAddress?: string } {
  if (row.hash !== pending.operationHash) return { matches: false, reason: "TzKT hash drift" };
  if (row.sender?.address !== pending.actorAddress) return { matches: false, reason: "TzKT signer drift" };
  if (pending.action === "originate") {
    if (row.type !== "origination") return { matches: false, reason: "TzKT action type drift" };
    const originated = row.originatedContract?.address;
    if (String(row.status || "") === "applied") {
      if (typeof originated !== "string" || !ADDRESS_RE.test(originated) || !originated.startsWith("KT1")) {
        return { matches: false, reason: "TzKT applied origination lacks a valid contract" };
      }
      if (pending.contractAddress && originated !== pending.contractAddress) {
        return { matches: false, reason: "TzKT originated contract drift" };
      }
      return { matches: true, reason: "exact origination", contractAddress: originated };
    }
    return {
      matches: true,
      reason: "exact non-applied origination",
      ...(typeof originated === "string" ? { contractAddress: originated } : {}),
    };
  }
  if (row.type !== "transaction") return { matches: false, reason: "TzKT action type drift" };
  const call = objectValue(pending.descriptor.call, "Rotini durable call");
  if (row.target?.address !== call.contractAddress) return { matches: false, reason: "TzKT call target drift" };
  if (row.parameter?.entrypoint !== call.entrypoint) return { matches: false, reason: "TzKT call entrypoint drift" };
  if (!semanticMatch(row.parameter?.value, call.payload)) return { matches: false, reason: "TzKT call payload drift" };
  try {
    if (BigInt(decimalString(row.amount, "TzKT amount")) !== expectedAmountMutez(pending.descriptor)) {
      return { matches: false, reason: "TzKT call amount drift" };
    }
  } catch {
    return { matches: false, reason: "TzKT call amount is not exact" };
  }
  return { matches: true, reason: "exact call", contractAddress: pending.contractAddress };
}

function assessTzktOperation(
  value: unknown,
  pending: DurablePendingOperation,
): TzktAssessment {
  if (!Array.isArray(value)) {
    return {
      classification: "AMBIGUOUS",
      reason: "TzKT exact-hash response is not an array",
      status: "invalid-response",
    };
  }
  if (value.length === 0) {
    return {
      classification: "ABSENT",
      reason: "TzKT has no operation for the durable hash",
      status: "absent",
    };
  }
  const rows = value.filter((row) => row && typeof row === "object") as JsonObject[];
  if (rows.length !== value.length || rows.some((row) => row.hash !== pending.operationHash)) {
    return {
      classification: "AMBIGUOUS",
      reason: "TzKT exact-hash response contains unrelated or malformed rows",
      status: "invalid-response",
    };
  }
  const topRows = rows.filter((row) => row.nonce == null);
  if (topRows.length !== 1) {
    return {
      classification: "AMBIGUOUS",
      reason: "TzKT does not expose exactly one top-level operation",
      status: "invalid-operation-tree",
    };
  }
  const row = topRows[0];
  let exact: ReturnType<typeof exactTopLevelOperationMatches>;
  try {
    exact = exactTopLevelOperationMatches(row, pending);
  } catch (error) {
    return {
      classification: "AMBIGUOUS",
      reason: `TzKT operation shape is unsafe: ${error instanceof Error ? error.message : String(error)}`,
      status: String(row.status || "unknown"),
    };
  }
  if (!exact.matches) {
    return {
      classification: "AMBIGUOUS",
      reason: exact.reason,
      status: String(row.status || "unknown"),
    };
  }
  const status = String(row.status || "");
  if (status === "pending") {
    return { classification: "PENDING", reason: "TzKT still reports pending", status, row };
  }
  if (new Set(["failed", "backtracked", "skipped"]).has(status)) {
    return {
      classification: "FAILED",
      reason: `TzKT durably reports ${status}`,
      status,
      row,
      ...(exact.contractAddress ? { contractAddress: exact.contractAddress } : {}),
    };
  }
  if (status !== "applied") {
    return {
      classification: "AMBIGUOUS",
      reason: `TzKT reports unsupported status ${status || "(empty)"}`,
      status: status || "unknown",
    };
  }
  if (rows.some((candidate) => candidate.status !== "applied")) {
    return {
      classification: "AMBIGUOUS",
      reason: "TzKT operation tree is not wholly applied",
      status,
    };
  }
  try {
    const level = safeInteger(row.level, "TzKT applied level", 1);
    const timestampUtc = canonicalTimestamp(row.timestamp, "TzKT applied timestamp");
    return {
      classification: "APPLIED",
      reason: "TzKT exposes one exact wholly-applied operation",
      status,
      row,
      level,
      timestampUtc,
      ...(exact.contractAddress ? { contractAddress: exact.contractAddress } : {}),
    };
  } catch (error) {
    return {
      classification: "AMBIGUOUS",
      reason: `TzKT applied evidence is incomplete: ${error instanceof Error ? error.message : String(error)}`,
      status,
    };
  }
}

function mempoolEntries(value: unknown, bucket: string): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const entries = (value as JsonObject)[bucket];
  return Array.isArray(entries) ? entries : [];
}

function mempoolEntryHash(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    if (typeof value[0] === "string") return value[0];
    return mempoolEntryHash(value[1]);
  }
  if (value && typeof value === "object" && typeof (value as JsonObject).hash === "string") {
    return (value as JsonObject).hash;
  }
  return undefined;
}

function mempoolDisposition(
  value: unknown,
  operationHash: string,
): "ACTIVE" | "REJECTED" | "ABSENT" {
  const active = ["applied", "validated", "branch_delayed", "unprocessed"]
    .flatMap((bucket) => mempoolEntries(value, bucket))
    .some((entry) => mempoolEntryHash(entry) === operationHash);
  const rejected = ["branch_refused", "refused", "outdated"]
    .flatMap((bucket) => mempoolEntries(value, bucket))
    .some((entry) => mempoolEntryHash(entry) === operationHash);
  assert.ok(!(active && rejected), "RPC mempool exposes the same operation as active and rejected");
  return active ? "ACTIVE" : rejected ? "REJECTED" : "ABSENT";
}

async function readRpcLane(
  endpoint: string,
  operationHash: string,
  fetchImpl: ReadOnlyFetch,
): Promise<RpcLaneObservation> {
  const [chainId, headerValue, mempool] = await Promise.all([
    readOnlyJson(
      `Rotini ${endpoint} chain id`,
      rpcUrl(endpoint, "chains/main/chain_id"),
      fetchImpl,
    ),
    readOnlyJson(
      `Rotini ${endpoint} head`,
      rpcUrl(endpoint, "chains/main/blocks/head/header"),
      fetchImpl,
    ),
    readOnlyJson(
      `Rotini ${endpoint} mempool`,
      rpcUrl(endpoint, "chains/main/mempool/pending_operations"),
      fetchImpl,
    ),
  ]);
  assert.equal(chainId, SHADOWNET_CHAIN_ID, `${endpoint} is not Shadownet`);
  const header = objectValue(headerValue, `${endpoint} head`);
  return {
    endpoint,
    chainId: String(chainId),
    headLevel: safeInteger(header.level, `${endpoint} head level`, 1),
    headTimestamp: canonicalTimestamp(header.timestamp, `${endpoint} head timestamp`),
    mempool,
    operationDisposition: mempoolDisposition(mempool, operationHash),
  };
}

function classifyObservation(
  tzkt: TzktAssessment,
  primary: RpcLaneObservation,
  fallback: RpcLaneObservation,
): { status: RotiniSubmittedReconciliationStatus; reason: string } {
  const dispositions = [primary.operationDisposition, fallback.operationDisposition];
  const hasActive = dispositions.includes("ACTIVE");
  const hasRejected = dispositions.includes("REJECTED");
  if (hasActive && hasRejected) {
    return {
      status: "AMBIGUOUS",
      reason: "Shadownet RPC lanes disagree between active and rejected mempool states",
    };
  }
  if (tzkt.classification === "APPLIED") {
    if (hasActive || hasRejected) {
      return {
        status: "AMBIGUOUS",
        reason: "TzKT applied state conflicts with an RPC mempool observation",
      };
    }
    if (
      primary.headLevel < (tzkt.level || 0) ||
      fallback.headLevel < (tzkt.level || 0)
    ) {
      return {
        status: "AMBIGUOUS",
        reason: "one Shadownet RPC head has not reached the TzKT applied level",
      };
    }
    return { status: "APPLIED", reason: tzkt.reason };
  }
  if (tzkt.classification === "FAILED") {
    return hasActive || hasRejected
      ? {
          status: "AMBIGUOUS",
          reason: "TzKT failure conflicts with an RPC mempool observation",
        }
      : { status: "FAILED", reason: tzkt.reason };
  }
  if (tzkt.classification === "PENDING") {
    return hasRejected
      ? {
          status: "AMBIGUOUS",
          reason: "TzKT pending state conflicts with an RPC rejection",
        }
      : { status: "PENDING", reason: tzkt.reason };
  }
  if (tzkt.classification === "ABSENT") {
    if (hasActive) {
      return {
        status: "PENDING",
        reason: "TzKT has not indexed the operation, but an RPC mempool still carries it",
      };
    }
    return {
      status: "AMBIGUOUS",
      reason: hasRejected
        ? "TzKT has no durable operation while an RPC mempool reports rejection"
        : "the durable hash is absent from both TzKT and both RPC mempools",
    };
  }
  return { status: "AMBIGUOUS", reason: tzkt.reason };
}

async function assertContractCodeOnBothRpcLanes(input: Readonly<{
  contractAddress: string;
  expectedCodeSha256: string;
  fetchImpl: ReadOnlyFetch;
}>): Promise<void> {
  const scripts = await Promise.all(
    SHADOWNET_RPC_ENDPOINTS.map((endpoint) =>
      readOnlyJson(
        `Rotini ${endpoint} contract script`,
        rpcUrl(
          endpoint,
          `chains/main/blocks/head/context/contracts/${encodeURIComponent(input.contractAddress)}/script`,
        ),
        input.fetchImpl,
      ),
    ),
  );
  const hashes = scripts.map((value, index) => {
    const script = objectValue(value, `${SHADOWNET_RPC_ENDPOINTS[index]} contract script`);
    return hashMichelsonScriptCode(script.code);
  });
  assert.deepEqual(
    hashes,
    [input.expectedCodeSha256, input.expectedCodeSha256],
    "both Shadownet RPC lanes must expose the exact current Rotini contract code",
  );
}

function observationDigest(input: Readonly<{
  pending: DurablePendingOperation;
  tzkt: TzktAssessment;
  primary: RpcLaneObservation;
  fallback: RpcLaneObservation;
}>): string {
  return sha256(deterministicJsonBytes({
    operationHash: input.pending.operationHash,
    descriptorSha256: input.pending.descriptorSha256,
    tzkt: {
      classification: input.tzkt.classification,
      reason: input.tzkt.reason,
      status: input.tzkt.status,
      level: input.tzkt.level ?? null,
      timestampUtc: input.tzkt.timestampUtc ?? null,
      contractAddress: input.tzkt.contractAddress ?? null,
    },
    rpc: [
      {
        endpoint: input.primary.endpoint,
        chainId: input.primary.chainId,
        headLevel: input.primary.headLevel,
        headTimestamp: input.primary.headTimestamp,
        operationDisposition: input.primary.operationDisposition,
      },
      {
        endpoint: input.fallback.endpoint,
        chainId: input.fallback.chainId,
        headLevel: input.fallback.headLevel,
        headTimestamp: input.fallback.headTimestamp,
        operationDisposition: input.fallback.operationDisposition,
      },
    ],
  }));
}

function resultBase(input: Readonly<{
  status: RotiniSubmittedReconciliationStatus;
  reason: string;
  runId: string;
  evidence: RotiniUiLiveCheckpointEvidence;
  pending: DurablePendingOperation;
  artifact: { rawSha256: string; codeSha256: string };
  observationSha256: string;
  tzkt: TzktAssessment;
  primary: RpcLaneObservation;
  fallback: RpcLaneObservation;
}>): Omit<
  RotiniSubmittedReconciliationResult,
  "checkpointMutation" | "receipt" | "sideEffects"
> {
  return {
    schema: "pastaprotocol-rotini-submitted-reconciliation@2",
    status: input.status,
    reason: input.reason,
    runId: input.runId,
    checkpointId: input.evidence.checkpointId,
    operationHash: input.pending.operationHash,
    actor: input.pending.actor,
    action: input.pending.action,
    externalMethods: ["GET"],
    observations: {
      tzktStatus: input.tzkt.status,
      primaryRpcHeadLevel: input.primary.headLevel,
      fallbackRpcHeadLevel: input.fallback.headLevel,
      primaryMempool: input.primary.operationDisposition,
      fallbackMempool: input.fallback.operationDisposition,
    },
    integrity: {
      intentSha256: input.evidence.intentSha256,
      checkpointBeforeSha256: input.evidence.chainHeadSha256,
      contractArtifactSha256: input.artifact.rawSha256,
      contractCodeSha256: input.artifact.codeSha256,
      observationSha256: input.observationSha256,
    },
  };
}

function assertOneConfirmationAppended(input: Readonly<{
  before: RotiniUiLiveCheckpointEvidence;
  after: RotiniUiLiveCheckpointEvidence;
  actor: RotiniUiLiveCheckpointActor;
}>): RotiniUiLiveCheckpointArtifact {
  assert.equal(
    input.after.summary.completedOperations,
    input.before.summary.completedOperations + 1,
    "Rotini reconciliation did not advance exactly one operation",
  );
  assert.equal(input.after.summary.pendingOperation, null, "Rotini reconciliation left a pending operation");
  assert.equal(input.after.summary.status, "ACTIVE", "Rotini reconciliation unexpectedly finalized the checkpoint");
  assert.equal(input.after.intentSha256, input.before.intentSha256, "Rotini reconciliation changed intent");
  const beforeByPath = new Map(input.before.artifacts.map((artifact) => [artifact.path, artifact]));
  for (const artifact of input.before.artifacts) {
    assert.deepEqual(
      input.after.artifacts.find((candidate) => candidate.path === artifact.path),
      artifact,
      `Rotini reconciliation changed existing artifact ${artifact.path}`,
    );
  }
  const appended = input.after.artifacts.filter((artifact) => !beforeByPath.has(artifact.path));
  assert.equal(appended.length, 1, "Rotini reconciliation must append exactly one checkpoint artifact");
  assert.match(
    appended[0].path,
    new RegExp(`^events/[0-9]{6}-confirmed-${input.actor}\\.json$`),
    "Rotini reconciliation appended a non-CONFIRMED artifact",
  );
  return appended[0];
}

export function assertRotiniSubmittedReconciliationAllowed(
  environment: Record<string, string | undefined>,
): string {
  assert.equal(
    environment[ROTINI_SUBMITTED_RECONCILE_FLAG],
    "1",
    `${ROTINI_SUBMITTED_RECONCILE_FLAG}=1 is required`,
  );
  assert.equal(
    (environment.TEZOS_NETWORK || "shadownet").toLowerCase(),
    "shadownet",
    "Rotini submitted-operation reconciliation only permits Shadownet",
  );
  const runRoot = environment[ROTINI_SUBMITTED_RECONCILE_OUTPUT_ENV]?.trim();
  assert.ok(runRoot, `${ROTINI_SUBMITTED_RECONCILE_OUTPUT_ENV} is required`);
  const resolved = path.resolve(runRoot);
  assert.notEqual(
    path.basename(resolved),
    ROTINI_LEGACY_SUBMITTED_RECONCILE_RUN_ID,
    "the historical 20260722b one-off reconciliation lane is quarantined",
  );
  for (const forbidden of [
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE",
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_RESUME",
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE",
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE",
    "PASTA_SHADOWNET_ROTINI_READONLY_FINALIZE",
    "PASTA_SHADOWNET_RPC",
    "PASTA_SHADOWNET_RPC_FALLBACK",
    "PASTA_SHADOWNET_TZKT_API",
  ]) {
    assert.ok(
      !environment[forbidden]?.trim(),
      `Rotini submitted-operation reconciliation forbids ${forbidden}`,
    );
  }
  return resolved;
}

export async function reconcileRotiniSubmittedOperation(
  runRoot: string,
  io: RotiniSubmittedReconcilerIo = {},
): Promise<RotiniSubmittedReconciliationResult> {
  const fetchImpl = io.fetchImpl ?? globalThis.fetch;
  assert.equal(
    typeof fetchImpl,
    "function",
    "Rotini submitted-operation reconciliation requires GET transport",
  );
  const readFileImpl = io.readFileImpl ?? readFile;
  const lstatImpl = io.lstatImpl ?? lstat;
  const realpathImpl = io.realpathImpl ?? realpath;
  const openCheckpoint = io.openCheckpoint ?? openRotiniUiLiveCheckpoint;

  const resolvedRunRoot = path.resolve(runRoot);
  assert.notEqual(
    path.basename(resolvedRunRoot),
    ROTINI_LEGACY_SUBMITTED_RECONCILE_RUN_ID,
    "the historical 20260722b one-off reconciliation lane is quarantined",
  );
  const appRoot = path.join(resolvedRunRoot, "rotini");
  const checkpointRoot = path.join(appRoot, CHECKPOINT_RELATIVE);
  await assertRealDirectory(resolvedRunRoot, "explicit Pasta proof run root", lstatImpl);
  await assertRealDirectory(appRoot, "Rotini lane", lstatImpl);
  await assertRealDirectory(checkpointRoot, "Rotini checkpoint root", lstatImpl);

  const checkpoint = await openCheckpoint(checkpointRoot);
  const loaded = await loadDurablePendingOperation({
    runRoot: resolvedRunRoot,
    checkpointRoot,
    checkpoint,
    readFileImpl,
    lstatImpl,
    realpathImpl,
  });
  const operationResource = loaded.pending.action === "originate"
    ? "originations"
    : "transactions";
  const [tzktValue, primary, fallback] = await Promise.all([
    readOnlyJson(
      `Rotini TzKT exact ${loaded.pending.action}`,
      `${normalizeBase(SHADOWNET_TZKT_ENDPOINT)}/operations/${operationResource}/${encodeURIComponent(loaded.pending.operationHash)}`,
      fetchImpl,
    ),
    readRpcLane(SHADOWNET_RPC_ENDPOINTS[0], loaded.pending.operationHash, fetchImpl),
    readRpcLane(SHADOWNET_RPC_ENDPOINTS[1], loaded.pending.operationHash, fetchImpl),
  ]);
  const tzkt = assessTzktOperation(tzktValue, loaded.pending);
  const classification = classifyObservation(tzkt, primary, fallback);
  const observationSha256 = observationDigest({
    pending: loaded.pending,
    tzkt,
    primary,
    fallback,
  });
  const base = resultBase({
    ...classification,
    runId: path.basename(resolvedRunRoot),
    evidence: loaded.evidence,
    pending: loaded.pending,
    artifact: loaded.artifact,
    observationSha256,
    tzkt,
    primary,
    fallback,
  });

  const freshCheckpoint = await openCheckpoint(checkpointRoot);
  const freshEvidence = await freshCheckpoint.validatedEvidence();
  assertEvidenceSame(loaded.evidence, freshEvidence);
  if (classification.status !== "APPLIED") {
    return {
      ...base,
      checkpointMutation: "NONE",
      sideEffects: {
        signerLoaded: false,
        chainWrites: 0,
        ipfsWrites: 0,
        retriesOfWrites: 0,
        checkpointConfirmationEvents: 0,
      },
    };
  }

  const contractAddress = addressValue(
    tzkt.contractAddress ?? loaded.pending.contractAddress,
    "Rotini applied operation contract",
    true,
  );
  await assertContractCodeOnBothRpcLanes({
    contractAddress,
    expectedCodeSha256: loaded.artifact.codeSha256,
    fetchImpl,
  });
  const receipt: PastaUiLivePublicReceipt = {
    schema: "pastaprotocol-ui-live-receipt@1",
    sequence: loaded.pending.receiptSequence,
    timestampUtc: stringValue(tzkt.timestampUtc, "Rotini applied timestamp"),
    action: loaded.pending.action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: loaded.pending.actorAddress,
    contractAddress,
    operationHash: loaded.pending.operationHash,
    entrypoints: loaded.pending.entrypoints,
  };
  await freshCheckpoint.onReceipt(loaded.pending.actor, receipt);
  const after = await freshCheckpoint.validatedEvidence();
  const appendedArtifact = assertOneConfirmationAppended({
    before: freshEvidence,
    after,
    actor: loaded.pending.actor,
  });
  return {
    ...base,
    checkpointMutation: "CONFIRMED_APPENDED",
    receipt,
    integrity: {
      ...base.integrity,
      checkpointAfterSha256: after.chainHeadSha256,
      appendedArtifact,
    },
    sideEffects: {
      signerLoaded: false,
      chainWrites: 0,
      ipfsWrites: 0,
      retriesOfWrites: 0,
      checkpointConfirmationEvents: 1,
    },
  };
}

async function main(): Promise<void> {
  const runRoot = assertRotiniSubmittedReconciliationAllowed(process.env);
  const result = await reconcileRotiniSubmittedOperation(runRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "APPLIED") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
