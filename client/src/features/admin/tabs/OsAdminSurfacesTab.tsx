import { Table, TableBody, TableDataCell, TableHead, TableHeadCell, TableRow } from "react95";
import styled from "styled-components";
import { DESKTOP_APP_LABELS } from "@shared/types";
import type { DesktopAppKey } from "@shared/types";
import { UiButton, UiPanel } from "../../../components/wtfos-ui";
import { useWindowManager } from "../../../lib/window-context";
import {
  ALL_ADMIN_SURFACES,
  getAdminSurfaceDoctrineDomain,
  surfacesByDomain,
} from "../../admin-os/admin-surface-registry";
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
  gap: var(--wtf-space-2, 8px);
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
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: var(--wtf-space-2, 8px);
`;

const Intro = styled.p`
  margin: 0 0 var(--wtf-space-2, 8px);
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const MetaLine = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
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
      <Intro>
        Strict-admin registry for every WTF OS app, tool, public surface, desktop item,
        and operator screen. Native app windows use this same registry for their local
        Admin settings panel.
      </Intro>

      <SurfaceSummary>
        {Object.entries(domains).map(([domain, surfaces]) => (
          <SummaryCell key={domain}>
            <strong>{domain}</strong>
            <div>{surfaces.length} surfaces</div>
          </SummaryCell>
        ))}
      </SurfaceSummary>

      <UiPanel title="Surface coverage" compact>
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
              const doctrine = getAdminSurfaceDoctrineDomain(surface);
              const enabled = surface.desktopAppKey
                ? desktopAppState[surface.desktopAppKey]
                : undefined;
              return (
                <TableRow key={surface.id}>
                  <TableDataCell>
                    <strong>{surface.label}</strong>
                    <MetaLine>{surface.kind}</MetaLine>
                    <MetaLine>{surface.routePatterns.join(", ")}</MetaLine>
                  </TableDataCell>
                  <TableDataCell>
                    {surface.domain}
                    <MetaLine>{surface.subdomain}</MetaLine>
                    <MetaLine>{doctrine.label}</MetaLine>
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
                        <UiButton compact onClick={() => wm.openPage(route)}>
                          Open {surface.label}
                        </UiButton>
                      )}
                      <UiButton compact onClick={() => wm.openPage("/admin")}>
                        Open Admin Panel
                      </UiButton>
                      {surface.desktopAppKey && enabled !== undefined && (
                        <UiButton
                          compact
                          title={`${DESKTOP_APP_LABELS[surface.desktopAppKey]} launchers are ${enabled ? "shown" : "hidden"}`}
                          disabled={updateDesktopAppMutation.isPending}
                          onClick={() =>
                            updateDesktopAppMutation.mutate({
                              appKey: surface.desktopAppKey!,
                              enabled: !enabled,
                            })
                          }
                        >
                          {enabled ? "Hide launchers" : "Show launchers"}
                        </UiButton>
                      )}
                    </ActionRow>
                  </TableDataCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </UiPanel>
    </>
  );
}
