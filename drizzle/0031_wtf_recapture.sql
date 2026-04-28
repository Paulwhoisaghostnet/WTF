-- Phase 10 — Pre-Season-3 WTF recapture (no burn — recycle).
--
-- Everything in this migration routes WTF from veteran wallets back to
-- the operator wallet (WTF_OPERATOR_WALLET_ADDRESS). Nothing touches the
-- FA2 `burn` entrypoint.
--
-- Four recapture vehicles are introduced:
--   1. buyback_windows + buyback_allowlist — closed, time-bounded,
--      allowlist-gated WTF→XTZ buyback bound to a Phase 8 buyback
--      contract.
--   2. wtf_auctions + wtf_auction_bids — off-season WTF-denominated
--      auctions for S3 perks.
--   3. season_contestants.ante_paid_wtf + ante_op_hash — pre-season
--      ante tracking; cohort-lock refuses slots without a settled ante.
--   4. side_quests.entry_fee_wtf + side_quest_entry_fees — opt-in WTF
--      escrow on quest start.
--
-- Plus:
--   • Two new auto_verify_type values (wtf_swapped_in_buyback and
--     wtf_paid_to_operator_at_least) consumed by the side-quest verifier.
--   • wtf_recaptured_counters view + table for the leaderboard.

BEGIN;

-- 1) auto_verify_type enum: two new values.
ALTER TYPE auto_verify_type ADD VALUE IF NOT EXISTS 'wtf_swapped_in_buyback';
ALTER TYPE auto_verify_type ADD VALUE IF NOT EXISTS 'wtf_paid_to_operator_at_least';

-- 2) Buyback window state machine.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'buyback_window_status') THEN
    CREATE TYPE buyback_window_status AS ENUM (
      'draft',
      'funded',
      'open',
      'closed',
      'swept',
      'cancelled'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS buyback_windows (
  id                       serial PRIMARY KEY,
  label                    varchar(120) NOT NULL,
  contract_address         varchar(40) NOT NULL,
  network                  collection_contract_network NOT NULL DEFAULT 'ghostnet',
  status                   buyback_window_status NOT NULL DEFAULT 'draft',
  rate_mutez_per_wtf       numeric(40, 0) NOT NULL,
  per_seller_cap_wtf       numeric(40, 0) NOT NULL,
  total_xtz_budget_mutez   numeric(40, 0) NOT NULL,
  opens_at                 timestamp NOT NULL,
  closes_at                timestamp NOT NULL,
  merkle_root              varchar(80),
  snapshot_min_balance_wtf numeric(40, 0) DEFAULT 0 NOT NULL,
  snapshot_block_level     integer,
  created_by_user_id       integer REFERENCES users(id) ON DELETE SET NULL,
  operator_fund_run_id     integer REFERENCES operator_wallet_runs(id) ON DELETE SET NULL,
  operator_withdraw_xtz_run_id integer REFERENCES operator_wallet_runs(id) ON DELETE SET NULL,
  operator_withdraw_wtf_run_id integer REFERENCES operator_wallet_runs(id) ON DELETE SET NULL,
  swaps_observed           integer NOT NULL DEFAULT 0,
  wtf_recaptured           numeric(40, 0) NOT NULL DEFAULT 0,
  xtz_dispensed_mutez      numeric(40, 0) NOT NULL DEFAULT 0,
  notes                    text,
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buyback_windows_status_idx ON buyback_windows(status);
CREATE INDEX IF NOT EXISTS buyback_windows_opens_at_idx ON buyback_windows(opens_at);

-- 3) Allowlist: wallets eligible to sell into a window, with their Merkle
-- proof. Populated when the operator clicks "snapshot + publish"; read
-- by the client-side Sell WTF panel.
CREATE TABLE IF NOT EXISTS buyback_allowlist (
  id                serial PRIMARY KEY,
  window_id         integer NOT NULL REFERENCES buyback_windows(id) ON DELETE CASCADE,
  wallet_address    varchar(40) NOT NULL,
  user_id           integer REFERENCES users(id) ON DELETE SET NULL,
  max_wtf           numeric(40, 0) NOT NULL,
  snapshot_balance_wtf numeric(40, 0) NOT NULL,
  merkle_proof      jsonb NOT NULL,
  eligibility_reason varchar(40) NOT NULL,
  swapped_wtf       numeric(40, 0) NOT NULL DEFAULT 0,
  swapped_at        timestamp,
  swap_op_hash      varchar(80),
  created_at        timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS buyback_allowlist_unique_idx
  ON buyback_allowlist(window_id, wallet_address);
CREATE INDEX IF NOT EXISTS buyback_allowlist_user_idx
  ON buyback_allowlist(user_id);

-- 4) Off-season WTF auctions: simple last-bid-wins by timestamp, with
-- WTF-denominated bids. Settlement is manual (operator confirms the
-- winning bidder has transferred WTF to the operator wallet) to keep the
-- surface minimal — the operator signer doesn't need to touch this flow.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wtf_auction_status') THEN
    CREATE TYPE wtf_auction_status AS ENUM (
      'draft',
      'live',
      'ended',
      'settled',
      'cancelled'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS wtf_auctions (
  id               serial PRIMARY KEY,
  title            varchar(200) NOT NULL,
  description      text,
  perk_kind        varchar(60) NOT NULL,
  starts_at        timestamp NOT NULL,
  ends_at          timestamp NOT NULL,
  min_bid_wtf      numeric(40, 0) NOT NULL DEFAULT 1,
  bid_increment_wtf numeric(40, 0) NOT NULL DEFAULT 1,
  status           wtf_auction_status NOT NULL DEFAULT 'draft',
  winning_bid_id   integer,
  settlement_op_hash varchar(80),
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wtf_auctions_status_idx ON wtf_auctions(status);
CREATE INDEX IF NOT EXISTS wtf_auctions_ends_at_idx ON wtf_auctions(ends_at);

CREATE TABLE IF NOT EXISTS wtf_auction_bids (
  id            serial PRIMARY KEY,
  auction_id    integer NOT NULL REFERENCES wtf_auctions(id) ON DELETE CASCADE,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address varchar(40) NOT NULL,
  amount_wtf    numeric(40, 0) NOT NULL,
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wtf_auction_bids_auction_idx
  ON wtf_auction_bids(auction_id, amount_wtf DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wtf_auctions_winning_bid_fk'
  ) THEN
    ALTER TABLE wtf_auctions
      ADD CONSTRAINT wtf_auctions_winning_bid_fk
      FOREIGN KEY (winning_bid_id) REFERENCES wtf_auction_bids(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 5) Pre-season ante tracking on season_contestants. Cohort lock will
-- refuse any user whose ante_paid_wtf < season.ante_wtf_required.
ALTER TABLE season_contestants
  ADD COLUMN IF NOT EXISTS ante_paid_wtf numeric(40, 0) NOT NULL DEFAULT 0;

ALTER TABLE season_contestants
  ADD COLUMN IF NOT EXISTS ante_op_hash varchar(80);

ALTER TABLE season_contestants
  ADD COLUMN IF NOT EXISTS ante_paid_at timestamp;

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS ante_wtf_required numeric(40, 0) NOT NULL DEFAULT 0;

-- 6) Side-quest entry fees (escrow to operator wallet on start).
ALTER TABLE side_quests
  ADD COLUMN IF NOT EXISTS entry_fee_wtf numeric(40, 0) NOT NULL DEFAULT 0;

-- Entry-fee escrow rows: operator confirms the fee was received before
-- allowing participation. Rows flip from 'pending' → 'confirmed' when a
-- matching inbound transfer lands in walletEvents.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'side_quest_entry_fee_status') THEN
    CREATE TYPE side_quest_entry_fee_status AS ENUM ('pending', 'confirmed', 'refunded');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS side_quest_entry_fees (
  id              serial PRIMARY KEY,
  side_quest_id   integer NOT NULL REFERENCES side_quests(id) ON DELETE CASCADE,
  user_id         integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address  varchar(40) NOT NULL,
  amount_wtf      numeric(40, 0) NOT NULL,
  status          side_quest_entry_fee_status NOT NULL DEFAULT 'pending',
  op_hash         varchar(80),
  confirmed_at    timestamp,
  created_at      timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS side_quest_entry_fees_unique_idx
  ON side_quest_entry_fees(side_quest_id, user_id);
CREATE INDEX IF NOT EXISTS side_quest_entry_fees_status_idx
  ON side_quest_entry_fees(status);

-- 7) Recaptured counters: durable per-user totals across all four
-- mechanics. Updated by the watchers on every observed inbound transfer
-- from a user's wallet to the operator wallet.
CREATE TABLE IF NOT EXISTS wtf_recapture_events (
  id              bigserial PRIMARY KEY,
  user_id         integer REFERENCES users(id) ON DELETE SET NULL,
  wallet_address  varchar(40) NOT NULL,
  source          varchar(40) NOT NULL,
  source_ref_id   integer,
  amount_wtf      numeric(40, 0) NOT NULL,
  op_hash         varchar(80),
  observed_at     timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wtf_recapture_events_user_idx
  ON wtf_recapture_events(user_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS wtf_recapture_events_source_idx
  ON wtf_recapture_events(source, observed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wtf_recapture_events_op_hash_idx
  ON wtf_recapture_events(op_hash, wallet_address)
  WHERE op_hash IS NOT NULL;

COMMIT;
