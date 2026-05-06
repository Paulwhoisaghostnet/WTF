import type { Dispatch, ReactElement, SetStateAction } from "react";
import { Button, GroupBox, Hourglass, Select, TextInput } from "react95";
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
      <p style={{ marginBottom: 12, fontSize: 13, color: "#555" }}>
        The official community channel that auto-populates from user-owned tokens.
      </p>

      {!wtfTvData ? (
        <Hourglass size={32} />
      ) : !wtfTvData.config?.channelId ? (
        <GroupBox label="Initialize">
          <p style={{ marginBottom: 8 }}>
            No WTF TV channel exists yet. Create one to get started.
          </p>
          <Button
            onClick={() => wtfInitMutation.mutate()}
            disabled={wtfInitMutation.isPending}
          >
            {wtfInitMutation.isPending ? "Creating..." : "Create WTF TV Channel"}
          </Button>
        </GroupBox>
      ) : (
        <>
          <GroupBox label="Status">
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span>
                Channel: <strong>{wtfTvData.channelTitle || "WTF TV"}</strong>{" "}
                (ID: {wtfTvData.config.channelId})
              </span>
              <span>
                Enabled:{" "}
                <input
                  type="checkbox"
                  checked={wtfTvData.config.enabled}
                  onChange={(e) =>
                    wtfUpdateMutation.mutate({ enabled: e.target.checked })
                  }
                />
              </span>
              <span>
                Last refresh:{" "}
                {wtfTvData.config.lastRefreshedAt
                  ? new Date(wtfTvData.config.lastRefreshedAt).toLocaleString()
                  : "Never"}
              </span>
              <Button
                onClick={() => wtfRefreshMutation.mutate()}
                disabled={wtfRefreshMutation.isPending}
                size="sm"
              >
                {wtfRefreshMutation.isPending ? "Refreshing..." : "Refresh Now"}
              </Button>
            </div>
          </GroupBox>

          <GroupBox label="Token Source" style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <Select
                value={wtfSourceMode}
                onChange={(e: any) => setWtfSourceMode(e.value)}
                options={[
                  { value: "all_users", label: "All Users" },
                  { value: "selected_users", label: "Selected Users" },
                  { value: "specific_wallets", label: "Specific Wallets" },
                ]}
                width={200}
              />
            </div>

            {wtfSourceMode === "selected_users" && (
              <div
                style={{
                  maxHeight: 200,
                  overflow: "auto",
                  border: "1px solid #888",
                  padding: 4,
                  marginBottom: 8,
                }}
              >
                {(wtfTvData.users || []).map((u) => (
                  <label
                    key={u.id}
                    style={{ display: "block", fontSize: 12, padding: "2px 4px" }}
                  >
                    <input
                      type="checkbox"
                      checked={wtfSelectedUsers.includes(u.id)}
                      onChange={(e) => {
                        setWtfSelectedUsers((prev) =>
                          e.target.checked
                            ? [...prev, u.id]
                            : prev.filter((id) => id !== u.id)
                        );
                      }}
                    />{" "}
                    {u.displayName || u.username} (@{u.username})
                  </label>
                ))}
              </div>
            )}

            {wtfSourceMode === "specific_wallets" && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  <TextInput
                    value={wtfWalletInput}
                    onChange={(e: any) => setWtfWalletInput(e.target.value)}
                    placeholder="tz1... wallet address"
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const addr = wtfWalletInput.trim();
                      if (addr && !wtfWallets.includes(addr)) {
                        setWtfWallets((prev) => [...prev, addr]);
                        setWtfWalletInput("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {wtfWallets.map((w) => (
                  <div
                    key={w}
                    style={{
                      display: "flex",
                      gap: 4,
                      alignItems: "center",
                      fontSize: 12,
                      padding: "2px 0",
                    }}
                  >
                    <span style={{ flex: 1, fontFamily: "monospace" }}>{w}</span>
                    <Button
                      size="sm"
                      onClick={() =>
                        setWtfWallets((prev) => prev.filter((x) => x !== w))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </GroupBox>

          <GroupBox label="Playlist Settings" style={{ marginTop: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px 16px",
                maxWidth: 500,
              }}
            >
              <label style={{ fontSize: 13 }}>Tokens per wallet/hour:</label>
              <TextInput
                type="number"
                value={String(wtfTokensPerWallet)}
                onChange={(e: any) =>
                  setWtfTokensPerWallet(Math.max(1, Number(e.target.value) || 1))
                }
                style={{ width: 80 }}
              />

              <label style={{ fontSize: 13 }}>Default duration (seconds):</label>
              <TextInput
                type="number"
                value={String(wtfDuration)}
                onChange={(e: any) =>
                  setWtfDuration(Math.max(3, Number(e.target.value) || 15))
                }
                style={{ width: 80 }}
              />

              <label style={{ fontSize: 13 }}>Playlist size (tokens):</label>
              <TextInput
                type="number"
                value={String(wtfPlaylistSize)}
                onChange={(e: any) =>
                  setWtfPlaylistSize(Math.max(5, Number(e.target.value) || 100))
                }
                style={{ width: 80 }}
              />

              <label style={{ fontSize: 13 }}>Auto-refresh interval (min):</label>
              <TextInput
                type="number"
                value={String(wtfRefreshInterval)}
                onChange={(e: any) =>
                  setWtfRefreshInterval(Math.max(5, Number(e.target.value) || 30))
                }
                style={{ width: 80 }}
              />
            </div>
          </GroupBox>

          <GroupBox label="Bumper Settings" style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <Select
                value={wtfBumperMode}
                onChange={(e: any) => setWtfBumperMode(e.value)}
                options={[
                  { value: "community_pool", label: "Community Pool (all bumpers)" },
                  { value: "selected", label: "Selected Bumpers Only" },
                  { value: "none", label: "No Bumpers" },
                ]}
                width={280}
              />
            </div>

            {wtfBumperMode === "selected" && (
              <div
                style={{
                  maxHeight: 180,
                  overflow: "auto",
                  border: "1px solid #888",
                  padding: 4,
                  marginBottom: 8,
                }}
              >
                {(wtfTvData.bumpers || []).map((b) => (
                  <label
                    key={b.id}
                    style={{ display: "block", fontSize: 12, padding: "2px 4px" }}
                  >
                    <input
                      type="checkbox"
                      checked={wtfSelectedBumpers.includes(b.id)}
                      onChange={(e) => {
                        setWtfSelectedBumpers((prev) =>
                          e.target.checked
                            ? [...prev, b.id]
                            : prev.filter((id) => id !== b.id)
                        );
                      }}
                    />{" "}
                    {b.title} ({(b.durationMs / 1000).toFixed(1)}s)
                  </label>
                ))}
                {(wtfTvData.bumpers || []).length === 0 && (
                  <span style={{ fontSize: 12, color: "#888" }}>
                    No bumpers uploaded yet
                  </span>
                )}
              </div>
            )}
          </GroupBox>

          <div style={{ marginTop: 16 }}>
            <Button
              primary
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
              {wtfUpdateMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
