INSERT INTO in_app_market_items
  (sku, name, description, category, price_wtf_units, contract_listing_id, active, metadata, sort_order)
VALUES
  (
    'desktop-tiny-fan',
    'Tiny Fan',
    'A small desktop fan that pushes balls, slows ants, and makes pets wary.',
    'desktop_fun',
    7000000000,
    NULL,
    false,
    '{"kind":"tiny-fan","tool":"fan","icon":"fan"}'::jsonb,
    110
  ),
  (
    'desktop-light-disco',
    'Hanging Disco Light',
    'A hanging light that throws shifting color over desktop pets, ants, and toys.',
    'desktop_fun',
    9000000000,
    NULL,
    false,
    '{"kind":"hanging-light","variant":"disco","tool":"light-disco","icon":"sparkles"}'::jsonb,
    120
  ),
  (
    'desktop-light-moon',
    'Hanging Moon Light',
    'A cool hanging moon light that calms living desktop elements.',
    'desktop_fun',
    9000000000,
    NULL,
    false,
    '{"kind":"hanging-light","variant":"moon","tool":"light-moon","icon":"moon"}'::jsonb,
    130
  ),
  (
    'desktop-light-sun',
    'Traveling Sun Light',
    'A hanging sun that travels across the desktop with the time of day.',
    'desktop_fun',
    12000000000,
    NULL,
    false,
    '{"kind":"hanging-light","variant":"sun","tool":"light-sun","icon":"sun"}'::jsonb,
    140
  ),
  (
    'desktop-sticky-note-trap',
    'Sticky Note Trap',
    'A writable sticky note that can slow ants, catch pets, smear ink, and collect marks.',
    'desktop_fun',
    5000000000,
    NULL,
    false,
    '{"kind":"sticky-note","tool":"sticky-note","icon":"sticky-note"}'::jsonb,
    150
  ),
  (
    'desktop-mop',
    'Desktop Mop',
    'A three-use mop that smears messes wider while cleaning them up.',
    'desktop_fun',
    6000000000,
    NULL,
    false,
    '{"kind":"mop","tool":"mop","uses":3,"icon":"brush-cleaning"}'::jsonb,
    160
  ),
  (
    'desktop-vacuum',
    'Desktop Vacuum',
    'A desktop vacuum that erases messes cleanly as it is moved over them.',
    'desktop_fun',
    11000000000,
    NULL,
    false,
    '{"kind":"vacuum","tool":"vacuum","icon":"eraser"}'::jsonb,
    170
  ),
  (
    'desktop-spraycan',
    'Spraycan',
    'A desktop artifact for future paint-and-sound interactions.',
    'desktop_fun',
    16000000000,
    NULL,
    false,
    '{"kind":"artifact","artifact":"spraycan","icon":"spray-can"}'::jsonb,
    180
  ),
  (
    'desktop-catapult',
    'Desktop Catapult',
    'A larger desktop artifact for future launch-and-bounce interactions.',
    'desktop_fun',
    24000000000,
    NULL,
    false,
    '{"kind":"artifact","artifact":"catapult","icon":"catapult","size":"2x2"}'::jsonb,
    190
  ),
  (
    'desktop-ant-farm',
    'Desktop Ant Farm',
    'A desktop artifact for future native ant colony behavior.',
    'desktop_fun',
    18000000000,
    NULL,
    false,
    '{"kind":"artifact","artifact":"ant-farm","icon":"container"}'::jsonb,
    200
  )
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_wtf_units = EXCLUDED.price_wtf_units,
  contract_listing_id = EXCLUDED.contract_listing_id,
  active = false,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
