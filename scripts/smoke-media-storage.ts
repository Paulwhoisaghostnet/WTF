#!/usr/bin/env -S node --import=tsx
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { userMediaLibrary, users } from "@shared/schema";
import { buildMediaObjectKey, safeFilenameForMime } from "../server/lib/storage/media-keys";
import { deleteObject, putObjectFromFile, requireObjectStorageConfig } from "../server/lib/storage/object-storage";
import { copyToHotCache, resolveMediaFilePath } from "../server/lib/storage/media-cache";
import { MEDIA_HOT_CACHE_DIR, MEDIA_STAGING_DIR, assertInsideRoot } from "../server/lib/storage/paths";

const keep = process.argv.includes("--keep");
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileSha256(filePath: string): Promise<string> {
  return sha256(await fs.readFile(filePath));
}

async function main() {
  const objectConfig = requireObjectStorageConfig();
  const checksumSha256 = sha256(pngBytes);
  const safeFilename = safeFilenameForMime("wtf-storage-smoke.png", "image/png");
  let mediaId: number | null = null;
  let stagingPath: string | null = null;
  let hotCachePath: string | null = null;
  let objectKey: string | null = null;

  try {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .orderBy(asc(users.id))
      .limit(1);

    if (!owner) {
      throw new Error("No users exist; cannot create temporary media-library smoke row.");
    }

    await fs.mkdir(MEDIA_STAGING_DIR, { recursive: true });
    stagingPath = path.join(MEDIA_STAGING_DIR, `smoke-${Date.now()}-${safeFilename}`);
    assertInsideRoot(stagingPath, MEDIA_STAGING_DIR);
    await fs.writeFile(stagingPath, pngBytes);

    const [created] = await db
      .insert(userMediaLibrary)
      .values({
        ownerUserId: owner.id,
        title: "WTF storage smoke test",
        sourceType: "upload",
        sourceUrl: `staging://${safeFilename}`,
        playbackUrl: null,
        mimeType: "image/png",
        mediaCategory: "image",
        originalFilename: "wtf-storage-smoke.png",
        safeFilename,
        fileSize: pngBytes.length,
        fileSizeBytes: pngBytes.length,
        checksumSha256,
        status: "processing",
        uploadStatus: "staged",
        cacheStatus: "caching",
        metadata: {
          smokeTest: true,
          createdBy: "scripts/smoke-media-storage.ts",
        },
      })
      .returning();
    mediaId = created.id;

    objectKey = buildMediaObjectKey({
      ownerUserId: owner.id,
      mediaId,
      originalFilename: "wtf-storage-smoke.png",
      checksumSha256,
    }).replace(/^media\//, "smoke/media/");

    const objectResult = await putObjectFromFile({
      key: objectKey,
      filePath: stagingPath,
      contentType: "image/png",
      contentLength: pngBytes.length,
      metadata: {
        mediaId: String(mediaId),
        ownerUserId: String(owner.id),
        checksumSha256,
        smokeTest: "true",
      },
    });

    hotCachePath = await copyToHotCache({
      mediaId,
      sourcePath: stagingPath,
      safeFilename,
    });

    await db
      .update(userMediaLibrary)
      .set({
        playbackUrl: `/api/media/${mediaId}/file`,
        sourceUrl: `s3://${objectResult.bucket}/${objectResult.key}`,
        objectStorageBucket: objectResult.bucket,
        objectStorageKey: objectResult.key,
        objectStorageRegion: objectResult.region,
        objectStorageEndpoint: objectResult.endpoint,
        hotCachePath,
        cacheStatus: "cached",
        lastCachedAt: new Date(),
        lastAccessedAt: new Date(),
        uploadStatus: "ready",
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(userMediaLibrary.id, mediaId));

    const cached = await resolveMediaFilePath({
      mediaId,
      hotCachePath,
      objectStorageBucket: objectResult.bucket,
      objectStorageKey: objectResult.key,
      safeFilename,
    });
    if (!cached || cached.promoted) {
      throw new Error("Expected hot cache HIT before cache removal.");
    }
    if ((await fileSha256(cached.path)) !== checksumSha256) {
      throw new Error("Hot cache checksum mismatch.");
    }

    await fs.unlink(hotCachePath);
    await db
      .update(userMediaLibrary)
      .set({
        hotCachePath: null,
        cacheStatus: "evicted",
        updatedAt: new Date(),
      })
      .where(eq(userMediaLibrary.id, mediaId));
    hotCachePath = null;

    const promoted = await resolveMediaFilePath({
      mediaId,
      hotCachePath: null,
      objectStorageBucket: objectResult.bucket,
      objectStorageKey: objectResult.key,
      safeFilename,
    });
    if (!promoted || !promoted.promoted) {
      throw new Error("Expected cache promotion from Object Storage.");
    }
    assertInsideRoot(promoted.path, MEDIA_HOT_CACHE_DIR);
    if ((await fileSha256(promoted.path)) !== checksumSha256) {
      throw new Error("Promoted cache checksum mismatch.");
    }
    hotCachePath = promoted.path;

    const [verified] = await db
      .select({
        uploadStatus: userMediaLibrary.uploadStatus,
        cacheStatus: userMediaLibrary.cacheStatus,
        hotCachePath: userMediaLibrary.hotCachePath,
        objectStorageKey: userMediaLibrary.objectStorageKey,
      })
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.id, mediaId));

    console.log(JSON.stringify({
      ok: true,
      keep,
      mediaId,
      ownerUserId: owner.id,
      bucket: objectResult.bucket,
      objectKey: objectResult.key,
      bytes: pngBytes.length,
      cacheHitVerified: true,
      promotionVerified: true,
      db: verified,
    }, null, 2));
  } finally {
    if (!keep) {
      if (mediaId) {
        await db.delete(userMediaLibrary).where(eq(userMediaLibrary.id, mediaId)).catch(() => undefined);
      }
      if (hotCachePath) {
        await fs.unlink(hotCachePath).catch(() => undefined);
      }
      if (stagingPath) {
        await fs.unlink(stagingPath).catch(() => undefined);
      }
      if (objectKey) {
        await deleteObject({ bucket: objectConfig.bucket, key: objectKey }).catch(() => undefined);
      }
    }
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[smoke-media-storage] failed:", error);
  process.exitCode = 1;
});
