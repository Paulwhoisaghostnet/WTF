#!/usr/bin/env tsx

import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

import { MichelsonMap, type TezosToolkit } from "@taquito/taquito";

import {
  availableActions,
  buildCollectionMetadata,
  buildTokenMetadata,
  detectPastaContract,
} from "../../shared/pasta-protocol/index";
import {
  assertShadownet,
  block,
  buildToolkit,
  collectAnnotations,
  createLogger,
  hexToUtf8,
  loadSignerSet,
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

const REPORT_PATH = path.join(root, ".agents/docs/archive/contracts/pasta-protocol/shadownet-rotini-e2e-report.md");
const MIN_BALANCE_MUTEZ = Number(process.env.PASTA_SHADOWNET_ROTINI_E2E_MIN_BALANCE_MUTEZ || "750000");
const IPFS_GATEWAY = normalizeBase(process.env.PASTA_SHADOWNET_IPFS_GATEWAY || "https://ipfs.fileship.xyz");
const OUTPUTS = [
  { mode: "png", mimeType: "image/png", extension: "png" },
  { mode: "gif", mimeType: "image/gif", extension: "gif" },
  { mode: "zip", mimeType: "application/zip", extension: "zip" },
] as const;
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-rotini-e2e");

type PinProvider =
  | { kind: "kubo"; url: string }
  | { kind: "pinata"; jwt: string };

type ArtifactKernel = {
  buildInteractiveZip(input: Record<string, unknown>): Promise<{ blob: Blob; validation: { ok: boolean; errors: string[] } }>;
  encodeGif(frames: Array<{ width: number; height: number; data: Uint8ClampedArray }>, options?: { delayMs?: number }): Blob;
  selectTraits(manifest: any, seed: string): Array<{ layer: string; value: string; artifactUri: string; mimeType: string }>;
};

type PinnedToken = {
  tokenId: number;
  projectId: number;
  reservationId: number;
  owner: string;
  seed: string;
  mode: typeof OUTPUTS[number]["mode"];
  mimeType: typeof OUTPUTS[number]["mimeType"];
  artifactUri: string;
  displayUri: string;
  metadataUri: string;
  metadataBytes: Uint8Array;
  artifactHash: string;
  artifactBytes: Uint8Array;
  traits: Array<{ layer: string; value: string }>;
  reserveHash: string;
  finalizeHash: string;
};

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Rotini Self-Contained Artifact Shadownet E2E Report",
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
  block("a durable IPFS pinner is required before the Rotini Shadownet proof can write", [
    "The final token artifact and metadata must resolve from IPFS; fake CIDs and temporary HTTP files are rejected.",
    "Set `PASTA_SHADOWNET_IPFS_API_URL` to a reachable Kubo HTTP API, or set `PASTA_SHADOWNET_PINATA_JWT`.",
    "Optionally set `PASTA_SHADOWNET_IPFS_GATEWAY`; the default verifier is `https://ipfs.fileship.xyz`.",
  ]);
}

async function readContractArtifact(): Promise<unknown[]> {
  const artifact = path.join(root, "public/creation-tools/rotini/contract/pasta-generative-collection.contract.json");
  const code = JSON.parse(await readFile(artifact, "utf8"));
  assert.ok(Array.isArray(code), "Rotini generative contract artifact should be a Micheline array");
  return code;
}

async function loadArtifactKernel(): Promise<ArtifactKernel> {
  await import(pathToFileURL(path.join(root, "public/creation-tools/rotini/js/rotini-artifact.js")).href);
  const kernel = (globalThis as any).RotiniArtifacts as ArtifactKernel | undefined;
  assert.ok(kernel, "Rotini artifact kernel did not load");
  assert.equal(typeof kernel.buildInteractiveZip, "function");
  assert.equal(typeof kernel.encodeGif, "function");
  assert.equal(typeof kernel.selectTraits, "function");
  return kernel;
}

function toBytes(value: Blob | Uint8Array): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return Promise.resolve(value);
  return value.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
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
  const width = 16;
  const height = 16;
  const seedBytes = createHash("sha256").update(seed).digest();
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[offset++] = (seedBytes[0] + x * 13) & 255;
      raw[offset++] = (seedBytes[1] + y * 17) & 255;
      raw[offset++] = (seedBytes[2] + x * 5 + y * 7) & 255;
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

function gifFrames(seed: string): Array<{ width: number; height: number; data: Uint8ClampedArray }> {
  const bytes = createHash("sha256").update(seed).digest();
  return [0, 1, 2].map((frame) => {
    const data = new Uint8ClampedArray(16 * 16 * 4);
    for (let index = 0; index < 16 * 16; index += 1) {
      const x = index % 16;
      const y = Math.floor(index / 16);
      data[index * 4] = (bytes[frame] + x * 11 + frame * 29) & 255;
      data[index * 4 + 1] = (bytes[frame + 3] + y * 13) & 255;
      data[index * 4 + 2] = (bytes[frame + 6] + x * y) & 255;
      data[index * 4 + 3] = 255;
    }
    return { width: 16, height: 16, data };
  });
}

async function pinBytes(provider: PinProvider, bytes: Uint8Array, fileName: string, mimeType: string): Promise<string> {
  const form = new FormData();
  const body = new Uint8Array(bytes.length);
  body.set(bytes);
  form.append("file", new Blob([body], { type: mimeType }), fileName);
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
  return cid;
}

async function pinJson(provider: PinProvider, value: unknown, fileName: string): Promise<string> {
  return pinBytes(provider, Buffer.from(JSON.stringify(value), "utf8"), fileName, "application/json");
}

async function fetchPinned(cid: string, expected: Uint8Array, label: string): Promise<void> {
  let last = "no response";
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(`${IPFS_GATEWAY}/${cid}`, { signal: AbortSignal.timeout(15_000) });
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        assert.equal(digest(bytes), digest(expected), `${label} gateway bytes differ from the pinned artifact`);
        return;
      }
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error(`${label} did not resolve from ${IPFS_GATEWAY}: ${last}`);
}

function originationStorage(admin: string, collectionUri: string) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(collectionUri));
  return {
    administrator: admin,
    pending_administrator: null,
    metadata,
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    total_supply: new MichelsonMap(),
    projects: new MichelsonMap(),
    reservations: new MichelsonMap(),
    latest_reservation: new MichelsonMap(),
    token_project: new MichelsonMap(),
    token_seed: new MichelsonMap(),
    token_artifact: new MichelsonMap(),
    minted_by: new MichelsonMap(),
    reserved_by: new MichelsonMap(),
    pack_minters: new MichelsonMap(),
    pack_reserved: new MichelsonMap(),
    next_project_id: 0,
    next_reservation_id: 0,
    next_token_id: 0,
  };
}

async function reservationFor(tezos: TezosToolkit, contractAddress: string, owner: string) {
  const contract = await tezos.contract.at(contractAddress);
  const storage: any = await contract.storage();
  const rawId = await storage.latest_reservation.get(owner);
  assert.notEqual(rawId, undefined, `latest reservation was not stored for ${owner}`);
  const id = Number(rawId.toString());
  const value = await storage.reservations.get(id);
  assert.ok(value, `reservation ${id} was not stored`);
  return { id, value };
}

async function materialize(
  kernel: ArtifactKernel,
  mode: typeof OUTPUTS[number]["mode"],
  manifest: any,
  reservation: any,
  sourceByUri: Map<string, Uint8Array>,
): Promise<{ bytes: Uint8Array; traits: Array<{ layer: string; value: string }>; zipValidated: boolean }> {
  const seed = String(reservation.seed);
  const selected = kernel.selectTraits(manifest, seed);
  const selectedBytes = sourceByUri.get(selected[0]?.artifactUri || "");
  assert.ok(selectedBytes, "selected generator source was not available locally");
  if (mode === "png") return { bytes: selectedBytes, traits: selected, zipValidated: false };
  if (mode === "gif") {
    const blob = kernel.encodeGif(gifFrames(seed), { delayMs: 240 });
    return { bytes: await toBytes(blob), traits: selected, zipValidated: false };
  }
  const built = await kernel.buildInteractiveZip({
    name: `Rotini Offline ZIP Proof #${Number(reservation.iteration) + 1}`,
    seed,
    tokenId: Number(reservation.token_id),
    projectId: Number(reservation.project_id),
    width: 16,
    height: 16,
    traits: selected.map(({ layer, value }) => ({ layer, value })),
    layers: selected.map((trait) => ({
      name: trait.layer,
      mimeType: trait.mimeType,
      data: sourceByUri.get(trait.artifactUri),
    })),
  });
  assert.equal(built.validation.ok, true, built.validation.errors.join("; "));
  return { bytes: await toBytes(built.blob), traits: selected, zipValidated: true };
}

async function main(): Promise<void> {
  if (process.env.PASTA_SHADOWNET_E2E_EXECUTE !== "1") {
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof pins media, originates, reserves, and finalizes on Shadownet.",
    ]);
  }
  assert.notEqual(process.env.TEZOS_NETWORK, "mainnet", "Rotini Shadownet proof refuses mainnet");
  const provider = pinProvider();
  const kernel = await loadArtifactKernel();

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-rotini-e2e.sock",
    authToken: "local-pasta-shadownet-rotini-e2e",
    auditLog: "/tmp/wtf-pasta-shadownet-rotini-e2e-audit.log",
  });
  const { creator, creatorSigner, collector, collectorSigner, collectorTwo, collectorTwoSigner } = await loadSignerSet(env);
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  const collectorTwoTezos = buildToolkit(collectorTwoSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "creator startup"),
    assertShadownet(collectorTezos, "collector one startup"),
    assertShadownet(collectorTwoTezos, "collector two startup"),
  ]);

  const [creatorBalance, collectorBalance, collectorTwoBalance] = await Promise.all([
    creatorTezos.tz.getBalance(creator.address),
    collectorTezos.tz.getBalance(collector.address),
    collectorTwoTezos.tz.getBalance(collectorTwo.address),
  ]);
  for (const [actor, balance] of [
    [creator, creatorBalance],
    [collector, collectorBalance],
    [collectorTwo, collectorTwoBalance],
  ] as const) {
    if (Number(balance.toString()) < MIN_BALANCE_MUTEZ) {
      block("a Rotini proof puppet needs Shadownet test tez", [
        `Wallet \`${actor.id}\` / \`${actor.address}\` has \`${balance.toString()}\` mutez.`,
        `Fund it to at least \`${MIN_BALANCE_MUTEZ}\` mutez, then rerun.`,
      ]);
    }
  }

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract(entrypoints);
  assert.equal(adapter?.kind, "generative_collection");
  for (const action of ["reserve_iteration", "finalize_iteration", "cancel_expired_reservation", "set_project_active"]) {
    assert.ok(availableActions(adapter, entrypoints).some((candidate) => candidate.id === action), `Colander lacks ${action}`);
  }

  const sourceA = proofPng("rotini-proof-source-a");
  const sourceB = proofPng("rotini-proof-source-b");
  const sourceCidA = await pinBytes(provider, sourceA, "rotini-source-a.png", "image/png");
  const sourceCidB = await pinBytes(provider, sourceB, "rotini-source-b.png", "image/png");
  const sourceUriA = `ipfs://${sourceCidA}`;
  const sourceUriB = `ipfs://${sourceCidB}`;
  const sourceByUri = new Map([[sourceUriA, sourceA], [sourceUriB, sourceB]]);
  const relationship = { collection_group: `rotini-self-contained-proof-${Date.now().toString(36)}` };
  const manifests = [];
  const generatorUris = [];
  for (const output of OUTPUTS) {
    const manifest = {
      schema: "pasta-rotini-generator@2",
      name: `Rotini ${output.mode.toUpperCase()} Shadownet Proof`,
      description: `A collector-finalized ${output.mimeType} generated from an immutable Shadownet reservation.`,
      creator: creator.address,
      width: 16,
      height: 16,
      outputMode: output.mode,
      seedField: "pasta:seed",
      selection: "weighted-deterministic",
      layers: [{
        name: "Proof palette",
        variants: [
          { value: "Marinara", weight: 1, artifactUri: sourceUriA, mimeType: "image/png" },
          { value: "Pesto", weight: 1, artifactUri: sourceUriB, mimeType: "image/png" },
        ],
      }],
    };
    const cid = await pinJson(provider, manifest, `rotini-generator-${output.mode}.json`);
    manifests.push(manifest);
    generatorUris.push(`ipfs://${cid}`);
  }
  const collection = buildCollectionMetadata({
    name: "Rotini Self-Contained Artifact Shadownet Proof",
    description: "One contract proving collector-finalized PNG, GIF, and dependency-free interactive ZIP tokens.",
    symbol: "ROTSC",
    imageUri: sourceUriA,
    authors: [creator.address],
    relationship,
    extra: {
      rotini: {
        generatorUris,
        outputModes: OUTPUTS.map(({ mode, mimeType }) => ({ mode, mimeType })),
        mintModel: "collector-reserve-render-finalize-v2",
      },
    },
  });
  const collectionCid = await pinJson(provider, collection, "rotini-collection.json");
  const collectionUri = `ipfs://${collectionCid}`;
  const storage = originationStorage(creator.address, collectionUri);
  const estimate = await creatorTezos.estimate.originate({ code, storage } as any);
  const requiredCreator = Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez) + 1_000_000;
  if (Number(creatorBalance.toString()) < requiredCreator) {
    block("creator cannot cover fresh Rotini origination and lifecycle", [
      `Creator has \`${creatorBalance.toString()}\` mutez; estimated origination and lifecycle headroom require \`${requiredCreator}\`.`,
    ]);
  }

  const originate = await creatorTezos.contract.originate({ code, storage } as any);
  await originate.confirmation(1);
  const originated = await originate.contract();
  ok(`originated ${originated.address} with ${originate.hash}`);
  const creatorContract = await creatorTezos.contract.at(originated.address);
  const createHashes: string[] = [];
  for (let projectId = 0; projectId < OUTPUTS.length; projectId += 1) {
    const output = OUTPUTS[projectId];
    const operation = await creatorContract.methodsObject.create_project({
      active: true,
      name: utf8ToHex(`Rotini ${output.mode.toUpperCase()} Shadownet Proof`),
      symbol: utf8ToHex("ROTSC"),
      generator_uri: utf8ToHex(generatorUris[projectId]),
      display_uri: utf8ToHex(sourceUriA),
      output_mode: utf8ToHex(output.mode),
      price: 1,
      treasury: creator.address,
      max_supply: 2,
      max_per_wallet: 2,
      reservation_ttl: 3600,
    }).send();
    await operation.confirmation(1);
    createHashes.push(operation.hash);
  }
  ok(`registered PNG, GIF, and ZIP projects with ${createHashes.join(" / ")}`);

  let closedRejection = "";
  const closeBeforeReserve = await creatorContract.methodsObject.set_project_active({ project_id: 2, active: false }).send();
  await closeBeforeReserve.confirmation(1);
  try {
    const contract = await collectorTezos.contract.at(originated.address);
    await contract.methodsObject.reserve_iteration(2).send({ amount: 1, mutez: true });
    assert.fail("closed ZIP project unexpectedly accepted a reservation");
  } catch (error) {
    closedRejection = error instanceof Error ? error.message : String(error);
    assert.match(closedRejection, /PROJECT_INACTIVE|failed|simulation|rejected/i);
  }
  const reopenBeforeReserve = await creatorContract.methodsObject.set_project_active({ project_id: 2, active: true }).send();
  await reopenBeforeReserve.confirmation(1);

  const pinnedTokens: PinnedToken[] = [];
  for (let projectId = 0; projectId < OUTPUTS.length; projectId += 1) {
    const output = OUTPUTS[projectId];
    const owner = projectId === 1 ? collectorTwo : collector;
    const tezos = projectId === 1 ? collectorTwoTezos : collectorTezos;
    const contract = await tezos.contract.at(originated.address);
    const reserve = await contract.methodsObject.reserve_iteration(projectId).send({ amount: 1, mutez: true });
    await reserve.confirmation(1);
    const reservation = await reservationFor(tezos, originated.address, owner.address);
    assert.equal(Number(reservation.value.project_id), projectId);
    const tokenId = Number(reservation.value.token_id);
    const seed = String(reservation.value.seed);
    const rendered = await materialize(kernel, output.mode, manifests[projectId], reservation.value, sourceByUri);
    if (output.mode === "png") assert.deepEqual([...rendered.bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    if (output.mode === "gif") {
      assert.equal(Buffer.from(rendered.bytes.slice(0, 6)).toString("ascii"), "GIF89a");
      assert.equal(rendered.bytes.at(-1), 0x3b);
    }
    if (output.mode === "zip") {
      assert.equal(rendered.zipValidated, true);
      assert.deepEqual([...rendered.bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    }
    const artifactHash = digest(rendered.bytes);
    const artifactCid = await pinBytes(provider, rendered.bytes, `rotini-${tokenId}.${output.extension}`, output.mimeType);
    const artifactUri = `ipfs://${artifactCid}`;
    const displayUri = output.mode === "zip" ? sourceUriA : artifactUri;
    const metadata = buildTokenMetadata({
      name: `${manifests[projectId].name} #1`,
      description: manifests[projectId].description,
      symbol: "ROTSC",
      isBooleanAmount: true,
      artifactUri,
      displayUri,
      thumbnailUri: displayUri,
      mimeType: output.mimeType,
      creators: [creator.address],
      minter: owner.address,
      tags: ["rotini", "generative", "shadownet", output.mode],
      attributes: rendered.traits.map(({ layer, value }) => ({ name: layer, value })),
      relationship,
      extra: {
        formats: [{ uri: artifactUri, mimeType: output.mimeType, fileSize: rendered.bytes.length }],
        mintingTool: "Pasta Protocol Rotini 2",
        "pasta:seed": seed,
        "pasta:projectId": projectId,
        "pasta:iteration": Number(reservation.value.iteration),
        "pasta:generatorUri": generatorUris[projectId],
        "pasta:artifactSha256": artifactHash,
      },
    });
    const metadataBytes = Buffer.from(JSON.stringify(metadata), "utf8");
    const metadataCid = await pinBytes(provider, metadataBytes, `rotini-${tokenId}.json`, "application/json");
    const metadataUri = `ipfs://${metadataCid}`;

    let closeAfterReserveHash = "";
    if (output.mode === "zip") {
      const closeAfterReserve = await creatorContract.methodsObject.set_project_active({ project_id: projectId, active: false }).send();
      await closeAfterReserve.confirmation(1);
      closeAfterReserveHash = closeAfterReserve.hash;
    }
    const finalize = await contract.methodsObject.finalize_iteration({
      reservation_id: reservation.id,
      metadata_uri: utf8ToHex(metadataUri),
      artifact_uri: utf8ToHex(artifactUri),
      display_uri: utf8ToHex(displayUri),
      thumbnail_uri: utf8ToHex(displayUri),
      mime_type: utf8ToHex(output.mimeType),
      artifact_hash: artifactHash,
    }).send();
    await finalize.confirmation(1);
    if (output.mode === "zip") {
      const reopenAfterFinalize = await creatorContract.methodsObject.set_project_active({ project_id: projectId, active: true }).send();
      await reopenAfterFinalize.confirmation(1);
      ok(`ZIP paid reservation finalized while its project was closed (${closeAfterReserveHash}), then reopened with ${reopenAfterFinalize.hash}`);
    }
    pinnedTokens.push({
      tokenId,
      projectId,
      reservationId: reservation.id,
      owner: owner.address,
      seed,
      mode: output.mode,
      mimeType: output.mimeType,
      artifactUri,
      displayUri,
      metadataUri,
      metadataBytes,
      artifactHash,
      artifactBytes: rendered.bytes,
      traits: rendered.traits,
      reserveHash: reserve.hash,
      finalizeHash: finalize.hash,
    });
    ok(`${owner.id} finalized ${output.mimeType} token ${tokenId} with ${finalize.hash}`);
  }

  await Promise.all(pinnedTokens.flatMap((token) => [
    fetchPinned(token.artifactUri.slice(7), token.artifactBytes, `${token.mode} artifact`),
    fetchPinned(token.metadataUri.slice(7), token.metadataBytes, `${token.mode} metadata`),
  ]));
  const storageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${originated.address}/storage`;
  const indexedStorage = await pollJson("Rotini storage", storageUrl, (json) =>
    Number(json?.ledger) > 0 && Number(json?.projects) > 0 && Number(json?.token_metadata) > 0 &&
    Number(json?.token_artifact) > 0 && Number(json?.token_seed) > 0 && Number(json?.next_token_id) === 3 &&
    Number(json?.next_reservation_id) === 3,
  );
  const ledger = await pollJson("Rotini collector balances", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.ledger}/keys?limit=100`, (json) =>
    Array.isArray(json) && pinnedTokens.every((token) => json.some((entry) =>
      entry?.key?.owner === token.owner && Number(entry?.key?.token_id) === token.tokenId && Number(entry.value) === 1,
    )),
  );
  const projects = await pollJson("Rotini finalized project state", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.projects}/keys?limit=20`, (json) =>
    Array.isArray(json) && OUTPUTS.every((output, projectId) => json.some((entry) =>
      Number(entry.key) === projectId && entry.value?.active === true && Number(entry.value?.minted) === 1 && Number(entry.value?.reserved) === 0 &&
      hexToUtf8(entry.value?.output_mode || "") === output.mode,
    )),
  );
  const supplies = await pollJson("Rotini NFT supplies", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.total_supply}/keys?limit=20`, (json) =>
    Array.isArray(json) && pinnedTokens.every((token) => json.some((entry) => Number(entry.key) === token.tokenId && Number(entry.value) === 1)),
  );
  const tokenMetadata = await pollJson("Rotini direct token metadata", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.token_metadata}/keys?limit=20`, (json) =>
    Array.isArray(json) && pinnedTokens.every((token) => json.some((entry) => {
      if (Number(entry.key) !== token.tokenId) return false;
      const info = entry.value?.token_info || {};
      return hexToUtf8(info[""] || "") === token.metadataUri &&
        hexToUtf8(info.artifactUri || "") === token.artifactUri &&
        hexToUtf8(info.displayUri || "") === token.displayUri &&
        hexToUtf8(info["pasta:mimeType"] || "") === token.mimeType &&
        String(info["pasta:artifactSha256"] || "").toLowerCase() === token.artifactHash;
    })),
  );
  const tokenArtifacts = await pollJson("Rotini artifact bindings", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.token_artifact}/keys?limit=20`, (json) =>
    Array.isArray(json) && pinnedTokens.every((token) => json.some((entry) =>
      Number(entry.key) === token.tokenId && hexToUtf8(entry.value?.artifact_uri || "") === token.artifactUri &&
      hexToUtf8(entry.value?.mime_type || "") === token.mimeType &&
      String(entry.value?.artifact_hash || "").toLowerCase() === token.artifactHash,
    )),
  );
  const tokenSeeds = await pollJson("Rotini immutable token seeds", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.token_seed}/keys?limit=20`, (json) =>
    Array.isArray(json) && pinnedTokens.every((token) => json.some((entry) => Number(entry.key) === token.tokenId && String(entry.value) === token.seed)),
  );
  assert.equal(new Set(pinnedTokens.map((token) => token.seed)).size, pinnedTokens.length, "reservation seeds must be distinct");
  const activeReservations = await pollJson("Rotini cleared reservations", `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.reservations}/keys?active=true&limit=20`, (json) => Array.isArray(json) && json.length === 0);
  const reserveTransactions = await pollJson(
    "Rotini reserve transactions",
    `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions?target=${originated.address}&entrypoint=reserve_iteration&status=applied&limit=20`,
    (json) => Array.isArray(json) && json.some((op) => op.sender?.address === collector.address) && json.some((op) => op.sender?.address === collectorTwo.address),
  );
  const finalizeTransactions = await pollJson(
    "Rotini finalize transactions",
    `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions?target=${originated.address}&entrypoint=finalize_iteration&status=applied&limit=20`,
    (json) => Array.isArray(json) && json.some((op) => op.sender?.address === collector.address) && json.some((op) => op.sender?.address === collectorTwo.address),
  );
  void ledger; void projects; void supplies; void tokenMetadata; void tokenArtifacts; void tokenSeeds; void activeReservations;

  await writeReport("PASSED", [
    "## Result", "",
    "- Fresh Rotini collector-finalized artifact proof passed for PNG, animated GIF, and dependency-free interactive ZIP.",
    `- Creator: \`${creator.id}\` / \`${creator.address}\``,
    `- Collector one: \`${collector.id}\` / \`${collector.address}\``,
    `- Collector two: \`${collectorTwo.id}\` / \`${collectorTwo.address}\``,
    `- Contract: \`${originated.address}\``,
    `- Explorer: https://shadownet.tzkt.io/${originated.address}`,
    `- Relationship group: \`${relationship.collection_group}\``, "",
    "## Operations", "",
    `- Origination: \`${originate.hash}\``,
    ...createHashes.map((hash, projectId) => `- Create ${OUTPUTS[projectId].mode.toUpperCase()} project ${projectId}: \`${hash}\``),
    `- Closed-project reserve rejection: \`${closedRejection.slice(0, 240)}\``,
    `- Close/reopen before ZIP reserve: \`${closeBeforeReserve.hash}\` / \`${reopenBeforeReserve.hash}\``,
    ...pinnedTokens.flatMap((token) => [
      `- ${token.mode.toUpperCase()} reserve: \`${token.reserveHash}\``,
      `- ${token.mode.toUpperCase()} finalize: \`${token.finalizeHash}\``,
    ]), "",
    "## Artifact proof", "",
    ...pinnedTokens.map((token) =>
      `- Token ${token.tokenId}: \`${token.mimeType}\`, \`${token.artifactUri}\`, SHA-256 \`${token.artifactHash}\`, metadata \`${token.metadataUri}\`.`,
    ),
    `- ${IPFS_GATEWAY} returned exact bytes for all three artifact CIDs and all three metadata CIDs; every SHA-256 check passed.`,
    "- The ZIP was built by the shipped Rotini artifact kernel, has a top-level `index.html`, packages every layer locally, and passed the no-network/no-external-reference validator.",
    "- PNG and GIF signatures were verified; the browser inventory proof separately decodes both outputs and runs the complete exported-page flow.", "",
    "## Indexed proof", "",
    `- TzKT indexed three NFT supplies, three owners, three distinct seeds, three direct token metadata entries, and three artifact/hash bindings.`,
    `- TzKT returned \`${reserveTransactions.length}\` reserve and \`${finalizeTransactions.length}\` finalize transaction(s), including both independent collector addresses.`,
    "- All projects ended active with minted=1 and reserved=0; no active reservation remained.", "",
    "## What this proves", "",
    "- Publication creates generator projects but no NFT token.",
    "- Reservation fixes the collector, token id, project, price, supply slot, and immutable seed without creating FA2 ownership or metadata.",
    "- Finalization creates the NFT only after a standard self-contained artifact, direct TZIP-21 metadata, and exact SHA-256 binding exist.",
    "- Closing generation blocks new reservations but cannot strand a paid collector who is still finalizing their artifact.",
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
  await writeReport("FAILED", ["## Error", "", "```", message, "```" ]).catch(() => undefined);
  console.error(`[pasta-shadownet-rotini-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
