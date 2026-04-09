import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

/* ── Types ─────────────────────────────────────────── */

interface WindowState {
  minimized: boolean;
  maximized: boolean;
  position: { x: number; y: number };
  size: { w: number; h: number };
  zIndex: number;
}

export interface WindowManagerContextValue {
  openPages: string[];
  openPage: (path: string) => void;

  getWindow: (path: string) => WindowState;
  focus: (path: string) => void;
  minimize: (path: string) => void;
  restore: (path: string) => void;
  toggleMaximize: (path: string) => void;
  close: (path: string) => void;
  setPosition: (path: string, x: number, y: number) => void;
  setSize: (path: string, w: number, h: number) => void;

  titles: Record<string, string>;
  setTitle: (path: string, title: string) => void;
  focusedPath: string | null;
  isMinimized: (path: string) => boolean;
}

/* ── Cascade positioning for new windows ───────────── */

const CASCADE = 30;
const DEFAULT_SIZE = { w: 800, h: 500 };
let cascadeN = 0;

function cascadePos(): { x: number; y: number } {
  const n = cascadeN % 10;
  cascadeN++;
  return { x: 20 + n * CASCADE, y: 20 + n * CASCADE };
}

const FALLBACK: WindowState = {
  minimized: false,
  maximized: true,
  position: { x: 20, y: 20 },
  size: DEFAULT_SIZE,
  zIndex: 10,
};

/* ── Contexts ──────────────────────────────────────── */

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

/** Provided by the WindowRenderer so each page's AppWindow knows its path key */
export const WindowPathContext = createContext<string>("");

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
  const [pages, setPages] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, WindowState>>({});
  const [titles, setTitlesState] = useState<Record<string, string>>({});
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  const topZ = useRef(10);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const statesRef = useRef(states);
  statesRef.current = states;
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const locRef = useRef(currentLocation);
  locRef.current = currentLocation;

  const nav = useCallback((path: string) => {
    if (locRef.current !== path) navRef.current(path);
  }, []);

  const focusBest = useCallback((exclude?: string) => {
    const pool = pagesRef.current.filter(
      (p) => p !== exclude && !statesRef.current[p]?.minimized
    );
    if (pool.length > 0) {
      let best = pool[0];
      let bestZ = statesRef.current[best]?.zIndex ?? 0;
      for (const p of pool) {
        const z = statesRef.current[p]?.zIndex ?? 0;
        if (z >= bestZ) {
          best = p;
          bestZ = z;
        }
      }
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
        [path]: { ...(prev[path] ?? FALLBACK), minimized: false, zIndex: z },
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
      setPages((prev) => [...prev, path]);
      setStates((prev) => ({
        ...prev,
        [path]: {
          minimized: false,
          maximized: true,
          position: pos,
          size: { ...DEFAULT_SIZE },
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
        [path]: { ...(prev[path] ?? FALLBACK), minimized: true },
      }));
      focusBest(path);
    },
    [focusBest]
  );

  const restore = useCallback(
    (path: string) => focus(path),
    [focus]
  );

  const toggleMaximize = useCallback((path: string) => {
    topZ.current += 1;
    const z = topZ.current;
    setStates((prev) => {
      const cur = prev[path] ?? FALLBACK;
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
      [path]: { ...(prev[path] ?? FALLBACK), position: { x, y } },
    }));
  }, []);

  const setSize = useCallback((path: string, w: number, h: number) => {
    setStates((prev) => ({
      ...prev,
      [path]: { ...(prev[path] ?? FALLBACK), size: { w, h } },
    }));
  }, []);

  const setTitle = useCallback((path: string, title: string) => {
    setTitlesState((prev) => ({ ...prev, [path]: title }));
  }, []);

  const getWindow = useCallback(
    (path: string): WindowState => states[path] ?? FALLBACK,
    [states]
  );

  const isMinimized = useCallback(
    (path: string) => states[path]?.minimized ?? false,
    [states]
  );

  return (
    <WindowManagerContext.Provider
      value={{
        openPages: pages,
        openPage,
        getWindow,
        focus,
        minimize,
        restore,
        toggleMaximize,
        close,
        setPosition,
        setSize,
        titles,
        setTitle,
        focusedPath,
        isMinimized,
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
