-- Conflict-heavy gap seeding consumes sequence values even when no row is inserted.
-- Preserve every existing ID and the sequence position while expanding past int4.
ALTER TABLE backfill_manifest ALTER COLUMN id TYPE bigint;
ALTER SEQUENCE backfill_manifest_id_seq AS bigint NO MAXVALUE;
