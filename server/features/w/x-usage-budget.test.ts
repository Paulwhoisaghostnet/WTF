import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

process.env.DATABASE_URL ||= "postgres://wtf:wtf@127.0.0.1:5432/wtf_test";

describe("W/X usage budget policy", () => {
  it("calculates monthly hard stops from unit costs", async () => {
    const { calculateXBudgetState } = await import("../../lib/x-usage-budget");
    const state = calculateXBudgetState("groupchat_dm_writes", 334, {
      unitUsd: 0.015,
      softUsd: null,
      hardUsd: 5,
    });

    assert.equal(state.estimatedUsd, 5.01);
    assert.equal(state.hardExceeded, true);
    assert.equal(state.remainingUnits, 0);
  });

  it("wires every W/X ingestion and send path through budget helpers", () => {
    const stream = readFileSync("server/lib/timeline-stream.ts", "utf8");
    const search = readFileSync("server/lib/timeline-worker.ts", "utf8");
    const dmSync = readFileSync("server/lib/x-dm-sync.ts", "utf8");
    const routes = readFileSync("server/features/w/message-routes.ts", "utf8");

    assert.match(stream, /canUseXFeature\("timeline_stream_posts"/);
    assert.match(stream, /recordXFeatureUsage\("timeline_stream_posts"/);
    assert.match(search, /canUseXFeature\("search_recovery_posts"/);
    assert.match(search, /recordXFeatureUsage\("search_recovery_posts"/);
    assert.match(dmSync, /canUseXFeature\("groupchat_dm_events"/);
    assert.match(dmSync, /recordXFeatureUsage\("groupchat_dm_events"/);
    assert.match(routes, /canUseXFeature\("groupchat_dm_writes"/);
    assert.match(routes, /recordXFeatureUsage\("groupchat_dm_writes"/);
    assert.match(routes, /getXUsageBudgetStatus/);
    assert.match(readFileSync("server/lib/x-usage-budget.ts", "utf8"), /nextResetAtIso/);
  });
});
