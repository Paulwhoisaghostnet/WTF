-- Give current users a one-time pet-food grant and keep the migration
-- idempotent through an inventory metadata flag.
INSERT INTO in_app_inventory_items
  (user_id, sku, quantity, metadata, created_at, updated_at)
SELECT
  users.id,
  'pet-food',
  3,
  jsonb_build_object(
    'existingUserFoodGrant20260506', true,
    'source', 'existing_user_food_grant',
    'quantity', 3
  ),
  now(),
  now()
FROM users
ON CONFLICT (user_id, sku) DO UPDATE SET
  quantity = CASE
    WHEN COALESCE(in_app_inventory_items.metadata, '{}'::jsonb)
      ? 'existingUserFoodGrant20260506'
      THEN in_app_inventory_items.quantity
    ELSE in_app_inventory_items.quantity + 3
  END,
  metadata = COALESCE(in_app_inventory_items.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'existingUserFoodGrant20260506', true,
      'source', COALESCE(in_app_inventory_items.metadata->>'source', 'existing_user_food_grant'),
      'quantity', 3
    ),
  updated_at = now();
