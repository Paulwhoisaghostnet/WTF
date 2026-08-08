import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { chromium, type BrowserContext, type Page } from "playwright";

import {
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
import { deterministicJsonBytes, root, utf8ToHex } from "./shadownet-proof-kit";
import {
  assertRotiniUiLiveExecutionAllowed,
  assertRotiniTzktOperationApplied,
  buildRotiniRavioliDependencyEvidence,
  buildRotiniProofLayerPng,
  configureRotiniStudio,
  createRotiniAppliedOperationBinding,
  installRotiniBrowserAdapters,
  readRotiniBrowserProjection,
  validateRotiniOutputBytes,
} from "./shadownet-rotini-ui-live";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const CHAIN_ID = "NetXsqzbfFenSTS";
const OPERATION_HASHES = [
  "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq",
  "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp",
  "ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM",
  "ontvJUZ9vNVusfHbcvzSX8xpPZMutmmwqqarvj4N78u2tUQn4oz",
  "onwA9NfZ61x8n7QAPnTVXpL7ZvR9C3gFATds1YDmFLGwAFrdgso",
  "oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h",
  "oo3s9KWmeGmNP22aFNnaFffM8yhCb9zDDvMnbd58HH2pETSJ1z8",
  "oo4EWt4cSBzh8YQXMvstowHos8FyBJ4hHCmQgn6N6Tjf5AqoMkN",
  "oo5bYmyRD3jbNkrM55SEYgMQJLWXmiyGT9HGZAJkteAprBaiJGG",
  "ooBnf6EHZ2SKxvVw5MQVHN4fjqAYzCKFo61QGT9eZ2cHrDoGmBM",
];

type FakeProject = Record<string, unknown> & { minted: number; reserved: number };
type FakeReservation = {
  project_id: number;
  token_id: number;
  iteration: number;
  seed: string;
  owner: string;
};

type FakeAppliedOperation = {
  hash: string;
  status: "submitted" | "applied";
  type: "origination" | "transaction";
  sender: { address: string };
  originatedContract?: { address: string };
  target?: { address: string };
  parameter?: { entrypoint: string };
  level: number;
  timestamp: string;
};

type FakeState = {
  nextProjectId: number;
  nextReservationId: number;
  nextTokenId: number;
  projects: Record<string, FakeProject>;
  reservations: Record<string, FakeReservation>;
  latestReservation: Record<string, number>;
  calls: Array<{ signer: string; entrypoint: string; payload: unknown; sendOptions: unknown }>;
  appliedOperations: Record<string, FakeAppliedOperation>;
  verifiedOperationHashes: string[];
  confirmationCalls: number;
};

function base32(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let buffer = 0;
  let bits = 0;
  let output = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function rawCid(bytes: Uint8Array): string {
  const digest = createHash("sha256").update(bytes).digest();
  return `b${base32(Uint8Array.from([1, 0x55, 0x12, 0x20, ...digest]))}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function numeric(value: unknown): number {
  const parsed = Number(value && typeof (value as any).toString === "function" ? (value as any).toString() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fakeBigMap(values: Record<string, unknown>) {
  return {
    async get(key: string | number) {
      if (typeof key === "number") {
        assert.ok(Number.isFinite(key), "big-map lookup must never coerce an address key to NaN");
      }
      return values[String(key)];
    },
  };
}

function fakeProjectBigMap(values: Record<string, Record<string, any>>) {
  return {
    async get(key: string | number) {
      if (typeof key === "number") {
        assert.ok(Number.isFinite(key), "big-map lookup must never coerce an address key to NaN");
      }
      const value = values[String(key)];
      if (!value) return undefined;
      return {
        ...value,
        max_supply: value.max_supply == null ? null : { Some: value.max_supply },
        max_per_wallet: value.max_per_wallet == null ? null : { Some: value.max_per_wallet },
      };
    },
  };
}

function createFakeChain() {
  const state: FakeState = {
    nextProjectId: 0,
    nextReservationId: 0,
    nextTokenId: 0,
    projects: {},
    reservations: {},
    latestReservation: {},
    calls: [],
    appliedOperations: {},
    verifiedOperationHashes: [],
    confirmationCalls: 0,
  };
  let operationIndex = 0;

  function toolkit(signer: string) {
    const contract = {
      address: CONTRACT,
      methodsObject: new Proxy({}, {
        get(_target, entrypoint) {
          if (typeof entrypoint !== "string") return undefined;
          return (payload: unknown) => ({
            async send(sendOptions: unknown = {}) {
              state.calls.push({ signer, entrypoint, payload, sendOptions });
              if (entrypoint === "create_project") {
                state.projects[String(state.nextProjectId)] = {
                  ...(payload as Record<string, unknown>),
                  minted: 0,
                  reserved: 0,
                };
                state.nextProjectId += 1;
              } else if (entrypoint === "reserve_iteration") {
                const projectId = numeric(payload);
                const project = state.projects[String(projectId)];
                assert.ok(project, `missing fake project ${projectId}`);
                const reservationId = state.nextReservationId++;
                const tokenId = state.nextTokenId++;
                state.reservations[String(reservationId)] = {
                  project_id: projectId,
                  token_id: tokenId,
                  iteration: project.minted + project.reserved,
                  seed: `rotini-ui-fake-seed-${projectId}-${tokenId}`,
                  owner: signer,
                };
                state.latestReservation[signer] = reservationId;
                project.reserved += 1;
              } else if (entrypoint === "finalize_iteration") {
                const reservationId = numeric((payload as Record<string, unknown>).reservation_id);
                const reservation = state.reservations[String(reservationId)];
                assert.ok(reservation, `missing fake reservation ${reservationId}`);
                const project = state.projects[String(reservation.project_id)];
                project.reserved -= 1;
                project.minted += 1;
                delete state.reservations[String(reservationId)];
                delete state.latestReservation[signer];
              } else {
                assert.fail(`unexpected fake Rotini entrypoint ${entrypoint}`);
              }
              const hash = OPERATION_HASHES[operationIndex++];
              const applied: FakeAppliedOperation = {
                hash,
                status: "submitted",
                type: "transaction",
                sender: { address: signer },
                target: { address: CONTRACT },
                parameter: { entrypoint },
                level: 1_000 + operationIndex,
                timestamp: `2026-07-23T20:${String(operationIndex).padStart(2, "0")}:00.000Z`,
              };
              state.appliedOperations[hash] = applied;
              queueMicrotask(() => {
                applied.status = "applied";
              });
              return {
                hash,
                opHash: hash,
                async confirmation() {
                  state.confirmationCalls += 1;
                  await Promise.resolve();
                  assert.equal(applied.status, "applied", "fake Rotini call must settle independently before confirmation observes it");
                  return 1;
                },
              };
            },
          });
        },
      }),
      async storage() {
        return {
          next_project_id: state.nextProjectId,
          next_reservation_id: state.nextReservationId,
          next_token_id: state.nextTokenId,
          projects: fakeProjectBigMap(state.projects),
          reservations: fakeBigMap(state.reservations),
          latest_reservation: fakeBigMap(state.latestReservation),
        };
      },
    };
    return {
      tz: {
        async getBalance() {
          return { toString: () => "5000000" };
        },
      },
      contract: {
        async originate() {
          const hash = OPERATION_HASHES[operationIndex++];
          const applied: FakeAppliedOperation = {
            hash,
            status: "submitted",
            type: "origination",
            sender: { address: signer },
            originatedContract: { address: CONTRACT },
            level: 1_000 + operationIndex,
            timestamp: `2026-07-23T20:${String(operationIndex).padStart(2, "0")}:00.000Z`,
          };
          state.appliedOperations[hash] = applied;
          queueMicrotask(() => {
            applied.status = "applied";
          });
          return {
            hash,
            contractAddress: CONTRACT,
            async confirmation() {
              state.confirmationCalls += 1;
              await Promise.resolve();
              assert.equal(applied.status, "applied", "fake Rotini origination must settle independently before confirmation observes it");
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
      },
    } as any;
  }

  return { state, creatorTezos: toolkit(CREATOR), collectorTezos: toolkit(COLLECTOR) };
}

function strictFakeAppliedOperationVerifier(
  state: FakeState,
  signerAddress: string,
): (assertion: PastaUiLiveAppliedOperationAssertion) => Promise<void> {
  return async (assertion) => {
    const operation = state.appliedOperations[assertion.operationHash];
    assert.ok(operation, `fake chain lacks submitted operation ${assertion.operationHash}`);
    assertRotiniTzktOperationApplied({
      rows: operation,
      assertion,
      signerAddress,
    });
    assert.equal(
      state.verifiedOperationHashes.includes(assertion.operationHash),
      false,
      `fake operation ${assertion.operationHash} was verified more than once`,
    );
    state.verifiedOperationHashes.push(assertion.operationHash);
  };
}

function createPinService() {
  const store = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  const proofs: PastaUiLivePinProof[] = [];
  function proofFor(bytes: Uint8Array, fileName: string, mimeType: string): PastaUiLivePinProof {
    const copy = Uint8Array.from(bytes);
    const cid = rawCid(copy);
    store.set(cid, { bytes: copy, mimeType });
    const proof: PastaUiLivePinProof = {
      cid,
      uri: `ipfs://${cid}`,
      fileName,
      mimeType,
      byteLength: copy.byteLength,
      sha256: sha256(copy),
      localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
      publicGatewayUrl: `https://proof.invalid/ipfs/${cid}`,
      publicGatewayVerified: true,
      verificationAttempts: 1,
    };
    proofs.push(proof);
    return proof;
  }
  return {
    store,
    proofs,
    pinJson: async ({ value, fileName }: { value: unknown; fileName: string }) =>
      proofFor(deterministicJsonBytes(value), fileName, "application/json"),
    pinBlob: async ({ bytes, fileName, mimeType }: { bytes: Uint8Array; fileName: string; mimeType: string }) =>
      proofFor(bytes, fileName, mimeType),
  };
}

async function installProofGateway(context: BrowserContext, store: Map<string, { bytes: Uint8Array; mimeType: string }>): Promise<void> {
  await context.route("https://proof.invalid/ipfs/**", async (route) => {
    const cid = new URL(route.request().url()).pathname.split("/").at(-1) || "";
    const record = store.get(cid);
    if (!record) {
      await route.fulfill({ status: 404, body: "missing fake pin" });
      return;
    }
    await route.fulfill({
      status: 200,
      body: Buffer.from(record.bytes),
      contentType: record.mimeType,
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    });
  });
}

async function waitForLog(page: Page, text: string, count = 1, failureText = ""): Promise<void> {
  try {
    await page.waitForFunction(
      ({ expected, minimum, failure }) => {
        const log = document.getElementById("log")?.textContent || "";
        const notice = document.getElementById("ppNotice")?.textContent || "";
        return log.split(expected).length - 1 >= minimum ||
          Boolean(failure && (log.includes(failure) || notice.includes(failure)));
      },
      { expected: text, minimum: count, failure: failureText },
      { timeout: 30_000 },
    );
    const content = await page.locator("#log").textContent() || "";
    if (content.split(text).length - 1 < count) {
      throw new Error(`Rotini browser reported ${failureText || "an alternate failure"}`);
    }
  } catch (error) {
    const [notice, log] = await Promise.all([
      page.locator("#ppNotice").innerText().catch(() => "<unreadable>"),
      page.locator("#log").innerText().catch(() => "<unreadable>"),
    ]);
    throw new Error(
      `Rotini browser stage failed while waiting for ${JSON.stringify(text)}; ` +
      `notice=${JSON.stringify(notice.slice(-2_000))} logTail=${JSON.stringify(log.slice(-2_000))}`,
      { cause: error },
    );
  }
}

async function waitForText(page: Page, selector: string, text: string): Promise<void> {
  try {
    await page.waitForFunction(
      ({ target, expected }) => document.querySelector(target)?.textContent?.includes(expected),
      { target: selector, expected: text },
      { timeout: 10_000 },
    );
  } catch (error) {
    const actual = await page.locator(selector).textContent().catch(() => "<unreadable>");
    throw new Error(`Timed out waiting for ${selector} to contain ${JSON.stringify(text)}; actual=${JSON.stringify(actual)}`, { cause: error });
  }
}

async function captureMock(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  stage: string,
  expectedLog: string,
  focus: string,
): Promise<CapturePastaProofStageResult> {
  await page.locator(focus).scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "rotini",
    capability: "fixture Rotini creator collector lifecycle",
    stageOrdinal: ordinal,
    stageName: stage,
    classification: "UI-MOCK",
    requiredEvidence: [
      { selector: "h1", expectedText: "Rotini" },
      { selector: "#log", expectedText: expectedLog },
    ],
    waitForLoadState: "none",
  });
}

test("actual Rotini studio completes creator publish and independent collector PNG/GIF/ZIP lifecycle through fake bridge callbacks", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "rotini-ui-live-browser-"));
  const chain = createFakeChain();
  const pinService = createPinService();
  let creatorProjection = await Promise.resolve({
    next_project_id: 0,
    next_reservation_id: 0,
    next_token_id: 0,
    projects: {},
    reservations: {},
    latest_reservation: {},
  });
  let creatorContract = "";
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: chain.creatorTezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["create_project"]),
    assertExpectedChain: async () => CHAIN_ID,
    assertOperationApplied: strictFakeAppliedOperationVerifier(chain.state, CREATOR),
    pinJson: pinService.pinJson,
    pinBlob: pinService.pinBlob,
    projectStorage: () => creatorProjection,
    onReceipt: async (receipt) => {
      if (receipt.contractAddress) creatorContract = receipt.contractAddress;
      if (receipt.operationHash && creatorContract) {
        creatorProjection = await readRotiniBrowserProjection(chain.creatorTezos, creatorContract, CREATOR);
      }
    },
  });
  creatorSession.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 1_000_000,
    estimatedOriginationMutez: 500_000,
    operationReserveMutez: 500_000,
  });
  const creatorServer = await startPastaUiLiveLoopbackServer({
    staticRoot: path.join(root, "public"),
    handleAction: (request) => creatorSession.handle(request),
  });
  const browser = await chromium.launch({ headless: true });
  const captures: CapturePastaProofStageResult[] = [];
  try {
    const creatorContext = await browser.newContext({
      viewport: PASTA_PROOF_VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await installProofGateway(creatorContext, pinService.store);
    const creatorPage = await creatorContext.newPage();
    const creatorPageMonitor = monitorPastaProofPage(creatorPage);
    try {
      await creatorPage.goto(`${creatorServer.origin}/creation-tools/rotini/index.html`, { waitUntil: "networkidle" });
      await creatorPage.waitForFunction(() => Boolean((window as any).MD && (window as any).RotiniArtifacts));
      await installPastaUiLiveBrowserProxy(creatorPage, creatorServer, "UI-MOCK");
      await installRotiniBrowserAdapters(creatorPage, "https://proof.invalid/ipfs");
      await configureRotiniStudio(creatorPage, "http://127.0.0.1:5001");
      await waitForLog(creatorPage, "generated 4 edition(s)");
      captures.push(await captureMock(creatorPage, creatorPageMonitor, outputRoot, 1, "generator configured", "generated 4 edition(s)", "#genStatus"));

      await creatorPage.click("#btnConnect");
      await waitForLog(creatorPage, `connected ${CREATOR} on shadownet`);
      for (const [index, mode] of ["png", "gif", "zip"].entries()) {
        await creatorPage.fill("#salePrice", index === 0 ? "0" : "0.000001");
        if (index > 0) {
          await creatorPage.selectOption("#outputMode", mode);
          await creatorPage.check('input[name="target"][value="existing_contract"]');
        }
        await creatorPage.click("#btnPublish");
        await waitForLog(creatorPage, "generative project published ✓", index + 1, "publish failed:");
        await waitForText(creatorPage, "#ppNotice", `Published ${mode.toUpperCase()} generator project ${index}`);
        assert.equal(creatorProjection.next_project_id, index + 1, "server projection must advance after project publication");
        const browserNextProjectId = await creatorPage.evaluate(async () => {
          const contract = await (window as any).MD.getToolkit().contract.at((document.getElementById("existingKt") as HTMLInputElement).value);
          const storage = await contract.storage();
          return Number(storage.next_project_id ?? -1);
        });
        assert.equal(browserNextProjectId, index + 1, "browser bridge projection must expose the next project id");
      }
      captures.push(await captureMock(creatorPage, creatorPageMonitor, outputRoot, 2, "three projects published", "generative project published ✓", "#log"));
      assert.equal(creatorContract, CONTRACT);
      assert.equal(chain.state.nextProjectId, 3);
      assert.equal(numeric(chain.state.projects["0"]?.price), 0);
      assert.equal(numeric(chain.state.projects["0"]?.max_supply), 4);
      assert.equal(pinService.proofs.length, 13);
    } finally {
      creatorPageMonitor.dispose();
      await creatorContext.close();
      await creatorServer.close();
    }

    let collectorProjection = await readRotiniBrowserProjection(chain.collectorTezos, CONTRACT, COLLECTOR);
    const reservationCounterSnapshots: Array<{ nextReservationId: number; nextTokenId: number }> = [];
    const collectorSession = new TaquitoPastaUiLiveSession({
      tezos: chain.collectorTezos,
      signerAddress: COLLECTOR,
      expectedChainId: CHAIN_ID,
      allowedContractAddresses: new Set([CONTRACT]),
      allowedEntrypoints: new Set(["reserve_iteration", "finalize_iteration"]),
      assertExpectedChain: async () => CHAIN_ID,
      assertOperationApplied: strictFakeAppliedOperationVerifier(chain.state, COLLECTOR),
      pinJson: pinService.pinJson,
      pinBlob: pinService.pinBlob,
      projectStorage: () => collectorProjection,
      onReceipt: async (receipt) => {
        if (receipt.operationHash) {
          collectorProjection = await readRotiniBrowserProjection(chain.collectorTezos, CONTRACT, COLLECTOR);
          if (receipt.entrypoints?.includes("reserve_iteration")) {
            reservationCounterSnapshots.push({
              nextReservationId: collectorProjection.next_reservation_id,
              nextTokenId: collectorProjection.next_token_id,
            });
          }
        }
      },
    });
    collectorSession.authorizeAfterFundingPreflight({
      balanceMutez: 5_000_000,
      requiredBalanceMutez: 500_003,
      estimatedOriginationMutez: 0,
      operationReserveMutez: 500_000,
    });
    const collectorServer = await startPastaUiLiveLoopbackServer({
      staticRoot: path.join(root, "public"),
      handleAction: (request) => collectorSession.handle(request),
    });
    const collectorContext = await browser.newContext({
      viewport: PASTA_PROOF_VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await installProofGateway(collectorContext, pinService.store);
    const page = await collectorContext.newPage();
    const monitor = monitorPastaProofPage(page);
    try {
      await page.goto(`${collectorServer.origin}/creation-tools/rotini/index.html`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean((window as any).MD && (window as any).RotiniArtifacts));
      await installPastaUiLiveBrowserProxy(page, collectorServer, "UI-MOCK");
      await installRotiniBrowserAdapters(page, "https://proof.invalid/ipfs");
      await page.selectOption("#network", "shadownet");
      await page.selectOption("#pinProvider", "node");
      await page.fill("#pinNode", "http://127.0.0.1:5001");
      await page.fill("#mintKt", CONTRACT);
      await page.click("#btnConnect");
      await waitForLog(page, `connected ${COLLECTOR} on shadownet`);
      await page.fill("#mintProjectId", "0");
      await page.click("#btnLoadProject");
      await waitForText(page, "#mintInfo", "PNG");
      assert.match(await page.locator("#mintInfo").innerText(), /\/ 4 · PNG/);
      assert.doesNotMatch(await page.locator("#mintInfo").innerText(), /\[object Object\]/);
      captures.push(await captureMock(page, monitor, outputRoot, 3, "collector loaded project", `connected ${COLLECTOR}`, "#mintInfo"));

      for (const [index, mode] of ["png", "gif", "zip"].entries()) {
        await page.fill("#mintProjectId", String(index));
        await page.click("#btnLoadProject");
        await waitForText(page, "#mintInfo", mode.toUpperCase());
        assert.doesNotMatch(await page.locator("#mintInfo").innerText(), /\[object Object\]/);
        await page.click("#btnMintIteration");
        await waitForLog(
          page,
          `collector finalized ${mode.toUpperCase()} token ${index}`,
          1,
          "Iteration mint failed:",
        );
        await waitForText(page, "#ppNotice", `${mode.toUpperCase()} iteration ${index} finalized`);
      }
      captures.push(await captureMock(page, monitor, outputRoot, 4, "three tokens finalized", "collector finalized ZIP token 2", "#mintInfo"));

      assert.equal(chain.state.nextTokenId, 3);
      assert.deepEqual(reservationCounterSnapshots, [
        { nextReservationId: 1, nextTokenId: 1 },
        { nextReservationId: 2, nextTokenId: 2 },
        { nextReservationId: 3, nextTokenId: 3 },
      ], "reserve_iteration must allocate its reservation id and token id in the same confirmed operation");
      assert.equal(Object.keys(chain.state.reservations).length, 0);
      assert.equal(pinService.proofs.length, 20);
      assert.deepEqual(
        chain.state.calls.map(({ signer, entrypoint }) => ({ signer, entrypoint })),
        [
          { signer: CREATOR, entrypoint: "create_project" },
          { signer: CREATOR, entrypoint: "create_project" },
          { signer: CREATOR, entrypoint: "create_project" },
          { signer: COLLECTOR, entrypoint: "reserve_iteration" },
          { signer: COLLECTOR, entrypoint: "finalize_iteration" },
          { signer: COLLECTOR, entrypoint: "reserve_iteration" },
          { signer: COLLECTOR, entrypoint: "finalize_iteration" },
          { signer: COLLECTOR, entrypoint: "reserve_iteration" },
          { signer: COLLECTOR, entrypoint: "finalize_iteration" },
        ],
      );
      for (const [index, call] of chain.state.calls.filter(({ entrypoint }) => entrypoint === "reserve_iteration").entries()) {
        assert.equal((call.sendOptions as Record<string, unknown>).amount, index === 0 ? 0 : 1);
        assert.equal((call.sendOptions as Record<string, unknown>).mutez, true);
      }
      assert.equal(chain.state.projects["0"].minted, 1);
      assert.equal(chain.state.projects["0"].reserved, 0);
      assert.equal(numeric(chain.state.projects["0"].max_supply) - chain.state.projects["0"].minted - chain.state.projects["0"].reserved, 3);
      const outputProofs = [
        pinService.proofs.find(({ fileName }) => fileName === "rotini-0.png"),
        pinService.proofs.find(({ fileName }) => fileName === "rotini-1.gif"),
        pinService.proofs.find(({ fileName }) => fileName === "rotini-2.zip"),
      ];
      for (const [index, proof] of outputProofs.entries()) {
        assert.ok(proof);
        const stored = pinService.store.get(proof.cid);
        assert.ok(stored);
        validateRotiniOutputBytes(["png", "gif", "zip"][index] as "png" | "gif" | "zip", stored.bytes);
      }
      const creatorOps = creatorSession.getReceipts().filter((receipt) => receipt.operationHash);
      const collectorOps = collectorSession.getReceipts().filter((receipt) => receipt.operationHash);
      assert.equal(creatorOps.length, 4);
      assert.equal(collectorOps.length, 6);
      assert.deepEqual([...creatorOps, ...collectorOps].map((receipt) => receipt.operationHash), OPERATION_HASHES);
      assert.deepEqual(chain.state.verifiedOperationHashes, OPERATION_HASHES);
      assert.equal(
        chain.state.confirmationCalls,
        0,
        "successful Rotini UI-LIVE verification must not depend on native confirmation polling",
      );
      assert.ok(
        Object.values(chain.state.appliedOperations).every(({ status }) => status === "applied"),
        "every fake operation must be independently observed as applied",
      );
    } finally {
      monitor.dispose();
      await collectorContext.close();
      await collectorServer.close();
    }

    assert.equal(captures.length, 4);
    for (const capture of captures) {
      assert.equal(capture.sidecar.classification, "UI-MOCK");
      await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);
    }
  } finally {
    await browser.close();
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("Rotini applied-operation evidence binds exact hash, applied status, signer, contract, and entrypoint", () => {
  const timestamp = "2026-07-23T20:00:00.000Z";
  const originationAssertion: PastaUiLiveAppliedOperationAssertion = {
    action: "originate",
    operationHash: OPERATION_HASHES[0],
    contractAddress: CONTRACT,
    entrypoints: [],
  };
  const origination = {
    hash: OPERATION_HASHES[0],
    status: "applied",
    type: "origination",
    sender: { address: CREATOR },
    originatedContract: { address: CONTRACT },
    level: 1_000,
    timestamp,
  };
  assert.deepEqual(
    assertRotiniTzktOperationApplied({
      rows: origination,
      assertion: originationAssertion,
      signerAddress: CREATOR,
    }),
    {
      operationHash: OPERATION_HASHES[0],
      status: "applied",
      action: "originate",
      signerAddress: CREATOR,
      contractAddress: CONTRACT,
      entrypoints: [],
      level: 1_000,
      timestamp,
    },
  );

  const callAssertion: PastaUiLiveAppliedOperationAssertion = {
    action: "call",
    operationHash: OPERATION_HASHES[1],
    contractAddress: CONTRACT,
    entrypoints: ["create_project"],
  };
  const call = {
    hash: OPERATION_HASHES[1],
    status: "applied",
    type: "transaction",
    sender: { address: CREATOR },
    target: { address: CONTRACT },
    parameter: { entrypoint: "create_project" },
    level: 1_001,
    timestamp,
  };
  assert.equal(
    assertRotiniTzktOperationApplied({
      rows: [call],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }).entrypoints[0],
    "create_project",
  );
  assert.throws(
    () => assertRotiniTzktOperationApplied({
      rows: [{ ...call, hash: OPERATION_HASHES[2] }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /exact submitted hash/,
  );
  assert.throws(
    () => assertRotiniTzktOperationApplied({
      rows: [{ ...call, status: "backtracked" }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /not wholly applied/,
  );
  assert.throws(
    () => assertRotiniTzktOperationApplied({
      rows: [{ ...call, sender: { address: COLLECTOR } }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /exactly one Rotini call/,
  );
  assert.throws(
    () => assertRotiniTzktOperationApplied({
      rows: [{ ...call, target: { address: "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i" } }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /exactly one Rotini call/,
  );
  assert.throws(
    () => assertRotiniTzktOperationApplied({
      rows: [{ ...call, parameter: { entrypoint: "reserve_iteration" } }],
      assertion: callAssertion,
      signerAddress: CREATOR,
    }),
    /exactly one Rotini call/,
  );
  assert.throws(
    () => assertRotiniTzktOperationApplied({
      rows: [{ ...origination, originatedContract: { address: "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i" } }],
      assertion: originationAssertion,
      signerAddress: CREATOR,
    }),
    /exactly one Rotini originate/,
  );
  assert.throws(
    () => assertRotiniTzktOperationApplied({
      rows: call,
      assertion: { ...callAssertion, entrypoints: ["create_project", "reserve_iteration"] },
      signerAddress: CREATOR,
    }),
    /exactly one entrypoint/,
  );
});

test("Rotini checkpoint binding persists a receipt only after exact applied evidence", async () => {
  const assertion: PastaUiLiveAppliedOperationAssertion = {
    action: "call",
    operationHash: OPERATION_HASHES[1],
    contractAddress: CONTRACT,
    entrypoints: ["create_project"],
  };
  const binding = createRotiniAppliedOperationBinding({
    signerAddress: CREATOR,
    verifyApplied: async ({ assertion: candidate, signerAddress }) =>
      assertRotiniTzktOperationApplied({
        rows: {
          hash: candidate.operationHash,
          status: "applied",
          type: "transaction",
          sender: { address: signerAddress },
          target: { address: candidate.contractAddress },
          parameter: { entrypoint: candidate.entrypoints[0] },
          level: 1_001,
          timestamp: "2026-07-23T20:00:00.000Z",
        },
        assertion: candidate,
        signerAddress,
      }),
  });
  const receipt = {
    action: "call",
    operationHash: assertion.operationHash,
    signerAddress: CREATOR,
    contractAddress: CONTRACT,
    entrypoints: ["create_project"],
  } as any;
  let persisted = false;
  await assert.rejects(
    binding.bindReceipt(receipt, () => {
      persisted = true;
    }),
    /lacks exact applied-operation evidence/,
  );
  assert.equal(persisted, false);
  await binding.assertOperationApplied(assertion);
  await binding.bindReceipt(receipt, () => {
    persisted = true;
  });
  assert.equal(persisted, true);
  binding.assertSettled();
});

test("Rotini production runner is explicit, fresh, Shadownet-only, funded-before-write, and recorder-free", async () => {
  assert.throws(() => assertRotiniUiLiveExecutionAllowed({}), /explicit Rotini UI-live execute flag is required/);
  assert.throws(
    () => assertRotiniUiLiveExecutionAllowed({
      PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "mainnet",
    }),
    /only permits Shadownet/,
  );
  assert.throws(
    () => assertRotiniUiLiveExecutionAllowed({
      PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "shadownet",
      PASTA_SHADOWNET_ROTINI_EXISTING_CONTRACT: CONTRACT,
    }),
    /fresh-origination only/,
  );
  assert.doesNotThrow(() => assertRotiniUiLiveExecutionAllowed({
    PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/proof",
    TEZOS_NETWORK: "shadownet",
  }));

  const source = await readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-rotini-ui-live.ts"), "utf8");
  assert.match(source, /classification: "UI-LIVE"/);
  assert.match(source, /loadSignerPair\(env\)/);
  assert.match(source, /allowedContractAddresses: new Set\(\[contractAddress\]\)/);
  assert.match(source, /new Set\(\["reserve_iteration", "finalize_iteration"\]\)/);
  assert.match(source, /validateRotiniOutputBytes\(output\.mode/);
  assert.match(source, /pastaprotocol-app-proof@1/);
  assert.match(source, /pastaprotocol-rotini-ui-live-run@1/);
  assert.match(source, /publicGatewayVerified/);
  assert.match(source, /reservePackCapacityRequirement: "price == 0"/);
  assert.match(source, /ravioliPackCompatible: projectId === 0/);
  assert.match(source, /scriptSha256: contractCodeArtifact\.sha256/);
  assert.match(source, /remainingReservable, 3/);
  assert.match(source, /createRotiniUiLiveCheckpoint\(\{/);
  assert.match(source, /beforeOperationSubmit: \(operation\) => checkpoint\.beforeOperationSubmit\("creator", operation\)/);
  assert.match(source, /beforeOperationSubmit: \(operation\) => checkpoint\.beforeOperationSubmit\("collector", operation\)/);
  assert.match(source, /assertOperationApplied: creatorAppliedOperations\.assertOperationApplied/);
  assert.match(source, /assertOperationApplied: collectorAppliedOperations\.assertOperationApplied/);
  assert.match(source, /creatorAppliedOperations\.bindReceipt\(receipt/);
  assert.match(source, /collectorAppliedOperations\.bindReceipt\(receipt/);
  assert.match(source, /beforePin: \(input\) => checkpoint\.beforePin\("creator", input\)/);
  assert.match(source, /beforePin: \(input\) => checkpoint\.beforePin\("collector", input\)/);
  assert.match(source, /checkpoint\.finalize\(checkpointCompletedAt\)/);
  assert.match(source, /readRotiniBrowserProjectionWithRetry\(\{/);
  assert.match(source, /readRotiniRavioliDependencyEvidenceWithRetry\(\{/);
  assert.match(source, /fallback: declareReadOnlyReader\(/);
  assert.match(source, /nextProjectId: creatorValidator\.createdModes\.length/);
  assert.match(source, /nextReservationId: collectorValidator\.reservedProjects\.length/);
  assert.match(source, /nextTokenId: collectorValidator\.reservedProjects\.length/);
  assert.doesNotMatch(source, /declareReadOnlyReader\([^)]*(?:pinIpfs|\.send\(|\.originate\()/s);
  assert.doesNotMatch(source, /UI-MOCK/);
  assert.doesNotMatch(source, /recordVideo|recordHar|tracing\.start|launchPersistentContext/);
  assert.doesNotMatch(source, /\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{20,}/);

  const fundingGate = source.indexOf("Rotini UI-live collector is underfunded before any pin or chain write");
  const firstOutputWrite = source.indexOf("await mkdir(path.join(appRoot");
  const firstPinCallback = source.indexOf("pinIpfsProofJson({ value, fileName, options: ipfs })");
  const checkpointFinalization = source.indexOf("checkpoint.finalize(checkpointCompletedAt)");
  const tzktProjection = source.indexOf("verifyTzktEvidence(", checkpointFinalization);
  const ravioliProjection = source.indexOf("readRotiniRavioliDependencyEvidenceWithRetry({", checkpointFinalization);
  assert.ok(fundingGate > 0 && firstOutputWrite > fundingGate, "output directory must be created only after both funding gates");
  assert.ok(firstPinCallback > firstOutputWrite, "live pin callbacks must be installed only after both funding gates");
  assert.ok(
    checkpointFinalization > firstPinCallback
      && tzktProjection > checkpointFinalization
      && ravioliProjection > checkpointFinalization,
    "durable checkpoint finalization must precede optional TzKT/RPC projections",
  );
});

test("deterministic proof layers and output validators reject format drift", () => {
  const first = buildRotiniProofLayerPng(180, 35, 52);
  const second = buildRotiniProofLayerPng(180, 35, 52);
  assert.deepEqual(first, second);
  validateRotiniOutputBytes("png", first);
  assert.throws(() => validateRotiniOutputBytes("gif", first), /GIF89a/);
  assert.throws(() => validateRotiniOutputBytes("zip", first));

  const project = {
    active: true,
    name: utf8ToHex("PNG"),
    symbol: utf8ToHex("ROTUI"),
    output_mode: utf8ToHex("png"),
    price: 0,
    max_supply: 4,
    minted: 0,
    reserved: 0,
  };
  assert.equal(project.output_mode, "706e67");
  assert.equal(project.price, 0);
  assert.equal(project.max_supply - project.minted - project.reserved, 4);
});

test("Rotini Ravioli handoff binds project-zero free capacity and exact script", () => {
  const evidence = buildRotiniRavioliDependencyEvidence({
    contractAddress: CONTRACT,
    administrator: CREATOR,
    projectId: 0,
    active: true,
    outputMode: "png",
    priceMutez: 0,
    maxSupply: 4,
    maxPerWallet: 4,
    reservationTtlSeconds: 3_600,
    minted: 1,
    reserved: 0,
    treasury: CREATOR,
    generatorUri: `ipfs://${rawCid(Buffer.from("generator"))}`,
    displayUri: `ipfs://${rawCid(Buffer.from("display"))}`,
    nextTokenId: 3,
    artifactSha256: "a".repeat(64),
    artifactCodeSha256: "b".repeat(64),
    onChainCodeSha256: "b".repeat(64),
  }) as any;
  assert.equal(evidence.project.projectId, 0);
  assert.equal(evidence.project.maxSupply, 4);
  assert.equal(evidence.baseline.minted, 1);
  assert.equal(evidence.baseline.reserved, 0);
  assert.equal(evidence.baseline.remainingReservable, 3);
  assert.deepEqual(evidence.baseline.existingTokenIds, [0, 1, 2]);
  assert.equal(evidence.generatedAtOpen.availableActions, 3);
  assert.equal(evidence.generatedAtOpen.requiresActionIndex, true);
  assert.equal(evidence.script.exactMatch, true);

  assert.throws(() => buildRotiniRavioliDependencyEvidence({
    contractAddress: CONTRACT,
    administrator: CREATOR,
    projectId: 0,
    active: true,
    outputMode: "png",
    priceMutez: 0,
    maxSupply: 4,
    maxPerWallet: 4,
    reservationTtlSeconds: 3_600,
    minted: 2,
    reserved: 0,
    treasury: CREATOR,
    generatorUri: `ipfs://${rawCid(Buffer.from("generator"))}`,
    displayUri: `ipfs://${rawCid(Buffer.from("display"))}`,
    nextTokenId: 3,
    artifactSha256: "a".repeat(64),
    artifactCodeSha256: "b".repeat(64),
    onChainCodeSha256: "b".repeat(64),
  }), /minted|three generated-at-open/i);
});
