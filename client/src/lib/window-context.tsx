import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";

interface WindowState {
  minimized: boolean;
  maximized: boolean;
  position: { x: number; y: number };
  size: { w: number; h: number };
}

interface WindowManagerContextValue {
  getWindow: (id: string) => WindowState;
  minimize: (id: string) => void;
  maximize: (id: string) => void;
  restore: (id: string) => void;
  close: (id: string) => void;
  setPosition: (id: string, x: number, y: number) => void;
  setSize: (id: string, w: number, h: number) => void;
  toggleMaximize: (id: string) => void;
  activeWindowId: string | null;
  activeWindowTitle: string | null;
  isMinimized: (id: string) => boolean;
  registerWindow: (id: string, title: string) => void;
  unregisterWindow: (id: string) => void;
  windowTitles: Record<string, string>;
}

const DEFAULT_STATE: WindowState = {
  minimized: false,
  maximized: true,
  position: { x: 20, y: 20 },
  size: { w: 800, h: 500 },
};

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [windows, setWindows] = useState<Record<string, WindowState>>({});
  const [windowTitles, setWindowTitles] = useState<Record<string, string>>({});
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [activeWindowTitle, setActiveWindowTitle] = useState<string | null>(null);

  const getWindow = useCallback(
    (id: string): WindowState => windows[id] ?? { ...DEFAULT_STATE },
    [windows]
  );

  const updateWindow = useCallback(
    (id: string, patch: Partial<WindowState>) => {
      setWindows((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? { ...DEFAULT_STATE }), ...patch },
      }));
    },
    []
  );

  const minimize = useCallback(
    (id: string) => updateWindow(id, { minimized: true }),
    [updateWindow]
  );

  const maximize = useCallback(
    (id: string) => updateWindow(id, { maximized: true, minimized: false }),
    [updateWindow]
  );

  const restore = useCallback(
    (id: string) => updateWindow(id, { minimized: false, maximized: false }),
    [updateWindow]
  );

  const toggleMaximize = useCallback(
    (id: string) => {
      const current = windows[id] ?? { ...DEFAULT_STATE };
      updateWindow(id, { maximized: !current.maximized, minimized: false });
    },
    [windows, updateWindow]
  );

  const close = useCallback(
    (id: string) => {
      setWindows((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setWindowTitles((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setActiveWindowId(null);
      setActiveWindowTitle(null);
      setLocation("/dashboard");
    },
    [setLocation]
  );

  const setPosition = useCallback(
    (id: string, x: number, y: number) => updateWindow(id, { position: { x, y } }),
    [updateWindow]
  );

  const setSize = useCallback(
    (id: string, w: number, h: number) => updateWindow(id, { size: { w, h } }),
    [updateWindow]
  );

  const isMinimized = useCallback(
    (id: string) => windows[id]?.minimized ?? false,
    [windows]
  );

  const registerWindow = useCallback(
    (id: string, title: string) => {
      setActiveWindowId(id);
      setActiveWindowTitle(title);
      setWindowTitles((prev) => ({ ...prev, [id]: title }));
      setWindows((prev) => {
        if (prev[id]) return prev;
        return { ...prev, [id]: { ...DEFAULT_STATE } };
      });
    },
    []
  );

  const unregisterWindow = useCallback((id: string) => {
    setWindows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setWindowTitles((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveWindowId((prev) => (prev === id ? null : prev));
    setActiveWindowTitle((prev) => {
      if (prev && id) return null;
      return prev;
    });
  }, []);

  return (
    <WindowManagerContext.Provider
      value={{
        getWindow,
        minimize,
        maximize,
        restore,
        close,
        setPosition,
        setSize,
        toggleMaximize,
        activeWindowId,
        activeWindowTitle,
        isMinimized,
        registerWindow,
        unregisterWindow,
        windowTitles,
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
