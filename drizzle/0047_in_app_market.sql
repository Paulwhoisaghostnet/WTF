CREATE TABLE IF NOT EXISTS in_app_market_items (
  id serial PRIMARY KEY,
  sku varchar(80) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  description text,
  category varchar(40) NOT NULL DEFAULT 'desktop_pet',
  price_wtf_units numeric(40, 0) NOT NULL,
  contract_address varchar(40),
  contract_listing_id integer,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS in_app_market_items_category_idx
  ON in_app_market_items (category, active);

CREATE UNIQUE INDEX IF NOT EXISTS in_app_market_items_contract_listing_idx
  ON in_app_market_items (contract_address, contract_listing_id);

CREATE TABLE IF NOT EXISTS in_app_market_purchases (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  wallet_address varchar(40) NOT NULL,
  sku varchar(80) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  amount_wtf_units numeric(40, 0) NOT NULL,
  op_hash varchar(80) NOT NULL,
  tzkt_transfer_id bigint NOT NULL UNIQUE,
  contract_address varchar(40),
  contract_listing_id integer,
  status varchar(24) NOT NULL DEFAULT 'confirmed',
  observed_at timestamp with time zone NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS in_app_market_purchases_user_idx
  ON in_app_market_purchases (user_id, created_at);

CREATE INDEX IF NOT EXISTS in_app_market_purchases_wallet_idx
  ON in_app_market_purchases (wallet_address);

CREATE INDEX IF NOT EXISTS in_app_market_purchases_op_hash_idx
  ON in_app_market_purchases (op_hash);

CREATE TABLE IF NOT EXISTS in_app_inventory_items (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku varchar(80) NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_purchase_id integer REFERENCES in_app_market_purchases(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS in_app_inventory_user_sku_idx
  ON in_app_inventory_items (user_id, sku);

CREATE INDEX IF NOT EXISTS in_app_inventory_user_idx
  ON in_app_inventory_items (user_id);

CREATE TABLE IF NOT EXISTS in_app_market_sync_state (
  key varchar(80) PRIMARY KEY,
  last_transfer_id bigint NOT NULL DEFAULT 0,
  last_status varchar(24),
  last_error text,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO in_app_market_items
  (sku, name, description, category, price_wtf_units, contract_listing_id, active, metadata, sort_order)
VALUES
  (
    'pet-food',
    'Pet Food',
    'A desktop pet meal that restores hunger when dropped onto the desktop.',
    'desktop_pet',
    1000000000,
    1,
    true,
    '{"kind":"food","icon":"apple"}'::jsonb,
    10
  ),
  (
    'pet-medicine',
    'Pet Medicine',
    'A care item for lowering sickness risk and treating sick desktop pets.',
    'desktop_pet',
    2500000000,
    2,
    true,
    '{"kind":"medicine","icon":"pill"}'::jsonb,
    20
  ),
  (
    'shoebox',
    'Shoebox',
    'A small cozy bed cosmetic for desktop pet naps.',
    'desktop_pet',
    5000000000,
    3,
    true,
    '{"kind":"pillow","icon":"shoebox"}'::jsonb,
    30
  )
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_wtf_units = EXCLUDED.price_wtf_units,
  contract_listing_id = EXCLUDED.contract_listing_id,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
