import { createReadStream, createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { db } from "../../db";
import { userMediaLibrary } from "@shared/schema";
import { eq } from "drizzle-orm";
import { downloadObjectToFile } from "./object-storage";
import { MEDIA_HOT_CACHE_DIR, assertInsideRoot } from "./paths";

export function mediaHotCachePath(mediaId: number, safeFilename: string): string {
  const id = Math.max(0, Math.floor(mediaId || 0));
  const shard = String(id % 1000).padStart(3, "0");
  return path.join(MEDIA_HOT_CACHE_DIR, shard, String(id), safeFilename);
}

export async function promoteMediaObjectToHotCache(input: {
  mediaId: number;
  bucket: string | null;
  key: string;
  safeFilename: string;
}): Promise<string> {
  const destinationPath = mediaHotCachePath(input.mediaId, input.safeFilename);
  assertInsideRoot(destinationPath, MEDIA_HOT_CACHE_DIR);
  await downloadObjectToFile({
    bucket: input.bucket,
    key: input.key,
    destinationPath,
  });
  await db
    .update(userMediaLibrary)
    .set({
      cacheStatus: "cached",
      hotCachePath: destinationPath,
      lastCachedAt: new Date(),
      lastAccessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(userMediaLibrary.id, input.mediaId));
  return destinationPath;
}

export async function resolveMediaFilePath(input: {
  mediaId: number;
  hotCachePath?: string | null;
  objectStorageBucket?: string | null;
  objectStorageKey?: string | null;
  safeFilename?: string | null;
}): Promise<{ path: string; promoted: boolean } | null> {
  if (input.hotCachePath) {
    try {
      assertInsideRoot(input.hotCachePath, MEDIA_HOT_CACHE_DIR);
      const stat = await fs.stat(input.hotCachePath);
      if (stat.isFile() && stat.size > 0) {
        await db
          .update(userMediaLibrary)
          .set({ lastAccessedAt: new Date(), updatedAt: new Date() })
          .where(eq(userMediaLibrary.id, input.mediaId));
        return { path: input.hotCachePath, promoted: false };
      }
    } catch {
      /* fall through to object storage promotion */
    }
  }

  if (!input.objectStorageKey || !input.safeFilename) return null;
  try {
    const promotedPath = await promoteMediaObjectToHotCache({
      mediaId: input.mediaId,
      bucket: input.objectStorageBucket ?? null,
      key: input.objectStorageKey,
      safeFilename: input.safeFilename,
    });
    return { path: promotedPath, promoted: true };
  } catch (error) {
    await db
      .update(userMediaLibrary)
      .set({ cacheStatus: "source_missing", updatedAt: new Date() })
      .where(eq(userMediaLibrary.id, input.mediaId));
    throw error;
  }
}

export async function copyToHotCache(input: {
  mediaId: number;
  sourcePath: string;
  safeFilename: string;
}): Promise<string> {
  const destinationPath = mediaHotCachePath(input.mediaId, input.safeFilename);
  assertInsideRoot(destinationPath, MEDIA_HOT_CACHE_DIR);
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await pipeline(createReadStream(input.sourcePath), createWriteStream(destinationPath));
  return destinationPath;
}
