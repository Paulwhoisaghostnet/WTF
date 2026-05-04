import assert from "node:assert/strict";
import test from "node:test";

import {
  computeTvBroadcastCursor,
  resolveTvBroadcastQueue,
  resolveTvDisplayDurationSeconds,
} from "./tv-broadcast";

test("resolveTvDisplayDurationSeconds preserves video durations", () => {
  assert.equal(resolveTvDisplayDurationSeconds(42, "video/mp4"), 42);
});

test("resolveTvDisplayDurationSeconds expands gif loops into a broadcast window", () => {
  assert.equal(resolveTvDisplayDurationSeconds(4, "image/gif"), 12);
  assert.equal(resolveTvDisplayDurationSeconds(1, "image/gif"), 3);
  assert.equal(resolveTvDisplayDurationSeconds(20, "image/gif"), 30);
});

test("computeTvBroadcastCursor resolves the current index and offset from wall clock", () => {
  const midnight = Date.UTC(2026, 4, 4, 0, 0, 0, 0);
  const cursor = computeTvBroadcastCursor([10, 20, 30], midnight + 35_000);

  assert.equal(cursor.currentIndex, 2);
  assert.equal(cursor.offsetSeconds, 5);
  assert.equal(cursor.loopDurationSeconds, 60);
});

test("resolveTvBroadcastQueue rotates the current item to the front and preserves later order", () => {
  const midnight = Date.UTC(2026, 4, 4, 0, 0, 0, 0);
  const queue = [
    { durationSeconds: 10, mimeType: "video/mp4", title: "A" },
    { durationSeconds: 20, mimeType: "video/mp4", title: "B" },
    { durationSeconds: 30, mimeType: "video/mp4", title: "C" },
  ];

  const resolved = resolveTvBroadcastQueue(queue, midnight + 35_000);

  assert.equal(resolved.current?.title, "C");
  assert.equal(resolved.current?.offsetSeconds, 5);
  assert.deepEqual(
    resolved.queue.map((item) => item.title),
    ["C", "A", "B"]
  );
  assert.deepEqual(
    resolved.queue.map((item) => item.offsetSeconds),
    [5, 0, 0]
  );
});
