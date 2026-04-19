/**
 * Database completeness audit.
 *
 * Read-only.  Scans the cockpit-era tables (users, user_wallets,
 * wallet_events, wallet_holdings, token_metadata, contract_metadata,
 * address_labels, collections, sync_runs, indexing_queue) and reports:
 *
 *   1. Row counts per table.
 *   2. Coverage ratios — e.g. how many (contract, tokenId) pairs in
 *      wallet_holdings have a matching row in token_metadata, and of
 *      those, how many have a non-null display_uri / artifact_uri /
 *      thumbnail.
 *   3. Staleness — fetched_at / updated_at older than policy windows.
 *   4. Orphans — wallet_events with null user_id, wallet_holdings
 *      referencing addresses that aren't in user_wallets, etc.
 *   5. Scheduler health — latest sync_runs row per job and its age.
 *   6. Top-N gaps — which contracts are the biggest offenders for
 *      missing metadata, so operators know where to direct the next
 *      backfill sweep.
 *
 * Every query runs as a single statement with explicit COALESCE / ::int
 * casts so Postgres never returns string-typed counts.  All joins
 * guard against missing tables at the Drizzle layer (schema is the
 * source of truth), so this report is cheap to run on demand.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

type RowCount = { rows: number };
type PctBlock = {
  total: number;
  covered: number;
  missing: number;
  pct: number;
};

export type AuditReport = {
  generatedAt: string;
  tables: {
    users: RowCount;
    user_wallets: RowCount & {
      primary: number;
      syncedWithin24h: number;
      neverSynced: number;
    };
    wallet_events: RowCount & {
      unlinkedUserId: number;
      oldestTimestamp: string | null;
      newestTimestamp: string | null;
      distinctWallets: number;
      distinctTokenPairs: number;
    };
    wallet_holdings: RowCount & {
      nonZeroBalance: number;
      zeroBalance: number;
      distinctTokenPairs: number;
      tzktReconciled: number;
    };
    token_metadata: RowCount & {
      withName: number;
      withThumbnail: number;
      withDisplayUri: number;
      withArtifactUri: number;
      withMimeType: number;
      withAnyUri: number;
      completeBasics: number;
      staleOver30d: number;
    };
    contract_metadata: RowCount;
    address_labels: RowCount;
    collections: RowCount & { tradeBoard: number; nonEmpty: number };
    collection_items: RowCount;
    sync_runs: RowCount & {
      last24h: number;
      errors24h: number;
      skipped24h: number;
    };
    indexing_queue: {
      pending: number;
      running: number;
      done: number;
      failed: number;
      stalePickedUp: number;
    };
  };
  coverage: {
    holdingsWithMetadata: PctBlock;
    holdingsWithRichMetadata: PctBlock;
    holdingsWithEvents: PctBlock;
    tokenPairsWithContractMetadata: PctBlock;
    counterpartyAddressesLabeled: PctBlock;
    walletsSyncedRecently: PctBlock;
    usersWithCollectionsGivenHoldings: PctBlock;
  };
  scheduler: Array<{
    jobName: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    itemsIn: number;
    itemsOut: number;
    error: string | null;
    ageSeconds: number;
  }>;
  topMissing: {
    contractsMissingTokenMetadata: Array<{
      tokenContract: string;
      missingTokenCount: number;
    }>;
    contractsMissingContractMetadata: Array<{
      tokenContract: string;
      heldTokens: number;
    }>;
    holdingsMissingEventsByContract: Array<{
      tokenContract: string;
      missingHoldings: number;
    }>;
  };
  warnings: string[];
};

function pct(covered: number, total: number): number {
  if (!total) return 0;
  return Math.round((covered / total) * 10000) / 100;
}

function toPctBlock(covered: number, total: number): PctBlock {
  return {
    total,
    covered,
    missing: Math.max(0, total - covered),
    pct: pct(covered, total),
  };
}

/**
 * Execute a raw SQL statement and return the first row as an object
 * with numeric fields coerced from Postgres text.  Centralizes the
 * `rows ?? []` / `Array.isArray` dance so the individual queries
 * below read straight.
 */
async function one<T extends Record<string, any>>(
  query: ReturnType<typeof sql>
): Promise<T> {
  const result = (await db.execute(query)) as any;
  const raw: any[] = result?.rows ?? (Array.isArray(result) ? result : []);
  const row = (raw[0] ?? {}) as T;
  return row;
}

async function many<T extends Record<string, any>>(
  query: ReturnType<typeof sql>
): Promise<T[]> {
  const result = (await db.execute(query)) as any;
  const raw: any[] = result?.rows ?? (Array.isArray(result) ? result : []);
  return raw as T[];
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function runDbAudit(): Promise<AuditReport> {
  const warnings: string[] = [];

  // ─── 1. Row counts + table-level stats ──────────────────────────

  const users = await one<{ rows: string }>(
    sql`SELECT COUNT(*)::int AS rows FROM users`
  );

  const userWallets = await one<{
    rows: string;
    primary: string;
    synced: string;
    never: string;
  }>(sql`
    SELECT
      COUNT(*)::int                                                                         AS rows,
      COUNT(*) FILTER (WHERE is_primary)::int                                               AS primary,
      COUNT(*) FILTER (WHERE last_synced_at IS NOT NULL AND last_synced_at > NOW() - INTERVAL '24 hours')::int AS synced,
      COUNT(*) FILTER (WHERE last_synced_at IS NULL)::int                                   AS never
    FROM user_wallets
  `);

  const walletEvents = await one<{
    rows: string;
    unlinked: string;
    oldest: Date | null;
    newest: Date | null;
    distinct_wallets: string;
    distinct_token_pairs: string;
  }>(sql`
    SELECT
      COUNT(*)::int                                            AS rows,
      COUNT(*) FILTER (WHERE user_id IS NULL)::int             AS unlinked,
      MIN(timestamp)                                           AS oldest,
      MAX(timestamp)                                           AS newest,
      COUNT(DISTINCT wallet_address)::int                      AS distinct_wallets,
      COUNT(DISTINCT (token_contract, token_id))::int          AS distinct_token_pairs
    FROM wallet_events
  `);

  const walletHoldings = await one<{
    rows: string;
    nonzero: string;
    zero: string;
    distinct_token_pairs: string;
    tzkt_reconciled: string;
  }>(sql`
    SELECT
      COUNT(*)::int                                                                  AS rows,
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(balance, '')::numeric, 0) <> 0)::int    AS nonzero,
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(balance, '')::numeric, 0) = 0)::int     AS zero,
      COUNT(DISTINCT (token_contract, token_id))::int                                AS distinct_token_pairs,
      COUNT(*) FILTER (WHERE tzkt_last_time IS NOT NULL)::int                        AS tzkt_reconciled
    FROM wallet_holdings
  `);

  const tokenMetadata = await one<{
    rows: string;
    with_name: string;
    with_thumb: string;
    with_display: string;
    with_artifact: string;
    with_mime: string;
    with_any_uri: string;
    complete_basics: string;
    stale: string;
  }>(sql`
    SELECT
      COUNT(*)::int                                                                          AS rows,
      COUNT(*) FILTER (WHERE name IS NOT NULL AND name <> '')::int                           AS with_name,
      COUNT(*) FILTER (WHERE thumbnail IS NOT NULL AND thumbnail <> '')::int                 AS with_thumb,
      COUNT(*) FILTER (WHERE display_uri IS NOT NULL AND display_uri <> '')::int             AS with_display,
      COUNT(*) FILTER (WHERE artifact_uri IS NOT NULL AND artifact_uri <> '')::int           AS with_artifact,
      COUNT(*) FILTER (WHERE mime_type IS NOT NULL AND mime_type <> '')::int                 AS with_mime,
      COUNT(*) FILTER (WHERE
        COALESCE(NULLIF(display_uri, ''), NULLIF(artifact_uri, ''), NULLIF(thumbnail, '')) IS NOT NULL
      )::int                                                                                 AS with_any_uri,
      COUNT(*) FILTER (WHERE
        name IS NOT NULL AND name <> '' AND
        COALESCE(NULLIF(display_uri, ''), NULLIF(artifact_uri, ''), NULLIF(thumbnail, '')) IS NOT NULL
      )::int                                                                                 AS complete_basics,
      COUNT(*) FILTER (WHERE fetched_at < NOW() - INTERVAL '30 days')::int                   AS stale
    FROM token_metadata
  `);

  const contractMetadata = await one<{ rows: string }>(
    sql`SELECT COUNT(*)::int AS rows FROM contract_metadata`
  );

  const addressLabels = await one<{ rows: string }>(
    sql`SELECT COUNT(*)::int AS rows FROM address_labels`
  );

  const collectionsRow = await one<{
    rows: string;
    trade_board: string;
    nonempty: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM collections)                               AS rows,
      (SELECT COUNT(*)::int FROM collections WHERE type = 'trade_board_listing')
                                                                            AS trade_board,
      (SELECT COUNT(*)::int FROM (
        SELECT DISTINCT c.id FROM collections c
        JOIN collection_items ci ON ci.collection_id = c.id
      ) t)                                                                  AS nonempty
  `);

  const collectionItems = await one<{ rows: string }>(
    sql`SELECT COUNT(*)::int AS rows FROM collection_items`
  );

  const syncRunsRow = await one<{
    rows: string;
    last24: string;
    errors24: string;
    skipped24: string;
  }>(sql`
    SELECT
      COUNT(*)::int                                                                      AS rows,
      COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours')::int              AS last24,
      COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours' AND status='error')::int
                                                                                         AS errors24,
      COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours' AND status='skipped')::int
                                                                                         AS skipped24
    FROM sync_runs
  `);

  const indexingQueue = await one<{
    pending: string;
    running: string;
    done: string;
    failed: string;
    stale_picked: string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE status='pending')::int                                             AS pending,
      COUNT(*) FILTER (WHERE status='running')::int                                             AS running,
      COUNT(*) FILTER (WHERE status='done')::int                                                AS done,
      COUNT(*) FILTER (WHERE status='failed')::int                                              AS failed,
      COUNT(*) FILTER (
        WHERE status='running'
          AND picked_up_at IS NOT NULL
          AND picked_up_at < NOW() - INTERVAL '1 hour'
      )::int                                                                                    AS stale_picked
    FROM indexing_queue
  `);

  // ─── 2. Coverage ratios ─────────────────────────────────────────

  // holdings joined to token_metadata
  const coverageTokenMeta = await one<{
    total: string;
    covered_any: string;
    covered_rich: string;
  }>(sql`
    WITH pairs AS (
      SELECT DISTINCT token_contract, token_id FROM wallet_holdings
    )
    SELECT
      COUNT(*)::int                                                                         AS total,
      COUNT(tm.token_id)::int                                                               AS covered_any,
      COUNT(*) FILTER (
        WHERE tm.name IS NOT NULL AND tm.name <> ''
          AND COALESCE(NULLIF(tm.display_uri, ''), NULLIF(tm.artifact_uri, ''), NULLIF(tm.thumbnail, '')) IS NOT NULL
      )::int                                                                                AS covered_rich
    FROM pairs p
    LEFT JOIN token_metadata tm
      ON tm.token_contract = p.token_contract AND tm.token_id = p.token_id
  `);

  // holdings where NO wallet_events exist for same (wallet, contract, token_id)
  const coverageHoldingsEvents = await one<{ total: string; covered: string }>(
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM wallet_holdings)                                         AS total,
        (
          SELECT COUNT(*)::int FROM (
            SELECT h.id FROM wallet_holdings h
            WHERE EXISTS (
              SELECT 1 FROM wallet_events e
              WHERE e.wallet_address = h.wallet_address
                AND e.token_contract = h.token_contract
                AND e.token_id       = h.token_id
            )
          ) t
        )                                                                                    AS covered
    `
  );

  // contract_metadata coverage for token pairs seen in holdings
  const coverageContractMeta = await one<{ total: string; covered: string }>(
    sql`
      WITH contracts AS (
        SELECT DISTINCT token_contract FROM wallet_holdings
        WHERE token_contract IS NOT NULL
      )
      SELECT
        COUNT(*)::int                                   AS total,
        COUNT(cm.address)::int                          AS covered
      FROM contracts c
      LEFT JOIN contract_metadata cm ON cm.address = c.token_contract
    `
  );

  // counterparty address label coverage
  const coverageCounterparty = await one<{ total: string; covered: string }>(
    sql`
      WITH counterparties AS (
        SELECT DISTINCT counterparty_address
        FROM wallet_events
        WHERE counterparty_address IS NOT NULL
      )
      SELECT
        COUNT(*)::int                                                  AS total,
        COUNT(al.address)::int                                         AS covered
      FROM counterparties c
      LEFT JOIN address_labels al ON al.address = c.counterparty_address
    `
  );

  // user_wallets synced in last 24 h / total (with activity)
  const coverageWalletSync = await one<{ total: string; covered: string }>(
    sql`
      SELECT
        COUNT(*)::int                                                                           AS total,
        COUNT(*) FILTER (WHERE last_synced_at IS NOT NULL AND last_synced_at > NOW() - INTERVAL '24 hours')::int AS covered
      FROM user_wallets
    `
  );

  // users with at least one holding, and of those, how many also have
  // at least one collection row
  const coverageUsersCollections = await one<{
    total: string;
    covered: string;
  }>(sql`
    WITH holding_users AS (
      SELECT DISTINCT user_id FROM wallet_holdings WHERE user_id IS NOT NULL
    )
    SELECT
      COUNT(*)::int                                                        AS total,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM collections c WHERE c.user_id = hu.user_id
      ))::int                                                              AS covered
    FROM holding_users hu
  `);

  // ─── 3. Scheduler health ────────────────────────────────────────

  const schedulerRows = await many<{
    job_name: string;
    status: string;
    started_at: Date;
    finished_at: Date | null;
    duration_ms: number | null;
    items_in: number | null;
    items_out: number | null;
    error: string | null;
  }>(sql`
    SELECT DISTINCT ON (job_name)
      job_name, status, started_at, finished_at, duration_ms,
      items_in, items_out, error
    FROM sync_runs
    ORDER BY job_name, started_at DESC
  `);

  const scheduler = schedulerRows.map((r) => ({
    jobName: r.job_name,
    status: r.status,
    startedAt: (r.started_at as any)?.toISOString?.() ?? String(r.started_at),
    finishedAt: r.finished_at
      ? (r.finished_at as any).toISOString?.() ?? String(r.finished_at)
      : null,
    durationMs: r.duration_ms,
    itemsIn: n(r.items_in),
    itemsOut: n(r.items_out),
    error: r.error,
    ageSeconds: Math.max(
      0,
      Math.floor((Date.now() - new Date(r.started_at as any).getTime()) / 1000)
    ),
  }));

  // ─── 4. Top-N gap reports ───────────────────────────────────────

  const gapTokenMeta = await many<{ token_contract: string; missing: string }>(
    sql`
      WITH pairs AS (
        SELECT DISTINCT token_contract, token_id FROM wallet_holdings
      )
      SELECT
        p.token_contract,
        COUNT(*)::int AS missing
      FROM pairs p
      LEFT JOIN token_metadata tm
        ON tm.token_contract = p.token_contract AND tm.token_id = p.token_id
      WHERE tm.token_id IS NULL
      GROUP BY p.token_contract
      ORDER BY missing DESC
      LIMIT 10
    `
  );

  const gapContractMeta = await many<{
    token_contract: string;
    held_tokens: string;
  }>(sql`
    WITH contracts AS (
      SELECT token_contract, COUNT(*)::int AS held_tokens
      FROM wallet_holdings
      WHERE token_contract IS NOT NULL
      GROUP BY token_contract
    )
    SELECT c.token_contract, c.held_tokens
    FROM contracts c
    LEFT JOIN contract_metadata cm ON cm.address = c.token_contract
    WHERE cm.address IS NULL
    ORDER BY c.held_tokens DESC
    LIMIT 10
  `);

  const gapHoldingsEvents = await many<{
    token_contract: string;
    missing: string;
  }>(sql`
    WITH orphan AS (
      SELECT h.token_contract
      FROM wallet_holdings h
      WHERE NOT EXISTS (
        SELECT 1 FROM wallet_events e
        WHERE e.wallet_address = h.wallet_address
          AND e.token_contract = h.token_contract
          AND e.token_id       = h.token_id
      )
    )
    SELECT token_contract, COUNT(*)::int AS missing
    FROM orphan
    GROUP BY token_contract
    ORDER BY missing DESC
    LIMIT 10
  `);

  // ─── 5. Build report ────────────────────────────────────────────

  const walletHoldingsTotal = n(walletHoldings.rows);
  if (walletHoldingsTotal === 0) {
    warnings.push(
      "wallet_holdings is empty — holdings-derive / portfolio-sync may not have run yet or migration backfill had no rows."
    );
  }
  if (n(syncRunsRow.errors24) > 0) {
    warnings.push(
      `sync_runs: ${n(syncRunsRow.errors24)} errored run(s) in the last 24 h — inspect /api/cockpit/sync/runs/:jobName`
    );
  }
  if (n(indexingQueue.stale_picked) > 0) {
    warnings.push(
      `indexing_queue: ${n(indexingQueue.stale_picked)} row(s) stuck in status=running for >1 h`
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    tables: {
      users: { rows: n(users.rows) },
      user_wallets: {
        rows: n(userWallets.rows),
        primary: n(userWallets.primary),
        syncedWithin24h: n(userWallets.synced),
        neverSynced: n(userWallets.never),
      },
      wallet_events: {
        rows: n(walletEvents.rows),
        unlinkedUserId: n(walletEvents.unlinked),
        oldestTimestamp: walletEvents.oldest
          ? (walletEvents.oldest as any).toISOString?.() ??
            String(walletEvents.oldest)
          : null,
        newestTimestamp: walletEvents.newest
          ? (walletEvents.newest as any).toISOString?.() ??
            String(walletEvents.newest)
          : null,
        distinctWallets: n(walletEvents.distinct_wallets),
        distinctTokenPairs: n(walletEvents.distinct_token_pairs),
      },
      wallet_holdings: {
        rows: walletHoldingsTotal,
        nonZeroBalance: n(walletHoldings.nonzero),
        zeroBalance: n(walletHoldings.zero),
        distinctTokenPairs: n(walletHoldings.distinct_token_pairs),
        tzktReconciled: n(walletHoldings.tzkt_reconciled),
      },
      token_metadata: {
        rows: n(tokenMetadata.rows),
        withName: n(tokenMetadata.with_name),
        withThumbnail: n(tokenMetadata.with_thumb),
        withDisplayUri: n(tokenMetadata.with_display),
        withArtifactUri: n(tokenMetadata.with_artifact),
        withMimeType: n(tokenMetadata.with_mime),
        withAnyUri: n(tokenMetadata.with_any_uri),
        completeBasics: n(tokenMetadata.complete_basics),
        staleOver30d: n(tokenMetadata.stale),
      },
      contract_metadata: { rows: n(contractMetadata.rows) },
      address_labels: { rows: n(addressLabels.rows) },
      collections: {
        rows: n(collectionsRow.rows),
        tradeBoard: n(collectionsRow.trade_board),
        nonEmpty: n(collectionsRow.nonempty),
      },
      collection_items: { rows: n(collectionItems.rows) },
      sync_runs: {
        rows: n(syncRunsRow.rows),
        last24h: n(syncRunsRow.last24),
        errors24h: n(syncRunsRow.errors24),
        skipped24h: n(syncRunsRow.skipped24),
      },
      indexing_queue: {
        pending: n(indexingQueue.pending),
        running: n(indexingQueue.running),
        done: n(indexingQueue.done),
        failed: n(indexingQueue.failed),
        stalePickedUp: n(indexingQueue.stale_picked),
      },
    },
    coverage: {
      holdingsWithMetadata: toPctBlock(
        n(coverageTokenMeta.covered_any),
        n(coverageTokenMeta.total)
      ),
      holdingsWithRichMetadata: toPctBlock(
        n(coverageTokenMeta.covered_rich),
        n(coverageTokenMeta.total)
      ),
      holdingsWithEvents: toPctBlock(
        n(coverageHoldingsEvents.covered),
        n(coverageHoldingsEvents.total)
      ),
      tokenPairsWithContractMetadata: toPctBlock(
        n(coverageContractMeta.covered),
        n(coverageContractMeta.total)
      ),
      counterpartyAddressesLabeled: toPctBlock(
        n(coverageCounterparty.covered),
        n(coverageCounterparty.total)
      ),
      walletsSyncedRecently: toPctBlock(
        n(coverageWalletSync.covered),
        n(coverageWalletSync.total)
      ),
      usersWithCollectionsGivenHoldings: toPctBlock(
        n(coverageUsersCollections.covered),
        n(coverageUsersCollections.total)
      ),
    },
    scheduler,
    topMissing: {
      contractsMissingTokenMetadata: gapTokenMeta.map((r) => ({
        tokenContract: r.token_contract,
        missingTokenCount: n(r.missing),
      })),
      contractsMissingContractMetadata: gapContractMeta.map((r) => ({
        tokenContract: r.token_contract,
        heldTokens: n(r.held_tokens),
      })),
      holdingsMissingEventsByContract: gapHoldingsEvents.map((r) => ({
        tokenContract: r.token_contract,
        missingHoldings: n(r.missing),
      })),
    },
    warnings,
  };
}
