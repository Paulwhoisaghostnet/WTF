-- Restore the commissioned participation surfaces as registered, launchable OS apps.
-- Casino remains membership-gated in application policy; this does not enable wagering.
INSERT INTO "desktop_app_settings" (
  "app_key",
  "enabled",
  "doc_status",
  "doc_registry_version",
  "docs_updated_at",
  "docs_expires_at",
  "registration_never_expires",
  "updated_at"
)
SELECT
  app_key,
  true,
  'registered',
  '1',
  NOW(),
  NULL,
  true,
  NOW()
FROM unnest(ARRAY[
  'wtfiam',
  'wim',
  'w',
  'arcade',
  'casino',
  'console',
  'game-studio',
  'studio',
  'ch-ease',
  'pasta-protocol',
  'gallery',
  'ipfs-pinning',
  'mail',
  'admin-inbox'
]::varchar[]) AS commissioned(app_key)
ON CONFLICT ("app_key") DO UPDATE SET
  "enabled" = EXCLUDED."enabled",
  "doc_status" = EXCLUDED."doc_status",
  "doc_registry_version" = EXCLUDED."doc_registry_version",
  "docs_updated_at" = EXCLUDED."docs_updated_at",
  "docs_expires_at" = EXCLUDED."docs_expires_at",
  "registration_never_expires" = EXCLUDED."registration_never_expires",
  "updated_at" = EXCLUDED."updated_at";

-- Seed plain-language help without replacing operator-authored FAQ content.
INSERT INTO "faq_items" ("question", "answer", "category", "display_order")
SELECT question, answer, category, display_order
FROM (VALUES
  (
    'Where should I start?',
    'Choose Play, Create, Shop, Events, or Talk in the Start menu. Help & Start Here repeats those choices and explains each destination.',
    'Start Here',
    10
  ),
  (
    'How do I play community games?',
    'Open Play, then WTF Arcade. Choose a game to see its instructions before starting. Casino is a separate membership-gated practice and creator sandbox.',
    'Play',
    20
  ),
  (
    'How do I build a game?',
    'Open Create, then Game Studio. Start a project, test it, and use the publishing steps to make it available to the community.',
    'Create',
    30
  ),
  (
    'Where are the art creation tools?',
    'Open Create for Studio, CH-EASE, Pasta Protocol, and the available media tools. Tools with special access explain the role or pass they require.',
    'Create',
    40
  ),
  (
    'How do I mint my work?',
    'Open Mint Portal from Create. Review the network, wallet, media, metadata, supply, royalties, and final cost before approving a mint.',
    'Minting',
    50
  ),
  (
    'How do I add something to the shop?',
    'Trusted market creators can submit an item for operator review. Approved items appear in the community shop with creator attribution and purchase details.',
    'Shop',
    60
  ),
  (
    'Where do I find gameshows and community dates?',
    'Open Events, then Calendar. Event details show the date, host, participation information, and related gameshow destination when available.',
    'Events',
    70
  ),
  (
    'How do I message someone?',
    'Open Talk for Inbox, WIM, community feeds, and other communication apps. Contact Admin is the direct support channel for every signed-in user.',
    'Talk',
    80
  ),
  (
    'Why is an app locked?',
    'A locked app needs a role, membership, pass, wallet, or operator approval. The lock message tells you what is missing and where to resolve it.',
    'Access',
    90
  ),
  (
    'Are beta and gamma separate platforms?',
    'No. The classic operating-system desktop is the commissioned primary experience. Beta and gamma are reserved as future accessibility views over the same apps and content.',
    'Accessibility',
    100
  )
) AS seed(question, answer, category, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM "faq_items" existing
  WHERE existing."question" = seed.question
);
