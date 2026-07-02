import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styled from "styled-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Panel, Separator } from "react95";
import {
  Apple,
  Bot,
  Bold,
  Brush,
  Clipboard,
  Droplets,
  Gamepad2,
  Heart,
  Image as ImageIcon,
  Italic,
  KeyRound,
  Moon,
  MousePointer2,
  Palette,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Underline,
  Unplug,
} from "lucide-react";
import { AppWindow } from "../components/layout/AppWindow";
import { HamsterPixelSprite } from "../components/layout/HamsterPixelSprite";
import { api } from "../lib/api";
import { useLocalization, type TranslateFn } from "../lib/localization";
import { usePresentationShell } from "../lib/presentation-shell";
import {
  DEFAULT_DESKTOP_APPEARANCE,
  DESKTOP_APPEARANCE_STYLES,
  DESKTOP_BACKGROUND_FITS,
  DESKTOP_CHAT_TYPOGRAPHY_PRESETS,
  DESKTOP_COLOR_SCHEMES,
  DESKTOP_CURSOR_LABELS,
  DESKTOP_CURSOR_STYLES,
  DESKTOP_GRAVITY_MODES,
  DESKTOP_WIM_CHAT_FONT_FAMILIES,
  DESKTOP_WIM_CHAT_FONT_SIZES,
  DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES,
  DESKTOP_WTF_LIVE_CHAT_COLOR_LABELS,
  DESKTOP_WTF_LIVE_CHAT_COLOR_VALUES,
  DESKTOP_WTF_LIVE_CHAT_COLORS,
  DESKTOP_WTF_LIVE_CHAT_FONT_LABELS,
  DESKTOP_WTF_LIVE_CHAT_FONTS,
  DESKTOP_WTF_LIVE_CHAT_SIZES,
  HAMSTER_COLOR_SCHEMES,
  HAMSTER_CORE_STAT_KEYS,
  mediaLibraryWallpaperUrl,
  tokenWallpaperUrl,
  type DesktopAppearance,
  type HamsterCoreStatKey,
  type DesktopIconLayout,
  type DesktopWtfLiveChatFont,
  type HamsterAction,
  type HamsterState,
} from "@shared/desktop";
import {
  DEFAULT_LOCALIZATION_SETTINGS,
  type LocalizationSettings,
} from "@shared/localization";
import { getTokenMimeType, isImageMime } from "../lib/media-resolve";
import { FONT_PACKS, getFontPack } from "../features/appearance/font-packs";

type DesktopSettingsResponse = {
  appearance: DesktopAppearance;
  iconLayout: DesktopIconLayout;
  localization: LocalizationSettings;
  updatedAt: string | null;
};

type PetResponse = {
  pet: HamsterState;
  events: Array<{ id: number; action: string; xpAmount: number; createdAt: string }>;
};

type McpTokenRecord = {
  id: number;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type McpTokensResponse = {
  endpoint: string;
  tokens: McpTokenRecord[];
};

type McpCreateTokenResponse = {
  endpoint: string;
  token: string;
  tokenRecord: McpTokenRecord;
  warning: string;
};

type SettingsTabKey =
  | "background"
  | "appearance"
  | "font"
  | "cursor"
  | "physics"
  | "pet"
  | "agent";

type SettingsTabDefinition = {
  key: SettingsTabKey;
  label: string;
  summary: string;
  icon: ReactNode;
};

function stableSettingsString(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSettingsString(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSettingsString(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function reportDesktopSettingsEvent(payload: {
  eventType: string;
  objectId: string;
  objectKind: string;
  action: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  void api.post<{ ok: true }>("/api/desktop/events", payload).catch(() => {
    // Settings controls should remain responsive even if desktop event logging fails.
  });
}

function reportThemeBuilderEvent(
  eventType: string,
  action: string,
  metadata?: Record<string, string | number | boolean | null>
) {
  reportDesktopSettingsEvent({
    eventType,
    objectId: "theme-builder",
    objectKind: "theme-builder",
    action,
    metadata,
  });
}

interface MediaItem {
  id: number;
  title: string;
  sourceType: string;
  sourceUrl: string;
  playbackUrl?: string | null;
  posterUrl?: string | null;
  mimeType: string;
  mediaCategory: string;
  tokenContract?: string | null;
  tokenId?: string | null;
}

interface OwnedToken {
  id: number;
  contract: string;
  tokenId: string;
  name?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  balance?: string;
}

const Shell = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(172px, 204px) minmax(0, 1fr);
  grid-template-rows: minmax(420px, 1fr) auto;
  grid-template-areas:
    "nav content"
    "nav save";
  gap: 10px;
  align-items: start;
  min-height: min(680px, calc(100vh - 140px));

  &[data-desktop-settings-presentation-host="gamma"] {
    color: #f2ead9;
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
    font-size: 15px;
    line-height: 1.45;
    letter-spacing: 0;
  }

  &[data-desktop-settings-presentation-host="gamma"],
  &[data-desktop-settings-presentation-host="gamma"] * {
    box-sizing: border-box;
    text-shadow: none !important;
  }

  &[data-desktop-settings-presentation-host="gamma"]
    :where(button, input, select, textarea, label, span, strong, div) {
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
    letter-spacing: 0;
  }

  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
    border-radius: 6px !important;
  }

  &[data-desktop-settings-presentation-host="gamma"]
    :where([data-desktop-settings-region="surface"], [data-desktop-settings-region="settings-nav"], [data-desktop-settings-region="tab-panel"], [data-desktop-settings-region="appearance-panel"], [data-desktop-settings-region="font-panel"], [data-desktop-settings-region="desktop-panel"], [data-desktop-settings-region="cursor-panel"], [data-desktop-settings-region="physics-panel"], [data-desktop-settings-region="pet-panel"], [data-desktop-settings-region="agent-panel"], [data-desktop-settings-region="global-save"]) {
    min-width: 0;
    border: 1px solid rgba(242, 234, 217, 0.16) !important;
    background: #11110f !important;
    color: #f2ead9 !important;
  }

  &[data-desktop-settings-presentation-host="gamma"]
    :where([data-desktop-settings-region="settings-tab"], [data-desktop-settings-region="style-button"], [data-desktop-settings-region="font-pack-button"], [data-desktop-settings-region="chat-preset-button"], [data-desktop-settings-region="color-preset-button"], [data-desktop-settings-region="source-button"], [data-desktop-settings-region="toolbar-button"], [data-desktop-settings-region="chat-toggle"], [data-desktop-settings-region="chat-color"], [data-desktop-settings-region="segment-button"], [data-desktop-settings-region="token-row"]) {
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    background: #070706 !important;
    color: #f2ead9 !important;
  }

  &[data-desktop-settings-presentation-host="gamma"]
    :where([data-desktop-settings-region="settings-tab"][aria-selected="true"], [data-desktop-settings-region="style-button"][aria-pressed="true"], [data-desktop-settings-region="font-pack-button"][aria-pressed="true"], [data-desktop-settings-region="chat-preset-button"][aria-pressed="true"], [data-desktop-settings-region="color-preset-button"][aria-pressed="true"], [data-desktop-settings-region="source-button"][aria-pressed="true"], [data-desktop-settings-region="segment-button"][aria-pressed="true"]) {
    border-color: rgba(0, 210, 255, 0.72) !important;
    color: #00d2ff !important;
  }

  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="style-preview"] {
    border: 1px solid rgba(0, 210, 255, 0.58) !important;
    background: #070706 !important;
  }

  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="style-preview"]::before {
    content: "";
    display: block;
    height: 9px;
    border-bottom: 1px solid rgba(0, 210, 255, 0.58);
    background: #00d2ff;
  }

  &[data-desktop-settings-presentation-host="gamma"]
    :where([data-desktop-settings-region="section-title"], [data-desktop-settings-region="mcp-endpoint"]) {
    color: #00d2ff;
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  &[data-desktop-settings-presentation-host="gamma"]
    :where(input, select, textarea) {
    border: 1px solid rgba(242, 234, 217, 0.22) !important;
    border-radius: 4px !important;
    background: #070706 !important;
    color: #f2ead9 !important;
    box-shadow: none !important;
  }

  &[data-desktop-settings-presentation-host="gamma"] input[type="color"] {
    min-height: 34px;
    padding: 2px;
  }

  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="help"],
  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="summary"] {
    color: rgba(242, 234, 217, 0.68) !important;
  }

  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="chat-preview"] {
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    background: #070706 !important;
  }

  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="swatch"] {
    border: 1px solid rgba(242, 234, 217, 0.26) !important;
  }

  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-thumb="true"] {
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    border-radius: 4px !important;
    box-shadow: none !important;
  }

  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="stat-bar"] {
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    background: #070706 !important;
    box-shadow: none !important;
    border-radius: 4px !important;
  }

  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="toolbar-button"]:hover,
  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="toolbar-button"]:focus-visible,
  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="segment-button"]:hover,
  &[data-desktop-settings-presentation-host="gamma"] [data-desktop-settings-region="segment-button"]:focus-visible {
    border-color: #00d2ff !important;
    color: #00d2ff !important;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    grid-template-areas:
      "nav"
      "content"
      "save";
    min-height: 0;
  }
`;

const SettingsNav = styled(Panel)`
  grid-area: nav;
  position: sticky;
  top: 0;
  display: grid;
  gap: 8px;
  padding: 8px;
  background: var(--wtf-window-color, #c0c0c0);
  color: var(--wtf-text-color, #111);
  z-index: 2;
`;

const NavTitle = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 800;
  line-height: 1.15;
`;

const TabList = styled.div`
  display: grid;
  gap: 4px;
`;

const SettingsTab = styled.button<{ $active: boolean }>`
  min-width: 0;
  min-height: 44px;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  padding: 6px 7px;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  background: ${(p) => (p.$active ? "#ffffff" : "var(--wtf-button-face, #c0c0c0)")};
  color: var(--wtf-text-color, #111);
  text-align: left;
  line-height: 1.12;

  svg {
    width: 18px;
    height: 18px;
  }

  strong,
  span {
    min-width: 0;
  }

  strong {
    display: block;
    font-size: var(--wtf-type-caption, 13px);
  }

  span {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    opacity: 0.78;
  }
`;

const SettingsMain = styled.div`
  grid-area: content;
  min-width: 0;
  display: grid;
  gap: 10px;

  > [hidden] {
    display: none !important;
  }
`;

const TabSaveBar = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(64, 64, 64, 0.45);
`;

const GlobalSaveDock = styled.div`
  grid-area: save;
  position: sticky;
  right: 0;
  bottom: 0;
  z-index: 4;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 8px 0 0;
  pointer-events: none;
`;

const GlobalSaveButton = styled.button<{ $dirty: boolean }>`
  && {
    pointer-events: auto;
    min-width: 132px;
    min-height: 46px;
    height: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 18px;
    border: 2px solid #111;
    border-color: #ffffff #202020 #202020 #ffffff;
    background: ${(p) => (p.$dirty ? "#c01824" : "#138a34")} !important;
    color: #ffffff;
    font-weight: 900;
    font-size: 18px;
    line-height: 1;
    letter-spacing: 0;
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.5),
      2px 2px 0 rgba(0, 0, 0, 0.42) !important;
  }

  &&:disabled {
    cursor: wait;
    opacity: 0.82;
  }

  &&:focus-visible {
    outline: 3px solid var(--wtf-highlight, #000080);
    outline-offset: 2px;
  }

  && svg {
    width: 18px;
    height: 18px;
  }
`;

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const Group = styled(Panel)`
  padding: 10px;
  background: var(--wtf-window-color, #c0c0c0);
  color: var(--wtf-text-color, #111);
`;

const GroupTitle = styled.div`
  font-weight: bold;
  margin-bottom: 8px;
`;

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
  gap: 8px;
`;

const StyleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
`;

const StyleButton = styled.button<{ $active: boolean; $styleKey: string }>`
  min-height: 92px;
  display: grid;
  gap: 6px;
  align-content: start;
  padding: 8px;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  border-radius: ${(p) =>
    p.$styleKey === "wtf-xp" ? "10px" : p.$styleKey === "wtf-aqua" ? "14px" : p.$styleKey === "wtf-zine" ? "2px" : "0"};
  background:
    ${(p) =>
      p.$styleKey === "wtf-xp"
        ? "linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.10)), var(--wtf-button-face, #c0c0c0)"
        : p.$styleKey === "wtf-aqua"
          ? "radial-gradient(circle at 50% 0, rgba(255,255,255,0.9), transparent 44%), var(--wtf-button-face, #c0c0c0)"
          : p.$styleKey === "wtf-zine"
            ? "repeating-linear-gradient(-8deg, rgba(0,0,0,0.10) 0 8px, transparent 8px 16px), var(--wtf-button-face, #c0c0c0)"
            : "var(--wtf-button-face, #c0c0c0)"};
  color: var(--wtf-text-color, #111);
  text-align: left;
  box-shadow: ${(p) =>
    p.$styleKey === "wtf-zine"
      ? "4px 4px 0 #000"
      : p.$styleKey === "classic-95"
        ? "inset 1px 1px 0 #fff, inset -1px -1px 0 #808080"
        : "0 3px 10px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.72)"};
`;

const StylePreview = styled.span<{ $styleKey: string }>`
  display: block;
  height: 26px;
  border: ${(p) => (p.$styleKey === "wtf-zine" ? "3px solid #000" : "1px solid #111")};
  border-radius: ${(p) =>
    p.$styleKey === "wtf-xp" ? "8px 8px 2px 2px" : p.$styleKey === "wtf-aqua" ? "12px 12px 5px 5px" : p.$styleKey === "wtf-zine" ? "1px" : "0"};
  background:
    linear-gradient(180deg, var(--wtf-active-title, #000080) 0 42%, var(--wtf-window-color, #c0c0c0) 42% 100%);
  box-shadow: ${(p) =>
    p.$styleKey === "wtf-zine"
      ? "3px 3px 0 #000"
      : p.$styleKey === "wtf-aqua"
        ? "0 5px 10px rgba(0,0,0,0.22)"
        : p.$styleKey === "wtf-xp"
          ? "0 4px 8px rgba(0,0,0,0.20)"
          : "none"};
`;

const StyleName = styled.span`
  font-weight: 700;
`;

const StyleSummary = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.18;
`;

const FontPackGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  gap: 8px;
`;

const FontPackButton = styled.button<{ $active: boolean }>`
  min-height: 108px;
  display: grid;
  gap: 6px;
  align-content: start;
  padding: 8px;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  background: var(--wtf-button-face, #c0c0c0);
  color: var(--wtf-text-color, #111);
  text-align: left;
`;

const FontPackLabel = styled.span<{ $fontFamily: string }>`
  font-family: ${(p) => p.$fontFamily};
  font-weight: 700;
  font-size: var(--wtf-type-body-strong, 16px);
`;

const FontPackPreview = styled.div<{ $uiFont: string; $monoFont: string; $displayFont: string }>`
  display: grid;
  gap: 2px;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.2;

  span:nth-child(1) {
    font-family: ${(p) => p.$uiFont};
  }
  span:nth-child(2) {
    font-family: ${(p) => p.$monoFont};
  }
  span:nth-child(3) {
    font-family: ${(p) => p.$displayFont};
    font-weight: 700;
  }
`;

const ChatPresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(156px, 1fr));
  gap: 8px;
  margin-top: 8px;
`;

const ChatPresetButton = styled.button<{ $active: boolean }>`
  min-height: 104px;
  display: grid;
  gap: 6px;
  align-content: start;
  padding: 8px;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  background: var(--wtf-button-face, #c0c0c0);
  color: var(--wtf-text-color, #111);
  text-align: left;
`;

const ChatPresetName = styled.span`
  font-weight: 800;
`;

const ChatPresetSummary = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.18;
`;

const ChatPreviewStrip = styled.div`
  display: grid;
  gap: 4px;
`;

const ChatPreviewBubble = styled.span<{
  $fontFamily: string;
  $fontSize: number;
  $color: string;
  $bold?: boolean;
  $italic?: boolean;
  $underline?: boolean;
}>`
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #404040;
  background: rgba(255, 255, 255, 0.72);
  color: ${(p) => p.$color};
  font-family: ${(p) => p.$fontFamily};
  font-size: ${(p) => p.$fontSize}px;
  font-weight: ${(p) => (p.$bold ? 800 : 400)};
  font-style: ${(p) => (p.$italic ? "italic" : "normal")};
  text-decoration: ${(p) => (p.$underline ? "underline" : "none")};
  line-height: 1.2;
  overflow-wrap: anywhere;
`;

const ChatDefaultGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin-top: 10px;
`;

const ChatDefaultPanel = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;
  padding-top: 8px;
  border-top: 1px solid rgba(64, 64, 64, 0.5);
`;

const ChatDefaultTitle = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  font-weight: 800;
  font-size: var(--wtf-type-caption, 13px);
`;

const ChatToggleRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const ChatToggleButton = styled.button<{ $active?: boolean }>`
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  background: ${(p) => (p.$active ? "#ffffff" : "var(--wtf-button-face, #c0c0c0)")};
  color: var(--wtf-text-color, #111);

  svg {
    width: 15px;
    height: 15px;
  }
`;

const ChatColorStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const ChatColorButton = styled.button<{ $color: string; $active?: boolean }>`
  width: 26px;
  height: 26px;
  padding: 0;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  background: ${(p) => p.$color};
`;

const PresetButton = styled.button<{ $active: boolean }>`
  min-height: 54px;
  display: grid;
  grid-template-columns: 34px 1fr;
  align-items: center;
  gap: 7px;
  padding: 6px;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  background: var(--wtf-button-face, #c0c0c0);
  color: var(--wtf-text-color, #111);
  text-align: left;
`;

const Swatch = styled.span<{ $colors: string[] }>`
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 32px;
  height: 32px;
  border: 1px solid #111;
  background: ${(p) => p.$colors[0]};

  i:nth-child(1) { background: ${(p) => p.$colors[0]}; }
  i:nth-child(2) { background: ${(p) => p.$colors[1]}; }
  i:nth-child(3) { background: ${(p) => p.$colors[2]}; }
  i:nth-child(4) { background: ${(p) => p.$colors[3]}; }
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`;

const Field = styled.label`
  display: grid;
  gap: 3px;
  font-size: var(--wtf-type-caption, 13px);

  input,
  select {
    width: 100%;
  }
`;

const Inline = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const SegmentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 5px;

  button {
    min-width: 0;
    min-height: 32px;
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.1;
    white-space: normal;
  }
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
`;

const IconButton = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const PetBox = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 10px;
  align-items: start;
`;

const PetPreview = styled.div`
  width: 76px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 2px auto 4px;
`;

const StatRows = styled.div`
  display: grid;
  grid-template-columns: 54px 1fr 30px;
  gap: 4px 6px;
  align-items: center;
  font-size: var(--wtf-type-caption, 13px);
`;

const StatBar = styled.div<{ $value: number }>`
  height: 12px;
  border: 1px solid #404040;
  background: #fff;
  box-shadow: inset 1px 1px 0 #808080;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    inset: 1px auto 1px 1px;
    width: ${(p) => Math.max(0, Math.min(100, p.$value))}%;
    background: ${(p) =>
      p.$value > 60 ? "#00a000" : p.$value > 30 ? "#e0a000" : "#d02020"};
  }
`;

const GenePanel = styled.div`
  margin-top: 8px;
  padding: 6px;
  border: 1px solid #808080;
  background: rgba(255, 255, 255, 0.32);
  font-size: var(--wtf-type-caption, 13px);
`;

const TraitRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0 6px;
`;

const TraitChip = styled.span<{ $rarity: string }>`
  padding: 2px 5px;
  border: 1px solid #404040;
  background: ${(p) =>
    p.$rarity === "legendary"
      ? "#39ff14"
      : p.$rarity === "epic"
        ? "#d7b4ff"
        : p.$rarity === "rare"
          ? "#b6d8ff"
          : "#fff6b8"};
  color: #111;
`;

const EventList = styled.div`
  margin-top: 8px;
  max-height: 110px;
  overflow: auto;
  font-size: var(--wtf-type-caption, 13px);
`;

const TokenRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-top: 1px solid rgba(64, 64, 64, 0.45);
  font-size: var(--wtf-type-caption, 13px);
`;

const SecretBox = styled.textarea`
  width: 100%;
  min-height: 54px;
  resize: vertical;
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--wtf-type-caption, 13px);
`;

const SourceList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 7px;
  max-height: 178px;
  overflow: auto;
  margin-top: 7px;
`;

const SourceButton = styled.button<{ $active?: boolean }>`
  display: grid;
  grid-template-rows: 58px auto;
  gap: 4px;
  padding: 4px;
  min-width: 0;
  border: 2px solid;
  border-color: ${(p) => (p.$active ? "#000 #fff #fff #000" : "#fff #404040 #404040 #fff")};
  background: var(--wtf-button-face, #c0c0c0);
  color: var(--wtf-text-color, #111);
  text-align: left;
`;

const Thumb = styled.div<{ $src?: string | null }>`
  border: 1px solid #404040;
  background-color: #000;
  background-image: ${(p) => (p.$src ? `url("${p.$src}")` : "none")};
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
`;

const SourceLabel = styled.div`
  min-width: 0;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.15;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const HelpText = styled.div`
  margin-top: 5px;
  font-size: var(--wtf-type-caption, 13px);
  color: color-mix(in srgb, var(--wtf-text-color, #111) 70%, #ffffff);
`;

function applyScheme(appearance: DesktopAppearance, key: string): DesktopAppearance {
  const scheme =
    DESKTOP_COLOR_SCHEMES.find((candidate) => candidate.key === key) ??
    DESKTOP_COLOR_SCHEMES[0];
  return {
    ...appearance,
    colorSchemeKey: scheme.key,
    desktopColor: scheme.desktopColor,
    windowColor: scheme.windowColor,
    activeTitleColor: scheme.activeTitleColor,
    activeTitleTextColor: scheme.activeTitleTextColor,
    inactiveTitleColor: scheme.inactiveTitleColor,
    inactiveTitleTextColor: scheme.inactiveTitleTextColor,
    textColor: scheme.textColor,
    highlightColor: scheme.highlightColor,
    buttonFace: scheme.buttonFace,
  };
}

function liveChatFontFamily(font: DesktopWtfLiveChatFont): string {
  switch (font) {
    case "classic-95":
      return getFontPack("classic-95").roles.app;
    case "terminal":
      return getFontPack("terminal").roles.mono;
    case "serif-press":
      return getFontPack("serif-press").roles.app;
    default:
      return getFontPack("classic-95").roles.app;
  }
}

function ColorField({
  label,
  value,
  ariaLabel,
  onChange,
}: {
  label: string;
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <span>{label}</span>
      <input
        aria-label={ariaLabel}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function formatBytes(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

const HAMSTER_CORE_STAT_MESSAGE_IDS: Record<HamsterCoreStatKey, Parameters<TranslateFn>[0]> = {
  metabolism: "themeBuilder.pet.gene.metabolism",
  speed: "themeBuilder.pet.gene.speed",
  strength: "themeBuilder.pet.gene.strength",
  intelligence: "themeBuilder.pet.gene.intelligence",
  stamina: "themeBuilder.pet.gene.stamina",
  sociability: "themeBuilder.pet.gene.sociability",
  grit: "themeBuilder.pet.gene.grit",
  luck: "themeBuilder.pet.gene.luck",
};

function PetStats({ pet, t }: { pet: HamsterState; t: TranslateFn }) {
  const rows = [
    [t("themeBuilder.pet.stat.food"), pet.hunger],
    [t("themeBuilder.pet.stat.water"), pet.thirst],
    [t("themeBuilder.pet.stat.fun"), pet.happiness],
    [t("themeBuilder.pet.stat.clean"), pet.hygiene],
    [t("themeBuilder.pet.stat.energy"), pet.energy],
    [t("themeBuilder.pet.stat.happyIndex"), pet.happinessIndexScore],
    [t("themeBuilder.pet.stat.trauma"), pet.trauma],
  ] as const;
  const geneRows = HAMSTER_CORE_STAT_KEYS.map((key) => [
    t(HAMSTER_CORE_STAT_MESSAGE_IDS[key]),
    pet.genetics.effectiveStats[key],
  ] as const);

  return (
    <>
      <StatRows>
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <span>{label}</span>
            <StatBar $value={value} data-desktop-settings-region="stat-bar" />
            <span>{value}</span>
          </Fragment>
        ))}
      </StatRows>
      <GenePanel>
        <div>
          {t("themeBuilder.pet.geneLine", {
            generation: pet.genetics.generation,
            bondLevel: pet.bondLevel,
            rarity: pet.genetics.rarityTier.toUpperCase(),
            size: pet.genetics.phenotype.sizeClass,
          })}
        </div>
        <TraitRow>
          {pet.genetics.attributes.length > 0 ? (
            pet.genetics.attributes.map((attribute) => (
              <TraitChip key={attribute.key} $rarity={attribute.rarity}>
                {attribute.label}
              </TraitChip>
            ))
          ) : (
            <span>{t("themeBuilder.pet.noRareTraits")}</span>
          )}
        </TraitRow>
        <StatRows>
          {geneRows.map(([label, value]) => (
            <Fragment key={label}>
              <span>{label}</span>
              <StatBar $value={value} data-desktop-settings-region="stat-bar" />
              <span>{value}</span>
            </Fragment>
          ))}
        </StatRows>
      </GenePanel>
    </>
  );
}

export function DesktopSettings() {
  const presentation = usePresentationShell();
  const qc = useQueryClient();
  const { t, formatDate } = useLocalization();
  const fileRef = useRef<HTMLInputElement>(null);
  const initialSettingsLoadedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("background");
  const [draft, setDraft] = useState<DesktopAppearance>(DEFAULT_DESKTOP_APPEARANCE);
  const [savedAppearance, setSavedAppearance] = useState<DesktopAppearance | null>(null);
  const [petDraft, setPetDraft] = useState<{ name: string; colorSchemeKey: string }>({
    name: "",
    colorSchemeKey: HAMSTER_COLOR_SCHEMES[0].key,
  });
  const [fileError, setFileError] = useState("");
  const [mcpTokenName, setMcpTokenName] = useState("Desktop Agent");
  const [generatedMcpToken, setGeneratedMcpToken] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["desktop", "settings"],
    queryFn: () => api.get<DesktopSettingsResponse>("/api/desktop/settings"),
    retry: false,
  });

  const petQuery = useQuery({
    queryKey: ["desktop", "pet"],
    queryFn: () => api.get<PetResponse>("/api/desktop/pet"),
    enabled: draft.desktopPetEnabled,
    retry: false,
  });

  const mediaQuery = useQuery({
    queryKey: ["media-library", "image"],
    queryFn: () => api.get<MediaItem[]>("/api/media/mine?category=image"),
    retry: false,
  });

  const tokensQuery = useQuery({
    queryKey: ["desktop", "wallpaper-tokens"],
    queryFn: async () => {
      const created = await api.get<{ items: OwnedToken[] }>(
        "/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=true"
      );
      const collected = await api.get<{ items: OwnedToken[] }>(
        "/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=false"
      );
      const seen = new Set((created.items || []).map((token) => `${token.contract}:${token.tokenId}`));
      return [
        ...(created.items || []),
        ...(collected.items || []).filter((token) => !seen.has(`${token.contract}:${token.tokenId}`)),
      ];
    },
    retry: false,
  });

  const mcpTokensQuery = useQuery({
    queryKey: ["mcp", "tokens"],
    queryFn: () => api.get<McpTokensResponse>("/api/mcp/tokens"),
    retry: false,
  });

  const setAppearanceDraft = useCallback(
    (updater: Partial<DesktopAppearance> | ((prev: DesktopAppearance) => DesktopAppearance)) => {
      setDraft((prev) => {
        const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
        qc.setQueryData(["desktop", "settings"], (current: DesktopSettingsResponse | undefined) => ({
          appearance: next,
          iconLayout: current?.iconLayout ?? settingsQuery.data?.iconLayout ?? {},
          localization:
            current?.localization ??
            settingsQuery.data?.localization ??
            DEFAULT_LOCALIZATION_SETTINGS,
          updatedAt: current?.updatedAt ?? settingsQuery.data?.updatedAt ?? null,
        }));
        return next;
      });
    },
    [qc, settingsQuery.data?.iconLayout, settingsQuery.data?.localization, settingsQuery.data?.updatedAt]
  );

  const patchDraft = useCallback(
    (patch: Partial<DesktopAppearance>) => {
      setAppearanceDraft(patch);
    },
    [setAppearanceDraft]
  );

  const patchWimChatStyle = useCallback(
    (patch: Partial<DesktopAppearance["wimChatStyle"]>) => {
      setAppearanceDraft((prev) => ({
        ...prev,
        wimChatStyle: {
          ...prev.wimChatStyle,
          ...patch,
        },
      }));
      reportThemeBuilderEvent("desktop.chat_typography.updated", "wim-default", {
        fontFamily: String(patch.fontFamily ?? draft.wimChatStyle.fontFamily),
        fontSize: Number(patch.fontSize ?? draft.wimChatStyle.fontSize),
      });
    },
    [draft.wimChatStyle.fontFamily, draft.wimChatStyle.fontSize, setAppearanceDraft]
  );

  const patchWtfLiveChatStyle = useCallback(
    (patch: Partial<DesktopAppearance["wtfLiveChatStyle"]>) => {
      setAppearanceDraft((prev) => ({
        ...prev,
        wtfLiveChatStyle: {
          ...prev.wtfLiveChatStyle,
          ...patch,
        },
      }));
      reportThemeBuilderEvent("desktop.chat_typography.updated", "wtf-live-default", {
        font: String(patch.font ?? draft.wtfLiveChatStyle.font),
        size: Number(patch.size ?? draft.wtfLiveChatStyle.size),
      });
    },
    [draft.wtfLiveChatStyle.font, draft.wtfLiveChatStyle.size, setAppearanceDraft]
  );

  const saveMutation = useMutation({
    mutationFn: (appearance: DesktopAppearance) =>
      api.put<DesktopSettingsResponse>("/api/desktop/settings", {
        appearance,
        updatedAt: settingsQuery.data?.updatedAt ?? null,
      }),
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "settings"], result);
      setDraft(result.appearance);
      setSavedAppearance(result.appearance);
      reportThemeBuilderEvent("desktop.appearance.updated", "save", {
        appearanceStyleKey: result.appearance.appearanceStyleKey,
        colorSchemeKey: result.appearance.colorSchemeKey,
        fontPackKey: result.appearance.fontPackKey,
        chatTypographyPresetKey: result.appearance.chatTypographyPresetKey,
        wimChatFont: result.appearance.wimChatStyle.fontFamily,
        wimChatSize: result.appearance.wimChatStyle.fontSize,
        wtfLiveChatFont: result.appearance.wtfLiveChatStyle.font,
        wtfLiveChatSize: result.appearance.wtfLiveChatStyle.size,
        cursorStyle: result.appearance.cursorStyle,
        backgroundFit: result.appearance.backgroundFit,
        wallpaperSet: Boolean(result.appearance.backgroundImageUrl),
        physicsEnabled: result.appearance.desktopPhysicsEnabled,
        gravityMode: result.appearance.desktopGravityMode,
        desktopPetEnabled: result.appearance.desktopPetEnabled,
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (body: { title: string; mimeType: string; fileData: string }) =>
      api.post<MediaItem>("/api/media/upload", { ...body, mediaCategory: "image" }),
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ["media-library", "image"] });
      const url = mediaLibraryWallpaperUrl(item);
      if (url) patchDraft({ backgroundImageUrl: url });
      reportThemeBuilderEvent("desktop.wallpaper.uploaded", "upload", {
        mediaId: item.id,
        mimeType: item.mimeType,
        mediaCategory: item.mediaCategory,
      });
    },
    onError: (error) => {
      setFileError(error instanceof Error ? error.message : t("themeBuilder.upload.failed"));
    },
  });

  const resetIconsMutation = useMutation({
    mutationFn: () =>
      api.put<DesktopSettingsResponse>("/api/desktop/settings", {
        iconLayout: {},
        updatedAt: settingsQuery.data?.updatedAt ?? null,
      }),
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "settings"], result);
      reportDesktopSettingsEvent({
        eventType: "desktop.icon_layout.reset",
        objectId: "desktop-icons",
        objectKind: "icon-layout",
        action: "reset",
      });
    },
  });

  const petActionMutation = useMutation({
    mutationFn: (action: HamsterAction) =>
      api.post<PetResponse & { xpAmount: number }>("/api/desktop/pet/actions", {
        action,
        metadata: { surface: "desktop_settings" },
      }),
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "pet"], (prev: PetResponse | undefined) => ({
        pet: result.pet,
        events: prev?.events ?? [],
      }));
      qc.invalidateQueries({ queryKey: ["desktop", "pet"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  const petPatchMutation = useMutation({
    mutationFn: (patch: { name: string; colorSchemeKey: string }) =>
      api.patch<PetResponse>("/api/desktop/pet", {
        ...patch,
        metadata: { surface: "desktop_settings" },
      }),
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "pet"], (prev: PetResponse | undefined) => ({
        pet: result.pet,
        events: prev?.events ?? [],
      }));
      qc.invalidateQueries({ queryKey: ["desktop", "pet"] });
    },
  });

  const createMcpTokenMutation = useMutation({
    mutationFn: () =>
      api.post<McpCreateTokenResponse>("/api/mcp/tokens", {
        name: mcpTokenName,
      }),
    onSuccess: (result) => {
      setGeneratedMcpToken(result.token);
      qc.invalidateQueries({ queryKey: ["mcp", "tokens"] });
    },
  });

  const revokeMcpTokenMutation = useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/api/mcp/tokens/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp", "tokens"] });
    },
  });

  const pet = petQuery.data?.pet;

  useEffect(() => {
    if (!settingsQuery.data?.appearance || initialSettingsLoadedRef.current) return;
    initialSettingsLoadedRef.current = true;
    setDraft(settingsQuery.data.appearance);
    setSavedAppearance(settingsQuery.data.appearance);
  }, [settingsQuery.data?.appearance]);

  useEffect(() => {
    reportThemeBuilderEvent("desktop.settings.viewed", "view", {
      surface: "theme-builder",
    });
  }, []);

  useEffect(() => {
    if (!pet) return;
    setPetDraft({
      name: pet.name,
      colorSchemeKey: pet.colorSchemeKey,
    });
  }, [pet?.colorSchemeKey, pet?.name]);

  const handleFile = async (file: File | undefined) => {
    setFileError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError(t("themeBuilder.upload.imagesOnly"));
      return;
    }
    if (file.size > DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES) {
      setFileError(
        t("themeBuilder.upload.tooLarge", {
          size: formatBytes(DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES),
        })
      );
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    uploadMutation.mutate({
      title: file.name,
      mimeType: file.type || "image/png",
      fileData: dataUrl,
    });
  };

  const mediaChoices = useMemo(
    () =>
      (mediaQuery.data || [])
        .map((item) => ({ item, url: mediaLibraryWallpaperUrl(item) }))
        .filter((choice): choice is { item: MediaItem; url: string } => Boolean(choice.url)),
    [mediaQuery.data]
  );

  const tokenChoices = useMemo(
    () =>
      (tokensQuery.data || [])
        .map((token) => ({
          token,
          mime: getTokenMimeType(token.metadata),
          url: tokenWallpaperUrl(token),
        }))
        .filter(
          (choice): choice is { token: OwnedToken; mime: string | null; url: string } =>
            Boolean(choice.url) && (!choice.mime || isImageMime(choice.mime))
        )
        .slice(0, 80),
    [tokensQuery.data]
  );

  const petScheme =
    HAMSTER_COLOR_SCHEMES.find((scheme) => scheme.key === pet?.colorSchemeKey) ??
    HAMSTER_COLOR_SCHEMES[0];
  const activeMcpTokens = (mcpTokensQuery.data?.tokens ?? []).filter(
    (token) => !token.revokedAt
  );
  const petActions: Array<{ action: HamsterAction; label: string; icon: ReactNode }> =
    pet?.alive === false
      ? [{ action: "revive", label: t("themeBuilder.pet.action.adopt"), icon: <Heart /> }]
      : [
          { action: "feed", label: t("themeBuilder.pet.action.feed"), icon: <Apple /> },
          { action: "water", label: t("themeBuilder.pet.action.water"), icon: <Droplets /> },
          { action: "play", label: t("themeBuilder.pet.action.play"), icon: <Gamepad2 /> },
          { action: "pet", label: t("themeBuilder.pet.action.pet"), icon: <Heart /> },
          { action: "clean", label: t("themeBuilder.pet.action.clean"), icon: <Sparkles /> },
          { action: "scoop", label: t("themeBuilder.pet.action.scoop"), icon: <Trash2 /> },
          { action: "nap", label: t("themeBuilder.pet.action.nap"), icon: <Moon /> },
        ];

  const draftSignature = useMemo(() => stableSettingsString(draft), [draft]);
  const savedAppearanceSignature = useMemo(
    () => stableSettingsString(savedAppearance),
    [savedAppearance]
  );
  const hasUnsavedAppearanceChanges =
    Boolean(savedAppearance) && draftSignature !== savedAppearanceSignature;
  const saveStateText = saveMutation.isPending
    ? t("themeBuilder.saveState.saving")
    : hasUnsavedAppearanceChanges
      ? t("themeBuilder.saveState.unsaved")
      : t("themeBuilder.saveState.recorded");
  const settingsTabs = useMemo<SettingsTabDefinition[]>(
    () => [
      {
        key: "background",
        label: t("themeBuilder.tab.background"),
        summary: t("themeBuilder.tab.background.summary"),
        icon: <ImageIcon />,
      },
      {
        key: "appearance",
        label: t("themeBuilder.tab.appearance"),
        summary: t("themeBuilder.tab.appearance.summary"),
        icon: <Palette />,
      },
      {
        key: "font",
        label: t("themeBuilder.tab.font"),
        summary: t("themeBuilder.tab.font.summary"),
        icon: <TypeIcon />,
      },
      {
        key: "cursor",
        label: t("themeBuilder.tab.cursor"),
        summary: t("themeBuilder.tab.cursor.summary"),
        icon: <MousePointer2 />,
      },
      {
        key: "physics",
        label: t("themeBuilder.tab.physics"),
        summary: t("themeBuilder.tab.physics.summary"),
        icon: <SlidersHorizontal />,
      },
      {
        key: "pet",
        label: t("themeBuilder.tab.pet"),
        summary: t("themeBuilder.tab.pet.summary"),
        icon: <Brush />,
      },
      {
        key: "agent",
        label: t("themeBuilder.tab.agent"),
        summary: t("themeBuilder.tab.agent.summary"),
        icon: <Bot />,
      },
    ],
    [t]
  );

  return (
    <AppWindow title={t("themeBuilder.title")}>
      <Shell
        data-desktop-settings-surface="theme-builder"
        data-desktop-settings-presentation-host={presentation.host}
        data-desktop-settings-region="surface"
      >
        <SettingsNav variant="outside" data-desktop-settings-region="settings-nav">
          <NavTitle>{t("themeBuilder.title")}</NavTitle>
          <TabList role="tablist" aria-label={t("themeBuilder.title")}>
            {settingsTabs.map((tab) => (
              <SettingsTab
                key={tab.key}
                id={`desktop-settings-tab-${tab.key}`}
                type="button"
                role="tab"
                $active={activeTab === tab.key}
                aria-selected={activeTab === tab.key}
                aria-controls={`desktop-settings-panel-${tab.key}`}
                data-testid={`desktop-settings-tab-${tab.key}`}
                data-desktop-settings-region="settings-tab"
                onClick={() => setActiveTab(tab.key)}
              >
                <span aria-hidden>{tab.icon}</span>
                <span>
                  <strong>{tab.label}</strong>
                  <span>{tab.summary}</span>
                </span>
              </SettingsTab>
            ))}
          </TabList>
        </SettingsNav>

        <SettingsMain data-desktop-settings-region="tab-panel">
        <Group
          variant="outside"
          id="desktop-settings-panel-appearance"
          role="tabpanel"
          aria-labelledby="desktop-settings-tab-appearance"
          hidden={activeTab !== "appearance"}
          data-desktop-settings-region="appearance-panel"
        >
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.appearance")}
          </GroupTitle>
          <StyleGrid>
            {DESKTOP_APPEARANCE_STYLES.map((style) => (
              <StyleButton
                key={style.key}
                type="button"
                $active={draft.appearanceStyleKey === style.key}
                $styleKey={style.key}
                aria-pressed={draft.appearanceStyleKey === style.key}
                data-desktop-settings-region="style-button"
                onClick={() => patchDraft({ appearanceStyleKey: style.key })}
              >
                <StylePreview $styleKey={style.key} data-desktop-settings-region="style-preview" />
                <StyleName>{style.label}</StyleName>
                <StyleSummary data-desktop-settings-region="summary">{style.summary}</StyleSummary>
              </StyleButton>
            ))}
          </StyleGrid>
          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.colorSchemes")}
          </GroupTitle>
          <PresetGrid>
            {DESKTOP_COLOR_SCHEMES.map((scheme) => (
              <PresetButton
                key={scheme.key}
                type="button"
                $active={draft.colorSchemeKey === scheme.key}
                aria-pressed={draft.colorSchemeKey === scheme.key}
                data-desktop-settings-region="color-preset-button"
                onClick={() => setAppearanceDraft((prev) => applyScheme(prev, scheme.key))}
              >
                <Swatch
                  $colors={[
                    scheme.desktopColor,
                    scheme.windowColor,
                    scheme.activeTitleColor,
                    scheme.textColor,
                  ]}
                  data-desktop-settings-region="swatch"
                >
                  <i />
                  <i />
                  <i />
                  <i />
                </Swatch>
                <span>{scheme.label}</span>
              </PresetButton>
            ))}
          </PresetGrid>
          <Separator style={{ margin: "10px 0" }} />
          <FieldGrid>
            <ColorField
              label={t("themeBuilder.color.desktop")}
              ariaLabel={t("themeBuilder.colorInput", { label: t("themeBuilder.color.desktop") })}
              value={draft.desktopColor}
              onChange={(desktopColor) => patchDraft({ desktopColor })}
            />
            <ColorField
              label={t("themeBuilder.color.window")}
              ariaLabel={t("themeBuilder.colorInput", { label: t("themeBuilder.color.window") })}
              value={draft.windowColor}
              onChange={(windowColor) => patchDraft({ windowColor })}
            />
            <ColorField
              label={t("themeBuilder.color.activeFrame")}
              ariaLabel={t("themeBuilder.colorInput", { label: t("themeBuilder.color.activeFrame") })}
              value={draft.activeTitleColor}
              onChange={(activeTitleColor) => patchDraft({ activeTitleColor })}
            />
            <ColorField
              label={t("themeBuilder.color.inactiveFrame")}
              ariaLabel={t("themeBuilder.colorInput", { label: t("themeBuilder.color.inactiveFrame") })}
              value={draft.inactiveTitleColor}
              onChange={(inactiveTitleColor) => patchDraft({ inactiveTitleColor })}
            />
            <ColorField
              label={t("themeBuilder.color.text")}
              ariaLabel={t("themeBuilder.colorInput", { label: t("themeBuilder.color.text") })}
              value={draft.textColor}
              onChange={(textColor) => patchDraft({ textColor })}
            />
            <ColorField
              label={t("themeBuilder.color.highlight")}
              ariaLabel={t("themeBuilder.colorInput", { label: t("themeBuilder.color.highlight") })}
              value={draft.highlightColor}
              onChange={(highlightColor) => patchDraft({ highlightColor })}
            />
          </FieldGrid>
          <TabSaveBar data-desktop-settings-region="toolbar">
            <IconButton
              data-desktop-settings-region="toolbar-button"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save /> {t("common.save")}
            </IconButton>
          </TabSaveBar>
        </Group>

        <Group
          variant="outside"
          id="desktop-settings-panel-font"
          role="tabpanel"
          aria-labelledby="desktop-settings-tab-font"
          hidden={activeTab !== "font"}
          data-desktop-settings-region="font-panel"
        >
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.typography")}
          </GroupTitle>
          <HelpText style={{ marginBottom: 8 }} data-desktop-settings-region="help">
            {t("themeBuilder.typography.help")}
          </HelpText>
          <FontPackGrid>
            {FONT_PACKS.map((pack) => (
              <FontPackButton
                key={pack.key}
                type="button"
                $active={draft.fontPackKey === pack.key}
                aria-pressed={draft.fontPackKey === pack.key}
                aria-label={`Font pack ${pack.label}`}
                data-testid={`font-pack-${pack.key}`}
                data-desktop-settings-region="font-pack-button"
                onClick={() => {
                  patchDraft({ fontPackKey: pack.key });
                  reportThemeBuilderEvent("desktop.font_pack.updated", "select", {
                    fontPackKey: pack.key,
                  });
                }}
              >
                <FontPackLabel $fontFamily={pack.roles.display}>{pack.label}</FontPackLabel>
                <span
                  style={{ fontSize: "var(--wtf-type-caption, 13px)", lineHeight: 1.18 }}
                  data-desktop-settings-region="summary"
                >
                  {pack.description}
                </span>
                <FontPackPreview
                  $uiFont={pack.roles.ui}
                  $monoFont={pack.roles.mono}
                  $displayFont={pack.roles.display}
                >
                  <span>UI sample line</span>
                  <span>mono://0xabc123</span>
                  <span>DISPLAY</span>
                </FontPackPreview>
              </FontPackButton>
            ))}
          </FontPackGrid>
          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.chatDefaults")}
          </GroupTitle>
          <HelpText data-desktop-settings-region="help">
            {t("themeBuilder.chatDefaults.help")}
          </HelpText>
          <ChatPresetGrid>
            {DESKTOP_CHAT_TYPOGRAPHY_PRESETS.map((preset) => (
              <ChatPresetButton
                key={preset.key}
                type="button"
                $active={draft.chatTypographyPresetKey === preset.key}
                aria-pressed={draft.chatTypographyPresetKey === preset.key}
                aria-label={`Chat typography preset ${preset.label}`}
                data-desktop-settings-region="chat-preset-button"
                onClick={() => {
                  setAppearanceDraft((prev) => ({
                    ...prev,
                    chatTypographyPresetKey: preset.key,
                    wimChatStyle: { ...preset.wim },
                    wtfLiveChatStyle: { ...preset.wtfLive },
                  }));
                  reportThemeBuilderEvent("desktop.chat_typography.updated", "select-preset", {
                    chatTypographyPresetKey: preset.key,
                    wimChatFont: preset.wim.fontFamily,
                    wimChatSize: preset.wim.fontSize,
                    wtfLiveChatFont: preset.wtfLive.font,
                    wtfLiveChatSize: preset.wtfLive.size,
                  });
                }}
              >
                <ChatPresetName>{preset.label}</ChatPresetName>
                <ChatPresetSummary data-desktop-settings-region="summary">{preset.summary}</ChatPresetSummary>
                <ChatPreviewStrip aria-hidden>
                  <ChatPreviewBubble
                    $fontFamily={preset.wim.fontFamily}
                    $fontSize={preset.wim.fontSize}
                    $color={preset.wim.color}
                    $bold={preset.wim.bold}
                    $italic={preset.wim.italic}
                    $underline={preset.wim.underline}
                    data-desktop-settings-region="chat-preview"
                  >
                    WIM lorem ipsum
                  </ChatPreviewBubble>
                  <ChatPreviewBubble
                    $fontFamily={liveChatFontFamily(preset.wtfLive.font)}
                    $fontSize={preset.wtfLive.size}
                    $color={DESKTOP_WTF_LIVE_CHAT_COLOR_VALUES[preset.wtfLive.color]}
                    $bold={preset.wtfLive.bold}
                    $italic={preset.wtfLive.italic}
                    data-desktop-settings-region="chat-preview"
                  >
                    LIVE lorem ipsum
                  </ChatPreviewBubble>
                </ChatPreviewStrip>
              </ChatPresetButton>
            ))}
          </ChatPresetGrid>
          <ChatDefaultGrid>
            <ChatDefaultPanel data-desktop-settings-region="chat-default-panel">
              <ChatDefaultTitle>
                <span>{t("themeBuilder.chat.wimMessages")}</span>
                <span>{draft.wimChatStyle.fontSize}px</span>
              </ChatDefaultTitle>
              <FieldGrid>
                <Field>
                  <span>{t("themeBuilder.field.font")}</span>
                  <select
                    aria-label={t("themeBuilder.chat.defaultWimFont")}
                    value={draft.wimChatStyle.fontFamily}
                    onChange={(e) =>
                      patchWimChatStyle({
                        fontFamily: e.target.value as DesktopAppearance["wimChatStyle"]["fontFamily"],
                      })
                    }
                  >
                    {DESKTOP_WIM_CHAT_FONT_FAMILIES.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <span>{t("themeBuilder.field.size")}</span>
                  <select
                    aria-label={t("themeBuilder.chat.defaultWimFontSize")}
                    value={draft.wimChatStyle.fontSize}
                    onChange={(e) =>
                      patchWimChatStyle({
                        fontSize: Number(e.target.value) as DesktopAppearance["wimChatStyle"]["fontSize"],
                      })
                    }
                  >
                    {DESKTOP_WIM_CHAT_FONT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}px
                      </option>
                    ))}
                  </select>
                </Field>
              </FieldGrid>
              <Inline>
                <Field style={{ minWidth: 96 }}>
                  <span>{t("themeBuilder.field.color")}</span>
                  <input
                    aria-label={t("themeBuilder.chat.defaultWimTextColor")}
                    type="color"
                    value={draft.wimChatStyle.color}
                    onChange={(e) => patchWimChatStyle({ color: e.target.value })}
                  />
                </Field>
                <ChatToggleRow aria-label={t("themeBuilder.chat.defaultWimEmphasis")}>
                  <ChatToggleButton
                    type="button"
                    $active={draft.wimChatStyle.bold}
                    aria-label={t("themeBuilder.chat.defaultWimBold")}
                    aria-pressed={draft.wimChatStyle.bold}
                    data-desktop-settings-region="chat-toggle"
                    onClick={() => patchWimChatStyle({ bold: !draft.wimChatStyle.bold })}
                  >
                    <Bold aria-hidden />
                  </ChatToggleButton>
                  <ChatToggleButton
                    type="button"
                    $active={draft.wimChatStyle.italic}
                    aria-label={t("themeBuilder.chat.defaultWimItalic")}
                    aria-pressed={draft.wimChatStyle.italic}
                    data-desktop-settings-region="chat-toggle"
                    onClick={() => patchWimChatStyle({ italic: !draft.wimChatStyle.italic })}
                  >
                    <Italic aria-hidden />
                  </ChatToggleButton>
                  <ChatToggleButton
                    type="button"
                    $active={draft.wimChatStyle.underline}
                    aria-label={t("themeBuilder.chat.defaultWimUnderline")}
                    aria-pressed={draft.wimChatStyle.underline}
                    data-desktop-settings-region="chat-toggle"
                    onClick={() => patchWimChatStyle({ underline: !draft.wimChatStyle.underline })}
                  >
                    <Underline aria-hidden />
                  </ChatToggleButton>
                </ChatToggleRow>
              </Inline>
              <ChatPreviewBubble
                $fontFamily={draft.wimChatStyle.fontFamily}
                $fontSize={draft.wimChatStyle.fontSize}
                $color={draft.wimChatStyle.color}
                $bold={draft.wimChatStyle.bold}
                $italic={draft.wimChatStyle.italic}
                $underline={draft.wimChatStyle.underline}
                data-desktop-settings-region="chat-preview"
              >
                WIM preview: Lorem ipsum dolor sit amet.
              </ChatPreviewBubble>
            </ChatDefaultPanel>
            <ChatDefaultPanel data-desktop-settings-region="chat-default-panel">
              <ChatDefaultTitle>
                <span>{t("themeBuilder.chat.liveRoomChat")}</span>
                <span>{draft.wtfLiveChatStyle.size}px</span>
              </ChatDefaultTitle>
              <FieldGrid>
                <Field>
                  <span>{t("themeBuilder.field.font")}</span>
                  <select
                    aria-label={t("themeBuilder.chat.defaultLiveFont")}
                    value={draft.wtfLiveChatStyle.font}
                    onChange={(e) =>
                      patchWtfLiveChatStyle({
                        font: e.target.value as DesktopAppearance["wtfLiveChatStyle"]["font"],
                      })
                    }
                  >
                    {DESKTOP_WTF_LIVE_CHAT_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {DESKTOP_WTF_LIVE_CHAT_FONT_LABELS[font]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <span>{t("themeBuilder.field.size")}</span>
                  <select
                    aria-label={t("themeBuilder.chat.defaultLiveFontSize")}
                    value={draft.wtfLiveChatStyle.size}
                    onChange={(e) =>
                      patchWtfLiveChatStyle({
                        size: Number(e.target.value) as DesktopAppearance["wtfLiveChatStyle"]["size"],
                      })
                    }
                  >
                    {DESKTOP_WTF_LIVE_CHAT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}px
                      </option>
                    ))}
                  </select>
                </Field>
              </FieldGrid>
              <Inline>
                <ChatColorStrip role="group" aria-label={t("themeBuilder.chat.defaultLiveColor")}>
                  {DESKTOP_WTF_LIVE_CHAT_COLORS.map((color) => (
                    <ChatColorButton
                    key={color}
                    type="button"
                    $color={DESKTOP_WTF_LIVE_CHAT_COLOR_VALUES[color]}
                    $active={draft.wtfLiveChatStyle.color === color}
                    title={DESKTOP_WTF_LIVE_CHAT_COLOR_LABELS[color]}
                    aria-label={t("themeBuilder.chat.defaultLiveColorChoice", {
                      color: DESKTOP_WTF_LIVE_CHAT_COLOR_LABELS[color],
                    })}
                    aria-pressed={draft.wtfLiveChatStyle.color === color}
                    data-desktop-settings-region="chat-color"
                    onClick={() => patchWtfLiveChatStyle({ color })}
                  />
                  ))}
                </ChatColorStrip>
                <ChatToggleRow aria-label={t("themeBuilder.chat.defaultLiveEmphasis")}>
                  <ChatToggleButton
                    type="button"
                    $active={draft.wtfLiveChatStyle.bold}
                    aria-label={t("themeBuilder.chat.defaultLiveBold")}
                    aria-pressed={draft.wtfLiveChatStyle.bold}
                    data-desktop-settings-region="chat-toggle"
                    onClick={() => patchWtfLiveChatStyle({ bold: !draft.wtfLiveChatStyle.bold })}
                  >
                    <Bold aria-hidden />
                  </ChatToggleButton>
                  <ChatToggleButton
                    type="button"
                    $active={draft.wtfLiveChatStyle.italic}
                    aria-label={t("themeBuilder.chat.defaultLiveItalic")}
                    aria-pressed={draft.wtfLiveChatStyle.italic}
                    data-desktop-settings-region="chat-toggle"
                    onClick={() => patchWtfLiveChatStyle({ italic: !draft.wtfLiveChatStyle.italic })}
                  >
                    <Italic aria-hidden />
                  </ChatToggleButton>
                </ChatToggleRow>
              </Inline>
              <ChatPreviewBubble
                $fontFamily={liveChatFontFamily(draft.wtfLiveChatStyle.font)}
                $fontSize={draft.wtfLiveChatStyle.size}
                $color={DESKTOP_WTF_LIVE_CHAT_COLOR_VALUES[draft.wtfLiveChatStyle.color]}
                $bold={draft.wtfLiveChatStyle.bold}
                $italic={draft.wtfLiveChatStyle.italic}
                data-desktop-settings-region="chat-preview"
              >
                LIVE preview: Lorem ipsum in the room.
              </ChatPreviewBubble>
            </ChatDefaultPanel>
          </ChatDefaultGrid>
          <TabSaveBar data-desktop-settings-region="toolbar">
            <IconButton
              data-desktop-settings-region="toolbar-button"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save /> {t("common.save")}
            </IconButton>
          </TabSaveBar>
        </Group>

        <Group
          variant="outside"
          id="desktop-settings-panel-background"
          role="tabpanel"
          aria-labelledby="desktop-settings-tab-background"
          hidden={activeTab !== "background"}
          data-desktop-settings-region="desktop-panel"
        >
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.desktop")}
          </GroupTitle>
          <Field>
            <span>{t("themeBuilder.field.backgroundUrl")}</span>
            <input
              aria-label={t("themeBuilder.field.backgroundUrl")}
              value={draft.backgroundImageUrl ?? ""}
              onChange={(e) => patchDraft({ backgroundImageUrl: e.target.value || null })}
              placeholder="https://..."
            />
          </Field>
          <Inline style={{ marginTop: 7 }}>
            <input
              aria-label={t("themeBuilder.action.uploadBackground")}
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <IconButton
              size="sm"
              data-desktop-settings-region="toolbar-button"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon /> {t("themeBuilder.action.upload")}
            </IconButton>
            <IconButton
              size="sm"
              data-desktop-settings-region="toolbar-button"
              onClick={() => patchDraft({ backgroundImageUrl: null })}
            >
              <Trash2 /> {t("themeBuilder.action.clear")}
            </IconButton>
            <Field style={{ minWidth: 112 }}>
              <span>{t("themeBuilder.field.fit")}</span>
              <select
                aria-label={t("themeBuilder.field.backgroundFit")}
                value={draft.backgroundFit}
                onChange={(e) => patchDraft({ backgroundFit: e.target.value as DesktopAppearance["backgroundFit"] })}
              >
                {DESKTOP_BACKGROUND_FITS.map((fit) => (
                  <option key={fit} value={fit}>{fit}</option>
                ))}
              </select>
            </Field>
          </Inline>
          <HelpText data-desktop-settings-region="help">
            {t("themeBuilder.upload.help", {
              size: formatBytes(DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES),
            })}
            {uploadMutation.isPending ? t("themeBuilder.upload.pending") : ""}
          </HelpText>
          {fileError && (
            <div style={{ color: "#b00000", fontSize: "var(--wtf-type-caption, 13px)", marginTop: 4 }}>
              {fileError}
            </div>
          )}

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.savedImages")}
          </GroupTitle>
          {mediaQuery.isLoading ? (
            <HelpText data-desktop-settings-region="help">
              {t("themeBuilder.savedImages.loading")}
            </HelpText>
          ) : mediaQuery.isError ? (
            <HelpText data-desktop-settings-region="help">
              {t("themeBuilder.savedImages.error")}
            </HelpText>
          ) : mediaChoices.length === 0 ? (
            <HelpText data-desktop-settings-region="help">
              {t("themeBuilder.savedImages.empty")}
            </HelpText>
          ) : (
            <SourceList>
              {mediaChoices.map(({ item, url }) => (
                <SourceButton
                  key={item.id}
                  type="button"
                  $active={draft.backgroundImageUrl === url}
                  aria-pressed={draft.backgroundImageUrl === url}
                  data-desktop-settings-region="source-button"
                  onClick={() => patchDraft({ backgroundImageUrl: url })}
                  title={item.title}
                >
                  <Thumb $src={url} data-desktop-settings-thumb="true" />
                  <SourceLabel>{item.title || `Media #${item.id}`}</SourceLabel>
                </SourceButton>
              ))}
            </SourceList>
          )}

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.tokenArt")}
          </GroupTitle>
          {tokensQuery.isLoading ? (
            <HelpText data-desktop-settings-region="help">
              {t("themeBuilder.tokenArt.loading")}
            </HelpText>
          ) : tokensQuery.isError ? (
            <HelpText data-desktop-settings-region="help">
              {t("themeBuilder.tokenArt.error")}
            </HelpText>
          ) : tokenChoices.length === 0 ? (
            <HelpText data-desktop-settings-region="help">
              {t("themeBuilder.tokenArt.empty")}
            </HelpText>
          ) : (
            <SourceList>
              {tokenChoices.map(({ token, url }) => (
                <SourceButton
                  key={`${token.contract}:${token.tokenId}`}
                  type="button"
                  $active={draft.backgroundImageUrl === url}
                  aria-pressed={draft.backgroundImageUrl === url}
                  data-desktop-settings-region="source-button"
                  onClick={() => {
                    patchDraft({ backgroundImageUrl: url });
                    reportThemeBuilderEvent("desktop.wallpaper.token_set", "set-token-art", {
                      contract: token.contract,
                      tokenId: token.tokenId,
                    });
                  }}
                  title={`${token.name || "Token"} ${token.contract}:${token.tokenId}`}
                >
                  <Thumb $src={url} data-desktop-settings-thumb="true" />
                  <SourceLabel>{token.name || `#${token.tokenId}`}</SourceLabel>
                </SourceButton>
              ))}
            </SourceList>
          )}
          <TabSaveBar data-desktop-settings-region="toolbar">
            <IconButton
              data-desktop-settings-region="toolbar-button"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save /> {t("common.save")}
            </IconButton>
          </TabSaveBar>
        </Group>

        <Group
          variant="outside"
          id="desktop-settings-panel-cursor"
          role="tabpanel"
          aria-labelledby="desktop-settings-tab-cursor"
          hidden={activeTab !== "cursor"}
          data-desktop-settings-region="cursor-panel"
        >
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.cursor")}
          </GroupTitle>
          <SegmentGrid>
            {DESKTOP_CURSOR_STYLES.map((style) => (
              <Button
                key={style}
                size="sm"
                active={draft.cursorStyle === style ? true : undefined}
                aria-pressed={draft.cursorStyle === style}
                data-desktop-settings-region="segment-button"
                onClick={() => patchDraft({ cursorStyle: style })}
              >
                {DESKTOP_CURSOR_LABELS[style]}
              </Button>
            ))}
          </SegmentGrid>
          <TabSaveBar data-desktop-settings-region="toolbar">
            <IconButton
              data-desktop-settings-region="toolbar-button"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save /> {t("common.save")}
            </IconButton>
          </TabSaveBar>
        </Group>

        <Group
          variant="outside"
          id="desktop-settings-panel-physics"
          role="tabpanel"
          aria-labelledby="desktop-settings-tab-physics"
          hidden={activeTab !== "physics"}
          data-desktop-settings-region="physics-panel"
        >
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.physics")}
          </GroupTitle>
          <Inline>
            <label>
              <input
                aria-label={t("themeBuilder.field.physics")}
                type="checkbox"
                checked={draft.desktopPhysicsEnabled}
                onChange={(e) => {
                  patchDraft({ desktopPhysicsEnabled: e.target.checked });
                  reportThemeBuilderEvent("desktop.physics.updated", "toggle", {
                    physicsEnabled: e.target.checked,
                    gravityMode: draft.desktopGravityMode,
                  });
                }}
              />{" "}
              {t("themeBuilder.field.physics")}
            </label>
            <Field style={{ minWidth: 120 }}>
              <span>{t("themeBuilder.field.gravity")}</span>
              <select
                aria-label={t("themeBuilder.field.gravity")}
                value={draft.desktopGravityMode}
                disabled={!draft.desktopPhysicsEnabled}
                onChange={(e) => {
                  const desktopGravityMode = e.target.value as DesktopAppearance["desktopGravityMode"];
                  patchDraft({ desktopGravityMode });
                  reportThemeBuilderEvent("desktop.physics.updated", "gravity", {
                    physicsEnabled: draft.desktopPhysicsEnabled,
                    gravityMode: desktopGravityMode,
                  });
                }}
              >
                {DESKTOP_GRAVITY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "zero" ? "0" : mode}
                  </option>
                ))}
              </select>
            </Field>
          </Inline>

          <Toolbar data-desktop-settings-region="toolbar">
            <IconButton
              size="sm"
              data-desktop-settings-region="toolbar-button"
              onClick={() => resetIconsMutation.mutate()}
              disabled={resetIconsMutation.isPending}
            >
              <RotateCcw /> {t("themeBuilder.action.resetIcons")}
            </IconButton>
            <IconButton
              data-desktop-settings-region="toolbar-button"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save /> {t("common.save")}
            </IconButton>
          </Toolbar>
        </Group>

        <Group
          variant="outside"
          id="desktop-settings-panel-pet"
          role="tabpanel"
          aria-labelledby="desktop-settings-tab-pet"
          hidden={activeTab !== "pet"}
          data-desktop-settings-region="pet-panel"
        >
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.pet")}
          </GroupTitle>
          <Inline style={{ marginBottom: 8 }}>
            <label>
              <input
                aria-label={t("themeBuilder.field.petEnabled")}
                type="checkbox"
                checked={draft.desktopPetEnabled}
                onChange={(e) => patchDraft({ desktopPetEnabled: e.target.checked })}
              />{" "}
              {t("themeBuilder.field.petEnabled")}
            </label>
          </Inline>
          {draft.desktopPetEnabled && pet && (
            <PetBox data-desktop-settings-region="pet-box">
              <div>
                <PetPreview>
                  <HamsterPixelSprite
                    alive={pet.alive}
                    scheme={petScheme}
                    width={76}
                    height={51}
                  />
                </PetPreview>
                <div style={{ textAlign: "center", fontWeight: "bold" }}>{pet.name}</div>
                <div style={{ textAlign: "center", fontSize: "var(--wtf-type-caption, 13px)" }}>
                  {t("themeBuilder.pet.progress", {
                    level: pet.level,
                    xp: pet.xpEarned,
                    care: pet.carePoints,
                  })}
                </div>
              </div>
              <div>
                <FieldGrid style={{ marginBottom: 8 }}>
                  <Field>
                    <span>{t("themeBuilder.pet.name")}</span>
                    <input
                      aria-label={t("themeBuilder.pet.name")}
                      value={petDraft.name}
                      maxLength={40}
                      onChange={(e) =>
                        setPetDraft((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    <span>{t("themeBuilder.pet.coat")}</span>
                    <select
                      aria-label={t("themeBuilder.pet.coat")}
                      value={petDraft.colorSchemeKey}
                      onChange={(e) =>
                        setPetDraft((prev) => ({
                          ...prev,
                          colorSchemeKey: e.target.value,
                        }))
                      }
                    >
                      {HAMSTER_COLOR_SCHEMES.map((scheme) => (
                        <option key={scheme.key} value={scheme.key}>
                          {scheme.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </FieldGrid>
                <Inline style={{ marginBottom: 8 }}>
                  <IconButton
                    size="sm"
                    data-desktop-settings-region="toolbar-button"
                    disabled={petPatchMutation.isPending}
                    onClick={() => petPatchMutation.mutate(petDraft)}
                  >
                    <Save /> {t("themeBuilder.action.savePet")}
                  </IconButton>
                </Inline>
                <PetStats pet={pet} t={t} />
                <Inline style={{ marginTop: 8 }}>
                  {petActions.map(({ action, label, icon }) => (
                    <IconButton
                      key={action}
                      size="sm"
                      data-desktop-settings-region="toolbar-button"
                      disabled={petActionMutation.isPending}
                      onClick={() => petActionMutation.mutate(action)}
                    >
                      {icon} {label}
                    </IconButton>
                  ))}
                </Inline>
                <EventList>
                  {(petQuery.data?.events ?? []).map((event) => (
                    <div key={event.id}>
                      {formatDate(event.createdAt, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      {event.action} {event.xpAmount ? `+${event.xpAmount} XP` : ""}
                    </div>
                  ))}
                </EventList>
              </div>
            </PetBox>
          )}
          <TabSaveBar data-desktop-settings-region="toolbar">
            <IconButton
              data-desktop-settings-region="toolbar-button"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save /> {t("common.save")}
            </IconButton>
          </TabSaveBar>
        </Group>

        <Group
          variant="outside"
          id="desktop-settings-panel-agent"
          role="tabpanel"
          aria-labelledby="desktop-settings-tab-agent"
          hidden={activeTab !== "agent"}
          data-desktop-settings-region="agent-panel"
        >
          <GroupTitle data-desktop-settings-region="section-title">
            {t("themeBuilder.section.agent")}
          </GroupTitle>
          <FieldGrid>
            <Field>
              <span data-desktop-settings-region="mcp-endpoint">
                {t("themeBuilder.field.mcpEndpoint")}
              </span>
              <input
                aria-label={t("themeBuilder.field.mcpEndpoint")}
                readOnly
                value={mcpTokensQuery.data?.endpoint ?? `${window.location.origin}/mcp`}
              />
            </Field>
            <Field>
              <span>{t("themeBuilder.field.tokenName")}</span>
              <input
                aria-label={t("themeBuilder.field.tokenName")}
                value={mcpTokenName}
                maxLength={100}
                onChange={(e) => setMcpTokenName(e.target.value)}
              />
            </Field>
          </FieldGrid>
          <Toolbar data-desktop-settings-region="toolbar">
            <IconButton
              size="sm"
              data-desktop-settings-region="toolbar-button"
              disabled={createMcpTokenMutation.isPending}
              onClick={() => createMcpTokenMutation.mutate()}
            >
              <KeyRound /> {t("themeBuilder.action.generateToken")}
            </IconButton>
          </Toolbar>
          {generatedMcpToken && (
            <div style={{ marginTop: 8 }}>
              <Field>
                <span>{t("themeBuilder.field.newToken")}</span>
                <SecretBox
                  aria-label={t("themeBuilder.field.newToken")}
                  readOnly
                  value={generatedMcpToken}
                  data-desktop-settings-region="secret-box"
                />
              </Field>
              <Inline style={{ marginTop: 6 }}>
                <IconButton
                  size="sm"
                  data-desktop-settings-region="toolbar-button"
                  onClick={() => void navigator.clipboard?.writeText(generatedMcpToken)}
                >
                  <Clipboard /> {t("themeBuilder.action.copy")}
                </IconButton>
                <HelpText data-desktop-settings-region="help">
                  {createMcpTokenMutation.data?.warning}
                </HelpText>
              </Inline>
            </div>
          )}
          <Separator style={{ margin: "10px 0" }} />
          {mcpTokensQuery.isLoading ? (
            <HelpText data-desktop-settings-region="help">
              {t("themeBuilder.agents.loading")}
            </HelpText>
          ) : activeMcpTokens.length === 0 ? (
            <HelpText data-desktop-settings-region="help">
              {t("themeBuilder.agents.empty")}
            </HelpText>
          ) : (
            activeMcpTokens.map((token) => (
              <TokenRow key={token.id} data-desktop-settings-region="token-row">
                <div>
                  <strong>{token.name}</strong>{" "}
                  <span>
                    {t("themeBuilder.agents.created", {
                      prefix: token.tokenPrefix,
                      date: formatDate(token.createdAt),
                    })}
                    {token.lastUsedAt
                      ? t("themeBuilder.agents.lastUsed", {
                          date: formatDate(token.lastUsedAt, {
                            dateStyle: "short",
                            timeStyle: "short",
                          }),
                        })
                      : ""}
                  </span>
                </div>
                <IconButton
                  size="sm"
                  data-desktop-settings-region="toolbar-button"
                  disabled={revokeMcpTokenMutation.isPending}
                  onClick={() => revokeMcpTokenMutation.mutate(token.id)}
                >
                  <Unplug /> {t("themeBuilder.action.revoke")}
                </IconButton>
              </TokenRow>
            ))
          )}
          <TabSaveBar data-desktop-settings-region="toolbar">
            <IconButton
              data-desktop-settings-region="toolbar-button"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save /> {t("common.save")}
            </IconButton>
          </TabSaveBar>
        </Group>
        </SettingsMain>

        <GlobalSaveDock data-desktop-settings-region="global-save">
          <GlobalSaveButton
            type="button"
            $dirty={hasUnsavedAppearanceChanges}
            data-testid="desktop-settings-global-save"
            data-save-state={hasUnsavedAppearanceChanges ? "unsaved" : "recorded"}
            data-desktop-settings-region="global-save-button"
            aria-label={saveStateText}
            title={saveStateText}
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(draft)}
          >
            <Save aria-hidden />
            <span>SAVE</span>
            <VisuallyHidden aria-live="polite">{saveStateText}</VisuallyHidden>
          </GlobalSaveButton>
        </GlobalSaveDock>
      </Shell>
    </AppWindow>
  );
}
