/**
 * Per-project storage quota helpers.
 *
 * Every upload/delete path runs through `reserveStorage` / `releaseStorage`
 * so the `studio_projects.storage_used_bytes` counter stays in sync with
 * what's actually on disk / in Drive.  A reconciliation job (admin
 * endpoint) can recompute from the files table if needed.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { studioProjects } from "@shared/schema";
import type { StudioStorageBackend } from "@shared/types";

export class StorageQuotaExceededError extends Error {
  readonly quotaBytes: number;
  readonly attemptedBytes: number;
  constructor(quotaBytes: number, attemptedBytes: number) {
    super(
      `Project storage quota exceeded — attempted ${attemptedBytes} bytes, ` +
        `cap is ${quotaBytes} bytes.`
    );
    this.name = "StorageQuotaExceededError";
    this.quotaBytes = quotaBytes;
    this.attemptedBytes = attemptedBytes;
  }
}

/** Default quota per backend at project-create time. */
export function defaultQuotaBytes(backend: StudioStorageBackend): number {
  const LOCAL_DEFAULT = Number(
    process.env.STUDIO_LOCAL_PROJECT_QUOTA_BYTES || 524_288_000 // 500 MB
  );
  // 5 GB per Drive-backed project.  Against a 2 TB platform pool this
  // fits ~400 projects without over-committing, and on a user's own
  // 15 GB free Drive account it leaves room for 2–3 projects before
  // they need to clean up.  Admin / user can raise per-project via
  // an update endpoint.  Override with STUDIO_DRIVE_PROJECT_QUOTA_BYTES.
  const DRIVE_DEFAULT = Number(
    process.env.STUDIO_DRIVE_PROJECT_QUOTA_BYTES || 5_368_709_120 // 5 GB
  );
  return backend === "google_drive" ? DRIVE_DEFAULT : LOCAL_DEFAULT;
}

/** Hard per-file upload cap for a given backend. */
export function maxFileUploadBytes(backend: StudioStorageBackend): number {
  const LOCAL = Number(process.env.STUDIO_LOCAL_FILE_MAX_BYTES || 52_428_800); // 50 MB
  // Drive's resumable upload path comfortably handles 2 GB; we leave the
  // default at 1 GB so previews & memory pressure stay reasonable.
  const DRIVE = Number(process.env.STUDIO_DRIVE_FILE_MAX_BYTES || 1_073_741_824); // 1 GB
  return backend === "google_drive" ? DRIVE : LOCAL;
}

/**
 * Atomically bump storage_used_bytes if the project still has room.
 * Returns the updated row on success, or throws `StorageQuotaExceededError`.
 */
export async function reserveStorage(
  projectId: number,
  bytes: number
): Promise<void> {
  if (bytes <= 0) return;
  const [updated] = await db
    .update(studioProjects)
    .set({
      storageUsedBytes: sql`${studioProjects.storageUsedBytes} + ${bytes}`,
      updatedAt: new Date(),
    })
    .where(
      sql`${studioProjects.id} = ${projectId} AND ${studioProjects.storageUsedBytes} + ${bytes} <= ${studioProjects.storageQuotaBytes}`
    )
    .returning({
      id: studioProjects.id,
      used: studioProjects.storageUsedBytes,
      quota: studioProjects.storageQuotaBytes,
    });

  if (!updated) {
    const [project] = await db
      .select({
        used: studioProjects.storageUsedBytes,
        quota: studioProjects.storageQuotaBytes,
      })
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);
    throw new StorageQuotaExceededError(
      project?.quota ?? 0,
      (project?.used ?? 0) + bytes
    );
  }
}

/** Release `bytes` back to the project quota; floors at zero. */
export async function releaseStorage(
  projectId: number,
  bytes: number
): Promise<void> {
  if (bytes <= 0) return;
  await db
    .update(studioProjects)
    .set({
      storageUsedBytes: sql`GREATEST(0, ${studioProjects.storageUsedBytes} - ${bytes})`,
      updatedAt: new Date(),
    })
    .where(eq(studioProjects.id, projectId));
}
