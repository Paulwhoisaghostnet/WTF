/**
 * holdings-derive: the sort-bug killer.
 *
 * Aggregates the raw `wallet_events` table into the derived
 * `wallet_holdings` table, populating real per-token:
 *
 *   - first_acquired_at: MIN(timestamp) of inbound events
 *   - last_activity_at:  MAX(timestamp) of any event for the token
 *   - balance:           SUM(in) - SUM(out) from token_amount deltas
 *
 * Phase 6 removed `user_owned_tokens`; clients read `wallet_holdings`
 * with sort keys from real event timestamps (and TzKT reconcile).
 *
 * Idempotent.  Safe to run at any cadence.  Cheap: a single SQL pass.
 */

import { db } from "../db";
import { register as registerJob } from "./scheduler";
import { sql } from "drizzle-orm";

const DERIVE_INTERVAL_MS = 60_000; // every minute

/**
 * Recompute wallet_holdings for all wallets in one SQL pass.
 *
 * The aggregation uses FA2 amount deltas: a transfer_in adds, a
 * transfer_out subtracts.  We handle:
 *   - token_transfer_in / token_transfer_out      (FA1.2 + FA2)
 *   - token_mint (treated as inbound)
 *   - token_burn (treated as outbound)
 *
 * Rows with a computed balance of 0 or negative are deleted (they're
 * either fully sold or buggy data we shouldn't display).
 */
export async function runHoldingsDerive(): Promise<{
  itemsIn: number;
  itemsOut: number;
}> {
  // Step 1: upsert wallet_holdings from walletEvents aggregate.
  const agg = await db.execute(sql`
    WITH agg AS (
      SELECT
        uw.user_id                                          AS user_id,
        we.wallet_address                                    AS wallet_address,
        we.token_contract                                    AS token_contract,
        we.token_id                                          AS token_id,
        MIN(we.timestamp) FILTER (
          WHERE we.event_type IN ('token_transfer_in','token_mint')
        )                                                   AS first_acquired_at,
        MAX(we.timestamp)                                    AS last_activity_at,
        SUM(
          CASE
            WHEN we.event_type IN ('token_transfer_in','token_mint')
              THEN COALESCE(NULLIF(we.token_amount,'')::numeric, 1)
            WHEN we.event_type IN ('token_transfer_out','token_burn')
              THEN -COALESCE(NULLIF(we.token_amount,'')::numeric, 1)
            ELSE 0
          END
        )                                                   AS balance_delta
      FROM wallet_events we
      JOIN user_wallets uw
        ON uw.wallet_address = we.wallet_address
      WHERE we.token_contract IS NOT NULL
        AND we.token_id IS NOT NULL
      GROUP BY uw.user_id, we.wallet_address, we.token_contract, we.token_id
    )
    INSERT INTO wallet_holdings (
      user_id, wallet_address, token_contract, token_id,
      balance, first_acquired_at, last_activity_at, derived_at
    )
    SELECT
      user_id, wallet_address, token_contract, token_id,
      GREATEST(balance_delta, 0)::text,
      first_acquired_at,
      last_activity_at,
      NOW()
    FROM agg
    ON CONFLICT (wallet_address, token_contract, token_id) DO UPDATE SET
      balance           = EXCLUDED.balance,
      first_acquired_at = COALESCE(wallet_holdings.first_acquired_at, EXCLUDED.first_acquired_at),
      last_activity_at  = EXCLUDED.last_activity_at,
      derived_at        = NOW()
    RETURNING id
  `);

  // Step 2: delete rows whose computed balance fell to zero (token sold
  // or otherwise offloaded).  We preserve rows with positive balance.
  await db.execute(sql`
    DELETE FROM wallet_holdings
    WHERE balance IS NULL
       OR balance::numeric <= 0
  `);

  // Step 3: refresh user_wallets.{first_activity_at,last_activity_at}
  // for the cockpit overview tab.  Derived from walletEvents directly
  // (faster than joining to wallet_holdings for this aggregate).
  await db.execute(sql`
    UPDATE user_wallets uw
    SET
      first_activity_at = agg.min_ts,
      last_activity_at  = agg.max_ts,
      last_synced_at    = NOW()
    FROM (
      SELECT wallet_address,
             MIN(timestamp) AS min_ts,
             MAX(timestamp) AS max_ts
      FROM wallet_events
      GROUP BY wallet_address
    ) agg
    WHERE uw.wallet_address = agg.wallet_address
      AND (
        uw.first_activity_at IS DISTINCT FROM agg.min_ts
        OR uw.last_activity_at IS DISTINCT FROM agg.max_ts
      )
  `);

  const countRes = (await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM wallet_holdings`
  )) as any;
  const rows = countRes?.rows ?? (Array.isArray(countRes) ? countRes : []);
  const total = Number(rows[0]?.count ?? 0);
  return { itemsIn: total, itemsOut: total };
}

export function registerHoldingsDerive(): void {
  registerJob({
    name: "holdings-derive",
    fn: runHoldingsDerive,
    intervalMs: DERIVE_INTERVAL_MS,
    // Boot stagger so we don't slam the DB on a restart.
    initialDelayMs: 10_000,
  });
}
