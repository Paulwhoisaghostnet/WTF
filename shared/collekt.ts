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
  creatorAddress?: string;
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
