-- Cockpit database completeness audit — read-only.
--
-- Emits one section per query as a single-row JSON blob so the
-- calling workflow can concatenate the stdout into a structured
-- report.  Every count is cast to int and every ratio is rounded
-- to 2 decimal places.
--
-- Safe to run repeatedly; no writes.  The queries that scan
-- wallet_events / wallet_holdings use the existing indexes on
-- (wallet_address, token_contract, token_id) and (token_contract,
-- token_id), so runtime is dominated by the join density rather
-- than row scans.

\pset format unaligned
\pset footer off
\pset tuples_only on

SELECT '== SECTION: tables ==' AS marker;

SELECT row_to_json(t) FROM (
  SELECT
    (SELECT COUNT(*)::int FROM users)                                     AS users,
    (SELECT COUNT(*)::int FROM user_wallets)                              AS user_wallets,
    (SELECT COUNT(*)::int FROM user_wallets WHERE is_primary)             AS user_wallets_primary,
    (SELECT COUNT(*)::int FROM user_wallets
       WHERE last_synced_at IS NOT NULL
         AND last_synced_at > NOW() - INTERVAL '24 hours')                AS user_wallets_synced_24h,
    (SELECT COUNT(*)::int FROM user_wallets WHERE last_synced_at IS NULL) AS user_wallets_never_synced,
    (SELECT COUNT(*)::int FROM wallet_events)                             AS wallet_events,
    (SELECT COUNT(*)::int FROM wallet_events WHERE user_id IS NULL)       AS wallet_events_unlinked,
    (SELECT COUNT(DISTINCT wallet_address)::int FROM wallet_events)       AS wallet_events_distinct_wallets,
    (SELECT COUNT(DISTINCT (token_contract, token_id))::int
       FROM wallet_events WHERE token_contract IS NOT NULL)               AS wallet_events_distinct_token_pairs,
    (SELECT to_char(MIN(timestamp) AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM wallet_events)           AS wallet_events_oldest,
    (SELECT to_char(MAX(timestamp) AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM wallet_events)           AS wallet_events_newest,
    (SELECT COUNT(*)::int FROM wallet_holdings)                           AS wallet_holdings,
    (SELECT COUNT(*)::int FROM wallet_holdings
       WHERE COALESCE(NULLIF(balance,'')::numeric, 0) <> 0)               AS wallet_holdings_nonzero,
    (SELECT COUNT(*)::int FROM wallet_holdings
       WHERE COALESCE(NULLIF(balance,'')::numeric, 0) = 0)                AS wallet_holdings_zero,
    (SELECT COUNT(DISTINCT (token_contract, token_id))::int
       FROM wallet_holdings)                                              AS wallet_holdings_distinct_token_pairs,
    (SELECT COUNT(*)::int FROM wallet_holdings WHERE tzkt_last_time IS NOT NULL) AS wallet_holdings_tzkt_reconciled,
    (SELECT COUNT(*)::int FROM token_metadata)                            AS token_metadata,
    (SELECT COUNT(*)::int FROM token_metadata
       WHERE name IS NOT NULL AND name <> '')                             AS token_metadata_with_name,
    (SELECT COUNT(*)::int FROM token_metadata
       WHERE thumbnail IS NOT NULL AND thumbnail <> '')                   AS token_metadata_with_thumbnail,
    (SELECT COUNT(*)::int FROM token_metadata
       WHERE display_uri IS NOT NULL AND display_uri <> '')               AS token_metadata_with_display_uri,
    (SELECT COUNT(*)::int FROM token_metadata
       WHERE artifact_uri IS NOT NULL AND artifact_uri <> '')             AS token_metadata_with_artifact_uri,
    (SELECT COUNT(*)::int FROM token_metadata
       WHERE mime_type IS NOT NULL AND mime_type <> '')                   AS token_metadata_with_mime,
    (SELECT COUNT(*)::int FROM token_metadata
       WHERE COALESCE(NULLIF(display_uri,''), NULLIF(artifact_uri,''), NULLIF(thumbnail,'')) IS NOT NULL)
                                                                          AS token_metadata_with_any_uri,
    (SELECT COUNT(*)::int FROM token_metadata
       WHERE name IS NOT NULL AND name <> ''
         AND COALESCE(NULLIF(display_uri,''), NULLIF(artifact_uri,''), NULLIF(thumbnail,'')) IS NOT NULL)
                                                                          AS token_metadata_complete_basics,
    (SELECT COUNT(*)::int FROM token_metadata
       WHERE fetched_at < NOW() - INTERVAL '30 days')                     AS token_metadata_stale_30d,
    (SELECT COUNT(*)::int FROM contract_metadata)                         AS contract_metadata,
    (SELECT COUNT(*)::int FROM address_labels)                            AS address_labels,
    (SELECT COUNT(*)::int FROM collections)                               AS collections,
    (SELECT COUNT(*)::int FROM collections WHERE type = 'trade_board_listing') AS collections_trade_board,
    (SELECT COUNT(DISTINCT collection_id)::int FROM collection_items)     AS collections_nonempty,
    (SELECT COUNT(*)::int FROM collection_items)                          AS collection_items,
    (SELECT COUNT(*)::int FROM sync_runs)                                 AS sync_runs,
    (SELECT COUNT(*)::int FROM sync_runs WHERE started_at > NOW() - INTERVAL '24 hours')             AS sync_runs_last_24h,
    (SELECT COUNT(*)::int FROM sync_runs WHERE started_at > NOW() - INTERVAL '24 hours' AND status='error')
                                                                          AS sync_runs_errors_24h,
    (SELECT COUNT(*)::int FROM sync_runs WHERE started_at > NOW() - INTERVAL '24 hours' AND status='skipped')
                                                                          AS sync_runs_skipped_24h,
    (SELECT COUNT(*)::int FROM indexing_queue WHERE status='pending')     AS indexing_queue_pending,
    (SELECT COUNT(*)::int FROM indexing_queue WHERE status='running')     AS indexing_queue_running,
    (SELECT COUNT(*)::int FROM indexing_queue WHERE status='done')        AS indexing_queue_done,
    (SELECT COUNT(*)::int FROM indexing_queue WHERE status='failed')      AS indexing_queue_failed,
    (SELECT COUNT(*)::int FROM indexing_queue
       WHERE status='running' AND picked_up_at IS NOT NULL
         AND picked_up_at < NOW() - INTERVAL '1 hour')                    AS indexing_queue_stale
) t;

SELECT '== SECTION: coverage ==' AS marker;

-- Holdings (token_contract, token_id) → token_metadata join
WITH pairs AS (
  SELECT DISTINCT token_contract, token_id FROM wallet_holdings
),
counts AS (
  SELECT
    COUNT(*)::int AS total,
    COUNT(tm.token_id)::int AS covered_any,
    COUNT(*) FILTER (
      WHERE tm.name IS NOT NULL AND tm.name <> ''
        AND COALESCE(NULLIF(tm.display_uri,''), NULLIF(tm.artifact_uri,''), NULLIF(tm.thumbnail,'')) IS NOT NULL
    )::int AS covered_rich
  FROM pairs p
  LEFT JOIN token_metadata tm
    ON tm.token_contract = p.token_contract AND tm.token_id = p.token_id
)
SELECT row_to_json(t) FROM (
  SELECT
    'holdings_with_metadata' AS metric,
    total, covered_any AS covered, (total - covered_any) AS missing,
    CASE WHEN total = 0 THEN 0
         ELSE ROUND(covered_any::numeric * 100 / total, 2) END AS pct
  FROM counts
  UNION ALL
  SELECT
    'holdings_with_rich_metadata' AS metric,
    total, covered_rich, (total - covered_rich),
    CASE WHEN total = 0 THEN 0
         ELSE ROUND(covered_rich::numeric * 100 / total, 2) END
  FROM counts
) t;

-- Holdings with at least one matching row in wallet_events
SELECT row_to_json(t) FROM (
  SELECT
    'holdings_with_events' AS metric,
    (SELECT COUNT(*)::int FROM wallet_holdings) AS total,
    (SELECT COUNT(*)::int FROM wallet_holdings h
       WHERE EXISTS (
         SELECT 1 FROM wallet_events e
         WHERE e.wallet_address = h.wallet_address
           AND e.token_contract = h.token_contract
           AND e.token_id       = h.token_id
       )) AS covered,
    (SELECT COUNT(*)::int FROM wallet_holdings h
       WHERE NOT EXISTS (
         SELECT 1 FROM wallet_events e
         WHERE e.wallet_address = h.wallet_address
           AND e.token_contract = h.token_contract
           AND e.token_id       = h.token_id
       )) AS missing,
    (SELECT CASE
       WHEN (SELECT COUNT(*) FROM wallet_holdings) = 0 THEN 0
       ELSE ROUND(
         (SELECT COUNT(*) FROM wallet_holdings h WHERE EXISTS (
            SELECT 1 FROM wallet_events e
            WHERE e.wallet_address = h.wallet_address
              AND e.token_contract = h.token_contract
              AND e.token_id       = h.token_id
         ))::numeric * 100 /
         (SELECT COUNT(*) FROM wallet_holdings), 2)
     END) AS pct
) t;

-- Contracts referenced in holdings → contract_metadata
SELECT row_to_json(t) FROM (
  WITH contracts AS (
    SELECT DISTINCT token_contract FROM wallet_holdings WHERE token_contract IS NOT NULL
  )
  SELECT
    'token_pairs_with_contract_metadata' AS metric,
    (SELECT COUNT(*)::int FROM contracts) AS total,
    (SELECT COUNT(*)::int FROM contracts c
       JOIN contract_metadata cm ON cm.address = c.token_contract) AS covered,
    (SELECT COUNT(*)::int FROM contracts c
       LEFT JOIN contract_metadata cm ON cm.address = c.token_contract
       WHERE cm.address IS NULL) AS missing,
    CASE WHEN (SELECT COUNT(*) FROM contracts) = 0 THEN 0
         ELSE ROUND(
           (SELECT COUNT(*) FROM contracts c
              JOIN contract_metadata cm ON cm.address = c.token_contract)::numeric * 100 /
           (SELECT COUNT(*) FROM contracts), 2) END AS pct
) t;

-- Counterparty addresses in events → address_labels
SELECT row_to_json(t) FROM (
  WITH counterparties AS (
    SELECT DISTINCT counterparty_address FROM wallet_events WHERE counterparty_address IS NOT NULL
  )
  SELECT
    'counterparty_addresses_labeled' AS metric,
    (SELECT COUNT(*)::int FROM counterparties) AS total,
    (SELECT COUNT(*)::int FROM counterparties c
       JOIN address_labels al ON al.address = c.counterparty_address) AS covered,
    (SELECT COUNT(*)::int FROM counterparties c
       LEFT JOIN address_labels al ON al.address = c.counterparty_address
       WHERE al.address IS NULL) AS missing,
    CASE WHEN (SELECT COUNT(*) FROM counterparties) = 0 THEN 0
         ELSE ROUND(
           (SELECT COUNT(*) FROM counterparties c
              JOIN address_labels al ON al.address = c.counterparty_address)::numeric * 100 /
           (SELECT COUNT(*) FROM counterparties), 2) END AS pct
) t;

-- user_wallets synced in last 24 h
SELECT row_to_json(t) FROM (
  SELECT
    'wallets_synced_recently' AS metric,
    (SELECT COUNT(*)::int FROM user_wallets) AS total,
    (SELECT COUNT(*)::int FROM user_wallets
       WHERE last_synced_at IS NOT NULL AND last_synced_at > NOW() - INTERVAL '24 hours') AS covered,
    (SELECT COUNT(*)::int FROM user_wallets
       WHERE last_synced_at IS NULL OR last_synced_at <= NOW() - INTERVAL '24 hours') AS missing,
    CASE WHEN (SELECT COUNT(*) FROM user_wallets) = 0 THEN 0
         ELSE ROUND(
           (SELECT COUNT(*) FROM user_wallets
              WHERE last_synced_at IS NOT NULL AND last_synced_at > NOW() - INTERVAL '24 hours')::numeric
           * 100 /
           (SELECT COUNT(*) FROM user_wallets), 2) END AS pct
) t;

-- Users with holdings but no collections
SELECT row_to_json(t) FROM (
  WITH holding_users AS (
    SELECT DISTINCT user_id FROM wallet_holdings WHERE user_id IS NOT NULL
  )
  SELECT
    'users_with_collections_given_holdings' AS metric,
    (SELECT COUNT(*)::int FROM holding_users) AS total,
    (SELECT COUNT(*)::int FROM holding_users hu
       WHERE EXISTS (SELECT 1 FROM collections c WHERE c.user_id = hu.user_id)) AS covered,
    (SELECT COUNT(*)::int FROM holding_users hu
       WHERE NOT EXISTS (SELECT 1 FROM collections c WHERE c.user_id = hu.user_id)) AS missing,
    CASE WHEN (SELECT COUNT(*) FROM holding_users) = 0 THEN 0
         ELSE ROUND(
           (SELECT COUNT(*) FROM holding_users hu
              WHERE EXISTS (SELECT 1 FROM collections c WHERE c.user_id = hu.user_id))::numeric
           * 100 /
           (SELECT COUNT(*) FROM holding_users), 2) END AS pct
) t;

SELECT '== SECTION: scheduler ==' AS marker;

SELECT row_to_json(t) FROM (
  SELECT DISTINCT ON (job_name)
    job_name,
    status,
    to_char(started_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"')                              AS started_at,
    CASE WHEN finished_at IS NULL THEN NULL
         ELSE to_char(finished_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS"Z"') END                   AS finished_at,
    duration_ms,
    items_in,
    items_out,
    CASE WHEN error IS NULL THEN NULL
         ELSE left(error, 800) END                                AS error,
    GREATEST(0, EXTRACT(EPOCH FROM (NOW() - started_at)))::int    AS age_seconds,
    cursor_after
  FROM sync_runs
  ORDER BY job_name, started_at DESC
) t;

SELECT '== SECTION: top_missing ==' AS marker;

-- Contracts with the most (contract, tokenId) pairs missing from token_metadata
SELECT row_to_json(t) FROM (
  WITH pairs AS (
    SELECT DISTINCT token_contract, token_id FROM wallet_holdings
  ),
  missing AS (
    SELECT p.token_contract, COUNT(*)::int AS missing_token_count
    FROM pairs p
    LEFT JOIN token_metadata tm
      ON tm.token_contract = p.token_contract AND tm.token_id = p.token_id
    WHERE tm.token_id IS NULL
    GROUP BY p.token_contract
    ORDER BY missing_token_count DESC
    LIMIT 10
  )
  SELECT 'contracts_missing_token_metadata' AS kind, token_contract, missing_token_count FROM missing
) t;

-- Contracts in holdings that don't have a contract_metadata row
SELECT row_to_json(t) FROM (
  WITH contracts AS (
    SELECT token_contract, COUNT(*)::int AS held_tokens
    FROM wallet_holdings WHERE token_contract IS NOT NULL
    GROUP BY token_contract
  )
  SELECT
    'contracts_missing_contract_metadata' AS kind,
    c.token_contract, c.held_tokens
  FROM contracts c
  LEFT JOIN contract_metadata cm ON cm.address = c.token_contract
  WHERE cm.address IS NULL
  ORDER BY c.held_tokens DESC
  LIMIT 10
) t;

-- Contracts with the most holdings lacking wallet_events history
SELECT row_to_json(t) FROM (
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
  SELECT
    'holdings_missing_events_by_contract' AS kind,
    token_contract,
    COUNT(*)::int AS missing_holdings
  FROM orphan
  GROUP BY token_contract
  ORDER BY missing_holdings DESC
  LIMIT 10
) t;

SELECT '== SECTION: end ==' AS marker;
