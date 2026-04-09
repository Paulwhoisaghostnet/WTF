import { Router } from "express";
import { createHmac, randomBytes } from "crypto";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import { decryptOAuthSecret } from "../auth/oauth-crypto";

const router = Router();

const X_API_BASE = (process.env.X_API_BASE_URL || "https://api.twitter.com/2").replace(/\/$/, "");
const FEED_CACHE_MS = Math.max(30_000, Number(process.env.W_FEED_CACHE_MS || 120_000));
const X_USERS_BY_USERNAMES_LIMIT = 100;
const MAX_ACCOUNTS = Math.max(0, Number(process.env.W_FEED_MAX_ACCOUNTS || 0));
const POSTS_PER_ACCOUNT = Math.max(5, Math.min(100, Number(process.env.W_POSTS_PER_ACCOUNT || 20)));
const TIMELINE_DAYS_BACK = Math.max(1, Number(process.env.W_TIMELINE_DAYS_BACK || 7));
const X_POST_MAX_LENGTH = 280;

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
    createdAt: string;
    url: string;
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

let cachedKey = "";
let cachedPayload: TimelinePayload | null = null;
let cacheExpiresAt = 0;

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
  method: "POST" | "GET";
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

async function postReplyAsUser(params: {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  text: string;
  inReplyToTweetId: string;
}) {
  const url = `${X_API_BASE}/tweets`;
  const authHeader = buildOAuth1Header({
    method: "POST",
    url,
    consumerKey: params.consumerKey,
    consumerSecret: params.consumerSecret,
    accessToken: params.accessToken,
    accessTokenSecret: params.accessTokenSecret,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: params.text,
      reply: {
        in_reply_to_tweet_id: params.inReplyToTweetId,
      },
    }),
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
    const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
    const apiMessage =
      firstError?.message ||
      payload?.detail ||
      payload?.title ||
      payload?.error ||
      response.statusText;
    throw new Error(`X API ${response.status}: ${apiMessage}`);
  }

  return payload as {
    data?: {
      id?: string;
      text?: string;
    };
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
    "tweet.fields": "created_at,public_metrics,text",
    start_time: startTimeIso,
  });
  const url = `${X_API_BASE}/users/${encodeURIComponent(userId)}/tweets?${query.toString()}`;
  const data = await fetchJson(url, bearer);
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows as Array<{
    id: string;
    text?: string;
    created_at?: string;
    public_metrics?: {
      like_count?: number;
      reply_count?: number;
      retweet_count?: number;
      quote_count?: number;
    };
  }>;
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
          or(eq(users.twitterVerified, true), eq(users.twitterPublic, true))
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
    const cacheKey = `${limitedHandles.join(",")}|${hasToken ? "token" : "links"}`;
    const forceRefresh = String(req.query.refresh || "") === "1";

    if (!forceRefresh && cachedPayload && cacheKey === cachedKey && Date.now() < cacheExpiresAt) {
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
      cachedKey = cacheKey;
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
            createdAt: post.created_at || new Date().toISOString(),
            url: `https://x.com/${xUser.username}/status/${post.id}`,
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

    const payload: TimelinePayload = {
      source: "x-api-v2",
      refreshedAt: new Date().toISOString(),
      canReplyInline,
      accounts,
      timeline,
      diagnostics: {
        ...(failedAccountFetches > 0
          ? {
              message: `Failed to fetch posts for ${failedAccountFetches} account(s). Check X app access level and bearer token permissions.`,
            }
          : {}),
        skippedAccounts: skipCount,
      },
    };

    cachedKey = cacheKey;
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
    if (!user?.twitterVerified) {
      return res.status(403).json({ error: "Twitter account is not verified on your WTF profile" });
    }

    const consumerKey = process.env.TWITTER_CONSUMER_KEY?.trim() || "";
    const consumerSecret = process.env.TWITTER_CONSUMER_SECRET?.trim() || "";
    if (!consumerKey || !consumerSecret) {
      return res
        .status(500)
        .json({ error: "Twitter app credentials are not configured on the server" });
    }

    if (!user.twitterOauthToken || !user.twitterOauthTokenSecret) {
      return res
        .status(403)
        .json({ error: "Twitter posting permission is missing. Reconnect Twitter in your profile." });
    }

    let accessToken = "";
    let accessTokenSecret = "";
    try {
      accessToken = decryptOAuthSecret(user.twitterOauthToken);
      accessTokenSecret = decryptOAuthSecret(user.twitterOauthTokenSecret);
    } catch (err) {
      console.warn("[w] failed to decrypt stored Twitter OAuth credentials:", err);
      return res
        .status(500)
        .json({ error: "Twitter credentials could not be decrypted. Reconnect Twitter in your profile." });
    }

    const result = await postReplyAsUser({
      consumerKey,
      consumerSecret,
      accessToken,
      accessTokenSecret,
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
    const message = String(err?.message || "");
    if (message.includes("X API 401") || message.includes("X API 403")) {
      return res
        .status(403)
        .json({ error: "X rejected this reply. Reconnect Twitter and confirm app write permissions." });
    }
    return res.status(500).json({ error: "Failed to publish reply" });
  }
});

export default router;
