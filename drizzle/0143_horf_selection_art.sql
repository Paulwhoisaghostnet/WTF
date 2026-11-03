BEGIN;
ALTER TABLE public.horf_stable_selections
  ADD COLUMN IF NOT EXISTS token_name text;
ALTER TABLE public.horf_stable_selections
  ADD COLUMN IF NOT EXISTS token_image text;
COMMIT;
