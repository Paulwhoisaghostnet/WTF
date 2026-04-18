-- Track on-chain verification status for marketplace listings and bids.
-- Default is 'verified' so legacy rows remain visible in the feed when
-- drizzle-kit adds the column.  New writes from the create-listing /
-- create-bid flows explicitly insert 'pending_verification' and the
-- TzKT verifier reconciles them to 'verified' or 'failed'.

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS onchain_status varchar(24) NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS onchain_verified_at timestamp,
  ADD COLUMN IF NOT EXISTS onchain_verified_sender varchar(36);

ALTER TABLE public.marketplace_bids
  ADD COLUMN IF NOT EXISTS onchain_status varchar(24) NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS onchain_verified_at timestamp,
  ADD COLUMN IF NOT EXISTS onchain_verified_sender varchar(36);

UPDATE public.marketplace_listings
   SET onchain_verified_at = COALESCE(onchain_verified_at, created_at)
 WHERE onchain_status = 'verified'
   AND onchain_verified_at IS NULL;

UPDATE public.marketplace_bids
   SET onchain_verified_at = COALESCE(onchain_verified_at, created_at)
 WHERE onchain_status = 'verified'
   AND onchain_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS listing_onchain_status_idx
  ON public.marketplace_listings (onchain_status);

CREATE INDEX IF NOT EXISTS bid_onchain_status_idx
  ON public.marketplace_bids (onchain_status);
