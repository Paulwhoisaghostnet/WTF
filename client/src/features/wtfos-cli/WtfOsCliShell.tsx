import { useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../lib/auth-context";
import { logClientSystemEvent } from "../../lib/system-log";
import { getInterfaceMode, setInterfaceMode } from "./interface-mode";
import { useQuery } from "@tanstack/react-query";
import type { DesktopAppKey } from "@shared/types";
import { api } from "../../lib/api";
import { WtfOsCliPanel } from "./WtfOsCliPanel";

export function WtfOsCliShell() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const desktopAppsQuery = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () =>
      api.get<{ apps: Record<DesktopAppKey, boolean> }>("/api/apps/desktop"),
    staleTime: 30_000,
  });

  const onViewed = useCallback(() => {
    logClientSystemEvent({ eventType: "cli.viewed" });
  }, []);

  return (
    <WtfOsCliPanel
      variant="fullscreen"
      testId="wtf-cli-shell"
      prompt="wtf>"
      eventPrefix="cli"
      bootMessage="wtfOS CLI shell ready. Type `help` or `banner`."
      navigate={setLocation}
      setInterfaceMode={setInterfaceMode}
      getInterfaceMode={getInterfaceMode}
      username={user?.username ?? null}
      displayName={user?.displayName ?? user?.name ?? null}
      role={user?.roles ?? user?.role ?? null}
      accessSurfaceIds={user?.wtfOsAccess?.surfaceIds ?? []}
      appAvailability={desktopAppsQuery.data?.apps ?? {}}
      onViewed={onViewed}
    />
  );
}
