export const SCALE_TOOL_MIN_FACTOR = 0.25;
export const SCALE_TOOL_MAX_FACTOR = 2.5;
export const SCALE_TOOL_DURATION_MS = 3 * 60 * 60 * 1000;

export type DesktopMaterialKind =
  | "paper"
  | "cardboard"
  | "metal"
  | "plastic"
  | "cloth"
  | "glass"
  | "light"
  | "energy"
  | "organic"
  | "mixed";

export interface DesktopMaterialProfile {
  kind: DesktopMaterialKind;
  durability: number;
  tensileStrength: number;
  pierceResistance: number;
  bounciness: number;
  friction: number;
  absorbsWater: boolean;
  shreddable: boolean;
  portalCompatible: boolean;
  scaleCompatible: boolean;
}

const MATERIAL_DEFAULTS: Record<DesktopMaterialKind, DesktopMaterialProfile> = {
  paper: {
    kind: "paper",
    durability: 0.22,
    tensileStrength: 0.24,
    pierceResistance: 0.12,
    bounciness: 0.04,
    friction: 0.74,
    absorbsWater: true,
    shreddable: true,
    portalCompatible: true,
    scaleCompatible: true,
  },
  cardboard: {
    kind: "cardboard",
    durability: 0.42,
    tensileStrength: 0.38,
    pierceResistance: 0.24,
    bounciness: 0.08,
    friction: 0.62,
    absorbsWater: true,
    shreddable: true,
    portalCompatible: true,
    scaleCompatible: true,
  },
  metal: {
    kind: "metal",
    durability: 0.92,
    tensileStrength: 0.94,
    pierceResistance: 0.88,
    bounciness: 0.18,
    friction: 0.32,
    absorbsWater: false,
    shreddable: false,
    portalCompatible: true,
    scaleCompatible: true,
  },
  plastic: {
    kind: "plastic",
    durability: 0.72,
    tensileStrength: 0.66,
    pierceResistance: 0.42,
    bounciness: 0.34,
    friction: 0.38,
    absorbsWater: false,
    shreddable: false,
    portalCompatible: true,
    scaleCompatible: true,
  },
  cloth: {
    kind: "cloth",
    durability: 0.38,
    tensileStrength: 0.44,
    pierceResistance: 0.18,
    bounciness: 0.02,
    friction: 0.86,
    absorbsWater: true,
    shreddable: false,
    portalCompatible: true,
    scaleCompatible: true,
  },
  glass: {
    kind: "glass",
    durability: 0.5,
    tensileStrength: 0.34,
    pierceResistance: 0.76,
    bounciness: 0.22,
    friction: 0.2,
    absorbsWater: false,
    shreddable: false,
    portalCompatible: true,
    scaleCompatible: true,
  },
  light: {
    kind: "light",
    durability: 1,
    tensileStrength: 1,
    pierceResistance: 1,
    bounciness: 0,
    friction: 0,
    absorbsWater: false,
    shreddable: false,
    portalCompatible: false,
    scaleCompatible: false,
  },
  energy: {
    kind: "energy",
    durability: 1,
    tensileStrength: 1,
    pierceResistance: 1,
    bounciness: 0,
    friction: 0,
    absorbsWater: false,
    shreddable: false,
    portalCompatible: false,
    scaleCompatible: false,
  },
  organic: {
    kind: "organic",
    durability: 0.34,
    tensileStrength: 0.28,
    pierceResistance: 0.2,
    bounciness: 0.12,
    friction: 0.58,
    absorbsWater: true,
    shreddable: false,
    portalCompatible: true,
    scaleCompatible: true,
  },
  mixed: {
    kind: "mixed",
    durability: 0.6,
    tensileStrength: 0.55,
    pierceResistance: 0.46,
    bounciness: 0.22,
    friction: 0.42,
    absorbsWater: false,
    shreddable: false,
    portalCompatible: true,
    scaleCompatible: true,
  },
};

function clamp01(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function isMaterialKind(value: unknown): value is DesktopMaterialKind {
  return typeof value === "string" && value in MATERIAL_DEFAULTS;
}

export function materialForDesktopKind(kind: string): DesktopMaterialProfile {
  if (kind === "sticky-note") return MATERIAL_DEFAULTS.paper;
  if (kind === "train-kit-box") return MATERIAL_DEFAULTS.cardboard;
  if (kind === "train-track-piece") return { ...MATERIAL_DEFAULTS.plastic, friction: 0.48 };
  if (kind === "train-engine" || kind === "train-car") return MATERIAL_DEFAULTS.metal;
  if (kind === "paper-shredder") return MATERIAL_DEFAULTS.metal;
  if (kind === "portal" || kind === "hanging-light") return MATERIAL_DEFAULTS.energy;
  if (kind === "cursor-tool-tray") return MATERIAL_DEFAULTS.plastic;
  if (kind === "mop") return { ...MATERIAL_DEFAULTS.mixed, absorbsWater: true };
  if (kind === "vacuum" || kind === "tiny-fan" || kind === "portal-gun") return MATERIAL_DEFAULTS.metal;
  if (kind === "jukebox") return MATERIAL_DEFAULTS.mixed;
  return MATERIAL_DEFAULTS.mixed;
}

export function normalizeMaterialProfile(
  value: unknown,
  fallbackKind: string
): DesktopMaterialProfile {
  const fallback = materialForDesktopKind(fallbackKind);
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<DesktopMaterialProfile>;
  const kind = isMaterialKind(raw.kind) ? raw.kind : fallback.kind;
  const base = MATERIAL_DEFAULTS[kind] ?? fallback;
  return {
    kind,
    durability: clamp01(raw.durability, base.durability),
    tensileStrength: clamp01(raw.tensileStrength, base.tensileStrength),
    pierceResistance: clamp01(raw.pierceResistance, base.pierceResistance),
    bounciness: clamp01(raw.bounciness, base.bounciness),
    friction: clamp01(raw.friction, base.friction),
    absorbsWater: raw.absorbsWater ?? base.absorbsWater,
    shreddable: raw.shreddable ?? base.shreddable,
    portalCompatible: raw.portalCompatible ?? base.portalCompatible,
    scaleCompatible: raw.scaleCompatible ?? base.scaleCompatible,
  };
}

export function normalizeScaleFactor(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(SCALE_TOOL_MIN_FACTOR, Math.min(SCALE_TOOL_MAX_FACTOR, parsed));
}

export function scaleExpiresAt(now = Date.now()) {
  return now + SCALE_TOOL_DURATION_MS;
}

export function effectiveScaleFactor(input: {
  scaleFactor?: number;
  scaleExpiresAt?: number;
  material?: DesktopMaterialProfile;
}, now = Date.now()) {
  if (input.material?.scaleCompatible === false) return 1;
  const expiresAt = Number(input.scaleExpiresAt || 0);
  if (!expiresAt || expiresAt <= now) return 1;
  return normalizeScaleFactor(input.scaleFactor);
}
