import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Select } from "react95";
import styled from "styled-components";
import { DESKTOP_APP_LABELS } from "@shared/types";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWindowManager } from "../../lib/window-context";
import { findAdminSurfaceForPath, type AdminSurface } from "./admin-surface-registry";
import { adminSectionHrefForPanelLabel } from "../admin/admin-section-catalog";

const Panel = styled.div`
  border: 2px inset #fff;
  background: #d8d8d8;
  color: #111;
  padding: 8px;
  margin-bottom: 8px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
`;

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const Tag = styled.span`
  display: inline-block;
  border: 1px solid #808080;
  background: #efefef;
  padding: 2px 5px;
  font-size: 11px;
`;

type DesktopAppsResponse = {
  apps: Record<string, boolean>;
  list: Array<{ key: string; enabled: boolean }>;
};

function NativeSettings({ surface }: { surface: AdminSurface }) {
  return (
    <TagList>
      {surface.nativeSettings.map((setting) => (
        <Tag key={setting}>{setting}</Tag>
      ))}
    </TagList>
  );
}

function AutomationHandles({ surface }: { surface: AdminSurface }) {
  return (
    <TagList>
      {surface.automationHandles.map((handle) => (
        <Tag key={handle}>{handle}</Tag>
      ))}
    </TagList>
  );
}

export function NativeAdminPanel({
  path,
  onClose,
}: {
  path: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const wm = useWindowManager();
  const qc = useQueryClient();
  const surface = findAdminSurfaceForPath(path);
  const isStrictAdmin = user?.role === "admin";
  const [selectedPanel, setSelectedPanel] = useState("");

  useEffect(() => {
    setSelectedPanel(surface?.adminPanelTabs[0] ?? "OS Admin");
  }, [surface?.id]);

  const desktopAppsQuery = useQuery({
    queryKey: ["admin", "native", "desktop-apps"],
    queryFn: () => api.get<DesktopAppsResponse>("/api/admin/apps/desktop"),
    enabled: isStrictAdmin && Boolean(surface?.desktopAppKey),
  });

  const toggleDesktopAppMutation = useMutation({
    mutationFn: ({ appKey, enabled }: { appKey: string; enabled: boolean }) =>
      api.put(`/api/admin/apps/desktop/${appKey}`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "native", "desktop-apps"] });
      qc.invalidateQueries({ queryKey: ["admin", "desktop-apps"] });
      qc.invalidateQueries({ queryKey: ["desktop", "apps"] });
    },
  });

  if (!isStrictAdmin || !surface) return null;

  const desktopEnabled = surface.desktopAppKey
    ? desktopAppsQuery.data?.apps?.[surface.desktopAppKey]
    : undefined;
  const effectiveSelectedPanel =
    selectedPanel || surface.adminPanelTabs[0] || "OS Admin";
  const selectedAdminHref = adminSectionHrefForPanelLabel(effectiveSelectedPanel);
  const uiAdminRoutes = (surface.adminRoutes ?? []).filter((route) => !route.startsWith("/api/"));
  const apiAdminRoutes = (surface.adminRoutes ?? []).filter((route) => route.startsWith("/api/"));

  return (
    <Panel>
      <Header>
        <div>
          <strong>{surface.label} Admin</strong>
          <div style={{ fontSize: 12 }}>
            {surface.domain} / {surface.subdomain}
          </div>
        </div>
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </Header>

      <Grid>
        <GroupBox label="Settings">
          <NativeSettings surface={surface} />
          {surface.desktopAppKey && desktopEnabled !== undefined && (
            <div style={{ marginTop: 8 }}>
              <Button
                size="sm"
                title={`${DESKTOP_APP_LABELS[surface.desktopAppKey]} launchers are ${desktopEnabled ? "shown" : "hidden"}`}
                disabled={toggleDesktopAppMutation.isPending}
                onClick={() =>
                  toggleDesktopAppMutation.mutate({
                    appKey: surface.desktopAppKey!,
                    enabled: !desktopEnabled,
                  })
                }
              >
                {DESKTOP_APP_LABELS[surface.desktopAppKey]}:{" "}
                {desktopEnabled ? "Shown" : "Hidden"}
              </Button>
            </div>
          )}
        </GroupBox>

        <GroupBox label="Automation">
          <AutomationHandles surface={surface} />
          <div style={{ marginTop: 8 }}>
            <Button size="sm" onClick={() => wm.openPage("/admin?section=automation")}>
              Open Automation
            </Button>
          </div>
        </GroupBox>

        <GroupBox label="Admin Panel">
          <Select
            value={effectiveSelectedPanel}
            onChange={(event: any) => setSelectedPanel(String(event.value || "OS Admin"))}
            options={surface.adminPanelTabs.map((tab) => ({ label: tab, value: tab }))}
            width={180}
          />
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button size="sm" onClick={() => wm.openPage(selectedAdminHref)}>
              Open {effectiveSelectedPanel}
            </Button>
            <Button size="sm" onClick={() => wm.openPage(`/admin?section=help&q=${encodeURIComponent(surface.id)}`)}>
              Find in Help
            </Button>
            {uiAdminRoutes.map((route) => (
              <Button key={route} size="sm" onClick={() => wm.openPage(route)}>
                {route}
              </Button>
            ))}
          </div>
          {apiAdminRoutes.length ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Admin APIs</div>
              <TagList>
                {apiAdminRoutes.map((route) => <Tag key={route}>{route}</Tag>)}
              </TagList>
            </div>
          ) : null}
        </GroupBox>
      </Grid>
    </Panel>
  );
}
