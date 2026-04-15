import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
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
  logoUrl?: string | null;
  bannerUrl?: string | null;
  isPublic?: boolean;
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
  creatorAddress?: string | null;
  mimeType: string;
  sourceUri: string;
  title: string | null;
  metadata?: Record<string, any>;
  lastSeenAt?: string | null;
};

type TokenSortMode =
  | "recent"
  | "name-asc"
  | "name-desc"
  | "contract"
  | "mime";

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

type TVBumper = {
  id: number;
  title: string;
  mimeType: string;
  fileSize: number;
  durationMs: number;
  createdAt: string;
};

type BumperPoolItem = {
  id: number;
  mimeType: string;
  durationMs: number;
  mediaUrl: string;
  credit: string;
};

type TVMediaItem = {
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

type TVScheduleEntry = {
  id: number;
  channelId: number;
  mediaItemId: number;
  startsAt: string;
  endsAt: string;
  sortOrder: number | null;
  createdAt: string;
  mediaTitle?: string;
  mediaSourceUrl?: string;
  mediaMimeType?: string;
  mediaPosterUrl?: string | null;
  mediaDuration?: number | null;
  mediaStatus?: string;
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
  | "add-tokens"
  | "bumpers"
  | "my-media"
  | "media-form"
  | "channel-edit"
  | "schedule";

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

const TVWrapper = styled.div`
  width: calc(100% + 16px);
  height: calc(100% + 16px);
  margin: -8px;
  display: flex;
  box-sizing: border-box;
`;

const Cabinet = styled.div`
  width: 100%;
  height: 100%;
  background: linear-gradient(
    180deg,
    #6b4226 0%,
    #5a3520 12%,
    #4e2e1b 40%,
    #3e2414 70%,
    #2d1a0e 100%
  );
  border-radius: 10px;
  border: 3px solid #2a1508;
  box-shadow:
    inset 0 1px 0 rgba(255, 220, 160, 0.15),
    inset 0 -2px 6px rgba(0, 0, 0, 0.5),
    0 6px 24px rgba(0, 0, 0, 0.5);
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;

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
  padding: 0 8px 8px;
  flex-shrink: 0;
`;

const BrandName = styled.div`
  font-family: "Georgia", "Times New Roman", serif;
  font-weight: bold;
  font-size: clamp(16px, 2.5vw, 26px);
  letter-spacing: 6px;
  color: #d4a855;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6), 0 0 8px rgba(212, 168, 85, 0.3);
  text-transform: uppercase;
`;

const ModelLabel = styled.div`
  font-family: "Courier New", monospace;
  font-size: clamp(8px, 1.2vw, 12px);
  color: #8a6a3e;
  letter-spacing: 1.5px;
`;

const BodyRow = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0;

  @media (max-width: 700px) {
    flex-direction: column;
  }
`;

const ScreenBay = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const ScreenBezel = styled.div`
  flex: 1;
  min-height: 0;
  background: #1a1a1a;
  border: 3px solid #0a0a0a;
  border-radius: 10px;
  padding: clamp(6px, 1.2vw, 14px);
  box-shadow:
    inset 0 0 12px rgba(0, 0, 0, 0.8),
    inset 0 0 2px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
`;

const CRTScreen = styled.div<{ $on: boolean }>`
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 8px;
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
      box-shadow: inset 0 0 60px rgba(100, 180, 255, 0.05);
    `}
`;

const ScanLines = styled.div`
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.02) 0px,
    rgba(255, 255, 255, 0.02) 1px,
    rgba(0, 0, 0, 0.035) 2px,
    rgba(0, 0, 0, 0.035) 3px
  );
  z-index: 10;
  border-radius: 8px;
`;

const CRTCurve = styled.div`
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 8px;
  box-shadow:
    inset 0 0 80px 15px rgba(0, 0, 0, 0.3),
    inset 0 0 6px rgba(0, 0, 0, 0.6);
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
  gap: 8px;
`;

const OffScreenLabel = styled.div`
  font-family: "Courier New", monospace;
  font-size: clamp(10px, 1.4vw, 16px);
  color: #1a2a35;
  text-transform: uppercase;
  letter-spacing: 3px;
`;

const PowerDot = styled.div<{ $on: boolean }>`
  width: clamp(6px, 1vw, 10px);
  height: clamp(6px, 1vw, 10px);
  border-radius: 50%;
  background: ${({ $on }) => ($on ? "#44dd44" : "#332222")};
  box-shadow: ${({ $on }) =>
    $on ? "0 0 8px #44dd44, 0 0 16px rgba(68,221,68,0.3)" : "none"};
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
  left: clamp(8px, 2%, 20px);
  top: clamp(8px, 2%, 20px);
  z-index: 12;
  font-family: "Courier New", "Lucida Console", monospace;
  font-size: clamp(11px, 1.6vw, 16px);
  color: #88ddff;
  background: rgba(0, 15, 30, 0.75);
  border: 1px solid rgba(100, 180, 240, 0.3);
  padding: clamp(3px, 0.6vw, 8px) clamp(6px, 1vw, 14px);
  max-width: 80%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 0 6px rgba(100, 180, 240, 0.6);
`;

/* ------------------------------------------------------------------ */
/*  On-Screen Menu (rendered inside the CRT)                           */
/* ------------------------------------------------------------------ */

const MenuOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 15;
  background: rgba(0, 8, 16, 0.94);
  display: flex;
  flex-direction: column;
  padding: clamp(12px, 3%, 28px) clamp(14px, 4%, 36px);
  overflow-y: auto;
  font-family: "Courier New", "Lucida Console", monospace;
  color: #88ffaa;
  animation: ${flicker} 8s infinite;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;
`;

const MenuTitle = styled.div`
  font-size: clamp(16px, 2.4vw, 24px);
  font-weight: bold;
  color: #ccff66;
  text-shadow: 0 0 10px rgba(180, 255, 80, 0.4);
  margin-bottom: clamp(10px, 2%, 20px);
  border-bottom: 1px solid rgba(136, 255, 170, 0.25);
  padding-bottom: clamp(6px, 1%, 12px);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const MenuItem = styled.div<{ $selected?: boolean; $disabled?: boolean }>`
  padding: clamp(8px, 1.4%, 14px) clamp(10px, 1.6%, 18px);
  margin: 3px 0;
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  border: 1px solid
    ${({ $selected }) =>
      $selected ? "rgba(136,255,170,0.5)" : "transparent"};
  border-radius: 3px;
  background: ${({ $selected }) =>
    $selected ? "rgba(136,255,170,0.12)" : "transparent"};
  color: ${({ $disabled }) => ($disabled ? "#3a6a4a" : "#88ffaa")};
  font-size: clamp(13px, 1.8vw, 18px);
  transition: background 0.15s;

  &:hover {
    background: ${({ $disabled }) =>
      $disabled ? "transparent" : "rgba(136,255,170,0.08)"};
  }
`;

const MenuRow = styled.div`
  display: flex;
  align-items: center;
  gap: clamp(6px, 1vw, 12px);
`;

const MenuLabel = styled.span`
  font-size: clamp(10px, 1.4vw, 15px);
  color: #55aa77;
`;

const MenuInput = styled.input`
  background: rgba(0, 20, 10, 0.8);
  border: 1px solid #2a5a3a;
  color: #88ffaa;
  font-family: "Courier New", monospace;
  font-size: clamp(12px, 1.5vw, 16px);
  padding: clamp(5px, 0.8vw, 10px) clamp(6px, 1vw, 12px);
  outline: none;
  width: 100%;
  border-radius: 2px;

  &:focus {
    border-color: #44cc66;
    box-shadow: 0 0 6px rgba(68, 204, 102, 0.3);
  }

  &::placeholder {
    color: #2a5a3a;
  }
`;

const MenuSelect = styled.select`
  background: rgba(0, 20, 10, 0.9);
  border: 1px solid #2a5a3a;
  color: #88ffaa;
  font-family: "Courier New", monospace;
  font-size: clamp(11px, 1.35vw, 15px);
  padding: clamp(5px, 0.8vw, 10px) clamp(6px, 1vw, 10px);
  border-radius: 2px;
  outline: none;

  &:focus {
    border-color: #44cc66;
    box-shadow: 0 0 6px rgba(68, 204, 102, 0.3);
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
  font-size: clamp(11px, 1.4vw, 15px);
  padding: clamp(4px, 0.6vw, 8px) clamp(10px, 1.4vw, 18px);
  cursor: pointer;
  white-space: nowrap;
  border-radius: 2px;

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
  margin: clamp(8px, 1.4%, 16px) 0;
`;

const MenuScrollList = styled.div`
  flex: 1;
  min-height: 60px;
  max-height: 40%;
  overflow-y: auto;
  border: 1px solid #1a3a2a;
  border-radius: 3px;
  margin: 6px 0;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;
`;

const MenuTokenGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(90px, 14vw, 140px), 1fr));
  gap: 6px;
  flex: 1;
  min-height: 60px;
  max-height: 50%;
  overflow-y: auto;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;
`;

const MenuTokenCard = styled.div`
  border: 1px solid #1a3a2a;
  border-radius: 3px;
  padding: clamp(6px, 1vw, 10px);
  font-size: clamp(10px, 1.3vw, 14px);
  color: #88ffaa;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &:hover {
    border-color: #44cc66;
    background: rgba(68, 204, 102, 0.08);
  }
`;

const TokenPreview = styled.div`
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid #204028;
  background: radial-gradient(circle at 50% 40%, #0f2018 0%, #08110c 100%);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const TokenPreviewMedia = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const TokenPreviewFallback = styled.div`
  font-family: "Courier New", monospace;
  font-size: clamp(9px, 1.1vw, 12px);
  letter-spacing: 1px;
  color: #3f7a54;
`;

/* ------------------------------------------------------------------ */
/*  Physical Control Panel (right side of cabinet)                     */
/* ------------------------------------------------------------------ */

const ControlPanel = styled.div`
  width: clamp(100px, 14vw, 140px);
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
  justify-content: space-evenly;
  padding: clamp(10px, 2%, 20px) clamp(6px, 1%, 12px);
  gap: clamp(8px, 1.5vh, 18px);
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
    justify-content: space-evenly;
    padding: 10px 14px;
    border-left: none;
    border-top: 2px solid #2a1a0c;
  }
`;

const KnobGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
`;

const KnobLabel = styled.div`
  font-family: "Courier New", monospace;
  font-size: clamp(7px, 1vw, 10px);
  letter-spacing: 2px;
  color: #a08050;
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
`;

const Knob = styled.button<{ $active?: boolean; $color?: string }>`
  width: clamp(38px, 5vw, 56px);
  height: clamp(38px, 5vw, 56px);
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
    0 3px 6px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(0, 0, 0, 0.3);
  transition: transform 0.1s;

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 30%;
    background: #333;
    transform: translate(-50%, -80%);
    border-radius: 1px;
  }

  &:active {
    transform: scale(0.93);
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
`;

const VolumeSlider = styled.input`
  writing-mode: vertical-lr;
  direction: rtl;
  appearance: none;
  width: clamp(40px, 5vw, 60px);
  height: clamp(60px, 10vh, 100px);
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
    width: 18px;
    height: 12px;
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
    width: 18px;
    height: 12px;
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
  width: clamp(50px, 7vw, 80px);
  height: clamp(50px, 7vw, 80px);
  border-radius: 50%;
  background: #2a1a0c;
  border: 2px solid #1a1008;
  position: relative;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.6);
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
  padding: 6px 16px 0;
  flex-shrink: 0;
`;

const Foot = styled.div`
  width: clamp(28px, 4vw, 44px);
  height: 8px;
  background: linear-gradient(180deg, #3e2e1a, #2a1a0e);
  border-radius: 0 0 4px 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
`;

const ChannelDisplay = styled.div`
  font-family: "Courier New", monospace;
  font-size: clamp(13px, 1.8vw, 18px);
  color: #ff6633;
  text-shadow: 0 0 8px rgba(255, 102, 51, 0.5);
  background: #0a0804;
  border: 1px solid #1a1008;
  padding: clamp(2px, 0.4vw, 5px) clamp(6px, 1vw, 12px);
  text-align: center;
  min-width: clamp(36px, 4vw, 50px);
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

function buildTvCacheUrl(uri: string | null | undefined): string | null {
  const value = String(uri || "").trim();
  if (!value) return null;
  return `/api/tv/cache/media?url=${encodeURIComponent(value)}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TV() {
  const qc = useQueryClient();
  const { user } = useAuth();

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
  const [playableSort, setPlayableSort] = useState<TokenSortMode>("recent");
  const [bumperTitleDraft, setBumperTitleDraft] = useState("");
  const [activeBumper, setActiveBumper] = useState<BumperPoolItem | null>(null);
  const [bumperReady, setBumperReady] = useState(false);
  const [bumperError, setBumperError] = useState(false);
  const [currentMediaReady, setCurrentMediaReady] = useState(false);
  const [currentMediaError, setCurrentMediaError] = useState(false);
  const [currentMediaUseDirect, setCurrentMediaUseDirect] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bumperVideoRef = useRef<HTMLVideoElement | null>(null);
  const bumperFileRef = useRef<HTMLInputElement | null>(null);
  const switchTimerRef = useRef<number | null>(null);

  const [mediaFormDraft, setMediaFormDraft] = useState({
    title: "",
    sourceUrl: "",
    sourceType: "ipfs" as "ipfs" | "upload" | "external",
    mimeType: "video/mp4",
    description: "",
    posterUrl: "",
    durationSeconds: "",
  });
  const [channelEditDraft, setChannelEditDraft] = useState({
    title: "",
    description: "",
    logoUrl: "",
    bannerUrl: "",
    isPublic: true,
    slug: "",
  });
  const [scheduleFormDraft, setScheduleFormDraft] = useState({
    mediaItemId: "",
    startsAt: "",
    endsAt: "",
  });

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
    queryKey: ["tv", "playable"],
    queryFn: () =>
      api.get<{ items: PlayableToken[] }>(
        "/api/tv/me/playable-tokens?limit=240&sort=recent"
      ),
    enabled: Boolean(screenView === "add-tokens" && user),
    staleTime: 30_000,
  });

  const myBumpersQuery = useQuery({
    queryKey: ["tv", "bumpers", "mine"],
    queryFn: () => api.get<TVBumper[]>("/api/tv/bumpers"),
    enabled: Boolean(user && screenView === "bumpers"),
  });

  const bumperPoolQuery = useQuery({
    queryKey: ["tv", "bumpers", "pool"],
    queryFn: () => api.get<BumperPoolItem[]>("/api/tv/bumpers/pool"),
    enabled: powerOn,
    staleTime: 120_000,
    refetchInterval: 300_000,
  });

  const myMediaQuery = useQuery({
    queryKey: ["media-library", "video"],
    queryFn: () => api.get<TVMediaItem[]>("/api/media/mine?category=video"),
    enabled: Boolean(user && (screenView === "my-media" || screenView === "media-form" || screenView === "schedule")),
  });

  const scheduleQuery = useQuery({
    queryKey: ["tv", "schedule", selectedOwnChannelId],
    queryFn: () =>
      api.get<TVScheduleEntry[]>(`/api/tv/channels/${selectedOwnChannelId}/schedule`),
    enabled: Boolean(selectedOwnChannelId && screenView === "schedule"),
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
      setCurrentMediaReady(false);
      setCurrentMediaError(false);
      setCurrentMediaUseDirect(false);
      setBumperReady(false);
      setBumperError(false);
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

  const pickRandomBumper = useCallback((): BumperPoolItem | null => {
    const pool = bumperPoolQuery.data || [];
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }, [bumperPoolQuery.data]);

  const finishTransition = useCallback(() => {
    setTransitioning(false);
    setActiveBumper(null);
    setBumperReady(false);
    setBumperError(false);
    setStreamTick((v) => v + 1);
  }, []);

  const stepStream = useCallback(() => {
    if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
    const bumper = pickRandomBumper();
    if (bumper) {
      setActiveBumper(bumper);
      setBumperReady(false);
      setBumperError(false);
      setTransitioning(true);
      const maxBumperMs = Math.min(bumper.durationMs + 500, 6000);
      switchTimerRef.current = window.setTimeout(finishTransition, maxBumperMs);
    } else {
      setTransitioning(true);
      window.setTimeout(finishTransition, 900);
    }
  }, [pickRandomBumper, finishTransition]);

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

  useEffect(() => {
    setCurrentMediaReady(false);
    setCurrentMediaError(false);
    setCurrentMediaUseDirect(false);
  }, [streamQuery.data?.current?.videoId, streamQuery.data?.current?.cacheUrl]);

  const handleCurrentMediaReady = useCallback(() => {
    setCurrentMediaReady(true);
    setCurrentMediaError(false);
  }, []);

  const handleCurrentMediaError = useCallback(() => {
    const directSource = streamQuery.data?.current?.sourceUri || "";
    if (!currentMediaUseDirect && directSource) {
      setCurrentMediaUseDirect(true);
      setCurrentMediaReady(false);
      return;
    }
    setCurrentMediaReady(false);
    setCurrentMediaError(true);
  }, [currentMediaUseDirect, streamQuery.data?.current?.sourceUri]);

  const handleBumperMediaReady = useCallback(() => {
    setBumperReady(true);
    setBumperError(false);
  }, []);

  const handleBumperMediaError = useCallback(() => {
    setBumperReady(false);
    setBumperError(true);
    if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
    switchTimerRef.current = window.setTimeout(finishTransition, 180);
  }, [finishTransition]);

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

  const uploadBumperMutation = useMutation({
    mutationFn: async ({ file, title, durationMs }: { file: File; title: string; durationMs: number }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("durationMs", String(durationMs));
      const resp = await fetch("/api/tv/bumpers", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return resp.json();
    },
    onSuccess: () => {
      setBumperTitleDraft("");
      if (bumperFileRef.current) bumperFileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["tv", "bumpers"] });
    },
  });

  const deleteBumperMutation = useMutation({
    mutationFn: (bumperId: number) =>
      api.delete(`/api/tv/bumpers/${bumperId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tv", "bumpers"] });
    },
  });

  const createMediaMutation = useMutation({
    mutationFn: (data: {
      title: string;
      sourceUrl: string;
      sourceType: string;
      mimeType: string;
      description?: string;
      posterUrl?: string;
      durationSeconds?: number | null;
    }) => api.post<TVMediaItem>("/api/media/upload", data),
    onSuccess: () => {
      setMediaFormDraft({
        title: "",
        sourceUrl: "",
        sourceType: "ipfs",
        mimeType: "video/mp4",
        description: "",
        posterUrl: "",
        durationSeconds: "",
      });
      qc.invalidateQueries({ queryKey: ["media-library"] });
      setScreenView("my-media");
    },
  });

  const deleteMediaMutation = useMutation({
    mutationFn: (mediaId: number) => api.delete(`/api/media/${mediaId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-library"] });
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: ({
      channelId,
      data,
    }: {
      channelId: number;
      data: Record<string, any>;
    }) => api.put(`/api/tv/channels/${channelId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tv", "channels"] });
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      setScreenView("creator");
    },
  });

  const createScheduleEntryMutation = useMutation({
    mutationFn: ({
      channelId,
      data,
    }: {
      channelId: number;
      data: { mediaItemId: number; startsAt: string; endsAt: string };
    }) => api.post(`/api/tv/channels/${channelId}/schedule`, data),
    onSuccess: () => {
      setScheduleFormDraft({ mediaItemId: "", startsAt: "", endsAt: "" });
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "schedule", selectedOwnChannelId],
        });
    },
  });

  const deleteScheduleEntryMutation = useMutation({
    mutationFn: ({
      channelId,
      entryId,
    }: {
      channelId: number;
      entryId: number;
    }) => api.delete(`/api/tv/channels/${channelId}/schedule/${entryId}`),
    onSuccess: () => {
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "schedule", selectedOwnChannelId],
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

  const playableTokens = useMemo(() => {
    const q = playableSearch.trim().toLowerCase();
    const filtered = (playableTokensQuery.data?.items || []).filter((token) => {
      if (!q) return true;
      const meta = token.metadata || {};
      const creators = Array.isArray(meta.creators) ? meta.creators : [];
      const tags = Array.isArray(meta.tags) ? meta.tags : [];
      return (
        token.tokenName.toLowerCase().includes(q) ||
        token.tokenContract.toLowerCase().includes(q) ||
        token.tokenId.toLowerCase().includes(q) ||
        token.mimeType.toLowerCase().includes(q) ||
        token.walletAddress.toLowerCase().includes(q) ||
        (token.creatorAddress || "").toLowerCase().includes(q) ||
        creators.some((c: string) => String(c).toLowerCase().includes(q)) ||
        tags.some((t: string) => String(t).toLowerCase().includes(q))
      );
    });
    return filtered.sort((a, b) => {
      if (playableSort === "name-asc") {
        return a.tokenName.localeCompare(b.tokenName, undefined, {
          sensitivity: "base",
        });
      }
      if (playableSort === "name-desc") {
        return b.tokenName.localeCompare(a.tokenName, undefined, {
          sensitivity: "base",
        });
      }
      if (playableSort === "contract") {
        const contractOrder = a.tokenContract.localeCompare(b.tokenContract, undefined, {
          sensitivity: "base",
        });
        if (contractOrder !== 0) return contractOrder;
        return a.tokenId.localeCompare(b.tokenId, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      if (playableSort === "mime") {
        const mimeOrder = a.mimeType.localeCompare(b.mimeType, undefined, {
          sensitivity: "base",
        });
        if (mimeOrder !== 0) return mimeOrder;
        return a.tokenName.localeCompare(b.tokenName, undefined, {
          sensitivity: "base",
        });
      }
      return (
        new Date(b.lastSeenAt || 0).getTime() -
        new Date(a.lastSeenAt || 0).getTime()
      );
    });
  }, [playableTokensQuery.data?.items, playableSearch, playableSort]);

  const currentItem = streamQuery.data?.current || null;
  const currentMediaUrl = currentItem
    ? currentMediaUseDirect
      ? currentItem.sourceUri
      : currentItem.cacheUrl
    : null;
  const isOffline = streamQuery.data?.offline === true;
  const hasNoContent =
    powerOn &&
    screenView === "tv" &&
    !currentItem &&
    !streamQuery.isLoading &&
    !streamQuery.isFetching &&
    !loadingSignal;
  const bumperPool = bumperPoolQuery.data || [];
  const hasBumpers = bumperPool.length > 0;
  const shouldRenderBumper =
    powerOn &&
    transitioning &&
    hasBumpers &&
    activeBumper !== null &&
    !bumperError;
  const showBumper =
    shouldRenderBumper &&
    bumperReady &&
    screenView === "tv";
  const showStatic =
    powerOn &&
    screenView === "tv" &&
    !showBumper &&
    (loadingSignal ||
      transitioning ||
      streamQuery.isFetching ||
      streamQuery.isLoading ||
      hasNoContent ||
      (!!currentItem && (!currentMediaReady || currentMediaError)));
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
        setActiveBumper(null);
        setBumperReady(false);
        setBumperError(false);
        setCurrentMediaReady(false);
        setCurrentMediaError(false);
        setCurrentMediaUseDirect(false);
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
        bumpers: "creator",
        "my-media": "creator",
        "media-form": "my-media",
        "channel-edit": "creator",
        schedule: "creator",
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
                <MenuLabel> (channels, playlists, media)</MenuLabel>
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
                <MenuDivider />
                <MenuLabel style={{ color: "#ccff66", fontSize: 9, letterSpacing: 1 }}>STEP 1: CHANNEL</MenuLabel>
                <MenuItem onClick={() => {
                  const ch = (myChannelsQuery.data || []).find(
                    (c) => c.id === selectedOwnChannelId
                  );
                  if (ch) {
                    setChannelEditDraft({
                      title: ch.title,
                      description: ch.description || "",
                      logoUrl: ch.logoUrl || "",
                      bannerUrl: ch.bannerUrl || "",
                      isPublic: ch.isPublic !== false,
                      slug: ch.slug,
                    });
                  }
                  setScreenView("channel-edit");
                }}>
                  EDIT CHANNEL DETAILS
                </MenuItem>

                <MenuDivider />
                <MenuLabel style={{ color: "#ccff66", fontSize: 9, letterSpacing: 1 }}>STEP 2: MEDIA</MenuLabel>
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

                <MenuDivider />
                <MenuLabel style={{ color: "#ccff66", fontSize: 9, letterSpacing: 1 }}>STEP 3: PLAYLIST</MenuLabel>
                <MenuItem onClick={() => setScreenView("playlists")}>
                  PLAYLISTS
                </MenuItem>
                <MenuItem onClick={() => setScreenView("playlist-order")}>
                  PLAYLIST ORDER
                  <MenuLabel> (drag to reorder)</MenuLabel>
                </MenuItem>

                <MenuDivider />
                <MenuLabel style={{ color: "#ccff66", fontSize: 9, letterSpacing: 1 }}>STEP 4: SCHEDULE</MenuLabel>
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
            <MenuRow style={{ marginBottom: 8 }}>
              <MenuInput
                value={playableSearch}
                onChange={(e) => setPlayableSearch(e.target.value)}
                placeholder="Search name, creator, tag, contract..."
              />
              <MenuSelect
                value={playableSort}
                onChange={(e) => setPlayableSort(e.target.value as TokenSortMode)}
                style={{ minWidth: 146, maxWidth: 170 }}
              >
                <option value="recent">Newest</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="contract">Contract</option>
                <option value="mime">Media type</option>
              </MenuSelect>
            </MenuRow>
            <MenuLabel>
              {playableTokens.length} playable token{playableTokens.length === 1 ? "" : "s"}
            </MenuLabel>
            <MenuTokenGrid style={{ marginTop: 8 }}>
              {playableTokens.map((token) => {
                const tokenKey = `${token.tokenContract}:${token.tokenId}`;
                const previewUri = token.tokenThumbnail || token.sourceUri;
                const cachePreview = buildTvCacheUrl(previewUri);
                return (
                  <MenuTokenCard
                    key={tokenKey}
                    onClick={() =>
                      selectedOwnChannelId &&
                      addVideoMutation.mutate({
                        channelId: selectedOwnChannelId,
                        token,
                      })
                    }
                  >
                    <TokenPreview>
                      {previewUri ? (
                        <TokenPreviewMedia
                          src={cachePreview || previewUri}
                          alt={token.tokenName}
                          loading="lazy"
                          onError={(e) => {
                            const el = e.currentTarget;
                            if (cachePreview && el.dataset.direct !== "1") {
                              el.dataset.direct = "1";
                              el.src = previewUri;
                              return;
                            }
                            el.style.display = "none";
                          }}
                        />
                      ) : (
                        <TokenPreviewFallback>NO PREVIEW</TokenPreviewFallback>
                      )}
                    </TokenPreview>
                    <div style={{ fontWeight: "bold" }}>{token.tokenName}</div>
                    <div style={{ color: "#55aa77" }}>{token.mimeType}</div>
                    <div style={{ color: "#3a6a4a" }}>
                      {shortAddress(token.walletAddress)}
                    </div>
                    <div style={{ color: "#3a6a4a", fontSize: "0.9em" }}>
                      {shortAddress(token.tokenContract)} · #{token.tokenId}
                    </div>
                    <MenuBtn
                      $accent
                      disabled={!selectedOwnChannelId || addVideoMutation.isPending}
                      style={{ marginTop: 4, width: "100%" }}
                    >
                      {addVideoMutation.isPending ? "ADDING..." : "ADD"}
                    </MenuBtn>
                  </MenuTokenCard>
                );
              })}
            </MenuTokenGrid>
            {playableTokens.length === 0 && (
              <MenuLabel style={{ marginTop: 8 }}>
                {playableTokensQuery.isLoading
                  ? "Loading playable tokens..."
                  : "No playable tokens found"}
              </MenuLabel>
            )}
            {playableTokensQuery.isError && (
              <MenuLabel style={{ color: "#ff6655", marginTop: 6 }}>
                Failed to load playable tokens. Please retry.
              </MenuLabel>
            )}
          </MenuOverlay>
        );

      case "bumpers":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>BUMPERS</span>
              {renderBackBtn("CREATOR")}
            </MenuTitle>
            <MenuLabel>
              Upload short clips (max 5s, 25MB) that play between playlist videos.
              {" "}Community bumpers fill transitions while the next video loads from IPFS.
            </MenuLabel>
            <MenuDivider />

            <MenuLabel>
              MY BUMPERS ({(myBumpersQuery.data || []).length}/20)
            </MenuLabel>
            <MenuScrollList>
              {(myBumpersQuery.data || []).map((b) => (
                <MenuItem key={b.id}>
                  <MenuRow>
                    <span style={{ flex: 1 }}>{b.title}</span>
                    <MenuLabel>
                      {(b.durationMs / 1000).toFixed(1)}s · {(b.fileSize / 1024).toFixed(0)}KB
                    </MenuLabel>
                    <MenuBtn
                      disabled={deleteBumperMutation.isPending}
                      onClick={() => deleteBumperMutation.mutate(b.id)}
                    >
                      DEL
                    </MenuBtn>
                  </MenuRow>
                </MenuItem>
              ))}
              {(myBumpersQuery.data || []).length === 0 && (
                <MenuItem $disabled>No bumpers uploaded yet</MenuItem>
              )}
            </MenuScrollList>

            {(myBumpersQuery.data || []).length < 20 && (
              <>
                <MenuDivider />
                <MenuLabel>UPLOAD NEW BUMPER</MenuLabel>
                <MenuRow style={{ marginTop: 6 }}>
                  <MenuInput
                    value={bumperTitleDraft}
                    onChange={(e) => setBumperTitleDraft(e.target.value)}
                    placeholder="Bumper title..."
                    style={{ flex: 1 }}
                  />
                </MenuRow>
                <MenuRow style={{ marginTop: 6 }}>
                  <input
                    ref={bumperFileRef}
                    type="file"
                    accept="video/mp4,video/webm,image/gif"
                    style={{
                      fontFamily: "'Courier New', monospace",
                      fontSize: "clamp(10px, 1.3vw, 14px)",
                      color: "#88ffaa",
                      background: "transparent",
                      border: "none",
                      width: "100%",
                    }}
                  />
                </MenuRow>
                <MenuRow style={{ marginTop: 8 }}>
                  <MenuBtn
                    $accent
                    disabled={uploadBumperMutation.isPending}
                    onClick={async () => {
                      const file = bumperFileRef.current?.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        alert("File too large. Max 2MB.");
                        return;
                      }
                      const durationMs = await new Promise<number>((resolve) => {
                        if (file.type === "image/gif") {
                          resolve(3000);
                          return;
                        }
                        const vid = document.createElement("video");
                        vid.preload = "metadata";
                        vid.onloadedmetadata = () => {
                          resolve(Math.round(vid.duration * 1000));
                          URL.revokeObjectURL(vid.src);
                        };
                        vid.onerror = () => {
                          resolve(0);
                          URL.revokeObjectURL(vid.src);
                        };
                        vid.src = URL.createObjectURL(file);
                      });
                      if (durationMs <= 0) {
                        alert("Could not read video duration.");
                        return;
                      }
                      if (durationMs > 5000) {
                        alert("Video too long. Max 5 seconds.");
                        return;
                      }
                      uploadBumperMutation.mutate({
                        file,
                        title: bumperTitleDraft.trim() || file.name.replace(/\.[^.]+$/, ""),
                        durationMs,
                      });
                    }}
                  >
                    {uploadBumperMutation.isPending ? "UPLOADING..." : "UPLOAD"}
                  </MenuBtn>
                </MenuRow>
                {uploadBumperMutation.isError && (
                  <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
                    {(uploadBumperMutation.error as Error)?.message || "Upload failed"}
                  </MenuLabel>
                )}
              </>
            )}

            <MenuDivider />
            <MenuLabel>
              Pool: {bumperPool.length} bumper{bumperPool.length !== 1 ? "s" : ""} from the community
            </MenuLabel>
          </MenuOverlay>
        );

      case "my-media":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>MY MEDIA</span>
              {renderBackBtn("MENU")}
            </MenuTitle>
            <MenuLabel>
              Your video library from tokens and uploads. Manage media in the My Videos folder via the Start Menu.
            </MenuLabel>
            <MenuDivider />
            <MenuScrollList>
              {(myMediaQuery.data || []).map((item: TVMediaItem) => (
                <MenuItem key={item.id}>
                  <MenuRow>
                    <span style={{ flex: 1 }}>
                      {item.title}
                    </span>
                    <MenuLabel>
                      {item.sourceType} · {item.mimeType} · {item.status}
                    </MenuLabel>
                    <MenuBtn
                      disabled={deleteMediaMutation.isPending}
                      onClick={() => deleteMediaMutation.mutate(item.id)}
                    >
                      DEL
                    </MenuBtn>
                  </MenuRow>
                  {item.durationSeconds != null && (
                    <MenuLabel>{item.durationSeconds}s</MenuLabel>
                  )}
                </MenuItem>
              ))}
              {(myMediaQuery.data || []).length === 0 && (
                <MenuItem $disabled>
                  {myMediaQuery.isLoading ? "Loading..." : "No video media yet. Import tokens via My Videos in Start Menu."}
                </MenuItem>
              )}
            </MenuScrollList>
          </MenuOverlay>
        );

      case "media-form":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>ADD MEDIA</span>
              {renderBackBtn("MY MEDIA")}
            </MenuTitle>
            <MenuLabel style={{ marginBottom: 8 }}>
              Media is now managed through the centralized Media Library.
              Open "My Videos" from the Start Menu to import tokens or upload files.
            </MenuLabel>
            <MenuBtn
              $accent
              onClick={() => setScreenView("my-media")}
            >
              BACK TO MY MEDIA
            </MenuBtn>
          </MenuOverlay>
        );

      case "channel-edit": {
        const editingChannel = (myChannelsQuery.data || []).find(
          (c) => c.id === selectedOwnChannelId
        );
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>EDIT CHANNEL</span>
              {renderBackBtn("CREATOR")}
            </MenuTitle>
            {!editingChannel ? (
              <MenuItem $disabled>Select a channel first</MenuItem>
            ) : (
              <MenuScrollList>
                <div style={{ marginBottom: 6 }}>
                  <MenuLabel>TITLE</MenuLabel>
                  <MenuInput
                    value={channelEditDraft.title}
                    onChange={(e) => setChannelEditDraft((d) => ({ ...d, title: e.target.value }))}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <MenuLabel>SLUG</MenuLabel>
                  <MenuInput
                    value={channelEditDraft.slug}
                    onChange={(e) => setChannelEditDraft((d) => ({ ...d, slug: e.target.value }))}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <MenuLabel>DESCRIPTION</MenuLabel>
                  <MenuInput
                    value={channelEditDraft.description}
                    onChange={(e) => setChannelEditDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Channel description..."
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <MenuLabel>LOGO URL</MenuLabel>
                  <MenuInput
                    value={channelEditDraft.logoUrl}
                    onChange={(e) => setChannelEditDraft((d) => ({ ...d, logoUrl: e.target.value }))}
                    placeholder="https:// or ipfs://..."
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <MenuLabel>BANNER URL</MenuLabel>
                  <MenuInput
                    value={channelEditDraft.bannerUrl}
                    onChange={(e) => setChannelEditDraft((d) => ({ ...d, bannerUrl: e.target.value }))}
                    placeholder="https:// or ipfs://..."
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <MenuLabel>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={channelEditDraft.isPublic}
                        onChange={(e) =>
                          setChannelEditDraft((d) => ({ ...d, isPublic: e.target.checked }))
                        }
                        style={{ accentColor: "#44cc66" }}
                      />
                      PUBLIC CHANNEL
                    </label>
                  </MenuLabel>
                </div>
                <div style={{ marginTop: 8 }}>
                  <MenuBtn
                    $accent
                    disabled={
                      !channelEditDraft.title.trim() ||
                      updateChannelMutation.isPending
                    }
                    onClick={() =>
                      selectedOwnChannelId &&
                      updateChannelMutation.mutate({
                        channelId: selectedOwnChannelId,
                        data: {
                          title: channelEditDraft.title.trim(),
                          description: channelEditDraft.description.trim(),
                          logoUrl: channelEditDraft.logoUrl.trim(),
                          bannerUrl: channelEditDraft.bannerUrl.trim(),
                          isPublic: channelEditDraft.isPublic,
                          slug: channelEditDraft.slug.trim(),
                        },
                      })
                    }
                  >
                    {updateChannelMutation.isPending ? "SAVING..." : "SAVE CHANGES"}
                  </MenuBtn>
                  {updateChannelMutation.isError && (
                    <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
                      {(updateChannelMutation.error as Error)?.message || "Failed to save"}
                    </MenuLabel>
                  )}
                </div>
              </MenuScrollList>
            )}
          </MenuOverlay>
        );
      }

      case "schedule": {
        const scheduleEntries = scheduleQuery.data || [];
        const myMedia = myMediaQuery.data || [];
        const readyMedia = myMedia.filter((m: any) => m.status === "ready");
        const activePlaylistItems = detailQuery.data?.playlistItems
          ?.filter((item: any) => {
            const pl = detailQuery.data?.playlists?.find((p: any) => p.isActive);
            return pl && item.playlistId === pl.id;
          })
          .sort((a: any, b: any) => a.sortOrder - b.sortOrder) || [];

        const totalLoopSec = activePlaylistItems.reduce(
          (sum: number, item: any) => sum + Math.max(1, Number(item.durationSeconds || 1)),
          0
        );
        const hours24 = Array.from({ length: 24 }, (_, i) => i);

        return (
          <MenuOverlay>
            <MenuTitle>
              <span>24H SCHEDULE</span>
              {renderBackBtn("CREATOR")}
            </MenuTitle>
            <MenuLabel>
              Your active playlist loops continuously (total: {totalLoopSec > 0 ? `${Math.floor(totalLoopSec / 60)}m ${totalLoopSec % 60}s loop` : "empty"}).
              Schedule entries override the loop at specific times.
            </MenuLabel>
            <MenuDivider />

            <div style={{ position: "relative", width: "100%", overflowX: "auto", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 0, minWidth: "100%" }}>
                {hours24.map((h) => {
                  const hourLabel = h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
                  const entriesInHour = scheduleEntries.filter((e: any) => {
                    const st = new Date(e.startsAt);
                    const en = new Date(e.endsAt);
                    const hourStart = new Date();
                    hourStart.setHours(h, 0, 0, 0);
                    const hourEnd = new Date();
                    hourEnd.setHours(h + 1, 0, 0, 0);
                    return st < hourEnd && en > hourStart;
                  });
                  const now = new Date();
                  const isCurrentHour = now.getHours() === h;
                  return (
                    <div
                      key={h}
                      style={{
                        flex: "1 0 auto",
                        minWidth: 28,
                        borderRight: "1px solid #1a3a2a",
                        textAlign: "center",
                        position: "relative",
                      }}
                    >
                      <div style={{
                        fontSize: "clamp(7px, 1vw, 10px)",
                        color: isCurrentHour ? "#ffcc33" : "#447755",
                        borderBottom: isCurrentHour ? "2px solid #ffcc33" : "1px solid #1a3a2a",
                        padding: "2px 0",
                        fontWeight: isCurrentHour ? "bold" : "normal",
                      }}>
                        {hourLabel}
                      </div>
                      <div style={{
                        minHeight: 24,
                        background: entriesInHour.length > 0
                          ? "rgba(68, 204, 102, 0.25)"
                          : totalLoopSec > 0
                            ? "rgba(40, 80, 60, 0.15)"
                            : "transparent",
                      }}>
                        {entriesInHour.length > 0 && (
                          <div style={{ fontSize: 6, color: "#88ffaa", lineHeight: 1.1, padding: 1, overflow: "hidden" }}>
                            {entriesInHour.map((e: any) => e.mediaTitle || "?").join(", ").slice(0, 12)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalLoopSec > 0 && (
                <div style={{ fontSize: "clamp(8px, 1vw, 11px)", color: "#44aa66", marginTop: 4, textAlign: "center" }}>
                  Playlist fills all unscheduled hours on loop
                </div>
              )}
            </div>
            <MenuDivider />

            <MenuLabel>SCHEDULED OVERRIDES ({scheduleEntries.length})</MenuLabel>
            <MenuScrollList style={{ maxHeight: "30%" }}>
              {scheduleEntries.map((entry: any) => {
                const start = new Date(entry.startsAt);
                const end = new Date(entry.endsAt);
                const now = new Date();
                const isLive = start <= now && end > now;
                const isPast = end <= now;
                return (
                  <MenuItem key={entry.id} $disabled={isPast}>
                    <MenuRow>
                      <span style={{ flex: 1, fontSize: 11 }}>
                        {isLive && <span style={{ color: "#ff3333" }}>● LIVE </span>}
                        {entry.mediaTitle || `Media #${entry.mediaItemId}`}
                      </span>
                      <MenuBtn
                        disabled={deleteScheduleEntryMutation.isPending}
                        onClick={() =>
                          selectedOwnChannelId &&
                          deleteScheduleEntryMutation.mutate({
                            channelId: selectedOwnChannelId,
                            entryId: entry.id,
                          })
                        }
                      >
                        DEL
                      </MenuBtn>
                    </MenuRow>
                    <MenuLabel>
                      {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} → {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </MenuLabel>
                  </MenuItem>
                );
              })}
              {scheduleEntries.length === 0 && (
                <MenuItem $disabled>
                  {scheduleQuery.isLoading ? "Loading..." : "No overrides — playlist loops 24/7"}
                </MenuItem>
              )}
            </MenuScrollList>

            <MenuDivider />
            <MenuLabel>ADD SCHEDULE OVERRIDE</MenuLabel>
            {readyMedia.length === 0 ? (
              <MenuLabel style={{ color: "#ff9944" }}>
                Add media first: Creator Tools → Add From Tokens
              </MenuLabel>
            ) : (
              <>
                <div style={{ marginBottom: 6 }}>
                  <MenuLabel>MEDIA</MenuLabel>
                  <MenuSelect
                    value={scheduleFormDraft.mediaItemId}
                    onChange={(e: any) =>
                      setScheduleFormDraft((d: any) => ({ ...d, mediaItemId: e.target.value }))
                    }
                    style={{ width: "100%" }}
                  >
                    <option value="">-- select --</option>
                    {readyMedia.map((m: any) => (
                      <option key={m.id} value={String(m.id)}>
                        {m.title} ({m.mimeType})
                      </option>
                    ))}
                  </MenuSelect>
                </div>
                <MenuRow>
                  <div style={{ flex: 1 }}>
                    <MenuLabel>FROM</MenuLabel>
                    <MenuInput
                      type="datetime-local"
                      value={scheduleFormDraft.startsAt}
                      onChange={(e: any) =>
                        setScheduleFormDraft((d: any) => ({ ...d, startsAt: e.target.value }))
                      }
                      style={{ width: "100%", colorScheme: "dark" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <MenuLabel>TO</MenuLabel>
                    <MenuInput
                      type="datetime-local"
                      value={scheduleFormDraft.endsAt}
                      onChange={(e: any) =>
                        setScheduleFormDraft((d: any) => ({ ...d, endsAt: e.target.value }))
                      }
                      style={{ width: "100%", colorScheme: "dark" }}
                    />
                  </div>
                </MenuRow>
                <MenuBtn
                  $accent
                  style={{ marginTop: 6, width: "100%" }}
                  disabled={
                    !scheduleFormDraft.mediaItemId ||
                    !scheduleFormDraft.startsAt ||
                    !scheduleFormDraft.endsAt ||
                    createScheduleEntryMutation.isPending
                  }
                  onClick={() => {
                    if (!selectedOwnChannelId) return;
                    createScheduleEntryMutation.mutate({
                      channelId: selectedOwnChannelId,
                      data: {
                        mediaItemId: Number(scheduleFormDraft.mediaItemId),
                        startsAt: new Date(scheduleFormDraft.startsAt).toISOString(),
                        endsAt: new Date(scheduleFormDraft.endsAt).toISOString(),
                      },
                    });
                  }}
                >
                  {createScheduleEntryMutation.isPending ? "ADDING..." : "ADD OVERRIDE"}
                </MenuBtn>
                {createScheduleEntryMutation.isError && (
                  <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
                    {(createScheduleEntryMutation.error as Error)?.message || "Failed to add"}
                  </MenuLabel>
                )}
              </>
            )}
          </MenuOverlay>
        );
      }

      default:
        return null;
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AppWindow title="WTF TV">
      <TVWrapper>
        <Cabinet>
          <BrandStrip>
            <BrandName>WTF</BrandName>
            <ModelLabel>MODEL CRT-95 · DIGITAL</ModelLabel>
          </BrandStrip>

          <BodyRow>
            <ScreenBay>
              <ScreenBezel>
                <CRTScreen $on={powerOn}>
                  {!powerOn && (
                    <OffScreen>
                      <OffScreenLabel>NO SIGNAL</OffScreenLabel>
                    </OffScreen>
                  )}

                  {showPowerFlash && <PowerOnFlash />}

                  {powerOn &&
                    screenView === "tv" &&
                    currentItem &&
                    isGif(currentItem.mimeType) &&
                    !showBumper &&
                    currentMediaUrl && (
                      <GifFrame
                        src={currentMediaUrl}
                        alt={currentItem.title}
                        style={{ opacity: currentMediaReady ? 1 : 0 }}
                        onLoad={handleCurrentMediaReady}
                        onError={handleCurrentMediaError}
                      />
                    )}
                  {powerOn &&
                    screenView === "tv" &&
                    currentItem &&
                    !isGif(currentItem.mimeType) &&
                    !showBumper &&
                    currentMediaUrl && (
                      <MediaVideo
                        ref={videoRef}
                        src={currentMediaUrl}
                        style={{ opacity: currentMediaReady ? 1 : 0 }}
                        autoPlay
                        playsInline
                        muted={false}
                        controls={false}
                        onLoadedData={handleCurrentMediaReady}
                        onError={handleCurrentMediaError}
                        onEnded={stepStream}
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

                  {shouldRenderBumper && activeBumper && screenView === "tv" && (
                    isGif(activeBumper.mimeType) ? (
                      <GifFrame
                        src={activeBumper.mediaUrl}
                        alt="bumper"
                        style={{ opacity: showBumper ? 1 : 0 }}
                        onLoad={handleBumperMediaReady}
                        onError={handleBumperMediaError}
                      />
                    ) : (
                      <MediaVideo
                        ref={bumperVideoRef}
                        src={activeBumper.mediaUrl}
                        style={{ opacity: showBumper ? 1 : 0 }}
                        autoPlay
                        playsInline
                        muted
                        controls={false}
                        onLoadedData={handleBumperMediaReady}
                        onError={handleBumperMediaError}
                        onEnded={finishTransition}
                      />
                    )
                  )}

                  {showStatic && screenView === "tv" && <StaticLayer />}

                  {powerOn && screenView === "tv" && (
                    <OSD>
                      {showBumper
                        ? `▶ ${activeBumper?.credit || "bumper"}`
                        : hasNoContent
                          ? `CH ${channelIndex >= 0 ? channelIndex + 1 : "--"} · ${isOffline ? (streamQuery.data?.message || "NO SIGNAL") : "NO SIGNAL"}`
                          : `CH ${channelIndex >= 0 ? channelIndex + 1 : "--"} · ${(currentChannel?.title || "No signal").slice(0, 40)}`}
                    </OSD>
                  )}

                  {powerOn && screenView !== "tv" && renderMenuScreen()}

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
      </TVWrapper>
    </AppWindow>
  );
}
