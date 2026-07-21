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
  buildRotiniProofLayerPng,
  configureRotiniStudio,
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

type FakeState = {
  nextProjectId: number;
  nextReservationId: number;
  nextTokenId: number;
  projects: Record<string, FakeProject>;
  reservations: Record<string, FakeReservation>;
  latestReservation: Record<string, number>;
  calls: Array<{ signer: string; entrypoint: string; payload: unknown; sendOptions: unknown }>;
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
              return {
                hash,
                opHash: hash,
                async confirmation() {
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
          return {
            hash,
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
      },
    } as any;
  }

  return { state, creatorTezos: toolkit(CREATOR), collectorTezos: toolkit(COLLECTOR) };
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

async function waitForLog(page: Page, text: string, count = 1): Promise<void> {
  await page.waitForFunction(
    ({ expected, minimum }) => {
      const content = document.getElementById("log")?.textContent || "";
      return content.split(expected).length - 1 >= minimum;
    },
    { expected: text, minimum: count },
    { timeout: 30_000 },
  );
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
      await waitForLog(creatorPage, "generated 3 edition(s)");
      captures.push(await captureMock(creatorPage, creatorPageMonitor, outputRoot, 1, "generator configured", "generated 3 edition(s)", "#genStatus"));

      await creatorPage.click("#btnConnect");
      await waitForLog(creatorPage, `connected ${CREATOR} on shadownet`);
      for (const [index, mode] of ["png", "gif", "zip"].entries()) {
        await creatorPage.fill("#salePrice", index === 0 ? "0" : "0.000001");
        if (index > 0) {
          await creatorPage.selectOption("#outputMode", mode);
          await creatorPage.check('input[name="target"][value="existing_contract"]');
        }
        await creatorPage.click("#btnPublish");
        await waitForLog(creatorPage, "generative project published ✓", index + 1);
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
      assert.equal(numeric(chain.state.projects["0"]?.max_supply), 3);
      assert.equal(pinService.proofs.length, 13);
    } finally {
      creatorPageMonitor.dispose();
      await creatorContext.close();
      await creatorServer.close();
    }

    let collectorProjection = await readRotiniBrowserProjection(chain.collectorTezos, CONTRACT, COLLECTOR);
    const collectorSession = new TaquitoPastaUiLiveSession({
      tezos: chain.collectorTezos,
      signerAddress: COLLECTOR,
      expectedChainId: CHAIN_ID,
      allowedContractAddresses: new Set([CONTRACT]),
      allowedEntrypoints: new Set(["reserve_iteration", "finalize_iteration"]),
      assertExpectedChain: async () => CHAIN_ID,
      pinJson: pinService.pinJson,
      pinBlob: pinService.pinBlob,
      projectStorage: () => collectorProjection,
      onReceipt: async (receipt) => {
        if (receipt.operationHash) {
          collectorProjection = await readRotiniBrowserProjection(chain.collectorTezos, CONTRACT, COLLECTOR);
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
      assert.match(await page.locator("#mintInfo").innerText(), /\/ 3 · PNG/);
      assert.doesNotMatch(await page.locator("#mintInfo").innerText(), /\[object Object\]/);
      captures.push(await captureMock(page, monitor, outputRoot, 3, "collector loaded project", `connected ${COLLECTOR}`, "#mintInfo"));

      for (const [index, mode] of ["png", "gif", "zip"].entries()) {
        await page.fill("#mintProjectId", String(index));
        await page.click("#btnLoadProject");
        await waitForText(page, "#mintInfo", mode.toUpperCase());
        assert.doesNotMatch(await page.locator("#mintInfo").innerText(), /\[object Object\]/);
        await page.click("#btnMintIteration");
        await waitForLog(page, `collector finalized ${mode.toUpperCase()} token ${index}`);
        await waitForText(page, "#ppNotice", `${mode.toUpperCase()} iteration ${index} finalized`);
      }
      captures.push(await captureMock(page, monitor, outputRoot, 4, "three tokens finalized", "collector finalized ZIP token 2", "#mintInfo"));

      assert.equal(chain.state.nextTokenId, 3);
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
      assert.equal(numeric(chain.state.projects["0"].max_supply) - chain.state.projects["0"].minted - chain.state.projects["0"].reserved, 2);
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
  assert.doesNotMatch(source, /UI-MOCK/);
  assert.doesNotMatch(source, /recordVideo|recordHar|tracing\.start|launchPersistentContext/);
  assert.doesNotMatch(source, /\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{20,}/);

  const fundingGate = source.indexOf("Rotini UI-live collector is underfunded before any pin or chain write");
  const firstOutputWrite = source.indexOf("await mkdir(path.join(appRoot");
  const firstPinCallback = source.indexOf("pinIpfsProofJson({ value, fileName, options: ipfs })");
  assert.ok(fundingGate > 0 && firstOutputWrite > fundingGate, "output directory must be created only after both funding gates");
  assert.ok(firstPinCallback > firstOutputWrite, "live pin callbacks must be installed only after both funding gates");
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
    max_supply: 3,
    minted: 0,
    reserved: 0,
  };
  assert.equal(project.output_mode, "706e67");
  assert.equal(project.price, 0);
  assert.equal(project.max_supply - project.minted - project.reserved, 3);
});
