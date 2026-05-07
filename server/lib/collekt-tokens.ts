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

export type CollektWalletScope =
  | { ok: true; walletAddresses: string[] }
  | { ok: false; status: 403; error: string };

export function toCollektTokenItem(
  row: CollektTokenRow,
  identity?: {
    creatorName: string | null;
    creatorAddress: string | null;
    collectionName: string | null;
  }
): CollektTokenItem {
  return {
    id: row.id,
    contract: row.tokenContract,
    tokenId: row.tokenId,
    balance: row.balance,
    name: row.tokenName || row.metaName || undefined,
    symbol: row.tokenSymbol || undefined,
    thumbnail: row.tokenThumbnail || undefined,
    metadata: isRecord(row.metadata) ? row.metadata : undefined,
    walletAddress: row.walletAddress,
    creatorName: identity?.creatorName || undefined,
    creatorAddress: identity?.creatorAddress || row.creatorFromMeta || undefined,
    collectionName: identity?.collectionName || undefined,
    updatedAt: toIsoString(row.derivedAt),
    onTradeBoard: row.onTradeBoard === true || row.onTradeBoard === "true",
    tradeBoardQuantity: Number(row.tradeBoardQuantity ?? 0),
  };
}

export function resolveCollektWalletScope(
  linkedWalletAddresses: string[],
  requestedWallet: string
): CollektWalletScope {
  const linked = Array.from(
    new Set(
      linkedWalletAddresses
        .map((walletAddress) => walletAddress.trim())
        .filter(Boolean)
    )
  );
  const requested = requestedWallet.trim();

  if (!requested) {
    return { ok: true, walletAddresses: linked };
  }

  if (!linked.includes(requested)) {
    return {
      ok: false,
      status: 403,
      error: "wallet not linked to this account",
    };
  }

  return { ok: true, walletAddresses: [requested] };
}

export function buildCollektPagination(
  limit: number,
  offset: number,
  total: number,
  rowCount: number
): CollektPagination {
  return {
    limit,
    offset,
    total,
    hasMore: offset + rowCount < total,
    nextOffset: offset + rowCount,
  };
}

function toIsoString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
