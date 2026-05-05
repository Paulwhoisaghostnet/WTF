import type { DesktopWorldEdge, DesktopWorldVisitor } from "@shared/desktop";
import { seededUnit } from "../geometry";
import { BALL_SIZE, type PetToyState } from "./model";
import { clampHexColor, seededBallColor } from "./storage";

export function toyEscapeEdge(toy: PetToyState, bounds: { width: number; height: number }): DesktopWorldEdge | null {
  if (toy.x <= -BALL_SIZE * 0.38 && toy.vx < 0) return "left";
  if (toy.x >= bounds.width - BALL_SIZE * 0.62 && toy.vx > 0) return "right";
  if (toy.y <= -BALL_SIZE * 0.38 && toy.vy < 0) return "top";
  if (toy.y >= bounds.height - BALL_SIZE * 0.62 && toy.vy > 0) return "bottom";
  return null;
}

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

function inwardVelocityForEdge(edge: DesktopWorldEdge, speed: number) {
  if (edge === "top") return { vx: 0, vy: speed };
  if (edge === "bottom") return { vx: 0, vy: -speed };
  if (edge === "left") return { vx: speed, vy: 0 };
  return { vx: -speed, vy: 0 };
}

export function spawnWorldBall(
  visitor: DesktopWorldVisitor,
  bounds: { width: number; height: number }
): PetToyState | null {
  if (visitor.kind !== "ball" || visitor.toy?.kind !== "ball") return null;
  const spawn = edgePoint(visitor.entryEdge, bounds, visitor.seed, BALL_SIZE, 7);
  const velocity = inwardVelocityForEdge(visitor.entryEdge, 135 + seededUnit(visitor.seed, 8) * 75);
  return {
    id: `world-ball-${visitor.id}`,
    kind: "ball",
    x: spawn.x,
    y: spawn.y,
    vx: velocity.vx,
    vy: velocity.vy,
    color: clampHexColor(visitor.toy.color, seededBallColor(visitor.seed)),
    owner: "visitor",
    createdAt: Date.now(),
    lastPetHitAt: 0,
    lastMessAt: 0,
    worldVisitorId: visitor.id,
  };
}
