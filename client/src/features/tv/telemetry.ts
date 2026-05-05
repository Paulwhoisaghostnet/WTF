type TvLogEvent = {
  t: number;
  event: string;
  [key: string]: unknown;
};

const TV_LOG_RING_MAX = 500;
const TV_LOG_FLUSH_MAX = 30;

type TvLogWindow = {
  __tvLog?: TvLogEvent[];
  __tvLogPending?: TvLogEvent[];
};

export function tvLog(event: string, data?: Record<string, unknown>): void {
  const entry: TvLogEvent = { t: Date.now(), event, ...(data || {}) };
  try {
    // eslint-disable-next-line no-console
    console.info(`[tv:${event}]`, entry);
  } catch {
    /* ignore console failures (e.g. SES-locked intrinsics) */
  }
  if (typeof window === "undefined") return;
  const w = window as unknown as TvLogWindow;
  if (!Array.isArray(w.__tvLog)) w.__tvLog = [];
  w.__tvLog!.push(entry);
  while (w.__tvLog!.length > TV_LOG_RING_MAX) w.__tvLog!.shift();
  if (!Array.isArray(w.__tvLogPending)) w.__tvLogPending = [];
  w.__tvLogPending!.push(entry);
}

export function reportItemEnd(params: {
  sessionId: string;
  videoId: number | null;
  bumperId: number | null;
  reason: "ended" | "skipped" | "error" | "stall";
}): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(params);
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/tv/telemetry/item-end", blob);
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch("/api/tv/telemetry/item-end", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best-effort only */
  }
}

export async function flushTvLog(usingBeacon = false): Promise<void> {
  if (typeof window === "undefined") return;
  const w = window as unknown as TvLogWindow;
  const pending = w.__tvLogPending;
  if (!Array.isArray(pending) || pending.length === 0) return;
  const batch = pending.splice(0, TV_LOG_FLUSH_MAX);
  const payload = JSON.stringify({ events: batch });
  try {
    if (usingBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        "/api/tv/playback/events",
        new Blob([payload], { type: "application/json" })
      );
      if (!ok) {
        // Beacon rejected — put events back so next flush retries.
        w.__tvLogPending!.unshift(...batch);
      }
      return;
    }
    await fetch("/api/tv/playback/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "include",
    });
  } catch {
    // Network error — put events back so the next flush can retry.
    w.__tvLogPending!.unshift(...batch);
  }
}
