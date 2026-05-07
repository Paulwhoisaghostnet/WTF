export const FOOD_SERVINGS = 20;
export const WATER_ABSORB_MS = 110_000;

export type PetDropKind = "food" | "water" | "poop" | "pillow" | "skeleton" | "mess";

export interface PetDrop {
  id: string;
  kind: PetDropKind;
  x: number;
  y: number;
  servings?: number;
  messiness?: number;
  radius?: number;
  color?: string;
  createdAt?: number;
}

export function getDropSize(kind: PetDropKind) {
  if (kind === "poop") return 30;
  if (kind === "pillow") return 46;
  if (kind === "skeleton") return 48;
  if (kind === "mess") return 48;
  return 36;
}

export function getDropCenter(drop: PetDrop) {
  const size = drop.kind === "mess" ? drop.radius ?? getDropSize(drop.kind) : getDropSize(drop.kind);
  return { x: drop.x + size / 2, y: drop.y + size / 2 };
}
