import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import BigNumber from "bignumber.js";
import { MichelsonMap } from "@taquito/taquito";

import type {
  PastaUiLivePinProof,
  PastaUiLivePreparedOperation,
  PastaUiLivePublicReceipt,
  PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import { deterministicJsonBytes, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

export const ROTINI_UI_LIVE_CHECKPOINT_INTENT_SCHEMA = "pastaprotocol-rotini-ui-live-checkpoint-intent@1";
export const ROTINI_UI_LIVE_CHECKPOINT_EVENT_SCHEMA = "pastaprotocol-rotini-ui-live-checkpoint-event@1";
export const ROTINI_UI_LIVE_CHECKPOINT_PIN_PROOF_SCHEMA = "pastaprotocol-rotini-ui-live-checkpoint-pin-proof@1";
export const ROTINI_UI_LIVE_CHECKPOINT_FINAL_SCHEMA = "pastaprotocol-rotini-ui-live-checkpoint-final@1";

const ACTORS = ["creator", "collector"] as const;
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SAFE_FILE_NAME = /^[^\\/\0\r\n]{1,255}$/;
const SAFE_MIME = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const HASH_RE = /^[0-9a-f]{64}$/;
const ADDRESS_RE = /^(?:tz[1-4]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
const OPERATION_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const MAX_PIN_BYTES = 2_000_000;
const MAX_PINS = 20;
const MAX_SERIALIZED_BYTES = 2_500_000;
const MAX_DEPTH = 64;
const MAX_NODES = 50_000;
const MAX_COLLECTION_LENGTH = 4_096;
const MAX_STRING_BYTES = 2_000_000;
const PROHIBITED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const CREDENTIAL_KEY_RE = /^(?:api[_-]?key|authorization|mnemonic|passphrase|password|private[_-]?key|secret[_-]?key|seed[_-]?phrase)$/i;
const PRIVATE_KEY_RE = /\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{40,100}\b/;
const PEM_PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export type RotiniUiLiveCheckpointActor = typeof ACTORS[number];

export type RotiniUiLiveExpectedOperation = Readonly<{
  globalOrdinal: number;
  actor: RotiniUiLiveCheckpointActor;
  operationSequence: number;
  action: "originate" | "call";
  entrypoint?: "create_project" | "reserve_iteration" | "finalize_iteration";
}>;

export const ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX: readonly RotiniUiLiveExpectedOperation[] = Object.freeze([
  { globalOrdinal: 1, actor: "creator", operationSequence: 1, action: "originate" },
  { globalOrdinal: 2, actor: "creator", operationSequence: 2, action: "call", entrypoint: "create_project" },
  { globalOrdinal: 3, actor: "creator", operationSequence: 3, action: "call", entrypoint: "create_project" },
  { globalOrdinal: 4, actor: "creator", operationSequence: 4, action: "call", entrypoint: "create_project" },
  { globalOrdinal: 5, actor: "collector", operationSequence: 1, action: "call", entrypoint: "reserve_iteration" },
  { globalOrdinal: 6, actor: "collector", operationSequence: 2, action: "call", entrypoint: "finalize_iteration" },
  { globalOrdinal: 7, actor: "collector", operationSequence: 3, action: "call", entrypoint: "reserve_iteration" },
  { globalOrdinal: 8, actor: "collector", operationSequence: 4, action: "call", entrypoint: "finalize_iteration" },
  { globalOrdinal: 9, actor: "collector", operationSequence: 5, action: "call", entrypoint: "reserve_iteration" },
  { globalOrdinal: 10, actor: "collector", operationSequence: 6, action: "call", entrypoint: "finalize_iteration" },
]);

export type CreateRotiniUiLiveCheckpointInput = {
  checkpointRoot: string;
  runId: string;
  createdAt?: string;
  chainId?: string;
  actors: Record<RotiniUiLiveCheckpointActor, string>;
  contractIdentity: {
    artifactPath: string;
    rawArtifactSha256: string;
    canonicalMichelsonCodeSha256: string;
  };
};

export type RotiniUiLiveCheckpointArtifact = {
  path: string;
  sha256: string;
  byteLength: number;
};

export type RotiniUiLiveCheckpointFinalization = {
  status: "FINALIZED";
  checkpointId: string;
  intentSha256: string;
  finalSha256: string;
  counts: {
    actors: Record<RotiniUiLiveCheckpointActor, number>;
    operations: number;
    pins: number;
    nonOperationReceipts: number;
    events: number;
  };
  artifacts: RotiniUiLiveCheckpointArtifact[];
};

export type RotiniUiLiveCheckpointEvidence = {
  checkpointId: string;
  intentSha256: string;
  chainHeadSha256: string;
  intent: Readonly<Record<string, unknown>>;
  summary: RotiniUiLiveCheckpointSummary;
  artifacts: RotiniUiLiveCheckpointArtifact[];
};

type CheckpointIntent = {
  schema: typeof ROTINI_UI_LIVE_CHECKPOINT_INTENT_SCHEMA;
  status: "IMMUTABLE";
  checkpointId: string;
  runId: string;
  createdAt: string;
  network: { name: "shadownet"; chainId: string };
  actors: Record<RotiniUiLiveCheckpointActor, string>;
  contractIdentity: {
    artifactPath: string;
    rawArtifactSha256: string;
    canonicalMichelsonCodeSha256: string;
  };
  operationMatrixSha256: string;
  operationMatrix: readonly RotiniUiLiveExpectedOperation[];
};

type PendingOperation = {
  expected: RotiniUiLiveExpectedOperation;
  phase: "PREPARED" | "SUBMITTED";
  descriptorSha256: string;
  preparedRecordSha256: string;
  operationHash?: string;
  submittedRecordSha256?: string;
};

type PendingPin = {
  sequence: number;
  actor: RotiniUiLiveCheckpointActor;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array | null;
  sha256: string;
  byteLength: number;
  preparedRecordSha256: string;
};

type PinReceiptExpectation = {
  actor: RotiniUiLiveCheckpointActor;
  sequence: number;
  proof: PastaUiLivePinProof;
};

export type RotiniUiLiveCheckpointSummary = {
  status: "ACTIVE" | "FINALIZED";
  completedOperations: number;
  pins: number;
  nonOperationReceipts: number;
  pendingOperation: null | {
    actor: RotiniUiLiveCheckpointActor;
    operationSequence: number;
    phase: "PREPARED" | "SUBMITTED";
    operationHash?: string;
  };
  pendingPin: null | { actor: RotiniUiLiveCheckpointActor; fileName: string; sha256: string };
  pendingPinReceipts: number[];
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_RE.test(value)) throw new Error(`${label} is not a SHA-256 digest`);
  return value;
}

function requireAddress(value: unknown, label: string, originated = false): string {
  if (typeof value !== "string" || !ADDRESS_RE.test(value) || (originated && !value.startsWith("KT1"))) {
    throw new Error(`${label} is not a valid ${originated ? "originated " : ""}Tezos address`);
  }
  return value;
}

function requireActor(value: unknown): RotiniUiLiveCheckpointActor {
  if (value !== "creator" && value !== "collector") throw new Error("Rotini checkpoint actor is invalid");
  return value;
}

function requireInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} is invalid`);
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  return value;
}

function requireOperationHash(value: unknown): string {
  if (typeof value !== "string" || !OPERATION_RE.test(value)) throw new Error("Rotini checkpoint operation hash is invalid");
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function credentialScanString(value: string, label: string): void {
  if (PRIVATE_KEY_RE.test(value) || PEM_PRIVATE_KEY_RE.test(value)) {
    throw new Error(`${label} contains signer credential material`);
  }
}

function exactProjection(value: unknown): JsonValue {
  let nodes = 0;
  let stringBytes = 0;
  const ancestors = new Set<object>();
  const visit = (candidate: unknown, depth: number, label: string): JsonValue => {
    nodes += 1;
    if (nodes > MAX_NODES) throw new Error("Rotini checkpoint value exceeds the node limit");
    if (depth > MAX_DEPTH) throw new Error("Rotini checkpoint value exceeds the depth limit");
    if (candidate === null || typeof candidate === "boolean") return candidate;
    if (typeof candidate === "string") {
      stringBytes += Buffer.byteLength(candidate);
      if (stringBytes > MAX_STRING_BYTES) throw new Error("Rotini checkpoint value exceeds the string-byte limit");
      credentialScanString(candidate, label);
      return candidate;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate) || !Number.isSafeInteger(candidate)) {
        throw new Error(`${label} must use bigint or BigNumber for exact non-safe integers`);
      }
      return candidate;
    }
    if (typeof candidate === "bigint") return { type: "integer", value: candidate.toString(10) };
    if (typeof candidate === "undefined" || typeof candidate === "function" || typeof candidate === "symbol") {
      throw new Error(`${label} is not checkpoint-serializable`);
    }
    if (!candidate || typeof candidate !== "object") throw new Error(`${label} is not checkpoint-serializable`);
    if (BigNumber.isBigNumber(candidate)) {
      const decimal = candidate.toFixed();
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(decimal)) throw new Error(`${label} BigNumber is not finite`);
      return { type: decimal.includes(".") ? "decimal" : "integer", value: decimal };
    }
    if (candidate instanceof Uint8Array) return { type: "bytes", encoding: "base64", value: Buffer.from(candidate).toString("base64") };
    if (ancestors.has(candidate)) throw new Error("Rotini checkpoint value contains a cycle");
    ancestors.add(candidate);
    try {
      if (candidate instanceof MichelsonMap) {
        const rawEntries = [...candidate.entries()];
        if (rawEntries.length > MAX_COLLECTION_LENGTH) throw new Error("Rotini checkpoint MichelsonMap is too large");
        const entries = rawEntries.map(([key, child], index) => {
          const projectedKey = visit(key, depth + 1, `${label}.key[${index}]`);
          const projectedValue = visit(child, depth + 1, `${label}.value[${index}]`);
          return {
            key: projectedKey,
            value: projectedValue,
            sortKey: Buffer.from(deterministicJsonBytes(projectedKey)).toString("hex"),
          };
        });
        entries.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
        return { type: "michelson-map", entries: entries.map((entry) => [entry.key, entry.value]) };
      }
      if (Array.isArray(candidate)) {
        if (candidate.length > MAX_COLLECTION_LENGTH) throw new Error("Rotini checkpoint array is too large");
        return candidate.map((child, index) => visit(child, depth + 1, `${label}[${index}]`));
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const keys = Object.keys(descriptors).sort();
      if (keys.length > MAX_COLLECTION_LENGTH) throw new Error("Rotini checkpoint object is too large");
      const output: JsonObject = {};
      for (const key of keys) {
        if (PROHIBITED_KEYS.has(key)) throw new Error(`Rotini checkpoint object key is prohibited: ${key}`);
        if (CREDENTIAL_KEY_RE.test(key)) throw new Error(`Rotini checkpoint refuses credential field: ${key}`);
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor)) throw new Error(`Rotini checkpoint refuses accessor property: ${key}`);
        output[key] = visit(descriptor.value, depth + 1, `${label}.${key}`);
      }
      return output;
    } finally {
      ancestors.delete(candidate);
    }
  };
  const projected = visit(value, 0, "checkpoint value");
  const bytes = deterministicJsonBytes(projected);
  if (bytes.byteLength > MAX_SERIALIZED_BYTES) throw new Error("Rotini checkpoint value exceeds the serialized-byte limit");
  return projected;
}

function assertNoCredentialBytes(bytes: Uint8Array, label: string): void {
  credentialScanString(Buffer.from(bytes).toString("utf8"), label);
}

function canonicalBytes(value: unknown): Uint8Array {
  const bytes = deterministicJsonBytes(exactProjection(value));
  if (bytes.byteLength > MAX_SERIALIZED_BYTES) throw new Error("Rotini checkpoint record exceeds the byte limit");
  return bytes;
}

function safeRepositoryPath(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 1_024 || path.isAbsolute(value)) {
    throw new Error("Rotini checkpoint contract artifact path must be repository-relative");
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Rotini checkpoint contract artifact path contains traversal");
  }
  return normalized;
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function durableExclusiveWrite(filePath: string, bytes: Uint8Array): Promise<void> {
  const parent = path.dirname(filePath);
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) throw new Error(`Rotini checkpoint parent is not a real directory: ${parent}`);
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(parent);
}

async function durableCreateDirectories(checkpointRoot: string): Promise<void> {
  const resolved = path.resolve(checkpointRoot);
  const parent = path.dirname(resolved);
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) throw new Error("Rotini checkpoint parent must be a real directory");
  // The direct parent is the operator-owned app artifacts directory (or a test
  // fixture directory) and must itself be real. Do not compare every ancestor
  // against realpath: macOS intentionally aliases /var to /private/var.
  try {
    await mkdir(resolved, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Rotini checkpoint exists; refusing overwrite: ${resolved}`);
    throw error;
  }
  await syncDirectory(parent);
  await mkdir(path.join(resolved, "events"), { mode: 0o700 });
  await mkdir(path.join(resolved, "pins"), { mode: 0o700 });
  await syncDirectory(resolved);
}

async function canonicalJsonFile(filePath: string): Promise<{ value: JsonObject; bytes: Uint8Array; sha256: string }> {
  const info = await lstat(filePath);
  if (info.isSymbolicLink()) throw new Error(`Rotini checkpoint JSON is a symbolic link: ${filePath}`);
  if (!info.isFile()) throw new Error(`Rotini checkpoint JSON is not a regular file: ${filePath}`);
  const bytes = await readFile(filePath);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Rotini checkpoint JSON is invalid: ${filePath}`);
  }
  const canonical = deterministicJsonBytes(value);
  if (!Buffer.from(bytes).equals(Buffer.from(canonical))) throw new Error(`Rotini checkpoint JSON is not canonical: ${filePath}`);
  return { value: requireRecord(value, "Rotini checkpoint JSON") as JsonObject, bytes, sha256: sha256(bytes) };
}

async function artifactInventory(checkpointRoot: string): Promise<RotiniUiLiveCheckpointArtifact[]> {
  const output: RotiniUiLiveCheckpointArtifact[] = [];
  const visit = async (directory: string): Promise<void> => {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Rotini checkpoint contains a symbolic link or non-directory: ${directory}`);
    for (const name of (await readdir(directory)).sort()) {
      const absolute = path.join(directory, name);
      const child = await lstat(absolute);
      if (child.isSymbolicLink()) throw new Error(`Rotini checkpoint contains a symbolic link: ${absolute}`);
      if (child.isDirectory()) await visit(absolute);
      else if (child.isFile()) {
        const bytes = await readFile(absolute);
        output.push({
          path: path.relative(checkpointRoot, absolute).split(path.sep).join("/"),
          sha256: sha256(bytes),
          byteLength: bytes.byteLength,
        });
      } else throw new Error(`Rotini checkpoint contains a non-file artifact: ${absolute}`);
    }
  };
  await visit(checkpointRoot);
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

function matrixSha256(): string {
  return sha256(deterministicJsonBytes(ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX));
}

function buildIntent(input: CreateRotiniUiLiveCheckpointInput): CheckpointIntent {
  if (!SAFE_RUN_ID.test(input.runId)) throw new Error("Rotini checkpoint run id is invalid");
  const chainId = input.chainId ?? SHADOWNET_CHAIN_ID;
  if (chainId !== SHADOWNET_CHAIN_ID) throw new Error("Rotini checkpoint only permits Shadownet");
  const createdAt = requireTimestamp(input.createdAt ?? new Date().toISOString(), "Rotini checkpoint creation time");
  const core = {
    schema: ROTINI_UI_LIVE_CHECKPOINT_INTENT_SCHEMA as typeof ROTINI_UI_LIVE_CHECKPOINT_INTENT_SCHEMA,
    status: "IMMUTABLE" as const,
    runId: input.runId,
    createdAt,
    network: { name: "shadownet" as const, chainId },
    actors: {
      creator: requireAddress(input.actors.creator, "Rotini creator"),
      collector: requireAddress(input.actors.collector, "Rotini collector"),
    },
    contractIdentity: {
      artifactPath: safeRepositoryPath(input.contractIdentity.artifactPath),
      rawArtifactSha256: requireHash(input.contractIdentity.rawArtifactSha256, "Rotini raw contract artifact hash"),
      canonicalMichelsonCodeSha256: requireHash(
        input.contractIdentity.canonicalMichelsonCodeSha256,
        "Rotini canonical Michelson code hash",
      ),
    },
    operationMatrixSha256: matrixSha256(),
    operationMatrix: ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
  };
  const checkpointId = sha256(canonicalBytes(core));
  return { ...core, checkpointId };
}

function validateIntent(value: JsonObject): CheckpointIntent {
  if (value.schema !== ROTINI_UI_LIVE_CHECKPOINT_INTENT_SCHEMA || value.status !== "IMMUTABLE") {
    throw new Error("Rotini checkpoint intent schema/status is invalid");
  }
  const network = requireRecord(value.network, "Rotini checkpoint network");
  const actors = requireRecord(value.actors, "Rotini checkpoint actors");
  const identity = requireRecord(value.contractIdentity, "Rotini checkpoint contract identity");
  const matrix = value.operationMatrix;
  if (
    !Array.isArray(matrix) ||
    !Buffer.from(deterministicJsonBytes(matrix)).equals(Buffer.from(deterministicJsonBytes(ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX)))
  ) {
    throw new Error("Rotini checkpoint operation matrix drift");
  }
  const rebuilt = buildIntent({
    checkpointRoot: ".",
    runId: String(value.runId || ""),
    createdAt: String(value.createdAt || ""),
    chainId: String(network.chainId || ""),
    actors: { creator: String(actors.creator || ""), collector: String(actors.collector || "") },
    contractIdentity: {
      artifactPath: String(identity.artifactPath || ""),
      rawArtifactSha256: String(identity.rawArtifactSha256 || ""),
      canonicalMichelsonCodeSha256: String(identity.canonicalMichelsonCodeSha256 || ""),
    },
  });
  if (value.operationMatrixSha256 !== rebuilt.operationMatrixSha256 || value.checkpointId !== rebuilt.checkpointId) {
    throw new Error("Rotini checkpoint intent hash drift");
  }
  return rebuilt;
}

function actorCounts(matrix = ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX): Record<RotiniUiLiveCheckpointActor, number> {
  return {
    creator: matrix.filter((operation) => operation.actor === "creator").length,
    collector: matrix.filter((operation) => operation.actor === "collector").length,
  };
}

function proofRecord(proof: PastaUiLivePinProof): JsonObject {
  if (!proof || typeof proof !== "object") throw new Error("Rotini checkpoint pin proof is missing");
  if (typeof proof.cid !== "string" || !/^[A-Za-z0-9]{20,128}$/.test(proof.cid)) throw new Error("Rotini checkpoint CID is invalid");
  if (proof.uri !== `ipfs://${proof.cid}`) throw new Error("Rotini checkpoint IPFS URI differs from CID");
  if (typeof proof.fileName !== "string" || !SAFE_FILE_NAME.test(proof.fileName)) throw new Error("Rotini checkpoint pin proof file name is unsafe");
  if (typeof proof.mimeType !== "string" || !SAFE_MIME.test(proof.mimeType)) throw new Error("Rotini checkpoint pin proof MIME type is invalid");
  requireInteger(proof.byteLength, "Rotini checkpoint pin proof byte length", 1);
  requireHash(proof.sha256, "Rotini checkpoint pin proof hash");
  for (const [label, rawUrl] of [["local gateway", proof.localGatewayUrl], ["public gateway", proof.publicGatewayUrl]] as const) {
    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch { throw new Error(`Rotini checkpoint ${label} URL is invalid`); }
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error(`Rotini checkpoint ${label} URL exposes credentials`);
  }
  if (proof.publicGatewayVerified !== true) throw new Error("Rotini checkpoint pin proof was not publicly verified");
  requireInteger(proof.verificationAttempts, "Rotini checkpoint verification attempts", 1);
  return exactProjection(proof) as JsonObject;
}

export class RotiniUiLiveCheckpoint {
  private eventIndex = 0;
  private pinSequence = 0;
  private nonOperationReceipts = 0;
  private completedOperations = 0;
  private readonly actorCompleted: Record<RotiniUiLiveCheckpointActor, number> = { creator: 0, collector: 0 };
  private readonly operationHashes = new Set<string>();
  private readonly pendingPinReceipts: PinReceiptExpectation[] = [];
  private readonly persistedPinReferences = new Map<number, {
    actor: RotiniUiLiveCheckpointActor;
    bytes: Record<string, unknown>;
    proof: Record<string, unknown>;
  }>();
  private readonly persistedPreparedPinReferences = new Map<number, {
    actor: RotiniUiLiveCheckpointActor;
    source: Record<string, unknown>;
    bytes: Record<string, unknown>;
    preparedRecordSha256: string;
  }>();
  private readonly persistedPinReceiptRecords = new Map<number, {
    actor: RotiniUiLiveCheckpointActor;
    receipt: Record<string, unknown>;
  }>();
  private readonly unreceiptedPersistedPins = new Set<number>();
  private contractAddress = "";
  private pendingOperation: PendingOperation | null = null;
  private pendingPin: PendingPin | null = null;
  private chainHeadSha256: string;
  private finalized = false;
  private finalSha256 = "";
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly checkpointRoot: string,
    readonly intent: CheckpointIntent,
    readonly intentSha256: string,
  ) {
    this.chainHeadSha256 = intentSha256;
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private ensureWritable(): void {
    if (this.finalized) throw new Error("Rotini checkpoint is already finalized");
  }

  private expectedNext(): RotiniUiLiveExpectedOperation {
    const expected = ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[this.completedOperations];
    if (!expected) throw new Error("Rotini checkpoint has no remaining signer operations");
    return expected;
  }

  private assertActorOperation(
    actor: RotiniUiLiveCheckpointActor,
    operation: { operationSequence: number; signerAddress: string; chainId: string },
  ): RotiniUiLiveExpectedOperation {
    const expected = this.expectedNext();
    if (actor !== expected.actor) throw new Error(`Rotini checkpoint expected ${expected.actor} at operation ${expected.globalOrdinal}`);
    if (operation.operationSequence !== expected.operationSequence) {
      throw new Error(`Rotini checkpoint expected ${actor} operation sequence ${expected.operationSequence}`);
    }
    if (operation.signerAddress !== this.intent.actors[actor]) throw new Error(`Rotini checkpoint ${actor} signer drift`);
    if (operation.chainId !== this.intent.network.chainId) throw new Error("Rotini checkpoint chain id drift");
    return expected;
  }

  private bindContract(address: unknown): string {
    const validated = requireAddress(address, "Rotini originated contract", true);
    if (this.contractAddress && this.contractAddress !== validated) throw new Error("Rotini checkpoint originated contract drift");
    this.contractAddress = validated;
    return validated;
  }

  private sanitizeOperation(
    expected: RotiniUiLiveExpectedOperation,
    input: PastaUiLivePreparedOperation | PastaUiLiveSubmittedOperation,
  ): { operation: JsonObject; descriptorSha256: string } {
    if (input.action !== expected.action) {
      throw new Error(`Rotini checkpoint expected ${expected.action === "originate" ? "an origination" : expected.entrypoint}`);
    }
    const expectedEntrypoints = expected.entrypoint ? [expected.entrypoint] : [];
    if (JSON.stringify(input.entrypoints) !== JSON.stringify(expectedEntrypoints)) throw new Error("Rotini checkpoint entrypoint matrix drift");
    if (expected.action === "originate") {
      if (input.descriptor.kind !== "originate") throw new Error("Rotini checkpoint expected an origination descriptor");
      if (hashMichelsonScriptCode(input.descriptor.code) !== this.intent.contractIdentity.canonicalMichelsonCodeSha256) {
        throw new Error("Rotini checkpoint canonical Michelson contract identity drift");
      }
    } else {
      if (input.descriptor.kind !== "call") throw new Error("Rotini checkpoint expected a call descriptor");
      if (!this.contractAddress) throw new Error("Rotini checkpoint call arrived before the origination was confirmed");
      if (input.contractAddress !== this.contractAddress || input.descriptor.call.contractAddress !== this.contractAddress) {
        throw new Error("Rotini checkpoint call target drift");
      }
      if (input.descriptor.call.entrypoint !== expected.entrypoint) throw new Error("Rotini checkpoint call entrypoint drift");
    }
    const descriptor = exactProjection(input.descriptor) as JsonObject;
    const descriptorSha256 = sha256(deterministicJsonBytes(descriptor));
    const operation = exactProjection({
      action: input.action,
      chainId: input.chainId,
      signerAddress: input.signerAddress,
      ...(input.contractAddress ? { contractAddress: input.contractAddress } : {}),
      entrypoints: input.entrypoints,
      descriptor,
    }) as JsonObject;
    return { operation, descriptorSha256 };
  }

  private async appendEvent(
    phase: "PREPARED" | "SUBMITTED" | "CONFIRMED" | "PIN_PREPARED" | "PIN_CONFIRMED" | "RECEIPT",
    actor: RotiniUiLiveCheckpointActor,
    timestampUtc: string,
    payload: Record<string, unknown>,
  ): Promise<{ sha256: string; path: string }> {
    const index = this.eventIndex + 1;
    const record = exactProjection({
      schema: ROTINI_UI_LIVE_CHECKPOINT_EVENT_SCHEMA,
      eventIndex: index,
      phase,
      timestampUtc: requireTimestamp(timestampUtc, `Rotini ${phase} timestamp`),
      actor,
      checkpointId: this.intent.checkpointId,
      intentSha256: this.intentSha256,
      previousRecordSha256: this.chainHeadSha256,
      ...payload,
    }) as JsonObject;
    const bytes = deterministicJsonBytes(record);
    if (bytes.byteLength > MAX_SERIALIZED_BYTES) throw new Error("Rotini checkpoint event exceeds the byte limit");
    const name = `${String(index).padStart(6, "0")}-${phase.toLowerCase()}-${actor}.json`;
    const relative = `events/${name}`;
    await durableExclusiveWrite(path.join(this.checkpointRoot, "events", name), bytes);
    const digest = sha256(bytes);
    this.eventIndex = index;
    this.chainHeadSha256 = digest;
    return { sha256: digest, path: relative };
  }

  beforeOperationSubmit(actor: RotiniUiLiveCheckpointActor, input: PastaUiLivePreparedOperation): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      actor = requireActor(actor);
      if (this.pendingOperation) throw new Error("Rotini checkpoint requires pending operation reconciliation before another PREPARED event");
      if (input.status !== "PREPARED") throw new Error("Rotini checkpoint beforeOperationSubmit requires PREPARED input");
      const expected = this.assertActorOperation(actor, input);
      const sanitized = this.sanitizeOperation(expected, input);
      const appended = await this.appendEvent("PREPARED", actor, input.timestampUtc, {
        globalOrdinal: expected.globalOrdinal,
        operationSequence: expected.operationSequence,
        descriptorSha256: sanitized.descriptorSha256,
        operation: sanitized.operation,
      });
      this.pendingOperation = {
        expected,
        phase: "PREPARED",
        descriptorSha256: sanitized.descriptorSha256,
        preparedRecordSha256: appended.sha256,
      };
    });
  }

  onOperationSubmitted(actor: RotiniUiLiveCheckpointActor, input: PastaUiLiveSubmittedOperation): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      actor = requireActor(actor);
      const pending = this.pendingOperation;
      if (!pending || pending.phase !== "PREPARED") throw new Error("Rotini checkpoint SUBMITTED event has no matching PREPARED event");
      if (input.status !== "SUBMITTED") throw new Error("Rotini checkpoint onOperationSubmitted requires SUBMITTED input");
      this.assertActorOperation(actor, input);
      const sanitized = this.sanitizeOperation(pending.expected, input);
      if (sanitized.descriptorSha256 !== pending.descriptorSha256) throw new Error("Rotini SUBMITTED descriptor differs from PREPARED intent");
      const operationHash = requireOperationHash(input.operationHash);
      if (this.operationHashes.has(operationHash)) throw new Error("Rotini checkpoint operation hash was already submitted");
      if (pending.expected.action === "originate" && input.contractAddress) this.bindContract(input.contractAddress);
      const appended = await this.appendEvent("SUBMITTED", actor, input.timestampUtc, {
        globalOrdinal: pending.expected.globalOrdinal,
        operationSequence: pending.expected.operationSequence,
        descriptorSha256: pending.descriptorSha256,
        preparedRecordSha256: pending.preparedRecordSha256,
        operationHash,
        ...(input.contractAddress ? { contractAddress: input.contractAddress } : {}),
      });
      this.operationHashes.add(operationHash);
      this.pendingOperation = {
        ...pending,
        phase: "SUBMITTED",
        operationHash,
        submittedRecordSha256: appended.sha256,
      };
    });
  }

  beforePin(
    actor: RotiniUiLiveCheckpointActor,
    input: { bytes: Uint8Array; fileName: string; mimeType: string },
  ): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      actor = requireActor(actor);
      if (this.pendingPin) throw new Error("Rotini checkpoint requires the pending pin to finish before another pin");
      if (this.pinSequence >= MAX_PINS) throw new Error(`Rotini checkpoint pin limit is ${MAX_PINS}`);
      if (!SAFE_FILE_NAME.test(input.fileName)) throw new Error("Rotini checkpoint pin file name is unsafe");
      if (!SAFE_MIME.test(input.mimeType)) throw new Error("Rotini checkpoint pin MIME type is invalid");
      const bytes = Uint8Array.from(input.bytes);
      if (bytes.byteLength < 1 || bytes.byteLength > MAX_PIN_BYTES) throw new Error("Rotini checkpoint pin byte length is invalid");
      assertNoCredentialBytes(bytes, `Rotini pin ${input.fileName}`);
      const sequence = this.pinSequence + 1;
      const prefix = String(sequence).padStart(6, "0");
      const bytesRelative = `pins/${prefix}.bin`;
      const digest = sha256(bytes);
      await durableExclusiveWrite(path.join(this.checkpointRoot, bytesRelative), bytes);
      const appended = await this.appendEvent("PIN_PREPARED", actor, new Date().toISOString(), {
        pinSequence: sequence,
        source: { fileName: input.fileName, mimeType: input.mimeType },
        bytes: { path: bytesRelative, sha256: digest, byteLength: bytes.byteLength },
      });
      this.pendingPin = {
        sequence,
        actor,
        fileName: input.fileName,
        mimeType: input.mimeType,
        bytes,
        sha256: digest,
        byteLength: bytes.byteLength,
        preparedRecordSha256: appended.sha256,
      };
    });
  }

  onPin(
    actor: RotiniUiLiveCheckpointActor,
    input: { proof: PastaUiLivePinProof },
  ): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      actor = requireActor(actor);
      const pending = this.pendingPin;
      if (!pending || pending.actor !== actor) throw new Error("Rotini checkpoint pin has no matching pre-pin bytes");
      if (!pending.bytes) throw new Error("Rotini checkpoint pending pin bytes are unavailable");
      const projectedProof = proofRecord(input.proof);
      if (
        input.proof.fileName !== pending.fileName ||
        input.proof.mimeType !== pending.mimeType ||
        input.proof.byteLength !== pending.byteLength ||
        input.proof.sha256 !== pending.sha256
      ) {
        throw new Error("Rotini checkpoint pin proof differs from exact pre-pin bytes");
      }
      const sequence = pending.sequence;
      const prefix = String(sequence).padStart(6, "0");
      const bytesRelative = `pins/${prefix}.bin`;
      const proofRelative = `pins/${prefix}.proof.json`;
      const durableProof = exactProjection({
        schema: ROTINI_UI_LIVE_CHECKPOINT_PIN_PROOF_SCHEMA,
        pinSequence: sequence,
        actor,
        source: { fileName: pending.fileName, mimeType: pending.mimeType },
        preparedRecordSha256: pending.preparedRecordSha256,
        bytes: { path: bytesRelative, sha256: pending.sha256, byteLength: pending.byteLength },
        proof: projectedProof,
      }) as JsonObject;
      const proofBytes = deterministicJsonBytes(durableProof);
      await durableExclusiveWrite(path.join(this.checkpointRoot, proofRelative), proofBytes);
      await this.appendEvent("PIN_CONFIRMED", actor, new Date().toISOString(), {
        pinSequence: sequence,
        preparedRecordSha256: pending.preparedRecordSha256,
        bytes: { path: bytesRelative, sha256: pending.sha256, byteLength: pending.byteLength },
        proof: { path: proofRelative, sha256: sha256(proofBytes), byteLength: proofBytes.byteLength },
      });
      this.pinSequence = sequence;
      this.pendingPin = null;
      this.pendingPinReceipts.push({ actor, sequence, proof: input.proof });
    });
  }

  onReceipt(actor: RotiniUiLiveCheckpointActor, receipt: PastaUiLivePublicReceipt): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      actor = requireActor(actor);
      if (receipt.chainId !== this.intent.network.chainId) throw new Error("Rotini checkpoint receipt chain id drift");
      if (receipt.signerAddress !== this.intent.actors[actor]) throw new Error("Rotini checkpoint receipt signer drift");
      requireInteger(receipt.sequence, "Rotini checkpoint receipt sequence", 1);
      requireTimestamp(receipt.timestampUtc, "Rotini checkpoint receipt timestamp");
      if (receipt.action === "originate" || receipt.action === "call" || receipt.action === "batch") {
        const pending = this.pendingOperation;
        if (!pending || pending.phase !== "SUBMITTED") throw new Error("Rotini checkpoint CONFIRMED receipt has no matching SUBMITTED event");
        if (receipt.action !== pending.expected.action) throw new Error("Rotini checkpoint confirmed action drift");
        if (requireOperationHash(receipt.operationHash) !== pending.operationHash) throw new Error("Rotini checkpoint confirmation hash differs from SUBMITTED hash");
        if (pending.expected.action === "originate") this.bindContract(receipt.contractAddress);
        else if (receipt.contractAddress !== this.contractAddress) throw new Error("Rotini checkpoint confirmed contract drift");
        const expectedEntrypoints = pending.expected.entrypoint ? [pending.expected.entrypoint] : [];
        if (JSON.stringify(receipt.entrypoints ?? []) !== JSON.stringify(expectedEntrypoints)) {
          throw new Error("Rotini checkpoint confirmed entrypoint drift");
        }
        await this.appendEvent("CONFIRMED", actor, receipt.timestampUtc, {
          globalOrdinal: pending.expected.globalOrdinal,
          operationSequence: pending.expected.operationSequence,
          descriptorSha256: pending.descriptorSha256,
          submittedRecordSha256: pending.submittedRecordSha256,
          operationHash: pending.operationHash,
          receipt: exactProjection(receipt),
        });
        this.actorCompleted[actor] += 1;
        this.completedOperations += 1;
        this.pendingOperation = null;
        return;
      }
      if (!new Set(["connect", "chain_check", "pin_json", "pin_blob"]).has(receipt.action)) {
        throw new Error(`Rotini checkpoint refuses unsupported non-operation receipt: ${receipt.action}`);
      }
      if (receipt.operationHash) throw new Error("Rotini checkpoint non-operation receipt contains an operation hash");
      let pinSequence: number | undefined;
      if (receipt.action === "pin_json" || receipt.action === "pin_blob") {
        const expected = this.pendingPinReceipts[0];
        if (!expected || expected.actor !== actor) throw new Error("Rotini checkpoint pin receipt has no matching durable pin");
        if (
          receipt.cid !== expected.proof.cid ||
          receipt.ipfsUri !== expected.proof.uri ||
          receipt.publicGatewayUrl !== expected.proof.publicGatewayUrl ||
          receipt.sha256 !== expected.proof.sha256 ||
          receipt.byteCount !== expected.proof.byteLength ||
          receipt.fileName !== expected.proof.fileName
        ) {
          throw new Error("Rotini checkpoint pin receipt differs from durable pin proof");
        }
        pinSequence = expected.sequence;
        this.pendingPinReceipts.shift();
      }
      await this.appendEvent("RECEIPT", actor, receipt.timestampUtc, {
        ...(pinSequence ? { pinSequence } : {}),
        receipt: exactProjection(receipt),
      });
      this.nonOperationReceipts += 1;
    });
  }

  summary(): RotiniUiLiveCheckpointSummary {
    return {
      status: this.finalized ? "FINALIZED" : "ACTIVE",
      completedOperations: this.completedOperations,
      pins: this.pinSequence,
      nonOperationReceipts: this.nonOperationReceipts,
      pendingOperation: this.pendingOperation ? {
        actor: this.pendingOperation.expected.actor,
        operationSequence: this.pendingOperation.expected.operationSequence,
        phase: this.pendingOperation.phase,
        ...(this.pendingOperation.operationHash ? { operationHash: this.pendingOperation.operationHash } : {}),
      } : null,
      pendingPin: this.pendingPin ? {
        actor: this.pendingPin.actor,
        fileName: this.pendingPin.fileName,
        sha256: this.pendingPin.sha256,
      } : null,
      pendingPinReceipts: this.pendingPinReceipts.map((entry) => entry.sequence),
    };
  }

  async validatedEvidence(): Promise<RotiniUiLiveCheckpointEvidence> {
    await this.queue;
    return {
      checkpointId: this.intent.checkpointId,
      intentSha256: this.intentSha256,
      chainHeadSha256: this.chainHeadSha256,
      intent: JSON.parse(Buffer.from(deterministicJsonBytes(this.intent)).toString("utf8")) as JsonObject,
      summary: this.summary(),
      artifacts: await artifactInventory(this.checkpointRoot),
    };
  }

  finalize(completedAt = new Date().toISOString()): Promise<RotiniUiLiveCheckpointFinalization> {
    return this.serialized(async () => {
      this.ensureWritable();
      if (this.pendingOperation || this.pendingPin || this.pendingPinReceipts.length) {
        throw new Error("Rotini checkpoint cannot finalize with pending operation or pin evidence");
      }
      if (this.completedOperations !== ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX.length) {
        throw new Error("Rotini checkpoint cannot finalize before all ten signer operations are confirmed");
      }
      if (this.pinSequence !== MAX_PINS) throw new Error("Rotini checkpoint final proof requires exactly twenty pins");
      const expectedActors = actorCounts();
      if (JSON.stringify(this.actorCompleted) !== JSON.stringify(expectedActors)) throw new Error("Rotini checkpoint actor operation counts drift");
      const terminalCore = exactProjection({
        schema: ROTINI_UI_LIVE_CHECKPOINT_FINAL_SCHEMA,
        status: "FINALIZED",
        checkpointId: this.intent.checkpointId,
        intentSha256: this.intentSha256,
        completedAt: requireTimestamp(completedAt, "Rotini checkpoint completion time"),
        chainHeadSha256: this.chainHeadSha256,
        counts: {
          actors: this.actorCompleted,
          operations: this.completedOperations,
          pins: this.pinSequence,
          nonOperationReceipts: this.nonOperationReceipts,
          events: this.eventIndex,
        },
      }) as JsonObject;
      const terminalStateSha256 = sha256(deterministicJsonBytes(terminalCore));
      const finalBytes = deterministicJsonBytes({ ...terminalCore, terminalStateSha256 });
      await durableExclusiveWrite(path.join(this.checkpointRoot, "final.json"), finalBytes);
      this.finalized = true;
      this.finalSha256 = sha256(finalBytes);
      const artifacts = await artifactInventory(this.checkpointRoot);
      return {
        status: "FINALIZED",
        checkpointId: this.intent.checkpointId,
        intentSha256: this.intentSha256,
        finalSha256: this.finalSha256,
        counts: {
          actors: { ...this.actorCompleted },
          operations: this.completedOperations,
          pins: this.pinSequence,
          nonOperationReceipts: this.nonOperationReceipts,
          events: this.eventIndex,
        },
        artifacts,
      };
    });
  }

  private applyPersistedEvent(record: JsonObject, recordSha256: string): void {
    const phase = String(record.phase || "");
    const actor = requireActor(record.actor);
    if (phase === "PREPARED") {
      if (this.pendingOperation) throw new Error("Rotini persisted PREPARED event overlaps another operation");
      const expected = this.expectedNext();
      if (actor !== expected.actor || record.globalOrdinal !== expected.globalOrdinal || record.operationSequence !== expected.operationSequence) {
        throw new Error("Rotini persisted PREPARED operation matrix drift");
      }
      const operation = requireRecord(record.operation, "Rotini persisted PREPARED operation");
      if (operation.action !== expected.action || operation.chainId !== this.intent.network.chainId || operation.signerAddress !== this.intent.actors[actor]) {
        throw new Error("Rotini persisted PREPARED actor/action drift");
      }
      const entrypoints = operation.entrypoints;
      if (JSON.stringify(entrypoints) !== JSON.stringify(expected.entrypoint ? [expected.entrypoint] : [])) {
        throw new Error("Rotini persisted PREPARED entrypoint drift");
      }
      const descriptor = requireRecord(operation.descriptor, "Rotini persisted descriptor");
      const descriptorSha256 = requireHash(record.descriptorSha256, "Rotini persisted descriptor hash");
      if (sha256(deterministicJsonBytes(descriptor)) !== descriptorSha256) throw new Error("Rotini persisted descriptor hash drift");
      if (expected.action === "originate") {
        if (descriptor.kind !== "originate" || hashMichelsonScriptCode(descriptor.code) !== this.intent.contractIdentity.canonicalMichelsonCodeSha256) {
          throw new Error("Rotini persisted origination contract identity drift");
        }
      } else {
        const call = requireRecord(descriptor.call, "Rotini persisted call");
        if (!this.contractAddress || operation.contractAddress !== this.contractAddress || call.contractAddress !== this.contractAddress || call.entrypoint !== expected.entrypoint) {
          throw new Error("Rotini persisted call target/entrypoint drift");
        }
      }
      this.pendingOperation = {
        expected,
        phase: "PREPARED",
        descriptorSha256,
        preparedRecordSha256: recordSha256,
      };
      return;
    }
    if (phase === "SUBMITTED") {
      const pending = this.pendingOperation;
      if (!pending || pending.phase !== "PREPARED") throw new Error("Rotini persisted SUBMITTED lacks PREPARED");
      if (actor !== pending.expected.actor || record.globalOrdinal !== pending.expected.globalOrdinal || record.operationSequence !== pending.expected.operationSequence) {
        throw new Error("Rotini persisted SUBMITTED matrix drift");
      }
      if (record.preparedRecordSha256 !== pending.preparedRecordSha256 || record.descriptorSha256 !== pending.descriptorSha256) {
        throw new Error("Rotini persisted SUBMITTED link drift");
      }
      const operationHash = requireOperationHash(record.operationHash);
      if (this.operationHashes.has(operationHash)) throw new Error("Rotini persisted operation hash is duplicated");
      if (pending.expected.action === "originate" && record.contractAddress) this.bindContract(record.contractAddress);
      this.operationHashes.add(operationHash);
      this.pendingOperation = {
        ...pending,
        phase: "SUBMITTED",
        operationHash,
        submittedRecordSha256: recordSha256,
      };
      return;
    }
    if (phase === "CONFIRMED") {
      const pending = this.pendingOperation;
      if (!pending || pending.phase !== "SUBMITTED") throw new Error("Rotini persisted CONFIRMED lacks SUBMITTED");
      if (actor !== pending.expected.actor || record.globalOrdinal !== pending.expected.globalOrdinal || record.operationSequence !== pending.expected.operationSequence) {
        throw new Error("Rotini persisted CONFIRMED matrix drift");
      }
      if (record.submittedRecordSha256 !== pending.submittedRecordSha256 || record.descriptorSha256 !== pending.descriptorSha256 || record.operationHash !== pending.operationHash) {
        throw new Error("Rotini persisted CONFIRMED link drift");
      }
      const receipt = requireRecord(record.receipt, "Rotini persisted confirmed receipt");
      if (receipt.operationHash !== pending.operationHash || receipt.action !== pending.expected.action || receipt.signerAddress !== this.intent.actors[actor] || receipt.chainId !== this.intent.network.chainId) {
        throw new Error("Rotini persisted confirmed receipt drift");
      }
      if (pending.expected.action === "originate") this.bindContract(receipt.contractAddress);
      else if (receipt.contractAddress !== this.contractAddress) throw new Error("Rotini persisted confirmed contract drift");
      this.actorCompleted[actor] += 1;
      this.completedOperations += 1;
      this.pendingOperation = null;
      return;
    }
    if (phase === "PIN_PREPARED") {
      const sequence = requireInteger(record.pinSequence, "Rotini persisted pin sequence", 1);
      if (this.pendingPin || sequence !== this.pinSequence + 1 || sequence > MAX_PINS) throw new Error("Rotini persisted prepared-pin sequence drift");
      const source = requireRecord(record.source, "Rotini persisted pin source");
      const bytesReference = requireRecord(record.bytes, "Rotini persisted pin bytes reference");
      const prefix = String(sequence).padStart(6, "0");
      if (!SAFE_FILE_NAME.test(String(source.fileName || "")) || !SAFE_MIME.test(String(source.mimeType || ""))) throw new Error("Rotini persisted pin source is unsafe");
      if (bytesReference.path !== `pins/${prefix}.bin`) throw new Error("Rotini persisted prepared-pin path drift");
      requireHash(bytesReference.sha256, "Rotini persisted pin bytes hash");
      requireInteger(bytesReference.byteLength, "Rotini persisted pin bytes length", 1);
      this.persistedPreparedPinReferences.set(sequence, {
        actor,
        source,
        bytes: bytesReference,
        preparedRecordSha256: recordSha256,
      });
      this.pendingPin = {
        sequence,
        actor,
        fileName: String(source.fileName),
        mimeType: String(source.mimeType),
        bytes: null,
        sha256: String(bytesReference.sha256),
        byteLength: Number(bytesReference.byteLength),
        preparedRecordSha256: recordSha256,
      };
      return;
    }
    if (phase === "PIN_CONFIRMED") {
      const sequence = requireInteger(record.pinSequence, "Rotini persisted confirmed-pin sequence", 1);
      const pending = this.pendingPin;
      if (!pending || sequence !== pending.sequence || actor !== pending.actor || sequence !== this.pinSequence + 1) {
        throw new Error("Rotini persisted confirmed pin has no matching PIN_PREPARED event");
      }
      if (record.preparedRecordSha256 !== pending.preparedRecordSha256) throw new Error("Rotini persisted confirmed-pin link drift");
      const bytesReference = requireRecord(record.bytes, "Rotini persisted confirmed-pin bytes reference");
      const proofReference = requireRecord(record.proof, "Rotini persisted confirmed-pin proof reference");
      const prefix = String(sequence).padStart(6, "0");
      if (bytesReference.path !== `pins/${prefix}.bin` || proofReference.path !== `pins/${prefix}.proof.json`) {
        throw new Error("Rotini persisted confirmed-pin path drift");
      }
      if (bytesReference.sha256 !== pending.sha256 || bytesReference.byteLength !== pending.byteLength) {
        throw new Error("Rotini persisted confirmed-pin bytes differ from PIN_PREPARED");
      }
      requireHash(proofReference.sha256, "Rotini persisted pin proof hash");
      requireInteger(proofReference.byteLength, "Rotini persisted pin proof length", 1);
      this.persistedPinReferences.set(sequence, { actor, bytes: bytesReference, proof: proofReference });
      this.unreceiptedPersistedPins.add(sequence);
      this.pinSequence = sequence;
      this.pendingPin = null;
      return;
    }
    if (phase === "RECEIPT") {
      const receipt = requireRecord(record.receipt, "Rotini persisted non-operation receipt");
      if (!["connect", "chain_check", "pin_json", "pin_blob"].includes(String(receipt.action))) {
        throw new Error("Rotini persisted unsupported non-operation receipt");
      }
      if (receipt.chainId !== this.intent.network.chainId || receipt.signerAddress !== this.intent.actors[actor] || receipt.operationHash) {
        throw new Error("Rotini persisted non-operation receipt drift");
      }
      if (receipt.action === "pin_json" || receipt.action === "pin_blob") {
        const sequence = requireInteger(record.pinSequence, "Rotini persisted pin receipt sequence", 1);
        if (!this.unreceiptedPersistedPins.has(sequence) || this.persistedPinReceiptRecords.has(sequence)) {
          throw new Error("Rotini persisted pin receipt has no unmatched PIN event");
        }
        this.unreceiptedPersistedPins.delete(sequence);
        this.persistedPinReceiptRecords.set(sequence, { actor, receipt });
      } else if (record.pinSequence !== undefined) {
        throw new Error("Rotini persisted non-pin receipt has a pin sequence");
      }
      this.nonOperationReceipts += 1;
      return;
    }
    throw new Error(`Rotini persisted event phase is invalid: ${phase}`);
  }

  async loadPersistedState(): Promise<void> {
    const rootInfo = await lstat(this.checkpointRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("Rotini checkpoint root is not a real directory");
    for (const directory of ["events", "pins"]) {
      const info = await lstat(path.join(this.checkpointRoot, directory));
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Rotini checkpoint ${directory} is a symbolic link or non-directory`);
    }
    const eventNames = (await readdir(path.join(this.checkpointRoot, "events"))).sort();
    for (const name of eventNames) {
      if (!/^\d{6}-(?:prepared|submitted|confirmed|pin_prepared|pin_confirmed|receipt)-(?:creator|collector)\.json$/.test(name)) {
        throw new Error(`unexpected Rotini checkpoint event file: ${name}`);
      }
      const loaded = await canonicalJsonFile(path.join(this.checkpointRoot, "events", name));
      const record = loaded.value;
      const index = requireInteger(record.eventIndex, "Rotini persisted event index", 1);
      const actor = requireActor(record.actor);
      const phase = String(record.phase || "");
      const expectedName = `${String(index).padStart(6, "0")}-${phase.toLowerCase()}-${actor}.json`;
      if (index !== this.eventIndex + 1 || name !== expectedName) {
        throw new Error("Rotini checkpoint event sequence drift");
      }
      if (
        record.schema !== ROTINI_UI_LIVE_CHECKPOINT_EVENT_SCHEMA ||
        record.checkpointId !== this.intent.checkpointId ||
        record.intentSha256 !== this.intentSha256 ||
        record.previousRecordSha256 !== this.chainHeadSha256
      ) {
        throw new Error("Rotini checkpoint event hash-chain drift");
      }
      requireTimestamp(record.timestampUtc, "Rotini persisted event timestamp");
      this.applyPersistedEvent(record, loaded.sha256);
      this.eventIndex = index;
      this.chainHeadSha256 = loaded.sha256;
    }

    const pinNames = (await readdir(path.join(this.checkpointRoot, "pins"))).sort();
    const expectedPinNames = Array.from({ length: this.pinSequence }, (_, offset) => {
      const prefix = String(offset + 1).padStart(6, "0");
      return [`${prefix}.bin`, `${prefix}.proof.json`];
    }).flat();
    if (this.pendingPin) expectedPinNames.push(`${String(this.pendingPin.sequence).padStart(6, "0")}.bin`);
    expectedPinNames.sort();
    if (JSON.stringify(pinNames) !== JSON.stringify(expectedPinNames)) throw new Error("Rotini checkpoint has missing, extra, or uncheckpointed pin files");
    for (let sequence = 1; sequence <= this.pinSequence; sequence += 1) {
      const prefix = String(sequence).padStart(6, "0");
      const bytesPath = path.join(this.checkpointRoot, "pins", `${prefix}.bin`);
      const proofPath = path.join(this.checkpointRoot, "pins", `${prefix}.proof.json`);
      const bytesInfo = await lstat(bytesPath);
      if (!bytesInfo.isFile() || bytesInfo.isSymbolicLink()) throw new Error("Rotini checkpoint pin bytes are a symbolic link or non-file");
      const bytes = await readFile(bytesPath);
      assertNoCredentialBytes(bytes, `Rotini persisted pin ${sequence}`);
      const durable = await canonicalJsonFile(proofPath);
      if (durable.value.schema !== ROTINI_UI_LIVE_CHECKPOINT_PIN_PROOF_SCHEMA || durable.value.pinSequence !== sequence) {
        throw new Error("Rotini checkpoint durable pin proof drift");
      }
      const bytesReference = requireRecord(durable.value.bytes, "Rotini durable pin bytes");
      if (bytesReference.path !== `pins/${prefix}.bin` || bytesReference.byteLength !== bytes.byteLength || bytesReference.sha256 !== sha256(bytes)) {
        throw new Error("Rotini checkpoint durable pin bytes drift");
      }
      const externalProof = requireRecord(durable.value.proof, "Rotini durable external pin proof") as PastaUiLivePinProof;
      proofRecord(externalProof);
      const preparedReference = this.persistedPreparedPinReferences.get(sequence);
      const durableSource = requireRecord(durable.value.source, "Rotini durable pin source");
      if (
        !preparedReference ||
        preparedReference.actor !== durable.value.actor ||
        durable.value.preparedRecordSha256 !== preparedReference.preparedRecordSha256 ||
        durableSource.fileName !== preparedReference.source.fileName ||
        durableSource.mimeType !== preparedReference.source.mimeType ||
        preparedReference.bytes.path !== `pins/${prefix}.bin` ||
        preparedReference.bytes.byteLength !== bytes.byteLength ||
        preparedReference.bytes.sha256 !== sha256(bytes)
      ) {
        throw new Error("Rotini durable pin proof differs from PIN_PREPARED evidence");
      }
      const eventReference = this.persistedPinReferences.get(sequence);
      if (!eventReference || eventReference.actor !== durable.value.actor) throw new Error("Rotini checkpoint PIN event actor/reference drift");
      if (
        eventReference.bytes.path !== `pins/${prefix}.bin` ||
        eventReference.bytes.byteLength !== bytes.byteLength ||
        eventReference.bytes.sha256 !== sha256(bytes) ||
        eventReference.proof.path !== `pins/${prefix}.proof.json` ||
        eventReference.proof.byteLength !== durable.bytes.byteLength ||
        eventReference.proof.sha256 !== durable.sha256
      ) {
        throw new Error("Rotini checkpoint PIN event differs from durable pin artifacts");
      }
      const persistedReceipt = this.persistedPinReceiptRecords.get(sequence);
      if (persistedReceipt) {
        if (
          persistedReceipt.actor !== durable.value.actor ||
          persistedReceipt.receipt.cid !== externalProof.cid ||
          persistedReceipt.receipt.ipfsUri !== externalProof.uri ||
          persistedReceipt.receipt.publicGatewayUrl !== externalProof.publicGatewayUrl ||
          persistedReceipt.receipt.sha256 !== externalProof.sha256 ||
          persistedReceipt.receipt.byteCount !== externalProof.byteLength ||
          persistedReceipt.receipt.fileName !== externalProof.fileName
        ) {
          throw new Error("Rotini persisted pin receipt differs from durable proof");
        }
      } else {
        this.pendingPinReceipts.push({
          actor: requireActor(durable.value.actor),
          sequence,
          proof: externalProof,
        });
      }
    }
    if (this.persistedPinReferences.size !== this.pinSequence) throw new Error("Rotini checkpoint PIN event inventory is incomplete");
    if (this.persistedPreparedPinReferences.size !== this.pinSequence + (this.pendingPin ? 1 : 0)) {
      throw new Error("Rotini checkpoint PIN_PREPARED inventory is incomplete");
    }
    if (this.pendingPin) {
      const prefix = String(this.pendingPin.sequence).padStart(6, "0");
      const bytesPath = path.join(this.checkpointRoot, "pins", `${prefix}.bin`);
      const bytesInfo = await lstat(bytesPath);
      if (bytesInfo.isSymbolicLink() || !bytesInfo.isFile()) throw new Error("Rotini prepared pin bytes are a symbolic link or non-file");
      const bytes = await readFile(bytesPath);
      const preparedReference = this.persistedPreparedPinReferences.get(this.pendingPin.sequence);
      if (
        !preparedReference ||
        preparedReference.bytes.path !== `pins/${prefix}.bin` ||
        preparedReference.bytes.byteLength !== bytes.byteLength ||
        preparedReference.bytes.sha256 !== sha256(bytes) ||
        this.pendingPin.byteLength !== bytes.byteLength ||
        this.pendingPin.sha256 !== sha256(bytes)
      ) {
        throw new Error("Rotini pending PIN_PREPARED bytes drift");
      }
      assertNoCredentialBytes(bytes, `Rotini pending pin ${this.pendingPin.sequence}`);
      this.pendingPin.bytes = Uint8Array.from(bytes);
    }

    const rootNames = (await readdir(this.checkpointRoot)).sort();
    for (const name of rootNames) {
      if (!["events", "final.json", "intent.json", "pins"].includes(name)) throw new Error(`unexpected Rotini checkpoint root artifact: ${name}`);
    }
    if (rootNames.includes("final.json")) {
      const final = await canonicalJsonFile(path.join(this.checkpointRoot, "final.json"));
      const value = final.value;
      if (value.schema !== ROTINI_UI_LIVE_CHECKPOINT_FINAL_SCHEMA || value.status !== "FINALIZED") throw new Error("Rotini checkpoint final schema/status drift");
      const terminalStateSha256 = requireHash(value.terminalStateSha256, "Rotini terminal state hash");
      const { terminalStateSha256: _terminal, ...terminalCore } = value;
      if (sha256(deterministicJsonBytes(terminalCore)) !== terminalStateSha256) throw new Error("Rotini checkpoint terminal state hash drift");
      const counts = requireRecord(value.counts, "Rotini checkpoint final counts");
      if (
        value.checkpointId !== this.intent.checkpointId ||
        value.intentSha256 !== this.intentSha256 ||
        value.chainHeadSha256 !== this.chainHeadSha256 ||
        counts.operations !== this.completedOperations ||
        counts.pins !== this.pinSequence ||
        counts.nonOperationReceipts !== this.nonOperationReceipts ||
        counts.events !== this.eventIndex ||
        !Buffer.from(deterministicJsonBytes(counts.actors)).equals(Buffer.from(deterministicJsonBytes(this.actorCompleted))) ||
        this.pendingOperation ||
        this.pendingPinReceipts.length > 0 ||
        this.completedOperations !== 10 ||
        this.pinSequence !== MAX_PINS
      ) {
        throw new Error("Rotini checkpoint final state differs from event replay");
      }
      this.finalized = true;
      this.finalSha256 = final.sha256;
    }
    await artifactInventory(this.checkpointRoot);
  }
}

export async function createRotiniUiLiveCheckpoint(
  input: CreateRotiniUiLiveCheckpointInput,
): Promise<RotiniUiLiveCheckpoint> {
  const checkpointRoot = path.resolve(input.checkpointRoot);
  const intent = buildIntent(input);
  const intentBytes = deterministicJsonBytes(intent);
  await durableCreateDirectories(checkpointRoot);
  await durableExclusiveWrite(path.join(checkpointRoot, "intent.json"), intentBytes);
  return new RotiniUiLiveCheckpoint(checkpointRoot, intent, sha256(intentBytes));
}

export async function openRotiniUiLiveCheckpoint(checkpointRoot: string): Promise<RotiniUiLiveCheckpoint> {
  const resolved = path.resolve(checkpointRoot);
  const rootInfo = await lstat(resolved);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("Rotini checkpoint root is not a real directory");
  const intentFile = await canonicalJsonFile(path.join(resolved, "intent.json"));
  const intent = validateIntent(intentFile.value);
  const checkpoint = new RotiniUiLiveCheckpoint(resolved, intent, intentFile.sha256);
  await checkpoint.loadPersistedState();
  return checkpoint;
}
