import type { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import {
  tvBumpers,
  tvChannelVideos,
  tvChannels,
  tvPlaylistItems,
  userMediaLibrary,
  userWallets,
  users,
  walletHoldings,
} from "@shared/schema";
import {
  latestObjectStorageUsageStatus,
  runObjectStorageUsageCheck,
} from "../../lib/storage/object-storage-usage";
import { verifyObjectStorageAccess } from "../../lib/storage/object-storage";
import { readTvCacheStats } from "../tv/cache-storage";

export function registerAdminMediaStorageRoutes(router: Router) {
  router.get(
    "/api/admin/media",
    requirePermission("manage_media"),
    async (_req, res) => {
      try {
        const rows = await db
          .select({
            id: userMediaLibrary.id,
            ownerUserId: userMediaLibrary.ownerUserId,
            title: userMediaLibrary.title,
            sourceType: userMediaLibrary.sourceType,
            mimeType: userMediaLibrary.mimeType,
            mediaCategory: userMediaLibrary.mediaCategory,
            status: userMediaLibrary.status,
            fileSize: userMediaLibrary.fileSize,
            fileSizeBytes: userMediaLibrary.fileSizeBytes,
            cacheStatus: userMediaLibrary.cacheStatus,
            objectStorageBucket: userMediaLibrary.objectStorageBucket,
            objectStorageKey: userMediaLibrary.objectStorageKey,
            hotCachePath: userMediaLibrary.hotCachePath,
            tokenContract: userMediaLibrary.tokenContract,
            tokenId: userMediaLibrary.tokenId,
            createdAt: userMediaLibrary.createdAt,
            ownerUsername: users.username,
          })
          .from(userMediaLibrary)
          .innerJoin(users, eq(userMediaLibrary.ownerUserId, users.id))
          .orderBy(desc(userMediaLibrary.createdAt))
          .limit(500);

        res.json(rows);
      } catch (err) {
        console.error("[admin] media list error:", err);
        res.status(500).json({ error: "Failed to list media" });
      }
    }
  );

  router.put(
    "/api/admin/media/:id/status",
    requirePermission("manage_media"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        const status = String(req.body?.status || "").trim();
        if (!["draft", "processing", "ready", "blocked"].includes(status)) {
          return res.status(400).json({ error: "Invalid status" });
        }

        const [updated] = await db
          .update(userMediaLibrary)
          .set({ status: status as any, updatedAt: new Date() })
          .where(eq(userMediaLibrary.id, id))
          .returning();

        if (!updated) return res.status(404).json({ error: "Media not found" });
        res.json(updated);
      } catch (err) {
        console.error("[admin] media status update error:", err);
        res.status(500).json({ error: "Failed to update media status" });
      }
    }
  );

  router.delete(
    "/api/admin/media/:id",
    requirePermission("manage_media"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        await db.delete(userMediaLibrary).where(eq(userMediaLibrary.id, id));
        res.json({ ok: true });
      } catch (err) {
        console.error("[admin] media delete error:", err);
        res.status(500).json({ error: "Failed to delete media" });
      }
    }
  );

  router.get(
    "/api/admin/storage/status",
    requirePermission("manage_settings"),
    async (_req, res) => {
      try {
        const [objectStorage, objectStorageAccess, tvCache] = await Promise.all([
          latestObjectStorageUsageStatus(),
          verifyObjectStorageAccess(),
          readTvCacheStats().catch((error) => ({
            error: error instanceof Error ? error.message : String(error),
          })),
        ]);
        res.json({
          objectStorage,
          objectStorageAccess,
          tvCache,
          paths: {
            wtfDataRoot: process.env.WTF_DATA_ROOT || "/mnt/wtf-data",
            uploadStaging:
              process.env.UPLOAD_STAGING_DIR || "/mnt/wtf-data/uploads-staging",
            mediaHotCache:
              process.env.MEDIA_HOT_CACHE_DIR || "/mnt/wtf-data/tv-cache/users",
            tmpProcessing:
              process.env.TMP_PROCESSING_DIR || "/mnt/wtf-data/tmp-processing",
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[admin] storage status error:", err);
        res.status(500).json({ error: "Failed to load storage status" });
      }
    }
  );

  router.post(
    "/api/admin/storage/object-usage-check",
    requirePermission("manage_settings"),
    async (_req, res) => {
      try {
        const result = await runObjectStorageUsageCheck();
        res.json(result);
      } catch (err) {
        console.error("[admin] object usage check error:", err);
        res.status(500).json({ error: "Failed to run object storage usage check" });
      }
    }
  );

  router.get(
    "/api/admin/diagnostics",
    requirePermission("manage_settings"),
    async (_req, res) => {
      try {
        const [
          userCount,
          walletCount,
          tokenCount,
          mediaCount,
          channelCount,
          videoCount,
          playlistItemCount,
          bumperCount,
        ] = await Promise.all([
          db.select({ count: sql<number>`count(*)::int` }).from(users),
          db.select({ count: sql<number>`count(*)::int` }).from(userWallets),
          db.select({ count: sql<number>`count(*)::int` }).from(walletHoldings),
          db.select({ count: sql<number>`count(*)::int` }).from(userMediaLibrary),
          db.select({ count: sql<number>`count(*)::int` }).from(tvChannels),
          db.select({ count: sql<number>`count(*)::int` }).from(tvChannelVideos),
          db.select({ count: sql<number>`count(*)::int` }).from(tvPlaylistItems),
          db.select({ count: sql<number>`count(*)::int` }).from(tvBumpers),
        ]);

        res.json({
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version,
          counts: {
            users: userCount[0]?.count || 0,
            wallets: walletCount[0]?.count || 0,
            tokens: tokenCount[0]?.count || 0,
            media: mediaCount[0]?.count || 0,
            tvChannels: channelCount[0]?.count || 0,
            tvVideos: videoCount[0]?.count || 0,
            tvPlaylistItems: playlistItemCount[0]?.count || 0,
            tvBumpers: bumperCount[0]?.count || 0,
          },
        });
      } catch (err) {
        console.error("[admin] diagnostics error:", err);
        res.status(500).json({ error: "Failed to load diagnostics" });
      }
    }
  );
}
