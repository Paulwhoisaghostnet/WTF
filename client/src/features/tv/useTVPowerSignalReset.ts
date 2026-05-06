import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import type { BumperPoolItem, StreamQueueItem, TVCurrentItemMeta } from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type BumperTransitionReason = "advance" | "cover";
type BumperMeta = {
  bumperId: number | null;
  reason: BumperTransitionReason | "gate";
  plannedMs: number;
};

type UseTVPowerSignalResetArgs = {
  powerOn: boolean;
  selectedChannelId: number | null;
  videoTimerRef: MutableRefObject<number | null>;
  bumperTimerRef: MutableRefObject<number | null>;
  safetyCapRef: MutableRefObject<number | null>;
  loadCapRef: MutableRefObject<number | null>;
  coverTriggerRef: MutableRefObject<number | null>;
  stallIndicatorTimerRef: MutableRefObject<number | null>;
  slotStartRef: MutableRefObject<number>;
  currentKeyRef: MutableRefObject<string>;
  playbackTargetKeyRef: MutableRefObject<string>;
  currentPlaybackItemRef: MutableRefObject<StreamQueueItem | null>;
  mediaReadyRef: MutableRefObject<boolean>;
  currentItemStartRef: MutableRefObject<number>;
  currentItemVisibleStartRef: MutableRefObject<number>;
  currentItemMetaRef: MutableRefObject<TVCurrentItemMeta | null>;
  bumperStartRef: MutableRefObject<number>;
  bumperMetaRef: MutableRefObject<BumperMeta | null>;
  transitionModeRef: MutableRefObject<BumperTransitionReason>;
  preloadReadyRef: MutableRefObject<Set<string>>;
  setAuthoritativeAdvancePending: StateSetter<boolean>;
  setLoadingSignal: StateSetter<boolean>;
  setTransitioning: StateSetter<boolean>;
  setActiveBumper: StateSetter<BumperPoolItem | null>;
  setShowPowerFlash: StateSetter<boolean>;
  setClientQueueIdx: StateSetter<number>;
  setCurrentMediaReady: StateSetter<boolean>;
  setCurrentMediaError: StateSetter<boolean>;
  setCurrentMediaStalled: StateSetter<boolean>;
  setStallIndicatorVisible: StateSetter<boolean>;
  setCurrentMediaUseDirect: StateSetter<boolean>;
  setBumperReady: StateSetter<boolean>;
  setBumperError: StateSetter<boolean>;
};

export function useTVPowerSignalReset({
  powerOn,
  selectedChannelId,
  videoTimerRef,
  bumperTimerRef,
  safetyCapRef,
  loadCapRef,
  coverTriggerRef,
  stallIndicatorTimerRef,
  slotStartRef,
  currentKeyRef,
  playbackTargetKeyRef,
  currentPlaybackItemRef,
  mediaReadyRef,
  currentItemStartRef,
  currentItemVisibleStartRef,
  currentItemMetaRef,
  bumperStartRef,
  bumperMetaRef,
  transitionModeRef,
  preloadReadyRef,
  setAuthoritativeAdvancePending,
  setLoadingSignal,
  setTransitioning,
  setActiveBumper,
  setShowPowerFlash,
  setClientQueueIdx,
  setCurrentMediaReady,
  setCurrentMediaError,
  setCurrentMediaStalled,
  setStallIndicatorVisible,
  setCurrentMediaUseDirect,
  setBumperReady,
  setBumperError,
}: UseTVPowerSignalResetArgs) {
  useEffect(() => {
    if (!powerOn) {
      if (videoTimerRef.current) {
        window.clearTimeout(videoTimerRef.current);
        videoTimerRef.current = null;
      }
      if (bumperTimerRef.current) {
        window.clearTimeout(bumperTimerRef.current);
        bumperTimerRef.current = null;
      }
      if (safetyCapRef.current) {
        window.clearTimeout(safetyCapRef.current);
        safetyCapRef.current = null;
      }
      if (loadCapRef.current) {
        window.clearTimeout(loadCapRef.current);
        loadCapRef.current = null;
      }
      if (coverTriggerRef.current) {
        window.clearTimeout(coverTriggerRef.current);
        coverTriggerRef.current = null;
      }
      currentKeyRef.current = "";
      playbackTargetKeyRef.current = "";
      currentPlaybackItemRef.current = null;
      mediaReadyRef.current = false;
      currentItemStartRef.current = 0;
      currentItemVisibleStartRef.current = 0;
      currentItemMetaRef.current = null;
      bumperStartRef.current = 0;
      bumperMetaRef.current = null;
      transitionModeRef.current = "advance";
      preloadReadyRef.current = new Set();
      setAuthoritativeAdvancePending(false);
      setLoadingSignal(false);
      setTransitioning(false);
      setActiveBumper(null);
      setShowPowerFlash(false);
      setCurrentMediaReady(false);
      setCurrentMediaError(false);
      setCurrentMediaStalled(false);
      if (stallIndicatorTimerRef.current) {
        window.clearTimeout(stallIndicatorTimerRef.current);
        stallIndicatorTimerRef.current = null;
      }
      setStallIndicatorVisible(false);
      setCurrentMediaUseDirect(false);
      setBumperReady(false);
      setBumperError(false);
      return;
    }

    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    if (loadCapRef.current) {
      window.clearTimeout(loadCapRef.current);
      loadCapRef.current = null;
    }
    if (coverTriggerRef.current) {
      window.clearTimeout(coverTriggerRef.current);
      coverTriggerRef.current = null;
    }
    slotStartRef.current = Date.now();
    currentKeyRef.current = "";
    playbackTargetKeyRef.current = "";
    currentPlaybackItemRef.current = null;
    bumperStartRef.current = 0;
    bumperMetaRef.current = null;
    transitionModeRef.current = "advance";
    preloadReadyRef.current = new Set();
    setAuthoritativeAdvancePending(false);
    setClientQueueIdx(0);
    setTransitioning(false);
    setActiveBumper(null);
    setBumperReady(false);
    setBumperError(false);
    setShowPowerFlash(true);
    setLoadingSignal(true);
    const t1 = window.setTimeout(() => setShowPowerFlash(false), 600);
    const t2 = window.setTimeout(() => setLoadingSignal(false), 1400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // Preserve the original page effect boundary: power and channel changes
    // are the lifecycle triggers; refs/setters are the explicit reset contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [powerOn, selectedChannelId]);
}
