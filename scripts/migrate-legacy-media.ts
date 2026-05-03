#!/usr/bin/env -S node --import=tsx
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq, isNotNull, isNull, like, or } from "drizzle-orm";
import { db, pool } from "../server/db";
import { userMediaLibrary } from "@shared/schema";
import {
  buildMediaObjectKey,
  safeFilenameForMime,
} from "../server/lib/storage/media-keys";
import {
  putObjectFromFile,
  requireObjectStorageConfig,
} from "../server/lib/storage/object-storage";
import { copyToHotCache } from "../server/lib/storage/media-cache";
import { MEDIA_STAGING_DIR, assertInsideRoot } from "../server/lib/storage/paths";

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Math.max(1, Math.min(500, Number(limitArg?.split("=")[1] || 100)));
const legacyUploadsDir =
  process.env.LEGACY_UPLOADS_DIR ||
  process.env.UPLOADS_DIR ||
  path.resolve(process.cwd(), "uploads", "media");

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function stageFileData(mediaId: number, fileData: string, safeFilename: string): Promise<string> {
  const base64 = fileData.includes(",") ? fileData.split(",")[1] : fileData;
  await fs.mkdir(MEDIA_STAGING_DIR, { recursive: true });
  const stagingPath = path.join(MEDIA_STAGING_DIR, `legacy-${mediaId}-${safeFilename}`);
  assertInsideRoot(stagingPath, MEDIA_STAGING_DIR);
  await fs.writeFile(stagingPath, Buffer.from(base64, "base64"));
  return stagingPath;
}

function fileDataBytes(fileData: string): number {
  const base64 = fileData.includes(",") ? fileData.split(",")[1] : fileData;
  return Buffer.from(base64, "base64").length;
}

async function main() {
  if (apply) requireObjectStorageConfig();

  const rows = await db
    .select({
      id: userMediaLibrary.id,
      ownerUserId: userMediaLibrary.ownerUserId,
      title: userMediaLibrary.title,
      sourceUrl: userMediaLibrary.sourceUrl,
      fileData: userMediaLibrary.fileData,
      mimeType: userMediaLibrary.mimeType,
      originalFilename: userMediaLibrary.originalFilename,
      safeFilename: userMediaLibrary.safeFilename,
    })
    .from(userMediaLibrary)
    .where(
      and(
        eq(userMediaLibrary.sourceType, "upload"),
        isNull(userMediaLibrary.objectStorageKey),
        or(like(userMediaLibrary.sourceUrl, "disk://%"), isNotNull(userMediaLibrary.fileData))
      )
    )
    .limit(limit);

  const results: Array<Record<string, unknown>> = [];
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    let cleanupPath: string | null = null;
    try {
      const mimeType = row.mimeType || "application/octet-stream";
      const safeFilename =
        row.safeFilename ||
        safeFilenameForMime(row.originalFilename || row.title || `media-${row.id}`, mimeType);
      let filePath: string | null = null;
      let source = "unknown";

      if (row.sourceUrl?.startsWith("disk://")) {
        const rawName = row.sourceUrl.slice(7);
        if (rawName !== path.basename(rawName)) {
          skipped += 1;
          results.push({ id: row.id, status: "skipped", reason: "unsafe_disk_filename" });
          continue;
        }
        filePath = path.join(legacyUploadsDir, rawName);
        assertInsideRoot(filePath, legacyUploadsDir);
        source = "disk";
      } else if (row.fileData) {
        filePath = apply ? await stageFileData(row.id, row.fileData, safeFilename) : "<db-file-data>";
        cleanupPath = apply ? filePath : null;
        source = "fileData";
      }

      if (!filePath) {
        skipped += 1;
        results.push({ id: row.id, status: "skipped", reason: "no_legacy_source" });
        continue;
      }

      const stat = apply
        ? await fs.stat(filePath)
        : row.fileData
          ? { size: fileDataBytes(row.fileData) }
          : await fs.stat(filePath);

      if (!apply) {
        results.push({
          id: row.id,
          status: "dry-run",
          source,
          bytes: stat.size,
          safeFilename,
        });
        continue;
      }

      const checksumSha256 = await sha256File(filePath);
      const objectKey = buildMediaObjectKey({
        ownerUserId: row.ownerUserId,
        mediaId: row.id,
        originalFilename: row.originalFilename || safeFilename,
        checksumSha256,
      });
      const objectResult = await putObjectFromFile({
        key: objectKey,
        filePath,
        contentType: mimeType,
        contentLength: stat.size,
        metadata: {
          mediaId: String(row.id),
          ownerUserId: String(row.ownerUserId),
          checksumSha256,
        },
      });
      await db
        .update(userMediaLibrary)
        .set({
          sourceUrl: `s3://${objectResult.bucket}/${objectResult.key}`,
          playbackUrl: `/api/media/${row.id}/file`,
          objectStorageBucket: objectResult.bucket,
          objectStorageKey: objectResult.key,
          objectStorageRegion: objectResult.region,
          objectStorageEndpoint: objectResult.endpoint,
          originalFilename: row.originalFilename || safeFilename,
          safeFilename,
          checksumSha256,
          fileSizeBytes: stat.size,
          uploadStatus: "original_uploaded",
          updatedAt: new Date(),
        })
        .where(eq(userMediaLibrary.id, row.id));

      const hotCachePath = await copyToHotCache({
        mediaId: row.id,
        sourcePath: filePath,
        safeFilename,
      });
      await db
        .update(userMediaLibrary)
        .set({
          hotCachePath,
          cacheStatus: "cached",
          lastCachedAt: new Date(),
          lastAccessedAt: new Date(),
          uploadStatus: "ready",
          status: "ready",
          updatedAt: new Date(),
        })
        .where(eq(userMediaLibrary.id, row.id));

      migrated += 1;
      results.push({ id: row.id, status: "migrated", source, bytes: stat.size, objectKey });
    } catch (error) {
      failed += 1;
      await db
        .update(userMediaLibrary)
        .set({ cacheStatus: "needs_repair", updatedAt: new Date() })
        .where(eq(userMediaLibrary.id, row.id))
        .catch(() => undefined);
      results.push({
        id: row.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (cleanupPath) await fs.unlink(cleanupPath).catch(() => undefined);
    }
  }

  console.log(JSON.stringify({ dryRun: !apply, limit, migrated, skipped, failed, results }, null, 2));
}

main()
  .catch((error) => {
    console.error("[migrate-legacy-media] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
