import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { tvChannelVideos, userMediaLibrary } from "@shared/schema";
import {
  type CacheEvictionEntry,
  planCacheEviction,
} from "./cache-eviction";
import { MEDIA_HOT_CACHE_DIR, assertInsideRoot } from "./paths";

const DEFAULT_MEDIA_HOT_CACHE_MAX_BYTES = 30 * 1024 ** 3;
const DEFAULT_RESERVED_FREE_BYTES = 15 * 1024 ** 3;

function parseBytes(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function freeBytesForPath(root: string): Promise<number> {
  const stats = await fs.statfs(root).catch(() => null);
  if (!stats) return Number.MAX_SAFE_INTEGER;
  return Number(stats.bavail) * Number(stats.bsize);
}

export async function runMediaHotCacheEviction(opts: {
  dryRun?: boolean;
  maxCacheBytes?: number;
  reservedFreeBytes?: number;
} = {}): Promise<{
  dryRun: boolean;
  root: string;
  beforeBytes: number;
  projectedBytes: number;
  evicted: number;
  protectedCount: number;
  freedBytes: number;
  paths: string[];
}> {
  await fs.mkdir(MEDIA_HOT_CACHE_DIR, { recursive: true });
  const rows = await db
    .select({
      id: userMediaLibrary.id,
      hotCachePath: userMediaLibrary.hotCachePath,
      cacheStatus: userMediaLibrary.cacheStatus,
      lastAccessedAt: userMediaLibrary.lastAccessedAt,
      updatedAt: userMediaLibrary.updatedAt,
    })
    .from(userMediaLibrary)
    .where(isNotNull(userMediaLibrary.hotCachePath));

  const mediaIds = rows.map((row) => row.id);
  const activeRows = mediaIds.length
    ? await db
        .select({ mediaItemId: tvChannelVideos.mediaItemId })
        .from(tvChannelVideos)
        .where(inArray(tvChannelVideos.mediaItemId, mediaIds))
    : [];
  const activeIds = new Set(activeRows.map((row) => row.mediaItemId).filter(Boolean) as number[]);

  const idByPath = new Map<string, number>();
  const entries: CacheEvictionEntry[] = [];
  for (const row of rows) {
    if (!row.hotCachePath) continue;
    try {
      assertInsideRoot(row.hotCachePath, MEDIA_HOT_CACHE_DIR);
      const stat = await fs.stat(row.hotCachePath);
      if (!stat.isFile()) continue;
      idByPath.set(row.hotCachePath, row.id);
      entries.push({
        path: row.hotCachePath,
        sizeBytes: stat.size,
        lastAccessedMs:
          row.lastAccessedAt?.getTime() ??
          row.updatedAt?.getTime() ??
          stat.atimeMs ??
          stat.mtimeMs,
        active: activeIds.has(row.id),
        processing: row.cacheStatus === "caching",
      });
    } catch {
      await db
        .update(userMediaLibrary)
        .set({ cacheStatus: "needs_repair", updatedAt: new Date() })
        .where(eq(userMediaLibrary.id, row.id));
    }
  }

  const maxCacheBytes = opts.maxCacheBytes ?? parseBytes(
    process.env.MEDIA_HOT_CACHE_MAX_BYTES,
    DEFAULT_MEDIA_HOT_CACHE_MAX_BYTES
  );
  const reservedFreeBytes = opts.reservedFreeBytes ?? parseBytes(
    process.env.VOLUME_RESERVED_FREE_BYTES,
    DEFAULT_RESERVED_FREE_BYTES
  );
  const plan = planCacheEviction({
    entries,
    maxCacheBytes,
    currentFreeBytes: await freeBytesForPath(MEDIA_HOT_CACHE_DIR),
    reservedFreeBytes,
  });

  if (!opts.dryRun) {
    for (const entry of plan.evict) {
      assertInsideRoot(entry.path, MEDIA_HOT_CACHE_DIR);
      await fs.unlink(entry.path).catch(() => undefined);
      const id = idByPath.get(entry.path);
      if (id) {
        await db
          .update(userMediaLibrary)
          .set({
            cacheStatus: "evicted",
            hotCachePath: null,
            lastCachedAt: null,
            updatedAt: new Date(),
          })
          .where(and(eq(userMediaLibrary.id, id), eq(userMediaLibrary.hotCachePath, entry.path)));
      }
    }
  }

  return {
    dryRun: Boolean(opts.dryRun),
    root: MEDIA_HOT_CACHE_DIR,
    beforeBytes: plan.startingCacheBytes,
    projectedBytes: plan.projectedCacheBytes,
    evicted: plan.evict.length,
    protectedCount: plan.protectedCount,
    freedBytes: plan.evict.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    paths: plan.evict.map((entry) => path.relative(MEDIA_HOT_CACHE_DIR, entry.path)),
  };
}

