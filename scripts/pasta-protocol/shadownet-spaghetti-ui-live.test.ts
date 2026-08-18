import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";
import { validateOperation, ValidationResult } from "@taquito/utils";
import { chromium } from "playwright";

import {
  buildPastaUiLiveProxyInstallerSource,
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveAppliedOperationAssertion,
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
  assertSpaghettiTzktOperationApplied,
  assertSpaghettiUiLiveExecutionAllowed,
  createSpaghettiCreatorCaptureGate,
  focusSpaghettiCompletionNotice,
  loadSpaghettiCompletedCollectorCaptures,
  waitForSpaghettiCollectorWrite,
  waitForSpaghettiLog,
} from "./shadownet-spaghetti-ui-live";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const OTHER_CONTRACT = "KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw";
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

type FakeSpaghettiOperationRecord = {
  hash: string;
  signerAddress: string;
  action: PastaUiLiveAppliedOperationAssertion["action"];
  contractAddress: string;
  entrypoints: string[];
  status: "pending" | "applied" | "rejected";
  rejection?: string;
};

class FakeSpaghettiFinality {
  readonly operations = new Map<string, FakeSpaghettiOperationRecord>();
  confirmationCalls = 0;
  private operationIndex = 0;

  constructor(private readonly hashes: readonly string[]) {}

  submit(input: {
    signerAddress: string;
    action: PastaUiLiveAppliedOperationAssertion["action"];
    contractAddress?: string;
    entrypoints: string[];
    apply?: () => void;
  }) {
    const hash = this.hashes[this.operationIndex++];
    assert.ok(hash, "fake Spaghetti operation hash fixture is exhausted");
    assert.equal(validateOperation(hash), ValidationResult.VALID, "fake Spaghetti operation hash is invalid");
    assert.equal(this.operations.has(hash), false, "fake Spaghetti operation hash must be unique");
    const record: FakeSpaghettiOperationRecord = {
      hash,
      signerAddress: input.signerAddress,
      action: input.action,
      contractAddress: input.contractAddress || CONTRACT,
      entrypoints: [...input.entrypoints],
      status: "pending",
    };
    this.operations.set(hash, record);
    let settled = false;
    let settlementError: unknown;
    const settle = () => {
      if (settled) return;
      settled = true;
      try {
        input.apply?.();
        record.status = "applied";
      } catch (error) {
        settlementError = error;
        record.status = "rejected";
        record.rejection = error instanceof Error ? error.message : String(error);
      }
    };
    queueMicrotask(settle);
    return {
      hash,
      ...(input.action === "originate" ? { contractAddress: record.contractAddress } : {}),
      confirmation: async () => {
        this.confirmationCalls += 1;
        await Promise.resolve();
        settle();
        if (record.status === "rejected") {
          throw settlementError instanceof Error
            ? settlementError
            : new Error(record.rejection || "fake Spaghetti operation rejected");
        }
        return 1;
      },
    };
  }

  assertOperationApplied(
    assertion: PastaUiLiveAppliedOperationAssertion,
    signerAddress: string,
  ): void {
    assert.equal(validateOperation(assertion.operationHash), ValidationResult.VALID);
    const operation = this.operations.get(assertion.operationHash);
    assert.ok(operation, `fake Spaghetti operation ${assertion.operationHash} is unknown`);
    assert.equal(
      operation.status,
      "applied",
      `fake Spaghetti operation ${assertion.operationHash} is ${operation.status}`,
    );
    assert.equal(operation.signerAddress, signerAddress, "fake Spaghetti operation signer drift");
    assert.equal(operation.action, assertion.action, "fake Spaghetti operation action drift");
    assert.equal(operation.contractAddress, assertion.contractAddress, "fake Spaghetti operation contract drift");
    assert.deepEqual(operation.entrypoints, assertion.entrypoints, "fake Spaghetti operation entrypoint drift");
  }
}

function createFakeTezos() {
  const finality = new FakeSpaghettiFinality(OPERATION_HASHES);
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
    finality,
    tezos: {
      tz: {
        async getBalance() {
          return { toString: () => "5000000" };
        },
      },
      contract: {
        async originate() {
          await new Promise((resolve) => setTimeout(resolve, 250));
          const operation = finality.submit({
            signerAddress: CREATOR,
            action: "originate",
            contractAddress: CONTRACT,
            entrypoints: [],
          });
          return {
            ...operation,
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
              return finality.submit({
                signerAddress: CREATOR,
                action: "batch",
                contractAddress: CONTRACT,
                entrypoints: pending.map((call) => call.entrypoint),
                apply: () => calls.push(...pending),
              });
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

test("real Spaghetti studio completes loopback browser choreography through fake Node callbacks", async () => {
  const outputRoot = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(tmpdir(), "spaghetti-ui-live-browser-")));
  const { tezos, calls, finality } = createFakeTezos();
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
    assertOperationApplied: (assertion) => finality.assertOperationApplied(assertion, CREATOR),
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
    await waitForSpaghettiLog(page, "imported 1 token(s) from CH-EASE handoff", 30_000);
    captures.push(await captureMockStage(page, monitor, outputRoot, 1, "configured", "imported 1 token(s)"));

    await page.click("#btnConnect");
    await waitForSpaghettiLog(page, `connected ${CREATOR} on shadownet`, 30_000);
    captures.push(await captureMockStage(page, monitor, outputRoot, 2, "connected", `connected ${CREATOR}`));

    await page.click("#btnPublish");
    await waitForSpaghettiLog(page, "originating collection contract", 30_000);
    captures.push(await captureMockStage(page, monitor, outputRoot, 3, "metadata-pinned", "originating collection contract"));
    await waitForSpaghettiLog(page, "collection deployed:", 30_000);
    captures.push(await captureMockStage(page, monitor, outputRoot, 4, "contract-originated", "collection deployed:"));
    await waitForSpaghettiLog(page, "token types created", 30_000);
    captures.push(await captureMockStage(page, monitor, outputRoot, 5, "token-created", "token types created"));
    await waitForSpaghettiLog(page, "editions minted", 30_000);
    captures.push(await captureMockStage(page, monitor, outputRoot, 6, "minted", "editions minted"));
    await waitForSpaghettiLog(page, "direct primary sales opened", 30_000);
    captures.push(await captureMockStage(page, monitor, outputRoot, 7, "sale-opened", "direct primary sales opened"));
    await waitForSpaghettiLog(page, `done — collection ${CONTRACT}`, 30_000);
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
    assert.equal(
      finality.confirmationCalls,
      0,
      "successful Spaghetti Studio verification must not depend on native confirmation polling",
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
  const collectorFinality = new FakeSpaghettiFinality([BUY_HASH]);
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
          return collectorFinality.submit({
            signerAddress: COLLECTOR,
            action: "call",
            contractAddress: CONTRACT,
            entrypoints: ["buy"],
            apply: () => {
              sale.remaining = 0;
            },
          });
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
    assertOperationApplied: (assertion) => collectorFinality.assertOperationApplied(assertion, COLLECTOR),
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
    await waitForSpaghettiCollectorWrite(
      page,
      "Confirmed on Tezos. On-chain state refreshed.",
      "Sold out",
      30_000,
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
    assert.equal(
      collectorFinality.confirmationCalls,
      0,
      "successful Spaghetti collector verification must not depend on native confirmation polling",
    );
  } finally {
    monitor.dispose();
    await browser.close();
    await server.close();
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("Spaghetti exact-hash TzKT validator accepts only the unambiguous applied signer operation", () => {
  const timestamp = "2026-07-23T12:34:56Z";
  const originationAssertion: PastaUiLiveAppliedOperationAssertion = {
    action: "originate",
    operationHash: OPERATION_HASHES[0],
    contractAddress: CONTRACT,
    entrypoints: [],
  };
  const origination = {
    type: "origination",
    status: "applied",
    hash: OPERATION_HASHES[0],
    sender: { address: CREATOR },
    originatedContract: { address: CONTRACT },
    level: 4_300_000,
    timestamp,
  };
  assert.equal(
    assertSpaghettiTzktOperationApplied({
      rows: origination,
      assertion: originationAssertion,
      signerAddress: CREATOR,
    }),
    origination,
  );

  const batchAssertion: PastaUiLiveAppliedOperationAssertion = {
    action: "batch",
    operationHash: OPERATION_HASHES[1],
    contractAddress: CONTRACT,
    entrypoints: ["create_token"],
  };
  const transaction = {
    type: "transaction",
    status: "applied",
    hash: OPERATION_HASHES[1],
    sender: { address: CREATOR },
    target: { address: CONTRACT },
    parameter: { entrypoint: "create_token" },
    level: 4_300_001,
    timestamp,
  };
  const internalTransaction = {
    ...transaction,
    sender: { address: CONTRACT },
    target: { address: CREATOR },
    parameter: { entrypoint: "default" },
  };
  assert.equal(
    assertSpaghettiTzktOperationApplied({
      rows: [transaction, internalTransaction],
      assertion: batchAssertion,
      signerAddress: CREATOR,
    }),
    transaction,
  );

  const buyAssertion: PastaUiLiveAppliedOperationAssertion = {
    action: "call",
    operationHash: BUY_HASH,
    contractAddress: CONTRACT,
    entrypoints: ["buy"],
  };
  const buy = {
    ...transaction,
    hash: BUY_HASH,
    sender: { address: COLLECTOR },
    parameter: { entrypoint: "buy" },
  };
  assert.equal(
    assertSpaghettiTzktOperationApplied({
      rows: [buy],
      assertion: buyAssertion,
      signerAddress: COLLECTOR,
    }),
    buy,
  );

  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [{ ...buy, status: "backtracked" }],
      assertion: buyAssertion,
      signerAddress: COLLECTOR,
    }),
    /not applied/,
  );
  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [{ ...buy, sender: { address: CREATOR } }],
      assertion: buyAssertion,
      signerAddress: COLLECTOR,
    }),
    /exactly one.*exact hash and signer/,
  );
  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [buy, { ...buy }],
      assertion: buyAssertion,
      signerAddress: COLLECTOR,
    }),
    /exactly one.*exact hash and signer/,
  );
  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [{ ...origination, type: "transaction" }],
      assertion: originationAssertion,
      signerAddress: CREATOR,
    }),
    /origination action differs/,
  );
  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [{ ...origination, originatedContract: { address: OTHER_CONTRACT } }],
      assertion: originationAssertion,
      signerAddress: CREATOR,
    }),
    /originated address differs/,
  );
  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [{ ...buy, target: { address: OTHER_CONTRACT } }],
      assertion: buyAssertion,
      signerAddress: COLLECTOR,
    }),
    /target differs/,
  );
  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [{ ...buy, parameter: { entrypoint: "mint" } }],
      assertion: buyAssertion,
      signerAddress: COLLECTOR,
    }),
    /entrypoint differs/,
  );
  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [{ ...buy, level: 0 }],
      assertion: buyAssertion,
      signerAddress: COLLECTOR,
    }),
    /level is invalid/,
  );
  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [{ ...buy, timestamp: "not-a-timestamp" }],
      assertion: buyAssertion,
      signerAddress: COLLECTOR,
    }),
    /timestamp is invalid/,
  );
  assert.throws(
    () => assertSpaghettiTzktOperationApplied({
      rows: [buy],
      assertion: { ...buyAssertion, entrypoints: ["buy", "mint"] },
      signerAddress: COLLECTOR,
    }),
    /exactly one entrypoint/,
  );
});

test("fake Spaghetti finality rejects pending and rejected operation states", async () => {
  const finality = new FakeSpaghettiFinality([BUY_HASH]);
  const operation = finality.submit({
    signerAddress: COLLECTOR,
    action: "call",
    contractAddress: CONTRACT,
    entrypoints: ["buy"],
    apply: () => {
      throw new Error("SALE_INACTIVE");
    },
  });
  const assertion: PastaUiLiveAppliedOperationAssertion = {
    action: "call",
    operationHash: operation.hash,
    contractAddress: CONTRACT,
    entrypoints: ["buy"],
  };
  assert.throws(
    () => finality.assertOperationApplied(assertion, COLLECTOR),
    /is pending/,
  );
  await assert.rejects(() => operation.confirmation(), /SALE_INACTIVE/);
  assert.equal(finality.confirmationCalls, 1, "explicit rejection observation must retain confirmation coverage");
  assert.throws(
    () => finality.assertOperationApplied(assertion, COLLECTOR),
    /is rejected/,
  );
});

test("Spaghetti browser waits surface Studio and collector write failures without timing out", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<pre id="log"></pre>');
    const studioStartedAt = Date.now();
    await page.evaluate(() => {
      setTimeout(() => {
        const log = document.getElementById("log");
        if (log) log.textContent = "publish failed: exact finality rejected";
      }, 25);
    });
    await assert.rejects(
      () => waitForSpaghettiLog(page, "done — collection", 5_000),
      /actual Spaghetti Studio publish failed: exact finality rejected/,
    );
    assert.ok(Date.now() - studioStartedAt < 3_000, "Studio publish failure should surface before its timeout");

    await page.setContent('<p id="status"></p><p id="chainState">Primary sale open</p>');
    const collectorStartedAt = Date.now();
    await page.evaluate(() => {
      setTimeout(() => {
        const status = document.getElementById("status");
        if (status) {
          status.textContent = "Operation rejected by exact finality verifier.";
          status.dataset.error = "true";
        }
      }, 25);
    });
    await assert.rejects(
      () => waitForSpaghettiCollectorWrite(
        page,
        "Confirmed on Tezos. On-chain state refreshed.",
        "Sold out",
        5_000,
      ),
      /actual Spaghetti collector write failed: Operation rejected by exact finality verifier/,
    );
    assert.ok(Date.now() - collectorStartedAt < 3_000, "collector write failure should surface before its timeout");
  } finally {
    await browser.close();
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
  assert.match(source, /Spaghetti recapture requires a terminal authenticated restart journal/);
  assert.match(source, /Spaghetti recapture refuses non-replayed creator effect/);
  assert.match(source, /loadSpaghettiCompletedCollectorCaptures\(appRoot\)/);
  assert.equal(
    (source.match(/assertOperationApplied: \(assertion\) => verifySpaghettiTzktOperationApplied/g) || []).length,
    2,
    "creator and collector sessions must independently verify exact operation hashes",
  );
  assert.doesNotMatch(source, /UI-MOCK/);
  assert.doesNotMatch(source, /recordVideo|recordHar|tracing\.start|launchPersistentContext/);
});

test("Spaghetti creator capture gate holds every replay phase until its visual evidence is retained", async () => {
  const gate = createSpaghettiCreatorCaptureGate();
  await gate.wait("pin_json");
  let originated = false;
  const origination = gate.wait("originate").then(() => { originated = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(originated, false, "origination must remain blocked before screenshot 003");
  gate.allowThrough(2);
  await origination;
  assert.equal(originated, true);

  let tokenPinned = false;
  const tokenPin = gate.wait("pin_json").then(() => { tokenPinned = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(tokenPinned, false, "token metadata pin must remain blocked before screenshot 004");
  gate.allowThrough(4);
  await tokenPin;
  await gate.wait("batch");

  let minted = false;
  const mint = gate.wait("batch").then(() => { minted = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(minted, false, "mint must remain blocked before screenshot 005");
  gate.allowThrough(5);
  await mint;

  let saleOpened = false;
  const sale = gate.wait("batch").then(() => { saleOpened = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saleOpened, false, "sale must remain blocked before screenshot 006");
  gate.allowThrough(6);
  await sale;
  assert.equal(saleOpened, true);
  gate.releaseAll();
});

test("completed Spaghetti recapture retains only hash-verified collector screenshots from the same proof", async () => {
  const outputRoot = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(tmpdir(), "spaghetti-completed-collector-captures-")));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
  });
  const monitor = monitorPastaProofPage(page);
  try {
    await page.route("http://pasta-proof.test/collector", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<h1>Spaghetti collector proof fixture</h1>",
    }));
    await page.goto("http://pasta-proof.test/collector");
    const specs = [
      [9, "load self-hosted primary sale", "primary sale loaded"],
      [10, "connect independent collector", "collector connected"],
      [11, "buy from creator primary sale", "collector purchase confirmed"],
    ] as const;
    const captures: CapturePastaProofStageResult[] = [];
    for (const [stageOrdinal, capability, stageName] of specs) {
      captures.push(await capturePastaProofStage({
        page,
        monitor,
        outputRoot,
        app: "spaghetti",
        capability,
        stageOrdinal,
        stageName,
        classification: "UI-LIVE",
        requiredEvidence: [{ selector: "h1", expectedText: "Spaghetti collector proof fixture" }],
        waitForLoadState: "none",
      }));
    }
    const appRoot = path.join(outputRoot, "spaghetti");
    const manifestPath = path.join(appRoot, "manifest.json");
    const manifest = {
      screenshots: captures.map((capture) => ({ ...capture.manifestScreenshot })),
      artifacts: captures.map((capture) => ({ ...capture.manifestSidecarArtifact })),
    };
    const receiptPath = path.join(appRoot, "artifacts", "spaghetti-ui-live-run.json");
    const receipt = {
      screenshots: captures.map((capture) => ({ ...capture.manifestScreenshot })),
      screenshotSidecars: captures.map((capture) => ({ ...capture.manifestSidecarArtifact })),
    };
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(receiptPath, JSON.stringify(receipt));

    const retained = await loadSpaghettiCompletedCollectorCaptures(appRoot);
    assert.deepEqual(
      retained.map((capture) => capture.manifestScreenshot.stage),
      captures.map((capture) => capture.manifestScreenshot.stage),
    );
    for (const capture of retained) await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);

    manifest.screenshots[0].sha256 = "0".repeat(64);
    receipt.screenshots[0].sha256 = "0".repeat(64);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(receiptPath, JSON.stringify(receipt));
    await assert.rejects(
      () => loadSpaghettiCompletedCollectorCaptures(appRoot),
      /manifest screenshot hash drift/,
    );
  } finally {
    monitor.dispose();
    await browser.close();
    await rm(outputRoot, { recursive: true, force: true });
  }
});
