import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  createBridgeRequest,
  installPastaUiLiveBrowserProxy,
  PastaUiLiveBridgeError,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLivePinProof,
  type PastaUiLivePublicReceipt,
} from "./pasta-ui-live-bridge-kit";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  verifyScreenshotSidecar,
  type CapturePastaProofStageResult,
} from "./pasta-proof-screenshot-kit";
import {
  assertFreshGnocchiContractGrant,
  assertGnocchiUiLiveExecutionAllowed,
  createMirroredSessionHandler,
  GnocchiUiStateMirror,
  GNOCCHI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
  GNOCCHI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
  projectGnocchiStorage,
} from "./shadownet-gnocchi-ui-live";
import { root, SHADOWNET_CHAIN_ID, utf8ToHex } from "./shadownet-proof-kit";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const OTHER_CONTRACT = "KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw";
const CID = "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
const ORIGINATION_HASH = "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq";
const OPERATION_HASHES = [
  ORIGINATION_HASH,
  "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp",
  "ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM",
  "ontvJUZ9vNVusfHbcvzSX8xpPZMutmmwqqarvj4N78u2tUQn4oz",
  "ooivxJTmZWanc5Gpj4244MRN5hjx6udvgTW9u1ZfG7A3zHzepgJ",
  "opU3hjsJEBMmu3b9dJzArhoGzbCdaE2osEoWmicot6U1neGcwsh",
  "ooyS5daX6HosJyazsn2suFxq4mt8FrppXNrRdRWkcN6APp1ovLf",
  "ooivxJTmZWanc5Gpj4244MRN5hjx6udvgTW9u1ZfG7A3zHzepgJ",
];
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);

type FakeCall = { entrypoint: string; payload: any; sendOptions?: any };

function toNumber(value: unknown): number {
  return typeof value === "object" && value && typeof (value as { toNumber?: unknown }).toNumber === "function"
    ? (value as { toNumber(): number }).toNumber()
    : Number(value);
}

class FakeGnocchiChain {
  administrator = CREATOR;
  metadata = new MichelsonMap<string, string>();
  ledger = new MichelsonMap<any, number>();
  token_metadata = new MichelsonMap<string, unknown>();
  total_supply = new MichelsonMap<string, number>();
  total_minted = new MichelsonMap<string, number>();
  sales = new MichelsonMap<string, any>();
  policy_locked = new MichelsonMap<string, boolean>();
  next_token_id = 0;
  calls: FakeCall[] = [];
  private operationIndex = 0;

  private projectedSales() {
    const sales = new MichelsonMap<string, any>();
    for (const [key, rawSale] of this.sales.entries()) {
      const sale = { ...rawSale };
      for (const option of ["start", "end", "min_price", "max_price", "max_supply"]) {
        sale[option] = sale[option] == null ? null : { Some: sale[option] };
      }
      sales.set(String(key), sale);
    }
    return sales;
  }

  storage() {
    return {
      administrator: this.administrator,
      metadata: this.metadata,
      token_metadata: this.token_metadata,
      total_supply: this.total_supply,
      total_minted: this.total_minted,
      sales: this.projectedSales(),
      policy_locked: this.policy_locked,
      next_token_id: this.next_token_id,
    };
  }

  private operation(apply?: () => void) {
    const hash = OPERATION_HASHES[this.operationIndex++] || `op-fake-${this.operationIndex}`;
    return {
      hash,
      async confirmation() {
        await new Promise((resolve) => setTimeout(resolve, 30));
        apply?.();
        return 1;
      },
    };
  }

  private method(entrypoint: string, payload: any) {
    return {
      entrypoint,
      payload,
      send: async (sendOptions: any = {}) => this.operation(() => {
        this.calls.push({ entrypoint, payload, sendOptions });
        if (entrypoint === "create_open_edition") {
          const key = String(this.next_token_id);
          const reserve = Number(payload.creator_reserve || 0);
          this.token_metadata.set(key, { token_id: this.next_token_id, token_info: payload.token_info });
          this.sales.set(key, { ...payload.sale });
          this.total_supply.set(key, reserve);
          this.total_minted.set(key, reserve);
          this.policy_locked.set(key, payload.lock_policy === true);
          this.next_token_id += 1;
        } else if (entrypoint === "set_sale_active") {
          const key = String(payload.token_id);
          this.sales.set(key, { ...this.sales.get(key), active: payload.active === true });
        } else if (entrypoint === "open_mint") {
          const key = String(payload.token_id);
          const amount = Number(payload.amount);
          const sale = this.sales.get(key);
          if (!sale?.active) throw new Error("SALE_INACTIVE");
          const minted = Number(this.total_minted.get(key) || 0);
          if (sale.max_supply != null && minted + amount > Number(sale.max_supply)) throw new Error("SOLD_OUT");
          this.total_minted.set(key, minted + amount);
          this.total_supply.set(key, Number(this.total_supply.get(key) || 0) + amount);
        }
      }),
    };
  }

  contract() {
    return {
      address: CONTRACT,
      methodsObject: {
        create_open_edition: (payload: unknown) => this.method("create_open_edition", payload),
        set_sale_active: (payload: unknown) => this.method("set_sale_active", payload),
        open_mint: (payload: unknown) => this.method("open_mint", payload),
      },
      storage: async () => this.storage(),
    };
  }

  toolkit(address: string) {
    return {
      tz: {
        async getBalance(requested: string) {
          assert.equal(requested, address);
          return { toString: () => "5000000" };
        },
      },
      contract: {
        originate: async ({ storage }: { storage: any }) => {
          this.administrator = storage.administrator;
          this.metadata = storage.metadata;
          const operation = this.operation();
          return {
            ...operation,
            async contract() {
              return { address: CONTRACT };
            },
          };
        },
        at: async (contractAddress: string) => {
          assert.equal(contractAddress, CONTRACT);
          return this.contract();
        },
        batch() {
          throw new Error("batch is not used by Gnocchi");
        },
      },
    } as any;
  }
}

function fakeProof(fileName: string, mimeType = "application/json"): PastaUiLivePinProof {
  return {
    cid: CID,
    uri: `ipfs://${CID}`,
    fileName,
    mimeType,
    byteLength: 123,
    sha256: "5af28061360b21d212e9b3f53af80d7b74b7656eaf7cc01c9e5c82a7aab28f08",
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${CID}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${CID}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

async function openPage(server: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
  monitor: ReturnType<typeof monitorPastaProofPage>;
}> {
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
  await page.goto(`${server.origin}/creation-tools/gnocchi/index.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
  await installPastaUiLiveBrowserProxy(page, server, "UI-MOCK");
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", "http://127.0.0.1:5001");
  await page.fill("#basePrice", "0.000001");
  await page.fill("#increment", "0");
  await page.fill("#stepSize", "1");
  await page.check("#lockPolicy");
  return { browser, context, page, monitor };
}

async function waitFor(page: Page, selector: string, text: string): Promise<void> {
  await page.waitForFunction(
    ({ selector: selected, text: expected }) => document.querySelector(selected)?.textContent?.includes(expected),
    { selector, text },
    { timeout: 30_000 },
  );
}

async function assertReadableStatus(page: Page, selector: "#mintInfo" | "#editionList"): Promise<string> {
  const text = (await page.locator(selector).textContent()) || "";
  assert.doesNotMatch(text, /NaN|Invalid Date|\[object Object\]/, `${selector} contains undecoded Tezos option data`);
  return text;
}

async function connect(page: Page, address: string): Promise<void> {
  await page.click("#btnConnect");
  await waitFor(page, "#log", `connected ${address} on shadownet`);
}

async function configureEdition(
  page: Page,
  tokenId: number,
  mode: "timed" | "forever" | "limited",
): Promise<void> {
  await page.fill("#oeName", `Fixture ${mode} ${tokenId}`);
  await page.fill("#oeDesc", `Actual Gnocchi UI fixture for ${mode}`);
  await page.fill("#oeTags", `gnocchi, ${mode}, fixture`);
  await page.selectOption("#saleMode", mode);
  if (mode !== "forever") {
    await page.fill("#saleStart", new Date(Date.now() - 60_000).toISOString().slice(0, 16));
    await page.fill("#saleEnd", new Date(Date.now() + 3_600_000).toISOString().slice(0, 16));
  }
  if (mode === "limited") {
    await page.fill("#saleMaxSupply", "3");
    await page.fill("#creatorReserve", "1");
  } else {
    await page.fill("#creatorReserve", "2");
  }
  await page.setInputFiles("#oeArtifact", {
    name: `fixture-${tokenId}.png`,
    mimeType: "image/png",
    buffer: Buffer.concat([PNG, Buffer.from(String(tokenId))]),
  });
}

async function publish(page: Page, expected: string): Promise<void> {
  await page.click("#btnPublish");
  await waitFor(page, "#log", expected);
  await page.waitForFunction(() => !document.getElementById("btnPublish")?.hasAttribute("disabled"));
}

async function mint(page: Page, tokenId: number, expectedPolicy: string): Promise<void> {
  await page.fill("#mintKt", CONTRACT);
  await page.fill("#mintTokenId", String(tokenId));
  await page.click("#btnLoadPrice");
  await waitFor(page, "#mintInfo", expectedPolicy);
  await assertReadableStatus(page, "#mintInfo");
  await page.click("#btnMint");
  await waitFor(page, "#log", "minted ✓");
  await page.waitForFunction(() => !document.getElementById("btnMint")?.hasAttribute("disabled"));
  await assertReadableStatus(page, "#mintInfo");
}

async function captureFixture(
  outputRoot: string,
  actor: Awaited<ReturnType<typeof openPage>>,
  ordinal: number,
  stageName: string,
  selector: string,
  expectedText: string,
): Promise<CapturePastaProofStageResult> {
  await actor.page.locator(selector).scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page: actor.page,
    monitor: actor.monitor,
    outputRoot,
    app: "gnocchi",
    capability: "fixture bridge lifecycle",
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-MOCK",
    requiredEvidence: [{ selector, expectedText }],
    waitForLoadState: "none",
  });
}

test("real Gnocchi studio drives three policies, collector mints, and vault/reopen through loopback callbacks", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "gnocchi-ui-live-browser-"));
  const chain = new FakeGnocchiChain();
  const mirror = new GnocchiUiStateMirror();
  let originationReceipt: PastaUiLivePublicReceipt | undefined;
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: chain.toolkit(CREATOR),
    signerAddress: CREATOR,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedEntrypoints: GNOCCHI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
    pinJson: async ({ fileName }) => fakeProof(fileName),
    pinBlob: async ({ fileName, mimeType }) => fakeProof(fileName, mimeType),
    projectStorage: projectGnocchiStorage,
  });
  creatorSession.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 4_000_000,
    estimatedOriginationMutez: 3_000_000,
    operationReserveMutez: 1_000_000,
  });
  const creatorServer = await startPastaUiLiveLoopbackServer({
    staticRoot: path.join(root, "public"),
    handleAction: createMirroredSessionHandler({
      session: creatorSession,
      mirror,
      role: "creator",
      onOrigination: (contractAddress, receipt) => {
        originationReceipt = receipt;
        mirror.initialize({
          administrator: CREATOR,
          contractAddress,
          collectionMetadataUri: `ipfs://${CID}`,
        });
      },
    }),
  });
  let creator: Awaited<ReturnType<typeof openPage>> | null = null;
  let collector: Awaited<ReturnType<typeof openPage>> | null = null;
  let collectorServer: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>> | null = null;
  const captures: CapturePastaProofStageResult[] = [];
  try {
    creator = await openPage(creatorServer);
    await connect(creator.page, CREATOR);
    await configureEdition(creator.page, 0, "timed");
    await publish(creator.page, "Timed OE live ✓ — token id 0");
    await creator.page.selectOption("#publishTarget", "existing");
    await creator.page.fill("#existingCollectionKt", CONTRACT);
    await creator.page.click("#btnVerifyCollection");
    await waitFor(creator.page, "#publishTargetStatus", "next edition will be token #1");
    await configureEdition(creator.page, 1, "forever");
    await publish(creator.page, "Forever OE live ✓ — token id 1");
    await configureEdition(creator.page, 2, "limited");
    await publish(creator.page, "Limited Edition live ✓ — token id 2");
    await creator.page.locator("#editionList .pp-token").nth(2).waitFor({ state: "visible" });
    assert.match(await assertReadableStatus(creator.page, "#editionList"), /1 \/ 3 lifetime minted/);
    captures.push(await captureFixture(outputRoot, creator, 1, "three policies live", "#editionList", "Token #2 · Limited Edition"));

    assertFreshGnocchiContractGrant(CONTRACT, originationReceipt, creatorSession.getReceipts());
    const collectorSession = new TaquitoPastaUiLiveSession({
      tezos: chain.toolkit(COLLECTOR),
      signerAddress: COLLECTOR,
      expectedChainId: SHADOWNET_CHAIN_ID,
      allowedContractAddresses: new Set([CONTRACT]),
      allowedEntrypoints: GNOCCHI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
      assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
      pinJson: async () => { throw new PastaUiLiveBridgeError("collector pinning disabled", 403); },
      validateOrigination: async () => { throw new PastaUiLiveBridgeError("collector origination disabled", 403); },
      projectStorage: projectGnocchiStorage,
    });
    collectorSession.authorizeAfterFundingPreflight({
      balanceMutez: 5_000_000,
      requiredBalanceMutez: 250_000,
      estimatedOriginationMutez: 0,
      operationReserveMutez: 250_000,
    });
    await assert.rejects(
      collectorSession.handle(createBridgeRequest("contract_at", { contractAddress: OTHER_CONTRACT })),
      /not authorized for this UI-live session/,
    );
    collectorServer = await startPastaUiLiveLoopbackServer({
      staticRoot: path.join(root, "public"),
      handleAction: createMirroredSessionHandler({ session: collectorSession, mirror, role: "collector" }),
    });
    collector = await openPage(collectorServer);
    await connect(collector.page, COLLECTOR);
    await mint(collector.page, 0, "Timed OE");
    await mint(collector.page, 1, "Forever OE");
    await mint(collector.page, 2, "Limited Edition");
    assert.match(await assertReadableStatus(collector.page, "#mintInfo"), /2 lifetime minted \/ 3 cap/);
    captures.push(await captureFixture(outputRoot, collector, 2, "collector minted policies", "#mintInfo", "Limited Edition"));

    await creator.page.fill("#mintKt", CONTRACT);
    await creator.page.fill("#mintTokenId", "1");
    await creator.page.click("#btnLoadPrice");
    await waitFor(creator.page, "#mintInfo", "Forever OE");
    await creator.page.click("#btnVaultEdition");
    await waitFor(creator.page, "#log", "issuance vaulted ✓");
    await waitFor(creator.page, "#mintInfo", "VAULTED — EXISTING TOKENS UNAFFECTED");
    await assertReadableStatus(creator.page, "#mintInfo");
    await collector.page.fill("#mintTokenId", "1");
    await collector.page.click("#btnLoadPrice");
    await waitFor(collector.page, "#mintInfo", "VAULTED — EXISTING TOKENS UNAFFECTED");
    await collector.page.click("#btnMint");
    await waitFor(collector.page, "#log", "mint failed: this sale is paused");
    await creator.page.click("#btnUnvaultEdition");
    await waitFor(creator.page, "#log", "issuance reopened ✓");
    await waitFor(creator.page, "#mintInfo", "ISSUANCE OPEN");
    await assertReadableStatus(creator.page, "#mintInfo");
    captures.push(await captureFixture(outputRoot, creator, 3, "forever issuance reopened", "#mintInfo", "ISSUANCE OPEN"));

    assert.equal(chain.next_token_id, 3);
    assert.equal(chain.sales.get("0")?.max_supply, null);
    assert.ok(chain.sales.get("0")?.start && chain.sales.get("0")?.end);
    assert.equal(chain.sales.get("1")?.start, null);
    assert.equal(chain.sales.get("1")?.end, null);
    assert.equal(chain.sales.get("1")?.active, true);
    assert.equal(chain.total_minted.get("0"), 3, "timed OE reserve must leave reusable creator inventory");
    assert.equal(chain.total_minted.get("1"), 3, "forever OE reserve must leave reusable creator inventory");
    assert.equal(toNumber(chain.sales.get("2")?.max_supply), 3);
    assert.equal(chain.total_minted.get("2"), 2, "creator reserve plus collector mint must count toward cap");
    assert.deepEqual(
      chain.calls.map((call) => call.entrypoint),
      ["create_open_edition", "create_open_edition", "create_open_edition", "open_mint", "open_mint", "open_mint", "set_sale_active", "set_sale_active"],
    );
    assert.equal(captures.length, 3);
    for (const capture of captures) {
      assert.equal(capture.sidecar.classification, "UI-MOCK");
      await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);
    }
  } finally {
    creator?.monitor.dispose();
    collector?.monitor.dispose();
    await Promise.all([creator?.browser.close(), collector?.browser.close()]);
    await Promise.all([creatorServer.close(), collectorServer?.close()]);
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("Gnocchi production runner is execute-gated, Shadownet-only, fresh-only, and UI-LIVE classified", async () => {
  assert.throws(() => assertGnocchiUiLiveExecutionAllowed({}), /explicit Gnocchi UI-live execute flag is required/);
  assert.throws(
    () => assertGnocchiUiLiveExecutionAllowed({
      PASTA_SHADOWNET_GNOCCHI_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "mainnet",
    }),
    /only permits Shadownet/,
  );
  assert.doesNotThrow(() => assertGnocchiUiLiveExecutionAllowed({
    PASTA_SHADOWNET_GNOCCHI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/proof",
    TEZOS_NETWORK: "shadownet",
  }));

  const source = await readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-gnocchi-ui-live.ts"), "utf8");
  assert.match(source, /classification: "UI-LIVE"/);
  assert.match(source, /loadSignerSet\(env\)/);
  assert.match(source, /allowedContractAddresses: new Set\(\[freshContractAddress\]\)/);
  assert.match(source, /assertFreshGnocchiContractGrant/);
  assert.match(source, /projectGnocchiStorage/);
  assert.match(source, /authorizeAfterFundingPreflight/);
  assert.match(source, /Timed OE live/);
  assert.match(source, /Forever OE live/);
  assert.match(source, /Limited Edition live/);
  assert.match(source, /issuance vaulted/);
  assert.match(source, /issuance reopened/);
  assert.doesNotMatch(source, /UI-MOCK/);
  assert.doesNotMatch(source, /SKIP_SETUP|RECIPE_START|RESUME_|EXISTING_CONTRACT|recordVideo|recordHar|tracing\.start|launchPersistentContext/);
});

test("projected Gnocchi storage round-trips only the three proof token keys", async () => {
  const chain = new FakeGnocchiChain();
  chain.metadata.set("", utf8ToHex(`ipfs://${CID}`));
  chain.next_token_id = 1;
  chain.sales.set("0", {
    active: true,
    start: "2026-07-18T00:00:00.000Z",
    end: "2026-07-19T00:00:00.000Z",
    min_price: 1,
    max_price: 3,
    max_supply: 3,
  });
  chain.total_supply.set("0", 2);
  chain.total_minted.set("0", 2);
  chain.policy_locked.set("0", true);
  chain.token_metadata.set("0", { token_id: 0, token_info: new MichelsonMap() });
  const projected = await projectGnocchiStorage(chain.storage());
  assert.equal(projected.next_token_id, 1);
  assert.ok(projected.sales instanceof MichelsonMap);
  const projectedSale = (projected.sales as MichelsonMap<string, any>).get("0");
  assert.equal(projectedSale.active, true);
  assert.deepEqual(projectedSale.start, { Some: "2026-07-18T00:00:00.000Z" });
  assert.deepEqual(projectedSale.end, { Some: "2026-07-19T00:00:00.000Z" });
  assert.deepEqual(projectedSale.min_price, { Some: 1 });
  assert.deepEqual(projectedSale.max_price, { Some: 3 });
  assert.deepEqual(projectedSale.max_supply, { Some: 3 });
  assert.equal((projected.total_supply as MichelsonMap<string, number>).get("0"), 2);
});
