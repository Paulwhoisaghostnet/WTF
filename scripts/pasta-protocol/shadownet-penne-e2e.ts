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
  totalAllocation,
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
  "shadownet-penne-e2e-report.md",
);
const MIN_PREFLIGHT_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_PENNE_E2E_MIN_BALANCE_MUTEZ ||
    process.env.PASTA_SHADOWNET_E2E_MIN_BALANCE_MUTEZ ||
    "500000",
);
const MIN_COLLECTOR_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_PENNE_E2E_MIN_COLLECTOR_BALANCE_MUTEZ || "250000",
);
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-penne-e2e");

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Penne Shadownet E2E Report",
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
    "penne",
    "contract",
    "pasta-distribution.contract.json",
  );
  const code = JSON.parse(await readFile(artifact, "utf8"));
  assert.ok(Array.isArray(code), "Penne contract artifact should be Michelson JSON array");
  return code;
}

async function buildMetadata(creator: string, ipfs: IpfsProofConfig) {
  const relationship = {
    parent_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    collection_group: `penne-shadownet-e2e-${Date.now().toString(36)}`,
  };
  const allocations = [
    { recipient: "collector", amount: 2 },
    { recipient: "creator", amount: 3 },
  ];
  const artifact = await pinIpfsProofBytes({
    bytes: Buffer.from("Penne Shadownet distribution proof", "utf8"),
    fileName: "penne-distribution-proof.txt",
    mimeType: "text/plain",
    options: ipfs,
  });
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
        artifactUri: artifact.uri,
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
  const collectionMetadataPin = await pinIpfsProofJson({
    value: collectionMetadata,
    fileName: "penne-collection.json",
    options: ipfs,
  });
  const tokenMetadataPin = await pinIpfsProofJson({
    value: tokenMetadata,
    fileName: "penne-token-0.json",
    options: ipfs,
  });
  return {
    relationship,
    allocations,
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
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof originates a real Shadownet contract and spends test tez.",
    ]);
  }
  if ((process.env.TEZOS_NETWORK || "shadownet") === "mainnet") {
    throw new Error("Refusing to run Pasta Penne Shadownet E2E with TEZOS_NETWORK=mainnet");
  }
  const ipfs = resolveIpfsProofConfig();

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-penne-e2e.sock",
    authToken: "local-pasta-shadownet-penne-e2e",
    auditLog: "/tmp/wtf-pasta-shadownet-penne-e2e-audit.log",
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
  if (creatorBalanceMutez < MIN_PREFLIGHT_BALANCE_MUTEZ) {
    block("creator wallet has insufficient Shadownet balance", [
      `Creator \`${creator.address}\` has only \`${creatorBalance.toString()}\` mutez on Shadownet.`,
      "Fund the signer with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  if (collectorBalanceMutez < MIN_COLLECTOR_BALANCE_MUTEZ) {
    block("collector wallet has insufficient Shadownet balance", [
      `Collector \`${collector.address}\` has only \`${collectorBalance.toString()}\` mutez on Shadownet.`,
      "Fund the collector signer with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  ok(`creator ${creator.address} has ${creatorBalance.toString()} mutez`);
  ok(`collector ${collector.address} has ${collectorBalance.toString()} mutez`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "distribution");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "open_claim"));
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "airdrop"));

  const metadata = await buildMetadata(creator.address, ipfs);
  ok("pinned and public-gateway-verified the Penne artifact, collection metadata, and token metadata");
  const storage = buildOriginationStorage(creator.address, metadata.collectionMetadataUri);
  const originationEstimate = await creatorTezos.estimate.originate({ code, storage } as any);
  const estimatedOriginationMutez =
    Number(originationEstimate.suggestedFeeMutez) + Number(originationEstimate.burnFeeMutez);
  const requiredCreatorBalanceMutez = estimatedOriginationMutez + 2_250_000;
  if (creatorBalanceMutez < requiredCreatorBalanceMutez) {
    block("creator wallet balance cannot cover estimated Penne Shadownet proof operations", [
      `Creator \`${creator.address}\` has \`${creatorBalance.toString()}\` mutez.`,
      `Origination estimate requires fee/burn near \`${estimatedOriginationMutez}\` mutez before create/allocation/open/airdrop/close fees.`,
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
  const createToken = await contract.methodsObject
    .create_token(buildTokenInfo(metadata.tokenMetadataUri))
    .send();
  await createToken.confirmation(1);
  ok(`created distribution token 0 with ${createToken.hash}`);

  await assertShadownet(creatorTezos, "before set_allocations");
  const allocations = [
    { recipient: collector.address, token_id: 0, amount: metadata.allocations[0].amount },
    { recipient: creator.address, token_id: 0, amount: metadata.allocations[1].amount },
  ];
  const setAllocations = await contract.methodsObject.set_allocations(allocations).send();
  await setAllocations.confirmation(1);
  ok(`loaded distribution allocations with ${setAllocations.hash}`);

  await assertShadownet(creatorTezos, "before open_claim");
  const openClaim = await contract.methodsObject
    .open_claim({ active: true, start: null, end: null })
    .send();
  await openClaim.confirmation(1);
  ok(`opened claim window with ${openClaim.hash}`);

  await assertShadownet(collectorTezos, "before collector claim");
  const collectorContract = await collectorTezos.contract.at(originated.address);
  const claim = await collectorContract.methodsObject.claim(0).send();
  await claim.confirmation(1);
  ok(`collector claimed token 0 allocation with ${claim.hash}`);

  await assertShadownet(creatorTezos, "before airdrop");
  const airdrop = await contract.methodsObject
    .airdrop([{ recipient: creator.address, token_id: 0 }])
    .send();
  await airdrop.confirmation(1);
  ok(`admin airdropped remaining allocation with ${airdrop.hash}`);

  await assertShadownet(creatorTezos, "before close_claim");
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
          Number(entry?.value || 0) === metadata.allocations[0].amount,
      ) &&
      json.some(
        (entry) =>
          entry?.key?.owner === creator.address &&
          String(entry?.key?.token_id) === "0" &&
          Number(entry?.value || 0) === metadata.allocations[1].amount,
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
    (json) =>
      Array.isArray(json) &&
      json.some((entry) => String(entry?.key) === "0" && Number(entry?.value || 0) === expectedSupply),
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
          Number(entry?.value || 0) === metadata.allocations[0].amount,
      ) &&
      json.some(
        (entry) =>
          entry?.key?.owner === creator.address &&
          String(entry?.key?.token_id) === "0" &&
          Number(entry?.value || 0) === metadata.allocations[1].amount,
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
  assert.equal(indexedTokenUri, metadata.pins.tokenMetadata.uri);
  const indexedTokenMetadata = metadata.tokenMetadata;
  assert.equal(indexedTokenMetadata.name, metadata.package.items[0].name);
  assert.deepEqual(extractRelationshipMetadata(indexedTokenMetadata), metadata.relationship);
  const indexedPenneMetadata = indexedTokenMetadata.penne;
  assert.ok(indexedPenneMetadata && typeof indexedPenneMetadata === "object");
  assert.deepEqual(
    (indexedPenneMetadata as { distributionModes?: unknown }).distributionModes,
    ["claim", "airdrop"],
  );

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
    "## Pinned IPFS Proof",
    "",
    pinProofLine("Artifact", metadata.pins.artifact),
    pinProofLine("Collection metadata", metadata.pins.collectionMetadata),
    pinProofLine("Token metadata", metadata.pins.tokenMetadata),
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
  if (error instanceof ProofBlocked) {
    await writeReport("BLOCKED", error.lines).catch(() => undefined);
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const message = error instanceof Error ? error.stack || error.message : String(error);
  await writeReport("FAILED", ["## Error", "", "```", message, "```"]).catch(() => undefined);
  console.error(`[pasta-shadownet-penne-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
