import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { blake2b } from "blakejs";
import { chromium } from "playwright";

import {
  createBridgeRequest,
  type PastaUiLiveBridgeRequest,
} from "./pasta-ui-live-bridge-kit";
import {
  assertRavioliCurrentV2IdentityAddresses,
  createRavioliCurrentV2ResumeInterceptor,
  loadRavioliCurrentV2Resume,
  RAVIOLI_CURRENT_V2_MODE0_NONCE,
  RAVIOLI_CURRENT_V2_MODE0_NONCE_COMMITMENT,
  RAVIOLI_CURRENT_V2_NEXT_PIN,
  RAVIOLI_CURRENT_V2_RESUME_IDENTITY,
  ravioliCurrentV2ResumeSnapshot,
  type RavioliCurrentV2Resume,
} from "./shadownet-ravioli-current-v2-resume";
import {
  assertRavioliCurrentV2RouterStorageShape,
  assertRavioliCurrentV2NonceOverrideConsumed,
  installRavioliCurrentV2NonceOverride,
} from "./shadownet-ravioli-ui-live";
import { openRavioliUiLiveJournal } from "./shadownet-ravioli-ui-live-journal";
import { root } from "./shadownet-proof-kit";

const CURRENT_JOURNAL_ROOT = path.join(
  root,
  "artifacts",
  "pasta-protocol-proof-runs",
  "pasta-alpha-proof-20260723a",
  "ravioli",
  "artifacts",
  "journal",
);
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadCurrentFixture(): Promise<RavioliCurrentV2Resume | null> {
  try {
    await stat(path.join(CURRENT_JOURNAL_ROOT, "intent.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const events = await readdir(path.join(CURRENT_JOURNAL_ROOT, "events"));
  if (events.filter((name) => name.endsWith(".json")).length !== 31) {
    return null;
  }
  const journal = await openRavioliUiLiveJournal(CURRENT_JOURNAL_ROOT);
  const { tzktBaseline: _tzktBaseline, ...dependencyHashes } = journal.intent.dependencyHashes;
  const controllerArtifact = await json(path.join(
    root,
    "public",
    "creation-tools",
    "ravioli",
    "contract",
    "pasta-blind-pack-controller.contract.json",
  ));
  const routerArtifact = await json(path.join(
    root,
    "public",
    "creation-tools",
    "ravioli",
    "contract",
    "pasta-bundle.contract.json",
  ));
  return loadRavioliCurrentV2Resume({
    journal,
    ipfs: {
      localGatewayUrl: "http://127.0.0.1:8080/ipfs",
      publicGatewayUrl: "https://ipfs.io/ipfs",
    },
    expected: {
      creatorAddress: journal.intent.actors.creator.signerAddress,
      collectorOneAddress: journal.intent.actors.collector1.signerAddress,
      collectorTwoAddress: journal.intent.actors.collector2.signerAddress,
      dependencyAddresses: journal.intent.dependencyAddresses,
      dependencyHashes,
      artifactHashes: journal.intent.artifactHashes,
      controllerArtifact,
      routerArtifact,
    },
  });
}

function pinRequest(replay: RavioliCurrentV2Resume, index: number): PastaUiLiveBridgeRequest {
  const pin = replay.activePins[index];
  return pin.identity.mimeType === "application/json"
    ? createBridgeRequest("pin_json", {
        fileName: pin.proof.fileName,
        value: pin.value,
      })
    : createBridgeRequest("pin_blob", {
        dataBase64: Buffer.from(pin.bytes).toString("base64"),
        fileName: pin.proof.fileName,
        mimeType: pin.proof.mimeType,
      });
}

function operationRequest(replay: RavioliCurrentV2Resume, index: number): PastaUiLiveBridgeRequest {
  const operation = replay.operations[index];
  return operation.descriptor.kind === "originate"
    ? createBridgeRequest("originate", {
        code: operation.descriptor.code,
        storage: operation.descriptor.storage,
      })
    : createBridgeRequest("call", {
        call: operation.descriptor.call,
        sendOptions: operation.descriptor.sendOptions,
      });
}

function exactReplayRequests(replay: RavioliCurrentV2Resume): PastaUiLiveBridgeRequest[] {
  return [
    pinRequest(replay, 0),
    pinRequest(replay, 1),
    pinRequest(replay, 2),
    operationRequest(replay, 0),
    operationRequest(replay, 1),
    operationRequest(replay, 2),
    pinRequest(replay, 3),
    pinRequest(replay, 4),
    pinRequest(replay, 5),
    operationRequest(replay, 3),
    operationRequest(replay, 4),
    operationRequest(replay, 5),
    operationRequest(replay, 6),
    operationRequest(replay, 7),
  ];
}

function nextWrapperRequest(): PastaUiLiveBridgeRequest {
  return createBridgeRequest("pin_blob", {
    dataBase64: Buffer.concat([
      PNG_BYTES,
      Buffer.from("ravioli-ui-live-wrapper-1"),
    ]).toString("base64"),
    fileName: RAVIOLI_CURRENT_V2_NEXT_PIN.fileName,
    mimeType: RAVIOLI_CURRENT_V2_NEXT_PIN.mimeType,
  });
}

function operationNineRequest(replay: RavioliCurrentV2Resume): PastaUiLiveBridgeRequest {
  return createBridgeRequest("call", {
    call: {
      contractAddress: replay.identity.gnocchiAddress,
      entrypoint: "update_operators",
      payload: [0, 1].map((tokenId) => ({
        add_operator: {
          owner: replay.identity.creatorAddress,
          operator: replay.identity.routerAddress,
          token_id: tokenId,
        },
      })),
    },
    sendOptions: {},
  });
}

function readOnlyFixture(): RavioliCurrentV2Resume {
  const fakeProof = (index: number) => ({
    cid: `bafkrei${String(index).padStart(52, "a")}`,
    uri: `ipfs://bafkrei${String(index).padStart(52, "a")}`,
    fileName: index === 0 ? "ravioli-wrapper-0.png" : `pin-${index}.json`,
    mimeType: index === 0 ? "image/png" : "application/json",
    byteLength: 1,
    sha256: String(index).padStart(64, "0"),
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${index}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${index}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  });
  return {
    journalRoot: "/fixture",
    journalPrefixComplete: true,
    controllerAddress: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.controllerAddress,
    routerAddress: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.routerAddress,
    operatorApprovalLevel: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.operations[2].level,
    identity: RAVIOLI_CURRENT_V2_RESUME_IDENTITY,
    activePins: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.pins.map((identity, index) => ({
      identity,
      eventPath: `event-${index}`,
      artifactPath: `pin-${index}`,
      bytes: new Uint8Array([index]),
      value: {},
      proof: fakeProof(index),
    })),
    pinProofs: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.pins.map((_, index) => fakeProof(index)),
    operations: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.operations.map((identity) => ({
      identity,
      descriptor: { kind: "call", call: { contractAddress: identity.contractAddress, entrypoint: "", payload: null }, sendOptions: {} },
      receipt: {
        schema: "pasta-ui-live-receipt@1",
        sequence: identity.globalOrdinal,
        timestampUtc: identity.timestamp,
        action: identity.action,
        chainId: "NetXnHfVqm9iesp",
      },
    })),
    writeReceipts: [],
  } as unknown as RavioliCurrentV2Resume;
}

test("current-v2 identity is the distinct exact July-23 six-pin/eight-operation boundary", () => {
  assertRavioliCurrentV2IdentityAddresses();
  assert.equal(RAVIOLI_CURRENT_V2_RESUME_IDENTITY.pins.length, 6);
  assert.equal(RAVIOLI_CURRENT_V2_RESUME_IDENTITY.operations.length, 8);
  assert.equal(
    RAVIOLI_CURRENT_V2_RESUME_IDENTITY.finalEventSha256,
    "63f85e91158dcf737633b40956615b780dedd69b67168d0b57044a7b6f61e6be",
  );
  assert.equal(RAVIOLI_CURRENT_V2_NEXT_PIN.sha256, "6e5aa8c0aa33281820959970ece335173b3781fdf2f4d575e864ebb2bb076762");
  assert.equal(
    Buffer.from(blake2b(Buffer.from(RAVIOLI_CURRENT_V2_MODE0_NONCE, "hex"), undefined, 32)).toString("hex"),
    RAVIOLI_CURRENT_V2_MODE0_NONCE_COMMITMENT,
  );
});

test("current-v2 verifier accepts the certified opened-only router storage shape and rejects real drift", () => {
  const mapNames = [
    "adapter_allowances",
    "asset_allowances",
    "ledger",
    "metadata",
    "minted",
    "minters",
    "opened",
    "operators",
    "packs",
    "recipe_commitments",
    "sales",
    "token_metadata",
    "total_supply",
  ] as const;
  const storage = Object.assign({
    administrator: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.creatorAddress,
    pending_administrator: null,
    blind_controller: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.controllerAddress,
    next_token_id: 1,
  }, Object.fromEntries(mapNames.map((name, index) => [name, 40_000 + index])));

  assert.equal("opened" in storage, true);
  assert.equal("opened_by" in storage, false);
  assert.doesNotThrow(() => assertRavioliCurrentV2RouterStorageShape(storage, {
    creatorAddress: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.creatorAddress,
    controllerAddress: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.controllerAddress,
  }));

  assert.throws(
    () => assertRavioliCurrentV2RouterStorageShape({ ...storage, opened_by: 50_000 }, {
      creatorAddress: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.creatorAddress,
      controllerAddress: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.controllerAddress,
    }),
    /superseded opened_by state/,
  );

  const missingOpened = { ...storage } as Record<string, unknown>;
  delete missingOpened.opened;
  assert.throws(
    () => assertRavioliCurrentV2RouterStorageShape(missingOpened, {
      creatorAddress: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.creatorAddress,
      controllerAddress: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.controllerAddress,
    }),
    /opened must be an indexed big-map id/,
  );
});

test("current-v2 nonce override is exact, one-shot, and cannot leak into mode 1 entropy", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    const nativeNonce = await page.evaluate(() =>
      [...crypto.getRandomValues(new Uint8Array(32))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""));
    assert.notEqual(nativeNonce, RAVIOLI_CURRENT_V2_MODE0_NONCE, "native entropy unexpectedly matched the recovery nonce");

    await installRavioliCurrentV2NonceOverride(page);
    const values = await page.evaluate(() => {
      crypto.getRandomValues(new Uint8Array(16));
      const recovered = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const nextMode = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      return { recovered, nextMode };
    });
    assert.equal(values.recovered, RAVIOLI_CURRENT_V2_MODE0_NONCE);
    assert.notEqual(values.nextMode, RAVIOLI_CURRENT_V2_MODE0_NONCE, "recovery entropy leaked into mode 1");
    await assertRavioliCurrentV2NonceOverrideConsumed(page);
    assert.equal(await page.evaluate(() => "__ravioliCurrentV2NonceOverride" in window), false);
  } finally {
    await browser.close();
  }
});

test("active_protocol and execute_view delegate without consuming replay state", async () => {
  const delegated: string[] = [];
  const interceptor = createRavioliCurrentV2ResumeInterceptor({
    replay: readOnlyFixture(),
    delegate: async (request) => {
      delegated.push(request.action);
      return { delegated: request.action };
    },
  });
  assert.deepEqual(await interceptor.handle(createBridgeRequest("active_protocol", { block: "head" })), {
    delegated: "active_protocol",
  });
  assert.deepEqual(await interceptor.handle(createBridgeRequest("execute_view", {
    contractAddress: RAVIOLI_CURRENT_V2_RESUME_IDENTITY.routerAddress,
    viewName: "get_pack",
    input: 0,
  })), { delegated: "execute_view" });
  assert.deepEqual(delegated, ["active_protocol", "execute_view"]);
  assert.equal(interceptor.getCompletedReplayStepCount(), 0);
  assert.equal(interceptor.continuationStage(), "replay-prefix");
});

test("current-v2 immutable 31-event fixture replays locally once, then gates wrapper-1 and matrix operation 9", async (t) => {
  const replay = await loadCurrentFixture();
  if (!replay) {
    t.skip("the local proof journal has advanced beyond the retired 31-event current-v2 boundary");
    return;
  }
  const second = await loadCurrentFixture();
  assert.ok(second);
  assert.deepEqual(ravioliCurrentV2ResumeSnapshot(second), ravioliCurrentV2ResumeSnapshot(replay));

  const delegated: PastaUiLiveBridgeRequest[] = [];
  const interceptor = createRavioliCurrentV2ResumeInterceptor({
    replay,
    delegate: async (request) => {
      delegated.push(request);
      return { delegated: request.action };
    },
  });
  for (const request of exactReplayRequests(replay)) await interceptor.handle(request);
  assert.equal(interceptor.isReplayComplete(), true);
  assert.equal(interceptor.getRemainingReplayStepCount(), 0);
  assert.equal(delegated.length, 0, "the immutable replay prefix must not execute any external side effect");
  assert.equal(interceptor.continuationStage(), "mode1-wrapper-pin");

  const driftedWrapper = nextWrapperRequest();
  (driftedWrapper.payload as any).fileName = "wrong-wrapper.png";
  await assert.rejects(() => interceptor.handle(driftedWrapper), /first new mode-1 wrapper pin drift/);
  assert.equal(delegated.length, 0);

  await interceptor.handle(nextWrapperRequest());
  assert.equal(interceptor.didDelegateExpectedNextPin(), true);
  assert.equal(interceptor.continuationStage(), "matrix-operation-9");
  await interceptor.handle(createBridgeRequest("execute_view", {
    contractAddress: replay.routerAddress,
    viewName: "get_pack",
    input: 0,
  }));
  assert.equal(interceptor.continuationStage(), "matrix-operation-9");

  const driftedOperationNine = operationNineRequest(replay);
  ((driftedOperationNine.payload as any).call.payload[1].add_operator as any).token_id = 2;
  await assert.rejects(
    () => interceptor.handle(driftedOperationNine),
    /matrix operation 9 payload drift/,
  );
  assert.equal(
    delegated.filter((request) => request.action === "call").length,
    0,
    "a drifted matrix operation 9 must fail before delegation",
  );
  assert.equal(interceptor.didDelegateExpectedNextOperation(), false);
  assert.equal(interceptor.continuationStage(), "matrix-operation-9");

  await interceptor.handle(operationNineRequest(replay));
  assert.equal(interceptor.didDelegateExpectedNextOperation(), true);
  assert.equal(interceptor.continuationStage(), "continued");
  assert.equal(delegated.filter((request) => request.action === "pin_blob").length, 1);
  assert.equal(delegated.filter((request) => request.action === "call").length, 1);

  await assert.rejects(
    () => interceptor.handle(operationRequest(replay, 7)),
    /refusing duplicate recovery side effect/,
  );
});
