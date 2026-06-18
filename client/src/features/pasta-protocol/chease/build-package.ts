/**
 * CH-EASE → Pasta Protocol v1 package mapper.
 *
 * Pure functions that convert CH-EASE's stored package + items into the
 * `wtfos.pasta.chease-package.v1` format consumed by the publisher apps (Spaghetti, etc.).
 * No network or DOM access — unit-tested in build-package.test.ts.
 */
import {
  buildCollectionPackage,
  buildSingleTokenPackage,
  type CheaseCollectionPackage,
  type CheaseSingleTokenPackage,
  type CheaseTokenItem,
  type OwnershipRelationshipMetadata,
  type PastaAppId,
} from "@shared/pasta-protocol";

/** Minimal shape CH-EASE provides per stored media item. */
export type CheaseSourceItem = {
  tokenId: number;
  tokenName: string;
  tokenDescription?: string;
  mimeType?: string;
  mediaCid?: string | null;
  previewCid?: string | null;
  tags?: string[];
  attributes?: Array<{ name: string; value: string }>;
};

export type CheaseSourcePackage = {
  title: string;
  description?: string;
  symbol?: string;
  coverCid?: string | null;
};

function ipfsUri(cid: string | null | undefined): string | undefined {
  const trimmed = (cid || "").trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("ipfs://") ? trimmed : `ipfs://${trimmed}`;
}

/** Maps one CH-EASE source item to a Pasta CheaseTokenItem. */
export function tokenItemFromSource(item: CheaseSourceItem): CheaseTokenItem {
  return {
    name: item.tokenName,
    tokenId: item.tokenId,
    description: item.tokenDescription,
    artifactUri: ipfsUri(item.mediaCid),
    previewUri: ipfsUri(item.previewCid),
    mimeType: item.mimeType,
    tags: item.tags,
    attributes: item.attributes,
  };
}

/** Builds a v1 collection package from a CH-EASE package + its items. */
export function collectionPackageFromSource(
  targetApp: PastaAppId,
  pkg: CheaseSourcePackage,
  items: CheaseSourceItem[],
  relationship?: OwnershipRelationshipMetadata
): CheaseCollectionPackage {
  return buildCollectionPackage({
    targetApp,
    title: pkg.title,
    description: pkg.description,
    symbol: pkg.symbol,
    coverImageUri: ipfsUri(pkg.coverCid),
    relationship,
    items: items.map(tokenItemFromSource),
  });
}

/** Builds a v1 single-token package from one CH-EASE item. */
export function singleTokenPackageFromSource(
  targetApp: PastaAppId,
  item: CheaseSourceItem,
  relationship?: OwnershipRelationshipMetadata
): CheaseSingleTokenPackage {
  return buildSingleTokenPackage({
    targetApp,
    token: tokenItemFromSource(item),
    relationship,
  });
}
