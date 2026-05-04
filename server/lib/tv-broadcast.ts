export type TvBroadcastQueueItem = {
  durationSeconds: number;
  mimeType: string;
  offsetSeconds?: number;
};

export function resolveTvDisplayDurationSeconds(
  storedDurationSeconds: number,
  mimeType: string
): number {
  const rounded = Math.max(1, Math.round(Number(storedDurationSeconds) || 0));
  if (mimeType === "image/gif") {
    if (rounded > 0 && rounded < 60) {
      return Math.max(2, Math.min(30, rounded * 3));
    }
    return 9;
  }
  return rounded;
}

export function computeTvBroadcastCursor(
  durations: number[],
  nowMs: number
): {
  currentIndex: number;
  offsetSeconds: number;
  loopDurationSeconds: number;
} {
  if (durations.length === 0) {
    return { currentIndex: 0, offsetSeconds: 0, loopDurationSeconds: 0 };
  }

  const normalized = durations.map((duration) =>
    Math.max(1, Math.floor(Number(duration) || 0))
  );
  const loopDurationSeconds = normalized.reduce((sum, duration) => sum + duration, 0);
  if (loopDurationSeconds <= 0) {
    return { currentIndex: 0, offsetSeconds: 0, loopDurationSeconds: 0 };
  }

  const now = new Date(nowMs);
  const startUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  );
  const secondsOfDay = Math.floor((nowMs - startUtc) / 1000);
  const loopOffset =
    ((secondsOfDay % loopDurationSeconds) + loopDurationSeconds) %
    loopDurationSeconds;

  let cursor = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const duration = normalized[index]!;
    if (loopOffset < cursor + duration) {
      return {
        currentIndex: index,
        offsetSeconds: loopOffset - cursor,
        loopDurationSeconds,
      };
    }
    cursor += duration;
  }

  return { currentIndex: 0, offsetSeconds: 0, loopDurationSeconds };
}

export function resolveTvBroadcastQueue<T extends TvBroadcastQueueItem>(
  queue: T[],
  nowMs: number
): {
  queue: Array<T & { offsetSeconds: number }>;
  current: (T & { offsetSeconds: number }) | null;
  currentIndex: number;
  offsetSeconds: number;
  loopDurationSeconds: number;
} {
  if (queue.length === 0) {
    return {
      queue: [],
      current: null,
      currentIndex: 0,
      offsetSeconds: 0,
      loopDurationSeconds: 0,
    };
  }

  const displayDurations = queue.map((item) =>
    resolveTvDisplayDurationSeconds(item.durationSeconds, item.mimeType)
  );
  const cursor = computeTvBroadcastCursor(displayDurations, nowMs);

  const rotated = Array.from({ length: queue.length }).map((_, offset) => {
    const sourceIndex = (cursor.currentIndex + offset) % queue.length;
    const source = queue[sourceIndex]!;
    return {
      ...source,
      durationSeconds: displayDurations[sourceIndex]!,
      offsetSeconds: offset === 0 ? cursor.offsetSeconds : 0,
    };
  });

  return {
    queue: rotated,
    current: rotated[0] || null,
    currentIndex: cursor.currentIndex,
    offsetSeconds: cursor.offsetSeconds,
    loopDurationSeconds: cursor.loopDurationSeconds,
  };
}
