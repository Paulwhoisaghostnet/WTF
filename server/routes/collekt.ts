import { Router } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { syncWalletPortfolioFromTzkt } from "../lib/portfolio-sync";
import {
  tokenMetadata,
  userWallets,
  walletHoldings,
} from "@shared/schema";
import {
  buildCollektPagination,
  resolveCollektWalletScope,
  toCollektTokenItem,
} from "../lib/collekt-tokens";
import {
  resolveTokenDisplayIdentities,
  tokenIdentityKey,
} from "../lib/tezos-identity";

const router = Router();

const lastSeenExpr = sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;

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

router.get("/api/collekt/session", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as {
      id: number;
      username: string;
      displayName?: string | null;
      avatarUrl?: string | null;
    };

    const wallets = await db
      .select({
        id: userWallets.id,
        walletAddress: userWallets.walletAddress,
        tezDomain: userWallets.tezDomain,
        isPrimary: userWallets.isPrimary,
        lastSyncedAt: userWallets.lastSyncedAt,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .orderBy(asc(userWallets.id));

    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      wallets,
      gallery: {
        id: "wtf:me",
        path: "/wtf",
        moduleUrl: process.env.COLLEKT_MODULE_URL || null,
      },
    });
  } catch (err) {
    console.error("[collekt] GET /api/collekt/session failed:", err);
    res.status(500).json({ error: "Failed to load colleKT session" });
  }
});

router.get("/api/collekt/tokens", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const limit = Math.min(
      500,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10))
    );
    const offset = Math.max(
      0,
      parseInt((req.query.offset as string) || "0", 10)
    );
    const q = String(req.query.q || "").trim();
    const wallet = String(req.query.wallet || "").trim();
    const contract = String(req.query.contract || "").trim();
    const refresh = String(req.query.refresh || "") === "1";

    const wallets = await db
      .select({ walletAddress: userWallets.walletAddress })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));

    if (refresh) {
      for (const linkedWallet of wallets) {
        await syncWalletPortfolioFromTzkt(user.id, linkedWallet.walletAddress);
      }
    }

    const walletAddresses = wallets.map((row) => row.walletAddress);
    const walletScope = resolveCollektWalletScope(walletAddresses, wallet);
    if (!walletScope.ok) {
      return res.status(walletScope.status).json({ error: walletScope.error });
    }

    if (walletScope.walletAddresses.length === 0) {
      return res.json({
        items: [],
        contracts: [],
        pagination: buildCollektPagination(limit, offset, 0, 0),
        source: {
          provider: "wtfgameshow",
          endpoint: "/api/collekt/tokens",
        },
      });
    }

    const whereParts: any[] = [
      eq(walletHoldings.userId, user.id),
      inArray(walletHoldings.walletAddress, walletScope.walletAddresses),
    ];

    if (contract) whereParts.push(eq(walletHoldings.tokenContract, contract));
    if (q) {
      const like = `%${q}%`;
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
        onTradeBoard: tradeBoardListedSql(user.id),
        tradeBoardQuantity: tradeBoardQtySql(user.id),
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
      .limit(limit)
      .offset(offset);

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
          eq(walletHoldings.userId, user.id),
          inArray(walletHoldings.walletAddress, walletScope.walletAddresses)
        )
      )
      .groupBy(walletHoldings.tokenContract)
      .orderBy(asc(walletHoldings.tokenContract));

    const tokenIdentities = await resolveTokenDisplayIdentities(
      rows.map((row) => ({
        tokenContract: row.tokenContract,
        tokenId: row.tokenId,
        tokenName: row.tokenName || row.metaName,
        metadata: row.metadata,
        creatorAddress: row.creatorFromMeta,
      }))
    );

    res.json({
      items: rows.map((row) =>
        toCollektTokenItem(
          row,
          tokenIdentities.get(tokenIdentityKey(row.tokenContract, row.tokenId))
        )
      ),
      contracts: contractRows.map((row) => row.tokenContract),
      pagination: buildCollektPagination(limit, offset, total, rows.length),
      source: {
        provider: "wtfgameshow",
        endpoint: "/api/collekt/tokens",
      },
    });
  } catch (err) {
    console.error("[collekt] GET /api/collekt/tokens failed:", err);
    res.status(500).json({ error: "Failed to load colleKT tokens" });
  }
});

export default router;
