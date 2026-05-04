import assert from "node:assert/strict";
import test from "node:test";
import { createTvTelemetryStore } from "./tv-telemetry";

test("tv telemetry prunes expired error sessions even when an item stays hot", () => {
  let nowMs = 0;
  const store = createTvTelemetryStore({
    now: () => nowMs,
    windowMs: 1_000,
    blacklistThreshold: 3,
    maxErroredSessionsPerItem: 8,
  });

  nowMs = 100;
  store.record({ videoId: 42, sessionId: "old-session", reason: "error" });
  nowMs = 700;
  store.record({ videoId: 42, sessionId: "fresh-session", reason: "error" });

  nowMs = 1_500;
  store.record({ videoId: 42, sessionId: "viewer-ok", reason: "ended" });

  const aggregate = store.aggregate();
  assert.equal(aggregate.videos.length, 1);
  assert.equal(aggregate.videos[0]?.videoId, 42);
  assert.equal(aggregate.videos[0]?.distinctErrorSessions, 1);
  assert.deepEqual(aggregate.blacklisted, []);
});

test("tv telemetry caps distinct error sessions per item", () => {
  let nowMs = 0;
  const store = createTvTelemetryStore({
    now: () => nowMs,
    windowMs: 60_000,
    blacklistThreshold: 3,
    maxErroredSessionsPerItem: 3,
  });

  for (const [index, sessionId] of ["a", "b", "c", "d"].entries()) {
    nowMs = 1_000 + index;
    store.record({ videoId: 7, sessionId, reason: "error" });
  }

  const aggregate = store.aggregate();
  assert.equal(aggregate.videos[0]?.videoId, 7);
  assert.equal(aggregate.videos[0]?.distinctErrorSessions, 3);
  assert.deepEqual(aggregate.blacklisted, [7]);
});

test("tv telemetry evicts the oldest tracked video buckets under high churn", () => {
  let nowMs = 0;
  const store = createTvTelemetryStore({
    now: () => nowMs,
    windowMs: 60_000,
    maxTrackedVideos: 2,
    maxErroredSessionsPerItem: 4,
  });

  nowMs = 100;
  store.record({ videoId: 1, sessionId: "a", reason: "ended" });
  nowMs = 200;
  store.record({ videoId: 2, sessionId: "b", reason: "ended" });
  nowMs = 300;
  store.record({ videoId: 3, sessionId: "c", reason: "ended" });

  const trackedVideoIds = store
    .aggregate()
    .videos.map((entry) => entry.videoId)
    .sort((a, b) => a - b);

  assert.deepEqual(trackedVideoIds, [2, 3]);
});
