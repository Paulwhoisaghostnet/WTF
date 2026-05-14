import { Router } from "express";
import { db } from "../db";
import { userWallets, walletHoldings, tokenMetadata } from "@shared/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { resolveDomain } from "../teznames";
import { getOwnedFa2TokensPage, getTokenBalance } from "../tzkt";
import {
  createWalletAuthNonce,
  consumeWalletAuthNonce,
} from "../auth/storage";
import {
  buildChallengeMessage,
  verifyWalletSignature,
  verifyPublicKeyOwnership,
} from "../auth/wallet-verify";
import {
  getWalletDossier,
  getUserDossier,
  scheduleBackfill,
} from "../lib/wallet-events";
import { mirrorTradeBoardChange } from "../lib/collections-mirror";
import { syncWalletPortfolioFromTzkt } from "../lib/portfolio-sync";
import {
  resolveTokenDisplayIdentities,
  tokenIdentityKey,
} from "../lib/tezos-identity";
import {
  primaryTezosDomain,
  resolveTezosDomainsIdentity,
} from "../lib/tezos-domains";
import {
  buildConsoleTokenProvenanceMap,
  mergeConsoleProvenanceIntoMetadata,
} from "../features/console/provenance";
import { ingestSystemEvent } from "../challenges/events/ingest";

const router = Router();

async function syncWalletPortfolio(userId: number, walletAddress: string) {
  await syncWalletPortfolioFromTzkt(userId, walletAddress);
}

router.get("/api/wallets", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const wallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));

    // Token counts are enriched from `wallet_holdings` which only exists
    // after cockpit migration 0010.  Degrade gracefully if that table is
    // missing or the query fails — wallets are authoritative on their own
    // and must NEVER be hidden just because a derived table is absent.
    let countMap = new Map<string, number>();
    try {
      const countsRows = await db
        .select({
          walletAddress: walletHoldings.walletAddress,
          tokenCount: sql<number>`count(*)::int`,
        })
        .from(walletHoldings)
        .where(eq(walletHoldings.userId, user.id))
        .groupBy(walletHoldings.walletAddress);
      countMap = new Map(
        countsRows.map((r) => [r.walletAddress, Number(r.tokenCount)])
      );
    } catch (countsErr) {
      console.warn(
        "[wallets] wallet_holdings counts unavailable (missing migration?):",
        countsErr
      );
    }

    const domainRows = await Promise.allSettled(
      wallets.map((wallet) => resolveTezosDomainsIdentity(wallet.walletAddress))
    );
    const domainMap = new Map(
      domainRows.map((result, index) => [
        wallets[index]?.walletAddress,
        result.status === "fulfilled"
          ? result.value
          : { reverseDomain: null, ownedDomains: [] },
      ])
    );

    res.json(
      wallets.map((w) => {
        const domains = domainMap.get(w.walletAddress);
        return {
          ...w,
          tezDomain: primaryTezosDomain(domains, w.tezDomain ?? null),
          ownedTezosDomains: domains?.ownedDomains ?? [],
          tokenCount: countMap.get(w.walletAddress) ?? 0,
        };
      })
    );
  } catch (err) {
    console.error("[wallets] GET /api/wallets failed:", err);
    res.status(500).json({ error: "Failed to fetch wallets" });
  }
});

router.post("/api/wallets/challenge", isAuthenticated, async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || !walletAddress.startsWith("tz")) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    const nonce = await createWalletAuthNonce(walletAddress);
    const message = buildChallengeMessage(nonce);
    res.json({ nonce, message });
  } catch (err) {
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

router.post("/api/wallets", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const { walletAddress, publicKey, signature, nonce } = req.body;

    if (!walletAddress || !walletAddress.startsWith("tz")) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const existing = await db
      .select()
      .from(userWallets)
      .where(
        and(
          eq(userWallets.userId, user.id),
          eq(userWallets.walletAddress, walletAddress)
        )
      );
    if (existing.length > 0) {
      await syncWalletPortfolio(user.id, walletAddress);
      scheduleBackfill(walletAddress, "relink");
      void Promise.all([
        ingestSystemEvent({
          eventType: "user.wallet.connected",
          userId: user.id,
          walletAddress,
          source: "wallets",
          sourceModule: "wallets",
          rawRefType: "user_wallet",
          rawRefId: existing[0]!.id,
          metadata: { relink: true },
        }),
        ingestSystemEvent({
          eventType: "app.interaction.tracked",
          userId: user.id,
          walletAddress,
          source: "wallets",
          sourceModule: "wallets",
          rawRefType: "user_wallet",
          rawRefId: existing[0]!.id,
          metadata: { interaction: "wallet_relinked" },
        }),
      ]).catch((err) =>
        console.warn("[wallets] failed to emit wallet relink SystemEvent", err)
      );
      return res.status(200).json(existing[0]);
    }

    if (!publicKey || !signature || !nonce) {
      return res
        .status(400)
        .json({ error: "Signature proof required to link a new wallet" });
    }

    if (!verifyPublicKeyOwnership(walletAddress, publicKey)) {
      return res.status(401).json({ error: "Public key does not match wallet address" });
    }

    const nonceValid = await consumeWalletAuthNonce(walletAddress, nonce);
    if (!nonceValid) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }

    const message = buildChallengeMessage(nonce);
    const sigValid = verifyWalletSignature(message, signature, publicKey);
    if (!sigValid) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    const owners = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.walletAddress, walletAddress));
    if (owners.length > 0 && owners[0].userId !== user.id) {
      return res
        .status(409)
        .json({ error: "Wallet is already linked to another account" });
    }

    const tezDomain = await resolveDomain(walletAddress);

    const existingWallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));

    const [wallet] = await db
      .insert(userWallets)
      .values({
        userId: user.id,
        walletAddress,
        tezDomain,
        isPrimary: existingWallets.length === 0,
      })
      .returning();

    await syncWalletPortfolio(user.id, walletAddress);
    scheduleBackfill(walletAddress, "wallet-link");
    void Promise.all([
      ingestSystemEvent({
        eventId: `user.wallet.connected:${wallet.id}`,
        eventType: "user.wallet.connected",
        userId: user.id,
        walletAddress,
        source: "wallets",
        sourceModule: "wallets",
        rawRefType: "user_wallet",
        rawRefId: wallet.id,
        metadata: {
          isPrimary: wallet.isPrimary,
          tezDomain,
        },
      }),
      ingestSystemEvent({
        eventId: `app.interaction.tracked:wallet-linked:${wallet.id}`,
        eventType: "app.interaction.tracked",
        userId: user.id,
        walletAddress,
        source: "wallets",
        sourceModule: "wallets",
        rawRefType: "user_wallet",
        rawRefId: wallet.id,
        metadata: { interaction: "wallet_linked", isPrimary: wallet.isPrimary },
      }),
    ]).catch((err) =>
      console.warn("[wallets] failed to emit wallet link SystemEvent", err)
    );
    res.status(201).json(wallet);
  } catch (err) {
    res.status(500).json({ error: "Failed to link wallet" });
  }
});

router.delete("/api/wallets/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const walletId = parseInt(req.params.id as string);

    const [wallet] = await db
      .select()
      .from(userWallets)
      .where(
        and(eq(userWallets.id, walletId), eq(userWallets.userId, user.id))
      );
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    await db
      .delete(walletHoldings)
      .where(
        and(
          eq(walletHoldings.userId, user.id),
          eq(walletHoldings.walletAddress, wallet.walletAddress)
        )
      );

    await db.delete(userWallets).where(eq(userWallets.id, walletId));

    const remaining = await db
      .select({ id: userWallets.id })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));

    if (remaining.length > 0 && wallet.isPrimary) {
      await db
        .update(userWallets)
        .set({ isPrimary: true })
        .where(eq(userWallets.id, remaining[0]!.id));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to unlink wallet" });
  }
});

router.put(
  "/api/wallets/:id/primary",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const walletId = parseInt(req.params.id as string);

      await db
        .update(userWallets)
        .set({ isPrimary: false })
        .where(eq(userWallets.userId, user.id));

      const [updated] = await db
        .update(userWallets)
        .set({ isPrimary: true })
        .where(
          and(eq(userWallets.id, walletId), eq(userWallets.userId, user.id))
        )
        .returning();

      if (!updated)
        return res.status(404).json({ error: "Wallet not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to set primary" });
    }
  }
);

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

router.get("/api/profile/tokens", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const limit = Math.min(
      500,
      Math.max(1, parseInt((req.query.limit as string) || "48", 10))
    );
    const offset = Math.max(
      0,
      parseInt((req.query.offset as string) || "0", 10)
    );
    const q = String(req.query.q || "").trim();
    const wallet = String(req.query.wallet || "").trim();
    const contract = String(req.query.contract || "").trim();
    const tradeBoardFilter = String(req.query.onTradeBoard || "").trim();
    const createdByMe = String(req.query.createdByMe || "").trim();
    const sortBy = String(req.query.sortBy || "lastSeenAt").trim();
    const sortDir = String(req.query.sortDir || "desc").trim().toLowerCase();

    const userWalletAddresses = (
      await db
        .select({ walletAddress: userWallets.walletAddress })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
    ).map((w) => w.walletAddress);

    const whereParts: any[] = [eq(walletHoldings.userId, user.id)];
    if (wallet) {
      whereParts.push(eq(walletHoldings.walletAddress, wallet));
    }
    if (contract) {
      whereParts.push(eq(walletHoldings.tokenContract, contract));
    }
    if (tradeBoardFilter === "true") {
      whereParts.push(tradeBoardListedSql(user.id));
    } else if (tradeBoardFilter === "false") {
      whereParts.push(sql`NOT (${tradeBoardListedSql(user.id)})`);
    }
    if (createdByMe === "true" && userWalletAddresses.length > 0) {
      whereParts.push(
        sql`(${sql.join(
          userWalletAddresses.map(
            (a) =>
              sql`POSITION(${a} IN COALESCE(${tokenMetadata.raw}::text, '')) > 0`
          ),
          sql` OR `
        )})`
      );
    } else if (createdByMe === "false" && userWalletAddresses.length > 0) {
      whereParts.push(
        sql`NOT (${sql.join(
          userWalletAddresses.map(
            (a) =>
              sql`POSITION(${a} IN COALESCE(${tokenMetadata.raw}::text, '')) > 0`
          ),
          sql` OR `
        )})`
      );
    }
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

    const sortCol =
      sortBy === "name"
        ? sql`LOWER(COALESCE(${tokenMetadata.name}, ${tokenMetadata.raw} ->> 'name', ''))`
        : sortBy === "contract"
          ? walletHoldings.tokenContract
          : sortBy === "tokenId"
            ? sql`CASE WHEN ${walletHoldings.tokenId} ~ '^[0-9]+$' THEN CAST(${walletHoldings.tokenId} AS NUMERIC) ELSE 0 END`
            : sortBy === "balance"
              ? sql`CASE WHEN ${walletHoldings.balance} ~ '^[0-9]+$' THEN CAST(${walletHoldings.balance} AS NUMERIC) ELSE 0 END`
              : sortBy === "updatedAt"
                ? walletHoldings.derivedAt
                : lastSeenExpr;
    const orderSql =
      sortDir === "asc" ? sql`${sortCol} ASC NULLS LAST` : sql`${sortCol} DESC NULLS LAST`;

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
        derivedAt: walletHoldings.derivedAt,
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
      .orderBy(orderSql)
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
      .where(eq(walletHoldings.userId, user.id))
      .groupBy(walletHoldings.tokenContract)
      .orderBy(asc(walletHoldings.tokenContract));

    const tokenIdentities = await resolveTokenDisplayIdentities(
      rows.map((r) => ({
        tokenContract: r.tokenContract,
        tokenId: r.tokenId,
        tokenName: r.tokenName || r.metaName,
        metadata: r.metadata,
        creatorAddress: r.creatorFromMeta,
      }))
    );
    const provenanceByToken = await buildConsoleTokenProvenanceMap(
      rows.map((r) => ({
        tokenContract: r.tokenContract,
        tokenId: r.tokenId,
        tokenName: r.tokenName || r.metaName,
        metadata: r.metadata,
        source: "tezos-token",
      }))
    );

    res.json({
      items: rows.map((r) => {
        const identity = tokenIdentities.get(
          tokenIdentityKey(r.tokenContract, r.tokenId)
        );
        const provenance =
          provenanceByToken.get(tokenIdentityKey(r.tokenContract, r.tokenId)) ?? null;
        return {
          id: r.id,
          contract: r.tokenContract,
          tokenId: r.tokenId,
          balance: r.balance,
          name: (r.tokenName || r.metaName || undefined) as string | undefined,
          symbol: r.tokenSymbol || undefined,
          thumbnail: r.tokenThumbnail || undefined,
          metadata:
            (mergeConsoleProvenanceIntoMetadata(r.metadata, provenance) as any) ||
            undefined,
          provenance,
          walletAddress: r.walletAddress,
          creatorName: identity?.creatorName || undefined,
          creatorAddress: identity?.creatorAddress || r.creatorFromMeta || undefined,
          collectionName: identity?.collectionName || undefined,
          onTradeBoard: Boolean(r.onTradeBoard),
          tradeBoardQuantity: Number(r.tradeBoardQuantity ?? 0),
          updatedAt: r.derivedAt,
        };
      }),
      contracts: contractRows.map((c) => c.tokenContract),
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + rows.length < total,
        nextOffset: offset + rows.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile tokens" });
  }
});

router.post("/api/profile/tokens/trade-board", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const { tokenIds, add, quantity } = req.body as {
      tokenIds: number[];
      add: boolean;
      quantity?: number;
    };
    if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
      return res.status(400).json({ error: "tokenIds must be a non-empty array of owned token row ids" });
    }
    if (tokenIds.length > 500) {
      return res.status(400).json({ error: "Max 500 tokens per request" });
    }

    if (!add) {
      const rowsForMirror = await db
        .select({
          tokenContract: walletHoldings.tokenContract,
          tokenId: walletHoldings.tokenId,
        })
        .from(walletHoldings)
        .where(
          and(
            eq(walletHoldings.userId, user.id),
            inArray(walletHoldings.id, tokenIds)
          )
        );
      void mirrorTradeBoardChange({
        action: "remove",
        userId: user.id,
        tokens: rowsForMirror.map((r) => ({
          tokenContract: r.tokenContract,
          tokenId: r.tokenId,
        })),
      });
      return res.json({ ok: true, updated: tokenIds.length, onTradeBoard: false });
    }

    const rows = await db
      .select({
        id: walletHoldings.id,
        balance: walletHoldings.balance,
        tokenContract: walletHoldings.tokenContract,
        tokenId: walletHoldings.tokenId,
      })
      .from(walletHoldings)
      .where(
        and(
          eq(walletHoldings.userId, user.id),
          inArray(walletHoldings.id, tokenIds)
        )
      );

    const mirrorTokens: Array<{
      tokenContract: string;
      tokenId: string;
      quantity: number;
    }> = [];
    for (const row of rows) {
      const balance = Math.max(1, parseInt(row.balance, 10) || 1);
      const qty = quantity != null
        ? Math.min(Math.max(1, quantity), balance)
        : balance;
      mirrorTokens.push({
        tokenContract: row.tokenContract,
        tokenId: row.tokenId,
        quantity: qty,
      });
    }

    void mirrorTradeBoardChange({
      action: "add",
      userId: user.id,
      tokens: mirrorTokens,
    });

    res.json({ ok: true, updated: rows.length, onTradeBoard: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update trade board status" });
  }
});

router.post("/api/profile/tokens/sync", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const wallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));

    if (wallets.length === 0) {
      return res.status(400).json({ error: "No linked wallets to sync" });
    }

    let totalSynced = 0;
    for (const wallet of wallets) {
      await syncWalletPortfolioFromTzkt(user.id, wallet.walletAddress);
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(walletHoldings)
        .where(
          and(
            eq(walletHoldings.userId, user.id),
            eq(walletHoldings.walletAddress, wallet.walletAddress)
          )
        );
      const walletCount = Number(countRow?.count ?? 0);
      totalSynced += walletCount;
    }

    res.json({ ok: true, walletsProcessed: wallets.length, totalTokens: totalSynced });
  } catch (err) {
    res.status(500).json({ error: "Failed to sync all wallets" });
  }
});

router.get("/api/wallets/:address/balance", async (req, res) => {
  try {
    const balance = await getTokenBalance(req.params.address as string);
    res.json(balance || { balance: "0" });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

router.get("/api/wallets/:address/tokens", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const address = req.params.address as string;
    if (!address || !address.startsWith("tz")) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const [wallet] = await db
      .select()
      .from(userWallets)
      .where(
        and(
          eq(userWallets.userId, user.id),
          eq(userWallets.walletAddress, address)
        )
      );
    if (!wallet) {
      return res
        .status(403)
        .json({ error: "Wallet is not linked to your account" });
    }

    const limit = Math.min(
      200,
      Math.max(1, parseInt((req.query.limit as string) || "50", 10))
    );
    const offset = Math.max(0, parseInt((req.query.offset as string) || "0", 10));
    const q = String(req.query.q || "").trim();

    try {
      if (String(req.query.refresh || "") === "1") {
        await syncWalletPortfolio(user.id, address);
      }

      const whereParts = [
        eq(walletHoldings.userId, user.id),
        eq(walletHoldings.walletAddress, address),
      ];
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
          tokenContract: walletHoldings.tokenContract,
          tokenId: walletHoldings.tokenId,
          balance: walletHoldings.balance,
          tokenName: tokenMetadata.name,
          metaName: sql<string | null>`${tokenMetadata.raw} ->> 'name'`,
          tokenSymbol: tokenMetadata.symbol,
          tokenThumbnail: tokenMetadata.thumbnail,
          metadata: tokenMetadata.raw,
          creatorFromMeta: sql<string | null>`COALESCE(${tokenMetadata.creatorAddress}, ${tokenMetadata.raw} -> 'creators' ->> 0)`,
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
        .orderBy(desc(lastSeenExpr))
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

      const tokenIdentities = await resolveTokenDisplayIdentities(
        rows.map((r) => ({
          tokenContract: r.tokenContract,
          tokenId: r.tokenId,
          tokenName: r.tokenName || r.metaName,
          metadata: r.metadata,
          creatorAddress: r.creatorFromMeta,
        }))
      );

      return res.json({
        items: rows.map((r) => {
          const identity = tokenIdentities.get(
            tokenIdentityKey(r.tokenContract, r.tokenId)
          );
          return {
            contract: r.tokenContract,
            tokenId: r.tokenId,
            balance: r.balance,
            name: (r.tokenName || r.metaName || undefined) as string | undefined,
            symbol: r.tokenSymbol || undefined,
            thumbnail: r.tokenThumbnail || undefined,
            metadata: (r.metadata as any) || undefined,
            creatorName: identity?.creatorName || undefined,
            creatorAddress: identity?.creatorAddress || r.creatorFromMeta || undefined,
            collectionName: identity?.collectionName || undefined,
          };
        }),
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + rows.length < total,
          nextOffset: offset + rows.length,
        },
        source: "db",
      });
    } catch (dbErr) {
      // Fallback for environments where DB index table is unavailable/outdated.
      const page = await getOwnedFa2TokensPage(address, limit, offset);
      const filtered = q
        ? page.items.filter((t) => {
            const hay = `${t.name || ""} ${t.contract} ${t.tokenId}`.toLowerCase();
            return hay.includes(q.toLowerCase());
          })
        : page.items;
      return res.json({
        items: filtered,
        pagination: {
          limit,
          offset,
          total: offset + filtered.length + (page.hasMore ? 1 : 0),
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        },
        source: "tzkt_fallback",
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch wallet tokens" });
  }
});

router.post("/api/wallets/:address/sync", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const address = req.params.address as string;
    if (!address || !address.startsWith("tz")) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const [wallet] = await db
      .select()
      .from(userWallets)
      .where(
        and(
          eq(userWallets.userId, user.id),
          eq(userWallets.walletAddress, address)
        )
      );
    if (!wallet) {
      return res
        .status(403)
        .json({ error: "Wallet is not linked to your account" });
    }

    await syncWalletPortfolio(user.id, address);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to sync wallet portfolio" });
  }
});

/* ─────────────────────────────────────────────────────────
 * Dossier endpoints
 *
 * Visibility model: a user can inspect a dossier only for a
 * wallet they have linked to their own account.  Admins have a
 * dedicated endpoint in routes/admin.ts that can inspect any
 * user's dossier.
 * ───────────────────────────────────────────────────────── */

async function userOwnsWallet(
  userId: number,
  walletAddress: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: userWallets.id })
    .from(userWallets)
    .where(
      and(
        eq(userWallets.userId, userId),
        eq(userWallets.walletAddress, walletAddress)
      )
    )
    .limit(1);
  return Boolean(row);
}

/** Dossier for a single wallet. */
router.get(
  "/api/wallets/:address/dossier",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const address = String(req.params.address || "");
      if (!address.startsWith("tz")) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      if (!(await userOwnsWallet(user.id, address))) {
        return res.status(403).json({ error: "Not your wallet" });
      }
      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1),
        500
      );
      const dossier = await getWalletDossier(address, { limit });
      res.json({ walletAddress: address, ...dossier });
    } catch (err) {
      console.error("[wallet-events] dossier fetch failed:", err);
      res.status(500).json({ error: "Failed to load dossier" });
    }
  }
);

/** Aggregate dossier across every wallet linked to the current user. */
router.get("/api/profile/dossier", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1),
      500
    );
    const dossier = await getUserDossier(user.id, { limit });
    res.json(dossier);
  } catch (err) {
    console.error("[wallet-events] profile dossier fetch failed:", err);
    res.status(500).json({ error: "Failed to load dossier" });
  }
});

/**
 * Force a fresh backfill of this wallet.  Returns immediately with 202
 * and lets the backfill run in the background.  The dossier UI should
 * poll `/api/wallets/:address/dossier` after kicking this off.
 */
router.post(
  "/api/wallets/:address/resync",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const address = String(req.params.address || "");
      if (!address.startsWith("tz")) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      if (!(await userOwnsWallet(user.id, address))) {
        return res.status(403).json({ error: "Not your wallet" });
      }
      scheduleBackfill(address, "user-resync");
      res.status(202).json({ ok: true, walletAddress: address });
    } catch (err) {
      console.error("[wallet-events] user resync failed:", err);
      res.status(500).json({ error: "Failed to start resync" });
    }
  }
);

export default router;
