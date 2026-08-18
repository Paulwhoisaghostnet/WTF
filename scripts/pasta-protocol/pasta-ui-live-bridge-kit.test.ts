import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";

import {
  buildPastaUiLiveProxyInstallerSource,
  createBridgeRequest,
  decodePastaUiLiveValue,
  hashJsonForBridge,
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
  PASTA_UI_LIVE_ENTRYPOINT_PROJECTION_MAXIMUM_DEPTH,
  PASTA_UI_LIVE_STORAGE_PROJECTION_LIMITS,
  PASTA_UI_LIVE_VIEW_RECEIPT_SCHEMA,
  PastaUiLiveBridgeError,
  PastaUiLiveSubmittedOperationError,
  serializePastaUiLiveEntrypoints,
  serializePastaUiLiveStorageProjection,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLivePinProof,
  type PastaUiLivePreparedOperation,
  type PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const ORIGINATION_HASH = "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq";
const BATCH_HASH = "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp";
const CALL_HASH = "ooAq3auFLuZywAjtSv5JRmdmF56YNCVy5teEMXjxsKMapBbmMQQ";
const CHAIN_ID = "NetXsqzbfFenSTS";
const PROTOCOL = "PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY";
const CID = "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
const SCRIPT_CODE = [
  { prim: "parameter", args: [{ prim: "unit" }] },
  { prim: "storage", args: [{ prim: "unit" }] },
  { prim: "code", args: [[{ prim: "CAR" }, { prim: "NIL", args: [{ prim: "operation" }] }, { prim: "PAIR" }]] },
];

function confirmationTimeoutError(): Error {
  const error = new Error("Confirmation polling timed out");
  error.name = "ConfirmationTimeoutError";
  return error;
}

function confirmationHttp404Error(): Error {
  const error = new Error("HTTP 404 while polling confirmation; password=do-not-expose-this");
  error.name = "HttpResponseError";
  return error;
}

function pinProof(fileName = "metadata.json"): PastaUiLivePinProof {
  return {
    cid: CID,
    uri: `ipfs://${CID}`,
    fileName,
    mimeType: "application/json",
    byteLength: 25,
    sha256: "5af28061360b21d212e9b3f53af80d7b74b7656eaf7cc01c9e5c82a7aab28f08",
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${CID}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${CID}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

function fakeTezos() {
  const batchCalls: unknown[] = [];
  const contract = {
    address: CONTRACT,
    entrypoints: {
      entrypoints: {
        create_token: {
          prim: "pair",
          args: [
            { prim: "nat", annots: ["%token_id"] },
            { prim: "option", args: [{ prim: "timestamp" }], annots: ["%child_expiry"] },
          ],
        },
      },
      provider: { mustNotCrossBridge: true },
    },
    methodsObject: {
      create_token(payload: unknown) {
        return {
          entrypoint: "create_token",
          payload,
          toTransferParams(options: unknown = {}) {
            return { to: CONTRACT, parameter: { entrypoint: "create_token", value: payload }, ...options as object };
          },
        };
      },
    },
    async storage() {
      return { next_token_id: 1 };
    },
  };
  return {
    batchCalls,
    tezos: {
      rpc: {
        async getBlock(options: { block: string }) {
          assert.deepEqual(options, { block: "head" });
          return { protocol: PROTOCOL };
        },
        async getBlockHeader(options: { block: string }) {
          assert.deepEqual(options, { block: "head" });
          return { timestamp: "2026-08-13T14:00:00Z", level: 4_603_700 };
        },
        async getScript(address: string) {
          assert.equal(address, CONTRACT);
          return { code: SCRIPT_CODE, storage: { prim: "Unit" } };
        },
      },
      tz: {
        async getBalance() {
          return { toString: () => "5000000" };
        },
      },
      contract: {
        async originate() {
          return {
            hash: ORIGINATION_HASH,
            contractAddress: CONTRACT,
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
        batch() {
          return {
            withContractCall(call: unknown) {
              batchCalls.push(call);
              return this;
            },
            async send() {
              return {
                hash: BATCH_HASH,
                async confirmation() {
                  return 1;
                },
              };
            },
          };
        },
      },
      estimate: {
        async transfer() {
          return {
            gasLimit: 6_909,
            storageLimit: 379,
            suggestedFeeMutez: 977,
            minimalFeeMutez: 957,
            burnFeeMutez: 94_750,
          };
        },
      },
    } as any,
  };
}

test("active protocol reads are head-only, validated, and receipt-free", async () => {
  const { tezos } = fakeTezos();
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set(),
    allowedEntrypoints: new Set(),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
  });
  assert.deepEqual(
    await session.handle(createBridgeRequest("active_protocol", { block: "head" })),
    { block: "head", chainId: CHAIN_ID, protocol: PROTOCOL },
  );
  assert.equal(
    session.getReceipts().length,
    0,
    "active protocol identity is a read-only preflight and must not create a signer receipt",
  );
  await assert.rejects(
    session.handle(createBridgeRequest("active_protocol", { block: "42" })),
    /restricted to head/,
  );
  await assert.rejects(
    session.handle(createBridgeRequest("active_protocol", { block: "head", extra: true })),
    /contain exactly block/,
  );
});

test("script-code hash reads are exact, session-authorized, bounded, and receipt-free", async () => {
  const { tezos } = fakeTezos();
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
  });

  const result = await session.handle(createBridgeRequest("script_code_hash", { contractAddress: CONTRACT })) as any;
  assert.deepEqual(result, {
    contractAddress: CONTRACT,
    chainId: CHAIN_ID,
    codeHash: hashMichelsonScriptCode(SCRIPT_CODE),
  });
  assert.equal(session.getReceipts().length, 0, "read-only script identity must not create a signer receipt");
  const reorderedSession = new TaquitoPastaUiLiveSession({
    tezos: {
      ...tezos,
      rpc: { getScript: async () => ({ code: [SCRIPT_CODE[2], SCRIPT_CODE[0], SCRIPT_CODE[1]], storage: { prim: "Unit" } }) },
    } as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
  });
  const reorderedResult = await reorderedSession.handle(createBridgeRequest("script_code_hash", { contractAddress: CONTRACT })) as any;
  assert.equal(reorderedResult.codeHash, result.codeHash, "protocol-normalized section order changed the bridge code identity");
  await assert.rejects(
    session.handle(createBridgeRequest("script_code_hash", {
      contractAddress: "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i",
    })),
    /not authorized for this UI-live session/,
  );

  const malformed = new TaquitoPastaUiLiveSession({
    tezos: {
      ...tezos,
      rpc: { getScript: async () => ({ code: { prim: "not-an-array" } }) },
    } as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
  });
  await assert.rejects(
    malformed.handle(createBridgeRequest("script_code_hash", { contractAddress: CONTRACT })),
    /script code must be a non-empty array/,
  );

  const oversized = new TaquitoPastaUiLiveSession({
    tezos: {
      ...tezos,
      rpc: { getScript: async () => ({ code: [{ prim: "code", bytes: "a".repeat(2_000_001) }] }) },
    } as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
  });
  await assert.rejects(
    oversized.handle(createBridgeRequest("script_code_hash", { contractAddress: CONTRACT })),
    /script code exceeds .* bytes/,
  );
});

test("browser proxy exposes only a validated script-code hash read", async () => {
  const source = buildPastaUiLiveProxyInstallerSource("http://127.0.0.1:4321", "a".repeat(64), "UI-MOCK");
  let toolkit: any;
  let requestedAction = "";
  const windowMock: any = {
    MD: { useToolkitAdapter(value: unknown) { toolkit = value; } },
    TZ: { MichelsonMap: class {} },
  };
  const fetchMock = async (_url: string, input: { body: string }) => {
    requestedAction = JSON.parse(input.body).action;
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { codeHash: "not-a-hash" } }),
    };
  };
  new Function("window", "fetch", source)(windowMock, fetchMock);
  await assert.rejects(toolkit.rpc.getScriptCodeHash(CONTRACT), /invalid script-code hash/);
  assert.equal(requestedAction, "script_code_hash");
  assert.equal(windowMock.__pastaUiLiveBridge.receipts.length, 0);
});

test("browser proxy exposes only the bounded active-head block header read", async () => {
  const source = buildPastaUiLiveProxyInstallerSource(
    "http://127.0.0.1:4173",
    "session-token",
    "UI-MOCK",
  );
  let toolkit: any;
  const requested: any[] = [];
  const windowMock: any = {
    MD: { useToolkitAdapter(value: unknown) { toolkit = value; } },
    TZ: { MichelsonMap: class {} },
  };
  const fetchMock = async (_url: string, input: { body: string }) => {
    requested.push(JSON.parse(input.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          block: "head",
          chainId: CHAIN_ID,
          timestamp: "2026-08-13T14:00:00Z",
          level: 4_603_700,
        },
      }),
    };
  };
  new Function("window", "fetch", source)(windowMock, fetchMock);
  assert.deepEqual(await toolkit.rpc.getBlockHeader(), {
    timestamp: "2026-08-13T14:00:00Z",
    level: 4_603_700,
  });
  assert.equal(requested.at(-1)?.action, "block_header");
  assert.deepEqual(requested.at(-1)?.payload, { block: "head" });
  await assert.rejects(
    toolkit.rpc.getBlockHeader({ block: "42" }),
    /permits only the active head block-header read/,
  );
});

test("browser proxy exposes only the active head protocol read", async () => {
  const source = buildPastaUiLiveProxyInstallerSource(
    "http://127.0.0.1:4321",
    "a".repeat(64),
    "UI-MOCK",
  );
  let toolkit: any;
  const requested: any[] = [];
  const windowMock: any = {
    MD: { useToolkitAdapter(value: unknown) { toolkit = value; } },
    TZ: { MichelsonMap: class {} },
  };
  const fetchMock = async (_url: string, input: { body: string }) => {
    requested.push(JSON.parse(input.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { block: "head", chainId: CHAIN_ID, protocol: PROTOCOL },
      }),
    };
  };
  new Function("window", "fetch", source)(windowMock, fetchMock);
  assert.deepEqual(await toolkit.rpc.getBlock({ block: "head" }), {
    protocol: PROTOCOL,
  });
  assert.equal(requested.at(-1)?.action, "active_protocol");
  assert.deepEqual(requested.at(-1)?.payload, { block: "head" });
  await assert.rejects(
    toolkit.rpc.getBlock({ block: "42" }),
    /permits only the active head protocol read/,
  );
  assert.equal(windowMock.__pastaUiLiveBridge.receipts.length, 0);
});

test("contract lookup exposes only bounded plain Micheline entrypoint schemas", async () => {
  const { tezos } = fakeTezos();
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async ({ fileName }) => pinProof(fileName),
    assertOperationApplied: async () => undefined,
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 4_000_000,
    estimatedOriginationMutez: 3_000_000,
    operationReserveMutez: 1_000_000,
  });
  await session.handle(createBridgeRequest("originate", { code: [], storage: {} }));
  const result = await session.handle(createBridgeRequest("contract_at", { contractAddress: CONTRACT })) as any;
  assert.deepEqual(result.entrypoints, {
    create_token: {
      prim: "pair",
      args: [
        { prim: "nat", annots: ["%token_id"] },
        { prim: "option", args: [{ prim: "timestamp" }], annots: ["%child_expiry"] },
      ],
    },
  });
  assert.equal(JSON.stringify(result).includes("mustNotCrossBridge"), false);

  const proxySource = buildPastaUiLiveProxyInstallerSource("http://127.0.0.1:4567", "session-token-123456", "UI-MOCK");
  assert.match(proxySource, /entrypoints: \{ entrypoints: entrypoints \|\| \{\} \}/);
  assert.match(proxySource, /contractProxy\(contractAddress, result\.entrypoints\)/);
});

test("authorized on-chain views are actor-bound, deterministic, and audited outside write receipts", async () => {
  const routerContract = "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i";
  const calls: Array<{ params: unknown; options: unknown }> = [];
  const observedReceipts: unknown[] = [];
  let forbiddenMutationCalls = 0;
  const contract = {
    contractViews: {
      get_pack_status: (params: unknown) => ({
        async executeView(options: unknown) {
          calls.push({ params, options });
          return {
            max_supply: 3,
            reveal_deadline: { Some: "2026-08-01T00:00:00.000Z" },
          };
        },
      }),
    },
    methodsObject: {
      get_pack_status: () => {
        forbiddenMutationCalls += 1;
        return { send: async () => { throw new Error("must not sign"); } };
      },
    },
    async storage() {
      forbiddenMutationCalls += 1;
      throw new Error("view path must not read or mutate storage through the abstraction");
    },
  };
  const tezos = {
    tz: {
      async getBalance() {
        forbiddenMutationCalls += 1;
        throw new Error("view path must not run a funding or transfer check");
      },
    },
    contract: {
      async at(address: string) {
        assert.equal(address, CONTRACT);
        return contract;
      },
      async originate() {
        forbiddenMutationCalls += 1;
        throw new Error("view path must not originate");
      },
      batch() {
        forbiddenMutationCalls += 1;
        throw new Error("view path must not batch");
      },
    },
  };
  const makeSession = () => new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT, routerContract]),
    allowedEntrypoints: new Set(["get_pack_status"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    onViewReceipt: async (receipt) => { observedReceipts.push({ ...receipt }); },
  });
  const request = createBridgeRequest("execute_view", {
    contractAddress: CONTRACT,
    viewName: "get_pack_status",
    params: {
      pack_contract: CONTRACT,
      pack_token_id: { __pastaBridgeType: "bigint", value: "7" },
    },
    options: { viewCaller: CREATOR },
  });

  const firstSession = makeSession();
  firstSession.authorizeContractViews({
    contractAddress: CONTRACT,
    viewNames: new Set(["get_pack_status"]),
    allowSessionSigner: true,
    allowedCallerContractAddresses: new Set([routerContract]),
  });
  const first = await firstSession.handle(request) as any;
  const secondSession = makeSession();
  secondSession.authorizeContractViews({
    contractAddress: CONTRACT,
    viewNames: new Set(["get_pack_status"]),
    allowSessionSigner: true,
    allowedCallerContractAddresses: new Set([routerContract]),
  });
  const second = await secondSession.handle(request) as any;
  const preConnect = await firstSession.handle(createBridgeRequest("execute_view", {
    ...request.payload as object,
    options: { viewCaller: routerContract },
  })) as any;

  assert.deepEqual(first.value, {
    max_supply: 3,
    reveal_deadline: { Some: "2026-08-01T00:00:00.000Z" },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    {
      params: { pack_contract: CONTRACT, pack_token_id: "7" },
      options: { viewCaller: CREATOR },
    },
    {
      params: { pack_contract: CONTRACT, pack_token_id: "7" },
      options: { viewCaller: CREATOR },
    },
    {
      params: { pack_contract: CONTRACT, pack_token_id: "7" },
      options: { viewCaller: routerContract },
    },
  ]);
  assert.deepEqual(first.viewReceipt, second.viewReceipt, "identical view calls must produce identical audit receipts");
  assert.deepEqual(first.viewReceipt, {
    schema: PASTA_UI_LIVE_VIEW_RECEIPT_SCHEMA,
    sequence: 1,
    action: "execute_view",
    chainId: CHAIN_ID,
    viewCaller: CREATOR,
    contractAddress: CONTRACT,
    viewName: "get_pack_status",
    requestSha256: first.viewReceipt.requestSha256,
    resultSha256: first.viewReceipt.resultSha256,
  });
  assert.match(first.viewReceipt.requestSha256, /^[0-9a-f]{64}$/);
  assert.match(first.viewReceipt.resultSha256, /^[0-9a-f]{64}$/);
  assert.equal("timestampUtc" in first.viewReceipt, false);
  assert.equal("operationHash" in first.viewReceipt, false);
  assert.equal("receipt" in first, false);
  assert.equal(firstSession.getReceipts().length, 0, "read-only views must not enter the chain-write receipt stream");
  assert.deepEqual(firstSession.getViewReceipts(), [first.viewReceipt, preConnect.viewReceipt]);
  assert.equal(preConnect.viewReceipt.viewCaller, routerContract);
  assert.equal(observedReceipts.length, 3);
  assert.equal(forbiddenMutationCalls, 0);
});

test("on-chain view execution fails closed for contract, view, method, caller, and payload drift", async () => {
  const unknownContract = "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i";
  let methodCalls = 0;
  let viewCalls = 0;
  const contract = {
    contractViews: {
      get_pack_status: () => ({
        async executeView() {
          viewCalls += 1;
          return { max_supply: 1 };
        },
      }),
      malformed_view: () => ({
        async send() {
          methodCalls += 1;
          throw new Error("must not send");
        },
      }),
    },
    methodsObject: {
      method_spoof: () => {
        methodCalls += 1;
        return { send: async () => undefined };
      },
      entrypoint_only: () => {
        methodCalls += 1;
        return { send: async () => undefined };
      },
    },
  };
  const tezos = {
    contract: { at: async () => contract },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["entrypoint_only", "method_spoof"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
  });
  session.authorizeContractViews({
    contractAddress: CONTRACT,
    viewNames: new Set(["get_pack_status", "missing_view", "method_spoof", "malformed_view"]),
    allowSessionSigner: true,
  });
  assert.throws(
    () => session.authorizeContractViews({
      contractAddress: unknownContract,
      viewNames: new Set(["get_pack_status"]),
      allowSessionSigner: true,
    }),
    /not authorized for this UI-live session/,
  );
  assert.throws(
    () => session.authorizeContractViews({
      contractAddress: CONTRACT,
      viewNames: new Set(["get_pack_status"]),
      allowedCallerContractAddresses: new Set([unknownContract]),
    }),
    /not authorized for this UI-live session/,
  );
  assert.throws(
    () => session.authorizeContractViews({
      contractAddress: CONTRACT,
      viewNames: new Set(["get_pack_status"]),
    }),
    /requires the session signer or an authorized caller contract/,
  );
  const payload = {
    contractAddress: CONTRACT,
    viewName: "get_pack_status",
    params: { pack_token_id: 0 },
    options: { viewCaller: CREATOR },
  };

  await assert.rejects(
    session.handle(createBridgeRequest("execute_view", { ...payload, contractAddress: unknownContract })),
    /not authorized for this UI-live session/,
  );
  await assert.rejects(
    session.handle(createBridgeRequest("execute_view", { ...payload, viewName: "unknown_view" })),
    /contract view is not allowed/,
  );
  await assert.rejects(
    session.handle(createBridgeRequest("execute_view", { ...payload, method: "method_spoof" })),
    /must contain exactly contractAddress, viewName, params, options/,
  );
  await assert.rejects(
    session.handle(createBridgeRequest("execute_view", { ...payload, viewName: "method_spoof" })),
    /does not expose allowed on-chain view method_spoof/,
  );
  await assert.rejects(
    session.handle(createBridgeRequest("execute_view", {
      ...payload,
      options: { viewCaller: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej" },
    })),
    /is not authorized for .*get_pack_status/,
  );
  await assert.rejects(
    session.handle(createBridgeRequest("execute_view", { ...payload, params: () => "not JSON" })),
    /unsupported value/,
  );
  await assert.rejects(
    session.handle(createBridgeRequest("execute_view", {
      ...payload,
      options: { viewCaller: CREATOR, amount: 1, mutez: true },
    })),
    /contract view options must contain exactly viewCaller/,
  );
  await assert.rejects(
    session.handle(createBridgeRequest("execute_view", { ...payload, viewName: "entrypoint_only" })),
    /contract view is not allowed/,
  );
  await assert.rejects(
    session.handle(createBridgeRequest("execute_view", { ...payload, viewName: "malformed_view" })),
    /on-chain view malformed_view is not executable/,
  );
  assert.equal(methodCalls, 0, "the view action must never fall back to an entrypoint method or send");
  assert.equal(viewCalls, 0);
  assert.equal(session.getReceipts().length, 0);
  assert.equal(session.getViewReceipts().length, 0);
});

test("dynamic read-only contract authorization never promotes a contract into signer operations", async () => {
  let methodCalls = 0;
  let estimateCalls = 0;
  let batchCalls = 0;
  const viewCalls: Array<{ params: unknown; options: unknown }> = [];
  const contract = {
    entrypoints: { entrypoints: { get_reserved: { prim: "nat" } } },
    contractViews: {
      get_reserved: (params: unknown) => ({
        async executeView(options: unknown) {
          viewCalls.push({ params, options });
          return 2;
        },
      }),
    },
    methodsObject: {
      get_reserved: () => {
        methodCalls += 1;
        return {
          toTransferParams: () => ({ to: CONTRACT }),
          send: async () => { throw new Error("read-only contract must not send"); },
        };
      },
    },
    async storage() {
      return { next_resource_id: 3 };
    },
  };
  const tezos = {
    rpc: {
      async getScript(address: string) {
        assert.equal(address, CONTRACT);
        return { code: SCRIPT_CODE, storage: { prim: "Unit" } };
      },
    },
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      at: async (address: string) => {
        assert.equal(address, CONTRACT);
        return contract;
      },
      batch() {
        batchCalls += 1;
        throw new Error("read-only contract must not enter batch construction");
      },
    },
    estimate: {
      transfer: async () => {
        estimateCalls += 1;
        throw new Error("read-only contract must not enter estimation");
      },
    },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["get_reserved"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
  });

  await assert.rejects(
    session.handle(createBridgeRequest("read_storage", { contractAddress: CONTRACT })),
    /not authorized for this UI-live session/,
  );
  assert.throws(
    () => session.authorizeReadOnlyContract({
      contractAddress: CONTRACT,
      promoteToWriter: true,
    } as any),
    /must contain exactly contractAddress/,
  );
  session.authorizeReadOnlyContract({ contractAddress: CONTRACT });
  session.authorizeContractViews({
    contractAddress: CONTRACT,
    viewNames: new Set(["get_reserved"]),
    allowSessionSigner: true,
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  const lookup = await session.handle(createBridgeRequest("contract_at", { contractAddress: CONTRACT })) as any;
  const storage = await session.handle(createBridgeRequest("read_storage", { contractAddress: CONTRACT })) as any;
  const identity = await session.handle(createBridgeRequest("script_code_hash", { contractAddress: CONTRACT })) as any;
  const view = await session.handle(createBridgeRequest("execute_view", {
    contractAddress: CONTRACT,
    viewName: "get_reserved",
    params: { resource_id: 2 },
    options: { viewCaller: CREATOR },
  })) as any;

  assert.deepEqual(lookup.entrypoints, { get_reserved: { prim: "nat" } });
  assert.deepEqual(storage.storage, { next_resource_id: 3 });
  assert.match(identity.codeHash, /^[0-9a-f]{64}$/);
  assert.equal(view.value, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(viewCalls)), [{
    params: { resource_id: 2 },
    options: { viewCaller: CREATOR },
  }]);

  for (const request of [
    createBridgeRequest("call", {
      call: { contractAddress: CONTRACT, entrypoint: "get_reserved", payload: { resource_id: 2 } },
      sendOptions: {},
    }),
    createBridgeRequest("estimate_call", {
      call: { contractAddress: CONTRACT, entrypoint: "get_reserved", payload: { resource_id: 2 } },
      sendOptions: {},
    }),
    createBridgeRequest("batch", {
      calls: [{ contractAddress: CONTRACT, entrypoint: "get_reserved", payload: { resource_id: 2 } }],
    }),
  ]) {
    await assert.rejects(session.handle(request), /not authorized for this UI-live session/);
  }
  assert.equal(methodCalls, 0);
  assert.equal(estimateCalls, 0);
  assert.equal(batchCalls, 0);
  assert.equal(session.getReceipts().length, 0);
  assert.equal(session.getViewReceipts().length, 1);
});

test("browser contract proxies expose only the session-bound execute_view shape", async () => {
  const source = buildPastaUiLiveProxyInstallerSource("http://127.0.0.1:4321", "a".repeat(64), "UI-MOCK");
  let toolkit: any;
  const requests: any[] = [];
  const windowMock: any = {
    MD: { useToolkitAdapter(value: unknown) { toolkit = value; } },
    TZ: { MichelsonMap: class {} },
  };
  const viewReceipt = {
    schema: PASTA_UI_LIVE_VIEW_RECEIPT_SCHEMA,
    sequence: 1,
    action: "execute_view",
    chainId: CHAIN_ID,
    viewCaller: CREATOR,
    contractAddress: CONTRACT,
    viewName: "get_pack_status",
    requestSha256: "1".repeat(64),
    resultSha256: "2".repeat(64),
  };
  const fetchMock = async (_url: string, input: { body: string }) => {
    const request = JSON.parse(input.body);
    requests.push(request);
    const result = request.action === "contract_at"
      ? { contractAddress: CONTRACT, chainId: CHAIN_ID, entrypoints: {} }
      : {
          contractAddress: CONTRACT,
          chainId: CHAIN_ID,
          viewName: "get_pack_status",
          value: { max_supply: 3 },
          viewReceipt,
        };
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result }),
    };
  };
  new Function("window", "fetch", source)(windowMock, fetchMock);

  const contract = await toolkit.contract.at(CONTRACT);
  const result = await contract.contractViews.get_pack_status({ pack_token_id: 0 })
    .executeView({ viewCaller: CREATOR });
  assert.deepEqual(result, { max_supply: 3 });
  assert.deepEqual(requests.map((request) => request.action), ["contract_at", "execute_view"]);
  assert.deepEqual(requests[1].payload, {
    contractAddress: CONTRACT,
    viewName: "get_pack_status",
    params: { pack_token_id: 0 },
    options: { viewCaller: CREATOR },
  });
  assert.deepEqual(windowMock.__pastaUiLiveBridge.viewReceipts, [viewReceipt]);
  assert.deepEqual(windowMock.__pastaUiLiveBridge.receipts, []);
  assert.equal(Object.isFrozen(windowMock.__pastaUiLiveBridge), true);
  assert.equal(windowMock.__pastaUiLiveBridge.authorizeReadOnlyContract, undefined);
  assert.doesNotMatch(source, /authorizeReadOnlyContract|authorize_read_only_contract/);

  await assert.rejects(
    contract.contractViews.get_pack_status({ pack_token_id: 0 })
      .executeView({ viewCaller: CREATOR, amount: 1 }),
    /permit only viewCaller/,
  );
  assert.equal(requests.length, 2, "malformed options must fail before reaching the bridge");
});

test("loopback server serves static files and rejects cross-origin or unauthenticated bridge posts", async () => {
  const staticRoot = await mkdtemp(path.join(tmpdir(), "pasta-ui-live-static-"));
  await writeFile(path.join(staticRoot, "index.html"), "<!doctype html><h1>Spaghetti fixture</h1>");
  const actions: string[] = [];
  const server = await startPastaUiLiveLoopbackServer({
    staticRoot,
    handleAction: async (request) => {
      actions.push(request.action);
      return { chainId: CHAIN_ID };
    },
  });
  try {
    const page = await fetch(`${server.origin}/index.html`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Spaghetti fixture/);

    const request = createBridgeRequest("chain_check", {});
    const wrongOrigin = await fetch(`${server.origin}/__pasta-proof/bridge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://attacker.invalid",
        "x-pasta-proof-session": server.sessionToken,
      },
      body: JSON.stringify(request),
    });
    assert.equal(wrongOrigin.status, 403);

    const wrongToken = await fetch(`${server.origin}/__pasta-proof/bridge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: server.origin,
        "x-pasta-proof-session": "not-the-session",
      },
      body: JSON.stringify(request),
    });
    assert.equal(wrongToken.status, 403);

    const accepted = await fetch(`${server.origin}/__pasta-proof/bridge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: server.origin,
        "x-pasta-proof-session": server.sessionToken,
      },
      body: JSON.stringify(request),
    });
    assert.equal(accepted.status, 200);
    const acceptedBody = await accepted.json();
    assert.equal(acceptedBody.schema, PASTA_UI_LIVE_BRIDGE_SCHEMA);
    assert.equal(acceptedBody.result.chainId, CHAIN_ID);
    assert.equal(JSON.stringify(acceptedBody).includes(server.sessionToken), false);
    assert.deepEqual(actions, ["chain_check"]);
  } finally {
    await server.close();
    await rm(staticRoot, { recursive: true, force: true });
  }
});

test("Taquito session blocks pins and writes until an adequate Node-only funding authorization", async () => {
  const { tezos } = fakeTezos();
  let chainChecks = 0;
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => {
      chainChecks += 1;
      return CHAIN_ID;
    },
    pinJson: async ({ fileName }) => pinProof(fileName),
  });

  await assert.rejects(
    session.handle(createBridgeRequest("pin_json", { value: { name: "blocked" }, fileName: "metadata.json" })),
    (error: unknown) => error instanceof PastaUiLiveBridgeError && /funding preflight has not authorized/.test(error.message),
  );
  await assert.rejects(
    async () => session.authorizeAfterFundingPreflight({
      balanceMutez: 100,
      requiredBalanceMutez: 200,
      estimatedOriginationMutez: 100,
      operationReserveMutez: 100,
    }),
    /funding preflight failed/,
  );
  assert.equal(chainChecks, 0, "a blocked pin must not progress into a chain or pinner action");

  session.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 4_000_000,
    estimatedOriginationMutez: 3_000_000,
    operationReserveMutez: 1_000_000,
  });
  const pinned = await session.handle(createBridgeRequest("pin_json", {
    value: { name: "allowed" },
    fileName: "metadata.json",
  })) as any;
  assert.equal(pinned.pin.cid, CID);
  assert.equal(pinned.receipt.signerAddress, CREATOR);
  assert.equal(chainChecks, 1);
});

test("Taquito session runs the pin preflight before the external pinner and stops rejected bytes", async () => {
  const { tezos } = fakeTezos();
  const stages: string[] = [];
  let reject = true;
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(),
    assertExpectedChain: async () => CHAIN_ID,
    beforePin: async ({ fileName, mimeType, value, bytes }) => {
      stages.push(`before:${fileName}:${mimeType}:${bytes.byteLength}:${String((value as any)?.schema || "ordinary")}`);
      if (reject) throw new Error("intentional public reveal rejected before pin");
    },
    pinJson: async ({ fileName }) => {
      stages.push(`pin:${fileName}`);
      return pinProof(fileName);
    },
    onPin: async ({ proof }) => { stages.push(`after:${proof.fileName}`); },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 4_000_000,
    estimatedOriginationMutez: 3_000_000,
    operationReserveMutez: 1_000_000,
  });

  const request = createBridgeRequest("pin_json", {
    value: { schema: "pasta-ravioli-public-reveal@1", tokenId: 1 },
    fileName: "ravioli-public-reveal-1.json",
  });
  await assert.rejects(session.handle(request), /rejected before pin/);
  assert.equal(stages.length, 1, "a rejected preflight must not call the pinner or post-pin hook");

  reject = false;
  await session.handle(request);
  assert.match(stages[1], /^before:ravioli-public-reveal-1\.json:application\/json:/);
  assert.deepEqual(stages.slice(2), [
    "pin:ravioli-public-reveal-1.json",
    "after:ravioli-public-reveal-1.json",
  ]);
});

test("Taquito session rechecks Shadownet before each signer operation and emits public-only receipts", async () => {
  const { tezos, batchCalls } = fakeTezos();
  const stages: string[] = [];
  const appliedChecks: Array<{ action: string; operationHash: string; contractAddress?: string; entrypoints: string[] }> = [];
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async (stage) => {
      stages.push(stage);
      return CHAIN_ID;
    },
    pinJson: async ({ fileName }) => pinProof(fileName),
    assertOperationApplied: async (input) => { appliedChecks.push(input); },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 4_000_000,
    estimatedOriginationMutez: 3_000_000,
    operationReserveMutez: 1_000_000,
  });

  const originated = await session.handle(createBridgeRequest("originate", {
    code: [{ prim: "storage" }],
    storage: { administrator: CREATOR },
  })) as any;
  assert.equal(originated.contractAddress, CONTRACT);
  assert.equal(originated.operationHash, ORIGINATION_HASH);

  const tokenInfo = {
    __pastaBridgeType: "map",
    entries: [["", "697066733a2f2fproof"]],
  };
  const batch = await session.handle(createBridgeRequest("batch", {
    calls: [{ contractAddress: CONTRACT, entrypoint: "create_token", payload: tokenInfo }],
  })) as any;
  assert.equal(batch.operationHash, BATCH_HASH);
  assert.equal(batchCalls.length, 1);
  assert.ok((batchCalls[0] as { payload: unknown }).payload instanceof MichelsonMap);
  assert.deepEqual(stages, ["before UI-live origination", "before UI-live batch"]);
  assert.deepEqual(appliedChecks, [
    { action: "originate", operationHash: ORIGINATION_HASH, contractAddress: CONTRACT, entrypoints: [] },
    { action: "batch", operationHash: BATCH_HASH, contractAddress: CONTRACT, entrypoints: ["create_token"] },
  ]);

  const receipts = session.getReceipts();
  assert.deepEqual(receipts.map((receipt) => receipt.action), ["originate", "batch"]);
  assert.equal(receipts[0].contractAddress, CONTRACT);
  assert.deepEqual(receipts[1].entrypoints, ["create_token"]);
  const serialized = JSON.stringify(receipts);
  assert.doesNotMatch(serialized, /edsk|private.?key|mnemonic|sessionToken/i);
});

test("Taquito session does not emit a success receipt when applied-status verification rejects", async () => {
  const authorized = "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i";
  const operation = {
    hash: "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq",
    confirmation: async () => 1,
  };
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      at: async () => ({
        methodsObject: {
          buy: () => ({ send: async () => operation }),
        },
      }),
    },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej",
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([authorized]),
    allowedEntrypoints: new Set(["buy"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async () => { throw new Error("indexed as backtracked: storage_exhausted.operation"); },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });
  await assert.rejects(
    session.handle(createBridgeRequest("call", {
      call: { contractAddress: authorized, entrypoint: "buy", payload: 1 },
      sendOptions: {},
    })),
    /indexed as backtracked/,
  );
  assert.equal(session.getReceipts().length, 0);
});

test("signer-operation hooks bracket every sender with a sequence independent from public receipts", async () => {
  const order: string[] = [];
  const preparedEvents: PastaUiLivePreparedOperation[] = [];
  const submittedEvents: PastaUiLiveSubmittedOperation[] = [];
  const contract = {
    address: CONTRACT,
    methodsObject: {
      create_token: () => {
        order.push("prepare:call");
        return {
          async send() {
            order.push("submit:call");
            return {
              hash: CALL_HASH,
              async confirmation() {
                order.push("confirm:call");
                return 1;
              },
            };
          },
        };
      },
    },
  };
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      async originate() {
        order.push("submit:originate");
        return {
          hash: ORIGINATION_HASH,
          contractAddress: CONTRACT,
          async confirmation() {
            order.push("confirm:originate");
            return 1;
          },
          async contract() {
            return contract;
          },
        };
      },
      async at() {
        return contract;
      },
      batch() {
        return {
          withContractCall() {
            order.push("prepare:batch");
            return this;
          },
          async send() {
            order.push("submit:batch");
            return {
              hash: BATCH_HASH,
              async confirmation() {
                order.push("confirm:batch");
                return 1;
              },
            };
          },
        };
      },
    },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async () => undefined,
    validateOrigination: async () => { order.push("validate:originate"); },
    validateCall: async () => { order.push("validate:call"); },
    beforeOperationSubmit: async (operation) => {
      await Promise.resolve();
      preparedEvents.push(operation);
      order.push(`hook:${operation.status.toLowerCase()}:${operation.action}`);
    },
    onOperationSubmitted: async (operation) => {
      await Promise.resolve();
      submittedEvents.push(operation);
      order.push(`hook:${operation.status.toLowerCase()}:${operation.action}`);
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  await session.handle(createBridgeRequest("chain_check", {}));
  await session.handle(createBridgeRequest("originate", { code: [], storage: {} }));
  await session.handle(createBridgeRequest("batch", {
    calls: [{ contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } }],
  }));
  await session.handle(createBridgeRequest("call", {
    call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 1 } },
    sendOptions: {},
  }));

  assert.deepEqual(order, [
    "validate:originate",
    "hook:prepared:originate",
    "submit:originate",
    "hook:submitted:originate",
    "validate:call",
    "prepare:call",
    "prepare:batch",
    "hook:prepared:batch",
    "submit:batch",
    "hook:submitted:batch",
    "validate:call",
    "prepare:call",
    "hook:prepared:call",
    "submit:call",
    "hook:submitted:call",
  ]);
  assert.deepEqual(preparedEvents.map(({ action, operationSequence, status }) => ({ action, operationSequence, status })), [
    { action: "originate", operationSequence: 1, status: "PREPARED" },
    { action: "batch", operationSequence: 2, status: "PREPARED" },
    { action: "call", operationSequence: 3, status: "PREPARED" },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(preparedEvents.map((operation) => operation.descriptor))), [
    { kind: "originate", code: [], storage: {} },
    {
      kind: "batch",
      calls: [{ contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } }],
    },
    {
      kind: "call",
      call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 1 } },
      sendOptions: {},
    },
  ]);
  assert.deepEqual(
    submittedEvents.map(({ action, operationSequence, status, operationHash }) => ({ action, operationSequence, status, operationHash })),
    [
      { action: "originate", operationSequence: 1, status: "SUBMITTED", operationHash: ORIGINATION_HASH },
      { action: "batch", operationSequence: 2, status: "SUBMITTED", operationHash: BATCH_HASH },
      { action: "call", operationSequence: 3, status: "SUBMITTED", operationHash: CALL_HASH },
    ],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(submittedEvents.map((operation) => operation.descriptor))),
    JSON.parse(JSON.stringify(preparedEvents.map((operation) => operation.descriptor))),
  );
  assert.deepEqual(session.getReceipts().map(({ action, sequence }) => ({ action, sequence })), [
    { action: "chain_check", sequence: 1 },
    { action: "originate", sequence: 2 },
    { action: "batch", sequence: 3 },
    { action: "call", sequence: 4 },
  ]);
});

test("a resumed session continues from a validated initial operation sequence", async () => {
  const { tezos } = fakeTezos();
  const preparedSequences: number[] = [];
  const submittedSequences: number[] = [];
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["create_token"]),
    initialOperationSequence: 1,
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async () => undefined,
    beforeOperationSubmit: async ({ operationSequence }) => { preparedSequences.push(operationSequence); },
    onOperationSubmitted: async ({ operationSequence }) => { submittedSequences.push(operationSequence); },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  await session.handle(createBridgeRequest("batch", {
    calls: [{ contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 1 } }],
  }));

  assert.deepEqual(preparedSequences, [2]);
  assert.deepEqual(submittedSequences, [2]);
});

test("a session rejects an invalid initial operation sequence", () => {
  const { tezos } = fakeTezos();
  for (const initialOperationSequence of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    assert.throws(
      () => new TaquitoPastaUiLiveSession({
        tezos,
        signerAddress: CREATOR,
        expectedChainId: CHAIN_ID,
        allowedEntrypoints: new Set(),
        initialOperationSequence,
        assertExpectedChain: async () => CHAIN_ID,
        pinJson: async () => { throw new Error("not used"); },
      }),
      /initial operation sequence must be a safe integer >= 0/,
    );
  }
});

test("a resumed session continues public receipts from a validated initial receipt sequence", async () => {
  const { tezos } = fakeTezos();
  const emittedSequences: number[] = [];
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(),
    initialReceiptSequence: 3,
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    onReceipt: async ({ sequence }) => { emittedSequences.push(sequence); },
  });

  const result = await session.handle(createBridgeRequest("connect", {})) as any;

  assert.equal(result.receipt.action, "connect");
  assert.equal(result.receipt.sequence, 4);
  assert.deepEqual(emittedSequences, [4]);
  assert.deepEqual(session.getReceipts().map(({ action, sequence }) => ({ action, sequence })), [
    { action: "connect", sequence: 4 },
  ]);
});

test("a session rejects an invalid initial receipt sequence", () => {
  const { tezos } = fakeTezos();
  for (const initialReceiptSequence of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    assert.throws(
      () => new TaquitoPastaUiLiveSession({
        tezos,
        signerAddress: CREATOR,
        expectedChainId: CHAIN_ID,
        allowedEntrypoints: new Set(),
        initialReceiptSequence,
        assertExpectedChain: async () => CHAIN_ID,
        pinJson: async () => { throw new Error("not used"); },
      }),
      /initial receipt sequence must be a safe integer >= 0/,
    );
  }
});

test("a PREPARED hook failure prevents origination, batch, and call submission", async () => {
  const submissions = { originate: 0, batch: 0, call: 0 };
  const contract = {
    methodsObject: {
      create_token: () => ({
        async send() {
          submissions.call += 1;
          throw new Error("unexpected call submission");
        },
      }),
    },
  };
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      async originate() {
        submissions.originate += 1;
        throw new Error("unexpected origination submission");
      },
      async at() {
        return contract;
      },
      batch() {
        return {
          withContractCall() { return this; },
          async send() {
            submissions.batch += 1;
            throw new Error("unexpected batch submission");
          },
        };
      },
    },
  };

  for (const action of ["originate", "batch", "call"] as const) {
    const session = new TaquitoPastaUiLiveSession({
      tezos: tezos as any,
      signerAddress: CREATOR,
      expectedChainId: CHAIN_ID,
      allowedContractAddresses: new Set([CONTRACT]),
      allowedEntrypoints: new Set(["create_token"]),
      assertExpectedChain: async () => CHAIN_ID,
      pinJson: async () => { throw new Error("not used"); },
      assertOperationApplied: async () => undefined,
      beforeOperationSubmit: async (operation) => {
        assert.equal(operation.action, action);
        assert.equal(operation.status, "PREPARED");
        assert.equal(operation.descriptor.kind, action);
        throw new Error(`journal rejected ${action}`);
      },
    });
    session.authorizeAfterFundingPreflight({
      balanceMutez: 1_000_000,
      requiredBalanceMutez: 50_000,
      estimatedOriginationMutez: 0,
      operationReserveMutez: 50_000,
    });
    const request = action === "originate"
      ? createBridgeRequest("originate", { code: [], storage: {} })
      : action === "batch"
        ? createBridgeRequest("batch", {
            calls: [{ contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } }],
          })
        : createBridgeRequest("call", {
            call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } },
            sendOptions: {},
          });
    await assert.rejects(session.handle(request), new RegExp(`journal rejected ${action}`));
    assert.equal(session.getReceipts().length, 0);
  }
  assert.deepEqual(submissions, { originate: 0, batch: 0, call: 0 });
});

test("a SUBMITTED hook failure preserves one submission and emits no success receipt", async () => {
  let submissions = 0;
  let confirmations = 0;
  const submittedEvents: PastaUiLiveSubmittedOperation[] = [];
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      at: async () => ({
        methodsObject: {
          create_token: () => ({
            async send() {
              submissions += 1;
              return {
                hash: CALL_HASH,
                async confirmation() {
                  confirmations += 1;
                  return 1;
                },
              };
            },
          }),
        },
      }),
    },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async () => undefined,
    onOperationSubmitted: async (operation) => {
      submittedEvents.push(operation);
      throw new Error("submitted journal unavailable");
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  await assert.rejects(
    session.handle(createBridgeRequest("call", {
      call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } },
      sendOptions: {},
    })),
    /submitted journal unavailable/,
  );
  assert.equal(submissions, 1);
  assert.equal(confirmations, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(submittedEvents)), [{
    status: "SUBMITTED",
    operationSequence: 1,
    timestampUtc: submittedEvents[0].timestampUtc,
    action: "call",
    chainId: CHAIN_ID,
    signerAddress: CREATOR,
    contractAddress: CONTRACT,
    entrypoints: ["create_token"],
    descriptor: {
      kind: "call",
      call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } },
      sendOptions: {},
    },
    operationHash: CALL_HASH,
  }]);
  assert.equal(session.getReceipts().length, 0);
});

test("confirmation failure retains the already-emitted SUBMITTED event", async () => {
  const confirmationFailure = new Error("confirmation failed after injection");
  const submittedEvents: PastaUiLiveSubmittedOperation[] = [];
  let submissions = 0;
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      at: async () => ({
        methodsObject: {
          create_token: () => ({
            async send() {
              submissions += 1;
              return {
                hash: CALL_HASH,
                async confirmation() { throw confirmationFailure; },
              };
            },
          }),
        },
      }),
    },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async () => { throw new Error("exact hash remains unresolved"); },
    onOperationSubmitted: async (operation) => { submittedEvents.push(operation); },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  await assert.rejects(
    session.handle(createBridgeRequest("call", {
      call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } },
      sendOptions: {},
    })),
    (error: unknown) => error instanceof PastaUiLiveSubmittedOperationError &&
      error.operationHash === CALL_HASH &&
      error.retrySafe === false,
  );
  assert.equal(submissions, 1);
  assert.equal(submittedEvents.length, 1);
  assert.equal(submittedEvents[0].status, "SUBMITTED");
  assert.equal(submittedEvents[0].operationHash, CALL_HASH);
  assert.equal(session.getReceipts().length, 0);
});

test("exact-hash verification proves originate, batch, and call without entering native confirmation polling", async () => {
  const appliedChecks: Array<{
    action: "originate" | "batch" | "call";
    operationHash: string;
    contractAddress?: string;
    entrypoints: string[];
  }> = [];
  const submissions = { originate: 0, batch: 0, call: 0 };
  const confirmations = { originate: 0, batch: 0, call: 0 };
  let originationContractCalls = 0;
  const contract = {
    address: CONTRACT,
    methodsObject: {
      create_token: () => ({
        async send() {
          submissions.call += 1;
          return {
            hash: CALL_HASH,
            async confirmation() {
              confirmations.call += 1;
              throw confirmationHttp404Error();
            },
          };
        },
      }),
    },
  };
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      async originate() {
        submissions.originate += 1;
        return {
          hash: ORIGINATION_HASH,
          contractAddress: CONTRACT,
          async confirmation() {
            confirmations.originate += 1;
            throw confirmationHttp404Error();
          },
          async contract() {
            originationContractCalls += 1;
            throw new Error("HTTP 404 recovery must not start a second confirmation poll through contract()");
          },
        };
      },
      async at(address: string) {
        assert.equal(address, CONTRACT);
        return contract;
      },
      batch() {
        return {
          withContractCall() { return this; },
          async send() {
            submissions.batch += 1;
            return {
              hash: BATCH_HASH,
              async confirmation() {
                confirmations.batch += 1;
                throw confirmationHttp404Error();
              },
            };
          },
        };
      },
    },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async (input) => { appliedChecks.push(input); },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  await session.handle(createBridgeRequest("originate", { code: [], storage: {} }));
  await session.handle(createBridgeRequest("batch", {
    calls: [{ contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } }],
  }));
  await session.handle(createBridgeRequest("call", {
    call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 1 } },
    sendOptions: {},
  }));

  assert.deepEqual(submissions, { originate: 1, batch: 1, call: 1 });
  assert.deepEqual(confirmations, { originate: 0, batch: 0, call: 0 });
  assert.equal(originationContractCalls, 0);
  assert.deepEqual(appliedChecks, [
    { action: "originate", operationHash: ORIGINATION_HASH, contractAddress: CONTRACT, entrypoints: [] },
    { action: "batch", operationHash: BATCH_HASH, contractAddress: CONTRACT, entrypoints: ["create_token"] },
    { action: "call", operationHash: CALL_HASH, contractAddress: CONTRACT, entrypoints: ["create_token"] },
  ]);
  assert.deepEqual(
    session.getReceipts().map(({ action, operationHash }) => ({ action, operationHash })),
    [
      { action: "originate", operationHash: ORIGINATION_HASH },
      { action: "batch", operationHash: BATCH_HASH },
      { action: "call", operationHash: CALL_HASH },
    ],
    "each applied operation must emit exactly one receipt",
  );
});

test("writer actions fail before send when no exact-hash verifier is configured", async () => {
  const submissions = { originate: 0, batch: 0, call: 0 };
  let confirmations = 0;
  const operation = (hash: string, contractAddress?: string) => ({
    hash,
    ...(contractAddress ? { contractAddress } : {}),
    async confirmation() {
      confirmations += 1;
      return 1;
    },
    async contract() {
      return { address: CONTRACT };
    },
  });
  const contract = {
    methodsObject: {
      create_token: () => ({
        async send() {
          submissions.call += 1;
          return operation(CALL_HASH);
        },
      }),
    },
  };
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      async originate() {
        submissions.originate += 1;
        return operation(ORIGINATION_HASH, CONTRACT);
      },
      async at() {
        return contract;
      },
      batch() {
        return {
          withContractCall() { return this; },
          async send() {
            submissions.batch += 1;
            return operation(BATCH_HASH);
          },
        };
      },
    },
  };

  for (const action of ["originate", "batch", "call"] as const) {
    const prepared: PastaUiLivePreparedOperation[] = [];
    const session = new TaquitoPastaUiLiveSession({
      tezos: tezos as any,
      signerAddress: CREATOR,
      expectedChainId: CHAIN_ID,
      allowedContractAddresses: new Set([CONTRACT]),
      allowedEntrypoints: new Set(["create_token"]),
      assertExpectedChain: async () => CHAIN_ID,
      pinJson: async () => { throw new Error("not used"); },
      beforeOperationSubmit: async (entry) => { prepared.push(entry); },
    });
    session.authorizeAfterFundingPreflight({
      balanceMutez: 1_000_000,
      requiredBalanceMutez: 50_000,
      estimatedOriginationMutez: 0,
      operationReserveMutez: 50_000,
    });
    const request = action === "originate"
      ? createBridgeRequest("originate", { code: [], storage: {} })
      : action === "batch"
        ? createBridgeRequest("batch", {
            calls: [{ contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } }],
          })
        : createBridgeRequest("call", {
            call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } },
            sendOptions: {},
          });
    await assert.rejects(
      session.handle(request),
      (error: unknown) => error instanceof PastaUiLiveBridgeError &&
        error.statusCode === 409 &&
        /exact-hash applied-operation verifier is required before signer submission/.test(error.message),
    );
    assert.equal(prepared.length, 0, "an unrecoverable writer must not enter PREPARED state");
    assert.equal(session.getReceipts().length, 0);
  }
  assert.deepEqual(submissions, { originate: 0, batch: 0, call: 0 });
  assert.equal(confirmations, 0);
});

test("an unresolved exact-hash assertion is a scrubbed structured SUBMITTED no-retry error", async () => {
  let submissions = 0;
  let confirmations = 0;
  let assertions = 0;
  const session = new TaquitoPastaUiLiveSession({
    tezos: {
      tz: { getBalance: async () => ({ toString: () => "1000000" }) },
      contract: {
        at: async () => ({
          methodsObject: {
            create_token: () => ({
              async send() {
                submissions += 1;
                return {
                  hash: CALL_HASH,
                  async confirmation() {
                    confirmations += 1;
                    throw confirmationHttp404Error();
                  },
                };
              },
            }),
          },
        }),
      },
    } as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async () => {
      assertions += 1;
      throw new Error("Bearer abcdefghijklmnopqrstuvwxyz123456 remains unresolved");
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  let caught: unknown;
  try {
    await session.handle(createBridgeRequest("call", {
      call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } },
      sendOptions: {},
    }));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof PastaUiLiveSubmittedOperationError);
  assert.equal(caught.statusCode, 409);
  assert.equal(caught.code, "PASTA_UI_LIVE_OPERATION_SUBMITTED_UNRESOLVED");
  assert.equal(caught.operationStatus, "SUBMITTED");
  assert.equal(caught.retrySafe, false);
  assert.equal(caught.action, "call");
  assert.equal(caught.operationHash, CALL_HASH);
  assert.equal(caught.contractAddress, CONTRACT);
  assert.deepEqual(caught.entrypoints, ["create_token"]);
  assert.match(caught.message, /submitted.*Do not retry or submit this action again/i);
  assert.match(caught.message, /native confirmation polling was bypassed/);
  assert.match(caught.message, /REDACTED/);
  assert.doesNotMatch(caught.message, /do-not-expose-this|abcdefghijklmnopqrstuvwxyz123456/);
  assert.deepEqual({ submissions, confirmations, assertions }, { submissions: 1, confirmations: 0, assertions: 1 });
  assert.equal(session.getReceipts().length, 0);
});

test("Taquito session accepts exact-hash applied assertions without native confirmation polling or resubmission", async () => {
  const appliedChecks: Array<{
    action: "originate" | "batch" | "call";
    operationHash: string;
    contractAddress?: string;
    entrypoints: string[];
  }> = [];
  const submissions = { originate: 0, batch: 0, call: 0 };
  const confirmations = { originate: 0, batch: 0, call: 0 };
  let originationContractCalls = 0;
  const contract = {
    address: CONTRACT,
    methodsObject: {
      create_token: (payload: unknown) => ({
        payload,
        send: async () => {
          submissions.call += 1;
          return {
            hash: CALL_HASH,
            async confirmation() {
              confirmations.call += 1;
              throw confirmationTimeoutError();
            },
          };
        },
      }),
    },
    storage: async () => ({}),
  };
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      originate: async () => {
        submissions.originate += 1;
        return {
          hash: ORIGINATION_HASH,
          contractAddress: CONTRACT,
          async confirmation() {
            confirmations.originate += 1;
            throw confirmationTimeoutError();
          },
          async contract() {
            originationContractCalls += 1;
            throw new Error("timeout fallback must not poll confirmation through contract()");
          },
        };
      },
      at: async (address: string) => {
        assert.equal(address, CONTRACT);
        return contract;
      },
      batch: () => ({
        withContractCall() {
          return this;
        },
        async send() {
          submissions.batch += 1;
          return {
            hash: BATCH_HASH,
            async confirmation() {
              confirmations.batch += 1;
              throw confirmationTimeoutError();
            },
          };
        },
      }),
    },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async (input) => { appliedChecks.push(input); },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  const originated = await session.handle(createBridgeRequest("originate", {
    code: [{ prim: "storage" }],
    storage: { administrator: CREATOR },
  })) as any;
  assert.equal(originated.operationHash, ORIGINATION_HASH);
  assert.equal(originated.contractAddress, CONTRACT);
  assert.equal(originationContractCalls, 0);

  const batch = await session.handle(createBridgeRequest("batch", {
    calls: [{ contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } }],
  })) as any;
  assert.equal(batch.operationHash, BATCH_HASH);

  const call = await session.handle(createBridgeRequest("call", {
    call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 1 } },
    sendOptions: {},
  })) as any;
  assert.equal(call.operationHash, CALL_HASH);

  assert.deepEqual(submissions, { originate: 1, batch: 1, call: 1 });
  assert.deepEqual(confirmations, { originate: 0, batch: 0, call: 0 });
  assert.deepEqual(appliedChecks, [
    { action: "originate", operationHash: ORIGINATION_HASH, contractAddress: CONTRACT, entrypoints: [] },
    { action: "batch", operationHash: BATCH_HASH, contractAddress: CONTRACT, entrypoints: ["create_token"] },
    { action: "call", operationHash: CALL_HASH, contractAddress: CONTRACT, entrypoints: ["create_token"] },
  ]);
  assert.deepEqual(session.getReceipts().map((receipt) => receipt.operationHash), [
    ORIGINATION_HASH,
    BATCH_HASH,
    CALL_HASH,
  ]);
});

test("Taquito session fails closed when an exact-hash verifier cannot resolve a confirmation error", async () => {
  async function run(input: {
    assertion?: () => void | Promise<void>;
    confirmationError: Error;
  }): Promise<{ error: unknown; submissions: number; confirmations: number; assertions: number; receipts: number }> {
    let submissions = 0;
    let confirmations = 0;
    let assertions = 0;
    const operation = {
      hash: CALL_HASH,
      async confirmation() {
        confirmations += 1;
        throw input.confirmationError;
      },
    };
    const tezos = {
      tz: { getBalance: async () => ({ toString: () => "1000000" }) },
      contract: {
        at: async () => ({
          methodsObject: {
            create_token: () => ({
              send: async () => {
                submissions += 1;
                return operation;
              },
            }),
          },
        }),
      },
    };
    const session = new TaquitoPastaUiLiveSession({
      tezos: tezos as any,
      signerAddress: CREATOR,
      expectedChainId: CHAIN_ID,
      allowedContractAddresses: new Set([CONTRACT]),
      allowedEntrypoints: new Set(["create_token"]),
      assertExpectedChain: async () => CHAIN_ID,
      pinJson: async () => { throw new Error("not used"); },
      ...(input.assertion
        ? {
            assertOperationApplied: async () => {
              assertions += 1;
              await input.assertion?.();
            },
          }
        : {}),
    });
    session.authorizeAfterFundingPreflight({
      balanceMutez: 1_000_000,
      requiredBalanceMutez: 50_000,
      estimatedOriginationMutez: 0,
      operationReserveMutez: 50_000,
    });
    let error: unknown;
    try {
      await session.handle(createBridgeRequest("call", {
        call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } },
        sendOptions: {},
      }));
    } catch (caught) {
      error = caught;
    }
    return { error, submissions, confirmations, assertions, receipts: session.getReceipts().length };
  }

  const timeoutWithoutVerifier = confirmationTimeoutError();
  const missing = await run({ confirmationError: timeoutWithoutVerifier });
  assert.ok(missing.error instanceof PastaUiLiveBridgeError);
  assert.match(missing.error.message, /verifier is required before signer submission/);
  assert.deepEqual({ ...missing, error: undefined }, {
    error: undefined,
    submissions: 0,
    confirmations: 0,
    assertions: 0,
    receipts: 0,
  });

  const indexedFailure = new Error("indexed exact hash as backtracked");
  const rejected = await run({
    confirmationError: confirmationTimeoutError(),
    assertion: () => { throw indexedFailure; },
  });
  assert.ok(rejected.error instanceof PastaUiLiveSubmittedOperationError);
  assert.match(rejected.error.message, /indexed exact hash as backtracked/);
  assert.equal(rejected.error.retrySafe, false);
  assert.deepEqual(
    { ...rejected, error: undefined },
    { error: undefined, submissions: 1, confirmations: 0, assertions: 1, receipts: 0 },
  );

  const unrelatedConfirmationFailure = new Error("confirmation decoder failed");
  const unrelated = await run({
    confirmationError: unrelatedConfirmationFailure,
    assertion: () => undefined,
  });
  assert.equal(unrelated.error, undefined);
  assert.deepEqual(
    { ...unrelated, error: undefined },
    { error: undefined, submissions: 1, confirmations: 0, assertions: 1, receipts: 1 },
  );
});

test("origination confirmation recovery refuses to authorize an unknown originated contract address", async () => {
  const timeout = confirmationTimeoutError();
  let submissions = 0;
  let assertions = 0;
  let contractCalls = 0;
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      originate: async () => {
        submissions += 1;
        return {
          hash: ORIGINATION_HASH,
          async confirmation() {
            throw timeout;
          },
          async contract() {
            contractCalls += 1;
            return { address: CONTRACT };
          },
        };
      },
    },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set<string>(),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async () => { assertions += 1; },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  await assert.rejects(
    session.handle(createBridgeRequest("originate", {
      code: [{ prim: "storage" }],
      storage: { administrator: CREATOR },
    })),
    (error: unknown) => error instanceof PastaUiLiveSubmittedOperationError &&
      error.operationHash === ORIGINATION_HASH &&
      error.contractAddress === undefined &&
      error.retrySafe === false,
  );
  assert.equal(submissions, 1);
  assert.equal(assertions, 1, "every confirmation exception must consult the exact-hash verifier");
  assert.equal(contractCalls, 0, "contract() would only repeat the timed-out confirmation poll");
  assert.equal(session.getReceipts().length, 0);
});

test("secondary signer sessions may call only Node-preauthorized proof contracts", async () => {
  const authorized = "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i";
  const unauthorized = "KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc";
  const calls: Array<{ payload: unknown; options: unknown }> = [];
  const operation = {
    hash: "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq",
    confirmation: async () => 1,
  };
  const contract = {
    methodsObject: {
      buy: (payload: unknown) => ({
        send: async (options: unknown) => {
          calls.push({ payload, options });
          return operation;
        },
      }),
    },
  };
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: { at: async () => contract },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej",
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([authorized]),
    allowedEntrypoints: new Set(["buy"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async () => undefined,
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });
  await session.handle({
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: "collector-buy",
    action: "call",
    payload: {
      call: { contractAddress: authorized, entrypoint: "buy", payload: { token_id: 0, amount: 1 } },
      sendOptions: { amount: 1000, mutez: true },
    },
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls)),
    [{ payload: { token_id: 0, amount: 1 }, options: { amount: 1000, mutez: true } }],
  );
  await assert.rejects(
    session.handle({
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id: "collector-escape",
      action: "call",
      payload: {
        call: { contractAddress: unauthorized, entrypoint: "buy", payload: { token_id: 0, amount: 1 } },
        sendOptions: { amount: 1000, mutez: true },
      },
    }),
    /not authorized for this UI-live session/,
  );
});

test("bounded bridge estimation simulates only an authorized call and emits no receipt", async () => {
  const { tezos } = fakeTezos();
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  const result = await session.handle(createBridgeRequest("estimate_call", {
    call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } },
    sendOptions: { amount: 1_000, mutez: true },
  })) as any;
  assert.deepEqual(result.estimate, {
    gasLimit: 6_909,
    storageLimit: 379,
    suggestedFeeMutez: 977,
    minimalFeeMutez: 957,
    burnFeeMutez: 94_750,
  });
  assert.equal(session.getReceipts().length, 0, "read-only estimates must not be recorded as signed operations");

  await assert.rejects(
    session.handle(createBridgeRequest("estimate_call", {
      call: { contractAddress: CONTRACT, entrypoint: "not_allowed", payload: 0 },
      sendOptions: {},
    })),
    /entrypoint is not allowed/,
  );
});

test("async storage projections serialize maps for reconstruction in the browser proxy", async () => {
  const contractAddress = "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i";
  const sales = new MichelsonMap<string, unknown>();
  sales.set("0", { active: true, price: 1_000, remaining: 1 });
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: { at: async () => ({ storage: async () => ({ sales: "raw-big-map" }) }) },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([contractAddress]),
    allowedEntrypoints: new Set(),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    projectStorage: async () => {
      await Promise.resolve();
      return { sales };
    },
  });
  const result = await session.handle({
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: "storage-map",
    action: "read_storage",
    payload: { contractAddress },
  }) as any;
  assert.deepEqual(result.storage, {
    sales: {
      __pastaBridgeType: "map",
      entries: [["0", { active: true, price: 1_000, remaining: 1 }]],
    },
  });
  const proxySource = buildPastaUiLiveProxyInstallerSource("http://127.0.0.1:4321", "a".repeat(64), "UI-MOCK");
  assert.match(proxySource, /new window\.TZ\.MichelsonMap/);
  assert.match(proxySource, /const result = decode\(body\.result\)/);
});

test("transient UI-live reads retry without duplicating call or origination submissions", async () => {
  let storageReads = 0;
  let callSubmissions = 0;
  let originationSubmissions = 0;
  const transient = (status: number, message: string) => Object.assign(new Error(message), {
    response: { status },
  });
  const contract = {
    methodsObject: {
      create_token: () => ({
        async send() {
          callSubmissions += 1;
          throw transient(503, "call submission transport failed");
        },
      }),
    },
    async storage() {
      storageReads += 1;
      if (storageReads === 1) throw transient(429, "storage read rate limited");
      return { next_token_id: 2 };
    },
  };
  const tezos = {
    tz: { getBalance: async () => ({ toString: () => "1000000" }) },
    contract: {
      at: async () => contract,
      async originate() {
        originationSubmissions += 1;
        throw transient(503, "origination submission transport failed");
      },
    },
  };
  const session = new TaquitoPastaUiLiveSession({
    tezos: tezos as any,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["create_token"]),
    assertExpectedChain: async () => CHAIN_ID,
    pinJson: async () => { throw new Error("not used"); },
    assertOperationApplied: async () => undefined,
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: 1_000_000,
    requiredBalanceMutez: 50_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 50_000,
  });

  assert.deepEqual(
    await session.handle(createBridgeRequest("read_storage", { contractAddress: CONTRACT })),
    { contractAddress: CONTRACT, chainId: CHAIN_ID, storage: { next_token_id: 2 } },
  );
  assert.equal(storageReads, 2, "the explicitly read-only storage operation must recover from HTTP 429");

  await assert.rejects(
    session.handle(createBridgeRequest("call", {
      call: { contractAddress: CONTRACT, entrypoint: "create_token", payload: { token_id: 0 } },
      sendOptions: {},
    })),
    /call submission transport failed/,
  );
  assert.equal(callSubmissions, 1, "a transient-looking call submission must never enter the read retry lane");

  await assert.rejects(
    session.handle(createBridgeRequest("originate", { code: [], storage: {} })),
    /origination submission transport failed/,
  );
  assert.equal(originationSubmissions, 1, "a transient-looking origination must never enter the read retry lane");
});

test("storage projection rejects raw BigMap abstractions without traversing provider internals", () => {
  let poisonedReads = 0;
  class PoisonedBigMapAbstraction {
    readonly id = 123;
    get provider() {
      poisonedReads += 1;
      throw new Error("provider graph must never be traversed");
    }
    get schema() {
      poisonedReads += 1;
      throw new Error("schema graph must never be traversed");
    }
    get(_key: string) {
      return Promise.resolve(undefined);
    }
  }

  assert.throws(
    () => serializePastaUiLiveStorageProjection({ metadata: new PoisonedBigMapAbstraction() }),
    (error: unknown) => error instanceof PastaUiLiveBridgeError &&
      error.statusCode === 500 &&
      /projectStorage.*bounded|bounded.*projectStorage/.test(error.message),
  );
  assert.equal(poisonedReads, 0, "serializer must reject the abstraction before reading provider or schema");
});

test("storage projection rejects cycles, shared references, and oversized collections", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.throws(
    () => serializePastaUiLiveStorageProjection(cycle),
    (error: unknown) => error instanceof PastaUiLiveBridgeError && /cycles and shared object references/.test(error.message),
  );

  const shared = { bounded: true };
  assert.throws(
    () => serializePastaUiLiveStorageProjection({ first: shared, second: shared }),
    (error: unknown) => error instanceof PastaUiLiveBridgeError && /cycles and shared object references/.test(error.message),
  );

  const oversized = Array.from(
    { length: PASTA_UI_LIVE_STORAGE_PROJECTION_LIMITS.maximumArrayEntries + 1 },
    () => 0,
  );
  assert.throws(
    () => serializePastaUiLiveStorageProjection(oversized),
    (error: unknown) => error instanceof PastaUiLiveBridgeError && /array exceeds/.test(error.message),
  );
});

test("entrypoint schemas use a separately bounded depth that accepts real comb types without loosening storage", () => {
  const nestedOption = (levels: number): Record<string, unknown> => {
    let schema: Record<string, unknown> = { prim: "nat" };
    for (let level = 0; level < levels; level += 1) schema = { prim: "option", args: [schema] };
    return schema;
  };
  const realDepthSchema = { create_open_edition: nestedOption(12) };
  assert.throws(
    () => serializePastaUiLiveStorageProjection(realDepthSchema),
    new RegExp(`depth ${PASTA_UI_LIVE_STORAGE_PROJECTION_LIMITS.maximumDepth}`),
  );
  assert.deepEqual(serializePastaUiLiveEntrypoints(realDepthSchema), realDepthSchema);
  assert.throws(
    () => serializePastaUiLiveEntrypoints({ too_deep: nestedOption(17) }),
    new RegExp(`depth ${PASTA_UI_LIVE_ENTRYPOINT_PROJECTION_MAXIMUM_DEPTH}`),
  );
});

test("bridge value decoder rebuilds Michelson maps and rejects prototype-polluting keys", () => {
  const decoded = decodePastaUiLiveValue({
    __pastaBridgeType: "map",
    entries: [["", "697066733a2f2fproof"]],
  });
  assert.ok(decoded instanceof MichelsonMap);
  assert.equal(decoded.get(""), "697066733a2f2fproof");

  const polluted = JSON.parse('{"safe":1,"__proto__":{"polluted":true}}');
  assert.throws(
    () => decodePastaUiLiveValue(polluted),
    (error: unknown) => error instanceof PastaUiLiveBridgeError && /prohibited/.test(error.message),
  );
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test("generated browser proxy is standalone JavaScript and keeps its session nonce closure-only", () => {
  const token = "synthetic-session-nonce";
  const source = buildPastaUiLiveProxyInstallerSource("http://127.0.0.1:4321", token, "UI-MOCK");
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /sessionToken/);
  assert.match(source, /toolkit\.estimate/);
  assert.match(source, /__pastaBridgeEstimateCall/);
  assert.match(source, /typeof MD\.useToolkitAdapter === "function"/);
  assert.doesNotMatch(source, /window\.__pastaUiLiveBridge\s*=.*sessionToken/s);
});
