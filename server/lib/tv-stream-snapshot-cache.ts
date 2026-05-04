import { createBoundedExpiringCache } from "./bounded-expiring-cache";

export type TvStreamSnapshotCacheStatus = "hit" | "miss" | "shared";

export function createTvStreamSnapshotCache<T>(options: {
  ttlMs: number;
  maxEntries?: number;
  sweepIntervalMs?: number;
}) {
  const cache = createBoundedExpiringCache<T>(options);
  const inFlight = new Map<string, Promise<T>>();

  return {
    async getOrLoad(
      key: string,
      loader: () => Promise<T>,
      now = Date.now()
    ): Promise<{ value: T; status: TvStreamSnapshotCacheStatus }> {
      const cached = cache.get(key, now);
      if (cached !== null) {
        return { value: cached, status: "hit" };
      }

      const existing = inFlight.get(key);
      if (existing) {
        return { value: await existing, status: "shared" };
      }

      const promise = (async () => {
        const value = await loader();
        cache.set(key, value, Date.now());
        return value;
      })().finally(() => {
        inFlight.delete(key);
      });

      inFlight.set(key, promise);
      return { value: await promise, status: "miss" };
    },
    clear() {
      cache.clear();
      inFlight.clear();
    },
    getTrackedKeyCount() {
      return cache.getTrackedKeyCount();
    },
    getInFlightKeyCount() {
      return inFlight.size;
    },
  };
}
