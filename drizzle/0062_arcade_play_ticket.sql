INSERT INTO in_app_market_items
  (sku, name, description, category, price_wtf_units, price_exp, contract_listing_id, active, stock_quantity, metadata, sort_order)
VALUES
  (
    'arcade-play-ticket',
    'WTF Arcade Play',
    'One paid play ticket for the public WTF Arcade.',
    'arcade',
    COALESCE(NULLIF(current_setting('wtf.arcade_play_fee_units', true), '')::numeric, 100000000),
    0,
    NULL,
    true,
    1000000,
    '{"kind":"arcade-play-ticket","consumable":true,"surface":"arcade","contract":"in-app-market-cart-router"}'::jsonb,
    1
  )
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_wtf_units = EXCLUDED.price_wtf_units,
  price_exp = EXCLUDED.price_exp,
  contract_listing_id = EXCLUDED.contract_listing_id,
  active = EXCLUDED.active,
  stock_quantity = EXCLUDED.stock_quantity,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
