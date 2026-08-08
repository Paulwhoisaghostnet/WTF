import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);

const PRODUCTS = [
  { app: "pasta-suite", port: 30770 },
  { app: "macaroni", port: 30771 },
  { app: "spaghetti", port: 30772 },
  { app: "gnocchi", port: 30773 },
  { app: "ravioli", port: 30774 },
  { app: "rotini", port: 30775 },
  { app: "penne", port: 30776 },
  { app: "lasagna", port: 30777 },
  { app: "ch-ease", port: 30778 },
];

function appDirectory(app) {
  return path.resolve(`apps/${app}-desktop`);
}

function runtimePath(app) {
  return path.join(appDirectory(app), "src", "loopback-origin.cjs");
}

function mainPath(app) {
  return path.join(appDirectory(app), "src", "main.cjs");
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function createStorageServer() {
  return http.createServer((_req, res) => {
    const body = "<!doctype html><meta charset=utf-8><title>Pasta persistence proof</title><main>ready</main>";
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
}

async function unusedLoopbackPort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await closeServer(probe);
  return port;
}

test("every Pasta desktop shell declares a unique stable loopback origin and one-instance lifecycle", () => {
  const origins = new Set();
  const ports = new Set();
  let normalizedRuntimeSource = "";
  const discoveredApps = fs
    .readdirSync(path.resolve("apps"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith("-desktop"))
    .map((entry) => entry.name.replace(/-desktop$/, ""))
    .filter((app) => fs.existsSync(mainPath(app)))
    .sort();
  assert.deepEqual(
    discoveredApps,
    PRODUCTS.map((product) => product.app).sort(),
    "every packaged Pasta Electron shell must own a registered stable origin",
  );

  for (const product of PRODUCTS) {
    assert.ok(fs.existsSync(runtimePath(product.app)), `${product.app} should include its loopback runtime`);
    const runtime = require(runtimePath(product.app));
    const main = fs.readFileSync(mainPath(product.app), "utf8");
    const runtimeSource = fs
      .readFileSync(runtimePath(product.app), "utf8")
      .replace(/const LOOPBACK_PORT = \d+;/, "const LOOPBACK_PORT = PORT;");

    assert.equal(runtime.LOOPBACK_HOST, "127.0.0.1");
    assert.equal(runtime.LOOPBACK_PORT, product.port);
    assert.equal(runtime.LOOPBACK_ORIGIN, `http://127.0.0.1:${product.port}`);
    assert.equal(origins.has(runtime.LOOPBACK_ORIGIN), false, `${product.app} origin should be unique`);
    assert.equal(ports.has(runtime.LOOPBACK_PORT), false, `${product.app} port should be unique`);
    origins.add(runtime.LOOPBACK_ORIGIN);
    ports.add(runtime.LOOPBACK_PORT);
    if (!normalizedRuntimeSource) normalizedRuntimeSource = runtimeSource;
    else assert.equal(runtimeSource, normalizedRuntimeSource, `${product.app} should use the shared fail-closed runtime`);

    assert.match(main, /require\("\.\/loopback-origin\.cjs"\)/);
    assert.match(main, /app\.requestSingleInstanceLock\(\)/);
    assert.match(main, /app\.on\("second-instance"/);
    assert.match(main, /mainWindow\.focus\(\)/);
    assert.match(main, /listenOnStableOrigin\(nextServer,/);
    assert.doesNotMatch(main, /\.listen\(0,\s*"127\.0\.0\.1"/);
    assert.doesNotMatch(main, /address\.port/);
  }
});

test("the loopback runtime rejects an occupied port with explicit recovery-safe guidance", async () => {
  const runtime = require(runtimePath("pasta-suite"));
  const blocker = http.createServer();
  const port = await unusedLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const attempted = http.createServer();

  try {
    await new Promise((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
    });

    await assert.rejects(
      runtime.listenOnLoopback(attempted, {
        host: "127.0.0.1",
        port,
        origin,
        productName: "Pasta Test",
      }),
      (error) => {
        assert.equal(error.code, "PASTA_DESKTOP_ORIGIN_IN_USE");
        assert.match(error.message, /Pasta Test could not start/);
        assert.match(error.message, new RegExp(origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.match(error.message, /Close the other application or service using this address/);
        assert.match(error.message, /saved projects remain on this computer/);
        return true;
      },
    );
  } finally {
    await closeServer(attempted);
    await closeServer(blocker);
  }
});

test("localStorage remains reachable after the loopback server and browser profile relaunch", async () => {
  const runtime = require(runtimePath("pasta-suite"));
  const port = await unusedLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pasta-desktop-persistence-"));
  const storageKey = "pasta.desktop.relaunch-proof";
  const storageValue = "creator-workspace-survived";
  let server;
  let context;

  try {
    server = createStorageServer();
    await runtime.listenOnLoopback(server, {
      host: "127.0.0.1",
      port,
      origin,
      productName: "Pasta Persistence Test",
    });
    context = await chromium.launchPersistentContext(profileDir, { headless: true });
    let page = await context.newPage();
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [storageKey, storageValue]);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), storageValue);
    await context.close();
    context = undefined;
    await closeServer(server);
    server = undefined;

    server = createStorageServer();
    await runtime.listenOnLoopback(server, {
      host: "127.0.0.1",
      port,
      origin,
      productName: "Pasta Persistence Test",
    });
    context = await chromium.launchPersistentContext(profileDir, { headless: true });
    page = await context.newPage();
    await page.goto(origin, { waitUntil: "networkidle" });
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), storageValue);
  } finally {
    if (context) await context.close();
    if (server) await closeServer(server);
    await fsp.rm(profileDir, { recursive: true, force: true });
  }
});
