import {
  Button,
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

export function DesktopAppsAdminTab({
  desktopApps,
  updateDesktopAppMutation,
}: DesktopAppsAdminTabProps) {
  return (
    <>
      <h3>Desktop and Start Menu Apps</h3>
      <p style={{ marginBottom: 8, fontSize: 12, color: "#444" }}>
        Toggle launchable apps, refresh doc registries, and issue install keys. Disabled or doc-stale apps stay hidden from normal users, but admins and trusted creators can still open the surface for repair.
      </p>
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
                <TableHeadCell>Status</TableHeadCell>
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
                    <div style={{ fontSize: 11, color: "#555" }}>
                      Updated {formatStamp(row.docsUpdatedAt)}
                    </div>
                  </TableDataCell>
                  <TableDataCell style={{ fontSize: 11 }}>
                    <div>{row.installKeyPrefix ?? "No key"}</div>
                    <div style={{ color: "#555" }}>
                      Expires {formatStamp(row.installKeyExpiresAt)}
                    </div>
                  </TableDataCell>
                  <TableDataCell style={{ color: row.installable ? "#0a6f0a" : "#8a1f1f" }}>
                    {row.installable ? "Installable" : "Blocked"}
                  </TableDataCell>
                  <TableDataCell>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <Button
                        size="sm"
                        disabled={updateDesktopAppMutation.isPending}
                        onClick={() =>
                          updateDesktopAppMutation.mutate({
                            appKey: row.key,
                            enabled: !row.enabled,
                            docStatus: row.docStatus,
                          })
                        }
                      >
                        {row.enabled ? "Hide" : "Show"}
                      </Button>
                      <Button
                        size="sm"
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
                        Refresh docs + key
                      </Button>
                      <Button
                        size="sm"
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
                        Revoke key
                      </Button>
                    </div>
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
