import { ensureCanonicalDailyLoopChallenges } from "../challenges/services/daily-loop-challenges";
import { ensureReggieQuestChallenges } from "../challenges/services/reggie-quest";
import { migrateTvCacheKeys, readTvCacheStats } from "../features/tv/cache-storage";
import { runGameshowBootBackfill } from "./gameshow-boot-backfill";
import { runTvBootBackfill } from "./tv-boot-backfill";

/**
 * Required, idempotent mutations that must finish before the process accepts
 * traffic. Any failure rejects startup instead of leaving a partially ready
 * listener online.
 */
export async function runRequiredStartupTasks(): Promise<void> {
  await runTvBootBackfill();
  await runGameshowBootBackfill();

  const dailyLoops = await ensureCanonicalDailyLoopChallenges(null);
  if (dailyLoops.created || dailyLoops.updated) {
    console.log(
      `[gameshow-boot] side quests ready: ${dailyLoops.created} created, ${dailyLoops.updated} updated`,
    );
  }

  const reggieQuests = await ensureReggieQuestChallenges(null);
  if (reggieQuests.created || reggieQuests.updated) {
    console.log(
      `[reggie-boot] quest steps ready: ${reggieQuests.created} created, ${reggieQuests.updated} updated`,
    );
  }

  const migrated = await migrateTvCacheKeys();
  if (migrated.renamed || migrated.collisions || migrated.orphanedMeta || migrated.errors) {
    console.log(
      `[tv-cache] migrated: scanned=${migrated.scanned} renamed=${migrated.renamed} ` +
        `collisions=${migrated.collisions} orphanedMeta=${migrated.orphanedMeta} errors=${migrated.errors}`,
    );
  }
  if (migrated.errors > 0) {
    throw new Error(`TV cache key migration reported ${migrated.errors} error(s)`);
  }
}

/** Read-only boot diagnostics are useful but never affect readiness. */
export async function logStartupDiagnostics(): Promise<void> {
  try {
    const stats = await readTvCacheStats();
    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MiB`;
    const gb = (n: number) => `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
    console.log(
      `[tv-cache] dir=${stats.dir} files=${stats.fileCount} ` +
        `(${stats.immutableCount} immutable / ${stats.mutableCount} mutable) ` +
        `size=${mb(stats.totalBytes)} / budget=${gb(stats.maxTotalBytes)}`,
    );
  } catch (err) {
    console.warn("[tv-cache] failed to read cache stats on boot:", err);
  }
}
