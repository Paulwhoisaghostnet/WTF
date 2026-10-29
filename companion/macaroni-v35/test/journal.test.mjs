import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertPublicJournalPayload, openJournal } from "../src/journal.mjs";

const SIGNER = "tz1finalizer";

async function journalFixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-journal-"));
  const journal = openJournal(path.join(directory, "journal.sqlite"));
  t.after(() => {
    journal.close();
    return rm(directory, { recursive: true, force: true });
  });
  return { directory, journal };
}

function createProject(journal, dropRef, suffix = "a") {
  journal.createProject({
    dropRef,
    network: "shadownet",
    creator: `creator-${suffix}`,
    administrator: `admin-${suffix}`,
    treasury: `treasury-${suffix}`,
    physicalSupply: 2,
    assetStrategy: "pin_on_claim",
    releasePolicy: { kind: "immediate" },
    fulfillmentSubsidyMutez: 1000,
    entropyHead: suffix.repeat(64).slice(0, 64),
    entropyLength: 2,
    entropyKeyringPath: `/private/${suffix}.entropy.enc`,
    signerAddress: SIGNER,
  });
  journal.attachContract(dropRef, `KT1-contract-${suffix}`);
  journal.setProjectState(dropRef, "active");
}

function settlementWork(journal, dropRef, semanticKey) {
  return journal.enqueue({
    dropRef,
    workType: "settle_claim",
    semanticKey,
    payload: { claimId: 0 },
    eligibleAt: 1,
  });
}

function readyAttempt(journal, work, dropRef) {
  return journal.createReadyAttempt({
    workItemId: work.id,
    requestId: `${dropRef}:settlement`,
    intentIdentity: { protocol: "test", claimId: 0 },
    expectedPostcondition: { claimId: 0 },
    network: "shadownet",
    signer: SIGNER,
    target: `KT1-${dropRef}`,
    entrypoint: "settle_claims_v35",
    amountMutez: 0,
  });
}

test("journal rejects nested camelCase secret-bearing payload keys", () => {
  for (const value of [
    { nested: { seedPreimage: "hidden" } },
    { nested: [{ metadataUri: "not-even-an-ipfs-value" }] },
    { rawAssetBytes: "hidden" },
    { signerKeyMaterial: "hidden" },
    { privateCidMap: "hidden" },
  ]) assert.throws(() => assertPublicJournalPayload(value), /forbidden/);
  assert.doesNotThrow(() => assertPublicJournalPayload({ claimId: 2, allocationDigest: "public-commitment" }));
});

test("same artifact bytes cannot be staged as two token rows", async (t) => {
  const { journal } = await journalFixture(t);
  createProject(journal, "drop-duplicate", "a");
  for (const [uploadId, tokenId] of [["upload-a", 0], ["upload-b", 1]]) {
    journal.createUpload({
      uploadId,
      dropRef: "drop-duplicate",
      encryptedPath: `/private/${uploadId}.enc`,
      checksumSha256: uploadId.padEnd(64, "0").slice(0, 64),
    });
    const input = {
      dropRef: "drop-duplicate",
      tokenId,
      quantity: 1,
      metadataCommitment: String(tokenId + 1).repeat(64).slice(0, 64),
      privateManifestPath: `/private/manifest-${tokenId}.enc`,
      artifactChecksum: "f".repeat(64),
      artifactEncryptedPath: `/private/artifact-${tokenId}.enc`,
      metadataChecksum: String(tokenId + 2).repeat(64).slice(0, 64),
      metadataEncryptedPath: `/private/metadata-${tokenId}.enc`,
      uploadId,
    };
    if (tokenId === 0) journal.saveStagedToken(input);
    else assert.throws(() => journal.saveStagedToken(input), /UNIQUE constraint failed/);
  }
  assert.equal(journal.listTokens("drop-duplicate").length, 1);
});

test("signed work survives a crash lease and finalizer signing is globally single-flight", async (t) => {
  const { journal } = await journalFixture(t);
  createProject(journal, "drop-a", "a");
  createProject(journal, "drop-b", "b");
  const firstWork = settlementWork(journal, "drop-a", "claim-0");
  readyAttempt(journal, firstWork, "drop-a");
  journal.persistSigned({
    workItemId: firstWork.id,
    operationHash: "operation-a",
    signedBytesPath: "/private/a.signed.enc",
    signedBytesSha256: "a".repeat(64),
    branch: "block-a",
    branchLevel: 100,
    managerCounter: "7",
  });
  const leasedAfterRestart = journal.leaseNext({ owner: "restarted-worker", durationMs: 1000, now: Date.now() });
  assert.equal(leasedAfterRestart.id, firstWork.id);
  assert.equal(journal.getOperationForWork(firstWork.id).signed_attempt_state, "signed");

  const secondWork = settlementWork(journal, "drop-b", "claim-0");
  assert.throws(() => readyAttempt(journal, secondWork, "drop-b"), /serialized across projects/);

  journal.expireSignedAttempt(firstWork.id, { reason: "branch_beyond_protocol_ttl", headLevel: 300, branchLevel: 100 });
  journal.persistSigned({
    workItemId: firstWork.id,
    operationHash: "operation-a-replacement",
    signedBytesPath: "/private/a-2.signed.enc",
    signedBytesSha256: "b".repeat(64),
    branch: "block-b",
    branchLevel: 300,
    managerCounter: "8",
  });
  const replacement = journal.getOperationForWork(firstWork.id);
  assert.equal(replacement.attempt_number, 2);
  assert.equal(replacement.operation_hash, "operation-a-replacement");
  assert.equal(journal.db.prepare("SELECT COUNT(*) AS count FROM signed_operation_attempts").get().count, 2);

  journal.reconcileOperation(firstWork.id, "applied", { confirmations: 3 });
  journal.completeWork(firstWork.id);
  assert.doesNotThrow(() => readyAttempt(journal, secondWork, "drop-b"));
});

test("manual review preserves the unresolved signed intent's global signing guard", async (t) => {
  const { journal } = await journalFixture(t);
  createProject(journal, "drop-review-a", "a");
  createProject(journal, "drop-review-b", "b");
  const work = settlementWork(journal, "drop-review-a", "claim-0");
  readyAttempt(journal, work, "drop-review-a");
  journal.persistSigned({
    workItemId: work.id,
    operationHash: "operation-awaiting-chain-proof",
    signedBytesPath: "/private/awaiting-chain-proof.enc",
    signedBytesSha256: "a".repeat(64),
    branch: "block-a",
    branchLevel: 100,
    managerCounter: "7",
  });
  journal.manualReviewWork(work.id, "fifo_cursor_changed");
  assert.equal(journal.listAttentionWork("drop-review-a")[0].id, work.id);
  assert.equal(journal.getOperationForWork(work.id).signed_attempt_state, "signed");
  assert.throws(() => readyAttempt(journal, settlementWork(journal, "drop-review-b", "claim-0"), "drop-review-b"), /serialized across projects/);
});

test("a finalized exact failure permits a linked successor but an unproved failure does not", async (t) => {
  const { journal } = await journalFixture(t);
  createProject(journal, "drop-failed", "a");
  const work = settlementWork(journal, "drop-failed", "claim-0");
  readyAttempt(journal, work, "drop-failed");
  journal.persistSigned({
    workItemId: work.id,
    operationHash: "operation-failed",
    signedBytesPath: "/private/failed.signed.enc",
    signedBytesSha256: "a".repeat(64),
    branch: "block-a",
    branchLevel: 100,
    managerCounter: "7",
  });
  assert.throws(() => journal.reconcileOperation(work.id, "failed", { reason: "operation_failed" }), /finalized exact-operation evidence/);
  journal.reconcileOperation(work.id, "failed", {
    reason: "operation_failed", operationHash: "operation-failed", level: 110, finalizedAtHeadLevel: 112,
  });
  journal.manualReviewWork(work.id, "operation_failed");
  journal.retryWork(work.id, Date.now(), "Operator requested a chain-checked recovery");
  journal.persistSigned({
    workItemId: work.id,
    operationHash: "operation-successor",
    signedBytesPath: "/private/successor.signed.enc",
    signedBytesSha256: "b".repeat(64),
    branch: "block-b",
    branchLevel: 113,
    managerCounter: "8",
  });
  assert.equal(journal.getOperationForWork(work.id).attempt_number, 2);
  assert.equal(journal.getOperationForWork(work.id).operation_hash, "operation-successor");
});
