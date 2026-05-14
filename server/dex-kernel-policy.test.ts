import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("DEX route uses bounded cache and shared SpicySwap upstream client", async () => {
  const [dex, upstream] = await Promise.all([
    readFile(new URL("./routes/dex.ts", import.meta.url), "utf8"),
    readFile(new URL("./lib/upstream.ts", import.meta.url), "utf8"),
  ]);

  assert.match(dex, /createBoundedExpiringCache<unknown>/);
  assert.match(dex, /DEX_CACHE_MAX_ENTRIES/);
  assert.match(dex, /spicyswap\.getJson/);
  assert.doesNotMatch(dex, /await fetch\(/);
  assert.doesNotMatch(dex, /fetch\(`/);
  assert.doesNotMatch(dex, /new Map<string,\s*CacheEntry/);
  assert.doesNotMatch(dex, /SPICY_API_URL/);

  assert.match(upstream, /label: "spicyswap"/);
  assert.match(upstream, /SPICY_API_URL/);
});
