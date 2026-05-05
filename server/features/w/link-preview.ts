import type { TimelinePayload } from "./timeline";

const FEED_CACHE_MS = Math.max(30_000, Number(process.env.W_FEED_CACHE_MS || 120_000));
const LINK_PREVIEW_CACHE_MS = Math.max(
  FEED_CACHE_MS,
  Number(process.env.W_LINK_PREVIEW_CACHE_MS || 6 * 60 * 60 * 1000)
);
const LINK_PREVIEW_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.W_LINK_PREVIEW_TIMEOUT_MS || 3500)
);
const LINK_PREVIEW_MAX_BYTES = Math.max(
  16 * 1024,
  Math.min(1024 * 1024, Number(process.env.W_LINK_PREVIEW_MAX_BYTES || 350 * 1024))
);
const LINK_PREVIEW_MAX_PER_REFRESH = Math.max(
  0,
  Math.min(80, Number(process.env.W_LINK_PREVIEW_MAX || 30))
);

export type LinkPreview = {
  finalUrl: string;
  canonicalUrl: string;
  domain: string;
  siteName: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  isObjkt: boolean;
};

const linkPreviewCache = new Map<string, { expiresAt: number; value: LinkPreview | null }>();

export function isLikelyMediaExpandedUrl(input: string | null | undefined): boolean {
  const value = String(input || "").toLowerCase();
  return (
    value.includes("pic.x.com/") ||
    value.includes("pic.twitter.com/") ||
    value.includes("/photo/") ||
    value.includes("/video/")
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeIpfsUri(input: string | null | undefined): string | null {
  const value = String(input || "").trim();
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    const path = value.slice("ipfs://".length).replace(/^ipfs\//, "");
    return path ? `https://ipfs.io/ipfs/${path}` : null;
  }
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(Qm[1-9A-Za-z]{44}|baf[1-9A-Za-z]+)/.test(value)) {
    return `https://ipfs.io/ipfs/${value}`;
  }
  return null;
}

function parseObjktTokenRef(url: string): { contract: string; tokenId: string } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!(host === "objkt.com" || host.endsWith(".objkt.com"))) return null;

    const segments = parsed.pathname.split("/").filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      const contract = segments[i];
      const tokenId = segments[i + 1];
      if (/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contract) && /^\d+$/.test(tokenId)) {
        return { contract, tokenId };
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchObjktPreviewFromTzkt(url: string): Promise<LinkPreview | null> {
  const tokenRef = parseObjktTokenRef(url);
  if (!tokenRef) return null;

  const tzktUrl = `https://api.tzkt.io/v1/tokens?contract=${encodeURIComponent(
    tokenRef.contract
  )}&tokenId=${encodeURIComponent(tokenRef.tokenId)}&limit=1`;

  try {
    const response = await fetch(tzktUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "WTF-W-ObjktPreview/1.0",
      },
    });
    if (!response.ok) return null;

    const rows = (await response.json().catch(() => [])) as Array<{
      metadata?: Record<string, any>;
      tokenId?: string | number;
    }>;
    const token = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const metadata = token?.metadata || {};

    const formatUris = Array.isArray(metadata?.formats)
      ? metadata.formats
          .map((f: any) => normalizeIpfsUri(f?.uri))
          .filter((v: string | null): v is string => Boolean(v))
      : [];

    const imageUrl =
      normalizeIpfsUri(metadata?.displayUri) ||
      normalizeIpfsUri(metadata?.artifactUri) ||
      normalizeIpfsUri(metadata?.thumbnailUri) ||
      normalizeIpfsUri(metadata?.image) ||
      formatUris[0] ||
      null;

    const title =
      (typeof metadata?.name === "string" && metadata.name.trim()) ||
      `Objkt #${String(token?.tokenId || tokenRef.tokenId)}`;
    const description =
      typeof metadata?.description === "string" && metadata.description.trim()
        ? metadata.description.trim()
        : null;

    return {
      finalUrl: url,
      canonicalUrl: `https://objkt.com/tokens/${tokenRef.contract}/${tokenRef.tokenId}`,
      domain: "objkt.com",
      siteName: "Objkt",
      title,
      description,
      imageUrl,
      isObjkt: true,
    };
  } catch {
    return null;
  }
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(host)) return true;
  if (/^fe80:/i.test(host)) return true;
  return false;
}

export function normalizePreviewTarget(raw: string | null | undefined, base?: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const parsed = base ? new URL(value, base) : new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (isPrivateOrLocalHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function shouldAttemptHtmlPreview(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "x.com" || host === "www.x.com" || host === "twitter.com" || host === "www.twitter.com") {
      return false;
    }
    const path = parsed.pathname.toLowerCase();
    if (
      /\.(jpg|jpeg|png|webp|gif|svg|mp4|mov|webm|mp3|wav|pdf|zip|rar|7z|tar|gz)(\?|$)/i.test(
        path
      )
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function findMetaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escapedKey = escapeRegExp(key);
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${escapedKey}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${escapedKey}["'][^>]*>`,
        "i"
      ),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (!match?.[1]) continue;
      const value = stripHtml(match[1]);
      if (value) return value;
    }
  }
  return null;
}

function findCanonicalLink(html: string): string | null {
  const patterns = [
    /<link[^>]+rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function findTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) return null;
  const cleaned = stripHtml(titleMatch[1]);
  return cleaned || null;
}

async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  while (bytesRead < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    let chunk = value;
    if (bytesRead + chunk.length > maxBytes) {
      chunk = chunk.slice(0, maxBytes - bytesRead);
    }
    chunks.push(chunk);
    bytesRead += chunk.length;
    if (bytesRead >= maxBytes) break;
  }

  await reader.cancel().catch(() => undefined);
  const decoder = new TextDecoder("utf-8");
  let text = "";
  for (const chunk of chunks) {
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function linkCandidateForPreview(link: { url: string; expandedUrl: string | null; displayUrl: string | null }): string | null {
  const target = normalizePreviewTarget(link.expandedUrl || link.url || "");
  if (!target) return null;
  if (isLikelyMediaExpandedUrl(link.expandedUrl || link.displayUrl || link.url)) return null;
  if (!shouldAttemptHtmlPreview(target)) return null;
  return target;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  if (linkPreviewCache.size > 2000) {
    const now = Date.now();
    for (const [key, entry] of linkPreviewCache.entries()) {
      if (entry.expiresAt <= now) linkPreviewCache.delete(key);
    }
    if (linkPreviewCache.size > 2000) {
      linkPreviewCache.clear();
    }
  }

  const cached = linkPreviewCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const objktFromTzkt = await fetchObjktPreviewFromTzkt(url);
  if (objktFromTzkt) {
    linkPreviewCache.set(url, {
      value: objktFromTzkt,
      expiresAt: Date.now() + LINK_PREVIEW_CACHE_MS,
    });
    return objktFromTzkt;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);
  let preview: LinkPreview | null = null;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "WTF-W-LinkPreview/1.0",
      },
    });

    if (response.ok) {
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const finalUrl = normalizePreviewTarget(response.url || url);
      if (finalUrl) {
        const objktPreview = await fetchObjktPreviewFromTzkt(finalUrl);
        if (objktPreview) {
          preview = objktPreview;
        }
      }
      if (
        !preview &&
        finalUrl &&
        (contentType.includes("text/html") || contentType.includes("application/xhtml+xml"))
      ) {
        const html = await readResponseTextLimited(response, LINK_PREVIEW_MAX_BYTES);
        const canonicalUrl =
          normalizePreviewTarget(findCanonicalLink(html), finalUrl) || finalUrl;
        const imageUrl =
          normalizePreviewTarget(
            findMetaContent(html, ["og:image", "twitter:image", "twitter:image:src"]),
            finalUrl
          ) || null;
        const domain = new URL(canonicalUrl).hostname.replace(/^www\./, "").toLowerCase();
        const isObjkt = domain === "objkt.com" || domain.endsWith(".objkt.com");
        const title =
          findMetaContent(html, ["og:title", "twitter:title"]) ||
          findTitle(html) ||
          (isObjkt ? "Objkt Link" : domain);
        const description =
          findMetaContent(html, ["og:description", "twitter:description", "description"]) || null;
        const siteName = findMetaContent(html, ["og:site_name"]) || null;

        preview = {
          finalUrl,
          canonicalUrl,
          domain,
          siteName,
          title,
          description,
          imageUrl,
          isObjkt,
        };

        if (preview.isObjkt && !preview.imageUrl) {
          const enriched = await fetchObjktPreviewFromTzkt(preview.canonicalUrl || finalUrl);
          if (enriched) {
            preview = {
              ...preview,
              ...enriched,
              finalUrl: preview.finalUrl,
              canonicalUrl: preview.canonicalUrl,
            };
          }
        }
      }
    }
  } catch {
    preview = null;
  } finally {
    clearTimeout(timeout);
  }

  linkPreviewCache.set(url, { value: preview, expiresAt: Date.now() + LINK_PREVIEW_CACHE_MS });
  return preview;
}

export async function enrichTimelineWithLinkPreviews(
  timeline: TimelinePayload["timeline"]
): Promise<TimelinePayload["timeline"]> {
  if (!Array.isArray(timeline) || timeline.length === 0) return timeline;
  if (LINK_PREVIEW_MAX_PER_REFRESH <= 0) {
    return timeline.map((post) => ({
      ...post,
      links: (post.links || []).map((link) => ({ ...link, preview: null })),
    }));
  }

  const uniqueTargets: string[] = [];
  const seen = new Set<string>();
  for (const post of timeline) {
    for (const link of post.links || []) {
      const candidate = linkCandidateForPreview(link);
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      uniqueTargets.push(candidate);
      if (uniqueTargets.length >= LINK_PREVIEW_MAX_PER_REFRESH) break;
    }
    if (uniqueTargets.length >= LINK_PREVIEW_MAX_PER_REFRESH) break;
  }

  const previewMap = new Map<string, LinkPreview | null>();
  await Promise.all(
    uniqueTargets.map(async (target) => {
      previewMap.set(target, await fetchLinkPreview(target));
    })
  );

  return timeline.map((post) => ({
    ...post,
    links: (post.links || []).map((link) => {
      const candidate = linkCandidateForPreview(link);
      return {
        ...link,
        preview: candidate ? previewMap.get(candidate) || null : null,
      };
    }),
  }));
}
