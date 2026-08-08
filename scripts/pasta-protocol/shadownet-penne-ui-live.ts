#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

import { MichelsonMap, type TezosToolkit } from "@taquito/taquito";
import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
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
  type CapturePastaProofStageResult,
  type RequiredDomEvidence,
} from "./pasta-proof-screenshot-kit";
import {
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

const EXECUTE_FLAG = "PASTA_SHADOWNET_PENNE_UI_LIVE_EXECUTE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const CREATOR_OPERATION_RESERVE_MUTEZ = 2_250_000;
const COLLECTOR_OPERATION_RESERVE_MUTEZ = 500_000;
const COLLECTOR_ALLOCATION = 1;
const CREATOR_ALLOCATION = 2;
const HANDOFF_KEY = "wtfos.pasta.handoff.v1:penne-ui-live-proof";
const RESTART_CHECKPOINT_PATH = "artifacts/penne-restart-checkpoint.json";
const CONTRACT_ARTIFACT_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "penne",
  "contract",
  "pasta-distribution.contract.json",
);
const STATIC_ROOT = path.join(root, "public");

export const PENNE_RESTART_PLAN: readonly PastaProofRestartStep[] = Object.freeze([
  { id: "media", actor: "creator", kind: "pin", fileName: "penne-ui-live-proof.png", transport: "direct" },
  { id: "collection-metadata", actor: "creator", kind: "pin", fileName: "collection.json", transport: "bridge" },
  { id: "token-metadata", actor: "creator", kind: "pin", fileName: "token.json", transport: "bridge" },
  { id: "originate", actor: "creator", kind: "operation", action: "originate", transport: "bridge" },
  { id: "create-token", actor: "creator", kind: "operation", action: "call", entrypoint: "create_token", transport: "bridge" },
  { id: "set-allocations", actor: "creator", kind: "operation", action: "call", entrypoint: "set_allocations", transport: "bridge" },
  { id: "open-claim", actor: "creator", kind: "operation", action: "call", entrypoint: "open_claim", transport: "bridge" },
  { id: "collector-claim", actor: "collector", kind: "operation", action: "call", entrypoint: "claim", transport: "bridge" },
  { id: "creator-airdrop", actor: "creator", kind: "operation", action: "call", entrypoint: "airdrop", transport: "bridge" },
  { id: "close-claim", actor: "creator", kind: "operation", action: "call", entrypoint: "open_claim", transport: "bridge" },
]);

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
      raw[offset++] = (seedBytes[0] + x * 9 + y * 2) & 255;
      raw[offset++] = (seedBytes[1] + x * 3 + y * 13) & 255;
      raw[offset++] = (seedBytes[2] + x * y + y * 5) & 255;
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

const PROOF_ARTIFACT_BYTES = proofPng("penne-ui-live-shadownet-proof");
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

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

type OperationReceipt = PastaUiLivePublicReceipt & {
  action: "originate" | "call";
  signerAddress: string;
  contractAddress: string;
  operationHash: string;
};

function isOperationReceipt(receipt: PastaUiLivePublicReceipt): receipt is OperationReceipt {
  return (
    (receipt.action === "originate" || receipt.action === "call") &&
    typeof receipt.signerAddress === "string" &&
    typeof receipt.contractAddress === "string" &&
    typeof receipt.operationHash === "string"
  );
}

type DistributionFinalState = {
  tokenId: 0;
  nextTokenId: number;
  claimActive: false;
  totalSupply: number;
  collectorBalance: number;
  creatorBalance: number;
  collectorClaimed: number;
  creatorClaimed: number;
  collectorAllocationRemaining: number;
  creatorAllocationRemaining: number;
  tokenMetadataPresent: true;
};

type PenneUiLiveResult = {
  manifestPath: string;
  receiptPath: string;
  contractAddress: string;
  operationHashes: string[];
  screenshots: CapturePastaProofStageResult[];
};

export function assertPenneUiLiveExecutionAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[EXECUTE_FLAG] !== "1") {
    block("explicit Penne UI-live execute flag is required", [
      `\`${EXECUTE_FLAG}=1\` is required because this browser lane pins durable metadata and signs real Shadownet distribution operations with creator and collector keyring wallets.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Penne UI-live runner only permits Shadownet", [
      "Unset `TEZOS_NETWORK` or set it to `shadownet`; mainnet execution is refused.",
    ]);
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [
      `Set \`${OUTPUT_ENV}\` to the aggregate proof-run root before executing this lane.`,
    ]);
  }
  for (const key of [
    "PASTA_SHADOWNET_PENNE_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_PENNE_UI_LIVE_RESUME",
    "PASTA_SHADOWNET_PENNE_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) {
      block("Penne UI-live proof is fresh-origination only", [
        `Unset \`${key}\`; manual contract attachment and manual resume modes are prohibited.`,
        `A process restart is selected automatically only when \`${OUTPUT_ENV}\` contains the authenticated Penne restart checkpoint.`,
      ]);
    }
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const extra = "errors" in error ? JSON.stringify((error as Error & { errors?: unknown }).errors ?? "") : "";
    return `${error.message} ${extra}`.trim();
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function requireFreshAppOutputDirectory(
  runRoot: string,
): Promise<{ appRoot: string; runId: string; existing: boolean }> {
  const absoluteRunRoot = path.resolve(runRoot);
  let runRootInfo;
  try {
    runRootInfo = await lstat(absoluteRunRoot);
  } catch (error) {
    block("Pasta proof run directory does not exist", [
      `Create the aggregate proof-run root \`${absoluteRunRoot}\` before executing Penne.`,
      `Reason: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  if (!runRootInfo.isDirectory() || runRootInfo.isSymbolicLink()) {
    block("Penne proof run path is not a regular directory", [`Refusing \`${absoluteRunRoot}\`.`]);
  }
  const runId = path.basename(absoluteRunRoot);
  if (!SAFE_RUN_ID.test(runId)) {
    block("Penne proof run directory must end in a safe run id", [
      "Use a final directory name containing only lowercase letters, digits, dots, underscores, and hyphens.",
    ]);
  }
  const appRoot = path.join(absoluteRunRoot, "penne");
  try {
    const info = await lstat(appRoot);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      block("Penne proof output path is not a regular directory", [`Refusing \`${appRoot}\`.`]);
    }
    try {
      await lstat(path.join(appRoot, "manifest.json"));
      block("Penne proof is already complete", [
        `A final manifest already exists at \`${path.join(appRoot, "manifest.json")}\`.`,
      ]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await lstat(path.join(appRoot, RESTART_CHECKPOINT_PATH));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        block("Penne output exists without a restart checkpoint", [
          `Refusing unauthenticated partial output at \`${appRoot}\`.`,
        ]);
      }
      throw error;
    }
    return { appRoot, runId, existing: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { appRoot, runId, existing: false };
}

async function readContractArtifact(): Promise<unknown[]> {
  const code = JSON.parse(await readFile(CONTRACT_ARTIFACT_PATH, "utf8"));
  assert.ok(Array.isArray(code), "Penne contract artifact must be a Michelson JSON array");
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
    allocations: new MichelsonMap(),
    claimed: new MichelsonMap(),
    claim_active: false,
    claim_start: null,
    claim_end: null,
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
  creatorAddress: string,
): void {
  assert.equal(hashJsonForBridge(input.code), expectedCodeHash, "browser requested an unexpected Penne artifact");
  assert.ok(input.storage && typeof input.storage === "object" && !Array.isArray(input.storage));
  const storage = input.storage as Record<string, unknown>;
  assert.equal(storage.administrator, creatorAddress);
  assert.equal(storage.pending_administrator, null);
  assert.equal(storage.next_token_id, 0);
  assert.equal(storage.claim_active, false);
  assert.equal(storage.claim_start, null);
  assert.equal(storage.claim_end, null);
  assert.ok(storage.metadata instanceof MichelsonMap);
  assert.equal([...storage.metadata.entries()].length, 1);
  for (const key of [
    "ledger",
    "operators",
    "token_metadata",
    "total_supply",
    "allocations",
    "claimed",
    "minters",
  ]) {
    assertEmptyMichelsonMap(storage[key], key);
  }
}

function createCreatorCallValidator(creatorAddress: string, collectorAddress: string, initialPhase = 0): {
  validate(input: { contractAddress: string; entrypoint: string; payload: unknown }): void;
  assertComplete(): void;
} {
  const expectedEntrypoints = ["create_token", "set_allocations", "open_claim", "airdrop", "open_claim"];
  assert.ok(
    Number.isSafeInteger(initialPhase) && initialPhase >= 0 && initialPhase <= expectedEntrypoints.length,
    "Penne recovered creator call phase is invalid",
  );
  let phase = initialPhase;
  return {
    validate(input) {
      assert.equal(input.entrypoint, expectedEntrypoints[phase], `unexpected Penne creator call at phase ${phase + 1}`);
      if (input.entrypoint === "create_token") {
        assert.ok(input.payload instanceof MichelsonMap, "create_token payload must be a MichelsonMap");
        assert.equal([...input.payload.entries()].length, 1, "create_token must contain one metadata URI");
      } else if (input.entrypoint === "set_allocations") {
        assert.ok(Array.isArray(input.payload), "set_allocations payload must be a list");
        assert.equal(input.payload.length, 2, "proof must load exactly two allocations");
        const allocations = input.payload as Array<Record<string, unknown>>;
        assert.equal(allocations[0].recipient, collectorAddress);
        assert.equal(Number(allocations[0].token_id), 0);
        assert.equal(Number(allocations[0].amount), COLLECTOR_ALLOCATION);
        assert.equal(allocations[1].recipient, creatorAddress);
        assert.equal(Number(allocations[1].token_id), 0);
        assert.equal(Number(allocations[1].amount), CREATOR_ALLOCATION);
      } else if (input.entrypoint === "airdrop") {
        assert.ok(Array.isArray(input.payload), "airdrop payload must be a list");
        assert.equal(input.payload.length, 1, "airdrop must contain only the creator's remaining allocation");
        const item = input.payload[0] as Record<string, unknown>;
        assert.equal(item.recipient, creatorAddress);
        assert.equal(Number(item.token_id), 0);
      } else if (input.entrypoint === "open_claim") {
        assert.ok(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
        const claim = input.payload as Record<string, unknown>;
        assert.equal(claim.active, phase === 2, phase === 2 ? "claim must open" : "claim must close");
        assert.equal(claim.start, null);
        assert.equal(claim.end, null);
      }
      phase += 1;
    },
    assertComplete() {
      assert.equal(phase, expectedEntrypoints.length, "creator did not complete the Penne operation sequence");
    },
  };
}

function validateCollectorClaim(
  input: { contractAddress: string; entrypoint: string; payload: unknown },
  expectedContract: string,
): void {
  assert.equal(input.contractAddress, expectedContract);
  assert.equal(input.entrypoint, "claim");
  assert.equal(Number(input.payload), 0, "collector must claim token id 0");
}

function buildCheasePackage(artifactUri: string, runId: string) {
  return {
    schemaVersion: "wtfos.pasta.chease-package.v1",
    kind: "single_token",
    targetApp: "penne",
    token: {
      name: "Penne UI-LIVE Distribution Token",
      description: "Claimed and airdropped through the real Penne browser studio.",
      artifactUri,
      mimeType: "image/png",
      tags: ["penne", "distribution", "ui-live", "shadownet"],
    },
    relationship: {
      collection_group: `penne-ui-live-${runId}`,
    },
  };
}

const PENNE_UI_FAILURE_PREFIXES = [
  "connect failed:",
  "deploy failed:",
  "claim config failed:",
  "claim failed:",
  "airdrop failed",
] as const;

async function waitForLog(page: Page, expected: string, timeout = 300_000): Promise<void> {
  await page.locator("#log").waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    ({ text, failurePrefixes }) => {
      const log = document.getElementById("log")?.textContent || "";
      return log.includes(text) || failurePrefixes.some((prefix) => log.includes(prefix));
    },
    { text: expected, failurePrefixes: PENNE_UI_FAILURE_PREFIXES },
    { timeout },
  );
  const log = await page.locator("#log").innerText();
  if (!log.includes(expected)) {
    throw new Error(
      `Penne Studio failed while waiting for ${JSON.stringify(expected)}; log=${log.slice(-1_500)}`,
    );
  }
}

async function configureCreatorStudio(
  page: Page,
  kuboApiUrl: string,
  creatorAddress: string,
  collectorAddress: string,
): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", kuboApiUrl);
  await page.fill("#collName", "Penne UI-LIVE Shadownet Distribution");
  await page.fill("#collSymbol", "PNGUI");
  await page.fill("#tokName", "Penne UI-LIVE Distribution Token");
  await page.fill("#tokDesc", "Real Penne pull-claim and push-airdrop proof with separate keyring signers.");
  await page.fill("#tokTags", "penne, distribution, ui-live, shadownet");
  await page.fill(
    "#recipients",
    `${collectorAddress}, ${COLLECTOR_ALLOCATION}\n${creatorAddress}, ${CREATOR_ALLOCATION}`,
  );
  await page.fill("#batchSize", "50");
  await page.click("#btnParse");
  await page.waitForFunction(() => document.getElementById("sumCount")?.textContent === "2");
}

async function captureStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  capability: string,
  stageName: string,
  expectedLog: string,
  focusSelector = "#log",
  extraEvidence: RequiredDomEvidence[] = [],
): Promise<CapturePastaProofStageResult> {
  await page.locator(focusSelector).scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "penne",
    capability,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "h1", name: "application", expectedText: "Penne" },
      { selector: "#log", name: "stage log", expectedText: expectedLog },
      ...extraEvidence,
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function createProofContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: false,
  });
}

function nat(value: unknown, label: string): number {
  const text = value && typeof value === "object" && "toString" in value
    ? String((value as { toString(): string }).toString())
    : String(value ?? "0");
  const output = Number(text);
  assert.ok(Number.isSafeInteger(output) && output >= 0, `${label} is not a natural number`);
  return output;
}

async function bigMapGet(map: unknown, key: unknown): Promise<unknown> {
  assert.ok(map && typeof map === "object" && "get" in map && typeof (map as { get?: unknown }).get === "function");
  return (map as { get(key: unknown): unknown | Promise<unknown> }).get(key);
}

async function readAndAssertFinalState(
  tezos: TezosToolkit,
  contractAddress: string,
  creatorAddress: string,
  collectorAddress: string,
): Promise<DistributionFinalState> {
  await assertShadownet(tezos, "Penne final storage verification");
  const contract = await tezos.contract.at(contractAddress);
  const storage = await contract.storage() as Record<string, unknown>;
  const collectorKey = { owner: collectorAddress, token_id: 0 };
  const creatorKey = { owner: creatorAddress, token_id: 0 };
  const nextTokenId = nat(storage.next_token_id, "next_token_id");
  const totalSupply = nat(await bigMapGet(storage.total_supply, 0), "total_supply[0]");
  const collectorBalance = nat(await bigMapGet(storage.ledger, collectorKey), "collector ledger balance");
  const creatorBalance = nat(await bigMapGet(storage.ledger, creatorKey), "creator ledger balance");
  const collectorClaimed = nat(await bigMapGet(storage.claimed, collectorKey), "collector claimed amount");
  const creatorClaimed = nat(await bigMapGet(storage.claimed, creatorKey), "creator claimed amount");
  const collectorAllocationRemaining = nat(
    await bigMapGet(storage.allocations, collectorKey),
    "collector remaining allocation",
  );
  const creatorAllocationRemaining = nat(
    await bigMapGet(storage.allocations, creatorKey),
    "creator remaining allocation",
  );
  const tokenMetadata = await bigMapGet(storage.token_metadata, 0);
  assert.equal(nextTokenId, 1);
  assert.equal(storage.claim_active, false);
  assert.equal(totalSupply, COLLECTOR_ALLOCATION + CREATOR_ALLOCATION);
  assert.equal(collectorBalance, COLLECTOR_ALLOCATION);
  assert.equal(creatorBalance, CREATOR_ALLOCATION);
  assert.equal(collectorClaimed, COLLECTOR_ALLOCATION);
  assert.equal(creatorClaimed, CREATOR_ALLOCATION);
  assert.equal(collectorAllocationRemaining, 0);
  assert.equal(creatorAllocationRemaining, 0);
  assert.ok(tokenMetadata, "token metadata 0 is absent");
  return {
    tokenId: 0,
    nextTokenId,
    claimActive: false,
    totalSupply,
    collectorBalance,
    creatorBalance,
    collectorClaimed,
    creatorClaimed,
    collectorAllocationRemaining,
    creatorAllocationRemaining,
    tokenMetadataPresent: true,
  };
}

function validateReceiptIdentifiers(
  creatorReceipts: PastaUiLivePublicReceipt[],
  collectorReceipts: PastaUiLivePublicReceipt[],
  creatorAddress: string,
  collectorAddress: string,
): { contractAddress: string; operationReceipts: OperationReceipt[] } {
  const origination = creatorReceipts.find((receipt) => receipt.action === "originate");
  assert.ok(origination?.contractAddress, "Penne origination receipt is missing its KT1");
  assert.equal(validateContractAddress(origination.contractAddress), ValidationResult.VALID);
  const creatorOperations = creatorReceipts.filter(isOperationReceipt);
  const collectorOperations = collectorReceipts.filter(isOperationReceipt);
  assert.deepEqual(
    creatorOperations.map((receipt) => receipt.entrypoints?.[0] || receipt.action),
    ["originate", "create_token", "set_allocations", "open_claim", "airdrop", "open_claim"],
  );
  assert.deepEqual(collectorOperations.map((receipt) => receipt.entrypoints), [["claim"]]);
  for (const receipt of creatorOperations) {
    assert.equal(receipt.signerAddress, creatorAddress, "creator operation receipt has the wrong signer");
  }
  for (const receipt of collectorOperations) {
    assert.equal(receipt.signerAddress, collectorAddress, "collector operation receipt has the wrong signer");
  }
  const operationReceipts = [
    ...creatorOperations.slice(0, 4),
    collectorOperations[0],
    ...creatorOperations.slice(4),
  ];
  assert.equal(operationReceipts.length, 7, "expected seven Penne lifecycle operation receipts");
  assert.equal(
    new Set(operationReceipts.map((receipt) => receipt.operationHash)).size,
    operationReceipts.length,
    "operation hashes must be unique",
  );
  for (const receipt of operationReceipts) {
    assert.equal(receipt.chainId, SHADOWNET_CHAIN_ID);
    assert.equal(receipt.contractAddress, origination.contractAddress);
    assert.equal(validateOperation(receipt.operationHash), ValidationResult.VALID);
  }
  return { contractAddress: origination.contractAddress, operationReceipts };
}

async function writePinnedMetadataArtifacts(
  appRoot: string,
  records: PinnedMetadataRecord[],
): Promise<WrittenPinnedArtifact[]> {
  const identities = new Map([
    ["collection.json", { id: "penne-collection-metadata", kind: "collection-metadata", label: "collection" }],
    ["token.json", { id: "penne-token-0-metadata", kind: "token-metadata", label: "token-0" }],
  ]);
  assert.equal(records.length, identities.size, "Penne must pin exactly one collection and one token metadata object");
  const output: WrittenPinnedArtifact[] = [];
  for (const record of records) {
    const identity = identities.get(record.proof.fileName);
    assert.ok(identity, `unexpected Penne metadata pin ${record.proof.fileName}`);
    assert.equal(record.proof.publicGatewayVerified, true, `${record.proof.fileName} lacks public-gateway verification`);
    const { id, kind, label } = identity;
    const relativePath = `artifacts/penne-ui-live-${label}-metadata.json`;
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
    identities.delete(record.proof.fileName);
  }
  assert.equal(identities.size, 0, "Penne metadata pin set is incomplete");
  return output;
}

type PenneTzktOperationRow = {
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

async function assertPenneRestartApplied(input: {
  row: unknown;
  pending: PastaProofRestartPendingOperation;
  signerAddress: string;
  tezos: TezosToolkit;
  expectedCodeHash: string;
}): Promise<{ contractAddress: string; entrypoints: string[] }> {
  if (input.pending.step.action !== "originate") {
    return assertPastaProofRestartTransaction(input);
  }
  const resolved = assertPastaProofRestartOrigination(input);
  const descriptor = projectedRecord(input.pending.descriptor, "Penne restart origination descriptor");
  assert.equal(hashJsonForBridge(descriptor.code), input.expectedCodeHash, "Penne restart artifact identity differs");
  const requestedStorage = projectedRecord(descriptor.storage, "Penne restart origination storage");
  assert.equal(requestedStorage.administrator, input.signerAddress);
  assert.equal(requestedStorage.pending_administrator, null);
  assert.equal(Number(requestedStorage.next_token_id), 0);
  assert.equal(requestedStorage.claim_active, false);
  assert.equal(requestedStorage.claim_start, null);
  assert.equal(requestedStorage.claim_end, null);
  const metadataEntries = projectedMapEntries(requestedStorage.metadata, "Penne restart metadata");
  assert.equal(metadataEntries.length, 1);
  assert.equal(metadataEntries[0][0], "");
  const expectedMetadataHex = String(metadataEntries[0][1]);
  for (const key of ["ledger", "operators", "token_metadata", "total_supply", "allocations", "claimed", "minters"]) {
    assert.deepEqual(projectedMapEntries(requestedStorage[key], `Penne restart ${key}`), []);
  }
  const rowStorage = projectedRecord((input.row as PenneTzktOperationRow).storage, "Penne indexed origination storage");
  assert.equal(rowStorage.administrator, input.signerAddress);
  assert.equal(rowStorage.pending_administrator, null);
  assert.equal(Number(rowStorage.next_token_id), 0);
  assert.equal(rowStorage.claim_active, false);
  assert.equal(rowStorage.claim_start, null);
  assert.equal(rowStorage.claim_end, null);
  const script = await input.tezos.rpc.getScript(resolved.contractAddress);
  assert.equal(hashJsonForBridge(script.code), input.expectedCodeHash, "Penne recovered on-chain code differs");
  const contract = await input.tezos.contract.at(resolved.contractAddress);
  const storage = await contract.storage() as { metadata: { get(key: string): Promise<unknown> } };
  assert.equal(await storage.metadata.get(""), expectedMetadataHex, "Penne recovered collection metadata URI differs");
  return resolved;
}

function penneTzktOperationRows(value: unknown): PenneTzktOperationRow[] {
  const rows = Array.isArray(value) ? value : [value];
  assert.ok(
    rows.length > 0 && rows.every((row) => row && typeof row === "object" && !Array.isArray(row)),
    "TzKT operation response must contain operation objects",
  );
  return rows as PenneTzktOperationRow[];
}

export function assertPenneTzktOperationApplied(input: {
  rows: unknown;
  assertion: PastaUiLiveAppliedOperationAssertion;
  signerAddress: string;
}): PenneTzktOperationRow {
  assert.equal(
    validateOperation(input.assertion.operationHash),
    ValidationResult.VALID,
    "Penne operation hash is invalid",
  );
  assert.equal(
    validateAddress(input.signerAddress),
    ValidationResult.VALID,
    "Penne operation signer is invalid",
  );
  assert.notEqual(
    input.assertion.action,
    "batch",
    "Penne UI-live does not permit batch finality assertions",
  );
  assert.equal(
    validateContractAddress(input.assertion.contractAddress || ""),
    ValidationResult.VALID,
    "Penne operation contract address is invalid",
  );

  const signerRows = penneTzktOperationRows(input.rows).filter((row) =>
    row.hash === input.assertion.operationHash &&
    row.sender?.address === input.signerAddress
  );
  assert.equal(
    signerRows.length,
    1,
    "TzKT must expose exactly one Penne operation for the exact hash and signer",
  );
  const operation = signerRows[0];
  assert.equal(operation.status, "applied", "Penne operation is not applied");
  assert.ok(
    Number.isSafeInteger(Number(operation.level)) && Number(operation.level) > 0,
    "Penne operation level is invalid",
  );
  assert.ok(
    typeof operation.timestamp === "string" &&
      Number.isFinite(Date.parse(operation.timestamp)),
    "Penne operation timestamp is invalid",
  );

  if (input.assertion.action === "originate") {
    assert.equal(operation.type, "origination", "Penne origination action differs from TzKT");
    assert.deepEqual(input.assertion.entrypoints, [], "Penne origination cannot claim entrypoints");
    assert.equal(
      operation.originatedContract?.address,
      input.assertion.contractAddress,
      "Penne originated address differs from TzKT",
    );
  } else {
    assert.equal(operation.type, "transaction", "Penne call action differs from TzKT");
    assert.equal(input.assertion.entrypoints.length, 1, "Penne call must claim exactly one entrypoint");
    assert.equal(
      operation.target?.address,
      input.assertion.contractAddress,
      "Penne call target differs from TzKT",
    );
    assert.equal(
      operation.parameter?.entrypoint,
      input.assertion.entrypoints[0],
      "Penne call entrypoint differs from TzKT",
    );
  }
  return operation;
}

async function verifyPenneTzktOperationApplied(input: {
  assertion: PastaUiLiveAppliedOperationAssertion;
  signerAddress: string;
}): Promise<void> {
  const endpoint = input.assertion.action === "originate" ? "originations" : "transactions";
  const url = `${normalizeBase(SHADOWNET_TZKT_API)}/operations/${endpoint}/${encodeURIComponent(input.assertion.operationHash)}`;
  const rows = await pollJson(
    `Penne exact-hash ${input.assertion.action} finality`,
    url,
    (value) => {
      try {
        assertPenneTzktOperationApplied({ rows: value, ...input });
        return true;
      } catch {
        return false;
      }
    },
  );
  assertPenneTzktOperationApplied({ rows, ...input });
}

async function preparePenneRestartJournal(input: {
  appRoot: string;
  runId: string;
  existing: boolean;
  creatorAddress: string;
  collectorAddress: string;
  creatorTezos: TezosToolkit;
  collectorTezos: TezosToolkit;
  code: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<PastaProofRestartJournal> {
  const actors = { creator: input.creatorAddress, collector: input.collectorAddress } as const;
  const expectedCodeHash = hashJsonForBridge(input.code);
  const intent = {
    contractArtifactPath: path.relative(root, CONTRACT_ARTIFACT_PATH),
    contractArtifactSha256: expectedCodeHash,
    mediaSha256: sha256(PROOF_ARTIFACT_BYTES),
    mediaByteLength: PROOF_ARTIFACT_BYTES.byteLength,
    relationshipGroup: `penne-ui-live-${input.runId}`,
    allocations: {
      creator: CREATOR_ALLOCATION,
      collector: COLLECTOR_ALLOCATION,
    },
  };
  const checkpointPath = path.join(input.appRoot, RESTART_CHECKPOINT_PATH);
  const journal = input.existing
    ? await PastaProofRestartJournal.open(checkpointPath, {
        app: "penne",
        runId: input.runId,
        actors,
        plan: PENNE_RESTART_PLAN,
        intent,
        authenticateInitialCounters: (counters) => authenticatePastaProofRestartInitialCounters({
          counters,
          actors,
          plan: PENNE_RESTART_PLAN,
        }),
      })
    : await PastaProofRestartJournal.create({
        filePath: checkpointPath,
        app: "penne",
        runId: input.runId,
        actors,
        initialCounters: await capturePastaProofRestartInitialCounters({ actors }),
        plan: PENNE_RESTART_PLAN,
        intent,
      });

  await journal.reconcilePin((pending) => reconcilePastaProofRestartPin({ ...pending, ipfs: input.ipfs }));
  const actorToolkit = (actor: PastaProofRestartActor): TezosToolkit => {
    if (actor === "creator") return input.creatorTezos;
    if (actor === "collector") return input.collectorTezos;
    throw new Error(`Penne restart plan contains unsupported actor ${actor}`);
  };
  const actorAddress = (actor: PastaProofRestartActor) => {
    if (actor === "creator") return input.creatorAddress;
    if (actor === "collector") return input.collectorAddress;
    throw new Error(`Penne restart plan contains unsupported actor ${actor}`);
  };
  const reconcile = (pending: PastaProofRestartPendingOperation) => reconcilePastaProofRestartOperation({
    label: `Penne restart ${pending.step.id}`,
    pending,
    signerAddress: actorAddress(pending.step.actor),
    validateApplied: (row) => assertPenneRestartApplied({
      row,
      pending,
      signerAddress: actorAddress(pending.step.actor),
      tezos: actorToolkit(pending.step.actor),
      expectedCodeHash,
    }),
  });
  await journal.reconcile(reconcile);

  const actorStates = new Map<PastaProofRestartActor, Awaited<ReturnType<typeof readPastaProofRestartActorState>>>();
  for (const actor of ["creator", "collector"] as const) {
    actorStates.set(actor, await readPastaProofRestartActorState({ signerAddress: actorAddress(actor) }));
  }
  for (const applied of journal.appliedOperations()) {
    const operationHash = applied.receipt.operationHash;
    assert.equal(typeof operationHash, "string", `Penne restart ${applied.step.id} receipt lacks an operation hash`);
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
      label: `Penne applied-prefix ${applied.step.id}`,
      pending,
      signerAddress: actorAddress(applied.step.actor),
      actorState: actorStates.get(applied.step.actor),
      validateApplied: (row) => assertPenneRestartApplied({
        row,
        pending,
        signerAddress: actorAddress(applied.step.actor),
        tezos: actorToolkit(applied.step.actor),
        expectedCodeHash,
      }),
    });
    assert.equal(resolution.status, "applied", `Penne applied-prefix ${applied.step.id} is no longer applied`);
    if (resolution.status === "applied") {
      assert.equal(resolution.operationHash, operationHash, `Penne applied-prefix ${applied.step.id} hash differs`);
    }
  }
  for (const actor of ["creator", "collector"] as const) {
    await assertPastaProofRestartCounterBoundary({
      signerAddress: actorAddress(actor),
      expectedCounter: journal.expectedCurrentCounter(actor),
      label: `Penne authenticated ${actor} prefix`,
    });
  }
  return journal;
}

export async function verifyPenneTzktEvidence(input: {
  contractAddress: string;
  creatorAddress: string;
  collectorAddress: string;
  collectionMetadataUri: string;
  tokenMetadataUri: string;
  operationReceipts: OperationReceipt[];
  pollOptions?: { attempts?: number; delayMs?: number; userAgent?: string };
}): Promise<Record<string, unknown>> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const poll = (label: string, url: string, predicate: (json: any) => boolean) =>
    pollJson(label, url, predicate, input.pollOptions);
  const contract = await poll(
    "Penne UI-live TZIP-12 FA2 asset contract",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}`,
    (json) =>
      json?.address === input.contractAddress &&
      json?.kind === "asset" &&
      Array.isArray(json?.tzips) &&
      json.tzips.includes("fa2"),
  );
  const storage = await poll(
    "Penne UI-live indexed storage",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}/storage`,
    (json) =>
      Number(json?.next_token_id) === 1 &&
      json?.claim_active === false &&
      Number(json?.metadata) > 0 &&
      Number(json?.ledger) > 0 &&
      Number(json?.token_metadata) > 0 &&
      Number(json?.total_supply) > 0 &&
      Number(json?.allocations) > 0 &&
      Number(json?.claimed) > 0,
  );
  const collectionMetadata = await poll(
    "Penne UI-live exact collection metadata URI",
    `${base}/bigmaps/${storage.metadata}/keys?active=true&limit=20`,
    (json) => Array.isArray(json) && json.some((entry) =>
      String(entry?.key ?? "") === "" &&
      hexToUtf8(String(entry?.value || "")) === input.collectionMetadataUri),
  );
  const tokenMetadata = await poll(
    "Penne UI-live exact token metadata URI",
    `${base}/bigmaps/${storage.token_metadata}/keys?active=true&limit=20`,
    (json) => Array.isArray(json) && json.some((entry) =>
      Number(entry?.key) === 0 &&
      hexToUtf8(String(entry?.value?.token_info?.[""] || "")) === input.tokenMetadataUri),
  );
  const supplies = await poll(
    "Penne UI-live total supply",
    `${base}/bigmaps/${storage.total_supply}/keys?active=true&limit=20`,
    (json) => Array.isArray(json) && json.some((entry) =>
      Number(entry?.key) === 0 && Number(entry?.value) === COLLECTOR_ALLOCATION + CREATOR_ALLOCATION),
  );
  const ledger = await poll(
    "Penne UI-live creator and collector ledger",
    `${base}/bigmaps/${storage.ledger}/keys?active=true&limit=100`,
    (json) => Array.isArray(json) &&
      json.some((entry) =>
        entry?.key?.owner === input.collectorAddress &&
        Number(entry?.key?.token_id) === 0 &&
        Number(entry?.value) === COLLECTOR_ALLOCATION) &&
      json.some((entry) =>
        entry?.key?.owner === input.creatorAddress &&
        Number(entry?.key?.token_id) === 0 &&
        Number(entry?.value) === CREATOR_ALLOCATION),
  );
  const claimed = await poll(
    "Penne UI-live consumed claim amounts",
    `${base}/bigmaps/${storage.claimed}/keys?active=true&limit=100`,
    (json) => Array.isArray(json) &&
      json.some((entry) =>
        entry?.key?.owner === input.collectorAddress &&
        Number(entry?.key?.token_id) === 0 &&
        Number(entry?.value) === COLLECTOR_ALLOCATION) &&
      json.some((entry) =>
        entry?.key?.owner === input.creatorAddress &&
        Number(entry?.key?.token_id) === 0 &&
        Number(entry?.value) === CREATOR_ALLOCATION),
  );
  const allocations = await poll(
    "Penne UI-live consumed allocations",
    `${base}/bigmaps/${storage.allocations}/keys?active=true&limit=100`,
    (json) => Array.isArray(json) && !json.some((entry) =>
      Number(entry?.key?.token_id) === 0 &&
      [input.creatorAddress, input.collectorAddress].includes(String(entry?.key?.owner || ""))),
  );
  const indexedTokens = await poll(
    "Penne UI-live indexed FA2 token",
    `${base}/tokens?contract=${encodeURIComponent(input.contractAddress)}&tokenId=0&limit=10`,
    (json) => Array.isArray(json) && json.some((entry) =>
      entry?.contract?.address === input.contractAddress &&
      Number(entry?.tokenId) === 0 &&
      Number(entry?.totalSupply) === COLLECTOR_ALLOCATION + CREATOR_ALLOCATION),
  );
  const creatorBalances = await poll(
    "Penne UI-live indexed creator balance",
    `${base}/tokens/balances?account=${encodeURIComponent(input.creatorAddress)}&token.contract=${encodeURIComponent(input.contractAddress)}&token.tokenId=0&balance.ne=0&limit=10`,
    (json) => Array.isArray(json) && json.some((entry) =>
      entry?.account?.address === input.creatorAddress &&
      entry?.token?.contract?.address === input.contractAddress &&
      Number(entry?.token?.tokenId) === 0 &&
      Number(entry?.balance) === CREATOR_ALLOCATION),
  );
  const collectorBalances = await poll(
    "Penne UI-live indexed collector balance",
    `${base}/tokens/balances?account=${encodeURIComponent(input.collectorAddress)}&token.contract=${encodeURIComponent(input.contractAddress)}&token.tokenId=0&balance.ne=0&limit=10`,
    (json) => Array.isArray(json) && json.some((entry) =>
      entry?.account?.address === input.collectorAddress &&
      entry?.token?.contract?.address === input.contractAddress &&
      Number(entry?.token?.tokenId) === 0 &&
      Number(entry?.balance) === COLLECTOR_ALLOCATION),
  );

  const operations = [];
  for (const receipt of input.operationReceipts) {
    const family = receipt.action === "originate" ? "originations" : "transactions";
    const assertion: PastaUiLiveAppliedOperationAssertion = {
      action: receipt.action,
      operationHash: receipt.operationHash,
      contractAddress: receipt.contractAddress,
      entrypoints: receipt.entrypoints || [],
    };
    const indexed = await poll(
      `Penne UI-live ${family} ${receipt.operationHash}`,
      `${base}/operations/${family}/${encodeURIComponent(receipt.operationHash)}`,
      (json) => {
        try {
          assertPenneTzktOperationApplied({
            rows: json,
            assertion,
            signerAddress: receipt.signerAddress,
          });
          return true;
        } catch {
          return false;
        }
      },
    );
    const record = assertPenneTzktOperationApplied({
      rows: indexed,
      assertion,
      signerAddress: receipt.signerAddress,
    });
    const targetAddress = record?.target?.address || record?.originatedContract?.address;
    operations.push({
      hash: receipt.operationHash,
      status: record?.status,
      type: record?.type,
      sender: record?.sender?.address,
      target: targetAddress,
      entrypoint: record?.parameter?.entrypoint || null,
      level: record?.level,
    });
  }

  return {
    schema: "pastaprotocol-penne-tzkt-index@1",
    contract: {
      address: contract.address,
      kind: contract.kind,
      tzips: contract.tzips,
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
      claimActive: storage.claim_active,
      metadataBigMap: Number(storage.metadata),
      ledgerBigMap: Number(storage.ledger),
      tokenMetadataBigMap: Number(storage.token_metadata),
      totalSupplyBigMap: Number(storage.total_supply),
      allocationsBigMap: Number(storage.allocations),
      claimedBigMap: Number(storage.claimed),
    },
    collectionMetadata: collectionMetadata.map((entry: any) => ({ key: entry.key, value: entry.value })),
    tokenMetadata: tokenMetadata.map((entry: any) => ({ key: entry.key, value: entry.value })),
    supplies: supplies.map((entry: any) => ({ key: entry.key, value: entry.value })),
    ledger: ledger.map((entry: any) => ({ key: entry.key, value: entry.value })),
    claimed: claimed.map((entry: any) => ({ key: entry.key, value: entry.value })),
    activeAllocations: allocations.map((entry: any) => ({ key: entry.key, value: entry.value })),
    indexedTokens,
    creatorBalances,
    collectorBalances,
    operations,
  };
}

export async function runPenneUiLive(): Promise<PenneUiLiveResult> {
  assertPenneUiLiveExecutionAllowed(process.env);
  const runRoot = path.resolve(process.env[OUTPUT_ENV] || "");
  const { appRoot, runId, existing } = await requireFreshAppOutputDirectory(runRoot);
  const ipfs: IpfsProofConfig = resolveIpfsProofConfig();
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const environment = await signerEnv(rpc.rpcUrl);
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(environment);
  assert.notEqual(creator.address, collector.address, "Penne proof requires separate creator and collector signers");
  assert.equal(validateAddress(creator.address), ValidationResult.VALID);
  assert.equal(validateAddress(collector.address), ValidationResult.VALID);
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  await assertShadownet(creatorTezos, "Penne creator startup");
  await assertShadownet(collectorTezos, "Penne collector startup");

  const code = await readContractArtifact();
  const placeholderMetadataUri = "ipfs://bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
  let estimate: { suggestedFeeMutez: number | string; burnFeeMutez: number | string };
  try {
    estimate = await creatorTezos.estimate.originate({
      code,
      storage: buildOriginationStorage(creator.address, placeholderMetadataUri),
    } as never) as unknown as typeof estimate;
  } catch (error) {
    if (/subtraction_underflow|balance_too_low|cannot pay|insufficient balance/i.test(errorText(error))) {
      block("Penne UI-live creator is underfunded during the no-write origination estimate", [
        `Creator: \`${creator.address}\`.`,
        "The RPC simulation rejected the estimate for insufficient tez. No artifact or metadata was pinned and no chain write was attempted.",
      ]);
    }
    throw error;
  }
  const estimatedOriginationMutez = Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez);
  assert.ok(Number.isSafeInteger(estimatedOriginationMutez) && estimatedOriginationMutez >= 0);
  const requiredCreatorBalanceMutez = estimatedOriginationMutez + CREATOR_OPERATION_RESERVE_MUTEZ;
  const [creatorBalanceValue, collectorBalanceValue] = await Promise.all([
    creatorTezos.tz.getBalance(creator.address),
    collectorTezos.tz.getBalance(collector.address),
  ]);
  const creatorBalanceMutez = Number(creatorBalanceValue.toString());
  const collectorBalanceMutez = Number(collectorBalanceValue.toString());
  if (!Number.isSafeInteger(creatorBalanceMutez) || creatorBalanceMutez < requiredCreatorBalanceMutez) {
    block("Penne UI-live creator is underfunded before any pin or chain write", [
      `Creator \`${creator.address}\` has \`${creatorBalanceValue.toString()}\` mutez.`,
      `Estimated origination plus creator operation reserve requires at least \`${requiredCreatorBalanceMutez}\` mutez.`,
      "No proof artifact or metadata was pinned and no chain write was attempted.",
    ]);
  }
  if (!Number.isSafeInteger(collectorBalanceMutez) || collectorBalanceMutez < COLLECTOR_OPERATION_RESERVE_MUTEZ) {
    block("Penne UI-live collector is underfunded before any pin or chain write", [
      `Collector \`${collector.address}\` has \`${collectorBalanceValue.toString()}\` mutez.`,
      `The public claim lane requires at least \`${COLLECTOR_OPERATION_RESERVE_MUTEZ}\` mutez.`,
      "No proof artifact or metadata was pinned and no chain write was attempted.",
    ]);
  }

  await mkdir(path.join(appRoot, "artifacts"), { recursive: true });
  const expectedCodeHash = hashJsonForBridge(code);
  const restartJournal = await preparePenneRestartJournal({
    appRoot,
    runId,
    existing,
    creatorAddress: creator.address,
    collectorAddress: collector.address,
    creatorTezos,
    collectorTezos,
    code,
    ipfs,
  });
  let artifactPin = restartJournal.appliedPin("media")?.proof;
  if (artifactPin) {
    assert.deepEqual(
      restartJournal.appliedPin("media")?.bytes,
      Uint8Array.from(PROOF_ARTIFACT_BYTES),
      "Penne recovered media bytes differ",
    );
  } else {
    await restartJournal.beforePin("creator", {
      bytes: PROOF_ARTIFACT_BYTES,
      fileName: "penne-ui-live-proof.png",
      mimeType: "image/png",
    });
    artifactPin = await pinIpfsProofBytes({
      bytes: PROOF_ARTIFACT_BYTES,
      fileName: "penne-ui-live-proof.png",
      mimeType: "image/png",
      options: ipfs,
    });
    await restartJournal.onPin("creator", { proof: artifactPin });
  }
  const artifactRelativePath = "artifacts/penne-ui-live-proof.png";
  await writeFile(path.join(appRoot, artifactRelativePath), PROOF_ARTIFACT_BYTES);
  assert.equal(sha256(PROOF_ARTIFACT_BYTES), artifactPin.sha256);

  const pinnedMetadata: PinnedMetadataRecord[] = restartJournal.pinRecords().flatMap((record) =>
    record.value === undefined || record.proof.mimeType !== "application/json"
      ? []
      : [{ value: record.value, proof: record.proof }]);
  const completedCreatorCalls = restartJournal.appliedOperations().filter((operation) =>
    operation.step.actor === "creator" && operation.step.action === "call").length;
  const creatorCallValidator = createCreatorCallValidator(
    creator.address,
    collector.address,
    completedCreatorCalls,
  );
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: creatorTezos,
    signerAddress: creator.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    ...(restartJournal.contractAddress()
      ? { allowedContractAddresses: new Set([restartJournal.contractAddress()!]) }
      : {}),
    allowedEntrypoints: new Set(["create_token", "set_allocations", "open_claim", "airdrop"]),
    initialOperationSequence: restartJournal.completedOperationCount("creator"),
    assertExpectedChain: async (stage) => {
      await assertShadownet(creatorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    assertOperationApplied: (assertion) => verifyPenneTzktOperationApplied({
      assertion,
      signerAddress: creator.address,
    }),
    beforeOperationSubmit: async (operation) => {
      await restartJournal.beforeOperationSubmit("creator", operation);
      await assertPastaProofRestartCounterBoundary({
        signerAddress: creator.address,
        expectedCounter: restartJournal.expectedCurrentCounter("creator"),
        label: `Penne pre-submit creator operation ${operation.operationSequence}`,
      });
    },
    onOperationSubmitted: (operation) => restartJournal.onOperationSubmitted("creator", operation),
    onReceipt: (receipt) => restartJournal.onReceipt("creator", receipt),
    beforePin: (pin) => restartJournal.beforePin("creator", pin),
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    validateOrigination: (input) => validateBrowserOrigination(input, expectedCodeHash, creator.address),
    validateCall: creatorCallValidator.validate,
    onPin: async ({ value, proof }) => {
      await restartJournal.onPin("creator", { proof });
      if (value !== undefined) pinnedMetadata.push({ value, proof });
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
    handleAction: (request) => restartJournal.replayOrHandle("creator", request, () => creatorSession.handle(request)),
  });
  let collectorBridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>> | null = null;
  let collectorSession: TaquitoPastaUiLiveSession | null = null;
  let browser: Browser | null = null;
  let creatorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  let collectorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  const screenshots: CapturePastaProofStageResult[] = [];
  const startedAt = new Date().toISOString();
  let finalState: DistributionFinalState | null = null;
  try {
    browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
    const creatorContext = await createProofContext(browser);
    const packageValue = buildCheasePackage(artifactPin.uri, runId);
    await creatorContext.addInitScript({
      content: `sessionStorage.setItem(${JSON.stringify(HANDOFF_KEY)}, ${JSON.stringify(JSON.stringify(packageValue)).replace(/</g, "\\u003c")});`,
    });
    const creatorPage = await creatorContext.newPage();
    creatorMonitor = monitorPastaProofPage(creatorPage);
    const creatorUrl = `${creatorBridge.origin}/creation-tools/penne/index.html?handoff=chease-package&handoffKey=${encodeURIComponent(HANDOFF_KEY)}`;
    await creatorPage.goto(creatorUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await creatorPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(creatorPage, creatorBridge, "UI-LIVE");
    await configureCreatorStudio(creatorPage, ipfs.apiUrl, creator.address, collector.address);
    await waitForLog(creatorPage, "from CH-EASE handoff", 30_000);
    screenshots.push(await captureStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      1,
      "configure token and allocations",
      "configured",
      "from CH-EASE handoff",
      "#recipients",
      [
        { selector: "#sumCount", name: "allocation count", expectedText: "2" },
        { selector: "#tokArtifactStatus", name: "pre-pinned artifact", expectedText: artifactPin.uri },
      ],
    ));

    await creatorPage.click("#btnConnect");
    await waitForLog(creatorPage, `connected ${creator.address} on shadownet`);
    screenshots.push(await captureStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      2,
      "connect creator signer",
      "creator connected",
      `connected ${creator.address} on shadownet`,
      "#account",
      [{ selector: "#account", name: "creator account", expectedText: creator.address.slice(0, 7) }],
    ));

    await creatorPage.click("#btnDeploy");
    await waitForLog(creatorPage, "originating distribution contract");
    await creatorPage.waitForFunction(() => (window as any).__pastaUiLiveBridge?.pins?.length >= 2);
    screenshots.push(await captureStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      3,
      "pin collection and token metadata",
      "metadata pinned",
      "originating distribution contract",
    ));

    await waitForLog(creatorPage, "contract deployed:");
    screenshots.push(await captureStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      4,
      "originate distribution FA2",
      "contract originated",
      "contract deployed:",
    ));

    await waitForLog(creatorPage, "token id 0 registered");
    screenshots.push(await captureStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      5,
      "create claimable token",
      "token created",
      "token id 0 registered",
    ));

    await waitForLog(creatorPage, "done — 2 allocations live");
    screenshots.push(await captureStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      6,
      "configure collector and creator allocations",
      "allocations loaded",
      "done — 2 allocations live",
      "#log",
      [{ selector: "#sumTotal", name: "total allocated editions", expectedText: "3" }],
    ));

    const origination = restartJournal.operationReceipts().find((receipt) => receipt.action === "originate");
    assert.ok(origination?.contractAddress && origination.operationHash);
    const contractAddress = origination.contractAddress;
    assert.equal(await creatorPage.locator("#contractKt").inputValue(), contractAddress);

    await creatorPage.click("#btnOpenClaim");
    await waitForLog(creatorPage, "claim window OPEN");
    screenshots.push(await captureStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      7,
      "open public claim window",
      "claim opened",
      "claim window OPEN",
      "#btnOpenClaim",
    ));

    collectorSession = new TaquitoPastaUiLiveSession({
      tezos: collectorTezos,
      signerAddress: collector.address,
      expectedChainId: SHADOWNET_CHAIN_ID,
      allowedContractAddresses: new Set([contractAddress]),
      allowedEntrypoints: new Set(["claim"]),
      initialOperationSequence: restartJournal.completedOperationCount("collector"),
      assertExpectedChain: async (stage) => {
        await assertShadownet(collectorTezos, stage);
        return SHADOWNET_CHAIN_ID;
      },
      assertOperationApplied: (assertion) => verifyPenneTzktOperationApplied({
        assertion,
        signerAddress: collector.address,
      }),
      beforeOperationSubmit: async (operation) => {
        await restartJournal.beforeOperationSubmit("collector", operation);
        await assertPastaProofRestartCounterBoundary({
          signerAddress: collector.address,
          expectedCounter: restartJournal.expectedCurrentCounter("collector"),
          label: `Penne pre-submit collector operation ${operation.operationSequence}`,
        });
      },
      onOperationSubmitted: (operation) => restartJournal.onOperationSubmitted("collector", operation),
      onReceipt: (receipt) => restartJournal.onReceipt("collector", receipt),
      pinJson: async () => {
        throw new Error("collector claim session cannot pin metadata");
      },
      validateOrigination: () => {
        throw new Error("collector claim session cannot originate contracts");
      },
      validateCall: (input) => validateCollectorClaim(input, contractAddress),
    });
    collectorSession.authorizeAfterFundingPreflight({
      balanceMutez: collectorBalanceMutez,
      requiredBalanceMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
      estimatedOriginationMutez: 0,
      operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
    });
    collectorBridge = await startPastaUiLiveLoopbackServer({
      staticRoot: STATIC_ROOT,
      handleAction: (request) => restartJournal.replayOrHandle(
        "collector",
        request,
        () => collectorSession!.handle(request),
      ),
    });
    const collectorContext = await createProofContext(browser);
    const collectorPage = await collectorContext.newPage();
    collectorMonitor = monitorPastaProofPage(collectorPage);
    await collectorPage.goto(`${collectorBridge.origin}/creation-tools/penne/index.html`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await collectorPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(collectorPage, collectorBridge, "UI-LIVE");
    await collectorPage.selectOption("#network", "shadownet");
    await collectorPage.fill("#contractKt", contractAddress);
    await collectorPage.fill("#claimTokenId", "0");
    await collectorPage.click("#btnConnect");
    await waitForLog(collectorPage, `connected ${collector.address} on shadownet`);
    screenshots.push(await captureStage(
      collectorPage,
      collectorMonitor,
      runRoot,
      8,
      "connect separate collector signer",
      "collector connected",
      `connected ${collector.address} on shadownet`,
      "#account",
      [{ selector: "#account", name: "collector account", expectedText: collector.address.slice(0, 7) }],
    ));

    await collectorPage.click("#btnClaim");
    await waitForLog(collectorPage, "claimed ✓");
    screenshots.push(await captureStage(
      collectorPage,
      collectorMonitor,
      runRoot,
      9,
      "collector claims and mints allocation",
      "collector claimed",
      "claimed ✓",
      "#btnClaim",
    ));

    await creatorPage.fill("#recipients", `${creator.address}, ${CREATOR_ALLOCATION}`);
    await creatorPage.waitForFunction(() => document.getElementById("sumCount")?.textContent === "1");
    await creatorPage.click("#btnAirdrop");
    await waitForLog(creatorPage, "airdrop complete");
    screenshots.push(await captureStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      10,
      "creator airdrops and mints remaining allocation",
      "creator airdrop",
      "airdrop complete",
      "#btnAirdrop",
    ));

    await creatorPage.click("#btnCloseClaim");
    await waitForLog(creatorPage, "claim window closed");
    screenshots.push(await captureStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      11,
      "close completed claim window",
      "distribution complete",
      "claim window closed",
      "#btnCloseClaim",
    ));

    const creatorPublicState = await creatorPage.evaluate(() => {
      const bridgeState = (window as any).__pastaUiLiveBridge;
      return {
        classification: bridgeState?.classification,
        account: bridgeState?.getAccount?.(),
        receiptCount: bridgeState?.receipts?.length || 0,
        pinCount: bridgeState?.pins?.length || 0,
      };
    });
    assert.equal(creatorPublicState.classification, "UI-LIVE");
    assert.equal(creatorPublicState.account, creator.address);
    assert.equal(creatorPublicState.pinCount, 2);
    assert.ok(
      creatorPublicState.receiptCount >= restartJournal.completedOperationCount("creator") + 2,
      "Penne browser omitted replayed creator receipts",
    );
    const collectorPublicState = await collectorPage.evaluate(() => {
      const bridgeState = (window as any).__pastaUiLiveBridge;
      return {
        classification: bridgeState?.classification,
        account: bridgeState?.getAccount?.(),
        receiptCount: bridgeState?.receipts?.length || 0,
        pinCount: bridgeState?.pins?.length || 0,
      };
    });
    assert.equal(collectorPublicState.classification, "UI-LIVE");
    assert.equal(collectorPublicState.account, collector.address);
    assert.equal(collectorPublicState.pinCount, 0);
    assert.ok(
      collectorPublicState.receiptCount >= restartJournal.completedOperationCount("collector"),
      "Penne browser omitted replayed collector receipts",
    );
    creatorCallValidator.assertComplete();
    finalState = await readAndAssertFinalState(
      creatorTezos,
      contractAddress,
      creator.address,
      collector.address,
    );
  } finally {
    creatorMonitor?.dispose();
    collectorMonitor?.dispose();
    await browser?.close();
    await collectorBridge?.close();
    await creatorBridge.close();
  }

  assert.ok(collectorSession, "collector claim session was not created");
  assert.ok(finalState, "final Penne distribution state was not verified");
  const creatorReceipts = restartJournal.operationReceipts().filter(
    (receipt) => receipt.signerAddress === creator.address,
  );
  const collectorReceipts = restartJournal.operationReceipts().filter(
    (receipt) => receipt.signerAddress === collector.address,
  );
  await Promise.all([
    assertPastaProofRestartCounterBoundary({
      signerAddress: creator.address,
      expectedCounter: restartJournal.expectedCurrentCounter("creator"),
      label: "Penne terminal creator boundary",
    }),
    assertPastaProofRestartCounterBoundary({
      signerAddress: collector.address,
      expectedCounter: restartJournal.expectedCurrentCounter("collector"),
      label: "Penne terminal collector boundary",
    }),
  ]);
  const identifiers = validateReceiptIdentifiers(
    creatorReceipts,
    collectorReceipts,
    creator.address,
    collector.address,
  );
  assert.equal(pinnedMetadata.length, 2, "Penne must pin collection and token metadata through its actual UI");
  const metadataArtifacts = await writePinnedMetadataArtifacts(appRoot, pinnedMetadata);
  assert.equal(artifactPin.publicGatewayVerified, true, "Penne media lacks public-gateway verification");
  const mediaArtifact: WrittenPinnedArtifact = {
    id: "penne-token-0-media",
    kind: "token-media",
    path: artifactRelativePath,
    sha256: artifactPin.sha256,
    ipfsUri: artifactPin.uri,
    gatewayUrl: artifactPin.publicGatewayUrl,
    retrievedSha256: artifactPin.sha256,
  };
  const collectionMetadataArtifact = metadataArtifacts.find((artifact) => artifact.id === "penne-collection-metadata");
  const tokenMetadataArtifact = metadataArtifacts.find((artifact) => artifact.id === "penne-token-0-metadata");
  assert.ok(collectionMetadataArtifact, "Penne collection metadata artifact is missing");
  assert.ok(tokenMetadataArtifact, "Penne token metadata artifact is missing");
  const tokenMetadataRecord = pinnedMetadata.find((record) => record.proof.fileName === "token.json");
  assert.ok(tokenMetadataRecord?.value && typeof tokenMetadataRecord.value === "object");
  assert.equal(
    (tokenMetadataRecord.value as Record<string, unknown>).artifactUri,
    mediaArtifact.ipfsUri,
    "Penne token metadata does not bind the pinned media URI",
  );
  const tzktEvidence = await verifyPenneTzktEvidence({
    contractAddress: identifiers.contractAddress,
    creatorAddress: creator.address,
    collectorAddress: collector.address,
    collectionMetadataUri: collectionMetadataArtifact.ipfsUri,
    tokenMetadataUri: tokenMetadataArtifact.ipfsUri,
    operationReceipts: identifiers.operationReceipts,
  });
  const tzktBytes = deterministicJsonBytes(tzktEvidence);
  const tzktRelativePath = "artifacts/penne-ui-live-tzkt-index.json";
  await writeFile(path.join(appRoot, tzktRelativePath), tzktBytes);

  const operations = identifiers.operationReceipts.map((operationReceipt) => {
    const entrypoint = operationReceipt.entrypoints?.[0];
    const kind = operationReceipt.action === "originate"
      ? "origination"
      : entrypoint === "create_token"
        ? "create"
        : entrypoint === "set_allocations"
          ? "configure"
          : entrypoint === "claim" || entrypoint === "airdrop"
            ? "distribute"
            : "manage";
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
    id: "penne-token-0",
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
    id: "penne-restart-checkpoint",
    kind: "restart-checkpoint",
    path: RESTART_CHECKPOINT_PATH,
    sha256: sha256(restartCheckpointBytes),
  };
  const completedAt = new Date().toISOString();
  const receipt = {
    schema: "pastaprotocol-penne-ui-live-run@1",
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
      address: identifiers.contractAddress,
      explorerUrl: `https://shadownet.tzkt.io/${identifiers.contractAddress}`,
      tokenExplorerUrl: `https://shadownet.tzkt.io/${identifiers.contractAddress}/tokens/0`,
    },
    operations,
    token,
    bridgeReceipts: {
      creator: creatorReceipts,
      collector: collectorReceipts,
    },
    finalState,
    pins: [mediaArtifact, ...metadataArtifacts],
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
  const receiptRelativePath = "artifacts/penne-ui-live-run.json";
  const receiptPath = path.join(appRoot, receiptRelativePath);
  await writeFile(receiptPath, receiptBytes);

  const pinnedArtifacts = [mediaArtifact, ...metadataArtifacts];
  const localArtifacts = [
    ...screenshots.map((capture) => capture.manifestSidecarArtifact),
    restartCheckpointArtifact,
    {
      id: "penne-ui-live-tzkt-index",
      kind: "indexer-evidence",
      path: tzktRelativePath,
      sha256: sha256(tzktBytes),
    },
    {
      id: "penne-ui-live-run",
      kind: "proof-receipt",
      path: receiptRelativePath,
      sha256: sha256(receiptBytes),
    },
  ];
  const allArtifacts = [...pinnedArtifacts, ...localArtifacts];
  const creatorScreenshotStages = screenshots.slice(0, 7).map((capture) => capture.manifestScreenshot.stage);
  const distributionScreenshotStages = screenshots.slice(7).map((capture) => capture.manifestScreenshot.stage);
  const creatorSidecars = screenshots.slice(0, 7).map((capture) => capture.manifestSidecarArtifact.id);
  const distributionSidecars = screenshots.slice(7).map((capture) => capture.manifestSidecarArtifact.id);
  const creatorOperationHashes = operations.slice(0, 4).map((operation) => operation.hash);
  const distributionOperationHashes = operations.slice(4).map((operation) => operation.hash);
  const capabilities = [
    {
      id: "publish-distribution-token-and-allocations",
      description: "Use the actual Penne studio to import pinned media, originate a fresh distribution FA2, register token 0, load exact creator and collector allocations, and open its public claim window.",
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
      id: "independent-claim-and-admin-airdrop",
      description: "Use a separate collector signer through the actual Penne UI to claim and mint its allocation, use the creator UI to airdrop the remaining allocation and close claims, then independently verify every operation, metadata URI, supply, balance, claimed amount, consumed allocation, token, and closed window through TzKT.",
      evidence: {
        screenshots: distributionScreenshotStages,
        artifacts: [
          ...distributionSidecars,
          "penne-ui-live-tzkt-index",
          "penne-ui-live-run",
        ],
        contracts: [identifiers.contractAddress],
        operations: distributionOperationHashes,
        tokens: [token.id],
        roleEvidence: [],
        urls: [token.explorerUrl],
      },
    },
  ];
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "penne",
    role: "token-publisher",
    runId,
    capturedAt: completedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    capabilities,
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    artifacts: allArtifacts,
    contracts: [{
      address: identifiers.contractAddress,
      kind: "distribution-collection",
      explorerUrl: `https://shadownet.tzkt.io/${identifiers.contractAddress}`,
    }],
    operations,
    tokens: [token],
    roleEvidence: [],
  };
  const referenced = {
    screenshots: new Set(capabilities.flatMap((capability) => capability.evidence.screenshots)),
    artifacts: new Set(capabilities.flatMap((capability) => capability.evidence.artifacts)),
    contracts: new Set(capabilities.flatMap((capability) => capability.evidence.contracts)),
    operations: new Set(capabilities.flatMap((capability) => capability.evidence.operations)),
    tokens: new Set(capabilities.flatMap((capability) => capability.evidence.tokens)),
  };
  assert.deepEqual([...referenced.screenshots].sort(), screenshots.map((capture) => capture.manifestScreenshot.stage).sort());
  assert.deepEqual([...referenced.artifacts].sort(), allArtifacts.map((artifact) => artifact.id).sort());
  assert.deepEqual([...referenced.contracts], [identifiers.contractAddress]);
  assert.deepEqual([...referenced.operations], operations.map((operation) => operation.hash));
  assert.deepEqual([...referenced.tokens], [token.id]);
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
    await runPenneUiLive();
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
