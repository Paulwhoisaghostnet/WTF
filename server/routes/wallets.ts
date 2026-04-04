import { Router } from "express";
import { db } from "../db";
import { userOwnedTokens, userWallets } from "@shared/schema";
import { eq, and, desc, sql, lt } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { resolveDomain } from "../teznames";
import { getOwnedFa2TokensPage, getTokenBalance } from "../tzkt";

const router = Router();

async function syncWalletOwnedTokens(userId: number, walletAddress: string) {
  const pageSize = 250;
  let offset = 0;
  let keepGoing = true;
  const syncStartedAt = new Date();

  while (keepGoing) {
    const page = await getOwnedFa2TokensPage(walletAddress, pageSize, offset);
    const tokens = page.items;

    if (tokens.length > 0) {
      const updatedAt = new Date();
      const rows = tokens.map((token) => ({
          userId,
          walletAddress,
          tokenContract: token.contract,
          tokenId: token.tokenId,
          balance: token.balance,
          tokenName: typeof token.name === "string" ? token.name : null,
          tokenSymbol: typeof token.symbol === "string" ? token.symbol : null,
          tokenThumbnail: token.thumbnail ?? null,
          metadata: token.metadata ?? null,
          lastSeenAt: syncStartedAt,
          updatedAt,
        }));

      await db
        .insert(userOwnedTokens)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            userOwnedTokens.userId,
            userOwnedTokens.walletAddress,
            userOwnedTokens.tokenContract,
            userOwnedTokens.tokenId,
          ],
          set: {
            balance: sql`excluded.balance`,
            tokenName: sql`excluded.token_name`,
            tokenSymbol: sql`excluded.token_symbol`,
            tokenThumbnail: sql`excluded.token_thumbnail`,
            metadata: sql`excluded.metadata`,
            lastSeenAt: sql`excluded.last_seen_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    keepGoing = page.hasMore;
    offset = page.nextOffset;
  }

  await db
    .delete(userOwnedTokens)
    .where(
      and(
        eq(userOwnedTokens.userId, userId),
        eq(userOwnedTokens.walletAddress, walletAddress),
        sql`${userOwnedTokens.tokenContract} <> 'WTF'`,
        lt(userOwnedTokens.lastSeenAt, syncStartedAt)
      )
    )
    .returning({ id: userOwnedTokens.id });
}

async function syncWalletPortfolio(userId: number, walletAddress: string) {
  await syncWalletOwnedTokens(userId, walletAddress);
  const wtf = await getTokenBalance(walletAddress);
  const wtfBalance = String(wtf?.balance ?? "0");

  const existingWtf = await db
    .select({ id: userOwnedTokens.id })
    .from(userOwnedTokens)
    .where(
      and(
        eq(userOwnedTokens.userId, userId),
        eq(userOwnedTokens.walletAddress, walletAddress),
        eq(userOwnedTokens.tokenContract, "WTF"),
        eq(userOwnedTokens.tokenId, "0")
      )
    )
    .limit(1);

  if (existingWtf.length > 0) {
    await db
      .update(userOwnedTokens)
      .set({
        balance: wtfBalance,
        tokenName: "WTF",
        tokenSymbol: "WTF",
        tokenThumbnail: null,
        metadata: { synthetic: true, source: "tzkt_wtf_balance" } as any,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userOwnedTokens.id, existingWtf[0].id));
  } else {
    await db.insert(userOwnedTokens).values({
      userId,
      walletAddress,
      tokenContract: "WTF",
      tokenId: "0",
      balance: wtfBalance,
      tokenName: "WTF",
      tokenSymbol: "WTF",
      tokenThumbnail: null,
      metadata: { synthetic: true, source: "tzkt_wtf_balance" } as any,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

router.get("/api/wallets", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const wallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));

    const countsRows = await db
      .select({
        walletAddress: userOwnedTokens.walletAddress,
        tokenCount: sql<number>`count(*)`,
      })
      .from(userOwnedTokens)
      .where(eq(userOwnedTokens.userId, user.id))
      .groupBy(userOwnedTokens.walletAddress);

    const countMap = new Map(
      countsRows.map((r) => [r.walletAddress, Number(r.tokenCount)])
    );

    res.json(
      wallets.map((w) => ({
        ...w,
        tokenCount: countMap.get(w.walletAddress) ?? 0,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch wallets" });
  }
});

router.post("/api/wallets", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const { walletAddress } = req.body;

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
      // Idempotent link for the same user.
      await syncWalletPortfolio(user.id, walletAddress);
      return res.status(200).json(existing[0]);
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

    await db.delete(userWallets).where(eq(userWallets.id, walletId));
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

router.get("/api/profile/tokens", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const limit = Math.min(
      200,
      Math.max(1, parseInt((req.query.limit as string) || "48", 10))
    );
    const offset = Math.max(
      0,
      parseInt((req.query.offset as string) || "0", 10)
    );
    const q = String(req.query.q || "").trim();
    const wallet = String(req.query.wallet || "").trim();

    const whereParts = [eq(userOwnedTokens.userId, user.id)];
    if (wallet) {
      whereParts.push(eq(userOwnedTokens.walletAddress, wallet));
    }
    if (q) {
      whereParts.push(
        sql`(${userOwnedTokens.tokenName} ILIKE ${`%${q}%`} OR ${userOwnedTokens.tokenContract} ILIKE ${`%${q}%`} OR CAST(${userOwnedTokens.tokenId} AS TEXT) ILIKE ${`%${q}%`})`
      );
    }

    const rows = await db
      .select()
      .from(userOwnedTokens)
      .where(and(...whereParts))
      .orderBy(desc(userOwnedTokens.lastSeenAt))
      .limit(limit)
      .offset(offset);

    const totalRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(userOwnedTokens)
      .where(and(...whereParts));
    const total = Number(totalRows[0]?.count ?? 0);

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        contract: r.tokenContract,
        tokenId: r.tokenId,
        balance: r.balance,
        name: r.tokenName || undefined,
        symbol: r.tokenSymbol || undefined,
        thumbnail: r.tokenThumbnail || undefined,
        metadata: (r.metadata as any) || undefined,
        walletAddress: r.walletAddress,
        updatedAt: r.updatedAt,
      })),
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
      await syncWalletOwnedTokens(user.id, wallet.walletAddress);
      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userOwnedTokens)
        .where(
          and(
            eq(userOwnedTokens.userId, user.id),
            eq(userOwnedTokens.walletAddress, wallet.walletAddress)
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
        eq(userOwnedTokens.userId, user.id),
        eq(userOwnedTokens.walletAddress, address),
      ];
      if (q) {
        whereParts.push(
          sql`(${userOwnedTokens.tokenName} ILIKE ${`%${q}%`} OR ${userOwnedTokens.tokenContract} ILIKE ${`%${q}%`} OR CAST(${userOwnedTokens.tokenId} AS TEXT) ILIKE ${`%${q}%`})`
        );
      }

      const rows = await db
        .select()
        .from(userOwnedTokens)
        .where(and(...whereParts))
        .orderBy(desc(userOwnedTokens.lastSeenAt))
        .limit(limit)
        .offset(offset);

      const totalRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(userOwnedTokens)
        .where(and(...whereParts));
      const total = Number(totalRows[0]?.count ?? 0);

      return res.json({
        items: rows.map((r) => ({
          contract: r.tokenContract,
          tokenId: r.tokenId,
          balance: r.balance,
          name: r.tokenName || undefined,
          symbol: r.tokenSymbol || undefined,
          thumbnail: r.tokenThumbnail || undefined,
          metadata: (r.metadata as any) || undefined,
        })),
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

export default router;
