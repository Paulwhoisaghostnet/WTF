import { useContext, useEffect, useId, useState } from "react";
import { styled } from "styled-components";
import { useLocation, useSearch } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { WindowPathContext } from "../lib/window-context";
import { WTFIAP_ASSET_ROOT, wtfIapEntryPath, wtfIapFrameSource } from "../features/wtfiap/frame-source";

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

  a {
    display: inline-flex;
    align-items: center;
    padding: 6px 10px;
    border: 1px solid currentColor;
    color: var(--wtf-text-color, #111);
    text-decoration: none;
  }

  a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
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
  const partySource = wtfIapFrameSource(entryPath, "party");
  return (
    <AppWindow title="WTFIAP-v0.01">
      <GameSurface aria-label="WTFIAP-v0.01" data-wtfiap-surface="true">
        <ModeNavigation aria-label="WTFIAP game modes">
          <a href={`${WTFIAP_ASSET_ROOT}/index.html`} target={frameName}>Local practice</a>
          <a href={partySource} target={frameName}>Party &amp; Tournament</a>
        </ModeNavigation>
        <GameFrame
          name={frameName}
          title="WTFIAP-v0.01"
          src={frameSource}
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
          allow="fullscreen; clipboard-write"
        />
      </GameSurface>
    </AppWindow>
  );
}
