import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CompanionCreatorSetup } from "../src/creator-setup.mjs";
import { openJournal } from "../src/journal.mjs";

const DROP = "4b576a3e-e443-4c6e-b9e3-97c889502cc4";
const CREATOR = "tz1L3wUsNeRAeUCRHpzvM4Edwq4jDWcPU5r9";
const FINALIZER = "tz1RpFPa8165K6hQ96r1bmioU8aiaVQ4sZ7H";
const CONTRACT = "KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG";
const OPERATION = `o${"1".repeat(50)}`;

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-creator-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const journal = openJournal(path.join(root, "journal.sqlite"));
  t.after(() => journal.close());
  journal.createProject({
    dropRef: DROP,
    network: "shadownet",
    creator: CREATOR,
    creatorPublicKey: `edpk${"1".repeat(50)}`,
    administrator: CREATOR,
    treasury: CREATOR,
    physicalSupply: 1,
    assetStrategy: "pin_on_claim",
    releasePolicy: { kind: "immediate" },
    fulfillmentSubsidyMutez: 151_180,
    entropyHead: "a".repeat(64),
    entropyLength: 1,
    entropyKeyringPath: path.join(root, "entropy.enc"),
    signerAddress: FINALIZER,
  });
  journal.createUpload({ uploadId: "upload", dropRef: DROP, encryptedPath: path.join(root, "upload.enc"), checksumSha256: "b".repeat(64) });
  journal.saveStagedToken({
    dropRef: DROP,
    tokenId: 0,
    quantity: 1,
    metadataCommitment: "c".repeat(64),
    privateManifestPath: path.join(root, "manifest.enc"),
    artifactChecksum: "d".repeat(64),
    artifactEncryptedPath: path.join(root, "artifact.enc"),
    metadataChecksum: "e".repeat(64),
    metadataEncryptedPath: path.join(root, "metadata.enc"),
    uploadId: "upload",
  });
  journal.savePublicContractMetadata({
    dropRef: DROP,
    requestDigest: "f".repeat(64),
    contractMetadataUri: "ipfs://bafy-public-contract-metadata",
    publicCoverUri: "ipfs://bafy-public-cover",
    metadataChecksumSha256: "1".repeat(64),
    coverChecksumSha256: "2".repeat(64),
  });
  let candidates = [];
  let promptExpired = false;
  const watcher = {
    currentHeadLevel: async () => 100,
    creatorManagerKeyAtFinalized: async () => ({ level: 98, blockHash: "B98", observedHeadLevel: 100, key: `edpk${"2".repeat(50)}` }),
    estimateCreatorOrigination: async () => ({
      source: "live_tezos_rpc_estimate",
      gasLimit: 1,
      storageLimit: 1,
      suggestedFeeMutez: 1,
      totalCostMutez: 1,
      opSize: 1,
      finalOperationSizeBytes: 1,
    }),
    findFinalCreatorIntentCandidates: async () => ({ finalized: { level: 102, blockHash: "B102", observedHeadLevel: 104 }, rows: candidates }),
    hashlessCreatorIntentWindow: async () => ({
      finalized: { level: 102, blockHash: "B102", observedHeadLevel: 104 },
      indexedRows: candidates,
      canonicalRows: [],
      pendingRows: [],
      expired: promptExpired,
      promptHeadLevel: 100,
      maxOperationsTtl: 120,
    }),
    creatorSubmissionStatus: async () => ({ state: "indexed_final", rows: candidates, inclusionLevel: 100, headLevel: 102 }),
    finalizedHeadSnapshot: async () => ({ level: 102, blockHash: "B102", observedHeadLevel: 104 }),
    verifyContractBinding: async () => ({ storage: {} }),
  };
  const setup = new CompanionCreatorSetup({
    config: {},
    journal,
    watcher,
    projectService: {},
    runtime: {},
  });
  setup.buildOrigination = async () => ({
    code: [{ prim: "code" }],
    storage: { prim: "Pair", args: [] },
    codeDigest: "3".repeat(64),
    storageDigest: "4".repeat(64),
    abiVersion: "macaroni-secure-claim-v3.5",
    finalizer: FINALIZER,
    contractMetadataUri: "ipfs://bafy-public-contract-metadata",
  });
  setup.artifact = async () => ({ manifest: { protocolOperationDataLimitBytes: 32_768 } });
  const plan = {
    contractMetadataUri: "ipfs://bafy-public-contract-metadata",
    minterRoyalty: { enabled: false, bps: 0, mode: 0 },
    stages: [{ stage: 0, start: "2026-09-03T00:00:00.000Z", priceMutez: 1_000_000, useAllowlist: false, maxPerWallet: null }],
    allowlist: [],
  };
  return {
    journal,
    setup,
    plan,
    setCandidates: (rows) => { candidates = rows; },
    setPromptExpired: (value) => { promptExpired = value; },
  };
}

test("creator intent survives renderer death and hashlessly recovers exact finalized origination", async (t) => {
  const { journal, setup, plan, setCandidates } = await fixture(t);
  const issued = await setup.getNext(DROP, { plan });
  assert.equal(issued.state, "awaiting_signature");
  assert.equal(issued.action.step, "originate_contract");
  assert.equal(issued.action.liveEstimate.opSize, 1);
  assert.equal(journal.db.prepare("SELECT COUNT(*) AS count FROM creator_operation_attempts").get().count, 1);

  const prompt = await setup.promptStarted(DROP, issued.action.attemptId, issued.action.requestId);
  assert.equal(prompt.proceedToWalletSend, true);

  const crashRecovery = await setup.getNext(DROP, {});
  assert.equal(crashRecovery.state, "wallet_outcome_required");
  assert.match(crashRecovery.blocker, /Do not sign it again/);
  assert.equal(journal.db.prepare("SELECT COUNT(*) AS count FROM creator_operation_attempts").get().count, 1);

  setCandidates([{
    hash: OPERATION,
    status: "applied",
    sender: { address: CREATOR },
    contractBalance: 0,
    code: issued.action.parameters.code,
    storage: issued.action.parameters.storage,
    originatedContract: { address: CONTRACT },
    level: 100,
  }]);
  const recovered = await setup.getNext(DROP, {});
  assert.equal(recovered.state, "applied");
  assert.equal(recovered.action.operationHash, OPERATION);
  assert.equal(journal.getProject(DROP).contract_address, CONTRACT);
  assert.equal(journal.db.prepare("SELECT COUNT(*) AS count FROM creator_operation_attempts").get().count, 1);
});

test("creator actions accept the exact protocol boundary, reject one byte over, and split large batches", async (t) => {
  const { setup } = await fixture(t);
  const accepted = await setup.requireInjectableSize({ finalOperationSizeBytes: 32_768 });
  assert.equal(accepted.protocolOperationDataLimitBytes, 32_768);
  await assert.rejects(
    () => setup.requireInjectableSize({ finalOperationSizeBytes: 32_769 }),
    (error) => error.code === "creator_operation_too_large",
  );

  setup.liveTransfer = async (_project, _publicKey, _logicalStep, rows) => {
    if (rows.length > 4) {
      const error = new Error("exact final forged operation exceeds protocol limit");
      error.code = "creator_operation_too_large";
      throw error;
    }
    return { finalOperationSizeBytes: rows.length === 4 ? 32_768 : rows.length * 8_000 };
  };
  const rows = Array.from({ length: 11 }, (_, token_id) => ({ token_id }));
  const first = await setup.largestPrefix({}, "edpk-test", "add_tokens_v35", rows);
  const second = await setup.largestPrefix({}, "edpk-test", "add_tokens_v35", rows.slice(first.rows.length));
  const third = await setup.largestPrefix({}, "edpk-test", "add_tokens_v35", rows.slice(first.rows.length + second.rows.length));
  assert.deepEqual([first.rows.length, second.rows.length, third.rows.length], [4, 4, 3]);
});

test("wallet rejection needs an explicit no-broadcast assertion and preserves immutable retry intent", async (t) => {
  const { journal, setup, plan } = await fixture(t);
  const issued = await setup.getNext(DROP, { plan });
  assert.throws(() => setup.reject(DROP, issued.action.attemptId, "closed", false), /Confirm that the wallet rejected/);
  const rejected = setup.reject(DROP, issued.action.attemptId, "wallet rejected before broadcast", true);
  assert.equal(rejected.state, "wallet_rejected");
  const retried = await setup.getNext(DROP, {});
  assert.equal(retried.state, "awaiting_signature");
  assert.equal(retried.action.intentDigest, issued.action.intentDigest);
  assert.equal(journal.db.prepare("SELECT COUNT(*) AS count FROM creator_operation_attempts").get().count, 2);
});

test("wallet prompt quarantine rejects no-broadcast shortcuts and never retries merely because TTL elapsed", async (t) => {
  const { journal, setup, plan, setPromptExpired } = await fixture(t);
  const issued = await setup.getNext(DROP, { plan });
  await setup.promptStarted(DROP, issued.action.attemptId, issued.action.requestId);
  assert.throws(
    () => setup.reject(DROP, issued.action.attemptId, "send returned an uncertain error", true),
    /Only an awaiting-signature action/,
  );

  const quarantined = await setup.getNext(DROP, {});
  assert.equal(quarantined.state, "wallet_outcome_required");
  assert.match(quarantined.blocker, /fresh Tezos branch/);
  assert.equal(journal.db.prepare("SELECT COUNT(*) AS count FROM creator_operation_attempts").get().count, 1);

  setPromptExpired(true);
  const longOpenPrompt = await setup.getNext(DROP, {});
  assert.equal(longOpenPrompt.state, "wallet_outcome_required");
  assert.equal(longOpenPrompt.action.intentDigest, issued.action.intentDigest);
  assert.match(longOpenPrompt.blocker, /fresh Tezos branch/);
  assert.equal(journal.db.prepare("SELECT COUNT(*) AS count FROM creator_operation_attempts").get().count, 1);
});

test("only a raw identified remote Beacon ABORTED_ERROR event resolves a started prompt", async (t) => {
  const { journal, setup, plan } = await fixture(t);
  const issued = await setup.getNext(DROP, { plan });
  await setup.promptStarted(DROP, issued.action.attemptId, issued.action.requestId);
  assert.throws(() => setup.promptAborted(DROP, issued.action.attemptId, {
    requestId: "stale-request",
    beaconEvent: "OPERATION_REQUEST_ERROR",
    beaconErrorResponse: { type: "error", errorType: "ABORTED_ERROR", senderId: "2gVqsEAu6cQWGsD", id: "5f208a12-2df8-4aca-a1c6-b53a9fe289d2", version: "2" },
  }), (error) => error.code === "creator_request_mismatch");
  // Taquito's transformed catch error no longer carries the authenticated raw
  // Beacon response identity and can never release a retry by itself.
  assert.throws(() => setup.promptAborted(DROP, issued.action.attemptId, {
    requestId: issued.action.requestId,
    error: { errorType: "ABORTED_ERROR", message: "Aborted" },
  }), (error) => error.code === "wallet_abort_event_missing");
  assert.throws(() => setup.promptAborted(DROP, issued.action.attemptId, {
    requestId: issued.action.requestId,
    beaconEvent: "OPERATION_REQUEST_ERROR",
    beaconErrorResponse: { type: "error", errorType: "BROADCAST_ERROR", senderId: "2gVqsEAu6cQWGsD", id: "5f208a12-2df8-4aca-a1c6-b53a9fe289d2", version: "2" },
  }), (error) => error.code === "wallet_abort_not_authoritative");
  // Beacon's local DAppClient.createAbortedError has an empty senderId even
  // when it carries the open request id; it is deliberately non-authoritative.
  assert.throws(() => setup.promptAborted(DROP, issued.action.attemptId, {
    requestId: issued.action.requestId,
    beaconEvent: "OPERATION_REQUEST_ERROR",
    beaconErrorResponse: { type: "error", errorType: "ABORTED_ERROR", senderId: "", id: "5f208a12-2df8-4aca-a1c6-b53a9fe289d2", version: "2" },
  }), (error) => error.code === "wallet_abort_identity_missing");
  assert.throws(() => setup.promptAborted(DROP, issued.action.attemptId, {
    requestId: issued.action.requestId,
    beaconEvent: "OPERATION_REQUEST_ERROR",
    beaconErrorResponse: { type: "error", errorType: "ABORTED_ERROR", senderId: "not a sender", id: "not-a-beacon-request", version: "latest" },
  }), (error) => error.code === "wallet_abort_identity_missing");
  assert.equal(journal.activeCreatorAttempt(DROP).state, "wallet_prompt_started");

  const evidence = {
    requestId: issued.action.requestId,
    beaconEvent: "OPERATION_REQUEST_ERROR",
    beaconErrorResponse: { type: "error", errorType: "ABORTED_ERROR", senderId: "2gVqsEAu6cQWGsD", id: "5f208a12-2df8-4aca-a1c6-b53a9fe289d2", version: "2" },
  };
  const aborted = setup.promptAborted(DROP, issued.action.attemptId, evidence);
  assert.equal(aborted.state, "wallet_rejected");
  assert.equal(setup.promptAborted(DROP, issued.action.attemptId, evidence).state, "wallet_rejected");
  const persisted = journal.creatorAttempt(issued.action.attemptId);
  assert.equal(persisted.reconciliation.kind, "beacon_wallet_prompt_abort_v1");
  assert.match(persisted.reconciliation.responseIdentityDigest, /^[0-9a-f]{64}$/);
  assert.throws(() => setup.promptAborted(DROP, issued.action.attemptId, {
    ...evidence,
    beaconErrorResponse: { ...evidence.beaconErrorResponse, id: "a6cc7c23-2d8c-48aa-bf02-ffbcbd9444f5" },
  }), (error) => error.code === "wallet_abort_conflict");
  const retried = await setup.getNext(DROP, {});
  assert.equal(retried.state, "awaiting_signature");
  assert.equal(retried.action.intentDigest, issued.action.intentDigest);
  assert.equal(journal.db.prepare("SELECT COUNT(*) AS count FROM creator_operation_attempts").get().count, 2);
});
