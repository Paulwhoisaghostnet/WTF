import { Router } from "express";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { isAuthenticated } from "../auth/passport";

const router = Router();

const X_API_BASE = (process.env.X_API_BASE_URL || "https://api.twitter.com/2").replace(/\/$/, "");
const FEED_CACHE_MS = Math.max(30_000, Number(process.env.W_FEED_CACHE_MS || 120_000));
const MAX_ACCOUNTS = 15;
const POSTS_PER_ACCOUNT = 4;

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

  const query = new URLSearchParams({
    usernames: usernames.join(","),
    "user.fields": "profile_image_url,name,username",
  });
  const url = `${X_API_BASE}/users/by?${query.toString()}`;
  const data = await fetchJson(url, bearer);
  const rows = Array.isArray(data?.data) ? (data.data as XUser[]) : [];
  const map = new Map<string, XUser>();
  for (const row of rows) {
    if (!row?.username) continue;
    map.set(row.username.toLowerCase(), row);
  }
  return map;
}

async function fetchRecentPosts(userId: string, bearer: string) {
  const query = new URLSearchParams({
    max_results: String(POSTS_PER_ACCOUNT),
    exclude: "retweets",
    "tweet.fields": "created_at,public_metrics,text",
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
    const requesterId = Number(requester?.id || 0);

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        twitterHandle: users.twitterHandle,
      })
      .from(users)
      .where(
        and(
          eq(users.twitterVerified, true),
          isNotNull(users.twitterHandle),
          or(eq(users.twitterPublic, true), eq(users.id, requesterId))
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
    const limitedHandles = uniqueHandles.slice(0, MAX_ACCOUNTS);
    const skipCount = Math.max(0, uniqueHandles.length - limitedHandles.length);

    const hasToken = Boolean(
      process.env.X_BEARER_TOKEN?.trim() || process.env.TWITTER_BEARER_TOKEN?.trim()
    );
    const cacheKey = `${limitedHandles.join(",")}|${hasToken ? "token" : "links"}`;
    const forceRefresh = String(req.query.refresh || "") === "1";

    if (!forceRefresh && cachedPayload && cacheKey === cachedKey && Date.now() < cacheExpiresAt) {
      return res.json(cachedPayload);
    }

    if (!hasToken) {
      const payload: TimelinePayload = {
        source: "links-only",
        refreshedAt: new Date().toISOString(),
        canReplyInline: false,
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

    const timeline: TimelinePayload["timeline"] = [];

    for (const account of accounts) {
      const xUser = usersByHandle.get(account.twitterHandle.toLowerCase());
      if (!xUser?.id || !xUser?.username) continue;

      try {
        const posts = await fetchRecentPosts(xUser.id, bearer);
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
        console.warn(`[w] failed to fetch posts for @${account.twitterHandle}:`, err);
      }
    }

    timeline.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const payload: TimelinePayload = {
      source: "x-api-v2",
      refreshedAt: new Date().toISOString(),
      canReplyInline: false,
      accounts,
      timeline,
      diagnostics: {
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

export default router;
