/**
 * Weekly Thread Generator
 *
 * Compiles a weekly recap Twitter/X thread from platform data:
 *   - Top marketplace sales
 *   - New arcade high scores
 *   - New WTF members (opted-in)
 *   - Active challenges / season events
 *
 * Like the marketplace promoter, this module generates TEXT only.
 * No tweets are posted automatically; threads are queued for admin review.
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyThreadDraft {
  id: string;
  weekOf: string;               // ISO date of the Monday that started the week
  generatedAt: string;
  status: "draft" | "approved" | "posted";
  tweets: string[];             // ordered thread — tweet[0] is the opener
  stats: WeeklyStats;
}

export interface WeeklyStats {
  totalSales: number;
  totalSalesVolumeMutez: string;
  topSaleToken: string | null;
  topSalePrice: string | null;
  newMembers: number;
  arcadeGamesPlayed: number;
  topArcadeGame: string | null;
}

// ─── In-memory store ─────────────────────────────────────────────────────────

const drafts: WeeklyThreadDraft[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weekStart(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatXtz(mutez: string | number): string {
  const n = Number(mutez) / 1e6;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k ꜩ`;
  return `${n % 1 === 0 ? n : n.toFixed(1)} ꜩ`;
}

// ─── Data gathering ──────────────────────────────────────────────────────────

async function gatherWeeklyStats(since: Date, until: Date): Promise<WeeklyStats> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const defaults: WeeklyStats = {
    totalSales: 0,
    totalSalesVolumeMutez: "0",
    topSaleToken: null,
    topSalePrice: null,
    newMembers: 0,
    arcadeGamesPlayed: 0,
    topArcadeGame: null,
  };

  try {
    const [salesRows, membersRows, arcadeRows] = await Promise.allSettled([
      db.execute(sql`
        SELECT
          COUNT(*)::int               AS total_sales,
          COALESCE(SUM(price_mutez),0)::text AS volume,
          (SELECT token_name FROM wallet_market_events
           WHERE event_type = 'sale' AND sold_at BETWEEN ${sinceIso}::timestamptz AND ${untilIso}::timestamptz
           ORDER BY price_mutez DESC NULLS LAST LIMIT 1) AS top_token,
          (SELECT price_mutez::text FROM wallet_market_events
           WHERE event_type = 'sale' AND sold_at BETWEEN ${sinceIso}::timestamptz AND ${untilIso}::timestamptz
           ORDER BY price_mutez DESC NULLS LAST LIMIT 1) AS top_price
        FROM wallet_market_events
        WHERE event_type = 'sale'
          AND sold_at BETWEEN ${sinceIso}::timestamptz AND ${untilIso}::timestamptz
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS new_members
        FROM users
        WHERE created_at BETWEEN ${sinceIso}::timestamptz AND ${untilIso}::timestamptz
      `),
      db.execute(sql`
        SELECT
          COALESCE(SUM(play_count),0)::int AS total_plays,
          (SELECT title FROM console_games ORDER BY play_count DESC LIMIT 1) AS top_game
        FROM console_games
        WHERE updated_at BETWEEN ${sinceIso}::timestamptz AND ${untilIso}::timestamptz
      `),
    ]);

    const sales = salesRows.status === "fulfilled" ? (salesRows.value as any).rows?.[0] ?? {} : {};
    const members = membersRows.status === "fulfilled" ? (membersRows.value as any).rows?.[0] ?? {} : {};
    const arcade = arcadeRows.status === "fulfilled" ? (arcadeRows.value as any).rows?.[0] ?? {} : {};

    return {
      totalSales: Number(sales.total_sales || 0),
      totalSalesVolumeMutez: String(sales.volume || "0"),
      topSaleToken: sales.top_token || null,
      topSalePrice: sales.top_price || null,
      newMembers: Number(members.new_members || 0),
      arcadeGamesPlayed: Number(arcade.total_plays || 0),
      topArcadeGame: arcade.top_game || null,
    };
  } catch {
    return defaults;
  }
}

// ─── Thread composition ────────────────────────────────────────────────────────

function buildThread(stats: WeeklyStats, weekOf: string): string[] {
  const dateLabel = new Date(weekOf).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  const tweets: string[] = [];

  // 1 / Opener
  tweets.push(
    `🧵 WTF Weekly Recap — week of ${dateLabel}\n\n` +
    `Here's what went down on WTF this week 👇`
  );

  // 2 / Marketplace
  if (stats.totalSales > 0) {
    let t = `💸 Marketplace:\n${stats.totalSales} sales — ${formatXtz(stats.totalSalesVolumeMutez)} total volume`;
    if (stats.topSaleToken && stats.topSalePrice) {
      t += `\n\nTop sale: "${stats.topSaleToken}" — ${formatXtz(stats.topSalePrice)}`;
    }
    tweets.push(t);
  } else {
    tweets.push("💸 Marketplace:\nA quiet week on-chain — come list something! 👀");
  }

  // 3 / Community
  if (stats.newMembers > 0) {
    tweets.push(
      `👋 Community:\n${stats.newMembers} new member${stats.newMembers === 1 ? "" : "s"} joined WTF this week.\n\nWelcome to the weirdest corner of Tezos 🫡`
    );
  }

  // 4 / Arcade
  if (stats.arcadeGamesPlayed > 0) {
    let t = `🕹️ Arcade:\n${stats.arcadeGamesPlayed.toLocaleString()} plays logged this week`;
    if (stats.topArcadeGame) t += `\nMost played: ${stats.topArcadeGame}`;
    tweets.push(t);
  }

  // 5 / CTA
  tweets.push(
    `🔗 Join the chaos at https://wtf.wtf\n\n#WTF #Tezos #NFT #TezosNFT #WTFgameshow`
  );

  return tweets;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateWeeklyThread(
  forDate = new Date()
): Promise<WeeklyThreadDraft> {
  const since = weekStart(forDate);
  const until = new Date(since.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekOf = since.toISOString().slice(0, 10);

  const existing = drafts.find((d) => d.weekOf === weekOf);
  if (existing) return existing;

  const stats = await gatherWeeklyStats(since, until);
  const tweets = buildThread(stats, weekOf);

  const draft: WeeklyThreadDraft = {
    id: `week-${weekOf}`,
    weekOf,
    generatedAt: new Date().toISOString(),
    status: "draft",
    tweets,
    stats,
  };

  drafts.unshift(draft);
  if (drafts.length > 52) drafts.pop();

  return draft;
}

export function listWeeklyThreadDrafts(): WeeklyThreadDraft[] {
  return [...drafts];
}

export function approveWeeklyThread(id: string): WeeklyThreadDraft | null {
  const d = drafts.find((x) => x.id === id);
  if (!d) return null;
  d.status = "approved";
  return d;
}

export function markWeeklyThreadPosted(id: string): boolean {
  const d = drafts.find((x) => x.id === id);
  if (!d) return false;
  d.status = "posted";
  return true;
}
