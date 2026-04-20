#!/usr/bin/env bash
# Export the high-value tables from the Guidance SQLite DB to
# CSV files shaped for WTF's intel-import workflow.
#
# Why this exists: Guidance/data/guidance.db is 6.2 GB and has the
# complete Tezos-NFT history (2.9M sales back to 2021-03-22 when
# Hen first launched, plus XTZ prices back to Tezos mainnet in
# 2017-07-01).  We only need a few columns from a few tables — the
# rest is either already downstream of these (creators, daily metrics)
# or handled later in the pipeline.
#
# The output CSVs are shaped to match the `scripts/import-intel-csv.ts`
# expected column headers so the existing import workflow can ingest
# them unchanged.  Where Guidance's schema is strictly richer than
# Intel's (ophash, level, marketplace_contract, sale_type), we export
# the extra columns too — the importer will pick them up.
#
# Usage:
#   ./scripts/export-guidance-sqlite.sh [db-path] [out-dir]
#
# Defaults:
#   db-path:  ../../../WTF combo/Tezos analytics/Guidance/data/guidance.db
#   out-dir:  /tmp/guidance-csv
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_DB="${SCRIPT_DIR}/../../Tezos analytics/Guidance/data/guidance.db"

DB_PATH="${1:-$DEFAULT_DB}"
OUT_DIR="${2:-/tmp/guidance-csv}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "[export-guidance] DB not found: $DB_PATH" >&2
  exit 1
fi

command -v sqlite3 >/dev/null 2>&1 || {
  echo "[export-guidance] sqlite3 CLI required on PATH" >&2
  exit 1
}

mkdir -p "$OUT_DIR"
echo "[export-guidance] DB:   $DB_PATH"
echo "[export-guidance] out:  $OUT_DIR"
echo

# Common SQLite dump prelude: CSV mode with header, no decoration.
SQLITE_HEADER='
.headers on
.mode csv
.nullvalue ""
.timeout 60000
'

# Produce a well-formed CSV for every target.  We SELECT the exact
# column set the importer will look for so the workflow doesn't care
# whether the source was Intel or Guidance.

# ── sales ────────────────────────────────────────────────────────────
# Two sources produce raw_objkt_sales rows:
#   • objkt_advisor_import + objkt_archive — most rows have a real
#     on-chain ophash
#   • objkt_graphql — historic rows (2021-2023 especially) often lack
#     ophash because objkt's GraphQL didn't expose it at write time
# To keep the deep history we synthesise an op_hash from the stable
# Guidance `id` when the real hash is missing.  The WTF importer
# stamps this into `token_sales.op_hash` and `objkt_event_id` so a
# future reconciliation pass can rewrite the synthetic key against the
# real ophash once TzKT confirms it.
echo "[export-guidance] → sales.csv  (raw_objkt_sales, dedup on op_hash surrogate)"
sqlite3 "$DB_PATH" <<SQL > "$OUT_DIR/sales.csv"
$SQLITE_HEADER
.output '$OUT_DIR/sales.csv'
WITH base AS (
  SELECT
    id,
    timestamp,
    token_contract,
    token_id,
    seller_address,
    buyer_address,
    COALESCE(NULLIF(normalized_price_mutez, 0), price_mutez, 0) AS price_mutez,
    -- If we have a real ophash, use it.  Otherwise fall back to the
    -- Guidance row id so dedup/unique constraints still work.
    COALESCE(NULLIF(ophash, ''), 'synth:' || id) AS op_hash,
    CASE WHEN ophash IS NOT NULL AND ophash <> '' THEN 1 ELSE 0 END AS ophash_real,
    level,
    COALESCE(marketplace_name, marketplace_group) AS marketplace,
    marketplace_contract,
    sale_type,
    event_source,
    CASE WHEN LOWER(COALESCE(sale_type, '')) LIKE '%primary%'
         OR LOWER(COALESCE(sale_type, '')) = 'mint'
         OR LOWER(COALESCE(sale_type, '')) = 'listing_sale_primary'
         THEN 1 ELSE 0 END AS is_primary,
    COALESCE(currency, 'XTZ') AS currency
  FROM raw_objkt_sales
  WHERE token_contract IS NOT NULL
    AND token_id IS NOT NULL
    -- Only require buyer — seller may be NULL in historic
    -- objkt_graphql rows (2021-2023), and that's fine for
    -- acquisition/cost-basis analytics on the buyer's side.
    AND buyer_address IS NOT NULL AND buyer_address <> ''
    AND timestamp IS NOT NULL
    AND (currency IS NULL OR currency = '' OR UPPER(currency) = 'XTZ')
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY op_hash, token_contract, token_id,
                   COALESCE(seller_address, ''), buyer_address
      -- Prefer rows with a real ophash and a filled seller.  Rank by
      -- source quality (objkt_archive > objkt_advisor_import >
      -- objkt_graphql) so when the same sale exists in two sources
      -- we keep the more reliable row.
      ORDER BY ophash_real DESC,
               CASE WHEN seller_address IS NOT NULL AND seller_address <> '' THEN 0 ELSE 1 END,
               CASE event_source
                 WHEN 'objkt_archive_2026_02_26' THEN 1
                 WHEN 'objkt_advisor_import'     THEN 2
                 WHEN 'objkt_graphql'            THEN 3
                 ELSE 4 END,
               id
    ) AS rn
  FROM base
)
SELECT
  id,
  timestamp,
  token_contract,
  token_id,
  seller_address,
  buyer_address,
  price_mutez,
  op_hash AS ophash,
  ophash_real,
  level,
  marketplace,
  marketplace_contract,
  sale_type,
  event_source,
  is_primary,
  currency
FROM ranked
WHERE rn = 1;
SQL
echo "   rows: $(wc -l < "$OUT_DIR/sales.csv")"

# ── mints ────────────────────────────────────────────────────────────
echo "[export-guidance] → mint_events.csv  (market_events WHERE event_type LIKE '%mint%')"
sqlite3 "$DB_PATH" <<SQL > "$OUT_DIR/mint_events.csv"
$SQLITE_HEADER
.output '$OUT_DIR/mint_events.csv'
SELECT
  event_id,
  ophash AS tx_hash,
  token_contract AS contract,
  token_id,
  COALESCE(seller_address, creator_address) AS minter,
  COALESCE(
    CAST(amount AS INTEGER),
    1
  ) AS editions,
  timestamp,
  COALESCE(marketplace, event_subtype) AS platform,
  level,
  creator_address
FROM market_events
WHERE event_type LIKE '%mint%'
  AND ophash IS NOT NULL AND ophash <> ''
  AND token_contract IS NOT NULL
  AND token_id IS NOT NULL
  AND timestamp IS NOT NULL
  AND COALESCE(reverted, 0) = 0;
SQL
echo "   rows: $(wc -l < "$OUT_DIR/mint_events.csv")"

# ── xtz prices (deep history) ────────────────────────────────────────
echo "[export-guidance] → xtz_prices.csv  (xtz_price_daily)"
sqlite3 "$DB_PATH" <<SQL > "$OUT_DIR/xtz_prices.csv"
$SQLITE_HEADER
.output '$OUT_DIR/xtz_prices.csv'
SELECT
  day,
  avg_usd,
  source,
  updated_at
FROM xtz_price_daily
WHERE day IS NOT NULL AND avg_usd IS NOT NULL;
SQL
echo "   rows: $(wc -l < "$OUT_DIR/xtz_prices.csv")"

# ── tokens (metadata + pre-computed stats) ───────────────────────────
echo "[export-guidance] → tokens.csv  (token_metadata_cache)"
sqlite3 "$DB_PATH" <<SQL > "$OUT_DIR/tokens.csv"
$SQLITE_HEADER
.output '$OUT_DIR/tokens.csv'
SELECT
  token_contract AS contract,
  token_id,
  token_name AS name,
  token_description AS description,
  creator_address,
  metadata_uri,
  thumbnail_uri,
  display_uri,
  artifact_uri,
  supply,
  total_sales_count,
  total_sales_volume,
  last_sale_at,
  last_synced
FROM token_metadata_cache
WHERE token_contract IS NOT NULL
  AND token_id IS NOT NULL;
SQL
echo "   rows: $(wc -l < "$OUT_DIR/tokens.csv")"

# ── address labels (23k, rich label_type + confidence) ───────────────
echo "[export-guidance] → address_labels.csv"
sqlite3 "$DB_PATH" <<SQL > "$OUT_DIR/address_labels.csv"
$SQLITE_HEADER
.output '$OUT_DIR/address_labels.csv'
SELECT
  address,
  label,
  label_type,
  source,
  confidence,
  updated_at
FROM address_labels
WHERE address IS NOT NULL AND label IS NOT NULL;
SQL
echo "   rows: $(wc -l < "$OUT_DIR/address_labels.csv")"

# ── marketplace contracts (free enrichment for contract_metadata) ────
echo "[export-guidance] → marketplace_contracts.csv"
sqlite3 "$DB_PATH" <<SQL > "$OUT_DIR/marketplace_contracts.csv"
$SQLITE_HEADER
.output '$OUT_DIR/marketplace_contracts.csv'
SELECT
  address,
  marketplace,
  COALESCE(name, alias) AS name,
  kind,
  source,
  confidence,
  first_seen_at,
  last_seen_at,
  tx_count
FROM marketplace_contracts
WHERE address IS NOT NULL;
SQL
echo "   rows: $(wc -l < "$OUT_DIR/marketplace_contracts.csv")"

# ── creators (analytics extra — score, momentum) ─────────────────────
echo "[export-guidance] → creators.csv"
sqlite3 "$DB_PATH" <<SQL > "$OUT_DIR/creators.csv"
$SQLITE_HEADER
.output '$OUT_DIR/creators.csv'
SELECT
  address,
  name,
  score,
  total_sales,
  total_volume_mutez,
  avg_sale_mutez,
  unique_buyers,
  momentum_24h,
  updated_at
FROM creators
WHERE address IS NOT NULL;
SQL
echo "   rows: $(wc -l < "$OUT_DIR/creators.csv")"

echo
echo "[export-guidance] total output size:"
du -sh "$OUT_DIR"
echo "[export-guidance] files:"
ls -lh "$OUT_DIR"
echo
echo "Next steps:"
echo "  1. ./scripts/pack-intel-csv.sh $OUT_DIR /tmp/wtf-guidance-csv.tar.gz"
echo "     (re-uses the same packer; tarball name signals the source)"
echo "  2. TAR_PATH=/tmp/wtf-guidance-csv.tar.gz OBJECT_NAME=guidance-2026-02-27.tar.gz \\"
echo "       node scripts/upload-intel-csv-to-supabase.mjs"
echo "  3. Trigger the 'Import Intel CSV dump' workflow with the signed URL."
