export type TVChannel = {
  id: number;
  ownerUserId: number;
  slug: string;
  title: string;
  description: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  isPublic?: boolean;
  ownerUsername?: string;
  ownerDisplayName?: string | null;
  /** Stable "TV dial" number — server-assigned, pinned for special
   * channels (1=root, 2=yoeshi, 3=WTF TV, 69=platform admin). */
  dialNumber?: number | null;
  /** Insert one bumper every N playlist items.  0 disables bumpers
   * for this channel.  Server clamps to [0, 20]. */
  videosPerBumper?: number;
};

export type TVVideo = {
  id: number;
  channelId: number;
  tokenContract: string;
  tokenId: string;
  sourceUri: string;
  title: string | null;
  mimeType: string;
  thumbnailUri: string | null;
  metadata: any;
  updatedAt: string;
};

export type TVPlaylist = {
  id: number;
  channelId: number;
  name: string;
  isActive: boolean;
  transitionSeconds: number;
  updatedAt: string;
};

export type TVPlaylistItem = {
  id: number;
  playlistId: number;
  videoId: number;
  sortOrder: number;
  durationSeconds: number;
};

export type PlaylistDraftItem = {
  videoId: number;
  durationSeconds: number;
};

export type PlayableToken = {
  id: number;
  tokenContract: string;
  tokenId: string;
  tokenName: string;
  tokenThumbnail: string | null;
  walletAddress: string;
  creatorAddress?: string | null;
  mimeType: string;
  sourceUri: string;
  title: string | null;
  metadata?: Record<string, any>;
  lastSeenAt?: string | null;
};

export type TokenSortMode =
  | "recent"
  | "name-asc"
  | "name-desc"
  | "contract"
  | "mime";

export type ChannelDetailResponse = {
  channel: TVChannel;
  canManage: boolean;
  videos: TVVideo[];
  playlists: TVPlaylist[];
  playlistItems: TVPlaylistItem[];
};

export type StreamQueueItem = {
  queueIndex: number;
  playlistIndex: number;
  itemId: number;
  videoId: number;
  title: string;
  mimeType: string;
  thumbnailUri: string | null;
  sourceUri: string;
  cacheUrl: string;
  durationSeconds: number;
  assetDurationSeconds: number;
  offsetSeconds: number;
  kind: "video" | "gif" | "bumper";
  /** Set by the server when the queue item is a bumper; the client
   * renders these via the normal <video> element with a tighter
   * load-cap.  Bumpers are interleaved by the server based on the
   * channel's videosPerBumper cadence. */
  isBumper?: boolean;
  bumperId?: number | null;
  // MTV-style overlay metadata — resolved server-side from token
  // metadata, address labels, or uploader fallback credits.
  creatorName?: string | null;
  creatorAddress?: string | null;
  collectionName?: string | null;
  mintedAtIso?: string | null;
  objktUrl?: string | null;
  addedByUsername?: string | null;
};

export type TVCurrentItemMeta = {
  itemId: number;
  videoId: number;
  sourceUri: string;
  mimeType: string;
  storedDurationSec: number;
  assetDurationSec: number;
  offsetSeconds: number;
  realDurationSec: number;
  isGif: boolean;
  gifPlannedMs: number;
  channelId: number | null;
};

export type StreamPayload = {
  channel: TVChannel;
  playlist: {
    id: number;
    name: string;
    transitionSeconds: number;
  } | null;
  scheduleLabel?: string | null;
  generatedAt: string;
  loopDurationSeconds: number;
  queue: StreamQueueItem[];
  current: StreamQueueItem | null;
  offline: boolean;
  bumperOnly?: boolean;
  message?: string;
};

export type TVBumper = {
  id: number;
  title: string;
  mimeType: string;
  fileSize: number;
  durationMs: number;
  category: "personal" | "community";
  createdAt: string;
};

export type BumperPoolItem = {
  id: number;
  mimeType: string;
  durationMs: number;
  category?: "personal" | "community";
  mediaUrl: string;
  credit: string;
};

export type CommunityBumper = {
  id: number;
  title: string;
  mimeType: string;
  durationMs: number;
  mediaUrl: string;
  credit: string;
  createdAt: string;
};

export type TVMediaItem = {
  id: number;
  ownerUserId: number;
  title: string;
  description: string | null;
  sourceType: "ipfs" | "upload" | "external";
  sourceUrl: string;
  playbackUrl: string | null;
  posterUrl: string | null;
  mimeType: string;
  durationSeconds: number | null;
  status: "draft" | "processing" | "ready" | "blocked";
  metadata: any;
  createdAt: string;
  updatedAt: string;
};

export type MediaUsageResponse = {
  mediaItemId: number;
  channels: Array<{
    channel: {
      id: number;
      title: string;
      slug: string;
      dialNumber: number | null;
    };
    playlists: Array<{ id: number; name: string }>;
  }>;
  summary: { channels: number; playlists: number };
};

export type TVScheduleEntry = {
  id: number;
  channelId: number;
  playlistId: number | null;
  label: string | null;
  startMinuteOfDay: number;
  endMinuteOfDay: number;
  sortOrder: number | null;
  createdAt: string;
  playlistName?: string | null;
};

export type ScreenView =
  | "tv"
  | "menu"
  | "channels"
  | "settings"
  | "creator"
  | "playlists"
  | "playlist-order"
  | "channel-videos"
  | "add-tokens"
  | "bumpers"
  | "my-media"
  | "media-form"
  | "channel-edit"
  | "schedule";
