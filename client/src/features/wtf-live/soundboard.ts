export const WTF_LIVE_SOUNDBOARD_MAX_CLIPS = 8;
export const WTF_LIVE_SOUNDBOARD_MAX_BYTES = 1_200_000;
export const WTF_LIVE_SOUNDBOARD_STORAGE_VERSION = 1;
export const WTF_LIVE_SOUNDBOARD_STORAGE_PREFIX = `wtf-live:soundboard:v${WTF_LIVE_SOUNDBOARD_STORAGE_VERSION}`;
export const WTF_LIVE_SOUNDBOARD_DEFAULT_VOLUME = 90;
export const WTF_LIVE_SOUNDBOARD_DEFAULT_COOLDOWN_MS = 1500;
export const WTF_LIVE_SOUNDBOARD_MAX_COOLDOWN_MS = 30_000;

export const WTF_LIVE_SOUNDBOARD_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/webm",
] as const;

export const WTF_LIVE_SOUNDBOARD_ACCEPT = WTF_LIVE_SOUNDBOARD_MIME_TYPES.join(",");

export type WtfLiveSoundboardMimeType = (typeof WTF_LIVE_SOUNDBOARD_MIME_TYPES)[number];

export type WtfLiveSoundboardClip = {
  id: string;
  label: string;
  category: string;
  shortcut: string;
  mimeType: WtfLiveSoundboardMimeType;
  dataUrl: string;
  sizeBytes: number;
  volume: number;
  cooldownMs: number;
  createdAt: string;
};

export type WtfLiveSoundboardSettings = {
  clips: WtfLiveSoundboardClip[];
  armed: boolean;
  updatedAt: string | null;
};

type ShortcutEventLike = {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

const MIME_TYPE_SET = new Set<string>(WTF_LIVE_SOUNDBOARD_MIME_TYPES);
const MAX_DATA_URL_LENGTH = Math.ceil(WTF_LIVE_SOUNDBOARD_MAX_BYTES * 1.4);

export const EMPTY_WTF_LIVE_SOUNDBOARD_SETTINGS: WtfLiveSoundboardSettings = {
  clips: [],
  armed: true,
  updatedAt: null,
};

export function wtfLiveSoundboardStorageKey(userId: number | string | null | undefined): string {
  const safeUserId = String(userId ?? "anonymous").replace(/[^a-z0-9_-]/gi, "") || "anonymous";
  return `${WTF_LIVE_SOUNDBOARD_STORAGE_PREFIX}:${safeUserId}`;
}

export function isWtfLiveSoundboardMimeType(value: unknown): value is WtfLiveSoundboardMimeType {
  return MIME_TYPE_SET.has(String(value || ""));
}

export function normalizeWtfLiveSoundboardShortcut(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const tokens = raw
    .replace(/\s*\+\s*/g, "+")
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return "";

  const modifiers = new Set<string>();
  let key = "";
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === "ctrl" || lower === "control") {
      modifiers.add("Ctrl");
      continue;
    }
    if (lower === "cmd" || lower === "command" || lower === "meta") {
      modifiers.add("Meta");
      continue;
    }
    if (lower === "alt" || lower === "option") {
      modifiers.add("Alt");
      continue;
    }
    if (lower === "shift") {
      modifiers.add("Shift");
      continue;
    }
    key = normalizeShortcutKey(token);
  }

  if (!key || (!modifiers.has("Ctrl") && !modifiers.has("Alt") && !modifiers.has("Meta"))) return "";
  const ordered = ["Ctrl", "Alt", "Shift", "Meta"].filter((modifier) => modifiers.has(modifier));
  return [...ordered, key].join("+");
}

export function shortcutFromWtfLiveKeyboardEvent(event: ShortcutEventLike): string {
  const key = normalizeShortcutKey(event.key || "");
  if (!key) return "";
  const parts = [
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    event.metaKey ? "Meta" : "",
    key,
  ].filter(Boolean);
  return normalizeWtfLiveSoundboardShortcut(parts.join("+"));
}

export function isWtfLiveShortcutEventTargetEditable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function normalizeWtfLiveSoundboardClip(value: unknown): WtfLiveSoundboardClip | null {
  const clip = typeof value === "object" && value ? value as Record<string, unknown> : null;
  if (!clip) return null;
  const mimeType = String(clip.mimeType || "");
  const dataUrl = String(clip.dataUrl || "");
  if (!isWtfLiveSoundboardMimeType(mimeType)) return null;
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) return null;
  if (dataUrl.length > MAX_DATA_URL_LENGTH) return null;
  const sizeBytes = Number(clip.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > WTF_LIVE_SOUNDBOARD_MAX_BYTES) return null;
  return {
    id: sanitizeSoundboardId(clip.id),
    label: sanitizeSoundboardLabel(clip.label),
    category: sanitizeSoundboardCategory(clip.category),
    shortcut: normalizeWtfLiveSoundboardShortcut(clip.shortcut),
    mimeType,
    dataUrl,
    sizeBytes: Math.round(sizeBytes),
    volume: normalizeVolume(clip.volume),
    cooldownMs: normalizeCooldownMs(clip.cooldownMs),
    createdAt: sanitizeCreatedAt(clip.createdAt),
  };
}

export function normalizeWtfLiveSoundboardSettings(value: unknown): WtfLiveSoundboardSettings {
  const settings = typeof value === "object" && value ? value as Record<string, unknown> : {};
  const clips = Array.isArray(settings.clips)
    ? settings.clips.flatMap((clip) => {
        const normalized = normalizeWtfLiveSoundboardClip(clip);
        return normalized ? [normalized] : [];
      })
    : [];
  const uniqueClips = new Map<string, WtfLiveSoundboardClip>();
  clips.forEach((clip) => uniqueClips.set(clip.id, clip));
  return {
    clips: Array.from(uniqueClips.values()).slice(0, WTF_LIVE_SOUNDBOARD_MAX_CLIPS),
    armed: settings.armed !== false,
    updatedAt: typeof settings.updatedAt === "string" ? settings.updatedAt : null,
  };
}

export function readWtfLiveSoundboardSettings(userId: number | string | null | undefined): WtfLiveSoundboardSettings {
  if (typeof window === "undefined") return EMPTY_WTF_LIVE_SOUNDBOARD_SETTINGS;
  try {
    const raw = window.localStorage.getItem(wtfLiveSoundboardStorageKey(userId));
    return raw ? normalizeWtfLiveSoundboardSettings(JSON.parse(raw)) : EMPTY_WTF_LIVE_SOUNDBOARD_SETTINGS;
  } catch {
    return EMPTY_WTF_LIVE_SOUNDBOARD_SETTINGS;
  }
}

export function writeWtfLiveSoundboardSettings(
  userId: number | string | null | undefined,
  settings: WtfLiveSoundboardSettings,
): WtfLiveSoundboardSettings {
  const normalized = normalizeWtfLiveSoundboardSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(wtfLiveSoundboardStorageKey(userId), JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("wtf-live:soundboard-updated", { detail: { userId } }));
  }
  return normalized;
}

export function findWtfLiveSoundboardShortcutConflict(
  clips: WtfLiveSoundboardClip[],
  shortcut: string,
  exceptClipId?: string,
): WtfLiveSoundboardClip | null {
  const normalized = normalizeWtfLiveSoundboardShortcut(shortcut);
  if (!normalized) return null;
  return clips.find((clip) => clip.id !== exceptClipId && clip.shortcut === normalized) ?? null;
}

export async function readWtfLiveSoundboardFile(
  file: File,
  input: { label?: string; category?: string; shortcut?: string; volume?: number; cooldownMs?: number } = {},
): Promise<WtfLiveSoundboardClip> {
  const mimeType = normalizeFileMimeType(file);
  if (!isWtfLiveSoundboardMimeType(mimeType)) {
    throw new Error("Use an MP3, WAV, OGG, M4A, MP4, or WebM audio file.");
  }
  if (file.size > WTF_LIVE_SOUNDBOARD_MAX_BYTES) {
    throw new Error("Soundboard clips must be 1.2 MB or smaller.");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const normalized = normalizeWtfLiveSoundboardClip({
    id: `clip_${safeRandomId()}`,
    label: input.label || labelFromFileName(file.name),
    category: input.category,
    shortcut: input.shortcut,
    mimeType,
    dataUrl,
    sizeBytes: file.size,
    volume: input.volume,
    cooldownMs: input.cooldownMs,
    createdAt: new Date().toISOString(),
  });
  if (!normalized) throw new Error("Could not read that soundboard clip.");
  return normalized;
}

export function volumeToAudioGain(volume: number | undefined): number {
  const normalized = normalizeVolume(volume);
  return Math.max(0, Math.min(1, normalized / 100));
}

export function playWtfLiveSoundboardClip(clip: WtfLiveSoundboardClip, volume = volumeToAudioGain(clip.volume)): HTMLAudioElement {
  const audio = new Audio(clip.dataUrl);
  audio.volume = Math.max(0, Math.min(1, volume));
  void audio.play().catch(() => undefined);
  return audio;
}

function normalizeShortcutKey(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (["control", "ctrl", "shift", "alt", "option", "meta", "cmd", "command"].includes(lower)) return "";
  if (lower === " ") return "Space";
  if (lower === "spacebar") return "Space";
  if (lower === "esc") return "Escape";
  if (/^f([1-9]|1[0-2])$/i.test(raw)) return raw.toUpperCase();
  if (raw.length === 1) return raw.toUpperCase();
  const compact = raw.replace(/\s+/g, "");
  return compact.length <= 16 ? compact.slice(0, 1).toUpperCase() + compact.slice(1) : "";
}

function sanitizeSoundboardId(value: unknown): string {
  const id = String(value || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
  return id || `clip_${safeRandomId()}`;
}

function sanitizeSoundboardLabel(value: unknown): string {
  return String(value || "Sound")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 36) || "Sound";
}

function sanitizeSoundboardCategory(value: unknown): string {
  return String(value || "General")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32) || "General";
}

function normalizeVolume(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return WTF_LIVE_SOUNDBOARD_DEFAULT_VOLUME;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normalizeCooldownMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return WTF_LIVE_SOUNDBOARD_DEFAULT_COOLDOWN_MS;
  return Math.min(WTF_LIVE_SOUNDBOARD_MAX_COOLDOWN_MS, Math.max(0, Math.round(parsed)));
}

function sanitizeCreatedAt(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function normalizeFileMimeType(file: File): string {
  const explicit = file.type || "";
  if (isWtfLiveSoundboardMimeType(explicit)) return explicit;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "ogg" || extension === "oga") return "audio/ogg";
  if (extension === "m4a" || extension === "mp4" || extension === "aac") return "audio/mp4";
  if (extension === "webm") return "audio/webm";
  return explicit;
}

function labelFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  return sanitizeSoundboardLabel(base);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that soundboard clip."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function safeRandomId(): string {
  return (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 18);
}
