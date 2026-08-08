import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type {
  RavioliCurrentResumeOperation,
  RavioliCurrentResumePin,
} from "./shadownet-ravioli-current-resume";
import {
  createRavioliCurrentResumeLiveVerifier,
  type RavioliCurrentResumeRoleArtifacts,
} from "./shadownet-ravioli-current-live-verifier";

const PRIMARY_RPC = "https://primary.shadownet.invalid";
const FALLBACK_RPC = "https://fallback.shadownet.invalid";
const TZKT_API = "https://tzkt.shadownet.invalid/v1";
const LOCAL_GATEWAY = "http://127.0.0.1:8080/ipfs";
const PUBLIC_GATEWAY = "https://public-ipfs.invalid/ipfs";
const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const CONTROLLER = "KT1VFnbBxdHmMVXbNkv6tTzCWaJMu9rVebqB";
const GNOCCHI = "KT1KGB1PRsJw58fgZPGRjoj4ZHNsFR7SuEzv";
const ORIGINATION_HASH = "oo9uFDpE1dsSPfbkFojrQwvSdaNY9ckxN5zq4Ma5V2LZa63Fed8";
const CALL_HASH = "ooEUbDukhhVmXvi3SYkPptYwDAwCuJ6MusmDb1iJ143Vi1EXdMU";
const CID = "bafkreicxuyj2pceuejfzosbrb3blwof2jzzxa5riw3ckq6b5huqqclgqpu";
const PIN_BYTES = Buffer.from("authenticated-ravioli-pin", "utf8");

const SCRIPT_CODE = Object.freeze([
  { prim: "parameter", args: [{ prim: "unit" }] },
  { prim: "storage", args: [{ prim: "unit" }] },
  { prim: "code", args: [[{ prim: "CAR" }, { prim: "NIL", args: [{ prim: "operation" }] }, { prim: "PAIR" }]] },
]);

const TARGET_ROLES = Object.freeze([
  "blindController",
  "router",
  "gnocchi",
  "gnocchiAdapter",
  "rotini",
  "rotiniAdapter",
] as const);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function roleArtifacts(code: readonly unknown[] = SCRIPT_CODE): RavioliCurrentResumeRoleArtifacts {
  return Object.fromEntries(TARGET_ROLES.map((role) => [role, code])) as RavioliCurrentResumeRoleArtifacts;
}

function evidence(input: {
  operationHash: string;
  contractAddress: string;
  counter: number;
  entrypoints: string[];
  level: number;
  timestamp: string;
}): Record<string, unknown> {
  return {
    contractAddress: input.contractAddress,
    counter: input.counter,
    entrypoints: input.entrypoints,
    explorerUrl: `https://shadownet.tzkt.io/${input.operationHash}`,
    level: input.level,
    operationHash: input.operationHash,
    signerAddress: CREATOR,
    status: "applied",
    timestamp: input.timestamp,
  };
}

function originationOperation(): RavioliCurrentResumeOperation {
  const operationEvidence = evidence({
    operationHash: ORIGINATION_HASH,
    contractAddress: CONTROLLER,
    counter: 101,
    entrypoints: [],
    level: 4_533_116,
    timestamp: "2026-08-08T16:00:15Z",
  });
  return {
    kind: "operation",
    actor: "creator",
    eventIndex: 6,
    action: "originate",
    expected: {
      id: "infrastructure/controller/originate",
      proofPartition: "infrastructure",
      globalOrdinal: 1,
      actor: "creator",
      operationSequence: 1,
      action: "originate",
      targetRole: "blindController",
      originRole: "blindController",
    },
    descriptor: { kind: "originate", code: SCRIPT_CODE, storage: { prim: "Unit" } },
    descriptorSha256: "1".repeat(64),
    operationHash: ORIGINATION_HASH,
    contractAddress: CONTROLLER,
    evidence: operationEvidence,
    fingerprint: `originate:${"1".repeat(64)}`,
    receipt: {} as never,
  };
}

function callOperation(): RavioliCurrentResumeOperation {
  const operationEvidence = evidence({
    operationHash: CALL_HASH,
    contractAddress: GNOCCHI,
    counter: 102,
    entrypoints: ["update_operators"],
    level: 4_533_120,
    timestamp: "2026-08-08T16:00:39Z",
  });
  return {
    kind: "operation",
    actor: "creator",
    eventIndex: 12,
    action: "call",
    expected: {
      id: "mode-0/operator/approve",
      proofPartition: "mode-0-deterministic-vault",
      globalOrdinal: 3,
      actor: "creator",
      operationSequence: 3,
      action: "call",
      targetRole: "gnocchi",
      entrypoint: "update_operators",
      tokenId: 2,
    },
    descriptor: {
      kind: "call",
      call: { contractAddress: GNOCCHI, entrypoint: "update_operators", payload: [] },
      sendOptions: {},
    },
    descriptorSha256: "2".repeat(64),
    operationHash: CALL_HASH,
    contractAddress: GNOCCHI,
    evidence: operationEvidence,
    fingerprint: `call:${"2".repeat(64)}`,
    receipt: {} as never,
  };
}

function pin(): RavioliCurrentResumePin {
  return {
    kind: "pin",
    actor: "creator",
    eventIndex: 1,
    pinSequence: 1,
    action: "pin_blob",
    fingerprint: `pin_blob:proof.bin:application/octet-stream:${sha256(PIN_BYTES)}:${PIN_BYTES.byteLength}`,
    bytes: PIN_BYTES,
    proof: {
      cid: CID,
      uri: `ipfs://${CID}`,
      fileName: "proof.bin",
      mimeType: "application/octet-stream",
      byteLength: PIN_BYTES.byteLength,
      sha256: sha256(PIN_BYTES),
      localGatewayUrl: `${LOCAL_GATEWAY}/${CID}`,
      publicGatewayUrl: `${PUBLIC_GATEWAY}/${CID}`,
      publicGatewayVerified: true,
      verificationAttempts: 1,
    },
  };
}

type FakeOptions = {
  mempool?: unknown;
  transactionRow?: unknown;
  originRow?: Record<string, unknown>;
  localBytes?: Uint8Array;
  publicBytes?: Uint8Array;
  primaryCode?: readonly unknown[];
  fallbackCode?: readonly unknown[];
  transientTransaction429?: boolean;
};

function emptyMempool(): Record<string, unknown[]> {
  return {
    applied: [],
    validated: [],
    branch_delayed: [],
    unprocessed: [],
    branch_refused: [],
    refused: [],
    outdated: [],
  };
}

function baseTransactionRow(): Record<string, unknown> {
  return {
    type: "transaction",
    status: "applied",
    hash: CALL_HASH,
    sender: { address: CREATOR },
    counter: 102,
    target: { address: GNOCCHI },
    parameter: { entrypoint: "update_operators", value: [] },
    level: 4_533_120,
    timestamp: "2026-08-08T16:00:39Z",
  };
}

function baseOriginationRow(): Record<string, unknown> {
  return {
    type: "origination",
    status: "applied",
    hash: ORIGINATION_HASH,
    sender: { address: CREATOR },
    counter: 101,
    originatedContract: { address: CONTROLLER },
    level: 4_533_116,
    timestamp: "2026-08-08T16:00:15Z",
  };
}

function fakeNetwork(options: FakeOptions = {}): {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; init?: RequestInit }>;
  transactionAttempts: () => number;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let transactionAttempts = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/chains/main/chain_id")) {
      return Response.json("NetXsqzbfFenSTS");
    }
    if (parsed.pathname.includes(`/context/contracts/${CREATOR}/counter`)) {
      return Response.json("109");
    }
    if (parsed.pathname.endsWith("/chains/main/mempool/pending_operations")) {
      return Response.json(options.mempool ?? emptyMempool());
    }
    if (parsed.pathname.includes(`/context/contracts/${CONTROLLER}/script`)) {
      const code = parsed.origin === new URL(PRIMARY_RPC).origin
        ? (options.primaryCode ?? SCRIPT_CODE)
        : (options.fallbackCode ?? SCRIPT_CODE);
      return Response.json({ code, storage: { prim: "Unit" } });
    }
    if (parsed.pathname.endsWith(`/operations/transactions/${CALL_HASH}`)) {
      transactionAttempts += 1;
      if (options.transientTransaction429 && transactionAttempts === 1) {
        return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
      }
      return Response.json(options.transactionRow ?? baseTransactionRow());
    }
    if (parsed.pathname.endsWith(`/operations/originations/${ORIGINATION_HASH}`)) {
      return Response.json([options.originRow ?? baseOriginationRow()]);
    }
    if (url === `${LOCAL_GATEWAY}/${CID}`) {
      return new Response(Buffer.from(options.localBytes ?? PIN_BYTES));
    }
    if (url === `${PUBLIC_GATEWAY}/${CID}`) {
      return new Response(Buffer.from(options.publicBytes ?? PIN_BYTES));
    }
    throw new Error(`unexpected fake GET ${url}`);
  };
  return { fetchImpl, calls, transactionAttempts: () => transactionAttempts };
}

function verifier(network: ReturnType<typeof fakeNetwork>) {
  return createRavioliCurrentResumeLiveVerifier({
    ipfs: {
      localGatewayUrl: LOCAL_GATEWAY,
      publicGatewayUrl: PUBLIC_GATEWAY,
    },
    roleArtifacts: roleArtifacts(),
    fetchImpl: network.fetchImpl,
    primaryRpcUrl: PRIMARY_RPC,
    fallbackRpcUrl: FALLBACK_RPC,
    tzktApiUrl: TZKT_API,
    readRetryOptions: {
      maxAttempts: 2,
      deadlineMs: 2_000,
      baseDelayMs: 0,
      maxDelayMs: 0,
      maxRetryAfterMs: 0,
      jitterRatio: 0,
    },
  });
}

test("production verifier authenticates both RPC counters, exact operations, both IPFS gateways, and both target scripts with GET-only reads", async () => {
  const network = fakeNetwork({ transientTransaction429: true });
  const live = verifier(network);

  assert.equal(await live.readActorCounter({
    actor: "creator",
    lane: "primary",
    rpcUrl: PRIMARY_RPC,
    signerAddress: CREATOR,
  }), 109);
  assert.equal(await live.readActorCounter({
    actor: "creator",
    lane: "fallback",
    rpcUrl: FALLBACK_RPC,
    signerAddress: CREATOR,
  }), 109);
  await live.verifyTarget({ role: "blindController", address: CONTROLLER });
  await live.verifyPin(pin());
  assert.deepEqual(await live.verifyOperation(originationOperation()), originationOperation().evidence);
  assert.deepEqual(await live.verifyOperation(callOperation()), callOperation().evidence);

  assert.equal(network.transactionAttempts(), 2, "transient TzKT GET must use the bounded retry reader");
  assert.ok(network.calls.length > 0);
  for (const call of network.calls) {
    assert.equal(call.init?.method, "GET", `non-GET transport reached ${call.url}`);
    assert.equal(call.init?.body, undefined, `GET transport carried a body at ${call.url}`);
  }
});

test("counter reads reject non-authoritative lanes and any signer mempool residue", async () => {
  const clean = fakeNetwork();
  await assert.rejects(
    verifier(clean).readActorCounter({
      actor: "creator",
      lane: "primary",
      rpcUrl: "https://unapproved-rpc.invalid",
      signerAddress: CREATOR,
    }),
    /primary RPC URL differs from the configured Shadownet lane/,
  );
  assert.equal(clean.calls.length, 0, "unapproved RPC must fail before network access");

  const dirty = fakeNetwork({
    mempool: {
      ...emptyMempool(),
      validated: [{ hash: CALL_HASH, contents: [{ source: CREATOR }] }],
    },
  });
  await assert.rejects(
    verifier(dirty).readActorCounter({
      actor: "creator",
      lane: "primary",
      rpcUrl: PRIMARY_RPC,
      signerAddress: CREATOR,
    }),
    /primary RPC mempool is not empty for creator/,
  );
});

for (const mutation of [
  { name: "hash", patch: { hash: ORIGINATION_HASH }, expected: /exact hash and signer/ },
  { name: "signer", patch: { sender: { address: "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU" } }, expected: /exact hash and signer/ },
  { name: "counter", patch: { counter: 999 }, expected: /counter differs/ },
  { name: "target", patch: { target: { address: CONTROLLER } }, expected: /target differs/ },
  { name: "entrypoint", patch: { parameter: { entrypoint: "transfer", value: [] } }, expected: /entrypoint differs/ },
  { name: "level", patch: { level: 4_533_121 }, expected: /level differs/ },
  { name: "timestamp", patch: { timestamp: "2026-08-08T16:00:40Z" }, expected: /timestamp differs/ },
] as const) {
  test(`operation verification rejects ${mutation.name} drift from journal evidence`, async () => {
    const network = fakeNetwork({ transactionRow: { ...baseTransactionRow(), ...mutation.patch } });
    await assert.rejects(verifier(network).verifyOperation(callOperation()), mutation.expected);
  });
}

test("operation verification rejects both a missing exact row and duplicate exact rows", async () => {
  const row = baseTransactionRow();
  await assert.rejects(
    verifier(fakeNetwork({ transactionRow: [{ ...row, hash: ORIGINATION_HASH }] })).verifyOperation(callOperation()),
    /must expose exactly one row for the exact hash and signer/,
  );
  await assert.rejects(
    verifier(fakeNetwork({ transactionRow: [row, { ...row }] })).verifyOperation(callOperation()),
    /must expose exactly one row for the exact hash and signer/,
  );
});

test("IPFS verification rejects exact-byte drift from either authenticated gateway", async () => {
  const network = fakeNetwork({ publicBytes: Buffer.from("not-the-journal-pin", "utf8") });
  await assert.rejects(verifier(network).verifyPin(pin()), /public IPFS byte length differs/);
});

test("target verification rejects either RPC lane when on-chain Michelson differs from the caller artifact", async () => {
  const drifted = [
    { prim: "parameter", args: [{ prim: "unit" }] },
    { prim: "storage", args: [{ prim: "unit" }] },
    { prim: "code", args: [[{ prim: "CAR" }, { prim: "FAILWITH" }]] },
  ];
  const network = fakeNetwork({ fallbackCode: drifted });
  await assert.rejects(
    verifier(network).verifyTarget({ role: "blindController", address: CONTROLLER }),
    /fallback on-chain blindController script differs from its caller artifact/,
  );
});

test("factory fails before network access unless all six non-null role artifacts are valid complete scripts", () => {
  const network = fakeNetwork();
  const incomplete = roleArtifacts() as unknown as Record<string, readonly unknown[] | null>;
  incomplete.rotiniAdapter = null;
  assert.throws(() => createRavioliCurrentResumeLiveVerifier({
    ipfs: { localGatewayUrl: LOCAL_GATEWAY, publicGatewayUrl: PUBLIC_GATEWAY },
    roleArtifacts: incomplete as never,
    fetchImpl: network.fetchImpl,
    primaryRpcUrl: PRIMARY_RPC,
    fallbackRpcUrl: FALLBACK_RPC,
    tzktApiUrl: TZKT_API,
  }), /rotiniAdapter caller artifact must be a complete Michelson code array/);
  assert.equal(network.calls.length, 0);
});
