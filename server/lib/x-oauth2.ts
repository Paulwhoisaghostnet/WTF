import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users, platformSettings } from "@shared/schema";
import { validatePlatformSettingValue } from "./platform-settings";
import { decryptOAuthSecret, encryptOAuthSecret } from "../auth/oauth-crypto";
import { logSystemEvent } from "./system-log";

const X_API_BASE = (process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/$/, "");
const TOKEN_URL = "https://api.x.com/2/oauth2/token";

// ── env-oauth2 token lifecycle ──────────────────────────────────────
// Reads X_OAUTH2_ACCESS_TOKEN / X_OAUTH2_REFRESH_TOKEN from env, auto-refreshes
// when expired, and persists rotated tokens to platform_settings so they survive
// restarts without re-exporting env vars.

const ENV_TOKEN_SETTINGS_KEY = "w.env_oauth2_tokens";
const ENV_REFRESH_BACKOFF_MS = 15 * 60_000;

let envOAuth2AccessToken: string | null = process.env.X_OAUTH2_ACCESS_TOKEN?.trim() || null;
let envOAuth2RefreshToken: string | null = process.env.X_OAUTH2_REFRESH_TOKEN?.trim() || null;
let envOAuth2ExpiresAt: number = envOAuth2RefreshToken ? 0 : Date.now() + 7200_000;
let envOAuth2BootLoaded = false;
let envRefreshFailedUntil = 0;
let envRefreshConsecutiveFailures = 0;

async function loadPersistedEnvOAuth2Tokens(): Promise<void> {
  if (envOAuth2BootLoaded) return;
  envOAuth2BootLoaded = true;
  try {
    const [row] = await db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, ENV_TOKEN_SETTINGS_KEY));
    if (!row?.value) return;
    const stored = JSON.parse(row.value);
    if (stored.accessToken) envOAuth2AccessToken = stored.accessToken;
    if (stored.refreshToken) envOAuth2RefreshToken = stored.refreshToken;
    if (stored.expiresAt && stored.expiresAt > Date.now()) {
      envOAuth2ExpiresAt = stored.expiresAt;
    }
  } catch { /* first boot or corrupt row — use env values */ }
}

async function persistEnvOAuth2Tokens(): Promise<void> {
  const value = validatePlatformSettingValue(
    JSON.stringify({
      accessToken: envOAuth2AccessToken,
      refreshToken: envOAuth2RefreshToken,
      expiresAt: envOAuth2ExpiresAt,
      updatedAt: Date.now(),
    })
  );
  await db
    .insert(platformSettings)
    .values({ key: ENV_TOKEN_SETTINGS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

async function refreshEnvOAuth2Token(): Promise<string | null> {
  if (!envOAuth2RefreshToken) return null;
  if (Date.now() < envRefreshFailedUntil) return null;

  const clientId = process.env.TWITTER_CLIENT_ID?.trim() || "";
  if (!clientId) return null;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim() || "";

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: envOAuth2RefreshToken,
    client_id: clientId,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const response = await fetch(TOKEN_URL, { method: "POST", headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    envRefreshConsecutiveFailures++;
    const backoff = Math.min(
      ENV_REFRESH_BACKOFF_MS * Math.pow(2, envRefreshConsecutiveFailures - 1),
      4 * 60 * 60_000,
    );
    envRefreshFailedUntil = Date.now() + backoff;
    logSystemEvent({
      source: "x-oauth2",
      eventType: "env_token_refresh_failed",
      severity: "warn",
      message: `Env OAuth2 refresh failed (attempt ${envRefreshConsecutiveFailures}), backing off ${Math.round(backoff / 60_000)}min`,
      statusCode: response.status,
      metadata: {
        error: payload?.error,
        errorDescription: payload?.error_description,
        consecutiveFailures: envRefreshConsecutiveFailures,
        nextRetryAt: new Date(envRefreshFailedUntil).toISOString(),
      },
    });
    if (envRefreshConsecutiveFailures >= 3) {
      envOAuth2AccessToken = null;
      envOAuth2RefreshToken = null;
      envOAuth2ExpiresAt = 0;
      await db.delete(platformSettings).where(eq(platformSettings.key, ENV_TOKEN_SETTINGS_KEY));
      logSystemEvent({
        source: "x-oauth2",
        eventType: "env_token_dead_mans_switch",
        severity: "error",
        message: "Env OAuth2 token cache cleared after 3 consecutive refresh failures",
        statusCode: response.status,
        metadata: {
          error: payload?.error,
          errorDescription: payload?.error_description,
        },
      });
    }
    return null;
  }

  envRefreshConsecutiveFailures = 0;
  envRefreshFailedUntil = 0;
  envOAuth2AccessToken = payload.access_token;
  if (payload.refresh_token) envOAuth2RefreshToken = payload.refresh_token;
  envOAuth2ExpiresAt = payload.expires_in
    ? Date.now() + Number(payload.expires_in) * 1000
    : Date.now() + 7200_000;

  logSystemEvent({
    source: "x-oauth2",
    eventType: "env_token_refresh_success",
    severity: "info",
    message: "Env OAuth2 token refreshed",
    metadata: { expiresAt: new Date(envOAuth2ExpiresAt).toISOString() },
  });

  persistEnvOAuth2Tokens().catch((e) =>
    console.error("[env-oauth2] persist failed:", e)
  );

  return envOAuth2AccessToken;
}

async function getEnvOAuth2AccessToken(): Promise<string | null> {
  await loadPersistedEnvOAuth2Tokens();
  if (!envOAuth2AccessToken && !envOAuth2RefreshToken) return null;

  const needsRefresh =
    Boolean(envOAuth2RefreshToken) &&
    (!envOAuth2ExpiresAt || envOAuth2ExpiresAt < Date.now() + 60_000);
  if (needsRefresh) {
    const refreshed = await refreshEnvOAuth2Token();
    if (refreshed) return refreshed;
    return null;
  }
  return envOAuth2AccessToken;
}

export type XOAuth2TierKey = "read" | "engage";

export const X_OAUTH2_TIERS: Array<{
  key: XOAuth2TierKey;
  label: string;
  description: string;
  scopes: string[];
  enables: string[];
}> = [
  {
    key: "read",
    label: "Identity + read-only W",
    description: "Verifies your X identity so your public posts can appear in W. No refresh, posting, or DM permissions.",
    scopes: ["tweet.read", "users.read"],
    enables: ["Timeline inclusion", "Connected account badge", "Read-only gameshow groupchat"],
  },
  {
    key: "engage",
    label: "Timeline actions",
    description: "Adds user-authorized replies, quotes, reposts, and likes inside W.",
    scopes: ["tweet.read", "tweet.write", "users.read", "like.write", "offline.access"],
    enables: ["Replies/comments", "Quotes", "Likes", "Reposts"],
  },
];

export const X_CAPABILITIES = [
  { key: "timeline", label: "Timeline posts", scopes: ["tweet.read"], available: true },
  { key: "comments", label: "Comments / replies", scopes: ["tweet.write"], available: true },
  { key: "likes", label: "Likes", scopes: ["like.write"], available: true },
  { key: "quotes", label: "Quote posts", scopes: ["tweet.write"], available: true },
  { key: "reposts", label: "Reposts", scopes: ["tweet.write"], available: true },
  {
    key: "group_chats",
    label: "Gameshow chat mirror",
    scopes: [],
    available: true,
    note: "Read-only public mirror served from the platform gameshow account cache. Normal users do not grant DM scopes.",
  },
] as const;

function parseScopes(input: string | null | undefined): Set<string> {
  return new Set(
    String(input || "")
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
}

export function userHasXScopes(user: any, required: string[]): boolean {
  const scopes = parseScopes(user?.twitterOauth2Scopes);
  return required.every((scope) => scopes.has(scope));
}

export async function getFullUserForXOAuth2Token(userId: number | string) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const [record] = await db
    .select({
      id: users.id,
      twitterHandle: users.twitterHandle,
      twitterId: users.twitterId,
      twitterOauth2AccessToken: users.twitterOauth2AccessToken,
      twitterOauth2RefreshToken: users.twitterOauth2RefreshToken,
      twitterOauth2ExpiresAt: users.twitterOauth2ExpiresAt,
      twitterOauth2Scopes: users.twitterOauth2Scopes,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return record || null;
}

type XOAuth2UserTokenRow = {
  id: number;
  twitterHandle: string | null;
  twitterOauth2AccessToken: string | null;
  twitterOauth2RefreshToken: string | null;
  twitterOauth2ExpiresAt: Date | string | null;
  twitterOauth2Scopes: string | null;
};

const USER_REFRESH_LOCK_NAMESPACE = "wtf:x-oauth2:user-refresh";
const USER_REFRESH_REUSE_WINDOW_MS = 60_000;

function userTokenStillFresh(user: XOAuth2UserTokenRow): boolean {
  const expiresAt = user.twitterOauth2ExpiresAt
    ? new Date(user.twitterOauth2ExpiresAt).getTime()
    : 0;
  return Boolean(
    user.twitterOauth2AccessToken &&
      expiresAt &&
      expiresAt >= Date.now() + USER_REFRESH_REUSE_WINDOW_MS
  );
}

async function fetchRefreshedUserTokenPayload(
  user: XOAuth2UserTokenRow
): Promise<any | null> {
  if (!user.twitterOauth2RefreshToken) return null;
  const clientId = process.env.TWITTER_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim() || "";
  if (!clientId) return null;

  const refreshToken = decryptOAuthSecret(user.twitterOauth2RefreshToken);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const handle = user.twitterHandle || user.id || "unknown";
  const response = await fetch(TOKEN_URL, { method: "POST", headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    logSystemEvent({
      source: "x-oauth2",
      eventType: "user_token_refresh_failed",
      severity: "warn",
      message: `OAuth2 refresh failed for @${handle}`,
      userId: typeof user.id === "number" ? user.id : null,
      statusCode: response.status,
      metadata: {
        twitterHandle: handle,
        error: payload?.error,
        errorDescription: payload?.error_description,
      },
    });
    return null;
  }
  return payload;
}

async function refreshUserToken(user: XOAuth2UserTokenRow): Promise<string | null> {
  if (!user?.twitterOauth2RefreshToken) return null;
  const id = Number(user.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${USER_REFRESH_LOCK_NAMESPACE}), ${id}::int)`
    );

    const [lockedUser] = await tx
      .select({
        id: users.id,
        twitterHandle: users.twitterHandle,
        twitterOauth2AccessToken: users.twitterOauth2AccessToken,
        twitterOauth2RefreshToken: users.twitterOauth2RefreshToken,
        twitterOauth2ExpiresAt: users.twitterOauth2ExpiresAt,
        twitterOauth2Scopes: users.twitterOauth2Scopes,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!lockedUser?.twitterOauth2RefreshToken) return null;

    if (userTokenStillFresh(lockedUser)) {
      return decryptOAuthSecret(lockedUser.twitterOauth2AccessToken!);
    }

    const payload = await fetchRefreshedUserTokenPayload(lockedUser);
    if (!payload?.access_token) return null;

    const expiresAt = payload.expires_in
      ? new Date(Date.now() + Number(payload.expires_in) * 1000)
      : null;
    await tx
      .update(users)
      .set({
        twitterOauth2AccessToken: encryptOAuthSecret(payload.access_token),
        twitterOauth2RefreshToken: payload.refresh_token
          ? encryptOAuthSecret(payload.refresh_token)
          : lockedUser.twitterOauth2RefreshToken,
        twitterOauth2Scopes: payload.scope || lockedUser.twitterOauth2Scopes || null,
        twitterOauth2ExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, lockedUser.id));

    const handle = lockedUser.twitterHandle || lockedUser.id || "unknown";
    logSystemEvent({
      source: "x-oauth2",
      eventType: "user_token_refresh_success",
      severity: "info",
      message: `OAuth2 token refreshed for @${handle}`,
      userId: lockedUser.id,
      metadata: {
        twitterHandle: handle,
        expiresAt: expiresAt?.toISOString() || null,
        scopesReturned: payload.scope || null,
      },
    });

    return payload.access_token;
  });
}

export async function getUserXOAuth2AccessToken(
  user: any,
  requiredScopes: string[] = []
): Promise<string | null> {
  if (!user?.twitterOauth2AccessToken) return null;
  if (requiredScopes.length > 0 && !userHasXScopes(user, requiredScopes)) return null;

  const expiresAt = user.twitterOauth2ExpiresAt
    ? new Date(user.twitterOauth2ExpiresAt).getTime()
    : 0;
  const shouldRefresh =
    Boolean(user.twitterOauth2RefreshToken) &&
    (!expiresAt || expiresAt < Date.now() + 60_000);
  if (shouldRefresh) {
    const refreshed = await refreshUserToken(user);
    if (refreshed) return refreshed;
    return null;
  }

  return decryptOAuthSecret(user.twitterOauth2AccessToken);
}

export type PlatformXOAuth2Status = {
  token: string | null;
  source: "env-encrypted" | "env-raw" | "env-oauth2" | "user-record" | "none";
  reason?:
    | "no_handle_configured"
    | "no_user_with_handle"
    | "user_no_oauth2_token"
    | "user_missing_dm_read_scope"
    | "user_token_refresh_failed";
  handle?: string;
  scopes?: string[];
};

/**
 * Resolve the X account that W mirrors gameshow groupchats from.
 *
 * Resolution order:
 *   1. `W_X_DEFAULT_ACCOUNT_OAUTH2_ACCESS_TOKEN` (encrypted env)
 *   2. `W_X_DEFAULT_ACCOUNT_ACCESS_TOKEN` (raw env, mostly for CI)
 *   3. The WTF user whose `twitterHandle` matches `W_X_DEFAULT_ACCOUNT_HANDLE`
 *      and whose stored OAuth2 scopes include `dm.read`. Normal W users do
 *      not request DM scopes; this fallback is only for an already-authorized
 *      platform gameshow account record.
 */
export async function getPlatformXOAuth2Status(): Promise<PlatformXOAuth2Status> {
  const encrypted = process.env.W_X_DEFAULT_ACCOUNT_OAUTH2_ACCESS_TOKEN?.trim();
  const raw = process.env.W_X_DEFAULT_ACCOUNT_ACCESS_TOKEN?.trim();
  if (encrypted) {
    try {
      return { token: decryptOAuthSecret(encrypted), source: "env-encrypted" };
    } catch {
      return { token: encrypted, source: "env-encrypted" };
    }
  }
  if (raw) return { token: raw, source: "env-raw" };

  // Priority 2.5: X_OAUTH2_ACCESS_TOKEN + X_OAUTH2_REFRESH_TOKEN from env
  const envToken = await getEnvOAuth2AccessToken();
  if (envToken) {
    return {
      token: envToken,
      source: "env-oauth2",
      handle: process.env.W_X_DEFAULT_ACCOUNT_HANDLE?.trim() || undefined,
    };
  }

  const handle = process.env.W_X_DEFAULT_ACCOUNT_HANDLE?.trim();
  if (!handle) {
    return { token: null, source: "none", reason: "no_handle_configured" };
  }
  const normalized = handle.replace(/^@/, "").toLowerCase();

  const [record] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.twitterHandle}) = ${normalized}`)
    .limit(1);

  if (!record) {
    return { token: null, source: "none", reason: "no_user_with_handle", handle };
  }
  if (!record.twitterOauth2AccessToken) {
    return {
      token: null,
      source: "none",
      reason: "user_no_oauth2_token",
      handle: record.twitterHandle || handle,
    };
  }

  const scopes = parseScopes(record.twitterOauth2Scopes);
  if (!scopes.has("dm.read")) {
    return {
      token: null,
      source: "none",
      reason: "user_missing_dm_read_scope",
      handle: record.twitterHandle || handle,
      scopes: Array.from(scopes),
    };
  }

  // Routes through the existing per-user refresh path so an expired token
  // gets transparently swapped without operator intervention.
  const token = await getUserXOAuth2AccessToken(record, ["dm.read"]);
  if (!token) {
    return {
      token: null,
      source: "none",
      reason: "user_token_refresh_failed",
      handle: record.twitterHandle || handle,
      scopes: Array.from(scopes),
    };
  }
  return {
    token,
    source: "user-record",
    handle: record.twitterHandle || handle,
    scopes: Array.from(scopes),
  };
}

export async function getPlatformXOAuth2AccessToken(): Promise<string | null> {
  const status = await getPlatformXOAuth2Status();
  return status.token;
}

function readRateLimitHeaders(response: Response) {
  const reset = Number(response.headers.get("x-rate-limit-reset") || 0);
  const remaining = response.headers.get("x-rate-limit-remaining");
  const retryAfterRaw = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterRaw ? Number(retryAfterRaw) : 0;
  return {
    rateLimitReset: Number.isFinite(reset) && reset > 0 ? reset : null,
    rateLimitRemaining: remaining === null ? null : Number(remaining),
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : null,
  };
}

export async function xOAuth2Request(params: {
  method: "GET" | "POST" | "DELETE";
  path: string;
  accessToken: string;
  body?: unknown;
}) {
  const response = await fetch(`${X_API_BASE}${params.path}`, {
    method: params.method,
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const text = await response.text().catch(() => "");
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  const rateInfo = readRateLimitHeaders(response);
  if (!response.ok) {
    const message =
      payload?.detail ||
      payload?.title ||
      payload?.error_description ||
      payload?.error ||
      response.statusText;
    const error = new Error(`X API ${response.status}: ${message}`);
    (error as any).status = response.status;
    (error as any).payload = payload;
    (error as any).bodyText = text;
    (error as any).path = params.path;
    (error as any).rateLimitReset = rateInfo.rateLimitReset;
    (error as any).rateLimitRemaining = rateInfo.rateLimitRemaining;
    (error as any).retryAfterSeconds = rateInfo.retryAfterSeconds;
    throw error;
  }
  if (rateInfo.rateLimitReset !== null) {
    Object.defineProperty(payload, "__xRateLimit", {
      value: rateInfo,
      enumerable: false,
    });
  }
  return payload;
}

export function rateLimitResetEpochSecondsFromError(err: any): number | null {
  const reset = Number(err?.rateLimitReset || 0);
  if (Number.isFinite(reset) && reset > 0) return reset;
  const retryAfter = Number(err?.retryAfterSeconds || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.floor(Date.now() / 1000) + retryAfter;
  }
  return null;
}
