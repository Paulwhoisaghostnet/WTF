export const START_MENU_SHORTCUT_MIME = "application/x-wtf-start-menu-item";
export const DESKTOP_SHORTCUT_EVENT = "wtf-os:create-desktop-shortcut";
export const DESKTOP_SHORTCUT_STORAGE_PREFIX = "wtf-os.desktop-shortcuts.v1";
const SHORTCUT_ICON_W = 68;
const SHORTCUT_ICON_H = 66;

export interface StartMenuShortcutPayload {
  label: string;
  path: string;
  icon: string;
}

export interface DesktopShortcut extends StartMenuShortcutPayload {
  id: string;
  x: number;
  y: number;
  createdAt: number;
}

export type DesktopShortcutBounds = {
  width: number;
  height: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function isSafeShortcutPath(path: string) {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\0") &&
    !/^\/\s*(?:javascript|data):/i.test(path)
  );
}

export function normalizeShortcutPayload(value: unknown): StartMenuShortcutPayload | null {
  if (!isRecord(value)) return null;
  const label = safeText(value.label, 80);
  const path = safeText(value.path, 240);
  const icon = safeText(value.icon, 12) || "□";
  if (!label || !isSafeShortcutPath(path)) return null;
  return { label, path, icon };
}

export function serializeShortcutPayload(payload: StartMenuShortcutPayload) {
  return JSON.stringify(payload);
}

export function parseShortcutPayload(raw: string) {
  try {
    return normalizeShortcutPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function shortcutIconKey(shortcut: Pick<DesktopShortcut, "id">) {
  return `shortcut:${shortcut.id}`;
}

export function shortcutIdFromIconKey(key: string) {
  return key.startsWith("shortcut:") ? key.slice("shortcut:".length) : null;
}

export function desktopShortcutStorageKey(userId: string | number | null | undefined) {
  return `${DESKTOP_SHORTCUT_STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

export function defaultShortcutPosition(index: number, bounds: DesktopShortcutBounds) {
  const column = Math.floor(index / 7);
  const row = index % 7;
  return clampShortcutPosition({ x: 332 + column * 80, y: 100 + row * 88 }, bounds);
}

function clampShortcutPosition(
  position: { x: number; y: number },
  bounds: DesktopShortcutBounds
) {
  return {
    x: Math.max(0, Math.min(Math.max(0, bounds.width - SHORTCUT_ICON_W), position.x)),
    y: Math.max(0, Math.min(Math.max(0, bounds.height - SHORTCUT_ICON_H), position.y)),
  };
}

export function createDesktopShortcut(
  payload: StartMenuShortcutPayload,
  position: { x: number; y: number },
  bounds: DesktopShortcutBounds,
  now = Date.now()
): DesktopShortcut {
  const safe = normalizeShortcutPayload(payload);
  if (!safe) {
    throw new Error("Invalid desktop shortcut payload");
  }
  const slug = safe.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "shortcut";
  return {
    ...safe,
    id: `${slug}-${now.toString(36)}-${Math.round(Math.random() * 9999).toString(36)}`,
    ...clampShortcutPosition(position, bounds),
    createdAt: now,
  };
}

export function normalizeDesktopShortcuts(
  value: unknown,
  bounds: DesktopShortcutBounds
): DesktopShortcut[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const shortcuts: DesktopShortcut[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const payload = normalizeShortcutPayload(entry);
    const id = safeText(entry.id, 120);
    if (!payload || !id || seen.has(id)) continue;
    seen.add(id);
    const createdAt = typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt)
      ? Math.max(0, entry.createdAt)
      : 0;
    const rawX = typeof entry.x === "number" && Number.isFinite(entry.x) ? entry.x : 0;
    const rawY = typeof entry.y === "number" && Number.isFinite(entry.y) ? entry.y : 0;
    shortcuts.push({
      ...payload,
      id,
      ...clampShortcutPosition({ x: rawX, y: rawY }, bounds),
      createdAt,
    });
  }
  return shortcuts.slice(0, 48);
}
