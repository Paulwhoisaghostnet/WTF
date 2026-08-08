import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { Page } from "playwright";

import type {
  PastaUiLiveBridgeHandler,
  PastaUiLiveBridgeRequest,
  PastaUiLiveOperationDescriptor,
  PastaUiLivePinProof,
  PastaUiLivePublicReceipt,
} from "./pasta-ui-live-bridge-kit";
import {
  decodePastaUiLiveValue,
  PASTA_UI_LIVE_RECEIPT_SCHEMA,
} from "./pasta-ui-live-bridge-kit";
import {
  openRavioliUiLiveJournal,
  RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX,
  RAVIOLI_UI_LIVE_JOURNAL_EFFECTIVE_INTENT_SCHEMA,
  RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA,
  ravioliUiLiveDescriptorSha256,
  ravioliUiLiveNonceCommitment,
  type RavioliUiLiveExpectedOperation,
  type RavioliUiLiveJournal,
  type RavioliUiLiveJournalActor,
  type RavioliUiLiveJournalRestartState,
  type RavioliUiLiveJournalTargetRole,
} from "./shadownet-ravioli-ui-live-journal";
import {
  deterministicJsonBytes,
  ipfsGatewayUrl,
  SHADOWNET_CHAIN_ID,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

const HASH_RE = /^[0-9a-f]{64}$/;
const OPERATION_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const PRIVATE_SNAPSHOT_SCHEMA =
  "pastaprotocol-ravioli-private-recovery-snapshot@1";
const PRIVATE_RECORD_SCHEMA = "pasta-ravioli-publish-recovery@1";
const PRIVATE_RECORD_ENCODING = "pasta-recovery-canonical@1";
const PRIVATE_INDEX_KEY = "pasta.ravioli.publish-recovery-index.v1";
const ACTORS = ["creator", "collector1", "collector2"] as const;
const READ_ACTIONS = new Set<PastaUiLiveBridgeRequest["action"]>([
  "active_protocol",
  "balance",
  "chain_check",
  "connect",
  "contract_at",
  "estimate_call",
  "execute_view",
  "read_storage",
  "script_code_hash",
]);

type JsonRecord = Record<string, any>;

export type RavioliCurrentResumePin = Readonly<{
  kind: "pin";
  actor: RavioliUiLiveJournalActor;
  eventIndex: number;
  pinSequence: number;
  action: "pin_blob" | "pin_json";
  fingerprint: string;
  bytes: Uint8Array;
  value?: unknown;
  proof: PastaUiLivePinProof;
}>;

export type RavioliCurrentResumeOperation = Readonly<{
  kind: "operation";
  actor: RavioliUiLiveJournalActor;
  eventIndex: number;
  action: "originate" | "call";
  expected: RavioliUiLiveExpectedOperation;
  descriptor: PastaUiLiveOperationDescriptor;
  descriptorSha256: string;
  operationHash: string;
  contractAddress: string;
  evidence: Readonly<JsonRecord>;
  fingerprint: string;
  receipt: PastaUiLivePublicReceipt;
}>;

export type RavioliPrivateRecoveryRecord = Readonly<{
  storageKey: string;
  value: string;
  sha256: string;
  account: string;
  contract: string | null;
  tokenId: number | null;
  status: string;
  workflow: string;
  stage: string;
  operationHashes: readonly string[];
}>;

export type RavioliPrivateRecoveryRestoration = Readonly<{
  root: string;
  snapshotPath: string;
  manifestSha256: string;
  capturedAt: string;
  authenticatedSnapshotCount: number;
  records: readonly RavioliPrivateRecoveryRecord[];
}>;

export type RavioliCurrentResumePlan = Readonly<{
  schema: "pastaprotocol-ravioli-current-resume-plan@1";
  classification: "CURRENT_SAFE_PREFIX" | "CURRENT_TERMINAL";
  journalRoot: string;
  journalId: string;
  intentSha256: string;
  completedOperationCount: number;
  nextOperation: RavioliUiLiveExpectedOperation | null;
  uiStage: Readonly<{
    partition: RavioliUiLiveExpectedOperation["proofPartition"] | "terminal";
    actor: RavioliUiLiveJournalActor | null;
    action: string;
    tokenId: number | null;
  }>;
  actorSequences: Readonly<Record<RavioliUiLiveJournalActor, Readonly<{
    applied: number;
    nextOperationSequence: number;
    counterOffset: number;
  }>>>;
  targetBindings: Readonly<Partial<Record<RavioliUiLiveJournalTargetRole, string>>>;
  pins: readonly RavioliCurrentResumePin[];
  operations: readonly RavioliCurrentResumeOperation[];
  writeReceipts: readonly PastaUiLivePublicReceipt[];
  privateRecovery: RavioliPrivateRecoveryRestoration | null;
}>;

export type RavioliCurrentResumePrimingMode =
  | "browser-exact"
  | "authenticated-state";

const LIVE_RECONCILED_PLANS = new WeakSet<RavioliCurrentResumePlan>();

export type RavioliCurrentResumeExpectedIdentity = Readonly<{
  actors: Readonly<Record<RavioliUiLiveJournalActor, string>>;
  dependencyAddresses: Readonly<{ gnocchi: string; rotini: string }>;
  dependencyHashes: Readonly<Record<string, string>>;
  artifactHashes: Readonly<Record<string, string>>;
}>;

export type RavioliCurrentResumeLiveVerifier = Readonly<{
  readActorCounter(input: Readonly<{
    actor: RavioliUiLiveJournalActor;
    lane: "primary" | "fallback";
    rpcUrl: string;
    signerAddress: string;
  }>): Promise<number>;
  verifyOperation(
    operation: RavioliCurrentResumeOperation,
  ): Promise<Readonly<JsonRecord>>;
  verifyPin(pin: RavioliCurrentResumePin): Promise<void>;
  verifyTarget(input: Readonly<{
    role: RavioliUiLiveJournalTargetRole;
    address: string;
  }>): Promise<void>;
}>;

export type RavioliCurrentSubmittedReconciler = (
  input: Readonly<{
    actor: RavioliUiLiveJournalActor;
    expected: RavioliUiLiveExpectedOperation;
    operationHash: string;
    descriptorSha256: string;
    preparedOperation: Readonly<Record<string, unknown>>;
    signerAddress: string;
    expectedCounter: number;
    contractAddress: string;
    entrypoints: readonly string[];
  }>,
) => Promise<Readonly<JsonRecord> | null>;

export type RavioliCurrentResumeCoordinator = Readonly<{
  handles: Readonly<Record<RavioliUiLiveJournalActor, PastaUiLiveBridgeHandler>>;
  isReplayComplete(): boolean;
  getRemainingReplayStepCount(actor?: RavioliUiLiveJournalActor): number;
  getCompletedReplayStepCount(actor?: RavioliUiLiveJournalActor): number;
  continuationStarted(): boolean;
}>;

function fail(message: string): never {
  throw new Error(`Ravioli current resume: ${message}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function exactJson(actual: unknown, expected: unknown, label: string): void {
  if (
    !Buffer.from(deterministicJsonBytes(actual)).equals(
      Buffer.from(deterministicJsonBytes(expected)),
    )
  ) {
    fail(`${label} drift`);
  }
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  exactJson(Object.keys(value).sort(), [...keys].sort(), `${label} fields`);
}

async function canonicalJsonFile(
  filePath: string,
  label: string,
): Promise<{ value: JsonRecord; bytes: Uint8Array; sha256: string }> {
  const bytes = await readFile(filePath);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not JSON`);
  }
  if (!Buffer.from(bytes).equals(Buffer.from(deterministicJsonBytes(value)))) {
    fail(`${label} is not canonical JSON`);
  }
  return { value: record(value, label), bytes, sha256: sha256(bytes) };
}

function canonicalBase64(value: unknown): Uint8Array {
  if (
    typeof value !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    fail("pin_blob data is not canonical base64");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) fail("pin_blob data is not canonical base64");
  return bytes;
}

function pinFingerprint(input: {
  action: "pin_blob" | "pin_json";
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): string {
  return input.action === "pin_json"
    ? `pin_json:${input.fileName}:${sha256(input.bytes)}:${input.bytes.byteLength}`
    : `pin_blob:${input.fileName}:${input.mimeType}:${sha256(input.bytes)}:${input.bytes.byteLength}`;
}

function operationDescriptor(request: PastaUiLiveBridgeRequest): PastaUiLiveOperationDescriptor {
  const payload = record(request.payload, `${request.action} payload`);
  if (request.action === "originate") {
    exactKeys(payload, ["code", "storage"], "originate payload");
    return {
      kind: "originate",
      code: decodePastaUiLiveValue(payload.code),
      storage: decodePastaUiLiveValue(payload.storage),
    };
  }
  if (request.action !== "call") fail(`unsupported signer action ${request.action}`);
  exactKeys(payload, ["call", "sendOptions"], "call payload");
  const call = record(decodePastaUiLiveValue(payload.call), "decoded call");
  exactKeys(call, ["contractAddress", "entrypoint", "payload"], "decoded call");
  let callPayload = call.payload;
  if (call.entrypoint === "open_pack") {
    const open = record(callPayload, "open_pack payload");
    if (typeof open.nonce === "string" && /^[0-9a-f]{64}$/.test(open.nonce)) {
      callPayload = {
        ...open,
        nonce: {
          algorithm: "blake2b-256",
          commitment: ravioliUiLiveNonceCommitment(open.nonce),
          redacted: true,
        },
      };
    }
  }
  return {
    kind: "call",
    call: {
      contractAddress: String(call.contractAddress),
      entrypoint: String(call.entrypoint),
      payload: callPayload,
    },
    sendOptions: decodePastaUiLiveValue(payload.sendOptions),
  };
}

function requestFingerprint(request: PastaUiLiveBridgeRequest): string | null {
  try {
    if (request.action === "pin_blob") {
      const payload = record(request.payload, "pin_blob payload");
      exactKeys(payload, ["dataBase64", "fileName", "mimeType"], "pin_blob payload");
      const bytes = canonicalBase64(payload.dataBase64);
      return pinFingerprint({
        action: "pin_blob",
        fileName: String(payload.fileName),
        mimeType: String(payload.mimeType),
        bytes,
      });
    }
    if (request.action === "pin_json") {
      const payload = record(request.payload, "pin_json payload");
      exactKeys(payload, ["fileName", "value"], "pin_json payload");
      const bytes = deterministicJsonBytes(decodePastaUiLiveValue(payload.value));
      return pinFingerprint({
        action: "pin_json",
        fileName: String(payload.fileName),
        mimeType: "application/json",
        bytes,
      });
    }
    if (request.action === "originate" || request.action === "call") {
      return `${request.action}:${ravioliUiLiveDescriptorSha256(operationDescriptor(request))}`;
    }
    return null;
  } catch {
    return null;
  }
}

function expectedIdentity(
  journal: RavioliUiLiveJournal,
  expected: RavioliCurrentResumeExpectedIdentity,
): void {
  if (journal.intent.schema !== RAVIOLI_UI_LIVE_JOURNAL_EFFECTIVE_INTENT_SCHEMA) {
    fail("only a native current-generation effective intent can use generic resume");
  }
  if (!journal.hasEffectivePlan()) fail("journal does not carry the complete 67-operation plan");
  exactJson(journal.intent.matrix, RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX, "effective operation matrix");
  for (const actor of ACTORS) {
    if (journal.intent.actors[actor].signerAddress !== expected.actors[actor]) {
      fail(`${actor} signer identity drift`);
    }
  }
  exactJson(journal.intent.dependencyAddresses, expected.dependencyAddresses, "dependency addresses");
  exactJson(journal.intent.dependencyHashes, expected.dependencyHashes, "dependency hashes");
  exactJson(journal.intent.artifactHashes, expected.artifactHashes, "artifact hashes");
}

async function readAuthenticatedMutations(input: {
  journal: RavioliUiLiveJournal;
  state: RavioliUiLiveJournalRestartState;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
}): Promise<{
  pins: RavioliCurrentResumePin[];
  operations: RavioliCurrentResumeOperation[];
}> {
  const eventRoot = path.join(input.journal.journalRoot, "events");
  const names = (await readdir(eventRoot)).sort();
  const pins: RavioliCurrentResumePin[] = [];
  const operations: RavioliCurrentResumeOperation[] = [];
  const prepared = new Map<number, {
    actor: RavioliUiLiveJournalActor;
    operation: JsonRecord;
    descriptor: PastaUiLiveOperationDescriptor;
    descriptorSha256: string;
  }>();
  const submitted = new Map<number, { operationHash: string; contractAddress?: string }>();
  let previous = input.journal.intentSha256;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!;
    const file = await canonicalJsonFile(path.join(eventRoot, name), `journal event ${index + 1}`);
    const event = file.value;
    if (
      event.schema !== RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA
      || event.journalId !== input.state.journalId
      || event.intentSha256 !== input.state.intentSha256
      || event.eventIndex !== index + 1
      || event.previousRecordSha256 !== previous
    ) {
      fail(`journal event ${index + 1} identity or hash link drift`);
    }
    previous = file.sha256;
    const actor = event.actor as RavioliUiLiveJournalActor;
    if (!ACTORS.includes(actor)) fail(`journal event ${index + 1} actor is invalid`);
    if (event.phase === "PREPARED") {
      const operation = record(event.operation, `operation ${event.globalOrdinal} PREPARED`);
      const descriptor = record(operation.descriptor, "prepared descriptor") as PastaUiLiveOperationDescriptor;
      if (ravioliUiLiveDescriptorSha256(descriptor) !== event.descriptorSha256) {
        fail(`operation ${event.globalOrdinal} descriptor drift`);
      }
      prepared.set(Number(event.globalOrdinal), {
        actor,
        operation,
        descriptor,
        descriptorSha256: String(event.descriptorSha256),
      });
    } else if (event.phase === "SUBMITTED") {
      submitted.set(Number(event.globalOrdinal), {
        operationHash: String(event.operationHash),
        ...(event.contractAddress ? { contractAddress: String(event.contractAddress) } : {}),
      });
    } else if (event.phase === "APPLIED") {
      const ordinal = Number(event.globalOrdinal);
      const preparedRecord = prepared.get(ordinal);
      const submittedRecord = submitted.get(ordinal);
      const expected = RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX[ordinal - 1];
      if (!preparedRecord || !submittedRecord || !expected) {
        fail(`operation ${ordinal} lacks its authenticated phase chain`);
      }
      if (
        preparedRecord.actor !== actor
        || actor !== expected.actor
        || submittedRecord.operationHash !== event.operationHash
        || preparedRecord.descriptorSha256 !== event.descriptorSha256
      ) {
        fail(`operation ${ordinal} phase identity drift`);
      }
      const evidence = record(event.evidence, `operation ${ordinal} APPLIED evidence`);
      const contractAddress = String(evidence.contractAddress || submittedRecord.contractAddress || "");
      const operationHash = String(event.operationHash || "");
      if (!OPERATION_RE.test(operationHash) || !contractAddress) {
        fail(`operation ${ordinal} terminal identity is invalid`);
      }
      const action = expected.action;
      const receipt: PastaUiLivePublicReceipt = Object.freeze({
        schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
        sequence: expected.globalOrdinal,
        timestampUtc: String(evidence.timestamp),
        action,
        chainId: SHADOWNET_CHAIN_ID,
        signerAddress: input.journal.intent.actors[actor].signerAddress,
        contractAddress,
        operationHash,
        entrypoints: expected.entrypoint ? [expected.entrypoint] : [],
      });
      operations.push(Object.freeze({
        kind: "operation" as const,
        actor,
        eventIndex: index + 1,
        action,
        expected,
        descriptor: preparedRecord.descriptor,
        descriptorSha256: preparedRecord.descriptorSha256,
        operationHash,
        contractAddress,
        evidence: Object.freeze({ ...evidence }),
        fingerprint: `${action}:${preparedRecord.descriptorSha256}`,
        receipt,
      }));
      prepared.delete(ordinal);
      submitted.delete(ordinal);
    } else if (event.phase === "PIN") {
      const artifact = record(event.artifact, `pin ${event.pinSequence} artifact`);
      const metadata = record(event.metadata, `pin ${event.pinSequence} metadata`);
      const pinSequence = Number(event.pinSequence);
      const relative = `pins/${String(pinSequence).padStart(6, "0")}.bin`;
      if (artifact.path !== relative) fail(`pin ${pinSequence} artifact path drift`);
      const bytes = await readFile(path.join(input.journal.journalRoot, relative));
      if (bytes.byteLength !== artifact.byteLength || sha256(bytes) !== artifact.sha256) {
        fail(`pin ${pinSequence} byte checkpoint drift`);
      }
      const cid = String(metadata.cid || "");
      const uri = String(metadata.uri || "");
      if (!cid || uri !== `ipfs://${cid}`) fail(`pin ${pinSequence} CID/URI drift`);
      const fileName = String(artifact.fileName || "");
      const mimeType = String(artifact.mimeType || "");
      let action: "pin_blob" | "pin_json" = "pin_blob";
      let value: unknown;
      if (mimeType === "application/json") {
        try {
          value = JSON.parse(bytes.toString("utf8"));
          if (Buffer.from(bytes).equals(Buffer.from(deterministicJsonBytes(value)))) {
            action = "pin_json";
          }
        } catch {
          value = undefined;
        }
      }
      const proof: PastaUiLivePinProof = Object.freeze({
        cid,
        uri,
        fileName,
        mimeType,
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
        localGatewayUrl: ipfsGatewayUrl(input.ipfs.localGatewayUrl, cid),
        publicGatewayUrl: ipfsGatewayUrl(input.ipfs.publicGatewayUrl, cid),
        publicGatewayVerified: true,
        verificationAttempts: 1,
      });
      pins.push(Object.freeze({
        kind: "pin" as const,
        actor,
        eventIndex: index + 1,
        pinSequence,
        action,
        fingerprint: pinFingerprint({ action, fileName, mimeType, bytes }),
        bytes: Uint8Array.from(bytes),
        ...(action === "pin_json" ? { value } : {}),
        proof,
      }));
    }
  }
  if (operations.length !== input.state.completedOperationCount) {
    fail("authenticated operation inventory differs from journal replay state");
  }
  if (pins.length !== input.state.pinCount) {
    fail("authenticated pin inventory differs from journal replay state");
  }
  return { pins, operations };
}

function privateRecordSummary(
  storageKey: string,
  bytes: Uint8Array,
  allowedAccounts: ReadonlySet<string>,
  allowedContracts: ReadonlySet<string>,
  allowedOperationHashes: ReadonlySet<string>,
): RavioliPrivateRecoveryRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail(`private recovery ${storageKey} is not JSON`);
  }
  const value = record(parsed, `private recovery ${storageKey}`);
  if (value.schema !== PRIVATE_RECORD_SCHEMA || value.encoding !== PRIVATE_RECORD_ENCODING) {
    fail(`private recovery ${storageKey} schema is unsupported`);
  }
  const account = String(value.account || "");
  if (!allowedAccounts.has(account)) fail(`private recovery ${storageKey} signer is outside the journal`);
  const contract = value.contract == null ? null : String(value.contract);
  if (contract && !allowedContracts.has(contract)) {
    fail(`private recovery ${storageKey} contract is outside the journal`);
  }
  const tokenId = value.tokenId == null ? null : Number(value.tokenId);
  if (tokenId !== null && (!Number.isSafeInteger(tokenId) || tokenId < 0)) {
    fail(`private recovery ${storageKey} token id is invalid`);
  }
  const history = Array.isArray(value.history) ? value.history : fail(`private recovery ${storageKey} history is invalid`);
  const operationHashes = history.flatMap((entry: unknown) => {
    const hash = String(record(entry, `private recovery ${storageKey} history entry`).operationHash || "");
    return hash ? [hash] : [];
  });
  for (const operationHash of operationHashes) {
    if (!OPERATION_RE.test(operationHash) || !allowedOperationHashes.has(operationHash)) {
      fail(`private recovery ${storageKey} cites an unauthenticated operation`);
    }
  }
  const product = record(value.product, `private recovery ${storageKey} product`);
  const stage = history.length
    ? String(record(history.at(-1), `private recovery ${storageKey} last history`).stage || "")
    : "";
  const summary = {
    storageKey,
    sha256: sha256(bytes),
    account,
    contract,
    tokenId,
    status: String(value.status || ""),
    workflow: String(product.workflow || ""),
    stage,
    operationHashes: Object.freeze(operationHashes),
  } as Omit<RavioliPrivateRecoveryRecord, "value"> & { value?: string };
  Object.defineProperty(summary, "value", {
    value: Buffer.from(bytes).toString("utf8"),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(summary as RavioliPrivateRecoveryRecord);
}

export async function loadRavioliPrivateRecoveryRestoration(input: {
  root: string;
  allowedAccounts: ReadonlySet<string>;
  allowedContracts: ReadonlySet<string>;
  allowedOperationHashes: ReadonlySet<string>;
}): Promise<RavioliPrivateRecoveryRestoration | null> {
  const root = path.resolve(input.root);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    fail("private recovery root must be a real directory");
  }
  const names = (await readdir(root)).sort();
  if (!names.length) return null;
  const snapshots: Array<{
    path: string;
    manifestSha256: string;
    capturedAt: string;
    records: RavioliPrivateRecoveryRecord[];
  }> = [];
  for (const name of names) {
    if (!/^ravioli-private-recovery-[0-9a-f]{24}$/.test(name)) {
      fail(`private recovery root contains an unexpected artifact: ${name}`);
    }
    const snapshotPath = path.join(root, name);
    const info = await lstat(snapshotPath);
    if (!info.isDirectory() || info.isSymbolicLink()) fail(`${name} is not a real snapshot directory`);
    exactJson((await readdir(snapshotPath)).sort(), ["manifest.json", "records"], `${name} inventory`);
    const manifestBytes = await readFile(path.join(snapshotPath, "manifest.json"));
    const manifest = record(JSON.parse(manifestBytes.toString("utf8")), `${name} manifest`);
    exactKeys(manifest, ["schema", "capturedAt", "records"], `${name} manifest`);
    if (manifest.schema !== PRIVATE_SNAPSHOT_SCHEMA || !Number.isFinite(Date.parse(String(manifest.capturedAt)))) {
      fail(`${name} manifest identity is invalid`);
    }
    if (!Array.isArray(manifest.records)) fail(`${name} manifest records are invalid`);
    const recordDirectory = path.join(snapshotPath, "records");
    const recordInfo = await lstat(recordDirectory);
    if (!recordInfo.isDirectory() || recordInfo.isSymbolicLink()) fail(`${name} records lane is invalid`);
    const expectedFiles: string[] = [];
    const records: RavioliPrivateRecoveryRecord[] = [];
    const storageKeys = new Set<string>();
    for (let index = 0; index < manifest.records.length; index += 1) {
      const manifestRecord = record(manifest.records[index], `${name} record ${index + 1}`);
      exactKeys(manifestRecord, ["storageKey", "file", "byteLength", "sha256"], `${name} record ${index + 1}`);
      const file = `records/${String(index + 1).padStart(4, "0")}.json`;
      if (manifestRecord.file !== file) fail(`${name} record ${index + 1} path drift`);
      const storageKey = String(manifestRecord.storageKey || "");
      if (!/^pasta\.ravioli\.publish-recovery(?:-draft)?\.v1:/.test(storageKey) || storageKeys.has(storageKey)) {
        fail(`${name} record ${index + 1} storage key is invalid or duplicated`);
      }
      storageKeys.add(storageKey);
      const fileName = path.basename(file);
      expectedFiles.push(fileName);
      const bytes = await readFile(path.join(recordDirectory, fileName));
      if (
        bytes.byteLength !== manifestRecord.byteLength
        || sha256(bytes) !== manifestRecord.sha256
      ) {
        fail(`${name} record ${index + 1} byte checkpoint drift`);
      }
      records.push(privateRecordSummary(
        storageKey,
        bytes,
        input.allowedAccounts,
        input.allowedContracts,
        input.allowedOperationHashes,
      ));
    }
    exactJson((await readdir(recordDirectory)).sort(), expectedFiles, `${name} records inventory`);
    snapshots.push({
      path: snapshotPath,
      manifestSha256: sha256(manifestBytes),
      capturedAt: String(manifest.capturedAt),
      records,
    });
  }
  snapshots.sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  const latest = snapshots.at(-1)!;
  return Object.freeze({
    root,
    snapshotPath: latest.path,
    manifestSha256: latest.manifestSha256,
    capturedAt: latest.capturedAt,
    authenticatedSnapshotCount: snapshots.length,
    records: Object.freeze(latest.records),
  });
}

export async function installRavioliPrivateRecoveryRestoration(
  page: Pick<Page, "addInitScript">,
  restoration: RavioliPrivateRecoveryRestoration,
): Promise<void> {
  const records = restoration.records.map(({ storageKey, value }) => ({ storageKey, value }));
  await page.addInitScript(({ records: exactRecords, indexKey }) => {
    for (const entry of exactRecords) localStorage.setItem(entry.storageKey, entry.value);
    localStorage.setItem(indexKey, JSON.stringify(exactRecords.map((entry) => entry.storageKey)));
  }, { records, indexKey: PRIVATE_INDEX_KEY });
}

async function buildPlan(input: {
  journal: RavioliUiLiveJournal;
  state: RavioliUiLiveJournalRestartState;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  privateRecoveryRoot?: string;
}): Promise<RavioliCurrentResumePlan> {
  if (input.state.pendingOperation) fail(`${input.state.pendingOperation.phase} signer intent remains ambiguous`);
  if (input.state.pendingPublicRevealPreparation) fail("PUBLIC_REVEAL pin remains ambiguous after preflight");
  if (!input.state.effectivePlan) fail("journal does not expose the current effective plan");
  const { pins, operations } = await readAuthenticatedMutations(input);
  const allowedAccounts = new Set(ACTORS.map((actor) => input.journal.intent.actors[actor].signerAddress));
  const allowedContracts = new Set(Object.values(input.state.targetBindings).filter((value): value is string => Boolean(value)));
  const allowedOperationHashes = new Set(operations.map((operation) => operation.operationHash));
  const privateRecovery = input.privateRecoveryRoot
    ? await loadRavioliPrivateRecoveryRestoration({
        root: input.privateRecoveryRoot,
        allowedAccounts,
        allowedContracts,
        allowedOperationHashes,
      })
    : null;
  const nextOperation = RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX[input.state.completedOperationCount] || null;
  const actorSequences = Object.fromEntries(ACTORS.map((actor) => [actor, Object.freeze({
    applied: input.state.actorAppliedCounts[actor],
    nextOperationSequence: input.state.actorAppliedCounts[actor] + 1,
    counterOffset: input.state.actorCounterOffsets[actor],
  })])) as Record<RavioliUiLiveJournalActor, Readonly<{
    applied: number;
    nextOperationSequence: number;
    counterOffset: number;
  }>>;
  const plan = {
    schema: "pastaprotocol-ravioli-current-resume-plan@1" as const,
    classification: nextOperation ? "CURRENT_SAFE_PREFIX" as const : "CURRENT_TERMINAL" as const,
    journalRoot: input.journal.journalRoot,
    journalId: input.state.journalId,
    intentSha256: input.state.intentSha256,
    completedOperationCount: input.state.completedOperationCount,
    nextOperation,
    uiStage: Object.freeze({
      partition: nextOperation?.proofPartition ?? "terminal",
      actor: nextOperation?.actor ?? null,
      action: nextOperation?.entrypoint ?? nextOperation?.action ?? "package",
      tokenId: nextOperation?.tokenId ?? null,
    }),
    actorSequences: Object.freeze(actorSequences),
    targetBindings: Object.freeze({ ...input.state.targetBindings }),
    pins: Object.freeze(pins),
    operations: Object.freeze(operations),
    writeReceipts: Object.freeze(operations.map((operation) => operation.receipt)),
  } as Omit<RavioliCurrentResumePlan, "privateRecovery"> & {
    privateRecovery?: RavioliPrivateRecoveryRestoration | null;
  };
  Object.defineProperty(plan, "privateRecovery", {
    value: privateRecovery,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(plan as RavioliCurrentResumePlan);
}

export async function inspectRavioliCurrentResume(input: {
  journal: RavioliUiLiveJournal;
  expected: RavioliCurrentResumeExpectedIdentity;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  privateRecoveryRoot?: string;
}): Promise<RavioliCurrentResumePlan> {
  expectedIdentity(input.journal, input.expected);
  const state = await input.journal.restartState();
  return buildPlan({ ...input, state });
}

export async function reconcileRavioliCurrentResume(input: {
  journal: RavioliUiLiveJournal;
  expected: RavioliCurrentResumeExpectedIdentity;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  verifier: RavioliCurrentResumeLiveVerifier;
  reconcileSubmitted?: RavioliCurrentSubmittedReconciler;
  privateRecoveryRoot?: string;
}): Promise<RavioliCurrentResumePlan> {
  expectedIdentity(input.journal, input.expected);
  let state = await input.journal.restartState();
  if (state.pendingPublicRevealPreparation) {
    fail("PUBLIC_REVEAL pin remains ambiguous after preflight");
  }
  if (state.pendingOperation?.phase === "PREPARED") {
    fail("PREPARED signer intent has no exact operation hash and cannot be retried");
  }
  if (state.pendingOperation?.phase === "SUBMITTED") {
    if (!input.reconcileSubmitted) fail("SUBMITTED signer intent requires exact-hash reconciliation");
    const pending = state.pendingOperation;
    const operationHash = pending.operationHash;
    const contractAddress = pending.contractAddress;
    if (!operationHash || !contractAddress) fail("SUBMITTED signer intent lacks its exact terminal identity");
    const intent = input.journal.intent.actors[pending.expected.actor];
    const evidence = await input.reconcileSubmitted({
      actor: pending.expected.actor,
      expected: pending.expected,
      operationHash,
      descriptorSha256: pending.descriptorSha256,
      preparedOperation: pending.preparedOperation,
      signerAddress: intent.signerAddress,
      expectedCounter: intent.counters.primary.counter
        + pending.expected.operationSequence
        + state.actorCounterOffsets[pending.expected.actor],
      contractAddress,
      entrypoints: pending.expected.entrypoint ? [pending.expected.entrypoint] : [],
    });
    if (!evidence) fail("exact-hash reconciliation did not prove the SUBMITTED operation applied");
    await input.journal.appendApplied({
      actor: pending.expected.actor,
      operationSequence: pending.expected.operationSequence,
      operationHash,
      contractAddress,
      entrypoints: pending.expected.entrypoint ? [pending.expected.entrypoint] : [],
      evidence,
      appliedAt: String(evidence.timestamp || new Date().toISOString()),
    });
    state = await input.journal.restartState();
  }
  const plan = await buildPlan({ ...input, state });
  await Promise.all(ACTORS.flatMap((actor) => (["primary", "fallback"] as const).map(async (lane) => {
    const intent = input.journal.intent.actors[actor];
    const observed = await input.verifier.readActorCounter({
      actor,
      lane,
      rpcUrl: intent.counters[lane].rpcUrl,
      signerAddress: intent.signerAddress,
    });
    const expectedCounter = intent.counters[lane].counter
      + plan.actorSequences[actor].applied
      + plan.actorSequences[actor].counterOffset;
    if (observed !== expectedCounter) fail(`${actor} ${lane} counter differs from the authenticated prefix`);
  })));
  for (const [role, address] of Object.entries(plan.targetBindings)) {
    if (address) await input.verifier.verifyTarget({
      role: role as RavioliUiLiveJournalTargetRole,
      address,
    });
  }
  for (const pin of plan.pins) await input.verifier.verifyPin(pin);
  for (const operation of plan.operations) {
    const live = await input.verifier.verifyOperation(operation);
    exactJson(live, operation.evidence, `operation ${operation.expected.globalOrdinal} live evidence`);
  }
  LIVE_RECONCILED_PLANS.add(plan);
  return plan;
}

export async function reopenAndReconcileRavioliCurrentResume(input: Omit<
  Parameters<typeof reconcileRavioliCurrentResume>[0],
  "journal"
> & { journalRoot: string }): Promise<{
  journal: RavioliUiLiveJournal;
  plan: RavioliCurrentResumePlan;
}> {
  const journal = await openRavioliUiLiveJournal(input.journalRoot);
  const plan = await reconcileRavioliCurrentResume({ ...input, journal });
  return { journal, plan };
}

function replayResponse(step: RavioliCurrentResumePin | RavioliCurrentResumeOperation): unknown {
  if (step.kind === "pin") return { pin: step.proof };
  return {
    ...(step.expected.action === "originate" ? { contractAddress: step.contractAddress } : {}),
    operationHash: step.operationHash,
    confirmationLevel: 1,
  };
}

export function createRavioliCurrentResumeCoordinator(input: {
  plan: RavioliCurrentResumePlan;
  delegates: Readonly<Record<RavioliUiLiveJournalActor, PastaUiLiveBridgeHandler>>;
  primingMode?: RavioliCurrentResumePrimingMode;
}): RavioliCurrentResumeCoordinator {
  const primingMode = input.primingMode ?? "browser-exact";
  if (primingMode !== "browser-exact" && primingMode !== "authenticated-state") {
    fail(`unsupported coordinator priming mode ${String(primingMode)}`);
  }
  if (primingMode === "authenticated-state" && !LIVE_RECONCILED_PLANS.has(input.plan)) {
    fail("authenticated-state priming requires the exact live-reconciled plan object");
  }
  const steps = Object.fromEntries(ACTORS.map((actor) => [actor, [
    ...input.plan.pins.filter((pin) => pin.actor === actor),
    ...input.plan.operations.filter((operation) => operation.actor === actor),
  ].sort((left, right) => left.eventIndex - right.eventIndex)])) as Record<
    RavioliUiLiveJournalActor,
    Array<RavioliCurrentResumePin | RavioliCurrentResumeOperation>
  >;
  const completed: Record<RavioliUiLiveJournalActor, number> = {
    creator: primingMode === "authenticated-state" ? steps.creator.length : 0,
    collector1: primingMode === "authenticated-state" ? steps.collector1.length : 0,
    collector2: primingMode === "authenticated-state" ? steps.collector2.length : 0,
  };
  const historicalFingerprints = new Set(
    Object.values(steps).flat().map((step) => step.fingerprint),
  );
  let started = false;
  const remaining = (actor?: RavioliUiLiveJournalActor): number => actor
    ? steps[actor].length - completed[actor]
    : ACTORS.reduce((sum, candidate) => sum + steps[candidate].length - completed[candidate], 0);
  const done = (actor?: RavioliUiLiveJournalActor): number => actor
    ? completed[actor]
    : ACTORS.reduce((sum, candidate) => sum + completed[candidate], 0);
  const handles = Object.fromEntries(ACTORS.map((actor) => [actor, (async (request: PastaUiLiveBridgeRequest) => {
    if (READ_ACTIONS.has(request.action)) return input.delegates[actor](request);
    const expectedStep = steps[actor][completed[actor]];
    if (expectedStep) {
      if (request.action !== expectedStep.action) {
        fail(`expected ${actor} replay step ${completed[actor] + 1} (${expectedStep.action}), received ${request.action}`);
      }
      if (requestFingerprint(request) !== expectedStep.fingerprint) {
        fail(`${actor} replay step ${completed[actor] + 1} bytes or descriptor drifted`);
      }
      completed[actor] += 1;
      return replayResponse(expectedStep);
    }
    if (remaining() > 0) fail(`${actor} attempted a new mutation before every actor replayed its authenticated prefix`);
    const fingerprint = requestFingerprint(request);
    if (
      primingMode === "authenticated-state"
      && fingerprint
      && historicalFingerprints.has(fingerprint)
    ) {
      fail(`refusing duplicate recovered side effect from ${actor}: ${request.action}`);
    }
    if (!started && (request.action === "originate" || request.action === "call")) {
      const next = input.plan.nextOperation;
      if (!next) fail("terminal journal refuses another signer operation");
      const descriptor = operationDescriptor(request);
      const entrypoint = descriptor.kind === "call" ? descriptor.call.entrypoint : undefined;
      if (actor !== next.actor || request.action !== next.action || entrypoint !== next.entrypoint) {
        fail(`first continuation mutation differs from global operation ${next.globalOrdinal}`);
      }
      started = true;
    } else if (
      !started
      && primingMode === "authenticated-state"
      && request.action !== "pin_blob"
      && request.action !== "pin_json"
    ) {
      const ordinal = input.plan.nextOperation?.globalOrdinal ?? "terminal";
      fail(`first continuation mutation differs from global operation ${ordinal}`);
    } else if (!started && fingerprint && historicalFingerprints.has(fingerprint)) {
      fail(`refusing duplicate recovered side effect from ${actor}: ${request.action}`);
    }
    return input.delegates[actor](request);
  }) as PastaUiLiveBridgeHandler])) as Record<RavioliUiLiveJournalActor, PastaUiLiveBridgeHandler>;
  return Object.freeze({
    handles: Object.freeze(handles),
    isReplayComplete: () => remaining() === 0,
    getRemainingReplayStepCount: remaining,
    getCompletedReplayStepCount: done,
    continuationStarted: () => started,
  });
}
