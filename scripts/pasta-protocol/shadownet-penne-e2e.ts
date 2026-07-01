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
  totalAllocation,
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
  "shadownet-penne-e2e-report.md",
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
  console.log(`[pasta-shadownet-penne-e2e] ok: ${message}`);
}

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(
    REPORT_PATH,
    [
      "# Pasta Protocol Penne Shadownet E2E Report",
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
    headers: { "user-agent": "wtfos-pasta-shadownet-penne-e2e" },
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
    WTF_OPERATOR_SIGNER_SOCKET: process.env.WTF_OPERATOR_SIGNER_SOCKET || "/tmp/wtf-pasta-shadownet-penne-e2e.sock",
    WTF_OPERATOR_SIGNER_AUTH_TOKEN: process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN || "local-pasta-shadownet-penne-e2e",
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
    WTF_OPERATOR_SIGNER_AUDIT_LOG: process.env.WTF_OPERATOR_SIGNER_AUDIT_LOG || "/tmp/wtf-pasta-shadownet-penne-e2e-audit.log",
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
    "penne",
    "contract",
    "pasta-distribution.contract.json",
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
    collection_group: `penne-shadownet-e2e-${Date.now().toString(36)}`,
  };
  const allocations = [
    { recipient: "collector", amount: 2 },
    { recipient: "creator", amount: 3 },
  ];
  const pkg = buildCollectionPackage({
    targetApp: "penne",
    title: "Penne Shadownet E2E",
    description: "Signer-backed Pasta Protocol distribution Shadownet deployment proof.",
    symbol: "PNNE2E",
    relationship,
    items: [
      {
        name: "Penne Proof Distribution Token",
        description: "Distributed by the Pasta Protocol signer-backed Shadownet proof.",
        artifactUri: "data:text/plain;base64,UGVubmUgU2hhZG93bmV0IGRpc3RyaWJ1dGlvbiBwcm9vZg==",
        mimeType: "text/plain",
        tags: ["penne", "distribution", "claim", "airdrop", "shadownet", "e2e"],
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
    extra: { penne: { allocationCount: allocations.length } },
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
    extra: {
      penne: {
        distributionModes: ["claim", "airdrop"],
        plannedAllocationTotal: totalAllocation(allocations),
      },
    },
  });
  assert.deepEqual(extractRelationshipMetadata(collectionMetadata), relationship);
  assert.deepEqual(extractRelationshipMetadata(tokenMetadata), relationship);
  return {
    relationship,
    allocations,
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
    allocations: new MichelsonMap(),
    claimed: new MichelsonMap(),
    claim_active: false,
    claim_start: null,
    claim_end: null,
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
    throw new Error("Refusing to run Pasta Penne Shadownet E2E with TEZOS_NETWORK=mainnet");
  }

  const env = await signerEnv();
  const keyring = new PlatformWalletKeyring(env);
  const creatorWalletId = process.env.PASTA_SHADOWNET_CREATOR_WALLET_ID || DEFAULT_CREATOR_WALLET_ID;
  const collectorWalletId = process.env.PASTA_SHADOWNET_COLLECTOR_WALLET_ID || DEFAULT_COLLECTOR_WALLET_ID;
  const { wallet: creator, signer: creatorSigner } = await keyring.getSigner(creatorWalletId);
  const { wallet: collector, signer: collectorSigner } = await keyring.getSigner(collectorWalletId);
  assert.equal(creator.network, "shadownet", `creator wallet ${creator.id} is not Shadownet`);
  assert.equal(collector.network, "shadownet", `collector wallet ${collector.id} is not Shadownet`);

  const creatorTezos = buildToolkit(creatorSigner);
  const collectorTezos = buildToolkit(collectorSigner);
  const chainId = await creatorTezos.rpc.getChainId();
  assert.equal(chainId, SHADOWNET_CHAIN_ID);
  ok(`RPC ${normalizeBase(SHADOWNET_RPC)} returned ${chainId}`);

  const creatorBalance = await creatorTezos.tz.getBalance(creator.address);
  const collectorBalance = await collectorTezos.tz.getBalance(collector.address);
  if (creatorBalance.toNumber() < 3_000_000 || collectorBalance.toNumber() < 250_000) {
    await writeReport("BLOCKED", [
      "## Blocker",
      "",
      `Creator ${creator.address} has ${creatorBalance.toString()} mutez on Shadownet.`,
      `Collector ${collector.address} has ${collectorBalance.toString()} mutez on Shadownet.`,
      "Fund both signer wallets with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
    console.error("BLOCKED: creator or collector has insufficient Shadownet balance");
    process.exitCode = 2;
    return;
  }
  ok(`creator ${creator.address} has ${creatorBalance.toString()} mutez`);
  ok(`collector ${collector.address} has ${collectorBalance.toString()} mutez`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "distribution");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "open_claim"));
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "airdrop"));

  const metadata = buildMetadata(creator.address);
  const storage = buildOriginationStorage(creator.address, metadata.collectionMetadataUri);
  const originationEstimate = await creatorTezos.estimate.originate({ code, storage } as any);
  ok(
    `origination estimate fee=${originationEstimate.suggestedFeeMutez} burn=${originationEstimate.burnFeeMutez} storage=${originationEstimate.storageLimit}`,
  );

  const originate = await creatorTezos.contract.originate({ code, storage } as any);
  await originate.confirmation(1);
  const originated = await originate.contract();
  ok(`originated ${originated.address} with ${originate.hash}`);

  const contract = await creatorTezos.contract.at(originated.address);
  const tokenInfo = buildTokenInfo(metadata.tokenMetadataUri);
  const createToken = await contract.methodsObject.create_token(tokenInfo).send();
  await createToken.confirmation(1);
  ok(`created distribution token 0 with ${createToken.hash}`);

  const allocations = [
    { recipient: collector.address, token_id: 0, amount: metadata.allocations[0].amount },
    { recipient: creator.address, token_id: 0, amount: metadata.allocations[1].amount },
  ];
  const setAllocations = await contract.methodsObject.set_allocations(allocations).send();
  await setAllocations.confirmation(1);
  ok(`loaded distribution allocations with ${setAllocations.hash}`);

  const openClaim = await contract.methodsObject
    .open_claim({ active: true, start: null, end: null })
    .send();
  await openClaim.confirmation(1);
  ok(`opened claim window with ${openClaim.hash}`);

  const collectorContract = await collectorTezos.contract.at(originated.address);
  const claim = await collectorContract.methodsObject.claim(0).send();
  await claim.confirmation(1);
  ok(`collector claimed token 0 allocation with ${claim.hash}`);

  const airdrop = await contract.methodsObject
    .airdrop([{ recipient: creator.address, token_id: 0 }])
    .send();
  await airdrop.confirmation(1);
  ok(`admin airdropped remaining allocation with ${airdrop.hash}`);

  const closeClaim = await contract.methodsObject
    .open_claim({ active: false, start: null, end: null })
    .send();
  await closeClaim.confirmation(1);
  ok(`closed claim window with ${closeClaim.hash}`);

  const storageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${encodeURIComponent(originated.address)}/storage`;
  const indexedStorage = await pollJson(
    "contract storage",
    storageUrl,
    (json) =>
      Number(json?.ledger) > 0 &&
      Number(json?.token_metadata) > 0 &&
      Number(json?.total_supply) > 0 &&
      Number(json?.allocations) > 0 &&
      Number(json?.claimed) > 0 &&
      json?.claim_active === false,
  );
  const ledgerUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.ledger}/keys?limit=100`;
  const ledgerKeys = await pollJson(
    "ledger big map keys",
    ledgerUrl,
    (json) =>
      Array.isArray(json) &&
      json.some(
        (entry) =>
          entry?.key?.owner === collector.address &&
          String(entry?.key?.token_id) === "0" &&
          Number(entry?.value || 0) >= metadata.allocations[0].amount,
      ) &&
      json.some(
        (entry) =>
          entry?.key?.owner === creator.address &&
          String(entry?.key?.token_id) === "0" &&
          Number(entry?.value || 0) >= metadata.allocations[1].amount,
      ),
  );
  const collectorLedgerEntry = ledgerKeys.find(
    (entry: any) => entry?.key?.owner === collector.address && String(entry?.key?.token_id) === "0",
  );
  const creatorLedgerEntry = ledgerKeys.find(
    (entry: any) => entry?.key?.owner === creator.address && String(entry?.key?.token_id) === "0",
  );

  const totalSupplyUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.total_supply}/keys?limit=100`;
  const expectedSupply = totalAllocation(allocations);
  const totalSupplyKeys = await pollJson(
    "total supply big map key",
    totalSupplyUrl,
    (json) => Array.isArray(json) && json.some((entry) => String(entry?.key) === "0" && Number(entry?.value || 0) >= expectedSupply),
  );
  const totalSupplyEntry = totalSupplyKeys.find((entry: any) => String(entry?.key) === "0");

  const claimedUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.claimed}/keys?limit=100`;
  const claimedKeys = await pollJson(
    "claimed big map keys",
    claimedUrl,
    (json) =>
      Array.isArray(json) &&
      json.some(
        (entry) =>
          entry?.key?.owner === collector.address &&
          String(entry?.key?.token_id) === "0" &&
          Number(entry?.value || 0) >= metadata.allocations[0].amount,
      ) &&
      json.some(
        (entry) =>
          entry?.key?.owner === creator.address &&
          String(entry?.key?.token_id) === "0" &&
          Number(entry?.value || 0) >= metadata.allocations[1].amount,
      ),
  );
  const collectorClaimedEntry = claimedKeys.find(
    (entry: any) => entry?.key?.owner === collector.address && String(entry?.key?.token_id) === "0",
  );
  const creatorClaimedEntry = claimedKeys.find(
    (entry: any) => entry?.key?.owner === creator.address && String(entry?.key?.token_id) === "0",
  );

  const allocationUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.allocations}/keys?limit=100`;
  const allocationKeys = await pollJson(
    "cleared allocation big map keys",
    allocationUrl,
    (json) =>
      Array.isArray(json) &&
      !json.some(
        (entry) =>
          entry?.active !== false &&
          (entry?.key?.owner === collector.address || entry?.key?.owner === creator.address) &&
          String(entry?.key?.token_id) === "0" &&
          Number(entry?.value || 0) > 0,
      ),
    { attempts: 10, delayMs: 4_000 },
  );
  assert.ok(Array.isArray(allocationKeys));

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
  assert.deepEqual(indexedTokenMetadata.penne?.distributionModes, ["claim", "airdrop"]);

  await writeReport("PASSED", [
    "## Result",
    "",
    "- Signer-backed Penne Shadownet distribution deploy/configure/claim/airdrop proof passed.",
    `- Creator wallet: \`${creator.id}\` / \`${creator.address}\``,
    `- Collector wallet: \`${collector.id}\` / \`${collector.address}\``,
    `- Contract: \`${originated.address}\``,
    `- Explorer: https://shadownet.tzkt.io/${originated.address}`,
    "",
    "## Operations",
    "",
    `- Origination: \`${originate.hash}\``,
    `- Create distribution token: \`${createToken.hash}\``,
    `- Set allocations: \`${setAllocations.hash}\``,
    `- Open claim: \`${openClaim.hash}\``,
    `- Collector claim: \`${claim.hash}\``,
    `- Admin airdrop: \`${airdrop.hash}\``,
    `- Close claim: \`${closeClaim.hash}\``,
    "",
    "## Indexed Proof",
    "",
    `- Contract storage indexed ledger big map \`${indexedStorage.ledger}\`, token_metadata big map \`${indexedStorage.token_metadata}\`, total_supply big map \`${indexedStorage.total_supply}\`, allocations big map \`${indexedStorage.allocations}\`, and claimed big map \`${indexedStorage.claimed}\`.`,
    `- Collector ledger big-map entry returned balance \`${collectorLedgerEntry?.value}\` after pull claim.`,
    `- Creator ledger big-map entry returned balance \`${creatorLedgerEntry?.value}\` after admin airdrop.`,
    `- Total supply big-map entry returned \`${totalSupplyEntry?.value}\` for token 0.`,
    `- Claimed big-map entries returned collector=\`${collectorClaimedEntry?.value}\` and creator=\`${creatorClaimedEntry?.value}\`; active allocations were cleared for both recipients.`,
    `- Final claim window active state: \`${indexedStorage.claim_active}\`.`,
    `- Token metadata big-map entry decoded to \`${indexedTokenMetadata.name}\` with relationship metadata and distribution modes intact.`,
    `- Relationship group: \`${metadata.relationship.collection_group}\``,
    "",
    "## Scope",
    "",
    "- This proves signer-backed Shadownet origination, token creation, allocation loading, claim-window configuration, recipient pull claim, admin push airdrop, allocation consumption, supply, ownership, claimed-state, and metadata resolution for Penne distributions.",
    "- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, browser wallet batching, failure recovery, or every Pasta publisher variant.",
  ]);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  await writeReport("FAILED", ["## Error", "", "```", message, "```"]).catch(() => undefined);
  console.error(`[pasta-shadownet-penne-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
