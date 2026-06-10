import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeExternalTvEmbedUrl,
  resolveTvPlayableMedia,
} from "./media-urls";

test("normalizeExternalTvEmbedUrl converts Odysee watch URLs to iframe embed URLs", () => {
  assert.equal(
    normalizeExternalTvEmbedUrl("https://odysee.com/@RogerRadio:f/LIVE:922"),
    "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922"
  );
});

test("normalizeExternalTvEmbedUrl keeps safe Odysee embed URLs with query params", () => {
  assert.equal(
    normalizeExternalTvEmbedUrl(
      "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922?autoplay=true"
    ),
    "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922?autoplay=true"
  );
});

test("normalizeExternalTvEmbedUrl rejects non-Odysee and insecure iframe targets", () => {
  assert.equal(normalizeExternalTvEmbedUrl("http://odysee.com/@RogerRadio:f/LIVE:922"), null);
  assert.equal(
    normalizeExternalTvEmbedUrl("https://example.com/$/embed/@RogerRadio:f/LIVE:922"),
    null
  );
});

test("resolveTvPlayableMedia keeps external embeds direct and out of the media cache", () => {
  const resolved = resolveTvPlayableMedia(
    "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922?autoplay=true",
    "text/html"
  );

  assert.equal(resolved.kind, "embed");
  assert.equal(
    resolved.sourceUri,
    "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922?autoplay=true"
  );
  assert.equal(resolved.cacheUrl, resolved.sourceUri);
});

test("resolveTvPlayableMedia still routes normal video sources through the TV cache", () => {
  const resolved = resolveTvPlayableMedia("https://media.example/video.mp4", "video/mp4");

  assert.equal(resolved.kind, "video");
  assert.equal(resolved.sourceUri, "https://media.example/video.mp4");
  assert.equal(
    resolved.cacheUrl,
    "/api/tv/cache/media?url=https%3A%2F%2Fmedia.example%2Fvideo.mp4"
  );
});
