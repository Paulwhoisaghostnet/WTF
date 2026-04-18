/**
 * Google Drive storage driver.
 *
 * Layout on Drive (all inside the configured root folder):
 *   {root}/
 *     p{projectId}-{safeName}/
 *       original-{fileId}.{ext}
 *       preview-{fileId}.{ext}
 *       thumbnail-{fileId}.{ext}
 *
 * URI shape: `gdrive://{driveFileId}` — Drive ids are globally unique, so
 * we don't need to encode a path.  The per-project folder id is cached in
 * `studio_projects.storage_context.gdrive.folderId` via `persistConfig`
 * so we hit the Drive API once per project to create the folder and
 * never again for its lifetime.
 *
 * Shape-C hybrid: this driver transparently routes to one of two
 * accounts based on the project's `storage_context.gdriveOwner`:
 *   - If `gdriveOwner` is a user id AND that user has a connected
 *     personal Drive → use their account (`studio_storage_accounts`).
 *   - Otherwise → fall back to the platform pool
 *     (`studio_platform_storage`).
 * The choice is made per-project at creation time and locked in on the
 * row, so file reads always hit the same Drive even if the user later
 * disconnects — reads would then error until they reconnect, which is
 * the intended behaviour for "your files live in your storage".
 */

import type {
  DriverContext,
  StorageBlob,
  StorageDriver,
  StoredObject,
  StreamResult,
} from "../storage-driver";
import { buildStorageUri, parseStorageUri } from "../storage-driver";
import { StorageNotFoundError } from "./local-disk-driver";
import {
  GoogleDriveApiError,
  GoogleDriveClient,
  type DriveFileMetadata,
} from "./google-drive-client";
import {
  getOrLoadPlatformDriveClient,
  isPlatformDriveConfigured,
} from "../platform-drive";
import {
  getOrLoadUserDriveClient,
  isUserDriveReady,
} from "../user-drive";
import { createHash } from "crypto";

function safeSegment(name: string, fallback: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return fallback;
  return trimmed
    .replace(/[\/\\\0\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
}

function extensionFor(mimeType: string, fallbackFilename?: string): string {
  const mt = String(mimeType || "").toLowerCase();
  const MAP: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/heic": "heic",
    "application/pdf": "pdf",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "weba",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-matroska": "mkv",
    "video/ogg": "ogv",
    "video/x-msvideo": "avi",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/json": "json",
    "application/zip": "zip",
  };
  if (MAP[mt]) return MAP[mt];
  if (fallbackFilename) {
    const dot = fallbackFilename.lastIndexOf(".");
    if (dot > 0 && dot < fallbackFilename.length - 1) {
      const ext = fallbackFilename.slice(dot + 1).toLowerCase();
      if (ext && ext.length <= 8) return ext;
    }
  }
  return "bin";
}

interface ProjectGdriveConfig {
  folderId?: string;
  folderName?: string;
}

function readConfig(ctx: DriverContext): ProjectGdriveConfig {
  const bag = ctx.config?.gdrive;
  if (bag && typeof bag === "object") {
    return bag as ProjectGdriveConfig;
  }
  return {};
}

/**
 * Pull the `gdriveOwner` marker out of the project's storage_context.
 * Present → route to that user's personal Drive.  Absent → fall back
 * to the platform pool.  Written into storage_context at project
 * creation time in `server/routes/studio.ts`.
 */
function readGdriveOwner(ctx: DriverContext): number | null {
  const raw = (ctx.config as { gdriveOwner?: unknown } | undefined)
    ?.gdriveOwner;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  return null;
}

/**
 * Single entry point for grabbing an authenticated Drive client for
 * this project — user-drive if the project was pinned to a personal
 * account, platform-drive otherwise.  Returns both the client and the
 * root folder id we should create project folders under.
 */
async function resolveClientForContext(ctx: DriverContext): Promise<{
  client: GoogleDriveClient;
  rootFolderId: string;
  ownerMode: "user" | "platform";
}> {
  const owner = readGdriveOwner(ctx);
  if (owner != null) {
    const { client, rootFolderId } = await getOrLoadUserDriveClient(owner);
    return { client, rootFolderId, ownerMode: "user" };
  }
  const resolved = await getOrLoadPlatformDriveClient();
  if (!resolved.rootFolderId) {
    throw new Error(
      "Platform Google Drive has no root folder configured — run the " +
        "admin OAuth setup (Admin → Studio tab)."
    );
  }
  return {
    client: resolved.client,
    rootFolderId: resolved.rootFolderId,
    ownerMode: "platform",
  };
}

async function patchConfig(
  ctx: DriverContext,
  patch: Partial<ProjectGdriveConfig>
): Promise<void> {
  if (!ctx.persistConfig) return;
  const current = readConfig(ctx);
  const merged: ProjectGdriveConfig = { ...current, ...patch };
  await ctx.persistConfig({ gdrive: merged });
  // Mutate the local context so subsequent calls in the same request see
  // the updated ids without re-reading from the DB.
  (ctx.config as { gdrive?: ProjectGdriveConfig }).gdrive = merged;
}

/**
 * Find-or-create the Drive folder backing this project.  The result is
 * cached on `storage_context.gdrive.folderId` so we hit Drive only once
 * per project.  Re-derives from Drive if the cached id is missing or
 * points to a trashed folder.
 */
async function ensureProjectFolderId(
  client: GoogleDriveClient,
  rootFolderId: string,
  ctx: DriverContext,
  projectDisplayName: string
): Promise<string> {
  const cfg = readConfig(ctx);
  if (cfg.folderId) {
    try {
      const meta = await client.getFile(cfg.folderId, "id,trashed,mimeType");
      if (meta.trashed !== true) return meta.id;
    } catch (err) {
      if (!(err instanceof GoogleDriveApiError) || err.status !== 404) {
        throw err;
      }
      // fall through — we'll re-create the folder below
    }
  }
  const folderName = `p${ctx.projectId}-${safeSegment(
    projectDisplayName,
    String(ctx.projectId)
  )}`;
  const folderId = await client.ensureFolderPath(rootFolderId, [folderName]);
  await patchConfig(ctx, { folderId, folderName });
  return folderId;
}

export class GoogleDriveDriver implements StorageDriver {
  readonly id = "google_drive" as const;

  /**
   * Platform-owned Drive — no per-user OAuth needed.  When this returns
   * true, project creation would redirect the user into an OAuth flow;
   * we own the token server-side instead.
   */
  requiresUserAuth(): boolean {
    return false;
  }

  async isReady(ctx: DriverContext): Promise<boolean> {
    const owner = readGdriveOwner(ctx);
    // User-drive path: check the user has a connected account we can
    // decrypt.  We only hit Drive if we have to — otherwise this fires
    // on every project-create call and blows through API budget.
    if (owner != null) {
      return isUserDriveReady(owner);
    }
    if (!isPlatformDriveConfigured()) return false;
    try {
      const { client, rootFolderId } = await getOrLoadPlatformDriveClient();
      if (!rootFolderId) return false;
      await client.getFile(rootFolderId, "id,trashed");
      return true;
    } catch (err) {
      console.warn("[studio] Drive driver isReady check failed:", err);
      return false;
    }
  }

  async upload(
    ctx: DriverContext,
    blob: StorageBlob,
    kind: string
  ): Promise<StoredObject> {
    const { client, rootFolderId } = await resolveClientForContext(ctx);

    // For folder naming we prefer the latest DB display name; fall back
    // to projectId.  Reading the project row again would be pure overhead
    // — callers should (and do) pass it via ctx.config.projectName when
    // useful, but absence is fine.
    const projectDisplayName =
      (typeof ctx.config?.projectName === "string" && ctx.config.projectName) ||
      `project-${ctx.projectId}`;

    const parentId = await ensureProjectFolderId(
      client,
      rootFolderId,
      ctx,
      projectDisplayName
    );

    const ext = extensionFor(blob.mimeType, blob.filename);
    const safeKind = String(kind || "original")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .slice(0, 32) || "original";
    const unique = createHash("sha256")
      .update(blob.buffer)
      .update(String(Date.now()))
      .digest("hex")
      .slice(0, 16);
    const name = `${safeKind}-${unique}.${ext}`;

    const meta = await client.uploadBuffer({
      buffer: blob.buffer,
      mimeType: blob.mimeType,
      name,
      parentId,
    });
    if (!meta.id) {
      throw new Error("Google Drive upload returned no file id");
    }

    return {
      uri: buildStorageUri("google_drive", meta.id),
      sizeBytes: Number(meta.size ?? blob.buffer.length),
      mimeType: meta.mimeType || blob.mimeType,
      hash: meta.md5Checksum,
      driverInfo: {
        driveFileId: meta.id,
        driveParentId: parentId,
        driveFileName: meta.name,
      },
    };
  }

  async stream(ctx: DriverContext, uri: string): Promise<StreamResult> {
    const parsed = parseStorageUri(uri);
    if (!parsed || parsed.scheme !== "gdrive" || !parsed.path) {
      throw new StorageNotFoundError(`Invalid gdrive URI: ${uri}`);
    }
    const fileId = parsed.path;
    const { client } = await resolveClientForContext(ctx);
    try {
      const dl = await client.downloadFile(fileId);
      return {
        stream: dl.stream,
        sizeBytes: dl.sizeBytes,
        mimeType: dl.mimeType,
        etag: dl.etag,
      };
    } catch (err) {
      if (err instanceof GoogleDriveApiError && err.status === 404) {
        throw new StorageNotFoundError(`Drive object missing: ${uri}`);
      }
      throw err;
    }
  }

  async remove(ctx: DriverContext, uri: string): Promise<void> {
    const parsed = parseStorageUri(uri);
    if (!parsed || parsed.scheme !== "gdrive" || !parsed.path) return;
    const { client } = await resolveClientForContext(ctx);
    try {
      await client.deleteFile(parsed.path);
    } catch (err) {
      if (err instanceof GoogleDriveApiError && err.status === 404) return;
      throw err;
    }
  }
}
