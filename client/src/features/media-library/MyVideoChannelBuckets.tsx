import { Button, GroupBox, Hourglass, Tab, Tabs } from "react95";
import styled from "styled-components";
import { cacheProxyUrl, resolveTokenThumbnail } from "../../lib/media-resolve";
import {
  BumperAssignmentToggles,
  type BumperCategory,
  type MediaBumperAssignment,
} from "./BumperAssignmentToggles";

export type MyVideoMediaItem = {
  id: number;
  title: string;
  sourceType: string;
  sourceUrl: string;
  playbackUrl?: string;
  mimeType: string;
  status: string;
};

export type MyVideoChannel = {
  id: number;
  title: string;
  dialNumber?: number | null;
};

export type MyVideoChannelVideo = {
  id: number;
  channelId: number;
  mediaItemId?: number | null;
  sourceUri: string;
  title?: string | null;
  mimeType: string;
  thumbnailUri?: string | null;
};

export type MyVideoChannelDetail = {
  channel: MyVideoChannel;
  videos: MyVideoChannelVideo[];
};

function recoveredPosterUrl(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  return resolveTokenThumbnail({ thumbnail: uri })?.src || uri;
}

type ChannelBucketsPanelProps = {
  channels: MyVideoChannel[];
  channelTab: number;
  setChannelTab: (value: number) => void;
  isLoading: boolean;
  selectedChannelDetail: MyVideoChannelDetail | null;
  mediaById: Map<number, MyVideoMediaItem>;
  bumperAssignments: MediaBumperAssignment[];
  bumperErrors: Record<number, string>;
  bumperTogglePending: boolean;
  removeVideoPending: boolean;
  removeVideoError?: string | null;
  onToggleBumper: (
    item: MyVideoMediaItem,
    category: BumperCategory,
    enabled: boolean
  ) => void;
  onRemoveVideo: (channelId: number, videoId: number) => void;
};

type CommunityBumpersPanelProps = {
  isLoading: boolean;
  mediaItems: MyVideoMediaItem[];
  bumperAssignments: MediaBumperAssignment[];
  bumperErrors: Record<number, string>;
  bumperTogglePending: boolean;
  onToggleBumper: (
    item: MyVideoMediaItem,
    category: BumperCategory,
    enabled: boolean
  ) => void;
};

const gammaMyVideosScope = `[data-my-videos-presentation-host="gamma"]`;

const ScrollWrap = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 18vw, 220px), 1fr));
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;

  ${gammaMyVideosScope} & {
    gap: 10px;
  }
`;

const Card = styled.div`
  background: var(--wtf-app-surface-raised, #c0c0c0);
  border: 2px outset #dfdfdf;
  display: flex;
  flex-direction: column;
  box-shadow: 1px 1px 0 #000;
  overflow: hidden;

  ${gammaMyVideosScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
    box-shadow: none;
  }
`;

const Thumb = styled.div`
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  video,
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  ${gammaMyVideosScope} & {
    background: #050505;
    border-bottom: 1px solid rgba(242, 234, 217, 0.14);
  }
`;

const Info = styled.div`
  padding: 8px;
  font-size: var(--wtf-type-caption, 13px);
`;

const Title = styled.div`
  font-weight: bold;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${gammaMyVideosScope} & {
    color: #f8f1df;
    font-weight: 700;
  }
`;

const Meta = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  line-height: 1.3;
  margin-top: 3px;

  ${gammaMyVideosScope} & {
    color: rgba(242, 234, 217, 0.66);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }
`;

const EmptyText = styled.p`
  margin: 0;
  padding: 8px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  line-height: 1.35;

  ${gammaMyVideosScope} & {
    color: rgba(242, 234, 217, 0.68);
  }
`;

const BumperWrap = styled.div`
  margin-top: 8px;

  ${gammaMyVideosScope} & {
    border-top: 1px solid rgba(242, 234, 217, 0.12);
    padding-top: 8px;
  }
`;

const CardActions = styled.div`
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  button {
    min-height: 32px;
    font-size: var(--wtf-type-caption, 13px);
  }

  ${gammaMyVideosScope} & {
    border-top: 1px solid rgba(242, 234, 217, 0.14);
    padding-top: 6px;
  }
`;

const ErrorText = styled.p`
  margin: 6px 0 0;
  color: var(--wtf-app-danger, #b00020);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;

  ${gammaMyVideosScope} & {
    color: #ff9d8c;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }
`;

function mediaPlaybackUrl(item: MyVideoMediaItem): string {
  if (item.sourceType === "upload") return `/api/media/${item.id}/file`;
  if (item.playbackUrl) return cacheProxyUrl(item.playbackUrl);
  return cacheProxyUrl(item.sourceUrl);
}

function channelVideoPlaybackUrl(video: MyVideoChannelVideo): string {
  if (video.sourceUri.startsWith("/")) return video.sourceUri;
  return cacheProxyUrl(video.sourceUri);
}

function uniqueMediaFromAssignments(
  assignments: MediaBumperAssignment[],
  mediaById: Map<number, MyVideoMediaItem>
): MyVideoMediaItem[] {
  return Array.from(
    new Map(
      assignments
        .map((assignment) =>
          assignment.mediaItemId ? mediaById.get(assignment.mediaItemId) : null
        )
        .filter((item): item is MyVideoMediaItem => Boolean(item))
        .map((item) => [item.id, item])
    ).values()
  );
}

function BumperControls(props: {
  item: MyVideoMediaItem;
  assignments: MediaBumperAssignment[];
  errors: Record<number, string>;
  pending: boolean;
  onToggle: (
    item: MyVideoMediaItem,
    category: BumperCategory,
    enabled: boolean
  ) => void;
}) {
  const { item, assignments, errors, pending, onToggle } = props;
  return (
    <BumperAssignmentToggles
      mediaItemId={item.id}
      assignments={assignments}
      disabled={item.status !== "ready"}
      pending={pending}
      error={errors[item.id] || null}
      onToggle={(category, enabled) => onToggle(item, category, enabled)}
    />
  );
}

function MediaCard(props: {
  item: MyVideoMediaItem;
  bumperAssignments: MediaBumperAssignment[];
  bumperErrors: Record<number, string>;
  bumperTogglePending: boolean;
  onToggleBumper: (
    item: MyVideoMediaItem,
    category: BumperCategory,
    enabled: boolean
  ) => void;
}) {
  const {
    item,
    bumperAssignments,
    bumperErrors,
    bumperTogglePending,
    onToggleBumper,
  } = props;
  return (
    <Card data-my-videos-region="channel-media-card">
      <Thumb data-my-videos-region="channel-media-thumb">
        <video
          src={mediaPlaybackUrl(item)}
          muted
          playsInline
          preload="metadata"
          style={{ pointerEvents: "none" }}
        />
      </Thumb>
      <Info data-my-videos-region="channel-media-info">
        <Title>{item.title}</Title>
        <Meta>{item.mimeType}</Meta>
        <BumperWrap data-my-videos-region="channel-bumper-wrap">
          <BumperControls
            item={item}
            assignments={bumperAssignments}
            errors={bumperErrors}
            pending={bumperTogglePending}
            onToggle={onToggleBumper}
          />
        </BumperWrap>
      </Info>
    </Card>
  );
}

export function ChannelBucketsPanel({
  channels,
  channelTab,
  setChannelTab,
  isLoading,
  selectedChannelDetail,
  mediaById,
  bumperAssignments,
  bumperErrors,
  bumperTogglePending,
  removeVideoPending,
  removeVideoError,
  onToggleBumper,
  onRemoveVideo,
}: ChannelBucketsPanelProps) {
  if (channels.length === 0) {
    return (
      <EmptyText>
        You do not own any TV channels yet.
      </EmptyText>
    );
  }

  const uniqueBumperMedia = uniqueMediaFromAssignments(
    bumperAssignments,
    mediaById
  );

  return (
    <>
      <Tabs
        value={Math.min(channelTab, channels.length - 1)}
        onChange={(value: number) => setChannelTab(value)}
      >
        {channels.map((channel, index) => (
          <Tab key={channel.id} value={index}>
            CH{" "}
            {typeof channel.dialNumber === "number" && channel.dialNumber > 0
              ? String(channel.dialNumber).padStart(2, "0")
              : "--"}
          </Tab>
        ))}
      </Tabs>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 16 }}>
          <Hourglass size={32} />
        </div>
      ) : selectedChannelDetail ? (
        <ScrollWrap>
          <GroupBox label={`${selectedChannelDetail.channel.title} Media`} data-my-videos-region="channel-panel">
            {selectedChannelDetail.videos.length === 0 ? (
              <EmptyText>
                No media on this channel yet.
              </EmptyText>
            ) : (
              <Grid style={{ maxHeight: 360 }} data-my-videos-region="channel-grid">
                {selectedChannelDetail.videos.map((video) => {
                  const mediaItem = video.mediaItemId
                    ? mediaById.get(video.mediaItemId)
                    : null;
                  return (
                    <Card key={video.id} data-my-videos-region="channel-media-card">
                      <Thumb data-my-videos-region="channel-media-thumb">
                        <video
                          src={
                            mediaItem
                              ? mediaPlaybackUrl(mediaItem)
                              : channelVideoPlaybackUrl(video)
                          }
                          poster={recoveredPosterUrl(video.thumbnailUri)}
                          muted
                          playsInline
                          preload="metadata"
                          style={{ pointerEvents: "none" }}
                        />
                      </Thumb>
                      <Info data-my-videos-region="channel-media-info">
                        <Title>
                          {mediaItem?.title || video.title || `Video #${video.id}`}
                        </Title>
                        <Meta>{video.mimeType}</Meta>
                        {mediaItem && (
                          <BumperWrap data-my-videos-region="channel-bumper-wrap">
                            <BumperControls
                              item={mediaItem}
                              assignments={bumperAssignments}
                              errors={bumperErrors}
                              pending={bumperTogglePending}
                              onToggle={onToggleBumper}
                            />
                          </BumperWrap>
                        )}
                        {!mediaItem && (
                          <Meta>
                            Import this token into My Videos to use bumper toggles.
                          </Meta>
                        )}
                        <CardActions data-my-videos-region="channel-actions">
                          <Button
                            size="sm"
                            disabled={removeVideoPending}
                            onClick={() =>
                              onRemoveVideo(video.channelId, video.id)
                            }
                          >
                            Remove from Channel
                          </Button>
                        </CardActions>
                        {removeVideoError && (
                          <ErrorText>
                            {removeVideoError}
                          </ErrorText>
                        )}
                      </Info>
                    </Card>
                  );
                })}
              </Grid>
            )}
          </GroupBox>

          <GroupBox label="Bumpers on This Channel" data-my-videos-region="channel-bumpers-panel">
            {uniqueBumperMedia.length === 0 ? (
              <EmptyText>
                No media-library videos are assigned as bumpers yet.
              </EmptyText>
            ) : (
              <Grid style={{ maxHeight: 320 }} data-my-videos-region="channel-bumper-grid">
                {uniqueBumperMedia.map((item) => (
                  <MediaCard
                    key={`channel-bumper-${item.id}`}
                    item={item}
                    bumperAssignments={bumperAssignments}
                    bumperErrors={bumperErrors}
                    bumperTogglePending={bumperTogglePending}
                    onToggleBumper={onToggleBumper}
                  />
                ))}
              </Grid>
            )}
          </GroupBox>
        </ScrollWrap>
      ) : (
        <EmptyText>
          Pick a channel tab to view its media.
        </EmptyText>
      )}
    </>
  );
}

export function CommunityBumpersPanel({
  isLoading,
  mediaItems,
  bumperAssignments,
  bumperErrors,
  bumperTogglePending,
  onToggleBumper,
}: CommunityBumpersPanelProps) {
  const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
  const communityBumperMedia = uniqueMediaFromAssignments(
    bumperAssignments.filter((assignment) => assignment.category === "community"),
    mediaById
  );

  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: 16 }}>
        <Hourglass size={32} />
      </div>
    );
  }

  if (communityBumperMedia.length === 0) {
    return (
      <EmptyText>
        No videos from your library are assigned to the community bumper bucket yet.
      </EmptyText>
    );
  }

  return (
    <Grid data-my-videos-region="community-bumper-grid">
      {communityBumperMedia.map((item) => (
        <MediaCard
          key={`community-bumper-${item.id}`}
          item={item}
          bumperAssignments={bumperAssignments}
          bumperErrors={bumperErrors}
          bumperTogglePending={bumperTogglePending}
          onToggleBumper={onToggleBumper}
        />
      ))}
    </Grid>
  );
}
