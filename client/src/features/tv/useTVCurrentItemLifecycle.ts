import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import { isGif } from "./utils";
import { tvLog } from "./telemetry";
import type { StreamQueueItem, TVCurrentItemMeta } from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type AbortBufferGateReason = "watermark" | "deadline" | "no-pool" | "abort";
type PlaybackSource =
  | "requested"
  | "pinned"
  | "fallback"
  | "stream-current"
  | "empty";

type UseTVCurrentItemLifecycleArgs = {
  powerOn: boolean;
  activeItem: StreamQueueItem | null;
  activeKey: string;
  loadingSignal: boolean;
  selectedChannelId: number | null;
  playbackCursorIdx: number;
  activePlaybackSource: PlaybackSource;
  authoritativeAdvancePending: boolean;
  hardItemCapMs: number;
  loadCapMs: number;
  currentKeyRef: MutableRefObject<string>;
  playbackTargetKeyRef: MutableRefObject<string>;
  currentPlaybackItemRef: MutableRefObject<StreamQueueItem | null>;
  currentItemStartRef: MutableRefObject<number>;
  currentItemVisibleStartRef: MutableRefObject<number>;
  currentItemMetaRef: MutableRefObject<TVCurrentItemMeta | null>;
  mediaReadyRef: MutableRefObject<boolean>;
  videoTimerRef: MutableRefObject<number | null>;
  safetyCapRef: MutableRefObject<number | null>;
  loadCapRef: MutableRefObject<number | null>;
  bufferGateActiveRef: MutableRefObject<boolean>;
  stallIndicatorTimerRef: MutableRefObject<number | null>;
  stepStreamRef: MutableRefObject<() => void>;
  clearSafetyCapRef: MutableRefObject<() => void>;
  clearLoadCapRef: MutableRefObject<() => void>;
  clearCoverTriggerRef: MutableRefObject<() => void>;
  abortBufferGateRef: MutableRefObject<(reason: AbortBufferGateReason) => void>;
  setCurrentMediaReady: StateSetter<boolean>;
  setCurrentMediaError: StateSetter<boolean>;
  setCurrentMediaStalled: StateSetter<boolean>;
  setStallIndicatorVisible: StateSetter<boolean>;
  setCurrentMediaUseDirect: StateSetter<boolean>;
};

export function useTVCurrentItemLifecycle({
  powerOn,
  activeItem,
  activeKey,
  loadingSignal,
  selectedChannelId,
  playbackCursorIdx,
  activePlaybackSource,
  authoritativeAdvancePending,
  hardItemCapMs,
  loadCapMs,
  currentKeyRef,
  playbackTargetKeyRef,
  currentPlaybackItemRef,
  currentItemStartRef,
  currentItemVisibleStartRef,
  currentItemMetaRef,
  mediaReadyRef,
  videoTimerRef,
  safetyCapRef,
  loadCapRef,
  bufferGateActiveRef,
  stallIndicatorTimerRef,
  stepStreamRef,
  clearSafetyCapRef,
  clearLoadCapRef,
  clearCoverTriggerRef,
  abortBufferGateRef,
  setCurrentMediaReady,
  setCurrentMediaError,
  setCurrentMediaStalled,
  setStallIndicatorVisible,
  setCurrentMediaUseDirect,
}: UseTVCurrentItemLifecycleArgs) {
  useEffect(() => {
    if (!powerOn || !activeItem || loadingSignal) {
      clearSafetyCapRef.current();
      clearLoadCapRef.current();
      clearCoverTriggerRef.current();
      if (videoTimerRef.current) {
        window.clearTimeout(videoTimerRef.current);
        videoTimerRef.current = null;
      }
      if (bufferGateActiveRef.current) {
        abortBufferGateRef.current("abort");
      }
      return;
    }

    if (activeKey === currentKeyRef.current) return;

    const prevKey = currentKeyRef.current;
    const prevStart = currentItemStartRef.current;
    if (prevKey && prevStart > 0) {
      tvLog("item.end.replaced", {
        key: prevKey,
        elapsedMs: Date.now() - prevStart,
        newKey: activeKey,
      });
    }

    if (bufferGateActiveRef.current) {
      abortBufferGateRef.current("abort");
    }

    currentKeyRef.current = activeKey;
    playbackTargetKeyRef.current = activeKey;
    currentPlaybackItemRef.current = activeItem;
    currentItemStartRef.current = Date.now();
    currentItemVisibleStartRef.current = 0;

    const isGifItem = isGif(activeItem.mimeType);
    const storedDur = Math.max(0, Number(activeItem.durationSeconds) || 0);
    const assetDurationSec = Math.max(
      0,
      Number(activeItem.assetDurationSeconds) || storedDur
    );
    const startOffsetSec = Math.max(0, Number(activeItem.offsetSeconds) || 0);
    const remainingItemMs = Math.max(
      1000,
      Math.round(Math.max(0, storedDur - startOffsetSec) * 1000)
    );
    const gifPlannedMs = isGifItem ? remainingItemMs : 0;

    currentItemMetaRef.current = {
      itemId: activeItem.itemId,
      videoId: activeItem.videoId,
      sourceUri: activeItem.sourceUri,
      mimeType: activeItem.mimeType,
      storedDurationSec: storedDur,
      assetDurationSec,
      offsetSeconds: startOffsetSec,
      realDurationSec: 0,
      isGif: isGifItem,
      gifPlannedMs,
      channelId: selectedChannelId,
    };

    tvLog("item.start", {
      key: activeKey,
      channelId: selectedChannelId,
      itemId: activeItem.itemId,
      videoId: activeItem.videoId,
      mimeType: activeItem.mimeType,
      sourceUri: activeItem.sourceUri,
      storedDurationSec: storedDur,
      offsetSeconds: startOffsetSec,
      isGif: isGifItem,
      gifPlannedMs: isGifItem ? gifPlannedMs : null,
      clientQueueIdx: playbackCursorIdx,
      activeSource: activePlaybackSource,
    });

    setCurrentMediaReady(false);
    setCurrentMediaError(false);
    setCurrentMediaStalled(false);
    if (stallIndicatorTimerRef.current) {
      window.clearTimeout(stallIndicatorTimerRef.current);
      stallIndicatorTimerRef.current = null;
    }
    setStallIndicatorVisible(false);
    setCurrentMediaUseDirect(false);
    mediaReadyRef.current = false;

    clearSafetyCapRef.current();
    if (videoTimerRef.current) {
      window.clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }

    if (isGifItem) {
      const plannedMs = gifPlannedMs;
      videoTimerRef.current = window.setTimeout(() => {
        const start = currentItemStartRef.current;
        tvLog("item.end.gif", {
          key: activeKey,
          plannedMs,
          elapsedMs: start > 0 ? Date.now() - start : null,
          storedDurationSec: storedDur,
        });
        stepStreamRef.current();
      }, plannedMs);
    }

    safetyCapRef.current = window.setTimeout(() => {
      const start = currentItemStartRef.current;
      tvLog("item.end.safety", {
        key: activeKey,
        elapsedMs: start > 0 ? Date.now() - start : null,
        capMs: hardItemCapMs,
      });
      stepStreamRef.current();
    }, hardItemCapMs);

    clearLoadCapRef.current();
    loadCapRef.current = window.setTimeout(() => {
      if (mediaReadyRef.current) return;
      const start = currentItemStartRef.current;
      tvLog("item.end.load-cap", {
        key: activeKey,
        elapsedMs: start > 0 ? Date.now() - start : null,
        capMs: loadCapMs,
      });
      stepStreamRef.current();
    }, loadCapMs);

    return () => {
      clearSafetyCapRef.current();
      clearLoadCapRef.current();
      if (videoTimerRef.current) {
        window.clearTimeout(videoTimerRef.current);
        videoTimerRef.current = null;
      }
      if (bufferGateActiveRef.current) {
        abortBufferGateRef.current("abort");
      }
    };
    // Keep the dependency shape aligned with the original page-owned effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeKey,
    powerOn,
    loadingSignal,
    selectedChannelId,
    playbackCursorIdx,
    activePlaybackSource,
    authoritativeAdvancePending,
  ]);
}
