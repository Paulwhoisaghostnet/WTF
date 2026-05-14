import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("core TzKT helper module uses shared upstream retry/backoff and bounded cache", () => {
  const source = readFileSync("server/tzkt.ts", "utf8");

  assert.match(source, /from "\.\/lib\/upstream"/);
  assert.match(source, /from "\.\/lib\/bounded-expiring-cache"/);
  assert.match(source, /createBoundedExpiringCache<unknown>/);
  assert.match(source, /TZKT_HELPER_CACHE_MAX_ENTRIES/);
  assert.match(source, /tzkt\.getJson/);
  assert.match(source, /fetchTzktCursorPages/);
  assert.doesNotMatch(source, /await fetch\(/);
  assert.doesNotMatch(source, /new Map</);
  assert.doesNotMatch(source, /const TZKT_BASE/);
});
