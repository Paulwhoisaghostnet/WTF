export interface CollektUserSummary {
  id: number;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface CollektWalletSummary {
  id: number;
  walletAddress: string;
  tezDomain?: string | null;
  isPrimary: boolean;
  lastSyncedAt?: Date | string | null;
}

export interface CollektGallerySummary {
  id: "wtf:me";
  path: string;
  moduleUrl?: string | null;
}

export interface CollektSession {
  user: CollektUserSummary;
  wallets: CollektWalletSummary[];
  gallery: CollektGallerySummary;
}

export interface CollektTokenRow {
  id: number;
  tokenContract: string;
  tokenId: string;
  balance: string;
  tokenName: string | null;
  metaName: string | null;
  tokenSymbol: string | null;
  tokenThumbnail: string | null;
  metadata: unknown;
  walletAddress: string;
  creatorFromMeta: string | null;
  derivedAt: unknown;
  onTradeBoard: unknown;
  tradeBoardQuantity: unknown;
}

export interface CollektTokenItem {
  id: number;
  contract: string;
  tokenId: string;
  balance: string;
  name?: string;
  symbol?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  walletAddress: string;
  creatorName?: string;
  creatorAddress?: string;
  collectionName?: string;
  updatedAt?: string;
  onTradeBoard: boolean;
  tradeBoardQuantity: number;
}

export interface CollektPagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

export interface CollektTokensResponse {
  items: CollektTokenItem[];
  contracts: string[];
  pagination: CollektPagination;
  source: {
    provider: "wtfgameshow";
    endpoint: "/api/collekt/tokens";
  };
}

export type CollektWalletScope =
  | { ok: true; walletAddresses: string[] }
  | { ok: false; status: 403; error: string };

export interface CollektDuplicateToken {
  key: string;
  contract: string;
  tokenId: string;
  ownerAddress: string;
  name: string;
  collectionName: string | null;
  creatorAddress: string | null;
  creatorName: string | null;
  thumbnailUri: string | null;
  artifactUri: string | null;
  mimeType: string | null;
  balance: number;
  totalSupply: number;
  decimals: 0;
  acquiredAt: string | null;
  acquisitionType: "purchase" | "mint" | "free_transfer" | "unknown";
  acquisitionMarketplace: string | null;
  acquisitionEditions: number | null;
  acquisitionCostMutez: string | null;
  acquisitionUnitCostMutez: string | null;
  lastSaleMutez: string | null;
  lastSaleAt: string | null;
  deltaMutez: string | null;
  deltaPercent: number | null;
  currentFloorMutez: string | null;
  saleCount: number;
  activeListingCount: number;
  uniqueOwnersCount: number;
  firstHeldAt: string | null;
  lastChangedAt: string | null;
  provenance: {
    holdings: "tzkt";
    acquisition: "wtfos-index" | "unavailable";
    market: "wtfos-index" | "unavailable";
  };
}

export interface CollektDuplicateScanResponse {
  walletAddress: string;
  items: CollektDuplicateToken[];
  summary: {
    duplicateArtTokens: number;
    duplicateEditions: number;
    knownAcquisitionPrices: number;
    knownLastSales: number;
    excluded: {
      decimals: number;
      supply: number;
      malformed: number;
    };
  };
  filters: {
    minimumBalance: 2;
    maximumSupply: 5000;
    decimals: 0;
    standard: "fa2";
  };
  source: {
    holdings: "tzkt";
    pricing: "wtfos-index";
    network: "tezos-mainnet";
    fetchedAt: string;
    staleAfter: string;
    truncated: boolean;
  };
}
