export const DESKTOP_CURSOR_STYLES = [
  "toon-hand",
  "system",
  "middle-finger",
  "paintbrush",
  "eggplant",
] as const;

export type DesktopCursorStyle = (typeof DESKTOP_CURSOR_STYLES)[number];

export const DESKTOP_GRAVITY_MODES = ["on", "zero", "off"] as const;
export type DesktopGravityMode = (typeof DESKTOP_GRAVITY_MODES)[number];

export const DESKTOP_BACKGROUND_FITS = ["cover", "contain", "tile", "center"] as const;
export type DesktopBackgroundFit = (typeof DESKTOP_BACKGROUND_FITS)[number];

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
    label: "Classic Gray",
    desktopColor: "#3a6ea5",
    windowColor: "#c0c0c0",
    activeTitleColor: "#000080",
    activeTitleTextColor: "#ffffff",
    inactiveTitleColor: "#808080",
    inactiveTitleTextColor: "#dfdfdf",
    textColor: "#000000",
    highlightColor: "#000080",
    buttonFace: "#c0c0c0",
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
    label: "Storm Fountain",
    desktopColor: "#23395b",
    windowColor: "#b8c7d9",
    activeTitleColor: "#1f4f6f",
    activeTitleTextColor: "#ffffff",
    inactiveTitleColor: "#6f8295",
    inactiveTitleTextColor: "#ffffff",
    textColor: "#07121f",
    highlightColor: "#2f6f91",
    buttonFace: "#b8c7d9",
  },
  {
    key: "violet-computer",
    label: "Violet Computer",
    desktopColor: "#4f3b78",
    windowColor: "#d8c7e8",
    activeTitleColor: "#5d2380",
    activeTitleTextColor: "#ffffff",
    inactiveTitleColor: "#8e78a9",
    inactiveTitleTextColor: "#ffffff",
    textColor: "#1d1029",
    highlightColor: "#7a2ca8",
    buttonFace: "#d8c7e8",
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
  cursorStyle: "toon-hand",
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
  if (trimmed.startsWith("/")) return trimmed.slice(0, 600);
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 600);
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(trimmed)) {
    return trimmed.slice(0, 500_000);
  }
  return null;
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
