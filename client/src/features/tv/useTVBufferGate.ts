import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import { tvLog } from "./telemetry";
import type { BumperPoolItem } from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type BumperTransitionReason = "advance" | "cover";
export type BufferGateExitReason =
  | "watermark"
  | "deadline"
  | "no-pool"
  | "abort";

type BumperMeta = {
  bumperId: number | null;
  reason: BumperTransitionReason | "gate";
  plannedMs: number;
};

type UseTVBufferGateArgs = {
  bufferGateActiveRef: MutableRefObject<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  bumperTimerRef: MutableRefObject<number | null>;
  bumperRetryRef: MutableRefObject<number>;
  currentKeyRef: MutableRefObject<string>;
  bumperStartRef: MutableRefObject<number>;
  bumperMetaRef: MutableRefObject<BumperMeta | null>;
  transitionModeRef: MutableRefObject<BumperTransitionReason>;
  slotStartRef: MutableRefObject<number>;
  pickNextBumper: () => BumperPoolItem | null;
  pickGateBumper: () => BumperPoolItem | null;
  advanceQueue: () => void;
  coverMinMs: number;
  coverMaxMs: number;
  bufferGateWatermarkSec: number;
  bufferGateCheckIntervalMs: number;
  bufferGateMaxWaitMs: number;
  setTransitioning: StateSetter<boolean>;
  setActiveBumper: StateSetter<BumperPoolItem | null>;
  setBumperReady: StateSetter<boolean>;
  setBumperError: StateSetter<boolean>;
};

export function useTVBufferGate({
  bufferGateActiveRef,
  videoRef,
  bumperTimerRef,
  bumperRetryRef,
  currentKeyRef,
  bumperStartRef,
  bumperMetaRef,
  transitionModeRef,
  slotStartRef,
  pickNextBumper,
  pickGateBumper,
  advanceQueue,
  coverMinMs,
  coverMaxMs,
  bufferGateWatermarkSec,
  bufferGateCheckIntervalMs,
  bufferGateMaxWaitMs,
  setTransitioning,
  setActiveBumper,
  setBumperReady,
  setBumperError,
}: UseTVBufferGateArgs) {
  const bufferGateStartedAtRef = useRef(0);
  const bufferGateDeadlineRef = useRef(0);
  const bufferGateTickerRef = useRef<number | null>(null);
  const exitBufferGateRef = useRef<(reason: BufferGateExitReason) => void>(
    () => {}
  );
  const startGateBumperRef = useRef<() => void>(() => {});

  const clearBufferGateTicker = useCallback(() => {
    if (bufferGateTickerRef.current !== null) {
      window.clearInterval(bufferGateTickerRef.current);
      bufferGateTickerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearBufferGateTicker();
    },
    [clearBufferGateTicker]
  );

  const finishTransition = useCallback(() => {
    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    const meta = bumperMetaRef.current;
    const elapsed = bumperStartRef.current
      ? Date.now() - bumperStartRef.current
      : null;
    const wasGate = meta?.reason === "gate" || bufferGateActiveRef.current;
    tvLog(wasGate ? "buffer-gate.bumper.end" : "bumper.end.advance", {
      reason: meta?.reason || (wasGate ? "gate" : "advance"),
      bumperId: meta?.bumperId ?? null,
      elapsedMs: elapsed,
      plannedMs: meta?.plannedMs ?? null,
    });
    bumperMetaRef.current = null;
    bumperStartRef.current = 0;
    slotStartRef.current = Date.now();
    if (wasGate) {
      queueMicrotask(() => {
        if (!bufferGateActiveRef.current) return;
        if (Date.now() >= bufferGateDeadlineRef.current) {
          exitBufferGateRef.current("deadline");
          return;
        }
        if (videoRef.current) {
          const el = videoRef.current;
          try {
            if (el.buffered.length > 0) {
              const ahead =
                el.buffered.end(el.buffered.length - 1) -
                (Number.isFinite(el.currentTime) ? el.currentTime : 0);
              if (ahead >= bufferGateWatermarkSec) {
                exitBufferGateRef.current("watermark");
                return;
              }
            }
          } catch {
            /* fall through */
          }
        }
        startGateBumperRef.current();
      });
      return;
    }
    advanceQueue();
  }, [
    advanceQueue,
    bufferGateActiveRef,
    bufferGateWatermarkSec,
    bumperMetaRef,
    bumperStartRef,
    bumperTimerRef,
    slotStartRef,
    videoRef,
  ]);

  const startBumper = useCallback(
    (reason: BumperTransitionReason = "advance") => {
      transitionModeRef.current = reason;
      bumperRetryRef.current = 0;
      if (bumperTimerRef.current) window.clearTimeout(bumperTimerRef.current);
      const bumper = pickNextBumper();
      bumperStartRef.current = Date.now();
      if (bumper) {
        const cap = reason === "cover" ? coverMaxMs : 30_500;
        const maxBumperMs = Math.min(bumper.durationMs + 500, cap);
        bumperMetaRef.current = {
          bumperId: bumper.id,
          reason,
          plannedMs: maxBumperMs,
        };
        tvLog("bumper.start", {
          reason,
          bumperId: bumper.id,
          plannedMs: maxBumperMs,
          mimeType: bumper.mimeType,
        });
        setActiveBumper(bumper);
        setBumperReady(false);
        setBumperError(false);
        setTransitioning(true);
        bumperTimerRef.current = window.setTimeout(
          finishTransition,
          maxBumperMs
        );
      } else {
        const fallbackMs = reason === "cover" ? coverMinMs : 400;
        bumperMetaRef.current = {
          bumperId: null,
          reason,
          plannedMs: fallbackMs,
        };
        tvLog("bumper.start.nopool", { reason, plannedMs: fallbackMs });
        setTransitioning(true);
        bumperTimerRef.current = window.setTimeout(
          finishTransition,
          fallbackMs
        );
      }
    },
    [
      bumperMetaRef,
      bumperRetryRef,
      bumperStartRef,
      bumperTimerRef,
      coverMaxMs,
      coverMinMs,
      finishTransition,
      pickNextBumper,
      setActiveBumper,
      setBumperError,
      setBumperReady,
      setTransitioning,
      transitionModeRef,
    ]
  );

  const isBufferDeepEnough = useCallback((): boolean => {
    const el = videoRef.current;
    if (!el) return false;
    try {
      if (el.buffered.length === 0) return false;
      const currentTime = Number.isFinite(el.currentTime) ? el.currentTime : 0;
      const bufferedEnd = el.buffered.end(el.buffered.length - 1);
      const ahead = bufferedEnd - currentTime;
      const dur = Number.isFinite(el.duration) ? el.duration : 0;
      if (dur > 0 && dur < bufferGateWatermarkSec) {
        return bufferedEnd >= dur - 0.5;
      }
      return ahead >= bufferGateWatermarkSec;
    } catch {
      return false;
    }
  }, [bufferGateWatermarkSec, videoRef]);

  const exitBufferGate = useCallback(
    (reason: BufferGateExitReason) => {
      if (!bufferGateActiveRef.current) return;
      bufferGateActiveRef.current = false;
      clearBufferGateTicker();
      if (bumperTimerRef.current) {
        window.clearTimeout(bumperTimerRef.current);
        bumperTimerRef.current = null;
      }
      const elapsedMs = bufferGateStartedAtRef.current
        ? Date.now() - bufferGateStartedAtRef.current
        : null;
      bufferGateStartedAtRef.current = 0;
      bumperMetaRef.current = null;
      setTransitioning(false);
      setActiveBumper(null);
      setBumperReady(false);
      setBumperError(false);
      tvLog("buffer-gate.exit", {
        key: currentKeyRef.current,
        reason,
        elapsedMs,
      });
      if (reason === "abort") return;
      const el = videoRef.current;
      if (el) {
        const p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch((err) => {
            tvLog("buffer-gate.play-error", {
              key: currentKeyRef.current,
              reason,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    },
    [
      bufferGateActiveRef,
      bumperMetaRef,
      bumperTimerRef,
      clearBufferGateTicker,
      currentKeyRef,
      setActiveBumper,
      setBumperError,
      setBumperReady,
      setTransitioning,
      videoRef,
    ]
  );

  const evaluateBufferGate = useCallback(() => {
    if (!bufferGateActiveRef.current) return;
    if (Date.now() >= bufferGateDeadlineRef.current) {
      exitBufferGate("deadline");
      return;
    }
    if (isBufferDeepEnough()) {
      exitBufferGate("watermark");
      return;
    }
    startGateBumperRef.current();
  }, [bufferGateActiveRef, exitBufferGate, isBufferDeepEnough]);

  const startGateBumper = useCallback(() => {
    if (!bufferGateActiveRef.current) return;
    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    const bumper = pickGateBumper();
    bumperStartRef.current = Date.now();
    if (!bumper) {
      exitBufferGate("no-pool");
      return;
    }
    const cap = Math.min(bumper.durationMs + 500, 30_500);
    bumperMetaRef.current = {
      bumperId: bumper.id,
      reason: "gate",
      plannedMs: cap,
    };
    transitionModeRef.current = "cover";
    tvLog("buffer-gate.bumper.start", {
      key: currentKeyRef.current,
      bumperId: bumper.id,
      category: bumper.category || "unknown",
      plannedMs: cap,
    });
    setActiveBumper(bumper);
    setBumperReady(false);
    setBumperError(false);
    setTransitioning(true);
    bumperTimerRef.current = window.setTimeout(() => {
      evaluateBufferGate();
    }, cap);
  }, [
    bufferGateActiveRef,
    bumperMetaRef,
    bumperStartRef,
    bumperTimerRef,
    currentKeyRef,
    evaluateBufferGate,
    exitBufferGate,
    pickGateBumper,
    setActiveBumper,
    setBumperError,
    setBumperReady,
    setTransitioning,
    transitionModeRef,
  ]);

  startGateBumperRef.current = startGateBumper;
  exitBufferGateRef.current = exitBufferGate;

  const startBufferGate = useCallback(() => {
    clearBufferGateTicker();
    bufferGateActiveRef.current = true;
    bufferGateStartedAtRef.current = Date.now();
    bufferGateDeadlineRef.current = Date.now() + bufferGateMaxWaitMs;
    tvLog("buffer-gate.start", {
      key: currentKeyRef.current,
      watermarkSec: bufferGateWatermarkSec,
      maxWaitMs: bufferGateMaxWaitMs,
    });
    bufferGateTickerRef.current = window.setInterval(() => {
      if (!bufferGateActiveRef.current) {
        clearBufferGateTicker();
        return;
      }
      if (Date.now() >= bufferGateDeadlineRef.current) {
        exitBufferGate("deadline");
        return;
      }
      if (isBufferDeepEnough()) {
        exitBufferGate("watermark");
      }
    }, bufferGateCheckIntervalMs);
    startGateBumper();
  }, [
    bufferGateActiveRef,
    bufferGateCheckIntervalMs,
    bufferGateMaxWaitMs,
    bufferGateWatermarkSec,
    clearBufferGateTicker,
    currentKeyRef,
    exitBufferGate,
    isBufferDeepEnough,
    startGateBumper,
  ]);

  return {
    finishTransition,
    startBumper,
    startBufferGate,
    exitBufferGate,
    abortBufferGateRef: exitBufferGateRef,
  };
}
