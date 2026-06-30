import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  TextInput,
  Hourglass,
  GroupBox,
  Tabs,
  Tab,
  TabBody,
  Select,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { TokenCard as SharedTokenCard, TokenDetailModal, TokenGrid, type TokenCardData, type TokenCardAction } from "../components/TokenCard";
import { api } from "../lib/api";
import { getTokenMimeType, isPlayableMime, cacheProxyUrl } from "../lib/media-resolve";
import { usePresentationShell } from "../lib/presentation-shell";
import {
  provenanceCreatorLabel,
  provenanceSupportLinks,
  readEmbeddedProvenance,
} from "../lib/provenance";
import {
  BumperAssignmentToggles,
  type BumperCategory,
  type MediaBumperAssignment,
} from "../features/media-library/BumperAssignmentToggles";
import {
  ChannelBucketsPanel,
  CommunityBumpersPanel,
  type MyVideoChannelDetail,
  type MyVideoChannelVideo,
  type MyVideoMediaItem,
} from "../features/media-library/MyVideoChannelBuckets";

/**
 * Trimmed TV-channel type: only the fields My Videos needs to let
 * the user drop media into a channel.  The full TVChannel lives in
 * shared/types; we inline a minimal shape here to avoid pulling in
 * the whole TV page module.
 */
interface TVChannelLite {
  id: number;
  slug: string;
  title: string;
  dialNumber?: number | null;
}

interface MediaUsageResponse {
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
  bumpers?: Array<{
    id: number;
    title: string;
    category: BumperCategory;
  }>;
  summary: { channels: number; playlists: number; bumpers?: number };
}

interface ChannelDetailResponse extends MyVideoChannelDetail {
  channel: TVChannelLite;
  videos: MyVideoChannelVideo[];
}

interface TVBumperLite extends MediaBumperAssignment {
  title: string;
  mimeType: string;
  fileSize: number;
  durationMs: number;
  createdAt: string;
}

/* ─── Types ──────────────────────────────────────────── */

interface MediaItem {
  id: number;
  title: string;
  description?: string;
  sourceType: string;
  sourceUrl: string;
  playbackUrl?: string;
  posterUrl?: string;
  mimeType: string;
  durationSeconds?: number;
  status: string;
  tokenContract?: string;
  tokenId?: string;
  mediaCategory: string;
  fileSize?: number;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

interface OwnedToken {
  id: number;
  contract: string;
  tokenId: string;
  balance: string;
  name?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  walletAddress: string;
  creatorName?: string;
  creatorAddress?: string;
  collectionName?: string;
}

/* ─── Styles ─────────────────────────────────────────── */

const gammaMyVideosScope = `[data-my-videos-presentation-host="gamma"]`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;

  &[data-my-videos-presentation-host="gamma"] {
    background: #080807;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 4px;
  }

  &[data-my-videos-presentation-host="gamma"] [data-my-videos-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-my-videos-presentation-host="gamma"] button,
  &[data-my-videos-presentation-host="gamma"] input,
  &[data-my-videos-presentation-host="gamma"] select {
    font-family: inherit;
  }

  &[data-my-videos-presentation-host="gamma"] fieldset {
    background: rgba(17, 17, 15, 0.96);
    border: 1px solid rgba(242, 234, 217, 0.2);
    border-radius: 6px;
    box-shadow: none;
  }

  &[data-my-videos-presentation-host="gamma"] legend {
    color: #00d2ff;
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }
`;

const ToolBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;

  ${gammaMyVideosScope} & {
    background: rgba(12, 12, 11, 0.86);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    padding: 6px;
  }
`;

const MediaCard = styled.div`
  background: var(--wtf-app-surface-raised, #c0c0c0);
  border: 2px outset #dfdfdf;
  display: flex;
  flex-direction: column;
  cursor: pointer;
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

const MediaThumb = styled.div`
  width: 100%;
  aspect-ratio: 16/9;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  video, img { max-width: 100%; max-height: 100%; object-fit: contain; }

  ${gammaMyVideosScope} & {
    background: #050505;
    border-bottom: 1px solid rgba(242, 234, 217, 0.14);
  }
`;

const MediaInfo = styled.div`
  padding: 8px;
  font-size: var(--wtf-type-caption, 13px);
`;

const MediaTitle = styled.div`
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

const MediaMeta = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  line-height: 1.3;
  margin-top: 3px;

  ${gammaMyVideosScope} & {
    color: rgba(242, 234, 217, 0.66);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }

  ${gammaMyVideosScope} & a {
    color: #00d2ff;
  }
`;

const CardActions = styled.div`
  margin-top: 6px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;

  button {
    min-height: 32px;
    font-size: var(--wtf-type-caption, 13px);
  }

  ${gammaMyVideosScope} & {
    border-top: 1px solid rgba(242, 234, 217, 0.14);
    padding-top: 6px;
  }
`;

const BumperWrap = styled.div`
  margin-top: 8px;

  ${gammaMyVideosScope} & {
    border-top: 1px solid rgba(242, 234, 217, 0.12);
    padding-top: 8px;
  }
`;

const InlinePanel = styled.div`
  margin-top: 8px;
  padding: 8px;
  background: var(--wtf-app-surface-raised, #e0e0e0);
  border: 1px inset var(--wtf-app-border, #aaa);
  display: flex;
  flex-direction: column;
  gap: 6px;

  ${gammaMyVideosScope} & {
    background: #0d0d0b;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const HintText = styled.p`
  margin: 0;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  line-height: 1.35;

  ${gammaMyVideosScope} & {
    color: rgba(242, 234, 217, 0.68);
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

const InlineMeta = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  white-space: nowrap;

  ${gammaMyVideosScope} & {
    color: rgba(242, 234, 217, 0.68);
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }
`;

const ChannelUsageRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
`;

const ChannelUsageLabel = styled.span`
  flex: 1;
  min-width: 0;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.3;
`;

const UploadForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const UploadIcon = styled.div`
  font-size: 24px;
  margin-bottom: 6px;
`;

const StateText = styled.p<{ $tone?: "danger" | "success" }>`
  margin: 4px 0 0;
  font-size: var(--wtf-type-caption, 13px);
  color: ${(p) =>
    p.$tone === "success"
      ? "var(--wtf-app-success, #166534)"
      : "var(--wtf-app-danger, #b00020)"};
  line-height: 1.35;

  ${gammaMyVideosScope} & {
    color: ${(p) => (p.$tone === "success" ? "#d6ff3f" : "#ff9d8c")};
    font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  }
`;

const LibGrid = styled.div`
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

const UploadArea = styled.div`
  border: 2px dashed #808080;
  background: var(--wtf-app-surface, #f0f0f0);
  padding: 20px;
  text-align: center;
  min-height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  font-size: var(--wtf-type-body, 14px);
  line-height: 1.35;
  cursor: pointer;

  &:hover {
    background: var(--wtf-app-surface-raised, #e8e8e8);
  }

  ${gammaMyVideosScope} & {
    background: #0b0b0a;
    border: 1px dashed rgba(0, 210, 255, 0.54);
    border-radius: 6px;
    color: #f2ead9;
    min-height: 128px;
  }

  ${gammaMyVideosScope} &:hover {
    background: #10100e;
    border-color: #00d2ff;
  }
`;

const ScrollWrap = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const PanelSurface = styled.div`
  min-height: 0;

  ${gammaMyVideosScope} & {
    background: rgba(8, 8, 7, 0.78);
    border: 1px solid rgba(242, 234, 217, 0.12);
    border-radius: 6px;
    padding: 6px;
  }
`;

const MAX_UPLOAD_MB = 25;

/* ─── Component ──────────────────────────────────────── */

export function MyVideos() {
  const qc = useQueryClient();
  const presentation = usePresentationShell();
  const [tab, setTab] = useState(0);
  const [channelTab, setChannelTab] = useState(0);
  const [search, setSearch] = useState("");
  const [detailToken, setDetailToken] = useState<TokenCardData | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCreatorName, setUploadCreatorName] = useState("");
  /** Currently-open "add to channel" picker, keyed by media id. */
  const [addTargetId, setAddTargetId] = useState<number | null>(null);
  /** Selected channel id inside the open picker. */
  const [addChannelId, setAddChannelId] = useState<number | null>(null);
  /** Media id queued for delete; triggers the cascade-preview query. */
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  /** Media id currently expanded for per-channel detach actions. */
  const [manageTargetId, setManageTargetId] = useState<number | null>(null);
  /** Upload-only metadata editor state. */
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCreatorName, setEditCreatorName] = useState("");
  const [bumperErrors, setBumperErrors] = useState<Record<number, string>>({});

  const myMediaQuery = useQuery({
    queryKey: ["media-library", "video"],
    queryFn: () => api.get<MediaItem[]>("/api/media/mine?category=video"),
  });
  const mediaItems = Array.isArray(myMediaQuery.data)
    ? (myMediaQuery.data as MediaItem[])
    : [];

  const myTokensQuery = useQuery({
    queryKey: ["profile-tokens-video-import"],
    queryFn: async () => {
      const res = await api.get<{ items: OwnedToken[] }>("/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=true");
      const created = Array.isArray(res.items) ? res.items : [];
      const res2 = await api.get<{ items: OwnedToken[] }>("/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=false");
      const collected = Array.isArray(res2.items) ? res2.items : [];
      const seen = new Set(created.map((t) => `${t.contract}:${t.tokenId}`));
      const merged = [...created, ...collected.filter((t) => !seen.has(`${t.contract}:${t.tokenId}`))];
      return merged;
    },
  });

  const importMutation = useMutation({
    mutationFn: (body: { contract: string; tokenId: string }) =>
      api.post("/api/media/import-token", { ...body, mediaCategory: "video" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-library", "video"] }),
  });

  const uploadMutation = useMutation({
    mutationFn: (body: {
      title: string;
      mimeType: string;
      fileData: string;
      creatorName?: string;
    }) =>
      api.post("/api/media/upload", { ...body, mediaCategory: "video" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-library", "video"] });
      setUploadTitle("");
      setUploadCreatorName("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (body: { id: number; title: string; creatorName?: string }) =>
      api.put(`/api/media/${body.id}`, {
        title: body.title,
        creatorName: body.creatorName ?? "",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-library", "video"] });
      qc.invalidateQueries({ queryKey: ["tv"] });
      setEditTargetId(null);
      setEditTitle("");
      setEditCreatorName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/media/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-library", "video"] });
      qc.invalidateQueries({ queryKey: ["tv"] });
    },
  });

  // List of channels the current user owns.  Used to populate the
  // Channel picker. Always refreshed so a newly-created
  // channel shows up instantly.
  const myChannelsQuery = useQuery({
    queryKey: ["tv", "channels", "mine"],
    queryFn: () => api.get<TVChannelLite[]>("/api/tv/channels?mine=1"),
  });
  const myChannels = Array.isArray(myChannelsQuery.data) ? myChannelsQuery.data : [];

  const myBumpersQuery = useQuery({
    queryKey: ["tv", "bumpers", "mine"],
    queryFn: () => api.get<TVBumperLite[]>("/api/tv/bumpers"),
  });
  const myBumpers = Array.isArray(myBumpersQuery.data) ? myBumpersQuery.data : [];

  const myChannelDetailsQuery = useQuery({
    queryKey: [
      "tv",
      "channels",
      "mine",
      "details",
      myChannels.map((channel) => channel.id).join(","),
    ],
    queryFn: () =>
      Promise.all(
        myChannels.map((channel) =>
          api.get<ChannelDetailResponse>(`/api/tv/channels/${channel.id}`)
        )
      ),
    enabled: tab === 1 && myChannels.length > 0,
  });

  const bumperAssignments = useMemo(
    () => myBumpers.filter((bumper) => bumper.mediaItemId != null),
    [myBumpers]
  );

  const mediaById = useMemo(() => {
    const map = new Map<number, MediaItem>();
    for (const item of mediaItems) map.set(item.id, item);
    return map;
  }, [mediaItems]);

  const addMediaToChannel = useMutation({
    mutationFn: ({
      channelId,
      mediaItemId,
    }: {
      channelId: number;
      mediaItemId: number;
    }) =>
      api.post(`/api/tv/channels/${channelId}/videos`, { mediaItemId }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tv", "channel", vars.channelId] });
      qc.invalidateQueries({ queryKey: ["tv", "stream"] });
      setAddTargetId(null);
    },
  });

  const removeVideoFromChannel = useMutation({
    mutationFn: ({
      channelId,
      videoId,
    }: {
      channelId: number;
      videoId: number;
    }) => api.delete(`/api/tv/channels/${channelId}/videos/${videoId}`),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tv", "channel", vars.channelId] });
      qc.invalidateQueries({ queryKey: ["tv", "channels", "mine", "details"] });
      qc.invalidateQueries({ queryKey: ["tv", "stream"] });
    },
  });

  const toggleMediaBumper = useMutation({
    mutationFn: ({
      mediaItemId,
      category,
      enabled,
    }: {
      mediaItemId: number;
      category: BumperCategory;
      enabled: boolean;
    }) =>
      api.put<TVBumperLite | { ok: boolean }>(
        `/api/tv/media/${mediaItemId}/bumper`,
        { category, enabled }
      ),
    onSuccess: (_d, vars) => {
      setBumperErrors((prev) => {
        const next = { ...prev };
        delete next[vars.mediaItemId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "mine"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "community"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "pool"] });
      qc.invalidateQueries({ queryKey: ["tv", "stream"] });
    },
  });

  const detachMediaFromChannel = useMutation({
    mutationFn: ({
      channelId,
      mediaItemId,
    }: {
      channelId: number;
      mediaItemId: number;
    }) => api.delete(`/api/tv/channels/${channelId}/media/${mediaItemId}`),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["media-library", "usage", vars.mediaItemId] });
      qc.invalidateQueries({ queryKey: ["tv"] });
    },
  });

  const usageQuery = useQuery({
    queryKey: ["media-library", "usage", deleteTargetId],
    queryFn: () =>
      api.get<MediaUsageResponse>(`/api/media/${deleteTargetId}/usage`),
    enabled: Boolean(deleteTargetId),
  });

  const manageUsageQuery = useQuery({
    queryKey: ["media-library", "usage", manageTargetId],
    queryFn: () =>
      api.get<MediaUsageResponse>(`/api/media/${manageTargetId}/usage`),
    enabled: Boolean(manageTargetId),
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      alert(`File exceeds ${MAX_UPLOAD_MB}MB limit`);
      return;
    }
    if (!file.type.startsWith("video/") && file.type !== "image/gif") {
      alert("Only video files and GIFs are accepted");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const title = uploadTitle.trim() || file.name;
      uploadMutation.mutate({
        title,
        mimeType: file.type,
        fileData: dataUrl,
        creatorName: uploadCreatorName.trim() || undefined,
      });
    };
    reader.readAsDataURL(file);
  }, [uploadCreatorName, uploadTitle, uploadMutation]);

  const tokens = Array.isArray(myTokensQuery.data)
    ? (myTokensQuery.data as OwnedToken[])
    : [];

  const videoTokens = tokens.filter((t) => {
    const mime = getTokenMimeType(t.metadata);
    if (isPlayableMime(mime)) return true;
    const meta = t.metadata || {};
    const artifact = String(meta.artifactUri || "").toLowerCase();
    if (artifact.endsWith(".mp4") || artifact.endsWith(".webm") || artifact.endsWith(".mov") || artifact.endsWith(".gif")) return true;
    return false;
  });

  const filteredTokens = search
    ? videoTokens.filter((t) => {
        const q = search.toLowerCase();
        const meta = t.metadata || {};
        const creators = Array.isArray(meta.creators) ? meta.creators : [];
        const tags = Array.isArray(meta.tags) ? meta.tags : [];
        return (
          (t.name || "").toLowerCase().includes(q) ||
          t.contract.includes(q) ||
          t.tokenId.includes(q) ||
          (t.creatorName || "").toLowerCase().includes(q) ||
          (t.creatorAddress || "").toLowerCase().includes(q) ||
          (t.collectionName || "").toLowerCase().includes(q) ||
          creators.some((c: string) => String(c).toLowerCase().includes(q)) ||
          tags.some((tag: string) => String(tag).toLowerCase().includes(q))
        );
      })
    : videoTokens;

  const importedKeys = new Set(
    mediaItems
      .filter((m) => m.tokenContract && m.tokenId)
      .map((m) => `${m.tokenContract}:${m.tokenId}`)
  );

  const tokenActions = useCallback(
    (token: TokenCardData): TokenCardAction[] => {
      const key = `${token.contract}:${token.tokenId}`;
      const alreadyImported = importedKeys.has(key);
      return [
        {
          label: alreadyImported ? "Imported" : "Import",
          icon: alreadyImported ? "✓" : "📥",
          disabled: alreadyImported || importMutation.isPending,
          onClick: (t) => importMutation.mutate({ contract: t.contract, tokenId: t.tokenId }),
        },
      ];
    },
    [importedKeys, importMutation]
  );

  function getMediaPlaybackUrl(item: MediaItem): string {
    if (item.sourceType === "upload") return `/api/media/${item.id}/file`;
    if (item.playbackUrl) return cacheProxyUrl(item.playbackUrl);
    return cacheProxyUrl(item.sourceUrl);
  }

  function getOverlayCreatorName(item: MediaItem): string {
    const raw = item.metadata?.wtfTvOverlay?.creatorName;
    return typeof raw === "string" ? raw : "";
  }

  function getOverlayCollectionName(item: MediaItem): string {
    const raw = item.metadata?.wtfTvOverlay?.collectionName;
    return typeof raw === "string" ? raw : "";
  }

  function handleBumperToggle(
    item: MyVideoMediaItem,
    category: BumperCategory,
    enabled: boolean
  ) {
    setBumperErrors((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    toggleMediaBumper.mutate(
      { mediaItemId: item.id, category, enabled },
      {
        onError: (err: unknown) =>
          setBumperErrors((prev) => ({
            ...prev,
            [item.id]:
              (err as Error)?.message || "Failed to update bumper assignment",
          })),
      }
    );
  }

  const channelDetails = myChannelDetailsQuery.data || [];
  const selectedChannelDetail = channelDetails[channelTab] || null;

  return (
    <AppWindow title="📼 My Videos">
      <Content
        data-my-videos-presentation-host={presentation.host}
        data-my-videos-region="content"
      >
        <Tabs value={tab} onChange={(v: number) => setTab(v)}>
          <Tab value={0}>Library</Tab>
          <Tab value={1}>Channels</Tab>
          <Tab value={2}>Community Bumpers</Tab>
          <Tab value={3}>Import from Tokens</Tab>
          <Tab value={4}>Upload</Tab>
        </Tabs>
        <TabBody data-my-videos-region="tab-body">
          {/* ─── Library tab ─── */}
          {tab === 0 && (
            <>
              {myMediaQuery.isLoading ? (
                <div style={{ textAlign: "center", padding: 16 }}>
                  <Hourglass size={32} />
                </div>
              ) : mediaItems.length === 0 ? (
                <EmptyText>
                  No videos in your library yet. Import from tokens or upload directly.
                </EmptyText>
              ) : (
                <LibGrid data-my-videos-region="library-grid">
                  {mediaItems.map((item) => {
                    const isAddOpen = addTargetId === item.id;
                    const isManageOpen = manageTargetId === item.id;
                    const isEditOpen = editTargetId === item.id;
                    const canAdd =
                      myChannels.length > 0 && item.status === "ready";
                    const overlayCreator = getOverlayCreatorName(item);
                    const overlayCollection = getOverlayCollectionName(item);
                    const provenance = readEmbeddedProvenance(item);
                    const supportLink = provenanceSupportLinks(provenance)[0] || null;
                    return (
                      <MediaCard key={item.id} data-my-videos-region="media-card">
                        <MediaThumb data-my-videos-region="media-thumb">
                          <video
                            src={getMediaPlaybackUrl(item)}
                            muted
                            playsInline
                            preload="metadata"
                            style={{ pointerEvents: "none" }}
                          />
                        </MediaThumb>
                        <MediaInfo data-my-videos-region="media-info">
                          <MediaTitle>{item.title}</MediaTitle>
                          <MediaMeta>
                            {item.mimeType}
                            {item.tokenContract && ` · Token`}
                            {item.fileSize && ` · ${(item.fileSize / 1024).toFixed(0)}KB`}
                            {item.status !== "ready" && ` · ${item.status}`}
                          </MediaMeta>
                          {(overlayCreator || overlayCollection) && (
                            <MediaMeta>
                              {[
                                overlayCreator && `Creator · ${overlayCreator}`,
                                overlayCollection && `Collection · ${overlayCollection}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </MediaMeta>
                          )}
                          {item.sourceType === "upload" && !overlayCreator && (
                            <MediaMeta>
                              Creator · from your media
                            </MediaMeta>
                          )}
                          {provenance && (
                            <MediaMeta>
                              Provenance · {provenanceCreatorLabel(provenance)}
                              {supportLink && (
                                <>
                                  {" · "}
                                  <a href={supportLink.url} target="_blank" rel="noopener noreferrer">
                                    Support on Tezos
                                  </a>
                                </>
                              )}
                            </MediaMeta>
                          )}
                          <CardActions data-my-videos-region="card-actions">
                            <Button
                              size="sm"
                              disabled={!canAdd}
                              title={
                                !canAdd
                                  ? myChannels.length === 0
                                    ? "You don't own any TV channels yet"
                                    : `Media is ${item.status}`
                                  : "Add this video to one of your TV channels"
                              }
                              onClick={() => {
                                if (!canAdd) return;
                                setManageTargetId(null);
                                setDeleteTargetId(null);
                                setAddTargetId(isAddOpen ? null : item.id);
                                // Default to the first owned channel
                                // when the picker opens.
                                if (!isAddOpen && myChannels[0]) {
                                  setAddChannelId(myChannels[0].id);
                                }
                              }}
                            >
                              {isAddOpen ? "Cancel channel add" : "Add video to channel"}
                            </Button>
                            <Button
                              size="sm"
                              disabled={detachMediaFromChannel.isPending}
                              onClick={() => {
                                setDeleteTargetId(null);
                                setManageTargetId(isManageOpen ? null : item.id);
                              }}
                            >
                              {isManageOpen ? "Done managing channels" : "Manage video channels"}
                            </Button>
                            <Button
                              size="sm"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                setManageTargetId(null);
                                setDeleteTargetId(item.id);
                              }}
                            >
                              Delete video from library
                            </Button>
                            {item.sourceType === "upload" && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (isEditOpen) {
                                    setEditTargetId(null);
                                    return;
                                  }
                                  setEditTargetId(item.id);
                                  setEditTitle(item.title || "");
                                  setEditCreatorName(getOverlayCreatorName(item));
                                }}
                              >
                                {isEditOpen ? "Cancel credit edit" : "Edit video credits"}
                              </Button>
                            )}
                          </CardActions>
                          <BumperWrap data-my-videos-region="bumper-wrap">
                            <BumperAssignmentToggles
                              mediaItemId={item.id}
                              assignments={bumperAssignments}
                              disabled={item.status !== "ready"}
                              pending={toggleMediaBumper.isPending}
                              error={bumperErrors[item.id] || null}
                              onToggle={(category, enabled) =>
                                handleBumperToggle(item, category, enabled)
                              }
                            />
                          </BumperWrap>
                          {isEditOpen && (
                            <InlinePanel data-my-videos-region="inline-panel">
                              <TextInput
                                aria-label={`Title for ${item.title}`}
                                value={editTitle}
                                onChange={(e: any) =>
                                  setEditTitle(e.target?.value ?? "")
                                }
                                placeholder="Title"
                              />
                              <TextInput
                                aria-label={`Creator credit for ${item.title}`}
                                value={editCreatorName}
                                onChange={(e: any) =>
                                  setEditCreatorName(e.target?.value ?? "")
                                }
                                placeholder="Creator credit"
                              />
                              <HintText>
                                Leave creator blank and TV will say
                                {" "}
                                <strong>from your media</strong>.
                              </HintText>
                              <Button
                                size="sm"
                                disabled={updateMutation.isPending}
                                onClick={() =>
                                  updateMutation.mutate({
                                    id: item.id,
                                    title: editTitle.trim() || item.title,
                                    creatorName: editCreatorName.trim(),
                                  })
                                }
                              >
                                {updateMutation.isPending
                                  ? "Saving video credits..."
                                  : "Save video credits"}
                              </Button>
                              {updateMutation.isError && (
                                <StateText $tone="danger">
                                  {(updateMutation.error as Error)?.message ||
                                    "Failed to save"}
                                </StateText>
                              )}
                            </InlinePanel>
                          )}
                          {isAddOpen && (
                            <InlinePanel data-my-videos-region="inline-panel">
                              <Select
                                aria-label={`Channel for ${item.title}`}
                                value={addChannelId ?? undefined}
                                options={myChannels.map((c) => ({
                                  value: c.id,
                                  label: `CH ${
                                    typeof c.dialNumber === "number" && c.dialNumber > 0
                                      ? String(c.dialNumber).padStart(2, "0")
                                      : "--"
                                  } · ${c.title}`,
                                }))}
                                onChange={(sel: any) =>
                                  setAddChannelId(Number(sel.value))
                                }
                                width={220}
                              />
                              <Button
                                size="sm"
                                disabled={
                                  !addChannelId ||
                                  addMediaToChannel.isPending
                                }
                                onClick={() =>
                                  addChannelId &&
                                  addMediaToChannel.mutate({
                                    channelId: addChannelId,
                                    mediaItemId: item.id,
                                  })
                                }
                              >
                                {addMediaToChannel.isPending
                                  ? "Adding video to channel..."
                                  : "Add video to channel"}
                              </Button>
                              {addMediaToChannel.isError && (
                                <StateText $tone="danger">
                                  {(addMediaToChannel.error as Error)?.message ||
                                    "Failed to add"}
                                </StateText>
                              )}
                            </InlinePanel>
                          )}
                          {isManageOpen && (
                            <InlinePanel data-my-videos-region="inline-panel">
                              <HintText>
                                Remove this item from a channel without deleting
                                it from your library. This also removes it from
                                that channel&apos;s playlists.
                              </HintText>
                              {manageUsageQuery.isLoading ? (
                                <HintText>
                                  Checking channel attachments...
                                </HintText>
                              ) : (manageUsageQuery.data?.channels || []).length === 0 ? (
                                <HintText>
                                  This item is not attached to any channels yet.
                                </HintText>
                              ) : (
                                (manageUsageQuery.data?.channels || []).map((row) => (
                                  <ChannelUsageRow key={row.channel.id}>
                                    <ChannelUsageLabel>
                                      CH{" "}
                                      {row.channel.dialNumber != null
                                        ? String(row.channel.dialNumber).padStart(2, "0")
                                        : "--"}{" "}
                                      · {row.channel.title}
                                      {row.playlists.length > 0
                                        ? `, ${row.playlists
                                            .map((playlist) => playlist.name)
                                            .join(", ")}`
                                        : ""}
                                    </ChannelUsageLabel>
                                    <Button
                                      size="sm"
                                      disabled={detachMediaFromChannel.isPending}
                                      onClick={() =>
                                        detachMediaFromChannel.mutate({
                                          channelId: row.channel.id,
                                          mediaItemId: item.id,
                                        })
                                      }
                                    >
                                      Remove video from channel
                                    </Button>
                                  </ChannelUsageRow>
                                ))
                              )}
                              {detachMediaFromChannel.isError && (
                                <StateText $tone="danger">
                                  {(detachMediaFromChannel.error as Error)?.message ||
                                    "Failed to remove from channel"}
                                </StateText>
                              )}
                            </InlinePanel>
                          )}
                        </MediaInfo>
                      </MediaCard>
                    );
                  })}
                </LibGrid>
              )}

              {deleteTargetId !== null && (
                <DeleteCascadeModal
                  item={mediaItems.find((m) => m.id === deleteTargetId) || null}
                  usage={usageQuery.data || null}
                  isLoading={usageQuery.isLoading}
                  isDeleting={deleteMutation.isPending}
                  error={
                    (deleteMutation.error as Error | null)?.message || null
                  }
                  onCancel={() => setDeleteTargetId(null)}
                  onConfirm={() =>
                    deleteTargetId !== null &&
                    deleteMutation.mutate(deleteTargetId, {
                      onSuccess: () => setDeleteTargetId(null),
                    })
                  }
                />
              )}
            </>
          )}

          {/* ─── Channels tab ─── */}
          {tab === 1 && (
            <PanelSurface data-my-videos-region="channel-surface">
              <ChannelBucketsPanel
                channels={myChannels}
                channelTab={channelTab}
                setChannelTab={setChannelTab}
                isLoading={myChannelDetailsQuery.isLoading}
                selectedChannelDetail={selectedChannelDetail}
                mediaById={mediaById}
                bumperAssignments={bumperAssignments}
                bumperErrors={bumperErrors}
                bumperTogglePending={toggleMediaBumper.isPending}
                removeVideoPending={removeVideoFromChannel.isPending}
                removeVideoError={
                  removeVideoFromChannel.isError
                    ? (removeVideoFromChannel.error as Error)?.message ||
                      "Failed to remove from channel"
                    : null
                }
                onToggleBumper={handleBumperToggle}
                onRemoveVideo={(channelId, videoId) =>
                  removeVideoFromChannel.mutate({ channelId, videoId })
                }
              />
            </PanelSurface>
          )}

          {/* ─── Community Bumpers tab ─── */}
          {tab === 2 && (
            <PanelSurface data-my-videos-region="community-bumper-surface">
              <CommunityBumpersPanel
                isLoading={myBumpersQuery.isLoading}
                mediaItems={mediaItems}
                bumperAssignments={bumperAssignments}
                bumperErrors={bumperErrors}
                bumperTogglePending={toggleMediaBumper.isPending}
                onToggleBumper={handleBumperToggle}
              />
            </PanelSurface>
          )}

          {/* ─── Import from Tokens tab ─── */}
          {tab === 3 && (
            <>
              <ToolBar data-my-videos-region="token-toolbar">
                <TextInput
                  aria-label="Search video tokens"
                  value={search}
                  onChange={(e: any) => setSearch(e.target?.value ?? "")}
                  placeholder="Search by name, creator, tag..."
                  style={{ flex: 1, minWidth: 180 }}
                />
                <InlineMeta>
                  {filteredTokens.length} of {videoTokens.length} video token{videoTokens.length !== 1 ? "s" : ""} 
                  {tokens.length > 0 ? ` (${tokens.length} total)` : ""}
                </InlineMeta>
              </ToolBar>

              {myTokensQuery.isLoading ? (
                <div style={{ textAlign: "center", padding: 16 }}>
                  <Hourglass size={32} />
                </div>
              ) : filteredTokens.length === 0 ? (
                <EmptyText>
                  No video tokens found in your wallets. Sync your wallet in Profile.
                </EmptyText>
              ) : (
                <ScrollWrap data-my-videos-region="token-scroll">
                  <TokenGrid $size="md">
                    {filteredTokens.map((token) => (
                      <SharedTokenCard
                        key={`${token.contract}:${token.tokenId}`}
                        token={token}
                        actions={tokenActions(token)}
                        onClick={(t) => setDetailToken(t)}
                      />
                    ))}
                  </TokenGrid>
                </ScrollWrap>
              )}
            </>
          )}

          {/* ─── Upload tab ─── */}
          {tab === 4 && (
            <GroupBox label="Upload Video" data-my-videos-region="upload-panel">
              <UploadForm data-my-videos-region="upload-form">
                <TextInput
                  aria-label="Video upload title"
                  value={uploadTitle}
                  onChange={(e: any) => setUploadTitle(e.target?.value ?? "")}
                  placeholder="Video title (optional)"
                />
                <TextInput
                  aria-label="Video creator credit"
                  value={uploadCreatorName}
                  onChange={(e: any) =>
                    setUploadCreatorName(e.target?.value ?? "")
                  }
                  placeholder="Creator credit (optional)"
                />
                <HintText>
                  If left blank, TV credits the clip as
                  {" "}
                  <strong>from your media</strong>.
                </HintText>
                <UploadArea
                  data-my-videos-region="upload-area"
                  role="button"
                  tabIndex={0}
                  onClick={() => document.getElementById("video-upload-input")?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      document.getElementById("video-upload-input")?.click();
                    }
                  }}
                >
                  {uploadMutation.isPending ? (
                    <Hourglass size={24} />
                  ) : (
                    <>
                      <UploadIcon>📼</UploadIcon>
                      Click to upload a video file (max {MAX_UPLOAD_MB}MB)
                    </>
                  )}
                </UploadArea>
                <input
                  id="video-upload-input"
                  type="file"
                  accept="video/*,image/gif"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />
                {uploadMutation.isError && (
                  <StateText $tone="danger">Upload failed. Please try again.</StateText>
                )}
                {uploadMutation.isSuccess && (
                  <StateText $tone="success">Uploaded successfully.</StateText>
                )}
              </UploadForm>
            </GroupBox>
          )}
        </TabBody>

        {detailToken && (
          <TokenDetailModal
            token={detailToken}
            onClose={() => setDetailToken(null)}
            actions={tokenActions(detailToken)}
          />
        )}
      </Content>
    </AppWindow>
  );
}

/* ─── Delete cascade modal ─────────────────────────────────────────
 * Shown whenever the user clicks "Remove" on a library card.  The
 * server-side FK on tv_channel_videos.media_item_id is ON DELETE
 * CASCADE, which further cascades through tv_playlist_items. This
 * modal previews that impact before the user commits, using the
 * cascade-preview endpoint the backend exposes at /api/media/:id/usage.
 */
const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;

  &[data-media-delete-presentation-host="gamma"] {
    background: rgba(7, 7, 6, 0.82);
    color: #f2ead9;
  }
`;
const ModalBox = styled.div`
  background: var(--wtf-app-surface-raised, #c0c0c0);
  border: 2px outset #dfdfdf;
  padding: 12px 14px;
  max-width: 520px;
  width: 90%;
  font-size: var(--wtf-type-body, 14px);
  line-height: 1.35;
  box-shadow: 2px 2px 0 #000;

  [data-media-delete-presentation-host="gamma"] & {
    background: #11110f;
    color: #f2ead9;
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 6px;
    box-shadow: none;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

    h3 {
      margin: 0 0 8px;
      color: #f2ead9;
      font-size: 16px;
      line-height: 1.3;
      letter-spacing: 0;
    }

    ul {
      color: rgba(242, 234, 217, 0.82);
    }
  }
`;

const ModalWarning = styled.p`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);

  [data-media-delete-presentation-host="gamma"] & {
    color: #d6ff3f;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    letter-spacing: 0;
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  flex-wrap: wrap;

  button {
    min-height: 32px;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

interface DeleteCascadeModalProps {
  item: MediaItem | null;
  usage: MediaUsageResponse | null;
  isLoading: boolean;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteCascadeModal({
  item,
  usage,
  isLoading,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: DeleteCascadeModalProps) {
  const presentation = usePresentationShell();
  if (!item) return null;
  const channelCount = usage?.summary.channels ?? 0;
  const playlistCount = usage?.summary.playlists ?? 0;
  const bumperCount = usage?.summary.bumpers ?? 0;
  return (
    <ModalBackdrop
      data-media-delete-modal="true"
      data-media-delete-presentation-host={presentation.host}
      onClick={onCancel}
    >
      <ModalBox
        role="dialog"
        aria-modal="true"
        aria-label={`Delete video: ${item.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>
          Delete &ldquo;{item.title}&rdquo; from your library?
        </h3>
        {isLoading ? (
          <p>Checking where this media is used...</p>
        ) : channelCount === 0 && bumperCount === 0 ? (
          <p>This media isn&apos;t referenced by any TV channel playlists or bumper buckets.</p>
        ) : (
          <>
            <p style={{ margin: "4px 0" }}>
              This will automatically remove the file from {channelCount}{" "}
              channel{channelCount === 1 ? "" : "s"} and {playlistCount}{" "}
              playlist{playlistCount === 1 ? "" : "s"} plus {bumperCount}{" "}
              bumper bucket{bumperCount === 1 ? "" : "s"}:
            </p>
            <ul style={{ margin: "4px 0 8px", paddingLeft: 16 }}>
              {(usage?.channels || []).map((row) => (
                <li key={row.channel.id}>
                  CH{" "}
                  {row.channel.dialNumber != null
                    ? String(row.channel.dialNumber).padStart(2, "0")
                    : "--"}{" "}
                  · {row.channel.title}
                  {row.playlists.length > 0
                    ? `, ${row.playlists.map((p) => p.name).join(", ")}`
                    : ""}
                </li>
              ))}
              {(usage?.bumpers || []).map((bumper) => (
                <li key={`bumper-${bumper.id}`}>
                  {bumper.category === "community" ? "Community" : "Personal"}{" "}
                  bumper: {bumper.title}
                </li>
              ))}
            </ul>
          </>
        )}
        <ModalWarning>
          This cannot be undone.
        </ModalWarning>
        {error && (
          <StateText $tone="danger">{error}</StateText>
        )}
        <ModalActions>
          <Button size="sm" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isDeleting}
            primary
          >
            {isDeleting ? "Deleting video..." : "Delete video from library"}
          </Button>
        </ModalActions>
      </ModalBox>
    </ModalBackdrop>
  );
}
