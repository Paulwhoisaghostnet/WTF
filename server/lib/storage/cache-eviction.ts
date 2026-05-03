export type CacheEvictionEntry = {
  path: string;
  sizeBytes: number;
  lastAccessedMs: number;
  pinned?: boolean;
  active?: boolean;
  processing?: boolean;
};

export type CacheEvictionPlanInput = {
  entries: CacheEvictionEntry[];
  maxCacheBytes: number;
  currentFreeBytes: number;
  reservedFreeBytes: number;
};

export type CacheEvictionPlan = {
  evict: CacheEvictionEntry[];
  keep: CacheEvictionEntry[];
  protectedCount: number;
  startingCacheBytes: number;
  projectedCacheBytes: number;
  projectedFreeBytes: number;
};

function isProtected(entry: CacheEvictionEntry): boolean {
  return Boolean(entry.pinned || entry.active || entry.processing);
}

export function planCacheEviction(input: CacheEvictionPlanInput): CacheEvictionPlan {
  const startingCacheBytes = input.entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.sizeBytes),
    0
  );
  const maxCacheBytes = Math.max(0, input.maxCacheBytes);
  const reservedFreeBytes = Math.max(0, input.reservedFreeBytes);
  const evict: CacheEvictionEntry[] = [];
  const keep: CacheEvictionEntry[] = [];
  let protectedCount = 0;
  let projectedCacheBytes = startingCacheBytes;
  let projectedFreeBytes = Math.max(0, input.currentFreeBytes);

  const candidates: CacheEvictionEntry[] = [];
  for (const entry of input.entries) {
    if (isProtected(entry)) {
      protectedCount += 1;
      keep.push(entry);
    } else {
      candidates.push(entry);
    }
  }

  candidates.sort((a, b) => a.lastAccessedMs - b.lastAccessedMs);
  for (const entry of candidates) {
    const overBudget = projectedCacheBytes > maxCacheBytes;
    const freePressure = projectedFreeBytes < reservedFreeBytes;
    if (!overBudget && !freePressure) {
      keep.push(entry);
      continue;
    }
    evict.push(entry);
    projectedCacheBytes -= Math.max(0, entry.sizeBytes);
    projectedFreeBytes += Math.max(0, entry.sizeBytes);
  }

  return {
    evict,
    keep,
    protectedCount,
    startingCacheBytes,
    projectedCacheBytes: Math.max(0, projectedCacheBytes),
    projectedFreeBytes,
  };
}

