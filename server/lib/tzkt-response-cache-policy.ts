const DEFAULT_TZKT_RESPONSE_CACHE_MAX_ENTRIES = 2_000;
const MIN_TZKT_RESPONSE_CACHE_MAX_ENTRIES = 100;
const MAX_TZKT_RESPONSE_CACHE_MAX_ENTRIES = 20_000;
const MIN_TZKT_RESPONSE_CACHE_TTL_MS = 1_000;

export function normalizeTzktResponseCacheMaxEntries(value: unknown): number {
  const configured = Number(value);
  if (!Number.isFinite(configured)) return DEFAULT_TZKT_RESPONSE_CACHE_MAX_ENTRIES;
  return Math.max(
    MIN_TZKT_RESPONSE_CACHE_MAX_ENTRIES,
    Math.min(Math.floor(configured), MAX_TZKT_RESPONSE_CACHE_MAX_ENTRIES)
  );
}

export function normalizeTzktResponseCacheTtlMs(value: unknown): number {
  const configured = Number(value);
  if (!Number.isFinite(configured)) return MIN_TZKT_RESPONSE_CACHE_TTL_MS;
  return Math.max(MIN_TZKT_RESPONSE_CACHE_TTL_MS, Math.floor(configured));
}
