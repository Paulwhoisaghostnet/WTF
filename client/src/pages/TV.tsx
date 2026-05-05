import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  queueItemKey,
  resolveSelectedChannelPlaybackState,
} from "../lib/tv-playback";
import styled, { keyframes, css } from "styled-components";
import {
  canCreateTvChannels,
  maxTvChannelsForRole,
  type UserRole,
} from "@shared/types";
import {
  TVStatic,
  buildTvCacheUrl,
  flushTvLog,
  isGif,
  reportItemEnd,
  shortAddress,
  tvLog,
} from "../features/tv";
import type {
  BumperPoolItem,
  ChannelDetailResponse,
  CommunityBumper,
  MediaUsageResponse,
  PlayableToken,
  PlaylistDraftItem,
  ScreenView,
  StreamPayload,
  StreamQueueItem,
  TVBumper,
  TVChannel,
  TVMediaItem,
  TVPlaylist,
  TVScheduleEntry,
  TVVideo,
  TokenSortMode,
} from "../features/tv/types";

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

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

/**
 * Off-screen sink for hidden preloader `<video>`/`<img>` elements.
 * Kept in the document (not display:none) so the browser actually
 * downloads the bytes and fills its media+HTTP caches — when the
 * visible <video> later mounts the same URL it should load from
 * cache rather than hit the network again.
 */
const PreloadSink = styled.div`
  position: absolute;
  left: -99999px;
  top: -99999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  contain: strict;
`;

const StallStaticOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  /* Dampen the borrowed TVStatic down to a breathy overlay on top of
     the frozen playback frame.  The underlying StaticCanvas carries
     its own opacity/blend, so we multiply it here with a soft fade-in
     so the indicator appears gently rather than snapping on. */
  opacity: 0.28;
  transition: opacity 300ms ease-in;
`;

const SkipNoticeBanner = styled.div`
  position: absolute;
  left: 50%;
  bottom: 18%;
  transform: translateX(-50%);
  z-index: 9;
  pointer-events: none;
  padding: 8px 18px;
  border-radius: 4px;
  background: rgba(12, 12, 14, 0.72);
  color: #f5e9c6;
  font-family: "VT323", "IBM Plex Mono", monospace;
  font-size: 18px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid rgba(245, 233, 198, 0.35);
  box-shadow:
    0 0 12px rgba(0, 0, 0, 0.5),
    0 0 24px rgba(245, 233, 198, 0.08);
  animation: skipNoticeFade 2600ms ease-out forwards;

  @keyframes skipNoticeFade {
    0% { opacity: 0; transform: translate(-50%, 6px); }
    10% { opacity: 0.95; transform: translate(-50%, 0); }
    85% { opacity: 0.9; }
    100% { opacity: 0; transform: translate(-50%, -6px); }
  }
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
  /* Must sit above StaticCanvas (z:4) and StaticScan (z:5) so that
   * during the brief window when both are mounted (bumper preloading
   * while the transition flag is still true) the viewer doesn't see
   * static painted over the actual video.  Must stay below the
   * ScanLines/CRTCurve overlays (z:10/11) so those still simulate
   * the glass surface. */
  z-index: 6;
  background: #000;
  animation: ${flicker} 8s infinite;
`;

const GifFrame = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  z-index: 6;
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

/* ---------- MTV-style metadata overlay ------------------------------
 * Shows during the opening and closing ~5 s of each video, and on the
 * first and third loops of a GIF (GIFs always play exactly three
 * times).  Deliberately echoes the look of MTV's late-80s "video info
 * bar": bottom-left placement, yellow/white heading, thin rules, and
 * an optional eyebrow badge above the title. */
const mtvOverlayCardCss = css<{ $visible: boolean }>`
  position: absolute;
  left: clamp(10px, 2.4%, 26px);
  bottom: clamp(12px, 3.6%, 36px);
  z-index: 13;
  max-width: min(68%, 520px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: clamp(6px, 1vw, 12px) clamp(9px, 1.3vw, 16px) clamp(7px, 1.1vw, 14px);
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  color: #fff;
  background: linear-gradient(
    120deg,
    rgba(10, 10, 14, 0.78) 0%,
    rgba(20, 20, 26, 0.66) 60%,
    rgba(10, 10, 14, 0.78) 100%
  );
  border-left: 3px solid #ffdb4d;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: translateY(${({ $visible }) => ($visible ? "0" : "6px")});
  transition: opacity 420ms ease, transform 420ms ease;
`;

const MtvOverlay = styled.div<{ $visible: boolean }>`
  ${mtvOverlayCardCss}
  pointer-events: none;
`;

const MtvOverlayLink = styled.a<{ $visible: boolean }>`
  ${mtvOverlayCardCss}
  pointer-events: ${({ $visible }) => ($visible ? "auto" : "none")};
  cursor: pointer;
  text-decoration: none;

  &:hover {
    border-left-color: #ffffff;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
  }
`;

const MtvEyebrow = styled.div`
  font-family: "Courier New", "Lucida Console", monospace;
  font-size: clamp(9px, 1.1vw, 11px);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #ffdb4d;
  text-shadow: 0 0 4px rgba(255, 219, 77, 0.4);
`;

const MtvTitle = styled.div`
  font-weight: 700;
  font-size: clamp(15px, 2.3vw, 22px);
  line-height: 1.15;
  letter-spacing: 0.01em;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.7);
`;

const MtvCreator = styled.div`
  font-weight: 500;
  font-size: clamp(12px, 1.7vw, 16px);
  color: #f0f0f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MtvSubline = styled.div`
  font-family: "Courier New", "Lucida Console", monospace;
  font-size: clamp(10px, 1.3vw, 12px);
  letter-spacing: 0.08em;
  color: #c8c8c8;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MtvWallet = styled.div`
  font-family: "Courier New", "Lucida Console", monospace;
  font-size: clamp(10px, 1.3vw, 12px);
  letter-spacing: 0.04em;
  color: #d8d8d8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TV() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [powerOn, setPowerOn] = useState(false);
  const [showPowerFlash, setShowPowerFlash] = useState(false);
  const [screenView, setScreenView] = useState<ScreenView>("tv");
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `tv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    null
  );
  const [selectedOwnChannelId, setSelectedOwnChannelId] = useState<
    number | null
  >(null);
  const [streamTick, setStreamTick] = useState(0);
  const [clientQueueIdx, setClientQueueIdx] = useState(0);
  const [loadingSignal, setLoadingSignal] = useState(false);
  const [authoritativeAdvancePending, setAuthoritativeAdvancePending] =
    useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [channelTitleDraft, setChannelTitleDraft] = useState("");
  const [playlistNameDraft, setPlaylistNameDraft] = useState("");
  const [selectedPlaylistEditorId, setSelectedPlaylistEditorId] = useState<
    number | null
  >(null);
  const [playlistRenameDraft, setPlaylistRenameDraft] = useState("");
  const [playlistDraft, setPlaylistDraft] = useState<PlaylistDraftItem[]>([]);
  const [playableSearch, setPlayableSearch] = useState("");
  const [playableSort, setPlayableSort] = useState<TokenSortMode>("recent");
  const [tokenPage, setTokenPage] = useState(0);
  const TOKENS_PER_PAGE = 20;
  const [bumperTitleDraft, setBumperTitleDraft] = useState("");
  const [bumperCategoryDraft, setBumperCategoryDraft] = useState<
    "personal" | "community"
  >("personal");
  /** Which media item is currently expanded for the "add to channel"
   * picker in the MY MEDIA screen.  null = no picker open. */
  const [mediaAddTargetId, setMediaAddTargetId] = useState<number | null>(null);
  /** Which media item is currently expanded for channel detach / usage
   * management in the MY MEDIA screen. */
  const [mediaManageTargetId, setMediaManageTargetId] = useState<number | null>(
    null
  );
  /** Which media item the user has requested to delete.  While set,
   * the DEL confirmation modal shows the list of channels/playlists
   * that will cascade-remove this row.  null = no confirmation open. */
  const [mediaDeleteTargetId, setMediaDeleteTargetId] = useState<number | null>(
    null
  );
  const [activeBumper, setActiveBumper] = useState<BumperPoolItem | null>(null);
  const [bumperReady, setBumperReady] = useState(false);
  const [bumperError, setBumperError] = useState(false);
  const [currentMediaReady, setCurrentMediaReady] = useState(false);
  const [currentMediaError, setCurrentMediaError] = useState(false);
  const [currentMediaUseDirect, setCurrentMediaUseDirect] = useState(false);
  const [skipNotice, setSkipNotice] = useState<string | null>(null);
  const skipNoticeTimerRef = useRef<number | null>(null);
  const failedItemCountsRef = useRef<Map<string, number>>(new Map());
  const sessionSkipListRef = useRef<Set<string>>(new Set());
  const currentPlaybackItemRef = useRef<StreamQueueItem | null>(null);
  const playbackTargetKeyRef = useRef("");
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
    // 4 is the platform default.  0 disables bumpers entirely for
    // the channel; the server clamps to [0, 20].
    videosPerBumper: 4,
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
        `/api/tv/channels/${selectedChannelId}/stream`
      ),
    enabled: Boolean(powerOn && selectedChannelId),
    // Under the client-driven playback model, the refetch isn't used
    // to re-sync playback time — it's only needed to pick up new or
    // removed playlist items.  A longer cadence means fewer spurious
    // queue re-renders while playback is running smoothly.
    refetchInterval: powerOn ? 5 * 60_000 : false,
    staleTime: 30_000,
  });
  const streamChannelId = streamQuery.data?.channel?.id ?? null;
  const streamMatchesSelectedChannel =
    selectedChannelId !== null && streamChannelId === selectedChannelId;

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

  const communityBumpersQuery = useQuery({
    queryKey: ["tv", "bumpers", "community"],
    queryFn: () => api.get<CommunityBumper[]>("/api/tv/bumpers/community"),
    enabled: Boolean(screenView === "bumpers"),
    staleTime: 60_000,
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

  /**
   * Cascade-preview query used by the DELETE confirmation dialog in
   * MY MEDIA.  Lists every channel/playlist that currently uses this
   * library item, so the user knows exactly what will be swept if
   * they confirm the delete (channel_videos.media_item_id FK is
   * ON DELETE CASCADE, which also cascades through playlist_items).
   */
  const mediaUsageQuery = useQuery({
    queryKey: ["media-library", "usage", mediaDeleteTargetId],
    queryFn: () =>
      api.get<MediaUsageResponse>(`/api/media/${mediaDeleteTargetId}/usage`),
    enabled: Boolean(mediaDeleteTargetId),
  });

  const mediaManageUsageQuery = useQuery({
    queryKey: ["media-library", "usage", mediaManageTargetId],
    queryFn: () =>
      api.get<MediaUsageResponse>(`/api/media/${mediaManageTargetId}/usage`),
    enabled: Boolean(mediaManageTargetId),
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
      if (safetyCapRef.current) { window.clearTimeout(safetyCapRef.current); safetyCapRef.current = null; }
      if (loadCapRef.current) { window.clearTimeout(loadCapRef.current); loadCapRef.current = null; }
      if (coverTriggerRef.current) { window.clearTimeout(coverTriggerRef.current); coverTriggerRef.current = null; }
      currentKeyRef.current = "";
      playbackTargetKeyRef.current = "";
      currentPlaybackItemRef.current = null;
      mediaReadyRef.current = false;
      currentItemStartRef.current = 0;
      currentItemVisibleStartRef.current = 0;
      currentItemMetaRef.current = null;
      bumperStartRef.current = 0;
      bumperMetaRef.current = null;
      transitionModeRef.current = "advance";
      preloadReadyRef.current = new Set();
      setAuthoritativeAdvancePending(false);
      setLoadingSignal(false);
      setTransitioning(false);
      setActiveBumper(null);
      setShowPowerFlash(false);
      setCurrentMediaReady(false);
      setCurrentMediaError(false);
      setCurrentMediaStalled(false);
      if (stallIndicatorTimerRef.current) {
        window.clearTimeout(stallIndicatorTimerRef.current);
        stallIndicatorTimerRef.current = null;
      }
      setStallIndicatorVisible(false);
      setCurrentMediaUseDirect(false);
      setBumperReady(false);
      setBumperError(false);
      return;
    }
    // Every time we power on or flip channels, start a fresh 5-minute
    // slot so the first item plays without a leading commercial, and
    // reset the client cursor back to the start of the new playlist.
    // Also drop any in-flight transition/cover state from the previous
    // channel so a stale bumper doesn't play over the new channel.
    if (bumperTimerRef.current) { window.clearTimeout(bumperTimerRef.current); bumperTimerRef.current = null; }
    if (loadCapRef.current) { window.clearTimeout(loadCapRef.current); loadCapRef.current = null; }
    if (coverTriggerRef.current) { window.clearTimeout(coverTriggerRef.current); coverTriggerRef.current = null; }
    slotStartRef.current = Date.now();
    currentKeyRef.current = "";
    playbackTargetKeyRef.current = "";
    currentPlaybackItemRef.current = null;
    bumperStartRef.current = 0;
    bumperMetaRef.current = null;
    transitionModeRef.current = "advance";
    preloadReadyRef.current = new Set();
    setAuthoritativeAdvancePending(false);
    setClientQueueIdx(0);
    setTransitioning(false);
    setActiveBumper(null);
    setBumperReady(false);
    setBumperError(false);
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
    // Re-apply volume when the active item identity changes too —
    // `streamQuery.data.current` is always the first item of the
    // full-playlist response under the rebuilt stream model, so keying
    // on `videoId` alone wouldn't fire as the client advanced.
  }, [volume, clientQueueIdx]);

  // Flush playback telemetry to the server on a 10 s interval and
  // on page unload.  All events are also kept in console and in the
  // in-memory `window.__tvLog` ring so they're inspectable live.
  useEffect(() => {
    const interval = window.setInterval(() => {
      flushTvLog(false);
    }, 10_000);
    const onBeforeUnload = () => flushTvLog(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushTvLog(true);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Emit a session-level event when the TV is powered on/off or the
  // user switches channel, so we can correlate item-level events with
  // session context.
  useEffect(() => {
    tvLog("session.power", { powerOn, channelId: selectedChannelId });
  }, [powerOn, selectedChannelId]);

  /* ---------- playlist draft sync ---------- */

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;
    if (detail.playlists.length === 0) {
      if (selectedPlaylistEditorId !== null) {
        setSelectedPlaylistEditorId(null);
      }
      return;
    }
    if (
      selectedPlaylistEditorId !== null &&
      detail.playlists.some((playlist) => playlist.id === selectedPlaylistEditorId)
    ) {
      return;
    }
    const fallbackId =
      detail.playlists.find((playlist) => playlist.isActive)?.id ??
      detail.playlists[0]?.id ??
      null;
    if (fallbackId !== selectedPlaylistEditorId) {
      setSelectedPlaylistEditorId(fallbackId);
    }
  }, [detailQuery.data, selectedPlaylistEditorId]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) {
      setPlaylistDraft([]);
      return;
    }
    const selectedPlaylist =
      (selectedPlaylistEditorId
        ? detail.playlists.find((playlist) => playlist.id === selectedPlaylistEditorId)
        : null) ||
      detail.playlists.find((playlist) => playlist.isActive) ||
      detail.playlists[0] ||
      null;
    if (!selectedPlaylist) {
      setPlaylistDraft([]);
      return;
    }
    const items = detail.playlistItems
      .filter((item) => item.playlistId === selectedPlaylist.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    setPlaylistDraft(
      items.map((item) => ({
        videoId: item.videoId,
        durationSeconds: Math.max(1, Number(item.durationSeconds || 1)),
      }))
    );
  }, [detailQuery.data, selectedPlaylistEditorId]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) {
      setPlaylistRenameDraft("");
      return;
    }
    const selectedPlaylist =
      (selectedPlaylistEditorId
        ? detail.playlists.find((playlist) => playlist.id === selectedPlaylistEditorId)
        : null) ||
      detail.playlists.find((playlist) => playlist.isActive) ||
      detail.playlists[0] ||
      null;
    setPlaylistRenameDraft(selectedPlaylist?.name || "");
  }, [detailQuery.data, selectedPlaylistEditorId]);

  /* ---------- rolling buffer / prefetch ---------------------------
   *
   * We ask the server to pre-warm its disk cache for the upcoming
   * playlist items, and belt-and-suspenders kick off a browser-level
   * preload so that by the time we switch to the next item the video
   * element can hit an already-hot cache (server + browser). */
  const prefetchedKeyRef = useRef<string>("");
  useEffect(() => {
    const queue = streamMatchesSelectedChannel ? streamQuery.data?.queue || [] : [];
    if (!powerOn || queue.length === 0) return;
    const upcoming = queue.slice(1);
    if (upcoming.length === 0) return;

    const key = upcoming.map((i) => i.videoId).join(",");
    if (key === prefetchedKeyRef.current) return;
    prefetchedKeyRef.current = key;

    const urls = upcoming.map((i) => i.sourceUri).filter(Boolean);
    if (urls.length > 0 && user) {
      api.post("/api/tv/cache/prefetch", { urls }).catch(() => {
        /* prefetch is best-effort */
      });
    }
    for (const item of upcoming) {
      if (isGif(item.mimeType)) {
        const img = new Image();
        img.src = item.cacheUrl;
      } else {
        const v = document.createElement("video");
        v.preload = "auto";
        v.src = item.cacheUrl;
      }
    }
  }, [streamQuery.data?.queue, powerOn, streamMatchesSelectedChannel, user]);

  /* ---------- stream timing --------------------------------------
   *
   * Broadcast playback:
   *
   *   • The server decides which queue item is currently on-air and
   *     includes `offsetSeconds` so each viewer joins mid-feed at the
   *     right point instead of starting from the top.
   *   • The client seeks into that item, preloads the next items in
   *     the rotated queue, and asks the server for the next on-air
   *     state at natural boundaries.
   *   • A 10-minute safety cap still guards against a fully stalled
   *     media element that never reports `ended` / `error`.
   *
   * The old client-owned cursor plus local cover-bumper logic is
   * what caused overlapping audio/video feeds and the DVD-like "start
   * from the beginning" feel.  The client now renders the server's
   * broadcast state instead of inventing a second one.
   */
  const HARD_ITEM_CAP_MS = 10 * 60 * 1000;

  /* ---------- commercial slots are now server-side ----------------
   *
   * The server pre-interleaves bumper queue items based on the
   * channel's `videosPerBumper` setting, so the client no longer
   * runs a wall-clock slot timer.  This eliminates the old bug
   * where a long video would be cut off at the 5-minute mark.  A
   * server-scheduled bumper is just another queue item with
   * kind: "bumper"; the client plays it through the normal video
   * element exactly like any other playlist entry.
   *
   * The only bumper trigger the client still owns is the cover-gap
   * case: if the next real item hasn't reported "ready" by the
   * time the current one ends, we roll a local bumper so the
   * viewer never sees silent black.
   */

  /* ---------- buffer / dead-air coverage --------------------------
   *
   * Goal: < 1 s of visible gap between any two content items.
   *
   *   1. The next 2 items are preloaded in hidden media elements
   *      while the current one plays.  This warms both the browser
   *      cache and the server's IPFS proxy cache, so by the time we
   *      actually mount the real <video> element the file is local.
   *
   *   2. On an advance, if the next item doesn't report "ready" fast
   *      enough we roll a cover bumper over the gap instead of
   *      leaving silent dead air.  The cover plays forward-only —
   *      we never rewind to the previous item, which was the bug
   *      in the old drift-snap implementation.
   *
   *   3. If no bumper pool is available (or the cover bumper itself
   *      errors out) the <TVStatic> fallback shows Gaussian noise
   *      with a hushed pink-noise hiss so the channel still feels
   *      "on".
   *
   *   4. While the real item is still loading we cap at
   *      LOAD_CAP_MS — if an item never becomes ready within the
   *      cap we skip it entirely so a broken file can't hang the
   *      rest of the playlist.  45 s is generous enough for a
   *      first-play IPFS fetch on a public gateway while still
   *      defending against truly broken files.
   */
  const COVER_CHECK_MS = 650;
  const COVER_MIN_MS = 1_500;
  const COVER_MAX_MS = 12_000;
  const LOAD_CAP_MS = 45_000;
  const PRELOAD_LOOKAHEAD = 2;

  /* ---------- initial buffer gate --------------------------------
   *
   * When a new video starts we hold `<video>.play()` until the
   * browser has at least BUFFER_GATE_WATERMARK_SEC seconds of data
   * buffered ahead of the play head.  The main video element is
   * mounted and `preload="auto"` the whole time so it keeps filling
   * the buffer in the background; meanwhile we roll short bumpers
   * on top, alternating personal/community, until the watermark is
   * hit.  BUFFER_GATE_MAX_WAIT_MS is an escape hatch: if buffering
   * is simply not keeping up we stop hiding the player and let the
   * browser do its thing — better a slightly-stuttering video than
   * an endless bumper reel.
   *
   * Mid-video stalls are explicitly NOT covered by this gate.  Once
   * the user is engaged with a video, ripping them back to a bumper
   * is a worse experience than a brief frozen frame.
   */
  const BUFFER_GATE_WATERMARK_SEC = 10;
  const BUFFER_GATE_CHECK_INTERVAL_MS = 500;
  const BUFFER_GATE_MAX_WAIT_MS = 20_000;

  /* ---------- mid-video stall indicator --------------------------
   *
   * When a video has already started and then stalls mid-playback we
   * do NOT cut to a bumper — that would be a terrible experience,
   * yanking the user out of content they chose to watch for a short
   * load blip.  Instead we give the browser a moment to recover on
   * its own and, if the stall drags on past
   * STALL_INDICATOR_DELAY_MS, fade in a subtle TVStatic overlay on
   * top of the frozen frame as a "we're rebuffering" signal.  The
   * overlay clears the instant playback resumes (onPlaying).
   */
  const STALL_INDICATOR_DELAY_MS = 3_000;

  const bumperDeckRef = useRef<BumperPoolItem[]>([]);
  const bumperDeckPoolIdRef = useRef("");
  // "advance" — slot-timer bumper at a natural item boundary.  When
  // the bumper ends we advance the queue cursor.
  // "cover"   — a slow-load or error cover.  The cursor has already
  // advanced, we are now filling dead air while the new item finishes
  // buffering.  When the cover ends we do NOT advance again.  This is
  // the piece that used to cause "bumper, then half video, then
  // bumper, then back to the cut-off video" — that was the old
  // drift-snap code, not cover bumpers themselves, and we reinstate
  // cover bumpers here with strict forward-only semantics to fill
  // the IPFS load gap.
  const transitionModeRef = useRef<"advance" | "cover">("advance");
  const safetyCapRef = useRef<number | null>(null);
  const coverTriggerRef = useRef<number | null>(null);
  const loadCapRef = useRef<number | null>(null);
  const coverStartRef = useRef<number>(0);
  // Keys of playlist items that the hidden preloader has confirmed
  // "ready enough" to play (HAVE_FUTURE_DATA for video, onLoad for
  // gifs).  We use this to decide whether an advance needs a cover
  // bumper at all — if the next item is already buffered we skip
  // the cover and hand off instantly.
  const preloadReadyRef = useRef<Set<string>>(new Set());
  const currentKeyRef = useRef<string>("");
  const mediaReadyRef = useRef(false);
  const transitioningRef = useRef(false);
  // Start of the current slot.  Resets when a bumper (advance-mode)
  // finishes, so the next slot begins "fresh" after a commercial.
  const slotStartRef = useRef<number>(Date.now());
  // When the current item started on screen.  Used by the telemetry
  // events to report how long a video actually played before ending
  // (vs how long it was supposed to).
  const currentItemStartRef = useRef<number>(0);
  const currentItemMetaRef = useRef<{
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
  } | null>(null);
  const currentItemVisibleStartRef = useRef<number>(0);
  const bumperStartRef = useRef<number>(0);
  const bumperMetaRef = useRef<{
    bumperId: number | null;
    reason: "advance" | "cover" | "gate";
    plannedMs: number;
  } | null>(null);

  // Initial buffer gate state.  Flipped true when a new playable
  // item mounts; cleared when the buffer watermark is reached, the
  // deadline expires, or playback is otherwise aborted (channel
  // switch, power off, queue reset).  Everything below is driven
  // from refs instead of state so the ticker can evaluate without
  // causing re-renders on every 500 ms tick.
  const bufferGateActiveRef = useRef(false);
  const bufferGateStartedAtRef = useRef(0);
  const bufferGateDeadlineRef = useRef(0);
  const bufferGateTickerRef = useRef<number | null>(null);
  // Alternates between "personal" and "community" on each draw so
  // the opening commercial reel feels like actual programming and
  // not the same bumper three times in a row.
  const gateCategoryRef = useRef<"personal" | "community">("personal");

  const [currentMediaStalled, setCurrentMediaStalled] = useState(false);
  const [stallIndicatorVisible, setStallIndicatorVisible] = useState(false);
  const stallIndicatorTimerRef = useRef<number | null>(null);
  const [mtvOverlayVisible, setMtvOverlayVisible] = useState(false);
  const mtvOverlayTickerRef = useRef<number | null>(null);

  useEffect(() => {
    mediaReadyRef.current = currentMediaReady;
  }, [currentMediaReady]);

  useEffect(() => {
    transitioningRef.current = transitioning;
  }, [transitioning]);

  const clearSafetyCap = useCallback(() => {
    if (safetyCapRef.current) {
      window.clearTimeout(safetyCapRef.current);
      safetyCapRef.current = null;
    }
  }, []);

  const clearCoverTrigger = useCallback(() => {
    if (coverTriggerRef.current) {
      window.clearTimeout(coverTriggerRef.current);
      coverTriggerRef.current = null;
    }
  }, []);

  const clearLoadCap = useCallback(() => {
    if (loadCapRef.current) {
      window.clearTimeout(loadCapRef.current);
      loadCapRef.current = null;
    }
  }, []);

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

  const advanceQueue = useCallback((options?: {
    targetIdx?: number;
    skippedBlacklisted?: number;
  }) => {
    clearSafetyCap();
    clearCoverTrigger();
    clearLoadCap();
    if (videoTimerRef.current) {
      window.clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    setTransitioning(false);
    setActiveBumper(null);
    setBumperReady(false);
    setBumperError(false);
    setCurrentMediaStalled(false);
    const queue = streamMatchesSelectedChannel ? streamQuery.data?.queue || [] : [];
    const skippedBlacklisted = options?.skippedBlacklisted ?? 0;
    const targetIdx = options?.targetIdx;
    setClientQueueIdx((prev) => {
      if (queue.length === 0) {
        playbackTargetKeyRef.current = "";
        currentPlaybackItemRef.current = null;
        return 0;
      }

      const immediateNext = prev + 1;
      const resolved =
        typeof targetIdx === "number"
          ? Math.max(0, Math.min(targetIdx, queue.length - 1))
          : immediateNext < queue.length
            ? immediateNext
            : 0;
      const nextItem = queue[resolved] || null;
      playbackTargetKeyRef.current = nextItem ? queueItemKey(nextItem) : "";
      const wrapped =
        typeof targetIdx === "number"
          ? resolved <= prev
          : immediateNext >= queue.length;

      if (wrapped) {
        tvLog("queue.advance.wrap", {
          fromIdx: prev,
          toIdx: resolved,
          queueLen: queue.length,
          skippedBlacklisted,
        });
        setStreamTick((v) => v + 1);
        return resolved;
      }

      if (skippedBlacklisted > 0) {
        tvLog("queue.advance.skiplist", {
          fromIdx: prev,
          toIdx: resolved,
          skippedBlacklisted,
        });
      } else {
        tvLog("queue.advance", { fromIdx: prev, toIdx: resolved });
      }
      return resolved;
    });
  }, [
    streamMatchesSelectedChannel,
    streamQuery.data?.queue,
    clearSafetyCap,
    clearCoverTrigger,
    clearLoadCap,
  ]);

  // End of a bumper — routes to the next step based on why the
  // bumper played.  `gate` bumpers loop back through the buffer
  // gate evaluator (no queue advance); everything else advances
  // the queue as before.  The slot-start timestamp resets either
  // way so the next commercial is ~5 minutes away.
  const finishTransition = useCallback(() => {
    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    const meta = bumperMetaRef.current;
    const elapsed = bumperStartRef.current
      ? Date.now() - bumperStartRef.current
      : null;
    const wasGate = meta?.reason === "gate" || bufferGateActiveRef.current;
    tvLog(wasGate ? "buffer-gate.bumper.end" : "bumper.end.advance", {
      reason: meta?.reason || (wasGate ? "gate" : "advance"),
      bumperId: meta?.bumperId ?? null,
      elapsedMs: elapsed,
      plannedMs: meta?.plannedMs ?? null,
    });
    bumperMetaRef.current = null;
    bumperStartRef.current = 0;
    slotStartRef.current = Date.now();
    if (wasGate) {
      // Still in the initial buffer gate — evaluate whether we can
      // release playback or need to roll another bumper.  We do NOT
      // advance the queue cursor; the video hasn't played yet.
      // `evaluateBufferGate` lives later in source order, so we
      // reach it through the forward ref pattern used by the gate
      // state machine.  Dispatched via the microtask queue so any
      // concurrent state updates from this tick flush first.
      queueMicrotask(() => {
        if (!bufferGateActiveRef.current) return;
        if (Date.now() >= bufferGateDeadlineRef.current) {
          exitBufferGateRef.current("deadline");
          return;
        }
        if (videoRef.current) {
          const el = videoRef.current;
          try {
            if (el.buffered.length > 0) {
              const ahead =
                el.buffered.end(el.buffered.length - 1) -
                (Number.isFinite(el.currentTime) ? el.currentTime : 0);
              if (ahead >= BUFFER_GATE_WATERMARK_SEC) {
                exitBufferGateRef.current("watermark");
                return;
              }
            }
          } catch {
            /* fall through */
          }
        }
        startGateBumperRef.current();
      });
      return;
    }
    advanceQueue();
  }, [advanceQueue, BUFFER_GATE_WATERMARK_SEC]);

  // Forward ref to `exitBufferGate` so `finishTransition` (declared
  // before the gate helpers) can call it without a circular dep.
  const exitBufferGateRef = useRef<(reason: "watermark" | "deadline" | "no-pool" | "abort") => void>(
    () => {}
  );

  // Starts a commercial bumper.  Caller must only invoke this at a
  // natural item boundary (onEnded / gif-loop timer / item-error /
  // pre-advance cover).  After the bumper ends we advance the queue
  // cursor by exactly one.  Bumpers are capped so a broken file
  // can't hang the channel indefinitely.
  //
  // `reason` is surfaced in the telemetry event and used to size the
  // bumper budget — "cover" bumpers are capped more tightly so a
  // slow-loading item doesn't sit behind 30 s of advertising.
  const startBumper = useCallback(
    (reason: "advance" | "cover" = "advance") => {
      transitionModeRef.current = reason;
      bumperRetryRef.current = 0;
      if (bumperTimerRef.current) window.clearTimeout(bumperTimerRef.current);
      const bumper = pickNextBumper();
      bumperStartRef.current = Date.now();
      if (bumper) {
        const cap = reason === "cover" ? COVER_MAX_MS : 30_500;
        const maxBumperMs = Math.min(bumper.durationMs + 500, cap);
        bumperMetaRef.current = {
          bumperId: bumper.id,
          reason,
          plannedMs: maxBumperMs,
        };
        tvLog("bumper.start", {
          reason,
          bumperId: bumper.id,
          plannedMs: maxBumperMs,
          mimeType: bumper.mimeType,
        });
        setActiveBumper(bumper);
        setBumperReady(false);
        setBumperError(false);
        setTransitioning(true);
        bumperTimerRef.current = window.setTimeout(finishTransition, maxBumperMs);
      } else {
        // No bumpers available — fall back to the TVStatic layer.
        // Cover-reason hold-open is longer so the static has a real
        // chance to hide the IPFS fetch; advance-reason hold-open is
        // brief because the user just finished a video and the next
        // one is likely already cached via the preloader.
        const fallbackMs = reason === "cover" ? COVER_MIN_MS : 400;
        bumperMetaRef.current = {
          bumperId: null,
          reason,
          plannedMs: fallbackMs,
        };
        tvLog("bumper.start.nopool", { reason, plannedMs: fallbackMs });
        setTransitioning(true);
        bumperTimerRef.current = window.setTimeout(
          finishTransition,
          fallbackMs
        );
      }
    },
    [pickNextBumper, finishTransition, COVER_MAX_MS, COVER_MIN_MS]
  );

  /* ---------- initial buffer gate ---------------------------------
   *
   * The gate is a small state machine distinct from cover bumpers
   * and queue advances: its job is to keep the main <video> element
   * mounted and buffering in the background while we roll a
   * rotating personal/community bumper reel on top, and to release
   * play() only once the browser has BUFFER_GATE_WATERMARK_SEC of
   * data ahead of the play head.  Once released, control returns
   * to the normal playback/advance path.
   */
  const clearBufferGateTicker = useCallback(() => {
    if (bufferGateTickerRef.current !== null) {
      window.clearInterval(bufferGateTickerRef.current);
      bufferGateTickerRef.current = null;
    }
  }, []);

  const pickGateBumper = useCallback((): BumperPoolItem | null => {
    const pool = bumperPoolQuery.data || [];
    if (pool.length === 0) return null;
    const target = gateCategoryRef.current;
    // Draw a random bumper of the target category if one exists;
    // otherwise fall back to any bumper so we're never stuck.
    const matches = pool.filter((b) => b.category === target);
    let chosen: BumperPoolItem;
    if (matches.length > 0) {
      chosen = matches[Math.floor(Math.random() * matches.length)]!;
    } else {
      chosen = pool[Math.floor(Math.random() * pool.length)]!;
    }
    gateCategoryRef.current = target === "personal" ? "community" : "personal";
    return chosen;
  }, [bumperPoolQuery.data]);

  const isBufferDeepEnough = useCallback((): boolean => {
    const el = videoRef.current;
    if (!el) return false;
    try {
      if (el.buffered.length === 0) return false;
      const currentTime = Number.isFinite(el.currentTime) ? el.currentTime : 0;
      const bufferedEnd = el.buffered.end(el.buffered.length - 1);
      const ahead = bufferedEnd - currentTime;
      const dur = Number.isFinite(el.duration) ? el.duration : 0;
      // A clip shorter than the watermark is "ready" as soon as the
      // tail arrives — we'd wait forever otherwise.
      if (dur > 0 && dur < BUFFER_GATE_WATERMARK_SEC) {
        return bufferedEnd >= dur - 0.5;
      }
      return ahead >= BUFFER_GATE_WATERMARK_SEC;
    } catch {
      return false;
    }
  }, [BUFFER_GATE_WATERMARK_SEC]);

  const exitBufferGate = useCallback(
    (reason: "watermark" | "deadline" | "no-pool" | "abort") => {
      if (!bufferGateActiveRef.current) return;
      bufferGateActiveRef.current = false;
      clearBufferGateTicker();
      if (bumperTimerRef.current) {
        window.clearTimeout(bumperTimerRef.current);
        bumperTimerRef.current = null;
      }
      const elapsedMs = bufferGateStartedAtRef.current
        ? Date.now() - bufferGateStartedAtRef.current
        : null;
      bufferGateStartedAtRef.current = 0;
      bumperMetaRef.current = null;
      setTransitioning(false);
      setActiveBumper(null);
      setBumperReady(false);
      setBumperError(false);
      tvLog("buffer-gate.exit", {
        key: currentKeyRef.current,
        reason,
        elapsedMs,
      });
      if (reason === "abort") return;
      // Kick playback unless we were aborted (item change / power
      // off will drive the video lifecycle themselves).
      const el = videoRef.current;
      if (el) {
        const p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch((err) => {
            tvLog("buffer-gate.play-error", {
              key: currentKeyRef.current,
              reason,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    },
    [clearBufferGateTicker]
  );

  // Forward reference for the mutual recursion between
  // `evaluateBufferGate` and `startGateBumper`.  Updated every
  // render so the timer callback always fires the latest version.
  const startGateBumperRef = useRef<() => void>(() => {});

  const evaluateBufferGate = useCallback(() => {
    if (!bufferGateActiveRef.current) return;
    if (Date.now() >= bufferGateDeadlineRef.current) {
      exitBufferGate("deadline");
      return;
    }
    if (isBufferDeepEnough()) {
      exitBufferGate("watermark");
      return;
    }
    // Not yet — roll another bumper in the rotation.
    startGateBumperRef.current();
  }, [exitBufferGate, isBufferDeepEnough]);

  const startGateBumper = useCallback(() => {
    if (!bufferGateActiveRef.current) return;
    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    const bumper = pickGateBumper();
    bumperStartRef.current = Date.now();
    if (!bumper) {
      // No pool at all — nothing to roll; let the video play as-is.
      exitBufferGate("no-pool");
      return;
    }
    const cap = Math.min(bumper.durationMs + 500, 30_500);
    bumperMetaRef.current = {
      bumperId: bumper.id,
      reason: "gate",
      plannedMs: cap,
    };
    // Reuse "cover" transition semantics for the rendering layer —
    // showBumper logic already keys off `transitioning + activeBumper`.
    transitionModeRef.current = "cover";
    tvLog("buffer-gate.bumper.start", {
      key: currentKeyRef.current,
      bumperId: bumper.id,
      category: bumper.category || "unknown",
      plannedMs: cap,
    });
    setActiveBumper(bumper);
    setBumperReady(false);
    setBumperError(false);
    setTransitioning(true);
    // If the bumper's own onEnded doesn't fire in time, the cap
    // drives the next evaluation.  Both paths route through
    // evaluateBufferGate so there's only one decision point.
    bumperTimerRef.current = window.setTimeout(() => {
      evaluateBufferGate();
    }, cap);
  }, [evaluateBufferGate, exitBufferGate, pickGateBumper]);

  startGateBumperRef.current = startGateBumper;
  exitBufferGateRef.current = exitBufferGate;

  const startBufferGate = useCallback(() => {
    clearBufferGateTicker();
    bufferGateActiveRef.current = true;
    bufferGateStartedAtRef.current = Date.now();
    bufferGateDeadlineRef.current = Date.now() + BUFFER_GATE_MAX_WAIT_MS;
    tvLog("buffer-gate.start", {
      key: currentKeyRef.current,
      watermarkSec: BUFFER_GATE_WATERMARK_SEC,
      maxWaitMs: BUFFER_GATE_MAX_WAIT_MS,
    });
    // Interval ticker checks buffer depth independently of the
    // bumper's own lifecycle so we can release as soon as the
    // watermark is reached, even mid-bumper.
    bufferGateTickerRef.current = window.setInterval(() => {
      if (!bufferGateActiveRef.current) {
        clearBufferGateTicker();
        return;
      }
      if (Date.now() >= bufferGateDeadlineRef.current) {
        exitBufferGate("deadline");
        return;
      }
      if (isBufferDeepEnough()) {
        exitBufferGate("watermark");
      }
    }, BUFFER_GATE_CHECK_INTERVAL_MS);
    startGateBumper();
  }, [
    BUFFER_GATE_CHECK_INTERVAL_MS,
    BUFFER_GATE_MAX_WAIT_MS,
    BUFFER_GATE_WATERMARK_SEC,
    clearBufferGateTicker,
    exitBufferGate,
    isBufferDeepEnough,
    startGateBumper,
  ]);

  const playbackChannelId = currentItemMetaRef.current?.channelId ?? null;
  const suppressCurrentStreamPlayback =
    authoritativeAdvancePending && streamMatchesSelectedChannel;
  const activePlayback = resolveSelectedChannelPlaybackState({
    selectedChannelId,
    streamChannelId,
    queue: suppressCurrentStreamPlayback ? [] : streamQuery.data?.queue || [],
    currentItem: suppressCurrentStreamPlayback
      ? null
      : streamQuery.data?.current || null,
    requestedIdx: clientQueueIdx,
    pinnedKey: suppressCurrentStreamPlayback
      ? ""
      : playbackTargetKeyRef.current || currentKeyRef.current,
    fallbackItem: suppressCurrentStreamPlayback
      ? null
      : currentPlaybackItemRef.current,
    fallbackChannelId: suppressCurrentStreamPlayback ? null : playbackChannelId,
  });
  const queueItems = activePlayback.streamMatchesSelectedChannel
    ? streamQuery.data?.queue || []
    : [];
  const playbackCursorIdx =
    activePlayback.activeQueueIdx >= 0
      ? activePlayback.activeQueueIdx
      : clientQueueIdx;
  const activeItem: StreamQueueItem | null = activePlayback.activeItem;
  const activeKey = activePlayback.activeKey;

  const stepStream = useCallback(() => {
    if (videoTimerRef.current) {
      window.clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    if (bumperTimerRef.current) {
      window.clearTimeout(bumperTimerRef.current);
      bumperTimerRef.current = null;
    }
    clearSafetyCap();
    clearCoverTrigger();
    clearLoadCap();
    bumperRetryRef.current = 0;
    currentKeyRef.current = "";
    playbackTargetKeyRef.current = "";
    currentPlaybackItemRef.current = null;
    mediaReadyRef.current = false;
    setClientQueueIdx(0);
    setTransitioning(false);
    setActiveBumper(null);
    setBumperReady(false);
    setBumperError(false);
    setCurrentMediaReady(false);
    setCurrentMediaError(false);
    setCurrentMediaStalled(false);
    setCurrentMediaUseDirect(false);
    setStallIndicatorVisible(false);
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        /* ignore */
      }
    }
    setAuthoritativeAdvancePending(true);
    setLoadingSignal(true);
    void streamQuery.refetch().finally(() => {
      setAuthoritativeAdvancePending(false);
      setLoadingSignal(false);
    });
  }, [
    clearSafetyCap,
    clearCoverTrigger,
    clearLoadCap,
    streamQuery.refetch,
  ]);

  // Next 1-PRELOAD_LOOKAHEAD items (wrapping around the end of the
  // playlist) that we warm in hidden elements below.  Keeping this
  // derived from clientQueueIdx means the "next" slot shifts as the
  // cursor advances and React re-mounts elements cleanly.
  const upcomingItems = useMemo(() => {
    const queue = queueItems;
    if (queue.length === 0) return [] as StreamQueueItem[];
    const seen = new Set<string>();
    const out: StreamQueueItem[] = [];
    for (let i = 1; i <= PRELOAD_LOOKAHEAD; i++) {
      const idx = (playbackCursorIdx + i) % queue.length;
      const item = queue[idx];
      if (!item) continue;
      const key = queueItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [queueItems, playbackCursorIdx]);

  const preloadStartedAtRef = useRef<Map<string, number>>(new Map());
  const markPreloadStart = useCallback((key: string, src: string, kind: string) => {
    if (preloadStartedAtRef.current.has(key)) return;
    preloadStartedAtRef.current.set(key, Date.now());
    tvLog("preload.start", { key, src, kind });
  }, []);
  const markPreloadReady = useCallback((key: string) => {
    if (!preloadReadyRef.current.has(key)) {
      preloadReadyRef.current.add(key);
      const started = preloadStartedAtRef.current.get(key) || 0;
      tvLog("preload.ready", {
        key,
        elapsedMs: started > 0 ? Date.now() - started : null,
      });
    }
  }, []);

  // Reset preload bookkeeping when the channel changes: the server
  // is authoritative about what airs next, so any old hidden-item
  // readiness data must not leak into the new feed.
  useEffect(() => {
    preloadReadyRef.current = new Set();
  }, [selectedChannelId]);

  // Stable handler refs so the main effect's dependencies never
  // include callbacks that change on query refetch.  React still
  // calls the latest version through the ref at timer time.
  const stepStreamRef = useRef(stepStream);
  const clearSafetyCapRef = useRef(clearSafetyCap);
  const clearLoadCapRef = useRef(clearLoadCap);
  const clearCoverTriggerRef = useRef(clearCoverTrigger);
  stepStreamRef.current = stepStream;
  clearSafetyCapRef.current = clearSafetyCap;
  clearLoadCapRef.current = clearLoadCap;
  clearCoverTriggerRef.current = clearCoverTrigger;

  // Stable refs to the buffer-gate entry points.  The gate is kept
  // only as a defensive legacy path while the rest of the player
  // moves back to server-authoritative playback.
  const startBufferGateRef = useRef(startBufferGate);
  const abortBufferGateRef = useRef(exitBufferGate);
  startBufferGateRef.current = startBufferGate;
  abortBufferGateRef.current = exitBufferGate;

  useEffect(() => {
    if (!powerOn || !activeItem || loadingSignal) {
      clearSafetyCapRef.current();
      clearLoadCapRef.current();
      clearCoverTriggerRef.current();
      if (videoTimerRef.current) {
        window.clearTimeout(videoTimerRef.current);
        videoTimerRef.current = null;
      }
      if (bufferGateActiveRef.current) {
        abortBufferGateRef.current("abort");
      }
      return;
    }

    if (activeKey === currentKeyRef.current) return;

    const prevKey = currentKeyRef.current;
    const prevStart = currentItemStartRef.current;
    if (prevKey && prevStart > 0) {
      tvLog("item.end.replaced", {
        key: prevKey,
        elapsedMs: Date.now() - prevStart,
        newKey: activeKey,
      });
    }

    // Tearing down the previous item → cancel any in-flight gate so
    // the new item starts from a clean state.
    if (bufferGateActiveRef.current) {
      abortBufferGateRef.current("abort");
    }

    currentKeyRef.current = activeKey;
    playbackTargetKeyRef.current = activeKey;
    currentPlaybackItemRef.current = activeItem;
    currentItemStartRef.current = Date.now();
    currentItemVisibleStartRef.current = 0;

    const isGifItem = isGif(activeItem.mimeType);
    const storedDur = Math.max(0, Number(activeItem.durationSeconds) || 0);
    const assetDurationSec = Math.max(
      0,
      Number(activeItem.assetDurationSeconds) || storedDur
    );
    const startOffsetSec = Math.max(0, Number(activeItem.offsetSeconds) || 0);
    const remainingItemMs = Math.max(
      1000,
      Math.round(Math.max(0, storedDur - startOffsetSec) * 1000)
    );
    const gifPlannedMs = isGifItem ? remainingItemMs : 0;

    currentItemMetaRef.current = {
      itemId: activeItem.itemId,
      videoId: activeItem.videoId,
      sourceUri: activeItem.sourceUri,
      mimeType: activeItem.mimeType,
      storedDurationSec: storedDur,
      assetDurationSec,
      offsetSeconds: startOffsetSec,
      realDurationSec: 0,
      isGif: isGifItem,
      gifPlannedMs,
      channelId: selectedChannelId,
    };

    tvLog("item.start", {
      key: activeKey,
      channelId: selectedChannelId,
      itemId: activeItem.itemId,
      videoId: activeItem.videoId,
      mimeType: activeItem.mimeType,
      sourceUri: activeItem.sourceUri,
      storedDurationSec: storedDur,
      offsetSeconds: startOffsetSec,
      isGif: isGifItem,
      gifPlannedMs: isGifItem ? gifPlannedMs : null,
      clientQueueIdx: playbackCursorIdx,
      activeSource: activePlayback.source,
    });

    setCurrentMediaReady(false);
    setCurrentMediaError(false);
    setCurrentMediaStalled(false);
    if (stallIndicatorTimerRef.current) {
      window.clearTimeout(stallIndicatorTimerRef.current);
      stallIndicatorTimerRef.current = null;
    }
    setStallIndicatorVisible(false);
    setCurrentMediaUseDirect(false);
    mediaReadyRef.current = false;

    clearSafetyCapRef.current();
    if (videoTimerRef.current) {
      window.clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }

    if (isGifItem) {
      const plannedMs = gifPlannedMs;
      videoTimerRef.current = window.setTimeout(() => {
        const start = currentItemStartRef.current;
        tvLog("item.end.gif", {
          key: activeKey,
          plannedMs,
          elapsedMs: start > 0 ? Date.now() - start : null,
          storedDurationSec: storedDur,
        });
        stepStreamRef.current();
      }, plannedMs);
    }

    // Hard safety cap — if media never reports `ended` within 10 min
    // we skip to the next item so a stuck pipeline can't hang the
    // channel forever.
    safetyCapRef.current = window.setTimeout(() => {
      const start = currentItemStartRef.current;
      tvLog("item.end.safety", {
        key: activeKey,
        elapsedMs: start > 0 ? Date.now() - start : null,
        capMs: HARD_ITEM_CAP_MS,
      });
      stepStreamRef.current();
    }, HARD_ITEM_CAP_MS);

    // Load cap — much tighter.  If the item never reaches "ready"
    // within LOAD_CAP_MS we assume the file is broken / unreachable
    // and step past it so the rest of the playlist keeps moving.
    // Skipping goes through stepStream so the cover bumper still
    // runs (we never cut to silent black) and the queue cursor only
    // advances by one.
    clearLoadCapRef.current();
    loadCapRef.current = window.setTimeout(() => {
      if (mediaReadyRef.current) return;
      const start = currentItemStartRef.current;
      tvLog("item.end.load-cap", {
        key: activeKey,
        elapsedMs: start > 0 ? Date.now() - start : null,
        capMs: LOAD_CAP_MS,
      });
      stepStreamRef.current();
    }, LOAD_CAP_MS);

    return () => {
      clearSafetyCapRef.current();
      clearLoadCapRef.current();
      if (videoTimerRef.current) {
        window.clearTimeout(videoTimerRef.current);
        videoTimerRef.current = null;
      }
      if (bufferGateActiveRef.current) {
        abortBufferGateRef.current("abort");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeKey,
    powerOn,
    loadingSignal,
    selectedChannelId,
    playbackCursorIdx,
    activePlayback.source,
    authoritativeAdvancePending,
  ]);

  // When the server returns a refreshed queue (every ~45 s, or after
  // a channel-editor change), sync our index to wherever the current
  // item moved to.  If the current item is no longer in the playlist
  // — e.g. the user removed it from their channel — stay put and let
  // the natural onEnded advance pick up the new order at the next
  // wrap.  The old behavior was to "drift-snap" to index 0, which
  // yanked the video off screen mid-playback.  That snap is gone.
  useEffect(() => {
    const queue = streamMatchesSelectedChannel ? streamQuery.data?.queue || [] : [];
    if (queue.length === 0) return;
    const playing = playbackTargetKeyRef.current || currentKeyRef.current;
    if (!playing) {
      setClientQueueIdx(0);
      return;
    }
    const matchIdx = queue.findIndex(
      (q) => queueItemKey(q) === playing
    );
    if (matchIdx !== -1 && matchIdx !== clientQueueIdx) {
      tvLog("queue.sync.adjust", {
        fromIdx: clientQueueIdx,
        toIdx: matchIdx,
      });
      setClientQueueIdx(matchIdx);
    }
    // matchIdx === -1 → current item was removed server-side.  We
    // deliberately do nothing: the item keeps playing to completion,
    // then onEnded advances to clientQueueIdx+1 modulo queue.length,
    // which naturally sweeps the cursor back into the new list.
  }, [streamMatchesSelectedChannel, streamQuery.data?.queue, clientQueueIdx]);

  /* --------------------------------------------------------------
   * MTV metadata overlay visibility
   *
   * Video: visible for the viewer-facing first 5 s after the art is
   *        actually on screen, plus the final 5 s before the asset
   *        ends.  This keeps the MTV card reliable even when the
   *        channel is mid-broadcast and the local viewer joins at an
   *        offset.
   * GIF:   GIFs show during local loop 1 and loop 3, measured from
   *        when the viewer actually sees the item.  The server still
   *        controls how long the item stays on air; the client only
   *        decides when the credit card should be visible.
   *
   * The ticker runs at ~5 Hz — enough to catch the 5-second windows
   * without causing meaningful render pressure.  We debounce state
   * changes so the overlay only re-renders when its visibility
   * actually flips.  Suppression while a bumper is on screen is
   * handled in the render path, so this effect only needs to know
   * about the currently-loaded item.
   * ------------------------------------------------------------ */
  useEffect(() => {
    if (mtvOverlayTickerRef.current !== null) {
      window.clearInterval(mtvOverlayTickerRef.current);
      mtvOverlayTickerRef.current = null;
    }

    const bumperOnScreen = activeBumper !== null && bumperReady && screenView === "tv";
    if (!powerOn || !activeItem || bumperOnScreen) {
      setMtvOverlayVisible(false);
      return;
    }

    const evaluate = () => {
      const meta = currentItemMetaRef.current;
      if (!meta) {
        setMtvOverlayVisible((prev) => (prev ? false : prev));
        return;
      }
      let visible = false;
      const visibleStart = currentItemVisibleStartRef.current || currentItemStartRef.current;
      const localElapsedSec =
        visibleStart > 0 ? Math.max(0, (Date.now() - visibleStart) / 1000) : 0;

      if (meta.isGif) {
        const loopSec =
          meta.assetDurationSec > 0
            ? meta.assetDurationSec
            : meta.storedDurationSec > 0
              ? Math.max(1, meta.storedDurationSec / 3)
              : 0;
        if (loopSec > 0) {
          const inLoop1 = localElapsedSec >= 0 && localElapsedSec < loopSec;
          const inLoop3 =
            localElapsedSec >= 2 * loopSec && localElapsedSec < 3 * loopSec;
          visible = inLoop1 || inLoop3;
        } else {
          // No reliable loop duration — fall back to the first 5 s so
          // the overlay still appears briefly instead of never.
          visible = localElapsedSec < 5;
        }
      } else {
        const el = videoRef.current;
        if (el) {
          const dur =
            meta.realDurationSec > 0
              ? meta.realDurationSec
              : Number.isFinite(el.duration) && el.duration > 0
                ? el.duration
                : meta.storedDurationSec;
          const t = Number.isFinite(el.currentTime) ? el.currentTime : 0;
          if (dur > 0) {
            const openingWindow = localElapsedSec < 10;
            const closingWindow = dur > 8 && t >= dur - 8 && t <= dur;
            visible = openingWindow || closingWindow;
          } else {
            visible = localElapsedSec < 10;
          }
        }
      }

      setMtvOverlayVisible((prev) => (prev === visible ? prev : visible));
    };

    evaluate();
    mtvOverlayTickerRef.current = window.setInterval(evaluate, 200);
    return () => {
      if (mtvOverlayTickerRef.current !== null) {
        window.clearInterval(mtvOverlayTickerRef.current);
        mtvOverlayTickerRef.current = null;
      }
    };
    // activeKey captures the current item identity; when it changes,
    // the ticker restarts so windows are evaluated against the new
    // item's duration.
  }, [powerOn, activeItem, activeBumper, bumperReady, screenView, activeKey]);

  const handleCurrentMediaReady = useCallback(() => {
    const wasReady = mediaReadyRef.current;
    setCurrentMediaReady(true);
    mediaReadyRef.current = true;
    setCurrentMediaError(false);
    setCurrentMediaStalled(false);
    if (!wasReady) {
      const start = currentItemStartRef.current;
      tvLog("item.ready", {
        key: currentKeyRef.current,
        timeToReadyMs: start > 0 ? Date.now() - start : null,
        useDirect: currentMediaUseDirect,
      });
    }
    // autoPlay was removed from <MediaVideo> when we introduced the
    // buffer gate so we could hold off play() until the browser has
    // a healthy buffer ahead.  If the gate is still active, it will
    // call play() itself on watermark / deadline.  If the gate is
    // NOT active — e.g. after an error → direct-URL fallback that
    // swapped the `src` mid-playback — we need to kick play()
    // ourselves so the video actually resumes.
    if (!bufferGateActiveRef.current) {
      const el = videoRef.current;
      if (el && el.paused) {
        const p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {
            /* autoplay refused — the TV has a power button, user
               will resume via interaction if the browser blocks it */
          });
        }
      }
    }
  }, [currentMediaUseDirect]);

  const flashSkipNotice = useCallback((message: string) => {
    setSkipNotice(message);
    if (skipNoticeTimerRef.current) {
      window.clearTimeout(skipNoticeTimerRef.current);
    }
    skipNoticeTimerRef.current = window.setTimeout(() => {
      setSkipNotice(null);
      skipNoticeTimerRef.current = null;
    }, 2600);
  }, []);

  useEffect(
    () => () => {
      if (skipNoticeTimerRef.current) {
        window.clearTimeout(skipNoticeTimerRef.current);
        skipNoticeTimerRef.current = null;
      }
    },
    []
  );

  const handleCurrentMediaError = useCallback(() => {
    const directSource = streamQuery.data?.current?.sourceUri || "";
    const start = currentItemStartRef.current;
    if (!currentMediaUseDirect && directSource) {
      tvLog("item.error.fallback", {
        key: currentKeyRef.current,
        elapsedMs: start > 0 ? Date.now() - start : null,
      });
      setCurrentMediaUseDirect(true);
      setCurrentMediaReady(false);
      mediaReadyRef.current = false;
      return;
    }
    setCurrentMediaReady(false);
    mediaReadyRef.current = false;
    setCurrentMediaError(true);

    const failKey = currentKeyRef.current || "unknown";
    const prevFails = failedItemCountsRef.current.get(failKey) ?? 0;
    const nextFails = prevFails + 1;
    failedItemCountsRef.current.set(failKey, nextFails);
    const justBlacklisted =
      nextFails >= 2 && !sessionSkipListRef.current.has(failKey);
    if (justBlacklisted) {
      sessionSkipListRef.current.add(failKey);
    }

    tvLog("item.end.error", {
      key: failKey,
      elapsedMs: start > 0 ? Date.now() - start : null,
      useDirect: currentMediaUseDirect,
      willPlayBumper: false,
      sessionFailCount: nextFails,
      sessionBlacklisted: justBlacklisted,
    });

    const current = streamQuery.data?.current;
    const queueActive =
      (streamQuery.data?.queue || [])[clientQueueIdx] ?? current ?? null;
    if (queueActive) {
      reportItemEnd({
        sessionId: sessionIdRef.current,
        videoId:
          queueActive.kind === "bumper"
            ? null
            : Number(queueActive.videoId) || null,
        bumperId:
          queueActive.kind === "bumper"
            ? Number((queueActive as any).bumperId ?? queueActive.videoId) || null
            : null,
        reason: "error",
      });
    }

    flashSkipNotice(
      justBlacklisted
        ? "Clip broken - removing from rotation"
        : "Skipping broken clip..."
    );

    stepStream();
  }, [
    currentMediaUseDirect,
    streamQuery.data?.current,
    streamQuery.data?.queue,
    clientQueueIdx,
    flashSkipNotice,
    stepStream,
  ]);

  const clearStallIndicatorTimer = useCallback(() => {
    if (stallIndicatorTimerRef.current) {
      window.clearTimeout(stallIndicatorTimerRef.current);
      stallIndicatorTimerRef.current = null;
    }
  }, []);

  const resetStallIndicator = useCallback(() => {
    clearStallIndicatorTimer();
    setStallIndicatorVisible(false);
  }, [clearStallIndicatorTimer]);

  const handleCurrentMediaStalled = useCallback(() => {
    const start = currentItemStartRef.current;
    tvLog("item.stall", {
      key: currentKeyRef.current,
      elapsedMs: start > 0 ? Date.now() - start : null,
    });
    setCurrentMediaStalled(true);
    // Mid-video stall UX: do NOT yank the user to a bumper.  Leave
    // the frozen frame up and give the browser a chance to recover
    // on its own.  If the stall lasts long enough to feel dead, fade
    // in a subtle static overlay as a "still loading" signal — but
    // only for mid-playback stalls (buffer gate and initial cover
    // already have their own visuals).  The LOAD_CAP_MS timer is the
    // real escape hatch for unrecoverable stalls.
    if (
      !bufferGateActiveRef.current &&
      mediaReadyRef.current &&
      !stallIndicatorTimerRef.current
    ) {
      stallIndicatorTimerRef.current = window.setTimeout(() => {
        stallIndicatorTimerRef.current = null;
        setStallIndicatorVisible(true);
      }, STALL_INDICATOR_DELAY_MS);
    }
  }, [STALL_INDICATOR_DELAY_MS]);

  const handleCurrentMediaPlaying = useCallback(() => {
    const wasStalled = !mediaReadyRef.current;
    setCurrentMediaStalled(false);
    mediaReadyRef.current = true;
    clearStallIndicatorTimer();
    setStallIndicatorVisible(false);
    if (wasStalled) {
      const start = currentItemStartRef.current;
      tvLog("item.playing", {
        key: currentKeyRef.current,
        elapsedMs: start > 0 ? Date.now() - start : null,
      });
    }
  }, [clearStallIndicatorTimer]);

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
    onSuccess: (playlist) => {
      setPlaylistNameDraft("");
      setSelectedPlaylistEditorId(playlist.id);
      setPlaylistRenameDraft(playlist.name);
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
    },
  });

  const setPlaylistActiveMutation = useMutation({
    mutationFn: ({ playlistId }: { playlistId: number }) =>
      api.put(`/api/tv/playlists/${playlistId}`, { isActive: true }),
    onSuccess: (_data, vars) => {
      setSelectedPlaylistEditorId(vars.playlistId);
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

  const renamePlaylistMutation = useMutation({
    mutationFn: ({
      playlistId,
      name,
    }: {
      playlistId: number;
      name: string;
    }) => api.put<TVPlaylist>(`/api/tv/playlists/${playlistId}`, { name }),
    onSuccess: (playlist) => {
      setPlaylistRenameDraft(playlist.name);
      setSelectedPlaylistEditorId(playlist.id);
      if (selectedOwnChannelId)
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
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

  /**
   * Add a personal media-library item to one of the user's own TV
   * channels.  Mirrors the token-based addVideoMutation but sends
   * `mediaItemId` so the server establishes the FK link directly.
   * Cascades from DELETE on the library item will then sweep the
   * channel-video + playlist items automatically.
   */
  const addMediaToChannelMutation = useMutation({
    mutationFn: ({
      channelId,
      mediaItemId,
    }: {
      channelId: number;
      mediaItemId: number;
    }) =>
      api.post(`/api/tv/channels/${channelId}/videos`, {
        mediaItemId,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tv", "channel", vars.channelId] });
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

  const detachMediaFromChannelMutation = useMutation({
    mutationFn: ({
      channelId,
      mediaItemId,
    }: {
      channelId: number;
      mediaItemId: number;
    }) => api.delete(`/api/tv/channels/${channelId}/media/${mediaItemId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["media-library", "usage", vars.mediaItemId],
      });
      qc.invalidateQueries({ queryKey: ["tv"] });
      if (selectedOwnChannelId) {
        qc.invalidateQueries({
          queryKey: ["tv", "channel", selectedOwnChannelId],
        });
      }
      if (selectedChannelId) {
        qc.invalidateQueries({
          queryKey: ["tv", "stream", selectedChannelId],
        });
      }
    },
  });

  const uploadBumperMutation = useMutation({
    mutationFn: async ({
      file,
      title,
      durationMs,
      category,
    }: {
      file: File;
      title: string;
      durationMs: number;
      category: "personal" | "community";
    }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("durationMs", String(durationMs));
      form.append("category", category);
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
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "mine"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "community"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "pool"] });
    },
  });

  const deleteBumperMutation = useMutation({
    mutationFn: (bumperId: number) =>
      api.delete(`/api/tv/bumpers/${bumperId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "mine"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "community"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "pool"] });
    },
  });

  const updateBumperMutation = useMutation({
    mutationFn: ({
      bumperId,
      category,
    }: {
      bumperId: number;
      category: "personal" | "community";
    }) =>
      api.patch<TVBumper>(`/api/tv/bumpers/${bumperId}`, {
        category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "mine"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "community"] });
      qc.invalidateQueries({ queryKey: ["tv", "bumpers", "pool"] });
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
      // Cascade FK on tv_channel_videos.media_item_id will have
      // already swept the server; mirror that on the client by
      // nuking every cached TV query so the user sees the new
      // "safe" state instantly.
      qc.invalidateQueries({ queryKey: ["media-library"] });
      qc.invalidateQueries({ queryKey: ["tv"] });
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

  const editablePlaylist = useMemo(() => {
    const detail = detailQuery.data;
    if (!detail) return null;
    if (selectedPlaylistEditorId) {
      const selected = detail.playlists.find(
        (playlist) => playlist.id === selectedPlaylistEditorId
      );
      if (selected) return selected;
    }
    return (
      detail.playlists.find((playlist) => playlist.isActive) ||
      detail.playlists[0] ||
      null
    );
  }, [detailQuery.data, selectedPlaylistEditorId]);

  const playlistVideoMap = useMemo(() => {
    const map = new Map<number, TVVideo>();
    for (const video of detailQuery.data?.videos || [])
      map.set(video.id, video);
    return map;
  }, [detailQuery.data?.videos]);

  const availablePlaylistVideos = useMemo(() => {
    const selectedIds = new Set(playlistDraft.map((item) => item.videoId));
    return (detailQuery.data?.videos || []).filter(
      (video) => !selectedIds.has(video.id)
    );
  }, [detailQuery.data?.videos, playlistDraft]);

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

  const currentItem = activeItem;
  const currentMediaUrl = currentItem
    ? currentMediaUseDirect
      ? currentItem.sourceUri
      : currentItem.cacheUrl
    : null;
  const isOffline =
    streamMatchesSelectedChannel && streamQuery.data?.offline === true;
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
  useEffect(() => {
    if (!powerOn || !currentItem || !currentMediaReady || showBumper) return;
    if (currentItemVisibleStartRef.current <= 0) {
      currentItemVisibleStartRef.current = Date.now();
    }
  }, [powerOn, currentItem, currentMediaReady, showBumper]);
  const streamPendingWithoutPicture =
    !currentItem &&
    (loadingSignal ||
      authoritativeAdvancePending ||
      streamQuery.isLoading ||
      streamQuery.isFetching);
  const showStatic =
    powerOn &&
    screenView === "tv" &&
    !showBumper &&
    (streamPendingWithoutPicture ||
      transitioning ||
      hasNoContent ||
      (!!currentItem && (!currentMediaReady || currentMediaError)));
  const currentChannel = channelsQuery.data?.find(
    (c) => c.id === selectedChannelId
  );
  const channels = channelsQuery.data || [];
  const channelIndex = channels.findIndex((c) => c.id === selectedChannelId);
  // Stable dial number shown on the physical TV display and in the
  // OSD.  Prefers the server-assigned dialNumber (root=1, yoeshi=2,
  // WTF TV=3, platform=69, user channels 4+) and falls back to the
  // list position for pre-backfill rows.
  const currentDialNumber =
    typeof currentChannel?.dialNumber === "number" &&
    (currentChannel.dialNumber || 0) > 0
      ? currentChannel.dialNumber
      : channelIndex >= 0
        ? channelIndex + 1
        : null;
  const dialDisplay =
    currentDialNumber != null
      ? String(currentDialNumber).padStart(2, "0")
      : "--";

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
        if (bufferGateActiveRef.current) {
          abortBufferGateRef.current("abort");
        }
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
                Playing:{" "}
                {currentItem.objktUrl ? (
                  <a
                    href={currentItem.objktUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#88ffaa" }}
                  >
                    {currentItem.title}
                  </a>
                ) : (
                  currentItem.title
                )}{" "}
                [{currentItem.kind.toUpperCase()}]
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
              {channels.map((ch, i) => {
                // Prefer the stable server-assigned dial number; fall
                // back to list position for very old rows the boot
                // backfill hasn't touched yet.
                const dial =
                  typeof ch.dialNumber === "number" && ch.dialNumber > 0
                    ? ch.dialNumber
                    : i + 1;
                return (
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
                        {String(dial).padStart(2, "0")}
                      </span>
                      <span>{ch.title}</span>
                    </MenuRow>
                    <MenuLabel>
                      by {ch.ownerDisplayName || ch.ownerUsername || "unknown"}
                    </MenuLabel>
                  </MenuItem>
                );
              })}
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
              Channel: {currentChannel?.title || "None"} (CH {dialDisplay})
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
                      videosPerBumper:
                        typeof ch.videosPerBumper === "number"
                          ? ch.videosPerBumper
                          : 4,
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
                  PLAYLIST EDITOR
                  <MenuLabel> (add, remove, reorder)</MenuLabel>
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
                  $selected={editablePlaylist?.id === pl.id}
                  onClick={() => setSelectedPlaylistEditorId(pl.id)}
                >
                  <MenuRow>
                    <span style={{ flex: 1 }}>{pl.name}</span>
                    {pl.isActive && (
                      <MenuLabel style={{ color: "#ccff66" }}>
                        ACTIVE
                      </MenuLabel>
                    )}
                    {editablePlaylist?.id === pl.id && (
                      <MenuLabel style={{ color: "#88ffaa" }}>
                        EDITING
                      </MenuLabel>
                    )}
                  </MenuRow>
                </MenuItem>
              ))}
              {(detailQuery.data?.playlists || []).length === 0 && (
                <MenuItem $disabled>No playlists</MenuItem>
              )}
            </MenuScrollList>
            {editablePlaylist && (
              <>
                <MenuLabel style={{ marginTop: 8 }}>
                  Editing: {editablePlaylist.name}
                </MenuLabel>
                <MenuRow style={{ marginTop: 6 }}>
                  <MenuInput
                    value={playlistRenameDraft}
                    onChange={(e) => setPlaylistRenameDraft(e.target.value)}
                    placeholder="Rename selected playlist..."
                  />
                  <MenuBtn
                    $accent
                    disabled={
                      !playlistRenameDraft.trim() ||
                      playlistRenameDraft.trim() === editablePlaylist.name ||
                      renamePlaylistMutation.isPending
                    }
                    onClick={() =>
                      renamePlaylistMutation.mutate({
                        playlistId: editablePlaylist.id,
                        name: playlistRenameDraft.trim(),
                      })
                    }
                  >
                    SAVE NAME
                  </MenuBtn>
                </MenuRow>
                <MenuRow style={{ marginTop: 6 }}>
                  <MenuBtn
                    disabled={editablePlaylist.isActive}
                    onClick={() =>
                      setPlaylistActiveMutation.mutate({
                        playlistId: editablePlaylist.id,
                      })
                    }
                  >
                    {editablePlaylist.isActive ? "ON AIR" : "AIR THIS"}
                  </MenuBtn>
                  <MenuBtn
                    $accent
                    onClick={() => setScreenView("playlist-order")}
                  >
                    EDIT CONTENTS
                  </MenuBtn>
                </MenuRow>
              </>
            )}
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
              Pick a playlist to edit. "AIR THIS" changes the live fallback loop;
              "EDIT CONTENTS" changes that playlist without forcing it on air.
            </MenuLabel>
          </MenuOverlay>
        );

      case "playlist-order":
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>PLAYLIST EDITOR</span>
              {renderBackBtn("PLAYLISTS")}
            </MenuTitle>
            <MenuLabel>
              {editablePlaylist
                ? `Editing "${editablePlaylist.name}". Reorder clips, remove them, or add any channel media below.`
                : "Pick a playlist first."}
            </MenuLabel>
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
                      <MenuBtn
                        onClick={() =>
                          setPlaylistDraft((current) =>
                            current.filter((_, currentIdx) => currentIdx !== idx)
                          )
                        }
                      >
                        REM
                      </MenuBtn>
                    </MenuRow>
                  </MenuItem>
                );
              })}
              {playlistDraft.length === 0 && (
                <MenuItem $disabled>
                  No videos in this playlist yet
                </MenuItem>
              )}
            </MenuScrollList>
            <MenuDivider />
            <MenuLabel>
              AVAILABLE CHANNEL MEDIA ({availablePlaylistVideos.length})
            </MenuLabel>
            <MenuScrollList>
              {availablePlaylistVideos.map((video) => (
                <MenuItem key={`available-${video.id}`}>
                  <MenuRow>
                    <span style={{ flex: 1, fontSize: 11 }}>
                      {video.title || `Video #${video.id}`}
                    </span>
                    <MenuLabel>{video.mimeType}</MenuLabel>
                    <MenuBtn
                      $accent
                      onClick={() =>
                        setPlaylistDraft((current) => [
                          ...current,
                          {
                            videoId: video.id,
                            durationSeconds: Math.max(
                              1,
                              Math.floor(
                                Number(video.metadata?.wtfTvDurationSeconds) ||
                                  30
                              )
                            ),
                          },
                        ])
                      }
                    >
                      ADD
                    </MenuBtn>
                  </MenuRow>
                </MenuItem>
              ))}
              {availablePlaylistVideos.length === 0 && (
                <MenuItem $disabled>
                  Every channel video is already in this playlist
                </MenuItem>
              )}
            </MenuScrollList>
            <div style={{ marginTop: 8 }}>
              <MenuBtn
                $accent
                disabled={!editablePlaylist || savePlaylistMutation.isPending}
                onClick={() =>
                  editablePlaylist &&
                  savePlaylistMutation.mutate({
                    playlistId: editablePlaylist.id,
                    items: playlistDraft,
                  })
                }
              >
                SAVE PLAYLIST CONTENTS
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

      case "bumpers": {
        const allMine = myBumpersQuery.data || [];
        const myPersonal = allMine.filter(
          (b) => (b.category || "personal") === "personal"
        );
        const myCommunity = allMine.filter(
          (b) => (b.category || "personal") === "community"
        );
        const personalMax = 20;
        const communityMax = 3;
        const currentMax =
          bumperCategoryDraft === "community" ? communityMax : personalMax;
        const currentCount =
          bumperCategoryDraft === "community"
            ? myCommunity.length
            : myPersonal.length;
        const atLimit = currentCount >= currentMax;

        return (
          <MenuOverlay>
            <MenuTitle>
              <span>BUMPERS</span>
              {renderBackBtn("CREATOR")}
            </MenuTitle>
            <MenuLabel>
              Upload short clips (max 30 s) that play between playlist items.
              Personal bumpers only play on your own channels; community bumpers
              can be pulled into anyone's channel rotation. You can pull a
              shared bumper back out of the public pool without deleting the
              clip.
            </MenuLabel>
            <MenuDivider />

            <MenuLabel>
              MY PERSONAL BUMPERS ({myPersonal.length}/{personalMax})
            </MenuLabel>
            <MenuScrollList>
              {myPersonal.map((b) => (
                <MenuItem key={b.id}>
                  <MenuRow>
                    <span style={{ flex: 1 }}>{b.title}</span>
                    <MenuLabel>
                      {(b.durationMs / 1000).toFixed(1)}s · {(b.fileSize / 1024).toFixed(0)}KB
                    </MenuLabel>
                    <MenuBtn
                      $accent
                      disabled={updateBumperMutation.isPending}
                      onClick={() =>
                        updateBumperMutation.mutate({
                          bumperId: b.id,
                          category: "community",
                        })
                      }
                    >
                      SHARE
                    </MenuBtn>
                    <MenuBtn
                      disabled={deleteBumperMutation.isPending}
                      onClick={() => deleteBumperMutation.mutate(b.id)}
                    >
                      DELETE
                    </MenuBtn>
                  </MenuRow>
                </MenuItem>
              ))}
              {myPersonal.length === 0 && (
                <MenuItem $disabled>No personal bumpers uploaded yet</MenuItem>
              )}
            </MenuScrollList>

            <MenuDivider />
            <MenuLabel>
              MY COMMUNITY BUMPERS ({myCommunity.length}/{communityMax})
            </MenuLabel>
            <MenuScrollList>
              {myCommunity.map((b) => (
                <MenuItem key={b.id}>
                  <MenuRow>
                    <span style={{ flex: 1 }}>{b.title}</span>
                    <MenuLabel>
                      {(b.durationMs / 1000).toFixed(1)}s · {(b.fileSize / 1024).toFixed(0)}KB
                    </MenuLabel>
                    <MenuBtn
                      $accent
                      disabled={updateBumperMutation.isPending}
                      onClick={() =>
                        updateBumperMutation.mutate({
                          bumperId: b.id,
                          category: "personal",
                        })
                      }
                    >
                      PULL
                    </MenuBtn>
                    <MenuBtn
                      disabled={deleteBumperMutation.isPending}
                      onClick={() => deleteBumperMutation.mutate(b.id)}
                    >
                      DELETE
                    </MenuBtn>
                  </MenuRow>
                </MenuItem>
              ))}
              {myCommunity.length === 0 && (
                <MenuItem $disabled>
                  No community bumpers uploaded yet
                </MenuItem>
              )}
            </MenuScrollList>

            <MenuDivider />
            <MenuLabel>UPLOAD NEW BUMPER</MenuLabel>
            <MenuRow style={{ marginTop: 6, gap: "clamp(6px, 1vw, 10px)" }}>
              <MenuBtn
                $accent={bumperCategoryDraft === "personal"}
                onClick={() => setBumperCategoryDraft("personal")}
              >
                PERSONAL ({myPersonal.length}/{personalMax})
              </MenuBtn>
              <MenuBtn
                $accent={bumperCategoryDraft === "community"}
                onClick={() => setBumperCategoryDraft("community")}
              >
                COMMUNITY ({myCommunity.length}/{communityMax})
              </MenuBtn>
            </MenuRow>
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
                accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska,image/gif,image/webp,image/apng,image/png,image/jpeg"
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
                disabled={uploadBumperMutation.isPending || atLimit}
                onClick={async () => {
                  const file = bumperFileRef.current?.files?.[0];
                  if (!file) return;
                  if (file.size > 80 * 1024 * 1024) {
                    alert("File too large. Max 80MB.");
                    return;
                  }
                  const kindIsStill = /^image\/(png|jpeg|webp|apng)$/i.test(
                    file.type
                  );
                  const kindIsGif = file.type === "image/gif";
                  const durationMs = await new Promise<number>((resolve) => {
                    if (kindIsGif) {
                      resolve(3000);
                      return;
                    }
                    if (kindIsStill) {
                      resolve(5000);
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
                    alert("Could not read media duration.");
                    return;
                  }
                  if (durationMs > 30_000) {
                    alert("Clip too long. Max 30 seconds.");
                    return;
                  }
                  uploadBumperMutation.mutate({
                    file,
                    title:
                      bumperTitleDraft.trim() ||
                      file.name.replace(/\.[^.]+$/, ""),
                    durationMs,
                    category: bumperCategoryDraft,
                  });
                }}
              >
                {uploadBumperMutation.isPending
                  ? "UPLOADING..."
                  : atLimit
                    ? "LIMIT REACHED"
                    : `UPLOAD ${bumperCategoryDraft.toUpperCase()}`}
              </MenuBtn>
            </MenuRow>
            {uploadBumperMutation.isError && (
              <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
                {(uploadBumperMutation.error as Error)?.message ||
                  "Upload failed"}
              </MenuLabel>
            )}
            {updateBumperMutation.isError && (
              <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
                {(updateBumperMutation.error as Error)?.message ||
                  "Failed to update bumper visibility"}
              </MenuLabel>
            )}

            <MenuDivider />
            <MenuLabel>
              COMMUNITY BUMPER LIBRARY (
              {(communityBumpersQuery.data || []).length})
            </MenuLabel>
            <MenuScrollList>
              {(communityBumpersQuery.data || []).map((b) => (
                <MenuItem key={`community-${b.id}`}>
                  <MenuRow>
                    <span style={{ flex: 1 }}>{b.title}</span>
                    <MenuLabel>
                      {(b.durationMs / 1000).toFixed(1)}s
                    </MenuLabel>
                    <MenuLabel style={{ opacity: 0.8 }}>
                      by {b.credit || "anon"}
                    </MenuLabel>
                  </MenuRow>
                </MenuItem>
              ))}
              {communityBumpersQuery.isLoading && (
                <MenuItem $disabled>Loading community bumpers…</MenuItem>
              )}
              {!communityBumpersQuery.isLoading &&
                (communityBumpersQuery.data || []).length === 0 && (
                  <MenuItem $disabled>No community bumpers yet</MenuItem>
                )}
            </MenuScrollList>
          </MenuOverlay>
        );
      }

      case "my-media": {
        const ownChannels = myChannelsQuery.data || [];
        const deleteTarget = mediaDeleteTargetId
          ? (myMediaQuery.data || []).find((m) => m.id === mediaDeleteTargetId)
          : null;
        const usageRows = mediaUsageQuery.data?.channels || [];
        const usageChannelCount = mediaUsageQuery.data?.summary.channels ?? 0;
        const usagePlaylistCount = mediaUsageQuery.data?.summary.playlists ?? 0;
        return (
          <MenuOverlay>
            <MenuTitle>
              <span>MY MEDIA</span>
              {renderBackBtn("MENU")}
            </MenuTitle>
            <MenuLabel>
              Your video library from tokens and uploads. ADD puts an item on a
              channel, CHANNELS shows where it is currently attached, and DELETE
              removes it from your library everywhere.
            </MenuLabel>
            <MenuDivider />
            <MenuScrollList>
              {(myMediaQuery.data || []).map((item: TVMediaItem) => {
                const isAddOpen = mediaAddTargetId === item.id;
                const isManageOpen = mediaManageTargetId === item.id;
                const canAdd = ownChannels.length > 0 && item.status === "ready";
                return (
                  <MenuItem key={item.id}>
                    <MenuRow>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.title}
                      </span>
                      <MenuLabel>
                        {item.sourceType} · {item.mimeType} · {item.status}
                      </MenuLabel>
                      <MenuBtn
                        disabled={!canAdd || addMediaToChannelMutation.isPending}
                        onClick={() => {
                          if (!canAdd) return;
                          setMediaManageTargetId(null);
                          setMediaDeleteTargetId(null);
                          setMediaAddTargetId(isAddOpen ? null : item.id);
                        }}
                        title={
                          !canAdd
                            ? ownChannels.length === 0
                              ? "You do not own any TV channels yet"
                              : `Media is ${item.status}, wait for it to finish processing`
                            : "Add to one of your channels"
                        }
                      >
                        {isAddOpen ? "CANCEL" : "ADD"}
                      </MenuBtn>
                      <MenuBtn
                        disabled={detachMediaFromChannelMutation.isPending}
                        onClick={() => {
                          setMediaDeleteTargetId(null);
                          setMediaManageTargetId(isManageOpen ? null : item.id);
                        }}
                      >
                        {isManageOpen ? "DONE" : "CHANNELS"}
                      </MenuBtn>
                      <MenuBtn
                        disabled={deleteMediaMutation.isPending}
                        onClick={() => {
                          setMediaManageTargetId(null);
                          setMediaDeleteTargetId(item.id);
                        }}
                      >
                        DELETE
                      </MenuBtn>
                    </MenuRow>
                    {item.durationSeconds != null && (
                      <MenuLabel>{item.durationSeconds}s</MenuLabel>
                    )}
                    {isAddOpen && (
                      <div
                        style={{
                          marginTop: 6,
                          paddingTop: 6,
                          borderTop: "1px dashed rgba(136,255,170,0.2)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <MenuLabel>Pick a channel:</MenuLabel>
                        {ownChannels.map((ch) => {
                          const dial =
                            typeof ch.dialNumber === "number" && ch.dialNumber > 0
                              ? String(ch.dialNumber).padStart(2, "0")
                              : "--";
                          return (
                            <MenuBtn
                              key={ch.id}
                              disabled={addMediaToChannelMutation.isPending}
                              onClick={() =>
                                addMediaToChannelMutation.mutate(
                                  { channelId: ch.id, mediaItemId: item.id },
                                  {
                                    onSuccess: () => {
                                      setMediaAddTargetId(null);
                                    },
                                  }
                                )
                              }
                            >
                              CH {dial} · {ch.title}
                            </MenuBtn>
                          );
                        })}
                        {addMediaToChannelMutation.isError && (
                          <MenuLabel style={{ color: "#ff6655" }}>
                            {(addMediaToChannelMutation.error as Error)?.message ||
                              "Failed to add"}
                          </MenuLabel>
                        )}
                      </div>
                    )}
                    {isManageOpen && (
                      <div
                        style={{
                          marginTop: 6,
                          paddingTop: 6,
                          borderTop: "1px dashed rgba(136,255,170,0.2)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <MenuLabel>
                          Removing from a channel also removes it from that
                          channel&apos;s playlists.
                        </MenuLabel>
                        {mediaManageUsageQuery.isLoading ? (
                          <MenuLabel>Checking channel attachments…</MenuLabel>
                        ) : (mediaManageUsageQuery.data?.channels || []).length === 0 ? (
                          <MenuLabel>Not attached to any channels yet.</MenuLabel>
                        ) : (
                          (mediaManageUsageQuery.data?.channels || []).map((row) => (
                            <MenuRow key={row.channel.id}>
                              <span style={{ flex: 1, fontSize: 11 }}>
                                CH{" "}
                                {row.channel.dialNumber != null
                                  ? String(row.channel.dialNumber).padStart(2, "0")
                                  : "--"}{" "}
                                {row.channel.title}
                                {row.playlists.length > 0
                                  ? ` (${row.playlists
                                      .map((playlist) => playlist.name)
                                      .join(", ")})`
                                  : ""}
                              </span>
                              <MenuBtn
                                disabled={detachMediaFromChannelMutation.isPending}
                                onClick={() =>
                                  detachMediaFromChannelMutation.mutate({
                                    channelId: row.channel.id,
                                    mediaItemId: item.id,
                                  })
                                }
                              >
                                REMOVE
                              </MenuBtn>
                            </MenuRow>
                          ))
                        )}
                        {detachMediaFromChannelMutation.isError && (
                          <MenuLabel style={{ color: "#ff6655" }}>
                            {(detachMediaFromChannelMutation.error as Error)?.message ||
                              "Failed to remove from channel"}
                          </MenuLabel>
                        )}
                      </div>
                    )}
                  </MenuItem>
                );
              })}
              {(myMediaQuery.data || []).length === 0 && (
                <MenuItem $disabled>
                  {myMediaQuery.isLoading ? "Loading..." : "No video media yet. Import tokens via My Videos in Start Menu."}
                </MenuItem>
              )}
            </MenuScrollList>

            {deleteTarget && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  border: "1px solid rgba(255,102,85,0.4)",
                  borderRadius: 3,
                  background: "rgba(40,8,8,0.6)",
                }}
              >
                <MenuLabel style={{ color: "#ffaa88" }}>
                  DELETE &quot;{deleteTarget.title}&quot;?
                </MenuLabel>
                {mediaUsageQuery.isLoading ? (
                  <MenuLabel>Checking channels...</MenuLabel>
                ) : usageChannelCount === 0 ? (
                  <MenuLabel>
                    Not in any channel playlists. Safe to delete.
                  </MenuLabel>
                ) : (
                  <>
                    <MenuLabel>
                      This will remove the file from {usageChannelCount}{" "}
                      channel{usageChannelCount === 1 ? "" : "s"} and{" "}
                      {usagePlaylistCount} playlist
                      {usagePlaylistCount === 1 ? "" : "s"}:
                    </MenuLabel>
                    {usageRows.map((row) => (
                      <MenuLabel key={row.channel.id} style={{ color: "#ffcc99" }}>
                        • CH {row.channel.dialNumber != null
                          ? String(row.channel.dialNumber).padStart(2, "0")
                          : "--"}{" "}
                        {row.channel.title}
                        {row.playlists.length > 0
                          ? ` (${row.playlists.map((p) => p.name).join(", ")})`
                          : ""}
                      </MenuLabel>
                    ))}
                  </>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <MenuBtn
                    $accent
                    disabled={deleteMediaMutation.isPending}
                    onClick={() =>
                      deleteMediaMutation.mutate(deleteTarget.id, {
                        onSuccess: () => {
                          setMediaDeleteTargetId(null);
                          if (selectedChannelId)
                            qc.invalidateQueries({
                              queryKey: ["tv", "stream", selectedChannelId],
                            });
                          if (selectedOwnChannelId)
                            qc.invalidateQueries({
                              queryKey: ["tv", "channel", selectedOwnChannelId],
                            });
                        },
                      })
                    }
                  >
                    {deleteMediaMutation.isPending
                      ? "DELETING..."
                      : "CONFIRM DELETE"}
                  </MenuBtn>
                  <MenuBtn onClick={() => setMediaDeleteTargetId(null)}>
                    CANCEL
                  </MenuBtn>
                </div>
                {deleteMediaMutation.isError && (
                  <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
                    {(deleteMediaMutation.error as Error)?.message ||
                      "Failed to delete"}
                  </MenuLabel>
                )}
              </div>
            )}
          </MenuOverlay>
        );
      }

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
                <div style={{ marginBottom: 6 }}>
                  <MenuLabel>
                    BUMPER CADENCE:{" "}
                    {channelEditDraft.videosPerBumper === 0
                      ? "OFF (no bumpers)"
                      : `1 bumper every ${channelEditDraft.videosPerBumper} videos`}
                  </MenuLabel>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={channelEditDraft.videosPerBumper}
                    onChange={(e) =>
                      setChannelEditDraft((d) => ({
                        ...d,
                        videosPerBumper: Math.max(
                          0,
                          Math.min(20, Number(e.target.value) || 0)
                        ),
                      }))
                    }
                    style={{ width: "100%", accentColor: "#44cc66", marginTop: 4 }}
                  />
                  <MenuLabel style={{ color: "#55aa77", fontSize: 10 }}>
                    Affects all viewers of this channel. Community bumpers
                    (uploaded by contestants) always play alongside the
                    channel owner&apos;s bumpers.
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
                          videosPerBumper: channelEditDraft.videosPerBumper,
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
                    currentMediaUrl && (
                      <MediaVideo
                        ref={videoRef}
                        src={currentMediaUrl}
                        // Always mounted while a non-GIF item is
                        // active — even when a bumper is on screen
                        // covering us — so `preload="auto"` keeps
                        // filling the browser buffer in the
                        // background.  Opacity hides the element
                        // visually during the initial buffer gate
                        // or any bumper rotation without tearing
                        // down the media element (which would
                        // drop the buffer).
                        style={{
                          opacity: !showBumper && currentMediaReady ? 1 : 0,
                          pointerEvents: showBumper ? "none" : undefined,
                        }}
                        preload="auto"
                        playsInline
                        muted={false}
                        controls={false}
                        onLoadStart={() => {
                          tvLog("item.fetch.start", {
                            key: currentKeyRef.current,
                            src: currentMediaUrl,
                            useDirect: currentMediaUseDirect,
                          });
                        }}
                        onProgress={(e) => {
                          const el = e.currentTarget;
                          if (!el) return;
                          let bufferedEnd = 0;
                          try {
                            if (el.buffered.length > 0) {
                              bufferedEnd = el.buffered.end(el.buffered.length - 1);
                            }
                          } catch {
                            /* ignore SecurityError on cross-origin */
                          }
                          const dur =
                            Number.isFinite(el.duration) && el.duration > 0
                              ? el.duration
                              : 0;
                          tvLog("item.buffer.progress", {
                            key: currentKeyRef.current,
                            bufferedSec: Math.round(bufferedEnd * 100) / 100,
                            durationSec: dur || null,
                            readyState: el.readyState,
                          });
                        }}
                        onLoadedData={handleCurrentMediaReady}
                        onCanPlay={handleCurrentMediaReady}
                        onPlaying={handleCurrentMediaPlaying}
                        onWaiting={handleCurrentMediaStalled}
                        onStalled={handleCurrentMediaStalled}
                        onError={handleCurrentMediaError}
                        onEnded={(e) => {
                          const el = e.currentTarget;
                          const start = currentItemStartRef.current;
                          const meta = currentItemMetaRef.current;
                          const elapsed = start > 0 ? Date.now() - start : null;
                          const playedSec = Number.isFinite(el.currentTime)
                            ? el.currentTime
                            : null;
                          const realDur =
                            meta?.realDurationSec && meta.realDurationSec > 0
                              ? meta.realDurationSec
                              : Number.isFinite(el.duration)
                                ? el.duration
                                : null;
                          const prematureSec =
                            realDur && playedSec !== null
                              ? Math.max(0, realDur - playedSec)
                              : null;
                          tvLog("item.end.video", {
                            key: currentKeyRef.current,
                            elapsedMs: elapsed,
                            playedSec,
                            realDurationSec: realDur,
                            storedDurationSec: meta?.storedDurationSec ?? null,
                            prematureSec,
                            premature:
                              prematureSec !== null && prematureSec > 1,
                          });
                          if (currentItem && currentItem.kind !== "bumper") {
                            reportItemEnd({
                              sessionId: sessionIdRef.current,
                              videoId: Number(currentItem.videoId) || null,
                              bumperId: null,
                              reason:
                                prematureSec !== null && prematureSec > 1
                                  ? "skipped"
                                  : "ended",
                            });
                          }
                          stepStream();
                        }}
                        onLoadedMetadata={(e) => {
                          const el = e.currentTarget;
                          el.volume = volume;
                          const realDur = el.duration;
                          const desiredOffset = Math.max(
                            0,
                            Number(currentItem.offsetSeconds) || 0
                          );
                          try {
                            if (desiredOffset > 0.1 && Number.isFinite(realDur) && realDur > 0) {
                              el.currentTime = Math.min(
                                desiredOffset,
                                Math.max(0, realDur - 0.25)
                              );
                            } else if (el.currentTime > 0.1) {
                              el.currentTime = 0;
                            }
                          } catch {
                            /* ignore */
                          }
                          if (Number.isFinite(realDur) && realDur > 0) {
                            const meta = currentItemMetaRef.current;
                            if (meta) meta.realDurationSec = realDur;
                            const storedDur = currentItem.durationSeconds;
                            tvLog("item.metadata", {
                              key: currentKeyRef.current,
                              realDurationSec: realDur,
                              storedDurationSec: storedDur,
                              delta: realDur - storedDur,
                            });
                            if (Math.abs(realDur - storedDur) > 2 && currentItem.itemId > 0) {
                              const corrected = Math.max(1, Math.round(realDur));
                              api
                                .patch(
                                  `/api/tv/playlist-items/${currentItem.itemId}/duration`,
                                  { durationSeconds: corrected }
                                )
                                .catch(() => {});
                            }
                          }
                        }}
                      />
                    )}

                  {powerOn &&
                    screenView === "tv" &&
                    currentItem &&
                    !showBumper &&
                    !hasNoContent &&
                    (currentItem.title ||
                      currentItem.creatorName ||
                      currentItem.creatorAddress ||
                      currentItem.collectionName ||
                      currentItem.mintedAtIso ||
                      currentItem.addedByUsername) && (() => {
                        const minted = currentItem.mintedAtIso;
                        let mintedLabel = "";
                        if (minted) {
                          const d = new Date(minted);
                          if (!Number.isNaN(d.getTime())) {
                            mintedLabel = d.toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            });
                          }
                        }
                        const sublineParts = [
                          currentItem.collectionName || "",
                          mintedLabel ? `MINTED ${mintedLabel}` : "",
                          currentItem.addedByUsername
                            ? `ON CHANNEL BY @${currentItem.addedByUsername}`
                            : "",
                        ].filter(Boolean);
                        const overlayBody = (
                          <>
                            <MtvEyebrow>
                              ♪ NOW PLAYING · WTF TV
                            </MtvEyebrow>
                            <MtvTitle>
                              {currentItem.title || "Untitled"}
                            </MtvTitle>
                            {(currentItem.creatorName || currentItem.creatorAddress) && (
                              <MtvCreator>
                                CREATOR:{" "}
                                {currentItem.creatorName ||
                                  shortAddress(currentItem.creatorAddress)}
                              </MtvCreator>
                            )}
                            {currentItem.creatorAddress && (
                              <MtvWallet title={currentItem.creatorAddress}>
                                Creator wallet {shortAddress(currentItem.creatorAddress)}
                              </MtvWallet>
                            )}
                            {sublineParts.length > 0 && (
                              <MtvSubline>
                                {sublineParts.join("  ·  ")}
                              </MtvSubline>
                            )}
                          </>
                        );
                        if (currentItem.objktUrl) {
                          return (
                            <MtvOverlayLink
                              $visible={mtvOverlayVisible}
                              data-testid="mtv-overlay"
                              href={currentItem.objktUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {overlayBody}
                            </MtvOverlayLink>
                          );
                        }
                        return (
                          <MtvOverlay
                            $visible={mtvOverlayVisible}
                            data-testid="mtv-overlay"
                          >
                            {overlayBody}
                          </MtvOverlay>
                        );
                      })()}

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

                  {showStatic && screenView === "tv" && <TVStatic audio={volume > 0.01} />}

                  {/* Subtle mid-video stall indicator.  Fades in after
                      STALL_INDICATOR_DELAY_MS while the already-playing
                      video is rebuffering.  No audio hiss here — the
                      video's own audio is already silent during a stall
                      and layering pink noise on top would be jarring.
                      Pointer-events: none so it never blocks controls. */}
                  {powerOn &&
                    screenView === "tv" &&
                    stallIndicatorVisible &&
                    !showStatic &&
                    !showBumper && (
                      <StallStaticOverlay aria-hidden>
                        <TVStatic audio={false} />
                      </StallStaticOverlay>
                    )}

                  {screenView === "tv" && skipNotice && (
                    <SkipNoticeBanner role="status" aria-live="polite">
                      {skipNotice}
                    </SkipNoticeBanner>
                  )}

                  {/* Hidden preloader — warms browser+server caches so
                      the next 1-2 items can be swapped in with < 1 s
                      of gap.  Mounted only when the TV is on and we
                      actually have upcoming content. */}
                  {powerOn &&
                    screenView === "tv" &&
                    upcomingItems.length > 0 && (
                      <PreloadSink aria-hidden>
                        {upcomingItems.map((it) => {
                          const key = queueItemKey(it);
                          const src = it.cacheUrl || it.sourceUri;
                          if (isGif(it.mimeType)) {
                            return (
                              <img
                                key={key}
                                src={src}
                                alt=""
                                ref={() => markPreloadStart(key, src, "gif")}
                                onLoad={() => markPreloadReady(key)}
                                onError={() => markPreloadReady(key)}
                              />
                            );
                          }
                          return (
                            <video
                              key={key}
                              src={src}
                              preload="auto"
                              muted
                              playsInline
                              ref={(el) => {
                                if (el) markPreloadStart(key, src, "video");
                              }}
                              onLoadStart={() => markPreloadStart(key, src, "video")}
                              onLoadedData={() => markPreloadReady(key)}
                              onCanPlay={() => markPreloadReady(key)}
                              onCanPlayThrough={() => markPreloadReady(key)}
                              onError={(e) => {
                                tvLog("preload.error", {
                                  key,
                                  src,
                                  code: e.currentTarget.error?.code ?? null,
                                });
                                markPreloadReady(key);
                              }}
                            />
                          );
                        })}
                      </PreloadSink>
                    )}

                  {powerOn && screenView === "tv" && (
                    <OSD>
                      {showBumper
                        ? `▶ ${activeBumper?.credit || "bumper"}`
                        : hasNoContent
                          ? `CH ${dialDisplay} · ${isOffline ? (streamQuery.data?.message || "NO SIGNAL") : "NO SIGNAL"}`
                          : `CH ${dialDisplay} · ${(currentChannel?.title || "No signal").slice(0, 40)}${streamQuery.data?.scheduleLabel ? ` · ${streamQuery.data.scheduleLabel}` : ""}`}
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
                <ChannelDisplay>{dialDisplay}</ChannelDisplay>
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
