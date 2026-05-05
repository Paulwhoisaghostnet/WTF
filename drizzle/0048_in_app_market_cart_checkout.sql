ALTER TABLE in_app_market_items
  ADD COLUMN IF NOT EXISTS price_exp integer NOT NULL DEFAULT 0;

UPDATE in_app_market_items
SET price_exp = CASE sku
  WHEN 'pet-food' THEN 100
  WHEN 'pet-medicine' THEN 250
  WHEN 'shoebox' THEN 500
  ELSE price_exp
END
WHERE sku IN ('pet-food', 'pet-medicine', 'shoebox')
  AND price_exp = 0;

UPDATE in_app_market_items
SET contract_listing_id = CASE sku
  WHEN 'pet-food' THEN 1
  WHEN 'pet-medicine' THEN 2
  WHEN 'shoebox' THEN 3
  ELSE contract_listing_id
END
WHERE sku IN ('pet-food', 'pet-medicine', 'shoebox');

CREATE TABLE IF NOT EXISTS in_app_market_payment_intents (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_ref varchar(128) NOT NULL UNIQUE,
  currency varchar(8) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',
  wallet_address varchar(40),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal_wtf_units numeric(40, 0) NOT NULL DEFAULT 0,
  subtotal_exp integer NOT NULL DEFAULT 0,
  estimated_fee_mutez integer NOT NULL DEFAULT 0,
  op_hash varchar(80),
  contract_address varchar(40),
  router_listing_id integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS in_app_market_intents_user_status_idx
  ON in_app_market_payment_intents (user_id, status);

CREATE INDEX IF NOT EXISTS in_app_market_intents_purchase_ref_idx
  ON in_app_market_payment_intents (purchase_ref);

ALTER TABLE in_app_market_purchases
  ADD COLUMN IF NOT EXISTS currency varchar(8) NOT NULL DEFAULT 'wtf',
  ADD COLUMN IF NOT EXISTS amount_exp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_ref varchar(128),
  ADD COLUMN IF NOT EXISTS payment_intent_id integer REFERENCES in_app_market_payment_intents(id) ON DELETE SET NULL;

ALTER TABLE in_app_market_purchases
  ALTER COLUMN wallet_address DROP NOT NULL,
  ALTER COLUMN op_hash DROP NOT NULL,
  ALTER COLUMN tzkt_transfer_id DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'in_app_market_purchases'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (tzkt_transfer_id)';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE in_app_market_purchases DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

DROP INDEX IF EXISTS in_app_market_purchases_tzkt_transfer_id_unique;
DROP INDEX IF EXISTS in_app_market_purchases_tzkt_transfer_id_key;

CREATE INDEX IF NOT EXISTS in_app_market_purchases_ref_idx
  ON in_app_market_purchases (purchase_ref);

CREATE UNIQUE INDEX IF NOT EXISTS in_app_market_purchases_tzkt_sku_idx
  ON in_app_market_purchases (tzkt_transfer_id, sku)
  WHERE tzkt_transfer_id IS NOT NULL;
