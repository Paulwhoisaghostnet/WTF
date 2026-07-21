#!/usr/bin/env tsx

import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { packDataBytes } from "@taquito/michel-codec";
import { CODEC, getCodec, ProtocolsHash } from "@taquito/local-forging";
import { Schema } from "@taquito/michelson-encoder";
import { MichelsonMap, type TezosToolkit } from "@taquito/taquito";
import { blake2b } from "blakejs";

import {
  assertShadownet,
  block,
  buildToolkit,
  createLogger,
  hexToUtf8,
  loadSignerSet,
  normalizeBase,
  pinIpfsProofBytes,
  pinIpfsProofJson,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  resolveIpfsProofConfig,
  root,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  writeProofReport,
  type IpfsPinnedProof,
  type IpfsProofConfig,
  type ProofStatus,
} from "./shadownet-proof-kit";

const REPORT_PATH = path.join(
  root,
  ".agents/docs/archive/contracts/pasta-protocol/shadownet-ravioli-e2e-report.md",
);
const MIN_COLLECTOR_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_RAVIOLI_COLLECTOR_MIN_BALANCE_MUTEZ || "500000",
);
const MAX_ORIGINATION_BYTES = 32_768;
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-ravioli-e2e");

type ArtifactSpec = { app: string; slug: string; label: string };
type OriginationPlan = ArtifactSpec & {
  code: unknown[];
  storage: Record<string, unknown>;
  scriptBytes: number;
  estimatedMutez: number;
};
type OperationRecord = { label: string; hash: string };
type ContractMetadataKey = "router" | "gnocchi" | "rotini" | "gnocchiAdapter" | "rotiniAdapter";

export type RavioliGeneratedArtifactUris = {
  metadataUri: string;
  artifactUri: string;
  displayUri: string;
  thumbnailUri: string;
  mimeType: "image/png";
  artifactHash: string;
};

export type RavioliUriPlan = {
  gnocchiTokenMetadataUris: readonly string[];
  packTokenMetadataUris: readonly string[];
  recipeMetadataUris: readonly string[];
  generatorMetadataUri: string;
  previewArtifactUri: string;
  generated: {
    generative: RavioliGeneratedArtifactUris;
    hybrid: RavioliGeneratedArtifactUris;
  };
};

type RavioliPinnedEvidence = {
  contractMetadata: Record<ContractMetadataKey, IpfsPinnedProof>;
  gnocchiTokens: IpfsPinnedProof[];
  packTokens: IpfsPinnedProof[];
  recipes: IpfsPinnedProof[];
  generatorMetadata: IpfsPinnedProof;
  generatedTokens: {
    generative: IpfsPinnedProof;
    hybrid: IpfsPinnedProof;
  };
  png: IpfsPinnedProof;
  uris: RavioliUriPlan;
};

const ARTIFACTS = {
  router: { app: "ravioli", slug: "pasta-bundle", label: "Ravioli pack router" },
  gnocchiAdapter: {
    app: "ravioli",
    slug: "pasta-gnocchi-pack-adapter",
    label: "Gnocchi allocation adapter",
  },
  rotiniAdapter: {
    app: "ravioli",
    slug: "pasta-rotini-pack-adapter",
    label: "Rotini generative adapter",
  },
  gnocchi: { app: "gnocchi", slug: "pasta-open-edition", label: "Gnocchi FA2" },
  rotini: { app: "rotini", slug: "pasta-generative-collection", label: "Rotini FA2" },
} as const;

const MODE = {
  deterministic: 0,
  fundedPool: 1,
  allocated: 2,
  generative: 3,
  hybrid: 4,
} as const;

const MODE_SPECS = [
  {
    key: "deterministic",
    tokenId: 0,
    name: "Deterministic Vault",
    symbol: "RVD",
    mode: MODE.deterministic,
    itemCount: 1,
    maxSupply: 1,
    blind: false,
  },
  {
    key: "fundedPool",
    tokenId: 1,
    name: "Blind Funded Pool",
    symbol: "RVP",
    mode: MODE.fundedPool,
    itemCount: 1,
    maxSupply: 2,
    blind: true,
  },
  {
    key: "allocated",
    tokenId: 2,
    name: "Blind Allocation",
    symbol: "RVA",
    mode: MODE.allocated,
    itemCount: 1,
    maxSupply: 1,
    blind: true,
  },
  {
    key: "generative",
    tokenId: 3,
    name: "Blind Generative",
    symbol: "RVG",
    mode: MODE.generative,
    itemCount: 1,
    maxSupply: 1,
    blind: true,
  },
  {
    key: "hybrid",
    tokenId: 4,
    name: "Hybrid Triple",
    symbol: "RVH",
    mode: MODE.hybrid,
    itemCount: 3,
    maxSupply: 1,
    blind: true,
  },
] as const;

const GNOCCHI_TOKEN_SPECS = [
  { tokenId: 0, name: "Escrowed Red", symbol: "RV0", creatorReserve: 4 },
  { tokenId: 1, name: "Reserved Unminted Blue", symbol: "RV1", creatorReserve: 0 },
  { tokenId: 2, name: "Escrowed Gold", symbol: "RV2", creatorReserve: 4 },
] as const;

const PROOF_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1pUAAAAASUVORK5CYII=",
  "base64",
);

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Ravioli Five-Mode Shadownet E2E Report",
    status,
    lines,
    rpcUrl: reportRpcUrl,
  });
}

async function readArtifact(spec: ArtifactSpec): Promise<unknown[]> {
  const file = path.join(
    root,
    "public/creation-tools",
    spec.app,
    "contract",
    `${spec.slug}.contract.json`,
  );
  const parsed = JSON.parse(await readFile(file, "utf8"));
  assert.ok(Array.isArray(parsed), `${spec.label} artifact is not a Micheline code array`);
  return parsed;
}

function metadataMap(uri: string): MichelsonMap<string, string> {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(uri));
  return metadata;
}

function emptyMap(): MichelsonMap<any, any> {
  return new MichelsonMap();
}

function routerStorage(admin: string, metadataUri: string) {
  return {
    administrator: admin,
    pending_administrator: null,
    metadata: metadataMap(metadataUri),
    ledger: emptyMap(),
    operators: emptyMap(),
    token_metadata: emptyMap(),
    total_supply: emptyMap(),
    packs: emptyMap(),
    recipe_commitments: emptyMap(),
    minted: emptyMap(),
    opened: emptyMap(),
    opened_by: emptyMap(),
    asset_allowances: emptyMap(),
    adapter_allowances: emptyMap(),
    sales: emptyMap(),
    minters: emptyMap(),
    next_token_id: 0,
  };
}

function gnocchiStorage(admin: string, metadataUri: string) {
  return {
    administrator: admin,
    pending_administrator: null,
    metadata: metadataMap(metadataUri),
    ledger: emptyMap(),
    operators: emptyMap(),
    token_metadata: emptyMap(),
    total_supply: emptyMap(),
    total_minted: emptyMap(),
    total_reserved: emptyMap(),
    reserved_mints: emptyMap(),
    sales: emptyMap(),
    policy_locked: emptyMap(),
    minters: emptyMap(),
    next_token_id: 0,
  };
}

function rotiniStorage(admin: string, metadataUri: string) {
  return {
    administrator: admin,
    pending_administrator: null,
    metadata: metadataMap(metadataUri),
    ledger: emptyMap(),
    operators: emptyMap(),
    token_metadata: emptyMap(),
    total_supply: emptyMap(),
    projects: emptyMap(),
    reservations: emptyMap(),
    latest_reservation: emptyMap(),
    token_project: emptyMap(),
    token_seed: emptyMap(),
    token_artifact: emptyMap(),
    minted_by: emptyMap(),
    reserved_by: emptyMap(),
    pack_minters: emptyMap(),
    pack_reserved: emptyMap(),
    next_project_id: 0,
    next_reservation_id: 0,
    next_token_id: 0,
  };
}

function gnocchiAdapterStorage(admin: string, metadataUri: string) {
  return {
    administrator: admin,
    pending_administrator: null,
    metadata: metadataMap(metadataUri),
    routers: emptyMap(),
    allocations: emptyMap(),
    reservations: emptyMap(),
    next_resource_id: 0,
  };
}

function rotiniAdapterStorage(admin: string, metadataUri: string) {
  return {
    administrator: admin,
    pending_administrator: null,
    metadata: metadataMap(metadataUri),
    routers: emptyMap(),
    resources: emptyMap(),
    reservations: emptyMap(),
    next_resource_id: 0,
  };
}

function tokenInfo(
  metadataUri: string,
  name: string,
  symbol: string,
  extra: Record<string, string> = {},
) {
  const info = new MichelsonMap<string, string>();
  info.set("", utf8ToHex(metadataUri));
  info.set("name", utf8ToHex(name));
  info.set("symbol", utf8ToHex(symbol));
  info.set("decimals", utf8ToHex("0"));
  for (const [key, value] of Object.entries(extra)) info.set(`pasta:${key}`, utf8ToHex(value));
  return info;
}

function packConfig(
  mode: number,
  itemCount: number,
  maxSupply: number,
  blind: boolean,
  initialContentsUri: string | null,
) {
  return {
    mode,
    blind,
    item_count: itemCount,
    max_supply: maxSupply,
    committed_recipes: 0,
    finalized: false,
    cancelled: false,
    contents_uri: initialContentsUri ? utf8ToHex(initialContentsUri) : null,
  };
}

function nonce(label: string): string {
  return createHash("sha256").update(`pasta-ravioli-shadownet:${label}`).digest("hex");
}

function nonceCommitment(nonceHex: string): string {
  return Buffer.from(blake2b(Buffer.from(nonceHex, "hex"), undefined, 32)).toString("hex");
}

function escrowReservation(fa2: string, tokenId: number, amount = 1) {
  return { escrow: { fa2, token_id: tokenId, amount } };
}

function escrowAction(fa2: string, tokenId: number, amount = 1) {
  return escrowReservation(fa2, tokenId, amount);
}

export function ravioliPayloadCommitment(payload: string): string {
  assert.match(payload, /^(?:[0-9a-f]{2})*$/, "adapter payload must be lowercase even-length hex");
  return Buffer.from(blake2b(Buffer.from(payload, "hex"), undefined, 32)).toString("hex");
}

export function assertRavioliPayloadCommitment(payload: string, commitment: string): void {
  assert.equal(
    commitment,
    ravioliPayloadCommitment(payload),
    "adapter payload does not match its committed blake2b digest",
  );
}

function allocatedReservation(adapter: string, payload = "") {
  return {
    allocated_mint: {
      adapter,
      resource_id: 0,
      payload_commitment: ravioliPayloadCommitment(payload),
    },
  };
}

function allocatedAction(adapter: string, payload = "") {
  const payloadCommitment = ravioliPayloadCommitment(payload);
  return {
    allocated_mint: {
      adapter,
      resource_id: 0,
      payload,
      payload_commitment: payloadCommitment,
    },
  };
}

function generativeReservation(adapter: string, payload: string) {
  return {
    generative_mint: {
      adapter,
      resource_id: 0,
      payload_commitment: ravioliPayloadCommitment(payload),
    },
  };
}

function nestedPair(values: Array<{ bytes: string }>): unknown {
  assert.ok(values.length >= 2);
  let value: any = { prim: "Pair", args: [values.at(-2), values.at(-1)] };
  for (let index = values.length - 3; index >= 0; index -= 1) {
    value = { prim: "Pair", args: [values[index], value] };
  }
  return value;
}

function nestedPairType(length: number): unknown {
  assert.ok(length >= 2);
  let value: any = { prim: "pair", args: [{ prim: "bytes" }, { prim: "bytes" }] };
  for (let index = length - 3; index >= 0; index -= 1) {
    value = { prim: "pair", args: [{ prim: "bytes" }, value] };
  }
  return value;
}

function assertIpfsUri(label: string, uri: string): void {
  assert.match(uri, /^ipfs:\/\/[A-Za-z0-9]+$/, `${label} must be an ipfs:// CID URI`);
  assert.ok(Buffer.byteLength(uri, "utf8") <= 256, `${label} exceeds the contract URI limit`);
}

export function buildRavioliGenerativePayload(input: RavioliGeneratedArtifactUris): {
  packed: string;
  artifactHash: string;
  artifactUri: string;
  metadataUri: string;
} {
  assertIpfsUri("generative metadata URI", input.metadataUri);
  assertIpfsUri("generative artifact URI", input.artifactUri);
  assertIpfsUri("generative display URI", input.displayUri);
  assertIpfsUri("generative thumbnail URI", input.thumbnailUri);
  assert.equal(input.mimeType, "image/png", "Ravioli Shadownet payload must be a PNG");
  assert.match(input.artifactHash, /^[0-9a-f]{64}$/, "artifact hash must be 32 lowercase hex bytes");
  assert.equal(input.displayUri, input.artifactUri, "PNG display URI must use the pinned artifact");
  assert.equal(input.thumbnailUri, input.artifactUri, "PNG thumbnail URI must use the pinned artifact");
  const ordered = [
    input.artifactHash,
    utf8ToHex(input.artifactUri),
    utf8ToHex(input.displayUri),
    utf8ToHex(input.metadataUri),
    utf8ToHex(input.mimeType),
    utf8ToHex(input.thumbnailUri),
  ].map((bytes) => ({ bytes }));
  const packed = packDataBytes(nestedPair(ordered) as any, nestedPairType(ordered.length) as any).bytes;
  return {
    packed,
    artifactHash: input.artifactHash,
    artifactUri: input.artifactUri,
    metadataUri: input.metadataUri,
  };
}

function generativeAction(adapter: string, artifact: RavioliGeneratedArtifactUris) {
  const payload = buildRavioliGenerativePayload(artifact).packed;
  const payloadCommitment = ravioliPayloadCommitment(payload);
  return {
    generative_mint: {
      adapter,
      resource_id: 0,
      payload,
      payload_commitment: payloadCommitment,
    },
  };
}

export type RavioliModePayload = (typeof MODE_SPECS)[number] & {
  tokenMetadataUri: string;
  recipeMetadataUri: string;
  config: ReturnType<typeof packConfig>;
  recipes: Array<{
    label: string;
    metadataUri: string;
    reservations: any[];
    actions: any[];
  }>;
};

export function buildRavioliModePayloads(
  addresses: { gnocchi: string; gnocchiAdapter: string; rotiniAdapter: string },
  uris: RavioliUriPlan,
): RavioliModePayload[] {
  assert.equal(uris.gnocchiTokenMetadataUris.length, GNOCCHI_TOKEN_SPECS.length);
  assert.equal(uris.packTokenMetadataUris.length, MODE_SPECS.length);
  assert.equal(uris.recipeMetadataUris.length, MODE_SPECS.length);
  for (const [index, uri] of uris.gnocchiTokenMetadataUris.entries()) {
    assertIpfsUri(`Gnocchi token ${index} metadata URI`, uri);
  }
  for (const [index, uri] of uris.packTokenMetadataUris.entries()) {
    assertIpfsUri(`Ravioli wrapper ${index} metadata URI`, uri);
  }
  for (const [index, uri] of uris.recipeMetadataUris.entries()) {
    assertIpfsUri(`Ravioli recipe ${index} metadata URI`, uri);
  }
  assertIpfsUri("Rotini generator metadata URI", uris.generatorMetadataUri);
  assertIpfsUri("Rotini preview artifact URI", uris.previewArtifactUri);

  return MODE_SPECS.map((spec) => {
    const recipeMetadataUri = uris.recipeMetadataUris[spec.tokenId];
    let recipes: RavioliModePayload["recipes"];
    switch (spec.key) {
      case "deterministic":
        recipes = [
          {
            label: "mode-0",
            metadataUri: recipeMetadataUri,
            reservations: [escrowReservation(addresses.gnocchi, 0)],
            actions: [escrowAction(addresses.gnocchi, 0)],
          },
        ];
        break;
      case "fundedPool":
        recipes = [
          {
            label: "mode-1-red",
            metadataUri: recipeMetadataUri,
            reservations: [escrowReservation(addresses.gnocchi, 0)],
            actions: [escrowAction(addresses.gnocchi, 0)],
          },
          {
            label: "mode-1-gold",
            metadataUri: recipeMetadataUri,
            reservations: [escrowReservation(addresses.gnocchi, 2)],
            actions: [escrowAction(addresses.gnocchi, 2)],
          },
        ];
        break;
      case "allocated":
        recipes = [
          {
            label: "mode-2",
            metadataUri: recipeMetadataUri,
            reservations: [allocatedReservation(addresses.gnocchiAdapter)],
            actions: [allocatedAction(addresses.gnocchiAdapter)],
          },
        ];
        break;
      case "generative": {
        const action = generativeAction(addresses.rotiniAdapter, uris.generated.generative);
        recipes = [
          {
            label: "mode-3",
            metadataUri: recipeMetadataUri,
            reservations: [
              generativeReservation(addresses.rotiniAdapter, action.generative_mint.payload),
            ],
            actions: [action],
          },
        ];
        break;
      }
      case "hybrid": {
        const action = generativeAction(addresses.rotiniAdapter, uris.generated.hybrid);
        recipes = [
          {
            label: "mode-4",
            metadataUri: recipeMetadataUri,
            reservations: [
              escrowReservation(addresses.gnocchi, 2),
              allocatedReservation(addresses.gnocchiAdapter),
              generativeReservation(addresses.rotiniAdapter, action.generative_mint.payload),
            ],
            actions: [
              escrowAction(addresses.gnocchi, 2),
              allocatedAction(addresses.gnocchiAdapter),
              action,
            ],
          },
        ];
        break;
      }
    }
    assert.equal(recipes.length, spec.maxSupply, `${spec.key} recipe count must back every wrapper`);
    assert.ok(recipes.every((recipe) => recipe.actions.length === spec.itemCount));
    return {
      ...spec,
      tokenMetadataUri: uris.packTokenMetadataUris[spec.tokenId],
      recipeMetadataUri,
      config: packConfig(
        spec.mode,
        spec.itemCount,
        spec.maxSupply,
        spec.blind,
        spec.blind ? null : recipeMetadataUri,
      ),
      recipes,
    };
  });
}

function tokenMetadataValue(
  name: string,
  symbol: string,
  description: string,
  ravioli: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    symbol,
    decimals: 0,
    description,
    creators: [],
    formats: [],
    ravioli: { version: 2, ...ravioli },
  };
}

function generatedTokenMetadataValue(
  name: string,
  artifact: IpfsPinnedProof,
): Record<string, unknown> {
  return {
    name,
    symbol: "RVGEN",
    decimals: 0,
    description: "Collector-created Ravioli pack iteration rendered as a self-contained PNG.",
    artifactUri: artifact.uri,
    displayUri: artifact.uri,
    thumbnailUri: artifact.uri,
    formats: [
      {
        uri: artifact.uri,
        mimeType: artifact.mimeType,
        fileSize: artifact.byteLength,
        hash: artifact.sha256,
      },
    ],
    ravioli: { version: 2, fulfillment: "generative_mint" },
  };
}

export function buildRavioliRecipeMetadataValues(generated: {
  generative: RavioliGeneratedArtifactUris;
  hybrid: RavioliGeneratedArtifactUris;
}): Array<Record<string, unknown>> {
  const generativeItem = (artifact: RavioliGeneratedArtifactUris) => {
    const payload = buildRavioliGenerativePayload(artifact).packed;
    return {
      primitive: "generative_mint",
      adapterRole: "rotini",
      resourceId: 0,
      payloadCommitment: ravioliPayloadCommitment(payload),
      metadataUri: artifact.metadataUri,
      artifactUri: artifact.artifactUri,
      displayUri: artifact.displayUri,
      thumbnailUri: artifact.thumbnailUri,
      mimeType: artifact.mimeType,
      artifactSha256: artifact.artifactHash,
    };
  };
  const allocatedItem = {
    primitive: "allocated_mint",
    adapterRole: "gnocchi",
    resourceId: 0,
    payloadCommitment: ravioliPayloadCommitment(""),
  };
  const variants: Record<string, Array<{ label: string; items: Array<Record<string, unknown>> }>> = {
    deterministic: [
      { label: "mode-0", items: [{ primitive: "escrowed_fa2", assetRole: "gnocchi", tokenId: 0, amount: 1 }] },
    ],
    fundedPool: [
      { label: "mode-1-red", items: [{ primitive: "escrowed_fa2", assetRole: "gnocchi", tokenId: 0, amount: 1 }] },
      { label: "mode-1-gold", items: [{ primitive: "escrowed_fa2", assetRole: "gnocchi", tokenId: 2, amount: 1 }] },
    ],
    allocated: [
      { label: "mode-2", items: [allocatedItem] },
    ],
    generative: [{ label: "mode-3", items: [generativeItem(generated.generative)] }],
    hybrid: [
      {
        label: "mode-4",
        items: [
          { primitive: "escrowed_fa2", assetRole: "gnocchi", tokenId: 2, amount: 1 },
          allocatedItem,
          generativeItem(generated.hybrid),
        ],
      },
    ],
  };
  return MODE_SPECS.map((spec) => ({
    schema: "pasta-ravioli-recipe@2",
    packTokenId: spec.tokenId,
    mode: spec.mode,
    modeKey: spec.key,
    blind: spec.blind,
    itemCount: spec.itemCount,
    maxSupply: spec.maxSupply,
    commitmentScope:
      "nonce plus ordered reservation identities; allocated and generative reservations use Some(blake2b(actual payload))",
    recipes: variants[spec.key].map((variant, serial) => ({
      serial,
      label: variant.label,
      nonce: nonce(variant.label),
      nonceCommitment: nonceCommitment(nonce(variant.label)),
      items: variant.items,
    })),
  }));
}

function generatedArtifactUris(
  metadata: IpfsPinnedProof,
  artifact: IpfsPinnedProof,
): RavioliGeneratedArtifactUris {
  return {
    metadataUri: metadata.uri,
    artifactUri: artifact.uri,
    displayUri: artifact.uri,
    thumbnailUri: artifact.uri,
    mimeType: "image/png",
    artifactHash: artifact.sha256,
  };
}

async function buildPinnedEvidence(ipfs: IpfsProofConfig): Promise<RavioliPinnedEvidence> {
  const png = await pinIpfsProofBytes({
    bytes: PROOF_PNG,
    fileName: "ravioli-generative-proof.png",
    mimeType: "image/png",
    options: ipfs,
  });
  const contractValues: Record<ContractMetadataKey, Record<string, unknown>> = {
    router: {
      name: "Ravioli Shadownet Five-Mode Proof",
      description: "Atomic FA2 pack fulfillment router for Pasta Protocol.",
      interfaces: ["TZIP-012", "TZIP-016"],
    },
    gnocchi: {
      name: "Ravioli Gnocchi Proof Assets",
      interfaces: ["TZIP-012", "TZIP-016"],
    },
    rotini: {
      name: "Ravioli Rotini Proof Generator",
      interfaces: ["TZIP-012", "TZIP-016"],
    },
    gnocchiAdapter: { name: "Ravioli Gnocchi Pack Adapter", interfaces: ["TZIP-016"] },
    rotiniAdapter: { name: "Ravioli Rotini Pack Adapter", interfaces: ["TZIP-016"] },
  };
  const contractEntries = await Promise.all(
    (Object.entries(contractValues) as Array<[ContractMetadataKey, Record<string, unknown>]>).map(
      async ([key, value]) =>
        [
          key,
          await pinIpfsProofJson({
            value,
            fileName: `ravioli-${key}-contract-metadata.json`,
            options: ipfs,
          }),
        ] as const,
    ),
  );
  const contractMetadata = Object.fromEntries(contractEntries) as Record<
    ContractMetadataKey,
    IpfsPinnedProof
  >;
  const [generatorMetadata, generatedGenerative, generatedHybrid, ...gnocchiTokens] =
    await Promise.all([
      pinIpfsProofJson({
        value: {
          schema: "pasta-rotini-generator@2",
          name: "Ravioli Generated PNG",
          offline: true,
          outputMode: "png",
          previewUri: png.uri,
          dependencies: [],
        },
        fileName: "ravioli-rotini-generator.json",
        options: ipfs,
      }),
      pinIpfsProofJson({
        value: generatedTokenMetadataValue("Ravioli Generated One", png),
        fileName: "ravioli-generated-one-token.json",
        options: ipfs,
      }),
      pinIpfsProofJson({
        value: generatedTokenMetadataValue("Ravioli Hybrid Generated", png),
        fileName: "ravioli-hybrid-generated-token.json",
        options: ipfs,
      }),
      ...GNOCCHI_TOKEN_SPECS.map((token) =>
        pinIpfsProofJson({
          value: tokenMetadataValue(
            token.name,
            token.symbol,
            "Signer-backed Gnocchi asset used by the Ravioli five-mode proof.",
          ),
          fileName: `ravioli-gnocchi-token-${token.tokenId}.json`,
          options: ipfs,
        }),
      ),
    ]);
  const generated = {
    generative: generatedArtifactUris(generatedGenerative, png),
    hybrid: generatedArtifactUris(generatedHybrid, png),
  };
  const recipeValues = buildRavioliRecipeMetadataValues(generated);
  const recipes = await Promise.all(
    recipeValues.map((value, tokenId) =>
      pinIpfsProofJson({
        value,
        fileName: `ravioli-pack-${tokenId}-recipe.json`,
        options: ipfs,
      }),
    ),
  );
  const packTokens = await Promise.all(
    MODE_SPECS.map((spec) =>
      pinIpfsProofJson({
        value: tokenMetadataValue(
          spec.name,
          spec.symbol,
          "Signer-backed Ravioli wrapper backed by an atomic on-chain fulfillment recipe.",
          {
            mode: spec.mode,
            modeKey: spec.key,
            blindSecurity: spec.blind ? "commit-reveal-ui-hidden-chain-public" : "public",
            recipeManifestState: spec.blind ? "linked-after-open" : "public-at-creation",
            ...(spec.blind ? {} : { recipeUri: recipes[spec.tokenId].uri }),
          },
        ),
        fileName: `ravioli-pack-token-${spec.tokenId}.json`,
        options: ipfs,
      }),
    ),
  );
  return {
    contractMetadata,
    gnocchiTokens,
    packTokens,
    recipes,
    generatorMetadata,
    generatedTokens: { generative: generatedGenerative, hybrid: generatedHybrid },
    png,
    uris: {
      gnocchiTokenMetadataUris: gnocchiTokens.map((pin) => pin.uri),
      packTokenMetadataUris: packTokens.map((pin) => pin.uri),
      recipeMetadataUris: recipes.map((pin) => pin.uri),
      generatorMetadataUri: generatorMetadata.uri,
      previewArtifactUri: png.uri,
      generated,
    },
  };
}

function pinProofLine(label: string, pin: IpfsPinnedProof): string {
  return `- ${label}: CID \`${pin.cid}\` — \`${pin.uri}\` — ${pin.publicGatewayUrl} — SHA-256 \`${pin.sha256}\``;
}

function pinnedProofLines(evidence: RavioliPinnedEvidence): string[] {
  return [
    ...Object.entries(evidence.contractMetadata).map(([key, pin]) =>
      pinProofLine(`${key} contract metadata`, pin),
    ),
    ...evidence.gnocchiTokens.map((pin, index) => pinProofLine(`Gnocchi token ${index}`, pin)),
    ...evidence.packTokens.map((pin, index) => pinProofLine(`Ravioli wrapper ${index}`, pin)),
    ...evidence.recipes.map((pin, index) => pinProofLine(`Ravioli recipe ${index}`, pin)),
    pinProofLine("Rotini generator metadata", evidence.generatorMetadata),
    pinProofLine("Rotini generated token 0 metadata", evidence.generatedTokens.generative),
    pinProofLine("Rotini generated token 1 metadata", evidence.generatedTokens.hybrid),
    pinProofLine("Shared self-contained PNG", evidence.png),
  ];
}

function scriptBytes(code: unknown[], storage: Record<string, unknown>): number {
  const storageSection = (code as any[]).find((section) => section?.prim === "storage");
  assert.ok(storageSection?.args?.[0], "compiled artifact has no storage type");
  const encodedStorage = new Schema(storageSection.args[0]).Encode(storage);
  const encoded = getCodec(CODEC.SCRIPT, ProtocolsHash.PsUshuai9).encoder({
    code,
    storage: encodedStorage,
  } as any);
  return encoded.length / 2;
}

async function send(
  label: string,
  operation: Promise<{ hash: string; confirmation(confirmations?: number): Promise<unknown> }>,
  records: OperationRecord[],
) {
  const op = await operation;
  await op.confirmation(1);
  records.push({ label, hash: op.hash });
  ok(`${label}: ${op.hash}`);
  return op;
}

function contractBatch(tezos: TezosToolkit, methods: any[]) {
  let batch = tezos.contract.batch();
  for (const method of methods) batch = batch.withContractCall(method);
  return batch.send();
}

async function originate(
  tezos: TezosToolkit,
  plan: OriginationPlan,
  records: OperationRecord[],
): Promise<string> {
  await assertShadownet(tezos, `before ${plan.label} origination`);
  const op = await tezos.contract.originate({ code: plan.code, storage: plan.storage } as any);
  await op.confirmation(1);
  const contract = await op.contract();
  records.push({ label: `Originate ${plan.label}`, hash: op.hash });
  ok(`originated ${plan.label} ${contract.address}: ${op.hash}`);
  return contract.address;
}

async function buildPlan(
  tezos: TezosToolkit,
  spec: ArtifactSpec,
  storage: Record<string, unknown>,
): Promise<OriginationPlan> {
  const code = await readArtifact(spec);
  const bytes = scriptBytes(code, storage);
  assert.ok(bytes < MAX_ORIGINATION_BYTES, `${spec.label} script is ${bytes} bytes`);
  const estimate = await tezos.estimate.originate({ code, storage } as any);
  const estimatedMutez =
    Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez) + 100_000;
  ok(
    `${spec.label} preflight: ${bytes} forged script bytes, fee=${estimate.suggestedFeeMutez}, burn=${estimate.burnFeeMutez}`,
  );
  return { ...spec, code, storage, scriptBytes: bytes, estimatedMutez };
}

async function transactionTree(hash: string): Promise<any[]> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  return pollJson(
    `TzKT transaction tree ${hash}`,
    `${base}/operations/transactions/${encodeURIComponent(hash)}`,
    (json) => Array.isArray(json) && json.length > 0 && json.every((item) => item?.status === "applied"),
  );
}

function bigMapId(value: unknown, label: string): number {
  const id = Number(value);
  assert.ok(Number.isInteger(id) && id > 0, `${label} is not an indexed TzKT big-map id`);
  return id;
}

async function bigMapKeys(
  id: unknown,
  label: string,
  ready: (entries: any[]) => boolean,
): Promise<any[]> {
  return pollJson(
    label,
    `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${bigMapId(id, label)}/keys?limit=100`,
    (value) => Array.isArray(value) && ready(value),
  );
}

async function assertContractMetadataUri(
  label: string,
  metadataBigMap: unknown,
  expectedUri: string,
): Promise<void> {
  const entries = await bigMapKeys(metadataBigMap, `${label} contract metadata`, (value) =>
    value.some((entry) => String(entry?.key ?? "") === "" && entry?.value),
  );
  const entry = entries.find((value) => String(value?.key ?? "") === "");
  assert.equal(hexToUtf8(String(entry?.value || "")), expectedUri, `${label} metadata URI drift`);
}

async function assertTokenMetadataUris(
  label: string,
  tokenMetadataBigMap: unknown,
  expectedUris: readonly string[],
): Promise<any[]> {
  const entries = await bigMapKeys(tokenMetadataBigMap, `${label} token metadata`, (value) =>
    expectedUris.every((_, tokenId) =>
      value.some(
        (entry) =>
          Number(entry?.key) === tokenId &&
          typeof entry?.value?.token_info?.[""] === "string",
      ),
    ),
  );
  for (const [tokenId, expectedUri] of expectedUris.entries()) {
    const entry = entries.find((value) => Number(value?.key) === tokenId);
    assert.equal(
      hexToUtf8(String(entry?.value?.token_info?.[""] || "")),
      expectedUri,
      `${label} token ${tokenId} metadata URI drift`,
    );
  }
  return entries;
}

async function assertPackContentsUris(
  packsBigMap: unknown,
  expectedUris: readonly string[],
): Promise<void> {
  const entries = await bigMapKeys(packsBigMap, "Ravioli pack contents metadata", (value) =>
    expectedUris.every((_, tokenId) =>
      value.some(
        (entry) => Number(entry?.key) === tokenId && typeof entry?.value?.contents_uri === "string",
      ),
    ),
  );
  for (const [tokenId, expectedUri] of expectedUris.entries()) {
    const entry = entries.find((value) => Number(value?.key) === tokenId);
    assert.equal(
      hexToUtf8(String(entry?.value?.contents_uri || "")),
      expectedUri,
      `Ravioli pack ${tokenId} contents URI drift`,
    );
  }
}

async function assertRotiniProjectUris(
  projectsBigMap: unknown,
  expected: RavioliUriPlan,
): Promise<void> {
  const entries = await bigMapKeys(projectsBigMap, "Rotini project metadata", (value) =>
    value.some(
      (entry) =>
        Number(entry?.key) === 0 &&
        typeof entry?.value?.generator_uri === "string" &&
        typeof entry?.value?.display_uri === "string",
    ),
  );
  const project = entries.find((entry) => Number(entry?.key) === 0)?.value;
  assert.equal(hexToUtf8(String(project?.generator_uri || "")), expected.generatorMetadataUri);
  assert.equal(hexToUtf8(String(project?.display_uri || "")), expected.previewArtifactUri);
}

async function assertRotiniGeneratedUris(
  tokenMetadataBigMap: unknown,
  tokenArtifactBigMap: unknown,
  expected: RavioliUriPlan,
): Promise<void> {
  const generated = [expected.generated.generative, expected.generated.hybrid];
  const tokenEntries = await assertTokenMetadataUris(
    "Rotini generated",
    tokenMetadataBigMap,
    generated.map((value) => value.metadataUri),
  );
  const artifactEntries = await bigMapKeys(tokenArtifactBigMap, "Rotini token artifacts", (value) =>
    generated.every((_, tokenId) =>
      value.some(
        (entry) =>
          Number(entry?.key) === tokenId &&
          typeof entry?.value?.artifact_uri === "string" &&
          typeof entry?.value?.display_uri === "string" &&
          typeof entry?.value?.thumbnail_uri === "string",
      ),
    ),
  );
  for (const [tokenId, uris] of generated.entries()) {
    const tokenInfo = tokenEntries.find((entry) => Number(entry?.key) === tokenId)?.value?.token_info;
    assert.equal(hexToUtf8(String(tokenInfo?.artifactUri || "")), uris.artifactUri);
    assert.equal(hexToUtf8(String(tokenInfo?.displayUri || "")), uris.displayUri);
    assert.equal(hexToUtf8(String(tokenInfo?.thumbnailUri || "")), uris.thumbnailUri);
    assert.equal(hexToUtf8(String(tokenInfo?.["pasta:generatorUri"] || "")), expected.generatorMetadataUri);
    assert.equal(hexToUtf8(String(tokenInfo?.["pasta:mimeType"] || "")), uris.mimeType);
    assert.equal(
      String(tokenInfo?.["pasta:artifactSha256"] || "").toLowerCase(),
      uris.artifactHash,
    );
    const artifact = artifactEntries.find((entry) => Number(entry?.key) === tokenId)?.value;
    assert.equal(hexToUtf8(String(artifact?.artifact_uri || "")), uris.artifactUri);
    assert.equal(hexToUtf8(String(artifact?.display_uri || "")), uris.displayUri);
    assert.equal(hexToUtf8(String(artifact?.thumbnail_uri || "")), uris.thumbnailUri);
    assert.equal(hexToUtf8(String(artifact?.mime_type || "")), uris.mimeType);
    assert.equal(String(artifact?.artifact_hash || "").toLowerCase(), uris.artifactHash);
  }
}

async function main(): Promise<void> {
  if (process.env.PASTA_SHADOWNET_E2E_EXECUTE !== "1") {
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof originates five contracts and spends Shadownet test tez.",
    ]);
  }
  assert.notEqual(process.env.TEZOS_NETWORK, "mainnet", "Ravioli proof refuses mainnet");

  const forbiddenResumeKeys = [
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_ROTINI_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_ADAPTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_ROTINI_ADAPTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_ROUTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_SKIP_SETUP",
    "PASTA_SHADOWNET_RAVIOLI_RECIPE_START",
  ].filter((key) => {
    const value = process.env[key];
    return value !== undefined && value !== "" && value !== "0";
  });
  if (forbiddenResumeKeys.length > 0) {
    block("the durable-IPFS Ravioli proof requires five fresh contracts", [
      `Remove partial/resume settings: ${forbiddenResumeKeys.map((key) => `\`${key}\``).join(", ")}.`,
      "Previously originated contracts retain immutable inline collection metadata and cannot prove this pinned run.",
      "A future resume path must supply a prior proof manifest and re-verify every on-chain CID; bare KT1 addresses are insufficient.",
    ]);
  }

  const ipfs = resolveIpfsProofConfig();
  const evidence = await buildPinnedEvidence(ipfs);
  ok("pinned and publicly byte-verified every Ravioli URI before chain preflight");

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-ravioli-v2-e2e.sock",
    authToken: "local-pasta-shadownet-ravioli-v2-e2e",
    auditLog: "/tmp/wtf-pasta-shadownet-ravioli-v2-e2e-audit.log",
  });
  const { creator, creatorSigner, collector, collectorSigner, collectorTwo, collectorTwoSigner } =
    await loadSignerSet(env);
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
    [collector, collectorBalance],
    [collectorTwo, collectorTwoBalance],
  ] as const) {
    if (Number(balance.toString()) < MIN_COLLECTOR_BALANCE_MUTEZ) {
      block("a Ravioli collector puppet needs Shadownet test tez", [
        `Wallet \`${actor.id}\` / \`${actor.address}\` has \`${balance.toString()}\` mutez.`,
        `Fund it to at least \`${MIN_COLLECTOR_BALANCE_MUTEZ}\` mutez, then rerun.`,
      ]);
    }
  }

  const plans = await Promise.all([
    buildPlan(
      creatorTezos,
      ARTIFACTS.gnocchi,
      gnocchiStorage(creator.address, evidence.contractMetadata.gnocchi.uri),
    ),
    buildPlan(
      creatorTezos,
      ARTIFACTS.rotini,
      rotiniStorage(creator.address, evidence.contractMetadata.rotini.uri),
    ),
    buildPlan(
      creatorTezos,
      ARTIFACTS.gnocchiAdapter,
      gnocchiAdapterStorage(creator.address, evidence.contractMetadata.gnocchiAdapter.uri),
    ),
    buildPlan(
      creatorTezos,
      ARTIFACTS.rotiniAdapter,
      rotiniAdapterStorage(creator.address, evidence.contractMetadata.rotiniAdapter.uri),
    ),
    buildPlan(
      creatorTezos,
      ARTIFACTS.router,
      routerStorage(creator.address, evidence.contractMetadata.router.uri),
    ),
  ]);
  const estimatedOriginations = plans.reduce((sum, plan) => sum + plan.estimatedMutez, 0);
  // buildPlan already includes 100k mutez of contingency per origination. Keep another 1.25 tez
  // for setup, recipe funding, issuance, and creator-side sale operations.
  const requiredCreatorBalance = estimatedOriginations + 1_250_000;
  if (Number(creatorBalance.toString()) < requiredCreatorBalance) {
    block("creator wallet cannot cover the five-contract Ravioli proof", [
      `Creator \`${creator.address}\` has \`${creatorBalance.toString()}\` mutez.`,
      `Preflight requires approximately \`${requiredCreatorBalance}\` mutez including operation headroom.`,
      "Fund the Shadownet creator wallet and rerun; no origination was sent.",
    ]);
  }

  const operations: OperationRecord[] = [];
  const topUpMutez = Math.max(
    0,
    Number(process.env.PASTA_SHADOWNET_RAVIOLI_TOP_UP_MUTEZ || "0"),
  );
  const planBySlug = new Map(plans.map((plan) => [plan.slug, plan]));
  const gnocchiAddress = await originate(
    creatorTezos,
    planBySlug.get(ARTIFACTS.gnocchi.slug)!,
    operations,
  );
  const rotiniAddress = await originate(
    creatorTezos,
    planBySlug.get(ARTIFACTS.rotini.slug)!,
    operations,
  );
  const gnocchiAdapterAddress = await originate(
    creatorTezos,
    planBySlug.get(ARTIFACTS.gnocchiAdapter.slug)!,
    operations,
  );
  const rotiniAdapterAddress = await originate(
    creatorTezos,
    planBySlug.get(ARTIFACTS.rotiniAdapter.slug)!,
    operations,
  );
  const routerAddress = await originate(
    creatorTezos,
    planBySlug.get(ARTIFACTS.router.slug)!,
    operations,
  );

  if (topUpMutez > 0) {
    await send(
      `Fund creator from collector two (${topUpMutez} mutez)`,
      collectorTwoTezos.contract.transfer({
        to: creator.address,
        amount: topUpMutez,
        mutez: true,
      }) as any,
      operations,
    );
  }

  const gnocchi = await creatorTezos.contract.at(gnocchiAddress);
  const rotini = await creatorTezos.contract.at(rotiniAddress);
  const allocationAdapter = await creatorTezos.contract.at(gnocchiAdapterAddress);
  const generationAdapter = await creatorTezos.contract.at(rotiniAdapterAddress);
  const router = await creatorTezos.contract.at(routerAddress);
  const modePayloads = buildRavioliModePayloads(
    {
      gnocchi: gnocchiAddress,
      gnocchiAdapter: gnocchiAdapterAddress,
      rotiniAdapter: rotiniAdapterAddress,
    },
    evidence.uris,
  );

  const fixedSale = (maxSupply: number) => ({
    active: true,
    start: null,
    end: null,
    base_price: 0,
    increment: 0,
    step_size: 1,
    min_price: null,
    max_price: null,
    max_supply: maxSupply,
    treasury: creator.address,
  });
  const tokenCalls = GNOCCHI_TOKEN_SPECS.map((token) =>
    gnocchi.methodsObject
      .create_open_edition({
        token_info: tokenInfo(
          evidence.uris.gnocchiTokenMetadataUris[token.tokenId],
          token.name,
          token.symbol,
        ),
        sale: fixedSale(4),
        creator_reserve: token.creatorReserve,
        lock_policy: true,
      })
      ,
  );
  await send(
    "Create three Gnocchi asset types",
    contractBatch(creatorTezos, tokenCalls) as any,
    operations,
  );

  await send(
    "Create free Rotini PNG project",
    rotini.methodsObject
      .create_project({
        active: true,
        name: utf8ToHex("Ravioli Generated PNG"),
        symbol: utf8ToHex("RVGEN"),
        generator_uri: utf8ToHex(evidence.uris.generatorMetadataUri),
        display_uri: utf8ToHex(evidence.uris.previewArtifactUri),
        output_mode: utf8ToHex("png"),
        price: 0,
        treasury: creator.address,
        max_supply: 4,
        max_per_wallet: 1,
        reservation_ttl: 120,
      })
      .send(),
    operations,
  );

  const configureCalls = [
    gnocchi.methodsObject.add_minter(gnocchiAdapterAddress),
    allocationAdapter.methodsObject
      .create_allocation({ target: gnocchiAddress, token_id: 1, amount_per_open: 1, active: true })
      ,
    allocationAdapter.methodsObject.add_router(routerAddress),
    rotini.methodsObject.add_pack_minter(rotiniAdapterAddress),
    generationAdapter.methodsObject
      .create_resource({ target: rotiniAddress, project_id: 0, active: true })
      ,
    generationAdapter.methodsObject.add_router(routerAddress),
    gnocchi.methodsObject
      .update_operators([
        { add_operator: { owner: creator.address, operator: routerAddress, token_id: 0 } },
        { add_operator: { owner: creator.address, operator: routerAddress, token_id: 2 } },
      ])
      ,
  ];
  await send(
    "Authorize adapters, router, and escrow operators",
    contractBatch(creatorTezos, configureCalls) as any,
    operations,
  );

  const createPackCalls = modePayloads.map((mode) =>
    router.methodsObject
      .create_pack({
        token_info: tokenInfo(mode.tokenMetadataUri, mode.name, mode.symbol, {
          mode: String(mode.mode),
          blindSecurity: mode.blind ? "commit-reveal-ui-hidden-chain-public" : "public",
        }),
        config: mode.config,
      })
      ,
  );
  await send(
    "Create all five Ravioli pack modes",
    contractBatch(creatorTezos, createPackCalls) as any,
    operations,
  );

  const recipes = modePayloads.flatMap((mode) =>
    mode.recipes.map((recipe) => ({ tokenId: mode.tokenId, ...recipe })),
  );
  for (const recipe of recipes) {
    const reveal = nonce(recipe.label);
    await send(
      `Commit and fund ${recipe.label}`,
      router.methodsObject
        .commit_recipe({
          token_id: recipe.tokenId,
          nonce_commitment: nonceCommitment(reveal),
          reservations: recipe.reservations,
        })
        .send(),
      operations,
    );
  }

  const finalizeAndMintCalls = [
    ...modePayloads.map((mode) => router.methodsObject.finalize_pack(mode.tokenId)),
    router.methodsObject.mint({ to_: creator.address, token_id: 0, amount: 1 }),
    router.methodsObject.mint({ to_: collector.address, token_id: 1, amount: 1 }),
    router.methodsObject.mint({ to_: collectorTwo.address, token_id: 1, amount: 1 }),
    router.methodsObject.mint({ to_: collector.address, token_id: 2, amount: 1 }),
    router.methodsObject.mint({ to_: collectorTwo.address, token_id: 3, amount: 1 }),
    router.methodsObject.mint({ to_: collector.address, token_id: 4, amount: 1 }),
    router.methodsObject
      .set_sale({
        token_id: 0,
        sale: {
          active: true,
          seller: creator.address,
          treasury: creator.address,
          price: 1_000,
          remaining: 1,
          start: null,
          end: null,
        },
      })
      ,
  ];
  await send(
    "Finalize, issue backed wrappers, and open deterministic sale",
    contractBatch(creatorTezos, finalizeAndMintCalls) as any,
    operations,
  );

  const collectorRouter = await collectorTezos.contract.at(routerAddress);
  const collectorTwoRouter = await collectorTwoTezos.contract.at(routerAddress);
  const [deterministicMode, fundedPoolMode, allocatedMode, generativeMode, hybridMode] =
    modePayloads;
  await send(
    "Collector buys deterministic wrapper",
    collectorRouter.methodsObject.buy({ token_id: 0, amount: 1 }).send({ amount: 1_000, mutez: true }),
    operations,
  );
  await send(
    "Open deterministic escrow pack",
    collectorRouter.methodsObject
      .open_pack({
        token_id: 0,
        nonce: nonce("mode-0"),
        actions: deterministicMode.recipes[0].actions,
      })
      .send(),
    operations,
  );
  await send(
    "Open funded-pool serial zero",
    collectorRouter.methodsObject
      .open_pack({
        token_id: 1,
        nonce: nonce("mode-1-red"),
        actions: fundedPoolMode.recipes[0].actions,
      })
      .send(),
    operations,
  );
  await send(
    "Open funded-pool serial one",
    collectorTwoRouter.methodsObject
      .open_pack({
        token_id: 1,
        nonce: nonce("mode-1-gold"),
        actions: fundedPoolMode.recipes[1].actions,
      })
      .send(),
    operations,
  );
  await send(
    "Open reserved-allocation pack",
    collectorRouter.methodsObject
      .open_pack({
        token_id: 2,
        nonce: nonce("mode-2"),
        actions: allocatedMode.recipes[0].actions,
      })
      .send(),
    operations,
  );
  await send(
    "Open collector-generated pack",
    collectorTwoRouter.methodsObject
      .open_pack({
        token_id: 3,
        nonce: nonce("mode-3"),
        actions: generativeMode.recipes[0].actions,
      })
      .send(),
    operations,
  );

  await assert.rejects(
    () =>
      collectorTezos.estimate.transfer(
        collectorRouter.methodsObject
          .open_pack({
            token_id: 4,
            nonce: nonce("wrong-hybrid-reveal"),
            actions: hybridMode.recipes[0].actions,
          })
          .toTransferParams(),
      ),
    /BAD_RECIPE/,
  );
  ok("hybrid bad-reveal simulation rejected before wrapper or reserve mutation");

  const hybridOpen = await send(
    "Open hybrid escrow + allocation + generative pack",
    collectorRouter.methodsObject
      .open_pack({
        token_id: 4,
        nonce: nonce("mode-4"),
        actions: hybridMode.recipes[0].actions,
      })
      .send(),
    operations,
  );

  const hybridTree = await transactionTree(hybridOpen.hash);
  const entrypoints = new Set(hybridTree.map((operation) => String(operation?.parameter?.entrypoint || "default")));
  for (const expected of ["open_pack", "transfer", "fulfill", "mint_reserved", "mint_pack_iteration"]) {
    assert.ok(entrypoints.has(expected), `hybrid operation tree lacks ${expected}`);
  }
  assert.ok(hybridTree.every((operation) => operation.status === "applied"));

  await send(
    "Publish the four blind recipe manifests after opening",
    contractBatch(
      creatorTezos,
      modePayloads
        .filter((mode) => mode.blind)
        .map((mode) =>
          router.methodsObject.set_pack_contents({
            token_id: mode.tokenId,
            contents_uri: utf8ToHex(mode.recipeMetadataUri),
          }),
        ),
    ) as any,
    operations,
  );

  const routerStorageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${routerAddress}/storage`;
  const indexedRouter = await pollJson(
    "Ravioli router storage",
    routerStorageUrl,
    (value) =>
      Number(value?.metadata) > 0 &&
      Number(value?.token_metadata) > 0 &&
      Number(value?.packs) > 0 &&
      Number(value?.opened) > 0 &&
      Number(value?.recipe_commitments) > 0 &&
      String(value?.next_token_id) === "5",
  );
  const openedKeys = await pollJson(
    "all Ravioli opened counters",
    `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedRouter.opened}/keys?limit=20`,
    (value) =>
      Array.isArray(value) &&
      [0, 1, 2, 3, 4].every((tokenId) =>
        value.some(
          (entry) =>
            String(entry?.key) === String(tokenId) &&
            Number(entry?.value) === (tokenId === 1 ? 2 : 1),
        ),
      ),
  );
  assert.equal(openedKeys.length >= 5, true);

  const gnocchiIndexed = await pollJson(
    "Gnocchi allocation storage",
    `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${gnocchiAddress}/storage`,
    (value) =>
      Number(value?.metadata) > 0 &&
      Number(value?.token_metadata) > 0 &&
      Number(value?.ledger) > 0 &&
      Number(value?.total_minted) > 0 &&
      Number(value?.total_reserved) > 0,
  );
  const gnocchiLedger = await pollJson(
    "collector allocated and escrowed Gnocchi balances",
    `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${gnocchiIndexed.ledger}/keys?limit=100`,
    (value) =>
      Array.isArray(value) &&
      value.some(
        (entry) =>
          entry?.key?.owner === collector.address &&
          String(entry?.key?.token_id) === "1" &&
          Number(entry?.value) === 2,
      ) &&
      value.some(
        (entry) =>
          entry?.key?.owner === collector.address &&
          String(entry?.key?.token_id) === "2" &&
          Number(entry?.value) >= 1,
      ),
  );
  assert.ok(Array.isArray(gnocchiLedger));

  const rotiniIndexed = await pollJson(
    "Rotini pack-mint storage",
    `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${rotiniAddress}/storage`,
    (value) =>
      Number(value?.metadata) > 0 &&
      Number(value?.projects) > 0 &&
      Number(value?.ledger) > 0 &&
      Number(value?.token_metadata) > 0 &&
      Number(value?.token_artifact) > 0 &&
      String(value?.next_token_id) === "2",
  );
  const rotiniLedger = await pollJson(
    "Rotini generated token owners",
    `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${rotiniIndexed.ledger}/keys?limit=20`,
    (value) =>
      Array.isArray(value) &&
      value.some((entry) => entry?.key?.owner === collectorTwo.address && String(entry?.key?.token_id) === "0") &&
      value.some((entry) => entry?.key?.owner === collector.address && String(entry?.key?.token_id) === "1"),
  );
  assert.ok(Array.isArray(rotiniLedger));

  const [gnocchiAdapterIndexed, rotiniAdapterIndexed] = await Promise.all([
    pollJson(
      "Gnocchi adapter storage",
      `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${gnocchiAdapterAddress}/storage`,
      (value) => Number(value?.metadata) > 0 && Number(value?.routers) > 0,
    ),
    pollJson(
      "Rotini adapter storage",
      `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${rotiniAdapterAddress}/storage`,
      (value) => Number(value?.metadata) > 0 && Number(value?.routers) > 0,
    ),
  ]);

  await Promise.all([
    assertContractMetadataUri(
      "Ravioli router",
      indexedRouter.metadata,
      evidence.contractMetadata.router.uri,
    ),
    assertContractMetadataUri(
      "Gnocchi",
      gnocchiIndexed.metadata,
      evidence.contractMetadata.gnocchi.uri,
    ),
    assertContractMetadataUri(
      "Rotini",
      rotiniIndexed.metadata,
      evidence.contractMetadata.rotini.uri,
    ),
    assertContractMetadataUri(
      "Gnocchi adapter",
      gnocchiAdapterIndexed.metadata,
      evidence.contractMetadata.gnocchiAdapter.uri,
    ),
    assertContractMetadataUri(
      "Rotini adapter",
      rotiniAdapterIndexed.metadata,
      evidence.contractMetadata.rotiniAdapter.uri,
    ),
    assertTokenMetadataUris(
      "Gnocchi",
      gnocchiIndexed.token_metadata,
      evidence.uris.gnocchiTokenMetadataUris,
    ),
    assertTokenMetadataUris(
      "Ravioli wrapper",
      indexedRouter.token_metadata,
      evidence.uris.packTokenMetadataUris,
    ),
    assertPackContentsUris(indexedRouter.packs, evidence.uris.recipeMetadataUris),
    assertRotiniProjectUris(rotiniIndexed.projects, evidence.uris),
    assertRotiniGeneratedUris(
      rotiniIndexed.token_metadata,
      rotiniIndexed.token_artifact,
      evidence.uris,
    ),
  ]);
  ok("TzKT indexed every contract, wrapper, recipe, generator, and generated-artifact URI exactly");

  const [indexedPackTokens, indexedGnocchiTokens, indexedRotiniTokens] = await Promise.all([
    pollJson(
      "five indexed Ravioli wrapper tokens",
      `${normalizeBase(SHADOWNET_TZKT_API)}/tokens?contract=${encodeURIComponent(routerAddress)}&limit=10`,
      (value) =>
        Array.isArray(value) &&
        MODE_SPECS.every((spec) => value.some((token) => Number(token?.tokenId) === spec.tokenId)),
    ),
    pollJson(
      "three indexed Gnocchi asset tokens",
      `${normalizeBase(SHADOWNET_TZKT_API)}/tokens?contract=${encodeURIComponent(gnocchiAddress)}&limit=10`,
      (value) =>
        Array.isArray(value) &&
        GNOCCHI_TOKEN_SPECS.every((spec) =>
          value.some((token) => Number(token?.tokenId) === spec.tokenId),
        ),
    ),
    pollJson(
      "two indexed Rotini generated tokens",
      `${normalizeBase(SHADOWNET_TZKT_API)}/tokens?contract=${encodeURIComponent(rotiniAddress)}&limit=10`,
      (value) =>
        Array.isArray(value) &&
        [0, 1].every((tokenId) => value.some((token) => Number(token?.tokenId) === tokenId)),
    ),
  ]);
  assert.equal(indexedPackTokens.length, MODE_SPECS.length);
  assert.equal(indexedGnocchiTokens.length, GNOCCHI_TOKEN_SPECS.length);
  assert.equal(indexedRotiniTokens.length, 2);

  await writeReport("PASSED", [
    "## Result",
    "",
    "- Fresh signer-backed Ravioli v2 proof passed for all five wrapped-token product modes.",
    `- Creator: \`${creator.id}\` / \`${creator.address}\``,
    `- Collector one: \`${collector.id}\` / \`${collector.address}\``,
    `- Collector two: \`${collectorTwo.id}\` / \`${collectorTwo.address}\``,
    `- Router: \`${routerAddress}\` — https://shadownet.tzkt.io/${routerAddress}`,
    `- Gnocchi: \`${gnocchiAddress}\` — https://shadownet.tzkt.io/${gnocchiAddress}`,
    `- Rotini: \`${rotiniAddress}\` — https://shadownet.tzkt.io/${rotiniAddress}`,
    `- Allocation adapter: \`${gnocchiAdapterAddress}\` — https://shadownet.tzkt.io/${gnocchiAdapterAddress}`,
    `- Generative adapter: \`${rotiniAdapterAddress}\` — https://shadownet.tzkt.io/${rotiniAdapterAddress}`,
    "- All five contracts were freshly originated after every referenced IPFS object passed independent public-gateway byte verification.",
    "",
    "## Five product proofs",
    "",
    "1. Deterministic vault: direct sale, purchase, existing FA2 delivery, wrapper burn.",
    "2. Blind funded pool: two committed wrapper units delivered two pre-existing token allocations.",
    "3. Blind allocation: capacity was reserved before wrapper issuance and Gnocchi minted it at open.",
    "4. Blind generative: the PNG and metadata bytes were pinned and payload-committed before issuance; Rotini created the FA2 token and its metadata entry only at open.",
    "5. Hybrid: one wrapper atomically delivered an escrowed existing token, a reserved unminted token, and a new Rotini token.",
    "- Blind recipe manifests were linked through `contents_uri` only after their wrappers were opened; the deterministic manifest was public at creation.",
    "",
    "## Atomic hybrid operation",
    "",
    `- Operation: \`${hybridOpen.hash}\``,
    `- TzKT: https://shadownet.tzkt.io/${hybridOpen.hash}`,
    `- Applied entrypoint tree: \`${[...entrypoints].sort().join("`, `")}\``,
    `- Applied transactions in the shared operation tree: \`${hybridTree.length}\``,
    "- A wrong hybrid reveal was rejected during simulation with `BAD_RECIPE`; local SmartPy integration also proves child failure rollback preserves wrapper and every reserve.",
    "- Router commitments bind the nonce, ordered reservation identities, and `Some(blake2b(actual payload))` for both allocated and generative actions. A substituted payload cannot reconstruct the committed recipe.",
    "",
    "## Pinned IPFS proof",
    "",
    ...pinnedProofLines(evidence),
    "",
    "## Indexed token evidence",
    "",
    ...MODE_SPECS.map(
      (spec) =>
        `- Ravioli ${spec.name} token ${spec.tokenId}: https://shadownet.tzkt.io/${routerAddress}/tokens/${spec.tokenId}`,
    ),
    ...GNOCCHI_TOKEN_SPECS.map(
      (spec) =>
        `- Gnocchi ${spec.name} token ${spec.tokenId}: https://shadownet.tzkt.io/${gnocchiAddress}/tokens/${spec.tokenId}`,
    ),
    `- Rotini generated token 0: https://shadownet.tzkt.io/${rotiniAddress}/tokens/0`,
    `- Rotini hybrid-generated token 1: https://shadownet.tzkt.io/${rotiniAddress}/tokens/1`,
    "",
    "## Standards and limits",
    "",
    "- Router, Gnocchi, and Rotini expose canonical TZIP-12 transfer/operator/balance layouts and TZIP-16 metadata storage.",
    "- Wrapper and generated tokens use TZIP-21 token metadata maps; TzKT indexing is recorded below.",
    `- Forged origination script sizes: ${plans.map((plan) => `${plan.label}=\`${plan.scriptBytes}\``).join(", ")} bytes; each is below \`${MAX_ORIGINATION_BYTES}\` bytes.`,
    `- TzKT indexed \`${indexedPackTokens.length}\` Ravioli wrappers, \`${indexedGnocchiTokens.length}\` Gnocchi assets, and \`${indexedRotiniTokens.length}\` Rotini generated tokens.`,
    "- Blind means nonce-backed commit/reveal plus ordinary UI concealment. Tezos funding/reservation operations remain public and are not represented as cryptographically private.",
    "",
    "## Operations",
    "",
    ...operations.map((operation) => `- ${operation.label}: \`${operation.hash}\``),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
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
      `[pasta-shadownet-ravioli-e2e] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
