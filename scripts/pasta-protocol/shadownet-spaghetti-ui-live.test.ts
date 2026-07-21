import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";
import { chromium } from "playwright";

import {
  buildPastaUiLiveProxyInstallerSource,
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLivePinProof,
} from "./pasta-ui-live-bridge-kit";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  verifyScreenshotSidecar,
  type CapturePastaProofStageResult,
} from "./pasta-proof-screenshot-kit";
import { root } from "./shadownet-proof-kit";
import {
  assertSpaghettiUiLiveExecutionAllowed,
  focusSpaghettiCompletionNotice,
} from "./shadownet-spaghetti-ui-live";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const CHAIN_ID = "NetXsqzbfFenSTS";
const CID = "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
const OPERATION_HASHES = [
  "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq",
  "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp",
  "ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM",
  "ontvJUZ9vNVusfHbcvzSX8xpPZMutmmwqqarvj4N78u2tUQn4oz",
];
const BUY_HASH = "onwA9NfZ61x8n7QAPnTVXpL7ZvR9C3gFATds1YDmFLGwAFrdgso";

function fakeProof(fileName: string): PastaUiLivePinProof {
  return {
    cid: CID,
    uri: `ipfs://${CID}`,
    fileName,
    mimeType: "application/json",
    byteLength: 123,
    sha256: "5af28061360b21d212e9b3f53af80d7b74b7656eaf7cc01c9e5c82a7aab28f08",
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${CID}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${CID}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

function createFakeTezos() {
  let operationIndex = 0;
  const calls: Array<{ entrypoint: string; payload: unknown }> = [];
  const contract = {
    address: CONTRACT,
    methodsObject: {
      create_token(payload: unknown) {
        return { entrypoint: "create_token", payload };
      },
      mint(payload: unknown) {
        return { entrypoint: "mint", payload };
      },
      set_sale(payload: unknown) {
        return { entrypoint: "set_sale", payload };
      },
    },
    async storage() {
      return { next_token_id: 1 };
    },
  };
  return {
    calls,
    tezos: {
      tz: {
        async getBalance() {
          return { toString: () => "5000000" };
        },
      },
      contract: {
        async originate() {
          await new Promise((resolve) => setTimeout(resolve, 250));
          return {
            hash: OPERATION_HASHES[operationIndex++],
            async confirmation() {
              return 1;
            },
            async contract() {
              return contract;
            },
          };
        },
        async at(address: string) {
          assert.equal(address, CONTRACT);
          return contract;
        },
        batch() {
          const pending: Array<{ entrypoint: string; payload: unknown }> = [];
          return {
            withContractCall(call: { entrypoint: string; payload: unknown }) {
              pending.push(call);
              return this;
            },
            async send() {
              await new Promise((resolve) => setTimeout(resolve, 250));
              calls.push(...pending);
              return {
                hash: OPERATION_HASHES[operationIndex++],
                async confirmation() {
                  return 1;
                },
              };
            },
          };
        },
      },
    } as any,
  };
}

async function captureMockStage(
  page: import("playwright").Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  name: string,
  logText: string,
): Promise<CapturePastaProofStageResult> {
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "spaghetti",
    capability: `fixture ${name}`,
    stageOrdinal: ordinal,
    stageName: name,
    classification: "UI-MOCK",
    requiredEvidence: [
      { selector: "h1", expectedText: "Spaghetti" },
      { selector: "#log", expectedText: logText },
    ],
    waitForLoadState: "none",
  });
}

async function waitForLog(page: import("playwright").Page, text: string): Promise<void> {
  await page.waitForFunction(
    (expected) => document.getElementById("log")?.textContent?.includes(expected),
    text,
    { timeout: 30_000 },
  );
}

test("real Spaghetti studio completes loopback browser choreography through fake Node callbacks", async () => {
  const outputRoot = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(tmpdir(), "spaghetti-ui-live-browser-")));
  const { tezos, calls } = createFakeTezos();
  const chainStages: string[] = [];
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["create_token", "mint", "set_sale"]),
    assertExpectedChain: async (stage) => {
      chainStages.push(stage);
      return CHAIN_ID;
    },
    pinJson: async ({ fileName }) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return fakeProof(fileName);
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 4_000_000,
    estimatedOriginationMutez: 3_000_000,
    operationReserveMutez: 1_000_000,
  });
  const server = await startPastaUiLiveLoopbackServer({
    staticRoot: path.join(root, "public"),
    handleAction: (request) => session.handle(request),
  });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const handoffKey = "wtfos.pasta.handoff.v1:spaghetti-ui-live-test";
  const handoff = {
    schemaVersion: "wtfos.pasta.chease-package.v1",
    kind: "collection",
    targetApp: "spaghetti",
    title: "Loopback Spaghetti Proof",
    description: "Real UI with fake server callbacks.",
    symbol: "LOOP",
    items: [{
      name: "Loopback token",
      description: "Browser bridge fixture",
      artifactUri: `ipfs://${CID}`,
      mimeType: "image/png",
      tags: ["loopback"],
    }],
  };
  await context.addInitScript({
    content: `sessionStorage.setItem(${JSON.stringify(handoffKey)}, ${JSON.stringify(JSON.stringify(handoff))});`,
  });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  const captures: CapturePastaProofStageResult[] = [];
  try {
    await page.goto(
      `${server.origin}/creation-tools/spaghetti/index.html?handoff=chease-package&handoffKey=${encodeURIComponent(handoffKey)}`,
      { waitUntil: "networkidle" },
    );
    await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await page.locator("#tokens .pp-token").waitFor({ state: "visible" });
    try {
      await installPastaUiLiveBrowserProxy(page, server, "UI-MOCK");
    } catch (error) {
      throw new Error(
        `proxy installation failed: ${error instanceof Error ? error.message : String(error)}; browser events=${JSON.stringify(monitor.list())}`,
      );
    }
    assert.equal((await page.content()).includes(server.sessionToken), false, "session nonce must not remain in serialized DOM");

    await page.selectOption("#network", "shadownet");
    await page.selectOption("#pinProvider", "node");
    await page.fill("#pinNode", "http://127.0.0.1:5001");
    await page.fill("#collName", "Loopback Spaghetti Proof");
    await page.fill("#collSymbol", "LOOP");
    await page.locator(".t-name").fill("Loopback token");
    await page.locator(".t-editions").fill("2");
    await page.locator(".t-price").fill("0.001");
    await page.locator(".t-sale-count").fill("1");
    await waitForLog(page, "imported 1 token(s) from CH-EASE handoff");
    captures.push(await captureMockStage(page, monitor, outputRoot, 1, "configured", "imported 1 token(s)"));

    await page.click("#btnConnect");
    await waitForLog(page, `connected ${CREATOR} on shadownet`);
    captures.push(await captureMockStage(page, monitor, outputRoot, 2, "connected", `connected ${CREATOR}`));

    await page.click("#btnPublish");
    await waitForLog(page, "originating collection contract");
    captures.push(await captureMockStage(page, monitor, outputRoot, 3, "metadata-pinned", "originating collection contract"));
    await waitForLog(page, "collection deployed:");
    captures.push(await captureMockStage(page, monitor, outputRoot, 4, "contract-originated", "collection deployed:"));
    await waitForLog(page, "token types created");
    captures.push(await captureMockStage(page, monitor, outputRoot, 5, "token-created", "token types created"));
    await waitForLog(page, "editions minted");
    captures.push(await captureMockStage(page, monitor, outputRoot, 6, "minted", "editions minted"));
    await waitForLog(page, "direct primary sales opened");
    captures.push(await captureMockStage(page, monitor, outputRoot, 7, "sale-opened", "direct primary sales opened"));
    await waitForLog(page, `done — collection ${CONTRACT}`);
    await focusSpaghettiCompletionNotice(page);
    assert.deepEqual(
      await page.locator("#ppNotice").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          active: document.activeElement === element,
          fullyInViewport:
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth,
        };
      }),
      { active: true, fullyInViewport: true },
    );
    captures.push(await captureMockStage(page, monitor, outputRoot, 8, "complete", "done — collection"));

    assert.equal(captures.length, 8);
    assert.notEqual(
      captures[6].manifestScreenshot.sha256,
      captures[7].manifestScreenshot.sha256,
      "sale-opened and complete must be visually distinct proof stages",
    );
    for (const capture of captures) {
      assert.equal(capture.sidecar.classification, "UI-MOCK");
      await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);
    }
    assert.deepEqual(calls.map((call) => call.entrypoint), ["create_token", "mint", "set_sale"]);
    assert.deepEqual(
      session.getReceipts().filter((receipt) => receipt.operationHash).map((receipt) => receipt.operationHash),
      OPERATION_HASHES,
    );
    assert.ok(chainStages.includes("before UI-live origination"));
    assert.ok(chainStages.includes("before UI-live batch"));
    const publicState = await page.evaluate(() => {
      const state = (window as any).__pastaUiLiveBridge;
      return {
        classification: state?.classification,
        account: state?.getAccount?.(),
        pinCount: state?.pins?.length,
      };
    });
    assert.deepEqual(publicState, { classification: "UI-MOCK", account: CREATOR, pinCount: 2 });
  } finally {
    monitor.dispose();
    await browser.close();
    await server.close();
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("real Spaghetti self-hosted page completes a separate-collector buy through the guarded bridge", async () => {
  const outputRoot = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(tmpdir(), "spaghetti-ui-live-collector-")));
  const sale = {
    active: true,
    seller: CREATOR,
    treasury: CREATOR,
    price: 1_000,
    remaining: 1,
    start: null,
    end: null,
  };
  const tokenInfo = new MichelsonMap<string, string>();
  tokenInfo.set("", "697066733a2f2f" + Buffer.from(CID).toString("hex"));
  const buyCalls: Array<{ payload: unknown; options: unknown }> = [];
  const rawStorage = {
    sales: { get: async () => sale },
    token_metadata: {
      get: async () => ({ token_id: 0, token_info: tokenInfo }),
    },
    total_supply: { get: async () => 2 },
  };
  const contract = {
    methodsObject: {
      buy: (payload: unknown) => ({
        send: async (options: unknown) => {
          buyCalls.push({ payload, options });
          sale.remaining = 0;
          return { hash: BUY_HASH, confirmation: async () => 1 };
        },
      }),
    },
    storage: async () => rawStorage,
  };
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: { at: async () => contract },
  } as any;
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: COLLECTOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["buy"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async ({ fileName }) => fakeProof(fileName),
    projectStorage: async (storageValue) => {
      const storage = storageValue as typeof rawStorage;
      const sales = new MichelsonMap<string, unknown>();
      const token_metadata = new MichelsonMap<string, unknown>();
      const total_supply = new MichelsonMap<string, unknown>();
      sales.set("0", await storage.sales.get());
      token_metadata.set("0", await storage.token_metadata.get());
      total_supply.set("0", await storage.total_supply.get());
      return { sales, token_metadata, total_supply };
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 501_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 500_000,
  });
  const server = await startPastaUiLiveLoopbackServer({
    staticRoot: path.join(root, "public"),
    handleAction: (request) => session.handle(request),
  });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  const captures: CapturePastaProofStageResult[] = [];
  try {
    const config = {
      app: "spaghetti",
      label: "Spaghetti",
      title: "Collector bridge proof",
      description: "Independent collector purchase",
      contract: CONTRACT,
      tokenId: 0,
      network: "shadownet",
      ipfsGateway: "https://proof.invalid/ipfs/",
    };
    await page.route("**/creation-tools/spaghetti/pasta.config.js", (route) =>
      route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: `window.PASTA_SITE_CONFIG=${JSON.stringify(config)};`,
      }));
    await page.route("**/creation-tools/spaghetti/js/site.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${buildPastaUiLiveProxyInstallerSource(server.origin, server.sessionToken, "UI-MOCK")}\n${await response.text()}`,
      });
    });
    await page.route("https://proof.invalid/ipfs/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "Collector bridge proof",
          description: "Independent collector purchase",
        }),
      }));
    await page.goto(`${server.origin}/creation-tools/spaghetti/site.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("chainState")?.textContent === "Primary sale open");
    captures.push(await capturePastaProofStage({
      page,
      monitor,
      outputRoot,
      app: "spaghetti",
      capability: "fixture collector sale",
      stageOrdinal: 9,
      stageName: "collector sale loaded",
      classification: "UI-MOCK",
      requiredEvidence: [
        { selector: "#appLabel", expectedText: "Spaghetti · Pasta Protocol" },
        { selector: "#status", expectedText: "On-chain state loaded." },
        { selector: "#chainState", expectedText: "Primary sale open" },
      ],
      waitForLoadState: "none",
    }));

    await page.click("#connect");
    await page.waitForFunction(() => document.getElementById("status")?.textContent?.startsWith("Wallet connected."));
    captures.push(await capturePastaProofStage({
      page,
      monitor,
      outputRoot,
      app: "spaghetti",
      capability: "fixture collector connection",
      stageOrdinal: 10,
      stageName: "collector connected",
      classification: "UI-MOCK",
      requiredEvidence: [
        { selector: "#status", expectedText: "Wallet connected. Review the action before signing." },
        { selector: "#chainState", expectedText: "Primary sale open" },
      ],
      waitForLoadState: "none",
    }));

    await page.click("#submit");
    await page.waitForFunction(
      () =>
        document.getElementById("status")?.textContent === "Confirmed on Tezos. On-chain state refreshed." &&
        document.getElementById("chainState")?.textContent === "Sold out",
    );
    captures.push(await capturePastaProofStage({
      page,
      monitor,
      outputRoot,
      app: "spaghetti",
      capability: "fixture collector purchase",
      stageOrdinal: 11,
      stageName: "collector purchase confirmed",
      classification: "UI-MOCK",
      requiredEvidence: [
        { selector: "#status", expectedText: "Confirmed on Tezos. On-chain state refreshed." },
        { selector: "#chainState", expectedText: "Sold out" },
      ],
      waitForLoadState: "none",
    }));

    assert.equal(captures.length, 3);
    for (const capture of captures) await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);
    assert.deepEqual(JSON.parse(JSON.stringify(buyCalls)), [
      { payload: { token_id: 0, amount: 1 }, options: { amount: 1_000, mutez: true } },
    ]);
    assert.equal(session.getReceipts().filter((entry) => entry.operationHash)[0]?.operationHash, BUY_HASH);
  } finally {
    monitor.dispose();
    await browser.close();
    await server.close();
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("production runner is execute-gated, Shadownet-only, and contains no recorder configuration", async () => {
  assert.throws(
    () => assertSpaghettiUiLiveExecutionAllowed({}),
    /explicit Spaghetti UI-live execute flag is required/,
  );
  assert.throws(
    () => assertSpaghettiUiLiveExecutionAllowed({
      PASTA_SHADOWNET_SPAGHETTI_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "mainnet",
    }),
    /only permits Shadownet/,
  );
  assert.doesNotThrow(() => assertSpaghettiUiLiveExecutionAllowed({
    PASTA_SHADOWNET_SPAGHETTI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/proof",
    TEZOS_NETWORK: "shadownet",
  }));

  const source = await readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-spaghetti-ui-live.ts"), "utf8");
  assert.match(source, /classification: "UI-LIVE"/);
  assert.match(source, /loadSignerPair\(env\)/);
  assert.match(source, /assertShadownet\(tezos/);
  assert.match(source, /authorizeAfterFundingPreflight/);
  assert.match(source, /pastaprotocol-app-proof@1/);
  assert.match(source, /pastaprotocol-spaghetti-tzkt-index@1/);
  assert.match(source, /tokens\/balances\?account=/);
  assert.match(source, /publicGatewayVerified/);
  assert.doesNotMatch(source, /UI-MOCK/);
  assert.doesNotMatch(source, /recordVideo|recordHar|tracing\.start|launchPersistentContext/);
});
