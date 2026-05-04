import assert from "node:assert/strict";
import test from "node:test";
import { createTvStreamSnapshotCache } from "./tv-stream-snapshot-cache";

test("tv stream snapshot cache reuses cached values until ttl expiry", async () => {
  let loaderCalls = 0;
  let nowMs = 1_000;

  const cache = createTvStreamSnapshotCache<string>({
    ttlMs: 1_000,
    maxEntries: 10,
  });

  const first = await cache.getOrLoad(
    "channel-1",
    async () => {
      loaderCalls += 1;
      return "snapshot-a";
    },
    nowMs
  );
  assert.equal(first.status, "miss");
  assert.equal(first.value, "snapshot-a");

  nowMs = 1_500;
  const second = await cache.getOrLoad(
    "channel-1",
    async () => {
      loaderCalls += 1;
      return "snapshot-b";
    },
    nowMs
  );
  assert.equal(second.status, "hit");
  assert.equal(second.value, "snapshot-a");
  assert.equal(loaderCalls, 1);
});

test("tv stream snapshot cache coalesces concurrent loads for the same key", async () => {
  let release!: () => void;
  let loaderCalls = 0;

  const cache = createTvStreamSnapshotCache<string>({
    ttlMs: 1_000,
    maxEntries: 10,
  });

  const sharedLoader = async () => {
    loaderCalls += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return "snapshot-shared";
  };

  const firstPromise = cache.getOrLoad("channel-2", sharedLoader, 1_000);
  const secondPromise = cache.getOrLoad("channel-2", sharedLoader, 1_000);

  assert.equal(cache.getInFlightKeyCount(), 1);
  release();

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.status, "miss");
  assert.equal(second.status, "shared");
  assert.equal(first.value, "snapshot-shared");
  assert.equal(second.value, "snapshot-shared");
  assert.equal(loaderCalls, 1);
  assert.equal(cache.getInFlightKeyCount(), 0);
});

test("tv stream snapshot cache honors max entry bounds", async () => {
  const cache = createTvStreamSnapshotCache<string>({
    ttlMs: 60_000,
    maxEntries: 2,
    sweepIntervalMs: 60_000,
  });

  await cache.getOrLoad("a", async () => "A", 1_000);
  await cache.getOrLoad("b", async () => "B", 1_001);
  await cache.getOrLoad("c", async () => "C", 1_002);

  assert.equal(cache.getTrackedKeyCount(), 2);
});
