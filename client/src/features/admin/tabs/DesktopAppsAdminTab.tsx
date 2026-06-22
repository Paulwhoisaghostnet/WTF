import {
  Hourglass,
  Table,
  TableBody,
  TableDataCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from "react95";
import styled from "styled-components";
import { DESKTOP_APP_LABELS } from "@shared/types";
import { UiButton } from "../../../components/wtfos-ui";
import type { DesktopAppsResponse, DesktopAppUpdatePayload } from "../types";

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type DesktopAppsAdminTabProps = {
  desktopApps: DesktopAppsResponse | undefined;
  updateDesktopAppMutation: AdminMutation<DesktopAppUpdatePayload>;
};

function getDesktopAppLabel(row: DesktopAppsResponse["list"][number]) {
  return DESKTOP_APP_LABELS[row.key];
}

function formatStamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

const TableWrap = styled.div`
  width: 100%;
  overflow-x: auto;
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
`;

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-1, 4px);
  flex-wrap: wrap;
`;

export function DesktopAppsAdminTab({
  desktopApps,
  updateDesktopAppMutation,
}: DesktopAppsAdminTabProps) {
  return (
    <>
      <h3>Desktop and Start Menu Apps</h3>
      <Intro>
        Toggle launchable apps, refresh doc registries, and issue install keys. Disabled apps stay hidden from normal users; doc freshness and install keys are registration health signals.
      </Intro>
      {!desktopApps ? (
        <Hourglass size={32} />
      ) : (
        <TableWrap>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>App</TableHeadCell>
                <TableHeadCell>Key</TableHeadCell>
                <TableHeadCell>Docs</TableHeadCell>
                <TableHeadCell>Install Key</TableHeadCell>
                <TableHeadCell>Launcher</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {desktopApps.list.map((row) => (
                <TableRow key={row.key}>
                  <TableDataCell>{getDesktopAppLabel(row)}</TableDataCell>
                  <TableDataCell>{row.key}</TableDataCell>
                  <TableDataCell style={{ color: row.docStatus === "registered" ? "#0a6f0a" : row.docStatus === "stale" ? "#915b00" : "#8a1f1f" }}>
                    <div>{row.docStatus}</div>
                    <MetaLine>
                      Updated {formatStamp(row.docsUpdatedAt)}
                    </MetaLine>
                  </TableDataCell>
                  <TableDataCell>
                    <div>{row.installKeyPrefix ?? "No key"}</div>
                    <MetaLine>
                      Expires {formatStamp(row.installKeyExpiresAt)}
                    </MetaLine>
                  </TableDataCell>
                  <TableDataCell style={{ color: row.enabled ? "#0a6f0a" : "#8a1f1f" }}>
                    <div>{row.enabled ? "Shown" : "Hidden"}</div>
                    <MetaLine>
                      {row.installable ? "Registration healthy" : "Registration attention"}
                    </MetaLine>
                  </TableDataCell>
                  <TableDataCell>
                    <ActionRow>
                      <UiButton
                        compact
                        disabled={updateDesktopAppMutation.isPending}
                        onClick={() =>
                          updateDesktopAppMutation.mutate({
                            appKey: row.key,
                            enabled: !row.enabled,
                            docStatus: row.docStatus,
                          })
                        }
                      >
                        {row.enabled ? "Hide app launchers" : "Show app launchers"}
                      </UiButton>
                      <UiButton
                        compact
                        disabled={updateDesktopAppMutation.isPending}
                        onClick={() =>
                          updateDesktopAppMutation.mutate({
                            appKey: row.key,
                            enabled: row.enabled,
                            docStatus: "registered",
                            docsUpdatedAt: new Date().toISOString(),
                            issueInstallKey: true,
                          })
                        }
                      >
                        Refresh docs and install key
                      </UiButton>
                      <UiButton
                        compact
                        disabled={updateDesktopAppMutation.isPending}
                        onClick={() =>
                          updateDesktopAppMutation.mutate({
                            appKey: row.key,
                            enabled: false,
                            docStatus: "revoked",
                            revokeInstallKey: true,
                          })
                        }
                      >
                        Revoke install key
                      </UiButton>
                    </ActionRow>
                  </TableDataCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
