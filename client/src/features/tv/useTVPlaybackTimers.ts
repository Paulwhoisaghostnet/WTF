import { useCallback, useEffect, useRef } from "react";

export function useTVPlaybackTimers() {
  const safetyCapRef = useRef<number | null>(null);
  const coverTriggerRef = useRef<number | null>(null);
  const loadCapRef = useRef<number | null>(null);

  const clearSafetyCap = useCallback(() => {
    if (safetyCapRef.current) {
      window.clearTimeout(safetyCapRef.current);
      safetyCapRef.current = null;
    }
  }, []);

  const clearCoverTrigger = useCallback(() => {
    if (coverTriggerRef.current) {
      window.clearTimeout(coverTriggerRef.current);
      coverTriggerRef.current = null;
    }
  }, []);

  const clearLoadCap = useCallback(() => {
    if (loadCapRef.current) {
      window.clearTimeout(loadCapRef.current);
      loadCapRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearSafetyCap();
      clearCoverTrigger();
      clearLoadCap();
    },
    [clearSafetyCap, clearCoverTrigger, clearLoadCap]
  );

  return {
    safetyCapRef,
    coverTriggerRef,
    loadCapRef,
    clearSafetyCap,
    clearCoverTrigger,
    clearLoadCap,
  };
}
