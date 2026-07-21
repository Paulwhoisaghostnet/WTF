#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

import { MichelsonMap, type TezosToolkit } from "@taquito/taquito";
import { validateContractAddress, validateOperation, ValidationResult } from "@taquito/utils";
import { unzipSync } from "fflate";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  decodePastaUiLiveValue,
  hashJsonForBridge,
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveBridgeRequest,
  type PastaUiLivePinProof,
  type PastaUiLivePublicReceipt,
} from "./pasta-ui-live-bridge-kit";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  type CapturePastaProofStageResult,
} from "./pasta-proof-screenshot-kit";
import {
  assertShadownet,
  block,
  buildToolkit,
  deterministicJsonBytes,
  hexToUtf8,
  loadSignerPair,
  normalizeBase,
  pinIpfsProofBytes,
  pinIpfsProofJson,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  resolveIpfsProofConfig,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

const EXECUTE_FLAG = "PASTA_SHADOWNET_MACARONI_UI_LIVE_EXECUTE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const STATIC_ROOT = path.join(root, "public");
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
const CREATOR_OPERATION_RESERVE_MUTEZ = 2_000_000;
const COLLECTOR_OPERATION_RESERVE_MUTEZ = 750_000;
const MINT_PRICE_MUTEZ = 1_000;
const TOKEN_QUANTITY = 2;
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
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

type BrowserMapRecord = Record<string, unknown>;

export type MacaroniBrowserProjection = {
  administrator: string;
  treasury: string;
  supply: number;
  minted: number;
  token_count: number;
  locked: boolean;
  paused: boolean;
  delayed_reveal: boolean;
  placeholder_count: number;
  reveal_cursor: number;
  reveal_tail: number;
  reveal_delay: number;
  unrevealed_since: unknown;
  revealed: number;
  minter_royalty_config: unknown;
  metadata: BrowserMapRecord;
  ledger: BrowserMapRecord;
  operators: BrowserMapRecord;
  token_metadata: BrowserMapRecord;
  pending_tokens: BrowserMapRecord;
  token_supply: BrowserMapRecord;
  token_minted: BrowserMapRecord;
  slots: BrowserMapRecord;
  stages: BrowserMapRecord;
  allowlist: BrowserMapRecord;
  stage_minted: BrowserMapRecord;
  placeholder_pool: BrowserMapRecord;
  token_placeholder: BrowserMapRecord;
  reveal_queue: BrowserMapRecord;
};

type PinnedRecord = {
  actor: "creator";
  value?: unknown;
  bytes?: Uint8Array;
  proof: PastaUiLivePinProof;
};

type WrittenPinArtifact = {
  id: string;
  kind: string;
  path: string;
  sha256: string;
  ipfsUri: string;
  gatewayUrl: string;
  retrievedSha256: string;
  fileName: string;
};

export type MacaroniUiLiveResult = {
  manifestPath: string;
  receiptPath: string;
  contractAddress: string;
  contractAddresses: string[];
  operationHashes: string[];
  tokenIds: number[];
  screenshots: CapturePastaProofStageResult[];
};

export function assertMacaroniUiLiveExecutionAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[EXECUTE_FLAG] !== "1") {
    block("explicit Macaroni UI-live execute flag is required", [
      `\`${EXECUTE_FLAG}=1\` is required because this lane pins durable media/metadata and signs fresh V1 and V2 Shadownet originations, configuration calls, collector mints, and the V2 reveal.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Macaroni UI-live runner only permits Shadownet", [
      "Unset `TEZOS_NETWORK` or set it to `shadownet`; mainnet execution is refused.",
    ]);
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [
      `Set \`${OUTPUT_ENV}\` to an existing aggregate proof-run root before executing this lane.`,
    ]);
  }
  for (const key of [
    "PASTA_SHADOWNET_MACARONI_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_MACARONI_UI_LIVE_RESUME",
    "PASTA_SHADOWNET_MACARONI_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) {
      block("Macaroni UI-live proof is fresh-origination only", [
        `Unset \`${key}\`; proof runs may not resume or attach to an existing contract.`,
      ]);
    }
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function macaroniManagerOperationFitsBlock(
  existingGasLimit: number,
  candidateGasLimit: number,
  hardGasLimit = 1_040_000,
): boolean {
  for (const [label, value] of [
    ["existing gas limit", existingGasLimit],
    ["candidate gas limit", candidateGasLimit],
    ["hard gas limit", hardGasLimit],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return existingGasLimit + candidateGasLimit <= hardGasLimit;
}

export function macaroniReplacementByFeeEligible(input: {
  oldFeeMutez: number;
  oldGasLimit: number;
  newFeeMutez: number;
  newGasLimit: number;
  factorNumerator?: number;
  factorDenominator?: number;
}): boolean {
  const values = {
    oldFeeMutez: input.oldFeeMutez,
    oldGasLimit: input.oldGasLimit,
    newFeeMutez: input.newFeeMutez,
    newGasLimit: input.newGasLimit,
    factorNumerator: input.factorNumerator ?? 21,
    factorDenominator: input.factorDenominator ?? 20,
  };
  for (const [label, value] of Object.entries(values)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive safe integer`);
  }
  const oldFee = BigInt(values.oldFeeMutez);
  const oldGas = BigInt(values.oldGasLimit);
  const newFee = BigInt(values.newFeeMutez);
  const newGas = BigInt(values.newGasLimit);
  const numerator = BigInt(values.factorNumerator);
  const denominator = BigInt(values.factorDenominator);
  const absoluteFeePasses = newFee * denominator >= oldFee * numerator;
  const feePerGasPasses = newFee * oldGas * denominator >= oldFee * newGas * numerator;
  return absoluteFeePasses && feePerGasPasses;
}

function normalizeExactJsonValue(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") {
    throw new TypeError("exact metadata JSON does not permit native bigint values");
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (typeof value !== "object") return undefined;

  if (ancestors.has(value)) throw new TypeError("exact metadata JSON does not permit cyclic values");
  ancestors.add(value);
  try {
    const record = value as Record<string, unknown> & { toJSON?: () => unknown };
    if (typeof record.toJSON === "function") {
      const jsonValue = record.toJSON();
      if (jsonValue !== value) return normalizeExactJsonValue(jsonValue, ancestors);
    }
    if (Array.isArray(value)) {
      return value.map((item) => normalizeExactJsonValue(item, ancestors) ?? null);
    }
    const normalized: Record<string, unknown> = Object.create(null);
    if (value instanceof Map) {
      for (const [rawKey, rawValue] of value.entries()) {
        const normalizedKeyValue = normalizeExactJsonValue(rawKey, ancestors);
        if (
          typeof normalizedKeyValue !== "string" &&
          typeof normalizedKeyValue !== "number" &&
          typeof normalizedKeyValue !== "boolean"
        ) {
          throw new TypeError("exact metadata JSON map keys must normalize to JSON object keys");
        }
        const key = String(normalizedKeyValue);
        if (Object.prototype.hasOwnProperty.call(normalized, key)) {
          throw new TypeError(`exact metadata JSON map contains duplicate key ${JSON.stringify(key)}`);
        }
        const normalizedValue = normalizeExactJsonValue(rawValue, ancestors);
        if (normalizedValue !== undefined) normalized[key] = normalizedValue;
      }
      return normalized;
    }
    for (const key of Object.keys(record)) {
      const normalizedValue = normalizeExactJsonValue(record[key], ancestors);
      if (normalizedValue !== undefined) normalized[key] = normalizedValue;
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Require complete JSON equality while ignoring representation-only drift from
 * hardened null-prototype decoders, BigNumber `toJSON`, and Map-backed records.
 * This is an all-keys/all-values comparison; it never accepts a subset match.
 */
export function assertExactMacaroniMetadataJson(
  retrievedBytes: Uint8Array,
  expectedValue: unknown,
): void {
  const retrievedValue = JSON.parse(Buffer.from(retrievedBytes).toString("utf8"));
  const retrievedCanonical = Buffer.from(
    deterministicJsonBytes(normalizeExactJsonValue(retrievedValue)),
  ).toString("utf8");
  const expectedCanonical = Buffer.from(
    deterministicJsonBytes(normalizeExactJsonValue(expectedValue)),
  ).toString("utf8");
  assert.equal(
    retrievedCanonical,
    expectedCanonical,
    "retrieved metadata JSON does not exactly match the pinned metadata value",
  );
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

export function buildMacaroniProofPng(seed: string): Buffer {
  const digest = createHash("sha256").update(seed).digest();
  const width = 64;
  const height = 64;
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[offset++] = (digest[0] + x * 5 + y * 3) & 255;
      raw[offset++] = (digest[1] + x * 2 + y * 7) & 255;
      raw[offset++] = (digest[2] + x * 11 + y) & 255;
      raw[offset++] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function requireFreshAppOutputDirectory(runRoot: string): Promise<{ appRoot: string; runId: string }> {
  const absoluteRunRoot = path.resolve(runRoot);
  let runRootStat;
  try {
    runRootStat = await stat(absoluteRunRoot);
  } catch (error) {
    block("Pasta proof run directory does not exist", [
      `Create the aggregate proof-run root \`${absoluteRunRoot}\` before executing Macaroni.`,
      `Reason: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  if (!runRootStat.isDirectory()) {
    block("Pasta proof run path is not a directory", [`\`${absoluteRunRoot}\` must be an existing directory.`]);
  }
  const runId = path.basename(absoluteRunRoot);
  if (!SAFE_RUN_ID.test(runId)) {
    block("Pasta proof run directory has a non-portable run id", [
      `Directory basename \`${runId}\` must match ${SAFE_RUN_ID}.`,
    ]);
  }
  const appRoot = path.join(absoluteRunRoot, "macaroni");
  try {
    await stat(appRoot);
    block("Macaroni proof output directory already exists", [
      `Refusing to overwrite \`${appRoot}\`; use a fresh proof-run directory.`,
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { appRoot, runId };
}

async function readContractArtifact(artifactPath = CONTRACT_ARTIFACT_PATH): Promise<unknown[]> {
  const code = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.ok(Array.isArray(code), "Macaroni contract artifact must be a Michelson JSON array");
  return code;
}

function tokenInfo(metadataUri: string): MichelsonMap<string, string> {
  const info = new MichelsonMap<string, string>();
  info.set("", utf8ToHex(metadataUri));
  return info;
}

function buildOriginationStorage(input: {
  administrator: string;
  collectionMetadataUri: string;
  placeholderMetadataUri: string;
}) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(input.collectionMetadataUri));
  const placeholderPool = new MichelsonMap<number, { token_id: number; token_info: MichelsonMap<string, string> }>();
  placeholderPool.set(0, { token_id: 0, token_info: tokenInfo(input.placeholderMetadataUri) });
  return {
    administrator: input.administrator,
    pending_administrator: null,
    treasury: input.administrator,
    metadata,
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    pending_tokens: new MichelsonMap(),
    token_supply: new MichelsonMap(),
    token_minted: new MichelsonMap(),
    slots: new MichelsonMap(),
    supply: 0,
    minted: 0,
    token_count: 0,
    stages: new MichelsonMap(),
    allowlist: new MichelsonMap(),
    stage_minted: new MichelsonMap(),
    locked: false,
    paused: false,
    delayed_reveal: true,
    placeholder_pool: placeholderPool,
    placeholder_count: 1,
    token_placeholder: new MichelsonMap(),
    reveal_queue: new MichelsonMap(),
    reveal_cursor: 0,
    reveal_tail: 0,
    reveal_delay: 0,
    unrevealed_since: null,
    revealed: 0,
    minter_royalty_config: { enabled: false, bps: 0, mode: 0, updater: input.administrator },
    first_minter: new MichelsonMap(),
    minter_pool: new MichelsonMap(),
    minter_pool_count: new MichelsonMap(),
    royalty_revision: new MichelsonMap(),
    metadata_revision: new MichelsonMap(),
    royalty_locked: new MichelsonMap(),
  };
}

function buildV1OriginationStorage(input: { administrator: string; collectionMetadataUri: string }) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(input.collectionMetadataUri));
  return {
    administrator: input.administrator,
    pending_administrator: null,
    treasury: input.administrator,
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

function safeNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const candidate = value as { toNumber?: () => number; toString?: () => string } | null;
  if (candidate && typeof candidate.toNumber === "function") return candidate.toNumber();
  const parsed = Number(candidate && typeof candidate.toString === "function" ? candidate.toString() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorText(error: unknown): string {
  const parts = [error instanceof Error ? `${error.name}: ${error.message}` : String(error)];
  try {
    parts.push(JSON.stringify(error, (_key, value) => typeof value === "bigint" ? value.toString() : value));
  } catch {
    // The error message remains sufficient when an SDK error is circular.
  }
  return parts.filter(Boolean).join(" | ");
}

function jsonSafeValue(value: unknown, depth = 0): unknown {
  if (depth > 24) return "[depth-limited]";
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((entry) => jsonSafeValue(entry, depth + 1));
  if (!value || typeof value !== "object") return String(value);
  const candidate = value as Record<string, unknown> & { toNumber?: () => number; toFixed?: () => string; entries?: () => Iterable<[unknown, unknown]> };
  if (typeof candidate.toNumber === "function") return candidate.toNumber();
  if (typeof candidate.toFixed === "function") return candidate.toFixed();
  if (typeof candidate.entries === "function") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of candidate.entries()) output[String(key)] = jsonSafeValue(child, depth + 1);
    return output;
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(candidate)) {
    if (typeof child !== "function") output[key] = jsonSafeValue(child, depth + 1);
  }
  return output;
}

function unwrapMichelsonOption(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, "Some")) return record.Some;
  if (Object.prototype.hasOwnProperty.call(record, "some")) return record.some;
  if (record.prim === "Some" && Array.isArray(record.args)) return record.args[0] ?? null;
  if (record.prim === "None") return null;
  return value;
}

async function mapGet(map: unknown, ...keys: unknown[]): Promise<unknown> {
  const candidate = map as { get?: (value: unknown) => Promise<unknown> | unknown } | null;
  if (!candidate || typeof candidate.get !== "function") return undefined;
  for (const key of keys) {
    try {
      const value = await candidate.get(key);
      if (value !== undefined && value !== null) return value;
    } catch {
      // Try the next equivalent key representation.
    }
  }
  return undefined;
}

function mapRecord(key: string, value: unknown): BrowserMapRecord {
  return value === undefined || value === null ? {} : { [key]: jsonSafeValue(value) };
}

export async function readMacaroniBrowserProjection(
  tezos: TezosToolkit,
  contractAddress: string,
  holderAddress: string,
): Promise<MacaroniBrowserProjection> {
  const contract = await tezos.contract.at(contractAddress);
  const storage = await contract.storage() as Record<string, unknown>;
  const [
    metadata,
    stage,
    pendingToken,
    tokenMetadata,
    tokenSupply,
    tokenMinted,
    placeholder,
    tokenPlaceholder,
    revealQueue,
    ledger,
    stageMinted,
  ] = await Promise.all([
    mapGet(storage.metadata, ""),
    mapGet(storage.stages, 0, "0"),
    mapGet(storage.pending_tokens, 0, "0"),
    mapGet(storage.token_metadata, 0, "0"),
    mapGet(storage.token_supply, 0, "0"),
    mapGet(storage.token_minted, 0, "0"),
    mapGet(storage.placeholder_pool, 0, "0"),
    mapGet(storage.token_placeholder, 0, "0"),
    mapGet(storage.reveal_queue, 0, "0"),
    mapGet(storage.ledger, { owner: holderAddress, token_id: 0 }, { owner: holderAddress, token_id: "0" }),
    mapGet(storage.stage_minted, { stage: 0, holder: holderAddress }, { stage: "0", holder: holderAddress }),
  ]);
  return {
    administrator: String(storage.administrator || ""),
    treasury: String(storage.treasury || ""),
    supply: safeNumber(storage.supply),
    minted: safeNumber(storage.minted),
    token_count: safeNumber(storage.token_count),
    locked: Boolean(storage.locked),
    paused: Boolean(storage.paused),
    delayed_reveal: Boolean(storage.delayed_reveal),
    placeholder_count: safeNumber(storage.placeholder_count),
    reveal_cursor: safeNumber(storage.reveal_cursor),
    reveal_tail: safeNumber(storage.reveal_tail),
    reveal_delay: safeNumber(storage.reveal_delay),
    unrevealed_since: jsonSafeValue(unwrapMichelsonOption(storage.unrevealed_since)),
    revealed: safeNumber(storage.revealed),
    minter_royalty_config: jsonSafeValue(storage.minter_royalty_config),
    metadata: mapRecord("", metadata),
    ledger: mapRecord(`${holderAddress}:0`, ledger),
    operators: {},
    token_metadata: mapRecord("0", tokenMetadata),
    pending_tokens: mapRecord("0", pendingToken),
    token_supply: mapRecord("0", tokenSupply),
    token_minted: mapRecord("0", tokenMinted),
    slots: {},
    stages: mapRecord("0", stage),
    allowlist: {},
    stage_minted: mapRecord(`0:${holderAddress}`, stageMinted),
    placeholder_pool: mapRecord("0", placeholder),
    token_placeholder: mapRecord("0", tokenPlaceholder),
    reveal_queue: mapRecord("0", revealQueue),
  };
}

export async function readMacaroniV1BrowserProjection(
  tezos: TezosToolkit,
  contractAddress: string,
  holderAddress: string,
): Promise<Record<string, unknown>> {
  const contract = await tezos.contract.at(contractAddress);
  const storage = await contract.storage() as Record<string, unknown>;
  const [metadata, stage, pendingToken, tokenMetadata, placeholder, ledger, stageMinted] = await Promise.all([
    mapGet(storage.metadata, ""),
    mapGet(storage.stages, 0, "0"),
    mapGet(storage.pending_tokens, 0, "0"),
    mapGet(storage.token_metadata, 0, "0"),
    mapGet(storage.placeholder, ""),
    mapGet(storage.ledger, 0, "0"),
    mapGet(storage.stage_minted, { stage: 0, holder: holderAddress }, { stage: "0", holder: holderAddress }),
  ]);
  return {
    administrator: String(storage.administrator || ""),
    treasury: String(storage.treasury || ""),
    supply: safeNumber(storage.supply),
    minted: safeNumber(storage.minted),
    locked: Boolean(storage.locked),
    paused: Boolean(storage.paused),
    delayed_reveal: Boolean(storage.delayed_reveal),
    reveal_delay: safeNumber(storage.reveal_delay),
    unrevealed_since: jsonSafeValue(unwrapMichelsonOption(storage.unrevealed_since)),
    revealed: safeNumber(storage.revealed),
    seed_salt: String(storage.seed_salt || ""),
    entropy: String(storage.entropy || ""),
    metadata: mapRecord("", metadata),
    ledger: mapRecord("0", ledger),
    operators: {},
    token_metadata: mapRecord("0", tokenMetadata),
    pending_tokens: mapRecord("0", pendingToken),
    slots: {},
    stages: mapRecord("0", stage),
    allowlist: {},
    stage_minted: mapRecord(`0:${holderAddress}`, stageMinted),
    placeholder: mapRecord("", placeholder),
  };
}

export function decodeMacaroniCanonicalOriginationRequest(
  request: PastaUiLiveBridgeRequest,
  expectedCodeHash: string,
): { storage: unknown } {
  assert.equal(request.action, "originate", "expected a canonical Macaroni origination request");
  assert.ok(request.payload && typeof request.payload === "object" && !Array.isArray(request.payload));
  const payload = request.payload as Record<string, unknown>;
  assert.ok(payload.code && typeof payload.code === "object" && !Array.isArray(payload.code));
  const marker = payload.code as Record<string, unknown>;
  assert.deepEqual(Object.keys(marker), ["__pastaCanonicalArtifactSha256"]);
  assert.equal(marker.__pastaCanonicalArtifactSha256, expectedCodeHash, "browser canonical artifact hash differs from Node artifact");
  return { storage: decodePastaUiLiveValue(payload.storage) };
}

export async function installMacaroniBrowserAdapters(
  page: Page,
  publicGatewayBaseUrl: string,
  canonicalArtifactSha256?: string,
): Promise<void> {
  const gateway = publicGatewayBaseUrl.replace(/\/+$/, "");
  const gatewayLiteral = JSON.stringify(gateway).replace(/</g, "\\u003c");
  const artifactHashLiteral = JSON.stringify(canonicalArtifactSha256 || "").replace(/</g, "\\u003c");
  const script = await page.addScriptTag({ content: `(() => {
    "use strict";
    const gatewayBase = ${gatewayLiteral};
    const canonicalArtifactSha256 = ${artifactHashLiteral};
    const md = window.MD;
    const toolkit = md && md.getToolkit && md.getToolkit();
    if (!md || !toolkit || !toolkit.contract || !toolkit.contract.at) throw new Error("Macaroni bridge runtime is not ready");
    function normalizeKey(key) {
      if (key && typeof key === "object") {
        if (Object.prototype.hasOwnProperty.call(key, "stage") && Object.prototype.hasOwnProperty.call(key, "holder")) return String(key.stage) + ":" + String(key.holder);
        if (Object.prototype.hasOwnProperty.call(key, "owner") && Object.prototype.hasOwnProperty.call(key, "token_id")) return String(key.owner) + ":" + String(key.token_id);
      }
      return String(key);
    }
    function nestedInfo(value) {
      if (!value || typeof value !== "object" || !value.token_info || typeof value.token_info.get === "function") return value;
      const info = value.token_info;
      return Object.assign({}, value, { token_info: Object.freeze({ get(key) { return info[String(key)]; }, forEach(callback) { Object.entries(info).forEach(([key, child]) => callback(child, key)); } }) });
    }
    function mapLike(value) {
      if (value && typeof value.get === "function" && typeof value.forEach === "function") return value;
      const record = value && typeof value === "object" ? value : {};
      return Object.freeze({
        async get(key) { return nestedInfo(record[normalizeKey(key)]); },
        forEach(callback) { Object.entries(record).forEach(([key, child]) => callback(nestedInfo(child), /^\\d+$/.test(key) ? Number(key) : key)); },
      });
    }
    const originalAt = toolkit.contract.at.bind(toolkit.contract);
    toolkit.contract.at = async function (contractAddress) {
      const contract = await originalAt(contractAddress);
      const originalStorage = contract.storage.bind(contract);
      contract.storage = async function () {
        const raw = await originalStorage();
        const maps = ["metadata", "ledger", "operators", "token_metadata", "pending_tokens", "token_supply", "token_minted", "slots", "stages", "allowlist", "stage_minted", "placeholder_pool", "token_placeholder", "reveal_queue"];
        const output = Object.assign({}, raw);
        maps.concat(["placeholder"]).forEach((name) => {
          if (Object.prototype.hasOwnProperty.call(raw, name) && raw[name] != null) output[name] = mapLike(raw[name]);
        });
        return output;
      };
      return contract;
    };
    if (canonicalArtifactSha256) {
      const originalOriginate = toolkit.wallet.originate.bind(toolkit.wallet);
      toolkit.wallet.originate = function (input) {
        return {
          async send() {
            const bytes = new TextEncoder().encode(JSON.stringify(input.code));
            const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
            const actualHash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
            if (actualHash !== canonicalArtifactSha256) throw new Error("Macaroni Studio loaded an unexpected contract artifact");
            return originalOriginate({
              code: { __pastaCanonicalArtifactSha256: canonicalArtifactSha256 },
              storage: input.storage,
            }).send();
          },
        };
      };
    }
    md.ensureSessionNetwork = async function () { return md.getAccount(); };
    md.withRpcFallback = async function (fn) { return fn(); };
    md.withRpcReadFallback = async function (fn) { return fn(); };
    md.getBalanceMutez = async function (address) { return Number((await toolkit.tz.getBalance(address)).toString()); };
    md.assertOperationApplied = async function (operation) {
      const hash = String(operation && (operation.opHash || operation.hash) || "");
      if (!hash) throw new Error("UI-live bridge operation did not return a hash");
      return { hash, status: "applied", source: "ui-live-bridge" };
    };
    md.ipfsToHttp = function (uri) { return uri && uri.startsWith("ipfs://") ? gatewayBase + "/" + uri.slice(7) : uri; };
    md.fetchRecentMintTransfers = async function () { return []; };
    md.fetchWalletIdentities = async function () { return new Map(); };
    async function ownedIds(contractAddress, holder) {
      const contract = await toolkit.contract.at(contractAddress);
      const storage = await contract.storage();
      const balance = await storage.ledger.get({ owner: holder, token_id: 0 });
      if (Number(balance || 0) > 0) return [0];
      const owner = await storage.ledger.get(0) ?? await storage.ledger.get("0");
      return String(owner || "") === String(holder) ? [0] : [];
    }
    md.fetchOwnedTokenIds = async function (_network, contractAddress, holder) { return ownedIds(contractAddress, holder); };
    md.fetchMintedTokenIds = async function (_network, contractAddress, holder) { return ownedIds(contractAddress, holder); };
    window.__macaroniUiLiveAdaptersInstalled = true;
  })();` });
  await page.waitForFunction(() => (window as any).__macaroniUiLiveAdaptersInstalled === true);
  await script.evaluate((element) => element.parentNode?.removeChild(element));
}

function dateTimeLocalPast(): string {
  const date = new Date(Date.now() - 120_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function configureMacaroniStudio(
  page: Page,
  kuboApiUrl: string,
  runId: string,
  publicGatewayUrl = "https://proof.invalid/ipfs",
): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#contractVersion", "macaroni-editions-v2");
  await page.fill("#dropTitle", `Macaroni UI-LIVE ${runId}`);
  await page.fill("#dropSymbol", "MACUI");
  await page.fill("#dropDesc", "Actual Macaroni Studio blind-drop proof with an independently operated exported collector page.");
  await page.selectOption("#royaltyPct", "0");
  await page.selectOption("#revealMode", "delayed");
  await page.fill("#revealDelay", "0");
  await page.selectOption("#pinKind", "node");
  await page.fill("#pinUrl", kuboApiUrl);
  await page.fill("#gateway", publicGatewayUrl);
  await page.setInputFiles("#coverFile", {
    name: "macaroni-cover.png",
    mimeType: "image/png",
    buffer: buildMacaroniProofPng(`${runId}:cover`),
  });
  await page.setInputFiles("#placeholderFiles", {
    name: "macaroni-placeholder.png",
    mimeType: "image/png",
    buffer: buildMacaroniProofPng(`${runId}:placeholder`),
  });
  await page.setInputFiles("#csvFile", {
    name: "macaroni-tokens.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,quantity,name,description,tags\n1,2,Macaroni Revealed Proof,Two-edition delayed reveal proof,macaroni;shadownet\n", "utf8"),
  });
  await page.setInputFiles("#mediaFiles", {
    name: "1.png",
    mimeType: "image/png",
    buffer: buildMacaroniProofPng(`${runId}:revealed`),
  });
  await page.waitForFunction(() => document.getElementById("tokenSummary")?.textContent?.includes("2 editions"));
  await page.click("#btnAddStage");
  await page.fill('[data-i="0"][data-f="start"]', dateTimeLocalPast());
  await page.fill('[data-i="0"][data-f="price"]', String(MINT_PRICE_MUTEZ / 1_000_000));
  await page.fill('[data-i="0"][data-f="maxPerWallet"]', "1");
  await page.click('[data-stage-save="0"]');
  await page.waitForFunction(() => document.querySelector('[data-stage-status="0"]')?.textContent?.includes("stage saved"));
}

export async function configureMacaroniV1Studio(
  page: Page,
  kuboApiUrl: string,
  runId: string,
  publicGatewayUrl = "https://proof.invalid/ipfs",
): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#contractVersion", "macaroni-v1");
  await page.fill("#dropTitle", `Macaroni V1 UI-LIVE ${runId}`);
  await page.fill("#dropSymbol", "MACV1");
  await page.fill("#dropDesc", "Actual Macaroni V1 Studio and independently operated exported collector-page proof.");
  await page.selectOption("#royaltyPct", "0");
  await page.selectOption("#revealMode", "instant");
  await page.selectOption("#pinKind", "node");
  await page.fill("#pinUrl", kuboApiUrl);
  await page.fill("#gateway", publicGatewayUrl);
  await page.setInputFiles("#coverFile", {
    name: "macaroni-v1-cover.png",
    mimeType: "image/png",
    buffer: buildMacaroniProofPng(`${runId}:v1-cover`),
  });
  await page.setInputFiles("#csvFile", {
    name: "macaroni-v1-tokens.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,quantity,name,description,tags\n1,1,Macaroni V1 Proof,Classic V1 token minted from an exported page,macaroni;v1;shadownet\n", "utf8"),
  });
  await page.setInputFiles("#mediaFiles", {
    name: "1.png",
    mimeType: "image/png",
    buffer: buildMacaroniProofPng(`${runId}:v1-artwork`),
  });
  await page.waitForFunction(() => document.getElementById("tokenSummary")?.textContent?.includes("1 edition"));
  await page.click("#btnAddStage");
  await page.fill('[data-i="0"][data-f="start"]', dateTimeLocalPast());
  await page.fill('[data-i="0"][data-f="price"]', String(MINT_PRICE_MUTEZ / 1_000_000));
  await page.fill('[data-i="0"][data-f="maxPerWallet"]', "1");
  await page.click('[data-stage-save="0"]');
  await page.waitForFunction(() => document.querySelector('[data-stage-status="0"]')?.textContent?.includes("stage saved"));
}

function assertEmptyMichelsonMap(value: unknown, label: string): void {
  assert.ok(value instanceof MichelsonMap, `${label} must be a MichelsonMap`);
  assert.equal([...value.entries()].length, 0, `${label} must begin empty`);
}

function michelsonMapValue(map: unknown, key: unknown): unknown {
  assert.ok(map instanceof MichelsonMap, "expected a MichelsonMap");
  return map.get(key);
}

function pinByName(pins: PinnedRecord[], fileName: string): PinnedRecord {
  const matches = pins.filter((pin) => pin.proof.fileName === fileName);
  assert.equal(matches.length, 1, `expected one ${fileName} pin`);
  return matches[0];
}

function validateBrowserOrigination(
  input: { code: unknown; storage: unknown },
  expectedCodeHash: string,
  creatorAddress: string,
  pins: PinnedRecord[],
): void {
  assert.equal(hashJsonForBridge(input.code), expectedCodeHash, "browser requested an unexpected Macaroni V2 artifact");
  assert.ok(input.storage && typeof input.storage === "object" && !Array.isArray(input.storage));
  const storage = input.storage as Record<string, unknown>;
  assert.equal(storage.administrator, creatorAddress);
  assert.equal(storage.treasury, creatorAddress);
  assert.equal(storage.delayed_reveal, true);
  assert.equal(storage.reveal_delay, 0);
  assert.equal(storage.placeholder_count, 1);
  for (const field of ["supply", "minted", "token_count", "reveal_cursor", "reveal_tail", "revealed"]) {
    assert.equal(safeNumber(storage[field]), 0, `${field} must begin at zero`);
  }
  assert.equal(storage.unrevealed_since, null);
  assert.equal(storage.locked, false);
  assert.equal(storage.paused, false);
  for (const key of [
    "ledger", "operators", "token_metadata", "pending_tokens", "token_supply", "token_minted", "slots",
    "stages", "allowlist", "stage_minted", "token_placeholder", "reveal_queue", "first_minter",
    "minter_pool", "minter_pool_count", "royalty_revision", "metadata_revision", "royalty_locked",
  ]) assertEmptyMichelsonMap(storage[key], key);
  assert.equal([...((storage.metadata as MichelsonMap<string, string>).entries())].length, 1);
  assert.equal(
    hexToUtf8(String(michelsonMapValue(storage.metadata, ""))),
    pinByName(pins, "contract_metadata.json").proof.uri,
  );
  assert.equal([...((storage.placeholder_pool as MichelsonMap<number, unknown>).entries())].length, 1);
  const placeholder = michelsonMapValue(storage.placeholder_pool, 0) as Record<string, unknown>;
  assert.equal(safeNumber(placeholder.token_id), 0);
  assert.equal(
    hexToUtf8(String(michelsonMapValue(placeholder.token_info, ""))),
    pinByName(pins, "placeholder-1.json").proof.uri,
  );
  assert.deepEqual(jsonSafeValue(storage.minter_royalty_config), {
    enabled: false,
    bps: 0,
    mode: 0,
    updater: creatorAddress,
  });
}

function validateV1BrowserOrigination(
  input: { code: unknown; storage: unknown },
  expectedCodeHash: string,
  creatorAddress: string,
  pins: PinnedRecord[],
): void {
  assert.equal(hashJsonForBridge(input.code), expectedCodeHash, "browser requested an unexpected Macaroni V1 artifact");
  assert.ok(input.storage && typeof input.storage === "object" && !Array.isArray(input.storage));
  const storage = input.storage as Record<string, unknown>;
  assert.equal(storage.administrator, creatorAddress);
  assert.equal(storage.treasury, creatorAddress);
  assert.equal(storage.delayed_reveal, false);
  assert.equal(storage.reveal_delay, 604800);
  assert.equal(storage.supply, 0);
  assert.equal(storage.minted, 0);
  assert.equal(storage.revealed, 0);
  assert.equal(storage.locked, false);
  assert.equal(storage.paused, false);
  assert.equal(storage.unrevealed_since, null);
  assert.equal(storage.seed_salt, "00");
  assert.equal(storage.entropy, "00");
  for (const key of [
    "ledger", "operators", "token_metadata", "pending_tokens", "slots", "stages", "allowlist", "stage_minted", "placeholder",
  ]) assertEmptyMichelsonMap(storage[key], key);
  assert.equal([...((storage.metadata as MichelsonMap<string, string>).entries())].length, 1);
  assert.equal(
    hexToUtf8(String(michelsonMapValue(storage.metadata, ""))),
    pinByName(pins, "contract_metadata.json").proof.uri,
  );
  assert.equal("token_supply" in storage, false, "V1 origination must not contain V2 edition storage");
}

function createCreatorCallValidator(pins: PinnedRecord[]) {
  const entrypoints: string[] = [];
  return {
    entrypoints,
    validate(input: { entrypoint: string; payload: unknown }): void {
      if (entrypoints.length === 0) {
        assert.equal(input.entrypoint, "add_tokens_v2");
        assert.ok(Array.isArray(input.payload));
        assert.equal(input.payload.length, 1);
        const row = input.payload[0] as Record<string, unknown>;
        assert.equal(safeNumber(row.token_id), 0);
        assert.equal(safeNumber(row.quantity), TOKEN_QUANTITY);
        assert.equal(
          hexToUtf8(String(michelsonMapValue(row.token_info, ""))),
          pinByName(pins, "1.json").proof.uri,
        );
      } else {
        assert.equal(input.entrypoint, "set_stages");
        assert.ok(input.payload instanceof MichelsonMap);
        const stage = input.payload.get(0) as Record<string, unknown>;
        assert.ok(stage);
        assert.equal(safeNumber(stage.price), MINT_PRICE_MUTEZ);
        assert.equal(safeNumber(stage.max_per_wallet), 1);
        assert.equal(stage.use_allowlist, false);
        assert.ok(new Date(String(stage.start)).getTime() < Date.now());
      }
      entrypoints.push(input.entrypoint);
    },
  };
}

function createCollectorCallValidator() {
  const entrypoints: string[] = [];
  return {
    entrypoints,
    validate(input: { entrypoint: string; payload: unknown }): void {
      assert.equal(input.entrypoint, entrypoints.length === 0 ? "mint" : "reveal");
      assert.equal(safeNumber(input.payload), 1);
      entrypoints.push(input.entrypoint);
    },
  };
}

function createV1CreatorCallValidator(pins: PinnedRecord[]) {
  const entrypoints: string[] = [];
  return {
    entrypoints,
    validate(input: { entrypoint: string; payload: unknown }): void {
      if (entrypoints.length === 0) {
        assert.equal(input.entrypoint, "add_tokens");
        assert.ok(Array.isArray(input.payload));
        assert.equal(input.payload.length, 1);
        const row = input.payload[0] as Record<string, unknown>;
        assert.equal(safeNumber(row.token_id), 0);
        assert.equal("quantity" in row, false);
        assert.equal(
          hexToUtf8(String(michelsonMapValue(row.token_info, ""))),
          pinByName(pins, "1.json").proof.uri,
        );
      } else {
        assert.equal(input.entrypoint, "set_stages");
        assert.ok(input.payload instanceof MichelsonMap);
        const stage = input.payload.get(0) as Record<string, unknown>;
        assert.ok(stage);
        assert.equal(safeNumber(stage.price), MINT_PRICE_MUTEZ);
        assert.equal(safeNumber(stage.max_per_wallet), 1);
        assert.equal(stage.use_allowlist, false);
      }
      entrypoints.push(input.entrypoint);
    },
  };
}

function inspectCollectorRequest(request: PastaUiLiveBridgeRequest): void {
  if (request.action !== "call") return;
  assert.ok(request.payload && typeof request.payload === "object" && !Array.isArray(request.payload));
  const payload = request.payload as Record<string, unknown>;
  const call = payload.call as Record<string, unknown>;
  const options = decodePastaUiLiveValue(payload.sendOptions || {}) as Record<string, unknown>;
  if (call.entrypoint === "mint") {
    assert.equal(safeNumber(options.amount), MINT_PRICE_MUTEZ);
    assert.equal(options.mutez, true);
  } else if (call.entrypoint === "reveal") {
    assert.equal(options.amount, undefined);
  }
}

async function waitForText(page: Page, selector: string, expected: string, timeout = 300_000): Promise<void> {
  await page.waitForFunction(
    ({ target, text }) => document.querySelector(target)?.textContent?.includes(text),
    { target: selector, text: expected },
    { timeout },
  );
}

type MacaroniMempoolGroup = {
  hash?: unknown;
  error?: unknown;
  errors?: unknown;
  contents?: unknown;
};

export function findMacaroniMempoolRefusal(
  pendingOperations: unknown,
  signerAddress: string,
  contractAddress: string,
): { operationHash: string; errorIds: string[] } | null {
  if (!pendingOperations || typeof pendingOperations !== "object" || Array.isArray(pendingOperations)) return null;
  const refused = (pendingOperations as Record<string, unknown>).refused;
  if (!Array.isArray(refused)) return null;
  for (const rawGroup of refused) {
    if (!rawGroup || typeof rawGroup !== "object" || Array.isArray(rawGroup)) continue;
    const group = rawGroup as MacaroniMempoolGroup;
    if (!Array.isArray(group.contents)) continue;
    const targetsThisRun = group.contents.some((rawContent) => {
      if (!rawContent || typeof rawContent !== "object" || Array.isArray(rawContent)) return false;
      const content = rawContent as Record<string, unknown>;
      return content.source === signerAddress && content.destination === contractAddress;
    });
    if (!targetsThisRun) continue;
    const rawErrors = Array.isArray(group.error) ? group.error : Array.isArray(group.errors) ? group.errors : [];
    const errorIds = rawErrors.flatMap((rawError) => {
      if (!rawError || typeof rawError !== "object" || Array.isArray(rawError)) return [];
      const id = (rawError as Record<string, unknown>).id;
      return typeof id === "string" && id ? [id] : [];
    });
    return {
      operationHash: typeof group.hash === "string" && group.hash ? group.hash : "unknown-operation",
      errorIds,
    };
  }
  return null;
}

export async function waitForMacaroniSyncOutcome(
  page: Page,
  options: {
    rpcUrl?: string;
    signerAddress?: string;
    contractAddress?: string;
    timeout?: number;
    pollInterval?: number;
  } = {},
): Promise<void> {
  const timeout = options.timeout ?? 300_000;
  const pollInterval = options.pollInterval ?? 1_500;
  const deadline = Date.now() + timeout;
  let lastMempoolReadError = "";
  while (Date.now() < deadline) {
    const ui = await page.evaluate(() => ({
      status: document.querySelector("#deployStatus")?.textContent || "",
      log: document.querySelector("#log")?.textContent || "",
    }));
    if (ui.status.includes("in sync ✓")) return;
    if (/Sync failed:/i.test(ui.status) || /sync failed:/i.test(ui.log)) {
      throw new Error(`Macaroni Studio sync failed before success: ${ui.status || ui.log.slice(-500)}`);
    }

    if (options.rpcUrl && options.signerAddress && options.contractAddress) {
      try {
        const endpoint = `${options.rpcUrl.replace(/\/+$/, "")}/chains/main/mempool/pending_operations`;
        const response = await fetch(endpoint, { headers: { accept: "application/json" } });
        if (response.ok) {
          const refusal = findMacaroniMempoolRefusal(
            await response.json(),
            options.signerAddress,
            options.contractAddress,
          );
          if (refusal) {
            const errors = refusal.errorIds.length ? refusal.errorIds.join(", ") : "unknown refusal";
            throw new Error(`Macaroni Studio sync operation ${refusal.operationHash} was refused by Shadownet: ${errors}`);
          }
        } else {
          lastMempoolReadError = `HTTP ${response.status}`;
        }
      } catch (error) {
        if (error instanceof Error && /was refused by Shadownet/.test(error.message)) throw error;
        lastMempoolReadError = error instanceof Error ? error.message : String(error);
      }
    }
    await page.waitForTimeout(Math.min(pollInterval, Math.max(1, deadline - Date.now())));
  }
  const status = await page.locator("#deployStatus").textContent().catch(() => "unavailable");
  const diagnostic = lastMempoolReadError ? `; last mempool read error: ${lastMempoolReadError}` : "";
  throw new Error(`Macaroni Studio sync timed out with status ${JSON.stringify(status)}${diagnostic}`);
}

async function waitForLog(page: Page, expected: string, timeout = 300_000): Promise<void> {
  await waitForText(page, "#log", expected, timeout);
}

export async function assertMacaroniUiDecodeSafe(page: Page): Promise<void> {
  const visibleText = await page.locator("body").innerText();
  const malformed = visibleText.match(/\bNaN\b|Invalid Date|\[object Object\]/i);
  assert.equal(
    malformed,
    null,
    `Macaroni UI exposed an undecoded Michelson value: ${malformed?.[0] || "unknown"}`,
  );
}

async function captureStudioStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
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
    outputRoot,
    app: "macaroni",
    capability,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: ".brand", name: "application", expectedText: "Macaroni" },
      { selector: "#netLabel", name: "network", expectedText: /shadownet/i },
      ...evidence,
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function captureDropStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  capability: string,
  stageName: string,
  focusSelector: string,
  title: string,
  evidence: Array<{ selector: string; name: string; expectedText: string | RegExp }>,
): Promise<CapturePastaProofStageResult> {
  await page.locator(focusSelector).scrollIntoViewIfNeeded();
  await assertMacaroniUiDecodeSafe(page);
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "macaroni",
    capability,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "#brand", name: "application", expectedText: "Macaroni" },
      { selector: "#netLabel", name: "network", expectedText: /shadownet/i },
      { selector: "#title", name: "drop title", expectedText: title },
      ...evidence,
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function openBrowser(acceptDownloads: boolean): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads,
  });
  return { browser, context, page: await context.newPage() };
}

async function installStudioRouteStubs(context: BrowserContext): Promise<void> {
  await context.route("**/api/profile/social", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await context.route("**/api/macaroni/installers", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"installers":[]}' }));
  await context.route("**/export", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":false,"error":"standalone UI-live proof uses the browser ZIP"}' }));
}

export function validateMacaroniSiteArchive(bytes: Uint8Array, expected: {
  contractAddress: string;
  finalMetadataUri: string;
  placeholderMetadataUri?: string;
  contractVersion?: "macaroni-v1" | "macaroni-editions-v2";
  revealMode?: "instant" | "delayed";
}): Record<string, Uint8Array> {
  assert.ok(bytes.byteLength > 1_000, "Macaroni site archive is unexpectedly small");
  const files = unzipSync(bytes);
  const names = Object.keys(files).sort();
  assert.deepEqual(names, [...REQUIRED_SITE_FILES].sort(), "Macaroni export contains an unexpected file set");
  for (const name of names) {
    assert.ok(!path.posix.isAbsolute(name) && !name.includes("\\") && !name.includes("\0"));
    assert.ok(!name.split("/").includes(".."), `unsafe ZIP path ${name}`);
  }
  const configText = Buffer.from(files["drop.config.js"]).toString("utf8");
  assert.ok(configText.includes(expected.contractAddress), "exported config lacks the fresh contract address");
  assert.ok(configText.includes(expected.finalMetadataUri), "exported config lacks final metadata URI");
  if (expected.placeholderMetadataUri) {
    assert.ok(configText.includes(expected.placeholderMetadataUri), "exported config lacks placeholder metadata URI");
  }
  assert.ok(configText.includes(`"contractVersion": "${expected.contractVersion || "macaroni-editions-v2"}"`));
  assert.ok(configText.includes(`"mode": "${expected.revealMode || "delayed"}"`));
  assert.doesNotMatch(configText, /(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{20,}/);
  return files;
}

async function extractSite(files: Record<string, Uint8Array>, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    const output = path.join(destination, ...name.split("/"));
    const relative = path.relative(destination, output);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `unsafe extracted path ${name}`);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes);
  }
}

function pinKind(fileName: string): string {
  if (fileName === "contract_metadata.json") return "collection-metadata";
  if (fileName === "1.json") return "token-metadata";
  if (fileName === "1.png") return "token-media";
  if (fileName === "placeholder-1.json") return "placeholder-metadata";
  if (fileName === "macaroni-placeholder.png") return "placeholder-media";
  if (fileName === "macaroni-cover.png") return "collection-cover";
  if (fileName === "macaroni-v1-cover.png") return "collection-cover";
  return "pinned-proof-artifact";
}

async function writePinnedArtifacts(
  appRoot: string,
  pins: PinnedRecord[],
  lane: "v1" | "v2",
): Promise<WrittenPinArtifact[]> {
  const output: WrittenPinArtifact[] = [];
  for (const [index, record] of pins.entries()) {
    assert.equal(record.proof.publicGatewayVerified, true);
    const bytes = record.bytes ?? deterministicJsonBytes(record.value);
    assert.equal(sha256(bytes), record.proof.sha256);
    const kind = pinKind(record.proof.fileName);
    const safeName = record.proof.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
    const relativePath = `artifacts/pins/${lane}/${String(index + 1).padStart(3, "0")}-${safeName}`;
    await mkdir(path.dirname(path.join(appRoot, relativePath)), { recursive: true });
    await writeFile(path.join(appRoot, relativePath), bytes);
    output.push({
      id: `macaroni-${lane}-pin-${String(index + 1).padStart(3, "0")}-${kind}`,
      kind,
      path: relativePath,
      sha256: record.proof.sha256,
      ipfsUri: record.proof.uri,
      gatewayUrl: record.proof.publicGatewayUrl,
      retrievedSha256: record.proof.sha256,
      fileName: record.proof.fileName,
    });
  }
  return output;
}

function numberText(value: unknown): number {
  if (value && typeof value === "object" && "int" in value) return Number((value as { int: unknown }).int);
  return safeNumber(value);
}

function exactTzktNatKey(value: unknown): number | null {
  let candidate = value;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const record = candidate as Record<string, unknown>;
    if (!("int" in record)) return null;
    candidate = record.int;
  }
  if (typeof candidate === "number") {
    return Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : null;
  }
  if (typeof candidate !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(candidate)) return null;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * TzKT retains removed big-map keys as historical rows with `active:false`.
 * Absence and literal inactive tombstones prove a consumed key; any active or
 * ambiguous matching row, or any malformed response row, fails closed.
 */
export function macaroniTzktBigMapNatKeyIsInactive(value: unknown, targetKey: number): boolean {
  if (!Number.isSafeInteger(targetKey) || targetKey < 0 || !Array.isArray(value)) return false;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const row = candidate as Record<string, unknown>;
    if (!("key" in row)) return false;
    const key = exactTzktNatKey(row.key);
    if (key == null) return false;
    if (key === targetKey && row.active !== false) return false;
  }
  return true;
}

export function isMacaroniTzktFa2Asset(value: unknown, contractAddress: string): boolean {
  const json = value as Record<string, unknown> | null;
  return json?.address === contractAddress && json?.kind === "asset" &&
    Array.isArray(json?.tzips) && json.tzips.includes("fa2");
}

type MacaroniAppliedOperationInput = {
  action: "originate" | "batch" | "call";
  operationHash: string;
  contractAddress?: string;
  entrypoints: string[];
};

export function assertMacaroniTzktOperationApplied(
  value: unknown,
  expected: MacaroniAppliedOperationInput,
): Record<string, unknown> {
  assert.ok(Array.isArray(value), `TzKT did not return operation rows for ${expected.operationHash}`);
  const rows = value.filter((candidate): candidate is Record<string, unknown> => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const row = candidate as Record<string, unknown>;
    if (row.hash !== expected.operationHash) return false;
    if (expected.contractAddress) {
      const target = row.target as Record<string, unknown> | string | null | undefined;
      const originated = row.originatedContract as Record<string, unknown> | string | null | undefined;
      const targetAddress = typeof target === "string" ? target : target?.address;
      const originatedAddress = typeof originated === "string" ? originated : originated?.address;
      if (targetAddress !== expected.contractAddress && originatedAddress !== expected.contractAddress) return false;
    }
    if (expected.entrypoints.length) {
      const parameter = row.parameter as Record<string, unknown> | null | undefined;
      if (!expected.entrypoints.includes(String(parameter?.entrypoint || ""))) return false;
    }
    return true;
  });
  assert.ok(rows.length > 0, `TzKT did not index the expected target/entrypoint for ${expected.operationHash}`);
  const rejected = rows.find((row) => row.status !== "applied");
  assert.equal(
    rejected,
    undefined,
    `TzKT indexed ${expected.operationHash} as ${String(rejected?.status || "rejected")}: ${JSON.stringify(rejected?.errors || [])}`,
  );
  return rows[0];
}

async function verifyMacaroniBridgeOperationApplied(input: MacaroniAppliedOperationInput): Promise<void> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const rows = await pollJson(
    `Macaroni operation ${input.operationHash}`,
    `${base}/operations/${encodeURIComponent(input.operationHash)}`,
    (json) => Array.isArray(json) && json.length > 0,
    { attempts: 30, delayMs: 1_000 },
  );
  assertMacaroniTzktOperationApplied(rows, input);
}

async function verifyTzktEvidence(input: {
  contractAddress: string;
  collectorAddress: string;
  finalMetadataUri: string;
  placeholderMetadataUri: string;
  finalMetadataProof: PastaUiLivePinProof;
  finalMetadataValue: unknown;
  operationReceipts: Array<PastaUiLivePublicReceipt & { operationHash: string }>;
}): Promise<unknown> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const contract = await pollJson(
    "Macaroni UI-live contract",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}`,
    (json) => isMacaroniTzktFa2Asset(json, input.contractAddress),
  );
  const storage = await pollJson(
    "Macaroni UI-live revealed storage",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}/storage`,
    (json) => Number(json?.ledger) > 0 && Number(json?.token_metadata) > 0 && Number(json?.pending_tokens) > 0 &&
      Number(json?.token_supply) > 0 && Number(json?.token_minted) > 0 && Number(json?.stage_minted) > 0 &&
      Number(json?.supply) === TOKEN_QUANTITY && Number(json?.minted) === 1 && Number(json?.token_count) === 1 &&
      Number(json?.revealed) === 1 && Number(json?.reveal_cursor) === 1 && Number(json?.reveal_tail) === 1 &&
      json?.unrevealed_since == null,
  );
  const [ledger, supplies, mintedTotals, stageMints, tokenMetadata, placeholderPool, tokens, balances, operations] = await Promise.all([
    pollJson("Macaroni UI-live collector ledger", `${base}/bigmaps/${storage.ledger}/keys?limit=100`, (json) => Array.isArray(json) && json.some((entry) => entry?.key?.owner === input.collectorAddress && numberText(entry?.key?.token_id) === 0 && numberText(entry?.value) === 1)),
    pollJson("Macaroni UI-live token supply", `${base}/bigmaps/${storage.token_supply}/keys?limit=20`, (json) => Array.isArray(json) && json.some((entry) => numberText(entry?.key) === 0 && numberText(entry?.value) === TOKEN_QUANTITY)),
    pollJson("Macaroni UI-live minted total", `${base}/bigmaps/${storage.token_minted}/keys?limit=20`, (json) => Array.isArray(json) && json.some((entry) => numberText(entry?.key) === 0 && numberText(entry?.value) === 1)),
    pollJson("Macaroni UI-live stage wallet total", `${base}/bigmaps/${storage.stage_minted}/keys?limit=100`, (json) => Array.isArray(json) && json.some((entry) => numberText(entry?.key?.stage) === 0 && entry?.key?.holder === input.collectorAddress && numberText(entry?.value) === 1)),
    pollJson("Macaroni UI-live final token metadata", `${base}/bigmaps/${storage.token_metadata}/keys?limit=20`, (json) => Array.isArray(json) && json.some((entry) => numberText(entry?.key) === 0 && hexToUtf8(String(entry?.value?.token_info?.[""] || "")) === input.finalMetadataUri)),
    pollJson("Macaroni UI-live placeholder metadata", `${base}/bigmaps/${storage.placeholder_pool}/keys?limit=20`, (json) => Array.isArray(json) && json.some((entry) => numberText(entry?.key) === 0 && hexToUtf8(String(entry?.value?.token_info?.[""] || "")) === input.placeholderMetadataUri)),
    pollJson("Macaroni UI-live indexed token", `${base}/tokens?contract=${encodeURIComponent(input.contractAddress)}&tokenId=0&limit=10`, (json) => Array.isArray(json) && json.some((entry) => entry?.contract?.address === input.contractAddress && numberText(entry?.tokenId) === 0)),
    pollJson("Macaroni UI-live indexed ownership", `${base}/tokens/balances?account=${encodeURIComponent(input.collectorAddress)}&token.contract=${encodeURIComponent(input.contractAddress)}&token.tokenId=0&balance.ne=0&limit=10`, (json) => Array.isArray(json) && json.some((entry) => entry?.account?.address === input.collectorAddress && entry?.token?.contract?.address === input.contractAddress && numberText(entry?.token?.tokenId) === 0 && numberText(entry?.balance) === 1)),
    pollJson("Macaroni UI-live applied operations", `${base}/operations/transactions?target=${encodeURIComponent(input.contractAddress)}&status=applied&limit=100`, (json) => Array.isArray(json) && input.operationReceipts.filter((receipt) => receipt.action !== "originate").every((receipt) => json.some((entry) => entry?.hash === receipt.operationHash && entry?.parameter?.entrypoint === receipt.entrypoints?.[0]))),
  ]);
  const response = await fetch(input.finalMetadataProof.publicGatewayUrl, { signal: AbortSignal.timeout(20_000) });
  assert.ok(response.ok, `final metadata gateway returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(sha256(bytes), input.finalMetadataProof.sha256);
  assertExactMacaroniMetadataJson(bytes, input.finalMetadataValue);
  return {
    contract,
    storage,
    ledger,
    supplies,
    mintedTotals,
    stageMints,
    tokenMetadata,
    placeholderPool,
    tokens,
    balances,
    operations,
    exactFinalMetadata: {
      uri: input.finalMetadataUri,
      gatewayUrl: input.finalMetadataProof.publicGatewayUrl,
      sha256: input.finalMetadataProof.sha256,
      retrievedSha256: sha256(bytes),
    },
  };
}

async function verifyV1TzktEvidence(input: {
  contractAddress: string;
  collectorAddress: string;
  finalMetadataUri: string;
  finalMetadataProof: PastaUiLivePinProof;
  finalMetadataValue: unknown;
  operationReceipts: Array<PastaUiLivePublicReceipt & { operationHash: string }>;
}): Promise<unknown> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const contract = await pollJson(
    "Macaroni V1 UI-live FA2 contract",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}`,
    (json) => isMacaroniTzktFa2Asset(json, input.contractAddress),
  );
  const storage = await pollJson(
    "Macaroni V1 UI-live minted storage",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}/storage`,
    (json) => Number(json?.ledger) > 0 && Number(json?.token_metadata) > 0 &&
      Number(json?.pending_tokens) > 0 && Number(json?.stage_minted) > 0 &&
      Number(json?.supply) === 1 && Number(json?.minted) === 1 && Number(json?.revealed) === 1 &&
      json?.locked === true && json?.delayed_reveal === false && json?.unrevealed_since == null,
  );
  const [ledger, stageMints, tokenMetadata, pendingTokens, tokens, balances, operations] = await Promise.all([
    pollJson(
      "Macaroni V1 UI-live collector ledger",
      `${base}/bigmaps/${storage.ledger}/keys?limit=100`,
      (json) => Array.isArray(json) && json.some((entry) =>
        numberText(entry?.key) === 0 && entry?.value === input.collectorAddress),
    ),
    pollJson(
      "Macaroni V1 UI-live stage wallet total",
      `${base}/bigmaps/${storage.stage_minted}/keys?limit=100`,
      (json) => Array.isArray(json) && json.some((entry) =>
        numberText(entry?.key?.stage) === 0 && entry?.key?.holder === input.collectorAddress &&
        numberText(entry?.value) === 1),
    ),
    pollJson(
      "Macaroni V1 UI-live final token metadata",
      `${base}/bigmaps/${storage.token_metadata}/keys?limit=20`,
      (json) => Array.isArray(json) && json.some((entry) =>
        numberText(entry?.key) === 0 &&
        hexToUtf8(String(entry?.value?.token_info?.[""] || "")) === input.finalMetadataUri),
    ),
    pollJson(
      "Macaroni V1 UI-live consumed pending inventory",
      `${base}/bigmaps/${storage.pending_tokens}/keys?limit=20`,
      (json) => macaroniTzktBigMapNatKeyIsInactive(json, 0),
    ),
    pollJson(
      "Macaroni V1 UI-live indexed token",
      `${base}/tokens?contract=${encodeURIComponent(input.contractAddress)}&tokenId=0&limit=10`,
      (json) => Array.isArray(json) && json.some((entry) =>
        entry?.contract?.address === input.contractAddress && numberText(entry?.tokenId) === 0),
    ),
    pollJson(
      "Macaroni V1 UI-live indexed ownership",
      `${base}/tokens/balances?account=${encodeURIComponent(input.collectorAddress)}&token.contract=${encodeURIComponent(input.contractAddress)}&token.tokenId=0&balance.ne=0&limit=10`,
      (json) => Array.isArray(json) && json.some((entry) =>
        entry?.account?.address === input.collectorAddress &&
        entry?.token?.contract?.address === input.contractAddress &&
        numberText(entry?.token?.tokenId) === 0 && numberText(entry?.balance) === 1),
    ),
    pollJson(
      "Macaroni V1 UI-live applied operations",
      `${base}/operations/transactions?target=${encodeURIComponent(input.contractAddress)}&status=applied&limit=100`,
      (json) => Array.isArray(json) && input.operationReceipts
        .filter((receipt) => receipt.action !== "originate")
        .every((receipt) => json.some((entry) =>
          entry?.hash === receipt.operationHash && entry?.parameter?.entrypoint === receipt.entrypoints?.[0])),
    ),
  ]);
  const response = await fetch(input.finalMetadataProof.publicGatewayUrl, { signal: AbortSignal.timeout(20_000) });
  assert.ok(response.ok, `V1 final metadata gateway returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(sha256(bytes), input.finalMetadataProof.sha256);
  assertExactMacaroniMetadataJson(bytes, input.finalMetadataValue);
  return {
    contract,
    storage,
    ledger,
    stageMints,
    tokenMetadata,
    pendingTokens,
    tokens,
    balances,
    operations,
    exactFinalMetadata: {
      uri: input.finalMetadataUri,
      gatewayUrl: input.finalMetadataProof.publicGatewayUrl,
      sha256: input.finalMetadataProof.sha256,
      retrievedSha256: sha256(bytes),
    },
  };
}

function operationReceipts(
  creatorReceipts: PastaUiLivePublicReceipt[],
  collectorReceipts: PastaUiLivePublicReceipt[],
  creator: string,
  collector: string,
): { contractAddress: string; receipts: Array<PastaUiLivePublicReceipt & { operationHash: string }> } {
  const creatorOperations = creatorReceipts.filter((receipt): receipt is PastaUiLivePublicReceipt & { operationHash: string } => Boolean(receipt.operationHash));
  const collectorOperations = collectorReceipts.filter((receipt): receipt is PastaUiLivePublicReceipt & { operationHash: string } => Boolean(receipt.operationHash));
  assert.equal(creatorOperations.length, 3, "Studio must originate, load tokens, and configure stages exactly once");
  assert.equal(collectorOperations.length, 2, "exported page must mint and reveal exactly once");
  assert.deepEqual(creatorOperations.map((receipt) => receipt.entrypoints || []), [[], ["add_tokens_v2"], ["set_stages"]]);
  assert.deepEqual(collectorOperations.map((receipt) => receipt.entrypoints), [["mint"], ["reveal"]]);
  const contractAddress = creatorOperations[0].contractAddress || "";
  assert.equal(validateContractAddress(contractAddress), ValidationResult.VALID);
  for (const receipt of creatorOperations) {
    assert.equal(receipt.signerAddress, creator);
    assert.equal(receipt.contractAddress, contractAddress);
  }
  for (const receipt of collectorOperations) {
    assert.equal(receipt.signerAddress, collector);
    assert.equal(receipt.contractAddress, contractAddress);
  }
  const receipts = [...creatorOperations, ...collectorOperations];
  for (const receipt of receipts) assert.equal(validateOperation(receipt.operationHash), ValidationResult.VALID);
  return { contractAddress, receipts };
}

function v1OperationReceipts(
  creatorReceipts: PastaUiLivePublicReceipt[],
  collectorReceipts: PastaUiLivePublicReceipt[],
  creator: string,
  collector: string,
): { contractAddress: string; receipts: Array<PastaUiLivePublicReceipt & { operationHash: string }> } {
  const creatorOperations = creatorReceipts.filter(
    (receipt): receipt is PastaUiLivePublicReceipt & { operationHash: string } => Boolean(receipt.operationHash),
  );
  const collectorOperations = collectorReceipts.filter(
    (receipt): receipt is PastaUiLivePublicReceipt & { operationHash: string } => Boolean(receipt.operationHash),
  );
  assert.equal(creatorOperations.length, 3, "V1 Studio must originate, load a token, and configure stages exactly once");
  assert.equal(collectorOperations.length, 1, "V1 exported page must submit exactly one instant mint");
  assert.deepEqual(creatorOperations.map((receipt) => receipt.entrypoints || []), [[], ["add_tokens"], ["set_stages"]]);
  assert.deepEqual(collectorOperations.map((receipt) => receipt.entrypoints), [["mint"]]);
  const contractAddress = creatorOperations[0].contractAddress || "";
  assert.equal(validateContractAddress(contractAddress), ValidationResult.VALID);
  for (const receipt of creatorOperations) {
    assert.equal(receipt.signerAddress, creator);
    assert.equal(receipt.contractAddress, contractAddress);
  }
  for (const receipt of collectorOperations) {
    assert.equal(receipt.signerAddress, collector);
    assert.equal(receipt.contractAddress, contractAddress);
  }
  const receipts = [...creatorOperations, ...collectorOperations];
  for (const receipt of receipts) assert.equal(validateOperation(receipt.operationHash), ValidationResult.VALID);
  return { contractAddress, receipts };
}

function pinArtifactId(artifacts: WrittenPinArtifact[], fileName: string): string {
  const matches = artifacts.filter((artifact) => artifact.fileName === fileName);
  assert.equal(matches.length, 1, `expected one written ${fileName} artifact`);
  return matches[0].id;
}

type MacaroniV1LaneResult = {
  contractAddress: string;
  operations: Array<Record<string, unknown> & { hash: string }>;
  token: Record<string, unknown> & {
    id: string;
    metadataArtifactId: string;
    mediaArtifactId: string;
    explorerUrl: string;
  };
  writtenPins: WrittenPinArtifact[];
  captures: CapturePastaProofStageResult[];
  creatorReceipts: PastaUiLivePublicReceipt[];
  collectorReceipts: PastaUiLivePublicReceipt[];
  funding: { creator: unknown; collector: unknown };
  canonicalArtifactTransport: Record<string, unknown>;
  drop: Record<string, unknown>;
  selfHostedSite: Record<string, unknown>;
  tzktEvidence: { path: string; sha256: string };
  localArtifacts: Array<Record<string, unknown> & { id: string }>;
  finalMetadataPin: PinnedRecord;
  finalMediaPin: PinnedRecord;
};

async function runMacaroniV1UiLane(input: {
  appRoot: string;
  runRoot: string;
  runId: string;
  rpcUrl: string;
  ipfs: IpfsProofConfig;
  creatorTezos: TezosToolkit;
  collectorTezos: TezosToolkit;
  creatorAddress: string;
  collectorAddress: string;
  creatorBalanceMutez: number;
  collectorBalanceMutez: number;
  requiredCreatorBalanceMutez: number;
  requiredCollectorBalanceMutez: number;
  estimatedOriginationMutez: number;
  code: unknown[];
}): Promise<MacaroniV1LaneResult> {
  const {
    appRoot,
    runRoot,
    runId,
    rpcUrl,
    ipfs,
    creatorTezos,
    collectorTezos,
    creatorAddress,
    collectorAddress,
    creatorBalanceMutez,
    collectorBalanceMutez,
    requiredCreatorBalanceMutez,
    requiredCollectorBalanceMutez,
    estimatedOriginationMutez,
    code,
  } = input;
  const pins: PinnedRecord[] = [];
  const captures: CapturePastaProofStageResult[] = [];
  const expectedCodeHash = hashJsonForBridge(code);
  const creatorValidator = createV1CreatorCallValidator(pins);
  let creatorProjection: Record<string, unknown> = {};
  let creatorContractAddress = "";
  const creatorBootstrapSession = new TaquitoPastaUiLiveSession({
    tezos: creatorTezos,
    signerAddress: creatorAddress,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedEntrypoints: new Set<string>(),
    assertExpectedChain: async (stage) => {
      await assertShadownet(creatorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
    assertOperationApplied: verifyMacaroniBridgeOperationApplied,
    projectStorage: () => creatorProjection,
    onPin: ({ value, bytes, proof }) => {
      pins.push({
        actor: "creator",
        value,
        bytes: bytes ? Uint8Array.from(bytes) : undefined,
        proof,
      });
    },
  });
  creatorBootstrapSession.authorizeAfterFundingPreflight({
    balanceMutez: creatorBalanceMutez,
    requiredBalanceMutez: requiredCreatorBalanceMutez,
    estimatedOriginationMutez,
    operationReserveMutez: CREATOR_OPERATION_RESERVE_MUTEZ,
  });
  let creatorContractSession: TaquitoPastaUiLiveSession | null = null;
  let manualOriginationReceipt: (PastaUiLivePublicReceipt & { operationHash: string }) | null = null;
  const creatorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: async (request) => {
      if (request.action !== "originate") {
        return (creatorContractSession || creatorBootstrapSession).handle(request);
      }
      assert.equal(creatorContractSession, null, "Macaroni V1 proof permits one fresh origination only");
      const { storage } = decodeMacaroniCanonicalOriginationRequest(request, expectedCodeHash);
      validateV1BrowserOrigination({ code, storage }, expectedCodeHash, creatorAddress, pins);
      await assertShadownet(creatorTezos, "before canonical Macaroni V1 UI-live origination");
      const liveBalance = Number((await creatorTezos.tz.getBalance(creatorAddress)).toString());
      assert.ok(Number.isSafeInteger(liveBalance) && liveBalance >= 50_000, "V1 creator balance fell below the per-action safety floor");
      const operation = await creatorTezos.contract.originate({ code, storage } as never);
      await operation.confirmation(1);
      const originated = await operation.contract();
      creatorContractAddress = originated.address;
      await verifyMacaroniBridgeOperationApplied({
        action: "originate",
        operationHash: operation.hash,
        contractAddress: creatorContractAddress,
        entrypoints: [],
      });
      manualOriginationReceipt = {
        schema: "pastaprotocol-ui-live-receipt@1",
        sequence: creatorBootstrapSession.getReceipts().length + 1,
        timestampUtc: new Date().toISOString(),
        action: "originate",
        chainId: SHADOWNET_CHAIN_ID,
        signerAddress: creatorAddress,
        contractAddress: creatorContractAddress,
        operationHash: operation.hash,
      };
      creatorProjection = await readMacaroniV1BrowserProjection(creatorTezos, creatorContractAddress, creatorAddress);
      creatorContractSession = new TaquitoPastaUiLiveSession({
        tezos: creatorTezos,
        signerAddress: creatorAddress,
        expectedChainId: SHADOWNET_CHAIN_ID,
        allowedContractAddresses: new Set([creatorContractAddress]),
        allowedEntrypoints: new Set(["add_tokens", "set_stages"]),
        assertExpectedChain: async (stage) => {
          await assertShadownet(creatorTezos, stage);
          return SHADOWNET_CHAIN_ID;
        },
        pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
        validateCall: (call) => creatorValidator.validate(call),
        assertOperationApplied: verifyMacaroniBridgeOperationApplied,
        projectStorage: async () => {
          creatorProjection = await readMacaroniV1BrowserProjection(
            creatorTezos,
            creatorContractAddress,
            creatorAddress,
          );
          return creatorProjection;
        },
        onReceipt: async (receipt) => {
          if (receipt.operationHash) {
            creatorProjection = await readMacaroniV1BrowserProjection(creatorTezos, creatorContractAddress, creatorAddress);
          }
        },
      });
      creatorContractSession.authorizeAfterFundingPreflight({
        balanceMutez: liveBalance,
        requiredBalanceMutez: 1,
        estimatedOriginationMutez: 0,
        operationReserveMutez: CREATOR_OPERATION_RESERVE_MUTEZ,
      });
      return {
        contractAddress: creatorContractAddress,
        operationHash: operation.hash,
        confirmationLevel: 1,
        receipt: manualOriginationReceipt,
      };
    },
  });
  const dropTitle = `Macaroni V1 UI-LIVE ${runId}`;
  let creatorBrowser: Browser | null = null;
  let creatorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  let exportZipBytes = new Uint8Array();
  let extractedSiteRoot = "";
  try {
    const opened = await openBrowser(true);
    creatorBrowser = opened.browser;
    await installStudioRouteStubs(opened.context);
    creatorMonitor = monitorPastaProofPage(opened.page);
    await opened.page.goto(`${creatorBridge.origin}/creation-tools/macaroni/studio.html`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await opened.page.waitForFunction(() => Boolean(
      (window as any).MD && (window as any).TZ?.MichelsonMap && (window as any).MDSiteBundle,
    ));
    await installPastaUiLiveBrowserProxy(opened.page, creatorBridge, "UI-LIVE");
    await installMacaroniBrowserAdapters(opened.page, ipfs.publicGatewayUrl, expectedCodeHash);
    await opened.page.click("#btnConnect");
    await waitForLog(opened.page, `wallet connected: ${creatorAddress}`);
    await configureMacaroniV1Studio(opened.page, ipfs.apiUrl, runId, ipfs.publicGatewayUrl);
    captures.push(await captureStudioStage(
      opened.page,
      creatorMonitor,
      runRoot,
      9,
      "configure classic blind drop",
      "V1 instant reveal drop configured",
      "#secStages",
      [
        { selector: "#log", name: "creator wallet", expectedText: `wallet connected: ${creatorAddress}` },
        { selector: "#contractVersion", name: "contract version", expectedText: "Macaroni V1" },
        { selector: "#tokenSummary", name: "token inventory", expectedText: "1 edition" },
        { selector: '[data-stage-status="0"]', name: "stage", expectedText: "stage saved" },
      ],
    ));

    await opened.page.click("#btnPin");
    await waitForText(opened.page, "#pinStatus", "all pinned ✓");
    assert.equal(pins.length, 3, "V1 Studio must pin cover, final art, and final metadata before deploy");
    assert.deepEqual(pins.map((pin) => pin.proof.fileName), ["macaroni-v1-cover.png", "1.png", "1.json"]);
    captures.push(await captureStudioStage(
      opened.page,
      creatorMonitor,
      runRoot,
      10,
      "pin V1 media and metadata",
      "Three exact V1 artifacts pinned through Studio",
      "#secIpfs",
      [
        { selector: "#pinStatus", name: "pin result", expectedText: "all pinned ✓" },
        { selector: "#log", name: "pin count", expectedText: "pinning complete: 1 tokens" },
      ],
    ));

    await opened.page.click("#btnDeploy");
    await waitForText(opened.page, "#deployStatus", "deployed ✓");
    await opened.page.waitForFunction(() => /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(
      (document.getElementById("contractAddr") as HTMLInputElement)?.value || "",
    ));
    assert.equal(pins.length, 4, "V1 deploy must add exact contract metadata pin");
    captures.push(await captureStudioStage(
      opened.page,
      creatorMonitor,
      runRoot,
      11,
      "originate V1 contract",
      "Fresh Macaroni V1 contract originated",
      "#secDeploy",
      [
        { selector: "#deployStatus", name: "deployment", expectedText: "deployed ✓" },
        { selector: "#log", name: "fresh contract", expectedText: creatorContractAddress },
      ],
    ));

    await opened.page.click("#btnSync");
    await waitForMacaroniSyncOutcome(opened.page, {
      rpcUrl,
      signerAddress: creatorAddress,
      contractAddress: creatorContractAddress,
    });
    assert.deepEqual(creatorValidator.entrypoints, ["add_tokens", "set_stages"]);
    captures.push(await captureStudioStage(
      opened.page,
      creatorMonitor,
      runRoot,
      12,
      "sync V1 contract",
      "V1 token inventory and sale stage synchronized on-chain",
      "#secDeploy",
      [
        { selector: "#deployStatus", name: "sync", expectedText: "in sync ✓" },
        { selector: "#log", name: "live drop", expectedText: "drop is live on-chain" },
      ],
    ));
    const finalMetadataUri = pinByName(pins, "1.json").proof.uri;
    await opened.page.click("#tabPage");
    await opened.page.waitForSelector("#viewPage", { state: "visible" });
    const downloadPromise = opened.page.waitForEvent("download");
    await opened.page.click("#btnExport");
    const download = await downloadPromise;
    const exportZipPath = path.join(appRoot, "artifacts", "macaroni-v1-site.zip");
    await download.saveAs(exportZipPath);
    await waitForText(opened.page, "#exportStatus", "Downloaded macaroni-site.zip");
    exportZipBytes = await readFile(exportZipPath);
    const files = validateMacaroniSiteArchive(exportZipBytes, {
      contractAddress: creatorContractAddress,
      finalMetadataUri,
      contractVersion: "macaroni-v1",
      revealMode: "instant",
    });
    extractedSiteRoot = path.join(appRoot, "artifacts", "self-hosted-v1-site");
    await extractSite(files, extractedSiteRoot);
    captures.push(await captureStudioStage(
      opened.page,
      creatorMonitor,
      runRoot,
      13,
      "export V1 site",
      "V1 standalone collector website exported from Page Designer",
      "#exportStatus",
      [
        { selector: "#btnExport", name: "export action", expectedText: "Export website" },
        { selector: "#exportStatus", name: "site package", expectedText: "Downloaded macaroni-site.zip" },
      ],
    ));
  } finally {
    creatorMonitor?.dispose();
    await creatorBrowser?.close();
    await creatorBridge.close();
  }

  assert.equal(validateContractAddress(creatorContractAddress), ValidationResult.VALID);
  const finalMetadataPin = pinByName(pins, "1.json");
  const finalMediaPin = pinByName(pins, "1.png");
  let collectorProjection = await readMacaroniV1BrowserProjection(
    collectorTezos,
    creatorContractAddress,
    collectorAddress,
  );
  const collectorSession = new TaquitoPastaUiLiveSession({
    tezos: collectorTezos,
    signerAddress: collectorAddress,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([creatorContractAddress]),
    allowedEntrypoints: new Set(["mint"]),
    assertExpectedChain: async (stage) => {
      await assertShadownet(collectorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    validateCall: ({ entrypoint, payload }) => {
      assert.equal(entrypoint, "mint");
      assert.equal(safeNumber(payload), 1);
    },
    assertOperationApplied: verifyMacaroniBridgeOperationApplied,
    projectStorage: async () => {
      collectorProjection = await readMacaroniV1BrowserProjection(
        collectorTezos,
        creatorContractAddress,
        collectorAddress,
      );
      return collectorProjection;
    },
    onReceipt: async (receipt) => {
      if (receipt.operationHash) {
        collectorProjection = await readMacaroniV1BrowserProjection(
          collectorTezos,
          creatorContractAddress,
          collectorAddress,
        );
      }
    },
  });
  collectorSession.authorizeAfterFundingPreflight({
    balanceMutez: collectorBalanceMutez,
    requiredBalanceMutez: requiredCollectorBalanceMutez,
    estimatedOriginationMutez: 0,
    operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
  });
  const collectorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: extractedSiteRoot,
    handleAction: async (request) => {
      inspectCollectorRequest(request);
      return collectorSession.handle(request);
    },
  });
  let collectorBrowser: Browser | null = null;
  let collectorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  let soldOutChainRejection = "";
  try {
    const opened = await openBrowser(false);
    collectorBrowser = opened.browser;
    collectorMonitor = monitorPastaProofPage(opened.page);
    await opened.page.goto(`${collectorBridge.origin}/index.html`, { waitUntil: "networkidle", timeout: 30_000 });
    await opened.page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(opened.page, collectorBridge, "UI-LIVE");
    await installMacaroniBrowserAdapters(opened.page, ipfs.publicGatewayUrl);
    await opened.page.evaluate(() => (window as any).refresh());
    await waitForText(opened.page, "#supplyText", "0 / 1 minted");
    await opened.page.click("#btnConnect");
    await waitForText(opened.page, "#walletLimitStatus", "0/1");
    captures.push(await captureDropStage(
      opened.page,
      collectorMonitor,
      runRoot,
      14,
      "operate exported V1 collector page",
      "Independent collector opened exported V1 website",
      "#mintPanel",
      dropTitle,
      [
        { selector: "#supplyText", name: "unminted supply", expectedText: "0 / 1 minted" },
        { selector: "#stageInfo", name: "live stage", expectedText: "Mint is Live" },
        { selector: "#walletLimitStatus", name: "wallet allowance", expectedText: "0/1" },
      ],
    ));
    await opened.page.click("#btnMint");
    await waitForText(opened.page, "#mintStatus", "minted ✓ (check your wallet)");
    await opened.page.evaluate(async () => {
      await (window as any).refresh();
      await (window as any).loadOwnedMints();
    });
    await opened.page.waitForFunction(() => {
      const card = document.querySelector('#revealGrid [data-token-id="0"]');
      return Boolean(card && !card.classList.contains("sealed") && card.textContent?.includes("Macaroni V1 Proof"));
    });
    await waitForText(opened.page, "#supplyText", "1 / 1 minted");
    await waitForText(opened.page, "#stageInfo", "Sold out");
    assert.equal(await opened.page.locator("#btnMint").isDisabled(), true, "V1 sold-out policy must disable a second mint");
    assert.equal(await opened.page.locator("#btnReveal").isVisible(), false, "instant V1 mint must not expose a reveal operation");
    captures.push(await captureDropStage(
      opened.page,
      collectorMonitor,
      runRoot,
      15,
      "mint V1 token from exported page",
      "Independent collector minted exact V1 artwork instantly",
      "#mintPanel",
      dropTitle,
      [
        { selector: "#supplyText", name: "sold out supply", expectedText: "1 / 1 minted" },
        { selector: "#mintStatus", name: "mint result", expectedText: "minted ✓ (check your wallet)" },
        { selector: "#stageInfo", name: "supply boundary", expectedText: "Sold out" },
        { selector: '#revealGrid [data-token-id="0"]', name: "final metadata", expectedText: "Macaroni V1 Proof" },
      ],
    ));

    await assertShadownet(collectorTezos, "before Macaroni V1 wallet-limit boundary");
    try {
      const contract = await collectorTezos.contract.at(creatorContractAddress);
      await contract.methodsObject.mint(1).send({ amount: MINT_PRICE_MUTEZ, mutez: true });
      assert.fail("collector unexpectedly minted past Macaroni V1 sold-out supply");
    } catch (error) {
      soldOutChainRejection = errorText(error);
      assert.match(soldOutChainRejection, /SOLD_OUT/, "V1 chain boundary did not reject at SOLD_OUT");
    }
  } finally {
    collectorMonitor?.dispose();
    await collectorBrowser?.close();
    await collectorBridge.close();
  }

  assert.ok(manualOriginationReceipt, "Macaroni V1 Studio did not produce its canonical origination receipt");
  const finalizedCreatorContractSession = creatorContractSession as TaquitoPastaUiLiveSession | null;
  assert.ok(finalizedCreatorContractSession, "Macaroni V1 Studio did not initialize its contract session");
  const creatorReceipts = [
    ...creatorBootstrapSession.getReceipts(),
    manualOriginationReceipt,
    ...finalizedCreatorContractSession.getReceipts(),
  ];
  const collectorReceipts = collectorSession.getReceipts();
  const operationEvidence = v1OperationReceipts(
    creatorReceipts,
    collectorReceipts,
    creatorAddress,
    collectorAddress,
  );
  assert.equal(operationEvidence.contractAddress, creatorContractAddress);
  const tzkt = await verifyV1TzktEvidence({
    contractAddress: creatorContractAddress,
    collectorAddress,
    finalMetadataUri: finalMetadataPin.proof.uri,
    finalMetadataProof: finalMetadataPin.proof,
    finalMetadataValue: finalMetadataPin.value,
    operationReceipts: operationEvidence.receipts,
  });
  const writtenPins = await writePinnedArtifacts(appRoot, pins, "v1");
  const tzktBytes = deterministicJsonBytes(tzkt);
  const tzktRelativePath = "artifacts/macaroni-v1-ui-live-tzkt-index.json";
  await writeFile(path.join(appRoot, tzktRelativePath), tzktBytes);
  const zipPath = path.join(appRoot, "artifacts", "macaroni-v1-site.zip");
  assert.equal(sha256(await readFile(zipPath)), sha256(exportZipBytes));
  const configBytes = await readFile(path.join(extractedSiteRoot, "drop.config.js"));
  await rm(extractedSiteRoot, { recursive: true, force: true });
  await mkdir(extractedSiteRoot, { recursive: true });
  await writeFile(path.join(extractedSiteRoot, "drop.config.js"), configBytes);
  const operations = operationEvidence.receipts.map((receipt) => {
    const entrypoint = receipt.entrypoints?.[0] || null;
    const kind = receipt.action === "originate"
      ? "origination"
      : entrypoint === "add_tokens"
        ? "publish"
        : entrypoint === "set_stages"
          ? "configure"
          : "mint";
    return {
      kind,
      hash: receipt.operationHash,
      contractAddress: creatorContractAddress,
      ...(entrypoint ? { entrypoint } : {}),
      status: "applied",
      explorerUrl: `https://shadownet.tzkt.io/${receipt.operationHash}`,
    };
  });
  const token = {
    id: "macaroni-v1-token-0",
    contractAddress: creatorContractAddress,
    tokenId: "0",
    explorerUrl: `https://shadownet.tzkt.io/${creatorContractAddress}/tokens/0`,
    metadataArtifactId: pinArtifactId(writtenPins, "1.json"),
    mediaArtifactId: pinArtifactId(writtenPins, "1.png"),
    metadataUri: finalMetadataPin.proof.uri,
    artifactUri: finalMediaPin.proof.uri,
  };
  const localArtifacts = [
    {
      id: "macaroni-v1-ui-live-tzkt-index",
      kind: "indexer-evidence",
      path: tzktRelativePath,
      sha256: sha256(tzktBytes),
    },
    {
      id: "macaroni-v1-self-hosted-site",
      kind: "self-hosted-site",
      path: "artifacts/macaroni-v1-site.zip",
      sha256: sha256(exportZipBytes),
    },
    {
      id: "macaroni-v1-drop-config",
      kind: "drop-config",
      path: "artifacts/self-hosted-v1-site/drop.config.js",
      sha256: sha256(configBytes),
    },
  ];
  return {
    contractAddress: creatorContractAddress,
    operations,
    token,
    writtenPins,
    captures,
    creatorReceipts,
    collectorReceipts,
    funding: {
      creator: creatorBootstrapSession.getFundingAuthorization(),
      collector: collectorSession.getFundingAuthorization(),
    },
    canonicalArtifactTransport: {
      browserLoadedSha256: expectedCodeHash,
      nodeOriginatedSha256: hashJsonForBridge(code),
      exactHashMatch: expectedCodeHash === hashJsonForBridge(code),
      reason: "The browser hashes the exact V1 artifact loaded by Studio; Node originates only matching canonical local bytes.",
    },
    drop: {
      tokenRows: 1,
      declaredSupply: 1,
      minted: 1,
      instantFinalMetadata: true,
      delayedReveal: false,
      priceMutez: MINT_PRICE_MUTEZ,
      maxPerWallet: 1,
      soldOutUiSubmissionPrevented: true,
      soldOutChainRejected: true,
      soldOutFailureMarker: "SOLD_OUT",
      soldOutErrorSha256: sha256(Buffer.from(soldOutChainRejection, "utf8")),
    },
    selfHostedSite: {
      zipPath: "artifacts/macaroni-v1-site.zip",
      zipSha256: sha256(exportZipBytes),
      configPath: "artifacts/self-hosted-v1-site/drop.config.js",
      configSha256: sha256(configBytes),
      requiredFiles: REQUIRED_SITE_FILES,
    },
    tzktEvidence: { path: tzktRelativePath, sha256: sha256(tzktBytes) },
    localArtifacts,
    finalMetadataPin,
    finalMediaPin,
  };
}

export async function runMacaroniUiLive(): Promise<MacaroniUiLiveResult> {
  assertMacaroniUiLiveExecutionAllowed(process.env);
  const runRoot = path.resolve(process.env[OUTPUT_ENV] || "");
  const { appRoot, runId } = await requireFreshAppOutputDirectory(runRoot);
  const ipfs: IpfsProofConfig = resolveIpfsProofConfig();
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const env = await signerEnv(rpc.rpcUrl);
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(env);
  assert.notEqual(creator.address, collector.address, "Macaroni creator and collector must be independent wallets");
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "Macaroni creator UI-live startup"),
    assertShadownet(collectorTezos, "Macaroni collector UI-live startup"),
  ]);
  const code = await readContractArtifact();
  const v1Code = await readContractArtifact(V1_CONTRACT_ARTIFACT_PATH);
  const provisionalUri = "ipfs://bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
  const [creatorBalanceValue, collectorBalanceValue] = await Promise.all([
    creatorTezos.tz.getBalance(creator.address),
    collectorTezos.tz.getBalance(collector.address),
  ]);
  const creatorBalanceMutez = Number(creatorBalanceValue.toString());
  const collectorBalanceMutez = Number(collectorBalanceValue.toString());
  let estimatedOriginationMutez: number;
  let estimatedV1OriginationMutez: number;
  try {
    const [v2Estimate, v1Estimate] = await Promise.all([
      creatorTezos.estimate.originate({
        code,
        storage: buildOriginationStorage({
          administrator: creator.address,
          collectionMetadataUri: provisionalUri,
          placeholderMetadataUri: provisionalUri,
        }),
      } as never),
      creatorTezos.estimate.originate({
        code: v1Code,
        storage: buildV1OriginationStorage({
          administrator: creator.address,
          collectionMetadataUri: provisionalUri,
        }),
      } as never),
    ]);
    estimatedOriginationMutez = Number(v2Estimate.suggestedFeeMutez) + Number(v2Estimate.burnFeeMutez);
    estimatedV1OriginationMutez = Number(v1Estimate.suggestedFeeMutez) + Number(v1Estimate.burnFeeMutez);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/tez\.subtraction_underflow|balance.*underflow|insufficient.*balance/i.test(message)) {
      block("Macaroni creator cannot fund the no-write origination simulation", [
        `Creator \`${creator.address}\` has \`${creatorBalanceValue.toString()}\` mutez.`,
        "The RPC rejected the estimate for insufficient balance; no directory, IPFS pin, or chain write was created.",
      ]);
    }
    throw error;
  }
  const requiredCreatorBalanceMutez = estimatedOriginationMutez + estimatedV1OriginationMutez +
    2 * CREATOR_OPERATION_RESERVE_MUTEZ;
  const requiredCollectorBalanceMutez = 2 * MINT_PRICE_MUTEZ + 2 * COLLECTOR_OPERATION_RESERVE_MUTEZ;
  if (!Number.isSafeInteger(creatorBalanceMutez) || creatorBalanceMutez < requiredCreatorBalanceMutez) {
    block("Macaroni UI-live creator is underfunded before any pin or chain write", [
      `Creator \`${creator.address}\` has \`${creatorBalanceValue.toString()}\` mutez.`,
      `Both estimated originations plus both creator-operation reserves require at least \`${requiredCreatorBalanceMutez}\` mutez.`,
      "No proof directory, artifact, metadata pin, or chain write was created.",
    ]);
  }
  if (!Number.isSafeInteger(collectorBalanceMutez) || collectorBalanceMutez < requiredCollectorBalanceMutez) {
    block("Macaroni UI-live collector is underfunded before any pin or chain write", [
      `Collector \`${collector.address}\` has \`${collectorBalanceValue.toString()}\` mutez.`,
      `Both mint prices plus both collector-operation reserves require at least \`${requiredCollectorBalanceMutez}\` mutez.`,
      "No proof directory, artifact, metadata pin, or chain write was created.",
    ]);
  }

  await mkdir(path.join(appRoot, "artifacts", "pins"), { recursive: true });
  const pins: PinnedRecord[] = [];
  const screenshots: CapturePastaProofStageResult[] = [];
  const expectedCodeHash = hashJsonForBridge(code);
  const creatorValidator = createCreatorCallValidator(pins);
  let creatorProjection: MacaroniBrowserProjection | Record<string, unknown> = {};
  let creatorContractAddress = "";
  const creatorBootstrapSession = new TaquitoPastaUiLiveSession({
    tezos: creatorTezos,
    signerAddress: creator.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedEntrypoints: new Set<string>(),
    assertExpectedChain: async (stage) => {
      await assertShadownet(creatorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
    assertOperationApplied: verifyMacaroniBridgeOperationApplied,
    projectStorage: () => creatorProjection,
    onPin: ({ value, bytes, proof }) => {
      pins.push({ actor: "creator", value, bytes: bytes ? Uint8Array.from(bytes) : undefined, proof });
    },
  });
  creatorBootstrapSession.authorizeAfterFundingPreflight({
    balanceMutez: creatorBalanceMutez,
    requiredBalanceMutez: requiredCreatorBalanceMutez,
    estimatedOriginationMutez,
    operationReserveMutez: CREATOR_OPERATION_RESERVE_MUTEZ,
  });
  let creatorContractSession: TaquitoPastaUiLiveSession | null = null;
  let manualOriginationReceipt: (PastaUiLivePublicReceipt & { operationHash: string }) | null = null;
  const creatorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: async (request) => {
      if (request.action !== "originate") {
        return (creatorContractSession || creatorBootstrapSession).handle(request);
      }
      assert.equal(creatorContractSession, null, "Macaroni UI-live proof permits one fresh origination only");
      const { storage } = decodeMacaroniCanonicalOriginationRequest(request, expectedCodeHash);
      validateBrowserOrigination({ code, storage }, expectedCodeHash, creator.address, pins);
      await assertShadownet(creatorTezos, "before canonical Macaroni UI-live origination");
      const liveBalance = Number((await creatorTezos.tz.getBalance(creator.address)).toString());
      assert.ok(Number.isSafeInteger(liveBalance) && liveBalance >= 50_000, "creator balance fell below the per-action safety floor");
      const operation = await creatorTezos.contract.originate({ code, storage } as never);
      await operation.confirmation(1);
      const originated = await operation.contract();
      creatorContractAddress = originated.address;
      await verifyMacaroniBridgeOperationApplied({
        action: "originate",
        operationHash: operation.hash,
        contractAddress: creatorContractAddress,
        entrypoints: [],
      });
      manualOriginationReceipt = {
        schema: "pastaprotocol-ui-live-receipt@1",
        sequence: creatorBootstrapSession.getReceipts().length + 1,
        timestampUtc: new Date().toISOString(),
        action: "originate",
        chainId: SHADOWNET_CHAIN_ID,
        signerAddress: creator.address,
        contractAddress: creatorContractAddress,
        operationHash: operation.hash,
      };
      creatorProjection = await readMacaroniBrowserProjection(creatorTezos, creatorContractAddress, creator.address);
      creatorContractSession = new TaquitoPastaUiLiveSession({
        tezos: creatorTezos,
        signerAddress: creator.address,
        expectedChainId: SHADOWNET_CHAIN_ID,
        allowedContractAddresses: new Set([creatorContractAddress]),
        allowedEntrypoints: new Set(["add_tokens_v2", "set_stages"]),
        assertExpectedChain: async (stage) => {
          await assertShadownet(creatorTezos, stage);
          return SHADOWNET_CHAIN_ID;
        },
        pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
        validateCall: (input) => creatorValidator.validate(input),
        assertOperationApplied: verifyMacaroniBridgeOperationApplied,
        projectStorage: async () => {
          creatorProjection = await readMacaroniBrowserProjection(
            creatorTezos,
            creatorContractAddress,
            creator.address,
          );
          return creatorProjection;
        },
        onReceipt: async (receipt) => {
          if (receipt.operationHash) {
            creatorProjection = await readMacaroniBrowserProjection(creatorTezos, creatorContractAddress, creator.address);
          }
        },
      });
      creatorContractSession.authorizeAfterFundingPreflight({
        balanceMutez: liveBalance,
        requiredBalanceMutez: 1,
        estimatedOriginationMutez: 0,
        operationReserveMutez: CREATOR_OPERATION_RESERVE_MUTEZ,
      });
      return {
        contractAddress: creatorContractAddress,
        operationHash: operation.hash,
        confirmationLevel: 1,
        receipt: manualOriginationReceipt,
      };
    },
  });
  const startedAt = new Date().toISOString();
  const dropTitle = `Macaroni UI-LIVE ${runId}`;
  let creatorBrowser: Browser | null = null;
  let creatorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  let exportZipBytes = new Uint8Array();
  let extractedSiteRoot = "";
  try {
    const opened = await openBrowser(true);
    creatorBrowser = opened.browser;
    await installStudioRouteStubs(opened.context);
    creatorMonitor = monitorPastaProofPage(opened.page);
    await opened.page.goto(`${creatorBridge.origin}/creation-tools/macaroni/studio.html`, { waitUntil: "networkidle", timeout: 30_000 });
    await opened.page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap && (window as any).MDSiteBundle));
    await installPastaUiLiveBrowserProxy(opened.page, creatorBridge, "UI-LIVE");
    await installMacaroniBrowserAdapters(opened.page, ipfs.publicGatewayUrl, expectedCodeHash);
    await opened.page.click("#btnConnect");
    await waitForLog(opened.page, `wallet connected: ${creator.address}`);
    await configureMacaroniStudio(opened.page, ipfs.apiUrl, runId, ipfs.publicGatewayUrl);
    screenshots.push(await captureStudioStage(
      opened.page, creatorMonitor, runRoot, 1,
      "configure blind drop", "V2 delayed reveal drop configured", "#secStages",
      [
        { selector: "#log", name: "creator wallet", expectedText: `wallet connected: ${creator.address}` },
        { selector: "#contractVersion", name: "contract version", expectedText: "Macaroni V2" },
        { selector: "#tokenSummary", name: "edition inventory", expectedText: "2 editions" },
        { selector: '[data-stage-status="0"]', name: "stage", expectedText: "stage saved" },
      ],
    ));

    await opened.page.click("#btnPin");
    await waitForText(opened.page, "#pinStatus", "all pinned ✓");
    assert.equal(pins.length, 5, "Studio must pin cover, placeholder, placeholder metadata, final art, and final metadata before deploy");
    assert.deepEqual(pins.map((pin) => pin.proof.fileName), [
      "macaroni-cover.png", "macaroni-placeholder.png", "placeholder-1.json", "1.png", "1.json",
    ]);
    screenshots.push(await captureStudioStage(
      opened.page, creatorMonitor, runRoot, 2,
      "pin exact media and metadata", "Five media and metadata artifacts pinned through Studio", "#secIpfs",
      [
        { selector: "#pinStatus", name: "pin result", expectedText: "all pinned ✓" },
        { selector: "#log", name: "placeholder pin", expectedText: "placeholder pinned" },
        { selector: "#log", name: "pin count", expectedText: "pinning complete: 1 tokens" },
      ],
    ));

    await opened.page.click("#btnDeploy");
    await waitForText(opened.page, "#deployStatus", "deployed ✓");
    await opened.page.waitForFunction(() => /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test((document.getElementById("contractAddr") as HTMLInputElement)?.value || ""));
    assert.equal(pins.length, 6, "deploy must add exact contract metadata pin");
    screenshots.push(await captureStudioStage(
      opened.page, creatorMonitor, runRoot, 3,
      "originate fresh contract", "Fresh Macaroni V2 contract originated", "#secDeploy",
      [
        { selector: "#deployStatus", name: "deployment", expectedText: "deployed ✓" },
        { selector: "#log", name: "fresh contract", expectedText: creatorContractAddress },
        { selector: "#log", name: "origination log", expectedText: "contract deployed at" },
      ],
    ));

    await opened.page.click("#btnSync");
    await waitForMacaroniSyncOutcome(opened.page, {
      rpcUrl: rpc.rpcUrl,
      signerAddress: creator.address,
      contractAddress: creatorContractAddress,
    });
    assert.deepEqual(creatorValidator.entrypoints, ["add_tokens_v2", "set_stages"]);
    screenshots.push(await captureStudioStage(
      opened.page, creatorMonitor, runRoot, 4,
      "load editions and stage", "Two editions and one-per-wallet stage synced", "#secDeploy",
      [
        { selector: "#deployStatus", name: "sync", expectedText: "in sync ✓" },
        { selector: "#log", name: "inventory", expectedText: "2 edition(s) in draft" },
        { selector: "#log", name: "live drop", expectedText: "drop is live on-chain" },
      ],
    ));

    const finalMetadataUri = pinByName(pins, "1.json").proof.uri;
    const placeholderMetadataUri = pinByName(pins, "placeholder-1.json").proof.uri;
    await opened.page.click("#tabPage");
    await opened.page.waitForSelector("#viewPage", { state: "visible" });
    const downloadPromise = opened.page.waitForEvent("download");
    await opened.page.click("#btnExport");
    const download = await downloadPromise;
    const exportZipPath = path.join(appRoot, "artifacts", "macaroni-site.zip");
    await download.saveAs(exportZipPath);
    await waitForText(opened.page, "#exportStatus", "Downloaded macaroni-site.zip");
    exportZipBytes = await readFile(exportZipPath);
    const files = validateMacaroniSiteArchive(exportZipBytes, {
      contractAddress: creatorContractAddress,
      finalMetadataUri,
      placeholderMetadataUri,
    });
    extractedSiteRoot = path.join(appRoot, "artifacts", "self-hosted-site");
    await extractSite(files, extractedSiteRoot);
    screenshots.push(await captureStudioStage(
      opened.page, creatorMonitor, runRoot, 5,
      "export self-hosted mint site", "Standalone collector website exported", "#exportStatus",
      [
        { selector: "#exportStatus", name: "site package", expectedText: "Downloaded macaroni-site.zip" },
        { selector: "#codeStatus", name: "generated drop config", expectedText: "generated from controls" },
      ],
    ));
  } finally {
    creatorMonitor?.dispose();
    await creatorBrowser?.close();
    await creatorBridge.close();
  }

  assert.equal(validateContractAddress(creatorContractAddress), ValidationResult.VALID);
  const finalMetadataPin = pinByName(pins, "1.json");
  const placeholderMetadataPin = pinByName(pins, "placeholder-1.json");
  const finalMediaPin = pinByName(pins, "1.png");
  let collectorProjection = await readMacaroniBrowserProjection(collectorTezos, creatorContractAddress, collector.address);
  const collectorValidator = createCollectorCallValidator();
  const collectorSession = new TaquitoPastaUiLiveSession({
    tezos: collectorTezos,
    signerAddress: collector.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([creatorContractAddress]),
    allowedEntrypoints: new Set(["mint", "reveal"]),
    assertExpectedChain: async (stage) => {
      await assertShadownet(collectorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    validateCall: (input) => collectorValidator.validate(input),
    assertOperationApplied: verifyMacaroniBridgeOperationApplied,
    projectStorage: async () => {
      collectorProjection = await readMacaroniBrowserProjection(
        collectorTezos,
        creatorContractAddress,
        collector.address,
      );
      return collectorProjection;
    },
    onReceipt: async (receipt) => {
      if (receipt.operationHash) {
        collectorProjection = await readMacaroniBrowserProjection(collectorTezos, creatorContractAddress, collector.address);
      }
    },
  });
  collectorSession.authorizeAfterFundingPreflight({
    balanceMutez: collectorBalanceMutez,
    requiredBalanceMutez: requiredCollectorBalanceMutez,
    estimatedOriginationMutez: 0,
    operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
  });
  const collectorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: extractedSiteRoot,
    handleAction: async (request) => {
      inspectCollectorRequest(request);
      return collectorSession.handle(request);
    },
  });
  let collectorBrowser: Browser | null = null;
  let collectorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  let walletLimitChainRejection = "";
  try {
    const opened = await openBrowser(false);
    collectorBrowser = opened.browser;
    collectorMonitor = monitorPastaProofPage(opened.page);
    await opened.page.goto(`${collectorBridge.origin}/index.html`, { waitUntil: "networkidle", timeout: 30_000 });
    await opened.page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(opened.page, collectorBridge, "UI-LIVE");
    await installMacaroniBrowserAdapters(opened.page, ipfs.publicGatewayUrl);
    await opened.page.evaluate(() => (window as any).refresh());
    await waitForText(opened.page, "#supplyText", "0 / 2 minted");
    await opened.page.click("#btnConnect");
    await waitForText(opened.page, "#walletBalance", "Wallet balance:");
    await waitForText(opened.page, "#walletLimitStatus", "0/1");
    screenshots.push(await captureDropStage(
      opened.page, collectorMonitor, runRoot, 6,
      "operate exported collector page", "Independent collector opened exported website", "#mintPanel", dropTitle,
      [
        { selector: "#supplyText", name: "unminted supply", expectedText: "0 / 2 minted" },
        { selector: "#stageInfo", name: "live stage", expectedText: "Mint is Live" },
        { selector: "#walletLimitStatus", name: "wallet allowance", expectedText: "0/1" },
      ],
    ));

    await opened.page.click("#btnMint");
    await waitForText(opened.page, "#mintStatus", "minted ✓");
    try {
      await waitForText(opened.page, "#walletLimitStatus", "1/1", 30_000);
    } catch (error) {
      const observed = await opened.page.locator("#walletLimitStatus").textContent().catch(() => "unavailable");
      throw new Error(`Macaroni exported page did not refresh its post-mint wallet limit; observed ${JSON.stringify(observed)}`, {
        cause: error,
      });
    }
    await opened.page.evaluate(async () => {
      await (window as any).refresh();
      await (window as any).loadOwnedMints();
    });
    await opened.page.waitForFunction(() => document.querySelector('#revealGrid [data-token-id="0"]')?.classList.contains("sealed") === true);
    assert.equal(await opened.page.locator("#btnMint").isDisabled(), true, "wallet policy must disable a second UI mint");
    const receiptCountBeforeDisabledClick = collectorSession.getReceipts().filter((receipt) => receipt.operationHash).length;
    await opened.page.evaluate(() => (document.getElementById("btnMint") as HTMLButtonElement).click());
    await opened.page.waitForTimeout(250);
    assert.equal(
      collectorSession.getReceipts().filter((receipt) => receipt.operationHash).length,
      receiptCountBeforeDisabledClick,
      "disabled wallet-limit control must not submit an operation",
    );
    screenshots.push(await captureDropStage(
      opened.page, collectorMonitor, runRoot, 7,
      "mint blind edition and enforce policy", "Blind token minted and wallet limit enforced", "#mintPanel", dropTitle,
      [
        { selector: "#supplyText", name: "minted supply", expectedText: "1 / 2 minted" },
        { selector: "#mintStatus", name: "mint result", expectedText: "minted ✓" },
        { selector: "#walletLimitStatus", name: "wallet boundary", expectedText: "1/1" },
        { selector: '#revealGrid [data-token-id="0"]', name: "sealed token", expectedText: "unrevealed" },
      ],
    ));

    await assertShadownet(collectorTezos, "before Macaroni UI-live wallet-limit boundary");
    try {
      const boundaryContract = await collectorTezos.contract.at(creatorContractAddress);
      await boundaryContract.methodsObject.mint(1).send({ amount: MINT_PRICE_MUTEZ, mutez: true });
      assert.fail("collector unexpectedly bypassed Macaroni max_per_wallet=1");
    } catch (error) {
      walletLimitChainRejection = errorText(error);
      assert.match(walletLimitChainRejection, /WALLET_LIMIT/, "chain boundary did not reject at WALLET_LIMIT");
    }

    await opened.page.waitForSelector("#btnReveal", { state: "visible" });
    await opened.page.click("#btnReveal");
    await waitForText(opened.page, "#revealOpStatus", "revealed ✓");
    await opened.page.waitForFunction(() => {
      const card = document.querySelector('#revealGrid [data-token-id="0"]');
      return Boolean(card && !card.classList.contains("sealed") && card.textContent?.includes("Macaroni Revealed Proof"));
    });
    screenshots.push(await captureDropStage(
      opened.page, collectorMonitor, runRoot, 8,
      "permissionless reveal", "Collector revealed exact final artwork", "#revealSection", dropTitle,
      [
        { selector: "#supplyText", name: "final supply", expectedText: "1 / 2 minted" },
        { selector: '#revealGrid [data-token-id="0"]', name: "final metadata", expectedText: "Macaroni Revealed Proof" },
      ],
    ));
    assert.deepEqual(collectorValidator.entrypoints, ["mint", "reveal"]);
  } finally {
    collectorMonitor?.dispose();
    await collectorBrowser?.close();
    await collectorBridge.close();
  }

  assert.ok(manualOriginationReceipt, "Macaroni Studio did not produce the canonical origination receipt");
  const finalizedCreatorContractSession = creatorContractSession as TaquitoPastaUiLiveSession | null;
  assert.ok(finalizedCreatorContractSession, "Macaroni Studio did not initialize the fresh contract session");
  const creatorReceipts = [
    ...creatorBootstrapSession.getReceipts(),
    manualOriginationReceipt,
    ...finalizedCreatorContractSession.getReceipts(),
  ];
  const collectorReceipts = collectorSession.getReceipts();
  const operationEvidence = operationReceipts(creatorReceipts, collectorReceipts, creator.address, collector.address);
  assert.equal(operationEvidence.contractAddress, creatorContractAddress);
  const tzktEvidence = await verifyTzktEvidence({
    contractAddress: creatorContractAddress,
    collectorAddress: collector.address,
    finalMetadataUri: finalMetadataPin.proof.uri,
    placeholderMetadataUri: placeholderMetadataPin.proof.uri,
    finalMetadataProof: finalMetadataPin.proof,
    finalMetadataValue: finalMetadataPin.value,
    operationReceipts: operationEvidence.receipts,
  });
  const v1Lane = await runMacaroniV1UiLane({
    appRoot,
    runRoot,
    runId,
    rpcUrl: rpc.rpcUrl,
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
    code: v1Code,
  });
  screenshots.push(...v1Lane.captures);
  const writtenPins = await writePinnedArtifacts(appRoot, pins, "v2");
  const tzktBytes = deterministicJsonBytes(tzktEvidence);
  const tzktRelativePath = "artifacts/macaroni-ui-live-tzkt-index.json";
  await writeFile(path.join(appRoot, tzktRelativePath), tzktBytes);
  const exportZipPath = path.join(appRoot, "artifacts", "macaroni-site.zip");
  assert.equal(sha256(await readFile(exportZipPath)), sha256(exportZipBytes));
  const configBytes = await readFile(path.join(extractedSiteRoot, "drop.config.js"));
  await rm(extractedSiteRoot, { recursive: true, force: true });
  await mkdir(extractedSiteRoot, { recursive: true });
  await writeFile(path.join(extractedSiteRoot, "drop.config.js"), configBytes);
  const v2Operations = operationEvidence.receipts.map((receipt) => {
    const entrypoint = receipt.entrypoints?.[0] || null;
    const kind = receipt.action === "originate"
      ? "origination"
      : entrypoint === "add_tokens_v2"
        ? "publish"
        : entrypoint === "set_stages"
          ? "configure"
          : entrypoint === "mint"
            ? "mint"
            : "reveal";
    return {
      kind,
      hash: receipt.operationHash,
      contractAddress: creatorContractAddress,
      ...(entrypoint ? { entrypoint } : {}),
      status: "applied",
      explorerUrl: `https://shadownet.tzkt.io/${receipt.operationHash}`,
    };
  });
  const token = {
    id: "macaroni-v2-blind-edition-0",
    contractAddress: creatorContractAddress,
    tokenId: "0",
    explorerUrl: `https://shadownet.tzkt.io/${creatorContractAddress}/tokens/0`,
    metadataArtifactId: pinArtifactId(writtenPins, "1.json"),
    mediaArtifactId: pinArtifactId(writtenPins, "1.png"),
    metadataUri: finalMetadataPin.proof.uri,
    artifactUri: finalMediaPin.proof.uri,
  };
  const operations = [...v2Operations, ...v1Lane.operations];
  const completedAt = new Date().toISOString();
  const receipt = {
    schema: "pastaprotocol-macaroni-ui-live-run@1",
    classification: "UI-LIVE",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    startedAt,
    completedAt,
    actors: { creator: creator.address, collector: collector.address, independent: creator.address !== collector.address },
    funding: {
      v1: v1Lane.funding,
      v2: {
        creator: creatorBootstrapSession.getFundingAuthorization(),
        collector: collectorSession.getFundingAuthorization(),
      },
    },
    contract: { address: creatorContractAddress, version: "macaroni-editions-v2", explorerUrl: `https://shadownet.tzkt.io/${creatorContractAddress}` },
    contracts: {
      v1: {
        address: v1Lane.contractAddress,
        version: "macaroni-v1",
        explorerUrl: `https://shadownet.tzkt.io/${v1Lane.contractAddress}`,
      },
      v2: {
        address: creatorContractAddress,
        version: "macaroni-editions-v2",
        explorerUrl: `https://shadownet.tzkt.io/${creatorContractAddress}`,
      },
    },
    canonicalArtifactTransport: {
      v1: v1Lane.canonicalArtifactTransport,
      v2: {
        browserLoadedSha256: expectedCodeHash,
        nodeOriginatedSha256: hashJsonForBridge(code),
        exactHashMatch: expectedCodeHash === hashJsonForBridge(code),
        reason: "Macaroni V2 exceeds the shared bridge's generic 100000-node decode ceiling; the browser hashes the exact UI-loaded artifact and Node originates only the matching canonical local bytes.",
      },
    },
    drop: {
      tokenRows: 1,
      declaredSupply: TOKEN_QUANTITY,
      minted: 1,
      revealed: 1,
      delayedReveal: true,
      revealDelaySeconds: 0,
      priceMutez: MINT_PRICE_MUTEZ,
      maxPerWallet: 1,
      walletLimitUiSubmissionPrevented: true,
      walletLimitChainRejected: true,
      walletLimitFailureMarker: "WALLET_LIMIT",
      walletLimitErrorSha256: sha256(Buffer.from(walletLimitChainRejection, "utf8")),
    },
    drops: { v1: v1Lane.drop, v2: {
      tokenRows: 1,
      declaredSupply: TOKEN_QUANTITY,
      minted: 1,
      revealed: 1,
      delayedReveal: true,
      revealDelaySeconds: 0,
      priceMutez: MINT_PRICE_MUTEZ,
      maxPerWallet: 1,
      walletLimitUiSubmissionPrevented: true,
      walletLimitChainRejected: true,
      walletLimitFailureMarker: "WALLET_LIMIT",
      walletLimitErrorSha256: sha256(Buffer.from(walletLimitChainRejection, "utf8")),
    } },
    selfHostedSite: {
      zipPath: "artifacts/macaroni-site.zip",
      zipSha256: sha256(exportZipBytes),
      configPath: "artifacts/self-hosted-site/drop.config.js",
      configSha256: sha256(configBytes),
      requiredFiles: REQUIRED_SITE_FILES,
    },
    selfHostedSites: { v1: v1Lane.selfHostedSite, v2: {
      zipPath: "artifacts/macaroni-site.zip",
      zipSha256: sha256(exportZipBytes),
      configPath: "artifacts/self-hosted-site/drop.config.js",
      configSha256: sha256(configBytes),
      requiredFiles: REQUIRED_SITE_FILES,
    } },
    token,
    tokens: [v1Lane.token, token],
    operations,
    bridgeReceipts: {
      v1: { creator: v1Lane.creatorReceipts, collector: v1Lane.collectorReceipts },
      v2: { creator: creatorReceipts, collector: collectorReceipts },
    },
    pins: [...v1Lane.writtenPins, ...writtenPins],
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    screenshotSidecars: screenshots.map((capture) => capture.manifestSidecarArtifact),
    tzktEvidence: {
      v1: v1Lane.tzktEvidence,
      v2: { path: tzktRelativePath, sha256: sha256(tzktBytes) },
    },
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptRelativePath = "artifacts/macaroni-ui-live-run.json";
  const receiptPath = path.join(appRoot, receiptRelativePath);
  await writeFile(receiptPath, receiptBytes);
  const localArtifacts = [
    ...v1Lane.localArtifacts,
    ...screenshots.map((capture) => capture.manifestSidecarArtifact),
    { id: "macaroni-ui-live-run", kind: "proof-receipt", path: receiptRelativePath, sha256: sha256(receiptBytes) },
    { id: "macaroni-ui-live-tzkt-index", kind: "indexer-evidence", path: tzktRelativePath, sha256: sha256(tzktBytes) },
    { id: "macaroni-self-hosted-site", kind: "self-hosted-site", path: "artifacts/macaroni-site.zip", sha256: sha256(exportZipBytes) },
    { id: "macaroni-drop-config", kind: "drop-config", path: "artifacts/self-hosted-site/drop.config.js", sha256: sha256(configBytes) },
  ];
  const allArtifacts = [
    ...v1Lane.writtenPins.map(({ fileName: _fileName, ...artifact }) => artifact),
    ...writtenPins.map(({ fileName: _fileName, ...artifact }) => artifact),
    ...localArtifacts,
  ];
  const screenshotIds = screenshots.map((capture) => capture.manifestScreenshot.stage);
  const operationHashes = operations.map((operation) => operation.hash);
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "macaroni",
    role: "token-publisher",
    runId,
    capturedAt: completedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    artifacts: allArtifacts,
    contracts: [
      {
        address: v1Lane.contractAddress,
        kind: "classic-blind-drop-v1",
        explorerUrl: `https://shadownet.tzkt.io/${v1Lane.contractAddress}`,
      },
      {
        address: creatorContractAddress,
        kind: "blind-drop-v2",
        explorerUrl: `https://shadownet.tzkt.io/${creatorContractAddress}`,
      },
    ],
    operations,
    tokens: [v1Lane.token, token],
    roleEvidence: [],
    capabilities: [
      {
        id: "studio-create-pin-deploy-sync-export",
        description: "Use Macaroni Studio to configure a delayed-reveal edition drop, pin six exact artifacts, originate V2, load inventory and a one-per-wallet stage, and export the complete self-hostable collector website.",
        evidence: {
          screenshots: screenshotIds.slice(0, 5),
          artifacts: [
            ...writtenPins.map((artifact) => artifact.id),
            ...screenshots.slice(0, 5).map((capture) => capture.manifestSidecarArtifact.id),
            "macaroni-self-hosted-site",
            "macaroni-drop-config",
          ],
          contracts: [creatorContractAddress],
          operations: v2Operations.slice(0, 3).map((operation) => operation.hash),
          tokens: [],
          roleEvidence: [],
          urls: [
            `https://shadownet.tzkt.io/${creatorContractAddress}`,
            ...writtenPins.map((artifact) => artifact.gatewayUrl),
          ],
        },
      },
      {
        id: "exported-page-mint-policy-reveal",
        description: "Use an independent collector through the actual exported website to mint a sealed edition, enforce the one-per-wallet boundary without a second submission, and reveal the exact final metadata and artwork.",
        evidence: {
          screenshots: screenshotIds.slice(5, 8),
          artifacts: [
            ...screenshots.slice(5, 8).map((capture) => capture.manifestSidecarArtifact.id),
            "macaroni-ui-live-run",
            "macaroni-ui-live-tzkt-index",
            "macaroni-self-hosted-site",
            token.metadataArtifactId,
            token.mediaArtifactId,
          ],
          contracts: [creatorContractAddress],
          operations: v2Operations.slice(3).map((operation) => operation.hash),
          tokens: [token.id],
          roleEvidence: [],
          urls: [token.explorerUrl, finalMetadataPin.proof.publicGatewayUrl, finalMediaPin.proof.publicGatewayUrl],
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
        description: "Use an independent collector through the actual exported V1 website to mint the 1/1 with final metadata immediately and prove sold-out enforcement in both UI and contract execution.",
        evidence: {
          screenshots: v1Lane.captures.slice(5).map((capture) => capture.manifestScreenshot.stage),
          artifacts: [
            ...v1Lane.captures.slice(5).map((capture) => capture.manifestSidecarArtifact.id),
            "macaroni-v1-ui-live-tzkt-index",
            "macaroni-v1-self-hosted-site",
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
    ],
  };
  const referenced = {
    screenshots: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.screenshots)),
    artifacts: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.artifacts)),
    contracts: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.contracts)),
    operations: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.operations)),
    tokens: new Set(manifest.capabilities.flatMap((capability) => capability.evidence.tokens)),
  };
  assert.deepEqual([...referenced.screenshots].sort(), screenshots.map((capture) => capture.manifestScreenshot.stage).sort());
  assert.deepEqual([...referenced.artifacts].sort(), allArtifacts.map((artifact) => artifact.id).sort());
  assert.deepEqual(
    [...referenced.contracts].sort(),
    [v1Lane.contractAddress, creatorContractAddress].sort(),
  );
  assert.deepEqual([...referenced.operations].sort(), operationHashes.slice().sort());
  assert.deepEqual([...referenced.tokens].sort(), [v1Lane.token.id, token.id].sort());
  const manifestPath = path.join(appRoot, "manifest.json");
  await writeFile(manifestPath, deterministicJsonBytes(manifest));
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    classification: "UI-LIVE",
    contractAddress: creatorContractAddress,
    contractAddresses: [v1Lane.contractAddress, creatorContractAddress],
    operationHashes,
    tokenIds: [0, 0],
    manifestPath,
    receiptPath,
    receiptSha256: sha256(receiptBytes),
  }, null, 2)}\n`);
  return {
    manifestPath,
    receiptPath,
    contractAddress: creatorContractAddress,
    contractAddresses: [v1Lane.contractAddress, creatorContractAddress],
    operationHashes,
    tokenIds: [0, 0],
    screenshots,
  };
}

async function main(): Promise<void> {
  try {
    await runMacaroniUiLive();
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
