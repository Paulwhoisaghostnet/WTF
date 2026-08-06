-- Retire Hoard as a first-class wtfOS app without erasing historical purchase/audit records.
-- app_keys rows cascade when the optional universal registry exists.
DO $$
BEGIN
  IF to_regclass('public.app_registrations') IS NOT NULL THEN
    EXECUTE 'DELETE FROM "app_registrations" WHERE "app_id" = ''desktop:hoard'' OR "app_key" = ''hoard''';
  END IF;
END
$$;

DELETE FROM "desktop_app_settings"
WHERE "app_key" = 'hoard';

-- A core-app unlock was never sold, but remove any stale grants created by old fixtures/admin tools.
DELETE FROM "in_app_inventory_items"
WHERE "sku" = 'wtfos-app-hoard';
