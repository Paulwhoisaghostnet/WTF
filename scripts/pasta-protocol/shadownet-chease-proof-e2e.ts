#!/usr/bin/env tsx

import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  type CapturePastaProofStageResult,
} from "./pasta-proof-screenshot-kit";
import {
  ipfsGatewayUrl,
  pinIpfsProofBytes,
  probeRpcChainId,
  resolveIpfsProofConfig,
  root,
  sha256Hex,
} from "./shadownet-proof-kit";

const APP = "ch-ease";
const PROOF_SCHEMA = "pastaprotocol-app-proof@1";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWklEQVR42u3PQQ0AIBDAsAP/nuGNAvZoFSzYOjNnyNi2dwfgUQCeBeBZAB4F4FkAHgXgWQAeBeBZAB4F4FkAHgXgWQAeBeBZAB4F4FkAHgXgWQAeBeBZAB4F4FkAHgXgPQBHCQJ/3oQ2WQAAAABJRU5ErkJggg==",
  "base64",
);

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    }[extension] || "application/octet-stream"
  );
}

async function requestBytes(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function servePublicOrProxy(
  request: IncomingMessage,
  response: ServerResponse,
  kuboApiUrl: string,
): Promise<void> {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/ipfs-api/api/v0/add") {
    const upstream = new URL(`${kuboApiUrl.replace(/\/+$/, "")}/api/v0/add`);
    upstream.search = requestUrl.search;
    const body = await requestBytes(request);
    const result = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": request.headers["content-type"] || "application/octet-stream" },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    response.statusCode = result.status;
    response.setHeader("content-type", result.headers.get("content-type") || "application/json");
    response.end(Buffer.from(await result.arrayBuffer()));
    return;
  }

  const relative = requestUrl.pathname === "/" ? "creation-tools/ch-ease/index.html" : requestUrl.pathname.replace(/^\/+/, "");
  const publicRoot = path.join(root, "public");
  const filePath = path.resolve(publicRoot, relative);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`)) {
    response.statusCode = 400;
    response.end("bad path");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    response.statusCode = 200;
    response.setHeader("content-type", contentType(filePath));
    response.setHeader("cache-control", "no-store");
    response.end(await readFile(filePath));
  } catch {
    response.statusCode = 404;
    response.end("not found");
  }
}

async function startProofServer(kuboApiUrl: string) {
  const server = createServer((request, response) => {
    void servePublicOrProxy(request, response, kuboApiUrl).catch((error) => {
      response.statusCode = 502;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      server.close();
      await once(server, "close");
    },
  };
}

async function fetchPublicPin(url: string, expected: Uint8Array): Promise<void> {
  let last = "no response";
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        assert.equal(bytes.byteLength, expected.byteLength, "public gateway media byte length mismatch");
        assert.equal(sha256Hex(bytes), sha256Hex(expected), "public gateway media SHA-256 mismatch");
        return;
      }
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error(`CH-EASE media did not propagate to ${url}: ${last}`);
}

function proofRunId(): string {
  const configured = (process.env.PASTA_PROOF_RUN_ID || "").trim();
  if (configured) {
    assert.match(configured, /^[a-z0-9][a-z0-9._-]{0,127}$/);
    return configured;
  }
  return `pasta-proof-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase()}`;
}

function artifactRecord(
  id: string,
  kind: string,
  relativePath: string,
  bytes: Uint8Array,
  pin?: { uri: string; publicGatewayUrl: string; sha256: string },
) {
  return {
    id,
    kind,
    path: relativePath,
    sha256: sha256Hex(bytes),
    ...(pin
      ? { ipfsUri: pin.uri, gatewayUrl: pin.publicGatewayUrl, retrievedSha256: pin.sha256 }
      : {}),
  };
}

async function main(): Promise<void> {
  assert.equal(
    process.env.PASTA_SHADOWNET_E2E_EXECUTE,
    "1",
    "PASTA_SHADOWNET_E2E_EXECUTE=1 is required because this proof creates durable IPFS pins and browser evidence",
  );
  assert.notEqual((process.env.TEZOS_NETWORK || "shadownet").toLowerCase(), "mainnet");

  const rpc = await probeRpcChainId();
  const ipfs = resolveIpfsProofConfig();
  const runId = proofRunId();
  const outputRoot = path.resolve(
    process.env.PASTA_PROOF_RUN_DIR || path.join(root, "artifacts", "pasta-protocol-proof-runs", runId),
  );
  const appRoot = path.join(outputRoot, APP);
  const artifactsRoot = path.join(appRoot, "artifacts");
  await mkdir(artifactsRoot, { recursive: true });

  const server = await startProofServer(ipfs.apiUrl);
  const browser = await chromium.launch({ headless: process.env.PASTA_PROOF_HEADED !== "1" });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  const captures: CapturePastaProofStageResult[] = [];
  let handoffUrl = `${server.origin}/creation-tools/spaghetti/index.html`;
  try {
    await page.goto(`${server.origin}/creation-tools/ch-ease/index.html?network=shadownet`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("#title").fill(`CH-EASE proof ${runId}`);
    await page.locator("#symbol").fill("CHEESE");
    await page.locator("#description").fill("Role-correct CH-EASE preparation, durable media, export, and publisher handoff proof.");
    await page.locator("#target-app").selectOption("spaghetti");
    await page.locator("#media-files").setInputFiles({
      name: `chease-${runId}.png`,
      mimeType: "image/png",
      buffer: PNG,
    });
    await page.locator(".token-name").fill("CH-EASE Prepared Token");
    await page.locator(".token-description").fill("Prepared locally and handed to Spaghetti.");
    await page.locator(".tags").fill("ch-ease, shadownet, proof");
    captures.push(
      await capturePastaProofStage({
        page,
        monitor,
        outputRoot,
        app: APP,
        capability: "Prepare portable package",
        stageOrdinal: 1,
        stageName: "Media and metadata staged",
        classification: "UI-LIVE",
        requiredEvidence: [
          { selector: "h1", expectedText: "CH-EASE" },
          { selector: "#summary", expectedText: /1 item.*1 file.*0 durable.*spaghetti/i },
          { selector: ".file-name", expectedText: `chease-${runId}.png` },
        ],
        redactSelectors: ["#pinata-jwt"],
      }),
    );

    await page.locator("#pin-provider").selectOption("node");
    await page.locator("#node-url").fill(`${server.origin}/ipfs-api`);
    await page.locator("#pin-media").click();
    await page.locator("#status").filter({ hasText: /pinned.*ready for publisher handoff/i }).waitFor();
    const mediaUri = await page.locator(".artifact-uri").getAttribute("value");
    const resolvedMediaUri = mediaUri || (await page.locator(".artifact-uri").evaluate((element) => (element as HTMLInputElement).value));
    assert.match(resolvedMediaUri, /^ipfs:\/\/(?:Qm|b)/);
    const mediaCid = resolvedMediaUri.slice("ipfs://".length);
    const mediaGatewayUrl = ipfsGatewayUrl(ipfs.publicGatewayUrl, mediaCid);
    await fetchPublicPin(mediaGatewayUrl, PNG);
    captures.push(
      await capturePastaProofStage({
        page,
        monitor,
        outputRoot,
        app: APP,
        capability: "Pin prepared media",
        stageOrdinal: 2,
        stageName: "Media pinned and verified",
        classification: "UI-LIVE",
        requiredEvidence: [
          { selector: "#status", expectedText: /pinned.*ready for publisher handoff/i },
          { selector: "#summary", expectedText: /1 durable/i },
          { selector: ".item-note", expectedText: /durable URI ready/i },
        ],
        redactSelectors: ["#pinata-jwt"],
      }),
    );

    const packageDownloadPromise = page.waitForEvent("download");
    await page.locator("#download-json").click();
    const packageDownload = await packageDownloadPromise;
    const packagePath = path.join(artifactsRoot, "prepared-package.chease.json");
    await packageDownload.saveAs(packagePath);
    const packageBytes = await readFile(packagePath);
    const parsedPackage = JSON.parse(packageBytes.toString("utf8"));
    assert.equal(parsedPackage.schemaVersion, "wtfos.pasta.chease-package.v1");
    assert.equal(parsedPackage.items?.[0]?.artifactUri, resolvedMediaUri);
    const packagePin = await pinIpfsProofBytes({
      bytes: packageBytes,
      fileName: "prepared-package.chease.json",
      mimeType: "application/json",
      options: ipfs,
    });

    const archiveDownloadPromise = page.waitForEvent("download");
    await page.locator("#download-archive").click();
    const archiveDownload = await archiveDownloadPromise;
    const archivePath = path.join(artifactsRoot, "prepared-media.chease.zip");
    await archiveDownload.saveAs(archivePath);
    const archiveBytes = await readFile(archivePath);
    assert.ok(archiveBytes.byteLength > PNG.byteLength);
    captures.push(
      await capturePastaProofStage({
        page,
        monitor,
        outputRoot,
        app: APP,
        capability: "Export portable package",
        stageOrdinal: 3,
        stageName: "JSON and media archive exported",
        classification: "UI-LIVE",
        requiredEvidence: [
          { selector: "#status", expectedText: /media archive ZIP downloaded/i },
          { selector: "#summary", expectedText: /1 item.*1 file.*1 durable/i },
        ],
        redactSelectors: ["#pinata-jwt"],
      }),
    );

    const popupPromise = page.waitForEvent("popup");
    await page.locator("#open-publisher").click();
    const popup = await popupPromise;
    handoffUrl = popup.url();
    await page.locator("#status").filter({ hasText: /Package handed to spaghetti/i }).waitFor();
    await page.locator("#status").scrollIntoViewIfNeeded();
    captures.push(
      await capturePastaProofStage({
        page,
        monitor,
        outputRoot,
        app: APP,
        capability: "Handoff to publisher",
        stageOrdinal: 4,
        stageName: "Spaghetti handoff opened",
        classification: "UI-LIVE",
        requiredEvidence: [
          { selector: "#status", expectedText: /Package handed to spaghetti/i },
          { selector: "#target-app", expectedText: /Spaghetti/i },
        ],
        redactSelectors: ["#pinata-jwt"],
      }),
    );
    await popup.close();

    const mediaPath = path.join(artifactsRoot, "prepared-media.png");
    await writeFile(mediaPath, PNG);
    const screenshotArtifacts = captures.map((capture) => capture.manifestSidecarArtifact);
    const artifacts = [
      artifactRecord("prepared-package", "prepared-package", "artifacts/prepared-package.chease.json", packageBytes, packagePin),
      artifactRecord(
        "prepared-media",
        "prepared-media",
        "artifacts/prepared-media.png",
        PNG,
        { uri: resolvedMediaUri, publicGatewayUrl: mediaGatewayUrl, sha256: sha256Hex(PNG) },
      ),
      artifactRecord("prepared-archive", "prepared-archive", "artifacts/prepared-media.chease.zip", archiveBytes),
      ...screenshotArtifacts,
    ];
    const screenshotIds = screenshotArtifacts.map((artifact) => artifact.id);
    const manifest = {
      schema: PROOF_SCHEMA,
      app: APP,
      role: "preparation",
      runId,
      capturedAt: new Date().toISOString(),
      network: { name: "shadownet", chainId: rpc.chainId, rpcUrl: rpc.rpcUrl },
      screenshots: captures.map((capture) => capture.manifestScreenshot),
      artifacts,
      contracts: [],
      operations: [],
      tokens: [],
      roleEvidence: [
        { kind: "package-export", artifactId: "prepared-package", url: packagePin.publicGatewayUrl },
        { kind: "publisher-handoff", targetApp: "spaghetti", url: handoffUrl },
      ],
      capabilities: [
        {
          id: "prepare-pin-export-handoff",
          description: "Prepare media and metadata, pin the media, export portable JSON/ZIP artifacts, and hand the package to Spaghetti.",
          evidence: {
            screenshots: captures.map((capture) => capture.manifestScreenshot.stage),
            artifacts: ["prepared-package", "prepared-media", "prepared-archive", ...screenshotIds],
            contracts: [],
            operations: [],
            tokens: [],
            roleEvidence: ["package-export", "publisher-handoff"],
            urls: [packagePin.publicGatewayUrl, mediaGatewayUrl, handoffUrl],
          },
        },
      ],
    };
    await writeFile(path.join(appRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(
      JSON.stringify({
        app: APP,
        runId,
        outputRoot,
        manifest: path.join(appRoot, "manifest.json"),
        mediaCid,
        packageCid: packagePin.cid,
        screenshots: captures.length,
      }),
    );
  } finally {
    monitor.dispose();
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(`[pasta-shadownet-chease-proof] failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
