CREATE TABLE IF NOT EXISTS in_app_inventory_transfers (
  id serial PRIMARY KEY,
  sender_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  receiver_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku varchar(80) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  source varchar(40) NOT NULL DEFAULT 'wtf_live_tip',
  source_room_id varchar(80),
  note text,
  status varchar(24) NOT NULL DEFAULT 'completed',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  redeemed_at timestamptz,
  reward_ledger_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT in_app_inventory_transfers_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS in_app_inventory_transfers_receiver_idx
  ON in_app_inventory_transfers (receiver_user_id, created_at);

CREATE INDEX IF NOT EXISTS in_app_inventory_transfers_sender_idx
  ON in_app_inventory_transfers (sender_user_id, created_at);

CREATE INDEX IF NOT EXISTS in_app_inventory_transfers_redeem_idx
  ON in_app_inventory_transfers (receiver_user_id, status, redeemed_at);

CREATE INDEX IF NOT EXISTS in_app_inventory_transfers_sku_idx
  ON in_app_inventory_transfers (sku);

INSERT INTO in_app_market_items
  (
    sku,
    name,
    description,
    category,
    price_wtf_units,
    price_exp,
    contract_listing_id,
    active,
    stock_quantity,
    rarity_tier,
    price_score,
    price_wtf_locked,
    price_score_locked,
    metadata,
    sort_order
  )
VALUES
  (
    'wtf-live-rose',
    'WTF LIVE Rose',
    'A classic rose to throw on stage for performers, hosts, or other live-room users.',
    'wtf_live',
    100000000,
    10,
    NULL,
    true,
    999999,
    1,
    1,
    true,
    true,
    '{"kind":"live-tip","surface":"wtf-live","tipItem":true,"physicalItem":true,"redeemWtf":1,"throwLabel":"Rose","animation":"toss-rose"}'::jsonb,
    10
  ),
  (
    'wtf-live-pocket-change',
    'Pocket Change',
    'A handful of coins to drop into a busker guitar case.',
    'wtf_live',
    200000000,
    20,
    NULL,
    true,
    999999,
    1,
    2,
    true,
    true,
    '{"kind":"live-tip","surface":"wtf-live","tipItem":true,"physicalItem":true,"redeemWtf":2,"throwLabel":"Pocket Change","animation":"drop-coins"}'::jsonb,
    20
  ),
  (
    'wtf-live-rubber-chicken',
    'Rubber Chicken',
    'A ridiculous rubber chicken to fling onto the stage.',
    'wtf_live',
    500000000,
    50,
    NULL,
    true,
    999999,
    1,
    5,
    true,
    true,
    '{"kind":"live-tip","surface":"wtf-live","tipItem":true,"physicalItem":true,"redeemWtf":5,"throwLabel":"Rubber Chicken","animation":"fling-rubber-chicken"}'::jsonb,
    30
  ),
  (
    'wtf-live-jalapeno',
    'Jalapeno',
    'A spicy pepper to toss on stage when the set gets hot.',
    'wtf_live',
    1000000000,
    100,
    NULL,
    true,
    999999,
    1,
    10,
    true,
    true,
    '{"kind":"live-tip","surface":"wtf-live","tipItem":true,"physicalItem":true,"redeemWtf":10,"throwLabel":"Jalapeno","animation":"toss-jalapeno"}'::jsonb,
    40
  ),
  (
    'wtf-live-flaming-heart',
    'Flaming Heart',
    'A blazing heart to toss when a performer sets the room on fire.',
    'wtf_live',
    2500000000,
    250,
    NULL,
    true,
    999999,
    1,
    25,
    true,
    true,
    '{"kind":"live-tip","surface":"wtf-live","tipItem":true,"physicalItem":true,"redeemWtf":25,"throwLabel":"Flaming Heart","animation":"throw-flaming-heart"}'::jsonb,
    50
  ),
  (
    'wtf-live-pauls-panties',
    'Paul''s Panties',
    'A cursed laundry drop to fling onto the stage when the room gets weird.',
    'wtf_live',
    6900000000,
    690,
    NULL,
    true,
    999999,
    1,
    69,
    true,
    true,
    '{"kind":"live-tip","surface":"wtf-live","tipItem":true,"physicalItem":true,"redeemWtf":69,"throwLabel":"Paul''s Panties","animation":"fling-pauls-panties"}'::jsonb,
    60
  )
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_wtf_units = EXCLUDED.price_wtf_units,
  price_exp = EXCLUDED.price_exp,
  active = EXCLUDED.active,
  stock_quantity = GREATEST(in_app_market_items.stock_quantity, EXCLUDED.stock_quantity),
  rarity_tier = EXCLUDED.rarity_tier,
  price_score = EXCLUDED.price_score,
  price_wtf_locked = EXCLUDED.price_wtf_locked,
  price_score_locked = EXCLUDED.price_score_locked,
  metadata = COALESCE(in_app_market_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

UPDATE in_app_market_items
SET
  active = false,
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"deprecatedBy":"tangible-wtf-live-tip-items"}'::jsonb,
  updated_at = now()
WHERE category = 'wtf_live'
  AND sku IN ('wtf-live-spotlight', 'wtf-live-encore', 'wtf-live-golden-kazoo');
