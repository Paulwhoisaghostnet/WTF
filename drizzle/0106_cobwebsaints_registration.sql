DO $$
DECLARE
  target_id integer;
BEGIN
  SELECT "id"
    INTO target_id
    FROM "users"
   WHERE lower("username") = 'cobwebsaints'
   ORDER BY CASE WHEN "username" = 'cobwebsaints' THEN 0 ELSE 1 END, "id"
   LIMIT 1;

  IF target_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM "wtf_user_sites"
     WHERE ("label" = 'cobwebsaints' OR "host" = 'cobwebsaints.wtfos.me')
       AND "user_id" <> target_id
  ) THEN
    RAISE EXCEPTION 'cobwebsaints wtfOS site label/host is already owned by another user';
  END IF;

  IF target_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM "wtf_subdomain_grants"
     WHERE (("parent_domain" = 'wtf.tez' AND "label" = 'cobwebsaints')
        OR "full_name" = 'cobwebsaints.wtf.tez')
       AND "user_id" <> target_id
  ) THEN
    RAISE EXCEPTION 'cobwebsaints.wtf.tez is already owned by another user';
  END IF;

  IF target_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM "atproto_accounts"
     WHERE "did" = 'did:plc:hlwiidixnd2bcc65tkvsmfs2'
       AND "disconnected_at" IS NULL
       AND "user_id" <> target_id
  ) THEN
    RAISE EXCEPTION 'cobwebsaints Bluesky DID is already linked to another user';
  END IF;
END $$;

INSERT INTO "roles" (
  "slug",
  "label",
  "category",
  "purpose",
  "description",
  "access_level",
  "sort_order",
  "color",
  "icon",
  "default_wtf_os_access",
  "is_system",
  "is_assignable",
  "updated_at"
) VALUES (
  'cobwebsaints_full_user',
  'Cobwebsaints Full User',
  'builder',
  'Non-admin full user role reserved for cobwebsaints.',
  'Grants creator, pinning, social, market, and standard participant permissions without moderation or admin authority.',
  45,
  55,
  '#8b5cf6',
  'sparkles',
  true,
  false,
  false,
  now()
) ON CONFLICT ("slug") DO UPDATE SET
  "label" = EXCLUDED."label",
  "category" = EXCLUDED."category",
  "purpose" = EXCLUDED."purpose",
  "description" = EXCLUDED."description",
  "access_level" = EXCLUDED."access_level",
  "sort_order" = EXCLUDED."sort_order",
  "color" = EXCLUDED."color",
  "icon" = EXCLUDED."icon",
  "default_wtf_os_access" = EXCLUDED."default_wtf_os_access",
  "is_system" = EXCLUDED."is_system",
  "is_assignable" = EXCLUDED."is_assignable",
  "updated_at" = now();

WITH desired_permissions("permission_key", "granted") AS (
  VALUES
    ('view_dashboard', true),
    ('edit_own_profile', true),
    ('link_wallets', true),
    ('view_leaderboard', true),
    ('view_gallery', true),
    ('view_rounds', true),
    ('view_challenges', true),
    ('submit_challenges', true),
    ('view_side_quests', true),
    ('complete_side_quests', true),
    ('trusted_arcade_creator', true),
    ('trusted_console_creator', true),
    ('send_dms', true),
    ('read_message_board', true),
    ('post_message_board', true),
    ('react_messages', true),
    ('create_tv_channel', true),
    ('access_studio', true),
    ('create_studio_projects', true),
    ('trusted_tv_creator', true),
    ('view_marketplace', true),
    ('create_listings', true),
    ('buy_listings', true),
    ('place_offers', true),
    ('manage_trade_board', true),
    ('use_swap', true),
    ('trusted_market_creator', true),
    ('use_wtfos_pinning', true),
    ('pin_threads', false),
    ('lock_threads', false),
    ('delete_any_post', false),
    ('delete_any_message', false),
    ('manage_channels', false),
    ('mute_users', false),
    ('access_admin_panel', false),
    ('manage_users', false),
    ('manage_roles', false),
    ('manage_seasons', false),
    ('manage_challenges', false),
    ('manage_side_quests', false),
    ('manage_gameshow', false),
    ('manage_content', false),
    ('manage_rewards', false),
    ('manage_desktop_apps', false),
    ('manage_media', false),
    ('manage_settings', false),
    ('manage_tv', false),
    ('manage_studio', false),
    ('award_xp', false),
    ('view_contract_ledger', false)
)
INSERT INTO "role_permissions" ("role", "permission_key", "granted", "updated_at")
SELECT 'cobwebsaints_full_user', "permission_key", "granted", now()
  FROM desired_permissions
ON CONFLICT ("role", "permission_key") DO UPDATE SET
  "granted" = EXCLUDED."granted",
  "updated_at" = now();

WITH target_user AS (
  SELECT "id"
    FROM "users"
   WHERE lower("username") = 'cobwebsaints'
   ORDER BY CASE WHEN "username" = 'cobwebsaints' THEN 0 ELSE 1 END, "id"
   LIMIT 1
)
DELETE FROM "user_roles"
 USING target_user
 WHERE "user_roles"."user_id" = target_user."id"
   AND "user_roles"."role" IN (
     'admin',
     'host',
     'cohost',
     'resident_wizard',
     'trusted_creator',
     'test_subject',
     'contestant',
     'witness',
     'time_out'
   );

WITH target_user AS (
  SELECT "id"
    FROM "users"
   WHERE lower("username") = 'cobwebsaints'
   ORDER BY CASE WHEN "username" = 'cobwebsaints' THEN 0 ELSE 1 END, "id"
   LIMIT 1
)
INSERT INTO "user_roles" ("user_id", "role", "assigned_at")
SELECT "id", 'cobwebsaints_full_user', now()
  FROM target_user
ON CONFLICT ("user_id", "role") DO NOTHING;

UPDATE "users"
   SET "role" = 'contestant',
       "twitter_handle" = 'unitedsaints',
       "twitter_verified" = true,
       "twitter_public" = true,
       "updated_at" = now()
 WHERE lower("username") = 'cobwebsaints';

WITH target_user AS (
  SELECT "id"
    FROM "users"
   WHERE lower("username") = 'cobwebsaints'
   ORDER BY CASE WHEN "username" = 'cobwebsaints' THEN 0 ELSE 1 END, "id"
   LIMIT 1
)
INSERT INTO "atproto_accounts" (
  "user_id",
  "did",
  "handle",
  "pds_url",
  "display_name",
  "indexed_at",
  "last_synced_at",
  "created_at",
  "updated_at",
  "disconnected_at"
)
SELECT
  "id",
  'did:plc:hlwiidixnd2bcc65tkvsmfs2',
  'cobwebsaints.bsky.social',
  'https://stropharia.us-west.host.bsky.network',
  'Cobweb',
  now(),
  now(),
  now(),
  now(),
  NULL
  FROM target_user
ON CONFLICT ("user_id") WHERE "disconnected_at" IS NULL DO UPDATE SET
  "did" = EXCLUDED."did",
  "handle" = EXCLUDED."handle",
  "pds_url" = EXCLUDED."pds_url",
  "display_name" = EXCLUDED."display_name",
  "indexed_at" = now(),
  "last_synced_at" = now(),
  "updated_at" = now(),
  "disconnected_at" = NULL;

WITH target_user AS (
  SELECT "id"
    FROM "users"
   WHERE lower("username") = 'cobwebsaints'
   ORDER BY CASE WHEN "username" = 'cobwebsaints' THEN 0 ELSE 1 END, "id"
   LIMIT 1
),
active_account AS (
  SELECT a."id", a."did", a."handle", a."pds_url"
    FROM "atproto_accounts" a
    JOIN target_user u ON u."id" = a."user_id"
   WHERE a."disconnected_at" IS NULL
   ORDER BY a."updated_at" DESC, a."id" DESC
   LIMIT 1
)
INSERT INTO "wtfos_atproto_identities" (
  "user_id",
  "atproto_account_id",
  "canonical_did",
  "canonical_handle",
  "wtf_did",
  "wtf_handle",
  "wtf_pds_url",
  "status",
  "provision_request",
  "requested_at",
  "provisioned_at",
  "last_checked_at",
  "updated_at"
)
SELECT
  u."id",
  a."id",
  COALESCE(a."did", 'did:web:cobwebsaints.wtfos.me'),
  COALESCE(a."handle", 'cobwebsaints.wtfos.me'),
  'did:web:cobwebsaints.wtfos.me',
  'cobwebsaints.wtfos.me',
  'https://pds.wtfos.me',
  'active',
  jsonb_build_object(
    'source', '0106_cobwebsaints_registration',
    'host', 'cobwebsaints.wtfos.me',
    'wtfTez', 'cobwebsaints.wtf.tez',
    'xHandle', 'unitedsaints',
    'bskyHandle', 'cobwebsaints.bsky.social'
  ),
  now(),
  now(),
  now(),
  now()
  FROM target_user u
  LEFT JOIN active_account a ON true
ON CONFLICT ("user_id", "canonical_did") DO UPDATE SET
  "atproto_account_id" = EXCLUDED."atproto_account_id",
  "canonical_handle" = EXCLUDED."canonical_handle",
  "wtf_did" = EXCLUDED."wtf_did",
  "wtf_handle" = EXCLUDED."wtf_handle",
  "wtf_pds_url" = EXCLUDED."wtf_pds_url",
  "status" = EXCLUDED."status",
  "provision_request" = "wtfos_atproto_identities"."provision_request" || EXCLUDED."provision_request",
  "provisioned_at" = COALESCE("wtfos_atproto_identities"."provisioned_at", EXCLUDED."provisioned_at"),
  "last_checked_at" = EXCLUDED."last_checked_at",
  "updated_at" = now();

WITH target_user AS (
  SELECT "id"
    FROM "users"
   WHERE lower("username") = 'cobwebsaints'
   ORDER BY CASE WHEN "username" = 'cobwebsaints' THEN 0 ELSE 1 END, "id"
   LIMIT 1
),
active_account AS (
  SELECT a."id"
    FROM "atproto_accounts" a
    JOIN target_user u ON u."id" = a."user_id"
   WHERE a."disconnected_at" IS NULL
   ORDER BY a."updated_at" DESC, a."id" DESC
   LIMIT 1
)
INSERT INTO "atproto_handle_claims" (
  "user_id",
  "atproto_account_id",
  "did",
  "desired_handle",
  "verification_method",
  "verification_status",
  "proof_token",
  "verified_at",
  "last_checked_at",
  "updated_at"
)
SELECT
  u."id",
  a."id",
  'did:web:cobwebsaints.wtfos.me',
  'cobwebsaints.wtfos.me',
  'wtf_hosted_subdomain',
  'verified',
  'wtfos-cobwebsaints-registration',
  now(),
  now(),
  now()
  FROM target_user u
  LEFT JOIN active_account a ON true
ON CONFLICT ("user_id", "desired_handle") DO UPDATE SET
  "atproto_account_id" = EXCLUDED."atproto_account_id",
  "did" = EXCLUDED."did",
  "verification_method" = EXCLUDED."verification_method",
  "verification_status" = EXCLUDED."verification_status",
  "verified_at" = now(),
  "last_checked_at" = now(),
  "failure_reason" = NULL,
  "updated_at" = now();

WITH target_user AS (
  SELECT "id"
    FROM "users"
   WHERE lower("username") = 'cobwebsaints'
   ORDER BY CASE WHEN "username" = 'cobwebsaints' THEN 0 ELSE 1 END, "id"
   LIMIT 1
),
active_account AS (
  SELECT a."id"
    FROM "atproto_accounts" a
    JOIN target_user u ON u."id" = a."user_id"
   WHERE a."disconnected_at" IS NULL
   ORDER BY a."updated_at" DESC, a."id" DESC
   LIMIT 1
),
active_identity AS (
  SELECT i."id"
    FROM "wtfos_atproto_identities" i
    JOIN target_user u ON u."id" = i."user_id"
   WHERE i."status" = 'active'
     AND i."wtf_did" = 'did:web:cobwebsaints.wtfos.me'
   ORDER BY i."provisioned_at" DESC NULLS LAST, i."id" DESC
   LIMIT 1
),
verified_claim AS (
  SELECT c."id"
    FROM "atproto_handle_claims" c
    JOIN target_user u ON u."id" = c."user_id"
   WHERE c."desired_handle" = 'cobwebsaints.wtfos.me'
     AND c."verification_method" = 'wtf_hosted_subdomain'
     AND c."verification_status" = 'verified'
   ORDER BY c."verified_at" DESC NULLS LAST, c."id" DESC
   LIMIT 1
)
INSERT INTO "wtf_user_sites" (
  "user_id",
  "label",
  "host",
  "status",
  "active_did",
  "active_did_source",
  "atproto_account_id",
  "wtfos_identity_id",
  "atproto_handle_claim_id",
  "proof_grace_until",
  "suspended_at",
  "suspended_reason",
  "created_at",
  "updated_at"
)
SELECT
  u."id",
  'cobwebsaints',
  'cobwebsaints.wtfos.me',
  'draft',
  'did:web:cobwebsaints.wtfos.me',
  'wtf',
  a."id",
  i."id",
  c."id",
  NULL,
  NULL,
  NULL,
  now(),
  now()
  FROM target_user u
  LEFT JOIN active_account a ON true
  LEFT JOIN active_identity i ON true
  LEFT JOIN verified_claim c ON true
ON CONFLICT ("user_id") DO UPDATE SET
  "label" = EXCLUDED."label",
  "host" = EXCLUDED."host",
  "status" = CASE
    WHEN "wtf_user_sites"."status" = 'suspended' THEN 'draft'::"wtf_user_site_status"
    ELSE "wtf_user_sites"."status"
  END,
  "active_did" = EXCLUDED."active_did",
  "active_did_source" = EXCLUDED."active_did_source",
  "atproto_account_id" = EXCLUDED."atproto_account_id",
  "wtfos_identity_id" = EXCLUDED."wtfos_identity_id",
  "atproto_handle_claim_id" = EXCLUDED."atproto_handle_claim_id",
  "proof_grace_until" = NULL,
  "suspended_at" = NULL,
  "suspended_by" = NULL,
  "suspended_reason" = NULL,
  "updated_at" = now();

WITH target_site AS (
  SELECT s."id"
    FROM "wtf_user_sites" s
    JOIN "users" u ON u."id" = s."user_id"
   WHERE lower(u."username") = 'cobwebsaints'
   ORDER BY s."id"
   LIMIT 1
)
INSERT INTO "wtf_user_site_pages" (
  "site_id",
  "slug",
  "title",
  "draft_html",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  'home',
  'Home',
  '<main><h1>cobwebsaints</h1></main>',
  0,
  now(),
  now()
  FROM target_site
ON CONFLICT ("site_id", "slug") DO NOTHING;

WITH target_site AS (
  SELECT s."id", s."user_id"
    FROM "wtf_user_sites" s
    JOIN "users" u ON u."id" = s."user_id"
   WHERE lower(u."username") = 'cobwebsaints'
   ORDER BY s."id"
   LIMIT 1
)
INSERT INTO "wtf_user_site_audit_events" (
  "site_id",
  "actor_user_id",
  "event_type",
  "metadata",
  "created_at"
)
SELECT
  s."id",
  s."user_id",
  'claimed',
  jsonb_build_object(
    'source', '0106_cobwebsaints_registration',
    'host', 'cobwebsaints.wtfos.me',
    'xHandle', 'unitedsaints',
    'bskyHandle', 'cobwebsaints.bsky.social',
    'did', 'did:web:cobwebsaints.wtfos.me',
    'didSource', 'wtf'
  ),
  now()
  FROM target_site s
 WHERE NOT EXISTS (
   SELECT 1
     FROM "wtf_user_site_audit_events" e
    WHERE e."site_id" = s."id"
      AND e."event_type" = 'claimed'
      AND e."metadata" ->> 'source' = '0106_cobwebsaints_registration'
 );

WITH target_user AS (
  SELECT "id"
    FROM "users"
   WHERE lower("username") = 'cobwebsaints'
   ORDER BY CASE WHEN "username" = 'cobwebsaints' THEN 0 ELSE 1 END, "id"
   LIMIT 1
),
primary_wallet AS (
  SELECT w."wallet_address"
    FROM "user_wallets" w
    JOIN target_user u ON u."id" = w."user_id"
   ORDER BY w."is_primary" DESC, w."linked_at", w."id"
   LIMIT 1
)
INSERT INTO "wtf_subdomain_grants" (
  "user_id",
  "label",
  "full_name",
  "parent_domain",
  "status",
  "wallet_address",
  "source_type",
  "notes",
  "metadata",
  "created_at",
  "updated_at",
  "provisioned_at",
  "revoked_at"
)
SELECT
  u."id",
  'cobwebsaints',
  'cobwebsaints.wtf.tez',
  'wtf.tez',
  'provisioned',
  w."wallet_address",
  'cobwebsaints_registration',
  'Seeded by migration 0106 for cobwebsaints full non-admin user registration.',
  jsonb_build_object(
    'source', '0106_cobwebsaints_registration',
    'wtfosHost', 'cobwebsaints.wtfos.me',
    'xHandle', 'unitedsaints',
    'bskyHandle', 'cobwebsaints.bsky.social',
    'role', 'cobwebsaints_full_user'
  ),
  now(),
  now(),
  now(),
  NULL
  FROM target_user u
  LEFT JOIN primary_wallet w ON true
ON CONFLICT ("parent_domain", "label") DO UPDATE SET
  "user_id" = EXCLUDED."user_id",
  "full_name" = EXCLUDED."full_name",
  "status" = EXCLUDED."status",
  "wallet_address" = COALESCE(EXCLUDED."wallet_address", "wtf_subdomain_grants"."wallet_address"),
  "source_type" = EXCLUDED."source_type",
  "notes" = EXCLUDED."notes",
  "metadata" = COALESCE("wtf_subdomain_grants"."metadata", '{}'::jsonb) || EXCLUDED."metadata",
  "updated_at" = now(),
  "provisioned_at" = COALESCE("wtf_subdomain_grants"."provisioned_at", EXCLUDED."provisioned_at"),
  "revoked_at" = NULL;
