-- Retire Hoard as a first-class wtfOS app without erasing historical purchase/audit records.
-- app_keys rows cascade when the universal registration is removed.
DELETE FROM "app_registrations"
WHERE "app_id" = 'desktop:hoard' OR "app_key" = 'hoard';

DELETE FROM "desktop_app_settings"
WHERE "app_key" = 'hoard';

-- A core-app unlock was never sold, but remove any stale grants created by old fixtures/admin tools.
DELETE FROM "in_app_inventory_items"
WHERE "sku" = 'wtfos-app-hoard';
