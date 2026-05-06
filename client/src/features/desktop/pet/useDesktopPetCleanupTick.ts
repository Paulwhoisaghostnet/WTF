import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { DesktopWorldEdge } from "@shared/desktop";
import {
  type EscapeTunnelState,
  type WalkaboutSignpostState,
} from "../DesktopPetModel";
import {
  WATER_ABSORB_MS,
  type PetDrop,
} from "../drops";
import type { EscapedBallSlot } from "../toys";

type MutableRef<T> = { current: T };

interface DesktopPetCleanupTickArgs {
  enabled: boolean;
  dropsRef: MutableRef<PetDrop[]>;
  escapedBallSlotsRef: MutableRef<EscapedBallSlot[]>;
  escapeTunnelRef: MutableRef<EscapeTunnelState | null>;
  setDesktopNow: Dispatch<SetStateAction<number>>;
  setDrops: Dispatch<SetStateAction<PetDrop[]>>;
  setEscapedBallSlots: Dispatch<SetStateAction<EscapedBallSlot[]>>;
  setEscapeTunnel: Dispatch<SetStateAction<EscapeTunnelState | null>>;
  setWalkaboutSignpost: Dispatch<SetStateAction<WalkaboutSignpostState | null>>;
  setScentScratchCue: Dispatch<
    SetStateAction<(WalkaboutSignpostState & { edge: DesktopWorldEdge }) | null>
  >;
}

export function useDesktopPetCleanupTick({
  enabled,
  dropsRef,
  escapedBallSlotsRef,
  escapeTunnelRef,
  setDesktopNow,
  setDrops,
  setEscapedBallSlots,
  setEscapeTunnel,
  setWalkaboutSignpost,
  setScentScratchCue,
}: DesktopPetCleanupTickArgs) {
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setDesktopNow(now);
      const currentDrops = dropsRef.current;
      const nextDrops = currentDrops.filter(
        (drop) => drop.kind !== "water" || now - (drop.createdAt ?? now) < WATER_ABSORB_MS
      );
      if (nextDrops.length !== currentDrops.length) {
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
      }
      if (escapeTunnelRef.current && now >= escapeTunnelRef.current.openUntil) {
        escapeTunnelRef.current = null;
        setEscapeTunnel(null);
      }
      setWalkaboutSignpost((sign) => (sign && now >= sign.until ? null : sign));
      setScentScratchCue((cue) => (cue && now >= cue.until ? null : cue));
      const activeEscapedSlots = escapedBallSlotsRef.current.filter((slot) => slot.until > now);
      if (activeEscapedSlots.length !== escapedBallSlotsRef.current.length) {
        escapedBallSlotsRef.current = activeEscapedSlots;
        setEscapedBallSlots(activeEscapedSlots);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [
    dropsRef,
    enabled,
    escapedBallSlotsRef,
    escapeTunnelRef,
    setDesktopNow,
    setDrops,
    setEscapedBallSlots,
    setEscapeTunnel,
    setScentScratchCue,
    setWalkaboutSignpost,
  ]);
}
