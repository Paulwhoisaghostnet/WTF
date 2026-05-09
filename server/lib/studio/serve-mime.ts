/**
 * Safe MIME/disposition helpers for Studio file streaming.
 *
 * Storage drivers may not preserve a useful content type for local
 * derivatives, so route code supplies deterministic fallbacks before a
 * preview reaches the browser.
 */

const ALLOWED_TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
]);

const BLOCKED_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/svg",
  "text/html",
  "application/xhtml+xml",
  "application/javascript",
  "application/ecmascript",
  "application/x-javascript",
  "text/javascript",
  "text/ecmascript",
  "application/wasm",
]);

const INLINE_SAFE_MIME_PREFIXES = ["image/", "audio/", "video/"];
const INLINE_SAFE_MIME_TYPES = new Set(["application/pdf"]);

export type StudioFileStreamKind = "raw" | "preview" | "thumbnail";

/**
 * Mime types that are safe to render inline in a same-origin context.
 * Everything else gets `Content-Disposition: attachment` so the browser
 * downloads instead of executing. Keep this list narrow.
 */
export function isInlineSafeStudioMime(mime: string): boolean {
  const m = String(mime || "").toLowerCase();
  if (BLOCKED_MIME_TYPES.has(m)) return false;
  if (m === "image/svg+xml") return false;
  if (INLINE_SAFE_MIME_TYPES.has(m)) return true;
  return INLINE_SAFE_MIME_PREFIXES.some((p) => m.startsWith(p));
}

/**
 * Force a safe Content-Type on the wire. We never trust the stored mime
 * once it leaves the API: HTML, SVG, and JS are downgraded regardless of
 * what was in the DB.
 */
export function safeStudioServeMimeType(stored: string): string {
  const m = String(stored || "").toLowerCase().trim();
  if (!m) return "application/octet-stream";
  if (BLOCKED_MIME_TYPES.has(m)) return "application/octet-stream";
  if (m === "image/svg+xml") return "application/octet-stream";
  if (m.startsWith("text/")) {
    return ALLOWED_TEXT_TYPES.has(m) ? m : "text/plain; charset=utf-8";
  }
  return m;
}

export function fallbackStudioStreamMime(input: {
  kind: StudioFileStreamKind;
  originalMimeType: string;
  hasDerivative: boolean;
}): string {
  const original = String(input.originalMimeType || "")
    .toLowerCase()
    .trim();
  if (!input.hasDerivative) {
    return original || "application/octet-stream";
  }
  if (input.kind === "thumbnail") return "image/webp";
  if (input.kind === "preview") {
    if (original.startsWith("image/")) return "image/webp";
    if (original.startsWith("video/")) return "image/jpeg";
  }
  return original || "application/octet-stream";
}

export function quoteStudioFilenameForHeader(name: string): string {
  const sanitised = String(name || "file")
    .replace(/[\\\r\n"]/g, "_")
    .slice(0, 200);
  const encoded = encodeURIComponent(sanitised);
  return `filename="${sanitised}"; filename*=UTF-8''${encoded}`;
}
