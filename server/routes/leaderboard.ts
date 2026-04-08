import { Router } from "express";
import { getTokenHolders, getTokenTransfers } from "../tzkt";
import { resolveMultipleDomains } from "../teznames";
import { resolveMultipleProfiles } from "../tzprofiles";
import { db } from "../db";
import { userWallets, users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { formatWtf } from "@shared/types";
import type { LeaderboardEntry } from "@shared/types";

const router = Router();

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
    res.json(transfers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transfers" });
  }
});

export default router;
