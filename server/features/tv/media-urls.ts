import {
  normalizeIpfsUri as normalizeIpfsUriShared,
} from "../../lib/media-utils";
import { normalizePublicHttpUrl, parseHostAllowlist } from "../../lib/network-safety";

// Default IPFS gateway order is "fast and reliable first, ipfs.io
// last".  ipfs.io is famously slow when the CID isn't already pinned
// to its node. Operators can override the order with TV_IPFS_GATEWAYS.
export const DEFAULT_IPFS_GATEWAYS = [
  "https://nftstorage.link/ipfs/",
  "https://w3s.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cf-ipfs.com/ipfs/",
  "https://ipfs.io/ipfs/",
];

const TV_CACHE_ALLOWED_HOSTS_FROM_ENV = parseHostAllowlist(process.env.TV_CACHE_ALLOWED_HOSTS);
const TV_MEDIA_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.TV_MEDIA_FETCH_TIMEOUT_MS || 25000)
);

export function normalizeIpfsGatewayBase(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    const pathWithIpfs = cleanPath.toLowerCase().endsWith("/ipfs")
      ? cleanPath
      : `${cleanPath}/ipfs`;
    parsed.pathname = `${pathWithIpfs}/`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export const TV_IPFS_GATEWAYS = (() => {
  const raw = String(process.env.TV_IPFS_GATEWAYS || "").trim();
  const source = raw ? raw.split(",") : DEFAULT_IPFS_GATEWAYS;
  const unique = new Set<string>();
  for (const value of source) {
    const normalized = normalizeIpfsGatewayBase(value);
    if (normalized) unique.add(normalized);
  }
  if (unique.size > 0) return Array.from(unique);
  return [...DEFAULT_IPFS_GATEWAYS];
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

export function isAllowedMediaCacheContentType(
  contentType: string,
  options: { allowImages?: boolean } = {}
): boolean {
  const value = String(contentType || "").toLowerCase().trim();
  if (value.startsWith("video/") || value === "image/gif") return true;
  return options.allowImages === true && value.startsWith("image/");
}

function stripIpfsPrefix(input: string): string {
  return input
    .trim()
    .replace(/^ipfs:\/\//i, "")
    .replace(/^ipfs\//i, "")
    .replace(/^\/+/, "");
}

export function normalizeIpfsUri(uri: string): string {
  const base = TV_IPFS_GATEWAYS[0] || DEFAULT_IPFS_GATEWAYS[0];
  return normalizeIpfsUriShared(uri, base);
}

export function normalizeMediaUri(uri: string): string | null {
  const normalized = normalizeIpfsUri(uri || "");
  if (!normalized) return null;
  return normalizePublicHttpUrl(normalized, TV_CACHE_ALLOWED_HOSTS);
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

export function extractIpfsPath(uri: string): string | null {
  const trimmed = String(uri || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("ipfs://")) {
    const path = stripIpfsPrefix(trimmed);
    return path || null;
  }
  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/^\/ipfs\/(.+)$/i);
    if (match?.[1]) {
      return `${match[1]}${parsed.search || ""}`;
    }
    const lowerHost = parsed.hostname.toLowerCase();
    if (lowerHost.includes(".ipfs.")) {
      const cid = parsed.hostname.split(".ipfs.")[0];
      if (!cid) return null;
      const cleanPath = parsed.pathname.replace(/^\/+/, "");
      return `${cid}${cleanPath ? `/${cleanPath}` : ""}${parsed.search || ""}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildMediaFetchCandidates(uri: string): string[] {
  const normalized = normalizeMediaUri(uri);
  if (!normalized) return [];
  const candidates: string[] = [normalized];
  const ipfsPath = extractIpfsPath(normalized);
  if (!ipfsPath) return candidates;

  for (const gateway of TV_IPFS_GATEWAYS) {
    const candidate = normalizeMediaUri(`${gateway}${ipfsPath}`);
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

    const redirected = normalizeMediaUri(new URL(location, currentUrl).toString());
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
