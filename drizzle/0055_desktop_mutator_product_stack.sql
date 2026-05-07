ALTER TABLE in_app_market_items
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

INSERT INTO in_app_market_items
  (sku, name, description, category, price_wtf_units, contract_listing_id, active, stock_quantity, metadata, sort_order)
VALUES
  (
    'desktop-cursor-tool-tray',
    'Cursor Tool Tray',
    'Unlocks a desktop cursor tool tray with scale and future environment tools.',
    'desktop_fun',
    22000000000,
    NULL,
    true,
    0,
    '{"kind":"cursor-tool-tray","unlock":"desktop-tools","stockPolicy":"limited","defaultTool":"standard","tools":["scale"]}'::jsonb,
    210
  ),
  (
    'desktop-train-base-kit',
    'Desktop Train Set Base Kit',
    'A cardboard train kit that opens into starter track, engine, and car pieces.',
    'desktop_fun',
    42000000000,
    NULL,
    false,
    0,
    '{"kind":"train-kit-box","bundle":["starter-track-loop","starter-engine","boxcar"],"stockPolicy":"limited"}'::jsonb,
    220
  ),
  (
    'desktop-train-track-pack',
    'Train Track Expansion Pack',
    'Additional modular track pieces for larger desktop loops.',
    'desktop_fun',
    18000000000,
    NULL,
    false,
    0,
    '{"kind":"train-expansion","expansion":"track","stockPolicy":"limited"}'::jsonb,
    230
  ),
  (
    'desktop-train-engine-pack',
    'Train Engine Pack',
    'Alternate train engines with different movement speeds.',
    'desktop_fun',
    28000000000,
    NULL,
    false,
    0,
    '{"kind":"train-expansion","expansion":"engine","stockPolicy":"limited"}'::jsonb,
    240
  ),
  (
    'desktop-train-car-pack',
    'Train Car Pack',
    'Additional cars for different desktop train combinations.',
    'desktop_fun',
    16000000000,
    NULL,
    false,
    0,
    '{"kind":"train-expansion","expansion":"car","stockPolicy":"limited"}'::jsonb,
    250
  ),
  (
    'desktop-portal-gun',
    'Portal Gun',
    'Places alternating blue and orange desktop portals; pets fear it.',
    'desktop_fun',
    64000000000,
    NULL,
    false,
    0,
    '{"kind":"portal-gun","portalColors":["blue","orange"],"stockPolicy":"limited"}'::jsonb,
    260
  ),
  (
    'desktop-jukebox',
    'Jukebox',
    'Unlocks Tezamp, the stubbed Tezos music player and visualizer.',
    'desktop_fun',
    36000000000,
    NULL,
    false,
    0,
    '{"kind":"jukebox","opens":"/tezamp","stockPolicy":"limited"}'::jsonb,
    270
  ),
  (
    'desktop-paper-shredder',
    'Paper Shredder',
    'A desktop mutator for paperlike objects that declare shredder compatibility.',
    'desktop_fun',
    26000000000,
    NULL,
    false,
    0,
    '{"kind":"paper-shredder","mutator":"paper-shredder","stockPolicy":"limited"}'::jsonb,
    280
  ),
  (
    'desktop-the-cake',
    'THE CAKE',
    'Coming soon. Always sold out.',
    'desktop_fun',
    999999999999,
    NULL,
    true,
    0,
    '{"kind":"coming-soon","artifact":"the-cake","alwaysSoldOut":true,"stockPolicy":"limited"}'::jsonb,
    290
  )
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_wtf_units = EXCLUDED.price_wtf_units,
  contract_listing_id = EXCLUDED.contract_listing_id,
  active = EXCLUDED.active,
  stock_quantity = EXCLUDED.stock_quantity,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
