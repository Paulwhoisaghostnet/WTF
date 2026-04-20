/**
 * /api/portfolio/* — analytics surface for the cockpit dashboard.
 *
 * Feeds the per-wallet + total portfolio overview, recent-activity
 * widgets, and per-token market cards.  All user-scoped endpoints are
 * guarded by `isAuthenticated`; per-token market is public because the
 * numbers are already public-chain data.
 *
 * Endpoints
 * ──────────
 *   GET  /api/portfolio/summary
 *        User-wide totals + per-wallet breakdown (cost basis, P&L,
 *        mark-to-market estimate, realised proceeds).
 *
 *   GET  /api/portfolio/summary/:address
 *        Deep per-wallet slice including top 20 positions by value.
 *        403 if the wallet is not linked to the caller.
 *
 *   GET  /api/portfolio/activity/acquisitions?limit=20
 *        Most recent buys + mints across the caller's wallets.
 *
 *   GET  /api/portfolio/activity/sales?limit=20
 *        Most recent sales by the caller's wallets, paired with cost
 *        basis + realised P&L per row.
 *
 *   GET  /api/portfolio/tokens/:contract/:tokenId/market
 *        Public per-token metrics (floor, last sale, unique owners,
 *        avg listing, royalties/fees lifetime, etc.).
 */

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { userWallets } from "@shared/schema";
import {
  getPortfolioSummary,
  getWalletDeepSlice,
  getRecentAcquisitions,
  getRecentSales,
  getTokenMarket,
} from "../lib/portfolio-analytics";

const router = Router();

router.get("/api/portfolio/summary", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const summary = await getPortfolioSummary(user.id);
    res.json(summary);
  } catch (err) {
    console.error("[portfolio] GET /summary failed:", err);
    res.status(500).json({ error: "Failed to load portfolio summary" });
  }
});

router.get(
  "/api/portfolio/summary/:address",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const address = String(req.params.address ?? "").trim();
      if (!address) return res.status(400).json({ error: "address required" });

      // Ownership check — reject requests for wallets not linked to
      // this user.  Prevents /summary/:address becoming a leaky
      // public endpoint for arbitrary wallets.
      const owned = await db
        .select({ id: userWallets.id })
        .from(userWallets)
        .where(
          and(
            eq(userWallets.userId, user.id),
            eq(userWallets.walletAddress, address)
          )
        )
        .limit(1);
      if (!owned.length) {
        return res
          .status(403)
          .json({ error: "wallet not linked to this account" });
      }

      const deep = await getWalletDeepSlice(user.id, address);
      if (!deep.slice) {
        return res.json({ slice: null, topPositionsByValue: [] });
      }
      res.json(deep);
    } catch (err) {
      console.error("[portfolio] GET /summary/:address failed:", err);
      res.status(500).json({ error: "Failed to load wallet slice" });
    }
  }
);

router.get(
  "/api/portfolio/activity/acquisitions",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const limit = parseInt(String(req.query.limit ?? "20"), 10);
      const rows = await getRecentAcquisitions(user.id, limit);
      res.json({ rows, fetchedAt: new Date().toISOString() });
    } catch (err) {
      console.error("[portfolio] GET /activity/acquisitions failed:", err);
      res.status(500).json({ error: "Failed to load acquisitions" });
    }
  }
);

router.get(
  "/api/portfolio/activity/sales",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const limit = parseInt(String(req.query.limit ?? "20"), 10);
      const rows = await getRecentSales(user.id, limit);
      res.json({ rows, fetchedAt: new Date().toISOString() });
    } catch (err) {
      console.error("[portfolio] GET /activity/sales failed:", err);
      res.status(500).json({ error: "Failed to load sales" });
    }
  }
);

router.get(
  "/api/portfolio/tokens/:contract/:tokenId/market",
  async (req, res) => {
    try {
      const contract = String(req.params.contract ?? "").trim();
      const tokenId = String(req.params.tokenId ?? "").trim();
      if (!contract || !tokenId) {
        return res
          .status(400)
          .json({ error: "contract and tokenId required" });
      }
      const metrics = await getTokenMarket(contract, tokenId);
      if (!metrics) {
        return res.status(404).json({
          error: "no market data for this token yet",
          contract,
          tokenId,
        });
      }
      res.json(metrics);
    } catch (err) {
      console.error("[portfolio] GET /tokens/:c/:t/market failed:", err);
      res.status(500).json({ error: "Failed to load token market" });
    }
  }
);

export default router;
