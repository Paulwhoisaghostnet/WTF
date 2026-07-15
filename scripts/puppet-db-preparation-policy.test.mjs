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
