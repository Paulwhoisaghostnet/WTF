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
  buildExhibitionMetadata,
  detectPastaContract,
  extractRelationshipMetadata,
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
  "shadownet-lasagna-e2e-report.md",
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

function hexToUtf8(hex: string): string {
  return Buffer.from(hex, "hex").toString("utf8");
}

function dataJsonUri(value: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(value), "utf8").toString("base64")}`;
}

function parseDataJsonUri(uri: string): unknown {
  const match = uri.match(/^data:application\/json;base64,(.+)$/);
  if (!match) throw new Error(`unsupported metadata URI: ${uri.slice(0, 80)}`);
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

function ok(message: string): void {
  console.log(`[pasta-shadownet-lasagna-e2e] ok: ${message}`);
}

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(
    REPORT_PATH,
    [
      "# Pasta Protocol Lasagna Shadownet E2E Report",
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
    headers: { "user-agent": "wtfos-pasta-shadownet-lasagna-e2e" },
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
    WTF_OPERATOR_SIGNER_SOCKET: process.env.WTF_OPERATOR_SIGNER_SOCKET || "/tmp/wtf-pasta-shadownet-lasagna-e2e.sock",
    WTF_OPERATOR_SIGNER_AUTH_TOKEN: process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN || "local-pasta-shadownet-lasagna-e2e",
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
    WTF_OPERATOR_SIGNER_AUDIT_LOG: process.env.WTF_OPERATOR_SIGNER_AUDIT_LOG || "/tmp/wtf-pasta-shadownet-lasagna-e2e-audit.log",
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
    "lasagna",
    "contract",
    "pasta-exhibition.contract.json",
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

function buildMetadata(creator: string, curator: string) {
  const relationship = {
    parent_contract: "KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH",
    collection_group: `lasagna-shadownet-e2e-${Date.now().toString(36)}`,
  };
  const pkg = buildCollectionPackage({
    targetApp: "lasagna",
    title: "Lasagna Shadownet E2E",
    description: "Signer-backed Pasta Protocol exhibition registry Shadownet deployment proof.",
    symbol: "LSGE2E",
    relationship,
    items: [
      {
        name: "Spaghetti Proof Token Reference",
        description: "Reference to the proven Spaghetti Shadownet token.",
        artifactUri: "data:text/plain;base64,TGFzYWduYSByZWZlcmVuY2UgU3BhZ2hldHRp",
        mimeType: "text/plain",
        tokenMetadata: { contract: "KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH", tokenId: 0 },
        tags: ["lasagna", "exhibition", "spaghetti", "shadownet", "e2e"],
      },
      {
        name: "Gnocchi Proof Open Edition Reference",
        description: "Reference to the proven Gnocchi Shadownet token.",
        artifactUri: "data:text/plain;base64,TGFzYWduYSByZWZlcmVuY2UgR25vY2NoaQ==",
        mimeType: "text/plain",
        tokenMetadata: { contract: "KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax", tokenId: 0 },
        tags: ["lasagna", "exhibition", "gnocchi", "shadownet", "e2e"],
      },
      {
        name: "Ravioli Proof Bundle Reference",
        description: "Reference to the proven Ravioli Shadownet bundle.",
        artifactUri: "data:text/plain;base64,TGFzYWduYSByZWZlcmVuY2UgUmF2aW9saQ==",
        mimeType: "text/plain",
        tokenMetadata: { contract: "KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG", tokenId: 0 },
        tags: ["lasagna", "exhibition", "ravioli", "shadownet", "e2e"],
      },
    ],
  });
  const validation = validateCheasePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join("; "));

  const collectionMetadata = buildCollectionMetadata({
    name: pkg.title,
    description: pkg.description,
    symbol: pkg.symbol,
    interfaces: ["TZIP-016", "TZIP-021"],
    relationship: pkg.relationship,
    extra: { lasagna: { curatorCount: 2, revisionPlan: "publish-two-and-rollback-current" } },
  });
  assert.deepEqual(extractRelationshipMetadata(collectionMetadata), relationship);

  const revision0Items = [
    { contract: "KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH", token_id: 0 },
    { contract: "KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax", token_id: 0 },
  ];
  const revision1Items = [
    { contract: "KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG", token_id: 0 },
    { contract: "KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz", token_id: 1 },
    { contract: "KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx", token_id: 0 },
  ];
  const revision0Metadata = buildExhibitionMetadata({
    name: "Lasagna Proof Revision Zero",
    description: "Initial cross-Pasta exhibition revision.",
    statement: "Curated by the secondary signer to prove curator-driven publication.",
    curators: [curator],
    items: revision0Items,
    revision: 0,
  });
  const revision1Metadata = buildExhibitionMetadata({
    name: "Lasagna Proof Revision One",
    description: "Second cross-Pasta exhibition revision.",
    statement: "Curated by the administrator to prove append-only revision history.",
    curators: [creator],
    items: revision1Items,
    revision: 1,
  });

  return {
    relationship,
    package: pkg,
    collectionMetadata,
    collectionMetadataUri: dataJsonUri(collectionMetadata),
    revision0Items,
    revision1Items,
    revision0Metadata,
    revision1Metadata,
    revision0MetadataUri: dataJsonUri(revision0Metadata),
    revision1MetadataUri: dataJsonUri(revision1Metadata),
  };
}

function buildOriginationStorage(admin: string, collectionMetadataUri: string) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(collectionMetadataUri));
  return {
    administrator: admin,
    pending_administrator: null,
    metadata,
    curators: new MichelsonMap(),
    revisions: new MichelsonMap(),
    revision_count: 0,
    current_revision: null,
  };
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
    throw new Error("Refusing to run Pasta Lasagna Shadownet E2E with TEZOS_NETWORK=mainnet");
  }

  const env = await signerEnv();
  const keyring = new PlatformWalletKeyring(env);
  const creatorWalletId = process.env.PASTA_SHADOWNET_CREATOR_WALLET_ID || DEFAULT_CREATOR_WALLET_ID;
  const curatorWalletId = process.env.PASTA_SHADOWNET_COLLECTOR_WALLET_ID || DEFAULT_COLLECTOR_WALLET_ID;
  const { wallet: creator, signer: creatorSigner } = await keyring.getSigner(creatorWalletId);
  const { wallet: curator, signer: curatorSigner } = await keyring.getSigner(curatorWalletId);
  assert.equal(creator.network, "shadownet", `creator wallet ${creator.id} is not Shadownet`);
  assert.equal(curator.network, "shadownet", `curator wallet ${curator.id} is not Shadownet`);

  const creatorTezos = buildToolkit(creatorSigner);
  const curatorTezos = buildToolkit(curatorSigner);
  const chainId = await creatorTezos.rpc.getChainId();
  assert.equal(chainId, SHADOWNET_CHAIN_ID);
  ok(`RPC ${normalizeBase(SHADOWNET_RPC)} returned ${chainId}`);

  const creatorBalance = await creatorTezos.tz.getBalance(creator.address);
  const curatorBalance = await curatorTezos.tz.getBalance(curator.address);
  if (creatorBalance.toNumber() < 2_000_000 || curatorBalance.toNumber() < 350_000) {
    await writeReport("BLOCKED", [
      "## Blocker",
      "",
      `Creator ${creator.address} has ${creatorBalance.toString()} mutez on Shadownet.`,
      `Curator ${curator.address} has ${curatorBalance.toString()} mutez on Shadownet.`,
      "Fund both signer wallets with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
    console.error("BLOCKED: creator or curator has insufficient Shadownet balance");
    process.exitCode = 2;
    return;
  }
  ok(`creator ${creator.address} has ${creatorBalance.toString()} mutez`);
  ok(`curator ${curator.address} has ${curatorBalance.toString()} mutez`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "exhibition");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "publish_revision"));
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "set_current_revision"));

  const metadata = buildMetadata(creator.address, curator.address);
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
  const addCurator = await contract.methodsObject.add_curator(curator.address).send();
  await addCurator.confirmation(1);
  ok(`added curator with ${addCurator.hash}`);

  const curatorContract = await curatorTezos.contract.at(originated.address);
  const publishRevision0 = await curatorContract.methodsObject
    .publish_revision({
      metadata_uri: utf8ToHex(metadata.revision0MetadataUri),
      items: metadata.revision0Items,
    })
    .send();
  await publishRevision0.confirmation(1);
  ok(`curator published revision 0 with ${publishRevision0.hash}`);

  const publishRevision1 = await contract.methodsObject
    .publish_revision({
      metadata_uri: utf8ToHex(metadata.revision1MetadataUri),
      items: metadata.revision1Items,
    })
    .send();
  await publishRevision1.confirmation(1);
  ok(`administrator published revision 1 with ${publishRevision1.hash}`);

  const setCurrent = await curatorContract.methodsObject.set_current_revision(0).send();
  await setCurrent.confirmation(1);
  ok(`set current revision back to 0 with ${setCurrent.hash}`);

  const removeCurator = await contract.methodsObject.remove_curator(curator.address).send();
  await removeCurator.confirmation(1);
  ok(`removed curator with ${removeCurator.hash}`);

  const transferAdmin = await contract.methodsObject.transfer_administration(curator.address).send();
  await transferAdmin.confirmation(1);
  ok(`transferred pending administration with ${transferAdmin.hash}`);

  const acceptAdmin = await curatorContract.methodsObject.accept_administration().send();
  await acceptAdmin.confirmation(1);
  ok(`curator accepted administration with ${acceptAdmin.hash}`);

  const storageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${encodeURIComponent(originated.address)}/storage`;
  const indexedStorage = await pollJson(
    "contract storage",
    storageUrl,
    (json) =>
      Number(json?.curators) > 0 &&
      Number(json?.metadata) > 0 &&
      Number(json?.revisions) > 0 &&
      Number(json?.revision_count) === 2 &&
      String(json?.current_revision) === "0" &&
      json?.administrator === curator.address &&
      json?.pending_administrator === null,
  );

  const metadataUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.metadata}/keys?limit=100`;
  const metadataKeys = await pollJson(
    "contract metadata big map key",
    metadataUrl,
    (json) => Array.isArray(json) && json.some((entry) => entry?.key === ""),
  );
  const metadataEntry = metadataKeys.find((entry: any) => entry?.key === "");
  const indexedMetadataUri = hexToUtf8(String(metadataEntry?.value || ""));
  const indexedCollectionMetadata = parseDataJsonUri(indexedMetadataUri) as any;
  assert.equal(indexedCollectionMetadata.name, metadata.package.title);
  assert.deepEqual(extractRelationshipMetadata(indexedCollectionMetadata), metadata.relationship);
  assert.equal(indexedCollectionMetadata.lasagna?.revisionPlan, "publish-two-and-rollback-current");

  const revisionsUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.revisions}/keys?limit=100`;
  const revisionKeys = await pollJson(
    "revision big map keys",
    revisionsUrl,
    (json) =>
      Array.isArray(json) &&
      json.some(
        (entry) =>
          String(entry?.key) === "0" &&
          entry?.value?.curator === curator.address &&
          Array.isArray(entry?.value?.items) &&
          entry.value.items.length === metadata.revision0Items.length,
      ) &&
      json.some(
        (entry) =>
          String(entry?.key) === "1" &&
          entry?.value?.curator === creator.address &&
          Array.isArray(entry?.value?.items) &&
          entry.value.items.length === metadata.revision1Items.length,
      ),
  );
  const revision0Entry = revisionKeys.find((entry: any) => String(entry?.key) === "0");
  const revision1Entry = revisionKeys.find((entry: any) => String(entry?.key) === "1");
  const indexedRevision0Metadata = parseDataJsonUri(hexToUtf8(String(revision0Entry?.value?.metadata_uri || ""))) as any;
  const indexedRevision1Metadata = parseDataJsonUri(hexToUtf8(String(revision1Entry?.value?.metadata_uri || ""))) as any;
  assert.equal(indexedRevision0Metadata.exhibition?.itemCount, metadata.revision0Items.length);
  assert.equal(indexedRevision0Metadata.exhibition?.revision, 0);
  assert.equal(indexedRevision1Metadata.exhibition?.itemCount, metadata.revision1Items.length);
  assert.equal(indexedRevision1Metadata.exhibition?.revision, 1);

  const curatorUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.curators}/keys?limit=100`;
  const curatorKeys = await pollJson(
    "curator big map keys",
    curatorUrl,
    (json) => Array.isArray(json) && !json.some((entry) => entry?.active !== false && entry?.key === curator.address),
    { attempts: 10, delayMs: 4_000 },
  );
  assert.ok(Array.isArray(curatorKeys));

  await writeReport("PASSED", [
    "## Result",
    "",
    "- Signer-backed Lasagna Shadownet exhibition deploy/configure/revision/admin-handoff proof passed.",
    `- Creator wallet: \`${creator.id}\` / \`${creator.address}\``,
    `- Curator wallet: \`${curator.id}\` / \`${curator.address}\``,
    `- Contract: \`${originated.address}\``,
    `- Explorer: https://shadownet.tzkt.io/${originated.address}`,
    "",
    "## Operations",
    "",
    `- Origination: \`${originate.hash}\``,
    `- Add curator: \`${addCurator.hash}\``,
    `- Curator publish revision 0: \`${publishRevision0.hash}\``,
    `- Administrator publish revision 1: \`${publishRevision1.hash}\``,
    `- Set current revision to 0: \`${setCurrent.hash}\``,
    `- Remove curator: \`${removeCurator.hash}\``,
    `- Transfer administration: \`${transferAdmin.hash}\``,
    `- Accept administration: \`${acceptAdmin.hash}\``,
    "",
    "## Indexed Proof",
    "",
    `- Contract storage indexed metadata big map \`${indexedStorage.metadata}\`, curators big map \`${indexedStorage.curators}\`, and revisions big map \`${indexedStorage.revisions}\`.`,
    `- Final administrator: \`${indexedStorage.administrator}\`; pending administrator: \`${indexedStorage.pending_administrator}\`.`,
    `- Revision count: \`${indexedStorage.revision_count}\`; current revision pointer: \`${indexedStorage.current_revision}\`.`,
    `- Revision 0 curator \`${revision0Entry?.value?.curator}\` references \`${revision0Entry?.value?.items?.length}\` tokens and decodes to metadata revision \`${indexedRevision0Metadata.exhibition?.revision}\`.`,
    `- Revision 1 curator \`${revision1Entry?.value?.curator}\` references \`${revision1Entry?.value?.items?.length}\` tokens and decodes to metadata revision \`${indexedRevision1Metadata.exhibition?.revision}\`.`,
    "- The curator big map has no active entry for the removed curator after the admin handoff.",
    `- Contract metadata decoded to \`${indexedCollectionMetadata.name}\` with relationship metadata and Lasagna revision policy intact.`,
    `- Relationship group: \`${metadata.relationship.collection_group}\``,
    "",
    "## Scope",
    "",
    "- This proves signer-backed Shadownet origination, curator configuration, revision publication, current-revision rollback, curator removal, two-step administration transfer, referenced-token metadata resolution, and Colander adapter detection for Lasagna exhibitions.",
    "- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander browser action-state refresh, failure recovery, or mainnet readiness.",
  ]);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  await writeReport("FAILED", ["## Error", "", "```", message, "```"]).catch(() => undefined);
  console.error(`[pasta-shadownet-lasagna-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
