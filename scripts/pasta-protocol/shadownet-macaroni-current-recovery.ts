#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { MichelsonMap, type TezosToolkit } from "@taquito/taquito";
import { validateAddress, validateContractAddress, validateOperation, ValidationResult } from "@taquito/utils";
import { CID } from "multiformats/cid";
import { chromium, type BrowserContext, type Page } from "playwright";

import {
  hashJsonForBridge,
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLivePinProof,
  type PastaUiLivePreparedOperation,
  type PastaUiLivePublicReceipt,
  type PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import {
  assertMichelsonSemanticScriptCodeIdentity,
  hashMichelsonSemanticScriptCode,
  hashMichelsonScriptCode,
} from "./pasta-michelson-script-identity";
import {
  createHttpGetReader,
  declareReadOnlyReader,
  readWithBoundedRetry,
} from "./pasta-readonly-retry";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  verifyScreenshotSidecar,
  type CapturePastaProofStageResult,
  type PastaProofPageMonitor,
} from "./pasta-proof-screenshot-kit";
import {
  assertMacaroniUiDecodeSafe,
  installMacaroniBrowserAdapters,
  readMacaroniBrowserProjection,
  runMacaroniV1UiLane,
  validateMacaroniSiteArchive,
  type MacaroniV1LaneEvent,
  type MacaroniV1LaneResult,
  type PinnedRecord,
  type WrittenPinArtifact,
} from "./shadownet-macaroni-ui-live";
import {
  assertShadownet,
  buildToolkit,
  deterministicJsonBytes,
  loadSignerPair,
  normalizeBase,
  pollJson,
  ProofBlocked,
  resolveIpfsProofConfig,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

export const MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG =
  "PASTA_SHADOWNET_MACARONI_CURRENT_RECOVERY_EXECUTE";
export const MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG =
  "PASTA_SHADOWNET_MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY";
export const MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG =
  "PASTA_SHADOWNET_MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_EXECUTE";
export const MACARONI_CURRENT_RECOVERY_V1_SUBMITTED_RESUME_FLAG =
  "PASTA_SHADOWNET_MACARONI_CURRENT_RECOVERY_V1_SUBMITTED_RESUME_EXECUTE";
export const MACARONI_CURRENT_RECOVERY_RUN_ID = "pasta-alpha-proof-20260724t053947z";
export const MACARONI_CURRENT_RECOVERY_CONTRACT = "KT1WVXyTLXniTtPaH7AfRsbGVKoG6YLXrBxP";
export const MACARONI_CURRENT_RECOVERY_CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
export const MACARONI_CURRENT_RECOVERY_COLLECTOR = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";

const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const CONTRACT_ARTIFACT_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "macaroni",
  "contract",
  "macaroni-v2.contract.json",
);
const V1_CONTRACT_ARTIFACT_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "macaroni",
  "contract",
  "mydrop.contract.json",
);
const CONTRACT_ARTIFACT_SHA256 = "305f86dc6d3f5191b6c13a9859d16eed2a7ea63422903cf5f5bf444a1012ba6b";
const CONTRACT_CANONICAL_CODE_SHA256 = "69faab8d9714f32b7429be376a041794e90d9b22f3e90dac1e69f27eb933bf3f";
const V1_CONTRACT_ARTIFACT_SHA256 = "e7c5b2be87ba49bb97523dff14dd0edde16dc6a408ebb0fd66da932daa5f514a";
const V1_CONTRACT_CANONICAL_CODE_SHA256 = "faf14364f1c348aa1cd40e7af85a5806ba529ffcd47cf1bf2ed7b5c8bbc7a912";
const PRE_REVEAL_RPC_STORAGE_SHA256 = "cd4e993eb12abeaf49b4fa0ca626d8fbd6d1d2d9b1d0ab39aa18d7e1e58b12f8";
const RECOVERED_PREFIX_INDEXED_STORAGE_SHA256 =
  "dcb2a1a2d2bc2a3e8fc27ebc44f0b58747e4136c70e5654240ac90fdb37949c8";
const CREATOR_COUNTER_FLOOR = 23_831_584;
const COLLECTOR_COUNTER_FLOOR = 23_833_860;
const MINT_PRICE_MUTEZ = 1_000;
const TOKEN_QUANTITY = 2;
const CREATOR_OPERATION_RESERVE_MUTEZ = 2_000_000;
const COLLECTOR_OPERATION_RESERVE_MUTEZ = 750_000;
const CHECKPOINT_RELATIVE_ROOT = "artifacts/macaroni-current-recovery";
const EXACT_PREWRITE_CHECKPOINT_FILES = Object.freeze([
  "events/001-recovered-prefix-accepted.json",
  "events/002-signers-authenticated.json",
  "intent.json",
]);
export const MACARONI_V1_SUBMITTED_OPERATION_HASH =
  "ons68f9ucj5uFfZKdmLdgA93c2RRmsyBkLLwGFBXppahbqyGQoV";
export const MACARONI_V1_SUBMITTED_CONTRACT = "KT1NveyjizYzF4eCfHMEMphHyhk2WGXSFjPx";
const MACARONI_V2_REVEAL_OPERATION_HASH = "opL6Z2vJV1sFqozrZnhziL8T9uh6PfZjmiHNNpVe5eum7Kg2L2V";
const MACARONI_V2_REVEAL_COUNTER = 23_833_861;
const MACARONI_V2_REVEAL_LEVEL = 4_532_139;
const MACARONI_V1_SUBMITTED_EVENT_FILE_SHA256 =
  "56f4a1dcf2ce456d20dd7131ad431d279cc083f9bedf9198156d3e68b9ec503e";
const MACARONI_V1_SUBMITTED_STORAGE_SHA256 =
  "8bd6703596edc581dc84221a7932dc0c607ee747168bded5b63f439d7a2c4c80";
export const MACARONI_V1_SUBMITTED_CHECKPOINT_PHASES = Object.freeze([
  "RECOVERED_PREFIX_ACCEPTED",
  "SIGNERS_AUTHENTICATED",
  "SCREENSHOT_ACCEPTED",
  "EXPECTED_REJECTION",
  "PRE_SIGNER_BOUNDARY_ACCEPTED",
  "PREPARED",
  "SUBMITTED",
  "APPLIED",
  "SCREENSHOT_ACCEPTED",
  "POST_REVEAL_BOUNDARY_ACCEPTED",
  "V1_LANE_STARTED",
  "V1_PIN_PREPARED",
  "V1_PIN_CONFIRMED",
  "V1_PIN_PREPARED",
  "V1_PIN_CONFIRMED",
  "V1_PIN_PREPARED",
  "V1_PIN_CONFIRMED",
  "V1_PIN_PREPARED",
  "V1_PIN_CONFIRMED",
  "V1_PREPARED",
  "V1_SUBMITTED",
]);
const V1_SUBMITTED_CHECKPOINT_FILES = Object.freeze([
  "intent.json",
  ...MACARONI_V1_SUBMITTED_CHECKPOINT_PHASES.map((phase, index) =>
    `events/${String(index + 1).padStart(3, "0")}-${phase.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`),
]);
const V1_SUBMITTED_GENERATED_FILES = Object.freeze([
  "artifacts/screenshot-007-mint-blind-edition-and-enforce-policy-blind-token-minted-and-wallet-limit-enforced.json",
  "artifacts/screenshot-008-permissionless-reveal-collector-revealed-exact-final-artwork.json",
  "artifacts/screenshot-009-configure-classic-blind-drop-v1-instant-reveal-drop-configured.json",
  "artifacts/screenshot-010-pin-v1-media-and-metadata-three-exact-v1-artifacts-pinned-through-studio.json",
  "screenshots/007-mint-blind-edition-and-enforce-policy-blind-token-minted-and-wallet-limit-enforced.png",
  "screenshots/008-permissionless-reveal-collector-revealed-exact-final-artwork.png",
  "screenshots/009-configure-classic-blind-drop-v1-instant-reveal-drop-configured.png",
  "screenshots/010-pin-v1-media-and-metadata-three-exact-v1-artifacts-pinned-through-studio.png",
]);
export const MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT = Object.freeze({
  checkpointId: "47509c109b4feb5ce0b4317767ff55d389efdf73f5dfd990a771b1ef4c862eca",
  createdAt: "2026-08-08T13:43:58.535Z",
  intentSha256: "f510e6934cb9d198747f6c9a1150e70b4829487a5359c11e9c8865561c52f8e7",
  recoveredPrefixEventSha256: "b147810b005bac9624b0231a53d0a5953abd52f83a883a5fe724e8c59cf060bd",
  signersAuthenticatedEventSha256: "93f22ef85b5f17590e1237c0b8b9a8a7ebdc27c1d472f988d9bf0d9c2e3e5371",
  lastEventIndex: 2,
});
export type MacaroniRecoveryCheckpointDocumentIdentity = Readonly<{
  checkpointId: string;
  createdAt: string;
  intentSha256: string;
  recoveredPrefixEventSha256: string;
  signersAuthenticatedEventSha256: string;
  lastEventIndex: number;
  v1SubmittedEventFileSha256: string;
}>;
const MACARONI_CURRENT_RECOVERY_DOCUMENT_IDENTITY: MacaroniRecoveryCheckpointDocumentIdentity =
  Object.freeze({
    ...MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT,
    v1SubmittedEventFileSha256: MACARONI_V1_SUBMITTED_EVENT_FILE_SHA256,
  });
const FINAL_METADATA_URI = "ipfs://bafkreie24ie765ditt34hymqx2fvdwi4ynsqvxz7qam357htvow3hbdesu";
const PLACEHOLDER_METADATA_URI = "ipfs://bafkreibzp3polkqhahkivz7epfdjgzwq577b2cmgmjkxk4r7yhnzwoxlae";
const FINAL_METADATA_HEX = utf8ToHex(FINAL_METADATA_URI);
const PLACEHOLDER_METADATA_HEX = utf8ToHex(PLACEHOLDER_METADATA_URI);
const REQUIRED_SITE_FILES = Object.freeze([
  "css/theme.css",
  "drop.config.js",
  "index.html",
  "js/common.js",
  "js/drop.js",
  "js/octez-wallet.js",
  "vendor/octez-connect.js",
  "vendor/tezos.js",
]);

type JsonObject = Record<string, any>;
type RecoveryPhase = "pre-reveal" | "post-reveal";

export const MACARONI_RECOVERED_OPERATIONS = Object.freeze([
  {
    kind: "origination",
    hash: "ooEt4xX1dDLdnwKfUEr8eVN34vgXzzAwtRBQ23scdBVx23iP5fC",
    counter: 23_831_582,
    level: 4_331_128,
    sender: MACARONI_CURRENT_RECOVERY_CREATOR,
    entrypoint: null,
  },
  {
    kind: "publish",
    hash: "opBtLfhynMdLnFNd3HBEmASnBqxfUoHK6dXhbmqp1cyTQaMhu3J",
    counter: 23_831_583,
    level: 4_331_131,
    sender: MACARONI_CURRENT_RECOVERY_CREATOR,
    entrypoint: "add_tokens_v2",
  },
  {
    kind: "configure",
    hash: "oojGxauezeco6LiTaT3rJaS33RJHR3mhzsa2vdsqL3Lq7PaLtmp",
    counter: 23_831_584,
    level: 4_331_132,
    sender: MACARONI_CURRENT_RECOVERY_CREATOR,
    entrypoint: "set_stages",
  },
  {
    kind: "mint",
    hash: "opNNNSiJDzu2zvcWAUXYhuXWFB1RBXA2GncKrt2AHiAWvxuxHsB",
    counter: 23_833_860,
    level: 4_331_137,
    sender: MACARONI_CURRENT_RECOVERY_COLLECTOR,
    entrypoint: "mint",
  },
] as const);

export const MACARONI_RECOVERED_CONTENT = Object.freeze([
  {
    fileName: "macaroni-cover.png",
    cid: "bafkreih3qfqmfxvemvzyz3of4p4rgf6fnjqqjwnptigm6od2tbaeikdwhu",
    byteLength: 14_182,
    sha256: "fb8160c2dea465738cedc5e3f91317c56a6104d9af9a0ccf387a98404428763d",
    mimeType: "image/png",
  },
  {
    fileName: "macaroni-placeholder.png",
    cid: "bafkreigyh6k3avdozhcpoouxg7mux4yzy4au2dcig2o6soxekl4e3bzmcq",
    byteLength: 14_190,
    sha256: "d83f95b0546ec9c4f73a9737d94bf319c7014d0c48369de93ae452f84d872c14",
    mimeType: "image/png",
  },
  {
    fileName: "placeholder-1.json",
    cid: "bafkreibzp3polkqhahkivz7epfdjgzwq577b2cmgmjkxk4r7yhnzwoxlae",
    byteLength: 697,
    sha256: "397edee5aa0701d48ae7e479469366d0effe1d0986625575723fc1db9b3aeb01",
    mimeType: "application/json",
  },
  {
    fileName: "1.png",
    cid: "bafkreicadbqmw6jtdc5wiwi2lu5ucnmw5zzjki6thspa6mlkfscsx2vmbe",
    byteLength: 14_163,
    sha256: "401860cb793318bb64591a5d3b413596ee729523d33c9e0f316a2c852beaac09",
    mimeType: "image/png",
  },
  {
    fileName: "1.json",
    cid: "bafkreie24ie765ditt34hymqx2fvdwi4ynsqvxz7qam357htvow3hbdesu",
    byteLength: 708,
    sha256: "9ae209ff74689cf7c3e190be8b51d91cc3650adf3f8019befcf3abadb3846495",
    mimeType: "application/json",
  },
  {
    fileName: "contract_metadata.json",
    cid: "bafkreiazuy3mrgzlzkfccphw6k7ktc44ze4viwg2gpvxkxm4vduilcteg4",
    byteLength: 385,
    sha256: "19a636c89b2bca8a213cf6f2bea98b9cc9395458da33eb755d9ca8e8858a6437",
    mimeType: "application/json",
  },
] as const);

const PREFIX_FILES = Object.freeze({
  "artifacts/macaroni-site.zip":
    "ada620547c96dcaa01fc4f60fbe1f0c0050d008315f352a2a969b5f5f3a3e253",
  "artifacts/screenshot-001-configure-blind-drop-v2-delayed-reveal-drop-configured.json":
    "f0a4e71f054cf3b6d631ca4d7392f8e666bb993028be414d2020e5c15338dd7b",
  "artifacts/screenshot-002-pin-exact-media-and-metadata-five-media-and-metadata-artifacts-pinned-through-studio.json":
    "5c531696579b8ff4977af2a206f1be48557972557b799d9e2764cb567525378b",
  "artifacts/screenshot-003-originate-fresh-contract-fresh-macaroni-v2-contract-originated.json":
    "313645ef6b29d6f343f2ae07b7953a121b9694757e0e40152e951457a8b8f32e",
  "artifacts/screenshot-004-load-editions-and-stage-two-editions-and-one-per-wallet-stage-synced.json":
    "c0332df530e4c353e268b17dbaa51bc4eff0774eb55fc3fe94841cc095d27fd6",
  "artifacts/screenshot-005-export-self-hosted-mint-site-standalone-collector-website-exported.json":
    "9d7cb2dad8b4e256b74d48d7c63e184a72872065f0939d86960cc4bfabb4f68e",
  "artifacts/screenshot-006-operate-exported-collector-page-independent-collector-opened-exported-website.json":
    "3f4c74282938c852f2aa0057ecae21bd238ed18744fd742ef91fa0030d6153c1",
  "artifacts/self-hosted-site/css/theme.css":
    "d9ebef8e00c7893b6e486c2677cb5beff6594eb6cf9eb1bf114888ee7017f757",
  "artifacts/self-hosted-site/drop.config.js":
    "ad303dd6b83f41e0b63bbe79f98785596942882688024f07de7141c6fd02c04a",
  "artifacts/self-hosted-site/index.html":
    "e5ccac30d930b4acbf4e918f9e622832026a48daa12bbc957b450a8c59dae7cb",
  "artifacts/self-hosted-site/js/common.js":
    "b63b5787e1d39498222bc1a54cb5fd487bb898f8c2d771c61f338e6adffad50d",
  "artifacts/self-hosted-site/js/drop.js":
    "b939c70ce89b19a03fe2680c6eedddd2d11b8b27c752126fa4224ce762702c41",
  "artifacts/self-hosted-site/js/octez-wallet.js":
    "c102985d275b5673fc65a51cd88cfa2a527a94a3924b1b1ca20244d4b0a89a11",
  "artifacts/self-hosted-site/vendor/octez-connect.js":
    "4347c7420e8f4b9e5ee110ce604bf834ef5b3a02ef5c34a7db764557717f594f",
  "artifacts/self-hosted-site/vendor/tezos.js":
    "529c8312b3275d1cd372c457ba8457cdbd199f50a28313c977bdf0bdf1bcad97",
  "screenshots/001-configure-blind-drop-v2-delayed-reveal-drop-configured.png":
    "518a2649151b9adc80a7129aa8c9c4973b15210e45218dbe296a152b0c59342a",
  "screenshots/002-pin-exact-media-and-metadata-five-media-and-metadata-artifacts-pinned-through-studio.png":
    "c42eb6d71fea334dd3ebed232b0cdbbca3915ef8c63e3cd8598468029b2be502",
  "screenshots/003-originate-fresh-contract-fresh-macaroni-v2-contract-originated.png":
    "812cdb49dd6b1598e6b333d637261ffed17eb6d3ff39630f043a80d4e5ec97fd",
  "screenshots/004-load-editions-and-stage-two-editions-and-one-per-wallet-stage-synced.png":
    "990eec6484d80e6f60746365007dafc64eea8f465946296fd21d762a51b5c1b3",
  "screenshots/005-export-self-hosted-mint-site-standalone-collector-website-exported.png":
    "eac16e99805f17ea13f5ff9ba4b76970048e7327276b58428b941b2423386844",
  "screenshots/006-operate-exported-collector-page-independent-collector-opened-exported-website.png":
    "a5879695c170e6f70b7e8123d4587b2dc602fdba4fef823b85f79d2965a843c5",
});

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalSha256(value: unknown): string {
  return sha256(deterministicJsonBytes(value));
}

function objectValue(value: unknown, label: string): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function safeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  assert.ok(Number.isSafeInteger(parsed) && parsed >= 0, `${label} must be a non-negative safe integer`);
  return parsed;
}

function addressOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return String((value as JsonObject).address || "");
}

export function assertMacaroniCurrentRecoveryAllowed(
  environment: Record<string, string | undefined>,
): string {
  const execute = environment[MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG] === "1";
  const preflight = environment[MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG] === "1";
  const prewriteResumeValue = environment[MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG];
  const prewriteResume = prewriteResumeValue === "1";
  const v1SubmittedResumeValue = environment[MACARONI_CURRENT_RECOVERY_V1_SUBMITTED_RESUME_FLAG];
  const v1SubmittedResume = v1SubmittedResumeValue === "1";
  if (prewriteResumeValue !== undefined && !prewriteResume) {
    throw new Error(
      `${MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG} must be exactly 1 or unset`,
    );
  }
  if (v1SubmittedResumeValue !== undefined && !v1SubmittedResume) {
    throw new Error(
      `${MACARONI_CURRENT_RECOVERY_V1_SUBMITTED_RESUME_FLAG} must be exactly 1 or unset`,
    );
  }
  if (prewriteResume && v1SubmittedResume) {
    throw new Error("Macaroni pre-write and V1-submitted resume modes are mutually exclusive");
  }
  if ((prewriteResume || v1SubmittedResume) && !execute && !preflight) {
    throw new Error("Macaroni resume requires an explicit execute or preflight-only flag");
  }
  if (!execute && !preflight) {
    throw new Error(
      `${MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG}=1 or ` +
        `${MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG}=1 is required`,
    );
  }
  if (execute && preflight) throw new Error("Macaroni recovery execute and preflight-only modes are mutually exclusive");
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    throw new Error("Macaroni current recovery permits Shadownet only");
  }
  const runRoot = path.resolve(environment[OUTPUT_ENV] || "");
  if (!environment[OUTPUT_ENV]?.trim() || path.basename(runRoot) !== MACARONI_CURRENT_RECOVERY_RUN_ID) {
    throw new Error(`Macaroni recovery requires the exact interrupted run ${MACARONI_CURRENT_RECOVERY_RUN_ID}`);
  }
  for (const key of [
    "PASTA_SHADOWNET_MACARONI_UI_LIVE_EXECUTE",
    "PASTA_SHADOWNET_MACARONI_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_MACARONI_UI_LIVE_RESUME",
    "PASTA_SHADOWNET_MACARONI_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) throw new Error(`unset ${key}; ordinary Macaroni replay is forbidden`);
  }
  return runRoot;
}

export function assertMacaroniRecoveryCounterBoundary(
  primary: { creator: number; collector: number },
  fallback: { creator: number; collector: number },
): { creator: number; collector: number } {
  assert.deepEqual(primary, fallback, "configured RPC actor counter disagreement");
  assert.ok(primary.creator >= CREATOR_COUNTER_FLOOR, "creator counter is below the authenticated floor");
  assert.ok(primary.collector >= COLLECTOR_COUNTER_FLOOR, "collector counter is below the authenticated floor");
  return { ...primary };
}

function assertRecoveredTransaction(row: JsonObject, expected: typeof MACARONI_RECOVERED_OPERATIONS[number]): void {
  assert.equal(row.hash, expected.hash, `${String(expected.entrypoint)} hash drift`);
  assert.equal(safeInteger(row.counter, "transaction counter"), expected.counter, `${String(expected.entrypoint)} counter drift`);
  assert.equal(safeInteger(row.level, "transaction level"), expected.level, `${String(expected.entrypoint)} level drift`);
  assert.equal(row.status, "applied", `${String(expected.entrypoint)} status drift`);
  assert.equal(addressOf(row.sender), expected.sender, `${String(expected.entrypoint)} sender drift`);
  assert.equal(addressOf(row.target), MACARONI_CURRENT_RECOVERY_CONTRACT, `${String(expected.entrypoint)} target drift`);
  assert.equal(row.parameter?.entrypoint, expected.entrypoint, `${String(expected.entrypoint)} entrypoint drift`);
  if (expected.entrypoint === "add_tokens_v2") {
    assert.deepEqual(row.parameter.value, [{
      quantity: "2",
      token_id: "0",
      token_info: { "": FINAL_METADATA_HEX },
    }]);
    assert.equal(safeInteger(row.amount, "add_tokens_v2 amount"), 0);
  } else if (expected.entrypoint === "set_stages") {
    assert.deepEqual(row.parameter.value, {
      "0": {
        price: "1000",
        start: "2026-07-24T13:12:00Z",
        use_allowlist: false,
        max_per_wallet: "1",
      },
    });
    assert.equal(safeInteger(row.amount, "set_stages amount"), 0);
  } else {
    assert.equal(String(row.parameter.value), "1");
    assert.equal(safeInteger(row.amount, "mint amount"), MINT_PRICE_MUTEZ);
  }
}

export function assertMacaroniRecoveryTargetHistory(
  input: {
    originations: unknown;
    transactions: unknown;
    internalTransactions: unknown;
  },
  options: {
    phase: RecoveryPhase;
    revealOperationHash?: string;
    revealCounter?: number;
  },
): void {
  assert.ok(Array.isArray(input.originations) && input.originations.length === 1, "expected exactly one origination");
  const origin = objectValue(input.originations[0], "Macaroni origination");
  const expectedOrigin = MACARONI_RECOVERED_OPERATIONS[0];
  assert.equal(origin.hash, expectedOrigin.hash);
  assert.equal(safeInteger(origin.counter, "origination counter"), expectedOrigin.counter);
  assert.equal(safeInteger(origin.level, "origination level"), expectedOrigin.level);
  assert.equal(origin.status, "applied");
  assert.equal(addressOf(origin.sender), MACARONI_CURRENT_RECOVERY_CREATOR);
  assert.equal(addressOf(origin.originatedContract), MACARONI_CURRENT_RECOVERY_CONTRACT);
  assert.equal(origin.originatedContract?.kind, "asset");
  assert.deepEqual(origin.originatedContract?.tzips, ["fa2"]);
  assert.equal(origin.originatedContract?.codeHash, -2085531756);
  assert.equal(origin.originatedContract?.typeHash, -1198466749);

  const expectedCount = options.phase === "pre-reveal" ? 3 : 4;
  assert.ok(
    Array.isArray(input.transactions) && input.transactions.length === expectedCount,
    `Macaroni target must have exactly ${expectedCount === 3 ? "three" : "four"} applied root transactions`,
  );
  const ordered = [...input.transactions].sort((left: any, right: any) =>
    safeInteger(left.level, "left level") - safeInteger(right.level, "right level"));
  for (const [index, expected] of MACARONI_RECOVERED_OPERATIONS.slice(1).entries()) {
    assertRecoveredTransaction(objectValue(ordered[index], `transaction ${index + 1}`), expected);
  }
  if (options.phase === "post-reveal") {
    assert.ok(options.revealOperationHash, "post-reveal history requires the submitted reveal hash");
    assert.ok(Number.isSafeInteger(options.revealCounter), "post-reveal history requires the exact reveal counter");
    const reveal = objectValue(ordered[3], "reveal transaction");
    assert.equal(reveal.hash, options.revealOperationHash, "reveal hash drift");
    assert.equal(safeInteger(reveal.counter, "reveal counter"), options.revealCounter, "reveal counter drift");
    assert.equal(reveal.status, "applied");
    assert.equal(addressOf(reveal.sender), MACARONI_CURRENT_RECOVERY_COLLECTOR, "reveal sender drift");
    assert.equal(addressOf(reveal.target), MACARONI_CURRENT_RECOVERY_CONTRACT, "reveal target drift");
    assert.equal(reveal.parameter?.entrypoint, "reveal");
    assert.equal(String(reveal.parameter?.value), "1");
    assert.equal(safeInteger(reveal.amount, "reveal amount"), 0);
  }

  assert.ok(
    Array.isArray(input.internalTransactions) && input.internalTransactions.length === 1,
    "expected exactly one internal treasury transfer",
  );
  const internal = objectValue(input.internalTransactions[0], "internal treasury transfer");
  const mint = MACARONI_RECOVERED_OPERATIONS[3];
  assert.equal(internal.hash, mint.hash);
  assert.equal(safeInteger(internal.counter, "internal counter"), mint.counter);
  assert.equal(safeInteger(internal.level, "internal level"), mint.level);
  assert.equal(internal.status, "applied");
  assert.equal(safeInteger(internal.nonce, "internal nonce"), 1);
  assert.equal(addressOf(internal.initiator), MACARONI_CURRENT_RECOVERY_COLLECTOR);
  assert.equal(addressOf(internal.sender), MACARONI_CURRENT_RECOVERY_CONTRACT);
  assert.equal(addressOf(internal.target), MACARONI_CURRENT_RECOVERY_CREATOR);
  assert.equal(safeInteger(internal.amount, "internal amount"), MINT_PRICE_MUTEZ);
}

async function durableWriteExclusive(filePath: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function listRegularFiles(rootPath: string, relative = ""): Promise<string[]> {
  const directory = path.join(rootPath, relative);
  const names = (await readdir(directory)).sort();
  const files: string[] = [];
  for (const name of names) {
    const child = relative ? `${relative}/${name}` : name;
    const details = await lstat(path.join(rootPath, child));
    assert.equal(details.isSymbolicLink(), false, `${child} must not be a symlink`);
    if (details.isDirectory()) files.push(...await listRegularFiles(rootPath, child));
    else {
      assert.ok(details.isFile(), `${child} must be a regular file`);
      files.push(child);
    }
  }
  return files;
}

async function validatePrefixInventory(
  appRoot: string,
  options: {
    exactPrewriteCheckpointPresent?: boolean;
    exactCheckpointFiles?: readonly string[];
    allowedGeneratedFiles?: readonly string[];
  } = {},
): Promise<{
  files: Array<{ path: string; byteLength: number; sha256: string }>;
  inventorySha256: string;
}> {
  const allFiles = await listRegularFiles(appRoot);
  const checkpointPrefix = `${CHECKPOINT_RELATIVE_ROOT}/`;
  const checkpointFiles = allFiles
    .filter((relativePath) => relativePath.startsWith(checkpointPrefix))
    .map((relativePath) => relativePath.slice(checkpointPrefix.length));
  const expectedCheckpointFiles = options.exactCheckpointFiles ??
    (options.exactPrewriteCheckpointPresent ? EXACT_PREWRITE_CHECKPOINT_FILES : undefined);
  if (expectedCheckpointFiles) {
    assert.deepEqual(
      checkpointFiles,
      [...expectedCheckpointFiles].sort(),
      "Macaroni checkpoint inventory drift",
    );
  } else {
    assert.deepEqual(checkpointFiles, [], "fresh Macaroni recovery refuses an existing checkpoint");
  }
  const nonCheckpointFiles = allFiles.filter((relativePath) => !relativePath.startsWith(checkpointPrefix));
  const generatedFiles = nonCheckpointFiles.filter((relativePath) =>
    !Object.prototype.hasOwnProperty.call(PREFIX_FILES, relativePath));
  assert.deepEqual(
    generatedFiles,
    [...(options.allowedGeneratedFiles ?? [])].sort(),
    "Macaroni generated continuation inventory drift",
  );
  const files = nonCheckpointFiles.filter((relativePath) =>
    Object.prototype.hasOwnProperty.call(PREFIX_FILES, relativePath));
  assert.deepEqual(files, Object.keys(PREFIX_FILES).sort(), "Macaroni interrupted prefix inventory drift");
  const records = [];
  for (const relativePath of files) {
    const bytes = await readFile(path.join(appRoot, relativePath));
    const digest = sha256(bytes);
    assert.equal(digest, PREFIX_FILES[relativePath as keyof typeof PREFIX_FILES], `${relativePath} hash drift`);
    records.push({ path: relativePath, byteLength: bytes.byteLength, sha256: digest });
  }
  return { files: records, inventorySha256: canonicalSha256(records) };
}

async function fetchBytes(url: string, label: string): Promise<Uint8Array> {
  return readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      headers: { accept: "*/*", "user-agent": "wtfos-pasta-macaroni-current-recovery" },
      parse: async (response) => new Uint8Array(await response.arrayBuffer()),
    }),
  }, { maxAttempts: 6, deadlineMs: 60_000 });
}

async function fetchJson(url: string, label: string): Promise<any> {
  return readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      headers: { accept: "application/json", "user-agent": "wtfos-pasta-macaroni-current-recovery" },
      parse: async (response) => response.json(),
    }),
  }, { maxAttempts: 6, deadlineMs: 60_000 });
}

export async function readMacaroniCurrentRecoveryProjection(
  tezos: TezosToolkit,
  contractAddress: string,
  holderAddress: string,
  fallbackTezos?: TezosToolkit,
): Promise<Awaited<ReturnType<typeof readMacaroniBrowserProjection>>> {
  return readWithBoundedRetry({
    primary: declareReadOnlyReader(
      "Macaroni recovery primary projection",
      () => readMacaroniBrowserProjection(tezos, contractAddress, holderAddress),
    ),
    ...(fallbackTezos ? {
      fallback: declareReadOnlyReader(
        "Macaroni recovery fallback projection",
        () => readMacaroniBrowserProjection(fallbackTezos, contractAddress, holderAddress),
      ),
    } : {}),
  }, { maxAttempts: 6, deadlineMs: 60_000 });
}

function assertRawSha256Content(
  expected: typeof MACARONI_RECOVERED_CONTENT[number],
  bytes: Uint8Array,
): void {
  assert.equal(bytes.byteLength, expected.byteLength, `${expected.fileName} byte length drift`);
  assert.equal(sha256(bytes), expected.sha256, `${expected.fileName} SHA-256 drift`);
  const cid = CID.parse(expected.cid);
  assert.equal(cid.version, 1);
  assert.equal(cid.code, 0x55, `${expected.fileName} must use the raw CID codec`);
  assert.equal(cid.multihash.code, 0x12, `${expected.fileName} must use SHA-256`);
  assert.equal(Buffer.from(cid.multihash.digest).toString("hex"), expected.sha256);
  if (expected.mimeType === "application/json") {
    assert.doesNotThrow(() => JSON.parse(Buffer.from(bytes).toString("utf8")), `${expected.fileName} must be JSON`);
  }
}

async function readRecoveredContent(ipfs: IpfsProofConfig): Promise<Array<
  typeof MACARONI_RECOVERED_CONTENT[number] & { bytes: Uint8Array; sources: string[] }
>> {
  const configured = normalizeBase(ipfs.publicGatewayUrl);
  const alternate = new URL(configured).hostname === "ipfs.fileship.xyz"
    ? "https://dweb.link/ipfs"
    : "https://ipfs.fileship.xyz";
  const output = [];
  for (const expected of MACARONI_RECOVERED_CONTENT) {
    const sources = [`${configured}/${expected.cid}`, `${alternate}/${expected.cid}`];
    const [primary, independent] = await Promise.all([
      fetchBytes(sources[0], `${expected.fileName} configured public IPFS bytes`),
      fetchBytes(sources[1], `${expected.fileName} independent public IPFS bytes`),
    ]);
    assertRawSha256Content(expected, primary);
    assertRawSha256Content(expected, independent);
    assert.deepEqual(primary, independent, `${expected.fileName} differs across public gateways`);
    output.push({ ...expected, bytes: primary, sources });
  }
  return output;
}

function normalizeActiveMempoolLane(value: unknown): JsonObject[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value as JsonObject)
      : [];
  return entries.flatMap((entry) => {
    const candidate = Array.isArray(entry) && entry.length === 2 ? entry[1] : entry;
    return candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? [candidate as JsonObject]
      : [];
  });
}

export function relevantMempoolOperations(value: unknown): JsonObject[] {
  const mempool = objectValue(value, "RPC mempool");
  const actors = new Set([MACARONI_CURRENT_RECOVERY_CREATOR, MACARONI_CURRENT_RECOVERY_COLLECTOR]);
  return ["applied", "validated", "branch_delayed", "unprocessed"]
    .flatMap((bucket) => normalizeActiveMempoolLane(mempool[bucket]))
    .filter((operation) => {
      return operation.contents?.some((content: any) =>
        actors.has(String(content?.source || "")) ||
        String(content?.destination || "") === MACARONI_CURRENT_RECOVERY_CONTRACT);
    });
}

async function readRpcSnapshot(
  rpcUrl: string,
  phase: RecoveryPhase,
  block: string | number = "head",
): Promise<{
  rpcUrl: string;
  chainId: string;
  storage: unknown;
  storageSha256: string;
  codeSha256: string;
  counters: { creator: number; collector: number };
}> {
  const base = normalizeBase(rpcUrl);
  const blockId = encodeURIComponent(String(block));
  const contractPath = `/chains/main/blocks/${blockId}/context/contracts/${MACARONI_CURRENT_RECOVERY_CONTRACT}`;
  const [chainId, storage, script, creatorCounter, collectorCounter, mempool] = await Promise.all([
    fetchJson(`${base}/chains/main/chain_id`, `${rpcUrl} chain id`),
    fetchJson(`${base}${contractPath}/storage`, `${rpcUrl} Macaroni storage`),
    fetchJson(`${base}${contractPath}/script`, `${rpcUrl} Macaroni script`),
    fetchJson(
      `${base}/chains/main/blocks/${blockId}/context/contracts/${MACARONI_CURRENT_RECOVERY_CREATOR}/counter`,
      `${rpcUrl} creator counter`,
    ),
    fetchJson(
      `${base}/chains/main/blocks/${blockId}/context/contracts/${MACARONI_CURRENT_RECOVERY_COLLECTOR}/counter`,
      `${rpcUrl} collector counter`,
    ),
    fetchJson(`${base}/chains/main/mempool/pending_operations`, `${rpcUrl} mempool`),
  ]);
  assert.equal(chainId, SHADOWNET_CHAIN_ID, `${rpcUrl} is not Shadownet`);
  assert.equal(relevantMempoolOperations(mempool).length, 0, `${rpcUrl} contains a relevant pending operation`);
  const scriptCode = objectValue(script, `${rpcUrl} script`).code;
  assert.equal(
    hashMichelsonScriptCode(scriptCode),
    CONTRACT_CANONICAL_CODE_SHA256,
    `${rpcUrl} Macaroni code identity drift`,
  );
  const storageSha256 = canonicalSha256(storage);
  if (phase === "pre-reveal") {
    assert.equal(storageSha256, PRE_REVEAL_RPC_STORAGE_SHA256, `${rpcUrl} pre-reveal storage drift`);
  }
  return {
    rpcUrl,
    chainId,
    storage,
    storageSha256,
    codeSha256: hashMichelsonScriptCode(scriptCode),
    counters: {
      creator: safeInteger(creatorCounter, `${rpcUrl} creator counter`),
      collector: safeInteger(collectorCounter, `${rpcUrl} collector counter`),
    },
  };
}

async function readTargetHistory(maximumLevel?: number): Promise<{
  originations: JsonObject[];
  transactions: JsonObject[];
  internalTransactions: JsonObject[];
}> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const contract = encodeURIComponent(MACARONI_CURRENT_RECOVERY_CONTRACT);
  const levelFilter = maximumLevel === undefined ? "" : `&level.le=${maximumLevel}`;
  const [originations, transactions, internalTransactions] = await Promise.all([
    fetchJson(
      `${base}/operations/originations?originatedContract=${contract}&status=applied${levelFilter}&limit=10`,
      "Macaroni recovery originations",
    ),
    fetchJson(
      `${base}/operations/transactions?target=${contract}&status=applied${levelFilter}&limit=100`,
      "Macaroni recovery target transactions",
    ),
    fetchJson(
      `${base}/operations/transactions?sender=${contract}&status=applied${levelFilter}&limit=100`,
      "Macaroni recovery internal transactions",
    ),
  ]);
  return { originations, transactions, internalTransactions };
}

function assertSingleMapRow(
  rows: unknown,
  label: string,
  predicate: (row: JsonObject) => boolean,
): JsonObject {
  assert.ok(Array.isArray(rows), `${label} rows must be an array`);
  const matches = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row) && predicate(row));
  assert.equal(rows.length, 1, `${label} must have exactly one active row`);
  assert.equal(matches.length, 1, `${label} active row drift`);
  return matches[0];
}

async function readIndexedStorage(phase: RecoveryPhase, level?: number): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const contract = encodeURIComponent(MACARONI_CURRENT_RECOVERY_CONTRACT);
  const storage = objectValue(
    await fetchJson(
      `${base}/contracts/${contract}/storage${level === undefined ? "" : `?level=${level}`}`,
      "Macaroni indexed storage",
    ),
    "Macaroni indexed storage",
  );
  const mapNames = [
    "ledger",
    "metadata",
    "first_minter",
    "minter_pool",
    "reveal_queue",
    "stage_minted",
    "token_minted",
    "token_supply",
    "pending_tokens",
    "token_metadata",
    "placeholder_pool",
    "token_placeholder",
  ] as const;
  const mapRows = Object.fromEntries(await Promise.all(mapNames.map(async (name) => {
    const id = safeInteger(storage[name], `${name} big-map id`);
    return [
      name,
      await fetchJson(
        level === undefined
          ? `${base}/bigmaps/${id}/keys?active=true&limit=100`
          : `${base}/bigmaps/${id}/historical_keys/${level}?active=true&limit=100`,
        `Macaroni ${name} rows`,
      ),
    ];
  })));
  const [tokens, balances] = await Promise.all([
    fetchJson(`${base}/tokens?contract=${contract}&tokenId=0&limit=10`, "Macaroni indexed token"),
    fetchJson(
      `${base}/tokens/balances?token.contract=${contract}&token.tokenId=0&balance.ne=0&limit=100`,
      "Macaroni indexed balances",
    ),
  ]);
  assert.equal(storage.administrator, MACARONI_CURRENT_RECOVERY_CREATOR);
  assert.equal(storage.treasury, MACARONI_CURRENT_RECOVERY_CREATOR);
  assert.equal(String(storage.supply), "2");
  assert.equal(String(storage.minted), "1");
  assert.equal(String(storage.token_count), "1");
  assert.equal(storage.locked, false);
  assert.equal(storage.paused, false);
  assert.equal(storage.delayed_reveal, true);
  assert.equal(String(storage.placeholder_count), "1");
  assert.equal(String(storage.reveal_delay), "0");
  assert.equal(String(storage.reveal_tail), "1");
  assert.deepEqual(storage.stages, {
    "0": {
      price: "1000",
      start: "2026-07-24T13:12:00Z",
      use_allowlist: false,
      max_per_wallet: "1",
    },
  });
  if (phase === "pre-reveal") {
    assert.equal(String(storage.reveal_cursor), "0");
    assert.equal(String(storage.revealed), "0");
    assert.equal(storage.unrevealed_since, "2026-07-24T20:15:39Z");
  } else {
    assert.equal(String(storage.reveal_cursor), "1");
    assert.equal(String(storage.revealed), "1");
    assert.equal(storage.unrevealed_since, null);
  }
  assertSingleMapRow(mapRows.ledger, "collector ledger", (row) =>
    row.key?.owner === MACARONI_CURRENT_RECOVERY_COLLECTOR &&
    String(row.key?.token_id) === "0" && String(row.value) === "1");
  assertSingleMapRow(mapRows.metadata, "collection metadata", (row) =>
    row.key === "" && row.value === utf8ToHex("ipfs://bafkreiazuy3mrgzlzkfccphw6k7ktc44ze4viwg2gpvxkxm4vduilcteg4"));
  assert.deepEqual(mapRows.first_minter, []);
  assert.deepEqual(mapRows.minter_pool, []);
  assertSingleMapRow(mapRows.stage_minted, "collector stage mint", (row) =>
    String(row.key?.stage) === "0" && row.key?.holder === MACARONI_CURRENT_RECOVERY_COLLECTOR &&
    String(row.value) === "1");
  assertSingleMapRow(mapRows.token_minted, "token minted", (row) =>
    String(row.key) === "0" && String(row.value) === "1");
  assertSingleMapRow(mapRows.token_supply, "token supply", (row) =>
    String(row.key) === "0" && String(row.value) === "2");
  assertSingleMapRow(mapRows.pending_tokens, "pending final metadata", (row) =>
    String(row.key) === "0" && row.value?.token_info?.[""] === FINAL_METADATA_HEX);
  assertSingleMapRow(mapRows.placeholder_pool, "placeholder pool", (row) =>
    String(row.key) === "0" && row.value?.token_info?.[""] === PLACEHOLDER_METADATA_HEX);
  if (phase === "pre-reveal") {
    assertSingleMapRow(mapRows.reveal_queue, "reveal queue", (row) =>
      String(row.key) === "0" && String(row.value) === "0");
    assertSingleMapRow(mapRows.token_placeholder, "token placeholder", (row) =>
      String(row.key) === "0" && String(row.value) === "0");
    assertSingleMapRow(mapRows.token_metadata, "placeholder token metadata", (row) =>
      String(row.key) === "0" && row.value?.token_info?.[""] === PLACEHOLDER_METADATA_HEX);
  } else {
    assert.ok(Array.isArray(mapRows.token_placeholder) && mapRows.token_placeholder.length === 0);
    assertSingleMapRow(mapRows.token_metadata, "final token metadata", (row) =>
      String(row.key) === "0" && row.value?.token_info?.[""] === FINAL_METADATA_HEX);
  }
  assert.ok(Array.isArray(tokens) && tokens.length === 1, "expected exactly one indexed token");
  assert.equal(addressOf(tokens[0]?.contract), MACARONI_CURRENT_RECOVERY_CONTRACT);
  assert.equal(String(tokens[0]?.tokenId), "0");
  assert.ok(Array.isArray(balances) && balances.length === 1, "expected exactly one non-zero token balance");
  assert.equal(addressOf(balances[0]?.account), MACARONI_CURRENT_RECOVERY_COLLECTOR);
  assert.equal(String(balances[0]?.balance), "1");
  return { storage, mapRows, tokens, balances };
}

function screenshotStemFromSidecarPath(relativePath: string): string {
  return path.posix.basename(relativePath).replace(/^screenshot-/, "").replace(/\.json$/, "");
}

async function loadScreenshotEvidence(
  appRoot: string,
  sidecarPaths: readonly string[],
  expectedFirstOrdinal: number,
): Promise<CapturePastaProofStageResult[]> {
  const captures: CapturePastaProofStageResult[] = [];
  for (const sidecarRelativePath of [...sidecarPaths].sort()) {
    const filenameStem = screenshotStemFromSidecarPath(sidecarRelativePath);
    const pngRelativePath = `screenshots/${filenameStem}.png`;
    const pngPath = path.join(appRoot, pngRelativePath);
    const sidecarPath = path.join(appRoot, sidecarRelativePath);
    const sidecar = await verifyScreenshotSidecar(pngPath, sidecarPath);
    assert.equal(sidecar.app, "macaroni");
    assert.equal(sidecar.stageOrdinal, expectedFirstOrdinal + captures.length);
    const sidecarBytes = await readFile(sidecarPath);
    captures.push({
      appDirectory: appRoot,
      pngPath,
      sidecarPath,
      pngRelativePath,
      sidecarRelativePath,
      filenameStem,
      sidecar,
      manifestScreenshot: {
        stage: filenameStem,
        path: pngRelativePath,
        sha256: sidecar.sha256,
        caption: `macaroni: ${sidecar.capability} — ${sidecar.stageName}`,
      },
      manifestSidecarArtifact: {
        id: `screenshot-sidecar-${filenameStem}`,
        kind: "screenshot-sidecar",
        path: sidecarRelativePath,
        sha256: sha256(sidecarBytes),
      },
    });
  }
  return captures;
}

async function loadRecoveredScreenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  const sidecarPaths = Object.keys(PREFIX_FILES)
    .filter((value) => /^artifacts\/screenshot-\d{3}-.+\.json$/.test(value));
  const captures = await loadScreenshotEvidence(appRoot, sidecarPaths, 1);
  assert.equal(captures.length, 6);
  return captures;
}

async function loadAppliedRevealScreenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  const sidecarPaths = V1_SUBMITTED_GENERATED_FILES.filter((value) =>
    /^artifacts\/screenshot-00[78]-.+\.json$/.test(value));
  const captures = await loadScreenshotEvidence(appRoot, sidecarPaths, 7);
  assert.equal(captures.length, 2);
  return captures;
}

export async function validateMacaroniRecoveryPreflight(
  runRoot: string,
  ipfs: IpfsProofConfig,
  options: {
    exactPrewriteCheckpointPresent?: boolean;
    exactCheckpointFiles?: readonly string[];
    allowedGeneratedFiles?: readonly string[];
    historicalPreRevealLevel?: number;
  } = {},
): Promise<{
  appRoot: string;
  prefix: Awaited<ReturnType<typeof validatePrefixInventory>>;
  recoveredContent: Awaited<ReturnType<typeof readRecoveredContent>>;
  recoveredScreenshots: CapturePastaProofStageResult[];
  primaryRpc: Awaited<ReturnType<typeof readRpcSnapshot>>;
  fallbackRpc: Awaited<ReturnType<typeof readRpcSnapshot>>;
  counters: { creator: number; collector: number };
  targetHistory: Awaited<ReturnType<typeof readTargetHistory>>;
  indexedStorage: JsonObject;
  contractArtifact: unknown[];
  v1ContractArtifact: unknown[];
}> {
  const appRoot = path.join(runRoot, "macaroni");
  const details = await stat(appRoot);
  assert.ok(details.isDirectory(), "Macaroni interrupted app root must be a directory");
  const prefix = await validatePrefixInventory(appRoot, options);
  const [contractBytes, v1ContractBytes, zipBytes] = await Promise.all([
    readFile(CONTRACT_ARTIFACT_PATH),
    readFile(V1_CONTRACT_ARTIFACT_PATH),
    readFile(path.join(appRoot, "artifacts", "macaroni-site.zip")),
  ]);
  assert.equal(sha256(contractBytes), CONTRACT_ARTIFACT_SHA256, "Macaroni V2 artifact bytes drift");
  assert.equal(sha256(v1ContractBytes), V1_CONTRACT_ARTIFACT_SHA256, "Macaroni V1 artifact bytes drift");
  const contractArtifact = JSON.parse(contractBytes.toString("utf8"));
  const v1ContractArtifact = JSON.parse(v1ContractBytes.toString("utf8"));
  assert.ok(Array.isArray(contractArtifact) && Array.isArray(v1ContractArtifact));
  assert.equal(hashMichelsonScriptCode(contractArtifact), CONTRACT_CANONICAL_CODE_SHA256);
  assert.equal(hashMichelsonScriptCode(v1ContractArtifact), V1_CONTRACT_CANONICAL_CODE_SHA256);
  const archiveFiles = validateMacaroniSiteArchive(zipBytes, {
    contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
    finalMetadataUri: FINAL_METADATA_URI,
    placeholderMetadataUri: PLACEHOLDER_METADATA_URI,
  });
  for (const name of REQUIRED_SITE_FILES) {
    const extracted = await readFile(path.join(appRoot, "artifacts", "self-hosted-site", ...name.split("/")));
    assertExactMacaroniArchiveBytes(extracted, archiveFiles[name], name);
  }
  const [recoveredScreenshots, recoveredContent, primaryRpc, fallbackRpc, targetHistory, indexedStorage] =
    await Promise.all([
      loadRecoveredScreenshots(appRoot),
      readRecoveredContent(ipfs),
      readRpcSnapshot(
        SHADOWNET_RPC_PRIMARY,
        "pre-reveal",
        options.historicalPreRevealLevel ?? "head",
      ),
      readRpcSnapshot(
        SHADOWNET_RPC_FALLBACK,
        "pre-reveal",
        options.historicalPreRevealLevel ?? "head",
      ),
      readTargetHistory(options.historicalPreRevealLevel),
      readIndexedStorage("pre-reveal", options.historicalPreRevealLevel),
    ]);
  assert.equal(primaryRpc.storageSha256, fallbackRpc.storageSha256, "configured RPC storage disagreement");
  assert.equal(primaryRpc.codeSha256, fallbackRpc.codeSha256, "configured RPC code disagreement");
  const counters = assertMacaroniRecoveryCounterBoundary(primaryRpc.counters, fallbackRpc.counters);
  assertMacaroniRecoveryTargetHistory(targetHistory, { phase: "pre-reveal" });
  return {
    appRoot,
    prefix,
    recoveredContent,
    recoveredScreenshots,
    primaryRpc,
    fallbackRpc,
    counters,
    targetHistory,
    indexedStorage,
    contractArtifact,
    v1ContractArtifact,
  };
}

export function assertExactMacaroniArchiveBytes(
  extracted: Uint8Array,
  archived: Uint8Array,
  name: string,
): void {
  assert.ok(name.trim(), "Macaroni archive comparison requires a file name");
  assert.equal(
    Buffer.compare(Buffer.from(extracted), Buffer.from(archived)),
    0,
    `extracted site file ${name} differs from authenticated ZIP`,
  );
}

type MacaroniRecoveryCheckpointInput = {
  prefix: Awaited<ReturnType<typeof validatePrefixInventory>>;
  recoveredContent: Awaited<ReturnType<typeof readRecoveredContent>>;
  counters: { creator: number; collector: number };
  rpc: {
    primary: Awaited<ReturnType<typeof readRpcSnapshot>>;
    fallback: Awaited<ReturnType<typeof readRpcSnapshot>>;
  };
};

function macaroniRecoveryIntentSeed(
  input: MacaroniRecoveryCheckpointInput,
  createdAt: string,
): JsonObject {
  return {
    schema: "pastaprotocol-macaroni-current-recovery-intent@1",
    status: "IMMUTABLE",
    createdAt,
    runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
    interruption: {
      code: "POST_MINT_IPFS_HTTP_500",
      stage: "after-applied-mint-before-screenshot-seven",
      ordinaryFreshRerunForbidden: true,
    },
    network: {
      name: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
      rpcPrimary: {
        url: input.rpc.primary.rpcUrl,
        storageSha256: input.rpc.primary.storageSha256,
        codeSha256: input.rpc.primary.codeSha256,
      },
      rpcFallback: {
        url: input.rpc.fallback.rpcUrl,
        storageSha256: input.rpc.fallback.storageSha256,
        codeSha256: input.rpc.fallback.codeSha256,
      },
      tzktApi: normalizeBase(SHADOWNET_TZKT_API),
    },
    actors: {
      creator: MACARONI_CURRENT_RECOVERY_CREATOR,
      collector: MACARONI_CURRENT_RECOVERY_COLLECTOR,
      authenticatedCounterFloors: {
        creator: CREATOR_COUNTER_FLOOR,
        collector: COLLECTOR_COUNTER_FLOOR,
      },
      observedCounters: input.counters,
    },
    contract: {
      address: MACARONI_CURRENT_RECOVERY_CONTRACT,
      artifactSha256: CONTRACT_ARTIFACT_SHA256,
      canonicalCodeSha256: CONTRACT_CANONICAL_CODE_SHA256,
    },
    recoveredPrefix: {
      inventorySha256: input.prefix.inventorySha256,
      files: input.prefix.files,
      operations: MACARONI_RECOVERED_OPERATIONS,
      content: input.recoveredContent.map(({ bytes: _bytes, ...content }) => content),
      screenshots: [1, 2, 3, 4, 5, 6],
    },
    continuation: {
      firstAndOnlyRemainingV2Mutation: {
        actor: "collector",
        contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
        entrypoint: "reveal",
        payload: 1,
      },
      then: "ordinary fresh Macaroni V1 Studio and collector lane",
      recoveredWritesMayReplay: false,
    },
  };
}

function parseCanonicalCheckpointDocument(bytes: Uint8Array, label: string): JsonObject {
  const value = objectValue(JSON.parse(Buffer.from(bytes).toString("utf8")), label);
  assert.equal(
    Buffer.compare(Buffer.from(bytes), Buffer.from(deterministicJsonBytes(value))),
    0,
    `${label} bytes are not canonical`,
  );
  return value;
}

function assertCheckpointEventHash(
  event: JsonObject,
  options: { checkpointId: string; index: number; phase: string; previousSha256: string },
): void {
  assert.equal(event.schema, "pastaprotocol-macaroni-current-recovery-event@1");
  assert.equal(event.checkpointId, options.checkpointId);
  assert.equal(event.eventIndex, options.index);
  assert.equal(event.phase, options.phase);
  assert.equal(event.previousSha256, options.previousSha256);
  const timestampUtc = String(event.timestampUtc || "");
  assert.match(timestampUtc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(new Date(timestampUtc).toISOString(), timestampUtc, "checkpoint timestamp must be canonical UTC");
  const { eventSha256, ...eventSeed } = event;
  assert.match(String(eventSha256 || ""), /^[0-9a-f]{64}$/);
  assert.equal(eventSha256, canonicalSha256(eventSeed), `${options.phase} semantic hash drift`);
}

export function authenticateMacaroniPrewriteCheckpointDocumentsAgainst(
  input: {
    intentBytes: Uint8Array;
    recoveredPrefixEventBytes: Uint8Array;
    signersAuthenticatedEventBytes: Uint8Array;
  },
  expected: MacaroniRecoveryCheckpointDocumentIdentity,
): {
  intent: JsonObject;
  recoveredPrefixEvent: JsonObject;
  signersAuthenticatedEvent: JsonObject;
  lastEventFileSha256: string;
} {
  assert.equal(
    sha256(input.intentBytes),
    expected.intentSha256,
    "Macaroni pre-write checkpoint intent file hash drift",
  );
  assert.equal(
    sha256(input.recoveredPrefixEventBytes),
    expected.recoveredPrefixEventSha256,
    "Macaroni recovered-prefix event file hash drift",
  );
  assert.equal(
    sha256(input.signersAuthenticatedEventBytes),
    expected.signersAuthenticatedEventSha256,
    "Macaroni signer-authentication event file hash drift",
  );
  const intent = parseCanonicalCheckpointDocument(input.intentBytes, "Macaroni recovery intent");
  assert.equal(intent.schema, "pastaprotocol-macaroni-current-recovery-intent@1");
  assert.equal(intent.status, "IMMUTABLE");
  assert.equal(intent.createdAt, expected.createdAt);
  assert.equal(intent.runId, MACARONI_CURRENT_RECOVERY_RUN_ID);
  assert.equal(intent.checkpointId, expected.checkpointId);
  const { checkpointId, ...intentSeed } = intent;
  assert.equal(canonicalSha256(intentSeed), checkpointId, "Macaroni recovery checkpoint id drift");

  const recoveredPrefixEvent = parseCanonicalCheckpointDocument(
    input.recoveredPrefixEventBytes,
    "Macaroni recovered-prefix event",
  );
  assertCheckpointEventHash(recoveredPrefixEvent, {
    checkpointId: expected.checkpointId,
    index: 1,
    phase: "RECOVERED_PREFIX_ACCEPTED",
    previousSha256: expected.intentSha256,
  });
  const signersAuthenticatedEvent = parseCanonicalCheckpointDocument(
    input.signersAuthenticatedEventBytes,
    "Macaroni signer-authentication event",
  );
  assertCheckpointEventHash(signersAuthenticatedEvent, {
    checkpointId: expected.checkpointId,
    index: expected.lastEventIndex,
    phase: "SIGNERS_AUTHENTICATED",
    previousSha256: expected.recoveredPrefixEventSha256,
  });
  return {
    intent,
    recoveredPrefixEvent,
    signersAuthenticatedEvent,
    lastEventFileSha256: expected.signersAuthenticatedEventSha256,
  };
}

export function authenticateExactMacaroniPrewriteCheckpointDocuments(input: {
  intentBytes: Uint8Array;
  recoveredPrefixEventBytes: Uint8Array;
  signersAuthenticatedEventBytes: Uint8Array;
}) {
  return authenticateMacaroniPrewriteCheckpointDocumentsAgainst(
    input,
    MACARONI_CURRENT_RECOVERY_DOCUMENT_IDENTITY,
  );
}

export function authenticateMacaroniV1SubmittedCheckpointDocumentsAgainst(
  input: {
    intentBytes: Uint8Array;
    eventBytes: readonly Uint8Array[];
  },
  expected: MacaroniRecoveryCheckpointDocumentIdentity,
): {
  intent: JsonObject;
  events: JsonObject[];
  lastEventFileSha256: string;
} {
  assert.equal(input.eventBytes.length, MACARONI_V1_SUBMITTED_CHECKPOINT_PHASES.length);
  assert.equal(
    sha256(input.intentBytes),
    expected.intentSha256,
    "Macaroni V1-submitted intent file hash drift",
  );
  const intent = parseCanonicalCheckpointDocument(input.intentBytes, "Macaroni V1-submitted intent");
  assert.equal(intent.schema, "pastaprotocol-macaroni-current-recovery-intent@1");
  assert.equal(intent.status, "IMMUTABLE");
  assert.equal(intent.createdAt, expected.createdAt);
  assert.equal(intent.runId, MACARONI_CURRENT_RECOVERY_RUN_ID);
  assert.equal(intent.checkpointId, expected.checkpointId);
  const { checkpointId, ...intentSeed } = intent;
  assert.equal(canonicalSha256(intentSeed), checkpointId, "Macaroni V1-submitted checkpoint id drift");

  let previousSha256: string = expected.intentSha256;
  const events = input.eventBytes.map((bytes, index) => {
    const event = parseCanonicalCheckpointDocument(bytes, `Macaroni V1-submitted event ${index + 1}`);
    assertCheckpointEventHash(event, {
      checkpointId: expected.checkpointId,
      index: index + 1,
      phase: MACARONI_V1_SUBMITTED_CHECKPOINT_PHASES[index],
      previousSha256,
    });
    previousSha256 = sha256(bytes);
    return event;
  });
  assert.equal(
    previousSha256,
    expected.v1SubmittedEventFileSha256,
    "Macaroni V1-submitted event prefix hash drift",
  );
  assert.equal(events[6].payload.operationHash, MACARONI_V2_REVEAL_OPERATION_HASH);
  assert.equal(events[6].payload.expectedCounter, MACARONI_V2_REVEAL_COUNTER);
  assert.equal(events[7].payload.operationHash, MACARONI_V2_REVEAL_OPERATION_HASH);
  assert.equal(events[7].payload.counter, MACARONI_V2_REVEAL_COUNTER);
  assert.equal(events[9].payload.operationHash, MACARONI_V2_REVEAL_OPERATION_HASH);
  assert.equal(events[9].payload.revealCounter, MACARONI_V2_REVEAL_COUNTER);
  assert.deepEqual(events[10].payload.expectedOperations, ["origination", "add_tokens", "set_stages", "mint"]);
  assert.equal(events[10].payload.recoveredV2MutationReplayPermitted, false);
  assert.deepEqual(events[19].payload, {
    actor: "creator",
    entrypoints: [],
    operationSequence: 1,
    session: "creator-bootstrap",
    sha256: "ec4bc00a572715fc8bcff1b7fe6892f754de243fda4e190d2a5a654f46fac1f0",
  });
  assert.deepEqual(events[20].payload, {
    actor: "creator",
    entrypoints: [],
    operationHash: MACARONI_V1_SUBMITTED_OPERATION_HASH,
    operationSequence: 1,
    session: "creator-bootstrap",
  });
  return { intent, events, lastEventFileSha256: previousSha256 };
}

export function authenticateMacaroniV1SubmittedCheckpointDocuments(input: {
  intentBytes: Uint8Array;
  eventBytes: readonly Uint8Array[];
}) {
  return authenticateMacaroniV1SubmittedCheckpointDocumentsAgainst(
    input,
    MACARONI_CURRENT_RECOVERY_DOCUMENT_IDENTITY,
  );
}

class MacaroniRecoveryCheckpoint {
  private eventIndex: number;
  private previousSha256: string;

  private constructor(
    readonly rootPath: string,
    readonly checkpointId: string,
    readonly intentSha256: string,
    state: { eventIndex?: number; previousSha256?: string } = {},
  ) {
    this.eventIndex = state.eventIndex ?? 0;
    this.previousSha256 = state.previousSha256 ?? intentSha256;
  }

  static async create(
    appRoot: string,
    input: MacaroniRecoveryCheckpointInput,
  ): Promise<MacaroniRecoveryCheckpoint> {
    const rootPath = path.join(appRoot, CHECKPOINT_RELATIVE_ROOT);
    await mkdir(rootPath);
    await mkdir(path.join(rootPath, "events"));
    const intentSeed = macaroniRecoveryIntentSeed(input, new Date().toISOString());
    const checkpointId = canonicalSha256(intentSeed);
    const intent = { ...intentSeed, checkpointId };
    const bytes = deterministicJsonBytes(intent);
    const intentSha256 = sha256(bytes);
    await durableWriteExclusive(path.join(rootPath, "intent.json"), bytes);
    return new MacaroniRecoveryCheckpoint(rootPath, checkpointId, intentSha256);
  }

  static async reopenExactPrewrite(
    appRoot: string,
    input: MacaroniRecoveryCheckpointInput,
    liveEvidence: { targetHistorySha256: string; indexedStorageSha256: string },
  ): Promise<{
    checkpoint: MacaroniRecoveryCheckpoint;
    createdAt: string;
    signerAuthentication: JsonObject;
  }> {
    const rootPath = path.join(appRoot, CHECKPOINT_RELATIVE_ROOT);
    const details = await lstat(rootPath);
    assert.ok(details.isDirectory() && !details.isSymbolicLink(), "Macaroni pre-write checkpoint root must be a real directory");
    assert.deepEqual(
      await listRegularFiles(rootPath),
      [...EXACT_PREWRITE_CHECKPOINT_FILES].sort(),
      "Macaroni pre-write checkpoint contains an unexpected or missing file",
    );
    const [intentBytes, recoveredPrefixEventBytes, signersAuthenticatedEventBytes] = await Promise.all([
      readFile(path.join(rootPath, "intent.json")),
      readFile(path.join(rootPath, "events", "001-recovered-prefix-accepted.json")),
      readFile(path.join(rootPath, "events", "002-signers-authenticated.json")),
    ]);
    const authenticated = authenticateExactMacaroniPrewriteCheckpointDocuments({
      intentBytes,
      recoveredPrefixEventBytes,
      signersAuthenticatedEventBytes,
    });
    const storedCounters = objectValue(authenticated.intent.actors, "Macaroni recovery intent actors").observedCounters;
    const expectedIntentSeed = macaroniRecoveryIntentSeed({
      ...input,
      counters: {
        creator: safeInteger(storedCounters?.creator, "stored creator counter"),
        collector: safeInteger(storedCounters?.collector, "stored collector counter"),
      },
    }, MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.createdAt);
    const { checkpointId: _checkpointId, ...actualIntentSeed } = authenticated.intent;
    assert.deepEqual(actualIntentSeed, expectedIntentSeed, "Macaroni pre-write intent no longer matches the exact recovery boundary");
    assert.deepEqual(authenticated.recoveredPrefixEvent.payload, {
      inventorySha256: input.prefix.inventorySha256,
      targetHistorySha256: liveEvidence.targetHistorySha256,
      indexedStorageSha256: liveEvidence.indexedStorageSha256,
      recoveredOperationHashes: MACARONI_RECOVERED_OPERATIONS.map((operation) => operation.hash),
      recoveredCids: input.recoveredContent.map((content) => content.cid),
    }, "Macaroni recovered-prefix event no longer matches live read-only evidence");
    const signerAuthentication = objectValue(
      authenticated.signersAuthenticatedEvent.payload,
      "Macaroni signer-authentication payload",
    );
    assert.equal(signerAuthentication.creator, MACARONI_CURRENT_RECOVERY_CREATOR);
    assert.equal(signerAuthentication.collector, MACARONI_CURRENT_RECOVERY_COLLECTOR);
    safeInteger(signerAuthentication.creatorBalanceMutez, "checkpoint creator balance");
    safeInteger(signerAuthentication.collectorBalanceMutez, "checkpoint collector balance");
    assert.ok(
      safeInteger(signerAuthentication.estimatedV1OriginationMutez, "checkpoint V1 origination estimate") > 0,
      "checkpoint V1 origination estimate must be positive",
    );
    return {
      checkpoint: new MacaroniRecoveryCheckpoint(
        rootPath,
        MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.checkpointId,
        MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.intentSha256,
        {
          eventIndex: MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.lastEventIndex,
          previousSha256: authenticated.lastEventFileSha256,
        },
      ),
      createdAt: MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.createdAt,
      signerAuthentication,
    };
  }

  static async reopenV1Submitted(
    appRoot: string,
    input: MacaroniRecoveryCheckpointInput,
    liveEvidence: {
      preTargetHistorySha256: string;
      preIndexedStorageSha256: string;
      postTargetHistorySha256: string;
      postIndexedStorageSha256: string;
      postStorageSha256: string;
    },
  ): Promise<{
    checkpoint: MacaroniRecoveryCheckpoint;
    createdAt: string;
    signerAuthentication: JsonObject;
    events: JsonObject[];
  }> {
    const rootPath = path.join(appRoot, CHECKPOINT_RELATIVE_ROOT);
    const details = await lstat(rootPath);
    assert.ok(details.isDirectory() && !details.isSymbolicLink(), "Macaroni V1-submitted checkpoint root must be a real directory");
    assert.deepEqual(
      await listRegularFiles(rootPath),
      [...V1_SUBMITTED_CHECKPOINT_FILES].sort(),
      "Macaroni V1-submitted checkpoint contains an unexpected or missing file",
    );
    const [intentBytes, ...eventBytes] = await Promise.all([
      readFile(path.join(rootPath, "intent.json")),
      ...V1_SUBMITTED_CHECKPOINT_FILES
        .filter((relativePath) => relativePath.startsWith("events/"))
        .map((relativePath) => readFile(path.join(rootPath, relativePath))),
    ]);
    const authenticated = authenticateMacaroniV1SubmittedCheckpointDocuments({ intentBytes, eventBytes });
    const storedCounters = objectValue(authenticated.intent.actors, "Macaroni V1-submitted actors").observedCounters;
    const expectedIntentSeed = macaroniRecoveryIntentSeed({
      ...input,
      counters: {
        creator: safeInteger(storedCounters?.creator, "stored creator counter"),
        collector: safeInteger(storedCounters?.collector, "stored collector counter"),
      },
    }, MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.createdAt);
    const { checkpointId: _checkpointId, ...actualIntentSeed } = authenticated.intent;
    assert.deepEqual(actualIntentSeed, expectedIntentSeed, "Macaroni V1-submitted intent no longer matches the exact recovery boundary");
    assert.equal(authenticated.events[0].payload.targetHistorySha256, liveEvidence.preTargetHistorySha256);
    // TzKT's historical_keys response adds historical transport fields that
    // were absent from the original head-only keys response. readIndexedStorage
    // has already asserted the complete semantic pre-reveal projection; retain
    // the original raw head-response digest as checkpoint identity.
    assert.equal(
      authenticated.events[0].payload.indexedStorageSha256,
      RECOVERED_PREFIX_INDEXED_STORAGE_SHA256,
    );
    assert.equal(authenticated.events[4].payload.storageSha256, PRE_REVEAL_RPC_STORAGE_SHA256);
    assert.equal(authenticated.events[4].payload.targetHistorySha256, liveEvidence.preTargetHistorySha256);
    assert.deepEqual(authenticated.events[4].payload.counters, input.counters);
    assert.equal(authenticated.events[7].payload.targetHistorySha256, liveEvidence.postTargetHistorySha256);
    assert.equal(authenticated.events[7].payload.indexedStorageSha256, liveEvidence.postIndexedStorageSha256);
    assert.equal(authenticated.events[9].payload.targetHistorySha256, liveEvidence.postTargetHistorySha256);
    assert.equal(authenticated.events[9].payload.indexedStorageSha256, liveEvidence.postIndexedStorageSha256);
    assert.equal(authenticated.events[9].payload.storageSha256, liveEvidence.postStorageSha256);
    const signerAuthentication = objectValue(
      authenticated.events[1].payload,
      "Macaroni V1-submitted signer-authentication payload",
    );
    assert.equal(signerAuthentication.creator, MACARONI_CURRENT_RECOVERY_CREATOR);
    assert.equal(signerAuthentication.collector, MACARONI_CURRENT_RECOVERY_COLLECTOR);
    return {
      checkpoint: new MacaroniRecoveryCheckpoint(
        rootPath,
        MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.checkpointId,
        MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.intentSha256,
        {
          eventIndex: MACARONI_V1_SUBMITTED_CHECKPOINT_PHASES.length,
          previousSha256: authenticated.lastEventFileSha256,
        },
      ),
      createdAt: MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.createdAt,
      signerAuthentication,
      events: authenticated.events,
    };
  }

  async append(phase: string, payload: JsonObject): Promise<string> {
    const eventIndex = ++this.eventIndex;
    const eventSeed = {
      schema: "pastaprotocol-macaroni-current-recovery-event@1",
      checkpointId: this.checkpointId,
      eventIndex,
      phase,
      timestampUtc: new Date().toISOString(),
      previousSha256: this.previousSha256,
      payload,
    };
    const eventSha256 = canonicalSha256(eventSeed);
    const event = { ...eventSeed, eventSha256 };
    const bytes = deterministicJsonBytes(event);
    const relative = `${String(eventIndex).padStart(3, "0")}-${phase.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    await durableWriteExclusive(path.join(this.rootPath, "events", relative), bytes);
    this.previousSha256 = sha256(bytes);
    return this.previousSha256;
  }

}

function v1LaneCheckpointPayload(event: MacaroniV1LaneEvent): JsonObject {
  const operation = event.operation;
  const payload: JsonObject = {
    actor: event.actor,
    session: event.session,
  };
  const operationSequence = event.operationSequence ??
    (operation && "operationSequence" in operation ? operation.operationSequence : undefined);
  const operationHash = event.operationHash ??
    (operation && "operationHash" in operation ? operation.operationHash : undefined);
  const contractAddress = event.contractAddress ?? operation?.contractAddress;
  const entrypoints = event.entrypoints ?? operation?.entrypoints;
  if (operationSequence !== undefined) payload.operationSequence = operationSequence;
  if (operationHash !== undefined) payload.operationHash = operationHash;
  if (contractAddress !== undefined) payload.contractAddress = contractAddress;
  if (entrypoints !== undefined) payload.entrypoints = entrypoints;
  if (operation?.action !== undefined) payload.action = operation.action;
  if (operation && "descriptor" in operation) payload.descriptorSha256 = hashJsonForBridge(operation.descriptor);
  if (event.fileName !== undefined) payload.fileName = event.fileName;
  if (event.mimeType !== undefined) payload.mimeType = event.mimeType;
  if (event.byteLength !== undefined) payload.byteLength = event.byteLength;
  if (event.sha256 !== undefined) payload.sha256 = event.sha256;
  if (event.ipfsUri !== undefined) payload.ipfsUri = event.ipfsUri;
  return payload;
}

async function appendV1LaneCheckpointEvent(
  checkpoint: MacaroniRecoveryCheckpoint,
  event: MacaroniV1LaneEvent,
): Promise<void> {
  await checkpoint.append(`V1_${event.phase}`, v1LaneCheckpointPayload(event));
}

function assertRecoveredV1PinEvent(event: MacaroniV1LaneEvent, checkpointEvent: JsonObject): void {
  assert.ok(event.phase === "PIN_PREPARED" || event.phase === "PIN_CONFIRMED");
  assert.equal(checkpointEvent.phase, `V1_${event.phase}`);
  assert.deepEqual(
    v1LaneCheckpointPayload(event),
    checkpointEvent.payload,
    `Macaroni V1 recovered ${event.fileName || "pin"} evidence drift`,
  );
}

async function assertImmediatePreSignerBoundary(
  checkpoint?: MacaroniRecoveryCheckpoint,
): Promise<{
  primary: Awaited<ReturnType<typeof readRpcSnapshot>>;
  fallback: Awaited<ReturnType<typeof readRpcSnapshot>>;
  counters: { creator: number; collector: number };
}> {
  const [primary, fallback, history] = await Promise.all([
    readRpcSnapshot(SHADOWNET_RPC_PRIMARY, "pre-reveal"),
    readRpcSnapshot(SHADOWNET_RPC_FALLBACK, "pre-reveal"),
    readTargetHistory(),
  ]);
  assert.equal(primary.storageSha256, fallback.storageSha256, "configured RPC storage disagreement");
  assert.equal(primary.codeSha256, fallback.codeSha256, "configured RPC code disagreement");
  const counters = assertMacaroniRecoveryCounterBoundary(primary.counters, fallback.counters);
  assertMacaroniRecoveryTargetHistory(history, { phase: "pre-reveal" });
  await checkpoint?.append("PRE_SIGNER_BOUNDARY_ACCEPTED", {
    counters,
    storageSha256: primary.storageSha256,
    codeSha256: primary.codeSha256,
    targetHistorySha256: canonicalSha256(history),
  });
  return { primary, fallback, counters };
}

async function routeRecoveredIpfsBytes(
  context: BrowserContext,
  recoveredContent: Awaited<ReturnType<typeof readRecoveredContent>>,
): Promise<void> {
  const byCid = new Map<string, (typeof recoveredContent)[number]>(
    recoveredContent.map((content) => [content.cid, content]),
  );
  await context.route("**/ipfs/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cid = url.pathname.split("/").filter(Boolean).at(-1) || "";
    const content = byCid.get(cid);
    if (!content) {
      await route.abort("blockedbyclient");
      return;
    }
    if (request.method() !== "GET" && request.method() !== "HEAD") {
      await route.fulfill({ status: 405, body: "" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: content.mimeType,
      body: request.method() === "HEAD" ? Buffer.alloc(0) : Buffer.from(content.bytes),
      headers: {
        "cache-control": "no-store",
        "x-pasta-recovered-cid": content.cid,
        "x-pasta-recovered-sha256": content.sha256,
      },
    });
  });
}

async function waitForText(page: Page, selector: string, expected: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction(
    ({ target, text }) => document.querySelector(target)?.textContent?.includes(text),
    { target: selector, text: expected },
    { timeout },
  );
}

export type MacaroniCollectorConnectionSnapshot = {
  account: string;
  connectButton: {
    text: string;
    disabled: boolean;
    ariaBusy: string;
    ariaLabel: string;
  };
  supplyText: string;
  walletBalance: string;
  walletLimitStatus: string;
  ownedMintStatus: string;
  mintStatus: string;
  revealSectionDisplay: string;
  tokenCards: Array<{
    tokenId: string;
    className: string;
    text: string;
  }>;
  fatalBrowserEvents: readonly { kind: string; message: string }[];
};

export async function readMacaroniCollectorConnectionSnapshot(
  page: Page,
  monitor: Pick<PastaProofPageMonitor, "list">,
): Promise<MacaroniCollectorConnectionSnapshot> {
  let browserState: Omit<MacaroniCollectorConnectionSnapshot, "fatalBrowserEvents">;
  try {
    browserState = await page.evaluate(() => {
      const connect = document.getElementById("btnConnect") as HTMLButtonElement | null;
      const tokenCards: Array<{ tokenId: string; className: string; text: string }> = [];
      const cards = document.querySelectorAll<HTMLElement>("#revealGrid [data-token-id]");
      for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index];
        tokenCards.push({
          tokenId: card.dataset.tokenId || "",
          className: card.className,
          text: card.textContent?.trim() || "",
        });
      }
      return {
        account: String((window as any).MD?.getAccount?.() || ""),
        connectButton: {
          text: connect?.textContent?.trim() || "",
          disabled: Boolean(connect?.disabled),
          ariaBusy: connect?.getAttribute("aria-busy") || "",
          ariaLabel: connect?.getAttribute("aria-label") || "",
        },
        supplyText: document.getElementById("supplyText")?.textContent?.trim() || "",
        walletBalance: document.getElementById("walletBalance")?.textContent?.trim() || "",
        walletLimitStatus: document.getElementById("walletLimitStatus")?.textContent?.trim() || "",
        ownedMintStatus: document.getElementById("ownedMintStatus")?.textContent?.trim() || "",
        mintStatus: document.getElementById("mintStatus")?.textContent?.trim() || "",
        revealSectionDisplay: (document.getElementById("revealSection") as HTMLElement | null)?.style.display ?? "",
        tokenCards,
      };
    });
  } catch (error) {
    browserState = {
      account: "",
      connectButton: {
        text: "",
        disabled: false,
        ariaBusy: "",
        ariaLabel: "",
      },
      supplyText: "",
      walletBalance: "",
      walletLimitStatus: "",
      ownedMintStatus: "",
      mintStatus: `page state unavailable: ${error instanceof Error ? error.message : String(error)}`,
      revealSectionDisplay: "",
      tokenCards: [],
    };
  }
  return { ...browserState, fatalBrowserEvents: monitor.list() };
}

export async function waitForMacaroniCollectorConnectHandler(input: {
  page: Page;
  monitor: Pick<PastaProofPageMonitor, "list">;
  expectedAddress: string;
  timeout?: number;
}): Promise<MacaroniCollectorConnectionSnapshot> {
  const timeout = input.timeout ?? 60_000;
  try {
    await input.page.waitForFunction(
      (expectedAddress) => {
        const connect = document.getElementById("btnConnect") as HTMLButtonElement | null;
        const ariaLabel = connect?.getAttribute("aria-label") || "";
        const mintStatus = document.getElementById("mintStatus")?.textContent || "";
        const terminal = connect?.getAttribute("aria-busy") === "false";
        return terminal && (
          ariaLabel === `Connected wallet ${expectedAddress}`
          || /wallet connect cancelled or failed:/i.test(mintStatus)
        );
      },
      input.expectedAddress,
      { timeout },
    );
  } catch (error) {
    const snapshot = await readMacaroniCollectorConnectionSnapshot(input.page, input.monitor);
    throw new Error(
      `Macaroni collector connect handler did not reach a terminal state; ` +
        `domAndMonitor=${JSON.stringify(snapshot)}`,
      { cause: error },
    );
  }
  const snapshot = await readMacaroniCollectorConnectionSnapshot(input.page, input.monitor);
  const expectedLabel = `Connected wallet ${input.expectedAddress}`;
  const token = snapshot.tokenCards.find((card) => card.tokenId === "0");
  const failures = [
    snapshot.account === input.expectedAddress ? "" : `account=${JSON.stringify(snapshot.account)}`,
    snapshot.connectButton.ariaBusy === "false"
      ? ""
      : `ariaBusy=${JSON.stringify(snapshot.connectButton.ariaBusy)}`,
    snapshot.connectButton.ariaLabel === expectedLabel
      ? ""
      : `ariaLabel=${JSON.stringify(snapshot.connectButton.ariaLabel)}`,
    snapshot.connectButton.disabled ? "" : "connect button remained enabled",
    snapshot.walletBalance.includes("Wallet balance:") && snapshot.walletBalance.includes("connected")
      ? ""
      : `walletBalance=${JSON.stringify(snapshot.walletBalance)}`,
    snapshot.walletLimitStatus.includes("1/1")
      ? ""
      : `walletLimitStatus=${JSON.stringify(snapshot.walletLimitStatus)}`,
    snapshot.ownedMintStatus && !/checking|could not load/i.test(snapshot.ownedMintStatus)
      ? ""
      : `ownedMintStatus=${JSON.stringify(snapshot.ownedMintStatus)}`,
    token?.className.split(/\s+/).includes("sealed")
      ? ""
      : `token0=${JSON.stringify(token || null)}`,
    token?.text.toLowerCase().includes("unrevealed")
      ? ""
      : `token0Text=${JSON.stringify(token?.text || "")}`,
    snapshot.fatalBrowserEvents.length === 0
      ? ""
      : `fatalBrowserEvents=${JSON.stringify(snapshot.fatalBrowserEvents)}`,
  ].filter(Boolean);
  if (failures.length) {
    throw new Error(
      `Macaroni collector connect handler terminated without the exact recovered wallet state ` +
        `(${failures.join("; ")}); domAndMonitor=${JSON.stringify(snapshot)}`,
    );
  }
  return snapshot;
}

async function captureRecoveredDropStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  runRoot: string,
  ordinal: number,
  capability: string,
  stageName: string,
  focusSelector: string,
  evidence: Array<{ selector: string; name: string; expectedText: string | RegExp }>,
): Promise<CapturePastaProofStageResult> {
  await page.locator(focusSelector).scrollIntoViewIfNeeded();
  await assertMacaroniUiDecodeSafe(page);
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot: runRoot,
    app: "macaroni",
    capability,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "#brand", name: "application", expectedText: "Macaroni" },
      { selector: "#netLabel", name: "network", expectedText: /shadownet/i },
      {
        selector: "#title",
        name: "drop title",
        expectedText: `Macaroni UI-LIVE ${MACARONI_CURRENT_RECOVERY_RUN_ID}`,
      },
      ...evidence,
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

function recoveredPinProof(
  content: Awaited<ReturnType<typeof readRecoveredContent>>[number],
  ipfs: IpfsProofConfig,
): PastaUiLivePinProof {
  return {
    cid: content.cid,
    uri: `ipfs://${content.cid}`,
    fileName: content.fileName,
    mimeType: content.mimeType,
    byteLength: content.byteLength,
    sha256: content.sha256,
    localGatewayUrl: `${normalizeBase(ipfs.localGatewayUrl)}/${content.cid}`,
    publicGatewayUrl: content.sources[0],
    publicGatewayVerified: true,
    verificationAttempts: content.sources.length,
  };
}

function pinKind(fileName: string): string {
  if (fileName === "contract_metadata.json") return "collection-metadata";
  if (fileName === "1.json") return "token-metadata";
  if (fileName === "1.png") return "token-media";
  if (fileName === "placeholder-1.json") return "placeholder-metadata";
  if (fileName === "macaroni-placeholder.png") return "placeholder-media";
  if (fileName === "macaroni-cover.png") return "collection-cover";
  return "pinned-proof-artifact";
}

async function writeRecoveredPins(
  appRoot: string,
  content: Awaited<ReturnType<typeof readRecoveredContent>>,
  ipfs: IpfsProofConfig,
): Promise<{ pins: PinnedRecord[]; artifacts: WrittenPinArtifact[] }> {
  const pins: PinnedRecord[] = [];
  const artifacts: WrittenPinArtifact[] = [];
  for (const [index, recovered] of content.entries()) {
    const proof = recoveredPinProof(recovered, ipfs);
    const value = recovered.mimeType === "application/json"
      ? JSON.parse(Buffer.from(recovered.bytes).toString("utf8"))
      : undefined;
    pins.push({ actor: "creator", value, bytes: recovered.bytes, proof });
    const kind = pinKind(recovered.fileName);
    const safeName = recovered.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
    const relativePath = `artifacts/pins/v2/${String(index + 1).padStart(3, "0")}-${safeName}`;
    await mkdir(path.dirname(path.join(appRoot, relativePath)), { recursive: true });
    await writeFile(path.join(appRoot, relativePath), recovered.bytes);
    artifacts.push({
      id: `macaroni-v2-pin-${String(index + 1).padStart(3, "0")}-${kind}`,
      kind,
      path: relativePath,
      sha256: recovered.sha256,
      ipfsUri: proof.uri,
      gatewayUrl: proof.publicGatewayUrl,
      retrievedSha256: recovered.sha256,
      fileName: recovered.fileName,
    });
  }
  return { pins, artifacts };
}

function buildV1OriginationStorage(administrator: string, collectionMetadataUri: string) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(collectionMetadataUri));
  return {
    administrator,
    pending_administrator: null,
    treasury: administrator,
    metadata,
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    pending_tokens: new MichelsonMap(),
    slots: new MichelsonMap(),
    supply: 0,
    minted: 0,
    seed_salt: "00",
    stages: new MichelsonMap(),
    allowlist: new MichelsonMap(),
    stage_minted: new MichelsonMap(),
    locked: false,
    paused: false,
    delayed_reveal: false,
    placeholder: new MichelsonMap(),
    reveal_delay: 604800,
    unrevealed_since: null,
    revealed: 0,
    entropy: "00",
  };
}

async function estimateV1OriginationMutez(
  creatorTezos: TezosToolkit,
  creatorAddress: string,
  code: unknown[],
): Promise<number> {
  const estimate = await creatorTezos.estimate.originate({
    code,
    storage: buildV1OriginationStorage(
      creatorAddress,
      "ipfs://bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba",
    ),
  } as never);
  return Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez);
}

async function simulateRejectedSecondMint(
  collectorTezos: TezosToolkit,
  checkpoint: MacaroniRecoveryCheckpoint,
): Promise<string> {
  const [beforePrimary, beforeFallback, beforeHistory] = await Promise.all([
    readRpcSnapshot(SHADOWNET_RPC_PRIMARY, "pre-reveal"),
    readRpcSnapshot(SHADOWNET_RPC_FALLBACK, "pre-reveal"),
    readTargetHistory(),
  ]);
  const beforeCounters = assertMacaroniRecoveryCounterBoundary(
    beforePrimary.counters,
    beforeFallback.counters,
  );
  assertMacaroniRecoveryTargetHistory(beforeHistory, { phase: "pre-reveal" });
  let rejection = "";
  try {
    const contract = await collectorTezos.contract.at(MACARONI_CURRENT_RECOVERY_CONTRACT);
    const params = contract.methodsObject.mint(1).toTransferParams({
      amount: MINT_PRICE_MUTEZ,
      mutez: true,
    });
    await collectorTezos.estimate.transfer(params);
    assert.fail("read-only simulation unexpectedly accepted a second Macaroni mint");
  } catch (error) {
    rejection = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    assert.match(rejection, /WALLET_LIMIT/, "read-only chain simulation did not reject at WALLET_LIMIT");
  }
  const [afterPrimary, afterFallback, afterHistory] = await Promise.all([
    readRpcSnapshot(SHADOWNET_RPC_PRIMARY, "pre-reveal"),
    readRpcSnapshot(SHADOWNET_RPC_FALLBACK, "pre-reveal"),
    readTargetHistory(),
  ]);
  const afterCounters = assertMacaroniRecoveryCounterBoundary(afterPrimary.counters, afterFallback.counters);
  assert.deepEqual(afterCounters, beforeCounters, "read-only wallet-limit simulation changed an actor counter");
  assert.deepEqual(afterHistory, beforeHistory, "read-only wallet-limit simulation changed target history");
  assertMacaroniRecoveryTargetHistory(afterHistory, { phase: "pre-reveal" });
  await checkpoint.append("EXPECTED_REJECTION", {
    action: "mint",
    mode: "read-only-estimation",
    marker: "WALLET_LIMIT",
    rejectionSha256: sha256(rejection),
    countersBefore: beforeCounters,
    countersAfter: afterCounters,
    targetHistorySha256: canonicalSha256(afterHistory),
  });
  return rejection;
}

async function recoverRejectedSecondMintEvidence(
  collectorTezos: TezosToolkit,
  expectedSha256: string,
): Promise<string> {
  const [beforePrimary, beforeFallback, beforeHistory] = await Promise.all([
    readRpcSnapshot(SHADOWNET_RPC_PRIMARY, "post-reveal"),
    readRpcSnapshot(SHADOWNET_RPC_FALLBACK, "post-reveal"),
    readTargetHistory(),
  ]);
  const beforeCounters = assertMacaroniRecoveryCounterBoundary(
    beforePrimary.counters,
    beforeFallback.counters,
  );
  assertMacaroniRecoveryTargetHistory(beforeHistory, {
    phase: "post-reveal",
    revealOperationHash: MACARONI_V2_REVEAL_OPERATION_HASH,
    revealCounter: MACARONI_V2_REVEAL_COUNTER,
  });
  let rejection = "";
  try {
    const contract = await collectorTezos.contract.at(MACARONI_CURRENT_RECOVERY_CONTRACT);
    const params = contract.methodsObject.mint(1).toTransferParams({
      amount: MINT_PRICE_MUTEZ,
      mutez: true,
    });
    await collectorTezos.estimate.transfer(params);
    assert.fail("read-only recovery simulation unexpectedly accepted a second Macaroni mint");
  } catch (error) {
    rejection = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    assert.match(rejection, /WALLET_LIMIT/, "read-only recovery simulation did not reject at WALLET_LIMIT");
  }
  const [afterPrimary, afterFallback, afterHistory] = await Promise.all([
    readRpcSnapshot(SHADOWNET_RPC_PRIMARY, "post-reveal"),
    readRpcSnapshot(SHADOWNET_RPC_FALLBACK, "post-reveal"),
    readTargetHistory(),
  ]);
  assert.deepEqual(
    assertMacaroniRecoveryCounterBoundary(afterPrimary.counters, afterFallback.counters),
    beforeCounters,
    "read-only recovered wallet-limit simulation changed an actor counter",
  );
  assert.deepEqual(afterHistory, beforeHistory, "read-only recovered wallet-limit simulation changed target history");
  assert.equal(sha256(rejection), expectedSha256, "recovered wallet-limit rejection text drift");
  return rejection;
}

async function readMacaroniV1SubmittedOriginationEvidence(expectedCode: unknown[]): Promise<{
  operation: JsonObject;
  primaryCanonicalCodeSha256: string;
  fallbackCanonicalCodeSha256: string;
  semanticCodeSha256: string;
  storageSha256: string;
}> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [rows, operationGroup, targetTransactions, indexedTokens, primaryScript, fallbackScript] = await Promise.all([
    fetchJson(
      `${base}/operations/originations/${encodeURIComponent(MACARONI_V1_SUBMITTED_OPERATION_HASH)}`,
      "Macaroni V1 submitted origination",
    ),
    fetchJson(
      `${base}/operations/${encodeURIComponent(MACARONI_V1_SUBMITTED_OPERATION_HASH)}`,
      "Macaroni V1 submitted operation group",
    ),
    fetchJson(
      `${base}/operations/transactions?target=${encodeURIComponent(MACARONI_V1_SUBMITTED_CONTRACT)}&status=applied&limit=100`,
      "Macaroni V1 submitted target history",
    ),
    fetchJson(
      `${base}/tokens?contract=${encodeURIComponent(MACARONI_V1_SUBMITTED_CONTRACT)}&limit=1`,
      "Macaroni V1 submitted token inventory",
    ),
    fetchJson(
      `${normalizeBase(SHADOWNET_RPC_PRIMARY)}/chains/main/blocks/head/context/contracts/${MACARONI_V1_SUBMITTED_CONTRACT}/script`,
      "Macaroni V1 submitted primary script",
    ),
    fetchJson(
      `${normalizeBase(SHADOWNET_RPC_FALLBACK)}/chains/main/blocks/head/context/contracts/${MACARONI_V1_SUBMITTED_CONTRACT}/script`,
      "Macaroni V1 submitted fallback script",
    ),
  ]);
  assert.ok(Array.isArray(rows) && rows.length === 1, "Macaroni V1 submitted origination must index exactly once");
  assert.ok(
    Array.isArray(operationGroup) && operationGroup.length === 1,
    "Macaroni V1 submitted manager group must contain exactly one operation",
  );
  const operation = objectValue(rows[0], "Macaroni V1 submitted origination row");
  const groupOperation = objectValue(operationGroup[0], "Macaroni V1 submitted operation group row");
  assert.equal(groupOperation.type, "origination");
  assert.equal(groupOperation.hash, MACARONI_V1_SUBMITTED_OPERATION_HASH);
  assert.equal(groupOperation.status, "applied");
  assert.equal(operation.hash, MACARONI_V1_SUBMITTED_OPERATION_HASH);
  assert.equal(operation.status, "applied");
  assert.equal(safeInteger(operation.level, "Macaroni V1 submitted level"), 4_532_142);
  assert.equal(safeInteger(operation.counter, "Macaroni V1 submitted counter"), 23_831_591);
  assert.equal(addressOf(operation.sender), MACARONI_CURRENT_RECOVERY_CREATOR);
  assert.equal(addressOf(operation.originatedContract), MACARONI_V1_SUBMITTED_CONTRACT);
  assert.equal(operation.originatedContract?.kind, "asset");
  assert.equal(operation.originatedContract?.codeHash, -1_478_651_401);
  assert.equal(operation.originatedContract?.typeHash, -1_848_308_280);
  assert.deepEqual(targetTransactions, [], "Macaroni V1 resume refuses any post-origination contract mutation");
  assert.deepEqual(indexedTokens, [], "Macaroni V1 resume refuses any pre-existing token inventory");
  const primaryCode = objectValue(primaryScript, "primary V1 script").code;
  const fallbackCode = objectValue(fallbackScript, "fallback V1 script").code;
  const primaryStorage = objectValue(primaryScript, "primary V1 script").storage;
  const fallbackStorage = objectValue(fallbackScript, "fallback V1 script").storage;
  const storageSha256 = canonicalSha256(primaryStorage);
  assert.equal(storageSha256, MACARONI_V1_SUBMITTED_STORAGE_SHA256);
  assert.equal(canonicalSha256(fallbackStorage), storageSha256, "Macaroni V1 submitted configured RPC storage disagreement");
  assertMichelsonSemanticScriptCodeIdentity(
    primaryCode,
    fallbackCode,
    "Macaroni V1 submitted configured RPC code disagreement",
  );
  const semanticCodeSha256 = assertMichelsonSemanticScriptCodeIdentity(
    primaryCode,
    expectedCode,
    "Macaroni V1 submitted code differs from the authenticated artifact",
  );
  assert.equal(
    semanticCodeSha256,
    hashMichelsonSemanticScriptCode(expectedCode),
  );
  return {
    operation,
    primaryCanonicalCodeSha256: hashMichelsonScriptCode(primaryCode),
    fallbackCanonicalCodeSha256: hashMichelsonScriptCode(fallbackCode),
    semanticCodeSha256,
    storageSha256,
  };
}

async function verifySubmittedReveal(
  operationHash: string,
  expectedCounter: number,
): Promise<{
  history: Awaited<ReturnType<typeof readTargetHistory>>;
  indexedStorage: JsonObject;
}> {
  assert.equal(validateOperation(operationHash), ValidationResult.VALID);
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const rows = await pollJson(
    `Macaroni recovery reveal ${operationHash}`,
    `${base}/operations/${encodeURIComponent(operationHash)}`,
    (value) => Array.isArray(value) && value.some((row) =>
      row?.hash === operationHash &&
      row?.status === "applied" &&
      addressOf(row?.sender) === MACARONI_CURRENT_RECOVERY_COLLECTOR &&
      addressOf(row?.target) === MACARONI_CURRENT_RECOVERY_CONTRACT &&
      row?.parameter?.entrypoint === "reveal"),
    { attempts: 40, delayMs: 1_000 },
  );
  const matching = (rows as JsonObject[]).filter((row) =>
    row.hash === operationHash &&
    row.status === "applied" &&
    addressOf(row.sender) === MACARONI_CURRENT_RECOVERY_COLLECTOR &&
    addressOf(row.target) === MACARONI_CURRENT_RECOVERY_CONTRACT &&
    row.parameter?.entrypoint === "reveal");
  assert.equal(matching.length, 1, "reveal hash did not resolve to exactly one scoped root operation");
  assert.equal(safeInteger(matching[0].counter, "reveal operation counter"), expectedCounter);
  assert.equal(String(matching[0].parameter?.value), "1");
  assert.equal(safeInteger(matching[0].amount, "reveal operation amount"), 0);
  const [history, indexedStorage] = await Promise.all([
    readTargetHistory(),
    readIndexedStorage("post-reveal"),
  ]);
  assertMacaroniRecoveryTargetHistory(history, {
    phase: "post-reveal",
    revealOperationHash: operationHash,
    revealCounter: expectedCounter,
  });
  return { history, indexedStorage };
}

function artifactIdFromPath(prefix: string, relativePath: string, digest: string): string {
  const readable = relativePath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${prefix}-${readable}-${digest.slice(0, 12)}`;
}

async function treeArtifactRecords(
  appRoot: string,
  relativeRoot: string,
  prefix: string,
  kind: string,
  exclude: ReadonlySet<string> = new Set(),
): Promise<Array<{ id: string; kind: string; path: string; sha256: string }>> {
  const absoluteRoot = path.join(appRoot, relativeRoot);
  const relativeFiles = await listRegularFiles(absoluteRoot);
  const output = [];
  for (const child of relativeFiles) {
    const relativePath = `${relativeRoot}/${child}`;
    if (exclude.has(relativePath)) continue;
    const bytes = await readFile(path.join(appRoot, relativePath));
    const digest = sha256(bytes);
    output.push({
      id: artifactIdFromPath(prefix, relativePath, digest),
      kind,
      path: relativePath,
      sha256: digest,
    });
  }
  return output;
}

function pinArtifactId(artifacts: WrittenPinArtifact[], fileName: string): string {
  const matches = artifacts.filter((artifact) => artifact.fileName === fileName);
  assert.equal(matches.length, 1, `expected one ${fileName} artifact`);
  return matches[0].id;
}

function indexedOperation(
  input: {
    kind: string;
    hash: string;
    entrypoint?: string | null;
  },
): Record<string, unknown> & { hash: string } {
  return {
    kind: input.kind,
    hash: input.hash,
    contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
    ...(input.entrypoint ? { entrypoint: input.entrypoint } : {}),
    status: "applied",
    explorerUrl: `https://shadownet.tzkt.io/${input.hash}`,
  };
}

async function finalizeRecoveredMacaroniProof(input: {
  runRoot: string;
  appRoot: string;
  ipfs: IpfsProofConfig;
  startedAt: string;
  completedAt: string;
  screenshots: CapturePastaProofStageResult[];
  v1Lane: MacaroniV1LaneResult;
  v2WrittenPins: WrittenPinArtifact[];
  v2CollectorReceipts: PastaUiLivePublicReceipt[];
  revealOperationHash: string;
  revealCounter: number;
  walletLimitRejection: string;
  collectorFunding: unknown;
  preflight: Awaited<ReturnType<typeof validateMacaroniRecoveryPreflight>>;
  postRpc: {
    primary: Awaited<ReturnType<typeof readRpcSnapshot>>;
    fallback: Awaited<ReturnType<typeof readRpcSnapshot>>;
  };
  postHistory: Awaited<ReturnType<typeof readTargetHistory>>;
  postIndexedStorage: JsonObject;
}): Promise<{
  manifestPath: string;
  receiptPath: string;
  operationHashes: string[];
  contractAddresses: string[];
}> {
  const {
    appRoot,
    completedAt,
    preflight,
    postHistory,
    postIndexedStorage,
    screenshots,
    v1Lane,
    v2WrittenPins,
  } = input;
  assert.equal(screenshots.length, 15, "Macaroni recovery must package exactly fifteen screenshot stages");
  assert.deepEqual(screenshots.map((capture) => capture.sidecar.stageOrdinal), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  const revealRow = postHistory.transactions.find((row) => row.hash === input.revealOperationHash);
  assert.ok(revealRow, "post-reveal history lacks the submitted reveal");
  const v2Operations = [
    ...MACARONI_RECOVERED_OPERATIONS.map(indexedOperation),
    indexedOperation({ kind: "reveal", hash: input.revealOperationHash, entrypoint: "reveal" }),
  ];
  const operations = [...v2Operations, ...v1Lane.operations];
  const operationHashes = operations.map((operation) => operation.hash);
  assert.equal(new Set(operationHashes).size, operationHashes.length, "Macaroni operation hashes must be unique");

  const tzktEvidence = {
    schema: "pastaprotocol-macaroni-current-recovery-index@1",
    runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
    contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
    recoveredPrefix: {
      operations: MACARONI_RECOVERED_OPERATIONS,
      targetHistory: preflight.targetHistory,
      indexedStorage: preflight.indexedStorage,
      rpc: {
        primary: preflight.primaryRpc,
        fallback: preflight.fallbackRpc,
      },
    },
    reveal: {
      operationHash: input.revealOperationHash,
      counter: input.revealCounter,
      operation: revealRow,
      targetHistory: postHistory,
      indexedStorage: postIndexedStorage,
      rpc: input.postRpc,
    },
  };
  const tzktBytes = deterministicJsonBytes(tzktEvidence);
  const tzktRelativePath = "artifacts/macaroni-ui-live-tzkt-index.json";
  await writeFile(path.join(appRoot, tzktRelativePath), tzktBytes);

  const zipBytes = await readFile(path.join(appRoot, "artifacts", "macaroni-site.zip"));
  const configBytes = await readFile(path.join(appRoot, "artifacts", "self-hosted-site", "drop.config.js"));
  const token = {
    id: "macaroni-v2-blind-edition-0",
    contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
    tokenId: "0",
    explorerUrl: `https://shadownet.tzkt.io/${MACARONI_CURRENT_RECOVERY_CONTRACT}/tokens/0`,
    metadataArtifactId: pinArtifactId(v2WrittenPins, "1.json"),
    mediaArtifactId: pinArtifactId(v2WrittenPins, "1.png"),
    metadataUri: FINAL_METADATA_URI,
    artifactUri: `ipfs://${MACARONI_RECOVERED_CONTENT.find((content) => content.fileName === "1.png")!.cid}`,
  };
  const drop = {
    tokenRows: 1,
    declaredSupply: TOKEN_QUANTITY,
    minted: 1,
    revealed: 1,
    delayedReveal: true,
    revealDelaySeconds: 0,
    priceMutez: MINT_PRICE_MUTEZ,
    maxPerWallet: 1,
    walletLimitUiSubmissionPrevented: true,
    walletLimitChainRejected: false,
    walletLimitReadOnlySimulationRejected: true,
    walletLimitFailureMarker: "WALLET_LIMIT",
    walletLimitErrorSha256: sha256(input.walletLimitRejection),
  };
  const v2SelfHostedSite = {
    zipPath: "artifacts/macaroni-site.zip",
    zipSha256: sha256(zipBytes),
    configPath: "artifacts/self-hosted-site/drop.config.js",
    configSha256: sha256(configBytes),
    requiredFiles: REQUIRED_SITE_FILES,
    preservedExtractedFiles: true,
  };
  const receiptSeed = {
    schema: "pastaprotocol-macaroni-ui-live-run@1",
    classification: "UI-LIVE-RECOVERED-CHECKPOINTED",
    network: {
      name: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
      rpcUrl: input.postRpc.primary.rpcUrl,
    },
    startedAt: input.startedAt,
    completedAt,
    actors: {
      creator: MACARONI_CURRENT_RECOVERY_CREATOR,
      collector: MACARONI_CURRENT_RECOVERY_COLLECTOR,
      independent: true,
    },
    recovery: {
      runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
      interruption: "post-applied-mint IPFS HTTP 500 before screenshot 7",
      exactPrefixInventorySha256: preflight.prefix.inventorySha256,
      recoveredOperationHashes: MACARONI_RECOVERED_OPERATIONS.map((operation) => operation.hash),
      recoveredPinsRepinned: false,
      recoveredMutationsReplayed: false,
      firstNewV2Mutation: input.revealOperationHash,
      revealCounter: input.revealCounter,
      checkpointPath: CHECKPOINT_RELATIVE_ROOT,
    },
    funding: {
      v1: v1Lane.funding,
      v2: {
        creator: null,
        collector: input.collectorFunding,
      },
    },
    contract: {
      address: MACARONI_CURRENT_RECOVERY_CONTRACT,
      version: "macaroni-editions-v2",
      explorerUrl: `https://shadownet.tzkt.io/${MACARONI_CURRENT_RECOVERY_CONTRACT}`,
    },
    contracts: {
      v1: {
        address: v1Lane.contractAddress,
        version: "macaroni-v1",
        explorerUrl: `https://shadownet.tzkt.io/${v1Lane.contractAddress}`,
      },
      v2: {
        address: MACARONI_CURRENT_RECOVERY_CONTRACT,
        version: "macaroni-editions-v2",
        explorerUrl: `https://shadownet.tzkt.io/${MACARONI_CURRENT_RECOVERY_CONTRACT}`,
      },
    },
    canonicalArtifactTransport: {
      v1: v1Lane.canonicalArtifactTransport,
      v2: {
        browserLoadedSha256: hashJsonForBridge(preflight.contractArtifact),
        nodeAuthenticatedSha256: hashJsonForBridge(preflight.contractArtifact),
        canonicalMichelsonCodeSha256: CONTRACT_CANONICAL_CODE_SHA256,
        onChainExactHashMatch: true,
        reason: "Recovery authenticated the exact original ZIP/config, local artifact, and dual-RPC on-chain code before exposing only reveal.",
      },
    },
    drop,
    drops: { v1: v1Lane.drop, v2: drop },
    selfHostedSite: v2SelfHostedSite,
    selfHostedSites: { v1: v1Lane.selfHostedSite, v2: v2SelfHostedSite },
    token,
    tokens: [v1Lane.token, token],
    operations,
    recoveredIndexedOperations: MACARONI_RECOVERED_OPERATIONS,
    bridgeReceipts: {
      v1: {
        creator: v1Lane.creatorReceipts,
        collector: v1Lane.collectorReceipts,
      },
      v2: {
        creator: [],
        collectorContinuation: input.v2CollectorReceipts,
      },
    },
    pins: [...v1Lane.writtenPins, ...v2WrittenPins],
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    screenshotSidecars: screenshots.map((capture) => capture.manifestSidecarArtifact),
    tzktEvidence: {
      v1: v1Lane.tzktEvidence,
      v2: { path: tzktRelativePath, sha256: sha256(tzktBytes) },
    },
  };
  const receiptBytes = deterministicJsonBytes(receiptSeed);
  const receiptRelativePath = "artifacts/macaroni-ui-live-run.json";
  const receiptPath = path.join(appRoot, receiptRelativePath);
  await writeFile(receiptPath, receiptBytes);

  const v2SiteFileArtifacts = await treeArtifactRecords(
    appRoot,
    "artifacts/self-hosted-site",
    "macaroni-v2-site-file",
    "self-hosted-site-file",
    new Set(["artifacts/self-hosted-site/drop.config.js"]),
  );
  const checkpointArtifacts = await treeArtifactRecords(
    appRoot,
    CHECKPOINT_RELATIVE_ROOT,
    "macaroni-recovery-checkpoint",
    "recovery-checkpoint",
  );
  const localArtifacts = [
    ...v1Lane.localArtifacts,
    ...screenshots.map((capture) => capture.manifestSidecarArtifact),
    {
      id: "macaroni-ui-live-run",
      kind: "proof-receipt",
      path: receiptRelativePath,
      sha256: sha256(receiptBytes),
    },
    {
      id: "macaroni-ui-live-tzkt-index",
      kind: "indexer-evidence",
      path: tzktRelativePath,
      sha256: sha256(tzktBytes),
    },
    {
      id: "macaroni-self-hosted-site",
      kind: "self-hosted-site",
      path: "artifacts/macaroni-site.zip",
      sha256: sha256(zipBytes),
    },
    {
      id: "macaroni-drop-config",
      kind: "drop-config",
      path: "artifacts/self-hosted-site/drop.config.js",
      sha256: sha256(configBytes),
    },
    ...v2SiteFileArtifacts,
    ...checkpointArtifacts,
  ];
  const allArtifacts = [
    ...v1Lane.writtenPins.map(({ fileName: _fileName, ...artifact }) => artifact),
    ...v2WrittenPins.map(({ fileName: _fileName, ...artifact }) => artifact),
    ...localArtifacts,
  ];
  assert.equal(new Set(allArtifacts.map((artifact) => artifact.id)).size, allArtifacts.length);
  assert.equal(new Set(allArtifacts.map((artifact) => artifact.path)).size, allArtifacts.length);

  const screenshotIds = screenshots.map((capture) => capture.manifestScreenshot.stage);
  const v1LocalById = new Map(v1Lane.localArtifacts.map((artifact) => [artifact.id, artifact]));
  for (const id of [
    "macaroni-v1-ui-live-tzkt-index",
    "macaroni-v1-self-hosted-site",
    "macaroni-v1-drop-config",
  ]) assert.ok(v1LocalById.has(id), `V1 lane lacks ${id}`);
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "macaroni",
    role: "token-publisher",
    runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
    capturedAt: completedAt,
    network: {
      name: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
      rpcUrl: input.postRpc.primary.rpcUrl,
    },
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    artifacts: allArtifacts,
    contracts: [
      {
        address: v1Lane.contractAddress,
        kind: "classic-blind-drop-v1",
        explorerUrl: `https://shadownet.tzkt.io/${v1Lane.contractAddress}`,
      },
      {
        address: MACARONI_CURRENT_RECOVERY_CONTRACT,
        kind: "blind-drop-v2",
        explorerUrl: `https://shadownet.tzkt.io/${MACARONI_CURRENT_RECOVERY_CONTRACT}`,
      },
    ],
    operations,
    tokens: [v1Lane.token, token],
    roleEvidence: [],
    capabilities: [
      {
        id: "studio-create-pin-deploy-sync-export",
        description: "Authenticate the actual Macaroni Studio V2 configuration, exact pins, deployment, inventory/stage sync, and complete exported self-hosted collector website from the immutable pre-interruption evidence prefix.",
        evidence: {
          screenshots: screenshotIds.slice(0, 5),
          artifacts: [
            ...v2WrittenPins.map((artifact) => artifact.id),
            ...screenshots.slice(0, 5).map((capture) => capture.manifestSidecarArtifact.id),
            "macaroni-self-hosted-site",
            "macaroni-drop-config",
            ...v2SiteFileArtifacts.map((artifact) => artifact.id),
          ],
          contracts: [MACARONI_CURRENT_RECOVERY_CONTRACT],
          operations: v2Operations.slice(0, 3).map((operation) => operation.hash),
          tokens: [],
          roleEvidence: [],
          urls: [
            `https://shadownet.tzkt.io/${MACARONI_CURRENT_RECOVERY_CONTRACT}`,
            ...v2WrittenPins.map((artifact) => artifact.gatewayUrl),
          ],
        },
      },
      {
        id: "exported-page-mint-policy-reveal",
        description: "Authenticate the applied collector mint, reconstruct its sealed post-mint page from exact chain/IPFS state, prove the one-per-wallet boundary without injection, and submit only the missing permissionless reveal.",
        evidence: {
          screenshots: screenshotIds.slice(5, 8),
          artifacts: [
            ...screenshots.slice(5, 8).map((capture) => capture.manifestSidecarArtifact.id),
            "macaroni-ui-live-run",
            "macaroni-ui-live-tzkt-index",
            token.metadataArtifactId,
            token.mediaArtifactId,
          ],
          contracts: [MACARONI_CURRENT_RECOVERY_CONTRACT],
          operations: v2Operations.slice(3).map((operation) => operation.hash),
          tokens: [token.id],
          roleEvidence: [],
          urls: [
            token.explorerUrl,
            v2WrittenPins.find((artifact) => artifact.fileName === "1.json")!.gatewayUrl,
            v2WrittenPins.find((artifact) => artifact.fileName === "1.png")!.gatewayUrl,
          ],
        },
      },
      {
        id: "v1-studio-create-pin-deploy-sync-export",
        description: "Use the actual Macaroni Studio V1 mode to pin exact media and metadata, originate a fresh canonical V1 FA2 contract, load its 1/1 inventory and sale stage, and export the complete self-hostable collector website.",
        evidence: {
          screenshots: v1Lane.captures.slice(0, 5).map((capture) => capture.manifestScreenshot.stage),
          artifacts: [
            ...v1Lane.writtenPins.map((artifact) => artifact.id),
            ...v1Lane.captures.slice(0, 5).map((capture) => capture.manifestSidecarArtifact.id),
            "macaroni-v1-self-hosted-site",
            "macaroni-v1-drop-config",
          ],
          contracts: [v1Lane.contractAddress],
          operations: v1Lane.operations.slice(0, 3).map((operation) => operation.hash),
          tokens: [],
          roleEvidence: [],
          urls: [
            `https://shadownet.tzkt.io/${v1Lane.contractAddress}`,
            ...v1Lane.writtenPins.map((artifact) => artifact.gatewayUrl),
          ],
        },
      },
      {
        id: "v1-exported-page-instant-mint-policy",
        description: "Use an independent collector through the actual exported V1 website to mint the 1/1 with final metadata immediately and prove sold-out enforcement in the UI and a signer-free chain simulation.",
        evidence: {
          screenshots: v1Lane.captures.slice(5).map((capture) => capture.manifestScreenshot.stage),
          artifacts: [
            ...v1Lane.captures.slice(5).map((capture) => capture.manifestSidecarArtifact.id),
            "macaroni-v1-ui-live-tzkt-index",
            v1Lane.token.metadataArtifactId,
            v1Lane.token.mediaArtifactId,
          ],
          contracts: [v1Lane.contractAddress],
          operations: v1Lane.operations.slice(3).map((operation) => operation.hash),
          tokens: [v1Lane.token.id],
          roleEvidence: [],
          urls: [
            v1Lane.token.explorerUrl,
            v1Lane.finalMetadataPin.proof.publicGatewayUrl,
            v1Lane.finalMediaPin.proof.publicGatewayUrl,
          ],
        },
      },
      {
        id: "authenticated-zero-replay-recovery",
        description: "Bind the continuation to the exact 21-file prefix, six public raw-SHA256 CIDs, dual-RPC code/storage state, actor counter floors, and exact target history before allowing one reveal.",
        evidence: {
          screenshots: screenshotIds.slice(6, 8),
          artifacts: checkpointArtifacts.map((artifact) => artifact.id),
          contracts: [MACARONI_CURRENT_RECOVERY_CONTRACT],
          operations: [],
          tokens: [],
          roleEvidence: [],
          urls: [],
        },
      },
    ],
  };
  const referenced = {
    screenshots: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.screenshots)),
    artifacts: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.artifacts)),
    contracts: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.contracts)),
    operations: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.operations)),
    tokens: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.tokens)),
  };
  assert.deepEqual([...referenced.screenshots].sort(), screenshotIds.slice().sort());
  assert.deepEqual([...referenced.artifacts].sort(), allArtifacts.map((artifact) => artifact.id).sort());
  assert.deepEqual(
    [...referenced.contracts].sort(),
    [v1Lane.contractAddress, MACARONI_CURRENT_RECOVERY_CONTRACT].sort(),
  );
  assert.deepEqual([...referenced.operations].sort(), operationHashes.slice().sort());
  assert.deepEqual([...referenced.tokens].sort(), [v1Lane.token.id, token.id].sort());
  const manifestPath = path.join(appRoot, "manifest.json");
  await writeFile(manifestPath, deterministicJsonBytes(manifest));
  return {
    manifestPath,
    receiptPath,
    operationHashes,
    contractAddresses: [v1Lane.contractAddress, MACARONI_CURRENT_RECOVERY_CONTRACT],
  };
}

export async function runMacaroniCurrentRecovery(): Promise<{
  status: string;
  classification: string;
  manifestPath?: string;
  receiptPath?: string;
  operationHashes?: string[];
  contractAddresses?: string[];
  [key: string]: unknown;
}> {
  const runRoot = assertMacaroniCurrentRecoveryAllowed(process.env);
  assert.equal(validateContractAddress(MACARONI_CURRENT_RECOVERY_CONTRACT), ValidationResult.VALID);
  for (const actor of [MACARONI_CURRENT_RECOVERY_CREATOR, MACARONI_CURRENT_RECOVERY_COLLECTOR]) {
    assert.equal(validateAddress(actor), ValidationResult.VALID);
  }
  const prewriteResume = process.env[MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG] === "1";
  const v1SubmittedResume = process.env[MACARONI_CURRENT_RECOVERY_V1_SUBMITTED_RESUME_FLAG] === "1";
  const invocationStartedAt = new Date().toISOString();
  const ipfs = resolveIpfsProofConfig();
  const preflight = await validateMacaroniRecoveryPreflight(runRoot, ipfs, {
    exactPrewriteCheckpointPresent: prewriteResume,
    ...(v1SubmittedResume ? {
      exactCheckpointFiles: V1_SUBMITTED_CHECKPOINT_FILES,
      allowedGeneratedFiles: V1_SUBMITTED_GENERATED_FILES,
      historicalPreRevealLevel: MACARONI_V2_REVEAL_LEVEL - 1,
    } : {}),
  });
  const v1SubmittedBoundary = v1SubmittedResume
    ? await (async () => {
        const [primary, fallback, history, indexedStorage, origination] = await Promise.all([
          readRpcSnapshot(SHADOWNET_RPC_PRIMARY, "post-reveal"),
          readRpcSnapshot(SHADOWNET_RPC_FALLBACK, "post-reveal"),
          readTargetHistory(),
          readIndexedStorage("post-reveal"),
          readMacaroniV1SubmittedOriginationEvidence(preflight.v1ContractArtifact),
        ]);
        assert.equal(primary.storageSha256, fallback.storageSha256, "post-reveal configured RPC storage disagreement");
        assert.equal(primary.codeSha256, fallback.codeSha256, "post-reveal configured RPC code disagreement");
        assertMacaroniRecoveryTargetHistory(history, {
          phase: "post-reveal",
          revealOperationHash: MACARONI_V2_REVEAL_OPERATION_HASH,
          revealCounter: MACARONI_V2_REVEAL_COUNTER,
        });
        return { primary, fallback, history, indexedStorage, origination };
      })()
    : null;
  const immediateBoundary = v1SubmittedResume
    ? {
        primary: preflight.primaryRpc,
        fallback: preflight.fallbackRpc,
        counters: preflight.counters,
      }
    : await assertImmediatePreSignerBoundary();
  const checkpointInput: MacaroniRecoveryCheckpointInput = {
    prefix: preflight.prefix,
    recoveredContent: preflight.recoveredContent,
    counters: immediateBoundary.counters,
    rpc: {
      primary: immediateBoundary.primary,
      fallback: immediateBoundary.fallback,
    },
  };
  const reopened = v1SubmittedResume
    ? await MacaroniRecoveryCheckpoint.reopenV1Submitted(preflight.appRoot, checkpointInput, {
        preTargetHistorySha256: canonicalSha256(preflight.targetHistory),
        preIndexedStorageSha256: canonicalSha256(preflight.indexedStorage),
        postTargetHistorySha256: canonicalSha256(v1SubmittedBoundary!.history),
        postIndexedStorageSha256: canonicalSha256(v1SubmittedBoundary!.indexedStorage),
        postStorageSha256: v1SubmittedBoundary!.primary.storageSha256,
      })
    : prewriteResume
      ? await MacaroniRecoveryCheckpoint.reopenExactPrewrite(preflight.appRoot, checkpointInput, {
          targetHistorySha256: canonicalSha256(preflight.targetHistory),
          indexedStorageSha256: canonicalSha256(preflight.indexedStorage),
        })
      : null;
  if (process.env[MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG] === "1") {
    return {
      status: "PREFLIGHT_PASSED",
      classification: v1SubmittedResume
        ? "READ-ONLY-EXACT-V1-SUBMITTED-RESUME-BOUNDARY"
        : prewriteResume
          ? "READ-ONLY-EXACT-PREWRITE-RESUME-BOUNDARY"
          : "READ-ONLY-EXACT-BOUNDARY",
      runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
      contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
      prefixInventorySha256: preflight.prefix.inventorySha256,
      targetHistorySha256: canonicalSha256(preflight.targetHistory),
      recoveredContent: preflight.recoveredContent.map(({ bytes: _bytes, ...content }) => content),
      actorCounters: v1SubmittedBoundary
        ? assertMacaroniRecoveryCounterBoundary(
            v1SubmittedBoundary.primary.counters,
            v1SubmittedBoundary.fallback.counters,
          )
        : immediateBoundary.counters,
      ...(reopened ? {
        checkpointId: MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.checkpointId,
        authenticatedEventCount: v1SubmittedResume
          ? MACARONI_V1_SUBMITTED_CHECKPOINT_PHASES.length
          : MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.lastEventIndex,
        nextEventIndex: v1SubmittedResume
          ? MACARONI_V1_SUBMITTED_CHECKPOINT_PHASES.length + 1
          : MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.lastEventIndex + 1,
        nextMutation: v1SubmittedResume
          ? {
              actor: "creator",
              contractAddress: MACARONI_V1_SUBMITTED_CONTRACT,
              entrypoint: "add_tokens",
              submittedOriginationReplayPermitted: false,
            }
          : {
              actor: "collector",
              contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
              entrypoint: "reveal",
              payload: 1,
            },
        ...(v1SubmittedResume ? {
          recoveredOrigination: v1SubmittedBoundary!.origination,
        } : {}),
        replayedCheckpointEvents: 0,
      } : {}),
      sideEffects: {
        signerMaterialLoaded: false,
        chainWrites: 0,
        ipfsWrites: 0,
        localWrites: 0,
      },
    };
  }

  const checkpoint = reopened?.checkpoint
    ?? await MacaroniRecoveryCheckpoint.create(preflight.appRoot, checkpointInput);
  const startedAt = reopened?.createdAt ?? invocationStartedAt;
  if (!prewriteResume && !v1SubmittedResume) {
    await checkpoint.append("RECOVERED_PREFIX_ACCEPTED", {
      inventorySha256: preflight.prefix.inventorySha256,
      targetHistorySha256: canonicalSha256(preflight.targetHistory),
      indexedStorageSha256: canonicalSha256(preflight.indexedStorage),
      recoveredOperationHashes: MACARONI_RECOVERED_OPERATIONS.map((operation) => operation.hash),
      recoveredCids: preflight.recoveredContent.map((content) => content.cid),
    });
  }

  const signerConfiguration = await signerEnv(SHADOWNET_RPC_PRIMARY, {
    socketPath: "/tmp/wtf-pasta-shadownet-macaroni-current-recovery.sock",
    auditLog: "/tmp/wtf-pasta-shadownet-macaroni-current-recovery-audit.log",
  });
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(signerConfiguration);
  assert.equal(creator.address, MACARONI_CURRENT_RECOVERY_CREATOR);
  assert.equal(collector.address, MACARONI_CURRENT_RECOVERY_COLLECTOR);
  const creatorTezos = buildToolkit(creatorSigner, SHADOWNET_RPC_PRIMARY);
  const collectorTezos = buildToolkit(collectorSigner, SHADOWNET_RPC_PRIMARY);
  const collectorFallbackTezos = buildToolkit(collectorSigner, SHADOWNET_RPC_FALLBACK);
  await Promise.all([
    assertShadownet(creatorTezos, "Macaroni recovery creator startup"),
    assertShadownet(collectorTezos, "Macaroni recovery collector startup"),
    assertShadownet(collectorFallbackTezos, "Macaroni recovery collector fallback startup"),
  ]);
  const [creatorBalanceValue, collectorBalanceValue, estimatedV1OriginationMutez] = await Promise.all([
    creatorTezos.tz.getBalance(creator.address),
    collectorTezos.tz.getBalance(collector.address),
    estimateV1OriginationMutez(creatorTezos, creator.address, preflight.v1ContractArtifact),
  ]);
  const creatorBalanceMutez = safeInteger(creatorBalanceValue.toString(), "creator balance");
  const collectorBalanceMutez = safeInteger(collectorBalanceValue.toString(), "collector balance");
  const requiredCreatorBalanceMutez = estimatedV1OriginationMutez + CREATOR_OPERATION_RESERVE_MUTEZ;
  const requiredCollectorBalanceMutez = 2 * COLLECTOR_OPERATION_RESERVE_MUTEZ + MINT_PRICE_MUTEZ;
  assert.ok(
    creatorBalanceMutez >= requiredCreatorBalanceMutez,
    `creator balance ${creatorBalanceMutez} is below V1 recovery requirement ${requiredCreatorBalanceMutez}`,
  );
  assert.ok(
    collectorBalanceMutez >= requiredCollectorBalanceMutez,
    `collector balance ${collectorBalanceMutez} is below recovery requirement ${requiredCollectorBalanceMutez}`,
  );
  if (prewriteResume || v1SubmittedResume) {
    assert.ok(reopened, "Macaroni resume checkpoint was not authenticated");
    assert.equal(reopened.signerAuthentication.creator, creator.address);
    assert.equal(reopened.signerAuthentication.collector, collector.address);
    assert.equal(
      safeInteger(reopened.signerAuthentication.estimatedV1OriginationMutez, "stored V1 origination estimate"),
      estimatedV1OriginationMutez,
      "Macaroni resume origination estimate drift",
    );
  } else {
    await checkpoint.append("SIGNERS_AUTHENTICATED", {
      creator: creator.address,
      collector: collector.address,
      creatorBalanceMutez,
      collectorBalanceMutez,
      estimatedV1OriginationMutez,
    });
  }

  if (v1SubmittedResume) {
    assert.ok(reopened && "events" in reopened, "Macaroni V1-submitted events were not authenticated");
    assert.ok(v1SubmittedBoundary, "Macaroni V1-submitted live boundary was not authenticated");
    const checkpointEvents = (reopened as { events: JsonObject[] }).events;
    const revealScreenshots = await loadAppliedRevealScreenshots(preflight.appRoot);
    for (const [capture, event] of [
      [revealScreenshots[0], checkpointEvents[2]],
      [revealScreenshots[1], checkpointEvents[8]],
    ] as const) {
      assert.equal(capture.pngRelativePath, event.payload.path, "Macaroni recovered reveal screenshot path drift");
      assert.equal(capture.sidecar.sha256, event.payload.sha256, "Macaroni recovered reveal screenshot hash drift");
    }
    const walletLimitRejection = await recoverRejectedSecondMintEvidence(
      collectorTezos,
      String(checkpointEvents[3].payload.rejectionSha256),
    );
    const recoveredPinEvents = checkpointEvents.slice(11, 19);
    let recoveredPinEventIndex = 0;
    let recoveredOriginationApplied = false;
    const v1Lane = await runMacaroniV1UiLane({
      appRoot: preflight.appRoot,
      runRoot,
      runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
      rpcUrl: SHADOWNET_RPC_PRIMARY,
      ipfs,
      creatorTezos,
      collectorTezos,
      creatorAddress: creator.address,
      collectorAddress: collector.address,
      creatorBalanceMutez,
      collectorBalanceMutez,
      requiredCreatorBalanceMutez,
      requiredCollectorBalanceMutez,
      estimatedOriginationMutez: estimatedV1OriginationMutez,
      code: preflight.v1ContractArtifact,
      resumeOrigination: {
        operationHash: MACARONI_V1_SUBMITTED_OPERATION_HASH,
        contractAddress: MACARONI_V1_SUBMITTED_CONTRACT,
      },
      observer: {
        onEvent: async (event) => {
          if (event.phase === "PIN_PREPARED" || event.phase === "PIN_CONFIRMED") {
            assert.ok(
              recoveredPinEventIndex < recoveredPinEvents.length,
              "Macaroni V1 resume produced an unexpected extra pin event",
            );
            assertRecoveredV1PinEvent(event, recoveredPinEvents[recoveredPinEventIndex++]);
            return;
          }
          if (event.phase === "APPLIED" && event.session === "creator-bootstrap") {
            assert.equal(recoveredOriginationApplied, false, "Macaroni V1 resume repeated origination finality");
            const payload = v1LaneCheckpointPayload(event);
            assert.equal(payload.operationSequence, 1);
            assert.equal(payload.operationHash, MACARONI_V1_SUBMITTED_OPERATION_HASH);
            assert.equal(payload.contractAddress, MACARONI_V1_SUBMITTED_CONTRACT);
            assert.deepEqual(payload.entrypoints, []);
            await checkpoint.append("V1_APPLIED", payload);
            recoveredOriginationApplied = true;
            return;
          }
          assert.equal(
            recoveredOriginationApplied,
            true,
            `Macaroni V1 resume refuses ${event.phase} before recovered origination finality`,
          );
          await appendV1LaneCheckpointEvent(checkpoint, event);
        },
      },
    });
    assert.equal(recoveredPinEventIndex, recoveredPinEvents.length);
    assert.equal(recoveredOriginationApplied, true);
    assert.equal(v1Lane.contractAddress, MACARONI_V1_SUBMITTED_CONTRACT);
    assert.equal(v1Lane.operations.length, 4);
    assert.equal(v1Lane.operations[0].hash, MACARONI_V1_SUBMITTED_OPERATION_HASH);
    assert.equal(v1Lane.captures.length, 7);
    await checkpoint.append("V1_LANE_APPLIED", {
      contractAddress: v1Lane.contractAddress,
      operationHashes: v1Lane.operations.map((operation) => operation.hash),
      pinUris: v1Lane.writtenPins.map((pin) => pin.ipfsUri),
      screenshotOrdinals: v1Lane.captures.map((capture) => capture.sidecar.stageOrdinal),
      recoveredOriginationReplayed: false,
    });
    const recoveredPins = await writeRecoveredPins(preflight.appRoot, preflight.recoveredContent, ipfs);
    await checkpoint.append("RECOVERED_PINS_MATERIALIZED", {
      repinned: false,
      artifacts: recoveredPins.artifacts.map((artifact) => ({
        id: artifact.id,
        path: artifact.path,
        sha256: artifact.sha256,
        ipfsUri: artifact.ipfsUri,
      })),
    });
    await checkpoint.append("CONTINUATION_APPLIED_AWAITING_PACKAGE", {
      v2ContractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
      v2RevealOperationHash: MACARONI_V2_REVEAL_OPERATION_HASH,
      v1ContractAddress: v1Lane.contractAddress,
      v1OperationHashes: v1Lane.operations.map((operation) => operation.hash),
      expectedScreenshotCount: 15,
      terminal: false,
      completionMarker: "manifest.json",
      recoveredOriginationReplayed: false,
    });
    const revealSubmittedEvent = checkpointEvents[6];
    const recoveredRevealReceipt = {
      schema: "pastaprotocol-ui-live-receipt@1" as const,
      sequence: safeInteger(revealSubmittedEvent.payload.operationSequence, "recovered reveal operation sequence"),
      timestampUtc: String(revealSubmittedEvent.timestampUtc),
      action: "call" as const,
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress: MACARONI_CURRENT_RECOVERY_COLLECTOR,
      contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
      operationHash: MACARONI_V2_REVEAL_OPERATION_HASH,
      entrypoints: ["reveal"],
      recoveredFromCheckpoint: {
        submittedEventIndex: 7,
        appliedEventIndex: 8,
        terminalPrefixFileSha256: MACARONI_V1_SUBMITTED_EVENT_FILE_SHA256,
      },
    };
    const storedFunding = reopened.signerAuthentication;
    const recoveredCollectorFunding = {
      balanceMutez: safeInteger(storedFunding.collectorBalanceMutez, "stored collector funding balance"),
      requiredBalanceMutez: requiredCollectorBalanceMutez,
      estimatedOriginationMutez: 0,
      operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
      recoveredFromCheckpointEventIndex: 2,
    };
    const finalized = await finalizeRecoveredMacaroniProof({
      runRoot,
      appRoot: preflight.appRoot,
      ipfs,
      startedAt,
      completedAt: new Date().toISOString(),
      screenshots: [
        ...preflight.recoveredScreenshots,
        ...revealScreenshots,
        ...v1Lane.captures,
      ],
      v1Lane,
      v2WrittenPins: recoveredPins.artifacts,
      v2CollectorReceipts: [recoveredRevealReceipt],
      revealOperationHash: MACARONI_V2_REVEAL_OPERATION_HASH,
      revealCounter: MACARONI_V2_REVEAL_COUNTER,
      walletLimitRejection,
      collectorFunding: recoveredCollectorFunding,
      preflight,
      postRpc: {
        primary: v1SubmittedBoundary.primary,
        fallback: v1SubmittedBoundary.fallback,
      },
      postHistory: v1SubmittedBoundary.history,
      postIndexedStorage: v1SubmittedBoundary.indexedStorage,
    });
    return {
      status: "PASSED",
      classification: "UI-LIVE-RECOVERED-V1-SUBMITTED-CHECKPOINT",
      runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
      contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
      recoveredV1OriginationReplayed: false,
      ...finalized,
    };
  }

  let collectorProjection = await readMacaroniCurrentRecoveryProjection(
    collectorTezos,
    MACARONI_CURRENT_RECOVERY_CONTRACT,
    collector.address,
    collectorFallbackTezos,
  );
  assert.equal(collectorProjection.minted, 1);
  assert.equal(collectorProjection.revealed, 0);
  assert.equal(collectorProjection.reveal_cursor, 0);
  assert.equal(collectorProjection.reveal_tail, 1);
  let revealPreSubmitCounter: number | null = null;
  let revealOperationHash = "";
  let revealApplied: Awaited<ReturnType<typeof verifySubmittedReveal>> | null = null;
  const recoverySession = new TaquitoPastaUiLiveSession({
    tezos: collectorTezos,
    signerAddress: collector.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([MACARONI_CURRENT_RECOVERY_CONTRACT]),
    allowedEntrypoints: new Set(["reveal"]),
    initialReceiptSequence: 1,
    initialOperationSequence: 1,
    assertExpectedChain: async (stage) => {
      await assertShadownet(collectorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: async () => {
      throw new Error("Macaroni current recovery forbids all V2 pinning");
    },
    validateCall: ({ contractAddress, entrypoint, payload }) => {
      assert.equal(contractAddress, MACARONI_CURRENT_RECOVERY_CONTRACT);
      assert.equal(entrypoint, "reveal");
      assert.equal(Number(payload), 1);
    },
    projectStorage: async () => {
      collectorProjection = await readMacaroniCurrentRecoveryProjection(
        collectorTezos,
        MACARONI_CURRENT_RECOVERY_CONTRACT,
        collector.address,
        collectorFallbackTezos,
      );
      return collectorProjection;
    },
    beforeOperationSubmit: async (operation: PastaUiLivePreparedOperation) => {
      assert.equal(operation.operationSequence, 2);
      assert.equal(operation.action, "call");
      assert.equal(operation.signerAddress, MACARONI_CURRENT_RECOVERY_COLLECTOR);
      assert.equal(operation.contractAddress, MACARONI_CURRENT_RECOVERY_CONTRACT);
      assert.deepEqual(operation.entrypoints, ["reveal"]);
      assert.equal(operation.descriptor.kind, "call");
      assert.equal(operation.descriptor.call.entrypoint, "reveal");
      assert.equal(Number(operation.descriptor.call.payload), 1);
      const boundary = await assertImmediatePreSignerBoundary(checkpoint);
      revealPreSubmitCounter = boundary.counters.collector;
      await checkpoint.append("PREPARED", {
        operationSequence: operation.operationSequence,
        action: operation.action,
        signerAddress: operation.signerAddress,
        contractAddress: operation.contractAddress,
        entrypoints: operation.entrypoints,
        descriptorSha256: canonicalSha256(operation.descriptor),
        collectorCounter: revealPreSubmitCounter,
      });
    },
    onOperationSubmitted: async (operation: PastaUiLiveSubmittedOperation) => {
      assert.ok(revealPreSubmitCounter != null, "reveal submitted without an authenticated pre-submit counter");
      assert.equal(operation.operationSequence, 2);
      assert.equal(validateOperation(operation.operationHash), ValidationResult.VALID);
      revealOperationHash = operation.operationHash;
      await checkpoint.append("SUBMITTED", {
        operationSequence: operation.operationSequence,
        operationHash: operation.operationHash,
        expectedCounter: revealPreSubmitCounter + 1,
      });
    },
    assertOperationApplied: async (operation) => {
      assert.equal(operation.action, "call");
      assert.equal(operation.operationHash, revealOperationHash);
      assert.equal(operation.contractAddress, MACARONI_CURRENT_RECOVERY_CONTRACT);
      assert.deepEqual(operation.entrypoints, ["reveal"]);
      assert.ok(revealPreSubmitCounter != null);
      revealApplied = await verifySubmittedReveal(operation.operationHash, revealPreSubmitCounter + 1);
      await checkpoint.append("APPLIED", {
        operationSequence: 2,
        operationHash: operation.operationHash,
        counter: revealPreSubmitCounter + 1,
        targetHistorySha256: canonicalSha256(revealApplied.history),
        indexedStorageSha256: canonicalSha256(revealApplied.indexedStorage),
      });
    },
  });
  recoverySession.authorizeAfterFundingPreflight({
    balanceMutez: collectorBalanceMutez,
    requiredBalanceMutez: requiredCollectorBalanceMutez,
    estimatedOriginationMutez: 0,
    operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
  });
  const extractedSiteRoot = path.join(preflight.appRoot, "artifacts", "self-hosted-site");
  const recoveryBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: extractedSiteRoot,
    handleAction: async (request) => {
      if (request.action === "originate" || request.action === "batch" ||
          request.action === "pin_json" || request.action === "pin_blob") {
        throw new Error(`Macaroni current recovery forbids ${request.action}`);
      }
      if (request.action === "call") {
        const payload = objectValue(request.payload, "recovery browser call payload");
        const call = objectValue(payload.call, "recovery browser call");
        assert.equal(call.contractAddress, MACARONI_CURRENT_RECOVERY_CONTRACT);
        assert.equal(call.entrypoint, "reveal");
      }
      return recoverySession.handle(request);
    },
  });

  const continuationScreenshots: CapturePastaProofStageResult[] = [];
  let walletLimitRejection = "";
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await routeRecoveredIpfsBytes(context, preflight.recoveredContent);
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  try {
    await page.goto(`${recoveryBridge.origin}/index.html`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(page, recoveryBridge, "UI-LIVE");
    await installMacaroniBrowserAdapters(page, ipfs.publicGatewayUrl);
    await page.evaluate(() => (window as any).refresh());
    await waitForText(page, "#supplyText", "1 / 2 minted");
    await page.waitForFunction(() => !(document.getElementById("btnConnect") as HTMLButtonElement).disabled);
    await page.click("#btnConnect");
    await waitForMacaroniCollectorConnectHandler({
      page,
      monitor,
      expectedAddress: collector.address,
    });
    assert.equal(await page.locator("#btnMint").isDisabled(), true);
    const operationCountBeforeDisabledClick = recoverySession.getReceipts()
      .filter((receipt) => receipt.operationHash).length;
    await page.evaluate(() => (document.getElementById("btnMint") as HTMLButtonElement).click());
    await page.waitForTimeout(250);
    assert.equal(
      recoverySession.getReceipts().filter((receipt) => receipt.operationHash).length,
      operationCountBeforeDisabledClick,
      "disabled recovered wallet-limit control must not submit",
    );
    continuationScreenshots.push(await captureRecoveredDropStage(
      page,
      monitor,
      runRoot,
      7,
      "mint blind edition and enforce policy",
      "Blind token minted and wallet limit enforced",
      "#mintPanel",
      [
        { selector: "#supplyText", name: "minted supply", expectedText: "1 / 2 minted" },
        { selector: "#walletLimitStatus", name: "wallet boundary", expectedText: "1/1" },
        { selector: '#revealGrid [data-token-id="0"]', name: "sealed token", expectedText: "unrevealed" },
      ],
    ));
    await checkpoint.append("SCREENSHOT_ACCEPTED", {
      stageOrdinal: 7,
      path: continuationScreenshots[0].pngRelativePath,
      sha256: continuationScreenshots[0].sidecar.sha256,
      evidenceSource: "authenticated current chain state plus verified recovered IPFS bytes",
    });
    walletLimitRejection = await simulateRejectedSecondMint(collectorTezos, checkpoint);
    await page.waitForSelector("#btnReveal", { state: "visible" });
    await page.click("#btnReveal");
    await waitForText(page, "#revealOpStatus", "revealed ✓");
    await page.waitForFunction(() => {
      const card = document.querySelector('#revealGrid [data-token-id="0"]');
      return Boolean(card && !card.classList.contains("sealed") &&
        card.textContent?.includes("Macaroni Revealed Proof"));
    });
    continuationScreenshots.push(await captureRecoveredDropStage(
      page,
      monitor,
      runRoot,
      8,
      "permissionless reveal",
      "Collector revealed exact final artwork",
      "#revealSection",
      [
        { selector: "#supplyText", name: "final supply", expectedText: "1 / 2 minted" },
        {
          selector: '#revealGrid [data-token-id="0"]',
          name: "final metadata",
          expectedText: "Macaroni Revealed Proof",
        },
      ],
    ));
    await checkpoint.append("SCREENSHOT_ACCEPTED", {
      stageOrdinal: 8,
      path: continuationScreenshots[1].pngRelativePath,
      sha256: continuationScreenshots[1].sidecar.sha256,
    });
  } finally {
    monitor.dispose();
    await context.close();
    await browser.close();
    await recoveryBridge.close();
  }
  assert.ok(revealPreSubmitCounter != null, "Macaroni recovery did not prepare reveal");
  assert.equal(validateOperation(revealOperationHash), ValidationResult.VALID);
  assert.ok(revealApplied, "Macaroni recovery did not verify reveal finality");
  assert.equal(
    recoverySession.getReceipts().filter((receipt) => receipt.operationHash).length,
    1,
    "Macaroni recovery must submit exactly one operation",
  );

  const [postPrimary, postFallback, postHistory, postIndexedStorage] = await Promise.all([
    readRpcSnapshot(SHADOWNET_RPC_PRIMARY, "post-reveal"),
    readRpcSnapshot(SHADOWNET_RPC_FALLBACK, "post-reveal"),
    readTargetHistory(),
    readIndexedStorage("post-reveal"),
  ]);
  assert.equal(postPrimary.storageSha256, postFallback.storageSha256, "post-reveal RPC storage disagreement");
  assert.equal(postPrimary.codeSha256, postFallback.codeSha256, "post-reveal RPC code disagreement");
  assertMacaroniRecoveryCounterBoundary(postPrimary.counters, postFallback.counters);
  assertMacaroniRecoveryTargetHistory(postHistory, {
    phase: "post-reveal",
    revealOperationHash,
    revealCounter: revealPreSubmitCounter + 1,
  });
  await checkpoint.append("POST_REVEAL_BOUNDARY_ACCEPTED", {
    operationHash: revealOperationHash,
    revealCounter: revealPreSubmitCounter + 1,
    storageSha256: postPrimary.storageSha256,
    targetHistorySha256: canonicalSha256(postHistory),
    indexedStorageSha256: canonicalSha256(postIndexedStorage),
  });

  await checkpoint.append("V1_LANE_STARTED", {
    firstV1Mutation: "fresh origination",
    expectedOperations: ["origination", "add_tokens", "set_stages", "mint"],
    recoveredV2MutationReplayPermitted: false,
  });
  const [v1CreatorBalanceValue, v1CollectorBalanceValue] = await Promise.all([
    creatorTezos.tz.getBalance(creator.address),
    collectorTezos.tz.getBalance(collector.address),
  ]);
  const v1CreatorBalanceMutez = safeInteger(v1CreatorBalanceValue.toString(), "V1 creator balance");
  const v1CollectorBalanceMutez = safeInteger(v1CollectorBalanceValue.toString(), "V1 collector balance");
  assert.ok(
    v1CreatorBalanceMutez >= requiredCreatorBalanceMutez,
    `creator balance ${v1CreatorBalanceMutez} fell below V1 requirement ${requiredCreatorBalanceMutez}`,
  );
  assert.ok(
    v1CollectorBalanceMutez >= requiredCollectorBalanceMutez,
    `collector balance ${v1CollectorBalanceMutez} fell below V1 requirement ${requiredCollectorBalanceMutez}`,
  );
  const v1Lane = await runMacaroniV1UiLane({
    appRoot: preflight.appRoot,
    runRoot,
    runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
    rpcUrl: SHADOWNET_RPC_PRIMARY,
    ipfs,
    creatorTezos,
    collectorTezos,
    creatorAddress: creator.address,
    collectorAddress: collector.address,
    creatorBalanceMutez: v1CreatorBalanceMutez,
    collectorBalanceMutez: v1CollectorBalanceMutez,
    requiredCreatorBalanceMutez,
    requiredCollectorBalanceMutez,
    estimatedOriginationMutez: estimatedV1OriginationMutez,
    code: preflight.v1ContractArtifact,
    observer: {
      onEvent: (event) => appendV1LaneCheckpointEvent(checkpoint, event),
    },
  });
  assert.equal(v1Lane.operations.length, 4);
  assert.equal(v1Lane.captures.length, 7);
  await checkpoint.append("V1_LANE_APPLIED", {
    contractAddress: v1Lane.contractAddress,
    operationHashes: v1Lane.operations.map((operation) => operation.hash),
    pinUris: v1Lane.writtenPins.map((pin) => pin.ipfsUri),
    screenshotOrdinals: v1Lane.captures.map((capture) => capture.sidecar.stageOrdinal),
  });
  const recoveredPins = await writeRecoveredPins(preflight.appRoot, preflight.recoveredContent, ipfs);
  await checkpoint.append("RECOVERED_PINS_MATERIALIZED", {
    repinned: false,
    artifacts: recoveredPins.artifacts.map((artifact) => ({
      id: artifact.id,
      path: artifact.path,
      sha256: artifact.sha256,
      ipfsUri: artifact.ipfsUri,
    })),
  });
  await checkpoint.append("CONTINUATION_APPLIED_AWAITING_PACKAGE", {
    v2ContractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
    v2RevealOperationHash: revealOperationHash,
    v1ContractAddress: v1Lane.contractAddress,
    v1OperationHashes: v1Lane.operations.map((operation) => operation.hash),
    expectedScreenshotCount: 15,
    terminal: false,
    completionMarker: "manifest.json",
  });

  const screenshots = [
    ...preflight.recoveredScreenshots,
    ...continuationScreenshots,
    ...v1Lane.captures,
  ];
  const completedAt = new Date().toISOString();
  const finalized = await finalizeRecoveredMacaroniProof({
    runRoot,
    appRoot: preflight.appRoot,
    ipfs,
    startedAt,
    completedAt,
    screenshots,
    v1Lane,
    v2WrittenPins: recoveredPins.artifacts,
    v2CollectorReceipts: recoverySession.getReceipts(),
    revealOperationHash,
    revealCounter: revealPreSubmitCounter + 1,
    walletLimitRejection,
    collectorFunding: recoverySession.getFundingAuthorization(),
    preflight,
    postRpc: { primary: postPrimary, fallback: postFallback },
    postHistory,
    postIndexedStorage,
  });
  return {
    status: "PASSED",
    classification: "UI-LIVE-RECOVERED-CHECKPOINTED",
    runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
    contractAddress: MACARONI_CURRENT_RECOVERY_CONTRACT,
    ...finalized,
  };
}

async function main(): Promise<void> {
  try {
    const result = await runMacaroniCurrentRecovery();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error instanceof ProofBlocked) {
      process.stderr.write(`BLOCKED: ${error.message}\n${error.lines.join("\n")}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
