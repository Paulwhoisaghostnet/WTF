import { useState, useCallback } from "react";
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

/**
 * Trimmed TV-channel type — only the fields My Videos needs to let
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
  summary: { channels: number; playlists: number };
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
  creatorAddress?: string;
}

/* ─── Styles ─────────────────────────────────────────── */

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
`;

const ToolBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
`;

const MediaCard = styled.div`
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  box-shadow: 1px 1px 0 #000;
  overflow: hidden;
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
`;

const MediaInfo = styled.div`
  padding: 6px 8px;
  font-size: 11px;
`;

const MediaTitle = styled.div`
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MediaMeta = styled.div`
  font-size: 9px;
  color: #555;
  margin-top: 2px;
`;

const LibGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 18vw, 220px), 1fr));
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
`;

const UploadArea = styled.div`
  border: 2px dashed #808080;
  background: #f0f0f0;
  padding: 20px;
  text-align: center;
  font-size: 12px;
  cursor: pointer;
  &:hover { background: #e8e8e8; }
`;

const ScrollWrap = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const MAX_UPLOAD_MB = 25;

/* ─── Component ──────────────────────────────────────── */

export function MyVideos() {
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [detailToken, setDetailToken] = useState<TokenCardData | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  /** Currently-open "add to channel" picker, keyed by media id. */
  const [addTargetId, setAddTargetId] = useState<number | null>(null);
  /** Selected channel id inside the open picker. */
  const [addChannelId, setAddChannelId] = useState<number | null>(null);
  /** Media id queued for delete; triggers the cascade-preview query. */
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const myMediaQuery = useQuery({
    queryKey: ["media-library", "video"],
    queryFn: () => api.get<MediaItem[]>("/api/media/mine?category=video"),
  });

  const myTokensQuery = useQuery({
    queryKey: ["profile-tokens-video-import"],
    queryFn: async () => {
      const res = await api.get<{ items: OwnedToken[] }>("/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=true");
      const created = res.items || [];
      const res2 = await api.get<{ items: OwnedToken[] }>("/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=false");
      const collected = res2.items || [];
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
    mutationFn: (body: { title: string; mimeType: string; fileData: string }) =>
      api.post("/api/media/upload", { ...body, mediaCategory: "video" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-library", "video"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/media/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-library", "video"] });
      qc.invalidateQueries({ queryKey: ["tv"] });
    },
  });

  // List of channels the current user owns.  Used to populate the
  // "Add to Channel" picker.  Always refreshed so a newly-created
  // channel shows up instantly.
  const myChannelsQuery = useQuery({
    queryKey: ["tv", "channels", "mine"],
    queryFn: () => api.get<TVChannelLite[]>("/api/tv/channels?mine=1"),
  });
  const myChannels = myChannelsQuery.data || [];

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

  const usageQuery = useQuery({
    queryKey: ["media-library", "usage", deleteTargetId],
    queryFn: () =>
      api.get<MediaUsageResponse>(`/api/media/${deleteTargetId}/usage`),
    enabled: Boolean(deleteTargetId),
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
      uploadMutation.mutate({ title, mimeType: file.type, fileData: dataUrl });
      setUploadTitle("");
    };
    reader.readAsDataURL(file);
  }, [uploadTitle, uploadMutation]);

  const mediaItems = (myMediaQuery.data || []) as MediaItem[];
  const tokens = (myTokensQuery.data || []) as OwnedToken[];

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
          (t.creatorAddress || "").toLowerCase().includes(q) ||
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

  return (
    <AppWindow title="📼 My Videos">
      <Content>
        <Tabs value={tab} onChange={(v: number) => setTab(v)}>
          <Tab value={0}>Library</Tab>
          <Tab value={1}>Import from Tokens</Tab>
          <Tab value={2}>Upload</Tab>
        </Tabs>
        <TabBody>
          {/* ─── Library tab ─── */}
          {tab === 0 && (
            <>
              {myMediaQuery.isLoading ? (
                <div style={{ textAlign: "center", padding: 16 }}>
                  <Hourglass size={32} />
                </div>
              ) : mediaItems.length === 0 ? (
                <p style={{ fontSize: 12, padding: 8 }}>
                  No videos in your library yet. Import from tokens or upload directly.
                </p>
              ) : (
                <LibGrid>
                  {mediaItems.map((item) => {
                    const isAddOpen = addTargetId === item.id;
                    const canAdd =
                      myChannels.length > 0 && item.status === "ready";
                    return (
                      <MediaCard key={item.id}>
                        <MediaThumb>
                          <video
                            src={getMediaPlaybackUrl(item)}
                            muted
                            playsInline
                            preload="metadata"
                            style={{ pointerEvents: "none" }}
                          />
                        </MediaThumb>
                        <MediaInfo>
                          <MediaTitle>{item.title}</MediaTitle>
                          <MediaMeta>
                            {item.mimeType}
                            {item.tokenContract && ` · Token`}
                            {item.fileSize && ` · ${(item.fileSize / 1024).toFixed(0)}KB`}
                            {item.status !== "ready" && ` · ${item.status}`}
                          </MediaMeta>
                          <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                            <Button
                              size="sm"
                              style={{ fontSize: 9, padding: "1px 5px" }}
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
                                setAddTargetId(isAddOpen ? null : item.id);
                                // Default to the first owned channel
                                // when the picker opens.
                                if (!isAddOpen && myChannels[0]) {
                                  setAddChannelId(myChannels[0].id);
                                }
                              }}
                            >
                              📺 {isAddOpen ? "Cancel" : "Add to Channel"}
                            </Button>
                            <Button
                              size="sm"
                              style={{ fontSize: 9, padding: "1px 5px" }}
                              disabled={deleteMutation.isPending}
                              onClick={() => setDeleteTargetId(item.id)}
                            >
                              Remove
                            </Button>
                          </div>
                          {isAddOpen && (
                            <div
                              style={{
                                marginTop: 6,
                                padding: 6,
                                background: "#e0e0e0",
                                border: "1px inset #aaa",
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              <Select
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
                                width={180}
                              />
                              <Button
                                size="sm"
                                style={{ fontSize: 9, padding: "1px 5px" }}
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
                                  ? "Adding..."
                                  : "Add"}
                              </Button>
                              {addMediaToChannel.isError && (
                                <p style={{ color: "red", fontSize: 9, margin: 0 }}>
                                  {(addMediaToChannel.error as Error)?.message ||
                                    "Failed to add"}
                                </p>
                              )}
                            </div>
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

          {/* ─── Import from Tokens tab ─── */}
          {tab === 1 && (
            <>
              <ToolBar>
                <TextInput
                  value={search}
                  onChange={(e: any) => setSearch(e.target?.value ?? "")}
                  placeholder="Search by name, creator, tag..."
                  style={{ flex: 1, minWidth: 160, fontSize: 11 }}
                />
                <span style={{ fontSize: 10, color: "#555", whiteSpace: "nowrap" }}>
                  {filteredTokens.length} of {videoTokens.length} video token{videoTokens.length !== 1 ? "s" : ""} 
                  {tokens.length > 0 ? ` (${tokens.length} total)` : ""}
                </span>
              </ToolBar>

              {myTokensQuery.isLoading ? (
                <div style={{ textAlign: "center", padding: 16 }}>
                  <Hourglass size={32} />
                </div>
              ) : filteredTokens.length === 0 ? (
                <p style={{ fontSize: 12, padding: 8 }}>
                  No video tokens found in your wallets. Sync your wallet in Profile.
                </p>
              ) : (
                <ScrollWrap>
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
          {tab === 2 && (
            <GroupBox label="Upload Video">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <TextInput
                  value={uploadTitle}
                  onChange={(e: any) => setUploadTitle(e.target?.value ?? "")}
                  placeholder="Video title (optional)"
                  style={{ fontSize: 11 }}
                />
                <UploadArea onClick={() => document.getElementById("video-upload-input")?.click()}>
                  {uploadMutation.isPending ? (
                    <Hourglass size={24} />
                  ) : (
                    <>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>📼</div>
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
                  <p style={{ color: "red", fontSize: 11 }}>Upload failed. Please try again.</p>
                )}
                {uploadMutation.isSuccess && (
                  <p style={{ color: "green", fontSize: 11 }}>Uploaded successfully!</p>
                )}
              </div>
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
 * CASCADE, which further cascades through tv_playlist_items — so a
 * single delete can sweep several channels/playlists at once.  This
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
`;
const ModalBox = styled.div`
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
  padding: 12px 14px;
  max-width: 520px;
  width: 90%;
  font-size: 12px;
  box-shadow: 2px 2px 0 #000;
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
  if (!item) return null;
  const channelCount = usage?.summary.channels ?? 0;
  const playlistCount = usage?.summary.playlists ?? 0;
  return (
    <ModalBackdrop onClick={onCancel}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px" }}>Remove &ldquo;{item.title}&rdquo;?</h3>
        {isLoading ? (
          <p>Checking where this media is used...</p>
        ) : channelCount === 0 ? (
          <p>This media isn&apos;t referenced by any TV channel playlists.</p>
        ) : (
          <>
            <p style={{ margin: "4px 0" }}>
              This will automatically remove the file from {channelCount}{" "}
              channel{channelCount === 1 ? "" : "s"} and {playlistCount}{" "}
              playlist{playlistCount === 1 ? "" : "s"}:
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
                    ? ` — ${row.playlists.map((p) => p.name).join(", ")}`
                    : ""}
                </li>
              ))}
            </ul>
          </>
        )}
        <p style={{ fontSize: 10, color: "#444" }}>
          This cannot be undone.
        </p>
        {error && (
          <p style={{ color: "red", fontSize: 11 }}>{error}</p>
        )}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Button size="sm" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isDeleting}
            primary
          >
            {isDeleting ? "Removing..." : "Confirm Remove"}
          </Button>
        </div>
      </ModalBox>
    </ModalBackdrop>
  );
}
