#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

import { MichelsonMap } from "@taquito/taquito";
import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  buildPastaUiLiveProxyInstallerSource,
  hashJsonForBridge,
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveAppliedOperationAssertion,
  type PastaUiLivePinProof,
  type PastaUiLivePublicReceipt,
} from "./pasta-ui-live-bridge-kit";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  verifyScreenshotSidecar,
  type CapturePastaProofStageResult,
} from "./pasta-proof-screenshot-kit";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import {
  hashPastaProofRestartProjectedValue,
  PastaProofRestartJournal,
  type PastaProofRestartActor,
  type PastaProofRestartStep,
} from "./pasta-proof-restart-journal";
import {
  assertPastaProofRestartCounterBoundary,
  assertPastaProofRestartOrigination,
  assertPastaProofRestartTransaction,
  authenticatePastaProofRestartInitialCounters,
  capturePastaProofRestartInitialCounters,
  readPastaProofRestartActorState,
  reconcilePastaProofRestartOperation,
  reconcilePastaProofRestartPin,
  type PastaProofRestartPendingOperation,
} from "./pasta-proof-restart-chain";
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

const EXECUTE_FLAG = "PASTA_SHADOWNET_SPAGHETTI_UI_LIVE_EXECUTE";
const RECAPTURE_FLAG = "PASTA_SHADOWNET_SPAGHETTI_UI_LIVE_RECAPTURE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const OPERATION_RESERVE_MUTEZ = 1_000_000;
const COLLECTOR_OPERATION_RESERVE_MUTEZ = 500_000;
const TOKEN_PRICE_MUTEZ = 1_000;
const TOKEN_EDITIONS = 2;
const TOKEN_SALE_COUNT = 1;
const HANDOFF_KEY = "wtfos.pasta.handoff.v1:spaghetti-ui-live-proof";
const RESTART_CHECKPOINT_PATH = "artifacts/spaghetti-restart-checkpoint.json";
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const CONTRACT_ARTIFACT_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "spaghetti",
  "contract",
  "pasta-standard-collection.contract.json",
);
const STATIC_ROOT = path.join(root, "public");

const COMPLETED_CREATOR_CAPTURE_STAGES = Object.freeze([
  "001-configure-collection-and-token-configured",
  "002-connect-creator-signer-connected",
  "003-pin-collection-metadata-metadata-pinned",
  "004-originate-standard-collection-contract-originated",
  "005-create-token-type-token-created",
  "006-mint-creator-editions-minted",
  "007-open-direct-primary-sale-sale-opened",
  "008-complete-publishing-lifecycle-complete",
]);

const COMPLETED_COLLECTOR_CAPTURE_SPECS = Object.freeze([
  {
    ordinal: 9,
    capability: "load self-hosted primary sale",
    stageName: "primary sale loaded",
    stage: "009-load-self-hosted-primary-sale-primary-sale-loaded",
  },
  {
    ordinal: 10,
    capability: "connect independent collector",
    stageName: "collector connected",
    stage: "010-connect-independent-collector-collector-connected",
  },
  {
    ordinal: 11,
    capability: "buy from creator primary sale",
    stageName: "collector purchase confirmed",
    stage: "011-buy-from-creator-primary-sale-collector-purchase-confirmed",
  },
]);

export const SPAGHETTI_RESTART_PLAN: readonly PastaProofRestartStep[] = Object.freeze([
  { id: "media", actor: "creator", kind: "pin", fileName: "spaghetti-ui-live-proof.png", transport: "direct" },
  { id: "collection-metadata", actor: "creator", kind: "pin", fileName: "collection.json", transport: "bridge" },
  { id: "originate", actor: "creator", kind: "operation", action: "originate", transport: "bridge" },
  { id: "token-metadata", actor: "creator", kind: "pin", fileName: "token.json", transport: "bridge" },
  { id: "create-token", actor: "creator", kind: "operation", action: "batch", entrypoints: ["create_token"], transport: "bridge" },
  { id: "mint-editions", actor: "creator", kind: "operation", action: "batch", entrypoints: ["mint"], transport: "bridge" },
  { id: "open-sale", actor: "creator", kind: "operation", action: "batch", entrypoints: ["set_sale"], transport: "bridge" },
  { id: "collector-buy", actor: "collector", kind: "operation", action: "call", entrypoint: "buy", transport: "bridge" },
]);
const SPAGHETTI_CREATOR_BRIDGE_EFFECT_COUNT = SPAGHETTI_RESTART_PLAN.filter(
  (step) => step.actor === "creator" && step.transport === "bridge",
).length;

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

function pngChunk(name: string, data: Uint8Array): Buffer {
  const type = Buffer.from(name, "ascii");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([header, type, data, checksum]);
}

function proofPng(seed: string): Buffer {
  const width = 64;
  const height = 64;
  const seedBytes = createHash("sha256").update(seed).digest();
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[offset++] = (seedBytes[0] + x * 5 + y * 3) & 255;
      raw[offset++] = (seedBytes[1] + x * y + y * 9) & 255;
      raw[offset++] = (seedBytes[2] + x * 11 + y * 7) & 255;
      raw[offset++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

const PROOF_ARTIFACT_BYTES = proofPng("spaghetti-ui-live-shadownet-proof");

type PinnedMetadataRecord = {
  value: unknown;
  proof: PastaUiLivePinProof;
};

type WrittenPinnedArtifact = {
  id: string;
  kind: string;
  path: string;
  sha256: string;
  ipfsUri: string;
  gatewayUrl: string;
  retrievedSha256: string;
};

type SpaghettiUiLiveResult = {
  manifestPath: string;
  receiptPath: string;
  contractAddress: string;
  operationHashes: string[];
  screenshots: CapturePastaProofStageResult[];
};

export function assertSpaghettiUiLiveExecutionAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[EXECUTE_FLAG] !== "1") {
    block("explicit Spaghetti UI-live execute flag is required", [
      `\`${EXECUTE_FLAG}=1\` is required because this browser lane pins durable metadata, originates a real Shadownet contract, and signs create/mint/sale operations.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Spaghetti UI-live runner only permits Shadownet", [
      "Unset `TEZOS_NETWORK` or set it to `shadownet`; mainnet execution is refused.",
    ]);
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [
      `Set \`${OUTPUT_ENV}\` to the existing aggregate proof-run root before executing this lane.`,
    ]);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function requireFreshAppOutputDirectory(
  runRoot: string,
): Promise<{ appRoot: string; runId: string; existing: boolean; recapture: boolean }> {
  const recaptureRequested = process.env[RECAPTURE_FLAG] === "1";
  const absoluteRunRoot = path.resolve(runRoot);
  let runRootStat;
  try {
    runRootStat = await stat(absoluteRunRoot);
  } catch (error) {
    block("Pasta proof run directory does not exist", [
      `Create the aggregate proof-run root \`${absoluteRunRoot}\` before executing Spaghetti.`,
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
  const appRoot = path.join(absoluteRunRoot, "spaghetti");
  try {
    const info = await lstat(appRoot);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      block("Spaghetti proof output path is not a regular directory", [`Refusing \`${appRoot}\`.`]);
    }
    let manifestExists = false;
    try {
      await lstat(path.join(appRoot, "manifest.json"));
      manifestExists = true;
      if (!recaptureRequested) {
        block("Spaghetti proof is already complete", [
          `A final manifest already exists at \`${path.join(appRoot, "manifest.json")}\`.`,
        ]);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await lstat(path.join(appRoot, RESTART_CHECKPOINT_PATH));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        block("Spaghetti output exists without a restart checkpoint", [
          `Refusing unauthenticated partial output at \`${appRoot}\`.`,
        ]);
      }
      throw error;
    }
    if (recaptureRequested && !manifestExists) {
      block("Spaghetti completed-proof recapture requires a final manifest", [
        `No completed manifest exists at \`${path.join(appRoot, "manifest.json")}\`.`,
      ]);
    }
    return { appRoot, runId, existing: true, recapture: recaptureRequested };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (recaptureRequested) {
    block("Spaghetti completed-proof recapture requires an existing proof", [
      `No authenticated Spaghetti proof exists at \`${appRoot}\`.`,
    ]);
  }
  return { appRoot, runId, existing: false, recapture: false };
}

export function createSpaghettiCreatorCaptureGate(): {
  wait(action: string): Promise<void>;
  allowThrough(effectOrdinal: number): void;
  releaseAll(): void;
} {
  let observedEffects = 0;
  let allowedThrough = 1;
  let released = false;
  const pending = new Map<number, () => void>();
  return {
    wait(action) {
      if (!isSpaghettiEffectAction(action)) return Promise.resolve();
      observedEffects += 1;
      assert.ok(
        observedEffects <= SPAGHETTI_CREATOR_BRIDGE_EFFECT_COUNT,
        `Spaghetti creator bridge effect count drifted beyond ${SPAGHETTI_CREATOR_BRIDGE_EFFECT_COUNT}`,
      );
      if (released || observedEffects <= allowedThrough) return Promise.resolve();
      return new Promise<void>((resolve) => pending.set(observedEffects, resolve));
    },
    allowThrough(effectOrdinal) {
      assert.ok(
        Number.isSafeInteger(effectOrdinal) && effectOrdinal >= allowedThrough &&
          effectOrdinal <= SPAGHETTI_CREATOR_BRIDGE_EFFECT_COUNT,
        `Spaghetti capture gate ordinal must be between ${allowedThrough} and ${SPAGHETTI_CREATOR_BRIDGE_EFFECT_COUNT}`,
      );
      allowedThrough = effectOrdinal;
      for (const [ordinal, resolve] of pending) {
        if (ordinal <= allowedThrough) {
          pending.delete(ordinal);
          resolve();
        }
      }
    },
    releaseAll() {
      released = true;
      for (const resolve of pending.values()) resolve();
      pending.clear();
    },
  };
}

function isSpaghettiEffectAction(action: string): boolean {
  return action === "pin_json" || action === "pin_blob" || action === "originate" || action === "call" || action === "batch";
}

export async function loadSpaghettiCompletedCollectorCaptures(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  const manifestPath = path.join(appRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    screenshots?: unknown;
    artifacts?: unknown;
  };
  const receipt = JSON.parse(
    await readFile(path.join(appRoot, "artifacts", "spaghetti-ui-live-run.json"), "utf8"),
  ) as { screenshots?: unknown; screenshotSidecars?: unknown };
  assert.ok(Array.isArray(manifest.screenshots), "completed Spaghetti manifest screenshots are missing");
  assert.ok(Array.isArray(manifest.artifacts), "completed Spaghetti manifest artifacts are missing");
  assert.ok(Array.isArray(receipt.screenshots), "completed Spaghetti receipt screenshots are missing");
  assert.ok(Array.isArray(receipt.screenshotSidecars), "completed Spaghetti receipt sidecars are missing");

  return Promise.all(COMPLETED_COLLECTOR_CAPTURE_SPECS.map(async (spec) => {
    const screenshotMatches = manifest.screenshots!.filter((entry) =>
      entry && typeof entry === "object" && (entry as { stage?: unknown }).stage === spec.stage);
    assert.equal(screenshotMatches.length, 1, `completed Spaghetti manifest must contain one ${spec.stage} screenshot`);
    const manifestScreenshot = screenshotMatches[0] as {
      stage: string;
      path: string;
      sha256: string;
      caption: string;
    };
    const expectedPngRelativePath = `screenshots/${spec.stage}.png`;
    assert.equal(manifestScreenshot.path, expectedPngRelativePath, `${spec.stage} screenshot path drift`);
    assert.match(manifestScreenshot.sha256, /^[a-f0-9]{64}$/, `${spec.stage} screenshot hash is invalid`);
    assert.equal(typeof manifestScreenshot.caption, "string", `${spec.stage} screenshot caption is missing`);
    const receiptScreenshotMatches = receipt.screenshots!.filter((entry) =>
      entry && typeof entry === "object" && (entry as { stage?: unknown }).stage === spec.stage);
    assert.equal(receiptScreenshotMatches.length, 1, `completed Spaghetti receipt must contain one ${spec.stage} screenshot`);
    assert.deepEqual(receiptScreenshotMatches[0], manifestScreenshot, `${spec.stage} receipt/manifest screenshot drift`);

    const sidecarId = `screenshot-sidecar-${spec.stage}`;
    const sidecarMatches = manifest.artifacts!.filter((entry) =>
      entry && typeof entry === "object" && (entry as { id?: unknown }).id === sidecarId);
    assert.equal(sidecarMatches.length, 1, `completed Spaghetti manifest must contain one ${sidecarId} artifact`);
    const manifestSidecarArtifact = sidecarMatches[0] as {
      id: string;
      kind: "screenshot-sidecar";
      path: string;
      sha256: string;
    };
    const expectedSidecarRelativePath = `artifacts/screenshot-${spec.stage}.json`;
    assert.equal(manifestSidecarArtifact.kind, "screenshot-sidecar", `${sidecarId} kind drift`);
    assert.equal(manifestSidecarArtifact.path, expectedSidecarRelativePath, `${sidecarId} path drift`);
    assert.match(manifestSidecarArtifact.sha256, /^[a-f0-9]{64}$/, `${sidecarId} hash is invalid`);
    const receiptSidecarMatches = receipt.screenshotSidecars!.filter((entry) =>
      entry && typeof entry === "object" && (entry as { id?: unknown }).id === sidecarId);
    assert.equal(receiptSidecarMatches.length, 1, `completed Spaghetti receipt must contain one ${sidecarId} artifact`);
    assert.deepEqual(receiptSidecarMatches[0], manifestSidecarArtifact, `${sidecarId} receipt/manifest drift`);

    const pngPath = path.join(appRoot, manifestScreenshot.path);
    const sidecarPath = path.join(appRoot, manifestSidecarArtifact.path);
    const sidecar = await verifyScreenshotSidecar(pngPath, sidecarPath);
    const [pngBytes, sidecarBytes] = await Promise.all([readFile(pngPath), readFile(sidecarPath)]);
    assert.equal(sha256(pngBytes), manifestScreenshot.sha256, `${spec.stage} manifest screenshot hash drift`);
    assert.equal(sha256(sidecarBytes), manifestSidecarArtifact.sha256, `${sidecarId} manifest artifact hash drift`);
    assert.equal(sidecar.app, "spaghetti", `${spec.stage} sidecar app drift`);
    assert.equal(sidecar.classification, "UI-LIVE", `${spec.stage} sidecar classification drift`);
    assert.equal(sidecar.stageOrdinal, spec.ordinal, `${spec.stage} sidecar ordinal drift`);
    assert.equal(sidecar.capability, spec.capability, `${spec.stage} sidecar capability drift`);
    assert.equal(sidecar.stageName, spec.stageName, `${spec.stage} sidecar stage-name drift`);

    return {
      appDirectory: appRoot,
      pngPath,
      sidecarPath,
      pngRelativePath: manifestScreenshot.path,
      sidecarRelativePath: manifestSidecarArtifact.path,
      filenameStem: spec.stage,
      sidecar,
      manifestScreenshot,
      manifestSidecarArtifact,
    };
  }));
}

async function readContractArtifact(): Promise<unknown[]> {
  const code = JSON.parse(await readFile(CONTRACT_ARTIFACT_PATH, "utf8"));
  assert.ok(Array.isArray(code), "Spaghetti contract artifact must be a Michelson JSON array");
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
    sales: new MichelsonMap(),
    minters: new MichelsonMap(),
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
  signerAddress: string,
): void {
  assert.equal(hashJsonForBridge(input.code), expectedCodeHash, "browser requested an unexpected contract artifact");
  assert.ok(input.storage && typeof input.storage === "object" && !Array.isArray(input.storage));
  const storage = input.storage as Record<string, unknown>;
  assert.equal(storage.administrator, signerAddress);
  assert.equal(storage.pending_administrator, null);
  assert.equal(storage.next_token_id, 0);
  assert.ok(storage.metadata instanceof MichelsonMap);
  assert.equal([...storage.metadata.entries()].length, 1);
  for (const key of ["ledger", "operators", "token_metadata", "total_supply", "sales", "minters"]) {
    assertEmptyMichelsonMap(storage[key], key);
  }
}

function validateBrowserCall(
  input: { contractAddress: string; entrypoint: string; payload: unknown },
  signerAddress: string,
): void {
  if (input.entrypoint === "create_token") {
    assert.ok(input.payload instanceof MichelsonMap, "create_token payload must be a MichelsonMap");
    assert.equal([...input.payload.entries()].length, 1, "create_token must contain one metadata URI");
    return;
  }
  assert.ok(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
  const payload = input.payload as Record<string, any>;
  if (input.entrypoint === "mint") {
    assert.equal(payload.to_, signerAddress);
    assert.equal(Number(payload.token_id), 0);
    assert.equal(Number(payload.amount), TOKEN_EDITIONS);
    return;
  }
  if (input.entrypoint === "set_sale") {
    assert.equal(Number(payload.token_id), 0);
    assert.equal(payload.sale?.active, true);
    assert.equal(payload.sale?.seller, signerAddress);
    assert.equal(payload.sale?.treasury, signerAddress);
    assert.equal(Number(payload.sale?.price), TOKEN_PRICE_MUTEZ);
    assert.equal(Number(payload.sale?.remaining), TOKEN_SALE_COUNT);
    assert.equal(payload.sale?.start, null);
    assert.equal(payload.sale?.end, null);
    return;
  }
  assert.fail(`unexpected Spaghetti UI-live entrypoint ${input.entrypoint}`);
}

function validateCollectorCall(
  input: { contractAddress: string; entrypoint: string; payload: unknown },
): void {
  assert.equal(input.entrypoint, "buy", "collector browser may only invoke buy");
  assert.ok(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
  const payload = input.payload as Record<string, unknown>;
  assert.equal(Number(payload.token_id), 0);
  assert.equal(Number(payload.amount), 1);
}

function buildCheasePackage(artifactUri: string, runId: string) {
  return {
    schemaVersion: "wtfos.pasta.chease-package.v1",
    kind: "collection",
    targetApp: "spaghetti",
    title: "Spaghetti UI-LIVE Shadownet Proof",
    description: "Actual Spaghetti studio controls backed by a Node-only platform-keyring signer.",
    symbol: "SPGUI",
    relationship: {
      collection_group: `spaghetti-ui-live-${runId}`,
    },
    items: [
      {
        name: "UI-LIVE Proof Token",
        description: "Created, minted, and listed through the real Spaghetti browser studio.",
        artifactUri,
        mimeType: "image/png",
        tags: ["spaghetti", "ui-live", "shadownet"],
      },
    ],
  };
}

export async function waitForSpaghettiLog(
  page: Page,
  expected: string,
  timeout = 300_000,
): Promise<void> {
  await page.locator("#log").waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    (text) => {
      const log = document.getElementById("log")?.textContent || "";
      return log.includes(text) || log.includes("publish failed:");
    },
    expected,
    { timeout },
  );
  const log = (await page.locator("#log").textContent()) || "";
  if (log.includes("publish failed:")) {
    const failure = log.slice(log.lastIndexOf("publish failed:")).slice(0, 2_000);
    throw new Error(`actual Spaghetti Studio ${failure}`);
  }
  assert.ok(log.includes(expected), `Spaghetti Studio log is missing ${expected}`);
}

export async function waitForSpaghettiCollectorWrite(
  page: Page,
  expectedStatus: string,
  expectedChainState: string,
  timeout = 120_000,
): Promise<void> {
  await page.locator("#status").waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    ({ expectedStatus, expectedChainState }) => {
      const status = document.getElementById("status");
      return status?.dataset.error === "true" ||
        (
          status?.textContent === expectedStatus &&
          document.getElementById("chainState")?.textContent === expectedChainState
        );
    },
    { expectedStatus, expectedChainState },
    { timeout },
  );
  const status = page.locator("#status");
  const statusText = (await status.textContent()) || "";
  if (await status.getAttribute("data-error") === "true") {
    throw new Error(`actual Spaghetti collector write failed: ${statusText.slice(0, 2_000)}`);
  }
  assert.equal(statusText, expectedStatus, "Spaghetti collector confirmation status drift");
  assert.equal(
    (await page.locator("#chainState").textContent()) || "",
    expectedChainState,
    "Spaghetti collector terminal chain state drift",
  );
}

export async function focusSpaghettiCompletionNotice(page: Page): Promise<void> {
  const notice = page.locator("#ppNotice");
  await notice.waitFor({ state: "visible", timeout: 30_000 });
  await notice.evaluate((element) => {
    const target = element as HTMLElement;
    target.setAttribute("tabindex", "-1");
    target.scrollIntoView({ block: "center", inline: "nearest" });
    target.focus({ preventScroll: true });
  });
  await page.waitForFunction(() => {
    const element = document.getElementById("ppNotice");
    if (!element || document.activeElement !== element) return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  });
}

async function configureActualStudio(page: Page, kuboApiUrl: string): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", kuboApiUrl);
  await page.fill("#collName", "Spaghetti UI-LIVE Shadownet Proof");
  await page.fill("#collSymbol", "SPGUI");
  await page.fill("#collDesc", "Actual Spaghetti UI controls with a server-side Shadownet signer bridge.");
  await page.locator(".t-name").first().fill("UI-LIVE Proof Token");
  await page.locator(".t-desc").first().fill("Created, minted, and listed through the real Spaghetti browser studio.");
  await page.locator(".t-editions").first().fill(String(TOKEN_EDITIONS));
  await page.locator(".t-for-sale").first().check();
  await page.locator(".t-price").first().fill(String(TOKEN_PRICE_MUTEZ / 1_000_000));
  await page.locator(".t-sale-count").first().fill(String(TOKEN_SALE_COUNT));
  await page.locator(".t-tags").first().fill("spaghetti, ui-live, shadownet");
}

async function captureStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  capability: string,
  stageName: string,
  expectedLog: string,
  extraEvidence: { selector: string; name: string; expectedText: string | RegExp }[] = [],
): Promise<CapturePastaProofStageResult> {
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "spaghetti",
    capability,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "h1", name: "application", expectedText: "Spaghetti" },
      { selector: "#log", name: "stage log", expectedText: expectedLog },
      ...extraEvidence,
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function captureCollectorStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  capability: string,
  stageName: string,
  expectedStatus: string | RegExp,
  expectedChainState: string | RegExp,
): Promise<CapturePastaProofStageResult> {
  await page.locator(".action").scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "spaghetti",
    capability,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "#appLabel", name: "application", expectedText: "Spaghetti · Pasta Protocol" },
      { selector: "#status", name: "collector status", expectedText: expectedStatus },
      { selector: "#chainState", name: "on-chain sale state", expectedText: expectedChainState },
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function openBrowser(): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
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

function assertReceiptIdentifiers(receipts: PastaUiLivePublicReceipt[]): {
  contractAddress: string;
  operationHashes: string[];
  operationReceipts: Array<PastaUiLivePublicReceipt & { operationHash: string }>;
} {
  const origination = receipts.find((receipt) => receipt.action === "originate");
  assert.ok(origination?.contractAddress, "origination receipt is missing the contract address");
  assert.equal(validateContractAddress(origination.contractAddress), ValidationResult.VALID);
  const operationReceipts = receipts.filter(
    (receipt): receipt is PastaUiLivePublicReceipt & { operationHash: string } =>
      typeof receipt.operationHash === "string",
  );
  assert.equal(operationReceipts.length, 4, "expected origination plus create/mint/sale operation receipts");
  for (const receipt of operationReceipts) {
    assert.equal(validateOperation(receipt.operationHash || ""), ValidationResult.VALID);
  }
  assert.deepEqual(
    operationReceipts.filter((receipt) => receipt.action === "batch").map((receipt) => receipt.entrypoints),
    [["create_token"], ["mint"], ["set_sale"]],
  );
  return {
    contractAddress: origination.contractAddress,
    operationHashes: operationReceipts.map((receipt) => receipt.operationHash),
    operationReceipts,
  };
}

async function writePinnedMetadataArtifacts(
  appRoot: string,
  records: PinnedMetadataRecord[],
): Promise<WrittenPinnedArtifact[]> {
  const output: WrittenPinnedArtifact[] = [];
  const expected = new Map([
    ["collection.json", { id: "spaghetti-collection-metadata", kind: "collection-metadata", label: "collection" }],
    ["token.json", { id: "spaghetti-token-0-metadata", kind: "token-metadata", label: "token-0" }],
  ]);
  assert.equal(records.length, expected.size, "Spaghetti must pin exactly one collection and one token metadata object");
  for (const record of records) {
    const identity = expected.get(record.proof.fileName);
    assert.ok(identity, `unexpected Spaghetti metadata pin ${record.proof.fileName}`);
    assert.equal(record.proof.publicGatewayVerified, true, `${record.proof.fileName} lacks public-gateway verification`);
    const { id, kind, label } = identity;
    const relativePath = `artifacts/spaghetti-ui-live-${label}-metadata.json`;
    const bytes = deterministicJsonBytes(record.value);
    assert.equal(sha256(bytes), record.proof.sha256, `${label} pinned bytes differ from browser metadata bytes`);
    await writeFile(path.join(appRoot, relativePath), bytes);
    output.push({
      id,
      kind,
      path: relativePath,
      sha256: record.proof.sha256,
      ipfsUri: record.proof.uri,
      gatewayUrl: record.proof.publicGatewayUrl,
      retrievedSha256: record.proof.sha256,
    });
    expected.delete(record.proof.fileName);
  }
  assert.equal(expected.size, 0, "Spaghetti metadata pin set is incomplete");
  return output;
}

type SpaghettiTzktOperationRow = {
  type?: unknown;
  status?: unknown;
  hash?: unknown;
  sender?: { address?: unknown };
  target?: { address?: unknown };
  originatedContract?: { address?: unknown };
  parameter?: { entrypoint?: unknown; value?: unknown };
  counter?: unknown;
  amount?: unknown;
  storage?: unknown;
  level?: unknown;
  timestamp?: unknown;
};

function projectedRecord(value: unknown, label: string): Record<string, any> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, any>;
}

function projectedMapEntries(value: unknown, label: string): unknown[][] {
  const record = projectedRecord(value, label);
  assert.ok(Array.isArray(record.__map), `${label} must be a projected Michelson map`);
  return record.__map;
}

async function assertSpaghettiRestartApplied(input: {
  row: unknown;
  pending: PastaProofRestartPendingOperation;
  signerAddress: string;
  tezos: ReturnType<typeof buildToolkit>;
  expectedCodeHash: string;
  expectedProjectedCodeHash: string;
  expectedCanonicalCodeHash: string;
}): Promise<{ contractAddress: string; entrypoints: string[] }> {
  if (input.pending.step.action !== "originate") {
    return assertPastaProofRestartTransaction(input);
  }
  const resolved = assertPastaProofRestartOrigination(input);
  const descriptor = projectedRecord(input.pending.descriptor, "Spaghetti restart origination descriptor");
  assert.equal(
    hashPastaProofRestartProjectedValue(descriptor.code),
    input.expectedProjectedCodeHash,
    "Spaghetti restart artifact identity differs",
  );
  const requestedStorage = projectedRecord(descriptor.storage, "Spaghetti restart origination storage");
  assert.equal(requestedStorage.administrator, input.signerAddress);
  assert.equal(requestedStorage.pending_administrator, null);
  assert.equal(Number(requestedStorage.next_token_id), 0);
  const metadataEntries = projectedMapEntries(requestedStorage.metadata, "Spaghetti restart metadata");
  assert.equal(metadataEntries.length, 1);
  assert.equal(metadataEntries[0][0], "");
  const expectedMetadataHex = String(metadataEntries[0][1]);
  for (const key of ["ledger", "operators", "token_metadata", "total_supply", "sales", "minters"]) {
    assert.deepEqual(projectedMapEntries(requestedStorage[key], `Spaghetti restart ${key}`), []);
  }
  const rowStorage = projectedRecord((input.row as SpaghettiTzktOperationRow).storage, "Spaghetti indexed origination storage");
  assert.equal(rowStorage.administrator, input.signerAddress);
  assert.equal(rowStorage.pending_administrator, null);
  assert.equal(Number(rowStorage.next_token_id), 0);
  const script = await input.tezos.rpc.getScript(resolved.contractAddress);
  assert.equal(
    hashMichelsonScriptCode(script.code),
    input.expectedCanonicalCodeHash,
    "Spaghetti recovered on-chain code differs",
  );
  const contract = await input.tezos.contract.at(resolved.contractAddress);
  const storage = await contract.storage() as { metadata: { get(key: string): Promise<unknown> } };
  assert.equal(await storage.metadata.get(""), expectedMetadataHex, "Spaghetti recovered collection metadata URI differs");
  return resolved;
}

function spaghettiTzktOperationRows(value: unknown): SpaghettiTzktOperationRow[] {
  const rows = Array.isArray(value) ? value : [value];
  assert.ok(
    rows.length > 0 && rows.every((row) => row && typeof row === "object" && !Array.isArray(row)),
    "TzKT operation response must contain operation objects",
  );
  return rows as SpaghettiTzktOperationRow[];
}

export function assertSpaghettiTzktOperationApplied(input: {
  rows: unknown;
  assertion: PastaUiLiveAppliedOperationAssertion;
  signerAddress: string;
}): SpaghettiTzktOperationRow {
  assert.equal(
    validateOperation(input.assertion.operationHash),
    ValidationResult.VALID,
    "Spaghetti operation hash is invalid",
  );
  assert.equal(
    validateAddress(input.signerAddress),
    ValidationResult.VALID,
    "Spaghetti operation signer is invalid",
  );
  assert.equal(
    validateContractAddress(input.assertion.contractAddress || ""),
    ValidationResult.VALID,
    "Spaghetti operation contract address is invalid",
  );
  if (input.assertion.action === "originate") {
    assert.deepEqual(input.assertion.entrypoints, [], "Spaghetti origination cannot claim entrypoints");
  } else {
    assert.equal(
      input.assertion.entrypoints.length,
      1,
      "Spaghetti transaction must claim exactly one entrypoint",
    );
    assert.match(
      input.assertion.entrypoints[0],
      /^(?:create_token|mint|set_sale|buy)$/,
      "Spaghetti transaction claimed an unsupported entrypoint",
    );
  }

  const signerRows = spaghettiTzktOperationRows(input.rows).filter((row) =>
    row.hash === input.assertion.operationHash &&
    row.sender?.address === input.signerAddress
  );
  assert.equal(
    signerRows.length,
    1,
    "TzKT must expose exactly one Spaghetti operation for the exact hash and signer",
  );
  const operation = signerRows[0];
  assert.equal(operation.status, "applied", "Spaghetti operation is not applied");
  assert.ok(
    Number.isSafeInteger(Number(operation.level)) && Number(operation.level) > 0,
    "Spaghetti operation level is invalid",
  );
  assert.ok(
    typeof operation.timestamp === "string" &&
      /^\d{4}-\d{2}-\d{2}T/.test(operation.timestamp) &&
      Number.isFinite(Date.parse(operation.timestamp)),
    "Spaghetti operation timestamp is invalid",
  );

  if (input.assertion.action === "originate") {
    assert.equal(operation.type, "origination", "Spaghetti origination action differs from TzKT");
    assert.equal(
      operation.originatedContract?.address,
      input.assertion.contractAddress,
      "Spaghetti originated address differs from TzKT",
    );
  } else {
    assert.equal(operation.type, "transaction", "Spaghetti transaction action differs from TzKT");
    assert.equal(
      operation.target?.address,
      input.assertion.contractAddress,
      "Spaghetti transaction target differs from TzKT",
    );
    assert.equal(
      operation.parameter?.entrypoint,
      input.assertion.entrypoints[0],
      "Spaghetti transaction entrypoint differs from TzKT",
    );
  }
  return operation;
}

async function verifySpaghettiTzktOperationApplied(input: {
  assertion: PastaUiLiveAppliedOperationAssertion;
  signerAddress: string;
}): Promise<void> {
  const endpoint = input.assertion.action === "originate" ? "originations" : "transactions";
  const url = `${normalizeBase(SHADOWNET_TZKT_API)}/operations/${endpoint}/${encodeURIComponent(input.assertion.operationHash)}`;
  const rows = await pollJson(
    `Spaghetti exact-hash ${input.assertion.action} finality`,
    url,
    (value) => {
      try {
        assertSpaghettiTzktOperationApplied({ rows: value, ...input });
        return true;
      } catch {
        return false;
      }
    },
  );
  assertSpaghettiTzktOperationApplied({ rows, ...input });
}

async function prepareSpaghettiRestartJournal(input: {
  appRoot: string;
  runId: string;
  existing: boolean;
  creatorAddress: string;
  collectorAddress: string;
  tezos: ReturnType<typeof buildToolkit>;
  collectorTezos: ReturnType<typeof buildToolkit>;
  code: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<PastaProofRestartJournal> {
  const actors = { creator: input.creatorAddress, collector: input.collectorAddress } as const;
  const expectedCodeHash = hashJsonForBridge(input.code);
  const expectedProjectedCodeHash = hashPastaProofRestartProjectedValue(input.code);
  const expectedCanonicalCodeHash = hashMichelsonScriptCode(input.code);
  const intent = {
    contractArtifactPath: path.relative(root, CONTRACT_ARTIFACT_PATH),
    contractArtifactSha256: expectedCodeHash,
    mediaSha256: sha256(PROOF_ARTIFACT_BYTES),
    mediaByteLength: PROOF_ARTIFACT_BYTES.byteLength,
    relationshipGroup: `spaghetti-ui-live-${input.runId}`,
    product: {
      editions: TOKEN_EDITIONS,
      saleCount: TOKEN_SALE_COUNT,
      priceMutez: TOKEN_PRICE_MUTEZ,
    },
  };
  const checkpointPath = path.join(input.appRoot, RESTART_CHECKPOINT_PATH);
  const journal = input.existing
    ? await PastaProofRestartJournal.open(checkpointPath, {
        app: "spaghetti",
        runId: input.runId,
        actors,
        plan: SPAGHETTI_RESTART_PLAN,
        intent,
        authenticateInitialCounters: (counters) => authenticatePastaProofRestartInitialCounters({
          counters,
          actors,
          plan: SPAGHETTI_RESTART_PLAN,
        }),
      })
    : await PastaProofRestartJournal.create({
        filePath: checkpointPath,
        app: "spaghetti",
        runId: input.runId,
        actors,
        initialCounters: await capturePastaProofRestartInitialCounters({ actors }),
        plan: SPAGHETTI_RESTART_PLAN,
        intent,
      });

  await journal.reconcilePin((pending) => reconcilePastaProofRestartPin({ ...pending, ipfs: input.ipfs }));
  const actorToolkit = (actor: PastaProofRestartActor) => {
    if (actor === "creator") return input.tezos;
    if (actor === "collector") return input.collectorTezos;
    throw new Error(`Spaghetti restart plan contains unsupported actor ${actor}`);
  };
  const actorAddress = (actor: PastaProofRestartActor) => {
    if (actor === "creator") return input.creatorAddress;
    if (actor === "collector") return input.collectorAddress;
    throw new Error(`Spaghetti restart plan contains unsupported actor ${actor}`);
  };
  const reconcile = (pending: PastaProofRestartPendingOperation) => reconcilePastaProofRestartOperation({
    label: `Spaghetti restart ${pending.step.id}`,
    pending,
    signerAddress: actorAddress(pending.step.actor),
    validateApplied: (row) => assertSpaghettiRestartApplied({
      row,
      pending,
      signerAddress: actorAddress(pending.step.actor),
      tezos: actorToolkit(pending.step.actor),
      expectedCodeHash,
      expectedProjectedCodeHash,
      expectedCanonicalCodeHash,
    }),
  });
  await journal.reconcile(reconcile);

  const actorStates = new Map<PastaProofRestartActor, Awaited<ReturnType<typeof readPastaProofRestartActorState>>>();
  for (const actor of ["creator", "collector"] as const) {
    actorStates.set(actor, await readPastaProofRestartActorState({ signerAddress: actorAddress(actor) }));
  }
  for (const applied of journal.appliedOperations()) {
    const operationHash = applied.receipt.operationHash;
    assert.equal(typeof operationHash, "string", `Spaghetti restart ${applied.step.id} receipt lacks an operation hash`);
    const pending: PastaProofRestartPendingOperation = {
      step: applied.step,
      phase: "SUBMITTED",
      operationSequence: applied.operationSequence,
      expectedCounter: applied.expectedCounter,
      descriptor: applied.descriptor,
      descriptorSha256: applied.descriptorSha256,
      operationHash,
      ...(applied.receipt.contractAddress ? { contractAddress: applied.receipt.contractAddress } : {}),
    };
    const resolution = await reconcilePastaProofRestartOperation({
      label: `Spaghetti applied-prefix ${applied.step.id}`,
      pending,
      signerAddress: actorAddress(applied.step.actor),
      actorState: actorStates.get(applied.step.actor),
      validateApplied: (row) => assertSpaghettiRestartApplied({
        row,
        pending,
        signerAddress: actorAddress(applied.step.actor),
        tezos: actorToolkit(applied.step.actor),
        expectedCodeHash,
        expectedProjectedCodeHash,
        expectedCanonicalCodeHash,
      }),
    });
    assert.equal(resolution.status, "applied", `Spaghetti applied-prefix ${applied.step.id} is no longer applied`);
    if (resolution.status === "applied") {
      assert.equal(resolution.operationHash, operationHash, `Spaghetti applied-prefix ${applied.step.id} hash differs`);
    }
  }
  for (const actor of ["creator", "collector"] as const) {
    await assertPastaProofRestartCounterBoundary({
      signerAddress: actorAddress(actor),
      expectedCounter: journal.expectedCurrentCounter(actor),
      label: `Spaghetti authenticated ${actor} prefix`,
    });
  }
  return journal;
}

async function verifyTzktEvidence(input: {
  contractAddress: string;
  creatorAddress: string;
  collectorAddress: string;
  tokenMetadataUri: string;
  operationReceipts: Array<PastaUiLivePublicReceipt & { operationHash: string }>;
}): Promise<unknown> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const contract = await pollJson(
    "Spaghetti UI-live originated contract",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}`,
    (json) => json?.address === input.contractAddress,
  );
  const storage = await pollJson(
    "Spaghetti UI-live indexed storage",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}/storage`,
    (json) =>
      Number(json?.next_token_id) === 1 &&
      Number(json?.ledger) > 0 &&
      Number(json?.token_metadata) > 0 &&
      Number(json?.total_supply) > 0 &&
      Number(json?.sales) > 0,
  );
  const ledger = await pollJson(
    "Spaghetti UI-live creator and collector ownership",
    `${base}/bigmaps/${storage.ledger}/keys?limit=100`,
    (json) =>
      Array.isArray(json) &&
      json.some((entry) =>
        entry?.key?.owner === input.creatorAddress &&
        Number(entry?.key?.token_id) === 0 &&
        Number(entry?.value) === 1) &&
      json.some((entry) =>
        entry?.key?.owner === input.collectorAddress &&
        Number(entry?.key?.token_id) === 0 &&
        Number(entry?.value) === 1),
  );
  const supplies = await pollJson(
    "Spaghetti UI-live token supply",
    `${base}/bigmaps/${storage.total_supply}/keys?limit=20`,
    (json) =>
      Array.isArray(json) &&
      json.some((entry) => Number(entry?.key) === 0 && Number(entry?.value) === TOKEN_EDITIONS),
  );
  const sales = await pollJson(
    "Spaghetti UI-live sold-out primary sale",
    `${base}/bigmaps/${storage.sales}/keys?limit=20`,
    (json) =>
      Array.isArray(json) &&
      json.some((entry) =>
        Number(entry?.key) === 0 &&
        entry?.value?.seller === input.creatorAddress &&
        entry?.value?.treasury === input.creatorAddress &&
        Number(entry?.value?.price) === TOKEN_PRICE_MUTEZ &&
        Number(entry?.value?.remaining) === 0),
  );
  const tokenMetadata = await pollJson(
    "Spaghetti UI-live exact token metadata URI",
    `${base}/bigmaps/${storage.token_metadata}/keys?limit=20`,
    (json) =>
      Array.isArray(json) &&
      json.some((entry) =>
        Number(entry?.key) === 0 &&
        hexToUtf8(String(entry?.value?.token_info?.[""] || "")) === input.tokenMetadataUri),
  );
  const indexedTokens = await pollJson(
    "Spaghetti UI-live indexed FA2 token",
    `${base}/tokens?contract=${encodeURIComponent(input.contractAddress)}&tokenId=0&limit=10`,
    (json) =>
      Array.isArray(json) &&
      json.some((entry) => entry?.contract?.address === input.contractAddress && Number(entry?.tokenId) === 0),
  );
  const collectorBalances = await pollJson(
    "Spaghetti UI-live indexed collector balance",
    `${base}/tokens/balances?account=${encodeURIComponent(input.collectorAddress)}&token.contract=${encodeURIComponent(input.contractAddress)}&token.tokenId=0&balance.ne=0&limit=10`,
    (json) =>
      Array.isArray(json) &&
      json.some((entry) =>
        entry?.account?.address === input.collectorAddress &&
        entry?.token?.contract?.address === input.contractAddress &&
        Number(entry?.token?.tokenId) === 0 &&
        Number(entry?.balance) === 1),
  );

  const operations = [];
  for (const receipt of input.operationReceipts) {
    const family = receipt.action === "originate" ? "originations" : "transactions";
    assert.ok(
      receipt.action === "originate" || receipt.action === "batch" || receipt.action === "call",
      `Spaghetti receipt ${receipt.operationHash} has a non-operation action`,
    );
    const assertion: PastaUiLiveAppliedOperationAssertion = {
      action: receipt.action,
      operationHash: receipt.operationHash,
      contractAddress: input.contractAddress,
      entrypoints: [...(receipt.entrypoints || [])],
    };
    const signerAddress = receipt.signerAddress || "";
    const indexed = await pollJson(
      `Spaghetti UI-live ${family} ${receipt.operationHash}`,
      `${base}/operations/${family}/${encodeURIComponent(receipt.operationHash)}`,
      (json) => {
        try {
          assertSpaghettiTzktOperationApplied({ rows: json, assertion, signerAddress });
          return true;
        } catch {
          return false;
        }
      },
    );
    const record = assertSpaghettiTzktOperationApplied({ rows: indexed, assertion, signerAddress });
    const targetAddress = record.target?.address || record.originatedContract?.address;
    operations.push({
      hash: receipt.operationHash,
      status: record.status,
      type: record.type,
      sender: record.sender?.address,
      target: targetAddress,
      entrypoint: record.parameter?.entrypoint || null,
      level: record.level,
      timestamp: record.timestamp,
    });
  }

  return {
    schema: "pastaprotocol-spaghetti-tzkt-index@1",
    contract: {
      address: contract.address,
      kind: contract.kind,
      balance: contract.balance,
      firstActivity: contract.firstActivity,
      lastActivity: contract.lastActivity,
    },
    actors: {
      creator: input.creatorAddress,
      collector: input.collectorAddress,
      independent: input.creatorAddress !== input.collectorAddress,
    },
    storage: {
      nextTokenId: Number(storage.next_token_id),
      ledgerBigMap: Number(storage.ledger),
      tokenMetadataBigMap: Number(storage.token_metadata),
      totalSupplyBigMap: Number(storage.total_supply),
      salesBigMap: Number(storage.sales),
    },
    ledger: ledger.map((entry: any) => ({ key: entry.key, value: entry.value })),
    supplies: supplies.map((entry: any) => ({ key: entry.key, value: entry.value })),
    sales: sales.map((entry: any) => ({ key: entry.key, value: entry.value })),
    tokenMetadata: tokenMetadata.map((entry: any) => ({ key: entry.key, value: entry.value })),
    indexedTokens,
    collectorBalances,
    operations,
  };
}

export async function runSpaghettiUiLive(): Promise<SpaghettiUiLiveResult> {
  assertSpaghettiUiLiveExecutionAllowed(process.env);
  const runRoot = path.resolve(process.env[OUTPUT_ENV] || "");
  const { appRoot, runId, existing, recapture } = await requireFreshAppOutputDirectory(runRoot);
  const ipfs: IpfsProofConfig = resolveIpfsProofConfig();
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const env = await signerEnv(rpc.rpcUrl);
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(env);
  const tezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "Spaghetti UI-live startup");
  await assertShadownet(collectorTezos, "Spaghetti UI-live collector startup");

  const code = await readContractArtifact();
  const placeholderMetadataUri = "ipfs://bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
  const estimate = await tezos.estimate.originate({
    code,
    storage: buildOriginationStorage(creator.address, placeholderMetadataUri),
  } as never);
  const estimatedOriginationMutez = Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez);
  const requiredBalanceMutez = estimatedOriginationMutez + OPERATION_RESERVE_MUTEZ;
  const balance = await tezos.tz.getBalance(creator.address);
  const balanceMutez = Number(balance.toString());
  if (!Number.isSafeInteger(balanceMutez) || balanceMutez < requiredBalanceMutez) {
    block("Spaghetti UI-live creator is underfunded before any pin or chain write", [
      `Creator \`${creator.address}\` has \`${balance.toString()}\` mutez.`,
      `Estimated origination plus operation reserve requires at least \`${requiredBalanceMutez}\` mutez.`,
      "No proof artifact or metadata was pinned and no chain write was attempted.",
    ]);
  }
  const collectorBalance = await collectorTezos.tz.getBalance(collector.address);
  const collectorBalanceMutez = Number(collectorBalance.toString());
  if (
    !Number.isSafeInteger(collectorBalanceMutez) ||
    collectorBalanceMutez < COLLECTOR_OPERATION_RESERVE_MUTEZ + TOKEN_PRICE_MUTEZ
  ) {
    block("Spaghetti UI-live collector is underfunded before any pin or chain write", [
      `Collector \`${collector.address}\` has \`${collectorBalance.toString()}\` mutez.`,
      `A separate-wallet buy proof requires at least \`${COLLECTOR_OPERATION_RESERVE_MUTEZ + TOKEN_PRICE_MUTEZ}\` mutez.`,
      "No proof artifact or metadata was pinned and no chain write was attempted.",
    ]);
  }

  await mkdir(path.join(appRoot, "artifacts"), { recursive: true });
  const expectedCodeHash = hashJsonForBridge(code);
  const restartJournal = await prepareSpaghettiRestartJournal({
    appRoot,
    runId,
    existing,
    creatorAddress: creator.address,
    collectorAddress: collector.address,
    tezos,
    collectorTezos,
    code,
    ipfs,
  });
  if (recapture) {
    assert.equal(restartJournal.isComplete(), true, "Spaghetti recapture requires a terminal authenticated restart journal");
  }
  let artifactPin = restartJournal.appliedPin("media")?.proof;
  if (artifactPin) {
    assert.deepEqual(
      restartJournal.appliedPin("media")?.bytes,
      Uint8Array.from(PROOF_ARTIFACT_BYTES),
      "Spaghetti recovered media bytes differ",
    );
  } else {
    await restartJournal.beforePin("creator", {
      bytes: PROOF_ARTIFACT_BYTES,
      fileName: "spaghetti-ui-live-proof.png",
      mimeType: "image/png",
    });
    artifactPin = await pinIpfsProofBytes({
      bytes: PROOF_ARTIFACT_BYTES,
      fileName: "spaghetti-ui-live-proof.png",
      mimeType: "image/png",
      options: ipfs,
    });
    await restartJournal.onPin("creator", { proof: artifactPin });
  }
  const artifactRelativePath = "artifacts/spaghetti-ui-live-proof.png";
  await writeFile(path.join(appRoot, artifactRelativePath), PROOF_ARTIFACT_BYTES);
  assert.equal(sha256(PROOF_ARTIFACT_BYTES), artifactPin.sha256);

  const pinnedMetadata: PinnedMetadataRecord[] = restartJournal.pinRecords().flatMap((record) =>
    record.value === undefined || record.proof.mimeType !== "application/json"
      ? []
      : [{ value: record.value, proof: record.proof }]);
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: creator.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    ...(restartJournal.contractAddress()
      ? { allowedContractAddresses: new Set([restartJournal.contractAddress()!]) }
      : {}),
    allowedEntrypoints: new Set(["create_token", "mint", "set_sale"]),
    initialOperationSequence: restartJournal.completedOperationCount("creator"),
    assertExpectedChain: async (stage) => {
      await assertShadownet(tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    assertOperationApplied: (assertion) => verifySpaghettiTzktOperationApplied({
      assertion,
      signerAddress: creator.address,
    }),
    beforeOperationSubmit: async (operation) => {
      await restartJournal.beforeOperationSubmit("creator", operation);
      await assertPastaProofRestartCounterBoundary({
        signerAddress: creator.address,
        expectedCounter: restartJournal.expectedCurrentCounter("creator"),
        label: `Spaghetti pre-submit creator operation ${operation.operationSequence}`,
      });
    },
    onOperationSubmitted: (operation) => restartJournal.onOperationSubmitted("creator", operation),
    onReceipt: (receipt) => restartJournal.onReceipt("creator", receipt),
    beforePin: (pin) => restartJournal.beforePin("creator", pin),
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
    validateOrigination: (input) => validateBrowserOrigination(input, expectedCodeHash, creator.address),
    validateCall: (input) => validateBrowserCall(input, creator.address),
    projectStorage: (storage) => ({
      next_token_id: Number((storage as { next_token_id?: { toNumber?: () => number } | number }).next_token_id &&
        typeof (storage as { next_token_id?: { toNumber?: () => number } }).next_token_id === "object"
        ? (storage as { next_token_id: { toNumber(): number } }).next_token_id.toNumber()
        : (storage as { next_token_id?: number }).next_token_id || 0),
    }),
    onPin: async ({ value, proof }) => {
      await restartJournal.onPin("creator", { proof });
      if (value !== undefined) pinnedMetadata.push({ value, proof });
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez,
    requiredBalanceMutez,
    estimatedOriginationMutez,
    operationReserveMutez: OPERATION_RESERVE_MUTEZ,
  });

  const creatorCaptureGate = createSpaghettiCreatorCaptureGate();
  const bridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: async (request) => {
      await creatorCaptureGate.wait(request.action);
      return restartJournal.replayOrHandle("creator", request, () => {
        if (recapture && isSpaghettiEffectAction(request.action)) {
          throw new Error(`Spaghetti recapture refuses non-replayed creator effect ${request.action}`);
        }
        return session.handle(request);
      });
    },
  });
  let browser: Browser | null = null;
  let monitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  const screenshots: CapturePastaProofStageResult[] = [];
  const startedAt = new Date().toISOString();
  try {
    const opened = await openBrowser();
    browser = opened.browser;
    const packageValue = buildCheasePackage(artifactPin.uri, runId);
    await opened.context.addInitScript({
      content: `sessionStorage.setItem(${JSON.stringify(HANDOFF_KEY)}, ${JSON.stringify(JSON.stringify(packageValue)).replace(/</g, "\\u003c")});`,
    });
    monitor = monitorPastaProofPage(opened.page);
    const studioUrl = `${bridge.origin}/creation-tools/spaghetti/index.html?handoff=chease-package&handoffKey=${encodeURIComponent(HANDOFF_KEY)}`;
    await opened.page.goto(studioUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await opened.page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await opened.page.locator("#tokens .pp-token").waitFor({ state: "visible" });
    await installPastaUiLiveBrowserProxy(opened.page, bridge, "UI-LIVE");
    await configureActualStudio(opened.page, ipfs.apiUrl);
    await waitForSpaghettiLog(opened.page, "imported 1 token(s) from CH-EASE handoff", 30_000);
    screenshots.push(await captureStage(
      opened.page,
      monitor,
      runRoot,
      1,
      "configure collection and token",
      "configured",
      "imported 1 token(s) from CH-EASE handoff",
      [
        { selector: "#network", name: "network selector", expectedText: "Shadownet" },
        { selector: ".t-status", name: "pre-pinned artifact", expectedText: artifactPin.uri },
      ],
    ));

    await opened.page.click("#btnConnect");
    await opened.page.waitForFunction(() => document.getElementById("account")?.textContent !== "not connected");
    await waitForSpaghettiLog(opened.page, `connected ${creator.address} on shadownet`);
    screenshots.push(await captureStage(
      opened.page,
      monitor,
      runRoot,
      2,
      "connect creator signer",
      "connected",
      `connected ${creator.address} on shadownet`,
      [{ selector: "#account", name: "connected account", expectedText: creator.address.slice(0, 7) }],
    ));

    await opened.page.click("#btnPublish");
    await waitForSpaghettiLog(opened.page, "originating collection contract");
    await opened.page.waitForFunction(() => (window as any).__pastaUiLiveBridge?.pins?.length >= 1);
    screenshots.push(await captureStage(opened.page, monitor, runRoot, 3, "pin collection metadata", "metadata pinned", "originating collection contract"));
    creatorCaptureGate.allowThrough(2);

    await waitForSpaghettiLog(opened.page, "collection deployed:");
    screenshots.push(await captureStage(opened.page, monitor, runRoot, 4, "originate standard collection", "contract originated", "collection deployed:"));
    creatorCaptureGate.allowThrough(4);

    await waitForSpaghettiLog(opened.page, "token types created");
    screenshots.push(await captureStage(opened.page, monitor, runRoot, 5, "create token type", "token created", "token types created"));
    creatorCaptureGate.allowThrough(5);

    await waitForSpaghettiLog(opened.page, "editions minted");
    screenshots.push(await captureStage(opened.page, monitor, runRoot, 6, "mint creator editions", "minted", "editions minted"));
    creatorCaptureGate.allowThrough(6);

    await waitForSpaghettiLog(opened.page, "direct primary sales opened");
    screenshots.push(await captureStage(opened.page, monitor, runRoot, 7, "open direct primary sale", "sale opened", "direct primary sales opened"));

    await waitForSpaghettiLog(opened.page, "done — collection");
    await opened.page.waitForFunction(() => !document.getElementById("btnPublish")?.hasAttribute("disabled"));
    await focusSpaghettiCompletionNotice(opened.page);
    screenshots.push(await captureStage(
      opened.page,
      monitor,
      runRoot,
      8,
      "complete publishing lifecycle",
      "complete",
      "done — collection",
      [{ selector: "#ppNotice", name: "publish notice", expectedText: "Published" }],
    ));

    const publicBridgeState = await opened.page.evaluate(() => {
      const bridgeState = (window as any).__pastaUiLiveBridge;
      return {
        installed: bridgeState?.installed === true,
        classification: bridgeState?.classification,
        account: bridgeState?.getAccount?.(),
        receiptCount: bridgeState?.receipts?.length || 0,
        pinCount: bridgeState?.pins?.length || 0,
      };
    });
    assert.equal(publicBridgeState.installed, true);
    assert.equal(publicBridgeState.classification, "UI-LIVE");
    assert.equal(publicBridgeState.account, creator.address);
    assert.equal(publicBridgeState.pinCount, 2);
    assert.ok(
      publicBridgeState.receiptCount >= restartJournal.completedOperationCount("creator") + 2,
      "Spaghetti browser omitted replayed creator receipts",
    );
  } finally {
    creatorCaptureGate.releaseAll();
    monitor?.dispose();
    await browser?.close();
    await bridge.close();
  }

  const receipts = restartJournal.operationReceipts().filter((receipt) => receipt.signerAddress === creator.address);
  const identifiers = assertReceiptIdentifiers(receipts);
  const collectorSession = new TaquitoPastaUiLiveSession({
    tezos: collectorTezos,
    signerAddress: collector.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([identifiers.contractAddress]),
    allowedEntrypoints: new Set(["buy"]),
    initialOperationSequence: restartJournal.completedOperationCount("collector"),
    assertExpectedChain: async (stage) => {
      await assertShadownet(collectorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    assertOperationApplied: (assertion) => verifySpaghettiTzktOperationApplied({
      assertion,
      signerAddress: collector.address,
    }),
    beforeOperationSubmit: async (operation) => {
      await restartJournal.beforeOperationSubmit("collector", operation);
      await assertPastaProofRestartCounterBoundary({
        signerAddress: collector.address,
        expectedCounter: restartJournal.expectedCurrentCounter("collector"),
        label: `Spaghetti pre-submit collector operation ${operation.operationSequence}`,
      });
    },
    onOperationSubmitted: (operation) => restartJournal.onOperationSubmitted("collector", operation),
    onReceipt: (receipt) => restartJournal.onReceipt("collector", receipt),
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    validateCall: validateCollectorCall,
    projectStorage: async (rawStorage) => {
      const storage = rawStorage as {
        sales: { get(key: string | number): Promise<unknown> };
        token_metadata: { get(key: string | number): Promise<unknown> };
        total_supply: { get(key: string | number): Promise<unknown> };
      };
      const sale = (await storage.sales.get("0")) ?? (await storage.sales.get(0));
      const tokenMetadata =
        (await storage.token_metadata.get("0")) ?? (await storage.token_metadata.get(0));
      const totalSupply =
        (await storage.total_supply.get("0")) ?? (await storage.total_supply.get(0));
      assert.ok(sale, "collector page projection could not read token-0 sale");
      assert.ok(tokenMetadata, "collector page projection could not read token-0 metadata");
      const sales = new MichelsonMap<string, unknown>();
      const token_metadata = new MichelsonMap<string, unknown>();
      const total_supply = new MichelsonMap<string, unknown>();
      sales.set("0", sale);
      token_metadata.set("0", tokenMetadata);
      total_supply.set("0", totalSupply ?? 0);
      return { sales, token_metadata, total_supply };
    },
  });
  collectorSession.authorizeAfterFundingPreflight({
    balanceMutez: collectorBalanceMutez,
    requiredBalanceMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ + TOKEN_PRICE_MUTEZ,
    estimatedOriginationMutez: 0,
    operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
  });

  if (recapture) {
    screenshots.push(...await loadSpaghettiCompletedCollectorCaptures(appRoot));
  } else {
    const collectorBridge = await startPastaUiLiveLoopbackServer({
      staticRoot: STATIC_ROOT,
      handleAction: (request) => restartJournal.replayOrHandle("collector", request, () =>
        collectorSession.handle(request)),
    });
    let collectorBrowser: Browser | null = null;
    let collectorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
    try {
      const opened = await openBrowser();
      collectorBrowser = opened.browser;
      const config = {
        app: "spaghetti",
        label: "Spaghetti",
        title: "Spaghetti UI-LIVE Shadownet Proof",
        description: "A separate collector buys one edition from the creator-owned primary sale.",
        contract: identifiers.contractAddress,
        tokenId: 0,
        network: "shadownet",
        ipfsGateway: "https://ipfs.io/ipfs/",
      };
      await opened.page.route("**/creation-tools/spaghetti/pasta.config.js", async (route) => {
        await route.fulfill({
          contentType: "text/javascript; charset=utf-8",
          body: `window.PASTA_SITE_CONFIG=${JSON.stringify(config).replace(/</g, "\\u003c")};`,
        });
      });
      await opened.page.route("**/creation-tools/spaghetti/js/site.js", async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        await route.fulfill({
          response,
          body: `${buildPastaUiLiveProxyInstallerSource(
            collectorBridge.origin,
            collectorBridge.sessionToken,
            "UI-LIVE",
          )}\n${source}`,
        });
      });
      collectorMonitor = monitorPastaProofPage(opened.page);
      await opened.page.goto(`${collectorBridge.origin}/creation-tools/spaghetti/site.html`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await opened.page.waitForFunction(
        () =>
          document.getElementById("status")?.textContent === "On-chain state loaded." &&
          document.getElementById("chainState")?.textContent === "Primary sale open",
        undefined,
        { timeout: 30_000 },
      );
      screenshots.push(
        await captureCollectorStage(
          opened.page,
          collectorMonitor,
          runRoot,
          9,
          "load self-hosted primary sale",
          "primary sale loaded",
          "On-chain state loaded.",
          "Primary sale open",
        ),
      );

      await opened.page.click("#connect");
      await opened.page.waitForFunction(
        () => document.getElementById("status")?.textContent?.startsWith("Wallet connected."),
        undefined,
        { timeout: 30_000 },
      );
      screenshots.push(
        await captureCollectorStage(
          opened.page,
          collectorMonitor,
          runRoot,
          10,
          "connect independent collector",
          "collector connected",
          "Wallet connected. Review the action before signing.",
          "Primary sale open",
        ),
      );

      await opened.page.click("#submit");
      await waitForSpaghettiCollectorWrite(
        opened.page,
        "Confirmed on Tezos. On-chain state refreshed.",
        "Sold out",
      );
      screenshots.push(
        await captureCollectorStage(
          opened.page,
          collectorMonitor,
          runRoot,
          11,
          "buy from creator primary sale",
          "collector purchase confirmed",
          "Confirmed on Tezos. On-chain state refreshed.",
          "Sold out",
        ),
      );
    } finally {
      collectorMonitor?.dispose();
      await collectorBrowser?.close();
      await collectorBridge.close();
    }
  }

  const collectorReceipts = restartJournal.operationReceipts().filter((receipt) => receipt.signerAddress === collector.address);
  await Promise.all([
    assertPastaProofRestartCounterBoundary({
      signerAddress: creator.address,
      expectedCounter: restartJournal.expectedCurrentCounter("creator"),
      label: "Spaghetti terminal creator boundary",
    }),
    assertPastaProofRestartCounterBoundary({
      signerAddress: collector.address,
      expectedCounter: restartJournal.expectedCurrentCounter("collector"),
      label: "Spaghetti terminal collector boundary",
    }),
  ]);
  const collectorOperationReceipts = collectorReceipts.filter(
    (entry): entry is PastaUiLivePublicReceipt & { operationHash: string } =>
      typeof entry.operationHash === "string",
  );
  assert.equal(collectorOperationReceipts.length, 1, "collector should submit exactly one buy operation");
  assert.deepEqual(collectorOperationReceipts[0].entrypoints, ["buy"]);
  assert.equal(validateOperation(collectorOperationReceipts[0].operationHash), ValidationResult.VALID);
  const expectedScreenshotStages = [
    ...COMPLETED_CREATOR_CAPTURE_STAGES,
    ...COMPLETED_COLLECTOR_CAPTURE_SPECS.map((spec) => spec.stage),
  ];
  assert.deepEqual(
    screenshots.map((capture) => capture.manifestScreenshot.stage),
    expectedScreenshotStages,
    "Spaghetti proof screenshot stage order drifted",
  );
  assert.equal(
    new Set(screenshots.map((capture) => capture.manifestScreenshot.sha256)).size,
    expectedScreenshotStages.length,
    "Spaghetti proof requires a visually distinct PNG for every stage",
  );
  await Promise.all(screenshots.map((capture) => verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath)));
  assert.equal(pinnedMetadata.length, 2, "Spaghetti should pin collection and token metadata through the bridge");
  const metadataArtifacts = await writePinnedMetadataArtifacts(appRoot, pinnedMetadata);
  assert.equal(artifactPin.publicGatewayVerified, true, "Spaghetti media lacks public-gateway verification");
  const mediaArtifact: WrittenPinnedArtifact = {
    id: "spaghetti-token-0-media",
    kind: "token-media",
    path: artifactRelativePath,
    sha256: artifactPin.sha256,
    ipfsUri: artifactPin.uri,
    gatewayUrl: artifactPin.publicGatewayUrl,
    retrievedSha256: artifactPin.sha256,
  };
  const tokenMetadataArtifact = metadataArtifacts.find((artifact) => artifact.id === "spaghetti-token-0-metadata");
  assert.ok(tokenMetadataArtifact, "Spaghetti token metadata artifact is missing");
  const allOperationReceipts = [
    ...identifiers.operationReceipts,
    ...collectorOperationReceipts,
  ];
  const tzktEvidence = await verifyTzktEvidence({
    contractAddress: identifiers.contractAddress,
    creatorAddress: creator.address,
    collectorAddress: collector.address,
    tokenMetadataUri: tokenMetadataArtifact.ipfsUri,
    operationReceipts: allOperationReceipts,
  });
  const tzktBytes = deterministicJsonBytes(tzktEvidence);
  const tzktRelativePath = "artifacts/spaghetti-ui-live-tzkt-index.json";
  await writeFile(path.join(appRoot, tzktRelativePath), tzktBytes);

  const operations = allOperationReceipts.map((operationReceipt) => {
    const entrypoint = operationReceipt.entrypoints?.[0];
    const kind = operationReceipt.action === "originate"
      ? "origination"
      : entrypoint === "create_token"
        ? "create"
        : entrypoint === "mint"
          ? "mint"
          : entrypoint === "set_sale"
            ? "sale"
            : "buy";
    return {
      kind,
      hash: operationReceipt.operationHash,
      contractAddress: identifiers.contractAddress,
      ...(entrypoint ? { entrypoint } : {}),
      status: "applied",
      explorerUrl: `https://shadownet.tzkt.io/${operationReceipt.operationHash}`,
    };
  });
  const token = {
    id: "spaghetti-token-0",
    contractAddress: identifiers.contractAddress,
    tokenId: "0",
    explorerUrl: `https://shadownet.tzkt.io/${identifiers.contractAddress}/tokens/0`,
    metadataArtifactId: tokenMetadataArtifact.id,
    mediaArtifactId: mediaArtifact.id,
    metadataUri: tokenMetadataArtifact.ipfsUri,
    artifactUri: mediaArtifact.ipfsUri,
  };
  const restartCheckpointBytes = await readFile(path.join(appRoot, RESTART_CHECKPOINT_PATH));
  const restartCheckpointArtifact = {
    id: "spaghetti-restart-checkpoint",
    kind: "restart-checkpoint",
    path: RESTART_CHECKPOINT_PATH,
    sha256: sha256(restartCheckpointBytes),
  };
  const completedAt = new Date().toISOString();
  const receipt = {
    schema: "pastaprotocol-spaghetti-ui-live-run@1",
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
      creator: session.getFundingAuthorization(),
      collector: collectorSession.getFundingAuthorization(),
    },
    contract: {
      address: identifiers.contractAddress,
      explorerUrl: `https://shadownet.tzkt.io/${identifiers.contractAddress}`,
      tokenExplorerUrl: `https://shadownet.tzkt.io/${identifiers.contractAddress}/tokens/0`,
    },
    operations,
    token,
    bridgeReceipts: { creator: receipts, collector: collectorReceipts },
    pins: {
      artifact: mediaArtifact,
      metadata: metadataArtifacts,
    },
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    screenshotSidecars: screenshots.map((capture) => capture.manifestSidecarArtifact),
    tzktEvidence: { path: tzktRelativePath, sha256: sha256(tzktBytes) },
    restartSafety: {
      checkpoint: restartCheckpointArtifact,
      exactSemanticReplay: true,
      terminalCountersAuthenticated: true,
    },
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptRelativePath = "artifacts/spaghetti-ui-live-run.json";
  const receiptPath = path.join(appRoot, receiptRelativePath);
  await writeFile(receiptPath, receiptBytes);

  const localArtifacts = [
    ...screenshots.map((capture) => capture.manifestSidecarArtifact),
    restartCheckpointArtifact,
    {
      id: "spaghetti-ui-live-tzkt-index",
      kind: "indexer-evidence",
      path: tzktRelativePath,
      sha256: sha256(tzktBytes),
    },
    {
      id: "spaghetti-ui-live-run",
      kind: "proof-receipt",
      path: receiptRelativePath,
      sha256: sha256(receiptBytes),
    },
  ];
  const pinnedArtifacts = [mediaArtifact, ...metadataArtifacts];
  const allArtifacts = [...pinnedArtifacts, ...localArtifacts];
  const creatorOperationHashes = identifiers.operationReceipts.map((entry) => entry.operationHash);
  const collectorOperationHashes = collectorOperationReceipts.map((entry) => entry.operationHash);
  const creatorScreenshotStages = screenshots.slice(0, 8).map((capture) => capture.manifestScreenshot.stage);
  const collectorScreenshotStages = screenshots.slice(8).map((capture) => capture.manifestScreenshot.stage);
  const creatorSidecars = screenshots.slice(0, 8).map((capture) => capture.manifestSidecarArtifact.id);
  const collectorSidecars = screenshots.slice(8).map((capture) => capture.manifestSidecarArtifact.id);
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "spaghetti",
    role: "token-publisher",
    runId,
    capturedAt: completedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    artifacts: allArtifacts,
    contracts: [{
      address: identifiers.contractAddress,
      kind: "standard-collection",
      explorerUrl: `https://shadownet.tzkt.io/${identifiers.contractAddress}`,
    }],
    operations,
    tokens: [token],
    roleEvidence: [],
    capabilities: [
      {
        id: "publish-standard-collection",
        description: "Use the actual Spaghetti studio to import a CH-EASE package, pin exact collection/token/media bytes, originate a fresh standard collection, create and mint token 0, and open a direct primary sale.",
        evidence: {
          screenshots: creatorScreenshotStages,
          artifacts: [
            ...pinnedArtifacts.map((artifact) => artifact.id),
            ...creatorSidecars,
            restartCheckpointArtifact.id,
          ],
          contracts: [identifiers.contractAddress],
          operations: creatorOperationHashes,
          tokens: [token.id],
          roleEvidence: [],
          urls: [
            `https://shadownet.tzkt.io/${identifiers.contractAddress}`,
            ...pinnedArtifacts.map((artifact) => artifact.gatewayUrl),
          ],
        },
      },
      {
        id: "self-hosted-independent-primary-sale",
        description: "Use the actual self-hosted Spaghetti sale page with an independent collector signer, buy one edition, and independently verify every operation, exact metadata URI, sold-out state, supply, and ownership through TzKT.",
        evidence: {
          screenshots: collectorScreenshotStages,
          artifacts: [
            ...collectorSidecars,
            "spaghetti-ui-live-tzkt-index",
            "spaghetti-ui-live-run",
          ],
          contracts: [identifiers.contractAddress],
          operations: collectorOperationHashes,
          tokens: [token.id],
          roleEvidence: [],
          urls: [token.explorerUrl],
        },
      },
    ],
  };
  const manifestPath = path.join(appRoot, "manifest.json");
  await writeFile(manifestPath, deterministicJsonBytes(manifest));
  const operationHashes = operations.map((operation) => operation.hash);
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    classification: "UI-LIVE",
    contractAddress: identifiers.contractAddress,
    operationHashes,
    manifestPath,
    receiptPath,
    receiptSha256: sha256(receiptBytes),
  }, null, 2)}\n`);
  return {
    manifestPath,
    receiptPath,
    contractAddress: identifiers.contractAddress,
    operationHashes,
    screenshots,
  };
}

async function main(): Promise<void> {
  try {
    await runSpaghettiUiLive();
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
