import { AppWindow } from "../components/layout/AppWindow";
import { WtfLiveApp } from "../features/wtf-live/WtfLiveApp";

/** Standalone WTF LIVE — public room + stage lanes via `/api/wtf-live/`. */
export function WtfLive() {
  return (
    <AppWindow title="WTF LIVE">
      <WtfLiveApp />
    </AppWindow>
  );
}
