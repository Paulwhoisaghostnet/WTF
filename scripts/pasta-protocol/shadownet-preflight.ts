#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  availableActions,
  buildCollectionMetadata,
  buildCollectionPackage,
  buildTokenMetadata,
  detectPastaContract,
  extractRelationshipMetadata,
  validateCheasePackage,
} from "../../shared/pasta-protocol/index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

const SHADOWNET_CHAIN_ID = "NetXsqzbfFenSTS";
const SHADOWNET_RPC_PRIMARY =
  process.env.PASTA_SHADOWNET_RPC || "https://tezos-shadownet.octez.io/";
const SHADOWNET_RPC_FALLBACK =
  process.env.PASTA_SHADOWNET_RPC_FALLBACK || "https://tcinfra.net/rpc/tezos/shadownet";
const SHADOWNET_TZKT_API =
  process.env.PASTA_SHADOWNET_TZKT_API || "https://api.shadownet.tzkt.io/v1";
const ADMIN_ADDRESS =
  process.env.PASTA_SHADOWNET_PREFLIGHT_ADMIN ||
  "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";

type RpcProbe = {
  rpcUrl: string;
  chainId: string;
};

function ok(message: string): void {
  console.log(`[pasta-shadownet-preflight] ok: ${message}`);
}

function normalizeBase(raw: string): string {
  return raw.replace(/\/+$/, "");
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-shadownet-preflight" },
  });
  return { status: response.status, text: await response.text() };
}

async function probeRpcChainId(): Promise<RpcProbe> {
  const errors: string[] = [];
  for (const rpcUrl of [SHADOWNET_RPC_PRIMARY, SHADOWNET_RPC_FALLBACK]) {
    const base = normalizeBase(rpcUrl);
    try {
      const response = await fetchText(`${base}/chains/main/chain_id`);
      if (response.status >= 200 && response.status < 300) {
        const chainId = response.text.trim().replace(/^"|"$/g, "");
        assert.equal(
          chainId,
          SHADOWNET_CHAIN_ID,
          `${base} returned unexpected chain id ${chainId}`,
        );
        return { rpcUrl: base, chainId };
      }
      errors.push(`${base}: HTTP ${response.status} ${response.text.slice(0, 160)}`);
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No configured Shadownet RPC returned ${SHADOWNET_CHAIN_ID}: ${errors.join(" | ")}`);
}

async function probeTzktHead(): Promise<number> {
  const response = await fetchText(`${normalizeBase(SHADOWNET_TZKT_API)}/head`);
  assert.ok(
    response.status >= 200 && response.status < 300,
    `TzKT Shadownet head probe failed: HTTP ${response.status} ${response.text.slice(0, 160)}`,
  );
  const parsed = JSON.parse(response.text);
  assert.equal(parsed.chain, "shadownet");
  assert.equal(parsed.chainId, SHADOWNET_CHAIN_ID);
  assert.ok(Number(parsed.level) > 0, "TzKT head level should be positive");
  return Number(parsed.level);
}

function collectAnnotations(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectAnnotations(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const record = value as { annots?: unknown; args?: unknown };
  if (Array.isArray(record.annots)) {
    for (const annot of record.annots) {
      if (typeof annot === "string" && annot.startsWith("%")) output.add(annot.slice(1));
    }
  }
  if (Array.isArray(record.args)) {
    for (const arg of record.args) collectAnnotations(arg, output);
  }
  return output;
}

function utf8ToHex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

async function readContractArtifact(): Promise<unknown[]> {
  const artifactPath = path.join(
    root,
    "public",
    "creation-tools",
    "spaghetti",
    "contract",
    "pasta-standard-collection.contract.json",
  );
  const code = JSON.parse(await readFile(artifactPath, "utf8"));
  assert.ok(Array.isArray(code), "Spaghetti contract artifact should be Michelson JSON array");
  for (const primitive of ["storage", "parameter", "code"]) {
    assert.ok(
      code.some((item) => item && typeof item === "object" && (item as { prim?: string }).prim === primitive),
      `Spaghetti contract artifact is missing ${primitive}`,
    );
  }
  return code;
}

function assertEntrypoints(entrypoints: Set<string>): void {
  const required = [
    "transfer",
    "balance_of",
    "update_operators",
    "create_token",
    "mint",
    "burn",
    "set_token_metadata",
    "set_sale",
    "set_sale_active",
    "buy",
    "add_minter",
    "remove_minter",
    "transfer_administration",
    "accept_administration",
  ];
  for (const entrypoint of required) {
    assert.ok(entrypoints.has(entrypoint), `Spaghetti artifact missing entrypoint ${entrypoint}`);
  }

  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "standard_collection");
  const actions = availableActions(adapter, [...entrypoints]).map((action) => action.id).sort();
  assert.deepEqual(actions, [
    "accept_administration",
    "add_minter",
    "burn",
    "mint",
    "remove_minter",
    "set_sale",
    "set_sale_active",
    "transfer",
    "transfer_administration",
  ]);
}

function assertPublishPayloadPlan(): void {
  const relationship = {
    parent_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    collection_group: "shadownet-preflight",
  };
  const pkg = buildCollectionPackage({
    targetApp: "spaghetti",
    title: "Pasta Shadownet Preflight",
    description: "Unsigned preflight package for Spaghetti deployment readiness.",
    symbol: "PREFLT",
    relationship,
    items: [
      {
        name: "Preflight Token One",
        artifactUri: "ipfs://bafy-preflight-one",
        mimeType: "image/png",
        tags: ["spaghetti", "preflight"],
      },
      {
        name: "Preflight Token Two",
        artifactUri: "ipfs://bafy-preflight-two",
        mimeType: "image/png",
        tags: ["batch"],
      },
    ],
  });
  const validation = validateCheasePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join("; "));

  const collectionMetadata = buildCollectionMetadata({
    name: pkg.title,
    description: pkg.description,
    symbol: pkg.symbol,
    imageUri: "ipfs://bafy-preflight-cover",
    relationship: pkg.relationship,
  });
  assert.deepEqual(extractRelationshipMetadata(collectionMetadata), relationship);

  const tokenMetadata = pkg.items.map((item) =>
    buildTokenMetadata({
      name: item.name,
      description: item.description,
      symbol: pkg.symbol,
      artifactUri: item.artifactUri,
      mimeType: item.mimeType,
      creators: [ADMIN_ADDRESS],
      minter: ADMIN_ADDRESS,
      tags: item.tags,
      relationship: pkg.relationship,
    }),
  );
  assert.equal(tokenMetadata.length, 2);
  assert.deepEqual(extractRelationshipMetadata(tokenMetadata[0]), relationship);
  assert.equal(tokenMetadata[0].creators?.[0], ADMIN_ADDRESS);
  assert.equal(tokenMetadata[0].minter, ADMIN_ADDRESS);

  const collectionMetadataUri = "ipfs://bafy-preflight-collection";
  const storagePlan = {
    administrator: ADMIN_ADDRESS,
    pending_administrator: null,
    metadata: { "": utf8ToHex(collectionMetadataUri) },
    next_token_id: 0,
    ledger: "empty big_map",
    operators: "empty big_map",
    token_metadata: "empty big_map",
    total_supply: "empty big_map",
    minters: "empty big_map",
  };
  assert.equal(storagePlan.metadata[""], "697066733a2f2f626166792d707265666c696768742d636f6c6c656374696f6e");
  assert.equal(storagePlan.administrator, ADMIN_ADDRESS);
}

async function main(): Promise<void> {
  const rpc = await probeRpcChainId();
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const tzktLevel = await probeTzktHead();
  ok(`Shadownet TzKT head is reachable at level ${tzktLevel}`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  assertEntrypoints(entrypoints);
  ok("Spaghetti contract artifact exposes FA2 plus standard collection entrypoints");

  assertPublishPayloadPlan();
  ok("Spaghetti package, relationship metadata, token metadata, and origination storage plan are valid");

  ok("preflight complete; signer-backed deploy/mint/collect proof is covered by npm run pasta:shadownet:e2e");
}

main().catch((error) => {
  console.error(`[pasta-shadownet-preflight] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
