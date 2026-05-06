import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { queueItemKey } from "../../lib/tv-playback";
import { tvLog } from "./telemetry";
import type { BumperPoolItem, StreamQueueItem } from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type AdvanceQueueOptions = {
  targetIdx?: number;
  skippedBlacklisted?: number;
};

type UseTVQueueAdvanceControllerArgs = {
  streamMatchesSelectedChannel: boolean;
  streamQueue: StreamQueueItem[] | null | undefined;
  refetchStream: () => Promise<unknown>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  videoTimerRef: MutableRefObject<number | null>;
  bumperTimerRef: MutableRefObject<number | null>;
  bumperRetryRef: MutableRefObject<number>;
  currentKeyRef: MutableRefObject<string>;
  playbackTargetKeyRef: MutableRefObject<string>;
  currentPlaybackItemRef: MutableRefObject<StreamQueueItem | null>;
  mediaReadyRef: MutableRefObject<boolean>;
  setStreamTick: StateSetter<number>;
  setClientQueueIdx: StateSetter<number>;
  setTransitioning: StateSetter<boolean>;
  setActiveBumper: StateSetter<BumperPoolItem | null>;
  setBumperReady: StateSetter<boolean>;
  setBumperError: StateSetter<boolean>;
  setCurrentMediaReady: StateSetter<boolean>;
  setCurrentMediaError: StateSetter<boolean>;
  setCurrentMediaStalled: StateSetter<boolean>;
  setCurrentMediaUseDirect: StateSetter<boolean>;
  setStallIndicatorVisible: StateSetter<boolean>;
  clearSafetyCap: () => void;
  clearCoverTrigger: () => void;
  clearLoadCap: () => void;
};

export function useTVQueueAdvanceController({
  streamMatchesSelectedChannel,
  streamQueue,
  refetchStream,
  videoRef,
  videoTimerRef,
  bumperTimerRef,
  bumperRetryRef,
  currentKeyRef,
  playbackTargetKeyRef,
  currentPlaybackItemRef,
  mediaReadyRef,
  setStreamTick,
  setClientQueueIdx,
  setTransitioning,
  setActiveBumper,
  setBumperReady,
  setBumperError,
  setCurrentMediaReady,
  setCurrentMediaError,
  setCurrentMediaStalled,
  setCurrentMediaUseDirect,
  setStallIndicatorVisible,
  clearSafetyCap,
  clearCoverTrigger,
  clearLoadCap,
}: UseTVQueueAdvanceControllerArgs) {
  const [loadingSignal, setLoadingSignal] = useState(false);
  const [authoritativeAdvancePending, setAuthoritativeAdvancePending] =
    useState(false);

  const advanceQueue = useCallback(
    (options?: AdvanceQueueOptions) => {
      clearSafetyCap();
      clearCoverTrigger();
      clearLoadCap();
      if (videoTimerRef.current) {
        window.clearTimeout(videoTimerRef.current);
        videoTimerRef.current = null;
      }
      if (bumperTimerRef.current) {
        window.clearTimeout(bumperTimerRef.current);
        bumperTimerRef.current = null;
      }
      setTransitioning(false);
      setActiveBumper(null);
      setBumperReady(false);
      setBumperError(false);
      setCurrentMediaStalled(false);
      const queue = streamMatchesSelectedChannel ? streamQueue || [] : [];
      const skippedBlacklisted = options?.skippedBlacklisted ?? 0;
      const targetIdx = options?.targetIdx;
      setClientQueueIdx((prev) => {
        if (queue.length === 0) {
          playbackTargetKeyRef.current = "";
          currentPlaybackItemRef.current = null;
          return 0;
        }

        const immediateNext = prev + 1;
        const resolved =
          typeof targetIdx === "number"
            ? Math.max(0, Math.min(targetIdx, queue.length - 1))
            : immediateNext < queue.length
              ? immediateNext
              : 0;
        const nextItem = queue[resolved] || null;
        playbackTargetKeyRef.current = nextItem ? queueItemKey(nextItem) : "";
        const wrapped =
          typeof targetIdx === "number"
            ? resolved <= prev
            : immediateNext >= queue.length;

        if (wrapped) {
          tvLog("queue.advance.wrap", {
            fromIdx: prev,
            toIdx: resolved,
            queueLen: queue.length,
            skippedBlacklisted,
          });
          setStreamTick((v) => v + 1);
          return resolved;
        }

        if (skippedBlacklisted > 0) {
          tvLog("queue.advance.skiplist", {
            fromIdx: prev,
            toIdx: resolved,
            skippedBlacklisted,
          });
        } else {
          tvLog("queue.advance", { fromIdx: prev, toIdx: resolved });
        }
        return resolved;
      });
    },
    [
      streamMatchesSelectedChannel,
      streamQueue,
      clearSafetyCap,
      clearCoverTrigger,
      clearLoadCap,
      videoTimerRef,
      bumperTimerRef,
      setTransitioning,
      setActiveBumper,
      setBumperReady,
      setBumperError,
      setCurrentMediaStalled,
      setClientQueueIdx,
      playbackTargetKeyRef,
      currentPlaybackItemRef,
      setStreamTick,
    ]
  );

  const stepStream = useCallback(() => {
    if (videoTimerRef.current) {
      window.clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    clearSafetyCap();
    clearCoverTrigger();
    clearLoadCap();
    bumperRetryRef.current = 0;
    currentKeyRef.current = "";
    playbackTargetKeyRef.current = "";
    currentPlaybackItemRef.current = null;
    mediaReadyRef.current = false;
    setClientQueueIdx(0);
    setTransitioning(false);
    setActiveBumper(null);
    setBumperReady(false);
    setBumperError(false);
    setCurrentMediaReady(false);
    setCurrentMediaError(false);
    setCurrentMediaStalled(false);
    setCurrentMediaUseDirect(false);
    setStallIndicatorVisible(false);
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        /* ignore */
      }
    }
    setAuthoritativeAdvancePending(true);
    setLoadingSignal(true);
    void refetchStream().finally(() => {
      setAuthoritativeAdvancePending(false);
      setLoadingSignal(false);
    });
  }, [
    videoTimerRef,
    bumperTimerRef,
    clearSafetyCap,
    clearCoverTrigger,
    clearLoadCap,
    bumperRetryRef,
    currentKeyRef,
    playbackTargetKeyRef,
    currentPlaybackItemRef,
    mediaReadyRef,
    setClientQueueIdx,
    setTransitioning,
    setActiveBumper,
    setBumperReady,
    setBumperError,
    setCurrentMediaReady,
    setCurrentMediaError,
    setCurrentMediaStalled,
    setCurrentMediaUseDirect,
    setStallIndicatorVisible,
    refetchStream,
    videoRef,
  ]);

  return {
    advanceQueue,
    stepStream,
    authoritativeAdvancePending,
    setAuthoritativeAdvancePending,
    loadingSignal,
    setLoadingSignal,
  };
}
