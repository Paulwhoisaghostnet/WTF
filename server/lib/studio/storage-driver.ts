/**
 * Studio storage driver abstraction.
 *
 * Studio separates file metadata (stored in Postgres) from the actual file
 * bytes so we can plug in different storage backends per-project:
 *
 *   - local_disk    → server-owned disk under `uploads/studio/`
 *   - google_drive  → project owner's Drive (BYO 15 GB / Google account)
 *   - future: supabase_storage, cloudflare_r2, ipfs…
 *
 * Each driver exposes a URI scheme ("disk://<rel>", "gdrive://<fileId>")
 * that the DB persists as `source_uri`, and the driver knows how to
 * upload, stream, and delete at that URI.  Callers never assume a driver
 * scheme — they look up the project, get its driver, and delegate.
 */

import { Readable } from "stream";
import type { StudioStorageBackend } from "@shared/types";

/* ── URI helpers ───────────────────────────────────────── */

const DRIVER_SCHEMES: Record<StudioStorageBackend, string> = {
  local_disk: "disk",
  google_drive: "gdrive",
};

export function storageScheme(backend: StudioStorageBackend): string {
  return DRIVER_SCHEMES[backend];
}

export function buildStorageUri(
  backend: StudioStorageBackend,
  opaquePath: string
): string {
  return `${DRIVER_SCHEMES[backend]}://${opaquePath}`;
}

/** Split a stored URI into its scheme and opaque path. */
export function parseStorageUri(uri: string): {
  scheme: string;
  path: string;
} | null {
  const m = /^([a-z_-]+):\/\/(.*)$/.exec(uri);
  if (!m) return null;
  return { scheme: m[1], path: m[2] };
}

/* ── Driver interface ──────────────────────────────────── */

export interface StorageBlob {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export interface StoredObject {
  /** Fully-qualified storage URI, to persist on the file row. */
  uri: string;
  /** Size in bytes of the stored object. */
  sizeBytes: number;
  /** Content type the driver believes this object to be. */
  mimeType: string;
  /** sha256 hex of the content, when the driver computed it. */
  hash?: string;
  /** Arbitrary driver-specific info for downstream use (e.g. Drive id). */
  driverInfo?: Record<string, unknown>;
}

export interface StreamResult {
  stream: Readable;
  sizeBytes: number;
  mimeType: string;
  /** Optional ETag/version identifier from the driver. */
  etag?: string;
}

/**
 * Context a driver may need in order to operate — project id, owner,
 * backend-specific config, etc.  The driver registry builds a concrete
 * context per project before calling into the driver.
 *
 * `persistConfig` is an optional hook — drivers that discover or create
 * resources lazily (e.g. a per-project Drive folder on first upload) can
 * call it to patch `storage_context` on the project row and subsequent
 * requests will read those ids back from the DB copy.
 */
export interface DriverContext {
  projectId: number;
  ownerUserId: number;
  backend: StudioStorageBackend;
  /** Per-project driver config, e.g. drive folder id, account id. */
  config: Record<string, unknown>;
  /** Optional callback to merge patches back into `studio_projects.storage_context`. */
  persistConfig?: (patch: Record<string, unknown>) => Promise<void>;
}

export interface StorageDriver {
  /** Friendly id of this driver ("local_disk", "google_drive"). */
  readonly id: StudioStorageBackend;

  /**
   * Store an original upload.  Returns the URI + metadata to persist
   * on the studio_files row.  The `kind` is a caller-supplied hint that
   * helps some drivers namespace the blob (e.g. "original", "preview",
   * "thumbnail", "version:3").
   */
  upload(
    ctx: DriverContext,
    blob: StorageBlob,
    kind: string
  ): Promise<StoredObject>;

  /** Stream an object back for serving.  Must enforce driver-side checks. */
  stream(ctx: DriverContext, uri: string): Promise<StreamResult>;

  /** Remove an object; idempotent — no-op if already gone. */
  remove(ctx: DriverContext, uri: string): Promise<void>;

  /**
   * True if this driver needs the project owner to complete an OAuth
   * flow (or similar) before it can be used.  Returning true from here
   * causes project creation to redirect to the auth flow.
   */
  requiresUserAuth(): boolean;

  /**
   * Check whether the driver context is fully ready for IO.  For local
   * disk this is always true.  For Google Drive, this requires a valid
   * refreshable credential stored for the owner.
   */
  isReady(ctx: DriverContext): Promise<boolean>;
}
