import {
  WTFOS_CLI_THEME_KEY,
  WTFOS_INTERFACE_MODE_KEY,
  type WtfOsInterfaceMode,
} from "@shared/wtfos-cli";
import { normalizeCliThemeId, type WtfOsCliThemeId } from "@shared/wtfos-cli";

export type { WtfOsInterfaceMode };

function hasWindow() {
  return typeof window !== "undefined";
}

export function getInterfaceMode(): WtfOsInterfaceMode {
  if (!hasWindow()) return "desktop";
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("cli") === "1") {
      window.localStorage.setItem(WTFOS_INTERFACE_MODE_KEY, "cli");
      return "cli";
    }
    const stored = window.localStorage.getItem(WTFOS_INTERFACE_MODE_KEY);
    return stored === "cli" ? "cli" : "desktop";
  } catch {
    return "desktop";
  }
}

export function setInterfaceMode(mode: WtfOsInterfaceMode) {
  if (!hasWindow()) return;
  try {
    if (mode === "desktop") {
      window.localStorage.removeItem(WTFOS_INTERFACE_MODE_KEY);
    } else {
      window.localStorage.setItem(WTFOS_INTERFACE_MODE_KEY, mode);
    }
  } catch {
    // ignore
  }
}

export function getStoredCliTheme(): WtfOsCliThemeId {
  if (!hasWindow()) return "phosphor";
  try {
    return normalizeCliThemeId(window.localStorage.getItem(WTFOS_CLI_THEME_KEY));
  } catch {
    return "phosphor";
  }
}

export function setStoredCliTheme(themeId: WtfOsCliThemeId) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(WTFOS_CLI_THEME_KEY, themeId);
  } catch {
    // ignore
  }
}
