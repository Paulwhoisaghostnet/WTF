/**
 * rate-keeper.ts — Vendored in-memory rate limiter
 *
 * A lightweight, zero-dependency sliding-window rate limiter that wraps the
 * existing `in-memory-rate-limit` primitive with a more ergonomic factory API
 * and named-limiter registry.
 *
 * Use this module when you want a named limiter that is created once and
 * shared across multiple route files without re-instantiating on each import.
 *
 * Usage:
 *   import { getRateKeeper } from "../lib/rate-keeper";
 *
 *   const limiter = getRateKeeper("discovery", { windowMs: 60_000, max: 30 });
 *   router.use(limiter);
 */

import { createRateLimit } from "./create-rate-limit";
import type { InMemoryRateLimitOptions, InMemoryRateLimitMiddleware } from "./in-memory-rate-limit";

const registry = new Map<string, InMemoryRateLimitMiddleware>();

export type RateKeeperOptions = Omit<InMemoryRateLimitOptions, "message"> & {
  /** Custom 429 error message. Defaults to `{ error: "Rate limit exceeded" }`. */
  message?: { error: string };
};

/**
 * Returns a named rate-limit middleware.  The first call with a given `name`
 * creates the limiter; subsequent calls return the same instance, so options
 * are only applied on creation.
 */
export function getRateKeeper(
  name: string,
  options: RateKeeperOptions
): InMemoryRateLimitMiddleware {
  const existing = registry.get(name);
  if (existing) return existing;

  const limiter = createRateLimit({
    ...options,
    name,
    message: options.message ?? { error: "Rate limit exceeded" },
  });

  registry.set(name, limiter);
  return limiter;
}

/**
 * Returns the current tracked-key count for a named limiter, useful for
 * health checks and telemetry.
 */
export function getRateKeeperStats(name: string): { trackedKeys: number } | null {
  const limiter = registry.get(name);
  if (!limiter) return null;
  return { trackedKeys: limiter.getTrackedKeyCount() };
}

/** List all registered limiter names (useful for health endpoints). */
export function listRateKeepers(): string[] {
  return [...registry.keys()];
}

// ── Function-wrapper rate limiter ──────────────────────────────────────────
// Used by non-Express code paths (e.g. mastodon-client) that want to guard
// an async call rather than an HTTP handler.

const fnHits = new Map<string, number[]>();
const FN_WINDOW_MS = 10_000;
const FN_MAX = 20;

/**
 * Guards an async function call with an in-process sliding-window rate limit.
 *
 *   const resp = await rateKeeper("mastodon:instance", () => fetch(url));
 *
 * Throws `RateLimitError` when the limit is exceeded.
 * Defaults: 20 calls per 10 seconds per key.
 */
export async function rateKeeper<T>(
  key: string,
  fn: () => Promise<T>,
  windowMs = FN_WINDOW_MS,
  max = FN_MAX
): Promise<T> {
  const now = Date.now();
  const hits = (fnHits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    throw Object.assign(
      new Error(`Rate limit exceeded for key: ${key}`),
      { code: "RATE_LIMIT_EXCEEDED", key }
    );
  }
  hits.push(now);
  fnHits.set(key, hits);
  return fn();
}
