import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import styled from "styled-components";
import { AppBar, Toolbar as React95Toolbar, Button, Panel, Window, WindowHeader, WindowContent } from "react95";
import { Heart, Monitor, Zap } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { MusicMiniPlayer } from "../../features/music/MusicMiniPlayer";
import { useSharedMusicPlayer } from "../../features/music/MusicPlayerContext";
import { useWallet } from "../../lib/wallet-context";
import { useWindowManager } from "../../lib/window-context";
import { useLocalization } from "../../lib/localization";
import { StartMenu } from "./StartMenu";
import { Win95ContextMenu, type Win95ContextMenuEntry } from "./Win95ContextMenu";
import { MOBILE } from "../../global-styles";
import {
  DESKTOP_WEATHER_RULES,
  type DesktopWeatherRule,
} from "../../features/desktop/environment";

const TaskbarContainer = styled.div`
  position: relative;
  z-index: 100;
  height: var(--wtf-taskbar-height, 36px);
  flex-shrink: 0;

  ${MOBILE} {
    height: var(--wtf-taskbar-mobile-height, 48px);
  }
`;

const StyledAppBar = styled(AppBar)`
  position: absolute;
  inset: 0;
  padding: var(--wtf-taskbar-padding, 0);
  border-radius: var(--wtf-taskbar-radius, 0);
  box-shadow: var(--wtf-taskbar-shadow, none);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.18), rgba(0,0,0,0.08)),
    var(--wtf-button-face, #c0c0c0);
  transition: var(--wtf-chrome-transition, none);

  html[data-wtf-appearance-style="wtf-zine"] & {
    border-top: 3px solid #000000;
  }
`;

const TaskbarToolbar = styled(React95Toolbar)`
  gap: var(--wtf-taskbar-gap, 0);

  html[data-wtf-appearance-style="wtf-aqua"] & {
    min-height: 38px;
    align-items: center;
  }
`;

const StartButton = styled(Button)`
  font-family: var(--wtf-brand-font, var(--wtf-shell-font));
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: var(--wtf-start-button-min-width, 0);
  border-radius: var(--wtf-button-radius, 0);

  html[data-wtf-appearance-style="wtf-xp"] & {
    padding-inline: 14px;
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    padding-inline: 14px;
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  ${MOBILE} {
    padding: 0 8px;
    font-size: var(--wtf-type-caption, 13px);
    min-width: 0;
  }
`;

const WindowButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
`;

const WindowButton = styled(Button)<{ $active?: boolean }>`
  max-width: 200px;
  min-width: 60px;
  min-height: 32px;
  height: 32px;
  font-family: var(--wtf-shell-font);
  font-size: var(--wtf-type-caption, 13px);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  ${(p) => p.$active && "font-weight: bold;"}
  border-radius: var(--wtf-button-radius, 0);

  html[data-wtf-appearance-style="wtf-xp"] & {
    min-height: 32px;
    height: 32px;
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    min-height: 32px;
    height: 32px;
    text-align: center;
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    text-transform: uppercase;
  }

  ${MOBILE} {
    min-width: 44px;
    min-height: 44px !important;
    height: 44px !important;
    max-width: 120px;
    font-size: var(--wtf-type-caption, 13px);
    padding: 2px 4px;
  }
`;

const SystemTray = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
`;

const ShowDesktopButton = styled(Button)`
  min-width: 32px;
  width: 32px;
  height: 32px;
  padding: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--wtf-control-radius, 0);

  svg {
    width: 16px;
    height: 16px;
  }

  ${MOBILE} {
    min-width: 44px;
    width: 44px;
    height: 44px;
  }
`;

const Clock = styled(Panel).attrs({ variant: "well" })`
  padding: 0 8px;
  font-family: var(--wtf-mono-font, var(--wtf-shell-font));
  font-size: var(--wtf-type-caption, 13px);
  min-width: 82px;
  text-align: center;
  border-radius: var(--wtf-control-radius, 0);

  ${MOBILE} {
    min-width: 64px;
    font-size: var(--wtf-type-caption, 13px);
    padding: 0 4px;
  }
`;

const WalletPanel = styled(Panel).attrs({ variant: "well" })`
  padding: 0 8px;
  font-size: var(--wtf-type-caption, 13px);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  border-radius: var(--wtf-control-radius, 0);

  ${MOBILE} { display: none; }
`;

const TrayIconButton = styled(Button)`
  min-width: 32px;
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--wtf-control-radius, 0);

  svg {
    width: 16px;
    height: 16px;
  }

  ${MOBILE} {
    min-width: 44px;
    width: 44px;
    height: 44px;
  }
`;

const WifiIcon = styled.button<{ $connected: boolean }>`
  cursor: pointer;
  font-size: 14px;
  min-width: 32px;
  height: 32px;
  padding: 0;
  line-height: 1;
  opacity: ${(p) => (p.$connected ? 1 : 0.5)};
  border: 0;
  background: transparent;
  color: var(--wtf-text-color, #111);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:hover { opacity: 1; }

  ${MOBILE} {
    min-width: 44px;
    height: 44px;
    font-size: 16px;
  }
`;

const WalletPopup = styled(Window)`
  position: absolute;
  bottom: 36px;
  right: 4px;
  width: 260px;
  z-index: 200;

  ${MOBILE} {
    width: calc(100vw - 16px);
    left: 8px;
    right: 8px;
  }
`;

const WeatherPopup = styled(Window)`
  position: absolute;
  bottom: 36px;
  right: 86px;
  width: 148px;
  z-index: 200;

  ${MOBILE} {
    width: 150px;
    right: 48px;
  }
`;

const WeatherPopupContent = styled(WindowContent)`
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const WeatherOptionButton = styled(Button)<{ $active?: boolean }>`
  justify-content: flex-start;
  min-height: 32px;
  font-size: var(--wtf-type-caption, 13px);
  border-radius: var(--wtf-control-radius, 0);
  ${(p) => (p.$active ? "font-weight: bold;" : "")}

  ${MOBILE} {
    min-height: 44px;
  }
`;

const TrayPopupCloseButton = styled(Button)`
  padding: 0;
  min-width: 32px;
  height: 32px;
  font-size: var(--wtf-type-caption, 13px);

  ${MOBILE} {
    min-width: 44px;
    height: 44px;
    font-size: 16px;
  }
`;

type TaskbarProps = {
  hamsterCareEnabled?: boolean;
  hamsterCareOpen?: boolean;
  onToggleHamsterCare?: () => void;
  weatherRule?: DesktopWeatherRule;
  onWeatherRuleChange?: (rule: DesktopWeatherRule) => void;
};

export function Taskbar({
  hamsterCareEnabled = false,
  hamsterCareOpen = false,
  onToggleHamsterCare,
  weatherRule = "off",
  onWeatherRuleChange,
}: TaskbarProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [walletPopupOpen, setWalletPopupOpen] = useState(false);
  const [weatherPopupOpen, setWeatherPopupOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entries: Win95ContextMenuEntry[];
  } | null>(null);
  const [time, setTime] = useState(new Date());
  const { user } = useAuth();
  const musicPlayer = useSharedMusicPlayer();
  const { address, isConnecting, connect, disconnect } = useWallet();
  const wm = useWindowManager();
  const { t, translateSystemText, formatDate } = useLocalization();
  const popupRef = useRef<HTMLDivElement>(null);
  const weatherPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!walletPopupOpen && !weatherPopupOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = "touches" in e ? e.touches[0]?.target : e.target;
      const targetElement = target instanceof HTMLElement ? target : null;
      if (targetElement?.closest("[data-wallet-tray-toggle='true'], [data-weather-tray-toggle='true']")) {
        return;
      }
      if (walletPopupOpen && popupRef.current && !popupRef.current.contains(target as Node)) {
        setWalletPopupOpen(false);
      }
      if (
        weatherPopupOpen &&
        weatherPopupRef.current &&
        !weatherPopupRef.current.contains(target as Node)
      ) {
        setWeatherPopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [walletPopupOpen, weatherPopupOpen]);

  const handleWindowButton = (path: string) => {
    const isFocused = wm.focusedPath === path && !wm.isMinimized(path);
    if (isFocused) {
      wm.minimize(path);
    } else if (wm.isMinimized(path)) {
      wm.restore(path);
    } else {
      wm.focus(path);
    }
  };

  const handleWindowAuxClick = (event: ReactMouseEvent, path: string) => {
    if (event.button !== 1) return;
    event.preventDefault();
    wm.close(path);
  };

  const openWindowContextMenu = (event: ReactMouseEvent, path: string) => {
    event.preventDefault();
    event.stopPropagation();
    const minimized = wm.isMinimized(path);
    const focused = wm.focusedPath === path && !minimized;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        {
          label: minimized ? t("taskbar.context.restore") : t("taskbar.context.focus"),
          disabled: focused,
          onSelect: () => (minimized ? wm.restore(path) : wm.focus(path)),
        },
        {
          label: t("taskbar.context.minimize"),
          disabled: minimized,
          onSelect: () => wm.minimize(path),
        },
        { kind: "separator" },
        {
          label: t("taskbar.context.close"),
          onSelect: () => wm.close(path),
        },
      ],
    });
  };

  return (
    <TaskbarContainer>
      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      <StyledAppBar>
        <TaskbarToolbar>
          <StartButton
            onClick={() => setStartOpen(!startOpen)}
            active={startOpen ? true : undefined}
            aria-label={t("taskbar.openStart")}
            size="sm"
            data-reggie-anchor="start-button"
          >
            {t("taskbar.start")}
          </StartButton>

          <WindowButtons>
            {wm.openPages.map((path) => {
              const title = translateSystemText(
                wm.titles[path] || path.replace(/^\//, "") || "Window"
              );
              const isActive = wm.focusedPath === path && !wm.isMinimized(path);
              const action = isActive
                ? t("taskbar.windowAction.minimize")
                : t("taskbar.windowAction.focus");
              return (
                <WindowButton
                  key={path}
                  size="sm"
                  $active={isActive}
                  active={isActive ? true : undefined}
                  title={t("taskbar.windowTitle", { title, action })}
                  onClick={(event: ReactMouseEvent) => {
                    if (event.shiftKey) {
                      openWindowContextMenu(event, path);
                      return;
                    }
                    handleWindowButton(path);
                  }}
                  onAuxClick={(event: ReactMouseEvent) => handleWindowAuxClick(event, path)}
                  onContextMenu={(event: ReactMouseEvent) => openWindowContextMenu(event, path)}
                >
                  {title}
                </WindowButton>
              );
            })}
          </WindowButtons>

          <SystemTray>
            <MusicMiniPlayer player={musicPlayer} />
            <ShowDesktopButton
              data-compact-control="true"
              size="sm"
              active={wm.allWindowsMinimized ? true : undefined}
              aria-label={wm.allWindowsMinimized ? t("taskbar.restoreWindows") : t("taskbar.showDesktop")}
              aria-pressed={wm.allWindowsMinimized}
              title={wm.allWindowsMinimized ? t("taskbar.restoreWindows") : t("taskbar.showDesktop")}
              onClick={() => {
                setStartOpen(false);
                setWalletPopupOpen(false);
                setWeatherPopupOpen(false);
                wm.toggleShowDesktop();
              }}
            >
              <Monitor />
            </ShowDesktopButton>
            {user && (
              <WalletPanel title={user.username}>
                {user.displayName || user.username} [{user.role}]
              </WalletPanel>
            )}
            {hamsterCareEnabled && (
              <TrayIconButton
                data-compact-control="true"
                data-reggie-anchor="pet-tray"
                size="sm"
                active={hamsterCareOpen ? true : undefined}
                aria-label={t("taskbar.petCare")}
                aria-pressed={hamsterCareOpen}
                title={t("taskbar.petCare")}
                onClick={() => {
                  setWalletPopupOpen(false);
                  setWeatherPopupOpen(false);
                  onToggleHamsterCare?.();
                }}
              >
                <Heart />
              </TrayIconButton>
            )}
            {onWeatherRuleChange && (
              <TrayIconButton
                data-compact-control="true"
                data-weather-tray-toggle="true"
                size="sm"
                active={weatherPopupOpen || weatherRule !== "off" ? true : undefined}
                aria-label={t("taskbar.weather")}
                aria-expanded={weatherPopupOpen}
                aria-pressed={weatherRule !== "off"}
                title={t("taskbar.weatherState", { rule: weatherRule })}
                onClick={() => {
                  setWalletPopupOpen(false);
                  setWeatherPopupOpen((open) => !open);
                }}
              >
                <Zap />
              </TrayIconButton>
            )}
            <WifiIcon
              type="button"
              data-wallet-tray-toggle="true"
              $connected={!!address}
              aria-label={address ? t("taskbar.walletTrayOpen") : t("taskbar.walletConnectionTrayOpen")}
              aria-expanded={walletPopupOpen}
              onClick={() => {
                setWeatherPopupOpen(false);
                setWalletPopupOpen((v) => !v);
              }}
              title={address ? t("taskbar.walletConnectedTitle", { address }) : t("taskbar.walletDisconnectedTitle")}
            >
              {address ? "📶" : "📡"}
            </WifiIcon>
            <Clock>
              {formatDate(time, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Clock>
          </SystemTray>
        </TaskbarToolbar>
      </StyledAppBar>

      {walletPopupOpen && (
        <WalletPopup ref={popupRef as any}>
          <WindowHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--wtf-type-caption, 13px)" }}>{t("taskbar.wallet")}</span>
            <TrayPopupCloseButton
              size="sm"
              aria-label={t("taskbar.walletTrayClose")}
              onClick={() => setWalletPopupOpen(false)}
            >
              ✕
            </TrayPopupCloseButton>
          </WindowHeader>
          <WindowContent style={{ padding: 10 }}>
            {address ? (
              <>
                <div style={{ fontSize: "var(--wtf-type-caption, 13px)", marginBottom: 6, color: "#008000", fontWeight: "bold" }}>
                  {t("taskbar.walletConnected")}
                </div>
                <div style={{ fontSize: "var(--wtf-type-caption, 13px)", fontFamily: "var(--wtf-mono-font)", wordBreak: "break-all", marginBottom: 8 }}>
                  {address}
                </div>
                <Button
                  size="sm"
                  fullWidth
                  onClick={async () => {
                    await disconnect();
                    setWalletPopupOpen(false);
                  }}
                >
                  {t("taskbar.walletDisconnect")}
                </Button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "var(--wtf-type-caption, 13px)", marginBottom: 6, color: "#808080" }}>
                  {t("taskbar.walletNoConnection")}
                </div>
                <Button
                  size="sm"
                  fullWidth
                  disabled={isConnecting}
                  onClick={async () => {
                    await connect();
                    setWalletPopupOpen(false);
                  }}
                >
                  {isConnecting ? t("taskbar.walletConnecting") : t("taskbar.walletConnect")}
                </Button>
              </>
            )}
          </WindowContent>
        </WalletPopup>
      )}
      {weatherPopupOpen && onWeatherRuleChange && (
        <WeatherPopup ref={weatherPopupRef as any}>
          <WindowHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--wtf-type-caption, 13px)" }}>WX</span>
            <TrayPopupCloseButton
              size="sm"
              aria-label={t("taskbar.weatherClose")}
              onClick={() => setWeatherPopupOpen(false)}
            >
              ✕
            </TrayPopupCloseButton>
          </WindowHeader>
          <WeatherPopupContent>
            {DESKTOP_WEATHER_RULES.map((rule) => {
              const active = weatherRule === rule;
              const label =
                rule === "off"
                  ? t("taskbar.weather.off")
                  : rule === "gentle"
                    ? t("taskbar.weather.gentle")
                    : t("taskbar.weather.stormy");
              return (
                <WeatherOptionButton
                  key={rule}
                  data-compact-control="true"
                  size="sm"
                  $active={active}
                  active={active ? true : undefined}
                  aria-label={t("taskbar.weatherSet", { label })}
                  onClick={() => onWeatherRuleChange(rule)}
                >
                  {label}
                </WeatherOptionButton>
              );
            })}
          </WeatherPopupContent>
        </WeatherPopup>
      )}
      {contextMenu && (
        <Win95ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entries={contextMenu.entries}
          onClose={() => setContextMenu(null)}
        />
      )}
    </TaskbarContainer>
  );
}
