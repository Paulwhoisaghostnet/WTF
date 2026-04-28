import type { NextFunction, Request, Response } from "express";

export interface InMemoryRateLimitOptions {
  windowMs: number;
  max: number;
  message: { error: string };
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  maxEntries?: number;
  sweepIntervalMs?: number;
}

export type InMemoryRateLimitMiddleware = ((
  req: Request,
  res: Response,
  next: NextFunction
) => void) & {
  getTrackedKeyCount: () => number;
};

type HitEntry = number[];

const DEFAULT_MAX_TRACKED_KEYS = 5_000;
const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

function recentHitsWithinWindow(hits: HitEntry | undefined, now: number, windowMs: number): HitEntry {
  if (!hits || hits.length === 0) return [];
  return hits.filter((timestamp) => now - timestamp < windowMs);
}

function sweepExpiredKeys(
  hits: Map<string, HitEntry>,
  now: number,
  windowMs: number
): void {
  for (const [key, timestamps] of hits.entries()) {
    const trimmed = recentHitsWithinWindow(timestamps, now, windowMs);
    if (trimmed.length === 0) {
      hits.delete(key);
      continue;
    }
    if (trimmed.length !== timestamps.length) {
      hits.set(key, trimmed);
    }
  }
}

function evictOldestKeys(hits: Map<string, HitEntry>, maxEntries: number): void {
  if (hits.size <= maxEntries) return;

  const overflow = hits.size - maxEntries;
  const oldestKeys = [...hits.entries()]
    .sort((a, b) => {
      const aLastSeen = a[1][a[1].length - 1] ?? 0;
      const bLastSeen = b[1][b[1].length - 1] ?? 0;
      return aLastSeen - bLastSeen;
    })
    .slice(0, overflow);

  for (const [key] of oldestKeys) {
    hits.delete(key);
  }
}

export function createInMemoryRateLimit(
  options: InMemoryRateLimitOptions
): InMemoryRateLimitMiddleware {
  const hits = new Map<string, HitEntry>();
  const maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? DEFAULT_MAX_TRACKED_KEYS));
  const sweepIntervalMs = Math.max(
    1_000,
    Math.trunc(options.sweepIntervalMs ?? Math.min(options.windowMs, DEFAULT_SWEEP_INTERVAL_MS))
  );
  let lastSweepAt = 0;

  const middleware = ((req: Request, res: Response, next: NextFunction) => {
    if (options.skip && options.skip(req)) {
      return next();
    }

    const now = Date.now();
    if (now - lastSweepAt >= sweepIntervalMs || hits.size >= maxEntries) {
      sweepExpiredKeys(hits, now, options.windowMs);
      evictOldestKeys(hits, maxEntries);
      lastSweepAt = now;
    }

    const key =
      options.keyGenerator?.(req) ||
      req.ip ||
      String(req.headers["x-forwarded-for"] || "") ||
      "anonymous";

    const recentHits = recentHitsWithinWindow(hits.get(key), now, options.windowMs);

    if (recentHits.length >= options.max) {
      if (recentHits.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, recentHits);
      }
      return res.status(429).json(options.message);
    }

    recentHits.push(now);
    hits.set(key, recentHits);
    evictOldestKeys(hits, maxEntries);
    return next();
  }) as InMemoryRateLimitMiddleware;

  middleware.getTrackedKeyCount = () => hits.size;

  return middleware;
}
