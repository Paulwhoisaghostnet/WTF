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
  costForBatch,
  detectPastaContract,
  extractRelationshipMetadata,
  validateBondingCurve,
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
  "shadownet-gnocchi-e2e-report.md",
);
const MIN_PREFLIGHT_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_GNOCCHI_E2E_MIN_BALANCE_MUTEZ ||
    process.env.PASTA_SHADOWNET_E2E_MIN_BALANCE_MUTEZ ||
    "500000",
);
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-gnocchi-e2e");

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Gnocchi Shadownet E2E Report",
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
    "gnocchi",
    "contract",
    "pasta-open-edition.contract.json",
  );
  const code = JSON.parse(await readFile(artifact, "utf8"));
  assert.ok(Array.isArray(code), "Gnocchi contract artifact should be Michelson JSON array");
  return code;
}

function buildMetadata(creator: string) {
  const relationship = {
    parent_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    collection_group: `gnocchi-shadownet-e2e-${Date.now().toString(36)}`,
  };
  const pkg = buildCollectionPackage({
    targetApp: "gnocchi",
    title: "Gnocchi Shadownet E2E",
    description: "Signer-backed Pasta Protocol open-edition Shadownet deployment proof.",
    symbol: "GNCE2E",
    relationship,
    items: [
      {
        name: "Gnocchi Proof Open Edition",
        description: "Open-minted by the Pasta Protocol signer-backed Shadownet proof.",
        artifactUri: "data:text/plain;base64,R25vY2NoaSBTaGFkb3duZXQgcHJvb2YgYXJ0aWZhY3Q=",
        mimeType: "text/plain",
        tags: ["gnocchi", "open-edition", "shadownet", "e2e"],
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

function buildProofSale(treasury: string) {
  const curve = {
    base_price: 1,
    increment: 0,
    step_size: 1,
    minimum_price: 1,
    maximum_price: 1,
  };
  const validation = validateBondingCurve(curve);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  return {
    curve,
    sale: {
      active: true,
      start: null,
      end: null,
      base_price: curve.base_price,
      increment: curve.increment,
      step_size: curve.step_size,
      min_price: curve.minimum_price,
      max_price: curve.maximum_price,
      max_supply: 5,
      treasury,
    },
  };
}

async function main(): Promise<void> {
  if (process.env.PASTA_SHADOWNET_E2E_EXECUTE !== "1") {
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof originates a real Shadownet contract and spends test tez.",
    ]);
  }
  if ((process.env.TEZOS_NETWORK || "shadownet") === "mainnet") {
    throw new Error("Refusing to run Pasta Gnocchi Shadownet E2E with TEZOS_NETWORK=mainnet");
  }

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-gnocchi-e2e.sock",
    authToken: "local-pasta-shadownet-gnocchi-e2e",
    auditLog: "/tmp/wtf-pasta-shadownet-gnocchi-e2e-audit.log",
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
  assert.equal(adapter?.kind, "open_edition_collection");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "set_sale_active"));

  const metadata = buildMetadata(creator.address);
  const storage = buildOriginationStorage(creator.address, metadata.collectionMetadataUri);
  const originationEstimate = await creatorTezos.estimate.originate({ code, storage } as any);
  const estimatedOriginationMutez =
    Number(originationEstimate.suggestedFeeMutez) + Number(originationEstimate.burnFeeMutez);
  const requiredCreatorBalanceMutez = estimatedOriginationMutez + 1_000_000;
  if (creatorBalanceMutez < requiredCreatorBalanceMutez) {
    block("creator wallet balance cannot cover estimated Gnocchi Shadownet proof operations", [
      `Creator \`${creator.address}\` has \`${creatorBalance.toString()}\` mutez.`,
      `Origination estimate requires fee/burn near \`${estimatedOriginationMutez}\` mutez before create-open-edition fees.`,
      "Fund the signer with more Shadownet test tez, then rerun.",
    ]);
  }
  ok(
    `origination estimate fee=${originationEstimate.suggestedFeeMutez} burn=${originationEstimate.burnFeeMutez} storage=${originationEstimate.storageLimit}`,
  );

  const tokenInfo = buildTokenInfo(metadata.tokenMetadataUri);
  const { curve, sale } = buildProofSale(creator.address);
  const mintCost = costForBatch(curve, 0, 1);
  const requiredCollectorBalanceMutez = mintCost + 250_000;
  if (collectorBalanceMutez < requiredCollectorBalanceMutez) {
    block("collector wallet balance cannot cover Gnocchi open mint", [
      `Collector \`${collector.address}\` has \`${collectorBalance.toString()}\` mutez.`,
      `Open mint requires \`${mintCost}\` mutez plus fee headroom.`,
      "Fund the collector signer with more Shadownet test tez, then rerun.",
    ]);
  }

  await assertShadownet(creatorTezos, "before origination");
  const originate = await creatorTezos.contract.originate({ code, storage } as any);
  await originate.confirmation(1);
  const originated = await originate.contract();
  ok(`originated ${originated.address} with ${originate.hash}`);

  await assertShadownet(creatorTezos, "before create_open_edition");
  const contract = await creatorTezos.contract.at(originated.address);
  const createOpenEdition = await contract.methodsObject
    .create_open_edition({ token_info: tokenInfo, sale })
    .send();
  await createOpenEdition.confirmation(1);
  ok(`created open edition token 0 with ${createOpenEdition.hash}`);

  await assertShadownet(collectorTezos, "before open_mint");
  const collectorContract = await collectorTezos.contract.at(originated.address);
  const openMint = await collectorContract.methodsObject
    .open_mint({ token_id: 0, amount: 1 })
    .send({ amount: mintCost, mutez: true });
  await openMint.confirmation(1);
  ok(`collector open-minted token 0 with ${openMint.hash}`);

  const storageUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/contracts/${encodeURIComponent(originated.address)}/storage`;
  const indexedStorage = await pollJson(
    "contract storage",
    storageUrl,
    (json) =>
      Number(json?.ledger) > 0 &&
      Number(json?.token_metadata) > 0 &&
      Number(json?.total_supply) > 0 &&
      Number(json?.sales) > 0,
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
    (json) => Array.isArray(json) && json.some((entry) => String(entry?.key) === "0" && Number(entry?.value || 0) >= 1),
  );
  const totalSupplyEntry = totalSupplyKeys.find((entry: any) => String(entry?.key) === "0");
  const saleUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.sales}/keys?limit=100`;
  const saleKeys = await pollJson(
    "sale config big map key",
    saleUrl,
    (json) => Array.isArray(json) && json.some((entry) => String(entry?.key) === "0" && entry?.value?.active === true),
  );
  const saleEntry = saleKeys.find((entry: any) => String(entry?.key) === "0");
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

  await writeReport("PASSED", [
    "## Result",
    "",
    "- Signer-backed Gnocchi Shadownet open-edition deploy/configure/collect proof passed.",
    `- Creator wallet: \`${creator.id}\` / \`${creator.address}\``,
    `- Collector wallet: \`${collector.id}\` / \`${collector.address}\``,
    `- Contract: \`${originated.address}\``,
    `- Explorer: https://shadownet.tzkt.io/${originated.address}`,
    "",
    "## Operations",
    "",
    `- Origination: \`${originate.hash}\``,
    `- Create open edition: \`${createOpenEdition.hash}\``,
    `- Collector open mint: \`${openMint.hash}\``,
    "",
    "## Indexed Proof",
    "",
    `- Contract storage indexed ledger big map \`${indexedStorage.ledger}\`, token_metadata big map \`${indexedStorage.token_metadata}\`, total_supply big map \`${indexedStorage.total_supply}\`, and sales big map \`${indexedStorage.sales}\`.`,
    `- Collector ledger big-map entry returned balance \`${collectorLedgerEntry?.value}\` for token 0.`,
    `- Total supply big-map entry returned \`${totalSupplyEntry?.value}\` for token 0.`,
    `- Sale big-map entry returned active=\`${saleEntry?.value?.active}\`, base_price=\`${saleEntry?.value?.base_price}\`, max_supply=\`${saleEntry?.value?.max_supply}\`.`,
    `- Token metadata big-map entry decoded to \`${indexedTokenMetadata.name}\` with relationship metadata intact.`,
    `- Relationship group: \`${metadata.relationship.collection_group}\``,
    "",
    "## Scope",
    "",
    "- This proves signer-backed Shadownet origination, open-edition configuration, collector open mint, TzKT sale state, token supply, ownership, and metadata resolution for Gnocchi open editions.",
    "- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, or every Pasta publisher variant.",
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
  console.error(`[pasta-shadownet-gnocchi-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
