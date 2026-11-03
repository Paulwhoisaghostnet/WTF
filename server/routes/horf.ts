import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { horfWalletBlacklist } from "@shared/schema";
import { getHorfAllTimeSnapshot, getHorfSeasonSnapshot } from "../features/horf/ledger";
import { isTezosWallet } from "../features/horf/model";
import { HORF_ALL_TIME_SEASON, HORF_SEASON_CHOICES, resolveHorfSeason } from "../features/horf/seasons";
import { loadHorfTraderNames } from "../features/horf/trader-names";

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
  const season = suppliedSeason === "all-time" ? HORF_ALL_TIME_SEASON : resolveHorfSeason(suppliedSeason);
  if (!season) {
    return res.status(400).json({ error: "Unknown horse trading season", seasons: HORF_SEASON_CHOICES });
  }
  try {
    const snapshot = suppliedSeason === "all-time"
      ? await getHorfAllTimeSnapshot(suppliedAddress || null)
      : await getHorfSeasonSnapshot(suppliedAddress || null, season);
    const addresses = [...new Set([...snapshot.leaderboard.map((entry) => entry.address),
      ...(snapshot.currentUser ? [snapshot.currentUser.address] : [])])];
    const [blocked, names] = await Promise.all([
      addresses.length
        ? db.select({ address: horfWalletBlacklist.address }).from(horfWalletBlacklist)
          .where(and(inArray(horfWalletBlacklist.address, addresses), eq(horfWalletBlacklist.active, true)))
        : [],
      loadHorfTraderNames(addresses),
    ]);
    const active = new Set(blocked.map((row) => row.address));
    res.json({ ...snapshot,
      leaderboard: snapshot.leaderboard.map((entry) => ({ ...entry,
        name: names.get(entry.address)?.displayName ?? null,
        blacklisted: active.has(entry.address) })),
      currentUser: snapshot.currentUser ? { ...snapshot.currentUser,
        name: names.get(snapshot.currentUser.address)?.displayName ?? null,
        blacklisted: active.has(snapshot.currentUser.address) } : null,
    });
  } catch (error) {
    console.error("[horf] season read failed:", error);
    res.status(503).json({
      season,
      seasons: HORF_SEASON_CHOICES,
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
