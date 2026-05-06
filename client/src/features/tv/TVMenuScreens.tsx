import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  ChannelDetailResponse,
  CommunityBumper,
  MediaUsageResponse,
  PlayableToken,
  PlaylistDraftItem,
  ScreenView,
  StreamQueueItem,
  TokenSortMode,
  TVBumper,
  TVChannel,
  TVMediaItem,
  TVPlaylist,
  TVScheduleEntry,
  TVVideo,
} from "./types";
import { MenuBtn } from "./TVChrome";
import { AddTokensScreen } from "./menu/AddTokensScreen";
import { BumpersScreen } from "./menu/BumpersScreen";
import { ChannelEditScreen } from "./menu/ChannelEditScreen";
import { ChannelsScreen } from "./menu/ChannelsScreen";
import { ChannelVideosScreen } from "./menu/ChannelVideosScreen";
import { CreatorToolsScreen } from "./menu/CreatorToolsScreen";
import { MediaFormScreen } from "./menu/MediaFormScreen";
import { MenuRootScreen } from "./menu/MenuRootScreen";
import { MyMediaScreen } from "./menu/MyMediaScreen";
import { PlaylistOrderScreen } from "./menu/PlaylistOrderScreen";
import { PlaylistsScreen } from "./menu/PlaylistsScreen";
import { ScheduleScreen } from "./menu/ScheduleScreen";
import { SettingsScreen } from "./menu/SettingsScreen";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type QueryLike<TData> = {
  data?: TData;
  isLoading?: boolean;
  isError?: boolean;
};

type MutationLike<TVariables = any> = {
  isPending?: boolean;
  isError?: boolean;
  error?: unknown;
  mutate: (
    variables: TVariables,
    options?: { onSuccess?: (...args: any[]) => void }
  ) => void;
};

type QueryClientLike = {
  invalidateQueries: (...args: any[]) => unknown;
};

type BumperCategory = "personal" | "community";

type ChannelEditDraft = {
  title: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  isPublic: boolean;
  slug: string;
  videosPerBumper: number;
};

type ScheduleFormDraft = {
  playlistId: string;
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
  label: string;
};

export type TVMenuScreensProps = {
  screenView: ScreenView;
  setScreenView: StateSetter<ScreenView>;
  goBack: () => void;
  canCreateChannels: boolean;
  currentChannel: TVChannel | undefined;
  currentItem: StreamQueueItem | null;
  channels: TVChannel[];
  selectedChannelId: number | null;
  setSelectedChannelId: StateSetter<number | null>;
  setStreamTick: StateSetter<number>;
  volume: number;
  setVolume: StateSetter<number>;
  dialDisplay: string;
  myChannelsQuery: QueryLike<TVChannel[]>;
  selectedOwnChannelId: number | null;
  setSelectedOwnChannelId: StateSetter<number | null>;
  maxChannels: number;
  channelTitleDraft: string;
  setChannelTitleDraft: StateSetter<string>;
  createChannelMutation: MutationLike<string>;
  detailQuery: QueryLike<ChannelDetailResponse>;
  refreshSourcesMutation: MutationLike<number>;
  channelEditDraft: ChannelEditDraft;
  setChannelEditDraft: StateSetter<ChannelEditDraft>;
  updateChannelMutation: MutationLike<{
    channelId: number;
    data: Record<string, unknown>;
  }>;
  editablePlaylist: TVPlaylist | null;
  setSelectedPlaylistEditorId: StateSetter<number | null>;
  playlistRenameDraft: string;
  setPlaylistRenameDraft: StateSetter<string>;
  renamePlaylistMutation: MutationLike<{ playlistId: number; name: string }>;
  setPlaylistActiveMutation: MutationLike<{ playlistId: number }>;
  playlistNameDraft: string;
  setPlaylistNameDraft: StateSetter<string>;
  createPlaylistMutation: MutationLike<{ channelId: number; name: string }>;
  playlistDraft: PlaylistDraftItem[];
  setPlaylistDraft: StateSetter<PlaylistDraftItem[]>;
  playlistVideoMap: Map<number, TVVideo>;
  availablePlaylistVideos: TVVideo[];
  savePlaylistMutation: MutationLike<{
    playlistId: number;
    items: Array<{ videoId: number; durationSeconds: number }>;
  }>;
  playableSearch: string;
  setPlayableSearch: StateSetter<string>;
  playableSort: TokenSortMode;
  setPlayableSort: StateSetter<TokenSortMode>;
  playableTokens: PlayableToken[];
  playableTokensQuery: QueryLike<{ items: PlayableToken[] }>;
  tokenPage: number;
  setTokenPage: StateSetter<number>;
  TOKENS_PER_PAGE: number;
  addVideoMutation: MutationLike<{ channelId: number; token: PlayableToken }>;
  removeVideoMutation: MutationLike<{ channelId: number; videoId: number }>;
  myBumpersQuery: QueryLike<TVBumper[]>;
  communityBumpersQuery: QueryLike<CommunityBumper[]>;
  bumperTitleDraft: string;
  setBumperTitleDraft: StateSetter<string>;
  bumperCategoryDraft: BumperCategory;
  setBumperCategoryDraft: StateSetter<BumperCategory>;
  bumperFileRef: MutableRefObject<HTMLInputElement | null>;
  uploadBumperMutation: MutationLike<{
    file: File;
    title: string;
    durationMs: number;
    category: BumperCategory;
  }>;
  updateBumperMutation: MutationLike<{
    bumperId: number;
    category: BumperCategory;
  }>;
  deleteBumperMutation: MutationLike<number>;
  myMediaQuery: QueryLike<TVMediaItem[]>;
  mediaAddTargetId: number | null;
  setMediaAddTargetId: StateSetter<number | null>;
  mediaManageTargetId: number | null;
  setMediaManageTargetId: StateSetter<number | null>;
  mediaDeleteTargetId: number | null;
  setMediaDeleteTargetId: StateSetter<number | null>;
  mediaUsageQuery: QueryLike<MediaUsageResponse>;
  mediaManageUsageQuery: QueryLike<MediaUsageResponse>;
  addMediaToChannelMutation: MutationLike<{
    channelId: number;
    mediaItemId: number;
  }>;
  detachMediaFromChannelMutation: MutationLike<{
    channelId: number;
    mediaItemId: number;
  }>;
  deleteMediaMutation: MutationLike<number>;
  qc: QueryClientLike;
  scheduleQuery: QueryLike<TVScheduleEntry[]>;
  scheduleFormDraft: ScheduleFormDraft;
  setScheduleFormDraft: StateSetter<ScheduleFormDraft>;
  createScheduleEntryMutation: MutationLike<{
    channelId: number;
    data: {
      playlistId: number;
      startMinuteOfDay: number;
      endMinuteOfDay: number;
      label?: string;
    };
  }>;
  deleteScheduleEntryMutation: MutationLike<{
    channelId: number;
    entryId: number;
  }>;
};

export function TVMenuScreens(props: TVMenuScreensProps) {
  const {
    screenView,
    setScreenView,
    goBack,
    canCreateChannels,
    currentChannel,
    currentItem,
    channels,
    selectedChannelId,
    setSelectedChannelId,
    setStreamTick,
    volume,
    setVolume,
    dialDisplay,
    myChannelsQuery,
    selectedOwnChannelId,
    setSelectedOwnChannelId,
    maxChannels,
    channelTitleDraft,
    setChannelTitleDraft,
    createChannelMutation,
    detailQuery,
    refreshSourcesMutation,
    channelEditDraft,
    setChannelEditDraft,
    updateChannelMutation,
    editablePlaylist,
    setSelectedPlaylistEditorId,
    playlistRenameDraft,
    setPlaylistRenameDraft,
    renamePlaylistMutation,
    setPlaylistActiveMutation,
    playlistNameDraft,
    setPlaylistNameDraft,
    createPlaylistMutation,
    playlistDraft,
    setPlaylistDraft,
    playlistVideoMap,
    availablePlaylistVideos,
    savePlaylistMutation,
    playableSearch,
    setPlayableSearch,
    playableSort,
    setPlayableSort,
    playableTokens,
    playableTokensQuery,
    tokenPage,
    setTokenPage,
    TOKENS_PER_PAGE,
    addVideoMutation,
    removeVideoMutation,
    myBumpersQuery,
    communityBumpersQuery,
    bumperTitleDraft,
    setBumperTitleDraft,
    bumperCategoryDraft,
    setBumperCategoryDraft,
    bumperFileRef,
    uploadBumperMutation,
    updateBumperMutation,
    deleteBumperMutation,
    myMediaQuery,
    mediaAddTargetId,
    setMediaAddTargetId,
    mediaManageTargetId,
    setMediaManageTargetId,
    mediaDeleteTargetId,
    setMediaDeleteTargetId,
    mediaUsageQuery,
    mediaManageUsageQuery,
    addMediaToChannelMutation,
    detachMediaFromChannelMutation,
    deleteMediaMutation,
    qc,
    scheduleQuery,
    scheduleFormDraft,
    setScheduleFormDraft,
    createScheduleEntryMutation,
    deleteScheduleEntryMutation,
  } = props;

  const renderBackBtn = (label = "BACK") => (
    <MenuBtn onClick={goBack}>{`< ${label}`}</MenuBtn>
  );


  switch (screenView) {
    case "menu":
      return (
        <MenuRootScreen
          canCreateChannels={canCreateChannels}
          currentChannel={currentChannel}
          currentItem={currentItem}
          setScreenView={setScreenView}
        />
      );

    case "channels":
      return (
        <ChannelsScreen
          channels={channels}
          renderBackBtn={renderBackBtn}
          selectedChannelId={selectedChannelId}
          setScreenView={setScreenView}
          setSelectedChannelId={setSelectedChannelId}
          setStreamTick={setStreamTick}
        />
      );

    case "settings":
      return (
        <SettingsScreen
          currentChannel={currentChannel}
          dialDisplay={dialDisplay}
          renderBackBtn={renderBackBtn}
          setVolume={setVolume}
          volume={volume}
        />
      );

    case "creator":
      return (
        <CreatorToolsScreen
          canCreateChannels={canCreateChannels}
          channelTitleDraft={channelTitleDraft}
          createChannelMutation={createChannelMutation}
          detailQuery={detailQuery}
          maxChannels={maxChannels}
          myChannelsQuery={myChannelsQuery}
          refreshSourcesMutation={refreshSourcesMutation}
          renderBackBtn={renderBackBtn}
          selectedOwnChannelId={selectedOwnChannelId}
          setChannelEditDraft={setChannelEditDraft}
          setChannelTitleDraft={setChannelTitleDraft}
          setScreenView={setScreenView}
          setSelectedOwnChannelId={setSelectedOwnChannelId}
        />
      );

    case "playlists":
      return (
        <PlaylistsScreen
          createPlaylistMutation={createPlaylistMutation}
          detailQuery={detailQuery}
          editablePlaylist={editablePlaylist}
          playlistNameDraft={playlistNameDraft}
          playlistRenameDraft={playlistRenameDraft}
          renamePlaylistMutation={renamePlaylistMutation}
          renderBackBtn={renderBackBtn}
          selectedOwnChannelId={selectedOwnChannelId}
          setPlaylistActiveMutation={setPlaylistActiveMutation}
          setPlaylistNameDraft={setPlaylistNameDraft}
          setPlaylistRenameDraft={setPlaylistRenameDraft}
          setScreenView={setScreenView}
          setSelectedPlaylistEditorId={setSelectedPlaylistEditorId}
        />
      );

    case "playlist-order":
      return (
        <PlaylistOrderScreen
          availablePlaylistVideos={availablePlaylistVideos}
          editablePlaylist={editablePlaylist}
          playlistDraft={playlistDraft}
          playlistVideoMap={playlistVideoMap}
          renderBackBtn={renderBackBtn}
          savePlaylistMutation={savePlaylistMutation}
          setPlaylistDraft={setPlaylistDraft}
        />
      );

    case "channel-videos":
      return (
        <ChannelVideosScreen
          detailQuery={detailQuery}
          removeVideoMutation={removeVideoMutation}
          renderBackBtn={renderBackBtn}
          selectedOwnChannelId={selectedOwnChannelId}
        />
      );

    case "add-tokens":
      return (
        <AddTokensScreen
          TOKENS_PER_PAGE={TOKENS_PER_PAGE}
          addVideoMutation={addVideoMutation}
          playableSearch={playableSearch}
          playableSort={playableSort}
          playableTokens={playableTokens}
          playableTokensQuery={playableTokensQuery}
          renderBackBtn={renderBackBtn}
          selectedOwnChannelId={selectedOwnChannelId}
          setPlayableSearch={setPlayableSearch}
          setPlayableSort={setPlayableSort}
          setTokenPage={setTokenPage}
          tokenPage={tokenPage}
        />
      );

    case "bumpers":
      return (
        <BumpersScreen
          bumperCategoryDraft={bumperCategoryDraft}
          bumperFileRef={bumperFileRef}
          bumperTitleDraft={bumperTitleDraft}
          communityBumpersQuery={communityBumpersQuery}
          deleteBumperMutation={deleteBumperMutation}
          myBumpersQuery={myBumpersQuery}
          renderBackBtn={renderBackBtn}
          setBumperCategoryDraft={setBumperCategoryDraft}
          setBumperTitleDraft={setBumperTitleDraft}
          updateBumperMutation={updateBumperMutation}
          uploadBumperMutation={uploadBumperMutation}
        />
      );

    case "my-media":
      return (
        <MyMediaScreen
          addMediaToChannelMutation={addMediaToChannelMutation}
          deleteMediaMutation={deleteMediaMutation}
          detachMediaFromChannelMutation={detachMediaFromChannelMutation}
          mediaAddTargetId={mediaAddTargetId}
          mediaDeleteTargetId={mediaDeleteTargetId}
          mediaManageTargetId={mediaManageTargetId}
          mediaManageUsageQuery={mediaManageUsageQuery}
          mediaUsageQuery={mediaUsageQuery}
          myChannelsQuery={myChannelsQuery}
          myMediaQuery={myMediaQuery}
          qc={qc}
          renderBackBtn={renderBackBtn}
          selectedChannelId={selectedChannelId}
          selectedOwnChannelId={selectedOwnChannelId}
          setMediaAddTargetId={setMediaAddTargetId}
          setMediaDeleteTargetId={setMediaDeleteTargetId}
          setMediaManageTargetId={setMediaManageTargetId}
        />
      );

    case "media-form":
      return (
        <MediaFormScreen
          renderBackBtn={renderBackBtn}
          setScreenView={setScreenView}
        />
      );

    case "channel-edit":
      return (
        <ChannelEditScreen
          channelEditDraft={channelEditDraft}
          myChannelsQuery={myChannelsQuery}
          renderBackBtn={renderBackBtn}
          selectedOwnChannelId={selectedOwnChannelId}
          setChannelEditDraft={setChannelEditDraft}
          updateChannelMutation={updateChannelMutation}
        />
      );

    case "schedule":
      return (
        <ScheduleScreen
          createScheduleEntryMutation={createScheduleEntryMutation}
          deleteScheduleEntryMutation={deleteScheduleEntryMutation}
          detailQuery={detailQuery}
          renderBackBtn={renderBackBtn}
          scheduleFormDraft={scheduleFormDraft}
          scheduleQuery={scheduleQuery}
          selectedOwnChannelId={selectedOwnChannelId}
          setScheduleFormDraft={setScheduleFormDraft}
        />
      );

    default:
      return null;
  }

}
