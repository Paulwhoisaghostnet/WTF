import type { DesktopWorldEdge, HamsterColorSchemeKey } from "@shared/desktop";

export const PET_W = 88;
export const PET_H = 70;

export interface DesktopObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisitingPetState {
  id: string;
  x: number;
  y: number;
  facing: "left" | "right";
  path: Array<{ x: number; y: number }>;
  pathIndex: number;
  schemeKey: HamsterColorSchemeKey;
  label: string;
  createdAt: number;
  ttlMs: number;
  worldVisitorId: string;
}

export interface EscapeTunnelState {
  edge: DesktopWorldEdge;
  openUntil: number;
}

export interface WalkaboutSignpostState {
  x: number;
  y: number;
  until: number;
}

export interface ScentScratchState {
  edge: DesktopWorldEdge;
  target: { x: number; y: number };
  focusUntil: number;
  nextScratchAt: number;
  nextEscapeAttemptAt: number;
}

export type DefensiveTarget =
  | { kind: "ant"; id: string; x: number; y: number }
  | { kind: "toy"; id: string; x: number; y: number }
  | { kind: "visitor"; id: string; x: number; y: number };

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointInRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
