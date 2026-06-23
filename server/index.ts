import { createServer } from "http";
import { createApp } from "./app";
import { setupVite } from "./vite";
import { serveStatic } from "./static";
import { setupWebSocket } from "./websocket";
import { startBackgroundJobs, stopBackgroundJobs } from "./lib/background-jobs";
import { readTvCacheStats, migrateTvCacheKeys } from "./features/tv/cache-storage";
import { runTvBootBackfill } from "./lib/tv-boot-backfill";
import { runGameshowBootBackfill } from "./lib/gameshow-boot-backfill";
import { ensureCanonicalDailyLoopChallenges } from "./challenges/services/daily-loop-challenges";
import { pool } from "./db";
import {
  flushSystemLog,
  installPgPoolSystemLogBridge,
  installSystemLogging,
  logSystemEvent,
} from "./lib/system-log";
import { startRuntimeMetrics } from "./lib/runtime-metrics";

installSystemLogging();
installPgPoolSystemLogBridge(pool);
startRuntimeMetrics();

async function main() {
  logSystemEvent({
    source: "server",
    eventType: "startup_begin",
    severity: "info",
    message: "WTF server startup beginning",
    metadata: {
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV ?? null,
      port: process.env.PORT || "3000",
    },
  });

  const app = await createApp();
  const server = createServer(app);

  setupWebSocket(server);

  const serveBuiltAssets =
    process.env.NODE_ENV === "production" || process.env.WTFOS_STATIC_DEMO === "1";

  if (serveBuiltAssets) {
    serveStatic(app);
    if (process.env.NODE_ENV === "production") {
      startBackgroundJobs();
    }
  } else {
    await setupVite(app, server);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", async () => {
    console.log(`wtfOS running on http://localhost:${port}`);
    logSystemEvent({
      source: "server",
      eventType: "listening",
      severity: "info",
      message: `WTF server listening on ${port}`,
      metadata: {
        port,
        host: "0.0.0.0",
        nodeEnv: process.env.NODE_ENV ?? null,
      },
    });
    // Runs once per boot.  Idempotent; backfills sort_order on channels
    // and extracts creator/collection/minted_at from existing metadata
    // jsonb on tv_channel_videos.  Covers rows created before those
    // columns existed.
    runTvBootBackfill().catch((err) =>
      console.warn("[boot] tv backfill failed:", err)
    );
    runGameshowBootBackfill().catch((err) =>
      console.warn("[boot] gameshow backfill failed:", err)
    );
    ensureCanonicalDailyLoopChallenges(null)
      .then((result) => {
        if (result.created || result.updated) {
          console.log(
            `[gameshow-boot] side quests ready: ${result.created} created, ${result.updated} updated`
          );
        }
      })
      .catch((err) => console.warn("[boot] side quest seed failed:", err));
    // One-shot rekey of pre-existing IPFS cache entries from the old
    // sha256(fullUrl) scheme to the new sha256("ipfs:<cidPath>")
    // scheme.  Idempotent: once all files match the new format this
    // returns { renamed: 0 } and exits almost immediately.  Runs
    // before the cache-stats log + before the warmer's first sweep
    // so the budget numbers (and the warmer's "already warm?" check)
    // see the recovered entries under their new keys.
    try {
      const migrated = await migrateTvCacheKeys();
      if (migrated.renamed || migrated.collisions || migrated.orphanedMeta) {
        console.log(
          `[tv-cache] migrated: scanned=${migrated.scanned} ` +
            `renamed=${migrated.renamed} collisions=${migrated.collisions} ` +
            `orphanedMeta=${migrated.orphanedMeta} errors=${migrated.errors}`
        );
      }
    } catch (err) {
      console.warn("[tv-cache] migration failed:", err);
    }

    try {
      const stats = await readTvCacheStats();
      const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MiB`;
      const gb = (n: number) => `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
      console.log(
        `[tv-cache] dir=${stats.dir} files=${stats.fileCount} ` +
          `(${stats.immutableCount} immutable / ${stats.mutableCount} mutable) ` +
          `size=${mb(stats.totalBytes)} / budget=${gb(stats.maxTotalBytes)}`
      );
    } catch (err) {
      console.warn("[tv-cache] failed to read cache stats on boot:", err);
    }
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] shutting down (${signal})...`);
    logSystemEvent({
      source: "server",
      eventType: "shutdown_begin",
      severity: "warn",
      message: `Server shutdown requested by ${signal}`,
      metadata: { signal },
    });
    stopBackgroundJobs();
    server.close(() => {
      logSystemEvent({
        source: "server",
        eventType: "shutdown_complete",
        severity: "info",
        message: "HTTP server closed",
        metadata: { signal },
      });
      flushSystemLog().finally(() => process.exit(0));
    });
    setTimeout(() => {
      logSystemEvent({
        source: "server",
        eventType: "shutdown_forced",
        severity: "fatal",
        message: "Forced shutdown timeout reached",
        metadata: { signal },
      });
      flushSystemLog().finally(() => process.exit(1));
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logSystemEvent({
    source: "server",
    eventType: "startup_failed",
    severity: "fatal",
    message: "WTF server startup failed",
    error,
  });
  console.error(error);
  flushSystemLog().finally(() => process.exit(1));
});
