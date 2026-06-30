import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { CreatorComparePanel } from "../features/tezos-intel/CreatorComparePanel";
import { CreatorScorePanel } from "../features/tezos-intel/CreatorScorePanel";
import { MarketPulsePanel } from "../features/tezos-intel/MarketPulsePanel";
import { PanelGrid, PanelStack } from "../features/tezos-intel/IntelPanelChrome";
import { usePresentationShell } from "../lib/presentation-shell";

const IntelShell = styled.div`
  min-height: 100%;

  &[data-tezos-intel-presentation-host="gamma"] {
    min-height: 100%;
    padding: 16px;
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    font-family: var(--wtf-sans-font, Inter, "Segoe UI", system-ui, sans-serif);
  }

  &[data-tezos-intel-presentation-host="gamma"],
  &[data-tezos-intel-presentation-host="gamma"] * {
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-tezos-intel-presentation-host="gamma"] [data-tezos-intel-region] {
    background-image: none !important;
    border-color: rgba(242, 234, 217, 0.16) !important;
    border-width: 1px !important;
    border-radius: 6px !important;
  }

  &[data-tezos-intel-presentation-host="gamma"] :where(section, input, textarea, button) {
    background-image: none !important;
    background-color: #11110f !important;
    color: #f2ead9 !important;
    border-color: rgba(242, 234, 217, 0.18) !important;
    border-width: 1px !important;
    border-radius: 6px !important;
    font-family: inherit !important;
  }

  &[data-tezos-intel-presentation-host="gamma"] :where(h3) {
    background: #0d0d0b !important;
    color: #fff7e8 !important;
    border-bottom: 1px solid rgba(0, 210, 255, 0.45);
  }

  &[data-tezos-intel-presentation-host="gamma"] :where(input:focus, textarea:focus, button:hover) {
    border-color: #00d2ff !important;
    outline: 1px solid rgba(0, 210, 255, 0.5);
    outline-offset: 1px;
  }

  &[data-tezos-intel-presentation-host="gamma"] [data-tezos-intel-region="metric-value"] {
    color: #d6ff3f;
  }

  &[data-tezos-intel-presentation-host="gamma"] [data-tezos-intel-region="muted"] {
    color: rgba(242, 234, 217, 0.72);
  }
`;

export function TezosIntel() {
  const presentation = usePresentationShell();

  return (
    <AppWindow title="Tezos Intel">
      <IntelShell
        data-tezos-intel-surface="market-intel"
        data-tezos-intel-presentation-host={presentation.host}
        data-tezos-intel-region="surface"
      >
        <PanelGrid data-tezos-intel-region="grid">
          <PanelStack>
            <CreatorScorePanel />
            <CreatorComparePanel />
          </PanelStack>
          <MarketPulsePanel />
        </PanelGrid>
      </IntelShell>
    </AppWindow>
  );
}
