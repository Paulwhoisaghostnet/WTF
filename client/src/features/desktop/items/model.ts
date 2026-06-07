import {
  effectiveScaleFactor,
  materialForDesktopKind,
  type DesktopMaterialProfile,
  type PortalColor,
} from "../materials";

export const FAN_SIZE = 44;
export const LIGHT_SIZE = 54;
export const STICKY_NOTE_W = 132;
export const STICKY_NOTE_H = 112;
export const MOP_SIZE = 46;
export const VACUUM_SIZE = 50;
export const ARTIFACT_ICON_SIZE = 78;
export const CURSOR_TOOL_TRAY_SIZE = 54;
export const TRAIN_KIT_W = 86;
export const TRAIN_KIT_H = 72;
export const TRAIN_TRACK_W = 60;
export const TRAIN_TRACK_H = 46;
export const TRAIN_ENGINE_W = 64;
export const TRAIN_ENGINE_H = 38;
export const TRAIN_CAR_W = 56;
export const TRAIN_CAR_H = 36;
export const PORTAL_GUN_W = 62;
export const PORTAL_GUN_H = 46;
export const PORTAL_W = 46;
export const PORTAL_H = 64;
export const JUKEBOX_W = 58;
export const JUKEBOX_H = 72;
export const PAPER_SHREDDER_W = 56;
export const PAPER_SHREDDER_H = 64;
export const MAX_DESKTOP_ITEMS = 72;

export type DesktopItemKind =
  | "tiny-fan"
  | "hanging-light"
  | "sticky-note"
  | "mop"
  | "vacuum"
  | "cursor-tool-tray"
  | "train-kit-box"
  | "train-track-piece"
  | "train-engine"
  | "train-car"
  | "portal-gun"
  | "portal"
  | "jukebox"
  | "paper-shredder"
  | "artifact-icon";

export type DesktopLightVariant = "disco" | "moon" | "sun";
export type TrainTrackShape = "straight" | "curve" | "switch";
export type TrainEngineVariant = "starter" | "express" | "freight";
export type TrainCarVariant = "boxcar" | "flatbed" | "caboose";

export interface StickyNoteStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

export interface StickyNoteMark {
  id: string;
  x: number;
  y: number;
  color: string;
  opacity: number;
  createdAt: number;
}

interface DesktopItemBase {
  id: string;
  kind: DesktopItemKind;
  x: number;
  y: number;
  createdAt: number;
  sourceSku?: string;
  inventoryOrdinal?: number;
  material?: DesktopMaterialProfile;
  scaleFactor?: number;
  scaleExpiresAt?: number;
  lastPortalTransitAt?: number;
}

export interface TinyFanItem extends DesktopItemBase {
  kind: "tiny-fan";
  angle: number;
  active: boolean;
}

export interface HangingLightItem extends DesktopItemBase {
  kind: "hanging-light";
  variant: DesktopLightVariant;
}

export interface StickyNoteItem extends DesktopItemBase {
  kind: "sticky-note";
  text: string;
  stickiness: number;
  stickyWetness: number;
  paperWetness: number;
  curl: number;
  strokes: StickyNoteStroke[];
  marks: StickyNoteMark[];
  lastPetLessonAt: number;
}

export interface MopItem extends DesktopItemBase {
  kind: "mop";
  usesLeft: number;
  dirty: number;
}

export interface VacuumItem extends DesktopItemBase {
  kind: "vacuum";
  charge: number;
}

export interface GenericDesktopArtifactItem extends DesktopItemBase {
  kind: "artifact-icon";
  label: string;
  monogram: string;
}

export interface CursorToolTrayItem extends DesktopItemBase {
  kind: "cursor-tool-tray";
  open: boolean;
}

export interface TrainKitBoxItem extends DesktopItemBase {
  kind: "train-kit-box";
  opened: boolean;
}

export interface TrainTrackPieceItem extends DesktopItemBase {
  kind: "train-track-piece";
  shape: TrainTrackShape;
  rotation: number;
  assemblyId: string;
  snappedTo: string[];
}

export interface TrainEngineItem extends DesktopItemBase {
  kind: "train-engine";
  variant: TrainEngineVariant;
  speed: number;
  rotation: number;
  assemblyId: string;
}

export interface TrainCarItem extends DesktopItemBase {
  kind: "train-car";
  variant: TrainCarVariant;
  rotation: number;
  assemblyId: string;
}

export interface PortalGunItem extends DesktopItemBase {
  kind: "portal-gun";
  nextColor: PortalColor;
}

export interface PortalItem extends DesktopItemBase {
  kind: "portal";
  color: PortalColor;
}

export interface JukeboxItem extends DesktopItemBase {
  kind: "jukebox";
}

export interface PaperShredderItem extends DesktopItemBase {
  kind: "paper-shredder";
  wear: number;
}

export type DesktopItemState =
  | TinyFanItem
  | HangingLightItem
  | StickyNoteItem
  | MopItem
  | VacuumItem
  | CursorToolTrayItem
  | TrainKitBoxItem
  | TrainTrackPieceItem
  | TrainEngineItem
  | TrainCarItem
  | PortalGunItem
  | PortalItem
  | JukeboxItem
  | PaperShredderItem
  | GenericDesktopArtifactItem;

export function getDesktopItemSize(item: DesktopItemState | DesktopItemKind) {
  const kind = typeof item === "string" ? item : item.kind;
  if (kind === "tiny-fan") return { width: FAN_SIZE, height: FAN_SIZE };
  if (kind === "hanging-light") return { width: LIGHT_SIZE, height: LIGHT_SIZE };
  if (kind === "sticky-note") return { width: STICKY_NOTE_W, height: STICKY_NOTE_H };
  if (kind === "mop") return { width: MOP_SIZE, height: MOP_SIZE };
  if (kind === "cursor-tool-tray") return { width: CURSOR_TOOL_TRAY_SIZE, height: CURSOR_TOOL_TRAY_SIZE };
  if (kind === "train-kit-box") return { width: TRAIN_KIT_W, height: TRAIN_KIT_H };
  if (kind === "train-track-piece") return { width: TRAIN_TRACK_W, height: TRAIN_TRACK_H };
  if (kind === "train-engine") return { width: TRAIN_ENGINE_W, height: TRAIN_ENGINE_H };
  if (kind === "train-car") return { width: TRAIN_CAR_W, height: TRAIN_CAR_H };
  if (kind === "portal-gun") return { width: PORTAL_GUN_W, height: PORTAL_GUN_H };
  if (kind === "portal") return { width: PORTAL_W, height: PORTAL_H };
  if (kind === "jukebox") return { width: JUKEBOX_W, height: JUKEBOX_H };
  if (kind === "paper-shredder") return { width: PAPER_SHREDDER_W, height: PAPER_SHREDDER_H };
  if (kind === "artifact-icon") return { width: ARTIFACT_ICON_SIZE, height: ARTIFACT_ICON_SIZE };
  return { width: VACUUM_SIZE, height: VACUUM_SIZE };
}

export function getDesktopItemMaterial(item: DesktopItemState): DesktopMaterialProfile {
  return item.material ?? materialForDesktopKind(item.kind);
}

export function getDesktopItemScale(item: DesktopItemState, now = Date.now()) {
  return effectiveScaleFactor(
    {
      scaleFactor: item.scaleFactor,
      scaleExpiresAt: item.scaleExpiresAt,
      material: getDesktopItemMaterial(item),
    },
    now
  );
}

export function getScaledDesktopItemSize(item: DesktopItemState, now = Date.now()) {
  const size = getDesktopItemSize(item);
  const scale = getDesktopItemScale(item, now);
  return {
    width: size.width * scale,
    height: size.height * scale,
  };
}

export function getDesktopItemRect(
  item: DesktopItemState,
  bounds?: { width: number; height: number },
  now = Date.now()
) {
  if (item.kind === "hanging-light" && item.variant === "sun" && bounds) {
    const size = getScaledDesktopItemSize(item, now);
    const sun = getSunDesktopPosition(bounds, now);
    return { x: sun.x, y: sun.y, ...size };
  }
  return { x: item.x, y: item.y, ...getScaledDesktopItemSize(item, now) };
}

export function getDesktopItemCenter(
  item: DesktopItemState,
  bounds?: { width: number; height: number },
  now = Date.now()
) {
  const rect = getDesktopItemRect(item, bounds, now);
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

export function getSunDesktopPosition(bounds: { width: number; height: number }, now = Date.now()) {
  const date = new Date(now);
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const t = minutes / 1440;
  const arc = Math.sin(t * Math.PI);
  const x = Math.max(6, Math.min(bounds.width - LIGHT_SIZE - 6, t * (bounds.width - LIGHT_SIZE)));
  const y = Math.max(4, Math.min(bounds.height * 0.38, bounds.height * 0.26 - arc * bounds.height * 0.18));
  return { x, y };
}

export function isDesktopPlacementTool(
  tool: string | null
): tool is
  | "fan"
  | "sticky-note"
  | "mop"
  | "vacuum"
  | "light-disco"
  | "light-moon"
  | "light-sun" {
  return (
    tool === "fan" ||
    tool === "sticky-note" ||
    tool === "mop" ||
    tool === "vacuum" ||
    tool === "light-disco" ||
    tool === "light-moon" ||
    tool === "light-sun"
  );
}

export function itemKindForTool(tool: string) {
  if (tool === "fan") return "tiny-fan" as const;
  if (tool === "sticky-note") return "sticky-note" as const;
  if (tool === "mop") return "mop" as const;
  if (tool === "vacuum") return "vacuum" as const;
  return "hanging-light" as const;
}

export function lightVariantForTool(tool: string): DesktopLightVariant {
  if (tool === "light-moon") return "moon";
  if (tool === "light-sun") return "sun";
  return "disco";
}
