#!/usr/bin/env -S node --import=tsx
/**
 * Standalone LRU eviction pass over the TV cache disk (`/app/cache/tv`).
 *
 * Used in two places:
 *   1. The scheduled `tv-cache-evict` background job registered by
 *      `server/lib/background-jobs.ts` (runs every hour inside the app).
 *   2. This CLI for on-demand cleanup, e.g. when the disk-health alert
 *      fires and an operator wants to hard-evict without touching the
 *      running app. `docker compose exec app npx tsx scripts/tv-cache-evict.ts`.
 *
 * Budget is env-driven via `TV_CACHE_MAX_TOTAL_BYTES` (and the new
 * `TV_CACHE_MAX_GB` convenience alias, which wins if both are set). The
 * actual eviction logic lives in `server/features/tv/cache-storage.ts` so both entry
 * points stay in lock-step.
 */

import { runTvCacheEviction } from "../server/features/tv/cache-storage";

function parseGbCap(): number | null {
  const raw = process.env.TV_CACHE_MAX_GB?.trim();
  if (!raw) return null;
  const gb = Number(raw);
  if (!Number.isFinite(gb) || gb <= 0) return null;
  return Math.round(gb * 1024 * 1024 * 1024);
}

function formatBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

async function main(): Promise<void> {
  const gbCap = parseGbCap();
  if (gbCap !== null) {
    process.env.TV_CACHE_MAX_TOTAL_BYTES = String(gbCap);
  }
  const result = await runTvCacheEviction();
  const payload = {
    event: "tv-cache-evict.complete",
    beforeBytes: result.beforeBytes,
    afterBytes: result.afterBytes,
    removedFiles: result.removed,
    keptFiles: result.kept,
    beforeHuman: formatBytes(result.beforeBytes),
    afterHuman: formatBytes(result.afterBytes),
    deltaHuman: formatBytes(result.beforeBytes - result.afterBytes),
  };
  console.log(JSON.stringify(payload));
}

main().catch((err) => {
  console.error("[tv-cache-evict] failed:", err);
  process.exit(1);
});
