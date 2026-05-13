import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ||= "postgres://wtf:wtf@127.0.0.1:5432/wtf_test";

describe("W filtered stream rule policy", () => {
  it("normalizes handles and builds stable wtf_users tags under the X 1024-char limit", async () => {
    const { buildStreamRuleAdds, normalizeStreamHandles, parseStreamHandlesFile } = await import("../../lib/timeline-stream");
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
      assert.match(rule.value, / -is:retweet$/);
    }
  });

  it("keeps recent search as batched recovery, not per-user fanout", async () => {
    const { buildTimelineSearchRecoveryQueries } = await import("../../lib/timeline-worker");
    const queries = buildTimelineSearchRecoveryQueries(["bert", "alice_1"]);

    assert.equal(queries.length, 1);
    assert.equal(queries[0], "from:alice_1 OR from:bert -is:retweet");
  });
});
