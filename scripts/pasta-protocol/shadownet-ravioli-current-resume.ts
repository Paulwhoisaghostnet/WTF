import { createDecipheriv, createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { Page } from "playwright";
import { CID } from "multiformats/cid";
import * as rawCodec from "multiformats/codecs/raw";
import { create as createMultihashDigest } from "multiformats/hashes/digest";

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
  "block_header",
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

export type RavioliRejectedPreDelegationRecoveryBridge = Readonly<{
  restoration: RavioliPrivateRecoveryRestoration;
  evidence: Readonly<{
    schema: "pastaprotocol-ravioli-rejected-pre-delegation-recovery@1";
    disposition: "VERIFIED_REJECTED_BEFORE_DELEGATION";
    sourceManifestSha256: string;
    sourceRecordSha256: string;
    reconciledRecordSha256: string;
    storageKeySha256: string;
    journalId: string;
    completedOperationCount: 30;
    nextGlobalOperation: 31;
    wrapperPinSequence: 21;
    wrapperPinSha256: string;
    terminalStage: "RECOVERY_BRIDGE_REJECTION_VERIFIED_NO_SUBMISSION";
    operationHashAbsent: true;
    diskSnapshotMutated: false;
  }>;
}>;

export type RavioliPreparedSealedPinRecoveryBridge = Readonly<{
  restoration: RavioliPrivateRecoveryRestoration;
  envelope: Readonly<{
    cid: string;
    fileName: "ravioli-sealed-reveal-2.json";
    mimeType: "application/json";
    bytes: Uint8Array;
    value: Readonly<JsonRecord>;
    sha256: string;
    byteLength: number;
  }>;
  entropy: Readonly<{
    nonceHex: string;
    saltHex: string;
    offset: number;
    iv: Uint8Array;
  }>;
  evidence: Readonly<{
    schema: "pastaprotocol-ravioli-prepared-sealed-pin-recovery@1";
    disposition: "AUTHENTICATED_LOCAL_PIN_FOR_ZERO_ADD_ADOPTION";
    sourceManifestSha256: string;
    sourceRecordSha256: string;
    reconciledRecordSha256: string;
    storageKeySha256: string;
    journalId: string;
    completedOperationCount: 20;
    nextGlobalOperation: 21;
    authenticatedThroughEventIndex: 59;
    preparedPinSequence: 14;
    preparedPinCid: string;
    preparedPinSha256: string;
    preparedPinByteLength: number;
    terminalStage: "RECOVERY_PREPARED_PIN_AUTHENTICATED_FOR_REPLAY";
    diskSnapshotMutated: false;
  }>;
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
const PREPARED_SEALED_PIN_RECOVERY_BRIDGES =
  new WeakSet<RavioliPreparedSealedPinRecoveryBridge>();
const PREPARED_SEALED_PIN_RECOVERY_PLANS =
  new WeakMap<RavioliPreparedSealedPinRecoveryBridge, RavioliCurrentResumePlan>();

export function assertAuthenticatedRavioliPreparedSealedPinRecovery(
  bridge: RavioliPreparedSealedPinRecoveryBridge,
): void {
  if (!PREPARED_SEALED_PIN_RECOVERY_BRIDGES.has(bridge)) {
    fail("prepared sealed-pin bridge was not produced by the authenticated reconciler");
  }
}
const PLAN_EVENT_COUNTS = new WeakMap<RavioliCurrentResumePlan, number>();

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

const REJECTED_PRE_DELEGATION_MESSAGE =
  "Ravioli current resume: refusing duplicate recovered side effect from creator: call";
const REJECTED_PRE_DELEGATION_TERMINAL_STAGE =
  "RECOVERY_BRIDGE_REJECTION_VERIFIED_NO_SUBMISSION" as const;

function operationHashStrings(value: unknown, hashes: string[] = []): string[] {
  if (typeof value === "string") {
    if (OPERATION_RE.test(value)) hashes.push(value);
    return hashes;
  }
  if (Array.isArray(value)) {
    for (const entry of value) operationHashStrings(entry, hashes);
    return hashes;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) operationHashStrings(entry, hashes);
  }
  return hashes;
}

/**
 * Closes one historical browser recovery record only when the exact live-
 * reconciled operation-30 boundary proves that its signer intent was rejected
 * before the bridge delegated to the journal or signer. The source snapshot is
 * never changed here; callers install the returned in-memory restoration and
 * let the next ordinary private-recovery capture persist the new checkpoint.
 */
export function reconcileRavioliRejectedPreDelegationRecovery(
  plan: RavioliCurrentResumePlan,
): RavioliRejectedPreDelegationRecoveryBridge {
  if (!LIVE_RECONCILED_PLANS.has(plan)) {
    fail("rejected pre-delegation recovery requires the exact live-reconciled plan object");
  }
  if (
    plan.classification !== "CURRENT_SAFE_PREFIX"
    || plan.completedOperationCount !== 30
    || plan.operations.length !== 30
    || plan.pins.length !== 21
    || plan.nextOperation?.globalOrdinal !== 31
    || plan.nextOperation.id !== "mode-4-hybrid-atomic-pack:authorize-gnocchi-adapter"
    || plan.nextOperation.actor !== "creator"
    || plan.nextOperation.action !== "call"
    || plan.nextOperation.targetRole !== "gnocchi"
    || plan.nextOperation.entrypoint !== "add_minter"
    || plan.nextOperation.operationSequence !== 28
  ) {
    fail("rejected pre-delegation recovery is outside the exact operation-30 boundary");
  }
  const lastOperation = plan.operations.at(-1);
  const wrapperPin = plan.pins.at(-1);
  if (
    !lastOperation
    || lastOperation.eventIndex !== 111
    || lastOperation.expected.globalOrdinal !== 30
    || !wrapperPin
    || wrapperPin.eventIndex !== 112
    || wrapperPin.pinSequence !== 21
    || wrapperPin.actor !== "creator"
    || wrapperPin.action !== "pin_blob"
    || wrapperPin.proof.fileName !== "ravioli-wrapper-4.png"
    || wrapperPin.proof.mimeType !== "image/png"
    || wrapperPin.proof.sha256 !== sha256(wrapperPin.bytes)
  ) {
    fail("rejected pre-delegation recovery wrapper pin boundary drifted");
  }

  const gnocchi = String(plan.targetBindings.gnocchi || "");
  const gnocchiAdapter = String(plan.targetBindings.gnocchiAdapter || "");
  const router = String(plan.targetBindings.router || "");
  if (!gnocchi || !gnocchiAdapter || !router) {
    fail("rejected pre-delegation recovery target bindings are incomplete");
  }
  const creatorSigners = new Set(plan.operations
    .filter((operation) => operation.actor === "creator")
    .map((operation) => String(operation.evidence.signerAddress || "")));
  if (creatorSigners.size !== 1 || creatorSigners.has("")) {
    fail("rejected pre-delegation recovery creator identity is ambiguous");
  }
  const creator = [...creatorSigners][0]!;

  const source = plan.privateRecovery;
  if (!source) fail("rejected pre-delegation recovery snapshot is unavailable");
  const unfinished = source.records.filter((entry) => entry.status !== "COMPLETE");
  if (unfinished.length !== 1) {
    fail("rejected pre-delegation recovery requires exactly one unfinished record");
  }
  const sourceRecord = unfinished[0]!;
  if (
    sourceRecord.account !== creator
    || sourceRecord.contract !== router
    || sourceRecord.tokenId !== 4
    || sourceRecord.status !== "FAILED"
    || sourceRecord.workflow !== "publish"
    || sourceRecord.stage !== "PUBLISH_FAILED"
    || sourceRecord.operationHashes.length !== 0
    || sha256(Buffer.from(sourceRecord.value, "utf8")) !== sourceRecord.sha256
  ) {
    fail("rejected pre-delegation recovery public record identity drifted");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceRecord.value);
  } catch {
    fail("rejected pre-delegation recovery record is not JSON");
  }
  const recovery = record(parsed, "rejected pre-delegation recovery record");
  if (JSON.stringify(recovery) !== sourceRecord.value) {
    fail("rejected pre-delegation recovery record is not an exact JSON round trip");
  }
  exactKeys(recovery, [
    "schema",
    "encoding",
    "status",
    "draftId",
    "network",
    "account",
    "contract",
    "tokenId",
    "kit",
    "product",
    "history",
    "createdAt",
    "updatedAt",
  ], "rejected pre-delegation recovery record");
  const draftId = String(recovery.draftId || "");
  if (
    recovery.schema !== PRIVATE_RECORD_SCHEMA
    || recovery.encoding !== PRIVATE_RECORD_ENCODING
    || recovery.status !== "FAILED"
    || recovery.network !== "shadownet"
    || recovery.account !== creator
    || recovery.contract !== router
    || recovery.tokenId !== 4
    || recovery.kit !== null
    || !/^[0-9a-f]{32}$/.test(draftId)
    || sourceRecord.storageKey !== `pasta.ravioli.publish-recovery-draft.v1:shadownet:${creator}:${draftId}`
  ) {
    fail("rejected pre-delegation recovery private record identity drifted");
  }
  const product = record(recovery.product, "rejected pre-delegation recovery product");
  exactKeys(product, [
    "name",
    "mode",
    "editions",
    "target",
    "workflow",
    "expectedTerminalStage",
  ], "rejected pre-delegation recovery product");
  exactJson(product, {
    name: "Ravioli UI-LIVE Hybrid Three Primitive Pack",
    mode: "hybrid_atomic_pack",
    editions: 1,
    target: "existing_contract",
    workflow: "publish",
    expectedTerminalStage: "FINALIZE_BLIND_PACK",
  }, "rejected pre-delegation recovery product");

  if (!Array.isArray(recovery.history) || recovery.history.length !== 5) {
    fail("rejected pre-delegation recovery history length drifted");
  }
  const history = recovery.history.map((entry: unknown, index: number) =>
    record(entry, `rejected pre-delegation recovery history ${index + 1}`));
  const expectedStages = [
    "DRAFT_SAVED_BEFORE_SIDE_EFFECT",
    "PIN_WRAPPER_ARTIFACT:PREPARED",
    "PIN_WRAPPER_ARTIFACT:CONFIRMED",
    "AUTHORIZE_GNOCCHI_ADAPTER:PREPARED",
    "PUBLISH_FAILED",
  ];
  const expectedStatuses = ["IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "FAILED"];
  if (
    !history.every((entry, index) => (
      entry.stage === expectedStages[index]
      && entry.status === expectedStatuses[index]
      && Number.isFinite(Date.parse(String(entry.at || "")))
    ))
  ) {
    fail("rejected pre-delegation recovery history identity drifted");
  }
  exactKeys(history[0]!, ["stage", "status", "at"], "rejected pre-delegation draft history");
  for (const index of [1, 2, 3, 4]) {
    exactKeys(history[index]!, ["stage", "status", "at", "details"], `rejected pre-delegation history ${index + 1}`);
  }
  const timestamps = history.map((entry) => Date.parse(String(entry.at)));
  if (
    recovery.createdAt !== history[0]!.at
    || recovery.updatedAt !== history.at(-1)!.at
    || timestamps.some((value, index) => index > 0 && value < timestamps[index - 1]!)
  ) {
    fail("rejected pre-delegation recovery timestamps drifted");
  }
  exactJson(history[1]!.details, {
    fileName: wrapperPin.proof.fileName,
    byteLength: wrapperPin.proof.byteLength,
    valueSha256: wrapperPin.proof.sha256,
  }, "rejected pre-delegation wrapper pin preparation");
  exactJson(history[2]!.details, {
    fileName: wrapperPin.proof.fileName,
    byteLength: wrapperPin.proof.byteLength,
    valueSha256: wrapperPin.proof.sha256,
    uri: wrapperPin.proof.uri,
  }, "rejected pre-delegation wrapper pin confirmation");
  const preparedDetails = record(
    history[3]!.details,
    "rejected pre-delegation signer preparation details",
  );
  exactKeys(preparedDetails, ["intent", "intentSha256"], "rejected pre-delegation signer preparation details");
  const intent = record(preparedDetails.intent, "rejected pre-delegation signer intent");
  exactJson(intent, {
    action: "call",
    entrypoint: "add_minter",
    expectedCounter: null,
    network: "shadownet",
    payload: gnocchiAdapter,
    signer: creator,
    target: gnocchi,
  }, "rejected pre-delegation signer intent");
  if (preparedDetails.intentSha256 !== sha256(Buffer.from(deterministicJsonBytes(intent)))) {
    fail("rejected pre-delegation signer intent digest drifted");
  }
  exactJson(history[4]!.details, {
    message: REJECTED_PRE_DELEGATION_MESSAGE,
  }, "rejected pre-delegation failure");
  if (operationHashStrings(recovery).length !== 0) {
    fail("rejected pre-delegation recovery unexpectedly contains an operation hash");
  }

  const reconciledAt = new Date(Date.parse(String(recovery.updatedAt)) + 1).toISOString();
  const terminalDetails = Object.freeze({
    disposition: "VERIFIED_REJECTED_BEFORE_DELEGATION",
    sourceRecoverySha256: sourceRecord.sha256,
    journalId: plan.journalId,
    completedOperationCount: 30,
    nextGlobalOperation: 31,
    wrapperPinSequence: 21,
    wrapperPinSha256: wrapperPin.proof.sha256,
    operationHashAbsent: true,
  });
  const reconciledValue = JSON.stringify({
    ...recovery,
    status: "COMPLETE",
    history: [
      ...history,
      {
        stage: REJECTED_PRE_DELEGATION_TERMINAL_STAGE,
        status: "COMPLETE",
        at: reconciledAt,
        details: terminalDetails,
      },
    ],
    updatedAt: reconciledAt,
  });
  const reconciledBytes = Buffer.from(reconciledValue, "utf8");
  const reconciledRecord = privateRecordSummary(
    sourceRecord.storageKey,
    reconciledBytes,
    new Set([creator]),
    new Set([router]),
    new Set(),
  );
  if (
    reconciledRecord.status !== "COMPLETE"
    || reconciledRecord.stage !== REJECTED_PRE_DELEGATION_TERMINAL_STAGE
    || reconciledRecord.operationHashes.length !== 0
  ) {
    fail("rejected pre-delegation recovery terminal transformation drifted");
  }
  const restoration = Object.freeze({
    ...source,
    records: Object.freeze(source.records.map((entry) =>
      entry === sourceRecord ? reconciledRecord : entry)),
  });
  const evidence = Object.freeze({
    schema: "pastaprotocol-ravioli-rejected-pre-delegation-recovery@1" as const,
    disposition: "VERIFIED_REJECTED_BEFORE_DELEGATION" as const,
    sourceManifestSha256: source.manifestSha256,
    sourceRecordSha256: sourceRecord.sha256,
    reconciledRecordSha256: reconciledRecord.sha256,
    storageKeySha256: sha256(Buffer.from(sourceRecord.storageKey, "utf8")),
    journalId: plan.journalId,
    completedOperationCount: 30 as const,
    nextGlobalOperation: 31 as const,
    wrapperPinSequence: 21 as const,
    wrapperPinSha256: wrapperPin.proof.sha256,
    terminalStage: REJECTED_PRE_DELEGATION_TERMINAL_STAGE,
    operationHashAbsent: true as const,
    diskSnapshotMutated: false as const,
  });
  const bridge = { evidence } as {
    evidence: typeof evidence;
    restoration?: RavioliPrivateRecoveryRestoration;
  };
  Object.defineProperty(bridge, "restoration", {
    value: restoration,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(bridge as RavioliRejectedPreDelegationRecoveryBridge);
}

/**
 * Closes the exact operation-67 Studio recovery record that was created when
 * the creator bridge rejected recover_adapter before journal PREPARED. The
 * authenticated operation-66 boundary proves that no operation-67 hash or
 * signer-counter advance exists; the source snapshot remains immutable.
 */
export function reconcileRavioliOp66RejectedPreDelegationRecovery(
  plan: RavioliCurrentResumePlan,
): Readonly<{
  restoration: RavioliPrivateRecoveryRestoration;
  evidence: Readonly<JsonRecord>;
}> {
  if (!LIVE_RECONCILED_PLANS.has(plan)) {
    fail("operation-66 rejected recovery requires the exact live-reconciled plan object");
  }
  if (
    plan.classification !== "CURRENT_SAFE_PREFIX"
    || plan.completedOperationCount !== 66
    || plan.operations.length !== 66
    || plan.pins.length !== 34
    || plan.nextOperation?.globalOrdinal !== 67
    || plan.nextOperation.id !== "withheld-reveal-refund:creator-recover-adapter"
    || plan.nextOperation.actor !== "creator"
    || plan.nextOperation.action !== "call"
    || plan.nextOperation.targetRole !== "router"
    || plan.nextOperation.entrypoint !== "recover_adapter"
    || plan.nextOperation.operationSequence !== 49
    || plan.nextOperation.tokenId !== 5
  ) {
    fail("operation-66 rejected recovery is outside the exact operation-66 boundary");
  }
  const lastOperation = plan.operations.at(-1);
  const lastPin = plan.pins.at(-1);
  if (
    !lastOperation
    || lastOperation.eventIndex !== 233
    || lastOperation.expected.globalOrdinal !== 66
    || lastOperation.expected.entrypoint !== "withdraw_refund"
    || !lastPin
    || lastPin.eventIndex !== 209
    || lastPin.pinSequence !== 34
    || lastPin.actor !== "creator"
    || lastPin.action !== "pin_json"
    || lastPin.proof.fileName !== "token.json"
    || lastPin.proof.sha256 !== sha256(lastPin.bytes)
  ) {
    fail("operation-66 rejected recovery journal boundary drifted");
  }
  const router = String(plan.targetBindings.router || "");
  const gnocchiAdapter = String(plan.targetBindings.gnocchiAdapter || "");
  if (!router || !gnocchiAdapter) {
    fail("operation-66 rejected recovery target bindings are incomplete");
  }
  const creatorSigners = new Set(plan.operations
    .filter((operation) => operation.actor === "creator")
    .map((operation) => String(operation.evidence.signerAddress || "")));
  if (creatorSigners.size !== 1 || creatorSigners.has("")) {
    fail("operation-66 rejected recovery creator identity is ambiguous");
  }
  const creator = [...creatorSigners][0]!;
  const source = plan.privateRecovery;
  if (!source) fail("operation-66 rejected recovery snapshot is unavailable");
  const unfinished = source.records.filter((entry) => entry.status !== "COMPLETE");
  if (unfinished.length !== 1) {
    fail("operation-66 rejected recovery requires exactly one unfinished record");
  }
  const sourceRecord = unfinished[0]!;
  if (
    sourceRecord.account !== creator
    || sourceRecord.contract !== router
    || sourceRecord.tokenId !== 5
    || sourceRecord.status !== "FAILED"
    || sourceRecord.workflow !== "recover_adapter"
    || sourceRecord.stage !== "RECOVER_ADAPTER_FAILED"
    || sourceRecord.operationHashes.length !== 0
    || sha256(Buffer.from(sourceRecord.value, "utf8")) !== sourceRecord.sha256
  ) {
    fail("operation-66 rejected recovery public record identity drifted");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceRecord.value);
  } catch {
    fail("operation-66 rejected recovery record is not JSON");
  }
  const recovery = record(parsed, "operation-66 rejected recovery record");
  if (JSON.stringify(recovery) !== sourceRecord.value) {
    fail("operation-66 rejected recovery record is not an exact JSON round trip");
  }
  exactKeys(recovery, [
    "schema", "encoding", "status", "draftId", "network", "account",
    "contract", "tokenId", "kit", "product", "history", "createdAt", "updatedAt",
  ], "operation-66 rejected recovery record");
  const draftId = String(recovery.draftId || "");
  if (
    recovery.schema !== PRIVATE_RECORD_SCHEMA
    || recovery.encoding !== PRIVATE_RECORD_ENCODING
    || recovery.status !== "FAILED"
    || recovery.network !== "shadownet"
    || recovery.account !== creator
    || recovery.contract !== router
    || recovery.tokenId !== 5
    || recovery.kit !== null
    || !/^[0-9a-f]{32}$/.test(draftId)
    || sourceRecord.storageKey !== `pasta.ravioli.publish-recovery-draft.v1:shadownet:${creator}:${draftId}`
  ) {
    fail("operation-66 rejected recovery private record identity drifted");
  }
  const product = record(recovery.product, "operation-66 rejected recovery product");
  exactKeys(product, [
    "name", "mode", "editions", "target", "workflow", "expectedTerminalStage",
  ], "operation-66 rejected recovery product");
  exactJson(product, {
    name: "Recover Ravioli adapter capacity for pack 5",
    mode: "adapter-recovery",
    editions: 2,
    target: "existing_contract",
    workflow: "recover_adapter",
    expectedTerminalStage: "RECOVER_ADAPTER",
  }, "operation-66 rejected recovery product");
  if (!Array.isArray(recovery.history) || recovery.history.length !== 4) {
    fail("operation-66 rejected recovery history length drifted");
  }
  const history = recovery.history.map((entry: unknown, index: number) =>
    record(entry, `operation-66 rejected recovery history ${index + 1}`));
  const expectedStages = [
    "DRAFT_SAVED_BEFORE_SIDE_EFFECT",
    "RECOVER_ADAPTER_PREFLIGHT_VERIFIED",
    "RECOVER_ADAPTER:PREPARED",
    "RECOVER_ADAPTER_FAILED",
  ];
  const expectedStatuses = ["IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "FAILED"];
  if (!history.every((entry, index) => (
    entry.stage === expectedStages[index]
    && entry.status === expectedStatuses[index]
    && Number.isFinite(Date.parse(String(entry.at || "")))
  ))) {
    fail("operation-66 rejected recovery history identity drifted");
  }
  exactKeys(history[0]!, ["stage", "status", "at"], "operation-66 recovery draft history");
  for (const index of [1, 2, 3]) {
    exactKeys(history[index]!, ["stage", "status", "at", "details"], `operation-66 recovery history ${index + 1}`);
  }
  const timestamps = history.map((entry) => Date.parse(String(entry.at)));
  if (
    recovery.createdAt !== history[0]!.at
    || recovery.updatedAt !== history.at(-1)!.at
    || timestamps.some((value, index) => index > 0 && value < timestamps[index - 1]!)
  ) {
    fail("operation-66 rejected recovery timestamps drifted");
  }
  exactJson(history[1]!.details, {
    adapter: gnocchiAdapter,
    kind: 1,
    resourceId: 2,
    capacity: 2,
    allowanceBefore: 2,
    reservationBefore: 2,
  }, "operation-66 adapter recovery preflight");
  const preparedDetails = record(history[2]!.details, "operation-66 recovery signer preparation");
  exactKeys(preparedDetails, ["intent", "intentSha256"], "operation-66 recovery signer preparation");
  const intent = record(preparedDetails.intent, "operation-66 recovery signer intent");
  exactJson(intent, {
    action: "call",
    entrypoint: "recover_adapter",
    expectedCounter: null,
    network: "shadownet",
    payload: {
      adapter: gnocchiAdapter,
      capacity: 2,
      kind: 1,
      resource_id: 2,
      token_id: 5,
    },
    signer: creator,
    target: router,
  }, "operation-66 recovery signer intent");
  if (preparedDetails.intentSha256 !== sha256(Buffer.from(deterministicJsonBytes(intent)))) {
    fail("operation-66 rejected recovery signer intent digest drifted");
  }
  exactJson(history[3]!.details, {
    message: "contract entrypoint is not allowed: recover_adapter",
  }, "operation-66 rejected recovery failure");
  if (operationHashStrings(recovery).length !== 0) {
    fail("operation-66 rejected recovery unexpectedly contains an operation hash");
  }
  const reconciledAt = new Date(Date.parse(String(recovery.updatedAt)) + 1).toISOString();
  const terminalDetails = Object.freeze({
    disposition: "VERIFIED_REJECTED_BEFORE_DELEGATION",
    sourceRecoverySha256: sourceRecord.sha256,
    journalId: plan.journalId,
    completedOperationCount: 66,
    nextGlobalOperation: 67,
    tokenId: 5,
    operationHashAbsent: true,
  });
  const reconciledValue = JSON.stringify({
    ...recovery,
    status: "COMPLETE",
    history: [...history, {
      stage: REJECTED_PRE_DELEGATION_TERMINAL_STAGE,
      status: "COMPLETE",
      at: reconciledAt,
      details: terminalDetails,
    }],
    updatedAt: reconciledAt,
  });
  const reconciledRecord = privateRecordSummary(
    sourceRecord.storageKey,
    Buffer.from(reconciledValue, "utf8"),
    new Set([creator]),
    new Set([router]),
    new Set(),
  );
  if (
    reconciledRecord.status !== "COMPLETE"
    || reconciledRecord.stage !== REJECTED_PRE_DELEGATION_TERMINAL_STAGE
    || reconciledRecord.operationHashes.length !== 0
  ) {
    fail("operation-66 rejected recovery terminal transformation drifted");
  }
  const restoration = Object.freeze({
    ...source,
    records: Object.freeze(source.records.map((entry) =>
      entry === sourceRecord ? reconciledRecord : entry)),
  });
  return Object.freeze({
    restoration,
    evidence: Object.freeze({
      schema: "pastaprotocol-ravioli-op66-rejected-pre-delegation-recovery@1",
      disposition: "VERIFIED_REJECTED_BEFORE_DELEGATION",
      sourceManifestSha256: source.manifestSha256,
      sourceRecordSha256: sourceRecord.sha256,
      reconciledRecordSha256: reconciledRecord.sha256,
      storageKeySha256: sha256(Buffer.from(sourceRecord.storageKey, "utf8")),
      journalId: plan.journalId,
      completedOperationCount: 66,
      nextGlobalOperation: 67,
      tokenId: 5,
      terminalStage: REJECTED_PRE_DELEGATION_TERMINAL_STAGE,
      operationHashAbsent: true,
      diskSnapshotMutated: false,
    }),
  });
}

const PREPARED_SEALED_PIN_TERMINAL_STAGE =
  "RECOVERY_PREPARED_PIN_AUTHENTICATED_FOR_REPLAY" as const;
const SEALED_REVEAL_SCHEMA = "pasta-ravioli-sealed-reveal@1";
const SEALED_REVEAL_CIPHER = "AES-256-GCM";
const SEALED_REVEAL_KDF =
  "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)";

function exactRecoveryHistoryEntry(
  value: unknown,
  expected: Readonly<{ stage: string; status?: string; keys: readonly string[] }>,
  label: string,
): JsonRecord {
  const entry = record(value, label);
  exactKeys(entry, expected.keys, label);
  if (entry.stage !== expected.stage || entry.status !== (expected.status ?? "IN_PROGRESS")) {
    fail(`${label} identity drifted`);
  }
  if (!Number.isFinite(Date.parse(String(entry.at || "")))) {
    fail(`${label} timestamp is invalid`);
  }
  return entry;
}

function exactPreparedPinHistory(input: {
  prepared: JsonRecord;
  confirmed: JsonRecord;
  pin: RavioliCurrentResumePin;
  fileName: string;
  includesByteLength: boolean;
  label: string;
}): void {
  const preparedDetails = record(input.prepared.details, `${input.label} preparation details`);
  const confirmedDetails = record(input.confirmed.details, `${input.label} confirmation details`);
  exactKeys(
    preparedDetails,
    ["fileName", ...(input.includesByteLength ? ["byteLength"] : []), "valueSha256"],
    `${input.label} preparation details`,
  );
  exactKeys(
    confirmedDetails,
    ["fileName", ...(input.includesByteLength ? ["byteLength"] : []), "valueSha256", "uri"],
    `${input.label} confirmation details`,
  );
  const expected = {
    fileName: input.fileName,
    ...(input.includesByteLength ? { byteLength: input.pin.proof.byteLength } : {}),
    valueSha256: input.pin.proof.sha256,
  };
  exactJson(preparedDetails, expected, `${input.label} preparation`);
  exactJson(
    confirmedDetails,
    { ...expected, uri: input.pin.proof.uri },
    `${input.label} confirmation`,
  );
}

function exactPreparedOperationHistory(input: {
  prepared: JsonRecord;
  submitted: JsonRecord;
  confirmed: JsonRecord;
  operation: RavioliCurrentResumeOperation;
  expectedIntent: unknown;
  label: string;
}): void {
  const preparedDetails = record(input.prepared.details, `${input.label} preparation details`);
  exactKeys(preparedDetails, ["intent", "intentSha256"], `${input.label} preparation details`);
  exactJson(preparedDetails.intent, input.expectedIntent, `${input.label} signer intent`);
  const intentSha256 = sha256(deterministicJsonBytes(preparedDetails.intent));
  if (preparedDetails.intentSha256 !== intentSha256) {
    fail(`${input.label} signer intent digest drifted`);
  }
  for (const [phase, entry] of [["submitted", input.submitted], ["confirmed", input.confirmed]] as const) {
    const details = record(entry.details, `${input.label} ${phase} details`);
    exactKeys(details, ["intentSha256"], `${input.label} ${phase} details`);
    if (
      details.intentSha256 !== intentSha256
      || entry.operationHash !== input.operation.operationHash
    ) {
      fail(`${input.label} ${phase} operation identity drifted`);
    }
  }
}

/**
 * Authenticates the exact operation-20 browser checkpoint whose Kubo add
 * completed before public-gateway verification. The returned restoration is
 * in-memory only; the original private snapshot remains immutable. The caller
 * may return the authenticated proof for the next exact pin_json request, but
 * must not perform another Kubo /add.
 */
export function reconcileRavioliPreparedSealedPinRecovery(input: {
  plan: RavioliCurrentResumePlan;
  envelopeBytes: Uint8Array;
}): RavioliPreparedSealedPinRecoveryBridge {
  const plan = input.plan;
  if (!LIVE_RECONCILED_PLANS.has(plan)) {
    fail("prepared sealed-pin recovery requires the exact live-reconciled plan object");
  }
  if (
    plan.classification !== "CURRENT_SAFE_PREFIX"
    || plan.completedOperationCount !== 20
    || PLAN_EVENT_COUNTS.get(plan) !== 74
    || plan.operations.length !== 20
    || plan.pins.length !== 13
    || plan.nextOperation?.globalOrdinal !== 21
    || plan.nextOperation.id !== "mode-2-blind-allocated-mint:create-pack"
    || plan.nextOperation.actor !== "creator"
    || plan.nextOperation.action !== "call"
    || plan.nextOperation.targetRole !== "router"
    || plan.nextOperation.entrypoint !== "create_pack"
    || plan.nextOperation.tokenId !== 2
  ) {
    fail("prepared sealed-pin recovery is outside the exact operation-20/event-74/thirteen-pin boundary");
  }
  const operation = (ordinal: number): RavioliCurrentResumeOperation => {
    const match = plan.operations.find((candidate) => candidate.expected.globalOrdinal === ordinal);
    if (!match) fail(`prepared sealed-pin recovery is missing operation ${ordinal}`);
    return match;
  };
  const pin = (sequence: number): RavioliCurrentResumePin => {
    const match = plan.pins.find((candidate) => candidate.pinSequence === sequence);
    if (!match) fail(`prepared sealed-pin recovery is missing pin ${sequence}`);
    return match;
  };
  const operation16 = operation(16);
  const operation17 = operation(17);
  const operation18 = operation(18);
  const operation19 = operation(19);
  const operation20 = operation(20);
  const wrapperPin = pin(11);
  const adapterPin = pin(12);
  const manifestPin = pin(13);
  if (
    operation16.eventIndex !== 59
    || wrapperPin.eventIndex !== 60
    || adapterPin.eventIndex !== 61
    || operation17.eventIndex !== 64
    || operation18.eventIndex !== 67
    || operation19.eventIndex !== 70
    || operation20.eventIndex !== 73
    || manifestPin.eventIndex !== 74
  ) {
    fail("prepared sealed-pin recovery browser checkpoint topology drifted");
  }

  const router = String(plan.targetBindings.router || "");
  const gnocchi = String(plan.targetBindings.gnocchi || "");
  const adapter = String(plan.targetBindings.gnocchiAdapter || "");
  if (!router || !gnocchi || !adapter || operation17.contractAddress !== adapter) {
    fail("prepared sealed-pin recovery target bindings are incomplete");
  }
  const creatorSigners = new Set(plan.operations
    .filter((candidate) => candidate.actor === "creator")
    .map((candidate) => String(candidate.evidence.signerAddress || "")));
  if (creatorSigners.size !== 1 || creatorSigners.has("")) {
    fail("prepared sealed-pin recovery creator identity is ambiguous");
  }
  const creator = [...creatorSigners][0]!;

  const source = plan.privateRecovery;
  if (!source) fail("prepared sealed-pin recovery snapshot is unavailable");
  const unfinished = source.records.filter((entry) => entry.status !== "COMPLETE");
  if (unfinished.length !== 1) {
    fail("prepared sealed-pin recovery requires exactly one unfinished record");
  }
  const sourceRecord = unfinished[0]!;
  if (
    sourceRecord.account !== creator
    || sourceRecord.contract !== router
    || sourceRecord.tokenId !== 2
    || sourceRecord.status !== "IN_PROGRESS"
    || sourceRecord.workflow !== "publish"
    || sourceRecord.stage !== "PIN_SEALED_REVEAL:PREPARED"
    || sha256(Buffer.from(sourceRecord.value, "utf8")) !== sourceRecord.sha256
  ) {
    fail("prepared sealed-pin recovery public record identity drifted");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceRecord.value);
  } catch {
    fail("prepared sealed-pin recovery record is not JSON");
  }
  const recovery = record(parsed, "prepared sealed-pin recovery record");
  if (JSON.stringify(recovery) !== sourceRecord.value) {
    fail("prepared sealed-pin recovery record is not an exact JSON round trip");
  }
  exactKeys(recovery, [
    "schema",
    "encoding",
    "status",
    "draftId",
    "network",
    "account",
    "contract",
    "tokenId",
    "kit",
    "product",
    "history",
    "createdAt",
    "updatedAt",
  ], "prepared sealed-pin recovery record");
  const draftId = String(recovery.draftId || "");
  if (
    recovery.schema !== PRIVATE_RECORD_SCHEMA
    || recovery.encoding !== PRIVATE_RECORD_ENCODING
    || recovery.status !== "IN_PROGRESS"
    || recovery.network !== "shadownet"
    || recovery.account !== creator
    || recovery.contract !== router
    || recovery.tokenId !== 2
    || recovery.kit !== null
    || !/^[0-9a-f]{32}$/.test(draftId)
    || sourceRecord.storageKey !== `pasta.ravioli.publish-recovery-draft.v1:shadownet:${creator}:${draftId}`
  ) {
    fail("prepared sealed-pin recovery private record identity drifted");
  }
  exactJson(recovery.product, {
    name: "Ravioli UI-LIVE Reserved Allocation",
    mode: "blind_allocated_mint",
    editions: 1,
    target: "existing_contract",
    workflow: "publish",
    expectedTerminalStage: "FINALIZE_BLIND_PACK",
  }, "prepared sealed-pin recovery product");

  if (!Array.isArray(recovery.history) || recovery.history.length !== 22) {
    fail("prepared sealed-pin recovery history length drifted");
  }
  const expectedStages = [
    "DRAFT_SAVED_BEFORE_SIDE_EFFECT",
    "PIN_WRAPPER_ARTIFACT:PREPARED",
    "PIN_WRAPPER_ARTIFACT:CONFIRMED",
    "PIN_GNOCCHI_ADAPTER_METADATA:PREPARED",
    "PIN_GNOCCHI_ADAPTER_METADATA:CONFIRMED",
    "ORIGINATE_GNOCCHI_ADAPTER:PREPARED",
    "ORIGINATE_GNOCCHI_ADAPTER:SUBMITTED",
    "ORIGINATE_GNOCCHI_ADAPTER:CONFIRMED",
    "ORIGINATE_GNOCCHI_ADAPTER:ADDRESS_BOUND",
    "AUTHORIZE_GNOCCHI_ADAPTER:PREPARED",
    "AUTHORIZE_GNOCCHI_ADAPTER:SUBMITTED",
    "AUTHORIZE_GNOCCHI_ADAPTER:CONFIRMED",
    "CREATE_GNOCCHI_ALLOCATION:PREPARED",
    "CREATE_GNOCCHI_ALLOCATION:SUBMITTED",
    "CREATE_GNOCCHI_ALLOCATION:CONFIRMED",
    "AUTHORIZE_GNOCCHI_ROUTER:PREPARED",
    "AUTHORIZE_GNOCCHI_ROUTER:SUBMITTED",
    "AUTHORIZE_GNOCCHI_ROUTER:CONFIRMED",
    "PIN_PACK_MANIFEST:PREPARED",
    "PIN_PACK_MANIFEST:CONFIRMED",
    "SEALED_REVEAL_PREIMAGE_SAVED_BEFORE_PIN",
    "PIN_SEALED_REVEAL:PREPARED",
  ] as const;
  const history = recovery.history.map((entry: unknown, index: number) =>
    exactRecoveryHistoryEntry(entry, {
      stage: expectedStages[index]!,
      keys: index === 0
        ? ["stage", "status", "at"]
        : ["stage", "status", "at", "details", ...([6, 7, 8, 10, 11, 13, 14, 16, 17].includes(index) ? ["operationHash"] : [])],
    }, `prepared sealed-pin recovery history ${index + 1}`));
  const timestamps = history.map((entry) => Date.parse(String(entry.at)));
  if (
    recovery.createdAt !== history[0]!.at
    || recovery.updatedAt !== history.at(-1)!.at
    || timestamps.some((value, index) => index > 0 && value < timestamps[index - 1]!)
  ) {
    fail("prepared sealed-pin recovery timestamps drifted");
  }

  exactPreparedPinHistory({
    prepared: history[1]!,
    confirmed: history[2]!,
    pin: wrapperPin,
    fileName: "ravioli-wrapper-2.png",
    includesByteLength: true,
    label: "prepared sealed-pin wrapper pin",
  });
  exactPreparedPinHistory({
    prepared: history[3]!,
    confirmed: history[4]!,
    pin: adapterPin,
    fileName: "pasta-gnocchi-pack-adapter-contract.json",
    includesByteLength: false,
    label: "prepared sealed-pin adapter metadata pin",
  });
  exactPreparedPinHistory({
    prepared: history[18]!,
    confirmed: history[19]!,
    pin: manifestPin,
    fileName: "ravioli-pack-manifest.json",
    includesByteLength: false,
    label: "prepared sealed-pin pack manifest pin",
  });

  if (operation17.descriptor.kind !== "originate") {
    fail("prepared sealed-pin operation 17 is not an origination");
  }
  const operation17PreparedDetails = record(history[5]!.details, "prepared sealed-pin operation 17 details");
  const operation17Intent = record(operation17PreparedDetails.intent, "prepared sealed-pin operation 17 intent");
  exactPreparedOperationHistory({
    prepared: history[5]!,
    submitted: history[6]!,
    confirmed: history[7]!,
    operation: operation17,
    expectedIntent: operation17Intent,
    label: "prepared sealed-pin operation 17",
  });
  if (
    operation17Intent.action !== "originate"
    || operation17Intent.label !== "Gnocchi allocation adapter"
    || operation17Intent.network !== "shadownet"
    || operation17Intent.signer !== creator
    || operation17Intent.expectedCounter !== null
    || !HASH_RE.test(String(operation17Intent.codeSha256 || ""))
    || !HASH_RE.test(String(operation17Intent.storageSha256 || ""))
  ) {
    fail("prepared sealed-pin operation 17 intent drifted");
  }
  exactJson(record(operation17Intent.storage, "prepared sealed-pin operation 17 storage").administrator, creator, "prepared sealed-pin operation 17 administrator");
  const addressBound = record(history[8]!.details, "prepared sealed-pin operation 17 address binding");
  exactKeys(addressBound, ["contract"], "prepared sealed-pin operation 17 address binding");
  if (addressBound.contract !== adapter || history[8]!.operationHash !== operation17.operationHash) {
    fail("prepared sealed-pin operation 17 address binding drifted");
  }

  const callIntent = (
    entrypoint: string,
    target: string,
    payload: unknown,
  ) => ({
    action: "call",
    entrypoint,
    expectedCounter: null,
    network: "shadownet",
    payload,
    signer: creator,
    target,
  });
  exactPreparedOperationHistory({
    prepared: history[9]!,
    submitted: history[10]!,
    confirmed: history[11]!,
    operation: operation18,
    expectedIntent: callIntent("add_minter", gnocchi, adapter),
    label: "prepared sealed-pin operation 18",
  });
  exactPreparedOperationHistory({
    prepared: history[12]!,
    submitted: history[13]!,
    confirmed: history[14]!,
    operation: operation19,
    expectedIntent: callIntent("create_allocation", adapter, {
      active: true,
      amount_per_open: 1,
      target: gnocchi,
      token_id: 2,
    }),
    label: "prepared sealed-pin operation 19",
  });
  exactPreparedOperationHistory({
    prepared: history[15]!,
    submitted: history[16]!,
    confirmed: history[17]!,
    operation: operation20,
    expectedIntent: callIntent("add_router", adapter, router),
    label: "prepared sealed-pin operation 20",
  });

  const preimage = record(history[20]!.details, "prepared sealed-pin reveal preimage");
  exactKeys(preimage, ["salt", "offset", "publicReveal"], "prepared sealed-pin reveal preimage");
  const saltHex = String(preimage.salt || "");
  const offset = Number(preimage.offset);
  if (!/^[0-9a-f]{64}$/.test(saltHex) || offset !== 0) {
    fail("prepared sealed-pin reveal entropy identity drifted");
  }
  const publicReveal = record(preimage.publicReveal, "prepared sealed-pin public reveal");
  const openKit = record(publicReveal.openKit, "prepared sealed-pin public reveal open kit");
  const recipes = Array.isArray(openKit.recipes) ? openKit.recipes : fail("prepared sealed-pin recipes are invalid");
  const recipe = recipes.length === 1 ? record(recipes[0], "prepared sealed-pin recipe") : fail("prepared sealed-pin recipe count drifted");
  const actions = Array.isArray(recipe.actions) ? recipe.actions : fail("prepared sealed-pin actions are invalid");
  const action = actions.length === 1 ? record(actions[0], "prepared sealed-pin action") : fail("prepared sealed-pin action count drifted");
  const nonceHex = String(recipe.nonce || "");
  if (
    publicReveal.schema !== "pasta-ravioli-public-reveal@1"
    || publicReveal.network !== "shadownet"
    || publicReveal.contract !== router
    || publicReveal.tokenId !== 2
    || publicReveal.mode !== "blind_allocated_mint"
    || publicReveal.manifestUri !== manifestPin.proof.uri
    || publicReveal.maxSupply !== 1
    || publicReveal.itemCount !== 1
    || openKit.schema !== "pasta-ravioli-open-kit@3"
    || openKit.contract !== router
    || openKit.tokenId !== 2
    || openKit.mode !== "blind_allocated_mint"
    || openKit.manifestUri !== manifestPin.proof.uri
    || !/^[0-9a-f]{64}$/.test(nonceHex)
    || action.kind !== "allocated"
    || action.adapter !== adapter
    || action.resourceId !== 0
    || !/^[0-9a-f]{64}$/.test(String(action.payloadCommitment || ""))
  ) {
    fail("prepared sealed-pin public reveal identity drifted");
  }

  const preparedPin = record(history[21]!.details, "prepared sealed-pin checkpoint");
  exactKeys(preparedPin, ["fileName", "valueSha256"], "prepared sealed-pin checkpoint");
  const expectedSha256 = String(preparedPin.valueSha256 || "");
  const envelopeBytes = Uint8Array.from(input.envelopeBytes);
  if (
    preparedPin.fileName !== "ravioli-sealed-reveal-2.json"
    || !HASH_RE.test(expectedSha256)
    || envelopeBytes.byteLength < 1
    || sha256(envelopeBytes) !== expectedSha256
  ) {
    fail("prepared sealed-pin envelope bytes differ from the durable checkpoint");
  }
  let envelopeValue: unknown;
  try {
    envelopeValue = JSON.parse(Buffer.from(envelopeBytes).toString("utf8"));
  } catch {
    fail("prepared sealed-pin envelope is not JSON");
  }
  const envelope = record(envelopeValue, "prepared sealed-pin envelope");
  if (!Buffer.from(deterministicJsonBytes(envelope)).equals(Buffer.from(envelopeBytes))) {
    fail("prepared sealed-pin envelope is not canonical JSON");
  }
  exactKeys(envelope, ["schema", "cipher", "keyDerivation", "iv", "aad", "ciphertext"], "prepared sealed-pin envelope");
  const expectedAad = {
    schema: SEALED_REVEAL_SCHEMA,
    network: "shadownet",
    contract: router,
    tokenId: 2,
    manifestUri: manifestPin.proof.uri,
  };
  exactJson(envelope.aad, expectedAad, "prepared sealed-pin authenticated context");
  if (
    envelope.schema !== SEALED_REVEAL_SCHEMA
    || envelope.cipher !== SEALED_REVEAL_CIPHER
    || envelope.keyDerivation !== SEALED_REVEAL_KDF
    || typeof envelope.iv !== "string"
    || typeof envelope.ciphertext !== "string"
  ) {
    fail("prepared sealed-pin encryption policy drifted");
  }
  const iv = Buffer.from(envelope.iv, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  if (
    iv.byteLength !== 12
    || iv.toString("base64") !== envelope.iv
    || ciphertext.byteLength <= 16
    || ciphertext.toString("base64") !== envelope.ciphertext
  ) {
    fail("prepared sealed-pin encrypted bytes are malformed");
  }
  const key = createHash("sha256")
    .update(Buffer.from(`${SEALED_REVEAL_SCHEMA}\0`, "utf8"))
    .update(Buffer.from(saltHex, "hex"))
    .digest();
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(deterministicJsonBytes(expectedAad)));
    decipher.setAuthTag(ciphertext.subarray(ciphertext.byteLength - 16));
    plaintext = Buffer.concat([
      decipher.update(ciphertext.subarray(0, ciphertext.byteLength - 16)),
      decipher.final(),
    ]);
  } catch {
    fail("prepared sealed-pin AES-GCM authentication failed");
  }
  if (!plaintext.equals(Buffer.from(deterministicJsonBytes(publicReveal)))) {
    fail("prepared sealed-pin plaintext differs from its private preimage");
  }
  const cid = CID.createV1(
    rawCodec.code,
    createMultihashDigest(0x12, Buffer.from(expectedSha256, "hex")),
  ).toString();

  const reconciledAt = new Date(Date.parse(String(recovery.updatedAt)) + 1).toISOString();
  const terminalDetails = Object.freeze({
    disposition: "AUTHENTICATED_LOCAL_PIN_FOR_ZERO_ADD_ADOPTION",
    journalId: plan.journalId,
    completedOperationCount: 20,
    nextGlobalOperation: 21,
    authenticatedThroughEventIndex: 59,
    preparedPinSequence: 14,
    cid,
    sha256: expectedSha256,
    byteLength: envelopeBytes.byteLength,
  });
  const reconciledValue = JSON.stringify({
    ...recovery,
    status: "COMPLETE",
    history: [
      ...history,
      {
        stage: PREPARED_SEALED_PIN_TERMINAL_STAGE,
        status: "COMPLETE",
        at: reconciledAt,
        details: terminalDetails,
      },
    ],
    updatedAt: reconciledAt,
  });
  const reconciledRecord = privateRecordSummary(
    sourceRecord.storageKey,
    Buffer.from(reconciledValue, "utf8"),
    new Set([creator]),
    new Set([router]),
    new Set(plan.operations.map((candidate) => candidate.operationHash)),
  );
  if (
    reconciledRecord.status !== "COMPLETE"
    || reconciledRecord.stage !== PREPARED_SEALED_PIN_TERMINAL_STAGE
  ) {
    fail("prepared sealed-pin recovery terminal transformation drifted");
  }
  const restoration = Object.freeze({
    ...source,
    records: Object.freeze(source.records.map((entry) =>
      entry === sourceRecord ? reconciledRecord : entry)),
  });
  const evidence = Object.freeze({
    schema: "pastaprotocol-ravioli-prepared-sealed-pin-recovery@1" as const,
    disposition: "AUTHENTICATED_LOCAL_PIN_FOR_ZERO_ADD_ADOPTION" as const,
    sourceManifestSha256: source.manifestSha256,
    sourceRecordSha256: sourceRecord.sha256,
    reconciledRecordSha256: reconciledRecord.sha256,
    storageKeySha256: sha256(Buffer.from(sourceRecord.storageKey, "utf8")),
    journalId: plan.journalId,
    completedOperationCount: 20 as const,
    nextGlobalOperation: 21 as const,
    authenticatedThroughEventIndex: 59 as const,
    preparedPinSequence: 14 as const,
    preparedPinCid: cid,
    preparedPinSha256: expectedSha256,
    preparedPinByteLength: envelopeBytes.byteLength,
    terminalStage: PREPARED_SEALED_PIN_TERMINAL_STAGE,
    diskSnapshotMutated: false as const,
  });
  const bridge = { evidence } as {
    evidence: typeof evidence;
    restoration?: RavioliPrivateRecoveryRestoration;
    envelope?: RavioliPreparedSealedPinRecoveryBridge["envelope"];
    entropy?: RavioliPreparedSealedPinRecoveryBridge["entropy"];
  };
  for (const [keyName, value] of [
    ["restoration", restoration],
    ["envelope", Object.freeze({
      cid,
      fileName: "ravioli-sealed-reveal-2.json" as const,
      mimeType: "application/json" as const,
      bytes: Uint8Array.from(envelopeBytes),
      value: Object.freeze({ ...envelope }),
      sha256: expectedSha256,
      byteLength: envelopeBytes.byteLength,
    })],
    ["entropy", Object.freeze({
      nonceHex,
      saltHex,
      offset,
      iv: Uint8Array.from(iv),
    })],
  ] as const) {
    Object.defineProperty(bridge, keyName, {
      value,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  const authenticatedBridge = Object.freeze(
    bridge as RavioliPreparedSealedPinRecoveryBridge,
  );
  PREPARED_SEALED_PIN_RECOVERY_BRIDGES.add(authenticatedBridge);
  PREPARED_SEALED_PIN_RECOVERY_PLANS.set(authenticatedBridge, plan);
  return authenticatedBridge;
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
  const frozenPlan = Object.freeze(plan as RavioliCurrentResumePlan);
  PLAN_EVENT_COUNTS.set(frozenPlan, input.state.eventCount);
  return frozenPlan;
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

function authenticatedTrailingReplayAfterEventIndex(
  plan: RavioliCurrentResumePlan,
): number | null {
  const operation67Boundary = plan.completedOperationCount === 67
    && plan.nextOperation === null;
  if (operation67Boundary) {
    const lastOperation = plan.operations.at(-1);
    const lastPin = plan.pins.at(-1);
    exactJson({
      eventCount: PLAN_EVENT_COUNTS.get(plan) ?? null,
      pinCount: plan.pins.length,
      operationCount: plan.operations.length,
      completedOperationCount: plan.completedOperationCount,
      nextOperation: plan.nextOperation,
      lastOperation: lastOperation ? {
        eventIndex: lastOperation.eventIndex,
        globalOrdinal: lastOperation.expected.globalOrdinal,
        id: lastOperation.expected.id,
        actor: lastOperation.actor,
        action: lastOperation.action,
        entrypoint: lastOperation.expected.entrypoint ?? null,
        targetRole: lastOperation.expected.targetRole,
        tokenId: lastOperation.expected.tokenId ?? null,
      } : null,
      lastPin: lastPin ? {
        eventIndex: lastPin.eventIndex,
        pinSequence: lastPin.pinSequence,
        actor: lastPin.actor,
        action: lastPin.action,
        fileName: lastPin.proof.fileName,
      } : null,
    }, {
      eventCount: 236,
      pinCount: 34,
      operationCount: 67,
      completedOperationCount: 67,
      nextOperation: null,
      lastOperation: {
        eventIndex: 236,
        globalOrdinal: 67,
        id: "withheld-reveal-refund:creator-recover-adapter",
        actor: "creator",
        action: "call",
        entrypoint: "recover_adapter",
        targetRole: "router",
        tokenId: 5,
      },
      lastPin: {
        eventIndex: 209,
        pinSequence: 34,
        actor: "creator",
        action: "pin_json",
        fileName: "token.json",
      },
    }, "operation-67/event-236/thirty-four-pin authenticated terminal boundary");
    return null;
  }

  const operation66Boundary = plan.completedOperationCount === 66
    || plan.nextOperation?.globalOrdinal === 67;
  if (operation66Boundary) {
    const next = plan.nextOperation;
    const lastOperation = plan.operations.at(-1);
    const lastPin = plan.pins.at(-1);
    exactJson({
      eventCount: PLAN_EVENT_COUNTS.get(plan) ?? null,
      pinCount: plan.pins.length,
      operationCount: plan.operations.length,
      completedOperationCount: plan.completedOperationCount,
      nextOperation: next ? {
        globalOrdinal: next.globalOrdinal,
        id: next.id,
        actor: next.actor,
        action: next.action,
        entrypoint: next.entrypoint ?? null,
        targetRole: next.targetRole,
        tokenId: next.tokenId ?? null,
      } : null,
      lastOperation: lastOperation ? {
        eventIndex: lastOperation.eventIndex,
        globalOrdinal: lastOperation.expected.globalOrdinal,
        id: lastOperation.expected.id,
        actor: lastOperation.actor,
        action: lastOperation.action,
        entrypoint: lastOperation.expected.entrypoint ?? null,
        targetRole: lastOperation.expected.targetRole,
        tokenId: lastOperation.expected.tokenId ?? null,
      } : null,
      lastPin: lastPin ? {
        eventIndex: lastPin.eventIndex,
        pinSequence: lastPin.pinSequence,
        actor: lastPin.actor,
        action: lastPin.action,
        fileName: lastPin.proof.fileName,
      } : null,
    }, {
      eventCount: 233,
      pinCount: 34,
      operationCount: 66,
      completedOperationCount: 66,
      nextOperation: {
        globalOrdinal: 67,
        id: "withheld-reveal-refund:creator-recover-adapter",
        actor: "creator",
        action: "call",
        entrypoint: "recover_adapter",
        targetRole: "router",
        tokenId: 5,
      },
      lastOperation: {
        eventIndex: 233,
        globalOrdinal: 66,
        id: "withheld-reveal-refund:collector1-withdraw-credit",
        actor: "collector1",
        action: "call",
        entrypoint: "withdraw_refund",
        targetRole: "blindController",
        tokenId: 5,
      },
      lastPin: {
        eventIndex: 209,
        pinSequence: 34,
        actor: "creator",
        action: "pin_json",
        fileName: "token.json",
      },
    }, "operation-66/event-233/thirty-four-pin authenticated boundary");
    return null;
  }

  const operation64Boundary = plan.completedOperationCount === 64
    || plan.nextOperation?.globalOrdinal === 65;
  if (operation64Boundary) {
    const next = plan.nextOperation;
    const lastOperation = plan.operations.at(-1);
    const lastPin = plan.pins.at(-1);
    exactJson({
      eventCount: PLAN_EVENT_COUNTS.get(plan) ?? null,
      pinCount: plan.pins.length,
      operationCount: plan.operations.length,
      completedOperationCount: plan.completedOperationCount,
      nextOperation: next ? {
        globalOrdinal: next.globalOrdinal,
        id: next.id,
        actor: next.actor,
        action: next.action,
        entrypoint: next.entrypoint ?? null,
        targetRole: next.targetRole,
        tokenId: next.tokenId ?? null,
      } : null,
      lastOperation: lastOperation ? {
        eventIndex: lastOperation.eventIndex,
        globalOrdinal: lastOperation.expected.globalOrdinal,
        id: lastOperation.expected.id,
        actor: lastOperation.actor,
        action: lastOperation.action,
        entrypoint: lastOperation.expected.entrypoint ?? null,
        targetRole: lastOperation.expected.targetRole,
        tokenId: lastOperation.expected.tokenId ?? null,
      } : null,
      lastPin: lastPin ? {
        eventIndex: lastPin.eventIndex,
        pinSequence: lastPin.pinSequence,
        actor: lastPin.actor,
        action: lastPin.action,
        fileName: lastPin.proof.fileName,
      } : null,
    }, {
      eventCount: 227,
      pinCount: 34,
      operationCount: 64,
      completedOperationCount: 64,
      nextOperation: {
        globalOrdinal: 65,
        id: "withheld-reveal-refund:collector2-cancel-after-refunds",
        actor: "collector2",
        action: "call",
        entrypoint: "cancel_unrevealed_pack",
        targetRole: "router",
        tokenId: 5,
      },
      lastOperation: {
        eventIndex: 227,
        globalOrdinal: 64,
        id: "withheld-reveal-refund:collector2-credit-holder-refund",
        actor: "collector2",
        action: "call",
        entrypoint: "refund_blind_claims",
        targetRole: "router",
        tokenId: 5,
      },
      lastPin: {
        eventIndex: 209,
        pinSequence: 34,
        actor: "creator",
        action: "pin_json",
        fileName: "token.json",
      },
    }, "operation-64/event-227/thirty-four-pin authenticated boundary");
    return null;
  }

  const operation63Boundary = plan.completedOperationCount === 63
    || plan.nextOperation?.globalOrdinal === 64;
  if (operation63Boundary) {
    const next = plan.nextOperation;
    const lastOperation = plan.operations.at(-1);
    const lastPin = plan.pins.at(-1);
    exactJson({
      eventCount: PLAN_EVENT_COUNTS.get(plan) ?? null,
      pinCount: plan.pins.length,
      operationCount: plan.operations.length,
      completedOperationCount: plan.completedOperationCount,
      nextOperation: next
        ? {
            globalOrdinal: next.globalOrdinal,
            id: next.id,
            actor: next.actor,
            action: next.action,
            entrypoint: next.entrypoint ?? null,
            targetRole: next.targetRole,
            tokenId: next.tokenId ?? null,
          }
        : null,
      lastOperation: lastOperation
        ? {
            eventIndex: lastOperation.eventIndex,
            globalOrdinal: lastOperation.expected.globalOrdinal,
            id: lastOperation.expected.id,
            actor: lastOperation.actor,
            action: lastOperation.action,
            entrypoint: lastOperation.expected.entrypoint ?? null,
            targetRole: lastOperation.expected.targetRole,
            tokenId: lastOperation.expected.tokenId ?? null,
          }
        : null,
      lastPin: lastPin
        ? {
            eventIndex: lastPin.eventIndex,
            pinSequence: lastPin.pinSequence,
            actor: lastPin.actor,
            action: lastPin.action,
            fileName: lastPin.proof.fileName,
          }
        : null,
    }, {
      eventCount: 224,
      pinCount: 34,
      operationCount: 63,
      completedOperationCount: 63,
      nextOperation: {
        globalOrdinal: 64,
        id: "withheld-reveal-refund:collector2-credit-holder-refund",
        actor: "collector2",
        action: "call",
        entrypoint: "refund_blind_claims",
        targetRole: "router",
        tokenId: 5,
      },
      lastOperation: {
        eventIndex: 224,
        globalOrdinal: 63,
        id: "withheld-reveal-refund:collector1-buy",
        actor: "collector1",
        action: "call",
        entrypoint: "buy",
        targetRole: "router",
        tokenId: 5,
      },
      lastPin: {
        eventIndex: 209,
        pinSequence: 34,
        actor: "creator",
        action: "pin_json",
        fileName: "token.json",
      },
    }, "operation-63/event-224/thirty-four-pin authenticated boundary");
    // The sixth pack has already been configured, fully reserved, issued, and
    // purchased. No historical browser response is needed: operation 64 is
    // the first admissible continuation mutation.
    return null;
  }

  const operation55Boundary = plan.completedOperationCount === 55
    || plan.nextOperation?.globalOrdinal === 56;
  if (operation55Boundary) {
    const next = plan.nextOperation;
    const lastOperation = plan.operations.at(-1);
    const lastPin = plan.pins.at(-1);
    exactJson({
      eventCount: PLAN_EVENT_COUNTS.get(plan) ?? null,
      pinCount: plan.pins.length,
      operationCount: plan.operations.length,
      completedOperationCount: plan.completedOperationCount,
      nextOperation: next
        ? {
            globalOrdinal: next.globalOrdinal,
            id: next.id,
            actor: next.actor,
            action: next.action,
            entrypoint: next.entrypoint ?? null,
            targetRole: next.targetRole,
            tokenId: next.tokenId ?? null,
          }
        : null,
      lastOperation: lastOperation
        ? {
            eventIndex: lastOperation.eventIndex,
            globalOrdinal: lastOperation.expected.globalOrdinal,
            id: lastOperation.expected.id,
            actor: lastOperation.actor,
            action: lastOperation.action,
            entrypoint: lastOperation.expected.entrypoint ?? null,
            targetRole: lastOperation.expected.targetRole,
            tokenId: lastOperation.expected.tokenId ?? null,
          }
        : null,
      lastPin: lastPin
        ? {
            eventIndex: lastPin.eventIndex,
            pinSequence: lastPin.pinSequence,
            actor: lastPin.actor,
            action: lastPin.action,
            fileName: lastPin.proof.fileName,
          }
        : null,
    }, {
      eventCount: 196,
      pinCount: 30,
      operationCount: 55,
      completedOperationCount: 55,
      nextOperation: {
        globalOrdinal: 56,
        id: "withheld-reveal-refund:authorize-adapter",
        actor: "creator",
        action: "call",
        entrypoint: "add_minter",
        targetRole: "gnocchi",
        tokenId: null,
      },
      lastOperation: {
        eventIndex: 196,
        globalOrdinal: 55,
        id: "mode-4-hybrid-atomic-pack:collector1-open",
        actor: "collector1",
        action: "call",
        entrypoint: "open_pack",
        targetRole: "router",
        tokenId: 4,
      },
      lastPin: {
        eventIndex: 193,
        pinSequence: 30,
        actor: "collector1",
        action: "pin_json",
        fileName: "ravioli-generated-token.json",
      },
    }, "operation-55/event-196/thirty-pin authenticated boundary");
    // Every browser-side effect represented by operations 1-55 is already
    // terminal. The continuation therefore begins with operation 56 and has
    // no historical replay response to consume.
    return null;
  }

  const operation20Boundary = plan.completedOperationCount === 20
    || plan.nextOperation?.globalOrdinal === 21;
  if (operation20Boundary) {
    const boundarySteps = [
      ...plan.pins.slice(10),
      ...plan.operations.slice(15),
    ].sort((left, right) => left.eventIndex - right.eventIndex).map((step) =>
      step.kind === "pin"
        ? {
            kind: step.kind,
            actor: step.actor,
            eventIndex: step.eventIndex,
            pinSequence: step.pinSequence,
            action: step.action,
          }
        : {
            kind: step.kind,
            actor: step.actor,
            eventIndex: step.eventIndex,
            globalOrdinal: step.expected.globalOrdinal,
            id: step.expected.id,
            action: step.action,
            entrypoint: step.expected.entrypoint ?? null,
            targetRole: step.expected.targetRole,
          });
    const next = plan.nextOperation;
    exactJson({
      eventCount: PLAN_EVENT_COUNTS.get(plan) ?? null,
      pinCount: plan.pins.length,
      operationCount: plan.operations.length,
      completedOperationCount: plan.completedOperationCount,
      nextOperation: next
        ? {
            globalOrdinal: next.globalOrdinal,
            id: next.id,
            actor: next.actor,
            action: next.action,
            entrypoint: next.entrypoint ?? null,
            targetRole: next.targetRole,
            tokenId: next.tokenId ?? null,
          }
        : null,
      boundarySteps,
    }, {
      eventCount: 74,
      pinCount: 13,
      operationCount: 20,
      completedOperationCount: 20,
      nextOperation: {
        globalOrdinal: 21,
        id: "mode-2-blind-allocated-mint:create-pack",
        actor: "creator",
        action: "call",
        entrypoint: "create_pack",
        targetRole: "router",
        tokenId: 2,
      },
      boundarySteps: [
        {
          kind: "operation",
          actor: "collector1",
          eventIndex: 59,
          globalOrdinal: 16,
          id: "mode-1-blind-funded-pool:collector1-transfer-to-collector2",
          action: "call",
          entrypoint: "transfer",
          targetRole: "router",
        },
        {
          kind: "pin",
          actor: "creator",
          eventIndex: 60,
          pinSequence: 11,
          action: "pin_blob",
        },
        {
          kind: "pin",
          actor: "creator",
          eventIndex: 61,
          pinSequence: 12,
          action: "pin_json",
        },
        {
          kind: "operation",
          actor: "creator",
          eventIndex: 64,
          globalOrdinal: 17,
          id: "mode-2-blind-allocated-mint:originate-gnocchi-adapter",
          action: "originate",
          entrypoint: null,
          targetRole: "gnocchiAdapter",
        },
        {
          kind: "operation",
          actor: "creator",
          eventIndex: 67,
          globalOrdinal: 18,
          id: "mode-2-blind-allocated-mint:authorize-adapter",
          action: "call",
          entrypoint: "add_minter",
          targetRole: "gnocchi",
        },
        {
          kind: "operation",
          actor: "creator",
          eventIndex: 70,
          globalOrdinal: 19,
          id: "mode-2-blind-allocated-mint:create-allocation",
          action: "call",
          entrypoint: "create_allocation",
          targetRole: "gnocchiAdapter",
        },
        {
          kind: "operation",
          actor: "creator",
          eventIndex: 73,
          globalOrdinal: 20,
          id: "mode-2-blind-allocated-mint:authorize-router",
          action: "call",
          entrypoint: "add_router",
          targetRole: "gnocchiAdapter",
        },
        {
          kind: "pin",
          actor: "creator",
          eventIndex: 74,
          pinSequence: 13,
          action: "pin_json",
        },
      ],
    }, "operation-20/event-74/thirteen-pin authenticated boundary");
    return 59;
  }

  if (
    plan.completedOperationCount === 30
    && plan.nextOperation?.globalOrdinal === 31
    && plan.nextOperation.id === "mode-4-hybrid-atomic-pack:authorize-gnocchi-adapter"
  ) {
    return plan.operations.reduce(
      (latest, operation) => Math.max(latest, operation.eventIndex),
      -1,
    );
  }
  return null;
}

export function createRavioliCurrentResumeCoordinator(input: {
  plan: RavioliCurrentResumePlan;
  delegates: Readonly<Record<RavioliUiLiveJournalActor, PastaUiLiveBridgeHandler>>;
  primingMode?: RavioliCurrentResumePrimingMode;
  preparedSealedPinRecovery?: RavioliPreparedSealedPinRecoveryBridge;
}): RavioliCurrentResumeCoordinator {
  const primingMode = input.primingMode ?? "browser-exact";
  if (primingMode !== "browser-exact" && primingMode !== "authenticated-state") {
    fail(`unsupported coordinator priming mode ${String(primingMode)}`);
  }
  if (primingMode === "authenticated-state" && !LIVE_RECONCILED_PLANS.has(input.plan)) {
    fail("authenticated-state priming requires the exact live-reconciled plan object");
  }
  if (input.preparedSealedPinRecovery) {
    assertAuthenticatedRavioliPreparedSealedPinRecovery(input.preparedSealedPinRecovery);
    if (
      primingMode !== "authenticated-state"
      || PREPARED_SEALED_PIN_RECOVERY_PLANS.get(input.preparedSealedPinRecovery) !== input.plan
    ) {
      fail("prepared sealed-pin recovery does not belong to this authenticated-state plan");
    }
  }
  const steps = Object.fromEntries(ACTORS.map((actor) => [actor, [
    ...input.plan.pins.filter((pin) =>
      pin.actor === actor
      && !(input.preparedSealedPinRecovery && pin.pinSequence === 12)),
    ...input.plan.operations.filter((operation) =>
      operation.actor === actor
      && !(input.preparedSealedPinRecovery && operation.expected.globalOrdinal === 17)),
  ].sort((left, right) => left.eventIndex - right.eventIndex)])) as Record<
    RavioliUiLiveJournalActor,
    Array<RavioliCurrentResumePin | RavioliCurrentResumeOperation>
  >;
  const trailingReplayAfterEventIndex = primingMode === "authenticated-state"
    ? authenticatedTrailingReplayAfterEventIndex(input.plan)
    : null;
  const authenticatedCompletedCount = (actor: RavioliUiLiveJournalActor): number => {
    if (trailingReplayAfterEventIndex === null) return steps[actor].length;
    const firstTrailingStep = steps[actor].findIndex(
      (step) => step.eventIndex > trailingReplayAfterEventIndex,
    );
    return firstTrailingStep === -1 ? steps[actor].length : firstTrailingStep;
  };
  const completed: Record<RavioliUiLiveJournalActor, number> = {
    creator: primingMode === "authenticated-state" ? authenticatedCompletedCount("creator") : 0,
    collector1: primingMode === "authenticated-state" ? authenticatedCompletedCount("collector1") : 0,
    collector2: primingMode === "authenticated-state" ? authenticatedCompletedCount("collector2") : 0,
  };
  const historicalFingerprints = new Set(
    Object.values(steps).flat().map((step) => step.fingerprint),
  );
  const historicalOperationsByFingerprint = new Map<string, RavioliCurrentResumeOperation[]>();
  for (const operation of input.plan.operations) {
    const matching = historicalOperationsByFingerprint.get(operation.fingerprint) || [];
    matching.push(operation);
    historicalOperationsByFingerprint.set(operation.fingerprint, matching);
  }
  let started = false;
  let starting = false;
  const assertFirstContinuationDescriptor = (
    next: RavioliUiLiveExpectedOperation,
    descriptor: PastaUiLiveOperationDescriptor,
  ): void => {
    if (descriptor.kind !== "call") return;
    const expectedTarget = input.plan.targetBindings[next.targetRole];
    if (!expectedTarget || descriptor.call.contractAddress !== expectedTarget) {
      fail(
        `first continuation mutation differs from global operation ${next.globalOrdinal}: `
        + `target ${descriptor.call.contractAddress} does not match ${next.targetRole} ${expectedTarget || "<unbound>"}`,
      );
    }
    if (next.tokenId !== null && next.tokenId !== undefined) {
      const payload = descriptor.call.payload;
      const projectedTokenId = next.entrypoint === "create_pack"
        ? Number(record(payload, "continuation create_pack payload").expected_token_id)
        : next.entrypoint === "cancel_unrevealed_pack"
          ? Number(payload)
          : Number(record(payload, "continuation call payload").token_id);
      if (!Number.isSafeInteger(projectedTokenId) || projectedTokenId !== next.tokenId) {
        fail(
          `first continuation mutation differs from global operation ${next.globalOrdinal}: `
          + `token ${String(projectedTokenId)} does not match ${next.tokenId}`,
        );
      }
    }
    if (next.globalOrdinal === 64) {
      const payload = record(descriptor.call.payload, "operation-64 refund payload");
      exactKeys(
        payload,
        ["amount", "expected_claim_id", "holder", "token_id"],
        "operation-64 refund payload",
      );
      const purchased = input.plan.operations.find(
        (operation) => operation.expected.globalOrdinal === 63,
      );
      if (
        !purchased
        || payload.amount !== 1
        || payload.expected_claim_id !== 0
        || payload.holder !== purchased.evidence.signerAddress
      ) {
        fail("first continuation mutation differs from global operation 64");
      }
    }
    if (next.globalOrdinal === 67) {
      const payload = record(descriptor.call.payload, "operation-67 adapter recovery payload");
      exactKeys(
        payload,
        ["adapter", "capacity", "kind", "resource_id", "token_id"],
        "operation-67 adapter recovery payload",
      );
      if (
        payload.adapter !== input.plan.targetBindings.gnocchiAdapter
        || payload.capacity !== 2
        || payload.kind !== 1
        || payload.resource_id !== 2
        || payload.token_id !== 5
      ) {
        fail("first continuation mutation differs from global operation 67");
      }
    }
  };
  const remaining = (actor?: RavioliUiLiveJournalActor): number => actor
    ? steps[actor].length - completed[actor]
    : ACTORS.reduce((sum, candidate) => sum + steps[candidate].length - completed[candidate], 0);
  const done = (actor?: RavioliUiLiveJournalActor): number => actor
    ? completed[actor]
    : ACTORS.reduce((sum, candidate) => sum + completed[candidate], 0);
  const handles = Object.fromEntries(ACTORS.map((actor) => [actor, (async (request: PastaUiLiveBridgeRequest) => {
    if (READ_ACTIONS.has(request.action)) return input.delegates[actor](request);
    if (!input.plan.nextOperation) fail("terminal journal refuses another bridge mutation");
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
    if (!started && starting) fail("first continuation mutation is already being delegated");
    const fingerprint = requestFingerprint(request);
    if (!started && (request.action === "originate" || request.action === "call")) {
      const next = input.plan.nextOperation;
      if (!next) fail("terminal journal refuses another signer operation");
      const descriptor = operationDescriptor(request);
      const entrypoint = descriptor.kind === "call" ? descriptor.call.entrypoint : undefined;
      if (actor !== next.actor || request.action !== next.action || entrypoint !== next.entrypoint) {
        fail(
          `first continuation mutation differs from global operation ${next.globalOrdinal}: `
          + `received ${actor}/${request.action}/${entrypoint || "<none>"}; `
          + `expected ${next.actor}/${next.action}/${next.entrypoint || "<none>"}`,
        );
      }
      assertFirstContinuationDescriptor(next, descriptor);
      const recoveredMatches = fingerprint
        ? historicalOperationsByFingerprint.get(fingerprint) || []
        : [];
      if (
        recoveredMatches.length > 0
        && !recoveredMatches.some((operation) => operation.expected.targetRole === next.targetRole)
      ) {
        fail(
          `first continuation mutation differs from global operation ${next.globalOrdinal}: `
          + `descriptor is historical only for ${recoveredMatches.map((operation) => operation.expected.targetRole).join(",")}`,
        );
      }
      starting = true;
      try {
        const result = await input.delegates[actor](request);
        started = true;
        return result;
      } finally {
        starting = false;
      }
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
    } else if (
      started
      && primingMode === "authenticated-state"
      && request.action !== "originate"
      && request.action !== "call"
      && fingerprint
      && historicalFingerprints.has(fingerprint)
    ) {
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
