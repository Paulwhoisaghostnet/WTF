import assert from "node:assert/strict";
import test from "node:test";
import { planTmpCleanup } from "./tmp-clean";

test("planTmpCleanup only removes old files inside safe temp roots", () => {
  const result = planTmpCleanup({
    nowMs: 10_000,
    minAgeMs: 5_000,
    roots: ["/mnt/wtf-data/tmp-processing", "/mnt/wtf-data/uploads-staging"],
    entries: [
      { path: "/mnt/wtf-data/tmp-processing/old.part", mtimeMs: 1_000, type: "file" },
      { path: "/mnt/wtf-data/uploads-staging/new.part", mtimeMs: 9_000, type: "file" },
      { path: "/mnt/wtf-data/tmp-processing/current.lock", mtimeMs: 1_000, type: "file" },
      { path: "/etc/passwd", mtimeMs: 1_000, type: "file" },
      { path: "/mnt/wtf-data/tmp-processing/folder", mtimeMs: 1_000, type: "directory" },
    ],
  });

  assert.deepEqual(result.remove, ["/mnt/wtf-data/tmp-processing/old.part"]);
  assert.equal(result.skippedUnsafe, 2);
  assert.equal(result.skippedYoung, 1);
  assert.equal(result.skippedProtected, 1);
});
