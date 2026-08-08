import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";
import { validateOperation, ValidationResult } from "@taquito/utils";
import { chromium, type Page } from "playwright";

import {
  installPastaUiLiveBrowserProxy,
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
  PASTA_UI_LIVE_RECEIPT_SCHEMA,
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
import {
  deterministicJsonBytes,
  root,
  utf8ToHex,
} from "./shadownet-proof-kit";
import {
  assertLasagnaTzktOperationApplied,
  assertLasagnaUiLiveExecutionAllowed,
  lasagnaRawSha256Cid,
  loadLasagnaReferenceTokens,
  verifyLasagnaTzktEvidence,
  type LasagnaReferenceToken,
} from "./shadownet-lasagna-ui-live";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const CURATOR = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const UNRELATED_CONTRACT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const CHAIN_ID = "NetXsqzbfFenSTS";
const CIDS = [
  "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba",
  "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupbb",
  "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupbc",
];
const OPERATION_HASHES = [
  "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq",
  "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp",
  "ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM",
  "ontvJUZ9vNVusfHbcvzSX8xpPZMutmmwqqarvj4N78u2tUQn4oz",
  "onwA9NfZ61x8n7QAPnTVXpL7ZvR9C3gFATds1YDmFLGwAFrdgso",
  "oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h",
];
const REFERENCE_CONTRACTS = [
  "KT1TP6Q4fzj4csiJ9MgkgUdFoNcEg396Vyer",
  "KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc",
  "KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw",
  "KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB",
  "KT1BYMrRC1ZvoHJWaSvFpiRsd5ZM2YcRh3Ls",
  "KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz",
] as const;
const REFERENCE_APPS = ["macaroni", "spaghetti", "gnocchi", "ravioli", "rotini", "penne"] as const;

const REFERENCES: LasagnaReferenceToken[] = REFERENCE_APPS.map((app, index) => ({
  app,
  contract: REFERENCE_CONTRACTS[index],
  token_id: app === "rotini" ? 1 : 0,
  tokenRecordId: app === "macaroni" ? "macaroni-v1-token-0" : `${app}-token`,
  explorerUrl: `https://shadownet.tzkt.io/${REFERENCE_CONTRACTS[index]}/tokens/${app === "rotini" ? 1 : 0}`,
  artifactUri: app === "macaroni"
    ? "ipfs://bafkreifgntgighrrzrq3btzp3rzeren5wiv3b2y3vrmxkjhacvuqsrz7x4"
    : `ipfs://${CIDS[index % CIDS.length]}`,
}));

const REVISION_ZERO_ITEMS = REFERENCES.slice(0, 2).map(({ contract, token_id }) => ({ contract, token_id }));
const REVISION_ONE_ITEMS = REFERENCES.slice(2).map(({ contract, token_id }) => ({ contract, token_id }));

function buildPackage() {
  return {
    schemaVersion: "wtfos.pasta.chease-package.v1",
    kind: "collection",
    targetApp: "lasagna",
    title: "Loopback Lasagna Exhibition",
    description: "Actual Lasagna UI with fake server callbacks.",
    items: REFERENCES.map((reference) => ({
      name: `${reference.app} proof token`,
      artifactUri: reference.artifactUri,
      tokenMetadata: { contract: reference.contract, tokenId: reference.token_id },
    })),
  };
}

function fakeProof(fileName: string, value: unknown, cid: string): PastaUiLivePinProof {
  const bytes = deterministicJsonBytes(value);
  return {
    cid,
    uri: `ipfs://${cid}`,
    fileName,
    mimeType: "application/json",
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

type RecordedCall = {
  actor: string;
  entrypoint: string;
  payload: unknown;
};

type FakeOperationRecord = {
  hash: string;
  signerAddress: string;
  action: "originate" | "call";
  contractAddress: string;
  entrypoints: string[];
  status: "pending" | "applied" | "rejected";
  rejection?: string;
};

function createFakeChain() {
  let operationIndex = 0;
  let confirmationCalls = 0;
  const calls: RecordedCall[] = [];
  const operations = new Map<string, FakeOperationRecord>();
  const state = {
    administrator: CREATOR,
    pending_administrator: null,
    metadata: new MichelsonMap<string, string>(),
    curators: new MichelsonMap<string, boolean>(),
    revisions: new MichelsonMap<number, Record<string, unknown>>(),
    revision_count: 0,
    current_revision: null as number | null,
  };
  const nextOperation = (input: {
    signerAddress: string;
    action: "originate" | "call";
    entrypoints: string[];
    apply?: () => void;
  }) => {
    const hash = OPERATION_HASHES[operationIndex++];
    assert.ok(hash, "fake chain exhausted operation hashes");
    assert.equal(validateOperation(hash), ValidationResult.VALID, "fake Lasagna operation hash is invalid");
    assert.equal(operations.has(hash), false, "fake Lasagna operation hash must be unique");
    const record: FakeOperationRecord = {
      hash,
      signerAddress: input.signerAddress,
      action: input.action,
      contractAddress: CONTRACT,
      entrypoints: [...input.entrypoints],
      status: "pending",
    };
    operations.set(hash, record);
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
      contractAddress: input.action === "originate" ? CONTRACT : undefined,
      async confirmation() {
        confirmationCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 60));
        settle();
        if (record.status === "rejected") {
          throw settlementError instanceof Error
            ? settlementError
            : new Error(record.rejection || "fake Lasagna operation rejected");
        }
        return 1;
      },
    };
  };
  const applyCall = (actor: string, entrypoint: string, payload: any) => {
    if (entrypoint === "add_curator") {
      if (actor !== state.administrator) throw new Error("NOT_ADMIN");
      state.curators.set(String(payload), true);
    } else if (entrypoint === "remove_curator") {
      if (actor !== state.administrator) throw new Error("NOT_ADMIN");
      state.curators.delete(String(payload));
    } else if (entrypoint === "publish_revision") {
      if (actor !== state.administrator && state.curators.get(actor) !== true) {
        throw new Error("NOT_CURATOR");
      }
      const id = state.revision_count;
      state.revisions.set(id, {
        curator: actor,
        metadata_uri: payload.metadata_uri,
        items: payload.items,
      });
      state.revision_count += 1;
      state.current_revision = id;
    } else if (entrypoint === "set_current_revision") {
      if (actor !== state.administrator && state.curators.get(actor) !== true) {
        throw new Error("NOT_CURATOR");
      }
      state.current_revision = Number(payload);
    }
  };
  const contractFor = (actor: string) => ({
    address: CONTRACT,
    methodsObject: Object.fromEntries(
      ["add_curator", "publish_revision", "set_current_revision", "remove_curator"].map((entrypoint) => [
        entrypoint,
        (payload: unknown) => ({
          async send() {
            return nextOperation({
              signerAddress: actor,
              action: "call",
              entrypoints: [entrypoint],
              apply: () => {
                calls.push({ actor, entrypoint, payload });
                applyCall(actor, entrypoint, payload);
              },
            });
          },
        }),
      ]),
    ),
    async storage() {
      return state;
    },
  });
  const toolkitFor = (actor: string) => ({
    tz: {
      async getBalance() {
        return { toString: () => "10000000" };
      },
    },
    contract: {
      async originate(input: { storage: typeof state }) {
        assert.equal(actor, CREATOR);
        const operation = nextOperation({
          signerAddress: actor,
          action: "originate",
          entrypoints: [],
          apply: () => {
            state.administrator = input.storage.administrator;
            state.metadata = input.storage.metadata;
          },
        });
        return {
          ...operation,
          async contract() {
            return contractFor(actor);
          },
        };
      },
      async at(address: string) {
        assert.equal(address, CONTRACT);
        return contractFor(actor);
      },
      batch() {
        throw new Error("Lasagna fixture does not use batches");
      },
    },
  });
  const assertOperationApplied = (
    assertion: PastaUiLiveAppliedOperationAssertion,
    signerAddress: string,
  ) => {
    assert.equal(validateOperation(assertion.operationHash), ValidationResult.VALID);
    assert.notEqual(assertion.action, "batch", "fake Lasagna chain does not apply batches");
    const operation = operations.get(assertion.operationHash);
    assert.ok(operation, `fake Lasagna operation ${assertion.operationHash} is unknown`);
    assert.equal(
      operation.status,
      "applied",
      `fake Lasagna operation ${assertion.operationHash} is ${operation.status}`,
    );
    assert.equal(operation.signerAddress, signerAddress, "fake Lasagna operation signer drift");
    assert.equal(operation.action, assertion.action, "fake Lasagna operation action drift");
    assert.equal(operation.contractAddress, assertion.contractAddress, "fake Lasagna operation contract drift");
    assert.deepEqual(operation.entrypoints, assertion.entrypoints, "fake Lasagna operation entrypoint drift");
  };
  return {
    assertOperationApplied,
    calls,
    get confirmationCalls() { return confirmationCalls; },
    operations,
    state,
    toolkitFor,
  };
}

async function waitForLog(page: Page, expected: string): Promise<void> {
  await page.waitForFunction(
    (text) => document.getElementById("log")?.textContent?.includes(text),
    expected,
    { timeout: 30_000 },
  );
}

async function captureMockStudioStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  stageName: string,
  expectedLog: string,
  focusSelector = "#log",
): Promise<CapturePastaProofStageResult> {
  await page.locator(focusSelector).scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "lasagna",
    capability: `fixture ${stageName}`,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-MOCK",
    requiredEvidence: [
      { selector: "h1", expectedText: "Lasagna" },
      { selector: "#log", expectedText: expectedLog },
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function captureMockPublicStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
): Promise<CapturePastaProofStageResult> {
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "lasagna",
    capability: "fixture public exhibition",
    stageOrdinal: ordinal,
    stageName: "public exhibition loaded",
    classification: "UI-MOCK",
    requiredEvidence: [
      { selector: "#appLabel", expectedText: "Lasagna" },
      { selector: "#contract", expectedText: CONTRACT },
      { selector: "#itemId", expectedText: "0" },
      { selector: "#chainState", expectedText: "2 revisions · 2 works shown" },
      { selector: "#status", expectedText: "On-chain state loaded." },
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

test("real Lasagna studio and public exhibition complete the full registry lifecycle through fake Node callbacks", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "lasagna-ui-live-browser-"));
  const fakeChain = createFakeChain();
  const pinnedJsonByCid = new Map<string, unknown>();
  let pinIndex = 0;
  const pinJson = async ({ value, fileName }: { value: unknown; fileName: string }) => {
    const cid = CIDS[pinIndex++];
    assert.ok(cid, "fake pin fixture exhausted CIDs");
    pinnedJsonByCid.set(cid, value);
    await new Promise((resolve) => setTimeout(resolve, 60));
    return fakeProof(fileName, value, cid);
  };
  const creatorChainStages: string[] = [];
  const curatorChainStages: string[] = [];
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: fakeChain.toolkitFor(CREATOR) as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["add_curator", "publish_revision", "remove_curator"]),
    assertExpectedChain: async (stage) => {
      creatorChainStages.push(stage);
      return CHAIN_ID;
    },
    assertOperationApplied: (assertion) => fakeChain.assertOperationApplied(assertion, CREATOR),
    pinJson,
    validateOrigination: ({ code, storage }) => {
      assert.ok(Array.isArray(code));
      assert.equal((storage as { administrator?: string }).administrator, CREATOR);
    },
  });
  creatorSession.authorizeAfterFundingPreflight({
    balanceMutez: 10_000_000,
    requiredBalanceMutez: 4_000_000,
    estimatedOriginationMutez: 1_500_000,
    operationReserveMutez: 2_500_000,
  });

  const [creatorServer] = await Promise.all([
    startPastaUiLiveLoopbackServer({
      staticRoot: path.join(root, "public"),
      handleAction: (request) => creatorSession.handle(request),
    }),
  ]);
  let curatorServer: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>> | null = null;
  const browser = await chromium.launch({ headless: true });
  const contextOptions = {
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1 as const,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce" as const,
    serviceWorkers: "block" as const,
    acceptDownloads: true,
  };
  const creatorContext = await browser.newContext(contextOptions);
  const curatorContext = await browser.newContext(contextOptions);
  const handoffKey = "wtfos.pasta.handoff.v1:lasagna-ui-live-test";
  const handoff = buildPackage();
  const handoffBytes = deterministicJsonBytes(handoff);
  await creatorContext.addInitScript({
    content: `sessionStorage.setItem(${JSON.stringify(handoffKey)}, ${JSON.stringify(JSON.stringify(handoff))});`,
  });
  const creatorPage = await creatorContext.newPage();
  const creatorMonitor = monitorPastaProofPage(creatorPage);
  let curatorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  let publicMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  const captures: CapturePastaProofStageResult[] = [];
  try {
    await creatorPage.goto(
      `${creatorServer.origin}/creation-tools/lasagna/index.html?handoff=chease-package&handoffKey=${encodeURIComponent(handoffKey)}`,
      { waitUntil: "networkidle" },
    );
    await creatorPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(creatorPage, creatorServer, "UI-MOCK");
    assert.equal((await creatorPage.content()).includes(creatorServer.sessionToken), false);
    await creatorPage.selectOption("#network", "shadownet");
    await creatorPage.selectOption("#pinProvider", "node");
    await creatorPage.fill("#pinNode", "http://127.0.0.1:5001");
    await creatorPage.fill("#exStatement", "Loopback creator exhibition statement");
    await waitForLog(creatorPage, "from CH-EASE handoff");
    await creatorPage.waitForFunction(() => document.getElementById("sumCount")?.textContent === "6");
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 1, "handoff-configured", "from CH-EASE handoff", "#refs"));

    await creatorPage.click("[data-draft-save]");
    await creatorPage.waitForFunction(() => document.querySelector("[data-draft-status]")?.textContent?.startsWith("Saved"));
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 2, "draft-saved", "from CH-EASE handoff", "[data-draft-status]"));

    await creatorPage.click("#btnConnect");
    await waitForLog(creatorPage, `connected ${CREATOR} on shadownet`);
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 3, "creator-connected", `connected ${CREATOR}`, "#account"));

    await creatorPage.click("#btnDeploy");
    await waitForLog(creatorPage, "originating exhibition contract");
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 4, "registry-metadata-pinned", "originating exhibition contract"));
    await waitForLog(creatorPage, `exhibition deployed: ${CONTRACT}`);
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 5, "registry-originated", `exhibition deployed: ${CONTRACT}`, "#contractKt"));

    await creatorPage.click("[data-contract-verify]");
    await creatorPage.waitForFunction(
      () => document.querySelector("[data-contract-status]")?.textContent?.includes("Verified"),
    );
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 6, "registry-verified", `exhibition deployed: ${CONTRACT}`, "[data-contract-status]"));

    await creatorPage.fill("#curatorAddr", CURATOR);
    await creatorPage.click("#btnAddCurator");
    await waitForLog(creatorPage, "curator added ✓");
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 7, "curator-added", "curator added ✓", "#curatorAddr"));

    const curatorSession = new TaquitoPastaUiLiveSession({
      tezos: fakeChain.toolkitFor(CURATOR) as any,
      signerAddress: CURATOR,
      expectedChainId: CHAIN_ID,
      allowedContractAddresses: new Set([CONTRACT]),
      allowedEntrypoints: new Set(["publish_revision", "set_current_revision"]),
      assertExpectedChain: async (stage) => {
        curatorChainStages.push(stage);
        return CHAIN_ID;
      },
      assertOperationApplied: (assertion) => fakeChain.assertOperationApplied(assertion, CURATOR),
      pinJson,
      validateOrigination: () => {
        throw new Error("curator fixture cannot originate");
      },
    });
    curatorSession.authorizeAfterFundingPreflight({
      balanceMutez: 2_000_000,
      requiredBalanceMutez: 1_000_000,
      estimatedOriginationMutez: 0,
      operationReserveMutez: 1_000_000,
    });
    await assert.rejects(
      curatorSession.handle({
        schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
        id: "unrelated-contract",
        action: "contract_at",
        payload: { contractAddress: UNRELATED_CONTRACT },
      }),
      /not authorized for this UI-live session/,
    );
    curatorServer = await startPastaUiLiveLoopbackServer({
      staticRoot: path.join(root, "public"),
      handleAction: (request) => curatorSession.handle(request),
    });
    const curatorPage = await curatorContext.newPage();
    curatorMonitor = monitorPastaProofPage(curatorPage);
    await curatorPage.goto(`${curatorServer.origin}/creation-tools/lasagna/index.html`, { waitUntil: "networkidle" });
    await curatorPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(curatorPage, curatorServer, "UI-MOCK");
    await curatorPage.selectOption("#network", "shadownet");
    await curatorPage.selectOption("#pinProvider", "node");
    await curatorPage.fill("#pinNode", "http://127.0.0.1:5001");
    await curatorPage.setInputFiles("#importPkg", {
      name: "lasagna-reference-handoff.json",
      mimeType: "application/json",
      buffer: Buffer.from(handoffBytes),
    });
    await waitForLog(curatorPage, "from CH-EASE file");
    await curatorPage.fill("#refs", REVISION_ZERO_ITEMS.map((item) => `${item.contract}, ${item.token_id}`).join("\n"));
    await curatorPage.click("#btnParse");
    await curatorPage.fill("#exStatement", "Loopback curator revision zero");
    await curatorPage.fill("#contractKt", CONTRACT);
    await curatorPage.waitForFunction(() => document.getElementById("sumCount")?.textContent === "2");
    captures.push(await captureMockStudioStage(curatorPage, curatorMonitor, outputRoot, 8, "curator-package-imported", "from CH-EASE file", "#refs"));

    await curatorPage.click("#btnConnect");
    await waitForLog(curatorPage, `connected ${CURATOR} on shadownet`);
    captures.push(await captureMockStudioStage(curatorPage, curatorMonitor, outputRoot, 9, "curator-connected", `connected ${CURATOR}`, "#account"));

    await curatorPage.click("#btnPublish");
    await waitForLog(curatorPage, "revision #0 published ✓");
    captures.push(await captureMockStudioStage(curatorPage, curatorMonitor, outputRoot, 10, "revision-zero-published", "revision #0 published ✓"));

    await creatorPage.setInputFiles("#importRefs", {
      name: "revision-one.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(REVISION_ONE_ITEMS.map((item) => `${item.contract}, ${item.token_id}`).join("\n")),
    });
    await creatorPage.waitForFunction(() => document.getElementById("sumCount")?.textContent === "4");
    await creatorPage.fill("#exStatement", "Loopback creator revision one");
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 11, "revision-one-imported", "curator added ✓", "#refs"));

    await creatorPage.click("#btnPublish");
    await waitForLog(creatorPage, "revision #1 published ✓");
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 12, "revision-one-published", "revision #1 published ✓"));

    await curatorPage.fill("#currentRid", "0");
    await curatorPage.click("#btnSetCurrent");
    await waitForLog(curatorPage, "current revision set to #0 ✓");
    captures.push(await captureMockStudioStage(curatorPage, curatorMonitor, outputRoot, 13, "current-revision-rolled-back", "current revision set to #0 ✓", "#currentRid"));

    await creatorPage.click("#btnRemoveCurator");
    await waitForLog(creatorPage, "curator removed ✓");
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 14, "curator-removed", "curator removed ✓", "#curatorAddr"));

    const downloadPromise = creatorPage.waitForEvent("download");
    await creatorPage.click("#btnExportSite");
    const download = await downloadPromise;
    const zipPath = path.join(outputRoot, "lasagna-site.zip");
    await download.saveAs(zipPath);
    const zipBytes = await readFile(zipPath);
    assert.equal(zipBytes.subarray(0, 2).toString("ascii"), "PK");
    await creatorPage.waitForFunction(() => document.getElementById("exportSiteStatus")?.textContent?.includes("Downloaded site zip"));
    captures.push(await captureMockStudioStage(creatorPage, creatorMonitor, outputRoot, 15, "site-exported", "curator removed ✓", "#exportSiteStatus"));

    const publicPage = await creatorContext.newPage();
    publicMonitor = monitorPastaProofPage(publicPage);
    await publicPage.route("**/pasta.config.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `window.PASTA_SITE_CONFIG = ${JSON.stringify({
          app: "lasagna",
          label: "Lasagna",
          title: "Loopback Lasagna Exhibition",
          description: "Actual public exhibition fixture",
          contract: CONTRACT,
          tokenId: 0,
          network: "shadownet",
          ipfsGateway: "https://ipfs.io/ipfs/",
        })};`,
      });
    });
    await publicPage.route("**/js/site.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: "// deferred" });
    });
    await publicPage.route("https://ipfs.io/ipfs/**", async (route) => {
      const cid = new URL(route.request().url()).pathname.split("/").at(-1) || "";
      const value = pinnedJsonByCid.get(cid);
      assert.ok(value, `public site requested unknown CID ${cid}`);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    });
    await publicPage.goto(`${creatorServer.origin}/creation-tools/lasagna/site.html`, { waitUntil: "networkidle" });
    await publicPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ));
    await installPastaUiLiveBrowserProxy(publicPage, creatorServer, "UI-MOCK");
    await publicPage.addScriptTag({
      content: await readFile(path.join(root, "public", "creation-tools", "lasagna", "js", "site.js"), "utf8"),
    });
    await publicPage.waitForFunction(() => document.getElementById("status")?.textContent === "On-chain state loaded.");
    captures.push(await captureMockPublicStage(publicPage, publicMonitor, outputRoot, 16));

    assert.equal(captures.length, 16);
    for (const capture of captures) {
      assert.equal(capture.sidecar.classification, "UI-MOCK");
      await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);
    }
    assert.deepEqual(
      fakeChain.calls.map(({ actor, entrypoint }) => ({ actor, entrypoint })),
      [
        { actor: CREATOR, entrypoint: "add_curator" },
        { actor: CURATOR, entrypoint: "publish_revision" },
        { actor: CREATOR, entrypoint: "publish_revision" },
        { actor: CURATOR, entrypoint: "set_current_revision" },
        { actor: CREATOR, entrypoint: "remove_curator" },
      ],
    );
    assert.equal(fakeChain.state.revision_count, 2);
    assert.equal(fakeChain.state.current_revision, 0);
    assert.equal(fakeChain.state.curators.has(CURATOR), false);
    assert.equal((fakeChain.state.revisions.get(0) as any).curator, CURATOR);
    assert.equal((fakeChain.state.revisions.get(1) as any).curator, CREATOR);
    assert.deepEqual(
      creatorSession.getReceipts().filter((receipt) => receipt.operationHash).map((receipt) => receipt.operationHash),
      [OPERATION_HASHES[0], OPERATION_HASHES[1], OPERATION_HASHES[3], OPERATION_HASHES[5]],
    );
    assert.deepEqual(
      curatorSession.getReceipts().filter((receipt) => receipt.operationHash).map((receipt) => receipt.operationHash),
      [OPERATION_HASHES[2], OPERATION_HASHES[4]],
    );
    assert.equal(fakeChain.confirmationCalls, 0, "successful Studio flow must not use native confirmation polling");
    assert.equal(pinIndex, 3);
    assert.ok(creatorChainStages.includes("before UI-live origination"));
    assert.ok(creatorChainStages.includes("before UI-live contract call"));
    assert.ok(curatorChainStages.includes("before UI-live contract call"));
  } finally {
    creatorMonitor.dispose();
    curatorMonitor?.dispose();
    publicMonitor?.dispose();
    await browser.close();
    await curatorServer?.close();
    await creatorServer.close();
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("Lasagna TzKT finality validator binds exact hash, signer, action, contract, entrypoint, and applied status", () => {
  const timestamp = "2026-07-23T20:00:00Z";
  const origination = {
    type: "origination",
    status: "applied",
    hash: OPERATION_HASHES[0],
    sender: { address: CREATOR },
    originatedContract: { address: CONTRACT },
    level: 4_320_000,
    timestamp,
  };
  const call = {
    type: "transaction",
    status: "applied",
    hash: OPERATION_HASHES[1],
    sender: { address: CREATOR },
    target: { address: CONTRACT },
    parameter: { entrypoint: "add_curator", value: CURATOR },
    level: 4_320_001,
    timestamp,
  };
  const internalTransfer = {
    type: "transaction",
    status: "applied",
    hash: OPERATION_HASHES[1],
    sender: { address: CONTRACT },
    target: { address: CURATOR },
    level: 4_320_001,
    timestamp,
  };
  const originationAssertion: PastaUiLiveAppliedOperationAssertion = {
    action: "originate",
    operationHash: OPERATION_HASHES[0],
    contractAddress: CONTRACT,
    entrypoints: [],
  };
  const callAssertion: PastaUiLiveAppliedOperationAssertion = {
    action: "call",
    operationHash: OPERATION_HASHES[1],
    contractAddress: CONTRACT,
    entrypoints: ["add_curator"],
  };

  assert.equal(
    assertLasagnaTzktOperationApplied({
      rows: [origination],
      assertion: originationAssertion,
      signerAddress: CREATOR,
    }).originatedContract?.address,
    CONTRACT,
  );
  assert.equal(
    assertLasagnaTzktOperationApplied({
      rows: [call, internalTransfer],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }).parameter?.entrypoint,
    "add_curator",
  );
  assert.throws(
    () => assertLasagnaTzktOperationApplied({
      rows: [{ ...call, status: "backtracked" }, internalTransfer],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /not applied/,
  );
  assert.throws(
    () => assertLasagnaTzktOperationApplied({
      rows: [{ ...call, sender: { address: CURATOR } }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /exactly one.*exact hash and signer/,
  );
  assert.throws(
    () => assertLasagnaTzktOperationApplied({
      rows: [{ ...call, target: { address: UNRELATED_CONTRACT } }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /target differs/,
  );
  assert.throws(
    () => assertLasagnaTzktOperationApplied({
      rows: [{ ...call, parameter: { entrypoint: "remove_curator" } }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /entrypoint differs/,
  );
  assert.throws(
    () => assertLasagnaTzktOperationApplied({
      rows: [call, { ...call }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /exactly one.*exact hash and signer/,
  );
  assert.throws(
    () => assertLasagnaTzktOperationApplied({
      rows: [call],
      assertion: { ...callAssertion, action: "batch" },
      signerAddress: CREATOR,
    }),
    /does not permit batch/,
  );
});

test("fake Lasagna finality verifier rejects a submitted operation whose fake chain status is rejected", async () => {
  const fakeChain = createFakeChain();
  const contract = await fakeChain.toolkitFor(CURATOR).contract.at(CONTRACT);
  const operation = await contract.methodsObject.remove_curator(CREATOR).send();
  await assert.rejects(() => operation.confirmation(), /NOT_ADMIN/);
  assert.throws(
    () => fakeChain.assertOperationApplied({
      action: "call",
      operationHash: operation.hash,
      contractAddress: CONTRACT,
      entrypoints: ["remove_curator"],
    }, CURATOR),
    /is rejected/,
  );
});

test("Lasagna TzKT verifier requires exact revisions, current pointer, curator removal, and every applied operation", async () => {
  const registryMetadataUri = `ipfs://${CIDS[0]}`;
  const revisionZeroMetadataUri = `ipfs://${CIDS[1]}`;
  const revisionOneMetadataUri = `ipfs://${CIDS[2]}`;
  const operationPlan = [
    { action: "originate", entrypoint: undefined, signerAddress: CREATOR },
    { action: "call", entrypoint: "add_curator", signerAddress: CREATOR },
    { action: "call", entrypoint: "publish_revision", signerAddress: CURATOR },
    { action: "call", entrypoint: "publish_revision", signerAddress: CREATOR },
    { action: "call", entrypoint: "set_current_revision", signerAddress: CURATOR },
    { action: "call", entrypoint: "remove_curator", signerAddress: CREATOR },
  ] as const;
  const operationReceipts: Parameters<typeof verifyLasagnaTzktEvidence>[0]["operationReceipts"] =
    operationPlan.map((operation, index) => ({
      schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
      sequence: index + 1,
      timestampUtc: `2026-07-18T00:00:0${index}.000Z`,
      action: operation.action,
      chainId: CHAIN_ID,
      signerAddress: operation.signerAddress,
      contractAddress: CONTRACT,
      operationHash: OPERATION_HASHES[index],
      ...(operation.entrypoint ? { entrypoints: [operation.entrypoint] } : {}),
    }));
  const requests: string[] = [];
  let indexedCurrentRevision = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    requests.push(url.toString());
    const pathName = url.pathname;
    let body: unknown;
    if (pathName === `/v1/contracts/${CONTRACT}`) {
      body = {
        address: CONTRACT,
        kind: "smart_contract",
        firstActivity: 9_200_001,
        lastActivity: 9_200_006,
      };
    } else if (pathName === `/v1/contracts/${CONTRACT}/storage`) {
      body = {
        administrator: CREATOR,
        pending_administrator: null,
        revision_count: 2,
        current_revision: indexedCurrentRevision,
        metadata: 201,
        curators: 202,
        revisions: 203,
      };
    } else if (pathName === "/v1/bigmaps/201/keys") {
      body = [{ key: "", value: utf8ToHex(registryMetadataUri) }];
    } else if (pathName === "/v1/bigmaps/203/keys") {
      body = [
        {
          key: "0",
          value: {
            curator: CURATOR,
            metadata_uri: utf8ToHex(revisionZeroMetadataUri),
            items: REVISION_ZERO_ITEMS,
          },
        },
        {
          key: "1",
          value: {
            curator: CREATOR,
            metadata_uri: utf8ToHex(revisionOneMetadataUri),
            items: REVISION_ONE_ITEMS,
          },
        },
      ];
    } else if (pathName === "/v1/bigmaps/202/keys") {
      body = [];
    } else if (pathName.startsWith("/v1/operations/originations/")) {
      const operationHash = pathName.split("/").at(-1);
      body = {
        type: "origination",
        status: "applied",
        hash: operationHash,
        level: 9_200_001,
        timestamp: "2026-07-23T20:00:00Z",
        sender: { address: CREATOR },
        originatedContract: { address: CONTRACT },
      };
    } else if (pathName.startsWith("/v1/operations/transactions/")) {
      const operationHash = pathName.split("/").at(-1);
      const index = OPERATION_HASHES.indexOf(operationHash || "");
      const operation = operationPlan[index];
      assert.ok(operation && operation.entrypoint, `unexpected operation fixture ${operationHash}`);
      body = {
        type: "transaction",
        status: "applied",
        hash: operationHash,
        level: 9_200_001 + index,
        timestamp: `2026-07-23T20:00:0${index}Z`,
        sender: { address: operation.signerAddress },
        target: { address: CONTRACT },
        parameter: { entrypoint: operation.entrypoint },
      };
    } else {
      return new Response(JSON.stringify({ error: `unhandled fixture URL ${url}` }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const evidence = await verifyLasagnaTzktEvidence({
      contractAddress: CONTRACT,
      creatorAddress: CREATOR,
      curatorAddress: CURATOR,
      registryMetadataUri,
      revisionZeroMetadataUri,
      revisionOneMetadataUri,
      revisionZeroItems: REVISION_ZERO_ITEMS,
      revisionOneItems: REVISION_ONE_ITEMS,
      operationReceipts,
      pollOptions: { attempts: 1, delayMs: 0 },
    });
    assert.equal(evidence.schema, "pastaprotocol-lasagna-tzkt-index@1");
    assert.equal((evidence.storage as { currentRevision: number }).currentRevision, 0);
    assert.deepEqual(evidence.activeCurators, []);
    assert.equal((evidence.operations as unknown[]).length, 6);
    assert.equal(requests.length, 11);
    assert.equal(new Set(requests).size, 11);
    for (const operationHash of OPERATION_HASHES) {
      assert.ok(requests.some((url) => url.includes(operationHash)), `${operationHash} was not independently checked`);
    }

    indexedCurrentRevision = 1;
    await assert.rejects(
      verifyLasagnaTzktEvidence({
        contractAddress: CONTRACT,
        creatorAddress: CREATOR,
        curatorAddress: CURATOR,
        registryMetadataUri,
        revisionZeroMetadataUri,
        revisionOneMetadataUri,
        revisionZeroItems: REVISION_ZERO_ITEMS,
        revisionOneItems: REVISION_ONE_ITEMS,
        operationReceipts,
        pollOptions: { attempts: 1, delayMs: 0 },
      }),
      /final indexed storage did not appear/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Lasagna requires all six fresh publisher proofs and binds accepted Macaroni token and contract evidence", async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), "lasagna-reference-proof-"));
  const runId = path.basename(runRoot);
  try {
    for (const reference of REFERENCES) {
      const appRoot = path.join(runRoot, reference.app);
      await mkdir(appRoot, { recursive: true });
      await writeFile(path.join(appRoot, "manifest.json"), JSON.stringify({
        schema: "pastaprotocol-app-proof@1",
        app: reference.app,
        runId,
        network: { name: "shadownet", chainId: CHAIN_ID },
        contracts: [{
          address: reference.contract,
          kind: `${reference.app}-publisher`,
          explorerUrl: `https://shadownet.tzkt.io/${reference.contract}`,
        }],
        tokens: [{
          id: reference.tokenRecordId,
          contractAddress: reference.contract,
          tokenId: String(reference.token_id),
          explorerUrl: reference.explorerUrl,
          artifactUri: reference.artifactUri,
        }],
      }));
    }
    assert.deepEqual(await loadLasagnaReferenceTokens(runRoot, runId), REFERENCES);
    assert.deepEqual(REFERENCES[0], {
      app: "macaroni",
      contract: "KT1TP6Q4fzj4csiJ9MgkgUdFoNcEg396Vyer",
      token_id: 0,
      tokenRecordId: "macaroni-v1-token-0",
      explorerUrl: "https://shadownet.tzkt.io/KT1TP6Q4fzj4csiJ9MgkgUdFoNcEg396Vyer/tokens/0",
      artifactUri: "ipfs://bafkreifgntgighrrzrq3btzp3rzeren5wiv3b2y3vrmxkjhacvuqsrz7x4",
    });

    await rm(path.join(runRoot, "macaroni", "manifest.json"));
    await assert.rejects(
      loadLasagnaReferenceTokens(runRoot, runId),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /needs the fresh publisher proofs/);
        assert.match(String((error as Error & { lines?: string[] }).lines?.join("\n")), /macaroni/);
        return true;
      },
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("Lasagna restart recovery derives the exact raw-SHA256 CID used by the proof pinner", () => {
  assert.equal(
    lasagnaRawSha256Cid(Buffer.from(JSON.stringify({ hello: "world" }))),
    "bafkreietui4xdkiu4xvmx4fi2jivjtndbhb4drzpxomrjvd4mdz4w2avra",
  );
});

test("production Lasagna runner is fresh-only, Shadownet-only, role-correct, and recorder-free", async () => {
  assert.throws(
    () => assertLasagnaUiLiveExecutionAllowed({}),
    /explicit Lasagna UI-live execute flag is required/,
  );
  assert.throws(
    () => assertLasagnaUiLiveExecutionAllowed({
      PASTA_SHADOWNET_LASAGNA_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "mainnet",
    }),
    /only permits Shadownet/,
  );
  assert.doesNotThrow(() => assertLasagnaUiLiveExecutionAllowed({
    PASTA_SHADOWNET_LASAGNA_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/proof",
    TEZOS_NETWORK: "shadownet",
  }));
  assert.throws(
    () => assertLasagnaUiLiveExecutionAllowed({
      PASTA_SHADOWNET_LASAGNA_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "shadownet",
      PASTA_SHADOWNET_LASAGNA_EXISTING_CONTRACT: CONTRACT,
    }),
    /fresh-origination only/,
  );

  const source = await readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-lasagna-ui-live.ts"), "utf8");
  assert.match(source, /classification: "UI-LIVE"/);
  assert.match(source, /loadSignerPair\(environment\)/);
  assert.match(source, /allowedContractAddresses: new Set\(\[contractAddress\]\)/);
  assert.match(source, /assertShadownet\(creatorTezos/);
  assert.match(source, /assertShadownet\(curatorTezos/);
  assert.match(source, /pastaprotocol-app-proof@1/);
  assert.match(source, /pastaprotocol-lasagna-tzkt-index@1/);
  assert.match(source, /role: "exhibition-registry"/);
  assert.match(source, /kind: "exhibition-publication"/);
  assert.match(source, /tokens: \[\]/);
  assert.match(source, /retrievedSha256/);
  assert.match(source, /creatorPage\.click\("#btnDeploy"\)/);
  assert.match(source, /curatorPage\.click\("#btnPublish"\)/);
  assert.match(source, /creatorPage\.click\("#btnPublish"\)/);
  assert.match(source, /curatorPage\.click\("#btnSetCurrent"\)/);
  assert.match(source, /creatorPage\.click\("#btnRemoveCurator"\)/);
  assert.match(source, /creatorPage\.click\("#btnExportSite"\)/);
  assert.match(source, /PUBLIC_SITE_SCRIPT_PATH/);
  assert.match(source, /PastaProofRestartJournal\.(?:create|open)/);
  assert.match(source, /readPastaProofRestartRpcSnapshot\(SHADOWNET_RPC_PRIMARY/);
  assert.match(source, /readPastaProofRestartRpcSnapshot\(SHADOWNET_RPC_FALLBACK/);
  assert.match(source, /reconcileLasagnaPendingPin\(restartJournal, ipfs\)/);
  assert.match(source, /expectedCurrentCounter\(actor\)/);
  assert.equal(
    (source.match(/assertOperationApplied: \(assertion\) => verifyLasagnaTzktOperationApplied/g) || []).length,
    2,
    "creator and curator sessions must independently verify exact operation hashes",
  );
  const firstOutputWrite = source.indexOf("await mkdir");
  const creatorFundingGate = source.indexOf("creator is underfunded before any pin or chain write");
  const curatorFundingGate = source.indexOf("curator is underfunded before any pin or chain write");
  assert.ok(creatorFundingGate >= 0 && creatorFundingGate < firstOutputWrite);
  assert.ok(curatorFundingGate >= 0 && curatorFundingGate < firstOutputWrite);
  assert.doesNotMatch(source, /UI-MOCK/);
  assert.doesNotMatch(source, /recordVideo|recordHar|tracing\.start|launchPersistentContext/);
});
