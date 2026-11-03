BEGIN;

INSERT INTO public.roles
  (slug, label, category, purpose, description, access_level, sort_order,
   default_wtf_os_access, is_system, is_assignable)
VALUES
  ('horf_marshal', 'HORF MARSHAL', 'moderation',
   'Review and decide horse token inspections for Horf Stables.',
   'Inspection authority only; no general administrator privileges.',
   0, 1000, true, true, true)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  purpose = EXCLUDED.purpose,
  description = EXCLUDED.description,
  access_level = EXCLUDED.access_level,
  sort_order = EXCLUDED.sort_order,
  default_wtf_os_access = EXCLUDED.default_wtf_os_access,
  is_system = EXCLUDED.is_system,
  is_assignable = EXCLUDED.is_assignable,
  updated_at = now();

ALTER TABLE public.horf_inspection_requests
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id integer REFERENCES public.users(id);
ALTER TABLE public.horf_inspection_approvals
  ADD COLUMN IF NOT EXISTS inspector_user_id integer REFERENCES public.users(id);
ALTER TABLE public.horf_inspection_approvals
  ALTER COLUMN inspector_wallet_address DROP NOT NULL;

-- The earlier wallet-deputy table never grants inspection authority.
DROP TABLE IF EXISTS public.horf_inspectors;

COMMIT;
