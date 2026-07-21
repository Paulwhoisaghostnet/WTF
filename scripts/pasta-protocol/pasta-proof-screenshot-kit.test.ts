import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_SCREENSHOT_SCHEMA,
  PASTA_PROOF_VIEWPORT,
  PastaProofScreenshotError,
  validateScreenshotPng,
  verifyScreenshotSidecar,
} from "./pasta-proof-screenshot-kit";

const FIXED_TIME = new Date("2026-07-18T19:20:21.000Z");
const SYNTHETIC_SECRET = `edsk${"A".repeat(52)}`;

type Fixture = {
  browser: Browser;
  page: Page;
  origin: string;
  outputRoot: string;
  close(): Promise<void>;
};

function styledPage(body: string, script = ""): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Pasta proof fixture</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; min-height: 100%; margin: 0; }
      body {
        color: #f8f1df;
        background: linear-gradient(135deg, #171a25 0%, #29213c 55%, #113c3b 100%);
        font: 18px/1.5 system-ui, sans-serif;
      }
      header { padding: 34px 56px 18px; border-bottom: 2px solid #f2b84b; }
      main { display: grid; grid-template-columns: 1.4fr 0.6fr; gap: 32px; padding: 56px; }
      .card { min-height: 360px; padding: 38px; border: 2px solid #85e0d1; border-radius: 22px; background: rgba(6, 12, 20, 0.72); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4); }
      .status { display: inline-block; padding: 10px 18px; color: #161213; background: #f2b84b; border-radius: 999px; font-weight: 800; }
      .credential-panel { min-height: 120px; padding: 24px; border: 1px solid #db5d88; border-radius: 16px; }
    </style>
  </head>
  <body>${body}<script>${script}</script></body>
</html>`;
}

async function createFixture(): Promise<Fixture> {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://fixture.invalid");
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (requestUrl.pathname === "/ok") {
      response.end(styledPage(`
        <header><h1 id="app-title">Spaghetti contract studio</h1></header>
        <main>
          <section class="card">
            <p class="status" data-proof-status>Token metadata pinned</p>
            <p>The collection is configured for a Shadownet origination.</p>
          </section>
          <aside class="credential-panel">
            <label>Signing material <input value="${SYNTHETIC_SECRET}"></label>
          </aside>
        </main>`));
      return;
    }
    if (requestUrl.pathname === "/hidden") {
      response.end(styledPage(`
        <header><h1 id="app-title">Visible proof surface</h1></header>
        <main>
          <section class="card"><p id="visible-proof" class="status">Export complete</p></section>
          <aside id="hidden-panel" style="display:none"><p id="hidden-proof">Contract in sync</p></aside>
        </main>`));
      return;
    }
    if (requestUrl.pathname === "/fatal") {
      response.end(styledPage(
        `<header><h1 id="app-title">Fatal stage</h1></header><main><section class="card">Broken</section></main>`,
        `console.error("synthetic fatal UI error")`,
      ));
      return;
    }
    if (requestUrl.pathname === "/secret") {
      response.end(styledPage(`
        <header><h1 id="app-title">Unsafe stage</h1></header>
        <main><section class="card"><p>${SYNTHETIC_SECRET}</p></section></main>`));
      return;
    }
    if (requestUrl.pathname === "/blank") {
      response.end(`<!doctype html><html><head><style>
        html, body { width: 100%; height: 100%; margin: 0; background: #fff; overflow: hidden; }
        #marker { position: absolute; width: 2px; height: 2px; overflow: hidden; color: #fff; opacity: .01; font-size: 1px; }
      </style></head><body><div id="marker">ready</div></body></html>`);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const outputRoot = await mkdtemp(path.join(tmpdir(), "pasta-screenshot-proof-"));
  return {
    browser,
    page,
    origin: `http://127.0.0.1:${address.port}`,
    outputRoot,
    async close(): Promise<void> {
      await browser.close();
      await closeServer(server);
      await rm(outputRoot, { recursive: true, force: true });
    },
  };
}

async function closeServer(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

test("captures a fixed-viewport PNG and redacted, hash-bound sidecar at deterministic paths", async () => {
  const fixture = await createFixture();
  const monitor = monitorPastaProofPage(fixture.page);
  try {
    await fixture.page.goto(`${fixture.origin}/ok?access_token=${encodeURIComponent(SYNTHETIC_SECRET)}&mode=proof`);
    const capture = await capturePastaProofStage({
      page: fixture.page,
      monitor,
      outputRoot: fixture.outputRoot,
      app: "Spaghetti",
      capability: "Create token",
      stageOrdinal: 1,
      stageName: "Configured",
      classification: "UI-LIVE",
      requiredEvidence: [
        { selector: "#app-title", name: "studio title", expectedText: "Spaghetti contract studio" },
        { selector: "[data-proof-status]", name: "pin status", expectedText: /metadata pinned/i },
        { selector: ".credential-panel", name: "masked signer boundary" },
      ],
      redactSelectors: [".credential-panel"],
      now: () => FIXED_TIME,
    });

    assert.equal(capture.filenameStem, "001-create-token-configured");
    assert.equal(capture.pngRelativePath, "screenshots/001-create-token-configured.png");
    assert.equal(capture.sidecarRelativePath, "artifacts/screenshot-001-create-token-configured.json");
    assert.equal(
      capture.pngPath,
      path.join(fixture.outputRoot, "spaghetti", "screenshots", "001-create-token-configured.png"),
    );
    assert.equal(
      capture.sidecarPath,
      path.join(fixture.outputRoot, "spaghetti", "artifacts", "screenshot-001-create-token-configured.json"),
    );

    const [pngBytes, sidecarText] = await Promise.all([
      readFile(capture.pngPath),
      readFile(capture.sidecarPath, "utf8"),
    ]);
    const sidecar = JSON.parse(sidecarText);
    assert.equal(sidecar.schema, PASTA_PROOF_SCREENSHOT_SCHEMA);
    assert.equal(sidecar.app, "spaghetti");
    assert.equal(sidecar.capability, "Create token");
    assert.equal(sidecar.stageOrdinal, 1);
    assert.equal(sidecar.stageName, "Configured");
    assert.equal(sidecar.timestampUtc, FIXED_TIME.toISOString());
    assert.deepEqual(sidecar.viewport, { width: 1440, height: 900, deviceScaleFactor: 1 });
    assert.equal(sidecar.sha256, digest(pngBytes));
    assert.equal(sidecar.byteCount, pngBytes.byteLength);
    assert.equal(sidecar.classification, "UI-LIVE");
    assert.match(sidecar.url, /access_token=REDACTED/);
    assert.doesNotMatch(sidecarText, new RegExp(SYNTHETIC_SECRET));
    assert.deepEqual(
      sidecar.domEvidence.map((entry: { selector: string; text: string }) => [entry.selector, entry.text]),
      [
        ["#app-title", "Spaghetti contract studio"],
        ["[data-proof-status]", "Token metadata pinned"],
        [".credential-panel", "REDACTED"],
      ],
    );
    assert.deepEqual(capture.manifestScreenshot, {
      stage: "001-create-token-configured",
      path: "screenshots/001-create-token-configured.png",
      sha256: digest(pngBytes),
      caption: "spaghetti: Create token — Configured",
    });
    assert.deepEqual(capture.manifestSidecarArtifact, {
      id: "screenshot-sidecar-001-create-token-configured",
      kind: "screenshot-sidecar",
      path: "artifacts/screenshot-001-create-token-configured.json",
      sha256: digest(Buffer.from(sidecarText)),
    });

    const verified = await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);
    assert.equal(verified.sha256, sidecar.sha256);

    const repeated = await capturePastaProofStage({
      page: fixture.page,
      monitor,
      outputRoot: fixture.outputRoot,
      app: "Spaghetti",
      capability: "Create token",
      stageOrdinal: 1,
      stageName: "Configured",
      classification: "UI-LIVE",
      requiredEvidence: [{ selector: "#app-title", expectedText: "Spaghetti contract studio" }],
      redactSelectors: [".credential-panel"],
      now: () => FIXED_TIME,
      waitForLoadState: "none",
    });
    assert.equal(repeated.pngPath, capture.pngPath);
    assert.equal(repeated.sidecarPath, capture.sidecarPath);
    assert.equal(repeated.sidecar.sha256, capture.sidecar.sha256);
  } finally {
    monitor.dispose();
    await fixture.close();
  }
});

test("fails closed when a required evidence selector is absent and writes nothing", async () => {
  const fixture = await createFixture();
  const monitor = monitorPastaProofPage(fixture.page);
  try {
    await fixture.page.goto(`${fixture.origin}/ok`);
    await assert.rejects(
      capturePastaProofStage({
        page: fixture.page,
        monitor,
        outputRoot: fixture.outputRoot,
        app: "gnocchi",
        capability: "edition policy",
        stageOrdinal: 2,
        stageName: "confirmed",
        classification: "UI-MOCK",
        requiredEvidence: [{ selector: "[data-never-rendered]" }],
      }),
      (error: unknown) => error instanceof PastaProofScreenshotError && /is absent/.test(error.message),
    );
    assert.equal(await pathExists(path.join(fixture.outputRoot, "gnocchi")), false);
  } finally {
    monitor.dispose();
    await fixture.close();
  }
});

test("fails closed when required evidence exists only in a hidden panel and writes nothing", async () => {
  const fixture = await createFixture();
  const monitor = monitorPastaProofPage(fixture.page);
  try {
    await fixture.page.goto(`${fixture.origin}/hidden`);
    await assert.rejects(
      capturePastaProofStage({
        page: fixture.page,
        monitor,
        outputRoot: fixture.outputRoot,
        app: "macaroni",
        capability: "sync and export",
        stageOrdinal: 12,
        stageName: "visible evidence only",
        classification: "UI-MOCK",
        requiredEvidence: [
          { selector: "#visible-proof", expectedText: "Export complete" },
          { selector: "#hidden-proof", expectedText: "Contract in sync" },
        ],
      }),
      (error: unknown) => error instanceof PastaProofScreenshotError && /present but not visible/.test(error.message),
    );
    assert.equal(await pathExists(path.join(fixture.outputRoot, "macaroni")), false);
  } finally {
    monitor.dispose();
    await fixture.close();
  }
});

test("fails closed on console errors observed from before navigation", async () => {
  const fixture = await createFixture();
  const monitor = monitorPastaProofPage(fixture.page);
  try {
    await fixture.page.goto(`${fixture.origin}/fatal`);
    await assert.rejects(
      capturePastaProofStage({
        page: fixture.page,
        monitor,
        outputRoot: fixture.outputRoot,
        app: "ravioli",
        capability: "open pack",
        stageOrdinal: 3,
        stageName: "delivered",
        classification: "UI-LIVE",
        requiredEvidence: [{ selector: "#app-title" }],
      }),
      (error: unknown) => error instanceof PastaProofScreenshotError && /console\.error: synthetic fatal UI error/.test(error.message),
    );
    assert.equal(await pathExists(path.join(fixture.outputRoot, "ravioli")), false);
  } finally {
    monitor.dispose();
    await fixture.close();
  }
});

test("fails closed before capture when rendered text contains probable signing material", async () => {
  const fixture = await createFixture();
  const monitor = monitorPastaProofPage(fixture.page);
  try {
    await fixture.page.goto(`${fixture.origin}/secret`);
    await assert.rejects(
      capturePastaProofStage({
        page: fixture.page,
        monitor,
        outputRoot: fixture.outputRoot,
        app: "rotini",
        capability: "finalize token",
        stageOrdinal: 4,
        stageName: "artifact ready",
        classification: "UI-LIVE",
        requiredEvidence: [{ selector: "#app-title" }],
      }),
      (error: unknown) => error instanceof PastaProofScreenshotError && /rendered page text contains probable/.test(error.message),
    );
    assert.equal(await pathExists(path.join(fixture.outputRoot, "rotini")), false);
  } finally {
    monitor.dispose();
    await fixture.close();
  }
});

test("rejects a visually blank screenshot even when its required marker exists", async () => {
  const fixture = await createFixture();
  const monitor = monitorPastaProofPage(fixture.page);
  try {
    await fixture.page.goto(`${fixture.origin}/blank`);
    await assert.rejects(
      capturePastaProofStage({
        page: fixture.page,
        monitor,
        outputRoot: fixture.outputRoot,
        app: "colander",
        capability: "manage contract",
        stageOrdinal: 1,
        stageName: "dashboard",
        classification: "UI-MOCK",
        requiredEvidence: [{ selector: "#marker", expectedText: "ready" }],
      }),
      (error: unknown) => error instanceof PastaProofScreenshotError && /too small|blank or visually empty/.test(error.message),
    );
    assert.equal(await pathExists(path.join(fixture.outputRoot, "colander")), false);
  } finally {
    monitor.dispose();
    await fixture.close();
  }
});

test("sidecar verifier rejects PNG tampering", async () => {
  const fixture = await createFixture();
  const monitor = monitorPastaProofPage(fixture.page);
  try {
    await fixture.page.goto(`${fixture.origin}/ok`);
    const capture = await capturePastaProofStage({
      page: fixture.page,
      monitor,
      outputRoot: fixture.outputRoot,
      app: "penne",
      capability: "claim allocation",
      stageOrdinal: 3,
      stageName: "claim confirmed",
      classification: "UI-MOCK",
      requiredEvidence: [{ selector: "#app-title" }],
      redactSelectors: [".credential-panel"],
      now: () => FIXED_TIME,
    });
    const pngBytes = await readFile(capture.pngPath);
    pngBytes[pngBytes.length - 1] ^= 1;
    await writeFile(capture.pngPath, pngBytes);
    await assert.rejects(
      verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath),
      (error: unknown) => error instanceof PastaProofScreenshotError && /SHA-256 does not match/.test(error.message),
    );
  } finally {
    monitor.dispose();
    await fixture.close();
  }
});

test("PNG validator rejects tiny image files independently of browser capture", () => {
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
    "base64",
  );
  assert.throws(
    () => validateScreenshotPng(onePixelPng),
    (error: unknown) => error instanceof PastaProofScreenshotError && /too small/.test(error.message),
  );
});
