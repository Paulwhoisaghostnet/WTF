import type { Router } from "express";
import { isAuthenticated } from "../../auth/passport";
import { loadWTimelineAuthorWindow } from "../../lib/timeline-db";
import {
  enrichTimelineWithLinkPreviews,
} from "./link-preview";
import { getXTezosIdentityHints } from "../../lib/objkt-identity";
import {
  buildTimelineFromDbCache,
  type TimelinePayload,
} from "./timeline";
import { publishCommunicationItemBestEffort } from "../comms/publisher";
import { getWTimelineIngestMode } from "../../lib/w-timeline-ingest-mode";

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

function publishWTimelineToComms(timeline: TimelinePayload["timeline"]): void {
  for (const post of timeline.slice(0, 40)) {
    void publishCommunicationItemBestEffort({
      sourceKey: "w",
      externalRef: `w:${post.id}`,
      itemKind: "external_post",
      title: post.author.twitterHandle
        ? `@${post.author.twitterHandle}`
        : "W timeline post",
      summary: post.displayText.slice(0, 260),
      body: post.displayText,
      authorLabel:
        post.author.name ||
        post.author.displayName ||
        post.author.twitterHandle ||
        "W",
      routePath: `/w/post/${encodeURIComponent(post.id)}`,
      originUrl: post.url,
      thread: {
        externalThreadRef: `w:${post.author.twitterHandle || post.author.userId}`,
        title: post.author.twitterHandle
          ? `@${post.author.twitterHandle}`
          : "W timeline",
        routePath: "/w",
        metadata: { authorUserId: post.author.userId },
      },
      metadata: {
        postId: post.id,
        mediaCount: post.media.length,
        linkCount: post.links.length,
        metrics: post.metrics,
      },
      occurredAt: new Date(post.createdAt),
    });
  }
}

export function registerWTimelineRoutes(router: Router, _deps: WTimelineRoutesDeps = {}): void {
  router.get("/api/w/timeline", isAuthenticated, async (req, res) => {
    try {
      const canReplyInline = false;
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

      const ingestMode = getWTimelineIngestMode();
      const dbTimeline = await buildTimelineFromDbCache(accounts, limitedHandlesLower);
      if (dbTimeline && dbTimeline.length > 0) {
        const timeline = await attachTezosIdentityHints(await enrichTimelineWithLinkPreviews(dbTimeline));
        const source =
          ingestMode === "scraper"
            ? "scraper-cache"
            : ingestMode === "stream"
              ? "filtered-stream-cache"
              : "db-cache";
        const payload: TimelinePayload = {
          source,
          refreshedAt: new Date().toISOString(),
          canReplyInline,
          accounts,
          timeline,
          diagnostics: {
            message:
              ingestMode === "scraper"
                ? "Timeline from logged-in X web scrape cache (no Filtered Stream API credits)."
                : ingestMode === "stream"
                  ? "Timeline from filtered-stream DB cache."
                  : "Timeline from durable DB cache.",
            skippedAccounts: skipCount,
            cachedAt: new Date().toISOString(),
            fromCache: true,
          },
        };
        cachedKey = requestCacheKey;
        cachedPayload = payload;
        cacheExpiresAt = Date.now() + FEED_CACHE_MS;
        publishWTimelineToComms(timeline);
        return res.json(payload);
      }

      const emptyMessage =
        ingestMode === "scraper"
          ? "No scraped timeline rows yet. Export a Playwright session (scripts/w-x-timeline-scraper.mjs --save-session), set W_X_SCRAPER_STORAGE_STATE, and wait for the w-timeline-scraper job."
          : ingestMode === "stream"
            ? "No timeline rows in DB yet. W is waiting for Filtered Stream ingest, or switch W_TIMELINE_INGEST_MODE=scraper to avoid API credits."
            : "No timeline rows in DB yet. Enable W_TIMELINE_INGEST_MODE=scraper or stream.";

      const payload: TimelinePayload = {
        source: "links-only",
        refreshedAt: new Date().toISOString(),
        canReplyInline,
        accounts,
        timeline: [],
        diagnostics: {
          message: emptyMessage,
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
