/**
 * Shared media helpers used by TV routes and the media library.
 */

import {
  isGameCartridgeMimeType,
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

export function isAudioMimeType(mimeType: string): boolean {
  const value = String(mimeType || "").toLowerCase().trim();
  return value.startsWith("audio/");
}

/** Guess MIME from a URL path only — not authoritative for token artifacts (use resolveArtifactMimeType). */
export function guessMimeTypeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".ogv")) return "video/ogg";
  if (lower.endsWith(".avi")) return "video/x-msvideo";
  if (lower.endsWith(".m3u8")) return "application/x-mpegURL";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".oga")) return "audio/ogg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".zip")) return "application/zip";
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

function metadataUri(
  meta: Record<string, any>,
  camelKey: string,
  snakeKey: string
): string {
  return String(meta?.[camelKey] || meta?.[snakeKey] || "").trim();
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

export type GameAsset = {
  sourceUri: string;
  mimeType: string;
  title: string | null;
  thumbnailUri: string | null;
};

export type AudioAsset = {
  sourceUri: string;
  mimeType: string;
  title: string | null;
  thumbnailUri: string | null;
};

const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

/**
 * Canonical `ipfs://` → HTTPS-gateway rewrite used everywhere the
 * server needs a playable URL.
 *
 * Accepts an optional `gatewayBase` so callers with gateway preference
 * (the TV routes track an admin-configurable list; see
 * `TV_IPFS_GATEWAYS` in `server/routes/tv.ts`) can pass the head of
 * their preferred list on every call.  When omitted we fall back to
 * `https://ipfs.io/ipfs/` which is the historical behaviour and keeps
 * non-TV call sites unchanged.
 *
 * The input is tolerant of common malformed forms we see in token
 * metadata in the wild:
 *
 *   - `ipfs://Qm...`              → `<gateway>Qm...`
 *   - `ipfs://ipfs/Qm...`         → `<gateway>Qm...`
 *   - `ipfs://ipfs/Qm.../path`    → `<gateway>Qm.../path`
 *   - `ipfs://  /Qm...`           → `<gateway>Qm...`  (leading slash strip)
 *   - Anything else               → returned unchanged (already HTTP, or junk)
 *
 * Callers that also need host/protocol validation should follow up
 * with `normalizePublicHttpUrl(...)` (see `server/routes/tv.ts`).  The
 * split keeps this helper pure and reusable — e.g. the media-library
 * upload path wants the gateway rewrite without TV's host-allow-list.
 */
export function normalizeIpfsUri(uri: string, gatewayBase?: string): string {
  const trimmed = (uri || "").trim();
  if (!trimmed.toLowerCase().startsWith("ipfs://")) return trimmed;
  const ipfsPath = trimmed
    .replace(/^ipfs:\/\//i, "")
    .replace(/^ipfs\//i, "")
    .replace(/^\/+/, "");
  const base = gatewayBase || DEFAULT_IPFS_GATEWAY;
  return `${base}${ipfsPath}`;
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
  const artifactUri = metadataUri(meta, "artifactUri", "artifact_uri");
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
        normalizeUri(
          metadataUri(meta, "thumbnailUri", "thumbnail_uri") ||
            metadataUri(meta, "displayUri", "display_uri")
        ) || null,
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
            normalizeUri(
              metadataUri(meta, "thumbnailUri", "thumbnail_uri") ||
                metadataUri(meta, "displayUri", "display_uri")
            ) || null,
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

  const artifactUri = metadataUri(meta, "artifactUri", "artifact_uri");
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

  const displayUri = metadataUri(meta, "displayUri", "display_uri");
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

  const thumbUri = metadataUri(meta, "thumbnailUri", "thumbnail_uri");
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

export function extractGameAsset(
  metadata: Record<string, any> | null | undefined,
  fallbackTitle?: string | null
): GameAsset | null {
  const meta = metadata || {};
  const title = String(meta?.name || fallbackTitle || "").trim() || null;
  const artifactUri = metadataUri(meta, "artifactUri", "artifact_uri");
  let formats = parseFormatsFromMetadata(meta);
  if (artifactUri && formats.length > 1) {
    formats = [...formats].sort((a, b) => {
      const ra = resourceUrisLikelySame(a.uri, artifactUri) ? 0 : 1;
      const rb = resourceUrisLikelySame(b.uri, artifactUri) ? 0 : 1;
      return ra - rb;
    });
  }

  const thumbnailUri =
    normalizeUri(
      metadataUri(meta, "thumbnailUri", "thumbnail_uri") ||
        metadataUri(meta, "displayUri", "display_uri")
    ) || null;

  for (const format of formats) {
    if (!isGameCartridgeMimeType(format.mimeType)) continue;
    const sourceUri = normalizeUri(format.uri);
    if (!sourceUri) continue;
    return {
      sourceUri,
      mimeType: String(format.mimeType).toLowerCase(),
      title,
      thumbnailUri,
    };
  }

  if (artifactUri) {
    const normalized = normalizeUri(artifactUri);
    if (normalized) {
      const mimeType = String(
        resolveArtifactMimeType(meta as Record<string, unknown>) ||
          String(meta?.mimeType || meta?.mime_type || "").trim() ||
          guessMimeTypeFromUri(artifactUri)
      ).toLowerCase();
      if (isGameCartridgeMimeType(mimeType)) {
        return {
          sourceUri: normalized,
          mimeType,
          title,
          thumbnailUri,
        };
      }
    }
  }

  return null;
}

export function extractAudioAsset(
  metadata: Record<string, any> | null | undefined,
  fallbackTitle?: string | null
): AudioAsset | null {
  const meta = metadata || {};
  const title = String(meta?.name || fallbackTitle || "").trim() || null;
  const thumbnailUri =
    normalizeUri(
      metadataUri(meta, "thumbnailUri", "thumbnail_uri") ||
        metadataUri(meta, "displayUri", "display_uri")
    ) || null;
  const artifactUri = metadataUri(meta, "artifactUri", "artifact_uri");
  let formats = parseFormatsFromMetadata(meta);
  if (artifactUri && formats.length > 1) {
    formats = [...formats].sort((a, b) => {
      const ra = resourceUrisLikelySame(a.uri, artifactUri) ? 0 : 1;
      const rb = resourceUrisLikelySame(b.uri, artifactUri) ? 0 : 1;
      return ra - rb;
    });
  }

  for (const format of formats) {
    if (!isAudioMimeType(format.mimeType)) continue;
    const sourceUri = normalizeUri(format.uri);
    if (!sourceUri) continue;
    return {
      sourceUri,
      mimeType: String(format.mimeType).toLowerCase(),
      title,
      thumbnailUri,
    };
  }

  if (artifactUri) {
    const normalized = normalizeUri(artifactUri);
    if (normalized) {
      const mimeType = String(
        resolveArtifactMimeType(meta as Record<string, unknown>) ||
          String(meta?.mimeType || meta?.mime_type || "").trim() ||
          guessMimeTypeFromUri(artifactUri)
      ).toLowerCase();
      if (isAudioMimeType(mimeType)) {
        return {
          sourceUri: normalized,
          mimeType,
          title,
          thumbnailUri,
        };
      }
    }
  }

  return null;
}

export function mediaCategoryFromMime(mime: string): "video" | "image" | "audio" | "game" | "other" {
  const lower = (mime || "").toLowerCase();
  if (lower.startsWith("video/") || lower === "image/gif") return "video";
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  if (isGameCartridgeMimeType(lower)) return "game";
  return "other";
}
