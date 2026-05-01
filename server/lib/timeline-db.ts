/**
 * Durable W timeline cache (`x_timeline_posts`) + search cursor (`x_timeline_cursors`).
 * Shared by `/api/w/timeline` and the background search worker.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { users, xTimelineCursors, xTimelinePosts } from "@shared/schema";
import { extractTweetTextFromOembedHtml, fetchXOEmbedForTweetUrl } from "./oembed";

export const TIMELINE_SEARCH_CURSOR_SCOPE = "w.timeline_search_global";

const DEFAULT_TTL_DAYS = Math.max(1, Number(process.env.W_TIMELINE_DB_TTL_DAYS || 7));

function defaultMetrics() {
  return { likes: 0, replies: 0, reposts: 0, quotes: 0 };
}

export function maxTweetId(ids: string[]): string | null {
  if (ids.length === 0) return null;
  let best = ids[0]!;
  for (const id of ids) {
    if (id.length > best.length) best = id;
    else if (id.length === best.length && id > best) best = id;
  }
  return best;
}

export async function getTimelineSearchSinceId(): Promise<string | null> {
  const [row] = await db
    .select({ sinceId: xTimelineCursors.sinceId })
    .from(xTimelineCursors)
    .where(eq(xTimelineCursors.scopeKey, TIMELINE_SEARCH_CURSOR_SCOPE))
    .limit(1);
  const v = row?.sinceId?.trim();
  return v || null;
}

export async function setTimelineSearchSinceId(sinceId: string): Promise<void> {
  await db
    .insert(xTimelineCursors)
    .values({
      scopeKey: TIMELINE_SEARCH_CURSOR_SCOPE,
      sinceId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: xTimelineCursors.scopeKey,
      set: { sinceId, updatedAt: new Date() },
    });
}

export type TimelinePostRow = typeof xTimelinePosts.$inferSelect;

export async function loadTimelinePostsFromDb(
  handlesLower: string[],
  limit = 200
): Promise<TimelinePostRow[]> {
  if (handlesLower.length === 0) return [];
  const now = new Date();
  const floor = new Date(Date.now() - DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
  const handles = handlesLower.map((h) => h.replace(/^@/, "").toLowerCase());
  return db
    .select()
    .from(xTimelinePosts)
    .where(
      and(
        inArray(xTimelinePosts.authorHandle, handles),
        gte(xTimelinePosts.createdAt, floor),
        gte(xTimelinePosts.expiresAt, now)
      )
    )
    .orderBy(desc(xTimelinePosts.createdAt))
    .limit(limit);
}

export async function upsertTimelinePostMinimal(row: {
  id: string;
  authorTwitterId: string;
  authorHandle: string;
  createdAt: Date;
  text?: string | null;
  displayText?: string | null;
  media?: unknown[];
  links?: unknown[];
  metrics?: { likes: number; replies: number; reposts: number; quotes: number };
}): Promise<void> {
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
  const handle = row.authorHandle.replace(/^@/, "").toLowerCase();
  await db
    .insert(xTimelinePosts)
    .values({
      id: row.id,
      authorTwitterId: row.authorTwitterId,
      authorHandle: handle,
      text: row.text ?? null,
      displayText: row.displayText ?? row.text ?? null,
      createdAt: row.createdAt,
      rawJson: sql`'{}'::jsonb`,
      media: (row.media ?? []) as any,
      links: (row.links ?? []) as any,
      metrics: (row.metrics ?? defaultMetrics()) as any,
      fetchedAt: new Date(),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: xTimelinePosts.id,
      set: {
        authorTwitterId: row.authorTwitterId,
        authorHandle: handle,
        fetchedAt: new Date(),
        expiresAt,
      },
    });
}

/** Persist full posts from legacy bearer timeline fetch (keeps DB warm for DB-first reads). */
export async function upsertTimelinePostsFromLegacyApi(
  rows: Array<{
    id: string;
    authorTwitterId: string;
    authorHandle: string;
    text: string;
    displayText: string;
    createdAt: Date;
    media: unknown[];
    links: unknown[];
    metrics: { likes: number; replies: number; reposts: number; quotes: number };
  }>
): Promise<void> {
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
  for (const row of rows) {
    const handle = row.authorHandle.replace(/^@/, "").toLowerCase();
    await db
      .insert(xTimelinePosts)
      .values({
        id: row.id,
        authorTwitterId: row.authorTwitterId,
        authorHandle: handle,
        text: row.text,
        displayText: row.displayText,
        createdAt: row.createdAt,
        rawJson: sql`'{}'::jsonb`,
        media: row.media as any,
        links: row.links as any,
        metrics: row.metrics as any,
        fetchedAt: new Date(),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: xTimelinePosts.id,
        set: {
          authorTwitterId: row.authorTwitterId,
          authorHandle: handle,
          text: row.text,
          displayText: row.displayText,
          media: row.media as any,
          links: row.links as any,
          metrics: row.metrics as any,
          fetchedAt: new Date(),
          expiresAt,
        },
      });
  }
}

/** Load W timeline author handles (same membership rules as route: any user with twitterHandle). */
export async function loadWTimelineAuthorHandles(maxAccounts: number): Promise<string[]> {
  const rows = await db
    .select({ twitterHandle: users.twitterHandle })
    .from(users)
    .where(sql`${users.twitterHandle} IS NOT NULL`);
  const set = new Set<string>();
  for (const r of rows) {
    const h = String(r.twitterHandle || "")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();
    if (h && /^[a-z0-9_]{1,15}$/.test(h)) set.add(h);
  }
  const sorted = Array.from(set).sort();
  return maxAccounts > 0 ? sorted.slice(0, maxAccounts) : sorted;
}

/**
 * Optional oEmbed hydration for rows missing text (ID-only ingest path).
 * Bounded concurrency to avoid thundering the oEmbed endpoint.
 */
export async function enrichTimelineRowsWithOembed(
  rows: TimelinePostRow[],
  concurrency = 4
): Promise<Map<string, { text: string; displayText: string }>> {
  const out = new Map<string, { text: string; displayText: string }>();
  const need = rows.filter((r) => !String(r.text || "").trim() && String(r.id || "").trim());
  if (need.length === 0) return out;

  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= need.length) return;
      const row = need[idx]!;
      const handle = String(row.authorHandle || "").replace(/^@/, "");
      const url = `https://x.com/${handle}/status/${row.id}`;
      const o = await fetchXOEmbedForTweetUrl(url);
      if (!o?.html) continue;
      const snippet = extractTweetTextFromOembedHtml(o.html);
      if (snippet) out.set(row.id, { text: snippet, displayText: snippet });
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, need.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
