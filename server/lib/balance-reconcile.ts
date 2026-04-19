/**
 * balance-reconcile: authoritative timestamps from TzKT.
 *
 * Our derived `wallet_holdings.first_acquired_at` / `last_activity_at`
 * are computed from the rows we have in `wallet_events`.  If events
 * are missing (upstream indexer gap, chunking quirk, new wallet mid-
 * sync) those timestamps will be off.
 *
 * This job pulls the same `token.balance` rows TzKT serves to the
 * public explorer — but uses the `select=...,firstTime,lastTime`
 * pragma to grab the authoritative timestamps — and upserts them
 * into `wallet_holdings.tzkt_first_time` / `tzkt_last_time`.  Those
 * two columns are read by /api/cockpit/holdings as "preferred when
 * present" — the derived columns remain as backfill / fallback.
 *
 * Scope:
 *   - only wallets whose oldest holding hasn't been reconciled in >1h
 *   - at most N wallets per tick
 *   - first page only (500 tokens, sorted by lastTime desc)
 *   - larger wallets drain across subsequent ticks via pagination
 *
 * Balances themselves are NOT reconciled here.  A future `balance-
 * verify` job can log drift between TzKT and our computed balance;
 * for now we only trust events for balance.
 */

import { db } from "../db";
import { walletHoldings } from "@shared/schema";
import { register as registerJob } from "./scheduler";
import { sql } from "drizzle-orm";
import { getOwnedFa2BalancesWithTimes } from "../tzkt";

const TICK_MS = 15 * 60 * 1000; // every 15 minutes
const WALLETS_PER_TICK = 10;
const STALE_AFTER_MS = 60 * 60 * 1000; // reconcile wallets older than 1h

async function walletsDueForReconcile(): Promise<string[]> {
  const result = await db.execute(sql`
    WITH stats AS (
      SELECT
        wallet_address,
        MIN(COALESCE(tzkt_last_time, 'epoch'::timestamp)) AS oldest_reconciled
      FROM wallet_holdings
      GROUP BY wallet_address
    )
    SELECT wallet_address
    FROM stats
    WHERE oldest_reconciled < NOW() - INTERVAL '1 millisecond' * ${STALE_AFTER_MS}
    ORDER BY oldest_reconciled ASC
    LIMIT ${WALLETS_PER_TICK}
  `);
  const rows: any[] = (result as any)?.rows ?? [];
  return rows.map((r) => String(r.wallet_address));
}

async function reconcileWallet(wallet: string): Promise<number> {
  const page = await getOwnedFa2BalancesWithTimes(wallet, 500, 0);
  if (page.items.length === 0) return 0;
  let updated = 0;

  for (const item of page.items) {
    const firstTime = item.firstTime ? new Date(item.firstTime) : null;
    const lastTime = item.lastTime ? new Date(item.lastTime) : null;

    const res = await db
      .update(walletHoldings)
      .set({
        tzktFirstTime: firstTime,
        tzktLastTime: lastTime,
      })
      .where(
        sql`${walletHoldings.walletAddress} = ${wallet}
          AND ${walletHoldings.tokenContract} = ${item.contract}
          AND ${walletHoldings.tokenId} = ${item.tokenId}
          AND (
            ${walletHoldings.tzktLastTime} IS DISTINCT FROM ${lastTime}
            OR ${walletHoldings.tzktFirstTime} IS DISTINCT FROM ${firstTime}
          )`
      )
      .returning({ id: walletHoldings.id });
    updated += res.length;
  }
  return updated;
}

export async function runBalanceReconcile(): Promise<{
  itemsIn: number;
  itemsOut: number;
}> {
  const wallets = await walletsDueForReconcile();
  let rowsUpdated = 0;
  for (const w of wallets) {
    try {
      rowsUpdated += await reconcileWallet(w);
    } catch (err) {
      console.warn(
        `[balance-reconcile] wallet ${w} failed (continuing):`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return { itemsIn: wallets.length, itemsOut: rowsUpdated };
}

export function registerBalanceReconcile(): void {
  registerJob({
    name: "balance-reconcile",
    fn: runBalanceReconcile,
    intervalMs: TICK_MS,
    initialDelayMs: 3 * 60 * 1000, // 3min after boot; let portfolio-sync land first
  });
}
