-- Ensure Skywire is registered and launchable for staff-alpha rollout testing.
-- Idempotent: safe on environments that already have the row.

INSERT INTO public.desktop_app_settings (
  app_key,
  enabled,
  doc_status,
  doc_registry_version,
  docs_updated_at,
  registered_at,
  updated_at
)
VALUES (
  'skywire',
  true,
  'registered',
  '1',
  now(),
  now(),
  now()
)
ON CONFLICT (app_key) DO UPDATE
SET
  enabled = true,
  doc_status = 'registered',
  doc_registry_version = EXCLUDED.doc_registry_version,
  docs_updated_at = COALESCE(public.desktop_app_settings.docs_updated_at, EXCLUDED.docs_updated_at),
  updated_at = now();
