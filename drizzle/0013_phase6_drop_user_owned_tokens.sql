-- Phase 6: retire `user_owned_tokens` — backfill cockpit tables, mirror
-- trade-board flags into `collection_items`, then drop legacy table.

-- 1) token_metadata from legacy denormalized rows
INSERT INTO token_metadata (
  token_contract, token_id, name, symbol, thumbnail, display_uri, artifact_uri,
  mime_type, creators, tags, formats, attributes, raw, fetched_at, updated_at
)
SELECT DISTINCT ON (token_contract, token_id)
  token_contract,
  token_id,
  token_name,
  token_symbol,
  token_thumbnail,
  NULLIF(metadata ->> 'displayUri', ''),
  NULLIF(metadata ->> 'artifactUri', ''),
  NULLIF(metadata ->> 'mimeType', ''),
  metadata -> 'creators',
  metadata -> 'tags',
  metadata -> 'formats',
  metadata -> 'attributes',
  COALESCE(metadata, '{}'::jsonb),
  NOW(),
  NOW()
FROM user_owned_tokens
WHERE token_contract IS NOT NULL AND token_id IS NOT NULL
ORDER BY token_contract, token_id, id DESC
ON CONFLICT (token_contract, token_id) DO UPDATE SET
  name       = COALESCE(EXCLUDED.name, token_metadata.name),
  symbol     = COALESCE(EXCLUDED.symbol, token_metadata.symbol),
  thumbnail  = COALESCE(EXCLUDED.thumbnail, token_metadata.thumbnail),
  raw        = COALESCE(EXCLUDED.raw, token_metadata.raw),
  updated_at = NOW();

-- 2) wallet_holdings merge (TzKT snapshot + event-derived rows coexist)
INSERT INTO wallet_holdings (
  user_id, wallet_address, token_contract, token_id, balance,
  first_acquired_at, last_activity_at, derived_at, is_creator
)
SELECT
  user_id,
  wallet_address,
  token_contract,
  token_id,
  balance,
  last_seen_at,
  last_seen_at,
  NOW(),
  FALSE
FROM user_owned_tokens
ON CONFLICT (wallet_address, token_contract, token_id) DO UPDATE SET
  balance = GREATEST(
    wallet_holdings.balance::numeric,
    EXCLUDED.balance::numeric
  )::text,
  user_id = EXCLUDED.user_id;

-- 3) trade-board collections for users still missing one
INSERT INTO collections (user_id, type, title, description, slug, is_public)
SELECT DISTINCT u.user_id, 'trade_board_listing', 'Trade Board',
  'Tokens this user has listed on the WTF trade board.',
  'trade-board', TRUE
FROM user_owned_tokens u
WHERE u.on_trade_board = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM collections c
    WHERE c.user_id = u.user_id
      AND c.type = 'trade_board_listing'
      AND c.slug = 'trade-board'
  );

-- 4) collection_items from legacy booleans
INSERT INTO collection_items (collection_id, token_contract, token_id, quantity, position)
SELECT
  c.id,
  u.token_contract,
  u.token_id,
  GREATEST(1, COALESCE(NULLIF(u.trade_board_quantity, 0), 1)),
  0
FROM user_owned_tokens u
JOIN collections c
  ON c.user_id = u.user_id
 AND c.type = 'trade_board_listing'
 AND c.slug = 'trade-board'
WHERE u.on_trade_board = TRUE
ON CONFLICT (collection_id, token_contract, token_id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- 5) drop legacy table + indexes
DROP TABLE IF EXISTS user_owned_tokens CASCADE;
