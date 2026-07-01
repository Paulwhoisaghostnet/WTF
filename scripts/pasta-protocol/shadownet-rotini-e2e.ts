#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { MichelsonMap, TezosToolkit } from "@taquito/taquito";
import type { InMemorySigner } from "@taquito/signer";

import keyringModule from "../../extensions/wtf-operator-signer/src/keyring";
import type { SignerEnv } from "../../extensions/wtf-operator-signer/src/env";
import {
  availableActions,
  buildCollectionMetadata,
  buildCollectionPackage,
  buildTokenMetadata,
  detectPastaContract,
  extractRelationshipMetadata,
  generateEditions,
  traitAttributes,
  validateCheasePackage,
} from "../../shared/pasta-protocol/index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

const SHADOWNET_CHAIN_ID = "NetXsqzbfFenSTS";
const SHADOWNET_RPC = process.env.PASTA_SHADOWNET_RPC || "https://tezos-shadownet.octez.io/";
const SHADOWNET_TZKT_API = process.env.PASTA_SHADOWNET_TZKT_API || "https://api.shadownet.tzkt.io/v1";
const DEFAULT_KEYRING_PATH = path.join(homedir(), ".wtf-gameshow", "platform-wallet-keyring.json");
const DEFAULT_MASTER_KEY_FILE = path.join(homedir(), ".wtf-gameshow", "platform-keyring-master.key");
const DEFAULT_CREATOR_WALLET_ID = "wtf-os-root";
const DEFAULT_COLLECTOR_WALLET_ID = "arcade-treasury";
const { PlatformWalletKeyring } = keyringModule as any;
const REPORT_PATH = path.join(
  root,
  ".agents",
  "docs",
  "archive",
  "contracts",
  "pasta-protocol",
  "shadownet-rotini-e2e-report.md",
);

type ProofStatus = "BLOCKED" | "FAILED" | "PASSED";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeBase(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function utf8ToHex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

function dataJsonUri(value: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(value), "utf8").toString("base64")}`;
}

function hexToUtf8(hex: string): string {
  return Buffer.from(hex, "hex").toString("utf8");
}

function parseDataJsonUri(uri: string): unknown {
  const match = uri.match(/^data:application\/json;base64,(.+)$/);
  if (!match) throw new Error(`unsupported metadata URI: ${uri.slice(0, 80)}`);
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

function ok(message: string): void {
  console.log(`[pasta-shadownet-rotini-e2e] ok: ${message}`);
}

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(
    REPORT_PATH,
    [
      "# Pasta Protocol Rotini Shadownet E2E Report",
      "",
      `- Status: ${status}`,
      `- Timestamp: ${nowIso()}`,
      `- RPC: ${normalizeBase(SHADOWNET_RPC)}`,
      `- TzKT API: ${normalizeBase(SHADOWNET_TZKT_API)}`,
      "",
      ...lines,
      "",
    ].join("\n"),
  );
}

async function fetchJson(url: string): Promise<{ status: number; json: any; text: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-shadownet-rotini-e2e" },
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function pollJson(
  label: string,
  url: string,
  predicate: (json: any) => boolean,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<any> {
  const attempts = opts.attempts ?? 30;
  const delayMs = opts.delayMs ?? 4_000;
  let last: { status: number; json: any; text: string } | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await fetchJson(url);
    if (last.status >= 200 && last.status < 300 && predicate(last.json)) return last.json;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(
    `${label} did not appear after ${attempts} attempts: HTTP ${last?.status ?? "n/a"} ${String(
      last?.text ?? "",
    ).slice(0, 500)}`,
  );
}

async function loadMasterKey(): Promise<string> {
  const inline = process.env.WTF_PLATFORM_KEYRING_MASTER_KEY?.trim();
  if (inline) return inline;
  const file = process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || DEFAULT_MASTER_KEY_FILE;
  return (await readFile(file, "utf8")).trim();
}

async function signerEnv(): Promise<SignerEnv> {
  return {
    WTF_OPERATOR_SIGNER_RPC: normalizeBase(SHADOWNET_RPC),
    WTF_OPERATOR_SIGNER_SOCKET: process.env.WTF_OPERATOR_SIGNER_SOCKET || "/tmp/wtf-pasta-shadownet-rotini-e2e.sock",
    WTF_OPERATOR_SIGNER_AUTH_TOKEN: process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN || "local-pasta-shadownet-rotini-e2e",
    WTF_OPERATOR_SIGNER_SECRET: process.env.WTF_OPERATOR_SIGNER_SECRET || "",
    WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID: process.env.PASTA_SHADOWNET_CREATOR_WALLET_ID || DEFAULT_CREATOR_WALLET_ID,
    WTF_PLATFORM_KEYRING_PATH: process.env.WTF_PLATFORM_KEYRING_PATH || DEFAULT_KEYRING_PATH,
    WTF_PLATFORM_KEYRING_MASTER_KEY: await loadMasterKey(),
    WTF_PLATFORM_KEYRING_MASTER_KEY_FILE: process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || DEFAULT_MASTER_KEY_FILE,
    WTF_PLATFORM_KEYRING_CREATE_ENABLED: 0,
    WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST: [],
    WTF_OPERATOR_SIGNER_DISBURSE_ASSETS: [],
    WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ: 100_000_000,
    WTF_OPERATOR_SIGNER_MAX_RECIPIENTS: 20,
    WTF_OPERATOR_SIGNER_ALLOW_CUSTOM: 0,
    WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION: 1,
    WTF_OPERATOR_SIGNER_MAX_ORIGINATION_BYTES: 750_000,
    WTF_OPERATOR_SIGNER_AUDIT_LOG: process.env.WTF_OPERATOR_SIGNER_AUDIT_LOG || "/tmp/wtf-pasta-shadownet-rotini-e2e-audit.log",
  };
}

function buildToolkit(signer: InMemorySigner): TezosToolkit {
  const tezos = new TezosToolkit(normalizeBase(SHADOWNET_RPC));
  tezos.setProvider({ signer });
  return tezos;
}

async function readContractArtifact(): Promise<unknown[]> {
  const artifact = path.join(
    root,
    "public",
    "creation-tools",
    "rotini",
    "contract",
    "pasta-standard-collection.contract.json",
  );
  return JSON.parse(await readFile(artifact, "utf8"));
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

function buildMetadata(creator: string) {
  const relationship = {
    parent_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    collection_group: `rotini-shadownet-e2e-${Date.now().toString(36)}`,
  };
  const layers = [
    {
      name: "Sauce",
      variants: [
        { value: "Tomato", weight: 2 },
        { value: "Pesto", weight: 1 },
      ],
    },
    {
      name: "Shape",
      variants: [
        { value: "Tight spiral", weight: 1 },
        { value: "Wide spiral", weight: 1 },
      ],
    },
    {
      name: "Finish",
      variants: [
        { value: "Gloss", weight: 1 },
        { value: "Matte", weight: 1 },
      ],
    },
  ];
  const seed = `rotini-shadownet-e2e-${creator}`;
  const editions = generateEditions(layers, 2, seed, { unique: true });
  assert.equal(editions.length, 2);

  const pkg = buildCollectionPackage({
    targetApp: "rotini",
    title: "Rotini Shadownet E2E",
    description: "Signer-backed Pasta Protocol generative Shadownet deployment proof.",
    symbol: "RTNE2E",
    relationship,
    items: editions.map((edition) => ({
      name: `Rotini Proof Seed #${edition.index + 1}`,
      description: `Deterministic generated edition with DNA ${edition.dna}.`,
      artifactUri: `data:text/plain;base64,${Buffer.from(`rotini:${edition.dna}`, "utf8").toString("base64")}`,
      mimeType: "text/plain",
      attributes: traitAttributes(edition.traits),
      tags: ["rotini", "generative", "shadownet", "e2e"],
    })),
  });
  const validation = validateCheasePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join("; "));

  const collectionMetadata = buildCollectionMetadata({
    name: pkg.title,
    description: pkg.description,
    symbol: pkg.symbol,
    relationship: pkg.relationship,
    extra: { rotini: { seed, editionCount: editions.length } },
  });
  const tokenMetadatas = pkg.items.map((item, index) =>
    buildTokenMetadata({
      name: item.name,
      description: item.description,
      symbol: pkg.symbol,
      artifactUri: item.artifactUri,
      mimeType: item.mimeType,
      creators: [creator],
      minter: creator,
      tags: item.tags,
      attributes: item.attributes,
      relationship: pkg.relationship,
      extra: {
        rotini: {
          seed,
          edition: index + 1,
          dna: editions[index].dna,
          traits: editions[index].traits,
        },
      },
    }),
  );
  assert.deepEqual(extractRelationshipMetadata(collectionMetadata), relationship);
  for (const tokenMetadata of tokenMetadatas) {
    assert.deepEqual(extractRelationshipMetadata(tokenMetadata), relationship);
  }
  return {
    relationship,
    layers,
    seed,
    editions,
    package: pkg,
    collectionMetadata,
    tokenMetadatas,
    collectionMetadataUri: dataJsonUri(collectionMetadata),
    tokenMetadataUris: tokenMetadatas.map(dataJsonUri),
  };
}

function buildOriginationStorage(admin: string, collectionMetadataUri: string) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(collectionMetadataUri));
  return {
    administrator: admin,
    pending_administrator: null,
    metadata,
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    total_supply: new MichelsonMap(),
    minters: new MichelsonMap(),
    next_token_id: 0,
  };
}

function buildTokenInfo(tokenMetadataUri: string) {
  const tokenInfo = new MichelsonMap<string, string>();
  tokenInfo.set("", utf8ToHex(tokenMetadataUri));
  return tokenInfo;
}

async function main(): Promise<void> {
  if (process.env.PASTA_SHADOWNET_E2E_EXECUTE !== "1") {
    await writeReport("BLOCKED", [
      "## Blocker",
      "",
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof originates a real Shadownet contract and spends test tez.",
    ]);
    console.error("BLOCKED: set PASTA_SHADOWNET_E2E_EXECUTE=1 to originate on Shadownet");
    process.exitCode = 2;
    return;
  }
  if ((process.env.TEZOS_NETWORK || "shadownet") === "mainnet") {
    throw new Error("Refusing to run Pasta Rotini Shadownet E2E with TEZOS_NETWORK=mainnet");
  }

  const env = await signerEnv();
  const keyring = new PlatformWalletKeyring(env);
  const creatorWalletId = process.env.PASTA_SHADOWNET_CREATOR_WALLET_ID || DEFAULT_CREATOR_WALLET_ID;
  const collectorWalletId = process.env.PASTA_SHADOWNET_COLLECTOR_WALLET_ID || DEFAULT_COLLECTOR_WALLET_ID;
  const { wallet: creator, signer } = await keyring.getSigner(creatorWalletId);
  const { wallet: collector } = await keyring.getSigner(collectorWalletId);
  assert.equal(creator.network, "shadownet", `creator wallet ${creator.id} is not Shadownet`);
  assert.equal(collector.network, "shadownet", `collector wallet ${collector.id} is not Shadownet`);

  const tezos = buildToolkit(signer);
  const chainId = await tezos.rpc.getChainId();
  assert.equal(chainId, SHADOWNET_CHAIN_ID);
  ok(`RPC ${normalizeBase(SHADOWNET_RPC)} returned ${chainId}`);

  const balance = await tezos.tz.getBalance(creator.address);
  if (balance.toNumber() < 2_500_000) {
    await writeReport("BLOCKED", [
      "## Blocker",
      "",
      `Creator ${creator.address} has only ${balance.toString()} mutez on Shadownet.`,
      "Fund the signer with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
    console.error(`BLOCKED: ${creator.address} has insufficient Shadownet balance`);
    process.exitCode = 2;
    return;
  }
  ok(`creator ${creator.address} has ${balance.toString()} mutez`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "standard_collection");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "transfer"));
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "mint"));

  const metadata = buildMetadata(creator.address);
  const storage = buildOriginationStorage(creator.address, metadata.collectionMetadataUri);
  const originationEstimate = await tezos.estimate.originate({ code, storage } as any);
  ok(
    `origination estimate fee=${originationEstimate.suggestedFeeMutez} burn=${originationEstimate.burnFeeMutez} storage=${originationEstimate.storageLimit}`,
  );

  const originate = await tezos.contract.originate({ code, storage } as any);
  await originate.confirmation(1);
  const originated = await originate.contract();
  ok(`originated ${originated.address} with ${originate.hash}`);

  const contract = await tezos.contract.at(originated.address);
  const createTokenOps = [];
  for (let tokenId = 0; tokenId < metadata.tokenMetadataUris.length; tokenId += 1) {
    const createToken = await contract.methodsObject
      .create_token(buildTokenInfo(metadata.tokenMetadataUris[tokenId]))
      .send();
    await createToken.confirmation(1);
    ok(`created generated token ${tokenId} with ${createToken.hash}`);
    createTokenOps.push(createToken.hash);
  }

  const mintOps = [];
  for (let tokenId = 0; tokenId < metadata.tokenMetadataUris.length; tokenId += 1) {
    const mint = await contract.methodsObject
      .mint({ to_: creator.address, token_id: tokenId, amount: 1 })
      .send();
    await mint.confirmation(1);
    ok(`minted generated token ${tokenId} with ${mint.hash}`);
    mintOps.push(mint.hash);
  }

  const transfer = await contract.methodsObject
    .transfer([
      {
        from_: creator.address,
        txs: [{ to_: collector.address, token_id: 1, amount: 1 }],
      },
    ])
    .send();
  await transfer.confirmation(1);
  ok(`transferred generated token 1 to collector with ${transfer.hash}`);

  const storageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${encodeURIComponent(originated.address)}/storage`;
  const indexedStorage = await pollJson(
    "contract storage",
    storageUrl,
    (json) => Number(json?.ledger) > 0 && Number(json?.token_metadata) > 0 && Number(json?.total_supply) > 0,
  );
  const ledgerUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.ledger}/keys?limit=100`;
  const ledgerKeys = await pollJson(
    "ledger big map keys",
    ledgerUrl,
    (json) =>
      Array.isArray(json) &&
      json.some(
        (entry) =>
          entry?.key?.owner === creator.address &&
          String(entry?.key?.token_id) === "0" &&
          Number(entry?.value || 0) >= 1,
      ) &&
      json.some(
        (entry) =>
          entry?.key?.owner === collector.address &&
          String(entry?.key?.token_id) === "1" &&
          Number(entry?.value || 0) >= 1,
      ),
  );
  const creatorLedgerEntry = ledgerKeys.find(
    (entry: any) => entry?.key?.owner === creator.address && String(entry?.key?.token_id) === "0",
  );
  const collectorLedgerEntry = ledgerKeys.find(
    (entry: any) => entry?.key?.owner === collector.address && String(entry?.key?.token_id) === "1",
  );

  const totalSupplyUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.total_supply}/keys?limit=100`;
  const totalSupplyKeys = await pollJson(
    "total supply big map keys",
    totalSupplyUrl,
    (json) =>
      Array.isArray(json) &&
      json.some((entry) => String(entry?.key) === "0" && Number(entry?.value || 0) === 1) &&
      json.some((entry) => String(entry?.key) === "1" && Number(entry?.value || 0) === 1),
  );
  const tokenMetadataUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.token_metadata}/keys?limit=100`;
  const tokenMetadataKeys = await pollJson(
    "token metadata big map keys",
    tokenMetadataUrl,
    (json) =>
      Array.isArray(json) &&
      json.some((entry) => String(entry?.key) === "0") &&
      json.some((entry) => String(entry?.key) === "1"),
  );
  const indexedTokenMetadatas = [0, 1].map((tokenId) => {
    const entry = tokenMetadataKeys.find((item: any) => String(item?.key) === String(tokenId));
    const tokenUri = hexToUtf8(String(entry?.value?.token_info?.[""] || ""));
    return parseDataJsonUri(tokenUri) as any;
  });
  for (const [index, indexedTokenMetadata] of indexedTokenMetadatas.entries()) {
    assert.equal(indexedTokenMetadata.name, metadata.package.items[index].name);
    assert.deepEqual(extractRelationshipMetadata(indexedTokenMetadata), metadata.relationship);
    assert.deepEqual(indexedTokenMetadata.attributes, metadata.package.items[index].attributes);
    assert.equal(indexedTokenMetadata.rotini?.dna, metadata.editions[index].dna);
  }

  const totalSupplySummary = [0, 1]
    .map((tokenId) => {
      const entry = totalSupplyKeys.find((item: any) => String(item?.key) === String(tokenId));
      return `${tokenId}:${entry?.value}`;
    })
    .join(", ");

  await writeReport("PASSED", [
    "## Result",
    "",
    "- Signer-backed Rotini Shadownet generative deploy/create/mint/collect proof passed.",
    `- Creator wallet: \`${creator.id}\` / \`${creator.address}\``,
    `- Collector wallet: \`${collector.id}\` / \`${collector.address}\``,
    `- Contract: \`${originated.address}\``,
    `- Explorer: https://shadownet.tzkt.io/${originated.address}`,
    "",
    "## Operations",
    "",
    `- Origination: \`${originate.hash}\``,
    `- Create tokens: ${createTokenOps.map((hash) => `\`${hash}\``).join(", ")}`,
    `- Mint generated editions: ${mintOps.map((hash) => `\`${hash}\``).join(", ")}`,
    `- Transfer/collect: \`${transfer.hash}\``,
    "",
    "## Indexed Proof",
    "",
    `- Contract storage indexed ledger big map \`${indexedStorage.ledger}\`, token_metadata big map \`${indexedStorage.token_metadata}\`, and total_supply big map \`${indexedStorage.total_supply}\`.`,
    `- Creator ledger big-map entry returned balance \`${creatorLedgerEntry?.value}\` for token 0.`,
    `- Collector ledger big-map entry returned balance \`${collectorLedgerEntry?.value}\` for token 1.`,
    `- Total supply big-map entries returned ${totalSupplySummary}.`,
    `- Token metadata big-map entries decoded to \`${indexedTokenMetadatas[0].name}\` and \`${indexedTokenMetadatas[1].name}\` with relationship, trait attributes, and Rotini DNA intact.`,
    `- Relationship group: \`${metadata.relationship.collection_group}\``,
    `- Generation seed: \`${metadata.seed}\``,
    "",
    "## Scope",
    "",
    "- This proves signer-backed Shadownet origination, deterministic generated-token metadata, token creation, minting, transfer/collect, total supply, and ownership resolution for Rotini generative collections.",
    "- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, browser wallet batching, or every Pasta publisher variant.",
  ]);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  await writeReport("FAILED", ["## Error", "", "```", message, "```"]).catch(() => undefined);
  console.error(`[pasta-shadownet-rotini-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
