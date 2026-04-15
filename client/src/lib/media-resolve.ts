/**
 * Shared IPFS / media thumbnail resolution for the entire client.
 *
 * Every component that displays token art should use `resolveTokenThumbnail`
 * instead of raw `token.thumbnail` URLs. This guarantees consistent handling
 * of ipfs:// URIs, gateway normalization, and cache-proxy fallback.
 */

import { resolveArtifactMimeType } from "@shared/token-media";

const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

function normalizeIpfsUri(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed.startsWith("ipfs://")) {
    const path = trimmed
      .replace(/^ipfs:\/\//i, "")
      .replace(/^\/+/, "");
    return `${DEFAULT_IPFS_GATEWAY}${path}`;
  }
  return trimmed;
}

function extractBestUri(
  metadata: Record<string, any> | undefined | null,
  preferVideo: boolean
): string | null {
  if (!metadata) return null;

  if (preferVideo) {
    const formats = Array.isArray(metadata.formats) ? metadata.formats : [];
    for (const fmt of formats) {
      const mime = String(fmt?.mimeType || fmt?.mime_type || "").toLowerCase();
      const uri = String(fmt?.uri || "").trim();
      if (uri && (mime.startsWith("video/") || mime === "image/gif")) {
        return uri;
      }
    }
    const artifact = String(metadata.artifactUri || "").trim();
    if (artifact) return artifact;
  }

  if (metadata.thumbnailUri) return String(metadata.thumbnailUri).trim();
  if (metadata.displayUri) return String(metadata.displayUri).trim();
  if (metadata.artifactUri) return String(metadata.artifactUri).trim();

  return null;
}

export function cacheProxyUrl(sourceUrl: string): string {
  return `/api/cache/media?url=${encodeURIComponent(sourceUrl)}`;
}

export interface ResolvedThumbnail {
  src: string;
  fallbackSrc?: string;
}

export function resolveTokenThumbnail(
  token: { thumbnail?: string; metadata?: Record<string, any> },
  options?: { preferVideo?: boolean }
): ResolvedThumbnail | null {
  const preferVideo = options?.preferVideo ?? false;

  const metaUri = extractBestUri(token.metadata, preferVideo);
  const rawUri = metaUri || (token.thumbnail ? token.thumbnail : null);

  if (!rawUri) return null;

  const normalized = normalizeIpfsUri(rawUri);
  if (!normalized) return null;

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return {
      src: cacheProxyUrl(normalized),
      fallbackSrc: normalized,
    };
  }

  return { src: normalized };
}

/** Primary (artifact) MIME — not preview/CDN types such as Objkt WebP proxies. */
export function getTokenMimeType(
  metadata: Record<string, any> | undefined | null
): string | null {
  if (!metadata) return null;
  return resolveArtifactMimeType(metadata as Record<string, unknown>);
}

export function isPlayableMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const lower = mime.toLowerCase().trim();
  return lower.startsWith("video/") || lower === "image/gif";
}

export function isImageMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return mime.toLowerCase().trim().startsWith("image/");
}

export function teiaUrl(contract: string, tokenId: string): string {
  return `https://teia.art/objkt/${contract}/${tokenId}`;
}

export function objktUrl(contract: string, tokenId: string): string {
  return `https://objkt.com/tokens/${contract}/${tokenId}`;
}

export function tzktTokenUrl(contract: string, tokenId: string): string {
  return `https://tzkt.io/${contract}/tokens/${tokenId}`;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 14) return addr || "";
  return `${addr.slice(0, 8)}...${addr.slice(-5)}`;
}
