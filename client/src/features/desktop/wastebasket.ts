import {
  DESKTOP_SHORTCUT_LIMIT,
  desktopShortcutStorageKey,
  normalizeDesktopShortcuts,
  normalizeShortcutPayload,
  type DesktopShortcut,
  type DesktopShortcutBounds,
} from "./desktop-shortcuts";

export const WASTEBASKET_CHANGED_EVENT = "wtf-os:wastebasket-changed";
export const DESKTOP_SHORTCUTS_CHANGED_EVENT = "wtf-os:desktop-shortcuts-changed";
const WASTEBASKET_STORAGE_PREFIX = "wtf-os.wastebasket.v1";

export type TrashedShortcut = DesktopShortcut & { deletedAt: number };
type ShortcutStore = Pick<Storage, "getItem" | "setItem">;

export function wastebasketStorageKey(userId: number | string) {
  return `${WASTEBASKET_STORAGE_PREFIX}:${userId}`;
}

export function normalizeWastebasket(value: unknown): TrashedShortcut[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: TrashedShortcut[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const payload = normalizeShortcutPayload(item);
    const id = typeof item.id === "string" ? item.id.trim().slice(0, 120) : "";
    if (!payload || !id || seen.has(id)) continue;
    seen.add(id);
    result.push({
      ...payload,
      id,
      x: typeof item.x === "number" && Number.isFinite(item.x) ? item.x : 0,
      y: typeof item.y === "number" && Number.isFinite(item.y) ? item.y : 0,
      createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : 0,
      deletedAt: typeof item.deletedAt === "number" && Number.isFinite(item.deletedAt) ? item.deletedAt : 0,
    });
  }
  return result.sort((a, b) => b.deletedAt - a.deletedAt);
}

function parseStored(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function emitChanged(userId: number | string, shortcutsChanged = false) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WASTEBASKET_CHANGED_EVENT, { detail: { userId } }));
  if (shortcutsChanged) {
    window.dispatchEvent(new CustomEvent(DESKTOP_SHORTCUTS_CHANGED_EVENT, { detail: { userId } }));
  }
}

export function readWastebasket(userId: number | string, store: ShortcutStore = window.localStorage) {
  return normalizeWastebasket(parseStored(store.getItem(wastebasketStorageKey(userId))));
}

export function trashShortcut(
  userId: number | string,
  shortcut: DesktopShortcut,
  store: ShortcutStore = window.localStorage,
  now = Date.now()
) {
  const current = readWastebasket(userId, store);
  const next = normalizeWastebasket([
    { ...shortcut, deletedAt: now },
    ...current.filter((item) => item.id !== shortcut.id),
  ]);
  store.setItem(wastebasketStorageKey(userId), JSON.stringify(next));
  emitChanged(userId);
  return next;
}

export function restoreShortcut(
  userId: number | string,
  shortcutId: string,
  bounds: DesktopShortcutBounds,
  store: ShortcutStore = window.localStorage
): "restored" | "missing" | "desktop-full" {
  const basket = readWastebasket(userId, store);
  const shortcut = basket.find((item) => item.id === shortcutId);
  if (!shortcut) return "missing";

  const activeKey = desktopShortcutStorageKey(userId);
  const active = normalizeDesktopShortcuts(parseStored(store.getItem(activeKey)), bounds);
  const alreadyActive = active.some((item) => item.id === shortcutId);
  if (!alreadyActive && active.length >= DESKTOP_SHORTCUT_LIMIT) return "desktop-full";
  if (!alreadyActive) {
    const { deletedAt: _deletedAt, ...restored } = shortcut;
    store.setItem(activeKey, JSON.stringify(normalizeDesktopShortcuts([...active, restored], bounds)));
  }
  store.setItem(wastebasketStorageKey(userId), JSON.stringify(basket.filter((item) => item.id !== shortcutId)));
  emitChanged(userId, true);
  return "restored";
}

export function permanentlyDeleteShortcut(
  userId: number | string,
  shortcutId: string,
  store: ShortcutStore = window.localStorage
) {
  const basket = readWastebasket(userId, store);
  if (!basket.some((item) => item.id === shortcutId)) return false;
  store.setItem(wastebasketStorageKey(userId), JSON.stringify(basket.filter((item) => item.id !== shortcutId)));
  emitChanged(userId);
  return true;
}

export function emptyWastebasket(userId: number | string, store: ShortcutStore = window.localStorage) {
  store.setItem(wastebasketStorageKey(userId), "[]");
  emitChanged(userId);
}
