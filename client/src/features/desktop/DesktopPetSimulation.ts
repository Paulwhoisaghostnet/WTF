import { clampFloatingPosition } from "./geometry";
import {
  PET_H,
  PET_W,
  distance,
  type DefensiveTarget,
  type VisitingPetState,
} from "./DesktopPetModel";
import type { AntState } from "./ants/model";
import { getToyCenter, type PetToyState } from "./toys";

export function randomHamsterTarget(bounds: { width: number; height: number }) {
  return clampFloatingPosition(
    {
      x: 96 + Math.random() * Math.max(1, bounds.width - PET_W - 160),
      y: 58 + Math.random() * Math.max(1, bounds.height - PET_H - 140),
    },
    bounds,
    PET_W,
    PET_H + 22
  );
}

export function chooseDefensiveTarget(
  current: { x: number; y: number },
  trauma: number,
  ants: AntState[],
  toys: PetToyState[],
  visitors: VisitingPetState[]
): DefensiveTarget | null {
  if (trauma < 24) return null;
  const petCenter = { x: current.x + PET_W / 2, y: current.y + PET_H * 0.5 };
  const radius = 82 + trauma * 1.9;
  const candidates: DefensiveTarget[] = [
    ...ants.map((ant) => ({ kind: "ant" as const, id: ant.id, x: ant.x, y: ant.y })),
    ...toys
      .filter((toy) => Math.hypot(toy.vx, toy.vy) > 7)
      .map((toy) => {
        const center = getToyCenter(toy);
        return { kind: "toy" as const, id: toy.id, x: center.x, y: center.y };
      }),
    ...visitors.map((visitor) => ({
      kind: "visitor" as const,
      id: visitor.id,
      x: visitor.x + PET_W / 2,
      y: visitor.y + PET_H * 0.5,
    })),
  ];
  return candidates
    .map((candidate) => ({
      candidate,
      distance: distance(petCenter, candidate),
    }))
    .filter((entry) => entry.distance <= radius)
    .sort((a, b) => a.distance - b.distance)[0]?.candidate ?? null;
}
