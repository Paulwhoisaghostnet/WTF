import { AppWindow } from "../components/layout/AppWindow";
import { AnchorDownloadCenter } from "../features/anchor/AnchorDownloadCenter";

export function Anchor() {
  return (
    <AppWindow title="Anchor">
      <AnchorDownloadCenter />
    </AppWindow>
  );
}
