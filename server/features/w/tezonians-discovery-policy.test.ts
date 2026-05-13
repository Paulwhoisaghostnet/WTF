import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Tezonians discovery X safety policy", () => {
  it("resets stale recent-search since_id instead of failing the scheduler forever", () => {
    const source = readFileSync("server/lib/tezonians-discovery.ts", "utf8");

    assert.match(source, /staleSinceIdReplacement/);
    assert.match(source, /must be a tweet id created after/);
    assert.match(source, /BigInt\(match\[1\]\) \+ 1n/);
    assert.match(source, /stale since_id reset/);
  });

  it("uses W/X search budget guards for passive discovery search calls", () => {
    const source = readFileSync("server/lib/tezonians-discovery.ts", "utf8");

    assert.match(source, /canUseXFeature\("search_recovery_posts"/);
    assert.match(source, /recordXFeatureUsage\("search_recovery_posts"/);
  });
});
