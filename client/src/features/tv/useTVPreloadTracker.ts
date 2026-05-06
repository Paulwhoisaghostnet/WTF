import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { tvLog } from "./telemetry";

type UseTVPreloadTrackerArgs = {
  selectedChannelId: number | null;
  preloadReadyRef: MutableRefObject<Set<string>>;
};

export function useTVPreloadTracker({
  selectedChannelId,
  preloadReadyRef,
}: UseTVPreloadTrackerArgs) {
  const preloadStartedAtRef = useRef<Map<string, number>>(new Map());

  const markPreloadStart = useCallback(
    (key: string, src: string, kind: string) => {
      if (preloadStartedAtRef.current.has(key)) return;
      preloadStartedAtRef.current.set(key, Date.now());
      tvLog("preload.start", { key, src, kind });
    },
    []
  );

  const markPreloadReady = useCallback(
    (key: string) => {
      if (!preloadReadyRef.current.has(key)) {
        preloadReadyRef.current.add(key);
        const started = preloadStartedAtRef.current.get(key) || 0;
        tvLog("preload.ready", {
          key,
          elapsedMs: started > 0 ? Date.now() - started : null,
        });
      }
    },
    [preloadReadyRef]
  );

  useEffect(() => {
    preloadReadyRef.current = new Set();
  }, [preloadReadyRef, selectedChannelId]);

  return { markPreloadStart, markPreloadReady };
}
