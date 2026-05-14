import { and, eq, gt, sql } from "drizzle-orm";
import { tzktResponseCache } from "@shared/schema";
import { db } from "../db";

const DEFAULT_TZKT_RESPONSE_CACHE_MAX_ENTRIES = 2_000;

function maxEntries(): number {
  const configured = Number(process.env.TZKT_RESPONSE_CACHE_MAX_ENTRIES);
  if (!Number.isFinite(configured)) return DEFAULT_TZKT_RESPONSE_CACHE_MAX_ENTRIES;
  return Math.max(100, Math.min(Math.floor(configured), 20_000));
}

export async function readTzktResponseCache<T>(cacheKey: string): Promise<T | null> {
  const [row] = await db
    .select({ payload: tzktResponseCache.payload })
    .from(tzktResponseCache)
    .where(
      and(
        eq(tzktResponseCache.cacheKey, cacheKey),
        gt(tzktResponseCache.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;

  await db
    .update(tzktResponseCache)
    .set({
      hitCount: sql`${tzktResponseCache.hitCount} + 1`,
      lastAccessedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(tzktResponseCache.cacheKey, cacheKey));

  return row.payload as T;
}

export async function writeTzktResponseCache(
  cacheKey: string,
  endpoint: string,
  payload: unknown,
  ttlMs: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(1_000, ttlMs));

  await db
    .insert(tzktResponseCache)
    .values({
      cacheKey,
      endpoint,
      payload,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: tzktResponseCache.cacheKey,
      set: {
        endpoint,
        payload,
        expiresAt,
        updatedAt: sql`now()`,
      },
    });

  await pruneTzktResponseCache(maxEntries());
}

export async function pruneTzktResponseCache(limit = maxEntries()): Promise<void> {
  const boundedLimit = Math.max(100, Math.min(Math.floor(limit), 20_000));
  await db.execute(sql`DELETE FROM tzkt_response_cache WHERE expires_at <= now()`);
  await db.execute(sql`
    DELETE FROM tzkt_response_cache
     WHERE cache_key IN (
       SELECT cache_key
         FROM tzkt_response_cache
        ORDER BY last_accessed_at DESC, updated_at DESC, cache_key ASC
        OFFSET ${boundedLimit}
     )
  `);
}
