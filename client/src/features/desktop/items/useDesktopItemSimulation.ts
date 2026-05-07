import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  applyToolItemCleaning,
  diluteMessesWithWater,
} from "../drops/itemInteractions";
import {
  getDropCenter,
  type PetDrop,
} from "../drops/model";
import {
  distance,
  pointInRect,
} from "../DesktopPetModel";
import {
  getDesktopItemRect,
  type DesktopItemState,
} from "./model";

type MutableRef<T> = { current: T };

interface DesktopItemSimulationArgs {
  enabled: boolean;
  bounds: { width: number; height: number };
  itemsRef: MutableRef<DesktopItemState[]>;
  dropsRef: MutableRef<PetDrop[]>;
  setItems: Dispatch<SetStateAction<DesktopItemState[]>>;
  setDrops: Dispatch<SetStateAction<PetDrop[]>>;
}

export function useDesktopItemSimulation({
  enabled,
  bounds,
  itemsRef,
  dropsRef,
  setItems,
  setDrops,
}: DesktopItemSimulationArgs) {
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      let nextItems = itemsRef.current;
      let nextDrops = diluteMessesWithWater(dropsRef.current, now);
      const waterDrops = nextDrops.filter((drop) => drop.kind === "water");

      if (waterDrops.length > 0) {
        nextItems = nextItems.map((item) => {
          if (item.kind !== "sticky-note") return item;
          const rect = getDesktopItemRect(item, bounds, now);
          const wetDrop = waterDrops.find((water) => {
            const center = getDropCenter(water);
            return pointInRect(center, rect) || distance(center, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }) < 72;
          });
          if (!wetDrop) return item;
          const waterCenter = getDropCenter(wetDrop);
          const onSticky = waterCenter.y > rect.y + rect.height * 0.58;
          return {
            ...item,
            stickyWetness: onSticky ? Math.min(1, item.stickyWetness + 0.18) : item.stickyWetness,
            paperWetness: !onSticky ? Math.min(1, item.paperWetness + 0.22) : Math.min(1, item.paperWetness + 0.07),
            curl: Math.min(1, item.curl + (onSticky ? 0.11 : 0.18)),
            strokes: item.strokes.map((stroke) => ({
              ...stroke,
              width: Math.min(8, stroke.width + 0.08),
              color: item.paperWetness > 0.35 ? "rgba(38, 50, 56, 0.58)" : stroke.color,
            })),
          };
        });
      }

      const cleaned = applyToolItemCleaning(nextItems, nextDrops, bounds, now);
      nextItems = cleaned.items;
      nextDrops = cleaned.drops;

      if (nextItems !== itemsRef.current) {
        itemsRef.current = nextItems;
        setItems(nextItems);
      }
      if (nextDrops !== dropsRef.current) {
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
      }
    }, 1100);
    return () => window.clearInterval(interval);
  }, [bounds, bounds.height, bounds.width, dropsRef, enabled, itemsRef, setDrops, setItems]);
}
