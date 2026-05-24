import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import styled from "styled-components";
import { AppBar, Toolbar, Button, Panel, Window, WindowHeader, WindowContent } from "react95";
import { Heart, Monitor } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { MusicMiniPlayer } from "../../features/music/MusicMiniPlayer";
import { useSharedMusicPlayer } from "../../features/music/MusicPlayerContext";
import { useWallet } from "../../lib/wallet-context";
import { useWindowManager } from "../../lib/window-context";
import { StartMenu } from "./StartMenu";
import { Win95ContextMenu, type Win95ContextMenuEntry } from "./Win95ContextMenu";
import { MOBILE } from "../../global-styles";

const TaskbarContainer = styled.div`
  position: relative;
  z-index: 100;
`;

const StartButton = styled(Button)`
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;

  ${MOBILE} {
    padding: 0 8px;
    font-size: 12px;
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
  font-size: 11px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  ${(p) => p.$active && "font-weight: bold;"}

  ${MOBILE} {
    min-width: 40px;
    max-width: 120px;
    font-size: 10px;
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
  min-width: 18px;
  width: 18px;
  height: 24px;
  padding: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 12px;
    height: 12px;
  }

  ${MOBILE} {
    width: 24px;
    height: 26px;
  }
`;

const Clock = styled(Panel).attrs({ variant: "well" })`
  padding: 0 8px;
  font-size: 12px;
  min-width: 70px;
  text-align: center;

  ${MOBILE} {
    min-width: 54px;
    font-size: 11px;
    padding: 0 4px;
  }
`;

const WalletPanel = styled(Panel).attrs({ variant: "well" })`
  padding: 0 8px;
  font-size: 11px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;

  ${MOBILE} { display: none; }
`;

const TrayIconButton = styled(Button)`
  min-width: 28px;
  width: 28px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 15px;
    height: 15px;
  }

  ${MOBILE} {
    width: 30px;
    height: 26px;
  }
`;

const WifiIcon = styled.div<{ $connected: boolean }>`
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
  opacity: ${(p) => (p.$connected ? 1 : 0.5)};
  &:hover { opacity: 1; }

  ${MOBILE} { font-size: 16px; padding: 0 6px; }
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

type TaskbarProps = {
  hamsterCareEnabled?: boolean;
  hamsterCareOpen?: boolean;
  onToggleHamsterCare?: () => void;
};

export function Taskbar({
  hamsterCareEnabled = false,
  hamsterCareOpen = false,
  onToggleHamsterCare,
}: TaskbarProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [walletPopupOpen, setWalletPopupOpen] = useState(false);
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
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!walletPopupOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = "touches" in e ? e.touches[0]?.target : e.target;
      if (popupRef.current && !popupRef.current.contains(target as Node)) {
        setWalletPopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [walletPopupOpen]);

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
          label: minimized ? "Restore" : "Focus",
          disabled: focused,
          onSelect: () => (minimized ? wm.restore(path) : wm.focus(path)),
        },
        {
          label: "Minimize",
          disabled: minimized,
          onSelect: () => wm.minimize(path),
        },
        { kind: "separator" },
        {
          label: "Close",
          onSelect: () => wm.close(path),
        },
      ],
    });
  };

  return (
    <TaskbarContainer>
      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      <AppBar style={{ position: "relative" }}>
        <Toolbar>
          <StartButton
            onClick={() => setStartOpen(!startOpen)}
            active={startOpen ? true : undefined}
            aria-label="Open Stuffs menu"
            size="sm"
          >
            Stuffs
          </StartButton>

          <WindowButtons>
            {wm.openPages.map((path) => {
              const title = wm.titles[path] || path.replace(/^\//, "") || "Window";
              const isActive = wm.focusedPath === path && !wm.isMinimized(path);
              return (
                <WindowButton
                  key={path}
                  size="sm"
                  $active={isActive}
                  active={isActive ? true : undefined}
                  title={`${title} - click to ${isActive ? "minimize" : "focus"}, middle-click to close`}
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
              aria-label={wm.allWindowsMinimized ? "Restore windows" : "Show desktop"}
              aria-pressed={wm.allWindowsMinimized}
              title={wm.allWindowsMinimized ? "Restore windows" : "Show desktop"}
              onClick={() => {
                setStartOpen(false);
                setWalletPopupOpen(false);
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
                size="sm"
                active={hamsterCareOpen ? true : undefined}
                aria-label="Pet care"
                aria-pressed={hamsterCareOpen}
                title="Pet care"
                onClick={() => {
                  setWalletPopupOpen(false);
                  onToggleHamsterCare?.();
                }}
              >
                <Heart />
              </TrayIconButton>
            )}
            <WifiIcon
              $connected={!!address}
              onClick={() => setWalletPopupOpen((v) => !v)}
              title={address ? `Connected: ${address}` : "Wallet not connected"}
            >
              {address ? "📶" : "📡"}
            </WifiIcon>
            <Clock>
              {time.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Clock>
          </SystemTray>
        </Toolbar>
      </AppBar>

      {walletPopupOpen && (
        <WalletPopup ref={popupRef as any}>
          <WindowHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12 }}>Wallet</span>
            <Button
              size="sm"
              style={{ padding: "0 4px", minWidth: 18, height: 18, fontSize: 10 }}
              onClick={() => setWalletPopupOpen(false)}
            >
              ✕
            </Button>
          </WindowHeader>
          <WindowContent style={{ padding: 10 }}>
            {address ? (
              <>
                <div style={{ fontSize: 11, marginBottom: 6, color: "#008000", fontWeight: "bold" }}>
                  Connected
                </div>
                <div style={{ fontSize: 10, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 8 }}>
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
                  Disconnect Wallet
                </Button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, marginBottom: 6, color: "#808080" }}>
                  No wallet connected
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
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </Button>
              </>
            )}
          </WindowContent>
        </WalletPopup>
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
