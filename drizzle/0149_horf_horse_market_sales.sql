BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_horse_market_sale_sync (
  contract_address text PRIMARY KEY,
  cursor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'syncing' CHECK (status IN ('ready','syncing','error')),
  as_of timestamptz,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horf_horse_market_sale_sync_contract_check CHECK (contract_address ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$')
);

CREATE TABLE IF NOT EXISTS public.horf_horse_market_sale_events (
  contract_address text NOT NULL REFERENCES public.horf_horse_market_sale_sync(contract_address) ON DELETE CASCADE,
  tzkt_event_id bigint NOT NULL,
  transaction_id bigint NOT NULL,
  occurred_at timestamptz NOT NULL,
  seller_address text NOT NULL,
  buyer_address text NOT NULL,
  listing_id text NOT NULL,
  token_contract text NOT NULL,
  token_id text NOT NULL,
  quantity text NOT NULL,
  total_horse_raw text NOT NULL,
  operation_hash text,
  horse_transfer_id bigint,
  payment_transfer_id bigint,
  verified_at timestamptz,
  last_checked_at timestamptz,
  verification_error text,
  PRIMARY KEY (contract_address, tzkt_event_id),
  CONSTRAINT horf_horse_market_sale_transaction_uq UNIQUE (contract_address, transaction_id),
  CONSTRAINT horf_horse_market_sale_event_wallets_check CHECK (
    seller_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$' AND
    buyer_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$' AND
    seller_address <> buyer_address
  ),
  CONSTRAINT horf_horse_market_sale_event_nats_check CHECK (
    listing_id ~ '^[0-9]+$' AND token_id ~ '^[0-9]+$' AND
    quantity ~ '^[0-9]+$' AND quantity <> '0' AND
    total_horse_raw ~ '^[0-9]+$' AND total_horse_raw <> '0'
  ),
  CONSTRAINT horf_horse_market_sale_event_proof_check CHECK (
    (verified_at IS NULL AND operation_hash IS NULL AND horse_transfer_id IS NULL AND payment_transfer_id IS NULL)
    OR
    (verified_at IS NOT NULL AND operation_hash IS NOT NULL AND horse_transfer_id IS NOT NULL AND payment_transfer_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS horf_horse_market_sale_events_time_idx
  ON public.horf_horse_market_sale_events (contract_address, occurred_at)
  WHERE verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS horf_horse_market_sale_events_pending_idx
  ON public.horf_horse_market_sale_events (contract_address, tzkt_event_id)
  WHERE verified_at IS NULL;

ALTER TABLE public.horf_reward_entitlements DROP CONSTRAINT IF EXISTS horf_reward_entitlements_source_kind_check;
ALTER TABLE public.horf_reward_entitlements
  ADD CONSTRAINT horf_reward_entitlements_source_kind_check CHECK (source_kind IN ('direct','stable','market'));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['horf_horse_market_sale_sync','horf_horse_market_sale_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
