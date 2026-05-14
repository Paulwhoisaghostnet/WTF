import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHIVER_SKU,
  extractArchiveTargetFromMetadata,
  hasArchiverEntitlement,
  normalizeIpfsArchiveUrl,
} from "./token-archive";

test("archiver entitlement checks inventory quantity by SKU", () => {
  assert.equal(ARCHIVER_SKU, "artifact-archiver-pass");
  assert.equal(hasArchiverEntitlement([{ sku: ARCHIVER_SKU, quantity: 1 }]), true);
  assert.equal(hasArchiverEntitlement([{ sku: ARCHIVER_SKU, quantity: 0 }]), false);
  assert.equal(hasArchiverEntitlement([{ sku: "other", quantity: 10 }]), false);
});

test("normalizeIpfsArchiveUrl maps IPFS URIs to archive gateway targets", () => {
  assert.deepEqual(normalizeIpfsArchiveUrl("ipfs://QmExample/artifact.png"), {
    cidPath: "QmExample/artifact.png",
    sourceUri: "ipfs://QmExample/artifact.png",
    archiveUrl: "https://nftstorage.link/ipfs/QmExample/artifact.png",
  });
  assert.deepEqual(
    normalizeIpfsArchiveUrl("https://gateway.pinata.cloud/ipfs/bafyExample/track.mp3?download=1"),
    {
      cidPath: "bafyExample/track.mp3",
      sourceUri: "https://gateway.pinata.cloud/ipfs/bafyExample/track.mp3?download=1",
      archiveUrl: "https://nftstorage.link/ipfs/bafyExample/track.mp3",
    }
  );
});

test("extractArchiveTargetFromMetadata prefers token artifact IPFS target", () => {
  const target = extractArchiveTargetFromMetadata({
    artifact_uri: "ipfs://bafy-audio/track.mp3",
    display_uri: "ipfs://bafy-audio/display.png",
    formats: [{ uri: "ipfs://bafy-audio/display.png", mime_type: "image/png" }],
  });
  assert.equal(target?.cidPath, "bafy-audio/track.mp3");
  assert.equal(target?.archiveUrl, "https://nftstorage.link/ipfs/bafy-audio/track.mp3");
});
