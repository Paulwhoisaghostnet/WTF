import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { paginationMeta, parseBoundedQueryInt } from "./pagination";

const channelRoutes = readFileSync("server/features/tv/channel-routes.ts", "utf8");

test("TV pagination helper clamps invalid, low, and high query values", () => {
  assert.equal(parseBoundedQueryInt(undefined, 25, { min: 1, max: 50 }), 25);
  assert.equal(parseBoundedQueryInt("abc", 25, { min: 1, max: 50 }), 25);
  assert.equal(parseBoundedQueryInt("-10", 25, { min: 1, max: 50 }), 1);
  assert.equal(parseBoundedQueryInt("9999", 25, { min: 1, max: 50 }), 50);
  assert.equal(parseBoundedQueryInt("12.9", 25, { min: 1, max: 50 }), 12);
});

test("TV pagination metadata exposes total, window, and hasMore", () => {
  assert.deepEqual(paginationMeta(101, 50, 0), {
    total: 101,
    limit: 50,
    offset: 0,
    hasMore: true,
  });
  assert.deepEqual(paginationMeta(101, 50, 100), {
    total: 101,
    limit: 50,
    offset: 100,
    hasMore: false,
  });
});

test("TV channel list route enforces bounded DB pagination and response headers", () => {
  assert.match(channelRoutes, /const TV_CHANNEL_LIST_DEFAULT_LIMIT = 100;/);
  assert.match(channelRoutes, /const TV_CHANNEL_LIST_MAX_LIMIT = 200;/);
  assert.match(
    channelRoutes,
    /router\.get\("\/api\/tv\/channels"[\s\S]*parseBoundedQueryInt\([\s\S]*req\.query\.limit[\s\S]*TV_CHANNEL_LIST_DEFAULT_LIMIT[\s\S]*max: TV_CHANNEL_LIST_MAX_LIMIT[\s\S]*\.limit\(limit\)[\s\S]*\.offset\(offset\)/,
    "channel list should apply bounded limit and offset to the DB query"
  );
  for (const header of [
    "X-WTF-Total-Count",
    "X-WTF-Limit",
    "X-WTF-Offset",
    "X-WTF-Has-More",
  ]) {
    assert.match(channelRoutes, new RegExp(header));
  }
  assert.match(
    channelRoutes,
    /if \(includeMeta\) \{[\s\S]*res\.json\(\{ items: rows, pagination: meta \}\)/,
    "channel list should expose pagination metadata when requested"
  );
});

test("TV channel detail route bounds videos, playlists, and playlist items in SQL", () => {
  for (const constant of [
    "TV_CHANNEL_DETAIL_DEFAULT_VIDEO_LIMIT",
    "TV_CHANNEL_DETAIL_MAX_VIDEO_LIMIT",
    "TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_LIMIT",
    "TV_CHANNEL_DETAIL_MAX_PLAYLIST_LIMIT",
    "TV_CHANNEL_DETAIL_DEFAULT_PLAYLIST_ITEM_LIMIT",
    "TV_CHANNEL_DETAIL_MAX_PLAYLIST_ITEM_LIMIT",
  ]) {
    assert.match(channelRoutes, new RegExp(`const ${constant} = \\d+;`));
  }
  for (const queryName of [
    "videoLimit",
    "videoOffset",
    "playlistLimit",
    "playlistOffset",
    "playlistItemLimit",
    "playlistItemOffset",
  ]) {
    assert.match(channelRoutes, new RegExp(`req\\.query\\.${queryName}`));
  }
  assert.match(channelRoutes, /\.limit\(videoLimit\)[\s\S]*\.offset\(videoOffset\)/);
  assert.match(channelRoutes, /\.limit\(playlistLimit\)[\s\S]*\.offset\(playlistOffset\)/);
  assert.match(channelRoutes, /\.limit\(playlistItemLimit\)[\s\S]*\.offset\(playlistItemOffset\)/);
  assert.match(
    channelRoutes,
    /const pagination = \{[\s\S]*videos: paginationMeta[\s\S]*playlists: paginationMeta[\s\S]*playlistItems:/,
    "channel detail should return pagination metadata for every bounded collection"
  );
});
