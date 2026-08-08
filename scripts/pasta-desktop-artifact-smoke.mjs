#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { _electron as electron } from "playwright";

const ALPHA_VERSION = "1.0.1-alpha.1";
const PROVENANCE_SCHEMA = "wtfos.pasta.desktop-build-provenance.v1";
const PERSISTENCE_KEY = "pasta.desktop.packaged-artifact-smoke.v1";
const PERSISTENCE_VALUE = "stable-origin-relaunch-confirmed";
const EXPECTED_DESKTOP_STUB_RESPONSES = Object.freeze([
  { method: "GET", pathname: "/api/auth/user", status: 401 },
  { method: "GET", pathname: "/api/profile/social", status: 404 },
]);

const publisherAssets = {
  spaghetti: [
    "/index.html",
    "/site.html",
    "/js/site-bundle.js",
    "/contract/pasta-standard-collection.contract.json",
  ],
  gnocchi: [
    "/index.html",
    "/site.html",
    "/js/site-bundle.js",
    "/contract/pasta-open-edition.contract.json",
  ],
  ravioli: [
    "/index.html",
    "/site.html",
    "/js/site-bundle.js",
    "/js/rotini-artifact.js",
    "/js/rotini-mint.js",
    "/contract/pasta-bundle.contract.json",
    "/contract/pasta-blind-pack-controller.contract.json",
    "/contract/pasta-ravioli-deployment-certificate.json",
    "/contract/pasta-gnocchi-pack-adapter.contract.json",
    "/contract/pasta-rotini-pack-adapter.contract.json",
  ],
  rotini: [
    "/index.html",
    "/site.html",
    "/js/site-bundle.js",
    "/js/rotini-artifact.js",
    "/js/rotini-mint.js",
    "/contract/pasta-generative-collection.contract.json",
  ],
  penne: [
    "/index.html",
    "/site.html",
    "/js/site-bundle.js",
    "/contract/pasta-distribution.contract.json",
  ],
  lasagna: [
    "/index.html",
    "/site.html",
    "/js/site-bundle.js",
    "/contract/pasta-exhibition.contract.json",
  ],
};

const bundledTools = [
  { id: "ch-ease", title: /CH-EASE/i, entryPath: "/creation-tools/ch-ease/index.html" },
  { id: "macaroni", title: /Macaroni Studio/i, entryPath: "/creation-tools/macaroni/studio.html" },
  { id: "spaghetti", title: /Spaghetti/i, entryPath: "/creation-tools/spaghetti/index.html" },
  { id: "gnocchi", title: /Gnocchi/i, entryPath: "/creation-tools/gnocchi/index.html" },
  { id: "ravioli", title: /Ravioli/i, entryPath: "/creation-tools/ravioli/index.html" },
  { id: "rotini", title: /Rotini/i, entryPath: "/creation-tools/rotini/index.html" },
  { id: "penne", title: /Penne/i, entryPath: "/creation-tools/penne/index.html" },
  { id: "lasagna", title: /Lasagna/i, entryPath: "/creation-tools/lasagna/index.html" },
];

function prefixedAssets(prefix, paths) {
  return paths.map((assetPath) => `${prefix}${assetPath}`);
}

const suiteAssetPaths = [
  "/suite-manifest.json",
  "/creation-tools/ch-ease/index.html",
  "/creation-tools/ch-ease/vendor/jszip.min.js",
  "/creation-tools/macaroni/studio.html",
  "/creation-tools/macaroni/drop.html",
  "/creation-tools/macaroni/contract/mydrop.contract.json",
  ...Object.entries(publisherAssets).flatMap(([app, paths]) =>
    prefixedAssets(`/creation-tools/${app}`, paths),
  ),
];

const chEaseAssetPaths = [
  "/creation-tools/ch-ease/index.html",
  "/creation-tools/ch-ease/vendor/jszip.min.js",
  ...Object.entries(publisherAssets).flatMap(([app, paths]) =>
    prefixedAssets(`/creation-tools/${app}`, paths),
  ),
];

export const PRODUCT_KEYS = [
  "pasta-suite",
  "macaroni",
  "spaghetti",
  "gnocchi",
  "ravioli",
  "rotini",
  "penne",
  "lasagna",
  "ch-ease",
];

export const PRODUCTS = Object.freeze({
  "pasta-suite": {
    key: "pasta-suite",
    packageName: "@wtf/pasta-suite-desktop",
    version: ALPHA_VERSION,
    origin: "http://127.0.0.1:30770",
    entryPath: "/",
    title: /Pasta Suite/i,
    assetPaths: suiteAssetPaths,
    bundledTools,
  },
  macaroni: {
    key: "macaroni",
    packageName: "@wtf/macaroni-desktop",
    version: ALPHA_VERSION,
    origin: "http://127.0.0.1:30771",
    entryPath: "/studio.html",
    title: /Macaroni Studio/i,
    assetPaths: [
      "/studio.html",
      "/drop.html",
      "/js/studio.js",
      "/js/site-bundle.js",
      "/contract/mydrop.contract.json",
    ],
  },
  spaghetti: {
    key: "spaghetti",
    packageName: "@wtf/spaghetti-desktop",
    version: ALPHA_VERSION,
    origin: "http://127.0.0.1:30772",
    entryPath: "/",
    title: /Spaghetti/i,
    assetPaths: publisherAssets.spaghetti,
  },
  gnocchi: {
    key: "gnocchi",
    packageName: "@wtf/gnocchi-desktop",
    version: ALPHA_VERSION,
    origin: "http://127.0.0.1:30773",
    entryPath: "/",
    title: /Gnocchi/i,
    assetPaths: publisherAssets.gnocchi,
  },
  ravioli: {
    key: "ravioli",
    packageName: "@wtf/ravioli-desktop",
    version: ALPHA_VERSION,
    origin: "http://127.0.0.1:30774",
    entryPath: "/",
    title: /Ravioli/i,
    assetPaths: publisherAssets.ravioli,
  },
  rotini: {
    key: "rotini",
    packageName: "@wtf/rotini-desktop",
    version: ALPHA_VERSION,
    origin: "http://127.0.0.1:30775",
    entryPath: "/",
    title: /Rotini/i,
    assetPaths: publisherAssets.rotini,
  },
  penne: {
    key: "penne",
    packageName: "@wtf/penne-desktop",
    version: ALPHA_VERSION,
    origin: "http://127.0.0.1:30776",
    entryPath: "/",
    title: /Penne/i,
    assetPaths: publisherAssets.penne,
  },
  lasagna: {
    key: "lasagna",
    packageName: "@wtf/lasagna-desktop",
    version: ALPHA_VERSION,
    origin: "http://127.0.0.1:30777",
    entryPath: "/",
    title: /Lasagna/i,
    assetPaths: publisherAssets.lasagna,
  },
  "ch-ease": {
    key: "ch-ease",
    packageName: "@wtf/ch-ease-desktop",
    version: ALPHA_VERSION,
    origin: "http://127.0.0.1:30778",
    entryPath: "/creation-tools/ch-ease/index.html",
    title: /CH-EASE/i,
    assetPaths: chEaseAssetPaths,
  },
});

function flag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function expectedTargetString(target) {
  return `${target.platform}/${target.arch}/${target.format}`;
}

export function validateBuildProvenance(manifest, product, options = {}) {
  assert.ok(manifest && typeof manifest === "object", "packaged build provenance must be an object");
  assert.equal(manifest.schema, PROVENANCE_SCHEMA, "packaged build provenance schema should match");
  assert.equal(manifest.app, product.packageName, "packaged build provenance app should match");
  assert.equal(manifest.version, product.version, "packaged build provenance version should match");
  assert.match(manifest.gitSha || "", /^[0-9a-f]{40}$/i, "packaged build provenance must contain an exact 40-character Git SHA");
  if (options.expectedGitSha) {
    assert.match(
      options.expectedGitSha,
      /^[0-9a-f]{40}$/i,
      "artifact smoke workflow source revision must be a 40-character Git SHA",
    );
    assert.equal(
      manifest.gitSha.toLowerCase(),
      options.expectedGitSha.toLowerCase(),
      "packaged build provenance must match the workflow source revision",
    );
  }
  assert.equal(
    manifest.sourceRevision,
    manifest.dirty ? `${manifest.gitSha}-dirty` : manifest.gitSha,
    "packaged build provenance sourceRevision should identify the exact tree state",
  );
  assert.equal(typeof manifest.dirty, "boolean", "packaged build provenance dirty marker should be boolean");
  if (!options.allowDirty) {
    assert.equal(manifest.dirty, false, "packaged artifact provenance must be clean");
  }
  assert.ok(manifest.target && typeof manifest.target === "object", "packaged build provenance target should be present");
  for (const field of ["platform", "arch", "format"]) {
    assert.match(String(manifest.target[field] || ""), /^[a-z0-9+._-]+$/i, `packaged target ${field} should be explicit`);
  }
  if (options.expectedTarget) {
    assert.equal(
      expectedTargetString(manifest.target),
      options.expectedTarget,
      "packaged build provenance target should match the artifact under smoke",
    );
  }
  return manifest;
}

export function isExpectedDesktopStubResponse(responseUrl, status, method, expectedOrigin) {
  let url;
  try {
    url = new URL(responseUrl);
  } catch (_) {
    return false;
  }
  if (url.origin !== expectedOrigin) return false;
  return EXPECTED_DESKTOP_STUB_RESPONSES.some(
    (expected) =>
      expected.method === String(method || "").toUpperCase() &&
      expected.pathname === url.pathname &&
      expected.status === status,
  );
}

async function readBuildProvenance(electronApp) {
  return electronApp.evaluate(({ app }) => {
    const fs = process.getBuiltinModule("fs");
    const path = process.getBuiltinModule("path");
    const manifestPath = path.join(app.getAppPath(), "provenance", "build-provenance.json");
    return {
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    };
  });
}

function captureRuntimeErrors(page, runtimeErrors, label, expectedOrigin) {
  const observedRequests = new WeakSet();
  const expectedStubResponses = new WeakSet();
  page.on("request", (request) => observedRequests.add(request));
  page.on("pageerror", (error) => runtimeErrors.push(`${label} page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("Failed to load resource:")) return;
    runtimeErrors.push(`${label} console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!observedRequests.has(request) || expectedStubResponses.has(request)) return;
    runtimeErrors.push(
      `${label} request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText || "unknown error"})`,
    );
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    if (
      isExpectedDesktopStubResponse(
        response.url(),
        response.status(),
        request.method(),
        expectedOrigin,
      )
    ) {
      expectedStubResponses.add(request);
      return;
    }
    runtimeErrors.push(
      `${label} HTTP ${response.status()}: ${request.method()} ${response.url()}`,
    );
  });
}

async function reloadWithRuntimeObservation(page, runtimeErrors, label, expectedOrigin) {
  await page.waitForLoadState("domcontentloaded");
  captureRuntimeErrors(page, runtimeErrors, label, expectedOrigin);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.readyState === "complete");
}

async function assertProductPage(page, product) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForURL((url) => url.origin === product.origin && url.pathname === product.entryPath);
  const loadedUrl = new URL(page.url());
  assert.equal(loadedUrl.origin, product.origin, "packaged app should own its stable loopback origin");
  assert.equal(loadedUrl.pathname, product.entryPath, "packaged app should load its registered entry page");
  assert.match(await page.title(), product.title, "packaged app title should identify the selected product");
}

async function assertPackagedAssets(page, assetPaths) {
  const results = await page.evaluate(async (paths) => {
    return Promise.all(
      paths.map(async (assetPath) => {
        try {
          const response = await fetch(assetPath, { cache: "no-store" });
          const bytes = await response.arrayBuffer();
          return {
            assetPath,
            ok: response.ok,
            status: response.status,
            bytes: bytes.byteLength,
            contentType: response.headers.get("content-type") || "",
          };
        } catch (error) {
          return {
            assetPath,
            ok: false,
            status: 0,
            bytes: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }, assetPaths);

  for (const result of results) {
    assert.equal(
      result.ok,
      true,
      `${result.assetPath} should load from the packaged app (${result.status || result.error || "unknown error"})`,
    );
    assert.ok(result.bytes > 0, `${result.assetPath} should contain packaged bytes`);
  }
  return results;
}

async function exerciseSuite(electronApp, page, runtimeErrors) {
  assert.equal(await page.locator(".tool-card").count(), bundledTools.length, "suite should expose all eight tools");
  assert.equal(await page.locator("#project-network").inputValue(), "shadownet");
  assert.equal(await page.locator("#contract-network").inputValue(), "shadownet");

  await page.locator("#project-title").fill("Installer artifact proof");
  await page.locator("#project-tool").selectOption("ch-ease");
  await page.locator("#create-project").click();
  await page.locator("#project-list").getByText("Installer artifact proof", { exact: true }).waitFor();

  for (const tool of bundledTools) {
    const popupPromise = electronApp.waitForEvent("window", { timeout: 15_000 });
    await page.locator(`.tool-card[data-tool="${tool.id}"] button`).click();
    const popup = await popupPromise;
    await reloadWithRuntimeObservation(
      popup,
      runtimeErrors,
      `suite ${tool.id}`,
      PRODUCTS["pasta-suite"].origin,
    );
    const popupUrl = new URL(popup.url());
    assert.equal(popupUrl.origin, PRODUCTS["pasta-suite"].origin);
    assert.equal(popupUrl.pathname, tool.entryPath);
    assert.match(await popup.title(), tool.title);
    await popup.close();
  }
}

async function launchArtifact(executablePath, profilePath) {
  return electron.launch({
    executablePath,
    args: [`--user-data-dir=${profilePath}`],
  });
}

export async function runArtifactSmoke({
  appKey,
  executablePath,
  screenshotPath,
  resultPath,
  expectedTarget,
  expectedGitSha,
  allowDirtyProvenance = false,
}) {
  const product = PRODUCTS[appKey];
  assert.ok(product, `Unknown Pasta desktop app "${appKey}". Expected one of: ${PRODUCT_KEYS.join(", ")}`);
  assert.ok(executablePath, "Set PASTA_DESKTOP_EXECUTABLE to the packaged Pasta executable");
  await access(executablePath);

  const profilePath = path.join(os.tmpdir(), `pasta-${appKey}-artifact-smoke-${process.pid}`);
  await rm(profilePath, { recursive: true, force: true });
  const runtimeErrors = [];
  let electronApp;

  try {
    electronApp = await launchArtifact(executablePath, profilePath);
    let page = await electronApp.firstWindow();
    await reloadWithRuntimeObservation(
      page,
      runtimeErrors,
      `${appKey} first launch`,
      product.origin,
    );
    await assertProductPage(page, product);
    const assetResults = await assertPackagedAssets(page, product.assetPaths);
    const provenanceResult = await readBuildProvenance(electronApp);
    assert.equal(provenanceResult.isPackaged, true, "artifact smoke must launch a packaged Electron application");
    const provenance = validateBuildProvenance(provenanceResult.manifest, product, {
      allowDirty: allowDirtyProvenance,
      expectedTarget,
      expectedGitSha,
    });

    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [PERSISTENCE_KEY, PERSISTENCE_VALUE],
    );
    if (appKey === "pasta-suite") {
      await exerciseSuite(electronApp, page, runtimeErrors);
    }
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });

    await electronApp.close();
    electronApp = undefined;

    electronApp = await launchArtifact(executablePath, profilePath);
    page = await electronApp.firstWindow();
    await reloadWithRuntimeObservation(
      page,
      runtimeErrors,
      `${appKey} relaunch`,
      product.origin,
    );
    await assertProductPage(page, product);
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), PERSISTENCE_KEY),
      PERSISTENCE_VALUE,
      "packaged app should recover localStorage from its stable origin after relaunch",
    );
    if (appKey === "pasta-suite") {
      await page.locator("#project-list").getByText("Installer artifact proof", { exact: true }).waitFor();
    }

    assert.deepEqual(runtimeErrors, [], runtimeErrors.join("\n"));
    const result = {
      ok: true,
      app: appKey,
      executablePath,
      origin: product.origin,
      title: await page.title(),
      assetsVerified: assetResults.length,
      stableOriginRelaunch: true,
      bundledToolsOpened: product.bundledTools?.length || 0,
      provenance,
      screenshotPath: screenshotPath || null,
    };
    if (resultPath) {
      const absoluteResultPath = path.resolve(resultPath);
      await mkdir(path.dirname(absoluteResultPath), { recursive: true });
      await writeFile(absoluteResultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify(result));
    return result;
  } finally {
    if (electronApp) await electronApp.close();
    await rm(profilePath, { recursive: true, force: true });
  }
}

async function main() {
  await runArtifactSmoke({
    appKey: String(process.env.PASTA_DESKTOP_APP || "").trim(),
    executablePath: process.env.PASTA_DESKTOP_EXECUTABLE,
    screenshotPath: process.env.PASTA_DESKTOP_SCREENSHOT,
    resultPath: process.env.PASTA_DESKTOP_RESULT_PATH,
    expectedTarget: process.env.PASTA_DESKTOP_EXPECTED_TARGET,
    expectedGitSha: process.env.PASTA_DESKTOP_EXPECTED_GIT_SHA,
    allowDirtyProvenance: flag(process.env.PASTA_DESKTOP_ALLOW_DIRTY_PROVENANCE),
  });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
