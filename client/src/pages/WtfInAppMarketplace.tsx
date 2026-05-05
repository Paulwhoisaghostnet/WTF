import { AppWindow } from "../components/layout/AppWindow";
import { WtfIamShell } from "../features/wtfiam/WtfIamShell";

export function WtfInAppMarketplace() {
  return (
    <AppWindow title="WTF In-App Marketplace">
      <WtfIamShell />
    </AppWindow>
  );
}
