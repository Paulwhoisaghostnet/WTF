#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

import {
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveAppliedOperationAssertion,
  type PastaUiLivePreparedOperation,
  type PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
} from "./pasta-proof-screenshot-kit";
import {
  projectRavioliUiLiveStorage,
  RavioliUiStateMirror,
  type PackKit,
} from "./shadownet-ravioli-ui-live";
import {
  assertShadownet,
  buildToolkit,
  deterministicJsonBytes,
  loadSignerSet,
  normalizeBase,
  pollJson,
  probeRpcChainId,
  resolveIpfsProofConfig,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
} from "./shadownet-proof-kit";

const EXECUTE_FLAG = "PASTA_RAVIOLI_DEADLINE_REVEAL_EXECUTE";
const RUN_ROOT_ENV = "PASTA_RAVIOLI_DEADLINE_REVEAL_RUN_ROOT";
const ROUTER = "KT1L316ZdN8BEmDLcjNEtgXi8hMQ1Qz4aQkU";
const CONTROLLER = "KT1RCkFPpuUTQyLRP2Ux4KKPgTXwFhwnHVLn";
const GNOCCHI_ADAPTER = "KT1DjJbTatDAvB73TW4uo58XdrN3fxb45w6Y";
const TOKEN_ID = 1;
const STATIC_ROOT = path.join(root, "public");
const APP_PATH = "/creation-tools/ravioli/index.html";
const CONTROLLER_VIEWS = new Set([
  "get_pack_status",
  "get_claim_count",
  "get_last_claim",
  "get_claim_serial",
  "quote_refund",
  "get_refund_credit",
]);

type JsonObject = Record<string, any>;

export type RavioliDeadlineRevealRootOperationExpectation = Readonly<{
  operationHash: string;
  signerAddress: string;
  contractAddress: string;
  entrypoint: "set_pack_contents";
}>;

function isRavioliDeadlineRevealRootOperation(
  value: unknown,
  expected: RavioliDeadlineRevealRootOperationExpectation,
): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = value as JsonObject;
  return operation.hash === expected.operationHash
    && operation.status === "applied"
    && operation.sender?.address === expected.signerAddress
    && operation.target?.address === expected.contractAddress
    && operation.parameter?.entrypoint === expected.entrypoint;
}

export function selectRavioliDeadlineRevealRootOperation(
  rows: unknown,
  expected: RavioliDeadlineRevealRootOperationExpectation,
): JsonObject {
  assert.ok(Array.isArray(rows), "deadline reveal reconciliation rows must be an array");
  assert.match(expected.operationHash, /^o[1-9A-HJ-NP-Za-km-z]{50}$/);
  assert.ok(expected.signerAddress.length > 0, "deadline reveal signer is required");
  assert.ok(expected.contractAddress.length > 0, "deadline reveal contract is required");
  const matches = rows.filter((row) => isRavioliDeadlineRevealRootOperation(row, expected));
  assert.equal(
    matches.length,
    1,
    `deadline reveal reconciliation requires exactly one root operation; found ${matches.length}`,
  );
  return matches[0]!;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> {
  const bytes = deterministicJsonBytes(value);
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readJsonIfExists(filePath: string): Promise<JsonObject | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as JsonObject;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function rpcCounter(rpcUrl: string, address: string): Promise<number> {
  const response = await fetch(
    `${normalizeBase(rpcUrl)}/chains/main/blocks/head/context/contracts/${encodeURIComponent(address)}/counter`,
    { signal: AbortSignal.timeout(15_000) },
  );
  assert.equal(response.status, 200, `${rpcUrl} counter read failed`);
  const value = Number(await response.json());
  assert.ok(Number.isSafeInteger(value) && value >= 0, `${rpcUrl} counter is invalid`);
  return value;
}

async function hasPendingManagerOperation(rpcUrl: string, address: string): Promise<boolean> {
  const response = await fetch(
    `${normalizeBase(rpcUrl)}/chains/main/mempool/pending_operations`,
    { signal: AbortSignal.timeout(15_000) },
  );
  assert.equal(response.status, 200, `${rpcUrl} mempool read failed`);
  const value = await response.json() as JsonObject;
  const operations = [
    ...(Array.isArray(value.applied) ? value.applied : []),
    ...(Array.isArray(value.branch_delayed) ? value.branch_delayed : []),
    ...(Array.isArray(value.branch_refused) ? value.branch_refused : []),
    ...(Array.isArray(value.refused) ? value.refused : []),
    ...(Array.isArray(value.outdated) ? value.outdated : []),
    ...(Array.isArray(value.unprocessed) ? value.unprocessed : []),
  ];
  return operations.some((operation: JsonObject) =>
    (Array.isArray(operation?.contents) ? operation.contents : [])
      .some((content: JsonObject) => content?.source === address)
  );
}

async function restoreMirror(appRoot: string, creatorAddress: string, kit: PackKit): Promise<RavioliUiStateMirror> {
  const eventsRoot = path.join(appRoot, "artifacts", "journal", "events");
  const eventFiles = (await readdir(eventsRoot)).filter((name) => name.endsWith(".json")).sort();
  const events = await Promise.all(eventFiles.map(async (name) =>
    JSON.parse(await readFile(path.join(eventsRoot, name), "utf8")) as JsonObject
  ));
  const applied = new Set(events
    .filter((event) => event.phase === "APPLIED")
    .map((event) => `${event.actor}:${event.operationSequence}`));
  const mirror = new RavioliUiStateMirror();
  mirror.setAdministrator(creatorAddress);
  mirror.bindOrigination("blindController", CONTROLLER);
  mirror.bindOrigination("router", ROUTER);
  mirror.bindOrigination("gnocchiAdapter", GNOCCHI_ADAPTER);
  for (const event of events) {
    const operation = event.operation as JsonObject | undefined;
    if (
      event.phase !== "PREPARED"
      || !operation
      || !applied.has(`${event.actor}:${event.operationSequence}`)
      || operation.descriptor?.kind !== "call"
    ) {
      continue;
    }
    const call = operation.descriptor.call as JsonObject;
    mirror.applySuccessfulCall(
      String(call.contractAddress),
      String(call.entrypoint),
      call.payload,
      String(operation.signerAddress),
    );
  }
  const tokenZeroKit = JSON.parse(
    await readFile(path.join(appRoot, "artifacts", "open-kits", "ravioli-open-kit-0.json"), "utf8"),
  ) as PackKit;
  mirror.registerKit(tokenZeroKit);
  mirror.registerKit(kit);
  assert.equal(mirror.nextTokenId, 2, "deadline reveal mirror did not recover both issued packs");
  assert.equal(mirror.packs.get(TOKEN_ID)?.finalized, true, "deadline reveal pack is not finalized");
  assert.equal(mirror.packs.get(TOKEN_ID)?.contents_uri, null, "deadline reveal pack is already revealed");
  return mirror;
}

async function reconcileSubmittedReveal(input: {
  runRoot: string;
  appRoot: string;
  evidenceRoot: string;
  kitPath: string;
  kitBytes: Uint8Array;
  kit: PackKit;
  creator: string;
  tezos: ReturnType<typeof buildToolkit>;
  mirror: RavioliUiStateMirror;
  primaryCounter: number;
  submittedRecord: JsonObject;
}): Promise<void> {
  const submitted = input.submittedRecord.operation as JsonObject;
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(submitted.operationSequence, 19);
  assert.equal(submitted.signerAddress, input.creator);
  assert.equal(submitted.contractAddress, ROUTER);
  assert.deepEqual(submitted.entrypoints, ["set_pack_contents"]);
  assert.match(String(submitted.operationHash), /^o[1-9A-HJ-NP-Za-km-z]{50}$/);
  const expectedRoot = {
    operationHash: String(submitted.operationHash),
    signerAddress: input.creator,
    contractAddress: ROUTER,
    entrypoint: "set_pack_contents",
  } as const;
  const rows = await pollJson(
    "Ravioli deadline reveal reconciliation",
    `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions/${encodeURIComponent(String(submitted.operationHash))}`,
    (value) => Array.isArray(value) && value.some((operation) =>
      isRavioliDeadlineRevealRootOperation(operation, expectedRoot)
    ),
    { attempts: 10, delayMs: 2_000 },
  ) as JsonObject[];
  const operation = selectRavioliDeadlineRevealRootOperation(rows, expectedRoot);
  assert.equal(Number(operation.counter), input.primaryCounter);
  const expectedPayload = {
    token_id: TOKEN_ID,
    contents_uri: utf8ToHex(String(input.kit.sealedReveal!.contentsUri)),
    salt: input.kit.sealedReveal!.salt,
    offset: input.kit.sealedReveal!.offset,
  };
  const actualPayload = operation.parameter?.value as JsonObject;
  assert.equal(Number(actualPayload.token_id), expectedPayload.token_id);
  assert.equal(String(actualPayload.contents_uri), expectedPayload.contents_uri);
  assert.equal(String(actualPayload.salt), expectedPayload.salt);
  assert.equal(Number(actualPayload.offset), expectedPayload.offset);
  const appliedEvidence = {
    status: operation.status,
    operationHash: operation.hash,
    counter: Number(operation.counter),
    level: Number(operation.level),
    timestamp: operation.timestamp,
    signerAddress: input.creator,
    contractAddress: ROUTER,
    entrypoints: ["set_pack_contents"],
    explorerUrl: `https://shadownet.tzkt.io/${operation.hash}`,
  };
  if (!(await readJsonIfExists(path.join(input.evidenceRoot, "applied.json")))) {
    await writeExclusiveJson(path.join(input.evidenceRoot, "applied.json"), {
      schema: "pastaprotocol-ravioli-deadline-reveal-applied@1",
      evidence: appliedEvidence,
      reconciliation: {
        reason: "TzKT returned the root transaction plus the controller internal transaction",
        returnedOperationCount: rows.length,
        rootSelectedBy: "sender + target + entrypoint + hash",
      },
    });
  }
  input.mirror.applySuccessfulCall(ROUTER, "set_pack_contents", expectedPayload, input.creator);
  const session = new TaquitoPastaUiLiveSession({
    tezos: input.tezos,
    signerAddress: input.creator,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([ROUTER, CONTROLLER]),
    allowedEntrypoints: new Set(),
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async (stage) => {
      await assertShadownet(input.tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: async () => { throw new Error("deadline reveal reconciliation cannot pin"); },
    pinBlob: async () => { throw new Error("deadline reveal reconciliation cannot pin"); },
    validateOrigination: () => { throw new Error("deadline reveal reconciliation cannot originate"); },
    validateCall: () => { throw new Error("deadline reveal reconciliation cannot submit calls"); },
    projectStorage: (storage) => projectRavioliUiLiveStorage(storage, input.mirror),
  });
  session.authorizeContractViews({
    contractAddress: CONTROLLER,
    viewNames: CONTROLLER_VIEWS,
    allowSessionSigner: true,
    allowedCallerContractAddresses: new Set([ROUTER]),
  });
  const bridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: (request) => session.handle(request),
  });
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
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
  try {
    await page.goto(`${bridge.origin}${APP_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(page, bridge, "UI-LIVE-DEADLINE-RECONCILIATION");
    await page.selectOption("#network", "shadownet");
    await page.click("#btnConnect");
    await page.waitForFunction(
      (address) => document.getElementById("log")?.textContent?.includes(`connected ${address} on shadownet`),
      input.creator,
      { timeout: 30_000 },
    );
    await page.fill("#opKt", ROUTER);
    await page.fill("#opTokenId", String(TOKEN_ID));
    await page.fill("#openKit", JSON.stringify(input.kit, null, 2));
    await page.click("#btnLoadBundle");
    await page.waitForFunction(
      () => document.getElementById("opInfo")?.textContent?.includes("blind_funded_pool"),
      undefined,
      { timeout: 30_000 },
    );
    await page.click("#btnReveal");
    await page.waitForFunction(
      () => document.getElementById("ppNotice")?.textContent?.includes("already permanently published"),
      undefined,
      { timeout: 30_000 },
    );
    assert.equal(session.getReceipts().filter((receipt) => receipt.operationHash).length, 0);
    const screenshot = await capturePastaProofStage({
      page,
      monitor,
      outputRoot: input.runRoot,
      app: "ravioli",
      capability: "deadline-first blind public reveal",
      stageOrdinal: 12,
      stageName: "issued blind funded pool reveal rediscovered from chain",
      classification: "UI-LIVE",
      requiredEvidence: [
        { selector: "h1", expectedText: "Ravioli" },
        { selector: "#opInfo", expectedText: "blind_funded_pool" },
        { selector: "#ppNotice", expectedText: "already permanently published" },
      ],
      waitForLoadState: "none",
      timeoutMs: 30_000,
    });
    const receipt = {
      schema: "pastaprotocol-ravioli-deadline-first-reveal-proof@1",
      status: "PASSED",
      classification: "UI-LIVE-DEADLINE-FIRST-RECONCILED",
      completedAt: new Date().toISOString(),
      network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
      creator: input.creator,
      router: ROUTER,
      tokenId: TOKEN_ID,
      kit: { path: path.relative(input.appRoot, input.kitPath), sha256: sha256(input.kitBytes) },
      immutablePolicy: {
        saleEnd: input.kit.editionPolicy.wrapperSaleEnd,
        revealDeadline: input.kit.editionPolicy.revealDeadline,
        openDeadline: input.kit.editionPolicy.openDeadline,
      },
      operation: appliedEvidence,
      screenshot,
      readOnlyUiVerification: {
        statement: "A fresh Studio loaded the pack from chain and rejected a second reveal because contents were already permanently published.",
        signerOperations: 0,
      },
      integrationNote:
        "This UI-driven reveal was deliberately executed ahead of the frozen journal order to preserve an already-issued product before its immutable deadline; package assembly must bind this sidecar operation instead of replaying it.",
    };
    await writeExclusiveJson(path.join(input.evidenceRoot, "receipt.json"), receipt);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    monitor.dispose();
    await browser.close();
    await bridge.close();
  }
}

async function main(): Promise<void> {
  assert.equal(process.env.PASTA_SHADOWNET_E2E_EXECUTE, "1", "live Shadownet execution is disabled");
  assert.equal(process.env[EXECUTE_FLAG], "1", `${EXECUTE_FLAG}=1 is required`);
  const runRoot = path.resolve(process.env[RUN_ROOT_ENV] || "");
  assert.ok(runRoot && path.basename(runRoot) === "pasta-alpha-proof-20260724t015728z", "deadline reveal run root is invalid");
  const appRoot = path.join(runRoot, "ravioli");
  const kitPath = path.join(appRoot, "artifacts", "open-kits", "ravioli-open-kit-1.json");
  const kitBytes = await readFile(kitPath);
  const kit = JSON.parse(kitBytes.toString("utf8")) as PackKit;
  assert.equal(kit.schema, "pasta-ravioli-open-kit@3");
  assert.equal(kit.network, "shadownet");
  assert.equal(kit.contract, ROUTER);
  assert.equal(kit.tokenId, TOKEN_ID);
  assert.equal(kit.mode, "blind_funded_pool");
  assert.ok(kit.sealedReveal);
  assert.ok(Date.now() > Date.parse(String(kit.editionPolicy.wrapperSaleEnd)), "wrapper sale has not ended");
  assert.ok(Date.now() < Date.parse(String(kit.editionPolicy.revealDeadline)), "reveal deadline has passed");

  const evidenceRoot = path.join(appRoot, "artifacts", "deadline-preservation");
  let submittedRecord: JsonObject | null = null;
  try {
    await mkdir(evidenceRoot, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    submittedRecord = await readJsonIfExists(path.join(evidenceRoot, "submitted.json"));
    if (!submittedRecord) {
      assert.deepEqual(
        await readdir(evidenceRoot),
        [],
        "deadline reveal evidence directory contains an incomplete pre-submission attempt",
      );
    }
  }
  const startedAt = new Date().toISOString();
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const signerConfiguration = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-ravioli-deadline-reveal.sock",
    authToken: "local-pasta-shadownet-ravioli-deadline-reveal",
    auditLog: "/tmp/wtf-pasta-shadownet-ravioli-deadline-reveal-audit.log",
  });
  const signerSet = await loadSignerSet(signerConfiguration);
  const creator = signerSet.creator.address;
  const tezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "Ravioli deadline reveal");
  const [primaryCounter, fallbackCounter, primaryPending, fallbackPending] = await Promise.all([
    rpcCounter(SHADOWNET_RPC_PRIMARY, creator),
    rpcCounter(SHADOWNET_RPC_FALLBACK, creator),
    hasPendingManagerOperation(SHADOWNET_RPC_PRIMARY, creator),
    hasPendingManagerOperation(SHADOWNET_RPC_FALLBACK, creator),
  ]);
  assert.equal(primaryCounter, fallbackCounter, "dual-RPC creator counter drift");
  assert.equal(primaryPending, false, "primary RPC has a pending creator operation");
  assert.equal(fallbackPending, false, "fallback RPC has a pending creator operation");
  const balanceMutez = Number((await tezos.tz.getBalance(creator)).toString());
  assert.ok(balanceMutez >= 1_000_000, "creator has insufficient reveal reserve");

  const mirror = await restoreMirror(appRoot, creator, kit);
  if (submittedRecord) {
    await reconcileSubmittedReveal({
      runRoot,
      appRoot,
      evidenceRoot,
      kitPath,
      kitBytes,
      kit,
      creator,
      tezos,
      mirror,
      primaryCounter,
      submittedRecord,
    });
    return;
  }
  const expectedUri = String(kit.sealedReveal!.contentsUri);
  const expectedPayload = {
    token_id: TOKEN_ID,
    contents_uri: utf8ToHex(expectedUri),
    salt: kit.sealedReveal!.salt,
    offset: kit.sealedReveal!.offset,
  };
  let prepared: PastaUiLivePreparedOperation | null = null;
  let submitted: PastaUiLiveSubmittedOperation | null = null;
  let appliedEvidence: JsonObject | null = null;
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: creator,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([ROUTER, CONTROLLER]),
    allowedEntrypoints: new Set(["set_pack_contents"]),
    initialOperationSequence: 18,
    initialReceiptSequence: 21,
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async (stage) => {
      await assertShadownet(tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: async () => { throw new Error("deadline reveal must not create a new pin"); },
    pinBlob: async () => { throw new Error("deadline reveal must not create a new pin"); },
    validateOrigination: () => { throw new Error("deadline reveal origination is forbidden"); },
    validateCall: ({ contractAddress, entrypoint, payload }) => {
      assert.equal(contractAddress, ROUTER);
      assert.equal(entrypoint, "set_pack_contents");
      assert.ok(payload && typeof payload === "object" && !Array.isArray(payload));
      const actualPayload = payload as JsonObject;
      assert.deepEqual(Object.keys(actualPayload).sort(), Object.keys(expectedPayload).sort());
      assert.equal(Number(actualPayload.token_id), expectedPayload.token_id);
      assert.equal(String(actualPayload.contents_uri), expectedPayload.contents_uri);
      assert.equal(String(actualPayload.salt), expectedPayload.salt);
      assert.equal(Number(actualPayload.offset), expectedPayload.offset);
      assert.ok(Date.now() < Date.parse(String(kit.editionPolicy.revealDeadline)), "reveal deadline passed before submission");
    },
    projectStorage: (storage) => projectRavioliUiLiveStorage(storage, mirror),
    beforeOperationSubmit: async (operation) => {
      assert.equal(prepared, null, "deadline reveal prepared more than one operation");
      assert.equal(operation.operationSequence, 19);
      assert.equal(operation.signerAddress, creator);
      prepared = operation;
      await writeExclusiveJson(path.join(evidenceRoot, "prepared.json"), {
        schema: "pastaprotocol-ravioli-deadline-reveal-prepared@1",
        purpose: "deadline-first UI continuation outside the frozen semantic journal order",
        runId: path.basename(runRoot),
        router: ROUTER,
        tokenId: TOKEN_ID,
        kitSha256: sha256(kitBytes),
        creator,
        creatorCounterBefore: primaryCounter,
        revealDeadline: kit.editionPolicy.revealDeadline,
        operation,
      });
    },
    onOperationSubmitted: async (operation) => {
      assert.ok(prepared, "deadline reveal was submitted without a prepared record");
      submitted = operation;
      await writeExclusiveJson(path.join(evidenceRoot, "submitted.json"), {
        schema: "pastaprotocol-ravioli-deadline-reveal-submitted@1",
        operation,
      });
    },
    assertOperationApplied: async (assertion: PastaUiLiveAppliedOperationAssertion) => {
      assert.ok(submitted, "deadline reveal application check lacks a submitted record");
      assert.equal(assertion.action, "call");
      assert.equal(assertion.contractAddress, ROUTER);
      assert.deepEqual(assertion.entrypoints, ["set_pack_contents"]);
      const expectedRoot = {
        operationHash: assertion.operationHash,
        signerAddress: creator,
        contractAddress: ROUTER,
        entrypoint: "set_pack_contents",
      } as const;
      const rows = await pollJson(
        "Ravioli deadline reveal TzKT operation",
        `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions/${encodeURIComponent(assertion.operationHash)}`,
        (value) => Array.isArray(value) && value.some((operation) =>
          isRavioliDeadlineRevealRootOperation(operation, expectedRoot)
        ),
        { attempts: 40, delayMs: 2_000 },
      ) as JsonObject[];
      const operation = selectRavioliDeadlineRevealRootOperation(rows, expectedRoot);
      assert.equal(operation.sender?.address, creator);
      assert.equal(operation.target?.address, ROUTER);
      assert.equal(operation.parameter?.entrypoint, "set_pack_contents");
      assert.equal(Number(operation.counter), primaryCounter + 1);
      appliedEvidence = {
        status: operation.status,
        operationHash: operation.hash,
        counter: Number(operation.counter),
        level: Number(operation.level),
        timestamp: operation.timestamp,
        signerAddress: creator,
        contractAddress: ROUTER,
        entrypoints: ["set_pack_contents"],
        explorerUrl: `https://shadownet.tzkt.io/${operation.hash}`,
      };
      await writeExclusiveJson(path.join(evidenceRoot, "applied.json"), {
        schema: "pastaprotocol-ravioli-deadline-reveal-applied@1",
        evidence: appliedEvidence,
      });
    },
  });
  session.authorizeContractViews({
    contractAddress: CONTROLLER,
    viewNames: CONTROLLER_VIEWS,
    allowSessionSigner: true,
    allowedCallerContractAddresses: new Set([ROUTER]),
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez,
    requiredBalanceMutez: 1_000_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 1_000_000,
  });
  const bridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: async (request) => {
      const response = await session.handle(request);
      if (request.action === "call") {
        mirror.applySuccessfulCall(ROUTER, "set_pack_contents", expectedPayload, creator);
      }
      return response;
    },
  });
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  try {
    await page.goto(`${bridge.origin}${APP_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(page, bridge, "UI-LIVE-DEADLINE-FIRST");
    await page.selectOption("#network", "shadownet");
    await page.selectOption("#pinProvider", "node");
    await page.fill("#pinNode", resolveIpfsProofConfig().apiUrl);
    assert.deepEqual(
      await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes("publish-recovery"))),
      [],
      "deadline reveal browser did not start with a clean recovery namespace",
    );
    await page.click("#btnConnect");
    await page.waitForFunction(
      (address) => document.getElementById("log")?.textContent?.includes(`connected ${address} on shadownet`),
      creator,
      { timeout: 30_000 },
    );
    await page.fill("#opKt", ROUTER);
    await page.fill("#opTokenId", String(TOKEN_ID));
    await page.fill("#openKit", JSON.stringify(kit, null, 2));
    await page.click("#btnReveal");
    const revealOutcome = await page.waitForFunction(() => {
      const notice = document.getElementById("ppNotice")?.textContent?.trim() || "";
      const log = document.getElementById("log")?.textContent?.trim() || "";
      if (notice.includes("Reveal key published")) return { ok: true, notice, log };
      if (
        notice.includes("Reveal failed")
        || (!document.getElementById("btnReveal")?.hasAttribute("disabled") && notice)
      ) {
        return { ok: false, notice, log };
      }
      return null;
    }, undefined, { timeout: 90_000 }).then((handle) => handle.jsonValue() as Promise<{
      ok: boolean;
      notice: string;
      log: string;
    }>);
    assert.equal(
      revealOutcome.ok,
      true,
      `Studio reveal failed before submission: notice=${JSON.stringify(revealOutcome.notice)} log=${JSON.stringify(revealOutcome.log.slice(-2_000))}`,
    );
    assert.equal(await page.inputValue("#revealUri"), expectedUri);
    assert.ok(prepared && submitted && appliedEvidence, "deadline reveal did not complete its evidence checkpoints");
    const screenshot = await capturePastaProofStage({
      page,
      monitor,
      outputRoot: runRoot,
      app: "ravioli",
      capability: "deadline-first blind public reveal",
      stageOrdinal: 12,
      stageName: "issued blind funded pool revealed before immutable deadline",
      classification: "UI-LIVE",
      requiredEvidence: [
        { selector: "h1", expectedText: "Ravioli" },
        { selector: "#ppNotice", expectedText: "Reveal key published" },
        { selector: "#opInfo", expectedText: "blind_funded_pool" },
      ],
      waitForLoadState: "none",
      timeoutMs: 30_000,
    });
    const receipt = {
      schema: "pastaprotocol-ravioli-deadline-first-reveal-proof@1",
      status: "PASSED",
      classification: "UI-LIVE-DEADLINE-FIRST",
      startedAt,
      completedAt: new Date().toISOString(),
      network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
      creator,
      router: ROUTER,
      tokenId: TOKEN_ID,
      kit: { path: path.relative(appRoot, kitPath), sha256: sha256(kitBytes) },
      immutablePolicy: {
        saleEnd: kit.editionPolicy.wrapperSaleEnd,
        revealDeadline: kit.editionPolicy.revealDeadline,
        openDeadline: kit.editionPolicy.openDeadline,
      },
      operation: appliedEvidence,
      screenshot,
      receipts: session.getReceipts(),
      viewReceipts: session.getViewReceipts(),
      integrationNote:
        "This UI-driven reveal was deliberately executed ahead of the original frozen journal order to preserve an already-issued product before its immutable deadline; package assembly must bind this sidecar operation instead of replaying it.",
    };
    await writeExclusiveJson(path.join(evidenceRoot, "receipt.json"), receipt);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    monitor.dispose();
    await browser.close();
    await bridge.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(async (error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
