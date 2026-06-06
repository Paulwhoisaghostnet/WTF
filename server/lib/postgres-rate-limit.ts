import { sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "../db";
import type { InMemoryRateLimitMiddleware, InMemoryRateLimitOptions } from "./in-memory-rate-limit";

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanupAt = 0;

export interface PostgresRateLimitBucketKeyOptions {
  limiterName: string;
  requesterKey: string;
  windowMs: number;
  now?: number;
}

export function postgresRateLimitBucketKey({
  limiterName,
  requesterKey,
  windowMs,
  now = Date.now(),
}: PostgresRateLimitBucketKeyOptions): string {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return `${limiterName}:${requesterKey}:${windowStart}`;
}

function requireLimiterName(options: InMemoryRateLimitOptions): string {
  const name = String(options.name || "").trim();
  if (!name) {
    throw new Error("[rate-limit] Postgres rate limiters require a stable name");
  }
  return name;
}

async function maybeCleanupExpiredBuckets(now: number): Promise<void> {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  try {
    await db.execute(
      sql`DELETE FROM rate_limit_buckets WHERE expires_at < NOW()`
    );
  } catch (err) {
    console.warn("[rate-limit] expired bucket cleanup failed:", err);
  }
}

async function recordHit(
  limiterName: string,
  bucketKey: string,
  windowMs: number
): Promise<number> {
  const now = Date.now();
  const scopedKey = postgresRateLimitBucketKey({
    limiterName,
    requesterKey: bucketKey,
    windowMs,
    now,
  });
  const expiresAt = new Date(Math.floor(now / windowMs) * windowMs + windowMs);

  const result = await db.execute<{ hit_count: number }>(sql`
    INSERT INTO rate_limit_buckets (bucket_key, hit_count, expires_at)
    VALUES (${scopedKey}, 1, ${expiresAt})
    ON CONFLICT (bucket_key)
    DO UPDATE SET hit_count = rate_limit_buckets.hit_count + 1
    RETURNING hit_count
  `);

  const row = (result as { rows?: Array<{ hit_count: number }> }).rows?.[0];
  return Number(row?.hit_count ?? 1);
}

export function createPostgresRateLimit(
  options: InMemoryRateLimitOptions
): InMemoryRateLimitMiddleware {
  const limiterName = requireLimiterName(options);

  const middleware = ((req: Request, res: Response, next: NextFunction) => {
    if (options.skip?.(req)) {
      next();
      return;
    }

    const key =
      options.keyGenerator?.(req) ||
      req.ip ||
      String(req.headers["x-forwarded-for"] || "") ||
      "anonymous";

    void (async () => {
      try {
        await maybeCleanupExpiredBuckets(Date.now());
        const hitCount = await recordHit(limiterName, key, options.windowMs);
        if (hitCount > options.max) {
          res.status(429).json(options.message);
          return;
        }
        next();
      } catch (err) {
        console.error("[rate-limit] postgres store failed; allowing request:", err);
        next();
      }
    })();
  }) as InMemoryRateLimitMiddleware;

  middleware.getTrackedKeyCount = () => 0;

  return middleware;
}
