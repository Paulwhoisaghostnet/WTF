/**
 * Local disk storage driver for Studio.
 *
 * Layout:
 *   {STUDIO_STORAGE_ROOT}/{projectId}/{kind}/{uuid}{ext}
 *
 * Where:
 *   STUDIO_STORAGE_ROOT is configurable via env; defaults to
 *     process.cwd()/uploads/studio
 *   kind namespaces the file type: "original", "preview",
 *     "thumbnail", "version-{N}", etc.
 *
 * URI shape: disk://{projectId}/{kind}/{filename}
 *
 * The driver never stores absolute paths in the DB — only the relative
 * scheme so the storage root can be relocated without a DB migration.
 */

import { promises as fs, createReadStream } from "fs";
import path from "path";
import { randomBytes, createHash } from "crypto";
import { Readable } from "stream";
import type {
  DriverContext,
  StorageBlob,
  StorageDriver,
  StoredObject,
  StreamResult,
} from "../storage-driver";
import { buildStorageUri, parseStorageUri } from "../storage-driver";

const STORAGE_ROOT =
  process.env.STUDIO_STORAGE_ROOT ||
  path.resolve(process.cwd(), "uploads", "studio");

function extensionFor(mimeType: string, fallbackFilename?: string): string {
  const mt = String(mimeType || "").toLowerCase();
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/heic": ".heic",
    "application/pdf": ".pdf",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/ogg": ".ogg",
    "audio/webm": ".weba",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-matroska": ".mkv",
    "video/ogg": ".ogv",
    "video/x-msvideo": ".avi",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "application/json": ".json",
    "application/zip": ".zip",
  };
  if (map[mt]) return map[mt];
  if (fallbackFilename) {
    const ext = path.extname(fallbackFilename);
    if (ext && ext.length <= 8) return ext;
  }
  return ".bin";
}

function safeKind(kind: string): string {
  return String(kind || "original")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .slice(0, 32) || "original";
}

function projectDir(projectId: number): string {
  return path.join(STORAGE_ROOT, String(projectId));
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function resolveFromUri(uri: string): string | null {
  const parsed = parseStorageUri(uri);
  if (!parsed || parsed.scheme !== "disk") return null;
  const clean = parsed.path.replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  for (const p of parts) {
    if (p === "." || p === ".." || p.includes("\0")) return null;
  }
  return path.join(STORAGE_ROOT, ...parts);
}

export class LocalDiskDriver implements StorageDriver {
  readonly id = "local_disk" as const;

  requiresUserAuth(): boolean {
    return false;
  }

  async isReady(): Promise<boolean> {
    try {
      await ensureDir(STORAGE_ROOT);
      return true;
    } catch {
      return false;
    }
  }

  async upload(
    ctx: DriverContext,
    blob: StorageBlob,
    kind: string
  ): Promise<StoredObject> {
    const bucket = safeKind(kind);
    const dir = path.join(projectDir(ctx.projectId), bucket);
    await ensureDir(dir);

    const filename = `${randomBytes(16).toString("hex")}${extensionFor(
      blob.mimeType,
      blob.filename
    )}`;
    const abs = path.join(dir, filename);
    await fs.writeFile(abs, blob.buffer);

    const hash = createHash("sha256").update(blob.buffer).digest("hex");
    const rel = `${ctx.projectId}/${bucket}/${filename}`;
    return {
      uri: buildStorageUri("local_disk", rel),
      sizeBytes: blob.buffer.length,
      mimeType: blob.mimeType,
      hash,
      driverInfo: { relativePath: rel, storageRoot: STORAGE_ROOT },
    };
  }

  async stream(_ctx: DriverContext, uri: string): Promise<StreamResult> {
    const abs = resolveFromUri(uri);
    if (!abs) {
      throw new StorageNotFoundError(`Invalid disk URI: ${uri}`);
    }
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      throw new StorageNotFoundError(`Disk object missing: ${uri}`);
    }
    const stream: Readable = createReadStream(abs);
    return {
      stream,
      sizeBytes: stat.size,
      mimeType: "application/octet-stream",
      etag: `"${stat.size}-${Math.floor(stat.mtimeMs)}"`,
    };
  }

  async remove(_ctx: DriverContext, uri: string): Promise<void> {
    const abs = resolveFromUri(uri);
    if (!abs) return;
    try {
      await fs.unlink(abs);
    } catch {
      // Idempotent — ignore missing file.
    }
  }
}

/** Distinct error thrown when an object backing a URI is gone. */
export class StorageNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageNotFoundError";
  }
}

/** Exposed for diagnostics / admin tooling. */
export { STORAGE_ROOT as LOCAL_DISK_STORAGE_ROOT };
