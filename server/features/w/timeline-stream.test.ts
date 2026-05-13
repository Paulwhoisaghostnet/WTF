import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

process.env.DATABASE_URL ||= "postgres://wtf:wtf@127.0.0.1:5432/wtf_test";

describe("W filtered stream rule policy", () => {
  it("normalizes handles and builds stable wtf_users tags under the X 1024-char limit", async () => {
    const { buildStreamRuleAdds, buildStreamRulePlan, normalizeStreamHandles, parseStreamHandlesFile } = await import("../../lib/timeline-stream");
    const handles = [
      "@Bert",
      "bert",
      "WTFGameshow",
      "bad-handle",
      "toolonghandle_over_15_chars",
      "alice_1",
    ];

    assert.deepEqual(normalizeStreamHandles(handles), ["alice_1", "bert", "wtfgameshow"]);
    assert.deepEqual(
      parseStreamHandlesFile(`
        # W server-maintained stream allowlist
        @_transparentart
        wtf_gameshow, Bert
        bad-handle
      `),
      ["_transparentart", "bert", "wtf_gameshow"]
    );

    const manyHandles = Array.from({ length: 180 }, (_, i) => `wtf_user_${i}`);
    const rules = buildStreamRuleAdds(manyHandles);

    assert.ok(rules.length > 1);
    assert.equal(rules[0].tag, "wtf_users_0000");
    assert.equal(rules[1].tag, "wtf_users_0001");
    for (const rule of rules) {
      assert.ok(rule.value.length <= 1024, `rule too long: ${rule.value.length}`);
      assert.ok((rule.value.match(/from:/g) || []).length <= 20, `too many handles packed: ${rule.value}`);
      assert.match(rule.value, / -is:retweet$/);
    }

    const capped = buildStreamRulePlan(manyHandles, 1);
    assert.equal(capped.add.length, 1);
    assert.ok(capped.includedHandles.length > 0);
    assert.ok(capped.skippedHandles.length > 0);
    assert.equal(capped.includedHandles.length + capped.skippedHandles.length, 180);
  });

  it("dry-runs new stream rules before replacing live W-managed rules", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("server/lib/timeline-stream.ts", "utf8");

    assert.match(source, /dry_run=true/);
    assert.match(source, /assertStreamRuleMutationAccepted/);
    assert.match(source, /W_TIMELINE_STREAM_MAX_RULES/);
    assert.match(source, /W_TIMELINE_STREAM_HANDLES_PER_RULE/);
    assert.match(source, /lastRuleSkippedHandleCount/);
  });

  it("keeps the admin stream manifest separate from derived handles", () => {
    const routeSource = readFileSync("server/features/w/message-routes.ts", "utf8");
    const uiSource = readFileSync("client/src/features/w/social/WSocialPanel.tsx", "utf8");

    assert.match(routeSource, /req\.body\?\.handles/);
    assert.match(routeSource, /manifestHandles/);
    assert.match(routeSource, /setSettingValue\(W_STREAM_RULE_HANDLES_KEY, JSON\.stringify\(manifestHandles\)/);
    assert.match(uiSource, /Save manifest & sync rules/);
    assert.match(uiSource, /streamHandlesDraft[\s\S]*split\(\//);
  });

  it("keeps recent search as batched recovery, not per-user fanout", async () => {
    const { buildTimelineSearchRecoveryQueries } = await import("../../lib/timeline-worker");
    const queries = buildTimelineSearchRecoveryQueries(["bert", "alice_1"]);

    assert.equal(queries.length, 1);
    assert.equal(queries[0], "from:alice_1 OR from:bert -is:retweet");
  });
});
