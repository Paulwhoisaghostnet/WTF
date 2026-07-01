#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { MichelsonMap } from "@taquito/taquito";

import {
  availableActions,
  buildBundleManifest,
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
  dataJsonUri,
  hexToUtf8,
  loadSignerPair,
  normalizeBase,
  parseDataJsonUri,
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
  "shadownet-ravioli-e2e-report.md",
);
const MIN_PREFLIGHT_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_RAVIOLI_E2E_MIN_BALANCE_MUTEZ ||
    process.env.PASTA_SHADOWNET_E2E_MIN_BALANCE_MUTEZ ||
    "500000",
);
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-ravioli-e2e");

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Ravioli Shadownet E2E Report",
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
    "ravioli",
    "contract",
    "pasta-bundle.contract.json",
  );
  const code = JSON.parse(await readFile(artifact, "utf8"));
  assert.ok(Array.isArray(code), "Ravioli contract artifact should be Michelson JSON array");
  return code;
}

function buildMetadata(creator: string) {
  const relationship = {
    parent_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    collection_group: `ravioli-shadownet-e2e-${Date.now().toString(36)}`,
  };
  const pkg = buildCollectionPackage({
    targetApp: "ravioli",
    title: "Ravioli Shadownet E2E",
    description: "Signer-backed Pasta Protocol bundle Shadownet deployment proof.",
    symbol: "RVLE2E",
    relationship,
    items: [
      {
        name: "Ravioli Proof Bundle",
        description: "Bundle wrapper minted by the Pasta Protocol signer-backed Shadownet proof.",
        artifactUri: "data:text/plain;base64,UmF2aW9saSBTaGFkb3duZXQgYnVuZGxlIHByb29m",
        mimeType: "text/plain",
        tags: ["ravioli", "bundle", "shadownet", "e2e"],
      },
    ],
  });
  const validation = validateCheasePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join("; "));

  const manifest = buildBundleManifest({
    name: pkg.items[0].name,
    description: pkg.items[0].description,
    mystery: false,
    relationship,
    members: [
      {
        name: "Proof member artifact",
        description: "Off-chain bundle member for the Ravioli Shadownet proof.",
        uri: "data:text/plain;base64,YnVuZGxlLW1lbWJlci1vbmU=",
        mimeType: "text/plain",
        quantity: 1,
      },
      {
        name: "Parent token reference",
        tokenContract: relationship.parent_contract,
        tokenId: 0,
        quantity: 1,
      },
    ],
  });
  const manifestUri = dataJsonUri(manifest);
  const itemCount = Number(manifest.itemCount || 0);
  assert.equal(itemCount, 2);

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
    extra: { bundle: { mystery: false, itemCount, manifestUri } },
  });
  assert.deepEqual(extractRelationshipMetadata(collectionMetadata), relationship);
  assert.deepEqual(extractRelationshipMetadata(tokenMetadata), relationship);
  return {
    relationship,
    package: pkg,
    manifest,
    manifestUri,
    itemCount,
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
    bundles: new MichelsonMap(),
    redeemed: new MichelsonMap(),
    redeemed_by: new MichelsonMap(),
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
    throw new Error("Refusing to run Pasta Ravioli Shadownet E2E with TEZOS_NETWORK=mainnet");
  }

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-ravioli-e2e.sock",
    authToken: "local-pasta-shadownet-ravioli-e2e",
    auditLog: "/tmp/wtf-pasta-shadownet-ravioli-e2e-audit.log",
  });
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(env);
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  await assertShadownet(creatorTezos, "creator startup");
  await assertShadownet(collectorTezos, "collector startup");

  const creatorBalance = await creatorTezos.tz.getBalance(creator.address);
  const collectorBalance = await collectorTezos.tz.getBalance(collector.address);
  const creatorBalanceMutez = Number(creatorBalance.toString());
  const collectorBalanceMutez = Number(collectorBalance.toString());
  if (creatorBalanceMutez < MIN_PREFLIGHT_BALANCE_MUTEZ || collectorBalanceMutez < MIN_PREFLIGHT_BALANCE_MUTEZ) {
    block("creator or collector wallet has insufficient Shadownet balance", [
      `Creator \`${creator.address}\` has \`${creatorBalance.toString()}\` mutez on Shadownet.`,
      `Collector \`${collector.address}\` has \`${collectorBalance.toString()}\` mutez on Shadownet.`,
      "Fund both signer wallets with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  ok(`creator ${creator.address} has ${creatorBalance.toString()} mutez`);
  ok(`collector ${collector.address} has ${collectorBalance.toString()} mutez`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "bundle_collection");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "transfer"));

  const metadata = buildMetadata(creator.address);
  const storage = buildOriginationStorage(creator.address, metadata.collectionMetadataUri);
  const originationEstimate = await creatorTezos.estimate.originate({ code, storage } as any);
  const estimatedOriginationMutez =
    Number(originationEstimate.suggestedFeeMutez) + Number(originationEstimate.burnFeeMutez);
  const requiredCreatorBalanceMutez = estimatedOriginationMutez + 1_500_000;
  if (creatorBalanceMutez < requiredCreatorBalanceMutez) {
    block("creator wallet balance cannot cover estimated Ravioli Shadownet proof operations", [
      `Creator \`${creator.address}\` has \`${creatorBalance.toString()}\` mutez.`,
      `Origination estimate requires fee/burn near \`${estimatedOriginationMutez}\` mutez before create/mint/transfer fees.`,
      "Fund the signer with more Shadownet test tez, then rerun.",
    ]);
  }
  if (collectorBalanceMutez < 500_000) {
    block("collector wallet balance cannot cover Ravioli redeem operation", [
      `Collector \`${collector.address}\` has \`${collectorBalance.toString()}\` mutez.`,
      "Redeeming a bundle is a signed operation and needs fee headroom. Fund the collector signer with more Shadownet test tez, then rerun.",
    ]);
  }
  ok(
    `origination estimate fee=${originationEstimate.suggestedFeeMutez} burn=${originationEstimate.burnFeeMutez} storage=${originationEstimate.storageLimit}`,
  );

  await assertShadownet(creatorTezos, "before origination");
  const originate = await creatorTezos.contract.originate({ code, storage } as any);
  await originate.confirmation(1);
  const originated = await originate.contract();
  ok(`originated ${originated.address} with ${originate.hash}`);

  await assertShadownet(creatorTezos, "before create_bundle");
  const contract = await creatorTezos.contract.at(originated.address);
  const tokenInfo = buildTokenInfo(metadata.tokenMetadataUri);
  const config = {
    redeemable: true,
    mystery: false,
    item_count: metadata.itemCount,
    contents_uri: utf8ToHex(metadata.manifestUri),
  };
  const createBundle = await contract.methodsObject.create_bundle({ token_info: tokenInfo, config }).send();
  await createBundle.confirmation(1);
  ok(`created bundle token 0 with ${createBundle.hash}`);

  await assertShadownet(creatorTezos, "before mint");
  const mint = await contract.methodsObject.mint({ to_: creator.address, token_id: 0, amount: 3 }).send();
  await mint.confirmation(1);
  ok(`minted bundle token 0 supply with ${mint.hash}`);

  await assertShadownet(creatorTezos, "before transfer");
  const transfer = await contract.methodsObject
    .transfer([
      {
        from_: creator.address,
        txs: [{ to_: collector.address, token_id: 0, amount: 2 }],
      },
    ])
    .send();
  await transfer.confirmation(1);
  ok(`transferred bundle editions to collector with ${transfer.hash}`);

  await assertShadownet(collectorTezos, "before redeem");
  const collectorContract = await collectorTezos.contract.at(originated.address);
  const redeem = await collectorContract.methodsObject.redeem({ token_id: 0, amount: 1 }).send();
  await redeem.confirmation(1);
  ok(`collector redeemed one bundle edition with ${redeem.hash}`);

  const storageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${encodeURIComponent(originated.address)}/storage`;
  const indexedStorage = await pollJson(
    "contract storage",
    storageUrl,
    (json) =>
      Number(json?.ledger) > 0 &&
      Number(json?.token_metadata) > 0 &&
      Number(json?.total_supply) > 0 &&
      Number(json?.bundles) > 0 &&
      Number(json?.redeemed) > 0,
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
  const totalSupplyUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.total_supply}/keys?limit=100`;
  const totalSupplyKeys = await pollJson(
    "total supply big map key",
    totalSupplyUrl,
    (json) => Array.isArray(json) && json.some((entry) => String(entry?.key) === "0" && Number(entry?.value || 0) >= 2),
  );
  const totalSupplyEntry = totalSupplyKeys.find((entry: any) => String(entry?.key) === "0");
  const bundleUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.bundles}/keys?limit=100`;
  const bundleKeys = await pollJson(
    "bundle config big map key",
    bundleUrl,
    (json) =>
      Array.isArray(json) &&
      json.some(
        (entry) =>
          String(entry?.key) === "0" &&
          entry?.value?.redeemable === true &&
          Number(entry?.value?.item_count || 0) === metadata.itemCount,
      ),
  );
  const bundleEntry = bundleKeys.find((entry: any) => String(entry?.key) === "0");
  const redeemedUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.redeemed}/keys?limit=100`;
  const redeemedKeys = await pollJson(
    "redeemed big map key",
    redeemedUrl,
    (json) => Array.isArray(json) && json.some((entry) => String(entry?.key) === "0" && Number(entry?.value || 0) >= 1),
  );
  const redeemedEntry = redeemedKeys.find((entry: any) => String(entry?.key) === "0");
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
  assert.equal(indexedTokenMetadata.bundle?.itemCount, metadata.itemCount);
  assert.equal(indexedTokenMetadata.bundle?.manifestUri, metadata.manifestUri);

  await writeReport("PASSED", [
    "## Result",
    "",
    "- Signer-backed Ravioli Shadownet bundle deploy/create/mint/transfer/redeem proof passed.",
    `- Creator wallet: \`${creator.id}\` / \`${creator.address}\``,
    `- Collector wallet: \`${collector.id}\` / \`${collector.address}\``,
    `- Contract: \`${originated.address}\``,
    `- Explorer: https://shadownet.tzkt.io/${originated.address}`,
    "",
    "## Operations",
    "",
    `- Origination: \`${originate.hash}\``,
    `- Create bundle: \`${createBundle.hash}\``,
    `- Mint: \`${mint.hash}\``,
    `- Transfer/collect: \`${transfer.hash}\``,
    `- Redeem: \`${redeem.hash}\``,
    "",
    "## Indexed Proof",
    "",
    `- Contract storage indexed ledger big map \`${indexedStorage.ledger}\`, token_metadata big map \`${indexedStorage.token_metadata}\`, total_supply big map \`${indexedStorage.total_supply}\`, bundles big map \`${indexedStorage.bundles}\`, and redeemed big map \`${indexedStorage.redeemed}\`.`,
    `- Collector ledger big-map entry returned balance \`${collectorLedgerEntry?.value}\` for token 0 after redeeming one edition.`,
    `- Total supply big-map entry returned \`${totalSupplyEntry?.value}\` for token 0 after one redeemed burn.`,
    `- Bundle big-map entry returned redeemable=\`${bundleEntry?.value?.redeemable}\`, mystery=\`${bundleEntry?.value?.mystery}\`, item_count=\`${bundleEntry?.value?.item_count}\`.`,
    `- Redeemed big-map entry returned \`${redeemedEntry?.value}\` for token 0.`,
    `- Token metadata big-map entry decoded to \`${indexedTokenMetadata.name}\` with relationship and bundle manifest metadata intact.`,
    `- Relationship group: \`${metadata.relationship.collection_group}\``,
    "",
    "## Scope",
    "",
    "- This proves signer-backed Shadownet origination, bundle creation, minting, transfer/collect, redeem/burn, bundle config, redeemed count, metadata decoding, total supply, and ownership resolution for Ravioli bundles.",
    "- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, mystery reveal, or every Pasta publisher variant.",
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
  console.error(`[pasta-shadownet-ravioli-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
