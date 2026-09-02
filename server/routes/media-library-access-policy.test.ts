import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mediaRoutes = readFileSync("server/routes/media-library.ts", "utf8");
const tvPlaybackRoutes = readFileSync("server/features/tv/playback-routes.ts", "utf8");
const tvBumperRoutes = readFileSync("server/features/tv/bumper-routes.ts", "utf8");
const tvStreamSnapshot = readFileSync("server/features/tv/stream-snapshot.ts", "utf8");
const tvCacheRoutes = readFileSync("server/features/tv/cache-routes.ts", "utf8");
const appRoutes = readFileSync("server/app.ts", "utf8");

function routeBody(path: string): string {
  const start = mediaRoutes.indexOf(`router.get("${path}", isAuthenticated`);
  assert.notEqual(start, -1, `${path} must require isAuthenticated`);
  const next = mediaRoutes.indexOf("\nrouter.", start + 1);
  return mediaRoutes.slice(start, next === -1 ? undefined : next);
}

test("private media library item metadata requires owner or staff access", () => {
  const body = routeBody("/api/media/:id");
  assert.match(
    body,
    /canAccessMediaLibraryItem\(item, user\)/,
    "metadata lookup must not disclose arbitrary media-library rows to any logged-in user"
  );
  assert.match(body, /return res\.status\(403\)\.json\(\{ error: "Not authorized" \}\)/);
});

test("private upload bytes require auth and owner or staff access", () => {
  const body = routeBody("/api/media/:id/file");
  assert.match(body, /item\.sourceType !== "upload"/);
  assert.match(
    body,
    /canAccessMediaLibraryItem\(item, user\)/,
    "file serving must verify ownership before handing off to object storage or hot cache"
  );
  assert.match(body, /serveStoredMediaFile\(req, res, item\)/);
});

test("private media file playback has a dedicated limiter despite stream bypass", () => {
  assert.match(
    appRoutes,
    /MEDIA_RATE_LIMIT_BYPASS_PATTERNS[\s\S]*\^\\\/api\\\/media\\\/\\d\+\\\/file/,
    "private media file playback may bypass the generic API limiter for range playback"
  );
  assert.match(
    appRoutes,
    /\/\^\\\/api\\\/media\\\/\\d\+\\\/file\$\/[\s\S]*max:\s*600/,
    "private media file playback must still have a dedicated high-ceiling limiter"
  );
  assert.match(
    appRoutes,
    /"\/api\/media\/import-token"[\s\S]*max:\s*60/,
    "media import writes should have a tighter route-specific limiter than generic API traffic"
  );
  assert.match(
    appRoutes,
    /"\/api\/media\/upload"[\s\S]*keyGenerator:\s*sessionOrIpRateLimitKey/,
    "media upload limits should be keyed by session user before falling back to IP"
  );
});

test("write-heavy media routes cannot inherit read-only playback rate-limit bypasses", () => {
  assert.match(
    appRoutes,
    /const MEDIA_RATE_LIMIT_BYPASS_PREFIXES: readonly string\[\] = \[\]/,
    "broad path prefixes must not exempt media writes from the generic API limiter"
  );
  assert.match(
    appRoutes,
    /if \(method !== "GET" && method !== "HEAD"\) \{\s*return false;\s*\}/,
    "only GET and HEAD requests may match the playback bypass patterns"
  );
  assert.match(
    appRoutes,
    /"\/api\/tv\/cache\/prefetch"[\s\S]*name: "tv-cache-prefetch"[\s\S]*max: 12/,
    "TV cache writes must retain their dedicated limiter"
  );
  assert.match(
    appRoutes,
    /"\/api\/media\/upload"[\s\S]*name: "media-upload"[\s\S]*max: 20/,
    "media uploads must retain their dedicated limiter"
  );
});

test("TV cache prefetch requires authentication before it can schedule downloads", () => {
  assert.match(
    tvCacheRoutes,
    /router\.post\("\/api\/tv\/cache\/prefetch", isAuthenticated/,
    "anonymous viewers must not be able to trigger cache downloads"
  );
  assert.match(
    tvCacheRoutes,
    /for \(const value of raw\.slice\(0, 10\)\)/,
    "one authenticated request must retain the existing bounded URL batch"
  );
  assert.match(tvCacheRoutes, /for \(const uri of uris\) prefetchMediaAsync\(uri\)/);
});

test("public TV playback uses channel-scoped media routes, not raw library IDs", () => {
  assert.match(
    tvPlaybackRoutes,
    /router\.get\("\/api\/tv\/channels\/:channelId\/media\/:mediaItemId\/file"/,
    "TV playback should use a channel-scoped media route"
  );
  assert.match(
    tvPlaybackRoutes,
    /canViewChannel\(channel, viewer \?\? null, \{ isStaff: viewerIsStaff \}\)/,
    "channel-scoped media playback must respect public/private channel visibility"
  );
  assert.match(
    tvPlaybackRoutes,
    /eq\(tvChannelVideos\.channelId, channelId\)[\s\S]*eq\(tvChannelVideos\.mediaItemId, mediaItemId\)/,
    "channel playback must prove the media item belongs to that channel"
  );
  assert.doesNotMatch(
    tvPlaybackRoutes,
    /\/api\/media\/:id\/file/,
    "TV playback routes must not re-expose the raw media-library file endpoint"
  );
});

test("personal TV bumper media requires owner, staff, or visible channel context", () => {
  assert.match(
    tvBumperRoutes,
    /r\.category === BUMPER_CATEGORY_PERSONAL && ownerUserId !== null[\s\S]*channelId=\$\{channelId\}/,
    "bumper pool should return channel-bound URLs for channel-owner personal bumpers"
  );
  assert.match(
    tvBumperRoutes,
    /bumper\.category === BUMPER_CATEGORY_PERSONAL[\s\S]*ownerOrStaff/,
    "personal bumper media must not be a raw public id lookup"
  );
  assert.match(
    tvBumperRoutes,
    /channel\.ownerUserId !== bumper\.ownerUserId[\s\S]*canViewChannel\(channel, viewer \?\? null, \{ isStaff: viewerIsStaff \}\)/,
    "personal bumper media must be scoped to a visible channel owned by the bumper owner"
  );
  assert.match(
    tvStreamSnapshot,
    /\/api\/tv\/bumpers\/\$\{(?:b|bumper)\.id\}\/media\?channelId=\$\{channelId\}/,
    "server-built stream bumper URLs should carry channel context for playback"
  );
});
