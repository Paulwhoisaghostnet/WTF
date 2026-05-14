import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mediaRoutes = readFileSync("server/routes/media-library.ts", "utf8");
const tvPlaybackRoutes = readFileSync("server/features/tv/playback-routes.ts", "utf8");
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
