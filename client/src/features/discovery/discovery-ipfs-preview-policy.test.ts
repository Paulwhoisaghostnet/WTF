import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const discoverySource = readFileSync(new URL("./DiscoveryCard.tsx", import.meta.url), "utf8");

test("Discovery NFT previews use the shared FileShip-first recovery chain", () => {
  assert.match(discoverySource, /resolveTokenThumbnail/);
  assert.match(discoverySource, /advanceResolvedMediaFallback/);
});
