export const DESKTOP_CURSOR_STYLES = [
  "eggplant",
  "system",
  "crosshair",
  "carrot",
  "horse-runner",
  "a11-rocket",
  "hatchet",
  "tezos-classic",
  "tezos-current",
  "blang-side-eye",
  "toon-hand",
  "middle-finger",
  "paintbrush",
  "glitch-block",
  "rainbow-hitbox",
  "spinning-slice",
  "floppy-spinner",
  "rubber-stamp",
] as const;

export type DesktopCursorStyle = (typeof DESKTOP_CURSOR_STYLES)[number];

export const DESKTOP_CURSOR_LABELS: Record<DesktopCursorStyle, string> = {
  eggplant: "Aubergine",
  system: "System",
  crosshair: "Crosshair",
  carrot: "Carrot",
  "horse-runner": "Horse Runner",
  "a11-rocket": "A11 Rocket",
  hatchet: "Hatchet",
  "tezos-classic": "Classic Tezos",
  "tezos-current": "Tezos Blue",
  "blang-side-eye": "Blang Side-Eye",
  "toon-hand": "Cartoon Hand",
  "middle-finger": "Middle Finger",
  paintbrush: "Paintbrush",
  "glitch-block": "Glitch Block",
  "rainbow-hitbox": "Rainbow Hitbox",
  "spinning-slice": "Spinning Slice",
  "floppy-spinner": "Floppy Spinner",
  "rubber-stamp": "Rubber Stamp",
};

export const DESKTOP_GRAVITY_MODES = ["on", "zero", "off"] as const;
export type DesktopGravityMode = (typeof DESKTOP_GRAVITY_MODES)[number];

export const DESKTOP_BACKGROUND_FITS = ["cover", "contain", "tile", "center"] as const;
export type DesktopBackgroundFit = (typeof DESKTOP_BACKGROUND_FITS)[number];

export const DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export const DESKTOP_COLOR_SCHEMES = [
  {
    key: "wtf-teal",
    label: "WTF Teal",
    desktopColor: "#008080",
    windowColor: "#c0c0c0",
    activeTitleColor: "#000080",
    activeTitleTextColor: "#ffffff",
    inactiveTitleColor: "#808080",
    inactiveTitleTextColor: "#c0c0c0",
    textColor: "#111111",
    highlightColor: "#000080",
    buttonFace: "#c0c0c0",
  },
  {
    key: "classic-gray",
    label: "Ashtray Office",
    desktopColor: "#6b716f",
    windowColor: "#d7d0bd",
    activeTitleColor: "#2b2d42",
    activeTitleTextColor: "#fff5d6",
    inactiveTitleColor: "#857c6e",
    inactiveTitleTextColor: "#fff5d6",
    textColor: "#14120f",
    highlightColor: "#a13d2d",
    buttonFace: "#d7d0bd",
  },
  {
    key: "hotdog-stand",
    label: "Hotdog Stand",
    desktopColor: "#ff0000",
    windowColor: "#ffff00",
    activeTitleColor: "#ff0000",
    activeTitleTextColor: "#ffff00",
    inactiveTitleColor: "#808000",
    inactiveTitleTextColor: "#ffffff",
    textColor: "#000000",
    highlightColor: "#0000ff",
    buttonFace: "#ffff00",
  },
  {
    key: "storm-fountain",
    label: "Toxic Lagoon",
    desktopColor: "#096b57",
    windowColor: "#c6ff4d",
    activeTitleColor: "#ff4f00",
    activeTitleTextColor: "#111111",
    inactiveTitleColor: "#239b7f",
    inactiveTitleTextColor: "#efffd0",
    textColor: "#101600",
    highlightColor: "#7c00ff",
    buttonFace: "#c6ff4d",
  },
  {
    key: "violet-computer",
    label: "Aubergine Motel",
    desktopColor: "#4b123d",
    windowColor: "#ffd0e6",
    activeTitleColor: "#0b3d91",
    activeTitleTextColor: "#ffffff",
    inactiveTitleColor: "#95577c",
    inactiveTitleTextColor: "#ffffff",
    textColor: "#210018",
    highlightColor: "#f5a000",
    buttonFace: "#ffd0e6",
  },
  {
    key: "arcade-carpet",
    label: "Arcade Carpet",
    desktopColor: "#191417",
    windowColor: "#19d3c5",
    activeTitleColor: "#ff3b8d",
    activeTitleTextColor: "#fff6fb",
    inactiveTitleColor: "#4d3848",
    inactiveTitleTextColor: "#d9f7f1",
    textColor: "#071313",
    highlightColor: "#fff200",
    buttonFace: "#19d3c5",
  },
  {
    key: "photocopier-jam",
    label: "Photocopier Jam",
    desktopColor: "#f3efe2",
    windowColor: "#1b1b1b",
    activeTitleColor: "#ff4b2b",
    activeTitleTextColor: "#ffffff",
    inactiveTitleColor: "#7a756c",
    inactiveTitleTextColor: "#ffffff",
    textColor: "#f8f4e7",
    highlightColor: "#14b8a6",
    buttonFace: "#303030",
  },
  {
    key: "pool-hall",
    label: "Pool Hall",
    desktopColor: "#0a4a35",
    windowColor: "#f7e6b3",
    activeTitleColor: "#7b1022",
    activeTitleTextColor: "#fff4d7",
    inactiveTitleColor: "#416a5a",
    inactiveTitleTextColor: "#fff4d7",
    textColor: "#15110a",
    highlightColor: "#d99a20",
    buttonFace: "#f7e6b3",
  },
  {
    key: "blacklight-zine",
    label: "Blacklight Zine",
    desktopColor: "#070707",
    windowColor: "#f5f5f5",
    activeTitleColor: "#ff00a8",
    activeTitleTextColor: "#ffffff",
    inactiveTitleColor: "#3f3f46",
    inactiveTitleTextColor: "#f5f5f5",
    textColor: "#050505",
    highlightColor: "#00f0ff",
    buttonFace: "#f5f5f5",
  },
  {
    key: "clinic-tank",
    label: "Clinic Tank",
    desktopColor: "#2bb3b1",
    windowColor: "#fff8f0",
    activeTitleColor: "#f45d48",
    activeTitleTextColor: "#111111",
    inactiveTitleColor: "#9fc6c4",
    inactiveTitleTextColor: "#183331",
    textColor: "#17312f",
    highlightColor: "#2457a6",
    buttonFace: "#fff8f0",
  },
  {
    key: "trash-compactor",
    label: "Trash Compactor",
    desktopColor: "#3b3f1d",
    windowColor: "#e0d8be",
    activeTitleColor: "#332b14",
    activeTitleTextColor: "#fff0b3",
    inactiveTitleColor: "#8d7e4c",
    inactiveTitleTextColor: "#fff5cf",
    textColor: "#201d10",
    highlightColor: "#ff6b35",
    buttonFace: "#e0d8be",
  },
  {
    key: "vaporwave-bodega",
    label: "Vaporwave Bodega",
    desktopColor: "#2131a5",
    windowColor: "#ffe3f4",
    activeTitleColor: "#00b7c8",
    activeTitleTextColor: "#08011a",
    inactiveTitleColor: "#7865a1",
    inactiveTitleTextColor: "#ffffff",
    textColor: "#1f0931",
    highlightColor: "#ff8a00",
    buttonFace: "#ffe3f4",
  },
] as const;

export type DesktopColorSchemeKey = (typeof DESKTOP_COLOR_SCHEMES)[number]["key"];

export interface DesktopAppearance {
  colorSchemeKey: DesktopColorSchemeKey;
  desktopColor: string;
  windowColor: string;
  activeTitleColor: string;
  activeTitleTextColor: string;
  inactiveTitleColor: string;
  inactiveTitleTextColor: string;
  textColor: string;
  highlightColor: string;
  buttonFace: string;
  backgroundImageUrl: string | null;
  backgroundFit: DesktopBackgroundFit;
  cursorStyle: DesktopCursorStyle;
  desktopPhysicsEnabled: boolean;
  desktopGravityMode: DesktopGravityMode;
  desktopPetEnabled: boolean;
}

const DEFAULT_SCHEME = DESKTOP_COLOR_SCHEMES[0];

export const DEFAULT_DESKTOP_APPEARANCE: DesktopAppearance = {
  colorSchemeKey: DEFAULT_SCHEME.key,
  desktopColor: DEFAULT_SCHEME.desktopColor,
  windowColor: DEFAULT_SCHEME.windowColor,
  activeTitleColor: DEFAULT_SCHEME.activeTitleColor,
  activeTitleTextColor: DEFAULT_SCHEME.activeTitleTextColor,
  inactiveTitleColor: DEFAULT_SCHEME.inactiveTitleColor,
  inactiveTitleTextColor: DEFAULT_SCHEME.inactiveTitleTextColor,
  textColor: DEFAULT_SCHEME.textColor,
  highlightColor: DEFAULT_SCHEME.highlightColor,
  buttonFace: DEFAULT_SCHEME.buttonFace,
  backgroundImageUrl: null,
  backgroundFit: "cover",
  cursorStyle: "eggplant",
  desktopPhysicsEnabled: false,
  desktopGravityMode: "on",
  desktopPetEnabled: false,
};

export interface IconPosition {
  x: number;
  y: number;
}

export type DesktopIconLayout = Record<string, IconPosition>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function normalizeColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.trim().toLowerCase() : fallback;
}

function normalizeBackgroundUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed.slice(0, 2_500);
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 2_500);
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(trimmed)) {
    return trimmed.slice(0, 500_000);
  }
  return null;
}

function normalizeIpfsUri(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed.startsWith("ipfs://")) {
    const path = trimmed.replace(/^ipfs:\/\//i, "").replace(/^\/+/, "");
    return `https://ipfs.io/ipfs/${path}`;
  }
  return trimmed;
}

function cacheProxyUrl(sourceUrl: string): string {
  return `/api/cache/media?url=${encodeURIComponent(sourceUrl)}`;
}

function wallpaperUrlFromSource(sourceUrl: unknown): string | null {
  if (typeof sourceUrl !== "string") return null;
  const normalized = normalizeIpfsUri(sourceUrl);
  if (!normalized) return null;
  if (normalized.startsWith("/")) return normalized;
  if (/^https?:\/\//i.test(normalized)) return cacheProxyUrl(normalized);
  return null;
}

export interface DesktopMediaWallpaperSource {
  id: number;
  sourceType?: string | null;
  sourceUrl?: string | null;
  playbackUrl?: string | null;
}

export function mediaLibraryWallpaperUrl(
  item: DesktopMediaWallpaperSource
): string | null {
  if (item.sourceType === "upload") return `/api/media/${item.id}/file`;
  return wallpaperUrlFromSource(item.playbackUrl || item.sourceUrl);
}

export interface DesktopTokenWallpaperSource {
  thumbnail?: string | null;
  metadata?: Record<string, unknown> | null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function tokenWallpaperUrl(token: DesktopTokenWallpaperSource): string | null {
  const metadata = isRecord(token.metadata) ? token.metadata : {};
  const formats = Array.isArray(metadata.formats) ? metadata.formats : [];
  const imageFormat = formats.find((format) => {
    if (!isRecord(format)) return false;
    const mime = String(format.mimeType || format.mime_type || "").toLowerCase();
    return mime.startsWith("image/");
  });
  const imageFormatUri = isRecord(imageFormat)
    ? firstString(imageFormat.uri, imageFormat.url)
    : null;
  return wallpaperUrlFromSource(
    firstString(
      metadata.displayUri,
      metadata.artifactUri,
      imageFormatUri,
      metadata.thumbnailUri,
      token.thumbnail
    )
  );
}

export function getDesktopColorScheme(key: unknown) {
  return (
    DESKTOP_COLOR_SCHEMES.find((scheme) => scheme.key === key) ??
    DEFAULT_SCHEME
  );
}

export function normalizeDesktopAppearance(input: unknown): DesktopAppearance {
  if (!isRecord(input)) return { ...DEFAULT_DESKTOP_APPEARANCE };

  const scheme = getDesktopColorScheme(input.colorSchemeKey);
  const cursorStyle = DESKTOP_CURSOR_STYLES.includes(input.cursorStyle as DesktopCursorStyle)
    ? (input.cursorStyle as DesktopCursorStyle)
    : DEFAULT_DESKTOP_APPEARANCE.cursorStyle;
  const gravityMode = DESKTOP_GRAVITY_MODES.includes(input.desktopGravityMode as DesktopGravityMode)
    ? (input.desktopGravityMode as DesktopGravityMode)
    : DEFAULT_DESKTOP_APPEARANCE.desktopGravityMode;
  const backgroundFit = DESKTOP_BACKGROUND_FITS.includes(input.backgroundFit as DesktopBackgroundFit)
    ? (input.backgroundFit as DesktopBackgroundFit)
    : DEFAULT_DESKTOP_APPEARANCE.backgroundFit;

  return {
    colorSchemeKey: scheme.key,
    desktopColor: normalizeColor(input.desktopColor, scheme.desktopColor),
    windowColor: normalizeColor(input.windowColor, scheme.windowColor),
    activeTitleColor: normalizeColor(input.activeTitleColor, scheme.activeTitleColor),
    activeTitleTextColor: normalizeColor(
      input.activeTitleTextColor,
      scheme.activeTitleTextColor
    ),
    inactiveTitleColor: normalizeColor(input.inactiveTitleColor, scheme.inactiveTitleColor),
    inactiveTitleTextColor: normalizeColor(
      input.inactiveTitleTextColor,
      scheme.inactiveTitleTextColor
    ),
    textColor: normalizeColor(input.textColor, scheme.textColor),
    highlightColor: normalizeColor(input.highlightColor, scheme.highlightColor),
    buttonFace: normalizeColor(input.buttonFace, scheme.buttonFace),
    backgroundImageUrl: normalizeBackgroundUrl(input.backgroundImageUrl),
    backgroundFit,
    cursorStyle,
    desktopPhysicsEnabled: input.desktopPhysicsEnabled === true,
    desktopGravityMode: gravityMode,
    desktopPetEnabled: input.desktopPetEnabled === true,
  };
}

export function normalizeIconLayout(
  input: unknown,
  allowedKeys?: readonly string[]
): DesktopIconLayout {
  if (!isRecord(input)) return {};
  const allow = allowedKeys ? new Set(allowedKeys) : null;
  const layout: DesktopIconLayout = {};

  for (const [key, rawPos] of Object.entries(input)) {
    if (allow && !allow.has(key)) continue;
    if (!isRecord(rawPos)) continue;
    const x = Number(rawPos.x);
    const y = Number(rawPos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < 0 || y < 0) continue;
    layout[key] = {
      x: Math.round(x),
      y: Math.round(y),
    };
  }

  return layout;
}

export const HAMSTER_ACTIONS = [
  "feed",
  "water",
  "play",
  "pet",
  "clean",
  "nap",
  "revive",
] as const;

export type HamsterAction = (typeof HAMSTER_ACTIONS)[number];

export interface HamsterState {
  name: string;
  alive: boolean;
  hunger: number;
  thirst: number;
  happiness: number;
  hygiene: number;
  energy: number;
  level: number;
  xpEarned: number;
  missedCareDays: number;
  careStreak: number;
  lastCareDate: string | null;
  lastInteractionAt: string | null;
  interactionCounts: Record<string, number>;
}

export const DEFAULT_HAMSTER_STATE: HamsterState = {
  name: "Niblet",
  alive: true,
  hunger: 72,
  thirst: 72,
  happiness: 68,
  hygiene: 70,
  energy: 64,
  level: 1,
  xpEarned: 0,
  missedCareDays: 0,
  careStreak: 0,
  lastCareDate: null,
  lastInteractionAt: null,
  interactionCounts: {},
};

const CARE_ACTIONS = new Set<HamsterAction>([
  "feed",
  "water",
  "play",
  "pet",
  "clean",
  "nap",
]);

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : null;
}

function daysBetween(fromDateKey: string | null, toDate: Date): number {
  const from = parseDateKey(fromDateKey);
  if (from == null) return 0;
  const to = parseDateKey(dateKey(toDate));
  if (to == null) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

function normalizeHamsterState(input: Partial<HamsterState> | null | undefined): HamsterState {
  const raw = isRecord(input) ? input : {};
  const counts = isRecord(raw.interactionCounts)
    ? Object.fromEntries(
        Object.entries(raw.interactionCounts)
          .filter(([, value]) => Number.isFinite(Number(value)))
          .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value)))])
      )
    : {};

  return {
    name: typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim().slice(0, 40)
      : DEFAULT_HAMSTER_STATE.name,
    alive: raw.alive !== false,
    hunger: clampStat(Number(raw.hunger ?? DEFAULT_HAMSTER_STATE.hunger)),
    thirst: clampStat(Number(raw.thirst ?? DEFAULT_HAMSTER_STATE.thirst)),
    happiness: clampStat(Number(raw.happiness ?? DEFAULT_HAMSTER_STATE.happiness)),
    hygiene: clampStat(Number(raw.hygiene ?? DEFAULT_HAMSTER_STATE.hygiene)),
    energy: clampStat(Number(raw.energy ?? DEFAULT_HAMSTER_STATE.energy)),
    level: Math.max(1, Math.floor(Number(raw.level ?? DEFAULT_HAMSTER_STATE.level))),
    xpEarned: Math.max(0, Math.floor(Number(raw.xpEarned ?? 0))),
    missedCareDays: Math.max(0, Math.floor(Number(raw.missedCareDays ?? 0))),
    careStreak: Math.max(0, Math.floor(Number(raw.careStreak ?? 0))),
    lastCareDate: typeof raw.lastCareDate === "string" ? raw.lastCareDate : null,
    lastInteractionAt: typeof raw.lastInteractionAt === "string" ? raw.lastInteractionAt : null,
    interactionCounts: counts,
  };
}

export function deriveHamsterSnapshot(
  state: Partial<HamsterState> | null | undefined,
  now = new Date()
): HamsterState {
  const normalized = normalizeHamsterState(state);
  if (!normalized.alive) return normalized;

  const missed = daysBetween(normalized.lastCareDate, now);
  if (missed <= 0) return normalized;
  if (missed < 2) {
    return {
      ...normalized,
      missedCareDays: missed,
    };
  }

  const decayed: HamsterState = {
    ...normalized,
    missedCareDays: missed,
    hunger: clampStat(normalized.hunger - missed * 28),
    thirst: clampStat(normalized.thirst - missed * 32),
    happiness: clampStat(normalized.happiness - missed * 18),
    hygiene: clampStat(normalized.hygiene - missed * 16),
    energy: clampStat(normalized.energy - missed * 10),
  };

  if (missed >= 3) {
    return {
      ...decayed,
      alive: false,
      hunger: 0,
      thirst: 0,
      happiness: Math.min(decayed.happiness, 20),
      energy: 0,
      careStreak: 0,
    };
  }

  return decayed;
}

export function applyHamsterAction(
  state: Partial<HamsterState> | null | undefined,
  action: HamsterAction,
  now = new Date()
): { next: HamsterState; xpAmount: number } {
  const current = deriveHamsterSnapshot(state, now);
  const today = dateKey(now);

  if (!HAMSTER_ACTIONS.includes(action)) {
    return { next: current, xpAmount: 0 };
  }

  if (!current.alive && action !== "revive") {
    return {
      next: {
        ...current,
        lastInteractionAt: now.toISOString(),
        interactionCounts: {
          ...current.interactionCounts,
          [action]: (current.interactionCounts[action] ?? 0) + 1,
        },
      },
      xpAmount: 0,
    };
  }

  if (action === "revive") {
    return {
      next: {
        ...DEFAULT_HAMSTER_STATE,
        name: current.name || DEFAULT_HAMSTER_STATE.name,
        lastCareDate: today,
        lastInteractionAt: now.toISOString(),
        interactionCounts: {
          ...current.interactionCounts,
          revive: (current.interactionCounts.revive ?? 0) + 1,
        },
      },
      xpAmount: 0,
    };
  }

  const next: HamsterState = {
    ...current,
    lastInteractionAt: now.toISOString(),
    interactionCounts: {
      ...current.interactionCounts,
      [action]: (current.interactionCounts[action] ?? 0) + 1,
    },
  };

  if (action === "feed") {
    next.hunger = clampStat(next.hunger + 35);
    next.hygiene = clampStat(next.hygiene - 5);
  } else if (action === "water") {
    next.thirst = clampStat(next.thirst + 35);
  } else if (action === "play") {
    next.happiness = clampStat(next.happiness + 25);
    next.energy = clampStat(next.energy - 15);
    next.hygiene = clampStat(next.hygiene - 5);
  } else if (action === "pet") {
    next.happiness = clampStat(next.happiness + 20);
    next.energy = clampStat(next.energy + 5);
  } else if (action === "clean") {
    next.hygiene = clampStat(next.hygiene + 35);
    next.happiness = clampStat(next.happiness + 5);
  } else if (action === "nap") {
    next.energy = clampStat(next.energy + 35);
    next.hunger = clampStat(next.hunger - 5);
    next.thirst = clampStat(next.thirst - 5);
  }

  const lastGap = daysBetween(next.lastCareDate, now);
  if (CARE_ACTIONS.has(action) && next.lastCareDate !== today) {
    next.careStreak = lastGap === 1 ? next.careStreak + 1 : 1;
    next.missedCareDays = 0;
    next.lastCareDate = today;
  } else if (CARE_ACTIONS.has(action)) {
    next.missedCareDays = 0;
  }

  const xpAmount = CARE_ACTIONS.has(action) ? 4 : 0;
  next.xpEarned += xpAmount;
  const nextLevel = Math.max(1, Math.floor(next.xpEarned / 100) + 1);
  next.level = Math.max(next.level, nextLevel);

  return { next, xpAmount };
}
