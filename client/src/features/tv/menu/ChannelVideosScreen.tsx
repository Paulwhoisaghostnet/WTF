import type { ReactElement } from "react";
import {
  MenuBtn,
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuRow,
  MenuScrollList,
  MenuTitle,
} from "../TVChrome";
import type { ChannelDetailResponse } from "../types";

type QueryLike<TData> = {
  data?: TData;
};

type MutationLike<TVariables> = {
  isPending?: boolean;
  mutate: (variables: TVariables) => void;
};

type ChannelVideosScreenProps = {
  detailQuery: QueryLike<ChannelDetailResponse>;
  removeVideoMutation: MutationLike<{ channelId: number; videoId: number }>;
  renderBackBtn: (label?: string) => ReactElement;
  selectedOwnChannelId: number | null;
};

export function ChannelVideosScreen({
  detailQuery,
  removeVideoMutation,
  renderBackBtn,
  selectedOwnChannelId,
}: ChannelVideosScreenProps) {
  const videos = detailQuery.data?.videos || [];

  return (
    <MenuOverlay>
      <MenuTitle>
        <span>CHANNEL VIDEOS</span>
        {renderBackBtn("CREATOR")}
      </MenuTitle>
      <MenuScrollList>
        {videos.map((video) => (
          <MenuItem key={video.id}>
            <MenuRow>
              <span style={{ flex: 1 }}>
                {video.title || `Video #${video.id}`}
              </span>
              <MenuLabel>{video.mimeType}</MenuLabel>
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
                REMOVE
              </MenuBtn>
            </MenuRow>
          </MenuItem>
        ))}
        {videos.length === 0 && <MenuItem $disabled>No videos added</MenuItem>}
      </MenuScrollList>
    </MenuOverlay>
  );
}
