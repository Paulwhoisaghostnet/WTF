#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, type Page } from "playwright";

import {
  decodePastaUiLiveValue,
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
  type CapturePastaProofStageResult,
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
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
} from "./shadownet-proof-kit";

const EXECUTE_FLAG = "PASTA_RAVIOLI_DEADLINE_SETTLEMENT_EXECUTE";
const RUN_ROOT_ENV = "PASTA_RAVIOLI_DEADLINE_SETTLEMENT_RUN_ROOT";
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
type Actor = "collector1" | "collector2";
type Stage = {
  id: string;
  actor: Actor;
  operationSequence: number;
  entrypoint: "open_pack" | "transfer";
};

export type RavioliSettlementDeadlinePreflight = Readonly<{
  status: "OPEN" | "EXPIRED";
  checkedAt: string;
  openDeadline: string;
  remainingMs: number;
}>;

const PLAN: readonly Stage[] = Object.freeze([
  {
    id: "01-collector2-open-transferred-claim",
    actor: "collector2",
    operationSequence: 2,
    entrypoint: "open_pack",
  },
  {
    id: "02-collector2-transfer-remaining-claim",
    actor: "collector2",
    operationSequence: 3,
    entrypoint: "transfer",
  },
  {
    id: "03-collector1-open-returned-claim",
    actor: "collector1",
    operationSequence: 3,
    entrypoint: "open_pack",
  },
]);

export function evaluateRavioliSettlementDeadline(
  openDeadline: unknown,
  nowMs = Date.now(),
): RavioliSettlementDeadlinePreflight {
  assert.ok(Number.isFinite(nowMs), "Ravioli settlement clock is invalid");
  const deadline = String(openDeadline || "");
  const deadlineMs = Date.parse(deadline);
  assert.ok(Number.isFinite(deadlineMs), "Ravioli open deadline is invalid");
  return Object.freeze({
    status: nowMs < deadlineMs ? "OPEN" : "EXPIRED",
    checkedAt: new Date(nowMs).toISOString(),
    openDeadline: new Date(deadlineMs).toISOString(),
    remainingMs: deadlineMs - nowMs,
  });
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(deterministicJsonBytes(value));
    await handle.sync();
  } finally {
    await handle.close();
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
  return [
    ...(Array.isArray(value.applied) ? value.applied : []),
    ...(Array.isArray(value.branch_delayed) ? value.branch_delayed : []),
    ...(Array.isArray(value.branch_refused) ? value.branch_refused : []),
    ...(Array.isArray(value.refused) ? value.refused : []),
    ...(Array.isArray(value.outdated) ? value.outdated : []),
    ...(Array.isArray(value.unprocessed) ? value.unprocessed : []),
  ].some((operation: JsonObject) =>
    (Array.isArray(operation?.contents) ? operation.contents : [])
      .some((content: JsonObject) => content?.source === address)
  );
}

async function assertCleanActorBoundary(address: string): Promise<number> {
  const [primary, fallback, primaryPending, fallbackPending] = await Promise.all([
    rpcCounter(SHADOWNET_RPC_PRIMARY, address),
    rpcCounter(SHADOWNET_RPC_FALLBACK, address),
    hasPendingManagerOperation(SHADOWNET_RPC_PRIMARY, address),
    hasPendingManagerOperation(SHADOWNET_RPC_FALLBACK, address),
  ]);
  assert.equal(primary, fallback, `${address} dual-RPC counter drift`);
  assert.equal(primaryPending, false, `${address} has a pending operation on primary RPC`);
  assert.equal(fallbackPending, false, `${address} has a pending operation on fallback RPC`);
  return primary;
}

async function restoreMirror(
  appRoot: string,
  creator: string,
  kit: PackKit,
  revealPayload: JsonObject,
): Promise<RavioliUiStateMirror> {
  const eventsRoot = path.join(appRoot, "artifacts", "journal", "events");
  const names = (await readdir(eventsRoot)).filter((name) => name.endsWith(".json")).sort();
  const events = await Promise.all(names.map(async (name) =>
    JSON.parse(await readFile(path.join(eventsRoot, name), "utf8")) as JsonObject
  ));
  const applied = new Set(events
    .filter((event) => event.phase === "APPLIED")
    .map((event) => `${event.actor}:${event.operationSequence}`));
  const mirror = new RavioliUiStateMirror();
  mirror.setAdministrator(creator);
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
    ) continue;
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
  mirror.applySuccessfulCall(ROUTER, "set_pack_contents", revealPayload, creator);
  return mirror;
}

function validateSettlementCall(input: {
  stage: Stage;
  payload: unknown;
  signer: string;
  recipient: string;
  kit: PackKit;
  mirror: RavioliUiStateMirror;
}): void {
  assert.ok(input.payload && typeof input.payload === "object");
  if (input.stage.entrypoint === "transfer") {
    assert.ok(Array.isArray(input.payload) && input.payload.length === 1);
    const source = input.payload[0] as JsonObject;
    assert.equal(String(source.from_), input.signer);
    assert.ok(Array.isArray(source.txs) && source.txs.length === 1);
    const tx = source.txs[0] as JsonObject;
    assert.equal(String(tx.to_), input.recipient);
    assert.equal(Number(tx.token_id), TOKEN_ID);
    assert.equal(Number(tx.amount), 1);
    assert.ok((input.mirror.ledger.get(`${input.signer}:${TOKEN_ID}`) || 0) >= 1);
    return;
  }
  const value = input.payload as JsonObject;
  assert.equal(Number(value.token_id), TOKEN_ID);
  const claimId = Number(value.expected_claim_id);
  assert.ok(Number.isSafeInteger(claimId) && claimId >= 0);
  const serial = (claimId + Number(input.kit.sealedReveal!.offset)) % input.kit.recipes.length;
  const recipe = input.kit.recipes[serial]!;
  assert.equal(String(value.nonce), recipe.nonce);
  assert.ok(Array.isArray(value.actions) && value.actions.length === 1);
  const actual = value.actions[0]?.escrow as JsonObject;
  const expected = recipe.actions[0] as JsonObject;
  assert.equal(expected.kind, "escrow");
  assert.equal(String(actual.fa2), String(expected.fa2));
  assert.equal(Number(actual.token_id), Number(expected.tokenId));
  assert.equal(Number(actual.amount), Number(expected.amount));
  assert.ok((input.mirror.ledger.get(`${input.signer}:${TOKEN_ID}`) || 0) >= 1);
}

async function openStudio(input: {
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
  account: string;
  kit: PackKit;
}): Promise<{
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  page: Page;
  monitor: ReturnType<typeof monitorPastaProofPage>;
}> {
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
  await page.goto(`${input.bridge.origin}${APP_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
  await installPastaUiLiveBrowserProxy(page, input.bridge, "UI-LIVE-DEADLINE-SETTLEMENT");
  await page.selectOption("#network", "shadownet");
  await page.click("#btnConnect");
  await page.waitForFunction(
    (address) => document.getElementById("log")?.textContent?.includes(`connected ${address} on shadownet`),
    input.account,
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
  return { browser, page, monitor };
}

async function waitForNotice(page: Page, success: string, buttonId: string): Promise<void> {
  const outcome = await page.waitForFunction(({ successText, id }) => {
    const notice = document.getElementById("ppNotice")?.textContent?.trim() || "";
    const log = document.getElementById("log")?.textContent?.trim() || "";
    if (notice.includes(successText)) return { ok: true, notice, log };
    if (
      notice.includes("failed")
      || (!document.getElementById(id)?.hasAttribute("disabled") && notice)
    ) return { ok: false, notice, log };
    return null;
  }, { successText: success, id: buttonId }, { timeout: 180_000 })
    .then((handle) => handle.jsonValue() as Promise<{ ok: boolean; notice: string; log: string }>);
  assert.equal(
    outcome.ok,
    true,
    `Ravioli deadline settlement failed: notice=${JSON.stringify(outcome.notice)} log=${JSON.stringify(outcome.log.slice(-2_000))}`,
  );
}

async function main(): Promise<void> {
  assert.equal(process.env.PASTA_SHADOWNET_E2E_EXECUTE, "1", "live Shadownet execution is disabled");
  assert.equal(process.env[EXECUTE_FLAG], "1", `${EXECUTE_FLAG}=1 is required`);
  const runRoot = path.resolve(process.env[RUN_ROOT_ENV] || "");
  assert.equal(path.basename(runRoot), "pasta-alpha-proof-20260724t015728z");
  const appRoot = path.join(runRoot, "ravioli");
  const evidenceRoot = path.join(appRoot, "artifacts", "deadline-settlement");
  await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
  const kitPath = path.join(appRoot, "artifacts", "open-kits", "ravioli-open-kit-1.json");
  const kitBytes = await readFile(kitPath);
  const kit = JSON.parse(kitBytes.toString("utf8")) as PackKit;
  assert.equal(kit.contract, ROUTER);
  assert.equal(kit.tokenId, TOKEN_ID);
  const deadlinePreflight = evaluateRavioliSettlementDeadline(kit.editionPolicy.openDeadline);
  if (deadlinePreflight.status === "EXPIRED") {
    const blockedPath = path.join(evidenceRoot, "blocked-before-write.json");
    const existing = (await readdir(evidenceRoot)).includes(path.basename(blockedPath))
      ? JSON.parse(await readFile(blockedPath, "utf8")) as JsonObject
      : null;
    const blocked = existing || {
      schema: "pastaprotocol-ravioli-deadline-settlement-blocked@1",
      status: "BLOCKED_BEFORE_WRITE",
      classification: "UI-LIVE-IMMUTABLE-DEADLINE-EXPIRED",
      recordedAt: deadlinePreflight.checkedAt,
      runId: path.basename(runRoot),
      network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
      router: ROUTER,
      controller: CONTROLLER,
      tokenId: TOKEN_ID,
      kit: {
        path: path.relative(appRoot, kitPath),
        sha256: sha256(kitBytes),
      },
      deadlinePreflight,
      mutationBoundary: {
        signerConfigurationLoaded: false,
        actorCountersRead: false,
        browserBridgeStarted: false,
        holderOperationsPrepared: 0,
        holderOperationsSubmitted: 0,
        holderOperationsApplied: 0,
      },
      conclusion:
        "The immutable open deadline had passed, so the guarded settlement lane stopped before loading signers, reading actor counters, starting a browser bridge, or preparing any holder operation.",
      correction:
        "Prove blind-pack opening and delivery with a fresh product whose immutable window budgets the complete publish, recovery, reveal, transfer, and opening workflow.",
    };
    if (!existing) await writeExclusiveJson(blockedPath, blocked);
    process.stdout.write(`${JSON.stringify(blocked, null, 2)}\n`);
    throw new Error(
      `Ravioli settlement refused before write: open deadline ${deadlinePreflight.openDeadline} expired at ${deadlinePreflight.checkedAt}`,
    );
  }
  const revealSubmitted = JSON.parse(
    await readFile(path.join(appRoot, "artifacts", "deadline-preservation", "submitted.json"), "utf8"),
  ) as JsonObject;
  const revealApplied = JSON.parse(
    await readFile(path.join(appRoot, "artifacts", "deadline-preservation", "applied.json"), "utf8"),
  ) as JsonObject;
  const revealPayload = revealSubmitted.operation.descriptor.call.payload as JsonObject;
  assert.equal(revealApplied.evidence.status, "applied");

  const rpc = await probeRpcChainId();
  const signerConfiguration = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-ravioli-deadline-settlement.sock",
    authToken: "local-pasta-shadownet-ravioli-deadline-settlement",
    auditLog: "/tmp/wtf-pasta-shadownet-ravioli-deadline-settlement-audit.log",
  });
  const signerSet = await loadSignerSet(signerConfiguration);
  const collector1 = signerSet.collector.address;
  const collector2 = signerSet.collectorTwo.address;
  const creator = signerSet.creator.address;
  const collectorOneTezos = buildToolkit(signerSet.collectorSigner, rpc.rpcUrl);
  const collectorTwoTezos = buildToolkit(signerSet.collectorTwoSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(collectorOneTezos, "Ravioli collector one settlement"),
    assertShadownet(collectorTwoTezos, "Ravioli collector two settlement"),
  ]);
  const [collectorOneCounter, collectorTwoCounter] = await Promise.all([
    assertCleanActorBoundary(collector1),
    assertCleanActorBoundary(collector2),
  ]);
  assert.equal(collectorOneCounter, 23833848);
  assert.equal(collectorTwoCounter, 25689639);
  const [collectorOneBalance, collectorTwoBalance] = await Promise.all([
    collectorOneTezos.tz.getBalance(collector1).then((value) => Number(value.toString())),
    collectorTwoTezos.tz.getBalance(collector2).then((value) => Number(value.toString())),
  ]);
  assert.ok(collectorOneBalance >= 2_000_000);
  assert.ok(collectorTwoBalance >= 2_000_000);
  const mirror = await restoreMirror(appRoot, creator, kit, revealPayload);
  assert.equal(mirror.ledger.get(`${collector1}:${TOKEN_ID}`) || 0, 0);
  assert.equal(mirror.ledger.get(`${collector2}:${TOKEN_ID}`), 2);
  await writeExclusiveJson(path.join(evidenceRoot, "intent.json"), {
    schema: "pastaprotocol-ravioli-deadline-settlement-intent@1",
    status: "IMMUTABLE",
    createdAt: new Date().toISOString(),
    runId: path.basename(runRoot),
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
    router: ROUTER,
    controller: CONTROLLER,
    tokenId: TOKEN_ID,
    kitSha256: sha256(kitBytes),
    openDeadline: kit.editionPolicy.openDeadline,
    actors: {
      collector1: { address: collector1, counter: collectorOneCounter },
      collector2: { address: collector2, counter: collectorTwoCounter },
    },
    plan: PLAN,
  });

  const applied: JsonObject[] = [];
  const makeSession = (
    actor: Actor,
    tezos: ReturnType<typeof buildToolkit>,
    signer: string,
    initialOperationSequence: number,
    balanceMutez: number,
  ) => {
    const stages = PLAN.filter((stage) => stage.actor === actor);
    let stageIndex = 0;
    let pending: { stage: Stage; expectedCounter: number; submitted?: PastaUiLiveSubmittedOperation } | null = null;
    const session = new TaquitoPastaUiLiveSession({
      tezos,
      signerAddress: signer,
      expectedChainId: SHADOWNET_CHAIN_ID,
      allowedContractAddresses: new Set([ROUTER, CONTROLLER]),
      allowedEntrypoints: new Set(["open_pack", "transfer"]),
      initialOperationSequence,
      minimumActionBalanceMutez: 50_000,
      assertExpectedChain: async (stage) => {
        await assertShadownet(tezos, stage);
        return SHADOWNET_CHAIN_ID;
      },
      pinJson: async () => { throw new Error("mode-1 settlement cannot pin"); },
      pinBlob: async () => { throw new Error("mode-1 settlement cannot pin"); },
      validateOrigination: () => { throw new Error("mode-1 settlement cannot originate"); },
      validateCall: ({ contractAddress, entrypoint, payload }) => {
        const stage = stages[stageIndex];
        assert.ok(stage, `${actor} has no remaining settlement stage`);
        assert.equal(contractAddress, ROUTER);
        assert.equal(entrypoint, stage.entrypoint);
        assert.ok(Date.now() < Date.parse(String(kit.editionPolicy.openDeadline)));
        validateSettlementCall({ stage, payload, signer, recipient: collector1, kit, mirror });
      },
      projectStorage: (storage) => projectRavioliUiLiveStorage(storage, mirror),
      beforeOperationSubmit: async (operation: PastaUiLivePreparedOperation) => {
        const stage = stages[stageIndex];
        assert.ok(stage && !pending);
        assert.equal(operation.operationSequence, stage.operationSequence);
        assert.equal(operation.entrypoints[0], stage.entrypoint);
        const counter = await assertCleanActorBoundary(signer);
        pending = { stage, expectedCounter: counter + 1 };
        await writeExclusiveJson(path.join(evidenceRoot, `${stage.id}-prepared.json`), {
          schema: "pastaprotocol-ravioli-deadline-settlement-prepared@1",
          stage,
          expectedCounter: counter + 1,
          operation,
        });
      },
      onOperationSubmitted: async (operation: PastaUiLiveSubmittedOperation) => {
        assert.ok(pending && pending.stage.operationSequence === operation.operationSequence);
        pending.submitted = operation;
        await writeExclusiveJson(path.join(evidenceRoot, `${pending.stage.id}-submitted.json`), {
          schema: "pastaprotocol-ravioli-deadline-settlement-submitted@1",
          stage: pending.stage,
          operation,
        });
      },
      assertOperationApplied: async (assertion: PastaUiLiveAppliedOperationAssertion) => {
        assert.ok(pending?.submitted);
        const rows = await pollJson(
          `Ravioli ${pending.stage.id}`,
          `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions/${encodeURIComponent(assertion.operationHash)}`,
          (value) => Array.isArray(value) && value.some((operation) =>
            operation?.status === "applied"
            && operation?.sender?.address === signer
            && operation?.target?.address === ROUTER
            && operation?.parameter?.entrypoint === pending!.stage.entrypoint
          ),
          { attempts: 40, delayMs: 2_000 },
        ) as JsonObject[];
        const operation = rows.find((candidate) =>
          candidate?.sender?.address === signer
          && candidate?.target?.address === ROUTER
          && candidate?.parameter?.entrypoint === pending!.stage.entrypoint
        );
        assert.ok(operation);
        assert.equal(Number(operation.counter), pending.expectedCounter);
        const evidence = {
          stage: pending.stage,
          status: operation.status,
          operationHash: operation.hash,
          counter: Number(operation.counter),
          level: Number(operation.level),
          timestamp: operation.timestamp,
          signerAddress: signer,
          contractAddress: ROUTER,
          entrypoints: [pending.stage.entrypoint],
          explorerUrl: `https://shadownet.tzkt.io/${operation.hash}`,
        };
        await writeExclusiveJson(path.join(evidenceRoot, `${pending.stage.id}-applied.json`), {
          schema: "pastaprotocol-ravioli-deadline-settlement-applied@1",
          evidence,
        });
        applied.push(evidence);
        pending = null;
        stageIndex += 1;
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
      requiredBalanceMutez: 2_000_000,
      estimatedOriginationMutez: 0,
      operationReserveMutez: 2_000_000,
    });
    const handler = async (request: Parameters<typeof session.handle>[0]) => {
      const payload = decodePastaUiLiveValue(request.payload) as JsonObject;
      const response = await session.handle(request);
      if (request.action === "call") {
        const call = payload.call as JsonObject;
        mirror.applySuccessfulCall(
          String(call.contractAddress),
          String(call.entrypoint),
          call.payload,
          signer,
        );
      }
      return response;
    };
    return { session, handler };
  };

  const collectorTwo = makeSession(
    "collector2",
    collectorTwoTezos,
    collector2,
    1,
    collectorTwoBalance,
  );
  const collectorOne = makeSession(
    "collector1",
    collectorOneTezos,
    collector1,
    2,
    collectorOneBalance,
  );
  const [collectorTwoBridge, collectorOneBridge] = await Promise.all([
    startPastaUiLiveLoopbackServer({ staticRoot: STATIC_ROOT, handleAction: collectorTwo.handler }),
    startPastaUiLiveLoopbackServer({ staticRoot: STATIC_ROOT, handleAction: collectorOne.handler }),
  ]);
  const screenshots: CapturePastaProofStageResult[] = [];
  let collectorTwoActor: Awaited<ReturnType<typeof openStudio>> | null = null;
  let collectorOneActor: Awaited<ReturnType<typeof openStudio>> | null = null;
  try {
    collectorTwoActor = await openStudio({ bridge: collectorTwoBridge, account: collector2, kit });
    await collectorTwoActor.page.click("#btnRedeem");
    await waitForNotice(collectorTwoActor.page, "Pack opened", "btnRedeem");
    screenshots.push(await capturePastaProofStage({
      page: collectorTwoActor.page,
      monitor: collectorTwoActor.monitor,
      outputRoot: runRoot,
      app: "ravioli",
      capability: "deadline-first blind claim settlement",
      stageOrdinal: 13,
      stageName: "collector two opened the transferred blind claim",
      classification: "UI-LIVE",
      requiredEvidence: [
        { selector: "h1", expectedText: "Ravioli" },
        { selector: "#ppNotice", expectedText: "Pack opened" },
        { selector: "#log", expectedText: "opened ✓" },
      ],
      waitForLoadState: "none",
      timeoutMs: 30_000,
    }));
    await collectorTwoActor.page.fill("#transferRecipient", collector1);
    await collectorTwoActor.page.click("#btnTransferWrapper");
    await waitForNotice(collectorTwoActor.page, "wrapper transfer confirmed", "btnTransferWrapper");
    screenshots.push(await capturePastaProofStage({
      page: collectorTwoActor.page,
      monitor: collectorTwoActor.monitor,
      outputRoot: runRoot,
      app: "ravioli",
      capability: "blind claim preserving wrapper transfer",
      stageOrdinal: 14,
      stageName: "collector two returned the remaining unopened blind claim",
      classification: "UI-LIVE",
      requiredEvidence: [
        { selector: "#transferInfo", expectedText: "moved together" },
        { selector: "#ppNotice", expectedText: "wrapper transfer confirmed" },
      ],
      waitForLoadState: "none",
      timeoutMs: 30_000,
    }));
    collectorOneActor = await openStudio({ bridge: collectorOneBridge, account: collector1, kit });
    await collectorOneActor.page.click("#btnRedeem");
    await waitForNotice(collectorOneActor.page, "Pack opened", "btnRedeem");
    screenshots.push(await capturePastaProofStage({
      page: collectorOneActor.page,
      monitor: collectorOneActor.monitor,
      outputRoot: runRoot,
      app: "ravioli",
      capability: "deadline-first blind claim settlement",
      stageOrdinal: 15,
      stageName: "collector one opened the returned blind claim",
      classification: "UI-LIVE",
      requiredEvidence: [
        { selector: "h1", expectedText: "Ravioli" },
        { selector: "#ppNotice", expectedText: "Pack opened" },
        { selector: "#log", expectedText: "opened ✓" },
      ],
      waitForLoadState: "none",
      timeoutMs: 30_000,
    }));
    assert.equal(applied.length, 3);
    assert.equal(mirror.ledger.get(`${collector1}:${TOKEN_ID}`) || 0, 0);
    assert.equal(mirror.ledger.get(`${collector2}:${TOKEN_ID}`) || 0, 0);
    assert.equal(mirror.totalSupply.get(TOKEN_ID), 1);
    assert.equal(mirror.opened.get(TOKEN_ID), 2);
    const receipt = {
      schema: "pastaprotocol-ravioli-deadline-settlement-proof@1",
      status: "PASSED",
      classification: "UI-LIVE-DEADLINE-FIRST-SETTLEMENT",
      completedAt: new Date().toISOString(),
      network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
      router: ROUTER,
      tokenId: TOKEN_ID,
      openDeadline: kit.editionPolicy.openDeadline,
      kit: { path: path.relative(appRoot, kitPath), sha256: sha256(kitBytes) },
      operations: applied,
      screenshots,
      terminal: {
        opened: 2,
        liveWrapperSupply: 1,
        unsoldWrapperInventory: 1,
        collectorOneBalance: 0,
        collectorTwoBalance: 0,
      },
      integrationNote:
        "These UI-driven holder operations were executed before the immutable open cutoff and must be externally bound at their original semantic journal slots without replay.",
    };
    await writeExclusiveJson(path.join(evidenceRoot, "receipt.json"), receipt);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    collectorTwoActor?.monitor.dispose();
    collectorOneActor?.monitor.dispose();
    await Promise.all([
      collectorTwoActor?.browser.close(),
      collectorOneActor?.browser.close(),
      collectorTwoBridge.close(),
      collectorOneBridge.close(),
    ]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
