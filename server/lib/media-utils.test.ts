import assert from "node:assert/strict";
import test from "node:test";

import {
  isGameCartridgeMimeType,
  resolveArtifactMimeType,
} from "@shared/token-media";
import {
  extractAudioAsset,
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
    sourceUri: "https://ipfs.fileship.xyz/bafy-game/cart.zip",
    mimeType: "application/zip",
    title: "Tiny Arcade",
    thumbnailUri: "https://ipfs.fileship.xyz/bafy-preview/thumb.png",
  });
});

test("token media resolver understands Objkt snake_case audio metadata", () => {
  const metadata = {
    name: "Midnight Dial Tone",
    artifact_uri: "ipfs://bafy-audio/track.mp3",
    thumbnail_uri: "ipfs://bafy-audio/cover.png",
    formats: [
      { uri: "ipfs://bafy-audio/cover.png", mime_type: "image/png" },
      { uri: "ipfs://bafy-audio/track.mp3", mime_type: "audio/mpeg" },
    ],
  };

  assert.equal(resolveArtifactMimeType(metadata), "audio/mpeg");
  assert.equal(mediaCategoryFromMime("audio/mpeg"), "audio");
  assert.deepEqual(extractAudioAsset(metadata), {
    sourceUri: "https://ipfs.fileship.xyz/bafy-audio/track.mp3",
    mimeType: "audio/mpeg",
    title: "Midnight Dial Tone",
    thumbnailUri: "https://ipfs.fileship.xyz/bafy-audio/cover.png",
  });
});
