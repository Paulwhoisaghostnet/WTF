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

const EXECUTE_FLAG = "PASTA_SHADOWNET_GNOCCHI_UI_LIVE_EXECUTE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const CONTRACT_ARTIFACT_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "gnocchi",
  "contract",
  "pasta-open-edition.contract.json",
);
const STATIC_ROOT = path.join(root, "public");
const APP_PATH = "/creation-tools/gnocchi/index.html";
const CREATOR_OPERATION_RESERVE_MUTEZ = 1_500_000;
const COLLECTOR_OPERATION_RESERVE_MUTEZ = 500_000;
const MINIMUM_COLLECTOR_BALANCE_MUTEZ = COLLECTOR_OPERATION_RESERVE_MUTEZ;
const PRICE_MUTEZ = 1;
const LIMITED_SUPPLY = 3;
const LIMITED_CREATOR_RESERVE = 1;
const RAVIOLI_ESCROW_CREATOR_RESERVE = 2;
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);

export const GNOCCHI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS = new Set([
  "create_open_edition",
  "set_sale_active",
]);
export const GNOCCHI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS = new Set(["open_mint"]);

type SaleSnapshot = {
  active: boolean;
  start: string | null;
  end: string | null;
  base_price: number;
  increment: number;
  step_size: number;
  min_price: number | null;
  max_price: number | null;
  max_supply: number | null;
  treasury: string;
};

type TokenSnapshot = {
  tokenId: number;
  metadataUri: string;
  artifactUri: string;
  sale: SaleSnapshot;
  creatorReserve: number;
  lockPolicy: boolean;
  currentSupply: number;
  totalMinted: number;
};

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

type ActorSession = {
  wallet: PlatformWallet;
  tezos: TezosToolkit;
  session: TaquitoPastaUiLiveSession;
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
};

type GnocchiUiLiveResult = {
  contractAddress: string;
  manifestPath: string;
  receiptPath: string;
  operationHashes: string[];
  screenshots: CapturePastaProofStageResult[];
};

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

function mapValue(map: unknown, key: string): unknown {
  assert.ok(map instanceof MichelsonMap, "token_info must be a MichelsonMap");
  return map.get(key);
}

function normalizeSale(value: unknown): SaleSnapshot {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "sale must be an object");
  const sale = value as Record<string, unknown>;
  const normalized: SaleSnapshot = {
    active: sale.active === true,
    start: sale.start == null ? null : String(sale.start),
    end: sale.end == null ? null : String(sale.end),
    base_price: asSafeInteger(sale.base_price, "sale.base_price"),
    increment: asSafeInteger(sale.increment, "sale.increment"),
    step_size: asSafeInteger(sale.step_size, "sale.step_size"),
    min_price: sale.min_price == null ? null : asSafeInteger(sale.min_price, "sale.min_price"),
    max_price: sale.max_price == null ? null : asSafeInteger(sale.max_price, "sale.max_price"),
    max_supply: sale.max_supply == null ? null : asSafeInteger(sale.max_supply, "sale.max_supply"),
    treasury: String(sale.treasury || ""),
  };
  assert.ok(normalized.step_size >= 1, "sale step_size must be positive");
  assert.ok(normalized.base_price >= 0, "sale base price must be non-negative");
  assert.ok(normalized.increment >= 0, "sale increment must be non-negative");
  return normalized;
}

export class GnocchiUiStateMirror {
  private administrator = "";
  private contractAddress = "";
  private collectionMetadataUri = "";
  private readonly tokens: TokenSnapshot[] = [];

  initialize(input: { administrator: string; contractAddress: string; collectionMetadataUri: string }): void {
    assert.equal(validateContractAddress(input.contractAddress), ValidationResult.VALID);
    assert.ok(input.administrator.startsWith("tz"), "administrator must be an implicit account");
    assert.match(input.collectionMetadataUri, /^ipfs:\/\//);
    assert.equal(this.contractAddress, "", "Gnocchi mirror may only bind one fresh contract");
    this.administrator = input.administrator;
    this.contractAddress = input.contractAddress;
    this.collectionMetadataUri = input.collectionMetadataUri;
  }

  requireContract(address: string): void {
    assert.ok(this.contractAddress, "fresh Gnocchi contract has not been originated");
    assert.equal(address, this.contractAddress, "request did not target this run's fresh Gnocchi contract");
  }

  applySuccessfulCall(entrypoint: string, payload: unknown): void {
    assert.ok(payload && typeof payload === "object" && !Array.isArray(payload));
    const record = payload as Record<string, unknown>;
    if (entrypoint === "create_open_edition") {
      const tokenId = this.tokens.length;
      const encodedUri = mapValue(record.token_info, "");
      assert.equal(typeof encodedUri, "string");
      const metadataUri = hexToUtf8(encodedUri as string);
      assert.match(metadataUri, /^ipfs:\/\//);
      const sale = normalizeSale(record.sale);
      const creatorReserve = asSafeInteger(record.creator_reserve, "creator_reserve");
      const lockPolicy = record.lock_policy === true;
      this.tokens.push({
        tokenId,
        metadataUri,
        artifactUri: "",
        sale,
        creatorReserve,
        lockPolicy,
        currentSupply: creatorReserve,
        totalMinted: creatorReserve,
      });
      return;
    }
    if (entrypoint === "set_sale_active") {
      const tokenId = asSafeInteger(record.token_id, "set_sale_active.token_id");
      const token = this.tokens[tokenId];
      assert.ok(token, `cannot manage unknown token ${tokenId}`);
      token.sale.active = record.active === true;
      return;
    }
    if (entrypoint === "open_mint") {
      const tokenId = asSafeInteger(record.token_id, "open_mint.token_id");
      const amount = asSafeInteger(record.amount, "open_mint.amount");
      const token = this.tokens[tokenId];
      assert.ok(token, `cannot mint unknown token ${tokenId}`);
      token.currentSupply += amount;
      token.totalMinted += amount;
      return;
    }
    assert.fail(`unsupported Gnocchi mirror entrypoint ${entrypoint}`);
  }

  setArtifactUri(tokenId: number, artifactUri: string): void {
    const token = this.tokens[tokenId];
    assert.ok(token, `cannot bind artifact URI for unknown token ${tokenId}`);
    assert.match(artifactUri, /^ipfs:\/\//);
    token.artifactUri = artifactUri;
  }

  snapshot(): Record<string, unknown> {
    const sales: Record<string, SaleSnapshot> = {};
    const totalSupply: Record<string, number> = {};
    const totalMinted: Record<string, number> = {};
    const policyLocked: Record<string, boolean> = {};
    const tokenMetadata: Record<string, { token_id: number; token_info: Record<string, string> }> = {};
    for (const token of this.tokens) {
      const key = String(token.tokenId);
      sales[key] = { ...token.sale };
      totalSupply[key] = token.currentSupply;
      totalMinted[key] = token.totalMinted;
      policyLocked[key] = token.lockPolicy;
      tokenMetadata[key] = { token_id: token.tokenId, token_info: { "": utf8ToHex(token.metadataUri) } };
    }
    return {
      administrator: this.administrator,
      metadata: { "": utf8ToHex(this.collectionMetadataUri) },
      next_token_id: this.tokens.length,
      sales,
      total_supply: totalSupply,
      total_minted: totalMinted,
      policy_locked: policyLocked,
      token_metadata: tokenMetadata,
    };
  }

  tokenSnapshots(): TokenSnapshot[] {
    return this.tokens.map((token) => ({ ...token, sale: { ...token.sale } }));
  }
}

export function assertFreshGnocchiContractGrant(
  contractAddress: string,
  receipt: PastaUiLivePublicReceipt | undefined,
  creatorReceipts: readonly PastaUiLivePublicReceipt[],
): void {
  assert.equal(validateContractAddress(contractAddress), ValidationResult.VALID, "grant requires a valid KT1");
  assert.ok(receipt, "grant requires the creator origination receipt");
  assert.equal(receipt.schema, PASTA_UI_LIVE_RECEIPT_SCHEMA);
  assert.equal(receipt.action, "originate");
  assert.equal(receipt.chainId, SHADOWNET_CHAIN_ID);
  assert.equal(receipt.contractAddress, contractAddress);
  assert.equal(validateOperation(receipt.operationHash || ""), ValidationResult.VALID);
  const matches = creatorReceipts.filter(
    (candidate) => candidate.action === "originate" &&
      candidate.contractAddress === contractAddress &&
      candidate.operationHash === receipt.operationHash,
  );
  assert.equal(matches.length, 1, "grant must match exactly one creator-session origination receipt");
  assert.equal(
    creatorReceipts.filter((candidate) => candidate.action === "originate").length,
    1,
    "Gnocchi proof run must originate exactly one fresh contract",
  );
}

export function assertGnocchiUiLiveExecutionAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[EXECUTE_FLAG] !== "1") {
    block("explicit Gnocchi UI-live execute flag is required", [
      `\`${EXECUTE_FLAG}=1\` is required because this browser lane pins seven durable artifacts, originates a real Shadownet contract, and signs creator plus collector operations.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Gnocchi UI-live runner only permits Shadownet", [
      "Unset `TEZOS_NETWORK` or set it to `shadownet`; mainnet execution is refused.",
    ]);
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [
      `Set \`${OUTPUT_ENV}\` to the existing aggregate proof-run root before executing this lane.`,
    ]);
  }
}

async function requireFreshAppOutputDirectory(runRoot: string): Promise<string> {
  const appRoot = path.join(path.resolve(runRoot), "gnocchi");
  try {
    await stat(appRoot);
    block("Gnocchi proof output directory already exists", [
      `Refusing to overwrite \`${appRoot}\`; use a fresh proof-run directory.`,
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return appRoot;
}

async function readContractArtifact(): Promise<unknown[]> {
  const code = JSON.parse(await readFile(CONTRACT_ARTIFACT_PATH, "utf8"));
  assert.ok(Array.isArray(code), "Gnocchi contract artifact must be a Michelson JSON array");
  return code;
}

function buildOriginationStorage(administrator: string, collectionMetadataUri: string) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(collectionMetadataUri));
  return {
    administrator,
    pending_administrator: null,
    metadata,
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    total_supply: new MichelsonMap(),
    total_minted: new MichelsonMap(),
    total_reserved: new MichelsonMap(),
    reserved_mints: new MichelsonMap(),
    sales: new MichelsonMap(),
    policy_locked: new MichelsonMap(),
    minters: new MichelsonMap(),
    next_token_id: 0,
  };
}

function validateOrigination(input: { code: unknown; storage: unknown }, codeHash: string, administrator: string): void {
  assert.equal(hashJsonForBridge(input.code), codeHash, "browser requested an unexpected Gnocchi artifact");
  assert.ok(input.storage && typeof input.storage === "object" && !Array.isArray(input.storage));
  const storage = input.storage as Record<string, unknown>;
  assert.equal(storage.administrator, administrator);
  assert.equal(storage.pending_administrator, null);
  assert.equal(storage.next_token_id, 0);
  for (const key of [
    "metadata", "ledger", "operators", "token_metadata", "total_supply", "total_minted",
    "total_reserved", "reserved_mints", "sales", "policy_locked", "minters",
  ]) {
    assert.ok(storage[key] instanceof MichelsonMap, `${key} must be a MichelsonMap`);
  }
  assert.equal([...(storage.metadata as MichelsonMap<string, string>).entries()].length, 1);
  for (const key of [
    "ledger", "operators", "token_metadata", "total_supply", "total_minted", "total_reserved",
    "reserved_mints", "sales", "policy_locked", "minters",
  ]) {
    assert.equal([...(storage[key] as MichelsonMap<any, unknown>).entries()].length, 0, `${key} must start empty`);
  }
}

function validateCreatorCall(
  input: { entrypoint: string; payload: unknown },
  administrator: string,
  nextTokenId: number,
): void {
  assert.ok(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
  const payload = input.payload as Record<string, unknown>;
  if (input.entrypoint === "set_sale_active") {
    assert.equal(asSafeInteger(payload.token_id, "set_sale_active token"), 1, "only the forever OE is lifecycle-managed");
    assert.equal(typeof payload.active, "boolean");
    return;
  }
  assert.equal(input.entrypoint, "create_open_edition");
  assert.ok(payload.token_info instanceof MichelsonMap);
  assert.match(hexToUtf8(String(payload.token_info.get(""))), /^ipfs:\/\//);
  const sale = normalizeSale(payload.sale);
  assert.equal(sale.active, true);
  assert.equal(sale.treasury, administrator);
  assert.equal(sale.base_price, PRICE_MUTEZ);
  assert.equal(sale.increment, 0);
  assert.equal(sale.step_size, 1);
  assert.equal(sale.min_price, null);
  assert.equal(sale.max_price, null);
  assert.equal(payload.lock_policy, true);
  const creatorReserve = asSafeInteger(payload.creator_reserve, "creator_reserve");
  if (nextTokenId === 0) {
    assert.ok(sale.start && sale.end, "timed OE must bind both time boundaries");
    assert.equal(sale.max_supply, null, "timed OE must remain uncapped");
    assert.equal(creatorReserve, RAVIOLI_ESCROW_CREATOR_RESERVE);
  } else if (nextTokenId === 1) {
    assert.equal(sale.start, null, "forever OE must not have a start");
    assert.equal(sale.end, null, "forever OE must not have an end");
    assert.equal(sale.max_supply, null, "forever OE must remain uncapped");
    assert.equal(creatorReserve, RAVIOLI_ESCROW_CREATOR_RESERVE);
  } else if (nextTokenId === 2) {
    assert.ok(sale.start && sale.end, "limited edition must bind both time boundaries");
    assert.equal(sale.max_supply, LIMITED_SUPPLY);
    assert.equal(creatorReserve, LIMITED_CREATOR_RESERVE);
  } else {
    assert.fail(`browser attempted unexpected fourth Gnocchi edition ${nextTokenId}`);
  }
}

function validateCollectorCall(
  input: { entrypoint: string; payload: unknown },
  sendOptionsByPayload?: unknown,
): void {
  assert.equal(input.entrypoint, "open_mint");
  assert.ok(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
  const payload = input.payload as Record<string, unknown>;
  const tokenId = asSafeInteger(payload.token_id, "open_mint token");
  assert.ok(tokenId >= 0 && tokenId <= 2, "collector may only mint the three proof tokens");
  assert.equal(asSafeInteger(payload.amount, "open_mint amount"), 1);
  if (sendOptionsByPayload && typeof sendOptionsByPayload === "object") {
    const options = sendOptionsByPayload as Record<string, unknown>;
    assert.equal(asSafeInteger(options.amount, "open_mint amount mutez"), PRICE_MUTEZ);
    assert.equal(options.mutez, true);
  }
}

function decodedCall(request: PastaUiLiveBridgeRequest): {
  contractAddress: string;
  entrypoint: string;
  payload: unknown;
  sendOptions: unknown;
} | null {
  if (request.action !== "call") return null;
  const decoded = decodePastaUiLiveValue(request.payload) as { call?: unknown };
  if (!decoded?.call || typeof decoded.call !== "object" || Array.isArray(decoded.call)) return null;
  return {
    ...(decoded.call as { contractAddress: string; entrypoint: string; payload: unknown }),
    sendOptions: (decoded as { sendOptions?: unknown }).sendOptions ?? {},
  };
}

export function createMirroredSessionHandler(input: {
  session: TaquitoPastaUiLiveSession;
  mirror: GnocchiUiStateMirror;
  role: "creator" | "collector";
  onOrigination?(contractAddress: string, receipt: PastaUiLivePublicReceipt): void;
}) {
  return async (request: PastaUiLiveBridgeRequest): Promise<unknown> => {
    if (
      input.role === "collector" &&
      !new Set(["connect", "chain_check", "balance", "contract_at", "read_storage", "call"]).has(request.action)
    ) {
      throw new PastaUiLiveBridgeError(`collector bridge action is not allowed: ${request.action}`, 403);
    }
    const call = decodedCall(request);
    if (input.role === "collector" && call) validateCollectorCall(call, call.sendOptions);
    const result = await input.session.handle(request) as Record<string, unknown>;
    if (request.action === "originate") {
      const contractAddress = String(result.contractAddress || "");
      const receipt = result.receipt as PastaUiLivePublicReceipt;
      input.onOrigination?.(contractAddress, receipt);
    }
    if (call) {
      input.mirror.requireContract(call.contractAddress);
      input.mirror.applySuccessfulCall(call.entrypoint, call.payload);
    }
    return result;
  };
}

async function readProjectedMapValue(source: unknown, key: string): Promise<unknown> {
  if (!source || typeof source !== "object") return undefined;
  if (typeof (source as { get?: unknown }).get === "function") {
    return (source as { get(key: string): unknown | Promise<unknown> }).get(key);
  }
  return (source as Record<string, unknown>)[key];
}

export async function projectGnocchiStorage(storage: unknown): Promise<Record<string, unknown>> {
  assert.ok(storage && typeof storage === "object" && !Array.isArray(storage));
  const source = storage as Record<string, unknown>;
  const nextTokenId = asSafeInteger(source.next_token_id ?? 0, "projected next_token_id");
  assert.ok(nextTokenId >= 0 && nextTokenId <= 3, "proof storage may contain at most three editions");
  const maps = {
    metadata: new MichelsonMap<string, unknown>(),
    sales: new MichelsonMap<string, unknown>(),
    total_supply: new MichelsonMap<string, unknown>(),
    total_minted: new MichelsonMap<string, unknown>(),
    policy_locked: new MichelsonMap<string, unknown>(),
    token_metadata: new MichelsonMap<string, unknown>(),
  };
  const metadataValue = await readProjectedMapValue(source.metadata, "");
  if (metadataValue !== undefined) maps.metadata.set("", metadataValue);
  await Promise.all(Array.from({ length: nextTokenId }, async (_, tokenId) => {
    const key = String(tokenId);
    for (const mapName of ["sales", "total_supply", "total_minted", "policy_locked", "token_metadata"] as const) {
      const value = await readProjectedMapValue(source[mapName], key);
      if (value !== undefined) maps[mapName].set(key, value);
    }
  }));
  return {
    administrator: String(source.administrator || ""),
    next_token_id: nextTokenId,
    ...maps,
  };
}

function localDateTime(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 16);
}

async function openActorPage(bridge: ActorSession["bridge"]): Promise<ActorPage> {
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

async function configureBase(page: Page, kuboApiUrl: string): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", kuboApiUrl);
  await page.fill("#oeSymbol", "GNUI");
  await page.fill("#basePrice", String(PRICE_MUTEZ / 1_000_000));
  await page.fill("#increment", "0");
  await page.fill("#stepSize", "1");
  await page.fill("#minPrice", "");
  await page.fill("#maxPrice", "");
  await page.check("#lockPolicy");
}

async function configureEdition(
  page: Page,
  input: {
    tokenId: number;
    mode: "timed" | "forever" | "limited";
    name: string;
    description: string;
    tags: string;
    artifactName: string;
    start?: string;
    end?: string;
  },
): Promise<void> {
  await page.fill("#oeName", input.name);
  await page.fill("#oeDesc", input.description);
  await page.fill("#oeTags", input.tags);
  await page.selectOption("#saleMode", input.mode);
  if (input.mode === "timed" || input.mode === "limited") {
    assert.ok(input.start && input.end);
    await page.fill("#saleStart", input.start);
    await page.fill("#saleEnd", input.end);
  }
  if (input.mode === "limited") {
    await page.fill("#saleMaxSupply", String(LIMITED_SUPPLY));
    await page.fill("#creatorReserve", String(LIMITED_CREATOR_RESERVE));
  } else {
    await page.fill("#creatorReserve", String(RAVIOLI_ESCROW_CREATOR_RESERVE));
  }
  await page.setInputFiles("#oeArtifact", {
    name: input.artifactName,
    mimeType: "image/png",
    buffer: Buffer.concat([PNG_BYTES, Buffer.from(`gnocchi-ui-live-${input.tokenId}`)]),
  });
  assert.equal(await page.inputValue("#saleMode"), input.mode);
  assert.equal(await page.inputValue("#oeName"), input.name);
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
    app: "gnocchi",
    capability: input.capability,
    stageOrdinal: input.ordinal,
    stageName: input.stageName,
    classification: "UI-LIVE",
    requiredEvidence: input.evidence,
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function connectActor(page: Page, address: string): Promise<void> {
  await page.click("#btnConnect");
  await waitForLog(page, `connected ${address} on shadownet`);
  await page.waitForFunction(() => document.getElementById("account")?.textContent !== "not connected");
}

async function publishEdition(page: Page, expected: string): Promise<void> {
  await page.click("#btnPublish");
  await waitForLog(page, expected);
  await page.waitForFunction(() => !document.getElementById("btnPublish")?.hasAttribute("disabled"));
}

async function selectExistingCollection(page: Page, contractAddress: string): Promise<void> {
  await page.selectOption("#publishTarget", "existing");
  await page.fill("#existingCollectionKt", contractAddress);
  await page.click("#btnVerifyCollection");
  await waitForText(page, "#publishTargetStatus", "Verified administrator");
}

async function assertNoUndecodedOptionText(page: Page, selector: string, label: string): Promise<string> {
  const text = (await page.locator(selector).textContent()) || "";
  assert.doesNotMatch(text, /NaN|Invalid Date|\[object Object\]/, `${label} contains undecoded Tezos option data`);
  return text;
}

async function loadMintPolicy(page: Page, contractAddress: string, tokenId: number, expected: string): Promise<void> {
  await page.fill("#mintKt", contractAddress);
  await page.fill("#mintTokenId", String(tokenId));
  await page.click("#btnLoadPrice");
  await waitForText(page, "#mintInfo", expected);
  await assertNoUndecodedOptionText(page, "#mintInfo", `token ${tokenId} status`);
}

async function mintToken(page: Page, contractAddress: string, tokenId: number, expectedPolicy: string): Promise<void> {
  await loadMintPolicy(page, contractAddress, tokenId, expectedPolicy);
  await page.fill("#mintAmount", "1");
  const previous = (await page.locator("#log").textContent()) || "";
  const previousCount = (previous.match(/minted ✓/g) || []).length;
  const previousFailureCount = (previous.match(/mint failed:/g) || []).length;
  await page.click("#btnMint");
  await page.waitForFunction(
    ({ minted, failed }) => {
      const log = document.getElementById("log")?.textContent || "";
      return (log.match(/minted ✓/g) || []).length > minted || (log.match(/mint failed:/g) || []).length > failed;
    },
    { minted: previousCount, failed: previousFailureCount },
    { timeout: 300_000 },
  );
  const log = (await page.locator("#log").textContent()) || "";
  const failureCount = (log.match(/mint failed:/g) || []).length;
  if (failureCount > previousFailureCount) {
    const notice = (await page.locator("#ppNotice").textContent().catch(() => "")) || "";
    throw new Error(`token ${tokenId} mint failed in actual Gnocchi UI; log=${log.slice(-1_500)}; notice=${notice.slice(-500)}`);
  }
  await page.waitForFunction(() => !document.getElementById("btnMint")?.hasAttribute("disabled"));
}

async function closeActorPage(actor: ActorPage | null): Promise<void> {
  if (!actor) return;
  actor.monitor.dispose();
  await actor.browser.close();
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

function operationReceipts(sessions: readonly TaquitoPastaUiLiveSession[]): PastaUiLivePublicReceipt[] {
  return sessions
    .flatMap((session) => session.getReceipts())
    .filter((receipt) => receipt.operationHash)
    .sort((left, right) => left.timestampUtc.localeCompare(right.timestampUtc));
}

function assertReceiptIdentifiers(
  receipts: readonly PastaUiLivePublicReceipt[],
  contractAddress: string,
): string[] {
  assert.equal(validateContractAddress(contractAddress), ValidationResult.VALID);
  const hashes: string[] = [];
  for (const receipt of receipts) {
    assert.equal(receipt.chainId, SHADOWNET_CHAIN_ID);
    assert.equal(receipt.contractAddress, contractAddress);
    assert.equal(validateOperation(receipt.operationHash || ""), ValidationResult.VALID);
    hashes.push(receipt.operationHash || "");
  }
  assert.equal(new Set(hashes).size, hashes.length, "operation hashes must be unique");
  assert.equal(receipts.filter((receipt) => receipt.action === "originate").length, 1);
  assert.equal(receipts.filter((receipt) => receipt.entrypoints?.includes("create_open_edition")).length, 3);
  assert.equal(receipts.filter((receipt) => receipt.entrypoints?.includes("open_mint")).length, 6);
  assert.deepEqual(
    receipts.filter((receipt) => receipt.entrypoints?.includes("set_sale_active")).map((receipt) => receipt.entrypoints),
    [["set_sale_active"], ["set_sale_active"]],
  );
  return hashes;
}

async function writePinArtifacts(appRoot: string, pins: readonly PinRecord[]) {
  let mediaIndex = 0;
  let tokenMetadataIndex = 0;
  const records: Array<{
    id: string;
    kind: string;
    path: string;
    sha256: string;
    ipfsUri: string;
    gatewayUrl: string;
    retrievedSha256: string;
  }> = [];
  const tokenMediaIds: string[] = [];
  const tokenMetadataIds: string[] = [];
  let collectionMetadataId = "";
  for (const pin of pins) {
    let id: string;
    let kind: string;
    let relativePath: string;
    let bytes: Uint8Array;
    if (pin.bytes) {
      id = `token-${mediaIndex}-media`;
      kind = "token-media";
      relativePath = `artifacts/token-${mediaIndex}-media.png`;
      bytes = pin.bytes;
      tokenMediaIds.push(id);
      mediaIndex += 1;
    } else {
      assert.notEqual(pin.value, undefined);
      bytes = deterministicJsonBytes(pin.value);
      const isToken = Boolean(
        pin.value && typeof pin.value === "object" && !Array.isArray(pin.value) &&
        typeof (pin.value as Record<string, unknown>).artifactUri === "string",
      );
      if (isToken) {
        id = `token-${tokenMetadataIndex}-metadata`;
        kind = "token-metadata";
        relativePath = `artifacts/token-${tokenMetadataIndex}-metadata.json`;
        tokenMetadataIds.push(id);
        tokenMetadataIndex += 1;
      } else {
        assert.equal(collectionMetadataId, "", "only one collection metadata pin is allowed");
        id = "collection-metadata";
        kind = "collection-metadata";
        relativePath = "artifacts/collection-metadata.json";
        collectionMetadataId = id;
      }
    }
    assert.equal(sha256(bytes), pin.proof.sha256, `${id} bytes differ from public pin proof`);
    await writeFile(path.join(appRoot, relativePath), bytes);
    records.push({
      id,
      kind,
      path: relativePath,
      sha256: pin.proof.sha256,
      ipfsUri: pin.proof.uri,
      gatewayUrl: pin.proof.publicGatewayUrl,
      retrievedSha256: pin.proof.sha256,
    });
  }
  assert.deepEqual(tokenMediaIds, ["token-0-media", "token-1-media", "token-2-media"]);
  assert.deepEqual(tokenMetadataIds, ["token-0-metadata", "token-1-metadata", "token-2-metadata"]);
  assert.equal(collectionMetadataId, "collection-metadata");
  return { records, tokenMediaIds, tokenMetadataIds, collectionMetadataId };
}

function operationRecord(receipt: PastaUiLivePublicReceipt) {
  const entrypoint = receipt.entrypoints?.[0];
  const kind = receipt.action === "originate"
    ? "origination"
    : entrypoint === "open_mint"
      ? "mint"
      : entrypoint === "create_open_edition"
        ? "create"
        : "manage";
  return {
    kind,
    hash: receipt.operationHash,
    contractAddress: receipt.contractAddress,
    ...(entrypoint ? { entrypoint } : {}),
    status: "applied",
    explorerUrl: `https://shadownet.tzkt.io/${receipt.operationHash}`,
  };
}

async function verifyIndexedProof(input: {
  contractAddress: string;
  collectorOne: string;
  collectorTwo: string;
  creator: string;
  collectionMetadataUri: string;
  tokenMetadataUris: string[];
}): Promise<Record<string, unknown>> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const storage = await pollJson(
    "Gnocchi UI-live indexed storage",
    `${base}/contracts/${input.contractAddress}/storage`,
    (value) => Number(value?.next_token_id) === 3 && Number(value?.ledger) > 0 && Number(value?.sales) > 0,
  );
  const ledger = await pollJson(
    "Gnocchi UI-live collector balances",
    `${base}/bigmaps/${storage.ledger}/keys?limit=100`,
    (value) => Array.isArray(value) && [0, 1, 2].every((tokenId) =>
      value.some((entry) => entry?.key?.owner === input.collectorOne && Number(entry?.key?.token_id) === tokenId && Number(entry.value) === 1) &&
      value.some((entry) => entry?.key?.owner === input.collectorTwo && Number(entry?.key?.token_id) === tokenId && Number(entry.value) === 1),
    ) && [0, 1].every((tokenId) =>
      value.some((entry) => entry?.key?.owner === input.creator && Number(entry?.key?.token_id) === tokenId && Number(entry.value) === RAVIOLI_ESCROW_CREATOR_RESERVE)
    ) && value.some((entry) => entry?.key?.owner === input.creator && Number(entry?.key?.token_id) === 2 && Number(entry.value) === LIMITED_CREATOR_RESERVE),
  );
  const collectionMetadata = await pollJson(
    "Gnocchi UI-live collection metadata",
    `${base}/bigmaps/${storage.metadata}/keys?limit=10`,
    (value) => Array.isArray(value) && value.some((entry) =>
      String(entry?.key ?? "") === "" && typeof entry?.value === "string" &&
      hexToUtf8(entry.value) === input.collectionMetadataUri,
    ),
  );
  const sales = await pollJson(
    "Gnocchi UI-live edition policies",
    `${base}/bigmaps/${storage.sales}/keys?limit=20`,
    (value) => {
      if (!Array.isArray(value)) return false;
      const timed = value.find((entry) => Number(entry.key) === 0)?.value;
      const forever = value.find((entry) => Number(entry.key) === 1)?.value;
      const limited = value.find((entry) => Number(entry.key) === 2)?.value;
      return timed?.start != null && timed?.end != null && timed?.max_supply == null &&
        forever?.active === true && forever?.start == null && forever?.end == null && forever?.max_supply == null &&
        limited?.start != null && limited?.end != null && Number(limited?.max_supply) === LIMITED_SUPPLY;
    },
  );
  const tokenMetadata = await pollJson(
    "Gnocchi UI-live token metadata",
    `${base}/bigmaps/${storage.token_metadata}/keys?limit=20`,
    (value) => Array.isArray(value) && [0, 1, 2].every((tokenId) =>
      value.some((entry) => Number(entry.key) === tokenId && entry?.value?.token_info?.[""]),
    ),
  );
  const indexedUris = tokenMetadata
    .slice()
    .sort((left: any, right: any) => Number(left.key) - Number(right.key))
    .map((entry: any) => hexToUtf8(entry.value.token_info[""]));
  assert.deepEqual(indexedUris, input.tokenMetadataUris, "TzKT token URIs differ from exact pinned metadata URIs");
  const mintTransactions = await pollJson(
    "Gnocchi UI-live collector operations",
    `${base}/operations/transactions?target=${input.contractAddress}&entrypoint=open_mint&status=applied&limit=20`,
    (value) => Array.isArray(value) &&
      value.filter((entry) => entry?.sender?.address === input.collectorOne).length >= 3 &&
      value.filter((entry) => entry?.sender?.address === input.collectorTwo).length >= 3,
  );
  return {
    storageBigMaps: {
      ledger: Number(storage.ledger),
      metadata: Number(storage.metadata),
      sales: Number(storage.sales),
      tokenMetadata: Number(storage.token_metadata),
    },
    indexedLedgerEntries: ledger.length,
    indexedCollectionMetadataEntries: collectionMetadata.length,
    indexedSaleEntries: sales.length,
    indexedMintTransactions: mintTransactions.length,
    indexedTokenMetadataUris: indexedUris,
  };
}

export async function runGnocchiUiLive(): Promise<GnocchiUiLiveResult> {
  assertGnocchiUiLiveExecutionAllowed(process.env);
  const runRoot = path.resolve(process.env[OUTPUT_ENV] || "");
  const appRoot = await requireFreshAppOutputDirectory(runRoot);
  const runId = path.basename(runRoot);
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const ipfs: IpfsProofConfig = resolveIpfsProofConfig();
  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-gnocchi-ui-live.sock",
    authToken: "local-pasta-shadownet-gnocchi-ui-live",
    auditLog: "/tmp/wtf-pasta-shadownet-gnocchi-ui-live-audit.log",
  });
  const signerSet = await loadSignerSet(env);
  assert.notEqual(signerSet.creator.address, signerSet.collector.address);
  assert.notEqual(signerSet.creator.address, signerSet.collectorTwo.address);
  assert.notEqual(signerSet.collector.address, signerSet.collectorTwo.address);
  const creatorTezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  const collectorOneTezos = buildToolkit(signerSet.collectorSigner, rpc.rpcUrl);
  const collectorTwoTezos = buildToolkit(signerSet.collectorTwoSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "Gnocchi UI-live creator startup"),
    assertShadownet(collectorOneTezos, "Gnocchi UI-live collector one startup"),
    assertShadownet(collectorTwoTezos, "Gnocchi UI-live collector two startup"),
  ]);

  const code = await readContractArtifact();
  const placeholderUri = "ipfs://bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
  let estimate;
  try {
    estimate = await creatorTezos.estimate.originate({
      code,
      storage: buildOriginationStorage(signerSet.creator.address, placeholderUri),
    } as never);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/subtraction_underflow|balance|cannot pay/i.test(message)) {
      block("Gnocchi UI-live creator cannot fund an origination estimate", [
        `Creator: \`${signerSet.creator.address}\`.`,
        `Estimate failure: ${message.slice(0, 500)}`,
        "No IPFS pin or chain write was attempted.",
      ]);
    }
    throw error;
  }
  const estimatedOriginationMutez = Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez);
  const creatorRequired = estimatedOriginationMutez + CREATOR_OPERATION_RESERVE_MUTEZ;
  const [creatorBalanceValue, collectorOneBalanceValue, collectorTwoBalanceValue] = await Promise.all([
    creatorTezos.tz.getBalance(signerSet.creator.address),
    collectorOneTezos.tz.getBalance(signerSet.collector.address),
    collectorTwoTezos.tz.getBalance(signerSet.collectorTwo.address),
  ]);
  const creatorBalance = Number(creatorBalanceValue.toString());
  const collectorOneBalance = Number(collectorOneBalanceValue.toString());
  const collectorTwoBalance = Number(collectorTwoBalanceValue.toString());
  if (creatorBalance < creatorRequired) {
    block("Gnocchi UI-live creator is underfunded before any pin or chain write", [
      `Creator \`${signerSet.creator.address}\` has \`${creatorBalance}\` mutez.`,
      `Estimated origination plus operation reserve requires \`${creatorRequired}\` mutez.`,
      "No IPFS pin or chain write was attempted.",
    ]);
  }
  for (const [label, wallet, balance] of [
    ["collector one", signerSet.collector, collectorOneBalance],
    ["collector two", signerSet.collectorTwo, collectorTwoBalance],
  ] as const) {
    if (balance < MINIMUM_COLLECTOR_BALANCE_MUTEZ) {
      block(`Gnocchi UI-live ${label} is underfunded before any pin or chain write`, [
        `Wallet \`${wallet.address}\` has \`${balance}\` mutez.`,
        `At least \`${MINIMUM_COLLECTOR_BALANCE_MUTEZ}\` mutez is required.`,
        "No IPFS pin or chain write was attempted.",
      ]);
    }
  }

  await mkdir(path.join(appRoot, "artifacts"), { recursive: true });
  const pins: PinRecord[] = [];
  const mirror = new GnocchiUiStateMirror();
  const codeHash = hashJsonForBridge(code);
  let collectionMetadataUri = "";
  let freshContractAddress = "";
  let originationReceipt: PastaUiLivePublicReceipt | undefined;
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: creatorTezos,
    signerAddress: signerSet.creator.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedEntrypoints: GNOCCHI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    assertExpectedChain: async (stage) => {
      await assertShadownet(creatorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
    validateOrigination: (input) => validateOrigination(input, codeHash, signerSet.creator.address),
    validateCall: (input) => validateCreatorCall(input, signerSet.creator.address, mirror.tokenSnapshots().length),
    projectStorage: projectGnocchiStorage,
    onPin: ({ value, bytes, proof }) => {
      pins.push({ value, ...(bytes ? { bytes: Uint8Array.from(bytes) } : {}), proof });
      if (value && typeof value === "object" && !Array.isArray(value) &&
          typeof (value as Record<string, unknown>).artifactUri !== "string") {
        assert.equal(collectionMetadataUri, "", "only one collection metadata pin is allowed");
        collectionMetadataUri = proof.uri;
      }
    },
  });
  creatorSession.authorizeAfterFundingPreflight(fundingAuthorization({
    balanceMutez: creatorBalance,
    requiredBalanceMutez: creatorRequired,
    estimatedOriginationMutez,
    operationReserveMutez: CREATOR_OPERATION_RESERVE_MUTEZ,
  }));
  const creatorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: createMirroredSessionHandler({
      session: creatorSession,
      mirror,
      role: "creator",
      onOrigination: (contractAddress, receipt) => {
        assert.ok(collectionMetadataUri, "collection metadata must be pinned before origination");
        freshContractAddress = contractAddress;
        originationReceipt = receipt;
        mirror.initialize({
          administrator: signerSet.creator.address,
          contractAddress,
          collectionMetadataUri,
        });
      },
    }),
  });

  const screenshots: CapturePastaProofStageResult[] = [];
  let creatorActor: ActorPage | null = null;
  let collectorOneActor: ActorPage | null = null;
  let collectorTwoActor: ActorPage | null = null;
  let collectorOne: ActorSession | null = null;
  let collectorTwo: ActorSession | null = null;
  const startedAt = new Date().toISOString();
  try {
    creatorActor = await openActorPage(creatorBridge);
    const start = localDateTime(Date.now() - 60_000);
    const end = localDateTime(Date.now() + 86_400_000);
    await configureBase(creatorActor.page, ipfs.apiUrl);
    await configureEdition(creatorActor.page, {
      tokenId: 0,
      mode: "timed",
      name: "Gnocchi UI-LIVE Timed OE",
      description: "Uncapped time-windowed open edition created through the actual Gnocchi studio.",
      tags: "gnocchi, timed-oe, ui-live, shadownet",
      artifactName: "gnocchi-timed-oe.png",
      start,
      end,
    });
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 1,
      capability: "publish three edition policies",
      stageName: "Timed OE configured",
      focusSelector: "#saleMode",
      evidence: [
        { selector: "#curvePreview", name: "pricing and policy", expectedText: "Timed OE" },
        { selector: "#lockPolicy", name: "locked policy" },
      ],
    }));
    await connectActor(creatorActor.page, signerSet.creator.address);
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 2,
      capability: "publish three edition policies",
      stageName: "Creator connected on Shadownet",
      focusSelector: "#account",
      evidence: [
        { selector: "h1", expectedText: "Gnocchi" },
        { selector: "#account", expectedText: signerSet.creator.address.slice(0, 7) },
      ],
    }));
    await creatorActor.page.click("#btnPublish");
    await waitForLog(creatorActor.page, "originating multi-edition Gnocchi collection");
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 3,
      capability: "publish three edition policies",
      stageName: "Media and metadata pinned",
      focusSelector: "#log",
      evidence: [{ selector: "#log", expectedText: "originating multi-edition Gnocchi collection" }],
    }));
    await waitForLog(creatorActor.page, "collection deployed:");
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 4,
      capability: "publish three edition policies",
      stageName: "Collection originated",
      focusSelector: "#log",
      evidence: [{ selector: "#log", expectedText: "collection deployed:" }],
    }));
    await waitForLog(creatorActor.page, "Timed OE live ✓ — token id 0");
    await creatorActor.page.waitForFunction(() => !document.getElementById("btnPublish")?.hasAttribute("disabled"));
    mirror.setArtifactUri(0, pins.find((pin) => pin.bytes)?.proof.uri || "");
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 5,
      capability: "publish three edition policies",
      stageName: "Timed OE token zero live",
      focusSelector: "#publishTargetStatus",
      evidence: [
        { selector: "#publishTargetStatus", expectedText: "next token #1" },
        { selector: "#log", expectedText: "Timed OE live ✓ — token id 0" },
      ],
    }));

    await configureEdition(creatorActor.page, {
      tokenId: 1,
      mode: "forever",
      name: "Gnocchi UI-LIVE Forever OE",
      description: "Uncapped and untimed edition with creator vault and reopen controls.",
      tags: "gnocchi, forever-oe, ui-live, shadownet",
      artifactName: "gnocchi-forever-oe.png",
    });
    await selectExistingCollection(creatorActor.page, freshContractAddress);
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 6,
      capability: "publish three edition policies",
      stageName: "Existing collection verified for second edition",
      focusSelector: "#publishTargetStatus",
      evidence: [{ selector: "#publishTargetStatus", expectedText: "next edition will be token #1" }],
    }));
    await publishEdition(creatorActor.page, "Forever OE live ✓ — token id 1");
    mirror.setArtifactUri(1, pins.filter((pin) => pin.bytes)[1]?.proof.uri || "");
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 7,
      capability: "publish three edition policies",
      stageName: "Forever OE token one live",
      focusSelector: "#publishTargetStatus",
      evidence: [
        { selector: "#publishTargetStatus", expectedText: "next token #2" },
        { selector: "#log", expectedText: "Forever OE live ✓ — token id 1" },
      ],
    }));

    await configureEdition(creatorActor.page, {
      tokenId: 2,
      mode: "limited",
      name: "Gnocchi UI-LIVE Limited Edition",
      description: "Capped and time-windowed edition with one creator reserve.",
      tags: "gnocchi, limited-edition, ui-live, shadownet",
      artifactName: "gnocchi-limited-edition.png",
      start,
      end,
    });
    await publishEdition(creatorActor.page, "Limited Edition live ✓ — token id 2");
    mirror.setArtifactUri(2, pins.filter((pin) => pin.bytes)[2]?.proof.uri || "");
    await creatorActor.page.locator("#editionList .pp-token").nth(2).waitFor({ state: "visible" });
    await assertNoUndecodedOptionText(creatorActor.page, "#editionList", "collection edition manager");
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 8,
      capability: "publish three edition policies",
      stageName: "All three policies live in one collection",
      focusSelector: "#editionList",
      evidence: [
        { selector: "#editionList .pp-token strong", index: 0, expectedText: "Token #0 · Timed OE" },
        { selector: "#editionList .pp-token strong", index: 1, expectedText: "Token #1 · Forever OE" },
        { selector: "#editionList .pp-token strong", index: 2, expectedText: "Token #2 · Limited Edition" },
      ],
    }));

    assertFreshGnocchiContractGrant(freshContractAddress, originationReceipt, creatorSession.getReceipts());
    const collectorOneSession = new TaquitoPastaUiLiveSession({
      tezos: collectorOneTezos,
      signerAddress: signerSet.collector.address,
      expectedChainId: SHADOWNET_CHAIN_ID,
      allowedContractAddresses: new Set([freshContractAddress]),
      allowedEntrypoints: GNOCCHI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
      minimumActionBalanceMutez: 50_000,
      assertExpectedChain: async (stage) => {
        await assertShadownet(collectorOneTezos, stage);
        return SHADOWNET_CHAIN_ID;
      },
      pinJson: async () => { throw new PastaUiLiveBridgeError("collector pinning is disabled", 403); },
      validateOrigination: async () => { throw new PastaUiLiveBridgeError("collector origination is disabled", 403); },
      validateCall: (input) => validateCollectorCall(input),
      projectStorage: projectGnocchiStorage,
    });
    collectorOneSession.authorizeAfterFundingPreflight(fundingAuthorization({
      balanceMutez: collectorOneBalance,
      requiredBalanceMutez: MINIMUM_COLLECTOR_BALANCE_MUTEZ,
      operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
    }));
    const collectorOneBridge = await startPastaUiLiveLoopbackServer({
      staticRoot: STATIC_ROOT,
      handleAction: createMirroredSessionHandler({ session: collectorOneSession, mirror, role: "collector" }),
    });
    collectorOne = { wallet: signerSet.collector, tezos: collectorOneTezos, session: collectorOneSession, bridge: collectorOneBridge };

    const collectorTwoSession = new TaquitoPastaUiLiveSession({
      tezos: collectorTwoTezos,
      signerAddress: signerSet.collectorTwo.address,
      expectedChainId: SHADOWNET_CHAIN_ID,
      allowedContractAddresses: new Set([freshContractAddress]),
      allowedEntrypoints: GNOCCHI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
      minimumActionBalanceMutez: 50_000,
      assertExpectedChain: async (stage) => {
        await assertShadownet(collectorTwoTezos, stage);
        return SHADOWNET_CHAIN_ID;
      },
      pinJson: async () => { throw new PastaUiLiveBridgeError("collector pinning is disabled", 403); },
      validateOrigination: async () => { throw new PastaUiLiveBridgeError("collector origination is disabled", 403); },
      validateCall: (input) => validateCollectorCall(input),
      projectStorage: projectGnocchiStorage,
    });
    collectorTwoSession.authorizeAfterFundingPreflight(fundingAuthorization({
      balanceMutez: collectorTwoBalance,
      requiredBalanceMutez: MINIMUM_COLLECTOR_BALANCE_MUTEZ,
      operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
    }));
    const collectorTwoBridge = await startPastaUiLiveLoopbackServer({
      staticRoot: STATIC_ROOT,
      handleAction: createMirroredSessionHandler({ session: collectorTwoSession, mirror, role: "collector" }),
    });
    collectorTwo = { wallet: signerSet.collectorTwo, tezos: collectorTwoTezos, session: collectorTwoSession, bridge: collectorTwoBridge };

    collectorOneActor = await openActorPage(collectorOne.bridge);
    await configureBase(collectorOneActor.page, ipfs.apiUrl);
    await connectActor(collectorOneActor.page, signerSet.collector.address);
    screenshots.push(await captureStage({
      actor: collectorOneActor,
      outputRoot: runRoot,
      ordinal: 9,
      capability: "independent collector mints",
      stageName: "Collector one connected",
      focusSelector: "#account",
      evidence: [
        { selector: "h1", expectedText: "Gnocchi" },
        { selector: "#account", expectedText: signerSet.collector.address.slice(0, 7) },
      ],
    }));
    for (const [tokenId, policy] of [[0, "Timed OE"], [1, "Forever OE"], [2, "Limited Edition"]] as const) {
      await mintToken(collectorOneActor.page, freshContractAddress, tokenId, policy);
      screenshots.push(await captureStage({
        actor: collectorOneActor,
        outputRoot: runRoot,
        ordinal: 10 + tokenId,
        capability: "independent collector mints",
        stageName: `Collector one minted token ${tokenId}`,
        focusSelector: "#mintInfo",
        evidence: [
          { selector: "#mintInfo", expectedText: policy },
          { selector: "#log", expectedText: "minted ✓" },
        ],
      }));
    }

    await loadMintPolicy(creatorActor.page, freshContractAddress, 1, "Forever OE");
    await creatorActor.page.click("#btnVaultEdition");
    await waitForLog(creatorActor.page, "issuance vaulted ✓");
    await waitForText(creatorActor.page, "#mintInfo", "VAULTED — EXISTING TOKENS UNAFFECTED");
    await assertNoUndecodedOptionText(creatorActor.page, "#mintInfo", "vaulted edition manager");
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 13,
      capability: "vault and reopen forever issuance",
      stageName: "Forever OE vaulted",
      focusSelector: "#mintInfo",
      evidence: [
        { selector: "#mintInfo", expectedText: "VAULTED — EXISTING TOKENS UNAFFECTED" },
        { selector: "#log", expectedText: "issuance vaulted ✓" },
      ],
    }));

    collectorTwoActor = await openActorPage(collectorTwo.bridge);
    await configureBase(collectorTwoActor.page, ipfs.apiUrl);
    await connectActor(collectorTwoActor.page, signerSet.collectorTwo.address);
    await loadMintPolicy(collectorTwoActor.page, freshContractAddress, 1, "VAULTED — EXISTING TOKENS UNAFFECTED");
    await collectorTwoActor.page.click("#btnMint");
    await waitForLog(collectorTwoActor.page, "mint failed: this sale is paused");
    screenshots.push(await captureStage({
      actor: collectorTwoActor,
      outputRoot: runRoot,
      ordinal: 14,
      capability: "vault and reopen forever issuance",
      stageName: "Vaulted collector mint rejected",
      focusSelector: "#mintInfo",
      evidence: [
        { selector: "#mintInfo", expectedText: "VAULTED — EXISTING TOKENS UNAFFECTED" },
        { selector: "#log", expectedText: "mint failed: this sale is paused" },
      ],
    }));

    await creatorActor.page.click("#btnUnvaultEdition");
    await waitForLog(creatorActor.page, "issuance reopened ✓");
    await waitForText(creatorActor.page, "#mintInfo", "ISSUANCE OPEN");
    await assertNoUndecodedOptionText(creatorActor.page, "#mintInfo", "reopened edition manager");
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: 15,
      capability: "vault and reopen forever issuance",
      stageName: "Forever OE reopened",
      focusSelector: "#mintInfo",
      evidence: [
        { selector: "#mintInfo", expectedText: "ISSUANCE OPEN" },
        { selector: "#log", expectedText: "issuance reopened ✓" },
      ],
    }));

    for (const [tokenId, policy] of [[0, "Timed OE"], [1, "Forever OE"], [2, "Limited Edition"]] as const) {
      await mintToken(collectorTwoActor.page, freshContractAddress, tokenId, policy);
      screenshots.push(await captureStage({
        actor: collectorTwoActor,
        outputRoot: runRoot,
        ordinal: 16 + tokenId,
        capability: "independent collector mints",
        stageName: `Collector two minted token ${tokenId}`,
        focusSelector: "#mintInfo",
        evidence: [
          { selector: "#mintInfo", expectedText: policy },
          { selector: "#log", expectedText: "minted ✓" },
        ],
      }));
    }
    await loadMintPolicy(collectorOneActor.page, freshContractAddress, 2, "3 lifetime minted / 3 cap");
    await collectorOneActor.page.click("#btnMint");
    await waitForLog(collectorOneActor.page, "mint failed: not enough supply left");
    screenshots.push(await captureStage({
      actor: collectorOneActor,
      outputRoot: runRoot,
      ordinal: 19,
      capability: "independent collector mints",
      stageName: "Limited edition cap enforced",
      focusSelector: "#mintInfo",
      evidence: [
        { selector: "#mintInfo", expectedText: "3 lifetime minted / 3 cap" },
        { selector: "#log", expectedText: "mint failed: not enough supply left" },
      ],
    }));

    const creatorPublicState = await creatorActor.page.evaluate(() => ({
      installed: (window as any).__pastaUiLiveBridge?.installed === true,
      classification: (window as any).__pastaUiLiveBridge?.classification,
      account: (window as any).__pastaUiLiveBridge?.getAccount?.(),
    }));
    assert.deepEqual(creatorPublicState, {
      installed: true,
      classification: "UI-LIVE",
      account: signerSet.creator.address,
    });
  } finally {
    await Promise.all([
      closeActorPage(creatorActor),
      closeActorPage(collectorOneActor),
      closeActorPage(collectorTwoActor),
    ]);
    await Promise.all([
      creatorBridge.close(),
      collectorOne?.bridge.close() || Promise.resolve(),
      collectorTwo?.bridge.close() || Promise.resolve(),
    ]);
  }

  assert.ok(freshContractAddress, "browser did not originate a fresh Gnocchi contract");
  assert.equal(pins.length, 7, "Gnocchi UI must pin three media, one collection metadata, and three token metadata artifacts");
  const pinArtifacts = await writePinArtifacts(appRoot, pins);
  const tokenMetadataRecords = pins.filter((pin) => pin.value && typeof pin.value === "object" && !Array.isArray(pin.value) &&
    typeof (pin.value as Record<string, unknown>).artifactUri === "string");
  const mediaPins = pins.filter((pin) => pin.bytes);
  assert.equal(tokenMetadataRecords.length, 3);
  assert.equal(mediaPins.length, 3);
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    assert.equal(
      (tokenMetadataRecords[tokenId].value as Record<string, unknown>).artifactUri,
      mediaPins[tokenId].proof.uri,
      `token ${tokenId} metadata must bind its exact pinned media URI`,
    );
  }
  const sessions = [creatorSession, collectorOne!.session, collectorTwo!.session];
  const writeReceipts = operationReceipts(sessions);
  const operationHashes = assertReceiptIdentifiers(writeReceipts, freshContractAddress);
  const tokenMetadataUris = tokenMetadataRecords.map((record) => record.proof.uri);
  const indexed = await verifyIndexedProof({
    contractAddress: freshContractAddress,
    creator: signerSet.creator.address,
    collectorOne: signerSet.collector.address,
    collectorTwo: signerSet.collectorTwo.address,
    collectionMetadataUri,
    tokenMetadataUris,
  });
  const completedAt = new Date().toISOString();
  const receipt = {
    schema: "pastaprotocol-gnocchi-ui-live-run@1",
    classification: "UI-LIVE",
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    rpcUrl: rpc.rpcUrl,
    startedAt,
    completedAt,
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
    contract: {
      address: freshContractAddress,
      explorerUrl: `https://shadownet.tzkt.io/${freshContractAddress}`,
    },
    receipts: sessions.flatMap((session) => session.getReceipts()),
    pins: pinArtifacts.records,
    indexed,
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    screenshotSidecars: screenshots.map((capture) => capture.manifestSidecarArtifact),
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptRelativePath = "artifacts/gnocchi-ui-live-run.json";
  const receiptPath = path.join(appRoot, receiptRelativePath);
  await writeFile(receiptPath, receiptBytes);
  const receiptArtifact = {
    id: "ui-live-run-receipt",
    kind: "run-receipt",
    path: receiptRelativePath,
    sha256: sha256(receiptBytes),
  };
  const sidecarArtifacts = screenshots.map((capture) => capture.manifestSidecarArtifact);
  const artifacts = [...pinArtifacts.records, receiptArtifact, ...sidecarArtifacts];
  const operations = writeReceipts.map(operationRecord);
  const tokens = [0, 1, 2].map((tokenId) => ({
    id: `gnocchi-token-${tokenId}`,
    contractAddress: freshContractAddress,
    tokenId: String(tokenId),
    explorerUrl: `https://shadownet.tzkt.io/${freshContractAddress}/tokens/${tokenId}`,
    metadataArtifactId: pinArtifacts.tokenMetadataIds[tokenId],
    mediaArtifactId: pinArtifacts.tokenMediaIds[tokenId],
    metadataUri: tokenMetadataRecords[tokenId].proof.uri,
    artifactUri: mediaPins[tokenId].proof.uri,
  }));
  const allUrls = [
    `https://shadownet.tzkt.io/${freshContractAddress}`,
    ...tokens.map((token) => token.explorerUrl),
    ...pinArtifacts.records.map((artifact) => artifact.gatewayUrl),
  ];
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "gnocchi",
    role: "token-publisher",
    runId,
    capturedAt: completedAt,
    network: {
      name: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
      rpcUrl: rpc.rpcUrl,
    },
    capabilities: [{
      id: "three-policy-collector-and-lifecycle-proof",
      description: "Originate one Gnocchi collection, publish timed OE, forever OE, and timed capped LE tokens, mint each from two independent collectors, enforce the LE cap, and vault then reopen forever issuance through the real app UI.",
      evidence: {
        screenshots: screenshots.map((capture) => capture.manifestScreenshot.stage),
        artifacts: artifacts.map((artifact) => artifact.id),
        contracts: [freshContractAddress],
        operations: operations.map((operation) => operation.hash),
        tokens: tokens.map((token) => token.id),
        roleEvidence: [],
        urls: allUrls,
      },
    }],
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    artifacts,
    contracts: [{
      address: freshContractAddress,
      kind: "open-edition-collection",
      explorerUrl: `https://shadownet.tzkt.io/${freshContractAddress}`,
    }],
    operations,
    tokens,
    roleEvidence: [],
  };
  const manifestPath = path.join(appRoot, "manifest.json");
  await writeFile(manifestPath, deterministicJsonBytes(manifest));
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    classification: "UI-LIVE",
    contractAddress: freshContractAddress,
    operationHashes,
    receiptPath,
    manifestPath,
  }, null, 2)}\n`);
  return { contractAddress: freshContractAddress, manifestPath, receiptPath, operationHashes, screenshots };
}

async function main(): Promise<void> {
  try {
    await runGnocchiUiLive();
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
