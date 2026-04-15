/**
 * Shared media helpers used by TV routes and the media library.
 */

import {
  resolveArtifactMimeType,
  resourceUrisLikelySame,
} from "@shared/token-media";

export function isPlayableMimeType(mimeType: string): boolean {
  const value = String(mimeType || "").toLowerCase().trim();
  if (!value) return false;
  return value.startsWith("video/") || value === "image/gif";
}

export function isImageMimeType(mimeType: string): boolean {
  const value = String(mimeType || "").toLowerCase().trim();
  return value.startsWith("image/");
}

/** Guess MIME from a URL path only — not authoritative for token artifacts (use resolveArtifactMimeType). */
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
  const artifactUri = String(meta?.artifactUri || "").trim();
  let formats = parseFormatsFromMetadata(meta);
  if (artifactUri && formats.length > 1) {
    formats = [...formats].sort((a, b) => {
      const ra = resourceUrisLikelySame(a.uri, artifactUri) ? 0 : 1;
      const rb = resourceUrisLikelySame(b.uri, artifactUri) ? 0 : 1;
      return ra - rb;
    });
  }

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

  if (artifactUri) {
    const normalized = normalizeUri(artifactUri);
    if (normalized) {
      const declared = resolveArtifactMimeType(meta as Record<string, unknown>);
      const mimeType = String(
        declared ||
          String(meta?.mimeType || meta?.mime_type || "").trim() ||
          guessMimeTypeFromUri(artifactUri)
      ).toLowerCase();
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
  const title = String(meta?.name || fallbackTitle || "").trim() || null;
  const declaredMime = resolveArtifactMimeType(meta as Record<string, unknown>);

  const artifactUri = String(meta?.artifactUri || "").trim();
  if (artifactUri) {
    const normalized = normalizeUri(artifactUri);
    if (normalized) {
      const mime = String(
        declaredMime ||
          String(meta?.mimeType || meta?.mime_type || "").trim() ||
          guessMimeTypeFromUri(artifactUri)
      ).toLowerCase();
      if (isImageMimeType(mime)) {
        return {
          sourceUri: normalized,
          mimeType: mime,
          title,
        };
      }
    }
  }

  const displayUri = String(meta?.displayUri || "").trim();
  if (displayUri) {
    const normalized = normalizeUri(displayUri);
    if (normalized) {
      const mime = String(
        declaredMime || guessMimeTypeFromUri(displayUri) || "image/png"
      ).toLowerCase();
      if (isImageMimeType(mime)) {
        return {
          sourceUri: normalized,
          mimeType: mime,
          title,
        };
      }
    }
  }

  const thumbUri = String(meta?.thumbnailUri || "").trim();
  if (thumbUri) {
    const normalized = normalizeUri(thumbUri);
    if (normalized) {
      const mime = String(
        declaredMime || guessMimeTypeFromUri(thumbUri)
      ).toLowerCase();
      if (isImageMimeType(mime) || mime === "application/octet-stream") {
        return {
          sourceUri: normalized,
          mimeType: mime === "application/octet-stream" ? "image/png" : mime,
          title,
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
