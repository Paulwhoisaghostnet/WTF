import { createServer } from "http";
import { createApp } from "./app";
import { setupVite } from "./vite";
import { serveStatic } from "./static";
import { setupWebSocket } from "./websocket";
import { startBackgroundJobs, stopBackgroundJobs } from "./lib/background-jobs";
import { readTvCacheStats, migrateTvCacheKeys } from "./routes/tv";
import { runTvBootBackfill } from "./lib/tv-boot-backfill";
import { runGameshowBootBackfill } from "./lib/gameshow-boot-backfill";

async function main() {
  const app = await createApp();
  const server = createServer(app);

  setupWebSocket(server);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
    startBackgroundJobs();
  } else {
    await setupVite(app, server);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", async () => {
    console.log(`WTF Gameshow running on http://localhost:${port}`);
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

  const shutdown = () => {
    console.log("[server] shutting down...");
    stopBackgroundJobs();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(console.error);
