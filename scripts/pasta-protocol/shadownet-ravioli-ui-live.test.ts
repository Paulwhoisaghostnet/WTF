import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";
import { chromium, type BrowserContext, type Page } from "playwright";

import {
  buildPastaUiLiveProxyInstallerSource,
  hashJsonForBridge,
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
import {
  assertTzktBalanceRecords,
  assertTzktFa2ContractRecord,
  assertTzktTokenRecords,
  assertRavioliUiLiveExecutionAllowed,
  buildRavioliRevealCapability,
  createRavioliMirroredSessionHandler,
  dependencyOriginationReceipt,
  ravioliDeliveredTokenExplorerUrls,
  RavioliUiLivePolicy,
  RavioliUiStateMirror,
  RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
  RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES,
  RAVIOLI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
  RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
  sampleRavioliUiLiveMemory,
  validateRavioliNativeDependencyTransition,
  validateRavioliOpenKitDownload,
} from "./shadownet-ravioli-ui-live";
import { root, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR_ONE = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const COLLECTOR_TWO = "tz1gjaF81ZRRvdzjobyfVNsAeSC6PScjfQwN";
const GNOCCHI = "KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw";
const ROTINI = "KT1BYMrRC1ZvoHJWaSvFpiRsd5ZM2YcRh3Ls";
const ROUTER = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const GNOCCHI_ADAPTER = "KT1LF14kfDc3nGq8Vs26J2BykYixWeEfYqMQ";
const ROTINI_ADAPTER = "KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn";
const STATIC_ROOT = path.join(root, "public");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);
const MODES = [
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
] as const;
const ADDRESSES = [ROUTER, GNOCCHI_ADAPTER, ROTINI_ADAPTER];

type FakeCall = { contractAddress: string; entrypoint: string; payload: any; sendOptions: any };

class PoisonedBigMapAbstraction {
  readonly id = 123;
  constructor(private readonly onRead: () => void) {}
  get provider() {
    this.onRead();
    throw new Error("provider graph must never be traversed");
  }
  get schema() {
    this.onRead();
    throw new Error("schema graph must never be traversed");
  }
  get(_key: string) {
    return Promise.resolve(undefined);
  }
}

class FakeRavioliChain {
  readonly calls: FakeCall[] = [];
  poisonedBigMapReads = 0;
  private originIndex = 0;
  private operationIndex = 0;

  private operation(apply?: () => void) {
    const hash = `opFakeRavioli${String(++this.operationIndex).padStart(38, "1")}`;
    return {
      hash,
      async confirmation() {
        await new Promise((resolve) => setTimeout(resolve, 35));
        apply?.();
        return 1;
      },
    };
  }

  private storage(address: string) {
    if (address === ROUTER) {
      return {
        packs: new MichelsonMap(),
        token_metadata: new MichelsonMap(),
        total_supply: new MichelsonMap(),
        opened: new MichelsonMap(),
        sales: new MichelsonMap(),
      };
    }
    if (address === GNOCCHI_ADAPTER) {
      return {
        administrator: CREATOR,
        allocations: new MichelsonMap(),
        metadata: new PoisonedBigMapAbstraction(() => { this.poisonedBigMapReads += 1; }),
        next_resource_id: 0,
      };
    }
    if (address === ROTINI_ADAPTER) {
      return {
        administrator: CREATOR,
        resources: new MichelsonMap(),
        metadata: new PoisonedBigMapAbstraction(() => { this.poisonedBigMapReads += 1; }),
        next_resource_id: 0,
      };
    }
    return { next_token_id: 5 };
  }

  private contract(address: string) {
    return {
      address,
      methodsObject: new Proxy({}, {
        get: (_target, entrypoint) => (payload: unknown) => ({
          send: async (sendOptions: unknown = {}) => this.operation(() => {
            this.calls.push({ contractAddress: address, entrypoint: String(entrypoint), payload, sendOptions });
          }),
        }),
      }),
      storage: async () => this.storage(address),
    };
  }

  toolkit(address: string) {
    return {
      tz: {
        async getBalance(requested: string) {
          assert.equal(requested, address);
          return { toString: () => "50000000" };
        },
      },
      contract: {
        originate: async () => {
          const originated = ADDRESSES[this.originIndex++];
          assert.ok(originated);
          const operation = this.operation();
          return {
            ...operation,
            async contract() { return { address: originated }; },
          };
        },
        at: async (contractAddress: string) => this.contract(contractAddress),
        batch() { throw new Error("Ravioli fixture does not batch"); },
      },
    } as any;
  }
}

let pinIndex = 0;
function fakeProof(fileName: string, mimeType = "application/json"): PastaUiLivePinProof {
  const suffix = String(++pinIndex).padStart(4, "a").replace(/0/g, "b").replace(/1/g, "c").replace(/2/g, "d").replace(/3/g, "e").replace(/4/g, "f").replace(/5/g, "g").replace(/6/g, "h").replace(/7/g, "i").replace(/8/g, "j").replace(/9/g, "k");
  const cid = `bafybeigdyrzt5sfp7udm7hu76uh7y26nf3cte5${suffix}zzzzzzzzzzzzzzzz`;
  return {
    cid,
    uri: `ipfs://${cid}`,
    fileName,
    mimeType,
    byteLength: 123,
    sha256: "5af28061360b21d212e9b3f53af80d7b74b7656eaf7cc01c9e5c82a7aab28f08",
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

async function artifacts() {
  const base = path.join(STATIC_ROOT, "creation-tools", "ravioli", "contract");
  const [router, gnocchiAdapter, rotiniAdapter] = await Promise.all([
    readFile(path.join(base, "pasta-bundle.contract.json"), "utf8").then(JSON.parse),
    readFile(path.join(base, "pasta-gnocchi-pack-adapter.contract.json"), "utf8").then(JSON.parse),
    readFile(path.join(base, "pasta-rotini-pack-adapter.contract.json"), "utf8").then(JSON.parse),
  ]);
  return { router, gnocchiAdapter, rotiniAdapter };
}

async function openStudio(server: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: PASTA_PROOF_VIEWPORT, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: true });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  await page.goto(`${server.origin}/creation-tools/ravioli/index.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
  await installPastaUiLiveBrowserProxy(page, server, "UI-MOCK");
  return { browser, context, page, monitor };
}

async function openSite(input: {
  server: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
  config: any;
}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: PASTA_PROOF_VIEWPORT, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block" });
  const proxy = buildPastaUiLiveProxyInstallerSource(input.server.origin, input.server.sessionToken, "UI-MOCK");
  const source = await readFile(path.join(STATIC_ROOT, "creation-tools", "ravioli", "js", "site.js"), "utf8");
  await context.route("**/pasta.config.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: `window.PASTA_SITE_CONFIG=${JSON.stringify(input.config)};` }));
  await context.route("**/js/site.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: `${proxy}\n${source}` }));
  await context.route("http://127.0.0.1:8080/ipfs/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ name: input.config.title, description: "Ravioli UI-live fixture metadata" }),
  }));
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  await page.goto(`${input.server.origin}/creation-tools/ravioli/site.html`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return status?.textContent?.includes("On-chain state loaded.") || status?.dataset.error === "true";
    }, undefined, { timeout: 10_000 });
  } catch (error) {
    const status = (await page.locator("#status").textContent()) || "";
    const scripts = await page.locator("script").evaluateAll((nodes) => nodes.map((node) => ({ src: (node as HTMLScriptElement).src, loaded: (node as HTMLScriptElement).dataset.loaded || "" })));
    const globals = await page.evaluate(() => ({
      bridge: Boolean((window as any).__pastaUiLiveBridge?.installed),
      config: (window as any).PASTA_SITE_CONFIG || null,
      md: Boolean((window as any).MD),
      toolkit: Boolean((window as any).MD?.getToolkit?.()),
      resources: performance.getEntriesByType("resource").map((entry: any) => ({ name: entry.name, duration: entry.duration, transferSize: entry.transferSize })),
    }));
    throw new Error(`site initialization timed out: ${status}; globals=${JSON.stringify(globals)}; browser events=${JSON.stringify(monitor.list())}; scripts=${JSON.stringify(scripts)}`, { cause: error });
  }
  const initialStatus = (await page.locator("#status").textContent()) || "";
  assert.match(initialStatus, /On-chain state loaded\./, `site initialization failed: ${initialStatus}`);
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", "http://127.0.0.1:5001");
  return { browser, context, page, monitor };
}

async function waitFor(page: Page, selector: string, expected: string) {
  await page.waitForFunction(
    ({ selector: selected, expected: text }) => document.querySelector(selected)?.textContent?.includes(text),
    { selector, expected },
    { timeout: 30_000 },
  );
}

type SiteActionDiagnosticContext = {
  tokenId: number;
  actor: string;
  phase: "buy" | "open";
  monitor: ReturnType<typeof monitorPastaProofPage>;
  getSessionReceipts: () => Array<{ action: string; sequence: number; entrypoints?: string[]; operationHash?: string }>;
};

async function siteActionSnapshot(
  page: Page,
  selector: string,
  beforeBrowserCallCount: number,
  beforeSessionReceiptCount: number,
  diagnostic: SiteActionDiagnosticContext,
) {
  const browser = await page.evaluate(({ selected, beforeCalls }) => {
    const selectedButton = document.querySelector(selected) as HTMLButtonElement | null;
    const submitButton = document.querySelector("#submit") as HTMLButtonElement | null;
    const secondaryButton = document.querySelector("#secondarySubmit") as HTMLButtonElement | null;
    const selectedStyle = selectedButton ? getComputedStyle(selectedButton) : null;
    const submitStyle = submitButton ? getComputedStyle(submitButton) : null;
    const secondaryStyle = secondaryButton ? getComputedStyle(secondaryButton) : null;
    const receipts = ((window as any).__pastaUiLiveBridge?.receipts || []) as any[];
    const calls = receipts.filter((receipt) => receipt.action === "call");
    const status = document.getElementById("status");
    return {
      selectedButton: {
        exists: Boolean(selectedButton),
        text: selectedButton?.textContent?.trim() || "",
        hidden: selectedButton?.hidden ?? null,
        disabled: selectedButton?.disabled ?? null,
        visible: Boolean(selectedButton && !selectedButton.hidden && selectedStyle?.display !== "none" && selectedStyle?.visibility !== "hidden"),
      },
      submitButton: {
        exists: Boolean(submitButton),
        text: submitButton?.textContent?.trim() || "",
        hidden: submitButton?.hidden ?? null,
        disabled: submitButton?.disabled ?? null,
        visible: Boolean(submitButton && !submitButton.hidden && submitStyle?.display !== "none" && submitStyle?.visibility !== "hidden"),
      },
      secondaryButton: {
        exists: Boolean(secondaryButton),
        text: secondaryButton?.textContent?.trim() || "",
        hidden: secondaryButton?.hidden ?? null,
        disabled: secondaryButton?.disabled ?? null,
        visible: Boolean(secondaryButton && !secondaryButton.hidden && secondaryStyle?.display !== "none" && secondaryStyle?.visibility !== "hidden"),
      },
      chainState: document.getElementById("chainState")?.textContent?.trim() || "",
      status: status?.textContent?.trim() || "",
      statusError: status?.dataset.error || "",
      amount: (document.getElementById("amount") as HTMLInputElement | null)?.value || "",
      openKitLength: (document.getElementById("openKit") as HTMLTextAreaElement | null)?.value.length || 0,
      openArtifactFiles: (document.getElementById("openArtifact") as HTMLInputElement | null)?.files?.length || 0,
      browserCallCount: calls.length,
      browserCallDelta: calls.length - beforeCalls,
      browserCalls: calls.slice(Math.max(0, beforeCalls - 1)).map((receipt) => ({
        sequence: receipt.sequence,
        entrypoints: receipt.entrypoints,
        operationHash: receipt.operationHash,
      })),
    };
  }, { selected: selector, beforeCalls: beforeBrowserCallCount });
  const sessionReceipts = diagnostic.getSessionReceipts();
  return {
    tokenId: diagnostic.tokenId,
    actor: diagnostic.actor,
    phase: diagnostic.phase,
    selector,
    ...browser,
    sessionReceiptCount: sessionReceipts.length,
    sessionReceiptDelta: sessionReceipts.length - beforeSessionReceiptCount,
    sessionReceipts: sessionReceipts.slice(Math.max(0, beforeSessionReceiptCount - 1)),
    browserEvents: diagnostic.monitor.list(),
  };
}

async function clickAndWaitForSiteSuccess(page: Page, selector: string, diagnostic: SiteActionDiagnosticContext) {
  const previousCallCount = await page.evaluate(() => (
    ((window as any).__pastaUiLiveBridge?.receipts || []).filter((receipt: any) => receipt.action === "call").length
  ));
  const previousSessionReceiptCount = diagnostic.getSessionReceipts().length;
  const before = await siteActionSnapshot(page, selector, previousCallCount, previousSessionReceiptCount, diagnostic);
  try {
    await page.click(selector);
    await page.waitForFunction((beforeCalls) => {
      const status = document.getElementById("status");
      const calls = ((window as any).__pastaUiLiveBridge?.receipts || []).filter((receipt: any) => receipt.action === "call").length;
      return calls > beforeCalls || status?.dataset.error === "true";
    }, previousCallCount, { timeout: 30_000 });
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return status?.textContent?.includes("Confirmed on Tezos") || status?.dataset.error === "true";
    }, undefined, { timeout: 30_000 });
    const status = (await page.locator("#status").textContent()) || "";
    assert.match(status, /Confirmed on Tezos/, `site action failed: ${status}`);
  } catch (error) {
    const after = await siteActionSnapshot(page, selector, previousCallCount, previousSessionReceiptCount, diagnostic);
    throw new Error(`Ravioli fixture action timeout: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`, { cause: error });
  }
  return {
    before,
    after: await siteActionSnapshot(page, selector, previousCallCount, previousSessionReceiptCount, diagnostic),
  };
}

function recipes(mode: number) {
  const escrow = (tokenId: number) => ({ kind: "escrow", fa2: GNOCCHI, tokenId, amount: 1 });
  if (mode === 0) return [[escrow(0)]];
  if (mode === 1) return [[escrow(0)], [escrow(1)]];
  if (mode === 2) return [[{ kind: "allocated", amount: 1 }]];
  if (mode === 3) return [[{ kind: "generative", amount: 1 }]];
  return [[escrow(1), { kind: "allocated", amount: 1 }, { kind: "generative", amount: 1 }]];
}

async function configurePack(page: Page, mode: number, routerAddress: string) {
  const editions = mode === 1 ? 2 : 1;
  await page.selectOption("#bnMode", String(mode));
  await page.fill("#bnEditions", String(editions));
  await page.fill("#bnName", `Fixture ${MODES[mode]}`);
  await page.fill("#bnDesc", `Real Ravioli page fixture ${mode}`);
  await page.fill("#bnTags", "ravioli, fixture");
  await page.check("#bnForSale");
  await page.fill("#bnPrice", mode === 0 ? "0" : "0.000001");
  await page.fill("#bnSaleCount", String(editions));
  if (!(await page.locator("#recipeJson").isVisible())) {
    await page.locator("#recipeJson").locator("xpath=ancestor::details").locator("summary").click();
  }
  await page.fill("#recipeJson", JSON.stringify(recipes(mode)));
  await page.setInputFiles("#bnArtifact", { name: `ravioli-wrapper-${mode}.png`, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.from(String(mode))]) });
  if (mode === 0) await page.check('input[name="target"][value="new_collection"]');
  else {
    await page.check('input[name="target"][value="existing_contract"]');
    await page.fill("#existingKt", routerAddress);
  }
}

async function capture(outputRoot: string, actor: { page: Page; monitor: ReturnType<typeof monitorPastaProofPage> }, ordinal: number, stage: string, selector: string, expectedText: string): Promise<CapturePastaProofStageResult> {
  await actor.page.locator(selector).scrollIntoViewIfNeeded();
  return capturePastaProofStage({ page: actor.page, monitor: actor.monitor, outputRoot, app: "ravioli", capability: "five-mode real-page fixture", stageOrdinal: ordinal, stageName: stage, classification: "UI-MOCK", requiredEvidence: [{ selector, expectedText }], waitForLoadState: "none" });
}

test("real Ravioli studio and buyer page drive all five v3 modes through loopback signer callbacks", async (context) => {
  const baselineHeapUsed = process.memoryUsage().heapUsed;
  const memorySamples = [sampleRavioliUiLiveMemory("browser-fixture-start")];
  const outputRoot = await mkdtemp(path.join(tmpdir(), "ravioli-ui-live-browser-"));
  const chain = new FakeRavioliChain();
  const mirror = new RavioliUiStateMirror();
  const pins: any[] = [];
  const code = await artifacts();
  const dependencies: any = {
    gnocchi: {
      address: GNOCCHI,
      allocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
      tokenMetadataUris: ["ipfs://gnocchi0", "ipfs://gnocchi1", "ipfs://gnocchi2"],
    },
    rotini: { address: ROTINI, projectId: 3, nextTokenId: 5, generatedTokenIds: [5, 6] },
  };
  const policy = new RavioliUiLivePolicy({ administrator: CREATOR, dependencies, mirror, pins, codeHashes: { router: hashJsonForBridge(code.router), gnocchiAdapter: hashJsonForBridge(code.gnocchiAdapter), rotiniAdapter: hashJsonForBridge(code.rotiniAdapter) } });
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: chain.toolkit(CREATOR), signerAddress: CREATOR, expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([GNOCCHI, ROTINI]), allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
    pinJson: async ({ fileName }) => fakeProof(fileName), pinBlob: async ({ fileName, mimeType }) => fakeProof(fileName, mimeType),
    validateOrigination: (input) => policy.validateOrigination(input), validateCall: (input) => policy.validateCall(input),
    projectStorage: (storage) => mirror.project(storage),
    onPin: ({ value, bytes, proof }) => { pins.push({ value, bytes, proof }); },
  });
  creatorSession.authorizeAfterFundingPreflight({ balanceMutez: 50_000_000, requiredBalanceMutez: 10_000_000, estimatedOriginationMutez: 5_000_000, operationReserveMutez: 5_000_000 });
  const creatorServer = await startPastaUiLiveLoopbackServer({ staticRoot: STATIC_ROOT, handleAction: createRavioliMirroredSessionHandler({ session: creatorSession, mirror, policy, signerAddress: CREATOR }) });
  let studio: Awaited<ReturnType<typeof openStudio>> | null = null;
  let collectorOneServer: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>> | null = null;
  let collectorTwoServer: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>> | null = null;
  const captures: CapturePastaProofStageResult[] = [];
  try {
    studio = await openStudio(creatorServer);
    await studio.page.selectOption("#network", "shadownet");
    await studio.page.selectOption("#pinProvider", "node");
    await studio.page.fill("#pinNode", "http://127.0.0.1:5001");
    await studio.page.fill("#collName", "Ravioli UI-LIVE Atomic Packs");
    await studio.page.fill("#collSymbol", "RVUI");
    await studio.page.locator("#adapterSetup > summary").click();
    await studio.page.fill("#gTargetKt", GNOCCHI);
    await studio.page.fill("#gTokenId", String(RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID));
    await studio.page.fill("#rTargetKt", ROTINI);
    await studio.page.fill("#rProjectId", "3");
    await studio.page.click("#btnConnect");
    await waitFor(studio.page, "#log", `connected ${CREATOR} on shadownet`);
    const kits: any[] = [];
    for (let mode = 0; mode < 5; mode += 1) {
      await configurePack(studio.page, mode, mirror.routerAddress);
      const downloadPromise = studio.page.waitForEvent("download");
      await studio.page.click("#btnPublish");
      const download = await downloadPromise.catch(async (error) => {
        const log = (await studio?.page.locator("#log").textContent()) || "";
        throw new Error(
          `Ravioli open-kit download did not start for mode ${mode}; log=${JSON.stringify(log)}; browser events=${JSON.stringify(studio?.monitor.list() || [])}`,
          { cause: error },
        );
      });
      await waitFor(studio.page, "#log", `pack ${mode} is fully reserved and ready`);
      await studio.page.waitForFunction(() => !document.getElementById("btnPublish")?.hasAttribute("disabled"));
      const inPageJson = await studio.page.inputValue("#openKit");
      const downloadPath = await download.path();
      assert.ok(downloadPath);
      const openKitCapture = validateRavioliOpenKitDownload({
        mode,
        routerAddress: mirror.routerAddress,
        suggestedFilename: download.suggestedFilename(),
        inPageJson,
        downloadedBytes: await readFile(downloadPath),
      });
      const kit = openKitCapture.kit;
      mirror.registerKit(kit);
      kits.push(kit);
      memorySamples.push(sampleRavioliUiLiveMemory(`browser-fixture-pack-${mode}-published`));
    }
    captures.push(await capture(outputRoot, studio, 1, "five products issued", "#log", "pack 4 is fully reserved"));
    assert.equal(mirror.nextTokenId, 5);
    assert.equal(mirror.gnocchiNextResourceId, 2);
    assert.equal(mirror.rotiniNextResourceId, 2);
    assert.equal(pins.filter((pin) => pin.proof.fileName.includes("pack-adapter-contract")).length, 2);

    const makeCollector = async (wallet: string) => {
      const session = new TaquitoPastaUiLiveSession({
        tezos: chain.toolkit(wallet), signerAddress: wallet, expectedChainId: SHADOWNET_CHAIN_ID,
        allowedContractAddresses: new Set([ROUTER]), allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
        assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
        pinJson: async ({ fileName }) => fakeProof(fileName), pinBlob: async ({ fileName, mimeType }) => fakeProof(fileName, mimeType),
        validateCall: (input) => policy.validateCollectorCall(wallet, input), projectStorage: () => mirror.projectRouter(),
        onPin: ({ value, bytes, proof }) => { pins.push({ value, bytes, proof }); },
      });
      session.authorizeAfterFundingPreflight({ balanceMutez: 50_000_000, requiredBalanceMutez: 2_000_000, estimatedOriginationMutez: 0, operationReserveMutez: 2_000_000 });
      const server = await startPastaUiLiveLoopbackServer({ staticRoot: STATIC_ROOT, handleAction: createRavioliMirroredSessionHandler({ session, mirror, policy, signerAddress: wallet }) });
      return { session, server };
    };
    const collectorOne = await makeCollector(COLLECTOR_ONE);
    const collectorTwo = await makeCollector(COLLECTOR_TWO);
    collectorOneServer = collectorOne.server;
    collectorTwoServer = collectorTwo.server;
    const openings = [[0, collectorOne, COLLECTOR_ONE], [1, collectorOne, COLLECTOR_ONE], [1, collectorTwo, COLLECTOR_TWO], [2, collectorOne, COLLECTOR_ONE], [3, collectorTwo, COLLECTOR_TWO], [4, collectorOne, COLLECTOR_ONE]] as const;
    let captureOrdinal = 2;
    for (const [tokenId, collector, actor] of openings) {
      const site = await openSite({ server: collector.server, config: { app: "ravioli", label: "Ravioli", title: `Fixture ${MODES[tokenId]}`, network: "shadownet", contract: ROUTER, tokenId, openKit: kits[tokenId], ipfsGateway: "http://127.0.0.1:8080/ipfs/" } });
      await site.page.click("#connect");
      await waitFor(site.page, "#status", "Wallet connected");
      const purchaseDiagnostic = await clickAndWaitForSiteSuccess(site.page, "#submit", {
        tokenId,
        actor,
        phase: "buy",
        monitor: site.monitor,
        getSessionReceipts: () => collector.session.getReceipts(),
      });
      if (process.env.PASTA_RAVIOLI_FIXTURE_DIAGNOSTICS === "1") {
        context.diagnostic(`Ravioli fixture action ${JSON.stringify(purchaseDiagnostic.after)}`);
      }
      if (tokenId >= 3) await site.page.setInputFiles("#openArtifact", { name: `ravioli-generated-${tokenId}.png`, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.from(String(tokenId))]) });
      const openSelector = await site.page.locator("#secondarySubmit").isVisible() ? "#secondarySubmit" : "#submit";
      const openingDiagnostic = await clickAndWaitForSiteSuccess(site.page, openSelector, {
        tokenId,
        actor,
        phase: "open",
        monitor: site.monitor,
        getSessionReceipts: () => collector.session.getReceipts(),
      });
      if (process.env.PASTA_RAVIOLI_FIXTURE_DIAGNOSTICS === "1") {
        context.diagnostic(`Ravioli fixture action ${JSON.stringify(openingDiagnostic.after)}`);
      }
      const expectedChainState = tokenId === 1 && mirror.sales.get(tokenId)?.remaining === 1
        ? "Primary sale open · fully reserved"
        : `${mirror.totalSupply.get(tokenId) || 0} wrappers live · fully reserved`;
      await waitFor(site.page, "#chainState", expectedChainState);
      assert.equal((await site.page.locator("#chainState").textContent())?.trim(), expectedChainState);
      memorySamples.push(sampleRavioliUiLiveMemory(`browser-fixture-pack-${tokenId}-opened`));
      if (tokenId === 3 || tokenId === 4) captures.push(await capture(outputRoot, site, captureOrdinal++, `${MODES[tokenId]} opened`, "#chainState", "fully reserved"));
      site.monitor.dispose();
      await site.browser.close();
    }
    assert.deepEqual([...mirror.opened.entries()], [[0, 1], [1, 2], [2, 1], [3, 1], [4, 1]]);
    assert.ok([...mirror.totalSupply.values()].every((value) => value === 0));
    assert.equal(chain.calls.filter((call) => call.entrypoint === "open_pack").length, 6);
    const buyCalls = chain.calls.filter((call) => call.entrypoint === "buy");
    assert.equal(buyCalls.length, 6);
    assert.deepEqual(
      buyCalls.map((call) => Number(call.sendOptions?.amount || 0)),
      [0, 1, 1, 1, 1, 1],
    );
    assert.equal(chain.poisonedBigMapReads, 0, "real Studio flow must never traverse adapter BigMap provider graphs");
    const peakHeapGrowth = Math.max(...memorySamples.map((sample) => sample.heapUsedBytes)) - baselineHeapUsed;
    assert.ok(peakHeapGrowth < 384 * 1024 * 1024, `browser fixture heap grew by ${peakHeapGrowth} bytes`);
    context.diagnostic(
      `Ravioli heap telemetry: ${memorySamples.length} samples, ${peakHeapGrowth} byte peak growth, ` +
      `${RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES} byte production ceiling, ${chain.poisonedBigMapReads} poisoned BigMap reads`,
    );
    assert.equal(captures.length, 3);
    for (const proof of captures) await verifyScreenshotSidecar(proof.pngPath, proof.sidecarPath);
  } finally {
    studio?.monitor.dispose();
    await studio?.browser.close();
    await Promise.all([creatorServer.close(), collectorOneServer?.close(), collectorTwoServer?.close()]);
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("Ravioli mirror fails closed for unknown storage and memory telemetry enforces its ceiling", () => {
  const mirror = new RavioliUiStateMirror();
  assert.throws(
    () => mirror.project({ next_resource_id: 0 }),
    /unsupported Ravioli storage shape.*refusing to expose raw Taquito storage/,
  );

  const usage = {
    rss: 200,
    heapTotal: 180,
    heapUsed: 150,
    external: 10,
    arrayBuffers: 5,
  };
  assert.deepEqual(
    sampleRavioliUiLiveMemory("deterministic-unit", {
      usage,
      sampledAtUtc: "2026-07-18T00:00:00.000Z",
      heapCeilingBytes: 160,
    }),
    {
      stage: "deterministic-unit",
      sampledAtUtc: "2026-07-18T00:00:00.000Z",
      heapCeilingBytes: 160,
      rssBytes: 200,
      heapTotalBytes: 180,
      heapUsedBytes: 150,
      externalBytes: 10,
      arrayBuffersBytes: 5,
    },
  );
  assert.throws(
    () => sampleRavioliUiLiveMemory("over-ceiling", { usage, heapCeilingBytes: 149 }),
    /heap ceiling exceeded at over-ceiling: 150 > 149 bytes/,
  );
  assert.ok(RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES < 4_000_000_000);
});

test("Ravioli consumes a one-use CH-EASE handoff into the real Studio", async () => {
  const handoffKey = "wtfos:pasta:chease-handoff:ravioli:browser-proof";
  const handoff = {
    schemaVersion: "wtfos.pasta.chease-package.v1",
    kind: "collection",
    targetApp: "ravioli",
    title: "CH-EASE Atomic Pack",
    description: "A staged package that Ravioli turns into recipe references.",
    symbol: "CRAV",
    relationship: {
      parent_contract: GNOCCHI,
      franchise_contract: ROTINI,
      collection_group: "ravioli-browser-proof",
    },
    items: [{
      tokenId: 7,
      name: "Enclosed artwork reference",
      artifactUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3cte5proofproofproofproofproof",
      mimeType: "image/png",
    }],
  };
  const server = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: async () => { throw new Error("CH-EASE handoff must not invoke the signing bridge"); },
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
  await context.addInitScript(({ key, payload }) => {
    sessionStorage.setItem(key, JSON.stringify(payload));
  }, { key: handoffKey, payload: handoff });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  try {
    const query = new URLSearchParams({ handoff: "chease-package", handoffKey });
    await page.goto(`${server.origin}/creation-tools/ravioli/index.html?${query}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#members .pp-token").length === 1);

    assert.equal(await page.inputValue("#bnName"), handoff.title);
    assert.equal(await page.inputValue("#bnDesc"), handoff.description);
    assert.equal(await page.inputValue("#collSymbol"), handoff.symbol);
    assert.equal(await page.inputValue("#relParent"), handoff.relationship.parent_contract);
    assert.equal(await page.inputValue("#relFranchise"), handoff.relationship.franchise_contract);
    assert.equal(await page.inputValue("#relGroup"), handoff.relationship.collection_group);
    assert.equal(await page.inputValue("#members .m-name"), handoff.items[0].name);
    assert.equal(await page.inputValue("#members .m-type"), "escrow");
    assert.equal(await page.inputValue("#members .m-kt"), "");
    assert.equal(await page.inputValue("#members .m-tid"), String(handoff.items[0].tokenId));
    assert.equal(await page.inputValue("#members .m-uri"), handoff.items[0].artifactUri);
    assert.equal(await page.inputValue("#members .m-mime"), handoff.items[0].mimeType);
    assert.match((await page.locator("#log").textContent()) || "", /imported 1 recipe reference\(s\) from CH-EASE handoff/);
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), handoffKey), null);
    assert.deepEqual(monitor.list(), []);
  } finally {
    monitor.dispose();
    await browser.close();
    await server.close();
  }
});

test("Ravioli accepts only the exact native-recovery inventory and fresh Rotini handoff", () => {
  const input: any = {
    handoff: {
      schema: "pastaprotocol-ravioli-native-recovery-handoff@1",
      gnocchi: {
        contract: GNOCCHI,
        creatorBalances: { "0": 2, "1": 2 },
        totalSupply: { "0": 8, "1": 5 },
        totalReserved: { "0": 0, "1": 0 },
      },
      rotini: {
        contract: ROTINI,
        completedProjectId: 0,
        completedProjectMinted: 3,
        completedProjectReserved: 0,
        freshProjectId: 3,
        freshProjectMaxSupply: 3,
        freshProjectMinted: 0,
        freshProjectReserved: 0,
        nextTokenId: 5,
        freshRavioliGeneratedTokenIds: [5, 6],
      },
      failedRouter: {
        contract: ROUTER,
        allWrapperSupplyBurned: true,
        allSalesInactive: true,
      },
    },
    gnocchiAddress: GNOCCHI,
    rotiniAddress: ROTINI,
    creatorBalances: { "0": 2, "1": 2 },
    totalSupply: { "0": 8, "1": 5 },
    totalReserved: { "0": 0, "1": 0 },
    completedProject: { active: true, minted: 3, reserved: 0 },
    freshProject: {
      active: true,
      output_mode: Buffer.from("png").toString("hex"),
      price: 0,
      max_supply: 3,
      minted: 0,
      reserved: 0,
    },
    nextProjectId: 4,
    nextTokenId: 5,
  };
  assert.deepEqual(validateRavioliNativeDependencyTransition(input), {
    projectId: 3,
    nextTokenId: 5,
    generatedTokenIds: [5, 6],
  });

  const reject = (mutate: (drift: any) => void, expected: RegExp) => {
    const drift = structuredClone(input);
    mutate(drift);
    assert.throws(() => validateRavioliNativeDependencyTransition(drift), expected);
  };
  reject((drift) => { drift.handoff.rotini.contract = ROUTER; }, /Rotini contract differs/);
  reject((drift) => { drift.creatorBalances["0"] = 1; }, /creator balances drift/);
  reject((drift) => { drift.totalSupply["0"] = 7; }, /total supply drift/);
  reject((drift) => { drift.totalReserved["0"] = 1; }, /reserved supply drift/);
  reject((drift) => { drift.completedProject.minted = 2; }, /completed Rotini project mint count drift/);
  reject((drift) => { drift.freshProject.max_supply = 2; }, /fresh Rotini project supply cap drift/);
  reject((drift) => { drift.nextTokenId = 6; }, /next token id differs/);
  reject((drift) => { drift.handoff.rotini.freshRavioliGeneratedTokenIds = [5, 7]; }, /next two Rotini token ids/);
});

test("Ravioli production runner is Shadownet-only, fresh-only, dependency-gated, and UI-LIVE", async () => {
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({}), /explicit Ravioli UI-live execute flag/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", TEZOS_NETWORK: "mainnet", PASTA_PROOF_RUN_DIR: "/tmp/run" }), /only permits Shadownet/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", PASTA_PROOF_RUN_DIR: "/tmp/run", PASTA_SHADOWNET_RAVIOLI_ROUTER_ADDRESS: ROUTER }), /fresh-only/);
  const source = await readFile(new URL("./shadownet-ravioli-ui-live.ts", import.meta.url), "utf8");
  const main = source.slice(source.indexOf("export async function runRavioliUiLive"));
  assert.ok(main.indexOf("validateRavioliDependencies") < main.indexOf("resolveIpfsProofConfig"));
  assert.ok(main.indexOf("validateRavioliDependencies") < main.indexOf("await mkdir"));
  assert.ok(main.indexOf("validateRavioliDependencies") < main.indexOf("operationEstimateMutez"));
  assert.match(source, /classification: "UI-LIVE"/);
  assert.match(source, /pasta-ravioli-open-kit@3/);
  assert.match(source, /ravioliPayloadCommitment\(""\)/);
  assert.match(source, /generated-at-open actions must use the explicit None commitment policy/);
  assert.match(source, /verifiedOperations/);
  assert.match(source, /hybridEntrypoints/);
  assert.match(source, /wrapperPurchaseCheckpoints/);
  assert.match(source, /\.\.\.deliveredTokenUrls\[tokenId\]/);
  assert.match(source, /const revealCapability = buildRavioliRevealCapability/);
  assert.match(source, /const capabilities = \[\.\.\.modeCapabilities, revealCapability\]/);
  assert.match(source, /ravioli-dependency-recovery/);
  assert.match(source, /validateRavioliRecoveryReceipt/);
  assert.match(source, /dependency-recovery-evidence/);
  assert.match(source, /loadRavioliNativeRecoveryHandoff\(runRoot\)/);
  assert.match(source, /RAVIOLI_NATIVE_RECOVERY_DIRECTORY/);
  assert.match(source, /native-recovery-evidence/);
  assert.match(source, /pastaprotocol-ravioli-dependencies@2/);
  assert.match(source, /freshRavioliGeneratedTokenIds/);
  assert.match(source, /baselineRotiniTokenIds/);
  assert.match(source, /freshProjectMinted \+ generatedTokenIds\.length/);
  assert.match(source, /input\.dependencies\.nativeRecovery\.handoff/);
  assert.match(source, /nativeRecoveryArtifact\.id/);
  assert.match(source, /rotiniGeneratedTokenIds: input\.dependencies\.rotini\.generatedTokenIds/);
  assert.match(source, /waitForEvent\("download"/);
  assert.match(source, /pastaprotocol-ravioli-open-kit-capture-progress@1/);
  assert.match(source, /kind: "open-kit"/);
  assert.match(source, /openKitArtifacts\.slice\(1\)/);
  assert.match(source, /ipfsPinned: false/);
  assert.match(source, /kind === "asset"/);
  assert.match(source, /tokens\/balances\?token\.contract=/);
  assert.match(source, /same-run origination/);
  assert.doesNotMatch(source, /PASTA_SHADOWNET_RAVIOLI_GNOCCHI_ADDRESS/);
  const contractSource = await readFile(new URL("../../contracts/pasta-protocol/PastaPackRouterFA2.py", import.meta.url), "utf8");
  assert.match(contractSource, /if sp\.amount > sp\.mutez\(0\):\s+sp\.send\(sale\.treasury, sp\.amount\)/);
});

test("Ravioli proof maps reveal evidence and every delivered child token to exact TzKT URLs", () => {
  assert.deepEqual(
    ravioliDeliveredTokenExplorerUrls({
      gnocchiAddress: GNOCCHI,
      rotiniAddress: ROTINI,
      rotiniGeneratedTokenIds: [5, 6],
    }),
    [
      [`https://shadownet.tzkt.io/${GNOCCHI}/tokens/${RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID}`],
      [
        `https://shadownet.tzkt.io/${GNOCCHI}/tokens/0`,
        `https://shadownet.tzkt.io/${GNOCCHI}/tokens/1`,
      ],
      [`https://shadownet.tzkt.io/${GNOCCHI}/tokens/0`],
      [`https://shadownet.tzkt.io/${ROTINI}/tokens/5`],
      [
        `https://shadownet.tzkt.io/${GNOCCHI}/tokens/1`,
        `https://shadownet.tzkt.io/${GNOCCHI}/tokens/${RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID}`,
        `https://shadownet.tzkt.io/${ROTINI}/tokens/6`,
      ],
    ],
  );
  assert.throws(
    () => ravioliDeliveredTokenExplorerUrls({
      gnocchiAddress: GNOCCHI,
      rotiniAddress: ROTINI,
      rotiniGeneratedTokenIds: [5, 7],
    }),
    /must be consecutive/,
  );

  const capability = buildRavioliRevealCapability({
    screenshots: [
      { stage: "024-hybrid-opened", caption: "collector one opened hybrid_atomic_pack" },
      { stage: "025-blind-manifests", caption: "Blind contents manifests published" },
    ],
    blindManifestArtifacts: [1, 2, 3, 4].map((tokenId) => ({
      id: `manifest-${tokenId}`,
      gatewayUrl: `https://ipfs.io/ipfs/bafy-manifest-${tokenId}`,
    })),
    contracts: [{ address: ROUTER, explorerUrl: `https://shadownet.tzkt.io/${ROUTER}` }],
    operations: [
      { hash: "opCreate", entrypoint: "create_pack" },
      ...[1, 2, 3, 4].map((tokenId) => ({ hash: `opReveal${tokenId}`, entrypoint: "set_pack_contents" })),
    ],
    blindTokens: [1, 2, 3, 4].map((tokenId) => ({
      id: `ravioli-wrapper-${tokenId}`,
      explorerUrl: `https://shadownet.tzkt.io/${ROUTER}/tokens/${tokenId}`,
    })),
    supportingArtifactIds: ["native-recovery-evidence", "tzkt-index-evidence", "ui-live-run-receipt"],
  });
  assert.equal(capability.id, "blind-manifest-reveal-ui-live-proof");
  assert.deepEqual(capability.evidence.screenshots, ["025-blind-manifests"]);
  assert.deepEqual(capability.evidence.operations, ["opReveal1", "opReveal2", "opReveal3", "opReveal4"]);
  assert.deepEqual(capability.evidence.tokens, [
    "ravioli-wrapper-1",
    "ravioli-wrapper-2",
    "ravioli-wrapper-3",
    "ravioli-wrapper-4",
  ]);
  assert.deepEqual(capability.evidence.artifacts, [
    "manifest-1",
    "manifest-2",
    "manifest-3",
    "manifest-4",
    "native-recovery-evidence",
    "tzkt-index-evidence",
    "ui-live-run-receipt",
  ]);
  assert.ok(capability.evidence.urls.includes(`https://shadownet.tzkt.io/${ROUTER}/tokens/4`));
  assert.ok(capability.evidence.urls.includes("https://ipfs.io/ipfs/bafy-manifest-4"));
});

test("Ravioli retains exact real-Studio open-kit download bytes without publishing their nonces", () => {
  const kit = {
    schema: "pasta-ravioli-open-kit@3",
    network: "shadownet",
    contract: ROUTER,
    tokenId: 1,
    mode: "blind_funded_pool",
    manifestUri: "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    blindSecurity: "commit-reveal-ui-hidden-chain-public",
    warning: "Do not publish recipe nonces before you intend holders to open.",
    recipes: [
      { serial: 0, nonce: "ab".repeat(32), actions: [{ kind: "escrow" }] },
      { serial: 1, nonce: "cd".repeat(32), actions: [{ kind: "escrow" }] },
    ],
  };
  const inPageJson = JSON.stringify(kit, null, 2);
  const downloadedBytes = Buffer.from(`${inPageJson}\n`);
  const captured = validateRavioliOpenKitDownload({
    mode: 1,
    routerAddress: ROUTER,
    suggestedFilename: "ravioli-open-kit-1.json",
    inPageJson,
    downloadedBytes,
  });
  assert.deepEqual(captured.kit, kit);
  assert.equal(captured.fileName, "ravioli-open-kit-1.json");
  assert.match(captured.sha256, /^[0-9a-f]{64}$/);
  assert.throws(
    () => validateRavioliOpenKitDownload({
      mode: 1,
      routerAddress: ROUTER,
      suggestedFilename: "wrong.json",
      inPageJson,
      downloadedBytes,
    }),
    /filename drift/,
  );
  assert.throws(
    () => validateRavioliOpenKitDownload({
      mode: 1,
      routerAddress: ROUTER,
      suggestedFilename: "ravioli-open-kit-1.json",
      inPageJson,
      downloadedBytes: Buffer.from(`${inPageJson} `),
    }),
    /download bytes differ/,
  );
});

test("Ravioli TzKT acceptance rejects non-FA2 contracts, missing tokens, and missing balances", () => {
  const contract = { address: ROUTER, kind: "asset", tzips: ["fa2"], creator: { address: CREATOR } };
  const tokens = [0, 1].map((tokenId) => ({ contract: { address: ROUTER }, tokenId: String(tokenId), totalSupply: "1" }));
  const balances = [{
    account: { address: COLLECTOR_ONE },
    token: { contract: { address: ROUTER }, tokenId: "0", standard: "fa2" },
    balance: "1",
  }];
  assert.doesNotThrow(() => assertTzktFa2ContractRecord(contract, ROUTER, CREATOR));
  assert.doesNotThrow(() => assertTzktTokenRecords(tokens, ROUTER, [0, 1]));
  assert.doesNotThrow(() => assertTzktBalanceRecords(balances, ROUTER, [{ owner: COLLECTOR_ONE, tokenId: 0, balance: 1 }]));
  assert.throws(() => assertTzktFa2ContractRecord({ ...contract, kind: "smart_contract" }, ROUTER, CREATOR), /not classified by TzKT as an asset/);
  assert.throws(() => assertTzktFa2ContractRecord({ ...contract, tzips: [] }, ROUTER, CREATOR), /not classified by TzKT as FA2/);
  assert.throws(() => assertTzktTokenRecords(tokens, ROUTER, [0, 1, 2]), /token 2 is not indexed/);
  assert.throws(
    () => assertTzktBalanceRecords(balances, ROUTER, [{ owner: COLLECTOR_TWO, tokenId: 0, balance: 1 }]),
    /balance .* is not indexed by TzKT/,
  );
  const operationHash = "opU3hjsJEBMmu3b9dJzArhoGzbCdaE2osEoWmicot6U1neGcwsh";
  const manifest = {
    app: "gnocchi",
    operations: [{ kind: "origination", hash: operationHash, contractAddress: ROUTER }],
  };
  const receipt = {
    receipts: [{ action: "originate", operationHash, contractAddress: ROUTER, signerAddress: CREATOR }],
  };
  assert.equal(dependencyOriginationReceipt(manifest, receipt, ROUTER, CREATOR).operationHash, operationHash);
  assert.throws(
    () => dependencyOriginationReceipt(manifest, receipt, ROUTER, COLLECTOR_ONE),
    /origination signer drift/,
  );
});

test("Ravioli Studio pins exact adapter contract metadata instead of inline data URIs", async () => {
  const studio = await readFile(new URL("../../public/creation-tools/ravioli/js/studio.js", import.meta.url), "utf8");
  assert.doesNotMatch(studio, /metadataMap\(`data:application\/json/);
  assert.match(studio, /pinning \$\{kind\} adapter contract metadata/);
  assert.match(studio, /pasta-\$\{kind\.toLowerCase\(\)\}-pack-adapter-contract\.json/);
  assert.match(studio, /adapterStorage\(admin, metadataUri, kind\)/);
});
