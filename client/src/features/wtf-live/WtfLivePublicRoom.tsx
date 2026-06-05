import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Camera, ChevronDown, ChevronRight, Copy, Gauge, Image as ImageIcon, LogOut, Maximize2, MessageSquare, Mic, MonitorUp, Move, Paperclip, Radio, Send, Square, Users, Wifi, WifiOff, X } from "lucide-react";
import styled from "styled-components";
import { Button, Hourglass, TextField } from "react95";
import { api } from "../../lib/api";

type PublicRoom = {
  id: string;
  title: string;
  kind: "room";
  description?: string;
  source?: "system" | "user";
  ownerUserId?: number | null;
  isPublic?: boolean;
};

type PublicRoomResponse = {
  room: PublicRoom;
  joinMode: "guest_room_only";
  roomPath: string;
  capabilities?: {
    audio?: boolean;
    camera?: boolean;
    screen?: boolean;
    media?: boolean;
    transport?: string;
  };
};

type RoomMessage = {
  uri: string;
  text: string;
  createdAt: string | null;
  author?: { handle?: string; displayName?: string | null };
};

type ActiveVideoSource = "camera" | "screen" | null;

type LiveMediaState = {
  mic: boolean;
  audioOpen: boolean;
  camera: boolean;
  screen: boolean;
  activeVideo: ActiveVideoSource;
  avatarUrl: string | null;
};

type LivePeer = {
  peerId: string;
  guestName: string;
  mediaState: LiveMediaState;
  stream: MediaStream;
  connected: boolean;
};

type PeerHealth = "good" | "fair" | "poor" | "connecting" | "offline";

type PeerDiagnostic = {
  connectionState: string;
  iceConnectionState: string;
  signalingState: string;
  rttMs: number | null;
  inboundKbps: number | null;
  outboundKbps: number | null;
  packetsLost: number;
  health: PeerHealth;
  updatedAt: number;
};

type PopoutFrame =
  | {
      id: string;
      title: string;
      kind: "stream";
      streamScope: "local" | "remote";
      source: "camera" | "screen" | "active";
      peerId?: string;
      x: number;
      y: number;
      width: number;
      height: number;
      maximized: boolean;
    }
  | {
      id: string;
      title: string;
      kind: "attachment";
      attachment: LiveChatAttachment;
      x: number;
      y: number;
      width: number;
      height: number;
      maximized: boolean;
    };

type LiveChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "video";
  dataUrl: string;
  sizeBytes: number;
};

type LiveChatMessage = {
  id: string;
  peerId: string;
  guestName: string;
  text: string;
  attachments: LiveChatAttachment[];
  createdAt: string;
};

type WtfLiveSocketEvent = {
  type?: string;
  peerId?: string;
  fromPeerId?: string;
  guestName?: string;
  roomId?: string;
  peers?: Array<{ peerId?: string; guestName?: string; mediaState?: Partial<LiveMediaState> }>;
  peer?: { peerId?: string; guestName?: string; mediaState?: Partial<LiveMediaState> };
  mediaState?: Partial<LiveMediaState>;
  signal?: {
    kind?: "description" | "candidate";
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
  message?: LiveChatMessage | string;
  error?: string;
  messageText?: string;
};

const LIVE_CHAT_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "video/mp4"]);
const LIVE_AVATAR_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_LIVE_CHAT_ATTACHMENTS = 4;
const MAX_LIVE_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_LIVE_AVATAR_BYTES = 512 * 1024;
const MAX_LIVE_AVATAR_DATA_URL_LENGTH = Math.ceil(MAX_LIVE_AVATAR_BYTES * 1.4);
const PEER_CONNECTION_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

const GuestShell = styled.main`
  min-height: 100vh;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
    linear-gradient(180deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
    #087f7b;
  background-size: 18px 18px;
  color: #07120f;
  display: grid;
  place-items: stretch;
  padding: clamp(6px, 1vw, 14px);
  box-sizing: border-box;
`;

const RoomFrame = styled.section`
  width: min(1800px, 100%);
  height: calc(100vh - clamp(12px, 2vw, 28px));
  min-height: 520px;
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 2px outset #fff;
  background: #e9e9e9;
  box-shadow: 7px 9px 0 rgba(0, 0, 0, 0.38);
  overflow: hidden;

  @media (max-width: 820px) {
    height: auto;
    min-height: calc(100vh - clamp(12px, 2vw, 28px));
    overflow: visible;
  }
`;

const TitleBar = styled.header`
  background: linear-gradient(90deg, #090980, #2f3192);
  color: #fff;
  min-height: 30px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-weight: 700;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const RoomTitleBlock = styled.div`
  min-width: 0;
  display: grid;
  gap: 2px;

  h1 {
    margin: 0;
    font-size: clamp(14px, 1.4vw, 20px);
    line-height: 1;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }

  span {
    color: #dff7ff;
    font-size: 11px;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const HeaderStatus = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  text-align: right;
`;

const HeaderCloseButton = styled(Button)`
  min-width: 28px;
  min-height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const ControlRail = styled.aside`
  border: 2px inset #fff;
  background: #d8d8d8;
  padding: 6px;
  display: grid;
  align-content: start;
  gap: 7px;
  min-width: 0;
  min-height: 0;
  overflow: auto;

  @media (max-width: 980px) {
    order: 3;
    max-height: 360px;
  }
`;

const SettingsGroup = styled.div`
  border: 2px inset #fff;
  background: #ededed;
  padding: 5px;
  display: grid;
  gap: 5px;
  min-width: 0;
`;

const RoomBody = styled.div`
  display: grid;
  grid-template-columns: clamp(170px, 15vw, 235px) minmax(0, 1fr) clamp(285px, 22vw, 360px);
  gap: 8px;
  padding: 8px;
  min-height: 0;
  overflow: hidden;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    overflow: auto;
    ${ControlRail} {
      order: 3;
    }
  }

  @media (max-width: 820px) {
    overflow: visible;
  }
`;

const Panel = styled.section`
  border: 2px inset #fff;
  background: #f7f7f7;
  padding: 10px;
  display: grid;
  gap: 10px;
  align-content: start;
  min-height: 0;
`;

const StagePanel = styled.section`
  border: 2px inset #fff;
  background: #111;
  color: #f7f7f7;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 6px;
  padding: 6px;
  min-height: 0;
  overflow: hidden;

  @media (max-width: 980px) {
    order: 1;
    min-height: min(72vh, 620px);
  }
`;

const StageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 24px;
  font-size: 12px;
  color: #dff7ff;
`;

const StageGrid = styled.div<{ $count: number }>`
  display: grid;
  gap: 6px;
  min-height: 0;
  overflow: auto;
  grid-template-columns: ${({ $count }) => ($count <= 1 ? "1fr" : $count === 2 ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(min(360px, 100%), 1fr))")};
  grid-auto-rows: minmax(260px, 1fr);
  align-content: stretch;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    grid-auto-rows: minmax(240px, 58vh);
  }
`;

const RoomSidebar = styled.aside`
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  min-height: 0;
  min-width: 0;

  @media (max-width: 980px) {
    order: 2;
    min-height: 480px;
  }
`;

const SidebarPanel = styled.section`
  border: 2px inset #fff;
  background: #f0f0f0;
  padding: 8px;
  display: grid;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
`;

const AttendancePanel = styled.details`
  border: 2px inset #fff;
  background: #f0f0f0;
  padding: 5px 7px;
  min-width: 0;
  overflow: hidden;

  &[open] {
    display: grid;
    grid-template-rows: auto minmax(0, 220px);
    gap: 6px;
  }

  summary {
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }
`;

const ChatColumn = styled(SidebarPanel)`
  grid-template-rows: auto minmax(0, 1fr) auto;

  @media (max-width: 980px) {
    min-height: 420px;
  }
`;

const GuestGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const RoomActionGrid = styled(GuestGrid)`
  grid-template-columns: repeat(2, minmax(0, 1fr));

  button {
    min-height: 32px;
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const MediaButtonGrid = styled(GuestGrid)`
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const ControlButton = styled(Button)<{ $active?: boolean }>`
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: ${({ $active }) => ($active ? "#dff7e8" : undefined)};

  svg {
    width: 17px;
    height: 17px;
  }
`;

const ButtonLabel = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
`;

const MicMeter = styled.div`
  border: 2px inset #fff;
  background: #ffffff;
  padding: 4px 6px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
`;

const MicMeterTrack = styled.div`
  height: 12px;
  border: 1px solid #202020;
  background: #d5d5d5;
  overflow: hidden;
`;

const MicMeterFill = styled.div<{ $level: number }>`
  width: ${({ $level }) => `${Math.round(Math.max(0, Math.min(1, $level)) * 100)}%`};
  height: 100%;
  background: ${({ $level }) => ($level > 0.18 ? "#06893d" : $level > 0.06 ? "#c8a600" : "#9aa0a6")};
  transition: width 80ms linear;
`;

const StatusLine = styled.div`
  min-height: 20px;
  font-size: 12px;
  color: #14312e;
`;

const PreviewGrid = styled.div`
  display: grid;
  gap: 5px;
  grid-template-columns: 1fr;
`;

const PreviewBox = styled.div<{ $active?: boolean }>`
  border: 2px inset #fff;
  min-height: 62px;
  background: #080808;
  color: #f3f3f3;
  display: grid;
  place-items: center;
  overflow: hidden;
  outline: ${({ $active }) => ($active ? "3px solid #13a450" : "none")};
  outline-offset: -5px;
  cursor: pointer;
`;

const PreviewVideo = styled.video`
  width: 100%;
  height: 100%;
  min-height: 52px;
  object-fit: contain;
  background: #050505;
`;

const LiveSectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;

  > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
`;

const SharePicker = styled.div`
  border: 2px inset #fff;
  background: #ededed;
  padding: 6px;
  display: grid;
  gap: 5px;
`;

const ShareStatus = styled.span`
  font-size: 11px;
  color: #24423e;
`;

const AvatarSettings = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
`;

const LocalPreviewDock = styled.div`
  display: grid;
  gap: 5px;
`;

const StageTile = styled.article<{ $hasVideo?: boolean }>`
  position: relative;
  border: 2px inset #fff;
  background: ${({ $hasVideo }) => ($hasVideo ? "#050505" : "#17231f")};
  color: #f8fff9;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 260px;
  overflow: hidden;
  cursor: ${({ $hasVideo }) => ($hasVideo ? "zoom-in" : "default")};
`;

const StageVideoFrame = styled.div`
  min-height: 0;
  display: grid;
  place-items: center;
  background: #050505;
  overflow: hidden;
`;

const StageVideo = styled.video`
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
  background: #050505;
`;

const AvatarStage = styled.div`
  min-height: 0;
  display: grid;
  place-items: center;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    #17231f;
  background-size: 16px 16px;
`;

const AvatarCircle = styled.div<{ $size?: "small" | "large" }>`
  width: ${({ $size }) => ($size === "small" ? "34px" : "clamp(96px, 15vw, 180px)")};
  height: ${({ $size }) => ($size === "small" ? "34px" : "clamp(96px, 15vw, 180px)")};
  border-radius: 50%;
  border: ${({ $size }) => ($size === "small" ? "1px solid #668" : "3px solid #dfffe9")};
  background: #0b5f59;
  color: #fff;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 700;
  font-size: ${({ $size }) => ($size === "small" ? "12px" : "clamp(28px, 5vw, 58px)")};
  text-transform: uppercase;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const StageMeta = styled.div`
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.72);
  padding: 7px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
`;

const StageOpenButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  border: 2px outset #fff;
  background: #e7e7e7;
  color: #050505;
  min-width: 30px;
  min-height: 28px;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 2;
`;

const EmptyStage = styled.div`
  border: 2px inset #fff;
  background: #0d1613;
  color: #dff7ff;
  display: grid;
  place-items: center;
  min-height: 320px;
  font-weight: 700;
`;

const RemoteAudio = styled.audio`
  display: none;
`;

const AttendanceList = styled.div`
  border: 2px inset #fff;
  background: #fff;
  display: grid;
  align-content: start;
  gap: 5px;
  padding: 6px;
  overflow: auto;
  min-height: 0;
`;

const AttendeeRow = styled.div<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
  padding: 5px;
  border: 1px solid ${({ $active }) => ($active ? "#5fb879" : "#d4d4d4")};
  background: ${({ $active }) => ($active ? "#eefaf1" : "#f8f8f8")};
  font-size: 12px;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const MicDot = styled.span<{ $active?: boolean; $ready?: boolean }>`
  width: 22px;
  height: 22px;
  border: 1px solid ${({ $active }) => ($active ? "#087c39" : "#7a7a7a")};
  background: ${({ $active, $ready }) => ($active ? "#13d66f" : $ready ? "#f5d45d" : "#d6d6d6")};
  color: #07120f;
  display: grid;
  place-items: center;
`;

const HealthDot = styled.span<{ $health: PeerHealth }>`
  min-width: 44px;
  border: 1px solid #545454;
  padding: 2px 4px;
  text-align: center;
  font-size: 10px;
  background: ${({ $health }) => (
    $health === "good" ? "#dff7e8" :
      $health === "fair" ? "#fff2b8" :
        $health === "poor" ? "#ffd9d9" :
          $health === "offline" ? "#d7d7d7" : "#e8eefb"
  )};
`;

const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const MediaPill = styled.span<{ $active?: boolean }>`
  border: 1px solid ${({ $active }) => ($active ? "#85ffc2" : "#555")};
  background: ${({ $active }) => ($active ? "#123d28" : "#2b2b2b")};
  color: ${({ $active }) => ($active ? "#dfffe9" : "#cfcfcf")};
  padding: 2px 5px;
  font-size: 10px;
  text-transform: uppercase;
`;

const MessageList = styled.div`
  border: 2px inset #fff;
  background: #fff;
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 8px;
`;

const NewMessagesButton = styled(Button)`
  justify-self: end;
  min-height: 28px;
`;

const MessageItem = styled.article`
  border-bottom: 1px solid #d9d9d9;
  display: grid;
  gap: 3px;
  padding: 0 0 7px;
  font-size: 13px;

  strong {
    color: #090980;
  }
`;

const MessageDivider = styled.div`
  color: #4f4f4f;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
`;

const ChatComposer = styled.div`
  border: 2px inset #fff;
  background: #ececec;
  padding: 8px;
  display: grid;
  gap: 7px;
  min-width: 0;
`;

const ChatTextArea = styled.textarea`
  width: 100%;
  min-height: 74px;
  border: 2px inset #fff;
  padding: 7px;
  font: inherit;
  box-sizing: border-box;
  resize: vertical;
`;

const AttachmentStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
`;

const AttachmentPreview = styled.div`
  border: 2px inset #fff;
  background: #fff;
  padding: 5px;
  display: grid;
  gap: 4px;
  font-size: 11px;
  min-width: 0;

  img,
  video {
    width: 100%;
    max-height: 110px;
    object-fit: contain;
    background: #050505;
    cursor: zoom-in;
  }
`;

const DiagnosticsPanel = styled.div`
  border: 2px inset #fff;
  background: #fff;
  padding: 5px;
  display: grid;
  gap: 4px;
  font-size: 11px;
`;

const DiagnosticRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const FloatingLayer = styled.div`
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 4000;
`;

const FloatingWindow = styled.section<{ $maximized?: boolean; $x: number; $y: number; $width: number; $height: number }>`
  pointer-events: auto;
  position: fixed;
  left: ${({ $maximized, $x }) => ($maximized ? "10px" : `${$x}px`)};
  top: ${({ $maximized, $y }) => ($maximized ? "10px" : `${$y}px`)};
  width: ${({ $maximized, $width }) => ($maximized ? "calc(100vw - 20px)" : `${$width}px`)};
  height: ${({ $maximized, $height }) => ($maximized ? "calc(100vh - 20px)" : `${$height}px`)};
  min-width: min(260px, calc(100vw - 20px));
  min-height: min(220px, calc(100vh - 20px));
  border: 2px outset #fff;
  background: #111;
  box-shadow: 9px 11px 0 rgba(0, 0, 0, 0.35);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
`;

const FloatingTitleBar = styled.div`
  background: linear-gradient(90deg, #090980, #2f3192);
  color: #fff;
  min-height: 30px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 3px 5px;
  font-size: 12px;
  font-weight: 700;
  cursor: move;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const FloatingButtonRow = styled.div`
  display: flex;
  gap: 4px;

  button {
    min-width: 28px;
    min-height: 24px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
`;

const FloatingContent = styled.div`
  min-height: 0;
  background: #050505;
  display: grid;
  place-items: center;
  overflow: auto;

  img,
  video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    background: #050505;
  }
`;

const FloatingVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #050505;
`;

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function useMediaStream<T extends HTMLMediaElement>(
  ref: RefObject<T | null>,
  stream: MediaStream | null,
  signature = "",
) {
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.play?.().catch(() => undefined);
  }, [ref, stream, signature]);
}

function liveSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/wtf-live`;
}

function normalizeAvatarUrl(value: unknown): string | null {
  const avatarUrl = typeof value === "string" ? value : "";
  if (!avatarUrl) return null;
  if (!/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(avatarUrl)) return null;
  if (avatarUrl.length > MAX_LIVE_AVATAR_DATA_URL_LENGTH) return null;
  return avatarUrl;
}

function storedAvatarUrl(): string | null {
  try {
    return normalizeAvatarUrl(localStorage.getItem("wtf-live:avatar-url"));
  } catch {
    return null;
  }
}

function emptyPeerDiagnostic(): PeerDiagnostic {
  return {
    connectionState: "new",
    iceConnectionState: "new",
    signalingState: "stable",
    rttMs: null,
    inboundKbps: null,
    outboundKbps: null,
    packetsLost: 0,
    health: "connecting",
    updatedAt: Date.now(),
  };
}

function healthForDiagnostic(diagnostic: Partial<PeerDiagnostic>): PeerHealth {
  if (diagnostic.connectionState === "closed" || diagnostic.connectionState === "failed" || diagnostic.iceConnectionState === "failed") return "offline";
  if (diagnostic.connectionState !== "connected") return "connecting";
  const rttMs = diagnostic.rttMs ?? 0;
  const lost = diagnostic.packetsLost ?? 0;
  if (rttMs > 500 || lost > 20) return "poor";
  if (rttMs > 220 || lost > 5) return "fair";
  return "good";
}

function healthLabel(health: PeerHealth): string {
  if (health === "good") return "Good";
  if (health === "fair") return "Fair";
  if (health === "poor") return "Poor";
  if (health === "offline") return "Off";
  return "Sync";
}

function diagnosticSummary(diagnostic: PeerDiagnostic | undefined): string {
  if (!diagnostic) return "transport pending";
  const rtt = diagnostic.rttMs == null ? "" : `${diagnostic.rttMs}ms`;
  const down = diagnostic.inboundKbps == null ? "" : `${diagnostic.inboundKbps}kbps in`;
  const up = diagnostic.outboundKbps == null ? "" : `${diagnostic.outboundKbps}kbps out`;
  return [diagnostic.connectionState, diagnostic.iceConnectionState, rtt, down, up]
    .filter(Boolean)
    .join(" / ");
}

function streamSignature(stream: MediaStream | null): string {
  return (stream?.getTracks() ?? [])
    .map((track) => `${track.kind}:${track.id}:${track.readyState}:${track.enabled}`)
    .join("|");
}

function isNearScrollBottom(node: HTMLElement, padding = 96): boolean {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= padding;
}

function hasLiveTrack(stream: MediaStream | null, kind: MediaStreamTrack["kind"]): boolean {
  return Boolean(stream?.getTracks().some((track) => track.kind === kind && track.readyState === "live"));
}

function resolveActiveVideoSource(
  streams: {
    cameraStream: MediaStream | null;
    screenStream: MediaStream | null;
  },
  requested: ActiveVideoSource,
): ActiveVideoSource {
  const hasCamera = hasLiveTrack(streams.cameraStream, "video");
  const hasScreen = hasLiveTrack(streams.screenStream, "video");
  if (requested === "camera" && hasCamera) return "camera";
  if (requested === "screen" && hasScreen) return "screen";
  if (hasScreen) return "screen";
  if (hasCamera) return "camera";
  return null;
}

function mediaStateFromStreams(streams: {
  micStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  activeVideoSource: ActiveVideoSource;
  audioEnabled: boolean;
  avatarUrl: string | null;
}): LiveMediaState {
  const camera = hasLiveTrack(streams.cameraStream, "video");
  const screen = hasLiveTrack(streams.screenStream, "video");
  const mic = hasLiveTrack(streams.micStream, "audio");
  return {
    mic,
    audioOpen: mic && streams.audioEnabled,
    camera,
    screen,
    activeVideo: resolveActiveVideoSource(streams, streams.activeVideoSource),
    avatarUrl: normalizeAvatarUrl(streams.avatarUrl),
  };
}

function normalizeMediaState(value: Partial<LiveMediaState> | undefined): LiveMediaState {
  const camera = Boolean(value?.camera);
  const screen = Boolean(value?.screen);
  const requested = value?.activeVideo === "camera" || value?.activeVideo === "screen" ? value.activeVideo : null;
  const mic = Boolean(value?.mic);
  return {
    mic,
    audioOpen: Boolean(value?.audioOpen ?? mic),
    camera,
    screen,
    activeVideo: requested === "camera" && camera ? "camera" : requested === "screen" && screen ? "screen" : null,
    avatarUrl: normalizeAvatarUrl(value?.avatarUrl),
  };
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part[0]).join("");
}

function labelForMediaState(state: LiveMediaState, connected = true): string {
  if (state.activeVideo === "screen") return "Screen";
  if (state.activeVideo === "camera") return "Camera";
  if (state.audioOpen) return "Mic live";
  if (state.mic) return "Mic ready";
  return connected ? "Idle" : "Connecting";
}

function activeVideoStreamForSource(source: ActiveVideoSource, streams: {
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
}): MediaStream | null {
  if (source === "camera") return streams.cameraStream;
  if (source === "screen") return streams.screenStream;
  return null;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readAttachment(file: File): Promise<LiveChatAttachment> {
  return new Promise((resolve, reject) => {
    if (!LIVE_CHAT_MEDIA_TYPES.has(file.type)) {
      reject(new Error("Unsupported media type."));
      return;
    }
    if (file.size > MAX_LIVE_CHAT_ATTACHMENT_BYTES) {
      reject(new Error("Media file is larger than 8 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read media file."));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith(`data:${file.type};base64,`)) {
        reject(new Error("Unsupported media encoding."));
        return;
      }
      resolve({
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type,
        kind: file.type.startsWith("video/") ? "video" : "image",
        dataUrl,
        sizeBytes: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

function readAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!LIVE_AVATAR_MEDIA_TYPES.has(file.type)) {
      reject(new Error("Unsupported avatar image."));
      return;
    }
    if (file.size > MAX_LIVE_AVATAR_BYTES) {
      reject(new Error("Avatar image is larger than 512 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read avatar image."));
    reader.onload = () => {
      const avatarUrl = normalizeAvatarUrl(reader.result);
      if (!avatarUrl) {
        reject(new Error("Unsupported avatar image."));
        return;
      }
      resolve(avatarUrl);
    };
    reader.readAsDataURL(file);
  });
}

function AvatarMark({ name, avatarUrl, size = "large" }: { name: string; avatarUrl?: string | null; size?: "small" | "large" }) {
  return (
    <AvatarCircle $size={size}>
      {avatarUrl ? <img src={avatarUrl} alt={`${name} avatar`} data-wtf-live-avatar-image /> : initialsForName(name)}
    </AvatarCircle>
  );
}

function StageParticipantTile({
  id,
  name,
  mediaState,
	  stream,
	  connected,
	  isSelf = false,
	  onOpen,
	}: {
	  id: string;
	  name: string;
	  mediaState: LiveMediaState;
	  stream: MediaStream | null;
	  connected: boolean;
	  isSelf?: boolean;
	  onOpen?: () => void;
	}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamSignature = (stream?.getTracks() ?? [])
    .map((track) => `${track.kind}:${track.id}:${track.readyState}`)
    .join("|");
  const hasVideo = Boolean(mediaState.activeVideo) && Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));
  const hasAudio = mediaState.mic || Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live"));
  const mode = hasVideo ? mediaState.activeVideo ?? "video" : hasAudio ? "mic" : "idle";
  const activeVideoLabel = mediaState.activeVideo === "screen"
    ? "Viewing screen"
    : mediaState.activeVideo === "camera"
      ? "Viewing camera"
      : hasAudio
        ? "Mic live"
        : connected
          ? "Idle"
          : "Connecting";
  useMediaStream(videoRef, hasVideo ? stream : null, streamSignature);
  useMediaStream(audioRef, !isSelf && !hasVideo && hasAudio ? stream : null, streamSignature);
  return (
	    <StageTile
	      $hasVideo={hasVideo}
	      onClick={hasVideo ? onOpen : undefined}
	      data-wtf-live-stage-peer={id}
	      data-wtf-live-stage-mode={mode}
      data-wtf-live-remote-peer={isSelf ? undefined : id}
      data-wtf-live-remote-active-video={isSelf ? undefined : mediaState.activeVideo ?? "none"}
	    >
	      {hasVideo ? (
	        <StageOpenButton
	          type="button"
	          aria-label={`Open ${name} share`}
	          data-wtf-live-open-stage-popout={id}
	          onClick={(event) => {
	            event.stopPropagation();
	            onOpen?.();
	          }}
	        >
	          <Maximize2 size={15} aria-hidden />
	        </StageOpenButton>
	      ) : null}
	      {hasVideo ? (
        <StageVideoFrame>
          <StageVideo
            ref={videoRef}
            data-wtf-live-remote-video={isSelf ? undefined : id}
            data-wtf-live-local-stage-video={isSelf ? "true" : undefined}
            autoPlay
            playsInline
            muted={isSelf}
          />
        </StageVideoFrame>
      ) : (
        <AvatarStage>
          <AvatarMark name={name} avatarUrl={mediaState.avatarUrl} />
        </AvatarStage>
      )}
      {!isSelf && !hasVideo && hasAudio ? <RemoteAudio ref={audioRef} data-wtf-live-remote-audio={id} autoPlay /> : null}
      <StageMeta>
        <strong>{isSelf ? `${name} (you)` : name}</strong>
        <span>{activeVideoLabel}</span>
      </StageMeta>
    </StageTile>
	  );
	}

function RemoteAudioSink({ peer }: { peer: LivePeer }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAttachAudio = peer.mediaState.mic && !peer.mediaState.activeVideo;
  useMediaStream(audioRef, shouldAttachAudio ? peer.stream : null, streamSignature(peer.stream));
  return <RemoteAudio ref={audioRef} data-wtf-live-remote-audio={peer.peerId} autoPlay />;
}

function FloatingStreamWindow({
  frame,
  stream,
  onClose,
  onToggleMaximize,
  onCycleSize,
  onDragStart,
}: {
  frame: Extract<PopoutFrame, { kind: "stream" }>;
  stream: MediaStream | null;
  onClose: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onCycleSize: (id: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>, frame: PopoutFrame) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useMediaStream(videoRef, stream, streamSignature(stream));
  return (
    <FloatingWindow
      $maximized={frame.maximized}
      $x={frame.x}
      $y={frame.y}
      $width={frame.width}
      $height={frame.height}
      data-wtf-live-popout-frame={frame.id}
    >
      <FloatingTitleBar onPointerDown={(event) => onDragStart(event, frame)}>
        <Move size={14} aria-hidden />
        <span>{frame.title}</span>
        <FloatingButtonRow onPointerDown={(event) => event.stopPropagation()}>
          <Button aria-label="Resize popout" onClick={() => onCycleSize(frame.id)}>
            <Gauge size={14} aria-hidden />
          </Button>
          <Button aria-label="Maximize popout" onClick={() => onToggleMaximize(frame.id)} data-wtf-live-popout-maximize={frame.id}>
            <Maximize2 size={14} aria-hidden />
          </Button>
          <Button aria-label="Close popout" onClick={() => onClose(frame.id)} data-wtf-live-popout-close={frame.id}>
            <X size={14} aria-hidden />
          </Button>
        </FloatingButtonRow>
      </FloatingTitleBar>
      <FloatingContent>
        <FloatingVideo ref={videoRef} autoPlay playsInline muted={frame.streamScope === "local"} />
      </FloatingContent>
    </FloatingWindow>
  );
}

function FloatingAttachmentWindow({
  frame,
  onClose,
  onToggleMaximize,
  onCycleSize,
  onDragStart,
}: {
  frame: Extract<PopoutFrame, { kind: "attachment" }>;
  onClose: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onCycleSize: (id: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>, frame: PopoutFrame) => void;
}) {
  return (
    <FloatingWindow
      $maximized={frame.maximized}
      $x={frame.x}
      $y={frame.y}
      $width={frame.width}
      $height={frame.height}
      data-wtf-live-popout-frame={frame.id}
      data-wtf-live-lightbox={frame.attachment.id}
    >
      <FloatingTitleBar onPointerDown={(event) => onDragStart(event, frame)}>
        <Move size={14} aria-hidden />
        <span>{frame.title}</span>
        <FloatingButtonRow onPointerDown={(event) => event.stopPropagation()}>
          <Button aria-label="Resize popout" onClick={() => onCycleSize(frame.id)}>
            <Gauge size={14} aria-hidden />
          </Button>
          <Button aria-label="Maximize popout" onClick={() => onToggleMaximize(frame.id)} data-wtf-live-popout-maximize={frame.id}>
            <Maximize2 size={14} aria-hidden />
          </Button>
          <Button aria-label="Close popout" onClick={() => onClose(frame.id)} data-wtf-live-popout-close={frame.id}>
            <X size={14} aria-hidden />
          </Button>
        </FloatingButtonRow>
      </FloatingTitleBar>
      <FloatingContent>
        {frame.attachment.kind === "video" ? (
          <video src={frame.attachment.dataUrl} controls playsInline />
        ) : (
          <img src={frame.attachment.dataUrl} alt={frame.attachment.name} />
        )}
      </FloatingContent>
    </FloatingWindow>
  );
}

export function WtfLivePublicRoom({ roomId }: { roomId: string }) {
  const roomQuery = useQuery<PublicRoomResponse>({
    queryKey: ["wtf-live", "public-room", roomId],
    queryFn: () => api.get(`/api/wtf-live/public/rooms/${encodeURIComponent(roomId)}`),
  });
  const messagesQuery = useQuery<{ messages: RoomMessage[] }>({
    queryKey: ["wtf-live", "public-room", roomId, "messages"],
    queryFn: () => api.get(`/api/wtf-live/public/rooms/${encodeURIComponent(roomId)}/messages`),
  });

  const [guestName, setGuestName] = useState(() => localStorage.getItem("wtf-live:guest-name") || "");
  const [joined, setJoined] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [activeVideoSource, setActiveVideoSource] = useState<ActiveVideoSource>(null);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [pushHeld, setPushHeld] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => storedAvatarUrl());
  const [remotePeers, setRemotePeers] = useState<LivePeer[]>([]);
  const [peerDiagnostics, setPeerDiagnostics] = useState<Record<string, PeerDiagnostic>>({});
  const [liveMessages, setLiveMessages] = useState<LiveChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatAttachments, setChatAttachments] = useState<LiveChatAttachment[]>([]);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [popoutFrames, setPopoutFrames] = useState<PopoutFrame[]>([]);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const screenRef = useRef<HTMLVideoElement | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const micAnimationRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const statsSamplesRef = useRef<Map<string, { timestamp: number; inboundBytes: number; outboundBytes: number }>>(new Map());
  const selfPeerIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const chatNearBottomRef = useRef(true);
  const lastChatItemCountRef = useRef(0);
  const dragFrameRef = useRef<{ id: string; startX: number; startY: number; frameX: number; frameY: number } | null>(null);
  const lastMediaStateRef = useRef<LiveMediaState>({ mic: false, audioOpen: false, camera: false, screen: false, activeVideo: null, avatarUrl: null });
  const localStreamsRef = useRef({
    micStream: null as MediaStream | null,
    cameraStream: null as MediaStream | null,
    screenStream: null as MediaStream | null,
    activeVideoSource: null as ActiveVideoSource,
    audioEnabled: false,
    avatarUrl: null as string | null,
  });
  const room = roomQuery.data?.room;
  const roomUrl = useMemo(() => {
    if (typeof window === "undefined") return `/live/r/${roomId}`;
    return `${window.location.origin}/live/r/${roomId}`;
  }, [roomId]);
  const localAudioOpen = Boolean(micStream && (!pushToTalk || pushHeld));

  useMediaStream(cameraRef, cameraStream);
  useMediaStream(screenRef, screenStream);

  useEffect(() => {
    localStreamsRef.current = { micStream, cameraStream, screenStream, activeVideoSource, audioEnabled: localAudioOpen, avatarUrl };
  }, [activeVideoSource, avatarUrl, cameraStream, localAudioOpen, micStream, screenStream]);

  useEffect(() => {
    micStream?.getAudioTracks().forEach((track) => {
      track.enabled = localAudioOpen;
    });
  }, [localAudioOpen, micStream]);

  useEffect(() => {
    setActiveVideoSource((current) => resolveActiveVideoSource({ cameraStream, screenStream }, current));
  }, [cameraStream, screenStream]);

	  useEffect(() => () => {
	    socketRef.current?.close();
	    socketRef.current = null;
	    for (const connection of peerConnectionsRef.current.values()) connection.close();
	    peerConnectionsRef.current.clear();
	    remoteStreamsRef.current.clear();
	    statsSamplesRef.current.clear();
	    stopStream(localStreamsRef.current.micStream);
	    stopStream(localStreamsRef.current.cameraStream);
	    stopStream(localStreamsRef.current.screenStream);
	  }, []);

  useEffect(() => {
    if (!micStream) {
      setMicLevel(0);
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setMicLevel(0);
      setStatus("Mic ready. Level meter is not supported in this browser.");
      return;
    }

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(micStream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    audioContext.resume().catch(() => undefined);

    const readLevel = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / samples.length);
      const nextLevel = Math.min(1, rms * 5);
      setMicLevel((current) => (Math.abs(current - nextLevel) > 0.015 ? nextLevel : current));
      micAnimationRef.current = requestAnimationFrame(readLevel);
    };

    readLevel();

    return () => {
      if (micAnimationRef.current !== null) cancelAnimationFrame(micAnimationRef.current);
      micAnimationRef.current = null;
      source.disconnect();
      audioContext.close().catch(() => undefined);
      setMicLevel(0);
    };
  }, [micStream]);

  function sendRoomSocket(payload: Record<string, unknown>) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }

  function resetRoomSession(nextStatus: string) {
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
	    for (const connection of peerConnectionsRef.current.values()) connection.close();
	    peerConnectionsRef.current.clear();
	    remoteStreamsRef.current.clear();
	    statsSamplesRef.current.clear();
	    selfPeerIdRef.current = null;
	    lastMediaStateRef.current = { mic: false, audioOpen: false, camera: false, screen: false, activeVideo: null, avatarUrl };
	    stopStream(localStreamsRef.current.micStream);
	    stopStream(localStreamsRef.current.cameraStream);
	    stopStream(localStreamsRef.current.screenStream);
	    setMicStream(null);
	    setCameraStream(null);
	    setScreenStream(null);
	    setActiveVideoSource(null);
	    setPushHeld(false);
	    setPopoutFrames([]);
	    setRemotePeers([]);
	    setPeerDiagnostics({});
	    setSocketReady(false);
	    setJoined(false);
	    setPeerId(null);
    setMicLevel(0);
    setStatus(nextStatus);
  }

  function currentMediaState() {
    return mediaStateFromStreams(localStreamsRef.current);
  }

  function hasAnyMedia(state: LiveMediaState) {
    return state.mic || state.camera || state.screen;
  }

  function upsertRemotePeer(next: {
    peerId: string;
    guestName?: string;
    mediaState?: Partial<LiveMediaState>;
    stream?: MediaStream;
    connected?: boolean;
  }) {
    if (!next.peerId || next.peerId === selfPeerIdRef.current) return;
    const stream = next.stream ?? remoteStreamsRef.current.get(next.peerId) ?? new MediaStream();
    remoteStreamsRef.current.set(next.peerId, stream);
    setRemotePeers((current) => {
      const existing = current.find((peer) => peer.peerId === next.peerId);
      const updated: LivePeer = {
        peerId: next.peerId,
        guestName: next.guestName || existing?.guestName || "guest",
        mediaState: normalizeMediaState(next.mediaState ?? existing?.mediaState),
        stream,
        connected: next.connected ?? existing?.connected ?? false,
      };
      const others = current.filter((peer) => peer.peerId !== next.peerId);
      return [...others, updated].sort((a, b) => a.guestName.localeCompare(b.guestName));
    });
  }

	  function removeRemotePeer(remotePeerId: string) {
	    peerConnectionsRef.current.get(remotePeerId)?.close();
	    peerConnectionsRef.current.delete(remotePeerId);
	    remoteStreamsRef.current.delete(remotePeerId);
	    statsSamplesRef.current.delete(remotePeerId);
	    setRemotePeers((current) => current.filter((peer) => peer.peerId !== remotePeerId));
	    setPeerDiagnostics((current) => {
	      const next = { ...current };
	      delete next[remotePeerId];
	      return next;
	    });
	    setPopoutFrames((current) => current.filter((frame) => frame.kind !== "stream" || frame.peerId !== remotePeerId));
	  }

	  function updatePeerDiagnostic(remotePeerId: string, patch: Partial<PeerDiagnostic>) {
	    setPeerDiagnostics((current) => {
	      const existing = current[remotePeerId] ?? emptyPeerDiagnostic();
	      const next = {
	        ...existing,
	        ...patch,
	        updatedAt: Date.now(),
	      };
	      next.health = healthForDiagnostic(next);
	      return { ...current, [remotePeerId]: next };
	    });
	  }

  async function syncLocalTracks(connection: RTCPeerConnection) {
    const desiredTracks = new Map<string, { track: MediaStreamTrack; stream: MediaStream }>();
    const addStreamTracks = (stream: MediaStream | null, kind?: MediaStreamTrack["kind"]) => {
      stream?.getTracks()
        .filter((track) => track.readyState === "live" && (!kind || track.kind === kind))
        .forEach((track) => desiredTracks.set(track.id, { track, stream }));
    };
    const activeSource = resolveActiveVideoSource(localStreamsRef.current, localStreamsRef.current.activeVideoSource);
    addStreamTracks(localStreamsRef.current.micStream, "audio");
    if (activeSource === "screen") {
      addStreamTracks(localStreamsRef.current.screenStream, "video");
      addStreamTracks(localStreamsRef.current.screenStream, "audio");
    } else if (activeSource === "camera") {
      addStreamTracks(localStreamsRef.current.cameraStream, "video");
    }

    for (const transceiver of connection.getTransceivers()) {
      const sender = transceiver.sender;
      if (sender.track && !desiredTracks.has(sender.track.id)) {
        await sender.replaceTrack(null);
        if (transceiver.direction === "sendrecv") transceiver.direction = "recvonly";
        if (transceiver.direction === "sendonly") transceiver.direction = "inactive";
      }
    }
    const activeTrackIds = new Set(
      connection.getSenders()
        .map((sender) => sender.track?.id)
        .filter((trackId): trackId is string => Boolean(trackId)),
    );
    for (const { track, stream } of desiredTracks.values()) {
      if (activeTrackIds.has(track.id)) continue;
      const reusable = connection
        .getTransceivers()
        .find((transceiver) =>
          transceiver.receiver.track.kind === track.kind &&
          !transceiver.sender.track &&
          transceiver.direction !== "stopped"
        );
      if (reusable) {
        await reusable.sender.replaceTrack(track);
        if (reusable.direction === "recvonly") reusable.direction = "sendrecv";
        if (reusable.direction === "inactive") reusable.direction = "sendonly";
        continue;
      }
      connection.addTrack(track, stream);
    }
  }

  function sendSignal(toPeerId: string, signal: WtfLiveSocketEvent["signal"]) {
    sendRoomSocket({ type: "wtf_live_signal", toPeerId, signal });
  }

  function ensurePeerConnection(remotePeerId: string) {
    const existing = peerConnectionsRef.current.get(remotePeerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
    peerConnectionsRef.current.set(remotePeerId, connection);
    try {
      connection.addTransceiver("audio", { direction: "recvonly" });
      connection.addTransceiver("video", { direction: "recvonly" });
      connection.addTransceiver("video", { direction: "recvonly" });
    } catch {
      // Older browser builds may not expose transceivers, but addTrack still works for local senders.
    }
	    const remoteStream = remoteStreamsRef.current.get(remotePeerId) ?? new MediaStream();
	    remoteStreamsRef.current.set(remotePeerId, remoteStream);
	    upsertRemotePeer({ peerId: remotePeerId, stream: remoteStream });
	    updatePeerDiagnostic(remotePeerId, {
	      connectionState: connection.connectionState,
	      iceConnectionState: connection.iceConnectionState,
	      signalingState: connection.signalingState,
	    });

	    connection.onicecandidate = (event) => {
	      if (!event.candidate) return;
	      sendSignal(remotePeerId, {
        kind: "candidate",
        candidate: event.candidate.toJSON(),
      });
    };
    connection.ontrack = (event) => {
      const stream = remoteStreamsRef.current.get(remotePeerId) ?? new MediaStream();
      const tracks = event.streams.length ? event.streams.flatMap((item) => item.getTracks()) : [event.track];
      for (const track of tracks) {
        if (!stream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          stream.addTrack(track);
        }
      }
	      remoteStreamsRef.current.set(remotePeerId, stream);
	      upsertRemotePeer({ peerId: remotePeerId, stream, connected: true });
	    };
	    connection.oniceconnectionstatechange = () => {
	      updatePeerDiagnostic(remotePeerId, {
	        connectionState: connection.connectionState,
	        iceConnectionState: connection.iceConnectionState,
	        signalingState: connection.signalingState,
	      });
	    };
	    connection.onsignalingstatechange = () => {
	      updatePeerDiagnostic(remotePeerId, {
	        connectionState: connection.connectionState,
	        iceConnectionState: connection.iceConnectionState,
	        signalingState: connection.signalingState,
	      });
	    };
	    connection.onconnectionstatechange = () => {
	      updatePeerDiagnostic(remotePeerId, {
	        connectionState: connection.connectionState,
	        iceConnectionState: connection.iceConnectionState,
	        signalingState: connection.signalingState,
	      });
	      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
	        upsertRemotePeer({ peerId: remotePeerId, connected: false });
	        return;
	      }
      upsertRemotePeer({ peerId: remotePeerId, connected: connection.connectionState === "connected" });
    };
    void syncLocalTracks(connection);
    return connection;
  }

  async function createOfferForPeer(remotePeerId: string) {
    const connection = ensurePeerConnection(remotePeerId);
    await syncLocalTracks(connection);
    if (connection.signalingState !== "stable") return;
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      sendSignal(remotePeerId, {
        kind: "description",
        description: connection.localDescription?.toJSON() ?? offer,
      });
    } catch {
      setStatus("Could not start media negotiation with a room peer.");
    }
  }

  async function renegotiateAllPeers() {
    for (const [remotePeerId, connection] of peerConnectionsRef.current) {
      await syncLocalTracks(connection);
      await createOfferForPeer(remotePeerId);
    }
  }

  async function handleSignal(fromPeerId: string | undefined, signal: WtfLiveSocketEvent["signal"]) {
    if (!fromPeerId || !signal) return;
    const connection = ensurePeerConnection(fromPeerId);
    try {
      if (signal.kind === "description" && signal.description) {
        const description = signal.description;
        if (description.type === "offer") {
          await connection.setRemoteDescription(description);
          if (connection.signalingState !== "have-remote-offer") return;
          await syncLocalTracks(connection);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          sendSignal(fromPeerId, {
            kind: "description",
            description: connection.localDescription?.toJSON() ?? answer,
          });
          return;
        }
        if (description.type === "answer" && connection.signalingState !== "stable") {
          await connection.setRemoteDescription(description);
        }
        return;
      }
      if (signal.kind === "candidate" && signal.candidate) {
        await connection.addIceCandidate(signal.candidate);
      }
    } catch {
      setStatus("Room media negotiation hit a peer connection error.");
    }
  }

  function handleSocketEvent(event: WtfLiveSocketEvent) {
    if (event.type === "wtf_live_connected" && event.peerId) {
      selfPeerIdRef.current = event.peerId;
      setPeerId(event.peerId);
      return;
    }

    if (event.type === "wtf_live_room_snapshot") {
      if (event.peerId) {
        selfPeerIdRef.current = event.peerId;
        setPeerId(event.peerId);
      }
      const peers = event.peers ?? [];
      peers.forEach((peer) => {
        if (!peer.peerId) return;
        ensurePeerConnection(peer.peerId);
        upsertRemotePeer({
          peerId: peer.peerId,
          guestName: peer.guestName,
        mediaState: peer.mediaState,
      });
        if (hasAnyMedia(currentMediaState())) void createOfferForPeer(peer.peerId);
      });
      setSocketReady(true);
      setJoined(true);
      setStatus(peers.length ? `Connected with ${peers.length} room peer${peers.length === 1 ? "" : "s"}.` : "Connected. Waiting for room peers.");
      return;
    }

    if (event.type === "wtf_live_peer_joined" && event.peer?.peerId) {
      ensurePeerConnection(event.peer.peerId);
      upsertRemotePeer({
        peerId: event.peer.peerId,
        guestName: event.peer.guestName,
        mediaState: event.peer.mediaState,
      });
      if (hasAnyMedia(currentMediaState())) void createOfferForPeer(event.peer.peerId);
      return;
    }

    if (event.type === "wtf_live_peer_left" && event.peerId) {
      removeRemotePeer(event.peerId);
      return;
    }

    if (event.type === "wtf_live_media_state" && event.peerId) {
      upsertRemotePeer({
        peerId: event.peerId,
        guestName: event.guestName,
        mediaState: event.mediaState,
      });
      return;
    }

    if (event.type === "wtf_live_signal") {
      void handleSignal(event.fromPeerId, event.signal);
      return;
    }

    if (event.type === "wtf_live_chat_message" && typeof event.message === "object" && event.message) {
      const liveMessage = event.message as LiveChatMessage;
      setLiveMessages((current) => {
        if (current.some((message) => message.id === liveMessage.id)) return current;
        return [...current, liveMessage].slice(-120);
      });
      return;
    }

    if (event.type === "error") {
      setStatus(event.messageText || (typeof event.message === "string" ? event.message : "WTF LIVE room error."));
    }
  }

  function connectRoomSocket(name: string) {
	    socketRef.current?.close();
	    for (const connection of peerConnectionsRef.current.values()) connection.close();
	    peerConnectionsRef.current.clear();
	    remoteStreamsRef.current.clear();
	    statsSamplesRef.current.clear();
	    lastMediaStateRef.current = { mic: false, audioOpen: false, camera: false, screen: false, activeVideo: null, avatarUrl };
	    setRemotePeers([]);
	    setPeerDiagnostics({});
	    setSocketReady(false);

    const socket = new WebSocket(liveSocketUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      sendRoomSocket({
        type: "wtf_live_join_room",
        roomId,
        guestName: name,
        mediaState: currentMediaState(),
      });
    };
    socket.onmessage = (rawEvent) => {
      try {
        handleSocketEvent(JSON.parse(String(rawEvent.data)) as WtfLiveSocketEvent);
      } catch {
        setStatus("Received an unreadable room event.");
      }
    };
    socket.onerror = () => {
      setStatus("Room connection failed.");
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      setSocketReady(false);
      setJoined(false);
      setStatus("Room connection closed.");
    };
  }

  function publishMediaState() {
    sendRoomSocket({
      type: "wtf_live_media_state",
      mediaState: currentMediaState(),
    });
  }

	  useEffect(() => {
	    if (!joined || !socketReady) return;
	    const previousMediaState = lastMediaStateRef.current;
	    const nextMediaState = currentMediaState();
	    publishMediaState();
	    const needsRenegotiation =
	      previousMediaState.mic !== nextMediaState.mic ||
	      previousMediaState.camera !== nextMediaState.camera ||
	      previousMediaState.screen !== nextMediaState.screen ||
	      previousMediaState.activeVideo !== nextMediaState.activeVideo;
	    if (needsRenegotiation) {
	      void renegotiateAllPeers();
	    }
	    lastMediaStateRef.current = nextMediaState;
	  }, [activeVideoSource, avatarUrl, joined, localAudioOpen, socketReady, micStream, cameraStream, screenStream]);

	  useEffect(() => {
	    if (!joined || !socketReady) return;
	    let cancelled = false;
	    const readStats = async () => {
	      for (const [remotePeerId, connection] of peerConnectionsRef.current) {
	        try {
	          const report = await connection.getStats();
	          if (cancelled) return;
	          let inboundBytes = 0;
	          let outboundBytes = 0;
	          let packetsLost = 0;
	          let rttMs: number | null = null;
	          report.forEach((rawStat) => {
	            const stat = rawStat as unknown as Record<string, unknown>;
	            if (stat.type === "candidate-pair" && (stat.selected || (stat.nominated && stat.state === "succeeded"))) {
	              const rtt = Number(stat.currentRoundTripTime);
	              if (Number.isFinite(rtt)) rttMs = Math.round(rtt * 1000);
	            }
	            if (stat.type === "inbound-rtp" && stat.kind !== "audio-remote") {
	              const bytes = Number(stat.bytesReceived);
	              if (Number.isFinite(bytes)) inboundBytes += bytes;
	              const lost = Number(stat.packetsLost);
	              if (Number.isFinite(lost)) packetsLost += lost;
	            }
	            if (stat.type === "outbound-rtp") {
	              const bytes = Number(stat.bytesSent);
	              if (Number.isFinite(bytes)) outboundBytes += bytes;
	            }
	          });
	          const now = performance.now();
	          const previous = statsSamplesRef.current.get(remotePeerId);
	          statsSamplesRef.current.set(remotePeerId, { timestamp: now, inboundBytes, outboundBytes });
	          const seconds = previous ? Math.max((now - previous.timestamp) / 1000, 0.001) : 0;
	          updatePeerDiagnostic(remotePeerId, {
	            connectionState: connection.connectionState,
	            iceConnectionState: connection.iceConnectionState,
	            signalingState: connection.signalingState,
	            rttMs,
	            inboundKbps: previous ? Math.max(0, Math.round(((inboundBytes - previous.inboundBytes) * 8) / 1000 / seconds)) : null,
	            outboundKbps: previous ? Math.max(0, Math.round(((outboundBytes - previous.outboundBytes) * 8) / 1000 / seconds)) : null,
	            packetsLost,
	          });
	        } catch {
	          updatePeerDiagnostic(remotePeerId, {
	            connectionState: connection.connectionState,
	            iceConnectionState: connection.iceConnectionState,
	            signalingState: connection.signalingState,
	          });
	        }
	      }
	    };
	    void readStats();
	    const interval = window.setInterval(() => void readStats(), 2500);
	    return () => {
	      cancelled = true;
	      window.clearInterval(interval);
	    };
	  }, [joined, socketReady, remotePeers.length]);

  async function copyRoomUrl() {
    await navigator.clipboard?.writeText(roomUrl);
    setStatus("Room URL copied.");
  }

  function joinRoom() {
    const name = guestName.trim() || "guest";
    localStorage.setItem("wtf-live:guest-name", name);
    setGuestName(name);
    setJoined(true);
    setStatus(`Connecting as ${name}...`);
    connectRoomSocket(name);
  }

  function leaveRoom() {
    resetRoomSession("Left room.");
  }

  function closeRoomWindow() {
    resetRoomSession("Closing room window...");
    window.close();
    window.setTimeout(() => {
      if (!window.closed) setStatus("Left room. Browser blocked auto-close; close this tab when ready.");
    }, 150);
  }

  async function toggleMic() {
    if (micStream) {
      stopStream(micStream);
      setMicStream(null);
      setStatus("Mic off.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      setStatus("Mic ready.");
    } catch {
      setStatus("Mic permission was blocked.");
    }
  }

  async function toggleCamera() {
    if (cameraStream) {
      stopStream(cameraStream);
      setCameraStream(null);
      setActiveVideoSource((current) =>
        current === "camera" ? resolveActiveVideoSource({ cameraStream: null, screenStream }, "screen") : current,
      );
      setStatus("Camera off.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setCameraStream(stream);
      setActiveVideoSource((current) => current ?? "camera");
      setStatus("Camera ready.");
    } catch {
      setStatus("Camera permission was blocked.");
    }
  }

  async function toggleScreen() {
    if (screenStream) {
      stopStream(screenStream);
      setScreenStream(null);
      setActiveVideoSource((current) =>
        current === "screen" ? resolveActiveVideoSource({ cameraStream, screenStream: null }, "camera") : current,
      );
      setStatus("Screen share off.");
      return;
    }
    const getDisplayMedia = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
    if (!getDisplayMedia) {
      setStatus("Screen share is not available in this browser.");
      return;
    }
    try {
      const stream = await getDisplayMedia({ video: true, audio: true });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenStream(null);
        setActiveVideoSource((current) =>
          current === "screen" ? resolveActiveVideoSource({ cameraStream, screenStream: null }, "camera") : current,
        );
        setStatus("Screen share ended.");
      });
      setScreenStream(stream);
      setActiveVideoSource("screen");
      setStatus("Screen share ready.");
    } catch {
      setStatus("Screen share was cancelled.");
    }
  }

  function selectActiveVideoSource(source: Exclude<ActiveVideoSource, null>) {
    const canSelect = source === "camera" ? hasLiveTrack(cameraStream, "video") : hasLiveTrack(screenStream, "video");
    if (!canSelect) {
      setStatus(source === "camera" ? "Turn camera on before sharing it." : "Start screen share before sharing it.");
      return;
    }
    setActiveVideoSource(source);
    setStatus(source === "camera" ? "Sharing camera to the room." : "Sharing screen to the room.");
  }

  async function handleAvatarInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const nextAvatarUrl = await readAvatarImage(file);
      localStorage.setItem("wtf-live:avatar-url", nextAvatarUrl);
      setAvatarUrl(nextAvatarUrl);
      setStatus("Avatar updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update avatar.");
    }
  }

  function clearAvatar() {
    localStorage.removeItem("wtf-live:avatar-url");
    setAvatarUrl(null);
    setStatus("Avatar cleared.");
  }

  async function handleAttachmentInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const slots = MAX_LIVE_CHAT_ATTACHMENTS - chatAttachments.length;
    if (slots <= 0) {
      setStatus("Remove a media item before attaching another.");
      return;
    }
    try {
      const attachments = await Promise.all(files.slice(0, slots).map((file) => readAttachment(file)));
      setChatAttachments((current) => [...current, ...attachments].slice(0, MAX_LIVE_CHAT_ATTACHMENTS));
      setStatus("Media attached.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not attach media.");
    }
  }

  function removeAttachment(attachmentId: string) {
    setChatAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

	  function sendLiveChat() {
	    const text = chatText.trim();
	    if (!text && chatAttachments.length === 0) {
	      setStatus("Type a message or attach media first.");
      return;
    }
    if (!socketReady || !sendRoomSocket({ type: "wtf_live_chat_message", text, attachments: chatAttachments })) {
      setStatus("Room chat is not connected.");
      return;
    }
	    setChatText("");
	    setChatAttachments([]);
	  }

	  function scrollChatToBottom() {
	    const node = chatLogRef.current;
	    if (!node) return;
	    node.scrollTop = node.scrollHeight;
	    chatNearBottomRef.current = true;
	    setNewMessageCount(0);
	  }

	  function handleChatScroll() {
	    const node = chatLogRef.current;
	    if (!node) return;
	    chatNearBottomRef.current = isNearScrollBottom(node);
	    if (chatNearBottomRef.current) setNewMessageCount(0);
	  }

	  const totalChatItems = liveMessages.length + (messagesQuery.data?.messages ?? []).length;

	  useEffect(() => {
	    const previousCount = lastChatItemCountRef.current;
	    lastChatItemCountRef.current = totalChatItems;
	    if (totalChatItems <= previousCount) return;
	    const addedCount = totalChatItems - previousCount;
	    if (chatNearBottomRef.current || previousCount === 0) {
	      window.requestAnimationFrame(scrollChatToBottom);
	      return;
	    }
	    setNewMessageCount((current) => Math.min(99, current + addedCount));
	  }, [totalChatItems]);

	  function frameBasePosition(offset = popoutFrames.length) {
	    const width = Math.min(760, Math.max(360, Math.round(window.innerWidth * 0.54)));
	    const height = Math.min(520, Math.max(260, Math.round(window.innerHeight * 0.48)));
	    return {
	      x: Math.max(12, Math.min(window.innerWidth - width - 12, 72 + offset * 22)),
	      y: Math.max(12, Math.min(window.innerHeight - height - 12, 64 + offset * 18)),
	      width,
	      height,
	      maximized: false,
	    };
	  }

	  function upsertPopoutFrame(frame: PopoutFrame) {
	    setPopoutFrames((current) => {
	      const existing = current.find((item) => item.id === frame.id);
	      if (existing) return [...current.filter((item) => item.id !== frame.id), { ...existing, title: frame.title }];
	      return [...current, frame].slice(-4);
	    });
	  }

	  function openLocalPreview(source: "camera" | "screen") {
	    const stream = source === "camera" ? cameraStream : screenStream;
	    if (!stream) {
	      setStatus(source === "camera" ? "Turn camera on before opening preview." : "Start screen share before opening preview.");
	      return;
	    }
	    upsertPopoutFrame({
	      id: `local-${source}`,
	      title: source === "camera" ? "Local camera preview" : "Local screen preview",
	      kind: "stream",
	      streamScope: "local",
	      source,
	      ...frameBasePosition(),
	    });
	  }

	  function openStagePopout(peer: { peerId: string; guestName: string; mediaState: LiveMediaState }) {
	    if (!peer.mediaState.activeVideo) return;
	    upsertPopoutFrame({
	      id: `remote-${peer.peerId}-${peer.mediaState.activeVideo}`,
	      title: `${peer.guestName} ${peer.mediaState.activeVideo === "screen" ? "screen" : "camera"}`,
	      kind: "stream",
	      streamScope: peer.peerId === "self" ? "local" : "remote",
	      source: peer.mediaState.activeVideo,
	      peerId: peer.peerId === "self" ? undefined : peer.peerId,
	      ...frameBasePosition(),
	    });
	  }

	  function openAttachmentPopout(attachment: LiveChatAttachment) {
	    upsertPopoutFrame({
	      id: `attachment-${attachment.id}`,
	      title: attachment.name,
	      kind: "attachment",
	      attachment,
	      ...frameBasePosition(),
	    });
	  }

	  function closePopoutFrame(frameId: string) {
	    setPopoutFrames((current) => current.filter((frame) => frame.id !== frameId));
	  }

	  function togglePopoutMaximize(frameId: string) {
	    setPopoutFrames((current) =>
	      current.map((frame) => frame.id === frameId ? { ...frame, maximized: !frame.maximized } : frame),
	    );
	  }

	  function cyclePopoutSize(frameId: string) {
	    setPopoutFrames((current) =>
	      current.map((frame) => {
	        if (frame.id !== frameId || frame.maximized) return frame;
	        const wide = frame.width < 860;
	        return {
	          ...frame,
	          width: wide ? Math.min(window.innerWidth - 24, 980) : Math.min(window.innerWidth - 24, 560),
	          height: wide ? Math.min(window.innerHeight - 24, 640) : Math.min(window.innerHeight - 24, 360),
	        };
	      }),
	    );
	  }

	  function handlePopoutDragStart(event: ReactPointerEvent<HTMLElement>, frame: PopoutFrame) {
	    if (frame.maximized || event.button !== 0) return;
	    dragFrameRef.current = {
	      id: frame.id,
	      startX: event.clientX,
	      startY: event.clientY,
	      frameX: frame.x,
	      frameY: frame.y,
	    };
	    const moveFrame = (moveEvent: PointerEvent) => {
	      const drag = dragFrameRef.current;
	      if (!drag) return;
	      setPopoutFrames((current) =>
	        current.map((item) => {
	          if (item.id !== drag.id) return item;
	          const x = Math.max(8, Math.min(window.innerWidth - item.width - 8, drag.frameX + moveEvent.clientX - drag.startX));
	          const y = Math.max(8, Math.min(window.innerHeight - item.height - 8, drag.frameY + moveEvent.clientY - drag.startY));
	          return { ...item, x, y };
	        }),
	      );
	    };
	    const stopDrag = () => {
	      dragFrameRef.current = null;
	      window.removeEventListener("pointermove", moveFrame);
	      window.removeEventListener("pointerup", stopDrag);
	    };
	    window.addEventListener("pointermove", moveFrame);
	    window.addEventListener("pointerup", stopDrag, { once: true });
	  }

  if (roomQuery.isLoading) {
    return (
      <GuestShell>
        <RoomFrame>
          <TitleBar>WTF LIVE</TitleBar>
          <Panel style={{ margin: 10, placeItems: "center" }}>
            <Hourglass size={32} />
          </Panel>
        </RoomFrame>
      </GuestShell>
    );
  }

  if (!room) {
    return (
      <GuestShell>
        <RoomFrame>
          <TitleBar>WTF LIVE</TitleBar>
          <Panel style={{ margin: 10 }}>
            <strong>Room not found.</strong>
            <span>This room link is no longer available.</span>
          </Panel>
        </RoomFrame>
      </GuestShell>
    );
  }

  const messages = messagesQuery.data?.messages ?? [];
  const canSendChat = joined && socketReady && (Boolean(chatText.trim()) || chatAttachments.length > 0);
	  const localMediaState = mediaStateFromStreams({ micStream, cameraStream, screenStream, activeVideoSource, audioEnabled: localAudioOpen, avatarUrl });
	  const localStageStream = localMediaState.activeVideo
	    ? activeVideoStreamForSource(localMediaState.activeVideo, { cameraStream, screenStream })
	    : null;
	  const remoteStagePeers = remotePeers.filter((peer) => Boolean(peer.mediaState.activeVideo));
	  const stageCount = (joined && localMediaState.activeVideo ? 1 : 0) + remoteStagePeers.length;
	  const participantCount = remotePeers.length + (joined ? 1 : 0);
	  const openMicCount = remotePeers.filter((peer) => peer.mediaState.audioOpen).length + (localMediaState.audioOpen ? 1 : 0);
	  const activeShareLabel = activeVideoSource === "screen"
	    ? "Sharing screen"
	    : activeVideoSource === "camera"
	      ? "Sharing camera"
      : "No video shared";

  return (
    <GuestShell>
      <RoomFrame>
        <TitleBar>
          <RoomTitleBlock>
            <h1>{room.title}</h1>
            <span>{room.description || roomUrl}</span>
          </RoomTitleBlock>
	          <HeaderStatus>
	            {socketReady ? <Wifi size={15} aria-hidden /> : <WifiOff size={15} aria-hidden />}{" "}
	            <span>{joined ? (socketReady ? "Connected" : "Connecting") : "Public room"}</span>
	            <span>{joined ? guestName : "Guest setup"}</span>
	            <span>{peerId ? peerId.slice(0, 12) : "not joined"}</span>
	            <HeaderCloseButton aria-label="Close Window" onClick={closeRoomWindow} data-wtf-live-close-window>
	              <X size={15} aria-hidden />
	            </HeaderCloseButton>
	          </HeaderStatus>
        </TitleBar>
	        <RoomBody>
	          <ControlRail data-wtf-live-control-rail>
	            <SettingsGroup>
	              <LiveSectionHeader>
	                <span><Radio size={15} aria-hidden /> Room</span>
	                <ShareStatus>{participantCount} in room</ShareStatus>
	              </LiveSectionHeader>
	              <TextField
	                value={guestName}
	                placeholder="Display name"
	                fullWidth
	                disabled={joined}
	                onChange={(event: ChangeEvent<HTMLInputElement>) => setGuestName(event.target.value)}
	              />
	              <RoomActionGrid>
	                <Button primary aria-label="Join Room" disabled={joined} onClick={joinRoom} data-wtf-live-join-room>
	                  {joined ? "Joined" : "Join"}
	                </Button>
	                <Button aria-label="Copy URL" onClick={copyRoomUrl}>
	                  <ButtonLabel><Copy size={16} aria-hidden /> Copy</ButtonLabel>
	                </Button>
	                <Button aria-label="Leave Room" disabled={!joined} onClick={leaveRoom} data-wtf-live-leave-room>
	                  <ButtonLabel><LogOut size={16} aria-hidden /> Leave</ButtonLabel>
	                </Button>
	                <Button aria-label="Close Room Tab" onClick={closeRoomWindow}>
	                  <ButtonLabel><X size={16} aria-hidden /> Close</ButtonLabel>
	                </Button>
	              </RoomActionGrid>
	              <StatusLine aria-live="polite">{status}</StatusLine>
	            </SettingsGroup>

	            <SettingsGroup>
	              <LiveSectionHeader>
	                <span>Share</span>
	                <ShareStatus>{activeShareLabel}</ShareStatus>
	              </LiveSectionHeader>
	              <MediaButtonGrid>
	                <ControlButton
	                  disabled={!joined || !socketReady}
	                  $active={Boolean(micStream)}
	                  onClick={toggleMic}
	                  data-wtf-live-toggle-mic
	                >
	                  {micStream ? <Square aria-hidden /> : <Mic aria-hidden />} Mic
	                </ControlButton>
	                <ControlButton
	                  disabled={!joined || !socketReady || !micStream}
	                  $active={pushToTalk}
	                  onClick={() => {
	                    setPushToTalk((current) => !current);
	                    setPushHeld(false);
	                  }}
	                  data-wtf-live-push-to-talk-toggle
	                >
	                  <Mic aria-hidden /> PTT
	                </ControlButton>
	                <ControlButton
	                  disabled={!joined || !socketReady}
	                  $active={Boolean(cameraStream)}
	                  onClick={toggleCamera}
	                  data-wtf-live-toggle-camera
	                >
	                  {cameraStream ? <Square aria-hidden /> : <Camera aria-hidden />} Camera
	                </ControlButton>
	                <ControlButton
	                  disabled={!joined || !socketReady}
	                  $active={Boolean(screenStream)}
	                  onClick={toggleScreen}
	                  data-wtf-live-toggle-screen
	                >
	                  {screenStream ? <Square aria-hidden /> : <MonitorUp aria-hidden />} Screen
	                </ControlButton>
	              </MediaButtonGrid>
	              <ControlButton
	                disabled={!joined || !socketReady || !micStream || !pushToTalk}
	                $active={pushHeld}
	                onPointerDown={() => setPushHeld(true)}
	                onPointerUp={() => setPushHeld(false)}
	                onPointerCancel={() => setPushHeld(false)}
	                onPointerLeave={() => setPushHeld(false)}
	                onKeyDown={(event) => {
	                  if (event.key === " " || event.key === "Enter") setPushHeld(true);
	                }}
	                onKeyUp={() => setPushHeld(false)}
	                data-wtf-live-push-to-talk-hold
	              >
	                Hold to talk
	              </ControlButton>
	              <SharePicker data-wtf-live-active-share={activeVideoSource ?? "none"}>
	                <LiveSectionHeader>
	                  <span>Active video</span>
	                  <ShareStatus>{activeShareLabel}</ShareStatus>
	                </LiveSectionHeader>
	                <GuestGrid>
	                  <ControlButton
	                    disabled={!joined || !socketReady || !cameraStream}
	                    $active={activeVideoSource === "camera"}
	                    onClick={() => selectActiveVideoSource("camera")}
	                    data-wtf-live-share-camera
	                  >
	                    <Camera aria-hidden /> Camera
	                  </ControlButton>
	                  <ControlButton
	                    disabled={!joined || !socketReady || !screenStream}
	                    $active={activeVideoSource === "screen"}
	                    onClick={() => selectActiveVideoSource("screen")}
	                    data-wtf-live-share-screen
	                  >
	                    <MonitorUp aria-hidden /> Screen
	                  </ControlButton>
	                </GuestGrid>
	              </SharePicker>
	            </SettingsGroup>

	            <SettingsGroup>
	              <LiveSectionHeader>
	                <span><ImageIcon size={15} aria-hidden /> Local</span>
	                <ShareStatus>{labelForMediaState(localMediaState)}</ShareStatus>
	              </LiveSectionHeader>
	              <AvatarSettings>
	                <AvatarMark name={guestName || "guest"} avatarUrl={avatarUrl} size="small" />
	                <GuestGrid>
	                  <Button onClick={() => avatarInputRef.current?.click()} data-wtf-live-avatar-button>
	                    <ButtonLabel><ImageIcon size={16} aria-hidden /> Avatar</ButtonLabel>
	                  </Button>
	                  <Button disabled={!avatarUrl} onClick={clearAvatar} data-wtf-live-avatar-clear>
	                    <ButtonLabel><X size={16} aria-hidden /> Clear</ButtonLabel>
	                  </Button>
	                </GuestGrid>
	              </AvatarSettings>
	              <HiddenFileInput
	                ref={avatarInputRef}
	                data-wtf-live-avatar-file
	                type="file"
	                accept="image/png,image/jpeg,image/gif,image/webp"
	                onChange={handleAvatarInput}
	              />
	              {joined ? (
	                <MicMeter aria-label={`Mic level ${Math.round(micLevel * 100)} percent`}>
	                  <span>{pushToTalk ? "PTT" : "Mic"}</span>
	                  <MicMeterTrack>
	                    <MicMeterFill $level={localAudioOpen ? micLevel : 0} />
	                  </MicMeterTrack>
	                  <span>{localAudioOpen ? (micLevel > 0.04 ? "Live" : "Quiet") : micStream ? "Muted" : "Off"}</span>
	                </MicMeter>
	              ) : null}
	              <LocalPreviewDock>
	                <LiveSectionHeader>
	                  <span>Preview</span>
	                  <span>{activeShareLabel}</span>
	                </LiveSectionHeader>
	                <PreviewGrid>
	                  <PreviewBox
	                    $active={activeVideoSource === "camera"}
	                    data-wtf-live-local-preview="camera"
	                    onClick={() => openLocalPreview("camera")}
	                  >
	                    {cameraStream ? <PreviewVideo ref={cameraRef} muted autoPlay playsInline /> : <span>Camera</span>}
	                  </PreviewBox>
	                  <PreviewBox
	                    $active={activeVideoSource === "screen"}
	                    data-wtf-live-local-preview="screen"
	                    onClick={() => openLocalPreview("screen")}
	                  >
	                    {screenStream ? <PreviewVideo ref={screenRef} muted autoPlay playsInline /> : <span>Screen</span>}
	                  </PreviewBox>
	                </PreviewGrid>
	              </LocalPreviewDock>
	            </SettingsGroup>

	            {remotePeers.length ? (
	              <DiagnosticsPanel data-wtf-live-diagnostics-panel>
	                <LiveSectionHeader>
	                  <span><Activity size={14} aria-hidden /> Transport</span>
	                  <ShareStatus>{remotePeers.length} peer{remotePeers.length === 1 ? "" : "s"}</ShareStatus>
	                </LiveSectionHeader>
	                {remotePeers.slice(0, 4).map((peer) => {
	                  const diagnostic = peerDiagnostics[peer.peerId];
	                  return (
	                    <DiagnosticRow key={peer.peerId} data-wtf-live-peer-diagnostic={peer.peerId}>
	                      <span>{peer.guestName}</span>
	                      <HealthDot $health={diagnostic?.health ?? "connecting"} title={diagnosticSummary(diagnostic)}>
	                        {healthLabel(diagnostic?.health ?? "connecting")}
	                      </HealthDot>
	                    </DiagnosticRow>
	                  );
	                })}
	              </DiagnosticsPanel>
	            ) : null}
	          </ControlRail>

	          <StagePanel data-wtf-live-stage-area>
	            <StageHeader>
	              <span>Screen / camera stage</span>
	              <span>{stageCount ? `${stageCount} share${stageCount === 1 ? "" : "s"}` : "no video shared"}</span>
	            </StageHeader>
	            <StageGrid $count={stageCount} data-wtf-live-stage-grid>
	              {joined && localMediaState.activeVideo ? (
	                <StageParticipantTile
	                  id="self"
	                  name={guestName || "guest"}
	                  mediaState={localMediaState}
	                  stream={localStageStream}
	                  connected={socketReady}
	                  isSelf
	                  onOpen={() => openStagePopout({ peerId: "self", guestName: guestName || "guest", mediaState: localMediaState })}
	                />
	              ) : null}
              {remoteStagePeers.map((peer) => (
                <StageParticipantTile
                  key={peer.peerId}
                  id={peer.peerId}
                  name={peer.guestName}
	                  mediaState={peer.mediaState}
	                  stream={peer.stream}
	                  connected={peer.connected}
	                  onOpen={() => openStagePopout(peer)}
	                />
	              ))}
		              {!stageCount ? <EmptyStage>No screen or camera shared</EmptyStage> : null}
		            </StageGrid>
		            {remotePeers.map((peer) => (
		              <RemoteAudioSink key={`audio-${peer.peerId}`} peer={peer} />
		            ))}
		          </StagePanel>

	          <RoomSidebar data-wtf-live-sidebar>
	            <AttendancePanel
	              open={attendanceOpen}
	              onToggle={(event) => setAttendanceOpen(event.currentTarget.open)}
	              data-wtf-live-attendance-panel
	            >
	              <summary data-wtf-live-attendance-toggle>
	                <LiveSectionHeader>
	                  <span>
	                    {attendanceOpen ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
	                    <Users size={15} aria-hidden /> Attendance
	                  </span>
	                  <span>{participantCount} · {openMicCount} mic</span>
	                </LiveSectionHeader>
	              </summary>
	              <AttendanceList data-wtf-live-attendance-list>
	                {joined ? (
	                  <AttendeeRow
	                    $active={Boolean(localMediaState.activeVideo || localMediaState.audioOpen)}
	                    data-wtf-live-attendee="self"
	                    data-wtf-live-attendee-state={labelForMediaState(localMediaState).toLowerCase()}
	                  >
	                    <AvatarMark name={guestName || "guest"} avatarUrl={avatarUrl} size="small" />
	                    <strong>{guestName || "guest"} (you)</strong>
	                    <MicDot $active={localMediaState.audioOpen} $ready={localMediaState.mic} title={localMediaState.audioOpen ? "Mic live" : localMediaState.mic ? "Mic ready" : "Mic off"}>
	                      <Mic size={13} aria-hidden />
	                    </MicDot>
	                    <span>{labelForMediaState(localMediaState)}</span>
	                  </AttendeeRow>
	                ) : null}
	                {remotePeers.map((peer) => {
	                  const diagnostic = peerDiagnostics[peer.peerId];
	                  return (
	                    <AttendeeRow
	                      key={peer.peerId}
	                      $active={Boolean(peer.mediaState.activeVideo || peer.mediaState.audioOpen)}
	                      data-wtf-live-attendee={peer.peerId}
	                      data-wtf-live-attendee-state={labelForMediaState(peer.mediaState, peer.connected).toLowerCase()}
	                    >
	                      <AvatarMark name={peer.guestName} avatarUrl={peer.mediaState.avatarUrl} size="small" />
	                      <strong>{peer.guestName}</strong>
	                      <MicDot $active={peer.mediaState.audioOpen} $ready={peer.mediaState.mic} title={peer.mediaState.audioOpen ? "Mic live" : peer.mediaState.mic ? "Mic ready" : "Mic off"}>
	                        <Mic size={13} aria-hidden />
	                      </MicDot>
	                      <HealthDot $health={diagnostic?.health ?? (peer.connected ? "good" : "connecting")} title={diagnosticSummary(diagnostic)}>
	                        {healthLabel(diagnostic?.health ?? (peer.connected ? "good" : "connecting"))}
	                      </HealthDot>
	                    </AttendeeRow>
	                  );
	                })}
	                {!joined && !remotePeers.length ? <span>Join to appear here.</span> : null}
	              </AttendanceList>
	            </AttendancePanel>
	            <ChatColumn data-wtf-live-chat-column="true">
	              <LiveSectionHeader>
	                <span><MessageSquare size={15} aria-hidden /> Room chat</span>
	                <span>{liveMessages.length + messages.length} messages</span>
	              </LiveSectionHeader>
	              <MessageList ref={chatLogRef} onScroll={handleChatScroll} aria-label="WTF LIVE room chat" data-wtf-live-chat-log>
                {messagesQuery.isLoading ? <Hourglass size={24} /> : null}
                {liveMessages.map((message) => (
                  <MessageItem key={message.id} data-wtf-live-chat-message={message.id}>
                    <strong>{message.guestName}</strong>
                    <span>{formatDate(message.createdAt)}</span>
                    {message.text ? <div>{message.text}</div> : null}
                    {message.attachments.length ? (
                      <AttachmentStrip>
                        {message.attachments.map((attachment) => (
	                          <AttachmentPreview key={attachment.id} data-wtf-live-chat-attachment={attachment.id}>
	                            {attachment.kind === "video" ? (
	                              <video src={attachment.dataUrl} controls playsInline onClick={() => openAttachmentPopout(attachment)} />
	                            ) : (
	                              <img src={attachment.dataUrl} alt={attachment.name} onClick={() => openAttachmentPopout(attachment)} />
	                            )}
                            <span>{attachment.name} {formatFileSize(attachment.sizeBytes)}</span>
                          </AttachmentPreview>
                        ))}
                      </AttachmentStrip>
                    ) : null}
                  </MessageItem>
                ))}
                {messages.length ? <MessageDivider>Public AT room notes</MessageDivider> : null}
                {messages.length ? (
                  [...messages].reverse().map((message) => (
                    <MessageItem key={message.uri}>
                      <strong>{message.author?.displayName || message.author?.handle || "host"}</strong>
                      {formatDate(message.createdAt) ? <span>{formatDate(message.createdAt)}</span> : null}
                      <div>{message.text}</div>
                    </MessageItem>
                  ))
                ) : null}
                {!liveMessages.length && !messages.length ? <span>No room chat yet.</span> : null}
              </MessageList>
              {newMessageCount ? (
                <NewMessagesButton onClick={scrollChatToBottom} data-wtf-live-new-messages>
                  {newMessageCount} new
                </NewMessagesButton>
              ) : null}
              <ChatComposer data-wtf-live-chat-composer="true">
                <ChatTextArea
                  data-wtf-live-chat-text
                  disabled={!joined || !socketReady}
                  value={chatText}
                  maxLength={1200}
                  placeholder={socketReady ? "Type in the room" : "Join the room to chat"}
                  onChange={(event) => setChatText(event.target.value)}
                />
                {chatAttachments.length ? (
                  <AttachmentStrip>
                    {chatAttachments.map((attachment) => (
                      <AttachmentPreview key={attachment.id} data-wtf-live-chat-attachment={attachment.id}>
                        {attachment.kind === "video" ? (
                          <video src={attachment.dataUrl} controls playsInline onClick={() => openAttachmentPopout(attachment)} />
                        ) : (
                          <img src={attachment.dataUrl} alt={attachment.name} onClick={() => openAttachmentPopout(attachment)} />
                        )}
                        <span>{attachment.name} {formatFileSize(attachment.sizeBytes)}</span>
                        <Button onClick={() => removeAttachment(attachment.id)}>Remove</Button>
                      </AttachmentPreview>
                    ))}
                  </AttachmentStrip>
                ) : null}
                <HiddenFileInput
                  ref={fileInputRef}
                  data-wtf-live-chat-file
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/gif,video/mp4"
                  onChange={handleAttachmentInput}
                />
                <GuestGrid>
                  <Button
                    disabled={!joined || !socketReady || chatAttachments.length >= MAX_LIVE_CHAT_ATTACHMENTS}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ButtonLabel><Paperclip size={16} aria-hidden /> Media</ButtonLabel>
                  </Button>
                  <Button primary disabled={!canSendChat} onClick={sendLiveChat} data-wtf-live-chat-send>
                    <ButtonLabel><Send size={16} aria-hidden /> Send</ButtonLabel>
                  </Button>
                </GuestGrid>
              </ChatComposer>
            </ChatColumn>
          </RoomSidebar>
	        </RoomBody>
	      </RoomFrame>
	      {popoutFrames.length ? (
	        <FloatingLayer data-wtf-live-popout-layer>
	          {popoutFrames.map((frame) => {
	            if (frame.kind === "attachment") {
	              return (
	                <FloatingAttachmentWindow
	                  key={frame.id}
	                  frame={frame}
	                  onClose={closePopoutFrame}
	                  onToggleMaximize={togglePopoutMaximize}
	                  onCycleSize={cyclePopoutSize}
	                  onDragStart={handlePopoutDragStart}
	                />
	              );
	            }
	            const stream = frame.streamScope === "local"
	              ? frame.source === "camera"
	                ? cameraStream
	                : screenStream
	              : remoteStreamsRef.current.get(frame.peerId ?? "") ?? remotePeers.find((peer) => peer.peerId === frame.peerId)?.stream ?? null;
	            return (
	              <FloatingStreamWindow
	                key={frame.id}
	                frame={frame}
	                stream={stream}
	                onClose={closePopoutFrame}
	                onToggleMaximize={togglePopoutMaximize}
	                onCycleSize={cyclePopoutSize}
	                onDragStart={handlePopoutDragStart}
	              />
	            );
	          })}
	        </FloatingLayer>
	      ) : null}
	    </GuestShell>
	  );
	}
