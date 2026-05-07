import { AppWindow } from "../components/layout/AppWindow";
import { CollectionWorkspace } from "../features/ux-lab/CollectionWorkspace";

export function UxLab() {
  return (
    <AppWindow title="UX Lab">
      <CollectionWorkspace defaultTab={1} showQuickLinks surface="portfolio" />
    </AppWindow>
  );
}
