import { useState, type Dispatch, type ReactElement, type SetStateAction } from "react";
import {
  MenuBtn,
  MenuDivider,
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuRow,
  MenuScrollList,
  MenuTitle,
} from "../TVChrome";
import type { MediaUsageResponse, TVBumper, TVChannel, TVMediaItem } from "../types";
import {
  BumperAssignmentToggles,
  type BumperCategory,
} from "../../media-library/BumperAssignmentToggles";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type QueryLike<TData> = {
  data?: TData;
  isLoading?: boolean;
};

type MutationLike<TVariables> = {
  error?: unknown;
  isError?: boolean;
  isPending?: boolean;
  mutate: (
    variables: TVariables,
    options?: {
      onError?: (...args: unknown[]) => void;
      onSuccess?: (...args: unknown[]) => void;
    }
  ) => void;
};

type QueryClientLike = {
  invalidateQueries: (...args: unknown[]) => unknown;
};

type MyMediaScreenProps = {
  addMediaToChannelMutation: MutationLike<{
    channelId: number;
    mediaItemId: number;
  }>;
  deleteMediaMutation: MutationLike<number>;
  detachMediaFromChannelMutation: MutationLike<{
    channelId: number;
    mediaItemId: number;
  }>;
  mediaAddTargetId: number | null;
  mediaDeleteTargetId: number | null;
  mediaManageTargetId: number | null;
  mediaManageUsageQuery: QueryLike<MediaUsageResponse>;
  mediaUsageQuery: QueryLike<MediaUsageResponse>;
  myBumpersQuery: QueryLike<TVBumper[]>;
  myChannelsQuery: QueryLike<TVChannel[]>;
  myMediaQuery: QueryLike<TVMediaItem[]>;
  qc: QueryClientLike;
  renderBackBtn: (label?: string) => ReactElement;
  selectedChannelId: number | null;
  selectedOwnChannelId: number | null;
  setMediaAddTargetId: StateSetter<number | null>;
  setMediaDeleteTargetId: StateSetter<number | null>;
  setMediaManageTargetId: StateSetter<number | null>;
  toggleMediaBumperMutation: MutationLike<{
    mediaItemId: number;
    category: BumperCategory;
    enabled: boolean;
  }>;
};

export function MyMediaScreen({
  addMediaToChannelMutation,
  deleteMediaMutation,
  detachMediaFromChannelMutation,
  mediaAddTargetId,
  mediaDeleteTargetId,
  mediaManageTargetId,
  mediaManageUsageQuery,
  mediaUsageQuery,
  myBumpersQuery,
  myChannelsQuery,
  myMediaQuery,
  qc,
  renderBackBtn,
  selectedChannelId,
  selectedOwnChannelId,
  setMediaAddTargetId,
  setMediaDeleteTargetId,
  setMediaManageTargetId,
  toggleMediaBumperMutation,
}: MyMediaScreenProps) {
  const [bumperErrors, setBumperErrors] = useState<Record<number, string>>({});
  const ownChannels = myChannelsQuery.data || [];
  const mediaItems = myMediaQuery.data || [];
  const bumperAssignments = (myBumpersQuery.data || []).filter(
    (bumper) => bumper.mediaItemId != null
  );
  const deleteTarget = mediaDeleteTargetId
    ? mediaItems.find((m) => m.id === mediaDeleteTargetId)
    : null;
  const usageRows = mediaUsageQuery.data?.channels || [];
  const usageChannelCount = mediaUsageQuery.data?.summary.channels ?? 0;
  const usagePlaylistCount = mediaUsageQuery.data?.summary.playlists ?? 0;
  const usageBumperCount = mediaUsageQuery.data?.summary.bumpers ?? 0;
  const toggleBumper = (
    item: TVMediaItem,
    category: BumperCategory,
    enabled: boolean
  ) => {
    setBumperErrors((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    toggleMediaBumperMutation.mutate(
      { mediaItemId: item.id, category, enabled },
      {
        onSuccess: () =>
          setBumperErrors((prev) => {
            const next = { ...prev };
            delete next[item.id];
            return next;
          }),
        onError: (err: unknown) =>
          setBumperErrors((prev) => ({
            ...prev,
            [item.id]:
              (err as Error)?.message || "Failed to update bumper assignment",
          })),
      }
    );
  };

  return (
    <MenuOverlay>
      <MenuTitle>
        <span>MY MEDIA</span>
        {renderBackBtn("MENU")}
      </MenuTitle>
      <MenuLabel>
        Your video library from tokens and uploads. ADD puts an item on a
        channel, CHANNELS shows where it is currently attached, and DELETE
        removes it from your library everywhere.
      </MenuLabel>
      <MenuDivider />
      <MenuScrollList>
        {mediaItems.map((item) => {
          const isAddOpen = mediaAddTargetId === item.id;
          const isManageOpen = mediaManageTargetId === item.id;
          const canAdd = ownChannels.length > 0 && item.status === "ready";
          return (
            <MenuItem key={item.id}>
              <MenuRow>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.title}
                </span>
                <MenuLabel>
                  {item.sourceType} · {item.mimeType} · {item.status}
                </MenuLabel>
                <MenuBtn
                  disabled={!canAdd || addMediaToChannelMutation.isPending}
                  onClick={() => {
                    if (!canAdd) return;
                    setMediaManageTargetId(null);
                    setMediaDeleteTargetId(null);
                    setMediaAddTargetId(isAddOpen ? null : item.id);
                  }}
                  title={
                    !canAdd
                      ? ownChannels.length === 0
                        ? "You do not own any TV channels yet"
                        : `Media is ${item.status}, wait for it to finish processing`
                      : "Add to one of your channels"
                  }
                >
                  {isAddOpen ? "CANCEL" : "ADD"}
                </MenuBtn>
                <MenuBtn
                  disabled={detachMediaFromChannelMutation.isPending}
                  onClick={() => {
                    setMediaDeleteTargetId(null);
                    setMediaManageTargetId(isManageOpen ? null : item.id);
                  }}
                >
                  {isManageOpen ? "DONE" : "CHANNELS"}
                </MenuBtn>
                <MenuBtn
                  disabled={deleteMediaMutation.isPending}
                  onClick={() => {
                    setMediaManageTargetId(null);
                    setMediaDeleteTargetId(item.id);
                  }}
                >
                  DELETE
                </MenuBtn>
              </MenuRow>
              {item.durationSeconds != null && (
                <MenuLabel>{item.durationSeconds}s</MenuLabel>
              )}
              <div style={{ marginTop: 6 }}>
                <BumperAssignmentToggles
                  mediaItemId={item.id}
                  assignments={bumperAssignments}
                  disabled={item.status !== "ready"}
                  pending={toggleMediaBumperMutation.isPending}
                  error={bumperErrors[item.id] || null}
                  tone="dark"
                  onToggle={(category, enabled) =>
                    toggleBumper(item, category, enabled)
                  }
                />
              </div>
              {isAddOpen && (
                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: "1px dashed rgba(136,255,170,0.2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <MenuLabel>Pick a channel:</MenuLabel>
                  {ownChannels.map((ch) => {
                    const dial =
                      typeof ch.dialNumber === "number" && ch.dialNumber > 0
                        ? String(ch.dialNumber).padStart(2, "0")
                        : "--";
                    return (
                      <MenuBtn
                        key={ch.id}
                        disabled={addMediaToChannelMutation.isPending}
                        onClick={() =>
                          addMediaToChannelMutation.mutate(
                            { channelId: ch.id, mediaItemId: item.id },
                            {
                              onSuccess: () => {
                                setMediaAddTargetId(null);
                              },
                            }
                          )
                        }
                      >
                        CH {dial} · {ch.title}
                      </MenuBtn>
                    );
                  })}
                  {addMediaToChannelMutation.isError && (
                    <MenuLabel style={{ color: "#ff6655" }}>
                      {(addMediaToChannelMutation.error as Error)?.message ||
                        "Failed to add"}
                    </MenuLabel>
                  )}
                </div>
              )}
              {isManageOpen && (
                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: "1px dashed rgba(136,255,170,0.2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <MenuLabel>
                    Removing from a channel also removes it from that
                    channel&apos;s playlists.
                  </MenuLabel>
                  {mediaManageUsageQuery.isLoading ? (
                    <MenuLabel>Checking channel attachments…</MenuLabel>
                  ) : (mediaManageUsageQuery.data?.channels || []).length === 0 ? (
                    <MenuLabel>Not attached to any channels yet.</MenuLabel>
                  ) : (
                    (mediaManageUsageQuery.data?.channels || []).map((row) => (
                      <MenuRow key={row.channel.id}>
                        <span style={{ flex: 1, fontSize: 11 }}>
                          CH{" "}
                          {row.channel.dialNumber != null
                            ? String(row.channel.dialNumber).padStart(2, "0")
                            : "--"}{" "}
                          {row.channel.title}
                          {row.playlists.length > 0
                            ? ` (${row.playlists
                                .map((playlist) => playlist.name)
                                .join(", ")})`
                            : ""}
                        </span>
                        <MenuBtn
                          disabled={detachMediaFromChannelMutation.isPending}
                          onClick={() =>
                            detachMediaFromChannelMutation.mutate({
                              channelId: row.channel.id,
                              mediaItemId: item.id,
                            })
                          }
                        >
                          REMOVE
                        </MenuBtn>
                      </MenuRow>
                    ))
                  )}
                  {detachMediaFromChannelMutation.isError && (
                    <MenuLabel style={{ color: "#ff6655" }}>
                      {(detachMediaFromChannelMutation.error as Error)?.message ||
                        "Failed to remove from channel"}
                    </MenuLabel>
                  )}
                </div>
              )}
            </MenuItem>
          );
        })}
        {mediaItems.length === 0 && (
          <MenuItem $disabled>
            {myMediaQuery.isLoading
              ? "Loading..."
              : "No video media yet. Import tokens via My Videos in Start Menu."}
          </MenuItem>
        )}
      </MenuScrollList>

      {deleteTarget && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid rgba(255,102,85,0.4)",
            borderRadius: 3,
            background: "rgba(40,8,8,0.6)",
          }}
        >
          <MenuLabel style={{ color: "#ffaa88" }}>
            DELETE &quot;{deleteTarget.title}&quot;?
          </MenuLabel>
          {mediaUsageQuery.isLoading ? (
            <MenuLabel>Checking channels...</MenuLabel>
          ) : usageChannelCount === 0 && usageBumperCount === 0 ? (
            <MenuLabel>Not in any channel playlists or bumper buckets. Safe to delete.</MenuLabel>
          ) : (
            <>
              <MenuLabel>
                This will remove the file from {usageChannelCount} channel
                {usageChannelCount === 1 ? "" : "s"} and {usagePlaylistCount}{" "}
                playlist{usagePlaylistCount === 1 ? "" : "s"} plus{" "}
                {usageBumperCount} bumper bucket
                {usageBumperCount === 1 ? "" : "s"}:
              </MenuLabel>
              {usageRows.map((row) => (
                <MenuLabel key={row.channel.id} style={{ color: "#ffcc99" }}>
                  • CH{" "}
                  {row.channel.dialNumber != null
                    ? String(row.channel.dialNumber).padStart(2, "0")
                    : "--"}{" "}
                  {row.channel.title}
                  {row.playlists.length > 0
                    ? ` (${row.playlists.map((p) => p.name).join(", ")})`
                    : ""}
                </MenuLabel>
              ))}
              {(mediaUsageQuery.data?.bumpers || []).map((bumper) => (
                <MenuLabel key={bumper.id} style={{ color: "#ffcc99" }}>
                  • {bumper.category === "community" ? "Community" : "Personal"} bumper:{" "}
                  {bumper.title}
                </MenuLabel>
              ))}
            </>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <MenuBtn
              $accent
              disabled={deleteMediaMutation.isPending}
              onClick={() =>
                deleteMediaMutation.mutate(deleteTarget.id, {
                  onSuccess: () => {
                    setMediaDeleteTargetId(null);
                    if (selectedChannelId)
                      qc.invalidateQueries({
                        queryKey: ["tv", "stream", selectedChannelId],
                      });
                    if (selectedOwnChannelId)
                      qc.invalidateQueries({
                        queryKey: ["tv", "channel", selectedOwnChannelId],
                      });
                  },
                })
              }
            >
              {deleteMediaMutation.isPending
                ? "DELETING..."
                : "CONFIRM DELETE"}
            </MenuBtn>
            <MenuBtn onClick={() => setMediaDeleteTargetId(null)}>
              CANCEL
            </MenuBtn>
          </div>
          {deleteMediaMutation.isError && (
            <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
              {(deleteMediaMutation.error as Error)?.message ||
                "Failed to delete"}
            </MenuLabel>
          )}
        </div>
      )}
    </MenuOverlay>
  );
}
