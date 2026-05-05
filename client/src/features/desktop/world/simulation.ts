import type { DesktopWorldEdge, DesktopWorldVisitor } from "@shared/desktop";
import { clampFloatingPosition, seededUnit } from "../geometry";
import {
  PET_H,
  PET_W,
  type VisitingPetState,
} from "../DesktopPetModel";

function edgePoint(
  edge: DesktopWorldEdge,
  bounds: { width: number; height: number },
  seed: number,
  size: number,
  salt = 0
) {
  const t = seededUnit(seed, salt);
  if (edge === "top") return { x: t * Math.max(1, bounds.width - size), y: -size - 4 };
  if (edge === "bottom") return { x: t * Math.max(1, bounds.width - size), y: bounds.height + size + 4 };
  if (edge === "left") return { x: -size - 4, y: t * Math.max(1, bounds.height - size) };
  return { x: bounds.width + size + 4, y: t * Math.max(1, bounds.height - size) };
}

function visibleEdgePoint(
  edge: DesktopWorldEdge,
  bounds: { width: number; height: number },
  seed: number,
  size: number,
  salt = 0
) {
  const t = seededUnit(seed, salt);
  if (edge === "top") return { x: t * Math.max(1, bounds.width - size), y: 2 };
  if (edge === "bottom") return { x: t * Math.max(1, bounds.width - size), y: Math.max(0, bounds.height - size - 2) };
  if (edge === "left") return { x: 2, y: t * Math.max(1, bounds.height - size) };
  return { x: Math.max(0, bounds.width - size - 2), y: t * Math.max(1, bounds.height - size) };
}

export function randomWorldEdge(): DesktopWorldEdge {
  const edges: DesktopWorldEdge[] = ["top", "right", "bottom", "left"];
  return edges[Math.floor(Math.random() * edges.length)] ?? "right";
}

export function offscreenTargetForEdge(edge: DesktopWorldEdge, bounds: { width: number; height: number }) {
  if (edge === "top") return { x: Math.random() * Math.max(1, bounds.width - PET_W), y: -PET_H * 1.2 };
  if (edge === "bottom") return { x: Math.random() * Math.max(1, bounds.width - PET_W), y: bounds.height + PET_H };
  if (edge === "left") return { x: -PET_W * 1.2, y: Math.random() * Math.max(1, bounds.height - PET_H) };
  return { x: bounds.width + PET_W, y: Math.random() * Math.max(1, bounds.height - PET_H) };
}

export function sniffTargetForEdge(edge: DesktopWorldEdge, bounds: { width: number; height: number }) {
  const margin = 6;
  const jitter = 36;
  if (edge === "top") {
    return clampFloatingPosition(
      { x: 40 + Math.random() * Math.max(1, bounds.width - PET_W - 80), y: margin + Math.random() * jitter },
      bounds,
      PET_W,
      PET_H + 22
    );
  }
  if (edge === "bottom") {
    return clampFloatingPosition(
      {
        x: 40 + Math.random() * Math.max(1, bounds.width - PET_W - 80),
        y: bounds.height - PET_H - 30 - Math.random() * jitter,
      },
      bounds,
      PET_W,
      PET_H + 22
    );
  }
  if (edge === "left") {
    return clampFloatingPosition(
      { x: margin + Math.random() * jitter, y: 42 + Math.random() * Math.max(1, bounds.height - PET_H - 98) },
      bounds,
      PET_W,
      PET_H + 22
    );
  }
  return clampFloatingPosition(
    {
      x: bounds.width - PET_W - 12 - Math.random() * jitter,
      y: 42 + Math.random() * Math.max(1, bounds.height - PET_H - 98),
    },
    bounds,
    PET_W,
    PET_H + 22
  );
}

export function scratchCuePosition(
  edge: DesktopWorldEdge,
  position: { x: number; y: number },
  bounds: { width: number; height: number }
) {
  if (edge === "top") return { x: position.x + PET_W * 0.32, y: 4 };
  if (edge === "bottom") return { x: position.x + PET_W * 0.32, y: Math.max(0, bounds.height - 28) };
  if (edge === "left") return { x: 4, y: position.y + PET_H * 0.34 };
  return { x: Math.max(0, bounds.width - 38), y: position.y + PET_H * 0.34 };
}

export function isOffscreenTarget(target: { x: number; y: number }, bounds: { width: number; height: number }) {
  return target.x < 0 || target.y < 0 || target.x > bounds.width - PET_W || target.y > bounds.height - PET_H;
}

export function isAtEdgeForTarget(
  position: { x: number; y: number },
  edge: DesktopWorldEdge,
  bounds: { width: number; height: number }
) {
  if (edge === "top") return position.y <= 2;
  if (edge === "bottom") return position.y >= Math.max(0, bounds.height - PET_H - 24);
  if (edge === "left") return position.x <= 2;
  return position.x >= Math.max(0, bounds.width - PET_W - 2);
}

export function spawnVisitingPet(
  visitor: DesktopWorldVisitor,
  bounds: { width: number; height: number }
): VisitingPetState | null {
  if (visitor.kind !== "guinea-pig") return null;
  const spawn = edgePoint(visitor.entryEdge, bounds, visitor.seed, PET_W, 3);
  const mid = clampFloatingPosition(
    visibleEdgePoint(visitor.entryEdge, bounds, visitor.seed, PET_W, 4),
    bounds,
    PET_W,
    PET_H + 22
  );
  const exit = edgePoint(visitor.exitEdge, bounds, visitor.seed, PET_W, 5);
  return {
    id: `world-pet-${visitor.id}`,
    x: spawn.x,
    y: spawn.y,
    facing: exit.x < spawn.x ? "left" : "right",
    path: [mid, exit],
    pathIndex: 0,
    schemeKey: visitor.colorSchemeKey ?? "golden",
    label: visitor.label ?? "wandering guinea pig",
    createdAt: Date.now(),
    ttlMs: visitor.ttlMs,
    worldVisitorId: visitor.id,
  };
}
