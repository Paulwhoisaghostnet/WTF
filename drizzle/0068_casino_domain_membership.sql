CREATE TABLE IF NOT EXISTS casino_membership_intents (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_ref varchar(128) NOT NULL UNIQUE,
  wallet_address varchar(40),
  contract_address varchar(40),
  treasury_address varchar(40) NOT NULL,
  fee_mutez bigint NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',
  op_hash varchar(80),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS casino_membership_intents_user_status_idx
  ON casino_membership_intents(user_id, status);

CREATE INDEX IF NOT EXISTS casino_membership_intents_ref_idx
  ON casino_membership_intents(purchase_ref);

CREATE TABLE IF NOT EXISTS casino_memberships (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address varchar(40) NOT NULL,
  purchase_ref varchar(128) NOT NULL,
  op_hash varchar(80) NOT NULL,
  contract_address varchar(40) NOT NULL,
  treasury_address varchar(40) NOT NULL,
  fee_mutez bigint NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS casino_memberships_user_status_idx
  ON casino_memberships(user_id, status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS casino_memberships_op_hash_idx
  ON casino_memberships(op_hash);

CREATE TABLE IF NOT EXISTS casino_wager_sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_key varchar(80) NOT NULL,
  mode varchar(24) NOT NULL DEFAULT 'single_player',
  wager_wtf_units numeric(40, 0) NOT NULL,
  house_take_bps integer NOT NULL DEFAULT 500,
  status varchar(24) NOT NULL DEFAULT 'planned',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS casino_wager_sessions_user_idx
  ON casino_wager_sessions(user_id, created_at);

CREATE INDEX IF NOT EXISTS casino_wager_sessions_game_status_idx
  ON casino_wager_sessions(game_key, status);

DO $$
BEGIN
  ALTER TABLE casino_membership_intents
    ADD CONSTRAINT casino_membership_intents_fee_positive
    CHECK (fee_mutez > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE casino_memberships
    ADD CONSTRAINT casino_memberships_fee_positive
    CHECK (fee_mutez > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE casino_wager_sessions
    ADD CONSTRAINT casino_wager_sessions_house_take_range
    CHECK (house_take_bps BETWEEN 0 AND 10000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
    'casino-app-pass',
    'WTF Casino App',
    'Unlocks the WTF Casino desktop app. A separate XTZ membership card is required for entry.',
    'casino',
    10000000000,
    1000,
    NULL,
    true,
    1000000,
    2,
    1,
    false,
    true,
    '{"kind":"casino-app-pass","surface":"casino","entitlement":"casino-app","opens":"/casino"}'::jsonb,
    1
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
  price_score_locked = EXCLUDED.price_score_locked,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
