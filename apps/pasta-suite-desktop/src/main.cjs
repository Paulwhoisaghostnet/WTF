"use strict";

const { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { installStoredSite, listStoredSites, removeStoredSite, resolveHostedSitePath } = require("./site-archive.cjs");
const { resolveStaticPath } = require("./static-path.cjs");
const { listenOnStableOrigin } = require("./loopback-origin.cjs");

const PRODUCT_NAME = "Pasta Suite";
const COMPANION_SETUP_IPC_CHANNEL = "macaroni:companion-setup";
const COMPANION_STUDIO_PATH = "/creation-tools/macaroni/studio.html";

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".tz": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

let server;
let baseUrl = "";
let mainWindow;
let companionAdapter;

function appRoot() {
  return app.getAppPath();
}

function pastaRoot() {
  return path.join(appRoot(), "pasta");
}

function macaroniRoot() {
  return path.join(pastaRoot(), "creation-tools", "macaroni");
}

function companionRoot() {
  return path.join(appRoot(), "companion", "macaroni-v35");
}

function companionSetupRoot() {
  return path.join(app.getPath("documents"), "Pasta Suite", "Macaroni Companion Setup");
}

function assertTrustedCompanionRenderer(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "";
  let sender;
  let appOrigin;
  try {
    sender = new URL(senderUrl);
    appOrigin = new URL(baseUrl).origin;
  } catch {
    throw new Error("Companion setup action was rejected");
  }
  if (sender.origin !== appOrigin || sender.pathname !== COMPANION_STUDIO_PATH) {
    throw new Error("Companion setup action is available only from Macaroni Studio");
  }
}

async function prepareCompanionSetupKit() {
  const { prepareDesktopSetupKit } = require(path.join(companionRoot(), "desktop-setup.cjs"));
  return prepareDesktopSetupKit({ companionRoot: companionRoot(), destinationRoot: companionSetupRoot() });
}

function registerCompanionSetupIpc() {
  ipcMain.removeHandler(COMPANION_SETUP_IPC_CHANNEL);
  ipcMain.handle(COMPANION_SETUP_IPC_CHANNEL, async (event, request = {}) => {
    assertTrustedCompanionRenderer(event);
    const action = String(request.action || "");
    if (action === "open-guide") {
      const { guidePath } = await prepareCompanionSetupKit();
      const failure = await shell.openPath(guidePath);
      if (failure) throw new Error("Pasta Suite could not open the copied Macaroni setup guide");
      return { ok: true, action };
    }
    if (action === "open-config-folder") {
      if (!companionAdapter?.envPath) throw new Error("Companion configuration is not initialized yet");
      await fsp.access(companionAdapter.envPath);
      shell.showItemInFolder(companionAdapter.envPath);
      return { ok: true, action };
    }
    throw new Error("Unsupported Companion setup action");
  });
}

function hostedSitesRoot() {
  return path.join(app.getPath("documents"), "Pasta Suite", "sites");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function contentSecurityPolicy() {
  return [
    "default-src 'self' https: http: data: blob:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: http: data: blob: ipfs:",
    "font-src 'self' data:",
    "connect-src 'self' https: http: ws: wss: data: blob:",
    "frame-src 'self' https: http:",
    "worker-src 'self' blob:",
  ].join("; ");
}

function setBaseHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", contentSecurityPolicy());
}

function safeStaticPath(urlPath) {
  return resolveStaticPath(pastaRoot(), urlPath);
}

async function readJsonBody(req, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error("request body too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readBinaryBody(req, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error("request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function hostedSitePath(urlPath) {
  return resolveHostedSitePath(hostedSitesRoot(), urlPath);
}

async function listHostedSites() {
  return listStoredSites(hostedSitesRoot());
}

async function installHostedSite(req, res, parsed) {
  try {
    const archive = await readBinaryBody(req, 25 * 1024 * 1024);
    const site = await installStoredSite(archive, {
      root: hostedSitesRoot(),
      appId: parsed.searchParams.get("app") || "pasta",
      title: parsed.searchParams.get("title"),
    });
    return sendJson(res, 201, { ok: true, ...site });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || "Site install failed" });
  }
}

async function removeHostedSite(res, slug) {
  try {
    const site = await removeStoredSite(hostedSitesRoot(), slug);
    return sendJson(res, 200, { ok: true, site });
  } catch (err) {
    const message = err.message || "Site uninstall failed";
    return sendJson(res, message === "stored site not found" ? 404 : 400, { ok: false, error: message });
  }
}

async function sendFile(req, res, filePath) {
  try {
    const stats = await fsp.stat(filePath);
    if (!stats.isFile()) return sendText(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stats.size,
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(filePath).pipe(res);
  } catch (_) {
    return sendText(res, 404, "Not found");
  }
}

async function copyDropAsset(rel, outRoot) {
  const from = path.join(macaroniRoot(), rel);
  const to = path.join(outRoot, rel);
  await fsp.mkdir(path.dirname(to), { recursive: true });
  await fsp.copyFile(from, to);
}

async function exportMacaroniSite(req, res) {
  try {
    const expectedHost = new URL(baseUrl).host;
    const requestHost = String(req.headers.host || "");
    const requestOrigin = String(req.headers.origin || "");
    const secFetchSite = String(req.headers["sec-fetch-site"] || "");

    if (requestHost !== expectedHost || requestOrigin !== new URL(baseUrl).origin) {
      return sendJson(res, 403, { ok: false, error: "Export is accepted only from this installed Studio window." });
    }
    if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
      return sendJson(res, 403, { ok: false, error: "Cross-site export request is prohibited." });
    }

    const payload = await readJsonBody(req, 2 * 1024 * 1024);
    const config = typeof payload.config === "string" ? payload.config : "";
    if (!config.trim()) return sendJson(res, 400, { ok: false, error: "Missing drop config" });

    const outRoot = path.join(app.getPath("documents"), "Pasta Suite", "macaroni-site");
    const stagingDir = path.join(app.getPath("documents"), "Pasta Suite", `.macaroni-site-export-${Date.now()}`);
    await fsp.mkdir(stagingDir, { recursive: true });
    await fsp.copyFile(path.join(macaroniRoot(), "drop.html"), path.join(stagingDir, "index.html"));
    await fsp.writeFile(path.join(stagingDir, "drop.config.js"), config, "utf8");
    for (const rel of ["css/theme.css", "js/common.js", "js/drop.js", "js/octez-wallet.js", "vendor/tezos.js", "vendor/octez-connect.js"]) {
      await copyDropAsset(rel, stagingDir);
    }
    await fsp.copyFile(path.join(companionRoot(), "templates", "pasta-service.json"), path.join(stagingDir, "pasta-service.json"));

    await fsp.rm(outRoot, { recursive: true, force: true });
    await fsp.rename(stagingDir, outRoot);
    return sendJson(res, 200, { ok: true, path: outRoot });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err.message || "Export failed" });
  }
}

function redirectToTool(parsed, res) {
  const match = parsed.pathname.match(/^\/tools\/([^/]+)\/?$/);
  if (!match) return false;
  const id = match[1];
  const entry = id === "macaroni" ? `/creation-tools/${id}/studio.html` : `/creation-tools/${id}/index.html`;
  res.writeHead(302, { Location: entry, "Cache-Control": "no-store" });
  res.end();
  return true;
}

async function handleRequest(req, res) {
  setBaseHeaders(res);
  const parsed = new URL(req.url || "/", "http://127.0.0.1");

  if (parsed.pathname.startsWith("/api/macaroni/v35/companion")) {
    if (companionAdapter && await companionAdapter.proxy(req, res, parsed)) return;
    return sendJson(res, 404, {
      error: "companion_route_not_available",
      message: "This private Companion action is not available in Pasta Suite.",
    });
  }

  if (redirectToTool(parsed, res)) return;
  if (parsed.pathname === "/suite") {
    res.writeHead(302, { Location: "/", "Cache-Control": "no-store" });
    res.end();
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/auth/user") {
    return sendJson(res, 401, {
      error: "Pasta Suite Desktop does not include wtfOS hosted resources.",
      native: true,
      suite: true,
    });
  }
  if (req.method === "GET" && parsed.pathname === "/api/auth/csrf-token") {
    return sendJson(res, 200, { csrfToken: "pasta-suite-desktop" });
  }
  if (req.method === "GET" && parsed.pathname === "/api/macaroni/installers") {
    return sendJson(res, 200, {
      ok: true,
      native: true,
      suite: true,
      version: app.getVersion(),
      installers: [],
    });
  }
  if (req.method === "GET" && parsed.pathname === "/api/pasta/installers") {
    return sendJson(res, 200, {
      ok: true,
      native: true,
      product: "pasta-suite",
      version: app.getVersion(),
      installers: [],
    });
  }
  if (req.method === "POST" && parsed.pathname === "/api/system/logs/client") {
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
    return;
  }
  if (
    parsed.pathname === "/api/macaroni/ipfs/pin" ||
    parsed.pathname === "/api/macaroni/ipfs/upload-ticket" ||
    parsed.pathname === "/api/macaroni/ipfs/upload" ||
    parsed.pathname === "/api/macaroni/publish" ||
    parsed.pathname === "/api/macaroni/media-preview"
  ) {
    return sendJson(res, 403, {
      error: "wtfOS hosted pinning, publishing, and preview processing are not available in Pasta Suite Desktop. Use Pinata, your IPFS node, and local export flows.",
      native: true,
      suite: true,
    });
  }
  if (parsed.pathname.startsWith("/api/macaroni/packages/")) {
    return sendJson(res, 404, {
      error: "wtfOS CH-EASE package records are not available in Pasta Suite Desktop.",
      native: true,
      suite: true,
    });
  }
  if (req.method === "POST" && parsed.pathname === "/export") return exportMacaroniSite(req, res);
  if (req.method === "GET" && parsed.pathname === "/api/pasta/sites") {
    return sendJson(res, 200, { ok: true, sites: await listHostedSites() });
  }
  if (req.method === "POST" && parsed.pathname === "/api/pasta/sites/install") {
    return installHostedSite(req, res, parsed);
  }
  const removeSiteMatch = parsed.pathname.match(/^\/api\/pasta\/sites\/([a-z0-9-]+)$/);
  if (req.method === "DELETE" && removeSiteMatch) {
    return removeHostedSite(res, removeSiteMatch[1]);
  }

  if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");

  const hostedPath = hostedSitePath(parsed.pathname);
  if (hostedPath) return sendFile(req, res, hostedPath);

  const filePath = safeStaticPath(parsed.pathname);
  if (!filePath) return sendText(res, 403, "Forbidden");
  return sendFile(req, res, filePath);
}

async function startLocalServer() {
  const nextServer = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => sendJson(res, 500, { error: err.message || "Server error" }));
  });
  baseUrl = await listenOnStableOrigin(nextServer, PRODUCT_NAME);
  server = nextServer;
  return baseUrl;
}

async function startCompanionAdapter() {
  const { createDesktopCompanionAdapter } = require(path.join(companionRoot(), "desktop-adapter.cjs"));
  companionAdapter = createDesktopCompanionAdapter({
    companionRoot: companionRoot(),
    runtimeRoot: path.join(app.getPath("userData"), "macaroni-v35-companion"),
    studioOrigin: baseUrl,
    managementUrl: `${baseUrl}/creation-tools/macaroni/studio.html#secure-v35-companion`,
    launchChild: (modulePath, args, options) => utilityProcess.fork(modulePath, args, options),
  });
  await companionAdapter.initialize();
  await companionAdapter.kickstart();
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "tezos:"].includes(url.protocol);
  } catch (_) {
    return false;
  }
}

function shouldAllowPopup(value) {
  if (value === "about:blank") return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (baseUrl && value.startsWith(baseUrl)) return true;
    return [
      "kukai.app",
      "shadownet.kukai.app",
      "app.kukai.app",
      "walletbeacon.io",
      "templewallet.com",
      "app.templewallet.com",
      "umamiwallet.com",
    ].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch (_) {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 940,
    minWidth: 1020,
    minHeight: 740,
    title: "Pasta Suite",
    backgroundColor: "#111315",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldAllowPopup(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: url.startsWith(baseUrl) ? 1200 : 520,
          height: url.startsWith(baseUrl) ? 850 : 760,
          title: url.startsWith(baseUrl) ? "Pasta tool" : "Pasta wallet",
          webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
    }
    if (isSafeExternalUrl(url)) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (navigationUrl.startsWith(baseUrl)) return;
    event.preventDefault();
    if (isSafeExternalUrl(navigationUrl)) shell.openExternal(navigationUrl).catch(() => {});
  });

  mainWindow.loadURL(`${baseUrl}/`);
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", focusMainWindow);
  app.whenReady().then(async () => {
    try {
      await startLocalServer();
      await startCompanionAdapter().catch(() => undefined);
      registerCompanionSetupIpc();
      createWindow();
    } catch (err) {
      dialog.showErrorBox("Pasta Suite failed to start", err.message || String(err));
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  companionAdapter?.stop();
  if (server) server.close();
});
