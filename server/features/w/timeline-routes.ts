import type { Router } from "express";
import { isAuthenticated } from "../../auth/passport";
import { loadWTimelineAuthorWindow } from "../../lib/timeline-db";
import { userHasXScopes } from "../../lib/x-oauth2";
import {
  enrichTimelineWithLinkPreviews,
} from "./link-preview";
import { getXTezosIdentityHints } from "../../lib/objkt-identity";
import {
  buildTimelineFromDbCache,
  type TimelinePayload,
} from "./timeline";

const FEED_CACHE_MS = Math.max(30_000, Number(process.env.W_FEED_CACHE_MS || 120_000));
const MAX_ACCOUNTS = Math.max(1, Number(process.env.W_FEED_MAX_ACCOUNTS || 50));

type WTimelineRoutesDeps = {
  xApiBaseUrl?: string;
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

export function registerWTimelineRoutes(router: Router, _deps: WTimelineRoutesDeps = {}): void {
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

      const requestCacheKey = `${limitedHandles.join(",")}|stream-db`;
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

      const dbTimeline = await buildTimelineFromDbCache(accounts, limitedHandlesLower);
      if (dbTimeline && dbTimeline.length > 0) {
        const payload: TimelinePayload = {
          source: "filtered-stream-cache",
          refreshedAt: new Date().toISOString(),
          canReplyInline,
          accounts,
          timeline: await attachTezosIdentityHints(await enrichTimelineWithLinkPreviews(dbTimeline)),
          diagnostics: {
            message:
              "Timeline from filtered-stream DB cache. Recent-search recovery is off during normal operation.",
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

      const payload: TimelinePayload = {
        source: "links-only",
        refreshedAt: new Date().toISOString(),
        canReplyInline,
        accounts,
        timeline: [],
        diagnostics: {
          message:
            "No timeline rows in DB yet. W timeline ingestion now relies on X Filtered Stream; recent search is recovery-only and legacy per-user fanout is disabled.",
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
