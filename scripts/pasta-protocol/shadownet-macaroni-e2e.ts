#!/usr/bin/env tsx

import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { deflateSync } from "node:zlib";

import { MichelsonMap } from "@taquito/taquito";

import {
  assertShadownet,
  block,
  buildToolkit,
  collectAnnotations,
  createLogger,
  hexToUtf8,
  loadSignerPair,
  normalizeBase,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  root,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  writeProofReport,
  type ProofStatus,
} from "./shadownet-proof-kit";

const REPORT_PATH = path.join(
  root,
  ".agents",
  "docs",
  "archive",
  "contracts",
  "pasta-protocol",
  "shadownet-macaroni-e2e-report.md",
);
const CONTRACT_ARTIFACT_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "macaroni",
  "contract",
  "macaroni-v2.contract.json",
);
const TEMPLATE_MANIFEST_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "macaroni",
  "contract",
  "macaroni-v2.template.json",
);
const IPFS_GATEWAY = normalizeBase(
  process.env.PASTA_SHADOWNET_IPFS_GATEWAY || "https://ipfs.fileship.xyz",
);
const MINT_PRICE_MUTEZ = readNonNegativeInteger(
  "PASTA_SHADOWNET_MACARONI_MINT_PRICE_MUTEZ",
  1_000,
);
const CREATOR_OPERATION_RESERVE_MUTEZ = readNonNegativeInteger(
  "PASTA_SHADOWNET_MACARONI_CREATOR_RESERVE_MUTEZ",
  2_000_000,
);
const COLLECTOR_OPERATION_RESERVE_MUTEZ = readNonNegativeInteger(
  "PASTA_SHADOWNET_MACARONI_COLLECTOR_RESERVE_MUTEZ",
  750_000,
);
const REQUIRED_ENTRYPOINTS = [
  "transfer",
  "balance_of",
  "update_operators",
  "add_tokens_v2",
  "replace_tokens_v2",
  "set_stages",
  "set_allowlist",
  "mint",
  "reveal",
  "update_minter_royalty_metadata",
  "lock_minter_royalties",
  "set_pause",
  "transfer_administration",
  "accept_administration",
] as const;

let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-macaroni-e2e");

type PinProvider =
  | { kind: "kubo"; url: string }
  | { kind: "pinata"; jwt: string };

type ProofBytes = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  sha256: string;
  cid?: string;
  uri?: string;
  gatewayUrl?: string;
};

type MacaroniProofAssets = {
  artifact: Required<ProofBytes>;
  placeholderArtifact: Required<ProofBytes>;
  tokenMetadata: Required<ProofBytes>;
  placeholderMetadata: Required<ProofBytes>;
  collectionMetadata: Required<ProofBytes>;
  tokenMetadataValue: Record<string, unknown>;
  placeholderMetadataValue: Record<string, unknown>;
  collectionMetadataValue: Record<string, unknown>;
};

function readNonNegativeInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw == null || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Macaroni V2 Shadownet E2E Report",
    status,
    lines,
    rpcUrl: reportRpcUrl,
  });
}

function pinProvider(): PinProvider {
  const kubo = (process.env.PASTA_SHADOWNET_IPFS_API_URL || "").trim().replace(/\/+$/, "");
  if (kubo) return { kind: "kubo", url: kubo };
  const jwt = (
    process.env.PASTA_SHADOWNET_PINATA_JWT ||
    process.env.WTFGAMESHOW_IPFS_JWT ||
    process.env.WTF_GAMESHOW_IPFS_JWT ||
    process.env.WTFGAMESHOW_PINATA_JWT ||
    process.env.PINATA_JWT ||
    process.env.PINATA_API_JWT ||
    ""
  ).trim();
  if (jwt) return { kind: "pinata", jwt };
  block("a durable IPFS pinner is required before the Macaroni Shadownet proof can write", [
    "Macaroni contract metadata, placeholder metadata, final token metadata, and both image artifacts must resolve from IPFS; fake CIDs and temporary HTTP files are rejected.",
    "Set `PASTA_SHADOWNET_IPFS_API_URL` to a reachable Kubo HTTP API, or set `PASTA_SHADOWNET_PINATA_JWT`.",
    "Optionally set `PASTA_SHADOWNET_IPFS_GATEWAY`; the default verifier is `https://ipfs.fileship.xyz`.",
  ]);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(name: string, data: Uint8Array): Buffer {
  const type = Buffer.from(name, "ascii");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([header, type, data, checksum]);
}

function proofPng(seed: string): Uint8Array {
  const width = 32;
  const height = 32;
  const seedBytes = createHash("sha256").update(seed).digest();
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[offset++] = (seedBytes[0] + x * 7 + y * 3) & 255;
      raw[offset++] = (seedBytes[1] + x * y + y * 11) & 255;
      raw[offset++] = (seedBytes[2] + x * 13 + y * 5) & 255;
      raw[offset++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function proofBytes(fileName: string, mimeType: string, bytes: Uint8Array): ProofBytes {
  return { fileName, mimeType, bytes, sha256: sha256(bytes) };
}

function jsonBytes(fileName: string, value: unknown): ProofBytes {
  return proofBytes(fileName, "application/json", Buffer.from(JSON.stringify(value), "utf8"));
}

function dataUri(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function buildCollectionMetadata(creator: string, artifactUri: string, runId: string): Record<string, unknown> {
  return {
    name: `Macaroni V2 Shadownet Proof ${runId}`,
    description: "Fresh signer-backed Macaroni blind-mint, wallet-limit, and reveal proof.",
    version: "1.0.0",
    authors: [creator],
    interfaces: ["TZIP-012", "TZIP-016", "TZIP-021"],
    imageUri: artifactUri,
    source: {
      tools: ["Pasta Protocol Macaroni"],
      location: "https://wtfos.app/tools/macaroni",
    },
    "pasta:app": "macaroni",
    "pasta:network": "shadownet",
    "pasta:proofRun": runId,
  };
}

function buildTokenMetadata(options: {
  creator: string;
  artifactUri: string;
  artifactSha256: string;
  artifactBytes: number;
  runId: string;
  placeholder: boolean;
}): Record<string, unknown> {
  const name = options.placeholder
    ? `Macaroni V2 Hidden Token ${options.runId}`
    : `Macaroni V2 Revealed Token ${options.runId}`;
  return {
    name,
    symbol: "MACV2",
    decimals: 0,
    description: options.placeholder
      ? "Unrevealed metadata shown after the blind mint and before the collector reveal."
      : "Final metadata revealed by the collector in the Macaroni V2 Shadownet proof.",
    artifactUri: options.artifactUri,
    displayUri: options.artifactUri,
    thumbnailUri: options.artifactUri,
    creators: [options.creator],
    tags: ["macaroni", "blind-mint", "shadownet", options.placeholder ? "placeholder" : "revealed"],
    formats: [
      {
        uri: options.artifactUri,
        mimeType: "image/png",
        fileSize: options.artifactBytes,
        sha256: options.artifactSha256,
      },
    ],
    "pasta:app": "macaroni",
    "pasta:network": "shadownet",
    "pasta:proofRun": options.runId,
    "pasta:revealState": options.placeholder ? "unrevealed" : "revealed",
  };
}

function gatewayUrl(cid: string): string {
  return `${IPFS_GATEWAY}/${cid}`;
}

async function pinBytes(provider: PinProvider, item: ProofBytes): Promise<Required<ProofBytes>> {
  const body = new Uint8Array(item.bytes.length);
  body.set(item.bytes);
  const form = new FormData();
  form.append("file", new Blob([body], { type: item.mimeType }), item.fileName);

  let response: Response;
  if (provider.kind === "kubo") {
    response = await fetch(`${provider.url}/api/v0/add?pin=true&cid-version=1`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } else {
    response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.jwt}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  }

  const text = await response.text();
  assert.ok(response.ok, `IPFS pin failed ${response.status}: ${text.slice(0, 500)}`);
  const line = text.trim().split("\n").at(-1) || "{}";
  const json = JSON.parse(line);
  const cid = String(json.Hash || json.IpfsHash || json.cid || "");
  assert.match(cid, /^(?:Qm|baf)[a-zA-Z0-9]+$/, "IPFS pinner returned no valid CID");
  return {
    ...item,
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: gatewayUrl(cid),
  };
}

async function fetchPinned(item: Required<ProofBytes>, label: string): Promise<void> {
  let last = "no response";
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(item.gatewayUrl, { signal: AbortSignal.timeout(15_000) });
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        assert.equal(sha256(bytes), item.sha256, `${label} gateway bytes differ from pinned bytes`);
        return;
      }
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error(`${label} did not resolve from ${item.gatewayUrl}: ${last}`);
}

async function pinProofAssets(
  provider: PinProvider,
  creator: string,
  runId: string,
): Promise<MacaroniProofAssets> {
  const artifact = await pinBytes(
    provider,
    proofBytes(`macaroni-${runId}-revealed.png`, "image/png", proofPng(`${runId}:revealed`)),
  );
  const placeholderArtifact = await pinBytes(
    provider,
    proofBytes(`macaroni-${runId}-placeholder.png`, "image/png", proofPng(`${runId}:placeholder`)),
  );

  const tokenMetadataValue = buildTokenMetadata({
    creator,
    artifactUri: artifact.uri,
    artifactSha256: artifact.sha256,
    artifactBytes: artifact.bytes.length,
    runId,
    placeholder: false,
  });
  const placeholderMetadataValue = buildTokenMetadata({
    creator,
    artifactUri: placeholderArtifact.uri,
    artifactSha256: placeholderArtifact.sha256,
    artifactBytes: placeholderArtifact.bytes.length,
    runId,
    placeholder: true,
  });
  const collectionMetadataValue = buildCollectionMetadata(creator, artifact.uri, runId);
  const tokenMetadata = await pinBytes(provider, jsonBytes(`macaroni-${runId}-token.json`, tokenMetadataValue));
  const placeholderMetadata = await pinBytes(
    provider,
    jsonBytes(`macaroni-${runId}-placeholder.json`, placeholderMetadataValue),
  );
  const collectionMetadata = await pinBytes(
    provider,
    jsonBytes(`macaroni-${runId}-collection.json`, collectionMetadataValue),
  );

  await Promise.all([
    fetchPinned(artifact, "revealed artifact"),
    fetchPinned(placeholderArtifact, "placeholder artifact"),
    fetchPinned(tokenMetadata, "revealed token metadata"),
    fetchPinned(placeholderMetadata, "placeholder token metadata"),
    fetchPinned(collectionMetadata, "contract metadata"),
  ]);

  return {
    artifact,
    placeholderArtifact,
    tokenMetadata,
    placeholderMetadata,
    collectionMetadata,
    tokenMetadataValue,
    placeholderMetadataValue,
    collectionMetadataValue,
  };
}

async function readCurrentContractArtifact(): Promise<{
  code: unknown[];
  sha256: string;
  manifest: Record<string, unknown>;
}> {
  const [artifactText, manifestText] = await Promise.all([
    readFile(CONTRACT_ARTIFACT_PATH, "utf8"),
    readFile(TEMPLATE_MANIFEST_PATH, "utf8"),
  ]);
  const code = JSON.parse(artifactText);
  const manifest = JSON.parse(manifestText) as Record<string, unknown>;
  assert.ok(Array.isArray(code), "Macaroni V2 contract artifact should be a Micheline code array");
  assert.equal(manifest.templateVersion, "macaroni-editions-v2");
  assert.equal(
    manifest.compiledContract,
    "public/creation-tools/macaroni/contract/macaroni-v2.contract.json",
  );
  assert.deepEqual(manifest.entrypoints, [...REQUIRED_ENTRYPOINTS]);
  const annotations = collectAnnotations(code);
  for (const entrypoint of REQUIRED_ENTRYPOINTS) {
    assert.ok(annotations.has(entrypoint), `Macaroni V2 artifact is missing %${entrypoint}`);
  }
  return { code, sha256: sha256(Buffer.from(artifactText, "utf8")), manifest };
}

function tokenInfo(metadataUri: string): MichelsonMap<string, string> {
  const info = new MichelsonMap<string, string>();
  info.set("", utf8ToHex(metadataUri));
  return info;
}

function originationStorage(options: {
  administrator: string;
  collectionMetadataUri: string;
  placeholderMetadataUri: string;
}) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(options.collectionMetadataUri));
  const placeholderPool = new MichelsonMap<number, { token_id: number; token_info: MichelsonMap<string, string> }>();
  placeholderPool.set(0, { token_id: 0, token_info: tokenInfo(options.placeholderMetadataUri) });
  return {
    administrator: options.administrator,
    pending_administrator: null,
    treasury: options.administrator,
    metadata,
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    pending_tokens: new MichelsonMap(),
    token_supply: new MichelsonMap(),
    token_minted: new MichelsonMap(),
    slots: new MichelsonMap(),
    supply: 0,
    minted: 0,
    token_count: 0,
    stages: new MichelsonMap(),
    allowlist: new MichelsonMap(),
    stage_minted: new MichelsonMap(),
    locked: false,
    paused: false,
    delayed_reveal: true,
    placeholder_pool: placeholderPool,
    placeholder_count: 1,
    token_placeholder: new MichelsonMap(),
    reveal_queue: new MichelsonMap(),
    reveal_cursor: 0,
    reveal_tail: 0,
    reveal_delay: 0,
    unrevealed_since: null,
    revealed: 0,
    minter_royalty_config: {
      enabled: false,
      bps: 0,
      mode: 0,
      updater: options.administrator,
    },
    first_minter: new MichelsonMap(),
    minter_pool: new MichelsonMap(),
    minter_pool_count: new MichelsonMap(),
    royalty_revision: new MichelsonMap(),
    metadata_revision: new MichelsonMap(),
    royalty_locked: new MichelsonMap(),
  };
}

function serializeError(error: unknown): string {
  const parts = [error instanceof Error ? `${error.name}: ${error.message}` : String(error)];
  try {
    parts.push(
      JSON.stringify(error, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
  } catch {
    // The Error message remains available even if an SDK object is circular.
  }
  return parts.filter(Boolean).join(" | ");
}

function numberText(value: unknown): number {
  if (typeof value === "object" && value && "int" in value) return Number((value as { int: unknown }).int);
  return Number(value);
}

async function main(): Promise<void> {
  if (process.env.PASTA_SHADOWNET_E2E_EXECUTE !== "1") {
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof pins durable IPFS artifacts, originates a real Shadownet contract, and spends test tez.",
    ]);
  }
  const configuredNetwork = (process.env.TEZOS_NETWORK || "shadownet").trim().toLowerCase();
  if (configuredNetwork !== "shadownet") {
    throw new Error(`Refusing to run Macaroni Shadownet E2E with TEZOS_NETWORK=${configuredNetwork}`);
  }

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-macaroni-shadownet-e2e.sock",
    authToken: "local-pasta-macaroni-shadownet-e2e",
    auditLog: "/tmp/wtf-pasta-macaroni-shadownet-e2e-audit.log",
  });
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(env);
  assert.notEqual(creator.address, collector.address, "creator and collector signers must be independent");
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  await assertShadownet(creatorTezos, "creator startup");
  await assertShadownet(collectorTezos, "collector startup");

  const [creatorBalance, collectorBalance, artifact] = await Promise.all([
    creatorTezos.tz.getBalance(creator.address),
    collectorTezos.tz.getBalance(collector.address),
    readCurrentContractArtifact(),
  ]);
  const creatorBalanceMutez = Number(creatorBalance.toString());
  const collectorBalanceMutez = Number(collectorBalance.toString());
  assert.ok(Number.isSafeInteger(creatorBalanceMutez), "creator balance is outside the safe integer range");
  assert.ok(Number.isSafeInteger(collectorBalanceMutez), "collector balance is outside the safe integer range");

  const runId = `${Date.now().toString(36)}-${artifact.sha256.slice(0, 8)}`;
  const provisionalArtifact = proofPng(`${runId}:provisional`);
  const provisionalArtifactUri = dataUri("image/png", provisionalArtifact);
  const provisionalPlaceholderMetadata = buildTokenMetadata({
    creator: creator.address,
    artifactUri: provisionalArtifactUri,
    artifactSha256: sha256(provisionalArtifact),
    artifactBytes: provisionalArtifact.length,
    runId,
    placeholder: true,
  });
  const provisionalCollectionMetadata = buildCollectionMetadata(
    creator.address,
    provisionalArtifactUri,
    runId,
  );
  const estimateStorage = originationStorage({
    administrator: creator.address,
    collectionMetadataUri: dataUri(
      "application/json",
      Buffer.from(JSON.stringify(provisionalCollectionMetadata), "utf8"),
    ),
    placeholderMetadataUri: dataUri(
      "application/json",
      Buffer.from(JSON.stringify(provisionalPlaceholderMetadata), "utf8"),
    ),
  });
  let originationEstimate;
  try {
    originationEstimate = await creatorTezos.estimate.originate({
      code: artifact.code,
      storage: estimateStorage,
    } as any);
  } catch (error) {
    const estimateError = serializeError(error);
    if (/tez\.subtraction_underflow/.test(estimateError)) {
      block("creator wallet is too underfunded for the RPC to estimate Macaroni origination", [
        `Creator \`${creator.address}\` has \`${creatorBalanceMutez}\` mutez.`,
        "Octez simulates origination against the creator's real balance, so it cannot return a fee/burn estimate until that balance can cover the simulated storage burn.",
        "Fund the creator with Shadownet test tez, then rerun; no IPFS pin or chain write occurred.",
      ]);
    }
    throw error;
  }
  const estimatedOriginationMutez =
    Number(originationEstimate.suggestedFeeMutez) + Number(originationEstimate.burnFeeMutez);
  const requiredCreatorMutez = estimatedOriginationMutez + CREATOR_OPERATION_RESERVE_MUTEZ;
  const requiredCollectorMutez = MINT_PRICE_MUTEZ + COLLECTOR_OPERATION_RESERVE_MUTEZ;
  if (creatorBalanceMutez < requiredCreatorMutez || collectorBalanceMutez < requiredCollectorMutez) {
    block("creator or collector wallet cannot cover the estimated Macaroni proof", [
      `Creator \`${creator.address}\` has \`${creatorBalanceMutez}\` mutez and needs at least \`${requiredCreatorMutez}\` mutez.`,
      `Collector \`${collector.address}\` has \`${collectorBalanceMutez}\` mutez and needs at least \`${requiredCollectorMutez}\` mutez.`,
      `The conservative origination fee/burn estimate is \`${estimatedOriginationMutez}\` mutez; creator follow-on reserve is \`${CREATOR_OPERATION_RESERVE_MUTEZ}\` mutez.`,
      "Fund both Shadownet proof wallets, then rerun with the explicit execute flag.",
    ]);
  }
  ok(
    `pre-write funding gate passed: creator=${creatorBalanceMutez}/${requiredCreatorMutez}, collector=${collectorBalanceMutez}/${requiredCollectorMutez}`,
  );
  ok(
    `origination estimate fee=${originationEstimate.suggestedFeeMutez} burn=${originationEstimate.burnFeeMutez} storage=${originationEstimate.storageLimit}`,
  );

  const provider = pinProvider();
  const assets = await pinProofAssets(provider, creator.address, runId);
  ok(`pinned and gateway-verified five Macaroni proof artifacts with ${provider.kind}`);

  const storage = originationStorage({
    administrator: creator.address,
    collectionMetadataUri: assets.collectionMetadata.uri,
    placeholderMetadataUri: assets.placeholderMetadata.uri,
  });
  await assertShadownet(creatorTezos, "before Macaroni V2 origination");
  const originate = await creatorTezos.contract.originate({ code: artifact.code, storage } as any);
  await originate.confirmation(1);
  const originated = await originate.contract();
  ok(`originated ${originated.address} with ${originate.hash}`);

  const creatorContract = await creatorTezos.contract.at(originated.address);
  await assertShadownet(creatorTezos, "before Macaroni add_tokens_v2");
  const addTokens = await creatorContract.methodsObject
    .add_tokens_v2([
      {
        token_id: 0,
        token_info: tokenInfo(assets.tokenMetadata.uri),
        quantity: 2,
      },
    ])
    .send();
  await addTokens.confirmation(1);
  ok(`loaded token row 0 with two editions using ${addTokens.hash}`);

  const stages = new MichelsonMap<number, Record<string, unknown>>();
  stages.set(0, {
    start: new Date(Date.now() - 60_000).toISOString(),
    price: MINT_PRICE_MUTEZ,
    use_allowlist: false,
    max_per_wallet: 1,
  });
  await assertShadownet(creatorTezos, "before Macaroni set_stages");
  const setStages = await creatorContract.methodsObject.set_stages(stages).send();
  await setStages.confirmation(1);
  ok(`configured one-per-wallet public stage using ${setStages.hash}`);

  const collectorContract = await collectorTezos.contract.at(originated.address);
  await assertShadownet(collectorTezos, "before Macaroni collector mint");
  const mint = await collectorContract.methodsObject
    .mint(1)
    .send({ amount: MINT_PRICE_MUTEZ, mutez: true });
  await mint.confirmation(1);
  ok(`collector minted one blind edition using ${mint.hash}`);

  await assertShadownet(collectorTezos, "before Macaroni wallet-limit boundary");
  let walletLimitRejection = "";
  try {
    await collectorContract.methodsObject
      .mint(1)
      .send({ amount: MINT_PRICE_MUTEZ, mutez: true });
    assert.fail("collector unexpectedly bypassed Macaroni max_per_wallet=1");
  } catch (error) {
    walletLimitRejection = serializeError(error);
    assert.match(walletLimitRejection, /WALLET_LIMIT/, "negative mint did not fail at WALLET_LIMIT");
  }
  ok("collector's second mint was rejected at the exact WALLET_LIMIT boundary");

  await assertShadownet(collectorTezos, "before Macaroni collector reveal");
  const reveal = await collectorContract.methodsObject.reveal(1).send();
  await reveal.confirmation(1);
  ok(`collector revealed token row 0 using ${reveal.hash}`);

  const tzktBase = normalizeBase(SHADOWNET_TZKT_API);
  const indexedContract = await pollJson(
    "Macaroni V2 contract",
    `${tzktBase}/contracts/${encodeURIComponent(originated.address)}`,
    (json) => json?.address === originated.address && json?.kind === "smart_contract",
  );
  const indexedStorage = await pollJson(
    "Macaroni V2 revealed storage",
    `${tzktBase}/contracts/${encodeURIComponent(originated.address)}/storage`,
    (json) =>
      Number(json?.ledger) > 0 &&
      Number(json?.token_metadata) > 0 &&
      Number(json?.pending_tokens) > 0 &&
      Number(json?.token_supply) > 0 &&
      Number(json?.token_minted) > 0 &&
      Number(json?.stage_minted) > 0 &&
      Number(json?.minted) === 1 &&
      Number(json?.supply) === 2 &&
      Number(json?.token_count) === 1 &&
      Number(json?.revealed) === 1 &&
      Number(json?.reveal_cursor) === 1 &&
      Number(json?.reveal_tail) === 1 &&
      json?.unrevealed_since == null,
  );

  const [ledger, supplies, mintedTotals, stageMints, tokenMetadata, placeholderMetadata, indexedTokens, balances] =
    await Promise.all([
      pollJson(
        "Macaroni collector ledger balance",
        `${tzktBase}/bigmaps/${indexedStorage.ledger}/keys?limit=100`,
        (json) =>
          Array.isArray(json) &&
          json.some(
            (entry) =>
              entry?.key?.owner === collector.address &&
              numberText(entry?.key?.token_id) === 0 &&
              numberText(entry?.value) === 1,
          ),
      ),
      pollJson(
        "Macaroni token supply",
        `${tzktBase}/bigmaps/${indexedStorage.token_supply}/keys?limit=20`,
        (json) =>
          Array.isArray(json) &&
          json.some((entry) => numberText(entry?.key) === 0 && numberText(entry?.value) === 2),
      ),
      pollJson(
        "Macaroni token minted total",
        `${tzktBase}/bigmaps/${indexedStorage.token_minted}/keys?limit=20`,
        (json) =>
          Array.isArray(json) &&
          json.some((entry) => numberText(entry?.key) === 0 && numberText(entry?.value) === 1),
      ),
      pollJson(
        "Macaroni stage wallet total",
        `${tzktBase}/bigmaps/${indexedStorage.stage_minted}/keys?limit=100`,
        (json) =>
          Array.isArray(json) &&
          json.some(
            (entry) =>
              numberText(entry?.key?.stage) === 0 &&
              entry?.key?.holder === collector.address &&
              numberText(entry?.value) === 1,
          ),
      ),
      pollJson(
        "Macaroni revealed token metadata",
        `${tzktBase}/bigmaps/${indexedStorage.token_metadata}/keys?limit=20`,
        (json) =>
          Array.isArray(json) &&
          json.some(
            (entry) =>
              numberText(entry?.key) === 0 &&
              hexToUtf8(String(entry?.value?.token_info?.[""] || "")) === assets.tokenMetadata.uri,
          ),
      ),
      pollJson(
        "Macaroni placeholder metadata",
        `${tzktBase}/bigmaps/${indexedStorage.placeholder_pool}/keys?limit=20`,
        (json) =>
          Array.isArray(json) &&
          json.some(
            (entry) =>
              numberText(entry?.key) === 0 &&
              hexToUtf8(String(entry?.value?.token_info?.[""] || "")) === assets.placeholderMetadata.uri,
          ),
      ),
      pollJson(
        "Macaroni indexed token",
        `${tzktBase}/tokens?contract=${encodeURIComponent(originated.address)}&tokenId=0&limit=10`,
        (json) =>
          Array.isArray(json) &&
          json.some(
            (entry) =>
              entry?.contract?.address === originated.address && numberText(entry?.tokenId) === 0,
          ),
      ),
      pollJson(
        "Macaroni indexed collector ownership",
        `${tzktBase}/tokens/balances?account=${encodeURIComponent(collector.address)}&token.contract=${encodeURIComponent(originated.address)}&token.tokenId=0&balance.ne=0&limit=10`,
        (json) =>
          Array.isArray(json) &&
          json.some(
            (entry) =>
              entry?.account?.address === collector.address &&
              entry?.token?.contract?.address === originated.address &&
              numberText(entry?.token?.tokenId) === 0 &&
              numberText(entry?.balance) === 1,
          ),
      ),
    ]);

  const indexedTokenEntry = tokenMetadata.find((entry: any) => numberText(entry?.key) === 0);
  const indexedTokenUri = hexToUtf8(String(indexedTokenEntry?.value?.token_info?.[""] || ""));
  assert.equal(indexedTokenUri, assets.tokenMetadata.uri);
  const indexedTokenResponse = await fetch(assets.tokenMetadata.gatewayUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(indexedTokenResponse.ok, `indexed token metadata returned HTTP ${indexedTokenResponse.status}`);
  const indexedTokenBytes = new Uint8Array(await indexedTokenResponse.arrayBuffer());
  assert.equal(sha256(indexedTokenBytes), assets.tokenMetadata.sha256);
  assert.deepEqual(JSON.parse(Buffer.from(indexedTokenBytes).toString("utf8")), assets.tokenMetadataValue);

  const appliedTransactions = await pollJson(
    "Macaroni applied operation evidence",
    `${tzktBase}/operations/transactions?target=${encodeURIComponent(originated.address)}&status=applied&limit=100`,
    (json) => {
      if (!Array.isArray(json)) return false;
      const expected = [
        { hash: addTokens.hash, entrypoint: "add_tokens_v2" },
        { hash: setStages.hash, entrypoint: "set_stages" },
        { hash: mint.hash, entrypoint: "mint" },
        { hash: reveal.hash, entrypoint: "reveal" },
      ];
      return expected.every(({ hash, entrypoint }) =>
        json.some(
          (operation) =>
            operation?.hash === hash && operation?.parameter?.entrypoint === entrypoint,
        ),
      );
    },
  );

  assert.ok(Array.isArray(ledger));
  assert.ok(Array.isArray(supplies));
  assert.ok(Array.isArray(mintedTotals));
  assert.ok(Array.isArray(stageMints));
  assert.ok(Array.isArray(placeholderMetadata));
  assert.ok(Array.isArray(indexedTokens));
  assert.ok(Array.isArray(balances));
  assert.equal(indexedContract.address, originated.address);

  await writeReport("PASSED", [
    "## Result",
    "",
    "- Fresh signer-backed Macaroni V2 blind-mint and reveal proof passed.",
    `- Run id: \`${runId}\``,
    `- Creator: \`${creator.id}\` / \`${creator.address}\``,
    `- Collector: \`${collector.id}\` / \`${collector.address}\``,
    `- Contract: \`${originated.address}\``,
    `- Contract explorer: https://shadownet.tzkt.io/${originated.address}`,
    `- Token API: ${tzktBase}/tokens?contract=${originated.address}&tokenId=0`,
    `- Macaroni V2 Michelson SHA-256: \`${artifact.sha256}\``,
    "",
    "## Operations",
    "",
    `- Origination: \`${originate.hash}\` — https://shadownet.tzkt.io/${originate.hash}`,
    `- Load two-edition token row: \`${addTokens.hash}\` — https://shadownet.tzkt.io/${addTokens.hash}`,
    `- Configure public stage: \`${setStages.hash}\` — https://shadownet.tzkt.io/${setStages.hash}`,
    `- Collector mint: \`${mint.hash}\` — https://shadownet.tzkt.io/${mint.hash}`,
    `- Collector reveal: \`${reveal.hash}\` — https://shadownet.tzkt.io/${reveal.hash}`,
    `- Second-mint rejection: \`${walletLimitRejection.slice(0, 300)}\``,
    "",
    "## Durable IPFS evidence",
    "",
    `- Pin provider: \`${provider.kind}\` (credential and provider secrets are intentionally omitted).`,
    `- Revealed PNG: \`${assets.artifact.uri}\` — ${assets.artifact.gatewayUrl} — SHA-256 \`${assets.artifact.sha256}\``,
    `- Placeholder PNG: \`${assets.placeholderArtifact.uri}\` — ${assets.placeholderArtifact.gatewayUrl} — SHA-256 \`${assets.placeholderArtifact.sha256}\``,
    `- Revealed token metadata: \`${assets.tokenMetadata.uri}\` — ${assets.tokenMetadata.gatewayUrl} — SHA-256 \`${assets.tokenMetadata.sha256}\``,
    `- Placeholder metadata: \`${assets.placeholderMetadata.uri}\` — ${assets.placeholderMetadata.gatewayUrl} — SHA-256 \`${assets.placeholderMetadata.sha256}\``,
    `- Contract metadata: \`${assets.collectionMetadata.uri}\` — ${assets.collectionMetadata.gatewayUrl} — SHA-256 \`${assets.collectionMetadata.sha256}\``,
    `- Gateway \`${IPFS_GATEWAY}\` returned exact bytes for all five CIDs before chain writes completed, and the indexed final metadata URI was fetched and hash-verified again after reveal.`,
    "",
    "## Indexed state proof",
    "",
    `- TzKT indexed the originated contract as \`${indexedContract.kind}\` and returned \`${appliedTransactions.length}\` applied target transactions including add_tokens_v2, set_stages, mint, and reveal.`,
    `- Storage recorded supply=\`${indexedStorage.supply}\`, minted=\`${indexedStorage.minted}\`, token_count=\`${indexedStorage.token_count}\`, revealed=\`${indexedStorage.revealed}\`, reveal_cursor=\`${indexedStorage.reveal_cursor}\`, and an empty unrevealed_since value.`,
    `- Ledger big map \`${indexedStorage.ledger}\` and TzKT token balances both record collector ownership of one edition of token 0.`,
    `- Token supply/minted big maps \`${indexedStorage.token_supply}\` / \`${indexedStorage.token_minted}\` record 2 declared editions and 1 minted edition.`,
    `- Stage-minted big map \`${indexedStorage.stage_minted}\` records the collector's one allowed mint, and a second mint failed at \`WALLET_LIMIT\`.`,
    `- Token metadata big map \`${indexedStorage.token_metadata}\` points to the final pinned metadata after collector reveal; placeholder pool \`${indexedStorage.placeholder_pool}\` preserves the independently pinned pre-reveal metadata.`,
    "",
    "## What this proves",
    "",
    "- The current Macaroni V2 compiled artifact can originate a creator-owned FA2 blind-mint drop on Shadownet.",
    "- A creator can load edition-aware token inventory and configure an exact-price, one-per-wallet stage.",
    "- An independent collector can pay, receive the blind token, be blocked at the declared wallet limit, and reveal the final IPFS metadata without an Objkt, Teia, or wtfOS transaction dependency.",
    "- TzKT independently indexes the contract, FA2 token, collector balance, edition totals, stage limit state, reveal counters, and final metadata URI.",
  ]);
}

main().catch(async (error) => {
  if (error instanceof ProofBlocked) {
    await writeReport("BLOCKED", error.lines).catch(() => undefined);
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const message = error instanceof Error ? error.stack || error.message : String(error);
  await writeReport("FAILED", ["## Error", "", "```", message, "```"]).catch(() => undefined);
  console.error(
    `[pasta-shadownet-macaroni-e2e] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
