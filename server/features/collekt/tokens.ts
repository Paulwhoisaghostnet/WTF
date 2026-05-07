import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db";
import { syncWalletPortfolioFromTzkt } from "../../lib/portfolio-sync";
import {
  tokenMetadata,
  userWallets,
  walletHoldings,
} from "@shared/schema";
import type {
  CollektPagination,
  CollektTokenItem,
  CollektTokenRow,
  CollektTokensResponse,
  CollektWalletScope,
} from "@shared/collekt";

const lastSeenExpr = sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;

export interface CollektTokensQuery {
  limit: number;
  offset: number;
  q: string;
  wallet: string;
  contract: string;
  refresh: boolean;
}

export type CollektTokensResult =
  | { ok: true; data: CollektTokensResponse }
  | { ok: false; status: 403; error: string };

export function parseCollektTokensQuery(query: Record<string, unknown>): CollektTokensQuery {
  return {
    limit: Math.min(500, Math.max(1, parseInt(readQuery(query, "limit") || "20", 10))),
    offset: Math.max(0, parseInt(readQuery(query, "offset") || "0", 10)),
    q: readQuery(query, "q").trim(),
    wallet: readQuery(query, "wallet").trim(),
    contract: readQuery(query, "contract").trim(),
    refresh: readQuery(query, "refresh") === "1",
  };
}

export async function loadCollektTokens(
  userId: number,
  query: CollektTokensQuery
): Promise<CollektTokensResult> {
  const wallets = await db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));

  if (query.refresh) {
    for (const linkedWallet of wallets) {
      await syncWalletPortfolioFromTzkt(userId, linkedWallet.walletAddress);
    }
  }

  const walletAddresses = wallets.map((row) => row.walletAddress);
  const walletScope = resolveCollektWalletScope(walletAddresses, query.wallet);
  if (!walletScope.ok) {
    return {
      ok: false,
      status: walletScope.status,
      error: walletScope.error,
    };
  }

  if (walletScope.walletAddresses.length === 0) {
    return {
      ok: true,
      data: emptyCollektTokensResponse(query.limit, query.offset),
    };
  }

  const whereParts: any[] = [
    eq(walletHoldings.userId, userId),
    inArray(walletHoldings.walletAddress, walletScope.walletAddresses),
  ];

  if (query.contract) whereParts.push(eq(walletHoldings.tokenContract, query.contract));
  if (query.q) {
    const like = `%${query.q}%`;
    whereParts.push(
      sql`(
        COALESCE(${tokenMetadata.name}, '') ILIKE ${like}
        OR COALESCE(${tokenMetadata.raw}::text, '') ILIKE ${like}
        OR ${walletHoldings.tokenContract} ILIKE ${like}
        OR CAST(${walletHoldings.tokenId} AS TEXT) ILIKE ${like}
      )`
    );
  }

  const rows = await db
    .select({
      id: walletHoldings.id,
      walletAddress: walletHoldings.walletAddress,
      tokenContract: walletHoldings.tokenContract,
      tokenId: walletHoldings.tokenId,
      balance: walletHoldings.balance,
      tokenName: tokenMetadata.name,
      metaName: sql<string | null>`${tokenMetadata.raw} ->> 'name'`,
      tokenSymbol: tokenMetadata.symbol,
      tokenThumbnail: tokenMetadata.thumbnail,
      metadata: tokenMetadata.raw,
      creatorFromMeta: sql<string | null>`COALESCE(${tokenMetadata.creatorAddress}, ${tokenMetadata.raw} -> 'creators' ->> 0)`,
      derivedAt: lastSeenExpr,
      onTradeBoard: tradeBoardListedSql(userId),
      tradeBoardQuantity: tradeBoardQtySql(userId),
    })
    .from(walletHoldings)
    .leftJoin(
      tokenMetadata,
      and(
        eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
        eq(tokenMetadata.tokenId, walletHoldings.tokenId)
      )
    )
    .where(and(...whereParts))
    .orderBy(sql`${lastSeenExpr} DESC NULLS LAST`)
    .limit(query.limit)
    .offset(query.offset);

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(walletHoldings)
    .leftJoin(
      tokenMetadata,
      and(
        eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
        eq(tokenMetadata.tokenId, walletHoldings.tokenId)
      )
    )
    .where(and(...whereParts));
  const total = Number(totalRows[0]?.count ?? 0);

  const contractRows = await db
    .select({ tokenContract: walletHoldings.tokenContract })
    .from(walletHoldings)
    .where(
      and(
        eq(walletHoldings.userId, userId),
        inArray(walletHoldings.walletAddress, walletScope.walletAddresses)
      )
    )
    .groupBy(walletHoldings.tokenContract)
    .orderBy(asc(walletHoldings.tokenContract));

  return {
    ok: true,
    data: {
      items: rows.map(toCollektTokenItem),
      contracts: contractRows.map((row) => row.tokenContract),
      pagination: buildCollektPagination(query.limit, query.offset, total, rows.length),
      source: {
        provider: "wtfgameshow",
        endpoint: "/api/collekt/tokens",
      },
    },
  };
}

export function toCollektTokenItem(row: CollektTokenRow): CollektTokenItem {
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
    creatorAddress: row.creatorFromMeta || undefined,
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

function emptyCollektTokensResponse(limit: number, offset: number): CollektTokensResponse {
  return {
    items: [],
    contracts: [],
    pagination: buildCollektPagination(limit, offset, 0, 0),
    source: {
      provider: "wtfgameshow",
      endpoint: "/api/collekt/tokens",
    },
  };
}

function tradeBoardListedSql(userId: number) {
  return sql`EXISTS (
    SELECT 1 FROM collection_items ci
    INNER JOIN collections col ON col.id = ci.collection_id
    WHERE col.user_id = ${userId}
      AND col.type = 'trade_board_listing'
      AND ci.token_contract = ${walletHoldings.tokenContract}
      AND ci.token_id = ${walletHoldings.tokenId}
  )`;
}

function tradeBoardQtySql(userId: number) {
  return sql<number>`COALESCE((
    SELECT ci.quantity FROM collection_items ci
    INNER JOIN collections col ON col.id = ci.collection_id
    WHERE col.user_id = ${userId}
      AND col.type = 'trade_board_listing'
      AND ci.token_contract = ${walletHoldings.tokenContract}
      AND ci.token_id = ${walletHoldings.tokenId}
    LIMIT 1
  ), 0)`;
}

function readQuery(query: Record<string, unknown>, key: string) {
  const value = query[key];
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
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
