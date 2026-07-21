#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { MichelsonMap, type TezosToolkit } from "@taquito/taquito";
import {
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  buildPastaUiLiveProxyInstallerSource,
  decodePastaUiLiveValue,
  hashJsonForBridge,
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
  type CapturePastaProofStageResult,
  type PastaProofPageMonitor,
  type RequiredDomEvidence,
} from "./pasta-proof-screenshot-kit";
import {
  assertShadownet,
  block,
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
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  type IpfsProofConfig,
  type PlatformWallet,
} from "./shadownet-proof-kit";
import {
  validateRavioliRecoveryReceipt,
  type AcceptedEvidenceHashes,
} from "./shadownet-ravioli-dependency-recovery";
import { ravioliPayloadCommitment } from "./shadownet-ravioli-e2e";
import {
  loadRavioliNativeRecoveryHandoff,
  RAVIOLI_NATIVE_RECOVERY_DIRECTORY,
  type RavioliNativeRecoveryHandoff,
} from "./shadownet-ravioli-native-recovery";

const EXECUTE_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const STATIC_ROOT = path.join(root, "public");
const APP_PATH = "/creation-tools/ravioli/index.html";
const SITE_PATH = "/creation-tools/ravioli/site.html";
const SITE_SOURCE_PATH = path.join(STATIC_ROOT, "creation-tools", "ravioli", "js", "site.js");
const ARTIFACT_PATHS = {
  router: path.join(STATIC_ROOT, "creation-tools", "ravioli", "contract", "pasta-bundle.contract.json"),
  gnocchiAdapter: path.join(STATIC_ROOT, "creation-tools", "ravioli", "contract", "pasta-gnocchi-pack-adapter.contract.json"),
  rotiniAdapter: path.join(STATIC_ROOT, "creation-tools", "ravioli", "contract", "pasta-rotini-pack-adapter.contract.json"),
} as const;
const CREATOR_OPERATION_RESERVE_MUTEZ = 12_000_000;
const COLLECTOR_OPERATION_RESERVE_MUTEZ = 2_000_000;
const PAID_SALE_PRICE_MUTEZ = 1;
export const RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID = 1;
export const RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES = 1_500_000_000;
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);
const MODE_NAMES = [
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
] as const;

export const RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS = new Set([
  "add_minter",
  "add_pack_minter",
  "update_operators",
  "create_allocation",
  "create_resource",
  "add_router",
  "create_pack",
  "commit_recipe",
  "finalize_pack",
  "mint",
  "set_sale",
  "set_pack_contents",
]);
export const RAVIOLI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS = new Set(["buy", "open_pack"]);

type JsonObject = Record<string, any>;

export function ravioliDeliveredTokenExplorerUrls(input: {
  gnocchiAddress: string;
  rotiniAddress: string;
  rotiniGeneratedTokenIds: readonly [number, number];
}): string[][] {
  assert.equal(validateContractAddress(input.gnocchiAddress), ValidationResult.VALID, "Ravioli Gnocchi dependency address is invalid");
  assert.equal(validateContractAddress(input.rotiniAddress), ValidationResult.VALID, "Ravioli Rotini dependency address is invalid");
  assert.deepEqual(
    input.rotiniGeneratedTokenIds,
    [input.rotiniGeneratedTokenIds[0], input.rotiniGeneratedTokenIds[0] + 1],
    "Ravioli Rotini generated token ids must be consecutive",
  );
  assert.ok(
    input.rotiniGeneratedTokenIds.every((tokenId) => Number.isSafeInteger(tokenId) && tokenId >= 0),
    "Ravioli Rotini generated token ids are invalid",
  );
  const gnocchi = (tokenId: number) => `https://shadownet.tzkt.io/${input.gnocchiAddress}/tokens/${tokenId}`;
  const rotini = (tokenId: number) => `https://shadownet.tzkt.io/${input.rotiniAddress}/tokens/${tokenId}`;
  return [
    [gnocchi(RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID)],
    [gnocchi(0), gnocchi(1)],
    [gnocchi(0)],
    [rotini(input.rotiniGeneratedTokenIds[0])],
    [
      gnocchi(1),
      gnocchi(RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID),
      rotini(input.rotiniGeneratedTokenIds[1]),
    ],
  ];
}

export function buildRavioliRevealCapability(input: {
  screenshots: Array<{ stage: string; caption: string }>;
  blindManifestArtifacts: Array<{ id: string; gatewayUrl?: string }>;
  contracts: Array<{ address: string; explorerUrl: string }>;
  operations: Array<{ hash: string; entrypoint?: string }>;
  blindTokens: Array<{ id: string; explorerUrl: string }>;
  supportingArtifactIds: string[];
}): JsonObject {
  const revealStages = input.screenshots
    .filter((screenshot) => screenshot.caption.includes("Blind contents manifests published"))
    .map((screenshot) => screenshot.stage);
  assert.equal(revealStages.length, 1, "Ravioli needs exactly one blind-manifest reveal screenshot");
  assert.equal(input.blindManifestArtifacts.length, 4, "Ravioli reveal proof needs all four blind manifests");
  assert.equal(input.blindTokens.length, 4, "Ravioli reveal proof needs wrapper tokens one through four");
  const revealOperations = input.operations.filter((operation) => operation.entrypoint === "set_pack_contents");
  assert.equal(revealOperations.length, 4, "Ravioli reveal proof needs four applied set_pack_contents operations");
  return {
    id: "blind-manifest-reveal-ui-live-proof",
    description: "Publish the exact pinned contents manifests for all four blind pack products after their atomic openings.",
    evidence: {
      screenshots: revealStages,
      artifacts: [
        ...input.blindManifestArtifacts.map((artifact) => artifact.id),
        ...input.supportingArtifactIds,
      ],
      contracts: input.contracts.map((contract) => contract.address),
      operations: revealOperations.map((operation) => operation.hash),
      tokens: input.blindTokens.map((token) => token.id),
      roleEvidence: [],
      urls: [
        ...input.contracts.map((contract) => contract.explorerUrl),
        ...input.blindTokens.map((token) => token.explorerUrl),
        ...input.blindManifestArtifacts.map((artifact) => artifact.gatewayUrl).filter(Boolean),
      ],
    },
  };
}

type PinRecord = {
  value?: unknown;
  bytes?: Uint8Array;
  proof: PastaUiLivePinProof;
};
type ActorPage = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  monitor: PastaProofPageMonitor;
};
type DependencyEvidence = {
  runId: string;
  recovery: {
    receipt: JsonObject;
    receiptSha256: string;
    receiptPath: string;
    acceptedEvidenceHashes: AcceptedEvidenceHashes;
  };
  nativeRecovery: {
    receipt: JsonObject;
    receiptSha256: string;
    receiptPath: string;
    handoff: RavioliNativeRecoveryHandoff;
  };
  gnocchi: {
    address: string;
    allocationTokenId: number;
    tokenMetadataUris: string[];
    creatorBalances: Record<string, number>;
    manifestSha256: string;
    receiptSha256: string;
    manifestPath: string;
    receiptPath: string;
  };
  rotini: {
    address: string;
    projectId: number;
    nextTokenId: number;
    generatedTokenIds: [number, number];
    manifestSha256: string;
    receiptSha256: string;
    manifestPath: string;
    receiptPath: string;
  };
  tzkt: JsonObject;
};
export type TzktBalanceRequirement = {
  owner: string;
  tokenId: number;
  balance: number;
};

type RavioliProofOperationRecord = {
  kind: string;
  hash: string;
  contractAddress?: string;
  entrypoint?: string;
  status: "applied";
  explorerUrl: string;
};

type RavioliOpenKitArtifact = {
  id: string;
  kind: "open-kit";
  path: string;
  sha256: string;
};
export type PackKit = {
  schema: string;
  network: string;
  contract: string;
  tokenId: number;
  mode: string;
  manifestUri: string;
  recipes: Array<{ serial: number; nonce: string; actions: JsonObject[] }>;
};
export type RavioliOpenKitDownloadCapture = {
  tokenId: number;
  mode: string;
  fileName: string;
  relativePath: string;
  sha256: string;
  bytes: Uint8Array;
  kit: PackKit;
};
type PackSnapshot = {
  mode: number;
  blind: boolean;
  item_count: number;
  max_supply: number;
  committed_recipes: number;
  finalized: boolean;
  cancelled: boolean;
  contents_uri: string | null;
};
type SaleSnapshot = {
  active: boolean;
  seller: string;
  treasury: string;
  price: number;
  remaining: number;
  start: string | null;
  end: string | null;
};
type RavioliUiLiveResult = {
  routerAddress: string;
  adapterAddresses: { gnocchi: string; rotini: string };
  manifestPath: string;
  receiptPath: string;
  operationHashes: string[];
  screenshots: CapturePastaProofStageResult[];
  memorySamples: RavioliUiLiveMemorySample[];
};

export type RavioliUiLiveMemorySample = {
  stage: string;
  sampledAtUtc: string;
  heapCeilingBytes: number;
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
};

type RavioliMemoryUsage = Pick<
  NodeJS.MemoryUsage,
  "rss" | "heapTotal" | "heapUsed" | "external" | "arrayBuffers"
>;

export function sampleRavioliUiLiveMemory(
  stage: string,
  options: {
    usage?: RavioliMemoryUsage;
    sampledAtUtc?: string;
    heapCeilingBytes?: number;
  } = {},
): RavioliUiLiveMemorySample {
  assert.ok(stage.trim(), "Ravioli memory sample stage is required");
  const usage = options.usage || process.memoryUsage();
  const heapCeilingBytes = options.heapCeilingBytes ?? RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES;
  assert.ok(Number.isSafeInteger(heapCeilingBytes) && heapCeilingBytes > 0, "Ravioli heap ceiling must be a positive safe integer");
  assert.ok(
    usage.heapUsed <= heapCeilingBytes,
    `Ravioli UI-live heap ceiling exceeded at ${stage}: ${usage.heapUsed} > ${heapCeilingBytes} bytes`,
  );
  return {
    stage,
    sampledAtUtc: options.sampledAtUtc || new Date().toISOString(),
    heapCeilingBytes,
    rssBytes: usage.rss,
    heapTotalBytes: usage.heapTotal,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function asSafeInteger(value: unknown, label: string): number {
  const converted = typeof value === "object" && value && "toNumber" in value &&
      typeof (value as { toNumber?: unknown }).toNumber === "function"
    ? (value as { toNumber(): number }).toNumber()
    : Number(value);
  assert.ok(Number.isSafeInteger(converted), `${label} must be a safe integer`);
  return converted;
}

function mapGet(map: unknown, key: unknown): unknown {
  assert.ok(map instanceof MichelsonMap, "expected MichelsonMap");
  return map.get(key);
}

function metadataUri(storage: JsonObject): string {
  const encoded = mapGet(storage.metadata, "");
  assert.equal(typeof encoded, "string");
  return hexToUtf8(String(encoded));
}

function metadataMap(uri: string): MichelsonMap<string, string> {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(uri));
  return metadata;
}

function routerStorage(administrator: string, uri: string) {
  return {
    administrator,
    pending_administrator: null,
    metadata: metadataMap(uri),
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    total_supply: new MichelsonMap(),
    packs: new MichelsonMap(),
    recipe_commitments: new MichelsonMap(),
    minted: new MichelsonMap(),
    opened: new MichelsonMap(),
    opened_by: new MichelsonMap(),
    asset_allowances: new MichelsonMap(),
    adapter_allowances: new MichelsonMap(),
    sales: new MichelsonMap(),
    minters: new MichelsonMap(),
    next_token_id: 0,
  };
}

function adapterStorage(administrator: string, uri: string, kind: "gnocchi" | "rotini") {
  const base = {
    administrator,
    pending_administrator: null,
    metadata: metadataMap(uri),
    routers: new MichelsonMap(),
    reservations: new MichelsonMap(),
    next_resource_id: 0,
  };
  return kind === "gnocchi"
    ? { ...base, allocations: new MichelsonMap() }
    : { ...base, resources: new MichelsonMap() };
}

function primitive(action: JsonObject): string {
  const keys = Object.keys(action);
  assert.equal(keys.length, 1, "Ravioli action must have exactly one primitive");
  return keys[0];
}

function normalizePack(value: JsonObject): PackSnapshot {
  return {
    mode: asSafeInteger(value.mode, "pack mode"),
    blind: value.blind === true,
    item_count: asSafeInteger(value.item_count, "item count"),
    max_supply: asSafeInteger(value.max_supply, "max supply"),
    committed_recipes: asSafeInteger(value.committed_recipes, "committed recipes"),
    finalized: value.finalized === true,
    cancelled: value.cancelled === true,
    contents_uri: value.contents_uri == null ? null : String(value.contents_uri),
  };
}

export class RavioliUiStateMirror {
  routerAddress = "";
  gnocchiAdapterAddress = "";
  rotiniAdapterAddress = "";
  readonly packs = new Map<number, PackSnapshot>();
  readonly tokenMetadata = new Map<number, unknown>();
  readonly totalSupply = new Map<number, number>();
  readonly opened = new Map<number, number>();
  readonly sales = new Map<number, SaleSnapshot>();
  readonly ledger = new Map<string, number>();
  readonly kits = new Map<number, PackKit>();
  nextTokenId = 0;
  gnocchiNextResourceId = 0;
  rotiniNextResourceId = 0;

  bindOrigination(kind: "router" | "gnocchiAdapter" | "rotiniAdapter", address: string): void {
    assert.equal(validateContractAddress(address), ValidationResult.VALID);
    const field = kind === "router" ? "routerAddress" : kind === "gnocchiAdapter" ? "gnocchiAdapterAddress" : "rotiniAdapterAddress";
    assert.equal(this[field], "", `${kind} may only originate once`);
    this[field] = address;
  }

  registerKit(kit: PackKit): void {
    assert.equal(kit.schema, "pasta-ravioli-open-kit@3");
    assert.equal(kit.contract, this.routerAddress);
    assert.equal(kit.tokenId, this.kits.size);
    assert.equal(kit.recipes.length, kit.tokenId === 1 ? 2 : 1);
    this.kits.set(kit.tokenId, structuredClone(kit));
  }

  private ledgerKey(owner: string, tokenId: number): string {
    return `${owner}:${tokenId}`;
  }

  private addBalance(owner: string, tokenId: number, amount: number): void {
    const key = this.ledgerKey(owner, tokenId);
    const next = (this.ledger.get(key) || 0) + amount;
    assert.ok(next >= 0, "wrapper balance cannot become negative");
    if (next === 0) this.ledger.delete(key);
    else this.ledger.set(key, next);
  }

  applySuccessfulCall(contractAddress: string, entrypoint: string, payload: unknown, signer: string): void {
    const value = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as JsonObject
      : {};
    if (contractAddress === this.gnocchiAdapterAddress && entrypoint === "create_allocation") {
      this.gnocchiNextResourceId += 1;
      return;
    }
    if (contractAddress === this.rotiniAdapterAddress && entrypoint === "create_resource") {
      this.rotiniNextResourceId += 1;
      return;
    }
    if (contractAddress !== this.routerAddress) return;
    if (entrypoint === "create_pack") {
      const tokenId = this.nextTokenId++;
      this.packs.set(tokenId, normalizePack(value.config));
      this.tokenMetadata.set(tokenId, { token_id: tokenId, token_info: value.token_info });
      this.totalSupply.set(tokenId, 0);
      this.opened.set(tokenId, 0);
      return;
    }
    if (entrypoint === "commit_recipe") {
      const tokenId = asSafeInteger(value.token_id, "commit token id");
      const pack = this.packs.get(tokenId);
      assert.ok(pack);
      pack.committed_recipes += 1;
      return;
    }
    if (entrypoint === "finalize_pack") {
      const tokenId = asSafeInteger(payload, "finalize token id");
      const pack = this.packs.get(tokenId);
      assert.ok(pack);
      pack.finalized = true;
      return;
    }
    if (entrypoint === "mint") {
      const tokenId = asSafeInteger(value.token_id, "mint token id");
      const amount = asSafeInteger(value.amount, "mint amount");
      this.totalSupply.set(tokenId, (this.totalSupply.get(tokenId) || 0) + amount);
      this.addBalance(String(value.to_), tokenId, amount);
      return;
    }
    if (entrypoint === "set_sale") {
      const tokenId = asSafeInteger(value.token_id, "sale token id");
      const sale = value.sale as JsonObject;
      this.sales.set(tokenId, {
        active: sale.active === true,
        seller: String(sale.seller),
        treasury: String(sale.treasury),
        price: asSafeInteger(sale.price, "sale price"),
        remaining: asSafeInteger(sale.remaining, "sale remaining"),
        start: sale.start == null ? null : String(sale.start),
        end: sale.end == null ? null : String(sale.end),
      });
      return;
    }
    if (entrypoint === "buy") {
      const tokenId = asSafeInteger(value.token_id, "buy token id");
      const amount = asSafeInteger(value.amount, "buy amount");
      const sale = this.sales.get(tokenId);
      assert.ok(sale && sale.remaining >= amount);
      sale.remaining -= amount;
      this.addBalance(sale.seller, tokenId, -amount);
      this.addBalance(signer, tokenId, amount);
      return;
    }
    if (entrypoint === "open_pack") {
      const tokenId = asSafeInteger(value.token_id, "open token id");
      this.addBalance(signer, tokenId, -1);
      this.totalSupply.set(tokenId, (this.totalSupply.get(tokenId) || 0) - 1);
      this.opened.set(tokenId, (this.opened.get(tokenId) || 0) + 1);
      return;
    }
    if (entrypoint === "set_pack_contents") {
      const tokenId = asSafeInteger(value.token_id, "contents token id");
      const pack = this.packs.get(tokenId);
      assert.ok(pack);
      pack.contents_uri = String(value.contents_uri);
    }
  }

  project(storage: unknown): unknown {
    const source = storage as JsonObject;
    if (source && typeof source === "object" && "packs" in source) return this.projectRouter();
    if (source && typeof source === "object" && "allocations" in source) {
      return {
        administrator: typeof source.administrator === "string" ? source.administrator : "",
        next_resource_id: this.gnocchiNextResourceId,
        allocations: new MichelsonMap(),
        reservations: new MichelsonMap(),
        routers: new MichelsonMap(),
        metadata: new MichelsonMap(),
      };
    }
    if (source && typeof source === "object" && "resources" in source) {
      return {
        administrator: typeof source.administrator === "string" ? source.administrator : "",
        next_resource_id: this.rotiniNextResourceId,
        resources: new MichelsonMap(),
        reservations: new MichelsonMap(),
        routers: new MichelsonMap(),
        metadata: new MichelsonMap(),
      };
    }
    throw new TypeError("unsupported Ravioli storage shape; refusing to expose raw Taquito storage through the UI-live bridge");
  }

  projectRouter(): JsonObject {
    const packs = new MichelsonMap<string, unknown>();
    const tokenMetadata = new MichelsonMap<string, unknown>();
    const totalSupply = new MichelsonMap<string, number>();
    const opened = new MichelsonMap<string, number>();
    const sales = new MichelsonMap<string, SaleSnapshot>();
    for (const [tokenId, value] of this.packs) packs.set(String(tokenId), { ...value });
    for (const [tokenId, value] of this.tokenMetadata) tokenMetadata.set(String(tokenId), value);
    for (const [tokenId, value] of this.totalSupply) totalSupply.set(String(tokenId), value);
    for (const [tokenId, value] of this.opened) opened.set(String(tokenId), value);
    for (const [tokenId, value] of this.sales) sales.set(String(tokenId), { ...value });
    return {
      administrator: "",
      next_token_id: this.nextTokenId,
      packs,
      token_metadata: tokenMetadata,
      total_supply: totalSupply,
      opened,
      sales,
    };
  }
}

function safeRelativePath(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} must be a string`);
  const normalized = path.posix.normalize(value as string);
  assert.equal(normalized, value);
  assert.ok(normalized !== "." && normalized !== ".." && !normalized.startsWith("../") && !path.posix.isAbsolute(normalized));
  return normalized;
}

async function readJsonFile(filePath: string): Promise<{ value: JsonObject; bytes: Uint8Array; digest: string }> {
  const bytes = await readFile(filePath);
  const value = JSON.parse(bytes.toString("utf8"));
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return { value, bytes, digest: sha256(bytes) };
}

async function verifyManifestFiles(appRoot: string, manifest: JsonObject): Promise<void> {
  assert.ok(Array.isArray(manifest.artifacts));
  assert.ok(Array.isArray(manifest.screenshots));
  for (const [kind, entries] of [["artifact", manifest.artifacts], ["screenshot", manifest.screenshots]] as const) {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index] as JsonObject;
      const relative = safeRelativePath(entry.path, `${kind} path ${index}`);
      const absolute = path.resolve(appRoot, ...relative.split("/"));
      assert.ok(absolute.startsWith(`${path.resolve(appRoot)}${path.sep}`));
      const bytes = await readFile(absolute);
      assert.equal(sha256(bytes), entry.sha256, `${kind} ${relative} digest mismatch`);
    }
  }
}

function assertAppliedManifest(manifest: JsonObject, app: "gnocchi" | "rotini", runId: string): void {
  assert.equal(manifest.schema, "pastaprotocol-app-proof@1");
  assert.equal(manifest.app, app);
  assert.equal(manifest.role, "token-publisher");
  assert.equal(manifest.runId, runId);
  assert.equal(manifest.network?.name, "shadownet");
  assert.equal(manifest.network?.chainId, SHADOWNET_CHAIN_ID);
  assert.ok(Array.isArray(manifest.contracts) && manifest.contracts.length === 1);
  assert.equal(validateContractAddress(manifest.contracts[0].address), ValidationResult.VALID);
  assert.ok(Array.isArray(manifest.operations));
  assert.ok(manifest.operations.some((operation: JsonObject) => operation.kind === "origination"));
  for (const operation of manifest.operations) {
    assert.equal(operation.status, "applied");
    assert.equal(validateOperation(operation.hash), ValidationResult.VALID);
  }
}

function findBalance(entries: any[], owner: string, tokenId: number): number {
  const entry = entries.find((candidate) => candidate?.key?.owner === owner && Number(candidate?.key?.token_id) === tokenId);
  return entry ? Number(entry.value) : 0;
}

function findNat(entries: any[], tokenId: number): number {
  const entry = entries.find((candidate) => Number(candidate?.key) === tokenId);
  return entry ? Number(entry.value) : 0;
}

export function validateRavioliGnocchiDependencyRoles(input: {
  sales: JsonObject[];
  metadata: JsonObject[];
  policyLocked: JsonObject[];
  tokenMetadataUris: string[];
}): { allocationTokenId: number } {
  const sale = (tokenId: number) => input.sales.find((entry) => Number(entry.key) === tokenId)?.value;
  const locked = (tokenId: number) => input.policyLocked.find((entry) => Number(entry.key) === tokenId)?.value;
  const timed = sale(0);
  assert.ok(timed, "Gnocchi timed OE sale is missing");
  assert.equal(timed.active, true, "Gnocchi timed OE must retain its configured active flag");
  assert.equal(timed.max_supply, null, "Gnocchi timed OE must remain uncapped");
  const timedStart = Date.parse(String(timed.start || ""));
  const timedEnd = Date.parse(String(timed.end || ""));
  assert.ok(Number.isFinite(timedStart) && Number.isFinite(timedEnd) && timedStart <= timedEnd, "Gnocchi timed OE window is invalid");

  const forever = sale(RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID);
  assert.ok(forever, "Gnocchi forever OE sale is missing");
  assert.equal(forever.active, true, "Gnocchi allocation token must remain active");
  assert.equal(forever.start, null, "Gnocchi allocation token must remain a forever OE without a start gate");
  assert.equal(forever.end, null, "Gnocchi allocation token must remain a forever OE without an expiry");
  assert.equal(forever.max_supply, null, "Gnocchi allocation token must remain uncapped");

  for (const tokenId of [0, RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID]) {
    assert.equal(locked(tokenId), true, `Gnocchi token ${tokenId} issuance policy must remain locked`);
    const metadata = input.metadata.find((entry) => Number(entry.key) === tokenId)?.value;
    assert.equal(hexToUtf8(String(metadata?.token_info?.[""])), input.tokenMetadataUris[tokenId]);
  }
  return { allocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID };
}

export function validateRavioliNativeDependencyTransition(input: {
  handoff: RavioliNativeRecoveryHandoff;
  gnocchiAddress: string;
  rotiniAddress: string;
  creatorBalances: Record<string, number>;
  totalSupply: Record<string, number>;
  totalReserved: Record<string, number>;
  completedProject: JsonObject;
  freshProject: JsonObject;
  nextProjectId: number;
  nextTokenId: number;
}): { projectId: number; nextTokenId: number; generatedTokenIds: [number, number] } {
  const { handoff } = input;
  assert.equal(handoff.schema, "pastaprotocol-ravioli-native-recovery-handoff@1");
  assert.equal(handoff.gnocchi.contract, input.gnocchiAddress, "native recovery Gnocchi contract differs from the accepted dependency");
  assert.equal(handoff.rotini.contract, input.rotiniAddress, "native recovery Rotini contract differs from the accepted dependency");
  assert.equal(handoff.failedRouter.allWrapperSupplyBurned, true, "native recovery left wrapper supply outstanding");
  assert.equal(handoff.failedRouter.allSalesInactive, true, "native recovery left a failed-router sale active");
  assert.deepEqual(input.creatorBalances, handoff.gnocchi.creatorBalances, "post-recovery Gnocchi creator balances drift");
  assert.deepEqual(input.totalSupply, handoff.gnocchi.totalSupply, "post-recovery Gnocchi total supply drift");
  assert.deepEqual(input.totalReserved, handoff.gnocchi.totalReserved, "post-recovery Gnocchi reserved supply drift");

  assert.equal(input.completedProject?.active, true, "completed Rotini project must remain active");
  assert.equal(Number(input.completedProject?.minted), handoff.rotini.completedProjectMinted, "completed Rotini project mint count drift");
  assert.equal(Number(input.completedProject?.reserved), handoff.rotini.completedProjectReserved, "completed Rotini project reservation drift");
  assert.equal(input.freshProject?.active, true, "fresh Rotini project must be active");
  assert.equal(hexToUtf8(String(input.freshProject?.output_mode || "")), "png", "fresh Rotini project must remain PNG-compatible");
  assert.equal(Number(input.freshProject?.price), 0, "fresh Rotini project must remain free");
  assert.equal(Number(input.freshProject?.max_supply), handoff.rotini.freshProjectMaxSupply, "fresh Rotini project supply cap drift");
  assert.equal(Number(input.freshProject?.minted), handoff.rotini.freshProjectMinted, "fresh Rotini project mint count drift");
  assert.equal(Number(input.freshProject?.reserved), handoff.rotini.freshProjectReserved, "fresh Rotini project reservation drift");
  assert.equal(input.nextProjectId, handoff.rotini.freshProjectId + 1, "Rotini next project id no longer follows the fresh recovery project");
  assert.equal(input.nextTokenId, handoff.rotini.nextTokenId, "Rotini next token id differs from the native recovery handoff");
  assert.deepEqual(
    handoff.rotini.freshRavioliGeneratedTokenIds,
    [input.nextTokenId, input.nextTokenId + 1],
    "native recovery handoff does not reserve the next two Rotini token ids for Ravioli",
  );
  const generatedTokenIds: [number, number] = [
    handoff.rotini.freshRavioliGeneratedTokenIds[0],
    handoff.rotini.freshRavioliGeneratedTokenIds[1],
  ];
  return {
    projectId: handoff.rotini.freshProjectId,
    nextTokenId: handoff.rotini.nextTokenId,
    generatedTokenIds,
  };
}

export function assertTzktFa2ContractRecord(record: unknown, address: string, creator?: string): void {
  const value = record as JsonObject;
  assert.equal(value?.address, address, "TzKT asset record address mismatch");
  assert.equal(value?.kind, "asset", `${address} is not classified by TzKT as an asset contract`);
  assert.ok(
    Array.isArray(value?.tzips) && value.tzips.some((tzip: unknown) => String(tzip).toLowerCase() === "fa2"),
    `${address} is not classified by TzKT as FA2`,
  );
  if (creator) assert.equal(value?.creator?.address, creator, `${address} was not originated by the same-run creator`);
}

export function assertTzktTokenRecords(records: unknown, address: string, tokenIds: readonly number[]): void {
  assert.ok(Array.isArray(records), `${address} TzKT token records must be an array`);
  for (const tokenId of tokenIds) {
    const token = records.find((candidate: JsonObject) =>
      candidate?.contract?.address === address && Number(candidate?.tokenId) === tokenId,
    );
    assert.ok(token, `${address} token ${tokenId} is not indexed by TzKT`);
    const totalSupply = Number(token.totalSupply);
    assert.ok(Number.isSafeInteger(totalSupply) && totalSupply >= 0, `${address} token ${tokenId} has no indexed supply`);
  }
}

export function assertTzktBalanceRecords(
  records: unknown,
  address: string,
  requirements: readonly TzktBalanceRequirement[],
): void {
  assert.ok(Array.isArray(records), `${address} TzKT balance records must be an array`);
  for (const requirement of requirements) {
    const balance: JsonObject | undefined = (records as JsonObject[]).find((candidate) =>
      candidate?.account?.address === requirement.owner &&
      candidate?.token?.contract?.address === address &&
      String(candidate?.token?.standard || "").toLowerCase() === "fa2" &&
      Number(candidate?.token?.tokenId) === requirement.tokenId,
    );
    assert.ok(balance, `${address} token ${requirement.tokenId} balance for ${requirement.owner} is not indexed by TzKT`);
    assert.equal(
      Number(balance.balance),
      requirement.balance,
      `${address} token ${requirement.tokenId} indexed balance drift for ${requirement.owner}`,
    );
  }
}

async function readIndexedFa2Evidence(input: {
  label: string;
  address: string;
  creator?: string;
  tokenIds: readonly number[];
  balances: readonly TzktBalanceRequirement[];
}): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const contract = await pollJson(
    `${input.label} TzKT FA2 classification`,
    `${base}/contracts/${input.address}`,
    (value) => value?.address === input.address && value?.kind === "asset" &&
      Array.isArray(value?.tzips) && value.tzips.some((tzip: unknown) => String(tzip).toLowerCase() === "fa2") &&
      (!input.creator || value?.creator?.address === input.creator),
  );
  assertTzktFa2ContractRecord(contract, input.address, input.creator);
  const tokens = await pollJson(
    `${input.label} TzKT token records`,
    `${base}/tokens?contract=${encodeURIComponent(input.address)}&limit=100`,
    (value) => Array.isArray(value) && input.tokenIds.every((tokenId) => value.some((token: JsonObject) =>
      token?.contract?.address === input.address && Number(token?.tokenId) === tokenId &&
      Number.isSafeInteger(Number(token?.totalSupply)) && Number(token?.totalSupply) >= 0,
    )),
  );
  assertTzktTokenRecords(tokens, input.address, input.tokenIds);
  const balances = await pollJson(
    `${input.label} TzKT balance records`,
    `${base}/tokens/balances?token.contract=${encodeURIComponent(input.address)}&limit=100`,
    (value) => Array.isArray(value) && input.balances.every((requirement) => value.some((balance: JsonObject) =>
      balance?.account?.address === requirement.owner &&
      balance?.token?.contract?.address === input.address &&
      String(balance?.token?.standard || "").toLowerCase() === "fa2" &&
      Number(balance?.token?.tokenId) === requirement.tokenId &&
      Number(balance?.balance) === requirement.balance,
    )),
  );
  assertTzktBalanceRecords(balances, input.address, input.balances);
  return { contract, tokens, balances };
}

async function readBigMap(id: unknown, label: string, limit = 100): Promise<any[]> {
  const bigMapId = Number(id);
  assert.ok(Number.isSafeInteger(bigMapId) && bigMapId > 0, `${label} must be an indexed big-map id`);
  return pollJson(
    label,
    `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${bigMapId}/keys?limit=${limit}`,
    (value) => Array.isArray(value),
  );
}

export function dependencyOriginationReceipt(
  manifest: JsonObject,
  receipt: JsonObject,
  address: string,
  creator: string,
): PastaUiLivePublicReceipt & { operationHash: string } {
  const manifestOrigins = (manifest.operations as JsonObject[]).filter((operation) => operation.kind === "origination");
  assert.equal(manifestOrigins.length, 1, `${manifest.app} manifest must contain exactly one origination`);
  const manifestOrigin = manifestOrigins[0];
  assert.equal(manifestOrigin.contractAddress, address, `${manifest.app} manifest origination address drift`);
  assert.equal(validateOperation(manifestOrigin.hash), ValidationResult.VALID);
  const receipts = Array.isArray(receipt.receipts)
    ? receipt.receipts
    : Array.isArray(receipt.bridgeReceipts?.creator)
      ? receipt.bridgeReceipts.creator
      : [];
  const origins = receipts.filter((candidate: JsonObject) => candidate.action === "originate");
  assert.equal(origins.length, 1, `${manifest.app} UI-live receipt must contain exactly one origination`);
  const origin = origins[0] as PastaUiLivePublicReceipt & { operationHash: string };
  assert.equal(origin.contractAddress, address, `${manifest.app} UI-live origination address drift`);
  assert.equal(origin.signerAddress, creator, `${manifest.app} UI-live origination signer drift`);
  assert.equal(origin.operationHash, manifestOrigin.hash, `${manifest.app} origination hash differs between manifest and receipt`);
  assert.equal(validateOperation(origin.operationHash), ValidationResult.VALID);
  return origin;
}

function appliedOperationRows(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.filter((entry) => entry?.status === "applied");
  const record = value as JsonObject;
  return record?.status === "applied" ? [record] : [];
}

async function verifySameRunOrigination(input: {
  label: string;
  address: string;
  creator: string;
  receipt: PastaUiLivePublicReceipt & { operationHash: string };
  startedAt: string;
  completedAt: string;
}): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const indexed = await pollJson(
    `${input.label} same-run origination`,
    `${base}/operations/originations/${encodeURIComponent(input.receipt.operationHash)}`,
    (value) => appliedOperationRows(value).some((operation) =>
      operation?.originatedContract?.address === input.address && operation?.sender?.address === input.creator,
    ),
  );
  const operation = appliedOperationRows(indexed).find((candidate) =>
    candidate?.originatedContract?.address === input.address && candidate?.sender?.address === input.creator,
  );
  assert.ok(operation, `${input.label} same-run origination is not indexed`);
  const startedAt = Date.parse(input.startedAt);
  const completedAt = Date.parse(input.completedAt);
  const indexedAt = Date.parse(String(operation.timestamp || ""));
  assert.ok(Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt >= startedAt);
  assert.ok(
    Number.isFinite(indexedAt) && indexedAt >= startedAt - 600_000 && indexedAt <= completedAt + 600_000,
    `${input.label} origination timestamp is outside the dependency run window`,
  );
  return {
    hash: input.receipt.operationHash,
    address: input.address,
    creator: input.creator,
    level: operation.level,
    timestamp: operation.timestamp,
    explorerUrl: `https://shadownet.tzkt.io/${input.receipt.operationHash}`,
  };
}

export async function validateRavioliDependencies(
  runRoot: string,
  runId: string,
  creatorAddress: string,
): Promise<DependencyEvidence> {
  const gnocchiRoot = path.join(runRoot, "gnocchi");
  const rotiniRoot = path.join(runRoot, "rotini");
  const gnocchiManifestPath = path.join(gnocchiRoot, "manifest.json");
  const gnocchiReceiptPath = path.join(gnocchiRoot, "artifacts", "gnocchi-ui-live-run.json");
  const rotiniManifestPath = path.join(rotiniRoot, "manifest.json");
  const rotiniReceiptPath = path.join(rotiniRoot, "artifacts", "rotini-ui-live-run.json");
  const recoveryReceiptPath = path.join(
    runRoot,
    "ravioli-dependency-recovery",
    "artifacts",
    "gnocchi-inventory-recovery.json",
  );
  const nativeRecoveryReceiptPath = path.join(
    runRoot,
    RAVIOLI_NATIVE_RECOVERY_DIRECTORY,
    "artifacts",
    "ravioli-native-recovery.json",
  );
  const [gnocchiManifestFile, gnocchiReceiptFile, rotiniManifestFile, rotiniReceiptFile, recoveryReceiptFile, nativeRecovery] = await Promise.all([
    readJsonFile(gnocchiManifestPath),
    readJsonFile(gnocchiReceiptPath),
    readJsonFile(rotiniManifestPath),
    readJsonFile(rotiniReceiptPath),
    readJsonFile(recoveryReceiptPath),
    loadRavioliNativeRecoveryHandoff(runRoot),
  ]);
  const gnocchiManifest = gnocchiManifestFile.value;
  const gnocchiReceipt = gnocchiReceiptFile.value;
  const rotiniManifest = rotiniManifestFile.value;
  const rotiniReceipt = rotiniReceiptFile.value;
  assertAppliedManifest(gnocchiManifest, "gnocchi", runId);
  assertAppliedManifest(rotiniManifest, "rotini", runId);
  await Promise.all([
    verifyManifestFiles(gnocchiRoot, gnocchiManifest),
    verifyManifestFiles(rotiniRoot, rotiniManifest),
  ]);
  const historicalSnapshots = (gnocchiManifest.artifacts || []).filter(
    (artifact: JsonObject) => artifact.kind === "historical-indexer-snapshot",
  );
  assert.equal(historicalSnapshots.length, 1, "Gnocchi dependency must bind one historical indexer snapshot");
  const acceptedEvidenceHashes: AcceptedEvidenceHashes = {
    manifestSha256: gnocchiManifestFile.digest,
    receiptSha256: gnocchiReceiptFile.digest,
    historicalSnapshotSha256: String(historicalSnapshots[0].sha256 || ""),
  };
  validateRavioliRecoveryReceipt(recoveryReceiptFile.value, acceptedEvidenceHashes);

  assert.equal(gnocchiReceipt.schema, "pastaprotocol-gnocchi-ui-live-run@1");
  assert.equal(rotiniReceipt.schema, "pastaprotocol-rotini-ui-live-run@1");
  for (const receipt of [gnocchiReceipt, rotiniReceipt]) {
    assert.equal(receipt.classification, "UI-LIVE");
    if (typeof receipt.network === "string") {
      assert.equal(receipt.network, "shadownet");
      assert.equal(receipt.chainId, SHADOWNET_CHAIN_ID);
    } else {
      assert.equal(receipt.network?.name, "shadownet");
      assert.equal(receipt.network?.chainId, SHADOWNET_CHAIN_ID);
    }
    assert.equal(receipt.actors?.creator, creatorAddress, "dependency creator must be the current Node signer");
  }
  const gnocchiAddress = String(gnocchiManifest.contracts[0].address);
  const rotiniAddress = String(rotiniManifest.contracts[0].address);
  assert.equal(gnocchiReceipt.contract?.address, gnocchiAddress);
  assert.equal(rotiniReceipt.contract?.address, rotiniAddress);
  assert.equal(nativeRecovery.handoff.gnocchi.contract, gnocchiAddress, "native recovery Gnocchi dependency address drift");
  assert.equal(nativeRecovery.handoff.rotini.contract, rotiniAddress, "native recovery Rotini dependency address drift");
  const rotiniCollector = String(rotiniReceipt.actors?.collector || "");
  assert.ok(rotiniCollector.startsWith("tz1"), "Rotini dependency receipt must identify its independent collector");
  assert.notEqual(rotiniCollector, creatorAddress, "Rotini dependency collector must be independent from the creator");
  const gnocchiOrigin = dependencyOriginationReceipt(gnocchiManifest, gnocchiReceipt, gnocchiAddress, creatorAddress);
  const rotiniOrigin = dependencyOriginationReceipt(rotiniManifest, rotiniReceipt, rotiniAddress, creatorAddress);

  assert.ok(Array.isArray(gnocchiManifest.tokens));
  const gnocchiTokens = gnocchiManifest.tokens.slice().sort((left: JsonObject, right: JsonObject) => Number(left.tokenId) - Number(right.tokenId));
  assert.deepEqual(gnocchiTokens.map((token: JsonObject) => Number(token.tokenId)), [0, 1, 2]);
  assert.ok(gnocchiTokens.every((token: JsonObject) => token.contractAddress === gnocchiAddress && /^ipfs:\/\//.test(token.metadataUri)));
  assert.ok(Array.isArray(rotiniReceipt.projects));
  const pngProject = rotiniReceipt.projects.find((project: JsonObject) => Number(project.projectId) === 0);
  assert.ok(pngProject, "Rotini receipt must expose PNG project zero");
  assert.equal(pngProject.outputMode, "png");
  assert.equal(pngProject.mimeType, "image/png");
  assert.equal(Number(pngProject.priceMutez ?? pngProject.price), 0, "Rotini pack dependency must be free");
  assert.equal(Number(pngProject.maxSupply ?? pngProject.max_supply), 3);
  assert.equal(Number(pngProject.minted), 1);
  assert.equal(Number(pngProject.reserved), 0);

  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [gnocchiStorageValue, rotiniStorageValue, gnocchiOrigination, rotiniOrigination] = await Promise.all([
    pollJson("same-run Gnocchi dependency storage", `${base}/contracts/${gnocchiAddress}/storage`, (value) =>
      Number(value?.ledger) > 0 && Number(value?.sales) > 0 && Number(value?.token_metadata) > 0 &&
      Number(value?.total_supply) > 0 && Number(value?.total_reserved) > 0,
    ),
    pollJson("same-run Rotini dependency storage", `${base}/contracts/${rotiniAddress}/storage`, (value) => Number(value?.projects) > 0 && Number(value?.token_metadata) > 0 && Number(value?.ledger) > 0),
    verifySameRunOrigination({
      label: "Gnocchi dependency",
      address: gnocchiAddress,
      creator: creatorAddress,
      receipt: gnocchiOrigin,
      startedAt: String(gnocchiReceipt.startedAt),
      completedAt: String(gnocchiReceipt.completedAt),
    }),
    verifySameRunOrigination({
      label: "Rotini dependency",
      address: rotiniAddress,
      creator: creatorAddress,
      receipt: rotiniOrigin,
      startedAt: String(rotiniReceipt.startedAt),
      completedAt: String(rotiniReceipt.completedAt),
    }),
  ]);
  const [gnocchiLedger, gnocchiSales, gnocchiMetadata, gnocchiSupply, gnocchiReserved, gnocchiPolicyLocked, rotiniProjects] = await Promise.all([
    readBigMap(gnocchiStorageValue.ledger, "same-run Gnocchi ledger"),
    readBigMap(gnocchiStorageValue.sales, "same-run Gnocchi sales"),
    readBigMap(gnocchiStorageValue.token_metadata, "same-run Gnocchi token metadata"),
    readBigMap(gnocchiStorageValue.total_supply, "same-run Gnocchi total supply"),
    readBigMap(gnocchiStorageValue.total_reserved, "same-run Gnocchi reserved supply"),
    readBigMap(gnocchiStorageValue.policy_locked, "same-run Gnocchi locked issuance policies"),
    readBigMap(rotiniStorageValue.projects, "same-run Rotini projects"),
  ]);
  const creatorBalances = {
    "0": findBalance(gnocchiLedger, creatorAddress, 0),
    "1": findBalance(gnocchiLedger, creatorAddress, 1),
  };
  assert.equal(creatorBalances["0"], 2, "Gnocchi token zero must provide two creator escrow units");
  assert.equal(creatorBalances["1"], 2, "Gnocchi token one must provide two creator escrow units");
  const totalSupply = { "0": findNat(gnocchiSupply, 0), "1": findNat(gnocchiSupply, 1) };
  const totalReserved = { "0": findNat(gnocchiReserved, 0), "1": findNat(gnocchiReserved, 1) };
  const gnocchiRoles = validateRavioliGnocchiDependencyRoles({
    sales: gnocchiSales,
    metadata: gnocchiMetadata,
    policyLocked: gnocchiPolicyLocked,
    tokenMetadataUris: gnocchiTokens.map((token: JsonObject) => String(token.metadataUri)),
  });
  const completedProject = rotiniProjects.find((entry) => Number(entry.key) === nativeRecovery.handoff.rotini.completedProjectId)?.value;
  const freshProject = rotiniProjects.find((entry) => Number(entry.key) === nativeRecovery.handoff.rotini.freshProjectId)?.value;
  assert.ok(completedProject, "native recovery completed Rotini project is missing");
  assert.ok(freshProject, "native recovery fresh Rotini project is missing");
  const operativeRotini = validateRavioliNativeDependencyTransition({
    handoff: nativeRecovery.handoff,
    gnocchiAddress,
    rotiniAddress,
    creatorBalances,
    totalSupply,
    totalReserved,
    completedProject,
    freshProject,
    nextProjectId: Number(rotiniStorageValue.next_project_id),
    nextTokenId: Number(rotiniStorageValue.next_token_id),
  });
  const baselineRotiniTokenIds = Array.from({ length: operativeRotini.nextTokenId }, (_, tokenId) => tokenId);
  const [gnocchiFa2, rotiniFa2] = await Promise.all([
    readIndexedFa2Evidence({
      label: "same-run Gnocchi dependency",
      address: gnocchiAddress,
      creator: creatorAddress,
      tokenIds: [0, 1, 2],
      balances: [
        { owner: creatorAddress, tokenId: 0, balance: 2 },
        { owner: creatorAddress, tokenId: 1, balance: 2 },
      ],
    }),
    readIndexedFa2Evidence({
      label: "same-run Rotini dependency",
      address: rotiniAddress,
      creator: creatorAddress,
      tokenIds: baselineRotiniTokenIds,
      balances: [
        ...[0, 1, 2].map((tokenId) => ({ owner: rotiniCollector, tokenId, balance: 1 })),
        ...[3, 4].map((tokenId) => ({ owner: creatorAddress, tokenId, balance: 1 })),
      ],
    }),
  ]);

  return {
    runId,
    recovery: {
      receipt: recoveryReceiptFile.value,
      receiptSha256: recoveryReceiptFile.digest,
      receiptPath: path.relative(runRoot, recoveryReceiptPath).split(path.sep).join("/"),
      acceptedEvidenceHashes,
    },
    nativeRecovery: {
      receipt: nativeRecovery.receipt,
      receiptSha256: nativeRecovery.receiptSha256,
      receiptPath: path.relative(runRoot, nativeRecoveryReceiptPath).split(path.sep).join("/"),
      handoff: nativeRecovery.handoff,
    },
    gnocchi: {
      address: gnocchiAddress,
      allocationTokenId: gnocchiRoles.allocationTokenId,
      tokenMetadataUris: gnocchiTokens.map((token: JsonObject) => String(token.metadataUri)),
      creatorBalances,
      manifestSha256: gnocchiManifestFile.digest,
      receiptSha256: gnocchiReceiptFile.digest,
      manifestPath: path.relative(runRoot, gnocchiManifestPath).split(path.sep).join("/"),
      receiptPath: path.relative(runRoot, gnocchiReceiptPath).split(path.sep).join("/"),
    },
    rotini: {
      address: rotiniAddress,
      projectId: operativeRotini.projectId,
      nextTokenId: operativeRotini.nextTokenId,
      generatedTokenIds: operativeRotini.generatedTokenIds,
      manifestSha256: rotiniManifestFile.digest,
      receiptSha256: rotiniReceiptFile.digest,
      manifestPath: path.relative(runRoot, rotiniManifestPath).split(path.sep).join("/"),
      receiptPath: path.relative(runRoot, rotiniReceiptPath).split(path.sep).join("/"),
    },
    tzkt: {
      validatedAt: new Date().toISOString(),
      gnocchi: {
        origination: gnocchiOrigination,
        fa2: gnocchiFa2,
        storage: gnocchiStorageValue,
        ledger: gnocchiLedger,
        sales: gnocchiSales,
        tokenMetadata: gnocchiMetadata,
        totalSupply: gnocchiSupply,
        totalReserved: gnocchiReserved,
        policyLocked: gnocchiPolicyLocked,
      },
      rotini: {
        origination: rotiniOrigination,
        fa2: rotiniFa2,
        storage: rotiniStorageValue,
        projects: rotiniProjects,
      },
    },
  };
}

export function assertRavioliUiLiveExecutionAllowed(environment: Record<string, string | undefined>): void {
  if (environment[EXECUTE_FLAG] !== "1") {
    block("explicit Ravioli UI-live execute flag is required", [
      `\`${EXECUTE_FLAG}=1\` is required because this lane pins durable artifacts and signs real Shadownet wrapper operations.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Ravioli UI-live runner only permits Shadownet", ["Set TEZOS_NETWORK=shadownet."]);
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [`Set \`${OUTPUT_ENV}\` to the aggregate proof-run root.`]);
  }
  for (const forbidden of [
    "PASTA_SHADOWNET_RAVIOLI_ROUTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_ADAPTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_ROTINI_ADAPTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_SKIP_SETUP",
    "PASTA_SHADOWNET_RAVIOLI_RECIPE_START",
  ]) {
    if (environment[forbidden]?.trim()) block("Ravioli UI-live proof is fresh-only", [`Remove \`${forbidden}\`; resume and address injection are refused.`]);
  }
}

async function requireFreshRavioliDirectory(runRoot: string): Promise<string> {
  const appRoot = path.join(path.resolve(runRoot), "ravioli");
  try {
    await stat(appRoot);
    block("Ravioli proof output directory already exists", [`Refusing to overwrite \`${appRoot}\`; use a fresh aggregate run root.`]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return appRoot;
}

function assertNoDataUri(value: unknown, label: string): void {
  if (typeof value === "string") {
    assert.doesNotMatch(value, /^data:/i, `${label} may not use inline data URIs`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoDataUri(child, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) assertNoDataUri(child, `${label}.${key}`);
  }
}

const PACK_SPECS = [
  { mode: 0, blind: false, editions: 1, itemCount: 1, priceMutez: 0, primitives: ["escrow"] },
  { mode: 1, blind: true, editions: 2, itemCount: 1, priceMutez: PAID_SALE_PRICE_MUTEZ, primitives: ["escrow"] },
  { mode: 2, blind: true, editions: 1, itemCount: 1, priceMutez: PAID_SALE_PRICE_MUTEZ, primitives: ["allocated_mint"] },
  { mode: 3, blind: true, editions: 1, itemCount: 1, priceMutez: PAID_SALE_PRICE_MUTEZ, primitives: ["generative_mint"] },
  { mode: 4, blind: true, editions: 1, itemCount: 3, priceMutez: PAID_SALE_PRICE_MUTEZ, primitives: ["escrow", "allocated_mint", "generative_mint"] },
] as const;

function assertPayloadPolicy(actions: unknown[], mode: number, opening: boolean): void {
  const expected = PACK_SPECS[mode];
  assert.ok(expected);
  assert.equal(actions.length, expected.itemCount);
  assert.deepEqual(actions.map((action) => primitive(action as JsonObject)), [...expected.primitives]);
  for (const action of actions as JsonObject[]) {
    const kind = primitive(action);
    const value = action[kind] as JsonObject;
    if (kind === "allocated_mint") {
      assert.equal(value.payload_commitment, ravioliPayloadCommitment(""), "allocated action must commit blake2b(empty payload)");
      if (opening) assert.equal(value.payload, "", "allocated open payload must remain empty");
    }
    if (kind === "generative_mint") {
      assert.equal(value.payload_commitment, null, "generated-at-open actions must use the explicit None commitment policy");
      if (opening) assert.match(String(value.payload || ""), /^[0-9a-f]+$/, "generative open must carry a packed payload");
    }
  }
}

export class RavioliUiLivePolicy {
  private pendingOriginationKind: "router" | "gnocchiAdapter" | "rotiniAdapter" | null = null;

  constructor(
    private readonly input: {
      administrator: string;
      dependencies: Pick<DependencyEvidence, "gnocchi" | "rotini">;
      mirror: RavioliUiStateMirror;
      pins: PinRecord[];
      codeHashes: { router: string; gnocchiAdapter: string; rotiniAdapter: string };
    },
  ) {}

  validateOrigination({ code, storage }: { code: unknown; storage: unknown }): void {
    assert.ok(storage && typeof storage === "object" && !Array.isArray(storage));
    const value = storage as JsonObject;
    assert.equal(value.administrator, this.input.administrator);
    assert.equal(value.pending_administrator, null);
    const uri = metadataUri(value);
    assert.match(uri, /^ipfs:\/\//);
    assert.doesNotMatch(uri, /^data:/i);
    const pin = this.input.pins.find((candidate) => candidate.proof.uri === uri);
    assert.ok(pin?.value && typeof pin.value === "object", "contract metadata URI must resolve to an exact current-run JSON pin");
    assertNoDataUri(pin.value, "contract metadata");
    const codeHash = hashJsonForBridge(code);
    let kind: "router" | "gnocchiAdapter" | "rotiniAdapter";
    if (codeHash === this.input.codeHashes.router) {
      kind = "router";
      assert.equal((pin.value as JsonObject).name, "Ravioli UI-LIVE Atomic Packs");
      assert.equal(this.input.mirror.routerAddress, "");
    } else if (codeHash === this.input.codeHashes.gnocchiAdapter) {
      kind = "gnocchiAdapter";
      assert.equal((pin.value as JsonObject).name, "Pasta Gnocchi Pack Adapter");
      assert.equal(this.input.mirror.gnocchiAdapterAddress, "");
    } else if (codeHash === this.input.codeHashes.rotiniAdapter) {
      kind = "rotiniAdapter";
      assert.equal((pin.value as JsonObject).name, "Pasta Rotini Pack Adapter");
      assert.equal(this.input.mirror.rotiniAdapterAddress, "");
    } else {
      assert.fail("browser requested an unrecognized Ravioli contract artifact");
    }
    assert.equal(this.pendingOriginationKind, null, "only one origination may be pending");
    this.pendingOriginationKind = kind;
  }

  consumeOriginationKind(): "router" | "gnocchiAdapter" | "rotiniAdapter" {
    assert.ok(this.pendingOriginationKind);
    const kind = this.pendingOriginationKind;
    this.pendingOriginationKind = null;
    return kind;
  }

  validateCall({ contractAddress, entrypoint, payload }: { contractAddress: string; entrypoint: string; payload: unknown }): void {
    const { mirror, dependencies, administrator } = this.input;
    if (contractAddress === dependencies.gnocchi.address) {
      if (entrypoint === "add_minter") {
        assert.equal(payload, mirror.gnocchiAdapterAddress);
        return;
      }
      assert.equal(entrypoint, "update_operators");
      assert.ok(Array.isArray(payload) && payload.length >= 1);
      for (const update of payload as JsonObject[]) {
        const add = update.add_operator;
        assert.ok(add);
        assert.equal(add.owner, administrator);
        assert.equal(add.operator, mirror.routerAddress);
        assert.ok([0, 1].includes(Number(add.token_id)));
      }
      return;
    }
    if (contractAddress === dependencies.rotini.address) {
      assert.equal(entrypoint, "add_pack_minter");
      assert.equal(payload, mirror.rotiniAdapterAddress);
      return;
    }
    if (contractAddress === mirror.gnocchiAdapterAddress) {
      if (entrypoint === "add_router") {
        assert.equal(payload, mirror.routerAddress);
        return;
      }
      assert.equal(entrypoint, "create_allocation");
      const value = payload as JsonObject;
      assert.equal(value.target, dependencies.gnocchi.address);
      assert.equal(Number(value.token_id), dependencies.gnocchi.allocationTokenId);
      assert.equal(Number(value.amount_per_open), 1);
      assert.equal(value.active, true);
      return;
    }
    if (contractAddress === mirror.rotiniAdapterAddress) {
      if (entrypoint === "add_router") {
        assert.equal(payload, mirror.routerAddress);
        return;
      }
      assert.equal(entrypoint, "create_resource");
      const value = payload as JsonObject;
      assert.equal(value.target, dependencies.rotini.address);
      assert.equal(Number(value.project_id), dependencies.rotini.projectId);
      assert.equal(value.active, true);
      return;
    }
    assert.equal(contractAddress, mirror.routerAddress, "creator may only manage same-run dependency/helper/router contracts");
    if (entrypoint === "create_pack") {
      const value = payload as JsonObject;
      const spec = PACK_SPECS[mirror.nextTokenId];
      assert.ok(spec, "unexpected sixth pack");
      const config = normalizePack(value.config);
      assert.equal(config.mode, spec.mode);
      assert.equal(config.blind, spec.blind);
      assert.equal(config.item_count, spec.itemCount);
      assert.equal(config.max_supply, spec.editions);
      assert.equal(config.committed_recipes, 0);
      assert.equal(config.finalized, false);
      assert.equal(config.cancelled, false);
      assert.ok(value.token_info instanceof MichelsonMap);
      assert.match(hexToUtf8(String(value.token_info.get(""))), /^ipfs:\/\//);
      return;
    }
    if (entrypoint === "commit_recipe") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "commit token id");
      const spec = PACK_SPECS[tokenId];
      assert.ok(spec);
      assert.match(String(value.nonce_commitment), /^[0-9a-f]{64}$/);
      assert.ok(Array.isArray(value.reservations));
      assertPayloadPolicy(value.reservations, tokenId, false);
      return;
    }
    if (entrypoint === "finalize_pack") {
      const tokenId = asSafeInteger(payload, "finalize token id");
      assert.equal(this.input.mirror.packs.get(tokenId)?.committed_recipes, PACK_SPECS[tokenId].editions);
      return;
    }
    if (entrypoint === "mint") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "mint token id");
      assert.equal(value.to_, administrator);
      assert.equal(asSafeInteger(value.amount, "mint amount"), PACK_SPECS[tokenId].editions);
      return;
    }
    if (entrypoint === "set_sale") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "sale token id");
      const sale = value.sale as JsonObject;
      assert.equal(sale.active, true);
      assert.equal(sale.seller, administrator);
      assert.equal(sale.treasury, administrator);
      assert.equal(Number(sale.price), PACK_SPECS[tokenId].priceMutez);
      assert.equal(Number(sale.remaining), PACK_SPECS[tokenId].editions);
      assert.equal(sale.start, null);
      assert.equal(sale.end, null);
      return;
    }
    if (entrypoint === "set_pack_contents") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "contents token id");
      const kit = mirror.kits.get(tokenId);
      assert.ok(kit && tokenId > 0);
      assert.equal(hexToUtf8(String(value.contents_uri)), kit.manifestUri);
      return;
    }
    assert.fail(`unexpected creator entrypoint ${entrypoint}`);
  }

  validateCollectorCall(signer: string, { contractAddress, entrypoint, payload }: { contractAddress: string; entrypoint: string; payload: unknown }): void {
    assert.equal(contractAddress, this.input.mirror.routerAddress);
    const value = payload as JsonObject;
    const tokenId = asSafeInteger(value.token_id, `${entrypoint} token id`);
    assert.ok(PACK_SPECS[tokenId]);
    if (entrypoint === "buy") {
      assert.equal(asSafeInteger(value.amount, "buy amount"), 1);
      return;
    }
    assert.equal(entrypoint, "open_pack");
    const kit = this.input.mirror.kits.get(tokenId);
    assert.ok(kit, "collector open requires the creator-issued v3 kit captured from the real UI");
    const serial = this.input.mirror.opened.get(tokenId) || 0;
    const recipe = kit.recipes[serial];
    assert.ok(recipe);
    assert.equal(value.nonce, recipe.nonce);
    assert.ok(Array.isArray(value.actions));
    assertPayloadPolicy(value.actions, tokenId, true);
    assert.ok((this.input.mirror.ledger.get(`${signer}:${tokenId}`) || 0) >= 1, "opening signer must hold a wrapper");
  }
}

export function createRavioliMirroredSessionHandler(input: {
  session: TaquitoPastaUiLiveSession;
  mirror: RavioliUiStateMirror;
  policy: RavioliUiLivePolicy;
  signerAddress: string;
}): (request: PastaUiLiveBridgeRequest) => Promise<unknown> {
  return async (request) => {
    const decoded = decodePastaUiLiveValue(request.payload) as JsonObject;
    const response = await input.session.handle(request) as JsonObject;
    if (request.action === "originate") {
      const kind = input.policy.consumeOriginationKind();
      input.mirror.bindOrigination(kind, String(response.contractAddress));
    } else if (request.action === "call") {
      const call = decoded.call as JsonObject;
      input.mirror.applySuccessfulCall(String(call.contractAddress), String(call.entrypoint), call.payload, input.signerAddress);
    } else if (request.action === "batch") {
      for (const call of decoded.calls as JsonObject[]) {
        input.mirror.applySuccessfulCall(String(call.contractAddress), String(call.entrypoint), call.payload, input.signerAddress);
      }
    }
    return response;
  };
}

function fundingAuthorization(input: {
  balanceMutez: number;
  requiredBalanceMutez: number;
  estimatedOriginationMutez?: number;
  operationReserveMutez: number;
}): PastaUiLiveFundingAuthorization {
  return {
    balanceMutez: input.balanceMutez,
    requiredBalanceMutez: input.requiredBalanceMutez,
    estimatedOriginationMutez: input.estimatedOriginationMutez || 0,
    operationReserveMutez: input.operationReserveMutez,
  };
}

async function readArtifacts(): Promise<{
  router: unknown[];
  gnocchiAdapter: unknown[];
  rotiniAdapter: unknown[];
}> {
  const entries = await Promise.all(Object.values(ARTIFACT_PATHS).map(async (filePath) => JSON.parse(await readFile(filePath, "utf8"))));
  entries.forEach((entry) => assert.ok(Array.isArray(entry)));
  return { router: entries[0], gnocchiAdapter: entries[1], rotiniAdapter: entries[2] };
}

async function openStudioPage(bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>): Promise<ActorPage> {
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  await page.goto(`${bridge.origin}${APP_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
  await installPastaUiLiveBrowserProxy(page, bridge, "UI-LIVE");
  return { browser, context, page, monitor };
}

async function openBuyerPage(input: {
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
  config: JsonObject;
}): Promise<ActorPage> {
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const proxySource = buildPastaUiLiveProxyInstallerSource(input.bridge.origin, input.bridge.sessionToken, "UI-LIVE");
  const siteSource = await readFile(SITE_SOURCE_PATH, "utf8");
  await context.route("**/pasta.config.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: `window.PASTA_SITE_CONFIG = ${JSON.stringify(input.config)};\n` });
  });
  await context.route("**/js/site.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: `${proxySource}\n${siteSource}` });
  });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  await page.goto(`${input.bridge.origin}${SITE_PATH}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => Boolean((window as any).__pastaUiLiveBridge?.installed));
  await waitForText(page, "#status", "On-chain state loaded.", 30_000);
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", process.env.PASTA_SHADOWNET_IPFS_API_URL || "http://127.0.0.1:5001");
  return { browser, context, page, monitor };
}

async function closeActor(actor: ActorPage | null): Promise<void> {
  if (!actor) return;
  actor.monitor.dispose();
  await actor.browser.close();
}

async function waitForText(page: Page, selector: string, expected: string, timeout = 300_000): Promise<void> {
  await page.locator(selector).waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    ({ selector: selected, expected: value }) => document.querySelector(selected)?.textContent?.includes(value),
    { selector, expected },
    { timeout },
  );
}

async function waitForLog(page: Page, expected: string, timeout = 300_000): Promise<void> {
  return waitForText(page, "#log", expected, timeout);
}

async function captureStage(input: {
  actor: ActorPage;
  outputRoot: string;
  ordinal: number;
  capability: string;
  stageName: string;
  focusSelector: string;
  evidence: RequiredDomEvidence[];
}): Promise<CapturePastaProofStageResult> {
  await input.actor.page.locator(input.focusSelector).scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page: input.actor.page,
    monitor: input.actor.monitor,
    outputRoot: input.outputRoot,
    app: "ravioli",
    capability: input.capability,
    stageOrdinal: input.ordinal,
    stageName: input.stageName,
    classification: "UI-LIVE",
    requiredEvidence: input.evidence,
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

function recipeMatrix(mode: number, dependencies: DependencyEvidence): JsonObject[][] {
  const escrow = (tokenId: number): JsonObject => ({
    kind: "escrow",
    fa2: dependencies.gnocchi.address,
    tokenId,
    amount: 1,
    name: `Same-run Gnocchi token ${tokenId}`,
    uri: dependencies.gnocchi.tokenMetadataUris[tokenId],
    mimeType: "application/json",
  });
  const allocated = (): JsonObject => ({ kind: "allocated", amount: 1, name: "Reserved Gnocchi mint" });
  const generative = (): JsonObject => ({ kind: "generative", amount: 1, name: "Generated-at-open Rotini iteration" });
  if (mode === 0) return [[escrow(0)]];
  if (mode === 1) return [[escrow(0)], [escrow(1)]];
  if (mode === 2) return [[allocated()]];
  if (mode === 3) return [[generative()]];
  return [[escrow(1), allocated(), generative()]];
}

async function configureStudioBase(page: Page, kuboApiUrl: string, dependencies: DependencyEvidence): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", kuboApiUrl);
  await page.fill("#collName", "Ravioli UI-LIVE Atomic Packs");
  await page.fill("#collSymbol", "RVUI");
  await page.locator("#adapterSetup > summary").click();
  await page.check("#autoAdapters");
  await page.fill("#gTargetKt", dependencies.gnocchi.address);
  await page.fill("#gTokenId", String(dependencies.gnocchi.allocationTokenId));
  await page.fill("#rTargetKt", dependencies.rotini.address);
  await page.fill("#rProjectId", String(dependencies.rotini.projectId));
}

async function connectStudio(page: Page, creatorAddress: string): Promise<void> {
  await page.click("#btnConnect");
  await waitForLog(page, `connected ${creatorAddress} on shadownet`);
}

async function configurePack(page: Page, mode: number, routerAddress: string, dependencies: DependencyEvidence): Promise<void> {
  const spec = PACK_SPECS[mode];
  const title = [
    "Known Vault",
    "Blind Funded Pool",
    "Reserved Allocation",
    "Generated At Open",
    "Hybrid Three Primitive Pack",
  ][mode];
  await page.selectOption("#bnMode", String(mode));
  await page.fill("#bnEditions", String(spec.editions));
  await page.fill("#bnName", `Ravioli UI-LIVE ${title}`);
  await page.fill("#bnDesc", `Actual Shadownet UI proof for ${MODE_NAMES[mode]}.`);
  await page.fill("#bnTags", `ravioli, ${MODE_NAMES[mode]}, ui-live, shadownet`);
  await page.check("#bnForSale");
  await page.fill("#bnPrice", String(spec.priceMutez / 1_000_000));
  await page.fill("#bnSaleCount", String(spec.editions));
  if (!(await page.locator("#recipeJson").isVisible())) {
    await page.locator("#recipeJson").locator("xpath=ancestor::details").locator("summary").click();
  }
  await page.fill("#recipeJson", JSON.stringify(recipeMatrix(mode, dependencies)));
  await page.setInputFiles("#bnArtifact", {
    name: `ravioli-wrapper-${mode}.png`,
    mimeType: "image/png",
    buffer: Buffer.concat([PNG_BYTES, Buffer.from(`ravioli-ui-live-wrapper-${mode}`)]),
  });
  if (mode === 0) {
    await page.check('input[name="target"][value="new_collection"]');
  } else {
    await page.check('input[name="target"][value="existing_contract"]');
    await page.fill("#existingKt", routerAddress);
  }
  assert.equal(await page.inputValue("#bnMode"), String(mode));
  assert.equal(await page.inputValue("#bnEditions"), String(spec.editions));
}

function validateKit(kit: PackKit, mode: number, routerAddress: string): void {
  assert.equal(kit.schema, "pasta-ravioli-open-kit@3");
  assert.equal(kit.network, "shadownet");
  assert.equal(kit.contract, routerAddress);
  assert.equal(kit.tokenId, mode);
  assert.equal(kit.mode, MODE_NAMES[mode]);
  assert.match(kit.manifestUri, /^ipfs:\/\//);
  assert.equal(kit.recipes.length, PACK_SPECS[mode].editions);
  kit.recipes.forEach((recipe, serial) => {
    assert.equal(recipe.serial, serial);
    assert.match(recipe.nonce, /^[0-9a-f]{64}$/);
    assert.equal(recipe.actions.length, PACK_SPECS[mode].itemCount);
    const normalized = recipe.actions.map((action) => {
      if (action.kind === "escrow") return { escrow: {} };
      if (action.kind === "allocated") {
        assert.equal(action.payloadCommitment, ravioliPayloadCommitment(""));
        return { allocated_mint: {} };
      }
      assert.equal(action.kind, "generative");
      assert.equal(action.payloadCommitment, null);
      return { generative_mint: {} };
    });
    assert.deepEqual(normalized.map(primitive), [...PACK_SPECS[mode].primitives]);
  });
}

export function validateRavioliOpenKitDownload(input: {
  mode: number;
  routerAddress: string;
  suggestedFilename: string;
  inPageJson: string;
  downloadedBytes: Uint8Array;
}): RavioliOpenKitDownloadCapture {
  assert.ok(Number.isSafeInteger(input.mode) && input.mode >= 0 && input.mode < PACK_SPECS.length, "Ravioli open-kit mode is invalid");
  const fileName = `ravioli-open-kit-${input.mode}.json`;
  assert.equal(input.suggestedFilename, fileName, "Ravioli open-kit download filename drift");
  const inPageKit = JSON.parse(input.inPageJson) as PackKit;
  validateKit(inPageKit, input.mode, input.routerAddress);
  const expectedBytes = Buffer.from(`${input.inPageJson}\n`, "utf8");
  assert.deepEqual(
    Buffer.from(input.downloadedBytes),
    expectedBytes,
    "Ravioli open-kit download bytes differ from the real Studio field",
  );
  const downloadedKit = JSON.parse(Buffer.from(input.downloadedBytes).toString("utf8")) as PackKit;
  assert.deepEqual(downloadedKit, inPageKit, "Ravioli open-kit downloaded content differs from the real Studio field");
  validateKit(downloadedKit, input.mode, input.routerAddress);
  return {
    tokenId: input.mode,
    mode: MODE_NAMES[input.mode],
    fileName,
    relativePath: `artifacts/open-kits/${fileName}`,
    sha256: sha256(input.downloadedBytes),
    bytes: Uint8Array.from(input.downloadedBytes),
    kit: downloadedKit,
  };
}

async function persistRavioliOpenKitCapture(input: {
  appRoot: string;
  capture: RavioliOpenKitDownloadCapture;
  priorCaptures: RavioliOpenKitDownloadCapture[];
}): Promise<void> {
  const absolutePath = path.join(input.appRoot, input.capture.relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.capture.bytes);
  assert.equal(sha256(await readFile(absolutePath)), input.capture.sha256, "persisted Ravioli open-kit digest drift");
  const captures = [...input.priorCaptures, input.capture];
  await writeFile(
    path.join(input.appRoot, "artifacts", "open-kits", "open-kit-capture-progress.json"),
    deterministicJsonBytes({
      schema: "pastaprotocol-ravioli-open-kit-capture-progress@1",
      status: captures.length === PACK_SPECS.length ? "CAPTURED" : "PARTIAL",
      disclosurePolicy: "Keep local and unpinned until all wrapper editions have opened; the final completed proof may disclose the now-spent nonces.",
      openKits: captures.map(({ tokenId, mode, fileName, relativePath, sha256: digest }) => ({
        tokenId,
        mode,
        fileName,
        path: relativePath,
        sha256: digest,
        ipfsPinned: false,
      })),
    }),
  );
}

async function publishPack(input: {
  page: Page;
  mode: number;
  mirror: RavioliUiStateMirror;
  appRoot: string;
  priorCaptures: RavioliOpenKitDownloadCapture[];
}): Promise<RavioliOpenKitDownloadCapture> {
  const downloadPromise = input.page.waitForEvent("download", { timeout: 300_000 });
  await input.page.click("#btnPublish");
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert.ok(downloadPath, `Ravioli open-kit ${input.mode} download has no local path`);
  const inPageJson = await input.page.inputValue("#openKit");
  const capture = validateRavioliOpenKitDownload({
    mode: input.mode,
    routerAddress: input.mirror.routerAddress,
    suggestedFilename: download.suggestedFilename(),
    inPageJson,
    downloadedBytes: await readFile(downloadPath),
  });
  await persistRavioliOpenKitCapture({
    appRoot: input.appRoot,
    capture,
    priorCaptures: input.priorCaptures,
  });
  await waitForLog(input.page, `pack ${input.mode} is fully reserved and ready`);
  await input.page.waitForFunction(() => !document.getElementById("btnPublish")?.hasAttribute("disabled"));
  input.mirror.registerKit(capture.kit);
  return capture;
}

async function connectBuyer(actor: ActorPage): Promise<void> {
  await actor.page.click("#connect");
  await waitForText(actor.page, "#status", "Wallet connected.");
}

async function clickBuyerCall(actor: ActorPage, selector: string, action: string): Promise<void> {
  const previousCallCount = await actor.page.evaluate(() => (
    ((window as any).__pastaUiLiveBridge?.receipts || []).filter((receipt: any) => receipt.action === "call").length
  ));
  await actor.page.click(selector);
  await actor.page.waitForFunction((before) => {
    const status = document.getElementById("status");
    const calls = ((window as any).__pastaUiLiveBridge?.receipts || []).filter((receipt: any) => receipt.action === "call").length;
    return calls > before || status?.dataset.error === "true";
  }, previousCallCount, { timeout: 300_000 });
  await actor.page.waitForFunction(() => {
    const status = document.getElementById("status");
    return status?.textContent?.includes("Confirmed on Tezos.") || status?.dataset.error === "true";
  }, undefined, { timeout: 300_000 });
  const status = (await actor.page.locator("#status").textContent()) || "";
  assert.match(status, /Confirmed on Tezos\./, `${action} failed in the buyer page: ${status}`);
}

async function verifyIndexedWrapperPurchase(input: {
  routerAddress: string;
  creator: string;
  collector: string;
  tokenId: number;
  operationHash: string;
  expectedPriceMutez: number;
}): Promise<JsonObject> {
  const fa2 = await readIndexedFa2Evidence({
    label: `Ravioli wrapper ${input.tokenId} purchase`,
    address: input.routerAddress,
    creator: input.creator,
    tokenIds: [input.tokenId],
    balances: [{ owner: input.collector, tokenId: input.tokenId, balance: 1 }],
  });
  const token = (fa2.tokens as JsonObject[]).find((candidate) => Number(candidate.tokenId) === input.tokenId);
  assert.ok(token && Number(token.totalSupply) >= 1, `Ravioli wrapper ${input.tokenId} indexed supply must remain live before opening`);
  const balance = (fa2.balances as JsonObject[]).find((candidate) =>
    candidate?.account?.address === input.collector && Number(candidate?.token?.tokenId) === input.tokenId,
  );
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const operationResponse = await pollJson(
    `Ravioli wrapper ${input.tokenId} indexed purchase operation`,
    `${base}/operations/transactions/${encodeURIComponent(input.operationHash)}`,
    (value) => appliedOperationRows(value).some((operation) =>
      operation?.sender?.address === input.collector &&
      operation?.target?.address === input.routerAddress &&
      operation?.parameter?.entrypoint === "buy",
    ),
  );
  const operation = appliedOperationRows(operationResponse).find((candidate) =>
    candidate?.sender?.address === input.collector &&
    candidate?.target?.address === input.routerAddress &&
    candidate?.parameter?.entrypoint === "buy",
  );
  assert.ok(operation);
  assert.equal(Number(operation.amount), input.expectedPriceMutez, `Ravioli wrapper ${input.tokenId} indexed payment drift`);
  return {
    tokenId: input.tokenId,
    collector: input.collector,
    balance: Number(balance?.balance),
    totalSupplyBeforeOpen: Number(token.totalSupply),
    operationHash: input.operationHash,
    amountMutez: Number(operation.amount),
    operationLevel: operation.level,
    contract: fa2.contract,
    token,
    indexedBalance: balance,
    explorerUrl: `https://shadownet.tzkt.io/${input.operationHash}`,
  };
}

async function buyWrapper(actor: ActorPage): Promise<void> {
  await clickBuyerCall(actor, "#submit", "wrapper purchase");
}

async function openWrapper(
  actor: ActorPage,
  generatedArtifact?: { name: string; bytes: Uint8Array },
  expectedChainState = "fully reserved",
): Promise<void> {
  if (generatedArtifact) {
    await actor.page.setInputFiles("#openArtifact", {
      name: generatedArtifact.name,
      mimeType: "image/png",
      buffer: Buffer.from(generatedArtifact.bytes),
    });
  }
  const secondaryVisible = await actor.page.locator("#secondarySubmit").isVisible();
  await clickBuyerCall(actor, secondaryVisible ? "#secondarySubmit" : "#submit", "atomic pack opening");
  await actor.page.waitForFunction(
    (expected) => document.getElementById("chainState")?.textContent?.trim() === expected,
    expectedChainState,
  );
}

async function operationEstimateMutez(tezos: TezosToolkit, code: unknown[], storage: unknown): Promise<number> {
  const estimate = await tezos.estimate.originate({ code, storage } as never);
  return Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez) + 100_000;
}

function operationReceipts(sessions: readonly TaquitoPastaUiLiveSession[]): PastaUiLivePublicReceipt[] {
  return sessions
    .flatMap((session) => session.getReceipts())
    .filter((receipt) => receipt.operationHash)
    .sort((left, right) => left.timestampUtc.localeCompare(right.timestampUtc));
}

async function makeCollectorSession(input: {
  tezos: TezosToolkit;
  wallet: PlatformWallet;
  routerAddress: string;
  policy: RavioliUiLivePolicy;
  mirror: RavioliUiStateMirror;
  ipfs: IpfsProofConfig;
  pins: PinRecord[];
  balanceMutez: number;
}): Promise<{
  session: TaquitoPastaUiLiveSession;
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
}> {
  const session = new TaquitoPastaUiLiveSession({
    tezos: input.tezos,
    signerAddress: input.wallet.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([input.routerAddress]),
    allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async (stage) => {
      await assertShadownet(input.tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: input.ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: input.ipfs }),
    validateOrigination: () => { throw new PastaUiLiveBridgeError("collector origination is disabled", 403); },
    validateCall: (call) => input.policy.validateCollectorCall(input.wallet.address, call),
    projectStorage: () => input.mirror.projectRouter(),
    onPin: ({ value, bytes, proof }) => {
      if (value !== undefined) assertNoDataUri(value, "collector pin");
      input.pins.push({ ...(value !== undefined ? { value } : {}), ...(bytes ? { bytes: Uint8Array.from(bytes) } : {}), proof });
    },
  });
  session.authorizeAfterFundingPreflight(fundingAuthorization({
    balanceMutez: input.balanceMutez,
    requiredBalanceMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
    operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
  }));
  const bridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: createRavioliMirroredSessionHandler({
      session,
      mirror: input.mirror,
      policy: input.policy,
      signerAddress: input.wallet.address,
    }),
  });
  return { session, bridge };
}

async function assertAllocatedPayloadSubstitutionRejected(
  tezos: TezosToolkit,
  routerAddress: string,
  kit: PackKit,
): Promise<string> {
  const contract = await tezos.contract.at(routerAddress);
  const recipe = kit.recipes[0];
  const action = recipe.actions[0];
  const wrong = {
    allocated_mint: {
      adapter: action.adapter,
      resource_id: action.resourceId,
      payload: "",
      payload_commitment: "00".repeat(32),
    },
  };
  await assert.rejects(
    () => tezos.estimate.transfer(contract.methodsObject.open_pack({ token_id: 2, nonce: recipe.nonce, actions: [wrong] }).toTransferParams()),
    /BAD_PAYLOAD_COMMITMENT|BAD_RECIPE/,
  );
  return "allocated payload substitution rejected by Shadownet simulation before injection";
}

export async function runRavioliUiLive(): Promise<RavioliUiLiveResult> {
  assertRavioliUiLiveExecutionAllowed(process.env);
  const runRoot = path.resolve(process.env[OUTPUT_ENV] || "");
  const runId = path.basename(runRoot);
  const appRoot = await requireFreshRavioliDirectory(runRoot);
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const signerConfiguration = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-ravioli-ui-live.sock",
    authToken: "local-pasta-shadownet-ravioli-ui-live",
    auditLog: "/tmp/wtf-pasta-shadownet-ravioli-ui-live-audit.log",
  });
  const signerSet = await loadSignerSet(signerConfiguration);
  assert.notEqual(signerSet.creator.address, signerSet.collector.address);
  assert.notEqual(signerSet.creator.address, signerSet.collectorTwo.address);
  const creatorTezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  const collectorOneTezos = buildToolkit(signerSet.collectorSigner, rpc.rpcUrl);
  const collectorTwoTezos = buildToolkit(signerSet.collectorTwoSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "Ravioli creator startup"),
    assertShadownet(collectorOneTezos, "Ravioli collector one startup"),
    assertShadownet(collectorTwoTezos, "Ravioli collector two startup"),
  ]);

  // This read-only gate deliberately precedes IPFS configuration, pinning, output creation,
  // origination, or any contract call. Ravioli composes independently proven same-run assets.
  const dependencies = await validateRavioliDependencies(runRoot, runId, signerSet.creator.address);
  const artifacts = await readArtifacts();
  const placeholderUri = "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
  const estimatedOriginations = (
    await Promise.all([
      operationEstimateMutez(creatorTezos, artifacts.router, routerStorage(signerSet.creator.address, placeholderUri)),
      operationEstimateMutez(creatorTezos, artifacts.gnocchiAdapter, adapterStorage(signerSet.creator.address, placeholderUri, "gnocchi")),
      operationEstimateMutez(creatorTezos, artifacts.rotiniAdapter, adapterStorage(signerSet.creator.address, placeholderUri, "rotini")),
    ])
  ).reduce((sum, value) => sum + value, 0);
  const creatorRequired = estimatedOriginations + CREATOR_OPERATION_RESERVE_MUTEZ;
  const [creatorBalanceValue, collectorOneBalanceValue, collectorTwoBalanceValue] = await Promise.all([
    creatorTezos.tz.getBalance(signerSet.creator.address),
    collectorOneTezos.tz.getBalance(signerSet.collector.address),
    collectorTwoTezos.tz.getBalance(signerSet.collectorTwo.address),
  ]);
  const creatorBalance = Number(creatorBalanceValue.toString());
  const collectorOneBalance = Number(collectorOneBalanceValue.toString());
  const collectorTwoBalance = Number(collectorTwoBalanceValue.toString());
  if (creatorBalance < creatorRequired) {
    block("Ravioli UI-live creator is underfunded before any pin or chain write", [
      `Creator ${signerSet.creator.address} has ${creatorBalance} mutez; ${creatorRequired} is required.`,
      "No Ravioli pin or chain write was attempted.",
    ]);
  }
  for (const [label, balance] of [["collector one", collectorOneBalance], ["collector two", collectorTwoBalance]] as const) {
    if (balance < COLLECTOR_OPERATION_RESERVE_MUTEZ) {
      block(`Ravioli UI-live ${label} is underfunded before any pin or chain write`, [
        `${balance} mutez is below the ${COLLECTOR_OPERATION_RESERVE_MUTEZ} mutez proof floor.`,
      ]);
    }
  }
  const ipfs = resolveIpfsProofConfig();
  const memorySamples: RavioliUiLiveMemorySample[] = [
    sampleRavioliUiLiveMemory("dependencies-and-configuration-validated"),
  ];
  await mkdir(path.join(appRoot, "artifacts", "pins"), { recursive: true });

  const pins: PinRecord[] = [];
  const mirror = new RavioliUiStateMirror();
  const codeHashes = {
    router: hashJsonForBridge(artifacts.router),
    gnocchiAdapter: hashJsonForBridge(artifacts.gnocchiAdapter),
    rotiniAdapter: hashJsonForBridge(artifacts.rotiniAdapter),
  };
  const policy = new RavioliUiLivePolicy({
    administrator: signerSet.creator.address,
    dependencies,
    mirror,
    pins,
    codeHashes,
  });
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: creatorTezos,
    signerAddress: signerSet.creator.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([dependencies.gnocchi.address, dependencies.rotini.address]),
    allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async (stage) => {
      await assertShadownet(creatorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
    validateOrigination: (input) => policy.validateOrigination(input),
    validateCall: (input) => policy.validateCall(input),
    projectStorage: (storage) => mirror.project(storage),
    onPin: ({ value, bytes, proof }) => {
      if (value !== undefined) assertNoDataUri(value, "creator pin");
      pins.push({ ...(value !== undefined ? { value } : {}), ...(bytes ? { bytes: Uint8Array.from(bytes) } : {}), proof });
    },
  });
  creatorSession.authorizeAfterFundingPreflight(fundingAuthorization({
    balanceMutez: creatorBalance,
    requiredBalanceMutez: creatorRequired,
    estimatedOriginationMutez: estimatedOriginations,
    operationReserveMutez: CREATOR_OPERATION_RESERVE_MUTEZ,
  }));
  const creatorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: createRavioliMirroredSessionHandler({
      session: creatorSession,
      mirror,
      policy,
      signerAddress: signerSet.creator.address,
    }),
  });

  const screenshots: CapturePastaProofStageResult[] = [];
  const kits: PackKit[] = [];
  const openKitCaptures: RavioliOpenKitDownloadCapture[] = [];
  let ordinal = 0;
  let creatorActor: ActorPage | null = null;
  let collectorOne: Awaited<ReturnType<typeof makeCollectorSession>> | null = null;
  let collectorTwo: Awaited<ReturnType<typeof makeCollectorSession>> | null = null;
  let buyerActor: ActorPage | null = null;
  let hybridOpenHash = "";
  const negativeAssertions: string[] = [];
  const wrapperPurchaseCheckpoints: JsonObject[] = [];
  const startedAt = new Date().toISOString();
  try {
    creatorActor = await openStudioPage(creatorBridge);
    await configureStudioBase(creatorActor.page, ipfs.apiUrl, dependencies);
    memorySamples.push(sampleRavioliUiLiveMemory("studio-configured"));
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability: "compose five atomic pack modes",
      stageName: "Same-run dependencies entered",
      focusSelector: "#adapterSetup",
      evidence: [{ selector: "h1", expectedText: "Ravioli" }, { selector: "#adapterSetup", expectedText: "Automatic allocation" }],
    }));
    await connectStudio(creatorActor.page, signerSet.creator.address);
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability: "compose five atomic pack modes",
      stageName: "Creator connected on Shadownet",
      focusSelector: "#account",
      evidence: [{ selector: "#account", expectedText: signerSet.creator.address.slice(0, 7) }, { selector: "#log", expectedText: "on shadownet" }],
    }));

    for (let mode = 0; mode < PACK_SPECS.length; mode += 1) {
      await configurePack(creatorActor.page, mode, mirror.routerAddress, dependencies);
      screenshots.push(await captureStage({
        actor: creatorActor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "compose five atomic pack modes",
        stageName: `${MODE_NAMES[mode]} configured`,
        focusSelector: "#bnMode",
        evidence: [{ selector: "h1", expectedText: "Ravioli" }, { selector: "#adapterSetup", expectedText: "typed helper adapters" }],
      }));
      const openKitCapture = await publishPack({
        page: creatorActor.page,
        mode,
        mirror,
        appRoot,
        priorCaptures: openKitCaptures,
      });
      openKitCaptures.push(openKitCapture);
      kits.push(openKitCapture.kit);
      memorySamples.push(sampleRavioliUiLiveMemory(`pack-${mode}-published`));
      screenshots.push(await captureStage({
        actor: creatorActor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "compose five atomic pack modes",
        stageName: `${MODE_NAMES[mode]} funded and issued`,
        focusSelector: "#log",
        evidence: [{ selector: "#log", expectedText: `pack ${mode} is fully reserved and ready` }],
      }));
    }
    assert.ok(mirror.routerAddress && mirror.gnocchiAdapterAddress && mirror.rotiniAdapterAddress);
    assert.equal(pins.filter((pin) => pin.proof.fileName.includes("pack-adapter-contract")).length, 2);

    collectorOne = await makeCollectorSession({
      tezos: collectorOneTezos,
      wallet: signerSet.collector,
      routerAddress: mirror.routerAddress,
      policy,
      mirror,
      ipfs,
      pins,
      balanceMutez: collectorOneBalance,
    });
    collectorTwo = await makeCollectorSession({
      tezos: collectorTwoTezos,
      wallet: signerSet.collectorTwo,
      routerAddress: mirror.routerAddress,
      policy,
      mirror,
      ipfs,
      pins,
      balanceMutez: collectorTwoBalance,
    });

    const openings = [
      { tokenId: 0, collector: collectorOne, wallet: signerSet.collector, label: "collector one", postOpenChainState: "0 wrappers live · fully reserved" },
      { tokenId: 1, collector: collectorOne, wallet: signerSet.collector, label: "collector one", postOpenChainState: "Primary sale open · fully reserved" },
      { tokenId: 1, collector: collectorTwo, wallet: signerSet.collectorTwo, label: "collector two", postOpenChainState: "0 wrappers live · fully reserved" },
      { tokenId: 2, collector: collectorOne, wallet: signerSet.collector, label: "collector one", postOpenChainState: "0 wrappers live · fully reserved" },
      { tokenId: 3, collector: collectorTwo, wallet: signerSet.collectorTwo, label: "collector two", postOpenChainState: "0 wrappers live · fully reserved" },
      { tokenId: 4, collector: collectorOne, wallet: signerSet.collector, label: "collector one", postOpenChainState: "0 wrappers live · fully reserved" },
    ] as const;
    for (const opening of openings) {
      buyerActor = await openBuyerPage({
        bridge: opening.collector.bridge,
        config: {
          app: "ravioli",
          label: "Ravioli",
          title: `Ravioli UI-LIVE ${MODE_NAMES[opening.tokenId]}`,
          description: "Independent collector purchase and atomic opening on Shadownet.",
          network: "shadownet",
          contract: mirror.routerAddress,
          tokenId: opening.tokenId,
          openKit: kits[opening.tokenId],
          ipfsGateway: `${ipfs.publicGatewayUrl}/`,
        },
      });
      await connectBuyer(buyerActor);
      const purchaseReceiptCount = opening.collector.session.getReceipts().length;
      await buyWrapper(buyerActor);
      const purchaseReceipts = opening.collector.session.getReceipts().slice(purchaseReceiptCount);
      const buyReceipt = purchaseReceipts.find((receipt) => receipt.entrypoints?.includes("buy"));
      assert.ok(buyReceipt?.operationHash, `Ravioli wrapper ${opening.tokenId} purchase receipt is missing`);
      wrapperPurchaseCheckpoints.push(await verifyIndexedWrapperPurchase({
        routerAddress: mirror.routerAddress,
        creator: signerSet.creator.address,
        collector: opening.wallet.address,
        tokenId: opening.tokenId,
        operationHash: buyReceipt.operationHash,
        expectedPriceMutez: PACK_SPECS[opening.tokenId].priceMutez,
      }));
      memorySamples.push(sampleRavioliUiLiveMemory(`pack-${opening.tokenId}-${opening.label.replaceAll(" ", "-")}-bought`));
      screenshots.push(await captureStage({
        actor: buyerActor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "buy and atomically open five pack modes",
        stageName: `${opening.label} bought ${MODE_NAMES[opening.tokenId]}`,
        focusSelector: "#chainState",
        evidence: [{ selector: "#title", expectedText: MODE_NAMES[opening.tokenId] }, { selector: "#status", expectedText: "Confirmed on Tezos" }],
      }));
      if (opening.tokenId === 2) {
        negativeAssertions.push(await assertAllocatedPayloadSubstitutionRejected(collectorOneTezos, mirror.routerAddress, kits[2]));
      }
      const receiptCount = opening.collector.session.getReceipts().length;
      const generatedArtifact = opening.tokenId >= 3
        ? { name: `ravioli-generated-${opening.tokenId}.png`, bytes: Buffer.concat([PNG_BYTES, Buffer.from(`ravioli-generated-${opening.tokenId}`)]) }
        : undefined;
      await openWrapper(buyerActor, generatedArtifact, opening.postOpenChainState);
      const newReceipts = opening.collector.session.getReceipts().slice(receiptCount);
      const openReceipt = newReceipts.find((receipt) => receipt.entrypoints?.includes("open_pack"));
      assert.ok(openReceipt?.operationHash);
      if (opening.tokenId === 4) hybridOpenHash = openReceipt.operationHash;
      memorySamples.push(sampleRavioliUiLiveMemory(`pack-${opening.tokenId}-${opening.label.replaceAll(" ", "-")}-opened`));
      screenshots.push(await captureStage({
        actor: buyerActor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "buy and atomically open five pack modes",
        stageName: `${opening.label} opened ${MODE_NAMES[opening.tokenId]}`,
        focusSelector: "#chainState",
        evidence: [{ selector: "#chainState", expectedText: opening.postOpenChainState }, { selector: "#status", expectedText: "Confirmed on Tezos" }],
      }));
      await closeActor(buyerActor);
      buyerActor = null;
    }
    for (let tokenId = 1; tokenId < kits.length; tokenId += 1) {
      await creatorActor.page.fill("#opKt", mirror.routerAddress);
      await creatorActor.page.fill("#opTokenId", String(tokenId));
      await creatorActor.page.fill("#revealUri", kits[tokenId].manifestUri);
      await creatorActor.page.click("#btnReveal");
      await waitForText(creatorActor.page, ".pp-notice", "reveal is permanent");
      await creatorActor.page.waitForFunction(() => !document.getElementById("btnReveal")?.hasAttribute("disabled"));
    }
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability: "reveal exact pinned pack manifests",
      stageName: "Blind contents manifests published",
      focusSelector: "#revealUri",
      evidence: [{ selector: ".pp-notice", expectedText: "reveal is permanent" }, { selector: "h2", index: 5, expectedText: "Open / reveal" }],
    }));
  } finally {
    await closeActor(buyerActor);
    await closeActor(creatorActor);
    await Promise.all([creatorBridge.close(), collectorOne?.bridge.close(), collectorTwo?.bridge.close()]);
  }

  assert.ok(hybridOpenHash);
  assert.equal(mirror.opened.get(0), 1);
  assert.equal(mirror.opened.get(1), 2);
  assert.equal(mirror.opened.get(2), 1);
  assert.equal(mirror.opened.get(3), 1);
  assert.equal(mirror.opened.get(4), 1);
  assert.ok([...mirror.totalSupply.values()].every((value) => value === 0));
  const sessions = [creatorSession, collectorOne!.session, collectorTwo!.session];
  const writeReceipts = operationReceipts(sessions);
  const operationHashes = writeReceipts.map((receipt) => receipt.operationHash || "");
  assert.equal(new Set(operationHashes).size, operationHashes.length);
  assert.equal(writeReceipts.filter((receipt) => receipt.action === "originate").length, 3);
  assert.equal(writeReceipts.filter((receipt) => receipt.entrypoints?.includes("mint")).length, 5);
  assert.equal(writeReceipts.filter((receipt) => receipt.entrypoints?.includes("open_pack")).length, 6);

  const indexed = await verifyRavioliIndexedProof({
    dependencies,
    routerAddress: mirror.routerAddress,
    gnocchiAdapterAddress: mirror.gnocchiAdapterAddress,
    rotiniAdapterAddress: mirror.rotiniAdapterAddress,
    creator: signerSet.creator.address,
    collectorOne: signerSet.collector.address,
    collectorTwo: signerSet.collectorTwo.address,
    kits,
    pins,
    hybridOpenHash,
    wrapperPurchaseCheckpoints,
    receipts: writeReceipts,
  });
  memorySamples.push(sampleRavioliUiLiveMemory("indexed-proof-verified"));
  return writeRavioliProofPackage({
    appRoot,
    runRoot,
    runId,
    rpcUrl: rpc.rpcUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    dependencies,
    actors: {
      creator: signerSet.creator.address,
      collectorOne: signerSet.collector.address,
      collectorTwo: signerSet.collectorTwo.address,
    },
    funding: {
      creator: creatorSession.getFundingAuthorization(),
      collectorOne: collectorOne!.session.getFundingAuthorization(),
      collectorTwo: collectorTwo!.session.getFundingAuthorization(),
    },
    mirror,
    kits,
    openKitCaptures,
    pins,
    screenshots,
    receipts: sessions.flatMap((session) => session.getReceipts()),
    writeReceipts,
    operationHashes,
    indexed,
    negativeAssertions,
    memorySamples,
  });
}

function pinUriList(pins: readonly PinRecord[], predicate: (pin: PinRecord) => boolean): string[] {
  return pins.filter(predicate).map((pin) => pin.proof.uri);
}

function decodedUri(value: unknown): string {
  const text = String(value || "");
  return text.startsWith("ipfs://") ? text : hexToUtf8(text);
}

async function assertContractMetadataUri(label: string, bigMap: unknown, expected: string): Promise<void> {
  const entries = await readBigMap(bigMap, `${label} contract metadata`, 20);
  const entry = entries.find((candidate) => String(candidate?.key ?? "") === "");
  assert.equal(decodedUri(entry?.value), expected, `${label} contract metadata URI drift`);
}

async function verifyEveryOperation(receipts: readonly PastaUiLivePublicReceipt[]): Promise<JsonObject[]> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const verified: JsonObject[] = [];
  for (const receipt of receipts) {
    assert.ok(receipt.operationHash);
    const family = receipt.action === "originate" ? "originations" : "transactions";
    const response = await pollJson(
      `TzKT ${family} ${receipt.operationHash}`,
      `${base}/operations/${family}/${encodeURIComponent(receipt.operationHash)}`,
      (value) => appliedOperationRows(value).some((entry) => {
        if (entry?.sender?.address !== receipt.signerAddress) return false;
        if (receipt.action === "originate") return entry?.originatedContract?.address === receipt.contractAddress;
        return entry?.target?.address === receipt.contractAddress &&
          receipt.entrypoints?.includes(String(entry?.parameter?.entrypoint || "default"));
      }),
    );
    const operations = appliedOperationRows(response);
    const matched = operations.find((entry) => {
      if (entry?.sender?.address !== receipt.signerAddress) return false;
      if (receipt.action === "originate") return entry?.originatedContract?.address === receipt.contractAddress;
      return entry?.target?.address === receipt.contractAddress &&
        receipt.entrypoints?.includes(String(entry?.parameter?.entrypoint || "default"));
    });
    assert.ok(matched, `${receipt.operationHash} lacks the exact signer/target/entrypoint operation`);
    verified.push({
      hash: receipt.operationHash,
      action: receipt.action,
      entrypoints: receipt.entrypoints || [],
      appliedCount: operations.length,
      signerAddress: receipt.signerAddress,
      contractAddress: receipt.contractAddress,
      level: matched.level,
      explorerUrl: `https://shadownet.tzkt.io/${receipt.operationHash}`,
    });
  }
  return verified;
}

async function verifyRavioliIndexedProof(input: {
  dependencies: DependencyEvidence;
  routerAddress: string;
  gnocchiAdapterAddress: string;
  rotiniAdapterAddress: string;
  creator: string;
  collectorOne: string;
  collectorTwo: string;
  kits: PackKit[];
  pins: PinRecord[];
  hybridOpenHash: string;
  wrapperPurchaseCheckpoints: JsonObject[];
  receipts?: PastaUiLivePublicReceipt[];
}): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const generatedTokenIds = [...input.dependencies.rotini.generatedTokenIds] as [number, number];
  assert.deepEqual(
    generatedTokenIds,
    input.dependencies.nativeRecovery.handoff.rotini.freshRavioliGeneratedTokenIds,
    "Ravioli generated token ids differ from the native recovery handoff",
  );
  const finalRotiniNextTokenId = generatedTokenIds[1] + 1;
  const wrapperMetadataUris = pinUriList(input.pins, (pin) => pin.proof.fileName === "token.json");
  const wrapperMediaUris = pinUriList(input.pins, (pin) => Boolean(pin.bytes) && pin.proof.fileName.startsWith("ravioli-wrapper-"));
  const generatedMetadataUris = pinUriList(input.pins, (pin) => pin.proof.fileName === "ravioli-generated-token.json");
  const generatedMediaUris = pinUriList(input.pins, (pin) => Boolean(pin.bytes) && pin.proof.fileName.startsWith("ravioli-generated-"));
  const collectionUris = pinUriList(input.pins, (pin) => pin.proof.fileName === "collection.json");
  const gnocchiAdapterMetadata = input.pins.find((pin) => pin.proof.fileName === "pasta-gnocchi-pack-adapter-contract.json")?.proof.uri;
  const rotiniAdapterMetadata = input.pins.find((pin) => pin.proof.fileName === "pasta-rotini-pack-adapter-contract.json")?.proof.uri;
  assert.equal(wrapperMetadataUris.length, 5);
  assert.equal(wrapperMediaUris.length, 5);
  assert.equal(generatedMetadataUris.length, 2);
  assert.equal(generatedMediaUris.length, 2);
  assert.equal(collectionUris.length, 5);
  assert.ok(gnocchiAdapterMetadata && rotiniAdapterMetadata);
  assert.equal(input.wrapperPurchaseCheckpoints.length, 6, "every Ravioli wrapper purchase needs a pre-open TzKT balance checkpoint");
  assert.deepEqual(input.wrapperPurchaseCheckpoints.map((checkpoint) => Number(checkpoint.tokenId)), [0, 1, 1, 2, 3, 4]);
  assert.ok(input.wrapperPurchaseCheckpoints.every((checkpoint) => Number(checkpoint.balance) === 1));
  assert.deepEqual(
    input.wrapperPurchaseCheckpoints.map((checkpoint) => Number(checkpoint.amountMutez)),
    [0, 1, 1, 1, 1, 1],
    "Ravioli must preserve one indexed free wrapper purchase alongside its paid sales",
  );
  const [routerStorageValue, gnocchiAdapterStorageValue, rotiniAdapterStorageValue, gnocchiStorageValue, rotiniStorageValue] = await Promise.all([
    pollJson("Ravioli UI-live router storage", `${base}/contracts/${input.routerAddress}/storage`, (value) => Number(value?.next_token_id) === 5 && Number(value?.packs) > 0 && Number(value?.opened) > 0),
    pollJson("Ravioli Gnocchi adapter storage", `${base}/contracts/${input.gnocchiAdapterAddress}/storage`, (value) => Number(value?.next_resource_id) === 2 && Number(value?.metadata) > 0),
    pollJson("Ravioli Rotini adapter storage", `${base}/contracts/${input.rotiniAdapterAddress}/storage`, (value) => Number(value?.next_resource_id) === 2 && Number(value?.metadata) > 0),
    pollJson("post-Ravioli Gnocchi storage", `${base}/contracts/${input.dependencies.gnocchi.address}/storage`, (value) => Number(value?.ledger) > 0 && Number(value?.total_reserved) > 0),
    pollJson("post-Ravioli Rotini storage", `${base}/contracts/${input.dependencies.rotini.address}/storage`, (value) => Number(value?.next_token_id) === finalRotiniNextTokenId && Number(value?.token_artifact) > 0),
  ]);
  const [packs, opened, supplies, wrapperMetadata, gnocchiLedger, gnocchiReserved, rotiniProjects, rotiniLedger, rotiniMetadata, rotiniArtifacts] = await Promise.all([
    readBigMap(routerStorageValue.packs, "Ravioli indexed pack configs"),
    readBigMap(routerStorageValue.opened, "Ravioli indexed open counters"),
    readBigMap(routerStorageValue.total_supply, "Ravioli indexed wrapper supplies"),
    readBigMap(routerStorageValue.token_metadata, "Ravioli indexed wrapper metadata"),
    readBigMap(gnocchiStorageValue.ledger, "post-Ravioli Gnocchi balances"),
    readBigMap(gnocchiStorageValue.total_reserved, "post-Ravioli Gnocchi reserved capacity"),
    readBigMap(rotiniStorageValue.projects, "post-Ravioli Rotini projects"),
    readBigMap(rotiniStorageValue.ledger, "post-Ravioli Rotini generated owners"),
    readBigMap(rotiniStorageValue.token_metadata, "post-Ravioli Rotini token metadata"),
    readBigMap(rotiniStorageValue.token_artifact, "post-Ravioli Rotini token artifacts"),
  ]);
  for (let tokenId = 0; tokenId < 5; tokenId += 1) {
    const pack = packs.find((entry) => Number(entry.key) === tokenId)?.value;
    assert.ok(pack?.finalized === true && pack?.cancelled === false);
    assert.equal(Number(pack.mode), PACK_SPECS[tokenId].mode);
    assert.equal(Number(pack.max_supply), PACK_SPECS[tokenId].editions);
    assert.equal(Number(pack.item_count), PACK_SPECS[tokenId].itemCount);
    assert.equal(Number(pack.committed_recipes), PACK_SPECS[tokenId].editions);
    assert.equal(decodedUri(pack.contents_uri), input.kits[tokenId].manifestUri);
    assert.equal(Number(opened.find((entry) => Number(entry.key) === tokenId)?.value), PACK_SPECS[tokenId].editions);
    assert.equal(Number(supplies.find((entry) => Number(entry.key) === tokenId)?.value), 0);
    const indexedMetadata = wrapperMetadata.find((entry) => Number(entry.key) === tokenId)?.value?.token_info?.[""];
    assert.equal(decodedUri(indexedMetadata), wrapperMetadataUris[tokenId]);
    const metadataPin = input.pins.find((pin) => pin.proof.uri === wrapperMetadataUris[tokenId]);
    assert.equal((metadataPin?.value as JsonObject)?.artifactUri, wrapperMediaUris[tokenId]);
  }
  const baselineLedger = input.dependencies.tzkt.gnocchi.ledger as any[];
  assert.equal(findBalance(gnocchiLedger, input.creator, 0), 0);
  assert.equal(findBalance(gnocchiLedger, input.creator, 1), 0);
  assert.equal(findBalance(gnocchiLedger, input.collectorOne, 0), findBalance(baselineLedger, input.collectorOne, 0) + 2);
  assert.equal(findBalance(gnocchiLedger, input.collectorOne, 1), findBalance(baselineLedger, input.collectorOne, 1) + 3);
  assert.equal(findBalance(gnocchiLedger, input.collectorTwo, 0), findBalance(baselineLedger, input.collectorTwo, 0));
  assert.equal(findBalance(gnocchiLedger, input.collectorTwo, 1), findBalance(baselineLedger, input.collectorTwo, 1) + 1);
  assert.equal(Number(gnocchiReserved.find((entry) => Number(entry.key) === 0)?.value || 0), 0);
  const completedProject = rotiniProjects.find((entry) => Number(entry.key) === input.dependencies.nativeRecovery.handoff.rotini.completedProjectId)?.value;
  assert.ok(completedProject, "completed native-recovery Rotini project disappeared after Ravioli execution");
  assert.equal(Number(completedProject.minted), input.dependencies.nativeRecovery.handoff.rotini.completedProjectMinted);
  assert.equal(Number(completedProject.reserved), input.dependencies.nativeRecovery.handoff.rotini.completedProjectReserved);
  const project = rotiniProjects.find((entry) => Number(entry.key) === input.dependencies.rotini.projectId)?.value;
  assert.ok(project, "fresh native-recovery Rotini project disappeared after Ravioli execution");
  assert.equal(project.active, true);
  assert.equal(Number(project.max_supply), input.dependencies.nativeRecovery.handoff.rotini.freshProjectMaxSupply);
  assert.equal(
    Number(project.minted),
    input.dependencies.nativeRecovery.handoff.rotini.freshProjectMinted + generatedTokenIds.length,
  );
  assert.equal(Number(project.reserved), 0);
  const generatedOwners = [input.collectorTwo, input.collectorOne];
  for (let index = 0; index < generatedTokenIds.length; index += 1) {
    const tokenId: number = generatedTokenIds[index]!;
    assert.equal(findBalance(rotiniLedger, generatedOwners[index], tokenId), 1);
    const tokenInfo = rotiniMetadata.find((entry) => Number(entry.key) === tokenId)?.value?.token_info;
    assert.equal(decodedUri(tokenInfo?.[""]), generatedMetadataUris[index]);
    const metadataPin = input.pins.find((pin) => pin.proof.uri === generatedMetadataUris[index]);
    assert.equal((metadataPin?.value as JsonObject)?.artifactUri, generatedMediaUris[index]);
    const artifact = rotiniArtifacts.find((entry) => Number(entry.key) === tokenId)?.value;
    assert.equal(decodedUri(artifact?.artifact_uri), generatedMediaUris[index]);
    assert.equal(decodedUri(artifact?.display_uri), generatedMediaUris[index]);
    assert.equal(decodedUri(artifact?.thumbnail_uri), generatedMediaUris[index]);
    assert.equal(decodedUri(artifact?.mime_type), "image/png");
  }
  await Promise.all([
    assertContractMetadataUri("Ravioli router", routerStorageValue.metadata, collectionUris[0]),
    assertContractMetadataUri("Ravioli Gnocchi adapter", gnocchiAdapterStorageValue.metadata, gnocchiAdapterMetadata),
    assertContractMetadataUri("Ravioli Rotini adapter", rotiniAdapterStorageValue.metadata, rotiniAdapterMetadata),
  ]);
  const hybridTree = await pollJson(
    "Ravioli hybrid operation tree",
    `${base}/operations/transactions/${encodeURIComponent(input.hybridOpenHash)}`,
    (value) => Array.isArray(value) && value.length > 0 && value.every((operation) => operation?.status === "applied"),
  );
  const hybridEntrypoints = [...new Set(hybridTree.map((operation: JsonObject) => String(operation?.parameter?.entrypoint || "default")))].sort();
  for (const expected of ["open_pack", "transfer", "fulfill", "mint_reserved", "mint_pack_iteration"]) {
    assert.ok(hybridEntrypoints.includes(expected), `hybrid operation tree lacks ${expected}`);
  }
  const [routerFa2, gnocchiFa2, rotiniFa2] = await Promise.all([
    readIndexedFa2Evidence({
      label: "final Ravioli router",
      address: input.routerAddress,
      creator: input.creator,
      tokenIds: [0, 1, 2, 3, 4],
      balances: [
        ...[0, 1, 2, 3, 4].map((tokenId) => ({ owner: input.creator, tokenId, balance: 0 })),
        { owner: input.collectorOne, tokenId: 0, balance: 0 },
        { owner: input.collectorOne, tokenId: 1, balance: 0 },
        { owner: input.collectorTwo, tokenId: 1, balance: 0 },
        { owner: input.collectorOne, tokenId: 2, balance: 0 },
        { owner: input.collectorTwo, tokenId: 3, balance: 0 },
        { owner: input.collectorOne, tokenId: 4, balance: 0 },
      ],
    }),
    readIndexedFa2Evidence({
      label: "post-Ravioli Gnocchi delivery",
      address: input.dependencies.gnocchi.address,
      creator: input.creator,
      tokenIds: [0, 1, 2],
      balances: [
        { owner: input.creator, tokenId: 0, balance: 0 },
        { owner: input.creator, tokenId: 1, balance: 0 },
        { owner: input.collectorOne, tokenId: 0, balance: findBalance(gnocchiLedger, input.collectorOne, 0) },
        { owner: input.collectorOne, tokenId: 1, balance: findBalance(gnocchiLedger, input.collectorOne, 1) },
        { owner: input.collectorTwo, tokenId: 0, balance: findBalance(gnocchiLedger, input.collectorTwo, 0) },
        { owner: input.collectorTwo, tokenId: 1, balance: findBalance(gnocchiLedger, input.collectorTwo, 1) },
      ],
    }),
    readIndexedFa2Evidence({
      label: "post-Ravioli Rotini generation",
      address: input.dependencies.rotini.address,
      creator: input.creator,
      tokenIds: [...Array.from({ length: input.dependencies.rotini.nextTokenId }, (_, tokenId) => tokenId), ...generatedTokenIds],
      balances: [
        { owner: input.creator, tokenId: 3, balance: 1 },
        { owner: input.creator, tokenId: 4, balance: 1 },
        ...generatedTokenIds.map((tokenId, index) => ({ owner: generatedOwners[index], tokenId, balance: 1 })),
      ],
    }),
  ]);
  const indexedWrapperTokens = (routerFa2.tokens as JsonObject[])
    .filter((token) => token?.contract?.address === input.routerAddress)
    .sort((left, right) => Number(left.tokenId) - Number(right.tokenId));
  assert.deepEqual(indexedWrapperTokens.map((token) => Number(token.tokenId)), [0, 1, 2, 3, 4]);
  assert.ok(indexedWrapperTokens.every((token) => Number(token.totalSupply) === 0), "TzKT wrapper supply must reflect every atomic burn");
  const verifiedOperations = input.receipts ? await verifyEveryOperation(input.receipts) : [];
  return {
    verifiedAt: new Date().toISOString(),
    contracts: {
      router: routerStorageValue,
      gnocchiAdapter: gnocchiAdapterStorageValue,
      rotiniAdapter: rotiniAdapterStorageValue,
    },
    indexedFa2: {
      router: routerFa2,
      gnocchi: gnocchiFa2,
      rotini: rotiniFa2,
    },
    wrapperTokenCount: indexedWrapperTokens.length,
    wrapperPurchaseCheckpoints: input.wrapperPurchaseCheckpoints,
    wrapperMetadataUris,
    wrapperMediaUris,
    packManifestUris: input.kits.map((kit) => kit.manifestUri),
    opened: Object.fromEntries(PACK_SPECS.map((spec, tokenId) => [String(tokenId), spec.editions])),
    gnocchiDeliveryBalances: {
      creator: { token0: 0, token1: 0 },
      collectorOne: { token0: findBalance(gnocchiLedger, input.collectorOne, 0), token1: findBalance(gnocchiLedger, input.collectorOne, 1) },
      collectorTwo: { token0: findBalance(gnocchiLedger, input.collectorTwo, 0), token1: findBalance(gnocchiLedger, input.collectorTwo, 1) },
    },
    generatedTokenIds,
    generatedMetadataUris,
    generatedMediaUris,
    hybridOpenHash: input.hybridOpenHash,
    hybridEntrypoints,
    verifiedOperations,
  };
}

function safeArtifactName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "artifact.bin";
}

function pinKind(pin: PinRecord): string {
  if (pin.bytes) return pin.proof.fileName.startsWith("ravioli-generated-") ? "generated-token-media" : "wrapper-media";
  if (pin.proof.fileName === "token.json") return "token-metadata";
  if (pin.proof.fileName === "ravioli-pack-manifest.json") return "pack-manifest";
  if (pin.proof.fileName === "ravioli-generated-token.json") return "generated-token-metadata";
  if (pin.proof.fileName.includes("pack-adapter-contract")) return "contract-metadata";
  return "collection-metadata";
}

async function writePinArtifacts(appRoot: string, pins: readonly PinRecord[]) {
  const records: Array<JsonObject> = [];
  const byUri = new Map<string, JsonObject>();
  for (let index = 0; index < pins.length; index += 1) {
    const pin = pins[index];
    const bytes = pin.bytes ? Uint8Array.from(pin.bytes) : deterministicJsonBytes(pin.value);
    assert.equal(sha256(bytes), pin.proof.sha256);
    const existing = byUri.get(pin.proof.uri);
    if (existing) {
      assert.equal(existing.sha256, pin.proof.sha256, `reused CID ${pin.proof.uri} changed bytes`);
      continue;
    }
    const extension = pin.bytes ? path.extname(pin.proof.fileName).toLowerCase() || ".bin" : ".json";
    const stem = safeArtifactName(pin.proof.fileName.replace(/\.[^.]+$/, ""));
    const relativePath = `artifacts/pins/${String(index + 1).padStart(3, "0")}-${stem}${extension}`;
    await writeFile(path.join(appRoot, relativePath), bytes);
    const record = {
      id: `pin-${String(index + 1).padStart(3, "0")}-${stem}`,
      kind: pinKind(pin),
      path: relativePath,
      sha256: pin.proof.sha256,
      ipfsUri: pin.proof.uri,
      gatewayUrl: pin.proof.publicGatewayUrl,
      retrievedSha256: pin.proof.sha256,
    };
    records.push(record);
    byUri.set(pin.proof.uri, record);
  }
  return { records, byUri };
}

function operationRecord(receipt: PastaUiLivePublicReceipt): RavioliProofOperationRecord {
  assert.ok(receipt.operationHash, "Ravioli write receipt is missing its operation hash");
  const operationHash = receipt.operationHash;
  const entrypoint = receipt.entrypoints?.[0];
  const kind = receipt.action === "originate"
    ? "origination"
    : entrypoint === "mint"
      ? "mint"
      : entrypoint === "open_pack"
        ? "open"
        : entrypoint === "create_pack"
          ? "create"
          : "manage";
  return {
    kind,
    hash: operationHash,
    contractAddress: receipt.contractAddress,
    ...(entrypoint ? { entrypoint } : {}),
    status: "applied",
    explorerUrl: `https://shadownet.tzkt.io/${operationHash}`,
  };
}

async function writeRavioliProofPackage(input: {
  appRoot: string;
  runRoot: string;
  runId: string;
  rpcUrl: string;
  startedAt: string;
  completedAt: string;
  dependencies: DependencyEvidence;
  actors: { creator: string; collectorOne: string; collectorTwo: string };
  funding: JsonObject;
  mirror: RavioliUiStateMirror;
  kits: PackKit[];
  openKitCaptures: RavioliOpenKitDownloadCapture[];
  pins: PinRecord[];
  screenshots: CapturePastaProofStageResult[];
  receipts: PastaUiLivePublicReceipt[];
  writeReceipts: PastaUiLivePublicReceipt[];
  operationHashes: string[];
  indexed: JsonObject;
  negativeAssertions: string[];
  memorySamples: RavioliUiLiveMemorySample[];
}): Promise<RavioliUiLiveResult> {
  assert.equal(input.openKitCaptures.length, PACK_SPECS.length, "Ravioli proof requires all five real Studio open-kit downloads");
  const openKitArtifacts: RavioliOpenKitArtifact[] = [];
  for (let tokenId = 0; tokenId < input.openKitCaptures.length; tokenId += 1) {
    const capture = input.openKitCaptures[tokenId];
    assert.equal(capture.tokenId, tokenId, "Ravioli open-kit capture order drift");
    assert.deepEqual(capture.kit, input.kits[tokenId], `Ravioli open-kit ${tokenId} differs from the opened kit`);
    const bytes = await readFile(path.join(input.appRoot, capture.relativePath));
    const validated = validateRavioliOpenKitDownload({
      mode: tokenId,
      routerAddress: input.mirror.routerAddress,
      suggestedFilename: capture.fileName,
      inPageJson: JSON.stringify(input.kits[tokenId], null, 2),
      downloadedBytes: bytes,
    });
    assert.equal(validated.sha256, capture.sha256, `Ravioli open-kit ${tokenId} digest drift`);
    openKitArtifacts.push({
      id: `ravioli-open-kit-${tokenId}`,
      kind: "open-kit",
      path: capture.relativePath,
      sha256: capture.sha256,
    });
  }
  const openKitProgressRelativePath = "artifacts/open-kits/open-kit-capture-progress.json";
  const openKitProgressBytes = await readFile(path.join(input.appRoot, openKitProgressRelativePath));
  const openKitProgress = JSON.parse(openKitProgressBytes.toString("utf8")) as JsonObject;
  assert.equal(openKitProgress.status, "CAPTURED", "Ravioli open-kit progress is not terminal");
  assert.deepEqual(
    openKitProgress.openKits?.map((entry: JsonObject) => entry.sha256),
    openKitArtifacts.map((artifact) => artifact.sha256),
    "Ravioli open-kit progress hashes drift",
  );
  const openKitProgressArtifact = {
    id: "ravioli-open-kit-capture-progress",
    kind: "open-kit-capture-log",
    path: openKitProgressRelativePath,
    sha256: sha256(openKitProgressBytes),
  };
  const resolvedRunRoot = path.resolve(input.runRoot);
  const recoverySourcePath = path.resolve(resolvedRunRoot, input.dependencies.recovery.receiptPath);
  assert.ok(
    recoverySourcePath.startsWith(`${resolvedRunRoot}${path.sep}`),
    "Ravioli dependency recovery receipt escapes the aggregate proof root",
  );
  const recoveryBytes = await readFile(recoverySourcePath);
  assert.equal(
    sha256(recoveryBytes),
    input.dependencies.recovery.receiptSha256,
    "Ravioli dependency recovery receipt changed after the pre-write gate",
  );
  const recoveryReceipt = JSON.parse(recoveryBytes.toString("utf8")) as JsonObject;
  validateRavioliRecoveryReceipt(
    recoveryReceipt,
    input.dependencies.recovery.acceptedEvidenceHashes,
  );
  const recoveryRelativePath = "artifacts/gnocchi-inventory-recovery.json";
  await writeFile(path.join(input.appRoot, recoveryRelativePath), recoveryBytes);
  const recoveryArtifact = {
    id: "dependency-recovery-evidence",
    kind: "dependency-recovery-evidence",
    path: recoveryRelativePath,
    sha256: sha256(recoveryBytes),
  };
  const nativeRecoverySourcePath = path.resolve(resolvedRunRoot, input.dependencies.nativeRecovery.receiptPath);
  assert.ok(
    nativeRecoverySourcePath.startsWith(`${resolvedRunRoot}${path.sep}`),
    "Ravioli native recovery receipt escapes the aggregate proof root",
  );
  const [nativeRecoveryBytes, reloadedNativeRecovery] = await Promise.all([
    readFile(nativeRecoverySourcePath),
    loadRavioliNativeRecoveryHandoff(input.runRoot),
  ]);
  assert.equal(
    sha256(nativeRecoveryBytes),
    input.dependencies.nativeRecovery.receiptSha256,
    "Ravioli native recovery receipt changed after the pre-write gate",
  );
  assert.equal(
    reloadedNativeRecovery.receiptSha256,
    input.dependencies.nativeRecovery.receiptSha256,
    "Ravioli native recovery loader digest changed after the pre-write gate",
  );
  assert.deepEqual(reloadedNativeRecovery.receipt, input.dependencies.nativeRecovery.receipt);
  assert.deepEqual(reloadedNativeRecovery.handoff, input.dependencies.nativeRecovery.handoff);
  assert.deepEqual(JSON.parse(nativeRecoveryBytes.toString("utf8")), reloadedNativeRecovery.receipt);
  const nativeRecoveryRelativePath = "artifacts/ravioli-native-recovery.json";
  await writeFile(path.join(input.appRoot, nativeRecoveryRelativePath), nativeRecoveryBytes);
  const nativeRecoveryArtifact = {
    id: "native-recovery-evidence",
    kind: "native-recovery-evidence",
    path: nativeRecoveryRelativePath,
    sha256: sha256(nativeRecoveryBytes),
  };
  const pinArtifacts = await writePinArtifacts(input.appRoot, input.pins);
  const dependencySnapshot = {
    schema: "pastaprotocol-ravioli-dependencies@2",
    validatedBeforeRavioliWrites: true,
    runId: input.runId,
    recovery: {
      sourcePath: input.dependencies.recovery.receiptPath,
      receiptSha256: input.dependencies.recovery.receiptSha256,
      acceptedEvidenceHashes: input.dependencies.recovery.acceptedEvidenceHashes,
      artifactId: recoveryArtifact.id,
    },
    nativeRecovery: {
      sourcePath: input.dependencies.nativeRecovery.receiptPath,
      receiptSha256: input.dependencies.nativeRecovery.receiptSha256,
      handoff: input.dependencies.nativeRecovery.handoff,
      artifactId: nativeRecoveryArtifact.id,
    },
    gnocchi: input.dependencies.gnocchi,
    rotini: input.dependencies.rotini,
    tzktBaseline: input.dependencies.tzkt,
  };
  const dependencyBytes = deterministicJsonBytes(dependencySnapshot);
  const dependencyRelativePath = "artifacts/ravioli-ui-live-dependencies.json";
  await writeFile(path.join(input.appRoot, dependencyRelativePath), dependencyBytes);
  const dependencyArtifact = {
    id: "same-run-dependency-evidence",
    kind: "dependency-evidence",
    path: dependencyRelativePath,
    sha256: sha256(dependencyBytes),
  };
  const indexedBytes = deterministicJsonBytes(input.indexed);
  const indexedRelativePath = "artifacts/ravioli-ui-live-tzkt-index.json";
  await writeFile(path.join(input.appRoot, indexedRelativePath), indexedBytes);
  const indexedArtifact = {
    id: "tzkt-index-evidence",
    kind: "tzkt-evidence",
    path: indexedRelativePath,
    sha256: sha256(indexedBytes),
  };
  const receipt = {
    schema: "pastaprotocol-ravioli-ui-live-run@1",
    classification: "UI-LIVE",
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    rpcUrl: input.rpcUrl,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    actors: input.actors,
    funding: input.funding,
    dependencies: {
      statement: "Ravioli composed independently UI-proven Gnocchi and Rotini assets from this aggregate run only after the failed router was natively exhausted, its sales closed, Gnocchi inventory restored, and fresh Rotini project 3 created; it did not originate the enclosed asset collections.",
      gnocchi: input.dependencies.gnocchi,
      rotini: input.dependencies.rotini,
      validationArtifactId: dependencyArtifact.id,
      recovery: {
        sourcePath: input.dependencies.recovery.receiptPath,
        receiptSha256: input.dependencies.recovery.receiptSha256,
        acceptedEvidenceHashes: input.dependencies.recovery.acceptedEvidenceHashes,
        evidenceArtifactId: recoveryArtifact.id,
      },
      nativeRecovery: {
        sourcePath: input.dependencies.nativeRecovery.receiptPath,
        receiptSha256: input.dependencies.nativeRecovery.receiptSha256,
        handoff: input.dependencies.nativeRecovery.handoff,
        evidenceArtifactId: nativeRecoveryArtifact.id,
      },
    },
    contracts: {
      router: { address: input.mirror.routerAddress, explorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}` },
      gnocchiAdapter: { address: input.mirror.gnocchiAdapterAddress, explorerUrl: `https://shadownet.tzkt.io/${input.mirror.gnocchiAdapterAddress}` },
      rotiniAdapter: { address: input.mirror.rotiniAdapterAddress, explorerUrl: `https://shadownet.tzkt.io/${input.mirror.rotiniAdapterAddress}` },
    },
    packs: input.kits.map((kit, tokenId) => ({
      tokenId,
      mode: MODE_NAMES[tokenId],
      wrapperExplorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}/tokens/${tokenId}`,
      manifestUri: kit.manifestUri,
      recipeCount: kit.recipes.length,
      payloadPolicy: tokenId === 2
        ? "Some(blake2b(empty payload))"
        : tokenId >= 3
          ? "None (generated at open)"
          : "not applicable",
    })),
    openKits: {
      disclosurePolicy: "Captured from the real Studio immediately after each pack finalized; kept local and unpinned until every wrapper opened, then retained as spent-nonce proof output.",
      ipfsPinned: false,
      captureLogArtifactId: openKitProgressArtifact.id,
      artifacts: openKitArtifacts.map((artifact, tokenId) => ({
        tokenId,
        artifactId: artifact.id,
        path: artifact.path,
        sha256: artifact.sha256,
      })),
    },
    negativeAssertions: input.negativeAssertions,
    memory: {
      heapCeilingBytes: RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES,
      peakHeapUsedBytes: Math.max(...input.memorySamples.map((sample) => sample.heapUsedBytes)),
      samples: input.memorySamples,
    },
    receipts: input.receipts,
    pins: pinArtifacts.records,
    screenshots: input.screenshots.map((capture) => capture.manifestScreenshot),
    screenshotSidecars: input.screenshots.map((capture) => capture.manifestSidecarArtifact),
    tzktEvidenceArtifactId: indexedArtifact.id,
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptRelativePath = "artifacts/ravioli-ui-live-run.json";
  const receiptPath = path.join(input.appRoot, receiptRelativePath);
  await writeFile(receiptPath, receiptBytes);
  const receiptArtifact = {
    id: "ui-live-run-receipt",
    kind: "run-receipt",
    path: receiptRelativePath,
    sha256: sha256(receiptBytes),
  };
  const sidecarArtifacts = input.screenshots.map((capture) => capture.manifestSidecarArtifact);
  const artifacts = [
    ...pinArtifacts.records,
    ...openKitArtifacts,
    openKitProgressArtifact,
    recoveryArtifact,
    nativeRecoveryArtifact,
    dependencyArtifact,
    indexedArtifact,
    receiptArtifact,
    ...sidecarArtifacts,
  ];
  const ownedContractAddresses = new Set([
    input.mirror.routerAddress,
    input.mirror.gnocchiAdapterAddress,
    input.mirror.rotiniAdapterAddress,
  ]);
  const operations = input.writeReceipts
    .filter((receipt) => ownedContractAddresses.has(receipt.contractAddress || ""))
    .map(operationRecord);
  const wrapperMetadataUris = pinUriList(input.pins, (pin) => pin.proof.fileName === "token.json");
  const wrapperMediaUris = pinUriList(input.pins, (pin) => Boolean(pin.bytes) && pin.proof.fileName.startsWith("ravioli-wrapper-"));
  const tokens = PACK_SPECS.map((_, tokenId) => ({
    id: `ravioli-wrapper-${tokenId}`,
    contractAddress: input.mirror.routerAddress,
    tokenId: String(tokenId),
    explorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}/tokens/${tokenId}`,
    metadataArtifactId: pinArtifacts.byUri.get(wrapperMetadataUris[tokenId])?.id,
    mediaArtifactId: pinArtifacts.byUri.get(wrapperMediaUris[tokenId])?.id,
    metadataUri: wrapperMetadataUris[tokenId],
    artifactUri: wrapperMediaUris[tokenId],
  }));
  const contracts = [
    { address: input.mirror.routerAddress, kind: "atomic-pack-router", explorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}` },
    { address: input.mirror.gnocchiAdapterAddress, kind: "allocation-helper", explorerUrl: `https://shadownet.tzkt.io/${input.mirror.gnocchiAdapterAddress}` },
    { address: input.mirror.rotiniAdapterAddress, kind: "generative-helper", explorerUrl: `https://shadownet.tzkt.io/${input.mirror.rotiniAdapterAddress}` },
  ];
  const deliveredTokenUrls = ravioliDeliveredTokenExplorerUrls({
    gnocchiAddress: input.dependencies.gnocchi.address,
    rotiniAddress: input.dependencies.rotini.address,
    rotiniGeneratedTokenIds: input.dependencies.rotini.generatedTokenIds,
  });
  const modeCapabilities = PACK_SPECS.map((spec, tokenId) => {
    const stages = input.screenshots
      .filter((capture) => capture.manifestScreenshot.caption.includes(MODE_NAMES[tokenId]))
      .map((capture) => capture.manifestScreenshot.stage);
    assert.ok(stages.length >= 2, `${MODE_NAMES[tokenId]} needs configured/issued and collector screenshot evidence`);
    const metadataArtifact = pinArtifacts.byUri.get(wrapperMetadataUris[tokenId]);
    const mediaArtifact = pinArtifacts.byUri.get(wrapperMediaUris[tokenId]);
    const manifestArtifact = pinArtifacts.byUri.get(input.kits[tokenId].manifestUri);
    return {
      id: `${MODE_NAMES[tokenId]}-ui-live-proof`,
      description: tokenId === 4
        ? "Create, sell, and atomically open a mixed pack delivering escrowed existing FA2, reserved allocated mint, and collector-generated Rotini token in one operation tree."
        : `Create, sell, and atomically open the ${MODE_NAMES[tokenId]} wrapper product through Ravioli's real studio and buyer page.`,
      evidence: {
        screenshots: stages,
        artifacts: [metadataArtifact?.id, mediaArtifact?.id, manifestArtifact?.id, openKitArtifacts[tokenId].id, openKitProgressArtifact.id, recoveryArtifact.id, nativeRecoveryArtifact.id, dependencyArtifact.id, indexedArtifact.id, receiptArtifact.id].filter(Boolean),
        contracts: contracts.map((contract) => contract.address),
        operations: operations.map((operation) => operation.hash),
        tokens: [tokens[tokenId].id],
        roleEvidence: [],
        urls: [
          ...contracts.map((contract) => contract.explorerUrl),
          tokens[tokenId].explorerUrl,
          metadataArtifact?.gatewayUrl,
          mediaArtifact?.gatewayUrl,
          manifestArtifact?.gatewayUrl,
          `https://shadownet.tzkt.io/${input.dependencies.gnocchi.address}`,
          `https://shadownet.tzkt.io/${input.dependencies.rotini.address}`,
          ...deliveredTokenUrls[tokenId],
        ].filter(Boolean),
      },
    };
  });
  const blindManifestArtifacts = input.kits.slice(1).map((kit) => {
    const artifact = pinArtifacts.byUri.get(kit.manifestUri);
    assert.ok(artifact, `Ravioli blind manifest artifact is missing for ${kit.manifestUri}`);
    return { id: String(artifact.id), gatewayUrl: String(artifact.gatewayUrl) };
  });
  const revealCapability = buildRavioliRevealCapability({
    screenshots: input.screenshots.map((capture) => capture.manifestScreenshot),
    blindManifestArtifacts,
    contracts: contracts.slice(0, 1),
    operations,
    blindTokens: tokens.slice(1),
    supportingArtifactIds: [
      ...openKitArtifacts.slice(1).map((artifact) => artifact.id),
      recoveryArtifact.id,
      nativeRecoveryArtifact.id,
      indexedArtifact.id,
      receiptArtifact.id,
    ],
  });
  const capabilities = [...modeCapabilities, revealCapability];
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "ravioli",
    role: "token-publisher",
    runId: input.runId,
    capturedAt: input.completedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: input.rpcUrl },
    dependencyRecovery: {
      artifactId: recoveryArtifact.id,
      path: recoveryArtifact.path,
      sha256: recoveryArtifact.sha256,
      sourcePath: input.dependencies.recovery.receiptPath,
      acceptedEvidenceHashes: input.dependencies.recovery.acceptedEvidenceHashes,
    },
    nativeRecovery: {
      artifactId: nativeRecoveryArtifact.id,
      path: nativeRecoveryArtifact.path,
      sha256: nativeRecoveryArtifact.sha256,
      sourcePath: input.dependencies.nativeRecovery.receiptPath,
      receiptSha256: input.dependencies.nativeRecovery.receiptSha256,
      handoff: input.dependencies.nativeRecovery.handoff,
    },
    openKits: {
      disclosurePolicy: "Local and unpinned until all wrapper openings completed; packaged afterward as spent-nonce evidence.",
      ipfsPinned: false,
      captureLogArtifactId: openKitProgressArtifact.id,
      artifactIds: openKitArtifacts.map((artifact) => artifact.id),
    },
    capabilities,
    screenshots: input.screenshots.map((capture) => capture.manifestScreenshot),
    artifacts,
    contracts,
    operations,
    tokens,
    roleEvidence: [],
  };
  const manifestPath = path.join(input.appRoot, "manifest.json");
  await writeFile(manifestPath, deterministicJsonBytes(manifest));
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    classification: "UI-LIVE",
    routerAddress: input.mirror.routerAddress,
    adapterAddresses: { gnocchi: input.mirror.gnocchiAdapterAddress, rotini: input.mirror.rotiniAdapterAddress },
    operationHashes: input.operationHashes,
    receiptPath,
    manifestPath,
  }, null, 2)}\n`);
  return {
    routerAddress: input.mirror.routerAddress,
    adapterAddresses: { gnocchi: input.mirror.gnocchiAdapterAddress, rotini: input.mirror.rotiniAdapterAddress },
    manifestPath,
    receiptPath,
    operationHashes: input.operationHashes,
    screenshots: input.screenshots,
    memorySamples: input.memorySamples,
  };
}

async function main(): Promise<void> {
  try {
    await runRavioliUiLive();
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
