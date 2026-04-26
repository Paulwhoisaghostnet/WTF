import { Router } from "express";
import { createHmac, randomBytes } from "crypto";
import multer from "multer";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { platformSettings, users } from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import { decryptOAuthSecret } from "../auth/oauth-crypto";
import { hasPermission } from "../lib/permissions";
import {
  X_CAPABILITIES,
  X_OAUTH2_TIERS,
  getPlatformXOAuth2AccessToken,
  getPlatformXOAuth2Status,
  getUserXOAuth2AccessToken,
  userHasXScopes,
  xOAuth2Request,
} from "../lib/x-oauth2";

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
const W_MEDIA_MAX_BYTES = 15 * 1024 * 1024;
const wMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: W_MEDIA_MAX_BYTES, files: 1 },
});
const W_GAMESHOW_DM_SETTING_KEY = "w.gameshow_dm_conversation_id";
const DEFAULT_W_GAMESHOW_DM_CONVERSATION_ID = "g1934373363226407162";
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

function isDmConversationId(value: string | null | undefined): boolean {
  return /^(?:\d+|g\d+)$/i.test(String(value || "").trim());
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

async function uploadXMedia(accessToken: string, file: Express.Multer.File) {
  const mime = String(file.mimetype || "").toLowerCase();
  const category = mime.includes("gif")
    ? "tweet_gif"
    : mime.startsWith("video/")
      ? "tweet_video"
      : "tweet_image";
  const form = new FormData();
  const mediaBytes = new Uint8Array(file.buffer);
  form.set("media", new Blob([mediaBytes], { type: file.mimetype }), file.originalname || "w-media");
  form.set("media_category", category);
  const response = await fetch(`${X_API_BASE}/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const text = await response.text().catch(() => "");
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new XApiError(response.status, `X media upload ${response.status}: ${parseXApiMessage(payload, response.statusText)}`);
  }
  const mediaId = String(payload?.data?.id || payload?.media_id_string || payload?.media_id || "").trim();
  if (!mediaId) throw new XApiError(502, "X media upload did not return a media id");
  return {
    id: mediaId,
    category,
    expiresAfterSecs: payload?.data?.expires_after_secs || payload?.expires_after_secs || null,
  };
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

async function getSettingValue(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  const value = String(row?.value || "").trim();
  return value || null;
}

async function setSettingValue(key: string, value: string, updatedBy: number) {
  await db
    .insert(platformSettings)
    .values({
      key,
      value,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        value,
        updatedBy,
        updatedAt: new Date(),
      },
    });
}

function parseConversationIds(value: string | null | undefined): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.map((id) => String(id).trim()).filter(isDmConversationId)));
    }
  } catch {
    // Accept legacy single-id and comma-separated env/config values.
  }
  return Array.from(new Set(raw.split(/[,\s]+/).map((id) => id.trim()).filter(isDmConversationId)));
}

async function dmConversationIds(): Promise<string[]> {
  const configured = await getSettingValue(W_GAMESHOW_DM_SETTING_KEY);
  const envConfigured =
    process.env.W_X_GAMESHOW_DM_CONVERSATION_IDS ||
    process.env.W_X_GAMESHOW_DM_CONVERSATION_ID ||
    DEFAULT_W_GAMESHOW_DM_CONVERSATION_ID;
  return parseConversationIds(configured || envConfigured);
}

async function dmConversationId(): Promise<string> {
  return (await dmConversationIds())[0] || "";
}

function normalizeDmEvents(payload: any) {
  const usersById = new Map<string, any>();
  for (const row of Array.isArray(payload?.includes?.users) ? payload.includes.users : []) {
    if (row?.id) usersById.set(String(row.id), row);
  }

  return (Array.isArray(payload?.data) ? payload.data : [])
    .map((event: any) => {
      const senderId = String(event?.sender_id || event?.sender_id_str || "");
      const sender = usersById.get(senderId) || null;
      const text =
        event?.text ||
        event?.message_create?.message_data?.text ||
        event?.dm_event_data?.text ||
        "";
      return {
        id: String(event?.id || ""),
        eventType: String(event?.event_type || event?.type || "message"),
        text: String(text || ""),
        createdAt: event?.created_at || event?.created_timestamp || null,
        sender: sender
          ? {
              id: String(sender.id),
              username: sender.username || null,
              name: sender.name || null,
              profileImageUrl: sender.profile_image_url || null,
            }
          : { id: senderId || null, username: null, name: null, profileImageUrl: null },
      };
    })
    .filter((event: any) => event.id && event.text);
}

function normalizeDmConversations(payload: any) {
  const usersById = new Map<string, any>();
  for (const row of Array.isArray(payload?.includes?.users) ? payload.includes.users : []) {
    if (row?.id) usersById.set(String(row.id), row);
  }

  return (Array.isArray(payload?.data) ? payload.data : [])
    .map((conversation: any) => {
      const participantIds = Array.isArray(conversation?.participant_ids)
        ? conversation.participant_ids.map((id: unknown) => String(id))
        : [];
      const participants = participantIds.map((id: string) => {
        const user = usersById.get(id);
        return {
          id,
          username: user?.username || null,
          name: user?.name || null,
          profileImageUrl: user?.profile_image_url || null,
        };
      });
      return {
        id: String(conversation?.id || conversation?.dm_conversation_id || ""),
        type: conversation?.dm_conversation_type || conversation?.type || null,
        name: conversation?.name || conversation?.title || null,
        createdAt: conversation?.created_at || null,
        participantCount: participantIds.length,
        participants,
      };
    })
    .filter((conversation: any) => conversation.id);
}

function mergeConversationParticipants(target: Set<string>, ids: unknown) {
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    const normalized = String(id || "").trim();
    if (isDigits(normalized)) target.add(normalized);
  }
}

function normalizeDmConversationsFromEvents(payload: any) {
  const usersById = new Map<string, any>();
  for (const row of Array.isArray(payload?.includes?.users) ? payload.includes.users : []) {
    if (row?.id) usersById.set(String(row.id), row);
  }

  const byConversation = new Map<
    string,
    {
      id: string;
      createdAt: string | null;
      participantIds: Set<string>;
    }
  >();

  for (const event of Array.isArray(payload?.data) ? payload.data : []) {
    const conversationId = String(
      event?.dm_conversation_id ||
        event?.dm_conversation_id_str ||
        event?.dm_event_data?.dm_conversation_id ||
        ""
    ).trim();
    if (!isDmConversationId(conversationId)) continue;

    const existing =
      byConversation.get(conversationId) ||
      {
        id: conversationId,
        createdAt: event?.created_at || null,
        participantIds: new Set<string>(),
      };

    mergeConversationParticipants(existing.participantIds, event?.participant_ids);
    const senderId = String(event?.sender_id || event?.sender_id_str || "").trim();
    if (isDigits(senderId)) existing.participantIds.add(senderId);

    if (event?.created_at && (!existing.createdAt || event.created_at > existing.createdAt)) {
      existing.createdAt = event.created_at;
    }
    byConversation.set(conversationId, existing);
  }

  return Array.from(byConversation.values()).map((conversation) => {
    const participantIds = Array.from(conversation.participantIds);
    const participants = participantIds.map((id) => {
      const user = usersById.get(id);
      return {
        id,
        username: user?.username || null,
        name: user?.name || null,
        profileImageUrl: user?.profile_image_url || null,
      };
    });
    return {
      id: conversation.id,
      type: participantIds.length >= 3 ? "group" : "direct",
      name: null,
      createdAt: conversation.createdAt,
      participantCount: participantIds.length,
      participants,
    };
  });
}

function dmEventsQuery(maxResults: number, paginationToken?: string) {
  const query = new URLSearchParams({
    max_results: String(Math.max(10, Math.min(maxResults, 100))),
    "dm_event.fields": "created_at,dm_conversation_id,event_type,participant_ids,sender_id,text",
    expansions: "sender_id,participant_ids",
    "user.fields": "name,username,profile_image_url",
  });
  if (paginationToken) query.set("pagination_token", paginationToken);
  return query;
}

async function fetchDmConversationList(accessToken: string, maxResults = 50) {
  const conversations = new Map<string, ReturnType<typeof normalizeDmConversationsFromEvents>[number]>();
  let nextToken = "";

  // X v2 exposes DM lookup as an authenticated user's event stream. Reconstruct
  // visible conversations from /2/dm_events, then use per-conversation endpoints
  // for reads/sends once a conversation id is known.
  for (let page = 0; page < 5; page += 1) {
    const payload = await xOAuth2Request({
      method: "GET",
      path: `/dm_events?${dmEventsQuery(maxResults, nextToken).toString()}`,
      accessToken,
    });
    for (const conversation of normalizeDmConversationsFromEvents(payload)) {
      const existing = conversations.get(conversation.id);
      if (!existing) {
        conversations.set(conversation.id, conversation);
        continue;
      }
      const participantsById = new Map(
        [...existing.participants, ...conversation.participants].map((participant: any) => [
          participant.id,
          participant,
        ])
      );
      existing.participants = Array.from(participantsById.values());
      existing.participantCount = existing.participants.length;
      existing.type = existing.participantCount >= 3 ? "group" : "direct";
      if (conversation.createdAt && (!existing.createdAt || conversation.createdAt > existing.createdAt)) {
        existing.createdAt = conversation.createdAt;
      }
    }
    nextToken = String(payload?.meta?.next_token || "");
    if (!nextToken || conversations.size >= maxResults) break;
  }

  return Array.from(conversations.values())
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, maxResults);
}

function xDmReadFailurePayload(err: any, fallback: string) {
  const upstreamStatus = Number(err?.status || 0);
  const upstreamPath = typeof err?.path === "string" ? err.path : null;
  const upstreamBody = typeof err?.bodyText === "string" ? err.bodyText.slice(0, 1000) : undefined;
  const error =
    upstreamStatus === 404
      ? "X did not expose the Direct Messages read endpoint for this token/app. Reconnect with the Full W participation tier and confirm the X app has Direct Message read/write enabled on the active Pay-Per-Use plan."
      : upstreamStatus === 401
        ? "X rejected the OAuth2 token. Reconnect X with the Full W participation tier."
        : upstreamStatus === 402
          ? "X says the app needs active Pay-Per-Use credits before Direct Messages can be read."
          : upstreamStatus === 403
            ? "X rejected Direct Message access for this token. Reconnect with the Full W participation tier and confirm dm.read/dm.write are enabled in the X app settings."
            : fallback;
  return {
    error,
    upstreamStatus: upstreamStatus || null,
    upstreamPath,
    upstreamBody,
  };
}

function xDmReadFailureStatus(err: any) {
  const upstreamStatus = Number(err?.status || 0);
  if (upstreamStatus === 401 || upstreamStatus === 403) return 403;
  if (upstreamStatus === 402) return 402;
  if (upstreamStatus === 404) return 424;
  if (upstreamStatus >= 500) return 502;
  return upstreamStatus || 500;
}

function isGroupDmConversation(conversation: {
  type?: string | null;
  participantCount?: number;
  participants?: unknown[];
}): boolean {
  const type = String(conversation.type || "").toLowerCase();
  const participantCount =
    typeof conversation.participantCount === "number"
      ? conversation.participantCount
      : Array.isArray(conversation.participants)
        ? conversation.participants.length
        : 0;
  return participantCount >= 3 || type.includes("group");
}

async function connectedWtfUsersByTwitterId(twitterIds: string[]) {
  const ids = Array.from(new Set(twitterIds.filter(isDigits)));
  if (ids.length === 0) return new Map<string, {
    id: number;
    username: string;
    displayName: string | null;
    twitterId: string | null;
    twitterHandle: string | null;
  }>();

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      twitterId: users.twitterId,
      twitterHandle: users.twitterHandle,
    })
    .from(users)
    .where(
      and(
        inArray(users.twitterId, ids),
        eq(users.twitterVerified, true),
        isNotNull(users.twitterOauth2AccessToken)
      )
    );

  return new Map(
    rows
      .filter((row) => row.twitterId)
      .map((row) => [String(row.twitterId), row])
  );
}

async function filterConversationToWtfNetwork(conversation: any, viewerTwitterId: string) {
  const participantIds = (conversation.participants || [])
    .map((participant: any) => String(participant?.id || ""))
    .filter(isDigits);
  if (!participantIds.includes(viewerTwitterId)) return null;

  const peerIds = participantIds.filter((id: string) => id !== viewerTwitterId);
  if (peerIds.length === 0) return null;

  const peersByTwitterId = await connectedWtfUsersByTwitterId(peerIds);
  if (peerIds.some((id: string) => !peersByTwitterId.has(id))) {
    return null;
  }

  return {
    id: conversation.id,
    type: conversation.type,
    name: conversation.name,
    createdAt: conversation.createdAt,
    participantCount: participantIds.length,
    peers: peerIds.map((twitterId: string) => {
      const user = peersByTwitterId.get(twitterId)!;
      return {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        twitterId,
        twitterHandle: user.twitterHandle,
      };
    }),
  };
}

async function getAllowedUserDmConversation(params: {
  accessToken: string;
  conversationId: string;
  viewerTwitterId: string;
}) {
  const summary = await fetchDmConversationSummary(params.accessToken, params.conversationId);
  if (!summary) return null;
  return filterConversationToWtfNetwork(summary, params.viewerTwitterId);
}

async function fetchDmConversationSummary(accessToken: string, conversationId: string) {
  const payload = await xOAuth2Request({
    method: "GET",
    path: `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?${dmEventsQuery(100).toString()}`,
    accessToken,
  });
  return normalizeDmConversationsFromEvents(payload).find(
    (conversation) => conversation.id === conversationId
  ) || null;
}

async function fetchDmConversationWithParticipant(accessToken: string, participantId: string) {
  const payload = await xOAuth2Request({
    method: "GET",
    path: `/dm_conversations/with/${encodeURIComponent(participantId)}/dm_events?${dmEventsQuery(100).toString()}`,
    accessToken,
  });
  return normalizeDmConversationsFromEvents(payload)[0] || null;
}

async function canUseWAdminControls(user: any): Promise<boolean> {
  if (!user?.role) return false;
  return (
    (await hasPermission(user.role, "access_admin_panel")) &&
    (await hasPermission(user.role, "manage_roles"))
  );
}

async function fetchGameshowGroupchat(accessToken: string, conversationId: string, maxResults = 50) {
  if (!conversationId) {
    return {
      configured: false,
      conversationId: null,
      conversation: null,
      messages: [],
      diagnostics: {
        message: "Select at least one X group DM conversation for W to mirror.",
      },
    };
  }

  const summary = await fetchDmConversationSummary(accessToken, conversationId);
  if (!summary || !isGroupDmConversation(summary)) {
    return {
      configured: false,
      conversationId,
      conversation: summary,
      messages: [],
      diagnostics: {
        message:
          "The configured X DM conversation is not a group conversation visible to the WTF Gameshow account. W will not mirror it.",
      },
    };
  }

  const query = new URLSearchParams({
    max_results: String(Math.max(10, Math.min(maxResults, 100))),
    "dm_event.fields": "created_at,dm_conversation_id,event_type,sender_id,text",
    expansions: "sender_id,participant_ids",
    "user.fields": "name,username,profile_image_url",
  });
  const payload = await xOAuth2Request({
    method: "GET",
    path: `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?${query.toString()}`,
    accessToken,
  });

  return {
    configured: true,
    conversationId,
    conversation: summary,
    messages: normalizeDmEvents(payload),
    diagnostics: null,
  };
}

async function fetchGameshowGroupchats(accessToken: string, maxResults = 50) {
  const conversationIds = await dmConversationIds();
  if (conversationIds.length === 0) {
    return [
      await fetchGameshowGroupchat(accessToken, "", maxResults),
    ];
  }
  return Promise.all(
    conversationIds.map((conversationId) =>
      fetchGameshowGroupchat(accessToken, conversationId, maxResults)
    )
  );
}

router.post("/api/w/post", isAuthenticated, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    const mediaIds = Array.isArray(req.body?.mediaIds)
      ? req.body.mediaIds.map((id: unknown) => String(id || "").trim()).filter(isDigits).slice(0, 4)
      : [];
    if (!text) return res.status(400).json({ error: "Post text is required" });
    if (text.length > X_POST_MAX_LENGTH) {
      return res.status(400).json({ error: `Post must be ${X_POST_MAX_LENGTH} characters or less` });
    }

    const accessToken = await getUserXOAuth2AccessToken(req.user as any, ["tweet.write"]);
    if (!accessToken) {
      return res.status(403).json({
        error: "Reconnect X with the Timeline actions tier to create posts in W.",
      });
    }

    const result = await xOAuth2Request({
      method: "POST",
      path: "/tweets",
      accessToken,
      body: {
        text,
        ...(mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {}),
      },
    });
    const tweetId = String(result?.data?.id || "").trim();
    const authorHandle = normalizeHandle((req.user as any)?.twitterHandle || "") || "i";
    res.status(201).json({
      ok: true,
      id: tweetId || null,
      url: tweetId ? `https://x.com/${authorHandle}/status/${tweetId}` : null,
      result,
    });
  } catch (err: any) {
    console.error("[w] post create failed:", err);
    res.status(err?.status || 500).json({ error: err?.message || "Failed to create post" });
  }
});

router.post("/api/w/media", isAuthenticated, (req, res) => {
  wMediaUpload.single("media")(req, res, async (uploadErr: unknown) => {
    try {
      if (uploadErr) {
        return res.status(400).json({ error: uploadErr instanceof Error ? uploadErr.message : "Media upload failed" });
      }
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No media file uploaded" });
      const mime = String(file.mimetype || "").toLowerCase();
      const allowed =
        mime.startsWith("image/jpeg") ||
        mime.startsWith("image/png") ||
        mime.startsWith("image/webp") ||
        mime.startsWith("image/gif") ||
        mime.startsWith("video/");
      if (!allowed) {
        return res.status(400).json({ error: "W supports JPG, PNG, WEBP, GIF, and video uploads for X posts." });
      }
      if (file.size > W_MEDIA_MAX_BYTES) {
        return res.status(400).json({ error: "Media must be 15MB or less." });
      }
      const accessToken = await getUserXOAuth2AccessToken(req.user as any, ["tweet.write"]);
      if (!accessToken) {
        return res.status(403).json({ error: "Reconnect X with the Timeline actions tier to upload media." });
      }
      const media = await uploadXMedia(accessToken, file);
      return res.status(201).json({ ok: true, media });
    } catch (err: any) {
      console.error("[w] media upload failed:", err);
      return res.status(err?.status || 500).json({ error: err?.message || "Failed to upload media to X" });
    }
  });
});

router.get("/api/w/capabilities", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const scopes = String(user?.twitterOauth2Scopes || "")
      .split(/[,\s]+/)
      .filter(Boolean);
    const platformStatus = await getPlatformXOAuth2Status();
    const groupchatIds = await dmConversationIds();

    res.json({
      oauth2Configured: Boolean(process.env.TWITTER_CLIENT_ID?.trim()),
      platformAccountConfigured: Boolean(platformStatus.token),
      platformAccountSource: platformStatus.source,
      platformAccountReason: platformStatus.reason,
      platformAccountHandle: platformStatus.handle,
      groupchatConfigured: groupchatIds.length > 0,
      groupchatIds,
      connected: Boolean(user?.twitterOauth2AccessToken),
      canUseAdminControls: await canUseWAdminControls(user),
      scopes,
      tiers: X_OAUTH2_TIERS,
      capabilities: X_CAPABILITIES.map((capability) => ({
        ...capability,
        enabled:
          capability.scopes.length === 0
            ? Boolean(capability.available)
            : userHasXScopes(user, [...capability.scopes]),
      })),
      defaultAccountHandle: process.env.W_X_DEFAULT_ACCOUNT_HANDLE || "wtfgameshow",
    });
  } catch (err) {
    console.error("[w] capability fetch failed:", err);
    res.status(500).json({ error: "Failed to load W capabilities" });
  }
});

router.get("/api/w/groupchat", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const platformStatus = await getPlatformXOAuth2Status();
    if (!platformStatus.token) {
      const reasonMessage = (() => {
        switch (platformStatus.reason) {
          case "no_handle_configured":
            return "Set W_X_DEFAULT_ACCOUNT_HANDLE (and either link the gameshow X account through W messages tier as that user, or set W_X_DEFAULT_ACCOUNT_OAUTH2_ACCESS_TOKEN) to mirror the gameshow groupchat.";
          case "no_user_with_handle":
            return `No WTF user has linked X account @${platformStatus.handle}. Log in as the gameshow admin, open W → Settings → Connect X (messages tier) and authorise as @${platformStatus.handle}.`;
          case "user_no_oauth2_token":
            return `@${platformStatus.handle} is on the WTF account but has not completed OAuth2. Open W → Settings → Connect X (messages tier).`;
          case "user_missing_dm_read_scope":
            return `@${platformStatus.handle} is connected but the granted scopes are missing dm.read. Open W → Settings, switch the tier to "Full W participation (messages)" and re-connect — that grants dm.read + dm.write.`;
          case "user_token_refresh_failed":
            return `@${platformStatus.handle}'s OAuth2 token expired and could not be refreshed. Open W → Settings → Connect X (messages tier) again.`;
          default:
            return "No platform X token is configured. Set W_X_DEFAULT_ACCOUNT_OAUTH2_ACCESS_TOKEN, or link the gameshow X account through W (messages tier) on a user whose twitterHandle matches W_X_DEFAULT_ACCOUNT_HANDLE.";
        }
      })();
      return res.json({
        configured: false,
        readonly: true,
        canWrite: false,
        chats: [],
        messages: [],
        diagnostics: {
          message: reasonMessage,
          reason: platformStatus.reason || null,
          handle: platformStatus.handle || null,
          source: platformStatus.source,
        },
      });
    }

    const chats = await fetchGameshowGroupchats(platformStatus.token, Number(req.query.limit || 50));
    const primary = chats.find((chat) => chat.configured) || chats[0] || null;
    const userCanWrite = Boolean(await getUserXOAuth2AccessToken(user, ["dm.write"]));
    res.json({
      ...(primary || { configured: false, conversationId: null, messages: [], diagnostics: null }),
      chats,
      readonly: !userCanWrite,
      canWrite: userCanWrite,
      defaultAccountHandle: process.env.W_X_DEFAULT_ACCOUNT_HANDLE || "wtfgameshow",
    });
  } catch (err: any) {
    console.error("[w] groupchat fetch failed:", err);
    res
      .status(xDmReadFailureStatus(err))
      .json(xDmReadFailurePayload(err, "Failed to load groupchat"));
  }
});

router.get("/api/w/admin/dm-conversations", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!(await canUseWAdminControls(user))) {
      return res.status(403).json({ error: "Only gameshow admins can inspect platform X DMs" });
    }

    const platformStatus = await getPlatformXOAuth2Status();
    if (!platformStatus.token) {
      return res.status(500).json({
        error: "Default WTF Gameshow X account OAuth2 token is not configured",
        reason: platformStatus.reason || null,
        handle: platformStatus.handle || null,
      });
    }
    const accessToken = platformStatus.token;

    if (!user.twitterOauth2AccessToken || !user.twitterVerified) {
      return res.status(403).json({
        error: "Admins must connect X OAuth2 before selecting W groupchats",
      });
    }

    const currentConversationIds = await dmConversationIds();
    const discoveredConversations = await fetchDmConversationList(
      accessToken,
      Math.max(10, Math.min(Number(req.query.limit || 100), 100))
    );
    const configuredById = new Map<string, any>();
    for (const conversationId of currentConversationIds) {
      const summary = await fetchDmConversationSummary(accessToken, conversationId).catch(() => null);
      if (summary) configuredById.set(summary.id, summary);
    }
    const groupConversations = Array.from(
      new Map(
        [...discoveredConversations, ...configuredById.values()]
          .filter(isGroupDmConversation)
          .map((conversation: any) => [conversation.id, conversation])
      ).values()
    );
    res.json({
      currentConversationId: currentConversationIds[0] || null,
      currentConversationIds,
      conversations: groupConversations,
      diagnostics:
        "Loaded from /2/dm_events for the WTF Gameshow account. You can also paste group conversation IDs manually; W validates them through /2/dm_conversations/:id/dm_events.",
    });
  } catch (err: any) {
    console.error("[w] dm conversation list failed:", err);
    res
      .status(xDmReadFailureStatus(err))
      .json(xDmReadFailurePayload(err, "Failed to load X DM conversations"));
  }
});

router.put("/api/w/admin/groupchat", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!(await canUseWAdminControls(user))) {
      return res.status(403).json({ error: "Only gameshow admins can select gameshow groupchats" });
    }

    if (!user.twitterOauth2AccessToken || !user.twitterVerified) {
      return res.status(403).json({
        error: "Admins must connect X OAuth2 before selecting W groupchats",
      });
    }

    const requestedIds = Array.isArray(req.body?.conversationIds)
      ? req.body.conversationIds
      : [req.body?.conversationId];
    const conversationIds: string[] = Array.from(
      new Set(requestedIds.map((id: unknown) => String(id || "").trim()).filter(isDmConversationId))
    );
    if (conversationIds.length === 0) {
      return res.status(400).json({ error: "At least one valid X DM conversation id is required" });
    }

    const accessToken = await getPlatformXOAuth2AccessToken();
    if (!accessToken) {
      return res.status(500).json({
        error: "Default WTF Gameshow X account OAuth2 token is not configured",
      });
    }

    const summaries = [];
    for (const conversationId of conversationIds) {
      const summary = await fetchDmConversationSummary(accessToken, conversationId);
      if (!summary || !isGroupDmConversation(summary)) {
        return res.status(400).json({
          error: "Only group DM conversations can be selected as W groupchats",
        });
      }
      summaries.push(summary);
    }

    await setSettingValue(W_GAMESHOW_DM_SETTING_KEY, JSON.stringify(conversationIds), user.id);
    res.json({
      ok: true,
      conversationId: conversationIds[0] || null,
      conversationIds,
      conversations: summaries,
    });
  } catch (err: any) {
    console.error("[w] groupchat selection failed:", err);
    res
      .status(xDmReadFailureStatus(err))
      .json(xDmReadFailurePayload(err, "Failed to save gameshow groupchat selection"));
  }
});

router.post("/api/w/groupchat/messages", isAuthenticated, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Message text is required" });
    if (text.length > 1000) return res.status(400).json({ error: "Message text is too long" });

    const configuredIds = await dmConversationIds();
    const requestedConversationId = String(req.body?.conversationId || "").trim();
    const conversationId =
      requestedConversationId && configuredIds.includes(requestedConversationId)
        ? requestedConversationId
        : configuredIds[0] || "";
    if (!conversationId) {
      return res.status(500).json({ error: "No W groupchat is configured" });
    }
    if (requestedConversationId && !configuredIds.includes(requestedConversationId)) {
      return res.status(403).json({ error: "That X groupchat is not visible in W" });
    }

    const accessToken = await getUserXOAuth2AccessToken(req.user as any, ["dm.write"]);
    if (!accessToken) {
      return res.status(403).json({
        error: "Reconnect X with the Full W participation tier to send groupchat messages.",
      });
    }

    const result = await xOAuth2Request({
      method: "POST",
      path: `/dm_conversations/${encodeURIComponent(conversationId)}/messages`,
      accessToken,
      body: { text },
    });
    res.status(201).json({ ok: true, result });
  } catch (err: any) {
    console.error("[w] groupchat send failed:", err);
    res.status(err?.status || 500).json({ error: err?.message || "Failed to send groupchat message" });
  }
});

router.get("/api/w/user-dms", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const viewerTwitterId = String(user?.twitterId || "").trim();
    if (!isDigits(viewerTwitterId)) {
      return res.status(403).json({ error: "Connect X OAuth2 before opening W direct messages" });
    }

    const accessToken = await getUserXOAuth2AccessToken(user, ["dm.read"]);
    if (!accessToken) {
      return res.status(403).json({
        error: "Reconnect X with the Full W participation tier to read W direct messages.",
      });
    }

    const peers = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        twitterId: users.twitterId,
        twitterHandle: users.twitterHandle,
      })
      .from(users)
      .where(
        and(
          eq(users.twitterVerified, true),
          isNotNull(users.twitterId),
          isNotNull(users.twitterOauth2AccessToken)
        )
      );

    const conversations = [];
    for (const peer of peers) {
      const peerTwitterId = String(peer.twitterId || "").trim();
      if (!isDigits(peerTwitterId) || peerTwitterId === viewerTwitterId) continue;
      const conversation = await fetchDmConversationWithParticipant(accessToken, peerTwitterId).catch(
        () => null
      );
      if (!conversation) continue;
      const allowed = await filterConversationToWtfNetwork(conversation, viewerTwitterId);
      if (allowed) conversations.push(allowed);
    }

    res.json({
      conversations,
      filtered: true,
      policy:
        "Only conversations where every other participant is a verified WTF user with X OAuth2 connected are returned.",
    });
  } catch (err: any) {
    console.error("[w] user dm inbox failed:", err);
    res
      .status(xDmReadFailureStatus(err))
      .json(xDmReadFailurePayload(err, "Failed to load W direct messages"));
  }
});

router.get("/api/w/user-dms/:conversationId/messages", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const viewerTwitterId = String(user?.twitterId || "").trim();
    const conversationId = String(req.params.conversationId || "").trim();
    if (!isDigits(viewerTwitterId) || !isDmConversationId(conversationId)) {
      return res.status(400).json({ error: "Invalid W direct message request" });
    }

    const accessToken = await getUserXOAuth2AccessToken(user, ["dm.read"]);
    if (!accessToken) {
      return res.status(403).json({
        error: "Reconnect X with the Full W participation tier to read W direct messages.",
      });
    }

    const conversation = await getAllowedUserDmConversation({
      accessToken,
      conversationId,
      viewerTwitterId,
    });
    if (!conversation) {
      return res.status(404).json({ error: "W direct message conversation not found" });
    }

    const query = new URLSearchParams({
      max_results: String(Math.max(10, Math.min(Number(req.query.limit || 50), 100))),
      "dm_event.fields": "created_at,dm_conversation_id,event_type,sender_id,text",
      expansions: "sender_id,participant_ids",
      "user.fields": "name,username,profile_image_url",
    });
    const payload = await xOAuth2Request({
      method: "GET",
      path: `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?${query.toString()}`,
      accessToken,
    });

    const peerByTwitterId = new Map(conversation.peers.map((peer: any) => [peer.twitterId, peer]));
    const messages = normalizeDmEvents(payload).map((message: any) => {
      const senderTwitterId = String(message.sender?.id || "");
      const peer = peerByTwitterId.get(senderTwitterId) as any;
      return {
        ...message,
        sender: {
          ...message.sender,
          wtfUserId: senderTwitterId === viewerTwitterId ? user.id : peer?.userId ?? null,
          wtfUsername: senderTwitterId === viewerTwitterId ? user.username : peer?.username ?? null,
          wtfDisplayName:
            senderTwitterId === viewerTwitterId ? user.displayName ?? null : peer?.displayName ?? null,
        },
      };
    });

    res.json({ conversation, messages });
  } catch (err: any) {
    console.error("[w] user dm messages failed:", err);
    res
      .status(xDmReadFailureStatus(err))
      .json(xDmReadFailurePayload(err, "Failed to load W direct messages"));
  }
});

router.post("/api/w/user-dms/:conversationId/messages", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const viewerTwitterId = String(user?.twitterId || "").trim();
    const conversationId = String(req.params.conversationId || "").trim();
    const text = String(req.body?.text || "").trim();
    if (!isDigits(viewerTwitterId) || !isDmConversationId(conversationId)) {
      return res.status(400).json({ error: "Invalid W direct message request" });
    }
    if (!text) return res.status(400).json({ error: "Message text is required" });
    if (text.length > 1000) return res.status(400).json({ error: "Message text is too long" });

    const accessToken = await getUserXOAuth2AccessToken(user, ["dm.read", "dm.write"]);
    if (!accessToken) {
      return res.status(403).json({
        error: "Reconnect X with the Full W participation tier to send W direct messages.",
      });
    }

    const conversation = await getAllowedUserDmConversation({
      accessToken,
      conversationId,
      viewerTwitterId,
    });
    if (!conversation) {
      return res.status(404).json({ error: "W direct message conversation not found" });
    }

    const result = await xOAuth2Request({
      method: "POST",
      path: `/dm_conversations/${encodeURIComponent(conversationId)}/messages`,
      accessToken,
      body: { text },
    });
    res.status(201).json({ ok: true, result });
  } catch (err: any) {
    console.error("[w] user dm send failed:", err);
    res
      .status(xDmReadFailureStatus(err))
      .json(xDmReadFailurePayload(err, "Failed to send W direct message"));
  }
});

router.post("/api/w/user-dms/direct", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const viewerTwitterId = String(user?.twitterId || "").trim();
    const targetUserId = Number(req.body?.targetUserId);
    const text = String(req.body?.text || "").trim();
    if (!isDigits(viewerTwitterId)) {
      return res.status(403).json({ error: "Connect X OAuth2 before sending W direct messages" });
    }
    if (!Number.isInteger(targetUserId) || targetUserId <= 0 || targetUserId === user.id) {
      return res.status(400).json({ error: "Valid targetUserId is required" });
    }
    if (!text) return res.status(400).json({ error: "Message text is required" });
    if (text.length > 1000) return res.status(400).json({ error: "Message text is too long" });

    const [target] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        twitterId: users.twitterId,
        twitterHandle: users.twitterHandle,
      })
      .from(users)
      .where(
        and(
          eq(users.id, targetUserId),
          eq(users.twitterVerified, true),
          isNotNull(users.twitterId),
          isNotNull(users.twitterOauth2AccessToken)
        )
      )
      .limit(1);
    if (!target?.twitterId) {
      return res.status(404).json({ error: "Target user is not connected to W direct messages" });
    }

    const accessToken = await getUserXOAuth2AccessToken(user, ["dm.write"]);
    if (!accessToken) {
      return res.status(403).json({
        error: "Reconnect X with the Full W participation tier to send W direct messages.",
      });
    }

    const result = await xOAuth2Request({
      method: "POST",
      path: `/dm_conversations/with/${encodeURIComponent(target.twitterId)}/messages`,
      accessToken,
      body: { text },
    });
    res.status(201).json({
      ok: true,
      target: {
        userId: target.id,
        username: target.username,
        displayName: target.displayName,
        twitterHandle: target.twitterHandle,
      },
      result,
    });
  } catch (err: any) {
    console.error("[w] user direct dm send failed:", err);
    res.status(err?.status || 500).json({ error: err?.message || "Failed to send W direct message" });
  }
});

router.post("/api/w/direct-messages", isAuthenticated, async (req, res) => {
  try {
    const actor = req.user as any;
    if (!(await canUseWAdminControls(actor))) {
      return res.status(403).json({ error: "Only gameshow admins can send platform X DMs" });
    }

    const targetUserId = Number(req.body?.targetUserId);
    const text = String(req.body?.text || "").trim();
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: "targetUserId is required" });
    }
    if (!text) return res.status(400).json({ error: "Message text is required" });
    if (text.length > 1000) return res.status(400).json({ error: "Message text is too long" });

    const [target] = await db
      .select({
        id: users.id,
        twitterId: users.twitterId,
        twitterHandle: users.twitterHandle,
        twitterVerified: users.twitterVerified,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
    if (!target) return res.status(404).json({ error: "Contestant not found" });
    if (!target.twitterId || !target.twitterVerified) {
      return res.status(400).json({ error: "Target user does not have a verified X account" });
    }

    const accessToken = await getPlatformXOAuth2AccessToken();
    if (!accessToken) {
      return res.status(500).json({
        error: "Default WTF Gameshow X account OAuth2 token is not configured",
      });
    }

    const result = await xOAuth2Request({
      method: "POST",
      path: `/dm_conversations/with/${encodeURIComponent(target.twitterId)}/messages`,
      accessToken,
      body: { text },
    });
    res.status(201).json({ ok: true, targetHandle: target.twitterHandle, result });
  } catch (err: any) {
    console.error("[w] platform direct message failed:", err);
    res.status(err?.status || 500).json({ error: err?.message || "Failed to send direct message" });
  }
});

router.get("/api/w/timeline", isAuthenticated, async (req, res) => {
  try {
    const requester = req.user as any;
    const canReplyInline = Boolean(
      requester?.twitterVerified && userHasXScopes(requester, ["tweet.write"])
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
    const accessToken = await getUserXOAuth2AccessToken(user, ["tweet.write"]);
    if (!accessToken) {
      return res.status(403).json({ error: "Reconnect X with Timeline actions to reply from W." });
    }

    const result = await xOAuth2Request({
      method: "POST",
      path: "/tweets",
      accessToken,
      body: {
        text,
        reply: { in_reply_to_tweet_id: postId },
      },
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
    const actorId = String(user?.twitterId || "").trim();
    if (!isDigits(actorId)) return res.status(403).json({ error: "Connect X before liking from W" });
    const accessToken = await getUserXOAuth2AccessToken(user, ["like.write"]);
    if (!accessToken) {
      return res.status(403).json({ error: "Reconnect X with Timeline actions to like from W." });
    }

    await xOAuth2Request({
      method: "POST",
      path: `/users/${encodeURIComponent(actorId)}/likes`,
      accessToken,
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
    const actorId = String(user?.twitterId || "").trim();
    if (!isDigits(actorId)) return res.status(403).json({ error: "Connect X before reposting from W" });
    const accessToken = await getUserXOAuth2AccessToken(user, ["tweet.write"]);
    if (!accessToken) {
      return res.status(403).json({ error: "Reconnect X with Timeline actions to repost from W." });
    }

    await xOAuth2Request({
      method: "POST",
      path: `/users/${encodeURIComponent(actorId)}/retweets`,
      accessToken,
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

    const accessToken = await getUserXOAuth2AccessToken(user, ["tweet.write"]);
    if (!accessToken) {
      return res.status(403).json({ error: "Reconnect X with Timeline actions to quote from W." });
    }
    const result = (await xOAuth2Request({
      method: "POST",
      path: "/tweets",
      accessToken,
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
