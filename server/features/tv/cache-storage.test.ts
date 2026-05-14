import assert from "node:assert/strict";
import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("TV cache eviction trims warning-level usage down to target budget", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "wtf-tv-cache-budget-"));
  t.after(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  process.env.TV_CACHE_DIR = cacheDir;
  process.env.TV_CACHE_MAX_REMOTE_BYTES = String(20 * 1024 * 1024);
  process.env.TV_CACHE_MAX_TOTAL_BYTES = String(21 * 1024 * 1024);
  process.env.TV_CACHE_WARN_RATIO = "0.9";
  process.env.TV_CACHE_EVICT_TARGET_RATIO = "0.5";

  const files = [
    { name: "oldest", mtime: new Date("2026-05-01T00:00:00.000Z") },
    { name: "middle", mtime: new Date("2026-05-02T00:00:00.000Z") },
    { name: "newest", mtime: new Date("2026-05-03T00:00:00.000Z") },
  ];

  for (const file of files) {
    const filePath = path.join(cacheDir, `${file.name}.bin`);
    await writeFile(filePath, Buffer.alloc(8 * 1024 * 1024));
    await writeFile(path.join(cacheDir, `${file.name}.json`), JSON.stringify({ immutable: true }));
    await utimes(filePath, file.mtime, file.mtime);
  }

  const { runTvCacheEviction } = await import("./cache-storage");
  const result = await runTvCacheEviction();

  assert.equal(result.beforeBytes, 24 * 1024 * 1024);
  assert.equal(result.warnBytes, Math.floor(21 * 1024 * 1024 * 0.9));
  assert.equal(result.targetBytes, Math.floor(21 * 1024 * 1024 * 0.5));
  assert.ok(result.afterBytes <= result.targetBytes, JSON.stringify(result));
  assert.equal(result.removed, 2);
  await assert.rejects(stat(path.join(cacheDir, "oldest.bin")));
  await assert.rejects(stat(path.join(cacheDir, "middle.bin")));
  assert.equal((await stat(path.join(cacheDir, "newest.bin"))).size, 8 * 1024 * 1024);
});
