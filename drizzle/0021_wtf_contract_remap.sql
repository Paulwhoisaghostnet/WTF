-- 0021_wtf_contract_remap.sql
--
-- Fix an ingest bug in server/lib/portfolio-sync.ts: for every
-- wallet we ran a secondary /tokens/balances?contract=WTF call and
-- upserted the result into wallet_holdings with the string literal
-- "WTF" as `token_contract` instead of the real FA2 contract
-- address (KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD).  WTF is a real
-- Tezos FA2 token — not a synthetic platform symbol — and
-- downstream analytics (portfolio-analytics CTE, backfill seeders,
-- sales reconciliation) all key off the real KT1 contract.
--
-- This migration:
--   1. Remaps every affected row in wallet_holdings to the real
--      contract, merging into any already-correct row by summing
--      balances / picking the earliest first_acquired_at.
--   2. Does the same for wallet_events (events that were stamped
--      with the synthetic contract because holdings-derive used
--      the synthetic holding row as its anchor).
--   3. Remaps token_sales and token_mint_events similarly
--      (defensive — likely 0 rows, but safe under ON CONFLICT).
--   4. Deletes the synthetic token_metadata row and keeps the real
--      one.
--
-- Idempotent: re-runs are no-ops because the WHERE clauses only
-- match rows still using the synthetic 'WTF' string.

BEGIN;

-- Constants (inline because psql variables aren't available in
-- the sequenced-migration path).  Single source of truth lives in
-- shared/types.ts → WTF_TOKEN.contract.
--   contract: KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD
--   token_id: 0

-- 1. wallet_holdings — merge by summing balance if both rows exist
--    for the same (wallet, synthetic) ↔ (wallet, real) pair.  If
--    only the synthetic row exists, just rewrite the key.
WITH synth AS (
  SELECT id, user_id, wallet_address, balance::numeric AS bal,
         first_acquired_at, last_activity_at, derived_at,
         tzkt_first_time, tzkt_last_time, is_creator, created_at
    FROM wallet_holdings
   WHERE token_contract = 'WTF'
     AND token_id       = '0'
),
real_existing AS (
  SELECT h.id, h.wallet_address, h.balance::numeric AS bal
    FROM wallet_holdings h
    JOIN synth s ON s.wallet_address = h.wallet_address
   WHERE h.token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
     AND h.token_id       = '0'
),
-- a. Where BOTH exist: prefer the real row, drop the synthetic.
merged_update AS (
  UPDATE wallet_holdings h
     SET balance          = GREATEST(s.bal, h.balance::numeric)::text,
         first_acquired_at = LEAST(
                               COALESCE(s.first_acquired_at, h.first_acquired_at),
                               COALESCE(h.first_acquired_at, s.first_acquired_at)
                             ),
         last_activity_at  = GREATEST(
                               COALESCE(s.last_activity_at, h.last_activity_at),
                               COALESCE(h.last_activity_at, s.last_activity_at)
                             ),
         derived_at        = GREATEST(
                               COALESCE(s.derived_at, h.derived_at),
                               COALESCE(h.derived_at, s.derived_at)
                             ),
         tzkt_first_time   = LEAST(
                               COALESCE(s.tzkt_first_time, h.tzkt_first_time),
                               COALESCE(h.tzkt_first_time, s.tzkt_first_time)
                             ),
         tzkt_last_time    = GREATEST(
                               COALESCE(s.tzkt_last_time, h.tzkt_last_time),
                               COALESCE(h.tzkt_last_time, s.tzkt_last_time)
                             ),
         is_creator        = h.is_creator OR s.is_creator
    FROM synth s
   WHERE h.wallet_address = s.wallet_address
     AND h.token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
     AND h.token_id       = '0'
  RETURNING s.id AS synth_id
),
deleted_merged AS (
  DELETE FROM wallet_holdings
   WHERE id IN (SELECT synth_id FROM merged_update)
  RETURNING id
)
-- b. Orphan synthetic rows (no real twin): just rekey.
UPDATE wallet_holdings
   SET token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
 WHERE token_contract = 'WTF'
   AND token_id       = '0'
   AND id NOT IN (SELECT id FROM deleted_merged);

-- 2. wallet_events — remap any events stamped with the synthetic
--    contract.  On conflict with a real row (same wallet, op_hash,
--    token, timestamp) drop the synthetic to preserve the unique
--    index.
WITH candidates AS (
  SELECT id, wallet_address, op_hash, event_type, timestamp
    FROM wallet_events
   WHERE token_contract = 'WTF'
     AND token_id       = '0'
),
real_dupes AS (
  SELECT c.id AS synth_id
    FROM candidates c
    JOIN wallet_events r
      ON r.wallet_address = c.wallet_address
     AND r.op_hash        = c.op_hash
     AND r.event_type     = c.event_type
     AND r.timestamp      = c.timestamp
     AND r.token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
     AND r.token_id       = '0'
),
drop_synth AS (
  DELETE FROM wallet_events
   WHERE id IN (SELECT synth_id FROM real_dupes)
  RETURNING id
)
UPDATE wallet_events
   SET token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
 WHERE token_contract = 'WTF'
   AND token_id       = '0'
   AND id NOT IN (SELECT id FROM drop_synth);

-- 3. token_sales — defensive remap.  Use the (token_contract,
--    token_id, op_hash, buyer_address) quasi-uniqueness to avoid
--    collisions; on conflict we drop the synthetic row.
WITH candidates AS (
  SELECT id, token_id, op_hash, buyer_address
    FROM token_sales
   WHERE token_contract = 'WTF'
),
real_dupes AS (
  SELECT c.id AS synth_id
    FROM candidates c
    JOIN token_sales r
      ON r.token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
     AND r.token_id       = c.token_id
     AND r.op_hash        = c.op_hash
     AND r.buyer_address  = c.buyer_address
),
drop_synth AS (
  DELETE FROM token_sales
   WHERE id IN (SELECT synth_id FROM real_dupes)
  RETURNING id
)
UPDATE token_sales
   SET token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
 WHERE token_contract = 'WTF'
   AND id NOT IN (SELECT id FROM drop_synth);

-- 4. token_mint_events — same remap shape, keyed on
--    (contract, token_id, op_hash) which is the real unique index.
WITH candidates AS (
  SELECT id, token_id, op_hash
    FROM token_mint_events
   WHERE token_contract = 'WTF'
),
real_dupes AS (
  SELECT c.id AS synth_id
    FROM candidates c
    JOIN token_mint_events r
      ON r.token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
     AND r.token_id       = c.token_id
     AND r.op_hash        = c.op_hash
),
drop_synth AS (
  DELETE FROM token_mint_events
   WHERE id IN (SELECT synth_id FROM real_dupes)
  RETURNING id
)
UPDATE token_mint_events
   SET token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
 WHERE token_contract = 'WTF'
   AND id NOT IN (SELECT id FROM drop_synth);

-- 5. token_metadata — drop the synthetic row if a real row exists,
--    else rekey.  (Real row is created by portfolio-sync with the
--    correct KT1 address.)
DELETE FROM token_metadata
 WHERE token_contract = 'WTF'
   AND token_id       = '0'
   AND EXISTS (
     SELECT 1 FROM token_metadata m
      WHERE m.token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
        AND m.token_id       = '0'
   );

UPDATE token_metadata
   SET token_contract = 'KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD'
 WHERE token_contract = 'WTF'
   AND token_id       = '0';

COMMIT;
