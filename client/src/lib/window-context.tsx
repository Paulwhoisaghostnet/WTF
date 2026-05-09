import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import {
  chooseFocusedPath,
  cycleFocusedPath,
  DEFAULT_WINDOW_SIZE,
  FALLBACK_WINDOW_STATE,
  minimizedAllStates,
  normalizeWindowSession,
  restoredVisibleStates,
  serializeWindowSession,
  WINDOW_SESSION_STORAGE_KEY,
  type WindowState,
} from "./window-state";

/* ── Types ─────────────────────────────────────────── */

export interface WindowManagerContextValue {
  openPages: string[];
  openPage: (path: string) => void;

  getWindow: (path: string) => WindowState;
  focus: (path: string) => void;
  minimize: (path: string) => void;
  minimizeAll: () => void;
  restore: (path: string) => void;
  toggleShowDesktop: () => void;
  cycleFocus: (direction?: 1 | -1) => void;
  toggleMaximize: (path: string) => void;
  close: (path: string) => void;
  setPosition: (path: string, x: number, y: number) => void;
  setSize: (path: string, w: number, h: number) => void;

  titles: Record<string, string>;
  setTitle: (path: string, title: string) => void;
  focusedPath: string | null;
  isMinimized: (path: string) => boolean;
  allWindowsMinimized: boolean;
}

/* ── Cascade positioning for new windows ───────────── */

const CASCADE = 30;
let cascadeN = 0;

function cascadePos(): { x: number; y: number } {
  const n = cascadeN % 10;
  cascadeN++;
  return { x: 20 + n * CASCADE, y: 20 + n * CASCADE };
}

/* ── Contexts ──────────────────────────────────────── */

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

/** Provided by the WindowRenderer so each page's AppWindow knows its path key */
export const WindowPathContext = createContext<string>("");

function readStoredSession() {
  if (typeof window === "undefined") {
    return normalizeWindowSession(null);
  }
  try {
    const raw = window.localStorage.getItem(WINDOW_SESSION_STORAGE_KEY);
    return normalizeWindowSession(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeWindowSession(null);
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/* ── Provider ──────────────────────────────────────── */

export function WindowManagerProvider({
  children,
  navigate,
  currentLocation,
}: {
  children: ReactNode;
  navigate: (path: string) => void;
  currentLocation: string;
}) {
  const initialSessionRef = useRef<ReturnType<typeof readStoredSession> | null>(null);
  if (!initialSessionRef.current) initialSessionRef.current = readStoredSession();
  const initialSession = initialSessionRef.current;

  const [pages, setPages] = useState<string[]>(() => initialSession.pages);
  const [states, setStates] = useState<Record<string, WindowState>>(
    () => initialSession.states
  );
  const [titles, setTitlesState] = useState<Record<string, string>>(
    () => initialSession.titles
  );
  const [focusedPath, setFocusedPath] = useState<string | null>(
    () => initialSession.focusedPath
  );

  const topZ = useRef(initialSession.topZ);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const statesRef = useRef(states);
  statesRef.current = states;
  const focusedPathRef = useRef(focusedPath);
  focusedPathRef.current = focusedPath;
  const showDesktopRestoreRef = useRef<string[]>([]);
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const locRef = useRef(currentLocation);
  locRef.current = currentLocation;

  const nav = useCallback((path: string) => {
    if (locRef.current !== path) navRef.current(path);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        WINDOW_SESSION_STORAGE_KEY,
        serializeWindowSession({
          pages,
          states,
          titles,
          focusedPath,
          topZ: topZ.current,
        })
      );
    } catch {
      // Window session persistence should not block the OS shell.
    }
  }, [focusedPath, pages, states, titles]);

  const focusBest = useCallback((exclude?: string) => {
    const best = chooseFocusedPath(pagesRef.current, statesRef.current, exclude);
    if (best) {
      setFocusedPath(best);
      nav(best);
    } else {
      setFocusedPath(null);
      nav("/");
    }
  }, [nav]);

  const focus = useCallback(
    (path: string) => {
      topZ.current += 1;
      const z = topZ.current;
      setStates((prev) => ({
        ...prev,
        [path]: {
          ...(prev[path] ?? FALLBACK_WINDOW_STATE),
          minimized: false,
          zIndex: z,
        },
      }));
      setFocusedPath(path);
      nav(path);
    },
    [nav]
  );

  const openPage = useCallback(
    (path: string) => {
      if (pagesRef.current.includes(path)) {
        focus(path);
        return;
      }
      topZ.current += 1;
      const z = topZ.current;
      const pos = cascadePos();
      setPages((prev) => (prev.includes(path) ? prev : [...prev, path]));
      setStates((prev) => ({
        ...prev,
        [path]: {
          minimized: false,
          maximized: false,
          position: pos,
          size: { ...DEFAULT_WINDOW_SIZE },
          zIndex: z,
        },
      }));
      setFocusedPath(path);
      nav(path);
    },
    [focus, nav]
  );

  const close = useCallback(
    (path: string) => {
      setPages((prev) => prev.filter((p) => p !== path));
      setStates((prev) => {
        const n = { ...prev };
        delete n[path];
        return n;
      });
      setTitlesState((prev) => {
        const n = { ...prev };
        delete n[path];
        return n;
      });
      focusBest(path);
    },
    [focusBest]
  );

  const minimize = useCallback(
    (path: string) => {
      setStates((prev) => ({
        ...prev,
        [path]: { ...(prev[path] ?? FALLBACK_WINDOW_STATE), minimized: true },
      }));
      focusBest(path);
    },
    [focusBest]
  );

  const minimizeAll = useCallback(() => {
    const { states: next, visibleBefore } = minimizedAllStates(pagesRef.current, statesRef.current);
    showDesktopRestoreRef.current = visibleBefore;
    setStates(next);
    setFocusedPath(null);
    nav("/");
  }, [nav]);

  const restore = useCallback(
    (path: string) => focus(path),
    [focus]
  );

  const toggleShowDesktop = useCallback(() => {
    const visible = pagesRef.current.filter((path) => !statesRef.current[path]?.minimized);
    if (visible.length > 0) {
      const { states: next, visibleBefore } = minimizedAllStates(
        pagesRef.current,
        statesRef.current
      );
      showDesktopRestoreRef.current = visibleBefore;
      setStates(next);
      setFocusedPath(null);
      nav("/");
      return;
    }

    const restorePaths =
      showDesktopRestoreRef.current.length > 0
        ? showDesktopRestoreRef.current.filter((path) => pagesRef.current.includes(path))
        : pagesRef.current;
    const next = restoredVisibleStates(restorePaths, statesRef.current);
    setStates(next);
    const best = chooseFocusedPath(pagesRef.current, next);
    setFocusedPath(best);
    if (best) nav(best);
  }, [nav]);

  const cycleFocus = useCallback(
    (direction: 1 | -1 = 1) => {
      const next = cycleFocusedPath(
        pagesRef.current,
        statesRef.current,
        focusedPathRef.current,
        direction
      );
      if (next) focus(next);
    },
    [focus]
  );

  const toggleMaximize = useCallback((path: string) => {
    topZ.current += 1;
    const z = topZ.current;
    setStates((prev) => {
      const cur = prev[path] ?? FALLBACK_WINDOW_STATE;
      return {
        ...prev,
        [path]: { ...cur, maximized: !cur.maximized, minimized: false, zIndex: z },
      };
    });
    setFocusedPath(path);
  }, []);

  const setPosition = useCallback((path: string, x: number, y: number) => {
    setStates((prev) => ({
      ...prev,
      [path]: { ...(prev[path] ?? FALLBACK_WINDOW_STATE), position: { x, y } },
    }));
  }, []);

  const setSize = useCallback((path: string, w: number, h: number) => {
    setStates((prev) => ({
      ...prev,
      [path]: { ...(prev[path] ?? FALLBACK_WINDOW_STATE), size: { w, h } },
    }));
  }, []);

  const setTitle = useCallback((path: string, title: string) => {
    setTitlesState((prev) => ({ ...prev, [path]: title }));
  }, []);

  const getWindow = useCallback(
    (path: string): WindowState => states[path] ?? FALLBACK_WINDOW_STATE,
    [states]
  );

  const isMinimized = useCallback(
    (path: string) => states[path]?.minimized ?? false,
    [states]
  );

  const allWindowsMinimized =
    pages.length > 0 && pages.every((path) => states[path]?.minimized);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!(event.ctrlKey && event.altKey)) return;
      const key = event.key.toLowerCase();
      if (key === "d") {
        event.preventDefault();
        toggleShowDesktop();
      } else if (key === "arrowright") {
        event.preventDefault();
        cycleFocus(1);
      } else if (key === "arrowleft") {
        event.preventDefault();
        cycleFocus(-1);
      } else if (key === "m") {
        event.preventDefault();
        minimizeAll();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cycleFocus, minimizeAll, toggleShowDesktop]);

  return (
    <WindowManagerContext.Provider
      value={{
        openPages: pages,
        openPage,
        getWindow,
        focus,
        minimize,
        minimizeAll,
        restore,
        toggleShowDesktop,
        cycleFocus,
        toggleMaximize,
        close,
        setPosition,
        setSize,
        titles,
        setTitle,
        focusedPath,
        isMinimized,
        allWindowsMinimized,
      }}
    >
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error("useWindowManager must be inside WindowManagerProvider");
  return ctx;
}
