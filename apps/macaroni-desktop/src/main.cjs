"use strict";

const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { listenOnStableOrigin } = require("./loopback-origin.cjs");

const PRODUCT_NAME = "Macaroni Studio";

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

let server;
let baseUrl = "";
let mainWindow;

function appRoot() {
  return app.getAppPath();
}

function macaroniRoot() {
  return path.join(appRoot(), "macaroni");
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
  const cleanPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  const normalized = path.normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const rel = normalized === "/" || normalized === "." ? "studio.html" : normalized.replace(/^[/\\]+/, "");
  const fullPath = path.join(macaroniRoot(), rel);
  const root = macaroniRoot();
  if (!fullPath.startsWith(root + path.sep) && fullPath !== root) return null;
  return fullPath;
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

async function copyDropAsset(rel, outRoot) {
  const from = path.join(macaroniRoot(), rel);
  const to = path.join(outRoot, rel);
  await fsp.mkdir(path.dirname(to), { recursive: true });
  await fsp.copyFile(from, to);
}

async function exportSite(req, res) {
  try {
    const payload = await readJsonBody(req, 2 * 1024 * 1024);
    const config = typeof payload.config === "string" ? payload.config : "";
    if (!config.trim()) return sendJson(res, 400, { ok: false, error: "Missing drop config" });

    const outRoot = path.join(app.getPath("documents"), "Macaroni", "site");
    await fsp.rm(outRoot, { recursive: true, force: true });
    await fsp.mkdir(outRoot, { recursive: true });
    await fsp.copyFile(path.join(macaroniRoot(), "drop.html"), path.join(outRoot, "index.html"));
    await fsp.writeFile(path.join(outRoot, "drop.config.js"), config, "utf8");
    for (const rel of ["css/theme.css", "js/common.js", "js/drop.js", "vendor/tezos.js"])
      await copyDropAsset(rel, outRoot);
    return sendJson(res, 200, { ok: true, path: outRoot });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err.message || "Export failed" });
  }
}

async function handleRequest(req, res) {
  setBaseHeaders(res);
  const parsed = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "GET" && parsed.pathname === "/api/auth/user") {
    return sendJson(res, 401, {
      error: "Macaroni Desktop does not include wtfOS hosted resources.",
      native: true,
    });
  }
  if (req.method === "GET" && parsed.pathname === "/api/auth/csrf-token") {
    return sendJson(res, 200, { csrfToken: "macaroni-desktop" });
  }
  if (req.method === "GET" && parsed.pathname === "/api/macaroni/installers") {
    return sendJson(res, 200, {
      ok: true,
      native: true,
      version: app.getVersion(),
      installers: [],
    });
  }
  if (parsed.pathname === "/api/macaroni/ipfs/pin" || parsed.pathname === "/api/macaroni/publish") {
    return sendJson(res, 403, {
      error: "wtfOS hosted pinning and publishing are not available in Macaroni Desktop. Use Pinata, your IPFS node, and Export website.",
      native: true,
    });
  }
  if (req.method === "POST" && parsed.pathname === "/export") return exportSite(req, res);

  if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");

  const filePath = safeStaticPath(parsed.pathname);
  if (!filePath) return sendText(res, 403, "Forbidden");
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

async function startLocalServer() {
  const nextServer = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => sendJson(res, 500, { error: err.message || "Server error" }));
  });
  baseUrl = await listenOnStableOrigin(nextServer, PRODUCT_NAME);
  server = nextServer;
  return baseUrl;
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
    width: 1320,
    height: 920,
    minWidth: 980,
    minHeight: 720,
    title: "Macaroni Studio",
    backgroundColor: "#0d0d0f",
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
          width: 520,
          height: 760,
          title: "Macaroni wallet",
          webPreferences: {
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

  mainWindow.loadURL(`${baseUrl}/studio.html`);
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
      createWindow();
    } catch (err) {
      dialog.showErrorBox("Macaroni Studio failed to start", err.message || String(err));
      app.quit();
    }
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && baseUrl) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (server) server.close();
});
