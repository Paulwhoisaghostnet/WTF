/**
 * Shared media helpers used by TV routes and the media library.
 */

export function isPlayableMimeType(mimeType: string): boolean {
  const value = String(mimeType || "").toLowerCase().trim();
  if (!value) return false;
  return value.startsWith("video/") || value === "image/gif";
}

export function isImageMimeType(mimeType: string): boolean {
  const value = String(mimeType || "").toLowerCase().trim();
  return value.startsWith("image/");
}

export function guessMimeTypeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m3u8")) return "application/x-mpegURL";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

export function parseFormatsFromMetadata(metadata: any): Array<{
  uri: string;
  mimeType: string;
}> {
  if (!metadata || typeof metadata !== "object") return [];
  const formats = Array.isArray(metadata.formats) ? metadata.formats : [];
  const parsed: Array<{ uri: string; mimeType: string }> = [];
  for (const row of formats) {
    const uri = String(row?.uri || "").trim();
    const mimeType = String(row?.mimeType || row?.mime_type || "").trim();
    if (!uri || !mimeType) continue;
    parsed.push({ uri, mimeType });
  }
  return parsed;
}

export type PlayableAsset = {
  sourceUri: string;
  mimeType: string;
  title: string | null;
  thumbnailUri: string | null;
};

export type ImageAsset = {
  sourceUri: string;
  mimeType: string;
  title: string | null;
};

const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

export function normalizeIpfsUri(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed.startsWith("ipfs://")) {
    const path = trimmed
      .replace(/^ipfs:\/\//i, "")
      .replace(/^\/+/, "");
    return `${DEFAULT_IPFS_GATEWAY}${path}`;
  }
  return trimmed;
}

function normalizeUri(uri: string): string | null {
  const normalized = normalizeIpfsUri(uri || "");
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return normalized;
  } catch {
    return null;
  }
}

export function extractPlayableAsset(
  metadata: Record<string, any> | null | undefined,
  fallbackTitle?: string | null
): PlayableAsset | null {
  const meta = metadata || {};
  const formats = parseFormatsFromMetadata(meta);

  for (const format of formats) {
    if (!isPlayableMimeType(format.mimeType)) continue;
    const sourceUri = normalizeUri(format.uri);
    if (!sourceUri) continue;
    return {
      sourceUri,
      mimeType: String(format.mimeType).toLowerCase(),
      title: String(meta?.name || fallbackTitle || "").trim() || null,
      thumbnailUri:
        normalizeUri(String(meta?.thumbnailUri || meta?.displayUri || "")) || null,
    };
  }

  const artifactUri = String(meta?.artifactUri || "").trim();
  if (artifactUri) {
    const normalized = normalizeUri(artifactUri);
    if (normalized) {
      const mimeType = String(meta?.mimeType || guessMimeTypeFromUri(normalized)).toLowerCase();
      if (isPlayableMimeType(mimeType)) {
        return {
          sourceUri: normalized,
          mimeType,
          title: String(meta?.name || fallbackTitle || "").trim() || null,
          thumbnailUri:
            normalizeUri(String(meta?.thumbnailUri || meta?.displayUri || "")) || null,
        };
      }
    }
  }

  return null;
}

export function extractImageAsset(
  metadata: Record<string, any> | null | undefined,
  fallbackTitle?: string | null
): ImageAsset | null {
  const meta = metadata || {};

  const thumbUri = String(meta?.thumbnailUri || "").trim();
  if (thumbUri) {
    const normalized = normalizeUri(thumbUri);
    if (normalized) {
      const mime = guessMimeTypeFromUri(normalized);
      if (isImageMimeType(mime) || mime === "application/octet-stream") {
        return {
          sourceUri: normalized,
          mimeType: mime === "application/octet-stream" ? "image/png" : mime,
          title: String(meta?.name || fallbackTitle || "").trim() || null,
        };
      }
    }
  }

  const displayUri = String(meta?.displayUri || "").trim();
  if (displayUri) {
    const normalized = normalizeUri(displayUri);
    if (normalized) {
      return {
        sourceUri: normalized,
        mimeType: guessMimeTypeFromUri(normalized) || "image/png",
        title: String(meta?.name || fallbackTitle || "").trim() || null,
      };
    }
  }

  const artifactUri = String(meta?.artifactUri || "").trim();
  if (artifactUri) {
    const normalized = normalizeUri(artifactUri);
    if (normalized) {
      const mime = guessMimeTypeFromUri(normalized);
      if (isImageMimeType(mime)) {
        return {
          sourceUri: normalized,
          mimeType: mime,
          title: String(meta?.name || fallbackTitle || "").trim() || null,
        };
      }
    }
  }

  return null;
}

export function mediaCategoryFromMime(mime: string): "video" | "image" | "audio" | "other" {
  const lower = (mime || "").toLowerCase();
  if (lower.startsWith("video/") || lower === "image/gif") return "video";
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  return "other";
}
