export type TvQueueKeyable = {
  itemId: number;
  videoId: number;
  sourceUri: string;
};

export function queueItemKey(item: TvQueueKeyable): string {
  return `${item.itemId}-${item.videoId}-${item.sourceUri}`;
}

function normalizeQueueIndex(length: number, requestedIdx: number): number {
  if (length <= 0) return -1;
  if (!Number.isInteger(requestedIdx)) return 0;
  return Math.max(0, Math.min(requestedIdx, length - 1));
}

export function findNextQueueTarget<T extends TvQueueKeyable>(
  queue: T[],
  currentIdx: number,
  sessionSkipList: Set<string>
): {
  nextIdx: number;
  nextItem: T | null;
  nextKey: string;
  skippedBlacklisted: number;
} {
  if (queue.length === 0) {
    return { nextIdx: -1, nextItem: null, nextKey: "", skippedBlacklisted: 0 };
  }

  const immediateIdx = (currentIdx + 1) % queue.length;
  const immediateItem = queue[immediateIdx] || null;
  const immediateKey = immediateItem ? queueItemKey(immediateItem) : "";
  let skippedBlacklisted = 0;

  for (let offset = 1; offset <= queue.length; offset += 1) {
    const idx = (currentIdx + offset) % queue.length;
    const item = queue[idx] || null;
    const key = item ? queueItemKey(item) : "";
    if (!item) continue;
    if (!sessionSkipList.has(key)) {
      return { nextIdx: idx, nextItem: item, nextKey: key, skippedBlacklisted };
    }
    skippedBlacklisted += 1;
  }

  return {
    nextIdx: immediateIdx,
    nextItem: immediateItem,
    nextKey: immediateKey,
    skippedBlacklisted,
  };
}

export function resolveActivePlaybackState<T extends TvQueueKeyable>(
  queue: T[],
  requestedIdx: number,
  pinnedKey: string | null | undefined,
  fallbackItem: T | null | undefined
): {
  activeQueueIdx: number;
  activeItem: T | null;
  activeKey: string;
  source: "requested" | "pinned" | "fallback" | "empty";
} {
  const requestedQueueIdx = normalizeQueueIndex(queue.length, requestedIdx);
  const requestedItem =
    requestedQueueIdx >= 0 ? queue[requestedQueueIdx] || null : null;
  const requestedKey = requestedItem ? queueItemKey(requestedItem) : "";
  const targetKey = String(pinnedKey || "").trim();

  if (targetKey) {
    if (requestedItem && requestedKey === targetKey) {
      return {
        activeQueueIdx: requestedQueueIdx,
        activeItem: requestedItem,
        activeKey: requestedKey,
        source: "requested",
      };
    }

    const pinnedIdx = queue.findIndex((item) => queueItemKey(item) === targetKey);
    if (pinnedIdx !== -1) {
      const pinnedItem = queue[pinnedIdx] || null;
      return {
        activeQueueIdx: pinnedIdx,
        activeItem: pinnedItem,
        activeKey: pinnedItem ? queueItemKey(pinnedItem) : "",
        source: "pinned",
      };
    }

    if (fallbackItem && queueItemKey(fallbackItem) === targetKey) {
      return {
        activeQueueIdx: requestedQueueIdx,
        activeItem: fallbackItem,
        activeKey: targetKey,
        source: "fallback",
      };
    }
  }

  if (requestedItem) {
    return {
      activeQueueIdx: requestedQueueIdx,
      activeItem: requestedItem,
      activeKey: requestedKey,
      source: "requested",
    };
  }

  if (fallbackItem) {
    return {
      activeQueueIdx: requestedQueueIdx,
      activeItem: fallbackItem,
      activeKey: queueItemKey(fallbackItem),
      source: "fallback",
    };
  }

  return {
    activeQueueIdx: requestedQueueIdx,
    activeItem: null,
    activeKey: "",
    source: "empty",
  };
}
