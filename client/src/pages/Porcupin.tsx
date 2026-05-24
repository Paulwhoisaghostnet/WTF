import { AppWindow } from "../components/layout/AppWindow";
import { PorcupinSetupWizard } from "../features/porcupin/PorcupinSetupWizard";
import { PorcupinDashboard } from "../features/porcupin/PorcupinDashboard";
import { useWindowManager } from "../lib/window-context";
import { usePorcupinConnection } from "../features/porcupin/usePorcupin";

interface Props {
  mode?: "setup" | "dashboard";
}

export function Porcupin({ mode }: Props) {
  const connQ = usePorcupinConnection();
  const wm = useWindowManager();

  const isSetup = mode === "setup" || (!connQ.data && !connQ.isLoading);
  const title = isSetup ? "Porcupin — Setup Wizard" : "Porcupin Dashboard";

  return (
    <AppWindow title={title}>
      {isSetup ? (
        <PorcupinSetupWizard onComplete={() => wm.openPage("/apps/porcupin-dashboard")} />
      ) : (
        <PorcupinDashboard />
      )}
    </AppWindow>
  );
}
