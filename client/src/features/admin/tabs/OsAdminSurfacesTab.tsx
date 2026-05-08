import { Button, GroupBox, Table, TableBody, TableDataCell, TableHead, TableHeadCell, TableRow } from "react95";
import styled from "styled-components";
import { DESKTOP_APP_LABELS } from "@shared/types";
import type { DesktopAppKey } from "@shared/types";
import { useWindowManager } from "../../../lib/window-context";
import { ALL_ADMIN_SURFACES, surfacesByDomain } from "../../admin-os/admin-surface-registry";
import type { DesktopAppsResponse, DesktopAppUpdatePayload } from "../types";

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type OsAdminSurfacesTabProps = {
  desktopApps: DesktopAppsResponse | undefined;
  updateDesktopAppMutation: AdminMutation<DesktopAppUpdatePayload>;
};

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const SurfaceSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
`;

const SummaryCell = styled.div`
  border: 2px inset #fff;
  background: #efefef;
  padding: 8px;
`;

function surfaceRoute(surface: (typeof ALL_ADMIN_SURFACES)[number]) {
  const route = surface.routePatterns.find((pattern) => pattern.startsWith("/"));
  if (!route || route.includes(":")) return null;
  return route;
}

export function OsAdminSurfacesTab({
  desktopApps,
  updateDesktopAppMutation,
}: OsAdminSurfacesTabProps) {
  const wm = useWindowManager();
  const domains = surfacesByDomain();
  const desktopAppState = (desktopApps?.apps ?? {}) as Partial<
    Record<DesktopAppKey, boolean>
  >;

  return (
    <>
      <h3>WTF OS Admin Surfaces</h3>
      <p style={{ marginBottom: 8, fontSize: 12, color: "#444" }}>
        Strict-admin registry for every WTF OS app, tool, public surface, desktop item,
        and operator screen. Native app windows use this same registry for their local
        Admin settings panel.
      </p>

      <SurfaceSummary>
        {Object.entries(domains).map(([domain, surfaces]) => (
          <SummaryCell key={domain}>
            <strong>{domain}</strong>
            <div>{surfaces.length} surfaces</div>
          </SummaryCell>
        ))}
      </SurfaceSummary>

      <GroupBox label="Surface Coverage">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell>Surface</TableHeadCell>
              <TableHeadCell>Domain</TableHeadCell>
              <TableHeadCell>Settings</TableHeadCell>
              <TableHeadCell>Automation Handles</TableHeadCell>
              <TableHeadCell>Admin Control</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ALL_ADMIN_SURFACES.map((surface) => {
              const route = surfaceRoute(surface);
              const enabled = surface.desktopAppKey
                ? desktopAppState[surface.desktopAppKey]
                : undefined;
              return (
                <TableRow key={surface.id}>
                  <TableDataCell>
                    <strong>{surface.label}</strong>
                    <div style={{ fontSize: 11 }}>{surface.kind}</div>
                    <div style={{ fontSize: 11 }}>{surface.routePatterns.join(", ")}</div>
                  </TableDataCell>
                  <TableDataCell>
                    {surface.domain}
                    <div style={{ fontSize: 11 }}>{surface.subdomain}</div>
                  </TableDataCell>
                  <TableDataCell style={{ maxWidth: 260 }}>
                    {surface.nativeSettings.join(", ")}
                  </TableDataCell>
                  <TableDataCell style={{ maxWidth: 260 }}>
                    {surface.automationHandles.join(", ")}
                  </TableDataCell>
                  <TableDataCell>
                    <ActionRow>
                      {route && (
                        <Button size="sm" onClick={() => wm.openPage(route)}>
                          Open
                        </Button>
                      )}
                      <Button size="sm" onClick={() => wm.openPage("/admin")}>
                        Admin
                      </Button>
                      {surface.desktopAppKey && enabled !== undefined && (
                        <Button
                          size="sm"
                          disabled={updateDesktopAppMutation.isPending}
                          onClick={() =>
                            updateDesktopAppMutation.mutate({
                              appKey: surface.desktopAppKey!,
                              enabled: !enabled,
                            })
                          }
                        >
                          {DESKTOP_APP_LABELS[surface.desktopAppKey]}{" "}
                          {enabled ? "Off" : "On"}
                        </Button>
                      )}
                    </ActionRow>
                  </TableDataCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </GroupBox>
    </>
  );
}
