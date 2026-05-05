import type { DesktopWorldEdge, DesktopWorldVisitor } from "@shared/desktop";
import { seededUnit } from "../geometry";
import {
  distance,
  pointInRect,
  type DesktopObstacle,
} from "../DesktopPetModel";
import {
  getDropCenter,
  type PetDrop,
} from "../drops";
import {
  ANT_SIZE,
  type AntColony,
  type AntColonySide,
  type AntState,
  type PheromonePoint,
} from "./model";

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

function inflateRect(rect: DesktopObstacle, amount: number) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function segmentHitsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: DesktopObstacle,
  padding = 10
) {
  const padded = inflateRect(rect, padding);
  if (pointInRect(a, padded) || pointInRect(b, padded)) return true;
  for (let i = 1; i < 14; i += 1) {
    const t = i / 14;
    if (
      pointInRect(
        {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        },
        padded
      )
    ) {
      return true;
    }
  }
  return false;
}

function chooseObstacleDetour(
  a: { x: number; y: number },
  b: { x: number; y: number },
  obstacle: DesktopObstacle,
  bounds: { width: number; height: number }
) {
  const padded = inflateRect(obstacle, 16);
  const candidates = [
    { x: padded.x, y: padded.y },
    { x: padded.x + padded.width, y: padded.y },
    { x: padded.x, y: padded.y + padded.height },
    { x: padded.x + padded.width, y: padded.y + padded.height },
    { x: padded.x - 10, y: a.y },
    { x: padded.x + padded.width + 10, y: a.y },
    { x: a.x, y: padded.y - 10 },
    { x: a.x, y: padded.y + padded.height + 10 },
  ]
    .map((point) => ({
      x: Math.max(2, Math.min(Math.max(2, bounds.width - 2), point.x)),
      y: Math.max(2, Math.min(Math.max(2, bounds.height - 2), point.y)),
    }))
    .filter((point) => !pointInRect(point, padded));

  return candidates.reduce((best, candidate) => {
    const bestScore = distance(a, best) + distance(best, b);
    const candidateScore = distance(a, candidate) + distance(candidate, b);
    return candidateScore < bestScore ? candidate : best;
  }, candidates[0] ?? a);
}

export function buildAntRoute(
  start: { x: number; y: number },
  end: { x: number; y: number },
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number }
) {
  const route = [start, end];
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i];
      const b = route[i + 1];
      const obstacle = obstacles.find((candidate) => segmentHitsRect(a, b, candidate));
      if (!obstacle) continue;
      route.splice(i + 1, 0, chooseObstacleDetour(a, b, obstacle, bounds));
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return route.slice(1);
}

export function createAntColony(bounds: { width: number; height: number }): AntColony {
  const sides: AntColonySide[] = ["top", "right", "bottom", "left"];
  const side = sides[Math.floor(Math.random() * sides.length)];
  const insetX = 24 + Math.random() * Math.max(1, bounds.width - 48);
  const insetY = 24 + Math.random() * Math.max(1, bounds.height - 48);
  if (side === "top") {
    return { x: insetX, y: -ANT_SIZE * 3, side, boundsWidth: bounds.width, boundsHeight: bounds.height };
  }
  if (side === "right") {
    return {
      x: bounds.width + ANT_SIZE * 3,
      y: insetY,
      side,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
    };
  }
  if (side === "bottom") {
    return {
      x: insetX,
      y: bounds.height + ANT_SIZE * 3,
      side,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
    };
  }
  return { x: -ANT_SIZE * 3, y: insetY, side, boundsWidth: bounds.width, boundsHeight: bounds.height };
}

function antColonyEntrance(colony: AntColony) {
  const spread = 34;
  const jitter = () => (Math.random() - 0.5) * spread;
  if (colony.side === "top" || colony.side === "bottom") {
    return { x: colony.x + jitter(), y: colony.y + (Math.random() - 0.5) * 8 };
  }
  return { x: colony.x + (Math.random() - 0.5) * 8, y: colony.y + jitter() };
}

function randomAntExploreTarget(bounds: { width: number; height: number }) {
  return {
    x: 20 + Math.random() * Math.max(1, bounds.width - 40),
    y: 20 + Math.random() * Math.max(1, bounds.height - 40),
  };
}

export function buildAntExploreRoute(
  start: { x: number; y: number },
  foods: PetDrop[],
  trails: PheromonePoint[],
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number }
) {
  const liveFoodIds = new Set(foods.map((food) => food.id));
  const liveTrails = trails
    .filter((trail) => liveFoodIds.has(trail.foodId))
    .sort((a, b) => b.foodDistance - a.foodDistance)
    .slice(0, 12);
  const trailTarget =
    liveTrails.length > 0 && Math.random() < 0.68
      ? liveTrails[Math.floor(Math.random() * liveTrails.length)]
      : null;
  const target = trailTarget ? { x: trailTarget.x, y: trailTarget.y } : randomAntExploreTarget(bounds);
  return buildAntRoute(start, target, obstacles, bounds);
}

export function chooseDiscoveredFood(
  ant: AntState,
  foods: PetDrop[],
  trails: PheromonePoint[]
) {
  const current = { x: ant.x, y: ant.y };
  const visibleFood = foods
    .map((food) => ({ food, distance: distance(current, getDropCenter(food)) }))
    .filter((item) => item.distance < 82)
    .sort((a, b) => a.distance - b.distance)[0]?.food;
  if (visibleFood) return visibleFood;

  const liveFoodById = new Map(foods.map((food) => [food.id, food]));
  const nearbyTrail = trails
    .filter((trail) => liveFoodById.has(trail.foodId))
    .map((trail) => ({ trail, distance: distance(current, trail) }))
    .filter((item) => item.distance < 48)
    .sort((a, b) => a.distance - b.distance)[0]?.trail;
  return nearbyTrail ? liveFoodById.get(nearbyTrail.foodId) ?? null : null;
}

export function buildTrailRoute(
  start: { x: number; y: number },
  food: PetDrop,
  trails: PheromonePoint[],
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number }
) {
  const foodCenter = getDropCenter(food);
  const trail = trails
    .filter((point) => point.foodId === food.id)
    .sort((a, b) => b.foodDistance - a.foodDistance)
    .slice(0, 24);

  if (trail.length < 4) return buildAntRoute(start, foodCenter, obstacles, bounds);

  const closestIndex = trail.reduce((bestIndex, point, index) => {
    const best = trail[bestIndex];
    return distance(start, point) < distance(start, best) ? index : bestIndex;
  }, 0);
  const trailPoints = trail
    .slice(closestIndex)
    .sort((a, b) => b.foodDistance - a.foodDistance)
    .map((point) => ({ x: point.x, y: point.y }));
  const firstLeg = buildAntRoute(start, trailPoints[0] ?? foodCenter, obstacles, bounds);
  return [...firstLeg, ...trailPoints.slice(1), foodCenter];
}

export function spawnDesktopAnt(
  foods: PetDrop[],
  trails: PheromonePoint[],
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number },
  colony: AntColony
): AntState | null {
  if (foods.length === 0) return null;
  const spawn = antColonyEntrance(colony);
  const path = buildAntExploreRoute(spawn, foods, trails, obstacles, bounds);
  const now = Date.now();
  return {
    id: `ant-${now}-${Math.round(Math.random() * 99999)}`,
    x: spawn.x,
    y: spawn.y,
    spawnX: colony.x,
    spawnY: colony.y,
    targetFoodId: null,
    phase: "exploring",
    phaseStartedAt: now,
    path,
    pathIndex: 0,
    angle: 0,
    carrying: false,
    lastTrailAt: 0,
    lastRetargetAt: 0,
  };
}

export function spawnWorldAnt(
  visitor: DesktopWorldVisitor,
  foods: PetDrop[],
  trails: PheromonePoint[],
  obstacles: DesktopObstacle[],
  bounds: { width: number; height: number }
): AntState | null {
  const spawn = edgePoint(visitor.entryEdge, bounds, visitor.seed, ANT_SIZE, 1);
  const exit = edgePoint(visitor.exitEdge, bounds, visitor.seed, ANT_SIZE, 2);
  const now = Date.now();
  const targetFood =
    visitor.role === "forage"
      ? foods.find((drop) => drop.id === visitor.targetDropId) ?? foods[0]
      : undefined;
  if (visitor.role === "forage" && targetFood) {
    return {
      id: `world-ant-${visitor.id}`,
      x: spawn.x,
      y: spawn.y,
      spawnX: exit.x,
      spawnY: exit.y,
      targetFoodId: targetFood.id,
      phase: "seeking",
      phaseStartedAt: now,
      path: buildTrailRoute(spawn, targetFood, trails, obstacles, bounds),
      pathIndex: 0,
      angle: 0,
      carrying: false,
      lastTrailAt: 0,
      lastRetargetAt: now,
      worldVisitorId: visitor.id,
    };
  }

  return {
    id: `world-ant-${visitor.id}`,
    x: spawn.x,
    y: spawn.y,
    spawnX: exit.x,
    spawnY: exit.y,
    targetFoodId: null,
    phase: "passing",
    phaseStartedAt: now,
    path: buildAntRoute(spawn, exit, obstacles, bounds),
    pathIndex: 0,
    angle: 0,
    carrying: false,
    lastTrailAt: 0,
    lastRetargetAt: now,
    worldVisitorId: visitor.id,
  };
}
