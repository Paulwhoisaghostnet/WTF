CREATE TABLE IF NOT EXISTS club_dues_contracts (
  id serial PRIMARY KEY,
  slug varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  description text,
  template_version varchar(80) NOT NULL DEFAULT 'wtf-club-dues-v1',
  network varchar(32) NOT NULL DEFAULT 'shadownet',
  status varchar(24) NOT NULL DEFAULT 'draft',
  contract_address varchar(40),
  manager_wallet_id varchar(80) NOT NULL DEFAULT 'club-dues-manager',
  treasury_address varchar(40) NOT NULL,
  admin_address varchar(40) NOT NULL,
  monthly_dues_mutez bigint NOT NULL,
  month_seconds integer NOT NULL DEFAULT 2592000,
  utility_units_per_month numeric(40, 0) NOT NULL DEFAULT 1,
  grace_period_days integer NOT NULL DEFAULT 7,
  arrears_warning_days integer NOT NULL DEFAULT 3,
  membership_symbol varchar(24) NOT NULL DEFAULT 'DUES',
  metadata_uri text,
  storage_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  compile_artifact jsonb NOT NULL DEFAULT '{}'::jsonb,
  deployed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  deploy_op_hash varchar(80),
  deployed_at timestamptz,
  last_arrears_sweep_at timestamptz,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS club_dues_contracts_slug_idx
  ON club_dues_contracts(slug);

CREATE INDEX IF NOT EXISTS club_dues_contracts_network_status_idx
  ON club_dues_contracts(network, status);

CREATE INDEX IF NOT EXISTS club_dues_contracts_address_idx
  ON club_dues_contracts(contract_address);

CREATE TABLE IF NOT EXISTS club_dues_deployment_runs (
  id serial PRIMARY KEY,
  contract_id integer NOT NULL REFERENCES club_dues_contracts(id) ON DELETE CASCADE,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  network varchar(32) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'queued',
  wallet_id varchar(80) NOT NULL,
  signer_request_id varchar(128),
  op_hash varchar(80),
  contract_address varchar(40),
  compile_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS club_dues_deployment_runs_contract_idx
  ON club_dues_deployment_runs(contract_id, created_at);

CREATE INDEX IF NOT EXISTS club_dues_deployment_runs_status_idx
  ON club_dues_deployment_runs(status);

CREATE TABLE IF NOT EXISTS club_dues_payment_intents (
  id serial PRIMARY KEY,
  contract_id integer NOT NULL REFERENCES club_dues_contracts(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_ref varchar(128) NOT NULL,
  wallet_address varchar(40),
  months integer NOT NULL,
  amount_mutez bigint NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',
  op_hash varchar(80),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS club_dues_payment_intents_ref_idx
  ON club_dues_payment_intents(payment_ref);

CREATE UNIQUE INDEX IF NOT EXISTS club_dues_payment_intents_op_hash_idx
  ON club_dues_payment_intents(op_hash)
  WHERE op_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS club_dues_payment_intents_user_status_idx
  ON club_dues_payment_intents(user_id, status);

CREATE INDEX IF NOT EXISTS club_dues_payment_intents_contract_status_idx
  ON club_dues_payment_intents(contract_id, status);

CREATE TABLE IF NOT EXISTS club_dues_member_ledger (
  id serial PRIMARY KEY,
  contract_id integer NOT NULL REFERENCES club_dues_contracts(id) ON DELETE CASCADE,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  wallet_address varchar(40) NOT NULL,
  membership_token_id numeric(40, 0),
  utility_units numeric(40, 0) NOT NULL DEFAULT 0,
  paid_through timestamptz NOT NULL,
  last_payment_at timestamptz,
  last_op_hash varchar(80),
  status varchar(24) NOT NULL DEFAULT 'active',
  arrears_since timestamptz,
  warnings_sent integer NOT NULL DEFAULT 0,
  last_warning_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS club_dues_member_contract_wallet_idx
  ON club_dues_member_ledger(contract_id, wallet_address);

CREATE INDEX IF NOT EXISTS club_dues_member_user_status_idx
  ON club_dues_member_ledger(user_id, status);

CREATE INDEX IF NOT EXISTS club_dues_member_paid_through_idx
  ON club_dues_member_ledger(paid_through);

CREATE INDEX IF NOT EXISTS club_dues_member_contract_status_idx
  ON club_dues_member_ledger(contract_id, status);

DO $$
BEGIN
  ALTER TABLE club_dues_contracts
    ADD CONSTRAINT club_dues_contracts_monthly_dues_positive
    CHECK (monthly_dues_mutez > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE club_dues_contracts
    ADD CONSTRAINT club_dues_contracts_month_seconds_positive
    CHECK (month_seconds >= 3600);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE club_dues_payment_intents
    ADD CONSTRAINT club_dues_payment_intents_months_range
    CHECK (months BETWEEN 1 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
