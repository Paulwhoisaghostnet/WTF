import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  PastaUiLivePreparedOperation,
  PastaUiLivePublicReceipt,
  PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import type { ReadOnlyFetch } from "./pasta-readonly-retry";
import {
  assertRotiniSubmittedReconciliationAllowed,
  reconcileRotiniSubmittedOperation,
  ROTINI_LEGACY_SUBMITTED_RECONCILE_RUN_ID,
  ROTINI_SUBMITTED_RECONCILE_FLAG,
  ROTINI_SUBMITTED_RECONCILE_OUTPUT_ENV,
} from "./shadownet-rotini-submitted-reconciler";
import {
  createRotiniUiLiveCheckpoint,
  openRotiniUiLiveCheckpoint,
} from "./shadownet-rotini-ui-live-checkpoint";
import {
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
} from "./shadownet-proof-kit";

type JsonObject = Record<string, any>;

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const ORIGINATION_HASH = "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq";
const CALL_HASH = "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp";
const ARTIFACT_RELATIVE =
  "public/creation-tools/rotini/contract/pasta-generative-collection.contract.json";
const CHECKPOINT_RELATIVE = "artifacts/rotini-ui-live-checkpoint";

type Fixture = {
  parent: string;
  runRoot: string;
  runId: string;
  checkpointRoot: string;
  code: unknown;
  rawArtifactSha256: string;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeBase(value: string): string {
  return value.replace(/\/+$/, "");
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function createFixture(label: string): Promise<Fixture> {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-generic-reconcile-"));
  const runId = `rotini-reconcile-${label}`;
  const runRoot = path.join(parent, runId);
  const checkpointRoot = path.join(runRoot, "rotini", CHECKPOINT_RELATIVE);
  await mkdir(path.dirname(checkpointRoot), { recursive: true });
  const artifactBytes = await readFile(path.join(root, ARTIFACT_RELATIVE));
  const code = JSON.parse(artifactBytes.toString("utf8")) as unknown;
  assert.ok(Array.isArray(code), "Rotini contract artifact fixture must be a Michelson code array");
  return {
    parent,
    runRoot,
    runId,
    checkpointRoot,
    code,
    rawArtifactSha256: sha256(artifactBytes),
  };
}

async function createPendingOrigination(fixture: Fixture): Promise<void> {
  const checkpoint = await createRotiniUiLiveCheckpoint({
    checkpointRoot: fixture.checkpointRoot,
    runId: fixture.runId,
    createdAt: "2026-07-23T10:00:00.000Z",
    chainId: SHADOWNET_CHAIN_ID,
    actors: { creator: CREATOR, collector: COLLECTOR },
    contractIdentity: {
      artifactPath: ARTIFACT_RELATIVE,
      rawArtifactSha256: fixture.rawArtifactSha256,
      canonicalMichelsonCodeSha256: hashMichelsonScriptCode(fixture.code),
    },
  });
  const prepared: PastaUiLivePreparedOperation = {
    status: "PREPARED",
    operationSequence: 1,
    timestampUtc: "2026-07-23T10:00:01.000Z",
    action: "originate",
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: CREATOR,
    entrypoints: [],
    descriptor: {
      kind: "originate",
      code: fixture.code,
      storage: { administrator: CREATOR },
    },
  };
  const submitted: PastaUiLiveSubmittedOperation = {
    ...prepared,
    status: "SUBMITTED",
    timestampUtc: "2026-07-23T10:00:02.000Z",
    operationHash: ORIGINATION_HASH,
    contractAddress: CONTRACT,
  };
  await checkpoint.beforeOperationSubmit("creator", prepared);
  await checkpoint.onOperationSubmitted("creator", submitted);
}

async function createPendingCall(fixture: Fixture): Promise<void> {
  const checkpoint = await createRotiniUiLiveCheckpoint({
    checkpointRoot: fixture.checkpointRoot,
    runId: fixture.runId,
    createdAt: "2026-07-23T10:00:00.000Z",
    chainId: SHADOWNET_CHAIN_ID,
    actors: { creator: CREATOR, collector: COLLECTOR },
    contractIdentity: {
      artifactPath: ARTIFACT_RELATIVE,
      rawArtifactSha256: fixture.rawArtifactSha256,
      canonicalMichelsonCodeSha256: hashMichelsonScriptCode(fixture.code),
    },
  });
  const originate: PastaUiLivePreparedOperation = {
    status: "PREPARED",
    operationSequence: 1,
    timestampUtc: "2026-07-23T10:00:01.000Z",
    action: "originate",
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: CREATOR,
    entrypoints: [],
    descriptor: {
      kind: "originate",
      code: fixture.code,
      storage: { administrator: CREATOR },
    },
  };
  await checkpoint.beforeOperationSubmit("creator", originate);
  await checkpoint.onOperationSubmitted("creator", {
    ...originate,
    status: "SUBMITTED",
    timestampUtc: "2026-07-23T10:00:02.000Z",
    operationHash: ORIGINATION_HASH,
    contractAddress: CONTRACT,
  });
  const originationReceipt: PastaUiLivePublicReceipt = {
    schema: "pastaprotocol-ui-live-receipt@1",
    sequence: 1,
    timestampUtc: "2026-07-23T10:00:03.000Z",
    action: "originate",
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: CREATOR,
    contractAddress: CONTRACT,
    operationHash: ORIGINATION_HASH,
    entrypoints: [],
  };
  await checkpoint.onReceipt("creator", originationReceipt);

  const call: PastaUiLivePreparedOperation = {
    status: "PREPARED",
    operationSequence: 2,
    timestampUtc: "2026-07-23T10:00:04.000Z",
    action: "call",
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: CREATOR,
    contractAddress: CONTRACT,
    entrypoints: ["create_project"],
    descriptor: {
      kind: "call",
      call: {
        contractAddress: CONTRACT,
        entrypoint: "create_project",
        payload: { active: true, max_supply: 4, price: 1 },
      },
      sendOptions: {},
    },
  };
  await checkpoint.beforeOperationSubmit("creator", call);
  await checkpoint.onOperationSubmitted("creator", {
    ...call,
    status: "SUBMITTED",
    timestampUtc: "2026-07-23T10:00:05.000Z",
    operationHash: CALL_HASH,
  });
}

function operationHashInMempool(hash: string): JsonObject {
  return {
    applied: [[hash, { hash, contents: [{ source: CREATOR }] }]],
    branch_delayed: [],
    branch_refused: [],
    refused: [],
    unprocessed: [],
    validated: [],
    outdated: [],
  };
}

function createFetch(input: {
  operationPath: string;
  operationRows: unknown;
  code: unknown;
  mempool?: JsonObject;
  calls?: Array<{ url: string; method: string }>;
}): ReadOnlyFetch {
  const calls = input.calls ?? [];
  return async (request, init) => {
    const url = new URL(String(request));
    const method = String(init?.method || "GET").toUpperCase();
    calls.push({ url: url.toString(), method });
    assert.equal(method, "GET", "reconciler attempted a non-GET request");
    if (url.pathname.endsWith("/chains/main/chain_id")) return response(SHADOWNET_CHAIN_ID);
    if (url.pathname.endsWith("/chains/main/blocks/head/header")) {
      return response({
        level: 5_000_000,
        timestamp: "2026-07-23T10:10:00Z",
      });
    }
    if (url.pathname.endsWith("/chains/main/mempool/pending_operations")) {
      return response(input.mempool ?? operationHashInMempool(""));
    }
    if (url.pathname.endsWith(`/chains/main/blocks/head/context/contracts/${CONTRACT}/script`)) {
      return response({ code: input.code, storage: { prim: "Unit" } });
    }
    if (url.pathname === input.operationPath) return response(input.operationRows);
    return response({ error: `unexpected ${url.toString()}` }, 404);
  };
}

test("permission gate requires an explicit run root, refuses endpoint overrides, and quarantines the historical lane", () => {
  assert.throws(
    () => assertRotiniSubmittedReconciliationAllowed({}),
    new RegExp(ROTINI_SUBMITTED_RECONCILE_FLAG),
  );
  assert.throws(
    () => assertRotiniSubmittedReconciliationAllowed({
      [ROTINI_SUBMITTED_RECONCILE_FLAG]: "1",
    }),
    new RegExp(ROTINI_SUBMITTED_RECONCILE_OUTPUT_ENV),
  );
  assert.throws(
    () => assertRotiniSubmittedReconciliationAllowed({
      [ROTINI_SUBMITTED_RECONCILE_FLAG]: "1",
      [ROTINI_SUBMITTED_RECONCILE_OUTPUT_ENV]: `/tmp/${ROTINI_LEGACY_SUBMITTED_RECONCILE_RUN_ID}`,
    }),
    /quarantined|historical/i,
  );
  assert.throws(
    () => assertRotiniSubmittedReconciliationAllowed({
      [ROTINI_SUBMITTED_RECONCILE_FLAG]: "1",
      [ROTINI_SUBMITTED_RECONCILE_OUTPUT_ENV]: "/tmp/fresh-run",
      PASTA_SHADOWNET_RPC: "https://example.invalid",
    }),
    /forbids PASTA_SHADOWNET_RPC/i,
  );
  assert.equal(
    assertRotiniSubmittedReconciliationAllowed({
      [ROTINI_SUBMITTED_RECONCILE_FLAG]: "1",
      [ROTINI_SUBMITTED_RECONCILE_OUTPUT_ENV]: "/tmp/fresh-run",
    }),
    "/tmp/fresh-run",
  );
});

test("package command routes through the generic reconciler and the source has no one-off operation constants", async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as JsonObject;
  assert.equal(
    packageJson.scripts["pasta:shadownet:rotini:submitted-reconcile"],
    "npm run pasta:shadownet:rotini:submitted-reconcile:generic",
  );
  assert.equal(
    packageJson.scripts["pasta:shadownet:rotini:submitted-reconcile:generic"],
    "PASTA_SHADOWNET_ROTINI_SUBMITTED_RECONCILE=1 tsx scripts/pasta-protocol/shadownet-rotini-submitted-reconciler.ts",
  );
  const source = await readFile(
    path.join(root, "scripts/pasta-protocol/shadownet-rotini-submitted-reconciler.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /ROTINI_SUBMITTED_(?:OPERATION_HASH|CONTRACT|CREATOR|COLLECTOR)/);
  assert.doesNotMatch(source, /EXPECTED_(?:LEVEL|TZKT_TIMESTAMP)|RECEIPT_SEQUENCE/);
});

test("generic reconciler appends one confirmation for an exact applied origination observed through both RPC lanes", async () => {
  const fixture = await createFixture("origination");
  const calls: Array<{ url: string; method: string }> = [];
  try {
    await createPendingOrigination(fixture);
    const result = await reconcileRotiniSubmittedOperation(fixture.runRoot, {
      fetchImpl: createFetch({
        operationPath: `/v1/operations/originations/${ORIGINATION_HASH}`,
        operationRows: [{
          type: "origination",
          hash: ORIGINATION_HASH,
          status: "applied",
          sender: { address: CREATOR },
          originatedContract: { address: CONTRACT },
          level: 4_999_990,
          timestamp: "2026-07-23T10:00:08Z",
        }],
        code: fixture.code,
        calls,
      }),
    });
    assert.equal(result.status, "APPLIED");
    assert.equal(result.operationHash, ORIGINATION_HASH);
    assert.equal(result.checkpointMutation, "CONFIRMED_APPENDED");
    assert.equal(result.receipt?.sequence, 1);
    assert.equal(result.sideEffects.checkpointConfirmationEvents, 1);
    assert.ok(result.integrity.checkpointAfterSha256);

    const reopened = await openRotiniUiLiveCheckpoint(fixture.checkpointRoot);
    assert.equal(reopened.summary().completedOperations, 1);
    assert.equal(reopened.summary().pendingOperation, null);
    assert.ok(calls.some(({ url }) => url.startsWith(normalizeBase(SHADOWNET_RPC_PRIMARY))));
    assert.ok(calls.some(({ url }) => url.startsWith(normalizeBase(SHADOWNET_RPC_FALLBACK))));
    assert.ok(calls.some(({ url }) => url.startsWith(normalizeBase(SHADOWNET_TZKT_API))));
    assert.ok(calls.every(({ method }) => method === "GET"));
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test("generic reconciler matches a call's exact actor, target, entrypoint, amount, and payload before appending", async () => {
  const fixture = await createFixture("call");
  try {
    await createPendingCall(fixture);
    const result = await reconcileRotiniSubmittedOperation(fixture.runRoot, {
      fetchImpl: createFetch({
        operationPath: `/v1/operations/transactions/${CALL_HASH}`,
        operationRows: [{
          type: "transaction",
          hash: CALL_HASH,
          status: "applied",
          sender: { address: CREATOR },
          target: { address: CONTRACT },
          amount: "0",
          parameter: {
            entrypoint: "create_project",
            value: { active: true, max_supply: "4", price: "1" },
          },
          level: 4_999_991,
          timestamp: "2026-07-23T10:00:09Z",
        }],
        code: fixture.code,
      }),
    });
    assert.equal(result.status, "APPLIED");
    assert.equal(result.receipt?.sequence, 2);
    assert.deepEqual(result.receipt?.entrypoints, ["create_project"]);
    const reopened = await openRotiniUiLiveCheckpoint(fixture.checkpointRoot);
    assert.equal(reopened.summary().completedOperations, 2);
    assert.equal(reopened.summary().pendingOperation, null);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test("pending, failed, and ambiguous observations are classified without changing checkpoint evidence", async () => {
  const cases = [
    {
      label: "pending",
      expected: "PENDING",
      rows: [],
      mempool: operationHashInMempool(ORIGINATION_HASH),
    },
    {
      label: "failed",
      expected: "FAILED",
      rows: [{
        type: "origination",
        hash: ORIGINATION_HASH,
        status: "failed",
        sender: { address: CREATOR },
        originatedContract: { address: CONTRACT },
        level: 4_999_990,
        timestamp: "2026-07-23T10:00:08Z",
      }],
      mempool: operationHashInMempool(""),
    },
    {
      label: "ambiguous",
      expected: "AMBIGUOUS",
      rows: [{
        type: "origination",
        hash: ORIGINATION_HASH,
        status: "applied",
        sender: { address: COLLECTOR },
        originatedContract: { address: CONTRACT },
        level: 4_999_990,
        timestamp: "2026-07-23T10:00:08Z",
      }],
      mempool: operationHashInMempool(""),
    },
  ] as const;
  for (const item of cases) {
    const fixture = await createFixture(item.label);
    try {
      await createPendingOrigination(fixture);
      const before = await (await openRotiniUiLiveCheckpoint(fixture.checkpointRoot)).validatedEvidence();
      const result = await reconcileRotiniSubmittedOperation(fixture.runRoot, {
        fetchImpl: createFetch({
          operationPath: `/v1/operations/originations/${ORIGINATION_HASH}`,
          operationRows: item.rows,
          code: fixture.code,
          mempool: item.mempool,
        }),
      });
      assert.equal(result.status, item.expected);
      assert.equal(result.checkpointMutation, "NONE");
      assert.equal(result.sideEffects.checkpointConfirmationEvents, 0);
      const after = await (await openRotiniUiLiveCheckpoint(fixture.checkpointRoot)).validatedEvidence();
      assert.equal(after.chainHeadSha256, before.chainHeadSha256);
      assert.deepEqual(after.artifacts, before.artifacts);
      assert.equal(after.summary.pendingOperation?.phase, "SUBMITTED");
    } finally {
      await rm(fixture.parent, { recursive: true, force: true });
    }
  }
});

test("reconciler rejects symlink lanes and current contract artifact hash drift before any network read", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-generic-reconcile-symlink-"));
  const target = await mkdtemp(path.join(tmpdir(), "rotini-generic-reconcile-target-"));
  try {
    await symlink(target, path.join(parent, "rotini"));
    await assert.rejects(
      reconcileRotiniSubmittedOperation(parent, {
        fetchImpl: async () => {
          throw new Error("network must not be reached");
        },
      }),
      /symbolic link|real directory/i,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }

  const fixture = await createFixture("artifact-drift");
  try {
    const checkpoint = await createRotiniUiLiveCheckpoint({
      checkpointRoot: fixture.checkpointRoot,
      runId: fixture.runId,
      createdAt: "2026-07-23T10:00:00.000Z",
      chainId: SHADOWNET_CHAIN_ID,
      actors: { creator: CREATOR, collector: COLLECTOR },
      contractIdentity: {
        artifactPath: ARTIFACT_RELATIVE,
        rawArtifactSha256: "0".repeat(64),
        canonicalMichelsonCodeSha256: hashMichelsonScriptCode(fixture.code),
      },
    });
    const prepared: PastaUiLivePreparedOperation = {
      status: "PREPARED",
      operationSequence: 1,
      timestampUtc: "2026-07-23T10:00:01.000Z",
      action: "originate",
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress: CREATOR,
      entrypoints: [],
      descriptor: { kind: "originate", code: fixture.code, storage: {} },
    };
    await checkpoint.beforeOperationSubmit("creator", prepared);
    await checkpoint.onOperationSubmitted("creator", {
      ...prepared,
      status: "SUBMITTED",
      timestampUtc: "2026-07-23T10:00:02.000Z",
      operationHash: ORIGINATION_HASH,
      contractAddress: CONTRACT,
    });
    await assert.rejects(
      reconcileRotiniSubmittedOperation(fixture.runRoot, {
        fetchImpl: async () => {
          throw new Error("network must not be reached");
        },
      }),
      /artifact hash drift/i,
    );
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});
