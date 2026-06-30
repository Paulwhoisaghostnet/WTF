import {
  DEFAULT_DESKTOP_FONT_PACK_KEY,
  DESKTOP_FONT_PACK_KEYS,
  type DesktopFontPackKey,
} from "@shared/desktop";

export type FontRole = "ui" | "app" | "mono" | "shell" | "display" | "symbol";

export type FontFaceSpec = {
  family: string;
  url: string;
  weight?: string;
  style?: "normal" | "italic";
};

export type FontPack = {
  key: DesktopFontPackKey;
  label: string;
  description: string;
  roles: Record<FontRole, string>;
  faces: FontFaceSpec[];
  /** When true, @font-face rules in global-styles.ts already cover this pack. */
  preloaded?: boolean;
};

function cssString(value: string) {
  return `"${value}"`;
}

const MEK_TYPE_ARTIFACTS = {
  collection: "https://objkt.com/collections/KT1WfQkAv9HZCin7bgUD1xQnUreXR6HKEhYK",
  monoMekV12: "ipfs://QmSWnMqZgW7M2jZJA9RyD7RYXokZsS6N7ppE6UWTSTPXcr",
  monoMekV11: "ipfs://QmajkoehU9t6L2286SAPyKEfsqxdhz3EN3zrpydcnNq982",
  monoMekV10: "ipfs://Qme4Kk1jEYj48sK7i9nM2nwVnrR8jHhsR26FHd5iMJrMpA",
  groutAlphaV2: "ipfs://Qmf1NMGgFx2LhHPXh1z51x7riCR5spHndZxRArxoWsiE3m",
  mekSansAlphaV3: "ipfs://QmPCEHkAjKQCv5cgjuEcRmx3qjFEsw3YDFfEKJ9TYCfmL3",
} as const;

const WTFOS_SOFT_SYSTEM_FONT_PATH = "/fonts/wtfos-soft-system/";

const WTFOS_SOFT_SYSTEM_FALLBACK =
  `"wtfOS Global Sans", "Noto Sans", "Noto Sans CJK SC", "Noto Sans CJK JP", ` +
  `"Noto Sans CJK KR", "PingFang SC", "PingFang TC", "Hiragino Sans", ` +
  `"Yu Gothic", Meiryo, "Apple SD Gothic Neo", "Segoe UI", Arial, sans-serif`;

const WTFOS_SOFT_SYSTEM_STACK = `"wtfOS Soft Sans", ${WTFOS_SOFT_SYSTEM_FALLBACK}`;
const WTFOS_SOFT_SYSTEM_SYMBOL_STACK =
  `"wtfOS Symbols", "wtfOS Soft Sans", ${WTFOS_SOFT_SYSTEM_FALLBACK}, ` +
  `"Segoe UI Symbol", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

export const FONT_PACKS: FontPack[] = [
  {
    key: "wtfos-soft-system",
    label: "wtfOS Soft System",
    description:
      "Default wtfOS typography: soft, highly legible UI lettering with Latin Extended, Greek, Cyrillic, Tezos, symbol, CJK fallback, and emoji compatibility.",
    preloaded: true,
    roles: {
      ui: WTFOS_SOFT_SYSTEM_STACK,
      app: WTFOS_SOFT_SYSTEM_STACK,
      mono: `"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace`,
      shell: WTFOS_SOFT_SYSTEM_STACK,
      display:
        `"wtfOS Soft Sans", "wtfOS Global Sans", "Arial Rounded MT Bold", ` +
        `"Segoe UI", Arial, sans-serif`,
      symbol: WTFOS_SOFT_SYSTEM_SYMBOL_STACK,
    },
    faces: [
      {
        family: "wtfOS Soft Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}Fredoka-latin.woff2`,
        weight: "300 700",
      },
      {
        family: "wtfOS Soft Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}Fredoka-latin-ext.woff2`,
        weight: "300 700",
      },
      {
        family: "wtfOS Soft Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}Fredoka-hebrew.woff2`,
        weight: "300 700",
      },
      {
        family: "wtfOS Global Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-latin.woff2`,
        weight: "400 800",
      },
      {
        family: "wtfOS Global Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-latin-ext.woff2`,
        weight: "400 800",
      },
      {
        family: "wtfOS Global Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-vietnamese.woff2`,
        weight: "400 800",
      },
      {
        family: "wtfOS Global Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-greek.woff2`,
        weight: "400 800",
      },
      {
        family: "wtfOS Global Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-greek-ext.woff2`,
        weight: "400 800",
      },
      {
        family: "wtfOS Global Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-cyrillic.woff2`,
        weight: "400 800",
      },
      {
        family: "wtfOS Global Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-cyrillic-ext.woff2`,
        weight: "400 800",
      },
      {
        family: "wtfOS Global Sans",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-devanagari.woff2`,
        weight: "400 800",
      },
      {
        family: "wtfOS Symbols",
        url: `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSansSymbols2-symbols.woff2`,
      },
    ],
  },
  {
    key: "mek-type",
    label: "MEK Type",
    description: "Legacy wtfOS typography: MEK Mono, GROUT Display, and MEK Dings.",
    preloaded: true,
    roles: {
      ui: `"MEK Mono", "MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
      app: `"MEK Mono", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
      mono: `"MEK Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace`,
      shell: `"MEK Mono", "MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
      display: `"GROUT Display", "Arial Black", Impact, "MEK Mono", "Segoe UI", sans-serif`,
      symbol: `"MEK Dings", "MEK Mono", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif`,
    },
    faces: [
      { family: "MEK Mono", url: "/fonts/mek-type/MEK-Mono.woff2" },
      { family: "MEK Dings", url: "/fonts/mek-type/MEK-Dings.woff2" },
      { family: "GROUT Display", url: "/fonts/mek-type/GROUT-Display.woff2", weight: "400 900" },
    ],
  },
  {
    key: "classic-95",
    label: "Classic 95",
    description: "System UI stack reminiscent of Windows 95 before bundled fonts.",
    roles: {
      ui: `"MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
      app: `"Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
      mono: `"Lucida Console", "Courier New", Courier, monospace`,
      shell: `"MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
      display: `"Arial Black", Impact, "Segoe UI", sans-serif`,
      symbol: `"Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif`,
    },
    faces: [],
  },
  {
    key: "terminal",
    label: "Terminal",
    description: "Dense monospace-first stack for console and code surfaces.",
    roles: {
      ui: `"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace`,
      app: `"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace`,
      mono: `"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace`,
      shell: `"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace`,
      display: `"SFMono-Regular", Consolas, "Liberation Mono", monospace`,
      symbol: `"Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif`,
    },
    faces: [],
  },
  {
    key: "serif-press",
    label: "Serif Press",
    description: "Editorial serif stack for a printed, zine-like reading rhythm.",
    roles: {
      ui: `Georgia, "Times New Roman", Times, serif`,
      app: `Georgia, "Times New Roman", Times, serif`,
      mono: `"Courier New", Courier, monospace`,
      shell: `Georgia, "Times New Roman", Times, serif`,
      display: `"Palatino Linotype", Palatino, Georgia, serif`,
      symbol: `"Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif`,
    },
    faces: [],
  },
];

const FONT_PACK_BY_KEY = new Map(FONT_PACKS.map((pack) => [pack.key, pack]));

const loadedFontPackKeys = new Set<DesktopFontPackKey>();

export function isDesktopFontPackKey(value: unknown): value is DesktopFontPackKey {
  return typeof value === "string" && DESKTOP_FONT_PACK_KEYS.includes(value as DesktopFontPackKey);
}

export function getFontPack(key: string | undefined | null): FontPack {
  if (key && FONT_PACK_BY_KEY.has(key as DesktopFontPackKey)) {
    return FONT_PACK_BY_KEY.get(key as DesktopFontPackKey)!;
  }
  return FONT_PACK_BY_KEY.get(DEFAULT_DESKTOP_FONT_PACK_KEY)!;
}

export function cssVarsForFontPack(key: string | undefined | null): Record<string, string> {
  const pack = getFontPack(key);
  return {
    "--wtf-ui-font": pack.roles.ui,
    "--wtf-app-font": pack.roles.app,
    "--wtf-app-heading-font": pack.roles.mono,
    "--wtf-mono-font": pack.roles.mono,
    "--wtf-shell-font": pack.roles.shell,
    "--wtf-brand-font": pack.roles.display,
    "--wtf-display-font": pack.roles.display,
    "--wtf-symbol-font": pack.roles.symbol,
    "--wtf-titlebar-font": pack.roles.mono,
    ...(pack.key === "mek-type"
      ? {
          "--wtf-mek-type-monomek-font-url": cssString("/fonts/mek-type/MEK-Mono.woff2"),
          "--wtf-mek-type-dings-font-url": cssString("/fonts/mek-type/MEK-Dings.woff2"),
          "--wtf-mek-type-grout-font-url": cssString("/fonts/mek-type/GROUT-Display.woff2"),
          "--wtf-mek-type-collection-url": cssString(MEK_TYPE_ARTIFACTS.collection),
          "--wtf-mek-type-monomek-v12-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.monoMekV12),
          "--wtf-mek-type-monomek-v11-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.monoMekV11),
          "--wtf-mek-type-monomek-v10-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.monoMekV10),
          "--wtf-mek-type-grout-alpha-v2-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.groutAlphaV2),
          "--wtf-mek-type-meksans-alpha-v3-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.mekSansAlphaV3),
        }
      : {}),
    ...(pack.key === "wtfos-soft-system"
      ? {
          "--wtf-soft-system-fredoka-latin-font-url": cssString(
            `${WTFOS_SOFT_SYSTEM_FONT_PATH}Fredoka-latin.woff2`
          ),
          "--wtf-soft-system-noto-greek-font-url": cssString(
            `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-greek.woff2`
          ),
          "--wtf-soft-system-noto-cyrillic-font-url": cssString(
            `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSans-cyrillic.woff2`
          ),
          "--wtf-soft-system-symbols-font-url": cssString(
            `${WTFOS_SOFT_SYSTEM_FONT_PATH}NotoSansSymbols2-symbols.woff2`
          ),
        }
      : {}),
  };
}

export async function ensureFontPackLoaded(key: string | undefined | null): Promise<void> {
  const pack = getFontPack(key);
  if (pack.preloaded || pack.faces.length === 0 || loadedFontPackKeys.has(pack.key)) {
    loadedFontPackKeys.add(pack.key);
    return;
  }

  if (typeof document === "undefined" || !("fonts" in document)) {
    loadedFontPackKeys.add(pack.key);
    return;
  }

  const pending = pack.faces.map((face) => {
    const source = `url("${face.url}") format("woff2")`;
    const fontFace = new FontFace(face.family, source, {
      style: face.style ?? "normal",
      weight: face.weight ?? "400",
      display: "swap",
    });
    document.fonts.add(fontFace);
    return fontFace.load().catch(() => undefined);
  });

  await Promise.all(pending);
  loadedFontPackKeys.add(pack.key);
}

function primaryFamilyFromStack(stack: string): string {
  const trimmed = stack.trim();
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    return end > 0 ? trimmed.slice(0, end + 1) : trimmed;
  }
  return trimmed.split(",")[0]?.trim() ?? stack;
}

export function shellFontForAppearanceStyle(
  appearanceStyleKey: string,
  pack: FontPack
): string | undefined {
  const primary = primaryFamilyFromStack(pack.roles.shell);
  switch (appearanceStyleKey) {
    case "wtf-xp":
      return `${primary}, "Trebuchet MS", "Segoe UI", Tahoma, sans-serif`;
    case "wtf-aqua":
      return `${primary}, "Lucida Grande", "Segoe UI", Tahoma, sans-serif`;
    case "wtf-zine":
      return `${primary}, "Arial Black", Impact, "Segoe UI", sans-serif`;
    default:
      return undefined;
  }
}

export function titlebarFontForAppearanceStyle(
  appearanceStyleKey: string,
  pack: FontPack
): string | undefined {
  if (appearanceStyleKey === "wtf-aqua") {
    return pack.roles.shell;
  }
  if (appearanceStyleKey === "wtf-zine") {
    return pack.roles.display;
  }
  return undefined;
}
