-- Widen `source` + `marketplace` + `platform` on analytics tables.
--
-- Rationale
-- ----------
--
-- 1. `source` column (varchar(32) → varchar(64)):
--    The Guidance importer tags its source strings by concatenating
--    the upstream event_source (e.g. `objkt_archive_2026_02_26`,
--    24 chars) with optional `_synth` and `_noseller` suffixes so
--    reconciliation workers can find rows with missing data.  The
--    longest combination reaches 39 chars
--    (`objkt_archive_2026_02_26_synth_noseller`), blowing past the
--    varchar(32) limit and failing the merge.
--
-- 2. `marketplace` column (varchar(32) → varchar(64)):
--    Guidance records human-readable marketplace names like
--    `8bidou 24x24 monochrome marketplace` (35 chars) which overflow
--    the old varchar(32) cap and break the token_sales merge with
--    the same `value too long for type character varying(32)` error.
--
-- 3. `platform` column on token_mint_events (varchar(32) → varchar(64)):
--    Widened for parity with `marketplace` — the same class of
--    long human-readable values can appear here.
--
-- Applied to every analytics table that carries a `source`,
-- `marketplace`, or `platform` column. Forward-compatible with
-- further reconciliation suffixes (`_reconciled`, `_enriched`, …)
-- and any long platform names we haven't seen yet.
--
-- Idempotent — re-running leaves widened columns widened.

-- ── source column widening ──────────────────────────────────────────
ALTER TABLE "token_sales"
  ALTER COLUMN "source" TYPE varchar(64);

ALTER TABLE "token_mint_events"
  ALTER COLUMN "source" TYPE varchar(64);

ALTER TABLE "token_listings"
  ALTER COLUMN "source" TYPE varchar(64);

ALTER TABLE "xtz_usd_daily"
  ALTER COLUMN "source" TYPE varchar(64);

ALTER TABLE "acquisition_lots"
  ALTER COLUMN "source" TYPE varchar(64);

-- ── marketplace column widening ─────────────────────────────────────
ALTER TABLE "token_sales"
  ALTER COLUMN "marketplace" TYPE varchar(64);

ALTER TABLE "token_listings"
  ALTER COLUMN "marketplace" TYPE varchar(64);

ALTER TABLE "acquisition_lots"
  ALTER COLUMN "marketplace" TYPE varchar(64);

-- ── platform column widening ────────────────────────────────────────
ALTER TABLE "token_mint_events"
  ALTER COLUMN "platform" TYPE varchar(64);
