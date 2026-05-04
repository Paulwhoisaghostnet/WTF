import assert from "node:assert/strict";
import test from "node:test";

import {
  readTvOverlayOverride,
  resolveTvOverlayMetadata,
  writeTvOverlayOverride,
} from "./tv-overlay-metadata";

test("resolveTvOverlayMetadata prefers human creator fields over Tezos addresses", () => {
  const resolved = resolveTvOverlayMetadata({
    metadata: {
      creators: ["tz1burnburnburnburnburnburnburjAYjjX"],
      artist: "Paul Who Is A Ghost",
      collectionName: "Signal Stack",
    },
    tokenContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    tokenId: "123",
  });

  assert.equal(resolved.creatorName, "Paul Who Is A Ghost");
  assert.equal(
    resolved.creatorAddress,
    "tz1burnburnburnburnburnburnburjAYjjX"
  );
  assert.equal(resolved.collectionName, "Signal Stack");
  assert.equal(
    resolved.objktUrl,
    "https://objkt.com/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/123"
  );
});

test("resolveTvOverlayMetadata falls back to address labels instead of raw wallet strings", () => {
  const resolved = resolveTvOverlayMetadata({
    metadata: {
      creators: ["tz1burnburnburnburnburnburnburjAYjjX"],
    },
    storedCreatorName: "tz1burnburnburnburnburnburnburjAYjjX",
    storedCreatorAddress: "tz1burnburnburnburnburnburnburjAYjjX",
    creatorLabel: "Ghost Radio",
    tokenContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    tokenId: "456",
  });

  assert.equal(resolved.creatorName, "Ghost Radio");
  assert.equal(
    resolved.creatorAddress,
    "tz1burnburnburnburnburnburnburjAYjjX"
  );
});

test("resolveTvOverlayMetadata falls back to uploader credit for non-token uploads", () => {
  const resolved = resolveTvOverlayMetadata({
    metadata: null,
    tokenContract: "media:77",
    tokenId: "77",
    uploaderUsername: "paulwhoisaghost",
  });

  assert.equal(resolved.creatorName, "from paulwhoisaghost's media");
  assert.equal(resolved.objktUrl, null);
});

test("writeTvOverlayOverride merges editable upload metadata and supports clearing fields", () => {
  const withOverride = writeTvOverlayOverride(
    { name: "Test Clip" },
    {
      creatorName: "Studio Paul",
      collectionName: "After Hours",
      mintedAtIso: "2026-05-04T12:00:00.000Z",
    }
  );

  assert.deepEqual(readTvOverlayOverride(withOverride), {
    creatorName: "Studio Paul",
    collectionName: "After Hours",
    mintedAtIso: "2026-05-04T12:00:00.000Z",
  });

  const cleared = writeTvOverlayOverride(withOverride, {
    creatorName: "",
    collectionName: "",
    mintedAtIso: "",
  });

  assert.deepEqual(readTvOverlayOverride(cleared), {
    creatorName: null,
    collectionName: null,
    mintedAtIso: null,
  });
});
