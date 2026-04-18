/**
 * Lazy migration of stale `disk://` URIs on Drive-backed projects.
 *
 * Studio originally shipped with `local_disk` as the only backend.  After
 * the Shape-C hybrid Drive rollout, individual projects may have a
 * `storage_backend` of `google_drive` while the file rows still carry
 * `disk://…` URIs from before the cutover.  We don't run a batch
 * migration — instead, the next time anyone *reads* such a file we copy
 * it to the project's current backend, rewrite the row, and best-effort
 * delete the disk blob.  Reads then proceed against the new URI.
 *
 * This is a no-op for projects whose `storage_backend` matches the
 * scheme of every URI on the row, so the cost in steady state is one
 * `parseStorageUri` per request.  Quota counters aren't touched — the
 * file's bytes are already reserved against the project (the relocation
 * doesn't add new bytes).
 */

import { eq } from "drizzle-orm";
import { db } from "../../db";
import { studioFiles } from "@shared/schema";
import {
  parseStorageUri,
  type DriverContext,
  type StorageBlob,
  type StorageDriver,
} from "./storage-driver";
import { LocalDiskDriver } from "./drivers/local-disk-driver";

/** What kind of URI we're migrating — chooses the namespace under Drive. */
export type MigrateKind = "raw" | "preview" | "thumbnail";

const driverKindFor: Record<MigrateKind, string> = {
  raw: "original",
  preview: "preview",
  thumbnail: "thumbnail",
};

const dbColumnFor: Record<MigrateKind, "sourceUri" | "previewUri" | "thumbnailUri"> = {
  raw: "sourceUri",
  preview: "previewUri",
  thumbnail: "thumbnailUri",
};

/**
 * If `uri` is a `disk://…` URI but the active project driver is not
 * `local_disk`, copy the bytes onto the project's driver, rewrite the
 * studio_files row, and return the new URI.  Otherwise returns `uri`
 * unchanged.  Errors fall back to the original URI so reads don't break
 * just because migration failed.
 */
export async function migrateUriToProjectBackend(opts: {
  fileId: number;
  uri: string;
  kind: MigrateKind;
  driver: StorageDriver;
  context: DriverContext;
  fallbackMimeType: string;
  fallbackFilename: string;
}): Promise<string> {
  const { fileId, uri, kind, driver, context, fallbackMimeType, fallbackFilename } = opts;

  const parsed = parseStorageUri(uri);
  if (!parsed) return uri;
  if (parsed.scheme === "disk" && driver.id === "local_disk") return uri;
  if (parsed.scheme !== "disk") return uri;
  if (driver.id === "local_disk") return uri;

  const localDriver = new LocalDiskDriver();

  let buffer: Buffer;
  let detectedMime = fallbackMimeType;
  try {
    const stream = await localDriver.stream(context, uri);
    if (stream.mimeType && stream.mimeType !== "application/octet-stream") {
      detectedMime = stream.mimeType;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream.stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  } catch (err) {
    console.warn(
      `[studio] lazy-migrate: source disk file unreadable for studioFiles.${fileId} (${kind}):`,
      err
    );
    return uri;
  }

  let newUri: string;
  let newHash: string | undefined;
  try {
    const stored = await driver.upload(
      context,
      {
        buffer,
        mimeType: detectedMime,
        filename: fallbackFilename || "migrated",
      },
      driverKindFor[kind]
    );
    newUri = stored.uri;
    newHash = stored.hash;
  } catch (err) {
    console.warn(
      `[studio] lazy-migrate: upload to ${driver.id} failed for studioFiles.${fileId} (${kind}):`,
      err
    );
    return uri;
  }

  try {
    const column = dbColumnFor[kind];
    const patch: Record<string, unknown> = {
      [column]: newUri,
      updatedAt: new Date(),
    };
    if (kind === "raw" && newHash) {
      patch.fileHash = newHash;
    }
    await db
      .update(studioFiles)
      .set(patch as any)
      .where(eq(studioFiles.id, fileId));
  } catch (err) {
    console.warn(
      `[studio] lazy-migrate: DB rewrite failed for studioFiles.${fileId} (${kind}); ` +
        `serving from new URI but row still points at disk URI:`,
      err
    );
    return newUri;
  }

  await localDriver.remove(context, uri).catch((err) => {
    console.warn(
      `[studio] lazy-migrate: best-effort delete of old disk blob failed (${uri}):`,
      err
    );
  });

  return newUri;
}
