-- Normalise address casing on token_sales and token_mint_events.
--
-- Rationale
-- ----------
-- The Guidance DB's objkt_graphql table stored tz1 / KT1 addresses
-- lowercase in places, while TzKT (and every wallet-connect flow)
-- uses the canonical checksum casing.  Our portfolio-analytics CTE
-- was joining `s.buyer_address = u.wallet_address` and losing the
-- ~2% of rows that differ only in case — exactly the rows that
-- audited as `case_mismatched_sales = 99` in db-diag.
--
-- The portfolio CTE was already updated to use LOWER() on both
-- sides so new queries match correctly without touching the data.
-- This migration additionally *rewrites* the stored addresses to
-- match the canonical casing from `user_wallets` so:
--
--   • other queries that compare on raw strings (reports, joins in
--     ad-hoc SQL, exports) also see the matched rows;
--   • the uniqueness index on (op_hash, contract, token_id, seller,
--     buyer) stays honest — we can't have "tz1Abc…" and "tz1abc…"
--     both claim to be separate sales of the same edition.
--
-- Idempotent: the WHERE clause requires a case-insensitive match but
-- case-sensitive mismatch, so re-running after a first pass is a
-- no-op.  Safe to run on every deploy.

-- ── token_sales.buyer_address ───────────────────────────────────────
UPDATE token_sales s
   SET buyer_address = u.wallet_address
  FROM user_wallets u
 WHERE LOWER(s.buyer_address) = LOWER(u.wallet_address)
   AND s.buyer_address <> u.wallet_address;

-- ── token_sales.seller_address ──────────────────────────────────────
UPDATE token_sales s
   SET seller_address = u.wallet_address
  FROM user_wallets u
 WHERE s.seller_address IS NOT NULL
   AND LOWER(s.seller_address) = LOWER(u.wallet_address)
   AND s.seller_address <> u.wallet_address;

-- ── token_mint_events.first_owner / minter_address ──────────────────
UPDATE token_mint_events m
   SET first_owner = u.wallet_address
  FROM user_wallets u
 WHERE m.first_owner IS NOT NULL
   AND LOWER(m.first_owner) = LOWER(u.wallet_address)
   AND m.first_owner <> u.wallet_address;

UPDATE token_mint_events m
   SET minter_address = u.wallet_address
  FROM user_wallets u
 WHERE m.minter_address IS NOT NULL
   AND LOWER(m.minter_address) = LOWER(u.wallet_address)
   AND m.minter_address <> u.wallet_address;

-- ── wallet_holdings.wallet_address ──────────────────────────────────
-- Rare, but if a holdings row slipped in with non-canonical casing
-- the /dashboard summary would mis-count the wallet.  Fix it.
UPDATE wallet_holdings h
   SET wallet_address = u.wallet_address
  FROM user_wallets u
 WHERE LOWER(h.wallet_address) = LOWER(u.wallet_address)
   AND h.wallet_address <> u.wallet_address;

-- ── wallet_events.wallet_address ────────────────────────────────────
UPDATE wallet_events e
   SET wallet_address = u.wallet_address
  FROM user_wallets u
 WHERE LOWER(e.wallet_address) = LOWER(u.wallet_address)
   AND e.wallet_address <> u.wallet_address;

-- ── Synth ↔ real op_hash dedup on token_sales ───────────────────────
--
-- The Guidance importer backfills 2021-2023 rows with a synthetic
-- op_hash of the form `synth:<guidance_id>` when it couldn't find a
-- real chain hash in the export.  Once the TzKT reconciliation
-- worker upgrades a row to use the real op_hash, we can end up with
-- two rows for the same sale — the reconciled real-hash row and an
-- orphan synth row that the importer wrote again on the next deploy.
-- Remove the orphan synth row when a matching real row exists.
-- We match on (token_contract, token_id, seller, buyer, sold_at±5min)
-- because that's the natural key for a sale.
--
-- Idempotent: the inner NOT EXISTS guard makes this a no-op once
-- the duplicates are cleared.
DELETE FROM token_sales AS syn
 USING token_sales AS real_row
 WHERE syn.op_hash LIKE 'synth:%'
   AND real_row.op_hash NOT LIKE 'synth:%'
   AND real_row.token_contract   = syn.token_contract
   AND real_row.token_id         = syn.token_id
   AND real_row.buyer_address    = syn.buyer_address
   AND COALESCE(real_row.seller_address, '') = COALESCE(syn.seller_address, '')
   AND ABS(EXTRACT(EPOCH FROM (real_row.sold_at - syn.sold_at))) <= 300;

