import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback } from "react";
import { findNextQueueTarget, queueItemKey } from "../../lib/tv-playback";
import { reportItemEnd, tvLog } from "./telemetry";
import type { BumperPoolItem, StreamQueueItem } from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type UseTVMediaEventHandlersArgs = {
  currentMediaUseDirect: boolean;
  streamCurrent: StreamQueueItem | null | undefined;
  streamQueue: StreamQueueItem[] | null | undefined;
  clientQueueIdx: number;
  mediaReadyRef: MutableRefObject<boolean>;
  currentItemStartRef: MutableRefObject<number>;
  currentKeyRef: MutableRefObject<string>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  bufferGateActiveRef: MutableRefObject<boolean>;
  failedItemCountsRef: MutableRefObject<Map<string, number>>;
  sessionSkipListRef: MutableRefObject<Set<string>>;
  sessionIdRef: MutableRefObject<string>;
  bumperTimerRef: MutableRefObject<number | null>;
  bumperRetryRef: MutableRefObject<number>;
  setCurrentMediaReady: StateSetter<boolean>;
  setCurrentMediaError: StateSetter<boolean>;
  setCurrentMediaStalled: StateSetter<boolean>;
  setCurrentMediaUseDirect: StateSetter<boolean>;
  setBumperReady: StateSetter<boolean>;
  setBumperError: StateSetter<boolean>;
  setActiveBumper: StateSetter<BumperPoolItem | null>;
  flashSkipNotice: (message: string) => void;
  advanceQueue: (options?: {
    targetIdx?: number;
    skippedBlacklisted?: number;
  }) => void;
  stepStream: () => void;
  finishTransition: () => void;
  pickNextBumper: () => BumperPoolItem | null;
};

export function useTVMediaEventHandlers({
  currentMediaUseDirect,
  streamCurrent,
  streamQueue,
  clientQueueIdx,
  mediaReadyRef,
  currentItemStartRef,
  currentKeyRef,
  videoRef,
  bufferGateActiveRef,
  failedItemCountsRef,
  sessionSkipListRef,
  sessionIdRef,
  bumperTimerRef,
  bumperRetryRef,
  setCurrentMediaReady,
  setCurrentMediaError,
  setCurrentMediaStalled,
  setCurrentMediaUseDirect,
  setBumperReady,
  setBumperError,
  setActiveBumper,
  flashSkipNotice,
  advanceQueue,
  stepStream,
  finishTransition,
  pickNextBumper,
}: UseTVMediaEventHandlersArgs) {
  const handleCurrentMediaReady = useCallback(() => {
    const wasReady = mediaReadyRef.current;
    setCurrentMediaReady(true);
    mediaReadyRef.current = true;
    setCurrentMediaError(false);
    setCurrentMediaStalled(false);
    if (!wasReady) {
      const start = currentItemStartRef.current;
      tvLog("item.ready", {
        key: currentKeyRef.current,
        timeToReadyMs: start > 0 ? Date.now() - start : null,
        useDirect: currentMediaUseDirect,
      });
    }
    if (!bufferGateActiveRef.current) {
      const el = videoRef.current;
      if (el && el.paused) {
        const p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {
            /* autoplay refused; user interaction can resume playback */
          });
        }
      }
    }
  }, [
    bufferGateActiveRef,
    currentItemStartRef,
    currentKeyRef,
    currentMediaUseDirect,
    mediaReadyRef,
    setCurrentMediaError,
    setCurrentMediaReady,
    setCurrentMediaStalled,
    videoRef,
  ]);

  const handleCurrentMediaError = useCallback(() => {
    const queue = streamQueue || [];
    const queueActive = queue[clientQueueIdx] ?? streamCurrent ?? null;
    const directSource = queueActive?.sourceUri || "";
    const start = currentItemStartRef.current;
    if (queueActive?.kind !== "embed" && !currentMediaUseDirect && directSource) {
      tvLog("item.error.fallback", {
        key: currentKeyRef.current,
        elapsedMs: start > 0 ? Date.now() - start : null,
      });
      setCurrentMediaUseDirect(true);
      setCurrentMediaReady(false);
      mediaReadyRef.current = false;
      return;
    }
    setCurrentMediaReady(false);
    mediaReadyRef.current = false;
    setCurrentMediaError(true);

    const failKey =
      currentKeyRef.current || (queueActive ? queueItemKey(queueActive) : "unknown");
    const prevFails = failedItemCountsRef.current.get(failKey) ?? 0;
    const nextFails = prevFails + 1;
    failedItemCountsRef.current.set(failKey, nextFails);
    const justBlacklisted =
      nextFails >= 2 && !sessionSkipListRef.current.has(failKey);
    if (justBlacklisted) {
      sessionSkipListRef.current.add(failKey);
    }

    tvLog("item.end.error", {
      key: failKey,
      elapsedMs: start > 0 ? Date.now() - start : null,
      useDirect: currentMediaUseDirect,
      willPlayBumper: false,
      sessionFailCount: nextFails,
      sessionBlacklisted: justBlacklisted,
    });

    if (queueActive) {
      reportItemEnd({
        sessionId: sessionIdRef.current,
        videoId:
          queueActive.kind === "bumper"
            ? null
            : Number(queueActive.videoId) || null,
        bumperId:
          queueActive.kind === "bumper"
            ? Number(queueActive.bumperId ?? queueActive.videoId) || null
            : null,
        reason: "error",
      });
    }

    flashSkipNotice(
      justBlacklisted
        ? "Clip broken - removing from rotation"
        : "Skipping broken clip..."
    );

    const currentQueueIdx = queue.findIndex(
      (item) => queueItemKey(item) === failKey
    );
    const next = findNextQueueTarget(
      queue,
      currentQueueIdx >= 0 ? currentQueueIdx : clientQueueIdx,
      sessionSkipListRef.current
    );
    if (next.nextItem && next.nextKey !== failKey) {
      advanceQueue({
        targetIdx: next.nextIdx,
        skippedBlacklisted: next.skippedBlacklisted,
      });
    } else {
      stepStream();
    }
  }, [
    advanceQueue,
    clientQueueIdx,
    currentItemStartRef,
    currentKeyRef,
    currentMediaUseDirect,
    failedItemCountsRef,
    flashSkipNotice,
    mediaReadyRef,
    sessionIdRef,
    sessionSkipListRef,
    setCurrentMediaError,
    setCurrentMediaReady,
    setCurrentMediaUseDirect,
    stepStream,
    streamCurrent,
    streamQueue,
  ]);

  const handleBumperMediaReady = useCallback(() => {
    setBumperReady(true);
    setBumperError(false);
  }, [setBumperError, setBumperReady]);

  const handleBumperMediaError = useCallback(() => {
    if (bumperTimerRef.current) window.clearTimeout(bumperTimerRef.current);
    bumperRetryRef.current += 1;
    if (bumperRetryRef.current < 3) {
      const alt = pickNextBumper();
      if (alt) {
        setActiveBumper(alt);
        setBumperReady(false);
        setBumperError(false);
        const maxMs = Math.min(alt.durationMs + 500, 16000);
        bumperTimerRef.current = window.setTimeout(finishTransition, maxMs);
        return;
      }
    }
    setBumperReady(false);
    setBumperError(true);
    bumperTimerRef.current = window.setTimeout(finishTransition, 400);
  }, [
    bumperRetryRef,
    bumperTimerRef,
    finishTransition,
    pickNextBumper,
    setActiveBumper,
    setBumperError,
    setBumperReady,
  ]);

  return {
    handleCurrentMediaReady,
    handleCurrentMediaError,
    handleBumperMediaReady,
    handleBumperMediaError,
  };
}
