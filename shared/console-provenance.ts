export type ConsoleMarketplaceLinkKind =
  | "marketplace"
  | "listing"
  | "offer"
  | "explorer"
  | "source";

export type ConsoleMarketplaceLink = {
  label: string;
  url: string;
  kind: ConsoleMarketplaceLinkKind;
  marketplace?: string | null;
  listingId?: string | null;
  priceMutez?: string | null;
  editions?: number | null;
};

export type ConsoleTokenProvenance = {
  source: "tezos-token" | "static" | "upload" | "unknown";
  chain: "tezos";
  tokenContract: string;
  tokenId: string;
  tokenTitle?: string | null;
  tokenUrl: string;
  explorerUrl: string;
  creatorName?: string | null;
  creatorAddress?: string | null;
  tezosIdentity?: string | null;
  xHandle?: string | null;
  xUrl?: string | null;
  collectionName?: string | null;
  mintedAtIso?: string | null;
  marketplaceLinks: ConsoleMarketplaceLink[];
  attributionRequired: boolean;
};

export function buildObjktTokenUrl(contract: string, tokenId: string): string {
  return `https://objkt.com/tokens/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`;
}

export function buildTzktTokenUrl(contract: string, tokenId: string): string {
  return `https://tzkt.io/${encodeURIComponent(contract)}/tokens/${encodeURIComponent(tokenId)}`;
}

export function buildXProfileUrl(handle: string): string {
  return `https://x.com/${encodeURIComponent(handle.replace(/^@+/, ""))}`;
}

