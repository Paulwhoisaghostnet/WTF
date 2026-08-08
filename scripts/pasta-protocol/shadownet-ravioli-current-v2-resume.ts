import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { blake2b } from "blakejs";

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
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
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
] as const);
const PIN_NAMES = Object.freeze([
  "000001.bin",
  "000002.bin",
  "000003.bin",
  "000004.bin",
  "000005.bin",
  "000006.bin",
] as const);
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
] as const);
const PIN_EVENT_INDEXES = Object.freeze([0, 1, 2, 12, 14, 15] as const);
const OPERATION_EVENT_INDEXES = Object.freeze([3, 6, 9, 16, 19, 22, 25, 28] as const);

type JsonRecord = Record<string, unknown>;

export type RavioliCurrentV2PinIdentity = Readonly<{
  kind:
    | "wrapper"
    | "controller-metadata"
    | "collection"
    | "mode0-manifest"
    | "mode0-public-reveal"
    | "mode0-token-metadata";
  pinSequence: number;
  cid: string;
  uri: `ipfs://${string}`;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}>;

export type RavioliCurrentV2OperationIdentity = Readonly<{
  globalOrdinal: number;
  action: "originate" | "call";
  targetRole: "blindController" | "router" | "gnocchi";
  contractAddress: string;
  entrypoints: readonly string[];
  descriptorSha256: string;
  operationHash: string;
  counter: number;
  level: number;
  timestamp: string;
}>;

export type RavioliCurrentV2ResumeIdentity = Readonly<{
  journalId: string;
  intentSha256: string;
  finalEventSha256: string;
  createdAt: string;
  matrixSha256: string;
  creatorAddress: string;
  creatorBaseCounter: number;
  collectorOneAddress: string;
  collectorOneBaseCounter: number;
  collectorTwoAddress: string;
  collectorTwoBaseCounter: number;
  gnocchiAddress: string;
  rotiniAddress: string;
  controllerAddress: string;
  routerAddress: string;
  artifactHashes: Readonly<Record<
    "deploymentCertificate" | "blindController" | "router" | "rotiniTarget" | "gnocchiAdapter" | "rotiniAdapter",
    string
  >>;
  pins: readonly RavioliCurrentV2PinIdentity[];
  operations: readonly RavioliCurrentV2OperationIdentity[];
  screenshots: readonly Readonly<{
    stem: string;
    pngSha256: string;
    sidecarSha256: string;
  }>[];
  openKitSha256: string;
  openKitProgressSha256: string;
}>;

const CURRENT_PINS = Object.freeze([
  Object.freeze({
    kind: "wrapper" as const,
    pinSequence: 1,
    cid: "bafkreigrhdcrr2mnwaflnqhqviz4skohv4cveo7hayec5hda5i6hnf2rza",
    uri: "ipfs://bafkreigrhdcrr2mnwaflnqhqviz4skohv4cveo7hayec5hda5i6hnf2rza",
    fileName: "ravioli-wrapper-0.png",
    mimeType: "image/png",
    byteLength: 93,
    sha256: "d138c518e98db00ab6c0f0aa33c929c7af05523be706082e9c60ea3c769751c8",
  }),
  Object.freeze({
    kind: "controller-metadata" as const,
    pinSequence: 2,
    cid: "bafkreifiq6udehme2t4xkzxf7n4r2gtntv43r3s4llp6odhsduiicftxua",
    uri: "ipfs://bafkreifiq6udehme2t4xkzxf7n4r2gtntv43r3s4llp6odhsduiicftxua",
    fileName: "pasta-ravioli-blind-controller-contract.json",
    mimeType: "application/json",
    byteLength: 248,
    sha256: "a887a8321d84d4f97566e5fb791d1a6d9d79b8ee5c5adfe70cf21d10811677a0",
  }),
  Object.freeze({
    kind: "collection" as const,
    pinSequence: 3,
    cid: "bafkreib6gcdzpapvlxk7igsl6q6wxmamh3dglhfd6xbhrfrni6pab6muma",
    uri: "ipfs://bafkreib6gcdzpapvlxk7igsl6q6wxmamh3dglhfd6xbhrfrni6pab6muma",
    fileName: "collection.json",
    mimeType: "application/json",
    byteLength: 292,
    sha256: "3e30879781f55dd5f41a4bf43d6bb00c3ec6659ca3f5c278962d479e00f99460",
  }),
  Object.freeze({
    kind: "mode0-manifest" as const,
    pinSequence: 4,
    cid: "bafkreihg23dcu5wey76gs7bfuudsnlocdtht5pug6imbgboottd4ijg6qi",
    uri: "ipfs://bafkreihg23dcu5wey76gs7bfuudsnlocdtht5pug6imbgboottd4ijg6qi",
    fileName: "ravioli-pack-manifest.json",
    mimeType: "application/json",
    byteLength: 1_138,
    sha256: "e6d6c62a76c4c7fc697c25a50726adc21ccf3ebe86f2181305ce9cc7c424de82",
  }),
  Object.freeze({
    kind: "mode0-public-reveal" as const,
    pinSequence: 5,
    cid: "bafkreia4eh6ggbuzcdsi4pb3fdp6wvomob77ryvnu4axaqkwdntj7r32a4",
    uri: "ipfs://bafkreia4eh6ggbuzcdsi4pb3fdp6wvomob77ryvnu4axaqkwdntj7r32a4",
    fileName: "ravioli-public-reveal-0.json",
    mimeType: "application/json",
    byteLength: 1_115,
    sha256: "1c21fc63069910e48e3c3b28dfeb55cc707ff8e2ada7017041561b669fc77a07",
  }),
  Object.freeze({
    kind: "mode0-token-metadata" as const,
    pinSequence: 6,
    cid: "bafkreigytdnjdf5vsd5qk6d7pxtouj6iziebj274qkfrhmputrcjt77juq",
    uri: "ipfs://bafkreigytdnjdf5vsd5qk6d7pxtouj6iziebj274qkfrhmputrcjt77juq",
    fileName: "token.json",
    mimeType: "application/json",
    byteLength: 1_363,
    sha256: "d898da9197b590fb05787f7de6ea27c8ca0814ebfc828b13b1f49c4499ffe9a4",
  }),
] satisfies readonly RavioliCurrentV2PinIdentity[]);

const CURRENT_OPERATIONS = Object.freeze([
  Object.freeze({
    globalOrdinal: 1,
    action: "originate" as const,
    targetRole: "blindController" as const,
    contractAddress: "KT1P7qjWpPjsqJCUuzWW6qgf7JGfeNbb1jNK",
    entrypoints: Object.freeze([]) as readonly string[],
    descriptorSha256: "cb95d13a30d393144afa1e01431fb8a996513c3a8f79239496027087cd35aec2",
    operationHash: "onyXm2NFwbPFCLDqLZTCeE64gyZY8UutJzgkemjYfHWnXTmad3c",
    counter: 23_831_509,
    level: 4_320_242,
    timestamp: "2026-07-23T21:23:33Z",
  }),
  Object.freeze({
    globalOrdinal: 2,
    action: "originate" as const,
    targetRole: "router" as const,
    contractAddress: "KT1N6ZEgWS4HyJte7EtSuwHtrnNSVThaNhb7",
    entrypoints: Object.freeze([]) as readonly string[],
    descriptorSha256: "9e4a26dc70dce86dcba1f9a9ccbdea1a2d89afff6f53f08c040639e9c889da89",
    operationHash: "oo26TChqfNp61YzjhEn8JoeJFqiBF1vBArJZrgn76gngC2K9GX3",
    counter: 23_831_510,
    level: 4_320_539,
    timestamp: "2026-07-23T22:00:24Z",
  }),
  Object.freeze({
    globalOrdinal: 3,
    action: "call" as const,
    targetRole: "gnocchi" as const,
    contractAddress: "KT1ShvgCuQZAKWTUFeCQZphNcn1y6Bi7LyYi",
    entrypoints: Object.freeze(["update_operators"]) as readonly string[],
    descriptorSha256: "8a5c065933c5519977bbf3a74c8201e33c26ff2cedaccca2824c31e2a1ea89e5",
    operationHash: "ooEL3JTCCHAZYeuo4WhQAcN3t32W2rK3iBoFd98V6YizmednjJt",
    counter: 23_831_511,
    level: 4_320_541,
    timestamp: "2026-07-23T22:00:36Z",
  }),
  Object.freeze({
    globalOrdinal: 4,
    action: "call" as const,
    targetRole: "router" as const,
    contractAddress: "KT1N6ZEgWS4HyJte7EtSuwHtrnNSVThaNhb7",
    entrypoints: Object.freeze(["create_pack"]) as readonly string[],
    descriptorSha256: "3a3d5863a7740943b57ce07a679801c7dc1f882acfa82cbb1b3466c58612d478",
    operationHash: "opSiJMwNgcEMYdFowTDJcd2DkE4QQ3xcbWcyfQ6iV59zBTENYnP",
    counter: 23_831_512,
    level: 4_320_543,
    timestamp: "2026-07-23T22:01:09Z",
  }),
  Object.freeze({
    globalOrdinal: 5,
    action: "call" as const,
    targetRole: "router" as const,
    contractAddress: "KT1N6ZEgWS4HyJte7EtSuwHtrnNSVThaNhb7",
    entrypoints: Object.freeze(["commit_recipe"]) as readonly string[],
    descriptorSha256: "685a6d1608bfc659f33540d408f8f1ec7412290b5ea24b652188923ab76239cc",
    operationHash: "op2FbgRcPBfLf41kNhUC7WsdiY2PFVbbfwo2obYQJuKoRH2A4bJ",
    counter: 23_831_513,
    level: 4_320_545,
    timestamp: "2026-07-23T22:01:21Z",
  }),
  Object.freeze({
    globalOrdinal: 6,
    action: "call" as const,
    targetRole: "router" as const,
    contractAddress: "KT1N6ZEgWS4HyJte7EtSuwHtrnNSVThaNhb7",
    entrypoints: Object.freeze(["finalize_pack"]) as readonly string[],
    descriptorSha256: "ace8d4ba81868da674bc1012144438abf6a512ca5b9ebc2b486ead09d3ee4deb",
    operationHash: "oo5QVgUJqxyMMErgaY7KKCgr7ZEF7hfVnyAizb7fQibvRNQq8Jv",
    counter: 23_831_514,
    level: 4_320_547,
    timestamp: "2026-07-23T22:01:33Z",
  }),
  Object.freeze({
    globalOrdinal: 7,
    action: "call" as const,
    targetRole: "router" as const,
    contractAddress: "KT1N6ZEgWS4HyJte7EtSuwHtrnNSVThaNhb7",
    entrypoints: Object.freeze(["mint"]) as readonly string[],
    descriptorSha256: "f0aa586e08835f5173fb48b2c8f579eb4053eefcb9754518a6323eac6a539b6e",
    operationHash: "onxbuxBFcCzzDhyRP5y9rQfnj4xXzZMsEp6AL4KE8xuxyLjz7YX",
    counter: 23_831_515,
    level: 4_320_549,
    timestamp: "2026-07-23T22:02:00Z",
  }),
  Object.freeze({
    globalOrdinal: 8,
    action: "call" as const,
    targetRole: "router" as const,
    contractAddress: "KT1N6ZEgWS4HyJte7EtSuwHtrnNSVThaNhb7",
    entrypoints: Object.freeze(["set_sale"]) as readonly string[],
    descriptorSha256: "03eec6d0636a0778ea2ae95cefa763b039babccd7fbb8acc9e4402d10e0c0a75",
    operationHash: "oomfgjDbPPCiVHhUWfe1HCTPiadCrF84epC1Eh3xWw7U6kiVYsL",
    counter: 23_831_516,
    level: 4_320_550,
    timestamp: "2026-07-23T22:02:18Z",
  }),
] satisfies readonly RavioliCurrentV2OperationIdentity[]);

export const RAVIOLI_CURRENT_V2_RESUME_IDENTITY: RavioliCurrentV2ResumeIdentity = Object.freeze({
  journalId: "62a4fd93d62103e598ad6feb7c89d625c442306f2451e8804e587ba040f34325",
  intentSha256: "741e47491e632a1e0248a8f16fe2bea6c43a1708cd4767462a5aced8da3363fb",
  finalEventSha256: "63f85e91158dcf737633b40956615b780dedd69b67168d0b57044a7b6f61e6be",
  createdAt: "2026-07-23T21:07:22.149Z",
  matrixSha256: "01de13af9bc190f1480ebc40457e30daee3ef9b4bcdeaffbaec11486c3b59a0a",
  creatorAddress: "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM",
  creatorBaseCounter: 23_831_508,
  collectorOneAddress: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej",
  collectorOneBaseCounter: 23_833_836,
  collectorTwoAddress: "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ",
  collectorTwoBaseCounter: 25_689_635,
  gnocchiAddress: "KT1ShvgCuQZAKWTUFeCQZphNcn1y6Bi7LyYi",
  rotiniAddress: "KT1SiFmNAENhyQxqnN2Zhw3bVo4EcFmvaRSx",
  controllerAddress: "KT1P7qjWpPjsqJCUuzWW6qgf7JGfeNbb1jNK",
  routerAddress: "KT1N6ZEgWS4HyJte7EtSuwHtrnNSVThaNhb7",
  artifactHashes: Object.freeze({
    deploymentCertificate: "e907cc1114064568f78d37752272fd17f867cb60a88bae269d76d053b486933c",
    blindController: "a3e1686222e5d735364c63b93899c001927a09dfb84f6d21893819994270f268",
    router: "546470474ac94e92bc5915d9bf8823529a5c3000c9c8d0f792566a555c79f9ef",
    rotiniTarget: "cccf16352f7585e7bc2a7f32db75edbb5bc85f9e8402c78b65f808e627569b04",
    gnocchiAdapter: "c52c4d3345203482c29762b37f4073aea5708ccd98b7ccf18acd4a80bd70a1fd",
    rotiniAdapter: "5116aba2785a0b2a6c14d115f4c1a11eb0caaa62d876fd201b52c5dd82f5948e",
  }),
  pins: CURRENT_PINS,
  operations: CURRENT_OPERATIONS,
  screenshots: Object.freeze([
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
  ]),
  openKitSha256: "6b956fa9b8722b98f367f92bc4cad43f158c00f98c4b20ae11e8971ee78a2ff1",
  openKitProgressSha256: "0c2167bcd7f44ac08eff3e35c6447112a5458b570010908d2b4fc4276d05e7e7",
});

export const RAVIOLI_CURRENT_V2_NEXT_PIN = Object.freeze({
  action: "pin_blob" as const,
  fileName: "ravioli-wrapper-1.png",
  mimeType: "image/png",
  byteLength: 93,
  sha256: "6e5aa8c0aa33281820959970ece335173b3781fdf2f4d575e864ebb2bb076762",
});

export const RAVIOLI_CURRENT_V2_MODE0_NONCE =
  "0413d3ab7a778ab66b509a46a07420ae36040f185f86c5c456936bbeab016137";
export const RAVIOLI_CURRENT_V2_MODE0_NONCE_COMMITMENT =
  "68eb8948845bdaafa3f90ea663133d6bc558be5c50b7ae09a079cfe465be3603";

export type RavioliCurrentV2PinRecord = Readonly<{
  identity: RavioliCurrentV2PinIdentity;
  eventPath: string;
  artifactPath: string;
  bytes: Uint8Array;
  value?: unknown;
  proof: PastaUiLivePinProof;
}>;

export type RavioliCurrentV2OperationRecord = Readonly<{
  identity: RavioliCurrentV2OperationIdentity;
  descriptor: PastaUiLiveOperationDescriptor;
  receipt: PastaUiLivePublicReceipt;
}>;

export type RavioliCurrentV2Resume = Readonly<{
  journalRoot: string;
  journalPrefixComplete: true;
  controllerAddress: string;
  routerAddress: string;
  operatorApprovalLevel: number;
  activePins: readonly RavioliCurrentV2PinRecord[];
  pinProofs: readonly PastaUiLivePinProof[];
  operations: readonly RavioliCurrentV2OperationRecord[];
  writeReceipts: readonly PastaUiLivePublicReceipt[];
  identity: RavioliCurrentV2ResumeIdentity;
}>;

export type LoadRavioliCurrentV2ResumeInput = {
  /**
   * Production callers must pass the object returned by openRavioliUiLiveJournal.
   * The loader still re-reads every immutable byte to close validation/use races.
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
  identity?: RavioliCurrentV2ResumeIdentity;
};

export type RavioliCurrentV2ResumeInterceptor = {
  handle: PastaUiLiveBridgeHandler;
  isReplayComplete(): boolean;
  didDelegateExpectedNextPin(): boolean;
  didDelegateExpectedNextOperation(): boolean;
  getCompletedReplayStepCount(): number;
  getRemainingReplayStepCount(): number;
  continuationStage(): "replay-prefix" | "mode1-wrapper-pin" | "matrix-operation-9" | "continued";
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message: string): never {
  throw new Error(`Ravioli current-v2 resume: ${message}`);
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

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  exactJson(Object.keys(value).sort(), [...keys].sort(), `${label} fields`);
}

async function canonicalJsonFile(filePath: string, label: string): Promise<{
  value: JsonRecord;
  bytes: Uint8Array;
  sha256: string;
}> {
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
  fail(`unsupported descriptor action ${request.action}`);
}

function requestFingerprint(request: PastaUiLiveBridgeRequest): string | null {
  try {
    if (request.action === "pin_blob") return pinBlobFingerprint(request);
    if (request.action === "pin_json") return pinJsonFingerprint(request);
    if (request.action === "originate" || request.action === "call") {
      return `${request.action}:${ravioliUiLiveDescriptorSha256(operationDescriptor(request))}`;
    }
    return null;
  } catch {
    return null;
  }
}

function encodedMapEntries(value: unknown, label: string): unknown[] {
  const map = record(value, label);
  exactKeys(map, ["$map"], label);
  if (!Array.isArray(map.$map)) fail(`${label} entries must be an array`);
  return map.$map;
}

function encodedMapValue(value: unknown, key: string, label: string): unknown {
  const entry = encodedMapEntries(value, label).find(
    (candidate) => Array.isArray(candidate) && candidate.length === 2 && candidate[0] === key,
  );
  if (!Array.isArray(entry)) fail(`${label} is missing key ${key}`);
  return entry[1];
}

function validateOriginDescriptor(
  descriptor: PastaUiLiveOperationDescriptor,
  operation: RavioliCurrentV2OperationIdentity,
  identity: RavioliCurrentV2ResumeIdentity,
  expected: LoadRavioliCurrentV2ResumeInput["expected"],
): void {
  exact(descriptor.kind, "originate", `operation ${operation.globalOrdinal} descriptor kind`);
  const origin = descriptor as Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }>;
  if (operation.targetRole === "blindController") {
    exact(
      hashMichelsonScriptCode(origin.code as unknown[]),
      hashMichelsonScriptCode(expected.controllerArtifact),
      "controller current artifact code",
    );
    const storage = record(origin.storage, "controller descriptor storage");
    exact(
      encodedMapValue(storage.metadata, "", "controller metadata"),
      Buffer.from(identity.pins[1].uri, "utf8").toString("hex"),
      "controller metadata URI",
    );
    for (const key of ["claim_counts", "claim_slots", "consumed_serials", "packs", "refund_credits"]) {
      exactJson(encodedMapEntries(storage[key], `controller ${key}`), [], `controller ${key}`);
    }
    return;
  }
  exact(operation.targetRole, "router", "second origination role");
  exact(
    hashMichelsonScriptCode(origin.code as unknown[]),
    hashMichelsonScriptCode(expected.routerArtifact),
    "router current artifact code",
  );
  const storage = record(origin.storage, "router descriptor storage");
  exact(storage.administrator, identity.creatorAddress, "router administrator");
  exact(storage.pending_administrator, null, "router pending administrator");
  exact(storage.blind_controller, identity.controllerAddress, "router blind controller");
  exact(storage.next_token_id, 0, "router initial next token");
  exact(
    encodedMapValue(storage.metadata, "", "router metadata"),
    Buffer.from(identity.pins[2].uri, "utf8").toString("hex"),
    "router metadata URI",
  );
}

function validateOperatorPayload(
  payload: unknown,
  identity: RavioliCurrentV2ResumeIdentity,
  tokenIds: readonly number[],
  label: string,
): void {
  if (!Array.isArray(payload)) fail(`${label} must be an array`);
  exact(payload.length, tokenIds.length, `${label} length`);
  exactJson(
    payload,
    tokenIds.map((tokenId) => ({
      add_operator: {
        owner: identity.creatorAddress,
        operator: identity.routerAddress,
        token_id: tokenId,
      },
    })),
    label,
  );
}

function validateAppliedCallDescriptor(
  descriptor: PastaUiLiveOperationDescriptor,
  operation: RavioliCurrentV2OperationIdentity,
  identity: RavioliCurrentV2ResumeIdentity,
): void {
  exact(descriptor.kind, "call", `operation ${operation.globalOrdinal} descriptor kind`);
  const callDescriptor = descriptor as Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>;
  exactJson(callDescriptor.sendOptions, {}, `operation ${operation.globalOrdinal} send options`);
  exact(callDescriptor.call.contractAddress, operation.contractAddress, `operation ${operation.globalOrdinal} target`);
  exact(callDescriptor.call.entrypoint, operation.entrypoints[0], `operation ${operation.globalOrdinal} entrypoint`);
  const payload = callDescriptor.call.payload;
  if (operation.globalOrdinal === 3) {
    validateOperatorPayload(payload, identity, [0], "mode-0 operator approval");
    return;
  }
  if (operation.globalOrdinal === 4) {
    const create = record(payload, "mode-0 create_pack payload");
    exact(create.expected_token_id, 0, "mode-0 expected token");
    const config = record(create.config, "mode-0 config");
    exact(config.mode, 0, "mode-0 config mode");
    exact(config.blind, false, "mode-0 blind policy");
    exact(config.item_count, 1, "mode-0 item count");
    exact(config.max_supply, 1, "mode-0 max supply");
    exact(config.committed_recipes, 0, "mode-0 committed recipes");
    exact(config.finalized, false, "mode-0 initial finalized");
    exact(config.cancelled, false, "mode-0 initial cancelled");
    exact(config.manifest_uri, Buffer.from(identity.pins[3].uri, "utf8").toString("hex"), "mode-0 manifest URI");
    exact(config.contents_uri, Buffer.from(identity.pins[4].uri, "utf8").toString("hex"), "mode-0 reveal URI");
    return;
  }
  if (operation.globalOrdinal === 5) {
    const commit = record(payload, "mode-0 commit payload");
    exact(commit.token_id, 0, "mode-0 commit token");
    if (typeof commit.nonce_commitment !== "string" || !HASH_RE.test(commit.nonce_commitment)) {
      fail("mode-0 nonce commitment is invalid");
    }
    if (!Array.isArray(commit.reservations) || commit.reservations.length !== 1) {
      fail("mode-0 commit must reserve exactly one child");
    }
    exactJson(commit.reservations[0], {
      escrow: { amount: 1, fa2: identity.gnocchiAddress, token_id: 0 },
    }, "mode-0 escrow reservation");
    return;
  }
  if (operation.globalOrdinal === 6) {
    exact(payload, 0, "mode-0 finalize token");
    return;
  }
  if (operation.globalOrdinal === 7) {
    exactJson(payload, {
      amount: 1,
      to_: identity.creatorAddress,
      token_id: 0,
    }, "mode-0 mint");
    return;
  }
  if (operation.globalOrdinal === 8) {
    exactJson(payload, {
      sale: {
        active: true,
        end: null,
        price: 0,
        remaining: 1,
        seller: identity.creatorAddress,
        start: null,
        treasury: identity.creatorAddress,
      },
      token_id: 0,
    }, "mode-0 sale");
    return;
  }
  fail(`unsupported recovered operation ${operation.globalOrdinal}`);
}

function assertPin(
  event: JsonRecord,
  bytes: Uint8Array,
  identity: RavioliCurrentV2PinIdentity,
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

function validatePublicRevealBoundary(
  prepared: JsonRecord,
  pinned: JsonRecord,
  bytes: Uint8Array,
  identity: RavioliCurrentV2ResumeIdentity,
  preparedSha256: string,
): JsonRecord {
  exact(prepared.phase, "PUBLIC_REVEAL_PREPARED", "public reveal preparation phase");
  exact(prepared.disclosure, "PUBLIC_REVEAL", "public reveal preparation disclosure");
  const artifact = record(prepared.artifact, "public reveal preparation artifact");
  exact(artifact.fileName, identity.pins[4].fileName, "public reveal preparation file");
  exact(artifact.mimeType, identity.pins[4].mimeType, "public reveal preparation MIME");
  exact(artifact.byteLength, identity.pins[4].byteLength, "public reveal preparation length");
  exact(artifact.sha256, identity.pins[4].sha256, "public reveal preparation hash");
  const reveal = record(prepared.publicReveal, "public reveal preparation summary");
  exact(reveal.schema, "pasta-ravioli-public-reveal@1", "public reveal schema");
  exact(reveal.network, "shadownet", "public reveal network");
  exact(reveal.contract, identity.routerAddress, "public reveal router");
  exact(reveal.tokenId, 0, "public reveal token");
  exact(reveal.mode, "deterministic_vault", "public reveal mode");
  exact(reveal.manifestUri, identity.pins[3].uri, "public reveal manifest");
  exact(reveal.maxSupply, 1, "public reveal supply");
  exact(reveal.itemCount, 1, "public reveal item count");
  exact(pinned.disclosure, "PUBLIC_REVEAL", "public reveal pin disclosure");
  exact(pinned.publicRevealPreparedRecordSha256, preparedSha256, "public reveal pin preparation link");
  exactJson(pinned.publicReveal, reveal, "public reveal pin summary");
  const document = parseCanonicalJson(bytes, "public reveal document");
  exact(document.schema, "pasta-ravioli-public-reveal@1", "public reveal document schema");
  exact(document.contract, identity.routerAddress, "public reveal document router");
  exact(document.tokenId, 0, "public reveal document token");
  exact(document.manifestUri, identity.pins[3].uri, "public reveal document manifest");
  const openKit = record(document.openKit, "public reveal open kit");
  exact(openKit.schema, "pasta-ravioli-open-kit@3", "public reveal open-kit schema");
  exact(openKit.contract, identity.routerAddress, "public reveal open-kit router");
  exact(openKit.tokenId, 0, "public reveal open-kit token");
  exact(openKit.mode, "deterministic_vault", "public reveal open-kit mode");
  exact(openKit.manifestUri, identity.pins[3].uri, "public reveal open-kit manifest");
  if (!Array.isArray(openKit.recipes) || openKit.recipes.length !== 1) {
    fail("public reveal open kit must contain exactly recipe 0");
  }
  const recipe = record(openKit.recipes[0], "public reveal open-kit recipe 0");
  exact(recipe.serial, 0, "public reveal open-kit recipe serial");
  exact(recipe.nonce, RAVIOLI_CURRENT_V2_MODE0_NONCE, "public reveal open-kit nonce");
  exactJson(recipe.actions, [{
    amount: 1,
    fa2: identity.gnocchiAddress,
    kind: "escrow",
    tokenId: 0,
  }], "public reveal open-kit recipe actions");
  const nonceCommitment = Buffer.from(
    blake2b(Buffer.from(RAVIOLI_CURRENT_V2_MODE0_NONCE, "hex"), undefined, 32),
  ).toString("hex");
  exact(
    nonceCommitment,
    RAVIOLI_CURRENT_V2_MODE0_NONCE_COMMITMENT,
    "public reveal open-kit nonce commitment",
  );
  return openKit;
}

function writeReceipt(
  identity: RavioliCurrentV2ResumeIdentity,
  operation: RavioliCurrentV2OperationIdentity,
): PastaUiLivePublicReceipt {
  return {
    schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
    sequence: operation.globalOrdinal,
    timestampUtc: operation.timestamp,
    action: operation.action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: identity.creatorAddress,
    contractAddress: operation.contractAddress,
    operationHash: operation.operationHash,
    entrypoints: [...operation.entrypoints],
  };
}

function validateOperationEvents(
  events: readonly { value: JsonRecord; sha256: string }[],
  startIndex: number,
  operation: RavioliCurrentV2OperationIdentity,
  identity: RavioliCurrentV2ResumeIdentity,
  expected: LoadRavioliCurrentV2ResumeInput["expected"],
): RavioliCurrentV2OperationRecord {
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
  exact(preparedOperation.signerAddress, identity.creatorAddress, `operation ${operation.globalOrdinal} signer`);
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
  if (operation.action === "originate") {
    validateOriginDescriptor(descriptor, operation, identity, expected);
  } else {
    exact(preparedOperation.contractAddress, operation.contractAddress, `operation ${operation.globalOrdinal} prepared target`);
    validateAppliedCallDescriptor(descriptor, operation, identity);
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
  exact(evidence.signerAddress, identity.creatorAddress, `operation ${operation.globalOrdinal} evidence signer`);
  exact(evidence.contractAddress, operation.contractAddress, `operation ${operation.globalOrdinal} evidence target`);
  exact(evidence.counter, operation.counter, `operation ${operation.globalOrdinal} evidence counter`);
  exact(evidence.counter, identity.creatorBaseCounter + operation.globalOrdinal, `operation ${operation.globalOrdinal} derived counter`);
  exact(evidence.level, operation.level, `operation ${operation.globalOrdinal} evidence level`);
  exact(evidence.timestamp, operation.timestamp, `operation ${operation.globalOrdinal} evidence timestamp`);
  exactJson(evidence.entrypoints, operation.entrypoints, `operation ${operation.globalOrdinal} evidence entrypoints`);
  exact(
    evidence.explorerUrl,
    `https://shadownet.tzkt.io/${operation.operationHash}`,
    `operation ${operation.globalOrdinal} explorer`,
  );
  if (validateOperation(operation.operationHash) !== ValidationResult.VALID) {
    fail(`operation ${operation.globalOrdinal} hash is invalid`);
  }
  if (validateContractAddress(operation.contractAddress) !== ValidationResult.VALID) {
    fail(`operation ${operation.globalOrdinal} target is invalid`);
  }
  return Object.freeze({
    identity: operation,
    descriptor,
    receipt: writeReceipt(identity, operation),
  });
}

function actorCounter(
  actors: JsonRecord,
  actor: "creator" | "collector1" | "collector2",
  expectedAddress: string,
  expectedCounter: number,
): void {
  const value = record(actors[actor], `${actor} intent`);
  exact(value.signerAddress, expectedAddress, `${actor} signer`);
  const counters = record(value.counters, `${actor} counters`);
  for (const lane of ["primary", "fallback"]) {
    exact(record(counters[lane], `${actor} ${lane} counter`).counter, expectedCounter, `${actor} ${lane} counter`);
  }
}

export async function loadRavioliCurrentV2Resume(
  input: LoadRavioliCurrentV2ResumeInput,
): Promise<RavioliCurrentV2Resume> {
  const identity = input.identity ?? RAVIOLI_CURRENT_V2_RESUME_IDENTITY;
  if (input.journal.isFinalized()) fail("the exact recovery boundary must remain unfinalized");
  if (input.journal.getCompletedOperationCount() !== 8) {
    fail("the exact recovery boundary must contain eight APPLIED creator operations");
  }
  const root = path.resolve(input.journal.journalRoot);
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
  exactJson(
    (intent.matrix as unknown[]).slice(0, 8),
    RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.slice(0, 8),
    "journal completed matrix prefix",
  );
  exactJson(
    (intent.matrix as unknown[])[8],
    RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[8],
    "journal next matrix operation",
  );
  const actors = record(intent.actors, "journal actors");
  actorCounter(actors, "creator", identity.creatorAddress, identity.creatorBaseCounter);
  actorCounter(actors, "collector1", identity.collectorOneAddress, identity.collectorOneBaseCounter);
  actorCounter(actors, "collector2", identity.collectorTwoAddress, identity.collectorTwoBaseCounter);
  exact(input.expected.creatorAddress, identity.creatorAddress, "requested creator");
  exact(input.expected.collectorOneAddress, identity.collectorOneAddress, "requested collector one");
  exact(input.expected.collectorTwoAddress, identity.collectorTwoAddress, "requested collector two");
  exactJson(intent.dependencyAddresses, {
    gnocchi: identity.gnocchiAddress,
    rotini: identity.rotiniAddress,
  }, "journal dependencies");
  exactJson(input.expected.dependencyAddresses, intent.dependencyAddresses, "current dependencies");
  const dependencyHashes = record(intent.dependencyHashes, "journal dependency hashes");
  const { tzktBaseline, ...stableDependencyHashes } = dependencyHashes;
  if (typeof tzktBaseline !== "string" || !HASH_RE.test(tzktBaseline)) {
    fail("journal TzKT baseline hash is invalid");
  }
  exactJson(stableDependencyHashes, input.expected.dependencyHashes, "current dependency hashes");
  exactJson(intent.artifactHashes, identity.artifactHashes, "journal artifact identity");
  exactJson(input.expected.artifactHashes, identity.artifactHashes, "current artifact identity");
  exact(hashJsonForBridge(input.expected.controllerArtifact), identity.artifactHashes.blindController, "current controller artifact");
  exact(hashJsonForBridge(input.expected.routerArtifact), identity.artifactHashes.router, "current router artifact");

  const eventNames = (await readdir(path.join(root, "events"))).sort();
  exactJson(eventNames, EVENT_NAMES, "31-event current-v2 prefix filenames");
  const pinNames = (await readdir(path.join(root, "pins"))).sort();
  exactJson(pinNames, PIN_NAMES, "six-pin current-v2 prefix filenames");
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
    exact(
      event.previousRecordSha256,
      index === 0 ? identity.intentSha256 : events[index - 1].sha256,
      `event ${index + 1} hash link`,
    );
  }
  exact(events.at(-1)?.sha256, identity.finalEventSha256, "current-v2 journal head");

  const pinRecords: RavioliCurrentV2PinRecord[] = [];
  for (let index = 0; index < identity.pins.length; index += 1) {
    const pinIdentity = identity.pins[index];
    const eventIndex = PIN_EVENT_INDEXES[index];
    const proof = assertPin(events[eventIndex].value, pins[index], pinIdentity, input.ipfs);
    const value = pinIdentity.mimeType === "application/json"
      ? parseCanonicalJson(pins[index], `pin ${pinIdentity.pinSequence}`)
      : undefined;
    pinRecords.push(Object.freeze({
      identity: pinIdentity,
      eventPath: `events/${EVENT_NAMES[eventIndex]}`,
      artifactPath: `pins/${PIN_NAMES[index]}`,
      bytes: Uint8Array.from(pins[index]),
      ...(value !== undefined ? { value } : {}),
      proof,
    }));
  }
  const publicRevealOpenKit = validatePublicRevealBoundary(
    events[13].value,
    events[14].value,
    pins[4],
    identity,
    events[13].sha256,
  );

  const operationRecords = identity.operations.map((operation, index) =>
    validateOperationEvents(
      events,
      OPERATION_EVENT_INDEXES[index],
      operation,
      identity,
      input.expected,
    ));
  const commitDescriptor = operationRecords[4].descriptor as Extract<
    PastaUiLiveOperationDescriptor,
    { kind: "call" }
  >;
  const commitPayload = record(commitDescriptor.call.payload, "mode-0 recovered commit payload");
  exact(
    commitPayload.nonce_commitment,
    RAVIOLI_CURRENT_V2_MODE0_NONCE_COMMITMENT,
    "mode-0 recovered nonce commitment",
  );
  exact(
    record((publicRevealOpenKit.recipes as unknown[])[0], "public reveal recipe").nonce,
    RAVIOLI_CURRENT_V2_MODE0_NONCE,
    "mode-0 recovered nonce/open-kit binding",
  );
  exact(
    operationRecords[0].identity.contractAddress,
    identity.controllerAddress,
    "controller operation address",
  );
  exact(
    operationRecords[1].identity.contractAddress,
    identity.routerAddress,
    "router operation address",
  );
  exact(
    operationRecords[2].identity.level,
    identity.operations[2].level,
    "Gnocchi approval level",
  );
  return Object.freeze({
    journalRoot: root,
    journalPrefixComplete: true,
    controllerAddress: identity.controllerAddress,
    routerAddress: identity.routerAddress,
    operatorApprovalLevel: identity.operations[2].level,
    activePins: Object.freeze(pinRecords),
    pinProofs: Object.freeze(pinRecords.map((pin) => pin.proof)),
    operations: Object.freeze(operationRecords),
    writeReceipts: Object.freeze(operationRecords.map((operation) => operation.receipt)),
    identity,
  });
}

type ReplayStep = Readonly<{
  action: "pin_blob" | "pin_json" | "originate" | "call";
  fingerprint: string;
  respond(): unknown;
}>;

function replayPinStep(pin: RavioliCurrentV2PinRecord): ReplayStep {
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

function replayOperationStep(operation: RavioliCurrentV2OperationRecord): ReplayStep {
  const action = operation.identity.action;
  return Object.freeze({
    action,
    fingerprint: `${action}:${operation.identity.descriptorSha256}`,
    respond: () => ({
      ...(action === "originate" ? { contractAddress: operation.identity.contractAddress } : {}),
      operationHash: operation.identity.operationHash,
      confirmationLevel: 1,
    }),
  });
}

function validateExpectedNextPin(request: PastaUiLiveBridgeRequest): void {
  exact(request.action, RAVIOLI_CURRENT_V2_NEXT_PIN.action, "first new side-effect action");
  exact(
    pinBlobFingerprint(request),
    `pin_blob:${RAVIOLI_CURRENT_V2_NEXT_PIN.fileName}:${RAVIOLI_CURRENT_V2_NEXT_PIN.mimeType}:${RAVIOLI_CURRENT_V2_NEXT_PIN.sha256}:${RAVIOLI_CURRENT_V2_NEXT_PIN.byteLength}`,
    "first new mode-1 wrapper pin",
  );
}

function validateExpectedMatrixOperationNine(
  request: PastaUiLiveBridgeRequest,
  replay: RavioliCurrentV2Resume,
): void {
  exact(request.action, "call", "first new chain mutation");
  const descriptor = operationDescriptor(request);
  exact(descriptor.kind, "call", "matrix operation 9 descriptor kind");
  const call = (descriptor as Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>).call;
  exact(call.contractAddress, replay.identity.gnocchiAddress, "matrix operation 9 target");
  exact(call.entrypoint, "update_operators", "matrix operation 9 entrypoint");
  exactJson(
    (descriptor as Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>).sendOptions,
    {},
    "matrix operation 9 send options",
  );
  validateOperatorPayload(call.payload, replay.identity, [0, 1], "matrix operation 9 payload");
  exactJson(
    RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[8],
    {
      action: "call",
      actor: "creator",
      entrypoint: "update_operators",
      globalOrdinal: 9,
      id: "mode-1-blind-funded-pool:authorize-escrow",
      operationSequence: 9,
      proofPartition: "mode-1-blind-funded-pool",
      targetRole: "gnocchi",
      tokenIds: [0, 1],
    },
    "compiled matrix operation 9",
  );
}

export function createRavioliCurrentV2ResumeInterceptor(input: {
  replay: RavioliCurrentV2Resume;
  delegate: PastaUiLiveBridgeHandler;
}): RavioliCurrentV2ResumeInterceptor {
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
  ]);
  const appliedWriteFingerprints = new Set(
    operationSteps.map((step) => step.fingerprint),
  );
  const replayFingerprints = new Set(steps.map((step) => step.fingerprint));
  let completed = 0;
  let nextPinDelegated = false;
  let nextOperationDelegated = false;

  const handle: PastaUiLiveBridgeHandler = async (request) => {
    if (READ_ACTIONS.has(request.action)) return delegate(request);
    if (completed < steps.length) {
      const expected = steps[completed];
      if (request.action !== expected.action) {
        fail(`expected replay step ${completed + 1} (${expected.action}), received ${request.action}`);
      }
      const fingerprint = requestFingerprint(request);
      if (fingerprint !== expected.fingerprint) {
        fail(`replay step ${completed + 1} ${expected.action} bytes or descriptor drifted`);
      }
      completed += 1;
      return expected.respond();
    }

    const fingerprint = requestFingerprint(request);
    if (fingerprint && replayFingerprints.has(fingerprint)) {
      fail(`refusing duplicate recovery side effect after the 14-step prefix completed: ${request.action}`);
    }
    if (fingerprint && appliedWriteFingerprints.has(fingerprint)) {
      fail(`refusing duplicate applied operation after the 14-step prefix completed: ${request.action}`);
    }
    if (!nextPinDelegated) {
      validateExpectedNextPin(request);
      nextPinDelegated = true;
      return delegate(request);
    }
    if (!nextOperationDelegated) {
      validateExpectedMatrixOperationNine(request, replay);
      nextOperationDelegated = true;
      return delegate(request);
    }
    return delegate(request);
  };

  return Object.freeze({
    handle,
    isReplayComplete: () => completed === steps.length,
    didDelegateExpectedNextPin: () => nextPinDelegated,
    didDelegateExpectedNextOperation: () => nextOperationDelegated,
    getCompletedReplayStepCount: () => completed,
    getRemainingReplayStepCount: () => steps.length - completed,
    continuationStage: () => completed < steps.length
      ? "replay-prefix"
      : !nextPinDelegated
        ? "mode1-wrapper-pin"
        : !nextOperationDelegated
          ? "matrix-operation-9"
          : "continued",
  });
}

export function ravioliCurrentV2ResumeSnapshot(replay: RavioliCurrentV2Resume): JsonRecord {
  return {
    identity: replay.identity,
    journalRoot: replay.journalRoot,
    pinProofs: replay.pinProofs,
    operationDescriptorSha256: replay.operations.map((operation) =>
      ravioliUiLiveDescriptorSha256(operation.descriptor)),
    writeReceipts: replay.writeReceipts,
  };
}

export function assertRavioliCurrentV2IdentityAddresses(
  identity: RavioliCurrentV2ResumeIdentity = RAVIOLI_CURRENT_V2_RESUME_IDENTITY,
): void {
  for (const address of [
    identity.creatorAddress,
    identity.collectorOneAddress,
    identity.collectorTwoAddress,
  ]) {
    if (validateAddress(address) !== ValidationResult.VALID) fail(`invalid implicit account ${address}`);
  }
  for (const address of [
    identity.gnocchiAddress,
    identity.rotiniAddress,
    identity.controllerAddress,
    identity.routerAddress,
  ]) {
    if (validateContractAddress(address) !== ValidationResult.VALID) fail(`invalid contract account ${address}`);
  }
}
