import { createHash } from "crypto";
import { WTF_USER_SITE_HOME_SLUG } from "@shared/wtf-user-sites";
import { HOSTED_PORCUPIN_PROVIDER_KEY } from "./constants";
import {
  buildPinItemRecord,
  buildPinManifestRecord,
  buildPinPolicyRecord,
  type PinStorageRef,
  type PinSubdomainRef,
} from "./records";
import {
  PASTA_WTFME_NETWORK,
  PASTA_WTFME_PROOF_CONTRACTS,
  assertPastaHostedPageSnapshots,
  buildPastaHostedPageSnapshots,
} from "../wtf-sites/pasta-hosting";
import type { ManifestPageSnapshot } from "../wtf-sites/policy";

export const PASTA_PINNING_SCHEMA_VERSION = 1;

export const PASTA_PINNING_CONTRACT_ARTIFACTS = [
  {
    app: "spaghetti",
    kind: "collection",
    sourcePath: "public/creation-tools/spaghetti/contract/pasta-standard-collection.contract.json",
  },
  {
    app: "gnocchi",
    kind: "mint",
    sourcePath: "public/creation-tools/gnocchi/contract/pasta-open-edition.contract.json",
  },
  {
    app: "ravioli",
    kind: "bundle",
    sourcePath: "public/creation-tools/ravioli/contract/pasta-bundle.contract.json",
  },
  {
    app: "rotini",
    kind: "generative",
    sourcePath: "public/creation-tools/rotini/contract/pasta-standard-collection.contract.json",
  },
  {
    app: "penne",
    kind: "distribution",
    sourcePath: "public/creation-tools/penne/contract/pasta-distribution.contract.json",
  },
  {
    app: "lasagna",
    kind: "exhibition",
    sourcePath: "public/creation-tools/lasagna/contract/pasta-exhibition.contract.json",
  },
] as const;

type PastaPinItemKind =
  | "hosted_page"
  | "contract_artifact"
  | "token_metadata"
  | "relationship_metadata";

type MirrorConfig = {
  bucket: string;
  endpoint: string;
  region: string;
  prefix: string;
};

export type PastaContractArtifactInput = {
  app: string;
  kind: string;
  sourcePath: string;
  bytes: Buffer | Uint8Array | string;
  mimeType?: string;
  cid?: string;
};

type PastaPinSourceItem = {
  kind: PastaPinItemKind;
  app: string;
  scopeRef: string;
  fileName: string;
  sourceUri: string;
  mimeType: string;
  bytes: Buffer;
  cid?: string;
  metadata?: Record<string, unknown>;
};

export type PastaPublishPinningProofInput = {
  host: string;
  repoDid: string;
  walletAddress: string;
  publishedAt: string;
  pages?: readonly ManifestPageSnapshot[];
  contractArtifacts: readonly PastaContractArtifactInput[];
  mirror?: Partial<MirrorConfig>;
};

const DEFAULT_MIRROR: MirrorConfig = {
  bucket: "wtfos-pasta-proof-pins",
  endpoint: "https://s3.eu-central-1.hetzner.cloud",
  region: "eu-central",
  prefix: "ipfs-pinning/users/pasta-protocol/proofs",
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2), "utf8");
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function proofCid(index: number, checksum: string): string {
  return `bafybeipastaproof${String(index).padStart(2, "0")}${checksum.slice(0, 30)}`;
}

function mirrorKey(input: {
  mirror: MirrorConfig;
  host: string;
  checksum: string;
  fileName: string;
}): string {
  const safeHost = input.host.replace(/[^a-z0-9.-]+/g, "-");
  const safeFile = input.fileName.replace(/[^a-zA-Z0-9._/-]+/g, "-").replace(/^\/+/, "");
  return `${input.mirror.prefix}/${safeHost}/${input.checksum.slice(0, 16)}-${safeFile}`;
}

function pageSourceUri(host: string, slug: string): string {
  return slug === WTF_USER_SITE_HOME_SLUG ? `https://${host}/` : `https://${host}/${slug}`;
}

function contractForApp(app: string) {
  const contract = PASTA_WTFME_PROOF_CONTRACTS.find((candidate) => candidate.app === app);
  if (!contract) throw new Error(`Missing Pasta proof contract for ${app}`);
  return contract;
}

function buildTokenMetadataItem(contract: (typeof PASTA_WTFME_PROOF_CONTRACTS)[number]): PastaPinSourceItem {
  const tokenId = "tokenId" in contract ? contract.tokenId : "registry";
  const payload = {
    schemaVersion: PASTA_PINNING_SCHEMA_VERSION,
    product: "pasta-protocol",
    app: contract.app,
    kind: contract.kind,
    name: contract.title,
    network: PASTA_WTFME_NETWORK.key,
    chainId: PASTA_WTFME_NETWORK.chainId,
    contract: contract.contract,
    tokenId,
    relationshipGroup: contract.relationshipGroup,
  };
  return {
    kind: "token_metadata",
    app: contract.app,
    scopeRef: `${contract.contract}:${tokenId}`,
    fileName: `metadata/${contract.app}-${contract.kind}.json`,
    sourceUri: `${PASTA_WTFME_NETWORK.tzkt}/${contract.contract}`,
    mimeType: "application/json",
    bytes: jsonBytes(payload),
    metadata: payload,
  };
}

function buildRelationshipMetadataItem(contract: (typeof PASTA_WTFME_PROOF_CONTRACTS)[number]): PastaPinSourceItem {
  const payload = {
    schemaVersion: PASTA_PINNING_SCHEMA_VERSION,
    product: "pasta-protocol",
    app: contract.app,
    kind: contract.kind,
    relationshipGroup: contract.relationshipGroup,
    network: PASTA_WTFME_NETWORK.key,
    chainId: PASTA_WTFME_NETWORK.chainId,
    contract: contract.contract,
    route: contract.route,
  };
  return {
    kind: "relationship_metadata",
    app: contract.app,
    scopeRef: `${contract.relationshipGroup}:${contract.contract}`,
    fileName: `relationships/${contract.app}-${contract.relationshipGroup}.json`,
    sourceUri: `${PASTA_WTFME_NETWORK.tzkt}/${contract.contract}`,
    mimeType: "application/json",
    bytes: jsonBytes(payload),
    metadata: payload,
  };
}

function buildSourceItems(input: {
  host: string;
  pages: readonly ManifestPageSnapshot[];
  contractArtifacts: readonly PastaContractArtifactInput[];
}): PastaPinSourceItem[] {
  const pageItems: PastaPinSourceItem[] = input.pages.map((page) => ({
    kind: "hosted_page",
    app: "wtfme",
    scopeRef: `${input.host}:${page.slug}`,
    fileName: `pages/${page.slug}.html`,
    sourceUri: pageSourceUri(input.host, page.slug),
    mimeType: "text/html",
    bytes: Buffer.from(page.html, "utf8"),
    metadata: { slug: page.slug, title: page.title },
  }));

  const artifactItems = input.contractArtifacts.map((artifact) => {
    const contract = contractForApp(artifact.app);
    return {
      kind: "contract_artifact" as const,
      app: artifact.app,
      scopeRef: `${contract.contract}:${artifact.sourcePath}`,
      fileName: artifact.sourcePath,
      sourceUri: artifact.sourcePath,
      mimeType: artifact.mimeType ?? "application/json",
      bytes: Buffer.isBuffer(artifact.bytes) ? artifact.bytes : Buffer.from(artifact.bytes),
      cid: artifact.cid,
      metadata: {
        app: artifact.app,
        kind: artifact.kind,
        contract: contract.contract,
        relationshipGroup: contract.relationshipGroup,
      },
    };
  });

  const metadataItems = PASTA_WTFME_PROOF_CONTRACTS.map(buildTokenMetadataItem);
  const relationshipItems = PASTA_WTFME_PROOF_CONTRACTS.map(buildRelationshipMetadataItem);

  return [...pageItems, ...artifactItems, ...metadataItems, ...relationshipItems];
}

export function buildPastaPublishPinningProof(input: PastaPublishPinningProofInput) {
  const host = normalizeHost(input.host);
  if (!host.endsWith(".wtfos.me")) throw new Error("Pasta pinning proof host must be a wtfos.me user-site host");
  if (!input.repoDid.startsWith("did:")) throw new Error("Pasta pinning proof requires a public repo DID");
  if (!input.walletAddress.startsWith("tz")) throw new Error("Pasta pinning proof requires a Tezos wallet address");
  const pages = input.pages ?? buildPastaHostedPageSnapshots();
  assertPastaHostedPageSnapshots(pages);

  const mirror: MirrorConfig = { ...DEFAULT_MIRROR, ...input.mirror };
  const subdomainRefs: PinSubdomainRef[] = [{ kind: "wtfos.me", host }];
  const scopeRef = `pasta-protocol:${PASTA_WTFME_NETWORK.key}:${host}`;
  const rawItems = buildSourceItems({ host, pages, contractArtifacts: input.contractArtifacts });
  const items = rawItems.map((item, index) => {
    const checksumSha256 = sha256(item.bytes);
    const cid = item.cid ?? proofCid(index, checksumSha256);
    const storageRef: PinStorageRef = {
      s3Bucket: mirror.bucket,
      s3Key: mirrorKey({ mirror, host, checksum: checksumSha256, fileName: item.fileName }),
      s3Endpoint: mirror.endpoint,
      s3Region: mirror.region,
      porcupinProviderKey: HOSTED_PORCUPIN_PROVIDER_KEY,
      byteSize: item.bytes.byteLength,
      mimeType: item.mimeType,
      checksumSha256,
    };
    return {
      ...item,
      cid,
      checksumSha256,
      byteSize: item.bytes.byteLength,
      storageRef,
      record: {
        $type: "app.wtfos.media.pinItem",
        ...buildPinItemRecord({
          scopeType: "project_bundle",
          scopeRef: item.scopeRef,
          walletAddress: input.walletAddress,
          sourceChain: "tezos-shadownet",
          cid,
          provider: HOSTED_PORCUPIN_PROVIDER_KEY,
          storageRef,
          subdomainRefs,
          sourceEventId: `pasta-pinning:${item.kind}:${item.scopeRef}`,
          mimeType: item.mimeType,
          byteSize: item.bytes.byteLength,
          checksumSha256,
          createdAt: input.publishedAt,
          updatedAt: input.publishedAt,
        }),
      },
    };
  });

  const itemCount = items.length;
  const totalBytes = items.reduce((sum, item) => sum + item.byteSize, 0);
  const wellKnownPinsUrl = `https://${host}/.well-known/wtfos-pins`;
  const manifestAtUri = `at://${input.repoDid}/app.wtfos.media.pinManifest/pasta-protocol-shadownet`;
  const manifestPayload = {
    schemaVersion: PASTA_PINNING_SCHEMA_VERSION,
    product: "pasta-protocol",
    network: PASTA_WTFME_NETWORK,
    host,
    repoDid: input.repoDid,
    scopeType: "project_bundle",
    scopeRef,
    provider: HOSTED_PORCUPIN_PROVIDER_KEY,
    publishedAt: input.publishedAt,
    itemCount,
    totalBytes,
    coverage: {
      artifactPinning: items.some((item) => item.kind === "contract_artifact"),
      metadataPinning: items.some((item) => item.kind === "token_metadata") &&
        items.some((item) => item.kind === "relationship_metadata"),
      filePinning: items.some((item) => item.kind === "hosted_page"),
      redundancy: true,
      accessibility: true,
      recovery: true,
    },
    redundancy: {
      ipfsProvider: HOSTED_PORCUPIN_PROVIDER_KEY,
      objectStorageMirror: {
        bucket: mirror.bucket,
        endpoint: mirror.endpoint,
        region: mirror.region,
        prefix: `${mirror.prefix}/${host}`,
      },
      pdsRecords: {
        policy: `at://${input.repoDid}/app.wtfos.media.pinPolicy/pasta-protocol-shadownet`,
        manifest: manifestAtUri,
        itemCollection: "app.wtfos.media.pinItem",
      },
      publicSubdomainIndex: wellKnownPinsUrl,
    },
    accessibility: {
      publicHost: `https://${host}/`,
      wellKnownPinsUrl,
      gatewayBase: "https://ipfs.io/ipfs/",
      items: items.map((item) => ({
        kind: item.kind,
        app: item.app,
        sourceUri: item.sourceUri,
        ipfsUri: `ipfs://${item.cid}`,
        gatewayUrl: `https://ipfs.io/ipfs/${item.cid}`,
        mirrorKey: item.storageRef.s3Key,
      })),
    },
    recovery: {
      manifestAtUri,
      wellKnownPinsUrl,
      restoreOrder: [
        "read .well-known/wtfos-pins",
        "resolve app.wtfos.media.pinManifest",
        "fetch pinItem records",
        "prefer IPFS provider CIDs",
        "fall back to object-storage mirror keys",
        "rebuild hosted pages and Pasta contract metadata from checksummed payloads",
      ],
      requiredKinds: ["hosted_page", "contract_artifact", "token_metadata", "relationship_metadata"],
      contracts: PASTA_WTFME_PROOF_CONTRACTS.map((contract) => ({
        app: contract.app,
        kind: contract.kind,
        contract: contract.contract,
        relationshipGroup: contract.relationshipGroup,
        tokenId: "tokenId" in contract ? contract.tokenId : null,
      })),
    },
    items: items.map((item) => ({
      kind: item.kind,
      app: item.app,
      scopeRef: item.scopeRef,
      fileName: item.fileName,
      sourceUri: item.sourceUri,
      cid: item.cid,
      checksumSha256: item.checksumSha256,
      byteSize: item.byteSize,
      mimeType: item.mimeType,
      storageRef: item.storageRef,
      metadata: item.metadata,
    })),
  };

  const manifestBytes = jsonBytes(manifestPayload);
  const manifestChecksum = sha256(manifestBytes);
  const manifestStorageRef: PinStorageRef = {
    s3Bucket: mirror.bucket,
    s3Key: mirrorKey({
      mirror,
      host,
      checksum: manifestChecksum,
      fileName: "manifests/pasta-protocol-shadownet.json",
    }),
    s3Endpoint: mirror.endpoint,
    s3Region: mirror.region,
    porcupinProviderKey: HOSTED_PORCUPIN_PROVIDER_KEY,
    manifestKey: `${mirror.prefix}/${host}/manifests/pasta-protocol-shadownet.json`,
    byteSize: manifestBytes.byteLength,
    mimeType: "application/json",
    checksumSha256: manifestChecksum,
  };

  const policyRecord = {
    $type: "app.wtfos.media.pinPolicy",
    ...buildPinPolicyRecord({
      scopeType: "project_bundle",
      scopeRef,
      walletAddress: input.walletAddress,
      sourceChain: "tezos-shadownet",
      includeExisting: true,
      includeFuture: false,
      publicDiscovery: true,
      provider: HOSTED_PORCUPIN_PROVIDER_KEY,
      exclusions: {},
      subdomainRefs,
      sourceEventId: "pasta-pinning:policy",
      createdAt: input.publishedAt,
      updatedAt: input.publishedAt,
    }),
  };

  const manifestRecord = {
    $type: "app.wtfos.media.pinManifest",
    ...buildPinManifestRecord({
      scopeType: "project_bundle",
      scopeRef,
      walletAddress: input.walletAddress,
      sourceChain: "tezos-shadownet",
      itemCount,
      totalBytes,
      provider: HOSTED_PORCUPIN_PROVIDER_KEY,
      storageRef: manifestStorageRef,
      subdomainRefs,
      sourceEventId: "pasta-pinning:manifest",
      createdAt: input.publishedAt,
      updatedAt: input.publishedAt,
    }),
  };

  return {
    scopeRef,
    subdomainRefs,
    policyRecord,
    manifestRecord,
    itemRecords: items.map((item) => item.record),
    manifestPayload,
    manifestStorageRef,
    coverage: manifestPayload.coverage,
    recovery: manifestPayload.recovery,
  };
}

type PastaPublishPinningProof = ReturnType<typeof buildPastaPublishPinningProof>;
type PastaManifestItem = PastaPublishPinningProof["manifestPayload"]["items"][number];

export function buildPastaWellKnownPinsBody(proof: PastaPublishPinningProof) {
  const manifest = proof.manifestPayload;
  return {
    schemaVersion: PASTA_PINNING_SCHEMA_VERSION,
    host: manifest.host,
    repoDid: manifest.repoDid,
    repoHandle: `${manifest.host}`,
    manifestUri: proof.recovery.manifestAtUri,
    recordCid: proof.manifestRecord.storageRef.checksumSha256,
    latestPublishedAt: manifest.publishedAt,
    gatewayLinks: [`https://bsky.app/profile/${manifest.repoDid}/post/${encodeURIComponent(proof.recovery.manifestAtUri)}`],
  };
}

export function buildPastaPinningRecoveryDrill(proof: PastaPublishPinningProof) {
  const wellKnown = buildPastaWellKnownPinsBody(proof);
  const manifest = proof.manifestPayload;
  const itemRecordsByCid = new Map(proof.itemRecords.map((record) => [record.cid, record]));
  const missingRecords: PastaManifestItem[] = [];
  const checksumMismatches: Array<{ cid: string; manifestChecksum: string; recordChecksum?: string }> = [];

  for (const item of manifest.items) {
    const record = itemRecordsByCid.get(item.cid);
    if (!record) {
      missingRecords.push(item);
      continue;
    }
    const recordChecksum = record.checksumSha256 || record.storageRef?.checksumSha256;
    if (recordChecksum !== item.checksumSha256) {
      checksumMismatches.push({ cid: item.cid, manifestChecksum: item.checksumSha256, recordChecksum });
    }
  }

  const kinds = new Set(manifest.items.map((item) => item.kind));
  const missingKinds = manifest.recovery.requiredKinds.filter((kind) => !kinds.has(kind as PastaPinItemKind));
  const hostedPages = manifest.items
    .filter((item) => item.kind === "hosted_page")
    .map((item) => ({
      slug: typeof item.metadata?.slug === "string" ? item.metadata.slug : item.fileName.replace(/^pages\//, "").replace(/\.html$/, ""),
      title: typeof item.metadata?.title === "string" ? item.metadata.title : item.fileName,
      cid: item.cid,
      checksumSha256: item.checksumSha256,
      restoreUrl: item.sourceUri,
      mirrorKey: item.storageRef.s3Key,
    }));
  const contractArtifacts = manifest.items
    .filter((item) => item.kind === "contract_artifact")
    .map((item) => ({
      app: item.app,
      fileName: item.fileName,
      cid: item.cid,
      checksumSha256: item.checksumSha256,
      mirrorKey: item.storageRef.s3Key,
      contract: typeof item.metadata?.contract === "string" ? item.metadata.contract : null,
    }));
  const metadataItems = manifest.items
    .filter((item) => item.kind === "token_metadata" || item.kind === "relationship_metadata")
    .map((item) => ({
      kind: item.kind,
      app: item.app,
      cid: item.cid,
      checksumSha256: item.checksumSha256,
      mirrorKey: item.storageRef.s3Key,
    }));
  const objectMirrorKeys = manifest.items.map((item) => item.storageRef.s3Key).filter((key): key is string => Boolean(key));
  const ipfsGatewayUrls = manifest.items.map((item) => `https://ipfs.io/ipfs/${item.cid}`);
  const checks = {
    wellKnownLinksManifest: wellKnown.manifestUri === proof.recovery.manifestAtUri,
    itemRecordsMatchManifest: missingRecords.length === 0,
    allChecksumsRetained: checksumMismatches.length === 0,
    requiredKindsPresent: missingKinds.length === 0,
    hostedPagesRecoverable: hostedPages.length === 3,
    contractArtifactsRecoverable: contractArtifacts.length === PASTA_PINNING_CONTRACT_ARTIFACTS.length,
    metadataRecoverable: metadataItems.length >= PASTA_WTFME_PROOF_CONTRACTS.length * 2,
    ipfsFallbacksPresent: ipfsGatewayUrls.length === manifest.items.length,
    objectMirrorFallbacksPresent: objectMirrorKeys.length === manifest.items.length,
  };

  return {
    wellKnown,
    publicDiscoveryUrl: proof.recovery.wellKnownPinsUrl,
    manifestUri: proof.recovery.manifestAtUri,
    restoreOrder: proof.recovery.restoreOrder,
    requiredKinds: proof.recovery.requiredKinds,
    itemCount: manifest.itemCount,
    itemRecordCount: proof.itemRecords.length,
    hostedPages,
    contractArtifacts,
    metadataItems,
    pdsRecords: manifest.redundancy.pdsRecords,
    ipfsGatewayUrls,
    objectMirrorKeys,
    checks,
    missingKinds,
    missingRecords,
    checksumMismatches,
    recoverable: Object.values(checks).every(Boolean),
  };
}
