import { clampFloatingPosition } from "../geometry";
import {
  normalizeMaterialProfile,
  normalizeScaleFactor,
} from "../materials";
import {
  MAX_DESKTOP_ITEMS,
  getDesktopItemSize,
  type DesktopItemState,
  type StickyNoteMark,
  type StickyNoteStroke,
} from "./model";

const LIGHT_VARIANTS = new Set(["disco", "moon", "sun"]);
const ITEM_KINDS = new Set([
  "tiny-fan",
  "hanging-light",
  "sticky-note",
  "mop",
  "vacuum",
  "cursor-tool-tray",
  "train-kit-box",
  "train-track-piece",
  "train-engine",
  "train-car",
  "portal-gun",
  "portal",
  "jukebox",
  "paper-shredder",
  "artifact-icon",
]);
const TRACK_SHAPES = new Set(["straight", "curve", "switch"]);
const TRAIN_ENGINE_VARIANTS = new Set(["starter", "express", "freight"]);
const TRAIN_CAR_VARIANTS = new Set(["boxcar", "flatbed", "caboose"]);
const PORTAL_COLORS = new Set(["blue", "orange"]);

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function normalizeStrokes(value: unknown): StickyNoteStroke[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((stroke): stroke is StickyNoteStroke => {
      if (!stroke || typeof stroke !== "object") return false;
      const candidate = stroke as Partial<StickyNoteStroke>;
      return typeof candidate.id === "string" && Array.isArray(candidate.points);
    })
    .slice(-18)
    .map((stroke) => ({
      id: stroke.id.slice(0, 80),
      color: typeof stroke.color === "string" ? stroke.color.slice(0, 24) : "#263238",
      width: clampNumber(stroke.width, 2, 1, 8),
      points: stroke.points
        .filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
        .slice(-120)
        .map((point) => ({
          x: clampNumber(point.x, 0, -24, 220),
          y: clampNumber(point.y, 0, -24, 180),
        })),
    }))
    .filter((stroke) => stroke.points.length > 0);
}

function normalizeMarks(value: unknown): StickyNoteMark[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .filter((mark): mark is StickyNoteMark => {
      if (!mark || typeof mark !== "object") return false;
      const candidate = mark as Partial<StickyNoteMark>;
      return typeof candidate.id === "string" && Number.isFinite(Number(candidate.x)) && Number.isFinite(Number(candidate.y));
    })
    .slice(-40)
    .map((mark) => ({
      id: mark.id.slice(0, 80),
      x: clampNumber(mark.x, 0, -12, 160),
      y: clampNumber(mark.y, 0, -12, 140),
      color: typeof mark.color === "string" ? mark.color.slice(0, 32) : "rgba(66, 55, 42, 0.55)",
      opacity: clampNumber(mark.opacity, 0.5, 0.08, 0.9),
      createdAt: Number.isFinite(Number(mark.createdAt)) ? Number(mark.createdAt) : now,
    }));
}

export function normalizeDesktopItems(value: unknown, bounds: { width: number; height: number }) {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const normalized: DesktopItemState[] = [];
  for (const raw of value.slice(-MAX_DESKTOP_ITEMS)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<DesktopItemState>;
    if (typeof item.id !== "string" || typeof item.kind !== "string") continue;
    if (!Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.y))) continue;
    if (!ITEM_KINDS.has(item.kind)) continue;
    const size = getDesktopItemSize(item.kind);
    const position = clampFloatingPosition(
      { x: Number(item.x), y: Number(item.y) },
      bounds,
      size.width,
      size.height
    );
    const base = {
      id: item.id.slice(0, 80),
      x: position.x,
      y: position.y,
      createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : now,
      sourceSku: typeof item.sourceSku === "string" ? item.sourceSku.slice(0, 80) : undefined,
      inventoryOrdinal: Number.isFinite(Number(item.inventoryOrdinal))
        ? Math.max(1, Math.min(999, Math.round(Number(item.inventoryOrdinal))))
        : undefined,
      material: normalizeMaterialProfile(item.material, item.kind),
      scaleFactor:
        Number.isFinite(Number(item.scaleFactor)) && Number(item.scaleExpiresAt || 0) > now
          ? normalizeScaleFactor(item.scaleFactor)
          : undefined,
      scaleExpiresAt:
        Number.isFinite(Number(item.scaleExpiresAt)) && Number(item.scaleExpiresAt) > now
          ? Number(item.scaleExpiresAt)
          : undefined,
      lastPortalTransitAt: Number.isFinite(Number(item.lastPortalTransitAt))
        ? Number(item.lastPortalTransitAt)
        : undefined,
    };
    if (item.kind === "tiny-fan") {
      normalized.push({
        ...base,
        kind: "tiny-fan",
        angle: clampNumber((item as Partial<Extract<DesktopItemState, { kind: "tiny-fan" }>>).angle, 0, 0, Math.PI * 2),
        active: (item as Partial<Extract<DesktopItemState, { kind: "tiny-fan" }>>).active !== false,
      });
    } else if (item.kind === "hanging-light") {
      const variant = (item as Partial<Extract<DesktopItemState, { kind: "hanging-light" }>>).variant;
      normalized.push({
        ...base,
        kind: "hanging-light",
        variant: LIGHT_VARIANTS.has(String(variant)) ? (variant as "disco" | "moon" | "sun") : "disco",
      });
    } else if (item.kind === "sticky-note") {
      const note = item as Partial<Extract<DesktopItemState, { kind: "sticky-note" }>>;
      normalized.push({
        ...base,
        kind: "sticky-note",
        text: clampText(note.text, 600),
        stickiness: clampNumber(note.stickiness, 0.72, 0.15, 1),
        stickyWetness: clampNumber(note.stickyWetness, 0, 0, 1),
        paperWetness: clampNumber(note.paperWetness, 0, 0, 1),
        curl: clampNumber(note.curl, 0, 0, 1),
        strokes: normalizeStrokes(note.strokes),
        marks: normalizeMarks(note.marks),
        lastPetLessonAt: Number.isFinite(Number(note.lastPetLessonAt)) ? Number(note.lastPetLessonAt) : 0,
      });
    } else if (item.kind === "mop") {
      const mop = item as Partial<Extract<DesktopItemState, { kind: "mop" }>>;
      normalized.push({
        ...base,
        kind: "mop",
        usesLeft: Math.round(clampNumber(mop.usesLeft, 3, 0, 3)),
        dirty: clampNumber(mop.dirty, 0, 0, 1),
      });
    } else if (item.kind === "vacuum") {
      const vacuum = item as Partial<Extract<DesktopItemState, { kind: "vacuum" }>>;
      normalized.push({
        ...base,
        kind: "vacuum",
        charge: clampNumber(vacuum.charge, 1, 0, 1),
      });
    } else if (item.kind === "cursor-tool-tray") {
      normalized.push({
        ...base,
        kind: "cursor-tool-tray",
        open: (item as Partial<Extract<DesktopItemState, { kind: "cursor-tool-tray" }>>).open === true,
      });
    } else if (item.kind === "train-kit-box") {
      normalized.push({
        ...base,
        kind: "train-kit-box",
        opened: (item as Partial<Extract<DesktopItemState, { kind: "train-kit-box" }>>).opened === true,
      });
    } else if (item.kind === "train-track-piece") {
      const track = item as Partial<Extract<DesktopItemState, { kind: "train-track-piece" }>>;
      const shape = TRACK_SHAPES.has(String(track.shape)) ? track.shape : "straight";
      normalized.push({
        ...base,
        kind: "train-track-piece",
        shape: shape as "straight" | "curve" | "switch",
        rotation: Math.round(clampNumber(track.rotation, 0, 0, 359)),
        assemblyId: clampText(track.assemblyId, 80) || `train-${base.id}`,
        snappedTo: Array.isArray(track.snappedTo)
          ? track.snappedTo.filter((id): id is string => typeof id === "string").slice(0, 8)
          : [],
      });
    } else if (item.kind === "train-engine") {
      const engine = item as Partial<Extract<DesktopItemState, { kind: "train-engine" }>>;
      const variant = TRAIN_ENGINE_VARIANTS.has(String(engine.variant)) ? engine.variant : "starter";
      normalized.push({
        ...base,
        kind: "train-engine",
        variant: variant as "starter" | "express" | "freight",
        speed: clampNumber(engine.speed, 1, 0.3, 3.2),
        rotation: Math.round(clampNumber(engine.rotation, 0, 0, 359)),
        assemblyId: clampText(engine.assemblyId, 80) || `train-${base.id}`,
      });
    } else if (item.kind === "train-car") {
      const car = item as Partial<Extract<DesktopItemState, { kind: "train-car" }>>;
      const variant = TRAIN_CAR_VARIANTS.has(String(car.variant)) ? car.variant : "boxcar";
      normalized.push({
        ...base,
        kind: "train-car",
        variant: variant as "boxcar" | "flatbed" | "caboose",
        rotation: Math.round(clampNumber(car.rotation, 0, 0, 359)),
        assemblyId: clampText(car.assemblyId, 80) || `train-${base.id}`,
      });
    } else if (item.kind === "portal-gun") {
      const portalGun = item as Partial<Extract<DesktopItemState, { kind: "portal-gun" }>>;
      const color = PORTAL_COLORS.has(String(portalGun.nextColor)) ? portalGun.nextColor : "blue";
      normalized.push({
        ...base,
        kind: "portal-gun",
        nextColor: color as "blue" | "orange",
      });
    } else if (item.kind === "portal") {
      const portal = item as Partial<Extract<DesktopItemState, { kind: "portal" }>>;
      const color = PORTAL_COLORS.has(String(portal.color)) ? portal.color : "blue";
      normalized.push({
        ...base,
        kind: "portal",
        color: color as "blue" | "orange",
      });
    } else if (item.kind === "jukebox") {
      normalized.push({
        ...base,
        kind: "jukebox",
      });
    } else if (item.kind === "paper-shredder") {
      const shredder = item as Partial<Extract<DesktopItemState, { kind: "paper-shredder" }>>;
      normalized.push({
        ...base,
        kind: "paper-shredder",
        wear: clampNumber(shredder.wear, 0, 0, 1),
      });
    } else {
      const artifact = item as Partial<Extract<DesktopItemState, { kind: "artifact-icon" }>>;
      normalized.push({
        ...base,
        kind: "artifact-icon",
        label: clampText(artifact.label, 40) || "Desktop Item",
        monogram: (clampText(artifact.monogram, 5) || "ITEM").toUpperCase(),
      });
    }
  }
  return normalized;
}
