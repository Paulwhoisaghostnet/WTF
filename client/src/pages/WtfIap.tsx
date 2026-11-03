import { useContext, useEffect, useId, useRef, useState } from "react";
import { styled } from "styled-components";
import { useLocation, useSearch } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { useWindowManager, WindowPathContext } from "../lib/window-context";
import { COLILSEUM_ROUTE, WTFIAP_ASSET_ROOT, wtfIapEntryPath, wtfIapFrameSource } from "../features/wtfiap/frame-source";
import { readWtfIapCloseFundingMessage, readWtfIapOpenFundingMessage, readWtfIapRoomMessage, wtfIapFundingRecoveryRoom, type WtfIapRoomMessage } from "../features/wtfiap/room-bridge";
import { FundingPanel } from "../features/wtfiap/FundingPanel";

const GameSurface = styled.section`
  position: relative;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #111719;
`;

const ModeNavigation = styled.nav<{ $open: boolean }>`
  position: absolute;
  inset: ${({ $open }) => $open ? "0" : "8px auto auto 8px"};
  z-index: ${({ $open }) => $open ? 60 : 40};
  display: ${({ $open }) => $open ? "grid" : "block"};
  place-items: ${({ $open }) => $open ? "center" : "initial"};
  background: ${({ $open }) => $open ? "#071514f7" : "transparent"};
  color: var(--wtf-text-color, #111);
  box-sizing: border-box;

  .menu-toggle { width: 44px; height: 44px; justify-content: center; font-size: 25px; line-height: 1; }
  ${({ $open }) => $open && `.menu-toggle { position:absolute; top:8px; left:8px; }`}
  .menu-links {
    position: ${({ $open }) => $open ? "static" : "absolute"};
    top: 48px;
    left: 0;
    width: ${({ $open }) => $open ? "min(380px, calc(100% - 32px))" : "min(280px, calc(100vw - 24px))"};
    min-width: ${({ $open }) => $open ? "min(280px, calc(100% - 32px))" : "240px"};
    display: grid;
    grid-template-columns: 1fr;
    gap: ${({ $open }) => $open ? "10px" : "4px"};
    padding: ${({ $open }) => $open ? "28px" : "8px"};
    border: 1px solid currentColor;
    background: var(--wtf-window-color, #c0c0c0);
    box-shadow: 0 12px 28px #0008;
    box-sizing: border-box;
    white-space: normal;
  }
  .menu-links strong { padding: 5px 7px; font-size: 1.2rem; }

  a, button {
    display: inline-flex;
    align-items: center;
    min-height: ${({ $open }) => $open ? "56px" : "44px"};
    padding: 8px 14px;
    border: 1px solid currentColor;
    color: var(--wtf-text-color, #111);
    text-decoration: none;
    background: transparent;
    font: inherit;
    cursor: pointer;
    box-sizing: border-box;
    white-space: nowrap;
  }

  a:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .menu-links a, .menu-links button { width: 100%; }
`;

const GameFrame = styled.iframe`
  flex: 1 1 0;
  width: 100%;
  min-width: 0;
  min-height: 0;
  border: 0;
  background: #111719;
`;

const GameWorkspace = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
`;

const FundingDock = styled.aside`
  position: relative;
  z-index: 35;
  flex: 0 0 440px;
  min-width: 0;
  overflow: auto;
  border-left: 1px solid #d9bb72;
  background: #102322;
  color: #f3ecd8;
  box-shadow: -12px 0 32px #0006;

  .dock-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center;
    justify-content: space-between; gap: 12px; padding: 10px 16px;
    background: #102322; border-bottom: 1px solid #38514e; }
  .dock-head strong { font-size: 1rem; }
  .dock-head button { min-height: 40px; padding: 6px 12px; background: #1b3336;
    border: 1px solid #92c6b6; border-radius: 4px; color: #f3ecd8; cursor: pointer; }
  .dock-head button:focus-visible { outline: 2px solid #d9bb72; outline-offset: 2px; }

  /* The board needs room to remain usable beside a 440px funding pane. */
  @container (max-width: 1100px) {
    position: absolute;
    inset: 0 0 0 auto;
    width: min(440px, 100%);
    border: 1px solid #d9bb72;
    box-shadow: -12px 0 32px #0009;
  }
  @container (max-width: 700px) {
    width: 100%;
  }
`;

export function WtfIap() {
  const frameName = `wtfiap-${useId()}`;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [room, setRoom] = useState<WtfIapRoomMessage | null>(null);
  const roomRef = useRef<WtfIapRoomMessage | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recoveryRoom, setRecoveryRoom] = useState<string | null>(null);
  const recoveryRoomRef = useRef<string | null>(null);
  const urlRecoveryRef = useRef(false);
  const receivedRoom = useRef(false);
  const windowPath = useContext(WindowPathContext);
  const windowManager = useWindowManager();
  const fittedTouchWindow = useRef(false);
  useEffect(() => {
    if (fittedTouchWindow.current) return;
    fittedTouchWindow.current = true;
    if (window.matchMedia("(any-pointer: coarse)").matches && !windowManager.getWindow(windowPath || "coLILseum").maximized) {
      windowManager.toggleMaximize(windowPath || "coLILseum");
    }
  }, [windowManager, windowPath]);
  const [activePath] = useLocation();
  const search = useSearch();
  const [entryPath, setEntryPath] = useState(() => wtfIapEntryPath(windowPath, activePath, search));
  useEffect(() => {
    if (windowPath.includes("?") || activePath === (windowPath || COLILSEUM_ROUTE)) {
      setEntryPath(wtfIapEntryPath(windowPath, activePath, search));
    }
  }, [windowPath, activePath, search]);
  const frameSource = wtfIapFrameSource(entryPath);
  const fundingRoom = room?.wagered ? room.roomCode : recoveryRoom;
  useEffect(() => {
    const code = wtfIapFundingRecoveryRoom(entryPath);
    urlRecoveryRef.current = Boolean(code);
    recoveryRoomRef.current = code; setRecoveryRoom(code);
    receivedRoom.current = false;
    if (code) setFundingOpen(true);
  }, [entryPath]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (readWtfIapCloseFundingMessage(event, frameRef.current?.contentWindow ?? null, window.location.origin)) {
        recoveryRoomRef.current = null; setRecoveryRoom(null); setFundingOpen(false);
        return;
      }
      const fundingRequest = readWtfIapOpenFundingMessage(event, frameRef.current?.contentWindow ?? null, window.location.origin);
      if (fundingRequest) {
        recoveryRoomRef.current = fundingRequest;
        setRecoveryRoom(fundingRequest);
        setFundingOpen(true);
        return;
      }
      if (event.source === frameRef.current?.contentWindow && event.origin === window.location.origin && event.data?.type === "wtfiap:open-mail-draft") {
        const { roomCode, roomType } = event.data;
        if (typeof roomCode === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomCode) && ["duel", "party", "tournament"].includes(roomType)) {
          const code = roomCode.toLowerCase();
          const subject = `Join my coLILseum ${roomType}`;
          const body = `Join my coLILseum ${roomType}. Room code: ${code}\n\n${window.location.origin}/colilseum/${code}`;
          const query = new URLSearchParams({ view: "drafts", compose: "wtfiap", subject, body });
          windowManager.openPage(`/mail?${query.toString()}`);
        }
        return;
      }
      const message = readWtfIapRoomMessage(event, frameRef.current?.contentWindow ?? null, window.location.origin);
      if (!message) return;
      if (!message.roomCode && !urlRecoveryRef.current) {
        recoveryRoomRef.current = null;
        setRecoveryRoom(null);
        setFundingOpen(false);
      }
      roomRef.current = message;
      setRoom(message);
      if ((!message.wagered || (!message.roomCode && receivedRoom.current)) && !recoveryRoomRef.current) {
        setFundingOpen(false); setRecoveryRoom(null);
      }
      if (message.roomCode) receivedRoom.current = true;
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [windowManager]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);
  function resetRoom() { roomRef.current = null; setRoom(null); recoveryRoomRef.current = null; setRecoveryRoom(null); setFundingOpen(false); receivedRoom.current = false; }
  function navigate() { resetRoom(); setMenuOpen(false); }
  return (
    <AppWindow title="coLILseum">
      <GameSurface aria-label="coLILseum" data-wtfiap-surface="true">
        <ModeNavigation $open={menuOpen} aria-label="coLILseum navigation">
          <button className="menu-toggle" type="button" aria-label={menuOpen ? "Close game menu" : "Open game menu"} aria-controls="colilseum-menu-links" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>☰</button>
          {menuOpen && <div id="colilseum-menu-links" className="menu-links"><strong>coLILseum</strong>
            <a href={`${WTFIAP_ASSET_ROOT}/welcome.html`} target={frameName} onClick={navigate}>Home</a>
            <a href={`${WTFIAP_ASSET_ROOT}/index.html`} target={frameName} onClick={navigate}>Practice</a>
            <a href={`${WTFIAP_ASSET_ROOT}/party.html`} target={frameName} onClick={navigate}>Lobby</a>
            <a href={`${WTFIAP_ASSET_ROOT}/learn.html`} target={frameName} onClick={navigate}>Learn</a>
            <a href={`${WTFIAP_ASSET_ROOT}/team-builder.html`} target={frameName} onClick={navigate}>Team Builder</a>
            {fundingRoom && <button aria-expanded={fundingOpen} onClick={() => { setFundingOpen(open => !open); setMenuOpen(false); }}>{fundingOpen ? "Return to game" : "Room funding"}</button>}
          </div>}
        </ModeNavigation>
        <GameWorkspace>
          <GameFrame
            ref={frameRef}
            onLoad={() => setMenuOpen(false)}
            name={frameName}
            title="coLILseum"
            src={frameSource}
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-orientation-lock"
            allow="fullscreen; orientation-lock; clipboard-write"
          />
          {fundingOpen && fundingRoom && <FundingDock role="region" aria-label="In-room escrow">
            <div className="dock-head"><strong>Room escrow</strong>
              <button type="button" onClick={() => setFundingOpen(false)} aria-label="Close room escrow">Back to room</button>
            </div>
            <FundingPanel key={fundingRoom} roomCode={fundingRoom}
              onReturn={() => setFundingOpen(false)} onEnterRoom={() => {
                setEntryPath(`/colilseum/${encodeURIComponent(fundingRoom)}`);
                setFundingOpen(false);
              }} />
          </FundingDock>}
        </GameWorkspace>
      </GameSurface>
    </AppWindow>
  );
}
