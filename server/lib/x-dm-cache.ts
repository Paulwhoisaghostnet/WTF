// Lightweight in-memory cache for X Direct Message reads.
//
// X's `/2/dm_*` endpoints are heavily rate-limited on Pay-Per-Use / Basic
// tiers (often as low as 1 req / 15 min per user-context). Without a server
// cache the client polling cadence converts into a constant 429 storm. This
// module gives us:
//
//   1. Short-TTL fresh cache (default 60s) so multiple viewers share a single
//      upstream call.
//   2. Per-key rate-limit window tracking so once X hands us a 429 + reset
//      timestamp, every subsequent caller is served the most recent cached
//      payload (with a `rateLimitedUntil` flag) until the window passes,
//      instead of triggering more upstream calls and more 429s.
//   3. Graceful "soft 429": the wrapper returns a structured result rather
//      than throwing, so the route can answer 200 + `rateLimitedUntil` and
//      the React Query client stops error-looping.
//
// Keep this module dependency-free — it must be safe to import anywhere.

import { rateLimitResetEpochSecondsFromError } from "./x-oauth2";

type CacheEntry<T> = {
  payload: T;
  cachedAt: number; // epoch ms
};

type RateLimitEntry = {
  resetAt: number; // epoch ms
  observedAt: number; // epoch ms
};

const FRESH_TTL_MS_DEFAULT = 60_000;
const STALE_TTL_MS_DEFAULT = 30 * 60_000; // serve cached during 429 even if older
const RATE_LIMIT_FALLBACK_MS = 2 * 60_000; // retry sooner than X's 15m window; if still 429, we'll extend

const cache = new Map<string, CacheEntry<unknown>>();
const rateLimits = new Map<string, RateLimitEntry>();

export function dmCacheKey(parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => (part === null || part === undefined ? "" : String(part))).join("::");
}

export function getCachedDmRead<T>(key: string, ttlMs = FRESH_TTL_MS_DEFAULT): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.cachedAt <= ttlMs) return entry.payload;
  return null;
}

export function getStaleCachedDmRead<T>(key: string, maxAgeMs = STALE_TTL_MS_DEFAULT): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.cachedAt <= maxAgeMs) return entry.payload;
  return null;
}

export function setCachedDmRead<T>(key: string, payload: T): void {
  cache.set(key, { payload, cachedAt: Date.now() });
}

export function getRateLimitedUntil(key: string): number | null {
  const entry = rateLimits.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.resetAt) {
    rateLimits.delete(key);
    return null;
  }
  return entry.resetAt;
}

export function recordRateLimitFromError(key: string, err: any): number {
  const resetEpochSeconds = rateLimitResetEpochSecondsFromError(err);
  const resetAt =
    resetEpochSeconds !== null ? resetEpochSeconds * 1000 : Date.now() + RATE_LIMIT_FALLBACK_MS;
  rateLimits.set(key, { resetAt, observedAt: Date.now() });
  return resetAt;
}

/**
 * Cache wrapper for DM read calls.
 *
 *   - Returns fresh cached payload if within `ttlMs`.
 *   - If a rate-limit window is active for `key`, returns the most recent
 *     cached payload (even if stale up to `staleTtlMs`) and the
 *     `rateLimitedUntil` epoch ms. No upstream call is made.
 *   - Otherwise calls `loader()`; on 429 from X, the rate-limit window is
 *     recorded and stale cached payload is served if available; if not, the
 *     error is re-thrown so the caller can decide how to surface it.
 *   - Successful calls update the cache.
 *
 * The returned shape always includes `payload`, `cachedAt`, and (when
 * applicable) `rateLimitedUntil`.
 */
export async function readDmThroughCache<T>(params: {
  key: string;
  loader: () => Promise<T>;
  ttlMs?: number;
  staleTtlMs?: number;
}): Promise<{
  payload: T;
  cachedAt: number;
  fromCache: boolean;
  rateLimitedUntil: number | null;
}> {
  const ttlMs = params.ttlMs ?? FRESH_TTL_MS_DEFAULT;
  const staleTtlMs = params.staleTtlMs ?? STALE_TTL_MS_DEFAULT;

  const fresh = getCachedDmRead<T>(params.key, ttlMs);
  if (fresh !== null) {
    const entry = cache.get(params.key);
    return {
      payload: fresh,
      cachedAt: entry?.cachedAt ?? Date.now(),
      fromCache: true,
      rateLimitedUntil: getRateLimitedUntil(params.key),
    };
  }

  const rateLimitedUntil = getRateLimitedUntil(params.key);
  if (rateLimitedUntil !== null) {
    const stale = getStaleCachedDmRead<T>(params.key, staleTtlMs);
    if (stale !== null) {
      const entry = cache.get(params.key);
      return {
        payload: stale,
        cachedAt: entry?.cachedAt ?? Date.now(),
        fromCache: true,
        rateLimitedUntil,
      };
    }
    const err: any = new Error("X API 429: Too Many Requests (cache cold)");
    err.status = 429;
    err.rateLimitedUntil = rateLimitedUntil;
    throw err;
  }

  try {
    const payload = await params.loader();
    setCachedDmRead(params.key, payload);
    return {
      payload,
      cachedAt: Date.now(),
      fromCache: false,
      rateLimitedUntil: null,
    };
  } catch (err: any) {
    if (Number(err?.status) === 429) {
      const newResetAt = recordRateLimitFromError(params.key, err);
      const stale = getStaleCachedDmRead<T>(params.key, staleTtlMs);
      if (stale !== null) {
        const entry = cache.get(params.key);
        return {
          payload: stale,
          cachedAt: entry?.cachedAt ?? Date.now(),
          fromCache: true,
          rateLimitedUntil: newResetAt,
        };
      }
      err.rateLimitedUntil = newResetAt;
    }
    throw err;
  }
}

export function clearDmCacheKey(key: string): void {
  cache.delete(key);
  rateLimits.delete(key);
}

export function clearDmCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      rateLimits.delete(key);
    }
  }
}

export function clearDmCache(): void {
  cache.clear();
  rateLimits.clear();
}
