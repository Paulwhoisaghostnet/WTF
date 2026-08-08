import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import BigNumber from "bignumber.js";
import { MichelsonMap } from "@taquito/taquito";

import type {
  PastaUiLivePreparedOperation,
  PastaUiLivePublicReceipt,
  PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import {
  createRotiniUiLiveCheckpoint,
  openRotiniUiLiveCheckpoint,
  ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
  type CreateRotiniUiLiveCheckpointInput,
  type RotiniUiLiveCheckpointActor,
  type RotiniUiLiveExpectedOperation,
} from "./shadownet-rotini-ui-live-checkpoint";
import { SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const CODE = [
  { prim: "parameter", args: [{ prim: "unit" }] },
  { prim: "storage", args: [{ prim: "unit" }] },
  { prim: "code", args: [[{ prim: "CAR" }, { prim: "NIL", args: [{ prim: "operation" }] }, { prim: "PAIR" }]] },
];
const RAW_HASH = "a".repeat(64);
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

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createInput(checkpointRoot: string): CreateRotiniUiLiveCheckpointInput {
  return {
    checkpointRoot,
    runId: "pasta-alpha-proof-20260722-test",
    createdAt: "2026-07-22T20:00:00.000Z",
    chainId: SHADOWNET_CHAIN_ID,
    actors: { creator: CREATOR, collector: COLLECTOR },
    contractIdentity: {
      artifactPath: "public/creation-tools/rotini/contract/pasta-generative-collection.contract.json",
      rawArtifactSha256: RAW_HASH,
      canonicalMichelsonCodeSha256: hashMichelsonScriptCode(CODE),
    },
  };
}

function actorAddress(actor: RotiniUiLiveCheckpointActor): string {
  return actor === "creator" ? CREATOR : COLLECTOR;
}

function prepared(expected: RotiniUiLiveExpectedOperation): PastaUiLivePreparedOperation {
  const common = {
    status: "PREPARED" as const,
    operationSequence: expected.operationSequence,
    timestampUtc: new Date(Date.parse("2026-07-22T20:00:00.000Z") + expected.globalOrdinal * 1_000).toISOString(),
    action: expected.action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: actorAddress(expected.actor),
    entrypoints: expected.entrypoint ? [expected.entrypoint] : [],
  };
  if (expected.action === "originate") {
    const metadata = new MichelsonMap<string, BigNumber>();
    metadata.set("", new BigNumber("900719925474099312345678901234567890"));
    return {
      ...common,
      descriptor: {
        kind: "originate",
        code: CODE,
        storage: { administrator: CREATOR, metadata, next_token_id: 900719925474099312345678901234567890n },
      },
    };
  }
  return {
    ...common,
    contractAddress: CONTRACT,
    descriptor: {
      kind: "call",
      call: {
        contractAddress: CONTRACT,
        entrypoint: expected.entrypoint!,
        payload: expected.entrypoint === "create_project"
          ? { output_mode: expected.operationSequence === 2 ? "png" : expected.operationSequence === 3 ? "gif" : "zip" }
          : expected.entrypoint === "reserve_iteration"
            ? Math.floor((expected.operationSequence - 1) / 2)
            : { reservation_id: Math.floor((expected.operationSequence - 2) / 2), artifact_sha256: "b".repeat(64) },
      },
      sendOptions: {},
    },
  };
}

function submitted(
  expected: RotiniUiLiveExpectedOperation,
  operation: PastaUiLivePreparedOperation,
): PastaUiLiveSubmittedOperation {
  return {
    ...operation,
    status: "SUBMITTED",
    timestampUtc: new Date(Date.parse(operation.timestampUtc) + 250).toISOString(),
    operationHash: OPERATION_HASHES[expected.globalOrdinal - 1],
    ...(expected.action === "originate" ? { contractAddress: CONTRACT } : {}),
  };
}

function confirmedReceipt(
  expected: RotiniUiLiveExpectedOperation,
  operationHash = OPERATION_HASHES[expected.globalOrdinal - 1],
): PastaUiLivePublicReceipt {
  return {
    schema: "pastaprotocol-ui-live-receipt@1",
    sequence: expected.globalOrdinal,
    timestampUtc: new Date(Date.parse("2026-07-22T20:00:00.000Z") + expected.globalOrdinal * 1_000 + 500).toISOString(),
    action: expected.action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: actorAddress(expected.actor),
    contractAddress: CONTRACT,
    operationHash,
    ...(expected.entrypoint ? { entrypoints: [expected.entrypoint] } : {}),
  };
}

function pinProof(bytes: Uint8Array, index: number) {
  const digest = sha256(bytes);
  const cid = `bafkrei${digest.slice(0, 52)}`;
  return {
    cid,
    uri: `ipfs://${cid}`,
    fileName: `rotini-proof-${index}.json`,
    mimeType: "application/json",
    byteLength: bytes.byteLength,
    sha256: digest,
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    publicGatewayVerified: true as const,
    verificationAttempts: 1,
  };
}

async function appendOperation(
  checkpoint: Awaited<ReturnType<typeof createRotiniUiLiveCheckpoint>>,
  expected: RotiniUiLiveExpectedOperation,
): Promise<void> {
  const before = prepared(expected);
  await checkpoint.beforeOperationSubmit(expected.actor, before);
  await checkpoint.onOperationSubmitted(expected.actor, submitted(expected, before));
  await checkpoint.onReceipt(expected.actor, confirmedReceipt(expected));
}

async function appendPins(
  checkpoint: Awaited<ReturnType<typeof createRotiniUiLiveCheckpoint>>,
  count: number,
  startIndex = 1,
): Promise<void> {
  for (let index = startIndex; index < startIndex + count; index += 1) {
    const bytes = Buffer.from(`{"index":${index}}`, "utf8");
    const proof = pinProof(bytes, index);
    const actor = index <= 13 ? "creator" : "collector";
    await checkpoint.beforePin(actor, { bytes, fileName: proof.fileName, mimeType: proof.mimeType });
    await checkpoint.onPin(actor, { proof });
    await checkpoint.onReceipt(actor, {
      schema: "pastaprotocol-ui-live-receipt@1",
      sequence: 100 + index,
      timestampUtc: new Date(Date.parse("2026-07-22T20:01:00.000Z") + index * 1_000).toISOString(),
      action: "pin_json",
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress: actorAddress(actor),
      cid: proof.cid,
      ipfsUri: proof.uri,
      publicGatewayUrl: proof.publicGatewayUrl,
      sha256: proof.sha256,
      byteCount: proof.byteLength,
      fileName: proof.fileName,
    });
  }
}

test("checkpoint resumes the exact five-operation thirteen-pin boundary and reaches a strict terminal state", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-checkpoint-"));
  const checkpointRoot = path.join(parent, "checkpoint");
  try {
    const checkpoint = await createRotiniUiLiveCheckpoint(createInput(checkpointRoot));
    await appendPins(checkpoint, 13);
    for (const expected of ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX.slice(0, 5)) {
      await appendOperation(checkpoint, expected);
    }

    const resumed = await openRotiniUiLiveCheckpoint(checkpointRoot);
    assert.deepEqual(resumed.summary(), {
      status: "ACTIVE",
      completedOperations: 5,
      pins: 13,
      nonOperationReceipts: 13,
      pendingOperation: null,
      pendingPin: null,
      pendingPinReceipts: [],
    });

    await appendPins(resumed, 2, 14);
    await appendOperation(resumed, ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[5]);
    await appendOperation(resumed, ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[6]);
    await appendPins(resumed, 2, 16);
    await appendOperation(resumed, ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[7]);
    await appendOperation(resumed, ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[8]);
    await appendPins(resumed, 3, 18);
    await appendOperation(resumed, ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[9]);

    const finalization = await resumed.finalize("2026-07-22T22:00:00.000Z");
    assert.equal(finalization.status, "FINALIZED");
    assert.deepEqual(finalization.counts.actors, { creator: 4, collector: 6 });
    assert.equal(finalization.counts.operations, 10);
    assert.equal(finalization.counts.pins, 20);
    assert.equal(finalization.counts.nonOperationReceipts, 20);

    const terminal = await openRotiniUiLiveCheckpoint(checkpointRoot);
    assert.deepEqual(terminal.summary(), {
      status: "FINALIZED",
      completedOperations: 10,
      pins: 20,
      nonOperationReceipts: 20,
      pendingOperation: null,
      pendingPin: null,
      pendingPinReceipts: [],
    });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("checkpoint durably records the exact ten-operation matrix, twenty pins, and non-operation receipts", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-checkpoint-"));
  const checkpointRoot = path.join(parent, "checkpoint");
  try {
    const checkpoint = await createRotiniUiLiveCheckpoint(createInput(checkpointRoot));
    await checkpoint.onReceipt("creator", {
      schema: "pastaprotocol-ui-live-receipt@1",
      sequence: 1,
      timestampUtc: "2026-07-22T20:00:00.100Z",
      action: "connect",
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress: CREATOR,
    });
    await appendPins(checkpoint, 20);
    for (const expected of ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX) await appendOperation(checkpoint, expected);
    const finalization = await checkpoint.finalize("2026-07-22T21:00:00.000Z");

    assert.equal(finalization.status, "FINALIZED");
    assert.deepEqual(finalization.counts.actors, { creator: 4, collector: 6 });
    assert.equal(finalization.counts.operations, 10);
    assert.equal(finalization.counts.pins, 20);
    assert.equal(finalization.counts.nonOperationReceipts, 21);
    assert.ok(finalization.artifacts.some((artifact) => artifact.path === "intent.json"));
    assert.ok(finalization.artifacts.some((artifact) => artifact.path === "final.json"));
    assert.equal((await readdir(path.join(checkpointRoot, "pins"))).length, 40);

    const reopened = await openRotiniUiLiveCheckpoint(checkpointRoot);
    assert.deepEqual(reopened.summary(), {
      status: "FINALIZED",
      completedOperations: 10,
      pins: 20,
      nonOperationReceipts: 21,
      pendingOperation: null,
      pendingPin: null,
      pendingPinReceipts: [],
    });
    const events = (await readdir(path.join(checkpointRoot, "events"))).sort();
    const preparedEvent = JSON.parse(await readFile(path.join(checkpointRoot, "events", events.find((name) => name.includes("-prepared-"))!), "utf8"));
    assert.equal(
      preparedEvent.operation.descriptor.storage.next_token_id.value,
      "900719925474099312345678901234567890",
    );
    assert.equal(preparedEvent.operation.descriptor.storage.metadata.type, "michelson-map");
    assert.equal(preparedEvent.operation.descriptor.storage.metadata.entries[0][1].value, "900719925474099312345678901234567890");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("checkpoint refuses an actor, sequence, or entrypoint outside the immutable matrix", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-checkpoint-"));
  try {
    const checkpoint = await createRotiniUiLiveCheckpoint(createInput(path.join(parent, "checkpoint")));
    const first = prepared(ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0]);
    await assert.rejects(checkpoint.beforeOperationSubmit("collector", first), /expected creator/i);
    await assert.rejects(
      checkpoint.beforeOperationSubmit("creator", { ...first, operationSequence: 2 }),
      /operation sequence 1/i,
    );
    await assert.rejects(
      checkpoint.beforeOperationSubmit("creator", {
        ...first,
        action: "call",
        contractAddress: CONTRACT,
        entrypoints: ["create_project"],
        descriptor: { kind: "call", call: { contractAddress: CONTRACT, entrypoint: "create_project", payload: {} }, sendOptions: {} },
      }),
      /origination/i,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("checkpoint keeps SUBMITTED state durable and rejects a mismatched confirmation", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-checkpoint-"));
  const checkpointRoot = path.join(parent, "checkpoint");
  try {
    const checkpoint = await createRotiniUiLiveCheckpoint(createInput(checkpointRoot));
    const expected = ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0];
    const before = prepared(expected);
    await checkpoint.beforeOperationSubmit("creator", before);
    await checkpoint.onOperationSubmitted("creator", submitted(expected, before));
    const reopened = await openRotiniUiLiveCheckpoint(checkpointRoot);
    assert.equal(reopened.summary().pendingOperation?.phase, "SUBMITTED");
    assert.equal(reopened.summary().pendingOperation?.operationHash, OPERATION_HASHES[0]);
    await assert.rejects(
      reopened.onReceipt("creator", confirmedReceipt(expected, OPERATION_HASHES[1])),
      /hash differs/i,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("checkpoint fsyncs PIN_PREPARED bytes before remote pinning and can reopen that boundary", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-checkpoint-"));
  const checkpointRoot = path.join(parent, "checkpoint");
  try {
    const checkpoint = await createRotiniUiLiveCheckpoint(createInput(checkpointRoot));
    const bytes = Buffer.from('{"prepared":true}', "utf8");
    const proof = pinProof(bytes, 1);
    await checkpoint.beforePin("creator", { bytes, fileName: proof.fileName, mimeType: proof.mimeType });
    assert.deepEqual(await readFile(path.join(checkpointRoot, "pins", "000001.bin")), bytes);

    const reopened = await openRotiniUiLiveCheckpoint(checkpointRoot);
    assert.deepEqual(reopened.summary().pendingPin, {
      actor: "creator",
      fileName: proof.fileName,
      sha256: proof.sha256,
    });
    await reopened.onPin("creator", { proof });
    await reopened.onReceipt("creator", {
      schema: "pastaprotocol-ui-live-receipt@1",
      sequence: 1,
      timestampUtc: "2026-07-22T20:30:00.000Z",
      action: "pin_json",
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress: CREATOR,
      cid: proof.cid,
      ipfsUri: proof.uri,
      publicGatewayUrl: proof.publicGatewayUrl,
      sha256: proof.sha256,
      byteCount: proof.byteLength,
      fileName: proof.fileName,
    });
    const reopenedAgain = await openRotiniUiLiveCheckpoint(checkpointRoot);
    assert.equal(reopenedAgain.summary().pins, 1);
    assert.deepEqual(reopenedAgain.summary().pendingPinReceipts, []);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("checkpoint enforces the twenty-pin ceiling and never derives paths from pin filenames", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-checkpoint-"));
  const checkpointRoot = path.join(parent, "checkpoint");
  try {
    const checkpoint = await createRotiniUiLiveCheckpoint(createInput(checkpointRoot));
    await appendPins(checkpoint, 20);
    const bytes = Buffer.from("extra");
    await assert.rejects(
      checkpoint.beforePin("collector", { bytes, fileName: "../escape.json", mimeType: "application/json" }),
      /file name|pin limit/i,
    );
    await assert.rejects(readFile(path.join(parent, "escape.json")), /ENOENT/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("checkpoint creation is exclusive and persisted tampering or symlinks fail closed", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-checkpoint-"));
  const checkpointRoot = path.join(parent, "checkpoint");
  try {
    await createRotiniUiLiveCheckpoint(createInput(checkpointRoot));
    await assert.rejects(createRotiniUiLiveCheckpoint(createInput(checkpointRoot)), /exist|overwrite/i);
    const intentPath = path.join(checkpointRoot, "intent.json");
    await writeFile(intentPath, `${await readFile(intentPath, "utf8")} `);
    await assert.rejects(openRotiniUiLiveCheckpoint(checkpointRoot), /canonical|hash|intent/i);

    const secondRoot = path.join(parent, "checkpoint-two");
    await createRotiniUiLiveCheckpoint(createInput(secondRoot));
    await symlink(path.join(secondRoot, "intent.json"), path.join(secondRoot, "events", "000001-receipt-creator.json"));
    await assert.rejects(openRotiniUiLiveCheckpoint(secondRoot), /symbolic link/i);

    const thirdRoot = path.join(parent, "checkpoint-three");
    const third = await createRotiniUiLiveCheckpoint(createInput(thirdRoot));
    await third.beforeOperationSubmit("creator", prepared(ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0]));
    await rename(
      path.join(thirdRoot, "events", "000001-prepared-creator.json"),
      path.join(thirdRoot, "events", "000001-receipt-collector.json"),
    );
    await assert.rejects(openRotiniUiLiveCheckpoint(thirdRoot), /event sequence drift/i);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("checkpoint rejects signer secrets before durable serialization", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-checkpoint-"));
  try {
    const checkpoint = await createRotiniUiLiveCheckpoint(createInput(path.join(parent, "checkpoint")));
    const expected = ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0];
    const operation = prepared(expected);
    (operation.descriptor as { storage: Record<string, unknown> }).storage.private_key = `edsk${"1".repeat(54)}`;
    await assert.rejects(checkpoint.beforeOperationSubmit("creator", operation), /credential|secret/i);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
