#!/usr/bin/env -S node --import=tsx
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { desc } from "drizzle-orm";
import { db, pool } from "../server/db";
import { userMediaLibrary } from "@shared/schema";
import { BACKUPS_STAGING_DIR } from "../server/lib/storage/paths";

async function main() {
  const outDir = process.env.MANIFEST_BACKUP_DIR || path.join(BACKUPS_STAGING_DIR, "manifests");
  await fs.mkdir(outDir, { recursive: true });
  const filename = `media-manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const filepath = path.join(outDir, filename);
  const rows = await db
    .select({
      id: userMediaLibrary.id,
      ownerUserId: userMediaLibrary.ownerUserId,
      ownerWallet: userMediaLibrary.ownerWallet,
      sourceType: userMediaLibrary.sourceType,
      objectStorageBucket: userMediaLibrary.objectStorageBucket,
      objectStorageKey: userMediaLibrary.objectStorageKey,
      objectStorageRegion: userMediaLibrary.objectStorageRegion,
      objectStorageEndpoint: userMediaLibrary.objectStorageEndpoint,
      originalFilename: userMediaLibrary.originalFilename,
      safeFilename: userMediaLibrary.safeFilename,
      mimeType: userMediaLibrary.mimeType,
      fileSizeBytes: userMediaLibrary.fileSizeBytes,
      checksumSha256: userMediaLibrary.checksumSha256,
      cacheStatus: userMediaLibrary.cacheStatus,
      hotCachePath: userMediaLibrary.hotCachePath,
      createdAt: userMediaLibrary.createdAt,
      updatedAt: userMediaLibrary.updatedAt,
      deletedAt: userMediaLibrary.deletedAt,
    })
    .from(userMediaLibrary)
    .orderBy(desc(userMediaLibrary.updatedAt));

  const stream = createWriteStream(filepath, { encoding: "utf8" });
  for (const row of rows) {
    stream.write(`${JSON.stringify(row)}\n`);
  }
  await new Promise<void>((resolve, reject) => {
    stream.end(resolve);
    stream.on("error", reject);
  });
  await pipeline(
    await import("node:fs").then(({ createReadStream }) => createReadStream(filepath)),
    await import("node:zlib").then(({ createGzip }) => createGzip()),
    createWriteStream(`${filepath}.gz`)
  );
  await fs.unlink(filepath);
  console.log(JSON.stringify({ file: `${filepath}.gz`, rows: rows.length }, null, 2));
}

main()
  .catch((error) => {
    console.error("[backup-manifest] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });

