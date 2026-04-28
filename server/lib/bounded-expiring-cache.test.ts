import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createBoundedExpiringCache } from "./bounded-expiring-cache";

const realDateNow = Date.now;

afterEach(() => {
  Date.now = realDateNow;
});

function mockNow(now: number) {
  Date.now = () => now;
}

test("createBoundedExpiringCache returns live entries before TTL expiry", () => {
  const cache = createBoundedExpiringCache<string>({ ttlMs: 1_000, maxEntries: 10 });

  mockNow(100);
  cache.set("k1", "value");
  mockNow(500);

  assert.equal(cache.get("k1"), "value");
  assert.equal(cache.getTrackedKeyCount(), 1);
});

test("createBoundedExpiringCache drops expired entries on read", () => {
  const cache = createBoundedExpiringCache<string>({
    ttlMs: 1_000,
    maxEntries: 10,
    sweepIntervalMs: 1_000,
  });

  mockNow(100);
  cache.set("k1", "value");
  mockNow(1_500);

  assert.equal(cache.get("k1"), null);
  assert.equal(cache.getTrackedKeyCount(), 0);
});

test("createBoundedExpiringCache caps tracked key cardinality under churn", () => {
  const cache = createBoundedExpiringCache<string>({
    ttlMs: 60_000,
    maxEntries: 3,
    sweepIntervalMs: 60_000,
  });

  for (let index = 0; index < 5; index += 1) {
    mockNow(1_000 + index);
    cache.set(`key-${index}`, `value-${index}`);
  }

  assert.equal(cache.getTrackedKeyCount(), 3);
});
