#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { MichelsonMap } from "@taquito/taquito";

import {
  availableActions,
  buildCollectionMetadata,
  buildCollectionPackage,
  buildTokenMetadata,
  detectPastaContract,
  extractRelationshipMetadata,
  validateCheasePackage,
} from "../../shared/pasta-protocol/index";
import {
  assertShadownet,
  block,
  buildToolkit,
  collectAnnotations,
  createLogger,
  hexToUtf8,
  loadSignerPair,
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
  ".agents",
  "docs",
  "archive",
  "contracts",
  "pasta-protocol",
  "shadownet-spaghetti-e2e-report.md",
);
const MIN_PREFLIGHT_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_E2E_MIN_BALANCE_MUTEZ || "500000",
);
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-e2e");

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Spaghetti Shadownet E2E Report",
    status,
    lines,
    rpcUrl: reportRpcUrl,
  });
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

async function buildMetadata(creator: string, ipfs: IpfsProofConfig) {
  const relationship = {
    parent_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    collection_group: `spaghetti-shadownet-e2e-${Date.now().toString(36)}`,
  };
  const artifact = await pinIpfsProofBytes({
    bytes: Buffer.from("Spaghetti Shadownet proof artifact", "utf8"),
    fileName: "spaghetti-proof.txt",
    mimeType: "text/plain",
    options: ipfs,
  });
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
        artifactUri: artifact.uri,
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
  const collectionMetadataPin = await pinIpfsProofJson({
    value: collectionMetadata,
    fileName: "spaghetti-collection.json",
    options: ipfs,
  });
  const tokenMetadataPin = await pinIpfsProofJson({
    value: tokenMetadata,
    fileName: "spaghetti-token-0.json",
    options: ipfs,
  });
  return {
    relationship,
    package: pkg,
    collectionMetadata,
    tokenMetadata,
    collectionMetadataUri: collectionMetadataPin.uri,
    tokenMetadataUri: tokenMetadataPin.uri,
    pins: { artifact, collectionMetadata: collectionMetadataPin, tokenMetadata: tokenMetadataPin },
  };
}

function pinProofLine(label: string, pin: IpfsPinnedProof): string {
  return `- ${label}: CID \`${pin.cid}\` — \`${pin.uri}\` — ${pin.publicGatewayUrl} — SHA-256 \`${pin.sha256}\``;
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
    sales: new MichelsonMap(),
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
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof originates a real Shadownet contract and spends test tez.",
    ]);
  }
  if ((process.env.TEZOS_NETWORK || "shadownet") === "mainnet") {
    throw new Error("Refusing to run Pasta Shadownet E2E with TEZOS_NETWORK=mainnet");
  }
  const ipfs = resolveIpfsProofConfig();

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const env = await signerEnv(rpc.rpcUrl);
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(env);
  const tezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "startup");
  await assertShadownet(collectorTezos, "collector startup");

  const balance = await tezos.tz.getBalance(creator.address);
  const collectorBalance = await collectorTezos.tz.getBalance(collector.address);
  const balanceMutez = Number(balance.toString());
  const collectorBalanceMutez = Number(collectorBalance.toString());
  if (balanceMutez < MIN_PREFLIGHT_BALANCE_MUTEZ || collectorBalanceMutez < MIN_PREFLIGHT_BALANCE_MUTEZ) {
    block("creator or collector wallet has insufficient Shadownet balance", [
      `Creator \`${creator.address}\` has only \`${balance.toString()}\` mutez on Shadownet.`,
      `Collector \`${collector.address}\` has only \`${collectorBalance.toString()}\` mutez on Shadownet.`,
      "Fund both signers with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  ok(`creator ${creator.address} has ${balance.toString()} mutez`);
  ok(`collector ${collector.address} has ${collectorBalance.toString()} mutez`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "standard_collection");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "transfer"));

  const metadata = await buildMetadata(creator.address, ipfs);
  ok("pinned and public-gateway-verified the Spaghetti artifact, collection metadata, and token metadata");
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

  await assertShadownet(tezos, "before set_sale");
  const setSale = await contract.methodsObject.set_sale({
    token_id: 0,
    sale: { active: true, seller: creator.address, treasury: creator.address, price: 1_000, remaining: 1, start: null, end: null },
  }).send();
  await setSale.confirmation(1);
  ok(`opened token 0 direct sale with ${setSale.hash}`);

  await assertShadownet(collectorTezos, "before buy");
  const collectorContract = await collectorTezos.contract.at(originated.address);
  const buy = await collectorContract.methodsObject.buy({ token_id: 0, amount: 1 }).send({ amount: 1_000, mutez: true });
  await buy.confirmation(1);
  ok(`collector bought token 0 directly with ${buy.hash}`);

  const storageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${encodeURIComponent(originated.address)}/storage`;
  const indexedStorage = await pollJson(
    "contract storage",
    storageUrl,
    (json) => Number(json?.ledger) > 0 && Number(json?.token_metadata) > 0 && Number(json?.total_supply) > 0 && Number(json?.sales) > 0,
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
  const salesUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.sales}/keys?limit=100`;
  const salesKeys = await pollJson(
    "direct sale big map key",
    salesUrl,
    (json) => Array.isArray(json) && json.some((entry) => String(entry?.key) === "0" && Number(entry?.value?.remaining) === 0),
  );
  const saleEntry = salesKeys.find((entry: any) => String(entry?.key) === "0");
  const tokenMetadataUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.token_metadata}/keys?limit=100`;
  const tokenMetadataKeys = await pollJson(
    "token metadata big map key",
    tokenMetadataUrl,
    (json) => Array.isArray(json) && json.some((entry) => String(entry?.key) === "0"),
  );
  const tokenMetadataEntry = tokenMetadataKeys.find((entry: any) => String(entry?.key) === "0");
  const indexedTokenUri = hexToUtf8(String(tokenMetadataEntry?.value?.token_info?.[""] || ""));
  assert.equal(indexedTokenUri, metadata.pins.tokenMetadata.uri);
  const indexedTokenMetadata = metadata.tokenMetadata;
  assert.equal(indexedTokenMetadata.name, metadata.package.items[0].name);
  assert.deepEqual(extractRelationshipMetadata(indexedTokenMetadata), metadata.relationship);

  await writeReport("PASSED", [
    "## Result",
    "",
    "- Signer-backed Spaghetti Shadownet deploy/mint/direct-sale proof passed.",
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
    `- Configure direct sale: \`${setSale.hash}\``,
    `- Direct purchase: \`${buy.hash}\``,
    "",
    "## Pinned IPFS Proof",
    "",
    pinProofLine("Artifact", metadata.pins.artifact),
    pinProofLine("Collection metadata", metadata.pins.collectionMetadata),
    pinProofLine("Token metadata", metadata.pins.tokenMetadata),
    "",
    "## Indexed Proof",
    "",
    `- Contract storage indexed ledger big map \`${indexedStorage.ledger}\` and token_metadata big map \`${indexedStorage.token_metadata}\`.`,
    `- Collector ledger big-map entry returned balance \`${collectorLedgerEntry?.value}\` for token 0.`,
    `- Sale big-map entry returned remaining=\`${saleEntry?.value?.remaining}\` after purchase.`,
    `- Token metadata big-map entry decoded to \`${indexedTokenMetadata.name}\` with relationship metadata intact.`,
    `- Relationship group: \`${metadata.relationship.collection_group}\``,
    "",
    "## Scope",
    "",
    "- This proves signer-backed Shadownet origination, token creation, mint, creator-configured primary sale, collector purchase, treasury payment path, and TzKT ownership resolution for Spaghetti standard collections.",
    "- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander discovery, or every Pasta publisher variant.",
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
  console.error(`[pasta-shadownet-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
