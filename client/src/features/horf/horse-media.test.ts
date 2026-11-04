import assert from "node:assert/strict";
import test from "node:test";
import { resolveHorfHorseArt, resolveHorfHorseCardArt, resolveHorfHorseVideo, uniqueHorfThumbnailIdentities } from "./horse-media";

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

test("card previews use unique Objkt thumbnails and reserve exact artifacts for shared thumbnails", () => {
  const horses = [
    { contract: "KT1Horse", tokenId: "1", image: "ipfs://QmSharedThumbnail", artifactUri: "ipfs://QmExactFirst", mime: "image/png" },
    { contract: "KT1Horse", tokenId: "2", image: "https://nftstorage.link/ipfs/QmSharedThumbnail", artifactUri: "ipfs://QmExactSecond", mime: "image/png" },
    { contract: "KT1Horse", tokenId: "3", image: "ipfs://QmUniqueThumbnail", artifactUri: "ipfs://QmLargeArtifact", mime: "image/jpeg" },
  ];
  const unique = uniqueHorfThumbnailIdentities(horses);
  const first = resolveHorfHorseCardArt(horses[0], unique);
  const second = resolveHorfHorseCardArt(horses[1], unique);
  const third = resolveHorfHorseCardArt(horses[2], unique);
  assert.match(first?.src || "", /^\/api\/cache\/artifact\?/);
  assert.match(second?.src || "", /^\/api\/cache\/artifact\?/);
  assert.notEqual(first?.src, second?.src);
  assert.match(third?.src || "", /^\/api\/cache\/media\?/);
  assert.ok(third?.fallbackCandidates?.some((url) => url.includes("QmLargeArtifact")));
});
