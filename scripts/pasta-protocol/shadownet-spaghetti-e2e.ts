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
const DEFAULT_KEYRING_PATH = path.join(homedir(), ".wtf-gameshow", "platform-wallet-keyring.json");
const DEFAULT_MASTER_KEY_FILE = path.join(homedir(), ".wtf-gameshow", "platform-keyring-master.key");
const DEFAULT_CREATOR_WALLET_ID = "wtf-os-root";
const DEFAULT_COLLECTOR_WALLET_ID = "arcade-treasury";
const MIN_PREFLIGHT_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_E2E_MIN_BALANCE_MUTEZ || "500000",
);
const { PlatformWalletKeyring } = keyringModule as any;
const REPORT_PATH = path.join(
  root,
  ".agents",
  "docs",
  "archive",
  "contracts",
  "pasta-protocol",
  "shadownet-spaghetti-e2e-report.md",
);
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);

type ProofStatus = "BLOCKED" | "FAILED" | "PASSED";

type RpcProbe = {
  rpcUrl: string;
  chainId: string;
};

class ProofBlocked extends Error {
  constructor(
    message: string,
    readonly lines: string[],
  ) {
    super(message);
    this.name = "ProofBlocked";
  }
}

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
  console.log(`[pasta-shadownet-e2e] ok: ${message}`);
}

function block(message: string, details: string[]): never {
  throw new ProofBlocked(message, ["## Blocker", "", ...details]);
}

async function writeReport(
  status: ProofStatus,
  lines: string[],
  context: { rpcUrl?: string } = {},
): Promise<void> {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(
    REPORT_PATH,
    [
      "# Pasta Protocol Spaghetti Shadownet E2E Report",
      "",
      `- Status: ${status}`,
      `- Timestamp: ${nowIso()}`,
      `- RPC: ${normalizeBase(context.rpcUrl || reportRpcUrl)}`,
      `- TzKT API: ${normalizeBase(SHADOWNET_TZKT_API)}`,
      "",
      ...lines,
      "",
    ].join("\n"),
  );
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-shadownet-e2e" },
  });
  return { status: response.status, text: await response.text() };
}

async function fetchJson(url: string): Promise<{ status: number; json: any; text: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-shadownet-e2e" },
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
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
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
  let value = "";
  try {
    value = (await readFile(file, "utf8")).trim();
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      block("platform keyring master key file is missing", [
        `Expected keyring master key file: \`${file}\`.`,
        "Set `WTF_PLATFORM_KEYRING_MASTER_KEY` or `WTF_PLATFORM_KEYRING_MASTER_KEY_FILE`, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
      ]);
    }
    throw error;
  }

  if (value.length < 24) {
    block("platform keyring master key is too short", [
      `Loaded keyring master key from \`${file}\`, but it does not meet the platform keyring length requirement.`,
      "Provide the correct keyring master key, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  return value;
}

async function signerEnv(rpcUrl: string): Promise<SignerEnv> {
  return {
    WTF_OPERATOR_SIGNER_RPC: rpcUrl,
    WTF_OPERATOR_SIGNER_SOCKET: process.env.WTF_OPERATOR_SIGNER_SOCKET || "/tmp/wtf-pasta-shadownet-e2e.sock",
    WTF_OPERATOR_SIGNER_AUTH_TOKEN: process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN || "local-pasta-shadownet-e2e",
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
    WTF_OPERATOR_SIGNER_AUDIT_LOG: process.env.WTF_OPERATOR_SIGNER_AUDIT_LOG || "/tmp/wtf-pasta-shadownet-e2e-audit.log",
  };
}

function buildToolkit(signer: InMemorySigner, rpcUrl: string): TezosToolkit {
  const tezos = new TezosToolkit(rpcUrl);
  tezos.setProvider({ signer });
  return tezos;
}

async function assertShadownet(tezos: TezosToolkit, stage: string): Promise<void> {
  const chainId = await tezos.rpc.getChainId();
  assert.equal(chainId, SHADOWNET_CHAIN_ID, `${stage} RPC returned unexpected chain id ${chainId}`);
}

async function readContractArtifact(): Promise<unknown[]> {
  const artifact = path.join(
    root,
    "public",
    "creation-tools",
    "spaghetti",
    "contract",
    "pasta-standard-collection.contract.json",
  );
  const code = JSON.parse(await readFile(artifact, "utf8"));
  assert.ok(Array.isArray(code), "Spaghetti contract artifact should be Michelson JSON array");
  return code;
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
    collection_group: `spaghetti-shadownet-e2e-${Date.now().toString(36)}`,
  };
  const pkg = buildCollectionPackage({
    targetApp: "spaghetti",
    title: "Spaghetti Shadownet E2E",
    description: "Signer-backed Pasta Protocol Shadownet deployment proof.",
    symbol: "SPGE2E",
    relationship,
    items: [
      {
        name: "Spaghetti Proof Token",
        description: "Minted by the Pasta Protocol signer-backed Shadownet proof.",
        artifactUri: "data:text/plain;base64,U3BhZ2hldHRpIFNoYWRvd25ldCBwcm9vZiBhcnRpZmFjdA==",
        mimeType: "text/plain",
        tags: ["spaghetti", "shadownet", "e2e"],
      },
    ],
  });
  const validation = validateCheasePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join("; "));

  const collectionMetadata = buildCollectionMetadata({
    name: pkg.title,
    description: pkg.description,
    symbol: pkg.symbol,
    relationship: pkg.relationship,
  });
  const tokenMetadata = buildTokenMetadata({
    name: pkg.items[0].name,
    description: pkg.items[0].description,
    symbol: pkg.symbol,
    artifactUri: pkg.items[0].artifactUri,
    mimeType: pkg.items[0].mimeType,
    creators: [creator],
    minter: creator,
    tags: pkg.items[0].tags,
    relationship: pkg.relationship,
  });
  assert.deepEqual(extractRelationshipMetadata(collectionMetadata), relationship);
  assert.deepEqual(extractRelationshipMetadata(tokenMetadata), relationship);
  return {
    relationship,
    package: pkg,
    collectionMetadata,
    tokenMetadata,
    collectionMetadataUri: dataJsonUri(collectionMetadata),
    tokenMetadataUri: dataJsonUri(tokenMetadata),
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

async function loadSignerPair(env: SignerEnv) {
  const keyring = new PlatformWalletKeyring(env);
  const creatorWalletId = process.env.PASTA_SHADOWNET_CREATOR_WALLET_ID || DEFAULT_CREATOR_WALLET_ID;
  const collectorWalletId = process.env.PASTA_SHADOWNET_COLLECTOR_WALLET_ID || DEFAULT_COLLECTOR_WALLET_ID;
  try {
    const { wallet: creator, signer } = await keyring.getSigner(creatorWalletId);
    const { wallet: collector } = await keyring.getSigner(collectorWalletId);
    assert.equal(creator.network, "shadownet", `creator wallet ${creator.id} is not Shadownet`);
    assert.equal(collector.network, "shadownet", `collector wallet ${collector.id} is not Shadownet`);
    return { creator, signer, collector };
  } catch (error) {
    block("platform keyring signer is unavailable", [
      `Creator wallet id: \`${creatorWalletId}\`.`,
      `Collector wallet id: \`${collectorWalletId}\`.`,
      `Keyring path: \`${env.WTF_PLATFORM_KEYRING_PATH}\`.`,
      `Reason: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

async function main(): Promise<void> {
  if (process.env.PASTA_SHADOWNET_E2E_EXECUTE !== "1") {
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof originates a real Shadownet contract and spends test tez.",
    ]);
  }
  if ((process.env.TEZOS_NETWORK || "shadownet") === "mainnet") {
    throw new Error("Refusing to run Pasta Shadownet E2E with TEZOS_NETWORK=mainnet");
  }

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const env = await signerEnv(rpc.rpcUrl);
  const { creator, signer, collector } = await loadSignerPair(env);
  const tezos = buildToolkit(signer, rpc.rpcUrl);
  await assertShadownet(tezos, "startup");

  const balance = await tezos.tz.getBalance(creator.address);
  const balanceMutez = Number(balance.toString());
  if (balanceMutez < MIN_PREFLIGHT_BALANCE_MUTEZ) {
    block("creator wallet has insufficient Shadownet balance", [
      `Creator \`${creator.address}\` has only \`${balance.toString()}\` mutez on Shadownet.`,
      "Fund the signer with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  ok(`creator ${creator.address} has ${balance.toString()} mutez`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "standard_collection");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "transfer"));

  const metadata = buildMetadata(creator.address);
  const storage = buildOriginationStorage(creator.address, metadata.collectionMetadataUri);
  const originationEstimate = await tezos.estimate.originate({ code, storage } as any);
  const estimatedOriginationMutez =
    Number(originationEstimate.suggestedFeeMutez) + Number(originationEstimate.burnFeeMutez);
  const requiredBalanceMutez = estimatedOriginationMutez + 1_000_000;
  if (balanceMutez < requiredBalanceMutez) {
    block("creator wallet balance cannot cover estimated Shadownet proof operations", [
      `Creator \`${creator.address}\` has \`${balance.toString()}\` mutez.`,
      `Origination estimate requires fee/burn near \`${estimatedOriginationMutez}\` mutez before create/mint/transfer fees.`,
      "Fund the signer with more Shadownet test tez, then rerun.",
    ]);
  }
  ok(
    `origination estimate fee=${originationEstimate.suggestedFeeMutez} burn=${originationEstimate.burnFeeMutez} storage=${originationEstimate.storageLimit}`,
  );

  await assertShadownet(tezos, "before origination");
  const originate = await tezos.contract.originate({ code, storage } as any);
  await originate.confirmation(1);
  const originated = await originate.contract();
  ok(`originated ${originated.address} with ${originate.hash}`);

  await assertShadownet(tezos, "before create_token");
  const contract = await tezos.contract.at(originated.address);
  const tokenInfo = buildTokenInfo(metadata.tokenMetadataUri);
  const createToken = await contract.methodsObject.create_token(tokenInfo).send();
  await createToken.confirmation(1);
  ok(`created token 0 with ${createToken.hash}`);

  await assertShadownet(tezos, "before mint");
  const mint = await contract.methodsObject
    .mint({ to_: creator.address, token_id: 0, amount: 2 })
    .send();
  await mint.confirmation(1);
  ok(`minted token 0 supply with ${mint.hash}`);

  await assertShadownet(tezos, "before transfer");
  const transfer = await contract.methodsObject
    .transfer([
      {
        from_: creator.address,
        txs: [{ to_: collector.address, token_id: 0, amount: 1 }],
      },
    ])
    .send();
  await transfer.confirmation(1);
  ok(`transferred token 0 to collector with ${transfer.hash}`);

  const storageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${encodeURIComponent(originated.address)}/storage`;
  const indexedStorage = await pollJson(
    "contract storage",
    storageUrl,
    (json) => Number(json?.ledger) > 0 && Number(json?.token_metadata) > 0 && Number(json?.total_supply) > 0,
  );
  const ledgerUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.ledger}/keys?limit=100`;
  const ledgerKeys = await pollJson(
    "collector ledger big map key",
    ledgerUrl,
    (json) =>
      Array.isArray(json) &&
      json.some(
        (entry) =>
          entry?.key?.owner === collector.address &&
          String(entry?.key?.token_id) === "0" &&
          Number(entry?.value || 0) >= 1,
      ),
  );
  const collectorLedgerEntry = ledgerKeys.find(
    (entry: any) => entry?.key?.owner === collector.address && String(entry?.key?.token_id) === "0",
  );
  const tokenMetadataUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.token_metadata}/keys?limit=100`;
  const tokenMetadataKeys = await pollJson(
    "token metadata big map key",
    tokenMetadataUrl,
    (json) => Array.isArray(json) && json.some((entry) => String(entry?.key) === "0"),
  );
  const tokenMetadataEntry = tokenMetadataKeys.find((entry: any) => String(entry?.key) === "0");
  const indexedTokenUri = hexToUtf8(String(tokenMetadataEntry?.value?.token_info?.[""] || ""));
  const indexedTokenMetadata = parseDataJsonUri(indexedTokenUri) as any;
  assert.equal(indexedTokenMetadata.name, metadata.package.items[0].name);
  assert.deepEqual(extractRelationshipMetadata(indexedTokenMetadata), metadata.relationship);

  await writeReport(
    "PASSED",
    [
      "## Result",
      "",
      "- Signer-backed Spaghetti Shadownet deploy/mint/collect proof passed.",
      `- Creator wallet: \`${creator.id}\` / \`${creator.address}\``,
      `- Collector wallet: \`${collector.id}\` / \`${collector.address}\``,
      `- Contract: \`${originated.address}\``,
      `- Explorer: https://shadownet.tzkt.io/${originated.address}`,
      "",
      "## Operations",
      "",
      `- Origination: \`${originate.hash}\``,
      `- Create token: \`${createToken.hash}\``,
      `- Mint: \`${mint.hash}\``,
      `- Transfer/collect: \`${transfer.hash}\``,
      "",
      "## Indexed Proof",
      "",
      `- Contract storage indexed ledger big map \`${indexedStorage.ledger}\` and token_metadata big map \`${indexedStorage.token_metadata}\`.`,
      `- Collector ledger big-map entry returned balance \`${collectorLedgerEntry?.value}\` for token 0.`,
      `- Token metadata big-map entry decoded to \`${indexedTokenMetadata.name}\` with relationship metadata intact.`,
      `- Relationship group: \`${metadata.relationship.collection_group}\``,
      "",
      "## Scope",
      "",
      "- This proves signer-backed Shadownet origination, token creation, mint, transfer/collect, and TzKT ownership resolution for Spaghetti standard collections.",
      "- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander discovery, or every Pasta publisher variant.",
    ],
    { rpcUrl: rpc.rpcUrl },
  );
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
  console.error(`[pasta-shadownet-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
