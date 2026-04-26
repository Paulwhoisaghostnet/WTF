import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { decryptOAuthSecret, encryptOAuthSecret } from "../auth/oauth-crypto";

const X_API_BASE = (process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/$/, "");
const TOKEN_URL = "https://api.x.com/2/oauth2/token";

export type XOAuth2TierKey = "read" | "engage" | "messages";

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
    description: "Adds posting, replies, quotes, reposts, and likes inside W.",
    scopes: ["tweet.read", "tweet.write", "users.read", "like.write", "offline.access"],
    enables: ["New posts", "Replies/comments", "Quotes", "Likes", "Reposts"],
  },
  {
    key: "messages",
    label: "Full W participation",
    description: "Adds X direct-message and groupchat read/write access where the X API plan allows it.",
    scopes: [
      "tweet.read",
      "tweet.write",
      "users.read",
      "like.write",
      "dm.read",
      "dm.write",
      "offline.access",
    ],
    enables: ["Gameshow groupchat participation", "Direct messages", "Message reactions where available"],
  },
];

export const X_CAPABILITIES = [
  { key: "timeline", label: "Timeline posts", scopes: ["tweet.read"], available: true },
  { key: "new_post", label: "New post", scopes: ["tweet.write"], available: true },
  { key: "comments", label: "Comments / replies", scopes: ["tweet.write"], available: true },
  { key: "likes", label: "Likes", scopes: ["like.write"], available: true },
  { key: "quotes", label: "Quote posts", scopes: ["tweet.write"], available: true },
  { key: "reposts", label: "Reposts", scopes: ["tweet.write"], available: true },
  { key: "polls", label: "Poll reading", scopes: ["tweet.read"], available: true },
  {
    key: "direct_messages",
    label: "Direct messages",
    scopes: ["dm.read", "dm.write"],
    available: true,
    note: "Requires X developer app DM permissions and an account that is allowed to DM the recipient.",
  },
  {
    key: "group_chats",
    label: "Group chats",
    scopes: ["dm.read", "dm.write"],
    available: true,
    note: "Requires W_X_GAMESHOW_DM_CONVERSATION_ID and X API access to the DM conversation endpoints.",
  },
  {
    key: "reactions",
    label: "Reactions / emojis",
    scopes: ["dm.write"],
    available: false,
    note: "The public X API does not expose a general emoji reaction endpoint equivalent to the native app.",
  },
  {
    key: "dislike",
    label: "Dislike",
    scopes: [],
    available: false,
    note: "The public X API does not provide a dislike action.",
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

async function refreshUserToken(user: any): Promise<string | null> {
  if (!user?.twitterOauth2RefreshToken) return null;
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

  const response = await fetch(TOKEN_URL, { method: "POST", headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) return null;

  const expiresAt = payload.expires_in
    ? new Date(Date.now() + Number(payload.expires_in) * 1000)
    : null;
  await db
    .update(users)
    .set({
      twitterOauth2AccessToken: encryptOAuthSecret(payload.access_token),
      twitterOauth2RefreshToken: payload.refresh_token
        ? encryptOAuthSecret(payload.refresh_token)
        : user.twitterOauth2RefreshToken,
      twitterOauth2Scopes: payload.scope || user.twitterOauth2Scopes || null,
      twitterOauth2ExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return payload.access_token;
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
  if (expiresAt && expiresAt < Date.now() + 60_000) {
    const refreshed = await refreshUserToken(user);
    if (refreshed) return refreshed;
  }

  return decryptOAuthSecret(user.twitterOauth2AccessToken);
}

export type PlatformXOAuth2Status = {
  token: string | null;
  source: "env-encrypted" | "env-raw" | "user-record" | "none";
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
 *      and whose stored OAuth2 scopes include `dm.read`. This is the
 *      common case: an admin logs into W as themselves, connects X with
 *      the messages tier, authorizes as the gameshow account, and W picks
 *      up the token automatically without manual env var ops.
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
    throw error;
  }
  return payload;
}
