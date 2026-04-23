/**
 * Phase 10 watcher — indexes every inbound WTF transfer to the
 * operator wallet and persists them in `wtf_recapture_events` so the
 * leaderboard and `wtf_paid_to_operator_at_least` auto-verify type
 * have a canonical source of truth.
 *
 * Idempotency: a (op_hash, wallet_address) composite unique index
 * lives in `0031_wtf_recapture.sql`. Every insert uses
 * `ON CONFLICT ... DO NOTHING`.
 *
 * The watcher only scans `wallet_events` rows we have already indexed
 * via the existing TzKT surveillance; it does not hit the network.
 * This keeps it cheap to run frequently and guarantees we can't double
 * count (every WTF transfer hits `wallet_events` exactly once).
 */

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  walletEvents,
  userWallets,
  wtfRecaptureEvents,
  buybackWindows,
  buybackAllowlist,
  sideQuestEntryFees,
  seasonContestants,
} from "@shared/schema";
import {
  WTF_FA2_CONTRACT,
  WTF_FA2_TOKEN_ID,
  WTF_OPERATOR_WALLET_ADDRESS,
} from "./constants";

/**
 * A rolling cursor for the watcher. We walk wallet_events.id forward-only
 * so the linear scan stays O(new-rows) per tick instead of O(history).
 *
 * Kept in memory; on boot we skip history by initializing with the
 * current max id. A future pass can durably persist this to disk.
 */
let lastCursorId = 0;
let bootstrapped = false;

async function bootstrapCursor(): Promise<void> {
  if (bootstrapped) return;
  try {
    const row = await db
      .select({ max: sql<number>`coalesce(max(id),0)` })
      .from(walletEvents);
    lastCursorId = row[0]?.max ?? 0;
  } catch {
    lastCursorId = 0;
  }
  bootstrapped = true;
}

type MatchedEvent = {
  walletAddress: string;
  userId: number | null;
  amountWtf: string;
  opHash: string | null;
  observedAt: Date;
  walletEventId: number;
};

async function pullNewOperatorInboundWtf(): Promise<MatchedEvent[]> {
  if (!WTF_OPERATOR_WALLET_ADDRESS) return [];
  // We want every `token_transfer_in` event on the OPERATOR wallet
  // carrying the WTF FA2 contract + token id. The watcher only needs
  // rows newer than the cursor, bounded to 500 per tick to keep the
  // single scan cheap even on a boot cold-start.
  const rows = await db
    .select({
      id: walletEvents.id,
      tokenContract: walletEvents.tokenContract,
      tokenId: walletEvents.tokenId,
      tokenAmount: walletEvents.tokenAmount,
      opHash: walletEvents.opHash,
      timestamp: walletEvents.timestamp,
      walletAddress: walletEvents.walletAddress,
      counterpartyAddress: walletEvents.counterpartyAddress,
    })
    .from(walletEvents)
    .where(
      and(
        eq(walletEvents.eventType, "token_transfer_in"),
        eq(walletEvents.tokenContract, WTF_FA2_CONTRACT),
        eq(walletEvents.walletAddress, WTF_OPERATOR_WALLET_ADDRESS),
        gt(walletEvents.id, lastCursorId)
      )
    )
    .orderBy(walletEvents.id)
    .limit(500);

  const out: MatchedEvent[] = [];
  for (const r of rows) {
    if (String(r.tokenId ?? "") !== String(WTF_FA2_TOKEN_ID)) continue;
    const amount = (r.tokenAmount ?? "").trim();
    if (!amount || amount === "0") continue;
    const from = r.counterpartyAddress ?? "";
    if (!from) continue;

    // Resolve WTF user from the wallet → user mapping if linked.
    const [link] = await db
      .select({ userId: userWallets.userId })
      .from(userWallets)
      .where(eq(userWallets.walletAddress, from))
      .limit(1);

    out.push({
      walletAddress: from,
      userId: link?.userId ?? null,
      amountWtf: amount,
      opHash: r.opHash ?? null,
      observedAt: r.timestamp ?? new Date(),
      walletEventId: r.id,
    });
  }
  if (rows.length > 0) {
    lastCursorId = Math.max(lastCursorId, rows[rows.length - 1]!.id);
  }
  return out;
}

/**
 * Heuristic source tagging: when we can infer the provenance of an
 * inbound WTF transfer (buyback swap, ante, side-quest entry fee,
 * auction settlement) we stamp `source` accordingly. Everything else
 * lands as `unknown` — still leaderboard-eligible, still queryable.
 */
async function tagSource(ev: MatchedEvent): Promise<{
  source: string;
  sourceRefId: number | null;
}> {
  // Buyback swap: a non-zero row in buyback_allowlist with this wallet
  // that hasn't yet recorded a swap hash.
  try {
    const [swap] = await db
      .select({
        id: buybackAllowlist.id,
        windowId: buybackAllowlist.windowId,
      })
      .from(buybackAllowlist)
      .where(
        and(
          eq(buybackAllowlist.walletAddress, ev.walletAddress),
          eq(buybackAllowlist.swapOpHash, ev.opHash ?? "")
        )
      )
      .limit(1);
    if (swap) return { source: "buyback_swap", sourceRefId: swap.windowId };
  } catch {
    // fall through
  }

  // Side quest entry fee with matching op hash.
  try {
    const [fee] = await db
      .select({ id: sideQuestEntryFees.id })
      .from(sideQuestEntryFees)
      .where(eq(sideQuestEntryFees.opHash, ev.opHash ?? ""))
      .limit(1);
    if (fee) return { source: "side_quest_entry_fee", sourceRefId: fee.id };
  } catch {
    // fall through
  }

  // Ante payment (season_contestants.ante_op_hash match).
  try {
    const [ante] = await db
      .select({ id: seasonContestants.id })
      .from(seasonContestants)
      .where(eq(seasonContestants.anteOpHash, ev.opHash ?? ""))
      .limit(1);
    if (ante) return { source: "ante", sourceRefId: ante.id };
  } catch {
    // fall through
  }

  // Default: unknown inbound WTF to the operator wallet (e.g. top-up
  // from the treasury, auction settlement, tip, etc). Still counted on
  // the recapture leaderboard because the user's wallet sent WTF to
  // the operator wallet on purpose.
  return { source: "unknown", sourceRefId: null };
}

async function persist(ev: MatchedEvent): Promise<void> {
  const tag = await tagSource(ev);
  await db.execute(sql`
    INSERT INTO wtf_recapture_events
      (user_id, wallet_address, source, source_ref_id, amount_wtf, op_hash, observed_at)
    VALUES
      (${ev.userId}, ${ev.walletAddress}, ${tag.source}, ${tag.sourceRefId},
       ${ev.amountWtf}, ${ev.opHash}, ${ev.observedAt})
    ON CONFLICT DO NOTHING
  `);

  // Bump buyback window counters when we see a swap settle.
  if (tag.source === "buyback_swap" && ev.opHash) {
    try {
      await db.execute(sql`
        UPDATE buyback_windows
           SET swaps_observed   = swaps_observed + 1,
               wtf_recaptured   = wtf_recaptured + ${ev.amountWtf}::numeric,
               updated_at       = now()
         WHERE id = (
           SELECT window_id FROM buyback_allowlist
            WHERE swap_op_hash = ${ev.opHash}
            LIMIT 1
         )
      `);
    } catch (err) {
      console.warn("[recapture] window counter bump failed:", err);
    }
  }
}

export async function runRecaptureWatcher(): Promise<{
  scanned: number;
  inserted: number;
}> {
  if (!WTF_OPERATOR_WALLET_ADDRESS) {
    return { scanned: 0, inserted: 0 };
  }
  await bootstrapCursor();
  const events = await pullNewOperatorInboundWtf();
  let inserted = 0;
  for (const ev of events) {
    try {
      await persist(ev);
      inserted += 1;
    } catch (err) {
      console.warn("[recapture] persist failed:", err);
    }
  }
  return { scanned: events.length, inserted };
}

/** Helpers used by routes. */

export async function getRecaptureLeaderboard(opts: {
  limit: number;
  since?: Date | null;
  source?: string | null;
}): Promise<
  Array<{
    userId: number | null;
    walletAddress: string;
    totalWtf: string;
    eventCount: number;
    lastAt: Date | null;
  }>
> {
  const limit = Math.min(Math.max(opts.limit || 50, 1), 500);
  const since = opts.since ?? null;
  const source = opts.source ?? null;
  const result = await db.execute(sql`
    SELECT user_id,
           wallet_address,
           SUM(amount_wtf)::text AS total_wtf,
           COUNT(*)::int        AS event_count,
           MAX(observed_at)     AS last_at
      FROM wtf_recapture_events
     WHERE ${since ? sql`observed_at >= ${since}` : sql`TRUE`}
       AND ${source ? sql`source = ${source}` : sql`TRUE`}
  GROUP BY user_id, wallet_address
  ORDER BY SUM(amount_wtf) DESC
     LIMIT ${limit}
  `);
  const rows = ((result as any)?.rows ?? (result as any) ?? []) as Array<{
    user_id: number | null;
    wallet_address: string;
    total_wtf: string;
    event_count: number;
    last_at: string | null;
  }>;
  return rows.map((r) => ({
    userId: r.user_id,
    walletAddress: r.wallet_address,
    totalWtf: r.total_wtf,
    eventCount: r.event_count,
    lastAt: r.last_at ? new Date(r.last_at) : null,
  }));
}

/** Total WTF recaptured from a single user across any source since ts. */
export async function sumRecapturedForUser(
  userId: number,
  since: Date | null
): Promise<bigint> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(amount_wtf), 0)::text AS total
      FROM wtf_recapture_events
     WHERE user_id = ${userId}
       AND ${since ? sql`observed_at >= ${since}` : sql`TRUE`}
  `);
  const rows = ((result as any)?.rows ?? (result as any) ?? []) as Array<{
    total: string;
  }>;
  return BigInt(rows[0]?.total ?? "0");
}

// Suppress lint
void desc;
void buybackWindows;
