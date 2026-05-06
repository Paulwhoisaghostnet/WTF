import { Button, GroupBox, Hourglass, Tab, Tabs } from "react95";
import styled from "styled-components";
import { cacheProxyUrl } from "../../lib/media-resolve";
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
`;

const Card = styled.div`
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
  display: flex;
  flex-direction: column;
  box-shadow: 1px 1px 0 #000;
  overflow: hidden;
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
`;

const Info = styled.div`
  padding: 6px 8px;
  font-size: 11px;
`;

const Title = styled.div`
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Meta = styled.div`
  font-size: 9px;
  color: #555;
  margin-top: 2px;
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
    <Card>
      <Thumb>
        <video
          src={mediaPlaybackUrl(item)}
          muted
          playsInline
          preload="metadata"
          style={{ pointerEvents: "none" }}
        />
      </Thumb>
      <Info>
        <Title>{item.title}</Title>
        <Meta>{item.mimeType}</Meta>
        <div style={{ marginTop: 6 }}>
          <BumperControls
            item={item}
            assignments={bumperAssignments}
            errors={bumperErrors}
            pending={bumperTogglePending}
            onToggle={onToggleBumper}
          />
        </div>
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
      <p style={{ fontSize: 12, padding: 8 }}>
        You do not own any TV channels yet.
      </p>
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
          <GroupBox label={`${selectedChannelDetail.channel.title} Media`}>
            {selectedChannelDetail.videos.length === 0 ? (
              <p style={{ fontSize: 12, padding: 8 }}>
                No media on this channel yet.
              </p>
            ) : (
              <Grid style={{ maxHeight: 360 }}>
                {selectedChannelDetail.videos.map((video) => {
                  const mediaItem = video.mediaItemId
                    ? mediaById.get(video.mediaItemId)
                    : null;
                  return (
                    <Card key={video.id}>
                      <Thumb>
                        <video
                          src={
                            mediaItem
                              ? mediaPlaybackUrl(mediaItem)
                              : channelVideoPlaybackUrl(video)
                          }
                          poster={video.thumbnailUri || undefined}
                          muted
                          playsInline
                          preload="metadata"
                          style={{ pointerEvents: "none" }}
                        />
                      </Thumb>
                      <Info>
                        <Title>
                          {mediaItem?.title || video.title || `Video #${video.id}`}
                        </Title>
                        <Meta>{video.mimeType}</Meta>
                        {mediaItem && (
                          <div style={{ marginTop: 6 }}>
                            <BumperControls
                              item={mediaItem}
                              assignments={bumperAssignments}
                              errors={bumperErrors}
                              pending={bumperTogglePending}
                              onToggle={onToggleBumper}
                            />
                          </div>
                        )}
                        {!mediaItem && (
                          <Meta>
                            Import this token into My Videos to use bumper toggles.
                          </Meta>
                        )}
                        <div style={{ marginTop: 6 }}>
                          <Button
                            size="sm"
                            style={{ fontSize: 9, padding: "1px 5px" }}
                            disabled={removeVideoPending}
                            onClick={() =>
                              onRemoveVideo(video.channelId, video.id)
                            }
                          >
                            Remove from Channel
                          </Button>
                        </div>
                        {removeVideoError && (
                          <p
                            style={{
                              color: "red",
                              fontSize: 9,
                              margin: "4px 0 0",
                            }}
                          >
                            {removeVideoError}
                          </p>
                        )}
                      </Info>
                    </Card>
                  );
                })}
              </Grid>
            )}
          </GroupBox>

          <GroupBox label="Bumpers on This Channel">
            {uniqueBumperMedia.length === 0 ? (
              <p style={{ fontSize: 12, padding: 8 }}>
                No media-library videos are assigned as bumpers yet.
              </p>
            ) : (
              <Grid style={{ maxHeight: 320 }}>
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
        <p style={{ fontSize: 12, padding: 8 }}>
          Pick a channel tab to view its media.
        </p>
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
      <p style={{ fontSize: 12, padding: 8 }}>
        No videos from your library are assigned to the community bumper bucket yet.
      </p>
    );
  }

  return (
    <Grid>
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
