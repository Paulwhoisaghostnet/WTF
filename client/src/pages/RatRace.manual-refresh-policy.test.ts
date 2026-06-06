import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Rat Race relies on explicit Scan instead of automatic refresh", async () => {
  const source = await readFile(new URL("./RatRace.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /refetchInterval/);
  assert.match(source, /function scanFilters\(\)/);
  assert.match(source, /void query\.refetch\(\)/);
  assert.match(source, /eventType: "rat_race\.scan_requested"/);
});
