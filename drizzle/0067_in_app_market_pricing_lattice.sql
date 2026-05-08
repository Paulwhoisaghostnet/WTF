ALTER TABLE in_app_market_items
  ADD COLUMN IF NOT EXISTS rarity_tier integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_score integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS price_wtf_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_score_locked boolean NOT NULL DEFAULT false;

UPDATE in_app_market_items
SET
  rarity_tier = CASE
    WHEN sku = 'arcade-play-ticket' THEN 1
    WHEN sku = 'arcade-play-card' THEN 1
    WHEN price_wtf_units < 10000000000 THEN 1
    WHEN price_wtf_units < 50000000000 THEN 2
    WHEN price_wtf_units < 200000000000 THEN 3
    WHEN price_wtf_units < 1000000000000 THEN 4
    WHEN price_wtf_units < 5000000000000 THEN 5
    ELSE 6
  END,
  price_score = CASE
    WHEN sku = 'arcade-play-card' THEN 1
    WHEN sku = 'arcade-play-ticket' THEN 2
    WHEN price_wtf_units < 10000000000 THEN 5
    WHEN price_wtf_units < 50000000000 THEN 3
    WHEN price_wtf_units < 200000000000 THEN 3
    WHEN price_wtf_units < 1000000000000 THEN 3
    WHEN price_wtf_units < 5000000000000 THEN 3
    ELSE 4
  END
WHERE rarity_tier = 1
  AND price_score = 5;

INSERT INTO in_app_market_items
  (
    sku,
    name,
    description,
    category,
    price_wtf_units,
    price_exp,
    contract_listing_id,
    active,
    stock_quantity,
    rarity_tier,
    price_score,
    price_wtf_locked,
    price_score_locked,
    metadata,
    sort_order
  )
VALUES
  (
    'arcade-play-card',
    'WTF Arcade Play Card',
    'The baseline card for holding WTF Arcade credits.',
    'arcade',
    100000000,
    10,
    NULL,
    true,
    1000000,
    1,
    1,
    true,
    true,
    '{"kind":"arcade-play-card","surface":"arcade","loads":"arcade-play-ticket"}'::jsonb,
    1
  ),
  (
    'arcade-play-ticket',
    'WTF Arcade Credit',
    'One play credit loaded to a WTF Arcade Play Card for public Arcade machines.',
    'arcade',
    1000000000,
    0,
    NULL,
    true,
    1000000,
    1,
    2,
    true,
    true,
    '{"kind":"arcade-play-ticket","consumable":true,"surface":"arcade","loadsOnto":"arcade-play-card","contract":"in-app-market-cart-router"}'::jsonb,
    2
  )
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_wtf_units = EXCLUDED.price_wtf_units,
  price_exp = EXCLUDED.price_exp,
  contract_listing_id = EXCLUDED.contract_listing_id,
  active = EXCLUDED.active,
  stock_quantity = EXCLUDED.stock_quantity,
  rarity_tier = EXCLUDED.rarity_tier,
  price_score = EXCLUDED.price_score,
  price_wtf_locked = EXCLUDED.price_wtf_locked,
  price_score_locked = EXCLUDED.price_score_locked,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

UPDATE in_app_market_items
SET
  name = 'Desktop Mop',
  price_wtf_units = 10000000000,
  rarity_tier = 2,
  price_score = 1,
  price_wtf_locked = true,
  price_score_locked = true,
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"tierAnchor":"tier-2-floor"}'::jsonb,
  updated_at = now()
WHERE sku = 'desktop-mop';

UPDATE in_app_market_items
SET
  name = 'Desktop Vacuum',
  price_wtf_units = 70000000000,
  rarity_tier = 3,
  price_score = 2,
  price_wtf_locked = false,
  price_score_locked = true,
  metadata = (COALESCE(metadata, '{}'::jsonb) - 'tierAnchor') || '{"pricingRole":"rare-cleanup-tool"}'::jsonb,
  updated_at = now()
WHERE sku = 'desktop-vacuum';

DO $$
BEGIN
  ALTER TABLE in_app_market_items
    ADD CONSTRAINT in_app_market_items_rarity_tier_range
    CHECK (rarity_tier BETWEEN 1 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE in_app_market_items
    ADD CONSTRAINT in_app_market_items_price_score_range
    CHECK (price_score BETWEEN 1 AND 10);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE in_app_market_items
    ADD CONSTRAINT in_app_market_items_system_price_whole_wtf
    CHECK ((metadata->>'source') = 'trusted_creator' OR MOD(price_wtf_units, 100000000) = 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS in_app_market_sales (
  id serial PRIMARY KEY,
  name varchar(120) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  discount_percent integer NOT NULL DEFAULT 0,
  category varchar(40),
  sku varchar(80),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT in_app_market_sales_discount_range CHECK (discount_percent BETWEEN 0 AND 99),
  CONSTRAINT in_app_market_sales_has_target CHECK (category IS NOT NULL OR sku IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS in_app_market_sales_active_idx
  ON in_app_market_sales (active, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS in_app_market_sales_category_idx
  ON in_app_market_sales (category);

CREATE INDEX IF NOT EXISTS in_app_market_sales_sku_idx
  ON in_app_market_sales (sku);
