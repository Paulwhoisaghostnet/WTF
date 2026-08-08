import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
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
  RAVIOLI_CURRENT_V2_RESUME_IDENTITY,
  type RavioliCurrentV2OperationIdentity,
  type RavioliCurrentV2PinIdentity,
} from "./shadownet-ravioli-current-v2-resume";
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

const EVENT_NAMES = Object.freeze([
  "000001-pin-creator.json",
  "000002-pin-creator.json",
  "000003-pin-creator.json",
  "000004-prepared-creator.json",
  "000005-submitted-creator.json",
  "000006-applied-creator.json",
  "000007-prepared-creator.json",
  "000008-submitted-creator.json",
  "000009-applied-creator.json",
  "000010-prepared-creator.json",
  "000011-submitted-creator.json",
  "000012-applied-creator.json",
  "000013-pin-creator.json",
  "000014-public_reveal_prepared-creator.json",
  "000015-pin-creator.json",
  "000016-pin-creator.json",
  "000017-prepared-creator.json",
  "000018-submitted-creator.json",
  "000019-applied-creator.json",
  "000020-prepared-creator.json",
  "000021-submitted-creator.json",
  "000022-applied-creator.json",
  "000023-prepared-creator.json",
  "000024-submitted-creator.json",
  "000025-applied-creator.json",
  "000026-prepared-creator.json",
  "000027-submitted-creator.json",
  "000028-applied-creator.json",
  "000029-prepared-creator.json",
  "000030-submitted-creator.json",
  "000031-applied-creator.json",
  "000032-pin-creator.json",
  "000033-prepared-creator.json",
  "000034-submitted-creator.json",
  "000035-applied-creator.json",
  "000036-pin-creator.json",
  "000037-pin-creator.json",
] as const);

const PIN_NAMES = Object.freeze([
  "000001.bin",
  "000002.bin",
  "000003.bin",
  "000004.bin",
  "000005.bin",
  "000006.bin",
  "000007.bin",
  "000008.bin",
  "000009.bin",
] as const);

const CURRENT_V3_SCREENSHOTS = Object.freeze([
  Object.freeze({
    stem: "001-compose-five-atomic-pack-modes-same-run-dependencies-entered",
    pngSha256: "94d9ea8f9bdcfb39042aba7cd040febc56eba9977f59e739ebf1d6a6e7764a82",
    sidecarSha256: "87bcffb05e5cec4fc568e947783cbe920ea44f033b14e294cb3119fe7ff97f22",
  }),
  Object.freeze({
    stem: "002-compose-five-atomic-pack-modes-creator-connected-on-shadownet",
    pngSha256: "9be6837c865cf4aeeb7c35a9efc2958c50d78474ced764103a82c51b45fee399",
    sidecarSha256: "8d845335152450c2fc0db48cc93de80ec2b39c2e5b94a1ff245bdc982d05a166",
  }),
  Object.freeze({
    stem: "003-limited-edition-expiry-deconfliction-le-wrapper-outliving-child-rejected-before-pins-or-writes",
    pngSha256: "bb01f2dcab3c16c5750bf906e62911a4d055147b5cb6f45fd2a55a72de85bb9c",
    sidecarSha256: "07e3fd68984d038a623bd15a7b2795b93d34395b2634bc7646e684f8a1bb0acd",
  }),
  Object.freeze({
    stem: "004-compose-five-atomic-pack-modes-deterministic-vault-configured",
    pngSha256: "1e2f7c8677a0586e31166c8cf3678c0a798d8891e92410b6a6714fa6b45172ec",
    sidecarSha256: "3e2caee366c6d367429f1de6d760e18fe4e4c525e06fdfc28b49726cfbcea5b6",
  }),
  Object.freeze({
    stem: "005-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued",
    pngSha256: "a32481ba31e3a5fce3767541ec3fc27f008182da9e83140e575442d85b33c639",
    sidecarSha256: "c20483f6ee961eb22853458199857eb06007692ce43fe77e9e1d9ed81550cd19",
  }),
  Object.freeze({
    stem: "006-compose-five-atomic-pack-modes-blind-funded-pool-configured",
    pngSha256: "5c5a142188d63d99907ee698be29f61db18b26d31738395a9a7ac8578976a0e3",
    sidecarSha256: "17d7b00389e71bef4a01a0b1bd82d1736d1dc2ba92a429d702a65ff3d9972734",
  }),
] as const);

const OPEN_KIT_NAME = "ravioli-open-kit-0.json";
const OPEN_KIT_SHA256 = "6b956fa9b8722b98f367f92bc4cad43f158c00f98c4b20ae11e8971ee78a2ff1";
const OPEN_KIT_PROGRESS_NAME = "open-kit-capture-progress.json";
const OPEN_KIT_PROGRESS_SHA256 = "0c2167bcd7f44ac08eff3e35c6447112a5458b570010908d2b4fc4276d05e7e7";

export const RAVIOLI_CURRENT_V3_PRE_RESTART_FILE_COUNT = 61;

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
] as const);

const PIN_EVENT_INDEXES = Object.freeze([0, 1, 2, 12, 14, 15, 31, 35, 36] as const);
const OPERATION_EVENT_INDEXES = Object.freeze([3, 6, 9, 16, 19, 22, 25, 28, 32] as const);

type JsonRecord = Record<string, any>;

export type RavioliCurrentV3PinDisposition = "ACTIVE" | "SUPERSEDED_PRIVATE_PRECOMMIT";

export type RavioliCurrentV3PinIdentity = Readonly<RavioliCurrentV2PinIdentity & {
  disposition: RavioliCurrentV3PinDisposition;
  supersededReason?: string;
}>;

export type RavioliCurrentV3OperationIdentity = RavioliCurrentV2OperationIdentity;

const SUPERSEDED_REASON =
  "Mode-1 private preimage/open-kit material was not durably captured before interruption; this pin is audit evidence only and is not referenced on-chain.";

const CURRENT_V3_PINS = Object.freeze([
  ...RAVIOLI_CURRENT_V2_RESUME_IDENTITY.pins.map((pin) => Object.freeze({
    ...pin,
    disposition: "ACTIVE" as const,
  })),
  Object.freeze({
    kind: "wrapper" as const,
    disposition: "ACTIVE" as const,
    pinSequence: 7,
    cid: "bafkreidolkumbkrtfamcbfmzodwognixhm3yd7ps6tkxl2de5ozlwb3hmi",
    uri: "ipfs://bafkreidolkumbkrtfamcbfmzodwognixhm3yd7ps6tkxl2de5ozlwb3hmi",
    fileName: "ravioli-wrapper-1.png",
    mimeType: "image/png",
    byteLength: 93,
    sha256: "6e5aa8c0aa33281820959970ece335173b3781fdf2f4d575e864ebb2bb076762",
  }),
  Object.freeze({
    kind: "mode0-manifest" as const,
    disposition: "SUPERSEDED_PRIVATE_PRECOMMIT" as const,
    supersededReason: SUPERSEDED_REASON,
    pinSequence: 8,
    cid: "bafkreiej26526d3eqrnd6ih3abvl6ajnvjh5muts2wyjerzrnpcmacb5wu",
    uri: "ipfs://bafkreiej26526d3eqrnd6ih3abvl6ajnvjh5muts2wyjerzrnpcmacb5wu",
    fileName: "ravioli-pack-manifest.json",
    mimeType: "application/json",
    byteLength: 1_047,
    sha256: "89d7bbaf0f64845a3f20fb006abf012daa4fd65272d5b09247316bc4c0083db5",
  }),
  Object.freeze({
    kind: "mode0-public-reveal" as const,
    disposition: "SUPERSEDED_PRIVATE_PRECOMMIT" as const,
    supersededReason: SUPERSEDED_REASON,
    pinSequence: 9,
    cid: "bafkreice4djom4bwdqmjj4kohpqpxovm5fbud4q4rbedni4ej3kv2vshce",
    uri: "ipfs://bafkreice4djom4bwdqmjj4kohpqpxovm5fbud4q4rbedni4ej3kv2vshce",
    fileName: "ravioli-sealed-reveal-1.json",
    mimeType: "application/json",
    byteLength: 2_533,
    sha256: "44e0d2e670361c1894f14e3be0fbbaace94341f21c884836a3844ed55d564711",
  }),
] satisfies readonly RavioliCurrentV3PinIdentity[]);

const OPERATION_NINE = Object.freeze({
  globalOrdinal: 9,
  action: "call" as const,
  targetRole: "gnocchi" as const,
  contractAddress: "KT1ShvgCuQZAKWTUFeCQZphNcn1y6Bi7LyYi",
  entrypoints: Object.freeze(["update_operators"]) as readonly string[],
  descriptorSha256: "bd81403364251349a8072b66056020548cef80f2769465e3a5eafc4822efea82",
  operationHash: "onhP2YFTpzcpg66wPz1j2aX93dSwqeb6J1zJfaN4qCUFxrGZ62L",
  counter: 23_831_517,
  level: 4_321_347,
  timestamp: "2026-07-23T23:41:54Z",
}) satisfies RavioliCurrentV3OperationIdentity;

const CURRENT_V3_OPERATIONS = Object.freeze([
  ...RAVIOLI_CURRENT_V2_RESUME_IDENTITY.operations,
  OPERATION_NINE,
] satisfies readonly RavioliCurrentV3OperationIdentity[]);

export const RAVIOLI_CURRENT_V3_RESTART_IDENTITY = Object.freeze({
  ...RAVIOLI_CURRENT_V2_RESUME_IDENTITY,
  finalEventSha256: "2e8e6bb8f61c5163c9ea64fc67035b204e457bd88a2144c49d6b47dd077f8391",
  pins: CURRENT_V3_PINS,
  operations: CURRENT_V3_OPERATIONS,
  screenshots: CURRENT_V3_SCREENSHOTS,
  openKitSha256: OPEN_KIT_SHA256,
  openKitProgressSha256: OPEN_KIT_PROGRESS_SHA256,
});

export type RavioliCurrentV3PinRecord = Readonly<{
  identity: RavioliCurrentV3PinIdentity;
  eventPath: string;
  artifactPath: string;
  bytes: Uint8Array;
  value?: unknown;
  proof: PastaUiLivePinProof;
}>;

export type RavioliCurrentV3OperationRecord = Readonly<{
  identity: RavioliCurrentV3OperationIdentity;
  descriptor: PastaUiLiveOperationDescriptor;
  receipt: PastaUiLivePublicReceipt;
}>;

export type RavioliCurrentV3Restart = Readonly<{
  appRoot: string;
  journalRoot: string;
  journalPrefixComplete: true;
  preRestartFileCount: typeof RAVIOLI_CURRENT_V3_PRE_RESTART_FILE_COUNT;
  controllerAddress: string;
  routerAddress: string;
  operatorApprovalLevel: number;
  journalPins: readonly RavioliCurrentV3PinRecord[];
  activePins: readonly RavioliCurrentV3PinRecord[];
  supersededPrecommitPins: readonly RavioliCurrentV3PinRecord[];
  operations: readonly RavioliCurrentV3OperationRecord[];
  writeReceipts: readonly PastaUiLivePublicReceipt[];
  identity: typeof RAVIOLI_CURRENT_V3_RESTART_IDENTITY;
}>;

export type LoadRavioliCurrentV3RestartInput = {
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

export type RavioliCurrentV3FreshRestartContext = Readonly<{
  manifest: { value: JsonRecord; bytes: Uint8Array; proof: PastaUiLivePinProof };
  envelope: { value: JsonRecord; bytes: Uint8Array; proof: PastaUiLivePinProof };
  tokenMetadata: { value: JsonRecord; bytes: Uint8Array; proof: PastaUiLivePinProof };
  operationTen: Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>;
}>;

export type RavioliCurrentV3RestartInterceptor = {
  handle: PastaUiLiveBridgeHandler;
  isReplayComplete(): boolean;
  getCompletedReplayStepCount(): number;
  getRemainingReplayStepCount(): number;
  continuationStage():
    | "replay-prefix"
    | "fresh-mode1-manifest"
    | "fresh-mode1-envelope"
    | "fresh-mode1-token"
    | "matrix-operation-10"
    | "continued";
  freshRestartContext(): RavioliCurrentV3FreshRestartContext | null;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message: string): never {
  throw new Error(`Ravioli current-v3 restart: ${message}`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value as JsonRecord;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) fail(`${label} drift`);
}

function exactJson(value: unknown, expected: unknown, label: string): void {
  if (!Buffer.from(deterministicJsonBytes(value)).equals(Buffer.from(deterministicJsonBytes(expected)))) {
    fail(`${label} drift`);
  }
}

function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void {
  exactJson(Object.keys(value).sort(), [...expected].sort(), `${label} fields`);
}

async function assertRegularFile(filePath: string, label: string): Promise<void> {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
}

async function assertRealDirectory(directoryPath: string, label: string): Promise<void> {
  const info = await lstat(directoryPath);
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} must be a real non-symlink directory`);
}

async function assertDirectoryInventory(
  directoryPath: string,
  expectedNames: readonly string[],
  label: string,
): Promise<void> {
  await assertRealDirectory(directoryPath, label);
  exactJson((await readdir(directoryPath)).sort(), [...expectedNames].sort(), `${label} inventory`);
}

async function assertFileSha256(
  filePath: string,
  expectedSha256: string,
  label: string,
): Promise<void> {
  await assertRegularFile(filePath, label);
  exact(sha256(await readFile(filePath)), expectedSha256, `${label} hash`);
}

async function authenticatePreRestartTree(journalRoot: string): Promise<{
  appRoot: string;
  fileCount: typeof RAVIOLI_CURRENT_V3_PRE_RESTART_FILE_COUNT;
}> {
  exact(path.basename(journalRoot), "journal", "journal lane directory name");
  const artifactsRoot = path.dirname(journalRoot);
  exact(path.basename(artifactsRoot), "artifacts", "artifact lane directory name");
  const appRoot = path.dirname(artifactsRoot);
  exact(path.basename(appRoot), "ravioli", "app lane directory name");

  const screenshotNames = CURRENT_V3_SCREENSHOTS.map(({ stem }) => `${stem}.png`);
  const sidecarNames = CURRENT_V3_SCREENSHOTS.map(({ stem }) => `screenshot-${stem}.json`);
  const openKitRoot = path.join(artifactsRoot, "open-kits");
  const retainedPinRoot = path.join(artifactsRoot, "pins");
  const eventRoot = path.join(journalRoot, "events");
  const journalPinRoot = path.join(journalRoot, "pins");

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
    assertDirectoryInventory(openKitRoot, [OPEN_KIT_PROGRESS_NAME, OPEN_KIT_NAME], "Ravioli open-kit lane"),
    assertDirectoryInventory(retainedPinRoot, [], "Ravioli retained-pin lane"),
    assertDirectoryInventory(path.join(appRoot, "screenshots"), screenshotNames, "Ravioli screenshot lane"),
  ]);

  await Promise.all([
    ...CURRENT_V3_SCREENSHOTS.flatMap(({ stem, pngSha256, sidecarSha256 }) => [
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
      path.join(openKitRoot, OPEN_KIT_NAME),
      OPEN_KIT_SHA256,
      "retained mode-0 open kit",
    ),
    assertFileSha256(
      path.join(openKitRoot, OPEN_KIT_PROGRESS_NAME),
      OPEN_KIT_PROGRESS_SHA256,
      "open-kit capture progress",
    ),
  ]);

  const fileCount = 1
    + EVENT_NAMES.length
    + PIN_NAMES.length
    + (CURRENT_V3_SCREENSHOTS.length * 2)
    + 2;
  exact(fileCount, RAVIOLI_CURRENT_V3_PRE_RESTART_FILE_COUNT, "pre-restart file count");
  return {
    appRoot,
    fileCount: RAVIOLI_CURRENT_V3_PRE_RESTART_FILE_COUNT,
  };
}

async function canonicalJsonFile(filePath: string, label: string): Promise<{
  value: JsonRecord;
  bytes: Uint8Array;
  sha256: string;
}> {
  await assertRegularFile(filePath, label);
  const bytes = await readFile(filePath);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not JSON`);
  }
  if (!Buffer.from(bytes).equals(Buffer.from(deterministicJsonBytes(value)))) {
    fail(`${label} bytes are not canonical`);
  }
  return { value: record(value, label), bytes, sha256: sha256(bytes) };
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

function pinBlobFingerprint(request: PastaUiLiveBridgeRequest): string {
  const payload = record(request.payload, "pin_blob payload");
  exactKeys(payload, ["dataBase64", "fileName", "mimeType"], "pin_blob payload");
  const bytes = canonicalBase64(payload.dataBase64, "pin_blob data");
  return `pin_blob:${String(payload.fileName)}:${String(payload.mimeType)}:${sha256(bytes)}:${bytes.byteLength}`;
}

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
  const bytes = deterministicJsonBytes(value);
  return {
    fileName,
    value,
    bytes,
    fingerprint: `pin_json:${fileName}:${sha256(bytes)}:${bytes.byteLength}`,
  };
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
      sendOptions: decodePastaUiLiveValue(payload.sendOptions),
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

function assertPin(
  event: JsonRecord,
  bytes: Uint8Array,
  identity: RavioliCurrentV3PinIdentity,
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">,
): PastaUiLivePinProof {
  exact(event.phase, "PIN", `pin ${identity.pinSequence} phase`);
  exact(event.pinSequence, identity.pinSequence, `pin ${identity.pinSequence} sequence`);
  const artifact = record(event.artifact, `pin ${identity.pinSequence} artifact`);
  exact(artifact.path, `pins/${String(identity.pinSequence).padStart(6, "0")}.bin`, `pin ${identity.pinSequence} path`);
  exact(artifact.fileName, identity.fileName, `pin ${identity.pinSequence} file`);
  exact(artifact.mimeType, identity.mimeType, `pin ${identity.pinSequence} MIME`);
  exact(artifact.byteLength, identity.byteLength, `pin ${identity.pinSequence} length`);
  exact(artifact.sha256, identity.sha256, `pin ${identity.pinSequence} checkpoint`);
  exact(bytes.byteLength, identity.byteLength, `pin ${identity.pinSequence} exact length`);
  exact(sha256(bytes), identity.sha256, `pin ${identity.pinSequence} exact hash`);
  const metadata = record(event.metadata, `pin ${identity.pinSequence} metadata`);
  exact(metadata.cid, identity.cid, `pin ${identity.pinSequence} CID`);
  exact(metadata.uri, identity.uri, `pin ${identity.pinSequence} URI`);
  exact(metadata.publicGatewayUrl, ipfsGatewayUrl(ipfs.publicGatewayUrl, identity.cid), `pin ${identity.pinSequence} gateway`);
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

function writeReceipt(operation: RavioliCurrentV3OperationIdentity): PastaUiLivePublicReceipt {
  return {
    schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
    sequence: operation.globalOrdinal,
    timestampUtc: operation.timestamp,
    action: operation.action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: RAVIOLI_CURRENT_V3_RESTART_IDENTITY.creatorAddress,
    contractAddress: operation.contractAddress,
    operationHash: operation.operationHash,
    entrypoints: [...operation.entrypoints],
  };
}

function validateOperatorNinePayload(payload: unknown): void {
  exactJson(payload, [0, 1].map((tokenId) => ({
    add_operator: {
      owner: RAVIOLI_CURRENT_V3_RESTART_IDENTITY.creatorAddress,
      operator: RAVIOLI_CURRENT_V3_RESTART_IDENTITY.routerAddress,
      token_id: tokenId,
    },
  })), "operation 9 operator payload");
}

function validateOperationEvents(
  events: readonly { value: JsonRecord; sha256: string }[],
  startIndex: number,
  operation: RavioliCurrentV3OperationIdentity,
): RavioliCurrentV3OperationRecord {
  const prepared = events[startIndex].value;
  const submitted = events[startIndex + 1].value;
  const applied = events[startIndex + 2].value;
  exact(prepared.phase, "PREPARED", `operation ${operation.globalOrdinal} PREPARED`);
  exact(prepared.globalOrdinal, operation.globalOrdinal, `operation ${operation.globalOrdinal} ordinal`);
  exact(prepared.operationSequence, operation.globalOrdinal, `operation ${operation.globalOrdinal} sequence`);
  exact(prepared.descriptorSha256, operation.descriptorSha256, `operation ${operation.globalOrdinal} descriptor`);
  const preparedOperation = record(prepared.operation, `operation ${operation.globalOrdinal} prepared operation`);
  exact(preparedOperation.status, "PREPARED", `operation ${operation.globalOrdinal} prepared status`);
  exact(preparedOperation.operationSequence, operation.globalOrdinal, `operation ${operation.globalOrdinal} persisted sequence`);
  exact(preparedOperation.chainId, SHADOWNET_CHAIN_ID, `operation ${operation.globalOrdinal} chain`);
  exact(preparedOperation.signerAddress, RAVIOLI_CURRENT_V3_RESTART_IDENTITY.creatorAddress, `operation ${operation.globalOrdinal} signer`);
  exact(preparedOperation.action, operation.action, `operation ${operation.globalOrdinal} action`);
  exactJson(preparedOperation.entrypoints, operation.entrypoints, `operation ${operation.globalOrdinal} entrypoints`);
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
    if (operation.globalOrdinal === 9) {
      exactJson(call.sendOptions, {}, "operation 9 send options");
      validateOperatorNinePayload(call.call.payload);
    }
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
  exact(evidence.signerAddress, RAVIOLI_CURRENT_V3_RESTART_IDENTITY.creatorAddress, `operation ${operation.globalOrdinal} evidence signer`);
  exact(evidence.contractAddress, operation.contractAddress, `operation ${operation.globalOrdinal} evidence target`);
  exact(evidence.counter, operation.counter, `operation ${operation.globalOrdinal} evidence counter`);
  exact(
    evidence.counter,
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.creatorBaseCounter + operation.globalOrdinal,
    `operation ${operation.globalOrdinal} derived counter`,
  );
  exact(evidence.level, operation.level, `operation ${operation.globalOrdinal} evidence level`);
  exact(evidence.timestamp, operation.timestamp, `operation ${operation.globalOrdinal} evidence timestamp`);
  exactJson(evidence.entrypoints, operation.entrypoints, `operation ${operation.globalOrdinal} evidence entrypoints`);
  exact(evidence.explorerUrl, `https://shadownet.tzkt.io/${operation.operationHash}`, `operation ${operation.globalOrdinal} explorer`);
  if (validateOperation(operation.operationHash) !== ValidationResult.VALID) {
    fail(`operation ${operation.globalOrdinal} hash is invalid`);
  }
  if (validateContractAddress(operation.contractAddress) !== ValidationResult.VALID) {
    fail(`operation ${operation.globalOrdinal} target is invalid`);
  }
  return Object.freeze({ identity: operation, descriptor, receipt: writeReceipt(operation) });
}

function validateSupersededManifest(value: JsonRecord): void {
  exact(value.schemaVersion, "wtfos.pasta.pack-manifest.v2", "superseded manifest schema");
  exact(value.mode, "blind_funded_pool", "superseded manifest mode");
  exact(value.maxSupply, 3, "superseded manifest supply");
  exact(value.itemCount, 1, "superseded manifest item count");
  exact(value.mystery, true, "superseded manifest mystery policy");
  exactJson(value.members, [], "superseded manifest members");
  const edition = record(value.editionPolicy, "superseded manifest edition policy");
  exact(edition.wrapperSaleEnd, "2026-07-23T23:53:00.000Z", "superseded sale end");
  exact(edition.revealDeadline, "2026-07-24T00:53:00.000Z", "superseded reveal deadline");
  exact(edition.openDeadline, "2026-07-24T01:53:00.000Z", "superseded open deadline");
}

function validateSupersededEnvelope(value: JsonRecord): void {
  exactKeys(value, ["aad", "cipher", "ciphertext", "iv", "keyDerivation", "schema"], "superseded envelope");
  exact(value.schema, "pasta-ravioli-sealed-reveal@1", "superseded envelope schema");
  exact(value.cipher, "AES-256-GCM", "superseded envelope cipher");
  exact(
    value.keyDerivation,
    "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    "superseded envelope KDF",
  );
  const aad = record(value.aad, "superseded envelope AAD");
  exactJson(aad, {
    contract: RAVIOLI_CURRENT_V3_RESTART_IDENTITY.routerAddress,
    manifestUri: CURRENT_V3_PINS[7].uri,
    network: "shadownet",
    schema: "pasta-ravioli-sealed-reveal@1",
    tokenId: 1,
  }, "superseded envelope AAD");
  exact(canonicalBase64(value.iv, "superseded envelope IV").byteLength, 12, "superseded envelope IV length");
  if (canonicalBase64(value.ciphertext, "superseded envelope ciphertext").byteLength <= 16) {
    fail("superseded envelope ciphertext is too short");
  }
}

export async function loadRavioliCurrentV3Restart(
  input: LoadRavioliCurrentV3RestartInput,
): Promise<RavioliCurrentV3Restart> {
  const identity = RAVIOLI_CURRENT_V3_RESTART_IDENTITY;
  if (input.journal.isFinalized()) fail("the exact restart boundary must remain unfinalized");
  if (input.journal.getCompletedOperationCount() !== 9) {
    fail("the exact restart boundary must contain nine APPLIED creator operations");
  }
  const root = path.resolve(input.journal.journalRoot);
  const preRestartTree = await authenticatePreRestartTree(root);
  const intentFile = await canonicalJsonFile(path.join(root, "intent.json"), "journal intent");
  exact(intentFile.sha256, identity.intentSha256, "journal intent hash");
  const intent = intentFile.value;
  exact(intent.schema, RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA, "journal intent schema");
  exact(intent.status, "IMMUTABLE", "journal intent status");
  exact(intent.journalId, identity.journalId, "journal id");
  exact(intent.createdAt, identity.createdAt, "journal creation time");
  exactJson(intent.network, { chainId: SHADOWNET_CHAIN_ID, name: "shadownet" }, "journal network");
  exact(intent.matrixSha256, identity.matrixSha256, "journal matrix hash");
  exactJson(intent.matrix, RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX, "journal fixed matrix");
  exactJson((intent.matrix as unknown[]).slice(0, 9), RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.slice(0, 9), "completed matrix prefix");
  exactJson((intent.matrix as unknown[])[9], RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[9], "next matrix operation");
  exactJson(intent.dependencyAddresses, {
    gnocchi: identity.gnocchiAddress,
    rotini: identity.rotiniAddress,
  }, "journal dependencies");
  exactJson(input.expected.dependencyAddresses, intent.dependencyAddresses, "current dependencies");
  const { tzktBaseline, ...stableDependencyHashes } = record(intent.dependencyHashes, "journal dependency hashes");
  if (typeof tzktBaseline !== "string" || !HASH_RE.test(tzktBaseline)) fail("journal TzKT baseline hash is invalid");
  exactJson(stableDependencyHashes, input.expected.dependencyHashes, "current dependency hashes");
  exactJson(intent.artifactHashes, identity.artifactHashes, "journal artifact identity");
  exactJson(input.expected.artifactHashes, identity.artifactHashes, "current artifact identity");
  exact(hashJsonForBridge(input.expected.controllerArtifact), identity.artifactHashes.blindController, "current controller artifact");
  exact(hashJsonForBridge(input.expected.routerArtifact), identity.artifactHashes.router, "current router artifact");
  const actors = record(intent.actors, "journal actors");
  for (const [name, address, counter] of [
    ["creator", identity.creatorAddress, identity.creatorBaseCounter],
    ["collector1", identity.collectorOneAddress, identity.collectorOneBaseCounter],
    ["collector2", identity.collectorTwoAddress, identity.collectorTwoBaseCounter],
  ] as const) {
    const actor = record(actors[name], `${name} actor`);
    exact(actor.signerAddress, address, `${name} signer`);
    exact(record(actor.counters, `${name} counters`).primary.counter, counter, `${name} primary counter`);
    exact(record(actor.counters, `${name} counters`).fallback.counter, counter, `${name} fallback counter`);
  }
  exact(input.expected.creatorAddress, identity.creatorAddress, "requested creator");
  exact(input.expected.collectorOneAddress, identity.collectorOneAddress, "requested collector one");
  exact(input.expected.collectorTwoAddress, identity.collectorTwoAddress, "requested collector two");

  const eventDirectory = path.join(root, "events");
  const pinDirectory = path.join(root, "pins");
  const [eventDirectoryInfo, pinDirectoryInfo] = await Promise.all([
    lstat(eventDirectory),
    lstat(pinDirectory),
  ]);
  if (!eventDirectoryInfo.isDirectory() || eventDirectoryInfo.isSymbolicLink()) fail("event lane must be a real directory");
  if (!pinDirectoryInfo.isDirectory() || pinDirectoryInfo.isSymbolicLink()) fail("pin lane must be a real directory");
  exactJson((await readdir(eventDirectory)).sort(), EVENT_NAMES, "37-event current-v3 filenames");
  exactJson((await readdir(pinDirectory)).sort(), PIN_NAMES, "nine-pin current-v3 filenames");
  const events = await Promise.all(EVENT_NAMES.map((name, index) =>
    canonicalJsonFile(path.join(eventDirectory, name), `event ${index + 1}`)));
  const pins = await Promise.all(PIN_NAMES.map(async (name, index) => {
    const filePath = path.join(pinDirectory, name);
    await assertRegularFile(filePath, `pin ${index + 1}`);
    return readFile(filePath);
  }));
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
  exact(events.at(-1)?.sha256, identity.finalEventSha256, "current-v3 journal head");

  const journalPins: RavioliCurrentV3PinRecord[] = [];
  for (let index = 0; index < identity.pins.length; index += 1) {
    const pinIdentity = identity.pins[index];
    const eventIndex = PIN_EVENT_INDEXES[index];
    const proof = assertPin(events[eventIndex].value, pins[index], pinIdentity, input.ipfs);
    const value = pinIdentity.mimeType === "application/json"
      ? parseCanonicalJson(pins[index], `pin ${pinIdentity.pinSequence}`)
      : undefined;
    journalPins.push(Object.freeze({
      identity: pinIdentity,
      eventPath: `events/${EVENT_NAMES[eventIndex]}`,
      artifactPath: `pins/${PIN_NAMES[index]}`,
      bytes: Uint8Array.from(pins[index]),
      ...(value !== undefined ? { value } : {}),
      proof,
    }));
  }
  validateSupersededManifest(record(journalPins[7].value, "superseded manifest"));
  validateSupersededEnvelope(record(journalPins[8].value, "superseded envelope"));

  const operations = identity.operations.map((operation, index) =>
    validateOperationEvents(events, OPERATION_EVENT_INDEXES[index], operation));
  const activePins = journalPins.filter((pin) => pin.identity.disposition === "ACTIVE");
  const supersededPrecommitPins = journalPins.filter(
    (pin) => pin.identity.disposition === "SUPERSEDED_PRIVATE_PRECOMMIT",
  );
  exact(activePins.length, 7, "active pin partition");
  exact(supersededPrecommitPins.length, 2, "superseded pin partition");
  exact(activePins.length + supersededPrecommitPins.length, journalPins.length, "pin partition coverage");
  return Object.freeze({
    appRoot: preRestartTree.appRoot,
    journalRoot: root,
    journalPrefixComplete: true,
    preRestartFileCount: preRestartTree.fileCount,
    controllerAddress: identity.controllerAddress,
    routerAddress: identity.routerAddress,
    operatorApprovalLevel: OPERATION_NINE.level,
    journalPins: Object.freeze(journalPins),
    activePins: Object.freeze(activePins),
    supersededPrecommitPins: Object.freeze(supersededPrecommitPins),
    operations: Object.freeze(operations),
    writeReceipts: Object.freeze(operations.map((operation) => operation.receipt)),
    identity,
  });
}

type ReplayStep = Readonly<{
  action: "pin_blob" | "pin_json" | "originate" | "call";
  fingerprint: string;
  respond(): unknown;
}>;

function replayPinStep(pin: RavioliCurrentV3PinRecord): ReplayStep {
  const action = pin.identity.mimeType === "application/json" ? "pin_json" : "pin_blob";
  const fingerprint = action === "pin_json"
    ? `pin_json:${pin.proof.fileName}:${pin.proof.sha256}:${pin.proof.byteLength}`
    : `pin_blob:${pin.proof.fileName}:${pin.proof.mimeType}:${pin.proof.sha256}:${pin.proof.byteLength}`;
  return Object.freeze({ action, fingerprint, respond: () => ({ pin: pin.proof }) });
}

function replayOperationStep(operation: RavioliCurrentV3OperationRecord): ReplayStep {
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

function assertFreshPinProof(
  response: unknown,
  expected: { fileName: string; mimeType: string; bytes: Uint8Array },
): PastaUiLivePinProof {
  const proof = record(record(response, "pin response").pin, "pin response proof");
  exact(proof.fileName, expected.fileName, `${expected.fileName} response file`);
  exact(proof.mimeType, expected.mimeType, `${expected.fileName} response MIME`);
  exact(proof.byteLength, expected.bytes.byteLength, `${expected.fileName} response length`);
  exact(proof.sha256, sha256(expected.bytes), `${expected.fileName} response hash`);
  if (typeof proof.cid !== "string" || !proof.cid.length) fail(`${expected.fileName} response CID is invalid`);
  exact(proof.uri, `ipfs://${proof.cid}`, `${expected.fileName} response URI`);
  if (typeof proof.localGatewayUrl !== "string" || typeof proof.publicGatewayUrl !== "string") {
    fail(`${expected.fileName} response gateways are invalid`);
  }
  exact(proof.publicGatewayVerified, true, `${expected.fileName} public verification`);
  if (!Number.isSafeInteger(proof.verificationAttempts) || proof.verificationAttempts < 1) {
    fail(`${expected.fileName} verification attempts are invalid`);
  }
  return proof as PastaUiLivePinProof;
}

function freshManifest(
  request: PastaUiLiveBridgeRequest,
  nowMs: number,
  minimumSaleWindowMs: number,
): { value: JsonRecord; bytes: Uint8Array } {
  exact(request.action, "pin_json", "first fresh action");
  const parsed = pinJsonRequest(request);
  exact(parsed.fileName, "ravioli-pack-manifest.json", "fresh manifest file");
  if (sha256(parsed.bytes) === CURRENT_V3_PINS[7].sha256) fail("refusing superseded mode-1 manifest bytes");
  const value = parsed.value;
  exact(value.schemaVersion, "wtfos.pasta.pack-manifest.v2", "fresh manifest schema");
  exact(value.mode, "blind_funded_pool", "fresh manifest mode");
  exact(value.maxSupply, 3, "fresh manifest supply");
  exact(value.itemCount, 1, "fresh manifest item count");
  exact(value.mystery, true, "fresh manifest mystery policy");
  exactJson(value.members, [], "fresh manifest public members");
  exact(value.assignmentPolicy, "precommitted-salted-cyclic-rotation", "fresh manifest assignment");
  exact(value.blindSecurity, "commit-reveal-ui-hidden-chain-public", "fresh manifest blind security");
  const edition = record(value.editionPolicy, "fresh manifest edition policy");
  exact(edition.wrapperEditionClass, "limited-edition", "fresh wrapper edition class");
  exact(edition.requiresLimitedWrapper, false, "fresh child LE requirement");
  exact(edition.earliestChildEnd, null, "fresh earliest child end");
  const saleEnd = Date.parse(String(edition.wrapperSaleEnd));
  const revealDeadline = Date.parse(String(edition.revealDeadline));
  const openDeadline = Date.parse(String(edition.openDeadline));
  if (![saleEnd, revealDeadline, openDeadline].every(Number.isFinite)) fail("fresh manifest deadlines are invalid");
  if (!(saleEnd >= nowMs + minimumSaleWindowMs)) fail("fresh manifest sale window has insufficient runway");
  if (!(saleEnd < revealDeadline && revealDeadline < openDeadline)) fail("fresh manifest deadline order is invalid");
  return { value, bytes: parsed.bytes };
}

function freshEnvelope(
  request: PastaUiLiveBridgeRequest,
  manifest: { proof: PastaUiLivePinProof },
): { value: JsonRecord; bytes: Uint8Array } {
  exact(request.action, "pin_json", "fresh envelope action");
  const parsed = pinJsonRequest(request);
  exact(parsed.fileName, "ravioli-sealed-reveal-1.json", "fresh envelope file");
  if (sha256(parsed.bytes) === CURRENT_V3_PINS[8].sha256) fail("refusing superseded mode-1 envelope bytes");
  const value = parsed.value;
  exactKeys(value, ["aad", "cipher", "ciphertext", "iv", "keyDerivation", "schema"], "fresh envelope");
  exact(value.schema, "pasta-ravioli-sealed-reveal@1", "fresh envelope schema");
  exact(value.cipher, "AES-256-GCM", "fresh envelope cipher");
  exact(
    value.keyDerivation,
    "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    "fresh envelope KDF",
  );
  exactJson(record(value.aad, "fresh envelope AAD"), {
    contract: RAVIOLI_CURRENT_V3_RESTART_IDENTITY.routerAddress,
    manifestUri: manifest.proof.uri,
    network: "shadownet",
    schema: "pasta-ravioli-sealed-reveal@1",
    tokenId: 1,
  }, "fresh envelope AAD");
  exact(canonicalBase64(value.iv, "fresh envelope IV").byteLength, 12, "fresh envelope IV length");
  if (canonicalBase64(value.ciphertext, "fresh envelope ciphertext").byteLength <= 16) {
    fail("fresh envelope ciphertext is too short");
  }
  return { value, bytes: parsed.bytes };
}

function freshTokenMetadata(
  request: PastaUiLiveBridgeRequest,
  replay: RavioliCurrentV3Restart,
  manifest: { proof: PastaUiLivePinProof },
  envelope: { proof: PastaUiLivePinProof },
): { value: JsonRecord; bytes: Uint8Array } {
  exact(request.action, "pin_json", "fresh token action");
  const parsed = pinJsonRequest(request);
  exact(parsed.fileName, "token.json", "fresh token file");
  const value = parsed.value;
  const wrapperUri = replay.activePins[6].proof.uri;
  exact(value.artifactUri, wrapperUri, "fresh token artifact URI");
  exact(value.displayUri, wrapperUri, "fresh token display URI");
  exact(value.thumbnailUri, wrapperUri, "fresh token thumbnail URI");
  exact(value.name, "Ravioli UI-LIVE Blind Funded Pool", "fresh token name");
  exact(value.minter, replay.identity.creatorAddress, "fresh token minter");
  exactJson(value.creators, [replay.identity.creatorAddress], "fresh token creators");
  const ravioli = record(value.ravioli, "fresh token Ravioli policy");
  exact(ravioli.version, 3, "fresh token Ravioli version");
  exact(ravioli.mode, "blind_funded_pool", "fresh token mode");
  exact(ravioli.itemCount, 1, "fresh token item count");
  exact(ravioli.maxSupply, 3, "fresh token supply");
  exact(ravioli.manifestUri, manifest.proof.uri, "fresh token manifest URI");
  exact(ravioli.sealedContentsUri, envelope.proof.uri, "fresh token envelope URI");
  if (typeof ravioli.revealCommitment !== "string" || !HASH_RE.test(ravioli.revealCommitment)) {
    fail("fresh token reveal commitment is invalid");
  }
  return { value, bytes: parsed.bytes };
}

function mapValue(value: unknown, key: string, label: string): unknown {
  if (value && typeof value === "object" && typeof (value as { get?: unknown }).get === "function") {
    return (value as { get(value: string): unknown }).get(key);
  }
  const source = record(value, label);
  if (!Array.isArray(source.$map)) fail(`${label} is not an encoded map`);
  const entry = source.$map.find(
    (candidate: unknown) => Array.isArray(candidate) && candidate.length === 2 && candidate[0] === key,
  );
  if (!entry) fail(`${label} is missing ${key}`);
  return entry[1];
}

function operationTen(
  request: PastaUiLiveBridgeRequest,
  context: Omit<RavioliCurrentV3FreshRestartContext, "operationTen">,
): Extract<PastaUiLiveOperationDescriptor, { kind: "call" }> {
  exact(request.action, "call", "matrix operation 10 action");
  const descriptor = operationDescriptor(request);
  exact(descriptor.kind, "call", "matrix operation 10 descriptor kind");
  const call = descriptor as Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>;
  exactJson(call.sendOptions, {}, "matrix operation 10 send options");
  exact(call.call.contractAddress, RAVIOLI_CURRENT_V3_RESTART_IDENTITY.routerAddress, "matrix operation 10 target");
  exact(call.call.entrypoint, "create_pack", "matrix operation 10 entrypoint");
  const payload = record(call.call.payload, "matrix operation 10 payload");
  exact(payload.expected_token_id, 1, "matrix operation 10 expected token");
  const config = record(payload.config, "matrix operation 10 config");
  exact(config.mode, 1, "matrix operation 10 mode");
  exact(config.blind, true, "matrix operation 10 blind policy");
  exact(config.item_count, 1, "matrix operation 10 item count");
  exact(config.max_supply, 3, "matrix operation 10 supply");
  exact(config.committed_recipes, 0, "matrix operation 10 committed recipes");
  exact(config.finalized, false, "matrix operation 10 finalized flag");
  exact(config.cancelled, false, "matrix operation 10 cancelled flag");
  exact(config.contents_uri, null, "matrix operation 10 contents URI");
  exact(
    config.manifest_uri,
    Buffer.from(context.manifest.proof.uri, "utf8").toString("hex"),
    "matrix operation 10 manifest URI",
  );
  exact(config.child_expiry, null, "matrix operation 10 child expiry");
  exact(config.wrapper_sale_end, null, "matrix operation 10 inherited LE window");
  const edition = record(context.manifest.value.editionPolicy, "fresh manifest edition policy");
  exact(config.reveal_deadline, edition.revealDeadline, "matrix operation 10 reveal deadline");
  exact(config.open_deadline, edition.openDeadline, "matrix operation 10 open deadline");
  exact(
    config.reveal_commitment,
    record(context.tokenMetadata.value.ravioli, "fresh token Ravioli policy").revealCommitment,
    "matrix operation 10 reveal commitment",
  );
  exact(
    mapValue(payload.token_info, "", "matrix operation 10 token info"),
    Buffer.from(context.tokenMetadata.proof.uri, "utf8").toString("hex"),
    "matrix operation 10 token metadata URI",
  );
  exactJson(RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[9], {
    action: "call",
    actor: "creator",
    entrypoint: "create_pack",
    globalOrdinal: 10,
    id: "mode-1-blind-funded-pool:create-pack",
    maxSupply: 3,
    operationSequence: 10,
    packMode: 1,
    proofPartition: "mode-1-blind-funded-pool",
    targetRole: "router",
    tokenId: 1,
  }, "compiled matrix operation 10");
  return call;
}

export function createRavioliCurrentV3RestartInterceptor(input: {
  replay: RavioliCurrentV3Restart;
  delegate: PastaUiLiveBridgeHandler;
  now?: () => number;
  minimumSaleWindowMs?: number;
  beforeDelegateOperationTen?: (context: RavioliCurrentV3FreshRestartContext) => Promise<void>;
}): RavioliCurrentV3RestartInterceptor {
  const { replay, delegate } = input;
  const pinSteps = replay.activePins.map(replayPinStep);
  const operationSteps = replay.operations.map(replayOperationStep);
  const steps = Object.freeze([
    pinSteps[0],
    pinSteps[1],
    pinSteps[2],
    operationSteps[0],
    operationSteps[1],
    operationSteps[2],
    pinSteps[3],
    pinSteps[4],
    pinSteps[5],
    operationSteps[3],
    operationSteps[4],
    operationSteps[5],
    operationSteps[6],
    operationSteps[7],
    pinSteps[6],
    operationSteps[8],
  ]);
  const historicalFingerprints = new Set([
    ...replay.journalPins.map(replayPinStep).map((step) => step.fingerprint),
    ...operationSteps.map((step) => step.fingerprint),
  ]);
  const supersededFingerprints = new Set(
    replay.supersededPrecommitPins.map(replayPinStep).map((step) => step.fingerprint),
  );
  let completed = 0;
  let stage: ReturnType<RavioliCurrentV3RestartInterceptor["continuationStage"]> = "replay-prefix";
  let manifest: RavioliCurrentV3FreshRestartContext["manifest"] | null = null;
  let envelope: RavioliCurrentV3FreshRestartContext["envelope"] | null = null;
  let tokenMetadata: RavioliCurrentV3FreshRestartContext["tokenMetadata"] | null = null;
  let finalContext: RavioliCurrentV3FreshRestartContext | null = null;

  const handle: PastaUiLiveBridgeHandler = async (request) => {
    if (READ_ACTIONS.has(request.action)) return delegate(request);
    if (completed < steps.length) {
      const expected = steps[completed];
      if (request.action !== expected.action) {
        fail(`expected replay step ${completed + 1} (${expected.action}), received ${request.action}`);
      }
      if (requestFingerprint(request) !== expected.fingerprint) {
        fail(`replay step ${completed + 1} ${expected.action} bytes or descriptor drifted`);
      }
      completed += 1;
      if (completed === steps.length) stage = "fresh-mode1-manifest";
      return expected.respond();
    }

    const fingerprint = requestFingerprint(request);
    if (fingerprint && supersededFingerprints.has(fingerprint)) {
      fail(`refusing superseded private precommit artifact: ${request.action}`);
    }
    if (fingerprint && historicalFingerprints.has(fingerprint)) {
      fail(`refusing duplicate recovered side effect: ${request.action}`);
    }

    if (stage === "fresh-mode1-manifest") {
      const candidate = freshManifest(
        request,
        (input.now ?? Date.now)(),
        input.minimumSaleWindowMs ?? 5 * 60 * 1_000,
      );
      const response = await delegate(request);
      manifest = {
        ...candidate,
        proof: assertFreshPinProof(response, {
          fileName: "ravioli-pack-manifest.json",
          mimeType: "application/json",
          bytes: candidate.bytes,
        }),
      };
      stage = "fresh-mode1-envelope";
      return response;
    }
    if (stage === "fresh-mode1-envelope") {
      if (!manifest) fail("fresh manifest context is missing");
      const candidate = freshEnvelope(request, manifest);
      const response = await delegate(request);
      envelope = {
        ...candidate,
        proof: assertFreshPinProof(response, {
          fileName: "ravioli-sealed-reveal-1.json",
          mimeType: "application/json",
          bytes: candidate.bytes,
        }),
      };
      stage = "fresh-mode1-token";
      return response;
    }
    if (stage === "fresh-mode1-token") {
      if (!manifest || !envelope) fail("fresh manifest/envelope context is missing");
      const candidate = freshTokenMetadata(request, replay, manifest, envelope);
      const response = await delegate(request);
      tokenMetadata = {
        ...candidate,
        proof: assertFreshPinProof(response, {
          fileName: "token.json",
          mimeType: "application/json",
          bytes: candidate.bytes,
        }),
      };
      stage = "matrix-operation-10";
      return response;
    }
    if (stage === "matrix-operation-10") {
      if (!manifest || !envelope || !tokenMetadata) fail("fresh restart context is incomplete");
      const partial = { manifest, envelope, tokenMetadata };
      const descriptor = operationTen(request, partial);
      const context = Object.freeze({ ...partial, operationTen: descriptor });
      await input.beforeDelegateOperationTen?.(context);
      const response = await delegate(request);
      finalContext = context;
      stage = "continued";
      return response;
    }
    return delegate(request);
  };

  return Object.freeze({
    handle,
    isReplayComplete: () => completed === steps.length,
    getCompletedReplayStepCount: () => completed,
    getRemainingReplayStepCount: () => steps.length - completed,
    continuationStage: () => stage,
    freshRestartContext: () => finalContext,
  });
}

export function ravioliCurrentV3RestartSnapshot(replay: RavioliCurrentV3Restart): JsonRecord {
  return {
    identity: replay.identity,
    appRoot: replay.appRoot,
    journalRoot: replay.journalRoot,
    preRestartFileCount: replay.preRestartFileCount,
    activePinSha256: replay.activePins.map((pin) => pin.proof.sha256),
    supersededPinSha256: replay.supersededPrecommitPins.map((pin) => pin.proof.sha256),
    operationDescriptorSha256: replay.operations.map((operation) =>
      ravioliUiLiveDescriptorSha256(operation.descriptor)),
    writeReceipts: replay.writeReceipts,
  };
}

export function assertRavioliCurrentV3IdentityAddresses(): void {
  for (const address of [
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.creatorAddress,
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.collectorOneAddress,
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.collectorTwoAddress,
  ]) {
    if (validateAddress(address) !== ValidationResult.VALID) fail(`invalid implicit account ${address}`);
  }
  for (const address of [
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.gnocchiAddress,
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.rotiniAddress,
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.controllerAddress,
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.routerAddress,
  ]) {
    if (validateContractAddress(address) !== ValidationResult.VALID) fail(`invalid contract account ${address}`);
  }
}
