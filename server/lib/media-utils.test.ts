import assert from "node:assert/strict";
import test from "node:test";

import {
  isGameCartridgeMimeType,
  resolveArtifactMimeType,
} from "@shared/token-media";
import {
  extractGameAsset,
  mediaCategoryFromMime,
} from "./media-utils";

test("token media resolver treats zip artifacts as game cartridges", () => {
  const metadata = {
    name: "Tiny Arcade",
    artifactUri: "ipfs://bafy-game/cart.zip",
    displayUri: "ipfs://bafy-preview/display.webp",
    formats: [
      { uri: "ipfs://bafy-preview/display.webp", mimeType: "image/webp" },
      { uri: "ipfs://bafy-game/cart.zip", mimeType: "application/zip" },
    ],
  };

  assert.equal(resolveArtifactMimeType(metadata), "application/zip");
  assert.equal(isGameCartridgeMimeType("application/x-zip-compressed"), true);
  assert.equal(mediaCategoryFromMime("application/zip"), "game");
});

test("extractGameAsset preserves token title and poster while normalizing source", () => {
  const asset = extractGameAsset({
    name: "Tiny Arcade",
    artifactUri: "ipfs://bafy-game/cart.zip",
    thumbnailUri: "ipfs://bafy-preview/thumb.png",
  });

  assert.deepEqual(asset, {
    sourceUri: "https://ipfs.io/ipfs/bafy-game/cart.zip",
    mimeType: "application/zip",
    title: "Tiny Arcade",
    thumbnailUri: "https://ipfs.io/ipfs/bafy-preview/thumb.png",
  });
});
