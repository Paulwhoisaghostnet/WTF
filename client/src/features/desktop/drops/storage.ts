import { clampFloatingPosition } from "../geometry";
import {
  FOOD_SERVINGS,
  getDropSize,
  type PetDrop,
} from "./model";

export function normalizePetDrops(value: unknown, bounds: { width: number; height: number }) {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .filter((item): item is PetDrop => {
      if (!item || typeof item !== "object") return false;
      const drop = item as Partial<PetDrop>;
      return (
        typeof drop.id === "string" &&
        (drop.kind === "food" ||
          drop.kind === "water" ||
          drop.kind === "poop" ||
          drop.kind === "pillow" ||
          drop.kind === "skeleton") &&
        Number.isFinite(Number(drop.x)) &&
        Number.isFinite(Number(drop.y))
      );
    })
    .slice(0, 36)
    .map((drop) => {
      const size = getDropSize(drop.kind);
      return {
        id: drop.id.slice(0, 80),
        kind: drop.kind,
        servings:
          drop.kind === "food"
            ? Math.max(1, Math.min(FOOD_SERVINGS, Math.round(Number(drop.servings) || FOOD_SERVINGS)))
            : undefined,
        createdAt:
          drop.kind === "food" || drop.kind === "water"
            ? Number.isFinite(Number(drop.createdAt))
              ? Number(drop.createdAt)
              : now
            : undefined,
        ...clampFloatingPosition({ x: drop.x, y: drop.y }, bounds, size, size),
      };
    });
}
