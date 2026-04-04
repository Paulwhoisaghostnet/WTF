import { Router } from "express";
import { db } from "../db";
import { userOwnedTokens, userWallets } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { resolveDomain } from "../teznames";
import { getOwnedFa2TokensPage, getTokenBalance } from "../tzkt";

const router = Router();

async function syncWalletOwnedTokens(userId: number, walletAddress: string) {
  const pageSize = 250;
  let offset = 0;
  let keepGoing = true;
  const seen = new Set<string>();

  while (keepGoing) {
    const page = await getOwnedFa2TokensPage(walletAddress, pageSize, offset);
    const tokens = page.items;

    for (const token of tokens) {
      const key = `${token.contract}:${token.tokenId}`;
      seen.add(key);

      const existing = await db
        .select({ id: userOwnedTokens.id })
        .from(userOwnedTokens)
        .where(
          and(
            eq(userOwnedTokens.userId, userId),
            eq(userOwnedTokens.walletAddress, walletAddress),
            eq(userOwnedTokens.tokenContract, token.contract),
            eq(userOwnedTokens.tokenId, token.tokenId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(userOwnedTokens)
          .set({
            balance: token.balance,
            tokenName: token.name ?? null,
            tokenSymbol: token.symbol ?? null,
            tokenThumbnail: token.thumbnail ?? null,
            metadata: token.metadata ?? null,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userOwnedTokens.id, existing[0].id));
      } else {
        await db.insert(userOwnedTokens).values({
          userId,
          walletAddress,
          tokenContract: token.contract,
          tokenId: token.tokenId,
          balance: token.balance,
          tokenName: token.name ?? null,
          tokenSymbol: token.symbol ?? null,
          tokenThumbnail: token.thumbnail ?? null,
          metadata: token.metadata ?? null,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    keepGoing = page.hasMore;
    offset = page.nextOffset;
  }

  const existingRows = await db
    .select({
      id: userOwnedTokens.id,
      tokenContract: userOwnedTokens.tokenContract,
      tokenId: userOwnedTokens.tokenId,
    })
    .from(userOwnedTokens)
    .where(
      and(
        eq(userOwnedTokens.userId, userId),
        eq(userOwnedTokens.walletAddress, walletAddress)
      )
    );

  for (const row of existingRows) {
    const key = `${row.tokenContract}:${row.tokenId}`;
    if (!seen.has(key)) {
      await db.delete(userOwnedTokens).where(eq(userOwnedTokens.id, row.id));
    }
  }
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
        eq(userOwnedTokens.tokenId, 0)
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
      tokenId: 0,
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
    res.json(wallets);
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
