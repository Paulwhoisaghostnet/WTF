import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profileSource = readFileSync(new URL("./Profile.tsx", import.meta.url), "utf8");

test("Profile picture token previews use shared ordered media resolution", () => {
  assert.match(
    profileSource,
    /resolveTokenThumbnail/,
    "Profile should resolve picker images through the shared cached IPFS gateway policy",
  );
  assert.match(
    profileSource,
    /advanceResolvedMediaFallback/,
    "Profile should advance to alternate gateways when a preview source fails",
  );
  assert.doesNotMatch(
    profileSource,
    /function resolveTokenImage[\s\S]*?normalizeIpfsUri\(uri\)/,
    "Profile must not collapse an IPFS image to one gateway without fallback",
  );
});

test("Profile picture editor retries ordered preview candidates", () => {
  assert.match(
    profileSource,
    /img\.onerror\s*=\s*\(\)\s*=>\s*\{[\s\S]*?advanceResolvedMediaFallback\(img, resolved\)/,
    "The editor canvas loader should recover if its primary preview request fails",
  );
});
