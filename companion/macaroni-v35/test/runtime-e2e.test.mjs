import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { CompanionFulfillmentRuntime } from "../src/fulfillment.mjs";
import { openJournal } from "../src/journal.mjs";
import { CompanionProjectService } from "../src/project-service.mjs";

const DROP_REF = "10000000-0000-4000-8000-000000000001";
const UPLOAD_REF = "20000000-0000-4000-8000-000000000002";
const DISPLAY_UPLOAD_REF = "20000000-0000-4000-8000-000000000003";
const THUMBNAIL_UPLOAD_REF = "20000000-0000-4000-8000-000000000004";
const COVER_UPLOAD_REF = "20000000-0000-4000-8000-000000000005";
const CONTRACT = "KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG";
const CREATOR = "tz1fextP23D6Ph2zeGTP8EwkP5Y8TufeFCHA";
const BUYER = "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU";
const TREASURY = "tz1M9CMEtsXm3QxA7FmMU2Qh7xzsuGXVbcDr";

test("operator recovery holds a changed-precondition signature and retries only after chain evidence", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-attention-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const journal = openJournal(path.join(directory, "journal.sqlite"));
  t.after(() => journal.close());
  journal.createProject({
    dropRef: DROP_REF,
    network: "shadownet",
    creator: CREATOR,
    administrator: CREATOR,
    treasury: TREASURY,
    physicalSupply: 1,
    assetStrategy: "pin_on_claim",
    releasePolicy: { kind: "immediate" },
    fulfillmentSubsidyMutez: 1000,
    entropyHead: "a".repeat(64),
    entropyLength: 1,
    entropyKeyringPath: "/private/entropy.enc",
    signerAddress: CREATOR,
  });
  journal.attachContract(DROP_REF, CONTRACT);
  journal.setProjectState(DROP_REF, "active");
  const work = journal.enqueue({ dropRef: DROP_REF, claimRef: "0", workType: "settle_claim", semanticKey: "0:settle_claims_v35", payload: { claimId: 0 } });
  journal.createReadyAttempt({
    workItemId: work.id,
    requestId: `${DROP_REF}:settle`,
    intentIdentity: { claimId: 0 },
    expectedPostcondition: { claimId: 0 },
    network: "shadownet",
    signer: CREATOR,
    target: CONTRACT,
    entrypoint: "settle_claims_v35",
    amountMutez: 0,
  });
  journal.persistSigned({
    workItemId: work.id,
    operationHash: "operation-immutable",
    signedBytesPath: "/private/signed.enc",
    signedBytesSha256: "b".repeat(64),
    branch: "BMbranch",
    branchLevel: 100,
    managerCounter: "7",
  });
  let chainState = "fifo_cursor_changed";
  const runtime = new CompanionFulfillmentRuntime({
    config: { workerOwner: "attention-test" },
    journal,
    watcher: { preparedSettlementStatus: async () => ({ state: chainState }) },
    projectService: null,
    blockTimingMs: 1000,
  });
  runtime.wake = async () => {};
  await runtime.ensureExactAttemptInjected({
    work,
    project: journal.getProject(DROP_REF),
    operationRef: "claim-0",
    prepare: async () => { throw new Error("A persisted signature must never be replaced here"); },
    status: async () => ({ state: chainState }),
  });
  const unresolved = (await runtime.attentionStatus(DROP_REF))[0];
  assert.equal(unresolved.chainState, "fifo_cursor_changed");
  assert.equal(unresolved.retrySafe, false);
  assert.equal((await runtime.retryAttention(DROP_REF, work.id)).accepted, false);
  assert.equal(journal.getWork(work.id).state, "manual_review");
  assert.equal(journal.getOperationForWork(work.id).operation_intent_state, "signed");
  chainState = "chain_included";
  assert.equal((await runtime.retryAttention(DROP_REF, work.id)).accepted, true);
  assert.equal(journal.getWork(work.id).state, "retry_wait");
  assert.equal(journal.getOperationForWork(work.id).operation_hash, "operation-immutable");
  journal.reconcileOperation(work.id, "failed", {
    reason: "operation_failed", operationHash: "operation-immutable", level: 120, finalizedAtHeadLevel: 122,
  });
  journal.manualReviewWork(work.id, "operation_failed");
  const finalizedFailure = (await runtime.attentionStatus(DROP_REF))[0];
  assert.equal(finalizedFailure.chainState, "failed");
  assert.equal(finalizedFailure.retrySafe, true);
  assert.equal((await runtime.retryAttention(DROP_REF, work.id)).accepted, true);
});

test("unfunded pre-sign settlement parks with a safe setup diagnostic instead of retrying forever", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-setup-blocker-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const journal = openJournal(path.join(directory, "journal.sqlite"));
  t.after(() => journal.close());
  journal.createProject({
    dropRef: DROP_REF, network: "shadownet", creator: CREATOR, administrator: CREATOR,
    treasury: TREASURY, physicalSupply: 1, assetStrategy: "pin_on_claim",
    releasePolicy: { kind: "immediate" }, fulfillmentSubsidyMutez: 1000,
    entropyHead: "a".repeat(64), entropyLength: 1,
    entropyKeyringPath: "/private/entropy.enc", signerAddress: CREATOR,
  });
  journal.attachContract(DROP_REF, CONTRACT);
  journal.setProjectState(DROP_REF, "active");
  const work = journal.enqueue({ dropRef: DROP_REF, claimRef: "0", workType: "settle_claim", semanticKey: "0:settle_claims_v35", payload: { claimId: 0 } });
  const runtime = new CompanionFulfillmentRuntime({
    config: { workerOwner: "setup-blocker" }, journal, watcher: {}, projectService: null, blockTimingMs: 1000,
  });
  runtime.scanProject = async () => {};
  runtime.processWork = async () => { throw new Error("Finalizer wallet has 0 mutez but this operation requires 1000 mutez"); };
  await runtime.tickOnce();
  assert.equal(journal.getWork(work.id).state, "manual_review");
  assert.equal((await runtime.attentionStatus(DROP_REF))[0].diagnostic, "finalizer_funding_or_reveal");
  assert.equal((await runtime.attentionStatus(DROP_REF))[0].retrySafe, true);
});

function signedResult(label, branchLevel, counter) {
  const signedBytes = Buffer.from(`signed-${label}`).toString("hex");
  return {
    operationHash: `operation-${label}`,
    signedBytes,
    signedBytesSha256: createHash("sha256").update(Buffer.from(signedBytes, "hex")).digest("hex"),
    branch: `branch-${label}`,
    branchLevel,
    managerCounter: String(counter),
  };
}

test("finalized attachment, on-chain arming, and post-settlement artifact-then-metadata publication", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = {
    network: "shadownet",
    expectedChainId: "NetXsqzbfFenSTS",
    dataDir: directory,
    privateAssetDir: path.join(directory, "private-assets"),
    uploadDir: path.join(directory, "uploads"),
    tempDir: path.join(directory, "tmp"),
    journalPath: path.join(directory, "journal.sqlite"),
    masterKeyFile: path.join(directory, "master.key"),
    publicBaseUrl: "https://companion.test",
    collectorOrigin: "https://drop.test",
    allowedOrigins: ["https://drop.test"],
    allowLoopbackCollector: false,
    duplicateCheckMode: "private_full_scan",
    workerOwner: "runtime-e2e",
    pinning: { adapter: "test" },
    templatePath: new URL("../contract/macaroni-v35.template.json", import.meta.url),
  };
  await writeFile(config.masterKeyFile, Buffer.alloc(32, 9), { mode: 0o600 });
  const measuredFunding = JSON.parse(await readFile(config.templatePath, "utf8")).measuredFundingPolicy;
  const journal = openJournal(config.journalPath);
  t.after(() => journal.close());

  let phase = "closed";
  let claimsSettled = 0;
  let finalizerRevealed = true;
  let finalizerBalance = BigInt(measuredFunding.fiveSettlementStartupMutez + 400);
  let contractVisibleAtFinalizedBlock = false;
  const finalizedBlock = "BMfinalizedContractSnapshot";
  const events = [];
  const storage = () => ({
    setup_finalized: true,
    sale_activated: phase === "active",
    sale_active: false,
    sale_permanently_closed: false,
    fulfillment_armed: phase !== "closed",
    final_sweep_complete: claimsSettled === 1,
    claims_created: phase === "active" ? 1 : 0,
    claims_settled: claimsSettled,
    next_claim_to_settle: claimsSettled,
    supply: 1,
    release_policy: { immediate: {} },
  });
  const watcher = {
    signerAddress: CREATOR,
    finalizedHeadSnapshot: async () => ({ level: 498, blockHash: finalizedBlock, observedHeadLevel: 500 }),
    verifyContractBinding: async (_project, _tokens, options = {}) => {
      if (options.requirePristine && (options.atBlock !== finalizedBlock || !contractVisibleAtFinalizedBlock)) {
        throw new Error("Contract is not present in the finalized snapshot");
      }
      return { storage: storage() };
    },
    activationFunding: async () => ({
      hasFreeStage: false,
      requiredMutez: BigInt(measuredFunding.fiveSettlementStartupMutez),
      balanceMutez: BigInt(measuredFunding.fiveSettlementStartupMutez),
      sufficient: true,
    }),
    estimateArmFulfillmentCost: async () => 400,
    finalizerFunding: async (requiredMutez) => ({
      revealed: finalizerRevealed,
      sufficient: finalizerBalance >= BigInt(requiredMutez),
      balanceMutez: finalizerBalance,
      requiredMutez: BigInt(requiredMutez),
    }),
    duplicateCidCheck: async (rows) => ({ checked: rows.length, matches: [], mode: "private_full_scan" }),
    scanClaims: async ({ fromClaimId }) => ({
      storage: storage(),
      claims: phase === "active" && fromClaimId === 0 ? [{
        claimId: 0,
        buyer: BUYER,
        recipient: BUYER,
        unit: 0,
        purchaseLevel: 123,
        purchaseTime: Date.now() - 1000,
        stageId: 0,
      }] : [],
      claimsCreated: phase === "active" ? 1 : 0,
      claimsSettled,
      nextClaimToSettle: claimsSettled,
      supply: 1,
      level: 500,
    }),
    releaseEligibleAt: () => Date.now(),
    currentHeadLevel: async () => 500,
    prepareArmFulfillment: async () => signedResult("arm", 500, 1),
    preparedArmStatus: async () => ({ state: "safe_to_inject_exact_bytes" }),
    injectSignedSettlement: async ({ operationHash }) => events.push(`inject:${operationHash}`),
    reconcileArmFulfillment: async () => {
      phase = "armed";
      return { status: "applied", transactionId: 1, level: 500, finalizedAtHeadLevel: 502, confirmations: 3 };
    },
    verifyAllocationBoundary: async () => undefined,
    prepareSettlement: async () => signedResult("claim-0", 502, 2),
    preparedSettlementStatus: async () => ({ state: "safe_to_inject_exact_bytes" }),
    reconcileSettlement: async () => {
      claimsSettled = 1;
      return { status: "applied", transactionId: 2, level: 502, finalizedAtHeadLevel: 504, confirmations: 3 };
    },
  };
  const pinningAdapter = {
    publishCommittedCar: async ({ expectedCid }) => events.push(`publish:${expectedCid}`),
    verifyPublishedCid: async (expectedCid) => events.push(`verify:${expectedCid}`),
  };
  let collectorProof = "ready";
  const service = new CompanionProjectService({
    config,
    journal,
    watcher,
    pinningAdapter,
    fetchImpl: async (url, init) => {
      assert.equal(String(url), `https://companion.test/v1/public/projects/${DROP_REF}/status`);
      assert.equal(init.headers.Origin, "https://drop.test");
      return Response.json({
        schema: "pasta.macaroni-companion-public-status.v1",
        network: "shadownet",
        contract: collectorProof === "wrong_identity" ? "KT1DifferentContractIdentity1111111111111" : CONTRACT,
      }, { headers: { "access-control-allow-origin": collectorProof === "wrong_cors" ? "https://other.test" : "https://drop.test" } });
    },
  });
  await service.initializeDirectories();
  await assert.rejects(() => service.registerProject({
    dropRef: "40000000-0000-4000-8000-000000000004",
    network: "shadownet",
    creator: CREATOR,
    administrator: CREATOR,
    treasury: TREASURY,
    physicalSupply: 1,
    assetStrategy: "pin_on_claim",
    releasePolicy: { kind: "immediate" },
    claimIntervalSeconds: 1,
    fulfillmentSubsidyMutez: measuredFunding.minimumFulfillmentSubsidyMutez,
  }), (error) => error.code === "claim_interval_not_applicable");
  await assert.rejects(() => service.registerProject({
    dropRef: "30000000-0000-4000-8000-000000000003",
    network: "shadownet",
    creator: CREATOR,
    administrator: CREATOR,
    treasury: TREASURY,
    physicalSupply: 1,
    assetStrategy: "pin_on_claim",
    releasePolicy: { kind: "immediate" },
    fulfillmentSubsidyMutez: measuredFunding.minimumFulfillmentSubsidyMutez - 1,
  }), (error) => error.code === "subsidy_below_measured_cost");
  await service.registerProject({
    dropRef: DROP_REF,
    network: "shadownet",
    creator: CREATOR,
    administrator: CREATOR,
    treasury: TREASURY,
    physicalSupply: 1,
    assetStrategy: "pin_on_claim",
    releasePolicy: { kind: "immediate" },
    fulfillmentSubsidyMutez: measuredFunding.minimumFulfillmentSubsidyMutez,
  });
  await service.uploadArtifact({ dropRef: DROP_REF, uploadId: COVER_UPLOAD_REF, source: Readable.from(Buffer.from("public collection cover")) });
  const publicMetadata = await service.pinPublicContractMetadata(DROP_REF, {
    uploadId: COVER_UPLOAD_REF,
    name: "Runtime collection",
    description: "Canonical TZIP-16 metadata fixture",
    homepage: "https://example.test/runtime",
  });
  assert.equal(publicMetadata.state, "pinned_verified");
  assert.match(publicMetadata.contractMetadataUri, /^ipfs:\/\//);
  assert.match(publicMetadata.publicCoverUri, /^ipfs:\/\//);
  events.length = 0;
  const rawArtifact = Buffer.from("private original artwork bytes", "utf8");
  await service.uploadArtifact({ dropRef: DROP_REF, uploadId: UPLOAD_REF, source: Readable.from(rawArtifact) });
  await service.uploadArtifact({ dropRef: DROP_REF, uploadId: DISPLAY_UPLOAD_REF, source: Readable.from(Buffer.from("private display bytes")) });
  await service.uploadArtifact({ dropRef: DROP_REF, uploadId: THUMBNAIL_UPLOAD_REF, source: Readable.from(Buffer.from("private thumbnail bytes")) });
  await service.stageToken({
    dropRef: DROP_REF,
    tokenId: 0,
    quantity: 1,
    uploadId: UPLOAD_REF,
    displayUploadId: DISPLAY_UPLOAD_REF,
    thumbnailUploadId: THUMBNAIL_UPLOAD_REF,
    metadata: { name: "Private original", description: "Runtime fixture" },
  });
  const privateMaterial = (await service.privateTokenMaterial(DROP_REF, 0)).material;
  await assert.rejects(() => service.attachContract(DROP_REF, CONTRACT), /not present in the finalized snapshot/);
  assert.equal(journal.getProject(DROP_REF).contract_address, null);
  contractVisibleAtFinalizedBlock = true;
  await service.attachContract(DROP_REF, CONTRACT);
  finalizerRevealed = false;
  await assert.rejects(() => service.preflight(DROP_REF), (error) => error.code === "finalizer_not_revealed");
  finalizerRevealed = true;
  finalizerBalance = 1n;
  await assert.rejects(() => service.preflight(DROP_REF), (error) => error.code === "finalizer_underfunded");
  finalizerBalance = BigInt(measuredFunding.fiveSettlementStartupMutez + 400);
  collectorProof = "wrong_cors";
  await assert.rejects(() => service.preflight(DROP_REF), (error) => error.code === "collector_cors_identity_mismatch");
  collectorProof = "wrong_identity";
  await assert.rejects(() => service.preflight(DROP_REF), (error) => error.code === "collector_status_identity_mismatch");
  assert.equal(journal.getWorkByKey(DROP_REF, "arm_fulfillment", "arm_fulfillment:v1"), null);
  collectorProof = "ready";
  const preflight = await service.preflight(DROP_REF);
  assert.equal(preflight.readyForCreatorActivation, false);
  assert.equal(preflight.onChainFulfillmentArmed, false);

  const runtime = new CompanionFulfillmentRuntime({ config, journal, watcher, projectService: service, blockTimingMs: 1 });
  await runtime.tickOnce();
  assert.equal(service.publicProjectStatus(DROP_REF).readyForCreatorActivation, true);
  assert.equal(journal.getWorkByKey(DROP_REF, "arm_fulfillment", "arm_fulfillment:v1").state, "completed");

  phase = "active";
  await service.activate(DROP_REF);
  await runtime.tickOnce();
  const status = service.publicProjectStatus(DROP_REF);
  assert.equal(status.state, "complete");
  assert.equal(status.progress.nftReady, 1);
  const claim = service.publicClaimStatus(DROP_REF, 0);
  assert.equal(claim.state, "nft_ready");
  assert.equal(claim.tokenId, 0);

  const publishEvents = events.filter((event) => event.startsWith("publish:"));
  assert.equal(publishEvents.length, 4);
  assert.equal(events.indexOf(publishEvents[0]) < events.indexOf(publishEvents[1]), true);
  assert.equal(events.indexOf(publishEvents[1]) < events.indexOf(publishEvents[2]), true);
  assert.equal(events.indexOf(publishEvents[2]) < events.indexOf(publishEvents[3]), true);
  assert.equal(events.indexOf("inject:operation-claim-0") < events.indexOf(publishEvents[0]), true);

  const publicPayload = JSON.stringify({
    status,
    claim,
    staticManifest: await service.publicStaticManifest(DROP_REF),
    admin: service.adminProject(DROP_REF),
  });
  assert.equal(publicPayload.includes(publicMetadata.contractMetadataUri), true);
  assert.equal(publicPayload.includes(publicMetadata.publicCoverUri), true);
  assert.equal(publicPayload.includes(privateMaterial.artifactCid), false);
  assert.equal(publicPayload.includes(privateMaterial.metadataCid), false);
  assert.equal(publicPayload.includes("private original artwork bytes"), false);
  assert.equal(publicPayload.toLowerCase().includes("preimage"), false);
  assert.equal(publicPayload.toLowerCase().includes("nonce"), false);
  const journalPayloads = journal.db.prepare("SELECT payload_json FROM work_items").all().map((row) => row.payload_json).join("\n");
  assert.equal(journalPayloads.includes("ipfs://"), false);
  assert.equal(journalPayloads.includes(rawArtifact.toString("utf8")), false);
  assert.equal(service.adminProject(DROP_REF).publicStaticManifestUrl, "https://companion.test/v1/public/projects/10000000-0000-4000-8000-000000000001/static-manifest");
  assert.equal(service.adminProject(DROP_REF).claimStatusUrlTemplate, "https://companion.test/v1/public/projects/10000000-0000-4000-8000-000000000001/claims/{claimId}");
  assert.equal(service.adminProject(DROP_REF).purchaseStatusUrlTemplate, "https://companion.test/v1/public/projects/10000000-0000-4000-8000-000000000001/purchases/{operationHash}");
  assert.equal(service.adminProject(DROP_REF).wakeUrl, "https://companion.test/v1/public/projects/10000000-0000-4000-8000-000000000001/wake");
  assert.equal((await service.publicStaticManifest(DROP_REF)).claimStatusUrlTemplate, "https://companion.test/v1/public/projects/10000000-0000-4000-8000-000000000001/claims/{claimId}");
  config.publicBaseUrl = "http://127.0.0.1:47835";
  config.collectorOrigin = "http://127.0.0.1:30771";
  config.allowedOrigins = ["http://127.0.0.1:30771"];
  assert.equal(service.adminProject(DROP_REF).publicStaticManifestUrl, null);
  assert.equal(service.adminProject(DROP_REF).claimStatusUrlTemplate, null);
  assert.equal(service.adminProject(DROP_REF).purchaseStatusUrlTemplate, null);
  assert.equal(service.adminProject(DROP_REF).wakeUrl, null);
  await assert.rejects(() => service.publicStaticManifest(DROP_REF), (error) => error.code === "collector_loopback_not_exportable");
  const signedCiphertext = await readFile(journal.getOperationForWork(
    journal.getWorkByKey(DROP_REF, "settle_claim", "0:settle_claims_v35").id,
  ).signed_bytes_path);
  assert.equal(signedCiphertext.includes(Buffer.from("signed-claim-0")), false);
});

test("rolling-delay claim interval durably defers FIFO settlement from the prior finalized claim", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-claim-pacing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const journal = openJournal(path.join(directory, "journal.sqlite"));
  t.after(() => journal.close());
  const dropRef = "50000000-0000-4000-8000-000000000005";
  journal.createProject({
    dropRef,
    network: "shadownet",
    creator: CREATOR,
    administrator: CREATOR,
    treasury: TREASURY,
    physicalSupply: 2,
    assetStrategy: "pin_on_claim",
    releasePolicy: { kind: "rolling_delay", seconds: 0 },
    claimIntervalSeconds: 30,
    fulfillmentSubsidyMutez: 151180,
    entropyHead: "a".repeat(64),
    entropyLength: 2,
    entropyKeyringPath: "/private/entropy.enc",
    signerAddress: CREATOR,
  });
  journal.attachContract(dropRef, CONTRACT);
  journal.setProjectState(dropRef, "active");
  for (let claimId = 0; claimId < 2; claimId += 1) {
    journal.upsertClaim({
      dropRef,
      claimId,
      buyer: BUYER,
      recipient: BUYER,
      unit: claimId,
      purchaseLevel: 100 + claimId,
      purchaseTime: Date.now() - 1000,
      stageId: 0,
    });
  }
  journal.setClaimState(dropRef, 0, "artwork_secured", { operationHash: "operation-prior-final" });
  const priorSettledAt = journal.getClaim(dropRef, 0).settled_at;
  const work = journal.enqueue({
    dropRef,
    claimRef: "1",
    workType: "settle_claim",
    semanticKey: "1:settle_claims_v35",
    payload: { claimId: 1 },
    eligibleAt: Date.now(),
  });
  const runtime = new CompanionFulfillmentRuntime({
    config: { workerOwner: "pacing-test" },
    journal,
    watcher: {},
    projectService: null,
    blockTimingMs: 1,
  });
  await runtime.processSettlement(work, journal.getProject(dropRef), 1);
  const deferred = journal.getWork(work.id);
  assert.equal(deferred.state, "retry_wait");
  assert.equal(deferred.next_attempt_at, priorSettledAt + 30_000);
});

test("pre-activation permanent close resolves arm work without stranding a canceled drop", async (t) => {
  for (const scenario of ["before_signature", "after_persisted_signature", "after_arm_applied"]) {
    await t.test(scenario, async (subtest) => {
      const directory = await mkdtemp(path.join(os.tmpdir(), `macaroni-v35-arm-close-${scenario}-`));
      subtest.after(() => rm(directory, { recursive: true, force: true }));
      const journal = openJournal(path.join(directory, "journal.sqlite"));
      subtest.after(() => journal.close());
      const dropRef = `closed-${scenario}`;
      journal.createProject({
        dropRef,
        network: "shadownet",
        creator: CREATOR,
        administrator: CREATOR,
        treasury: TREASURY,
        physicalSupply: 1,
        assetStrategy: "pin_on_claim",
        releasePolicy: { kind: "immediate" },
        fulfillmentSubsidyMutez: 100000,
        entropyHead: "a".repeat(64),
        entropyLength: 1,
        entropyKeyringPath: "/private/entropy.enc",
        signerAddress: CREATOR,
      });
      journal.attachContract(dropRef, CONTRACT);
      journal.setProjectState(dropRef, "armed");
      const armWork = journal.enqueue({
        dropRef,
        workType: "arm_fulfillment",
        semanticKey: "arm_fulfillment:v1",
        payload: {},
        eligibleAt: Date.now(),
      });
      if (scenario !== "before_signature") {
        journal.createReadyAttempt({
          workItemId: armWork.id,
          requestId: `${dropRef}:arm`,
          intentIdentity: { protocol: "macaroni-v35-arm-fulfillment.v1", contract: CONTRACT },
          expectedPostcondition: { fulfillmentArmed: true },
          network: "shadownet",
          signer: CREATOR,
          target: CONTRACT,
          entrypoint: "arm_fulfillment",
          amountMutez: 0,
        });
        journal.persistSigned({
          workItemId: armWork.id,
          operationHash: `operation-arm-${scenario}`,
          signedBytesPath: `/private/${scenario}.signed.enc`,
          signedBytesSha256: "b".repeat(64),
          branch: "BMarmBranch",
          branchLevel: 10,
          managerCounter: "1",
        });
      }
      if (scenario === "after_arm_applied") {
        journal.reconcileOperation(armWork.id, "applied", {
          inclusionLevel: 11,
          finalizedAtHeadLevel: 12,
          confirmations: 3,
        });
      }
      const watcher = {
        scanClaims: async () => ({
          storage: {
            sale_activated: false,
            sale_active: false,
            sale_permanently_closed: true,
            fulfillment_armed: scenario === "after_arm_applied",
            final_sweep_complete: true,
            release_policy: { immediate: {} },
            claims_created: 0,
            claims_settled: 0,
            supply: 1,
          },
          claims: [],
          claimsCreated: 0,
          claimsSettled: 0,
          nextClaimToSettle: 0,
          supply: 1,
          level: 20,
        }),
        verifyContractBinding: async () => ({ storage: {} }),
        preparedArmStatus: async () => ({
          state: "safe_to_retire_closed",
          reason: "closed_sale_and_expired_arm_absent_from_canonical_window",
          branchLevel: 10,
          headLevel: 20,
          maxOperationsTtl: 5,
        }),
      };
      const runtime = new CompanionFulfillmentRuntime({
        config: { workerOwner: `close-${scenario}` },
        journal,
        watcher,
        projectService: null,
        blockTimingMs: 1,
      });
      await runtime.tickOnce();
      assert.equal(journal.getWork(armWork.id).state, "completed");
      assert.equal(journal.getProject(dropRef).state, "complete");
      const operation = journal.getOperationForWork(armWork.id);
      if (scenario === "after_persisted_signature") {
        assert.equal(operation.signed_attempt_state, "expired");
        assert.equal(operation.operation_intent_state, "obsolete");
      }
      if (scenario === "after_arm_applied") assert.equal(operation.signed_attempt_state, "applied");
    });
  }
});

test("permanent undersold close releases sellout-policy claims and completes after final sweep", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-close-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const journal = openJournal(path.join(directory, "journal.sqlite"));
  t.after(() => journal.close());
  journal.createProject({
    dropRef: "closed-drop",
    network: "shadownet",
    creator: CREATOR,
    administrator: CREATOR,
    treasury: TREASURY,
    physicalSupply: 10,
    assetStrategy: "pin_on_claim",
    releasePolicy: { kind: "sellout" },
    fulfillmentSubsidyMutez: 100000,
    entropyHead: "a".repeat(64),
    entropyLength: 10,
    entropyKeyringPath: "/private/entropy.enc",
    signerAddress: CREATOR,
  });
  journal.attachContract("closed-drop", CONTRACT);
  journal.setProjectState("closed-drop", "active");
  let settled = false;
  const watcher = {
    scanClaims: async ({ fromClaimId }) => ({
      storage: {
        sale_activated: true,
        sale_active: false,
        sale_permanently_closed: true,
        fulfillment_armed: true,
        final_sweep_complete: settled,
        release_policy: { sellout: {} },
        claims_created: 1,
        claims_settled: settled ? 1 : 0,
        supply: 10,
      },
      claims: fromClaimId === 0 ? [{ claimId: 0, buyer: BUYER, recipient: BUYER, unit: 0, purchaseLevel: 12, purchaseTime: 10, stageId: 0 }] : [],
      claimsCreated: 1,
      claimsSettled: settled ? 1 : 0,
      nextClaimToSettle: settled ? 1 : 0,
      supply: 10,
      level: 20,
    }),
    releaseEligibleAt: (storage, _claim, now = Date.now()) => storage.sale_permanently_closed ? now : null,
  };
  const runtime = new CompanionFulfillmentRuntime({
    config: { workerOwner: "close-test" },
    journal,
    watcher,
    projectService: null,
    blockTimingMs: 1,
  });
  await runtime.scanProject(journal.getProject("closed-drop"));
  assert.equal(journal.getProject("closed-drop").state, "finishing");
  assert.equal(journal.getWorkByKey("closed-drop", "settle_claim", "0:settle_claims_v35")?.state, "queued");
  for (const row of journal.db.prepare("SELECT id FROM work_items WHERE drop_ref='closed-drop'").all()) journal.completeWork(row.id);
  journal.setClaimState("closed-drop", 0, "nft_ready", { operationHash: "operation-close" });
  settled = true;
  await runtime.scanProject(journal.getProject("closed-drop"));
  assert.equal(journal.getProject("closed-drop").state, "complete");
});
