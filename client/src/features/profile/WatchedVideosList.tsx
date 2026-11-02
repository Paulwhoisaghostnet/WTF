import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { useLocation } from "wouter";
import { UiButton, UiNotice } from "../../components/wtfos-ui";
import { api } from "../../lib/api";
import {
  type WatchedVideosResponse,
  watchedVideosQueryKey,
} from "../video-history/video-history";

const List = styled.ul`
  list-style: none;
  display: grid;
  gap: 8px;
  margin: 10px 0;
  padding: 0;
`;

const Item = styled.li`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #f4f4f4);

  strong {
    overflow-wrap: anywhere;
  }

  time {
    color: var(--wtf-app-muted-text, #384352);
    font-size: var(--wtf-type-caption, 13px);
  }
`;

function watchedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

export function WatchedVideosList({ userId }: { userId: number | null }) {
  const [, setLocation] = useLocation();
  const watchedQuery = useQuery({
    queryKey: watchedVideosQueryKey(userId ?? 0),
    queryFn: () => api.get<WatchedVideosResponse>("/api/profile/watched-videos"),
    enabled: userId !== null,
  });
  const videos = watchedQuery.data?.videos ?? [];

  return (
    <div>
      <p style={{ margin: "0 0 8px" }}>
        Videos you finished appear here. Your watch history stays with your account.
      </p>
      {watchedQuery.isLoading && <p role="status">Loading watched videos…</p>}
      {watchedQuery.isError && (
        <UiNotice tone="danger" role="alert">
          Your watched videos could not load. <UiButton size="sm" onClick={() => void watchedQuery.refetch()}>Retry</UiButton>
        </UiNotice>
      )}
      {!watchedQuery.isLoading && !watchedQuery.isError && videos.length === 0 && (
        <p data-watched-videos-empty="true">You have not finished a guide video yet.</p>
      )}
      {videos.length > 0 && (
        <List aria-label="Videos you have watched">
          {videos.map((video) => (
            <Item key={video.videoId} data-watched-video-id={video.videoId}>
              <strong>{video.title}</strong>
              <time dateTime={video.watchedAt}>Watched {watchedDate(video.watchedAt)}</time>
            </Item>
          ))}
        </List>
      )}
      <UiButton size="sm" onClick={() => setLocation("/faq")}>Open video guides</UiButton>
    </div>
  );
}
