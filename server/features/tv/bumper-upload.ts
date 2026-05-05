import path from "path";
import { promises as fsPromises } from "fs";
import multer from "multer";

export const BUMPER_MAX_FILE_BYTES = 80 * 1024 * 1024;
export const BUMPER_MAX_DURATION_MS = 30_000;

// Widened for the rebuild.  Any image/* mime that browsers animate
// (gif, webp, apng) plus the common web-safe video containers.  Token
// videos stay constrained by the token's own mimetype upstream — this
// list only affects user-uploaded interstitials.
export const BUMPER_ALLOWED_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-matroska",
  "image/gif",
  "image/webp",
  "image/apng",
  "image/png",
  "image/jpeg",
]);

export const BUMPER_UPLOADS_DIR =
  process.env.BUMPER_UPLOADS_DIR ||
  path.resolve(process.cwd(), "uploads", "bumpers");

export async function ensureBumperDir() {
  await fsPromises.mkdir(BUMPER_UPLOADS_DIR, { recursive: true });
}

export function bumperExtensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "video/mp4":        return ".mp4";
    case "video/webm":       return ".webm";
    case "video/ogg":        return ".ogv";
    case "video/quicktime":  return ".mov";
    case "video/x-matroska": return ".mkv";
    case "image/gif":        return ".gif";
    case "image/webp":       return ".webp";
    case "image/apng":       return ".apng";
    case "image/png":        return ".png";
    case "image/jpeg":       return ".jpg";
    default:                 return ".bin";
  }
}

export function bumperFilename(mimeType: string): string {
  const ext = bumperExtensionForMime(mimeType);
  const hex = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join("");
  return `${hex}${ext}`;
}

export const bumperUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BUMPER_MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    // Accept everything on the allowlist; the route handler rejects
    // unknown mime types with a clear error message for the user
    // (multer's default on `false` is a silent drop that looks like a
    // missing file on the client).
    if (BUMPER_ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});
