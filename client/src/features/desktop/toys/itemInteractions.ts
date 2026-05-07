import { clampFloatingPosition } from "../geometry";
import {
  distance,
  pointInRect,
} from "../DesktopPetModel";
import {
  createDesktopMessDrop,
} from "../drops/itemInteractions";
import type { PetDrop } from "../drops/model";
import {
  getDesktopItemCenter,
  getDesktopItemRect,
  type DesktopItemState,
} from "../items/model";
import {
  resolvePortalTransit,
} from "../materials";
import {
  BALL_SIZE,
  getToyCenter,
  type PetToyState,
} from "./model";

export function applyBallItemInteractions({
  toy,
  items,
  bounds,
  now,
  addMess,
}: {
  toy: PetToyState;
  items: DesktopItemState[];
  bounds: { width: number; height: number };
  now: number;
  addMess?: (drop: PetDrop) => void;
}) {
  let nextToy = toy;
  let center = getToyCenter(toy);
  const portals = items
    .filter((item): item is Extract<DesktopItemState, { kind: "portal" }> => item.kind === "portal")
    .map((portal) => {
      const rect = getDesktopItemRect(portal, bounds, now);
      return { ...portal, width: rect.width, height: rect.height };
    });
  if (portals.length >= 2) {
    const transit = resolvePortalTransit({
      body: { x: center.x, y: center.y, vx: nextToy.vx, vy: nextToy.vy },
      portals,
      bounds,
      now,
      lastTransitAt: nextToy.lastPortalTransitAt,
    });
    if (transit.transited) {
      nextToy = {
        ...nextToy,
        x: transit.body.x - BALL_SIZE / 2,
        y: transit.body.y - BALL_SIZE / 2,
        vx: transit.body.vx ?? nextToy.vx,
        vy: transit.body.vy ?? nextToy.vy,
        lastPortalTransitAt: transit.lastTransitAt,
      };
      center = getToyCenter(nextToy);
    }
  }

  for (const item of items) {
    if (item.kind === "tiny-fan" && item.active) {
      const fanCenter = getDesktopItemCenter(item, bounds, now);
      const dx = center.x - fanCenter.x;
      const dy = center.y - fanCenter.y;
      const range = 178;
      const dist = Math.max(1, Math.hypot(dx, dy));
      if (dist < range) {
        const windX = Math.cos(item.angle);
        const windY = Math.sin(item.angle);
        const alignment = (dx / dist) * windX + (dy / dist) * windY;
        if (alignment > 0.2) {
          const force = (1 - dist / range) * alignment * 92;
          nextToy = {
            ...nextToy,
            vx: nextToy.vx + windX * force,
            vy: nextToy.vy + windY * force,
          };
        }
      }
    } else if (item.kind === "sticky-note") {
      const rect = getDesktopItemRect(item, bounds, now);
      const stickyBand = {
        x: rect.x,
        y: rect.y + rect.height * 0.62,
        width: rect.width,
        height: rect.height * 0.38,
      };
      const overPaper = pointInRect(center, rect);
      const overSticky = pointInRect(center, stickyBand);
      if (overPaper) {
        const glue = overSticky ? item.stickiness * (1 - item.stickyWetness * 0.75) : 0.2;
        nextToy = {
          ...nextToy,
          vx: nextToy.vx * (1 - Math.min(0.72, glue * 0.25)),
          vy: nextToy.vy * (1 - Math.min(0.72, glue * 0.25)),
        };
        if ((nextToy.dirtiness ?? 0) > 0.12 && addMess && now - (nextToy.lastSmearAt ?? 0) > 900) {
          addMess(
            createDesktopMessDrop(center, {
              idPrefix: "note-ball-mark",
              messiness: Math.min(0.42, nextToy.dirtiness ?? 0.2),
              radius: 22,
              now,
            })
          );
          nextToy = {
            ...nextToy,
            dirtiness: Math.max(0, (nextToy.dirtiness ?? 0) - 0.12),
            lastSmearAt: now,
          };
        }
      }
    }
  }

  return {
    ...nextToy,
    ...clampFloatingPosition(nextToy, bounds, BALL_SIZE, BALL_SIZE),
  };
}

export function dirtyBallFromDrop(
  toy: PetToyState,
  drop: PetDrop,
  now: number
) {
  if (drop.kind !== "poop" && drop.kind !== "mess" && drop.kind !== "food") return toy;
  const dirtyGain = drop.kind === "poop" ? 0.36 : drop.kind === "food" ? 0.12 : 0.18;
  return {
    ...toy,
    dirtiness: Math.min(1, (toy.dirtiness ?? 0) + dirtyGain),
    lastMessAt: now,
  };
}

export function shouldBallSmear(toy: PetToyState, now: number) {
  return (toy.dirtiness ?? 0) > 0.18 && Math.hypot(toy.vx, toy.vy) > 24 && now - (toy.lastSmearAt ?? 0) > 1300;
}

export function ballSmearDrop(toy: PetToyState, now: number) {
  return createDesktopMessDrop(getToyCenter(toy), {
    idPrefix: "ball-smear",
    messiness: Math.min(0.5, Math.max(0.12, toy.dirtiness ?? 0.22)),
    radius: 22 + Math.min(26, Math.hypot(toy.vx, toy.vy) * 0.04),
    now,
  });
}

export function markStickyNotesFromDirtyBall({
  toy,
  items,
  bounds,
  now,
}: {
  toy: PetToyState;
  items: DesktopItemState[];
  bounds: { width: number; height: number };
  now: number;
}) {
  if ((toy.dirtiness ?? 0) <= 0.1 || now - (toy.lastSmearAt ?? 0) < 900) {
    return { toy, items, changed: false };
  }
  const center = getToyCenter(toy);
  let marked = false;
  const nextItems = items.map((item) => {
    if (item.kind !== "sticky-note" || marked) return item;
    const rect = getDesktopItemRect(item, bounds, now);
    if (!pointInRect(center, rect)) return item;
    marked = true;
    return {
      ...item,
      marks: [
        ...item.marks,
        {
          id: `ball-note-mark-${now}-${Math.round(Math.random() * 9999)}`,
          x: center.x - rect.x,
          y: center.y - rect.y,
          color: "rgba(74, 55, 38, 0.52)",
          opacity: Math.min(0.82, 0.28 + (toy.dirtiness ?? 0) * 0.42),
          createdAt: now,
        },
      ].slice(-40),
    };
  });
  if (!marked) return { toy, items, changed: false };
  return {
    toy: {
      ...toy,
      dirtiness: Math.max(0, (toy.dirtiness ?? 0) - 0.1),
      lastSmearAt: now,
    },
    items: nextItems,
    changed: true,
  };
}

export function distanceFromToyToItem(toy: PetToyState, item: DesktopItemState, bounds: { width: number; height: number }, now: number) {
  return distance(getToyCenter(toy), getDesktopItemCenter(item, bounds, now));
}
