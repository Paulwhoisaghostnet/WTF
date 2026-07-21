#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

import { MichelsonMap, type TezosToolkit } from "@taquito/taquito";
import { validateContractAddress, validateOperation, ValidationResult } from "@taquito/utils";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  hashJsonForBridge,
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
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

const EXECUTE_FLAG = "PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const CREATOR_OPERATION_RESERVE_MUTEZ = 1_000_000;
const COLLECTOR_OPERATION_RESERVE_MUTEZ = 500_000;
const MAX_SUPPLY = 3;
const RESERVATION_TTL_SECONDS = 3_600;
const STATIC_ROOT = path.join(root, "public");
const CONTRACT_ARTIFACT_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "rotini",
  "contract",
  "pasta-generative-collection.contract.json",
);
const OUTPUTS = Object.freeze([
  { mode: "png", mimeType: "image/png", extension: "png", priceMutez: 0 },
  { mode: "gif", mimeType: "image/gif", extension: "gif", priceMutez: 1 },
  { mode: "zip", mimeType: "application/zip", extension: "zip", priceMutez: 1 },
] as const);
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

type RotiniMode = (typeof OUTPUTS)[number]["mode"];

type RotiniBrowserProjection = {
  next_project_id: number;
  next_reservation_id: number;
  next_token_id: number;
  projects: Record<string, unknown>;
  reservations: Record<string, unknown>;
  latest_reservation: Record<string, number>;
};

type PinnedRecord = {
  actor: "creator" | "collector";
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
  actor: "creator" | "collector";
};

export type RotiniUiLiveResult = {
  manifestPath: string;
  receiptPath: string;
  contractAddress: string;
  operationHashes: string[];
  tokenIds: number[];
  screenshots: CapturePastaProofStageResult[];
};

export function assertRotiniUiLiveExecutionAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[EXECUTE_FLAG] !== "1") {
    block("explicit Rotini UI-live execute flag is required", [
      `\`${EXECUTE_FLAG}=1\` is required because this lane pins durable generator/output bytes and signs a fresh Shadownet origination plus publish, reserve, and finalize operations.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Rotini UI-live runner only permits Shadownet", [
      "Unset `TEZOS_NETWORK` or set it to `shadownet`; mainnet execution is refused.",
    ]);
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [
      `Set \`${OUTPUT_ENV}\` to an existing aggregate proof-run root before executing this lane.`,
    ]);
  }
  for (const key of [
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_ROTINI_UI_LIVE_RESUME",
    "PASTA_SHADOWNET_ROTINI_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) {
      block("Rotini UI-live proof is fresh-origination only", [
        `Unset \`${key}\`; proof runs may not resume or attach to an existing contract.`,
      ]);
    }
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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

export function buildRotiniProofLayerPng(red: number, green: number, blue: number, alpha = 255): Buffer {
  for (const [label, value] of Object.entries({ red, green, blue, alpha })) {
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 255, `${label} channel is invalid`);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.from([0, red, green, blue, alpha, red, green, blue, alpha]);
  const pixels = Buffer.concat([row, row]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function validateRotiniOutputBytes(mode: RotiniMode, bytes: Uint8Array): void {
  assert.ok(bytes.byteLength > 20, `${mode} artifact is unexpectedly small`);
  if (mode === "png") {
    assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    return;
  }
  if (mode === "gif") {
    assert.equal(Buffer.from(bytes.slice(0, 6)).toString("ascii"), "GIF89a");
    assert.equal(bytes.at(-1), 0x3b, "animated GIF is missing its trailer");
    return;
  }
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const archiveText = Buffer.from(bytes).toString("latin1");
  for (const required of ["index.html", "rotini-manifest.json", "assets/layer-01.png", "assets/layer-02.png"]) {
    assert.ok(archiveText.includes(required), `interactive ZIP is missing ${required}`);
  }
  assert.doesNotMatch(archiveText, /\b(?:https?:)?\/\//i, "interactive ZIP contains an external URL");
  assert.doesNotMatch(archiveText, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, "interactive ZIP contains a network API");
}

async function requireFreshAppOutputDirectory(runRoot: string): Promise<{ appRoot: string; runId: string }> {
  const absoluteRunRoot = path.resolve(runRoot);
  let runRootStat;
  try {
    runRootStat = await stat(absoluteRunRoot);
  } catch (error) {
    block("Pasta proof run directory does not exist", [
      `Create the aggregate proof-run root \`${absoluteRunRoot}\` before executing Rotini.`,
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
  const appRoot = path.join(absoluteRunRoot, "rotini");
  try {
    await stat(appRoot);
    block("Rotini proof output directory already exists", [
      `Refusing to overwrite \`${appRoot}\`; use a fresh proof-run directory or remove only an explicitly discarded Rotini lane.`,
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { appRoot, runId };
}

async function readContractArtifact(): Promise<unknown[]> {
  const code = JSON.parse(await readFile(CONTRACT_ARTIFACT_PATH, "utf8"));
  assert.ok(Array.isArray(code), "Rotini contract artifact must be a Michelson JSON array");
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
    projects: new MichelsonMap(),
    reservations: new MichelsonMap(),
    latest_reservation: new MichelsonMap(),
    token_project: new MichelsonMap(),
    token_seed: new MichelsonMap(),
    token_artifact: new MichelsonMap(),
    minted_by: new MichelsonMap(),
    reserved_by: new MichelsonMap(),
    pack_minters: new MichelsonMap(),
    pack_reserved: new MichelsonMap(),
    next_project_id: 0,
    next_reservation_id: 0,
    next_token_id: 0,
  };
}

function assertEmptyMichelsonMap(value: unknown, label: string): void {
  assert.ok(value instanceof MichelsonMap, `${label} must be a MichelsonMap`);
  assert.equal([...value.entries()].length, 0, `${label} must begin empty`);
}

function validateBrowserOrigination(
  input: { code: unknown; storage: unknown },
  expectedCodeHash: string,
  creatorAddress: string,
): void {
  assert.equal(hashJsonForBridge(input.code), expectedCodeHash, "browser requested an unexpected Rotini contract artifact");
  assert.ok(input.storage && typeof input.storage === "object" && !Array.isArray(input.storage));
  const storage = input.storage as Record<string, unknown>;
  assert.equal(storage.administrator, creatorAddress);
  assert.equal(storage.pending_administrator, null);
  assert.equal(storage.next_project_id, 0);
  assert.equal(storage.next_reservation_id, 0);
  assert.equal(storage.next_token_id, 0);
  assert.ok(storage.metadata instanceof MichelsonMap);
  assert.equal([...storage.metadata.entries()].length, 1);
  for (const key of [
    "ledger", "operators", "token_metadata", "total_supply", "projects", "reservations",
    "latest_reservation", "token_project", "token_seed", "token_artifact", "minted_by",
    "reserved_by", "pack_minters", "pack_reserved",
  ]) {
    assertEmptyMichelsonMap(storage[key], key);
  }
}

function safeNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const candidate = value as { toNumber?: () => number; toString?: () => string } | null;
  if (candidate && typeof candidate.toNumber === "function") return candidate.toNumber();
  const parsed = Number(candidate && typeof candidate.toString === "function" ? candidate.toString() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function jsonSafeValue(value: unknown, depth = 0): unknown {
  if (depth > 24) return "[depth-limited]";
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((entry) => jsonSafeValue(entry, depth + 1));
  if (!value || typeof value !== "object") return String(value);
  const candidate = value as Record<string, unknown> & { toNumber?: () => number; toFixed?: () => string };
  if (typeof candidate.toNumber === "function") return candidate.toNumber();
  if (typeof candidate.toFixed === "function") return candidate.toFixed();
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(candidate)) {
    if (typeof child !== "function") output[key] = jsonSafeValue(child, depth + 1);
  }
  return output;
}

async function mapGet(map: unknown, key: string | number): Promise<unknown> {
  const candidate = map as { get?: (value: string | number) => Promise<unknown> | unknown } | null;
  if (!candidate || typeof candidate.get !== "function") return undefined;
  const direct = await candidate.get(key);
  if (direct !== undefined && direct !== null) return direct;
  if (typeof key === "number") return candidate.get(String(key));
  if (/^\d+$/.test(key)) return candidate.get(Number(key));
  return undefined;
}

export async function readRotiniBrowserProjection(
  tezos: TezosToolkit,
  contractAddress: string,
  ownerAddress: string,
): Promise<RotiniBrowserProjection> {
  const contract = await tezos.contract.at(contractAddress);
  const storage = await contract.storage() as Record<string, unknown>;
  const nextProjectId = safeNumber(storage.next_project_id);
  const projects: Record<string, unknown> = {};
  for (let projectId = 0; projectId < nextProjectId; projectId += 1) {
    const project = await mapGet(storage.projects, projectId);
    if (project !== undefined && project !== null) projects[String(projectId)] = jsonSafeValue(project);
  }
  const reservations: Record<string, unknown> = {};
  const latestReservation: Record<string, number> = {};
  const latestIdValue = await mapGet(storage.latest_reservation, ownerAddress);
  if (latestIdValue !== undefined && latestIdValue !== null) {
    const latestId = safeNumber(latestIdValue);
    const reservation = await mapGet(storage.reservations, latestId);
    if (reservation !== undefined && reservation !== null) {
      latestReservation[ownerAddress] = latestId;
      reservations[String(latestId)] = jsonSafeValue(reservation);
    }
  }
  return {
    next_project_id: nextProjectId,
    next_reservation_id: safeNumber(storage.next_reservation_id),
    next_token_id: safeNumber(storage.next_token_id),
    projects,
    reservations,
    latest_reservation: latestReservation,
  };
}

export async function installRotiniBrowserAdapters(page: Page, publicGatewayBaseUrl: string): Promise<void> {
  const gateway = publicGatewayBaseUrl.replace(/\/+$/, "");
  const gatewayLiteral = JSON.stringify(gateway).replace(/</g, "\\u003c");
  const script = await page.addScriptTag({ content: `(() => {
    "use strict";
    const gatewayBase = ${gatewayLiteral};
    const md = window.MD;
    const toolkit = md && md.getToolkit && md.getToolkit();
    if (!md || !toolkit || !toolkit.contract || !toolkit.contract.at) throw new Error("Rotini bridge runtime is not ready");
    const originalAt = toolkit.contract.at.bind(toolkit.contract);
    toolkit.contract.at = async function (contractAddress) {
      const contract = await originalAt(contractAddress);
      const originalStorage = contract.storage.bind(contract);
      contract.storage = async function () {
        const raw = await originalStorage();
        const projects = raw.projects;
        const reservations = raw.reservations;
        const latestReservation = raw.latest_reservation;
        return Object.assign({}, raw, {
          projects: projects && typeof projects.get === "function" ? projects : Object.freeze({ async get(key) { return projects && projects[String(key)]; } }),
          reservations: reservations && typeof reservations.get === "function" ? reservations : Object.freeze({ async get(key) { return reservations && reservations[String(key)]; } }),
          latest_reservation: latestReservation && typeof latestReservation.get === "function" ? latestReservation : Object.freeze({ async get(key) { return latestReservation && latestReservation[String(key)]; } }),
        });
      };
      return contract;
    };
    md.ipfsToHttp = function (uri) {
      return uri && uri.startsWith("ipfs://") ? gatewayBase + "/" + uri.slice(7) : uri;
    };
    window.__rotiniUiLiveAdaptersInstalled = true;
  })();` });
  await page.waitForFunction(() => (window as any).__rotiniUiLiveAdaptersInstalled === true);
  await script.evaluate((element) => element.parentNode?.removeChild(element));
}

export async function configureRotiniStudio(page: Page, kuboApiUrl: string): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", kuboApiUrl);
  await page.fill("#collName", "Rotini UI-LIVE Shadownet Proof");
  await page.fill("#collSymbol", "ROTUI");
  await page.fill("#collDesc", "Actual Rotini UI with separate Node-only creator and collector Shadownet signers.");
  await page.fill("#genSize", "64");
  await page.fill("#genCount", String(MAX_SUPPLY));
  await page.fill("#genSeed", "rotini-ui-live-proof");
  await page.uncheck("#genUnique");
  await page.fill("#reservationMinutes", "60");
  await page.fill("#salePrice", String(OUTPUTS[0].priceMutez / 1_000_000));
  await page.fill("#saleWalletCap", String(MAX_SUPPLY));
  const layerNames = ["Background", "Foreground"];
  const variantNames = ["Marinara", "Pesto"];
  const layerBytes = [buildRotiniProofLayerPng(180, 35, 52), buildRotiniProofLayerPng(24, 152, 96, 180)];
  const layers = page.locator("#layers .pp-layer");
  await layers.first().waitFor({ state: "visible" });
  assert.equal(await layers.count(), 2, "Rotini should initialize two proof layers");
  for (let index = 0; index < 2; index += 1) {
    const layer = layers.nth(index);
    await layer.locator(".l-name").fill(layerNames[index]);
    await layer.locator(".v-label").fill(variantNames[index]);
    await layer.locator(".v-weight").fill("1");
    await layer.locator(".v-file").setInputFiles({
      name: `rotini-layer-${index + 1}.png`,
      mimeType: "image/png",
      buffer: layerBytes[index],
    });
  }
  await page.waitForFunction(() => document.querySelectorAll("#layers .pp-variant-thumb").length === 2);
  await page.selectOption("#outputMode", "png");
  await page.click("#btnGenerate");
  await page.waitForFunction(() => document.getElementById("genStatus")?.textContent?.includes("generated 3 edition(s)"));
}

async function waitForLogOccurrence(page: Page, text: string, count: number, timeout = 300_000): Promise<void> {
  await page.locator("#log").waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    ({ expected, minimum }) => {
      const content = document.getElementById("log")?.textContent || "";
      return content.split(expected).length - 1 >= minimum;
    },
    { expected: text, minimum: count },
    { timeout },
  );
}

async function waitForLogOccurrenceOrFailure(
  page: Page,
  text: string,
  count: number,
  failureText: string,
  timeout = 300_000,
): Promise<void> {
  await page.locator("#log").waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    ({ expected, minimum, failure }) => {
      const content = document.getElementById("log")?.textContent || "";
      return content.split(expected).length - 1 >= minimum || content.includes(failure);
    },
    { expected: text, minimum: count, failure: failureText },
    { timeout },
  );
  const content = await page.locator("#log").textContent() || "";
  if (content.split(text).length - 1 < count) {
    throw new Error(`Rotini browser reported a failed stage: ${content.slice(-2_000)}`);
  }
}

async function waitForText(page: Page, selector: string, expected: string, timeout = 300_000): Promise<void> {
  await page.waitForFunction(
    ({ target, text }) => document.querySelector(target)?.textContent?.includes(text),
    { target: selector, text: expected },
    { timeout },
  );
}

async function captureStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  capability: string,
  stageName: string,
  focusSelector: string,
  expectedLog: string,
  extraEvidence: Array<{ selector: string; name: string; expectedText: string | RegExp }> = [],
): Promise<CapturePastaProofStageResult> {
  await page.locator(focusSelector).scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "rotini",
    capability,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "h1", name: "application", expectedText: "Rotini" },
      { selector: "#network", name: "network", expectedText: "Shadownet" },
      { selector: "#log", name: "stage log", expectedText: expectedLog },
      ...extraEvidence,
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function openBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
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
  return { browser, context, page: await context.newPage() };
}

function modeFromHex(value: unknown): RotiniMode {
  const mode = hexToUtf8(String(value || "")) as RotiniMode;
  assert.ok(OUTPUTS.some((output) => output.mode === mode), `unsupported Rotini mode ${mode}`);
  return mode;
}

function createCreatorCallValidator(creatorAddress: string) {
  const createdModes: RotiniMode[] = [];
  return {
    createdModes,
    validate(input: { entrypoint: string; payload: unknown }): void {
      assert.equal(input.entrypoint, "create_project", `creator UI attempted unexpected ${input.entrypoint}`);
      assert.ok(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
      const payload = input.payload as Record<string, unknown>;
      const mode = modeFromHex(payload.output_mode);
      assert.equal(mode, OUTPUTS[createdModes.length]?.mode, "Rotini projects must be published in PNG/GIF/ZIP order");
      assert.equal(payload.active, true);
      assert.equal(payload.treasury, creatorAddress);
      assert.equal(safeNumber(payload.price), OUTPUTS[createdModes.length]?.priceMutez);
      assert.equal(safeNumber(payload.max_supply), MAX_SUPPLY);
      assert.equal(safeNumber(payload.max_per_wallet), MAX_SUPPLY);
      assert.equal(safeNumber(payload.reservation_ttl), RESERVATION_TTL_SECONDS);
      assert.match(hexToUtf8(String(payload.generator_uri || "")), /^ipfs:\/\/b[a-z2-7]{20,}$/);
      assert.match(hexToUtf8(String(payload.display_uri || "")), /^ipfs:\/\/b[a-z2-7]{20,}$/);
      createdModes.push(mode);
    },
  };
}

function createCollectorCallValidator() {
  const reservedProjects: number[] = [];
  const finalizedReservations: number[] = [];
  return {
    reservedProjects,
    finalizedReservations,
    validate(input: { entrypoint: string; payload: unknown }): void {
      if (input.entrypoint === "reserve_iteration") {
        const projectId = safeNumber(input.payload);
        assert.equal(projectId, reservedProjects.length, "collector must reserve PNG/GIF/ZIP projects in order");
        reservedProjects.push(projectId);
        return;
      }
      assert.equal(input.entrypoint, "finalize_iteration", `collector UI attempted unexpected ${input.entrypoint}`);
      assert.ok(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
      const payload = input.payload as Record<string, unknown>;
      const reservationId = safeNumber(payload.reservation_id);
      assert.equal(reservationId, finalizedReservations.length, "collector must finalize each fresh reservation once");
      for (const field of ["metadata_uri", "artifact_uri", "display_uri", "thumbnail_uri"]) {
        assert.match(hexToUtf8(String(payload[field] || "")), /^ipfs:\/\/b[a-z2-7]{20,}$/);
      }
      assert.match(String(payload.artifact_hash || ""), /^[a-f0-9]{64}$/);
      const expectedMime = OUTPUTS[finalizedReservations.length]?.mimeType;
      assert.equal(hexToUtf8(String(payload.mime_type || "")), expectedMime);
      finalizedReservations.push(reservationId);
    },
  };
}

async function writePinnedArtifacts(appRoot: string, pins: PinnedRecord[]): Promise<WrittenPinArtifact[]> {
  const output: WrittenPinArtifact[] = [];
  const usedIds = new Set<string>();
  for (const [index, record] of pins.entries()) {
    assert.equal(record.proof.publicGatewayVerified, true, `${record.proof.fileName} lacks independent public-gateway verification`);
    const bytes = record.bytes ?? deterministicJsonBytes(record.value);
    assert.equal(sha256(bytes), record.proof.sha256, `pin ${record.proof.fileName} bytes differ from its bridge receipt`);
    assert.equal(bytes.byteLength, record.proof.byteLength);
    const safeFile = record.proof.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
    const relativePath = `artifacts/pins/${String(index + 1).padStart(3, "0")}-${record.actor}-${safeFile}`;
    await writeFile(path.join(appRoot, relativePath), bytes);
    let kind = "pinned-proof-artifact";
    if (safeFile === "collection.json") kind = "collection-metadata";
    else if (safeFile === "rotini-generator.json") kind = "generator-metadata";
    else if (/^rotini-[0-9]+\.json$/.test(safeFile)) kind = "token-metadata";
    else if (/^rotini-[0-9]+-cover\.png$/.test(safeFile)) kind = "token-display";
    else if (/^rotini-[0-9]+\.(?:png|gif|zip)$/.test(safeFile)) kind = "token-media";
    else if (safeFile.includes("layer")) kind = "generator-layer";
    else if (safeFile.includes("preview")) kind = "generator-preview";
    let id = `pin-${String(index + 1).padStart(3, "0")}-${kind}`;
    while (usedIds.has(id)) id += "-x";
    usedIds.add(id);
    output.push({
      id,
      kind,
      path: relativePath,
      sha256: record.proof.sha256,
      ipfsUri: record.proof.uri,
      gatewayUrl: record.proof.publicGatewayUrl,
      retrievedSha256: record.proof.sha256,
      fileName: record.proof.fileName,
      actor: record.actor,
    });
  }
  return output;
}

function assertOperationReceipts(
  creatorReceipts: PastaUiLivePublicReceipt[],
  collectorReceipts: PastaUiLivePublicReceipt[],
  creatorAddress: string,
  collectorAddress: string,
): { contractAddress: string; operationReceipts: Array<PastaUiLivePublicReceipt & { operationHash: string }> } {
  const originations = creatorReceipts.filter((receipt) => receipt.action === "originate");
  assert.equal(originations.length, 1, "creator UI must originate exactly one collection");
  const contractAddress = originations[0].contractAddress || "";
  assert.equal(validateContractAddress(contractAddress), ValidationResult.VALID);
  const creatorOperations = creatorReceipts.filter((receipt) => receipt.operationHash);
  const collectorOperations = collectorReceipts.filter((receipt) => receipt.operationHash);
  assert.equal(creatorOperations.length, 4, "creator UI must originate once and publish three projects");
  assert.equal(collectorOperations.length, 6, "collector UI must reserve and finalize three iterations");
  assert.deepEqual(creatorOperations.slice(1).map((receipt) => receipt.entrypoints), [
    ["create_project"], ["create_project"], ["create_project"],
  ]);
  assert.deepEqual(collectorOperations.map((receipt) => receipt.entrypoints), [
    ["reserve_iteration"], ["finalize_iteration"],
    ["reserve_iteration"], ["finalize_iteration"],
    ["reserve_iteration"], ["finalize_iteration"],
  ]);
  for (const receipt of creatorOperations) {
    assert.equal(receipt.signerAddress, creatorAddress);
    assert.equal(receipt.contractAddress, contractAddress);
  }
  for (const receipt of collectorOperations) {
    assert.equal(receipt.signerAddress, collectorAddress);
    assert.equal(receipt.contractAddress, contractAddress);
  }
  const operationReceipts = [...creatorOperations, ...collectorOperations] as Array<PastaUiLivePublicReceipt & { operationHash: string }>;
  for (const receipt of operationReceipts) {
    assert.equal(validateOperation(receipt.operationHash), ValidationResult.VALID);
  }
  return { contractAddress, operationReceipts };
}

async function verifyTzktEvidence(
  contractAddress: string,
  collectorAddress: string,
  tokenPins: Array<{ tokenId: number; metadataUri: string; artifactUri: string; artifactHash: string; mimeType: string }>,
  operationReceipts: Array<PastaUiLivePublicReceipt & { operationHash: string }>,
): Promise<unknown> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const indexedContract = await pollJson(
    "Rotini UI-live TZIP-12 FA2 asset contract",
    `${base}/contracts/${contractAddress}`,
    (json) => json?.address === contractAddress && json?.kind === "asset" &&
      Array.isArray(json?.tzips) && json.tzips.includes("fa2") &&
      Number(json?.tokensCount) === tokenPins.length,
  );
  const indexedStorage = await pollJson(
    "Rotini UI-live storage",
    `${base}/contracts/${contractAddress}/storage`,
    (json) => Number(json?.next_project_id) === 3 && Number(json?.next_token_id) === 3 &&
      Number(json?.projects) > 0 && Number(json?.ledger) > 0 &&
      Number(json?.token_metadata) > 0 && Number(json?.token_artifact) > 0,
  );
  const projects = await pollJson(
    "Rotini UI-live finalized project state",
    `${base}/bigmaps/${indexedStorage.projects}/keys?limit=20`,
    (json) => Array.isArray(json) && OUTPUTS.every((output, projectId) => json.some((entry) =>
      Number(entry?.key) === projectId && entry?.value?.active === true &&
      Number(entry?.value?.price) === output.priceMutez &&
      Number(entry?.value?.max_supply) === MAX_SUPPLY &&
      Number(entry?.value?.minted) === 1 && Number(entry?.value?.reserved) === 0 &&
      hexToUtf8(entry?.value?.output_mode || "") === output.mode,
    )),
  );
  const packProject = projects.find((entry: any) => Number(entry?.key) === 0);
  assert.ok(packProject, "Rotini UI-live evidence is missing Ravioli-compatible project 0");
  assert.equal(Number(packProject.value?.price), 0, "Ravioli-compatible Rotini project must be free");
  assert.equal(Number(packProject.value?.max_supply), MAX_SUPPLY);
  assert.equal(Number(packProject.value?.minted), 1);
  assert.equal(Number(packProject.value?.reserved), 0);
  const ledger = await pollJson(
    "Rotini UI-live collector ledger",
    `${base}/bigmaps/${indexedStorage.ledger}/keys?limit=20`,
    (json) => Array.isArray(json) && tokenPins.every(({ tokenId }) => json.some((entry) =>
      entry?.key?.owner === collectorAddress && Number(entry?.key?.token_id) === tokenId && Number(entry.value) === 1,
    )),
  );
  const tokenMetadata = await pollJson(
    "Rotini UI-live token metadata",
    `${base}/bigmaps/${indexedStorage.token_metadata}/keys?limit=20`,
    (json) => Array.isArray(json) && tokenPins.every((token) => json.some((entry) =>
      Number(entry.key) === token.tokenId && hexToUtf8(entry.value?.token_info?.[""] || "") === token.metadataUri &&
      hexToUtf8(entry.value?.token_info?.artifactUri || "") === token.artifactUri,
    )),
  );
  const tokenArtifacts = await pollJson(
    "Rotini UI-live artifact bindings",
    `${base}/bigmaps/${indexedStorage.token_artifact}/keys?limit=20`,
    (json) => Array.isArray(json) && tokenPins.every((token) => json.some((entry) =>
      Number(entry.key) === token.tokenId && hexToUtf8(entry.value?.artifact_uri || "") === token.artifactUri &&
      hexToUtf8(entry.value?.mime_type || "") === token.mimeType &&
      String(entry.value?.artifact_hash || "").toLowerCase() === token.artifactHash,
    )),
  );
  const indexedTokens = await pollJson(
    "Rotini UI-live indexed FA2 tokens",
    `${base}/tokens?contract=${encodeURIComponent(contractAddress)}&limit=20`,
    (json) => Array.isArray(json) && tokenPins.every(({ tokenId }) => json.some((entry) =>
      entry?.contract?.address === contractAddress && Number(entry?.tokenId) === tokenId &&
      entry?.standard === "fa2" && Number(entry?.totalSupply) === 1,
    )),
  );
  const indexedBalances = await pollJson(
    "Rotini UI-live indexed collector balances",
    `${base}/tokens/balances?account=${encodeURIComponent(collectorAddress)}&token.contract=${encodeURIComponent(contractAddress)}&balance.ne=0&limit=20`,
    (json) => Array.isArray(json) && tokenPins.every(({ tokenId }) => json.some((entry) =>
      entry?.account?.address === collectorAddress &&
      entry?.token?.contract?.address === contractAddress &&
      Number(entry?.token?.tokenId) === tokenId && Number(entry?.balance) === 1,
    )),
  );
  const indexedOperations = [];
  for (const receipt of operationReceipts) {
    const family = receipt.action === "originate" ? "originations" : "transactions";
    const operation = await pollJson(
      `Rotini UI-live ${family} ${receipt.operationHash}`,
      `${base}/operations/${family}/${encodeURIComponent(receipt.operationHash)}`,
      (json) => json?.status === "applied" || (Array.isArray(json) && json.some((entry) => entry?.status === "applied")),
    );
    const record = Array.isArray(operation) ? operation.find((entry) => entry?.status === "applied") : operation;
    const target = record?.target?.address || record?.originatedContract?.address;
    assert.equal(record?.sender?.address, receipt.signerAddress, `TzKT sender differs for ${receipt.operationHash}`);
    assert.equal(target, contractAddress, `TzKT target differs for ${receipt.operationHash}`);
    if (receipt.action !== "originate") {
      assert.equal(
        record?.parameter?.entrypoint,
        receipt.entrypoints?.[0],
        `TzKT entrypoint differs for ${receipt.operationHash}`,
      );
    }
    indexedOperations.push({
      hash: receipt.operationHash,
      status: record?.status,
      type: record?.type,
      sender: record?.sender?.address,
      target,
      entrypoint: record?.parameter?.entrypoint || null,
      level: record?.level,
    });
  }
  return {
    schema: "pastaprotocol-rotini-tzkt-index@1",
    contractAddress,
    collectorAddress,
    contract: {
      address: indexedContract.address,
      kind: indexedContract.kind,
      tzips: indexedContract.tzips,
      tokensCount: Number(indexedContract.tokensCount),
    },
    storage: {
      nextProjectId: Number(indexedStorage.next_project_id),
      nextTokenId: Number(indexedStorage.next_token_id),
      projectsBigMap: Number(indexedStorage.projects),
      ledgerBigMap: Number(indexedStorage.ledger),
      tokenMetadataBigMap: Number(indexedStorage.token_metadata),
      tokenArtifactBigMap: Number(indexedStorage.token_artifact),
    },
    projects: projects.map((entry: any) => ({ key: entry.key, value: entry.value })),
    ravioliCompatibility: {
      projectId: 0,
      outputMode: "png",
      priceMutez: Number(packProject.value?.price),
      maxSupply: Number(packProject.value?.max_supply),
      minted: Number(packProject.value?.minted),
      reserved: Number(packProject.value?.reserved),
      remainingReservable: Number(packProject.value?.max_supply) - Number(packProject.value?.minted) - Number(packProject.value?.reserved),
      reservePackCapacityRequirement: "price == 0",
    },
    ledger: ledger.map((entry: any) => ({ key: entry.key, value: entry.value })),
    tokenMetadata: tokenMetadata.map((entry: any) => ({ key: entry.key, value: entry.value })),
    tokenArtifacts: tokenArtifacts.map((entry: any) => ({ key: entry.key, value: entry.value })),
    indexedTokens,
    indexedBalances,
    operations: indexedOperations,
  };
}

function pinBytes(record: PinnedRecord): Uint8Array {
  return record.bytes ?? deterministicJsonBytes(record.value);
}

function findTokenPin(pins: PinnedRecord[], fileName: string): PinnedRecord {
  const matches = pins.filter((record) => record.proof.fileName === fileName);
  assert.equal(matches.length, 1, `expected one exact pin receipt for ${fileName}`);
  return matches[0];
}

function artifactIdForPin(written: WrittenPinArtifact[], pin: PinnedRecord): string {
  const match = written.find((artifact) =>
    artifact.ipfsUri === pin.proof.uri && artifact.fileName === pin.proof.fileName && artifact.actor === pin.actor,
  );
  assert.ok(match, `written artifact is missing for ${pin.proof.fileName}`);
  return match.id;
}

export async function runRotiniUiLive(): Promise<RotiniUiLiveResult> {
  assertRotiniUiLiveExecutionAllowed(process.env);
  const runRoot = path.resolve(process.env[OUTPUT_ENV] || "");
  const { appRoot, runId } = await requireFreshAppOutputDirectory(runRoot);
  const ipfs: IpfsProofConfig = resolveIpfsProofConfig();
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const env = await signerEnv(rpc.rpcUrl);
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(env);
  assert.notEqual(creator.address, collector.address, "Rotini UI-live creator and collector must be independent wallets");
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "Rotini creator UI-live startup"),
    assertShadownet(collectorTezos, "Rotini collector UI-live startup"),
  ]);

  const code = await readContractArtifact();
  const placeholderMetadataUri = "ipfs://bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
  const [creatorBalanceValue, collectorBalanceValue] = await Promise.all([
    creatorTezos.tz.getBalance(creator.address),
    collectorTezos.tz.getBalance(collector.address),
  ]);
  const creatorBalanceMutez = Number(creatorBalanceValue.toString());
  const collectorBalanceMutez = Number(collectorBalanceValue.toString());
  let estimatedOriginationMutez: number;
  try {
    const estimate = await creatorTezos.estimate.originate({
      code,
      storage: buildOriginationStorage(creator.address, placeholderMetadataUri),
    } as never);
    estimatedOriginationMutez = Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/tez\.subtraction_underflow|balance.*underflow|insufficient.*balance/i.test(message)) {
      block("Rotini creator cannot fund the no-write origination simulation", [
        `Creator \`${creator.address}\` has \`${creatorBalanceValue.toString()}\` mutez.`,
        "The RPC rejected the estimate for insufficient balance; no directory, IPFS pin, or chain write was created.",
      ]);
    }
    throw error;
  }
  const requiredCreatorBalanceMutez = estimatedOriginationMutez + CREATOR_OPERATION_RESERVE_MUTEZ;
  const requiredCollectorBalanceMutez = COLLECTOR_OPERATION_RESERVE_MUTEZ +
    OUTPUTS.reduce((total, output) => total + output.priceMutez, 0);
  if (!Number.isSafeInteger(creatorBalanceMutez) || creatorBalanceMutez < requiredCreatorBalanceMutez) {
    block("Rotini UI-live creator is underfunded before any pin or chain write", [
      `Creator \`${creator.address}\` has \`${creatorBalanceValue.toString()}\` mutez.`,
      `Estimated origination plus creator operation reserve requires at least \`${requiredCreatorBalanceMutez}\` mutez.`,
      "No proof directory, artifact, metadata pin, or chain write was created.",
    ]);
  }
  if (!Number.isSafeInteger(collectorBalanceMutez) || collectorBalanceMutez < requiredCollectorBalanceMutez) {
    block("Rotini UI-live collector is underfunded before any pin or chain write", [
      `Collector \`${collector.address}\` has \`${collectorBalanceValue.toString()}\` mutez.`,
      `Three reservations (one free Ravioli-compatible PNG project and two 1-mutez projects) plus collector operation reserve require at least \`${requiredCollectorBalanceMutez}\` mutez.`,
      "No proof directory, artifact, metadata pin, or chain write was created.",
    ]);
  }

  await mkdir(path.join(appRoot, "artifacts", "pins"), { recursive: true });
  const pins: PinnedRecord[] = [];
  const screenshots: CapturePastaProofStageResult[] = [];
  const expectedCodeHash = hashJsonForBridge(code);
  const creatorValidator = createCreatorCallValidator(creator.address);
  let creatorProjection: RotiniBrowserProjection = {
    next_project_id: 0,
    next_reservation_id: 0,
    next_token_id: 0,
    projects: {},
    reservations: {},
    latest_reservation: {},
  };
  let creatorContractAddress = "";
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: creatorTezos,
    signerAddress: creator.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedEntrypoints: new Set(["create_project"]),
    assertExpectedChain: async (stage) => {
      await assertShadownet(creatorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
    validateOrigination: (input) => validateBrowserOrigination(input, expectedCodeHash, creator.address),
    validateCall: (input) => creatorValidator.validate(input),
    projectStorage: () => creatorProjection,
    onPin: ({ value, bytes, proof }) => {
      pins.push({ actor: "creator", value, bytes: bytes ? Uint8Array.from(bytes) : undefined, proof });
    },
    onReceipt: async (receipt) => {
      if (receipt.contractAddress) creatorContractAddress = receipt.contractAddress;
      if (receipt.operationHash && creatorContractAddress) {
        creatorProjection = await readRotiniBrowserProjection(creatorTezos, creatorContractAddress, creator.address);
      }
    },
  });
  creatorSession.authorizeAfterFundingPreflight({
    balanceMutez: creatorBalanceMutez,
    requiredBalanceMutez: requiredCreatorBalanceMutez,
    estimatedOriginationMutez,
    operationReserveMutez: CREATOR_OPERATION_RESERVE_MUTEZ,
  });

  const creatorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: (request) => creatorSession.handle(request),
  });
  let creatorBrowser: Browser | null = null;
  let creatorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  const startedAt = new Date().toISOString();
  try {
    const opened = await openBrowser();
    creatorBrowser = opened.browser;
    creatorMonitor = monitorPastaProofPage(opened.page);
    await opened.page.goto(`${creatorBridge.origin}/creation-tools/rotini/index.html`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await opened.page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap && (window as any).RotiniArtifacts));
    await installPastaUiLiveBrowserProxy(opened.page, creatorBridge, "UI-LIVE");
    await installRotiniBrowserAdapters(opened.page, ipfs.publicGatewayUrl);
    await configureRotiniStudio(opened.page, ipfs.apiUrl);
    await waitForLogOccurrence(opened.page, "generated 3 edition(s)", 1, 30_000);
    screenshots.push(await captureStage(
      opened.page, creatorMonitor, runRoot, 1,
      "configure deterministic generator", "PNG GIF and ZIP generator configured", "#genStatus",
      "generated 3 edition(s)",
      [{ selector: "#genStatus", name: "preview status", expectedText: "generated 3 edition(s)" }],
    ));

    await opened.page.click("#btnConnect");
    await waitForLogOccurrence(opened.page, `connected ${creator.address} on shadownet`, 1);
    screenshots.push(await captureStage(
      opened.page, creatorMonitor, runRoot, 2,
      "connect creator signer", "Creator connected to Shadownet", "#account",
      `connected ${creator.address} on shadownet`,
      [{ selector: "#account", name: "creator account", expectedText: creator.address.slice(0, 7) }],
    ));

    for (let index = 0; index < OUTPUTS.length; index += 1) {
      const output = OUTPUTS[index];
      await opened.page.fill("#salePrice", String(output.priceMutez / 1_000_000));
      if (index > 0) {
        await opened.page.selectOption("#outputMode", output.mode);
        await opened.page.check('input[name="target"][value="existing_contract"]');
      }
      await opened.page.click("#btnPublish");
      await waitForLogOccurrenceOrFailure(
        opened.page,
        "generative project published ✓",
        index + 1,
        "publish failed:",
      );
      await waitForText(opened.page, "#ppNotice", `Published ${output.mode.toUpperCase()} generator project ${index}`);
      const expectedContractLog = index === 0 ? "collection deployed:" : "registering collector-finalized generator project";
      screenshots.push(await captureStage(
        opened.page, creatorMonitor, runRoot, index + 3,
        `publish ${output.mode.toUpperCase()} generator`, `${output.mode.toUpperCase()} project pinned and published`, "#log",
        expectedContractLog,
        [{ selector: "#ppNotice", name: `${output.mode} publication`, expectedText: `Published ${output.mode.toUpperCase()} generator project ${index}` }],
      ));
    }
    assert.deepEqual(creatorValidator.createdModes, ["png", "gif", "zip"]);
  } finally {
    creatorMonitor?.dispose();
    await creatorBrowser?.close();
    await creatorBridge.close();
  }

  const creatorReceipts = creatorSession.getReceipts();
  const originationReceipt = creatorReceipts.find((receipt) => receipt.action === "originate");
  const contractAddress = originationReceipt?.contractAddress || "";
  assert.equal(validateContractAddress(contractAddress), ValidationResult.VALID);
  assert.equal(contractAddress, creatorContractAddress);

  let collectorProjection = await readRotiniBrowserProjection(collectorTezos, contractAddress, collector.address);
  const collectorValidator = createCollectorCallValidator();
  const collectorSession = new TaquitoPastaUiLiveSession({
    tezos: collectorTezos,
    signerAddress: collector.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([contractAddress]),
    allowedEntrypoints: new Set(["reserve_iteration", "finalize_iteration"]),
    assertExpectedChain: async (stage) => {
      await assertShadownet(collectorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
    validateCall: (input) => collectorValidator.validate(input),
    projectStorage: () => collectorProjection,
    onPin: ({ value, bytes, proof }) => {
      pins.push({ actor: "collector", value, bytes: bytes ? Uint8Array.from(bytes) : undefined, proof });
    },
    onReceipt: async (receipt) => {
      if (receipt.operationHash) {
        collectorProjection = await readRotiniBrowserProjection(collectorTezos, contractAddress, collector.address);
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
    staticRoot: STATIC_ROOT,
    handleAction: (request) => collectorSession.handle(request),
  });
  let collectorBrowser: Browser | null = null;
  let collectorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  try {
    const opened = await openBrowser();
    collectorBrowser = opened.browser;
    collectorMonitor = monitorPastaProofPage(opened.page);
    await opened.page.goto(`${collectorBridge.origin}/creation-tools/rotini/index.html`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await opened.page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap && (window as any).RotiniArtifacts));
    await installPastaUiLiveBrowserProxy(opened.page, collectorBridge, "UI-LIVE");
    await installRotiniBrowserAdapters(opened.page, ipfs.publicGatewayUrl);
    await opened.page.selectOption("#network", "shadownet");
    await opened.page.selectOption("#pinProvider", "node");
    await opened.page.fill("#pinNode", ipfs.apiUrl);
    await opened.page.fill("#mintKt", contractAddress);
    await opened.page.click("#btnConnect");
    await waitForLogOccurrence(opened.page, `connected ${collector.address} on shadownet`, 1);
    await opened.page.fill("#mintProjectId", "0");
    await opened.page.click("#btnLoadProject");
    await waitForText(opened.page, "#mintInfo", "PNG");
    assert.match(await opened.page.locator("#mintInfo").innerText(), /\/ 3 · PNG/);
    assert.doesNotMatch(await opened.page.locator("#mintInfo").innerText(), /\[object Object\]/);
    screenshots.push(await captureStage(
      opened.page, collectorMonitor, runRoot, 6,
      "load public collector mint", "Independent collector loaded PNG project", "#mintInfo",
      `connected ${collector.address} on shadownet`,
      [
        { selector: "#account", name: "collector account", expectedText: collector.address.slice(0, 7) },
        { selector: "#mintInfo", name: "loaded project", expectedText: "PNG" },
      ],
    ));

    for (let index = 0; index < OUTPUTS.length; index += 1) {
      const output = OUTPUTS[index];
      await opened.page.fill("#mintProjectId", String(index));
      await opened.page.click("#btnLoadProject");
      await waitForText(opened.page, "#mintInfo", output.mode.toUpperCase());
      assert.match(await opened.page.locator("#mintInfo").innerText(), new RegExp(`/ 3 · ${output.mode.toUpperCase()}`));
      assert.doesNotMatch(await opened.page.locator("#mintInfo").innerText(), /\[object Object\]/);
      await opened.page.click("#btnMintIteration");
      await waitForLogOccurrenceOrFailure(
        opened.page,
        `collector finalized ${output.mode.toUpperCase()} token ${index}`,
        1,
        "Iteration mint failed:",
      );
      await waitForText(opened.page, "#ppNotice", `${output.mode.toUpperCase()} iteration ${index} finalized`);
      await waitForText(opened.page, "#mintInfo", "1 finalized");
      screenshots.push(await captureStage(
        opened.page, collectorMonitor, runRoot, index + 7,
        `collector finalize ${output.mode.toUpperCase()} token`, `${output.mode.toUpperCase()} token reserved rendered pinned and finalized`, "#mintInfo",
        `collector finalized ${output.mode.toUpperCase()} token ${index}`,
        [
          { selector: "#ppNotice", name: `${output.mode} finalization`, expectedText: `${output.mode.toUpperCase()} iteration ${index} finalized` },
          { selector: "#mintInfo", name: `${output.mode} supply`, expectedText: "1 finalized" },
        ],
      ));
    }
    assert.deepEqual(collectorValidator.reservedProjects, [0, 1, 2]);
    assert.deepEqual(collectorValidator.finalizedReservations, [0, 1, 2]);
  } finally {
    collectorMonitor?.dispose();
    await collectorBrowser?.close();
    await collectorBridge.close();
  }

  const collectorReceipts = collectorSession.getReceipts();
  const identifiers = assertOperationReceipts(
    creatorReceipts,
    collectorReceipts,
    creator.address,
    collector.address,
  );
  assert.equal(identifiers.contractAddress, contractAddress);
  assert.equal(pins.length, 20, "Rotini UI should pin 13 publication inputs and seven finalized token artifacts");

  const tokenPinEvidence = OUTPUTS.map((output, tokenId) => {
    const artifact = findTokenPin(pins, `rotini-${tokenId}.${output.extension}`);
    const metadata = findTokenPin(pins, `rotini-${tokenId}.json`);
    const artifactBytes = pinBytes(artifact);
    validateRotiniOutputBytes(output.mode, artifactBytes);
    const metadataValue = metadata.value as Record<string, unknown>;
    assert.equal(metadataValue.artifactUri, artifact.proof.uri);
    assert.equal(metadataValue.formats && (metadataValue.formats as any[])[0]?.mimeType, output.mimeType);
    assert.equal(metadataValue["pasta:artifactSha256"], sha256(artifactBytes));
    return {
      tokenId,
      mode: output.mode,
      mimeType: output.mimeType,
      artifact,
      metadata,
      artifactUri: artifact.proof.uri,
      metadataUri: metadata.proof.uri,
      artifactHash: sha256(artifactBytes),
    };
  });

  const tzktEvidence = await verifyTzktEvidence(
    contractAddress,
    collector.address,
    tokenPinEvidence.map(({ tokenId, metadataUri, artifactUri, artifactHash, mimeType }) => ({
      tokenId, metadataUri, artifactUri, artifactHash, mimeType,
    })),
    identifiers.operationReceipts,
  );
  const writtenPins = await writePinnedArtifacts(appRoot, pins);
  const tzktBytes = deterministicJsonBytes(tzktEvidence);
  const tzktRelativePath = "artifacts/rotini-ui-live-tzkt-index.json";
  await writeFile(path.join(appRoot, tzktRelativePath), tzktBytes);

  const operations = identifiers.operationReceipts.map((receipt) => {
    const entrypoint = receipt.entrypoints?.[0] || null;
    const kind = receipt.action === "originate"
      ? "origination"
      : entrypoint === "create_project"
        ? "publish"
        : entrypoint === "reserve_iteration"
          ? "reserve"
          : "finalize";
    return {
      kind,
      hash: receipt.operationHash,
      contractAddress,
      ...(entrypoint ? { entrypoint } : {}),
      status: "applied",
      explorerUrl: `https://shadownet.tzkt.io/${receipt.operationHash}`,
    };
  });
  const tokens = tokenPinEvidence.map((token) => ({
    id: `rotini-${token.mode}-token-${token.tokenId}`,
    contractAddress,
    tokenId: String(token.tokenId),
    explorerUrl: `https://shadownet.tzkt.io/${contractAddress}/tokens/${token.tokenId}`,
    metadataArtifactId: artifactIdForPin(writtenPins, token.metadata),
    mediaArtifactId: artifactIdForPin(writtenPins, token.artifact),
    metadataUri: token.metadataUri,
    artifactUri: token.artifactUri,
  }));
  const completedAt = new Date().toISOString();
  const receipt = {
    schema: "pastaprotocol-rotini-ui-live-run@1",
    classification: "UI-LIVE",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    startedAt,
    completedAt,
    actors: {
      creator: creator.address,
      collector: collector.address,
      independent: creator.address !== collector.address,
    },
    funding: {
      creator: creatorSession.getFundingAuthorization(),
      collector: collectorSession.getFundingAuthorization(),
    },
    contract: {
      address: contractAddress,
      explorerUrl: `https://shadownet.tzkt.io/${contractAddress}`,
    },
    projects: OUTPUTS.map((output, projectId) => ({
      projectId,
      outputMode: output.mode,
      mimeType: output.mimeType,
      priceMutez: output.priceMutez,
      maxSupply: MAX_SUPPLY,
      minted: 1,
      reserved: 0,
      remainingReservable: MAX_SUPPLY - 1,
      ravioliPackCompatible: projectId === 0,
    })),
    tokens,
    operations,
    bridgeReceipts: { creator: creatorReceipts, collector: collectorReceipts },
    pins: writtenPins,
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    screenshotSidecars: screenshots.map((capture) => capture.manifestSidecarArtifact),
    tzktEvidence: { path: tzktRelativePath, sha256: sha256(tzktBytes) },
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptRelativePath = "artifacts/rotini-ui-live-run.json";
  const receiptPath = path.join(appRoot, receiptRelativePath);
  await writeFile(receiptPath, receiptBytes);

  const localArtifacts = [
    ...screenshots.map((capture) => capture.manifestSidecarArtifact),
    { id: "rotini-ui-live-run", kind: "proof-receipt", path: receiptRelativePath, sha256: sha256(receiptBytes) },
    { id: "rotini-ui-live-tzkt-index", kind: "indexer-evidence", path: tzktRelativePath, sha256: sha256(tzktBytes) },
  ];
  const allArtifacts = [...writtenPins.map(({ fileName: _fileName, actor: _actor, ...artifact }) => artifact), ...localArtifacts];
  const allScreenshotIds = screenshots.map((capture) => capture.manifestScreenshot.stage);
  const allArtifactIds = allArtifacts.map((artifact) => artifact.id);
  const allOperationHashes = operations.map((operation) => operation.hash);
  const allTokenIds = tokens.map((token) => token.id);
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "rotini",
    role: "token-publisher",
    runId,
    capturedAt: completedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    artifacts: allArtifacts,
    contracts: [{
      address: contractAddress,
      kind: "generative-collection",
      explorerUrl: `https://shadownet.tzkt.io/${contractAddress}`,
    }],
    operations,
    tokens,
    roleEvidence: [],
    capabilities: [
      {
        id: "publish-png-gif-zip-generators",
        description: "Use the actual Rotini studio to pin generator inputs, originate one fresh collection, and publish PNG, animated GIF, and offline interactive ZIP projects; PNG project 0 remains free with two unreserved iterations for Ravioli generated-at-open packs.",
        evidence: {
          screenshots: allScreenshotIds.slice(0, 5),
          artifacts: allArtifactIds.filter((id) => writtenPins.some((artifact) => artifact.id === id && artifact.actor === "creator")),
          contracts: [contractAddress],
          operations: allOperationHashes.slice(0, 4),
          tokens: [],
          roleEvidence: [],
          urls: [
            `https://shadownet.tzkt.io/${contractAddress}`,
            ...writtenPins.filter((artifact) => artifact.actor === "creator").map((artifact) => artifact.gatewayUrl),
          ],
        },
      },
      {
        id: "reserve-render-pin-finalize-tokens",
        description: "Use an independent collector signer through the actual Rotini public mint UI to reserve immutable seeds, render and pin every supported output, and finalize three FA2 tokens.",
        evidence: {
          screenshots: allScreenshotIds.slice(5),
          artifacts: [
            ...allArtifactIds.filter((id) => writtenPins.some((artifact) => artifact.id === id && artifact.actor === "collector")),
            ...localArtifacts.map((artifact) => artifact.id),
          ],
          contracts: [contractAddress],
          operations: allOperationHashes.slice(4),
          tokens: allTokenIds,
          roleEvidence: [],
          urls: [
            ...tokens.map((token) => token.explorerUrl),
            ...writtenPins.filter((artifact) => artifact.actor === "collector").map((artifact) => artifact.gatewayUrl),
          ],
        },
      },
    ],
  };
  const manifestPath = path.join(appRoot, "manifest.json");
  await writeFile(manifestPath, deterministicJsonBytes(manifest));
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    classification: "UI-LIVE",
    contractAddress,
    operationHashes: allOperationHashes,
    tokenIds: tokenPinEvidence.map((token) => token.tokenId),
    manifestPath,
    receiptPath,
    receiptSha256: sha256(receiptBytes),
  }, null, 2)}\n`);
  return {
    manifestPath,
    receiptPath,
    contractAddress,
    operationHashes: allOperationHashes,
    tokenIds: tokenPinEvidence.map((token) => token.tokenId),
    screenshots,
  };
}

async function main(): Promise<void> {
  try {
    await runRotiniUiLive();
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
