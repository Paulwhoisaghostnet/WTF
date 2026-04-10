import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { Button, GroupBox, Hourglass, Select, TextInput } from "react95";
import styled, { keyframes } from "styled-components";
import {
  canCreateTvChannels,
  maxTvChannelsForRole,
  type UserRole,
} from "@shared/types";

type TVChannel = {
  id: number;
  ownerUserId: number;
  slug: string;
  title: string;
  description: string | null;
  ownerUsername?: string;
  ownerDisplayName?: string | null;
};

type TVVideo = {
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

type TVPlaylist = {
  id: number;
  channelId: number;
  name: string;
  isActive: boolean;
  transitionSeconds: number;
  updatedAt: string;
};

type TVPlaylistItem = {
  id: number;
  playlistId: number;
  videoId: number;
  sortOrder: number;
  durationSeconds: number;
};

type PlayableToken = {
  id: number;
  tokenContract: string;
  tokenId: string;
  tokenName: string;
  tokenThumbnail: string | null;
  walletAddress: string;
  mimeType: string;
  sourceUri: string;
  title: string | null;
};

type ChannelDetailResponse = {
  channel: TVChannel;
  canManage: boolean;
  videos: TVVideo[];
  playlists: TVPlaylist[];
  playlistItems: TVPlaylistItem[];
};

type StreamQueueItem = {
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
  offsetSeconds: number;
  kind: "video" | "gif";
};

type StreamPayload = {
  channel: TVChannel;
  playlist: {
    id: number;
    name: string;
    transitionSeconds: number;
  } | null;
  generatedAt: string;
  loopDurationSeconds: number;
  queue: StreamQueueItem[];
  current: StreamQueueItem | null;
  offline: boolean;
  message?: string;
};

const noise = keyframes`
  0% { transform: translate(0,0) scale(1); opacity: 0.35; }
  20% { transform: translate(-2%, 1%) scale(1.02); opacity: 0.45; }
  40% { transform: translate(1.5%, -1.5%) scale(1.01); opacity: 0.32; }
  60% { transform: translate(-1%, 2%) scale(1.03); opacity: 0.5; }
  80% { transform: translate(2%, -1%) scale(1.02); opacity: 0.4; }
  100% { transform: translate(0,0) scale(1); opacity: 0.36; }
`;

const Frame = styled.div`
  display: grid;
  grid-template-columns: 1fr minmax(280px, 330px);
  gap: 10px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const TvShell = styled.div`
  border: 2px solid #161616;
  background: linear-gradient(180deg, #3e3e3e 0%, #2a2a2a 60%, #1f1f1f 100%);
  padding: 10px;
  box-shadow: inset 0 0 0 2px #5a5a5a, 3px 3px 0 #0a0a0a;
`;

const Screen = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  border: 3px solid #0f0f0f;
  background: radial-gradient(circle at 50% 40%, #1f2a35 0%, #0a0f14 75%);
  overflow: hidden;
  border-radius: 8px;
`;

const ScanLines = styled.div`
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.03) 0px,
    rgba(255, 255, 255, 0.03) 1px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 3px
  );
  z-index: 5;
`;

const StaticLayer = styled.div`
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.16) 1px, transparent 1px),
    radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 3px 3px, 5px 5px;
  background-position: 0 0, 1px 2px;
  animation: ${noise} 220ms steps(4) infinite;
  z-index: 4;
`;

const OffLayer = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, #0c131b 0%, #04070a 70%);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6a7f96;
  font-size: 12px;
`;

const MediaVideo = styled.video`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 2;
  background: #000;
`;

const GifFrame = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 2;
  background: #000;
`;

const OSD = styled.div`
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 7;
  font-size: 11px;
  color: #d6eeff;
  background: rgba(0, 20, 36, 0.65);
  border: 1px solid rgba(120, 180, 220, 0.55);
  padding: 3px 6px;
  max-width: 82%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Controls = styled.div`
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 8px;
  align-items: center;

  @media (max-width: 860px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const Knob = styled.button<{ $active?: boolean }>`
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 2px solid #0e0e0e;
  background: ${({ $active }) =>
    $active
      ? "radial-gradient(circle at 36% 32%, #f8f4d2 0%, #c4b96f 55%, #988a3f 100%)"
      : "radial-gradient(circle at 36% 32%, #d8d8d8 0%, #8d8d8d 55%, #676767 100%)"};
  color: #111;
  font-size: 10px;
  font-weight: bold;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45), 1px 1px 0 #000;
`;

const SidePanel = styled.div`
  border: 2px solid #0f0f0f;
  background: linear-gradient(180deg, #dad6cd 0%, #c8c3b6 100%);
  box-shadow: inset 0 0 0 1px #f0ece4;
  min-height: 420px;
  padding: 8px;
`;

const MenuHead = styled.div`
  font-weight: bold;
  font-size: 12px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const MiniList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow: auto;
`;

const MiniItem = styled.div<{ $selected?: boolean }>`
  border: 1px solid ${({ $selected }) => ($selected ? "#0b468f" : "#6a6a6a")};
  background: ${({ $selected }) => ($selected ? "#e3f0ff" : "#f8f6f0")};
  padding: 6px;
  font-size: 11px;
`;

const Tiny = styled.div`
  font-size: 10px;
  color: #3d3d3d;
`;

const TokenGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 6px;
`;

const TokenCard = styled.div`
  border: 1px solid #808080;
  background: #fff;
  padding: 4px;
  font-size: 10px;
`;

function shortAddress(address: string | null | undefined): string {
  const value = String(address || "");
  if (value.length < 12) return value;
  return `${value.slice(0, 7)}...${value.slice(-5)}`;
}

function isGif(mimeType: string): boolean {
  return String(mimeType || "").toLowerCase() === "image/gif";
}

export function TV() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { address } = useWallet();
  const [powerOn, setPowerOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelView, setPanelView] = useState<"menu" | "videoboard">("menu");
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectedOwnChannelId, setSelectedOwnChannelId] = useState<number | null>(null);
  const [streamTick, setStreamTick] = useState(0);
  const [loadingSignal, setLoadingSignal] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [channelTitleDraft, setChannelTitleDraft] = useState("");
  const [playlistNameDraft, setPlaylistNameDraft] = useState("");
  const [playlistDraft, setPlaylistDraft] = useState<Array<{ videoId: number; durationSeconds: number }>>([]);
  const [playableSearch, setPlayableSearch] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const switchTimerRef = useRef<number | null>(null);

  const canCreateChannels = user ? canCreateTvChannels(user.role as UserRole) : false;
  const maxChannels = user ? maxTvChannelsForRole(user.role as UserRole) : 1;

  const channelsQuery = useQuery({
    queryKey: ["tv", "channels"],
    queryFn: () => api.get<TVChannel[]>("/api/tv/channels"),
    refetchInterval: 60_000,
  });

  const myChannelsQuery = useQuery({
    queryKey: ["tv", "channels", "mine"],
    queryFn: () => api.get<TVChannel[]>("/api/tv/channels?mine=1"),
    enabled: Boolean(user),
  });

  const streamQuery = useQuery({
    queryKey: ["tv", "stream", selectedChannelId, streamTick],
    queryFn: () =>
      api.get<StreamPayload>(
        `/api/tv/channels/${selectedChannelId}/stream?at=${Date.now()}`
      ),
    enabled: Boolean(powerOn && selectedChannelId),
    refetchInterval: powerOn ? 45_000 : false,
    staleTime: 5_000,
  });

  const detailQuery = useQuery({
    queryKey: ["tv", "channel", selectedOwnChannelId],
    queryFn: () =>
      api.get<ChannelDetailResponse>(`/api/tv/channels/${selectedOwnChannelId}`),
    enabled: Boolean(selectedOwnChannelId),
  });

  const playableTokensQuery = useQuery({
    queryKey: ["tv", "playable", playableSearch],
    queryFn: () =>
      api.get<{ items: PlayableToken[] }>(
        `/api/tv/me/playable-tokens?limit=120&q=${encodeURIComponent(playableSearch)}`
      ),
    enabled: Boolean(menuOpen && panelView === "videoboard" && address),
    staleTime: 30_000,
  });

  useEffect(() => {
    const channels = channelsQuery.data || [];
    if (channels.length === 0) {
      setSelectedChannelId(null);
      return;
    }
    if (!selectedChannelId || !channels.some((c) => c.id === selectedChannelId)) {
      setSelectedChannelId(channels[0]!.id);
    }
  }, [channelsQuery.data, selectedChannelId]);

  useEffect(() => {
    const mine = myChannelsQuery.data || [];
    if (mine.length === 0) {
      setSelectedOwnChannelId(null);
      return;
    }
    if (!selectedOwnChannelId || !mine.some((c) => c.id === selectedOwnChannelId)) {
      setSelectedOwnChannelId(mine[0]!.id);
    }
  }, [myChannelsQuery.data, selectedOwnChannelId]);

  useEffect(() => {
    if (!powerOn) {
      setLoadingSignal(false);
      setTransitioning(false);
      return;
    }
    setLoadingSignal(true);
    const timer = setTimeout(() => setLoadingSignal(false), 1400);
    return () => clearTimeout(timer);
  }, [powerOn, selectedChannelId]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
  }, [volume, streamQuery.data?.current?.videoId]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;
    const active = detail.playlists.find((p) => p.isActive) || detail.playlists[0] || null;
    if (!active) {
      setPlaylistDraft([]);
      return;
    }
    const byPlaylist = detail.playlistItems
      .filter((item) => item.playlistId === active.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    setPlaylistDraft(
      byPlaylist.map((item) => ({
        videoId: item.videoId,
        durationSeconds: Math.max(1, Number(item.durationSeconds || 1)),
      }))
    );
  }, [detailQuery.data?.channel.id, detailQuery.data?.playlists, detailQuery.data?.playlistItems]);

  useEffect(() => {
    const queue = streamQuery.data?.queue || [];
    if (!powerOn || queue.length === 0) return;

    const warm = queue.slice(1, 3);
    for (const item of warm) {
      if (isGif(item.mimeType)) {
        const img = new Image();
        img.src = item.cacheUrl;
      } else {
        const v = document.createElement("video");
        v.preload = "auto";
        v.src = item.cacheUrl;
      }
    }
  }, [streamQuery.data?.queue, powerOn]);

  const stepStream = () => {
    if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
    setTransitioning(true);
    window.setTimeout(() => {
      setTransitioning(false);
      setStreamTick((v) => v + 1);
    }, 900);
  };

  useEffect(() => {
    if (switchTimerRef.current) {
      window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }

    if (!powerOn || transitioning || loadingSignal) return;
    const current = streamQuery.data?.current;
    if (!current) return;

    const remainingMs = Math.max(
      400,
      Math.floor((current.durationSeconds - current.offsetSeconds) * 1000)
    );
    switchTimerRef.current = window.setTimeout(() => {
      stepStream();
    }, remainingMs);

    return () => {
      if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
    };
  }, [
    powerOn,
    transitioning,
    loadingSignal,
    streamQuery.data?.current?.videoId,
    streamQuery.data?.current?.offsetSeconds,
    streamQuery.data?.current?.durationSeconds,
  ]);

  const createChannelMutation = useMutation({
    mutationFn: (title: string) => api.post<{ channel: TVChannel }>("/api/tv/channels", { title }),
    onSuccess: () => {
      setChannelTitleDraft("");
      qc.invalidateQueries({ queryKey: ["tv", "channels"] });
      qc.invalidateQueries({ queryKey: ["tv", "channels", "mine"] });
    },
  });

  const createPlaylistMutation = useMutation({
    mutationFn: ({ channelId, name }: { channelId: number; name: string }) =>
      api.post<TVPlaylist>(`/api/tv/channels/${channelId}/playlists`, {
        name,
        isActive: false,
      }),
    onSuccess: () => {
      setPlaylistNameDraft("");
      if (selectedOwnChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "channel", selectedOwnChannelId] });
      }
    },
  });

  const setPlaylistActiveMutation = useMutation({
    mutationFn: ({ playlistId }: { playlistId: number }) =>
      api.put(`/api/tv/playlists/${playlistId}`, { isActive: true }),
    onSuccess: () => {
      if (selectedOwnChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "channel", selectedOwnChannelId] });
      }
      if (selectedChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "stream", selectedChannelId] });
      }
    },
  });

  const savePlaylistMutation = useMutation({
    mutationFn: ({
      playlistId,
      items,
    }: {
      playlistId: number;
      items: Array<{ videoId: number; durationSeconds: number }>;
    }) =>
      api.put(`/api/tv/playlists/${playlistId}/items`, {
        items: items.map((item, idx) => ({
          videoId: item.videoId,
          durationSeconds: Math.max(1, Math.floor(item.durationSeconds || 1)),
          sortOrder: idx,
        })),
      }),
    onSuccess: () => {
      if (selectedOwnChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "channel", selectedOwnChannelId] });
      }
      if (selectedChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "stream", selectedChannelId] });
      }
    },
  });

  const addVideoMutation = useMutation({
    mutationFn: ({ channelId, token }: { channelId: number; token: PlayableToken }) =>
      api.post(`/api/tv/channels/${channelId}/videos`, {
        tokenContract: token.tokenContract,
        tokenId: token.tokenId,
        sourceUri: token.sourceUri,
        mimeType: token.mimeType,
        title: token.title || token.tokenName,
        thumbnailUri: token.tokenThumbnail,
      }),
    onSuccess: () => {
      if (selectedOwnChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "channel", selectedOwnChannelId] });
      }
      if (selectedChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "stream", selectedChannelId] });
      }
    },
  });

  const removeVideoMutation = useMutation({
    mutationFn: ({ channelId, videoId }: { channelId: number; videoId: number }) =>
      api.delete(`/api/tv/channels/${channelId}/videos/${videoId}`),
    onSuccess: () => {
      if (selectedOwnChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "channel", selectedOwnChannelId] });
      }
      if (selectedChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "stream", selectedChannelId] });
      }
    },
  });

  const activePlaylist = useMemo(() => {
    const detail = detailQuery.data;
    if (!detail) return null;
    return detail.playlists.find((p) => p.isActive) || detail.playlists[0] || null;
  }, [detailQuery.data]);

  const playlistVideoMap = useMemo(() => {
    const map = new Map<number, TVVideo>();
    const videos = detailQuery.data?.videos || [];
    for (const video of videos) map.set(video.id, video);
    return map;
  }, [detailQuery.data?.videos]);

  const currentItem = streamQuery.data?.current || null;
  const showStatic =
    powerOn &&
    (loadingSignal || transitioning || streamQuery.isFetching || streamQuery.isLoading);

  const cycleChannel = () => {
    const channels = channelsQuery.data || [];
    if (channels.length === 0) return;
    if (!selectedChannelId) {
      setSelectedChannelId(channels[0]!.id);
      return;
    }
    const idx = channels.findIndex((c) => c.id === selectedChannelId);
    const next = channels[(idx + 1) % channels.length]!;
    setSelectedChannelId(next.id);
    setStreamTick((v) => v + 1);
  };

  const openVideoBoard = () => {
    setPanelView("videoboard");
    setMenuOpen(true);
  };

  const menuBody = (
    <div>
      {panelView === "menu" && (
        <>
          <MenuHead>
            <span>WTF TV Menu</span>
            <Button size="sm" onClick={() => setMenuOpen(false)}>
              Close
            </Button>
          </MenuHead>
          <GroupBox label="Channel">
            <Tiny style={{ marginBottom: 6 }}>
              Browse channels with the CH knob. Current channel:
            </Tiny>
            <MiniItem $selected>
              <div style={{ fontWeight: "bold", fontSize: 11 }}>
                {channelsQuery.data?.find((c) => c.id === selectedChannelId)?.title || "None"}
              </div>
              <Tiny>
                by{" "}
                {channelsQuery.data?.find((c) => c.id === selectedChannelId)?.ownerDisplayName ||
                  channelsQuery.data?.find((c) => c.id === selectedChannelId)?.ownerUsername ||
                  "unknown"}
              </Tiny>
            </MiniItem>
            <div style={{ marginTop: 6 }}>
              <Button size="sm" onClick={cycleChannel}>
                Next Channel
              </Button>
            </div>
          </GroupBox>

          <GroupBox label="Picture / Sound" style={{ marginTop: 8 }}>
            <Tiny>Volume</Tiny>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </GroupBox>

          <GroupBox label="Creator Tools" style={{ marginTop: 8 }}>
            {canCreateChannels ? (
              <>
                {(myChannelsQuery.data || []).length === 0 ? (
                  <Button size="sm" onClick={openVideoBoard}>
                    Add Channel
                  </Button>
                ) : (
                  <Button size="sm" onClick={openVideoBoard}>
                    Open Video Board
                  </Button>
                )}
                <Tiny style={{ marginTop: 6 }}>
                  Channel limit for your role: {maxChannels}
                </Tiny>
              </>
            ) : (
              <Tiny>
                Witness accounts can watch channels. Contestant+ can create channels.
              </Tiny>
            )}
          </GroupBox>
        </>
      )}

      {panelView === "videoboard" && (
        <>
          <MenuHead>
            <span>Video Board</span>
            <div style={{ display: "flex", gap: 4 }}>
              <Button size="sm" onClick={() => setPanelView("menu")}>
                Back
              </Button>
              <Button size="sm" onClick={() => setMenuOpen(false)}>
                Close
              </Button>
            </div>
          </MenuHead>

          <GroupBox label="My Channels">
            <MiniList>
              {(myChannelsQuery.data || []).map((channel) => (
                <MiniItem
                  key={channel.id}
                  $selected={selectedOwnChannelId === channel.id}
                  onClick={() => setSelectedOwnChannelId(channel.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div style={{ fontWeight: "bold" }}>{channel.title}</div>
                  <Tiny>/{channel.slug}</Tiny>
                </MiniItem>
              ))}
              {(myChannelsQuery.data || []).length === 0 && (
                <Tiny>No channels yet.</Tiny>
              )}
            </MiniList>

            {canCreateChannels &&
              (myChannelsQuery.data || []).length < maxChannels && (
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  <TextInput
                    value={channelTitleDraft}
                    onChange={(e: any) => setChannelTitleDraft(e.target.value)}
                    placeholder="New channel title"
                    fullWidth
                  />
                  <Button
                    size="sm"
                    disabled={!channelTitleDraft.trim() || createChannelMutation.isPending}
                    onClick={() => createChannelMutation.mutate(channelTitleDraft.trim())}
                  >
                    Create
                  </Button>
                </div>
              )}
          </GroupBox>

          {selectedOwnChannelId && detailQuery.data && (
            <>
              <GroupBox label="Playlists" style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <Select
                    value={activePlaylist?.id ?? ""}
                    onChange={(e: any) => {
                      const nextId = Number(e.value);
                      if (!nextId) return;
                      setPlaylistActiveMutation.mutate({ playlistId: nextId });
                    }}
                    options={(detailQuery.data.playlists || []).map((p) => ({
                      label: `${p.name}${p.isActive ? " (Active)" : ""}`,
                      value: String(p.id),
                    }))}
                    width={200}
                  />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <TextInput
                    value={playlistNameDraft}
                    onChange={(e: any) => setPlaylistNameDraft(e.target.value)}
                    placeholder="New playlist name"
                    fullWidth
                  />
                  <Button
                    size="sm"
                    disabled={!playlistNameDraft.trim() || createPlaylistMutation.isPending}
                    onClick={() =>
                      createPlaylistMutation.mutate({
                        channelId: selectedOwnChannelId,
                        name: playlistNameDraft.trim(),
                      })
                    }
                  >
                    Add
                  </Button>
                </div>
              </GroupBox>

              <GroupBox label="Playlist Order" style={{ marginTop: 8 }}>
                <MiniList style={{ maxHeight: 180 }}>
                  {playlistDraft.map((item, idx) => {
                    const video = playlistVideoMap.get(item.videoId);
                    return (
                      <MiniItem key={`${item.videoId}-${idx}`}>
                        <div style={{ fontWeight: "bold", fontSize: 11 }}>
                          {video?.title || `Video #${item.videoId}`}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <TextInput
                            value={String(item.durationSeconds)}
                            onChange={(e: any) => {
                              const next = [...playlistDraft];
                              next[idx] = {
                                ...next[idx]!,
                                durationSeconds: Math.max(
                                  1,
                                  Math.floor(Number(e.target.value) || 1)
                                ),
                              };
                              setPlaylistDraft(next);
                            }}
                            style={{ width: 60 }}
                          />
                          <Tiny style={{ alignSelf: "center" }}>sec</Tiny>
                          <Button
                            size="sm"
                            disabled={idx === 0}
                            onClick={() => {
                              if (idx === 0) return;
                              const next = [...playlistDraft];
                              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              setPlaylistDraft(next as any);
                            }}
                          >
                            ↑
                          </Button>
                          <Button
                            size="sm"
                            disabled={idx === playlistDraft.length - 1}
                            onClick={() => {
                              if (idx >= playlistDraft.length - 1) return;
                              const next = [...playlistDraft];
                              [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                              setPlaylistDraft(next as any);
                            }}
                          >
                            ↓
                          </Button>
                        </div>
                      </MiniItem>
                    );
                  })}
                  {playlistDraft.length === 0 && (
                    <Tiny>No videos in active playlist yet.</Tiny>
                  )}
                </MiniList>
                <div style={{ marginTop: 6 }}>
                  <Button
                    size="sm"
                    disabled={!activePlaylist || savePlaylistMutation.isPending}
                    onClick={() => {
                      if (!activePlaylist) return;
                      savePlaylistMutation.mutate({
                        playlistId: activePlaylist.id,
                        items: playlistDraft,
                      });
                    }}
                  >
                    Save Playlist
                  </Button>
                </div>
              </GroupBox>

              <GroupBox label="Channel Videos" style={{ marginTop: 8 }}>
                <MiniList style={{ maxHeight: 160 }}>
                  {detailQuery.data.videos.map((video) => (
                    <MiniItem key={video.id}>
                      <div style={{ fontWeight: "bold", fontSize: 11 }}>
                        {video.title || `Video #${video.id}`}
                      </div>
                      <Tiny>{video.mimeType}</Tiny>
                      <div style={{ marginTop: 4 }}>
                        <Button
                          size="sm"
                          disabled={removeVideoMutation.isPending}
                          onClick={() =>
                            removeVideoMutation.mutate({
                              channelId: selectedOwnChannelId,
                              videoId: video.id,
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </MiniItem>
                  ))}
                  {detailQuery.data.videos.length === 0 && (
                    <Tiny>No videos added yet.</Tiny>
                  )}
                </MiniList>
              </GroupBox>

              <GroupBox label="Add From Owned Tokens" style={{ marginTop: 8 }}>
                {!address && (
                  <Tiny style={{ marginBottom: 6 }}>
                    Connect wallet to add owned video/gif tokens to your channel.
                  </Tiny>
                )}
                <TextInput
                  value={playableSearch}
                  onChange={(e: any) => setPlayableSearch(e.target.value)}
                  placeholder="Search playable tokens"
                  fullWidth
                />
                <TokenGrid style={{ marginTop: 6, maxHeight: 220, overflow: "auto" }}>
                  {(playableTokensQuery.data?.items || []).map((token) => (
                    <TokenCard key={`${token.tokenContract}:${token.tokenId}`}>
                      <div style={{ fontWeight: "bold" }}>{token.tokenName}</div>
                      <Tiny>{token.mimeType}</Tiny>
                      <Tiny>{shortAddress(token.walletAddress)}</Tiny>
                      <div style={{ marginTop: 4 }}>
                        <Button
                          size="sm"
                          disabled={!address || addVideoMutation.isPending}
                          onClick={() =>
                            addVideoMutation.mutate({
                              channelId: selectedOwnChannelId,
                              token,
                            })
                          }
                        >
                          Add
                        </Button>
                      </div>
                    </TokenCard>
                  ))}
                </TokenGrid>
              </GroupBox>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <AppWindow title="WTF TV">
      <Frame>
        <TvShell>
          <Screen>
            {!powerOn && <OffLayer>Power off</OffLayer>}
            {powerOn && currentItem && isGif(currentItem.mimeType) && !showStatic && (
              <GifFrame src={currentItem.cacheUrl} alt={currentItem.title} />
            )}
            {powerOn && currentItem && !isGif(currentItem.mimeType) && !showStatic && (
              <MediaVideo
                ref={videoRef}
                src={currentItem.cacheUrl}
                autoPlay
                playsInline
                muted={false}
                controls={false}
                onLoadedMetadata={(e) => {
                  const offset = Number(currentItem.offsetSeconds || 0);
                  const element = e.currentTarget;
                  if (Number.isFinite(offset) && offset > 0 && offset < (element.duration || Infinity)) {
                    try {
                      element.currentTime = offset;
                    } catch {
                      // ignore seek errors for partially buffered streams
                    }
                  }
                  element.volume = volume;
                }}
                onEnded={() => {
                  // schedule still drives switching; this is just a fallback if media is shorter than expected.
                }}
              />
            )}
            {showStatic && <StaticLayer />}
            {powerOn && (
              <OSD>
                CH {selectedChannelId ?? "--"} ·{" "}
                {(streamQuery.data?.channel?.title || "No signal").slice(0, 56)}
              </OSD>
            )}
            <ScanLines />
          </Screen>

          <Controls>
            <div style={{ fontSize: 11, color: "#dfdfdf" }}>
              {streamQuery.isLoading ? (
                <>
                  <Hourglass size={16} /> Searching for signal...
                </>
              ) : streamQuery.data?.offline ? (
                streamQuery.data?.message || "No active stream"
              ) : currentItem ? (
                `${currentItem.title} · ${currentItem.kind.toUpperCase()}`
              ) : (
                "Power on to start channel loop"
              )}
            </div>
            <Knob
              $active={powerOn}
              title={powerOn ? "Power On" : "Power Off"}
              onClick={() => {
                setPowerOn((v) => !v);
                if (powerOn) {
                  setTransitioning(false);
                  setLoadingSignal(false);
                } else {
                  setStreamTick((v) => v + 1);
                }
              }}
            >
              PWR
            </Knob>
            <Knob title="Menu" onClick={() => setMenuOpen((v) => !v)}>
              MENU
            </Knob>
            <Knob title="Next Channel" onClick={cycleChannel}>
              CH
            </Knob>
          </Controls>
        </TvShell>

        <SidePanel>{menuOpen ? menuBody : <Tiny>Menu hidden. Press MENU to manage channels.</Tiny>}</SidePanel>
      </Frame>
    </AppWindow>
  );
}
