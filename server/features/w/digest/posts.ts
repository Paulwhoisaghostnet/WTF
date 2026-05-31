import { desc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { wDigestHandles, wDigestPosts } from "@shared/schema";
import { enqueueDigestPostAtprotoRecord } from "./atproto";

function isMissingDbRelation(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 8 && cur; depth += 1) {
    const code = (cur as { code?: string })?.code;
    const message = String((cur as { message?: string })?.message || cur);
    if (code === "42P01" || /relation .* does not exist/i.test(message)) return true;
    cur = (cur as { cause?: unknown })?.cause;
  }
  return false;
}

export function buildXPostUrl(handle: string, tweetId: string): string {
  return `https://x.com/${handle}/status/${tweetId}`;
}

export function compareTweetIds(a: string, b: string): number {
  try {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left === right) return 0;
    return left > right ? 1 : -1;
  } catch {
    return a.localeCompare(b);
  }
}

export async function loadDigestTimelinePosts(limit = 200) {
  return db
    .select()
    .from(wDigestPosts)
    .orderBy(desc(wDigestPosts.postedAt), desc(wDigestPosts.firstSeenAt))
    .limit(Math.max(1, Math.min(500, limit)));
}

export async function ingestScrapedDigestPosts(
  handle: string,
  rows: Array<{ id: string; postUrl: string; postedAt: Date | null }>
): Promise<{ inserted: number; skipped: number }> {
  const [handleRow] = await db
    .select()
    .from(wDigestHandles)
    .where(eq(wDigestHandles.handle, handle))
    .limit(1);
  if (!handleRow?.enabled) return { inserted: 0, skipped: rows.length };

  const watermark = handleRow.latestPostId || null;
  const initialPass = !handleRow.initialScrapeCompleted;
  let inserted = 0;
  let skipped = 0;
  let newestId = watermark;

  const sorted = [...rows].sort((a, b) => compareTweetIds(b.id, a.id));

  for (const row of sorted) {
    if (!initialPass && watermark && compareTweetIds(row.id, watermark) <= 0) {
      skipped += 1;
      continue;
    }

    const [existing] = await db
      .select({ id: wDigestPosts.id })
      .from(wDigestPosts)
      .where(eq(wDigestPosts.id, row.id))
      .limit(1);
    if (existing) {
      skipped += 1;
      if (!newestId || compareTweetIds(row.id, newestId) > 0) newestId = row.id;
      continue;
    }

    await db.insert(wDigestPosts).values({
      id: row.id,
      handle,
      postUrl: row.postUrl,
      postedAt: row.postedAt,
      atprotoOutboxId: null,
    });
    inserted += 1;

    try {
      const outboxRow = await enqueueDigestPostAtprotoRecord({
        postUrl: row.postUrl,
        tweetId: row.id,
        handle,
        postedAt: row.postedAt,
      });
      if (outboxRow?.id) {
        await db
          .update(wDigestPosts)
          .set({ atprotoOutboxId: outboxRow.id })
          .where(eq(wDigestPosts.id, row.id));
      }
    } catch (err: unknown) {
      if (!isMissingDbRelation(err)) throw err;
    }
    if (!newestId || compareTweetIds(row.id, newestId) > 0) newestId = row.id;
  }

  if (newestId) {
    await db
      .update(wDigestHandles)
      .set({
        latestPostId: newestId,
        initialScrapeCompleted: true,
        lastScrapedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wDigestHandles.handle, handle));
  } else if (sorted.length > 0) {
    await db
      .update(wDigestHandles)
      .set({
        initialScrapeCompleted: true,
        lastScrapedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wDigestHandles.handle, handle));
  }

  return { inserted, skipped };
}

export async function markDigestHandleScrapeFailed(handle: string) {
  await db
    .update(wDigestHandles)
    .set({ lastScrapedAt: new Date(), updatedAt: new Date() })
    .where(eq(wDigestHandles.handle, handle));
}
