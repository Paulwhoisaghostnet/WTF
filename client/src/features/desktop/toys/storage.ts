import { clampFloatingPosition } from "../geometry";
import {
  BALL_SIZE,
  MAX_TOY_BALLS,
  type EscapedBallSlot,
  type PetToyState,
} from "./model";

export function clampHexColor(value: unknown, fallback = "#f047a6") {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

export function seededBallColor(seed: number) {
  const colors = ["#f047a6", "#26c6da", "#ffe156", "#7bd88f", "#ff6b35", "#8b5cf6"];
  return colors[Math.abs(seed) % colors.length] ?? "#f047a6";
}

export function normalizePetToys(value: unknown, bounds: { width: number; height: number }) {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .filter((item): item is Partial<PetToyState> => {
      if (!item || typeof item !== "object") return false;
      const toy = item as Partial<PetToyState>;
      return (
        toy.kind === "ball" &&
        typeof toy.id === "string" &&
        Number.isFinite(Number(toy.x)) &&
        Number.isFinite(Number(toy.y))
      );
    })
    .slice(0, MAX_TOY_BALLS * 3)
    .map((toy) => {
      const position = clampFloatingPosition(
        { x: Number(toy.x), y: Number(toy.y) },
        bounds,
        BALL_SIZE,
        BALL_SIZE
      );
      return {
        id: toy.id!.slice(0, 96),
        kind: "ball" as const,
        x: position.x,
        y: position.y,
        vx: Math.max(-260, Math.min(260, Number(toy.vx) || 0)),
        vy: Math.max(-260, Math.min(260, Number(toy.vy) || 0)),
        color: clampHexColor(toy.color),
        owner: toy.owner === "visitor" ? "visitor" as const : "local" as const,
        createdAt: Number.isFinite(Number(toy.createdAt)) ? Number(toy.createdAt) : now,
        lastPetHitAt: 0,
        lastMessAt: 0,
        dirtiness: Math.max(0, Math.min(1, Number(toy.dirtiness) || 0)),
        lastSmearAt: Number.isFinite(Number(toy.lastSmearAt)) ? Number(toy.lastSmearAt) : 0,
        worldVisitorId: typeof toy.worldVisitorId === "string" ? toy.worldVisitorId.slice(0, 120) : undefined,
      };
    });
}

export function normalizeEscapedBallSlots(value: unknown) {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .filter((item): item is Partial<EscapedBallSlot> => {
      if (!item || typeof item !== "object") return false;
      return typeof item.id === "string" && Number.isFinite(Number(item.until));
    })
    .map((slot) => ({
      id: slot.id!.slice(0, 96),
      until: Number(slot.until),
    }))
    .filter((slot) => slot.until > now)
    .slice(0, MAX_TOY_BALLS);
}
