import type { Router } from "express";
import { isAuthenticated } from "../../auth/passport";
import {
  loadWTimelineAuthorWindow,
  upsertTimelinePostsFromLegacyApi,
} from "../../lib/timeline-db";
import { userHasXScopes } from "../../lib/x-oauth2";
import {
  enrichTimelineWithLinkPreviews,
  isLikelyMediaExpandedUrl,
} from "./link-preview";
import { getXTezosIdentityHints } from "../../lib/objkt-identity";
import {
  buildTimelineFromDbCache,
  type TimelinePayload,
} from "./timeline";

const DEFAULT_X_API_BASE = (process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/$/, "");
const FEED_CACHE_MS = Math.max(30_000, Number(process.env.W_FEED_CACHE_MS || 120_000));
/** When true, `/api/w/timeline` may still use bearer fan-out when DB is empty. Default: DB + search worker only. */
const USE_LEGACY_TIMELINE_FANOUT =
  String(process.env.USE_LEGACY_TIMELINE_FANOUT || "").trim() === "1" ||
  String(process.env.USE_LEGACY_TIMELINE_FANOUT || "").toLowerCase() === "true";
const X_USERS_BY_USERNAMES_LIMIT = 100;
const MAX_ACCOUNTS = Math.max(1, Number(process.env.W_FEED_MAX_ACCOUNTS || 50));
const POSTS_PER_ACCOUNT = Math.max(5, Math.min(100, Number(process.env.W_POSTS_PER_ACCOUNT || 20)));
const TIMELINE_DAYS_BACK = Math.max(1, Number(process.env.W_TIMELINE_DAYS_BACK || 7));

type WTimelineRoutesDeps = {
  xApiBaseUrl?: string;
};

type XUrlEntity = {
  url?: string;
  expanded_url?: string;
  display_url?: string;
};

type XMediaVariant = {
  bit_rate?: number;
  content_type?: string;
  url?: string;
};

type XMedia = {
  media_key: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  variants?: XMediaVariant[];
  width?: number;
  height?: number;
  alt_text?: string;
};

type XUser = {
  id: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };
};

let cachedKey = "";
let cachedPayload: TimelinePayload | null = null;
let cacheExpiresAt = 0;

async function attachTezosIdentityHints(timeline: TimelinePayload["timeline"]) {
  const handles = timeline.map((post) => post.author.twitterHandle).filter(Boolean);
  const hints = await getXTezosIdentityHints(handles);
  if (hints.length === 0) return timeline;
  const byHandle = new Map<string, typeof hints>();
  for (const hint of hints) {
    const list = byHandle.get(hint.twitterHandle) ?? [];
    list.push(hint);
    byHandle.set(hint.twitterHandle, list);
  }
  return timeline.map((post) => ({
    ...post,
    author: {
      ...post.author,
      tezosIdentities: byHandle.get(post.author.twitterHandle.toLowerCase()) ?? [],
    },
  }));
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

async function fetchUsersByUsernames(
  usernames: string[],
  bearer: string,
  xApiBaseUrl: string
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
    const url = `${xApiBaseUrl}/users/by?${query.toString()}`;

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

async function fetchRecentPosts(
  userId: string,
  bearer: string,
  startTimeIso: string,
  xApiBaseUrl: string
) {
  const query = new URLSearchParams({
    max_results: String(POSTS_PER_ACCOUNT),
    exclude: "retweets",
    expansions: "attachments.media_keys",
    "tweet.fields": "attachments,created_at,entities,public_metrics,text",
    "media.fields": "alt_text,height,media_key,preview_image_url,type,url,variants,width",
    start_time: startTimeIso,
  });
  const url = `${xApiBaseUrl}/users/${encodeURIComponent(userId)}/tweets?${query.toString()}`;
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
          .map((m) => {
            const variants = Array.isArray(m.variants) ? m.variants : [];
            const mp4 = variants
              .filter((v) => v.content_type === "video/mp4" && v.url)
              .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
            const bestVariant = mp4[0]?.url || null;
            const isPlayable = m.type === "animated_gif" || m.type === "video";
            return {
              type: m.type || "unknown",
              url: isPlayable ? (bestVariant || m.url || null) : (m.url || null),
              previewUrl: m.preview_image_url || null,
              videoUrl: isPlayable ? bestVariant : null,
              width: typeof m.width === "number" ? m.width : null,
              height: typeof m.height === "number" ? m.height : null,
              altText: m.alt_text || null,
            };
          })
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

export function registerWTimelineRoutes(router: Router, deps: WTimelineRoutesDeps = {}): void {
  const xApiBaseUrl = (deps.xApiBaseUrl || DEFAULT_X_API_BASE).replace(/\/$/, "");

  router.get("/api/w/timeline", isAuthenticated, async (req, res) => {
    try {
      const requester = req.user as any;
      const canReplyInline = Boolean(
        requester?.twitterVerified && userHasXScopes(requester, ["tweet.write"])
      );
      const accountWindow = await loadWTimelineAuthorWindow(MAX_ACCOUNTS);
      const accounts = accountWindow.accounts;
      const limitedHandles = accounts.map((account) => account.twitterHandle);
      const limitedHandlesLower = accountWindow.handlesLower;
      const skipCount = accountWindow.skippedAccounts;

      const hasToken = Boolean(
        process.env.X_BEARER_TOKEN?.trim() || process.env.TWITTER_BEARER_TOKEN?.trim()
      );
      /** When `source=search`, skip legacy bearer fan-out (DB + worker path only). */
      const forceSearchOnly = String(req.query.source || "").toLowerCase() === "search";
      const requestCacheKey = `${limitedHandles.join(",")}|${hasToken ? "token" : "links"}|${USE_LEGACY_TIMELINE_FANOUT ? "leg" : "srch"}|src:${forceSearchOnly ? "s" : "a"}`;
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

      // 1) Durable DB + oEmbed path (fed by `w-timeline-search-ingest` worker; minimal X credits)
      if (!(forceRefresh && USE_LEGACY_TIMELINE_FANOUT && hasToken)) {
        const dbTimeline = await buildTimelineFromDbCache(accounts, limitedHandlesLower);
        if (dbTimeline && dbTimeline.length > 0) {
          const enrichedTimeline = await enrichTimelineWithLinkPreviews(dbTimeline);
          const timelineWithTezos = await attachTezosIdentityHints(enrichedTimeline);
          const payload: TimelinePayload = {
            source: "db-cache",
            refreshedAt: new Date().toISOString(),
            canReplyInline,
            accounts,
            timeline: timelineWithTezos,
            diagnostics: {
              message:
                "Timeline from DB cache (tweet IDs via search worker; text hydrated with free oEmbed when needed).",
              skippedAccounts: skipCount,
              cachedAt: new Date().toISOString(),
              fromCache: true,
            },
          };
          cachedKey = requestCacheKey;
          cachedPayload = payload;
          cacheExpiresAt = Date.now() + FEED_CACHE_MS;
          return res.json(payload);
        }
      }

      // 2) Legacy per-account bearer fan-out (optional; high credit use)
      if (USE_LEGACY_TIMELINE_FANOUT && hasToken && !forceSearchOnly) {
        const bearer =
          process.env.X_BEARER_TOKEN?.trim() || process.env.TWITTER_BEARER_TOKEN?.trim() || "";

        const usersByHandle = await fetchUsersByUsernames(limitedHandles, bearer, xApiBaseUrl);
        const startTimeIso = new Date(
          Date.now() - TIMELINE_DAYS_BACK * 24 * 60 * 60 * 1000
        ).toISOString();

        const timeline: TimelinePayload["timeline"] = [];
        let failedAccountFetches = 0;

        for (const account of accounts) {
          const xUser = usersByHandle.get(account.twitterHandle.toLowerCase());
          if (!xUser?.id || !xUser?.username) continue;

          try {
            const posts = await fetchRecentPosts(xUser.id, bearer, startTimeIso, xApiBaseUrl);
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
        const timelineWithTezos = await attachTezosIdentityHints(enrichedTimeline);

        try {
          await upsertTimelinePostsFromLegacyApi(
            enrichedTimeline
              .map((t) => {
                const xid = usersByHandle.get(t.author.twitterHandle.toLowerCase())?.id;
                if (!xid || !/^\d+$/.test(xid)) return null;
                return {
                  id: t.id,
                  authorTwitterId: xid,
                  authorHandle: t.author.twitterHandle,
                  text: t.text,
                  displayText: t.displayText,
                  createdAt: new Date(t.createdAt),
                  media: t.media as unknown[],
                  links: t.links as unknown[],
                  metrics: t.metrics,
                };
              })
              .filter((x): x is NonNullable<typeof x> => Boolean(x))
          );
        } catch (persistErr) {
          console.warn("[w] timeline legacy persist to x_timeline_posts failed:", persistErr);
        }

        const payload: TimelinePayload = {
          source: "x-api-v2",
          refreshedAt: new Date().toISOString(),
          canReplyInline,
          accounts,
          timeline: timelineWithTezos,
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

        return res.json(payload);
      }

      // 3) Nothing to show yet
      const payload: TimelinePayload = {
        source: "links-only",
        refreshedAt: new Date().toISOString(),
        canReplyInline,
        accounts,
        timeline: [],
        diagnostics: {
          message: forceSearchOnly
            ? "No DB timeline rows yet (`source=search` skips legacy fan-out). Wait for `w-timeline-search-ingest` or remove the query param to allow legacy path if enabled."
            : USE_LEGACY_TIMELINE_FANOUT
              ? "No timeline rows in DB yet and X_BEARER_TOKEN is not set (required for legacy fan-out). Enable bearer token or wait for the search ingest worker."
              : "No timeline rows in DB yet. Ensure `w-timeline-search-ingest` can run (X_BEARER_TOKEN or platform X OAuth2) and apply migration 0039. Optional: set USE_LEGACY_TIMELINE_FANOUT=1 with bearer for immediate fan-out.",
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
}
