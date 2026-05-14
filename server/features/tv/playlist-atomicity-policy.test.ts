import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const playlistRoutes = readFileSync("server/features/tv/playlist-routes.ts", "utf8");
const channelRoutes = readFileSync("server/features/tv/channel-routes.ts", "utf8");
const wtfTvAdminRoutes = readFileSync("server/features/admin/wtf-tv-routes.ts", "utf8");
const schemaTv = readFileSync("shared/schema-tv.ts", "utf8");
const migration = readFileSync("drizzle/0043_tv_concurrency_guards.sql", "utf8");
const playlistSelection = readFileSync("server/features/tv/playlist-selection.ts", "utf8");
const playbackRoutes = readFileSync("server/features/tv/playback-routes.ts", "utf8");
const liveRoutes = readFileSync("server/features/tv/live-routes.ts", "utf8");

test("TV playlists enforce one active playlist at schema and migration layers", () => {
  assert.match(schemaTv, /uniqueIndex\("tv_playlist_one_active_per_channel_idx"\)/);
  assert.match(
    schemaTv,
    /where\(sql`\$\{table\.isActive\} = true`\)/,
    "schema should declare the partial unique active-playlist invariant"
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX tv_playlist_one_active_per_channel_idx[\s\S]*WHERE is_active = true/,
    "production migration should enforce one active playlist per channel"
  );
});

test("TV channel creation cannot commit without its initial active playlist", () => {
  assert.match(
    channelRoutes,
    /const \{ channel, playlist \} = await db\.transaction\(async \(tx\) => \{/,
    "user channel and initial playlist should be created in one transaction"
  );
  assert.match(
    channelRoutes,
    /tx[\s\S]*\.insert\(tvChannels\)[\s\S]*tx[\s\S]*\.insert\(tvPlaylists\)/,
    "the transaction should own both channel and playlist inserts"
  );
  assert.match(
    wtfTvAdminRoutes,
    /const \{ channel, config \} = await db\.transaction\(async \(tx\) => \{/,
    "WTF TV initialize should atomically create channel, playlist, and config"
  );
});

test("TV playlist edits preserve canonical active and replacement semantics", () => {
  assert.match(
    playlistRoutes,
    /req\.body\?\.isActive === false[\s\S]*A channel must keep one active playlist/,
    "playlist API should reject direct active-playlist deactivation"
  );
  assert.match(
    playlistRoutes,
    /function duplicateIds\(ids: number\[\]\)/,
    "playlist replacement should reject duplicate video ids before touching rows"
  );
  assert.match(
    playlistRoutes,
    /const duplicates = duplicateIds\(videoIds\);[\s\S]*Playlist cannot contain duplicate video ids/,
    "duplicates should fail as a client error instead of reaching the unique index"
  );
  assert.match(
    playlistRoutes,
    /await db\.transaction\(async \(tx\) => \{[\s\S]*await lockTvChannelRow\(tx, playlist\.channelId\);[\s\S]*delete\(tvPlaylistItems\)[\s\S]*insert\(tvPlaylistItems\)/,
    "playlist replacement should lock the channel and swap rows inside one transaction"
  );
});

test("TV public playback resolves scheduled playlists through one channel-scoped selector", () => {
  assert.match(
    playlistSelection,
    /innerJoin\(\s*tvPlaylists,[\s\S]*eq\(tvScheduleEntries\.playlistId, tvPlaylists\.id\)[\s\S]*eq\(tvPlaylists\.channelId, channelId\)/,
    "scheduled playlist lookup must prove the playlist belongs to the requested channel"
  );
  assert.match(
    playlistSelection,
    /eq\(tvScheduleEntries\.channelId, channelId\)/,
    "scheduled playlist lookup must also scope the schedule entry to the requested channel"
  );
  assert.match(
    playlistSelection,
    /eq\(tvPlaylists\.channelId, channelId\)[\s\S]*eq\(tvPlaylists\.isActive, true\)/,
    "active fallback must be channel scoped"
  );
  assert.doesNotMatch(
    playbackRoutes,
    /where\(eq\(tvPlaylists\.id, resolvedPlaylistId\)\)/,
    "stream route must not load scheduled playlists by id alone"
  );
  assert.match(playbackRoutes, /resolveTvPlaylistForChannel/);
  assert.match(liveRoutes, /resolveTvPlaylistForChannel/);
});
