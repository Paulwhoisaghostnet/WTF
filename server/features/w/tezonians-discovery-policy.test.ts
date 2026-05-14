import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Tezonians discovery X safety policy", () => {
  it("does not register or run passive X search unless explicitly enabled", () => {
    const source = readFileSync("server/lib/tezonians-discovery.ts", "utf8");

    assert.match(source, /W_TEZONIANS_DISCOVERY_ENABLED/);
    assert.match(source, /process\.env\.W_TEZONIANS_DISCOVERY_ENABLED === "1"/);
    assert.match(source, /tezonians_discovery_disabled/);
    assert.match(source, /discovery disabled by default/);
  });

  it("keeps mention auto-like opt-in instead of defaulting on", () => {
    const source = readFileSync("server/lib/tezonians-discovery.ts", "utf8");

    assert.match(source, /W_TEZONIANS_AUTO_LIKE/);
    assert.match(source, /process\.env\.W_TEZONIANS_AUTO_LIKE === "true"/);
  });

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

  it("treats exhausted X credits as a skipped job instead of scheduler failure", () => {
    const source = readFileSync("server/lib/tezonians-discovery.ts", "utf8");

    assert.match(source, /err\?\.status === 402/);
    assert.match(source, /x_api_402_credits_exhausted/);
    assert.match(source, /search skipped — X API credits exhausted/);
  });
});
