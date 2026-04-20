/**
 * Bulk import the frozen Tezos-Intel Postgres dump
 * (`objkt-advisor-db-2026-02-26/*.csv`) into WTF's analytics tables.
 *
 * Design:
 *   • Stream each CSV line-by-line (memory stays O(batch) regardless
 *     of file size — important for `sales.csv` at 118MB).
 *   • Collect rows into batches and `INSERT` via a single multi-row
 *     query (batch size capped so total bind-params stay ≤ 32k).
 *   • Target is a per-run `TEMP` staging table with all-TEXT columns,
 *     so we never hit type-coercion failures mid-stream.
 *   • After every CSV is loaded, run a single
 *     `INSERT INTO <target> SELECT ... FROM staging ON CONFLICT DO UPDATE`
 *     query which casts, trims stray quotes, normalises nulls, and
 *     dedupes on the declared uniqueness constraint.
 *   • The whole per-file operation is wrapped in a BEGIN/COMMIT so a
 *     failing file cannot leave partial state behind.
 *
 * The CSV dialect matches `pg_dump --format=csv`:
 *   – fields are optionally quoted with `"`
 *   – literal `"` inside a quoted field is escaped as `""`
 *   – empty unquoted field ⇒ SQL NULL (we coalesce with NULLIF('',…))
 *   – timestamps are serialised as JSON-quoted ISO strings, so in the
 *     CSV they appear as `"""2026-02-18T06:29:01.000Z"""` and after
 *     parsing we get `"2026-02-18T06:29:01.000Z"` (with literal quotes
 *     that `TRIM(BOTH '"' FROM …)` strips before casting).
 *
 * Usage:
 *   tsx scripts/import-intel-csv.ts <csv-dir> [--only=sales,mint_events]
 *
 * Exit code: 0 on success, 1 if any CSV failed.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import pg from "pg";
import { pool } from "../server/db";

type Row = (string | null)[];

/**
 * Idempotent schema for analytics phase 1.  Mirrors
 * `drizzle/0015_analytics_phase1.sql`.  We inline it here so the
 * esbuild bundle is fully self-contained and the prod image doesn't
 * need `drizzle/*.sql` shipped alongside it.  Kept in sync by
 * matching this string against the file at CI time (see
 * `.github/workflows/import-intel-csv.yml`).
 */
const SCHEMA_SQL = `
-- Analytics phase 1 — honest cost/sale/market tracking (inlined).
ALTER TABLE "address_labels"
  ADD COLUMN IF NOT EXISTS "has_ever_minted" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_resolved_at" timestamp;
CREATE INDEX IF NOT EXISTS "idx_address_labels_minted"
  ON "address_labels" ("has_ever_minted");

ALTER TABLE "token_metadata"
  ADD COLUMN IF NOT EXISTS "creator_address" varchar(64),
  ADD COLUMN IF NOT EXISTS "supply" bigint;
CREATE INDEX IF NOT EXISTS "idx_token_metadata_creator"
  ON "token_metadata" ("creator_address");

CREATE TABLE IF NOT EXISTS "xtz_usd_daily" (
  "day"        date PRIMARY KEY,
  "price_usd"  numeric(18, 6) NOT NULL,
  "source"     varchar(64)    NOT NULL DEFAULT 'tzkt_quotes',
  "fetched_at" timestamp      NOT NULL DEFAULT now()
);
-- Widen on pre-existing deployments: the Guidance importer tags its
-- source column with a concatenation of event_source + optional
-- _synth/_noseller suffixes which can exceed 32 chars.
ALTER TABLE "xtz_usd_daily" ALTER COLUMN "source" TYPE varchar(64);
CREATE INDEX IF NOT EXISTS "idx_xtz_usd_daily_source"
  ON "xtz_usd_daily" ("source");

CREATE TABLE IF NOT EXISTS "token_mint_events" (
  "id"               serial PRIMARY KEY,
  "token_contract"   varchar(36) NOT NULL,
  "token_id"         text        NOT NULL,
  "editions"         integer     NOT NULL DEFAULT 1,
  "minter_address"   varchar(64) NOT NULL,
  "first_owner"      varchar(64),
  "op_hash"          varchar(72) NOT NULL,
  "block_level"      bigint,
  "minted_at"        timestamptz NOT NULL,
  "platform"         varchar(32),
  "objkt_event_id"   text,
  "mint_fee_mutez"   bigint,
  "source"           varchar(64) NOT NULL DEFAULT 'intel_csv',
  "imported_at"      timestamp   NOT NULL DEFAULT now()
);
ALTER TABLE "token_mint_events" ALTER COLUMN "source" TYPE varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_mint_op"
  ON "token_mint_events" ("token_contract", "token_id", "op_hash");
CREATE INDEX IF NOT EXISTS "idx_mint_events_token"
  ON "token_mint_events" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_mint_events_minter"
  ON "token_mint_events" ("minter_address");
CREATE INDEX IF NOT EXISTS "idx_mint_events_minted_at"
  ON "token_mint_events" ("minted_at");

CREATE TABLE IF NOT EXISTS "token_sales" (
  "id"                  serial PRIMARY KEY,
  "token_contract"      varchar(36) NOT NULL,
  "token_id"            text        NOT NULL,
  "legacy_id"           bigint,
  "tzkt_op_id"          bigint,
  "op_hash"             varchar(72) NOT NULL,
  -- Seller may be NULL for historic Objkt-GraphQL rows (2021-2023).
  -- They still tell us the buyer paid price_mutez on sold_at, which
  -- is enough to build an acquisition lot for the buyer wallet.
  "seller_address"      varchar(64),
  "buyer_address"       varchar(64) NOT NULL,
  "price_mutez"         bigint      NOT NULL,
  "price_usd"           numeric(24, 6),
  "royalties_mutez"     bigint      DEFAULT 0,
  "platform_fee_mutez"  bigint      DEFAULT 0,
  "marketplace"         varchar(32),
  "objkt_event_id"      text,
  "is_primary"          boolean     NOT NULL DEFAULT false,
  "editions_sold"       integer     NOT NULL DEFAULT 1,
  "block_level"         bigint,
  "sold_at"             timestamptz NOT NULL,
  "source"              varchar(64) NOT NULL DEFAULT 'intel_csv',
  "imported_at"         timestamp   NOT NULL DEFAULT now()
);
-- Relax seller_address on previously-deployed tables that still
-- have the NOT NULL constraint baked in.
ALTER TABLE "token_sales" ALTER COLUMN "seller_address" DROP NOT NULL;
-- Widen source to accept Guidance-style suffixed tags
-- (objkt_archive_YYYY_MM_DD_synth_noseller etc.).
ALTER TABLE "token_sales" ALTER COLUMN "source" TYPE varchar(64);
-- Drop the old unique index if it uses seller_address directly and
-- rebuild it treating NULL seller as '' so rows without a seller
-- still dedupe on (op_hash, contract, token_id, buyer).
DROP INDEX IF EXISTS "uniq_sales_ophash";
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_sales_ophash"
  ON "token_sales" (
    "op_hash",
    "token_contract",
    "token_id",
    COALESCE("seller_address", ''),
    "buyer_address"
  );
CREATE INDEX IF NOT EXISTS "idx_sales_token"
  ON "token_sales" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_sales_seller"
  ON "token_sales" ("seller_address");
CREATE INDEX IF NOT EXISTS "idx_sales_buyer"
  ON "token_sales" ("buyer_address");
CREATE INDEX IF NOT EXISTS "idx_sales_sold_at"
  ON "token_sales" ("sold_at");
CREATE INDEX IF NOT EXISTS "idx_sales_primary"
  ON "token_sales" ("is_primary");
CREATE INDEX IF NOT EXISTS "idx_sales_marketplace"
  ON "token_sales" ("marketplace");

CREATE TABLE IF NOT EXISTS "acquisition_lots" (
  "id"                  serial PRIMARY KEY,
  "wallet_address"      varchar(64) NOT NULL,
  "token_contract"      varchar(36) NOT NULL,
  "token_id"            text        NOT NULL,
  "editions"            integer     NOT NULL DEFAULT 1,
  "acquisition_type"    varchar(24) NOT NULL DEFAULT 'purchase',
  "cost_mutez"          bigint      NOT NULL,
  "cost_usd"            numeric(24, 6),
  "royalties_mutez"     bigint      DEFAULT 0,
  "platform_fee_mutez"  bigint      DEFAULT 0,
  "marketplace"         varchar(32),
  "op_hash"             varchar(72) NOT NULL,
  "block_level"         bigint,
  "acquired_at"         timestamptz NOT NULL,
  "disposed_at"         timestamptz,
  "sale_id"             integer,
  "source"              varchar(64) NOT NULL DEFAULT 'derived',
  "imported_at"         timestamp   NOT NULL DEFAULT now()
);
ALTER TABLE "acquisition_lots" ALTER COLUMN "source" TYPE varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_acq_lot"
  ON "acquisition_lots" ("wallet_address", "token_contract", "token_id", "op_hash");
CREATE INDEX IF NOT EXISTS "idx_acq_lots_wallet"
  ON "acquisition_lots" ("wallet_address");
CREATE INDEX IF NOT EXISTS "idx_acq_lots_token"
  ON "acquisition_lots" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_acq_lots_open"
  ON "acquisition_lots" ("disposed_at");
CREATE INDEX IF NOT EXISTS "idx_acq_lots_acquired_at"
  ON "acquisition_lots" ("acquired_at");

CREATE TABLE IF NOT EXISTS "token_listings" (
  "id"              serial PRIMARY KEY,
  "listing_id"      text        NOT NULL,
  "marketplace"     varchar(32) NOT NULL,
  "token_contract"  varchar(36) NOT NULL,
  "token_id"        text        NOT NULL,
  "seller_address"  varchar(64) NOT NULL,
  "price_mutez"     bigint      NOT NULL,
  "price_usd"       numeric(24, 6),
  "royalty_bps"     integer,
  "editions"        integer     NOT NULL DEFAULT 1,
  "active"          boolean     NOT NULL DEFAULT true,
  "listed_at"       timestamptz NOT NULL,
  "cancelled_at"    timestamptz,
  "sold_at"         timestamptz,
  "source"          varchar(64) NOT NULL DEFAULT 'objkt_gql',
  "raw"             jsonb,
  "fetched_at"      timestamp   NOT NULL DEFAULT now()
);
ALTER TABLE "token_listings" ALTER COLUMN "source" TYPE varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_token_listing"
  ON "token_listings" ("marketplace", "listing_id");
CREATE INDEX IF NOT EXISTS "idx_listings_token"
  ON "token_listings" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_listings_active"
  ON "token_listings" ("active");
CREATE INDEX IF NOT EXISTS "idx_listings_seller"
  ON "token_listings" ("seller_address");
CREATE INDEX IF NOT EXISTS "idx_listings_listed_at"
  ON "token_listings" ("listed_at");

CREATE TABLE IF NOT EXISTS "token_market_summary" (
  "token_contract"                 varchar(36) NOT NULL,
  "token_id"                       text        NOT NULL,
  "last_sale_mutez"                bigint,
  "last_sale_at"                   timestamptz,
  "highest_sale_mutez"             bigint,
  "lowest_sale_mutez"              bigint,
  "average_sale_mutez"             bigint,
  "total_volume_mutez"             bigint      DEFAULT 0,
  "sale_count"                     integer     NOT NULL DEFAULT 0,
  "primary_sale_count"             integer     NOT NULL DEFAULT 0,
  "secondary_sale_count"           integer     NOT NULL DEFAULT 0,
  "current_floor_mutez"            bigint,
  "current_highest_listing_mutez"  bigint,
  "average_active_listing_mutez"   bigint,
  "active_listing_count"           integer     NOT NULL DEFAULT 0,
  "unique_owners_count"            integer     NOT NULL DEFAULT 0,
  "total_royalties_mutez"          bigint      DEFAULT 0,
  "total_platform_fees_mutez"      bigint      DEFAULT 0,
  "refreshed_at"                   timestamp   NOT NULL DEFAULT now(),
  CONSTRAINT "pk_token_market_summary"
    PRIMARY KEY ("token_contract", "token_id")
);
CREATE INDEX IF NOT EXISTS "idx_market_floor"
  ON "token_market_summary" ("current_floor_mutez");
CREATE INDEX IF NOT EXISTS "idx_market_last_sale_at"
  ON "token_market_summary" ("last_sale_at");
`;

/**
 * Parse a single CSV line into an array of field values.  Returns
 * `null` entries for unquoted empty fields so the downstream SQL can
 * treat them as NULL without ambiguity; quoted empty strings stay as
 * `""` which maps to a zero-length string in the staging column.
 */
function parseCsvLine(line: string): Row {
  const out: Row = [];
  let cur = "";
  let inQuotes = false;
  let isQuoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
      isQuoted = true;
    } else if (ch === ",") {
      out.push(isQuoted ? cur : cur === "" ? null : cur);
      cur = "";
      isQuoted = false;
    } else {
      cur += ch;
    }
  }
  out.push(isQuoted ? cur : cur === "" ? null : cur);
  return out;
}

/**
 * Read and parse just the header line from a CSV — used to decide
 * which spec to apply when two specs share a filename (Intel vs
 * Guidance).
 */
async function readCsvHeader(file: string): Promise<string[]> {
  const stream = createReadStream(file, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    rl.close();
    stream.close();
    return parseCsvLine(line).map((s) => (s ?? "").trim());
  }
  return [];
}

interface ImportSpec {
  name: string;
  /** CSV filename relative to the dump directory. */
  csv: string;
  /**
   * Shape label used in log output.  Each CSV may have multiple specs
   * (intel_csv vs guidance_sqlite) — the one whose `requireCols` all
   * appear in the CSV header is picked.
   */
  source: "intel_csv" | "guidance_sqlite";
  /**
   * All of these column names must be present in the CSV header for
   * the runner to pick this spec.  This is how we tell the two
   * formats apart for the same logical `sales.csv` filename.
   */
  requireCols: string[];
  /** Columns we want, in the order they appear in the CSV header. */
  stagingCols: string[];
  /** Uniqueness inside the CSV that lets us skip dup rows cheaply. */
  dedupeBy?: (row: Row, header: string[]) => string | null;
  /** Merge SQL — runs after staging is populated. */
  mergeSql: string;
  /** Optional post-merge SQL (refreshes denorm tables etc). */
  postSql?: string;
}

const SPECS: ImportSpec[] = [
  // ═══════════════ Intel CSV dump (objkt-advisor-db-2026-02-26) ═══════════════
  // ─── xtz_usd_daily ─────────────────────────────────────────────
  {
    name: "xtz_prices → xtz_usd_daily [intel]",
    csv: "xtz_prices.csv",
    source: "intel_csv",
    requireCols: ["price_date", "price_usd"],
    stagingCols: [
      "id",
      "price_date",
      "price_usd",
      "market_cap",
      "volume_24h_usd",
      "fetched_at",
    ],
    dedupeBy: (row, header) => {
      const idx = header.indexOf("price_date");
      return idx < 0 ? null : (row[idx] ?? "");
    },
    mergeSql: `
      INSERT INTO xtz_usd_daily (day, price_usd, source, fetched_at)
      SELECT
        TRIM(BOTH '"' FROM COALESCE(price_date, ''))::date,
        NULLIF(TRIM(price_usd), '')::numeric(18,6),
        'tzkt_quotes',
        NULLIF(TRIM(BOTH '"' FROM COALESCE(fetched_at, '')), '')::timestamp
      FROM intel_staging
      WHERE price_date IS NOT NULL
        AND TRIM(BOTH '"' FROM price_date) ~ '^\\d{4}-\\d{2}-\\d{2}'
        AND NULLIF(TRIM(price_usd), '') IS NOT NULL
      ON CONFLICT (day) DO UPDATE SET
        price_usd  = EXCLUDED.price_usd,
        source     = EXCLUDED.source,
        fetched_at = EXCLUDED.fetched_at;
    `,
  },

  // ─── address_labels ─────────────────────────────────────────────
  {
    name: "address_labels → address_labels (merge) [intel]",
    csv: "address_labels.csv",
    source: "intel_csv",
    requireCols: ["address", "tezos_domain", "alias"],
    stagingCols: [
      "id",
      "address",
      "tezos_domain",
      "alias",
      "last_resolved",
      "has_ever_minted",
    ],
    mergeSql: `
      INSERT INTO address_labels (
        address, label, tezos_domain, has_ever_minted, last_resolved_at, updated_at
      )
      SELECT
        address,
        NULLIF(alias, ''),
        NULLIF(tezos_domain, ''),
        COALESCE(NULLIF(LOWER(has_ever_minted), ''), 'false')::boolean,
        NULLIF(TRIM(BOTH '"' FROM COALESCE(last_resolved, '')), '')::timestamp,
        now()
      FROM intel_staging
      WHERE address IS NOT NULL AND address <> ''
      ON CONFLICT (address) DO UPDATE SET
        label             = COALESCE(EXCLUDED.label, address_labels.label),
        tezos_domain      = COALESCE(EXCLUDED.tezos_domain, address_labels.tezos_domain),
        has_ever_minted   = address_labels.has_ever_minted OR EXCLUDED.has_ever_minted,
        last_resolved_at  = GREATEST(
          COALESCE(address_labels.last_resolved_at, EXCLUDED.last_resolved_at),
          COALESCE(EXCLUDED.last_resolved_at, address_labels.last_resolved_at)
        ),
        updated_at        = now();
    `,
  },

  // ─── token_mint_events ──────────────────────────────────────────
  {
    name: "mint_events → token_mint_events [intel]",
    csv: "mint_events.csv",
    source: "intel_csv",
    requireCols: ["tx_hash", "contract", "minter", "editions", "objkt_event_id"],
    stagingCols: [
      "id",
      "objkt_event_id",
      "tx_hash",
      "contract",
      "token_id",
      "minter",
      "editions",
      "timestamp",
      "platform",
    ],
    mergeSql: `
      INSERT INTO token_mint_events (
        token_contract, token_id, editions, minter_address,
        op_hash, minted_at, platform, objkt_event_id, source, imported_at
      )
      SELECT
        contract,
        token_id,
        COALESCE(NULLIF(editions, ''), '1')::integer,
        minter,
        tx_hash,
        TRIM(BOTH '"' FROM timestamp)::timestamptz,
        NULLIF(platform, ''),
        NULLIF(objkt_event_id, ''),
        'intel_csv',
        now()
      FROM intel_staging
      WHERE tx_hash IS NOT NULL AND tx_hash <> ''
        AND contract IS NOT NULL AND token_id IS NOT NULL
        AND timestamp IS NOT NULL
      ON CONFLICT (token_contract, token_id, op_hash) DO UPDATE SET
        editions       = EXCLUDED.editions,
        minter_address = EXCLUDED.minter_address,
        platform       = EXCLUDED.platform,
        objkt_event_id = EXCLUDED.objkt_event_id,
        imported_at    = now();
    `,
  },

  // ─── token_sales ────────────────────────────────────────────────
  {
    name: "sales → token_sales [intel]",
    csv: "sales.csv",
    source: "intel_csv",
    requireCols: ["tx_hash", "contract", "seller", "buyer", "price"],
    stagingCols: [
      "id",
      "tx_hash",
      "contract",
      "token_id",
      "seller",
      "buyer",
      "price",
      "timestamp",
      "platform",
      "objkt_event_id",
      "is_primary",
    ],
    mergeSql: `
      INSERT INTO token_sales (
        legacy_id, token_contract, token_id, op_hash,
        seller_address, buyer_address, price_mutez,
        marketplace, objkt_event_id, is_primary,
        sold_at, source, imported_at
      )
      SELECT
        NULLIF(id, '')::bigint,
        contract,
        token_id,
        tx_hash,
        NULLIF(seller, ''),
        buyer,
        COALESCE(NULLIF(price, ''), '0')::bigint,
        NULLIF(platform, ''),
        NULLIF(objkt_event_id, ''),
        COALESCE(NULLIF(LOWER(is_primary), ''), 'false')::boolean,
        TRIM(BOTH '"' FROM timestamp)::timestamptz,
        'intel_csv',
        now()
      FROM intel_staging
      WHERE tx_hash IS NOT NULL AND tx_hash <> ''
        AND contract IS NOT NULL AND token_id IS NOT NULL
        AND buyer IS NOT NULL
        AND timestamp IS NOT NULL
      ON CONFLICT (op_hash, token_contract, token_id, (COALESCE(seller_address, '')), buyer_address)
        DO UPDATE SET
          legacy_id       = COALESCE(EXCLUDED.legacy_id, token_sales.legacy_id),
          price_mutez     = EXCLUDED.price_mutez,
          marketplace     = EXCLUDED.marketplace,
          objkt_event_id  = COALESCE(EXCLUDED.objkt_event_id, token_sales.objkt_event_id),
          is_primary      = EXCLUDED.is_primary,
          sold_at         = EXCLUDED.sold_at,
          imported_at     = now();
    `,
    postSql: `
      -- Stamp USD snapshots onto rows that don't have one yet.
      UPDATE token_sales s
      SET price_usd = (s.price_mutez::numeric / 1000000.0) * q.price_usd
      FROM xtz_usd_daily q
      WHERE s.price_usd IS NULL
        AND DATE(s.sold_at AT TIME ZONE 'UTC') = q.day;
    `,
  },

  // ─── tokens → token_metadata + token_market_summary ─────────────
  {
    name: "tokens → token_metadata (augment) + token_market_summary (seed) [intel]",
    csv: "tokens.csv",
    source: "intel_csv",
    requireCols: [
      "contract",
      "token_id",
      "floor_price",
      "last_sale_price",
      "avg_sale_price",
    ],
    stagingCols: [
      "id",
      "contract",
      "token_id",
      "name",
      "description",
      "creator_address",
      "metadata_uri",
      "thumbnail_uri",
      "display_uri",
      "artifact_uri",
      "supply",
      "floor_price",
      "last_sale_price",
      "avg_sale_price",
      "total_sales_count",
      "total_sales_volume",
      "last_sale_at",
      "last_synced",
    ],
    mergeSql: `
      -- Upsert metadata.
      INSERT INTO token_metadata (
        token_contract, token_id, name, description,
        thumbnail, artifact_uri, display_uri,
        creator_address, supply, fetched_at, updated_at
      )
      SELECT
        contract,
        token_id,
        NULLIF(name, ''),
        NULLIF(description, ''),
        NULLIF(thumbnail_uri, ''),
        NULLIF(artifact_uri, ''),
        NULLIF(display_uri, ''),
        NULLIF(creator_address, ''),
        NULLIF(supply, '')::bigint,
        now(),
        now()
      FROM intel_staging
      WHERE contract IS NOT NULL AND token_id IS NOT NULL
      ON CONFLICT (token_contract, token_id) DO UPDATE SET
        name            = COALESCE(EXCLUDED.name, token_metadata.name),
        description     = COALESCE(EXCLUDED.description, token_metadata.description),
        thumbnail       = COALESCE(EXCLUDED.thumbnail, token_metadata.thumbnail),
        artifact_uri    = COALESCE(EXCLUDED.artifact_uri, token_metadata.artifact_uri),
        display_uri     = COALESCE(EXCLUDED.display_uri, token_metadata.display_uri),
        creator_address = COALESCE(EXCLUDED.creator_address, token_metadata.creator_address),
        supply          = COALESCE(EXCLUDED.supply, token_metadata.supply),
        updated_at      = now();
    `,
    postSql: `
      -- Seed market summary with any non-zero stat Tezos-Intel already computed.
      INSERT INTO token_market_summary (
        token_contract, token_id,
        last_sale_mutez, last_sale_at,
        average_sale_mutez, sale_count, total_volume_mutez,
        current_floor_mutez, refreshed_at
      )
      SELECT
        contract,
        token_id,
        NULLIF(last_sale_price, '')::bigint,
        NULLIF(TRIM(BOTH '"' FROM COALESCE(last_sale_at, '')), '')::timestamptz,
        NULLIF(avg_sale_price, '')::bigint,
        COALESCE(NULLIF(total_sales_count, ''), '0')::integer,
        COALESCE(NULLIF(total_sales_volume, ''), '0')::bigint,
        NULLIF(floor_price, '')::bigint,
        now()
      FROM intel_staging
      WHERE contract IS NOT NULL AND token_id IS NOT NULL
      ON CONFLICT (token_contract, token_id) DO UPDATE SET
        last_sale_mutez      = COALESCE(EXCLUDED.last_sale_mutez,      token_market_summary.last_sale_mutez),
        last_sale_at         = COALESCE(EXCLUDED.last_sale_at,         token_market_summary.last_sale_at),
        average_sale_mutez   = COALESCE(EXCLUDED.average_sale_mutez,   token_market_summary.average_sale_mutez),
        sale_count           = GREATEST(EXCLUDED.sale_count,           token_market_summary.sale_count),
        total_volume_mutez   = GREATEST(EXCLUDED.total_volume_mutez,   token_market_summary.total_volume_mutez),
        current_floor_mutez  = COALESCE(EXCLUDED.current_floor_mutez,  token_market_summary.current_floor_mutez),
        refreshed_at         = now();
    `,
  },

  // ═══════════════ Guidance SQLite dump (deep history 2017/2021→now) ═══════════════
  // ─── xtz_usd_daily [guidance] ───────────────────────────────────
  {
    name: "xtz_prices → xtz_usd_daily [guidance]",
    csv: "xtz_prices.csv",
    source: "guidance_sqlite",
    requireCols: ["day", "avg_usd"],
    stagingCols: ["day", "avg_usd", "source", "updated_at"],
    dedupeBy: (row, header) => {
      const idx = header.indexOf("day");
      return idx < 0 ? null : (row[idx] ?? "");
    },
    mergeSql: `
      INSERT INTO xtz_usd_daily (day, price_usd, source, fetched_at)
      SELECT
        day::date,
        NULLIF(TRIM(avg_usd), '')::numeric(18,6),
        COALESCE(NULLIF(source, ''), 'guidance_coingecko'),
        NULLIF(TRIM(updated_at), '')::timestamp
      FROM intel_staging
      WHERE day IS NOT NULL
        AND day ~ '^\\d{4}-\\d{2}-\\d{2}'
        AND NULLIF(TRIM(avg_usd), '') IS NOT NULL
      ON CONFLICT (day) DO UPDATE SET
        price_usd  = EXCLUDED.price_usd,
        source     = EXCLUDED.source,
        fetched_at = COALESCE(EXCLUDED.fetched_at, xtz_usd_daily.fetched_at);
    `,
  },

  // ─── address_labels [guidance] ──────────────────────────────────
  {
    name: "address_labels → address_labels (merge) [guidance]",
    csv: "address_labels.csv",
    source: "guidance_sqlite",
    requireCols: ["address", "label", "label_type", "confidence"],
    stagingCols: [
      "address",
      "label",
      "label_type",
      "source",
      "confidence",
      "updated_at",
    ],
    mergeSql: `
      INSERT INTO address_labels (
        address, label, category, updated_at
      )
      SELECT
        address,
        NULLIF(label, ''),
        NULLIF(label_type, ''),
        COALESCE(NULLIF(TRIM(updated_at), '')::timestamp, now())
      FROM intel_staging
      WHERE address IS NOT NULL AND address <> ''
        AND label IS NOT NULL AND label <> ''
      ON CONFLICT (address) DO UPDATE SET
        label        = COALESCE(EXCLUDED.label, address_labels.label),
        category     = COALESCE(EXCLUDED.category, address_labels.category),
        updated_at   = GREATEST(address_labels.updated_at, EXCLUDED.updated_at);
    `,
  },

  // ─── marketplace_contracts (guidance-only) → address_labels ─────
  {
    name: "marketplace_contracts → address_labels [guidance]",
    csv: "marketplace_contracts.csv",
    source: "guidance_sqlite",
    requireCols: ["address", "marketplace", "kind"],
    stagingCols: [
      "address",
      "marketplace",
      "name",
      "kind",
      "source",
      "confidence",
      "first_seen_at",
      "last_seen_at",
      "tx_count",
    ],
    mergeSql: `
      INSERT INTO address_labels (
        address, label, category, updated_at
      )
      SELECT
        address,
        COALESCE(NULLIF(name, ''), NULLIF(marketplace, '')),
        'marketplace_contract',
        COALESCE(NULLIF(TRIM(last_seen_at), '')::timestamp, now())
      FROM intel_staging
      WHERE address IS NOT NULL AND address <> ''
      ON CONFLICT (address) DO UPDATE SET
        label        = COALESCE(address_labels.label, EXCLUDED.label),
        category     = COALESCE(address_labels.category, EXCLUDED.category),
        updated_at   = GREATEST(address_labels.updated_at, EXCLUDED.updated_at);
    `,
  },

  // ─── token_mint_events [guidance] ───────────────────────────────
  {
    name: "mint_events → token_mint_events [guidance]",
    csv: "mint_events.csv",
    source: "guidance_sqlite",
    requireCols: ["event_id", "contract", "minter", "timestamp"],
    stagingCols: [
      "event_id",
      "tx_hash",
      "contract",
      "token_id",
      "minter",
      "editions",
      "timestamp",
      "platform",
      "level",
      "creator_address",
    ],
    mergeSql: `
      INSERT INTO token_mint_events (
        token_contract, token_id, editions, minter_address,
        op_hash, block_level, minted_at, platform, objkt_event_id,
        source, imported_at
      )
      SELECT
        contract,
        token_id,
        COALESCE(NULLIF(editions, ''), '1')::integer,
        minter,
        tx_hash,
        NULLIF(level, '')::bigint,
        timestamp::timestamptz,
        NULLIF(platform, ''),
        NULLIF(event_id, ''),
        'guidance_sqlite',
        now()
      FROM intel_staging
      WHERE tx_hash IS NOT NULL AND tx_hash <> ''
        AND contract IS NOT NULL AND token_id IS NOT NULL
        AND timestamp IS NOT NULL AND timestamp <> ''
      ON CONFLICT (token_contract, token_id, op_hash) DO UPDATE SET
        editions       = GREATEST(token_mint_events.editions, EXCLUDED.editions),
        minter_address = EXCLUDED.minter_address,
        block_level    = COALESCE(EXCLUDED.block_level, token_mint_events.block_level),
        platform       = COALESCE(EXCLUDED.platform, token_mint_events.platform),
        objkt_event_id = COALESCE(EXCLUDED.objkt_event_id, token_mint_events.objkt_event_id),
        imported_at    = now();
    `,
  },

  // ─── token_sales [guidance] — deep history + richer cols ────────
  //
  // NOTE: the Guidance exporter emits `ophash = "synth:<guidance-id>"`
  // for any source row that lacks a real on-chain operation hash
  // (most 2021-2023 rows from `objkt_graphql` fall into this bucket).
  // Those synthetic op_hashes preserve the uniqueness invariant on
  // `(op_hash, contract, token_id, seller, buyer)` so we never lose
  // a row to ON CONFLICT.  A later TzKT reconciliation worker can
  // rewrite `synth:*` rows once the real ophash is known.
  {
    name: "sales → token_sales [guidance]",
    csv: "sales.csv",
    source: "guidance_sqlite",
    requireCols: [
      "ophash",
      "ophash_real",
      "token_contract",
      "seller_address",
      "buyer_address",
      "price_mutez",
    ],
    stagingCols: [
      "id",
      "timestamp",
      "token_contract",
      "token_id",
      "seller_address",
      "buyer_address",
      "price_mutez",
      "ophash",
      "ophash_real",
      "level",
      "marketplace",
      "marketplace_contract",
      "sale_type",
      "event_source",
      "is_primary",
      "currency",
    ],
    mergeSql: `
      INSERT INTO token_sales (
        token_contract, token_id, op_hash,
        seller_address, buyer_address, price_mutez,
        marketplace, objkt_event_id, is_primary,
        block_level, sold_at, source, imported_at
      )
      SELECT
        token_contract,
        token_id,
        ophash,
        NULLIF(seller_address, ''),
        buyer_address,
        COALESCE(NULLIF(price_mutez, ''), '0')::bigint,
        NULLIF(marketplace, ''),
        NULLIF(id, ''),
        COALESCE(NULLIF(LOWER(is_primary), ''), '0')::boolean,
        NULLIF(level, '')::bigint,
        timestamp::timestamptz,
        -- Suffix '_synth' on rows without a real ophash so a later
        -- reconciliation worker can find them quickly.  Append '_noseller'
        -- so we can also re-fetch seller from TzKT per-op.
        CASE WHEN COALESCE(NULLIF(ophash_real, ''), '0') = '1'
             THEN COALESCE(NULLIF(event_source, ''), 'guidance_sqlite')
             ELSE COALESCE(NULLIF(event_source, ''), 'guidance_sqlite') || '_synth'
        END
          || CASE WHEN seller_address IS NULL OR seller_address = '' THEN '_noseller' ELSE '' END,
        now()
      FROM intel_staging
      WHERE ophash IS NOT NULL AND ophash <> ''
        AND token_contract IS NOT NULL AND token_id IS NOT NULL
        AND buyer_address IS NOT NULL AND buyer_address <> ''
        AND timestamp IS NOT NULL AND timestamp <> ''
        AND (currency IS NULL OR currency = '' OR UPPER(currency) = 'XTZ')
      ON CONFLICT (op_hash, token_contract, token_id, (COALESCE(seller_address, '')), buyer_address)
        DO UPDATE SET
          price_mutez     = EXCLUDED.price_mutez,
          marketplace     = COALESCE(EXCLUDED.marketplace, token_sales.marketplace),
          objkt_event_id  = COALESCE(token_sales.objkt_event_id, EXCLUDED.objkt_event_id),
          is_primary      = EXCLUDED.is_primary OR token_sales.is_primary,
          block_level     = COALESCE(EXCLUDED.block_level, token_sales.block_level),
          sold_at         = EXCLUDED.sold_at,
          imported_at     = now();
    `,
    postSql: `
      UPDATE token_sales s
      SET price_usd = (s.price_mutez::numeric / 1000000.0) * q.price_usd
      FROM xtz_usd_daily q
      WHERE s.price_usd IS NULL
        AND DATE(s.sold_at AT TIME ZONE 'UTC') = q.day;
    `,
  },

  // ─── tokens → token_metadata [guidance] ─────────────────────────
  {
    name: "tokens → token_metadata (augment) [guidance]",
    csv: "tokens.csv",
    source: "guidance_sqlite",
    // Guidance-shape tokens.csv has these but not floor_price/last_sale_price.
    requireCols: ["contract", "token_id", "total_sales_count", "last_synced"],
    stagingCols: [
      "contract",
      "token_id",
      "name",
      "description",
      "creator_address",
      "metadata_uri",
      "thumbnail_uri",
      "display_uri",
      "artifact_uri",
      "supply",
      "total_sales_count",
      "total_sales_volume",
      "last_sale_at",
      "last_synced",
    ],
    mergeSql: `
      INSERT INTO token_metadata (
        token_contract, token_id, name, description,
        thumbnail, artifact_uri, display_uri,
        creator_address, supply, fetched_at, updated_at
      )
      SELECT
        contract,
        token_id,
        NULLIF(name, ''),
        NULLIF(description, ''),
        NULLIF(thumbnail_uri, ''),
        NULLIF(artifact_uri, ''),
        NULLIF(display_uri, ''),
        NULLIF(creator_address, ''),
        NULLIF(supply, '')::bigint,
        now(),
        now()
      FROM intel_staging
      WHERE contract IS NOT NULL AND token_id IS NOT NULL
      ON CONFLICT (token_contract, token_id) DO UPDATE SET
        name            = COALESCE(EXCLUDED.name, token_metadata.name),
        description     = COALESCE(EXCLUDED.description, token_metadata.description),
        thumbnail       = COALESCE(EXCLUDED.thumbnail, token_metadata.thumbnail),
        artifact_uri    = COALESCE(EXCLUDED.artifact_uri, token_metadata.artifact_uri),
        display_uri     = COALESCE(EXCLUDED.display_uri, token_metadata.display_uri),
        creator_address = COALESCE(EXCLUDED.creator_address, token_metadata.creator_address),
        supply          = COALESCE(EXCLUDED.supply, token_metadata.supply),
        updated_at      = now();
    `,
    postSql: `
      INSERT INTO token_market_summary (
        token_contract, token_id,
        last_sale_at, sale_count, total_volume_mutez, refreshed_at
      )
      SELECT
        contract,
        token_id,
        NULLIF(TRIM(last_sale_at), '')::timestamptz,
        COALESCE(NULLIF(total_sales_count, ''), '0')::integer,
        COALESCE(NULLIF(total_sales_volume, ''), '0')::bigint,
        now()
      FROM intel_staging
      WHERE contract IS NOT NULL AND token_id IS NOT NULL
      ON CONFLICT (token_contract, token_id) DO UPDATE SET
        last_sale_at        = COALESCE(EXCLUDED.last_sale_at,        token_market_summary.last_sale_at),
        sale_count          = GREATEST(EXCLUDED.sale_count,          token_market_summary.sale_count),
        total_volume_mutez  = GREATEST(EXCLUDED.total_volume_mutez,  token_market_summary.total_volume_mutez),
        refreshed_at        = now();
    `,
  },

  // ─── creators (guidance-only) → address_labels ─────────────────
  {
    name: "creators → address_labels (stamp creator names) [guidance]",
    csv: "creators.csv",
    source: "guidance_sqlite",
    requireCols: ["address", "score", "total_volume_mutez"],
    stagingCols: [
      "address",
      "name",
      "score",
      "total_sales",
      "total_volume_mutez",
      "avg_sale_mutez",
      "unique_buyers",
      "momentum_24h",
      "updated_at",
    ],
    mergeSql: `
      INSERT INTO address_labels (
        address, label, category, updated_at
      )
      SELECT
        address,
        NULLIF(name, ''),
        'creator',
        COALESCE(NULLIF(TRIM(updated_at), '')::timestamp, now())
      FROM intel_staging
      WHERE address IS NOT NULL AND address <> ''
        AND NULLIF(name, '') IS NOT NULL
      ON CONFLICT (address) DO UPDATE SET
        label      = COALESCE(address_labels.label, EXCLUDED.label),
        category   = COALESCE(address_labels.category, EXCLUDED.category),
        updated_at = GREATEST(address_labels.updated_at, EXCLUDED.updated_at);
    `,
  },
];

interface ImportStats {
  spec: string;
  rowsStaged: number;
  rowsInserted: number;
  durationMs: number;
}

/** Stream a CSV file and yield rows in batches. */
async function* batchedRows(
  file: string,
  header: string[],
  batchSize: number,
  dedupeBy?: (row: Row, header: string[]) => string | null
): AsyncGenerator<Row[]> {
  const stream = createReadStream(file, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const seen = dedupeBy ? new Set<string>() : null;
  let batch: Row[] = [];
  let isHeader = true;
  let headerCols: string[] = [];

  for await (const raw of rl) {
    if (!raw) continue;
    if (isHeader) {
      headerCols = parseCsvLine(raw).map((s) => (s ?? "").trim());
      // Validate that the expected columns are present.
      for (const c of header) {
        if (!headerCols.includes(c)) {
          throw new Error(
            `[intel-import] ${path.basename(
              file
            )}: missing expected column "${c}" (got: ${headerCols.join(",")})`
          );
        }
      }
      isHeader = false;
      continue;
    }
    const row = parseCsvLine(raw);
    if (seen && dedupeBy) {
      const key = dedupeBy(row, headerCols);
      if (key !== null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
    }
    // Re-order the row to match the requested header shape so the
    // staging table INSERTs don't depend on CSV column order.
    batch.push(header.map((c) => row[headerCols.indexOf(c)] ?? null));
    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}

async function runSpec(
  client: pg.PoolClient,
  dumpDir: string,
  spec: ImportSpec
): Promise<ImportStats> {
  const startedAt = Date.now();
  const csvPath = path.join(dumpDir, spec.csv);

  await client.query("BEGIN");
  try {
    // Staging is TEMP → automatically dropped on COMMIT / connection close.
    const colsDdl = spec.stagingCols.map((c) => `"${c}" text`).join(", ");
    await client.query(
      `DROP TABLE IF EXISTS intel_staging;
       CREATE TEMP TABLE intel_staging (${colsDdl}) ON COMMIT DROP;`
    );

    // Multi-row INSERT with ~32k bind-param ceiling → batch size = floor(32000 / cols) - safety.
    const maxBatch = Math.max(
      50,
      Math.floor(32000 / spec.stagingCols.length) - 50
    );
    let rowsStaged = 0;

    for await (const batch of batchedRows(
      csvPath,
      spec.stagingCols,
      maxBatch,
      spec.dedupeBy
    )) {
      const params: (string | null)[] = [];
      const placeholders = batch
        .map((row, ri) => {
          row.forEach((v) => params.push(v));
          const offs = ri * spec.stagingCols.length;
          return (
            "(" +
            spec.stagingCols.map((_, ci) => `$${offs + ci + 1}`).join(",") +
            ")"
          );
        })
        .join(",");
      const insertSql =
        `INSERT INTO intel_staging (${spec.stagingCols
          .map((c) => `"${c}"`)
          .join(",")}) VALUES ${placeholders}`;
      await client.query(insertSql, params);
      rowsStaged += batch.length;
      if (rowsStaged % (maxBatch * 10) === 0) {
        console.log(`  [${spec.name}] staged ${rowsStaged} rows…`);
      }
    }

    console.log(
      `  [${spec.name}] staged ${rowsStaged} rows → merging…`
    );

    const mergeRes = await client.query(spec.mergeSql);
    const rowsInserted = mergeRes.rowCount ?? 0;

    if (spec.postSql) {
      await client.query(spec.postSql);
    }

    await client.query("COMMIT");
    const durationMs = Date.now() - startedAt;
    return {
      spec: spec.name,
      rowsStaged,
      rowsInserted,
      durationMs,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dumpDir = args.find((a) => !a.startsWith("--"));
  if (!dumpDir) {
    console.error(
      "Usage: tsx scripts/import-intel-csv.ts <csv-dir> [--only=sales,mint_events]"
    );
    process.exit(1);
  }
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg
    ? new Set(
        onlyArg
          .slice("--only=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

  console.log(`[intel-import] dump directory: ${dumpDir}`);
  if (only) console.log(`[intel-import] filter: only ${[...only].join(", ")}`);

  // Apply the idempotent schema first to be defensive against
  // schema drift — CREATE TABLE IF NOT EXISTS cost is ~1ms.
  try {
    const client = await pool.connect();
    try {
      console.log(`[intel-import] applying inlined analytics phase-1 schema…`);
      await client.query(SCHEMA_SQL);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(`[intel-import] schema apply failed: ${(e as Error).message}`);
    process.exit(1);
  }

  const results: ImportStats[] = [];
  let hadError = false;

  // Peek every unique CSV filename just once and pick the spec whose
  // `requireCols` all appear in the header.  Guidance and Intel share
  // filenames (sales.csv, xtz_prices.csv, …) so we discriminate on
  // column shape, not file name.
  const csvNames = Array.from(new Set(SPECS.map((s) => s.csv)));
  const picked: ImportSpec[] = [];
  const fs = await import("node:fs/promises");
  for (const csvName of csvNames) {
    const short = csvName.replace(/\.csv$/, "");
    if (only && !only.has(short)) {
      console.log(`[intel-import] skipping ${csvName} (not in --only list)`);
      continue;
    }
    const csvPath = path.join(dumpDir, csvName);
    try {
      await fs.access(csvPath);
    } catch {
      console.warn(`[intel-import] ${csvName} missing — skipping`);
      continue;
    }
    const header = await readCsvHeader(csvPath);
    const candidates = SPECS.filter((s) => s.csv === csvName);
    const match = candidates.find((s) =>
      s.requireCols.every((c) => header.includes(c))
    );
    if (!match) {
      console.warn(
        `[intel-import] ${csvName} header [${header.join(
          ","
        )}] matches no known spec — skipping.`
      );
      continue;
    }
    console.log(
      `[intel-import] ${csvName}: matched "${match.name}" (source=${match.source})`
    );
    picked.push(match);
  }

  // xtz_usd_daily should land first — token_sales's postSql joins it
  // to stamp price_usd, so prices must be committed before sales.
  picked.sort((a, b) => {
    const priority = (s: ImportSpec) =>
      s.csv === "xtz_prices.csv" ? 0
      : s.csv === "address_labels.csv" ? 1
      : s.csv === "marketplace_contracts.csv" ? 2
      : s.csv === "creators.csv" ? 3
      : s.csv === "mint_events.csv" ? 4
      : s.csv === "tokens.csv" ? 5
      : s.csv === "sales.csv" ? 6
      : 99;
    return priority(a) - priority(b);
  });

  for (const spec of picked) {
    console.log(`[intel-import] → ${spec.name} (${spec.csv})`);
    const client = await pool.connect();
    try {
      const stats = await runSpec(client, dumpDir, spec);
      results.push(stats);
      console.log(
        `  ✓ ${stats.spec}: staged=${stats.rowsStaged} merged=${stats.rowsInserted} in ${(
          stats.durationMs / 1000
        ).toFixed(1)}s`
      );
    } catch (e) {
      hadError = true;
      console.error(`  ✗ ${spec.name} FAILED: ${(e as Error).message}`);
      console.error((e as Error).stack);
    } finally {
      client.release();
    }
  }

  console.log(`\n[intel-import] summary:`);
  for (const r of results) {
    console.log(
      `  ${r.spec}: staged=${r.rowsStaged} merged=${r.rowsInserted} (${(
        r.durationMs / 1000
      ).toFixed(1)}s)`
    );
  }

  await pool.end();
  process.exit(hadError ? 1 : 0);
}

main().catch((e) => {
  console.error("[intel-import] fatal:", e);
  process.exit(1);
});
