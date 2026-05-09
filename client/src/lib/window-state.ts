export interface WindowState {
  minimized: boolean;
  maximized: boolean;
  position: { x: number; y: number };
  size: { w: number; h: number };
  zIndex: number;
}

export interface WindowSessionSnapshot {
  pages: string[];
  states: Record<string, WindowState>;
  titles: Record<string, string>;
  focusedPath: string | null;
  topZ: number;
}

export const WINDOW_SESSION_VERSION = 1;
export const WINDOW_SESSION_STORAGE_KEY = "wtf-os.window-session.v1";

export const DEFAULT_WINDOW_SIZE = { w: 960, h: 620 };
export const FALLBACK_WINDOW_STATE: WindowState = {
  minimized: false,
  maximized: false,
  position: { x: 20, y: 20 },
  size: DEFAULT_WINDOW_SIZE,
  zIndex: 10,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/")) return null;
  if (value.length > 180) return null;
  return value;
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function normalizeWindowState(value: unknown): WindowState {
  const raw = isRecord(value) ? value : {};
  const rawPosition = isRecord(raw.position) ? raw.position : {};
  const rawSize = isRecord(raw.size) ? raw.size : {};
  return {
    minimized: Boolean(raw.minimized),
    maximized: Boolean(raw.maximized),
    position: {
      x: cleanNumber(rawPosition.x, FALLBACK_WINDOW_STATE.position.x, 0, 10000),
      y: cleanNumber(rawPosition.y, FALLBACK_WINDOW_STATE.position.y, 0, 10000),
    },
    size: {
      w: cleanNumber(rawSize.w, DEFAULT_WINDOW_SIZE.w, 320, 10000),
      h: cleanNumber(rawSize.h, DEFAULT_WINDOW_SIZE.h, 200, 10000),
    },
    zIndex: cleanNumber(raw.zIndex, FALLBACK_WINDOW_STATE.zIndex, 1, 100000),
  };
}

export function normalizeWindowSession(value: unknown): WindowSessionSnapshot {
  if (!isRecord(value) || value.version !== WINDOW_SESSION_VERSION) {
    return { pages: [], states: {}, titles: {}, focusedPath: null, topZ: 10 };
  }

  const seen = new Set<string>();
  const pages = (Array.isArray(value.pages) ? value.pages : []).flatMap((path) => {
    const clean = cleanPath(path);
    if (!clean || seen.has(clean)) return [];
    seen.add(clean);
    return [clean];
  });

  const rawStates = isRecord(value.states) ? value.states : {};
  const states: Record<string, WindowState> = {};
  for (const path of pages) {
    states[path] = normalizeWindowState(rawStates[path]);
  }

  const rawTitles = isRecord(value.titles) ? value.titles : {};
  const titles: Record<string, string> = {};
  for (const path of pages) {
    const title = rawTitles[path];
    if (typeof title === "string" && title.trim()) {
      titles[path] = title.slice(0, 120);
    }
  }

  const focusedPath = cleanPath(value.focusedPath);
  const focusable = focusedPath && pages.includes(focusedPath) ? focusedPath : null;
  const highestZ = Object.values(states).reduce(
    (max, state) => Math.max(max, state.zIndex),
    10
  );

  return {
    pages,
    states,
    titles,
    focusedPath: focusable,
    topZ: Math.max(highestZ, cleanNumber(value.topZ, 10, 10, 100000)),
  };
}

export function serializeWindowSession(snapshot: WindowSessionSnapshot): string {
  return JSON.stringify({
    version: WINDOW_SESSION_VERSION,
    pages: snapshot.pages,
    states: snapshot.states,
    titles: snapshot.titles,
    focusedPath: snapshot.focusedPath,
    topZ: snapshot.topZ,
  });
}

export function chooseFocusedPath(
  pages: string[],
  states: Record<string, WindowState>,
  exclude?: string
): string | null {
  let best: string | null = null;
  let bestZ = -1;
  for (const path of pages) {
    if (path === exclude || states[path]?.minimized) continue;
    const z = states[path]?.zIndex ?? 0;
    if (z >= bestZ) {
      best = path;
      bestZ = z;
    }
  }
  return best;
}

export function cycleFocusedPath(
  pages: string[],
  states: Record<string, WindowState>,
  current: string | null,
  direction: 1 | -1
): string | null {
  const visible = pages.filter((path) => !states[path]?.minimized);
  if (visible.length === 0) return null;
  const index = current ? visible.indexOf(current) : -1;
  if (index === -1) return direction === 1 ? visible[0] : visible[visible.length - 1];
  return visible[(index + direction + visible.length) % visible.length];
}

export function minimizedAllStates(
  pages: string[],
  states: Record<string, WindowState>
): { states: Record<string, WindowState>; visibleBefore: string[] } {
  const visibleBefore = pages.filter((path) => !states[path]?.minimized);
  const next = { ...states };
  for (const path of visibleBefore) {
    next[path] = { ...(next[path] ?? FALLBACK_WINDOW_STATE), minimized: true };
  }
  return { states: next, visibleBefore };
}

export function restoredVisibleStates(
  paths: string[],
  states: Record<string, WindowState>
): Record<string, WindowState> {
  const next = { ...states };
  for (const path of paths) {
    next[path] = { ...(next[path] ?? FALLBACK_WINDOW_STATE), minimized: false };
  }
  return next;
}
