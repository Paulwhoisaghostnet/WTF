import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";

import { serializePastaUiLiveStorageProjection } from "./pasta-ui-live-bridge-kit";
import {
  RAVIOLI_GNOCCHI_LE_ACCEPTED_MANIFEST_SHA256,
  RAVIOLI_GNOCCHI_LE_ACCEPTED_RECEIPT_SHA256,
  RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
  RAVIOLI_GNOCCHI_LE_CONTRACT,
  RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE,
  RAVIOLI_GNOCCHI_LE_EXECUTE_FLAG,
  RAVIOLI_GNOCCHI_LE_INDEXER_EVIDENCE_SCHEMA,
  RAVIOLI_GNOCCHI_LE_MAX_SUPPLY,
  RAVIOLI_GNOCCHI_LE_MINIMUM_FUTURE_MS,
  RAVIOLI_GNOCCHI_LE_OUTPUT_ENV,
  RAVIOLI_GNOCCHI_LE_RECEIPT_SCHEMA,
  RAVIOLI_GNOCCHI_LE_RECONCILE_FLAG,
  RAVIOLI_GNOCCHI_LE_RUN_ID,
  RAVIOLI_GNOCCHI_LE_TOKEN_ID,
  RAVIOLI_GNOCCHI_LE_WRAPPER_MARGIN_MS,
  assertRavioliGnocchiLeExecutionAllowed,
  assertRavioliGnocchiLeCollectionVerification,
  assertRavioliGnocchiLeReconciliationAllowed,
  assertRavioliGnocchiLeState,
  buildRavioliGnocchiLeCreateCall,
  buildRavioliGnocchiLeIntentCall,
  deriveRavioliGnocchiLePolicy,
  loadRavioliGnocchiLeAcceptedEvidence,
  projectRavioliGnocchiLeStorage,
  recommendedRavioliSaleEnd,
  ravioliGnocchiLeSendOptions,
  validateRavioliGnocchiLeCreateCall,
  validateRavioliGnocchiLeDependencyReceipt,
  validateRavioliGnocchiLeIntent,
  validateRavioliGnocchiLeUnmintedIndexerRecords,
  validateRavioliGnocchiLeOperationRows,
  type RavioliGnocchiLeAcceptedEvidence,
  type RavioliGnocchiLeDependencyReceipt,
} from "./shadownet-ravioli-gnocchi-le-dependency";
import { root, SHADOWNET_CHAIN_ID, utf8ToHex } from "./shadownet-proof-kit";

const NOW = Date.parse("2026-07-22T12:34:56.000Z");
const CID = "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
const MEDIA_CID = "bafkreifgfp5zypk5glsgvp6eb4oa3shjpeehlkoxhe47smdxe3qhycxboa";
const METADATA_URI = `ipfs://${CID}`;
const ARTIFACT_URI = `ipfs://${MEDIA_CID}`;
const OPERATION_HASH = "ooSDDfX2r1uq9eidSmKQJHzxQea71hRu3LaJzSDKSE3sW9TcnZH";
const ORIGINATION_HASH = "ooqQerwmFGorWABitNHN2fHYiTszK9VYB7UJhaRSciFp1pBEXKD";

function acceptedFixture(): RavioliGnocchiLeAcceptedEvidence {
  return {
    runId: RAVIOLI_GNOCCHI_LE_RUN_ID,
    contractAddress: RAVIOLI_GNOCCHI_LE_CONTRACT,
    administrator: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
    originationHash: ORIGINATION_HASH,
    historicalSnapshotPath: "artifacts/gnocchi-proof-time-indexer-snapshot.json",
    historicalSnapshotSha256: "0a37661d4f2588cb3410426f45591039be92cb1fac03e2f5cdf0aa41e2cb4936",
    manifestPath: "gnocchi/manifest.json",
    receiptPath: "gnocchi/artifacts/gnocchi-ui-live-run.json",
    manifestSha256: RAVIOLI_GNOCCHI_LE_ACCEPTED_MANIFEST_SHA256,
    receiptSha256: RAVIOLI_GNOCCHI_LE_ACCEPTED_RECEIPT_SHA256,
  };
}

function beforeState() {
  return {
    level: 4_300_000,
    administrator: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
    nextTokenId: 3,
    metadataUri: null,
    artifactUri: null,
    active: null,
    start: null,
    end: null,
    maxSupply: null,
    creatorReserve: 0,
    policyLocked: null,
    totalSupply: 0,
    totalMinted: 0,
    totalReserved: 0,
  };
}

function operationRow() {
  const policy = deriveRavioliGnocchiLePolicy(NOW);
  return {
    hash: OPERATION_HASH,
    status: "applied",
    level: 4_300_004,
    counter: "23832001",
    timestamp: "2026-07-22T12:40:00Z",
    amount: 0,
    sender: { address: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR },
    target: { address: RAVIOLI_GNOCCHI_LE_CONTRACT },
    parameter: {
      entrypoint: "create_open_edition",
      value: {
        token_info: { "": utf8ToHex(METADATA_URI) },
        sale: {
          active: true,
          start: policy.start,
          end: policy.end,
          base_price: "1",
          increment: "0",
          step_size: "1",
          min_price: null,
          max_price: null,
          max_supply: "3",
          treasury: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
        },
        creator_reserve: "0",
        lock_policy: true,
      },
    },
  };
}

function receiptFixture(): RavioliGnocchiLeDependencyReceipt {
  const policy = deriveRavioliGnocchiLePolicy(NOW);
  const operation = validateRavioliGnocchiLeOperationRows([operationRow()], {
    policy,
    metadataUri: METADATA_URI,
    beforeLevel: 4_300_000,
    beforeCounter: 23_832_000,
  });
  const screenshots = Array.from({ length: 4 }, (_, index) => ({
    stage: `00${index + 1}-stage`,
    path: `screenshots/00${index + 1}-stage.png`,
    sha256: String(index + 1).repeat(64),
    caption: index === 3 ? "ravioli-le-dependency: token three live" : `stage ${index + 1}`,
  }));
  const sidecars = screenshots.map((screenshot, index) => ({
    id: `screenshot-sidecar-00${index + 1}-stage`,
    kind: "screenshot-sidecar",
    path: `artifacts/screenshot-00${index + 1}-stage.json`,
    sha256: String(index + 5).repeat(64),
  }));
  return {
    schema: RAVIOLI_GNOCCHI_LE_RECEIPT_SCHEMA,
    classification: "UI-LIVE-SUPPLEMENT",
    status: "PASSED",
    completionMode: "direct",
    runId: RAVIOLI_GNOCCHI_LE_RUN_ID,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: "https://tezos-shadownet.octez.io/" },
    startedAt: new Date(NOW).toISOString(),
    completedAt: new Date(NOW + 10 * 60_000).toISOString(),
    acceptedGnocchi: acceptedFixture(),
    contract: {
      address: RAVIOLI_GNOCCHI_LE_CONTRACT,
      administrator: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}`,
    },
    token: {
      tokenId: RAVIOLI_GNOCCHI_LE_TOKEN_ID,
      metadataUri: METADATA_URI,
      artifactUri: ARTIFACT_URI,
      maxSupply: RAVIOLI_GNOCCHI_LE_MAX_SUPPLY,
      creatorReserve: RAVIOLI_GNOCCHI_LE_CREATOR_RESERVE,
      active: true,
      policyLocked: true,
      start: policy.start,
      end: policy.end,
      recommendedRavioliSaleEnd: policy.recommendedRavioliSaleEnd,
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}/tokens/3`,
    },
    policy,
    operation,
    before: beforeState(),
    after: {
      ...beforeState(),
      level: 4_300_005,
      nextTokenId: 4,
      metadataUri: METADATA_URI,
      artifactUri: ARTIFACT_URI,
      active: true,
      start: policy.start,
      end: policy.end,
      maxSupply: 3,
      policyLocked: true,
    },
    indexing: {
      lifecycle: "DEFINED_UNMINTED",
      tokenRecordPresentBeforeFirstMint: false,
      tokenRecordRequiredBeforeFirstMint: false,
      tokenRecordRequiredAfterRavioliOpen: true,
      evidencePath: "artifacts/gnocchi-le-tzkt-unminted-indexing.json",
      evidenceSha256: "9".repeat(64),
    },
    signerLanesBefore: [
      { rpcUrl: "https://tezos-shadownet.octez.io", counter: 23_832_000, balanceMutez: 10_000_000, activeOperationCount: 0 },
      { rpcUrl: "https://tcinfra.net/rpc/tezos/shadownet", counter: 23_832_000, balanceMutez: 10_000_000, activeOperationCount: 0 },
    ],
    signerLanesAfter: [
      { rpcUrl: "https://tezos-shadownet.octez.io", counter: 23_832_001, balanceMutez: 9_900_000, activeOperationCount: 0 },
      { rpcUrl: "https://tcinfra.net/rpc/tezos/shadownet", counter: 23_832_001, balanceMutez: 9_900_000, activeOperationCount: 0 },
    ],
    intentSha256: "a".repeat(64),
    progressSha256: "b".repeat(64),
    screenshots,
    artifacts: [
      { id: "gnocchi-le-token-3-media", kind: "token-media", path: "artifacts/token-3-media.png", sha256: "c".repeat(64) },
      { id: "gnocchi-le-token-3-metadata", kind: "token-metadata", path: "artifacts/token-3-metadata.json", sha256: "d".repeat(64) },
      { id: "gnocchi-le-intent", kind: "write-intent", path: "artifacts/gnocchi-le-intent.json", sha256: "e".repeat(64) },
      { id: "gnocchi-le-progress", kind: "write-progress", path: "artifacts/gnocchi-le-progress.json", sha256: "f".repeat(64) },
      { id: "gnocchi-le-tzkt-operation", kind: "indexer-operation", path: "artifacts/gnocchi-le-tzkt-operation.json", sha256: "0".repeat(64) },
      { id: "gnocchi-le-unminted-indexing", kind: "indexer-lifecycle", path: "artifacts/gnocchi-le-tzkt-unminted-indexing.json", sha256: "9".repeat(64) },
      ...sidecars,
    ],
    links: {
      contract: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}`,
      token: `https://shadownet.tzkt.io/${RAVIOLI_GNOCCHI_LE_CONTRACT}/tokens/3`,
      operation: `https://shadownet.tzkt.io/${OPERATION_HASH}`,
      metadata: METADATA_URI,
      artifact: ARTIFACT_URI,
    },
  };
}

test("future LE policy leaves at least 48 hours and a one-hour Ravioli safety margin", () => {
  const policy = deriveRavioliGnocchiLePolicy(NOW);
  assert.ok(Date.parse(policy.start) <= NOW);
  assert.ok(Date.parse(policy.end) - NOW >= RAVIOLI_GNOCCHI_LE_MINIMUM_FUTURE_MS);
  assert.equal(Date.parse(policy.end) - Date.parse(policy.recommendedRavioliSaleEnd), RAVIOLI_GNOCCHI_LE_WRAPPER_MARGIN_MS);
  assert.equal(recommendedRavioliSaleEnd(policy.end), policy.recommendedRavioliSaleEnd);
  assert.equal(policy.maxSupply, 3);
  assert.equal(policy.creatorReserve, 0);
  assert.equal(policy.policyLocked, true);
});

test("execution and reconciliation gates are explicit, exact-run, Shadownet-only, and mutually exclusive", () => {
  assert.throws(() => assertRavioliGnocchiLeExecutionAllowed({}), /explicit/);
  assert.throws(() => assertRavioliGnocchiLeExecutionAllowed({
    [RAVIOLI_GNOCCHI_LE_EXECUTE_FLAG]: "1",
    TEZOS_NETWORK: "mainnet",
    [RAVIOLI_GNOCCHI_LE_OUTPUT_ENV]: `/tmp/${RAVIOLI_GNOCCHI_LE_RUN_ID}`,
  }), /only permits Shadownet/);
  assert.throws(() => assertRavioliGnocchiLeExecutionAllowed({
    [RAVIOLI_GNOCCHI_LE_EXECUTE_FLAG]: "1",
    [RAVIOLI_GNOCCHI_LE_RECONCILE_FLAG]: "1",
    [RAVIOLI_GNOCCHI_LE_OUTPUT_ENV]: `/tmp/${RAVIOLI_GNOCCHI_LE_RUN_ID}`,
  }), /mutually exclusive/);
  assert.equal(assertRavioliGnocchiLeExecutionAllowed({
    [RAVIOLI_GNOCCHI_LE_EXECUTE_FLAG]: "1",
    TEZOS_NETWORK: "shadownet",
    [RAVIOLI_GNOCCHI_LE_OUTPUT_ENV]: `/tmp/${RAVIOLI_GNOCCHI_LE_RUN_ID}`,
  }), `/tmp/${RAVIOLI_GNOCCHI_LE_RUN_ID}`);
  assert.throws(() => assertRavioliGnocchiLeReconciliationAllowed({}), /explicit/);
  assert.equal(assertRavioliGnocchiLeReconciliationAllowed({
    [RAVIOLI_GNOCCHI_LE_RECONCILE_FLAG]: "1",
    [RAVIOLI_GNOCCHI_LE_OUTPUT_ENV]: `/tmp/${RAVIOLI_GNOCCHI_LE_RUN_ID}`,
  }), `/tmp/${RAVIOLI_GNOCCHI_LE_RUN_ID}`);
});

test("the exact browser create call requires token metadata, capped timed sale, zero reserve, and a locked policy", () => {
  const policy = deriveRavioliGnocchiLePolicy(NOW);
  const call = buildRavioliGnocchiLeCreateCall(METADATA_URI, policy);
  assert.doesNotThrow(() => validateRavioliGnocchiLeCreateCall(call, { metadataUri: METADATA_URI, policy }));
  assert.deepEqual(buildRavioliGnocchiLeIntentCall(METADATA_URI, policy), {
    contractAddress: RAVIOLI_GNOCCHI_LE_CONTRACT,
    entrypoint: "create_open_edition",
    payload: {
      metadataUri: METADATA_URI,
      sale: {
        active: true,
        start: policy.start,
        end: policy.end,
        basePriceMutez: 1,
        incrementMutez: 0,
        stepSize: 1,
        minPriceMutez: null,
        maxPriceMutez: null,
        maxSupply: 3,
        treasury: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
      },
      creatorReserve: 0,
      policyLocked: true,
    },
  });
  assert.throws(() => validateRavioliGnocchiLeCreateCall({
    ...call,
    payload: { ...call.payload, creator_reserve: 1 },
  }, { metadataUri: METADATA_URI, policy }), /creator reserve/);
  assert.throws(() => validateRavioliGnocchiLeCreateCall({
    ...call,
    payload: { ...call.payload, lock_policy: false },
  }, { metadataUri: METADATA_URI, policy }), /must be locked/);
});

test("the exact estimate is bound to explicit call limits and a deterministic fee tip", () => {
  assert.deepEqual(ravioliGnocchiLeSendOptions({
    gasLimit: 4_500,
    storageLimit: 640,
    suggestedFeeMutez: 900,
    minimalFeeMutez: 875,
    burnFeeMutez: 160_000,
  }), {
    amount: 0,
    mutez: true,
    fee: 1_000,
    gasLimit: 4_500,
    storageLimit: 640,
  });
  assert.throws(() => ravioliGnocchiLeSendOptions({
    gasLimit: 0,
    storageLimit: 0,
    suggestedFeeMutez: 0,
    minimalFeeMutez: 0,
    burnFeeMutez: 0,
  }), /gas must be positive/);
});

test("restart intent binds accepted bytes, pre-state, dual counters, pins, estimate, and canonical call", () => {
  const policy = deriveRavioliGnocchiLePolicy(NOW);
  const estimate = {
    gasLimit: 4_500,
    storageLimit: 640,
    suggestedFeeMutez: 900,
    minimalFeeMutez: 875,
    burnFeeMutez: 160_000,
  };
  const intent = {
    schema: "pastaprotocol-ravioli-gnocchi-le-dependency-intent@1",
    status: "AUTHORIZED-NOT-YET-SUBMITTED",
    runId: RAVIOLI_GNOCCHI_LE_RUN_ID,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: "https://tezos-shadownet.octez.io/" },
    createdAt: new Date(NOW).toISOString(),
    acceptedGnocchi: acceptedFixture(),
    before: beforeState(),
    signerLanesBefore: [
      { rpcUrl: "https://tezos-shadownet.octez.io", counter: 23_832_000, balanceMutez: 10_000_000, activeOperationCount: 0 },
      { rpcUrl: "https://tcinfra.net/rpc/tezos/shadownet", counter: 23_832_000, balanceMutez: 10_000_000, activeOperationCount: 0 },
    ],
    policy,
    metadataUri: METADATA_URI,
    artifactUri: ARTIFACT_URI,
    pins: [
      {
        id: "gnocchi-le-token-3-media",
        kind: "token-media",
        path: "artifacts/token-3-media.png",
        sha256: "1".repeat(64),
        ipfsUri: ARTIFACT_URI,
        gatewayUrl: `https://ipfs.io/ipfs/${MEDIA_CID}`,
        retrievedSha256: "1".repeat(64),
      },
      {
        id: "gnocchi-le-token-3-metadata",
        kind: "token-metadata",
        path: "artifacts/token-3-metadata.json",
        sha256: "2".repeat(64),
        ipfsUri: METADATA_URI,
        gatewayUrl: `https://ipfs.io/ipfs/${CID}`,
        retrievedSha256: "2".repeat(64),
      },
    ],
    estimate,
    sendOptions: ravioliGnocchiLeSendOptions(estimate),
    call: buildRavioliGnocchiLeIntentCall(METADATA_URI, policy),
  };
  assert.doesNotThrow(() => validateRavioliGnocchiLeIntent(intent, acceptedFixture()));
  assert.throws(() => validateRavioliGnocchiLeIntent({
    ...intent,
    signerLanesBefore: [intent.signerLanesBefore[0], { ...intent.signerLanesBefore[1], counter: 23_832_001 }],
  }, acceptedFixture()), /RPC counters disagree/);
  assert.throws(() => validateRavioliGnocchiLeIntent({
    ...intent,
    sendOptions: { ...intent.sendOptions, gasLimit: 4_501 },
  }, acceptedFixture()), /not estimate-bound/);
});

test("bounded existing-collection projection exposes only tokens zero through three", async () => {
  const maps = Object.fromEntries(
    ["sales", "total_supply", "total_minted", "policy_locked", "token_metadata"].map((name) => [name, new MichelsonMap<string, unknown>()]),
  ) as Record<string, MichelsonMap<string, unknown>>;
  const deeplyNestedUnusedValue: Record<string, unknown> = {};
  let cursor = deeplyNestedUnusedValue;
  for (let depth = 0; depth < 32; depth += 1) {
    cursor.next = {};
    cursor = cursor.next as Record<string, unknown>;
  }
  for (let tokenId = 0; tokenId < 4; tokenId += 1) {
    const key = String(tokenId);
    maps.sales.set(key, {
      active: true,
      start: { Some: "2026-07-22T00:00:00.000Z" },
      end: { Some: "2026-07-29T00:00:00.000Z" },
      base_price: 1,
      increment: 0,
      step_size: 1,
      min_price: null,
      max_price: null,
      max_supply: { Some: 3 },
      treasury: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
      providerInternals: deeplyNestedUnusedValue,
    });
    maps.total_supply.set(key, 0);
    maps.total_minted.set(key, 0);
    maps.policy_locked.set(key, true);
    maps.token_metadata.set(key, deeplyNestedUnusedValue);
  }
  const projected = await projectRavioliGnocchiLeStorage({
    administrator: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
    next_token_id: 4,
    ...maps,
  });
  assert.equal(projected.next_token_id, 4);
  assert.deepEqual((projected.sales as MichelsonMap<string, unknown>).get("3"), {
    active: true,
    start: "2026-07-22T00:00:00.000Z",
    end: "2026-07-29T00:00:00.000Z",
    base_price: 1,
    increment: 0,
    step_size: 1,
    min_price: null,
    max_price: null,
    max_supply: 3,
    treasury: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR,
  });
  assert.equal((projected.token_metadata as MichelsonMap<string, unknown>).size, 0);
  assert.doesNotThrow(() => serializePastaUiLiveStorageProjection(projected));
  await assert.rejects(() => projectRavioliGnocchiLeStorage({ ...maps, administrator: RAVIOLI_GNOCCHI_LE_ADMINISTRATOR, next_token_id: 5 }));
});

test("TzKT operation acceptance binds applied status, exact signer, target, counter, policy, and metadata", () => {
  const policy = deriveRavioliGnocchiLePolicy(NOW);
  const operation = validateRavioliGnocchiLeOperationRows([operationRow()], {
    policy,
    metadataUri: METADATA_URI,
    beforeLevel: 4_300_000,
    beforeCounter: 23_832_000,
  });
  assert.equal(operation.hash, OPERATION_HASH);
  assert.equal(operation.counter, 23_832_001);
  assert.equal(operation.level, 4_300_004);
  assert.throws(() => validateRavioliGnocchiLeOperationRows([{ ...operationRow(), status: "backtracked" }], {
    policy, metadataUri: METADATA_URI, beforeLevel: 4_300_000, beforeCounter: 23_832_000,
  }), /exactly one matching applied/);
  assert.throws(() => validateRavioliGnocchiLeOperationRows([{
    ...operationRow(),
    parameter: { ...operationRow().parameter, value: { ...operationRow().parameter.value, creator_reserve: "1" } },
  }], {
    policy, metadataUri: METADATA_URI, beforeLevel: 4_300_000, beforeCounter: 23_832_000,
  }), /creator reserve/);
});

test("zero-supply LE definitions do not require a TzKT token row until Ravioli mints the allocation", () => {
  assert.deepEqual(validateRavioliGnocchiLeUnmintedIndexerRecords([], METADATA_URI), {
    tokenRecordPresent: false,
    recordCount: 0,
  });
  assert.deepEqual(validateRavioliGnocchiLeUnmintedIndexerRecords([{
    contract: { address: RAVIOLI_GNOCCHI_LE_CONTRACT },
    tokenId: String(RAVIOLI_GNOCCHI_LE_TOKEN_ID),
    totalSupply: "0",
    metadata: { uri: METADATA_URI },
  }], METADATA_URI), {
    tokenRecordPresent: true,
    recordCount: 1,
  });
  assert.throws(() => validateRavioliGnocchiLeUnmintedIndexerRecords([{
    contract: { address: RAVIOLI_GNOCCHI_LE_CONTRACT },
    tokenId: String(RAVIOLI_GNOCCHI_LE_TOKEN_ID),
    totalSupply: "1",
  }], METADATA_URI), /0/);
  assert.equal(RAVIOLI_GNOCCHI_LE_INDEXER_EVIDENCE_SCHEMA, "pastaprotocol-ravioli-gnocchi-le-indexing@1");
});

test("before and after state predicates reject pre-existing token three and mutable terminal policy", () => {
  const policy = deriveRavioliGnocchiLePolicy(NOW);
  assert.doesNotThrow(() => assertRavioliGnocchiLeState(beforeState(), "before"));
  assert.throws(() => assertRavioliGnocchiLeState({ ...beforeState(), nextTokenId: 4 }, "before"), /exactly 3/);
  const after = {
    ...beforeState(),
    level: 4_300_005,
    nextTokenId: 4,
    metadataUri: METADATA_URI,
    artifactUri: ARTIFACT_URI,
    active: true,
    start: policy.start,
    end: policy.end,
    maxSupply: 3,
    policyLocked: true,
  };
  assert.doesNotThrow(() => assertRavioliGnocchiLeState(after, "after", { metadataUri: METADATA_URI, artifactUri: ARTIFACT_URI, policy }));
  assert.throws(() => assertRavioliGnocchiLeState({ ...after, policyLocked: false }, "after", {
    metadataUri: METADATA_URI, artifactUri: ARTIFACT_URI, policy,
  }), /false !== true/);
});

test("accepted dependency loader binds the exact immutable Gnocchi manifest and UI receipt bytes", async () => {
  const runRoot = path.join(root, "artifacts", "pasta-protocol-proof-runs", RAVIOLI_GNOCCHI_LE_RUN_ID);
  const loaded = await loadRavioliGnocchiLeAcceptedEvidence(runRoot);
  assert.deepEqual(loaded.accepted, acceptedFixture());
});

test("supplement receipt exposes every integration field and rejects LE or evidence drift", () => {
  const receipt = receiptFixture();
  assert.doesNotThrow(() => validateRavioliGnocchiLeDependencyReceipt(receipt));
  assert.throws(() => validateRavioliGnocchiLeDependencyReceipt({
    ...receipt,
    token: { ...receipt.token, creatorReserve: 1 as 0 },
  }), /1 !== 0/);
  assert.throws(() => validateRavioliGnocchiLeDependencyReceipt({
    ...receipt,
    acceptedGnocchi: { ...receipt.acceptedGnocchi, manifestSha256: "0".repeat(64) as typeof RAVIOLI_GNOCCHI_LE_ACCEPTED_MANIFEST_SHA256 },
  }), /manifestSha256/);
  assert.throws(() => validateRavioliGnocchiLeDependencyReceipt({
    ...receipt,
    screenshots: receipt.screenshots.map((entry) => ({ ...entry, sha256: "1".repeat(64) })),
  }), /1 !== 4/);
  assert.throws(() => validateRavioliGnocchiLeDependencyReceipt({
    ...receipt,
    indexing: { ...receipt.indexing, tokenRecordRequiredBeforeFirstMint: true as false },
  }), /tokenRecordRequiredBeforeFirstMint|strictly deep-equal/);
});

test("runner is wired to the real Gnocchi existing-collection controls and a pre-submit intent barrier", async () => {
  const source = await readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-ravioli-gnocchi-le-dependency.ts"), "utf8");
  for (const selector of ["#publishTarget", "#existingCollectionKt", "#btnVerifyCollection", "#saleMode", "#saleStart", "#saleEnd", "#saleMaxSupply", "#creatorReserve", "#lockPolicy", "#oeArtifact", "#btnPublish"]) {
    assert.ok(source.includes(JSON.stringify(selector)), `runner does not use real Gnocchi control ${selector}`);
  }
  assert.match(source, /AUTHORIZED-NOT-YET-SUBMITTED/);
  assert.match(source, /await release\.promise/);
  assert.match(source, /existing-collection supplement forbids origination/);
});

test("existing-collection verification reports the Studio failure notice instead of hiding behind a success wait", () => {
  assert.doesNotThrow(() => assertRavioliGnocchiLeCollectionVerification(
    "Verified administrator · next edition will be token #3",
    "Collection verified.",
  ));
  assert.throws(() => assertRavioliGnocchiLeCollectionVerification(
    "",
    "Collection verification failed: RPC request timed out",
  ), /Collection verification failed: RPC request timed out/);
  assert.throws(() => assertRavioliGnocchiLeCollectionVerification("", ""), /no visible notice/);
});
