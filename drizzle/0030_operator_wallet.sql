-- Phase 9 — Unified operator wallet + multi-asset signer.
--
-- A single hot wallet disburses WTF, funds the buyback contract with XTZ,
-- and will handle additional FA2 tokens later. The signer process runs as
-- a separate systemd service; this table records every run so every
-- on-chain operation the operator wallet takes has a row the Control
-- Board can reconcile, link to reward_ledger rows, and audit.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operator_wallet_intent') THEN
    CREATE TYPE operator_wallet_intent AS ENUM (
      'disburse_wtf',
      'fund_buyback',
      'withdraw_buyback_xtz',
      'withdraw_buyback_wtf',
      'pause_buyback',
      'unpause_buyback',
      'custom'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operator_wallet_asset_kind') THEN
    CREATE TYPE operator_wallet_asset_kind AS ENUM ('fa2', 'xtz');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operator_wallet_run_status') THEN
    CREATE TYPE operator_wallet_run_status AS ENUM (
      'prepared',
      'broadcasting',
      'confirmed',
      'failed',
      'cancelled'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS operator_wallet_runs (
  id                  serial PRIMARY KEY,
  prepared_by         integer REFERENCES users(id) ON DELETE SET NULL,
  signed_by           varchar(80),
  op_hash             varchar(80),
  intent              operator_wallet_intent NOT NULL,
  asset_kind          operator_wallet_asset_kind NOT NULL,
  asset_contract      varchar(40),
  asset_token_id      varchar(40),
  total_recipients    integer NOT NULL DEFAULT 0,
  total_amount        numeric(40, 0) NOT NULL DEFAULT 0,
  counterparty_contract varchar(40),
  payload             jsonb,
  started_at          timestamp NOT NULL DEFAULT now(),
  finished_at         timestamp,
  status              operator_wallet_run_status NOT NULL DEFAULT 'prepared',
  error_message       text,
  notes               text
);

CREATE INDEX IF NOT EXISTS operator_wallet_runs_status_idx
  ON operator_wallet_runs (status);

CREATE INDEX IF NOT EXISTS operator_wallet_runs_intent_idx
  ON operator_wallet_runs (intent, started_at DESC);

ALTER TABLE reward_ledger
  ADD COLUMN IF NOT EXISTS operator_wallet_run_id integer
    REFERENCES operator_wallet_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reward_ledger_operator_run_idx
  ON reward_ledger (operator_wallet_run_id);

-- Operator wallet balance snapshots — cached from TzKT so the Control
-- Board renders instantly and the wallet-events watcher compares new
-- readings against the last known value to detect top-ups.
CREATE TABLE IF NOT EXISTS operator_wallet_balances (
  id              serial PRIMARY KEY,
  asset_kind      operator_wallet_asset_kind NOT NULL,
  asset_contract  varchar(40),
  asset_token_id  varchar(40),
  balance         numeric(40, 0) NOT NULL DEFAULT 0,
  low_threshold   numeric(40, 0),
  checked_at      timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS operator_wallet_balances_asset_idx
  ON operator_wallet_balances (asset_kind, COALESCE(asset_contract, ''), COALESCE(asset_token_id, ''));
