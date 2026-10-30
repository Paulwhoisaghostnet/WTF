import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";

const CONTRACT = "KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG";
const OPERATION_HASH = `o${"1".repeat(50)}`;
const CLAIM_ID = "42";
let managedOrigin = "";
let managedServer;
let calls = [];
let privateCalls = [];

test.use({
  ignoreHTTPSErrors: true,
  launchOptions: {
    args: [
      "--host-resolver-rules=MAP managed.wtfos.test 127.0.0.1",
      "--proxy-bypass-list=managed.wtfos.test",
    ],
  },
});

function jsonResponse(response, status, body, cors = false) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...(cors ? { "access-control-allow-origin": "*" } : {}),
  });
  response.end(JSON.stringify(body));
}

test.beforeAll(async () => {
  const certificateDir = mkdtempSync(path.join(tmpdir(), "macaroni-v35-collector-cert-"));
  let key;
  let cert;
  try {
    const keyPath = path.join(certificateDir, "key.pem");
    const certPath = path.join(certificateDir, "cert.pem");
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=managed.wtfos.test", "-keyout", keyPath, "-out", certPath,
    ], { stdio: ["ignore", "ignore", "ignore"] });
    key = readFileSync(keyPath);
    cert = readFileSync(certPath);
  } finally {
    rmSync(certificateDir, { recursive: true, force: true });
  }
  if (!key || !cert) throw new Error("Could not create the local HTTPS collector fixture certificate");

  managedServer = createServer({ key, cert }, (request, response) => {
    const url = new URL(request.url || "/", "https://managed.wtfos.test");
    const observed = { method: request.method || "GET", path: url.pathname, headers: request.headers };
    if (url.pathname.startsWith("/api/macaroni/v35/drops/")) {
      privateCalls.push(observed);
      return jsonResponse(response, 401, { error: "Authentication required" });
    }
    calls.push(observed);
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      });
      return response.end();
    }
    if (url.pathname === `/api/macaroni/v35/status/shadownet/${CONTRACT}`) {
      return jsonResponse(response, 200, {
        schema: "wtfos.macaroni-v35-public-status.v1",
        network: "shadownet",
        contract: CONTRACT,
        provider: "wtfos_managed",
        serviceReady: true,
        progress: { state: "active", message: "Automatic fulfillment is ready." },
      }, true);
    }
    if (url.pathname === `/api/macaroni/v35/status/shadownet/${CONTRACT}/purchases/${OPERATION_HASH}`) {
      return jsonResponse(response, 200, {
        schema: "wtfos.macaroni-v35-purchase-status.v1",
        operationHash: OPERATION_HASH,
        claims: [{ claimId: CLAIM_ID, state: "artwork_secured", settlementOperationHash: null }],
      }, true);
    }
    if (url.pathname === `/api/macaroni/v35/status/shadownet/${CONTRACT}/claims/${CLAIM_ID}`) {
      return jsonResponse(response, 200, {
        schema: "wtfos.macaroni-v35-claim-status.v1",
        claimId: CLAIM_ID,
        state: "nft_ready",
        message: "NFT ready",
        settlementOperationHash: `o${"2".repeat(50)}`,
      }, true);
    }
    if (url.pathname === `/api/macaroni/v35/wake/shadownet/${CONTRACT}` && request.method === "POST") {
      return jsonResponse(response, 202, { registered: true, accepted: true, idempotent: true }, true);
    }
    return jsonResponse(response, 404, { error: "Not found" }, true);
  });
  await new Promise((resolve, reject) => {
    managedServer.once("error", reject);
    managedServer.listen(0, "127.0.0.1", resolve);
  });
  const address = managedServer.address();
  if (!address || typeof address === "string") throw new Error("Local HTTPS collector fixture did not bind");
  managedOrigin = `https://managed.wtfos.test:${address.port}`;
});

test.afterAll(async () => {
  if (!managedServer) return;
  await new Promise((resolve, reject) => managedServer.close((error) => error ? reject(error) : resolve()));
});

function secureDropConfig() {
  const statusUrl = `${managedOrigin}/api/macaroni/v35/status/shadownet/${CONTRACT}`;
  return {
    schema: "macaroni-drop.v1",
    profile: { id: "macaroni-secure-v35" },
    contractVersion: "macaroni-secure-v35",
    network: "shadownet",
    rpc: "https://tezos-shadownet.octez.io/",
    contract: CONTRACT,
    title: "Static collector fixture",
    description: "A fixture exported exactly like a third-party static drop page.",
    gateway: "https://ipfs.io/ipfs/",
    tokens: [{ id: 0, displayId: 1, quantity: 10 }],
    blocks: [],
    service: {
      schema: "wtfos.macaroni-v35-public-service.v1",
      provider: "wtfos_managed",
      publicStatusUrl: statusUrl,
      claimStatusUrlTemplate: `${statusUrl}/claims/{claimId}`,
      purchaseStatusUrlTemplate: `${statusUrl}/purchases/{operationHash}`,
      wakeUrl: `${managedOrigin}/api/macaroni/v35/wake/shadownet/${CONTRACT}`,
      projectId: "static-collector-fixture",
    },
  };
}

function walletAndChainFixture() {
  return `
    (() => {
      const account = "tz1burnburnburnburnburnburnburjAYjjX";
      const operationHash = ${JSON.stringify(OPERATION_HASH)};
      const storage = {
        supply: 10,
        claims_created: 0,
        sale_active: true,
        paused: false,
        revealed: 0,
        stages: new Map([[0, {
          start: new Date(Date.now() - 60_000).toISOString(),
          price: 1_000_000,
          use_allowlist: false,
          max_per_wallet: null,
        }]]),
      };
      const methodsObject = {
        purchase(quantity) { return { entrypoint: "purchase", quantity }; },
        mint(quantity) { return { entrypoint: "mint", quantity }; },
        reveal(quantity) { return { entrypoint: "reveal", quantity }; },
      };
      const contract = { methodsObject, storage: async () => storage };
      window.__macaroniPurchaseSends = [];
      window.MD = {
        DEFAULT_GATEWAY: "https://ipfs.io/ipfs/",
        TZKT_API: { mainnet: "https://tzkt-fixture.test", shadownet: "https://tzkt-fixture.test" },
        setupToolkit() {},
        getNetworks: () => ({ shadownet: { rpc: "https://rpc-fixture.test" } }),
        getAccount: () => account,
        restoreWallet: async () => account,
        connectWallet: async () => account,
        disconnectWallet: async () => {},
        getBalanceMutez: async () => 50_000_000,
        fmtTez: (mutez) => Number(mutez || 0) / 1_000_000 + " tez",
        short: (value) => String(value || "").slice(0, 8),
        explorerUrl: (_network, value) => "https://shadownet.tzkt.io/" + value,
        ipfsToHttp: (value) => String(value || ""),
        hexToUtf8: (value) => String(value || ""),
        getToolkit: () => ({
          contract: { at: async () => contract },
          wallet: { at: async () => contract },
        }),
        withRpcFallback: async (run) => run(),
        assertOperationSafety: async () => true,
        estimateWalletOp: async () => ({ fee: 800, storageFeeMutez: 0 }),
        sendWalletOp: async (method, options) => {
          window.__macaroniPurchaseSends.push({ method, options });
          return { opHash: operationHash, confirmation: async () => ({ completed: true }) };
        },
        assertOperationApplied: async () => ({ hash: operationHash, status: "applied" }),
        fetchOwnedTokenIds: async () => [],
        fetchMintedTokenIds: async () => [],
        fetchRecentMintTransfers: async () => [],
        fetchWalletIdentities: async () => ({}),
      };
    })();
  `;
}

test("an exported V3.5 page completes the public collector flow from an unrelated static origin", async ({ page, context }) => {
  const config = secureDropConfig();
  calls = [];
  privateCalls = [];

  await context.addCookies([{
    name: "wtfos_private_session",
    value: "must-not-cross-the-static-boundary",
    domain: "managed.wtfos.test",
    path: "/",
    secure: true,
    sameSite: "None",
  }]);

  await page.route("**/creation-tools/macaroni/drop.config.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.DROP_CONFIG = ${JSON.stringify(config)};`,
  }));
  for (const asset of ["vendor/tezos.js", "vendor/octez-connect.js", "js/octez-wallet.js"]) {
    await page.route(`**/creation-tools/macaroni/${asset}`, (route) => route.fulfill({
      contentType: "application/javascript",
      body: "",
    }));
  }
  await page.route("**/creation-tools/macaroni/js/common.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: walletAndChainFixture(),
  }));
  await page.route("https://tzkt-fixture.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: 321,
      hash: OPERATION_HASH,
      status: "applied",
      target: { address: CONTRACT },
      parameter: { entrypoint: "purchase" },
    }),
  }));
  await page.goto("/creation-tools/macaroni/drop.html", { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ url: "/creation-tools/macaroni/js/site-bundle.js" });

  const descriptor = await page.evaluate(() => {
    const configJs = `window.DROP_CONFIG = ${JSON.stringify(window.DROP_CONFIG)};`;
    return window.MDSiteBundle.assertSecretFreeConfig(configJs).service;
  });
  expect(Object.keys(descriptor).sort()).toEqual([
    "claimStatusUrlTemplate",
    "projectId",
    "provider",
    "publicStatusUrl",
    "purchaseStatusUrlTemplate",
    "schema",
    "wakeUrl",
  ]);
  for (const value of [
    descriptor.publicStatusUrl,
    descriptor.claimStatusUrlTemplate.replace("{claimId}", CLAIM_ID),
    descriptor.purchaseStatusUrlTemplate.replace("{operationHash}", OPERATION_HASH),
    descriptor.wakeUrl,
  ]) {
    const url = new URL(value);
    expect(url.origin).toBe(managedOrigin);
    expect(url.protocol).toBe("https:");
    expect(url.username).toBe("");
    expect(url.password).toBe("");
  }
  expect(JSON.stringify(config)).not.toMatch(/private-assets|\/drops\/|secret|credential|preimage|nonce/i);
  const staticOrigin = new URL(page.url()).origin;
  expect(staticOrigin).not.toBe(managedOrigin);

  await expect(page.getByRole("button", { name: "Purchase from this secure blind mint" })).toBeEnabled();
  await page.getByRole("button", { name: "Purchase from this secure blind mint" }).click();
  await expect(page.locator("#mintStatus")).toContainText("Purchase confirmed");
  await expect(page.locator("#fulfillmentSummary")).toHaveText("Your NFT metadata and artwork are ready.");

  await expect.poll(() => calls.some((call) => call.path.endsWith(`/purchases/${OPERATION_HASH}`))).toBe(true);
  await expect.poll(() => calls.some((call) => call.path.endsWith(`/claims/${CLAIM_ID}`))).toBe(true);
  expect(calls.some((call) => call.method === "POST" && call.path.includes("/wake/"))).toBe(true);
  expect(calls.some((call) => call.method === "GET" && call.path.includes("/status/"))).toBe(true);
  for (const call of calls) {
    expect(call.headers.origin).toBe(staticOrigin);
    expect(call.headers.cookie || "").toBe("");
    expect(call.headers.authorization || "").toBe("");
  }
  expect(await page.evaluate(() => window.__macaroniPurchaseSends)).toEqual([{
    method: { entrypoint: "purchase", quantity: 1 },
    options: { amount: 1_000_000, mutez: true },
  }]);

  const privateResult = await page.evaluate(async (url) => {
    try {
      const response = await fetch(url, { credentials: "omit" });
      return { blocked: false, status: response.status };
    } catch (error) {
      return { blocked: true, message: String(error) };
    }
  }, `${managedOrigin}/api/macaroni/v35/drops/1/setup`);
  expect(privateResult.blocked).toBe(true);
  expect(privateCalls).toHaveLength(1);
  expect(privateCalls[0].headers.origin).toBe(staticOrigin);
  expect(privateCalls[0].headers.cookie || "").toBe("");
  expect(calls.some((call) => call.path.startsWith("/api/macaroni/v35/drops/"))).toBe(false);
});
