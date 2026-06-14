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
  Bold,
  Clipboard,
  Droplets,
  Gamepad2,
  Heart,
  Image as ImageIcon,
  Italic,
  KeyRound,
  Moon,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Underline,
  Unplug,
} from "lucide-react";
import { AppWindow } from "../components/layout/AppWindow";
import { HamsterPixelSprite } from "../components/layout/HamsterPixelSprite";
import { api } from "../lib/api";
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
  HAMSTER_CORE_STAT_LABELS,
  mediaLibraryWallpaperUrl,
  tokenWallpaperUrl,
  type DesktopAppearance,
  type DesktopIconLayout,
  type DesktopWtfLiveChatFont,
  type HamsterAction,
  type HamsterState,
} from "@shared/desktop";
import { getTokenMimeType, isImageMime } from "../lib/media-resolve";
import { FONT_PACKS, getFontPack } from "../features/appearance/font-packs";

type DesktopSettingsResponse = {
  appearance: DesktopAppearance;
  iconLayout: DesktopIconLayout;
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
  display: grid;
  grid-template-columns: minmax(220px, 0.85fr) minmax(280px, 1.15fr);
  gap: 10px;

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
  }
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
    case "grout-display":
      return getFontPack("mek-type").roles.display;
    case "classic-95":
      return getFontPack("classic-95").roles.app;
    case "terminal":
      return getFontPack("terminal").roles.mono;
    case "serif-press":
      return getFontPack("serif-press").roles.app;
    default:
      return getFontPack("mek-type").roles.mono;
  }
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <span>{label}</span>
      <input
        aria-label={`${label} color`}
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

function PetStats({ pet }: { pet: HamsterState }) {
  const rows = [
    ["Food", pet.hunger],
    ["Water", pet.thirst],
    ["Fun", pet.happiness],
    ["Clean", pet.hygiene],
    ["Energy", pet.energy],
    ["Happy Index", pet.happinessIndexScore],
    ["Trauma", pet.trauma],
  ] as const;
  const geneRows = HAMSTER_CORE_STAT_KEYS.map((key) => [
    HAMSTER_CORE_STAT_LABELS[key],
    pet.genetics.effectiveStats[key],
  ] as const);

  return (
    <>
      <StatRows>
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <span>{label}</span>
            <StatBar $value={value} />
            <span>{value}</span>
          </Fragment>
        ))}
      </StatRows>
      <GenePanel>
        <div>
          Gen {pet.genetics.generation} · Bond L{pet.bondLevel} ·{" "}
          {pet.genetics.rarityTier.toUpperCase()} · {pet.genetics.phenotype.sizeClass}
        </div>
        <TraitRow>
          {pet.genetics.attributes.length > 0 ? (
            pet.genetics.attributes.map((attribute) => (
              <TraitChip key={attribute.key} $rarity={attribute.rarity}>
                {attribute.label}
              </TraitChip>
            ))
          ) : (
            <span>No rare traits</span>
          )}
        </TraitRow>
        <StatRows>
          {geneRows.map(([label, value]) => (
            <Fragment key={label}>
              <span>{label}</span>
              <StatBar $value={value} />
              <span>{value}</span>
            </Fragment>
          ))}
        </StatRows>
      </GenePanel>
    </>
  );
}

export function DesktopSettings() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<DesktopAppearance>(DEFAULT_DESKTOP_APPEARANCE);
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
          updatedAt: current?.updatedAt ?? settingsQuery.data?.updatedAt ?? null,
        }));
        return next;
      });
    },
    [qc, settingsQuery.data?.iconLayout]
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
      setFileError(error instanceof Error ? error.message : "Upload failed.");
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
    if (settingsQuery.data?.appearance) {
      setDraft(settingsQuery.data.appearance);
    }
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
      setFileError("Image files only.");
      return;
    }
    if (file.size > DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES) {
      setFileError(`Pick an image under ${formatBytes(DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES)}.`);
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
      ? [{ action: "revive", label: "Adopt", icon: <Heart /> }]
      : [
          { action: "feed", label: "Feed", icon: <Apple /> },
          { action: "water", label: "Water", icon: <Droplets /> },
          { action: "play", label: "Play", icon: <Gamepad2 /> },
          { action: "pet", label: "Pet", icon: <Heart /> },
          { action: "clean", label: "Clean", icon: <Sparkles /> },
          { action: "scoop", label: "Scoop", icon: <Trash2 /> },
          { action: "nap", label: "Nap", icon: <Moon /> },
        ];

  return (
    <AppWindow title="Theme Builder">
      <Shell>
        <Group variant="outside">
          <GroupTitle>OS appearance</GroupTitle>
          <StyleGrid>
            {DESKTOP_APPEARANCE_STYLES.map((style) => (
              <StyleButton
                key={style.key}
                type="button"
                $active={draft.appearanceStyleKey === style.key}
                $styleKey={style.key}
                onClick={() => patchDraft({ appearanceStyleKey: style.key })}
              >
                <StylePreview $styleKey={style.key} />
                <StyleName>{style.label}</StyleName>
                <StyleSummary>{style.summary}</StyleSummary>
              </StyleButton>
            ))}
          </StyleGrid>
          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>System typography</GroupTitle>
          <HelpText style={{ marginBottom: 8 }}>
            Font packs apply instantly across the desktop shell and app windows.
          </HelpText>
          <FontPackGrid>
            {FONT_PACKS.map((pack) => (
              <FontPackButton
                key={pack.key}
                type="button"
                $active={draft.fontPackKey === pack.key}
                aria-label={`Font pack ${pack.label}`}
                data-testid={`font-pack-${pack.key}`}
                onClick={() => {
                  patchDraft({ fontPackKey: pack.key });
                  reportThemeBuilderEvent("desktop.font_pack.updated", "select", {
                    fontPackKey: pack.key,
                  });
                }}
              >
                <FontPackLabel $fontFamily={pack.roles.display}>{pack.label}</FontPackLabel>
                <span style={{ fontSize: "var(--wtf-type-caption, 13px)", lineHeight: 1.18 }}>
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
          <GroupTitle>Chat defaults</GroupTitle>
          <HelpText>
            These presets seed WIM messages and WTF LIVE room chat while keeping each composer inside
            its own font and size window.
          </HelpText>
          <ChatPresetGrid>
            {DESKTOP_CHAT_TYPOGRAPHY_PRESETS.map((preset) => (
              <ChatPresetButton
                key={preset.key}
                type="button"
                $active={draft.chatTypographyPresetKey === preset.key}
                aria-label={`Chat typography preset ${preset.label}`}
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
                <ChatPresetSummary>{preset.summary}</ChatPresetSummary>
                <ChatPreviewStrip aria-hidden>
                  <ChatPreviewBubble
                    $fontFamily={preset.wim.fontFamily}
                    $fontSize={preset.wim.fontSize}
                    $color={preset.wim.color}
                    $bold={preset.wim.bold}
                    $italic={preset.wim.italic}
                    $underline={preset.wim.underline}
                  >
                    WIM lorem ipsum
                  </ChatPreviewBubble>
                  <ChatPreviewBubble
                    $fontFamily={liveChatFontFamily(preset.wtfLive.font)}
                    $fontSize={preset.wtfLive.size}
                    $color={DESKTOP_WTF_LIVE_CHAT_COLOR_VALUES[preset.wtfLive.color]}
                    $bold={preset.wtfLive.bold}
                    $italic={preset.wtfLive.italic}
                  >
                    LIVE lorem ipsum
                  </ChatPreviewBubble>
                </ChatPreviewStrip>
              </ChatPresetButton>
            ))}
          </ChatPresetGrid>
          <ChatDefaultGrid>
            <ChatDefaultPanel>
              <ChatDefaultTitle>
                <span>WIM messages</span>
                <span>{draft.wimChatStyle.fontSize}px</span>
              </ChatDefaultTitle>
              <FieldGrid>
                <Field>
                  <span>Font</span>
                  <select
                    aria-label="Default WIM font"
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
                  <span>Size</span>
                  <select
                    aria-label="Default WIM font size"
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
                  <span>Color</span>
                  <input
                    aria-label="Default WIM text color"
                    type="color"
                    value={draft.wimChatStyle.color}
                    onChange={(e) => patchWimChatStyle({ color: e.target.value })}
                  />
                </Field>
                <ChatToggleRow aria-label="Default WIM emphasis">
                  <ChatToggleButton
                    type="button"
                    $active={draft.wimChatStyle.bold}
                    aria-label="Default WIM bold"
                    aria-pressed={draft.wimChatStyle.bold}
                    onClick={() => patchWimChatStyle({ bold: !draft.wimChatStyle.bold })}
                  >
                    <Bold aria-hidden />
                  </ChatToggleButton>
                  <ChatToggleButton
                    type="button"
                    $active={draft.wimChatStyle.italic}
                    aria-label="Default WIM italic"
                    aria-pressed={draft.wimChatStyle.italic}
                    onClick={() => patchWimChatStyle({ italic: !draft.wimChatStyle.italic })}
                  >
                    <Italic aria-hidden />
                  </ChatToggleButton>
                  <ChatToggleButton
                    type="button"
                    $active={draft.wimChatStyle.underline}
                    aria-label="Default WIM underline"
                    aria-pressed={draft.wimChatStyle.underline}
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
              >
                WIM preview: Lorem ipsum dolor sit amet.
              </ChatPreviewBubble>
            </ChatDefaultPanel>
            <ChatDefaultPanel>
              <ChatDefaultTitle>
                <span>WTF LIVE room chat</span>
                <span>{draft.wtfLiveChatStyle.size}px</span>
              </ChatDefaultTitle>
              <FieldGrid>
                <Field>
                  <span>Font</span>
                  <select
                    aria-label="Default WTF LIVE chat font"
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
                  <span>Size</span>
                  <select
                    aria-label="Default WTF LIVE chat font size"
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
                <ChatColorStrip role="group" aria-label="Default WTF LIVE chat color">
                  {DESKTOP_WTF_LIVE_CHAT_COLORS.map((color) => (
                    <ChatColorButton
                      key={color}
                      type="button"
                      $color={DESKTOP_WTF_LIVE_CHAT_COLOR_VALUES[color]}
                      $active={draft.wtfLiveChatStyle.color === color}
                      title={DESKTOP_WTF_LIVE_CHAT_COLOR_LABELS[color]}
                      aria-label={`Default WTF LIVE chat color ${DESKTOP_WTF_LIVE_CHAT_COLOR_LABELS[color]}`}
                      aria-pressed={draft.wtfLiveChatStyle.color === color}
                      onClick={() => patchWtfLiveChatStyle({ color })}
                    />
                  ))}
                </ChatColorStrip>
                <ChatToggleRow aria-label="Default WTF LIVE emphasis">
                  <ChatToggleButton
                    type="button"
                    $active={draft.wtfLiveChatStyle.bold}
                    aria-label="Default WTF LIVE bold"
                    aria-pressed={draft.wtfLiveChatStyle.bold}
                    onClick={() => patchWtfLiveChatStyle({ bold: !draft.wtfLiveChatStyle.bold })}
                  >
                    <Bold aria-hidden />
                  </ChatToggleButton>
                  <ChatToggleButton
                    type="button"
                    $active={draft.wtfLiveChatStyle.italic}
                    aria-label="Default WTF LIVE italic"
                    aria-pressed={draft.wtfLiveChatStyle.italic}
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
              >
                LIVE preview: Lorem ipsum in the room.
              </ChatPreviewBubble>
            </ChatDefaultPanel>
          </ChatDefaultGrid>
          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>Color schemes</GroupTitle>
          <PresetGrid>
            {DESKTOP_COLOR_SCHEMES.map((scheme) => (
              <PresetButton
                key={scheme.key}
                type="button"
                $active={draft.colorSchemeKey === scheme.key}
                onClick={() => setAppearanceDraft((prev) => applyScheme(prev, scheme.key))}
              >
                <Swatch
                  $colors={[
                    scheme.desktopColor,
                    scheme.windowColor,
                    scheme.activeTitleColor,
                    scheme.textColor,
                  ]}
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
            <ColorField label="Desktop" value={draft.desktopColor} onChange={(desktopColor) => patchDraft({ desktopColor })} />
            <ColorField label="Window" value={draft.windowColor} onChange={(windowColor) => patchDraft({ windowColor })} />
            <ColorField label="Active frame" value={draft.activeTitleColor} onChange={(activeTitleColor) => patchDraft({ activeTitleColor })} />
            <ColorField label="Inactive frame" value={draft.inactiveTitleColor} onChange={(inactiveTitleColor) => patchDraft({ inactiveTitleColor })} />
            <ColorField label="Text" value={draft.textColor} onChange={(textColor) => patchDraft({ textColor })} />
            <ColorField label="Highlight" value={draft.highlightColor} onChange={(highlightColor) => patchDraft({ highlightColor })} />
          </FieldGrid>
        </Group>

        <Group variant="outside">
          <GroupTitle>Desktop</GroupTitle>
          <Field>
            <span>Background image URL</span>
            <input
              aria-label="Background image URL"
              value={draft.backgroundImageUrl ?? ""}
              onChange={(e) => patchDraft({ backgroundImageUrl: e.target.value || null })}
              placeholder="https://..."
            />
          </Field>
          <Inline style={{ marginTop: 7 }}>
            <input
              aria-label="Upload background image"
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <IconButton size="sm" onClick={() => fileRef.current?.click()}>
              <ImageIcon /> Upload
            </IconButton>
            <IconButton size="sm" onClick={() => patchDraft({ backgroundImageUrl: null })}>
              <Trash2 /> Clear
            </IconButton>
            <Field style={{ minWidth: 112 }}>
              <span>Fit</span>
              <select
                aria-label="Background image fit"
                value={draft.backgroundFit}
                onChange={(e) => patchDraft({ backgroundFit: e.target.value as DesktopAppearance["backgroundFit"] })}
              >
                {DESKTOP_BACKGROUND_FITS.map((fit) => (
                  <option key={fit} value={fit}>{fit}</option>
                ))}
              </select>
            </Field>
          </Inline>
          <HelpText>
            Uploads use your media library and accept images up to{" "}
            {formatBytes(DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES)}.
            {uploadMutation.isPending ? " Uploading..." : ""}
          </HelpText>
          {fileError && (
            <div style={{ color: "#b00000", fontSize: "var(--wtf-type-caption, 13px)", marginTop: 4 }}>
              {fileError}
            </div>
          )}

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>Saved images</GroupTitle>
          {mediaQuery.isLoading ? (
            <HelpText>Loading saved media...</HelpText>
          ) : mediaQuery.isError ? (
            <HelpText>Saved media could not load.</HelpText>
          ) : mediaChoices.length === 0 ? (
            <HelpText>No saved image media yet.</HelpText>
          ) : (
            <SourceList>
              {mediaChoices.map(({ item, url }) => (
                <SourceButton
                  key={item.id}
                  type="button"
                  $active={draft.backgroundImageUrl === url}
                  onClick={() => patchDraft({ backgroundImageUrl: url })}
                  title={item.title}
                >
                  <Thumb $src={url} />
                  <SourceLabel>{item.title || `Media #${item.id}`}</SourceLabel>
                </SourceButton>
              ))}
            </SourceList>
          )}

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>Owned token art</GroupTitle>
          {tokensQuery.isLoading ? (
            <HelpText>Loading wallet art...</HelpText>
          ) : tokensQuery.isError ? (
            <HelpText>Wallet art could not load.</HelpText>
          ) : tokenChoices.length === 0 ? (
            <HelpText>No image tokens found in your synced wallets.</HelpText>
          ) : (
            <SourceList>
              {tokenChoices.map(({ token, url }) => (
                <SourceButton
                  key={`${token.contract}:${token.tokenId}`}
                  type="button"
                  $active={draft.backgroundImageUrl === url}
                  onClick={() => {
                    patchDraft({ backgroundImageUrl: url });
                    reportThemeBuilderEvent("desktop.wallpaper.token_set", "set-token-art", {
                      contract: token.contract,
                      tokenId: token.tokenId,
                    });
                  }}
                  title={`${token.name || "Token"} ${token.contract}:${token.tokenId}`}
                >
                  <Thumb $src={url} />
                  <SourceLabel>{token.name || `#${token.tokenId}`}</SourceLabel>
                </SourceButton>
              ))}
            </SourceList>
          )}

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>Cursor</GroupTitle>
          <SegmentGrid>
            {DESKTOP_CURSOR_STYLES.map((style) => (
              <Button
                key={style}
                size="sm"
                active={draft.cursorStyle === style ? true : undefined}
                onClick={() => patchDraft({ cursorStyle: style })}
              >
                {DESKTOP_CURSOR_LABELS[style]}
              </Button>
            ))}
          </SegmentGrid>

          <Separator style={{ margin: "10px 0" }} />
          <GroupTitle>Physics</GroupTitle>
          <Inline>
            <label>
              <input
                aria-label="Desktop physics"
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
              Desktop physics
            </label>
            <Field style={{ minWidth: 120 }}>
              <span>Gravity</span>
              <select
                aria-label="Desktop gravity"
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

          <Toolbar>
            <IconButton
              size="sm"
              onClick={() => resetIconsMutation.mutate()}
              disabled={resetIconsMutation.isPending}
            >
              <RotateCcw /> Reset Icons
            </IconButton>
            <IconButton
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save /> Save
            </IconButton>
          </Toolbar>
        </Group>

        <Group variant="outside" style={{ gridColumn: "1 / -1" }}>
          <GroupTitle>Pet</GroupTitle>
          <Inline style={{ marginBottom: 8 }}>
            <label>
              <input
                aria-label="Desktop pet enabled"
                type="checkbox"
                checked={draft.desktopPetEnabled}
                onChange={(e) => patchDraft({ desktopPetEnabled: e.target.checked })}
              />{" "}
              Desktop pet
            </label>
          </Inline>
          {draft.desktopPetEnabled && pet && (
            <PetBox>
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
                  Lv {pet.level} · {pet.xpEarned} XP · {pet.carePoints} care
                </div>
              </div>
              <div>
                <FieldGrid style={{ marginBottom: 8 }}>
                  <Field>
                    <span>Name</span>
                    <input
                      aria-label="Pet name"
                      value={petDraft.name}
                      maxLength={40}
                      onChange={(e) =>
                        setPetDraft((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    <span>Coat</span>
                    <select
                      aria-label="Pet coat"
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
                    disabled={petPatchMutation.isPending}
                    onClick={() => petPatchMutation.mutate(petDraft)}
                  >
                    <Save /> Save Pet
                  </IconButton>
                </Inline>
                <PetStats pet={pet} />
                <Inline style={{ marginTop: 8 }}>
                  {petActions.map(({ action, label, icon }) => (
                    <IconButton
                      key={action}
                      size="sm"
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
                      {new Date(event.createdAt).toLocaleString([], {
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
        </Group>

        <Group variant="outside" style={{ gridColumn: "1 / -1" }}>
          <GroupTitle>Agent pairing</GroupTitle>
          <FieldGrid>
            <Field>
              <span>MCP endpoint</span>
              <input
                aria-label="MCP endpoint"
                readOnly
                value={mcpTokensQuery.data?.endpoint ?? `${window.location.origin}/mcp`}
              />
            </Field>
            <Field>
              <span>Token name</span>
              <input
                aria-label="Token name"
                value={mcpTokenName}
                maxLength={100}
                onChange={(e) => setMcpTokenName(e.target.value)}
              />
            </Field>
          </FieldGrid>
          <Toolbar>
            <IconButton
              size="sm"
              disabled={createMcpTokenMutation.isPending}
              onClick={() => createMcpTokenMutation.mutate()}
            >
              <KeyRound /> Generate Token
            </IconButton>
          </Toolbar>
          {generatedMcpToken && (
            <div style={{ marginTop: 8 }}>
              <Field>
                <span>New token</span>
                <SecretBox aria-label="New token" readOnly value={generatedMcpToken} />
              </Field>
              <Inline style={{ marginTop: 6 }}>
                <IconButton
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(generatedMcpToken)}
                >
                  <Clipboard /> Copy
                </IconButton>
                <HelpText>{createMcpTokenMutation.data?.warning}</HelpText>
              </Inline>
            </div>
          )}
          <Separator style={{ margin: "10px 0" }} />
          {mcpTokensQuery.isLoading ? (
            <HelpText>Loading paired agents...</HelpText>
          ) : activeMcpTokens.length === 0 ? (
            <HelpText>No active paired agents.</HelpText>
          ) : (
            activeMcpTokens.map((token) => (
              <TokenRow key={token.id}>
                <div>
                  <strong>{token.name}</strong>{" "}
                  <span>
                    {token.tokenPrefix}... · created{" "}
                    {new Date(token.createdAt).toLocaleDateString()}
                    {token.lastUsedAt
                      ? ` · last used ${new Date(token.lastUsedAt).toLocaleString()}`
                      : ""}
                  </span>
                </div>
                <IconButton
                  size="sm"
                  disabled={revokeMcpTokenMutation.isPending}
                  onClick={() => revokeMcpTokenMutation.mutate(token.id)}
                >
                  <Unplug /> Revoke
                </IconButton>
              </TokenRow>
            ))
          )}
        </Group>
      </Shell>
    </AppWindow>
  );
}
