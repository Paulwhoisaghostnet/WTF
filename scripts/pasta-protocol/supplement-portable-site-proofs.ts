#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { unzipSync } from "fflate";
import { chromium, type BrowserContext, type Page } from "playwright";

import {
  capturePastaProofStage,
  deterministicScreenshotStem,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  type CapturePastaProofStageResult,
} from "./pasta-proof-screenshot-kit";
import { startPastaUiLiveLoopbackServer } from "./pasta-ui-live-bridge-kit";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_ROOT = path.join(REPO_ROOT, "public");
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const EXECUTE_ENV = "PASTA_PORTABLE_SITE_PROOF_EXECUTE";
const SHADOWNET_CHAIN_ID = "NetXsqzbfFenSTS";
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const KT1 = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const CAPABILITY_ID = "portable-self-hosted-site";
const CAPABILITY_NAME = "portable self-hosted site";
const EXPORT_STAGE_ORDINAL = 901;
const PUBLIC_STAGE_ORDINAL = 902;
const EXPORT_STAGE_NAME = "actual studio export complete";
const PUBLIC_STAGE_NAME = "extracted page live independently";
const EXPORT_STAGE = deterministicScreenshotStem({
  capability: CAPABILITY_NAME,
  stageOrdinal: EXPORT_STAGE_ORDINAL,
  stageName: EXPORT_STAGE_NAME,
});
const PUBLIC_STAGE = deterministicScreenshotStem({
  capability: CAPABILITY_NAME,
  stageOrdinal: PUBLIC_STAGE_ORDINAL,
  stageName: PUBLIC_STAGE_NAME,
});
const FORBIDDEN_HOSTS = [
  /(^|\.)objkt\.com$/i,
  /(^|\.)objkt\.one$/i,
  /(^|\.)teia\.art$/i,
  /(^|\.)wtfos\.app$/i,
  /(^|\.)wtfos\.me$/i,
];
const SECRET_PATTERNS = [
  /\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{40,100}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
];

const BASE_SITE_FILES = [
  "css/site.css",
  "index.html",
  "js/common.js",
  "js/octez-wallet.js",
  "js/site.js",
  "pasta.config.js",
  "vendor/octez-connect.js",
  "vendor/tezos.js",
] as const;

export const PORTABLE_SITE_APPS = [
  "spaghetti",
  "gnocchi",
  "ravioli",
  "rotini",
  "penne",
  "lasagna",
] as const;

export type PortableSiteApp = (typeof PORTABLE_SITE_APPS)[number];

type JsonObject = Record<string, any>;

type PortableSiteAppDefinition = {
  label: string;
  contractKinds: readonly string[];
  studioPath: string;
  titleSelector: string;
  descriptionSelector: string;
  contractSelector: string;
  tokenSelector?: string;
  existingTargetControl?: string;
  relatedContractSelectors?: readonly string[];
};

export const PORTABLE_SITE_APP_DEFINITIONS: Record<PortableSiteApp, PortableSiteAppDefinition> = {
  spaghetti: {
    label: "Spaghetti",
    contractKinds: ["standard-collection"],
    studioPath: "/creation-tools/spaghetti/index.html",
    titleSelector: "#collName",
    descriptionSelector: "#collDesc",
    contractSelector: "#existingKt",
    tokenSelector: "#exportTokenId",
    existingTargetControl: 'input[name="target"][value="existing_contract"]',
  },
  gnocchi: {
    label: "Gnocchi",
    contractKinds: ["open-edition-collection"],
    studioPath: "/creation-tools/gnocchi/index.html",
    titleSelector: "#oeName",
    descriptionSelector: "#oeDesc",
    contractSelector: "#mintKt",
    tokenSelector: "#mintTokenId",
  },
  ravioli: {
    label: "Ravioli",
    contractKinds: ["atomic-pack-router"],
    studioPath: "/creation-tools/ravioli/index.html",
    titleSelector: "#bnName",
    descriptionSelector: "#bnDesc",
    contractSelector: "#opKt",
    tokenSelector: "#opTokenId",
  },
  rotini: {
    label: "Rotini",
    contractKinds: ["generative-collection"],
    studioPath: "/creation-tools/rotini/index.html",
    titleSelector: "#collName",
    descriptionSelector: "#collDesc",
    contractSelector: "#existingKt",
    tokenSelector: "#exportTokenId",
    existingTargetControl: 'input[name="target"][value="existing_contract"]',
    relatedContractSelectors: ["#mintKt"],
  },
  penne: {
    label: "Penne",
    contractKinds: ["distribution-collection"],
    studioPath: "/creation-tools/penne/index.html",
    titleSelector: "#tokName",
    descriptionSelector: "#tokDesc",
    contractSelector: "#contractKt",
    tokenSelector: "#claimTokenId",
  },
  lasagna: {
    label: "Lasagna",
    contractKinds: ["exhibition-registry"],
    studioPath: "/creation-tools/lasagna/index.html",
    titleSelector: "#exName",
    descriptionSelector: "#exDesc",
    contractSelector: "#contractKt",
  },
};

export type PortableSiteSubject = {
  app: PortableSiteApp;
  runId: string;
  title: string;
  description: string;
  contract: { address: string; kind: string; explorerUrl: string };
  token: null | {
    id: string;
    tokenId: string;
    contractAddress: string;
    explorerUrl: string;
  };
};

export type PortableSiteArchiveEntry = {
  path: string;
  bytes: number;
  sha256: string;
};

export type ValidatedPortableSiteArchive = {
  files: Record<string, Uint8Array>;
  entries: PortableSiteArchiveEntry[];
  config: {
    app: PortableSiteApp;
    label: string;
    title: string;
    description: string;
    contract: string;
    tokenId: number;
    network: "shadownet";
  };
  sha256: string;
};

export type PortableSiteRuntimeObservation = {
  appLabel: string;
  contract: string;
  itemId: string;
  status: string;
  chainState: string;
  localRequestedPaths: string[];
  remoteOrigins: string[];
  forbiddenRemoteHosts: string[];
};

export type PortableSiteSupplementHooks = {
  beforeIndependentNavigation?(context: BrowserContext): Promise<void>;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stable(child)]),
  );
}

function deterministicJsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(stable(value), null, 2)}\n`, "utf8");
}

function isPortableSiteApp(value: string): value is PortableSiteApp {
  return (PORTABLE_SITE_APPS as readonly string[]).includes(value);
}

function requiredSiteFiles(app: PortableSiteApp): string[] {
  return [
    ...BASE_SITE_FILES,
    ...(app === "rotini" ? ["js/rotini-artifact.js", "js/rotini-mint.js"] : []),
  ].sort();
}

function assertNoSecretBytes(bytes: Uint8Array, label: string): void {
  const text = Buffer.from(bytes).toString("utf8");
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    assert.doesNotMatch(text, pattern, `${label} contains probable signing material or credentials`);
  }
}

function parsePortableConfig(bytes: Uint8Array): JsonObject {
  const text = Buffer.from(bytes).toString("utf8").trim();
  const match = text.match(/^window\.PASTA_SITE_CONFIG\s*=\s*([\s\S]+);$/);
  assert.ok(match, "pasta.config.js must assign one JSON object to window.PASTA_SITE_CONFIG");
  const parsed = JSON.parse(match[1]);
  assert.ok(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  return parsed;
}

export function validatePortableSiteArchive(
  bytes: Uint8Array,
  subject: PortableSiteSubject,
): ValidatedPortableSiteArchive {
  assert.ok(bytes.byteLength > 100_000, `${subject.app} portable site archive is unexpectedly small`);
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString("ascii"), "PK", "portable site is not a ZIP");
  assertNoSecretBytes(bytes, `${subject.app} portable site archive`);
  const files = unzipSync(bytes);
  const names = Object.keys(files).sort();
  assert.deepEqual(names, requiredSiteFiles(subject.app), `${subject.app} portable site file set drifted`);
  for (const name of names) {
    assert.ok(!path.posix.isAbsolute(name), `portable site contains absolute path ${name}`);
    assert.ok(!name.includes("\\") && !name.includes("\0"), `portable site contains unsafe path ${name}`);
    assert.ok(!name.split("/").includes(".."), `portable site contains traversal path ${name}`);
    assert.ok(files[name].byteLength > 0, `portable site entry ${name} is empty`);
    assertNoSecretBytes(files[name], `${subject.app} portable site entry ${name}`);
  }
  const rawConfig = parsePortableConfig(files["pasta.config.js"]);
  const expectedTokenId = Number(subject.token?.tokenId || 0);
  assert.ok(Number.isSafeInteger(expectedTokenId) && expectedTokenId >= 0, "portable site token id is invalid");
  assert.deepEqual(rawConfig, {
    app: subject.app,
    label: PORTABLE_SITE_APP_DEFINITIONS[subject.app].label,
    title: subject.title,
    description: subject.description,
    contract: subject.contract.address,
    tokenId: expectedTokenId,
    network: "shadownet",
  });
  const indexText = Buffer.from(files["index.html"]).toString("utf8");
  for (const asset of [
    "css/site.css",
    "vendor/tezos.js",
    "vendor/octez-connect.js",
    "js/octez-wallet.js",
    "js/common.js",
    "pasta.config.js",
    "js/site.js",
  ]) {
    assert.match(indexText, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `index.html does not load ${asset}`);
  }
  const siteScript = Buffer.from(files["js/site.js"]).toString("utf8");
  if (subject.app === "rotini") {
    assert.match(siteScript, /js\/rotini-artifact\.js/);
    assert.match(siteScript, /js\/rotini-mint\.js/);
  }
  return {
    files,
    entries: names.map((name) => ({
      path: name,
      bytes: files[name].byteLength,
      sha256: sha256(files[name]),
    })),
    config: rawConfig as ValidatedPortableSiteArchive["config"],
    sha256: sha256(bytes),
  };
}

export async function extractPortableSiteArchive(
  validated: ValidatedPortableSiteArchive,
  destination: string,
): Promise<void> {
  await mkdir(destination, { recursive: true });
  const destinationRoot = path.resolve(destination);
  for (const [name, bytes] of Object.entries(validated.files)) {
    const output = path.resolve(destinationRoot, ...name.split("/"));
    assert.ok(output.startsWith(`${destinationRoot}${path.sep}`), `unsafe extraction path ${name}`);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes);
  }
}

export function selectPortableSiteSubject(manifest: JsonObject, app: PortableSiteApp): PortableSiteSubject {
  assert.equal(manifest.schema, "pastaprotocol-app-proof@1");
  assert.equal(manifest.app, app);
  assert.equal(manifest.network?.name, "shadownet");
  assert.equal(manifest.network?.chainId, SHADOWNET_CHAIN_ID);
  assert.ok(typeof manifest.runId === "string" && SAFE_RUN_ID.test(manifest.runId));
  const definition = PORTABLE_SITE_APP_DEFINITIONS[app];
  const contract = (manifest.contracts || []).find((entry: JsonObject) =>
    definition.contractKinds.includes(String(entry.kind)),
  );
  assert.ok(contract, `${app} manifest lacks its portable-site contract kind (${definition.contractKinds.join(", ")})`);
  assert.match(contract.address, KT1);
  const token = app === "lasagna"
    ? null
    : (manifest.tokens || []).find((entry: JsonObject) => entry.contractAddress === contract.address);
  if (app !== "lasagna") {
    assert.ok(token, `${app} manifest lacks a token/project owned by ${contract.address}`);
    assert.ok(SAFE_ID.test(String(token.id)), `${app} token evidence id is unsafe`);
    assert.ok(/^\d+$/.test(String(token.tokenId)), `${app} token/project id is not a natural number`);
  }
  return {
    app,
    runId: manifest.runId,
    title: `${definition.label} portable Shadownet proof · ${manifest.runId}`,
    description: `Exported from the actual ${definition.label} Studio and served from the extracted standalone ZIP without Objkt, Teia, or wtfOS.`,
    contract: {
      address: contract.address,
      kind: contract.kind,
      explorerUrl: contract.explorerUrl,
    },
    token: token
      ? {
          id: token.id,
          tokenId: String(token.tokenId),
          contractAddress: token.contractAddress,
          explorerUrl: token.explorerUrl,
        }
      : null,
  };
}

async function configureActualStudio(page: Page, subject: PortableSiteSubject): Promise<void> {
  const definition = PORTABLE_SITE_APP_DEFINITIONS[subject.app];
  await page.selectOption("#network", "shadownet");
  await page.locator(definition.titleSelector).fill(subject.title, { force: true });
  await page.locator(definition.descriptionSelector).fill(subject.description, { force: true });
  if (definition.existingTargetControl) await page.check(definition.existingTargetControl);
  await page.locator(definition.contractSelector).fill(subject.contract.address);
  for (const selector of definition.relatedContractSelectors || []) {
    await page.locator(selector).fill(subject.contract.address);
  }
  if (definition.tokenSelector) {
    await page.locator(definition.tokenSelector).fill(subject.token?.tokenId || "0", { force: true });
  }
  assert.equal(await page.inputValue("#network"), "shadownet");
  assert.equal(await page.inputValue(definition.titleSelector), subject.title);
  assert.equal(await page.inputValue(definition.descriptionSelector), subject.description);
  assert.equal(await page.inputValue(definition.contractSelector), subject.contract.address);
  for (const selector of definition.relatedContractSelectors || []) {
    assert.equal(await page.inputValue(selector), subject.contract.address);
  }
  if (definition.tokenSelector) {
    assert.equal(await page.inputValue(definition.tokenSelector), subject.token?.tokenId || "0");
  }
}

async function waitForIndependentPage(page: Page, subject: PortableSiteSubject): Promise<void> {
  await page.waitForFunction(
    ({ contract, label }) =>
      document.getElementById("status")?.textContent?.includes("On-chain state loaded.") &&
      document.getElementById("contract")?.textContent?.trim() === contract &&
      document.getElementById("appLabel")?.textContent?.includes(label),
    { contract: subject.contract.address, label: PORTABLE_SITE_APP_DEFINITIONS[subject.app].label },
    { timeout: 120_000 },
  );
  assert.equal(await page.getAttribute("#status", "data-error"), "false");
}

function summarizeRuntimeRequests(
  requestUrls: string[],
  origin: string,
): Pick<PortableSiteRuntimeObservation, "localRequestedPaths" | "remoteOrigins" | "forbiddenRemoteHosts"> {
  const localRequestedPaths = new Set<string>();
  const remoteOrigins = new Set<string>();
  const forbiddenRemoteHosts = new Set<string>();
  for (const rawUrl of requestUrls) {
    const url = new URL(rawUrl);
    if (url.origin === origin) {
      localRequestedPaths.add(url.pathname.replace(/^\//, ""));
      continue;
    }
    remoteOrigins.add(url.origin);
    if (FORBIDDEN_HOSTS.some((pattern) => pattern.test(url.hostname))) forbiddenRemoteHosts.add(url.hostname);
  }
  return {
    localRequestedPaths: [...localRequestedPaths].filter(Boolean).sort(),
    remoteOrigins: [...remoteOrigins].sort(),
    forbiddenRemoteHosts: [...forbiddenRemoteHosts].sort(),
  };
}

async function readRuntimeObservation(
  page: Page,
  requestUrls: string[],
  origin: string,
): Promise<PortableSiteRuntimeObservation> {
  const text = async (selector: string) => String(await page.textContent(selector) || "").replace(/\s+/g, " ").trim();
  return {
    appLabel: await text("#appLabel"),
    contract: await text("#contract"),
    itemId: await text("#itemId"),
    status: await text("#status"),
    chainState: await text("#chainState"),
    ...summarizeRuntimeRequests(requestUrls, origin),
  };
}

function portableArtifactIds(app: PortableSiteApp): {
  zip: string;
  report: string;
  sidecars: string[];
} {
  return {
    zip: `${app}-portable-self-hosted-site`,
    report: `${app}-portable-self-hosted-site-proof`,
    sidecars: [
      `screenshot-sidecar-${EXPORT_STAGE}`,
      `screenshot-sidecar-${PUBLIC_STAGE}`,
    ],
  };
}

export function upsertPortableSiteManifestEvidence(input: {
  manifest: JsonObject;
  subject: PortableSiteSubject;
  zipArtifact: JsonObject;
  reportArtifact: JsonObject;
  captures: CapturePastaProofStageResult[];
}): JsonObject {
  assert.equal(input.captures.length, 2, "portable-site proof requires Studio and extracted-page screenshots");
  const ids = portableArtifactIds(input.subject.app);
  const priorStages = new Set([EXPORT_STAGE, PUBLIC_STAGE]);
  const priorArtifactIds = new Set([ids.zip, ids.report, ...ids.sidecars]);
  const screenshots = [
    ...(input.manifest.screenshots || []).filter((entry: JsonObject) => !priorStages.has(entry.stage)),
    ...input.captures.map((capture) => capture.manifestScreenshot),
  ];
  const artifacts = [
    ...(input.manifest.artifacts || []).filter((entry: JsonObject) => !priorArtifactIds.has(entry.id)),
    input.zipArtifact,
    input.reportArtifact,
    ...input.captures.map((capture) => capture.manifestSidecarArtifact),
  ];
  const capability = {
    id: CAPABILITY_ID,
    description: `Use the actual ${PORTABLE_SITE_APP_DEFINITIONS[input.subject.app].label} Studio to export the same-run Shadownet ${input.subject.token ? "contract/token" : "contract/revision"} as a dependency-complete ZIP, validate every packaged byte and config value, extract it, and load its on-chain state from an ordinary static loopback host with no Objkt, Teia, or wtfOS dependency.`,
    evidence: {
      screenshots: input.captures.map((capture) => capture.manifestScreenshot.stage),
      artifacts: [
        input.zipArtifact.id,
        input.reportArtifact.id,
        ...input.captures.map((capture) => capture.manifestSidecarArtifact.id),
      ],
      contracts: [input.subject.contract.address],
      operations: [],
      roleEvidence: input.subject.app === "lasagna" ? ["exhibition-publication"] : [],
      tokens: input.subject.token ? [input.subject.token.id] : [],
      urls: [input.subject.token?.explorerUrl || input.subject.contract.explorerUrl],
    },
  };
  return {
    ...input.manifest,
    screenshots,
    artifacts,
    capabilities: [
      ...(input.manifest.capabilities || []).filter((entry: JsonObject) => entry.id !== CAPABILITY_ID),
      capability,
    ],
  };
}

async function loadAssembler(): Promise<{
  validateAppManifest(runRoot: string, app: string): Promise<unknown>;
}> {
  return import(pathToFileURL(path.join(REPO_ROOT, "scripts/pasta-protocol/assemble-proof-package.mjs")).href) as Promise<{
    validateAppManifest(runRoot: string, app: string): Promise<unknown>;
  }>;
}

async function writePrunedManifest(tempAppRoot: string, manifest: JsonObject, app: PortableSiteApp): Promise<JsonObject> {
  const ids = portableArtifactIds(app);
  const stages = new Set([EXPORT_STAGE, PUBLIC_STAGE]);
  const artifactIds = new Set([ids.zip, ids.report, ...ids.sidecars]);
  const pruned = {
    ...manifest,
    screenshots: (manifest.screenshots || []).filter((entry: JsonObject) => !stages.has(entry.stage)),
    artifacts: (manifest.artifacts || []).filter((entry: JsonObject) => !artifactIds.has(entry.id)),
    capabilities: (manifest.capabilities || []).filter((entry: JsonObject) => entry.id !== CAPABILITY_ID),
  };
  await Promise.all([
    rm(path.join(tempAppRoot, "screenshots", `${EXPORT_STAGE}.png`), { force: true }),
    rm(path.join(tempAppRoot, "screenshots", `${PUBLIC_STAGE}.png`), { force: true }),
    rm(path.join(tempAppRoot, "artifacts", `screenshot-${EXPORT_STAGE}.json`), { force: true }),
    rm(path.join(tempAppRoot, "artifacts", `screenshot-${PUBLIC_STAGE}.json`), { force: true }),
    rm(path.join(tempAppRoot, "artifacts", `${app}-portable-self-hosted-site.zip`), { force: true }),
    rm(path.join(tempAppRoot, "artifacts", `${app}-portable-self-hosted-site-proof.json`), { force: true }),
  ]);
  await writeFile(path.join(tempAppRoot, "manifest.json"), deterministicJsonBytes(pruned));
  return pruned;
}

async function atomicReplaceDirectory(
  source: string,
  target: string,
  verify: () => Promise<void>,
): Promise<void> {
  const backup = `${target}.portable-site-backup-${process.pid}`;
  await rm(backup, { recursive: true, force: true });
  await rename(target, backup);
  try {
    await rename(source, target);
  } catch (error) {
    await rename(backup, target);
    throw error;
  }
  try {
    await verify();
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    await rename(backup, target);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

export async function supplementPortableSiteProof(
  runRootInput: string,
  app: PortableSiteApp,
  hooks: PortableSiteSupplementHooks = {},
): Promise<{ app: PortableSiteApp; manifestPath: string; archiveSha256: string; screenshotStages: string[] }> {
  const runRoot = path.resolve(runRootInput);
  const runStat = await stat(runRoot);
  assert.ok(runStat.isDirectory(), `proof run root is not a directory: ${runRoot}`);
  const runId = path.basename(runRoot);
  assert.match(runId, SAFE_RUN_ID);
  const appRoot = path.join(runRoot, app);
  const assembler = await loadAssembler();
  await assembler.validateAppManifest(runRoot, app);
  const originalManifest = JSON.parse(await readFile(path.join(appRoot, "manifest.json"), "utf8"));
  const subject = selectPortableSiteSubject(originalManifest, app);

  const stagingParent = await mkdtemp(path.join(path.dirname(runRoot), `.portable-site-${app}-`));
  try {
  const stagingRunRoot = path.join(stagingParent, runId);
  const stagingAppRoot = path.join(stagingRunRoot, app);
  const extractionRoot = path.join(stagingParent, "extracted-site");
  await mkdir(stagingRunRoot, { recursive: true });
  await cp(appRoot, stagingAppRoot, { recursive: true, errorOnExist: true });
  const baseManifest = await writePrunedManifest(stagingAppRoot, originalManifest, app);

  const captures: CapturePastaProofStageResult[] = [];
  let archive: ValidatedPortableSiteArchive | null = null;
  let runtime: PortableSiteRuntimeObservation | null = null;
  let bridgeActionCount = 0;
  let completedBrowserPhase = false;
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  try {
    const studioServer = await startPastaUiLiveLoopbackServer({
      staticRoot: PUBLIC_ROOT,
      handleAction: async () => {
        bridgeActionCount += 1;
        throw new Error("portable-site supplement forbids signer bridge actions");
      },
    });
    try {
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
      try {
        await page.goto(`${studioServer.origin}${PORTABLE_SITE_APP_DEFINITIONS[app].studioPath}`, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        await page.waitForFunction(() => Boolean((window as any).MD && document.getElementById("btnExportSite")));
        await configureActualStudio(page, subject);
        const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
        await page.click("#btnExportSite");
        const download = await downloadPromise;
        assert.equal(download.suggestedFilename(), `${app}-site.zip`);
        const zipRelativePath = `artifacts/${app}-portable-self-hosted-site.zip`;
        const zipPath = path.join(stagingAppRoot, zipRelativePath);
        await download.saveAs(zipPath);
        await page.waitForFunction(
          () => document.getElementById("exportSiteStatus")?.textContent?.includes("Downloaded site zip"),
          undefined,
          { timeout: 30_000 },
        );
        const archiveBytes = await readFile(zipPath);
        archive = validatePortableSiteArchive(archiveBytes, subject);
        await page.locator("#btnExportSite").scrollIntoViewIfNeeded();
        captures.push(await capturePastaProofStage({
          page,
          monitor,
          outputRoot: stagingRunRoot,
          app,
          capability: CAPABILITY_NAME,
          stageOrdinal: EXPORT_STAGE_ORDINAL,
          stageName: EXPORT_STAGE_NAME,
          classification: "UI-LIVE",
          requiredEvidence: [
            { selector: "#btnExportSite", name: "actual Studio export control", expectedText: /Download/ },
            { selector: "#exportSiteStatus", name: "portable ZIP result", expectedText: "Downloaded site zip" },
          ],
          waitForLoadState: "none",
          timeoutMs: 30_000,
        }));
      } finally {
        monitor.dispose();
        await context.close();
      }
    } finally {
      await studioServer.close();
    }

    assert.ok(archive);
    await extractPortableSiteArchive(archive, extractionRoot);
    const independentServer = await startPastaUiLiveLoopbackServer({
      staticRoot: extractionRoot,
      handleAction: async () => {
        bridgeActionCount += 1;
        throw new Error("extracted portable page may not call the signer bridge");
      },
    });
    try {
      const context = await browser.newContext({
        viewport: PASTA_PROOF_VIEWPORT,
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "UTC",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      await hooks.beforeIndependentNavigation?.(context);
      const page = await context.newPage();
      const requestUrls: string[] = [];
      page.on("request", (request) => requestUrls.push(request.url()));
      const monitor = monitorPastaProofPage(page);
      try {
        await page.goto(`${independentServer.origin}/index.html`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await waitForIndependentPage(page, subject);
        runtime = await readRuntimeObservation(page, requestUrls, independentServer.origin);
        assert.deepEqual(runtime.forbiddenRemoteHosts, [], "portable page contacted a forbidden marketplace/platform host");
        assert.equal(runtime.contract, subject.contract.address);
        if (app === "lasagna") assert.match(runtime.itemId, /^\d+$/, "Lasagna did not render its current revision id");
        else assert.equal(runtime.itemId, String(subject.token?.tokenId || 0));
        assert.equal(runtime.status, "On-chain state loaded.");
        const requiredRuntimePaths = requiredSiteFiles(app).filter((name) => name !== "index.html");
        for (const requiredPath of requiredRuntimePaths) {
          assert.ok(runtime.localRequestedPaths.includes(requiredPath), `extracted page did not load ${requiredPath}`);
        }
        const archivePaths = new Set(archive.entries.map((entry) => entry.path));
        for (const requestedPath of runtime.localRequestedPaths) {
          if (requestedPath === "api/auth/user" || requestedPath === "favicon.ico") continue;
          assert.ok(archivePaths.has(requestedPath), `extracted page reached outside its archive for ${requestedPath}`);
        }
        // Keep the explicit successful chain-load status in the screenshot.
        // Tall artwork and wrapped proof titles can otherwise leave the status
        // below the viewport even when its DOM evidence is valid.
        await page.locator("#status").scrollIntoViewIfNeeded();
        captures.push(await capturePastaProofStage({
          page,
          monitor,
          outputRoot: stagingRunRoot,
          app,
          capability: CAPABILITY_NAME,
          stageOrdinal: PUBLIC_STAGE_ORDINAL,
          stageName: PUBLIC_STAGE_NAME,
          classification: "UI-LIVE",
          requiredEvidence: [
            { selector: "#appLabel", name: "standalone Pasta application", expectedText: PORTABLE_SITE_APP_DEFINITIONS[app].label },
            { selector: "#contract", name: "same-run Shadownet contract", expectedText: subject.contract.address },
            { selector: "#itemId", name: "same-run token project or revision", expectedText: app === "lasagna" ? /^\d+$/ : String(subject.token?.tokenId || 0) },
            { selector: "#status", name: "independent chain load", expectedText: "On-chain state loaded." },
          ],
          waitForLoadState: "none",
          timeoutMs: 30_000,
        }));
      } finally {
        monitor.dispose();
        await context.close();
      }
    } finally {
      await independentServer.close();
    }
    completedBrowserPhase = true;
  } finally {
    await browser.close();
    if (!completedBrowserPhase) await rm(stagingParent, { recursive: true, force: true });
  }

  try {
    assert.ok(archive && runtime);
    assert.equal(bridgeActionCount, 0, "portable site supplement unexpectedly attempted a signer action");
    const ids = portableArtifactIds(app);
    const zipRelativePath = `artifacts/${app}-portable-self-hosted-site.zip`;
    const reportRelativePath = `artifacts/${app}-portable-self-hosted-site-proof.json`;
    const report = {
      schema: "pastaprotocol-portable-site-proof@1",
      classification: "UI-LIVE",
      app,
      runId,
      network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
      subject: {
        contract: subject.contract,
        token: subject.token,
      },
      studio: {
        path: PORTABLE_SITE_APP_DEFINITIONS[app].studioPath,
        exportControl: "#btnExportSite",
        downloadedFileName: `${app}-site.zip`,
      },
      archive: {
        path: zipRelativePath,
        sha256: archive.sha256,
        entries: archive.entries,
        config: archive.config,
      },
      independentRuntime: {
        servedFromExtractedArchive: true,
        reusedStudioOrigin: false,
        sourceApplicationFilesRequested: false,
        objktRequests: 0,
        teiaRequests: 0,
        wtfosRequests: 0,
        signerBridgeActions: bridgeActionCount,
        ...runtime,
      },
      screenshots: captures.map((capture) => capture.manifestScreenshot.stage),
    };
    const reportBytes = deterministicJsonBytes(report);
    await writeFile(path.join(stagingAppRoot, reportRelativePath), reportBytes);
    const zipArtifact = {
      id: ids.zip,
      kind: "self-hosted-site-package",
      path: zipRelativePath,
      sha256: archive.sha256,
    };
    const reportArtifact = {
      id: ids.report,
      kind: "self-hosted-site-proof",
      path: reportRelativePath,
      sha256: sha256(reportBytes),
    };
    const supplemented = upsertPortableSiteManifestEvidence({
      manifest: baseManifest,
      subject,
      zipArtifact,
      reportArtifact,
      captures,
    });
    await writeFile(path.join(stagingAppRoot, "manifest.json"), deterministicJsonBytes(supplemented));
    await assembler.validateAppManifest(stagingRunRoot, app);
    await atomicReplaceDirectory(stagingAppRoot, appRoot, async () => {
      await assembler.validateAppManifest(runRoot, app);
    });
    return {
      app,
      manifestPath: path.join(appRoot, "manifest.json"),
      archiveSha256: archive.sha256,
      screenshotStages: captures.map((capture) => capture.manifestScreenshot.stage),
    };
  } finally {
    await rm(stagingParent, { recursive: true, force: true });
  }
  } catch (error) {
    await rm(stagingParent, { recursive: true, force: true });
    throw error;
  }
}

export function assertPortableSiteSupplementExecutionAllowed(environment: NodeJS.ProcessEnv): string {
  assert.equal(environment[EXECUTE_ENV], "1", `${EXECUTE_ENV}=1 is required to amend accepted proof manifests`);
  assert.equal((environment.TEZOS_NETWORK || "shadownet").toLowerCase(), "shadownet", "portable-site proof only permits Shadownet");
  const runRoot = environment[OUTPUT_ENV]?.trim();
  assert.ok(runRoot, `${OUTPUT_ENV} must point to the aggregate proof run`);
  return runRoot;
}

async function main(): Promise<void> {
  try {
    const runRoot = assertPortableSiteSupplementExecutionAllowed(process.env);
    const rawApps = process.argv.slice(2);
    assert.ok(rawApps.length > 0, `usage: ${EXECUTE_ENV}=1 ${OUTPUT_ENV}=<run> npx tsx ${path.relative(REPO_ROOT, fileURLToPath(import.meta.url))} <app> [app ...]`);
    const apps: readonly string[] = rawApps.includes("--all-ready")
      ? PORTABLE_SITE_APPS
      : rawApps;
    const selected: PortableSiteApp[] = [];
    for (const rawApp of apps) {
      assert.ok(isPortableSiteApp(rawApp), `unsupported portable-site proof app: ${rawApp}`);
      if (rawApps.includes("--all-ready")) {
        try {
          await stat(path.join(runRoot, rawApp, "manifest.json"));
        } catch {
          continue;
        }
      }
      selected.push(rawApp);
    }
    assert.ok(selected.length > 0, "no ready portable-site app manifests were found");
    const results = [];
    for (const app of selected) results.push(await supplementPortableSiteProof(runRoot, app));
    process.stdout.write(`${JSON.stringify({ status: "PASSED", chainWrites: 0, results }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
