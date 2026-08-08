import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  PastaUiLivePreparedOperation,
  PastaUiLivePublicReceipt,
  PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import {
  createRotiniUiLiveCheckpoint,
  ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
  type RotiniUiLiveExpectedOperation,
} from "./shadownet-rotini-ui-live-checkpoint";
import {
  ROTINI_PNG_RECONCILIATION_CAPABILITY,
  ROTINI_PNG_RECONCILIATION_STAGE_NAME,
  finalizeRotiniUiLiveReadOnly,
  readFinalizedRotiniCheckpoint,
  validateRecoveredRotiniOperations,
} from "./shadownet-rotini-readonly-finalizer";
import {
  FRESH_GNOCCHI_CONTRACT_ARTIFACT_PATH,
  FRESH_ROTINI_RECOVERED_RECEIPT_PATH,
  loadFreshRavioliDependencies,
} from "./shadownet-ravioli-fresh-dependencies";
import { buildRotiniProofLayerPng } from "./shadownet-rotini-ui-live";
import { SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const GNOCCHI_CONTRACT = "KT1NJJ55w4TLkRVfuweeRfvT9jvWFf4viaup";
const GNOCCHI_ORIGINATION = "ooqQerwmFGorWABitNHN2fHYiTszK9VYB7UJhaRSciFp1pBEXKD";
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
const CONTRACT_ARTIFACT = path.resolve("public/creation-tools/rotini/contract/pasta-generative-collection.contract.json");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function addNativeGnocchiDependency(runRoot: string): Promise<void> {
  const appRoot = path.join(runRoot, "gnocchi");
  await mkdir(path.join(appRoot, "artifacts"), { recursive: true });
  const artifacts: Array<Record<string, unknown>> = [];
  const tokens: Array<Record<string, unknown>> = [];
  const persistArtifact = async (
    id: string,
    kind: string,
    relativePath: string,
    bytes: Uint8Array,
    ipfsUri?: string,
  ): Promise<Record<string, unknown>> => {
    await mkdir(path.dirname(path.join(appRoot, relativePath)), { recursive: true });
    await writeFile(path.join(appRoot, relativePath), bytes);
    const artifact = {
      id,
      kind,
      path: relativePath,
      sha256: sha256(bytes),
      ...(ipfsUri ? { ipfsUri, retrievedSha256: sha256(bytes) } : {}),
    };
    artifacts.push(artifact);
    return artifact;
  };
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    const artifactUri = `ipfs://bafkreignocchimedia${tokenId}`;
    const metadataUri = `ipfs://bafkreignocchmetadata${tokenId}`;
    const media = await persistArtifact(
      `token-${tokenId}-media`,
      "token-media",
      `artifacts/token-${tokenId}-media.png`,
      Buffer.from(`gnocchi-media-${tokenId}`),
      artifactUri,
    );
    const metadata = await persistArtifact(
      `token-${tokenId}-metadata`,
      "token-metadata",
      `artifacts/token-${tokenId}-metadata.json`,
      jsonBytes({ name: `Gnocchi ${tokenId}`, artifactUri }),
      metadataUri,
    );
    tokens.push({
      id: `gnocchi-token-${tokenId}`,
      contractAddress: GNOCCHI_CONTRACT,
      tokenId: String(tokenId),
      metadataArtifactId: metadata.id,
      mediaArtifactId: media.id,
      metadataUri,
      artifactUri,
    });
  }
  await persistArtifact(
    "collection-metadata",
    "collection-metadata",
    "artifacts/collection-metadata.json",
    jsonBytes({ name: "Gnocchi dependency fixture" }),
    "ipfs://bafkreignocchicollection",
  );
  const scriptBytes = await readFile(FRESH_GNOCCHI_CONTRACT_ARTIFACT_PATH);
  await persistArtifact(
    "gnocchi-current-contract-code",
    "contract-code",
    "artifacts/gnocchi-current-contract-code.json",
    scriptBytes,
  );
  const receipt = {
    schema: "pastaprotocol-gnocchi-ui-live-run@1",
    classification: "UI-LIVE",
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    actors: {
      creator: CREATOR,
      collectorOne: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej",
      collectorTwo: "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ",
    },
    contract: {
      address: GNOCCHI_CONTRACT,
      scriptSha256: sha256(scriptBytes),
    },
    receipts: [{
      action: "originate",
      operationHash: GNOCCHI_ORIGINATION,
      contractAddress: GNOCCHI_CONTRACT,
      signerAddress: CREATOR,
      chainId: SHADOWNET_CHAIN_ID,
    }],
    pins: artifacts.filter((artifact) => artifact.ipfsUri),
    indexed: { indexedTokenMetadataUris: tokens.map((token) => token.metadataUri) },
    ravioliDependency: {
      schema: "pastaprotocol-gnocchi-ravioli-dependency@1",
      contractAddress: GNOCCHI_CONTRACT,
      administrator: CREATOR,
      script: {
        artifactPath: "artifacts/gnocchi-current-contract-code.json",
        artifactSha256: sha256(scriptBytes),
        artifactCodeSha256: "a".repeat(64),
        onChainCodeSha256: "a".repeat(64),
        exactMatch: true,
      },
      limitedEdition: {
        tokenId: 2,
        metadataUri: tokens[2].metadataUri,
        policy: {
          active: true,
          start: "2026-07-22T11:00:00.000Z",
          end: "2026-07-29T12:00:00.000Z",
          maxSupply: 4,
          policyLocked: true,
        },
        baseline: { totalSupply: 3, totalMinted: 3, totalReserved: 0, remainingMintable: 1 },
        allocation: {
          availableAmount: 1,
          ravioliWrapperMustBeLimitedEdition: true,
          wrapperSaleEndMustBeNoLaterThan: "2026-07-29T12:00:00.000Z",
          recommendedRavioliSaleEnd: "2026-07-29T11:00:00.000Z",
        },
      },
    },
  };
  const receiptPath = "artifacts/gnocchi-ui-live-run.json";
  const receiptBytes = jsonBytes(receipt);
  await writeFile(path.join(appRoot, receiptPath), receiptBytes);
  artifacts.push({
    id: "ui-live-run-receipt",
    kind: "run-receipt",
    path: receiptPath,
    sha256: sha256(receiptBytes),
  });
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "gnocchi",
    role: "token-publisher",
    runId: path.basename(runRoot),
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
    artifacts,
    contracts: [{ address: GNOCCHI_CONTRACT, kind: "open-edition-collection" }],
    operations: [{ kind: "origination", hash: GNOCCHI_ORIGINATION, contractAddress: GNOCCHI_CONTRACT, status: "applied" }],
    tokens,
  };
  await writeFile(path.join(appRoot, "manifest.json"), jsonBytes(manifest));
}

function gifBytes(): Buffer {
  return Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(32, 1), Buffer.from([0x3b])]);
}

function zipBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("index.html\0rotini-manifest.json\0assets/layer-01.png\0assets/layer-02.png\0offline", "ascii"),
  ]);
}

function actorAddress(actor: "creator" | "collector"): string {
  return actor === "creator" ? CREATOR : COLLECTOR;
}

function prepared(expected: RotiniUiLiveExpectedOperation, code: unknown[]): PastaUiLivePreparedOperation {
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
    return { ...common, descriptor: { kind: "originate", code, storage: { administrator: CREATOR } } };
  }
  return {
    ...common,
    contractAddress: CONTRACT,
    descriptor: {
      kind: "call",
      call: {
        contractAddress: CONTRACT,
        entrypoint: expected.entrypoint!,
        payload: expected.entrypoint === "reserve_iteration"
          ? Math.floor((expected.operationSequence - 1) / 2)
          : expected.entrypoint === "finalize_iteration"
            ? { reservation_id: Math.floor((expected.operationSequence - 2) / 2) }
            : { output_mode: expected.operationSequence === 2 ? hex("png") : expected.operationSequence === 3 ? hex("gif") : hex("zip") },
      },
      sendOptions: {},
    },
  };
}

function submitted(expected: RotiniUiLiveExpectedOperation, operation: PastaUiLivePreparedOperation): PastaUiLiveSubmittedOperation {
  return {
    ...operation,
    status: "SUBMITTED",
    timestampUtc: new Date(Date.parse(operation.timestampUtc) + 100).toISOString(),
    operationHash: OPERATION_HASHES[expected.globalOrdinal - 1],
    ...(expected.action === "originate" ? { contractAddress: CONTRACT } : {}),
  };
}

function confirmed(expected: RotiniUiLiveExpectedOperation): PastaUiLivePublicReceipt {
  return {
    schema: "pastaprotocol-ui-live-receipt@1",
    sequence: expected.operationSequence,
    timestampUtc: new Date(Date.parse("2026-07-22T20:00:00.000Z") + expected.globalOrdinal * 1_000 + 200).toISOString(),
    action: expected.action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: actorAddress(expected.actor),
    contractAddress: CONTRACT,
    operationHash: OPERATION_HASHES[expected.globalOrdinal - 1],
    ...(expected.entrypoint ? { entrypoints: [expected.entrypoint] } : {}),
  };
}

const PIN_LAYOUT = [
  ["creator", "rotini-collection-preview.png", "image/png"],
  ["creator", "rotini-layer-1.png", "image/png"],
  ["creator", "rotini-layer-2.png", "image/png"],
  ["creator", "rotini-generator.json", "application/json"],
  ["creator", "collection.json", "application/json"],
  ["creator", "rotini-collection-preview.png", "image/png"],
  ["creator", "rotini-layer-1.png", "image/png"],
  ["creator", "rotini-layer-2.png", "image/png"],
  ["creator", "rotini-generator.json", "application/json"],
  ["creator", "rotini-collection-preview.png", "image/png"],
  ["creator", "rotini-layer-1.png", "image/png"],
  ["creator", "rotini-layer-2.png", "image/png"],
  ["creator", "rotini-generator.json", "application/json"],
  ["collector", "rotini-0.png", "image/png"],
  ["collector", "rotini-0.json", "application/json"],
  ["collector", "rotini-1.gif", "image/gif"],
  ["collector", "rotini-1.json", "application/json"],
  ["collector", "rotini-2.zip", "application/zip"],
  ["collector", "rotini-2-cover.png", "image/png"],
  ["collector", "rotini-2.json", "application/json"],
] as const;

type Fixture = {
  parent: string;
  runRoot: string;
  appRoot: string;
  code: unknown[];
  pins: Array<{ bytes: Uint8Array; cid: string; uri: string }>;
  responses: Map<string, unknown | Uint8Array>;
};

async function createFixture(
  finalizeCheckpoint = true,
  screenshotMode: "native" | "png-reconciliation" = "native",
): Promise<Fixture> {
  const parent = await mkdtemp(path.join(tmpdir(), "rotini-readonly-"));
  const runRoot = path.join(parent, "pasta-alpha-proof-test");
  const appRoot = path.join(runRoot, "rotini");
  await mkdir(path.join(appRoot, "artifacts"), { recursive: true });
  await mkdir(path.join(appRoot, "screenshots"), { recursive: true });
  const contractBytes = await readFile(CONTRACT_ARTIFACT);
  const code = JSON.parse(contractBytes.toString("utf8"));
  await writeFile(path.join(appRoot, "artifacts", "rotini-current-contract-code.json"), contractBytes);
  const checkpoint = await createRotiniUiLiveCheckpoint({
    checkpointRoot: path.join(appRoot, "artifacts", "rotini-ui-live-checkpoint"),
    runId: path.basename(runRoot),
    createdAt: "2026-07-22T20:00:00.000Z",
    actors: { creator: CREATOR, collector: COLLECTOR },
    contractIdentity: {
      artifactPath: "public/creation-tools/rotini/contract/pasta-generative-collection.contract.json",
      rawArtifactSha256: sha256(contractBytes),
      canonicalMichelsonCodeSha256: hashMichelsonScriptCode(code),
    },
  });
  for (const expected of ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX) {
    const operation = prepared(expected, code);
    await checkpoint.beforeOperationSubmit(expected.actor, operation);
    await checkpoint.onOperationSubmitted(expected.actor, submitted(expected, operation));
    await checkpoint.onReceipt(expected.actor, confirmed(expected));
  }

  const png = buildRotiniProofLayerPng(20, 40, 60);
  const seeds = ["1".repeat(64), "2".repeat(64), "3".repeat(64)];
  const generatorUris = ["", "", ""];
  const pins: Array<{ bytes: Uint8Array; cid: string; uri: string }> = [];
  for (let index = 0; index < PIN_LAYOUT.length; index += 1) {
    const [actor, fileName, mimeType] = PIN_LAYOUT[index];
    let bytes: Uint8Array = png;
    if (fileName === "collection.json") bytes = Buffer.from(JSON.stringify({ name: "Rotini proof" }));
    else if (fileName === "rotini-generator.json") bytes = Buffer.from(JSON.stringify({ schema: "pasta-rotini-generator@2", mode: generatorUris.filter(Boolean).length === 0 ? "png" : generatorUris.filter(Boolean).length === 1 ? "gif" : "zip" }));
    else if (fileName === "rotini-1.gif") bytes = gifBytes();
    else if (fileName === "rotini-2.zip") bytes = zipBytes();
    const digest = sha256(bytes);
    const cid = `bafkrei${digest.slice(0, 52)}`;
    const uri = `ipfs://${cid}`;
    if (fileName === "rotini-generator.json") generatorUris[generatorUris.findIndex((entry) => !entry)] = uri;
    if (/^rotini-[012]\.json$/.test(fileName)) {
      const tokenId = Number(fileName[7]);
      const mediaIndexes = [13, 15, 17];
      const media = pins[mediaIndexes[tokenId]];
      const cover = tokenId === 2 ? pins[18] : media;
      const mime = ["image/png", "image/gif", "application/zip"][tokenId];
      bytes = Buffer.from(JSON.stringify({
        name: `Rotini ${tokenId}`,
        creators: [CREATOR],
        minter: COLLECTOR,
        artifactUri: media.uri,
        displayUri: cover.uri,
        thumbnailUri: cover.uri,
        formats: [{ uri: media.uri, mimeType: mime }],
        "pasta:projectId": tokenId,
        "pasta:iteration": 0,
        "pasta:seed": seeds[tokenId],
        "pasta:generatorUri": generatorUris[tokenId],
        "pasta:artifactSha256": sha256(media.bytes),
      }));
    }
    const finalDigest = sha256(bytes);
    const finalCid = `bafkrei${finalDigest.slice(0, 52)}`;
    const finalUri = `ipfs://${finalCid}`;
    const proof = {
      cid: finalCid,
      uri: finalUri,
      fileName,
      mimeType,
      byteLength: bytes.byteLength,
      sha256: finalDigest,
      localGatewayUrl: `http://127.0.0.1:8080/ipfs/${finalCid}`,
      publicGatewayUrl: `https://ipfs.io/ipfs/${finalCid}`,
      publicGatewayVerified: true as const,
      verificationAttempts: 1,
    };
    await checkpoint.beforePin(actor, { bytes, fileName, mimeType });
    await checkpoint.onPin(actor, { proof });
    await checkpoint.onReceipt(actor, {
      schema: "pastaprotocol-ui-live-receipt@1",
      sequence: 100 + index,
      timestampUtc: new Date(Date.parse("2026-07-22T20:10:00.000Z") + index * 1_000).toISOString(),
      action: mimeType === "application/json" ? "pin_json" : "pin_blob",
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress: actorAddress(actor),
      cid: finalCid,
      ipfsUri: finalUri,
      publicGatewayUrl: proof.publicGatewayUrl,
      sha256: finalDigest,
      byteCount: bytes.byteLength,
      fileName,
    });
    pins.push({ bytes, cid: finalCid, uri: finalUri });
  }
  if (finalizeCheckpoint) await checkpoint.finalize("2026-07-22T21:00:00.000Z");

  const stageText = [
    "generated 4 edition(s)",
    `connected ${CREATOR} on shadownet`,
    `Published PNG generator project 0 ${CONTRACT}`,
    "Published GIF generator project 1",
    "Published ZIP generator project 2",
    `connected ${COLLECTOR} PNG`,
    "PNG iteration 0 finalized",
    "GIF iteration 1 finalized",
    "ZIP iteration 2 finalized",
  ];
  for (let ordinal = 1; ordinal <= 9; ordinal += 1) {
    const reconciledPng = ordinal === 7 && screenshotMode === "png-reconciliation";
    const stage = reconciledPng
      ? "007-collector-reconcile-png-token-png-token-post-confirmation-state-reconciled"
      : `${String(ordinal).padStart(3, "0")}-stage-${ordinal}`;
    const bytes = Buffer.concat([png, Buffer.from(String(ordinal))]);
    await writeFile(path.join(appRoot, "screenshots", `${stage}.png`), bytes);
    await writeFile(path.join(appRoot, "artifacts", `screenshot-${stage}.json`), JSON.stringify({
      schema: "pastaprotocol-screenshot-evidence@1",
      app: "rotini",
      classification: "UI-LIVE",
      capability: reconciledPng ? ROTINI_PNG_RECONCILIATION_CAPABILITY : "proof",
      stageName: reconciledPng ? ROTINI_PNG_RECONCILIATION_STAGE_NAME : `stage ${ordinal}`,
      stageOrdinal: ordinal,
      sha256: sha256(bytes),
      byteCount: bytes.byteLength,
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      url: "http://127.0.0.1:43210/creation-tools/rotini/index.html",
      timestampUtc: new Date(Date.parse("2026-07-22T20:20:00.000Z") + ordinal * 1_000).toISOString(),
      domEvidence: reconciledPng ? [
        {
          selector: "#mintInfo",
          matchCount: 1,
          text: "minting open · 1 finalized + 0 rendering / 4 · PNG · 0.000000 tez",
        },
        {
          selector: "#log",
          matchCount: 1,
          text: `connected ${COLLECTOR} on shadownet`,
        },
      ] : [{ selector: "#log", matchCount: 1, text: stageText[ordinal - 1] }],
    }));
  }

  const projects = [0, 1, 2].map((projectId) => ({
    active: true,
    key: projectId,
    value: {
      active: true,
      output_mode: hex(["png", "gif", "zip"][projectId]),
      price: [0, 1, 1][projectId],
      max_supply: 4,
      max_per_wallet: 4,
      reservation_ttl: 3600,
      minted: 1,
      reserved: 0,
      treasury: CREATOR,
      generator_uri: hex(pins[[3, 8, 12][projectId]].uri),
      display_uri: hex(pins[[0, 5, 9][projectId]].uri),
    },
  }));
  const tokenMetadata = [0, 1, 2].map((tokenId) => ({ active: true, key: tokenId, value: { token_info: { "": hex(pins[[14, 16, 19][tokenId]].uri), artifactUri: hex(pins[[13, 15, 17][tokenId]].uri) } } }));
  const tokenArtifacts = [0, 1, 2].map((tokenId) => ({ active: true, key: tokenId, value: { artifact_uri: hex(pins[[13, 15, 17][tokenId]].uri), mime_type: hex(["image/png", "image/gif", "application/zip"][tokenId]), artifact_hash: sha256(pins[[13, 15, 17][tokenId]].bytes) } }));
  const origin = {
    hash: OPERATION_HASHES[0], status: "applied", sender: { address: CREATOR }, originatedContract: { address: CONTRACT },
    timestamp: "2026-07-22T20:00:01.000Z", level: 100, counter: 1,
  };
  const transactions = ROTINI_UI_LIVE_EXPECTED_OPERATION_MATRIX.slice(1).map((expected, offset) => ({
    hash: OPERATION_HASHES[offset + 1], status: "applied", sender: { address: actorAddress(expected.actor) }, target: { address: CONTRACT },
    parameter: { entrypoint: expected.entrypoint }, amount: expected.entrypoint === "reserve_iteration" && offset + 1 > 4 ? 1 : 0,
    timestamp: new Date(Date.parse("2026-07-22T20:00:01.000Z") + (offset + 1) * 1_000).toISOString(), level: 101 + offset, counter: offset + 2,
  }));
  const storage: Record<string, unknown> = { administrator: CREATOR, next_project_id: 3, next_reservation_id: 3, next_token_id: 3 };
  const mapNames = ["metadata", "projects", "reservations", "latest_reservation", "ledger", "token_metadata", "total_supply", "token_project", "token_seed", "token_artifact", "minted_by", "reserved_by", "operators", "pack_minters", "pack_reserved"];
  mapNames.forEach((name, index) => { storage[name] = 1000 + index; });
  const mapValues: Record<string, unknown> = {
    metadata: [{ active: true, key: "", value: hex(pins[4].uri) }],
    projects,
    reservations: [],
    latest_reservation: [{ active: true, key: COLLECTOR, value: 2 }],
    ledger: [0, 1, 2].map((tokenId) => ({ active: true, key: { owner: COLLECTOR, token_id: tokenId }, value: 1 })),
    token_metadata: tokenMetadata,
    total_supply: [0, 1, 2].map((key) => ({ active: true, key, value: 1 })),
    token_project: [0, 1, 2].map((key) => ({ active: true, key, value: key })),
    token_seed: [0, 1, 2].map((key) => ({ active: true, key, value: seeds[key] })),
    token_artifact: tokenArtifacts,
    minted_by: [0, 1, 2].map((tokenId) => ({ active: true, key: { owner: COLLECTOR, token_id: tokenId }, value: 1 })),
    reserved_by: [], operators: [], pack_minters: [], pack_reserved: [],
  };
  const responses = new Map<string, unknown | Uint8Array>();
  responses.set(`/v1/contracts/${CONTRACT}`, { address: CONTRACT, kind: "asset", tzips: ["fa2"], tokensCount: 3, typeHash: 1, codeHash: 2 });
  responses.set(`/v1/contracts/${CONTRACT}/storage`, storage);
  responses.set(`/v1/contracts/${CONTRACT}/code`, code);
  responses.set("/v1/operations/originations", [origin]);
  responses.set("/v1/operations/transactions", transactions);
  responses.set("/v1/tokens", [0, 1, 2].map((tokenId) => ({ contract: { address: CONTRACT }, tokenId, standard: "fa2", totalSupply: 1 })));
  responses.set("/v1/tokens/balances", [0, 1, 2].map((tokenId) => ({ account: { address: COLLECTOR }, token: { contract: { address: CONTRACT }, tokenId }, balance: 1 })));
  mapNames.forEach((name, index) => responses.set(`/v1/bigmaps/${1000 + index}/keys`, mapValues[name]));
  pins.forEach((pin) => responses.set(`/ipfs/${pin.cid}`, pin.bytes));
  return { parent, runRoot, appRoot, code, pins, responses };
}

function fixtureFetch(fixture: Fixture, calls: RequestInit[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(init || {});
    const url = new URL(String(input));
    const value = fixture.responses.get(url.pathname);
    if (value === undefined) return new Response("missing", { status: 404 });
    return value instanceof Uint8Array
      ? new Response(value)
      : Response.json(value);
  }) as typeof fetch;
}

test("signer-free Rotini finalizer accepts a complete checkpoint and emits strict recovered evidence", async () => {
  const fixture = await createFixture();
  const calls: RequestInit[] = [];
  try {
    const result = await finalizeRotiniUiLiveReadOnly({
      runRoot: fixture.runRoot,
      fetchImpl: fixtureFetch(fixture, calls),
      publicIpfsGateway: "https://ipfs.io/ipfs",
    });
    assert.equal(result.contractAddress, CONTRACT);
    assert.equal(result.operationHashes.length, 10);
    assert.ok(calls.length > 20);
    assert.ok(calls.every((init) => init.method === "GET" && init.body === undefined));
    const receipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
    assert.equal(receipt.schema, "pastaprotocol-rotini-ui-live-finalized@1");
    assert.equal(receipt.classification, "UI-LIVE-READ-ONLY-FINALIZATION");
    assert.equal(receipt.sideEffects.signerMaterialLoaded, false);
    assert.equal(receipt.sideEffects.chainWrites, 0);
    assert.equal(receipt.sideEffects.ipfsWrites, 0);
    assert.deepEqual(receipt.terminalInterruption, {
      classification: "TERMINAL_POST_WRITE_FAILURE_CAUSE_UNAVAILABLE",
      exactCauseAvailable: false,
      synthesized: false,
    });
    assert.equal(receipt.contentArtifacts.length, 20);
    assert.equal(receipt.indexedOperationReceipts.length, 10);
    assert.equal(receipt.screenshots.length, 9);
    assert.equal("bridgeReceipts" in receipt, false);
    assert.equal("pins" in receipt, false);
    await addNativeGnocchiDependency(fixture.runRoot);
    const dependencies = await loadFreshRavioliDependencies({
      runRoot: fixture.runRoot,
      expectedRunId: path.basename(fixture.runRoot),
      expectedCreator: CREATOR,
    });
    assert.equal(
      dependencies.rotini.receiptPath,
      await realpath(path.join(fixture.appRoot, FRESH_ROTINI_RECOVERED_RECEIPT_PATH)),
    );
    assert.equal(dependencies.rotini.contractAddress, CONTRACT);
    assert.equal(dependencies.rotini.project0.remainingReservable, 3);
    const before = await readFile(result.receiptPath);
    const repeated = await finalizeRotiniUiLiveReadOnly({ runRoot: fixture.runRoot, fetchImpl: async () => { throw new Error("must not fetch"); } });
    assert.equal(repeated.contractAddress, CONTRACT);
    assert.deepEqual(await readFile(result.receiptPath), before);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test("Rotini finalizer accepts only the exact honest PNG reconciliation stage while preserving GIF and ZIP evidence", async () => {
  const accepted = await createFixture(true, "png-reconciliation");
  try {
    const result = await finalizeRotiniUiLiveReadOnly({
      runRoot: accepted.runRoot,
      fetchImpl: fixtureFetch(accepted),
      publicIpfsGateway: "https://ipfs.io/ipfs",
    });
    const receipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
    assert.equal(receipt.screenshots[6].stage, "007-collector-reconcile-png-token-png-token-post-confirmation-state-reconciled");
  } finally {
    await rm(accepted.parent, { recursive: true, force: true });
  }

  const wrongCapability = await createFixture(true, "png-reconciliation");
  try {
    const sidecarPath = path.join(
      wrongCapability.appRoot,
      "artifacts",
      "screenshot-007-collector-reconcile-png-token-png-token-post-confirmation-state-reconciled.json",
    );
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    sidecar.capability = "generic recovery";
    await writeFile(sidecarPath, JSON.stringify(sidecar));
    await assert.rejects(finalizeRotiniUiLiveReadOnly({
      runRoot: wrongCapability.runRoot,
      fetchImpl: fixtureFetch(wrongCapability),
    }), /collector reconcile PNG token|capability/);
  } finally {
    await rm(wrongCapability.parent, { recursive: true, force: true });
  }

  const missingVisibleState = await createFixture(true, "png-reconciliation");
  try {
    const sidecarPath = path.join(
      missingVisibleState.appRoot,
      "artifacts",
      "screenshot-007-collector-reconcile-png-token-png-token-post-confirmation-state-reconciled.json",
    );
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    sidecar.domEvidence.find((entry: Record<string, unknown>) => entry.selector === "#mintInfo").text = "minting open · PNG";
    await writeFile(sidecarPath, JSON.stringify(sidecar));
    await assert.rejects(finalizeRotiniUiLiveReadOnly({
      runRoot: missingVisibleState.runRoot,
      fetchImpl: fixtureFetch(missingVisibleState),
    }), /must show one finalized token/);
  } finally {
    await rm(missingVisibleState.parent, { recursive: true, force: true });
  }

  const wrongCollectorLog = await createFixture(true, "png-reconciliation");
  try {
    const sidecarPath = path.join(
      wrongCollectorLog.appRoot,
      "artifacts",
      "screenshot-007-collector-reconcile-png-token-png-token-post-confirmation-state-reconciled.json",
    );
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    sidecar.domEvidence.find((entry: Record<string, unknown>) => entry.selector === "#log").text =
      "connected tz1burnburnburnburnburnburnburjAYjjX on shadownet";
    await writeFile(sidecarPath, JSON.stringify(sidecar));
    await assert.rejects(finalizeRotiniUiLiveReadOnly({
      runRoot: wrongCollectorLog.runRoot,
      fetchImpl: fixtureFetch(wrongCollectorLog),
    }), /bind the checkpoint collector/);
  } finally {
    await rm(wrongCollectorLog.parent, { recursive: true, force: true });
  }

  const missingGif = await createFixture(true, "png-reconciliation");
  try {
    const sidecarPath = path.join(missingGif.appRoot, "artifacts", "screenshot-008-stage-8.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    sidecar.domEvidence[0].text = "GIF project loaded";
    await writeFile(sidecarPath, JSON.stringify(sidecar));
    await assert.rejects(finalizeRotiniUiLiveReadOnly({
      runRoot: missingGif.runRoot,
      fetchImpl: fixtureFetch(missingGif),
    }), /GIF iteration 1 finalized/);
  } finally {
    await rm(missingGif.parent, { recursive: true, force: true });
  }
});

test("fresh Ravioli dependency loading replays recovered Rotini checkpoint evidence and rejects later tamper", async () => {
  const fixture = await createFixture();
  try {
    await finalizeRotiniUiLiveReadOnly({
      runRoot: fixture.runRoot,
      fetchImpl: fixtureFetch(fixture),
      publicIpfsGateway: "https://ipfs.io/ipfs",
    });
    await addNativeGnocchiDependency(fixture.runRoot);
    const recoveredReceiptPath = path.join(fixture.appRoot, FRESH_ROTINI_RECOVERED_RECEIPT_PATH);
    const manifestPath = path.join(fixture.appRoot, "manifest.json");
    const [originalReceiptBytes, originalManifestBytes] = await Promise.all([
      readFile(recoveredReceiptPath),
      readFile(manifestPath),
    ]);
    const originalReceipt = JSON.parse(originalReceiptBytes.toString("utf8"));
    const originalManifest = JSON.parse(originalManifestBytes.toString("utf8"));
    const reconciliationPath = path.join(fixture.appRoot, originalReceipt.chainReconciliation.path);
    const firstContentPath = path.join(fixture.appRoot, originalReceipt.contentArtifacts[0].path);
    const [originalReconciliationBytes, originalFirstContentBytes] = await Promise.all([
      readFile(reconciliationPath),
      readFile(firstContentPath),
    ]);
    const originalReconciliation = JSON.parse(originalReconciliationBytes.toString("utf8"));
    const unsupportedCauseReceipt = structuredClone(originalReceipt);
    unsupportedCauseReceipt.terminalInterruption.classification = "RPC_HTTP_429_AFTER_CONFIRMED_WRITES";
    unsupportedCauseReceipt.terminalInterruption.exactCauseAvailable = true;
    const unsupportedCauseBytes = jsonBytes(unsupportedCauseReceipt);
    await writeFile(recoveredReceiptPath, unsupportedCauseBytes);
    const unsupportedCauseManifest = structuredClone(originalManifest);
    unsupportedCauseManifest.artifacts.find((artifact: Record<string, unknown>) =>
      artifact.id === "ui-live-readonly-finalization"
    ).sha256 = sha256(unsupportedCauseBytes);
    await writeFile(manifestPath, jsonBytes(unsupportedCauseManifest));
    await assert.rejects(loadFreshRavioliDependencies({
      runRoot: fixture.runRoot,
      expectedRunId: path.basename(fixture.runRoot),
      expectedCreator: CREATOR,
    }), /terminal interruption classification/i);
    await Promise.all([
      writeFile(recoveredReceiptPath, originalReceiptBytes),
      writeFile(manifestPath, originalManifestBytes),
    ]);

    const rewrittenOperationReceipt = structuredClone(originalReceipt);
    const rewrittenOperationManifest = structuredClone(originalManifest);
    const rewrittenReconciliation = structuredClone(originalReconciliation);
    rewrittenOperationReceipt.indexedOperationReceipts[0].operationHash = GNOCCHI_ORIGINATION;
    rewrittenOperationManifest.operations[0].hash = GNOCCHI_ORIGINATION;
    rewrittenReconciliation.operations[0].operationHash = GNOCCHI_ORIGINATION;
    const rewrittenReconciliationBytes = jsonBytes(rewrittenReconciliation);
    await writeFile(reconciliationPath, rewrittenReconciliationBytes);
    rewrittenOperationReceipt.chainReconciliation.sha256 = sha256(rewrittenReconciliationBytes);
    rewrittenOperationManifest.artifacts.find((artifact: Record<string, unknown>) =>
      artifact.id === "rotini-chain-reconciliation-snapshot"
    ).sha256 = sha256(rewrittenReconciliationBytes);
    const rewrittenOperationReceiptBytes = jsonBytes(rewrittenOperationReceipt);
    await writeFile(recoveredReceiptPath, rewrittenOperationReceiptBytes);
    rewrittenOperationManifest.artifacts.find((artifact: Record<string, unknown>) =>
      artifact.id === "ui-live-readonly-finalization"
    ).sha256 = sha256(rewrittenOperationReceiptBytes);
    await writeFile(manifestPath, jsonBytes(rewrittenOperationManifest));
    await assert.rejects(loadFreshRavioliDependencies({
      runRoot: fixture.runRoot,
      expectedRunId: path.basename(fixture.runRoot),
      expectedCreator: CREATOR,
    }), /checkpoint operation 0 hash/i);
    await Promise.all([
      writeFile(recoveredReceiptPath, originalReceiptBytes),
      writeFile(manifestPath, originalManifestBytes),
      writeFile(reconciliationPath, originalReconciliationBytes),
    ]);

    const rewrittenPinReceipt = structuredClone(originalReceipt);
    const rewrittenPinManifest = structuredClone(originalManifest);
    const rewrittenPinBytes = Buffer.concat([originalFirstContentBytes, Buffer.from("rewritten-package")]);
    const rewrittenPinHash = sha256(rewrittenPinBytes);
    await writeFile(firstContentPath, rewrittenPinBytes);
    rewrittenPinReceipt.contentArtifacts[0].sha256 = rewrittenPinHash;
    rewrittenPinReceipt.contentArtifacts[0].retrievedSha256 = rewrittenPinHash;
    const rewrittenPinArtifact = rewrittenPinManifest.artifacts.find((artifact: Record<string, unknown>) =>
      artifact.id === rewrittenPinReceipt.contentArtifacts[0].id
    );
    rewrittenPinArtifact.sha256 = rewrittenPinHash;
    rewrittenPinArtifact.retrievedSha256 = rewrittenPinHash;
    const rewrittenPinReceiptBytes = jsonBytes(rewrittenPinReceipt);
    await writeFile(recoveredReceiptPath, rewrittenPinReceiptBytes);
    rewrittenPinManifest.artifacts.find((artifact: Record<string, unknown>) =>
      artifact.id === "ui-live-readonly-finalization"
    ).sha256 = sha256(rewrittenPinReceiptBytes);
    await writeFile(manifestPath, jsonBytes(rewrittenPinManifest));
    await assert.rejects(loadFreshRavioliDependencies({
      runRoot: fixture.runRoot,
      expectedRunId: path.basename(fixture.runRoot),
      expectedCreator: CREATOR,
    }), /checkpoint pin 1 (?:content|packaged)/i);
    await Promise.all([
      writeFile(recoveredReceiptPath, originalReceiptBytes),
      writeFile(manifestPath, originalManifestBytes),
      writeFile(firstContentPath, originalFirstContentBytes),
    ]);

    const eventPath = path.join(
      fixture.appRoot,
      "artifacts",
      "rotini-ui-live-checkpoint",
      "events",
      "000001-prepared-creator.json",
    );
    const event = JSON.parse(await readFile(eventPath, "utf8"));
    event.timestampUtc = "2026-07-22T20:00:59.000Z";
    await writeFile(eventPath, jsonBytes(event));
    await assert.rejects(loadFreshRavioliDependencies({
      runRoot: fixture.runRoot,
      expectedRunId: path.basename(fixture.runRoot),
      expectedCreator: CREATOR,
    }), /checkpoint JSON is not canonical|hash-chain drift/i);
    await assert.rejects(finalizeRotiniUiLiveReadOnly({
      runRoot: fixture.runRoot,
      fetchImpl: async () => { throw new Error("tampered local evidence must fail before fetch"); },
    }), /checkpoint JSON is not canonical|hash-chain drift/i);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test("Rotini finalizer refuses an incomplete checkpoint before any network read", async () => {
  const fixture = await createFixture(false);
  let calls = 0;
  try {
    await assert.rejects(finalizeRotiniUiLiveReadOnly({
      runRoot: fixture.runRoot,
      fetchImpl: async () => { calls += 1; return new Response("wrong"); },
    }), /FINALIZED|final|checkpoint/i);
    assert.equal(calls, 0);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test("Rotini reconciliation binds every checkpoint hash and rejects operation or public-byte drift", async () => {
  const fixture = await createFixture();
  try {
    const checkpoint = await readFinalizedRotiniCheckpoint(fixture.appRoot);
    const originations = fixture.responses.get("/v1/operations/originations");
    const transactions = structuredClone(fixture.responses.get("/v1/operations/transactions")) as Array<Record<string, unknown>>;
    assert.equal(validateRecoveredRotiniOperations({ checkpoint, originations, transactions }).operationHashes.length, 10);
    transactions[0].hash = OPERATION_HASHES[9];
    await assert.throws(
      () => validateRecoveredRotiniOperations({ checkpoint, originations, transactions }),
      /absent|unique|extra|reused/i,
    );

    fixture.responses.set(`/ipfs/${fixture.pins[0].cid}`, Buffer.from("tampered"));
    await assert.rejects(finalizeRotiniUiLiveReadOnly({
      runRoot: fixture.runRoot,
      fetchImpl: fixtureFetch(fixture),
      publicIpfsGateway: "https://ipfs.io/ipfs",
    }), /public bytes differ/i);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});
