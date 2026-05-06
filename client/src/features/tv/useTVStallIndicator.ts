import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { tvLog } from "./telemetry";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type UseTVStallIndicatorArgs = {
  bufferGateActiveRef: MutableRefObject<boolean>;
  mediaReadyRef: MutableRefObject<boolean>;
  currentItemStartRef: MutableRefObject<number>;
  currentKeyRef: MutableRefObject<string>;
  stallIndicatorDelayMs: number;
};

export function useTVStallIndicator({
  bufferGateActiveRef,
  mediaReadyRef,
  currentItemStartRef,
  currentKeyRef,
  stallIndicatorDelayMs,
}: UseTVStallIndicatorArgs) {
  const [currentMediaStalled, setCurrentMediaStalled] = useState(false);
  const [stallIndicatorVisible, setStallIndicatorVisible] = useState(false);
  const stallIndicatorTimerRef = useRef<number | null>(null);

  const clearStallIndicatorTimer = useCallback(() => {
    if (stallIndicatorTimerRef.current) {
      window.clearTimeout(stallIndicatorTimerRef.current);
      stallIndicatorTimerRef.current = null;
    }
  }, []);

  const resetStallIndicator = useCallback(() => {
    clearStallIndicatorTimer();
    setStallIndicatorVisible(false);
  }, [clearStallIndicatorTimer]);

  useEffect(
    () => () => {
      clearStallIndicatorTimer();
    },
    [clearStallIndicatorTimer]
  );

  const handleCurrentMediaStalled = useCallback(() => {
    const start = currentItemStartRef.current;
    tvLog("item.stall", {
      key: currentKeyRef.current,
      elapsedMs: start > 0 ? Date.now() - start : null,
    });
    setCurrentMediaStalled(true);
    if (
      !bufferGateActiveRef.current &&
      mediaReadyRef.current &&
      !stallIndicatorTimerRef.current
    ) {
      stallIndicatorTimerRef.current = window.setTimeout(() => {
        stallIndicatorTimerRef.current = null;
        setStallIndicatorVisible(true);
      }, stallIndicatorDelayMs);
    }
  }, [
    bufferGateActiveRef,
    currentItemStartRef,
    currentKeyRef,
    mediaReadyRef,
    stallIndicatorDelayMs,
  ]);

  const handleCurrentMediaPlaying = useCallback(() => {
    const wasStalled = !mediaReadyRef.current;
    setCurrentMediaStalled(false);
    mediaReadyRef.current = true;
    clearStallIndicatorTimer();
    setStallIndicatorVisible(false);
    if (wasStalled) {
      const start = currentItemStartRef.current;
      tvLog("item.playing", {
        key: currentKeyRef.current,
        elapsedMs: start > 0 ? Date.now() - start : null,
      });
    }
  }, [
    clearStallIndicatorTimer,
    currentItemStartRef,
    currentKeyRef,
    mediaReadyRef,
  ]);

  return {
    currentMediaStalled,
    setCurrentMediaStalled: setCurrentMediaStalled as StateSetter<boolean>,
    stallIndicatorVisible,
    setStallIndicatorVisible: setStallIndicatorVisible as StateSetter<boolean>,
    stallIndicatorTimerRef,
    clearStallIndicatorTimer,
    resetStallIndicator,
    handleCurrentMediaStalled,
    handleCurrentMediaPlaying,
  };
}
