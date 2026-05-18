import { Router } from "express";
import { createHmac, randomBytes } from "crypto";
import { registerWSocialRoutes } from "../features/w/social-routes";
import { decryptOAuthSecret } from "../auth/oauth-crypto";
import { registerWLinkPreviewRoutes } from "../features/w/link-preview-routes";
import { registerWMessageRoutes } from "../features/w/message-routes";
import { registerWTimelineRoutes } from "../features/w/timeline-routes";
import { registerWTezosIdentityRoutes } from "../features/w/tezos-identity-routes";

const router = Router();

const X_API_BASE = (process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/$/, "");

/** Exported alias for internal workers (e.g. Phase 5 CRP nomination watcher). */
export const X_API_BASE_URL = X_API_BASE;

function normalizeHandle(handle: string): string | null {
  const cleaned = handle.trim().replace(/^@+/, "");
  if (!cleaned) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) return null;
  return cleaned;
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

registerWSocialRoutes(router, { normalizeHandle });

registerWMessageRoutes(router);
registerWTezosIdentityRoutes(router);

registerWTimelineRoutes(router, { xApiBaseUrl: X_API_BASE });

registerWLinkPreviewRoutes(router);

export default router;
