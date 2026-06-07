import type { Dispatch, ReactElement, SetStateAction } from "react";
import { Hourglass, Select, TextInput } from "react95";
import styled from "styled-components";
import { UiButton, UiEmptyState, UiPanel, UiStatusPill, UiToolbar } from "../../../components/wtfos-ui";
import type { WtfTvResponse } from "../types";

export type WtfTvUpdatePayload = {
  enabled?: boolean;
  sourceMode?: string;
  sourceUserIds?: number[];
  sourceWalletAddresses?: string[];
  tokensPerWalletPerHour?: number;
  defaultDurationSeconds?: number;
  playlistSize?: number;
  refreshIntervalMinutes?: number;
  bumperMode?: string;
  selectedBumperIds?: number[];
};

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type AdminVoidMutation = {
  mutate: () => void;
  isPending: boolean;
};

const Stack = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
`;

const Intro = styled.p`
  margin: 0 0 var(--wtf-space-3, 12px);
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-body, 14px);
  line-height: 1.4;
`;

const StatusGrid = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const CheckLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: var(--wtf-space-1, 4px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const PickerList = styled.div`
  max-height: 200px;
  overflow: auto;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: var(--wtf-space-1, 4px);
  margin-bottom: var(--wtf-space-2, 8px);
`;

const PickerRow = styled.label`
  display: flex;
  align-items: center;
  gap: var(--wtf-space-1, 4px);
  padding: 3px var(--wtf-space-1, 4px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const WalletRow = styled.div`
  display: flex;
  gap: var(--wtf-space-1, 4px);
  align-items: center;
  padding: 3px 0;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
`;

const MonoValue = styled.span`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  gap: var(--wtf-space-2, 8px) var(--wtf-space-4, 16px);
  max-width: 560px;
  align-items: center;

  label {
    color: var(--wtf-app-text, #111);
    font-size: var(--wtf-type-caption, 13px);
    font-weight: 700;
  }
`;

export type WtfTvAdminTabProps = {
  wtfTvData: WtfTvResponse | undefined;
  wtfSourceMode: string;
  setWtfSourceMode: Dispatch<SetStateAction<string>>;
  wtfSelectedUsers: number[];
  setWtfSelectedUsers: Dispatch<SetStateAction<number[]>>;
  wtfWalletInput: string;
  setWtfWalletInput: Dispatch<SetStateAction<string>>;
  wtfWallets: string[];
  setWtfWallets: Dispatch<SetStateAction<string[]>>;
  wtfTokensPerWallet: number;
  setWtfTokensPerWallet: Dispatch<SetStateAction<number>>;
  wtfDuration: number;
  setWtfDuration: Dispatch<SetStateAction<number>>;
  wtfPlaylistSize: number;
  setWtfPlaylistSize: Dispatch<SetStateAction<number>>;
  wtfRefreshInterval: number;
  setWtfRefreshInterval: Dispatch<SetStateAction<number>>;
  wtfBumperMode: string;
  setWtfBumperMode: Dispatch<SetStateAction<string>>;
  wtfSelectedBumpers: number[];
  setWtfSelectedBumpers: Dispatch<SetStateAction<number[]>>;
  wtfUpdateMutation: AdminMutation<WtfTvUpdatePayload>;
  wtfInitMutation: AdminVoidMutation;
  wtfRefreshMutation: AdminVoidMutation;
};

export function WtfTvAdminTab({
  wtfTvData,
  wtfSourceMode,
  setWtfSourceMode,
  wtfSelectedUsers,
  setWtfSelectedUsers,
  wtfWalletInput,
  setWtfWalletInput,
  wtfWallets,
  setWtfWallets,
  wtfTokensPerWallet,
  setWtfTokensPerWallet,
  wtfDuration,
  setWtfDuration,
  wtfPlaylistSize,
  setWtfPlaylistSize,
  wtfRefreshInterval,
  setWtfRefreshInterval,
  wtfBumperMode,
  setWtfBumperMode,
  wtfSelectedBumpers,
  setWtfSelectedBumpers,
  wtfUpdateMutation,
  wtfInitMutation,
  wtfRefreshMutation,
}: WtfTvAdminTabProps): ReactElement {
  return (
    <>
      <h3>WTF TV Channel</h3>
      <Intro>
        The official community channel that auto-populates from user-owned tokens.
      </Intro>

      {!wtfTvData ? (
        <Hourglass size={32} />
      ) : !wtfTvData.config?.channelId ? (
        <UiEmptyState
          title="No WTF TV channel yet"
          action={
            <UiButton
              onClick={() => wtfInitMutation.mutate()}
              disabled={wtfInitMutation.isPending}
              uiVariant="primary"
            >
              {wtfInitMutation.isPending ? "Creating channel..." : "Create WTF TV channel"}
            </UiButton>
          }
        >
          Create the official channel before configuring token sources, bumpers, and refresh timing.
        </UiEmptyState>
      ) : (
        <Stack>
          <UiPanel title="Status" compact>
            <StatusGrid>
              <span>
                Channel: <strong>{wtfTvData.channelTitle || "WTF TV"}</strong>{" "}
                (ID: {wtfTvData.config.channelId})
              </span>
              <CheckLabel>
                <input
                  type="checkbox"
                  aria-label="Enable WTF TV channel"
                  checked={wtfTvData.config.enabled}
                  onChange={(e) =>
                    wtfUpdateMutation.mutate({ enabled: e.target.checked })
                  }
                />
                Enabled
              </CheckLabel>
              <UiStatusPill $tone={wtfTvData.config.enabled ? "success" : "warning"}>
                {wtfTvData.config.enabled ? "Broadcast enabled" : "Broadcast paused"}
              </UiStatusPill>
              <span>
                Last refresh:{" "}
                {wtfTvData.config.lastRefreshedAt
                  ? new Date(wtfTvData.config.lastRefreshedAt).toLocaleString()
                  : "Never"}
              </span>
              <UiButton
                compact
                onClick={() => wtfRefreshMutation.mutate()}
                disabled={wtfRefreshMutation.isPending}
              >
                {wtfRefreshMutation.isPending ? "Refreshing channel..." : "Refresh channel now"}
              </UiButton>
            </StatusGrid>
          </UiPanel>

          <UiPanel title="Token source" compact>
            <UiToolbar style={{ marginBottom: 8 }}>
              <Select
                aria-label="WTF TV token source mode"
                value={wtfSourceMode}
                onChange={(e: any) => setWtfSourceMode(e.value)}
                options={[
                  { value: "all_users", label: "All users" },
                  { value: "selected_users", label: "Selected users" },
                  { value: "specific_wallets", label: "Specific wallets" },
                ]}
                width={200}
              />
            </UiToolbar>

            {wtfSourceMode === "selected_users" && (
              <PickerList>
                {(wtfTvData.users || []).map((u) => (
                  <PickerRow key={u.id}>
                    <input
                      type="checkbox"
                      aria-label={`Include ${u.displayName || u.username} in WTF TV source users`}
                      checked={wtfSelectedUsers.includes(u.id)}
                      onChange={(e) => {
                        setWtfSelectedUsers((prev) =>
                          e.target.checked
                            ? [...prev, u.id]
                            : prev.filter((id) => id !== u.id)
                        );
                      }}
                    />
                    {u.displayName || u.username} (@{u.username})
                  </PickerRow>
                ))}
              </PickerList>
            )}

            {wtfSourceMode === "specific_wallets" && (
              <div>
                <UiToolbar style={{ marginBottom: 8 }}>
                  <TextInput
                    aria-label="WTF TV wallet address"
                    value={wtfWalletInput}
                    onChange={(e: any) => setWtfWalletInput(e.target.value)}
                    placeholder="tz1... wallet address"
                    style={{ flex: 1 }}
                  />
                  <UiButton
                    compact
                    onClick={() => {
                      const addr = wtfWalletInput.trim();
                      if (addr && !wtfWallets.includes(addr)) {
                        setWtfWallets((prev) => [...prev, addr]);
                        setWtfWalletInput("");
                      }
                    }}
                  >
                    Add wallet
                  </UiButton>
                </UiToolbar>
                {wtfWallets.map((w) => (
                  <WalletRow key={w}>
                    <MonoValue>{w}</MonoValue>
                    <UiButton
                      compact
                      iconOnlyLabel={`Remove wallet ${w}`}
                      onClick={() =>
                        setWtfWallets((prev) => prev.filter((x) => x !== w))
                      }
                    >
                      x
                    </UiButton>
                  </WalletRow>
                ))}
              </div>
            )}
          </UiPanel>

          <UiPanel title="Playlist settings" compact>
            <SettingsGrid>
              <label>Tokens per wallet/hour</label>
              <TextInput
                aria-label="WTF TV tokens per wallet per hour"
                type="number"
                value={String(wtfTokensPerWallet)}
                onChange={(e: any) =>
                  setWtfTokensPerWallet(Math.max(1, Number(e.target.value) || 1))
                }
                style={{ width: 96 }}
              />

              <label>Default duration in seconds</label>
              <TextInput
                aria-label="WTF TV default token duration"
                type="number"
                value={String(wtfDuration)}
                onChange={(e: any) =>
                  setWtfDuration(Math.max(3, Number(e.target.value) || 15))
                }
                style={{ width: 96 }}
              />

              <label>Playlist size in tokens</label>
              <TextInput
                aria-label="WTF TV playlist size"
                type="number"
                value={String(wtfPlaylistSize)}
                onChange={(e: any) =>
                  setWtfPlaylistSize(Math.max(5, Number(e.target.value) || 100))
                }
                style={{ width: 96 }}
              />

              <label>Auto-refresh interval in minutes</label>
              <TextInput
                aria-label="WTF TV auto refresh interval"
                type="number"
                value={String(wtfRefreshInterval)}
                onChange={(e: any) =>
                  setWtfRefreshInterval(Math.max(5, Number(e.target.value) || 30))
                }
                style={{ width: 96 }}
              />
            </SettingsGrid>
          </UiPanel>

          <UiPanel title="Bumper settings" compact>
            <UiToolbar style={{ marginBottom: 8 }}>
              <Select
                aria-label="WTF TV bumper mode"
                value={wtfBumperMode}
                onChange={(e: any) => setWtfBumperMode(e.value)}
                options={[
                  { value: "community_pool", label: "Community pool (all bumpers)" },
                  { value: "selected", label: "Selected bumpers only" },
                  { value: "none", label: "No bumpers" },
                ]}
                width={280}
              />
            </UiToolbar>

            {wtfBumperMode === "selected" && (
              <PickerList>
                {(wtfTvData.bumpers || []).map((b) => (
                  <PickerRow key={b.id}>
                    <input
                      type="checkbox"
                      aria-label={`Use bumper ${b.title}`}
                      checked={wtfSelectedBumpers.includes(b.id)}
                      onChange={(e) => {
                        setWtfSelectedBumpers((prev) =>
                          e.target.checked
                            ? [...prev, b.id]
                            : prev.filter((id) => id !== b.id)
                        );
                      }}
                    />
                    {b.title} ({(b.durationMs / 1000).toFixed(1)}s)
                  </PickerRow>
                ))}
                {(wtfTvData.bumpers || []).length === 0 && (
                  <UiEmptyState title="No bumpers uploaded">
                    Upload bumper media before selecting a bumper-only channel rotation.
                  </UiEmptyState>
                )}
              </PickerList>
            )}
          </UiPanel>

          <div>
            <UiButton
              uiVariant="primary"
              onClick={() =>
                wtfUpdateMutation.mutate({
                  sourceMode: wtfSourceMode,
                  sourceUserIds: wtfSelectedUsers,
                  sourceWalletAddresses: wtfWallets,
                  tokensPerWalletPerHour: wtfTokensPerWallet,
                  defaultDurationSeconds: wtfDuration,
                  playlistSize: wtfPlaylistSize,
                  refreshIntervalMinutes: wtfRefreshInterval,
                  bumperMode: wtfBumperMode,
                  selectedBumperIds: wtfSelectedBumpers,
                })
              }
              disabled={wtfUpdateMutation.isPending}
            >
              {wtfUpdateMutation.isPending ? "Saving channel settings..." : "Save WTF TV settings"}
            </UiButton>
          </div>
        </Stack>
      )}
    </>
  );
}
