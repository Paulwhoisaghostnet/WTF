import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/lib/tv-boot-backfill.ts", "utf8");

function rogerBackfillBlock(): string {
  const start = source.indexOf("// 6) Roger Radio live Odysee channel.");
  const end = source.indexOf("// 7) Dial-number pins.");
  assert.notEqual(start, -1, "Roger Radio backfill block must exist");
  assert.notEqual(end, -1, "dial pin block must follow Roger Radio backfill");
  return source.slice(start, end);
}

test("Roger Radio seed casts jsonb_build_object parameters to text", () => {
  const block = rogerBackfillBlock();

  assert.match(block, /source_uri,\s+mime_type,[\s\S]*\$2::text,\s+'text\/html'/);
  assert.match(block, /'pageUrl',\s+\$5::text/);
  assert.match(block, /'embedUrl',\s+\$2::text/);
});

test("Roger Radio seed repairs a partial channel before dial assignment", () => {
  const block = rogerBackfillBlock();

  const existingChannel = block.indexOf("existingRoger.rows.length > 0");
  const existingPlaylist = block.indexOf("rogerPlaylistRes.rows.length > 0");
  const videoSync = block.indexOf("const rogerVideo = await client.query");
  const playlistItemSync = block.indexOf("results[\"roger_playlist.item_synced\"] = 1");

  assert.notEqual(existingChannel, -1, "partial existing channel must be reused");
  assert.notEqual(existingPlaylist, -1, "partial existing playlist must be reused");
  assert.ok(existingChannel < videoSync, "video sync must run after existing channel lookup");
  assert.ok(existingPlaylist < videoSync, "video sync must run after existing playlist lookup");
  assert.ok(videoSync < playlistItemSync, "playlist item sync must follow video sync");
});
