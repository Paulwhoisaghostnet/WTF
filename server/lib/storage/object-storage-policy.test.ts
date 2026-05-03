import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OBJECT_STORAGE_LIMIT_BYTES,
  classifyObjectStorageUsage,
  objectStorageThresholds,
} from "./object-storage-policy";

test("object storage policy uses 969 GiB as the internal limit", () => {
  assert.equal(DEFAULT_OBJECT_STORAGE_LIMIT_BYTES, 969 * 1024 ** 3);
});

test("object storage thresholds map 80/90/95 percent to byte limits", () => {
  const thresholds = objectStorageThresholds(1_000);

  assert.equal(thresholds.warn80Bytes, 800);
  assert.equal(thresholds.warn90Bytes, 900);
  assert.equal(thresholds.protect95Bytes, 950);
});

test("object storage usage classification escalates before crossing the hard limit", () => {
  assert.equal(classifyObjectStorageUsage({ usedBytes: 799, limitBytes: 1_000 }).level, "ok");
  assert.equal(classifyObjectStorageUsage({ usedBytes: 800, limitBytes: 1_000 }).level, "warn80");
  assert.equal(classifyObjectStorageUsage({ usedBytes: 900, limitBytes: 1_000 }).level, "warn90");

  const protectedStatus = classifyObjectStorageUsage({
    usedBytes: 950,
    limitBytes: 1_000,
  });
  assert.equal(protectedStatus.level, "protect95");
  assert.equal(protectedStatus.uploadsProtected, true);

  const blockedStatus = classifyObjectStorageUsage({
    usedBytes: 1_000,
    limitBytes: 1_000,
  });
  assert.equal(blockedStatus.level, "blocked");
  assert.equal(blockedStatus.uploadsProtected, true);
});

