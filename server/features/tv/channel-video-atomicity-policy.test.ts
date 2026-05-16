import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("TV channel-video inserts are backed by channel-scoped unique keys", () => {
  const schema = readFileSync("shared/schema-tv.ts", "utf8");

  assert.match(schema, /uniqueIndex\("tv_video_unique_token_per_channel_idx"\)\.on\(\s*table\.channelId,\s*table\.tokenContract,\s*table\.tokenId\s*\)/);
  assert.match(schema, /uniqueIndex\("tv_channel_videos_channel_media_unique_idx"\)\.on\(\s*table\.channelId,\s*table\.mediaItemId\s*\)/);
});

test("TV channel-video add route uses insert-first upsert for media and token identity", () => {
  const route = readFileSync("server/features/tv/channel-routes.ts", "utf8");

  assert.match(route, /\.insert\(tvChannelVideos\)\s*\.values\(videoValues\)\s*\.onConflictDoUpdate\(\{\s*target: \[tvChannelVideos\.channelId, tvChannelVideos\.mediaItemId\]/);
  assert.match(route, /targetWhere: sql`\$\{tvChannelVideos\.mediaItemId\} IS NOT NULL`/);
  assert.match(route, /\.insert\(tvChannelVideos\)\s*\.values\(videoValues\)\s*\.onConflictDoUpdate\(\{\s*target: \[\s*tvChannelVideos\.channelId,\s*tvChannelVideos\.tokenContract,\s*tvChannelVideos\.tokenId,\s*\]/);
  assert.doesNotMatch(route, /select\(\{ id: tvChannelVideos\.id \}\)[\s\S]{0,400}\.insert\(tvChannelVideos\)/);
});

test("TV channel-video add route recovers alternate-key unique races idempotently", () => {
  const route = readFileSync("server/features/tv/channel-routes.ts", "utf8");
  const service = readFileSync("server/features/tv/channel-service.ts", "utf8");

  assert.match(route, /isUniqueConstraintError\(err, "tv_video_unique_token_per_channel_idx"\)/);
  assert.match(route, /isUniqueConstraintError\(err, "tv_channel_videos_channel_media_unique_idx"\)/);
  assert.match(route, /findExistingChannelVideo\(\s*db,\s*channelId,\s*resolvedMediaItemId,\s*effectiveTokenContract,\s*effectiveTokenId\s*\)/);
  assert.match(route, /\.update\(tvChannelVideos\)\s*\.set\(videoUpdateValues\)/);
  assert.match(service, /eq\(tvChannelVideos\.channelId, channelId\)[\s\S]*eq\(tvChannelVideos\.mediaItemId, mediaItemId\)/);
  assert.match(service, /eq\(tvChannelVideos\.channelId, channelId\)[\s\S]*eq\(tvChannelVideos\.tokenContract, tokenContract\)[\s\S]*eq\(tvChannelVideos\.tokenId, tokenId\)/);
});

test("TV active-playlist attachment remains idempotent after channel-video upsert", () => {
  const route = readFileSync("server/features/tv/channel-routes.ts", "utf8");

  assert.match(route, /\.insert\(tvPlaylistItems\)\s*\.values\(\{[\s\S]*videoId: videoRow\.id[\s\S]*\}\)\s*\.onConflictDoNothing\(\)/);
});
