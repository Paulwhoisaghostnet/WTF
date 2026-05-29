import test from "node:test";
import assert from "node:assert/strict";
import { summarizeOutbox } from "./observability";

test("summarizeOutbox folds status counts and totals", () => {
  const summary = summarizeOutbox([
    { status: "published", count: 10 },
    { status: "queued", count: 3 },
    { status: "failed", count: 1 },
    { status: "skipped", count: 6 },
  ]);
  assert.equal(summary.total, 20);
  assert.equal(summary.byStatus.published, 10);
  assert.equal(summary.byStatus.failed, 1);
});

test("summarizeOutbox handles null status and empty input", () => {
  assert.deepEqual(summarizeOutbox([]), { byStatus: {}, total: 0 });
  const s = summarizeOutbox([{ status: null, count: 2 }]);
  assert.equal(s.byStatus.unknown, 2);
});
