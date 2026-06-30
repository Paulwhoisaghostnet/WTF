import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const myVideosSource = readFileSync(new URL("./MyVideos.tsx", import.meta.url), "utf8");
const channelBucketsSource = readFileSync(
  new URL("../features/media-library/MyVideoChannelBuckets.tsx", import.meta.url),
  "utf8"
);
const bumperTogglesSource = readFileSync(
  new URL("../features/media-library/BumperAssignmentToggles.tsx", import.meta.url),
  "utf8"
);

test("MyVideos exposes Gamma host markers for app-owned video chrome", () => {
  assert.match(myVideosSource, /usePresentationShell/);
  assert.match(myVideosSource, /data-my-videos-presentation-host=\{presentation\.host\}/);
  assert.match(myVideosSource, /\[data-my-videos-presentation-host="gamma"\]/);
  assert.match(myVideosSource, /data-my-videos-region="library-grid"/);
  assert.match(myVideosSource, /data-my-videos-region="media-card"/);
  assert.match(myVideosSource, /data-my-videos-region="media-thumb"/);
  assert.match(myVideosSource, /data-my-videos-region="bumper-wrap"/);
  assert.match(myVideosSource, /data-my-videos-region="upload-area"/);
  assert.match(myVideosSource, /\[data-my-videos-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(myVideosSource, /\[data-my-videos-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(myVideosSource, /\[data-my-videos-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
  assert.match(myVideosSource, /#00d2ff/);
});

test("MyVideos channel and bumper panels inherit the Gamma host instead of owning classic cards", () => {
  assert.match(channelBucketsSource, /\[data-my-videos-presentation-host="gamma"\]/);
  assert.match(channelBucketsSource, /data-my-videos-region="channel-media-card"/);
  assert.match(channelBucketsSource, /data-my-videos-region="channel-media-thumb"/);
  assert.match(channelBucketsSource, /data-my-videos-region="channel-grid"/);
  assert.match(channelBucketsSource, /data-my-videos-region="community-bumper-grid"/);
  assert.match(channelBucketsSource, /border-radius:\s*6px/);
  assert.match(bumperTogglesSource, /\[data-my-videos-presentation-host="gamma"\]/);
  assert.match(bumperTogglesSource, /data-my-videos-region="bumper-toggle"/);
  assert.match(bumperTogglesSource, /accent-color:\s*#d6ff3f/);
});

test("MyVideos keeps media, token, TV channel, bumper, and delete behavior on shared APIs", () => {
  assert.match(myVideosSource, /api\.get<MediaItem\[\]>\("\/api\/media\/mine\?category=video"\)/);
  assert.match(myVideosSource, /api\.get<\{ items: OwnedToken\[\] \}>\("\/api\/profile\/tokens\?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=true"\)/);
  assert.match(myVideosSource, /api\.post\("\/api\/media\/import-token", \{ \.\.\.body, mediaCategory: "video" \}\)/);
  assert.match(myVideosSource, /api\.post\("\/api\/media\/upload", \{ \.\.\.body, mediaCategory: "video" \}\)/);
  assert.match(myVideosSource, /api\.get<TVChannelLite\[\]>\("\/api\/tv\/channels\?mine=1"\)/);
  assert.match(myVideosSource, /api\.get<TVBumperLite\[\]>\("\/api\/tv\/bumpers"\)/);
  assert.match(myVideosSource, /api\.put<TVBumperLite \| \{ ok: boolean \}>\(\s*`\/api\/tv\/media\/\$\{mediaItemId\}\/bumper`/);
  assert.match(myVideosSource, /api\.delete\(`\/api\/media\/\$\{id\}`\)/);
  assert.doesNotMatch(myVideosSource, /presentationRouteHref/);
});
