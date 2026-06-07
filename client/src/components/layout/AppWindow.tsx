import {
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
  useState,
  useContext,
} from "react";
import styled from "styled-components";
import { Window, WindowHeader, WindowContent, Button } from "react95";
import { useWindowManager, WindowPathContext } from "../../lib/window-context";
import { useAuth } from "../../lib/auth-context";
import { NativeAdminPanel } from "../../features/admin-os/NativeAdminPanel";
import { findAdminSurfaceForPath } from "../../features/admin-os/admin-surface-registry";
import { MOBILE_BP, MOBILE } from "../../global-styles";

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BP
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

const FloatingWindow = styled(Window)<{
  $maximized: boolean;
  $x: number;
  $y: number;
  $w: number;
  $h: number;
  $z: number;
  $hidden: boolean;
}>`
  position: absolute;
  display: ${(p) => (p.$hidden ? "none" : "flex")};
  flex-direction: column;
  min-width: 320px;
  min-height: 200px;
  z-index: ${(p) => p.$z};
  ${(p) =>
    p.$maximized
      ? `top: 0; left: 0; width: 100%; height: 100%;`
      : `top: ${p.$y}px; left: ${p.$x}px; width: ${p.$w}px; height: ${p.$h}px;`}
  background: var(--wtf-window-color, #c0c0c0);
  color: var(--wtf-text-color, #111);
  border: var(--wtf-window-border, 0);
  border-radius: var(--wtf-window-radius, 0);
  box-shadow: var(--wtf-window-shadow, 1px 1px 0 #ffffff inset, -1px -1px 0 #808080 inset, 3px 3px 0 rgba(0, 0, 0, 0.48));
  outline: ${(p) => (p.$hidden ? "0" : "var(--wtf-window-outline, 1px solid rgba(0, 0, 0, 0.72))")};
  overflow: hidden;
  isolation: isolate;
  transition: var(--wtf-chrome-transition, none);

  html[data-wtf-appearance-style="wtf-zine"] & {
    transform: rotate(-0.12deg);
  }

  ${MOBILE} {
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    min-width: 0;
    min-height: 0;
  }
`;

const StyledHeader = styled(WindowHeader)<{ $focused: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  cursor: grab;
  padding: var(--wtf-titlebar-padding, 0 3px 0 3px);
  min-height: var(--wtf-titlebar-height, 27px);
  border-radius: var(--wtf-titlebar-radius, var(--wtf-window-radius, 0)) var(--wtf-titlebar-radius, var(--wtf-window-radius, 0)) 0 0;
  background: ${(p) =>
    p.$focused
      ? "linear-gradient(90deg, var(--wtf-active-title, #000080), color-mix(in srgb, var(--wtf-active-title, #000080) 72%, #ffffff))"
      : "linear-gradient(90deg, var(--wtf-inactive-title, #808080), color-mix(in srgb, var(--wtf-inactive-title, #808080) 65%, #ffffff))"};
  color: ${(p) =>
    p.$focused
      ? "var(--wtf-active-title-text, #ffffff)"
      : "var(--wtf-inactive-title-text, #c0c0c0)"};
  font-family: var(--wtf-titlebar-font, var(--wtf-shell-font, "MS Sans Serif", "Segoe UI", Tahoma, sans-serif));
  font-weight: var(--wtf-titlebar-font-weight, 700);
  transition: var(--wtf-chrome-transition, none);

  html[data-wtf-appearance-style="wtf-xp"] & {
    background: ${(p) =>
      p.$focused
        ? "linear-gradient(180deg, color-mix(in srgb, var(--wtf-active-title, #245edb) 54%, #ffffff) 0%, var(--wtf-active-title, #245edb) 48%, color-mix(in srgb, var(--wtf-active-title, #245edb) 74%, #000000) 100%)"
        : "linear-gradient(180deg, color-mix(in srgb, var(--wtf-inactive-title, #7a8aa4) 58%, #ffffff) 0%, var(--wtf-inactive-title, #7a8aa4) 100%)"};
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    justify-content: center;
    background: ${(p) =>
      p.$focused
        ? "radial-gradient(circle at 50% 8%, rgba(255,255,255,0.88), transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--wtf-active-title, #6aa2db) 34%, #ffffff), color-mix(in srgb, var(--wtf-active-title, #6aa2db) 72%, #000000))"
        : "radial-gradient(circle at 50% 8%, rgba(255,255,255,0.62), transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--wtf-inactive-title, #9a9a9a) 44%, #ffffff), var(--wtf-inactive-title, #9a9a9a))"};
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border-bottom: 3px solid #000000;
    text-transform: uppercase;
    background: ${(p) =>
      p.$focused
        ? "linear-gradient(90deg, var(--wtf-active-title, #000080), color-mix(in srgb, var(--wtf-active-title, #000080) 70%, #000000))"
        : "linear-gradient(90deg, var(--wtf-inactive-title, #808080), color-mix(in srgb, var(--wtf-inactive-title, #808080) 72%, #000000))"};
  }

  &:active {
    cursor: grabbing;
  }

  ${MOBILE} {
    cursor: default;
    padding: 4px 6px;
    min-height: 32px;
  }
`;

const TitleText = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &::before {
    content: var(--wtf-title-icon-content, "▣");
    font-size: 13px;
    line-height: 1;
    color: currentColor;
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    position: absolute;
    left: 50%;
    max-width: calc(100% - 150px);
    transform: translateX(-50%);
    justify-content: center;

    &::before {
      display: none;
    }
  }
`;

const HeaderButtons = styled.div`
  display: flex;
  gap: 2px;
  flex-shrink: 0;
`;

const WinButton = styled(Button)`
  && {
    padding: 0;
    min-width: 32px;
    width: 32px;
    min-height: 32px;
    height: 32px;
    font-size: 13px;
    font-weight: bold;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--wtf-control-radius, 0);
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    min-width: 32px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 0;
  }

  html[data-wtf-appearance-style="wtf-aqua"] &:nth-child(1) {
    background: #ff5f57;
  }

  html[data-wtf-appearance-style="wtf-aqua"] &:nth-child(2) {
    background: #ffbd2e;
  }

  html[data-wtf-appearance-style="wtf-aqua"] &:nth-child(3) {
    background: #28c840;
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 2px solid #000000;
    box-shadow: 2px 2px 0 #000000;
  }

  ${MOBILE} {
    && {
      min-width: 44px;
      width: 44px;
      min-height: 44px;
      height: 44px;
      font-size: 14px;
    }
  }
`;

const StyledContent = styled(WindowContent)`
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  color: var(--wtf-app-text, var(--wtf-text-color, #111));
  background: var(--wtf-app-bg, var(--wtf-window-color, #c0c0c0));

  html[data-wtf-appearance-style="wtf-xp"] & {
    background: var(--wtf-app-bg, color-mix(in srgb, var(--wtf-window-color, #c0c0c0) 92%, #ffffff));
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    background: var(--wtf-app-bg, color-mix(in srgb, var(--wtf-window-color, #c0c0c0) 88%, #ffffff));
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    background: var(--wtf-app-bg, var(--wtf-window-color, #c0c0c0));
  }

  ${MOBILE} {
    min-height: 0;
  }
`;

const ContentScroll = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--wtf-content-padding, 12px);
  color: var(--wtf-app-text, var(--wtf-text-color, #111));
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  overflow-wrap: anywhere;
  -webkit-overflow-scrolling: touch;

  > * {
    min-width: 0;
    max-width: 100%;
  }

  ${MOBILE} {
    padding: 10px;
  }
`;

const ResizeHandle = styled.div`
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 20;

  &::after {
    content: "";
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 8px;
    height: 8px;
    border-right: 2px solid #808080;
    border-bottom: 2px solid #808080;
  }

  ${MOBILE} {
    display: none;
  }
`;

interface AppWindowProps {
  title: string;
  children: ReactNode;
  toolbar?: ReactNode;
}

export function AppWindow({ title, children, toolbar }: AppWindowProps) {
  const pagePath = useContext(WindowPathContext);
  const wm = useWindowManager();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  const windowKey = pagePath || title;
  const state = wm.getWindow(windowKey);
  const isFocused = wm.focusedPath === windowKey;
  const isStrictAdmin = user?.role === "admin";
  const adminSurface = findAdminSurfaceForPath(pagePath);

  useEffect(() => {
    wm.setTitle(windowKey, title);
  }, [windowKey, title]);

  const handleFocus = useCallback(() => {
    if (wm.focusedPath !== windowKey) wm.focus(windowKey);
  }, [windowKey, wm]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      if (state.maximized) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      handleFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPos = { ...state.position };

      const onMove = (ev: MouseEvent) => {
        wm.setPosition(
          windowKey,
          Math.max(0, startPos.x + (ev.clientX - startX)),
          Math.max(0, startPos.y + (ev.clientY - startY))
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [windowKey, state.maximized, state.position, wm, isMobile, handleFocus]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      if (state.maximized) return;
      e.preventDefault();
      e.stopPropagation();
      handleFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startSize = { ...state.size };

      const onMove = (ev: MouseEvent) => {
        wm.setSize(
          windowKey,
          Math.max(320, startSize.w + (ev.clientX - startX)),
          Math.max(200, startSize.h + (ev.clientY - startY))
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [windowKey, state.maximized, state.size, wm, isMobile, handleFocus]
  );

  const effectiveMaximized = isMobile || state.maximized;

  return (
    <FloatingWindow
      $maximized={effectiveMaximized}
      $x={state.position.x}
      $y={state.position.y}
      $w={state.size.w}
      $h={state.size.h}
      $z={state.zIndex}
      $hidden={state.minimized}
      onMouseDown={handleFocus}
    >
      <StyledHeader
        $focused={isFocused}
        onMouseDown={handleDragStart}
        onDoubleClick={() => !isMobile && wm.toggleMaximize(windowKey)}
      >
        <TitleText>{title}</TitleText>
        <HeaderButtons>
          {isStrictAdmin && adminSurface && (
            <WinButton
              size="sm"
              data-compact-control="true"
              aria-label={`${adminSurface.label} admin settings`}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setAdminPanelOpen((open) => !open);
              }}
              title={`${adminSurface.label} admin settings`}
            >
              ADM
            </WinButton>
          )}
          {!isMobile && (
            <>
              <WinButton
                size="sm"
                data-compact-control="true"
                aria-label={`Minimize ${title}`}
                title={`Minimize ${title}`}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  wm.minimize(windowKey);
                }}
              >
                _
              </WinButton>
              <WinButton
                size="sm"
                data-compact-control="true"
                aria-label={`${state.maximized ? "Restore" : "Maximize"} ${title}`}
                title={`${state.maximized ? "Restore" : "Maximize"} ${title}`}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  wm.toggleMaximize(windowKey);
                }}
              >
                {state.maximized ? "❐" : "□"}
              </WinButton>
            </>
          )}
          <WinButton
            size="sm"
            data-compact-control="true"
            aria-label={`Close ${title}`}
            title={`Close ${title}`}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              wm.close(windowKey);
            }}
          >
            ✕
          </WinButton>
        </HeaderButtons>
      </StyledHeader>
      {toolbar}
      <StyledContent data-wtf-app-surface="true">
        <ContentScroll data-wtf-app-scroll="true">
          {adminPanelOpen && (
            <NativeAdminPanel
              path={pagePath}
              onClose={() => setAdminPanelOpen(false)}
            />
          )}
          {children}
        </ContentScroll>
      </StyledContent>
      {!effectiveMaximized && (
        <ResizeHandle onMouseDown={handleResizeStart} />
      )}
    </FloatingWindow>
  );
}
