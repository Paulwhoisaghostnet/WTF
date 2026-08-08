import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  PastaUiLiveBridgeRequest,
  PastaUiLiveOperationDescriptor,
  PastaUiLivePreparedOperation,
  PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import {
  hashJsonForBridge,
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
} from "./pasta-ui-live-bridge-kit";
import {
  createRavioliControllerResumeInterceptor,
  loadRavioliControllerResume,
  type LoadRavioliControllerResumeInput,
  type RavioliControllerResume,
} from "./shadownet-ravioli-controller-resume";
import {
  createRavioliUiLiveJournal,
  openRavioliUiLiveJournal,
  type RavioliUiLiveJournal,
} from "./shadownet-ravioli-ui-live-journal";
import {
  deterministicJsonBytes,
  SHADOWNET_CHAIN_ID,
} from "./shadownet-proof-kit";

const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const COLLECTOR_ONE = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const COLLECTOR_TWO = "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ";
const GNOCCHI = "KT1ShvgCuQZAKWTUFeCQZphNcn1y6Bi7LyYi";
const ROTINI = "KT1SiFmNAENhyQxqnN2Zhw3bVo4EcFmvaRSx";
const CONTROLLER = "KT1P7qjWpPjsqJCUuzWW6qgf7JGfeNbb1jNK";
const ORIGINATION_HASH = "onyXm2NFwbPFCLDqLZTCeE64gyZY8UutJzgkemjYfHWnXTmad3c";
const PUBLIC_GATEWAY = "https://ipfs.example.test/ipfs";
const LOCAL_GATEWAY = "http://127.0.0.1:8080/ipfs";
const BASE_COUNTER = 100;
const CIDS = [
  "bafkreigrhdcrr2mnwaflnqhqviz4skohv4cveo7hayec5hda5i6hnf2rza",
  "bafkreifiq6udehme2t4xkzxf7n4r2gtntv43r3s4llp6odhsduiicftxua",
  "bafkreib6gcdzpapvlxk7igsl6q6wxmamh3dglhfd6xbhrfrni6pab6muma",
] as const;

type Fixture = {
  parent: string;
  journal: RavioliUiLiveJournal;
  controllerArtifact: unknown[];
  routerArtifact: unknown[];
  controllerDescriptor: Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }>;
  expected: LoadRavioliControllerResumeInput["expected"];
  wrapperBytes: Uint8Array;
  controllerMetadata: Record<string, unknown>;
  collectionMetadata: Record<string, unknown>;
};

function encodedMap(entries: readonly (readonly [unknown, unknown])[]) {
  return { $map: entries };
}

function actor(signerAddress: string, counter: number) {
  return {
    signerAddress,
    counters: {
      primary: { rpcUrl: "https://tezos-shadownet.octez.io", counter },
      fallback: { rpcUrl: "https://tcinfra.net/rpc/tezos/shadownet", counter },
    },
  };
}

function request(
  action: PastaUiLiveBridgeRequest["action"],
  payload: unknown,
): PastaUiLiveBridgeRequest {
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: `request-${action}-${Math.random()}`,
    action,
    payload,
  };
}

async function createFixture(
  t: { after(callback: () => Promise<void> | void): void },
): Promise<Fixture> {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-controller-resume-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const journalRoot = path.join(parent, "journal");
  const controllerArtifact = [
    { prim: "parameter", args: [{ prim: "unit" }] },
    { prim: "storage", args: [{ prim: "unit" }] },
    { prim: "code", args: [[]] },
  ];
  const routerArtifact = [
    { prim: "parameter", args: [{ prim: "nat" }] },
    { prim: "storage", args: [{ prim: "unit" }] },
    { prim: "code", args: [[]] },
  ];
  const dependencyHashes = {
    gnocchiManifest: "a".repeat(64),
    gnocchiReceipt: "b".repeat(64),
    gnocchiScript: "c".repeat(64),
    gnocchiScriptCode: "d".repeat(64),
    rotiniManifest: "e".repeat(64),
    rotiniReceipt: "f".repeat(64),
    rotiniScript: "1".repeat(64),
    rotiniScriptCode: "2".repeat(64),
  };
  const artifactHashes = {
    deploymentCertificate: "3".repeat(64),
    blindController: hashJsonForBridge(controllerArtifact),
    router: hashJsonForBridge(routerArtifact),
    rotiniTarget: "4".repeat(64),
    gnocchiAdapter: "5".repeat(64),
    rotiniAdapter: "6".repeat(64),
  };
  const journal = await createRavioliUiLiveJournal({
    journalRoot,
    createdAt: "2026-07-23T21:07:22.149Z",
    chainId: SHADOWNET_CHAIN_ID,
    actors: {
      creator: actor(CREATOR, BASE_COUNTER),
      collector1: actor(COLLECTOR_ONE, 200),
      collector2: actor(COLLECTOR_TWO, 300),
    },
    dependencyAddresses: { gnocchi: GNOCCHI, rotini: ROTINI },
    dependencyHashes: {
      ...dependencyHashes,
      tzktBaseline: "7".repeat(64),
    },
    artifactHashes,
  });

  const wrapperBytes = Buffer.from("mode-0-wrapper");
  const controllerMetadata = {
    description: "Typed Ravioli v3 claim, reveal, proceeds-escrow, delivery-cutoff, and refund controller.",
    interfaces: ["TZIP-016"],
    name: "Pasta Ravioli Blind Pack Controller",
    pasta: { app: "ravioli", helper: "blind-pack-controller", version: 3 },
  };
  const collectionMetadata = {
    interfaces: ["TZIP-012", "TZIP-016"],
    name: "Ravioli UI-LIVE Atomic Packs",
    ravioli: {
      controllerBinding: "immutable-router-storage",
      fulfillment: "atomic-router-and-blind-controller",
      transferExpiry: "reveal-deadline-if-unrevealed-or-open-deadline-if-revealed",
      version: 3,
    },
    symbol: "RVUI",
  };
  const pinInputs = [
    { bytes: wrapperBytes, fileName: "ravioli-wrapper-0.png", mimeType: "image/png" },
    {
      bytes: deterministicJsonBytes(controllerMetadata),
      fileName: "pasta-ravioli-blind-controller-contract.json",
      mimeType: "application/json",
    },
    {
      bytes: deterministicJsonBytes(collectionMetadata),
      fileName: "collection.json",
      mimeType: "application/json",
    },
  ] as const;
  for (const [index, pin] of pinInputs.entries()) {
    await journal.appendPin({
      actor: "creator",
      fileName: pin.fileName,
      mimeType: pin.mimeType,
      bytes: pin.bytes,
      pinnedAt: `2026-07-23T21:23:0${index + 1}.000Z`,
      metadata: {
        cid: CIDS[index],
        uri: `ipfs://${CIDS[index]}`,
        publicGatewayUrl: `${PUBLIC_GATEWAY}/${CIDS[index]}`,
      },
    });
  }
  const controllerDescriptor: Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }> = {
    kind: "originate",
    code: controllerArtifact,
    storage: {
      claim_counts: encodedMap([]),
      claim_slots: encodedMap([]),
      consumed_serials: encodedMap([]),
      metadata: encodedMap([[
        "",
        Buffer.from(`ipfs://${CIDS[1]}`, "utf8").toString("hex"),
      ]]),
      packs: encodedMap([]),
      refund_credits: encodedMap([]),
    },
  };
  const prepared: PastaUiLivePreparedOperation = {
    status: "PREPARED",
    operationSequence: 1,
    timestampUtc: "2026-07-23T21:23:20.000Z",
    action: "originate",
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: CREATOR,
    entrypoints: [],
    descriptor: controllerDescriptor,
  };
  await journal.beforeOperationSubmit("creator", prepared);
  const submitted: PastaUiLiveSubmittedOperation = {
    ...prepared,
    status: "SUBMITTED",
    timestampUtc: "2026-07-23T21:23:21.000Z",
    operationHash: ORIGINATION_HASH,
    contractAddress: CONTROLLER,
  };
  await journal.onOperationSubmitted("creator", submitted);
  await journal.appendApplied({
    actor: "creator",
    operationSequence: 1,
    operationHash: ORIGINATION_HASH,
    contractAddress: CONTROLLER,
    entrypoints: [],
    appliedAt: "2026-07-23T21:23:23.000Z",
    evidence: {
      contractAddress: CONTROLLER,
      counter: BASE_COUNTER + 1,
      entrypoints: [],
      explorerUrl: `https://shadownet.tzkt.io/${ORIGINATION_HASH}`,
      level: 4_320_242,
      operationHash: ORIGINATION_HASH,
      signerAddress: CREATOR,
      status: "applied",
      timestamp: "2026-07-23T21:23:22.000Z",
    },
  });
  return {
    parent,
    journal: await openRavioliUiLiveJournal(journalRoot),
    controllerArtifact,
    routerArtifact,
    controllerDescriptor,
    expected: {
      creatorAddress: CREATOR,
      collectorOneAddress: COLLECTOR_ONE,
      collectorTwoAddress: COLLECTOR_TWO,
      dependencyAddresses: { gnocchi: GNOCCHI, rotini: ROTINI },
      dependencyHashes,
      artifactHashes,
      controllerArtifact,
      routerArtifact,
    },
    wrapperBytes,
    controllerMetadata,
    collectionMetadata,
  };
}

async function loadFixture(fixture: Fixture): Promise<RavioliControllerResume> {
  return loadRavioliControllerResume({
    journal: fixture.journal,
    ipfs: {
      localGatewayUrl: LOCAL_GATEWAY,
      publicGatewayUrl: PUBLIC_GATEWAY,
    },
    expected: fixture.expected,
  });
}

function replayRequests(fixture: Fixture): PastaUiLiveBridgeRequest[] {
  return [
    request("pin_blob", {
      dataBase64: Buffer.from(fixture.wrapperBytes).toString("base64"),
      fileName: "ravioli-wrapper-0.png",
      mimeType: "image/png",
    }),
    request("pin_json", {
      fileName: "pasta-ravioli-blind-controller-contract.json",
      value: fixture.controllerMetadata,
    }),
    request("pin_json", {
      fileName: "collection.json",
      value: fixture.collectionMetadata,
    }),
    request("originate", {
      code: fixture.controllerDescriptor.code,
      storage: fixture.controllerDescriptor.storage,
    }),
  ];
}

function routerRequest(fixture: Fixture): PastaUiLiveBridgeRequest {
  return request("originate", {
    code: fixture.routerArtifact,
    storage: {
      administrator: CREATOR,
      pending_administrator: null,
      blind_controller: CONTROLLER,
      metadata: encodedMap([[
        "",
        Buffer.from(`ipfs://${CIDS[2]}`, "utf8").toString("hex"),
      ]]),
    },
  });
}

test("loads only the exact three-pin/controller-APPLIED boundary", async (t) => {
  const fixture = await createFixture(t);
  const replay = await loadFixture(fixture);

  assert.equal(replay.journalPrefixComplete, true);
  assert.equal(replay.controllerAddress, CONTROLLER);
  assert.deepEqual(replay.activePins.map((pin) => pin.kind), [
    "wrapper",
    "controller-metadata",
    "collection",
  ]);
  assert.deepEqual(replay.pinProofs.map((pin) => pin.cid), CIDS);
  assert.deepEqual(replay.writeReceipts.map((receipt) => ({
    action: receipt.action,
    operationHash: receipt.operationHash,
    contractAddress: receipt.contractAddress,
    sequence: receipt.sequence,
  })), [{
    action: "originate",
    operationHash: ORIGINATION_HASH,
    contractAddress: CONTROLLER,
    sequence: 1,
  }]);
  assert.equal(replay.identity.creatorBaseCounter, BASE_COUNTER);
  assert.equal(replay.identity.origination.counter, BASE_COUNTER + 1);
});

test("replays three pins and the controller without side effects, then delegates only the exact router first", async (t) => {
  const fixture = await createFixture(t);
  const replay = await loadFixture(fixture);
  const delegated: PastaUiLiveBridgeRequest[] = [];
  const interceptor = createRavioliControllerResumeInterceptor({
    replay,
    delegate: async (bridgeRequest) => {
      delegated.push(bridgeRequest);
      return bridgeRequest.action === "originate"
        ? {
            contractAddress: "KT1TuPCh4gR19w7kdrYVv5jVF9VrKJU6z5rj",
            operationHash: "onomEQKxKWZCsMwgNM7eV1fQKv1A1wwMGoZU3E9yuPdnhUAcbqg",
          }
        : { delegated: bridgeRequest.action };
    },
  });

  assert.deepEqual(await interceptor.handle(request("connect", {})), { delegated: "connect" });
  assert.deepEqual(
    await interceptor.handle(request("active_protocol", { block: "head" })),
    { delegated: "active_protocol" },
  );
  assert.equal(interceptor.getCompletedStepCount(), 0, "read-only protocol check consumed a replay mutation");
  const responses = [];
  for (const bridgeRequest of replayRequests(fixture)) {
    responses.push(await interceptor.handle(bridgeRequest));
  }
  assert.equal(interceptor.isComplete(), true);
  assert.equal(interceptor.getCompletedStepCount(), 4);
  assert.equal(interceptor.getRemainingStepCount(), 0);
  assert.equal(interceptor.didDelegateRouter(), false);
  assert.equal(delegated.length, 2, "recovered mutations reached the delegate");
  assert.ok(responses.every((response) => !Object.hasOwn(response as object, "receipt")));

  const router = routerRequest(fixture);
  await interceptor.handle(router);
  assert.equal(interceptor.didDelegateRouter(), true);
  assert.equal(delegated.length, 3);
  assert.equal(delegated[2], router);
});

test("fails closed on prefix order, bytes, controller replay, and first-new-router drift", async (t) => {
  const fixture = await createFixture(t);
  const replay = await loadFixture(fixture);
  const make = () => {
    let mutationDelegations = 0;
    const interceptor = createRavioliControllerResumeInterceptor({
      replay,
      delegate: async (bridgeRequest) => {
        if (!["active_protocol", "connect", "chain_check", "balance", "contract_at", "estimate_call", "read_storage", "script_code_hash"].includes(bridgeRequest.action)) {
          mutationDelegations += 1;
        }
        return {};
      },
    });
    return { interceptor, mutationDelegations: () => mutationDelegations };
  };

  {
    const state = make();
    await assert.rejects(
      state.interceptor.handle(replayRequests(fixture)[1]),
      /expected recovery step 1/,
    );
    assert.equal(state.mutationDelegations(), 0);
  }
  {
    const state = make();
    const badWrapper = request("pin_blob", {
      dataBase64: Buffer.from("wrong-wrapper").toString("base64"),
      fileName: "ravioli-wrapper-0.png",
      mimeType: "image/png",
    });
    await assert.rejects(state.interceptor.handle(badWrapper), /bytes or descriptor drifted/);
    assert.equal(state.mutationDelegations(), 0);
  }
  {
    const state = make();
    for (const bridgeRequest of replayRequests(fixture)) await state.interceptor.handle(bridgeRequest);
    await assert.rejects(
      state.interceptor.handle(replayRequests(fixture)[3]),
      /refusing duplicate recovery mutation/,
    );
    assert.equal(state.mutationDelegations(), 0);
  }
  {
    const state = make();
    for (const bridgeRequest of replayRequests(fixture)) await state.interceptor.handle(bridgeRequest);
    await assert.rejects(
      state.interceptor.handle(request("call", { call: {}, sendOptions: {} })),
      /first new mutation must originate the router/,
    );
    assert.equal(state.mutationDelegations(), 0);
  }
  {
    const state = make();
    for (const bridgeRequest of replayRequests(fixture)) await state.interceptor.handle(bridgeRequest);
    const wrongRouter = routerRequest(fixture);
    (wrongRouter.payload as any).storage.blind_controller =
      "KT1TuPCh4gR19w7kdrYVv5jVF9VrKJU6z5rj";
    await assert.rejects(
      state.interceptor.handle(wrongRouter),
      /first delegated router controller binding drift/,
    );
    assert.equal(state.mutationDelegations(), 0);
  }
});

test("re-reads the prefix and rejects any extra event, extra pin, or TOCTOU byte drift", async (t) => {
  const fixture = await createFixture(t);
  const eventsRoot = path.join(fixture.journal.journalRoot, "events");
  await writeFile(path.join(eventsRoot, "unexpected.json"), "{}");
  await assert.rejects(loadFixture(fixture), /six-event controller prefix filenames drift/);
  await rm(path.join(eventsRoot, "unexpected.json"));

  const pinsRoot = path.join(fixture.journal.journalRoot, "pins");
  await writeFile(path.join(pinsRoot, "000004.bin"), "unexpected");
  await assert.rejects(loadFixture(fixture), /three-pin controller prefix filenames drift/);
  await rm(path.join(pinsRoot, "000004.bin"));

  const firstEventPath = path.join(eventsRoot, "000001-pin-creator.json");
  const firstEvent = JSON.parse((await readFile(firstEventPath)).toString("utf8"));
  await writeFile(firstEventPath, `${JSON.stringify(firstEvent, null, 2)}\n`);
  await assert.rejects(loadFixture(fixture), /event 1 bytes are not canonical/);
  assert.deepEqual((await readdir(pinsRoot)).sort(), [
    "000001.bin",
    "000002.bin",
    "000003.bin",
  ]);
});
