-- Phase 2 acceptance: token_sales must have zero duplicate op-key rows before
-- the unique index is enforced.  Older production imports had no live
-- uniq_sales_ophash index, so repeated backfills wrote duplicate sales rows.
--
-- Canonical key:
--   (op_hash, token_contract, token_id, coalesce(seller_address, ''), buyer_address)
--
-- Keep the most complete/recent row in each duplicate group, merge useful
-- nullable metadata into that keeper, delete the losers, then recreate the
-- expression unique index that nullable seller rows require.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        op_hash,
        token_contract,
        token_id,
        coalesce(seller_address, ''),
        buyer_address
      ORDER BY
        (objkt_event_id IS NOT NULL) DESC,
        (marketplace IS NOT NULL) DESC,
        (block_level IS NOT NULL) DESC,
        (price_usd IS NOT NULL) DESC,
        imported_at DESC,
        id DESC
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY
        op_hash,
        token_contract,
        token_id,
        coalesce(seller_address, ''),
        buyer_address
      ORDER BY
        (objkt_event_id IS NOT NULL) DESC,
        (marketplace IS NOT NULL) DESC,
        (block_level IS NOT NULL) DESC,
        (price_usd IS NOT NULL) DESC,
        imported_at DESC,
        id DESC
    ) AS keep_id,
    price_mutez,
    price_usd,
    royalties_mutez,
    platform_fee_mutez,
    marketplace,
    objkt_event_id,
    is_primary,
    editions_sold,
    block_level,
    sold_at,
    imported_at
  FROM token_sales
),
merged AS (
  SELECT
    keep_id,
    max(price_mutez) AS price_mutez,
    max(price_usd) AS price_usd,
    max(coalesce(royalties_mutez, 0)) AS royalties_mutez,
    max(coalesce(platform_fee_mutez, 0)) AS platform_fee_mutez,
    (array_remove(array_agg(marketplace ORDER BY imported_at DESC), NULL::varchar))[1] AS marketplace,
    (array_remove(array_agg(objkt_event_id ORDER BY imported_at DESC), NULL::text))[1] AS objkt_event_id,
    bool_or(is_primary) AS is_primary,
    max(editions_sold) AS editions_sold,
    max(block_level) AS block_level,
    min(sold_at) AS sold_at,
    max(imported_at) AS imported_at
  FROM ranked
  GROUP BY keep_id
),
updated AS (
  UPDATE token_sales AS keep
     SET price_mutez        = greatest(keep.price_mutez, merged.price_mutez),
         price_usd          = coalesce(keep.price_usd, merged.price_usd),
         royalties_mutez    = greatest(coalesce(keep.royalties_mutez, 0), merged.royalties_mutez),
         platform_fee_mutez = greatest(coalesce(keep.platform_fee_mutez, 0), merged.platform_fee_mutez),
         marketplace        = coalesce(keep.marketplace, merged.marketplace),
         objkt_event_id     = coalesce(keep.objkt_event_id, merged.objkt_event_id),
         is_primary         = keep.is_primary OR merged.is_primary,
         editions_sold      = greatest(keep.editions_sold, merged.editions_sold),
         block_level        = coalesce(keep.block_level, merged.block_level),
         sold_at            = least(keep.sold_at, merged.sold_at),
         imported_at        = greatest(keep.imported_at, merged.imported_at)
    FROM merged
   WHERE keep.id = merged.keep_id
  RETURNING keep.id
)
DELETE FROM token_sales AS loser
 USING ranked
 WHERE loser.id = ranked.id
   AND ranked.rn > 1;

DROP INDEX IF EXISTS uniq_sales_ophash;

CREATE UNIQUE INDEX uniq_sales_ophash
  ON token_sales (
    op_hash,
    token_contract,
    token_id,
    coalesce(seller_address, ''),
    buyer_address
  );

ANALYZE token_sales;

COMMIT;
