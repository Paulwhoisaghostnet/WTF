import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_IPFS_GATEWAYS } from "@shared/ipfs-gateways";
import { resolveTokenArtifact, resolveTokenThumbnail } from "./media-resolve";

test("token thumbnails expose ordered IPFS gateway fallbacks", () => {
  const resolved = resolveTokenThumbnail({
    thumbnail: "ipfs://bafybeigdyrzt/thumb.png",
  });

  assert.ok(resolved);
  assert.equal(
    resolved.src,
    `/api/cache/media?url=${encodeURIComponent(`${DEFAULT_IPFS_GATEWAYS[0]}bafybeigdyrzt/thumb.png`)}`
  );
  assert.equal(resolved.fallbackSrc, `${DEFAULT_IPFS_GATEWAYS[0]}bafybeigdyrzt/thumb.png`);
  assert.equal(resolved.fallbackCandidates?.length, DEFAULT_IPFS_GATEWAYS.length);
  assert.equal(
    resolved.fallbackCandidates?.at(-1),
    `${DEFAULT_IPFS_GATEWAYS.at(-1)}bafybeigdyrzt/thumb.png`
  );
});

test("token artifacts expose IPFS gateway fallbacks for playable media", () => {
  const resolved = resolveTokenArtifact({
    metadata: {
      artifactUri: "https://gateway.pinata.cloud/ipfs/bafybeigdyrzt/game.zip",
    },
  });

  assert.ok(resolved);
  assert.equal(resolved.fallbackSrc, `${DEFAULT_IPFS_GATEWAYS[0]}bafybeigdyrzt/game.zip`);
  assert.equal(resolved.fallbackCandidates?.length, DEFAULT_IPFS_GATEWAYS.length);
});

test("non-IPFS HTTP media keeps direct URL as the only fallback", () => {
  const resolved = resolveTokenThumbnail({
    thumbnail: "https://cdn.example.test/token.png",
  });

  assert.ok(resolved);
  assert.equal(resolved.src, "/api/cache/media?url=https%3A%2F%2Fcdn.example.test%2Ftoken.png");
  assert.deepEqual(resolved.fallbackCandidates, ["https://cdn.example.test/token.png"]);
});
