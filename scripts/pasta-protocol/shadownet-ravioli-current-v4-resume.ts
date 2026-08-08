import {
  createDecipheriv,
  createHash,
} from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
} from "node:fs/promises";
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
  computeRavioliRevealCommitment,
  verifyRavioliMode1PreOp10PrivateProof,
  type RavioliMode1PreOp10Proof,
  type RavioliPinnedJsonMaterial,
} from "./shadownet-ravioli-blind-proof-verifier";
import {
  RAVIOLI_CURRENT_V3_RESTART_IDENTITY,
  type LoadRavioliCurrentV3RestartInput,
  type RavioliCurrentV3OperationIdentity,
} from "./shadownet-ravioli-current-v3-restart";
import {
  RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
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
const IPFS_URI_RE = /^ipfs:\/\/(b[a-z2-7]{20,120})$/;
const MODE = "blind_funded_pool";
const TOKEN_ID = 1;
const MAX_SUPPLY = 3;
const ITEM_COUNT = 1;
const MAX_JSON_BYTES = 2_000_000;

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

const PHASES = Object.freeze([
  "PIN",
  "PIN",
  "PIN",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PIN",
  "PUBLIC_REVEAL_PREPARED",
  "PIN",
  "PIN",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PIN",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "PIN",
  "PIN",
  "PIN",
  "PIN",
  "PIN",
] as const);

const EVENT_NAMES = Object.freeze(PHASES.map((phase, index) =>
  `${String(index + 1).padStart(6, "0")}-${phase.toLowerCase()}-creator.json`));
const PIN_NAMES = Object.freeze(Array.from(
  { length: 12 },
  (_, index) => `${String(index + 1).padStart(6, "0")}.bin`,
));
const PIN_EVENT_INDEXES = Object.freeze([0, 1, 2, 12, 14, 15, 31, 35, 36, 37, 38, 39] as const);
const OPERATION_EVENT_INDEXES = Object.freeze([3, 6, 9, 16, 19, 22, 25, 28, 32] as const);

const CURRENT_V4_SCREENSHOTS = Object.freeze([
  ...RAVIOLI_CURRENT_V3_RESTART_IDENTITY.screenshots,
  Object.freeze({
    stem: "007-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued",
    pngSha256: "af80fa4543fa51780300483346be1cdc0d0d1536e8525aad9f70122fa3af229f",
    sidecarSha256: "26ea486f7aaace76dc37089a85a0ff202c4315485f9cf52614709b8753ed9ba0",
  }),
  Object.freeze({
    stem: "008-compose-five-atomic-pack-modes-blind-funded-pool-reconfigured-after-superseded-private-precommit",
    pngSha256: "afb14fff49784ddfdfa188b3cab0ff3f0e1771bb7b2753a2fa1ecec76f279d16",
    sidecarSha256: "8b052e8f7074f94204df4f5faccce9ca29b0210cfd6d8bbc88448318b1b05b06",
  }),
] as const);

const OPEN_KIT_0_NAME = "ravioli-open-kit-0.json";
const OPEN_KIT_1_NAME = "ravioli-open-kit-1.json";
const OPEN_KIT_PROGRESS_NAME = "open-kit-capture-progress.json";
const OPEN_KIT_0_SHA256 = "6b956fa9b8722b98f367f92bc4cad43f158c00f98c4b20ae11e8971ee78a2ff1";
const OPEN_KIT_1_SHA256 = "e93e4aa455ee76a2350e3006aa1fc99261252dc175b4725d66e0f4698c9287be";
const OPEN_KIT_1_CANONICAL_SHA256 = "bc1451c0d0bc9ac9f0b4b6e2867f8a2b00cc104c16c6b42515e0b598b977bbbe";
const OPEN_KIT_PROGRESS_SHA256 = "8e14107dcaf452d9e378cf4da607ea265b044025076971e1a218482f074fb4f8";
const PRODUCER_ENVELOPE_SHA256 = "564b9dd97f6384b7438223a36e0de7170326c24dd34becf2eabed2f593474e9e";
const PUBLIC_REVEAL_CANONICAL_SHA256 = "2bfda5338c85f7157defeba8491b8d4e45da04cc9fc1c899c8c0999f906b0733";
const REVEAL_COMMITMENT = "eab168521ae5b6073131e124ac8e22d0b08de87a25fd44c0a590b02fc7305474";

export const RAVIOLI_CURRENT_V4_RESUME_FILE_COUNT = 72;
export const RAVIOLI_CURRENT_V4_REPLAY_STEP_COUNT = 16;
export const RAVIOLI_CURRENT_V4_CRYPTO_INVALID_AUDIT_SCHEMA =
  "pastaprotocol-ravioli-current-v4-crypto-invalid-precommit-audit@1";
export const RAVIOLI_CURRENT_V4_OPERATION_TEN_CONTEXT_SCHEMA =
  "pastaprotocol-ravioli-current-v4-operation-ten-context@1";
export const RAVIOLI_CURRENT_V4_INVENTORY_PROOF_SCHEMA =
  "pastaprotocol-ravioli-current-v4-cumulative-inventory-proof@1";

type JsonRecord = Record<string, any>;
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RavioliCurrentV4PinDisposition =
  | "ACTIVE"
  | "SUPERSEDED_PRIVATE_PRECOMMIT"
  | "SUPERSEDED_CRYPTO_INVALID_PRECOMMIT";

export type RavioliCurrentV4PinIdentity = Readonly<{
  kind: string;
  disposition: RavioliCurrentV4PinDisposition;
  supersededReason?: string;
  pinSequence: number;
  cid: string;
  uri: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}>;

const CRYPTO_INVALID_PINS = Object.freeze([
  Object.freeze({
    kind: "mode1-manifest",
    disposition: "SUPERSEDED_CRYPTO_INVALID_PRECOMMIT" as const,
    pinSequence: 10,
    cid: "bafkreifgg26y5ik52vnnm6m3u4hg7a5kuc4phx6kygwepg5kkhrcpms7oa",
    uri: "ipfs://bafkreifgg26y5ik52vnnm6m3u4hg7a5kuc4phx6kygwepg5kkhrcpms7oa",
    fileName: "ravioli-pack-manifest.json",
    mimeType: "application/json",
    byteLength: 1_047,
    sha256: "a636bd8ea15dd55ad6799ba70e6f83aaa0b8f3dfcac1ac479baa51e227b25f70",
  }),
  Object.freeze({
    kind: "mode1-sealed-reveal",
    disposition: "SUPERSEDED_CRYPTO_INVALID_PRECOMMIT" as const,
    pinSequence: 11,
    cid: "bafkreicc6utfwczl4dtin3otfnlzskexpowhz5lfvzhel5vxjxll2jotfm",
    uri: "ipfs://bafkreicc6utfwczl4dtin3otfnlzskexpowhz5lfvzhel5vxjxll2jotfm",
    fileName: "ravioli-sealed-reveal-1.json",
    mimeType: "application/json",
    byteLength: 2_533,
    sha256: "42f5265b0b2be0e686edd32b579928977bac7cf565ae4e45f6b74dd6bd25d32b",
  }),
  Object.freeze({
    kind: "mode1-token-metadata",
    disposition: "SUPERSEDED_CRYPTO_INVALID_PRECOMMIT" as const,
    pinSequence: 12,
    cid: "bafkreif6igmgblki4h745duiokxfjj7lytahklw7r47b5ad2uojcyxlw7m",
    uri: "ipfs://bafkreif6igmgblki4h745duiokxfjj7lytahklw7r47b5ad2uojcyxlw7m",
    fileName: "token.json",
    mimeType: "application/json",
    byteLength: 1_758,
    sha256: "be419860ad48e1ffce8e8872ae54a7ebc4c0752edf8f3e1e807aa3922c5d76fb",
  }),
] satisfies readonly RavioliCurrentV4PinIdentity[]);

const CURRENT_V4_PINS = Object.freeze([
  ...RAVIOLI_CURRENT_V3_RESTART_IDENTITY.pins,
  ...CRYPTO_INVALID_PINS,
] satisfies readonly RavioliCurrentV4PinIdentity[]);

export const RAVIOLI_CURRENT_V4_RESUME_IDENTITY = Object.freeze({
  ...RAVIOLI_CURRENT_V3_RESTART_IDENTITY,
  predecessorEventSha256: RAVIOLI_CURRENT_V3_RESTART_IDENTITY.finalEventSha256,
  finalEventSha256: "b3080c18ee631685a940fc0ecec5d003a5a9ebd7d0684b1acc84786d0e08be5e",
  eventCount: 40,
  pinCount: 12,
  operationCount: 9,
  fileCount: RAVIOLI_CURRENT_V4_RESUME_FILE_COUNT,
  pins: CURRENT_V4_PINS,
  screenshots: CURRENT_V4_SCREENSHOTS,
  openKit0Sha256: OPEN_KIT_0_SHA256,
  openKit1Sha256: OPEN_KIT_1_SHA256,
  openKit1CanonicalSha256: OPEN_KIT_1_CANONICAL_SHA256,
  openKitProgressSha256: OPEN_KIT_PROGRESS_SHA256,
  producerEnvelopeSha256: PRODUCER_ENVELOPE_SHA256,
  pinnedEnvelopeSha256: CRYPTO_INVALID_PINS[1].sha256,
  publicRevealCanonicalSha256: PUBLIC_REVEAL_CANONICAL_SHA256,
  revealCommitment: REVEAL_COMMITMENT,
});

export const RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY = Object.freeze({
  owner: RAVIOLI_CURRENT_V4_RESUME_IDENTITY.creatorAddress,
  router: RAVIOLI_CURRENT_V4_RESUME_IDENTITY.routerAddress,
  fa2: RAVIOLI_CURRENT_V4_RESUME_IDENTITY.gnocchiAddress,
  creatorBalances: Object.freeze([
    Object.freeze({ tokenId: 0, amount: 1 }),
    Object.freeze({ tokenId: 1, amount: 2 }),
  ]),
  routerEscrowBalances: Object.freeze([
    Object.freeze({ tokenId: 0, amount: 1 }),
    Object.freeze({ tokenId: 1, amount: 0 }),
  ]),
  existingCommittedRequirements: Object.freeze([
    Object.freeze({ tokenId: 0, amount: 1 }),
    Object.freeze({ tokenId: 1, amount: 0 }),
  ]),
});

export type RavioliCurrentV4Mode1Deadlines = Readonly<{
  wrapperSaleEnd: string;
  revealDeadline: string;
  openDeadline: string;
}>;

export type RavioliCurrentV4CumulativeInventoryInput = Readonly<{
  owner: string;
  router: string;
  fa2: string;
  creatorBalances: readonly Readonly<{ tokenId: number; amount: number }>[];
  routerEscrowBalances: readonly Readonly<{ tokenId: number; amount: number }>[];
  existingCommittedRequirements: readonly Readonly<{ tokenId: number; amount: number }>[];
}>;

export type RavioliCurrentV4CumulativeInventoryProof = Readonly<{
  schema: typeof RAVIOLI_CURRENT_V4_INVENTORY_PROOF_SCHEMA;
  owner: string;
  router: string;
  fa2: string;
  existingRequirements: readonly Readonly<{ tokenId: number; amount: number }>[];
  freshRequirements: readonly Readonly<{ tokenId: number; amount: number }>[];
  cumulativeRequirements: readonly Readonly<{ tokenId: number; amount: number }>[];
  controlledInventory: readonly Readonly<{ tokenId: number; amount: number }>[];
  sufficient: true;
}>;

export type RavioliCurrentV4CryptoInvalidAudit = Readonly<{
  schema: typeof RAVIOLI_CURRENT_V4_CRYPTO_INVALID_AUDIT_SCHEMA;
  disposition: "SUPERSEDED_CRYPTO_INVALID_PRECOMMIT";
  canonicalAadDecryptable: false;
  network: "shadownet";
  contract: string;
  tokenId: 1;
  mode: typeof MODE;
  maxSupply: 3;
  itemCount: 1;
  nonceCount: 3;
  manifestUri: string;
  envelopeUri: string;
  tokenMetadataUri: string;
  openKitFileSha256: string;
  openKitCanonicalSha256: string;
  manifestSha256: string;
  pinnedEnvelopeSha256: string;
  producerEnvelopeSha256: string;
  tokenMetadataSha256: string;
  publicRevealCanonicalSha256: string;
  revealCommitment: string;
  deadlines: RavioliCurrentV4Mode1Deadlines;
  tokenName: string;
  tokenSymbol: string;
}>;

export type RavioliCurrentV4CryptoInvalidAuditInput = Readonly<{
  expected: Readonly<{
    network: "shadownet";
    contract: string;
    tokenId: 1;
    creatorAddress: string;
    escrowContract: string;
    wrapperUri: string;
  }>;
  openKit: Readonly<{
    value: unknown;
    bytes: Uint8Array;
  }>;
  manifest: RavioliPinnedJsonMaterial;
  envelope: RavioliPinnedJsonMaterial;
  tokenMetadata: RavioliPinnedJsonMaterial;
}>;

export type RavioliCurrentV4FreshPrivatePrecommit = Readonly<{
  openKit: unknown;
  inventory: RavioliCurrentV4CumulativeInventoryInput;
}>;

export type RavioliCurrentV4FreshPinnedContext = Readonly<{
  manifest: RavioliPinnedJsonMaterial;
  envelope: RavioliPinnedJsonMaterial;
  tokenMetadata: RavioliPinnedJsonMaterial;
  operationTen: Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>;
}>;

export type RavioliCurrentV4PinRecord = Readonly<{
  identity: RavioliCurrentV4PinIdentity;
  eventPath: string;
  artifactPath: string;
  bytes: Uint8Array;
  value?: unknown;
  proof: PastaUiLivePinProof;
}>;

export type RavioliCurrentV4OperationRecord = Readonly<{
  identity: RavioliCurrentV3OperationIdentity;
  descriptor: PastaUiLiveOperationDescriptor;
  receipt: PastaUiLivePublicReceipt;
}>;

export type RavioliCurrentV4Resume = Readonly<{
  appRoot: string;
  journalRoot: string;
  journalPrefixComplete: true;
  fileCount: typeof RAVIOLI_CURRENT_V4_RESUME_FILE_COUNT;
  controllerAddress: string;
  routerAddress: string;
  journalPins: readonly RavioliCurrentV4PinRecord[];
  activePins: readonly RavioliCurrentV4PinRecord[];
  supersededPrecommitPins: readonly RavioliCurrentV4PinRecord[];
  cryptoInvalidPrecommitPins: readonly RavioliCurrentV4PinRecord[];
  replayPins: readonly RavioliCurrentV4PinRecord[];
  operations: readonly RavioliCurrentV4OperationRecord[];
  writeReceipts: readonly PastaUiLivePublicReceipt[];
  cryptoInvalidAudit: RavioliCurrentV4CryptoInvalidAudit;
  cryptoInvalidDeadlines: RavioliCurrentV4Mode1Deadlines;
  identity: typeof RAVIOLI_CURRENT_V4_RESUME_IDENTITY;
}>;

export type LoadRavioliCurrentV4ResumeInput = {
  journal: RavioliUiLiveJournal;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  expected: LoadRavioliCurrentV3RestartInput["expected"];
};

export type RavioliCurrentV4OperationTenContext = Readonly<{
  schema: typeof RAVIOLI_CURRENT_V4_OPERATION_TEN_CONTEXT_SCHEMA;
  privateProof: RavioliMode1PreOp10Proof;
  inventoryProof: RavioliCurrentV4CumulativeInventoryProof;
  operationTen: Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>;
  operationTenDescriptorSha256: string;
}>;

export type RavioliCurrentV4ResumeInterceptor = Readonly<{
  handle: PastaUiLiveBridgeHandler;
  primeAuthenticatedMode0Prefix(): void;
  isReplayComplete(): boolean;
  getCompletedReplayStepCount(): number;
  getRemainingReplayStepCount(): number;
  continuationStage():
    | "replay-prefix"
    | "fresh-mode1-manifest"
    | "fresh-mode1-envelope"
    | "fresh-mode1-token"
    | "fresh-operation-10"
    | "operation-10-delegating"
    | "continued";
  operationTenContext(): RavioliCurrentV4OperationTenContext | null;
}>;

function fail(message: string): never {
  throw new Error(`Ravioli current-v4 resume: ${message}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function rawCidV1Sha256(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const multihash = Uint8Array.from([
    0x01,
    0x55,
    0x12,
    0x20,
    ...Buffer.from(sha256(bytes), "hex"),
  ]);
  let buffer = 0;
  let bits = 0;
  let encoded = "";
  for (const byte of multihash) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += alphabet[(buffer << (5 - bits)) & 31];
  return `b${encoded}`;
}

function exact(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) fail(`${label} drift`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must be a plain object`);
  }
  return value as JsonRecord;
}

function canonicalBytes(value: unknown): Uint8Array {
  return deterministicJsonBytes(value);
}

function canonicalEqual(actual: unknown, expected: unknown, label: string): void {
  if (!Buffer.from(canonicalBytes(actual)).equals(Buffer.from(canonicalBytes(expected)))) {
    fail(`${label} drift`);
  }
}

function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void {
  canonicalEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields`);
}

function requiredNat(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function requiredHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_RE.test(value)) {
    fail(`${label} must be 32-byte lowercase hex`);
  }
  return value;
}

function requiredIpfsUri(value: unknown, label: string): string {
  if (typeof value !== "string" || !IPFS_URI_RE.test(value)) {
    fail(`${label} must be a CIDv1 IPFS URI`);
  }
  return value;
}

function requiredKt1(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || validateContractAddress(value) !== ValidationResult.VALID
  ) {
    fail(`${label} must be a valid KT1 address`);
  }
  return value;
}

function requiredTz1(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || validateAddress(value) !== ValidationResult.VALID
  ) {
    fail(`${label} must be a valid implicit address`);
  }
  return value;
}

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_JSON_BYTES) {
    fail(`${label} byte length is invalid`);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} is not UTF-8`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(`${label} is not JSON`);
  }
  return value;
}

function canonicalJsonBytesFromRaw(bytes: Uint8Array, label: string): {
  value: JsonRecord;
  canonical: Uint8Array;
} {
  const value = record(parseJsonBytes(bytes, label), label);
  const canonical = canonicalBytes(value);
  if (!Buffer.from(bytes).equals(Buffer.from(canonical))) {
    fail(`${label} bytes are not canonical`);
  }
  return { value, canonical };
}

function canonicalBase64(value: unknown, label: string): Uint8Array {
  if (
    typeof value !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    fail(`${label} is not canonical base64`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) fail(`${label} is not canonical base64`);
  return bytes;
}

async function assertRegularFile(filePath: string, label: string): Promise<void> {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) {
    fail(`${label} must be a regular non-symlink file`);
  }
}

async function assertRealDirectory(directoryPath: string, label: string): Promise<void> {
  const info = await lstat(directoryPath);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail(`${label} must be a real non-symlink directory`);
  }
}

async function assertDirectoryInventory(
  directoryPath: string,
  expectedNames: readonly string[],
  label: string,
): Promise<void> {
  await assertRealDirectory(directoryPath, label);
  canonicalEqual(
    (await readdir(directoryPath)).sort(),
    [...expectedNames].sort(),
    `${label} inventory`,
  );
}

async function assertFileSha256(
  filePath: string,
  expectedSha256: string,
  label: string,
): Promise<Uint8Array> {
  await assertRegularFile(filePath, label);
  const bytes = await readFile(filePath);
  exact(sha256(bytes), expectedSha256, `${label} hash`);
  return bytes;
}

async function walkNoSymlinks(rootPath: string, relative = ""): Promise<string[]> {
  const target = relative ? path.join(rootPath, relative) : rootPath;
  const info = await lstat(target);
  if (info.isSymbolicLink()) fail(`lane contains a symlink at ${relative || "."}`);
  if (info.isFile()) return [relative];
  if (!info.isDirectory()) fail(`lane contains a non-file entry at ${relative || "."}`);
  const files: string[] = [];
  for (const name of (await readdir(target)).sort()) {
    files.push(...await walkNoSymlinks(rootPath, relative ? path.join(relative, name) : name));
  }
  return files;
}

async function canonicalJsonFile(
  filePath: string,
  label: string,
): Promise<{ value: JsonRecord; bytes: Uint8Array; sha256: string }> {
  await assertRegularFile(filePath, label);
  const bytes = await readFile(filePath);
  const parsed = canonicalJsonBytesFromRaw(bytes, label);
  return { value: parsed.value, bytes, sha256: sha256(bytes) };
}

function pinMaterial(
  pin: RavioliCurrentV4PinRecord,
): RavioliPinnedJsonMaterial {
  if (pin.value === undefined) fail(`pin ${pin.identity.pinSequence} is not JSON`);
  return {
    value: pin.value,
    bytes: pin.bytes,
    proof: {
      cid: pin.proof.cid,
      uri: pin.proof.uri,
      fileName: pin.proof.fileName,
      mimeType: pin.proof.mimeType,
      byteLength: pin.proof.byteLength,
      sha256: pin.proof.sha256,
      publicGatewayVerified: true,
    },
  };
}

function parsePinnedMaterial(
  material: RavioliPinnedJsonMaterial,
  expectedFileName: string,
): {
  value: JsonRecord;
  bytes: Uint8Array;
  uri: string;
  sha256: string;
} {
  const proof = record(material.proof, `${expectedFileName} proof`);
  exact(proof.fileName, expectedFileName, `${expectedFileName} proof file`);
  exact(proof.mimeType, "application/json", `${expectedFileName} proof MIME`);
  exact(proof.publicGatewayVerified, true, `${expectedFileName} public verification`);
  exact(proof.byteLength, material.bytes.byteLength, `${expectedFileName} proof length`);
  exact(proof.sha256, sha256(material.bytes), `${expectedFileName} proof hash`);
  const uri = requiredIpfsUri(proof.uri, `${expectedFileName} proof URI`);
  exact(uri, `ipfs://${String(proof.cid)}`, `${expectedFileName} proof CID/URI`);
  const parsed = canonicalJsonBytesFromRaw(material.bytes, expectedFileName);
  canonicalEqual(material.value, parsed.value, `${expectedFileName} value`);
  return {
    value: parsed.value,
    bytes: Uint8Array.from(material.bytes),
    uri,
    sha256: String(proof.sha256),
  };
}

function validateOpenKit(
  input: RavioliCurrentV4CryptoInvalidAuditInput,
): {
  kit: JsonRecord;
  publicKit: JsonRecord;
  sealedReveal: JsonRecord;
  deadlines: RavioliCurrentV4Mode1Deadlines;
  fileSha256: string;
  canonicalSha256: string;
} {
  const parsedValue = record(parseJsonBytes(input.openKit.bytes, "mode-1 open kit"), "mode-1 open kit");
  canonicalEqual(input.openKit.value, parsedValue, "mode-1 open-kit value");
  const kit = parsedValue;
  exactKeys(kit, [
    "schema",
    "network",
    "contract",
    "tokenId",
    "mode",
    "manifestUri",
    "blindSecurity",
    "warning",
    "editionPolicy",
    "recipes",
    "sealedReveal",
  ], "mode-1 open kit");
  exact(kit.schema, "pasta-ravioli-open-kit@3", "open-kit schema");
  exact(kit.network, input.expected.network, "open-kit network");
  exact(kit.contract, input.expected.contract, "open-kit contract");
  exact(kit.tokenId, input.expected.tokenId, "open-kit token");
  exact(kit.mode, MODE, "open-kit mode");
  requiredIpfsUri(kit.manifestUri, "open-kit manifest URI");
  exact(kit.blindSecurity, "commit-reveal-ui-hidden-chain-public", "open-kit disclosure");
  if (typeof kit.warning !== "string" || !kit.warning.trim() || kit.warning.length > 512) {
    fail("open-kit warning is invalid");
  }

  const edition = record(kit.editionPolicy, "open-kit edition policy");
  exactKeys(edition, [
    "requiresLimitedWrapper",
    "wrapperEditionClass",
    "earliestChildEnd",
    "wrapperSaleStart",
    "wrapperSaleEnd",
    "revealDeadline",
    "openDeadline",
  ], "open-kit edition policy");
  exact(edition.requiresLimitedWrapper, false, "open-kit LE child requirement");
  exact(edition.wrapperEditionClass, "limited-edition", "open-kit wrapper class");
  exact(edition.earliestChildEnd, null, "open-kit earliest child end");
  exact(edition.wrapperSaleStart, null, "open-kit sale start");
  const deadlines = Object.freeze({
    wrapperSaleEnd: String(edition.wrapperSaleEnd),
    revealDeadline: String(edition.revealDeadline),
    openDeadline: String(edition.openDeadline),
  });
  const parsedDeadlines = [
    Date.parse(deadlines.wrapperSaleEnd),
    Date.parse(deadlines.revealDeadline),
    Date.parse(deadlines.openDeadline),
  ];
  if (!parsedDeadlines.every(Number.isFinite)) fail("open-kit deadlines are invalid");
  if (!(parsedDeadlines[0] < parsedDeadlines[1] && parsedDeadlines[1] < parsedDeadlines[2])) {
    fail("open-kit deadline order is invalid");
  }

  if (!Array.isArray(kit.recipes) || kit.recipes.length !== MAX_SUPPLY) {
    fail("open-kit recipe count drift");
  }
  const nonces: string[] = [];
  const expectedTokenIds = [0, 1, 0];
  for (let index = 0; index < kit.recipes.length; index += 1) {
    const recipe = record(kit.recipes[index], `open-kit recipe ${index}`);
    exactKeys(recipe, ["serial", "nonce", "actions"], `open-kit recipe ${index}`);
    exact(recipe.serial, index, `open-kit recipe ${index} serial`);
    const nonce = requiredHash(recipe.nonce, `open-kit recipe ${index} nonce`);
    if (nonces.includes(nonce)) fail(`open-kit recipe ${index} reuses a nonce`);
    nonces.push(nonce);
    if (!Array.isArray(recipe.actions) || recipe.actions.length !== ITEM_COUNT) {
      fail(`open-kit recipe ${index} action count drift`);
    }
    const action = record(recipe.actions[0], `open-kit recipe ${index} action`);
    exactKeys(action, ["kind", "fa2", "tokenId", "amount"], `open-kit recipe ${index} action`);
    exact(action.kind, "escrow", `open-kit recipe ${index} action kind`);
    exact(action.fa2, input.expected.escrowContract, `open-kit recipe ${index} escrow contract`);
    exact(action.tokenId, expectedTokenIds[index], `open-kit recipe ${index} escrow token`);
    exact(action.amount, 1, `open-kit recipe ${index} escrow amount`);
  }

  const sealedReveal = record(kit.sealedReveal, "open-kit sealed reveal");
  exactKeys(
    sealedReveal,
    ["schema", "contentsUri", "salt", "offset", "envelopeSha256"],
    "open-kit sealed reveal",
  );
  exact(
    sealedReveal.schema,
    "pasta-ravioli-sealed-reveal-reference@1",
    "open-kit sealed reveal schema",
  );
  requiredIpfsUri(sealedReveal.contentsUri, "open-kit sealed reveal URI");
  requiredHash(sealedReveal.salt, "open-kit reveal salt");
  const offset = requiredNat(sealedReveal.offset, "open-kit reveal offset");
  if (offset >= MAX_SUPPLY) fail("open-kit reveal offset is outside supply");
  requiredHash(sealedReveal.envelopeSha256, "open-kit producer envelope hash");

  const { sealedReveal: _sealedReveal, ...publicKit } = kit;
  const fileSha256 = sha256(input.openKit.bytes);
  const canonicalSha256 = sha256(canonicalBytes(kit));
  return {
    kit,
    publicKit,
    sealedReveal,
    deadlines,
    fileSha256,
    canonicalSha256,
  };
}

function validateManifest(
  manifest: JsonRecord,
  deadlines: RavioliCurrentV4Mode1Deadlines,
): void {
  exactKeys(manifest, [
    "assignmentPolicy",
    "blindSecurity",
    "description",
    "editionPolicy",
    "fulfillment",
    "funding",
    "generativeAuthenticity",
    "itemCount",
    "maxSupply",
    "members",
    "mode",
    "mystery",
    "name",
    "schemaVersion",
  ], "mode-1 manifest");
  exact(manifest.schemaVersion, "wtfos.pasta.pack-manifest.v2", "manifest schema");
  exact(manifest.mode, MODE, "manifest mode");
  exact(manifest.maxSupply, MAX_SUPPLY, "manifest supply");
  exact(manifest.itemCount, ITEM_COUNT, "manifest item count");
  exact(manifest.mystery, true, "manifest mystery policy");
  canonicalEqual(manifest.members, [], "manifest public members");
  exact(
    manifest.assignmentPolicy,
    "precommitted-salted-cyclic-rotation",
    "manifest assignment policy",
  );
  exact(
    manifest.blindSecurity,
    "commit-reveal-ui-hidden-chain-public",
    "manifest blind security",
  );
  exact(manifest.funding, "fully-reserved-before-wrapper-issuance", "manifest funding");
  exact(
    manifest.fulfillment,
    "atomic-router-controller-and-typed-adapters",
    "manifest fulfillment",
  );
  exact(manifest.generativeAuthenticity, null, "manifest generative policy");
  if (typeof manifest.name !== "string" || !manifest.name) fail("manifest name is invalid");

  const edition = record(manifest.editionPolicy, "manifest edition policy");
  exactKeys(edition, [
    "afterOpenDeadline",
    "childPolicySummary",
    "earliestChildEnd",
    "openDeadline",
    "requiresLimitedWrapper",
    "reservedChildPolicy",
    "revealDeadline",
    "transferExpiry",
    "wrapperEditionClass",
    "wrapperSaleEnd",
    "wrapperSaleStart",
  ], "manifest edition policy");
  exact(edition.requiresLimitedWrapper, false, "manifest LE child requirement");
  exact(edition.wrapperEditionClass, "limited-edition", "manifest wrapper class");
  exact(edition.earliestChildEnd, null, "manifest earliest child end");
  exact(edition.wrapperSaleStart, null, "manifest sale start");
  exact(edition.wrapperSaleEnd, deadlines.wrapperSaleEnd, "manifest sale end");
  exact(edition.revealDeadline, deadlines.revealDeadline, "manifest reveal deadline");
  exact(edition.openDeadline, deadlines.openDeadline, "manifest open deadline");
  exact(edition.reservedChildPolicy, null, "manifest reserved child policy");
  canonicalEqual(edition.childPolicySummary, {
    referencedResources: 0,
    limitedEditionResources: 0,
    requiredCapacity: 0,
  }, "manifest child policy summary");
}

function studioAad(
  envelopeAad: JsonRecord,
  expected: RavioliCurrentV4CryptoInvalidAuditInput["expected"],
  manifestUri: string,
): JsonRecord {
  exactKeys(
    envelopeAad,
    ["schema", "network", "contract", "tokenId", "manifestUri"],
    "sealed envelope AAD",
  );
  exact(envelopeAad.schema, "pasta-ravioli-sealed-reveal@1", "sealed envelope AAD schema");
  exact(envelopeAad.network, expected.network, "sealed envelope AAD network");
  exact(envelopeAad.contract, expected.contract, "sealed envelope AAD contract");
  exact(envelopeAad.tokenId, expected.tokenId, "sealed envelope AAD token");
  exact(envelopeAad.manifestUri, manifestUri, "sealed envelope AAD manifest");
  // Field order is cryptographic input here. This reconstructs the producer's
  // sealedRevealAad() order before the bridge canonicalized the pinned JSON.
  return {
    schema: envelopeAad.schema,
    network: envelopeAad.network,
    contract: envelopeAad.contract,
    tokenId: envelopeAad.tokenId,
    manifestUri: envelopeAad.manifestUri,
  };
}

function decryptEnvelope(
  envelope: JsonRecord,
  sealedReveal: JsonRecord,
  expected: RavioliCurrentV4CryptoInvalidAuditInput["expected"],
  manifestUri: string,
  pinnedEnvelopeSha256: string,
  expectedPublicReveal: JsonRecord,
): {
  producerEnvelopeSha256: string;
  publicRevealCanonicalSha256: string;
} {
  exactKeys(
    envelope,
    ["schema", "cipher", "keyDerivation", "iv", "aad", "ciphertext"],
    "sealed envelope",
  );
  exact(envelope.schema, "pasta-ravioli-sealed-reveal@1", "sealed envelope schema");
  exact(envelope.cipher, "AES-256-GCM", "sealed envelope cipher");
  exact(
    envelope.keyDerivation,
    "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    "sealed envelope KDF",
  );
  const aad = studioAad(record(envelope.aad, "sealed envelope AAD"), expected, manifestUri);
  const iv = canonicalBase64(envelope.iv, "sealed envelope IV");
  exact(iv.byteLength, 12, "sealed envelope IV length");
  const ciphertextAndTag = canonicalBase64(envelope.ciphertext, "sealed envelope ciphertext");
  if (ciphertextAndTag.byteLength <= 16) fail("sealed envelope ciphertext is too short");

  const producerEnvelope = {
    schema: envelope.schema,
    cipher: envelope.cipher,
    keyDerivation: envelope.keyDerivation,
    iv: envelope.iv,
    aad,
    ciphertext: envelope.ciphertext,
  };
  const producerEnvelopeSha256 = sha256(Buffer.from(JSON.stringify(producerEnvelope), "utf8"));
  exact(
    producerEnvelopeSha256,
    sealedReveal.envelopeSha256,
    "open-kit producer envelope hash",
  );
  if (producerEnvelopeSha256 === pinnedEnvelopeSha256) {
    fail("producer and canonical pinned envelope hashes must remain distinct byte contracts");
  }

  const salt = Buffer.from(requiredHash(sealedReveal.salt, "open-kit reveal salt"), "hex");
  const key = createHash("sha256")
    .update(Buffer.concat([
      Buffer.from("pasta-ravioli-sealed-reveal@1\0", "utf8"),
      salt,
    ]))
    .digest();
  const ciphertext = ciphertextAndTag.subarray(0, -16);
  const tag = ciphertextAndTag.subarray(-16);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(JSON.stringify(aad), "utf8"));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail("sealed envelope authentication or decryption failed");
  }
  let canonicalAadUnexpectedlyDecrypted = false;
  try {
    const canonicalDecipher = createDecipheriv("aes-256-gcm", key, iv);
    canonicalDecipher.setAAD(
      Buffer.from(JSON.stringify(record(envelope.aad, "canonical pinned envelope AAD")), "utf8"),
    );
    canonicalDecipher.setAuthTag(tag);
    Buffer.concat([
      canonicalDecipher.update(ciphertext),
      canonicalDecipher.final(),
    ]);
    canonicalAadUnexpectedlyDecrypted = true;
  } catch {
    // This is the authenticated defect at boundary 40: shipped code consumes
    // the canonical pinned AAD order, while the ciphertext used producer order.
  }
  if (canonicalAadUnexpectedlyDecrypted) {
    fail("crypto-invalid boundary unexpectedly decrypts with canonical pinned AAD");
  }
  const revealed = record(parseJsonBytes(plaintext, "decrypted public reveal"), "decrypted public reveal");
  canonicalEqual(revealed, expectedPublicReveal, "decrypted public reveal");
  return {
    producerEnvelopeSha256,
    publicRevealCanonicalSha256: sha256(canonicalBytes(revealed)),
  };
}

function validateTokenMetadata(
  token: JsonRecord,
  expected: RavioliCurrentV4CryptoInvalidAuditInput["expected"],
  manifestUri: string,
  envelopeUri: string,
  deadlines: RavioliCurrentV4Mode1Deadlines,
): { revealCommitment: string; name: string; symbol: string } {
  exactKeys(token, [
    "artifactUri",
    "creators",
    "decimals",
    "description",
    "displayUri",
    "formats",
    "isBooleanAmount",
    "minter",
    "name",
    "ravioli",
    "symbol",
    "tags",
    "thumbnailUri",
  ], "mode-1 token metadata");
  exact(token.artifactUri, expected.wrapperUri, "token artifact URI");
  exact(token.displayUri, expected.wrapperUri, "token display URI");
  exact(token.thumbnailUri, expected.wrapperUri, "token thumbnail URI");
  exact(token.minter, expected.creatorAddress, "token minter");
  canonicalEqual(token.creators, [expected.creatorAddress], "token creators");
  exact(token.decimals, 0, "token decimals");
  exact(token.isBooleanAmount, false, "token amount policy");
  if (typeof token.name !== "string" || !token.name) fail("token name is invalid");
  if (typeof token.symbol !== "string" || !token.symbol) fail("token symbol is invalid");
  canonicalEqual(token.formats, [{ uri: expected.wrapperUri, mimeType: "image/png" }], "token formats");

  const ravioli = record(token.ravioli, "token Ravioli policy");
  exactKeys(ravioli, [
    "assignmentPolicy",
    "blindSecurity",
    "editionPolicy",
    "fulfillment",
    "generativeOutputAuthority",
    "itemCount",
    "manifestUri",
    "maxSupply",
    "mode",
    "postDeadlineAction",
    "revealCommitment",
    "sealedContentsUri",
    "transferExpiry",
    "version",
    "wrapperEditionClass",
  ], "token Ravioli policy");
  exact(ravioli.version, 3, "token Ravioli version");
  exact(ravioli.mode, MODE, "token mode");
  exact(ravioli.itemCount, ITEM_COUNT, "token item count");
  exact(ravioli.maxSupply, MAX_SUPPLY, "token supply");
  exact(ravioli.manifestUri, manifestUri, "token manifest URI");
  exact(ravioli.sealedContentsUri, envelopeUri, "token envelope URI");
  exact(
    ravioli.assignmentPolicy,
    "precommitted-salted-cyclic-rotation",
    "token assignment policy",
  );
  exact(
    ravioli.blindSecurity,
    "authenticated-ciphertext-until-reveal",
    "token disclosure policy",
  );
  exact(ravioli.fulfillment, "atomic-router-controller", "token fulfillment");
  exact(ravioli.generativeOutputAuthority, null, "token generative authority");
  exact(ravioli.wrapperEditionClass, "limited-edition", "token wrapper class");
  const edition = record(ravioli.editionPolicy, "token edition policy");
  exact(edition.wrapperSaleEnd, deadlines.wrapperSaleEnd, "token sale end");
  exact(edition.revealDeadline, deadlines.revealDeadline, "token reveal deadline");
  exact(edition.openDeadline, deadlines.openDeadline, "token open deadline");
  exact(edition.requiresLimitedWrapper, false, "token LE child requirement");
  exact(edition.earliestChildEnd, null, "token earliest child end");
  const revealCommitment = requiredHash(
    ravioli.revealCommitment,
    "token reveal commitment",
  );
  return {
    revealCommitment,
    name: token.name,
    symbol: token.symbol,
  };
}

function verifyCryptoInvalidAuditInternal(
  input: RavioliCurrentV4CryptoInvalidAuditInput,
): {
  proof: RavioliCurrentV4CryptoInvalidAudit;
} {
  exact(input.expected.network, "shadownet", "expected network");
  requiredKt1(input.expected.contract, "expected router");
  exact(input.expected.tokenId, TOKEN_ID, "expected token");
  requiredTz1(input.expected.creatorAddress, "expected creator");
  requiredKt1(input.expected.escrowContract, "expected escrow contract");
  requiredIpfsUri(input.expected.wrapperUri, "expected wrapper URI");

  const openKit = validateOpenKit(input);
  const manifest = parsePinnedMaterial(input.manifest, "ravioli-pack-manifest.json");
  const envelope = parsePinnedMaterial(input.envelope, "ravioli-sealed-reveal-1.json");
  const tokenMetadata = parsePinnedMaterial(input.tokenMetadata, "token.json");
  if (new Set([manifest.uri, envelope.uri, tokenMetadata.uri]).size !== 3) {
    fail("crypto-invalid manifest, envelope, and token URIs must be distinct");
  }
  exact(openKit.kit.manifestUri, manifest.uri, "open-kit manifest URI");
  exact(openKit.sealedReveal.contentsUri, envelope.uri, "open-kit envelope URI");
  validateManifest(manifest.value, openKit.deadlines);

  const expectedPublicReveal = {
    schema: "pasta-ravioli-public-reveal@1",
    network: input.expected.network,
    contract: input.expected.contract,
    tokenId: TOKEN_ID,
    mode: MODE,
    manifestUri: manifest.uri,
    maxSupply: MAX_SUPPLY,
    itemCount: ITEM_COUNT,
    openKit: openKit.publicKit,
  };
  const decrypted = decryptEnvelope(
    envelope.value,
    openKit.sealedReveal,
    input.expected,
    manifest.uri,
    envelope.sha256,
    expectedPublicReveal,
  );
  const token = validateTokenMetadata(
    tokenMetadata.value,
    input.expected,
    manifest.uri,
    envelope.uri,
    openKit.deadlines,
  );
  const revealCommitment = computeRavioliRevealCommitment(
    envelope.uri,
    String(openKit.sealedReveal.salt),
    Number(openKit.sealedReveal.offset),
  );
  exact(token.revealCommitment, revealCommitment, "token reveal commitment");

  return {
    proof: Object.freeze({
      schema: RAVIOLI_CURRENT_V4_CRYPTO_INVALID_AUDIT_SCHEMA,
      disposition: "SUPERSEDED_CRYPTO_INVALID_PRECOMMIT",
      canonicalAadDecryptable: false,
      network: "shadownet",
      contract: input.expected.contract,
      tokenId: TOKEN_ID,
      mode: MODE,
      maxSupply: MAX_SUPPLY,
      itemCount: ITEM_COUNT,
      nonceCount: MAX_SUPPLY,
      manifestUri: manifest.uri,
      envelopeUri: envelope.uri,
      tokenMetadataUri: tokenMetadata.uri,
      openKitFileSha256: openKit.fileSha256,
      openKitCanonicalSha256: openKit.canonicalSha256,
      manifestSha256: manifest.sha256,
      pinnedEnvelopeSha256: envelope.sha256,
      producerEnvelopeSha256: decrypted.producerEnvelopeSha256,
      tokenMetadataSha256: tokenMetadata.sha256,
      publicRevealCanonicalSha256: decrypted.publicRevealCanonicalSha256,
      revealCommitment,
      deadlines: openKit.deadlines,
      tokenName: token.name,
      tokenSymbol: token.symbol,
    }),
  };
}

export function auditRavioliCurrentV4CryptoInvalidPrecommit(
  input: RavioliCurrentV4CryptoInvalidAuditInput,
): RavioliCurrentV4CryptoInvalidAudit {
  return verifyCryptoInvalidAuditInternal(input).proof;
}

function inventoryRows(
  value: readonly Readonly<{ tokenId: number; amount: number }>[],
  label: string,
): Map<number, number> {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(`${label} must contain exact token 0 and token 1 rows`);
  }
  const output = new Map<number, number>();
  for (const row of value) {
    const source = record(row, `${label} row`);
    exactKeys(source, ["tokenId", "amount"], `${label} row`);
    const tokenId = requiredNat(source.tokenId, `${label} token id`);
    const amount = requiredNat(source.amount, `${label} amount`);
    if (![0, 1].includes(tokenId) || output.has(tokenId)) {
      fail(`${label} token inventory drift`);
    }
    output.set(tokenId, amount);
  }
  if (!output.has(0) || !output.has(1)) fail(`${label} token coverage drift`);
  return output;
}

function freshEscrowRequirements(openKit: unknown, expectedFa2: string): Map<number, number> {
  const kit = record(openKit, "fresh open kit");
  exact(kit.schema, "pasta-ravioli-open-kit@3", "fresh inventory open-kit schema");
  exact(kit.mode, MODE, "fresh inventory open-kit mode");
  if (!Array.isArray(kit.recipes) || kit.recipes.length !== MAX_SUPPLY) {
    fail("fresh inventory open kit must contain exactly three recipes");
  }
  const requirements = new Map<number, number>([[0, 0], [1, 0]]);
  for (let index = 0; index < kit.recipes.length; index += 1) {
    const recipe = record(kit.recipes[index], `fresh inventory recipe ${index}`);
    if (!Array.isArray(recipe.actions) || recipe.actions.length !== ITEM_COUNT) {
      fail(`fresh inventory recipe ${index} action count drift`);
    }
    const action = record(recipe.actions[0], `fresh inventory recipe ${index} action`);
    exact(action.kind, "escrow", `fresh inventory recipe ${index} action kind`);
    exact(action.fa2, expectedFa2, `fresh inventory recipe ${index} FA2`);
    const tokenId = requiredNat(action.tokenId, `fresh inventory recipe ${index} token`);
    if (!requirements.has(tokenId)) fail(`fresh inventory recipe ${index} token is unsupported`);
    const amount = requiredNat(action.amount, `fresh inventory recipe ${index} amount`);
    if (amount < 1) fail(`fresh inventory recipe ${index} amount must be positive`);
    requirements.set(tokenId, requirements.get(tokenId)! + amount);
  }
  return requirements;
}

function rowsFromMap(values: Map<number, number>): readonly Readonly<{
  tokenId: number;
  amount: number;
}>[] {
  return Object.freeze([0, 1].map((tokenId) => Object.freeze({
    tokenId,
    amount: values.get(tokenId) ?? 0,
  })));
}

export function verifyRavioliCurrentV4CumulativeInventory(
  input: RavioliCurrentV4CumulativeInventoryInput,
  freshOpenKit: unknown,
): RavioliCurrentV4CumulativeInventoryProof {
  exact(input.owner, RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY.owner, "inventory owner");
  exact(input.router, RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY.router, "inventory router");
  exact(input.fa2, RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY.fa2, "inventory FA2");
  const creator = inventoryRows(input.creatorBalances, "creator inventory");
  const escrow = inventoryRows(input.routerEscrowBalances, "router escrow inventory");
  const existing = inventoryRows(
    input.existingCommittedRequirements,
    "existing committed requirements",
  );
  canonicalEqual(
    rowsFromMap(creator),
    RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY.creatorBalances,
    "creator inventory boundary",
  );
  canonicalEqual(
    rowsFromMap(escrow),
    RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY.routerEscrowBalances,
    "router escrow boundary",
  );
  canonicalEqual(
    rowsFromMap(existing),
    RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY.existingCommittedRequirements,
    "existing requirement boundary",
  );
  const fresh = freshEscrowRequirements(freshOpenKit, input.fa2);
  const cumulative = new Map<number, number>();
  const controlled = new Map<number, number>();
  for (const tokenId of [0, 1]) {
    if (existing.get(tokenId)! > escrow.get(tokenId)!) {
      fail(`existing token ${tokenId} reservation exceeds router escrow`);
    }
    if (fresh.get(tokenId)! > creator.get(tokenId)!) {
      fail(`fresh token ${tokenId} requirement exceeds creator inventory`);
    }
    cumulative.set(tokenId, existing.get(tokenId)! + fresh.get(tokenId)!);
    controlled.set(tokenId, escrow.get(tokenId)! + creator.get(tokenId)!);
    if (cumulative.get(tokenId)! > controlled.get(tokenId)!) {
      fail(`cumulative token ${tokenId} requirement exceeds controlled inventory`);
    }
  }
  if (fresh.get(0) !== 1 || fresh.get(1) !== 2) {
    fail("fresh recipes must use the only solvent token distribution (token 0 x1, token 1 x2)");
  }
  return Object.freeze({
    schema: RAVIOLI_CURRENT_V4_INVENTORY_PROOF_SCHEMA,
    owner: input.owner,
    router: input.router,
    fa2: input.fa2,
    existingRequirements: rowsFromMap(existing),
    freshRequirements: rowsFromMap(fresh),
    cumulativeRequirements: rowsFromMap(cumulative),
    controlledInventory: rowsFromMap(controlled),
    sufficient: true,
  });
}

async function authenticateTree(journalRoot: string): Promise<{
  appRoot: string;
  openKit1: { value: JsonRecord; bytes: Uint8Array };
}> {
  exact(path.basename(journalRoot), "journal", "journal lane directory name");
  const artifactsRoot = path.dirname(journalRoot);
  exact(path.basename(artifactsRoot), "artifacts", "artifact lane directory name");
  const appRoot = path.dirname(artifactsRoot);
  exact(path.basename(appRoot), "ravioli", "app lane directory name");

  const screenshotNames = CURRENT_V4_SCREENSHOTS.map(({ stem }) => `${stem}.png`);
  const sidecarNames = CURRENT_V4_SCREENSHOTS.map(({ stem }) => `screenshot-${stem}.json`);
  const eventRoot = path.join(journalRoot, "events");
  const journalPinRoot = path.join(journalRoot, "pins");
  const openKitRoot = path.join(artifactsRoot, "open-kits");
  const retainedPinRoot = path.join(artifactsRoot, "pins");
  await Promise.all([
    assertDirectoryInventory(appRoot, ["artifacts", "screenshots"], "Ravioli app lane"),
    assertDirectoryInventory(
      artifactsRoot,
      ["journal", "open-kits", "pins", ...sidecarNames],
      "Ravioli artifact lane",
    ),
    assertDirectoryInventory(journalRoot, ["events", "intent.json", "pins"], "Ravioli journal lane"),
    assertDirectoryInventory(eventRoot, EVENT_NAMES, "Ravioli journal event lane"),
    assertDirectoryInventory(journalPinRoot, PIN_NAMES, "Ravioli journal pin lane"),
    assertDirectoryInventory(
      openKitRoot,
      [OPEN_KIT_PROGRESS_NAME, OPEN_KIT_0_NAME, OPEN_KIT_1_NAME],
      "Ravioli open-kit lane",
    ),
    assertDirectoryInventory(retainedPinRoot, [], "Ravioli retained-pin lane"),
    assertDirectoryInventory(path.join(appRoot, "screenshots"), screenshotNames, "Ravioli screenshot lane"),
  ]);

  await Promise.all([
    ...CURRENT_V4_SCREENSHOTS.flatMap(({ stem, pngSha256, sidecarSha256 }) => [
      assertFileSha256(
        path.join(appRoot, "screenshots", `${stem}.png`),
        pngSha256,
        `screenshot ${stem}`,
      ),
      assertFileSha256(
        path.join(artifactsRoot, `screenshot-${stem}.json`),
        sidecarSha256,
        `screenshot sidecar ${stem}`,
      ),
    ]),
    assertFileSha256(
      path.join(openKitRoot, OPEN_KIT_0_NAME),
      OPEN_KIT_0_SHA256,
      "retained mode-0 open kit",
    ),
    assertFileSha256(
      path.join(openKitRoot, OPEN_KIT_PROGRESS_NAME),
      OPEN_KIT_PROGRESS_SHA256,
      "open-kit capture progress",
    ),
  ]);
  const openKit1Bytes = await assertFileSha256(
    path.join(openKitRoot, OPEN_KIT_1_NAME),
    OPEN_KIT_1_SHA256,
    "retained mode-1 open kit",
  );
  const openKit1Value = record(
    parseJsonBytes(openKit1Bytes, "retained mode-1 open kit"),
    "retained mode-1 open kit",
  );
  const files = await walkNoSymlinks(appRoot);
  exact(files.length, RAVIOLI_CURRENT_V4_RESUME_FILE_COUNT, "boundary-40 file count");
  return {
    appRoot,
    openKit1: {
      value: openKit1Value,
      bytes: Uint8Array.from(openKit1Bytes),
    },
  };
}

function assertPin(
  event: JsonRecord,
  bytes: Uint8Array,
  identity: RavioliCurrentV4PinIdentity,
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">,
): PastaUiLivePinProof {
  exact(event.phase, "PIN", `pin ${identity.pinSequence} phase`);
  exact(event.pinSequence, identity.pinSequence, `pin ${identity.pinSequence} sequence`);
  const artifact = record(event.artifact, `pin ${identity.pinSequence} artifact`);
  exact(
    artifact.path,
    `pins/${String(identity.pinSequence).padStart(6, "0")}.bin`,
    `pin ${identity.pinSequence} path`,
  );
  exact(artifact.fileName, identity.fileName, `pin ${identity.pinSequence} file`);
  exact(artifact.mimeType, identity.mimeType, `pin ${identity.pinSequence} MIME`);
  exact(artifact.byteLength, identity.byteLength, `pin ${identity.pinSequence} length`);
  exact(artifact.sha256, identity.sha256, `pin ${identity.pinSequence} checkpoint`);
  exact(bytes.byteLength, identity.byteLength, `pin ${identity.pinSequence} exact length`);
  exact(sha256(bytes), identity.sha256, `pin ${identity.pinSequence} exact hash`);
  const metadata = record(event.metadata, `pin ${identity.pinSequence} metadata`);
  exact(metadata.cid, identity.cid, `pin ${identity.pinSequence} CID`);
  exact(metadata.uri, identity.uri, `pin ${identity.pinSequence} URI`);
  exact(
    metadata.publicGatewayUrl,
    ipfsGatewayUrl(ipfs.publicGatewayUrl, identity.cid),
    `pin ${identity.pinSequence} gateway`,
  );
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
  operation: RavioliCurrentV3OperationIdentity,
): PastaUiLivePublicReceipt {
  return {
    schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
    sequence: operation.globalOrdinal,
    timestampUtc: operation.timestamp,
    action: operation.action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: RAVIOLI_CURRENT_V4_RESUME_IDENTITY.creatorAddress,
    contractAddress: operation.contractAddress,
    operationHash: operation.operationHash,
    entrypoints: [...operation.entrypoints],
  };
}

function validateOperationEvents(
  events: readonly { value: JsonRecord; sha256: string }[],
  startIndex: number,
  operation: RavioliCurrentV3OperationIdentity,
): RavioliCurrentV4OperationRecord {
  const prepared = events[startIndex].value;
  const submitted = events[startIndex + 1].value;
  const applied = events[startIndex + 2].value;
  exact(prepared.phase, "PREPARED", `operation ${operation.globalOrdinal} PREPARED`);
  exact(prepared.globalOrdinal, operation.globalOrdinal, `operation ${operation.globalOrdinal} ordinal`);
  exact(prepared.operationSequence, operation.globalOrdinal, `operation ${operation.globalOrdinal} sequence`);
  exact(prepared.descriptorSha256, operation.descriptorSha256, `operation ${operation.globalOrdinal} descriptor`);
  const preparedOperation = record(
    prepared.operation,
    `operation ${operation.globalOrdinal} prepared operation`,
  );
  exact(preparedOperation.status, "PREPARED", `operation ${operation.globalOrdinal} prepared status`);
  exact(preparedOperation.operationSequence, operation.globalOrdinal, `operation ${operation.globalOrdinal} persisted sequence`);
  exact(preparedOperation.chainId, SHADOWNET_CHAIN_ID, `operation ${operation.globalOrdinal} chain`);
  exact(preparedOperation.signerAddress, RAVIOLI_CURRENT_V4_RESUME_IDENTITY.creatorAddress, `operation ${operation.globalOrdinal} signer`);
  exact(preparedOperation.action, operation.action, `operation ${operation.globalOrdinal} action`);
  canonicalEqual(preparedOperation.entrypoints, operation.entrypoints, `operation ${operation.globalOrdinal} entrypoints`);
  const descriptor = record(
    preparedOperation.descriptor,
    `operation ${operation.globalOrdinal} descriptor`,
  ) as unknown as PastaUiLiveOperationDescriptor;
  exact(
    ravioliUiLiveDescriptorSha256(descriptor),
    operation.descriptorSha256,
    `operation ${operation.globalOrdinal} descriptor hash`,
  );
  if (operation.action === "call") {
    exact(descriptor.kind, "call", `operation ${operation.globalOrdinal} descriptor kind`);
    const call = descriptor as Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>;
    exact(call.call.contractAddress, operation.contractAddress, `operation ${operation.globalOrdinal} target`);
    exact(call.call.entrypoint, operation.entrypoints[0], `operation ${operation.globalOrdinal} entrypoint`);
  } else {
    exact(descriptor.kind, "originate", `operation ${operation.globalOrdinal} descriptor kind`);
  }

  exact(submitted.phase, "SUBMITTED", `operation ${operation.globalOrdinal} SUBMITTED`);
  exact(submitted.globalOrdinal, operation.globalOrdinal, `operation ${operation.globalOrdinal} submitted ordinal`);
  exact(submitted.operationSequence, operation.globalOrdinal, `operation ${operation.globalOrdinal} submitted sequence`);
  exact(submitted.preparedRecordSha256, events[startIndex].sha256, `operation ${operation.globalOrdinal} PREPARED link`);
  exact(submitted.descriptorSha256, operation.descriptorSha256, `operation ${operation.globalOrdinal} submitted descriptor`);
  exact(submitted.operationHash, operation.operationHash, `operation ${operation.globalOrdinal} submitted hash`);
  exact(submitted.contractAddress, operation.contractAddress, `operation ${operation.globalOrdinal} submitted target`);

  exact(applied.phase, "APPLIED", `operation ${operation.globalOrdinal} APPLIED`);
  exact(applied.globalOrdinal, operation.globalOrdinal, `operation ${operation.globalOrdinal} applied ordinal`);
  exact(applied.operationSequence, operation.globalOrdinal, `operation ${operation.globalOrdinal} applied sequence`);
  exact(applied.submittedRecordSha256, events[startIndex + 1].sha256, `operation ${operation.globalOrdinal} SUBMITTED link`);
  exact(applied.descriptorSha256, operation.descriptorSha256, `operation ${operation.globalOrdinal} applied descriptor`);
  exact(applied.operationHash, operation.operationHash, `operation ${operation.globalOrdinal} applied hash`);
  const evidence = record(applied.evidence, `operation ${operation.globalOrdinal} evidence`);
  exact(evidence.status, "applied", `operation ${operation.globalOrdinal} status`);
  exact(evidence.operationHash, operation.operationHash, `operation ${operation.globalOrdinal} evidence hash`);
  exact(evidence.signerAddress, RAVIOLI_CURRENT_V4_RESUME_IDENTITY.creatorAddress, `operation ${operation.globalOrdinal} evidence signer`);
  exact(evidence.contractAddress, operation.contractAddress, `operation ${operation.globalOrdinal} evidence target`);
  exact(evidence.counter, operation.counter, `operation ${operation.globalOrdinal} evidence counter`);
  exact(evidence.level, operation.level, `operation ${operation.globalOrdinal} evidence level`);
  exact(evidence.timestamp, operation.timestamp, `operation ${operation.globalOrdinal} evidence timestamp`);
  canonicalEqual(evidence.entrypoints, operation.entrypoints, `operation ${operation.globalOrdinal} evidence entrypoints`);
  exact(
    evidence.explorerUrl,
    `https://shadownet.tzkt.io/${operation.operationHash}`,
    `operation ${operation.globalOrdinal} explorer`,
  );
  if (validateOperation(operation.operationHash) !== ValidationResult.VALID) {
    fail(`operation ${operation.globalOrdinal} hash is invalid`);
  }
  return Object.freeze({
    identity: operation,
    descriptor,
    receipt: writeReceipt(operation),
  });
}

export async function loadRavioliCurrentV4Resume(
  input: LoadRavioliCurrentV4ResumeInput,
): Promise<RavioliCurrentV4Resume> {
  const identity = RAVIOLI_CURRENT_V4_RESUME_IDENTITY;
  if (input.journal.isFinalized()) fail("the exact boundary must remain unfinalized");
  exact(input.journal.getCompletedOperationCount(), 9, "completed operation count");
  const root = path.resolve(input.journal.journalRoot);
  const tree = await authenticateTree(root);
  const intentFile = await canonicalJsonFile(path.join(root, "intent.json"), "journal intent");
  exact(intentFile.sha256, identity.intentSha256, "journal intent hash");
  const intent = intentFile.value;
  exact(intent.schema, RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA, "journal intent schema");
  exact(intent.status, "IMMUTABLE", "journal intent status");
  exact(intent.journalId, identity.journalId, "journal id");
  exact(intent.createdAt, identity.createdAt, "journal creation time");
  canonicalEqual(intent.network, { chainId: SHADOWNET_CHAIN_ID, name: "shadownet" }, "journal network");
  exact(intent.matrixSha256, identity.matrixSha256, "journal matrix hash");
  canonicalEqual(intent.matrix, RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX, "journal fixed matrix");
  canonicalEqual(intent.dependencyAddresses, {
    gnocchi: identity.gnocchiAddress,
    rotini: identity.rotiniAddress,
  }, "journal dependencies");
  canonicalEqual(input.expected.dependencyAddresses, intent.dependencyAddresses, "current dependencies");
  const { tzktBaseline, ...stableDependencyHashes } = record(
    intent.dependencyHashes,
    "journal dependency hashes",
  );
  requiredHash(tzktBaseline, "journal TzKT baseline hash");
  canonicalEqual(stableDependencyHashes, input.expected.dependencyHashes, "current dependency hashes");
  canonicalEqual(intent.artifactHashes, identity.artifactHashes, "journal artifact identity");
  canonicalEqual(input.expected.artifactHashes, identity.artifactHashes, "current artifact identity");
  exact(
    hashJsonForBridge(input.expected.controllerArtifact),
    identity.artifactHashes.blindController,
    "current controller artifact",
  );
  exact(
    hashJsonForBridge(input.expected.routerArtifact),
    identity.artifactHashes.router,
    "current router artifact",
  );
  exact(input.expected.creatorAddress, identity.creatorAddress, "requested creator");
  exact(input.expected.collectorOneAddress, identity.collectorOneAddress, "requested collector one");
  exact(input.expected.collectorTwoAddress, identity.collectorTwoAddress, "requested collector two");

  const eventRoot = path.join(root, "events");
  const pinRoot = path.join(root, "pins");
  const events = await Promise.all(EVENT_NAMES.map((name, index) =>
    canonicalJsonFile(path.join(eventRoot, name), `event ${index + 1}`)));
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index].value;
    exact(event.schema, RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA, `event ${index + 1} schema`);
    exact(event.journalId, identity.journalId, `event ${index + 1} journal`);
    exact(event.intentSha256, identity.intentSha256, `event ${index + 1} intent`);
    exact(event.eventIndex, index + 1, `event ${index + 1} index`);
    exact(event.actor, "creator", `event ${index + 1} actor`);
    exact(event.phase, PHASES[index], `event ${index + 1} phase`);
    exact(
      event.previousRecordSha256,
      index === 0 ? identity.intentSha256 : events[index - 1].sha256,
      `event ${index + 1} hash link`,
    );
  }
  exact(events[36].sha256, identity.predecessorEventSha256, "boundary-37 predecessor");
  exact(events.at(-1)?.sha256, identity.finalEventSha256, "boundary-40 journal head");

  const journalPins: RavioliCurrentV4PinRecord[] = [];
  for (let index = 0; index < identity.pins.length; index += 1) {
    const pinIdentity = identity.pins[index];
    const bytes = await readFile(path.join(pinRoot, PIN_NAMES[index]));
    const eventIndex = PIN_EVENT_INDEXES[index];
    const proof = assertPin(events[eventIndex].value, bytes, pinIdentity, input.ipfs);
    const value = pinIdentity.mimeType === "application/json"
      ? canonicalJsonBytesFromRaw(bytes, `pin ${pinIdentity.pinSequence}`).value
      : undefined;
    journalPins.push(Object.freeze({
      identity: pinIdentity,
      eventPath: `events/${EVENT_NAMES[eventIndex]}`,
      artifactPath: `pins/${PIN_NAMES[index]}`,
      bytes: Uint8Array.from(bytes),
      ...(value !== undefined ? { value } : {}),
      proof,
    }));
  }
  const operations = identity.operations.map((operation, index) =>
    validateOperationEvents(events, OPERATION_EVENT_INDEXES[index], operation));
  const activePins = journalPins.filter((pin) => pin.identity.disposition === "ACTIVE");
  const supersededPrecommitPins = journalPins.filter(
    (pin) => pin.identity.disposition === "SUPERSEDED_PRIVATE_PRECOMMIT",
  );
  const cryptoInvalidPrecommitPins = journalPins.filter(
    (pin) => pin.identity.disposition === "SUPERSEDED_CRYPTO_INVALID_PRECOMMIT",
  );
  exact(activePins.length, 7, "active pin partition");
  exact(supersededPrecommitPins.length, 2, "superseded pin partition");
  exact(cryptoInvalidPrecommitPins.length, 3, "crypto-invalid pin partition");
  const proofInput: RavioliCurrentV4CryptoInvalidAuditInput = {
    expected: {
      network: "shadownet",
      contract: identity.routerAddress,
      tokenId: 1,
      creatorAddress: identity.creatorAddress,
      escrowContract: identity.gnocchiAddress,
      wrapperUri: activePins[6].proof.uri,
    },
    openKit: tree.openKit1,
    manifest: pinMaterial(cryptoInvalidPrecommitPins[0]),
    envelope: pinMaterial(cryptoInvalidPrecommitPins[1]),
    tokenMetadata: pinMaterial(cryptoInvalidPrecommitPins[2]),
  };
  const verified = verifyCryptoInvalidAuditInternal(proofInput);
  exact(verified.proof.openKitFileSha256, identity.openKit1Sha256, "mode-1 open-kit file hash");
  exact(verified.proof.openKitCanonicalSha256, identity.openKit1CanonicalSha256, "mode-1 open-kit canonical hash");
  exact(verified.proof.producerEnvelopeSha256, identity.producerEnvelopeSha256, "mode-1 producer envelope hash");
  exact(verified.proof.pinnedEnvelopeSha256, identity.pinnedEnvelopeSha256, "mode-1 pinned envelope hash");
  exact(verified.proof.publicRevealCanonicalSha256, identity.publicRevealCanonicalSha256, "mode-1 public reveal hash");
  exact(verified.proof.revealCommitment, identity.revealCommitment, "mode-1 reveal commitment");

  return Object.freeze({
    appRoot: tree.appRoot,
    journalRoot: root,
    journalPrefixComplete: true,
    fileCount: RAVIOLI_CURRENT_V4_RESUME_FILE_COUNT,
    controllerAddress: identity.controllerAddress,
    routerAddress: identity.routerAddress,
    journalPins: Object.freeze(journalPins),
    activePins: Object.freeze(activePins),
    supersededPrecommitPins: Object.freeze(supersededPrecommitPins),
    cryptoInvalidPrecommitPins: Object.freeze(cryptoInvalidPrecommitPins),
    replayPins: Object.freeze([...activePins]),
    operations: Object.freeze(operations),
    writeReceipts: Object.freeze(operations.map((operation) => operation.receipt)),
    cryptoInvalidAudit: verified.proof,
    cryptoInvalidDeadlines: verified.proof.deadlines,
    identity,
  });
}

type ReplayStep = Readonly<{
  action: "pin_blob" | "pin_json" | "originate" | "call";
  fingerprint: string;
  respond(): unknown;
}>;

function pinJsonRequest(request: PastaUiLiveBridgeRequest): {
  fileName: string;
  value: JsonRecord;
  bytes: Uint8Array;
  fingerprint: string;
} {
  const payload = record(request.payload, "pin_json payload");
  exactKeys(payload, ["fileName", "value"], "pin_json payload");
  const fileName = String(payload.fileName);
  const value = record(decodePastaUiLiveValue(payload.value), "decoded pin_json value");
  const bytes = canonicalBytes(value);
  return {
    fileName,
    value,
    bytes,
    fingerprint: `pin_json:${fileName}:${sha256(bytes)}:${bytes.byteLength}`,
  };
}

function pinBlobFingerprint(request: PastaUiLiveBridgeRequest): string {
  const payload = record(request.payload, "pin_blob payload");
  exactKeys(payload, ["dataBase64", "fileName", "mimeType"], "pin_blob payload");
  const bytes = canonicalBase64(payload.dataBase64, "pin_blob data");
  return `pin_blob:${String(payload.fileName)}:${String(payload.mimeType)}:${sha256(bytes)}:${bytes.byteLength}`;
}

function operationDescriptor(
  request: PastaUiLiveBridgeRequest,
): PastaUiLiveOperationDescriptor {
  const payload = record(request.payload, `${request.action} payload`);
  if (request.action === "originate") {
    exactKeys(payload, ["code", "storage"], "originate payload");
    return {
      kind: "originate",
      code: decodePastaUiLiveValue(payload.code),
      storage: decodePastaUiLiveValue(payload.storage),
    };
  }
  if (request.action === "call") {
    exactKeys(payload, ["call", "sendOptions"], "call payload");
    const call = record(decodePastaUiLiveValue(payload.call), "decoded call");
    exactKeys(call, ["contractAddress", "entrypoint", "payload"], "decoded call");
    return {
      kind: "call",
      call: {
        contractAddress: String(call.contractAddress),
        entrypoint: String(call.entrypoint),
        payload: call.payload,
      },
      sendOptions: record(
        decodePastaUiLiveValue(payload.sendOptions),
        "decoded send options",
      ),
    };
  }
  fail(`unsupported operation action ${request.action}`);
}

function requestFingerprint(request: PastaUiLiveBridgeRequest): string | null {
  try {
    if (request.action === "pin_blob") return pinBlobFingerprint(request);
    if (request.action === "pin_json") return pinJsonRequest(request).fingerprint;
    if (request.action === "originate" || request.action === "call") {
      return `${request.action}:${ravioliUiLiveDescriptorSha256(operationDescriptor(request))}`;
    }
    return null;
  } catch {
    return null;
  }
}

function replayPinStep(pin: RavioliCurrentV4PinRecord): ReplayStep {
  const action = pin.identity.mimeType === "application/json" ? "pin_json" : "pin_blob";
  const fingerprint = action === "pin_json"
    ? `pin_json:${pin.proof.fileName}:${pin.proof.sha256}:${pin.proof.byteLength}`
    : `pin_blob:${pin.proof.fileName}:${pin.proof.mimeType}:${pin.proof.sha256}:${pin.proof.byteLength}`;
  return Object.freeze({
    action,
    fingerprint,
    respond: () => ({ pin: pin.proof }),
  });
}

function replayOperationStep(operation: RavioliCurrentV4OperationRecord): ReplayStep {
  return Object.freeze({
    action: operation.identity.action,
    fingerprint: `${operation.identity.action}:${operation.identity.descriptorSha256}`,
    respond: () => ({
      ...(operation.identity.action === "originate"
        ? { contractAddress: operation.identity.contractAddress }
        : {}),
      operationHash: operation.identity.operationHash,
      confirmationLevel: 1,
    }),
  });
}

type FreshPinnedMaterial = Readonly<{
  value: JsonRecord;
  bytes: Uint8Array;
  proof: PastaUiLivePinProof;
}>;

function asVerifierMaterial(value: FreshPinnedMaterial): RavioliPinnedJsonMaterial {
  return {
    value: value.value,
    bytes: value.bytes,
    proof: {
      cid: value.proof.cid,
      uri: value.proof.uri,
      fileName: value.proof.fileName,
      mimeType: value.proof.mimeType,
      byteLength: value.proof.byteLength,
      sha256: value.proof.sha256,
      publicGatewayVerified: true,
    },
  };
}

function assertFreshPinProof(
  response: unknown,
  expected: { fileName: string; bytes: Uint8Array },
): PastaUiLivePinProof {
  const proof = record(record(response, "fresh pin response").pin, "fresh pin proof");
  exact(proof.fileName, expected.fileName, `${expected.fileName} response file`);
  exact(proof.mimeType, "application/json", `${expected.fileName} response MIME`);
  exact(proof.byteLength, expected.bytes.byteLength, `${expected.fileName} response length`);
  exact(proof.sha256, sha256(expected.bytes), `${expected.fileName} response hash`);
  const uri = requiredIpfsUri(proof.uri, `${expected.fileName} response URI`);
  exact(uri, `ipfs://${String(proof.cid)}`, `${expected.fileName} response CID/URI`);
  exact(
    proof.cid,
    rawCidV1Sha256(expected.bytes),
    `${expected.fileName} response raw CID`,
  );
  exact(proof.publicGatewayVerified, true, `${expected.fileName} public verification`);
  if (!Number.isSafeInteger(proof.verificationAttempts) || proof.verificationAttempts < 1) {
    fail(`${expected.fileName} verification attempts are invalid`);
  }
  return proof as PastaUiLivePinProof;
}

function freshManifestCandidate(
  request: PastaUiLiveBridgeRequest,
  nowMs: number,
  minimumSaleWindowMs: number,
): { value: JsonRecord; bytes: Uint8Array } {
  exact(request.action, "pin_json", "fresh manifest action");
  const parsed = pinJsonRequest(request);
  exact(parsed.fileName, "ravioli-pack-manifest.json", "fresh manifest file");
  const value = parsed.value;
  exact(value.schemaVersion, "wtfos.pasta.pack-manifest.v2", "fresh manifest schema");
  exact(value.mode, MODE, "fresh manifest mode");
  exact(value.maxSupply, MAX_SUPPLY, "fresh manifest supply");
  exact(value.itemCount, ITEM_COUNT, "fresh manifest item count");
  exact(value.mystery, true, "fresh manifest mystery policy");
  canonicalEqual(value.members, [], "fresh manifest public members");
  exact(
    value.assignmentPolicy,
    "precommitted-salted-cyclic-rotation",
    "fresh manifest assignment",
  );
  exact(
    value.blindSecurity,
    "commit-reveal-ui-hidden-chain-public",
    "fresh manifest blind security",
  );
  const edition = record(value.editionPolicy, "fresh manifest edition policy");
  exact(edition.wrapperEditionClass, "limited-edition", "fresh wrapper edition class");
  exact(edition.requiresLimitedWrapper, false, "fresh child LE requirement");
  exact(edition.earliestChildEnd, null, "fresh earliest child end");
  const saleEnd = Date.parse(String(edition.wrapperSaleEnd));
  const revealDeadline = Date.parse(String(edition.revealDeadline));
  const openDeadline = Date.parse(String(edition.openDeadline));
  if (![saleEnd, revealDeadline, openDeadline].every(Number.isFinite)) {
    fail("fresh manifest deadlines are invalid");
  }
  if (saleEnd < nowMs + minimumSaleWindowMs) {
    fail("fresh manifest sale window has insufficient runway");
  }
  if (!(saleEnd < revealDeadline && revealDeadline < openDeadline)) {
    fail("fresh manifest deadline order is invalid");
  }
  if (
    edition.wrapperSaleEnd === "2026-07-24T00:33:00.000Z"
    || edition.revealDeadline === "2026-07-24T01:33:00.000Z"
    || edition.openDeadline === "2026-07-24T02:33:00.000Z"
  ) {
    fail("fresh manifest reuses the expired crypto-invalid deadline set");
  }
  return { value, bytes: parsed.bytes };
}

function freshEnvelopeCandidate(
  request: PastaUiLiveBridgeRequest,
  manifest: FreshPinnedMaterial,
): { value: JsonRecord; bytes: Uint8Array } {
  exact(request.action, "pin_json", "fresh envelope action");
  const parsed = pinJsonRequest(request);
  exact(parsed.fileName, "ravioli-sealed-reveal-1.json", "fresh envelope file");
  const value = parsed.value;
  const expectedTopLevelOrder = ["aad", "cipher", "ciphertext", "iv", "keyDerivation", "schema"];
  if (JSON.stringify(Object.keys(value)) !== JSON.stringify(expectedTopLevelOrder)) {
    fail("fresh envelope must use canonical top-level key order before pinning");
  }
  exactKeys(value, expectedTopLevelOrder, "fresh envelope");
  exact(value.schema, "pasta-ravioli-sealed-reveal@1", "fresh envelope schema");
  exact(value.cipher, "AES-256-GCM", "fresh envelope cipher");
  exact(
    value.keyDerivation,
    "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    "fresh envelope KDF",
  );
  const aad = record(value.aad, "fresh envelope AAD");
  const expectedAadOrder = ["contract", "manifestUri", "network", "schema", "tokenId"];
  if (JSON.stringify(Object.keys(aad)) !== JSON.stringify(expectedAadOrder)) {
    fail("fresh envelope AAD must be canonical before encryption and pinning");
  }
  canonicalEqual(aad, {
    contract: RAVIOLI_CURRENT_V4_RESUME_IDENTITY.routerAddress,
    manifestUri: manifest.proof.uri,
    network: "shadownet",
    schema: "pasta-ravioli-sealed-reveal@1",
    tokenId: 1,
  }, "fresh envelope AAD");
  exact(canonicalBase64(value.iv, "fresh envelope IV").byteLength, 12, "fresh envelope IV length");
  if (canonicalBase64(value.ciphertext, "fresh envelope ciphertext").byteLength <= 16) {
    fail("fresh envelope ciphertext is too short");
  }
  if (!Buffer.from(parsed.bytes).equals(Buffer.from(JSON.stringify(value), "utf8"))) {
    fail("fresh envelope producer bytes must equal canonical pinned bytes");
  }
  return { value, bytes: parsed.bytes };
}

function freshTokenCandidate(
  request: PastaUiLiveBridgeRequest,
  resume: RavioliCurrentV4Resume,
  manifest: FreshPinnedMaterial,
  envelope: FreshPinnedMaterial,
): { value: JsonRecord; bytes: Uint8Array } {
  exact(request.action, "pin_json", "fresh token action");
  const parsed = pinJsonRequest(request);
  exact(parsed.fileName, "token.json", "fresh token file");
  const value = parsed.value;
  const wrapperUri = resume.activePins[6].proof.uri;
  exact(value.artifactUri, wrapperUri, "fresh token artifact URI");
  exact(value.displayUri, wrapperUri, "fresh token display URI");
  exact(value.thumbnailUri, wrapperUri, "fresh token thumbnail URI");
  exact(value.minter, resume.identity.creatorAddress, "fresh token minter");
  canonicalEqual(value.creators, [resume.identity.creatorAddress], "fresh token creators");
  const ravioli = record(value.ravioli, "fresh token Ravioli policy");
  exact(ravioli.version, 3, "fresh token Ravioli version");
  exact(ravioli.mode, MODE, "fresh token mode");
  exact(ravioli.itemCount, ITEM_COUNT, "fresh token item count");
  exact(ravioli.maxSupply, MAX_SUPPLY, "fresh token supply");
  exact(ravioli.manifestUri, manifest.proof.uri, "fresh token manifest URI");
  exact(ravioli.sealedContentsUri, envelope.proof.uri, "fresh token envelope URI");
  requiredHash(ravioli.revealCommitment, "fresh token reveal commitment");
  return { value, bytes: parsed.bytes };
}

export function createRavioliCurrentV4ResumeInterceptor(input: {
  resume: RavioliCurrentV4Resume;
  delegate: PastaUiLiveBridgeHandler;
  now?: () => number;
  minimumSaleWindowMs?: number;
  loadFreshPrivatePrecommit(
    context: RavioliCurrentV4FreshPinnedContext,
  ): Promise<RavioliCurrentV4FreshPrivatePrecommit>;
  beforeDelegateOperationTen(
    context: RavioliCurrentV4OperationTenContext,
  ): Promise<void>;
}): RavioliCurrentV4ResumeInterceptor {
  const { resume, delegate } = input;
  const activePinSteps = resume.activePins.map(replayPinStep);
  const operationSteps = resume.operations.map(replayOperationStep);
  const stablePrefix = Object.freeze([
    activePinSteps[0],
    activePinSteps[1],
    activePinSteps[2],
    operationSteps[0],
    operationSteps[1],
    operationSteps[2],
    activePinSteps[3],
    activePinSteps[4],
    activePinSteps[5],
    operationSteps[3],
    operationSteps[4],
    operationSteps[5],
    operationSteps[6],
    operationSteps[7],
    activePinSteps[6],
    operationSteps[8],
  ]);
  exact(
    stablePrefix.length,
    RAVIOLI_CURRENT_V4_REPLAY_STEP_COUNT,
    "stable replay prefix length",
  );
  const supersededFingerprints = new Set(
    resume.supersededPrecommitPins.map(replayPinStep).map((step) => step.fingerprint),
  );
  const historicalFingerprints = new Set([
    ...resume.journalPins.map(replayPinStep).map((step) => step.fingerprint),
    ...operationSteps.map((step) => step.fingerprint),
  ]);
  const historicalUris = new Set(resume.journalPins.map((pin) => pin.proof.uri));
  const freshFingerprints = new Set<string>();
  let completed = 0;
  let stage: ReturnType<RavioliCurrentV4ResumeInterceptor["continuationStage"]> =
    "replay-prefix";
  let delegationStarted = false;
  let context: RavioliCurrentV4OperationTenContext | null = null;
  let freshManifest: FreshPinnedMaterial | null = null;
  let freshEnvelope: FreshPinnedMaterial | null = null;
  let freshToken: FreshPinnedMaterial | null = null;

  const replay = (
    request: PastaUiLiveBridgeRequest,
    steps: readonly ReplayStep[],
    completed: number,
    label: string,
  ): { response: unknown; completed: number } => {
    const expected = steps[completed];
    if (!expected) fail(`${label} replay received an extra mutation`);
    if (request.action !== expected.action) {
      fail(`expected ${label} replay step ${completed + 1} (${expected.action}), received ${request.action}`);
    }
    if (requestFingerprint(request) !== expected.fingerprint) {
      fail(`${label} replay step ${completed + 1} ${expected.action} bytes or descriptor drifted`);
    }
    return { response: expected.respond(), completed: completed + 1 };
  };

  const rejectHistoricalMutation = (request: PastaUiLiveBridgeRequest): string | null => {
    const fingerprint = requestFingerprint(request);
    if (fingerprint && supersededFingerprints.has(fingerprint)) {
      fail(`refusing superseded private precommit artifact: ${request.action}`);
    }
    if (fingerprint && historicalFingerprints.has(fingerprint)) {
      fail(`refusing duplicate recovered side effect: ${request.action}`);
    }
    if (fingerprint && freshFingerprints.has(fingerprint)) {
      fail(`refusing duplicate fresh side effect: ${request.action}`);
    }
    return fingerprint;
  };

  const handle: PastaUiLiveBridgeHandler = async (request) => {
    if (READ_ACTIONS.has(request.action)) return delegate(request);
    if (stage === "replay-prefix") {
      const result = replay(request, stablePrefix, completed, "stable");
      completed = result.completed;
      if (completed === stablePrefix.length) stage = "fresh-mode1-manifest";
      return result.response;
    }

    const fingerprint = rejectHistoricalMutation(request);
    if (stage === "fresh-mode1-manifest") {
      const candidate = freshManifestCandidate(
        request,
        (input.now ?? Date.now)(),
        input.minimumSaleWindowMs ?? 5 * 60 * 1_000,
      );
      if (!fingerprint) fail("fresh manifest fingerprint is unavailable");
      const response = await delegate(request);
      const proof = assertFreshPinProof(response, {
        fileName: "ravioli-pack-manifest.json",
        bytes: candidate.bytes,
      });
      if (historicalUris.has(proof.uri)) fail("fresh manifest reused a historical URI");
      freshFingerprints.add(fingerprint);
      freshManifest = Object.freeze({ ...candidate, proof });
      stage = "fresh-mode1-envelope";
      return response;
    }
    if (stage === "fresh-mode1-envelope") {
      if (!freshManifest) fail("fresh manifest context is missing");
      const candidate = freshEnvelopeCandidate(request, freshManifest);
      if (!fingerprint) fail("fresh envelope fingerprint is unavailable");
      const response = await delegate(request);
      const proof = assertFreshPinProof(response, {
        fileName: "ravioli-sealed-reveal-1.json",
        bytes: candidate.bytes,
      });
      if (historicalUris.has(proof.uri) || proof.uri === freshManifest.proof.uri) {
        fail("fresh envelope URI is not distinct");
      }
      freshFingerprints.add(fingerprint);
      freshEnvelope = Object.freeze({ ...candidate, proof });
      stage = "fresh-mode1-token";
      return response;
    }
    if (stage === "fresh-mode1-token") {
      if (!freshManifest || !freshEnvelope) fail("fresh manifest/envelope context is missing");
      const candidate = freshTokenCandidate(
        request,
        resume,
        freshManifest,
        freshEnvelope,
      );
      if (!fingerprint) fail("fresh token fingerprint is unavailable");
      const response = await delegate(request);
      const proof = assertFreshPinProof(response, {
        fileName: "token.json",
        bytes: candidate.bytes,
      });
      if (
        historicalUris.has(proof.uri)
        || proof.uri === freshManifest.proof.uri
        || proof.uri === freshEnvelope.proof.uri
      ) {
        fail("fresh token URI is not distinct");
      }
      freshFingerprints.add(fingerprint);
      freshToken = Object.freeze({ ...candidate, proof });
      stage = "fresh-operation-10";
      return response;
    }
    if (stage === "fresh-operation-10") {
      if (delegationStarted) {
        fail("operation 10 was already delegated; reconcile before retrying");
      }
      if (!freshManifest || !freshEnvelope || !freshToken) {
        fail("fresh precommit context is incomplete");
      }
      exact(request.action, "call", "fresh operation 10 action");
      const descriptor = operationDescriptor(request);
      exact(descriptor.kind, "call", "fresh operation 10 descriptor kind");
      const operationTen = descriptor as Extract<
        PastaUiLiveOperationDescriptor,
        { kind: "call" }
      >;
      const pinnedContext: RavioliCurrentV4FreshPinnedContext = Object.freeze({
        manifest: asVerifierMaterial(freshManifest),
        envelope: asVerifierMaterial(freshEnvelope),
        tokenMetadata: asVerifierMaterial(freshToken),
        operationTen,
      });
      const privatePrecommit = await input.loadFreshPrivatePrecommit(pinnedContext);
      const privateProof = verifyRavioliMode1PreOp10PrivateProof({
        expected: {
          network: "shadownet",
          contract: resume.routerAddress,
          tokenId: 1,
        },
        openKit: privatePrecommit.openKit,
        manifest: pinnedContext.manifest,
        envelope: pinnedContext.envelope,
        tokenMetadata: pinnedContext.tokenMetadata,
        operationTen,
      });
      if (
        privateProof.openKitSha256
        === resume.cryptoInvalidAudit.openKitCanonicalSha256
      ) {
        fail("fresh operation 10 reused the crypto-invalid private open kit");
      }
      const inventoryProof = verifyRavioliCurrentV4CumulativeInventory(
        privatePrecommit.inventory,
        privatePrecommit.openKit,
      );
      const candidate = Object.freeze({
        schema: RAVIOLI_CURRENT_V4_OPERATION_TEN_CONTEXT_SCHEMA,
        privateProof,
        inventoryProof,
        operationTen,
        operationTenDescriptorSha256: ravioliUiLiveDescriptorSha256(operationTen),
      });
      await input.beforeDelegateOperationTen(candidate);
      delegationStarted = true;
      stage = "operation-10-delegating";
      const response = await delegate(request);
      context = candidate;
      stage = "continued";
      return response;
    }
    if (stage === "operation-10-delegating") {
      fail("operation 10 delegation is in flight or ambiguous");
    }
    return delegate(request);
  };

  return Object.freeze({
    handle,
    primeAuthenticatedMode0Prefix: () => {
      if (stage !== "replay-prefix" || completed !== 0) {
        fail("authenticated mode-0 prefix may only be primed once from the initial replay boundary");
      }
      for (const step of stablePrefix.slice(0, 14)) step.respond();
      completed = 14;
    },
    isReplayComplete: () => completed === stablePrefix.length,
    getCompletedReplayStepCount: () => completed,
    getRemainingReplayStepCount: () => stablePrefix.length - completed,
    continuationStage: () => stage,
    operationTenContext: () => context,
  });
}

export function ravioliCurrentV4ResumeSnapshot(
  resume: RavioliCurrentV4Resume,
): JsonValue {
  return {
    schema: "pastaprotocol-ravioli-current-v4-resume-snapshot@1",
    identity: resume.identity,
    appRoot: resume.appRoot,
    journalRoot: resume.journalRoot,
    fileCount: resume.fileCount,
    activePinSha256: resume.activePins.map((pin) => pin.proof.sha256),
    supersededPinSha256: resume.supersededPrecommitPins.map((pin) => pin.proof.sha256),
    cryptoInvalidPinSha256: resume.cryptoInvalidPrecommitPins.map((pin) => pin.proof.sha256),
    operationDescriptorSha256: resume.operations.map((operation) =>
      ravioliUiLiveDescriptorSha256(operation.descriptor)),
    writeReceipts: resume.writeReceipts,
    cryptoInvalidAudit: resume.cryptoInvalidAudit,
    cryptoInvalidDeadlines: resume.cryptoInvalidDeadlines,
  } as unknown as JsonValue;
}

export function assertRavioliCurrentV4IdentityAddresses(): void {
  for (const address of [
    RAVIOLI_CURRENT_V4_RESUME_IDENTITY.creatorAddress,
    RAVIOLI_CURRENT_V4_RESUME_IDENTITY.collectorOneAddress,
    RAVIOLI_CURRENT_V4_RESUME_IDENTITY.collectorTwoAddress,
  ]) {
    requiredTz1(address, `identity address ${address}`);
  }
  for (const address of [
    RAVIOLI_CURRENT_V4_RESUME_IDENTITY.gnocchiAddress,
    RAVIOLI_CURRENT_V4_RESUME_IDENTITY.rotiniAddress,
    RAVIOLI_CURRENT_V4_RESUME_IDENTITY.controllerAddress,
    RAVIOLI_CURRENT_V4_RESUME_IDENTITY.routerAddress,
  ]) {
    requiredKt1(address, `identity address ${address}`);
  }
}
