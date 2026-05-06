import type { Dispatch, ReactElement, SetStateAction } from "react";
import { Button, GroupBox, Hourglass, TextInput } from "react95";
import styled from "styled-components";
import type { StudioDriveStatus } from "../types";

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

type AdminVoidMutation = {
  mutate: () => void;
  isPending: boolean;
};

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

export type StudioAdminTabProps = {
  studioDrive: StudioDriveStatus | undefined;
  studioRootInput: string;
  setStudioRootInput: Dispatch<SetStateAction<string>>;
  refetchStudioDrive: () => unknown;
  studioDriveConnectMutation: AdminVoidMutation;
  studioDriveDisconnectMutation: AdminVoidMutation;
  studioDriveRefreshQuotaMutation: AdminVoidMutation;
  studioDriveRootFolderMutation: AdminMutation<string | null>;
};

export function StudioAdminTab({
  studioDrive,
  studioRootInput,
  setStudioRootInput,
  refetchStudioDrive,
  studioDriveConnectMutation,
  studioDriveDisconnectMutation,
  studioDriveRefreshQuotaMutation,
  studioDriveRootFolderMutation,
}: StudioAdminTabProps): ReactElement {
  return (
    <>
      <h3>Studio — Platform Drive (fallback pool)</h3>
      <p style={{ marginBottom: 12, fontSize: 13, color: "#555" }}>
        Studio projects are backed by one of three stores, in this order:
        <br />
        <strong>1.</strong> the creating user's own Google Drive (if they
        connected it in Studio → Your Drive),
        <br />
        <strong>2.</strong> <em>this</em> platform Drive account (the
        shared fallback configured here), or
        <br />
        <strong>3.</strong> the local server disk (dev / last-resort).
        <br />
        <br />
        New projects default to 5&nbsp;GB of Drive quota each. Against a
        2&nbsp;TB platform pool, ~400 projects fit before any admin
        intervention.
      </p>

      {!studioDrive ? (
        <Hourglass size={32} />
      ) : (
        <>
          <GroupBox label="Connection Status">
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12 }}>
                <strong>Environment:</strong>{" "}
                {studioDrive.envConfigured ? (
                  <span style={{ color: "#0b5c12" }}>
                    GOOGLE_CLIENT_ID / SECRET / REDIRECT configured
                  </span>
                ) : (
                  <span style={{ color: "#c03027" }}>
                    missing one of GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
                    GOOGLE_OAUTH_REDIRECT_URI
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12 }}>
                <strong>Encryption key:</strong>{" "}
                {studioDrive.cryptoConfigured ? (
                  <span style={{ color: "#0b5c12" }}>
                    STUDIO_CRYPTO_KEY (or SESSION_SECRET fallback) set
                  </span>
                ) : (
                  <span style={{ color: "#c03027" }}>
                    missing STUDIO_CRYPTO_KEY — refresh token cannot be sealed
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12 }}>
                <strong>Platform Drive:</strong>{" "}
                {studioDrive.connected ? (
                  <span style={{ color: "#0b5c12" }}>
                    Connected as{" "}
                    <code>{studioDrive.accountEmail ?? "(unknown)"}</code>
                  </span>
                ) : (
                  <span style={{ color: "#c03027" }}>Not connected</span>
                )}
              </div>
              {studioDrive.connectedAt && (
                <div style={{ fontSize: 11, color: "#555" }}>
                  Connected at {new Date(studioDrive.connectedAt).toLocaleString()}
                </div>
              )}
              {studioDrive.lastRefreshedAt && (
                <div style={{ fontSize: 11, color: "#555" }}>
                  Last token refresh{" "}
                  {new Date(studioDrive.lastRefreshedAt).toLocaleString()}
                </div>
              )}
            </div>
          </GroupBox>

          <GroupBox label="Connect / Disconnect" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button
                primary={!studioDrive.connected}
                disabled={
                  !studioDrive.canConnect || studioDriveConnectMutation.isPending
                }
                onClick={() => studioDriveConnectMutation.mutate()}
              >
                {studioDrive.connected
                  ? "Reconnect Drive"
                  : "Connect Platform Drive"}
              </Button>
              {studioDrive.connected && (
                <Button
                  disabled={studioDriveDisconnectMutation.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Disconnect the platform Drive?  New uploads will refuse until reconnected."
                      )
                    )
                      return;
                    studioDriveDisconnectMutation.mutate();
                  }}
                >
                  {studioDriveDisconnectMutation.isPending
                    ? "Disconnecting..."
                    : "Disconnect"}
                </Button>
              )}
              <Button size="sm" onClick={() => refetchStudioDrive()}>
                Reload status
              </Button>
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
              Clicking "Connect" opens Google's consent screen in a new tab.  Sign
              in as the platform account (e.g.{" "}
              <code>wtfgameshowemail@gmail.com</code>), approve the requested
              scopes, and this page will refresh with the new connection on the
              next reload.
            </div>
          </GroupBox>

          <GroupBox
            label="Studio footprint (shared pool)"
            style={{ marginTop: 12 }}
          >
            {studioDrive.appUsage ? (
              <div style={{ fontSize: 12, display: "grid", gap: 4 }}>
                <div>
                  <strong>Used by Studio:</strong>{" "}
                  {formatBytesAdmin(studioDrive.appUsage.bytes)}
                </div>
                <div>
                  <strong>Files:</strong> {studioDrive.appUsage.fileCount ?? 0}
                </div>
                {studioDrive.appUsage.refreshedAt && (
                  <div style={{ fontSize: 11, color: "#555" }}>
                    Refreshed{" "}
                    {new Date(studioDrive.appUsage.refreshedAt).toLocaleString()}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#777" }}>
                  This is only what Studio has uploaded into this Drive. The
                  account's total Drive quota isn't shown — we request only{" "}
                  <code>drive.file</code>, which can't see the account-level
                  ceiling.
                </div>
                <div>
                  <Button
                    size="sm"
                    disabled={
                      studioDriveRefreshQuotaMutation.isPending ||
                      !studioDrive.connected
                    }
                    onClick={() => studioDriveRefreshQuotaMutation.mutate()}
                  >
                    {studioDriveRefreshQuotaMutation.isPending
                      ? "Refreshing..."
                      : "Refresh from Drive"}
                  </Button>
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "#888" }}>
                Not available — connect Drive first.
              </span>
            )}
          </GroupBox>

          <GroupBox label="Root Folder" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              Drive folder id where Studio creates per-project folders. Leave
              blank to upload into the account's "My Drive" root.
            </div>
            <ActionRow>
              <TextInput
                value={studioRootInput}
                onChange={(e: any) => setStudioRootInput(e.target.value)}
                placeholder="e.g. 1A2b3C..."
                style={{ width: 320 }}
              />
              <Button
                size="sm"
                disabled={
                  studioDriveRootFolderMutation.isPending || !studioDrive.connected
                }
                onClick={() =>
                  studioDriveRootFolderMutation.mutate(
                    studioRootInput.trim() === "" ? null : studioRootInput.trim()
                  )
                }
              >
                {studioDriveRootFolderMutation.isPending
                  ? "Saving..."
                  : "Save root folder"}
              </Button>
            </ActionRow>
          </GroupBox>
        </>
      )}
    </>
  );
}

function formatBytesAdmin(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const TB = GB * 1024;
  if (bytes >= TB) return `${(bytes / TB).toFixed(2)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / KB).toFixed(0)} KB`;
}
