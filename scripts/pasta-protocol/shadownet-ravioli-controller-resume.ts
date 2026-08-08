import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";

import type {
  PastaUiLiveBridgeHandler,
  PastaUiLiveBridgeRequest,
  PastaUiLiveOperationDescriptor,
  PastaUiLivePinProof,
  PastaUiLivePublicReceipt,
} from "./pasta-ui-live-bridge-kit";
import {
  decodePastaUiLiveValue,
  hashJsonForBridge,
  PASTA_UI_LIVE_RECEIPT_SCHEMA,
} from "./pasta-ui-live-bridge-kit";
import {
  RAVIOLI_UI_LIVE_JOURNAL_EFFECTIVE_INTENT_SCHEMA,
  RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA,
  RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA,
  ravioliUiLiveDescriptorSha256,
  type RavioliUiLiveJournal,
} from "./shadownet-ravioli-ui-live-journal";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import {
  deterministicJsonBytes,
  ipfsGatewayUrl,
  SHADOWNET_CHAIN_ID,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

const HASH_RE = /^[0-9a-f]{64}$/;
const EVENT_NAMES = Object.freeze([
  "000001-pin-creator.json",
  "000002-pin-creator.json",
  "000003-pin-creator.json",
  "000004-prepared-creator.json",
  "000005-submitted-creator.json",
  "000006-applied-creator.json",
] as const);
const PIN_NAMES = Object.freeze([
  "000001.bin",
  "000002.bin",
  "000003.bin",
] as const);
const PHASES = Object.freeze([
  "PIN",
  "PIN",
  "PIN",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
] as const);
const READ_ACTIONS = new Set<PastaUiLiveBridgeRequest["action"]>([
  "active_protocol",
  "balance",
  "chain_check",
  "connect",
  "contract_at",
  "estimate_call",
  "read_storage",
  "script_code_hash",
]);

type JsonRecord = Record<string, unknown>;

export type RavioliControllerResumePinRecord = Readonly<{
  kind: "wrapper" | "controller-metadata" | "collection";
  pinSequence: 1 | 2 | 3;
  eventPath: string;
  artifactPath: string;
  bytes: Uint8Array;
  value?: unknown;
  proof: PastaUiLivePinProof;
}>;

export type RavioliControllerResumeOperationIdentity = Readonly<{
  descriptorSha256: string;
  operationHash: string;
  contractAddress: string;
  counter: number;
  level: number;
  timestamp: string;
}>;

export type RavioliControllerResumeIdentity = Readonly<{
  journalId: string;
  intentSha256: string;
  createdAt: string;
  creatorAddress: string;
  creatorBaseCounter: number;
  controllerAddress: string;
  controllerArtifactSha256: string;
  routerArtifactSha256: string;
  origination: RavioliControllerResumeOperationIdentity;
}>;

export type RavioliControllerResume = Readonly<{
  journalRoot: string;
  journalPrefixComplete: true;
  controllerAddress: string;
  controllerOriginationDescriptor: Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }>;
  activePins: readonly [
    RavioliControllerResumePinRecord,
    RavioliControllerResumePinRecord,
    RavioliControllerResumePinRecord,
  ];
  pinProofs: readonly [PastaUiLivePinProof, PastaUiLivePinProof, PastaUiLivePinProof];
  writeReceipts: readonly [PastaUiLivePublicReceipt];
  identity: RavioliControllerResumeIdentity;
}>;

export type LoadRavioliControllerResumeInput = {
  /**
   * Must be returned by openRavioliUiLiveJournal. This loader deliberately
   * re-reads every byte after journal replay to close a validation/use gap.
   */
  journal: RavioliUiLiveJournal;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  expected: {
    creatorAddress: string;
    collectorOneAddress: string;
    collectorTwoAddress: string;
    dependencyAddresses: { gnocchi: string; rotini: string };
    dependencyHashes: Record<string, string>;
    artifactHashes: Record<string, string>;
    controllerArtifact: unknown[];
    routerArtifact: unknown[];
  };
};

export type RavioliControllerResumeInterceptor = {
  handle: PastaUiLiveBridgeHandler;
  isComplete(): boolean;
  didDelegateRouter(): boolean;
  getCompletedStepCount(): number;
  getRemainingStepCount(): number;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message: string): never {
  throw new Error(`Ravioli controller-only resume: ${message}`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value as JsonRecord;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) fail(`${label} drift`);
}

function exactJson(value: unknown, expected: unknown, label: string): void {
  const left = Buffer.from(deterministicJsonBytes(value));
  const right = Buffer.from(deterministicJsonBytes(expected));
  if (!left.equals(right)) fail(`${label} drift`);
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  exactJson(Object.keys(value).sort(), [...keys].sort(), `${label} fields`);
}

async function canonicalJsonFile(filePath: string, label: string): Promise<{
  value: JsonRecord;
  bytes: Uint8Array;
  sha256: string;
}> {
  const bytes = await readFile(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not JSON`);
  }
  const canonical = deterministicJsonBytes(parsed);
  if (!Buffer.from(bytes).equals(Buffer.from(canonical))) fail(`${label} bytes are not canonical`);
  return { value: record(parsed, label), bytes, sha256: sha256(bytes) };
}

function parseCanonicalJson(bytes: Uint8Array, label: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail(`${label} is not JSON`);
  }
  if (!Buffer.from(bytes).equals(Buffer.from(deterministicJsonBytes(value)))) {
    fail(`${label} bytes are not canonical`);
  }
  return record(value, label);
}

function pinProof(
  event: JsonRecord,
  bytes: Uint8Array,
  sequence: 1 | 2 | 3,
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">,
): PastaUiLivePinProof {
  exact(event.phase, "PIN", `pin ${sequence} phase`);
  exact(event.pinSequence, sequence, `pin ${sequence} sequence`);
  const artifact = record(event.artifact, `pin ${sequence} artifact`);
  exactKeys(artifact, ["byteLength", "fileName", "mimeType", "path", "sha256"], `pin ${sequence} artifact`);
  exact(artifact.path, `pins/${String(sequence).padStart(6, "0")}.bin`, `pin ${sequence} path`);
  exact(artifact.byteLength, bytes.byteLength, `pin ${sequence} byte length`);
  exact(artifact.sha256, sha256(bytes), `pin ${sequence} byte hash`);
  const metadata = record(event.metadata, `pin ${sequence} metadata`);
  exactKeys(metadata, ["cid", "publicGatewayUrl", "uri"], `pin ${sequence} metadata`);
  const cid = String(metadata.cid || "");
  if (!/^b[a-z2-7]+$/i.test(cid)) fail(`pin ${sequence} CID is invalid`);
  exact(metadata.uri, `ipfs://${cid}`, `pin ${sequence} URI/CID binding`);
  exact(
    metadata.publicGatewayUrl,
    ipfsGatewayUrl(ipfs.publicGatewayUrl, cid),
    `pin ${sequence} public gateway`,
  );
  const fileName = String(artifact.fileName || "");
  const mimeType = String(artifact.mimeType || "");
  if (!fileName || !mimeType) fail(`pin ${sequence} file identity is empty`);
  return {
    cid,
    uri: `ipfs://${cid}`,
    fileName,
    mimeType,
    byteLength: bytes.byteLength,
    sha256: String(artifact.sha256),
    localGatewayUrl: ipfsGatewayUrl(ipfs.localGatewayUrl, cid),
    publicGatewayUrl: ipfsGatewayUrl(ipfs.publicGatewayUrl, cid),
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

function exactEncodedMap(
  value: unknown,
  expectedEntries: readonly (readonly [unknown, unknown])[],
  label: string,
): void {
  const map = record(value, label);
  exactKeys(map, ["$map"], label);
  exactJson(map.$map, expectedEntries, `${label} entries`);
}

function validateControllerStorage(storage: unknown, controllerMetadataUri: string): void {
  const value = record(storage, "controller origination storage");
  exactKeys(
    value,
    ["claim_counts", "claim_slots", "consumed_serials", "metadata", "packs", "refund_credits"],
    "controller origination storage",
  );
  for (const name of ["claim_counts", "claim_slots", "consumed_serials", "packs", "refund_credits"]) {
    exactEncodedMap(value[name], [], `controller storage ${name}`);
  }
  exactEncodedMap(
    value.metadata,
    [["", Buffer.from(controllerMetadataUri, "utf8").toString("hex")]],
    "controller storage metadata",
  );
}

function validateControllerMetadata(value: JsonRecord): void {
  exactKeys(value, ["description", "interfaces", "name", "pasta"], "controller metadata");
  exact(value.name, "Pasta Ravioli Blind Pack Controller", "controller metadata name");
  exactJson(value.interfaces, ["TZIP-016"], "controller metadata interfaces");
  exactJson(
    value.pasta,
    { app: "ravioli", helper: "blind-pack-controller", version: 3 },
    "controller metadata Pasta identity",
  );
}

function validateCollectionMetadata(value: JsonRecord): void {
  exact(value.name, "Ravioli UI-LIVE Atomic Packs", "collection metadata name");
  exact(value.symbol, "RVUI", "collection metadata symbol");
  exactJson(value.interfaces, ["TZIP-012", "TZIP-016"], "collection metadata interfaces");
  const ravioli = record(value.ravioli, "collection Ravioli identity");
  exact(ravioli.version, 3, "collection Ravioli version");
  exact(
    ravioli.fulfillment,
    "atomic-router-and-blind-controller",
    "collection Ravioli fulfillment",
  );
  exact(
    ravioli.controllerBinding,
    "immutable-router-storage",
    "collection controller binding",
  );
}

function operationDescriptor(event: JsonRecord): Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }> {
  exact(event.phase, "PREPARED", "controller PREPARED phase");
  exact(event.globalOrdinal, 1, "controller PREPARED ordinal");
  exact(event.operationSequence, 1, "controller PREPARED sequence");
  const operation = record(event.operation, "controller PREPARED operation");
  exact(operation.status, "PREPARED", "controller PREPARED status");
  exact(operation.operationSequence, 1, "controller persisted sequence");
  exact(operation.action, "originate", "controller action");
  exact(operation.chainId, SHADOWNET_CHAIN_ID, "controller chain");
  exactJson(operation.entrypoints, [], "controller origination entrypoints");
  exact(operation.timestampUtc, event.timestampUtc, "controller PREPARED timestamp");
  const descriptor = record(
    operation.descriptor,
    "controller origination descriptor",
  ) as unknown as PastaUiLiveOperationDescriptor;
  exact(descriptor.kind, "originate", "controller descriptor kind");
  exactKeys(
    descriptor as unknown as JsonRecord,
    ["code", "kind", "storage"],
    "controller descriptor",
  );
  return descriptor as Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }>;
}

function writeReceipt(
  identity: RavioliControllerResumeIdentity,
): PastaUiLivePublicReceipt {
  return {
    schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
    sequence: 1,
    timestampUtc: identity.origination.timestamp,
    action: "originate",
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: identity.creatorAddress,
    contractAddress: identity.controllerAddress,
    operationHash: identity.origination.operationHash,
    entrypoints: [],
  };
}

export async function loadRavioliControllerResume(
  input: LoadRavioliControllerResumeInput,
): Promise<RavioliControllerResume> {
  if (input.journal.isFinalized()) fail("the recovery prefix must remain unfinalized");
  if (input.journal.getCompletedOperationCount() !== 1) {
    fail("the recovery prefix must contain exactly one APPLIED operation");
  }
  if (validateAddress(input.expected.creatorAddress) !== ValidationResult.VALID) {
    fail("expected creator address is invalid");
  }
  const root = path.resolve(input.journal.journalRoot);
  const intentFile = await canonicalJsonFile(path.join(root, "intent.json"), "journal intent");
  const intent = intentFile.value;
  if (
    intent.schema !== RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA
    && intent.schema !== RAVIOLI_UI_LIVE_JOURNAL_EFFECTIVE_INTENT_SCHEMA
  ) {
    fail("journal intent schema is unsupported");
  }
  exact(intent.schema, input.journal.intent.schema, "journal intent schema");
  exact(
    intent.matrixSha256,
    input.journal.intent.matrixSha256,
    "journal intent matrix hash",
  );
  exactJson(intent.matrix, input.journal.intent.matrix, "journal intent matrix");
  exact(intent.status, "IMMUTABLE", "journal intent status");
  exact(intent.journalId, input.journal.intent.journalId, "journal id");
  exact(intent.createdAt, input.journal.intent.createdAt, "journal creation time");
  const network = record(intent.network, "journal network");
  exactJson(network, { chainId: SHADOWNET_CHAIN_ID, name: "shadownet" }, "journal network");
  const actors = record(intent.actors, "journal actors");
  const expectedActors = [
    ["creator", input.expected.creatorAddress],
    ["collector1", input.expected.collectorOneAddress],
    ["collector2", input.expected.collectorTwoAddress],
  ] as const;
  for (const [actor, signerAddress] of expectedActors) {
    const actorIntent = record(actors[actor], `journal ${actor}`);
    exact(actorIntent.signerAddress, signerAddress, `journal ${actor} signer`);
    const counters = record(actorIntent.counters, `journal ${actor} counters`);
    const primary = record(counters.primary, `journal ${actor} primary counter`);
    const fallback = record(counters.fallback, `journal ${actor} fallback counter`);
    exact(primary.counter, fallback.counter, `journal ${actor} dual-RPC base counter`);
  }
  exactJson(
    intent.dependencyAddresses,
    input.expected.dependencyAddresses,
    "journal dependency addresses",
  );
  const dependencyHashes = record(intent.dependencyHashes, "journal dependency hashes");
  const { tzktBaseline, ...stableDependencyHashes } = dependencyHashes;
  if (typeof tzktBaseline !== "string" || !HASH_RE.test(tzktBaseline)) {
    fail("journal TzKT baseline hash is invalid");
  }
  exactJson(
    stableDependencyHashes,
    input.expected.dependencyHashes,
    "journal dependency hashes",
  );
  exactJson(intent.artifactHashes, input.expected.artifactHashes, "journal artifact hashes");
  const artifactHashes = record(intent.artifactHashes, "journal artifact hashes");
  const controllerArtifactSha256 = hashJsonForBridge(input.expected.controllerArtifact);
  const routerArtifactSha256 = hashJsonForBridge(input.expected.routerArtifact);
  exact(
    artifactHashes.blindController,
    controllerArtifactSha256,
    "journal controller artifact hash",
  );
  exact(artifactHashes.router, routerArtifactSha256, "journal router artifact hash");

  exactJson(
    (await readdir(path.join(root, "events"))).sort(),
    EVENT_NAMES,
    "six-event controller prefix filenames",
  );
  exactJson(
    (await readdir(path.join(root, "pins"))).sort(),
    PIN_NAMES,
    "three-pin controller prefix filenames",
  );
  const events = await Promise.all(EVENT_NAMES.map((name, index) =>
    canonicalJsonFile(path.join(root, "events", name), `event ${index + 1}`)));
  const pins = await Promise.all(PIN_NAMES.map((name) => readFile(path.join(root, "pins", name))));
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index].value;
    exact(event.schema, RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA, `event ${index + 1} schema`);
    exact(event.journalId, intent.journalId, `event ${index + 1} journal`);
    exact(event.intentSha256, intentFile.sha256, `event ${index + 1} intent`);
    exact(event.eventIndex, index + 1, `event ${index + 1} index`);
    exact(event.actor, "creator", `event ${index + 1} actor`);
    exact(event.phase, PHASES[index], `event ${index + 1} phase`);
    exact(
      event.previousRecordSha256,
      index === 0 ? intentFile.sha256 : events[index - 1].sha256,
      `event ${index + 1} hash link`,
    );
  }

  const pinProofs = [
    pinProof(events[0].value, pins[0], 1, input.ipfs),
    pinProof(events[1].value, pins[1], 2, input.ipfs),
    pinProof(events[2].value, pins[2], 3, input.ipfs),
  ] as const;
  if (!/^ravioli-wrapper-0\./.test(pinProofs[0].fileName)) {
    fail("wrapper pin is not the mode-0 wrapper artifact");
  }
  exact(
    pinProofs[1].fileName,
    "pasta-ravioli-blind-controller-contract.json",
    "controller metadata filename",
  );
  exact(pinProofs[1].mimeType, "application/json", "controller metadata MIME type");
  exact(pinProofs[2].fileName, "collection.json", "collection metadata filename");
  exact(pinProofs[2].mimeType, "application/json", "collection metadata MIME type");
  const controllerMetadata = parseCanonicalJson(pins[1], "controller metadata");
  const collectionMetadata = parseCanonicalJson(pins[2], "collection metadata");
  validateControllerMetadata(controllerMetadata);
  validateCollectionMetadata(collectionMetadata);

  const descriptor = operationDescriptor(events[3].value);
  const descriptorSha256 = ravioliUiLiveDescriptorSha256(descriptor);
  exact(events[3].value.descriptorSha256, descriptorSha256, "controller descriptor identity");
  exact(
    hashMichelsonScriptCode(descriptor.code as unknown[]),
    hashMichelsonScriptCode(input.expected.controllerArtifact),
    "controller descriptor canonical code",
  );
  validateControllerStorage(descriptor.storage, pinProofs[1].uri);
  const preparedOperation = record(events[3].value.operation, "controller PREPARED operation");
  exact(
    preparedOperation.signerAddress,
    input.expected.creatorAddress,
    "controller PREPARED signer",
  );

  const submitted = events[4].value;
  exact(submitted.phase, "SUBMITTED", "controller SUBMITTED phase");
  exact(submitted.globalOrdinal, 1, "controller SUBMITTED ordinal");
  exact(submitted.operationSequence, 1, "controller SUBMITTED sequence");
  exact(submitted.descriptorSha256, descriptorSha256, "controller SUBMITTED descriptor");
  if (typeof submitted.preparedRecordSha256 !== "string" || !HASH_RE.test(submitted.preparedRecordSha256)) {
    fail("controller SUBMITTED PREPARED link is invalid");
  }
  const operationHash = String(submitted.operationHash || "");
  const controllerAddress = String(submitted.contractAddress || "");
  if (validateOperation(operationHash) !== ValidationResult.VALID) {
    fail("controller operation hash is invalid");
  }
  if (validateContractAddress(controllerAddress) !== ValidationResult.VALID) {
    fail("controller originated address is invalid");
  }

  const applied = events[5].value;
  exact(applied.phase, "APPLIED", "controller APPLIED phase");
  exact(applied.globalOrdinal, 1, "controller APPLIED ordinal");
  exact(applied.operationSequence, 1, "controller APPLIED sequence");
  exact(applied.descriptorSha256, descriptorSha256, "controller APPLIED descriptor");
  exact(applied.operationHash, operationHash, "controller APPLIED hash");
  if (typeof applied.submittedRecordSha256 !== "string" || !HASH_RE.test(applied.submittedRecordSha256)) {
    fail("controller APPLIED SUBMITTED link is invalid");
  }
  const evidence = record(applied.evidence, "controller APPLIED evidence");
  exactKeys(
    evidence,
    [
      "contractAddress",
      "counter",
      "entrypoints",
      "explorerUrl",
      "level",
      "operationHash",
      "signerAddress",
      "status",
      "timestamp",
    ],
    "controller APPLIED evidence",
  );
  const creatorIntent = record(actors.creator, "journal creator");
  const creatorCounters = record(creatorIntent.counters, "journal creator counters");
  const creatorBaseCounter = Number(record(creatorCounters.primary, "creator primary counter").counter);
  if (!Number.isSafeInteger(creatorBaseCounter) || creatorBaseCounter < 0) {
    fail("creator base counter is invalid");
  }
  exact(evidence.status, "applied", "controller APPLIED status");
  exact(evidence.operationHash, operationHash, "controller APPLIED evidence hash");
  exact(evidence.contractAddress, controllerAddress, "controller APPLIED address");
  exact(evidence.signerAddress, input.expected.creatorAddress, "controller APPLIED signer");
  exact(evidence.counter, creatorBaseCounter + 1, "controller APPLIED counter");
  exactJson(evidence.entrypoints, [], "controller APPLIED entrypoints");
  exact(
    evidence.explorerUrl,
    `https://shadownet.tzkt.io/${operationHash}`,
    "controller APPLIED explorer URL",
  );
  const level = Number(evidence.level);
  const timestamp = String(evidence.timestamp || "");
  if (!Number.isSafeInteger(level) || level <= 0) fail("controller APPLIED level is invalid");
  if (!Number.isFinite(Date.parse(timestamp))) fail("controller APPLIED timestamp is invalid");

  const identity: RavioliControllerResumeIdentity = Object.freeze({
    journalId: String(intent.journalId || ""),
    intentSha256: intentFile.sha256,
    createdAt: String(intent.createdAt || ""),
    creatorAddress: input.expected.creatorAddress,
    creatorBaseCounter,
    controllerAddress,
    controllerArtifactSha256,
    routerArtifactSha256,
    origination: Object.freeze({
      descriptorSha256,
      operationHash,
      contractAddress: controllerAddress,
      counter: creatorBaseCounter + 1,
      level,
      timestamp,
    }),
  });
  const pinRecords = [
    Object.freeze({
      kind: "wrapper" as const,
      pinSequence: 1 as const,
      eventPath: `events/${EVENT_NAMES[0]}`,
      artifactPath: `pins/${PIN_NAMES[0]}`,
      bytes: Uint8Array.from(pins[0]),
      proof: pinProofs[0],
    }),
    Object.freeze({
      kind: "controller-metadata" as const,
      pinSequence: 2 as const,
      eventPath: `events/${EVENT_NAMES[1]}`,
      artifactPath: `pins/${PIN_NAMES[1]}`,
      bytes: Uint8Array.from(pins[1]),
      value: controllerMetadata,
      proof: pinProofs[1],
    }),
    Object.freeze({
      kind: "collection" as const,
      pinSequence: 3 as const,
      eventPath: `events/${EVENT_NAMES[2]}`,
      artifactPath: `pins/${PIN_NAMES[2]}`,
      bytes: Uint8Array.from(pins[2]),
      value: collectionMetadata,
      proof: pinProofs[2],
    }),
  ] as const;
  return Object.freeze({
    journalRoot: root,
    journalPrefixComplete: true,
    controllerAddress,
    controllerOriginationDescriptor: descriptor,
    activePins: pinRecords,
    pinProofs,
    writeReceipts: Object.freeze([writeReceipt(identity)]) as readonly [PastaUiLivePublicReceipt],
    identity,
  });
}

function canonicalBase64(value: unknown): Uint8Array {
  if (
    typeof value !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    fail("pin_blob data is not canonical base64");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) fail("pin_blob data is not canonical base64");
  return bytes;
}

function pinBlobFingerprint(request: PastaUiLiveBridgeRequest): string {
  const payload = record(request.payload, "pin_blob payload");
  exactKeys(payload, ["dataBase64", "fileName", "mimeType"], "pin_blob payload");
  const bytes = canonicalBase64(payload.dataBase64);
  return `pin_blob:${String(payload.fileName)}:${String(payload.mimeType)}:${sha256(bytes)}:${bytes.byteLength}`;
}

function pinJsonFingerprint(request: PastaUiLiveBridgeRequest): string {
  const payload = record(request.payload, "pin_json payload");
  exactKeys(payload, ["fileName", "value"], "pin_json payload");
  const bytes = deterministicJsonBytes(decodePastaUiLiveValue(payload.value));
  return `pin_json:${String(payload.fileName)}:${sha256(bytes)}:${bytes.byteLength}`;
}

function originateDescriptor(
  request: PastaUiLiveBridgeRequest,
): Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }> {
  const payload = record(request.payload, "originate payload");
  exactKeys(payload, ["code", "storage"], "originate payload");
  return {
    kind: "originate",
    code: decodePastaUiLiveValue(payload.code),
    storage: decodePastaUiLiveValue(payload.storage),
  };
}

function originateFingerprint(request: PastaUiLiveBridgeRequest): string {
  return `originate:${ravioliUiLiveDescriptorSha256(originateDescriptor(request))}`;
}

function requestFingerprint(request: PastaUiLiveBridgeRequest): string | null {
  try {
    if (request.action === "pin_blob") return pinBlobFingerprint(request);
    if (request.action === "pin_json") return pinJsonFingerprint(request);
    if (request.action === "originate") return originateFingerprint(request);
    return null;
  } catch {
    return null;
  }
}

function decodedMapGet(value: unknown, key: unknown): unknown {
  if (value && typeof value === "object" && "get" in value && typeof (value as { get?: unknown }).get === "function") {
    return (value as { get(input: unknown): unknown }).get(key);
  }
  const encoded = record(value, "encoded map");
  if (!Array.isArray(encoded.$map)) fail("encoded map entries are missing");
  return encoded.$map.find((entry) => Array.isArray(entry) && entry[0] === key)?.[1];
}

function validateFirstRouterRequest(
  request: PastaUiLiveBridgeRequest,
  replay: RavioliControllerResume,
): void {
  if (request.action !== "originate") {
    fail(`first new mutation must originate the router, received ${request.action}`);
  }
  const descriptor = originateDescriptor(request);
  exact(
    hashJsonForBridge(descriptor.code),
    replay.identity.routerArtifactSha256,
    "first delegated router artifact",
  );
  const storage = record(descriptor.storage, "first delegated router storage");
  exact(storage.administrator, replay.identity.creatorAddress, "first delegated router administrator");
  exact(storage.pending_administrator, null, "first delegated router pending administrator");
  exact(
    storage.blind_controller,
    replay.controllerAddress,
    "first delegated router controller binding",
  );
  const metadataHex = decodedMapGet(storage.metadata, "");
  exact(
    metadataHex,
    Buffer.from(replay.activePins[2].proof.uri, "utf8").toString("hex"),
    "first delegated router metadata URI",
  );
}

export function createRavioliControllerResumeInterceptor(input: {
  replay: RavioliControllerResume;
  delegate: PastaUiLiveBridgeHandler;
}): RavioliControllerResumeInterceptor {
  const { replay, delegate } = input;
  const [wrapper, controllerMetadata, collection] = replay.activePins;
  const steps = Object.freeze([
    Object.freeze({
      action: "pin_blob" as const,
      fingerprint:
        `pin_blob:${wrapper.proof.fileName}:${wrapper.proof.mimeType}:${wrapper.proof.sha256}:${wrapper.proof.byteLength}`,
      respond: () => ({ pin: wrapper.proof }),
    }),
    Object.freeze({
      action: "pin_json" as const,
      fingerprint:
        `pin_json:${controllerMetadata.proof.fileName}:${controllerMetadata.proof.sha256}:${controllerMetadata.proof.byteLength}`,
      respond: () => ({ pin: controllerMetadata.proof }),
    }),
    Object.freeze({
      action: "pin_json" as const,
      fingerprint:
        `pin_json:${collection.proof.fileName}:${collection.proof.sha256}:${collection.proof.byteLength}`,
      respond: () => ({ pin: collection.proof }),
    }),
    Object.freeze({
      action: "originate" as const,
      fingerprint: `originate:${replay.identity.origination.descriptorSha256}`,
      respond: () => ({
        contractAddress: replay.controllerAddress,
        operationHash: replay.identity.origination.operationHash,
        confirmationLevel: 1,
      }),
    }),
  ]);
  const replayFingerprints = new Set(steps.map((step) => step.fingerprint));
  let completed = 0;
  let routerDelegated = false;

  const handle: PastaUiLiveBridgeHandler = async (request) => {
    if (READ_ACTIONS.has(request.action)) return delegate(request);
    if (completed < steps.length) {
      const expected = steps[completed];
      if (request.action !== expected.action) {
        fail(`expected recovery step ${completed + 1} (${expected.action}), received ${request.action}`);
      }
      const fingerprint = requestFingerprint(request);
      if (fingerprint !== expected.fingerprint) {
        fail(`recovery step ${completed + 1} ${expected.action} bytes or descriptor drifted`);
      }
      completed += 1;
      return expected.respond();
    }
    const fingerprint = requestFingerprint(request);
    if (fingerprint && replayFingerprints.has(fingerprint)) {
      fail(`refusing duplicate recovery mutation after the four-step prefix completed: ${request.action}`);
    }
    if (!routerDelegated) {
      validateFirstRouterRequest(request, replay);
      routerDelegated = true;
    }
    return delegate(request);
  };

  return Object.freeze({
    handle,
    isComplete: () => completed === steps.length,
    didDelegateRouter: () => routerDelegated,
    getCompletedStepCount: () => completed,
    getRemainingStepCount: () => steps.length - completed,
  });
}
