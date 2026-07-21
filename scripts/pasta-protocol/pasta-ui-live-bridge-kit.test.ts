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
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
  PASTA_UI_LIVE_STORAGE_PROJECTION_LIMITS,
  PastaUiLiveBridgeError,
  serializePastaUiLiveStorageProjection,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLivePinProof,
} from "./pasta-ui-live-bridge-kit";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const ORIGINATION_HASH = "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq";
const BATCH_HASH = "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp";
const CALL_HASH = "ooAq3auFLuZywAjtSv5JRmdmF56YNCVy5teEMXjxsKMapBbmMQQ";
const CHAIN_ID = "NetXsqzbfFenSTS";
const CID = "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";

function confirmationTimeoutError(): Error {
  const error = new Error("Confirmation polling timed out");
  error.name = "ConfirmationTimeoutError";
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
      tz: {
        async getBalance() {
          return { toString: () => "5000000" };
        },
      },
      contract: {
        async originate() {
          return {
            hash: ORIGINATION_HASH,
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

test("Taquito session accepts an exact-hash applied assertion after confirmation timeout without resubmitting", async () => {
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
  assert.deepEqual(confirmations, { originate: 1, batch: 1, call: 1 });
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

test("Taquito session fails closed on confirmation timeout without an accepting exact-hash verifier", async () => {
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
  assert.equal(missing.error, timeoutWithoutVerifier);
  assert.deepEqual(missing, {
    error: timeoutWithoutVerifier,
    submissions: 1,
    confirmations: 1,
    assertions: 0,
    receipts: 0,
  });

  const indexedFailure = new Error("indexed exact hash as backtracked");
  const rejected = await run({
    confirmationError: confirmationTimeoutError(),
    assertion: () => { throw indexedFailure; },
  });
  assert.equal(rejected.error, indexedFailure);
  assert.deepEqual(
    { ...rejected, error: undefined },
    { error: undefined, submissions: 1, confirmations: 1, assertions: 1, receipts: 0 },
  );

  const unrelatedConfirmationFailure = new Error("confirmation decoder failed");
  const unrelated = await run({
    confirmationError: unrelatedConfirmationFailure,
    assertion: () => undefined,
  });
  assert.equal(unrelated.error, unrelatedConfirmationFailure);
  assert.deepEqual(
    { ...unrelated, error: undefined },
    { error: undefined, submissions: 1, confirmations: 1, assertions: 0, receipts: 0 },
  );
});

test("origination timeout fallback requires Taquito's exact originated contract address", async () => {
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
    (error: unknown) => error === timeout,
  );
  assert.equal(submissions, 1);
  assert.equal(assertions, 0, "hash-only origination verification must not authorize an unknown contract");
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
