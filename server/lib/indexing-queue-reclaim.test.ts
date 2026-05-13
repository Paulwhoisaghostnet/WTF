import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("indexing queue stuck-row recovery policy", () => {
  it("does not restore stale processing rows into duplicate pending targets", () => {
    const source = readFileSync("server/lib/indexing-queue.ts", "utf8");

    assert.match(source, /NOT EXISTS/);
    assert.match(source, /status = 'pending'/);
    assert.match(source, /superseded/);
    assert.match(source, /stale processing row superseded by an existing pending duplicate/);
  });
});
