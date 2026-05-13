import { Router } from "express";
import { getTokenHolders, getTokenTransfers } from "../tzkt";
import { resolveMultipleDomains } from "../teznames";
import { resolveMultipleProfiles } from "../tzprofiles";
import { db } from "../db";
import { userWallets, users } from "@shared/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { formatWtf, getXpTierForTotal } from "@shared/types";
import type { LeaderboardEntry, XpLeaderboardEntry } from "@shared/types";
import { ingestSystemEvent } from "../challenges/events/ingest";
import type { SystemEventType } from "../challenges/events/types";

const router = Router();

function emitLeaderboardViewed(input: {
  eventType: SystemEventType;
  limit: number;
  offset: number;
  resultCount: number;
}): void {
  void ingestSystemEvent({
    eventType: input.eventType,
    source: "leaderboard",
    sourceModule: "leaderboard",
    rawRefType: "leaderboard_view",
    metadata: {
      limit: input.limit,
      offset: input.offset,
      resultCount: input.resultCount,
    },
  }).catch((err) => console.warn("[leaderboard] failed to emit view event", err));
}

router.get("/api/leaderboard/xp", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        experiencePoints: users.experiencePoints,
        role: users.role,
      })
      .from(users)
      .orderBy(desc(users.experiencePoints), desc(users.id))
      .limit(limit)
      .offset(offset);

    const xpBoard: XpLeaderboardEntry[] = rows.map((r, i) => {
      const xp = r.experiencePoints ?? 0;
      const tier = getXpTierForTotal(xp);
      return {
        rank: offset + i + 1,
        userId: r.id,
        username: r.username,
        displayName: r.displayName,
        experiencePoints: xp,
        role: r.role,
        xpTierLabel: tier.label,
        xpTierKey: tier.key,
      };
    });

    emitLeaderboardViewed({
      eventType: "leaderboard.xp.viewed",
      limit,
      offset,
      resultCount: xpBoard.length,
    });
    res.json(xpBoard);
  } catch (err) {
    console.error("XP leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch XP leaderboard" });
  }
});

router.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const holders = await getTokenHolders(limit, offset);

    const addresses = holders.map((h) => h.account.address);
    const domains = await resolveMultipleDomains(addresses);

    let walletLinks: any[] = [];
    try {
      walletLinks = addresses.length > 0
        ? await db
            .select({
              walletAddress: userWallets.walletAddress,
              userId: userWallets.userId,
              displayName: users.displayName,
              username: users.username,
            })
            .from(userWallets)
            .leftJoin(users, eq(userWallets.userId, users.id))
            .where(inArray(userWallets.walletAddress, addresses))
        : [];
    } catch {
      // DB not available, continue without wallet links
    }

    const walletMap = new Map(
      walletLinks.map((w) => [
        w.walletAddress,
        { userId: w.userId, displayName: w.displayName, username: w.username },
      ])
    );

    const unresolvedAddresses = addresses.filter((addr) => {
      const hasAlias = holders.find((h) => h.account.address === addr)?.account.alias;
      const hasDomain = domains.get(addr);
      const hasApp = walletMap.get(addr);
      return !hasAlias && !hasDomain && !hasApp;
    });

    let profileAliases = new Map<string, string | null>();
    if (unresolvedAddresses.length > 0) {
      try {
        profileAliases = await resolveMultipleProfiles(unresolvedAddresses);
      } catch {
        // best-effort
      }
    }

    const leaderboard: LeaderboardEntry[] = holders.map((h, i) => ({
      rank: offset + i + 1,
      address: h.account.address,
      alias:
        h.account.alias ||
        profileAliases.get(h.account.address) ||
        undefined,
      tezDomain: domains.get(h.account.address) || undefined,
      balance: h.balance,
      balanceFormatted: formatWtf(h.balance),
      transfersCount: h.transfersCount,
      userId: walletMap.get(h.account.address)?.userId,
      username: walletMap.get(h.account.address)?.username || undefined,
      displayName:
        walletMap.get(h.account.address)?.displayName ||
        walletMap.get(h.account.address)?.username ||
        undefined,
    }));

    emitLeaderboardViewed({
      eventType: "leaderboard.viewed",
      limit,
      offset,
      resultCount: leaderboard.length,
    });
    res.json(leaderboard);
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.get("/api/leaderboard/transfers", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const transfers = await getTokenTransfers(limit);
    emitLeaderboardViewed({
      eventType: "leaderboard.transfers.viewed",
      limit,
      offset: 0,
      resultCount: Array.isArray(transfers) ? transfers.length : 0,
    });
    res.json(transfers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transfers" });
  }
});

export default router;
