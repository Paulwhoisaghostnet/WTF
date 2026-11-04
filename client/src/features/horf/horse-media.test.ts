import assert from "node:assert/strict";
import test from "node:test";
import { resolveHorfHorseArt, resolveHorfHorseVideo } from "./horse-media";

test("tokens with one Objkt collection thumbnail use distinct image artifacts", () => {
  const shared = "ipfs://QmCollectionThumbnail";
  const first = resolveHorfHorseArt({ image: shared, artifactUri: "ipfs://QmFirstHorse", mime: "image/png" });
  const second = resolveHorfHorseArt({ image: shared, artifactUri: "ipfs://QmSecondHorse", mime: "image/jpeg" });
  assert.match(first?.src || "", /^\/api\/cache\/artifact\?/);
  assert.notEqual(first?.src, second?.src);
  assert.ok(first?.fallbackCandidates?.some((url) => url.includes("QmCollectionThumbnail")));
});

test("video horse previews use the artifact route without treating video as an image", () => {
  const horse = { image: "ipfs://QmCollectionThumbnail", artifactUri: "ipfs://QmHorseVideo", mime: "video/mp4" };
  assert.match(resolveHorfHorseVideo(horse)?.src || "", /^\/api\/cache\/artifact\?/);
  assert.match(resolveHorfHorseArt(horse)?.src || "", /^\/api\/cache\/media\?/);
});
