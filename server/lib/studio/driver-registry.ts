/**
 * Lookup and instantiation layer for Studio storage drivers.
 *
 * Route handlers call `resolveDriverForProject(project)` and receive both
 * the concrete driver and a project-scoped `DriverContext` ready for
 * upload / stream / remove.  The context's `persistConfig` callback
 * patches `studio_projects.storage_context` transparently so drivers can
 * cache per-project resources (e.g. Drive folder ids) on first use.
 */

import { eq } from "drizzle-orm";
import type { StudioStorageBackend } from "@shared/types";
import type { DriverContext, StorageDriver } from "./storage-driver";
import { LocalDiskDriver } from "./drivers/local-disk-driver";
import { GoogleDriveDriver } from "./drivers/google-drive-driver";
import { db } from "../../db";
import { studioProjects } from "@shared/schema";
import { isPlatformDriveConfigured } from "./platform-drive";
import { isUserDriveReady } from "./user-drive";

const drivers: Record<StudioStorageBackend, StorageDriver> = {
  local_disk: new LocalDiskDriver(),
  google_drive: new GoogleDriveDriver(),
};

export function getDriver(backend: StudioStorageBackend): StorageDriver {
  const drv = drivers[backend];
  if (!drv) {
    throw new Error(`Unknown Studio storage backend: ${backend}`);
  }
  return drv;
}

/**
 * Convenience type matching the minimum a project row needs to resolve
 * its driver.  Callers typically pass a drizzle row — extra fields are
 * ignored.
 */
export interface ProjectDriverInfo {
  id: number;
  name?: string;
  ownerUserId: number;
  storageBackend: StudioStorageBackend;
  storageContext: Record<string, unknown> | null | undefined;
}

export interface ResolvedDriver {
  driver: StorageDriver;
  context: DriverContext;
}

export function resolveDriverForProject(
  project: ProjectDriverInfo
): ResolvedDriver {
  const driver = getDriver(project.storageBackend);
  const baseConfig: Record<string, unknown> = {
    ...(project.storageContext ?? {}),
  };
  if (project.name) {
    baseConfig.projectName = project.name;
  }
  const context: DriverContext = {
    projectId: project.id,
    ownerUserId: project.ownerUserId,
    backend: project.storageBackend,
    config: baseConfig,
    persistConfig: async (patch) => {
      if (!patch || typeof patch !== "object") return;
      // Merge the patch onto the existing storage_context so multiple
      // drivers (or multiple keys on the same driver) can coexist.
      const [current] = await db
        .select({ storageContext: studioProjects.storageContext })
        .from(studioProjects)
        .where(eq(studioProjects.id, project.id))
        .limit(1);
      const merged = {
        ...((current?.storageContext as Record<string, unknown>) ?? {}),
        ...patch,
      };
      await db
        .update(studioProjects)
        .set({ storageContext: merged, updatedAt: new Date() })
        .where(eq(studioProjects.id, project.id));
    },
  };
  return { driver, context };
}

export function listSupportedBackends(): StudioStorageBackend[] {
  return Object.keys(drivers) as StudioStorageBackend[];
}

/**
 * Selection result for newly-created projects — both the storage
 * backend and the extra `storageContext` bits (notably `gdriveOwner`)
 * that the driver will later use to dispatch between a user's
 * personal Drive and the platform pool.
 */
export interface DefaultBackendChoice {
  backend: StudioStorageBackend;
  /** Merged into `studio_projects.storage_context` at insert time. */
  storageContext: Record<string, unknown>;
}

/**
 * Preferred backend for newly-created projects.  Shape-C hybrid:
 *
 *   1. If the creating user has a personal Drive connected → use it
 *      (pins `gdriveOwner` onto storage_context so driver dispatch
 *      always hits that user's account, even for teammates reading).
 *   2. Else if the platform Drive is connected → use it.
 *   3. Else → local disk so dev/test deployments keep working.
 *
 * Owner preference is sticky on the project row; if the user later
 * disconnects their Drive, their existing projects break until they
 * reconnect — same user gesture recovers them.
 */
export async function chooseDefaultBackend(
  ownerUserId: number
): Promise<DefaultBackendChoice> {
  if (ownerUserId > 0) {
    try {
      if (await isUserDriveReady(ownerUserId)) {
        return {
          backend: "google_drive",
          storageContext: { gdriveOwner: ownerUserId },
        };
      }
    } catch {
      /* fall through to platform / local */
    }
  }
  if (!isPlatformDriveConfigured()) {
    return { backend: "local_disk", storageContext: {} };
  }
  try {
    const drv = drivers.google_drive;
    const ready = await drv.isReady({
      projectId: 0,
      ownerUserId,
      backend: "google_drive",
      config: {},
    });
    return ready
      ? { backend: "google_drive", storageContext: {} }
      : { backend: "local_disk", storageContext: {} };
  } catch {
    return { backend: "local_disk", storageContext: {} };
  }
}

/** Default per-project quota (bytes) for a given backend. */
export function defaultQuotaForBackend(backend: StudioStorageBackend): number {
  if (backend === "google_drive") {
    // 5 GB — conservative default so a 2 TB platform pool scales to
    // ~400 projects and a user's own 15 GB account doesn't fill up
    // after two or three projects.  Owners can raise per-project via
    // an update endpoint.  Matches `defaultQuotaBytes` in quota.ts.
    return 5 * 1024 * 1024 * 1024;
  }
  // Legacy default for local disk is 500 MB.  We keep that to avoid
  // filling a server volume by accident.
  return 500 * 1024 * 1024;
}
