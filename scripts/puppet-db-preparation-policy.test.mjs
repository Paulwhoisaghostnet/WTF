import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const preparationSource = await readFile(
  new URL("../tests/e2e/puppets/prepare-local-db.ts", import.meta.url),
  "utf8"
);

test("local puppet DB preparation includes desktop localization schema", () => {
  assert.match(
    preparationSource,
    /"drizzle\/0108_user_desktop_localization\.sql"/,
    "live puppet traffic reads user_desktop_settings.localization, so the local DB bootstrap must apply migration 0108"
  );
});

test("local puppet DB preparation includes the persistent TzKT response cache", () => {
  assert.match(
    preparationSource,
    /"drizzle\/0081_tzkt_response_cache\.sql"/,
    "live puppet Tezos workflows must exercise the persistent response cache instead of silently degrading to memory-only caching"
  );
});

test("local puppet DB preparation includes durable Horf discovery and nonhorse decisions", async () => {
  for (const migration of ["0154_horf_open_range_page_cache.sql", "0155_horf_nonhorse_reports.sql"]) {
    assert.match(preparationSource, new RegExp(`"drizzle/${migration.replaceAll(".", "\\.")}"`));
  }
  const reportsMigration = await readFile(
    new URL("../drizzle/0155_horf_nonhorse_reports.sql", import.meta.url), "utf8"
  );
  assert.match(reportsMigration, /CREATE TABLE public\.horf_token_nonhorse_decisions/);
  assert.match(preparationSource, /to_regclass\(\$1\).*public\.horf_token_nonhorse_decisions/);
});

test("local puppet DB preparation includes private Horf trade messages", async () => {
  assert.match(preparationSource, /"drizzle\/0156_horf_trade_offer_messages\.sql"/);
  const migration = await readFile(
    new URL("../drizzle/0156_horf_trade_offer_messages.sql", import.meta.url), "utf8"
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.horf_trade_offer_messages/);
  assert.match(migration, /horf_trade_offer_messages_active_uq/);
  assert.match(migration, /status NOT IN \('accepted', 'fulfilled'\)/);
});

test("local puppet DB preparation includes verified V3 room settlements", async () => {
  assert.match(preparationSource, /"drizzle\/0157_horf_room_settlements\.sql"/);
  const migration = await readFile(
    new URL("../drizzle/0157_horf_room_settlements.sql", import.meta.url), "utf8"
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.horf_room_settlement_events/);
  assert.match(migration, /PRIMARY KEY \(contract_address, tzkt_event_id\)/);
});

test("local puppet DB preparation includes current WTF LIVE room schemas", () => {
  for (const migration of [
    "0097_wtf_live_rooms.sql",
    "0099_wtf_live_private_rooms.sql",
    "0100_wtf_live_tip_items.sql",
    "0103_wtf_live_soundboard_clips.sql",
    "0109_wtf_live_stage_roles.sql",
    "0110_wtf_live_smart_rooms.sql",
    "0111_wtf_live_game_rooms.sql",
    "0112_wtf_live_game_room_settings_repair.sql",
  ]) {
    assert.match(
      preparationSource,
      new RegExp(`"drizzle/${migration.replaceAll(".", "\\.")}"`),
      `live puppet room traffic requires ${migration}`
    );
  }
});

test("local puppet DB preparation includes the wallet auth proof-binding schema", async () => {
  assert.match(
    preparationSource,
    /"drizzle\/0125_wallet_auth_proof_binding\.sql"/,
    "wallet login actor traffic reads nonce origin and action, so puppet DB setup must apply migration 0125"
  );
  const migration = await readFile(
    new URL("../drizzle/0125_wallet_auth_proof_binding.sql", import.meta.url),
    "utf8"
  );
  for (const column of ["origin", "action"]) {
    assert.match(
      migration,
      new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`),
      `migration 0125 must add wallet_auth_nonces.${column}`
    );
  }
});
