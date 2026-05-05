export const BALL_SIZE = 30;
export const MAX_TOY_BALLS = 3;
export const TOY_WORLD_SLOT_RESERVE_MS = 120_000;

export interface PetToyState {
  id: string;
  kind: "ball";
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  owner: "local" | "visitor";
  createdAt: number;
  lastPetHitAt: number;
  lastMessAt: number;
  worldVisitorId?: string;
}

export interface EscapedBallSlot {
  id: string;
  until: number;
}

export function getToyCenter(toy: PetToyState) {
  return { x: toy.x + BALL_SIZE / 2, y: toy.y + BALL_SIZE / 2 };
}
