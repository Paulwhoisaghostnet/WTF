import { Router } from "express";
import { createHmac, randomBytes } from "crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import { decryptOAuthSecret } from "../auth/oauth-crypto";

const router = Router();

const X_API_BASE = (process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/$/, "");

/** Exported alias for internal workers (e.g. Phase 5 CRP nomination watcher). */
export const X_API_BASE_URL = X_API_BASE;
const FEED_CACHE_MS = Math.max(30_000, Number(process.env.W_FEED_CACHE_MS || 120_000));
const X_USERS_BY_USERNAMES_LIMIT = 100;
const MAX_ACCOUNTS = Math.max(0, Number(process.env.W_FEED_MAX_ACCOUNTS || 0));
const POSTS_PER_ACCOUNT = Math.max(5, Math.min(100, Number(process.env.W_POSTS_PER_ACCOUNT || 20)));
const TIMELINE_DAYS_BACK = Math.max(1, Number(process.env.W_TIMELINE_DAYS_BACK || 7));
const X_POST_MAX_LENGTH = 280;
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
const X_USER_ID_CACHE_MS = Math.max(30_000, Number(process.env.W_X_USER_ID_CACHE_MS || 10 * 60 * 1000));

const xUserIdCache = new Map<string, { expiresAt: number; userId: string }>();

type LinkPreview = {
  finalUrl: string;
  canonicalUrl: string;
  domain: string;
  siteName: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  isObjkt: boolean;
};

type TimelinePayload = {
  source: "x-api-v2" | "links-only";
  refreshedAt: string;
  canReplyInline: boolean;
  accounts: Array<{
    userId: number;
    username: string;
    displayName: string | null;
    twitterHandle: string;
    profileUrl: string;
  }>;
  timeline: Array<{
    id: string;
    text: string;
    displayText: string;
    createdAt: string;
    url: string;
    media: Array<{
      type: string;
      url: string | null;
      previewUrl: string | null;
      width: number | null;
      height: number | null;
      altText: string | null;
    }>;
    links: Array<{
      url: string;
      expandedUrl: string | null;
      displayUrl: string | null;
      preview: LinkPreview | null;
    }>;
    author: {
      userId: number;
      username: string;
      displayName: string | null;
      twitterHandle: string;
      name: string | null;
      avatarUrl: string | null;
    };
    metrics: {
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    };
  }>;
  diagnostics?: {
    message?: string;
    skippedAccounts?: number;
  };
};

type XUrlEntity = {
  url?: string;
  expanded_url?: string;
  display_url?: string;
};

type XMedia = {
  media_key: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  alt_text?: string;
};

function isLikelyMediaExpandedUrl(input: string | null | undefined): boolean {
  const value = String(input || "").toLowerCase();
  return (
    value.includes("pic.x.com/") ||
    value.includes("pic.twitter.com/") ||
    value.includes("/photo/") ||
    value.includes("/video/")
  );
}

function cleanDisplayText(text: string, links: XUrlEntity[]): string {
  let cleaned = text;

  for (const link of links) {
    const raw = String(link.url || "").trim();
    if (!raw) continue;
    if (!isLikelyMediaExpandedUrl(link.expanded_url || link.display_url || raw)) continue;
    cleaned = cleaned.replace(raw, "");
  }

  return cleaned.replace(/\s+/g, " ").trim();
}

let cachedKey = "";
let cachedPayload: TimelinePayload | null = null;
let cacheExpiresAt = 0;
const linkPreviewCache = new Map<string, { expiresAt: number; value: LinkPreview | null }>();

function normalizeHandle(handle: string): string | null {
  const cleaned = handle.trim().replace(/^@+/, "");
  if (!cleaned) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) return null;
  return cleaned;
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

function isDigits(value: string | null | undefined): boolean {
  return /^\d+$/.test(String(value || "").trim());
}

function normalizePostId(raw: unknown): string {
  const postId = String(raw || "").trim();
  if (!isDigits(postId)) {
    throw new XApiError(400, "Invalid postId");
  }
  return postId;
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

function normalizePreviewTarget(raw: string | null | undefined, base?: string): string | null {
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

function shouldAttemptHtmlPreview(url: string): boolean {
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

async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
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

async function enrichTimelineWithLinkPreviews(
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

function oauthEncode(input: string): string {
  return encodeURIComponent(input).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function buildOAuth1Header(params: {
  method: "POST" | "GET" | "DELETE";
  url: string;
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}) {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestUrl = new URL(params.url);

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: params.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: params.accessToken,
    oauth_version: "1.0",
  };

  const allParams: Array<[string, string]> = [];
  requestUrl.searchParams.forEach((value, key) => {
    allParams.push([key, value]);
  });
  Object.entries(oauthParams).forEach(([key, value]) => {
    allParams.push([key, value]);
  });

  const normalizedParams = allParams
    .map(([key, value]) => [oauthEncode(key), oauthEncode(value)] as [string, string])
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey === bKey) return aValue.localeCompare(bValue);
      return aKey.localeCompare(bKey);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const baseUrl = `${requestUrl.origin}${requestUrl.pathname}`;
  const signatureBase = [
    params.method.toUpperCase(),
    oauthEncode(baseUrl),
    oauthEncode(normalizedParams),
  ].join("&");

  const signingKey = `${oauthEncode(params.consumerSecret)}&${oauthEncode(
    params.accessTokenSecret
  )}`;
  const signature = createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  const headerParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  return (
    "OAuth " +
    Object.entries(headerParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${oauthEncode(key)}="${oauthEncode(value)}"`)
      .join(", ")
  );
}

type XUserAuth = {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

export class XApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "XApiError";
    this.status = status;
  }
}

function parseXApiMessage(payload: any, fallback: string): string {
  const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  return (
    firstError?.message ||
    firstError?.detail ||
    payload?.detail ||
    payload?.title ||
    payload?.error ||
    fallback
  );
}

export async function xRequestAsUser(params: {
  method: "POST" | "GET" | "DELETE";
  url: string;
  auth: XUserAuth;
  body?: unknown;
}) {
  const authHeader = buildOAuth1Header({
    method: params.method,
    url: params.url,
    consumerKey: params.auth.consumerKey,
    consumerSecret: params.auth.consumerSecret,
    accessToken: params.auth.accessToken,
    accessTokenSecret: params.auth.accessTokenSecret,
  });

  const response = await fetch(params.url, {
    method: params.method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  });

  const rawBody = await response.text().catch(() => "");
  let payload: any = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    const apiMessage = parseXApiMessage(payload, response.statusText);
    throw new XApiError(response.status, `X API ${response.status}: ${apiMessage}`);
  }

  return payload;
}

function getTwitterWriteAuthOrThrow(user: any): XUserAuth {
  if (!user?.twitterVerified) {
    throw new XApiError(403, "Twitter account is not verified on your WTF profile");
  }

  const consumerKey = process.env.TWITTER_CONSUMER_KEY?.trim() || "";
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET?.trim() || "";
  if (!consumerKey || !consumerSecret) {
    throw new XApiError(500, "Twitter app credentials are not configured on the server");
  }

  if (!user.twitterOauthToken || !user.twitterOauthTokenSecret) {
    throw new XApiError(
      403,
      "Twitter posting permission is missing. Reconnect Twitter in your profile."
    );
  }

  let accessToken = "";
  let accessTokenSecret = "";
  try {
    accessToken = decryptOAuthSecret(user.twitterOauthToken);
    accessTokenSecret = decryptOAuthSecret(user.twitterOauthTokenSecret);
  } catch {
    throw new XApiError(
      500,
      "Twitter credentials could not be decrypted. Reconnect Twitter in your profile."
    );
  }

  return {
    consumerKey,
    consumerSecret,
    accessToken,
    accessTokenSecret,
  };
}

/**
 * Read-only variant of the twitter-auth helper used by background workers
 * like the Phase 5 CRP nomination watcher. Returns `null` when the user
 * has not linked X write-access (rather than throwing) because the
 * background worker iterates thousands of users and silent skips are
 * the right behaviour there.
 */
export function getTwitterReadAuthForUser(user: {
  twitterOauthToken?: string | null;
  twitterOauthTokenSecret?: string | null;
}): XUserAuth | null {
  const consumerKey = process.env.TWITTER_CONSUMER_KEY?.trim() || "";
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET?.trim() || "";
  if (!consumerKey || !consumerSecret) return null;
  if (!user?.twitterOauthToken || !user?.twitterOauthTokenSecret) return null;
  try {
    return {
      consumerKey,
      consumerSecret,
      accessToken: decryptOAuthSecret(user.twitterOauthToken),
      accessTokenSecret: decryptOAuthSecret(user.twitterOauthTokenSecret),
    };
  } catch {
    return null;
  }
}

async function getXUserIdForActor(user: any, auth: XUserAuth): Promise<string> {
  const explicit = String(user?.twitterId || "").trim();
  if (isDigits(explicit)) return explicit;

  const cacheKey = `${String(user?.id || "")}:${auth.accessToken.slice(0, 16)}`;
  const cached = xUserIdCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId;
  }

  const me = await xRequestAsUser({
    method: "GET",
    url: `${X_API_BASE}/users/me`,
    auth,
  });
  const userId = String(me?.data?.id || "").trim();
  if (!isDigits(userId)) {
    throw new XApiError(502, "Could not resolve your X account id for authenticated actions");
  }

  xUserIdCache.set(cacheKey, { userId, expiresAt: Date.now() + X_USER_ID_CACHE_MS });
  return userId;
}

async function postReplyAsUser(params: {
  auth: XUserAuth;
  text: string;
  inReplyToTweetId: string;
}) {
  return xRequestAsUser({
    method: "POST",
    url: `${X_API_BASE}/tweets`,
    auth: params.auth,
    body: {
      text: params.text,
      reply: {
        in_reply_to_tweet_id: params.inReplyToTweetId,
      },
    },
  }) as Promise<{
    data?: {
      id?: string;
      text?: string;
    };
  }>;
}

async function fetchJson(url: string, bearer: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`X API ${response.status}: ${body || response.statusText}`);
  }

  return response.json();
}

type XUser = {
  id: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
};

async function fetchUsersByUsernames(
  usernames: string[],
  bearer: string
): Promise<Map<string, XUser>> {
  if (usernames.length === 0) return new Map();

  const map = new Map<string, XUser>();

  for (let i = 0; i < usernames.length; i += X_USERS_BY_USERNAMES_LIMIT) {
    const chunk = usernames.slice(i, i + X_USERS_BY_USERNAMES_LIMIT);
    if (chunk.length === 0) continue;

    const query = new URLSearchParams({
      usernames: chunk.join(","),
      "user.fields": "profile_image_url,name,username",
    });
    const url = `${X_API_BASE}/users/by?${query.toString()}`;

    try {
      const data = await fetchJson(url, bearer);
      const rows = Array.isArray(data?.data) ? (data.data as XUser[]) : [];
      for (const row of rows) {
        if (!row?.username) continue;
        map.set(row.username.toLowerCase(), row);
      }
    } catch (err) {
      console.warn(`[w] failed to fetch user chunk (${i}-${i + chunk.length - 1}):`, err);
    }
  }

  return map;
}

async function fetchRecentPosts(userId: string, bearer: string, startTimeIso: string) {
  const query = new URLSearchParams({
    max_results: String(POSTS_PER_ACCOUNT),
    exclude: "retweets",
    expansions: "attachments.media_keys",
    "tweet.fields": "attachments,created_at,entities,public_metrics,text",
    "media.fields": "alt_text,height,media_key,preview_image_url,type,url,width",
    start_time: startTimeIso,
  });
  const url = `${X_API_BASE}/users/${encodeURIComponent(userId)}/tweets?${query.toString()}`;
  const data = await fetchJson(url, bearer);
  const rows = Array.isArray(data?.data) ? data.data : [];
  const includesMedia = Array.isArray(data?.includes?.media)
    ? (data.includes.media as XMedia[])
    : [];

  const mediaByKey = new Map<string, XMedia>();
  for (const media of includesMedia) {
    if (!media?.media_key) continue;
    mediaByKey.set(media.media_key, media);
  }

  return (rows as Array<{
    id: string;
    text?: string;
    created_at?: string;
    attachments?: { media_keys?: string[] };
    entities?: { urls?: XUrlEntity[] };
    public_metrics?: {
      like_count?: number;
      reply_count?: number;
      retweet_count?: number;
      quote_count?: number;
    };
  }>).map((row) => {
    const entitiesUrls = Array.isArray(row.entities?.urls)
      ? row.entities?.urls.filter((u): u is XUrlEntity => Boolean(u?.url))
      : [];
    const media = Array.isArray(row.attachments?.media_keys)
      ? row.attachments!.media_keys!
          .map((key) => mediaByKey.get(key))
          .filter((m): m is XMedia => Boolean(m?.media_key))
          .map((m) => ({
            type: m.type || "unknown",
            url: m.url || null,
            previewUrl: m.preview_image_url || null,
            width: typeof m.width === "number" ? m.width : null,
            height: typeof m.height === "number" ? m.height : null,
            altText: m.alt_text || null,
          }))
      : [];

    return {
      id: row.id,
      text: row.text || "",
      displayText: cleanDisplayText(row.text || "", entitiesUrls),
      created_at: row.created_at,
      media,
      links: entitiesUrls.map((u) => ({
        url: String(u.url || ""),
        expandedUrl: u.expanded_url || null,
        displayUrl: u.display_url || null,
      })),
      public_metrics: row.public_metrics,
    };
  });
}

router.get("/api/w/timeline", isAuthenticated, async (req, res) => {
  try {
    const requester = req.user as any;
    const canReplyInline = Boolean(
      requester?.twitterVerified &&
        requester?.twitterOauthToken &&
        requester?.twitterOauthTokenSecret &&
        process.env.TWITTER_CONSUMER_KEY?.trim() &&
        process.env.TWITTER_CONSUMER_SECRET?.trim()
    );
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        twitterHandle: users.twitterHandle,
        twitterVerified: users.twitterVerified,
        twitterPublic: users.twitterPublic,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.twitterHandle),
          eq(users.twitterVerified, true),
          isNotNull(users.twitterId)
        )
      );

    const accounts = rows
      .map((row) => {
        const normalized = normalizeHandle(row.twitterHandle || "");
        if (!normalized) return null;
        return {
          userId: row.id,
          username: row.username,
          displayName: row.displayName,
          twitterHandle: normalized,
          profileUrl: `https://x.com/${normalized}`,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.twitterHandle.localeCompare(b.twitterHandle));

    const uniqueHandles = Array.from(
      new Set(accounts.map((a) => a.twitterHandle.toLowerCase()))
    );
    const limitedHandles =
      MAX_ACCOUNTS > 0 ? uniqueHandles.slice(0, MAX_ACCOUNTS) : uniqueHandles;
    const skipCount = Math.max(0, uniqueHandles.length - limitedHandles.length);

    const hasToken = Boolean(
      process.env.X_BEARER_TOKEN?.trim() || process.env.TWITTER_BEARER_TOKEN?.trim()
    );
    const requestCacheKey = `${limitedHandles.join(",")}|${hasToken ? "token" : "links"}`;
    const forceRefresh = String(req.query.refresh || "") === "1";

    if (
      !forceRefresh &&
      cachedPayload &&
      requestCacheKey === cachedKey &&
      Date.now() < cacheExpiresAt
    ) {
      return res.json({
        ...cachedPayload,
        canReplyInline,
      });
    }

    if (!hasToken) {
      const payload: TimelinePayload = {
        source: "links-only",
        refreshedAt: new Date().toISOString(),
        canReplyInline,
        accounts,
        timeline: [],
        diagnostics: {
          message:
            "Timeline fetch is disabled. Set X_BEARER_TOKEN (or TWITTER_BEARER_TOKEN) on the server to pull recent posts.",
          skippedAccounts: skipCount,
        },
      };
      cachedKey = requestCacheKey;
      cachedPayload = payload;
      cacheExpiresAt = Date.now() + FEED_CACHE_MS;
      return res.json(payload);
    }

    const bearer =
      process.env.X_BEARER_TOKEN?.trim() || process.env.TWITTER_BEARER_TOKEN?.trim() || "";

    const usersByHandle = await fetchUsersByUsernames(limitedHandles, bearer);
    const startTimeIso = new Date(
      Date.now() - TIMELINE_DAYS_BACK * 24 * 60 * 60 * 1000
    ).toISOString();

    const timeline: TimelinePayload["timeline"] = [];
    let failedAccountFetches = 0;

    for (const account of accounts) {
      const xUser = usersByHandle.get(account.twitterHandle.toLowerCase());
      if (!xUser?.id || !xUser?.username) continue;

      try {
        const posts = await fetchRecentPosts(xUser.id, bearer, startTimeIso);
        for (const post of posts) {
          if (!post?.id || !post?.text) continue;
          timeline.push({
            id: post.id,
            text: post.text,
            displayText: post.displayText || post.text,
            createdAt: post.created_at || new Date().toISOString(),
            url: `https://x.com/${xUser.username}/status/${post.id}`,
            media: Array.isArray(post.media) ? post.media : [],
            links: Array.isArray(post.links)
              ? post.links.map((link) => ({ ...link, preview: null }))
              : [],
            author: {
              userId: account.userId,
              username: account.username,
              displayName: account.displayName,
              twitterHandle: account.twitterHandle,
              name: xUser.name || null,
              avatarUrl: xUser.profile_image_url || null,
            },
            metrics: {
              likes: Number(post.public_metrics?.like_count || 0),
              replies: Number(post.public_metrics?.reply_count || 0),
              reposts: Number(post.public_metrics?.retweet_count || 0),
              quotes: Number(post.public_metrics?.quote_count || 0),
            },
          });
        }
      } catch (err) {
        failedAccountFetches += 1;
        console.warn(`[w] failed to fetch posts for @${account.twitterHandle}:`, err);
      }
    }

    timeline.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const enrichedTimeline = await enrichTimelineWithLinkPreviews(timeline);

    const payload: TimelinePayload = {
      source: "x-api-v2",
      refreshedAt: new Date().toISOString(),
      canReplyInline,
      accounts,
      timeline: enrichedTimeline,
      diagnostics: {
        ...(failedAccountFetches > 0
          ? {
              message: `Failed to fetch posts for ${failedAccountFetches} account(s). Check X app access level and bearer token permissions.`,
            }
          : {}),
        skippedAccounts: skipCount,
      },
    };

    cachedKey = requestCacheKey;
    cachedPayload = payload;
    cacheExpiresAt = Date.now() + FEED_CACHE_MS;

    res.json(payload);
  } catch (err) {
    console.error("[w] timeline fetch failed:", err);
    res.status(500).json({ error: "Failed to load W timeline" });
  }
});

router.post("/api/w/reply", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const postId = String(req.body?.postId || "").trim();
    const text = String(req.body?.text || "").trim();

    if (!postId || !/^\d+$/.test(postId)) {
      return res.status(400).json({ error: "Invalid postId" });
    }
    if (!text) {
      return res.status(400).json({ error: "Reply text is required" });
    }
    if (text.length > X_POST_MAX_LENGTH) {
      return res.status(400).json({ error: `Reply must be ${X_POST_MAX_LENGTH} characters or less` });
    }
    const auth = getTwitterWriteAuthOrThrow(user);

    const result = await postReplyAsUser({
      auth,
      text,
      inReplyToTweetId: postId,
    });

    const tweetId = String(result?.data?.id || "").trim();
    if (!tweetId) {
      return res.status(502).json({ error: "X API did not return the created reply id" });
    }

    const authorHandle = normalizeHandle(user?.twitterHandle || "") || "i";
    return res.json({
      ok: true,
      id: tweetId,
      url: `https://x.com/${authorHandle}/status/${tweetId}`,
    });
  } catch (err: any) {
    console.error("[w] reply failed:", err);
    if (err instanceof XApiError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to publish reply" });
  }
});

router.post("/api/w/like", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const postId = normalizePostId(req.body?.postId);
    const auth = getTwitterWriteAuthOrThrow(user);
    const actorId = await getXUserIdForActor(user, auth);

    await xRequestAsUser({
      method: "POST",
      url: `${X_API_BASE}/users/${encodeURIComponent(actorId)}/likes`,
      auth,
      body: {
        tweet_id: postId,
      },
    });

    return res.json({ ok: true, postId });
  } catch (err) {
    console.error("[w] like failed:", err);
    if (err instanceof XApiError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to like post" });
  }
});

router.post("/api/w/repost", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const postId = normalizePostId(req.body?.postId);
    const auth = getTwitterWriteAuthOrThrow(user);
    const actorId = await getXUserIdForActor(user, auth);

    await xRequestAsUser({
      method: "POST",
      url: `${X_API_BASE}/users/${encodeURIComponent(actorId)}/retweets`,
      auth,
      body: {
        tweet_id: postId,
      },
    });

    return res.json({ ok: true, postId });
  } catch (err) {
    console.error("[w] repost failed:", err);
    if (err instanceof XApiError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to repost" });
  }
});

router.post("/api/w/quote", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const postId = normalizePostId(req.body?.postId);
    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ error: "Quote text is required" });
    }
    if (text.length > X_POST_MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `Quote must be ${X_POST_MAX_LENGTH} characters or less` });
    }

    const auth = getTwitterWriteAuthOrThrow(user);
    const result = (await xRequestAsUser({
      method: "POST",
      url: `${X_API_BASE}/tweets`,
      auth,
      body: {
        text,
        quote_tweet_id: postId,
      },
    })) as { data?: { id?: string } };

    const tweetId = String(result?.data?.id || "").trim();
    if (!tweetId) {
      return res.status(502).json({ error: "X API did not return the created quote id" });
    }

    const authorHandle = normalizeHandle(user?.twitterHandle || "") || "i";
    return res.json({
      ok: true,
      id: tweetId,
      url: `https://x.com/${authorHandle}/status/${tweetId}`,
    });
  } catch (err) {
    console.error("[w] quote failed:", err);
    if (err instanceof XApiError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to quote post" });
  }
});

export default router;
