import assert from "node:assert/strict";
import test from "node:test";

import {
  isArcadeCartridge,
  isConsoleStockCartridge,
  isConsoleStockSlug,
} from "./surfaces";

test("surface classifier keeps stock console cartridges on every user's console", () => {
  for (const slug of [
    "adrift",
    "commander-keen-1",
    "commander-keen-2",
    "commander-keen-3",
    "commander-keen-4",
    "inverse-snake",
    "backwards-pong",
    "pixel-runner",
    "space-blocks",
  ]) {
    assert.equal(isConsoleStockSlug(slug), true, slug);
  }
});

test("surface classifier sends imported and curated public games to Arcade", () => {
  assert.equal(isConsoleStockSlug("arcade-flappy-bower"), false);
  assert.equal(
    isArcadeCartridge({
      slug: "dragon-cyberpunk-fable",
      tokenId: "dragon-cyberpunk-fable",
    }),
    true
  );
  assert.equal(
    isConsoleStockCartridge({
      slug: "commander-keen-3",
      tokenId: "commander-keen-3",
    }),
    true
  );
});
