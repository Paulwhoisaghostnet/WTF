import { useContext, useEffect, useId, useRef, useState } from "react";
import { styled } from "styled-components";
import { useLocation, useSearch } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { WindowPathContext } from "../lib/window-context";
import { WTFIAP_ASSET_ROOT, wtfIapEntryPath, wtfIapFrameSource } from "../features/wtfiap/frame-source";
import { readWtfIapRoomMessage, wtfIapFundingRecoveryRoom, type WtfIapRoomMessage } from "../features/wtfiap/room-bridge";
import { FundingPanel } from "../features/wtfiap/FundingPanel";

const GameSurface = styled.section`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #111719;
`;

const ModeNavigation = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background: var(--wtf-window-color, #c0c0c0);

  .group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .group + .group { border-left: 1px solid currentColor; padding-left: 8px; }
  .group-label { color: var(--wtf-text-color, #111); font-weight: 700; margin-right: 2px; }

  a, button {
    display: inline-flex;
    align-items: center;
    padding: 6px 10px;
    border: 1px solid currentColor;
    color: var(--wtf-text-color, #111);
    text-decoration: none;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  a:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
`;

const GameFrame = styled.iframe`
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
  background: #111719;
`;

export function WtfIap() {
  const frameName = `wtfiap-${useId()}`;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [room, setRoom] = useState<WtfIapRoomMessage | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [recoveryRoom, setRecoveryRoom] = useState<string | null>(null);
  const receivedRoom = useRef(false);
  const windowPath = useContext(WindowPathContext);
  const [activePath] = useLocation();
  const search = useSearch();
  const [entryPath, setEntryPath] = useState(() => wtfIapEntryPath(windowPath, activePath, search));
  useEffect(() => {
    if (windowPath.includes("?") || activePath === (windowPath || "/wtfiap")) {
      setEntryPath(wtfIapEntryPath(windowPath, activePath, search));
    }
  }, [windowPath, activePath, search]);
  const frameSource = wtfIapFrameSource(entryPath);
  const fundingRoom = room?.roomType === "tournament" ? room.roomCode : recoveryRoom;
  useEffect(() => {
    const code = wtfIapFundingRecoveryRoom(entryPath);
    setRecoveryRoom(code);
    receivedRoom.current = false;
    if (code) setFundingOpen(true);
  }, [entryPath]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = readWtfIapRoomMessage(event, frameRef.current?.contentWindow ?? null, window.location.origin);
      if (!message) return;
      setRoom(message);
      if (message.roomType === "party" || message.roomType === "duel" || (!message.roomCode && receivedRoom.current)) { setFundingOpen(false); setRecoveryRoom(null); }
      if (message.roomCode) receivedRoom.current = true;
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  function resetRoom() { setRoom(null); setRecoveryRoom(null); setFundingOpen(false); receivedRoom.current = false; }
  return (
    <AppWindow title="coLILseum">
      <GameSurface aria-label="coLILseum" data-wtfiap-surface="true">
        <ModeNavigation aria-label="coLILseum game modes">
          <div className="group"><span className="group-label">Play</span>
            <a href={`${WTFIAP_ASSET_ROOT}/index.html`} target={frameName} onClick={resetRoom}>Practice</a>
            <a href={`${WTFIAP_ASSET_ROOT}/party.html?mode=duel`} target={frameName} onClick={resetRoom}>Duel</a>
            <a href={`${WTFIAP_ASSET_ROOT}/party.html?mode=party`} target={frameName} onClick={resetRoom}>Party</a>
            <a href={`${WTFIAP_ASSET_ROOT}/party.html?mode=tournament`} target={frameName} onClick={resetRoom}>Tournament</a>
          </div>
          <div className="group"><span className="group-label">Explore</span>
            <a href={`${WTFIAP_ASSET_ROOT}/cast.html`} target={frameName} onClick={resetRoom}>Meet the heroes</a>
          </div>
          {fundingRoom && <button aria-expanded={fundingOpen} onClick={() => setFundingOpen(open => !open)}>{fundingOpen ? "Return to game" : "Room funding"}</button>}
        </ModeNavigation>
        {fundingOpen && fundingRoom && <FundingPanel key={fundingRoom} roomCode={fundingRoom} onReturn={() => setFundingOpen(false)} />}
        <GameFrame
          ref={frameRef}
          style={fundingOpen ? { display: "none" } : undefined}
          name={frameName}
          title="coLILseum"
          src={frameSource}
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-orientation-lock"
          allow="fullscreen; orientation-lock; clipboard-write"
        />
      </GameSurface>
    </AppWindow>
  );
}
