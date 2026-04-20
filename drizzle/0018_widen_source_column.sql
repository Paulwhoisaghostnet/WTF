-- Widen `source` on analytics tables.
--
-- Rationale: the Guidance importer tags its source strings by
-- concatenating the upstream event_source (e.g.
-- `objkt_archive_2026_02_26`, 24 chars) with optional `_synth` and
-- `_noseller` suffixes so reconciliation workers can find rows with
-- missing data.  The longest combination reaches 39 chars
-- (`objkt_archive_2026_02_26_synth_noseller`), blowing past the
-- varchar(32) limit and failing the merge.
--
-- Widen to varchar(64) across every analytics table that carries a
-- `source` column.  Forward-compatible with further reconciliation
-- suffixes (`_reconciled`, `_enriched`, …).
--
-- Idempotent — re-running leaves widened columns widened.

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
