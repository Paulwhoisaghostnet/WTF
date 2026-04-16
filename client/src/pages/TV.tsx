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
  scheduleLabel?: string | null;
  generatedAt: string;
  loopDurationSeconds: number;
  queue: StreamQueueItem[];
  current: StreamQueueItem | null;
  offline: boolean;
  bumperOnly?: boolean;
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
  playlistId: number | null;
  label: string | null;
  startMinuteOfDay: number;
  endMinuteOfDay: number;
  sortOrder: number | null;
  createdAt: string;
  playlistName?: string | null;
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
  background:
    repeating-linear-gradient(
      92deg,
      rgba(90, 55, 25, 0.12) 0px,
      transparent 1px,
      transparent 2px,
      rgba(70, 40, 15, 0.08) 3px,
      transparent 4px,
      transparent 7px
    ),
    repeating-linear-gradient(
      88deg,
      rgba(110, 70, 30, 0.06) 0px,
      transparent 2px,
      transparent 11px
    ),
    linear-gradient(
      180deg,
      #5c3a1e 0%,
      #4f3018 8%,
      #462a14 30%,
      #3d2410 60%,
      #331e0c 85%,
      #2a1808 100%
    );
  border-radius: 12px 12px 6px 6px;
  border: 3px solid #1e1008;
  box-shadow:
    inset 0 1px 0 rgba(255, 200, 120, 0.1),
    inset 0 -3px 8px rgba(0, 0, 0, 0.5),
    inset 2px 0 4px rgba(0, 0, 0, 0.15),
    inset -2px 0 4px rgba(0, 0, 0, 0.15),
    0 8px 32px rgba(0, 0, 0, 0.6),
    0 2px 8px rgba(0, 0, 0, 0.3);
  padding: clamp(10px, 1.5vw, 16px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
`;

const BrandStrip = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 10px 8px;
  flex-shrink: 0;
`;

const BrandName = styled.div`
  font-family: "Georgia", "Times New Roman", serif;
  font-weight: bold;
  font-size: clamp(14px, 2.2vw, 22px);
  letter-spacing: 8px;
  color: #c8a04a;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.7),
    0 -1px 0 rgba(255, 220, 140, 0.15);
  text-transform: uppercase;
  background: linear-gradient(180deg, #dab860 0%, #b08830 60%, #906820 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));
`;

const ModelLabel = styled.div`
  font-family: "Courier New", monospace;
  font-size: clamp(7px, 1vw, 10px);
  color: #7a5a30;
  letter-spacing: 1.5px;
  opacity: 0.8;
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
  background: linear-gradient(
    145deg,
    #1c1c1c 0%,
    #141414 30%,
    #0e0e0e 70%,
    #0a0a0a 100%
  );
  border: 4px solid #060606;
  border-radius: 14px;
  padding: clamp(10px, 2vw, 22px);
  box-shadow:
    inset 0 2px 6px rgba(255, 255, 255, 0.04),
    inset 0 -2px 8px rgba(0, 0, 0, 0.8),
    inset 3px 0 8px rgba(0, 0, 0, 0.4),
    inset -3px 0 8px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(40, 40, 40, 0.5);
  display: flex;
  flex-direction: column;
`;

const CRTScreen = styled.div<{ $on: boolean }>`
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 12px / 10px;
  overflow: hidden;
  background: radial-gradient(
    ellipse at 50% 48%,
    #101820 0%,
    #080e16 45%,
    #030508 100%
  );
  border: 2px solid #000;

  ${({ $on }) =>
    $on &&
    css`
      box-shadow:
        inset 0 0 80px rgba(100, 180, 255, 0.04),
        inset 0 0 20px rgba(80, 140, 200, 0.03),
        0 0 2px rgba(100, 180, 255, 0.1);
    `}

  ${({ $on }) =>
    !$on &&
    css`
      box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.5);
    `}
`;

const ScanLines = styled.div`
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 1px,
    rgba(0, 0, 0, 0.06) 1px,
    rgba(0, 0, 0, 0.06) 2px
  );
  z-index: 10;
  border-radius: 12px / 10px;
`;

const CRTCurve = styled.div`
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 12px / 10px;
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 60%,
    rgba(0, 0, 0, 0.15) 75%,
    rgba(0, 0, 0, 0.4) 90%,
    rgba(0, 0, 0, 0.6) 100%
  );
  box-shadow:
    inset 0 0 100px 20px rgba(0, 0, 0, 0.25),
    inset 0 0 6px rgba(0, 0, 0, 0.5);
  z-index: 11;

  &::after {
    content: "";
    position: absolute;
    top: 4%;
    left: 8%;
    width: 30%;
    height: 15%;
    background: radial-gradient(
      ellipse at 30% 50%,
      rgba(255, 255, 255, 0.04) 0%,
      transparent 70%
    );
    border-radius: 50%;
    transform: rotate(-8deg);
  }
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
  width: clamp(6px, 0.9vw, 9px);
  height: clamp(6px, 0.9vw, 9px);
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.4);
  background: ${({ $on }) =>
    $on
      ? "radial-gradient(circle at 40% 35%, #88ff88, #33cc33 60%, #228822)"
      : "radial-gradient(circle at 40% 35%, #443333, #221111)"};
  box-shadow: ${({ $on }) =>
    $on
      ? "0 0 6px #44dd44, 0 0 14px rgba(68,221,68,0.25), inset 0 -1px 2px rgba(0,0,0,0.3)"
      : "inset 0 1px 2px rgba(0,0,0,0.3)"};
  transition: all 0.4s;
`;

const MediaVideo = styled.video`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  z-index: 2;
  background: #000;
  animation: ${flicker} 8s infinite;
`;

const GifFrame = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
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
  grid-template-columns: repeat(auto-fill, 120px);
  justify-content: center;
  grid-auto-rows: min-content;
  gap: 6px;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;
`;

const MenuTokenCard = styled.div`
  width: 120px;
  border: 1px solid #1a3a2a;
  border-radius: 4px;
  padding: 6px;
  font-size: 11px;
  color: #88ffaa;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;

  &:hover {
    border-color: #44cc66;
    background: rgba(68, 204, 102, 0.1);
  }
`;

const TokenPreview = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 3px;
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
  object-fit: contain;
  display: block;
`;

const TokenPreviewFallback = styled.div`
  font-family: "Courier New", monospace;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: #3f7a54;
`;

/* ------------------------------------------------------------------ */
/*  Physical Control Panel (right side of cabinet)                     */
/* ------------------------------------------------------------------ */

const ControlPanel = styled.div`
  width: clamp(100px, 14vw, 140px);
  flex-shrink: 0;
  background:
    repeating-linear-gradient(
      91deg,
      rgba(80, 55, 25, 0.1) 0px,
      transparent 1px,
      transparent 3px,
      rgba(60, 38, 15, 0.06) 4px,
      transparent 5px,
      transparent 8px
    ),
    linear-gradient(
      180deg,
      #503820 0%,
      #46301a 40%,
      #3c2814 70%,
      #32200e 100%
    );
  border-left: 3px solid #1a1008;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: clamp(10px, 2%, 20px) clamp(6px, 1%, 12px);
  gap: clamp(8px, 1.5vh, 18px);
  position: relative;
  box-shadow: inset 1px 0 4px rgba(0, 0, 0, 0.3);

  @media (max-width: 700px) {
    width: 100%;
    flex-direction: row;
    justify-content: space-evenly;
    padding: 10px 14px;
    border-left: none;
    border-top: 3px solid #1a1008;
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.3);
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
  width: clamp(36px, 4.5vw, 50px);
  height: clamp(36px, 4.5vw, 50px);
  border-radius: 50%;
  border: 2px solid #100a04;
  background: ${({ $active, $color }) => {
    if ($active) {
      return `
        radial-gradient(circle at 38% 30%, rgba(255,255,240,0.4) 0%, transparent 40%),
        conic-gradient(from 0deg, #a89840, #c8b860, #a89840, #8a7828, #a89840),
        radial-gradient(circle, #b0a048 0%, #887828 100%)
      `;
    }
    if ($color === "red") {
      return `
        radial-gradient(circle at 38% 30%, rgba(255,200,200,0.3) 0%, transparent 40%),
        conic-gradient(from 0deg, #994040, #bb5858, #994040, #774040, #994040),
        radial-gradient(circle, #aa4848 0%, #773030 100%)
      `;
    }
    return `
      radial-gradient(circle at 38% 30%, rgba(255,255,255,0.25) 0%, transparent 40%),
      conic-gradient(from 0deg, #908878, #b0a898, #908878, #706858, #908878),
      radial-gradient(circle, #a09888 0%, #686058 100%)
    `;
  }};
  cursor: pointer;
  position: relative;
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.15),
    inset 0 -1px 2px rgba(0, 0, 0, 0.3),
    0 3px 8px rgba(0, 0, 0, 0.5),
    0 1px 2px rgba(0, 0, 0, 0.4);
  transition: transform 0.1s;

  &::before {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 35%;
    background: #222;
    transform: translate(-50%, -85%);
    border-radius: 1px;
    box-shadow: 0 0 1px rgba(0, 0, 0, 0.5);
  }

  &:active {
    transform: scale(0.94);
    box-shadow:
      inset 0 1px 3px rgba(0, 0, 0, 0.3),
      0 1px 3px rgba(0, 0, 0, 0.4);
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
  width: clamp(55px, 8vw, 85px);
  height: clamp(55px, 8vw, 85px);
  border-radius: 50%;
  background: #18100a;
  border: 3px solid #120c06;
  position: relative;
  box-shadow:
    inset 0 3px 10px rgba(0, 0, 0, 0.7),
    inset 0 -1px 3px rgba(60, 40, 20, 0.2),
    0 1px 0 rgba(80, 55, 30, 0.15);
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 3px;
    background: repeating-linear-gradient(
      0deg,
      #120c06 0px,
      #120c06 2px,
      #221810 2px,
      #221810 3px,
      #1a1008 3px,
      #1a1008 5px
    );
    border-radius: 50%;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: radial-gradient(
      circle at 40% 35%,
      rgba(80, 55, 30, 0.15) 0%,
      transparent 50%
    );
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
  padding: 4px 20px 0;
  flex-shrink: 0;
`;

const Foot = styled.div`
  width: clamp(30px, 4.5vw, 48px);
  height: 10px;
  background: linear-gradient(180deg, #3e2e1a 0%, #2a1a0e 60%, #1e1208 100%);
  border-radius: 0 0 5px 5px;
  box-shadow:
    0 3px 6px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(80, 55, 30, 0.2);
`;

const ChannelDisplay = styled.div`
  font-family: "Courier New", monospace;
  font-size: clamp(14px, 2vw, 20px);
  font-weight: bold;
  color: #ff4422;
  text-shadow:
    0 0 6px rgba(255, 68, 34, 0.6),
    0 0 12px rgba(255, 68, 34, 0.2);
  background: #060402;
  border: 2px solid #1a1008;
  padding: clamp(3px, 0.5vw, 6px) clamp(8px, 1.2vw, 14px);
  text-align: center;
  min-width: clamp(40px, 4.5vw, 54px);
  border-radius: 3px;
  box-shadow:
    inset 0 1px 4px rgba(0, 0, 0, 0.6),
    0 1px 0 rgba(80, 55, 30, 0.1);
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
  const [clientQueueIdx, setClientQueueIdx] = useState(0);
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
  const [tokenPage, setTokenPage] = useState(0);
  const TOKENS_PER_PAGE = 20;
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
  const videoTimerRef = useRef<number | null>(null);
  const bumperTimerRef = useRef<number | null>(null);
  const bumperRetryRef = useRef(0);

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
    playlistId: "",
    startHour: "0",
    startMinute: "0",
    endHour: "1",
    endMinute: "0",
    label: "",
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
        "/api/tv/me/playable-tokens?limit=500&sort=recent"
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
    queryKey: ["tv", "bumpers", "pool", selectedChannelId],
    queryFn: () =>
      api.get<BumperPoolItem[]>(
        `/api/tv/bumpers/pool${selectedChannelId ? `?channelId=${selectedChannelId}` : ""}`
      ),
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
      if (videoTimerRef.current) { window.clearTimeout(videoTimerRef.current); videoTimerRef.current = null; }
      if (bumperTimerRef.current) { window.clearTimeout(bumperTimerRef.current); bumperTimerRef.current = null; }
      setLoadingSignal(false);
      setTransitioning(false);
      setActiveBumper(null);
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

  const bumperDeckRef = useRef<BumperPoolItem[]>([]);
  const bumperDeckPoolIdRef = useRef("");

  const pickNextBumper = useCallback((): BumperPoolItem | null => {
    const pool = bumperPoolQuery.data || [];
    if (pool.length === 0) return null;
    const poolId = pool.map((b) => b.id).sort().join(",");
    if (poolId !== bumperDeckPoolIdRef.current || bumperDeckRef.current.length === 0) {
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      bumperDeckRef.current = shuffled;
      bumperDeckPoolIdRef.current = poolId;
    }
    return bumperDeckRef.current.shift()!;
  }, [bumperPoolQuery.data]);

  const finishTransition = useCallback(() => {
    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    setTransitioning(false);
    setActiveBumper(null);
    setBumperReady(false);
    setBumperError(false);
    const queue = streamQuery.data?.queue || [];
    setClientQueueIdx((prev) => {
      const next = prev + 1;
      if (next < queue.length) return next;
      setStreamTick((v) => v + 1);
      return 0;
    });
  }, [streamQuery.data?.queue]);

  const isBumperOnly = streamQuery.data?.bumperOnly === true;

  const stepStream = useCallback(() => {
    if (videoTimerRef.current) {
      window.clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    bumperRetryRef.current = 0;
    if (isBumperOnly) {
      finishTransition();
      return;
    }
    const bumper = pickNextBumper();
    if (bumper) {
      setActiveBumper(bumper);
      setBumperReady(false);
      setBumperError(false);
      setTransitioning(true);
      const maxBumperMs = Math.min(bumper.durationMs + 500, 16000);
      bumperTimerRef.current = window.setTimeout(finishTransition, maxBumperMs);
    } else {
      setTransitioning(true);
      bumperTimerRef.current = window.setTimeout(finishTransition, 900);
    }
  }, [pickNextBumper, finishTransition, isBumperOnly]);

  useEffect(() => {
    if (videoTimerRef.current) {
      window.clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    if (!powerOn || transitioning || loadingSignal) return;
    if (!currentItem) return;
    const remainingMs = Math.max(
      400,
      Math.floor((currentItem.durationSeconds - (currentItem.offsetSeconds || 0)) * 1000)
    );
    videoTimerRef.current = window.setTimeout(stepStream, remainingMs);
    return () => {
      if (videoTimerRef.current) {
        window.clearTimeout(videoTimerRef.current);
        videoTimerRef.current = null;
      }
    };
  }, [
    powerOn,
    transitioning,
    loadingSignal,
    // Use underlying queue data rather than currentItem (declared later) to satisfy TS
    streamQuery.data?.queue,
    clientQueueIdx,
    stepStream,
  ]);

  useEffect(() => {
    setClientQueueIdx(0);
  }, [streamQuery.data?.generatedAt]);

  useEffect(() => {
    setCurrentMediaReady(false);
    setCurrentMediaError(false);
    setCurrentMediaUseDirect(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamQuery.data?.queue, clientQueueIdx]);

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
    if (bumperTimerRef.current) window.clearTimeout(bumperTimerRef.current);
    bumperRetryRef.current += 1;
    if (bumperRetryRef.current < 3) {
      const alt = pickNextBumper();
      if (alt) {
        setActiveBumper(alt);
        setBumperReady(false);
        setBumperError(false);
        const maxMs = Math.min(alt.durationMs + 500, 16000);
        bumperTimerRef.current = window.setTimeout(finishTransition, maxMs);
        return;
      }
    }
    setBumperReady(false);
    setBumperError(true);
    bumperTimerRef.current = window.setTimeout(finishTransition, 400);
  }, [finishTransition, pickNextBumper]);

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

  const refreshSourcesMutation = useMutation({
    mutationFn: (channelId: number) =>
      api.post<{ ok: boolean; total: number; updated: number }>(
        `/api/tv/channels/${channelId}/refresh-sources`
      ),
    onSuccess: (data) => {
      if (selectedOwnChannelId) {
        qc.invalidateQueries({ queryKey: ["tv", "channels", selectedOwnChannelId] });
      }
      alert(`Refreshed: ${data.updated}/${data.total} videos updated with correct source URIs.`);
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
      data: { playlistId: number; startMinuteOfDay: number; endMinuteOfDay: number; label?: string };
    }) => api.post(`/api/tv/channels/${channelId}/schedule`, data),
    onSuccess: () => {
      setScheduleFormDraft({ playlistId: "", startHour: "0", startMinute: "0", endHour: "1", endMinute: "0", label: "" });
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

  const currentItem = (streamQuery.data?.queue || [])[clientQueueIdx] || streamQuery.data?.current || null;
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
                <MenuItem
                  onClick={() => {
                    if (selectedOwnChannelId && !refreshSourcesMutation.isPending) {
                      refreshSourcesMutation.mutate(selectedOwnChannelId);
                    }
                  }}
                  $disabled={refreshSourcesMutation.isPending}
                >
                  {refreshSourcesMutation.isPending ? "REFRESHING..." : "REFRESH VIDEO SOURCES"}
                  <MenuLabel> (fix missing audio / wrong URI)</MenuLabel>
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
            <MenuRow style={{ marginBottom: 4, gap: 4, flexWrap: "wrap" }}>
              <MenuInput
                value={playableSearch}
                onChange={(e) => { setPlayableSearch(e.target.value); setTokenPage(0); }}
                placeholder="Search tokens..."
                style={{ fontSize: 11, flex: "1 1 120px" }}
              />
              <MenuSelect
                value={playableSort}
                onChange={(e) => { setPlayableSort(e.target.value as TokenSortMode); setTokenPage(0); }}
                style={{ minWidth: 80, maxWidth: 120, fontSize: 11 }}
              >
                <option value="recent">Newest</option>
                <option value="name-asc">A-Z</option>
                <option value="name-desc">Z-A</option>
                <option value="contract">Contract</option>
                <option value="mime">Type</option>
              </MenuSelect>
              <MenuLabel style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                {playableTokens.length} tokens
              </MenuLabel>
            </MenuRow>
            {(() => {
              const totalPages = Math.max(1, Math.ceil(playableTokens.length / TOKENS_PER_PAGE));
              const pageTokens = playableTokens.slice(tokenPage * TOKENS_PER_PAGE, (tokenPage + 1) * TOKENS_PER_PAGE);
              const pageStart = tokenPage * TOKENS_PER_PAGE + 1;
              const pageEnd = Math.min((tokenPage + 1) * TOKENS_PER_PAGE, playableTokens.length);
              return (
                <>
                  {totalPages > 1 && (
                    <MenuRow style={{ marginBottom: 4, gap: 6, justifyContent: "center", alignItems: "center" }}>
                      <MenuBtn
                        disabled={tokenPage === 0}
                        onClick={() => setTokenPage((p) => Math.max(0, p - 1))}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        ◀ PREV
                      </MenuBtn>
                      <MenuLabel style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                        {pageStart}–{pageEnd} of {playableTokens.length} · page {tokenPage + 1}/{totalPages}
                      </MenuLabel>
                      <MenuBtn
                        disabled={tokenPage >= totalPages - 1}
                        onClick={() => setTokenPage((p) => Math.min(totalPages - 1, p + 1))}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        NEXT ▶
                      </MenuBtn>
                    </MenuRow>
                  )}
                  <MenuTokenGrid>
                    {pageTokens.map((token) => {
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
                    <div style={{ fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{token.tokenName}</div>
                    <MenuBtn
                      $accent
                      disabled={!selectedOwnChannelId || addVideoMutation.isPending}
                      style={{ marginTop: "auto", width: "100%", padding: "3px 6px", fontSize: 10 }}
                    >
                      {addVideoMutation.isPending ? "..." : "+ ADD"}
                    </MenuBtn>
                  </MenuTokenCard>
                );
              })}
                  </MenuTokenGrid>
                  {totalPages > 1 && (
                    <MenuRow style={{ marginTop: 4, gap: 6, justifyContent: "center", alignItems: "center" }}>
                      <MenuBtn
                        disabled={tokenPage === 0}
                        onClick={() => setTokenPage((p) => Math.max(0, p - 1))}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        ◀ PREV
                      </MenuBtn>
                      <MenuLabel style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                        Page {tokenPage + 1}/{totalPages}
                      </MenuLabel>
                      <MenuBtn
                        disabled={tokenPage >= totalPages - 1}
                        onClick={() => setTokenPage((p) => Math.min(totalPages - 1, p + 1))}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        NEXT ▶
                      </MenuBtn>
                    </MenuRow>
                  )}
                </>
              );
            })()}
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
                    accept="video/mp4,video/webm,video/quicktime,video/x-matroska,image/gif"
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
                      if (file.size > 80 * 1024 * 1024) {
                        alert("File too large. Max 80MB.");
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
                      if (durationMs > 15000) {
                        alert("Video too long. Max 15 seconds.");
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
        const channelPlaylists = detailQuery.data?.playlists || [];
        const defaultPl = channelPlaylists.find((p: any) => p.isActive);
        const hours24 = Array.from({ length: 24 }, (_, i) => i);
        const fmtTime = (m: number) => {
          const h = Math.floor(m / 60) % 24;
          const mm = m % 60;
          const suffix = h < 12 ? "a" : "p";
          const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
          return mm === 0 ? `${display}${suffix}` : `${display}:${String(mm).padStart(2, "0")}${suffix}`;
        };
        const nowMinute = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();

        return (
          <MenuOverlay>
            <MenuTitle>
              <span>24H SCHEDULE (UTC)</span>
              {renderBackBtn("CREATOR")}
            </MenuTitle>
            <MenuLabel>
              Assign playlists to time slots. Unscheduled hours fall back to
              {defaultPl ? ` "${defaultPl.name}"` : " the default active playlist"}.
            </MenuLabel>
            <MenuDivider />

            <div style={{ position: "relative", width: "100%", overflowX: "auto", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 0, minWidth: "100%" }}>
                {hours24.map((h) => {
                  const hourLabel = h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
                  const hStart = h * 60;
                  const hEnd = (h + 1) * 60;
                  const entriesInHour = scheduleEntries.filter(
                    (e) => e.startMinuteOfDay < hEnd && e.endMinuteOfDay > hStart
                  );
                  const isCurrentHour = nowMinute >= hStart && nowMinute < hEnd;
                  return (
                    <div key={h} style={{ flex: "1 0 auto", minWidth: 28, borderRight: "1px solid #1a3a2a", textAlign: "center" }}>
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
                          : defaultPl
                            ? "rgba(40, 80, 60, 0.15)"
                            : "transparent",
                      }}>
                        {entriesInHour.length > 0 && (
                          <div style={{ fontSize: 6, color: "#88ffaa", lineHeight: 1.1, padding: 1, overflow: "hidden" }}>
                            {entriesInHour.map((e) => e.label || e.playlistName || "?").join(", ").slice(0, 12)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {defaultPl && (
                <div style={{ fontSize: "clamp(8px, 1vw, 11px)", color: "#44aa66", marginTop: 4, textAlign: "center" }}>
                  Default playlist fills unscheduled hours
                </div>
              )}
            </div>
            <MenuDivider />

            <MenuLabel>SCHEDULED SLOTS ({scheduleEntries.length})</MenuLabel>
            <MenuScrollList style={{ maxHeight: "25%" }}>
              {scheduleEntries.map((entry) => {
                const isLive = nowMinute >= entry.startMinuteOfDay && nowMinute < entry.endMinuteOfDay;
                return (
                  <MenuItem key={entry.id}>
                    <MenuRow>
                      <span style={{ flex: 1, fontSize: 11 }}>
                        {isLive && <span style={{ color: "#ff3333" }}>● LIVE </span>}
                        {entry.label || entry.playlistName || `Playlist #${entry.playlistId}`}
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
                      {fmtTime(entry.startMinuteOfDay)} → {fmtTime(entry.endMinuteOfDay)} UTC
                    </MenuLabel>
                  </MenuItem>
                );
              })}
              {scheduleEntries.length === 0 && (
                <MenuItem $disabled>
                  {scheduleQuery.isLoading ? "Loading..." : "No schedule slots — default playlist loops 24/7"}
                </MenuItem>
              )}
            </MenuScrollList>

            <MenuDivider />
            <MenuLabel>ADD SCHEDULE SLOT</MenuLabel>
            {channelPlaylists.length === 0 ? (
              <MenuLabel style={{ color: "#ff9944" }}>
                Create playlists first in Creator Tools → Playlists
              </MenuLabel>
            ) : (
              <>
                <div style={{ marginBottom: 4 }}>
                  <MenuLabel>PLAYLIST</MenuLabel>
                  <MenuSelect
                    value={scheduleFormDraft.playlistId}
                    onChange={(e) =>
                      setScheduleFormDraft((d) => ({ ...d, playlistId: e.target.value }))
                    }
                    style={{ width: "100%" }}
                  >
                    <option value="">-- select playlist --</option>
                    {channelPlaylists.map((pl: any) => (
                      <option key={pl.id} value={String(pl.id)}>
                        {pl.name}{pl.isActive ? " (default)" : ""}
                      </option>
                    ))}
                  </MenuSelect>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <MenuLabel>LABEL (optional)</MenuLabel>
                  <MenuInput
                    value={scheduleFormDraft.label}
                    onChange={(e) =>
                      setScheduleFormDraft((d) => ({ ...d, label: e.target.value }))
                    }
                    placeholder="e.g. Morning Mix"
                    style={{ width: "100%" }}
                  />
                </div>
                <MenuRow style={{ gap: 4 }}>
                  <div style={{ flex: 1 }}>
                    <MenuLabel>START (UTC)</MenuLabel>
                    <MenuRow style={{ gap: 2 }}>
                      <MenuSelect
                        value={scheduleFormDraft.startHour}
                        onChange={(e) => setScheduleFormDraft((d) => ({ ...d, startHour: e.target.value }))}
                        style={{ flex: 1 }}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={String(i)}>{String(i).padStart(2, "0")}</option>
                        ))}
                      </MenuSelect>
                      <span style={{ color: "#447755" }}>:</span>
                      <MenuSelect
                        value={scheduleFormDraft.startMinute}
                        onChange={(e) => setScheduleFormDraft((d) => ({ ...d, startMinute: e.target.value }))}
                        style={{ flex: 1 }}
                      >
                        {[0, 15, 30, 45].map((m) => (
                          <option key={m} value={String(m)}>{String(m).padStart(2, "0")}</option>
                        ))}
                      </MenuSelect>
                    </MenuRow>
                  </div>
                  <div style={{ flex: 1 }}>
                    <MenuLabel>END (UTC)</MenuLabel>
                    <MenuRow style={{ gap: 2 }}>
                      <MenuSelect
                        value={scheduleFormDraft.endHour}
                        onChange={(e) => setScheduleFormDraft((d) => ({ ...d, endHour: e.target.value }))}
                        style={{ flex: 1 }}
                      >
                        {Array.from({ length: 25 }, (_, i) => (
                          <option key={i} value={String(i)}>{String(i).padStart(2, "0")}</option>
                        ))}
                      </MenuSelect>
                      <span style={{ color: "#447755" }}>:</span>
                      <MenuSelect
                        value={scheduleFormDraft.endMinute}
                        onChange={(e) => setScheduleFormDraft((d) => ({ ...d, endMinute: e.target.value }))}
                        style={{ flex: 1 }}
                      >
                        {[0, 15, 30, 45].map((m) => (
                          <option key={m} value={String(m)}>{String(m).padStart(2, "0")}</option>
                        ))}
                      </MenuSelect>
                    </MenuRow>
                  </div>
                </MenuRow>
                <MenuBtn
                  $accent
                  style={{ marginTop: 6, width: "100%" }}
                  disabled={
                    !scheduleFormDraft.playlistId ||
                    createScheduleEntryMutation.isPending
                  }
                  onClick={() => {
                    if (!selectedOwnChannelId) return;
                    const startM = Number(scheduleFormDraft.startHour) * 60 + Number(scheduleFormDraft.startMinute);
                    const endM = Number(scheduleFormDraft.endHour) * 60 + Number(scheduleFormDraft.endMinute);
                    if (endM <= startM) {
                      alert("End time must be after start time");
                      return;
                    }
                    createScheduleEntryMutation.mutate({
                      channelId: selectedOwnChannelId,
                      data: {
                        playlistId: Number(scheduleFormDraft.playlistId),
                        startMinuteOfDay: startM,
                        endMinuteOfDay: endM,
                        label: scheduleFormDraft.label || undefined,
                      },
                    });
                  }}
                >
                  {createScheduleEntryMutation.isPending ? "ADDING..." : "ADD SLOT"}
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
                          const realDur = el.duration;
                          if (Number.isFinite(realDur) && realDur > 0) {
                            const storedDur = currentItem.durationSeconds;
                            if (Math.abs(realDur - storedDur) > 2) {
                              const corrected = Math.round(realDur);
                              if (videoTimerRef.current) {
                                window.clearTimeout(videoTimerRef.current);
                                const remaining = Math.max(400, Math.floor((realDur - (el.currentTime || 0)) * 1000));
                                videoTimerRef.current = window.setTimeout(stepStream, remaining);
                              }
                              api.patch(`/api/tv/playlist-items/${currentItem.itemId}/duration`, { durationSeconds: corrected }).catch(() => {});
                            }
                          }
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
                          : `CH ${channelIndex >= 0 ? channelIndex + 1 : "--"} · ${(currentChannel?.title || "No signal").slice(0, 40)}${streamQuery.data?.scheduleLabel ? ` · ${streamQuery.data.scheduleLabel}` : ""}`}
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
