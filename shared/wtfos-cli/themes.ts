import type { WtfOsCliTheme, WtfOsCliThemeId } from "./types";

export const WTFOS_CLI_THEMES: Record<WtfOsCliThemeId, WtfOsCliTheme> = {
  phosphor: {
    id: "phosphor",
    label: "Phosphor",
    background: "#050505",
    foreground: "#d8ffd0",
    input: "#b8ddff",
    error: "#ffb8b8",
    system: "#ffe6a8",
    prompt: "#ffffff",
    ansi: {
      foreground: "\x1b[38;2;216;255;208m",
      input: "\x1b[38;2;184;221;255m",
      error: "\x1b[38;2;255;184;184m",
      system: "\x1b[38;2;255;230;168m",
      prompt: "\x1b[97m",
    },
  },
  amber: {
    id: "amber",
    label: "Amber CRT",
    background: "#120a00",
    foreground: "#ffb000",
    input: "#ffd27a",
    error: "#ff6b6b",
    system: "#fff0b3",
    prompt: "#ffe066",
    ansi: {
      foreground: "\x1b[38;2;255;176;0m",
      input: "\x1b[38;2;255;210;122m",
      error: "\x1b[91m",
      system: "\x1b[93m",
      prompt: "\x1b[33m",
    },
  },
  ice: {
    id: "ice",
    label: "Ice Terminal",
    background: "#020812",
    foreground: "#b8ecff",
    input: "#e0f7ff",
    error: "#ff9fb8",
    system: "#d4f1ff",
    prompt: "#ffffff",
    ansi: {
      foreground: "\x1b[38;2;184;236;255m",
      input: "\x1b[96m",
      error: "\x1b[95m",
      system: "\x1b[94m",
      prompt: "\x1b[97m",
    },
  },
  bloodmoon: {
    id: "bloodmoon",
    label: "Blood Moon",
    background: "#120006",
    foreground: "#ff8aa5",
    input: "#ffc2d1",
    error: "#ff4d6d",
    system: "#ffd6e0",
    prompt: "#ffeef2",
    ansi: {
      foreground: "\x1b[38;2;255;138;165m",
      input: "\x1b[95m",
      error: "\x1b[91m",
      system: "\x1b[95m",
      prompt: "\x1b[97m",
    },
  },
  tezos: {
    id: "tezos",
    label: "Tezos Signal",
    background: "#00141a",
    foreground: "#5eead4",
    input: "#99f6e4",
    error: "#fda4af",
    system: "#a5f3fc",
    prompt: "#ecfeff",
    ansi: {
      foreground: "\x1b[36m",
      input: "\x1b[96m",
      error: "\x1b[91m",
      system: "\x1b[94m",
      prompt: "\x1b[97m",
    },
  },
};

export const WTFOS_CLI_THEME_ORDER: readonly WtfOsCliThemeId[] = [
  "phosphor",
  "amber",
  "ice",
  "bloodmoon",
  "tezos",
];

export function normalizeCliThemeId(value: string | null | undefined): WtfOsCliThemeId {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized in WTFOS_CLI_THEMES) {
    return normalized as WtfOsCliThemeId;
  }
  return "phosphor";
}

export function nextCliThemeId(current: WtfOsCliThemeId): WtfOsCliThemeId {
  const index = WTFOS_CLI_THEME_ORDER.indexOf(current);
  const next = index >= 0 ? (index + 1) % WTFOS_CLI_THEME_ORDER.length : 0;
  return WTFOS_CLI_THEME_ORDER[next] ?? "phosphor";
}
