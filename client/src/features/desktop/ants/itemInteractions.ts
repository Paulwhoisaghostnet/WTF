import {
  pointInRect,
} from "../DesktopPetModel";
import {
  getDesktopItemCenter,
  getDesktopItemRect,
  type DesktopItemState,
} from "../items/model";
import {
  resolvePortalTransit,
} from "../materials";
import type { AntState } from "./model";

export interface AntItemInteractionResult {
  ant: AntState;
  speedMultiplier: number;
  stuck: boolean;
}

function antFootCoverage(ant: AntState, rect: { x: number; y: number; width: number; height: number }) {
  const feet = [
    { x: ant.x - 4, y: ant.y + 3 },
    { x: ant.x, y: ant.y + 5 },
    { x: ant.x + 4, y: ant.y + 3 },
  ];
  const touching = feet.filter((foot) => pointInRect(foot, rect)).length;
  return touching / feet.length;
}

export function applyAntItemInteractions({
  ant,
  items,
  bounds,
  now,
}: {
  ant: AntState;
  items: DesktopItemState[];
  bounds: { width: number; height: number };
  now: number;
}): AntItemInteractionResult {
  let nextAnt = ant;
  let speedMultiplier = 1;
  let stuck = false;

  if ((nextAnt.stuckUntil ?? 0) > now) {
    return { ant: nextAnt, speedMultiplier: 0, stuck: true };
  }

  const portals = items
    .filter((item): item is Extract<DesktopItemState, { kind: "portal" }> => item.kind === "portal")
    .map((portal) => {
      const rect = getDesktopItemRect(portal, bounds, now);
      return { ...portal, width: rect.width, height: rect.height };
    });
  if (portals.length >= 2) {
    const transit = resolvePortalTransit({
      body: { x: nextAnt.x, y: nextAnt.y },
      portals,
      bounds,
      now,
      lastTransitAt: nextAnt.lastPortalTransitAt,
      cooldownMs: 1400,
    });
    if (transit.transited) {
      nextAnt = {
        ...nextAnt,
        x: transit.body.x,
        y: transit.body.y,
        lastPortalTransitAt: transit.lastTransitAt,
        angle: nextAnt.angle + Math.PI,
      };
      speedMultiplier *= 1.18;
    }
  }

  for (const item of items) {
    if (item.kind === "sticky-note") {
      const rect = getDesktopItemRect(item, bounds, now);
      const stickyRect = {
        x: rect.x,
        y: rect.y + rect.height * 0.58,
        width: rect.width,
        height: rect.height * 0.42,
      };
      const coverage = antFootCoverage(nextAnt, stickyRect);
      if (coverage > 0) {
        const effectiveStickiness = item.stickiness * (1 - item.stickyWetness * 0.8);
        const glueLoad = Math.min(1, (nextAnt.glueLoad ?? 0) + coverage * effectiveStickiness * 0.18);
        const escapeChance = Math.max(0.12, 0.72 - glueLoad - coverage * 0.22);
        if (glueLoad > 0.58 && Math.random() > escapeChance) {
          stuck = true;
          nextAnt = {
            ...nextAnt,
            glueLoad,
            stuckUntil: now + 650 + Math.random() * 2400,
            angle: nextAnt.angle + (Math.random() - 0.5) * 1.4,
          };
          speedMultiplier = 0;
        } else {
          nextAnt = { ...nextAnt, glueLoad };
          speedMultiplier *= Math.max(0.08, 1 - coverage * effectiveStickiness * 0.88);
        }
      } else if ((nextAnt.glueLoad ?? 0) > 0) {
        nextAnt = { ...nextAnt, glueLoad: Math.max(0, (nextAnt.glueLoad ?? 0) - 0.03) };
      }
    } else if (item.kind === "tiny-fan" && item.active) {
      const fanCenter = getDesktopItemCenter(item, bounds, now);
      const dx = nextAnt.x - fanCenter.x;
      const dy = nextAnt.y - fanCenter.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      if (dist < 156) {
        const windX = Math.cos(item.angle);
        const windY = Math.sin(item.angle);
        const alignment = (dx / dist) * windX + (dy / dist) * windY;
        if (alignment > 0.14) {
          const force = (1 - dist / 156) * alignment;
          nextAnt = {
            ...nextAnt,
            x: Math.max(-14, Math.min(bounds.width + 14, nextAnt.x + windX * force * 7)),
            y: Math.max(-14, Math.min(bounds.height + 14, nextAnt.y + windY * force * 7)),
            angle: Math.atan2(windY, windX),
          };
          speedMultiplier *= Math.max(0.35, 1 - force * 0.38);
        }
      }
    } else if (item.kind === "hanging-light") {
      const lightCenter = getDesktopItemCenter(item, bounds, now);
      const dist = Math.hypot(nextAnt.x - lightCenter.x, nextAnt.y - lightCenter.y);
      if (dist < 170) {
        if (item.variant === "disco") {
          speedMultiplier *= 0.82 + Math.random() * 0.42;
          nextAnt = { ...nextAnt, angle: nextAnt.angle + (Math.random() - 0.5) * 0.42 };
        } else if (item.variant === "moon") {
          speedMultiplier *= 0.88;
        } else {
          speedMultiplier *= 1.08;
        }
      }
    }
  }

  return { ant: nextAnt, speedMultiplier, stuck };
}
