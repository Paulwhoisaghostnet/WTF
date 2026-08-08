import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { b58Encode, PrefixV2 } from "@taquito/utils";

import {
  APP_ORDER,
  APP_PROOF_SCHEMA,
  GNOCCHI_HISTORICAL_INDEXER_SCHEMA,
  ProofPackageError,
  RAVIOLI_MODE_MAX_SUPPLIES,
  RAVIOLI_MODE_OPEN_COUNTS,
  RAVIOLI_V3_JOURNAL_ACTOR_COUNTS,
  RAVIOLI_V3_DEPENDENCY_ORIGINATION_COUNT,
  RAVIOLI_V3_JOURNAL_ENTRYPOINT_COUNTS,
  RAVIOLI_V3_JOURNAL_ORIGINATION_COUNT,
  RAVIOLI_V3_JOURNAL_PIN_COUNT,
  RAVIOLI_V3_JOURNAL_WRITE_COUNT,
  SHADOWNET_CHAIN_ID,
  assembleProofPackage,
  validateProofRun,
} from "./assemble-proof-package.mjs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);
const CID = "bafybeigdyrzt5sfp7udm7hu76fbsclnmgqz3u7mvqfl5x7g4xkv7szm2vi";

function deterministicContractAddress(label) {
  return b58Encode(
    createHash("sha256").update(label, "utf8").digest().subarray(0, 20),
    PrefixV2.ContractHash,
  );
}

const CONTRACTS = Object.freeze({
  macaroni: "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i",
  spaghetti: "KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc",
  gnocchi: "KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK",
  ravioli: "KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB",
  rotini: "KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ",
  penne: "KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz",
  lasagna: "KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r",
});

const OPERATION_HASHES = Object.freeze(
  Array.from({ length: 160 }, (_, index) =>
    b58Encode(
      createHash("sha256").update(`pasta-proof-operation-${index}`, "utf8").digest(),
      PrefixV2.OperationHash,
    ),
  ),
);

const RAVIOLI_CONTRACTS = Object.freeze({
  gnocchi: CONTRACTS.gnocchi,
  rotini: CONTRACTS.rotini,
  blindController: deterministicContractAddress("ravioli-blind-controller"),
  router: CONTRACTS.ravioli,
  gnocchiAdapter: deterministicContractAddress("ravioli-gnocchi-adapter"),
  rotiniAdapter: deterministicContractAddress("ravioli-rotini-adapter"),
});

const RAVIOLI_MODE_NAMES = Object.freeze([
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
]);

const RAVIOLI_MODE_CAPABILITIES = Object.freeze(
  RAVIOLI_MODE_NAMES.map((mode) => `${mode}-ui-live-proof`),
);

const RAVIOLI_MODE_OPEN_SHAPES = Object.freeze([
  Object.freeze({
    actions: 1,
    escrow: 1,
    gnocchiFulfill: 0,
    gnocchiMint: 0,
    rotiniFulfill: 0,
    rotiniMint: 0,
  }),
  Object.freeze({
    actions: 1,
    escrow: 1,
    gnocchiFulfill: 0,
    gnocchiMint: 0,
    rotiniFulfill: 0,
    rotiniMint: 0,
  }),
  Object.freeze({
    actions: 1,
    escrow: 0,
    gnocchiFulfill: 1,
    gnocchiMint: 1,
    rotiniFulfill: 0,
    rotiniMint: 0,
  }),
  Object.freeze({
    actions: 2,
    escrow: 0,
    gnocchiFulfill: 0,
    gnocchiMint: 0,
    rotiniFulfill: 2,
    rotiniMint: 2,
  }),
  Object.freeze({
    actions: 3,
    escrow: 1,
    gnocchiFulfill: 1,
    gnocchiMint: 1,
    rotiniFulfill: 1,
    rotiniMint: 1,
  }),
]);

const RAVIOLI_MODE_PARTITIONS = Object.freeze([
  "mode-0-deterministic-vault",
  "mode-1-blind-funded-pool",
  "mode-2-blind-allocated-mint",
  "mode-3-blind-generative-mint",
  "mode-4-hybrid-atomic-pack",
]);

function buildRavioliV3SemanticFixturePlan() {
  const operations = [];
  const originate = (partition, target) => operations.push({
    partition,
    kind: "origination",
    target,
    entrypoint: null,
  });
  const call = (partition, target, entrypoint) => operations.push({
    partition,
    kind: entrypoint === "mint" ? "mint" : entrypoint === "open_pack" ? "open" : "manage",
    target,
    entrypoint,
  });
  const lifecycle = (partition, tokenId, recipeCount, blind) => {
    call(partition, "router", "create_pack");
    for (let serial = 0; serial < recipeCount; serial += 1) {
      call(partition, "router", "commit_recipe");
    }
    if (blind) {
      call(partition, "router", "finalize_blind_pack");
    } else {
      call(partition, "router", "finalize_pack");
      call(partition, "router", "mint");
      call(partition, "router", "set_sale");
    }
  };

  originate("infrastructure", "blindController");
  originate("infrastructure", "router");
  call(RAVIOLI_MODE_PARTITIONS[0], "gnocchi", "update_operators");
  lifecycle(RAVIOLI_MODE_PARTITIONS[0], 0, 1, false);
  call(RAVIOLI_MODE_PARTITIONS[1], "gnocchi", "update_operators");
  lifecycle(RAVIOLI_MODE_PARTITIONS[1], 1, 2, true);
  call(RAVIOLI_MODE_PARTITIONS[1], "router", "buy");
  call(RAVIOLI_MODE_PARTITIONS[1], "router", "buy");
  call(RAVIOLI_MODE_PARTITIONS[1], "router", "transfer");

  originate(RAVIOLI_MODE_PARTITIONS[2], "gnocchiAdapter");
  call(RAVIOLI_MODE_PARTITIONS[2], "gnocchi", "add_minter");
  call(RAVIOLI_MODE_PARTITIONS[2], "gnocchiAdapter", "create_allocation");
  call(RAVIOLI_MODE_PARTITIONS[2], "gnocchiAdapter", "add_router");
  lifecycle(RAVIOLI_MODE_PARTITIONS[2], 2, 1, true);

  originate(RAVIOLI_MODE_PARTITIONS[3], "rotiniAdapter");
  call(RAVIOLI_MODE_PARTITIONS[3], "rotini", "add_pack_minter");
  call(RAVIOLI_MODE_PARTITIONS[3], "rotiniAdapter", "create_resource");
  call(RAVIOLI_MODE_PARTITIONS[3], "rotiniAdapter", "add_router");
  lifecycle(RAVIOLI_MODE_PARTITIONS[3], 3, 1, true);

  call(RAVIOLI_MODE_PARTITIONS[4], "gnocchi", "add_minter");
  call(RAVIOLI_MODE_PARTITIONS[4], "gnocchiAdapter", "create_allocation");
  call(RAVIOLI_MODE_PARTITIONS[4], "gnocchiAdapter", "add_router");
  call(RAVIOLI_MODE_PARTITIONS[4], "rotini", "add_pack_minter");
  call(RAVIOLI_MODE_PARTITIONS[4], "rotiniAdapter", "create_resource");
  call(RAVIOLI_MODE_PARTITIONS[4], "rotiniAdapter", "add_router");
  call(RAVIOLI_MODE_PARTITIONS[4], "gnocchi", "update_operators");
  lifecycle(RAVIOLI_MODE_PARTITIONS[4], 4, 1, true);

  call(RAVIOLI_MODE_PARTITIONS[0], "router", "buy");
  call(RAVIOLI_MODE_PARTITIONS[0], "router", "open_pack");
  call(RAVIOLI_MODE_PARTITIONS[1], "router", "set_pack_contents");
  call(RAVIOLI_MODE_PARTITIONS[1], "router", "open_pack");
  call(RAVIOLI_MODE_PARTITIONS[1], "router", "transfer");
  call(RAVIOLI_MODE_PARTITIONS[1], "router", "open_pack");
  for (const [partition, target] of [
    [RAVIOLI_MODE_PARTITIONS[2], "router"],
    [RAVIOLI_MODE_PARTITIONS[3], "router"],
    [RAVIOLI_MODE_PARTITIONS[4], "router"],
  ]) {
    call(partition, target, "buy");
    call(partition, target, "set_pack_contents");
    call(partition, target, "open_pack");
  }

  const withheld = "withheld-reveal-refund";
  call(withheld, "gnocchi", "add_minter");
  call(withheld, "gnocchiAdapter", "create_allocation");
  call(withheld, "gnocchiAdapter", "add_router");
  lifecycle(withheld, 5, 2, true);
  call(withheld, "router", "buy");
  call(withheld, "router", "refund_blind_claims");
  call(withheld, "router", "cancel_unrevealed_pack");
  call(withheld, "blindController", "withdraw_refund");
  call(withheld, "router", "recover_adapter");

  assert.equal(operations.length, RAVIOLI_V3_JOURNAL_WRITE_COUNT);
  assert.equal(
    operations.filter((operation) => operation.kind === "origination").length,
    RAVIOLI_V3_JOURNAL_ORIGINATION_COUNT,
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(RAVIOLI_V3_JOURNAL_ENTRYPOINT_COUNTS).map((entrypoint) => [
        entrypoint,
        operations.filter((operation) => operation.entrypoint === entrypoint).length,
      ]),
    ),
    RAVIOLI_V3_JOURNAL_ENTRYPOINT_COUNTS,
  );
  return Object.freeze(operations.map((operation) => Object.freeze(operation)));
}

const RAVIOLI_V3_SEMANTIC_FIXTURE_PLAN = buildRavioliV3SemanticFixturePlan();

const COLLECTOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";

const REQUIRED_KINDS = Object.freeze({
  macaroni: ["origination", "mint"],
  spaghetti: ["origination", "mint"],
  gnocchi: ["origination", "mint"],
  ravioli: ["origination", "mint", "open"],
  rotini: ["origination", "reserve", "finalize"],
  penne: ["origination", "distribute"],
  lasagna: ["origination", "publish"],
});

const ROLES = Object.freeze({
  "ch-ease": "preparation",
  macaroni: "token-publisher",
  spaghetti: "token-publisher",
  gnocchi: "token-publisher",
  ravioli: "token-publisher",
  rotini: "token-publisher",
  penne: "token-publisher",
  lasagna: "exhibition-registry",
  colander: "management",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requestSha256(url) {
  return sha256(Buffer.from(`GET\n${url}\n`, "utf8"));
}

function deterministicJsonValue(value) {
  if (Array.isArray(value)) return value.map(deterministicJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, deterministicJsonValue(child)]),
  );
}

function deterministicJsonBytes(value) {
  return Buffer.from(JSON.stringify(deterministicJsonValue(value)), "utf8");
}

function operationRecord(hash, kind, contractAddress, entrypoint) {
  return {
    kind,
    hash,
    contractAddress,
    ...(kind === "origination"
      ? {}
      : { entrypoint: entrypoint || `${kind}-proof`.replaceAll("-", "_") }),
    status: "applied",
    explorerUrl: `https://shadownet.tzkt.io/${hash}`,
  };
}

async function writeArtifact(appRoot, fileName, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const relativePath = `artifacts/${fileName}`;
  await mkdir(path.dirname(path.join(appRoot, relativePath)), { recursive: true });
  await writeFile(path.join(appRoot, relativePath), bytes);
  return { relativePath, bytes, sha256: sha256(bytes) };
}

function pinnedArtifact(id, kind, written, fileName) {
  return {
    id,
    kind,
    path: written.relativePath,
    sha256: written.sha256,
    ipfsUri: `ipfs://${CID}/${fileName}`,
    gatewayUrl: `https://ipfs.io/ipfs/${CID}/${fileName}`,
    retrievedSha256: written.sha256,
  };
}

function ravioliChildBalanceDeltas(modeIndex, serial) {
  const childAllocations = [
    [{ kind: "escrow", contract: RAVIOLI_CONTRACTS.gnocchi, tokenId: 0, amount: 1 }],
    [{ kind: "escrow", contract: RAVIOLI_CONTRACTS.gnocchi, tokenId: serial, amount: 1 }],
    [{ kind: "allocated", contract: RAVIOLI_CONTRACTS.gnocchi, tokenId: 2, amount: 1 }],
    [
      { kind: "generative", contract: RAVIOLI_CONTRACTS.rotini, tokenId: 3, amount: 1 },
      { kind: "generative", contract: RAVIOLI_CONTRACTS.rotini, tokenId: 4, amount: 1 },
    ],
    [
      {
        kind: "escrow-plus-allocated",
        contract: RAVIOLI_CONTRACTS.gnocchi,
        tokenId: 1,
        amount: 2,
      },
      { kind: "generative", contract: RAVIOLI_CONTRACTS.rotini, tokenId: 5, amount: 1 },
    ],
  ][modeIndex];
  return childAllocations.map((allocation, index) => {
    const before = serial + index;
    return {
      ...allocation,
      before,
      after: before + allocation.amount,
      delta: allocation.amount,
    };
  });
}

function ravioliModeOutcome(
  modeIndex,
  operationHashes,
  purchaseHashes,
  openHashes,
) {
  const expectedEditionCount = RAVIOLI_MODE_OPEN_COUNTS[modeIndex];
  assert.equal(purchaseHashes.length, expectedEditionCount);
  assert.equal(openHashes.length, expectedEditionCount);
  const purchaseCheckpoints = [];
  const openOutcomes = [];
  for (let serial = 0; serial < expectedEditionCount; serial += 1) {
    const purchaseHash = purchaseHashes[serial];
    const openHash = openHashes[serial];
    const balanceDeltas = ravioliChildBalanceDeltas(modeIndex, serial);
    const shape = RAVIOLI_MODE_OPEN_SHAPES[modeIndex];
    const operationTree = [
      {
        status: "applied",
        entrypoint: "open_pack",
        value: {
          token_id: modeIndex,
          actions: Array.from({ length: shape.actions }, (_, actionIndex) => ({
            action_index: actionIndex,
          })),
        },
      },
      ...Array.from({ length: shape.escrow }, () => ({
        status: "applied",
        entrypoint: "transfer",
        value: { recipient: COLLECTOR },
      })),
      ...Array.from({ length: shape.gnocchiFulfill + shape.rotiniFulfill }, () => ({
        status: "applied",
        entrypoint: "fulfill",
        value: { recipient: COLLECTOR },
      })),
      ...Array.from({ length: shape.gnocchiMint }, () => ({
        status: "applied",
        entrypoint: "mint_reserved",
        value: { recipient: COLLECTOR },
      })),
      ...Array.from({ length: shape.rotiniMint }, () => ({
        status: "applied",
        entrypoint: "mint_pack_iteration",
        value: { recipient: COLLECTOR },
      })),
    ];
    purchaseCheckpoints.push({
      tokenId: modeIndex,
      operationHash: purchaseHash,
      balance: serial + 1,
    });
    openOutcomes.push({
      tokenId: modeIndex,
      serial,
      collector: COLLECTOR,
      operationHash: openHash,
      operationTreeSha256: sha256(deterministicJsonBytes(operationTree)),
      operationTree,
      exactCallCounts: {
        ...shape,
      },
      balanceDeltas,
    });
  }
  return {
    schema: "pastaprotocol-ravioli-mode-outcome@1",
    network: {
      name: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
    },
    mode: RAVIOLI_MODE_NAMES[modeIndex],
    tokenId: modeIndex,
    maxSupply: RAVIOLI_MODE_MAX_SUPPLIES[modeIndex],
    expectedEditionCount,
    operationHashes,
    purchaseCheckpoints,
    openOutcomes,
  };
}

async function createRavioliJournalFixture(appRoot) {
  const journalId = sha256(Buffer.from("ravioli-effective-journal", "utf8"));
  const baseMatrix = RAVIOLI_V3_SEMANTIC_FIXTURE_PLAN
    .slice(0, RAVIOLI_V3_JOURNAL_WRITE_COUNT - 1)
    .map((operation, index) => ({
      ...operation,
      globalOrdinal: index + 1,
    }));
  assert.equal(baseMatrix.length, 66);
  const effectiveRecovery = {
    id: "withheld-reveal-refund:creator-recover-adapter",
    proofPartition: "withheld-reveal-refund",
    globalOrdinal: 67,
    actor: "creator",
    operationSequence: 49,
    action: "call",
    targetRole: "router",
    entrypoint: "recover_adapter",
    tokenId: 5,
    adapterRole: "gnocchiAdapter",
    adapterKind: 1,
    resourceId: 2,
    capacity: 2,
  };
  const effectiveMatrix = [...baseMatrix, effectiveRecovery];
  const baseMatrixSha256 = sha256(deterministicJsonBytes(baseMatrix));
  const effectiveMatrixSha256 = sha256(deterministicJsonBytes(effectiveMatrix));
  const intent = {
    schema: "pastaprotocol-ravioli-ui-live-journal-intent@2",
    status: "IMMUTABLE",
    journalId,
    matrix: baseMatrix,
    matrixSha256: baseMatrixSha256,
  };
  const intentWritten = await writeArtifact(
    appRoot,
    "journal/intent.json",
    deterministicJsonBytes(intent),
  );
  const artifacts = [{
    id: "ravioli-journal-intent",
    kind: "durable-journal-intent",
    path: intentWritten.relativePath,
    sha256: intentWritten.sha256,
  }];

  const pinInputs = [
    ...Array.from({ length: 6 }, (_, tokenId) => ({
      fileName: `ravioli-wrapper-${tokenId}.png`,
      bytes: Buffer.concat([PNG, Buffer.from(`wrapper:${tokenId}`, "utf8")]),
    })),
    ...Array.from({ length: 6 }, (_, tokenId) => ({
      fileName: "token.json",
      bytes: deterministicJsonBytes({ tokenId, name: `Ravioli wrapper ${tokenId}` }),
    })),
    ...Array.from({ length: 6 }, (_, tokenId) => ({
      fileName: "ravioli-pack-manifest.json",
      bytes: deterministicJsonBytes({ schema: "pasta-ravioli-pack-manifest@1", tokenId }),
    })),
    {
      fileName: "ravioli-public-reveal-0.json",
      bytes: deterministicJsonBytes({
        schema: "pasta-ravioli-public-reveal@1",
        tokenId: 0,
        contract: RAVIOLI_CONTRACTS.router,
        openKit: { tokenId: 0 },
      }),
    },
    ...Array.from({ length: 5 }, (_, index) => {
      const tokenId = index + 1;
      return {
        fileName: `ravioli-sealed-reveal-${tokenId}.json`,
        bytes: deterministicJsonBytes({
          schema: "pasta-ravioli-sealed-reveal@1",
          cipher: "AES-256-GCM",
          keyDerivation:
            "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
          aad: {
            schema: "pasta-ravioli-sealed-reveal@1",
            network: "shadownet",
            contract: RAVIOLI_CONTRACTS.router,
            tokenId,
            manifestUri: `ipfs://${CID}/ravioli-manifest-${tokenId}.json`,
          },
          iv: Buffer.alloc(12, tokenId).toString("base64"),
          ciphertext: Buffer.alloc(48, tokenId).toString("base64"),
        }),
      };
    }),
    ...[3, 4, 5].map((tokenId) => ({
      fileName: `ravioli-generated-${tokenId}-0-0.png`,
      bytes: Buffer.concat([PNG, Buffer.from(`generated:${tokenId}`, "utf8")]),
    })),
    ...[3, 4, 5].map((tokenId) => ({
      fileName: `ravioli-generated-token-${tokenId}-0-0.json`,
      bytes: deterministicJsonBytes({
        tokenId,
        artifactUri: `ipfs://${CID}/ravioli-generated-${tokenId}-0-0.png`,
      }),
    })),
    ...[
      "collection.json",
      "pasta-ravioli-blind-controller-contract.json",
      "pasta-gnocchi-pack-adapter-contract.json",
      "pasta-rotini-pack-adapter-contract.json",
    ].map((fileName) => ({
      fileName,
      bytes: deterministicJsonBytes({ name: fileName, network: "shadownet" }),
    })),
  ];
  assert.equal(pinInputs.length, RAVIOLI_V3_JOURNAL_PIN_COUNT);
  const pinArtifactIds = [];
  const eventArtifactIds = [];
  for (const [index, pin] of pinInputs.entries()) {
    const pinSequence = index + 1;
    const pinPath = `pins/${String(pinSequence).padStart(6, "0")}.bin`;
    const pinWritten = await writeArtifact(
      appRoot,
      `journal/${pinPath}`,
      pin.bytes,
    );
    const pinArtifactId = `ravioli-journal-pin-${String(pinSequence).padStart(3, "0")}`;
    artifacts.push({
      id: pinArtifactId,
      kind: "durable-journal-pin-bytes",
      path: pinWritten.relativePath,
      sha256: pinWritten.sha256,
    });
    pinArtifactIds.push(pinArtifactId);
    const event = {
      schema: "pastaprotocol-ravioli-ui-live-journal-event@2",
      journalId,
      eventIndex: pinSequence,
      phase: "PIN",
      actor: "creator",
      pinSequence,
      artifact: {
        path: pinPath,
        fileName: pin.fileName,
        mimeType: pin.fileName.endsWith(".json") ? "application/json" : "image/png",
        sha256: pinWritten.sha256,
        byteLength: pin.bytes.byteLength,
      },
    };
    const eventWritten = await writeArtifact(
      appRoot,
      `journal/events/${String(pinSequence).padStart(6, "0")}-pin-creator.json`,
      deterministicJsonBytes(event),
    );
    const eventArtifactId = `ravioli-journal-pin-event-${String(pinSequence).padStart(3, "0")}`;
    artifacts.push({
      id: eventArtifactId,
      kind: "durable-journal-event",
      path: eventWritten.relativePath,
      sha256: eventWritten.sha256,
    });
    eventArtifactIds.push(eventArtifactId);
  }

  const extension = {
    schema: "pastaprotocol-ravioli-ui-live-plan-extension@1",
    extensionId: "ravioli-event86-withheld-gnocchi-capacity-recovery-v1",
    baseIntentSha256: intentWritten.sha256,
    baseMatrixSha256,
    baseOperationCount: 66,
    semanticBoundary: 23,
    operations: [effectiveRecovery],
  };
  const extensionEvent = {
    schema: "pastaprotocol-ravioli-ui-live-journal-event@2",
    journalId,
    eventIndex: 87,
    phase: "PLAN_EXTENSION",
    actor: "creator",
    extension,
    extensionSha256: sha256(deterministicJsonBytes(extension)),
    effectiveMatrixSha256,
    effectiveOperationCount: RAVIOLI_V3_JOURNAL_WRITE_COUNT,
  };
  const extensionWritten = await writeArtifact(
    appRoot,
    "journal/events/000087-plan_extension-creator.json",
    deterministicJsonBytes(extensionEvent),
  );
  artifacts.push({
    id: "ravioli-journal-event-087-plan-extension",
    kind: "durable-journal-event",
    path: extensionWritten.relativePath,
    sha256: extensionWritten.sha256,
  });
  eventArtifactIds.push("ravioli-journal-event-087-plan-extension");

  const final = {
    schema: "pastaprotocol-ravioli-ui-live-journal-final@2",
    status: "FINALIZED",
    journalId,
    intentSha256: intentWritten.sha256,
    counts: {
      actors: RAVIOLI_V3_JOURNAL_ACTOR_COUNTS,
      originations: RAVIOLI_V3_JOURNAL_ORIGINATION_COUNT,
      calls:
        RAVIOLI_V3_JOURNAL_WRITE_COUNT -
        RAVIOLI_V3_JOURNAL_ORIGINATION_COUNT,
      buys: 7,
      opens: 6,
      transfers: 2,
      refunds: 1,
      pins: RAVIOLI_V3_JOURNAL_PIN_COUNT,
      events: 237,
    },
    plan: {
      mode: "authenticated-post-event86-extension",
      baseIntentSha256: intentWritten.sha256,
      baseMatrixSha256,
      planExtensionRecordSha256: extensionWritten.sha256,
      effectiveMatrixSha256,
    },
  };
  const finalWritten = await writeArtifact(
    appRoot,
    "journal/final.json",
    deterministicJsonBytes(final),
  );
  artifacts.push({
    id: "ravioli-journal-final",
    kind: "durable-journal-finalization",
    path: finalWritten.relativePath,
    sha256: finalWritten.sha256,
  });
  return {
    artifacts,
    artifactIds: artifacts.map((artifact) => artifact.id),
    pinArtifactIds,
    eventArtifactIds,
  };
}

async function createRavioliFixture(
  appRoot,
  commonArtifacts,
  operationStartIndex,
  gnocchiOriginationHash,
) {
  assert.ok(gnocchiOriginationHash, "Gnocchi must be built before the Ravioli dependency graph");
  const journalHashes = OPERATION_HASHES.slice(
    operationStartIndex,
    operationStartIndex + RAVIOLI_V3_JOURNAL_WRITE_COUNT,
  );
  assert.equal(journalHashes.length, RAVIOLI_V3_JOURNAL_WRITE_COUNT);
  const dependencyHashes = [
    gnocchiOriginationHash,
    OPERATION_HASHES[operationStartIndex + RAVIOLI_V3_JOURNAL_WRITE_COUNT],
  ];
  assert.equal(dependencyHashes.length, RAVIOLI_V3_DEPENDENCY_ORIGINATION_COUNT);
  const semanticOperations = RAVIOLI_V3_SEMANTIC_FIXTURE_PLAN.map(
    (operation, index) => ({ ...operation, hash: journalHashes[index] }),
  );
  const modePlans = RAVIOLI_MODE_PARTITIONS.map((partition) =>
    semanticOperations.filter((operation) => operation.partition === partition),
  );
  const modePartitions = modePlans.map((plan) => plan.map((operation) => operation.hash));
  assert.equal(new Set(modePartitions.flat()).size, 53);
  const withheldPartition = semanticOperations
    .filter((operation) => operation.partition === "withheld-reveal-refund")
    .map((operation) => operation.hash);
  assert.equal(withheldPartition.length, 12);

  const dependencyOperations = [
    operationRecord(dependencyHashes[0], "origination", RAVIOLI_CONTRACTS.gnocchi),
    operationRecord(dependencyHashes[1], "origination", RAVIOLI_CONTRACTS.rotini),
  ];
  const journalOperations = semanticOperations.map((operation) => {
    return operationRecord(
      operation.hash,
      operation.kind,
      RAVIOLI_CONTRACTS[operation.target],
      operation.entrypoint,
    );
  });
  const operations = [...dependencyOperations, ...journalOperations];

  const contracts = [
    {
      address: RAVIOLI_CONTRACTS.gnocchi,
      kind: "gnocchi-dependency",
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.gnocchi}`,
    },
    {
      address: RAVIOLI_CONTRACTS.rotini,
      kind: "rotini-dependency",
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.rotini}`,
    },
    {
      address: RAVIOLI_CONTRACTS.blindController,
      kind: "blind-pack-controller",
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.blindController}`,
    },
    {
      address: RAVIOLI_CONTRACTS.router,
      kind: "atomic-pack-router",
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.router}`,
    },
    {
      address: RAVIOLI_CONTRACTS.gnocchiAdapter,
      kind: "allocation-helper",
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.gnocchiAdapter}`,
    },
    {
      address: RAVIOLI_CONTRACTS.rotiniAdapter,
      kind: "generative-helper",
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.rotiniAdapter}`,
    },
  ];

  const tokens = [...RAVIOLI_MODE_NAMES, "withheld_reveal_refund"].map((mode, tokenId) => ({
    id: `ravioli-wrapper-${tokenId}`,
    contractAddress: RAVIOLI_CONTRACTS.router,
    tokenId: String(tokenId),
    explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.router}/tokens/${tokenId}`,
    metadataArtifactId: "token-metadata",
    mediaArtifactId: "token-media",
    metadataUri: `ipfs://${CID}/ravioli-metadata.json`,
    artifactUri: `ipfs://${CID}/ravioli-media.png`,
    mode,
  }));

  const artifacts = [...commonArtifacts];
  const journalFixture = await createRavioliJournalFixture(appRoot);
  artifacts.push(...journalFixture.artifacts);
  const openKit = await writeArtifact(appRoot, "ravioli-open-kit-0.json", `${JSON.stringify({
    schema: "pasta-ravioli-open-kit@3",
    network: "shadownet",
    contract: RAVIOLI_CONTRACTS.router,
    tokenId: 0,
    recipes: [{ serial: 0, nonce: "ab".repeat(32), actions: [{ kind: "escrow" }] }],
  }, null, 2)}\n`);
  artifacts.push({
    id: "ravioli-open-kit-0",
    kind: "open-kit",
    path: openKit.relativePath,
    sha256: openKit.sha256,
  });

  const revealReceipt = await writeArtifact(
    appRoot,
    "ravioli-public-reveal.json",
    `${JSON.stringify({ status: "PASSED", tokenId: 0, serial: 0, disclosure: "public" }, null, 2)}\n`,
  );
  artifacts.push({
    id: "ravioli-public-reveal",
    kind: "public-reveal-evidence",
    path: revealReceipt.relativePath,
    sha256: revealReceipt.sha256,
  });

  const policy = await writeArtifact(
    appRoot,
    "ravioli-limited-edition-policy.json",
    `${JSON.stringify({
      schema: "pastaprotocol-ravioli-limited-edition-policy-evidence@1",
      capabilityId: "limited-edition-expiry-deconfliction-ui-live-proof",
      status: "PASSED",
      network: {
        name: "shadownet",
        chainId: SHADOWNET_CHAIN_ID,
      },
      wrapper: {
        contract: RAVIOLI_CONTRACTS.router,
        tokenId: 2,
        maxSupply: 4,
        saleEnd: "2026-08-01T00:00:00.000Z",
        childExpiryCommittedOnChain: "2026-08-02T00:00:00.000Z",
      },
      child: {
        contract: RAVIOLI_CONTRACTS.gnocchi,
        tokenId: 2,
        maxSupply: 4,
        expiry: "2026-08-02T00:00:00.000Z",
        active: true,
        policyLocked: true,
      },
      invariant: {
        wrapperIsFiniteSupply: true,
        wrapperIsFiniteTime: true,
        wrapperEndsBeforeChild: true,
        childPolicyStoredInPack: true,
        wrapperDeadlineStoredInPack: true,
        wrapperIssuedAtomicallyWithSale: true,
      },
      rejectedInvalidPolicies: [
        "unbounded wrapper rejected for finite child",
        "wrapper deadline equal to child expiry rejected",
        "wrapper deadline after child expiry rejected",
        "mutable child policy rejected",
      ],
    }, null, 2)}\n`,
  );
  artifacts.push({
    id: "ravioli-limited-edition-policy",
    kind: "limited-edition-policy-evidence",
    path: policy.relativePath,
    sha256: policy.sha256,
  });

  const outcomeArtifactIds = [];
  for (const [modeIndex, operationHashes] of modePartitions.entries()) {
    const id = `ravioli-mode-${modeIndex}-outcome`;
    const fileName = `${id}.json`;
    const written = await writeArtifact(
      appRoot,
      fileName,
      `${JSON.stringify(ravioliModeOutcome(
        modeIndex,
        operationHashes,
        modePlans[modeIndex]
          .filter((operation) => operation.entrypoint === "buy")
          .map((operation) => operation.hash),
        modePlans[modeIndex]
          .filter((operation) => operation.entrypoint === "open_pack")
          .map((operation) => operation.hash),
      ), null, 2)}\n`,
    );
    artifacts.push({
      id,
      kind: "mode-outcome-evidence",
      path: written.relativePath,
      sha256: written.sha256,
    });
    outcomeArtifactIds.push(id);
  }

  const generatedArtifactIds = [];
  const generatedArtifactsByTokenId = new Map();
  for (const tokenId of [3, 4, 5]) {
    const metadataFileName = `ravioli-generated-token-${tokenId}-0-0.json`;
    const metadata = await writeArtifact(
      appRoot,
      metadataFileName,
      `${JSON.stringify({
        name: `Ravioli generated child ${tokenId}`,
        artifactUri: `ipfs://${CID}/ravioli-generated-${tokenId}-0-0.png`,
      }, null, 2)}\n`,
    );
    const metadataId = `ravioli-generated-${tokenId}-metadata`;
    artifacts.push(pinnedArtifact(metadataId, "generated-token-metadata", metadata, metadataFileName));

    const mediaFileName = `ravioli-generated-${tokenId}-0-0.png`;
    const media = await writeArtifact(
      appRoot,
      mediaFileName,
      Buffer.concat([PNG, Buffer.from(`\nravioli-generated:${tokenId}\n`, "utf8")]),
    );
    const mediaId = `ravioli-generated-${tokenId}-media`;
    artifacts.push(pinnedArtifact(mediaId, "generated-token-media", media, mediaFileName));
    generatedArtifactIds.push(metadataId, mediaId);
    generatedArtifactsByTokenId.set(tokenId, {
      metadataId,
      mediaId,
      metadataUri: `ipfs://${CID}/${metadataFileName}`,
      artifactUri: `ipfs://${CID}/${mediaFileName}`,
    });
  }
  for (const tokenId of [3, 4, 5]) {
    const generated = generatedArtifactsByTokenId.get(tokenId);
    tokens.push({
      id: `ravioli-generated-rotini-${tokenId}`,
      contractAddress: RAVIOLI_CONTRACTS.rotini,
      tokenId: String(tokenId),
      explorerUrl: `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.rotini}/tokens/${tokenId}`,
      metadataArtifactId: generated.metadataId,
      mediaArtifactId: generated.mediaId,
      metadataUri: generated.metadataUri,
      artifactUri: generated.artifactUri,
    });
  }

  const withheldEvidence = await writeArtifact(
    appRoot,
    "ravioli-withheld-reveal-refund-evidence.json",
    deterministicJsonBytes({
      schema: "pastaprotocol-ravioli-withheld-reveal-refund-proof@1",
      status: "PASSED",
      tokenId: 5,
      publicRevealPublished: false,
      cancelled: true,
      refundCreditAfterWithdrawal: 0,
      recoveredAdapterCapacity: 2,
    }),
  );
  artifacts.push({
    id: "ravioli-withheld-reveal-refund-evidence",
    kind: "withheld-reveal-refund-evidence",
    path: withheldEvidence.relativePath,
    sha256: withheldEvidence.sha256,
  });

  const capabilities = RAVIOLI_MODE_CAPABILITIES.map((id, modeIndex) => {
    const generated =
      modeIndex === 3
        ? generatedArtifactIds.slice(0, 4)
        : modeIndex === 4
          ? generatedArtifactIds.slice(4, 6)
          : [];
    const modeContracts =
      modeIndex === 3
        ? [
            RAVIOLI_CONTRACTS.router,
            RAVIOLI_CONTRACTS.rotini,
            RAVIOLI_CONTRACTS.rotiniAdapter,
          ]
        : modeIndex === 4
          ? Object.values(RAVIOLI_CONTRACTS)
          : [
              RAVIOLI_CONTRACTS.router,
              RAVIOLI_CONTRACTS.gnocchi,
              RAVIOLI_CONTRACTS.gnocchiAdapter,
            ];
    return {
      id,
      description: `${RAVIOLI_MODE_NAMES[modeIndex]} exact atomic delivery proof`,
      evidence: {
        screenshots: modeIndex === 0 ? ["configure", "submit", "confirmed"] : ["confirmed"],
        artifacts: [
          "token-metadata",
          "token-media",
          outcomeArtifactIds[modeIndex],
          ...generated,
        ],
        contracts: modeContracts,
        operations: modePartitions[modeIndex],
        tokens: [
          `ravioli-wrapper-${modeIndex}`,
          ...(modeIndex === 3
            ? ["ravioli-generated-rotini-3", "ravioli-generated-rotini-4"]
            : modeIndex === 4
              ? ["ravioli-generated-rotini-5"]
              : []),
        ],
        roleEvidence: [],
        urls: [
          `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.router}/tokens/${modeIndex}`,
        ],
      },
    };
  });

  capabilities.push(
    {
      id: "blind-sealed-reveal-ui-live-proof",
      description:
        "Token 0 binds the sole plaintext public reveal while blind tokens 1-5 bind authenticated pre-sale sealed envelopes.",
      evidence: {
        screenshots: ["submit", "confirmed"],
        artifacts: ["ravioli-open-kit-0", "ravioli-public-reveal"],
        contracts: [RAVIOLI_CONTRACTS.router],
        operations: [],
        tokens: ["ravioli-wrapper-0"],
        roleEvidence: [],
        urls: [`https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.router}/tokens/0`],
      },
    },
    {
      id: "withheld-reveal-refund-closure-ui-live-proof",
      description:
        "The intentionally unrevealed token-5 red path refunds, closes, withdraws, and releases its unused Gnocchi allocation.",
      evidence: {
        screenshots: ["configure", "submit", "confirmed"],
        artifacts: ["ravioli-withheld-reveal-refund-evidence"],
        contracts: [
          RAVIOLI_CONTRACTS.blindController,
          RAVIOLI_CONTRACTS.router,
          RAVIOLI_CONTRACTS.gnocchiAdapter,
          RAVIOLI_CONTRACTS.gnocchi,
        ],
        operations: withheldPartition,
        tokens: ["ravioli-wrapper-5"],
        roleEvidence: [],
        urls: [
          `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.router}/tokens/5`,
          ...withheldPartition.map((hash) => `https://shadownet.tzkt.io/${hash}`),
        ],
      },
    },
    {
      id: "limited-edition-expiry-deconfliction-ui-live-proof",
      description:
        "A capped and timed child is wrapped by a finite Ravioli sale that ends no later than the child.",
      evidence: {
        screenshots: ["confirmed"],
        artifacts: ["ravioli-limited-edition-policy"],
        contracts: [RAVIOLI_CONTRACTS.router],
        operations: [],
        tokens: ["ravioli-wrapper-2"],
        roleEvidence: [],
        urls: [
          `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.gnocchi}/tokens/2`,
          `https://shadownet.tzkt.io/${RAVIOLI_CONTRACTS.router}/tokens/2`,
        ],
      },
    },
    {
      id: "durable-signer-journal-ui-live-proof",
      description: `The durable journal binds all ${RAVIOLI_V3_JOURNAL_WRITE_COUNT} Ravioli v3 writes plus both dependency originations.`,
      evidence: {
        screenshots: ["configure"],
        artifacts: journalFixture.artifactIds,
        contracts: Object.values(RAVIOLI_CONTRACTS),
        operations: journalHashes,
        tokens: [],
        roleEvidence: [],
        urls: journalHashes.map((hash) => `https://shadownet.tzkt.io/${hash}`),
      },
    },
    {
      id: "same-run-dependency-originations-proof",
      description: `The Gnocchi and Rotini dependency originations complete the ${RAVIOLI_V3_JOURNAL_WRITE_COUNT + RAVIOLI_V3_DEPENDENCY_ORIGINATION_COUNT}-operation graph.`,
      evidence: {
        screenshots: ["configure"],
        artifacts: ["ravioli-journal-final"],
        contracts: [RAVIOLI_CONTRACTS.gnocchi, RAVIOLI_CONTRACTS.rotini],
        operations: dependencyHashes,
        tokens: [],
        roleEvidence: [],
        urls: dependencyHashes.map((hash) => `https://shadownet.tzkt.io/${hash}`),
      },
    },
  );

  return {
    artifacts,
    capabilities,
    contracts,
    operations,
    tokens,
    nextOperationIndex: operationStartIndex + RAVIOLI_V3_JOURNAL_WRITE_COUNT,
  };
}

async function createCompleteFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "pasta-proof-run-"));
  let operationIndex = 0;
  let gnocchiOriginationHash;
  for (const app of APP_ORDER) {
    const appRoot = path.join(root, app);
    await mkdir(path.join(appRoot, "screenshots"), { recursive: true });
    await mkdir(path.join(appRoot, "artifacts"), { recursive: true });
    const screenshotStages = app === "ch-ease" ? ["prepare", "handoff"] : ["configure", "submit", "confirmed"];
    const screenshots = [];
    for (const stage of screenshotStages) {
      const relativePath = `screenshots/${stage}.png`;
      const screenshotBytes = Buffer.concat([PNG, Buffer.from(`\n${app}:${stage}\n`, "utf8")]);
      await writeFile(path.join(appRoot, relativePath), screenshotBytes);
      screenshots.push({
        stage,
        path: relativePath,
        sha256: sha256(screenshotBytes),
        caption: `${app} ${stage} stage`,
      });
    }

    let artifacts;
    let contracts = [];
    let operations = [];
    let tokens = [];
    let roleEvidence = [];
    let capabilities;

    if (app === "ch-ease") {
      const prepared = await writeArtifact(appRoot, "prepared-package.json", JSON.stringify({ app, ok: true }));
      artifacts = [
        {
          id: "prepared-package",
          kind: "prepared-package",
          path: prepared.relativePath,
          sha256: prepared.sha256,
        },
      ];
      roleEvidence = [
        {
          kind: "package-export",
          artifactId: "prepared-package",
          url: "http://127.0.0.1:4321/download/prepared-package.json",
        },
        {
          kind: "publisher-handoff",
          targetApp: "spaghetti",
          url: "http://127.0.0.1:4321/tools/spaghetti?handoff=chease-package",
        },
      ];
    } else if (app === "lasagna") {
      const exhibition = await writeArtifact(appRoot, "exhibition.json", JSON.stringify({ app, references: [] }));
      artifacts = [
        {
          id: "exhibition-metadata",
          kind: "exhibition-metadata",
          path: exhibition.relativePath,
          sha256: exhibition.sha256,
          ipfsUri: `ipfs://${CID}/lasagna-exhibition.json`,
          gatewayUrl: `https://ipfs.io/ipfs/${CID}/lasagna-exhibition.json`,
          retrievedSha256: exhibition.sha256,
        },
      ];
      const contractAddress = CONTRACTS.lasagna;
      contracts = [
        {
          address: contractAddress,
          kind: "exhibition-registry",
          explorerUrl: `https://shadownet.tzkt.io/${contractAddress}`,
        },
      ];
      operations = REQUIRED_KINDS.lasagna.map((kind) =>
        operationRecord(OPERATION_HASHES[operationIndex++], kind, contractAddress),
      );
      roleEvidence = [
        {
          kind: "exhibition-publication",
          artifactId: "exhibition-metadata",
          contractAddress,
          operationHash: operations.find((entry) => entry.kind === "publish").hash,
          url: `https://shadownet.tzkt.io/${contractAddress}`,
        },
      ];
    } else if (app === "colander") {
      const receipt = await writeArtifact(appRoot, "management-receipt.json", JSON.stringify({ app, status: "applied" }));
      artifacts = [
        {
          id: "management-receipt",
          kind: "management-receipt",
          path: receipt.relativePath,
          sha256: receipt.sha256,
        },
      ];
      operations = [
        operationRecord(OPERATION_HASHES[operationIndex++], "manage", CONTRACTS.lasagna),
      ];
      roleEvidence = [
        {
          kind: "contract-discovery",
          contractAddress: CONTRACTS.spaghetti,
          url: `https://shadownet.tzkt.io/${CONTRACTS.spaghetti}`,
        },
        {
          kind: "management-action",
          artifactId: "management-receipt",
          contractAddress: CONTRACTS.lasagna,
          operationHash: operations[0].hash,
          url: `https://shadownet.tzkt.io/${operations[0].hash}`,
        },
      ];
    } else {
      const metadata = await writeArtifact(appRoot, "token-metadata.json", JSON.stringify({ app, name: `${app} proof` }));
      const media = await writeArtifact(appRoot, "token-media.png", PNG);
      artifacts = [
        {
          id: "token-metadata",
          kind: "token-metadata",
          path: metadata.relativePath,
          sha256: metadata.sha256,
          ipfsUri: `ipfs://${CID}/${app}-metadata.json`,
          gatewayUrl: `https://ipfs.io/ipfs/${CID}/${app}-metadata.json`,
          retrievedSha256: metadata.sha256,
        },
        {
          id: "token-media",
          kind: "token-media",
          path: media.relativePath,
          sha256: media.sha256,
          ipfsUri: `ipfs://${CID}/${app}-media.png`,
          gatewayUrl: `https://ipfs.io/ipfs/${CID}/${app}-media.png`,
          retrievedSha256: media.sha256,
        },
      ];
      if (app === "ravioli") {
        const ravioli = await createRavioliFixture(
          appRoot,
          artifacts,
          operationIndex,
          gnocchiOriginationHash,
        );
        artifacts = ravioli.artifacts;
        capabilities = ravioli.capabilities;
        contracts = ravioli.contracts;
        operations = ravioli.operations;
        tokens = ravioli.tokens;
        operationIndex = ravioli.nextOperationIndex;
      } else {
        const contractAddress = CONTRACTS[app];
        contracts = [
          {
            address: contractAddress,
            kind: `${app}-contract`,
            explorerUrl: `https://shadownet.tzkt.io/${contractAddress}`,
          },
        ];
        operations = REQUIRED_KINDS[app].map((kind) =>
          operationRecord(OPERATION_HASHES[operationIndex++], kind, contractAddress),
        );
        tokens = [
          {
            id: "proof-token",
            contractAddress,
            tokenId: "0",
            explorerUrl: `https://shadownet.tzkt.io/${contractAddress}/tokens/0`,
            metadataArtifactId: "token-metadata",
            mediaArtifactId: "token-media",
            metadataUri: `ipfs://${CID}/${app}-metadata.json`,
            artifactUri: `ipfs://${CID}/${app}-media.png`,
          },
        ];
      }
    }

    if (app === "gnocchi") {
      gnocchiOriginationHash = operations.find((operation) => operation.kind === "origination").hash;
      const proofLevel = 10_000 + operationIndex;
      const acceptedOperations = operations.map((operation, index) => {
        const url = `https://api.shadownet.tzkt.io/v1/operations/${operation.hash}`;
        return {
          hash: operation.hash,
          kind: operation.kind,
          contractAddress: operation.contractAddress,
          entrypoint: operation.entrypoint ?? null,
          status: "applied",
          level: proofLevel - operations.length + index + 1,
          request: { method: "GET", url, sha256: requestSha256(url) },
          response: {
            status: 200,
            byteCount: 123,
            rawSha256: sha256(Buffer.from(`raw:${operation.hash}`)),
            canonicalSha256: sha256(Buffer.from(`canonical:${operation.hash}`)),
          },
        };
      });
      const historicalUrl =
        `https://api.shadownet.tzkt.io/v1/tokens/historical_balances/${proofLevel}` +
        `?token.contract=${CONTRACTS.gnocchi}&token.tokenId=0&limit=10000`;
      const currentUrl =
        `https://api.shadownet.tzkt.io/v1/tokens/balances` +
        `?token.contract=${CONTRACTS.gnocchi}&token.tokenId=0&balance.gt=0&limit=10000`;
      const proofState = {
        balances: [{ account: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb", balance: "1" }],
        totalSupply: "1",
        holdersCount: 1,
      };
      const historicalValue = {
        schema: GNOCCHI_HISTORICAL_INDEXER_SCHEMA,
        app: "gnocchi",
        network: {
          name: "shadownet",
          chainId: SHADOWNET_CHAIN_ID,
          tzktApiBase: "https://api.shadownet.tzkt.io/v1",
        },
        sourceManifest: {
          runId: "synthetic-proof-run",
          capturedAt: "2026-07-18T12:00:00.000Z",
          preSupplementSha256: sha256(Buffer.from("pre-supplement")),
          acceptedOperationsSha256: sha256(Buffer.from("accepted-operations")),
          tokenIdentitiesSha256: sha256(Buffer.from("token-identities")),
        },
        contractAddress: CONTRACTS.gnocchi,
        proofLevel,
        terminalAcceptedOperation: {
          hash: acceptedOperations.at(-1).hash,
          level: proofLevel,
        },
        acceptedOperations,
        tokens: [{
          tokenId: "0",
          proofState,
          historicalRequest: {
            request: { method: "GET", url: historicalUrl, sha256: requestSha256(historicalUrl) },
            response: {
              status: 200,
              byteCount: 123,
              rawSha256: sha256(Buffer.from("historical-raw")),
              canonicalSha256: sha256(Buffer.from("historical-canonical")),
            },
          },
          currentComparison: {
            state: proofState,
            request: { method: "GET", url: currentUrl, sha256: requestSha256(currentUrl) },
            response: {
              status: 200,
              byteCount: 123,
              rawSha256: sha256(Buffer.from("current-raw")),
              canonicalSha256: sha256(Buffer.from("current-canonical")),
            },
            mutationDetected: false,
            changes: [],
          },
        }],
      };
      const historical = await writeArtifact(
        appRoot,
        "gnocchi-proof-time-indexer-snapshot.json",
        JSON.stringify(historicalValue),
      );
      artifacts.push({
        id: "gnocchi-proof-time-indexer-snapshot",
        kind: "historical-indexer-snapshot",
        path: historical.relativePath,
        sha256: historical.sha256,
        ipfsUri: `ipfs://${CID}/gnocchi-proof-time-indexer-snapshot.json`,
        gatewayUrl: `https://ipfs.io/ipfs/${CID}/gnocchi-proof-time-indexer-snapshot.json`,
        retrievedSha256: historical.sha256,
      });
      Object.assign(tokens[0], {
        historicalStateArtifactId: "gnocchi-proof-time-indexer-snapshot",
        proofLevel,
        proofTotalSupply: "1",
        proofHoldersCount: 1,
      });
    }

    if (!capabilities) {
      capabilities = [{
        id: "complete-app-story",
        description: `${app} complete synthetic evidence story`,
        evidence: {
          screenshots: screenshotStages,
          artifacts: artifacts.map((entry) => entry.id),
          contracts: contracts.map((entry) => entry.address),
          operations: operations.map((entry) => entry.hash),
          tokens: tokens.map((entry) => entry.id),
          roleEvidence: roleEvidence.map((entry) => entry.kind),
          urls: [],
        },
      }];
    }
    const manifest = {
      schema: APP_PROOF_SCHEMA,
      app,
      role: ROLES[app],
      runId: "synthetic-proof-run",
      capturedAt: "2026-07-18T12:00:00.000Z",
      network: {
        name: "shadownet",
        chainId: SHADOWNET_CHAIN_ID,
        rpcUrl: "https://tezos-shadownet.octez.io/",
      },
      capabilities,
      screenshots,
      artifacts,
      contracts,
      operations,
      tokens,
      roleEvidence,
    };
    await writeFile(path.join(appRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  assert.ok(
    operationIndex >= RAVIOLI_V3_JOURNAL_WRITE_COUNT,
    "complete fixture did not allocate the Ravioli semantic operation plan",
  );
  return root;
}

async function mutateRavioliArtifact(runRoot, manifest, artifactId, mutator) {
  const artifact = manifest.artifacts.find((entry) => entry.id === artifactId);
  assert.ok(artifact, `missing fixture artifact ${artifactId}`);
  const artifactPath = path.join(runRoot, "ravioli", artifact.path);
  const value = JSON.parse(await readFile(artifactPath, "utf8"));
  await mutator(value);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(artifactPath, bytes);
  artifact.sha256 = sha256(bytes);
  if (artifact.retrievedSha256 !== undefined) {
    artifact.retrievedSha256 = artifact.sha256;
  }
}

test("assembles all nine role-correct app proofs into a deterministic integrity package", async () => {
  const runRoot = await createCompleteFixture();
  const workspace = path.dirname(runRoot);
  const outputOne = path.join(workspace, `${path.basename(runRoot)}-package-one`);
  const outputTwo = path.join(workspace, `${path.basename(runRoot)}-package-two`);
  const archiveOne = `${outputOne}.zip`;
  const archiveTwo = `${outputTwo}.zip`;
  try {
    const first = await assembleProofPackage(runRoot, {
      outputDirectory: outputOne,
      archivePath: archiveOne,
    });
    const second = await assembleProofPackage(runRoot, {
      outputDirectory: outputTwo,
      archivePath: archiveTwo,
    });
    assert.equal(first.appCount, 9);
    assert.equal(first.archiveSha256, second.archiveSha256);
    assert.deepEqual(await readFile(archiveOne), await readFile(archiveTwo));

    const aggregate = JSON.parse(await readFile(path.join(outputOne, "PASTA-PROTOCOL-PROOF.json"), "utf8"));
    assert.deepEqual(aggregate.appOrder, APP_ORDER);
    assert.equal(aggregate.validation.status, "PASSED");
    assert.equal(aggregate.validation.liveNetworkQueriedByAssembler, false);
    assert.equal(
      aggregate.validation.requirements.nonSecretManifestFilenamesAndEvidenceBytesValidated,
      true,
    );
    assert.equal(aggregate.validation.requirements.ravioliModeOutcomesSemanticallyValidated, true);
    assert.equal(aggregate.validation.requirements.ravioliEffective67WritePlanValidated, true);
    assert.equal(aggregate.validation.requirements.ravioliJournalPinCallBreakdownValidated, true);
    assert.equal(aggregate.validation.requirements.ravioliGeneratedRotiniTokensValidated, true);
    assert.equal(aggregate.validation.requirements.ravioliDependencyReuseConstrained, true);
    const chease = aggregate.apps.find((entry) => entry.app === "ch-ease");
    const lasagna = aggregate.apps.find((entry) => entry.app === "lasagna");
    const colander = aggregate.apps.find((entry) => entry.app === "colander");
    assert.equal(chease.tokens.length, 0);
    assert.equal(chease.contracts.length, 0);
    assert.match(chease.roleBoundary.contracts, /No contract is originated/);
    assert.match(chease.roleBoundary.tokens, /No token is minted/);
    assert.equal(lasagna.tokens.length, 0);
    assert.equal(lasagna.contracts.length, 1);
    assert.match(lasagna.roleBoundary.contracts, /exhibition registry contract/);
    assert.match(lasagna.roleBoundary.tokens, /No FA2 token is minted/);
    assert.equal(colander.contracts.length, 0);
    assert.equal(colander.tokens.length, 0);
    assert.match(colander.roleBoundary.contracts, /No contract is originated/);
    assert.match(colander.roleBoundary.tokens, /No token is minted/);
    const ravioli = aggregate.apps.find((entry) => entry.app === "ravioli");
    assert.equal(
      ravioli.operations.length,
      RAVIOLI_V3_JOURNAL_WRITE_COUNT + RAVIOLI_V3_DEPENDENCY_ORIGINATION_COUNT,
    );
    assert.equal(ravioli.contracts.length, 6);
    assert.equal(ravioli.tokens.length, 9);
    assert.deepEqual(
      ravioli.tokens
        .filter((token) => token.contractAddress === RAVIOLI_CONTRACTS.rotini)
        .map((token) => token.tokenId),
      ["3", "4", "5"],
    );
    const ravioliModes = RAVIOLI_MODE_CAPABILITIES.map((id) =>
      ravioli.capabilities.find((entry) => entry.id === id),
    );
    assert.deepEqual(
      ravioliModes.map((capability) => capability.evidence.operations.length),
      [8, 12, 10, 10, 13],
    );
    assert.equal(
      new Set(ravioliModes.flatMap((capability) => capability.evidence.operations)).size,
      53,
    );
    assert.equal(
      ravioli.capabilities.find(
        (entry) => entry.id === "durable-signer-journal-ui-live-proof",
      ).evidence.operations.length,
      RAVIOLI_V3_JOURNAL_WRITE_COUNT,
    );
    assert.equal(
      ravioli.capabilities.find(
        (entry) =>
          entry.id === "withheld-reveal-refund-closure-ui-live-proof",
      ).evidence.operations.length,
      12,
    );
    assert.equal(
      ravioli.operations.filter(
        (operation) => operation.entrypoint === "recover_adapter",
      ).length,
      1,
    );
    const ravioliJournalFinal = ravioli.artifacts.find(
      (artifact) => artifact.kind === "durable-journal-finalization",
    );
    assert.deepEqual(
      ravioliJournalFinal.ravioliJournalFinal.counts.actors,
      RAVIOLI_V3_JOURNAL_ACTOR_COUNTS,
    );
    assert.equal(
      ravioliJournalFinal.ravioliJournalFinal.counts.pins,
      RAVIOLI_V3_JOURNAL_PIN_COUNT,
    );
    const ravioliOpenKit = ravioli.artifacts.find((entry) => entry.id === "ravioli-open-kit-0");
    assert.equal(ravioliOpenKit.kind, "open-kit");
    assert.equal(ravioliOpenKit.cid, undefined, "open kits must remain local rather than IPFS-pinned");
    assert.match(
      await readFile(path.join(outputOne, "apps", "ravioli", ravioliOpenKit.path), "utf8"),
      /"nonce": "abab/,
      "non-credential recipe nonces must survive the proof-package secret scan",
    );
    assert.equal(chease.proofPath, "apps/ch-ease/PROOF.md");
    assert.equal(
      aggregate.apps.find((entry) => entry.app === "rotini").artifacts[0].cid,
      CID,
    );

    const aggregateMarkdown = await readFile(
      path.join(outputOne, "PASTA-PROTOCOL-PROOF.md"),
      "utf8",
    );
    assert.match(aggregateMarkdown, /Capability-to-evidence map/);
    assert.match(aggregateMarkdown, /apps\/ch-ease\/PROOF\.md/);
    assert.match(aggregateMarkdown, /No contract is originated by CH-EASE/);
    assert.match(aggregateMarkdown, /No FA2 token is minted by Lasagna/);
    assert.match(aggregateMarkdown, /No token is minted by Colander/);
    assert.ok(
      aggregateMarkdown.includes(`CID [\`${CID}\`](https://ipfs.io/ipfs/${CID}`),
      "aggregate report should show a clickable explicit CID",
    );
    assert.match(aggregateMarkdown, /retrieved SHA-256/);
    assert.match(aggregateMarkdown, /this report makes no marketplace-indexing claim/);

    for (const app of APP_ORDER) {
      const appProof = await readFile(path.join(outputOne, "apps", app, "PROOF.md"), "utf8");
      assert.match(appProof, new RegExp(`^# ${app} Shadownet Proof`, "m"));
      assert.match(appProof, /Capability-to-evidence map/);
      assert.match(appProof, /Stage screenshots/);
      assert.match(appProof, /SHA-256SUMS/);
    }
    const macaroniProof = await readFile(
      path.join(outputOne, "apps", "macaroni", "PROOF.md"),
      "utf8",
    );
    assert.match(macaroniProof, new RegExp(`https://shadownet\\.tzkt\\.io/${CONTRACTS.macaroni}`));
    assert.match(macaroniProof, new RegExp(`https://ipfs\\.io/ipfs/${CID}/macaroni-metadata\\.json`));
    assert.match(macaroniProof, /retrieved SHA-256/);

    const checksumText = await readFile(path.join(outputOne, "SHA-256SUMS"), "utf8");
    assert.match(checksumText, /PASTA-PROTOCOL-PROOF\.json/);
    assert.match(checksumText, /apps\/ch-ease\/PROOF\.md/);
    assert.match(checksumText, /apps\/colander\/PROOF\.md/);
    assert.match(checksumText, /apps\/rotini\/artifacts\/token-media\.png/);
    assert.doesNotMatch(checksumText, /SHA-256SUMS/);
    const checksumLines = checksumText.trim().split("\n");
    assert.equal(first.fileCount, checksumLines.length + 1);
    for (const line of checksumLines) {
      const match = line.match(/^([a-f0-9]{64})  (.+)$/);
      assert.ok(match, `malformed checksum line: ${line}`);
      assert.equal(sha256(await readFile(path.join(outputOne, match[2]))), match[1]);
    }
    const archive = await readFile(archiveOne);
    assert.equal(archive.readUInt32LE(0), 0x04034b50);
    assert.ok(archive.includes(Buffer.from("apps/ravioli/PROOF.md")));
  } finally {
    await rm(runRoot, { recursive: true, force: true });
    await rm(outputOne, { recursive: true, force: true });
    await rm(outputTwo, { recursive: true, force: true });
    await rm(archiveOne, { force: true });
    await rm(archiveTwo, { force: true });
  }
});

test("fails closed when one Pasta app proof is absent", async () => {
  const runRoot = await createCompleteFixture();
  try {
    await rm(path.join(runRoot, "penne"), { recursive: true, force: true });
    await assert.rejects(() => validateProofRun(runRoot), /missing required apps: penne/);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("allows only explicitly typed Ravioli dependency reuse across sibling app proofs", async () => {
  const runRoot = await createCompleteFixture();
  try {
    const manifestPath = path.join(runRoot, "ravioli", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const gnocchiDependency = manifest.contracts.find(
      (contract) => contract.address === CONTRACTS.gnocchi,
    );
    assert.ok(gnocchiDependency, "fixture lacks Ravioli's Gnocchi dependency claim");
    gnocchiDependency.kind = "rotini-dependency";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(
      () => validateProofRun(runRoot),
      /contract .* has unsupported cross-app claims: gnocchi, ravioli/,
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("requires Ravioli limited-edition expiry proof to bind the complete evidence graph", async (t) => {
  async function rejectMutatedRavioli(mutator, pattern) {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "ravioli", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      mutator(manifest);
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), pattern);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  }

  await t.test("missing dedicated capability", async () => {
    await rejectMutatedRavioli(
      (manifest) => {
        manifest.capabilities = manifest.capabilities.filter(
          (entry) => entry.id !== "limited-edition-expiry-deconfliction-ui-live-proof",
        );
      },
      /requires capability limited-edition-expiry-deconfliction-ui-live-proof/,
    );
  });

  await t.test("missing policy artifact reference", async () => {
    await rejectMutatedRavioli(
      (manifest) => {
        const capability = manifest.capabilities.find(
          (entry) => entry.id === "limited-edition-expiry-deconfliction-ui-live-proof",
        );
        capability.evidence.artifacts = [];
      },
      /must reference a limited-edition-policy-evidence artifact/,
    );
  });

  await t.test("missing exact child token URL", async () => {
    await rejectMutatedRavioli(
      (manifest) => {
        const capability = manifest.capabilities.find(
          (entry) => entry.id === "limited-edition-expiry-deconfliction-ui-live-proof",
        );
        capability.evidence.urls = capability.evidence.urls.filter(
          (url) => !url.includes(CONTRACTS.gnocchi),
        );
      },
      /must link an exact child token on Shadownet TzKT/,
    );
  });

  await t.test("missing exact wrapper token URL", async () => {
    await rejectMutatedRavioli(
      (manifest) => {
        const capability = manifest.capabilities.find(
          (entry) => entry.id === "limited-edition-expiry-deconfliction-ui-live-proof",
        );
        capability.evidence.urls = capability.evidence.urls.filter(
          (url) => !url.includes(CONTRACTS.ravioli),
        );
      },
      /must link its referenced Ravioli wrapper token exactly/,
    );
  });
});

test("rejects semantically inconsistent Ravioli policies, deliveries, and operation partitions", async (t) => {
  async function rejectSemanticMutation(mutator, pattern) {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "ravioli", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      await mutator(manifest, runRoot);
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await assert.rejects(() => validateProofRun(runRoot), pattern);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  }

  await t.test("rehashed policy cannot claim a false finite-supply invariant", async () => {
    await rejectSemanticMutation(
      async (manifest, runRoot) => {
        await mutateRavioliArtifact(
          runRoot,
          manifest,
          "ravioli-limited-edition-policy",
          (policy) => {
            policy.invariant.wrapperIsFiniteSupply = false;
          },
        );
      },
      /invariant\.wrapperIsFiniteSupply must be true/,
    );
  });

  await t.test("rehashed policy cannot let the wrapper outlive its LE child", async () => {
    await rejectSemanticMutation(
      async (manifest, runRoot) => {
        await mutateRavioliArtifact(
          runRoot,
          manifest,
          "ravioli-limited-edition-policy",
          (policy) => {
            policy.wrapper.saleEnd = "2026-08-03T00:00:00.000Z";
          },
        );
      },
      /policy wrapper must end strictly before its child/,
    );
  });

  await t.test("missing one of the five mode capabilities fails closed", async () => {
    await rejectSemanticMutation(
      (manifest) => {
        manifest.capabilities = manifest.capabilities.filter(
          (entry) => entry.id !== "hybrid_atomic_pack-ui-live-proof",
        );
      },
      /requires capability hybrid_atomic_pack-ui-live-proof/,
    );
  });

  await t.test("rehashed outcome cannot report invalid delivery balance arithmetic", async () => {
    await rejectSemanticMutation(
      async (manifest, runRoot) => {
        await mutateRavioliArtifact(
          runRoot,
          manifest,
          "ravioli-mode-4-outcome",
          (outcome) => {
            outcome.openOutcomes[0].balanceDeltas[0].after += 1;
          },
        );
      },
      /child balance arithmetic drift/,
    );
  });

  await t.test("capability operations must equal its outcome partition exactly", async () => {
    await rejectSemanticMutation(
      (manifest) => {
        const capability = manifest.capabilities.find(
          (entry) => entry.id === "deterministic_vault-ui-live-proof",
        );
        capability.evidence.operations = capability.evidence.operations.slice(1);
      },
      /operation references differ from its exact mode-outcome partition/,
    );
  });

  await t.test("rehashed outcome cannot alter a committed operation tree", async () => {
    await rejectSemanticMutation(
      async (manifest, runRoot) => {
        await mutateRavioliArtifact(
          runRoot,
          manifest,
          "ravioli-mode-0-outcome",
          (outcome) => {
            outcome.openOutcomes[0].operationTree[0].value.actions[0].tampered = true;
          },
        );
      },
      /open tree does not match its SHA-256 commitment/,
    );
  });

  await t.test("green sellout outcome cannot invent a third blind wrapper", async () => {
    await rejectSemanticMutation(
      async (manifest, runRoot) => {
        await mutateRavioliArtifact(
          runRoot,
          manifest,
          "ravioli-mode-1-outcome",
          (outcome) => {
            outcome.maxSupply = 3;
          },
        );
      },
      /wrapper max-supply drift/,
    );
  });

  await t.test("journal operation cannot disguise one v3 entrypoint as another", async () => {
    await rejectSemanticMutation(
      (manifest) => {
        const operation = manifest.operations.find(
          (entry) => entry.entrypoint === "set_pack_contents",
        );
        operation.entrypoint = "finalize_pack";
      },
      /entrypoint counts differ from the semantic v3 plan/,
    );
  });

  await t.test("effective plan cannot omit the operation-67 adapter recovery", async () => {
    await rejectSemanticMutation(
      (manifest) => {
        const operation = manifest.operations.find(
          (entry) => entry.entrypoint === "recover_adapter",
        );
        assert.ok(operation, "fixture lacks operation 67");
        operation.entrypoint = "add_router";
      },
      /withheld-reveal-refund closure must include exactly one recover_adapter write/,
    );
  });

  await t.test("journal cannot omit one of sealed envelopes 1-5", async () => {
    await rejectSemanticMutation(
      (manifest) => {
        const removedIds = new Set([
          "ravioli-journal-pin-024",
          "ravioli-journal-pin-event-024",
        ]);
        manifest.artifacts = manifest.artifacts.filter(
          (artifact) => !removedIds.has(artifact.id),
        );
        const journalCapability = manifest.capabilities.find(
          (entry) => entry.id === "durable-signer-journal-ui-live-proof",
        );
        journalCapability.evidence.artifacts =
          journalCapability.evidence.artifacts.filter(
            (artifactId) => !removedIds.has(artifactId),
          );
      },
      /must contain exactly 34 PIN events/,
    );
  });

  await t.test("legacy base66 intent cannot omit authenticated event87", async () => {
    await rejectSemanticMutation(
      (manifest) => {
        const extensionId = "ravioli-journal-event-087-plan-extension";
        manifest.artifacts = manifest.artifacts.filter(
          (artifact) => artifact.id !== extensionId,
        );
        const journalCapability = manifest.capabilities.find(
          (entry) => entry.id === "durable-signer-journal-ui-live-proof",
        );
        journalCapability.evidence.artifacts =
          journalCapability.evidence.artifacts.filter(
            (artifactId) => artifactId !== extensionId,
          );
      },
      /immutable base66 plus authenticated event87/,
    );
  });

  await t.test("generated product manifest cannot omit Rotini token 5", async () => {
    await rejectSemanticMutation(
      (manifest) => {
        manifest.tokens = manifest.tokens.filter(
          (token) => token.id !== "ravioli-generated-rotini-5",
        );
        const hybrid = manifest.capabilities.find(
          (entry) => entry.id === "hybrid_atomic_pack-ui-live-proof",
        );
        hybrid.evidence.tokens = hybrid.evidence.tokens.filter(
          (tokenId) => tokenId !== "ravioli-generated-rotini-5",
        );
      },
      /must record generated Rotini product tokens 3, 4, and 5/,
    );
  });

  await t.test("red-path proof cannot omit withheld-reveal refund closure", async () => {
    await rejectSemanticMutation(
      (manifest) => {
        manifest.capabilities = manifest.capabilities.filter(
          (entry) =>
            entry.id !== "withheld-reveal-refund-closure-ui-live-proof",
        );
      },
      /requires capability withheld-reveal-refund-closure-ui-live-proof/,
    );
  });

  await t.test("six-contract graph cannot omit the blind controller", async () => {
    await rejectSemanticMutation(
      (manifest) => {
        manifest.contracts = manifest.contracts.filter(
          (entry) => entry.kind !== "blind-pack-controller",
        );
        for (const capability of manifest.capabilities) {
          capability.evidence.contracts = capability.evidence.contracts.filter(
            (address) => address !== RAVIOLI_CONTRACTS.blindController,
          );
        }
      },
      /references an unlisted contract/,
    );
  });
});

test("fails closed on an empty screenshot instead of packaging visual placeholders", async () => {
  const runRoot = await createCompleteFixture();
  try {
    await writeFile(path.join(runRoot, "rotini", "screenshots", "confirmed.png"), Buffer.alloc(0));
    await assert.rejects(() => validateProofRun(runRoot), /missing or empty/);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("fails closed when distinct stage ids reuse byte-identical screenshot evidence", async () => {
  const runRoot = await createCompleteFixture();
  try {
    const manifestPath = path.join(runRoot, "spaghetti", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const sourcePath = path.join(runRoot, "spaghetti", manifest.screenshots[0].path);
    const duplicatePath = path.join(runRoot, "spaghetti", manifest.screenshots[1].path);
    const duplicateBytes = await readFile(sourcePath);
    await writeFile(duplicatePath, duplicateBytes);
    manifest.screenshots[1].sha256 = sha256(duplicateBytes);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(
      () => validateProofRun(runRoot),
      /distinct screenshot bytes.*configure.*submit|configure.*submit.*same SHA-256/,
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("requires every Gnocchi token to bind exact proof-time supply and holders to the pinned snapshot", async (t) => {
  await t.test("missing historical token fields", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "gnocchi", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      delete manifest.tokens[0].historicalStateArtifactId;
      delete manifest.tokens[0].proofLevel;
      delete manifest.tokens[0].proofTotalSupply;
      delete manifest.tokens[0].proofHoldersCount;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /historicalStateArtifactId/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("manifest supply differs from pinned proof-time snapshot", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "gnocchi", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.tokens[0].proofTotalSupply = "2";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /proofTotalSupply.*historical snapshot/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});

test("fails closed on malformed live identifiers and secret-bearing manifests", async (t) => {
  await t.test("malformed KT1", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "macaroni", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.contracts[0].address = "KT1not-a-contract";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /not a valid Tezos KT1 address/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("malformed operation hash", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "ravioli", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.operations[0].hash = "op-not-a-real-operation";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /not a valid Tezos operation hash/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("malformed pinned CID", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "rotini", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.artifacts[0].ipfsUri = "ipfs://not-a-cid/metadata.json";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /malformed CID/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("gateway link that only embeds the CID inside an unrelated path segment", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "rotini", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.artifacts[0].gatewayUrl = `https://ipfs.io/ipfs/not-${CID}-a-cid-segment`;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /as a path segment or subdomain/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("explorer link that only embeds a contract inside an unrelated path segment", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "macaroni", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.contracts[0].explorerUrl = `https://shadownet.tzkt.io/not-${CONTRACTS.macaroni}`;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(() => validateProofRun(runRoot), /does not contain its evidence identifier/);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("private signing material key", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "spaghetti", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.privateKey = "never-package-this";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(
        () => validateProofRun(runRoot),
        (error) => error instanceof ProofPackageError && /prohibited/.test(error.message),
      );
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  await t.test("probable credential inside a packaged artifact", async () => {
    const runRoot = await createCompleteFixture();
    try {
      const manifestPath = path.join(runRoot, "spaghetti", "manifest.json");
      const artifactPath = path.join(runRoot, "spaghetti", "artifacts", "token-metadata.json");
      const artifactBytes = Buffer.from(
        JSON.stringify({ name: "bad proof", note: "Bearer abcdefghijklmnopqrstuvwxyz012345" }),
      );
      await writeFile(artifactPath, artifactBytes);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const artifact = manifest.artifacts.find((entry) => entry.id === "token-metadata");
      artifact.sha256 = sha256(artifactBytes);
      artifact.retrievedSha256 = artifact.sha256;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(
        () => validateProofRun(runRoot),
        (error) =>
          error instanceof ProofPackageError &&
          /contains probable signing material or credentials/.test(error.message),
      );
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});
