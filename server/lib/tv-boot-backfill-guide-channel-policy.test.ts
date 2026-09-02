import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/lib/tv-boot-backfill.ts", "utf8");

function guideChannelBlock(): string {
  const start = source.indexOf("// 6b) Official wtfOS learning channel.");
  const end = source.indexOf("// 7) Dial-number pins.");
  assert.notEqual(start, -1, "Guide TV backfill block must exist");
  assert.notEqual(end, -1, "dial pin block must follow Guide TV backfill");
  return source.slice(start, end);
}

test("Guide TV disables unrelated bumpers and schedules", () => {
  const block = guideChannelBlock();
  assert.match(block, /videos_per_bumper = 0/);
  assert.match(block, /DELETE FROM tv_schedule_entries WHERE channel_id = \$1/);
});

test("Guide TV reconciles the channel to only catalog videos", () => {
  const block = guideChannelBlock();
  assert.match(block, /const guideCatalog = getWtfosGuideTvCatalog\(\)/);
  assert.match(block, /DELETE FROM tv_playlists WHERE channel_id = \$1 AND id <> \$2/);
  assert.match(block, /DELETE FROM tv_playlist_items[\s\S]*NOT \(video_id = ANY\(\$2::int\[\]\)\)/);
  assert.match(block, /DELETE FROM tv_channel_videos[\s\S]*NOT \(id = ANY\(\$2::int\[\]\)\)/);
  assert.match(block, /entry\.tokenContract/);
  assert.match(block, /accountName: entry\.accountName/);
  assert.match(block, /const playlistDurationSeconds = Math\.ceil\(entry\.durationSeconds\)/);
  assert.match(block, /entry\.sortOrder, playlistDurationSeconds/);
});
