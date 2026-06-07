import type { Dispatch, ReactElement, SetStateAction } from "react";
import { Hourglass, TextInput } from "react95";
import styled from "styled-components";
import { UiButton, UiEmptyState, UiNotice, UiPanel } from "../../../components/wtfos-ui";
import type { StudioDriveStatus } from "../types";

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const Intro = styled.p`
  margin: 0 0 var(--wtf-space-3, 12px);
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.45;
`;

const PanelStack = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
`;

const StatusGrid = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
`;

const StatusLine = styled.div`
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const MetaText = styled.div`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const SuccessText = styled.span`
  color: var(--wtf-app-success, #176b38);
  font-weight: 700;
`;

const DangerText = styled.span`
  color: var(--wtf-app-danger, #b42318);
  font-weight: 700;
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
      <Intro>
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
      </Intro>

      {!studioDrive ? (
        <Hourglass size={32} />
      ) : (
        <PanelStack>
          <UiPanel title="Connection status" compact>
            <StatusGrid>
              <StatusLine>
                <strong>Environment:</strong>{" "}
                {studioDrive.envConfigured ? (
                  <SuccessText>
                    GOOGLE_CLIENT_ID / SECRET / REDIRECT configured
                  </SuccessText>
                ) : (
                  <DangerText>
                    missing one of GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
                    GOOGLE_OAUTH_REDIRECT_URI
                  </DangerText>
                )}
              </StatusLine>
              <StatusLine>
                <strong>Encryption key:</strong>{" "}
                {studioDrive.cryptoConfigured ? (
                  <SuccessText>
                    STUDIO_CRYPTO_KEY set
                  </SuccessText>
                ) : (
                  <DangerText>
                    missing STUDIO_CRYPTO_KEY — refresh token cannot be sealed
                  </DangerText>
                )}
              </StatusLine>
              <StatusLine>
                <strong>Platform Drive:</strong>{" "}
                {studioDrive.connected ? (
                  <SuccessText>
                    Connected as{" "}
                    <code>{studioDrive.accountEmail ?? "(unknown)"}</code>
                  </SuccessText>
                ) : (
                  <DangerText>Not connected</DangerText>
                )}
              </StatusLine>
              {studioDrive.connectedAt && (
                <MetaText>
                  Connected at {new Date(studioDrive.connectedAt).toLocaleString()}
                </MetaText>
              )}
              {studioDrive.lastRefreshedAt && (
                <MetaText>
                  Last token refresh{" "}
                  {new Date(studioDrive.lastRefreshedAt).toLocaleString()}
                </MetaText>
              )}
            </StatusGrid>
          </UiPanel>

          <UiPanel title="Connect or disconnect Platform Drive" compact>
            <ActionRow>
              <UiButton
                uiVariant={!studioDrive.connected ? "primary" : "default"}
                disabled={
                  !studioDrive.canConnect || studioDriveConnectMutation.isPending
                }
                onClick={() => studioDriveConnectMutation.mutate()}
              >
                {studioDrive.connected
                  ? "Reconnect Platform Drive"
                  : "Connect Platform Drive"}
              </UiButton>
              {studioDrive.connected && (
                <UiButton
                  uiVariant="danger"
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
                    : "Disconnect Platform Drive"}
                </UiButton>
              )}
              <UiButton compact onClick={() => refetchStudioDrive()}>
                Reload Drive status
              </UiButton>
            </ActionRow>
            <UiNotice tone="info" style={{ marginTop: 8 }}>
              Clicking "Connect" opens Google's consent screen in a new tab.  Sign
              in as the platform account (e.g.{" "}
              <code>wtfgameshowemail@gmail.com</code>), approve the requested
              scopes, and this page will refresh with the new connection on the
              next reload.
            </UiNotice>
          </UiPanel>

          <UiPanel title="Studio footprint in shared pool" compact>
            {studioDrive.appUsage ? (
              <StatusGrid>
                <StatusLine>
                  <strong>Used by Studio:</strong>{" "}
                  {formatBytesAdmin(studioDrive.appUsage.bytes)}
                </StatusLine>
                <StatusLine>
                  <strong>Files:</strong> {studioDrive.appUsage.fileCount ?? 0}
                </StatusLine>
                {studioDrive.appUsage.refreshedAt && (
                  <MetaText>
                    Refreshed{" "}
                    {new Date(studioDrive.appUsage.refreshedAt).toLocaleString()}
                  </MetaText>
                )}
                <MetaText>
                  This is only what Studio has uploaded into this Drive. The
                  account's total Drive quota isn't shown — we request only{" "}
                  <code>drive.file</code>, which can't see the account-level
                  ceiling.
                </MetaText>
                <div>
                  <UiButton
                    compact
                    disabled={
                      studioDriveRefreshQuotaMutation.isPending ||
                      !studioDrive.connected
                    }
                    onClick={() => studioDriveRefreshQuotaMutation.mutate()}
                  >
                    {studioDriveRefreshQuotaMutation.isPending
                      ? "Refreshing..."
                      : "Refresh Studio footprint from Drive"}
                  </UiButton>
                </div>
              </StatusGrid>
            ) : (
              <UiEmptyState title="Drive footprint is not available">
                Connect Platform Drive before checking the shared Studio pool.
              </UiEmptyState>
            )}
          </UiPanel>

          <UiPanel title="Root folder" compact>
            <MetaText style={{ marginBottom: 6 }}>
              Drive folder id where Studio creates per-project folders. Leave
              blank to upload into the account's "My Drive" root.
            </MetaText>
            <ActionRow>
              <TextInput
                aria-label="Studio root folder ID"
                value={studioRootInput}
                onChange={(e: any) => setStudioRootInput(e.target.value)}
                placeholder="e.g. 1A2b3C..."
                style={{ width: 320 }}
              />
              <UiButton
                compact
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
                  : "Save Studio root folder"}
              </UiButton>
            </ActionRow>
          </UiPanel>
        </PanelStack>
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
