/**
 * Backfill seeders — SQL that enumerates the gaps we know about and
 * upserts one row in `backfill_manifest` per gap.
 *
 * Each seeder is a pure `db` query; idempotent on repeat (the
 * manifest's unique index on `(task_type, target)` guarantees that
 * already-completed or in-flight rows are untouched).
 *
 * Priorities (lower = sooner):
 *   0    → user-connected wallet tasks
 *   10   → tokens actively held by user wallets
 *   20   → 1-degree neighbours of user wallets
 *   40   → synthetic-ophash / missing-seller sale reconciliations
 *   50   → XTZ price gaps, unlabeled addresses seen in sales
 *   90   → everything else
 *
 * The dispatcher pulls rows by `ORDER BY priority ASC, created_at ASC`.
 *
 * Seeders are safe to run on a cadence (we schedule them at ~15min)
 * because of the ON CONFLICT DO NOTHING in `enqueueBatch()`.  New
 * gaps get picked up as they appear; old gaps that were already
 * completed stay completed.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { enqueueBatch, type BackfillTaskType } from "./backfill-manifest";

type SeederResult = {
  name: string;
  enqueued: number;
  candidates: number;
};

/** Runs every seeder in a fixed order.  Returns a summary for logging. */
export async function runAllSeeders(): Promise<{
  seeded: SeederResult[];
  totalEnqueued: number;
  elapsedMs: number;
}> {
  const start = Date.now();
  const results: SeederResult[] = [];

  results.push(await seedXtzPriceGaps());
  results.push(await seedAddressLabelGaps());
  results.push(await seedSaleReconcile());
  results.push(await seedWalletHistory());
  results.push(await seedTokenMarket());
  results.push(await seedTokenMintEnrich());

  const totalEnqueued = results.reduce((a, b) => a + b.enqueued, 0);
  return { seeded: results, totalEnqueued, elapsedMs: Date.now() - start };
}

/* ----------------------------------------------------------------------- */
/* Individual seeders                                                       */
/* ----------------------------------------------------------------------- */

/**
 * XTZ/USD price gaps: every day between the earliest price we have
 * and yesterday that isn't in `xtz_usd_daily` is a gap.  TzKT quotes
 * endpoint returns one row per day, so we enqueue one task per gap.
 *
 * We cap the lookback at 2018-07-01 because (a) that's comfortably
 * before Tezos mainnet launched in June 2018 and (b) further back
 * produces no useful data anyway.
 */
async function seedXtzPriceGaps(): Promise<SeederResult> {
  const result = (await db.execute(sql`
    WITH bounds AS (
      SELECT
        GREATEST(
          COALESCE((SELECT MIN(day) FROM xtz_usd_daily), DATE '2018-07-01'),
          DATE '2018-07-01'
        )                                                AS min_day,
        CURRENT_DATE - INTERVAL '1 day'                  AS max_day
    ),
    series AS (
      SELECT generate_series(min_day, max_day::date, INTERVAL '1 day')::date AS d
      FROM bounds
    ),
    gaps AS (
      SELECT s.d AS gap_day
      FROM series s
      LEFT JOIN xtz_usd_daily x ON x.day = s.d
      WHERE x.day IS NULL
    )
    SELECT to_char(gap_day, 'YYYY-MM-DD') AS target
    FROM gaps
  `)) as any;
  const rows: Array<{ target: string }> =
    result?.rows ?? (Array.isArray(result) ? result : []);

  const enqueued = await enqueueBatch(
    rows.map((r) => ({
      taskType: "xtz_price_gap" as BackfillTaskType,
      target: r.target,
      priority: 50,
    }))
  );

  return { name: "xtz_price_gap", candidates: rows.length, enqueued };
}

/**
 * Addresses we've seen in sales/mints/holdings that have no label
 * row yet — or whose label row has never been resolved against
 * Tezos Domains / Objkt.  Cap at 50k addresses per pass so we don't
 * nuke the dispatcher queue in one go.
 */
async function seedAddressLabelGaps(): Promise<SeederResult> {
  const result = (await db.execute(sql`
    WITH seen AS (
      SELECT DISTINCT address FROM (
        SELECT buyer_address      AS address FROM token_sales        WHERE buyer_address  IS NOT NULL
        UNION ALL
        SELECT seller_address     AS address FROM token_sales        WHERE seller_address IS NOT NULL AND seller_address <> ''
        UNION ALL
        SELECT minter_address     AS address FROM token_mint_events  WHERE minter_address IS NOT NULL
        UNION ALL
        SELECT wallet_address     AS address FROM wallet_holdings    WHERE wallet_address IS NOT NULL
      ) t
    ),
    joined AS (
      SELECT s.address
      FROM seen s
      LEFT JOIN address_labels l ON l.address = s.address
      WHERE l.address IS NULL
         OR l.last_resolved_at IS NULL
         OR l.last_resolved_at < now() - INTERVAL '90 days'
      LIMIT 50000
    )
    SELECT address FROM joined
  `)) as any;
  const rows: Array<{ address: string }> =
    result?.rows ?? (Array.isArray(result) ? result : []);

  const enqueued = await enqueueBatch(
    rows.map((r) => ({
      taskType: "address_label" as BackfillTaskType,
      target: r.address,
      priority: 50,
    }))
  );

  return { name: "address_label", candidates: rows.length, enqueued };
}

/**
 * Sale rows that came in as synthetic (source suffixed `_synth` or
 * `_noseller` from the Guidance importer).  Each one is a chance to
 * replace the synthetic op_hash and/or fill the missing seller by
 * asking TzKT / Objkt for the real transaction.
 *
 * Priority is elevated for sales involving wallets users care about
 * (connected-wallets + their 1-degree neighbours).
 */
async function seedSaleReconcile(): Promise<SeederResult> {
  const result = (await db.execute(sql`
    WITH user_wallets_set AS (
      SELECT DISTINCT wallet_address AS addr FROM user_wallets
    ),
    one_degree AS (
      -- Anyone who appears opposite one of our user's wallets in a sale.
      SELECT DISTINCT other AS addr FROM (
        SELECT buyer_address AS addr_ours, seller_address AS other FROM token_sales
          WHERE buyer_address IN (SELECT addr FROM user_wallets_set)
            AND seller_address IS NOT NULL AND seller_address <> ''
        UNION ALL
        SELECT seller_address, buyer_address FROM token_sales
          WHERE seller_address IN (SELECT addr FROM user_wallets_set)
            AND buyer_address IS NOT NULL
      ) t
    ),
    relevant AS (
      SELECT addr FROM user_wallets_set
      UNION
      SELECT addr FROM one_degree
    ),
    candidates AS (
      SELECT
        s.id,
        s.op_hash,
        s.token_contract,
        s.token_id,
        s.seller_address,
        s.buyer_address,
        CASE
          WHEN s.buyer_address IN (SELECT addr FROM user_wallets_set) THEN 10
          WHEN s.seller_address IN (SELECT addr FROM user_wallets_set) THEN 10
          WHEN s.buyer_address IN (SELECT addr FROM relevant)  THEN 20
          WHEN s.seller_address IN (SELECT addr FROM relevant) THEN 20
          ELSE 40
        END AS priority
      FROM token_sales s
      WHERE s.source LIKE '%_synth%'
         OR s.source LIKE '%_noseller%'
         OR s.seller_address IS NULL
         OR s.op_hash LIKE 'synth:%'
      LIMIT 200000
    )
    SELECT
      op_hash,
      token_contract,
      token_id,
      COALESCE(seller_address, '') AS seller_address,
      buyer_address,
      id,
      priority
    FROM candidates
  `)) as any;

  const rows: Array<{
    op_hash: string;
    token_contract: string;
    token_id: string;
    seller_address: string;
    buyer_address: string;
    id: number;
    priority: number;
  }> = result?.rows ?? (Array.isArray(result) ? result : []);

  const enqueued = await enqueueBatch(
    rows.map((r) => ({
      taskType: "sale_reconcile" as BackfillTaskType,
      target: `${r.op_hash}|${r.token_contract}|${r.token_id}|${r.seller_address}|${r.buyer_address}`,
      payload: {
        saleId: r.id,
        tokenContract: r.token_contract,
        tokenId: r.token_id,
        buyerAddress: r.buyer_address,
        sellerAddress: r.seller_address || null,
        synthOpHash: r.op_hash.startsWith("synth:") ? r.op_hash : null,
      },
      priority: r.priority,
      maxAttempts: 4,
    }))
  );

  return { name: "sale_reconcile", candidates: rows.length, enqueued };
}

/**
 * Wallets that need their TzKT activity paginated from the last
 * known cursor forward.  We seed one row per user-connected wallet
 * (priority 0), plus every 1-degree neighbour (priority 20).
 *
 * The handler uses `wallet_sync_cursors.last_transfer_id` as the
 * starting offset.
 */
async function seedWalletHistory(): Promise<SeederResult> {
  const result = (await db.execute(sql`
    WITH user_wallets_set AS (
      SELECT DISTINCT wallet_address AS addr FROM user_wallets
    ),
    neighbours AS (
      SELECT DISTINCT other AS addr, MIN(priority)::int AS priority FROM (
        SELECT seller_address AS other, 20 AS priority
          FROM token_sales
         WHERE buyer_address IN (SELECT addr FROM user_wallets_set)
           AND seller_address IS NOT NULL AND seller_address <> ''
        UNION ALL
        SELECT buyer_address, 20 FROM token_sales
         WHERE seller_address IN (SELECT addr FROM user_wallets_set)
        UNION ALL
        SELECT minter_address, 20
          FROM token_mint_events
         WHERE token_contract IN (
           SELECT DISTINCT token_contract FROM wallet_holdings
           WHERE wallet_address IN (SELECT addr FROM user_wallets_set)
         )
      ) t
      GROUP BY other
    ),
    merged AS (
      SELECT addr, 0 AS priority FROM user_wallets_set
      UNION
      SELECT addr, priority FROM neighbours
    ),
    final AS (
      SELECT m.addr, MIN(m.priority)::int AS priority
      FROM merged m
      WHERE m.addr IS NOT NULL AND m.addr <> ''
      GROUP BY m.addr
      LIMIT 100000
    )
    SELECT addr, priority FROM final
  `)) as any;

  const rows: Array<{ addr: string; priority: number }> =
    result?.rows ?? (Array.isArray(result) ? result : []);

  const enqueued = await enqueueBatch(
    rows.map((r) => ({
      taskType: "wallet_history" as BackfillTaskType,
      target: r.addr,
      priority: r.priority,
      maxAttempts: 8,
    }))
  );

  return { name: "wallet_history", candidates: rows.length, enqueued };
}

/**
 * Tokens that need a fresh market summary (floor, current listings,
 * highest listing, last sale).  We enqueue every token actively held
 * by a user (priority 10) plus the union of tokens from their 1-degree
 * neighbours' holdings (priority 30).
 *
 * The handler calls Objkt GraphQL once for each token, so we keep
 * the candidate pool bounded.
 */
async function seedTokenMarket(): Promise<SeederResult> {
  const result = (await db.execute(sql`
    WITH user_wallets_set AS (
      SELECT DISTINCT wallet_address AS addr FROM user_wallets
    ),
    tokens_user AS (
      SELECT DISTINCT wh.token_contract, wh.token_id, 10 AS priority
      FROM wallet_holdings wh
      WHERE wh.wallet_address IN (SELECT addr FROM user_wallets_set)
        AND wh.balance::numeric > 0
    ),
    tokens_neighbours AS (
      SELECT DISTINCT ts.token_contract, ts.token_id, 30 AS priority
      FROM token_sales ts
      WHERE (ts.buyer_address IN (SELECT addr FROM user_wallets_set)
             OR ts.seller_address IN (SELECT addr FROM user_wallets_set))
    ),
    merged AS (
      SELECT token_contract, token_id, priority FROM tokens_user
      UNION
      SELECT token_contract, token_id, priority FROM tokens_neighbours
    ),
    final AS (
      SELECT m.token_contract, m.token_id, MIN(m.priority)::int AS priority
      FROM merged m
      LEFT JOIN token_market_summary s
        ON s.token_contract = m.token_contract AND s.token_id = m.token_id
      WHERE s.token_contract IS NULL
         OR s.refreshed_at < now() - INTERVAL '6 hours'
      GROUP BY m.token_contract, m.token_id
      LIMIT 25000
    )
    SELECT token_contract, token_id, priority FROM final
  `)) as any;

  const rows: Array<{
    token_contract: string;
    token_id: string;
    priority: number;
  }> = result?.rows ?? (Array.isArray(result) ? result : []);

  const enqueued = await enqueueBatch(
    rows.map((r) => ({
      taskType: "token_market" as BackfillTaskType,
      target: `${r.token_contract}|${r.token_id}`,
      payload: { tokenContract: r.token_contract, tokenId: r.token_id },
      priority: r.priority,
    }))
  );

  return { name: "token_market", candidates: rows.length, enqueued };
}

/**
 * Mint-event rows whose fee / first owner / platform columns are
 * missing — typically imported from the Intel CSV which lacked these
 * fields.  The handler asks TzKT for the originating op and fills
 * in the blanks.
 */
async function seedTokenMintEnrich(): Promise<SeederResult> {
  const result = (await db.execute(sql`
    SELECT
      op_hash,
      token_contract,
      token_id,
      id
    FROM token_mint_events
    WHERE (mint_fee_mutez IS NULL
           OR platform IS NULL
           OR first_owner IS NULL)
      AND op_hash IS NOT NULL
      AND op_hash <> ''
      AND op_hash NOT LIKE 'synth:%'
    LIMIT 50000
  `)) as any;

  const rows: Array<{
    op_hash: string;
    token_contract: string;
    token_id: string;
    id: number;
  }> = result?.rows ?? (Array.isArray(result) ? result : []);

  const enqueued = await enqueueBatch(
    rows.map((r) => ({
      taskType: "token_mint_enrich" as BackfillTaskType,
      target: `${r.op_hash}|${r.token_contract}|${r.token_id}`,
      payload: { mintEventId: r.id, opHash: r.op_hash },
      priority: 70,
    }))
  );

  return { name: "token_mint_enrich", candidates: rows.length, enqueued };
}
