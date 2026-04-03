import { Router } from "express";
import { db } from "../db";
import { userWallets } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { resolveDomain } from "../teznames";
import { getTokenBalance } from "../tzkt";

const router = Router();

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
      return res.status(409).json({ error: "Wallet already linked" });
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

export default router;
