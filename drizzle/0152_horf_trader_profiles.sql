BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_trader_profiles (
  address text PRIMARY KEY,
  image_url text,
  image_bytes bytea,
  image_mime text,
  image_sha256 text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horf_trader_profiles_address_check
    CHECK (address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_trader_profiles_image_source_check
    CHECK (image_url IS NULL OR image_bytes IS NULL),
  CONSTRAINT horf_trader_profiles_image_bytes_check
    CHECK (image_bytes IS NULL OR octet_length(image_bytes) <= 2097152),
  CONSTRAINT horf_trader_profiles_image_metadata_check
    CHECK ((image_bytes IS NULL AND image_mime IS NULL AND image_sha256 IS NULL)
      OR (image_bytes IS NOT NULL AND image_mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
        AND image_sha256 ~ '^[0-9a-f]{64}$'))
);

CREATE TABLE IF NOT EXISTS public.horf_trader_season_profiles (
  address text NOT NULL REFERENCES public.horf_trader_profiles(address) ON DELETE CASCADE,
  season_key text NOT NULL,
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (address, season_key)
);

-- Express enforces wallet proof and publishes only the selected profile fields.
-- The binary image is never exposed through Supabase's public Data API.
ALTER TABLE public.horf_trader_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horf_trader_season_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_trader_profiles, public.horf_trader_season_profiles FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_trader_profiles, public.horf_trader_season_profiles FROM authenticated;
  END IF;
END $$;

COMMIT;
