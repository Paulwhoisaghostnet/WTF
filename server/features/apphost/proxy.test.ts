import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appHostProxyPath,
  fetchAppHostJson,
  resolveAppHostEnv,
  resolveAppHostBaseUrl,
  resolveAppHostTransport,
} from "./proxy";

test("resolveAppHostBaseUrl defaults to the loopback apphost port", () => {
  assert.equal(resolveAppHostBaseUrl({}), "http://127.0.0.1:8765");
});

test("resolveAppHostBaseUrl rejects non-loopback upstreams", () => {
  assert.throws(
    () => resolveAppHostBaseUrl({ WTFOS_APPHOST_URL: "https://apphost.example.com" }),
    /loopback/
  );
});

test("resolveAppHostTransport supports an absolute Unix socket", () => {
  assert.deepEqual(
    resolveAppHostTransport({ WTFOS_APPHOST_SOCKET_PATH: "/opt/wtfos/apphost/run/apphost.sock" }),
    { type: "unix", socketPath: "/opt/wtfos/apphost/run/apphost.sock" },
  );
});

test("resolveAppHostEnv reads the non-secret apphost client env contract", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wtfos-apphost-"));
  const envFile = join(tmp, "wtfos-apphost.env");
  writeFileSync(
    envFile,
    [
      "# comment",
      "WTFOS_APPHOST_SOCKET_PATH=/run/wtf/apphost/apphost.sock",
      "WTFOS_APPHOST_TIMEOUT_MS=15000",
      "IGNORED_KEY=value",
    ].join("\n"),
  );
  try {
    assert.deepEqual(
      resolveAppHostEnv({ WTFOS_APPHOST_CLIENT_ENV_FILE: envFile, WTFOS_APPHOST_TIMEOUT_MS: "20000" }),
      {
        WTFOS_APPHOST_CLIENT_ENV_FILE: envFile,
        WTFOS_APPHOST_SOCKET_PATH: "/run/wtf/apphost/apphost.sock",
        WTFOS_APPHOST_TIMEOUT_MS: "20000",
      },
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveAppHostTransport prefers the shared wtfOS runtime socket when it exists", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wtfos-apphost-"));
  const socketPath = join(tmp, "apphost.sock");
  writeFileSync(socketPath, "");
  const previousSocketPath = process.env.WTFOS_APPHOST_SOCKET_PATH;
  const previousSharedSocketPath = process.env.WTFOS_APPHOST_SHARED_SOCKET_PATH;
  const previousUrl = process.env.WTFOS_APPHOST_URL;
  try {
    delete process.env.WTFOS_APPHOST_SOCKET_PATH;
    process.env.WTFOS_APPHOST_SHARED_SOCKET_PATH = socketPath;
    delete process.env.WTFOS_APPHOST_URL;
    assert.deepEqual(
      resolveAppHostTransport(),
      { type: "unix", socketPath },
    );
  } finally {
    if (previousSocketPath === undefined) delete process.env.WTFOS_APPHOST_SOCKET_PATH;
    else process.env.WTFOS_APPHOST_SOCKET_PATH = previousSocketPath;
    if (previousSharedSocketPath === undefined) delete process.env.WTFOS_APPHOST_SHARED_SOCKET_PATH;
    else process.env.WTFOS_APPHOST_SHARED_SOCKET_PATH = previousSharedSocketPath;
    if (previousUrl === undefined) delete process.env.WTFOS_APPHOST_URL;
    else process.env.WTFOS_APPHOST_URL = previousUrl;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveAppHostTransport can discover the socket path from the client env file", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wtfos-apphost-"));
  const socketPath = join(tmp, "apphost.sock");
  const envFile = join(tmp, "wtfos-apphost.env");
  writeFileSync(socketPath, "");
  writeFileSync(envFile, `WTFOS_APPHOST_SOCKET_PATH=${socketPath}\n`);
  try {
    assert.deepEqual(
      resolveAppHostTransport({ WTFOS_APPHOST_CLIENT_ENV_FILE: envFile }),
      { type: "unix", socketPath },
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveAppHostTransport uses explicit loopback HTTP over auto shared socket detection", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wtfos-apphost-"));
  const socketPath = join(tmp, "apphost.sock");
  writeFileSync(socketPath, "");
  try {
    assert.deepEqual(
      resolveAppHostTransport({
        WTFOS_APPHOST_URL: "http://127.0.0.1:9876",
        WTFOS_APPHOST_SHARED_SOCKET_PATH: socketPath,
      }),
      { type: "http", baseUrl: "http://127.0.0.1:9876" },
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveAppHostTransport rejects relative Unix sockets", () => {
  assert.throws(
    () => resolveAppHostTransport({ WTFOS_APPHOST_SOCKET_PATH: "apphost.sock" }),
    /absolute/,
  );
});

test("appHostProxyPath builds only manifest launcher paths", () => {
  assert.equal(appHostProxyPath("/apps"), "/apps");
  assert.equal(appHostProxyPath("/apps/jackbox-party-pack-10/launch"), "/apps/jackbox-party-pack-10/launch");
  assert.equal(appHostProxyPath("/apps/jackbox-party-pack-10/session"), "/apps/jackbox-party-pack-10/session");
  assert.equal(appHostProxyPath("/apps/jackbox-party-pack-10/input"), "/apps/jackbox-party-pack-10/input");
  assert.equal(appHostProxyPath("/apps/jackbox-party-pack-10/snapshot"), "/apps/jackbox-party-pack-10/snapshot");
  assert.equal(appHostProxyPath("/apps/jackbox-party-pack-10/stream/offer"), "/apps/jackbox-party-pack-10/stream/offer");
  assert.equal(appHostProxyPath("/apps/jackbox-party-pack-10/stream/status"), "/apps/jackbox-party-pack-10/stream/status");
  assert.equal(appHostProxyPath("/apps/jackbox-party-pack-10/stream/stop"), "/apps/jackbox-party-pack-10/stream/stop");
  assert.throws(() => appHostProxyPath("/../../etc/passwd"), /Unsupported/);
});

test("fetchAppHostJson forwards launch bodies over Unix sockets", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "wtfos-apphost-"));
  const socketPath = join(tmp, "apphost.sock");
  const previousSocketPath = process.env.WTFOS_APPHOST_SOCKET_PATH;
  const previousEnvFile = process.env.WTFOS_APPHOST_CLIENT_ENV_FILE;
  const previousSharedSocketPath = process.env.WTFOS_APPHOST_SHARED_SOCKET_PATH;
  const previousUrl = process.env.WTFOS_APPHOST_URL;
  const seen: { method?: string; url?: string; body?: string; contentType?: string } = {};
  const server = http.createServer((req, res) => {
    seen.method = req.method;
    seen.url = req.url;
    seen.contentType = req.headers["content-type"];
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      seen.body = raw;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  try {
    process.env.WTFOS_APPHOST_SOCKET_PATH = socketPath;
    process.env.WTFOS_APPHOST_CLIENT_ENV_FILE = join(tmp, "missing.env");
    delete process.env.WTFOS_APPHOST_SHARED_SOCKET_PATH;
    delete process.env.WTFOS_APPHOST_URL;

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    const response = await fetchAppHostJson("/apps/jackbox-party-pack-10/launch", {
      method: "POST",
      body: JSON.stringify({ actor: { userId: "7", displayName: "Seven" } }),
      headers: { "Content-Type": "application/json" },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true });
    assert.equal(seen.method, "POST");
    assert.equal(seen.url, "/apps/jackbox-party-pack-10/launch");
    assert.equal(seen.contentType, "application/json");
    assert.equal(seen.body, '{"actor":{"userId":"7","displayName":"Seven"}}');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousSocketPath === undefined) delete process.env.WTFOS_APPHOST_SOCKET_PATH;
    else process.env.WTFOS_APPHOST_SOCKET_PATH = previousSocketPath;
    if (previousEnvFile === undefined) delete process.env.WTFOS_APPHOST_CLIENT_ENV_FILE;
    else process.env.WTFOS_APPHOST_CLIENT_ENV_FILE = previousEnvFile;
    if (previousSharedSocketPath === undefined) delete process.env.WTFOS_APPHOST_SHARED_SOCKET_PATH;
    else process.env.WTFOS_APPHOST_SHARED_SOCKET_PATH = previousSharedSocketPath;
    if (previousUrl === undefined) delete process.env.WTFOS_APPHOST_URL;
    else process.env.WTFOS_APPHOST_URL = previousUrl;
    rmSync(tmp, { recursive: true, force: true });
  }
});
