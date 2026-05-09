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
        Toggle launchable apps for special events. Disabled apps are removed from both desktop icons and the Start Menu.
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
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell>Action</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {desktopApps.list.map((row) => (
                <TableRow key={row.key}>
                  <TableDataCell>{getDesktopAppLabel(row)}</TableDataCell>
                  <TableDataCell>{row.key}</TableDataCell>
                  <TableDataCell style={{ color: row.enabled ? "#0a6f0a" : "#8a1f1f" }}>
                    {row.enabled ? "Shown" : "Hidden"}
                  </TableDataCell>
                  <TableDataCell>
                    <Button
                      size="sm"
                      disabled={updateDesktopAppMutation.isPending}
                      onClick={() =>
                        updateDesktopAppMutation.mutate({
                          appKey: row.key,
                          enabled: !row.enabled,
                        })
                      }
                    >
                      {row.enabled ? "Hide" : "Show"}
                    </Button>
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
