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
  generateEditions,
  traitAttributes,
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
  "shadownet-rotini-e2e-report.md",
);
const MIN_PREFLIGHT_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_ROTINI_E2E_MIN_BALANCE_MUTEZ ||
    process.env.PASTA_SHADOWNET_E2E_MIN_BALANCE_MUTEZ ||
    "500000",
);
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-rotini-e2e");

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Rotini Shadownet E2E Report",
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
    "rotini",
    "contract",
    "pasta-standard-collection.contract.json",
  );
  const code = JSON.parse(await readFile(artifact, "utf8"));
  assert.ok(Array.isArray(code), "Rotini contract artifact should be Michelson JSON array");
  return code;
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
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof originates a real Shadownet contract and spends test tez.",
    ]);
  }
  if ((process.env.TEZOS_NETWORK || "shadownet") === "mainnet") {
    throw new Error("Refusing to run Pasta Rotini Shadownet E2E with TEZOS_NETWORK=mainnet");
  }

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-rotini-e2e.sock",
    authToken: "local-pasta-shadownet-rotini-e2e",
    auditLog: "/tmp/wtf-pasta-shadownet-rotini-e2e-audit.log",
  });
  const { creator, creatorSigner, collector, collectorSigner } = await loadSignerPair(env);
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const collectorTezos = buildToolkit(collectorSigner, rpc.rpcUrl);
  await assertShadownet(creatorTezos, "creator startup");
  await assertShadownet(collectorTezos, "collector startup");

  const creatorBalance = await creatorTezos.tz.getBalance(creator.address);
  const creatorBalanceMutez = Number(creatorBalance.toString());
  if (creatorBalanceMutez < MIN_PREFLIGHT_BALANCE_MUTEZ) {
    block("creator wallet has insufficient Shadownet balance", [
      `Creator \`${creator.address}\` has only \`${creatorBalance.toString()}\` mutez on Shadownet.`,
      "Fund the signer with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  ok(`creator ${creator.address} has ${creatorBalance.toString()} mutez`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "standard_collection");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "transfer"));
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "mint"));

  const metadata = buildMetadata(creator.address);
  const storage = buildOriginationStorage(creator.address, metadata.collectionMetadataUri);
  const originationEstimate = await creatorTezos.estimate.originate({ code, storage } as any);
  const estimatedOriginationMutez =
    Number(originationEstimate.suggestedFeeMutez) + Number(originationEstimate.burnFeeMutez);
  const requiredCreatorBalanceMutez = estimatedOriginationMutez + 1_500_000;
  if (creatorBalanceMutez < requiredCreatorBalanceMutez) {
    block("creator wallet balance cannot cover estimated Rotini Shadownet proof operations", [
      `Creator \`${creator.address}\` has \`${creatorBalance.toString()}\` mutez.`,
      `Origination estimate requires fee/burn near \`${estimatedOriginationMutez}\` mutez before create/mint/transfer fees.`,
      "Fund the signer with more Shadownet test tez, then rerun.",
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

  await assertShadownet(creatorTezos, "before create_token");
  const contract = await creatorTezos.contract.at(originated.address);
  const createTokenOps: string[] = [];
  for (let tokenId = 0; tokenId < metadata.tokenMetadataUris.length; tokenId += 1) {
    const createToken = await contract.methodsObject
      .create_token(buildTokenInfo(metadata.tokenMetadataUris[tokenId]))
      .send();
    await createToken.confirmation(1);
    ok(`created generated token ${tokenId} with ${createToken.hash}`);
    createTokenOps.push(createToken.hash);
  }

  await assertShadownet(creatorTezos, "before mint");
  const mintOps: string[] = [];
  for (let tokenId = 0; tokenId < metadata.tokenMetadataUris.length; tokenId += 1) {
    const mint = await contract.methodsObject
      .mint({ to_: creator.address, token_id: tokenId, amount: 1 })
      .send();
    await mint.confirmation(1);
    ok(`minted generated token ${tokenId} with ${mint.hash}`);
    mintOps.push(mint.hash);
  }

  await assertShadownet(creatorTezos, "before transfer");
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
  if (error instanceof ProofBlocked) {
    await writeReport("BLOCKED", error.lines).catch(() => undefined);
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const message = error instanceof Error ? error.stack || error.message : String(error);
  await writeReport("FAILED", ["## Error", "", "```", message, "```"]).catch(() => undefined);
  console.error(`[pasta-shadownet-rotini-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
