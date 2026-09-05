import {
  DEFAULT_IPFS_GATEWAYS,
  buildIpfsGatewayCandidates,
  extractIpfsPath,
  normalizeIpfsGatewayBase,
  normalizeIpfsGatewayList,
  normalizeIpfsUri as normalizeIpfsUriShared,
} from "@shared/ipfs-gateways";
import { normalizePublicHttpUrl, parseHostAllowlist } from "../../lib/network-safety";

export { DEFAULT_IPFS_GATEWAYS, extractIpfsPath, normalizeIpfsGatewayBase };

const TV_CACHE_ALLOWED_HOSTS_FROM_ENV = parseHostAllowlist(process.env.TV_CACHE_ALLOWED_HOSTS);
const TV_MEDIA_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.TV_MEDIA_FETCH_TIMEOUT_MS || 25000)
);

export const TV_IPFS_GATEWAYS = (() => {
  const raw = String(process.env.TV_IPFS_GATEWAYS || "").trim();
  return normalizeIpfsGatewayList(raw || DEFAULT_IPFS_GATEWAYS);
})();

function hostnamesFromUrls(urls: string[]): string[] {
  const hosts = new Set<string>();
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());
    } catch {
      /* ignore invalid configured gateways */
    }
  }
  return Array.from(hosts);
}

export const TV_CACHE_ALLOWED_HOSTS = Array.from(
  new Set([
    ...TV_CACHE_ALLOWED_HOSTS_FROM_ENV,
    ...hostnamesFromUrls(TV_IPFS_GATEWAYS),
  ])
);

export type TvPlayableQueueKind = "video" | "gif" | "embed";

const TV_EXTERNAL_EMBED_HOSTS = ["odysee.com"];

export function isExternalTvEmbedMimeType(mimeType: string | null | undefined): boolean {
  const value = String(mimeType || "").toLowerCase().split(";")[0]!.trim();
  return (
    value === "text/html" ||
    value === "application/x-iframe" ||
    value === "application/vnd.wtf.external-embed"
  );
}

export function normalizeExternalTvEmbedUrl(uri: string): string | null {
  const value = String(uri || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    const safeUrl = normalizePublicHttpUrl(parsed.toString(), TV_EXTERNAL_EMBED_HOSTS);
    if (!safeUrl) return null;

    const decodedPath = decodeURIComponent(parsed.pathname);
    let embedPath = "";
    if (decodedPath.startsWith("/$/embed/")) {
      embedPath = decodedPath;
    } else if (/^\/@[^/]+\/[^/]+/.test(decodedPath)) {
      embedPath = `/$/embed${decodedPath}`;
    } else {
      return null;
    }

    const normalized = new URL("https://odysee.com");
    normalized.pathname = embedPath;
    normalized.search = parsed.search;
    return normalized.toString();
  } catch {
    return null;
  }
}

export function isAllowedMediaCacheContentType(
  contentType: string,
  options: { allowImages?: boolean; allowArtifacts?: boolean } = {}
): boolean {
  const value = String(contentType || "").toLowerCase().trim();
  if (value.startsWith("video/") || value === "image/gif") return true;
  if ((options.allowImages === true || options.allowArtifacts === true) && value.startsWith("image/")) {
    return true;
  }
  if (options.allowArtifacts !== true) return false;
  if (value.startsWith("audio/")) return true;
  return value === "application/zip" || value === "application/x-zip-compressed";
}

export function normalizeIpfsUri(uri: string): string {
  const base = TV_IPFS_GATEWAYS[0] || DEFAULT_IPFS_GATEWAYS[0];
  return normalizeIpfsUriShared(uri, base);
}

function validateMediaFetchTarget(uri: string): string | null {
  return normalizePublicHttpUrl(uri, TV_CACHE_ALLOWED_HOSTS);
}

export function normalizeMediaUri(uri: string): string | null {
  const normalized = normalizeIpfsUri(uri || "");
  if (!normalized) return null;
  return validateMediaFetchTarget(normalized);
}

/**
 * Same-origin paths are already served by this Express app, so wrapping
 * them in `/api/tv/cache/media?url=...` is both pointless and broken.
 * External sources still go through the IPFS/media cache.
 */
export function isSameOriginMediaPath(uri: string): boolean {
  const value = String(uri || "").trim();
  return value.startsWith("/api/") || value.startsWith("/uploads/");
}

export function resolveCacheUrl(sourceUri: string): string {
  if (isSameOriginMediaPath(sourceUri)) return sourceUri;
  return `/api/tv/cache/media?url=${encodeURIComponent(sourceUri)}`;
}

export function resolveTvPlayableMedia(
  sourceUri: string,
  mimeType: string
): {
  sourceUri: string;
  cacheUrl: string;
  kind: TvPlayableQueueKind;
} {
  if (isExternalTvEmbedMimeType(mimeType)) {
    const embedUrl = normalizeExternalTvEmbedUrl(sourceUri);
    if (embedUrl) {
      return {
        sourceUri: embedUrl,
        cacheUrl: embedUrl,
        kind: "embed",
      };
    }
  }

  const playableSourceUri = normalizeMediaUri(sourceUri) || sourceUri;
  return {
    sourceUri: playableSourceUri,
    cacheUrl: resolveCacheUrl(playableSourceUri),
    kind: String(mimeType || "").toLowerCase() === "image/gif" ? "gif" : "video",
  };
}

export function buildMediaFetchCandidates(uri: string): string[] {
  const normalized = normalizeMediaUri(uri);
  if (!normalized) return [];
  const candidates: string[] = [normalized];
  for (const gatewayUrl of buildIpfsGatewayCandidates(normalized, TV_IPFS_GATEWAYS)) {
    const candidate = validateMediaFetchTarget(gatewayUrl);
    if (!candidate) continue;
    if (!candidates.includes(candidate)) candidates.push(candidate);
  }
  return candidates;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = TV_MEDIA_FETCH_TIMEOUT_MS
): Promise<Response> {
  const externalSignal = init.signal as AbortSignal | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

export async function fetchWithRedirectGuard(
  startUrl: string,
  maxRedirects = 3,
  init?: RequestInit
): Promise<Response> {
  let currentUrl = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const response = await fetchWithTimeout(currentUrl, {
      ...init,
      redirect: "manual",
    });
    if (response.status < 300 || response.status > 399) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect location missing");

    const redirected = validateMediaFetchTarget(new URL(location, currentUrl).toString());
    if (!redirected) throw new Error("Redirect target is not allowed");
    currentUrl = redirected;
  }

  throw new Error("Too many redirects while fetching media");
}

export async function fetchMediaWithFallback(
  sourceUrl: string,
  init?: RequestInit
): Promise<{ response: Response; resolvedUrl: string; gatewayIndex: number }> {
  const candidates = buildMediaFetchCandidates(sourceUrl);
  if (candidates.length === 0) {
    throw new Error("Unsupported media URL");
  }

  let lastError: unknown = null;
  let lastResponse: Response | null = null;
  let lastResolvedUrl = candidates[0]!;
  let lastIndex = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidateUrl = candidates[i]!;
    try {
      const response = await fetchWithRedirectGuard(candidateUrl, 3, init);
      if (response.ok && response.body) {
        return { response, resolvedUrl: candidateUrl, gatewayIndex: i };
      }
      lastResponse = response;
      lastResolvedUrl = candidateUrl;
      lastIndex = i;
    } catch (err) {
      lastError = err;
      lastResolvedUrl = candidateUrl;
      lastIndex = i;
    }
  }

  if (lastResponse) {
    return { response: lastResponse, resolvedUrl: lastResolvedUrl, gatewayIndex: lastIndex };
  }

  if (lastError) throw lastError;
  throw new Error("Failed to fetch media from all gateways");
}
