/**
 * W timeline — low-credit discovery via a small number of `/tweets/search/recent`
 * calls (from:user OR …) instead of per-user `/users/{id}/tweets` fan-out.
 *
 * Stores minimal fields + tweet id; `/api/w/timeline` reads DB first and can
 * hydrate text via free oEmbed.
 */

import { getPlatformXOAuth2AccessToken, xOAuth2Request } from "./x-oauth2";
import { register, type JobResult } from "./scheduler";
import { logSystemEvent } from "./system-log";
import {
  getTimelineSearchSinceId,
  loadWTimelineAuthorHandles,
  maxTweetId,
  setTimelineSearchSinceId,
  upsertTimelinePostMinimal,
} from "./timeline-db";

const WORKER_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.W_TIMELINE_WORKER_INTERVAL_MS || 3 * 60_000)
);
const MAX_QUERY_CHARS = Math.max(200, Math.min(480, Number(process.env.W_TIMELINE_SEARCH_CHUNK_CHARS || 420)));
const MAX_ACCOUNTS = Math.max(1, Number(process.env.W_FEED_MAX_ACCOUNTS || 50));
const MAX_PAGES_PER_QUERY = Math.max(1, Math.min(10, Number(process.env.W_TIMELINE_SEARCH_MAX_PAGES || 5)));

function buildSearchQueries(handles: string[]): string[] {
  const unique = [
    ...new Set(
      handles
        .map((h) => h.replace(/^@/, "").toLowerCase())
        .filter((h) => /^[a-z0-9_]{1,15}$/.test(h))
    ),
  ].sort();
  const queries: string[] = [];
  const suffix = " -is:retweet";
  let cur = "";
  for (const h of unique) {
    const piece = cur ? ` OR from:${h}` : `from:${h}`;
    const trial = cur + piece + suffix;
    if (trial.length > MAX_QUERY_CHARS && cur) {
      queries.push(cur + suffix);
      cur = `from:${h}`;
    } else {
      cur += piece;
    }
  }
  if (cur) queries.push(cur + suffix);
  return queries;
}

async function resolveSearchAccessToken(): Promise<string | null> {
  const b = process.env.X_BEARER_TOKEN?.trim() || process.env.TWITTER_BEARER_TOKEN?.trim();
  if (b) return b;
  return getPlatformXOAuth2AccessToken();
}

async function fetchSearchPage(
  accessToken: string,
  query: string,
  opts: { sinceId?: string | null; nextToken?: string | null }
): Promise<any> {
  const qs = new URLSearchParams({
    query,
    max_results: "100",
    "tweet.fields": "id,created_at,author_id",
    expansions: "author_id",
    "user.fields": "id,username,profile_image_url",
  });
  // Per X search pagination: keep the same since_id on every page when using next_token.
  if (opts.sinceId) qs.set("since_id", opts.sinceId);
  if (opts.nextToken) qs.set("next_token", opts.nextToken);
  return xOAuth2Request({
    method: "GET",
    path: `/tweets/search/recent?${qs.toString()}`,
    accessToken,
  });
}

export async function runTimelineSearchIngest(): Promise<JobResult | void> {
  const accessToken = await resolveSearchAccessToken();
  if (!accessToken) {
    console.warn("[timeline-worker] no bearer or platform token — skipping search ingest");
    return { itemsIn: 0, itemsOut: 0 };
  }

  const handles = await loadWTimelineAuthorHandles(MAX_ACCOUNTS);
  const queries = buildSearchQueries(handles);
  if (queries.length === 0) {
    return { itemsIn: 0, itemsOut: 0 };
  }

  const sinceId = await getTimelineSearchSinceId();
  const allTweetIds: string[] = [];
  let stored = 0;

  for (const query of queries) {
    let nextToken: string | null = null;
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
      let payload: any;
      try {
        payload = await fetchSearchPage(accessToken, query, {
          sinceId: sinceId || null,
          nextToken: page > 0 ? nextToken : null,
        });
      } catch (err: any) {
        const st = Number(err?.status || 0);
        if (st === 429) {
          logSystemEvent({
            source: "timeline-worker",
            eventType: "timeline_search_rate_limited",
            severity: "warn",
            message: "search/recent rate limited",
            statusCode: 429,
          });
          break;
        }
        logSystemEvent({
          source: "timeline-worker",
          eventType: "timeline_search_error",
          severity: "error",
          message: String(err?.message || err),
          statusCode: st || undefined,
        });
        break;
      }

      const tweets = Array.isArray(payload?.data) ? payload.data : [];
      const users = Array.isArray(payload?.includes?.users) ? payload.includes.users : [];
      const userById = new Map<string, { username?: string }>();
      for (const u of users) {
        if (u?.id) userById.set(String(u.id), u);
      }

      for (const tw of tweets) {
        const id = String(tw?.id || "").trim();
        const authorId = String(tw?.author_id || "").trim();
        const createdAt = tw?.created_at ? new Date(String(tw.created_at)) : new Date();
        if (!/^\d+$/.test(id) || !/^\d+$/.test(authorId)) continue;
        const u = userById.get(authorId);
        const handle = String(u?.username || "").replace(/^@/, "").toLowerCase();
        if (!handle) continue;
        await upsertTimelinePostMinimal({
          id,
          authorTwitterId: authorId,
          authorHandle: handle,
          createdAt,
          text: null,
          displayText: null,
        });
        stored += 1;
        allTweetIds.push(id);
      }

      nextToken = payload?.meta?.next_token ? String(payload.meta.next_token) : null;
      if (!nextToken) break;
    }
  }

  const maxId = maxTweetId(allTweetIds);
  if (maxId) {
    const prev = sinceId;
    if (!prev || maxId.length > prev.length || (maxId.length === prev.length && maxId > prev)) {
      await setTimelineSearchSinceId(maxId);
    }
  }

  if (stored > 0) {
    console.log(`[timeline-worker] stored ${stored} tweet row(s), cursor=${maxId || sinceId || "none"}`);
  }

  return { itemsIn: allTweetIds.length, itemsOut: stored };
}

export function registerTimelineSearchWorker(): void {
  register({
    name: "w-timeline-search-ingest",
    fn: runTimelineSearchIngest,
    intervalMs: WORKER_INTERVAL_MS,
    initialDelayMs: 45_000,
  });
}
