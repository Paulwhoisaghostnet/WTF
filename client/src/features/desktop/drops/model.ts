export const FOOD_SERVINGS = 20;
export const WATER_ABSORB_MS = 110_000;

export type PetDropKind = "food" | "water" | "poop" | "pillow" | "skeleton";

export interface PetDrop {
  id: string;
  kind: PetDropKind;
  x: number;
  y: number;
  servings?: number;
  createdAt?: number;
}

export function getDropSize(kind: PetDropKind) {
  if (kind === "poop") return 30;
  if (kind === "pillow") return 46;
  if (kind === "skeleton") return 48;
  return 36;
}

export function getDropCenter(drop: PetDrop) {
  const size = getDropSize(drop.kind);
  return { x: drop.x + size / 2, y: drop.y + size / 2 };
}
