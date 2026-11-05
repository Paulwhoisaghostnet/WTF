BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_trade_offer_messages (
  id bigserial PRIMARY KEY,
  sign_id bigint NOT NULL REFERENCES public.horf_open_range_offers(id),
  offerer_wallet_address text NOT NULL,
  owner_wallet_address text NOT NULL,
  requested_token_contract text NOT NULL,
  requested_token_id text NOT NULL,
  offered_token_contract text NOT NULL,
  offered_token_id text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'proposed',
  decline_reason text,
  cancelled_by_wallet_address text,
  private_listing_id text,
  accept_operation_hash text,
  fulfill_operation_hash text,
  cancel_operation_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horf_trade_offer_messages_status_check
    CHECK (status IN ('proposed', 'declined', 'cancelled', 'accepted', 'fulfilled')),
  CONSTRAINT horf_trade_offer_messages_offerers_check
    CHECK (offerer_wallet_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'
      AND owner_wallet_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'
      AND offerer_wallet_address <> owner_wallet_address),
  CONSTRAINT horf_trade_offer_messages_tokens_check
    CHECK (requested_token_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'
      AND offered_token_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'
      AND requested_token_id ~ '^[0-9]+$'
      AND offered_token_id ~ '^[0-9]+$'
      AND (requested_token_contract, requested_token_id) <>
          (offered_token_contract, offered_token_id)),
  CONSTRAINT horf_trade_offer_messages_private_listing_check
    CHECK (private_listing_id IS NULL OR private_listing_id ~ '^[0-9]+$'),
  CONSTRAINT horf_trade_offer_messages_accepted_proof_check
    CHECK (status NOT IN ('accepted', 'fulfilled') OR
      (private_listing_id IS NOT NULL AND accept_operation_hash IS NOT NULL)),
  CONSTRAINT horf_trade_offer_messages_fulfilled_proof_check
    CHECK (status <> 'fulfilled' OR fulfill_operation_hash IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS horf_trade_offer_messages_incoming_idx
  ON public.horf_trade_offer_messages (owner_wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS horf_trade_offer_messages_outgoing_idx
  ON public.horf_trade_offer_messages (offerer_wallet_address, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS horf_trade_offer_messages_active_uq
  ON public.horf_trade_offer_messages (sign_id, offerer_wallet_address,
    offered_token_contract, offered_token_id)
  WHERE status IN ('proposed', 'accepted');
CREATE UNIQUE INDEX IF NOT EXISTS horf_trade_offer_messages_private_listing_uq
  ON public.horf_trade_offer_messages (private_listing_id)
  WHERE private_listing_id IS NOT NULL;

ALTER TABLE public.horf_trade_offer_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_trade_offer_messages FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_trade_offer_messages FROM authenticated;
  END IF;
END $$;

COMMIT;
