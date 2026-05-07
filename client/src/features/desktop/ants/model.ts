export const ANT_SIZE = 12;
export const PHEROMONE_LIFETIME_MS = 24_000;
export const MAX_PHEROMONES = 180;
export const MAX_DESKTOP_ANTS = 18;

export type AntPhase = "exploring" | "seeking" | "dancing" | "harvesting" | "returning" | "passing";
export type AntColonySide = "top" | "right" | "bottom" | "left";

export interface PheromonePoint {
  id: string;
  foodId: string;
  x: number;
  y: number;
  foodDistance: number;
  createdAt: number;
}

export interface AntState {
  id: string;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  targetFoodId: string | null;
  phase: AntPhase;
  phaseStartedAt: number;
  path: Array<{ x: number; y: number }>;
  pathIndex: number;
  angle: number;
  carrying: boolean;
  lastTrailAt: number;
  lastRetargetAt: number;
  stuckUntil?: number;
  glueLoad?: number;
  lastPortalTransitAt?: number;
  worldVisitorId?: string;
}

export interface AntColony {
  x: number;
  y: number;
  side: AntColonySide;
  boundsWidth: number;
  boundsHeight: number;
}

export function getPheromoneAge(now: number, trail: PheromonePoint) {
  return Math.max(0, Math.min(1, (now - trail.createdAt) / PHEROMONE_LIFETIME_MS));
}
