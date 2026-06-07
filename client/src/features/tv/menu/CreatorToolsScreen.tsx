import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  MenuBtn,
  MenuDivider,
  MenuInput,
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuRow,
  MenuScrollList,
  MenuTitle,
} from "../TVChrome";
import type { ChannelDetailResponse, ScreenView, TVChannel } from "../types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type QueryLike<TData> = {
  data?: TData;
};

type MutationLike<TVariables = unknown> = {
  isPending?: boolean;
  mutate: (variables: TVariables) => void;
};

type ChannelEditDraft = {
  title: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  isPublic: boolean;
  slug: string;
  videosPerBumper: number;
};

type CreatorToolsScreenProps = {
  canCreateChannels: boolean;
  channelTitleDraft: string;
  createChannelMutation: MutationLike<string>;
  detailQuery: QueryLike<ChannelDetailResponse>;
  maxChannels: number;
  myChannelsQuery: QueryLike<TVChannel[]>;
  refreshSourcesMutation: MutationLike<number>;
  renderBackBtn: (label?: string) => ReactElement;
  selectedOwnChannelId: number | null;
  setChannelEditDraft: StateSetter<ChannelEditDraft>;
  setChannelTitleDraft: StateSetter<string>;
  setScreenView: StateSetter<ScreenView>;
  setSelectedOwnChannelId: StateSetter<number | null>;
};

export function CreatorToolsScreen({
  canCreateChannels,
  channelTitleDraft,
  createChannelMutation,
  detailQuery,
  maxChannels,
  myChannelsQuery,
  refreshSourcesMutation,
  renderBackBtn,
  selectedOwnChannelId,
  setChannelEditDraft,
  setChannelTitleDraft,
  setScreenView,
  setSelectedOwnChannelId,
}: CreatorToolsScreenProps) {
  const myChannels = myChannelsQuery.data || [];

  return (
    <MenuOverlay>
      <MenuTitle>
        <span>CREATOR TOOLS</span>
        {renderBackBtn("MENU")}
      </MenuTitle>

      <MenuLabel>MY CHANNELS</MenuLabel>
      <MenuScrollList>
        {myChannels.map((ch) => (
          <MenuItem
            key={ch.id}
            $selected={selectedOwnChannelId === ch.id}
            onClick={() => setSelectedOwnChannelId(ch.id)}
          >
            {ch.title}
            <MenuLabel> /{ch.slug}</MenuLabel>
          </MenuItem>
        ))}
        {myChannels.length === 0 && <MenuItem $disabled>No channels yet</MenuItem>}
      </MenuScrollList>

      {canCreateChannels && myChannels.length < maxChannels && (
        <MenuRow style={{ marginTop: 6 }}>
          <MenuInput
            value={channelTitleDraft}
            onChange={(e) => setChannelTitleDraft(e.target.value)}
            placeholder="New channel title..."
          />
          <MenuBtn
            $accent
            disabled={
              !channelTitleDraft.trim() || createChannelMutation.isPending
            }
            onClick={() => createChannelMutation.mutate(channelTitleDraft.trim())}
          >
            CREATE
          </MenuBtn>
        </MenuRow>
      )}

      <MenuDivider />
      <MenuLabel>
        Limit: {maxChannels} channel{maxChannels > 1 ? "s" : ""} for your role
      </MenuLabel>
      <MenuDivider />

      {selectedOwnChannelId && (
        <>
          <MenuDivider />
          <MenuLabel
            style={{
              color: "#ccff66",
              fontSize: "var(--wtf-type-caption, 13px)",
              letterSpacing: 0,
            }}
          >
            STEP 1: CHANNEL
          </MenuLabel>
          <MenuItem
            onClick={() => {
              const ch = myChannels.find((c) => c.id === selectedOwnChannelId);
              if (ch) {
                setChannelEditDraft({
                  title: ch.title,
                  description: ch.description || "",
                  logoUrl: ch.logoUrl || "",
                  bannerUrl: ch.bannerUrl || "",
                  isPublic: ch.isPublic !== false,
                  slug: ch.slug,
                  videosPerBumper:
                    typeof ch.videosPerBumper === "number"
                      ? ch.videosPerBumper
                      : 4,
                });
              }
              setScreenView("channel-edit");
            }}
          >
            EDIT CHANNEL DETAILS
          </MenuItem>

          <MenuDivider />
          <MenuLabel
            style={{
              color: "#ccff66",
              fontSize: "var(--wtf-type-caption, 13px)",
              letterSpacing: 0,
            }}
          >
            STEP 2: MEDIA
          </MenuLabel>
          <MenuItem onClick={() => setScreenView("add-tokens")}>
            ADD FROM TOKENS
            <MenuLabel> (import NFT video)</MenuLabel>
          </MenuItem>
          <MenuItem onClick={() => setScreenView("channel-videos")}>
            CHANNEL MEDIA
            <MenuLabel> ({(detailQuery.data?.videos || []).length} items)</MenuLabel>
          </MenuItem>
          <MenuItem onClick={() => setScreenView("bumpers")}>
            BUMPERS
            <MenuLabel> (transition clips)</MenuLabel>
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (selectedOwnChannelId && !refreshSourcesMutation.isPending) {
                refreshSourcesMutation.mutate(selectedOwnChannelId);
              }
            }}
            $disabled={refreshSourcesMutation.isPending}
          >
            {refreshSourcesMutation.isPending
              ? "REFRESHING..."
              : "REFRESH VIDEO SOURCES"}
            <MenuLabel> (fix missing audio / wrong URI)</MenuLabel>
          </MenuItem>

          <MenuDivider />
          <MenuLabel
            style={{
              color: "#ccff66",
              fontSize: "var(--wtf-type-caption, 13px)",
              letterSpacing: 0,
            }}
          >
            STEP 3: PLAYLIST
          </MenuLabel>
          <MenuItem onClick={() => setScreenView("playlists")}>PLAYLISTS</MenuItem>
          <MenuItem onClick={() => setScreenView("playlist-order")}>
            PLAYLIST EDITOR
            <MenuLabel> (add, remove, reorder)</MenuLabel>
          </MenuItem>

          <MenuDivider />
          <MenuLabel
            style={{
              color: "#ccff66",
              fontSize: "var(--wtf-type-caption, 13px)",
              letterSpacing: 0,
            }}
          >
            STEP 4: SCHEDULE
          </MenuLabel>
          <MenuItem onClick={() => setScreenView("schedule")}>
            24H SCHEDULE
            <MenuLabel> (program loop)</MenuLabel>
          </MenuItem>
          <MenuItem onClick={() => setScreenView("my-media")}>
            MY MEDIA LIBRARY
            <MenuLabel> (all imported media)</MenuLabel>
          </MenuItem>
        </>
      )}
    </MenuOverlay>
  );
}
