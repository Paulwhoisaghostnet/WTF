import type { HamsterState } from "@shared/desktop";
import {
  PET_H,
  PET_W,
  pointInRect,
} from "../DesktopPetModel";
import {
  getDesktopItemCenter,
  getDesktopItemRect,
  type DesktopItemState,
} from "../items/model";

export interface PetItemInteractionResult {
  target: { x: number; y: number } | null;
  speedMultiplier: number;
  items: DesktopItemState[];
  changed: boolean;
  stickyRestItemId: string | null;
}

function pushAwayTarget(
  current: { x: number; y: number },
  source: { x: number; y: number },
  distance: number,
  bounds: { width: number; height: number }
) {
  const petCenter = { x: current.x + PET_W / 2, y: current.y + PET_H * 0.52 };
  const dx = petCenter.x - source.x;
  const dy = petCenter.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return {
    x: Math.max(0, Math.min(bounds.width - PET_W, current.x + (dx / length) * distance)),
    y: Math.max(0, Math.min(bounds.height - PET_H, current.y + (dy / length) * distance)),
  };
}

export function applyPetItemInteractions({
  current,
  pet,
  items,
  bounds,
  now,
}: {
  current: { x: number; y: number };
  pet: HamsterState;
  items: DesktopItemState[];
  bounds: { width: number; height: number };
  now: number;
}): PetItemInteractionResult {
  const petCenter = { x: current.x + PET_W / 2, y: current.y + PET_H * 0.58 };
  let speedMultiplier = 1;
  let target: { x: number; y: number } | null = null;
  let changed = false;
  let stickyRestItemId: string | null = null;
  let nextItems = items;

  for (const item of items) {
    if (item.kind === "tiny-fan") {
      const fanCenter = getDesktopItemCenter(item, bounds, now);
      const dx = petCenter.x - fanCenter.x;
      const dy = petCenter.y - fanCenter.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      if (dist < 210) {
        const windX = Math.cos(item.angle);
        const windY = Math.sin(item.angle);
        const alignment = (dx / dist) * windX + (dy / dist) * windY;
        if (item.active && alignment > 0.1 && dist < 190) {
          target = pushAwayTarget(current, fanCenter, 132 + pet.trauma * 0.8, bounds);
          speedMultiplier *= 1.28;
        } else {
          speedMultiplier *= 0.9;
        }
      }
    } else if (item.kind === "hanging-light") {
      const center = getDesktopItemCenter(item, bounds, now);
      const dist = Math.hypot(petCenter.x - center.x, petCenter.y - center.y);
      if (dist < 220) {
        if (item.variant === "disco") {
          speedMultiplier *= 1.02 + Math.sin(now / 180) * 0.08;
        } else if (item.variant === "moon") {
          speedMultiplier *= 0.92;
          if (pet.energy < 44 && !target) {
            target = { x: center.x - PET_W / 2, y: center.y + 58 };
          }
        } else {
          speedMultiplier *= 1.05;
        }
      }
    } else if (item.kind === "sticky-note") {
      const rect = getDesktopItemRect(item, bounds, now);
      const stickyRect = {
        x: rect.x,
        y: rect.y + rect.height * 0.58,
        width: rect.width,
        height: rect.height * 0.42,
      };
      const petFeet = {
        x: petCenter.x,
        y: current.y + PET_H * 0.92,
      };
      const onPaper = pointInRect(petFeet, rect);
      const onSticky = pointInRect(petFeet, stickyRect);
      if (onSticky) {
        const effectiveStickiness = item.stickiness * (1 - item.stickyWetness * 0.72);
        speedMultiplier *= Math.max(0.16, 1 - effectiveStickiness * 0.74);
        target = pushAwayTarget(current, getDesktopItemCenter(item, bounds, now), 78, bounds);
        if (now - item.lastPetLessonAt > 14_000) {
          const mark = {
            id: `pet-footprint-${now}-${Math.round(Math.random() * 9999)}`,
            x: Math.max(8, Math.min(rect.width - 12, petFeet.x - rect.x)),
            y: Math.max(8, Math.min(rect.height - 12, petFeet.y - rect.y)),
            color: "rgba(58, 42, 33, 0.48)",
            opacity: 0.36 + Math.random() * 0.22,
            createdAt: now,
          };
          nextItems = nextItems.map((entry) =>
            entry.id === item.id && entry.kind === "sticky-note"
              ? {
                  ...entry,
                  marks: [...entry.marks, mark].slice(-40),
                  lastPetLessonAt: now,
                }
              : entry
          );
          changed = true;
        }
      } else if (onPaper && pet.energy < 32) {
        stickyRestItemId = item.id;
        speedMultiplier *= 0.72;
      } else if (onPaper && pet.energy > 58 && Math.random() < 0.012) {
        const center = getDesktopItemCenter(item, bounds, now);
        const dx = petCenter.x - center.x;
        const dy = petCenter.y - center.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        nextItems = nextItems.map((entry) =>
          entry.id === item.id && entry.kind === "sticky-note"
            ? {
                ...entry,
                x: Math.max(0, Math.min(bounds.width - rect.width, entry.x + (dx / length) * 8)),
                y: Math.max(0, Math.min(bounds.height - rect.height, entry.y + (dy / length) * 6)),
              }
            : entry
        );
        changed = true;
      }
    } else if (item.kind === "portal-gun") {
      const gunCenter = getDesktopItemCenter(item, bounds, now);
      const dist = Math.hypot(petCenter.x - gunCenter.x, petCenter.y - gunCenter.y);
      if (dist < 190) {
        target = pushAwayTarget(current, gunCenter, 150 + pet.trauma * 0.9, bounds);
        speedMultiplier *= 1.16;
      }
    } else if (item.kind === "portal") {
      const portalCenter = getDesktopItemCenter(item, bounds, now);
      const dist = Math.hypot(petCenter.x - portalCenter.x, petCenter.y - portalCenter.y);
      if (dist < 128) {
        target = pushAwayTarget(current, portalCenter, 104, bounds);
        speedMultiplier *= 1.08;
      }
    }
  }

  return { target, speedMultiplier, items: nextItems, changed, stickyRestItemId };
}
