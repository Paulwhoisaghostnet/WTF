import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { StreamQueueItem } from "./types";

type CurrentItemMeta = {
  assetDurationSec: number;
  storedDurationSec: number;
  realDurationSec: number;
  isGif: boolean;
};

type UseTVMtvOverlayVisibilityArgs = {
  powerOn: boolean;
  activeItem: StreamQueueItem | null;
  activeKey: string;
  currentMediaReady: boolean;
  showBumper: boolean;
  currentItemMetaRef: MutableRefObject<CurrentItemMeta | null>;
  currentItemVisibleStartRef: MutableRefObject<number>;
  currentItemStartRef: MutableRefObject<number>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
};

export function useTVMtvOverlayVisibility({
  powerOn,
  activeItem,
  activeKey,
  currentMediaReady,
  showBumper,
  currentItemMetaRef,
  currentItemVisibleStartRef,
  currentItemStartRef,
  videoRef,
}: UseTVMtvOverlayVisibilityArgs) {
  const [mtvOverlayVisible, setMtvOverlayVisible] = useState(false);
  const mtvOverlayTickerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!powerOn || !activeItem || !currentMediaReady || showBumper) return;
    if (currentItemVisibleStartRef.current <= 0) {
      currentItemVisibleStartRef.current = Date.now();
    }
  }, [
    activeItem,
    currentItemVisibleStartRef,
    currentMediaReady,
    powerOn,
    showBumper,
  ]);

  useEffect(() => {
    if (mtvOverlayTickerRef.current !== null) {
      window.clearInterval(mtvOverlayTickerRef.current);
      mtvOverlayTickerRef.current = null;
    }

    if (!powerOn || !activeItem || showBumper) {
      setMtvOverlayVisible(false);
      return;
    }

    const evaluate = () => {
      const meta = currentItemMetaRef.current;
      if (!meta) {
        setMtvOverlayVisible((prev) => (prev ? false : prev));
        return;
      }
      let visible = false;
      const visibleStart =
        currentItemVisibleStartRef.current || currentItemStartRef.current;
      const localElapsedSec =
        visibleStart > 0 ? Math.max(0, (Date.now() - visibleStart) / 1000) : 0;

      if (meta.isGif) {
        const loopSec =
          meta.assetDurationSec > 0
            ? meta.assetDurationSec
            : meta.storedDurationSec > 0
              ? Math.max(1, meta.storedDurationSec / 3)
              : 0;
        if (loopSec > 0) {
          const inLoop1 = localElapsedSec >= 0 && localElapsedSec < loopSec;
          const inLoop3 =
            localElapsedSec >= 2 * loopSec && localElapsedSec < 3 * loopSec;
          visible = inLoop1 || inLoop3;
        } else {
          visible = localElapsedSec < 5;
        }
      } else {
        const el = videoRef.current;
        if (el) {
          const dur =
            meta.realDurationSec > 0
              ? meta.realDurationSec
              : Number.isFinite(el.duration) && el.duration > 0
                ? el.duration
                : meta.storedDurationSec;
          const t = Number.isFinite(el.currentTime) ? el.currentTime : 0;
          if (dur > 0) {
            const openingWindow = localElapsedSec < 10;
            const closingWindow = dur > 8 && t >= dur - 8 && t <= dur;
            visible = openingWindow || closingWindow;
          } else {
            visible = localElapsedSec < 10;
          }
        }
      }

      setMtvOverlayVisible((prev) => (prev === visible ? prev : visible));
    };

    evaluate();
    mtvOverlayTickerRef.current = window.setInterval(evaluate, 200);
    return () => {
      if (mtvOverlayTickerRef.current !== null) {
        window.clearInterval(mtvOverlayTickerRef.current);
        mtvOverlayTickerRef.current = null;
      }
    };
  }, [
    activeItem,
    activeKey,
    currentItemMetaRef,
    currentItemStartRef,
    currentItemVisibleStartRef,
    powerOn,
    showBumper,
    videoRef,
  ]);

  return mtvOverlayVisible;
}
