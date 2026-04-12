import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import styled, { keyframes, css } from "styled-components";
import {
  canCreateTvChannels,
  maxTvChannelsForRole,
  type UserRole,
} from "@shared/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

type ScreenView =
  | "tv"
  | "menu"
  | "channels"
  | "settings"
  | "creator"
  | "playlists"
  | "playlist-order"
  | "channel-videos"
  | "add-tokens";

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const noise = keyframes`
  0%   { transform: translate(0,0) scale(1); opacity:.35 }
  20%  { transform: translate(-2%,1%) scale(1.02); opacity:.45 }
  40%  { transform: translate(1.5%,-1.5%) scale(1.01); opacity:.32 }
  60%  { transform: translate(-1%,2%) scale(1.03); opacity:.5 }
  80%  { transform: translate(2%,-1%) scale(1.02); opacity:.4 }
  100% { transform: translate(0,0) scale(1); opacity:.36 }
`;

const flicker = keyframes`
  0%,100% { opacity:1 }
  92% { opacity:1 }
  93% { opacity:.6 }
  94% { opacity:1 }
`;

const powerOnGlow = keyframes`
  0%   { transform: scaleY(0.005) scaleX(0.8); filter: brightness(8) }
  40%  { transform: scaleY(0.005) scaleX(1); filter: brightness(5) }
  60%  { transform: scaleY(1) scaleX(1); filter: brightness(1.5) }
  100% { transform: scaleY(1) scaleX(1); filter: brightness(1) }
`;

/* ------------------------------------------------------------------ */
/*  Cabinet + Physical TV Styled Components                            */
/* ------------------------------------------------------------------ */

const Cabinet = styled.div`
  max-width: 860px;
  margin: 0 auto;
  background: linear-gradient(
    180deg,
    #6b4226 0%,
    #5a3520 12%,
    #4e2e1b 40%,
    #3e2414 70%,
    #2d1a0e 100%
  );
  border-radius: 14px 14px 8px 8px;
  border: 3px solid #2a1508;
  box-shadow:
    inset 0 1px 0 rgba(255, 220, 160, 0.15),
    inset 0 -2px 6px rgba(0, 0, 0, 0.5),
    0 6px 24px rgba(0, 0, 0, 0.5),
    0 2px 4px rgba(0, 0, 0, 0.4);
  padding: 18px 18px 14px;
  position: relative;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      90deg,
      rgba(120, 80, 40, 0.08) 0px,
      rgba(120, 80, 40, 0.08) 1px,
      transparent 1px,
      transparent 3px
    );
    pointer-events: none;
  }
`;

const BrandStrip = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 10px;
`;

const BrandName = styled.div`
  font-family: "Georgia", "Times New Roman", serif;
  font-weight: bold;
  font-size: 18px;
  letter-spacing: 4px;
  color: #d4a855;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6), 0 0 6px rgba(212, 168, 85, 0.25);
  text-transform: uppercase;
`;

const ModelLabel = styled.div`
  font-family: "Courier New", monospace;
  font-size: 9px;
  color: #8a6a3e;
  letter-spacing: 1px;
`;

const BodyRow = styled.div`
  display: flex;
  gap: 0;

  @media (max-width: 700px) {
    flex-direction: column;
  }
`;

const ScreenBay = styled.div`
  flex: 1;
  min-width: 0;
`;

const ScreenBezel = styled.div`
  background: #1a1a1a;
  border: 3px solid #0a0a0a;
  border-radius: 10px;
  padding: 10px;
  box-shadow:
    inset 0 0 8px rgba(0, 0, 0, 0.8),
    inset 0 0 2px rgba(255, 255, 255, 0.05);
`;

const CRTScreen = styled.div<{ $on: boolean }>`
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 6px;
  overflow: hidden;
  background: radial-gradient(
    ellipse at 50% 45%,
    #141e28 0%,
    #0a1018 50%,
    #040608 100%
  );

  ${({ $on }) =>
    $on &&
    css`
      box-shadow: inset 0 0 40px rgba(100, 180, 255, 0.04);
    `}
`;

const ScanLines = styled.div`
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.025) 0px,
    rgba(255, 255, 255, 0.025) 1px,
    rgba(0, 0, 0, 0.04) 2px,
    rgba(0, 0, 0, 0.04) 3px
  );
  z-index: 10;
  border-radius: 6px;
`;

const CRTCurve = styled.div`
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 6px;
  box-shadow:
    inset 0 0 60px 10px rgba(0, 0, 0, 0.25),
    inset 0 0 4px rgba(0, 0, 0, 0.5);
  z-index: 11;
`;

const StaticLayer = styled.div`
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
      circle,
      rgba(255, 255, 255, 0.16) 1px,
      transparent 1px
    ),
    radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 3px 3px, 5px 5px;
  background-position: 0 0, 1px 2px;
  animation: ${noise} 220ms steps(4) infinite;
  z-index: 4;
`;

const PowerOnFlash = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 50%,
    rgba(140, 200, 255, 0.6) 0%,
    rgba(60, 120, 180, 0.2) 40%,
    transparent 70%
  );
  animation: ${powerOnGlow} 0.6s ease-out forwards;
  z-index: 8;
`;

const OffScreen = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, #0c131b 0%, #020406 70%);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
`;

const PowerDot = styled.div<{ $on: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $on }) => ($on ? "#44dd44" : "#332222")};
  box-shadow: ${({ $on }) =>
    $on ? "0 0 6px #44dd44, 0 0 12px rgba(68,221,68,0.3)" : "none"};
  transition: all 0.3s;
`;

const MediaVideo = styled.video`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 2;
  background: #000;
  animation: ${flicker} 8s infinite;
`;

const GifFrame = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 2;
  background: #000;
  animation: ${flicker} 8s infinite;
`;

const OSD = styled.div`
  position: absolute;
  left: 10px;
  top: 10px;
  z-index: 12;
  font-family: "Courier New", "Lucida Console", monospace;
  font-size: 11px;
  color: #88ddff;
  background: rgba(0, 15, 30, 0.7);
  border: 1px solid rgba(100, 180, 240, 0.3);
  padding: 3px 8px;
  max-width: 80%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 0 4px rgba(100, 180, 240, 0.6);
`;

/* ------------------------------------------------------------------ */
/*  On-Screen Menu (rendered inside the CRT)                           */
/* ------------------------------------------------------------------ */

const MenuOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 15;
  background: rgba(0, 8, 16, 0.92);
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  overflow-y: auto;
  font-family: "Courier New", "Lucida Console", monospace;
  color: #88ffaa;
  animation: ${flicker} 8s infinite;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;
`;

const MenuTitle = styled.div`
  font-size: 16px;
  font-weight: bold;
  color: #ccff66;
  text-shadow: 0 0 8px rgba(180, 255, 80, 0.4);
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(136, 255, 170, 0.2);
  padding-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const MenuItem = styled.div<{ $selected?: boolean; $disabled?: boolean }>`
  padding: 6px 10px;
  margin: 2px 0;
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  border: 1px solid
    ${({ $selected }) =>
      $selected ? "rgba(136,255,170,0.5)" : "transparent"};
  background: ${({ $selected }) =>
    $selected ? "rgba(136,255,170,0.1)" : "transparent"};
  color: ${({ $disabled }) => ($disabled ? "#3a6a4a" : "#88ffaa")};
  font-size: 12px;
  transition: background 0.15s;

  &:hover {
    background: ${({ $disabled }) =>
      $disabled ? "transparent" : "rgba(136,255,170,0.08)"};
  }
`;

const MenuRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const MenuLabel = styled.span`
  font-size: 10px;
  color: #55aa77;
`;

const MenuInput = styled.input`
  background: rgba(0, 20, 10, 0.8);
  border: 1px solid #2a5a3a;
  color: #88ffaa;
  font-family: "Courier New", monospace;
  font-size: 11px;
  padding: 4px 6px;
  outline: none;
  width: 100%;

  &:focus {
    border-color: #44cc66;
    box-shadow: 0 0 4px rgba(68, 204, 102, 0.3);
  }

  &::placeholder {
    color: #2a5a3a;
  }
`;

const MenuBtn = styled.button<{ $accent?: boolean }>`
  background: ${({ $accent }) =>
    $accent
      ? "linear-gradient(180deg, #3a8a5a, #2a6a3a)"
      : "rgba(30, 60, 40, 0.8)"};
  border: 1px solid ${({ $accent }) => ($accent ? "#55cc77" : "#2a5a3a")};
  color: ${({ $accent }) => ($accent ? "#ccffdd" : "#88ffaa")};
  font-family: "Courier New", monospace;
  font-size: 10px;
  padding: 3px 10px;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(60, 120, 80, 0.6);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const MenuDivider = styled.div`
  border-top: 1px solid rgba(136, 255, 170, 0.12);
  margin: 8px 0;
`;

const MenuScrollList = styled.div`
  max-height: 140px;
  overflow-y: auto;
  border: 1px solid #1a3a2a;
  margin: 4px 0;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;
`;

const MenuTokenGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;
`;

const MenuTokenCard = styled.div`
  border: 1px solid #1a3a2a;
  padding: 4px;
  font-size: 9px;
  color: #88ffaa;
  cursor: pointer;

  &:hover {
    border-color: #44cc66;
    background: rgba(68, 204, 102, 0.06);
  }
`;

/* ------------------------------------------------------------------ */
/*  Physical Control Panel (right side of cabinet)                     */
/* ------------------------------------------------------------------ */

const ControlPanel = styled.div`
  width: 110px;
  flex-shrink: 0;
  background: linear-gradient(
    180deg,
    #5a4830 0%,
    #4a3a24 50%,
    #3e2e1a 100%
  );
  border-left: 2px solid #2a1a0c;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 8px;
  gap: 14px;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      90deg,
      rgba(100, 70, 30, 0.06) 0px,
      rgba(100, 70, 30, 0.06) 1px,
      transparent 1px,
      transparent 3px
    );
    pointer-events: none;
  }

  @media (max-width: 700px) {
    width: 100%;
    flex-direction: row;
    justify-content: center;
    padding: 10px 14px;
    border-left: none;
    border-top: 2px solid #2a1a0c;
  }
`;

const KnobGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  @media (max-width: 700px) {
    flex-direction: column;
  }
`;

const KnobLabel = styled.div`
  font-family: "Courier New", monospace;
  font-size: 8px;
  letter-spacing: 1.5px;
  color: #a08050;
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
`;

const Knob = styled.button<{ $active?: boolean; $color?: string }>`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid #1a1008;
  background: ${({ $active, $color }) => {
    if ($active) {
      return "radial-gradient(circle at 36% 32%, #f0eacc 0%, #c4b060 50%, #8a7a30 100%)";
    }
    if ($color === "red") {
      return "radial-gradient(circle at 36% 32%, #e0a0a0 0%, #aa4444 50%, #773333 100%)";
    }
    return "radial-gradient(circle at 36% 32%, #c8c4b8 0%, #8a8878 50%, #5a5848 100%)";
  }};
  cursor: pointer;
  position: relative;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.2),
    0 2px 4px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(0, 0, 0, 0.3);
  transition: transform 0.1s;

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 12px;
    background: #333;
    transform: translate(-50%, -80%);
    border-radius: 1px;
  }

  &:active {
    transform: scale(0.95);
  }
`;

const KnobText = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "Courier New", monospace;
  font-size: 8px;
  font-weight: bold;
  color: #2a2a2a;
  pointer-events: none;
  z-index: 1;

  &::before {
    content: none;
  }
`;

const VolumeSlider = styled.input`
  writing-mode: vertical-lr;
  direction: rtl;
  appearance: none;
  width: 60px;
  height: 80px;
  background: transparent;
  cursor: pointer;

  &::-webkit-slider-track {
    width: 4px;
    background: linear-gradient(180deg, #3a3020, #1a1008);
    border-radius: 2px;
    border: 1px solid #0a0a0a;
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 10px;
    background: linear-gradient(180deg, #c8c0a8, #8a8268);
    border: 1px solid #3a3020;
    border-radius: 2px;
    cursor: pointer;
  }

  &::-moz-range-track {
    width: 4px;
    background: linear-gradient(180deg, #3a3020, #1a1008);
    border-radius: 2px;
    border: 1px solid #0a0a0a;
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 10px;
    background: linear-gradient(180deg, #c8c0a8, #8a8268);
    border: 1px solid #3a3020;
    border-radius: 2px;
    cursor: pointer;
  }

  @media (max-width: 700px) {
    writing-mode: horizontal-tb;
    direction: ltr;
    width: 80px;
    height: 20px;
  }
`;

const SpeakerGrill = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: #2a1a0c;
  border: 2px solid #1a1008;
  position: relative;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 4px;
    background: repeating-linear-gradient(
      0deg,
      #1a1008 0px,
      #1a1008 2px,
      #2a1a0e 2px,
      #2a1a0e 4px
    );
    border-radius: 50%;
  }

  @media (max-width: 700px) {
    width: 40px;
    height: 40px;
  }
`;

const FootStrip = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 8px 12px 0;
`;

const Foot = styled.div`
  width: 36px;
  height: 8px;
  background: linear-gradient(180deg, #3e2e1a, #2a1a0e);
  border-radius: 0 0 4px 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
`;

const ChannelDisplay = styled.div`
  font-family: "Courier New", monospace;
  font-size: 14px;
  color: #ff6633;
  text-shadow: 0 0 6px rgba(255, 102, 51, 0.5);
  background: #0a0804;
  border: 1px solid #1a1008;
  padding: 2px 8px;
  text-align: center;
  min-width: 40px;
  border-radius: 2px;
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortAddress(address: string | null | undefined): string {
  const v = String(address || "");
  return v.length < 12 ? v : `${v.slice(0, 7)}...${v.slice(-5)}`;
}

function isGif(mimeType: string): boolean {
  return String(mimeType || "").toLowerCase() === "image/gif";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TV() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { address } = useWallet();

  const [powerOn, setPowerOn] = useState(false);
  const [showPowerFlash, setShowPowerFlash] = useState(false);
  const [screenView, setScreenView] = useState<ScreenView>("tv");
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    null
  );
  const [selectedOwnChannelId, setSelectedOwnChannelId] = useState<
    number | null
  >(null);
  const [streamTick, setStreamTick] = useState(0);
  const [loadingSignal, setLoadingSignal] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [channelTitleDraft, setChannelTitleDraft] = useState("");
  const [playlistNameDraft, setPlaylistNameDraft] = useState("");
  const [playlistDraft, setPlaylistDraft] = useState<
    Array<{ videoId: number; durationSeconds: number }>
  >([]);
  const [playableSearch, setPlayableSearch] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const switchTimerRef = useRef<number | null>(null);

  const canCreateChannels = user
    ? canCreateTvChannels(user.role as UserRole)
    : false;
  const maxChannels = user ? maxTvChannelsForRole(user.role as UserRole) : 1;

  /* ---------- queries ---------- */

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
      api.get<ChannelDetailResponse>(
        `/api/tv/channels/${selectedOwnChannelId}`
      ),
    enabled: Boolean(selectedOwnChannelId),
  });

  const playableTokensQuery = useQuery({
    queryKey: ["tv", "playable", playableSearch],
    queryFn: () =>
      api.get<{ items: PlayableToken[] }>(
        `/api/tv/me/playable-tokens?limit=120&q=${encodeURIComponent(playableSearch)}`
      ),
    enabled: Boolean(screenView === "add-tokens" && address),
    staleTime: 30_000,
  });

  /* ---------- channel selection ---------- */

  useEffect(() => {
    const channels = channelsQuery.data || [];
    if (channels.length === 0) {
      setSelectedChannelId(null);
      return;
    }
    if (
      !selectedChannelId ||
      !channels.some((c) => c.id === selectedChannelId)
    ) {
      setSelectedChannelId(channels[0]!.id);
    }
  }, [channelsQuery.data, selectedChannelId]);

  useEffect(() => {
    const mine = myChannelsQuery.data || [];
    if (mine.length === 0) {
      setSelectedOwnChannelId(null);
      return;
    }
    if (
      !selectedOwnChannelId ||
      !mine.some((c) => c.id === selectedOwnChannelId)
    ) {
      setSelectedOwnChannelId(mine[0]!.id);
    }
  }, [myChannelsQuery.data, selectedOwnChannelId]);

  /* ---------- power / signal ---------- */

  useEffect(() => {
    if (!powerOn) {
      setLoadingSignal(false);
      setTransitioning(false);
      setShowPowerFlash(false);
      return;
    }
    setShowPowerFlash(true);
    setLoadingSignal(true);
    const t1 = setTimeout(() => setShowPowerFlash(false), 600);
    const t2 = setTimeout(() => setLoadingSignal(false), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [powerOn, selectedChannelId]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
  }, [volume, streamQuery.data?.current?.videoId]);

  /* ---------- playlist draft sync ---------- */

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;
    const active =
      detail.playlists.find((p) => p.isActive) || detail.playlists[0] || null;
    if (!active) {
      setPlaylistDraft([]);
      return;
    }
    const items = detail.playlistItems
      .filter((item) => item.playlistId === active.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    setPlaylistDraft(
      items.map((item) => ({
        videoId: item.videoId,
        durationSeconds: Math.max(1, Number(item.durationSeconds || 1)),
      }))
    );
  }, [
    detailQuery.data?.channel.id,
    detailQuery.data?.playlists,
    detailQuery.data?.playlistItems,
  ]);

  /* ---------- prefetch ---------- */

  useEffect(() => {
    const queue = streamQuery.data?.queue || [];
    if (!powerOn || queue.length === 0) return;
    for (const item of queue.slice(1, 3)) {
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

  /* ---------- stream timing ---------- */

  const stepStream = useCallback(() => {
    if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
    setTransitioning(true);
    window.setTimeout(() => {
      setTransitioning(false);
      setStreamTick((v) => v + 1);
    }, 900);
  }, []);

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
    switchTimerRef.current = window.setTimeout(stepStream, remainingMs);
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
    stepStream,
  ]);

  /* ---------- mutations ---------- */

  const createChannelMutation = useMutation({
    mutationFn: (title: string) =>
      api.post<{ channel: TVChannel }>("/api/tv/channels", { title }),
    onSuccess: () => {
      setChannelTitleDraft("");
      qc.invalidateQueries({ queryKey: ["tv", "channels"] });
      qc.invalidateQueries({ queryKey: ["tv", "channels", "mine"] });
    },
  });

  const createPlaylistMutation = useMutation({
    mutationFn: ({
      channelId,
      name,
    }: {
      channelId: number;
      name: string;
    }) =>
      api.post<TVPlaylist>(`/api/tv/channels/${channelId}/playlists`, {
        name,
        isActive: false,
      }),
    onSuccess: () => {
      setPlaylistNameDraft("");
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
    },
  });

  const setPlaylistActiveMutation = useMutation({
    mutationFn: ({ playlistId }: { playlistId: number }) =>
      api.put(`/api/tv/playlists/${playlistId}`, { isActive: true }),
    onSuccess: () => {
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      if (selectedChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
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
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      if (selectedChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
    },
  });

  const addVideoMutation = useMutation({
    mutationFn: ({
      channelId,
      token,
    }: {
      channelId: number;
      token: PlayableToken;
    }) =>
      api.post(`/api/tv/channels/${channelId}/videos`, {
        tokenContract: token.tokenContract,
        tokenId: token.tokenId,
        sourceUri: token.sourceUri,
        mimeType: token.mimeType,
        title: token.title || token.tokenName,
        thumbnailUri: token.tokenThumbnail,
      }),
    onSuccess: () => {
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      if (selectedChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
    },
  });

  const removeVideoMutation = useMutation({
    mutationFn: ({
      channelId,
      videoId,
    }: {
      channelId: number;
      videoId: number;
    }) => api.delete(`/api/tv/channels/${channelId}/videos/${videoId}`),
    onSuccess: () => {
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      if (selectedChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
    },
  });

  /* ---------- derived ---------- */

  const activePlaylist = useMemo(() => {
    const detail = detailQuery.data;
    if (!detail) return null;
    return (
      detail.playlists.find((p) => p.isActive) || detail.playlists[0] || null
    );
  }, [detailQuery.data]);

  const playlistVideoMap = useMemo(() => {
    const map = new Map<number, TVVideo>();
    for (const video of detailQuery.data?.videos || [])
      map.set(video.id, video);
    return map;
  }, [detailQuery.data?.videos]);

  const currentItem = streamQuery.data?.current || null;
  const showStatic =
    powerOn &&
    (loadingSignal ||
      transitioning ||
      streamQuery.isFetching ||
      streamQuery.isLoading);
  const currentChannel = channelsQuery.data?.find(
    (c) => c.id === selectedChannelId
  );
  const channels = channelsQuery.data || [];
  const channelIndex = channels.findIndex((c) => c.id === selectedChannelId);

  /* ---------- knob handlers ---------- */

  const handlePower = useCallback(() => {
    setPowerOn((v) => {
      if (v) {
        setScreenView("tv");
        setTransitioning(false);
        setLoadingSignal(false);
      } else {
        setStreamTick((t) => t + 1);
      }
      return !v;
    });
  }, []);

  const handleMenu = useCallback(() => {
    if (!powerOn) return;
    setScreenView((v) => (v === "tv" ? "menu" : "tv"));
  }, [powerOn]);

  const cycleChannel = useCallback(() => {
    if (channels.length === 0) return;
    if (!selectedChannelId) {
      setSelectedChannelId(channels[0]!.id);
      return;
    }
    const idx = channels.findIndex((c) => c.id === selectedChannelId);
    setSelectedChannelId(channels[(idx + 1) % channels.length]!.id);
    setStreamTick((v) => v + 1);
    if (screenView !== "tv") setScreenView("tv");
  }, [channels, selectedChannelId, screenView]);

  const goBack = useCallback(() => {
    setScreenView((v) => {
      const backMap: Record<ScreenView, ScreenView> = {
        tv: "tv",
        menu: "tv",
        channels: "menu",
        settings: "menu",
        creator: "menu",
        playlists: "creator",
        "playlist-order": "creator",
        "channel-videos": "creator",
        "add-tokens": "creator",
      };
      return backMap[v] || "menu";
    });
  }, []);

  /* ---------------------------------------------------------------- */
  /*  On-screen menu screens                                           */
  /* ---------------------------------------------------------------- */

  const renderBackBtn = (label = "BACK") => (
    <MenuBtn onClick={goBack}>{`< ${label}`}</MenuBtn>
  );

  const renderMenuScreen = (): React.ReactNode => {
    switch (screenView) {
      case "menu":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>WTF TV</span>
              <MenuBtn onClick={() => setScreenView("tv")}>CLOSE</MenuBtn>
            </MenuTitle>
            <MenuItem onClick={() => setScreenView("channels")}>
              CHANNELS
            </MenuItem>
            <MenuItem onClick={() => setScreenView("settings")}>
              SETTINGS
            </MenuItem>
            {canCreateChannels && (
              <MenuItem onClick={() => setScreenView("creator")}>
                CREATOR TOOLS
              </MenuItem>
            )}
            <MenuDivider />
            <MenuLabel>
              Currently watching: {currentChannel?.title || "No signal"}
            </MenuLabel>
            {currentItem && (
              <MenuLabel>
                Playing: {currentItem.title} [{currentItem.kind.toUpperCase()}]
              </MenuLabel>
            )}
            <div style={{ flex: 1 }} />
            <MenuLabel>
              Use the knobs on the right to control power, channel, and volume.
            </MenuLabel>
          </MenuOverlay>
        );

      case "channels":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>CHANNELS</span>
              {renderBackBtn("MENU")}
            </MenuTitle>
            <MenuScrollList>
              {channels.map((ch, i) => (
                <MenuItem
                  key={ch.id}
                  $selected={ch.id === selectedChannelId}
                  onClick={() => {
                    setSelectedChannelId(ch.id);
                    setStreamTick((v) => v + 1);
                    setScreenView("tv");
                  }}
                >
                  <MenuRow>
                    <span style={{ color: "#ff6633", minWidth: 24 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{ch.title}</span>
                  </MenuRow>
                  <MenuLabel>
                    by {ch.ownerDisplayName || ch.ownerUsername || "unknown"}
                  </MenuLabel>
                </MenuItem>
              ))}
              {channels.length === 0 && (
                <MenuItem $disabled>No channels available</MenuItem>
              )}
            </MenuScrollList>
          </MenuOverlay>
        );

      case "settings":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>SETTINGS</span>
              {renderBackBtn("MENU")}
            </MenuTitle>
            <div style={{ marginBottom: 12 }}>
              <MenuLabel>VOLUME: {Math.round(volume * 100)}%</MenuLabel>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{
                  width: "100%",
                  accentColor: "#44cc66",
                  marginTop: 6,
                }}
              />
            </div>
            <MenuDivider />
            <MenuLabel>
              Channel: {currentChannel?.title || "None"} (CH{" "}
              {channelIndex >= 0 ? channelIndex + 1 : "--"})
            </MenuLabel>
          </MenuOverlay>
        );

      case "creator":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>CREATOR TOOLS</span>
              {renderBackBtn("MENU")}
            </MenuTitle>

            {/* my channels */}
            <MenuLabel>MY CHANNELS</MenuLabel>
            <MenuScrollList>
              {(myChannelsQuery.data || []).map((ch) => (
                <MenuItem
                  key={ch.id}
                  $selected={selectedOwnChannelId === ch.id}
                  onClick={() => setSelectedOwnChannelId(ch.id)}
                >
                  {ch.title}
                  <MenuLabel> /{ch.slug}</MenuLabel>
                </MenuItem>
              ))}
              {(myChannelsQuery.data || []).length === 0 && (
                <MenuItem $disabled>No channels yet</MenuItem>
              )}
            </MenuScrollList>

            {canCreateChannels &&
              (myChannelsQuery.data || []).length < maxChannels && (
                <MenuRow style={{ marginTop: 6 }}>
                  <MenuInput
                    value={channelTitleDraft}
                    onChange={(e) => setChannelTitleDraft(e.target.value)}
                    placeholder="New channel title..."
                  />
                  <MenuBtn
                    $accent
                    disabled={
                      !channelTitleDraft.trim() ||
                      createChannelMutation.isPending
                    }
                    onClick={() =>
                      createChannelMutation.mutate(channelTitleDraft.trim())
                    }
                  >
                    CREATE
                  </MenuBtn>
                </MenuRow>
              )}

            <MenuDivider />
            <MenuLabel>
              Limit: {maxChannels} channel
              {maxChannels > 1 ? "s" : ""} for your role
            </MenuLabel>
            <MenuDivider />

            {selectedOwnChannelId && (
              <>
                <MenuItem onClick={() => setScreenView("playlists")}>
                  PLAYLISTS
                </MenuItem>
                <MenuItem onClick={() => setScreenView("playlist-order")}>
                  PLAYLIST ORDER
                </MenuItem>
                <MenuItem onClick={() => setScreenView("channel-videos")}>
                  CHANNEL VIDEOS
                </MenuItem>
                <MenuItem onClick={() => setScreenView("add-tokens")}>
                  ADD FROM TOKENS
                </MenuItem>
              </>
            )}
          </MenuOverlay>
        );

      case "playlists":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>PLAYLISTS</span>
              {renderBackBtn("CREATOR")}
            </MenuTitle>
            <MenuScrollList>
              {(detailQuery.data?.playlists || []).map((pl) => (
                <MenuItem
                  key={pl.id}
                  $selected={activePlaylist?.id === pl.id}
                  onClick={() =>
                    setPlaylistActiveMutation.mutate({ playlistId: pl.id })
                  }
                >
                  <MenuRow>
                    <span>{pl.name}</span>
                    {pl.isActive && (
                      <MenuLabel style={{ color: "#ccff66" }}>
                        ACTIVE
                      </MenuLabel>
                    )}
                  </MenuRow>
                </MenuItem>
              ))}
              {(detailQuery.data?.playlists || []).length === 0 && (
                <MenuItem $disabled>No playlists</MenuItem>
              )}
            </MenuScrollList>
            <MenuRow style={{ marginTop: 8 }}>
              <MenuInput
                value={playlistNameDraft}
                onChange={(e) => setPlaylistNameDraft(e.target.value)}
                placeholder="New playlist name..."
              />
              <MenuBtn
                $accent
                disabled={
                  !playlistNameDraft.trim() ||
                  !selectedOwnChannelId ||
                  createPlaylistMutation.isPending
                }
                onClick={() =>
                  selectedOwnChannelId &&
                  createPlaylistMutation.mutate({
                    channelId: selectedOwnChannelId,
                    name: playlistNameDraft.trim(),
                  })
                }
              >
                ADD
              </MenuBtn>
            </MenuRow>
            <MenuLabel style={{ marginTop: 6 }}>
              Tap a playlist to set it active
            </MenuLabel>
          </MenuOverlay>
        );

      case "playlist-order":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>PLAYLIST ORDER</span>
              {renderBackBtn("CREATOR")}
            </MenuTitle>
            <MenuScrollList>
              {playlistDraft.map((item, idx) => {
                const video = playlistVideoMap.get(item.videoId);
                return (
                  <MenuItem key={`${item.videoId}-${idx}`}>
                    <MenuRow>
                      <span style={{ flex: 1, fontSize: 11 }}>
                        {video?.title || `Video #${item.videoId}`}
                      </span>
                      <MenuInput
                        value={String(item.durationSeconds)}
                        onChange={(e) => {
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
                        style={{ width: 44 }}
                      />
                      <MenuLabel>s</MenuLabel>
                      <MenuBtn
                        disabled={idx === 0}
                        onClick={() => {
                          const next = [...playlistDraft];
                          [next[idx - 1], next[idx]] = [
                            next[idx]!,
                            next[idx - 1]!,
                          ];
                          setPlaylistDraft(next);
                        }}
                      >
                        UP
                      </MenuBtn>
                      <MenuBtn
                        disabled={idx === playlistDraft.length - 1}
                        onClick={() => {
                          const next = [...playlistDraft];
                          [next[idx + 1], next[idx]] = [
                            next[idx]!,
                            next[idx + 1]!,
                          ];
                          setPlaylistDraft(next);
                        }}
                      >
                        DN
                      </MenuBtn>
                    </MenuRow>
                  </MenuItem>
                );
              })}
              {playlistDraft.length === 0 && (
                <MenuItem $disabled>
                  No videos in active playlist
                </MenuItem>
              )}
            </MenuScrollList>
            <div style={{ marginTop: 8 }}>
              <MenuBtn
                $accent
                disabled={!activePlaylist || savePlaylistMutation.isPending}
                onClick={() =>
                  activePlaylist &&
                  savePlaylistMutation.mutate({
                    playlistId: activePlaylist.id,
                    items: playlistDraft,
                  })
                }
              >
                SAVE PLAYLIST
              </MenuBtn>
            </div>
          </MenuOverlay>
        );

      case "channel-videos":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>CHANNEL VIDEOS</span>
              {renderBackBtn("CREATOR")}
            </MenuTitle>
            <MenuScrollList>
              {(detailQuery.data?.videos || []).map((video) => (
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
              {(detailQuery.data?.videos || []).length === 0 && (
                <MenuItem $disabled>No videos added</MenuItem>
              )}
            </MenuScrollList>
          </MenuOverlay>
        );

      case "add-tokens":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>ADD FROM TOKENS</span>
              {renderBackBtn("CREATOR")}
            </MenuTitle>
            {!address && (
              <MenuLabel style={{ marginBottom: 8 }}>
                Connect wallet to see owned playable tokens
              </MenuLabel>
            )}
            <MenuInput
              value={playableSearch}
              onChange={(e) => setPlayableSearch(e.target.value)}
              placeholder="Search tokens..."
            />
            <MenuTokenGrid style={{ marginTop: 8 }}>
              {(playableTokensQuery.data?.items || []).map((token) => (
                <MenuTokenCard
                  key={`${token.tokenContract}:${token.tokenId}`}
                  onClick={() =>
                    selectedOwnChannelId &&
                    address &&
                    addVideoMutation.mutate({
                      channelId: selectedOwnChannelId,
                      token,
                    })
                  }
                >
                  <div style={{ fontWeight: "bold" }}>{token.tokenName}</div>
                  <div style={{ color: "#55aa77" }}>{token.mimeType}</div>
                  <div style={{ color: "#3a6a4a" }}>
                    {shortAddress(token.walletAddress)}
                  </div>
                  <MenuBtn
                    $accent
                    disabled={!address || addVideoMutation.isPending}
                    style={{ marginTop: 4, width: "100%" }}
                  >
                    ADD
                  </MenuBtn>
                </MenuTokenCard>
              ))}
            </MenuTokenGrid>
            {address &&
              (playableTokensQuery.data?.items || []).length === 0 && (
                <MenuLabel style={{ marginTop: 8 }}>
                  {playableTokensQuery.isLoading
                    ? "Searching..."
                    : "No playable tokens found"}
                </MenuLabel>
              )}
          </MenuOverlay>
        );

      default:
        return null;
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AppWindow title="WTF TV">
      <Cabinet>
        <BrandStrip>
          <BrandName>WTF</BrandName>
          <ModelLabel>MODEL CRT-95 · DIGITAL</ModelLabel>
        </BrandStrip>

        <BodyRow>
          <ScreenBay>
            <ScreenBezel>
              <CRTScreen $on={powerOn}>
                {/* Off state */}
                {!powerOn && <OffScreen />}

                {/* Power-on flash */}
                {showPowerFlash && <PowerOnFlash />}

                {/* Video playback */}
                {powerOn &&
                  screenView === "tv" &&
                  currentItem &&
                  isGif(currentItem.mimeType) &&
                  !showStatic && (
                    <GifFrame
                      src={currentItem.cacheUrl}
                      alt={currentItem.title}
                    />
                  )}
                {powerOn &&
                  screenView === "tv" &&
                  currentItem &&
                  !isGif(currentItem.mimeType) &&
                  !showStatic && (
                    <MediaVideo
                      ref={videoRef}
                      src={currentItem.cacheUrl}
                      autoPlay
                      playsInline
                      muted={false}
                      controls={false}
                      onLoadedMetadata={(e) => {
                        const offset = Number(currentItem.offsetSeconds || 0);
                        const el = e.currentTarget;
                        if (
                          Number.isFinite(offset) &&
                          offset > 0 &&
                          offset < (el.duration || Infinity)
                        ) {
                          try {
                            el.currentTime = offset;
                          } catch {
                            /* seek error on partial buffer */
                          }
                        }
                        el.volume = volume;
                      }}
                    />
                  )}

                {/* Static / loading */}
                {showStatic && screenView === "tv" && <StaticLayer />}

                {/* OSD channel badge */}
                {powerOn && screenView === "tv" && (
                  <OSD>
                    CH {channelIndex >= 0 ? channelIndex + 1 : "--"} ·{" "}
                    {(currentChannel?.title || "No signal").slice(0, 40)}
                  </OSD>
                )}

                {/* On-screen menu */}
                {powerOn && screenView !== "tv" && renderMenuScreen()}

                {/* CRT overlay effects */}
                <ScanLines />
                <CRTCurve />
              </CRTScreen>
            </ScreenBezel>
          </ScreenBay>

          <ControlPanel>
            <SpeakerGrill />

            <KnobGroup>
              <Knob $active={powerOn} onClick={handlePower}>
                <KnobText />
              </Knob>
              <KnobLabel>POWER</KnobLabel>
            </KnobGroup>

            <KnobGroup>
              <ChannelDisplay>
                {channelIndex >= 0 ? String(channelIndex + 1).padStart(2, "0") : "--"}
              </ChannelDisplay>
              <Knob onClick={cycleChannel}>
                <KnobText />
              </Knob>
              <KnobLabel>CH</KnobLabel>
            </KnobGroup>

            <KnobGroup>
              <VolumeSlider
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
              <KnobLabel>VOL</KnobLabel>
            </KnobGroup>

            <KnobGroup>
              <Knob
                $color={screenView !== "tv" ? "red" : undefined}
                $active={screenView !== "tv"}
                onClick={handleMenu}
              >
                <KnobText />
              </Knob>
              <KnobLabel>MENU</KnobLabel>
            </KnobGroup>

            <PowerDot $on={powerOn} />
          </ControlPanel>
        </BodyRow>

        <FootStrip>
          <Foot />
          <Foot />
        </FootStrip>
      </Cabinet>
    </AppWindow>
  );
}
