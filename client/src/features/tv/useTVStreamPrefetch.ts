import { useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { isGif } from "./utils";
import type { StreamQueueItem } from "./types";

type UseTVStreamPrefetchArgs = {
  queue: StreamQueueItem[] | undefined;
  powerOn: boolean;
  streamMatchesSelectedChannel: boolean;
  user: unknown;
};

export function useTVStreamPrefetch({
  queue: queueInput,
  powerOn,
  streamMatchesSelectedChannel,
  user,
}: UseTVStreamPrefetchArgs) {
  const prefetchedKeyRef = useRef<string>("");

  useEffect(() => {
    const queue = streamMatchesSelectedChannel ? queueInput || [] : [];
    if (!powerOn || queue.length === 0) return;
    const upcoming = queue.slice(1);
    if (upcoming.length === 0) return;

    const key = upcoming.map((item) => item.videoId).join(",");
    if (key === prefetchedKeyRef.current) return;
    prefetchedKeyRef.current = key;

    const urls = upcoming.map((item) => item.sourceUri).filter(Boolean);
    if (urls.length > 0 && user) {
      api.post("/api/tv/cache/prefetch", { urls }).catch(() => {
        /* prefetch is best-effort */
      });
    }
    for (const item of upcoming) {
      if (isGif(item.mimeType)) {
        const img = new Image();
        img.src = item.cacheUrl;
      } else {
        const v = document.createElement("video");
        v.preload = "auto";
        v.src = item.cacheUrl;
      }
    }
  }, [queueInput, powerOn, streamMatchesSelectedChannel, user]);
}
