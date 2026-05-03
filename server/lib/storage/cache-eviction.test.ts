import assert from "node:assert/strict";
import test from "node:test";
import { planCacheEviction } from "./cache-eviction";

test("planCacheEviction evicts oldest unprotected entries first", () => {
  const result = planCacheEviction({
    entries: [
      { path: "/cache/new.bin", sizeBytes: 500, lastAccessedMs: 3_000 },
      { path: "/cache/old.bin", sizeBytes: 500, lastAccessedMs: 1_000 },
      { path: "/cache/mid.bin", sizeBytes: 500, lastAccessedMs: 2_000 },
    ],
    maxCacheBytes: 1_000,
    currentFreeBytes: 10_000,
    reservedFreeBytes: 1_000,
  });

  assert.deepEqual(result.evict.map((entry) => entry.path), ["/cache/old.bin"]);
  assert.equal(result.projectedCacheBytes, 1_000);
});

test("planCacheEviction protects active, pinned, and processing files", () => {
  const result = planCacheEviction({
    entries: [
      { path: "/cache/active.bin", sizeBytes: 700, lastAccessedMs: 1_000, active: true },
      { path: "/cache/pinned.bin", sizeBytes: 700, lastAccessedMs: 2_000, pinned: true },
      { path: "/cache/processing.bin", sizeBytes: 700, lastAccessedMs: 3_000, processing: true },
      { path: "/cache/evict.bin", sizeBytes: 700, lastAccessedMs: 4_000 },
    ],
    maxCacheBytes: 2_100,
    currentFreeBytes: 10_000,
    reservedFreeBytes: 1_000,
  });

  assert.deepEqual(result.evict.map((entry) => entry.path), ["/cache/evict.bin"]);
  assert.equal(result.protectedCount, 3);
});

test("planCacheEviction evicts for reserved free space pressure", () => {
  const result = planCacheEviction({
    entries: [
      { path: "/cache/old.bin", sizeBytes: 300, lastAccessedMs: 1_000 },
      { path: "/cache/new.bin", sizeBytes: 300, lastAccessedMs: 2_000 },
    ],
    maxCacheBytes: 10_000,
    currentFreeBytes: 100,
    reservedFreeBytes: 500,
  });

  assert.deepEqual(result.evict.map((entry) => entry.path), ["/cache/old.bin", "/cache/new.bin"]);
  assert.equal(result.projectedFreeBytes, 700);
});

