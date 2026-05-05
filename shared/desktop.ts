export const DESKTOP_CURSOR_STYLES = [
  "eggplant",
  "system",
  "pixel-arrow",
  "crosshair",
  "bow-arrow",
  "carrot",
  "horse-runner",
  "horf",
  "guinea-pig-runner",
  "ant-runner",
  "a11-rocket",
  "hatchet",
  "tezos-classic",
  "tezos-current",
  "blang-side-eye",
  "toon-hand",
  "middle-finger",
  "paintbrush",
  "rainbow-hitbox",
  "spinning-slice",
  "floppy-spinner",
] as const;

export type DesktopCursorStyle = (typeof DESKTOP_CURSOR_STYLES)[number];

export const DESKTOP_CURSOR_LABELS: Record<DesktopCursorStyle, string> = {
  eggplant: "Aubergine",
  system: "System",
  "pixel-arrow": "Pixel Arrow",
  crosshair: "Crosshair",
  "bow-arrow": "Bow & Arrow",
  carrot: "Carrot",
  "horse-runner": "Horse Runner",
  horf: "Horf",
  "guinea-pig-runner": "Guinea Pig",
  "ant-runner": "Ant March",
  "a11-rocket": "A11 Rocket",
  hatchet: "Hatchet",
  "tezos-classic": "Classic Tezos",
  "tezos-current": "Tezos Blue",
  "blang-side-eye": "Blang Side-Eye",
  "toon-hand": "Cartoon Hand",
  "middle-finger": "Middle Finger",
  paintbrush: "Paintbrush",
  "rainbow-hitbox": "Rainbow Hitbox",
  "spinning-slice": "Pizza Slice",
  "floppy-spinner": "Floppy Spinner",
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
  "scoop",
  "poop",
  "medicine",
  "nap",
  "revive",
] as const;

export type HamsterAction = (typeof HAMSTER_ACTIONS)[number];

export const HAMSTER_COLOR_SCHEMES = [
  {
    key: "golden",
    label: "Golden Nugget",
    fur: "#c89155",
    belly: "#f1d5a8",
    ear: "#e5a579",
    spot: "#9b6638",
    accent: "#5a321b",
  },
  {
    key: "aubergine",
    label: "Aubergine",
    fur: "#6a2c70",
    belly: "#f4b7d2",
    ear: "#b76da4",
    spot: "#2f1735",
    accent: "#f7d060",
  },
  {
    key: "calico",
    label: "Calico Gobstopper",
    fur: "#f0c57a",
    belly: "#fff1d6",
    ear: "#ef9f76",
    spot: "#2e2018",
    accent: "#d45a2f",
  },
  {
    key: "alley-tuxedo",
    label: "Alley Tuxedo",
    fur: "#333333",
    belly: "#f0eee8",
    ear: "#777777",
    spot: "#111111",
    accent: "#f7c948",
  },
  {
    key: "blueberry",
    label: "Blueberry Tank",
    fur: "#3d5a80",
    belly: "#c7e6ff",
    ear: "#7ca7c7",
    spot: "#1d3557",
    accent: "#f2cc8f",
  },
  {
    key: "matcha",
    label: "Matcha Static",
    fur: "#7aa95c",
    belly: "#d8f3b8",
    ear: "#a7c97e",
    spot: "#31572c",
    accent: "#f48c06",
  },
  {
    key: "bubblegum",
    label: "Bubblegum",
    fur: "#ff8fab",
    belly: "#ffe5ec",
    ear: "#ffb3c6",
    spot: "#9d4edd",
    accent: "#3a0ca3",
  },
  {
    key: "ash",
    label: "Dust Buster",
    fur: "#8d99ae",
    belly: "#edf2f4",
    ear: "#c7ccd8",
    spot: "#4a5568",
    accent: "#d90429",
  },
  {
    key: "mustard",
    label: "Mustard Packet",
    fur: "#e0a800",
    belly: "#fff3b0",
    ear: "#f4c95d",
    spot: "#6b3e12",
    accent: "#d62828",
  },
  {
    key: "mint-chip",
    label: "Mint Chip",
    fur: "#7bd389",
    belly: "#e6ffed",
    ear: "#a8e6b1",
    spot: "#2b2d42",
    accent: "#ff70a6",
  },
  {
    key: "cinnamon",
    label: "Cinnamon Roll",
    fur: "#a15c38",
    belly: "#f3c892",
    ear: "#d08c60",
    spot: "#6f3d2e",
    accent: "#f6f1d1",
  },
  {
    key: "highlighter",
    label: "Highlighter",
    fur: "#d9ff00",
    belly: "#fbffbc",
    ear: "#ecff66",
    spot: "#222222",
    accent: "#00a6fb",
  },
  {
    key: "midnight",
    label: "Midnight Snack",
    fur: "#111827",
    belly: "#d1d5db",
    ear: "#4b5563",
    spot: "#030712",
    accent: "#38bdf8",
  },
  {
    key: "peach",
    label: "Peach Pit",
    fur: "#f7a072",
    belly: "#ffe8cc",
    ear: "#ffc09f",
    spot: "#9c6644",
    accent: "#5f0f40",
  },
  {
    key: "radioactive",
    label: "Radioactive Lime",
    fur: "#39ff14",
    belly: "#eaffd0",
    ear: "#9cff7a",
    spot: "#0b3d02",
    accent: "#ff00a8",
  },
  {
    key: "printer-ink",
    label: "Printer Ink",
    fur: "#0f172a",
    belly: "#e2e8f0",
    ear: "#64748b",
    spot: "#06b6d4",
    accent: "#f43f5e",
  },
  {
    key: "neapolitan",
    label: "Neapolitan",
    fur: "#c08457",
    belly: "#fff1f2",
    ear: "#f9a8d4",
    spot: "#5c4033",
    accent: "#facc15",
  },
  {
    key: "tezos-blue",
    label: "Tezos Blue",
    fur: "#2c7df7",
    belly: "#dbeafe",
    ear: "#7bb2ff",
    spot: "#123a7a",
    accent: "#ffffff",
  },
  {
    key: "hotdog",
    label: "Hotdog Stand",
    fur: "#ff0000",
    belly: "#ffff00",
    ear: "#ff7a00",
    spot: "#7f1d1d",
    accent: "#0000ff",
  },
  {
    key: "latte",
    label: "Gas Station Latte",
    fur: "#b08968",
    belly: "#ede0d4",
    ear: "#ddb892",
    spot: "#7f5539",
    accent: "#432818",
  },
  {
    key: "cotton-candy",
    label: "Cotton Candy",
    fur: "#80ffdb",
    belly: "#ffc8dd",
    ear: "#bde0fe",
    spot: "#c77dff",
    accent: "#ffafcc",
  },
  {
    key: "warehouse",
    label: "Warehouse Dust",
    fur: "#626c66",
    belly: "#d9ddcf",
    ear: "#9aa08f",
    spot: "#2f332f",
    accent: "#e85d04",
  },
  {
    key: "cranberry",
    label: "Cranberry Sauce",
    fur: "#9d0208",
    belly: "#ffccd5",
    ear: "#d00000",
    spot: "#370617",
    accent: "#ffba08",
  },
  {
    key: "crt-green",
    label: "CRT Green",
    fur: "#008f11",
    belly: "#b6ffb6",
    ear: "#00c853",
    spot: "#003b00",
    accent: "#faff00",
  },
] as const;

export type HamsterColorSchemeKey = (typeof HAMSTER_COLOR_SCHEMES)[number]["key"];

const DEFAULT_HAMSTER_SCHEME = HAMSTER_COLOR_SCHEMES[0];

export function getHamsterColorScheme(key: unknown) {
  return (
    HAMSTER_COLOR_SCHEMES.find((scheme) => scheme.key === key) ??
    DEFAULT_HAMSTER_SCHEME
  );
}

export const HAMSTER_CORE_STAT_KEYS = [
  "metabolism",
  "speed",
  "strength",
  "intelligence",
  "stamina",
  "sociability",
  "grit",
  "luck",
] as const;

export type HamsterCoreStatKey = (typeof HAMSTER_CORE_STAT_KEYS)[number];
export type HamsterCoreStats = Record<HamsterCoreStatKey, number>;

export const HAMSTER_CORE_STAT_LABELS: Record<HamsterCoreStatKey, string> = {
  metabolism: "Metabolism",
  speed: "Speed",
  strength: "Strength",
  intelligence: "Brains",
  stamina: "Stamina",
  sociability: "Social",
  grit: "Grit",
  luck: "Luck",
};

export const HAMSTER_RARITY_TIERS = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type HamsterRarityTier = (typeof HAMSTER_RARITY_TIERS)[number];

export const HAMSTER_ATTRIBUTE_KEYS = [
  "radioactive",
  "buff",
  "stealthy",
  "tiny-dynamo",
  "genius",
  "iron-gut",
  "glitter-brain",
  "sleepy-tank",
] as const;

export type HamsterAttributeKey = (typeof HAMSTER_ATTRIBUTE_KEYS)[number];

export interface HamsterAttribute {
  key: HamsterAttributeKey;
  label: string;
  rarity: Exclude<HamsterRarityTier, "common">;
  description: string;
  bonuses: Partial<HamsterCoreStats>;
  forcedColorSchemeKey?: HamsterColorSchemeKey;
}

export interface HamsterPhenotype {
  sizeClass: "tiny" | "standard" | "chonky" | "buff";
  forcedColorSchemeKey: HamsterColorSchemeKey | null;
  glow: boolean;
  stealth: boolean;
  visualTags: string[];
}

export interface HamsterGenetics {
  version: 1;
  seed: string;
  generation: number;
  rarityTier: HamsterRarityTier;
  baseStats: HamsterCoreStats;
  statBonuses: HamsterCoreStats;
  effectiveStats: HamsterCoreStats;
  attributes: HamsterAttribute[];
  phenotype: HamsterPhenotype;
  ancestry: {
    parents: Array<{
      seed: string;
      name?: string;
    }>;
  };
}

const HAMSTER_ZERO_STATS = Object.fromEntries(
  HAMSTER_CORE_STAT_KEYS.map((key) => [key, 0])
) as HamsterCoreStats;

const HAMSTER_BASELINE_STATS = Object.fromEntries(
  HAMSTER_CORE_STAT_KEYS.map((key) => [key, 55])
) as HamsterCoreStats;

export const HAMSTER_ATTRIBUTE_DEFS: Record<HamsterAttributeKey, HamsterAttribute & { chance: number }> = {
  radioactive: {
    key: "radioactive",
    label: "Radioactive",
    rarity: "legendary",
    chance: 0.012,
    description: "Glows violently, burns calories fast, and gets weird luck.",
    forcedColorSchemeKey: "radioactive",
    bonuses: { metabolism: 18, grit: 8, luck: 10 },
  },
  buff: {
    key: "buff",
    label: "Buff",
    rarity: "epic",
    chance: 0.028,
    description: "A compact gym owner with suspicious shoulders.",
    bonuses: { strength: 24, stamina: 10, speed: -4 },
  },
  stealthy: {
    key: "stealthy",
    label: "Stealthy",
    rarity: "rare",
    chance: 0.045,
    description: "Dark coat, quiet feet, unsettling commitment to corners.",
    forcedColorSchemeKey: "midnight",
    bonuses: { speed: 8, intelligence: 8, luck: 5 },
  },
  "tiny-dynamo": {
    key: "tiny-dynamo",
    label: "Tiny Dynamo",
    rarity: "rare",
    chance: 0.05,
    description: "Small, quick, and operating above recommended voltage.",
    bonuses: { speed: 16, stamina: 7, strength: -5 },
  },
  genius: {
    key: "genius",
    label: "Genius",
    rarity: "rare",
    chance: 0.042,
    description: "Suspiciously bright eyes. Probably knows where the wires are.",
    bonuses: { intelligence: 22, sociability: 4 },
  },
  "iron-gut": {
    key: "iron-gut",
    label: "Iron Gut",
    rarity: "uncommon",
    chance: 0.075,
    description: "Slower food burn, sturdy body, questionable table manners.",
    bonuses: { metabolism: -12, grit: 12, stamina: 5 },
  },
  "glitter-brain": {
    key: "glitter-brain",
    label: "Glitter Brain",
    rarity: "uncommon",
    chance: 0.068,
    description: "Distractible but charismatic enough to make it everyone else's problem.",
    bonuses: { sociability: 16, luck: 8, intelligence: -4 },
  },
  "sleepy-tank": {
    key: "sleepy-tank",
    label: "Sleepy Tank",
    rarity: "uncommon",
    chance: 0.072,
    description: "Heavy sleeper, heavy paws, excellent late-race endurance.",
    bonuses: { stamina: 14, strength: 7, speed: -6 },
  },
};

export const HAMSTER_ATTRIBUTE_LABELS: Record<HamsterAttributeKey, string> =
  Object.fromEntries(
    HAMSTER_ATTRIBUTE_KEYS.map((key) => [key, HAMSTER_ATTRIBUTE_DEFS[key].label])
  ) as Record<HamsterAttributeKey, string>;

function clampGeneticStat(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function normalizeCoreStats(
  input: unknown,
  fallback: HamsterCoreStats,
  allowNegative = false
): HamsterCoreStats {
  const raw = isRecord(input) ? input : {};
  return Object.fromEntries(
    HAMSTER_CORE_STAT_KEYS.map((key) => {
      const value = Number(raw[key] ?? fallback[key]);
      if (!Number.isFinite(value)) return [key, fallback[key]];
      if (allowNegative) return [key, Math.max(-50, Math.min(50, Math.round(value)))];
      return [key, clampGeneticStat(value)];
    })
  ) as HamsterCoreStats;
}

function addCoreStats(base: HamsterCoreStats, bonus: HamsterCoreStats): HamsterCoreStats {
  return Object.fromEntries(
    HAMSTER_CORE_STAT_KEYS.map((key) => [key, clampGeneticStat(base[key] + bonus[key])])
  ) as HamsterCoreStats;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function seededRandom(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollCoreStat(random: () => number): number {
  const shaped = (random() + random() + random()) / 3;
  return clampGeneticStat(32 + shaped * 62);
}

function rollBaseStats(seed: string): HamsterCoreStats {
  const random = seededRandom(`${seed}:core`);
  return Object.fromEntries(
    HAMSTER_CORE_STAT_KEYS.map((key) => [key, rollCoreStat(random)])
  ) as HamsterCoreStats;
}

function rarityRank(rarity: HamsterRarityTier): number {
  return HAMSTER_RARITY_TIERS.indexOf(rarity);
}

function rarityFromAttributes(attributes: HamsterAttribute[]): HamsterRarityTier {
  return attributes.reduce<HamsterRarityTier>(
    (best, attribute) => (rarityRank(attribute.rarity) > rarityRank(best) ? attribute.rarity : best),
    "common"
  );
}

function normalizeHamsterAttribute(input: unknown): HamsterAttribute | null {
  const key =
    typeof input === "string"
      ? input
      : isRecord(input) && typeof input.key === "string"
        ? input.key
        : "";
  if (!HAMSTER_ATTRIBUTE_KEYS.includes(key as HamsterAttributeKey)) return null;
  const def = HAMSTER_ATTRIBUTE_DEFS[key as HamsterAttributeKey];
  return {
    key: def.key,
    label: def.label,
    rarity: def.rarity,
    description: def.description,
    bonuses: { ...def.bonuses },
    forcedColorSchemeKey: def.forcedColorSchemeKey,
  };
}

function rollAttributes(seed: string): HamsterAttribute[] {
  const random = seededRandom(`${seed}:attributes`);
  const rolled: HamsterAttribute[] = [];
  for (const key of HAMSTER_ATTRIBUTE_KEYS) {
    const def = HAMSTER_ATTRIBUTE_DEFS[key];
    if (rolled.length >= 2) break;
    if (random() < def.chance) {
      rolled.push(normalizeHamsterAttribute(key)!);
    }
  }
  return rolled;
}

function bonusesFromAttributes(attributes: HamsterAttribute[]): HamsterCoreStats {
  const bonuses = { ...HAMSTER_ZERO_STATS };
  for (const attribute of attributes) {
    for (const key of HAMSTER_CORE_STAT_KEYS) {
      bonuses[key] += Math.round(Number(attribute.bonuses[key] ?? 0));
    }
  }
  return normalizeCoreStats(bonuses, HAMSTER_ZERO_STATS, true);
}

function phenotypeFromStats(
  stats: HamsterCoreStats,
  attributes: HamsterAttribute[]
): HamsterPhenotype {
  const forcedColorSchemeKey =
    attributes.find((attribute) => attribute.forcedColorSchemeKey)?.forcedColorSchemeKey ?? null;
  const attributeKeys = new Set(attributes.map((attribute) => attribute.key));
  const sizeClass =
    attributeKeys.has("buff") || stats.strength >= 88
      ? "buff"
      : attributeKeys.has("tiny-dynamo") || (stats.speed >= 82 && stats.strength <= 46)
        ? "tiny"
        : stats.strength >= 72 && stats.stamina >= 70
          ? "chonky"
          : "standard";

  return {
    sizeClass,
    forcedColorSchemeKey,
    glow: attributeKeys.has("radioactive"),
    stealth: attributeKeys.has("stealthy"),
    visualTags: [
      ...(attributeKeys.has("radioactive") ? ["glow"] : []),
      ...(attributeKeys.has("stealthy") ? ["shadow-coat"] : []),
      ...(attributeKeys.has("buff") ? ["chunky-shoulders"] : []),
      ...(sizeClass === "tiny" ? ["tiny-frame"] : []),
    ],
  };
}

export const DEFAULT_HAMSTER_GENETICS: HamsterGenetics = {
  version: 1,
  seed: "legacy-default",
  generation: 0,
  rarityTier: "common",
  baseStats: HAMSTER_BASELINE_STATS,
  statBonuses: HAMSTER_ZERO_STATS,
  effectiveStats: HAMSTER_BASELINE_STATS,
  attributes: [],
  phenotype: {
    sizeClass: "standard",
    forcedColorSchemeKey: null,
    glow: false,
    stealth: false,
    visualTags: [],
  },
  ancestry: { parents: [] },
};

export function normalizeHamsterGenetics(input: unknown): HamsterGenetics {
  const raw = isRecord(input) ? input : {};
  const rawAttributes = Array.isArray(raw.attributes) ? raw.attributes : [];
  const attributes = rawAttributes
    .map(normalizeHamsterAttribute)
    .filter((attribute): attribute is HamsterAttribute => Boolean(attribute))
    .slice(0, 3);
  const baseStats = normalizeCoreStats(raw.baseStats, DEFAULT_HAMSTER_GENETICS.baseStats);
  const statBonuses = normalizeCoreStats(
    raw.statBonuses,
    attributes.length > 0 ? bonusesFromAttributes(attributes) : DEFAULT_HAMSTER_GENETICS.statBonuses,
    true
  );
  const effectiveStats = addCoreStats(baseStats, statBonuses);
  const parents = isRecord(raw.ancestry) && Array.isArray(raw.ancestry.parents)
    ? raw.ancestry.parents
        .filter(isRecord)
        .map((parent) => ({
          seed: typeof parent.seed === "string" ? parent.seed.slice(0, 96) : "",
          name: typeof parent.name === "string" ? parent.name.slice(0, 40) : undefined,
        }))
        .filter((parent) => parent.seed)
        .slice(0, 2)
    : [];

  return {
    version: 1,
    seed: typeof raw.seed === "string" && raw.seed ? raw.seed.slice(0, 128) : DEFAULT_HAMSTER_GENETICS.seed,
    generation: Math.max(0, Math.min(50, Math.floor(Number(raw.generation ?? 0) || 0))),
    rarityTier: rarityFromAttributes(attributes),
    baseStats,
    statBonuses,
    effectiveStats,
    attributes,
    phenotype: phenotypeFromStats(effectiveStats, attributes),
    ancestry: { parents },
  };
}

export function generateHamsterGenetics(
  seed: string,
  options: {
    generation?: number;
    ancestry?: HamsterGenetics["ancestry"];
  } = {}
): HamsterGenetics {
  const safeSeed = seed.trim().slice(0, 128) || "founder";
  const attributes = rollAttributes(safeSeed);
  const baseStats = rollBaseStats(safeSeed);
  const statBonuses = bonusesFromAttributes(attributes);
  const effectiveStats = addCoreStats(baseStats, statBonuses);
  return {
    version: 1,
    seed: safeSeed,
    generation: Math.max(0, Math.min(50, Math.floor(Number(options.generation ?? 0) || 0))),
    rarityTier: rarityFromAttributes(attributes),
    baseStats,
    statBonuses,
    effectiveStats,
    attributes,
    phenotype: phenotypeFromStats(effectiveStats, attributes),
    ancestry: {
      parents: options.ancestry?.parents?.slice(0, 2) ?? [],
    },
  };
}

export function resolveHamsterColorSchemeKey(
  preferred: unknown,
  genetics: unknown
): HamsterColorSchemeKey {
  const normalizedGenetics = normalizeHamsterGenetics(genetics);
  return getHamsterColorScheme(
    normalizedGenetics.phenotype.forcedColorSchemeKey ?? preferred
  ).key;
}

function chooseGeneratedColorScheme(seed: string, genetics: HamsterGenetics): HamsterColorSchemeKey {
  if (genetics.phenotype.forcedColorSchemeKey) return genetics.phenotype.forcedColorSchemeKey;
  const random = seededRandom(`${seed}:coat`);
  const index = Math.floor(random() * HAMSTER_COLOR_SCHEMES.length);
  return HAMSTER_COLOR_SCHEMES[Math.max(0, Math.min(HAMSTER_COLOR_SCHEMES.length - 1, index))].key;
}

export function createGeneratedHamsterState({
  seed,
  now,
  name = DEFAULT_HAMSTER_STATE.name,
}: {
  seed: string;
  now?: Date;
  name?: string;
}): HamsterState {
  const genetics = generateHamsterGenetics(seed);
  const stats = genetics.effectiveStats;
  const random = seededRandom(`${genetics.seed}:vitals`);
  const jitter = () => Math.round((random() - 0.5) * 10);
  const colorSchemeKey = chooseGeneratedColorScheme(genetics.seed, genetics);

  return {
    ...DEFAULT_HAMSTER_STATE,
    name: name.trim().slice(0, 40) || DEFAULT_HAMSTER_STATE.name,
    colorSchemeKey,
    genetics,
    hunger: clampStat(59 + stats.stamina * 0.12 - stats.metabolism * 0.08 + jitter()),
    thirst: clampStat(60 + stats.grit * 0.1 - stats.metabolism * 0.07 + jitter()),
    happiness: clampStat(48 + stats.sociability * 0.24 + stats.luck * 0.06 + jitter()),
    hygiene: clampStat(54 + stats.intelligence * 0.08 + stats.grit * 0.05 + jitter()),
    energy: clampStat(45 + stats.stamina * 0.24 + stats.speed * 0.08 + jitter()),
    lastCareDate: now ? dateKey(now) : null,
    lastInteractionAt: now ? now.toISOString() : null,
  };
}

export interface HamsterState {
  name: string;
  colorSchemeKey: HamsterColorSchemeKey;
  genetics: HamsterGenetics;
  alive: boolean;
  hunger: number;
  thirst: number;
  happiness: number;
  hygiene: number;
  energy: number;
  sick: boolean;
  sicknessRisk: number;
  medicineDoses: number;
  restDoses: number;
  poopExposure: number;
  level: number;
  xpEarned: number;
  carePoints: number;
  missedCareDays: number;
  careStreak: number;
  lastCareDate: string | null;
  lastInteractionAt: string | null;
  interactionCounts: Record<string, number>;
}

export const DEFAULT_HAMSTER_STATE: HamsterState = {
  name: "Niblet",
  colorSchemeKey: DEFAULT_HAMSTER_SCHEME.key,
  genetics: DEFAULT_HAMSTER_GENETICS,
  alive: true,
  hunger: 72,
  thirst: 72,
  happiness: 68,
  hygiene: 70,
  energy: 64,
  sick: false,
  sicknessRisk: 0,
  medicineDoses: 0,
  restDoses: 0,
  poopExposure: 0,
  level: 1,
  xpEarned: 0,
  carePoints: 0,
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
  "scoop",
  "medicine",
  "nap",
]);

export const HAMSTER_HEALTH_COUNT_KEYS = {
  sick: "__health_sick",
  sicknessRisk: "__health_sickness_risk",
  medicineDoses: "__health_medicine_doses",
  restDoses: "__health_rest_doses",
  poopExposure: "__health_poop_exposure",
} as const;

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampPetCounter(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(999, Math.floor(value)));
}

export function serializeHamsterInteractionCounts(state: HamsterState): Record<string, number> {
  return {
    ...state.interactionCounts,
    [HAMSTER_HEALTH_COUNT_KEYS.sick]: state.sick ? 1 : 0,
    [HAMSTER_HEALTH_COUNT_KEYS.sicknessRisk]: clampStat(state.sicknessRisk),
    [HAMSTER_HEALTH_COUNT_KEYS.medicineDoses]: clampPetCounter(state.medicineDoses),
    [HAMSTER_HEALTH_COUNT_KEYS.restDoses]: clampPetCounter(state.restDoses),
    [HAMSTER_HEALTH_COUNT_KEYS.poopExposure]: clampPetCounter(state.poopExposure),
  };
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
    genetics: normalizeHamsterGenetics(raw.genetics),
    colorSchemeKey: resolveHamsterColorSchemeKey(raw.colorSchemeKey, raw.genetics),
    alive: raw.alive !== false,
    hunger: clampStat(Number(raw.hunger ?? DEFAULT_HAMSTER_STATE.hunger)),
    thirst: clampStat(Number(raw.thirst ?? DEFAULT_HAMSTER_STATE.thirst)),
    happiness: clampStat(Number(raw.happiness ?? DEFAULT_HAMSTER_STATE.happiness)),
    hygiene: clampStat(Number(raw.hygiene ?? DEFAULT_HAMSTER_STATE.hygiene)),
    energy: clampStat(Number(raw.energy ?? DEFAULT_HAMSTER_STATE.energy)),
    sick:
      typeof raw.sick === "boolean"
        ? raw.sick
        : Number(counts[HAMSTER_HEALTH_COUNT_KEYS.sick] ?? 0) > 0,
    sicknessRisk: clampStat(Number(raw.sicknessRisk ?? counts[HAMSTER_HEALTH_COUNT_KEYS.sicknessRisk] ?? 0)),
    medicineDoses: clampPetCounter(Number(raw.medicineDoses ?? counts[HAMSTER_HEALTH_COUNT_KEYS.medicineDoses] ?? 0)),
    restDoses: clampPetCounter(Number(raw.restDoses ?? counts[HAMSTER_HEALTH_COUNT_KEYS.restDoses] ?? 0)),
    poopExposure: clampPetCounter(Number(raw.poopExposure ?? counts[HAMSTER_HEALTH_COUNT_KEYS.poopExposure] ?? 0)),
    level: Math.max(1, Math.floor(Number(raw.level ?? DEFAULT_HAMSTER_STATE.level))),
    xpEarned: Math.max(0, Math.floor(Number(raw.xpEarned ?? 0))),
    carePoints: Math.max(0, Math.floor(Number(raw.carePoints ?? 0))),
    missedCareDays: Math.max(0, Math.floor(Number(raw.missedCareDays ?? 0))),
    careStreak: Math.max(0, Math.floor(Number(raw.careStreak ?? 0))),
    lastCareDate: typeof raw.lastCareDate === "string" ? raw.lastCareDate : null,
    lastInteractionAt: typeof raw.lastInteractionAt === "string" ? raw.lastInteractionAt : null,
    interactionCounts: counts,
  };
}

function sicknessRoll(state: HamsterState, now: Date): number {
  const base =
    now.getTime() / 977 +
    state.sicknessRisk * 13.37 +
    state.poopExposure * 31.11 +
    (state.interactionCounts.poop ?? 0) * 17.91;
  return Math.abs(Math.sin(base)) * 100;
}

function maybeApplySickness(state: HamsterState, now: Date): HamsterState {
  if (!state.alive || state.sick || state.sicknessRisk <= 0) return state;
  const chance = Math.min(22, Math.max(0, (state.sicknessRisk - 18) * 0.16));
  if (state.sicknessRisk >= 100 || sicknessRoll(state, now) < chance) {
    return {
      ...state,
      sick: true,
      happiness: clampStat(state.happiness - 8),
      energy: clampStat(state.energy - 12),
    };
  }
  return state;
}

export function deriveHamsterSnapshot(
  state: Partial<HamsterState> | null | undefined,
  now = new Date()
): HamsterState {
  const normalized = normalizeHamsterState(state);
  if (!normalized.alive) return normalized;

  const missed = daysBetween(normalized.lastCareDate, now);
  if (missed <= 0) return normalized;
  const metabolismDrain = 0.72 + normalized.genetics.effectiveStats.metabolism / 150;
  const gritBuffer = Math.max(0.82, 1 - Math.max(0, normalized.genetics.effectiveStats.grit - 55) / 300);
  if (missed < 2) {
    return maybeApplySickness({
      ...normalized,
      missedCareDays: missed,
      sicknessRisk:
        normalized.poopExposure > 0
          ? clampStat(normalized.sicknessRisk + missed * (3 + normalized.poopExposure))
          : normalized.sicknessRisk,
      energy: normalized.sick ? clampStat(normalized.energy - missed * 5) : normalized.energy,
    }, now);
  }

  let decayed: HamsterState = {
    ...normalized,
    missedCareDays: missed,
    hunger: clampStat(normalized.hunger - missed * 28 * metabolismDrain),
    thirst: clampStat(normalized.thirst - missed * 32 * metabolismDrain),
    happiness: clampStat(normalized.happiness - missed * 18),
    hygiene: clampStat(normalized.hygiene - missed * 16 * gritBuffer),
    energy: clampStat(normalized.energy - missed * 10 * metabolismDrain),
    sicknessRisk:
      normalized.poopExposure > 0
        ? clampStat(normalized.sicknessRisk + missed * (5 + normalized.poopExposure * 2))
        : normalized.sicknessRisk,
  };
  if (decayed.sick) {
    decayed = {
      ...decayed,
      happiness: clampStat(decayed.happiness - missed * 6),
      energy: clampStat(decayed.energy - missed * 8),
    };
  } else {
    decayed = maybeApplySickness(decayed, now);
  }

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
        genetics: current.genetics,
        colorSchemeKey: resolveHamsterColorSchemeKey(
          current.colorSchemeKey || DEFAULT_HAMSTER_STATE.colorSchemeKey,
          current.genetics
        ),
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

  let next: HamsterState = {
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
    next.hygiene = clampStat(next.hygiene - 3);
  } else if (action === "clean") {
    next.hygiene = clampStat(next.hygiene + 40);
    next.happiness = clampStat(next.happiness + 5);
    next.sicknessRisk = 0;
    next.poopExposure = 0;
  } else if (action === "scoop") {
    next.hygiene = clampStat(next.hygiene + 15);
    next.happiness = clampStat(next.happiness + 2);
    next.carePoints += 1;
  } else if (action === "poop") {
    const nextExposure = clampPetCounter(next.poopExposure + 1);
    next.poopExposure = nextExposure;
    next.hygiene = clampStat(next.hygiene - Math.min(11, 5 + nextExposure));
    next.happiness = clampStat(next.happiness - 2);
    next.sicknessRisk = clampStat(next.sicknessRisk + 4 + nextExposure * 3);
  } else if (action === "medicine") {
    next.medicineDoses = clampPetCounter(next.medicineDoses + 1);
    next.sicknessRisk = clampStat(next.sicknessRisk - (next.sick ? 20 : 10));
    next.happiness = clampStat(next.happiness - 1);
  } else if (action === "nap") {
    next.energy = clampStat(next.energy + 35);
    next.hunger = clampStat(next.hunger - 5);
    next.thirst = clampStat(next.thirst - 5);
    if (next.sick) next.restDoses = clampPetCounter(next.restDoses + 1);
  }

  if (next.sick && next.medicineDoses > 0 && next.restDoses > 0) {
    next.sick = false;
    next.sicknessRisk = 8;
    next.medicineDoses = 0;
    next.restDoses = 0;
    next.happiness = clampStat(next.happiness + 8);
    next.energy = clampStat(next.energy + 10);
  } else if (!next.sick) {
    next = maybeApplySickness(next, now);
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
