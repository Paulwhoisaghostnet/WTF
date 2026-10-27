"use strict";

const { createHash, createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const COMPANION_PREFIX = "/api/macaroni/v35/companion";
const ASSET_STRATEGIES = Object.freeze(["pin_on_claim", "public_prepin_private_manifest"]);
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ROUTES = Object.freeze([
  { method: "POST", local: new RegExp(`^${COMPANION_PREFIX}/projects$`), upstream: () => "/v1/admin/projects" },
  { method: "GET", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}` },
  { method: "GET", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/attention$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/attention` },
  { method: "POST", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/attention/([0-9]+)/retry$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/attention/${match[2]}/retry` },
  { method: "PUT", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/uploads/(${UUID})$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/uploads/${match[2]}` },
  { method: "POST", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/tokens/([0-9]+)$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/tokens/${match[2]}` },
  { method: "POST", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/public-contract-metadata$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/public-contract-metadata` },
  { method: "POST", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/contract$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/contract` },
  { method: "POST", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/creator-actions/next$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/creator-actions/next` },
  { method: "POST", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/creator-actions/close$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/creator-actions/close` },
  { method: "POST", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/creator-attempts/([0-9]+)/(prompt-started|prompt-aborted|rejected|submitted|reconcile)$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/creator-attempts/${match[2]}/${match[3].toLowerCase()}` },
  { method: "POST", local: new RegExp(`^${COMPANION_PREFIX}/projects/(${UUID})/(preflight|observe-activation|wake)$`, "i"), upstream: (match) => `/v1/admin/projects/${match[1]}/${match[2].toLowerCase()}` },
]);

const FORBIDDEN_RESPONSE_KEY_PARTS = Object.freeze([
  "seed",
  "seedpreimage",
  "entropypreimage",
  "metadatanonce",
  "metadatauri",
  "artifacturi",
  "artifactcid",
  "metadatacid",
  "signerkey",
  "masterkey",
  "admintoken",
  "authorization",
  "privatekey",
  "privatecid",
  "rawasset",
  "privateassetpath",
  "encryptedpath",
  "encryptedcarpath",
  "privatemanifestpath",
  "entropykeyringpath",
  "signedbytes",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stripQuotes(value) {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(source) {
  const result = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    result[key] = stripQuotes(line.slice(separator + 1).trim());
  }
  return result;
}

function replaceEnvSetting(source, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(source) ? source.replace(pattern, line) : `${source.replace(/\s*$/, "")}\n${line}\n`;
}

function resolveConfiguredPath(runtimeRoot, value) {
  if (!String(value || "").trim()) return "";
  return path.resolve(runtimeRoot, value);
}

function safeSystemEnvironment() {
  const safe = {};
  for (const key of [
    "PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL",
    "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
  ]) {
    if (typeof process.env[key] === "string") safe[key] = process.env[key];
  }
  return safe;
}

function assertSanitized(value, location = "response") {
  if (typeof value === "string") {
    const publicUri = /\.(?:contractMetadataUri|publicCoverUri)$/.test(location);
    if ((!publicUri && /^ipfs:\/\//i.test(value)) || /(?:edsk|spsk|p2sk|BLsk)[1-9A-HJ-NP-Za-km-z]+/.test(value)) {
      throw new Error(`${location} contains private material`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSanitized(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const expresslyPublic = normalized === "contractmetadatauri" || normalized === "publiccoveruri";
    if (!expresslyPublic && FORBIDDEN_RESPONSE_KEY_PARTS.some((part) => normalized.includes(part))) {
      throw new Error(`${location}.${key} is private`);
    }
    assertSanitized(child, `${location}.${key}`);
  }
}

function routeFor(method, pathname) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = pathname.match(route.local);
    if (match) return route.upstream(match);
  }
  return null;
}

function responseHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

function writeJson(response, statusCode, payload) {
  assertSanitized(payload);
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...responseHeaders(),
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readJsonResponse(response) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    response.once("error", reject);
    response.once("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        const value = text ? JSON.parse(text) : {};
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object required");
        resolve(value);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function localJsonRequest({ port, method, pathname, adminToken = "" }) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      method,
      path: pathname,
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
    }, async (response) => {
      try {
        resolve({ statusCode: response.statusCode || 500, body: await readJsonResponse(response) });
      } catch (error) {
        reject(error);
      }
    });
    request.once("error", reject);
    request.end();
  });
}

class DesktopCompanionAdapter {
  constructor({ companionRoot, runtimeRoot, studioOrigin, managementUrl, launchChild, alphaShadownetOnly = false }) {
    this.companionRoot = companionRoot;
    this.runtimeRoot = runtimeRoot;
    this.studioOrigin = studioOrigin;
    this.managementUrl = managementUrl;
    this.launchChild = launchChild;
    this.alphaShadownetOnly = alphaShadownetOnly;
    this.envPath = path.join(runtimeRoot, ".env");
    this.child = null;
    this.childWasReady = false;
    this.failedConfigurationFingerprint = "";
    this.startPromise = null;
    this.stopping = false;
  }

  async initialize() {
    await fsp.mkdir(this.runtimeRoot, { recursive: true, mode: 0o700 });
    await fsp.mkdir(path.join(this.runtimeRoot, "data"), { recursive: true, mode: 0o700 });
    await fsp.mkdir(path.join(this.runtimeRoot, "secrets"), { recursive: true, mode: 0o700 });
    const masterKeyFile = path.join(this.runtimeRoot, "secrets", "master.key");
    const adminTokenFile = path.join(this.runtimeRoot, "secrets", "admin.token");
    if (!fs.existsSync(masterKeyFile)) await fsp.writeFile(masterKeyFile, randomBytes(32), { mode: 0o600, flag: "wx" });
    if (!fs.existsSync(adminTokenFile)) await fsp.writeFile(adminTokenFile, randomBytes(32).toString("base64url"), { mode: 0o600, flag: "wx" });
    const templatePath = path.join(this.companionRoot, ".env.example");
    const abiPath = path.join(this.companionRoot, "contract", "macaroni-v35.contract.json");
    const storagePath = path.join(this.companionRoot, "contract", "macaroni-v35.storage.tz");
    const contractTemplatePath = path.join(this.companionRoot, "contract", "macaroni-v35.template.json");
    const creating = !fs.existsSync(this.envPath);
    let source = await fsp.readFile(creating ? templatePath : this.envPath, "utf8");
    if (creating) {
      source = replaceEnvSetting(source, "MACARONI_COMPANION_DATA_DIR", "./data");
      source = replaceEnvSetting(source, "MACARONI_COMPANION_HOST", "127.0.0.1");
      source = replaceEnvSetting(source, "MACARONI_COMPANION_PUBLIC_BASE_URL", "http://127.0.0.1:47835");
      source = replaceEnvSetting(source, "MACARONI_COMPANION_COLLECTOR_ORIGIN", this.studioOrigin);
      source = replaceEnvSetting(source, "MACARONI_COMPANION_ALLOWED_ORIGINS", this.studioOrigin);
      source = replaceEnvSetting(source, "MACARONI_COMPANION_MASTER_KEY_FILE", "./secrets/master.key");
      source = replaceEnvSetting(source, "MACARONI_COMPANION_SIGNER_KEY_FILE", "./secrets/finalizer.key");
      source = replaceEnvSetting(source, "MACARONI_COMPANION_ADMIN_TOKEN_FILE", "./secrets/admin.token");
    }
    // Desktop-managed projects always execute the reviewed artifacts bundled
    // with this signed application build. Refreshing only these paths/hashes
    // also keeps an existing user-data configuration valid after an app update.
    source = replaceEnvSetting(source, "MACARONI_V35_CONTRACT_ABI_PATH", abiPath);
    source = replaceEnvSetting(source, "MACARONI_V35_STORAGE_PATH", storagePath);
    source = replaceEnvSetting(source, "MACARONI_V35_TEMPLATE_PATH", contractTemplatePath);
    source = replaceEnvSetting(source, "MACARONI_V35_CONTRACT_ABI_SHA256", sha256(await fsp.readFile(abiPath)));
    source = replaceEnvSetting(source, "MACARONI_V35_STORAGE_SHA256", sha256(await fsp.readFile(storagePath)));
    source = replaceEnvSetting(source, "MACARONI_V35_TEMPLATE_SHA256", sha256(await fsp.readFile(contractTemplatePath)));
    await fsp.writeFile(this.envPath, source, { mode: 0o600, flag: creating ? "wx" : "w" });
    await fsp.chmod(this.runtimeRoot, 0o700).catch(() => undefined);
    await fsp.chmod(path.join(this.runtimeRoot, "secrets"), 0o700).catch(() => undefined);
    await fsp.chmod(masterKeyFile, 0o600).catch(() => undefined);
    await fsp.chmod(adminTokenFile, 0o600).catch(() => undefined);
    await fsp.chmod(this.envPath, 0o600).catch(() => undefined);
  }

  async configuration() {
    const source = await fsp.readFile(this.envPath, "utf8");
    const env = parseEnvFile(source);
    if (this.alphaShadownetOnly && (env.MACARONI_COMPANION_NETWORK || "shadownet") !== "shadownet") {
      throw new Error("This Pasta Suite alpha supports only Tezos Shadownet Companion projects");
    }
    const port = Number(env.MACARONI_COMPANION_PORT || 47835);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Companion port is invalid");
    if ((env.MACARONI_COMPANION_HOST || "127.0.0.1") !== "127.0.0.1") {
      throw new Error("Desktop-managed Companion must bind only to 127.0.0.1");
    }
    const adminTokenFile = resolveConfiguredPath(this.runtimeRoot, env.MACARONI_COMPANION_ADMIN_TOKEN_FILE);
    const signerKeyFile = resolveConfiguredPath(this.runtimeRoot, env.MACARONI_COMPANION_SIGNER_KEY_FILE);
    const masterKeyFile = resolveConfiguredPath(this.runtimeRoot, env.MACARONI_COMPANION_MASTER_KEY_FILE);
    const stats = await Promise.all([this.envPath, adminTokenFile, signerKeyFile, masterKeyFile].map(async (file) => {
      try {
        const stat = await fsp.stat(file);
        return `${file}:${stat.size}:${stat.mtimeMs}`;
      } catch {
        return `${file}:missing`;
      }
    }));
    return {
      env,
      port,
      adminTokenFile,
      fingerprint: sha256(`${source}\n${stats.join("\n")}`),
    };
  }

  async adminToken(configuration) {
    const token = (await fsp.readFile(configuration.adminTokenFile, "utf8")).trim();
    if (token.length < 32) throw new Error("Companion admin token is missing or invalid");
    return token;
  }

  childEnvironment(configuration) {
    return { ...safeSystemEnvironment(), ...configuration.env };
  }

  async ensureStarted() {
    if (this.child || this.startPromise || this.stopping) return this.startPromise;
    this.startPromise = (async () => {
      const configuration = await this.configuration();
      if (configuration.fingerprint === this.failedConfigurationFingerprint) return null;
      const entry = path.join(this.companionRoot, "src", "index.mjs");
      let child;
      try {
        child = this.launchChild(entry, [], {
          cwd: this.runtimeRoot,
          env: this.childEnvironment(configuration),
          stdio: "ignore",
          serviceName: "Macaroni V3.5 Companion",
        });
      } catch (error) {
        this.failedConfigurationFingerprint = configuration.fingerprint;
        throw error;
      }
      this.child = child;
      this.childWasReady = false;
      child.once("exit", () => {
        if (this.child !== child) return;
        this.child = null;
        if (!this.childWasReady) this.failedConfigurationFingerprint = configuration.fingerprint;
        this.childWasReady = false;
      });
      return child;
    })().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async probe() {
    const configuration = await this.configuration();
    const token = await this.adminToken(configuration);
    const challenge = randomBytes(32).toString("hex");
    let identity;
    try {
      identity = await localJsonRequest({
        port: configuration.port,
        method: "GET",
        pathname: `/identity?challenge=${challenge}`,
      });
    } catch (error) {
      if (error?.code && error.code !== "invalid_json_response") throw error;
      return { ready: false, code: "companion_identity_mismatch", reason: "The configured Companion port returned an invalid identity response. Close that service or select a free Companion port before retrying." };
    }
    const expectedProof = createHmac("sha256", token)
      .update(`pasta.macaroni-companion-identity.v1:${challenge}`).digest();
    const proof = identity.body?.proof;
    const actualProof = typeof proof === "string" && /^[0-9a-f]{64}$/.test(proof)
      ? Buffer.from(proof, "hex") : Buffer.alloc(0);
    if (identity.statusCode !== 200
      || identity.body?.schema !== "pasta.macaroni-companion-identity.v1"
      || identity.body?.challenge !== challenge
      || actualProof.length !== expectedProof.length
      || !timingSafeEqual(actualProof, expectedProof)) {
      return { ready: false, code: "companion_identity_mismatch", reason: "The configured Companion port belongs to another service. Close it or select a free Companion port before retrying." };
    }
    const health = await localJsonRequest({ port: configuration.port, method: "GET", pathname: "/health" });
    if (health.statusCode !== 200 || health.body?.schema !== "pasta.macaroni-companion-health.v1" || health.body?.fulfillmentReady !== true) {
      return { ready: false, code: "companion_doctor_not_ready", reason: "Companion is running, but its safety checks have not all passed." };
    }
    const admin = await localJsonRequest({ port: configuration.port, method: "GET", pathname: "/v1/admin/readiness", adminToken: token });
    if (admin.statusCode !== 200 || admin.body?.schema !== "pasta.macaroni-companion-admin-readiness.v1" || admin.body?.ready !== true) {
      return { ready: false, code: "companion_admin_probe_failed", reason: "Companion is healthy, but the private Studio adapter could not authenticate." };
    }
    const collectorPublishing = admin.body.collectorPublishing;
    if (!collectorPublishing || typeof collectorPublishing.ready !== "boolean"
      || typeof collectorPublishing.code !== "string" || typeof collectorPublishing.reason !== "string") {
      return { ready: false, code: "companion_public_readiness_probe_failed", reason: "Companion did not return its sanitized buyer-endpoint readiness." };
    }
    this.childWasReady = true;
    this.failedConfigurationFingerprint = "";
    return { ready: true, network: admin.body.network, collectorPublishing };
  }

  async readiness() {
    try {
      const firstProbe = await this.probe();
      if (firstProbe.ready) {
        return {
          schema: "wtfos.macaroni-v35-companion-readiness.v1",
          ready: true,
          studioApiReady: true,
          code: "ready",
          reason: "Local Companion safety checks and the private Studio adapter are ready.",
          network: firstProbe.network,
          assetStrategies: [...ASSET_STRATEGIES],
          managementUrl: this.managementUrl,
          publicCollectorReady: firstProbe.collectorPublishing.ready,
          publicCollectorCode: firstProbe.collectorPublishing.code,
          publicCollectorReason: firstProbe.collectorPublishing.reason,
          publicBaseUrl: firstProbe.collectorPublishing.ready ? firstProbe.collectorPublishing.publicBaseUrl : null,
          collectorOrigin: firstProbe.collectorPublishing.ready ? firstProbe.collectorPublishing.collectorOrigin : null,
          localDevelopmentOnly: firstProbe.collectorPublishing.localDevelopmentOnly === true,
        };
      }
      return {
        schema: "wtfos.macaroni-v35-companion-readiness.v1",
        ready: false,
        studioApiReady: false,
        code: firstProbe.code,
        reason: firstProbe.reason,
        assetStrategies: [],
        managementUrl: this.managementUrl,
        publicCollectorReady: false,
        publicCollectorCode: "companion_unavailable",
        publicCollectorReason: "Start and configure Companion before publishing a buyer page.",
        publicBaseUrl: null,
        collectorOrigin: null,
        localDevelopmentOnly: false,
      };
    } catch {
      try {
        const started = await this.ensureStarted();
        const unchangedFailure = !started && !this.child;
        return {
          schema: "wtfos.macaroni-v35-companion-readiness.v1",
          ready: false,
          studioApiReady: false,
          code: unchangedFailure ? "companion_setup_required" : "companion_starting",
          reason: unchangedFailure
            ? "Companion configuration is incomplete or failed its last safety check. Complete the local Companion setup, then return here."
            : "Companion is starting. This page will remain safely locked until its doctor and private adapter probes pass.",
          assetStrategies: [],
          managementUrl: this.managementUrl,
          publicCollectorReady: false,
          publicCollectorCode: "companion_unavailable",
          publicCollectorReason: "Start and configure Companion before publishing a buyer page.",
          publicBaseUrl: null,
          collectorOrigin: null,
          localDevelopmentOnly: false,
        };
      } catch {
        return {
          schema: "wtfos.macaroni-v35-companion-readiness.v1",
          ready: false,
          studioApiReady: false,
          code: "companion_setup_required",
          reason: "Companion could not start safely. Complete or correct the local Companion configuration, then return here.",
          assetStrategies: [],
          managementUrl: this.managementUrl,
          publicCollectorReady: false,
          publicCollectorCode: "companion_unavailable",
          publicCollectorReason: "Start and configure Companion before publishing a buyer page.",
          publicBaseUrl: null,
          collectorOrigin: null,
          localDevelopmentOnly: false,
        };
      }
    }
  }

  async kickstart() {
    try {
      const probe = await this.probe();
      if (probe.ready || ["companion_identity_mismatch", "companion_doctor_not_ready"].includes(probe.code)) return;
    } catch {
      // An unavailable service is the expected first-install state.
    }
    await this.ensureStarted();
  }

  async proxy(request, response, parsedUrl) {
    if (request.method === "GET" && parsedUrl.pathname === `${COMPANION_PREFIX}/readiness`) {
      writeJson(response, 200, await this.readiness());
      return true;
    }
    const upstreamPath = routeFor(request.method || "", parsedUrl.pathname);
    if (!upstreamPath) return false;
    const expectedHost = new URL(this.studioOrigin).host;
    const requestHost = String(request.headers.host || "");
    const requestOrigin = String(request.headers.origin || "");
    if (requestHost !== expectedHost || requestOrigin !== this.studioOrigin) {
      writeJson(response, 403, {
        error: "studio_origin_required",
        message: "Private Companion actions are accepted only from this installed Studio window.",
      });
      return true;
    }
    const readiness = await this.readiness();
    if (!readiness.studioApiReady) {
      writeJson(response, 503, readiness);
      return true;
    }
    try {
      const configuration = await this.configuration();
      const adminToken = await this.adminToken(configuration);
      await new Promise((resolve) => {
        const headers = { Authorization: `Bearer ${adminToken}` };
        if (typeof request.headers["content-type"] === "string") headers["Content-Type"] = request.headers["content-type"];
        if (typeof request.headers["content-length"] === "string") headers["Content-Length"] = request.headers["content-length"];
        const upstream = http.request({
          hostname: "127.0.0.1",
          port: configuration.port,
          method: request.method,
          path: upstreamPath,
          headers,
        }, async (upstreamResponse) => {
          try {
            const payload = await readJsonResponse(upstreamResponse);
            assertSanitized(payload);
            writeJson(response, upstreamResponse.statusCode || 502, payload);
          } catch {
            writeJson(response, 502, {
              error: "companion_response_rejected",
              message: "Companion returned a response that the desktop privacy boundary could not safely display.",
            });
          }
          resolve();
        });
        upstream.once("error", () => {
          writeJson(response, 503, {
            error: "companion_unreachable",
            message: "The local Companion became unavailable. Your durable setup remains saved; return when the service is running.",
          });
          resolve();
        });
        request.once("aborted", () => upstream.destroy());
        request.pipe(upstream);
      });
      return true;
    } catch {
      writeJson(response, 503, {
        error: "companion_adapter_unavailable",
        message: "The private Companion adapter is unavailable. No creator action was submitted.",
      });
      return true;
    }
  }

  stop() {
    this.stopping = true;
    if (this.child) this.child.kill();
    this.child = null;
  }
}

function createDesktopCompanionAdapter(options) {
  return new DesktopCompanionAdapter(options);
}

module.exports = {
  ASSET_STRATEGIES,
  COMPANION_PREFIX,
  DesktopCompanionAdapter,
  assertSanitized,
  createDesktopCompanionAdapter,
  parseEnvFile,
  routeFor,
};
