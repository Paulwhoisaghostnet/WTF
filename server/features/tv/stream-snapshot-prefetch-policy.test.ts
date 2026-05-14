import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const streamSnapshot = readFileSync(
  "server/features/tv/stream-snapshot.ts",
  "utf8"
);
const cacheRuntime = readFileSync("server/features/tv/cache-runtime.ts", "utf8");
const channelRoutes = readFileSync("server/features/tv/channel-routes.ts", "utf8");
const playlistRoutes = readFileSync("server/features/tv/playlist-routes.ts", "utf8");
const backgroundJobs = readFileSync("server/lib/background-jobs.ts", "utf8");

test("public TV stream snapshot build does not trigger cache prefetch downloads", () => {
  assert.doesNotMatch(
    streamSnapshot,
    /prefetchMediaAsync/,
    "public /api/tv/channels/:id/stream must not fire background media downloads"
  );
  assert.match(
    streamSnapshot,
    /Cache warming is deliberately handled\s+\/\/ by scheduler\/authenticated mutation paths/,
    "stream snapshot should document why read-path cache warming is absent"
  );
});

test("TV cache warming remains available from bounded internal or authenticated paths", () => {
  assert.match(cacheRuntime, /export function prefetchMediaAsync/);
  assert.match(channelRoutes, /prefetchMediaAsync/);
  assert.match(playlistRoutes, /warmChannelAsync/);
  assert.match(backgroundJobs, /name:\s*"tv-cache-warm"/);
});
