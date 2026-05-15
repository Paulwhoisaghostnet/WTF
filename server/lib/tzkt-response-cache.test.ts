import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTzktResponseCacheMaxEntries,
  normalizeTzktResponseCacheTtlMs,
} from "./tzkt-response-cache-policy";

test("TzKT persistent cache max entries are clamped to the abuse boundary", () => {
  assert.equal(normalizeTzktResponseCacheMaxEntries("not-a-number"), 2_000);
  assert.equal(normalizeTzktResponseCacheMaxEntries(1), 100);
  assert.equal(normalizeTzktResponseCacheMaxEntries(2_500.9), 2_500);
  assert.equal(normalizeTzktResponseCacheMaxEntries(100_000), 20_000);
});

test("TzKT persistent cache TTL refuses sub-second or invalid retention", () => {
  assert.equal(normalizeTzktResponseCacheTtlMs("not-a-number"), 1_000);
  assert.equal(normalizeTzktResponseCacheTtlMs(0), 1_000);
  assert.equal(normalizeTzktResponseCacheTtlMs(999), 1_000);
  assert.equal(normalizeTzktResponseCacheTtlMs(5_000.9), 5_000);
});
