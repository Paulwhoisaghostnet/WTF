// Quarantined historical July-22 executable-recovery regression; never run as an active test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
  type PastaUiLiveBridgeRequest,
  type PastaUiLiveOperationDescriptor,
  type PastaUiLivePreparedOperation,
  type PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import {
  createRavioliMode0MutationReplayInterceptor,
  loadRavioliMode0MutationReplay,
  type RavioliMode0MutationReplay,
  type RavioliMode0MutationReplayIdentity,
  type RavioliMode0ReplayPinIdentity,
} from "./shadownet-ravioli-mode0-mutation-replay";
import {
  createRavioliUiLiveJournal,
  openRavioliUiLiveJournal,
  ravioliUiLiveDescriptorSha256,
  type RavioliUiLiveJournal,
} from "./shadownet-ravioli-ui-live-journal";
import { deterministicJsonBytes, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const COLLECTOR1 = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const COLLECTOR2 = "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ";
const ROUTER = "KT1TuPCh4gR19w7kdrYVv5jVF9VrKJU6z5rj";
const GNOCCHI = "KT1Qzue6Uxojgsf2SxhVk5sqv1T3BGB9Ba69";
const ROTINI = "KT1BHRGCyGLjxr7LA6eCyHFBoo9QDFTV3Bat";
const CREATED_AT = "2026-07-23T03:31:22.839Z";
const BASE_COUNTER = 100;
const ORIGINATION_HASH = "onomEQKxKWZCsMwgNM7eV1fQKv1A1wwMGoZU3E9yuPdnhUAcbqg";
const APPROVAL_HASH = "onqJpabnVoKeZkgSaygd5j5D7f6G3zGQD3qYwkFwwY3u4d7KvbR";
const PUBLIC_GATEWAY = "https://ipfs.example.test/ipfs";
const LOCAL_GATEWAY = "http://127.0.0.1:8080/ipfs";
const CIDS = [
  "bafkreigrhdcrr2mnwaflnqhqviz4skohv4cveo7hayec5hda5i6hnf2rza",
  "bafkreiglspdzfzigot3kx7p6kbnyi4fmk67kikojwpuxf6oaxe6kkrwb5q",
  "bafkreihrq5mc6zgley3qfffqap3bqfya6w6cclu74ocf55zokn4vcwjwke",
  "bafkreig7x3vu4uihh237dw2y2leydeqctnifpcw46evs65k6pktmgu22we",
] as const;

type Fixture = {
  parent: string;
  journal: RavioliUiLiveJournal;
  identity: RavioliMode0MutationReplayIdentity;
  wrapperBytes: Uint8Array;
  collectionValue: Record<string, unknown>;
  originationDescriptor: Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }>;
  approvalDescriptor: Extract<PastaUiLiveOperationDescriptor, { kind: "call" }>;
};

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pinIdentity(
  cid: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): RavioliMode0ReplayPinIdentity {
  return {
    cid,
    uri: `ipfs://${cid}`,
    fileName,
    mimeType,
    byteLength: bytes.byteLength,
    sha256: hash(bytes),
  };
}

function request(
  action: PastaUiLiveBridgeRequest["action"],
  payload: unknown,
  id = `request-${action}`,
): PastaUiLiveBridgeRequest {
  return { schema: PASTA_UI_LIVE_BRIDGE_SCHEMA, id, action, payload };
}

async function createFixture(
  t: { after(callback: () => Promise<void> | void): void },
): Promise<Fixture> {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-mode0-replay-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const journalRoot = path.join(parent, "journal");
  const actor = (signerAddress: string, counter: number) => ({
    signerAddress,
    counters: {
      primary: { rpcUrl: "https://tezos-shadownet.octez.io/", counter },
      fallback: { rpcUrl: "https://tcinfra.net/rpc/tezos/shadownet", counter },
    },
  });
  const journal = await createRavioliUiLiveJournal({
    journalRoot,
    createdAt: CREATED_AT,
    chainId: SHADOWNET_CHAIN_ID,
    actors: {
      creator: actor(CREATOR, BASE_COUNTER),
      collector1: actor(COLLECTOR1, 200),
      collector2: actor(COLLECTOR2, 300),
    },
    dependencyAddresses: { gnocchi: GNOCCHI, rotini: ROTINI },
    dependencyHashes: { gnocchi: "a".repeat(64), rotini: "b".repeat(64) },
    artifactHashes: {
      deploymentCertificate: "f".repeat(64),
      blindController: "1".repeat(64),
      router: "c".repeat(64),
      rotiniTarget: "2".repeat(64),
      gnocchiAdapter: "d".repeat(64),
      rotiniAdapter: "e".repeat(64),
    },
  });

  const wrapperBytes = Buffer.from("mode-0-wrapper");
  const collectionValue = {
    interfaces: ["TZIP-012", "TZIP-016"],
    name: "Replay Fixture",
    ravioli: { fulfillment: "atomic", version: 2 },
    symbol: "RVUI",
  };
  const collectionBytes = deterministicJsonBytes(collectionValue);
  const staleManifestBytes = deterministicJsonBytes({
    blindSecurity: "commit-reveal-ui-hidden-chain-public",
    mode: "deterministic_vault",
    mystery: true,
  });
  const staleTokenBytes = deterministicJsonBytes({
    ravioli: {
      blindSecurity: "commit-reveal-ui-hidden-chain-public",
      mode: "deterministic_vault",
    },
  });
  const pinBytes = [wrapperBytes, collectionBytes, staleManifestBytes, staleTokenBytes] as const;
  const pinInputs = [
    { fileName: "ravioli-wrapper-0.png", mimeType: "image/png" },
    { fileName: "collection.json", mimeType: "application/json" },
    { fileName: "ravioli-pack-manifest.json", mimeType: "application/json" },
    { fileName: "token.json", mimeType: "application/json" },
  ] as const;
  const appendPin = async (index: number, timestamp: string) => {
    const cid = CIDS[index];
    await journal.appendPin({
      actor: "creator",
      fileName: pinInputs[index].fileName,
      mimeType: pinInputs[index].mimeType,
      bytes: pinBytes[index],
      pinnedAt: timestamp,
      metadata: {
        cid,
        publicGatewayUrl: `${PUBLIC_GATEWAY}/${cid}`,
        uri: `ipfs://${cid}`,
      },
    });
  };
  await appendPin(0, "2026-07-23T03:32:00.000Z");
  await appendPin(1, "2026-07-23T03:32:01.000Z");

  const originationDescriptor: Extract<PastaUiLiveOperationDescriptor, { kind: "originate" }> = {
    kind: "originate",
    code: [
      { prim: "parameter", args: [{ prim: "unit" }] },
      { prim: "storage", args: [{ prim: "address" }] },
      { prim: "code", args: [[]] },
    ],
    storage: CREATOR,
  };
  const preparedOne: PastaUiLivePreparedOperation = {
    status: "PREPARED",
    operationSequence: 1,
    timestampUtc: "2026-07-23T03:32:02.000Z",
    action: "originate",
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: CREATOR,
    entrypoints: [],
    descriptor: originationDescriptor,
  };
  await journal.beforeOperationSubmit("creator", preparedOne);
  const submittedOne: PastaUiLiveSubmittedOperation = {
    ...preparedOne,
    status: "SUBMITTED",
    timestampUtc: "2026-07-23T03:32:03.000Z",
    operationHash: ORIGINATION_HASH,
    contractAddress: ROUTER,
  };
  await journal.onOperationSubmitted("creator", submittedOne);
  await journal.appendApplied({
    actor: "creator",
    operationSequence: 1,
    operationHash: ORIGINATION_HASH,
    contractAddress: ROUTER,
    entrypoints: [],
    appliedAt: "2026-07-23T03:32:05.000Z",
    evidence: {
      contractAddress: ROUTER,
      counter: BASE_COUNTER + 1,
      entrypoints: [],
      explorerUrl: `https://shadownet.tzkt.io/${ORIGINATION_HASH}`,
      level: 1_001,
      operationHash: ORIGINATION_HASH,
      signerAddress: CREATOR,
      status: "applied",
      timestamp: "2026-07-23T03:32:04.000Z",
    },
  });

  const approvalDescriptor: Extract<PastaUiLiveOperationDescriptor, { kind: "call" }> = {
    kind: "call",
    call: {
      contractAddress: GNOCCHI,
      entrypoint: "update_operators",
      payload: [{ add_operator: { owner: CREATOR, operator: ROUTER, token_id: 0 } }],
    },
    sendOptions: {},
  };
  const preparedTwo: PastaUiLivePreparedOperation = {
    status: "PREPARED",
    operationSequence: 2,
    timestampUtc: "2026-07-23T03:32:06.000Z",
    action: "call",
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: CREATOR,
    contractAddress: GNOCCHI,
    entrypoints: ["update_operators"],
    descriptor: approvalDescriptor,
  };
  await journal.beforeOperationSubmit("creator", preparedTwo);
  const submittedTwo: PastaUiLiveSubmittedOperation = {
    ...preparedTwo,
    status: "SUBMITTED",
    timestampUtc: "2026-07-23T03:32:07.000Z",
    operationHash: APPROVAL_HASH,
  };
  await journal.onOperationSubmitted("creator", submittedTwo);
  await journal.appendApplied({
    actor: "creator",
    operationSequence: 2,
    operationHash: APPROVAL_HASH,
    contractAddress: GNOCCHI,
    entrypoints: ["update_operators"],
    appliedAt: "2026-07-23T03:32:09.000Z",
    evidence: {
      contractAddress: GNOCCHI,
      counter: BASE_COUNTER + 2,
      entrypoints: ["update_operators"],
      explorerUrl: `https://shadownet.tzkt.io/${APPROVAL_HASH}`,
      level: 1_002,
      operationHash: APPROVAL_HASH,
      signerAddress: CREATOR,
      status: "applied",
      timestamp: "2026-07-23T03:32:08.000Z",
    },
  });
  await appendPin(2, "2026-07-23T03:32:10.000Z");
  await appendPin(3, "2026-07-23T03:32:11.000Z");

  const intentBytes = await readFile(path.join(journalRoot, "intent.json"));
  const intent = JSON.parse(intentBytes.toString("utf8")) as { journalId: string };
  const identity: RavioliMode0MutationReplayIdentity = {
    journalId: intent.journalId,
    intentSha256: hash(intentBytes),
    createdAt: CREATED_AT,
    creatorAddress: CREATOR,
    creatorBaseCounter: BASE_COUNTER,
    gnocchiAddress: GNOCCHI,
    rotiniAddress: ROTINI,
    routerAddress: ROUTER,
    routerArtifactSha256: "c".repeat(64),
    wrapperPin: pinIdentity(CIDS[0], pinInputs[0].fileName, pinInputs[0].mimeType, pinBytes[0]),
    collectionPin: pinIdentity(CIDS[1], pinInputs[1].fileName, pinInputs[1].mimeType, pinBytes[1]),
    staleManifestPin: pinIdentity(CIDS[2], pinInputs[2].fileName, pinInputs[2].mimeType, pinBytes[2]),
    staleTokenPin: pinIdentity(CIDS[3], pinInputs[3].fileName, pinInputs[3].mimeType, pinBytes[3]),
    origination: {
      descriptorSha256: ravioliUiLiveDescriptorSha256(originationDescriptor),
      operationHash: ORIGINATION_HASH,
      counter: BASE_COUNTER + 1,
      level: 1_001,
    },
    operatorApproval: {
      descriptorSha256: ravioliUiLiveDescriptorSha256(approvalDescriptor),
      operationHash: APPROVAL_HASH,
      counter: BASE_COUNTER + 2,
      level: 1_002,
    },
  };
  return {
    parent,
    journal: await openRavioliUiLiveJournal(journalRoot),
    identity,
    wrapperBytes,
    collectionValue,
    originationDescriptor,
    approvalDescriptor,
  };
}

async function loadFixture(fixture: Fixture): Promise<RavioliMode0MutationReplay> {
  return loadRavioliMode0MutationReplay({
    journal: fixture.journal,
    identity: fixture.identity,
    ipfs: { localGatewayUrl: LOCAL_GATEWAY, publicGatewayUrl: PUBLIC_GATEWAY },
  });
}

function recoveryRequests(fixture: Fixture): PastaUiLiveBridgeRequest[] {
  return [
    request("pin_blob", {
      dataBase64: Buffer.from(fixture.wrapperBytes).toString("base64"),
      fileName: fixture.identity.wrapperPin.fileName,
      mimeType: fixture.identity.wrapperPin.mimeType,
    }),
    request("pin_json", {
      value: fixture.collectionValue,
      fileName: fixture.identity.collectionPin.fileName,
    }),
    request("originate", {
      code: fixture.originationDescriptor.code,
      storage: fixture.originationDescriptor.storage,
    }),
    request("call", {
      call: fixture.approvalDescriptor.call,
      sendOptions: fixture.approvalDescriptor.sendOptions,
    }),
  ];
}

test("loads the exact validated prefix and quarantines superseded mystery pins", async (t) => {
  const fixture = await createFixture(t);
  const replay = await loadFixture(fixture);

  assert.equal(replay.journalPrefixComplete, true);
  assert.equal(replay.routerAddress, ROUTER);
  assert.equal(replay.operatorApprovalLevel, 1_002);
  assert.deepEqual(replay.activePins.map((pin) => pin.pinSequence), [1, 2]);
  assert.deepEqual(replay.pinProofs.map((pin) => pin.publicGatewayUrl), [
    `${PUBLIC_GATEWAY}/${CIDS[0]}`,
    `${PUBLIC_GATEWAY}/${CIDS[1]}`,
  ]);
  assert.deepEqual(replay.writeReceipts.map((receipt) => ({
    action: receipt.action,
    operationHash: receipt.operationHash,
    sequence: receipt.sequence,
  })), [
    { action: "originate", operationHash: ORIGINATION_HASH, sequence: 1 },
    { action: "call", operationHash: APPROVAL_HASH, sequence: 2 },
  ]);
  assert.deepEqual(replay.stalePins.map((pin) => pin.pinSequence), [3, 4]);
  assert.ok(replay.stalePins.every((pin) => pin.classification === "SUPERSEDED_MODE0_MYSTERY_METADATA"));
  assert.ok(replay.activePins.every((pin) => !replay.stalePins.some((stale) => stale.sha256 === pin.proof.sha256)));
});

test("replays four exact mutations without receipts while delegating reads and future work", async (t) => {
  const fixture = await createFixture(t);
  const replay = await loadFixture(fixture);
  const delegated: PastaUiLiveBridgeRequest[] = [];
  const interceptor = createRavioliMode0MutationReplayInterceptor({
    replay,
    delegate: async (bridgeRequest) => {
      delegated.push(bridgeRequest);
      return { delegated: bridgeRequest.action };
    },
  });

  assert.deepEqual(await interceptor.handle(request("connect", {})), { delegated: "connect" });
  assert.deepEqual(
    await interceptor.handle(request("active_protocol", { block: "head" })),
    { delegated: "active_protocol" },
  );
  assert.equal(interceptor.getCompletedStepCount(), 0, "read-only protocol check consumed a replay mutation");
  const results = [];
  for (const bridgeRequest of recoveryRequests(fixture)) results.push(await interceptor.handle(bridgeRequest));
  assert.equal(interceptor.isComplete(), true);
  assert.equal(interceptor.getCompletedStepCount(), 4);
  assert.equal(interceptor.getRemainingStepCount(), 0);
  assert.ok(results.every((result) => !Object.hasOwn(result as object, "receipt")));
  assert.equal(delegated.length, 2, "no recovered mutation reached the delegate");

  await assert.rejects(
    interceptor.handle(recoveryRequests(fixture)[3]),
    /refusing duplicate recovery mutation/,
  );
  await assert.rejects(
    interceptor.handle(request("originate", {
      code: fixture.originationDescriptor.code,
      ignoredByUnderlyingSession: true,
      storage: fixture.originationDescriptor.storage,
    })),
    /refusing duplicate recovery mutation/,
  );
  assert.equal(delegated.length, 2, "duplicate recovery mutation did not reach the delegate");

  assert.deepEqual(await interceptor.handle(recoveryRequests(fixture)[1]), { delegated: "pin_json" });
  assert.equal(delegated.length, 3, "later mode may intentionally re-pin collection.json");

  const future = request("call", {
    call: {
      contractAddress: GNOCCHI,
      entrypoint: "update_operators",
      payload: [{ add_operator: { owner: CREATOR, operator: ROUTER, token_id: 1 } }],
    },
    sendOptions: {},
  });
  assert.deepEqual(await interceptor.handle(future), { delegated: "call" });
  assert.equal(delegated.length, 4);
});

test("fails closed on order, pin-byte, descriptor, and approval-payload drift", async (t) => {
  const fixture = await createFixture(t);
  const replay = await loadFixture(fixture);
  const exactRequests = recoveryRequests(fixture);

  const make = () => {
    let mutationsDelegated = 0;
    const interceptor = createRavioliMode0MutationReplayInterceptor({
      replay,
      delegate: async (bridgeRequest) => {
        if (!["active_protocol", "connect", "chain_check", "balance", "contract_at", "estimate_call", "read_storage", "script_code_hash"].includes(bridgeRequest.action)) {
          mutationsDelegated += 1;
        }
        return {};
      },
    });
    return { interceptor, delegated: () => mutationsDelegated };
  };

  {
    const state = make();
    await assert.rejects(state.interceptor.handle(exactRequests[2]), /expected recovery step 1/);
    assert.equal(state.delegated(), 0);
  }
  {
    const state = make();
    const drifted = request("pin_blob", {
      dataBase64: Buffer.from("different-wrapper").toString("base64"),
      fileName: fixture.identity.wrapperPin.fileName,
      mimeType: fixture.identity.wrapperPin.mimeType,
    });
    await assert.rejects(state.interceptor.handle(drifted), /bytes or descriptor drifted/);
    assert.equal(state.delegated(), 0);
  }
  {
    const state = make();
    await state.interceptor.handle(exactRequests[0]);
    await state.interceptor.handle(exactRequests[1]);
    const drifted = request("originate", {
      code: [...(fixture.originationDescriptor.code as unknown[]), { prim: "DROP" }],
      storage: fixture.originationDescriptor.storage,
    });
    await assert.rejects(state.interceptor.handle(drifted), /bytes or descriptor drifted/);
    assert.equal(state.delegated(), 0);
  }
  {
    const state = make();
    await state.interceptor.handle(exactRequests[0]);
    await state.interceptor.handle(exactRequests[1]);
    await state.interceptor.handle(exactRequests[2]);
    const drifted = request("call", {
      call: {
        ...fixture.approvalDescriptor.call,
        payload: [{ add_operator: { owner: CREATOR, operator: ROUTER, token_id: 1 } }],
      },
      sendOptions: {},
    });
    await assert.rejects(state.interceptor.handle(drifted), /bytes or descriptor drifted/);
    assert.equal(state.delegated(), 0);
  }
});

test("re-reads canonical event bytes after journal open and rejects TOCTOU drift", async (t) => {
  const fixture = await createFixture(t);
  const eventPath = path.join(
    fixture.journal.journalRoot,
    "events",
    "000001-pin-creator.json",
  );
  const event = JSON.parse((await readFile(eventPath)).toString("utf8"));
  await writeFile(eventPath, `${JSON.stringify(event, null, 2)}\n`);

  await assert.rejects(loadFixture(fixture), /event 1 bytes are not canonical/);
});

test("rejects identity drift even when the journal itself remains internally valid", async (t) => {
  const fixture = await createFixture(t);
  const identity: RavioliMode0MutationReplayIdentity = {
    ...fixture.identity,
    operatorApproval: {
      ...fixture.identity.operatorApproval,
      descriptorSha256: "0".repeat(64),
    },
  };
  await assert.rejects(
    loadRavioliMode0MutationReplay({
      journal: fixture.journal,
      identity,
      ipfs: { localGatewayUrl: LOCAL_GATEWAY, publicGatewayUrl: PUBLIC_GATEWAY },
    }),
    /operation 2 descriptor identity drift/,
  );
});
