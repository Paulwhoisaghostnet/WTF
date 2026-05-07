ALTER TABLE in_app_market_items
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS in_app_market_items_visible_stock_idx
  ON in_app_market_items (category, active, stock_quantity);
