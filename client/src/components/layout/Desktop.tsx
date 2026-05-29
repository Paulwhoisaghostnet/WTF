import {
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Taskbar } from "./Taskbar";
import { Win95ContextMenu, type Win95ContextMenuEntry } from "./Win95ContextMenu";
import { useWindowManager } from "../../lib/window-context";
import { MOBILE } from "../../global-styles";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { CustomCursor } from "../../features/desktop/CustomCursor";
import { CursedDesktopEffects } from "../../features/desktop/CursedDesktopEffects";
import { DesktopPet, type DesktopObstacle } from "../../features/desktop/DesktopPet";
import { DesktopWeatherCloud } from "../../features/desktop/environment";
import {
  buildDesktopIconDefs,
  clampIconPosition,
  DraggableIcon,
  ICON_H,
  ICON_W,
  type DesktopIconDef,
} from "../../features/desktop/DesktopIcons";
import { SundayGrass } from "../../features/desktop/SundayGrass";
import { useDesktopIconPhysics } from "../../features/desktop/useDesktopPhysics";
import {
  DesktopItemActors,
  getDesktopItemRect,
  useDesktopArtifacts,
  type DesktopItemState,
} from "../../features/desktop/items";
import {
  nextPortalToolColor,
  type DesktopCursorTool,
} from "../../features/desktop/tools";
import type { PortalColor } from "../../features/desktop/materials";
import {
  createDesktopShortcut,
  defaultShortcutPosition,
  desktopShortcutStorageKey,
  DESKTOP_SHORTCUT_EVENT,
  normalizeDesktopShortcuts,
  parseShortcutPayload,
  shortcutIconKey,
  shortcutIdFromIconKey,
  START_MENU_SHORTCUT_MIME,
  type DesktopShortcut,
  type StartMenuShortcutPayload,
} from "../../features/desktop/desktop-shortcuts";
import {
  canOpenAppsForRole,
  DESKTOP_APPS,
  normalizeUserRoles,
  type DesktopAppKey,
} from "@shared/types";
import { hasWtfCurse, normalizeWtfCurseStatuses } from "@shared/curses";
import {
  DEFAULT_DESKTOP_APPEARANCE,
  type DesktopAppearance,
  type DesktopIconLayout,
} from "@shared/desktop";
import type { DesktopAppsResponse } from "@shared/desktop-apps";

type DesktopSettingsResponse = {
  appearance: DesktopAppearance;
  iconLayout: DesktopIconLayout;
};

type DesktopClientEventPayload = {
  eventType: string;
  objectId: string;
  objectKind: string;
  action: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const DISABLED_DESKTOP_APPS = Object.fromEntries(
  DESKTOP_APPS.map((key) => [key, false])
) as Record<DesktopAppKey, boolean>;

const DESKTOP_SETTINGS_QUERY_KEY = ["desktop", "settings"] as const;

const ShortcutGlyph = styled.span`
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #101010;
  background:
    linear-gradient(135deg, transparent 0 68%, #ffffff 68% 76%, #000080 76% 100%),
    #d7d7d7;
  color: #101010;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #808080;
`;

const BlangDesktopIcon = styled.img`
  width: 36px;
  height: 36px;
  object-fit: contain;
  display: block;
  margin-bottom: 0;
  filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.45));
`;

function reconcileVisibleIconLayout(
  current: DesktopIconLayout,
  visibleIcons: DesktopIconDef[],
  savedLayout: DesktopIconLayout | undefined,
  surfaceSize: { width: number; height: number },
  preferSaved: boolean
): DesktopIconLayout {
  const next: DesktopIconLayout = {};
  const hiddenKeys = new Set(Object.keys(current));
  let changed = false;

  for (const def of visibleIcons) {
    hiddenKeys.delete(def.key);
    const defaultPosition = { x: def.defaultX, y: def.defaultY };
    const source = preferSaved
      ? savedLayout
        ? savedLayout[def.key] ?? defaultPosition
        : current[def.key] ?? defaultPosition
      : current[def.key] ?? savedLayout?.[def.key] ?? defaultPosition;
    const position = clampIconPosition(source, surfaceSize);
    next[def.key] = position;
    const previous = current[def.key];
    if (!previous || previous.x !== position.x || previous.y !== position.y) {
      changed = true;
    }
  }

  if (hiddenKeys.size > 0) changed = true;
  return changed ? next : current;
}

const DesktopContainer = styled.div<{
  $appearance: DesktopAppearance;
  $cursorHidden: boolean;
}>`
  --wtf-desktop-color: ${(p) => p.$appearance.desktopColor};
  --wtf-window-color: ${(p) => p.$appearance.windowColor};
  --wtf-active-title: ${(p) => p.$appearance.activeTitleColor};
  --wtf-active-title-text: ${(p) => p.$appearance.activeTitleTextColor};
  --wtf-inactive-title: ${(p) => p.$appearance.inactiveTitleColor};
  --wtf-inactive-title-text: ${(p) => p.$appearance.inactiveTitleTextColor};
  --wtf-text-color: ${(p) => p.$appearance.textColor};
  --wtf-highlight-color: ${(p) => p.$appearance.highlightColor};
  --wtf-button-face: ${(p) => p.$appearance.buttonFace};

  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background-color: var(--wtf-desktop-color);
  color: var(--wtf-text-color);
  cursor: ${(p) => (p.$cursorHidden ? "none" : "auto")};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;

  ${(p) =>
    p.$cursorHidden
      ? `
        &,
        * {
          cursor: none !important;
        }
      `
      : ""}

  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  textarea {
    cursor: ${(p) => (p.$cursorHidden ? "none" : "text")};
  }

  button,
  [role="button"] {
    color: var(--wtf-text-color);
  }

  button:not([data-compact-control="true"]),
  select {
    background-color: var(--wtf-button-face);
  }
`;

const ContentArea = styled.div<{
  $appearance: DesktopAppearance;
}>`
  flex: 1;
  overflow: hidden;
  position: relative;
  background-color: var(--wtf-desktop-color);
  ${(p) => {
    const url = p.$appearance.backgroundImageUrl;
    if (!url) return "";
    if (p.$appearance.backgroundFit === "tile") {
      return `background-image: url("${url}"); background-repeat: repeat; background-size: auto;`;
    }
    if (p.$appearance.backgroundFit === "center") {
      return `background-image: url("${url}"); background-repeat: no-repeat; background-position: center; background-size: auto;`;
    }
    return `background-image: url("${url}"); background-repeat: no-repeat; background-position: center; background-size: ${p.$appearance.backgroundFit};`;
  }}
`;

const DesktopSurface = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
`;

const PortalPlacementLayer = styled.div<{ $active: boolean; $color: PortalColor }>`
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: ${(p) => (p.$active ? "auto" : "none")};
  cursor: ${(p) => (p.$active ? "crosshair" : "default")};

  &::after {
    content: "";
    position: absolute;
    right: 54px;
    top: 12px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid ${(p) => (p.$color === "blue" ? "#38bdf8" : "#fb923c")};
    background: rgba(15, 23, 42, 0.42);
    opacity: ${(p) => (p.$active ? 1 : 0)};
  }
`;

const WallpaperCenter = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 0;
`;

const WtfLogo = styled.div`
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  font-size: 72px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.1);
  letter-spacing: 12px;
  user-select: none;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.08);

  ${MOBILE} {
    font-size: 48px;
    letter-spacing: 8px;
  }
`;

const RouteLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  & > * {
    pointer-events: auto;
  }
`;

const ScreenSaver = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5000;
  background:
    radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.22) 0 1px, transparent 2px),
    radial-gradient(circle at 76% 64%, rgba(255, 255, 255, 0.2) 0 1px, transparent 2px),
    #020008;
  overflow: hidden;
  pointer-events: auto;
`;

const SaverLogo = styled.div`
  position: absolute;
  width: 220px;
  height: 82px;
  left: 8%;
  top: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  background: #000080;
  color: #ffff00;
  font-weight: 900;
  font-size: 42px;
  letter-spacing: 8px;
  box-shadow: 4px 4px 0 #ff00ff;
  animation: saver-bounce 9s linear infinite alternate;

  @keyframes saver-bounce {
    0% {
      transform: translate(0, 0);
    }
    28% {
      transform: translate(58vw, 15vh);
    }
    55% {
      transform: translate(18vw, 58vh);
    }
    82% {
      transform: translate(68vw, 48vh);
    }
    100% {
      transform: translate(4vw, 70vh);
    }
  }
`;


export function Desktop({ children }: { children: ReactNode }) {
  const wm = useWindowManager();
  const { user } = useAuth();
  const qc = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const hotCornerTimer = useRef<number | null>(null);

  const [surfaceSize, setSurfaceSize] = useState({ width: 1024, height: 768 });
  const [iconPositions, setIconPositions] = useState<DesktopIconLayout>({});
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [hamsterCareOpen, setHamsterCareOpen] = useState(false);
  const [desktopArtifactNow, setDesktopArtifactNow] = useState(() => Date.now());
  const [activeDesktopTool, setActiveDesktopTool] = useState<DesktopCursorTool>("standard");
  const [portalPaintColor, setPortalPaintColor] = useState<PortalColor>("blue");
  const [splitAssemblyKeyDown, setSplitAssemblyKeyDown] = useState(false);
  const [surfaceMeasured, setSurfaceMeasured] = useState(false);
  const [desktopShortcuts, setDesktopShortcuts] = useState<DesktopShortcut[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entries: Win95ContextMenuEntry[];
  } | null>(null);
  const iconDragActiveRef = useRef(false);
  const hasLocalIconEditsRef = useRef(false);
  const iconSaveRevisionRef = useRef(0);
  const shortcutsLoadedRef = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () => api.get<DesktopAppsResponse>("/api/apps/desktop"),
    staleTime: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: DESKTOP_SETTINGS_QUERY_KEY,
    queryFn: () => api.get<DesktopSettingsResponse>("/api/desktop/settings"),
    enabled: !!user,
    staleTime: 30_000,
  });

  const settingsMutation = useMutation({
    mutationFn: (payload: Partial<DesktopSettingsResponse>) =>
      api.put<DesktopSettingsResponse>("/api/desktop/settings", payload),
    onMutate: async (payload) => {
      const revision = ++iconSaveRevisionRef.current;
      await qc.cancelQueries({ queryKey: DESKTOP_SETTINGS_QUERY_KEY });
      const previous = qc.getQueryData<DesktopSettingsResponse>(DESKTOP_SETTINGS_QUERY_KEY);
      qc.setQueryData<DesktopSettingsResponse>(DESKTOP_SETTINGS_QUERY_KEY, (current) => ({
        appearance:
          payload.appearance ??
          current?.appearance ??
          previous?.appearance ??
          DEFAULT_DESKTOP_APPEARANCE,
        iconLayout: payload.iconLayout ?? current?.iconLayout ?? previous?.iconLayout ?? {},
      }));
      return { previous, revision };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        qc.setQueryData(DESKTOP_SETTINGS_QUERY_KEY, context.previous);
      }
    },
    onSuccess: (result, _payload, context) => {
      if (context?.revision === iconSaveRevisionRef.current) {
        hasLocalIconEditsRef.current = false;
      }
      qc.setQueryData(DESKTOP_SETTINGS_QUERY_KEY, result);
    },
  });

  const appearance = settingsQuery.data?.appearance ?? DEFAULT_DESKTOP_APPEARANCE;
  const activeCurses = useMemo(() => normalizeWtfCurseStatuses(user?.curses), [user?.curses]);
  const blangsCursed = hasWtfCurse(activeCurses, "blangs");
  const invertedMouseCursed = hasWtfCurse(activeCurses, "inverted_click_mouse");
  const customCursorStyle = blangsCursed ? "blang-side-eye" : appearance.cursorStyle;
  const customCursorEnabled =
    customCursorStyle !== "system" || blangsCursed || invertedMouseCursed;
  const appAccessBlocked = !canOpenAppsForRole(user?.roles ?? user?.role ?? null);
  const desktopPetEnabled = !!user && appearance.desktopPetEnabled;
  const desktopArtifacts = useDesktopArtifacts({
    enabled: !!user,
    userId: user?.id ?? null,
    bounds: surfaceSize,
  });
  const shortcutStorageKey = useMemo(() => desktopShortcutStorageKey(user?.id), [user?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => setDesktopArtifactNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!surfaceMeasured) return;
    try {
      const raw = window.localStorage.getItem(shortcutStorageKey);
      setDesktopShortcuts(normalizeDesktopShortcuts(raw ? JSON.parse(raw) : [], surfaceSize));
    } catch {
      setDesktopShortcuts([]);
    } finally {
      shortcutsLoadedRef.current = shortcutStorageKey;
    }
  }, [shortcutStorageKey, surfaceMeasured]);

  useEffect(() => {
    if (!surfaceMeasured || shortcutsLoadedRef.current !== shortcutStorageKey) return;
    setDesktopShortcuts((current) => normalizeDesktopShortcuts(current, surfaceSize));
  }, [shortcutStorageKey, surfaceMeasured, surfaceSize]);

  useEffect(() => {
    if (shortcutsLoadedRef.current !== shortcutStorageKey) return;
    try {
      window.localStorage.setItem(shortcutStorageKey, JSON.stringify(desktopShortcuts));
    } catch {
      // Local shortcut persistence should never block the desktop shell.
    }
  }, [desktopShortcuts, shortcutStorageKey]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--wtf-desktop-color", appearance.desktopColor);
    root.style.setProperty("--wtf-window-color", appearance.windowColor);
    root.style.setProperty("--wtf-active-title", appearance.activeTitleColor);
    root.style.setProperty("--wtf-active-title-text", appearance.activeTitleTextColor);
    root.style.setProperty("--wtf-inactive-title", appearance.inactiveTitleColor);
    root.style.setProperty("--wtf-inactive-title-text", appearance.inactiveTitleTextColor);
    root.style.setProperty("--wtf-text-color", appearance.textColor);
    root.style.setProperty("--wtf-highlight-color", appearance.highlightColor);
    root.style.setProperty("--wtf-button-face", appearance.buttonFace);
  }, [appearance]);

  useEffect(() => {
    if (!desktopPetEnabled) setHamsterCareOpen(false);
  }, [desktopPetEnabled]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "s") setSplitAssemblyKeyDown(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "s") setSplitAssemblyKeyDown(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const heldKeys = new Set<string>();
    const WTF_COMBO = new Set(["w", "t", "f"]);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || appAccessBlocked) return;
      const key = event.key.toLowerCase();
      if (!WTF_COMBO.has(key)) return;

      event.preventDefault();
      heldKeys.add(key);

      if (heldKeys.has("w") && heldKeys.has("t") && heldKeys.has("f")) {
        heldKeys.clear();
        wm.openPage("/task-manager");
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      heldKeys.delete(event.key.toLowerCase());
      if (!event.ctrlKey) heldKeys.clear();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [appAccessBlocked, wm]);

  const sourceApps = data?.apps ?? DISABLED_DESKTOP_APPS;
  const appGateBypass = useMemo(() => {
    const roles = normalizeUserRoles(user?.roles ?? user?.role ?? null);
    return roles.includes("admin") || roles.includes("trusted_creator");
  }, [user?.role, user?.roles]);
  const apps = {
    wtfiam: sourceApps.wtfiam,
    hoard: sourceApps.hoard,
    wim: sourceApps.wim,
    w: sourceApps.w,
    tv: sourceApps.tv,
    dicksword: sourceApps.dicksword,
    "i-hate-telegram": sourceApps["i-hate-telegram"],
    "dear-diary": sourceApps["dear-diary"],
    arcade: sourceApps.arcade,
    casino: sourceApps.casino,
    "dues-manager": sourceApps["dues-manager"],
    console: sourceApps.console,
    "game-studio": sourceApps["game-studio"],
    studio: sourceApps.studio,
    gallery: sourceApps.gallery,
    skywire: sourceApps.skywire,
    tz2at: sourceApps.tz2at,
    "rat-race": sourceApps["rat-race"],
    "map-lab": sourceApps["map-lab"],
    mail: sourceApps.mail,
  };

  const iconDefs = useMemo<DesktopIconDef[]>(
    () => buildDesktopIconDefs(apps, { appAccessBlocked, appGateBypass }),
    [
      appAccessBlocked,
      appGateBypass,
      apps.console,
      apps.dicksword,
      apps["dear-diary"],
      apps["i-hate-telegram"],
      apps.gallery,
      apps["game-studio"],
      apps.mail,
      apps.arcade,
      apps.casino,
      apps["dues-manager"],
      apps.hoard,
      apps.mail,
      apps.skywire,
      apps.tz2at,
      apps["rat-race"],
      apps["map-lab"],
      apps.studio,
      apps.tv,
      apps.wim,
      apps.w,
      apps.wtfiam,
    ]
  );

  const visibleIcons = useMemo(() => iconDefs.filter((icon) => icon.enabled), [iconDefs]);
  const renderedVisibleIcons = useMemo<DesktopIconDef[]>(
    () =>
      blangsCursed
        ? visibleIcons.map((icon) => ({
            ...icon,
            icon: <BlangDesktopIcon src="/cursors/blang-side-eye.png" alt="" draggable={false} />,
          }))
        : visibleIcons,
    [blangsCursed, visibleIcons]
  );
  const shortcutIconDefs = useMemo<DesktopIconDef[]>(
    () =>
      appAccessBlocked
        ? []
        : desktopShortcuts.map((shortcut) => ({
            key: shortcutIconKey(shortcut),
            label: shortcut.label,
            icon: blangsCursed ? (
              <BlangDesktopIcon src="/cursors/blang-side-eye.png" alt="" draggable={false} />
            ) : (
              <ShortcutGlyph>{shortcut.icon}</ShortcutGlyph>
            ),
            defaultX: shortcut.x,
            defaultY: shortcut.y,
            enabled: true,
            openPath: shortcut.path,
          })),
    [appAccessBlocked, blangsCursed, desktopShortcuts]
  );
  const visibleIconKey = useMemo(
    () => visibleIcons.map((icon) => icon.key).join("|"),
    [visibleIcons]
  );
  const desktopObstacles = useMemo<DesktopObstacle[]>(
    () =>
      visibleIcons.map((def) => {
        const position =
          iconPositions[def.key] ??
          clampIconPosition({ x: def.defaultX, y: def.defaultY }, surfaceSize);
        return {
          id: def.key,
          x: position.x,
          y: position.y,
          width: ICON_W,
          height: ICON_H,
        };
      }),
    [iconPositions, surfaceSize, visibleIcons]
  );
  const shortcutObstacles = useMemo<DesktopObstacle[]>(
    () =>
      desktopShortcuts.map((shortcut) => ({
        id: shortcutIconKey(shortcut),
        x: shortcut.x,
        y: shortcut.y,
        width: ICON_W,
        height: ICON_H,
      })),
    [desktopShortcuts]
  );
  const desktopItemObstacles = useMemo<DesktopObstacle[]>(
    () =>
      desktopArtifacts.items.flatMap((item) => {
        if (item.kind === "sticky-note" || item.kind === "hanging-light" || item.kind === "portal") return [];
        const rect = getDesktopItemRect(item, surfaceSize, desktopArtifactNow);
        return [
          {
            id: `desktop-item-${item.id}`,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        ];
      }),
    [desktopArtifactNow, desktopArtifacts.items, surfaceSize]
  );
  const desktopPetObstacles = useMemo(
    () => [...desktopObstacles, ...shortcutObstacles, ...desktopItemObstacles],
    [desktopItemObstacles, desktopObstacles, shortcutObstacles]
  );
  const trashRect = useMemo(
    () => desktopObstacles.find((obstacle) => obstacle.id === "recycle-bin") ?? null,
    [desktopObstacles]
  );

  const reportDesktopEvent = useCallback(
    (payload: DesktopClientEventPayload) => {
      if (!user) return;
      void api.post<{ ok: true }>("/api/desktop/events", payload).catch(() => {
        // Desktop interaction telemetry should never block local OS controls.
      });
    },
    [user]
  );

  const handlePortalPlace = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activeDesktopTool !== "portal-gun") return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      desktopArtifacts.placePortal(portalPaintColor, x, y);
      reportDesktopEvent({
        eventType: "desktop.item.effect_triggered",
        objectId: `portal-${portalPaintColor}`,
        objectKind: "portal",
        action: "place",
        metadata: {
          color: portalPaintColor,
          x: Math.round(x),
          y: Math.round(y),
        },
      });
      setPortalPaintColor((color) => nextPortalToolColor(color));
    },
    [activeDesktopTool, desktopArtifacts, portalPaintColor, reportDesktopEvent]
  );

  const saveIconLayout = useCallback(
    (layout: DesktopIconLayout) => {
      if (!user) return;
      settingsMutation.mutate({ iconLayout: layout });
    },
    [settingsMutation, user]
  );

  useEffect(() => {
    if (
      !settingsQuery.data ||
      !surfaceMeasured ||
      iconDragActiveRef.current ||
      hasLocalIconEditsRef.current
    ) {
      return;
    }
    setIconPositions((current) =>
      reconcileVisibleIconLayout(
        current,
        visibleIcons,
        settingsQuery.data.iconLayout,
        surfaceSize,
        true
      )
    );
  }, [settingsQuery.data?.iconLayout, surfaceMeasured, surfaceSize, visibleIconKey, visibleIcons]);

  useEffect(() => {
    setIconPositions((current) =>
      reconcileVisibleIconLayout(
        current,
        visibleIcons,
        settingsQuery.data?.iconLayout,
        surfaceSize,
        !!settingsQuery.data && !iconDragActiveRef.current && !hasLocalIconEditsRef.current
      )
    );
  }, [settingsQuery.data?.iconLayout, surfaceSize, visibleIconKey, visibleIcons]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setSurfaceSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
      setSurfaceMeasured(true);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const {
    handleIconDragStart: startIconPhysicsDrag,
    handleIconDragEnd: endIconPhysicsDrag,
    handleIconMove: moveIconPhysics,
    handleIconRelease: releaseIconPhysics,
  } = useDesktopIconPhysics({
    appearance,
    surfaceSize,
    visibleIcons,
    visibleIconKey,
    iconPositions,
    setIconPositions,
    saveIconLayout,
  });

  const handleIconDragStart = useCallback(
    (key: string) => {
      iconDragActiveRef.current = true;
      startIconPhysicsDrag(key);
    },
    [startIconPhysicsDrag]
  );

  const handleIconDragEnd = useCallback(
    (key: string) => {
      iconDragActiveRef.current = false;
      endIconPhysicsDrag(key);
    },
    [endIconPhysicsDrag]
  );

  const handleIconMove = useCallback(
    (key: string, position: { x: number; y: number }) => {
      iconDragActiveRef.current = true;
      hasLocalIconEditsRef.current = true;
      moveIconPhysics(key, position);
    },
    [moveIconPhysics]
  );

  const handleIconRelease = useCallback(
    (key: string, position: { x: number; y: number }, velocity: { x: number; y: number }) => {
      iconDragActiveRef.current = false;
      hasLocalIconEditsRef.current = true;
      releaseIconPhysics(key, position, velocity);
      reportDesktopEvent({
        eventType: "desktop.icon.moved",
        objectId: key,
        objectKind: "icon",
        action: "move",
        metadata: {
          x: Math.round(position.x),
          y: Math.round(position.y),
          speed: Math.round(Math.hypot(velocity.x, velocity.y)),
        },
      });
    },
    [releaseIconPhysics, reportDesktopEvent]
  );

  const handleDesktopIconOpen = useCallback(
    (def: DesktopIconDef) => {
      reportDesktopEvent({
        eventType: def.openPath ? "desktop.icon.opened" : "desktop.object.clicked",
        objectId: def.key,
        objectKind: "icon",
        action: def.openPath ? "open" : "click",
        metadata: {
          label: def.label,
          path: def.openPath ?? null,
        },
      });
      if (def.openPath && !appAccessBlocked) wm.openPage(def.openPath);
    },
    [appAccessBlocked, reportDesktopEvent, wm]
  );

  const handleDesktopItemInteract = useCallback(
    (item: DesktopItemState, action: string) => {
      reportDesktopEvent({
        eventType: "desktop.object.clicked",
        objectId: item.id,
        objectKind: item.kind,
        action,
        metadata: {
          sourceSku: item.sourceSku ?? null,
          inventoryOrdinal: item.inventoryOrdinal ?? null,
        },
      });
    },
    [reportDesktopEvent]
  );

  const addDesktopShortcut = useCallback(
    (
      payload: StartMenuShortcutPayload,
      position?: { x: number; y: number },
      source: "drop" | "context-menu" = "context-menu"
    ) => {
      if (appAccessBlocked) return;
      setDesktopShortcuts((current) => {
        const shortcut = createDesktopShortcut(
          payload,
          position ?? defaultShortcutPosition(current.length, surfaceSize),
          surfaceSize
        );
        return [...current, shortcut].slice(-48);
      });
      reportDesktopEvent({
        eventType: "desktop.shortcut.created",
        objectId: payload.path,
        objectKind: "shortcut",
        action: "create",
        metadata: {
          label: payload.label,
          path: payload.path,
          source,
        },
      });
    },
    [appAccessBlocked, reportDesktopEvent, surfaceSize]
  );

  useEffect(() => {
    const handleShortcutRequest = (event: Event) => {
      const payload = (event as CustomEvent<StartMenuShortcutPayload>).detail;
      if (!payload) return;
      addDesktopShortcut(payload, undefined, "context-menu");
    };
    window.addEventListener(DESKTOP_SHORTCUT_EVENT, handleShortcutRequest);
    return () => window.removeEventListener(DESKTOP_SHORTCUT_EVENT, handleShortcutRequest);
  }, [addDesktopShortcut]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const resetNativeIconLayout = useCallback(() => {
    const layout = visibleIcons.reduce<DesktopIconLayout>((next, def) => {
      next[def.key] = clampIconPosition({ x: def.defaultX, y: def.defaultY }, surfaceSize);
      return next;
    }, {});
    hasLocalIconEditsRef.current = true;
    setIconPositions(layout);
    saveIconLayout(layout);
    reportDesktopEvent({
      eventType: "desktop.icon_layout.reset",
      objectId: "desktop",
      objectKind: "desktop",
      action: "reset",
      metadata: { source: "context-menu" },
    });
  }, [reportDesktopEvent, saveIconLayout, surfaceSize, visibleIcons]);

  const openNativeIconContextMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>,
      def: DesktopIconDef
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const entries: Win95ContextMenuEntry[] = [
        {
          label: "Open",
          disabled: !def.openPath || appAccessBlocked,
          onSelect: () => handleDesktopIconOpen(def),
        },
      ];
      if (def.openPath && !appAccessBlocked) {
        entries.push({
          label: "Create Shortcut",
          onSelect: () =>
            addDesktopShortcut(
              {
                label: def.label,
                path: def.openPath!,
                icon: typeof def.icon === "string" ? def.icon : def.label.slice(0, 2).toUpperCase(),
              },
              undefined,
              "context-menu"
            ),
        });
      }
      entries.push(
        { kind: "separator" },
        {
          label: "Properties",
          disabled: true,
          onSelect: () => {},
        }
      );
      setContextMenu({ x: event.clientX, y: event.clientY, entries });
      reportDesktopEvent({
        eventType: "desktop.context_menu.opened",
        objectId: def.key,
        objectKind: "icon",
        action: "open",
        metadata: { label: def.label },
      });
    },
    [addDesktopShortcut, appAccessBlocked, handleDesktopIconOpen, reportDesktopEvent]
  );

  const openShortcutContextMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>,
      shortcut: DesktopShortcut
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        entries: [
          {
            label: "Open",
            disabled: appAccessBlocked,
            onSelect: () => {
              if (appAccessBlocked) return;
              wm.openPage(shortcut.path);
              reportDesktopEvent({
                eventType: "desktop.shortcut.opened",
                objectId: shortcut.id,
                objectKind: "shortcut",
                action: "open",
                metadata: { label: shortcut.label, path: shortcut.path },
              });
            },
          },
          { kind: "separator" },
          {
            label: "Delete Shortcut",
            onSelect: () => {
              setDesktopShortcuts((current) => current.filter((item) => item.id !== shortcut.id));
              reportDesktopEvent({
                eventType: "desktop.shortcut.deleted",
                objectId: shortcut.id,
                objectKind: "shortcut",
                action: "delete",
                metadata: { label: shortcut.label, path: shortcut.path },
              });
            },
          },
          {
            label: "Properties",
            disabled: true,
            onSelect: () => {},
          },
        ],
      });
      reportDesktopEvent({
        eventType: "desktop.context_menu.opened",
        objectId: shortcut.id,
        objectKind: "shortcut",
        action: "open",
        metadata: { label: shortcut.label, path: shortcut.path },
      });
    },
    [appAccessBlocked, reportDesktopEvent, wm]
  );

  const openDesktopItemContextMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>,
      item: DesktopItemState
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const label =
        item.kind === "artifact-icon"
          ? item.label
          : item.kind
              .split("-")
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" ");
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        entries: [
          {
            label,
            disabled: true,
            onSelect: () => {},
          },
          { kind: "separator" },
          {
            label: "Remove from Desktop",
            onSelect: () => {
              desktopArtifacts.removeDesktopItem(item.id);
              handleDesktopItemInteract(item, "context_remove");
            },
          },
          {
            label: "Properties",
            disabled: true,
            onSelect: () => {},
          },
        ],
      });
      reportDesktopEvent({
        eventType: "desktop.context_menu.opened",
        objectId: item.id,
        objectKind: item.kind,
        action: "open",
        metadata: { label },
      });
    },
    [desktopArtifacts, handleDesktopItemInteract, reportDesktopEvent]
  );

  const handleShortcutMove = useCallback(
    (key: string, position: { x: number; y: number }) => {
      const id = shortcutIdFromIconKey(key);
      if (!id) return;
      const nextPosition = clampIconPosition(position, surfaceSize);
      setDesktopShortcuts((current) =>
        current.map((shortcut) =>
          shortcut.id === id ? { ...shortcut, ...nextPosition } : shortcut
        )
      );
    },
    [surfaceSize]
  );

  const handleShortcutRelease = useCallback(
    (key: string, position: { x: number; y: number }, velocity: { x: number; y: number }) => {
      const id = shortcutIdFromIconKey(key);
      if (!id) return;
      const nextPosition = clampIconPosition(position, surfaceSize);
      setDesktopShortcuts((current) =>
        current.map((shortcut) =>
          shortcut.id === id ? { ...shortcut, ...nextPosition } : shortcut
        )
      );
      reportDesktopEvent({
        eventType: "desktop.shortcut.moved",
        objectId: id,
        objectKind: "shortcut",
        action: "move",
        metadata: {
          x: Math.round(nextPosition.x),
          y: Math.round(nextPosition.y),
          speed: Math.round(Math.hypot(velocity.x, velocity.y)),
        },
      });
    },
    [reportDesktopEvent, surfaceSize]
  );

  const handleShortcutOpen = useCallback(
    (shortcut: DesktopShortcut) => {
      if (appAccessBlocked) return;
      wm.openPage(shortcut.path);
      reportDesktopEvent({
        eventType: "desktop.shortcut.opened",
        objectId: shortcut.id,
        objectKind: "shortcut",
        action: "open",
        metadata: { label: shortcut.label, path: shortcut.path },
      });
    },
    [appAccessBlocked, reportDesktopEvent, wm]
  );

  const hasStartMenuShortcutDrag = useCallback((event: ReactDragEvent<HTMLElement>) => {
    return Array.from(event.dataTransfer.types).includes(START_MENU_SHORTCUT_MIME);
  }, []);

  const handleDesktopDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!hasStartMenuShortcutDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [hasStartMenuShortcutDrag]
  );

  const handleDesktopDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!hasStartMenuShortcutDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const payload = parseShortcutPayload(event.dataTransfer.getData(START_MENU_SHORTCUT_MIME));
      if (!payload) return;
      const rect = event.currentTarget.getBoundingClientRect();
      addDesktopShortcut(
        payload,
        {
          x: event.clientX - rect.left - ICON_W / 2,
          y: event.clientY - rect.top - ICON_H / 2,
        },
        "drop"
      );
    },
    [addDesktopShortcut, hasStartMenuShortcutDrag]
  );

  const targetOwnsDesktopInteraction = useCallback((target: EventTarget | null) => {
    return target instanceof HTMLElement
      ? Boolean(
          target.closest(
            "[data-desktop-icon-root='true'], [data-desktop-item-root='true'], [data-route-layer='true'], input, textarea, select, button"
          )
        )
      : false;
  }, []);

  const openDesktopSurfaceContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>) => {
      if (targetOwnsDesktopInteraction(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        entries: [
          {
            label: "Refresh",
            onSelect: () => {
              void qc.invalidateQueries({ queryKey: ["desktop", "apps"] });
              void qc.invalidateQueries({ queryKey: DESKTOP_SETTINGS_QUERY_KEY });
            },
          },
          {
            label: "Reset Native Icons",
            onSelect: resetNativeIconLayout,
          },
          { kind: "separator" },
          {
            label: "System Appearance",
            disabled: appAccessBlocked,
            onSelect: () => wm.openPage("/desktop-settings"),
          },
        ],
      });
      reportDesktopEvent({
        eventType: "desktop.context_menu.opened",
        objectId: "desktop",
        objectKind: "desktop",
        action: "open",
        metadata: { source: "surface" },
      });
    },
    [appAccessBlocked, qc, reportDesktopEvent, resetNativeIconLayout, targetOwnsDesktopInteraction, wm]
  );

  const handleDesktopPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.shiftKey || event.button !== 0) return;
      openDesktopSurfaceContextMenu(event);
    },
    [openDesktopSurfaceContextMenu]
  );

  const handleDesktopToolSelect = useCallback(
    (tool: DesktopCursorTool) => {
      setActiveDesktopTool(tool);
      reportDesktopEvent({
        eventType: "desktop.tool.selected",
        objectId: tool,
        objectKind: "tool",
        action: "select",
        metadata: { tool },
      });
    },
    [reportDesktopEvent]
  );

  const resetHotCorner = useCallback(() => {
    if (hotCornerTimer.current) {
      window.clearTimeout(hotCornerTimer.current);
      hotCornerTimer.current = null;
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (screensaverActive || e.buttons !== 0) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hot =
        (x < 20 && y < 20) ||
        (x > rect.width - 20 && y < 20) ||
        (x < 20 && y > rect.height - 20) ||
        (x > rect.width - 20 && y > rect.height - 20);
      if (!hot) {
        resetHotCorner();
        return;
      }
      if (!hotCornerTimer.current) {
        hotCornerTimer.current = window.setTimeout(() => {
          hotCornerTimer.current = null;
          setScreensaverActive(true);
        }, 2200);
      }
    },
    [resetHotCorner, screensaverActive]
  );

  useEffect(() => {
    if (!screensaverActive) return;
    const close = () => setScreensaverActive(false);
    window.addEventListener("mousemove", close, { once: true });
    window.addEventListener("keydown", close, { once: true });
    window.addEventListener("pointerdown", close, { once: true });
    return () => {
      window.removeEventListener("mousemove", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [screensaverActive]);

  return (
    <DesktopContainer
      data-wtf-desktop="true"
      $appearance={appearance}
      $cursorHidden={customCursorEnabled}
    >
      <ContentArea
        data-wtf-desktop-content="true"
        ref={contentRef}
        $appearance={appearance}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetHotCorner}
        onPointerDown={handleDesktopPointerDown}
        onContextMenu={openDesktopSurfaceContextMenu}
        onDragOver={handleDesktopDragOver}
        onDrop={handleDesktopDrop}
      >
        <WallpaperCenter>
          {!appearance.backgroundImageUrl && <WtfLogo>W T F</WtfLogo>}
        </WallpaperCenter>
        <DesktopSurface>
          {renderedVisibleIcons.map((def) => (
            <DraggableIcon
              key={def.key}
              def={def}
              position={
                iconPositions[def.key] ??
                clampIconPosition({ x: def.defaultX, y: def.defaultY }, surfaceSize)
              }
              bounds={surfaceSize}
              onDragStart={handleIconDragStart}
              onDragEnd={handleIconDragEnd}
              onMove={handleIconMove}
              onRelease={handleIconRelease}
              onOpen={() => handleDesktopIconOpen(def)}
              onContextMenu={openNativeIconContextMenu}
              onShiftClick={openNativeIconContextMenu}
            />
          ))}
          {shortcutIconDefs.map((def) => {
            const shortcut = desktopShortcuts.find((item) => shortcutIconKey(item) === def.key);
            if (!shortcut) return null;
            return (
              <DraggableIcon
                key={def.key}
                def={def}
                position={clampIconPosition({ x: shortcut.x, y: shortcut.y }, surfaceSize)}
                bounds={surfaceSize}
                onDragStart={() => undefined}
                onDragEnd={() => undefined}
                onMove={handleShortcutMove}
                onRelease={handleShortcutRelease}
                onOpen={() => handleShortcutOpen(shortcut)}
                onContextMenu={(event) => openShortcutContextMenu(event, shortcut)}
                onShiftClick={(event) => openShortcutContextMenu(event, shortcut)}
              />
            );
          })}
          <DesktopItemActors
            items={desktopArtifacts.items}
            bounds={surfaceSize}
            now={desktopArtifactNow}
            activeTool={activeDesktopTool}
            onToolSelect={handleDesktopToolSelect}
            onMove={desktopArtifacts.moveDesktopItem}
            onToolMove={desktopArtifacts.moveDesktopItem}
            onScaleItem={desktopArtifacts.scaleDesktopItem}
            onCursorTrayToggle={desktopArtifacts.toggleCursorToolTray}
            onTrainKitOpen={desktopArtifacts.unpackTrainKit}
            onOpenJukebox={() => {
              if (!appAccessBlocked) wm.openPage("/tezamp");
            }}
            onInteract={handleDesktopItemInteract}
            onPortalGunEquip={() => setPortalPaintColor("blue")}
            onRemoveItem={desktopArtifacts.removeDesktopItem}
            onFanRotate={desktopArtifacts.rotateFan}
            onStickyText={desktopArtifacts.updateStickyNoteText}
            onStickyStroke={desktopArtifacts.addStickyNoteStroke}
            onContextMenu={openDesktopItemContextMenu}
            splitAssemblyKeyDown={splitAssemblyKeyDown}
          />
          <PortalPlacementLayer
            $active={activeDesktopTool === "portal-gun"}
            $color={portalPaintColor}
            onPointerDown={handlePortalPlace}
          />
        </DesktopSurface>
        <DesktopWeatherCloud bounds={surfaceSize} />
        <SundayGrass userId={user?.id ?? null} bounds={surfaceSize} />
        <RouteLayer data-route-layer="true">{children}</RouteLayer>
        <DesktopPet
          enabled={desktopPetEnabled}
          bounds={surfaceSize}
          userId={user?.id ?? null}
          careOpen={hamsterCareOpen}
          onCareOpenChange={setHamsterCareOpen}
          obstacles={desktopPetObstacles}
          trashRect={trashRect}
          items={desktopArtifacts.items}
          itemsRef={desktopArtifacts.itemsRef}
          setItems={desktopArtifacts.setItems}
        />
      </ContentArea>
      <Taskbar
        hamsterCareEnabled={desktopPetEnabled}
        hamsterCareOpen={hamsterCareOpen}
        onToggleHamsterCare={() => setHamsterCareOpen((open) => !open)}
      />
      {screensaverActive && (
        <ScreenSaver aria-hidden="true">
          <SaverLogo>WTF</SaverLogo>
        </ScreenSaver>
      )}
      {customCursorEnabled && !(invertedMouseCursed && !blangsCursed) ? (
        <CustomCursor style={customCursorStyle} />
      ) : null}
      <CursedDesktopEffects curses={activeCurses} />
      {contextMenu && (
        <Win95ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entries={contextMenu.entries}
          onClose={closeContextMenu}
        />
      )}
    </DesktopContainer>
  );
}
