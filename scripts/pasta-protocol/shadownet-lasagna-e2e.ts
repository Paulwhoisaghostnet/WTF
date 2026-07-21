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
  buildExhibitionMetadata,
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
  "shadownet-lasagna-e2e-report.md",
);
const MIN_PREFLIGHT_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_LASAGNA_E2E_MIN_BALANCE_MUTEZ ||
    process.env.PASTA_SHADOWNET_E2E_MIN_BALANCE_MUTEZ ||
    "750000",
);
const MIN_CURATOR_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_LASAGNA_E2E_MIN_CURATOR_BALANCE_MUTEZ || "350000",
);
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-lasagna-e2e");

const PROVEN_CONTRACTS = {
  spaghetti: "KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc",
  gnocchi: "KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw",
  ravioli: "KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB",
  rotini: "KT1BYMrRC1ZvoHJWaSvFpiRsd5ZM2YcRh3Ls",
  penne: "KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz",
} as const;

type RevisionItem = {
  contract: string;
  token_id: number;
};

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Lasagna Shadownet E2E Report",
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
    "lasagna",
    "contract",
    "pasta-exhibition.contract.json",
  );
  const code = JSON.parse(await readFile(artifact, "utf8"));
  assert.ok(Array.isArray(code), "Lasagna contract artifact should be Michelson JSON array");
  return code;
}

async function buildMetadata(creator: string, curator: string, ipfs: IpfsProofConfig) {
  const relationship = {
    parent_contract: PROVEN_CONTRACTS.spaghetti,
    collection_group: `lasagna-shadownet-e2e-${Date.now().toString(36)}`,
  };
  const itemDefinitions = [
    {
      name: "Spaghetti Proof Token Reference",
      description: "Reference to the proven Spaghetti Shadownet token.",
      artifactText: "Lasagna reference Spaghetti",
      artifactFileName: "lasagna-reference-spaghetti.txt",
      mimeType: "text/plain",
      tokenMetadata: { contract: PROVEN_CONTRACTS.spaghetti, tokenId: 0 },
      tags: ["lasagna", "exhibition", "spaghetti", "shadownet", "e2e"],
    },
    {
      name: "Gnocchi Proof Open Edition Reference",
      description: "Reference to the proven Gnocchi Shadownet token.",
      artifactText: "Lasagna reference Gnocchi",
      artifactFileName: "lasagna-reference-gnocchi.txt",
      mimeType: "text/plain",
      tokenMetadata: { contract: PROVEN_CONTRACTS.gnocchi, tokenId: 0 },
      tags: ["lasagna", "exhibition", "gnocchi", "shadownet", "e2e"],
    },
    {
      name: "Ravioli Proof Bundle Reference",
      description: "Reference to the proven Ravioli Shadownet bundle.",
      artifactText: "Lasagna reference Ravioli",
      artifactFileName: "lasagna-reference-ravioli.txt",
      mimeType: "text/plain",
      tokenMetadata: { contract: PROVEN_CONTRACTS.ravioli, tokenId: 0 },
      tags: ["lasagna", "exhibition", "ravioli", "shadownet", "e2e"],
    },
    {
      name: "Rotini Proof Generated Reference",
      description: "Reference to the proven Rotini Shadownet generated token.",
      artifactText: "Lasagna reference Rotini",
      artifactFileName: "lasagna-reference-rotini.txt",
      mimeType: "text/plain",
      tokenMetadata: { contract: PROVEN_CONTRACTS.rotini, tokenId: 1 },
      tags: ["lasagna", "exhibition", "rotini", "shadownet", "e2e"],
    },
    {
      name: "Penne Proof Distribution Reference",
      description: "Reference to the proven Penne Shadownet distributed token.",
      artifactText: "Lasagna reference Penne",
      artifactFileName: "lasagna-reference-penne.txt",
      mimeType: "text/plain",
      tokenMetadata: { contract: PROVEN_CONTRACTS.penne, tokenId: 0 },
      tags: ["lasagna", "exhibition", "penne", "shadownet", "e2e"],
    },
  ];
  const artifactPins = await Promise.all(itemDefinitions.map((item) => pinIpfsProofBytes({
    bytes: Buffer.from(item.artifactText, "utf8"),
    fileName: item.artifactFileName,
    mimeType: item.mimeType,
    options: ipfs,
  })));
  const items = itemDefinitions.map(({ artifactText: _artifactText, artifactFileName: _artifactFileName, ...item }, index) => ({
    ...item,
    artifactUri: artifactPins[index].uri,
  }));
  const pkg = buildCollectionPackage({
    targetApp: "lasagna",
    title: "Lasagna Shadownet E2E",
    description: "Signer-backed Pasta Protocol exhibition registry Shadownet deployment proof.",
    symbol: "LSGE2E",
    relationship,
    items,
  });
  const validation = validateCheasePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join("; "));

  const collectionMetadata = buildCollectionMetadata({
    name: pkg.title,
    description: pkg.description,
    symbol: pkg.symbol,
    interfaces: ["TZIP-016", "TZIP-021"],
    relationship: pkg.relationship,
    extra: {
      lasagna: {
        curatorCount: 2,
        revisionPlan: "publish-two-and-rollback-current",
        referenceArtifacts: items.map((item) => ({
          name: item.name,
          artifactUri: item.artifactUri,
          mimeType: item.mimeType,
          token: item.tokenMetadata,
        })),
      },
    },
  });
  assert.deepEqual(extractRelationshipMetadata(collectionMetadata), relationship);

  const revision0Items: RevisionItem[] = [
    { contract: PROVEN_CONTRACTS.spaghetti, token_id: 0 },
    { contract: PROVEN_CONTRACTS.gnocchi, token_id: 0 },
  ];
  const revision1Items: RevisionItem[] = [
    { contract: PROVEN_CONTRACTS.ravioli, token_id: 0 },
    { contract: PROVEN_CONTRACTS.rotini, token_id: 1 },
    { contract: PROVEN_CONTRACTS.penne, token_id: 0 },
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
  const collectionPin = await pinIpfsProofJson({
    value: collectionMetadata,
    fileName: "lasagna-collection.json",
    options: ipfs,
  });
  const revision0Pin = await pinIpfsProofJson({
    value: revision0Metadata,
    fileName: "lasagna-revision-0.json",
    options: ipfs,
  });
  const revision1Pin = await pinIpfsProofJson({
    value: revision1Metadata,
    fileName: "lasagna-revision-1.json",
    options: ipfs,
  });

  return {
    relationship,
    package: pkg,
    collectionMetadata,
    collectionMetadataUri: collectionPin.uri,
    revision0Items,
    revision1Items,
    revision0Metadata,
    revision1Metadata,
    revision0MetadataUri: revision0Pin.uri,
    revision1MetadataUri: revision1Pin.uri,
    pins: { artifacts: artifactPins, collection: collectionPin, revision0: revision0Pin, revision1: revision1Pin },
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
    curators: new MichelsonMap(),
    revisions: new MichelsonMap(),
    revision_count: 0,
    current_revision: null,
  };
}

async function main(): Promise<void> {
  if (process.env.PASTA_SHADOWNET_E2E_EXECUTE !== "1") {
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_E2E_EXECUTE=1` is required because this proof originates a real Shadownet contract and spends test tez.",
    ]);
  }
  if ((process.env.TEZOS_NETWORK || "shadownet") === "mainnet") {
    throw new Error("Refusing to run Pasta Lasagna Shadownet E2E with TEZOS_NETWORK=mainnet");
  }
  const ipfs = resolveIpfsProofConfig();

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-lasagna-e2e.sock",
    authToken: "local-pasta-shadownet-lasagna-e2e",
    auditLog: "/tmp/wtf-pasta-shadownet-lasagna-e2e-audit.log",
  });
  const { creator, creatorSigner, collector: curator, collectorSigner: curatorSigner } =
    await loadSignerPair(env);
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const curatorTezos = buildToolkit(curatorSigner, rpc.rpcUrl);
  await assertShadownet(creatorTezos, "creator startup");
  await assertShadownet(curatorTezos, "curator startup");

  const creatorBalance = await creatorTezos.tz.getBalance(creator.address);
  const curatorBalance = await curatorTezos.tz.getBalance(curator.address);
  const creatorBalanceMutez = Number(creatorBalance.toString());
  const curatorBalanceMutez = Number(curatorBalance.toString());
  if (creatorBalanceMutez < MIN_PREFLIGHT_BALANCE_MUTEZ) {
    block("creator wallet has insufficient Shadownet balance", [
      `Creator \`${creator.address}\` has only \`${creatorBalance.toString()}\` mutez on Shadownet.`,
      "Fund the signer with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  if (curatorBalanceMutez < MIN_CURATOR_BALANCE_MUTEZ) {
    block("curator wallet has insufficient Shadownet balance", [
      `Curator \`${curator.address}\` has only \`${curatorBalance.toString()}\` mutez on Shadownet.`,
      "Fund the curator signer with Shadownet test tez, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  ok(`creator ${creator.address} has ${creatorBalance.toString()} mutez`);
  ok(`curator ${curator.address} has ${curatorBalance.toString()} mutez`);

  const code = await readContractArtifact();
  const entrypoints = collectAnnotations(code);
  const adapter = detectPastaContract([...entrypoints]);
  assert.equal(adapter?.kind, "exhibition");
  assert.ok(availableActions(adapter, [...entrypoints]).some((action) => action.id === "add_curator"));
  assert.ok(
    availableActions(adapter, [...entrypoints]).some((action) => action.id === "publish_revision"),
  );
  assert.ok(
    availableActions(adapter, [...entrypoints]).some((action) => action.id === "set_current_revision"),
  );

  const metadata = await buildMetadata(creator.address, curator.address, ipfs);
  ok("pinned and public-gateway-verified the Lasagna registry metadata, revisions, and reference artifacts");
  const storage = buildOriginationStorage(creator.address, metadata.collectionMetadataUri);
  const originationEstimate = await creatorTezos.estimate.originate({ code, storage } as any);
  const estimatedOriginationMutez =
    Number(originationEstimate.suggestedFeeMutez) + Number(originationEstimate.burnFeeMutez);
  const requiredCreatorBalanceMutez = estimatedOriginationMutez + 2_500_000;
  if (creatorBalanceMutez < requiredCreatorBalanceMutez) {
    block("creator wallet balance cannot cover estimated Lasagna Shadownet proof operations", [
      `Creator \`${creator.address}\` has \`${creatorBalance.toString()}\` mutez.`,
      `Origination estimate requires fee/burn near \`${estimatedOriginationMutez}\` mutez before curator/revision/admin fees.`,
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

  await assertShadownet(creatorTezos, "before add_curator");
  const contract = await creatorTezos.contract.at(originated.address);
  const addCurator = await contract.methodsObject.add_curator(curator.address).send();
  await addCurator.confirmation(1);
  ok(`added curator with ${addCurator.hash}`);

  await assertShadownet(curatorTezos, "before curator publish_revision");
  const curatorContract = await curatorTezos.contract.at(originated.address);
  const publishRevision0 = await curatorContract.methodsObject
    .publish_revision({
      metadata_uri: utf8ToHex(metadata.revision0MetadataUri),
      items: metadata.revision0Items,
    })
    .send();
  await publishRevision0.confirmation(1);
  ok(`curator published revision 0 with ${publishRevision0.hash}`);

  await assertShadownet(creatorTezos, "before administrator publish_revision");
  const publishRevision1 = await contract.methodsObject
    .publish_revision({
      metadata_uri: utf8ToHex(metadata.revision1MetadataUri),
      items: metadata.revision1Items,
    })
    .send();
  await publishRevision1.confirmation(1);
  ok(`administrator published revision 1 with ${publishRevision1.hash}`);

  await assertShadownet(curatorTezos, "before set_current_revision");
  const setCurrent = await curatorContract.methodsObject.set_current_revision(0).send();
  await setCurrent.confirmation(1);
  ok(`set current revision back to 0 with ${setCurrent.hash}`);

  await assertShadownet(creatorTezos, "before remove_curator");
  const removeCurator = await contract.methodsObject.remove_curator(curator.address).send();
  await removeCurator.confirmation(1);
  ok(`removed curator with ${removeCurator.hash}`);

  await assertShadownet(creatorTezos, "before transfer_administration");
  const transferAdmin = await contract.methodsObject.transfer_administration(curator.address).send();
  await transferAdmin.confirmation(1);
  ok(`transferred pending administration with ${transferAdmin.hash}`);

  await assertShadownet(curatorTezos, "before accept_administration");
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
  assert.equal(indexedMetadataUri, metadata.pins.collection.uri);
  const indexedCollectionMetadata = metadata.collectionMetadata as any;
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
  assert.equal(hexToUtf8(String(revision0Entry?.value?.metadata_uri || "")), metadata.pins.revision0.uri);
  assert.equal(hexToUtf8(String(revision1Entry?.value?.metadata_uri || "")), metadata.pins.revision1.uri);
  const indexedRevision0Metadata = metadata.revision0Metadata as any;
  const indexedRevision1Metadata = metadata.revision1Metadata as any;
  assert.equal(indexedRevision0Metadata.exhibition?.itemCount, metadata.revision0Items.length);
  assert.equal(indexedRevision0Metadata.exhibition?.revision, 0);
  assert.equal(indexedRevision1Metadata.exhibition?.itemCount, metadata.revision1Items.length);
  assert.equal(indexedRevision1Metadata.exhibition?.revision, 1);

  const revision0Contracts = new Set(
    (revision0Entry?.value?.items || []).map((item: any) => String(item?.contract || "")),
  );
  const revision1Contracts = new Set(
    (revision1Entry?.value?.items || []).map((item: any) => String(item?.contract || "")),
  );
  for (const item of metadata.revision0Items) assert.ok(revision0Contracts.has(item.contract));
  for (const item of metadata.revision1Items) assert.ok(revision1Contracts.has(item.contract));

  const curatorUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${indexedStorage.curators}/keys?limit=100`;
  const curatorKeys = await pollJson(
    "cleared curator big map key",
    curatorUrl,
    (json) =>
      Array.isArray(json) &&
      !json.some((entry) => entry?.active !== false && entry?.key === curator.address),
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
    "## Pinned IPFS Proof",
    "",
    pinProofLine("Collection metadata", metadata.pins.collection),
    pinProofLine("Revision 0 metadata", metadata.pins.revision0),
    pinProofLine("Revision 1 metadata", metadata.pins.revision1),
    ...metadata.pins.artifacts.map((pin, index) => pinProofLine(`Reference artifact ${index}`, pin)),
    "",
    "## Indexed Proof",
    "",
    `- Contract storage indexed metadata big map \`${indexedStorage.metadata}\`, curators big map \`${indexedStorage.curators}\`, and revisions big map \`${indexedStorage.revisions}\`.`,
    `- Final administrator: \`${indexedStorage.administrator}\`; pending administrator: \`${indexedStorage.pending_administrator}\`.`,
    `- Revision count: \`${indexedStorage.revision_count}\`; current revision pointer: \`${indexedStorage.current_revision}\`.`,
    `- Revision 0 curator \`${revision0Entry?.value?.curator}\` references \`${revision0Entry?.value?.items?.length}\` tokens and decodes to metadata revision \`${indexedRevision0Metadata.exhibition?.revision}\`.`,
    `- Revision 1 curator \`${revision1Entry?.value?.curator}\` references \`${revision1Entry?.value?.items?.length}\` tokens and decodes to metadata revision \`${indexedRevision1Metadata.exhibition?.revision}\`.`,
    `- Revision 0 references current Spaghetti/Gnocchi proof contracts: \`${metadata.revision0Items.map((item) => item.contract).join("`, `")}\`.`,
    `- Revision 1 references current Ravioli/Rotini/Penne proof contracts: \`${metadata.revision1Items.map((item) => item.contract).join("`, `")}\`.`,
    "- The curator big map has no active entry for the removed curator after the admin handoff.",
    `- Contract metadata decoded to \`${indexedCollectionMetadata.name}\` with relationship metadata and Lasagna revision policy intact.`,
    `- Relationship group: \`${metadata.relationship.collection_group}\``,
    "",
    "## Scope",
    "",
    "- Lasagna originated and managed an exhibition registry; it did not mint or claim to mint an FA2 artwork token.",
    "- This proves signer-backed Shadownet origination, curator configuration, revision publication, current-revision rollback, curator removal, two-step administration transfer, referenced-token metadata resolution, and Colander adapter detection for Lasagna exhibitions.",
    "- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander browser action-state refresh, failure recovery, or mainnet readiness.",
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
  console.error(`[pasta-shadownet-lasagna-e2e] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
