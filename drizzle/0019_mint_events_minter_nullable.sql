-- Relax minter_address on token_mint_events.
--
-- Rationale: the Guidance archive (raw_objkt_sales + objkt_graphql
-- historical scrape) holds ~83k mint events from 2021-2023 that were
-- recorded without a resolved minter address.  Dropping those rows
-- would cost us 28% of our historical mint depth.  Keeping them with
-- NULL minter is strictly better — the `token_mint_events` backfill
-- worker (handleTokenMintEnrich) fetches the mint operation from
-- TzKT and fills `minter_address` in during reconciliation.
--
-- The ON CONFLICT merge in scripts/import-intel-csv.ts was also
-- updated to COALESCE the minter so an already-enriched row isn't
-- clobbered with NULL by a re-run.
--
-- Idempotent — re-running this migration is a no-op if the column
-- is already nullable.

ALTER TABLE "token_mint_events"
  ALTER COLUMN "minter_address" DROP NOT NULL;
