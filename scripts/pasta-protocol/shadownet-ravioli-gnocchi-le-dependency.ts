#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { MichelsonMap, TezosToolkit } from "@taquito/taquito";
import {
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  decodePastaUiLiveValue,
  installPastaUiLiveBrowserProxy,
  PASTA_UI_LIVE_RECEIPT_SCHEMA,
  PastaUiLiveBridgeError,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveBridgeRequest,
  type PastaUiLiveFundingAuthorization,
  type PastaUiLivePinProof,
  type PastaUiLivePublicReceipt,
} from "./pasta-ui-live-bridge-kit";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  verifyScreenshotSidecar,
  type CapturePastaProofStageResult,
  type PastaProofPageMonitor,
  type RequiredDomEvidence,
} from "./pasta-proof-screenshot-kit";
import {
  assertShadownet,
  buildToolkit,
  deterministicJsonBytes,
  hexToUtf8,
  loadSignerSet,
  normalizeBase,
  pinIpfsProofBytes,
  pinIpfsProofJson,
  pollJson,
  probeRpcChainId,
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
import {
  validateAcceptedGnocchiProof,
  type AcceptedGnocchiProof,
} from "./shadownet-ravioli-dependency-recovery";

export const RAVIOLI_GNOCCHI_LE_EXECUTE_FLAG = "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_LE_EXECUTE";
export const RAVIOLI_GNOCCHI_LE_RECONCILE_FLAG = "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_LE_RECONCILE";
export const RAVIOLI_GNOCCHI_LE_OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
export const RAVIOLI_GNOCCHI_LE_SUPPLEMENT_DIRECTORY = "ravioli-le-dependency";
export const RAVIOLI_GNOCCHI_LE_RECEIPT_SCHEMA = "pastaprotocol-ravioli-gnocchi-le-dependency@1";
export const RAVIOLI_GNOCCHI_LE_INTENT_SCHEMA = "pastaprotocol-ravioli-gnocchi-le-dependency-intent@1";
export const RAVIOLI_GNOCCHI_LE_PROGRESS_SCHEMA = "pastaprotocol-ravioli-gnocchi-le-dependency-progress@1";
export const RAVIOLI_GNOCCHI_LE_INDEXER_EVIDENCE_SCHEMA = "pastaprotocol-ravioli-gnocchi-le-indexing@1";
export const RAVIOLI_GNOCCHI_LE_RUN_ID = "pasta-alpha-proof-20260718a";
export const RAVIOLI_GNOCCHI_LE_CONTRACT = "KT1NJJ55w4TLkRVfuweeRfvT9jvWFf4viaup";
export const RAVIOLI_GNOCCHI_LE_ADMINISTRATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
export const RAVIOLI_GNOCCHI_LE_TOKEN_ID = 3;
export const RAVIOLI_GNOCCHI_LE_MAX_SUPPLY = 3;
export const RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE = 0;
export const RAVIOLI_GNOCCHI_LE_PRICE_MUTEZ = 1;
export const RAVIOLI_GNOCCHI_LE_MINIMUM_FUTURE_MS = 48 * 60 * 60 * 1_000;
export const RAVIOLI_GNOCCHI_LE_WRAPPER_MARGIN_MS = 60 * 60 * 1_000;
export const RAVIOLI_GNOCCHI_LE_ACCEPTED_MANIFEST_SHA256 = "cc2e1b1867c3cd0bbd9d83eec5eca4a7c248e454567e92aaa565a8c244cb9cba";
export const RAVIOLI_GNOCCHI_LE_ACCEPTED_RECEIPT_SHA256 = "c3e78ab3af6269efdc0f71bd789c732629f8d82c07eddb4764c3d852f7f79faa";

const STATIC_ROOT = path.join(root, "public");
const APP_PATH = "/creation-tools/gnocchi/index.html";
const CAPABILITY = "publish Ravioli limited-edition dependency";
const OPERATION_RESERVE_MUTEZ = 1_000_000;
const MINIMUM_ACTION_BALANCE_MUTEZ = 100_000;
const FEE_HEADROOM_MUTEZ = 100;
const PLACEHOLDER_METADATA_URI = "ipfs://bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);

type JsonObject = Record<string, any>;

export type RavioliGnocchiLePolicy = {
  active: true;
  start: string;
  end: string;
  basePriceMutez: typeof RAVIOLI_GNOCCHI_LE_PRICE_MUTEZ;
  incrementMutez: 0;
  stepSize: 1;
  minPriceMutez: null;
  maxPriceMutez: null;
  maxSupply: typeof RAVIOLI_GNOCCHI_LE_MAX_SUPPLY;
  creatorReserve: typeof RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE;
  policyLocked: true;
  recommendedRavioliSaleEnd: string;
};

export type RavioliGnocchiLeArtifact = {
  id: string;
  kind: string;
  path: string;
  sha256: string;
  ipfsUri?: string;
  gatewayUrl?: string;
  retrievedSha256?: string;
};

export type RavioliGnocchiLeScreenshot = {
  stage: string;
  path: string;
  sha256: string;
  caption: string;
};

export type RavioliGnocchiLeOperation = {
  hash: string;
  status: "applied";
  level: number;
  counter: number;
  timestamp: string;
  sender: typeof RAVIOLI_GNOCCHI_LE_ADMINISTRATOR;
  target: typeof RAVIOLI_GNOCCHI_LE_CONTRACT;
  entrypoint: "create_open_edition";
  explorerUrl: string;
};

export type RavioliGnocchiLeAcceptedEvidence = AcceptedGnocchiProof & {
  manifestPath: "gnocchi/manifest.json";
  receiptPath: "gnocchi/artifacts/gnocchi-ui-live-run.json";
  manifestSha256: typeof RAVIOLI_GNOCCHI_LE_ACCEPTED_MANIFEST_SHA256;
  receiptSha256: typeof RAVIOLI_GNOCCHI_LE_ACCEPTED_RECEIPT_SHA256;
};

export type RavioliGnocchiLeLaneSnapshot = {
  rpcUrl: string;
  counter: number;
  balanceMutez: number;
  activeOperationCount: 0;
};

export type RavioliGnocchiLeState = {
  level: number;
  administrator: string;
  nextTokenId: number;
  metadataUri: string | null;
  artifactUri: string | null;
  active: boolean | null;
  start: string | null;
  end: string | null;
  maxSupply: number | null;
  creatorReserve: number;
  policyLocked: boolean | null;
  totalSupply: number;
  totalMinted: number;
  totalReserved: number;
};

export type RavioliGnocchiLeIndexingSummary = {
  lifecycle: "DEFINED_UNMINTED";
  tokenRecordPresentBeforeFirstMint: boolean;
  tokenRecordRequiredBeforeFirstMint: false;
  tokenRecordRequiredAfterRavioliOpen: true;
  evidencePath: "artifacts/gnocchi-le-tzkt-unminted-indexing.json";
  evidenceSha256: string;
};

export type RavioliGnocchiLeDependencyReceipt = {
  schema: typeof RAVIOLI_GNOCCHI_LE_RECEIPT_SCHEMA;
  classification: "UI-LIVE-SUPPLEMENT";
  status: "PASSED";
  completionMode: "direct" | "read-only-reconciliation";
  runId: typeof RAVIOLI_GNOCCHI_LE_RUN_ID;
  network: { name: "shadownet"; chainId: typeof SHADOWNET_CHAIN_ID; rpcUrl: string };
  startedAt: string;
  completedAt: string;
  acceptedGnocchi: RavioliGnocchiLeAcceptedEvidence;
  contract: {
    address: typeof RAVIOLI_GNOCCHI_LE_CONTRACT;
    administrator: typeof RAVIOLI_GNOCCHI_LE_ADMINISTRATOR;
    explorerUrl: string;
  };
  token: {
    tokenId: typeof RAVIOLI_GNOCCHI_LE_TOKEN_ID;
    metadataUri: string;
    artifactUri: string;
    maxSupply: typeof RAVIOLI_GNOCCHI_LE_MAX_SUPPLY;
    creatorReserve: typeof RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE;
    active: true;
    policyLocked: true;
    start: string;
    end: string;
    recommendedRavioliSaleEnd: string;
    explorerUrl: string;
  };
  policy: RavioliGnocchiLePolicy;
  operation: RavioliGnocchiLeOperation;
  before: RavioliGnocchiLeState;
  after: RavioliGnocchiLeState;
  indexing: RavioliGnocchiLeIndexingSummary;
  signerLanesBefore: RavioliGnocchiLeLaneSnapshot[];
  signerLanesAfter: RavioliGnocchiLeLaneSnapshot[];
  intentSha256: string;
  progressSha256: string | null;
  screenshots: RavioliGnocchiLeScreenshot[];
  artifacts: RavioliGnocchiLeArtifact[];
  links: { contract: string; token: string; operation: string; metadata: string; artifact: string };
};

export type LoadedRavioliGnocchiLeDependency = {
  receipt: RavioliGnocchiLeDependencyReceipt;
  receiptPath: string;
  receiptSha256: string;
};

type LoadedAcceptedEvidence = {
  accepted: RavioliGnocchiLeAcceptedEvidence;
  manifestPath: string;
  receiptPath: string;
};

type PinRecord = {
  value?: unknown;
  bytes?: Uint8Array;
  proof: PastaUiLivePinProof;
  artifact: RavioliGnocchiLeArtifact;
};

type ActorPage = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  monitor: PastaProofPageMonitor;
};

type ExactCreateCall = {
  contractAddress: typeof RAVIOLI_GNOCCHI_LE_CONTRACT;
  entrypoint: "create_open_edition";
  payload: {
    token_info: MichelsonMap<string, string>;
    sale: {
      active: true;
      start: string;
      end: string;
      base_price: number;
      increment: number;
      step_size: number;
      min_price: null;
      max_price: null;
      max_supply: number;
      treasury: string;
    };
    creator_reserve: number;
    lock_policy: boolean;
  };
};

type IntentCreateCall = {
  contractAddress: typeof RAVIOLI_GNOCCHI_LE_CONTRACT;
  entrypoint: "create_open_edition";
  payload: {
    metadataUri: string;
    sale: {
      active: true;
      start: string;
      end: string;
      basePriceMutez: number;
      incrementMutez: number;
      stepSize: number;
      minPriceMutez: null;
      maxPriceMutez: null;
      maxSupply: number;
      treasury: typeof RAVIOLI_GNOCCHI_LE_ADMINISTRATOR;
    };
    creatorReserve: 0;
    policyLocked: true;
  };
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeInteger(value: unknown, label: string): number {
  const converted = typeof value === "object" && value && "toNumber" in value &&
      typeof (value as { toNumber?: unknown }).toNumber === "function"
    ? (value as { toNumber(): number }).toNumber()
    : Number(value);
  assert.ok(Number.isSafeInteger(converted) && converted >= 0, `${label} must be a non-negative safe integer`);
  return converted;
}

function iso(value: unknown, label: string): string {
  const candidate = typeof value === "object" && value && "toISOString" in value &&
      typeof (value as { toISOString?: unknown }).toISOString === "function"
    ? (value as { toISOString(): string }).toISOString()
    : String(value || "");
  const time = Date.parse(candidate);
  assert.ok(Number.isFinite(time), `${label} must be a valid timestamp`);
  return new Date(time).toISOString();
}

function optionValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object" && "Some" in value) return (value as { Some: unknown }).Some;
  if (typeof value === "object" && (value as { prim?: unknown }).prim === "Some") {
    const args = (value as { args?: unknown }).args;
    if (Array.isArray(args) && args.length === 1) {
      const child = args[0] as { string?: unknown; int?: unknown };
      return child?.string ?? child?.int ?? child;
    }
  }
  return value;
}

async function mapGet(source: unknown, key: string): Promise<unknown> {
  if (!source || typeof source !== "object") return undefined;
  if (typeof (source as { get?: unknown }).get === "function") {
    return (source as { get(key: string): unknown | Promise<unknown> }).get(key);
  }
  return (source as Record<string, unknown>)[key];
}

function mapEntry(source: unknown, key: string): unknown {
  assert.ok(source instanceof MichelsonMap, "token_info must be a MichelsonMap");
  return source.get(key);
}

function requireIpfsUri(value: unknown, label: string): string {
  const uri = String(value || "");
  assert.match(uri, /^ipfs:\/\/baf[a-z0-9]+$/, `${label} must be a CIDv1 IPFS URI`);
  return uri;
}

function requirePresent<T>(value: T | null | undefined, label: string): T {
  assert.ok(value, label);
  return value;
}

export function recommendedRavioliSaleEnd(childEnd: string): string {
  const childEndMs = Date.parse(childEnd);
  assert.ok(Number.isFinite(childEndMs), "Gnocchi LE child end is invalid");
  return new Date(childEndMs - RAVIOLI_GNOCCHI_LE_WRAPPER_MARGIN_MS).toISOString();
}

export function deriveRavioliGnocchiLePolicy(nowMs = Date.now()): RavioliGnocchiLePolicy {
  assert.ok(Number.isFinite(nowMs), "Gnocchi LE policy clock is invalid");
  const minute = Math.floor(nowMs / 60_000) * 60_000;
  const start = new Date(minute - 5 * 60_000).toISOString();
  const end = new Date(minute + 7 * 24 * 60 * 60 * 1_000).toISOString();
  assert.ok(Date.parse(end) - nowMs >= RAVIOLI_GNOCCHI_LE_MINIMUM_FUTURE_MS);
  return {
    active: true,
    start,
    end,
    basePriceMutez: RAVIOLI_GNOCCHI_LE_PRICE_MUTEZ,
    incrementMutez: 0,
    stepSize: 1,
    minPriceMutez: null,
    maxPriceMutez: null,
    maxSupply: RAVIOLI_GNOCCHI_LE_MAX_SUPPLY,
    creatorReserve: RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE,
    policyLocked: true,
    recommendedRavioliSaleEnd: recommendedRavioliSaleEnd(end),
  };
}

function exactPolicy(policy: RavioliGnocchiLePolicy, referenceMs = Date.now()): void {
  assert.equal(policy.active, true);
  assert.equal(policy.basePriceMutez, RAVIOLI_GNOCCHI_LE_PRICE_MUTEZ);
  assert.equal(policy.incrementMutez, 0);
  assert.equal(policy.stepSize, 1);
  assert.equal(policy.minPriceMutez, null);
  assert.equal(policy.maxPriceMutez, null);
  assert.equal(policy.maxSupply, RAVIOLI_GNOCCHI_LE_MAX_SUPPLY);
  assert.equal(policy.creatorReserve, RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE);
  assert.equal(policy.policyLocked, true);
  assert.ok(Date.parse(policy.start) <= referenceMs, "Gnocchi LE must be open when Ravioli reserves it");
  assert.ok(
    Date.parse(policy.end) - referenceMs >= RAVIOLI_GNOCCHI_LE_MINIMUM_FUTURE_MS,
    "Gnocchi LE end must remain at least 48 hours in the future",
  );
  assert.equal(policy.recommendedRavioliSaleEnd, recommendedRavioliSaleEnd(policy.end));
  assert.ok(Date.parse(policy.recommendedRavioliSaleEnd) < Date.parse(policy.end));
}

export function buildRavioliGnocchiLeCreateCall(
  metadataUri: string,
  policy: RavioliGnocchiLePolicy,
): ExactCreateCall {
  requireIpfsUri(metadataUri, "Gnocchi LE metadata URI");
  exactPolicy(policy, Date.parse(policy.start) + 5 * 60_000);
  const tokenInfo = new MichelsonMap<string, string>();
  tokenInfo.set("", utf8ToHex(metadataUri));
  return {
    contractAddress: RAVIOLI_GNOCCHI_LE_CONTRACT,
    entrypoint: "create_open_edition",
    payload: {
      token_info: tokenInfo,
      sale: {
        active: true,
        start: policy.start,
        end: policy.end,
        base_price: policy.basePriceMutez,
        increment: policy.incrementMutez,
        step_size: policy.stepSize,
        min_price: null,
        max_price: null,
        max_supply: policy.maxSupply,
        treasury: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
      },
      creator_reserve: policy.creatorReserve,
      lock_policy: true,
    },
  };
}

export function buildRavioliGnocchiLeIntentCall(
  metadataUri: string,
  policy: RavioliGnocchiLePolicy,
): IntentCreateCall {
  requireIpfsUri(metadataUri, "Gnocchi LE intent metadata URI");
  return {
    contractAddress: RAVIOLI_GNOCCHI_LE_CONTRACT,
    entrypoint: "create_open_edition",
    payload: {
      metadataUri,
      sale: {
        active: true,
        start: policy.start,
        end: policy.end,
        basePriceMutez: policy.basePriceMutez,
        incrementMutez: policy.incrementMutez,
        stepSize: policy.stepSize,
        minPriceMutez: null,
        maxPriceMutez: null,
        maxSupply: policy.maxSupply,
        treasury: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
      },
      creatorReserve: 0,
      policyLocked: true,
    },
  };
}

export function validateRavioliGnocchiLeCreateCall(
  call: { contractAddress: string; entrypoint: string; payload: unknown },
  input: { metadataUri: string; policy: RavioliGnocchiLePolicy },
): void {
  assert.equal(call.contractAddress, RAVIOLI_GNOCCHI_LE_CONTRACT, "Gnocchi LE target drift");
  assert.equal(call.entrypoint, "create_open_edition", "Gnocchi LE entrypoint drift");
  assert.ok(call.payload && typeof call.payload === "object" && !Array.isArray(call.payload));
  const payload = call.payload as JsonObject;
  assert.equal(hexToUtf8(String(mapEntry(payload.token_info, "") || "")), input.metadataUri, "Gnocchi LE metadata URI drift");
  const expected = buildRavioliGnocchiLeCreateCall(input.metadataUri, input.policy).payload;
  const sale = payload.sale as JsonObject;
  assert.ok(sale && typeof sale === "object" && !Array.isArray(sale));
  assert.deepEqual({
    active: sale.active,
    start: iso(optionValue(sale.start), "Gnocchi LE start"),
    end: iso(optionValue(sale.end), "Gnocchi LE end"),
    base_price: safeInteger(sale.base_price, "Gnocchi LE base price"),
    increment: safeInteger(sale.increment, "Gnocchi LE increment"),
    step_size: safeInteger(sale.step_size, "Gnocchi LE step size"),
    min_price: optionValue(sale.min_price),
    max_price: optionValue(sale.max_price),
    max_supply: safeInteger(optionValue(sale.max_supply), "Gnocchi LE max supply"),
    treasury: String(sale.treasury || ""),
  }, expected.sale, "Gnocchi LE sale policy drift");
  assert.equal(
    safeInteger(payload.creator_reserve, "Gnocchi LE creator reserve"),
    RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE,
    "Gnocchi LE creator reserve must be zero",
  );
  assert.equal(payload.lock_policy, true, "Gnocchi LE policy must be locked");
}

export function assertRavioliGnocchiLeExecutionAllowed(environment: Record<string, string | undefined>): string {
  assert.equal(
    environment[RAVIOLI_GNOCCHI_LE_EXECUTE_FLAG],
    "1",
    `explicit ${RAVIOLI_GNOCCHI_LE_EXECUTE_FLAG}=1 is required`,
  );
  assert.ok(!environment[RAVIOLI_GNOCCHI_LE_RECONCILE_FLAG]?.trim(), "execution and reconciliation are mutually exclusive");
  assert.equal((environment.TEZOS_NETWORK || "shadownet").toLowerCase(), "shadownet", "Gnocchi LE supplement only permits Shadownet");
  const runRoot = environment[RAVIOLI_GNOCCHI_LE_OUTPUT_ENV]?.trim();
  assert.ok(runRoot, `${RAVIOLI_GNOCCHI_LE_OUTPUT_ENV} must identify the accepted proof run`);
  assert.equal(path.basename(path.resolve(runRoot)), RAVIOLI_GNOCCHI_LE_RUN_ID, "Gnocchi LE supplement requires the exact accepted proof run");
  for (const forbidden of [
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_LE_CONTRACT",
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_LE_ADMIN",
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_LE_TOKEN_ID",
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_LE_RESUME",
  ]) {
    assert.ok(!environment[forbidden]?.trim(), `Gnocchi LE supplement forbids override ${forbidden}`);
  }
  return path.resolve(runRoot);
}

export function assertRavioliGnocchiLeReconciliationAllowed(environment: Record<string, string | undefined>): string {
  assert.equal(
    environment[RAVIOLI_GNOCCHI_LE_RECONCILE_FLAG],
    "1",
    `explicit ${RAVIOLI_GNOCCHI_LE_RECONCILE_FLAG}=1 is required`,
  );
  assert.ok(!environment[RAVIOLI_GNOCCHI_LE_EXECUTE_FLAG]?.trim(), "read-only reconciliation forbids the execution flag");
  assert.equal((environment.TEZOS_NETWORK || "shadownet").toLowerCase(), "shadownet", "Gnocchi LE reconciliation only permits Shadownet");
  const runRoot = environment[RAVIOLI_GNOCCHI_LE_OUTPUT_ENV]?.trim();
  assert.ok(runRoot, `${RAVIOLI_GNOCCHI_LE_OUTPUT_ENV} must identify the accepted proof run`);
  assert.equal(path.basename(path.resolve(runRoot)), RAVIOLI_GNOCCHI_LE_RUN_ID, "Gnocchi LE reconciliation requires the exact accepted proof run");
  return path.resolve(runRoot);
}

async function readJsonFile(filePath: string): Promise<{ value: JsonObject; bytes: Uint8Array; digest: string }> {
  const bytes = await readFile(filePath);
  return { value: JSON.parse(bytes.toString("utf8")), bytes, digest: sha256(bytes) };
}

export async function loadRavioliGnocchiLeAcceptedEvidence(runRoot: string): Promise<LoadedAcceptedEvidence> {
  const manifestPath = path.join(path.resolve(runRoot), "gnocchi", "manifest.json");
  const receiptPath = path.join(path.resolve(runRoot), "gnocchi", "artifacts", "gnocchi-ui-live-run.json");
  const [manifest, receipt] = await Promise.all([readJsonFile(manifestPath), readJsonFile(receiptPath)]);
  assert.equal(manifest.digest, RAVIOLI_GNOCCHI_LE_ACCEPTED_MANIFEST_SHA256, "accepted Gnocchi manifest bytes drift");
  assert.equal(receipt.digest, RAVIOLI_GNOCCHI_LE_ACCEPTED_RECEIPT_SHA256, "accepted Gnocchi receipt bytes drift");
  const accepted = validateAcceptedGnocchiProof(manifest.value, receipt.value);
  assert.equal(accepted.contractAddress, RAVIOLI_GNOCCHI_LE_CONTRACT);
  assert.equal(accepted.administrator, RAVIOLI_GNOCCHI_LE_ADMINISTRATOR);
  return {
    accepted: {
      ...accepted,
      manifestPath: "gnocchi/manifest.json",
      receiptPath: "gnocchi/artifacts/gnocchi-ui-live-run.json",
      manifestSha256: RAVIOLI_GNOCCHI_LE_ACCEPTED_MANIFEST_SHA256,
      receiptSha256: RAVIOLI_GNOCCHI_LE_ACCEPTED_RECEIPT_SHA256,
    },
    manifestPath,
    receiptPath,
  };
}

async function rehashAcceptedEvidence(evidence: LoadedAcceptedEvidence): Promise<void> {
  const [manifest, receipt] = await Promise.all([readFile(evidence.manifestPath), readFile(evidence.receiptPath)]);
  assert.equal(sha256(manifest), evidence.accepted.manifestSha256, "accepted Gnocchi manifest mutated during supplement");
  assert.equal(sha256(receipt), evidence.accepted.receiptSha256, "accepted Gnocchi receipt mutated during supplement");
}

async function requireFreshSupplementDirectory(runRoot: string): Promise<string> {
  const supplementRoot = path.join(path.resolve(runRoot), RAVIOLI_GNOCCHI_LE_SUPPLEMENT_DIRECTORY);
  try {
    await stat(supplementRoot);
    assert.fail(`Gnocchi LE supplement directory already exists: ${supplementRoot}; reconcile or quarantine it, never replay it`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return supplementRoot;
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  assert.ok(response.ok, `${url} returned HTTP ${response.status}`);
  return response.json();
}

function activeMempoolOperations(mempool: JsonObject, signer: string): JsonObject[] {
  return ["applied", "validated", "branch_delayed", "unprocessed"]
    .flatMap((bucket) => Array.isArray(mempool?.[bucket]) ? mempool[bucket] : [])
    .map((entry: JsonObject | [string, JsonObject]) => Array.isArray(entry) ? entry[1] : entry)
    .filter((operation: JsonObject) => operation?.contents?.some((content: JsonObject) => content?.source === signer));
}

export async function readRavioliGnocchiLeSignerLane(
  rpcUrl: string,
  expectedCounter?: number,
): Promise<RavioliGnocchiLeLaneSnapshot> {
  const base = normalizeBase(rpcUrl);
  const [chainResponse, counterResponse, balanceResponse, mempool] = await Promise.all([
    fetch(`${base}/chains/main/chain_id`, { signal: AbortSignal.timeout(30_000) }),
    fetch(`${base}/chains/main/blocks/head/context/contracts/${RAVIOLI_GNOCCHI_LE_ADMINISTRATOR}/counter`, { signal: AbortSignal.timeout(30_000) }),
    fetch(`${base}/chains/main/blocks/head/context/contracts/${RAVIOLI_GNOCCHI_LE_ADMINISTRATOR}/balance`, { signal: AbortSignal.timeout(30_000) }),
    fetchJson(`${base}/chains/main/mempool/pending_operations`),
  ]);
  assert.ok(chainResponse.ok && counterResponse.ok && balanceResponse.ok, `${rpcUrl} signer-lane reads failed`);
  assert.equal(JSON.parse(await chainResponse.text()), SHADOWNET_CHAIN_ID, `${rpcUrl} is not Shadownet`);
  const counter = safeInteger(JSON.parse(await counterResponse.text()), `${rpcUrl} creator counter`);
  if (expectedCounter !== undefined) assert.equal(counter, expectedCounter, `${rpcUrl} creator counter drift`);
  const balanceMutez = safeInteger(JSON.parse(await balanceResponse.text()), `${rpcUrl} creator balance`);
  const active = activeMempoolOperations(mempool, RAVIOLI_GNOCCHI_LE_ADMINISTRATOR);
  assert.equal(active.length, 0, `${rpcUrl} has an active creator operation in its mempool`);
  return { rpcUrl: base, counter, balanceMutez, activeOperationCount: 0 };
}

async function readDualSignerLanes(expectedCounter?: number): Promise<RavioliGnocchiLeLaneSnapshot[]> {
  const lanes = await Promise.all([
    readRavioliGnocchiLeSignerLane(SHADOWNET_RPC_PRIMARY, expectedCounter),
    readRavioliGnocchiLeSignerLane(SHADOWNET_RPC_FALLBACK, expectedCounter),
  ]);
  assert.equal(lanes[0].counter, lanes[1].counter, "Shadownet RPC creator counters disagree");
  return lanes;
}

function metadataUriFromTokenMetadata(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const tokenInfo = (value as JsonObject).token_info;
  let encoded: unknown;
  if (tokenInfo instanceof MichelsonMap) encoded = tokenInfo.get("");
  else if (tokenInfo && typeof tokenInfo === "object") encoded = (tokenInfo as JsonObject)[""];
  return typeof encoded === "string" ? hexToUtf8(encoded) : null;
}

function artifactUriFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  return typeof (metadata as JsonObject).artifactUri === "string" ? (metadata as JsonObject).artifactUri : null;
}

export async function projectRavioliGnocchiLeStorage(storage: unknown): Promise<Record<string, unknown>> {
  assert.ok(storage && typeof storage === "object" && !Array.isArray(storage));
  const source = storage as JsonObject;
  const nextTokenId = safeInteger(source.next_token_id, "projected Gnocchi next token id");
  assert.ok(nextTokenId === RAVIOLI_GNOCCHI_LE_TOKEN_ID || nextTokenId === RAVIOLI_GNOCCHI_LE_TOKEN_ID + 1);
  for (const name of ["sales", "total_supply", "total_minted", "policy_locked", "token_metadata"] as const) {
    assert.ok(source[name] && typeof source[name] === "object", `projected Gnocchi storage is missing ${name}`);
  }
  const sales = new MichelsonMap<string, unknown>();
  const totalSupply = new MichelsonMap<string, unknown>();
  const totalMinted = new MichelsonMap<string, unknown>();
  const policyLocked = new MichelsonMap<string, unknown>();
  const tokenMetadata = new MichelsonMap<string, unknown>();
  for (let tokenId = 0; tokenId < nextTokenId; tokenId += 1) {
    const key = String(tokenId);
    const [saleValue, supplyValue, mintedValue, lockedValue] = await Promise.all([
      mapGet(source.sales, key),
      mapGet(source.total_supply, key),
      mapGet(source.total_minted, key),
      mapGet(source.policy_locked, key),
    ]);
    if (saleValue !== undefined) {
      assert.ok(saleValue && typeof saleValue === "object" && !Array.isArray(saleValue), `Gnocchi sale ${key} is invalid`);
      const sale = saleValue as JsonObject;
      const optionalInteger = (value: unknown, label: string): number | null => {
        const unwrapped = optionValue(value);
        return unwrapped == null ? null : safeInteger(unwrapped, label);
      };
      const optionalTimestamp = (value: unknown, label: string): string | null => {
        const unwrapped = optionValue(value);
        return unwrapped == null ? null : iso(unwrapped, label);
      };
      sales.set(key, {
        active: sale.active === true,
        start: optionalTimestamp(sale.start, `Gnocchi sale ${key} start`),
        end: optionalTimestamp(sale.end, `Gnocchi sale ${key} end`),
        base_price: safeInteger(sale.base_price, `Gnocchi sale ${key} base price`),
        increment: safeInteger(sale.increment, `Gnocchi sale ${key} increment`),
        step_size: safeInteger(sale.step_size, `Gnocchi sale ${key} step size`),
        min_price: optionalInteger(sale.min_price, `Gnocchi sale ${key} minimum price`),
        max_price: optionalInteger(sale.max_price, `Gnocchi sale ${key} maximum price`),
        max_supply: optionalInteger(sale.max_supply, `Gnocchi sale ${key} maximum supply`),
        treasury: String(sale.treasury || ""),
      });
    }
    if (supplyValue !== undefined) totalSupply.set(key, safeInteger(supplyValue, `Gnocchi sale ${key} total supply`));
    if (mintedValue !== undefined) totalMinted.set(key, safeInteger(mintedValue, `Gnocchi sale ${key} total minted`));
    if (lockedValue !== undefined) {
      assert.equal(typeof lockedValue, "boolean", `Gnocchi sale ${key} policy lock must be boolean`);
      policyLocked.set(key, lockedValue);
    }
  }
  return {
    administrator: String(source.administrator || ""),
    next_token_id: nextTokenId,
    sales,
    total_supply: totalSupply,
    total_minted: totalMinted,
    policy_locked: policyLocked,
    // The Studio checks this map's presence but does not read metadata values in
    // the existing-collection, confirmation, or edition-list paths. Keep the
    // bridge projection least-privilege instead of serializing nested token_info.
    token_metadata: tokenMetadata,
  };
}

export async function readRavioliGnocchiLeState(
  tezos: TezosToolkit,
  expectedMetadata?: { uri: string; value: unknown },
): Promise<RavioliGnocchiLeState> {
  const [head, contractIndex, contract] = await Promise.all([
    fetchJson(`${normalizeBase(SHADOWNET_TZKT_API)}/head`),
    fetchJson(`${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${RAVIOLI_GNOCCHI_LE_CONTRACT}`),
    tezos.contract.at(RAVIOLI_GNOCCHI_LE_CONTRACT),
  ]);
  assert.equal(contractIndex?.kind, "asset", "accepted Gnocchi contract is not indexed as an asset");
  assert.ok(Array.isArray(contractIndex?.tzips) && contractIndex.tzips.map((entry: unknown) => String(entry).toLowerCase()).includes("fa2"));
  const storage = await contract.storage() as JsonObject;
  assert.equal(String(storage.administrator || ""), RAVIOLI_GNOCCHI_LE_ADMINISTRATOR, "Gnocchi administrator drift");
  for (const method of ["create_open_edition", "lock_sale_policy", "open_mint"] as const) {
    assert.equal(typeof contract.methodsObject[method], "function", `accepted Gnocchi contract lacks ${method}`);
  }
  const key = String(RAVIOLI_GNOCCHI_LE_TOKEN_ID);
  const [saleRaw, tokenMetadata, supplyRaw, mintedRaw, reservedRaw, lockedRaw] = await Promise.all([
    mapGet(storage.sales, key),
    mapGet(storage.token_metadata, key),
    mapGet(storage.total_supply, key),
    mapGet(storage.total_minted, key),
    mapGet(storage.total_reserved, key),
    mapGet(storage.policy_locked, key),
  ]);
  const sale = saleRaw && typeof saleRaw === "object" ? saleRaw as JsonObject : null;
  const metadataUri = metadataUriFromTokenMetadata(tokenMetadata);
  let artifactUri: string | null = null;
  if (metadataUri && expectedMetadata?.uri === metadataUri) artifactUri = artifactUriFromMetadata(expectedMetadata.value);
  return {
    level: safeInteger(head?.level, "TzKT head level"),
    administrator: String(storage.administrator || ""),
    nextTokenId: safeInteger(storage.next_token_id, "Gnocchi next token id"),
    metadataUri,
    artifactUri,
    active: sale ? sale.active === true : null,
    start: sale && optionValue(sale.start) != null ? iso(optionValue(sale.start), "Gnocchi token 3 start") : null,
    end: sale && optionValue(sale.end) != null ? iso(optionValue(sale.end), "Gnocchi token 3 end") : null,
    maxSupply: sale && optionValue(sale.max_supply) != null ? safeInteger(optionValue(sale.max_supply), "Gnocchi token 3 max supply") : null,
    creatorReserve: 0,
    policyLocked: lockedRaw == null ? null : lockedRaw === true,
    totalSupply: supplyRaw == null ? 0 : safeInteger(supplyRaw, "Gnocchi token 3 supply"),
    totalMinted: mintedRaw == null ? 0 : safeInteger(mintedRaw, "Gnocchi token 3 minted"),
    totalReserved: reservedRaw == null ? 0 : safeInteger(reservedRaw, "Gnocchi token 3 reserved"),
  };
}

export function assertRavioliGnocchiLeState(
  state: RavioliGnocchiLeState,
  phase: "before" | "after",
  input?: { metadataUri: string; artifactUri: string; policy: RavioliGnocchiLePolicy },
): void {
  assert.ok(Number.isSafeInteger(state.level) && state.level > 0, `${phase} Gnocchi LE level is invalid`);
  assert.equal(state.administrator, RAVIOLI_GNOCCHI_LE_ADMINISTRATOR);
  assert.equal(state.creatorReserve, RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE);
  assert.equal(state.totalReserved, 0, `${phase} Gnocchi LE reserved supply must be zero`);
  if (phase === "before") {
    assert.equal(state.nextTokenId, RAVIOLI_GNOCCHI_LE_TOKEN_ID, "Gnocchi next token id must be exactly 3 before publish");
    assert.equal(state.metadataUri, null, "Gnocchi token 3 already has metadata");
    assert.equal(state.active, null, "Gnocchi token 3 already has a sale");
    assert.equal(state.policyLocked, null, "Gnocchi token 3 already has a policy");
    assert.equal(state.totalSupply, 0);
    assert.equal(state.totalMinted, 0);
    return;
  }
  assert.ok(input, "after-state validation requires expected token evidence");
  assert.equal(state.nextTokenId, RAVIOLI_GNOCCHI_LE_TOKEN_ID + 1);
  assert.equal(state.metadataUri, input.metadataUri);
  assert.equal(state.artifactUri, input.artifactUri);
  assert.equal(state.active, true);
  assert.equal(state.start, input.policy.start);
  assert.equal(state.end, input.policy.end);
  assert.equal(state.maxSupply, RAVIOLI_GNOCCHI_LE_MAX_SUPPLY);
  assert.equal(state.policyLocked, true);
  assert.equal(state.totalSupply, 0);
  assert.equal(state.totalMinted, 0);
}

function operationRows(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.filter((entry): entry is JsonObject => Boolean(entry && typeof entry === "object"));
  return value && typeof value === "object" ? [value as JsonObject] : [];
}

function tzktTokenInfoUri(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const encoded = (value as JsonObject)?.token_info?.[""];
  return typeof encoded === "string" ? hexToUtf8(encoded) : "";
}

export function validateRavioliGnocchiLeOperationRows(
  rows: unknown,
  input: {
    policy: RavioliGnocchiLePolicy;
    metadataUri: string;
    beforeLevel: number;
    beforeCounter: number;
    operationHash?: string;
  },
): RavioliGnocchiLeOperation {
  const candidates = operationRows(rows).filter((row) =>
    row?.status === "applied" &&
    row?.sender?.address === RAVIOLI_GNOCCHI_LE_ADMINISTRATOR &&
    row?.target?.address === RAVIOLI_GNOCCHI_LE_CONTRACT &&
    row?.parameter?.entrypoint === "create_open_edition" &&
    safeInteger(row?.level, "Gnocchi LE operation level") >= input.beforeLevel &&
    (!input.operationHash || row?.hash === input.operationHash)
  );
  assert.equal(candidates.length, 1, "TzKT must expose exactly one matching applied Gnocchi LE operation");
  const row = candidates[0];
  assert.equal(validateOperation(String(row.hash || "")), ValidationResult.VALID, "Gnocchi LE operation hash is invalid");
  assert.equal(safeInteger(row.counter, "Gnocchi LE operation counter"), input.beforeCounter + 1, "Gnocchi LE operation counter drift");
  assert.equal(safeInteger(row.amount, "Gnocchi LE operation amount"), 0, "Gnocchi LE operation transferred tez");
  const payload = row.parameter.value as JsonObject;
  assert.equal(tzktTokenInfoUri(payload), input.metadataUri, "TzKT Gnocchi LE metadata URI drift");
  const sale = payload?.sale as JsonObject;
  assert.equal(sale?.active, true);
  assert.equal(iso(optionValue(sale?.start), "TzKT Gnocchi LE start"), input.policy.start);
  assert.equal(iso(optionValue(sale?.end), "TzKT Gnocchi LE end"), input.policy.end);
  assert.equal(safeInteger(sale?.base_price, "TzKT Gnocchi LE price"), RAVIOLI_GNOCCHI_LE_PRICE_MUTEZ);
  assert.equal(safeInteger(sale?.increment, "TzKT Gnocchi LE increment"), 0);
  assert.equal(safeInteger(sale?.step_size, "TzKT Gnocchi LE step size"), 1);
  assert.equal(optionValue(sale?.min_price), null);
  assert.equal(optionValue(sale?.max_price), null);
  assert.equal(safeInteger(optionValue(sale?.max_supply), "TzKT Gnocchi LE max supply"), RAVIOLI_GNOCCHI_LE_MAX_SUPPLY);
  assert.equal(sale?.treasury, RAVIOLI_GNOCCHI_LE_ADMINISTRATOR);
  assert.equal(
    safeInteger(payload?.creator_reserve, "TzKT Gnocchi LE creator reserve"),
    0,
    "TzKT Gnocchi LE creator reserve must be zero",
  );
  assert.equal(payload?.lock_policy, true);
  const timestamp = iso(row.timestamp, "Gnocchi LE operation timestamp");
  return {
    hash: row.hash,
    status: "applied",
    level: safeInteger(row.level, "Gnocchi LE operation level"),
    counter: safeInteger(row.counter, "Gnocchi LE operation counter"),
    timestamp,
    sender: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
    target: RAVIOLI_GNOCCHI_LE_CONTRACT,
    entrypoint: "create_open_edition",
    explorerUrl: `https://shadownet.tzkt.io/${row.hash}`,
  };
}

async function readIndexedOperationByHash(
  operationHash: string,
  input: Parameters<typeof validateRavioliGnocchiLeOperationRows>[1],
): Promise<RavioliGnocchiLeOperation> {
  const rows = await pollJson(
    "Ravioli Gnocchi LE applied operation",
    `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions/${encodeURIComponent(operationHash)}`,
    (value) => operationRows(value).some((row) => row?.status === "applied"),
  );
  return validateRavioliGnocchiLeOperationRows(rows, { ...input, operationHash });
}

async function readReconciliationOperationRows(beforeLevel: number): Promise<JsonObject[]> {
  const url = `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions` +
    `?sender=${encodeURIComponent(RAVIOLI_GNOCCHI_LE_ADMINISTRATOR)}` +
    `&target=${encodeURIComponent(RAVIOLI_GNOCCHI_LE_CONTRACT)}` +
    `&entrypoint=create_open_edition&status=applied&level.ge=${beforeLevel}&limit=100`;
  const rows = await fetchJson(url);
  assert.ok(Array.isArray(rows), "TzKT Gnocchi LE reconciliation response must be an array");
  return rows;
}

export function validateRavioliGnocchiLeUnmintedIndexerRecords(
  records: unknown,
  metadataUri: string,
): { tokenRecordPresent: boolean; recordCount: number } {
  assert.ok(Array.isArray(records), "TzKT Gnocchi LE token response must be an array");
  const matches = records.filter((token: JsonObject) =>
    token?.contract?.address === RAVIOLI_GNOCCHI_LE_CONTRACT &&
    safeInteger(token?.tokenId, "indexed Gnocchi LE token id") === RAVIOLI_GNOCCHI_LE_TOKEN_ID,
  );
  assert.ok(matches.length <= 1, "TzKT returned duplicate Gnocchi LE token records");
  if (matches.length === 1) {
    const token = matches[0];
    assert.equal(safeInteger(token?.totalSupply, "indexed unminted Gnocchi LE supply"), 0);
    if (token?.metadata?.uri) assert.equal(token.metadata.uri, metadataUri, "indexed Gnocchi LE metadata URI drift");
  }
  return { tokenRecordPresent: matches.length === 1, recordCount: records.length };
}

function validateRavioliGnocchiLeIndexerEvidence(
  evidence: JsonObject,
  metadataUri: string,
  after: RavioliGnocchiLeState,
): { tokenRecordPresent: boolean } {
  assert.equal(evidence.schema, RAVIOLI_GNOCCHI_LE_INDEXER_EVIDENCE_SCHEMA);
  assert.equal(evidence.lifecycle, "DEFINED_UNMINTED");
  assert.equal(evidence.contract, RAVIOLI_GNOCCHI_LE_CONTRACT);
  assert.equal(evidence.tokenId, RAVIOLI_GNOCCHI_LE_TOKEN_ID);
  assert.equal(evidence.metadataUri, metadataUri);
  assert.equal(evidence.totalSupply, 0);
  assert.equal(evidence.totalMinted, 0);
  assert.equal(after.totalSupply, 0, "Gnocchi LE definition unexpectedly has circulating supply before Ravioli");
  assert.equal(after.totalMinted, 0, "Gnocchi LE definition unexpectedly has lifetime mints before Ravioli");
  assert.ok(Number.isFinite(Date.parse(evidence.observedAt)), "Gnocchi LE indexer observation timestamp is invalid");
  const expectedQuery = `${normalizeBase(SHADOWNET_TZKT_API)}/tokens?contract=${encodeURIComponent(RAVIOLI_GNOCCHI_LE_CONTRACT)}&tokenId=${RAVIOLI_GNOCCHI_LE_TOKEN_ID}&limit=10`;
  assert.equal(evidence.queryUrl, expectedQuery);
  const result = validateRavioliGnocchiLeUnmintedIndexerRecords(evidence.tokenRecords, metadataUri);
  assert.equal(evidence.tokenRecordPresent, result.tokenRecordPresent);
  assert.equal(evidence.tokenRecordRequiredBeforeFirstMint, false);
  assert.equal(evidence.tokenRecordRequiredAfterRavioliOpen, true);
  return { tokenRecordPresent: result.tokenRecordPresent };
}

async function loadOrCreateRavioliGnocchiLeIndexerEvidence(
  supplementRoot: string,
  metadataUri: string,
  after: RavioliGnocchiLeState,
): Promise<{ summary: RavioliGnocchiLeIndexingSummary; artifact: RavioliGnocchiLeArtifact }> {
  const relativePath = "artifacts/gnocchi-le-tzkt-unminted-indexing.json" as const;
  const filePath = path.join(supplementRoot, relativePath);
  let file: Awaited<ReturnType<typeof readJsonFile>>;
  try {
    file = await readJsonFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const queryUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/tokens?contract=${encodeURIComponent(RAVIOLI_GNOCCHI_LE_CONTRACT)}&tokenId=${RAVIOLI_GNOCCHI_LE_TOKEN_ID}&limit=10`;
    const tokenRecords = await fetchJson(queryUrl);
    const result = validateRavioliGnocchiLeUnmintedIndexerRecords(tokenRecords, metadataUri);
    const evidence = {
      schema: RAVIOLI_GNOCCHI_LE_INDEXER_EVIDENCE_SCHEMA,
      lifecycle: "DEFINED_UNMINTED",
      contract: RAVIOLI_GNOCCHI_LE_CONTRACT,
      tokenId: RAVIOLI_GNOCCHI_LE_TOKEN_ID,
      metadataUri,
      totalSupply: 0,
      totalMinted: 0,
      observedAt: new Date().toISOString(),
      queryUrl,
      tokenRecordPresent: result.tokenRecordPresent,
      tokenRecordRequiredBeforeFirstMint: false,
      tokenRecordRequiredAfterRavioliOpen: true,
      tokenRecords,
      explanation: "This capped allocation is defined on-chain but has zero supply. Ravioli must prove the TzKT token row after its first atomic allocation mint, not before it exists.",
    };
    await writeJsonExclusive(filePath, evidence);
    file = await readJsonFile(filePath);
  }
  const result = validateRavioliGnocchiLeIndexerEvidence(file.value, metadataUri, after);
  return {
    summary: {
      lifecycle: "DEFINED_UNMINTED",
      tokenRecordPresentBeforeFirstMint: result.tokenRecordPresent,
      tokenRecordRequiredBeforeFirstMint: false,
      tokenRecordRequiredAfterRavioliOpen: true,
      evidencePath: relativePath,
      evidenceSha256: file.digest,
    },
    artifact: {
      id: "gnocchi-le-unminted-indexing",
      kind: "indexer-lifecycle",
      path: relativePath,
      sha256: file.digest,
    },
  };
}

async function persistPin(
  supplementRoot: string,
  pin: Omit<PinRecord, "artifact">,
): Promise<PinRecord> {
  const isMedia = Boolean(pin.bytes);
  const id = isMedia ? "gnocchi-le-token-3-media" : "gnocchi-le-token-3-metadata";
  const kind = isMedia ? "token-media" : "token-metadata";
  const relativePath = isMedia ? "artifacts/token-3-media.png" : "artifacts/token-3-metadata.json";
  const bytes = pin.bytes ? Uint8Array.from(pin.bytes) : deterministicJsonBytes(pin.value);
  assert.equal(sha256(bytes), pin.proof.sha256, `${id} bytes differ from the public pin proof`);
  await writeFile(path.join(supplementRoot, relativePath), bytes, { flag: "wx" });
  return {
    ...pin,
    artifact: {
      id,
      kind,
      path: relativePath,
      sha256: pin.proof.sha256,
      ipfsUri: pin.proof.uri,
      gatewayUrl: pin.proof.publicGatewayUrl,
      retrievedSha256: pin.proof.sha256,
    },
  };
}

function fundingAuthorization(balanceMutez: number, requiredBalanceMutez: number): PastaUiLiveFundingAuthorization {
  return {
    balanceMutez,
    requiredBalanceMutez,
    estimatedOriginationMutez: 0,
    operationReserveMutez: OPERATION_RESERVE_MUTEZ,
  };
}

async function openActorPage(
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>,
): Promise<ActorPage> {
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  await page.goto(`${bridge.origin}${APP_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
  await installPastaUiLiveBrowserProxy(page, bridge, "UI-LIVE");
  return { browser, context, page, monitor };
}

async function closeActorPage(actor: ActorPage | null): Promise<void> {
  if (!actor) return;
  actor.monitor.dispose();
  await actor.browser.close();
}

async function waitForText(page: Page, selector: string, expected: string, timeout = 300_000): Promise<void> {
  await page.locator(selector).waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    ({ selected, text }) => document.querySelector(selected)?.textContent?.includes(text),
    { selected: selector, text: expected },
    { timeout },
  );
}

async function captureStage(input: {
  actor: ActorPage;
  runRoot: string;
  ordinal: number;
  stageName: string;
  focusSelector: string;
  evidence: RequiredDomEvidence[];
}): Promise<CapturePastaProofStageResult> {
  await input.actor.page.locator(input.focusSelector).first().scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page: input.actor.page,
    monitor: input.actor.monitor,
    outputRoot: input.runRoot,
    app: RAVIOLI_GNOCCHI_LE_SUPPLEMENT_DIRECTORY,
    capability: CAPABILITY,
    stageOrdinal: input.ordinal,
    stageName: input.stageName,
    classification: "UI-LIVE",
    requiredEvidence: input.evidence,
    waitForLoadState: "none",
    timeoutMs: 60_000,
  });
}

async function configureStudio(
  page: Page,
  ipfs: IpfsProofConfig,
  policy: RavioliGnocchiLePolicy,
): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", ipfs.apiUrl);
  await page.fill("#oeName", "Ravioli UI-LIVE Future Limited Edition");
  await page.fill("#oeDesc", "A future-expiring, capped, policy-locked Gnocchi allocation dependency published for Ravioli's LE wrapper proof.");
  await page.fill("#oeTags", "gnocchi, ravioli, limited-edition, shadownet, ui-live");
  await page.fill("#oeSymbol", "RVLE");
  await page.fill("#basePrice", String(RAVIOLI_GNOCCHI_LE_PRICE_MUTEZ / 1_000_000));
  await page.fill("#increment", "0");
  await page.fill("#stepSize", "1");
  await page.fill("#minPrice", "");
  await page.fill("#maxPrice", "");
  await page.selectOption("#saleMode", "limited");
  await page.fill("#saleStart", policy.start.slice(0, 16));
  await page.fill("#saleEnd", policy.end.slice(0, 16));
  await page.fill("#saleMaxSupply", String(RAVIOLI_GNOCCHI_LE_MAX_SUPPLY));
  await page.fill("#creatorReserve", "0");
  await page.check("#lockPolicy");
  await page.setInputFiles("#oeArtifact", {
    name: "ravioli-gnocchi-le-token-3.png",
    mimeType: "image/png",
    buffer: Buffer.concat([PNG_BYTES, Buffer.from("ravioli-gnocchi-le-token-3")]),
  });
}

async function connectStudio(page: Page): Promise<void> {
  await page.click("#btnConnect");
  await waitForText(page, "#log", `connected ${RAVIOLI_GNOCCHI_LE_ADMINISTRATOR} on shadownet`);
}

export function assertRavioliGnocchiLeCollectionVerification(
  statusText: string | null | undefined,
  noticeText: string | null | undefined,
): void {
  const expected = `next edition will be token #${RAVIOLI_GNOCCHI_LE_TOKEN_ID}`;
  const status = String(statusText || "").trim();
  const notice = String(noticeText || "").trim();
  if (status.includes(expected)) return;
  throw new Error(
    `Gnocchi existing-collection verification did not accept token #${RAVIOLI_GNOCCHI_LE_TOKEN_ID}; ` +
    `status=${JSON.stringify(status)} notice=${JSON.stringify(notice || "no visible notice")}`,
  );
}

async function verifyExistingCollection(page: Page): Promise<void> {
  await page.selectOption("#publishTarget", "existing");
  await page.fill("#existingCollectionKt", RAVIOLI_GNOCCHI_LE_CONTRACT);
  await page.click("#btnVerifyCollection");
  const expected = `next edition will be token #${RAVIOLI_GNOCCHI_LE_TOKEN_ID}`;
  try {
    await page.waitForFunction(
      ({ expectedText }) => {
        const status = document.querySelector("#publishTargetStatus")?.textContent || "";
        const notice = document.querySelector("#ppNotice")?.textContent || "";
        return status.includes(expectedText) || notice.includes("Collection verification failed:");
      },
      { expectedText: expected },
      { timeout: 60_000 },
    );
  } catch (error) {
    const status = await page.locator("#publishTargetStatus").textContent().catch(() => "");
    const notice = await page.locator("#ppNotice").textContent().catch(() => "");
    throw new Error(
      `Timed out waiting for Gnocchi existing-collection verification; ` +
      `status=${JSON.stringify(String(status || "").trim())} ` +
      `notice=${JSON.stringify(String(notice || "").trim() || "no visible notice")}`,
      { cause: error },
    );
  }
  const status = await page.locator("#publishTargetStatus").textContent();
  const notice = await page.locator("#ppNotice").textContent().catch(() => "");
  assertRavioliGnocchiLeCollectionVerification(status, notice);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function writeJsonExclusive(filePath: string, value: unknown): Promise<{ path: string; sha256: string }> {
  const bytes = deterministicJsonBytes(value);
  await writeFile(filePath, bytes, { flag: "wx" });
  return { path: filePath, sha256: sha256(bytes) };
}

function normalizeEstimate(estimate: JsonObject): JsonObject {
  return {
    gasLimit: safeInteger(estimate.gasLimit, "Gnocchi LE estimated gas"),
    storageLimit: safeInteger(estimate.storageLimit, "Gnocchi LE estimated storage"),
    suggestedFeeMutez: safeInteger(estimate.suggestedFeeMutez, "Gnocchi LE suggested fee"),
    minimalFeeMutez: safeInteger(estimate.minimalFeeMutez, "Gnocchi LE minimal fee"),
    burnFeeMutez: safeInteger(estimate.burnFeeMutez, "Gnocchi LE burn fee"),
  };
}

export function ravioliGnocchiLeSendOptions(estimate: JsonObject): {
  amount: 0;
  mutez: true;
  fee: number;
  gasLimit: number;
  storageLimit: number;
} {
  const normalized = normalizeEstimate(estimate);
  assert.ok(normalized.gasLimit > 0, "Gnocchi LE estimated gas must be positive");
  return {
    amount: 0,
    mutez: true,
    fee: Math.max(normalized.suggestedFeeMutez, normalized.minimalFeeMutez) + FEE_HEADROOM_MUTEZ,
    gasLimit: normalized.gasLimit,
    storageLimit: normalized.storageLimit,
  };
}

async function estimateCall(tezos: TezosToolkit, call: ExactCreateCall): Promise<JsonObject> {
  const contract = await tezos.contract.at(call.contractAddress);
  const prepared = contract.methodsObject[call.entrypoint](call.payload);
  assert.equal(typeof prepared?.toTransferParams, "function");
  return normalizeEstimate(await tezos.estimate.transfer(prepared.toTransferParams()));
}

function decodedCall(request: PastaUiLiveBridgeRequest): { contractAddress: string; entrypoint: string; payload: unknown } | null {
  if (request.action !== "call") return null;
  const decoded = decodePastaUiLiveValue(request.payload) as JsonObject;
  return decoded?.call && typeof decoded.call === "object" ? decoded.call : null;
}

export function validateRavioliGnocchiLeIntent(
  intent: JsonObject,
  accepted: RavioliGnocchiLeAcceptedEvidence,
): void {
  assert.equal(intent.schema, RAVIOLI_GNOCCHI_LE_INTENT_SCHEMA);
  assert.equal(intent.status, "AUTHORIZED-NOT-YET-SUBMITTED");
  assert.equal(intent.runId, RAVIOLI_GNOCCHI_LE_RUN_ID);
  assert.deepEqual(intent.acceptedGnocchi, accepted);
  assert.ok(Number.isFinite(Date.parse(String(intent.createdAt || ""))), "Gnocchi LE intent creation time is invalid");
  assertRavioliGnocchiLeState(intent.before, "before");
  exactPolicy(intent.policy, Date.parse(intent.createdAt));
  requireIpfsUri(intent.metadataUri, "intent metadata URI");
  requireIpfsUri(intent.artifactUri, "intent artifact URI");
  assert.ok(Array.isArray(intent.pins) && intent.pins.length === 2);
  assert.deepEqual(
    intent.pins.map((pin: JsonObject) => pin.id).sort(),
    ["gnocchi-le-token-3-media", "gnocchi-le-token-3-metadata"],
    "Gnocchi LE intent pin inventory drift",
  );
  for (const pin of intent.pins as RavioliGnocchiLeArtifact[]) {
    assert.match(pin.sha256, /^[0-9a-f]{64}$/, `${pin.id} pin hash is invalid`);
    requireIpfsUri(pin.ipfsUri, `${pin.id} pin URI`);
    assert.ok(/^https:\/\//.test(String(pin.gatewayUrl || "")), `${pin.id} public gateway URL is invalid`);
    assert.equal(pin.retrievedSha256, pin.sha256, `${pin.id} public retrieval hash drift`);
  }
  assert.ok(Array.isArray(intent.signerLanesBefore) && intent.signerLanesBefore.length === 2);
  assert.equal(intent.signerLanesBefore[0].counter, intent.signerLanesBefore[1].counter, "Gnocchi LE intent RPC counters disagree");
  assert.ok(intent.signerLanesBefore.every((lane: RavioliGnocchiLeLaneSnapshot) => lane.activeOperationCount === 0));
  assert.ok(safeInteger(intent.estimate?.gasLimit, "Gnocchi LE intent gas estimate") > 0);
  for (const field of ["storageLimit", "suggestedFeeMutez", "minimalFeeMutez", "burnFeeMutez"]) {
    safeInteger(intent.estimate?.[field], `Gnocchi LE intent ${field}`);
  }
  assert.deepEqual(intent.sendOptions, ravioliGnocchiLeSendOptions(intent.estimate), "Gnocchi LE intent send options are not estimate-bound");
  assert.deepEqual(
    intent.call,
    buildRavioliGnocchiLeIntentCall(intent.metadataUri, intent.policy),
    "Gnocchi LE intent call drift",
  );
}

async function waitForPreSubmitIntent(
  page: Page,
  ready: Promise<JsonObject>,
  timeoutMs = 120_000,
): Promise<JsonObject> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Gnocchi LE pre-submit intent timed out")), timeoutMs);
  });
  const failure = page.waitForFunction(
    () => document.getElementById("log")?.textContent?.includes("publish failed:"),
    undefined,
    { timeout: timeoutMs },
  ).then(async () => {
    const log = (await page.locator("#log").textContent()) || "";
    throw new Error(`Gnocchi LE Studio failed before its write intent: ${log.slice(-1_500)}`);
  });
  try {
    return await Promise.race([ready, failure, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    void failure.catch(() => undefined);
  }
}

async function discoverScreenshots(supplementRoot: string): Promise<{
  screenshots: RavioliGnocchiLeScreenshot[];
  sidecars: RavioliGnocchiLeArtifact[];
}> {
  const artifactsRoot = path.join(supplementRoot, "artifacts");
  const entries = (await readdir(artifactsRoot)).filter((name) => /^screenshot-.*\.json$/.test(name)).sort();
  const screenshots: RavioliGnocchiLeScreenshot[] = [];
  const sidecars: RavioliGnocchiLeArtifact[] = [];
  for (const name of entries) {
    const sidecarPath = path.join(artifactsRoot, name);
    const sidecarBytes = await readFile(sidecarPath);
    const stem = name.replace(/^screenshot-/, "").replace(/\.json$/, "");
    const pngPath = path.join(supplementRoot, "screenshots", `${stem}.png`);
    const sidecar = await verifyScreenshotSidecar(pngPath, sidecarPath);
    screenshots.push({
      stage: stem,
      path: `screenshots/${stem}.png`,
      sha256: sidecar.sha256,
      caption: `${RAVIOLI_GNOCCHI_LE_SUPPLEMENT_DIRECTORY}: ${sidecar.capability} — ${sidecar.stageName}`,
    });
    sidecars.push({
      id: `screenshot-sidecar-${stem}`,
      kind: "screenshot-sidecar",
      path: `artifacts/${name}`,
      sha256: sha256(sidecarBytes),
    });
  }
  assert.equal(screenshots.length, 4, "Gnocchi LE supplement requires four visual stages");
  assert.equal(new Set(screenshots.map((entry) => entry.sha256)).size, screenshots.length, "Gnocchi LE screenshots must be visually unique");
  assert.ok(screenshots.some((entry) => /token three live|reconciled token three live/i.test(entry.caption)), "Gnocchi LE terminal visual stage is missing");
  return { screenshots, sidecars };
}

async function artifactRecord(supplementRoot: string, id: string, kind: string, relativePath: string): Promise<RavioliGnocchiLeArtifact> {
  return { id, kind, path: relativePath, sha256: sha256(await readFile(path.join(supplementRoot, relativePath))) };
}

function buildReceipt(input: {
  completionMode: "direct" | "read-only-reconciliation";
  rpcUrl: string;
  completedAt: string;
  accepted: RavioliGnocchiLeAcceptedEvidence;
  intent: JsonObject;
  intentSha256: string;
  progressSha256: string | null;
  operation: RavioliGnocchiLeOperation;
  after: RavioliGnocchiLeState;
  indexing: RavioliGnocchiLeIndexingSummary;
  signerLanesAfter: RavioliGnocchiLeLaneSnapshot[];
  screenshots: RavioliGnocchiLeScreenshot[];
  artifacts: RavioliGnocchiLeArtifact[];
}): RavioliGnocchiLeDependencyReceipt {
  const policy = input.intent.policy as RavioliGnocchiLePolicy;
  return {
    schema: RAVIOLI_GNOCCHI_LE_RECEIPT_SCHEMA,
    classification: "UI-LIVE-SUPPLEMENT",
    status: "PASSED",
    completionMode: input.completionMode,
    runId: RAVIOLI_GNOCCHI_LE_RUN_ID,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: input.rpcUrl },
    startedAt: input.intent.createdAt,
    completedAt: input.completedAt,
    acceptedGnocchi: input.accepted,
    contract: {
      address: RAVIOLI_GNOCCHI_LE_CONTRACT,
      administrator: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}`,
    },
    token: {
      tokenId: RAVIOLI_GNOCCHI_LE_TOKEN_ID,
      metadataUri: input.intent.metadataUri,
      artifactUri: input.intent.artifactUri,
      maxSupply: RAVIOLI_GNOCCHI_LE_MAX_SUPPLY,
      creatorReserve: RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE,
      active: true,
      policyLocked: true,
      start: policy.start,
      end: policy.end,
      recommendedRavioliSaleEnd: policy.recommendedRavioliSaleEnd,
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}/tokens/${RAVIOLI_GNOCCHI_LE_TOKEN_ID}`,
    },
    policy,
    operation: input.operation,
    before: input.intent.before,
    after: input.after,
    indexing: input.indexing,
    signerLanesBefore: input.intent.signerLanesBefore,
    signerLanesAfter: input.signerLanesAfter,
    intentSha256: input.intentSha256,
    progressSha256: input.progressSha256,
    screenshots: input.screenshots,
    artifacts: input.artifacts,
    links: {
      contract: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}`,
      token: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}/tokens/${RAVIOLI_GNOCCHI_LE_TOKEN_ID}`,
      operation: input.operation.explorerUrl,
      metadata: input.intent.metadataUri,
      artifact: input.intent.artifactUri,
    },
  };
}

export function validateRavioliGnocchiLeDependencyReceipt(
  receipt: RavioliGnocchiLeDependencyReceipt,
): void {
  assert.equal(receipt.schema, RAVIOLI_GNOCCHI_LE_RECEIPT_SCHEMA);
  assert.equal(receipt.classification, "UI-LIVE-SUPPLEMENT");
  assert.equal(receipt.status, "PASSED");
  assert.ok(new Set(["direct", "read-only-reconciliation"]).has(receipt.completionMode));
  assert.equal(receipt.runId, RAVIOLI_GNOCCHI_LE_RUN_ID);
  assert.equal(receipt.network.name, "shadownet");
  assert.equal(receipt.network.chainId, SHADOWNET_CHAIN_ID);
  assert.ok(Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt));
  assert.equal(validateOperation(receipt.acceptedGnocchi.originationHash), ValidationResult.VALID);
  assert.equal(receipt.acceptedGnocchi.historicalSnapshotPath, "artifacts/gnocchi-proof-time-indexer-snapshot.json");
  assert.match(receipt.acceptedGnocchi.historicalSnapshotSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(receipt.acceptedGnocchi, {
    ...receipt.acceptedGnocchi,
    runId: RAVIOLI_GNOCCHI_LE_RUN_ID,
    contractAddress: RAVIOLI_GNOCCHI_LE_CONTRACT,
    administrator: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
    manifestPath: "gnocchi/manifest.json",
    receiptPath: "gnocchi/artifacts/gnocchi-ui-live-run.json",
    manifestSha256: RAVIOLI_GNOCCHI_LE_ACCEPTED_MANIFEST_SHA256,
    receiptSha256: RAVIOLI_GNOCCHI_LE_ACCEPTED_RECEIPT_SHA256,
  });
  assert.equal(receipt.contract.address, RAVIOLI_GNOCCHI_LE_CONTRACT);
  assert.equal(receipt.contract.administrator, RAVIOLI_GNOCCHI_LE_ADMINISTRATOR);
  assert.equal(receipt.token.tokenId, RAVIOLI_GNOCCHI_LE_TOKEN_ID);
  assert.equal(receipt.token.maxSupply, RAVIOLI_GNOCCHI_LE_MAX_SUPPLY);
  assert.equal(receipt.token.creatorReserve, 0);
  assert.equal(receipt.token.active, true);
  assert.equal(receipt.token.policyLocked, true);
  requireIpfsUri(receipt.token.metadataUri, "receipt metadata URI");
  requireIpfsUri(receipt.token.artifactUri, "receipt artifact URI");
  exactPolicy(receipt.policy, Date.parse(receipt.startedAt));
  assert.equal(receipt.token.start, receipt.policy.start);
  assert.equal(receipt.token.end, receipt.policy.end);
  assert.equal(receipt.token.recommendedRavioliSaleEnd, receipt.policy.recommendedRavioliSaleEnd);
  assert.equal(validateOperation(receipt.operation.hash), ValidationResult.VALID);
  assert.equal(receipt.operation.status, "applied");
  assert.equal(receipt.operation.sender, RAVIOLI_GNOCCHI_LE_ADMINISTRATOR);
  assert.equal(receipt.operation.target, RAVIOLI_GNOCCHI_LE_CONTRACT);
  assert.equal(receipt.operation.entrypoint, "create_open_edition");
  assert.ok(
    Date.parse(receipt.operation.timestamp) >= Date.parse(receipt.startedAt) &&
      Date.parse(receipt.operation.timestamp) <= Date.parse(receipt.completedAt),
    "Gnocchi LE operation timestamp is outside the supplement window",
  );
  assertRavioliGnocchiLeState(receipt.before, "before");
  assertRavioliGnocchiLeState(receipt.after, "after", {
    metadataUri: receipt.token.metadataUri,
    artifactUri: receipt.token.artifactUri,
    policy: receipt.policy,
  });
  assert.ok(receipt.after.level >= receipt.operation.level, "Gnocchi LE terminal state predates its operation");
  assert.deepEqual(receipt.indexing, {
    lifecycle: "DEFINED_UNMINTED",
    tokenRecordPresentBeforeFirstMint: receipt.indexing.tokenRecordPresentBeforeFirstMint,
    tokenRecordRequiredBeforeFirstMint: false,
    tokenRecordRequiredAfterRavioliOpen: true,
    evidencePath: "artifacts/gnocchi-le-tzkt-unminted-indexing.json",
    evidenceSha256: receipt.indexing.evidenceSha256,
  });
  assert.equal(typeof receipt.indexing.tokenRecordPresentBeforeFirstMint, "boolean");
  assert.match(receipt.indexing.evidenceSha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.signerLanesBefore.length, 2);
  assert.equal(receipt.signerLanesAfter.length, 2);
  assert.equal(receipt.signerLanesBefore[0].counter, receipt.signerLanesBefore[1].counter);
  assert.equal(receipt.operation.counter, receipt.signerLanesBefore[0].counter + 1);
  assert.ok(receipt.signerLanesAfter.every((lane) => lane.counter === receipt.operation.counter && lane.activeOperationCount === 0));
  assert.match(receipt.intentSha256, /^[0-9a-f]{64}$/);
  if (receipt.progressSha256 != null) assert.match(receipt.progressSha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.screenshots.length, 4);
  for (const screenshot of receipt.screenshots) {
    assert.match(screenshot.sha256, /^[0-9a-f]{64}$/, `${screenshot.stage} screenshot hash is invalid`);
    assert.match(screenshot.path, /^screenshots\/[a-z0-9][a-z0-9-]*\.png$/, `${screenshot.stage} screenshot path is invalid`);
  }
  assert.equal(new Set(receipt.screenshots.map((entry) => entry.sha256)).size, 4);
  assert.equal(new Set(receipt.artifacts.map((entry) => entry.id)).size, receipt.artifacts.length, "Gnocchi LE artifact ids must be unique");
  assert.equal(new Set(receipt.artifacts.map((entry) => entry.path)).size, receipt.artifacts.length, "Gnocchi LE artifact paths must be unique");
  for (const artifact of receipt.artifacts) {
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/, `${artifact.id} artifact hash is invalid`);
    assert.match(artifact.path, /^artifacts\/[a-z0-9][a-z0-9.-]*$/, `${artifact.id} artifact path is invalid`);
  }
  const artifactIds = new Set(receipt.artifacts.map((entry) => entry.id));
  for (const id of ["gnocchi-le-token-3-media", "gnocchi-le-token-3-metadata", "gnocchi-le-intent", "gnocchi-le-tzkt-operation", "gnocchi-le-unminted-indexing"]) {
    assert.ok(artifactIds.has(id), `Gnocchi LE receipt lacks ${id}`);
  }
  const indexingArtifact = receipt.artifacts.find((entry) => entry.id === "gnocchi-le-unminted-indexing");
  assert.equal(indexingArtifact?.path, receipt.indexing.evidencePath);
  assert.equal(indexingArtifact?.sha256, receipt.indexing.evidenceSha256);
  assert.equal(receipt.artifacts.filter((entry) => entry.kind === "screenshot-sidecar").length, 4);
  assert.deepEqual(receipt.links, {
    contract: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}`,
    token: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}/tokens/${RAVIOLI_GNOCCHI_LE_TOKEN_ID}`,
    operation: `https://shadownet.tzkt.io/${receipt.operation.hash}`,
    metadata: receipt.token.metadataUri,
    artifact: receipt.token.artifactUri,
  });
}

export async function loadRavioliGnocchiLeDependency(
  runRoot: string,
): Promise<LoadedRavioliGnocchiLeDependency> {
  const supplementRoot = path.join(path.resolve(runRoot), RAVIOLI_GNOCCHI_LE_SUPPLEMENT_DIRECTORY);
  const receiptPath = path.join(supplementRoot, "artifacts", "ravioli-gnocchi-le-dependency.json");
  const file = await readJsonFile(receiptPath);
  const receipt = file.value as RavioliGnocchiLeDependencyReceipt;
  validateRavioliGnocchiLeDependencyReceipt(receipt);
  await loadRavioliGnocchiLeAcceptedEvidence(runRoot);
  for (const artifact of receipt.artifacts) {
    const artifactPath = path.resolve(supplementRoot, artifact.path);
    assert.ok(artifactPath.startsWith(`${path.resolve(supplementRoot)}${path.sep}`), `${artifact.id} path escapes supplement root`);
    assert.equal(sha256(await readFile(artifactPath)), artifact.sha256, `${artifact.id} bytes drift`);
  }
  for (const screenshot of receipt.screenshots) {
    const screenshotPath = path.resolve(supplementRoot, screenshot.path);
    assert.ok(screenshotPath.startsWith(`${path.resolve(supplementRoot)}${path.sep}`), `${screenshot.stage} path escapes supplement root`);
    assert.equal(sha256(await readFile(screenshotPath)), screenshot.sha256, `${screenshot.stage} bytes drift`);
  }
  return { receipt, receiptPath, receiptSha256: file.digest };
}

async function pinArtifactsFromIntent(
  supplementRoot: string,
  intent: JsonObject,
): Promise<RavioliGnocchiLeArtifact[]> {
  const pins = intent.pins as RavioliGnocchiLeArtifact[];
  for (const pin of pins) {
    assert.equal(sha256(await readFile(path.join(supplementRoot, pin.path))), pin.sha256, `${pin.id} persisted bytes drift`);
  }
  return pins.map((pin) => ({ ...pin }));
}

async function writeOperationArtifact(
  supplementRoot: string,
  operation: RavioliGnocchiLeOperation,
): Promise<RavioliGnocchiLeArtifact> {
  const relativePath = "artifacts/gnocchi-le-tzkt-operation.json";
  const filePath = path.join(supplementRoot, relativePath);
  const bytes = deterministicJsonBytes({
    schema: "pastaprotocol-ravioli-gnocchi-le-operation@1",
    contract: RAVIOLI_GNOCCHI_LE_CONTRACT,
    tokenId: RAVIOLI_GNOCCHI_LE_TOKEN_ID,
    operation,
  });
  try {
    await writeFile(filePath, bytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    assert.equal(sha256(await readFile(filePath)), sha256(bytes), "existing Gnocchi LE operation artifact drift");
  }
  return { id: "gnocchi-le-tzkt-operation", kind: "indexer-operation", path: relativePath, sha256: sha256(bytes) };
}

async function captureReadOnlyReconciledTerminal(
  runRoot: string,
  rpcUrl: string,
): Promise<void> {
  const tezos = new TezosToolkit(rpcUrl);
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([RAVIOLI_GNOCCHI_LE_CONTRACT]),
    allowedEntrypoints: new Set(),
    assertExpectedChain: async (stage) => {
      await assertShadownet(tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: async () => { throw new PastaUiLiveBridgeError("read-only reconciliation forbids pinning", 403); },
    pinBlob: async () => { throw new PastaUiLiveBridgeError("read-only reconciliation forbids pinning", 403); },
    validateOrigination: async () => { throw new PastaUiLiveBridgeError("read-only reconciliation forbids origination", 403); },
    validateCall: async () => { throw new PastaUiLiveBridgeError("read-only reconciliation forbids calls", 403); },
    projectStorage: projectRavioliGnocchiLeStorage,
  });
  const bridge = await startPastaUiLiveLoopbackServer({ staticRoot: STATIC_ROOT, handleAction: (request) => session.handle(request) });
  let actor: ActorPage | null = null;
  try {
    actor = await openActorPage(bridge);
    await actor.page.selectOption("#network", "shadownet");
    await connectStudio(actor.page);
    await actor.page.fill("#mintKt", RAVIOLI_GNOCCHI_LE_CONTRACT);
    await actor.page.click("#btnLoadCollectionEditions");
    await actor.page.locator("#editionList .pp-token").nth(RAVIOLI_GNOCCHI_LE_TOKEN_ID).waitFor({ state: "visible" });
    await captureStage({
      actor,
      runRoot,
      ordinal: 5,
      stageName: "Reconciled token three live",
      focusSelector: "#editionList",
      evidence: [
        { selector: "#editionList .pp-token strong", index: RAVIOLI_GNOCCHI_LE_TOKEN_ID, expectedText: "Token #3 · Limited Edition" },
        { selector: "#editionList .pp-token .pp-note", index: RAVIOLI_GNOCCHI_LE_TOKEN_ID, expectedText: "policy locked" },
      ],
    });
  } finally {
    await closeActorPage(actor);
    await bridge.close();
  }
}

export async function runRavioliGnocchiLeReconciliation(): Promise<LoadedRavioliGnocchiLeDependency> {
  const runRoot = assertRavioliGnocchiLeReconciliationAllowed(process.env);
  const supplementRoot = path.join(runRoot, RAVIOLI_GNOCCHI_LE_SUPPLEMENT_DIRECTORY);
  const accepted = await loadRavioliGnocchiLeAcceptedEvidence(runRoot);
  const intentFile = await readJsonFile(path.join(supplementRoot, "artifacts", "gnocchi-le-intent.json"));
  const intent = intentFile.value;
  validateRavioliGnocchiLeIntent(intent, accepted.accepted);
  let progressFile: Awaited<ReturnType<typeof readJsonFile>> | null = null;
  try {
    progressFile = await readJsonFile(path.join(supplementRoot, "artifacts", "gnocchi-le-progress.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const operation = validateRavioliGnocchiLeOperationRows(
    await readReconciliationOperationRows(intent.before.level),
    {
      policy: intent.policy,
      metadataUri: intent.metadataUri,
      beforeLevel: intent.before.level,
      beforeCounter: intent.signerLanesBefore[0].counter,
    },
  );
  if (progressFile) {
    assert.equal(progressFile.value.schema, RAVIOLI_GNOCCHI_LE_PROGRESS_SCHEMA);
    assert.equal(progressFile.value.operationHash, operation.hash, "Gnocchi LE progress operation drift");
  }
  const rpc = await probeRpcChainId();
  const tezos = new TezosToolkit(rpc.rpcUrl);
  const tokenMetadata = JSON.parse((await readFile(path.join(supplementRoot, "artifacts", "token-3-metadata.json"))).toString("utf8"));
  const after = await readRavioliGnocchiLeState(tezos, { uri: intent.metadataUri, value: tokenMetadata });
  assertRavioliGnocchiLeState(after, "after", { metadataUri: intent.metadataUri, artifactUri: intent.artifactUri, policy: intent.policy });
  const indexing = await loadOrCreateRavioliGnocchiLeIndexerEvidence(supplementRoot, intent.metadataUri, after);
  const signerLanesAfter = await readDualSignerLanes(operation.counter);
  await rehashAcceptedEvidence(accepted);
  const existingScreenshots = await discoverScreenshots(supplementRoot).catch(() => null);
  if (!existingScreenshots || existingScreenshots.screenshots.length !== 4) {
    await captureReadOnlyReconciledTerminal(runRoot, rpc.rpcUrl);
  }
  const visual = await discoverScreenshots(supplementRoot);
  const operationArtifact = await writeOperationArtifact(supplementRoot, operation);
  const pinArtifacts = await pinArtifactsFromIntent(supplementRoot, intent);
  const intentArtifact = await artifactRecord(supplementRoot, "gnocchi-le-intent", "write-intent", "artifacts/gnocchi-le-intent.json");
  const artifacts = [...pinArtifacts, intentArtifact, operationArtifact, indexing.artifact, ...visual.sidecars];
  if (progressFile) artifacts.push(await artifactRecord(supplementRoot, "gnocchi-le-progress", "write-progress", "artifacts/gnocchi-le-progress.json"));
  const receipt = buildReceipt({
    completionMode: "read-only-reconciliation",
    rpcUrl: rpc.rpcUrl,
    completedAt: new Date().toISOString(),
    accepted: accepted.accepted,
    intent,
    intentSha256: intentFile.digest,
    progressSha256: progressFile?.digest || null,
    operation,
    after,
    indexing: indexing.summary,
    signerLanesAfter,
    screenshots: visual.screenshots,
    artifacts,
  });
  validateRavioliGnocchiLeDependencyReceipt(receipt);
  await writeJsonExclusive(path.join(supplementRoot, "artifacts", "ravioli-gnocchi-le-dependency.json"), receipt);
  return loadRavioliGnocchiLeDependency(runRoot);
}

export async function runRavioliGnocchiLeDependency(): Promise<LoadedRavioliGnocchiLeDependency> {
  const runRoot = assertRavioliGnocchiLeExecutionAllowed(process.env);
  const supplementRoot = await requireFreshSupplementDirectory(runRoot);
  const accepted = await loadRavioliGnocchiLeAcceptedEvidence(runRoot);
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-ravioli-gnocchi-le.sock",
    authToken: "local-pasta-ravioli-gnocchi-le",
    auditLog: "/tmp/wtf-pasta-ravioli-gnocchi-le-audit.log",
  });
  const signerSet = await loadSignerSet(env);
  assert.equal(signerSet.creator.address, RAVIOLI_GNOCCHI_LE_ADMINISTRATOR, "Gnocchi LE creator signer differs from accepted administrator");
  const tezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "Ravioli Gnocchi LE startup");
  const policy = deriveRavioliGnocchiLePolicy();
  const before = await readRavioliGnocchiLeState(tezos);
  assertRavioliGnocchiLeState(before, "before");
  const signerLanesBefore = await readDualSignerLanes();
  const beforeCounter = signerLanesBefore[0].counter;
  const placeholderEstimate = await estimateCall(tezos, buildRavioliGnocchiLeCreateCall(PLACEHOLDER_METADATA_URI, policy));
  const requiredBalance = placeholderEstimate.suggestedFeeMutez + placeholderEstimate.burnFeeMutez + OPERATION_RESERVE_MUTEZ;
  assert.ok(
    signerLanesBefore.every((lane) => lane.balanceMutez >= requiredBalance),
    `Gnocchi LE creator requires ${requiredBalance} mutez before pinning`,
  );
  await rehashAcceptedEvidence(accepted);

  await mkdir(path.join(supplementRoot, "artifacts"), { recursive: true });
  const ipfs = resolveIpfsProofConfig();
  const pins: PinRecord[] = [];
  const ready = createDeferred<JsonObject>();
  const release = createDeferred<void>();
  let exactIntent: JsonObject | null = null;
  let intentDigest = "";
  let operationEvidence: RavioliGnocchiLeOperation | null = null;
  let progressDigest: string | null = null;
  let pendingEstimate: JsonObject | null = null;
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: signerSet.creator.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([RAVIOLI_GNOCCHI_LE_CONTRACT]),
    allowedEntrypoints: new Set(["create_open_edition"]),
    minimumActionBalanceMutez: MINIMUM_ACTION_BALANCE_MUTEZ,
    assertExpectedChain: async (stage) => {
      await assertShadownet(tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
    validateOrigination: async () => { throw new PastaUiLiveBridgeError("existing-collection supplement forbids origination", 403); },
    validateCall: async (call) => {
      assert.equal(pins.length, 2, "Gnocchi LE Studio must pin exactly media and token metadata before submission");
      const media = pins.find((pin) => pin.bytes);
      const metadata = pins.find((pin) => pin.value !== undefined);
      assert.ok(media && metadata);
      const metadataUri = metadata.proof.uri;
      const artifactUri = media.proof.uri;
      validateRavioliGnocchiLeCreateCall(call, { metadataUri, policy });
      assert.equal(artifactUriFromMetadata(metadata.value), artifactUri, "Gnocchi LE metadata does not bind exact media URI");
      const exactCall = buildRavioliGnocchiLeCreateCall(metadataUri, policy);
      const estimate = requirePresent<JsonObject>(pendingEstimate, "Gnocchi LE exact estimate was not bound by the bridge");
      const sendOptions = ravioliGnocchiLeSendOptions(estimate);
      const createdAt = new Date().toISOString();
      exactIntent = {
        schema: RAVIOLI_GNOCCHI_LE_INTENT_SCHEMA,
        status: "AUTHORIZED-NOT-YET-SUBMITTED",
        runId: RAVIOLI_GNOCCHI_LE_RUN_ID,
        network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
        createdAt,
        acceptedGnocchi: accepted.accepted,
        before,
        signerLanesBefore,
        policy,
        metadataUri,
        artifactUri,
        pins: pins.map((pin) => pin.artifact),
        estimate,
        sendOptions,
        call: buildRavioliGnocchiLeIntentCall(metadataUri, policy),
      };
      const intentFile = await writeJsonExclusive(path.join(supplementRoot, "artifacts", "gnocchi-le-intent.json"), exactIntent);
      intentDigest = intentFile.sha256;
      ready.resolve(exactIntent);
      await release.promise;
      await rehashAcceptedEvidence(accepted);
      const lanes = await readDualSignerLanes(beforeCounter);
      assert.ok(lanes.every((lane) => lane.balanceMutez >= requiredBalance));
      assertRavioliGnocchiLeState(await readRavioliGnocchiLeState(tezos), "before");
    },
    projectStorage: projectRavioliGnocchiLeStorage,
    assertOperationApplied: async (assertion) => {
      assert.equal(assertion.action, "call");
      operationEvidence = await readIndexedOperationByHash(assertion.operationHash, {
        policy,
        metadataUri: exactIntent!.metadataUri,
        beforeLevel: before.level,
        beforeCounter,
      });
    },
    onPin: async ({ value, bytes, proof }) => {
      const record = await persistPin(supplementRoot, {
        ...(value !== undefined ? { value } : {}),
        ...(bytes ? { bytes: Uint8Array.from(bytes) } : {}),
        proof,
      });
      pins.push(record);
      assert.ok(pins.length <= 2, "Gnocchi LE Studio attempted an unexpected third pin");
    },
    onReceipt: async (receipt) => {
      if (receipt.action !== "call") return;
      assert.ok(exactIntent && operationEvidence, "Gnocchi LE operation evidence must exist before progress");
      const progress = {
        schema: RAVIOLI_GNOCCHI_LE_PROGRESS_SCHEMA,
        status: "APPLIED-NOT-YET-FINALIZED",
        intentSha256: intentDigest,
        operationHash: operationEvidence.hash,
        operation: operationEvidence,
        bridgeReceipt: receipt,
      };
      progressDigest = (await writeJsonExclusive(path.join(supplementRoot, "artifacts", "gnocchi-le-progress.json"), progress)).sha256;
    },
  });
  session.authorizeAfterFundingPreflight(fundingAuthorization(signerLanesBefore[0].balanceMutez, requiredBalance));
  const bridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: async (request) => {
      if (request.action === "originate" || request.action === "batch") {
        throw new PastaUiLiveBridgeError(`Gnocchi LE supplement forbids ${request.action}`, 403);
      }
      const call = decodedCall(request);
      if (call) {
        const metadataUri = pins.find((pin) => pin.value !== undefined)?.proof.uri || PLACEHOLDER_METADATA_URI;
        validateRavioliGnocchiLeCreateCall(call, { metadataUri, policy });
        pendingEstimate = await estimateCall(tezos, buildRavioliGnocchiLeCreateCall(metadataUri, policy));
        const requestPayload = request.payload as JsonObject;
        requestPayload.sendOptions = ravioliGnocchiLeSendOptions(pendingEstimate);
      }
      try {
        return await session.handle(request);
      } finally {
        if (call) pendingEstimate = null;
      }
    },
  });
  const screenshots: CapturePastaProofStageResult[] = [];
  let actor: ActorPage | null = null;
  try {
    actor = await openActorPage(bridge);
    await configureStudio(actor.page, ipfs, policy);
    await connectStudio(actor.page);
    screenshots.push(await captureStage({
      actor,
      runRoot,
      ordinal: 1,
      stageName: "Future limited edition configured",
      focusSelector: "#curvePreview",
      evidence: [
        { selector: "#curvePreview", expectedText: "preset: Limited Edition" },
        { selector: "#account", expectedText: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR.slice(0, 7) },
      ],
    }));
    await verifyExistingCollection(actor.page);
    screenshots.push(await captureStage({
      actor,
      runRoot,
      ordinal: 2,
      stageName: "Accepted collection verified at token three",
      focusSelector: "#publishTargetStatus",
      evidence: [{ selector: "#publishTargetStatus", expectedText: "Verified administrator · next edition will be token #3" }],
    }));
    await actor.page.click("#btnPublish");
    await waitForPreSubmitIntent(actor.page, ready.promise);
    await waitForText(actor.page, "#log", "publishing limited edition #3");
    try {
      screenshots.push(await captureStage({
        actor,
        runRoot,
        ordinal: 3,
        stageName: "Exact pins committed before submission",
        focusSelector: "#log",
        evidence: [
          { selector: "#log", expectedText: "pinning artifact" },
          { selector: "#log", expectedText: "pinning token metadata" },
          { selector: "#log", expectedText: "publishing limited edition #3" },
        ],
      }));
      release.resolve();
    } catch (error) {
      release.reject(error);
      throw error;
    }
    await waitForText(actor.page, "#log", "Limited Edition live ✓ — token id 3");
    await actor.page.locator("#editionList .pp-token").nth(RAVIOLI_GNOCCHI_LE_TOKEN_ID).waitFor({ state: "visible" });
    screenshots.push(await captureStage({
      actor,
      runRoot,
      ordinal: 4,
      stageName: "Token three live",
      focusSelector: "#editionList",
      evidence: [
        { selector: "#publishTargetStatus", expectedText: "next token #4" },
        { selector: "#editionList .pp-token strong", index: RAVIOLI_GNOCCHI_LE_TOKEN_ID, expectedText: "Token #3 · Limited Edition" },
        { selector: "#editionList .pp-token .pp-note", index: RAVIOLI_GNOCCHI_LE_TOKEN_ID, expectedText: "policy locked" },
      ],
    }));
  } finally {
    await closeActorPage(actor);
    await bridge.close();
  }
  assert.ok(exactIntent && intentDigest, "Gnocchi LE exact intent was not created");
  const appliedOperation = requirePresent<RavioliGnocchiLeOperation>(
    operationEvidence,
    "Gnocchi LE applied operation was not indexed",
  );
  assert.ok(progressDigest, "Gnocchi LE operation progress was not persisted");
  assert.equal(pins.length, 2);
  const metadataPin = pins.find((pin) => pin.value !== undefined)!;
  const mediaPin = pins.find((pin) => pin.bytes)!;
  const after = await readRavioliGnocchiLeState(tezos, { uri: metadataPin.proof.uri, value: metadataPin.value });
  assertRavioliGnocchiLeState(after, "after", { metadataUri: metadataPin.proof.uri, artifactUri: mediaPin.proof.uri, policy });
  const indexing = await loadOrCreateRavioliGnocchiLeIndexerEvidence(supplementRoot, metadataPin.proof.uri, after);
  const signerLanesAfter = await readDualSignerLanes(appliedOperation.counter);
  await rehashAcceptedEvidence(accepted);
  const visual = await discoverScreenshots(supplementRoot);
  const operationArtifact = await writeOperationArtifact(supplementRoot, appliedOperation);
  const intentArtifact = await artifactRecord(supplementRoot, "gnocchi-le-intent", "write-intent", "artifacts/gnocchi-le-intent.json");
  const progressArtifact = await artifactRecord(supplementRoot, "gnocchi-le-progress", "write-progress", "artifacts/gnocchi-le-progress.json");
  const receipt = buildReceipt({
    completionMode: "direct",
    rpcUrl: rpc.rpcUrl,
    completedAt: new Date().toISOString(),
    accepted: accepted.accepted,
    intent: exactIntent,
    intentSha256: intentDigest,
    progressSha256: progressDigest,
    operation: appliedOperation,
    after,
    indexing: indexing.summary,
    signerLanesAfter,
    screenshots: visual.screenshots,
    artifacts: [...pins.map((pin) => pin.artifact), intentArtifact, progressArtifact, operationArtifact, indexing.artifact, ...visual.sidecars],
  });
  validateRavioliGnocchiLeDependencyReceipt(receipt);
  await writeJsonExclusive(path.join(supplementRoot, "artifacts", "ravioli-gnocchi-le-dependency.json"), receipt);
  return loadRavioliGnocchiLeDependency(runRoot);
}

async function main(): Promise<void> {
  try {
    const result = process.env[RAVIOLI_GNOCCHI_LE_RECONCILE_FLAG] === "1"
      ? await runRavioliGnocchiLeReconciliation()
      : await runRavioliGnocchiLeDependency();
    process.stdout.write(`${JSON.stringify({
      status: "PASSED",
      classification: result.receipt.classification,
      completionMode: result.receipt.completionMode,
      contract: result.receipt.contract.address,
      tokenId: result.receipt.token.tokenId,
      operationHash: result.receipt.operation.hash,
      receiptPath: result.receiptPath,
      receiptSha256: result.receiptSha256,
    }, null, 2)}\n`);
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
