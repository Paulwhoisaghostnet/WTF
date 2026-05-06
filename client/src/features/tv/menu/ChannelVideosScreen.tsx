import { useState, type ReactElement } from "react";
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
import type { ChannelDetailResponse, TVBumper } from "../types";
import {
  BumperAssignmentToggles,
  type BumperCategory,
} from "../../media-library/BumperAssignmentToggles";

type QueryLike<TData> = {
  data?: TData;
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

type ChannelVideosScreenProps = {
  detailQuery: QueryLike<ChannelDetailResponse>;
  myBumpersQuery: QueryLike<TVBumper[]>;
  removeVideoMutation: MutationLike<{ channelId: number; videoId: number }>;
  renderBackBtn: (label?: string) => ReactElement;
  selectedOwnChannelId: number | null;
  toggleMediaBumperMutation: MutationLike<{
    mediaItemId: number;
    category: BumperCategory;
    enabled: boolean;
  }>;
};

export function ChannelVideosScreen({
  detailQuery,
  myBumpersQuery,
  removeVideoMutation,
  renderBackBtn,
  selectedOwnChannelId,
  toggleMediaBumperMutation,
}: ChannelVideosScreenProps) {
  const [bumperErrors, setBumperErrors] = useState<Record<number, string>>({});
  const videos = detailQuery.data?.videos || [];
  const bumperAssignments = (myBumpersQuery.data || []).filter(
    (bumper) => bumper.mediaItemId != null
  );

  return (
    <MenuOverlay>
      <MenuTitle>
        <span>CHANNEL VIDEOS</span>
        {renderBackBtn("CREATOR")}
      </MenuTitle>
      <MenuScrollList>
        {videos.map((video) => (
          <MenuItem key={video.id}>
            <MenuRow style={{ alignItems: "flex-start" }}>
              <div
                style={{
                  width: "clamp(76px, 16vw, 116px)",
                  aspectRatio: "16 / 9",
                  background: "#000",
                  border: "1px solid rgba(136,255,170,0.35)",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                <video
                  src={video.sourceUri}
                  poster={video.thumbnailUri || undefined}
                  muted
                  playsInline
                  preload="metadata"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <MenuRow>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {video.title || `Video #${video.id}`}
                  </span>
                  <MenuLabel>{video.mimeType}</MenuLabel>
                </MenuRow>
                {video.mediaItemId ? (
                  <div style={{ marginTop: 6 }}>
                    <BumperAssignmentToggles
                      mediaItemId={video.mediaItemId}
                      assignments={bumperAssignments}
                      pending={toggleMediaBumperMutation.isPending}
                      error={bumperErrors[video.mediaItemId] || null}
                      tone="dark"
                      onToggle={(category, enabled) => {
                        const mediaItemId = video.mediaItemId!;
                        setBumperErrors((prev) => {
                          const next = { ...prev };
                          delete next[mediaItemId];
                          return next;
                        });
                        toggleMediaBumperMutation.mutate(
                          { mediaItemId, category, enabled },
                          {
                            onError: (err: unknown) =>
                              setBumperErrors((prev) => ({
                                ...prev,
                                [mediaItemId]:
                                  (err as Error)?.message ||
                                  "Failed to update bumper assignment",
                              })),
                          }
                        );
                      }}
                    />
                  </div>
                ) : (
                  <MenuLabel style={{ marginTop: 4 }}>
                    Import this token into My Videos to use bumper toggles.
                  </MenuLabel>
                )}
                <MenuDivider />
                <MenuBtn
                  disabled={removeVideoMutation.isPending}
                  onClick={() =>
                    selectedOwnChannelId &&
                    removeVideoMutation.mutate({
                      channelId: selectedOwnChannelId,
                      videoId: video.id,
                    })
                  }
                >
                  REMOVE FROM CHANNEL
                </MenuBtn>
                {removeVideoMutation.isError && (
                  <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
                    {(removeVideoMutation.error as Error)?.message ||
                      "Failed to remove from channel"}
                  </MenuLabel>
                )}
              </div>
            </MenuRow>
          </MenuItem>
        ))}
        {videos.length === 0 && <MenuItem $disabled>No videos added</MenuItem>}
      </MenuScrollList>
    </MenuOverlay>
  );
}
