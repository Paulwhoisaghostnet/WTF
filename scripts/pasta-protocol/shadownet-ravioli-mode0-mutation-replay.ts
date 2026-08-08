import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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
  RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA,
  RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA,
  ravioliUiLiveDescriptorSha256,
  type RavioliUiLiveJournal,
} from "./shadownet-ravioli-ui-live-journal";
import {
  deterministicJsonBytes,
  ipfsGatewayUrl,
  SHADOWNET_CHAIN_ID,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

const HASH_RE = /^[0-9a-f]{64}$/;
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
const EVENT_NAMES = Object.freeze([
  "000001-pin-creator.json",
  "000002-pin-creator.json",
  "000003-prepared-creator.json",
  "000004-submitted-creator.json",
  "000005-applied-creator.json",
  "000006-prepared-creator.json",
  "000007-submitted-creator.json",
  "000008-applied-creator.json",
  "000009-pin-creator.json",
  "000010-pin-creator.json",
] as const);
const PIN_NAMES = Object.freeze([
  "000001.bin",
  "000002.bin",
  "000003.bin",
  "000004.bin",
] as const);
const PHASES = Object.freeze([
  "PIN",
  "PIN",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PIN",
  "PIN",
] as const);
const BLIND_SECURITY = "commit-reveal-ui-hidden-chain-public";

type JsonRecord = Record<string, unknown>;

export type RavioliMode0ReplayPinIdentity = Readonly<{
  cid: string;
  uri: `ipfs://${string}`;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}>;

export type RavioliMode0ReplayOperationIdentity = Readonly<{
  descriptorSha256: string;
  operationHash: string;
  counter: number;
  level: number;
}>;

export type RavioliMode0MutationReplayIdentity = Readonly<{
  journalId: string;
  intentSha256: string;
  createdAt: string;
  creatorAddress: string;
  creatorBaseCounter: number;
  gnocchiAddress: string;
  rotiniAddress: string;
  routerAddress: string;
  routerArtifactSha256: string;
  wrapperPin: RavioliMode0ReplayPinIdentity;
  collectionPin: RavioliMode0ReplayPinIdentity;
  staleManifestPin: RavioliMode0ReplayPinIdentity;
  staleTokenPin: RavioliMode0ReplayPinIdentity;
  origination: RavioliMode0ReplayOperationIdentity;
  operatorApproval: RavioliMode0ReplayOperationIdentity;
}>;

export const RAVIOLI_MODE0_CURRENT_MUTATION_REPLAY_IDENTITY: RavioliMode0MutationReplayIdentity =
  Object.freeze({
    journalId: "4fb3924dd932ada01f633ea5d76d39aa4592a31eec77ffbc7397cd3493fbb3f7",
    intentSha256: "b3fbd408b35c1e66a9a20a9dc43021e68fa0b274e8e1cc04988834e1792465f1",
    createdAt: "2026-07-23T03:31:22.839Z",
    creatorAddress: "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM",
    creatorBaseCounter: 23_831_495,
    gnocchiAddress: "KT1Qzue6Uxojgsf2SxhVk5sqv1T3BGB9Ba69",
    rotiniAddress: "KT1BHRGCyGLjxr7LA6eCyHFBoo9QDFTV3Bat",
    routerAddress: "KT1TuPCh4gR19w7kdrYVv5jVF9VrKJU6z5rj",
    routerArtifactSha256: "a8de8e143bbbfe30e3ad2487793581c46d398742bf9e61849252789b36dbca60",
    wrapperPin: Object.freeze({
      cid: "bafkreigrhdcrr2mnwaflnqhqviz4skohv4cveo7hayec5hda5i6hnf2rza",
      uri: "ipfs://bafkreigrhdcrr2mnwaflnqhqviz4skohv4cveo7hayec5hda5i6hnf2rza",
      fileName: "ravioli-wrapper-0.png",
      mimeType: "image/png",
      byteLength: 93,
      sha256: "d138c518e98db00ab6c0f0aa33c929c7af05523be706082e9c60ea3c769751c8",
    }),
    collectionPin: Object.freeze({
      cid: "bafkreiglspdzfzigot3kx7p6kbnyi4fmk67kikojwpuxf6oaxe6kkrwb5q",
      uri: "ipfs://bafkreiglspdzfzigot3kx7p6kbnyi4fmk67kikojwpuxf6oaxe6kkrwb5q",
      fileName: "collection.json",
      mimeType: "application/json",
      byteLength: 139,
      sha256: "cb93c792e50674f6abfdfe505b8470ac57bea429c9b3e972f9c0b93ca546c1ec",
    }),
    staleManifestPin: Object.freeze({
      cid: "bafkreihrq5mc6zgley3qfffqap3bqfya6w6cclu74ocf55zokn4vcwjwke",
      uri: "ipfs://bafkreihrq5mc6zgley3qfffqap3bqfya6w6cclu74ocf55zokn4vcwjwke",
      fileName: "ravioli-pack-manifest.json",
      mimeType: "application/json",
      byteLength: 850,
      sha256: "f187582f64cb26370294b003f6181700f5bc212e9fe3845ef72e537951593651",
    }),
    staleTokenPin: Object.freeze({
      cid: "bafkreig7x3vu4uihh237dw2y2leydeqctnifpcw46evs65k6pktmgu22we",
      uri: "ipfs://bafkreig7x3vu4uihh237dw2y2leydeqctnifpcw46evs65k6pktmgu22we",
      fileName: "token.json",
      mimeType: "application/json",
      byteLength: 979,
      sha256: "dfbeeb4e51073eb7f1db58d2c98192029b50578adcf12b2f755e7aa6c3535ab1",
    }),
    origination: Object.freeze({
      descriptorSha256: "ac878121e7e96d7a63a2327eae89379b304740e7183fddcbd28144f44b48e6c5",
      operationHash: "onomEQKxKWZCsMwgNM7eV1fQKv1A1wwMGoZU3E9yuPdnhUAcbqg",
      counter: 23_831_496,
      level: 4_311_756,
    }),
    operatorApproval: Object.freeze({
      descriptorSha256: "6b4c633843c33727c21066b0c958503ed66ba86044dc39ee937d68b02991c24c",
      operationHash: "onqJpabnVoKeZkgSaygd5j5D7f6G3zGQD3qYwkFwwY3u4d7KvbR",
      counter: 23_831_497,
      level: 4_311_759,
    }),
  });

export type RavioliMode0ReplayPinRecord = Readonly<{
  kind: "wrapper" | "collection";
  pinSequence: 1 | 2;
  eventPath: string;
  artifactPath: string;
  bytes: Uint8Array;
  value?: unknown;
  proof: PastaUiLivePinProof;
}>;

export type RavioliMode0StalePinDiagnostic = Readonly<{
  classification: "SUPERSEDED_MODE0_MYSTERY_METADATA";
  reason: string;
  pinSequence: 3 | 4;
  eventPath: string;
  artifactPath: string;
  fileName: string;
  mimeType: string;
  cid: string;
  uri: string;
  publicGatewayUrl: string;
  byteLength: number;
  sha256: string;
}>;

export type RavioliMode0MutationReplay = Readonly<{
  journalRoot: string;
  journalPrefixComplete: true;
  routerAddress: string;
  operatorApprovalLevel: number;
  originationDescriptor: Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }>;
  operatorApprovalDescriptor: Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>;
  activePins: readonly [RavioliMode0ReplayPinRecord, RavioliMode0ReplayPinRecord];
  pinProofs: readonly [PastaUiLivePinProof, PastaUiLivePinProof];
  writeReceipts: readonly [PastaUiLivePublicReceipt, PastaUiLivePublicReceipt];
  stalePins: readonly [RavioliMode0StalePinDiagnostic, RavioliMode0StalePinDiagnostic];
  identity: RavioliMode0MutationReplayIdentity;
}>;

export type LoadRavioliMode0MutationReplayInput = {
  /**
   * This must be the object returned by openRavioliUiLiveJournal. The loader
   * deliberately re-reads every prefix file to close the validation/use gap.
   */
  journal: RavioliUiLiveJournal;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  identity?: RavioliMode0MutationReplayIdentity;
};

export type RavioliMode0MutationReplayInterceptor = {
  handle: PastaUiLiveBridgeHandler;
  isComplete(): boolean;
  getCompletedStepCount(): number;
  getRemainingStepCount(): number;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message: string): never {
  throw new Error(`Ravioli mode-0 mutation replay: ${message}`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail(`${label} fields drift`);
  }
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) fail(`${label} drift`);
}

function exactJson(value: unknown, expected: unknown, label: string): void {
  if (!Buffer.from(deterministicJsonBytes(value)).equals(Buffer.from(deterministicJsonBytes(expected)))) {
    fail(`${label} drift`);
  }
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

function pinIdentityAt(identity: RavioliMode0MutationReplayIdentity, sequence: number): RavioliMode0ReplayPinIdentity {
  if (sequence === 1) return identity.wrapperPin;
  if (sequence === 2) return identity.collectionPin;
  if (sequence === 3) return identity.staleManifestPin;
  if (sequence === 4) return identity.staleTokenPin;
  return fail(`unsupported pin identity ${sequence}`);
}

function assertPinEvent(
  event: JsonRecord,
  bytes: Uint8Array,
  sequence: number,
  expected: RavioliMode0ReplayPinIdentity,
  publicGatewayUrl: string,
): void {
  exact(event.phase, "PIN", `pin ${sequence} phase`);
  exact(event.pinSequence, sequence, `pin ${sequence} sequence`);
  const artifact = record(event.artifact, `pin ${sequence} artifact`);
  exactKeys(artifact, ["byteLength", "fileName", "mimeType", "path", "sha256"], `pin ${sequence} artifact`);
  exact(artifact.path, `pins/${String(sequence).padStart(6, "0")}.bin`, `pin ${sequence} path`);
  exact(artifact.fileName, expected.fileName, `pin ${sequence} file name`);
  exact(artifact.mimeType, expected.mimeType, `pin ${sequence} MIME type`);
  exact(artifact.byteLength, expected.byteLength, `pin ${sequence} byte length`);
  exact(artifact.sha256, expected.sha256, `pin ${sequence} checkpoint hash`);
  exact(bytes.byteLength, expected.byteLength, `pin ${sequence} exact byte length`);
  exact(sha256(bytes), expected.sha256, `pin ${sequence} exact byte hash`);
  const metadata = record(event.metadata, `pin ${sequence} metadata`);
  exactKeys(metadata, ["cid", "publicGatewayUrl", "uri"], `pin ${sequence} metadata`);
  exact(metadata.cid, expected.cid, `pin ${sequence} CID`);
  exact(metadata.uri, expected.uri, `pin ${sequence} URI`);
  exact(metadata.uri, `ipfs://${String(metadata.cid)}`, `pin ${sequence} URI/CID binding`);
  exact(metadata.publicGatewayUrl, publicGatewayUrl, `pin ${sequence} public gateway`);
}

function assertPrepared(
  event: JsonRecord,
  ordinal: 1 | 2,
  identity: RavioliMode0MutationReplayIdentity,
  operationIdentity: RavioliMode0ReplayOperationIdentity,
): PastaUiLiveOperationDescriptor {
  exact(event.phase, "PREPARED", `operation ${ordinal} PREPARED phase`);
  exact(event.globalOrdinal, ordinal, `operation ${ordinal} global ordinal`);
  exact(event.operationSequence, ordinal, `operation ${ordinal} sequence`);
  exact(event.descriptorSha256, operationIdentity.descriptorSha256, `operation ${ordinal} descriptor identity`);
  const operation = record(event.operation, `operation ${ordinal} PREPARED operation`);
  exact(operation.status, "PREPARED", `operation ${ordinal} status`);
  exact(operation.operationSequence, ordinal, `operation ${ordinal} persisted sequence`);
  exact(operation.chainId, SHADOWNET_CHAIN_ID, `operation ${ordinal} chain`);
  exact(operation.signerAddress, identity.creatorAddress, `operation ${ordinal} signer`);
  exact(operation.timestampUtc, event.timestampUtc, `operation ${ordinal} timestamp`);
  const descriptor = record(operation.descriptor, `operation ${ordinal} descriptor`) as unknown as PastaUiLiveOperationDescriptor;
  exact(
    ravioliUiLiveDescriptorSha256(descriptor),
    operationIdentity.descriptorSha256,
    `operation ${ordinal} exported descriptor hash`,
  );
  if (ordinal === 1) {
    exact(operation.action, "originate", "router origination action");
    exactJson(operation.entrypoints, [], "router origination entrypoints");
    exact(descriptor.kind, "originate", "router origination descriptor kind");
    exactKeys(descriptor as unknown as JsonRecord, ["code", "kind", "storage"], "router origination descriptor");
  } else {
    exact(operation.action, "call", "operator approval action");
    exact(operation.contractAddress, identity.gnocchiAddress, "operator approval target");
    exactJson(operation.entrypoints, ["update_operators"], "operator approval entrypoints");
    assertOperatorApprovalDescriptor(descriptor, identity);
  }
  return descriptor;
}

function assertSubmitted(
  event: JsonRecord,
  ordinal: 1 | 2,
  operationIdentity: RavioliMode0ReplayOperationIdentity,
  contractAddress: string,
): void {
  exact(event.phase, "SUBMITTED", `operation ${ordinal} SUBMITTED phase`);
  exact(event.globalOrdinal, ordinal, `operation ${ordinal} SUBMITTED ordinal`);
  exact(event.operationSequence, ordinal, `operation ${ordinal} SUBMITTED sequence`);
  exact(event.descriptorSha256, operationIdentity.descriptorSha256, `operation ${ordinal} SUBMITTED descriptor`);
  exact(event.operationHash, operationIdentity.operationHash, `operation ${ordinal} SUBMITTED hash`);
  exact(event.contractAddress, contractAddress, `operation ${ordinal} SUBMITTED contract`);
  if (typeof event.preparedRecordSha256 !== "string" || !HASH_RE.test(event.preparedRecordSha256)) {
    fail(`operation ${ordinal} SUBMITTED PREPARED link is invalid`);
  }
}

function assertApplied(
  event: JsonRecord,
  ordinal: 1 | 2,
  operationIdentity: RavioliMode0ReplayOperationIdentity,
  identity: RavioliMode0MutationReplayIdentity,
  contractAddress: string,
  entrypoints: readonly string[],
): JsonRecord {
  exact(event.phase, "APPLIED", `operation ${ordinal} APPLIED phase`);
  exact(event.globalOrdinal, ordinal, `operation ${ordinal} APPLIED ordinal`);
  exact(event.operationSequence, ordinal, `operation ${ordinal} APPLIED sequence`);
  exact(event.descriptorSha256, operationIdentity.descriptorSha256, `operation ${ordinal} APPLIED descriptor`);
  exact(event.operationHash, operationIdentity.operationHash, `operation ${ordinal} APPLIED hash`);
  if (typeof event.submittedRecordSha256 !== "string" || !HASH_RE.test(event.submittedRecordSha256)) {
    fail(`operation ${ordinal} APPLIED SUBMITTED link is invalid`);
  }
  const evidence = record(event.evidence, `operation ${ordinal} APPLIED evidence`);
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
    `operation ${ordinal} APPLIED evidence`,
  );
  exact(evidence.status, "applied", `operation ${ordinal} status`);
  exact(evidence.operationHash, operationIdentity.operationHash, `operation ${ordinal} evidence hash`);
  exact(evidence.signerAddress, identity.creatorAddress, `operation ${ordinal} evidence signer`);
  exact(evidence.contractAddress, contractAddress, `operation ${ordinal} evidence target`);
  exact(evidence.counter, operationIdentity.counter, `operation ${ordinal} evidence counter`);
  exact(evidence.counter, identity.creatorBaseCounter + ordinal, `operation ${ordinal} counter derivation`);
  exact(evidence.level, operationIdentity.level, `operation ${ordinal} evidence level`);
  exactJson(evidence.entrypoints, entrypoints, `operation ${ordinal} evidence entrypoints`);
  exact(
    evidence.explorerUrl,
    `https://shadownet.tzkt.io/${operationIdentity.operationHash}`,
    `operation ${ordinal} explorer URL`,
  );
  if (typeof evidence.timestamp !== "string" || !Number.isFinite(Date.parse(evidence.timestamp))) {
    fail(`operation ${ordinal} evidence timestamp is invalid`);
  }
  return evidence;
}

function assertOperatorApprovalDescriptor(
  descriptor: PastaUiLiveOperationDescriptor,
  identity: RavioliMode0MutationReplayIdentity,
): asserts descriptor is Extract<PastaUiLiveOperationDescriptor, { kind: "call" }> {
  exact(descriptor.kind, "call", "operator approval descriptor kind");
  const callDescriptor = descriptor as Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>;
  exactKeys(callDescriptor as unknown as JsonRecord, ["call", "kind", "sendOptions"], "operator approval descriptor");
  exactJson(callDescriptor.sendOptions, {}, "operator approval send options");
  const call = record(callDescriptor.call, "operator approval call");
  exactKeys(call, ["contractAddress", "entrypoint", "payload"], "operator approval call");
  exact(call.contractAddress, identity.gnocchiAddress, "operator approval Gnocchi target");
  exact(call.entrypoint, "update_operators", "operator approval entrypoint");
  if (!Array.isArray(call.payload) || call.payload.length !== 1) {
    fail("operator approval payload must contain exactly one update");
  }
  const update = record(call.payload[0], "operator approval update");
  exactKeys(update, ["add_operator"], "operator approval update");
  const add = record(update.add_operator, "operator approval add_operator");
  exactKeys(add, ["operator", "owner", "token_id"], "operator approval add_operator");
  exact(add.owner, identity.creatorAddress, "operator approval owner");
  exact(add.operator, identity.routerAddress, "operator approval router");
  exact(add.token_id, 0, "operator approval token");
}

function pinProof(
  identity: RavioliMode0ReplayPinIdentity,
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">,
): PastaUiLivePinProof {
  return {
    cid: identity.cid,
    uri: identity.uri,
    fileName: identity.fileName,
    mimeType: identity.mimeType,
    byteLength: identity.byteLength,
    sha256: identity.sha256,
    localGatewayUrl: ipfsGatewayUrl(ipfs.localGatewayUrl, identity.cid),
    publicGatewayUrl: ipfsGatewayUrl(ipfs.publicGatewayUrl, identity.cid),
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

function writeReceipt(
  sequence: 1 | 2,
  action: "originate" | "call",
  identity: RavioliMode0MutationReplayIdentity,
  operation: RavioliMode0ReplayOperationIdentity,
  evidence: JsonRecord,
  contractAddress: string,
  entrypoints: string[],
): PastaUiLivePublicReceipt {
  return {
    schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
    sequence,
    timestampUtc: String(evidence.timestamp),
    action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: identity.creatorAddress,
    contractAddress,
    operationHash: operation.operationHash,
    entrypoints,
  };
}

function staleDiagnostic(
  sequence: 3 | 4,
  event: JsonRecord,
  identity: RavioliMode0ReplayPinIdentity,
): RavioliMode0StalePinDiagnostic {
  const metadata = record(event.metadata, `stale pin ${sequence} metadata`);
  const artifact = record(event.artifact, `stale pin ${sequence} artifact`);
  return Object.freeze({
    classification: "SUPERSEDED_MODE0_MYSTERY_METADATA",
    reason:
      "The interrupted mode-0 run generated this metadata with mystery/commit-reveal semantics. " +
      "It is not referenced by an applied operation and must be regenerated by the corrected deterministic-vault path.",
    pinSequence: sequence,
    eventPath: `events/${EVENT_NAMES[sequence === 3 ? 8 : 9]}`,
    artifactPath: String(artifact.path),
    fileName: identity.fileName,
    mimeType: identity.mimeType,
    cid: identity.cid,
    uri: identity.uri,
    publicGatewayUrl: String(metadata.publicGatewayUrl),
    byteLength: identity.byteLength,
    sha256: identity.sha256,
  });
}

function validateStaleSemantics(manifestBytes: Uint8Array, tokenBytes: Uint8Array): void {
  let manifest: JsonRecord;
  let token: JsonRecord;
  try {
    manifest = record(JSON.parse(Buffer.from(manifestBytes).toString("utf8")), "stale manifest");
    token = record(JSON.parse(Buffer.from(tokenBytes).toString("utf8")), "stale token metadata");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Ravioli mode-0 mutation replay:")) throw error;
    fail("stale metadata bytes are not JSON");
  }
  exact(manifest.mode, "deterministic_vault", "stale manifest mode");
  exact(manifest.mystery, true, "stale manifest mystery flag");
  exact(manifest.blindSecurity, BLIND_SECURITY, "stale manifest blind security");
  const ravioli = record(token.ravioli, "stale token Ravioli metadata");
  exact(ravioli.mode, "deterministic_vault", "stale token mode");
  exact(ravioli.blindSecurity, BLIND_SECURITY, "stale token blind security");
}

export async function loadRavioliMode0MutationReplay(
  input: LoadRavioliMode0MutationReplayInput,
): Promise<RavioliMode0MutationReplay> {
  const identity = input.identity ?? RAVIOLI_MODE0_CURRENT_MUTATION_REPLAY_IDENTITY;
  if (input.journal.isFinalized()) fail("the recovery prefix must remain unfinalized");
  if (input.journal.getCompletedOperationCount() !== 2) fail("the recovery prefix must contain exactly two APPLIED operations");

  const root = path.resolve(input.journal.journalRoot);
  const intentFile = await canonicalJsonFile(path.join(root, "intent.json"), "journal intent");
  exact(intentFile.sha256, identity.intentSha256, "journal intent hash");
  const intent = intentFile.value;
  exact(intent.schema, RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA, "journal intent schema");
  exact(intent.status, "IMMUTABLE", "journal intent status");
  exact(intent.journalId, identity.journalId, "journal id");
  exact(intent.createdAt, identity.createdAt, "journal creation time");
  const network = record(intent.network, "journal network");
  exactJson(network, { chainId: SHADOWNET_CHAIN_ID, name: "shadownet" }, "journal network");
  const actors = record(intent.actors, "journal actors");
  const creator = record(actors.creator, "journal creator");
  exact(creator.signerAddress, identity.creatorAddress, "journal creator");
  const counters = record(creator.counters, "journal creator counters");
  exact(record(counters.primary, "creator primary counter").counter, identity.creatorBaseCounter, "creator primary counter");
  exact(record(counters.fallback, "creator fallback counter").counter, identity.creatorBaseCounter, "creator fallback counter");
  const dependencies = record(intent.dependencyAddresses, "journal dependencies");
  exact(dependencies.gnocchi, identity.gnocchiAddress, "journal Gnocchi dependency");
  exact(dependencies.rotini, identity.rotiniAddress, "journal Rotini dependency");
  const artifactHashes = record(intent.artifactHashes, "journal artifact hashes");
  exact(artifactHashes.router, identity.routerArtifactSha256, "journal router artifact hash");

  const eventNames = (await readdir(path.join(root, "events"))).sort();
  exactJson(eventNames, EVENT_NAMES, "10-event prefix filenames");
  const pinNames = (await readdir(path.join(root, "pins"))).sort();
  exactJson(pinNames, PIN_NAMES, "four-pin prefix filenames");

  const events = await Promise.all(EVENT_NAMES.map((name, index) =>
    canonicalJsonFile(path.join(root, "events", name), `event ${index + 1}`)));
  const pins = await Promise.all(PIN_NAMES.map((name) => readFile(path.join(root, "pins", name))));
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index].value;
    exact(event.schema, RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA, `event ${index + 1} schema`);
    exact(event.journalId, identity.journalId, `event ${index + 1} journal`);
    exact(event.intentSha256, identity.intentSha256, `event ${index + 1} intent`);
    exact(event.eventIndex, index + 1, `event ${index + 1} index`);
    exact(event.actor, "creator", `event ${index + 1} actor`);
    exact(event.phase, PHASES[index], `event ${index + 1} phase`);
    if (index === 0) {
      exact(event.previousRecordSha256, identity.intentSha256, "first event hash link");
    } else {
      exact(event.previousRecordSha256, events[index - 1].sha256, `event ${index + 1} hash link`);
    }
  }

  const publicUrls = PIN_NAMES.map((_, index) =>
    ipfsGatewayUrl(input.ipfs.publicGatewayUrl, pinIdentityAt(identity, index + 1).cid));
  for (let index = 0; index < 4; index += 1) {
    assertPinEvent(events[index < 2 ? index : index + 6].value, pins[index], index + 1, pinIdentityAt(identity, index + 1), publicUrls[index]);
  }

  const originationDescriptor = assertPrepared(events[2].value, 1, identity, identity.origination);
  assertSubmitted(events[3].value, 1, identity.origination, identity.routerAddress);
  const originationEvidence = assertApplied(
    events[4].value,
    1,
    identity.origination,
    identity,
    identity.routerAddress,
    [],
  );
  const operatorDescriptor = assertPrepared(events[5].value, 2, identity, identity.operatorApproval);
  assertSubmitted(events[6].value, 2, identity.operatorApproval, identity.gnocchiAddress);
  const approvalEvidence = assertApplied(
    events[7].value,
    2,
    identity.operatorApproval,
    identity,
    identity.gnocchiAddress,
    ["update_operators"],
  );
  if (originationDescriptor.kind !== "originate") fail("recovered router descriptor is not an origination");
  assertOperatorApprovalDescriptor(operatorDescriptor, identity);
  validateStaleSemantics(pins[2], pins[3]);

  const wrapperProof = pinProof(identity.wrapperPin, input.ipfs);
  const collectionProof = pinProof(identity.collectionPin, input.ipfs);
  let collectionValue: unknown;
  try {
    collectionValue = JSON.parse(Buffer.from(pins[1]).toString("utf8"));
  } catch {
    fail("active collection pin is not JSON");
  }
  if (!Buffer.from(deterministicJsonBytes(collectionValue)).equals(Buffer.from(pins[1]))) {
    fail("active collection JSON bytes drift");
  }

  const wrapperRecord: RavioliMode0ReplayPinRecord = Object.freeze({
    kind: "wrapper",
    pinSequence: 1,
    eventPath: `events/${EVENT_NAMES[0]}`,
    artifactPath: "pins/000001.bin",
    bytes: Uint8Array.from(pins[0]),
    proof: wrapperProof,
  });
  const collectionRecord: RavioliMode0ReplayPinRecord = Object.freeze({
    kind: "collection",
    pinSequence: 2,
    eventPath: `events/${EVENT_NAMES[1]}`,
    artifactPath: "pins/000002.bin",
    bytes: Uint8Array.from(pins[1]),
    value: collectionValue,
    proof: collectionProof,
  });
  const staleManifest = staleDiagnostic(3, events[8].value, identity.staleManifestPin);
  const staleToken = staleDiagnostic(4, events[9].value, identity.staleTokenPin);
  const originateReceipt = writeReceipt(
    1,
    "originate",
    identity,
    identity.origination,
    originationEvidence,
    identity.routerAddress,
    [],
  );
  const approvalReceipt = writeReceipt(
    2,
    "call",
    identity,
    identity.operatorApproval,
    approvalEvidence,
    identity.gnocchiAddress,
    ["update_operators"],
  );

  return Object.freeze({
    journalRoot: root,
    journalPrefixComplete: true,
    routerAddress: identity.routerAddress,
    operatorApprovalLevel: identity.operatorApproval.level,
    originationDescriptor,
    operatorApprovalDescriptor: operatorDescriptor,
    activePins: Object.freeze([wrapperRecord, collectionRecord]) as readonly [
      RavioliMode0ReplayPinRecord,
      RavioliMode0ReplayPinRecord,
    ],
    pinProofs: Object.freeze([wrapperProof, collectionProof]) as readonly [
      PastaUiLivePinProof,
      PastaUiLivePinProof,
    ],
    writeReceipts: Object.freeze([originateReceipt, approvalReceipt]) as readonly [
      PastaUiLivePublicReceipt,
      PastaUiLivePublicReceipt,
    ],
    stalePins: Object.freeze([staleManifest, staleToken]) as readonly [
      RavioliMode0StalePinDiagnostic,
      RavioliMode0StalePinDiagnostic,
    ],
    identity,
  });
}

type ReplayStep = Readonly<{
  action: "pin_blob" | "pin_json" | "originate" | "call";
  fingerprint: string;
  respond(): unknown;
}>;

function decodedRecord(value: unknown, label: string): JsonRecord {
  return record(decodePastaUiLiveValue(value), label);
}

function canonicalBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
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
  const decoded = decodePastaUiLiveValue(payload.value);
  const bytes = deterministicJsonBytes(decoded);
  return `pin_json:${String(payload.fileName)}:${sha256(bytes)}:${bytes.byteLength}`;
}

function originateDescriptor(request: PastaUiLiveBridgeRequest): Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }> {
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

function callDescriptor(request: PastaUiLiveBridgeRequest): Extract<PastaUiLiveOperationDescriptor, { kind: "call" }> {
  const payload = record(request.payload, "call payload");
  exactKeys(payload, ["call", "sendOptions"], "call payload");
  const call = decodedRecord(payload.call, "decoded call");
  exactKeys(call, ["contractAddress", "entrypoint", "payload"], "decoded call");
  return {
    kind: "call",
    call: {
      contractAddress: String(call.contractAddress),
      entrypoint: String(call.entrypoint),
      payload: call.payload,
    },
    sendOptions: decodePastaUiLiveValue(payload.sendOptions),
  };
}

function callFingerprint(request: PastaUiLiveBridgeRequest): string {
  return `call:${ravioliUiLiveDescriptorSha256(callDescriptor(request))}`;
}

function requestFingerprint(request: PastaUiLiveBridgeRequest): string | null {
  try {
    if (request.action === "pin_blob") return pinBlobFingerprint(request);
    if (request.action === "pin_json") return pinJsonFingerprint(request);
    if (request.action === "originate") return originateFingerprint(request);
    if (request.action === "call") return callFingerprint(request);
    return null;
  } catch {
    return null;
  }
}

function appliedWriteFingerprint(request: PastaUiLiveBridgeRequest): string | null {
  try {
    const payload = record(request.payload, `${request.action} payload`);
    if (request.action === "originate") {
      return `originate:${ravioliUiLiveDescriptorSha256({
        kind: "originate",
        code: decodePastaUiLiveValue(payload.code),
        storage: decodePastaUiLiveValue(payload.storage),
      })}`;
    }
    if (request.action === "call") {
      const call = decodedRecord(payload.call, "decoded call");
      return `call:${ravioliUiLiveDescriptorSha256({
        kind: "call",
        call: {
          contractAddress: String(call.contractAddress),
          entrypoint: String(call.entrypoint),
          payload: call.payload,
        },
        sendOptions: decodePastaUiLiveValue(payload.sendOptions ?? {}),
      })}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function createRavioliMode0MutationReplayInterceptor(input: {
  replay: RavioliMode0MutationReplay;
  delegate: PastaUiLiveBridgeHandler;
}): RavioliMode0MutationReplayInterceptor {
  const { replay, delegate } = input;
  const wrapper = replay.activePins[0];
  const collection = replay.activePins[1];
  const steps: readonly ReplayStep[] = Object.freeze([
    Object.freeze({
      action: "pin_blob",
      fingerprint:
        `pin_blob:${wrapper.proof.fileName}:${wrapper.proof.mimeType}:${wrapper.proof.sha256}:${wrapper.proof.byteLength}`,
      respond: () => ({ pin: wrapper.proof }),
    }),
    Object.freeze({
      action: "pin_json",
      fingerprint:
        `pin_json:${collection.proof.fileName}:${collection.proof.sha256}:${collection.proof.byteLength}`,
      respond: () => ({ pin: collection.proof }),
    }),
    Object.freeze({
      action: "originate",
      fingerprint: `originate:${replay.identity.origination.descriptorSha256}`,
      respond: () => ({
        contractAddress: replay.routerAddress,
        operationHash: replay.identity.origination.operationHash,
        confirmationLevel: 1,
      }),
    }),
    Object.freeze({
      action: "call",
      fingerprint: `call:${replay.identity.operatorApproval.descriptorSha256}`,
      respond: () => ({
        operationHash: replay.identity.operatorApproval.operationHash,
        confirmationLevel: 1,
      }),
    }),
  ]);
  // Later mode publishes intentionally pin the same wrapper/collection assets.
  // Only replaying already-applied signer operations would double-mutate chain.
  const appliedWriteFingerprints = new Set(steps.slice(2).map((step) => step.fingerprint));
  let completed = 0;

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
      if (request.action === "call") {
        const descriptor = callDescriptor(request);
        assertOperatorApprovalDescriptor(descriptor, replay.identity);
      }
      if (request.action === "originate") {
        const descriptor = originateDescriptor(request);
        exact(
          ravioliUiLiveDescriptorSha256(descriptor),
          replay.identity.origination.descriptorSha256,
          "router request descriptor hash",
        );
      }
      completed += 1;
      return expected.respond();
    }

    const fingerprint = appliedWriteFingerprint(request);
    if (fingerprint && appliedWriteFingerprints.has(fingerprint)) {
      fail(`refusing duplicate recovery mutation after the four-step prefix completed: ${request.action}`);
    }
    return delegate(request);
  };

  return Object.freeze({
    handle,
    isComplete: () => completed === steps.length,
    getCompletedStepCount: () => completed,
    getRemainingStepCount: () => steps.length - completed,
  });
}
