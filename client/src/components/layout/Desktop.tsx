import {
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
import { useWindowManager } from "../../lib/window-context";
import { MOBILE } from "../../global-styles";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { CustomCursor } from "../../features/desktop/CustomCursor";
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
import { type DesktopAppKey } from "@shared/types";
import {
  DEFAULT_DESKTOP_APPEARANCE,
  type DesktopAppearance,
  type DesktopIconLayout,
} from "@shared/desktop";

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

const DESKTOP_SETTINGS_QUERY_KEY = ["desktop", "settings"] as const;

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
  const iconDragActiveRef = useRef(false);
  const hasLocalIconEditsRef = useRef(false);
  const iconSaveRevisionRef = useRef(0);

  const { data } = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () =>
      api.get<{ apps: Record<DesktopAppKey, boolean> }>("/api/apps/desktop"),
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
  const customCursorEnabled = appearance.cursorStyle !== "system";
  const desktopPetEnabled = !!user && appearance.desktopPetEnabled;
  const desktopArtifacts = useDesktopArtifacts({
    enabled: !!user,
    userId: user?.id ?? null,
    bounds: surfaceSize,
  });

  useEffect(() => {
    const interval = window.setInterval(() => setDesktopArtifactNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

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

  const apps = {
    wtfiam: data?.apps?.wtfiam ?? true,
    hoard: data?.apps?.hoard ?? true,
    w: data?.apps?.w ?? true,
    tv: data?.apps?.tv ?? true,
    dicksword: data?.apps?.dicksword ?? true,
    arcade: data?.apps?.arcade ?? true,
    casino: data?.apps?.casino ?? true,
    "dues-manager": data?.apps?.["dues-manager"] ?? false,
    console: data?.apps?.console ?? true,
    "game-studio": data?.apps?.["game-studio"] ?? true,
    studio: data?.apps?.studio ?? true,
    gallery: data?.apps?.gallery ?? true,
  };

  const iconDefs = useMemo<DesktopIconDef[]>(
    () => buildDesktopIconDefs(apps),
    [
      apps.console,
      apps.dicksword,
      apps.gallery,
      apps["game-studio"],
      apps.arcade,
      apps.casino,
      apps["dues-manager"],
      apps.hoard,
      apps.studio,
      apps.tv,
      apps.w,
      apps.wtfiam,
    ]
  );

  const visibleIcons = useMemo(() => iconDefs.filter((icon) => icon.enabled), [iconDefs]);
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
    () => [...desktopObstacles, ...desktopItemObstacles],
    [desktopItemObstacles, desktopObstacles]
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
      if (def.openPath) wm.openPage(def.openPath);
    },
    [reportDesktopEvent, wm]
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
      >
        <WallpaperCenter>
          {!appearance.backgroundImageUrl && <WtfLogo>W T F</WtfLogo>}
        </WallpaperCenter>
        <DesktopSurface>
          {visibleIcons.map((def) => (
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
            />
          ))}
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
            onOpenJukebox={() => wm.openPage("/tezamp")}
            onInteract={handleDesktopItemInteract}
            onPortalGunEquip={() => setPortalPaintColor("blue")}
            onRemoveItem={desktopArtifacts.removeDesktopItem}
            onFanRotate={desktopArtifacts.rotateFan}
            onStickyText={desktopArtifacts.updateStickyNoteText}
            onStickyStroke={desktopArtifacts.addStickyNoteStroke}
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
        <RouteLayer>{children}</RouteLayer>
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
      <CustomCursor style={appearance.cursorStyle} />
    </DesktopContainer>
  );
}
