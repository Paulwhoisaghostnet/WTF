import { useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ThemeProvider } from "styled-components";
import original from "react95/dist/themes/original";
import water from "react95/dist/themes/water";
import white from "react95/dist/themes/white";
import toner from "react95/dist/themes/toner";
import type { Theme } from "react95/dist/themes/types";
import {
  DEFAULT_DESKTOP_APPEARANCE,
  getDesktopAppearanceStyle,
  type DesktopAppearance,
  type DesktopAppearanceStyleKey,
} from "@shared/desktop";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

type DesktopSettingsResponse = {
  appearance: DesktopAppearance;
};

type AppearanceRuleSet = {
  react95Theme: Theme;
  vars: Record<string, string>;
};

const MEK_TYPE_FONTS = {
  ui: `"MEK Mono", "MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
  app: `"MEK Mono", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
  mono: `"MEK Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace`,
  shell: `"MEK Mono", "MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
  display: `"GROUT Display", "Arial Black", Impact, "MEK Mono", "Segoe UI", sans-serif`,
  symbol: `"MEK Dings", "MEK Mono", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif`,
} as const;

// Canonical MEK.type token sources. The loaded font binaries come from the
// download folders linked inside these OBJKT/IPFS PDF artifacts.
const MEK_TYPE_ARTIFACTS = {
  collection: "https://objkt.com/collections/KT1WfQkAv9HZCin7bgUD1xQnUreXR6HKEhYK",
  monoMekV12: "ipfs://QmSWnMqZgW7M2jZJA9RyD7RYXokZsS6N7ppE6UWTSTPXcr",
  monoMekV11: "ipfs://QmajkoehU9t6L2286SAPyKEfsqxdhz3EN3zrpydcnNq982",
  monoMekV10: "ipfs://Qme4Kk1jEYj48sK7i9nM2nwVnrR8jHhsR26FHd5iMJrMpA",
  groutAlphaV2: "ipfs://Qmf1NMGgFx2LhHPXh1z51x7riCR5spHndZxRArxoWsiE3m",
  mekSansAlphaV3: "ipfs://QmPCEHkAjKQCv5cgjuEcRmx3qjFEsw3YDFfEKJ9TYCfmL3",
} as const;

function cssString(value: string) {
  return `"${value}"`;
}

const MEK_TYPE_VARS = {
  "--wtf-ui-font": MEK_TYPE_FONTS.ui,
  "--wtf-app-font": MEK_TYPE_FONTS.app,
  "--wtf-app-heading-font": MEK_TYPE_FONTS.mono,
  "--wtf-mono-font": MEK_TYPE_FONTS.mono,
  "--wtf-shell-font": MEK_TYPE_FONTS.shell,
  "--wtf-brand-font": MEK_TYPE_FONTS.display,
  "--wtf-display-font": MEK_TYPE_FONTS.display,
  "--wtf-symbol-font": MEK_TYPE_FONTS.symbol,
  "--wtf-titlebar-font": MEK_TYPE_FONTS.mono,
  "--wtf-mek-type-monomek-font-url": cssString("/fonts/mek-type/MEK-Mono.woff2"),
  "--wtf-mek-type-dings-font-url": cssString("/fonts/mek-type/MEK-Dings.woff2"),
  "--wtf-mek-type-grout-font-url": cssString("/fonts/mek-type/GROUT-Display.woff2"),
  "--wtf-mek-type-collection-url": cssString(MEK_TYPE_ARTIFACTS.collection),
  "--wtf-mek-type-monomek-v12-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.monoMekV12),
  "--wtf-mek-type-monomek-v11-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.monoMekV11),
  "--wtf-mek-type-monomek-v10-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.monoMekV10),
  "--wtf-mek-type-grout-alpha-v2-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.groutAlphaV2),
  "--wtf-mek-type-meksans-alpha-v3-artifact-uri": cssString(MEK_TYPE_ARTIFACTS.mekSansAlphaV3),
} satisfies Record<string, string>;

const APPEARANCE_RULES: Record<DesktopAppearanceStyleKey, AppearanceRuleSet> = {
  "classic-95": {
    react95Theme: original,
    vars: {
      "--wtf-shell-font": MEK_TYPE_FONTS.shell,
      "--wtf-shell-font-size": "14px",
      "--wtf-titlebar-font": MEK_TYPE_FONTS.mono,
      "--wtf-window-radius": "0px",
      "--wtf-panel-radius": "0px",
      "--wtf-control-radius": "0px",
      "--wtf-titlebar-height": "27px",
      "--wtf-titlebar-padding": "0 3px 0 3px",
      "--wtf-titlebar-font-weight": "700",
      "--wtf-title-icon-content": `"▣"`,
      "--wtf-window-shadow": "1px 1px 0 #ffffff inset, -1px -1px 0 #808080 inset, 3px 3px 0 rgba(0, 0, 0, 0.48)",
      "--wtf-window-outline": "1px solid rgba(0, 0, 0, 0.72)",
      "--wtf-window-border": "0",
      "--wtf-content-padding": "12px",
      "--wtf-button-radius": "0px",
      "--wtf-button-shadow": "inset 1px 1px 0 rgba(255,255,255,0.9), inset -1px -1px 0 rgba(0,0,0,0.42)",
      "--wtf-menu-width": "258px",
      "--wtf-menu-radius": "0px",
      "--wtf-menu-shadow": "2px 3px 0 rgba(0, 0, 0, 0.58)",
      "--wtf-menu-sidebar-width": "28px",
      "--wtf-menu-item-min-height": "30px",
      "--wtf-taskbar-padding": "0px",
      "--wtf-taskbar-radius": "0px",
      "--wtf-taskbar-shadow": "none",
      "--wtf-taskbar-height": "36px",
      "--wtf-taskbar-mobile-height": "48px",
      "--wtf-start-button-min-width": "0px",
      "--wtf-chrome-transition": "none",
    },
  },
  "wtf-xp": {
    react95Theme: water,
    vars: {
      "--wtf-shell-font": `"MEK Mono", "Trebuchet MS", "Segoe UI", Tahoma, sans-serif`,
      "--wtf-shell-font-size": "14px",
      "--wtf-titlebar-font": MEK_TYPE_FONTS.mono,
      "--wtf-window-radius": "9px",
      "--wtf-panel-radius": "8px",
      "--wtf-control-radius": "6px",
      "--wtf-titlebar-height": "32px",
      "--wtf-titlebar-padding": "3px 6px 3px 9px",
      "--wtf-titlebar-font-weight": "700",
      "--wtf-title-icon-content": `"▦"`,
      "--wtf-window-shadow": "0 18px 32px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.82)",
      "--wtf-window-outline": "1px solid color-mix(in srgb, var(--wtf-active-title, #245edb) 70%, #000000)",
      "--wtf-window-border": "1px solid rgba(255,255,255,0.62)",
      "--wtf-content-padding": "14px",
      "--wtf-button-radius": "7px",
      "--wtf-button-shadow": "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 0 rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.24)",
      "--wtf-menu-width": "342px",
      "--wtf-menu-radius": "10px 10px 0 0",
      "--wtf-menu-shadow": "0 16px 36px rgba(0,0,0,0.38)",
      "--wtf-menu-sidebar-width": "76px",
      "--wtf-menu-item-min-height": "34px",
      "--wtf-taskbar-padding": "3px",
      "--wtf-taskbar-radius": "10px 10px 0 0",
      "--wtf-taskbar-shadow": "inset 0 1px 0 rgba(255,255,255,0.6), 0 -4px 12px rgba(0,0,0,0.22)",
      "--wtf-taskbar-height": "42px",
      "--wtf-taskbar-mobile-height": "50px",
      "--wtf-start-button-min-width": "82px",
      "--wtf-chrome-transition": "background 160ms ease, box-shadow 160ms ease, transform 160ms ease",
    },
  },
  "wtf-aqua": {
    react95Theme: white,
    vars: {
      "--wtf-shell-font": `"MEK Mono", "Lucida Grande", "Segoe UI", Tahoma, sans-serif`,
      "--wtf-shell-font-size": "14px",
      "--wtf-titlebar-font": `"MEK Mono", "Lucida Grande", "Segoe UI", Tahoma, sans-serif`,
      "--wtf-window-radius": "14px",
      "--wtf-panel-radius": "12px",
      "--wtf-control-radius": "999px",
      "--wtf-titlebar-height": "34px",
      "--wtf-titlebar-padding": "4px 8px",
      "--wtf-titlebar-font-weight": "600",
      "--wtf-title-icon-content": `"●"`,
      "--wtf-window-shadow": "0 24px 54px rgba(0,0,0,0.34), 0 3px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.92)",
      "--wtf-window-outline": "1px solid rgba(0,0,0,0.34)",
      "--wtf-window-border": "1px solid rgba(255,255,255,0.78)",
      "--wtf-content-padding": "14px",
      "--wtf-button-radius": "999px",
      "--wtf-button-shadow": "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -8px 14px rgba(0,0,0,0.08), 0 2px 5px rgba(0,0,0,0.18)",
      "--wtf-menu-width": "312px",
      "--wtf-menu-radius": "14px",
      "--wtf-menu-shadow": "0 22px 48px rgba(0,0,0,0.34)",
      "--wtf-menu-sidebar-width": "0px",
      "--wtf-menu-item-min-height": "34px",
      "--wtf-taskbar-padding": "5px",
      "--wtf-taskbar-radius": "14px 14px 0 0",
      "--wtf-taskbar-shadow": "inset 0 1px 0 rgba(255,255,255,0.8), 0 -10px 30px rgba(0,0,0,0.24)",
      "--wtf-taskbar-height": "46px",
      "--wtf-taskbar-mobile-height": "52px",
      "--wtf-start-button-min-width": "72px",
      "--wtf-chrome-transition": "background 180ms ease, box-shadow 180ms ease, transform 180ms ease, opacity 180ms ease",
    },
  },
  "wtf-zine": {
    react95Theme: toner,
    vars: {
      "--wtf-shell-font": `"MEK Mono", "Arial Black", Impact, "Segoe UI", sans-serif`,
      "--wtf-shell-font-size": "14px",
      "--wtf-titlebar-font": MEK_TYPE_FONTS.display,
      "--wtf-window-radius": "2px",
      "--wtf-panel-radius": "2px",
      "--wtf-control-radius": "2px",
      "--wtf-titlebar-height": "31px",
      "--wtf-titlebar-padding": "3px 6px",
      "--wtf-titlebar-font-weight": "900",
      "--wtf-title-icon-content": `"■"`,
      "--wtf-window-shadow": "7px 7px 0 rgba(0,0,0,0.82)",
      "--wtf-window-outline": "3px solid #000000",
      "--wtf-window-border": "0",
      "--wtf-content-padding": "12px",
      "--wtf-button-radius": "2px",
      "--wtf-button-shadow": "3px 3px 0 #000000",
      "--wtf-menu-width": "298px",
      "--wtf-menu-radius": "2px",
      "--wtf-menu-shadow": "7px 7px 0 rgba(0,0,0,0.86)",
      "--wtf-menu-sidebar-width": "34px",
      "--wtf-menu-item-min-height": "32px",
      "--wtf-taskbar-padding": "4px",
      "--wtf-taskbar-radius": "0px",
      "--wtf-taskbar-shadow": "0 -4px 0 #000000",
      "--wtf-taskbar-height": "42px",
      "--wtf-taskbar-mobile-height": "50px",
      "--wtf-start-button-min-width": "76px",
      "--wtf-chrome-transition": "transform 120ms steps(2, jump-none), box-shadow 120ms steps(2, jump-none)",
    },
  },
};

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixHex(a: string, b: string, weight: number) {
  const left = parseHex(a);
  const right = parseHex(b);
  const mixed = left.map((channel, index) =>
    clampByte(channel * (1 - weight) + (right[index] ?? 0) * weight)
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(hex: string) {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "000000";
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

function relativeLuminance(hex: string) {
  const channels = parseHex(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(a: string, b: string) {
  const left = relativeLuminance(a);
  const right = relativeLuminance(b);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

function bestTextOn(background: string) {
  return contrastRatio(background, "#111111") >= contrastRatio(background, "#ffffff")
    ? "#111111"
    : "#ffffff";
}

function minContrastAgainst(color: string, backgrounds: string[]) {
  return Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
}

function firstReadableColor(
  backgrounds: string[],
  candidates: string[],
  minimumRatio: number
) {
  const uniqueCandidates = Array.from(new Set(candidates));
  const readable = uniqueCandidates.find(
    (candidate) => minContrastAgainst(candidate, backgrounds) >= minimumRatio
  );
  if (readable) return readable;
  return uniqueCandidates.reduce((best, candidate) =>
    minContrastAgainst(candidate, backgrounds) > minContrastAgainst(best, backgrounds)
      ? candidate
      : best
  );
}

function readableAccentAcross(
  backgrounds: string[],
  preferred: string,
  fallback: string,
  minimumRatio = 4.5
) {
  return firstReadableColor(
    backgrounds,
    [
      preferred,
      fallback,
      mixHex(preferred, "#000000", 0.42),
      mixHex(fallback, "#000000", 0.42),
      mixHex(preferred, "#000000", 0.62),
      mixHex(fallback, "#000000", 0.62),
      mixHex(preferred, "#ffffff", 0.36),
      mixHex(fallback, "#ffffff", 0.36),
      "#005fcc",
      "#000080",
      "#111111",
    ],
    minimumRatio
  );
}

function readableToneAcross(
  backgrounds: string[],
  base: string,
  dark: string,
  light: string
) {
  return firstReadableColor(
    backgrounds,
    [base, dark, mixHex(base, "#000000", 0.25), mixHex(base, "#000000", 0.45), light],
    4.5
  );
}

function appSurfacePalette(appearance: DesktopAppearance) {
  const base = appearance.windowColor;
  const baseLuminance = relativeLuminance(base);
  const appBg =
    baseLuminance < 0.24
      ? mixHex(base, "#ffffff", 0.88)
      : baseLuminance > 0.82
        ? mixHex(base, "#000000", 0.04)
        : mixHex(base, "#ffffff", 0.58);
  const appSurface =
    relativeLuminance(appBg) < 0.5
      ? mixHex(appBg, "#ffffff", 0.1)
      : mixHex(appBg, "#ffffff", 0.34);
  const appRaised =
    relativeLuminance(appSurface) < 0.5
      ? mixHex(appSurface, "#ffffff", 0.14)
      : mixHex(appSurface, "#ffffff", 0.22);
  const appText = bestTextOn(appBg);
  const appBackgrounds = [appBg, appSurface, appRaised];
  const mutedCandidate =
    appText === "#111111"
      ? mixHex(appText, appBg, 0.28)
      : mixHex(appText, appBg, 0.18);
  const appMuted =
    minContrastAgainst(mutedCandidate, appBackgrounds) >= 4.5
      ? mutedCandidate
      : appText;
  const appBorder =
    appText === "#111111"
      ? mixHex(appBg, "#000000", 0.28)
      : mixHex(appBg, "#ffffff", 0.32);
  const appPrimary = readableAccentAcross(
    appBackgrounds,
    appearance.highlightColor,
    appearance.activeTitleColor
  );
  const appFocus = readableAccentAcross(
    appBackgrounds,
    appearance.highlightColor,
    appearance.activeTitleColor,
    3
  );
  const appPrimaryText = bestTextOn(appPrimary);
  const appDanger = readableToneAcross(appBackgrounds, "#b42318", "#7f1d1d", "#ffdad5");
  const appWarning = readableToneAcross(appBackgrounds, "#8a4b00", "#713f12", "#fff0c2");
  const appSuccess = readableToneAcross(appBackgrounds, "#176b38", "#14532d", "#dff7e7");
  const appInfo = readableToneAcross(appBackgrounds, "#175cd3", "#1e3a8a", "#dbeafe");

  return {
    appBg,
    appSurface,
    appRaised,
    appText,
    appMuted,
    appBorder,
    appLink: appPrimary,
    appFocus,
    appPrimary,
    appAccentText: appPrimaryText,
    appDanger,
    appDangerBg: mixHex(appSurface, appDanger, 0.12),
    appWarning,
    appWarningBg: mixHex(appSurface, appWarning, 0.14),
    appSuccess,
    appSuccessBg: mixHex(appSurface, appSuccess, 0.12),
    appInfo,
    appInfoBg: mixHex(appSurface, appInfo, 0.12),
    appControlBg: appRaised,
    appControlBorder: appBorder,
    appDisabledBg: mixHex(appSurface, appText, 0.12),
    appDisabledText: appText === "#111111" ? "#4b4b4b" : "#e6e6e6",
  };
}

function themeForAppearance(appearance: DesktopAppearance): Theme {
  const rules = APPEARANCE_RULES[appearance.appearanceStyleKey] ?? APPEARANCE_RULES["classic-95"];
  const lightWindow = mixHex(appearance.windowColor, "#ffffff", 0.42);
  const darkWindow = mixHex(appearance.windowColor, "#000000", 0.36);
  const darkerWindow = mixHex(appearance.windowColor, "#000000", 0.62);
  const highlightText = mixHex(appearance.highlightColor, "#ffffff", 0.88);

  return {
    ...rules.react95Theme,
    name: `wtfos-${appearance.appearanceStyleKey}`,
    desktopBackground: appearance.desktopColor,
    material: appearance.windowColor,
    materialText: appearance.textColor,
    materialTextInvert: highlightText,
    materialTextDisabled: mixHex(appearance.textColor, appearance.windowColor, 0.58),
    materialTextDisabledShadow: lightWindow,
    canvas: mixHex(appearance.windowColor, "#ffffff", 0.7),
    canvasText: appearance.textColor,
    canvasTextInvert: highlightText,
    canvasTextDisabled: mixHex(appearance.textColor, appearance.windowColor, 0.6),
    canvasTextDisabledShadow: lightWindow,
    borderLight: mixHex(appearance.buttonFace, "#ffffff", 0.65),
    borderLightest: "#ffffff",
    borderDark: darkWindow,
    borderDarkest: darkerWindow,
    flatLight: lightWindow,
    flatDark: darkWindow,
    headerBackground: appearance.activeTitleColor,
    headerText: appearance.activeTitleTextColor,
    headerNotActiveBackground: appearance.inactiveTitleColor,
    headerNotActiveText: appearance.inactiveTitleTextColor,
    hoverBackground: appearance.highlightColor,
    focusSecondary: appearance.highlightColor,
    progress: appearance.highlightColor,
    checkmark: appearance.textColor,
    tooltip: mixHex(appearance.windowColor, "#fff8c6", 0.72),
  };
}

function cssVarsForAppearance(appearance: DesktopAppearance) {
  const style = getDesktopAppearanceStyle(appearance.appearanceStyleKey).key;
  const rules = APPEARANCE_RULES[style] ?? APPEARANCE_RULES["classic-95"];
  const app = appSurfacePalette(appearance);

  return {
    ...MEK_TYPE_VARS,
    ...rules.vars,
    "--wtf-desktop-color": appearance.desktopColor,
    "--wtf-window-color": appearance.windowColor,
    "--wtf-active-title": appearance.activeTitleColor,
    "--wtf-active-title-text": appearance.activeTitleTextColor,
    "--wtf-inactive-title": appearance.inactiveTitleColor,
    "--wtf-inactive-title-text": appearance.inactiveTitleTextColor,
    "--wtf-text-color": appearance.textColor,
    "--wtf-highlight-color": appearance.highlightColor,
    "--wtf-button-face": appearance.buttonFace,
    "--wtf-app-bg": app.appBg,
    "--wtf-app-surface": app.appSurface,
    "--wtf-app-surface-raised": app.appRaised,
    "--wtf-app-border": app.appBorder,
    "--wtf-app-text": app.appText,
    "--wtf-app-muted-text": app.appMuted,
    "--wtf-app-link": app.appLink,
    "--wtf-app-primary": app.appPrimary,
    "--wtf-app-focus": app.appFocus,
    "--wtf-app-accent-text": app.appAccentText,
    "--wtf-app-danger": app.appDanger,
    "--wtf-app-danger-bg": app.appDangerBg,
    "--wtf-app-warning": app.appWarning,
    "--wtf-app-warning-bg": app.appWarningBg,
    "--wtf-app-success": app.appSuccess,
    "--wtf-app-success-bg": app.appSuccessBg,
    "--wtf-app-info": app.appInfo,
    "--wtf-app-info-bg": app.appInfoBg,
    "--wtf-app-control-bg": app.appControlBg,
    "--wtf-app-control-border": app.appControlBorder,
    "--wtf-app-disabled-bg": app.appDisabledBg,
    "--wtf-app-disabled-text": app.appDisabledText,
    "--wtf-space-1": "4px",
    "--wtf-space-2": "8px",
    "--wtf-space-3": "12px",
    "--wtf-space-4": "16px",
    "--wtf-space-5": "20px",
    "--wtf-type-caption": "13px",
    "--wtf-type-body": "15px",
    "--wtf-type-body-strong": "16px",
    "--wtf-type-title": "20px",
    "--wtf-control-min-height": "34px",
  };
}

export function WtfOsAppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const settingsQuery = useQuery({
    queryKey: ["desktop", "settings"],
    queryFn: () => api.get<DesktopSettingsResponse>("/api/desktop/settings"),
    enabled: !!user,
    staleTime: 30_000,
  });
  const appearance = settingsQuery.data?.appearance ?? DEFAULT_DESKTOP_APPEARANCE;
  const theme = useMemo(() => themeForAppearance(appearance), [appearance]);

  useEffect(() => {
    const root = document.documentElement;
    const styleKey = getDesktopAppearanceStyle(appearance.appearanceStyleKey).key;
    root.dataset.wtfAppearanceStyle = styleKey;
    for (const [key, value] of Object.entries(cssVarsForAppearance(appearance))) {
      root.style.setProperty(key, value);
    }
  }, [appearance]);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
