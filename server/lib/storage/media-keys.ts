import path from "node:path";

const MIME_EXTENSIONS: Record<string, string[]> = {
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov", ".qt"],
  "video/x-matroska": [".mkv"],
  "video/ogg": [".ogv", ".ogg"],
  "video/x-msvideo": [".avi"],
  "image/gif": [".gif"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/ogg": [".ogg", ".oga"],
};

const BLOCKED_MIME_TYPES = new Set([
  "text/html",
  "text/javascript",
  "application/javascript",
  "application/ecmascript",
  "application/x-javascript",
  "application/xhtml+xml",
  "application/wasm",
  "image/svg+xml",
  "image/svg",
]);

function extensionForMime(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType.toLowerCase()]?.[0] ?? ".bin";
}

export function safeFilenameFromUpload(originalFilename: string): string {
  const base = path.basename(String(originalFilename || "").replace(/\\/g, "/"));
  const ext = path.extname(base).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const stem = path
    .basename(base, path.extname(base))
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/_{2,}/g, "_")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120);
  const cleaned = `${stem || "upload"}${ext || ".bin"}`.toLowerCase();
  return cleaned === "." || cleaned === ".." ? "upload.bin" : cleaned;
}

export function validateUploadMimeAndExtension(
  originalFilename: string,
  mimeType: string
): { ok: boolean; reason?: string; safeFilename: string } {
  const mime = String(mimeType || "").toLowerCase().split(";")[0].trim();
  const safeFilename = safeFilenameFromUpload(originalFilename);
  if (!mime || BLOCKED_MIME_TYPES.has(mime)) {
    return { ok: false, reason: "blocked_mime_type", safeFilename };
  }
  const allowed = MIME_EXTENSIONS[mime];
  if (!allowed) return { ok: false, reason: "unsupported_mime_type", safeFilename };
  const ext = path.extname(safeFilename).toLowerCase();
  if (!allowed.includes(ext)) {
    return { ok: false, reason: "extension_mismatch", safeFilename };
  }
  return { ok: true, safeFilename };
}

export function safeFilenameForMime(
  originalFilename: string | undefined,
  mimeType: string
): string {
  const safe = safeFilenameFromUpload(originalFilename || `upload${extensionForMime(mimeType)}`);
  if (path.extname(safe)) return safe;
  return `${safe}${extensionForMime(mimeType)}`;
}

export function buildMediaObjectKey(input: {
  ownerUserId: number;
  mediaId: number;
  originalFilename: string;
  createdAt?: Date;
  checksumSha256?: string | null;
}): string {
  const createdAt = input.createdAt ?? new Date();
  const year = String(createdAt.getUTCFullYear());
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  const safe = safeFilenameFromUpload(input.originalFilename);
  const hash = String(input.checksumSha256 || "nohash").replace(/[^a-f0-9]/gi, "").slice(0, 12);
  const owner = Math.max(0, Math.floor(input.ownerUserId || 0));
  const mediaId = Math.max(0, Math.floor(input.mediaId || 0));
  return ["media", "users", String(owner), year, month, `${mediaId}-${hash || "nohash"}-${safe}`]
    .join("/")
    .replace(/\/{2,}/g, "/");
}

