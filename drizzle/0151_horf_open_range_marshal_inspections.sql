BEGIN;

-- A Marshal can inspect a qualifying Open Range token without claiming to
-- own it. Existing owner-submitted requests keep their original provenance.
ALTER TABLE public.horf_inspection_requests
  ALTER COLUMN submitter_address DROP NOT NULL;
ALTER TABLE public.horf_inspection_requests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'owner_submission';
ALTER TABLE public.horf_inspection_requests
  ADD CONSTRAINT horf_inspection_requests_source_check
  CHECK (source IN ('owner_submission', 'open_range'));
ALTER TABLE public.horf_inspection_requests
  ADD CONSTRAINT horf_inspection_requests_source_submitter_check
  CHECK ((source = 'owner_submission' AND submitter_address IS NOT NULL)
    OR (source = 'open_range' AND submitter_address IS NULL));

COMMIT;
