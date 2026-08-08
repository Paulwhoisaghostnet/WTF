import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
import { root, utf8ToHex } from "./shadownet-proof-kit";
import {
  assertPenneTzktOperationApplied,
  assertPenneUiLiveExecutionAllowed,
  verifyPenneTzktEvidence,
} from "./shadownet-penne-ui-live";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const UNRELATED_CONTRACT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const CHAIN_ID = "NetXsqzbfFenSTS";
const CID = "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
const OPERATION_HASHES = [
  "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq",
  "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp",
  "ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM",
  "ontvJUZ9vNVusfHbcvzSX8xpPZMutmmwqqarvj4N78u2tUQn4oz",
  "onwA9NfZ61x8n7QAPnTVXpL7ZvR9C3gFATds1YDmFLGwAFrdgso",
  "oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h",
  "oo3s9KWmeGmNP22aFNnaFffM8yhCb9zDDvMnbd58HH2pETSJ1z8",
];

function fakeProof(fileName: string): PastaUiLivePinProof {
  return {
    cid: CID,
    uri: `ipfs://${CID}`,
    fileName,
    mimeType: "application/json",
    byteLength: 321,
    sha256: "5af28061360b21d212e9b3f53af80d7b74b7656eaf7cc01c9e5c82a7aab28f08",
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${CID}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${CID}`,
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
  const calls: RecordedCall[] = [];
  const operations = new Map<string, FakeOperationRecord>();
  const finalityState = { confirmationCalls: 0 };
  const nextOperation = (input: {
    signerAddress: string;
    action: "originate" | "call";
    entrypoints: string[];
    apply?: () => void;
  }) => {
    const hash = OPERATION_HASHES[operationIndex++];
    assert.ok(hash, "fake chain exhausted operation hashes");
    assert.equal(validateOperation(hash), ValidationResult.VALID, "fake Penne operation hash is invalid");
    assert.equal(operations.has(hash), false, "fake Penne operation hash must be unique");
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
      ...(input.action === "originate" ? { contractAddress: CONTRACT } : {}),
      async confirmation() {
        finalityState.confirmationCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 120));
        settle();
        if (record.status === "rejected") {
          throw settlementError instanceof Error
            ? settlementError
            : new Error(record.rejection || "fake Penne operation rejected");
        }
        return 1;
      },
    };
  };
  const contractFor = (actor: string) => ({
    address: CONTRACT,
    methodsObject: Object.fromEntries(
      ["create_token", "set_allocations", "open_claim", "claim", "airdrop"].map((entrypoint) => [
        entrypoint,
        (payload: unknown) => ({
          async send() {
            return nextOperation({
              signerAddress: actor,
              action: "call",
              entrypoints: [entrypoint],
              apply: () => {
                if (entrypoint !== "claim" && actor !== CREATOR) throw new Error("NOT_ADMIN");
                calls.push({ actor, entrypoint, payload });
              },
            });
          },
        }),
      ]),
    ),
    async storage() {
      return { next_token_id: 1 };
    },
  });
  const toolkitFor = (actor: string) => ({
    tz: {
      async getBalance() {
        return { toString: () => "10000000" };
      },
    },
    contract: {
      async originate() {
        assert.equal(actor, CREATOR);
        const operation = nextOperation({
          signerAddress: actor,
          action: "originate",
          entrypoints: [],
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
        throw new Error("Penne fixture does not use batches");
      },
    },
  });
  const assertOperationApplied = (
    assertion: PastaUiLiveAppliedOperationAssertion,
    signerAddress: string,
  ) => {
    assert.equal(validateOperation(assertion.operationHash), ValidationResult.VALID);
    assert.notEqual(assertion.action, "batch", "fake Penne chain does not apply batches");
    const operation = operations.get(assertion.operationHash);
    assert.ok(operation, `fake Penne operation ${assertion.operationHash} is unknown`);
    assert.equal(
      operation.status,
      "applied",
      `fake Penne operation ${assertion.operationHash} is ${operation.status}`,
    );
    assert.equal(operation.signerAddress, signerAddress, "fake Penne operation signer drift");
    assert.equal(operation.action, assertion.action, "fake Penne operation action drift");
    assert.equal(operation.contractAddress, assertion.contractAddress, "fake Penne operation contract drift");
    assert.deepEqual(operation.entrypoints, assertion.entrypoints, "fake Penne operation entrypoint drift");
  };
  return { assertOperationApplied, calls, finalityState, operations, toolkitFor };
}

async function waitForLog(page: Page, expected: string): Promise<void> {
  await page.waitForFunction(
    (text) => document.getElementById("log")?.textContent?.includes(text),
    expected,
    { timeout: 30_000 },
  );
}

async function captureMockStage(
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
    app: "penne",
    capability: `fixture ${stageName}`,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-MOCK",
    requiredEvidence: [
      { selector: "h1", expectedText: "Penne" },
      { selector: "#log", expectedText: expectedLog },
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

test("real Penne studio completes creator deploy, collector claim, and creator airdrop through fake Node callbacks", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "penne-ui-live-browser-"));
  const fakeChain = createFakeChain();
  const creatorChainStages: string[] = [];
  const collectorChainStages: string[] = [];
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: fakeChain.toolkitFor(CREATOR) as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["create_token", "set_allocations", "open_claim", "airdrop"]),
    assertExpectedChain: async (stage) => {
      creatorChainStages.push(stage);
      return CHAIN_ID;
    },
    assertOperationApplied: (assertion) => fakeChain.assertOperationApplied(assertion, CREATOR),
    pinJson: async ({ fileName }) => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return fakeProof(fileName);
    },
    validateOrigination: ({ code, storage }) => {
      assert.ok(Array.isArray(code));
      assert.equal((storage as { administrator?: string }).administrator, CREATOR);
    },
  });
  creatorSession.authorizeAfterFundingPreflight({
    balanceMutez: 10_000_000,
    requiredBalanceMutez: 4_000_000,
    estimatedOriginationMutez: 1_750_000,
    operationReserveMutez: 2_250_000,
  });
  const collectorSession = new TaquitoPastaUiLiveSession({
    tezos: fakeChain.toolkitFor(COLLECTOR) as any,
    signerAddress: COLLECTOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["claim"]),
    assertExpectedChain: async (stage) => {
      collectorChainStages.push(stage);
      return CHAIN_ID;
    },
    assertOperationApplied: (assertion) => fakeChain.assertOperationApplied(assertion, COLLECTOR),
    pinJson: async () => {
      throw new Error("collector fixture must not pin");
    },
    validateCall: ({ contractAddress, entrypoint, payload }) => {
      assert.equal(contractAddress, CONTRACT);
      assert.equal(entrypoint, "claim");
      assert.equal(Number(payload), 0);
    },
  });
  collectorSession.authorizeAfterFundingPreflight({
    balanceMutez: 2_000_000,
    requiredBalanceMutez: 500_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 500_000,
  });
  await assert.rejects(
    collectorSession.handle({
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id: "unrelated-contract",
      action: "contract_at",
      payload: { contractAddress: UNRELATED_CONTRACT },
    }),
    /not authorized for this UI-live session/,
  );

  const [creatorServer, collectorServer] = await Promise.all([
    startPastaUiLiveLoopbackServer({
      staticRoot: path.join(root, "public"),
      handleAction: (request) => creatorSession.handle(request),
    }),
    startPastaUiLiveLoopbackServer({
      staticRoot: path.join(root, "public"),
      handleAction: (request) => collectorSession.handle(request),
    }),
  ]);
  const browser = await chromium.launch({ headless: true });
  const contextOptions = {
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1 as const,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce" as const,
    serviceWorkers: "block" as const,
  };
  const creatorContext = await browser.newContext(contextOptions);
  const collectorContext = await browser.newContext(contextOptions);
  const handoffKey = "wtfos.pasta.handoff.v1:penne-ui-live-test";
  const handoff = {
    schemaVersion: "wtfos.pasta.chease-package.v1",
    kind: "single_token",
    targetApp: "penne",
    token: {
      name: "Loopback Penne Token",
      description: "Real Penne UI with fake server callbacks.",
      artifactUri: `ipfs://${CID}`,
      mimeType: "image/png",
      tags: ["loopback", "penne"],
    },
  };
  await creatorContext.addInitScript({
    content: `sessionStorage.setItem(${JSON.stringify(handoffKey)}, ${JSON.stringify(JSON.stringify(handoff))});`,
  });
  const creatorPage = await creatorContext.newPage();
  const collectorPage = await collectorContext.newPage();
  const creatorMonitor = monitorPastaProofPage(creatorPage);
  const collectorMonitor = monitorPastaProofPage(collectorPage);
  const captures: CapturePastaProofStageResult[] = [];
  try {
    await creatorPage.goto(
      `${creatorServer.origin}/creation-tools/penne/index.html?handoff=chease-package&handoffKey=${encodeURIComponent(handoffKey)}`,
      { waitUntil: "networkidle" },
    );
    await creatorPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(creatorPage, creatorServer, "UI-MOCK");
    assert.equal((await creatorPage.content()).includes(creatorServer.sessionToken), false);
    await creatorPage.selectOption("#network", "shadownet");
    await creatorPage.selectOption("#pinProvider", "node");
    await creatorPage.fill("#pinNode", "http://127.0.0.1:5001");
    await creatorPage.fill("#collName", "Loopback Penne Distribution");
    await creatorPage.fill("#collSymbol", "LOOP");
    await creatorPage.fill("#tokName", "Loopback Penne Token");
    await creatorPage.fill("#tokDesc", "Creator and collector fixture");
    await creatorPage.fill("#recipients", `${COLLECTOR}, 1\n${CREATOR}, 2`);
    await creatorPage.fill("#batchSize", "50");
    await creatorPage.click("#btnParse");
    await waitForLog(creatorPage, "from CH-EASE handoff");
    captures.push(await captureMockStage(creatorPage, creatorMonitor, outputRoot, 1, "configured", "from CH-EASE handoff", "#recipients"));

    await creatorPage.click("#btnConnect");
    await waitForLog(creatorPage, `connected ${CREATOR} on shadownet`);
    captures.push(await captureMockStage(creatorPage, creatorMonitor, outputRoot, 2, "creator-connected", `connected ${CREATOR}`, "#account"));

    await creatorPage.click("#btnDeploy");
    await waitForLog(creatorPage, "originating distribution contract");
    captures.push(await captureMockStage(creatorPage, creatorMonitor, outputRoot, 3, "metadata-pinned", "originating distribution contract"));
    await waitForLog(creatorPage, `contract deployed: ${CONTRACT}`);
    captures.push(await captureMockStage(creatorPage, creatorMonitor, outputRoot, 4, "contract-originated", `contract deployed: ${CONTRACT}`));
    await waitForLog(creatorPage, "token id 0 registered");
    captures.push(await captureMockStage(creatorPage, creatorMonitor, outputRoot, 5, "token-created", "token id 0 registered"));
    await waitForLog(creatorPage, "done — 2 allocations live");
    captures.push(await captureMockStage(creatorPage, creatorMonitor, outputRoot, 6, "allocations-loaded", "done — 2 allocations live"));

    await creatorPage.click("#btnOpenClaim");
    await waitForLog(creatorPage, "claim window OPEN");
    captures.push(await captureMockStage(creatorPage, creatorMonitor, outputRoot, 7, "claim-opened", "claim window OPEN", "#btnOpenClaim"));

    await collectorPage.goto(`${collectorServer.origin}/creation-tools/penne/index.html`, { waitUntil: "networkidle" });
    await collectorPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(collectorPage, collectorServer, "UI-MOCK");
    assert.equal((await collectorPage.content()).includes(collectorServer.sessionToken), false);
    await collectorPage.selectOption("#network", "shadownet");
    await collectorPage.fill("#contractKt", CONTRACT);
    await collectorPage.fill("#claimTokenId", "0");
    await collectorPage.click("#btnConnect");
    await waitForLog(collectorPage, `connected ${COLLECTOR} on shadownet`);
    captures.push(await captureMockStage(collectorPage, collectorMonitor, outputRoot, 8, "collector-connected", `connected ${COLLECTOR}`, "#account"));
    await collectorPage.click("#btnClaim");
    await waitForLog(collectorPage, "claimed ✓");
    captures.push(await captureMockStage(collectorPage, collectorMonitor, outputRoot, 9, "collector-claimed", "claimed ✓", "#btnClaim"));

    await creatorPage.fill("#recipients", `${CREATOR}, 2`);
    await creatorPage.waitForFunction(() => document.getElementById("sumCount")?.textContent === "1");
    await creatorPage.click("#btnAirdrop");
    await waitForLog(creatorPage, "airdrop complete");
    captures.push(await captureMockStage(creatorPage, creatorMonitor, outputRoot, 10, "creator-airdrop", "airdrop complete", "#btnAirdrop"));
    await creatorPage.click("#btnCloseClaim");
    await waitForLog(creatorPage, "claim window closed");
    captures.push(await captureMockStage(creatorPage, creatorMonitor, outputRoot, 11, "complete", "claim window closed", "#btnCloseClaim"));

    assert.equal(captures.length, 11);
    for (const capture of captures) {
      assert.equal(capture.sidecar.classification, "UI-MOCK");
      await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);
    }
    assert.deepEqual(
      fakeChain.calls.map(({ actor, entrypoint }) => ({ actor, entrypoint })),
      [
        { actor: CREATOR, entrypoint: "create_token" },
        { actor: CREATOR, entrypoint: "set_allocations" },
        { actor: CREATOR, entrypoint: "open_claim" },
        { actor: COLLECTOR, entrypoint: "claim" },
        { actor: CREATOR, entrypoint: "airdrop" },
        { actor: CREATOR, entrypoint: "open_claim" },
      ],
    );
    assert.ok(fakeChain.calls[0].payload instanceof MichelsonMap);
    assert.equal([...(fakeChain.calls[0].payload as MichelsonMap<any, any>).entries()].length, 1);
    const allocations = fakeChain.calls[1].payload as Array<Record<string, unknown>>;
    assert.equal(allocations[0].recipient, COLLECTOR);
    assert.equal(Number(allocations[0].amount), 1);
    assert.equal(allocations[1].recipient, CREATOR);
    assert.equal(Number(allocations[1].amount), 2);
    assert.equal((fakeChain.calls[2].payload as { active?: boolean }).active, true);
    assert.equal(Number(fakeChain.calls[3].payload), 0);
    const airdrop = fakeChain.calls[4].payload as Array<Record<string, unknown>>;
    assert.equal(airdrop.length, 1);
    assert.equal(airdrop[0].recipient, CREATOR);
    assert.equal(Number(airdrop[0].token_id), 0);
    assert.equal((fakeChain.calls[5].payload as { active?: boolean }).active, false);
    assert.deepEqual(
      creatorSession.getReceipts().filter((receipt) => receipt.operationHash).map((receipt) => receipt.operationHash),
      [OPERATION_HASHES[0], OPERATION_HASHES[1], OPERATION_HASHES[2], OPERATION_HASHES[3], OPERATION_HASHES[5], OPERATION_HASHES[6]],
    );
    assert.deepEqual(
      collectorSession.getReceipts().filter((receipt) => receipt.operationHash).map((receipt) => receipt.operationHash),
      [OPERATION_HASHES[4]],
    );
    assert.equal(
      fakeChain.finalityState.confirmationCalls,
      0,
      "successful Penne UI-LIVE verification must not depend on native confirmation polling",
    );
    assert.ok(creatorChainStages.includes("before UI-live origination"));
    assert.ok(creatorChainStages.includes("before UI-live contract call"));
    assert.ok(collectorChainStages.includes("before UI-live contract call"));
    const creatorPublicState = await creatorPage.evaluate(() => {
      const state = (window as any).__pastaUiLiveBridge;
      return { classification: state?.classification, account: state?.getAccount?.(), pinCount: state?.pins?.length };
    });
    assert.deepEqual(creatorPublicState, { classification: "UI-MOCK", account: CREATOR, pinCount: 2 });
    const collectorPublicState = await collectorPage.evaluate(() => {
      const state = (window as any).__pastaUiLiveBridge;
      return { classification: state?.classification, account: state?.getAccount?.(), pinCount: state?.pins?.length };
    });
    assert.deepEqual(collectorPublicState, { classification: "UI-MOCK", account: COLLECTOR, pinCount: 0 });
  } finally {
    creatorMonitor.dispose();
    collectorMonitor.dispose();
    await browser.close();
    await Promise.all([creatorServer.close(), collectorServer.close()]);
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("Penne TzKT finality validator binds exact hash, signer, action, contract, entrypoint, and applied status", () => {
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
    parameter: { entrypoint: "create_token" },
    level: 4_320_001,
    timestamp,
  };
  const internalTransfer = {
    type: "transaction",
    status: "applied",
    hash: OPERATION_HASHES[1],
    sender: { address: CONTRACT },
    target: { address: CREATOR },
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
    entrypoints: ["create_token"],
  };

  assert.equal(
    assertPenneTzktOperationApplied({
      rows: [origination],
      assertion: originationAssertion,
      signerAddress: CREATOR,
    }).originatedContract?.address,
    CONTRACT,
  );
  assert.equal(
    assertPenneTzktOperationApplied({
      rows: [call, internalTransfer],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }).parameter?.entrypoint,
    "create_token",
  );
  assert.throws(
    () => assertPenneTzktOperationApplied({
      rows: [{ ...call, status: "backtracked" }, internalTransfer],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /not applied/,
  );
  assert.throws(
    () => assertPenneTzktOperationApplied({
      rows: [{ ...call, sender: { address: COLLECTOR } }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /exactly one.*exact hash and signer/,
  );
  assert.throws(
    () => assertPenneTzktOperationApplied({
      rows: [{ ...call, target: { address: UNRELATED_CONTRACT } }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /target differs/,
  );
  assert.throws(
    () => assertPenneTzktOperationApplied({
      rows: [{ ...call, parameter: { entrypoint: "set_allocations" } }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /entrypoint differs/,
  );
  assert.throws(
    () => assertPenneTzktOperationApplied({
      rows: [call, { ...call }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /exactly one.*exact hash and signer/,
  );
  assert.throws(
    () => assertPenneTzktOperationApplied({
      rows: [call],
      assertion: { ...callAssertion, action: "batch" },
      signerAddress: CREATOR,
    }),
    /does not permit batch/,
  );
});

test("fake Penne finality verifier rejects a submitted operation whose fake chain status is rejected", async () => {
  const fakeChain = createFakeChain();
  const contract = await fakeChain.toolkitFor(COLLECTOR).contract.at(CONTRACT);
  const operation = await contract.methodsObject.airdrop([{ recipient: CREATOR, token_id: 0 }]).send();
  await assert.rejects(() => operation.confirmation(), /NOT_ADMIN/);
  assert.equal(fakeChain.finalityState.confirmationCalls, 1, "explicit rejection observation must retain confirmation coverage");
  assert.throws(
    () => fakeChain.assertOperationApplied({
      action: "call",
      operationHash: operation.hash,
      contractAddress: CONTRACT,
      entrypoints: ["airdrop"],
    }, COLLECTOR),
    /is rejected/,
  );
});

test("Penne TzKT verifier requires the fresh contract, exact metadata, exhausted allocations, final balances, and every applied operation", async () => {
  const collectionMetadataUri = `ipfs://${CID}/collection.json`;
  const tokenMetadataUri = `ipfs://${CID}/token.json`;
  const operationPlan = [
    { action: "originate", entrypoint: undefined, signerAddress: CREATOR },
    { action: "call", entrypoint: "create_token", signerAddress: CREATOR },
    { action: "call", entrypoint: "set_allocations", signerAddress: CREATOR },
    { action: "call", entrypoint: "open_claim", signerAddress: CREATOR },
    { action: "call", entrypoint: "claim", signerAddress: COLLECTOR },
    { action: "call", entrypoint: "airdrop", signerAddress: CREATOR },
    { action: "call", entrypoint: "open_claim", signerAddress: CREATOR },
  ] as const;
  const operationReceipts: Parameters<typeof verifyPenneTzktEvidence>[0]["operationReceipts"] =
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
  let indexedCollectorBalance = "1";
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    requests.push(url.toString());
    const pathName = url.pathname;
    let body: unknown;
    if (pathName === `/v1/contracts/${CONTRACT}`) {
      body = {
        address: CONTRACT,
        kind: "asset",
        tzips: ["fa2"],
        firstActivity: 9_100_001,
        lastActivity: 9_100_007,
      };
    } else if (pathName === `/v1/contracts/${CONTRACT}/storage`) {
      body = {
        next_token_id: 1,
        claim_active: false,
        metadata: 101,
        ledger: 102,
        token_metadata: 103,
        total_supply: 104,
        allocations: 105,
        claimed: 106,
      };
    } else if (pathName === "/v1/bigmaps/101/keys") {
      body = [{ key: "", value: utf8ToHex(collectionMetadataUri) }];
    } else if (pathName === "/v1/bigmaps/103/keys") {
      body = [{ key: "0", value: { token_id: "0", token_info: { "": utf8ToHex(tokenMetadataUri) } } }];
    } else if (pathName === "/v1/bigmaps/104/keys") {
      body = [{ key: "0", value: "3" }];
    } else if (pathName === "/v1/bigmaps/102/keys") {
      body = [
        { key: { owner: COLLECTOR, token_id: "0" }, value: "1" },
        { key: { owner: CREATOR, token_id: "0" }, value: "2" },
      ];
    } else if (pathName === "/v1/bigmaps/106/keys") {
      body = [
        { key: { owner: COLLECTOR, token_id: "0" }, value: "1" },
        { key: { owner: CREATOR, token_id: "0" }, value: "2" },
      ];
    } else if (pathName === "/v1/bigmaps/105/keys") {
      body = [];
    } else if (pathName === "/v1/tokens") {
      body = [{ contract: { address: CONTRACT }, tokenId: "0", totalSupply: "3" }];
    } else if (pathName === "/v1/tokens/balances") {
      const account = url.searchParams.get("account");
      body = [{
        account: { address: account },
        token: { contract: { address: CONTRACT }, tokenId: "0" },
        balance: account === CREATOR ? "2" : indexedCollectorBalance,
      }];
    } else if (pathName.startsWith("/v1/operations/originations/")) {
      const operationHash = pathName.split("/").at(-1);
      body = {
        type: "origination",
        status: "applied",
        hash: operationHash,
        level: 9_100_001,
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
        level: 9_100_001 + index,
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
    const evidence = await verifyPenneTzktEvidence({
      contractAddress: CONTRACT,
      creatorAddress: CREATOR,
      collectorAddress: COLLECTOR,
      collectionMetadataUri,
      tokenMetadataUri,
      operationReceipts,
      pollOptions: { attempts: 1, delayMs: 0 },
    });
    assert.equal(evidence.schema, "pastaprotocol-penne-tzkt-index@1");
    assert.equal((evidence.contract as { kind: string }).kind, "asset");
    assert.deepEqual((evidence.contract as { tzips: string[] }).tzips, ["fa2"]);
    assert.equal((evidence.storage as { claimActive: boolean }).claimActive, false);
    assert.deepEqual(evidence.activeAllocations, []);
    assert.equal((evidence.operations as unknown[]).length, 7);
    assert.equal(requests.length, 18);
    assert.equal(new Set(requests).size, 18);
    assert.ok(requests.some((url) => url.includes(`/contracts/${CONTRACT}/storage`)));
    assert.ok(requests.some((url) => url.includes(`/tokens?contract=${CONTRACT}`)));
    for (const operationHash of OPERATION_HASHES) {
      assert.ok(requests.some((url) => url.includes(operationHash)), `${operationHash} was not independently checked`);
    }
    indexedCollectorBalance = "2";
    await assert.rejects(
      verifyPenneTzktEvidence({
        contractAddress: CONTRACT,
        creatorAddress: CREATOR,
        collectorAddress: COLLECTOR,
        collectionMetadataUri,
        tokenMetadataUri,
        operationReceipts,
        pollOptions: { attempts: 1, delayMs: 0 },
      }),
      /indexed collector balance did not appear/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("production Penne runner is execute-gated, Shadownet-only, and recorder-free", async () => {
  assert.throws(
    () => assertPenneUiLiveExecutionAllowed({}),
    /explicit Penne UI-live execute flag is required/,
  );
  assert.throws(
    () => assertPenneUiLiveExecutionAllowed({
      PASTA_SHADOWNET_PENNE_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "mainnet",
    }),
    /only permits Shadownet/,
  );
  assert.doesNotThrow(() => assertPenneUiLiveExecutionAllowed({
    PASTA_SHADOWNET_PENNE_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/proof",
    TEZOS_NETWORK: "shadownet",
  }));
  assert.throws(
    () => assertPenneUiLiveExecutionAllowed({
      PASTA_SHADOWNET_PENNE_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "shadownet",
      PASTA_SHADOWNET_PENNE_EXISTING_CONTRACT: CONTRACT,
    }),
    /fresh-origination only/,
  );

  const source = await readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-penne-ui-live.ts"), "utf8");
  assert.match(source, /classification: "UI-LIVE"/);
  assert.match(source, /loadSignerPair\(environment\)/);
  assert.match(source, /allowedContractAddresses: new Set\(\[contractAddress\]\)/);
  assert.match(source, /assertShadownet\(creatorTezos/);
  assert.match(source, /assertShadownet\(collectorTezos/);
  assert.match(source, /authorizeAfterFundingPreflight/);
  assert.match(source, /creatorPage\.click\("#btnDeploy"\)/);
  assert.match(source, /collectorPage\.click\("#btnClaim"\)/);
  assert.match(source, /creatorPage\.click\("#btnAirdrop"\)/);
  assert.match(source, /pastaprotocol-app-proof@1/);
  assert.match(source, /pastaprotocol-penne-tzkt-index@1/);
  assert.match(source, /retrievedSha256/);
  assert.match(source, /pollJson/);
  assert.match(source, /\/tokens\?contract=/);
  assert.equal(
    (source.match(/assertOperationApplied: \(assertion\) => verifyPenneTzktOperationApplied/g) || []).length,
    2,
    "creator and collector sessions must independently verify exact operation hashes",
  );
  const firstOutputWrite = source.indexOf("await mkdir");
  const creatorFundingGate = source.indexOf("creator is underfunded before any pin or chain write");
  const collectorFundingGate = source.indexOf("collector is underfunded before any pin or chain write");
  assert.ok(creatorFundingGate >= 0 && creatorFundingGate < firstOutputWrite);
  assert.ok(collectorFundingGate >= 0 && collectorFundingGate < firstOutputWrite);
  assert.doesNotMatch(source, /UI-MOCK/);
  assert.doesNotMatch(source, /recordVideo|recordHar|tracing\.start|launchPersistentContext/);
});
