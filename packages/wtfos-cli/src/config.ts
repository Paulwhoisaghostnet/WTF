import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  WTFOS_CLI_DEFAULT_BASE_URL,
  normalizeCliThemeId,
  type WtfOsCliThemeId,
} from "../../../shared/wtfos-cli/index.ts";

const CONFIG_DIR = join(homedir(), ".config", "wtfos");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const SESSION_FILE = join(CONFIG_DIR, "session.json");

export interface WtfOsCliConfig {
  baseUrl: string;
  theme: WtfOsCliThemeId;
}

export interface WtfOsCliSession {
  cookie: string;
  username: string;
  displayName?: string | null;
}

function ensureConfigDir() {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function loadConfig(): WtfOsCliConfig {
  const stored = readJsonFile<Partial<WtfOsCliConfig>>(CONFIG_FILE);
  const envUrl = String(process.env.WTFOS_URL || process.env.WTFOS_BASE_URL || "").trim();
  return {
    baseUrl: (envUrl || stored?.baseUrl || WTFOS_CLI_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    theme: normalizeCliThemeId(stored?.theme),
  };
}

export function saveConfig(patch: Partial<WtfOsCliConfig>): WtfOsCliConfig {
  ensureConfigDir();
  const next = { ...loadConfig(), ...patch };
  writeFileSync(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

export function loadSession(): WtfOsCliSession | null {
  const stored = readJsonFile<WtfOsCliSession>(SESSION_FILE);
  if (!stored?.cookie || !stored.username) return null;
  return stored;
}

export function saveSession(session: WtfOsCliSession) {
  ensureConfigDir();
  writeFileSync(SESSION_FILE, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
}

export function clearSession() {
  try {
    writeFileSync(SESSION_FILE, "{}\n", { mode: 0o600 });
  } catch {
    // ignore
  }
}

export function configDir() {
  return CONFIG_DIR;
}
