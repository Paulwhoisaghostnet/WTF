import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { horfWalletBlacklist } from "@shared/schema";
import { getHorfSeasonSnapshot } from "../features/horf/ledger";
import { isTezosWallet } from "../features/horf/model";
import { HORF_SEASONS, resolveHorfSeason } from "../features/horf/seasons";

const router = Router();

router.get("/api/horf/season", async (req, res) => {
  const suppliedAddress = req.query.address;
  if (suppliedAddress != null && !isTezosWallet(suppliedAddress)) {
    return res.status(400).json({ error: "A valid Tezos wallet address is required" });
  }
  const suppliedSeason = req.query.season;
  if (suppliedSeason != null && typeof suppliedSeason !== "string") {
    return res.status(400).json({ error: "Invalid horse trading season" });
  }
  const season = resolveHorfSeason(suppliedSeason);
  if (!season) {
    return res.status(400).json({ error: "Unknown horse trading season", seasons: HORF_SEASONS });
  }
  try {
    const snapshot = await getHorfSeasonSnapshot(suppliedAddress || null, season);
    const addresses = [...new Set([...snapshot.leaderboard.map((entry) => entry.address),
      ...(snapshot.currentUser ? [snapshot.currentUser.address] : [])])];
    const blocked = addresses.length
      ? await db.select({ address: horfWalletBlacklist.address }).from(horfWalletBlacklist)
        .where(and(inArray(horfWalletBlacklist.address, addresses), eq(horfWalletBlacklist.active, true)))
      : [];
    const active = new Set(blocked.map((row) => row.address));
    res.json({ ...snapshot,
      leaderboard: snapshot.leaderboard.map((entry) => ({ ...entry, blacklisted: active.has(entry.address) })),
      currentUser: snapshot.currentUser ? { ...snapshot.currentUser,
        blacklisted: active.has(snapshot.currentUser.address) } : null,
    });
  } catch (error) {
    console.error("[horf] season read failed:", error);
    res.status(503).json({
      season,
      seasons: HORF_SEASONS,
      asOf: null,
      status: "error",
      error: "The horse trade ledger is unavailable. Please try again shortly.",
      nextRefreshAt: null,
      leaderboard: [],
      currentUser: null,
    });
  }
});

export default router;
