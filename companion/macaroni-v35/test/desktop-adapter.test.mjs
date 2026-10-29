import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import adapterModule from "../desktop-adapter.cjs";

const {
  ASSET_STRATEGIES,
  COMPANION_PREFIX,
  createDesktopCompanionAdapter,
  parseEnvFile,
  routeFor,
} = adapterModule;

const companionRoot = path.resolve(import.meta.dirname, "..");
const dropRef = "4b576a3e-e443-4c6e-b9e3-97c889502cc4";
const uploadId = "3c39d73a-5426-44a4-9e66-40956db18f11";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function exactRequest({ port, method = "GET", pathname, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, method, path: pathname, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.once("error", reject);
      response.once("end", () => resolve({ status: response.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    request.once("error", reject);
    if (body) request.end(body); else request.end();
  });
}

async function configuredRuntime(t, upstreamHandler) {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "macaroni-desktop-companion-"));
  t.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  const secrets = path.join(runtimeRoot, "secrets");
  await mkdir(secrets, { recursive: true });
  await writeFile(path.join(secrets, "admin.token"), "a-local-admin-token-that-is-never-sent-to-the-renderer", { mode: 0o600 });
  await writeFile(path.join(secrets, "master.key"), Buffer.alloc(32, 7), { mode: 0o600 });
  await writeFile(path.join(secrets, "finalizer.key"), "edsk-test-fixture-only", { mode: 0o600 });
  const upstream = createServer(upstreamHandler);
  const port = await listen(upstream);
  t.after(() => close(upstream));
  await writeFile(path.join(runtimeRoot, ".env"), [
    `MACARONI_COMPANION_PORT=${port}`,
    "MACARONI_COMPANION_HOST=127.0.0.1",
    "MACARONI_COMPANION_ADMIN_TOKEN_FILE=./secrets/admin.token",
    "MACARONI_COMPANION_MASTER_KEY_FILE=./secrets/master.key",
    "MACARONI_COMPANION_SIGNER_KEY_FILE=./secrets/finalizer.key",
  ].join("\n"), { mode: 0o600 });
  const adapter = createDesktopCompanionAdapter({
    companionRoot,
    runtimeRoot,
    studioOrigin: "http://127.0.0.1:30771",
    managementUrl: "http://127.0.0.1:30771/studio.html#secure-v35-companion",
    launchChild: () => { throw new Error("healthy external fixture must not spawn"); },
  });
  return { adapter, runtimeRoot, port };
}

function readyUpstream(handler = null) {
  return async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        schema: "pasta.macaroni-companion-health.v1",
        fulfillmentReady: true,
      }));
      return;
    }
    if (request.url === "/v1/admin/readiness") {
      assert.equal(request.headers.authorization, "Bearer a-local-admin-token-that-is-never-sent-to-the-renderer");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        schema: "pasta.macaroni-companion-admin-readiness.v1",
        ready: true,
        network: "shadownet",
        collectorPublishing: {
          ready: false,
          code: "collector_loopback_not_exportable",
          reason: "Loopback is available for setup, but not for a remotely hosted buyer page.",
          publicBaseUrl: "http://127.0.0.1:47835",
          collectorOrigin: "http://127.0.0.1:30771",
        },
      }));
      return;
    }
    if (handler && await handler(request, response, Buffer.concat(chunks))) return;
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found", message: "Not found" }));
  };
}

test("desktop bootstrap creates private local custody config without auto-accepting disclosures", async (t) => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "macaroni-desktop-bootstrap-"));
  t.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  const adapter = createDesktopCompanionAdapter({
    companionRoot,
    runtimeRoot,
    studioOrigin: "http://127.0.0.1:30771",
    managementUrl: "http://127.0.0.1:30771/studio.html#secure-v35-companion",
    launchChild: () => { throw new Error("not launched by initialize"); },
  });
  await adapter.initialize();
  const source = await readFile(path.join(runtimeRoot, ".env"), "utf8");
  const env = parseEnvFile(source);
  assert.equal(env.MACARONI_COMPANION_ALLOWED_ORIGINS, "http://127.0.0.1:30771");
  assert.equal(env.MACARONI_COMPANION_HOST, "127.0.0.1");
  assert.equal(env.MACARONI_COMPANION_PUBLIC_BASE_URL, "http://127.0.0.1:47835");
  assert.equal(env.MACARONI_COMPANION_COLLECTOR_ORIGIN, "http://127.0.0.1:30771");
  assert.match(env.MACARONI_V35_CONTRACT_ABI_SHA256, /^[0-9a-f]{64}$/);
  assert.match(env.MACARONI_V35_STORAGE_SHA256, /^[0-9a-f]{64}$/);
  assert.match(env.MACARONI_V35_TEMPLATE_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(env.MACARONI_COMPANION_ACKNOWLEDGE_MEMPOOL_DISCLOSURE, "REPLACE_AFTER_READING_README");
  assert.equal((await stat(path.join(runtimeRoot, "secrets", "master.key"))).size, 32);
  assert.ok((await readFile(path.join(runtimeRoot, "secrets", "admin.token"), "utf8")).trim().length >= 32);
  await assert.rejects(stat(path.join(runtimeRoot, "secrets", "finalizer.key")), /ENOENT/);
});

test("desktop route map is an exact method-and-path allowlist", () => {
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects`), "/v1/admin/projects");
  assert.equal(routeFor("GET", `${COMPANION_PREFIX}/projects/${dropRef}`), `/v1/admin/projects/${dropRef}`);
  assert.equal(routeFor("PUT", `${COMPANION_PREFIX}/projects/${dropRef}/uploads/${uploadId}`), `/v1/admin/projects/${dropRef}/uploads/${uploadId}`);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/${dropRef}/tokens/12`), `/v1/admin/projects/${dropRef}/tokens/12`);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/${dropRef}/public-contract-metadata`), `/v1/admin/projects/${dropRef}/public-contract-metadata`);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/${dropRef}/creator-actions/next`), `/v1/admin/projects/${dropRef}/creator-actions/next`);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/${dropRef}/creator-actions/close`), `/v1/admin/projects/${dropRef}/creator-actions/close`);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/${dropRef}/creator-attempts/7/prompt-started`), `/v1/admin/projects/${dropRef}/creator-attempts/7/prompt-started`);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/${dropRef}/creator-attempts/7/prompt-aborted`), `/v1/admin/projects/${dropRef}/creator-attempts/7/prompt-aborted`);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/${dropRef}/creator-attempts/7/submitted`), `/v1/admin/projects/${dropRef}/creator-attempts/7/submitted`);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/${dropRef}/contract`), `/v1/admin/projects/${dropRef}/contract`);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/${dropRef}/preflight`), `/v1/admin/projects/${dropRef}/preflight`);
  assert.equal(routeFor("DELETE", `${COMPANION_PREFIX}/projects/${dropRef}`), null);
  assert.equal(routeFor("POST", `${COMPANION_PREFIX}/projects/not-a-uuid/tokens/0`), null);
  assert.equal(routeFor("GET", `${COMPANION_PREFIX}/projects/${dropRef}?redirect=http://attacker.test`), null);
});

test("desktop readiness proves doctor plus admin adapter without exposing the token", async (t) => {
  const { adapter } = await configuredRuntime(t, readyUpstream());
  const readiness = await adapter.readiness();
  assert.deepEqual(readiness, {
    schema: "wtfos.macaroni-v35-companion-readiness.v1",
    ready: true,
    studioApiReady: true,
    code: "ready",
    reason: "Local Companion safety checks and the private Studio adapter are ready.",
    network: "shadownet",
    assetStrategies: [...ASSET_STRATEGIES],
    managementUrl: "http://127.0.0.1:30771/studio.html#secure-v35-companion",
    publicCollectorReady: false,
    publicCollectorCode: "collector_loopback_not_exportable",
    publicCollectorReason: "Loopback is available for setup, but not for a remotely hosted buyer page.",
    publicBaseUrl: null,
    collectorOrigin: null,
    localDevelopmentOnly: false,
  });
  assert.equal(JSON.stringify(readiness).includes("a-local-admin-token"), false);
});

test("desktop proxy injects admin auth, streams uploads, and rejects a secret-bearing response", async (t) => {
  const received = [];
  const upstreamHandler = readyUpstream(async (request, response, body) => {
    received.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body });
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === `/v1/admin/projects/${dropRef}`) {
      response.end(JSON.stringify({ schema: "pasta.macaroni-companion-project.v1", nested: { seedPreimage: "must-not-leak" } }));
    } else {
      response.end(JSON.stringify({ schema: "pasta.macaroni-companion-upload.v1", uploadId, state: "encrypted_private" }));
    }
    return true;
  });
  const { adapter } = await configuredRuntime(t, upstreamHandler);
  const front = createServer(async (request, response) => {
    const parsed = new URL(request.url, "http://127.0.0.1");
    if (!await adapter.proxy(request, response, parsed)) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end("{}");
    }
  });
  const frontPort = await listen(front);
  t.after(() => close(front));

  const raw = Buffer.from("private-artifact-bytes-never-returned");
  const upload = await exactRequest({ port: frontPort, pathname: `${COMPANION_PREFIX}/projects/${dropRef}/uploads/${uploadId}`,
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(raw.length),
      host: "127.0.0.1:30771",
      origin: "http://127.0.0.1:30771",
    },
    body: raw,
  });
  assert.equal(upload.status, 200);
  assert.deepEqual(upload.json, { schema: "pasta.macaroni-companion-upload.v1", uploadId, state: "encrypted_private" });
  const forwarded = received.find((item) => item.url.includes("/uploads/"));
  assert.equal(forwarded.authorization, "Bearer a-local-admin-token-that-is-never-sent-to-the-renderer");
  assert.deepEqual(forwarded.body, raw);

  const blocked = await exactRequest({ port: frontPort, pathname: `${COMPANION_PREFIX}/projects/${dropRef}`, headers: {
    host: "127.0.0.1:30771",
    origin: "http://127.0.0.1:30771",
  } });
  assert.equal(blocked.status, 502);
  const blockedBody = blocked.json;
  assert.equal(blockedBody.error, "companion_response_rejected");
  assert.equal(JSON.stringify(blockedBody).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(blockedBody).includes("admin-token"), false);
});

test("desktop proxy never acts as an admin-token oracle for a missing, foreign, or wrong-host origin", async (t) => {
  let upstreamMutations = 0;
  const { adapter } = await configuredRuntime(t, readyUpstream(async (_request, response) => {
    upstreamMutations += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return true;
  }));
  const front = createServer(async (request, response) => {
    const parsed = new URL(request.url, "http://127.0.0.1");
    if (!await adapter.proxy(request, response, parsed)) response.end();
  });
  const frontPort = await listen(front);
  t.after(() => close(front));
  const endpoint = `http://127.0.0.1:${frontPort}${COMPANION_PREFIX}/projects`;
  for (const headers of [
    { host: "127.0.0.1:30771" },
    { host: "127.0.0.1:30771", origin: "https://attacker.invalid" },
    { host: `127.0.0.1:${frontPort}`, origin: "http://127.0.0.1:30771" },
  ]) {
    const result = await exactRequest({ port: frontPort, pathname: `${COMPANION_PREFIX}/projects`, method: "POST", headers: { ...headers, "content-length": "2" }, body: "{}" });
    assert.equal(result.status, 403);
    assert.equal(result.json.error, "studio_origin_required");
  }
  const missingOriginRead = await exactRequest({
    port: frontPort,
    pathname: `${COMPANION_PREFIX}/projects/${dropRef}`,
    headers: { host: "127.0.0.1:30771" },
  });
  assert.equal(missingOriginRead.status, 403);
  assert.equal(upstreamMutations, 0);
});

test("unchanged failed startup stays fail-closed instead of creating a restart loop", async (t) => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "macaroni-desktop-supervision-"));
  t.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  let launches = 0;
  let child;
  const adapter = createDesktopCompanionAdapter({
    companionRoot,
    runtimeRoot,
    studioOrigin: "http://127.0.0.1:30771",
    managementUrl: "http://127.0.0.1:30771/studio.html#secure-v35-companion",
    launchChild: () => {
      launches += 1;
      child = new EventEmitter();
      child.kill = () => child.emit("exit", 0);
      return child;
    },
  });
  await adapter.initialize();
  await adapter.kickstart();
  assert.equal(launches, 1);
  child.emit("exit", 1);
  const readiness = await adapter.readiness();
  assert.equal(readiness.studioApiReady, false);
  assert.equal(readiness.code, "companion_setup_required");
  assert.equal(launches, 1);
});
