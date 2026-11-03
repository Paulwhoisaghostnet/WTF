BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_objkt_purchase_intents (
  id uuid PRIMARY KEY,
  buyer_address text NOT NULL,
  seller_address text NOT NULL,
  marketplace_contract text NOT NULL,
  ask_id text NOT NULL,
  token_contract text NOT NULL,
  token_id text NOT NULL,
  price_mutez text NOT NULL,
  preflight_level bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  operation_hash text UNIQUE,
  root_transaction_id bigint UNIQUE,
  horse_transfer_id bigint UNIQUE,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','pending','verified','invalid')),
  verified_at timestamptz,
  occurred_at timestamptz,
  last_checked_at timestamptz,
  error_code text,
  CONSTRAINT horf_objkt_intent_wallets_check CHECK (
    buyer_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$' AND
    seller_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$' AND
    buyer_address <> seller_address
  ),
  CONSTRAINT horf_objkt_intent_contracts_check CHECK (
    marketplace_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$' AND
    token_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'
  ),
  CONSTRAINT horf_objkt_intent_nats_check CHECK (
    ask_id ~ '^[0-9]+$' AND token_id ~ '^[0-9]+$' AND
    price_mutez ~ '^[0-9]+$' AND price_mutez <> '0' AND preflight_level > 0
  ),
  CONSTRAINT horf_objkt_intent_proof_check CHECK (
    (status = 'verified' AND verified_at IS NOT NULL AND occurred_at IS NOT NULL AND operation_hash IS NOT NULL AND
      root_transaction_id IS NOT NULL AND horse_transfer_id IS NOT NULL)
    OR (status <> 'verified' AND verified_at IS NULL AND occurred_at IS NULL AND root_transaction_id IS NULL AND horse_transfer_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS horf_objkt_intents_verified_time_idx
  ON public.horf_objkt_purchase_intents (occurred_at)
  WHERE status = 'verified';
CREATE INDEX IF NOT EXISTS horf_objkt_intents_pending_idx
  ON public.horf_objkt_purchase_intents (last_checked_at)
  WHERE status = 'pending';

ALTER TABLE public.horf_reward_entitlements DROP CONSTRAINT IF EXISTS horf_reward_entitlements_source_kind_check;
ALTER TABLE public.horf_reward_entitlements
  ADD CONSTRAINT horf_reward_entitlements_source_kind_check CHECK (source_kind IN ('direct','stable','market','objkt'));

ALTER TABLE public.horf_objkt_purchase_intents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_objkt_purchase_intents FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_objkt_purchase_intents FROM authenticated;
  END IF;
END $$;

COMMIT;
