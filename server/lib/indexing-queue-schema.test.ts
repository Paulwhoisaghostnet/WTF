import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("indexing queue schema policy", () => {
  it("keeps queue uniqueness partial to pending rows", () => {
    const migration = readFileSync("drizzle/0078_indexing_queue_pending_partial.sql", "utf8");
    const bootstrap = readFileSync("drizzle/0008_cockpit_phase0.sql", "utf8");
    const all = readFileSync("drizzle/cockpit_all.sql", "utf8");
    const schema = readFileSync("shared/schema-wallet.ts", "utf8");

    for (const source of [migration, all]) {
      assert.match(source, /uq_indexing_queue_target_pending/);
      assert.match(source, /WHERE "status" = 'pending'/);
      assert.doesNotMatch(source, /"target", "target_kind", "status"/);
    }
    assert.match(bootstrap, /uq_indexing_queue_target_pending/);
    assert.match(bootstrap, /"target", "target_kind", "status"/);
    assert.doesNotMatch(bootstrap, /WHERE "status" = 'pending'/);
    assert.match(schema, /where\(sql`\$\{t\.status\} = 'pending'`\)/);
  });
});
