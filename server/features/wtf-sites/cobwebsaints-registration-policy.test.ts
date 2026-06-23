import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const migration = readFileSync("drizzle/0106_cobwebsaints_registration.sql", "utf8");

test("cobwebsaints migration seeds a bespoke non-admin full-user role", () => {
  assert.match(migration, /'cobwebsaints_full_user'/);
  assert.match(migration, /'Cobwebsaints Full User'/);
  assert.match(migration, /"is_assignable",\n\s+"updated_at"[\s\S]*false,\n\s+false,\n\s+now\(\)/);
  assert.match(migration, /\('trusted_arcade_creator', true\)/);
  assert.match(migration, /\('trusted_console_creator', true\)/);
  assert.match(migration, /\('trusted_tv_creator', true\)/);
  assert.match(migration, /\('trusted_market_creator', true\)/);
  assert.match(migration, /\('use_wtfos_pinning', true\)/);
  assert.match(migration, /\('access_admin_panel', false\)/);
  assert.match(migration, /\('manage_roles', false\)/);
  assert.match(migration, /\('pin_threads', false\)/);
  assert.doesNotMatch(migration, /\('access_admin_panel', true\)/);
  assert.doesNotMatch(migration, /\('manage_roles', true\)/);
});

test("cobwebsaints migration sets verified social handles without fake X OAuth", () => {
  assert.match(migration, /"twitter_handle" = 'unitedsaints'/);
  assert.match(migration, /"twitter_verified" = true/);
  assert.match(migration, /"twitter_public" = true/);
  assert.match(migration, /"atproto_accounts"/);
  assert.match(migration, /'cobwebsaints.bsky.social'/);
  assert.match(migration, /'did:plc:hlwiidixnd2bcc65tkvsmfs2'/);
  assert.match(migration, /'https:\/\/stropharia\.us-west\.host\.bsky\.network'/);
  assert.doesNotMatch(migration, /"twitter_oauth_token" =/);
  assert.doesNotMatch(migration, /"twitter_oauth2_access_token" =/);
});

test("cobwebsaints migration fully registers the WTF site, DID, handle, and wtf.tez grant", () => {
  for (const table of [
    "roles",
    "role_permissions",
    "user_roles",
    "atproto_accounts",
    "wtfos_atproto_identities",
    "atproto_handle_claims",
    "wtf_user_sites",
    "wtf_user_site_pages",
    "wtf_user_site_audit_events",
    "wtf_subdomain_grants",
  ]) {
    assert.match(migration, new RegExp(`"${table}"`));
  }

  assert.match(migration, /'cobwebsaints.wtfos.me'/);
  assert.match(migration, /'did:web:cobwebsaints\.wtfos\.me'/);
  assert.match(migration, /'https:\/\/pds\.wtfos\.me'/);
  assert.match(migration, /'wtf_hosted_subdomain'/);
  assert.match(migration, /'verified'/);
  assert.match(migration, /'wtf'/);
  assert.match(migration, /'cobwebsaints.wtf.tez'/);
  assert.match(migration, /'wtf.tez'/);
  assert.match(migration, /'provisioned'/);
  assert.match(migration, /RAISE EXCEPTION 'cobwebsaints/);
});
