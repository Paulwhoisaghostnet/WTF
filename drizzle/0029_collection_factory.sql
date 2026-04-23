-- Phase 8 — WTF Contract Factory tracking.
--
-- `collection_templates` holds the named SmartPy template registry. One row per
-- template (teia_one_of_one, open_edition, bonding_curve, blind_mint, buyback).
-- The WTF server loads source on demand from the Kiln repo at deploy time;
-- this row exists to stamp which template a deployed collection uses.
--
-- `collection_contracts` tracks every originated WTF contract across envs so
-- the Control Board has a single index of what is live where, with operator
-- audit breadcrumbs (deployed_by, deployed_at, operator_run_id).
--
-- `collection_template_kind` covers every mode plus the one-off buyback so the
-- same table can index pre-Season-3 buyback deployments alongside the
-- collection suite.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_template_kind') THEN
    CREATE TYPE collection_template_kind AS ENUM (
      'teia_one_of_one',
      'open_edition',
      'bonding_curve',
      'blind_mint',
      'buyback'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_contract_network') THEN
    CREATE TYPE collection_contract_network AS ENUM (
      'ghostnet',
      'shadownet',
      'mainnet'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_contract_status') THEN
    CREATE TYPE collection_contract_status AS ENUM (
      'pending',
      'originating',
      'live',
      'failed',
      'retired'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS collection_templates (
  id             serial PRIMARY KEY,
  kind           collection_template_kind NOT NULL UNIQUE,
  label          varchar(120) NOT NULL,
  summary        text,
  source_path    varchar(400) NOT NULL,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_contracts (
  id                serial PRIMARY KEY,
  template_kind     collection_template_kind NOT NULL,
  name              varchar(140) NOT NULL,
  address           varchar(40),
  network           collection_contract_network NOT NULL,
  status            collection_contract_status NOT NULL DEFAULT 'pending',
  collection_meta   jsonb,
  origination_params jsonb,
  op_hash           varchar(80),
  deployed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  operator_run_id   integer,
  error_message     text,
  deployed_at       timestamp,
  retired_at        timestamp,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_contracts_address_unique_idx
  ON collection_contracts (address, network)
  WHERE address IS NOT NULL;

CREATE INDEX IF NOT EXISTS collection_contracts_template_idx
  ON collection_contracts (template_kind);

CREATE INDEX IF NOT EXISTS collection_contracts_network_status_idx
  ON collection_contracts (network, status);

-- Seed the five templates (idempotent). source_path is the repo-relative path
-- the server reads when the operator picks a template in the UI.
INSERT INTO collection_templates (kind, label, summary, source_path)
VALUES
  ('teia_one_of_one', 'Teia-style 1/1',
    'Single-edition FA2 mints, per-token royalty, allowlist-capable.',
    'building/shadownet kiln/contracts/wtf-collections/WtfAllowlistFA2.py'),
  ('open_edition', 'Open Edition',
    'Fixed-price, time-bounded, unlimited-supply FA2 open editions.',
    'building/shadownet kiln/contracts/wtf-collections/WtfOpenEditionFA2.py'),
  ('bonding_curve', 'Bonding Curve',
    'FA2 mints priced by base + (minted / step_size) * increment.',
    'building/shadownet kiln/contracts/wtf-collections/WtfBondingCurveFA2.py'),
  ('blind_mint', 'Blind Mint (commit-reveal)',
    'Admin commits Merkle root of a shuffled bundle; each mint reveals one entry.',
    'building/shadownet kiln/contracts/wtf-collections/WtfBlindMintFA2.py'),
  ('buyback', 'WTF-for-XTZ Buyback',
    'Closed, time-bounded, allowlist-gated buyback contract (Phase 10 engine).',
    'building/shadownet kiln/contracts/wtf-buyback/WtfBuybackV1.py')
ON CONFLICT (kind) DO UPDATE SET
  label       = EXCLUDED.label,
  summary     = EXCLUDED.summary,
  source_path = EXCLUDED.source_path,
  updated_at  = now();
