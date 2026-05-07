import {
  distance,
} from "../DesktopPetModel";
import { getDesktopItemCenter, type DesktopItemState } from "../items/model";
import {
  getDropCenter,
  type PetDrop,
} from "./model";

export type DesktopCleaningTool = "mop" | "vacuum";

export function createDesktopMessDrop(
  position: { x: number; y: number },
  options: {
    idPrefix?: string;
    color?: string;
    messiness?: number;
    radius?: number;
    now?: number;
  } = {}
): PetDrop {
  const now = options.now ?? Date.now();
  const radius = Math.max(16, Math.min(92, options.radius ?? 32));
  return {
    id: `${options.idPrefix ?? "mess"}-${now}-${Math.round(Math.random() * 9999)}`,
    kind: "mess",
    x: position.x - radius / 2,
    y: position.y - radius / 2,
    createdAt: now,
    messiness: Math.max(0.08, Math.min(1, options.messiness ?? 0.76)),
    radius,
    color: options.color ?? "rgba(89, 70, 48, 0.62)",
  };
}

export function cleanMessDropWithTool(
  drop: PetDrop,
  tool: DesktopCleaningTool,
  now = Date.now()
): PetDrop | null {
  if (drop.kind !== "mess") return drop;
  if (tool === "vacuum") return null;
  const nextMessiness = Math.max(0, (drop.messiness ?? 0.76) - 0.34);
  if (nextMessiness <= 0.05) return null;
  return {
    ...drop,
    x: drop.x + (Math.random() - 0.5) * 18,
    y: drop.y + (Math.random() - 0.5) * 12,
    radius: Math.min(104, (drop.radius ?? 36) + 12),
    messiness: nextMessiness,
    createdAt: now,
  };
}

export function cleanDesktopMessesAtPoint(
  drops: PetDrop[],
  point: { x: number; y: number },
  tool: DesktopCleaningTool,
  now = Date.now()
) {
  let cleaned = false;
  const nextDrops = drops.flatMap((drop) => {
    if (drop.kind !== "mess") return [drop];
    const reach = tool === "vacuum" ? 34 : 42;
    const radius = (drop.radius ?? 36) / 2;
    if (distance(point, getDropCenter(drop)) > radius + reach) return [drop];
    cleaned = true;
    const nextDrop = cleanMessDropWithTool(drop, tool, now);
    return nextDrop ? [nextDrop] : [];
  });
  return { drops: nextDrops, cleaned };
}

export function diluteMessesWithWater(drops: PetDrop[], now = Date.now()) {
  const waterDrops = drops.filter((drop) => drop.kind === "water");
  if (waterDrops.length === 0) return drops;
  let changed = false;
  const nextDrops = drops.flatMap((drop) => {
    if (drop.kind !== "mess") return [drop];
    const messCenter = getDropCenter(drop);
    const wet = waterDrops.find((water) => distance(messCenter, getDropCenter(water)) < (drop.radius ?? 42) * 0.72);
    if (!wet) return [drop];
    changed = true;
    const nextMessiness = Math.max(0, (drop.messiness ?? 0.76) - 0.14);
    if (nextMessiness <= 0.04) return [];
    return [
      {
        ...drop,
        radius: Math.min(112, (drop.radius ?? 42) + 14),
        messiness: nextMessiness,
        color: "rgba(80, 68, 55, 0.38)",
        createdAt: now,
      },
    ];
  });
  return changed ? nextDrops : drops;
}

export function applyToolItemCleaning(
  items: DesktopItemState[],
  drops: PetDrop[],
  bounds: { width: number; height: number },
  now = Date.now()
) {
  let nextDrops = drops;
  let nextItems = items;
  let changed = false;
  for (const item of items) {
    if (item.kind !== "mop" && item.kind !== "vacuum") continue;
    if (item.kind === "mop" && item.usesLeft <= 0) continue;
    const center = getDesktopItemCenter(item, bounds, now);
    const result = cleanDesktopMessesAtPoint(nextDrops, center, item.kind, now);
    if (!result.cleaned) continue;
    changed = true;
    nextDrops = result.drops;
    nextItems = nextItems.map((entry) => {
      if (entry.id !== item.id) return entry;
      if (entry.kind === "mop") {
        return {
          ...entry,
          usesLeft: Math.max(0, entry.usesLeft - 1),
          dirty: Math.min(1, entry.dirty + 0.34),
        };
      }
      if (entry.kind === "vacuum") {
        return { ...entry, charge: Math.max(0, entry.charge - 0.02) };
      }
      return entry;
    });
  }
  return changed ? { items: nextItems, drops: nextDrops } : { items, drops };
}
