import { Router } from "express";
import { getTokenHolders, getTokenTransfers } from "../tzkt";
import { resolveMultipleDomains } from "../teznames";
import { resolveMultipleProfiles } from "../tzprofiles";
import { db } from "../db";
import { rewardLedger, userWallets, users, wtfSubdomainGrants, xpEvents } from "@shared/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { formatWtf, getXpTierForTotal } from "@shared/types";
import type {
  LeaderboardEntry,
  RewardOtherLeaderboardEntry,
  RewardWtfLeaderboardEntry,
  XpLeaderboardEntry,
  XpRewardLeaderboardEntry,
} from "@shared/types";
import { ingestSystemEvent } from "../challenges/events/ingest";
import type { SystemEventType } from "../challenges/events/types";

const router = Router();
const DEFAULT_LEADERBOARD_PROFILE_ALIAS_LIMIT = 20;
const DEFAULT_LEADERBOARD_PROFILE_ALIAS_TIMEOUT_MS = 5_000;

function boundedPositiveInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function leaderboardProfileAliasLimit(): number {
  return boundedPositiveInteger(
    process.env.LEADERBOARD_PROFILE_ALIAS_LIMIT,
    DEFAULT_LEADERBOARD_PROFILE_ALIAS_LIMIT,
    0,
    100
  );
}

function leaderboardProfileAliasTimeoutMs(): number {
  return boundedPositiveInteger(
    process.env.LEADERBOARD_PROFILE_ALIAS_TIMEOUT_MS,
    DEFAULT_LEADERBOARD_PROFILE_ALIAS_TIMEOUT_MS,
    250,
    20_000
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveLeaderboardProfiles(addresses: string[]): Promise<Map<string, string | null>> {
  const aliasLimit = leaderboardProfileAliasLimit();
  const sampled = aliasLimit > 0 ? addresses.slice(0, aliasLimit) : [];
  if (sampled.length === 0) return new Map();
  try {
    return await withTimeout(
      resolveMultipleProfiles(sampled),
      leaderboardProfileAliasTimeoutMs(),
      new Map<string, string | null>()
    );
  } catch {
    return new Map();
  }
}

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

router.get("/api/leaderboard/rewards/wtf", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const rows = await db
      .select({
        userId: rewardLedger.userId,
        username: users.username,
        displayName: users.displayName,
        totalEarnedWtf: sql<string>`coalesce(sum(${rewardLedger.amountWtf})::text, '0')`,
        availableWtf: sql<string>`coalesce(sum(case when ${rewardLedger.paid} = false and ${rewardLedger.settlementStatus} = 'available' then ${rewardLedger.amountWtf} else 0 end)::text, '0')`,
        pendingCashoutWtf: sql<string>`coalesce(sum(case when ${rewardLedger.paid} = false and ${rewardLedger.settlementStatus} = 'cashout_pending' then ${rewardLedger.amountWtf} else 0 end)::text, '0')`,
        alreadyPaidWtf: sql<string>`coalesce(sum(case when ${rewardLedger.paid} = true and (${rewardLedger.settlementType} is null or ${rewardLedger.settlementType} in ('cashout', 'operator_disbursement', 'admin_manual')) then ${rewardLedger.amountWtf} else 0 end)::text, '0')`,
        marketSpentWtf: sql<string>`coalesce(sum(case when ${rewardLedger.paid} = true and ${rewardLedger.settlementType} = 'market_spend' then ${rewardLedger.amountWtf} else 0 end)::text, '0')`,
      })
      .from(rewardLedger)
      .leftJoin(users, eq(rewardLedger.userId, users.id))
      .groupBy(rewardLedger.userId, users.username, users.displayName)
      .orderBy(desc(sql`sum(${rewardLedger.amountWtf})`), desc(rewardLedger.userId))
      .limit(limit)
      .offset(offset);

    const board: RewardWtfLeaderboardEntry[] = rows.map((row, i) => {
      const availableWtf = numberFromSql(row.availableWtf);
      const pendingCashoutWtf = numberFromSql(row.pendingCashoutWtf);
      return {
        rank: offset + i + 1,
        userId: row.userId,
        username: row.username ?? `user-${row.userId}`,
        displayName: row.displayName,
        totalEarnedWtf: numberFromSql(row.totalEarnedWtf),
        currentOwedWtf: availableWtf + pendingCashoutWtf,
        availableWtf,
        pendingCashoutWtf,
        alreadyPaidWtf: numberFromSql(row.alreadyPaidWtf),
        marketSpentWtf: numberFromSql(row.marketSpentWtf),
      };
    });

    res.json(board);
  } catch (err) {
    console.error("Reward WTF leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch WTF reward leaderboard" });
  }
});

router.get("/api/leaderboard/rewards/exp", async (req, res) => {
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
        totalEarnedXp: sql<string>`coalesce(sum(case when ${xpEvents.amount} > 0 then ${xpEvents.amount} else 0 end)::text, '0')`,
        totalSpentXp: sql<string>`coalesce(sum(case when ${xpEvents.amount} < 0 then abs(${xpEvents.amount}) else 0 end)::text, '0')`,
      })
      .from(users)
      .leftJoin(xpEvents, eq(xpEvents.userId, users.id))
      .groupBy(users.id)
      .orderBy(desc(users.experiencePoints), desc(users.id))
      .limit(limit)
      .offset(offset);

    const board: XpRewardLeaderboardEntry[] = rows.map((row, i) => {
      const xp = row.experiencePoints ?? 0;
      const tier = getXpTierForTotal(xp);
      return {
        rank: offset + i + 1,
        userId: row.id,
        username: row.username,
        displayName: row.displayName,
        experiencePoints: xp,
        role: row.role,
        xpTierLabel: tier.label,
        xpTierKey: tier.key,
        totalEarnedXp: numberFromSql(row.totalEarnedXp),
        totalSpentXp: numberFromSql(row.totalSpentXp),
      };
    });

    res.json(board);
  } catch (err) {
    console.error("EXP reward leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch EXP reward leaderboard" });
  }
});

router.get("/api/leaderboard/rewards/other", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const rows = await db
      .select({
        userId: wtfSubdomainGrants.userId,
        username: users.username,
        displayName: users.displayName,
        rewardCount: sql<number>`count(*)::int`,
        latestRewardAt: sql<string | null>`max(${wtfSubdomainGrants.createdAt})::text`,
      })
      .from(wtfSubdomainGrants)
      .leftJoin(users, eq(wtfSubdomainGrants.userId, users.id))
      .groupBy(wtfSubdomainGrants.userId, users.username, users.displayName)
      .orderBy(desc(sql`count(*)`), desc(wtfSubdomainGrants.userId))
      .limit(limit)
      .offset(offset);

    const board: RewardOtherLeaderboardEntry[] = rows.map((row, i) => ({
      rank: offset + i + 1,
      userId: row.userId,
      username: row.username ?? `user-${row.userId}`,
      displayName: row.displayName,
      rewardCount: Number(row.rewardCount ?? 0),
      rewardKinds: ["wtf.tez subdomain"],
      latestRewardAt: row.latestRewardAt,
    }));

    res.json(board);
  } catch (err) {
    console.error("Other reward leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch other reward leaderboard" });
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
      profileAliases = await resolveLeaderboardProfiles(unresolvedAddresses);
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

function numberFromSql(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default router;
