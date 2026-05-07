import { AppWindow } from "../components/layout/AppWindow";
import { CreatorComparePanel } from "../features/tezos-intel/CreatorComparePanel";
import { CreatorScorePanel } from "../features/tezos-intel/CreatorScorePanel";
import { MarketPulsePanel } from "../features/tezos-intel/MarketPulsePanel";
import { PanelGrid, PanelStack } from "../features/tezos-intel/IntelPanelChrome";

export function TezosIntel() {
  return (
    <AppWindow title="Tezos Intel">
      <PanelGrid>
        <PanelStack>
          <CreatorScorePanel />
          <CreatorComparePanel />
        </PanelStack>
        <MarketPulsePanel />
      </PanelGrid>
    </AppWindow>
  );
}
