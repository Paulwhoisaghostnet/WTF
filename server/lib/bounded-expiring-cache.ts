type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  lastAccessedAt: number;
};

export function createBoundedExpiringCache<T>(options: {
  ttlMs: number;
  maxEntries?: number;
  sweepIntervalMs?: number;
}) {
  const entries = new Map<string, CacheEntry<T>>();
  const maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? 2_000));
  const sweepIntervalMs = Math.max(
    1_000,
    Math.trunc(options.sweepIntervalMs ?? Math.min(options.ttlMs, 60_000))
  );
  let lastSweepAt = 0;

  function sweep(now: number) {
    for (const [key, entry] of entries.entries()) {
      if (now >= entry.expiresAt) {
        entries.delete(key);
      }
    }

    if (entries.size <= maxEntries) return;

    const overflow = entries.size - maxEntries;
    const oldestEntries = [...entries.entries()]
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
      .slice(0, overflow);

    for (const [key] of oldestEntries) {
      entries.delete(key);
    }
  }

  function maybeSweep(now: number) {
    if (now - lastSweepAt < sweepIntervalMs && entries.size < maxEntries) return;
    sweep(now);
    lastSweepAt = now;
  }

  return {
    get(key: string, now = Date.now()): T | null {
      maybeSweep(now);
      const entry = entries.get(key);
      if (!entry) return null;
      if (now >= entry.expiresAt) {
        entries.delete(key);
        return null;
      }
      entry.lastAccessedAt = now;
      return entry.value;
    },
    set(key: string, value: T, now = Date.now()) {
      maybeSweep(now);
      entries.set(key, {
        value,
        expiresAt: now + options.ttlMs,
        lastAccessedAt: now,
      });
      if (entries.size > maxEntries) {
        sweep(now);
      }
    },
    clear() {
      entries.clear();
    },
    getTrackedKeyCount() {
      return entries.size;
    },
  };
}
