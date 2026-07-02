import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bold, Camera, Check, ChevronDown, ChevronRight, Copy, ExternalLink, FileAudio, Gauge, Gift, Image as ImageIcon, Italic, LogOut, Maximize2, MessageSquare, Mic, MonitorUp, Move, Music2, Paperclip, Pause, Pin, Play, Radio, RotateCcw, Send, Settings, Smile, Square, Type as TypeIcon, UserPlus, Users, Volume2, VolumeX, Wifi, WifiOff, X } from "lucide-react";
import styled from "styled-components";
import { Button, Hourglass, TextField } from "react95";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { presentationRouteHref, usePresentationShell } from "../../lib/presentation-shell";
import { FONT_PACKS, getFontPack } from "../appearance/font-packs";
import {
  DEFAULT_DESKTOP_APPEARANCE,
  DESKTOP_WTF_LIVE_CHAT_COLOR_LABELS,
  DESKTOP_WTF_LIVE_CHAT_COLOR_VALUES,
  DESKTOP_WTF_LIVE_CHAT_COLORS,
  DESKTOP_WTF_LIVE_CHAT_FONT_LABELS,
  DESKTOP_WTF_LIVE_CHAT_FONTS,
  DESKTOP_WTF_LIVE_CHAT_SIZES,
  normalizeDesktopWtfLiveChatStyle,
  type DesktopAppearance,
  type DesktopFontPackKey,
  type DesktopWtfLiveChatColor,
  type DesktopWtfLiveChatFont,
  type DesktopWtfLiveChatStyle,
} from "@shared/desktop";
import {
  isWtfLiveShortcutEventTargetEditable,
  normalizeWtfLiveSoundboardClip,
  normalizeWtfLiveSoundboardSettings,
  playWtfLiveSoundboardClip,
  readWtfLiveSoundboardSettings,
  shortcutFromWtfLiveKeyboardEvent,
  volumeToAudioGain,
  wtfLiveSoundboardStorageKey,
  type WtfLiveSoundboardClip,
  type WtfLiveSoundboardSettings,
} from "./soundboard";

type PublicRoom = {
  id: string;
  title: string;
  kind: "room" | "stage";
  description?: string;
  source?: "system" | "user";
  ownerUserId?: number | null;
  accessMode?: "public" | "private";
  isPublic?: boolean;
};

type StageRoomRole = "owner" | "host" | "speaker" | "audience";

type StagePermissionMember = {
  userId: number;
  username: string;
  displayName?: string | null;
  role: "host" | "speaker";
};

type PublicRoomResponse = {
  room: PublicRoom;
  joinMode: "guest_room_only" | "wtf_user_private_room" | "wtf_live_stage";
  roomPath: string;
  capabilities?: {
    audio?: boolean;
    camera?: boolean;
    screen?: boolean;
    media?: boolean;
    transport?: string;
    stage?: boolean;
    showKit?: boolean;
    canManageRoom?: boolean;
    roomRole?: "owner" | "host" | "guest" | "audience";
    canManageStage?: boolean;
    canSpeakOnStage?: boolean;
    stageRole?: StageRoomRole;
  };
  stagePermissions?: {
    role: StageRoomRole;
    canManage: boolean;
    canSpeak: boolean;
    hosts: StagePermissionMember[];
    speakers: StagePermissionMember[];
  };
};

type LiveTipItem = {
  sku: string;
  name: string;
  quantityOwned: number;
  metadata?: Record<string, unknown>;
};

type LiveTipMarketResponse = {
  items: LiveTipItem[];
};

type LiveTipResponse = {
  ok: true;
  transfer: {
    id: number;
    sku: string;
    quantity: number;
  };
  item: {
    sku: string;
    name: string;
    redeemWtf: number;
  };
  receiver: {
    id: number;
    username: string;
    displayName?: string | null;
  };
  senderRemainingQuantity: number;
};

type RoomMessage = {
  uri: string;
  text: string;
  createdAt: string | null;
  author?: { handle?: string; displayName?: string | null };
};

type ActiveVideoSource = "camera" | "screen" | null;
type StageSource = "camera" | "screen" | "media";

type LiveMediaState = {
  mic: boolean;
  audioOpen: boolean;
  camera: boolean;
  screen: boolean;
  screenAudio: boolean;
  mediaVideo: boolean;
  mediaAudio: boolean;
  mediaName: string | null;
  soundboard: boolean;
  activeVideo: ActiveVideoSource;
  cameraTrackId: string | null;
  screenTrackId: string | null;
  mediaVideoTrackId: string | null;
  mediaAudioTrackId: string | null;
  avatarUrl: string | null;
};

type MediaDeckState = {
  name: string;
  kind: "audio" | "video";
  objectUrl: string;
  stream: MediaStream;
  playing: boolean;
  loop: boolean;
  muted: boolean;
  volume: number;
  duration: number | null;
  currentTime: number;
};

type StageEntry = {
  id: string;
  peerId: string;
  name: string;
  source: StageSource;
  mediaState: LiveMediaState;
  stream: MediaStream | null;
  connected: boolean;
  isSelf?: boolean;
  title: string;
};

type LivePeer = {
  peerId: string;
  guestName: string;
  userId?: number | null;
  username?: string | null;
  isWtfUser?: boolean;
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

type BentoPanelId = "connection" | "sharing" | "screens" | "attendance" | "chat";

type PopoutFrame =
  | {
      id: string;
      title: string;
      kind: "stream";
      streamScope: "local" | "remote";
      source: StageSource | "active";
      peerId?: string;
      x: number;
      y: number;
      width: number;
      height: number;
      maximized: boolean;
      pinned: boolean;
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
      pinned: boolean;
    }
  | {
      id: string;
      title: string;
      kind: "panel";
      panel: BentoPanelId;
      x: number;
      y: number;
      width: number;
      height: number;
      maximized: boolean;
      pinned: boolean;
    };

type LiveChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "video";
  dataUrl: string;
  sizeBytes: number;
};

type LiveChatFont = DesktopWtfLiveChatFont;
type LiveChatColor = DesktopWtfLiveChatColor;
type LiveChatStyle = DesktopWtfLiveChatStyle;
type MicDiagnosticStatus = "idle" | "checking" | "ok" | "warn" | "blocked" | "unsupported";
type MicPermissionProbeState = PermissionState | "unsupported" | "unknown";

type MicDiagnosticState = {
  status: MicDiagnosticStatus;
  headline: string;
  detail: string;
  browserLabel: string;
  permissionLabel: string;
  deviceLabel: string;
};

type DesktopSettingsResponse = {
  appearance: DesktopAppearance;
  updatedAt: string | null;
};

type LiveChatMessage = {
  id: string;
  peerId: string;
  guestName: string;
  text: string;
  style?: LiveChatStyle;
  attachments: LiveChatAttachment[];
  createdAt: string;
};

type LiveRoomReaction = {
  id: string;
  peerId: string;
  guestName: string;
  emoji: string;
  label: string;
  createdAt: number;
};

type WtfLiveSocketEvent = {
  type?: string;
  peerId?: string;
  fromPeerId?: string;
  guestName?: string;
  userId?: number | null;
  username?: string | null;
  isWtfUser?: boolean;
  roomId?: string;
  peers?: Array<{ peerId?: string; guestName?: string; userId?: number | null; username?: string | null; isWtfUser?: boolean; mediaState?: Partial<LiveMediaState> }>;
  peer?: { peerId?: string; guestName?: string; userId?: number | null; username?: string | null; isWtfUser?: boolean; mediaState?: Partial<LiveMediaState> };
  mediaState?: Partial<LiveMediaState>;
  signal?: {
    kind?: "description" | "candidate";
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
  message?: LiveChatMessage | string;
  reaction?: {
    id?: string;
    peerId?: string;
    guestName?: string;
    emoji?: string;
    label?: string;
    createdAt?: string | number;
  };
  soundboardClip?: WtfLiveSoundboardClip;
  delivery?: "webrtc";
  triggeredByName?: string;
  triggeredByPeerId?: string;
  error?: string;
  messageText?: string;
};

type SoundboardSettingsResponse = WtfLiveSoundboardSettings & {
  storage?: string;
};

type RoomShowKitResponse = {
  settings: WtfLiveSoundboardSettings & { storage?: string };
  kit: {
    id: number;
    kitId: string;
    name: string;
    description: string;
    clipCount: number;
  } | null;
  roomSettings?: {
    showKitEnabled?: boolean;
    showKitName?: string | null;
  };
};

type RuntimeRoomSettings = {
  allowGuestAudio: boolean;
  allowGuestCamera: boolean;
  allowGuestScreen: boolean;
  allowGuestMedia: boolean;
  showKitEnabled: boolean;
  showKitId: number | null;
};

type RuntimeShowKit = {
  id: number;
  name: string;
  clipCount: number;
};

const DEFAULT_RUNTIME_ROOM_SETTINGS: RuntimeRoomSettings = {
  allowGuestAudio: true,
  allowGuestCamera: true,
  allowGuestScreen: true,
  allowGuestMedia: true,
  showKitEnabled: true,
  showKitId: null,
};

const LIVE_CHAT_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "video/mp4"]);
const LIVE_AVATAR_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const LIVE_MEDIA_DECK_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm", "video/mp4", "video/webm"]);
const LIVE_MEDIA_DECK_ACCEPT = Array.from(LIVE_MEDIA_DECK_TYPES).join(",");
const MAX_LIVE_MEDIA_DECK_BYTES = 100 * 1024 * 1024;
const MAX_LIVE_CHAT_ATTACHMENTS = 4;
const MAX_LIVE_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_LIVE_AVATAR_BYTES = 512 * 1024;
const MAX_LIVE_AVATAR_DATA_URL_LENGTH = Math.ceil(MAX_LIVE_AVATAR_BYTES * 1.4);
const LIVE_CHAT_FONT_SIZES = DESKTOP_WTF_LIVE_CHAT_SIZES;
const WTF_LIVE_CHAT_DEFAULT_FONT_STORAGE_KEY = "wtf-live:room-default-font-pack";
const WTF_LIVE_DEFAULT_FONT_PACK: DesktopFontPackKey = "classic-95";
const WTF_LIVE_ROOM_FONT_PACKS = FONT_PACKS.filter((pack) => pack.key !== "mek-type");
const CLASSIC_95_FONT_PACK = getFontPack("classic-95");
const TERMINAL_FONT_PACK = getFontPack("terminal");
const SERIF_PRESS_FONT_PACK = getFontPack("serif-press");
const LIVE_CHAT_FONT_OPTIONS: Array<{ id: LiveChatFont; label: string; family: string }> = [
  { id: "classic-95", label: DESKTOP_WTF_LIVE_CHAT_FONT_LABELS["classic-95"], family: CLASSIC_95_FONT_PACK.roles.app },
  { id: "terminal", label: DESKTOP_WTF_LIVE_CHAT_FONT_LABELS.terminal, family: TERMINAL_FONT_PACK.roles.mono },
  { id: "serif-press", label: DESKTOP_WTF_LIVE_CHAT_FONT_LABELS["serif-press"], family: SERIF_PRESS_FONT_PACK.roles.app },
];
const LIVE_CHAT_COLOR_OPTIONS: Array<{ id: LiveChatColor; label: string; value: string }> =
  DESKTOP_WTF_LIVE_CHAT_COLORS.map((color) => ({
    id: color,
    label: DESKTOP_WTF_LIVE_CHAT_COLOR_LABELS[color],
    value: DESKTOP_WTF_LIVE_CHAT_COLOR_VALUES[color],
  }));
const LIVE_CHAT_EMOJI_OPTIONS = [
  "😀",
  "😂",
  "😍",
  "😎",
  "😮",
  "😭",
  "😡",
  "👍",
  "👏",
  "🙌",
  "🔥",
  "✨",
  "💯",
  "❤️",
  "💀",
  "👀",
  "🎉",
  "🚀",
  "🫡",
  "🤯",
  "🤌",
  "🧠",
] as const;
const LIVE_ROOM_REACTION_OPTIONS = [
  { emoji: "👏", label: "Applause" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "😂", label: "Laugh" },
  { emoji: "😮", label: "Wow" },
  { emoji: "❤️", label: "Love" },
  { emoji: "👀", label: "Watching" },
] as const;
const LIVE_ROOM_REACTION_EMOJIS = new Set<string>(LIVE_ROOM_REACTION_OPTIONS.map((option) => option.emoji));
const DEFAULT_LIVE_CHAT_STYLE: LiveChatStyle = DEFAULT_DESKTOP_APPEARANCE.wtfLiveChatStyle;
const WTF_LIVE_CLASSIC_FONT_STACK = `"MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
const PEER_CONNECTION_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};
const BENTO_PANEL_ORDER: BentoPanelId[] = ["connection", "sharing", "screens", "attendance", "chat"];
const BENTO_PANEL_LABELS: Record<BentoPanelId, string> = {
  connection: "Connection",
  sharing: "Sharing",
  screens: "Screens",
  attendance: "Attendance",
  chat: "Room chat",
};

function parseStageUsernames(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((username) => username.replace(/^@/, "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

const GuestShell = styled.main`
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
    linear-gradient(180deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
    #087f7b;
  background-size: 18px 18px;
  color: #07120f;
  font-family: ${WTF_LIVE_CLASSIC_FONT_STACK};
  display: grid;
  place-items: stretch;
  padding: clamp(6px, 1vw, 14px);
  box-sizing: border-box;
  overflow: hidden;

  @media (max-width: 980px) {
    display: block;
    padding: 6px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
`;

const RoomFrame = styled.section`
  width: min(1800px, 100%);
  height: calc(100vh - clamp(12px, 2vw, 28px));
  min-height: 520px;
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 2px outset #fff;
  background: rgba(233, 233, 233, 0.64);
  box-shadow: 7px 9px 0 rgba(0, 0, 0, 0.38);
  overflow: hidden;
  backdrop-filter: blur(2px);

  @media (max-width: 980px) {
    display: block;
    height: auto;
    min-height: calc(100vh - 12px);
    min-height: calc(100dvh - 12px);
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
    font-size: var(--wtf-type-caption, 13px);
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
  font-size: var(--wtf-type-caption, 13px);
  text-align: right;
`;

const HeaderCloseButton = styled(Button)`
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 520px) {
    min-width: 44px;
    min-height: 44px;
  }
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

  @media (max-width: 820px) {
    order: 1;
    height: auto;
    min-height: auto;
    max-height: none;
    overflow: visible;
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

const StagePolicyPanel = styled.div`
  border: 2px outset #fff;
  background: #fff8d6;
  color: #121212;
  padding: 6px;
  display: grid;
  gap: 6px;
  min-width: 0;
  font-size: var(--wtf-type-caption, 13px);
`;

const StageRoleField = styled.label`
  display: grid;
  gap: 4px;
  min-width: 0;
  font-weight: 700;
`;

const StageRoleTextArea = styled.textarea`
  width: 100%;
  min-height: 58px;
  border: 2px inset #fff;
  padding: 5px;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;
`;

const BentoWorkspace = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(168px, auto);
  grid-auto-flow: dense;
  gap: 8px;
  padding: 8px;
  min-height: 0;
  overflow: auto;
  background: rgba(8, 127, 123, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-height: auto;
    overflow: visible;
    ${ControlRail} {
      height: auto;
      min-height: auto;
      max-height: none;
      overflow: visible;
    }
  }

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
    min-height: auto;
    overflow: visible;
    padding: 6px;

    ${ControlRail} {
      height: auto;
      min-height: auto;
      max-height: none;
      overflow: visible;
    }
  }
`;

const BentoTile = styled.section<{ $panel: BentoPanelId; $dragging?: boolean }>`
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 4px;
  opacity: ${({ $dragging }) => ($dragging ? 0.62 : 1)};
  transition: opacity 120ms ease, transform 120ms ease;
  ${({ $panel }) => {
    if ($panel === "connection") return "grid-column: 1; grid-row: 1;";
    if ($panel === "sharing") return "grid-column: 1; grid-row: 2 / span 2;";
    if ($panel === "screens") return "grid-column: 2 / span 2; grid-row: 1 / span 3;";
    if ($panel === "chat") return "grid-column: 4; grid-row: 1 / span 3;";
    return "grid-column: 1; grid-row: 4;";
  }}

  > [data-wtf-live-control-rail],
  > [data-wtf-live-stage-area],
  > [data-wtf-live-attendance-panel],
  > [data-wtf-live-chat-column] {
    height: 100%;
  }

  > [data-wtf-live-stage-area] {
    min-height: 420px;
  }

  @media (max-width: 980px) {
    grid-column: span 1;
    grid-row: span 1;

    > [data-wtf-live-stage-area] {
      min-height: min(72vh, 620px);
    }
  }

  @media (max-width: 820px) {
    > [data-wtf-live-stage-area] {
      min-height: 0;
      height: clamp(280px, 48dvh, 430px);
    }
  }
`;

const BentoTileHeader = styled.div`
  border: 2px outset #fff;
  background: rgba(230, 230, 230, 0.86);
  color: #07120f;
  min-height: 30px;
  padding: 3px 5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const BentoTileActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;

  button {
    min-width: 30px;
    min-height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 6px;
  padding: 6px;
  min-height: 0;
  overflow: hidden;

  @media (max-width: 980px) {
    order: 1;
    min-height: min(72vh, 620px);
  }

  @media (max-width: 820px) {
    order: 2;
    height: clamp(280px, 48dvh, 430px);
    min-height: 0;
  }
`;

const StageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 24px;
  font-size: var(--wtf-type-caption, 13px);
  color: #dff7ff;
`;

const RoomReactionDock = styled.div`
  border: 2px outset #2f4a43;
  background: #162721;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px;
  min-height: 40px;
  box-sizing: border-box;
  overflow-x: auto;
`;

const RoomReactionButton = styled.button`
  min-width: 34px;
  width: 34px;
  height: 30px;
  border: 2px outset #fff;
  background: #f2efe1;
  color: #07120f;
  display: grid;
  place-items: center;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  flex: 0 0 auto;

  &:active {
    border-style: inset;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &:focus-visible {
    outline: 2px solid #f5d45d;
    outline-offset: 1px;
  }
`;

const StageGridShell = styled.div`
  position: relative;
  display: grid;
  min-height: 0;
  overflow: hidden;
`;

const ScreenGridShell = styled.div`
  border: 2px outset #2f4a43;
  background: #050505;
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  grid-auto-rows: minmax(180px, 1fr);
  min-height: 240px;
  padding: 4px;
  overflow: auto;
`;

const ScreenGridItem = styled.div`
  position: relative;
  border: 1px solid #565656;
  background: #090909;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;

  &:hover [data-wtf-live-grid-popout],
  &:focus-within [data-wtf-live-grid-popout] {
    opacity: 1;
    pointer-events: auto;
  }
`;

const ScreenGridPopoutButton = styled.button`
  position: absolute;
  top: 7px;
  right: 7px;
  z-index: 4;
  width: 30px;
  height: 30px;
  border: 2px outset #fff;
  background: #f2f2f2;
  color: #07120f;
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;

  &:active {
    border-style: inset;
  }
`;

const ReactionBurstLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  overflow: hidden;
`;

const ReactionBurst = styled.div`
  position: absolute;
  bottom: 12px;
  transform: translateX(-50%);
  min-width: 48px;
  display: grid;
  justify-items: center;
  gap: 1px;
  color: #fff;
  text-shadow: 0 1px 2px #000;
  animation: wtf-live-reaction-rise 2.8s ease-out forwards;

  span {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 2px outset rgba(255, 255, 255, 0.85);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.68);
    font-size: 27px;
    line-height: 1;
  }

  small {
    max-width: 96px;
    padding: 1px 4px;
    border: 1px solid rgba(255, 255, 255, 0.5);
    background: rgba(0, 0, 0, 0.62);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    line-height: 1.25;
  }

  @keyframes wtf-live-reaction-rise {
    0% {
      opacity: 0;
      transform: translate(-50%, 18px) scale(0.88);
    }
    14% {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -128px) scale(1.16);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 1.6s;
    transform: translateX(-50%);
  }
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
    grid-auto-rows: minmax(220px, 1fr);
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

  @media (max-width: 820px) {
    &[open] {
      grid-template-rows: auto minmax(0, 168px);
    }
  }
`;

const ChatColumn = styled(SidebarPanel)`
  grid-template-rows: auto minmax(0, 1fr) auto;

  @media (max-width: 980px) {
    min-height: 420px;
  }

  @media (max-width: 820px) {
    min-height: 0;
    grid-template-rows: auto minmax(160px, min(34dvh, 260px)) auto;
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
    min-height: 32px !important;
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;

    button {
      min-height: 44px !important;
    }
  }
`;

const MediaButtonGrid = styled(GuestGrid)`
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 520px) {
    grid-template-columns: 1fr;

    button {
      min-height: 44px !important;
    }
  }
`;

const SharingTrayActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 4px;

  button {
    min-width: 32px;
    min-height: 30px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
`;

const SharingDrawer = styled.div`
  display: grid;
  gap: 6px;
  min-width: 0;

  &[hidden] {
    display: none;
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

const SoundboardButtonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const SoundboardButton = styled(ControlButton)`
  justify-content: stretch;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  padding-inline: 7px;
  min-width: 0;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    grid-column: 2;
    color: #555;
    font-size: var(--wtf-type-caption, 12px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const SoundboardBroadcastStatus = styled.div`
  border: 2px inset #fff;
  background: #fff8d6;
  color: #151515;
  padding: 5px 7px;
  min-height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--wtf-type-caption, 13px);
`;

const MediaDeckPanel = styled.div`
  border: 2px inset #fff;
  background: #f8f8f8;
  padding: 6px;
  display: grid;
  gap: 6px;
  min-width: 0;
  font-size: var(--wtf-type-caption, 13px);
`;

const MediaDeckInfo = styled.div`
  min-width: 0;
  display: grid;
  gap: 2px;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const MediaDeckControls = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;

  button {
    min-width: 0;
    min-height: 30px;
    padding-inline: 5px;
  }

  @media (max-width: 520px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const MediaDeckRange = styled.input`
  width: 100%;
  min-width: 0;
`;

const MicTestPanel = styled.div<{ $status: MicDiagnosticStatus }>`
  border: 2px outset #fff;
  background: ${({ $status }) =>
    $status === "ok" ? "#e6f8e8" :
      $status === "blocked" || $status === "unsupported" ? "#fff0d8" :
        $status === "warn" ? "#fff7c8" : "#f8f8f8"};
  padding: 4px;
  display: grid;
  gap: 4px;
  min-width: 0;
  font-size: var(--wtf-type-caption, 13px);
`;

const MicTestHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;

  strong,
  span {
    overflow-wrap: anywhere;
  }
`;

const MicTestBadge = styled.span<{ $status: MicDiagnosticStatus }>`
  border: 1px solid #646464;
  background: ${({ $status }) =>
    $status === "ok" ? "#bff0ca" :
      $status === "blocked" || $status === "unsupported" ? "#ffdca8" :
        $status === "warn" ? "#fff09d" : "#ececec"};
  color: #07120f;
  padding: 2px 5px;
  font-size: 11px;
  text-transform: uppercase;
  white-space: nowrap;
`;

const MicTestActionRow = styled.div`
  display: grid;
  grid-template-columns: minmax(74px, auto) minmax(0, 1fr) auto auto;
  gap: 4px;
  align-items: center;

  button {
    min-height: 32px !important;
    padding-left: 6px !important;
    padding-right: 6px !important;
  }

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr) auto;

    button {
      min-height: 44px !important;
    }

    ${MicTestHeader},
    [data-wtf-live-mic-test-status] {
      grid-column: 1 / -1;
    }
  }
`;

const MicTestDrawer = styled.div<{ $expanded: boolean }>`
  display: ${({ $expanded }) => ($expanded ? "grid" : "none")};
  gap: 4px;
  border-top: 1px solid #b8b8b8;
  padding-top: 4px;
  line-height: 1.28;
  min-width: 0;
`;

const MicTestFacts = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;

  span {
    overflow-wrap: anywhere;
  }
`;

const MicTestGuidance = styled.div`
  color: #2f2f2f;
  line-height: 1.3;
  overflow-wrap: anywhere;
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
  font-size: var(--wtf-type-caption, 13px);
`;

const MicMeterTrack = styled.div`
  height: 12px;
  border: 1px solid #202020;
  background: #d5d5d5;
  overflow: hidden;
`;

const MicMeterFill = styled.div<{ $level: number }>`
  width: 100%;
  height: 100%;
  background: ${({ $level }) => ($level > 0.18 ? "#06893d" : $level > 0.06 ? "#c8a600" : "#9aa0a6")};
  transform: scaleX(${({ $level }) => Math.max(0, Math.min(1, $level))});
  transform-origin: left center;
  transition: transform 80ms linear;
`;

const StatusLine = styled.div`
  min-height: 20px;
  font-size: var(--wtf-type-caption, 13px);
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
  font-size: var(--wtf-type-caption, 13px);
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
  font-size: var(--wtf-type-caption, 13px);
  color: #24423e;
`;

const AvatarSettings = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
`;

const AccountJoinIdentity = styled.div`
  border: 2px inset #fff;
  background: #f8f8f8;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-height: 42px;
  padding: 5px;
  font-size: var(--wtf-type-caption, 13px);

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > span {
    display: grid;
    gap: 2px;
  }
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

const MediaStageFallback = styled(AvatarStage)`
  align-content: center;
  gap: 8px;
  color: #dfffe9;
  font-weight: 800;
  text-align: center;
  padding: 16px;

  span {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
`;

const AvatarCircle = styled.div<{ $size?: "mini" | "small" | "large" }>`
  width: ${({ $size }) => ($size === "mini" ? "22px" : $size === "small" ? "34px" : "clamp(96px, 15vw, 180px)")};
  height: ${({ $size }) => ($size === "mini" ? "22px" : $size === "small" ? "34px" : "clamp(96px, 15vw, 180px)")};
  border-radius: 50%;
  border: ${({ $size }) => ($size === "mini" || $size === "small" ? "1px solid #668" : "3px solid #dfffe9")};
  background: #0b5f59;
  color: #fff;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 700;
  font-size: ${({ $size }) => ($size === "mini" ? "10px" : $size === "small" ? "13px" : "clamp(28px, 5vw, 58px)")};
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
  font-size: var(--wtf-type-caption, 13px);
`;

const StageOpenButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  border: 2px outset #fff;
  background: #e7e7e7;
  color: #050505;
  min-width: 32px;
  min-height: 32px;
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

  @media (max-width: 820px) {
    min-height: 220px;
  }
`;

const RemoteAudio = styled.audio`
  display: none;
`;

const AttendanceList = styled.div`
  border: 2px inset #fff;
  background: #fff;
  display: grid;
  align-content: start;
  gap: 3px;
  padding: 4px;
  overflow: auto;
  min-height: 0;
`;

const AttendeeRow = styled.div<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto auto;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 2px 4px;
  border: 1px solid ${({ $active }) => ($active ? "#5fb879" : "#d4d4d4")};
  background: ${({ $active }) => ($active ? "#eefaf1" : "#f8f8f8")};
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1;
  min-width: 0;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const AttendeeName = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;

  strong {
    min-width: 0;
  }
`;

const AttendeeBadge = styled.span`
  border: 1px solid #9a9a9a;
  background: #ececec;
  color: #24423e;
  padding: 1px 3px;
  font-size: 11px;
  line-height: 1.1;
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
  min-width: 38px;
  border: 1px solid #545454;
  padding: 2px 3px;
  text-align: center;
  font-size: 11px;
  background: ${({ $health }) => (
    $health === "good" ? "#dff7e8" :
      $health === "fair" ? "#fff2b8" :
        $health === "poor" ? "#ffd9d9" :
          $health === "offline" ? "#d7d7d7" : "#e8eefb"
  )};
`;

const WimBuddyButton = styled(Button)`
  min-width: 48px;
  min-height: 24px;
  padding: 0 5px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
`;

const TipAttendeeButton = styled(WimBuddyButton)`
  min-width: 42px;
`;

const TipTray = styled.div`
  border: 2px inset #fff;
  background: #f8f0d7;
  padding: 7px;
  display: grid;
  gap: 7px;
  font-size: var(--wtf-type-caption, 13px);
`;

const TipTrayHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 900;
`;

const TipTrayGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const TipTraySelect = styled.select`
  min-height: 30px;
  border: 2px inset #fff;
  background: #fff;
  color: #07120f;
  font-size: var(--wtf-type-caption, 13px);
  min-width: 0;
`;

const TipStatus = styled.span<{ $tone?: "warn" | "good" }>`
  color: ${({ $tone }) => ($tone === "warn" ? "#7a1a1a" : $tone === "good" ? "#075f2a" : "#333")};
  overflow-wrap: anywhere;
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
  font-size: var(--wtf-type-caption, 13px);
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
  min-height: 32px;
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

const ChatMessageText = styled.div`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.35;
`;

const MessageDivider = styled.div`
  color: #4f4f4f;
  font-size: var(--wtf-type-caption, 13px);
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

const ChatToolbox = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-height: 34px;
  box-sizing: border-box;
`;

const ChatEmojiPanel = styled.div`
  border: 2px inset #fff;
  background: #f4f0df;
  padding: 6px;
  box-sizing: border-box;
  min-width: 0;
`;

const ChatEmojiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));
  gap: 4px;
`;

const ChatEmojiButton = styled.button`
  min-width: 30px;
  height: 30px;
  border: 2px outset #fff;
  background: #fff;
  color: #07120f;
  display: grid;
  place-items: center;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;

  &:active {
    border-style: inset;
  }

  &:focus-visible {
    outline: 2px solid #090980;
    outline-offset: 1px;
  }
`;

const ChatStylePanel = styled.div`
  border: 2px inset #fff;
  background: #d8d8d8;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(88px, 0.55fr);
  gap: 6px;
  padding: 6px;
  box-sizing: border-box;
  min-width: 0;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const ChatStyleField = styled.label`
  display: grid;
  gap: 3px;
  min-width: 0;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

const ChatToolSelect = styled.select`
  min-height: 28px;
  width: 100%;
  min-width: 0;
  border: 2px inset #fff;
  background: #fff;
  color: #07120f;
  font-size: 12px;
  line-height: 18px;
  padding: 2px 20px 2px 5px;
  box-sizing: border-box;
`;

const ChatColorStrip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
  min-width: 0;
`;

const ChatColorSwatch = styled.button<{ $color: string; $active?: boolean }>`
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border: 2px ${({ $active }) => ($active ? "inset" : "outset")} #fff;
  background: ${({ $color }) => $color};
  box-shadow: ${({ $active }) => ($active ? "0 0 0 1px #090980" : "none")};
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #090980;
    outline-offset: 1px;
  }
`;

const ChatToolIconButton = styled(Button)<{ $active?: boolean }>`
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $active }) => ($active ? "#c4dbff" : undefined)};
`;

const ChatStyleActionRow = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
`;

const ChatStyleActionGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
  font-size: var(--wtf-type-caption, 13px);
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
  font-size: var(--wtf-type-caption, 13px);
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

const FloatingWindow = styled.section<{ $maximized?: boolean; $pinned?: boolean; $x: number; $y: number; $width: number; $height: number }>`
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
  box-shadow: ${({ $pinned }) => ($pinned ? "0 0 0 2px #f5d45d, 9px 11px 0 rgba(0, 0, 0, 0.35)" : "9px 11px 0 rgba(0, 0, 0, 0.35)")};
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  z-index: ${({ $pinned }) => ($pinned ? 2 : 1)};

  [data-wtf-live-presentation-host="gamma"] & {
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 6px;
    background: #11110f;
    box-shadow: none;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
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
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  cursor: move;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  [data-wtf-live-presentation-host="gamma"] & {
    background: #070706;
    background-image: none;
    color: #f2ead9;
    border-bottom: 1px solid rgba(242, 234, 217, 0.18);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    letter-spacing: 0;
    text-transform: uppercase;
  }
`;

const FloatingButtonRow = styled.div`
  display: flex;
  gap: 4px;

  button {
    min-width: 32px;
    min-height: 32px;
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

const FloatingPanelContent = styled.div`
  min-height: 0;
  background: #e9e9e9;
  color: #07120f;
  padding: 8px;
  display: grid;
  overflow: auto;

  ${AttendancePanel},
  ${ChatColumn} {
    min-height: 0;
    height: 100%;
  }

  [data-wtf-live-presentation-host="gamma"] & {
    background: #11110f;
    color: #f2ead9;
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

const INITIAL_MIC_DIAGNOSTIC: MicDiagnosticState = {
  status: "idle",
  headline: "Run a mic test before going live.",
  detail: "Checks browser support, site permission, visible input devices, and whether the browser can actually open the microphone.",
  browserLabel: "Browser: not checked",
  permissionLabel: "Permission: not checked",
  deviceLabel: "Device: not checked",
};

function browserMediaLabel(): string {
  if (typeof window === "undefined") return "Browser: not checked";
  const secureContext =
    window.isSecureContext ||
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (!secureContext) return "Browser: HTTPS or localhost required";
  if (!navigator.mediaDevices?.getUserMedia) return "Browser: microphone API unavailable";
  return "Browser: microphone API available";
}

function isMicSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.isSecureContext ||
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
  );
}

async function queryMicrophonePermission(): Promise<{ state: MicPermissionProbeState; label: string }> {
  if (!navigator.permissions?.query) {
    return { state: "unsupported", label: "Permission: browser check unavailable" };
  }
  try {
    const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return { state: result.state, label: `Permission: ${result.state}` };
  } catch {
    return { state: "unsupported", label: "Permission: direct prompt only" };
  }
}

async function describeAudioInputs(mediaDevices: MediaDevices | undefined): Promise<string> {
  if (!mediaDevices?.enumerateDevices) return "Device: list unavailable";
  try {
    const devices = await mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === "audioinput");
    if (!audioInputs.length) return "Device: no microphone visible";
    const namedInputs = audioInputs.map((device) => device.label.trim()).filter(Boolean);
    if (namedInputs.length) {
      return `Device: ${audioInputs.length} mic${audioInputs.length === 1 ? "" : "s"} visible (${namedInputs.slice(0, 2).join(", ")})`;
    }
    return `Device: ${audioInputs.length} mic${audioInputs.length === 1 ? "" : "s"} visible, names hidden until allowed`;
  } catch {
    return "Device: list blocked";
  }
}

function micDiagnosticFromFailure(
  error: unknown,
  permissionLabel: string,
  deviceLabel: string,
  browserLabel: string,
): MicDiagnosticState {
  const errorName =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name || "")
      : "";
  const browserDenied = /\bdenied\b/i.test(permissionLabel);
  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return {
      status: "blocked",
      headline: "No microphone was found.",
      detail: "Connect a microphone or choose a browser profile that can see the device, then run the test again.",
      browserLabel,
      permissionLabel,
      deviceLabel,
    };
  }
  if (errorName === "NotReadableError" || errorName === "TrackStartError" || errorName === "AbortError") {
    return {
      status: "blocked",
      headline: "The microphone exists but could not open.",
      detail: "Check operating-system microphone privacy for this browser and close other apps or tabs that may already be using the mic.",
      browserLabel,
      permissionLabel,
      deviceLabel,
    };
  }
  if (errorName === "SecurityError") {
    return {
      status: "unsupported",
      headline: "This browser blocked microphone capture.",
      detail: "Use the public HTTPS room URL and check privacy-browser shields, site permissions, and any iframe or content-blocking settings.",
      browserLabel,
      permissionLabel,
      deviceLabel,
    };
  }
  if (errorName === "OverconstrainedError" || errorName === "ConstraintNotSatisfiedError") {
    return {
      status: "blocked",
      headline: "The selected microphone could not match the room constraints.",
      detail: "Switch to a standard input device or reset this browser's microphone device choice, then retry.",
      browserLabel,
      permissionLabel,
      deviceLabel,
    };
  }
  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return {
      status: "blocked",
      headline: browserDenied ? "Microphone is blocked in this browser." : "Microphone is blocked by browser or system privacy settings.",
      detail: browserDenied
        ? "Open this site's microphone permission in the browser and set it to Allow, then run Test mic again."
        : "Allow the browser prompt. If the browser already says allowed, enable microphone access for this browser in macOS, Windows, iOS, or Android privacy settings.",
      browserLabel,
      permissionLabel,
      deviceLabel,
    };
  }
  return {
    status: "blocked",
    headline: "Microphone test failed.",
    detail: "Check this site's microphone permission, privacy-browser shields, and the operating-system microphone permission for this browser.",
    browserLabel,
    permissionLabel,
    deviceLabel,
  };
}

function emptyLiveMediaState(avatarUrl: string | null = null): LiveMediaState {
  return {
    mic: false,
    audioOpen: false,
    camera: false,
    screen: false,
    screenAudio: false,
    mediaVideo: false,
    mediaAudio: false,
    mediaName: null,
    soundboard: false,
    activeVideo: null,
    cameraTrackId: null,
    screenTrackId: null,
    mediaVideoTrackId: null,
    mediaAudioTrackId: null,
    avatarUrl,
  };
}

function mediaElementCaptureStream(element: HTMLMediaElement): MediaStream | null {
  const capturable = element as HTMLMediaElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  try {
    return capturable.captureStream?.() ?? capturable.mozCaptureStream?.() ?? null;
  } catch {
    return null;
  }
}

function isLiveMediaDeckFile(file: File): boolean {
  if (LIVE_MEDIA_DECK_TYPES.has(file.type)) return true;
  return /\.(?:mp3|m4a|aac|wav|ogg|oga|opus|mp4|webm)$/i.test(file.name);
}

function formatMediaTime(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds ?? Number.NaN) || (seconds ?? 0) < 0) return "0:00";
  const total = Math.floor(seconds ?? 0);
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function videoOnlyStreamFromTrack(baseStream: MediaStream | null, trackId: string | null, fallbackIndex = 0): MediaStream | null {
  const videoTracks = (baseStream?.getVideoTracks() ?? []).filter((track) => track.readyState === "live");
  const track = (trackId ? videoTracks.find((candidate) => candidate.id === trackId) : null) ?? videoTracks[fallbackIndex] ?? null;
  return track ? new MediaStream([track]) : null;
}

function stageStreamFromMediaState(baseStream: MediaStream | null, mediaState: LiveMediaState, source: StageSource): MediaStream | null {
  if (source === "camera") return videoOnlyStreamFromTrack(baseStream, mediaState.cameraTrackId, 0);
  if (source === "screen") return videoOnlyStreamFromTrack(baseStream, mediaState.screenTrackId, mediaState.cameraTrackId ? 1 : 0);
  return videoOnlyStreamFromTrack(
    baseStream,
    mediaState.mediaVideoTrackId,
    [mediaState.cameraTrackId, mediaState.screenTrackId].filter(Boolean).length,
  );
}

function hasRemoteAudioLane(mediaState: LiveMediaState): boolean {
  return mediaState.mic || mediaState.audioOpen || mediaState.screenAudio || mediaState.mediaAudio || mediaState.soundboard;
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

function normalizeLiveChatStyle(value: unknown): LiveChatStyle {
  return normalizeDesktopWtfLiveChatStyle(value, DEFAULT_LIVE_CHAT_STYLE);
}

function sameLiveChatStyle(left: LiveChatStyle, right: LiveChatStyle): boolean {
  return left.font === right.font &&
    left.color === right.color &&
    left.size === right.size &&
    left.bold === right.bold &&
    left.italic === right.italic;
}

function readStoredLiveChatStyle(): LiveChatStyle | null {
  try {
    const raw = localStorage.getItem("wtf-live:chat-style");
    return raw ? normalizeLiveChatStyle(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function readStoredRoomDefaultFontPack(): DesktopFontPackKey {
  try {
    const stored = localStorage.getItem(WTF_LIVE_CHAT_DEFAULT_FONT_STORAGE_KEY);
    return WTF_LIVE_ROOM_FONT_PACKS.some((pack) => pack.key === stored) ? stored as DesktopFontPackKey : WTF_LIVE_DEFAULT_FONT_PACK;
  } catch {
    return WTF_LIVE_DEFAULT_FONT_PACK;
  }
}

function liveChatTextStyle(value: unknown, fallbackFontFamily?: string): CSSProperties {
  const hasAssignedFont = typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).font === "string";
  const style = normalizeLiveChatStyle(value);
  const font = LIVE_CHAT_FONT_OPTIONS.find((option) => option.id === style.font) ?? LIVE_CHAT_FONT_OPTIONS[0];
  const color = LIVE_CHAT_COLOR_OPTIONS.find((option) => option.id === style.color) ?? LIVE_CHAT_COLOR_OPTIONS[0];
  return {
    color: color.value,
    fontFamily: hasAssignedFont ? font.family : fallbackFontFamily ?? font.family,
    fontSize: `${style.size}px`,
    fontStyle: style.italic ? "italic" : "normal",
    fontWeight: style.bold ? 700 : 400,
  };
}

function liveRoomReactionLabel(emoji: string): string {
  return LIVE_ROOM_REACTION_OPTIONS.find((option) => option.emoji === emoji)?.label ?? "Reaction";
}

function normalizeLiveRoomReaction(value: unknown): LiveRoomReaction | null {
  const reaction = typeof value === "object" && value ? value as Record<string, unknown> : {};
  const emoji = String(reaction.emoji || "");
  if (!LIVE_ROOM_REACTION_EMOJIS.has(emoji)) return null;
  const createdAtValue = reaction.createdAt;
  const createdAt = typeof createdAtValue === "number"
    ? createdAtValue
    : typeof createdAtValue === "string"
      ? Date.parse(createdAtValue)
      : Date.now();
  return {
    id: String(reaction.id || `reaction_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).slice(0, 96),
    peerId: String(reaction.peerId || "peer").slice(0, 80),
    guestName: String(reaction.guestName || "guest").trim().replace(/\s+/g, " ").slice(0, 48) || "guest",
    emoji,
    label: String(reaction.label || liveRoomReactionLabel(emoji)).trim().slice(0, 32) || liveRoomReactionLabel(emoji),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
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

type StageStreamCache = Map<string, { signature: string; stream: MediaStream | null }>;

function cachedStageStream(
  cache: StageStreamCache,
  key: string,
  baseStream: MediaStream | null,
  mediaState: LiveMediaState,
  source: StageSource,
): MediaStream | null {
  const signature = [
    source,
    mediaState.cameraTrackId,
    mediaState.screenTrackId,
    mediaState.mediaVideoTrackId,
    streamSignature(baseStream),
  ].join("|");
  const existing = cache.get(key);
  if (existing?.signature === signature) return existing.stream;
  const stream = stageStreamFromMediaState(baseStream, mediaState, source);
  cache.set(key, { signature, stream });
  return stream;
}

function isNearScrollBottom(node: HTMLElement, padding = 96): boolean {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= padding;
}

function hasLiveTrack(stream: MediaStream | null, kind: MediaStreamTrack["kind"]): boolean {
  return Boolean(stream?.getTracks().some((track) => track.kind === kind && track.readyState === "live"));
}

function firstLiveTrack(stream: MediaStream | null, kind: MediaStreamTrack["kind"]): MediaStreamTrack | null {
  return stream?.getTracks().find((track) => track.kind === kind && track.readyState === "live") ?? null;
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
  mediaStream?: MediaStream | null;
  mediaName?: string | null;
  soundboardStream?: MediaStream | null;
  activeVideoSource: ActiveVideoSource;
  audioEnabled: boolean;
  avatarUrl: string | null;
}): LiveMediaState {
  const cameraTrack = firstLiveTrack(streams.cameraStream, "video");
  const screenTrack = firstLiveTrack(streams.screenStream, "video");
  const screenAudioTrack = firstLiveTrack(streams.screenStream, "audio");
  const mediaVideoTrack = firstLiveTrack(streams.mediaStream ?? null, "video");
  const mediaAudioTrack = firstLiveTrack(streams.mediaStream ?? null, "audio");
  const mic = hasLiveTrack(streams.micStream, "audio");
  const soundboard = hasLiveTrack(streams.soundboardStream ?? null, "audio");
  const preferredActive = resolveActiveVideoSource(streams, streams.activeVideoSource);
  return {
    mic,
    audioOpen: mic && streams.audioEnabled,
    camera: Boolean(cameraTrack),
    screen: Boolean(screenTrack),
    screenAudio: Boolean(screenAudioTrack),
    mediaVideo: Boolean(mediaVideoTrack),
    mediaAudio: Boolean(mediaAudioTrack),
    mediaName: sanitizeStageMediaName(streams.mediaName),
    soundboard,
    activeVideo: preferredActive,
    cameraTrackId: cameraTrack?.id ?? null,
    screenTrackId: screenTrack?.id ?? null,
    mediaVideoTrackId: mediaVideoTrack?.id ?? null,
    mediaAudioTrackId: mediaAudioTrack?.id ?? null,
    avatarUrl: normalizeAvatarUrl(streams.avatarUrl),
  };
}

function normalizeMediaState(value: Partial<LiveMediaState> | undefined): LiveMediaState {
  const camera = Boolean(value?.camera);
  const screen = Boolean(value?.screen);
  const requested = value?.activeVideo === "camera" || value?.activeVideo === "screen" ? value.activeVideo : null;
  const mic = Boolean(value?.mic);
  const mediaName = sanitizeStageMediaName(value?.mediaName);
  return {
    mic,
    audioOpen: Boolean(value?.audioOpen ?? mic),
    camera,
    screen,
    screenAudio: Boolean(value?.screenAudio),
    mediaVideo: Boolean(value?.mediaVideo),
    mediaAudio: Boolean(value?.mediaAudio),
    mediaName,
    soundboard: Boolean(value?.soundboard),
    activeVideo: requested === "camera" && camera ? "camera" : requested === "screen" && screen ? "screen" : null,
    cameraTrackId: sanitizeTrackId(value?.cameraTrackId),
    screenTrackId: sanitizeTrackId(value?.screenTrackId),
    mediaVideoTrackId: sanitizeTrackId(value?.mediaVideoTrackId),
    mediaAudioTrackId: sanitizeTrackId(value?.mediaAudioTrackId),
    avatarUrl: normalizeAvatarUrl(value?.avatarUrl),
  };
}

function livePeerName(peer: Pick<LivePeer, "guestName" | "username">): string {
  return peer.username?.trim() || peer.guestName?.trim() || "guest";
}

function normalizeLiveUserId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function wimFriendStorageKey(userId: number | null | undefined): string | null {
  return userId ? `wtf:wim:friends:${userId}` : null;
}

function readWimFriendIds(userId: number | null | undefined): number[] {
  const key = wimFriendStorageKey(userId);
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => normalizeLiveUserId(value))
      .filter((value): value is number => Boolean(value));
  } catch {
    return [];
  }
}

function writeWimFriendIds(userId: number | null | undefined, friendIds: number[]) {
  const key = wimFriendStorageKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify([...new Set(friendIds)].sort((a, b) => a - b)));
  } catch {
    // WIM remains usable if browser storage is unavailable.
  }
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part[0]).join("");
}

function labelForMediaState(state: LiveMediaState, connected = true): string {
  const visualSources = [state.camera ? "Camera" : "", state.screen ? "Screen" : "", state.mediaVideo ? "Media" : ""].filter(Boolean);
  if (visualSources.length > 1) return visualSources.join(" + ");
  if (visualSources.length === 1) return visualSources[0];
  if (state.mediaAudio) return "Media audio";
  if (state.soundboard) return "Soundboard";
  if (state.audioOpen) return "Mic live";
  if (state.mic) return "Mic ready";
  return connected ? "Idle" : "Connecting";
}

function sanitizeTrackId(value: unknown): string | null {
  const id = String(value || "").trim();
  return id ? id.slice(0, 160) : null;
}

function sanitizeStageMediaName(value: unknown): string | null {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  return name || null;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function soundboardDataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const [, base64 = ""] = dataUrl.split(",", 2);
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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

function AvatarMark({ name, avatarUrl, size = "large" }: { name: string; avatarUrl?: string | null; size?: "mini" | "small" | "large" }) {
  return (
    <AvatarCircle $size={size}>
      {avatarUrl ? <img src={avatarUrl} alt={`${name} avatar`} data-wtf-live-avatar-image /> : initialsForName(name)}
    </AvatarCircle>
  );
}

type StageParticipantTileProps = StageEntry & {
  onOpen?: () => void;
  onDragStart?: (entryId: string) => void;
  onDropOn?: (entryId: string) => void;
};

const StageParticipantTile = memo(function StageParticipantTile({
  id,
  peerId,
  name,
  source,
  title,
  mediaState,
  stream,
  connected,
  isSelf = false,
  onOpen,
  onDragStart,
  onDropOn,
}: StageParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamSignature = (stream?.getTracks() ?? [])
    .map((track) => `${track.kind}:${track.id}:${track.readyState}`)
    .join("|");
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));
  const hasAudio = source === "media" ? mediaState.mediaAudio : hasRemoteAudioLane(mediaState);
  const mode = hasVideo ? source : hasAudio ? `${source}-audio` : "idle";
  const sourceLabel = source === "media" ? mediaState.mediaName || "Media" : source === "screen" ? "Screen" : "Camera";
  const activeVideoLabel = hasVideo
    ? `${sourceLabel} live`
    : source === "media" && mediaState.mediaAudio
      ? `${sourceLabel} audio`
      : hasAudio
        ? "Audio live"
        : connected
          ? `${sourceLabel} ready`
          : "Connecting";
  useMediaStream(videoRef, hasVideo ? stream : null, streamSignature);
  return (
    <StageTile
      $hasVideo={hasVideo}
      onClick={hasVideo ? onOpen : undefined}
      draggable={hasVideo}
      onDragStart={hasVideo ? (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
        onDragStart?.(id);
      } : undefined}
      onDragOver={hasVideo ? (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      } : undefined}
      onDrop={hasVideo ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDropOn?.(id);
      } : undefined}
      data-wtf-live-stage-entry={id}
      data-wtf-live-stage-peer={peerId}
      data-wtf-live-stage-source={source}
      data-wtf-live-stage-mode={mode}
      data-wtf-live-remote-peer={isSelf ? undefined : peerId}
      data-wtf-live-remote-active-video={isSelf ? undefined : source}
    >
      {hasVideo ? (
        <StageOpenButton
          type="button"
          aria-label={`Open ${title}`}
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
            data-wtf-live-remote-video={isSelf ? undefined : peerId}
            data-wtf-live-local-stage-video={isSelf ? "true" : undefined}
            autoPlay
            playsInline
            muted={isSelf}
          />
        </StageVideoFrame>
      ) : source === "media" ? (
        <MediaStageFallback>
          <Music2 size={42} aria-hidden />
          <span>{mediaState.mediaName || "Media audio"}</span>
        </MediaStageFallback>
      ) : (
        <AvatarStage>
          <AvatarMark name={name} avatarUrl={mediaState.avatarUrl} />
        </AvatarStage>
      )}
      <StageMeta>
        <strong>{isSelf ? `${name} (you)` : name}</strong>
        <span>{activeVideoLabel}</span>
      </StageMeta>
    </StageTile>
  );
}, (previous, next) =>
  previous.id === next.id &&
  previous.peerId === next.peerId &&
  previous.name === next.name &&
  previous.source === next.source &&
  previous.title === next.title &&
  previous.mediaState === next.mediaState &&
  previous.stream === next.stream &&
  previous.connected === next.connected &&
  previous.isSelf === next.isSelf &&
  previous.onOpen === next.onOpen &&
  previous.onDragStart === next.onDragStart &&
  previous.onDropOn === next.onDropOn
);

function ScreenGridEntryTile({ entry, onOpen }: { entry: StageEntry; onOpen: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const signature = streamSignature(entry.stream);
  const hasVideo = Boolean(entry.stream?.getVideoTracks().some((track) => track.readyState === "live"));
  useMediaStream(videoRef, hasVideo ? entry.stream : null, signature);
  return (
    <ScreenGridItem data-wtf-live-screen-grid-item={entry.id}>
      {hasVideo ? (
        <StageVideoFrame>
          <StageVideo
            ref={videoRef}
            data-wtf-live-screen-grid-video={entry.id}
            autoPlay
            playsInline
            muted={entry.isSelf}
          />
        </StageVideoFrame>
      ) : (
        <AvatarStage>
          <AvatarMark name={entry.name} avatarUrl={entry.mediaState.avatarUrl} />
        </AvatarStage>
      )}
      <ScreenGridPopoutButton
        type="button"
        aria-label={`Pop out ${entry.title}`}
        title={`Pop out ${entry.title}`}
        onClick={onOpen}
        data-wtf-live-grid-popout={entry.id}
      >
        <Maximize2 size={14} aria-hidden />
      </ScreenGridPopoutButton>
      <StageMeta>
        <strong>{entry.isSelf ? `${entry.name} (you)` : entry.name}</strong>
        <span>{entry.source === "screen" ? "Screen" : entry.source === "camera" ? "Camera" : entry.mediaState.mediaName || "Media"}</span>
      </StageMeta>
    </ScreenGridItem>
  );
}

function RemoteAudioSink({ peer }: { peer: LivePeer }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAttachAudio = hasRemoteAudioLane(peer.mediaState);
  useMediaStream(audioRef, shouldAttachAudio ? peer.stream : null, streamSignature(peer.stream));
  return <RemoteAudio ref={audioRef} data-wtf-live-remote-audio={peer.peerId} autoPlay />;
}

function MicLevelMeter({
  micStream,
  localAudioOpen,
  pushToTalk,
}: {
  micStream: MediaStream | null;
  localAudioOpen: boolean;
  pushToTalk: boolean;
}) {
  const [micLevel, setMicLevel] = useState(0);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!micStream) {
      setMicLevel(0);
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setMicLevel(0);
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
      animationRef.current = requestAnimationFrame(readLevel);
    };

    readLevel();

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      source.disconnect();
      audioContext.close().catch(() => undefined);
      setMicLevel(0);
    };
  }, [micStream]);

  return (
    <MicMeter aria-label={`Mic level ${Math.round(micLevel * 100)} percent`}>
      <span>{pushToTalk ? "PTT" : "Mic"}</span>
      <MicMeterTrack>
        <MicMeterFill $level={localAudioOpen ? micLevel : 0} />
      </MicMeterTrack>
      <span>{localAudioOpen ? (micLevel > 0.04 ? "Live" : "Quiet") : micStream ? "Muted" : "Off"}</span>
    </MicMeter>
  );
}

function FloatingStreamWindow({
  frame,
  stream,
  onClose,
  onToggleMaximize,
  onTogglePinned,
  onCycleSize,
  onDragStart,
}: {
  frame: Extract<PopoutFrame, { kind: "stream" }>;
  stream: MediaStream | null;
  onClose: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onTogglePinned: (id: string) => void;
  onCycleSize: (id: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>, frame: PopoutFrame) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useMediaStream(videoRef, stream, streamSignature(stream));
  return (
    <FloatingWindow
      $maximized={frame.maximized}
      $pinned={frame.pinned}
      $x={frame.x}
      $y={frame.y}
      $width={frame.width}
      $height={frame.height}
      data-wtf-live-popout-frame={frame.id}
      data-wtf-live-popout-pinned={frame.pinned ? "true" : "false"}
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
          <Button
            aria-label={frame.pinned ? "Unpin popout from top" : "Pin popout always on top"}
            aria-pressed={frame.pinned}
            title={frame.pinned ? "Unlock and let this popout move behind others" : "Lock this popout above other panels"}
            onClick={() => onTogglePinned(frame.id)}
            data-wtf-live-popout-pin={frame.id}
          >
            <Pin size={14} aria-hidden />
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
  onTogglePinned,
  onCycleSize,
  onDragStart,
}: {
  frame: Extract<PopoutFrame, { kind: "attachment" }>;
  onClose: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onTogglePinned: (id: string) => void;
  onCycleSize: (id: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>, frame: PopoutFrame) => void;
}) {
  return (
    <FloatingWindow
      $maximized={frame.maximized}
      $pinned={frame.pinned}
      $x={frame.x}
      $y={frame.y}
      $width={frame.width}
      $height={frame.height}
      data-wtf-live-popout-frame={frame.id}
      data-wtf-live-popout-pinned={frame.pinned ? "true" : "false"}
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
          <Button
            aria-label={frame.pinned ? "Unpin popout from top" : "Pin popout always on top"}
            aria-pressed={frame.pinned}
            title={frame.pinned ? "Unlock and let this popout move behind others" : "Lock this popout above other panels"}
            onClick={() => onTogglePinned(frame.id)}
            data-wtf-live-popout-pin={frame.id}
          >
            <Pin size={14} aria-hidden />
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

function FloatingPanelWindow({
  frame,
  children,
  onClose,
  onToggleMaximize,
  onTogglePinned,
  onCycleSize,
  onDragStart,
}: {
  frame: Extract<PopoutFrame, { kind: "panel" }>;
  children: ReactNode;
  onClose: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onTogglePinned: (id: string) => void;
  onCycleSize: (id: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>, frame: PopoutFrame) => void;
}) {
  return (
    <FloatingWindow
      $maximized={frame.maximized}
      $pinned={frame.pinned}
      $x={frame.x}
      $y={frame.y}
      $width={frame.width}
      $height={frame.height}
      data-wtf-live-popout-frame={frame.id}
      data-wtf-live-popout-pinned={frame.pinned ? "true" : "false"}
      data-wtf-live-panel-popout={frame.panel}
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
          <Button
            aria-label={frame.pinned ? "Unpin popout from top" : "Pin popout always on top"}
            aria-pressed={frame.pinned}
            title={frame.pinned ? "Unlock and let this popout move behind others" : "Lock this popout above other panels"}
            onClick={() => onTogglePinned(frame.id)}
            data-wtf-live-popout-pin={frame.id}
          >
            <Pin size={14} aria-hidden />
          </Button>
          <Button
            aria-label={`Pop ${frame.title} back into the bento`}
            title={`Pop ${frame.title} back into the bento`}
            onClick={() => onClose(frame.id)}
            data-wtf-live-popout-popin={frame.id}
            data-wtf-live-popout-close={frame.id}
          >
            <ChevronDown size={14} aria-hidden />
          </Button>
        </FloatingButtonRow>
      </FloatingTitleBar>
      <FloatingPanelContent>{children}</FloatingPanelContent>
    </FloatingWindow>
  );
}

export function WtfLivePublicRoom({ roomId }: { roomId: string }) {
  const qc = useQueryClient();
  const presentation = usePresentationShell();
  const { user, isLoading: authLoading } = useAuth();
  const roomQuery = useQuery<PublicRoomResponse>({
    queryKey: ["wtf-live", "public-room", roomId, user?.id ?? "guest"],
    enabled: !authLoading,
    queryFn: async () => {
      if (user?.id) {
        try {
          return await api.get<PublicRoomResponse>(`/api/wtf-live/rooms/${encodeURIComponent(roomId)}/join`);
        } catch {
          return api.get<PublicRoomResponse>(`/api/wtf-live/public/rooms/${encodeURIComponent(roomId)}`);
        }
      }
      return api.get<PublicRoomResponse>(`/api/wtf-live/public/rooms/${encodeURIComponent(roomId)}`);
    },
  });
  const desktopSettingsQuery = useQuery<DesktopSettingsResponse>({
    queryKey: ["desktop", "settings"],
    enabled: Boolean(user),
    queryFn: () => api.get<DesktopSettingsResponse>("/api/desktop/settings"),
    retry: false,
    staleTime: 30_000,
  });

  const [guestName, setGuestName] = useState(() => localStorage.getItem("wtf-live:guest-name") || "");
  const [joined, setJoined] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micDiagnostic, setMicDiagnostic] = useState<MicDiagnosticState>(INITIAL_MIC_DIAGNOSTIC);
  const [micDiagnosticExpanded, setMicDiagnosticExpanded] = useState(false);
  const [sharingTestingOpen, setSharingTestingOpen] = useState(false);
  const [sharingSettingsOpen, setSharingSettingsOpen] = useState(false);
  const [runtimeRoomSettings, setRuntimeRoomSettings] = useState<RuntimeRoomSettings>(DEFAULT_RUNTIME_ROOM_SETTINGS);
  const [runtimeRoomSettingsStatus, setRuntimeRoomSettingsStatus] = useState("");
  const [stageHostList, setStageHostList] = useState("");
  const [stageSpeakerList, setStageSpeakerList] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [soundboardOutputStream, setSoundboardOutputStream] = useState<MediaStream | null>(null);
  const [mediaDeck, setMediaDeck] = useState<MediaDeckState | null>(null);
  const [activeVideoSource, setActiveVideoSource] = useState<ActiveVideoSource>(null);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [pushHeld, setPushHeld] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => storedAvatarUrl());
  const [remotePeers, setRemotePeers] = useState<LivePeer[]>([]);
  const [peerDiagnostics, setPeerDiagnostics] = useState<Record<string, PeerDiagnostic>>({});
  const [liveMessages, setLiveMessages] = useState<LiveChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const chatStyleOverriddenRef = useRef(false);
  const [chatStyle, setChatStyle] = useState<LiveChatStyle>(() => {
    const stored = readStoredLiveChatStyle();
    chatStyleOverriddenRef.current = Boolean(stored && !sameLiveChatStyle(stored, DEFAULT_LIVE_CHAT_STYLE));
    return stored ?? DEFAULT_LIVE_CHAT_STYLE;
  });
  const [roomDefaultFontPack, setRoomDefaultFontPack] = useState<DesktopFontPackKey>(() => readStoredRoomDefaultFontPack());
  const [soundboardSettings, setSoundboardSettings] = useState<WtfLiveSoundboardSettings>(() =>
    readWtfLiveSoundboardSettings(user?.id),
  );
  const [soundboardStatus, setSoundboardStatus] = useState("");
  const [chatEmojiOpen, setChatEmojiOpen] = useState(false);
  const [chatStyleOpen, setChatStyleOpen] = useState(false);
  const [chatAttachments, setChatAttachments] = useState<LiveChatAttachment[]>([]);
  const [roomReactions, setRoomReactions] = useState<LiveRoomReaction[]>([]);
  const [wimFriendIds, setWimFriendIds] = useState<number[]>([]);
  const [tipTrayOpen, setTipTrayOpen] = useState(false);
  const [tipTargetUserId, setTipTargetUserId] = useState<number | null>(null);
  const [tipSku, setTipSku] = useState("");
  const [tipStatus, setTipStatus] = useState("");
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [popoutFrames, setPopoutFrames] = useState<PopoutFrame[]>([]);
  const [bentoOrder, setBentoOrder] = useState<BentoPanelId[]>(BENTO_PANEL_ORDER);
  const [draggingBentoPanel, setDraggingBentoPanel] = useState<BentoPanelId | null>(null);
  const [draggingStageEntryId, setDraggingStageEntryId] = useState<string | null>(null);
  const [screenGridEntryIds, setScreenGridEntryIds] = useState<string[]>([]);
  const popoutFrameCountRef = useRef(0);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const screenRef = useRef<HTMLVideoElement | null>(null);
  const chatTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const stageStreamCacheRef = useRef<StageStreamCache>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const statsSamplesRef = useRef<Map<string, { timestamp: number; inboundBytes: number; outboundBytes: number }>>(new Map());
  const selfPeerIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaDeckElementRef = useRef<HTMLMediaElement | null>(null);
  const mediaDeckRef = useRef<MediaDeckState | null>(null);
  const chatNearBottomRef = useRef(true);
  const lastChatItemCountRef = useRef(0);
  const dragFrameRef = useRef<{ id: string; startX: number; startY: number; frameX: number; frameY: number } | null>(null);
  const reactionTimeoutsRef = useRef<Map<string, number>>(new Map());
  const soundboardAudioRef = useRef<HTMLAudioElement[]>([]);
  const soundboardAudioContextRef = useRef<AudioContext | null>(null);
  const soundboardDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const soundboardSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const soundboardCooldownRef = useRef<Map<string, number>>(new Map());
  const lastMediaStateRef = useRef<LiveMediaState>(emptyLiveMediaState());
  const localStreamsRef = useRef({
    micStream: null as MediaStream | null,
    cameraStream: null as MediaStream | null,
    screenStream: null as MediaStream | null,
    mediaStream: null as MediaStream | null,
    mediaName: null as string | null,
    soundboardStream: null as MediaStream | null,
    activeVideoSource: null as ActiveVideoSource,
    audioEnabled: false,
    avatarUrl: null as string | null,
  });
  popoutFrameCountRef.current = popoutFrames.length;
  const room = roomQuery.data?.room;
  const joinMode = roomQuery.data?.joinMode ?? "guest_room_only";
  const roomCapabilities = roomQuery.data?.capabilities;
  const stagePermissions = roomQuery.data?.stagePermissions;
  const isStageRoom = room?.kind === "stage" || joinMode === "wtf_live_stage" || Boolean(roomCapabilities?.stage);
  const stageRole = stagePermissions?.role ?? roomCapabilities?.stageRole ?? "audience";
  const canShareAudio = roomCapabilities?.audio !== false;
  const canShareCamera = roomCapabilities?.camera !== false;
  const canShareScreen = roomCapabilities?.screen !== false;
  const canShareMedia = roomCapabilities?.media !== false;
  const canManageStageRoom = Boolean(stagePermissions?.canManage || roomCapabilities?.canManageStage);
  const canManageRoom = Boolean(roomCapabilities?.canManageRoom || canManageStageRoom);
  const defaultLiveChatStyle =
    desktopSettingsQuery.data?.appearance.wtfLiveChatStyle ?? DEFAULT_LIVE_CHAT_STYLE;
  const roomDefaultChatFontFamily = getFontPack(roomDefaultFontPack).roles.app;
  const viewerUserId = normalizeLiveUserId(user?.id);
  const signedInUsername = user?.username?.trim() || "";
  const signedInDisplayName = signedInUsername || user?.displayName?.trim() || "";
  const attendeeDisplayName = signedInDisplayName || guestName.trim() || "guest";
  const soundboardStorageKey = wtfLiveSoundboardStorageKey(viewerUserId);
  const canUseRoomSoundboard = Boolean(
    !isStageRoom &&
      viewerUserId &&
      roomCapabilities?.showKit &&
      canManageRoom,
  );
  const soundboardClips = soundboardSettings.clips;
  const soundboardQuery = useQuery<SoundboardSettingsResponse>({
    queryKey: ["wtf-live", "soundboard", viewerUserId],
    enabled: Boolean(viewerUserId && !canUseRoomSoundboard),
    queryFn: () => api.get<SoundboardSettingsResponse>("/api/wtf-live/soundboard"),
    retry: false,
    staleTime: 15_000,
  });
  const roomShowKitQuery = useQuery<RoomShowKitResponse>({
    queryKey: ["wtf-live", "room-show-kit", roomId, viewerUserId],
    enabled: canUseRoomSoundboard,
    queryFn: () => api.get<RoomShowKitResponse>(`/api/wtf-live/rooms/${encodeURIComponent(roomId)}/show-kit`),
    retry: false,
    staleTime: 15_000,
  });
  const runtimeRoomKind = isStageRoom ? "stage" : "room";
  const runtimeRoomSettingsQuery = useQuery<{ settings: RuntimeRoomSettings }>({
    queryKey: ["wtf-live", "room-runtime-settings", runtimeRoomKind, roomId, viewerUserId],
    enabled: Boolean(viewerUserId && canManageRoom && room),
    queryFn: () => api.get(`/api/wtf-live/rooms/${encodeURIComponent(roomId)}/settings?roomKind=${runtimeRoomKind}`),
    retry: false,
    staleTime: 10_000,
  });
  const runtimeShowKitsQuery = useQuery<{ kits: RuntimeShowKit[] }>({
    queryKey: ["wtf-live", "show-kits", viewerUserId],
    enabled: Boolean(viewerUserId && canManageRoom),
    queryFn: () => api.get("/api/wtf-live/show-kits"),
    retry: false,
    staleTime: 15_000,
  });
  const saveRuntimeRoomSettings = useMutation({
    mutationFn: () =>
      api.patch<{ settings: RuntimeRoomSettings }>(`/api/wtf-live/rooms/${encodeURIComponent(roomId)}/settings`, {
        roomKind: runtimeRoomKind,
        ...runtimeRoomSettings,
      }),
    onSuccess: (data) => {
      setRuntimeRoomSettings(data.settings);
      setRuntimeRoomSettingsStatus("Room settings saved.");
      qc.invalidateQueries({ queryKey: ["wtf-live", "public-room", roomId] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "room-show-kit", roomId, viewerUserId] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "room-runtime-settings", runtimeRoomKind, roomId, viewerUserId] });
    },
    onError: (error: unknown) => {
      setRuntimeRoomSettingsStatus(error instanceof Error ? error.message : "Could not save room settings.");
    },
  });
  const messagesQuery = useQuery<{ messages: RoomMessage[] }>({
    queryKey: ["wtf-live", "room", joinMode, roomId, "messages"],
    enabled: Boolean(room),
    queryFn: () =>
      joinMode === "wtf_user_private_room" || (joinMode === "wtf_live_stage" && viewerUserId)
        ? api.get(`/api/wtf-live/rooms/${encodeURIComponent(roomId)}/messages`)
        : api.get(`/api/wtf-live/public/rooms/${encodeURIComponent(roomId)}/messages`),
  });
  const tipItemsQuery = useQuery<LiveTipMarketResponse>({
    queryKey: ["wtfiam", "wtf_live", "tips", viewerUserId],
    enabled: Boolean(viewerUserId),
    queryFn: () => api.get("/api/in-app-market?category=wtf_live"),
    staleTime: 10_000,
  });
  const roomUrl = useMemo(() => {
    if (typeof window === "undefined") return `/live/r/${roomId}`;
    return `${window.location.origin}/live/r/${roomId}`;
  }, [roomId]);
  const localAudioOpen = Boolean(micStream && (!pushToTalk || pushHeld));
  const ownedTipItems = useMemo(
    () =>
      (tipItemsQuery.data?.items ?? [])
        .filter((item) => item.quantityOwned > 0)
        .filter((item) => item.metadata?.tipItem === true || item.metadata?.kind === "live-tip"),
    [tipItemsQuery.data?.items],
  );
  const tipTargets = useMemo(
    () =>
      remotePeers
        .map((peer) => ({
          userId: normalizeLiveUserId(peer.userId),
          label: peer.username || peer.guestName || `user-${peer.userId}`,
          peer,
        }))
        .filter((target): target is { userId: number; label: string; peer: LivePeer } =>
          Boolean(target.userId && target.userId !== viewerUserId && target.peer.isWtfUser),
        ),
    [remotePeers, viewerUserId],
  );
  const selectedTipItem = ownedTipItems.find((item) => item.sku === tipSku) ?? ownedTipItems[0] ?? null;
  const selectedTipTarget = tipTargets.find((target) => target.userId === tipTargetUserId) ?? tipTargets[0] ?? null;
  const sendTipMutation = useMutation({
    mutationFn: (input: { receiverUserId: number; sku: string }) =>
      api.post<LiveTipResponse>("/api/in-app-market/tips", {
        receiverUserId: input.receiverUserId,
        sku: input.sku,
        quantity: 1,
        roomId,
      }),
    onSuccess: (result) => {
      const receiverName = result.receiver.displayName || result.receiver.username;
      setTipStatus(`${result.item.name} sent to ${receiverName}.`);
      setStatus(`${result.item.name} sent to ${receiverName}.`);
      qc.invalidateQueries({ queryKey: ["wtfiam", "wtf_live"] });
      qc.invalidateQueries({ queryKey: ["in-app-market"] });
      sendRoomSocket({
        type: "wtf_live_chat_message",
        text: `${attendeeDisplayName} tipped ${receiverName} with ${result.item.name}.`,
        attachments: [],
        style: {
          ...DEFAULT_LIVE_CHAT_STYLE,
          color: "amber",
          bold: true,
        },
      });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Tip failed.";
      setTipStatus(message);
      setStatus(message);
    },
  });

  const updateStageAccessMutation = useMutation({
    mutationFn: () =>
      api.patch<{
        stage?: PublicRoom;
        members?: StagePermissionMember[];
        missingUsernames?: string[];
      }>(`/api/wtf-live/stages/${encodeURIComponent(roomId)}/access`, {
        hostUsernames: parseStageUsernames(stageHostList),
        speakerUsernames: parseStageUsernames(stageSpeakerList),
      }),
    onSuccess: (result) => {
      const members = result.members ?? [];
      const missing = result.missingUsernames ?? [];
      qc.setQueryData<PublicRoomResponse>(["wtf-live", "public-room", roomId, user?.id ?? "guest"], (current) => {
        if (!current) return current;
        return {
          ...current,
          room: result.stage ? { ...current.room, ...result.stage } : current.room,
          stagePermissions: current.stagePermissions
            ? {
                ...current.stagePermissions,
                hosts: members.filter((member) => member.role === "host"),
                speakers: members.filter((member) => member.role === "speaker"),
              }
            : current.stagePermissions,
        };
      });
      setStatus(
        missing.length
          ? `Stage roles saved. Missing WTF users: ${missing.join(", ")}`
          : "Stage hosts and speakers saved.",
      );
    },
    onError: (error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Could not save stage roles.");
    },
  });

  useMediaStream(cameraRef, cameraStream);
  useMediaStream(screenRef, screenStream);

  useEffect(() => {
    if (!tipSku && ownedTipItems[0]) setTipSku(ownedTipItems[0].sku);
  }, [ownedTipItems, tipSku]);

  useEffect(() => {
    if (!tipTargetUserId && tipTargets[0]) setTipTargetUserId(tipTargets[0].userId);
  }, [tipTargetUserId, tipTargets]);

  useEffect(() => {
    if (chatStyleOverriddenRef.current) return;
    setChatStyle(defaultLiveChatStyle);
  }, [defaultLiveChatStyle]);

  useEffect(() => {
    if (!chatStyleOverriddenRef.current) return;
    try {
      localStorage.setItem("wtf-live:chat-style", JSON.stringify(chatStyle));
    } catch {
      // Preference persistence is best-effort only.
    }
  }, [chatStyle]);

  useEffect(() => {
    try {
      localStorage.setItem(WTF_LIVE_CHAT_DEFAULT_FONT_STORAGE_KEY, roomDefaultFontPack);
    } catch {
      // Preference persistence is best-effort only.
    }
  }, [roomDefaultFontPack]);

  useEffect(() => {
    if (!isStageRoom || !canManageStageRoom) {
      setStageHostList("");
      setStageSpeakerList("");
      return;
    }
    setStageHostList((stagePermissions?.hosts ?? []).map((member) => member.username).join("\n"));
    setStageSpeakerList((stagePermissions?.speakers ?? []).map((member) => member.username).join("\n"));
  }, [canManageStageRoom, isStageRoom, stagePermissions?.hosts, stagePermissions?.speakers]);

  useEffect(() => {
    localStreamsRef.current = {
      micStream,
      cameraStream,
      screenStream,
      mediaStream: mediaDeck?.stream ?? null,
      mediaName: mediaDeck?.name ?? null,
      soundboardStream: soundboardOutputStream,
      activeVideoSource,
      audioEnabled: localAudioOpen,
      avatarUrl,
    };
  }, [activeVideoSource, avatarUrl, cameraStream, localAudioOpen, mediaDeck?.name, mediaDeck?.stream, micStream, screenStream, soundboardOutputStream]);

  useEffect(() => {
    if (canShareAudio && canShareCamera && canShareScreen && canShareMedia) return;
    if (!canShareAudio && micStream) {
      stopStream(micStream);
      setMicStream(null);
      setPushHeld(false);
    }
    if (!canShareCamera && cameraStream) {
      stopStream(cameraStream);
      setCameraStream(null);
    }
    if (!canShareScreen && screenStream) {
      stopStream(screenStream);
      setScreenStream(null);
    }
    if (!canShareMedia && mediaDeck) {
      closeMediaDeck("Stage media sharing is limited to hosts and speakers.");
    }
    if (activeVideoSource && ((activeVideoSource === "camera" && !canShareCamera) || (activeVideoSource === "screen" && !canShareScreen))) {
      setActiveVideoSource(null);
    }
  }, [activeVideoSource, cameraStream, canShareAudio, canShareCamera, canShareMedia, canShareScreen, mediaDeck, micStream, screenStream]);

  useEffect(() => {
    setWimFriendIds(readWimFriendIds(viewerUserId));
  }, [viewerUserId]);

  useEffect(() => {
    setSoundboardSettings(readWtfLiveSoundboardSettings(viewerUserId));
  }, [viewerUserId]);

  useEffect(() => {
    if (!viewerUserId || !soundboardQuery.data || canUseRoomSoundboard) return;
    setSoundboardSettings(normalizeWtfLiveSoundboardSettings(soundboardQuery.data));
  }, [canUseRoomSoundboard, soundboardQuery.data, viewerUserId]);

  useEffect(() => {
    if (!viewerUserId || !roomShowKitQuery.data || !canUseRoomSoundboard) return;
    setSoundboardSettings(normalizeWtfLiveSoundboardSettings(roomShowKitQuery.data.settings));
  }, [canUseRoomSoundboard, roomShowKitQuery.data, viewerUserId]);

  useEffect(() => {
    if (!runtimeRoomSettingsQuery.data?.settings) return;
    setRuntimeRoomSettings({
      allowGuestAudio: runtimeRoomSettingsQuery.data.settings.allowGuestAudio,
      allowGuestCamera: runtimeRoomSettingsQuery.data.settings.allowGuestCamera,
      allowGuestScreen: runtimeRoomSettingsQuery.data.settings.allowGuestScreen,
      allowGuestMedia: runtimeRoomSettingsQuery.data.settings.allowGuestMedia,
      showKitEnabled: runtimeRoomSettingsQuery.data.settings.showKitEnabled,
      showKitId: runtimeRoomSettingsQuery.data.settings.showKitId ?? null,
    });
  }, [runtimeRoomSettingsQuery.data?.settings]);

  useEffect(() => {
    const refreshSoundboard = () => {
      if (canUseRoomSoundboard) {
        void roomShowKitQuery.refetch();
        return;
      }
      setSoundboardSettings(readWtfLiveSoundboardSettings(viewerUserId));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === soundboardStorageKey) refreshSoundboard();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("wtf-live:soundboard-updated", refreshSoundboard);
    window.addEventListener("focus", refreshSoundboard);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("wtf-live:soundboard-updated", refreshSoundboard);
      window.removeEventListener("focus", refreshSoundboard);
    };
  }, [canUseRoomSoundboard, roomShowKitQuery.refetch, soundboardStorageKey, viewerUserId]);

  useEffect(() => {
    if (!canUseRoomSoundboard) {
      closeSoundboardGraph();
      return;
    }
    if (!joined || !socketReady) return;
    const stream = ensureSoundboardOutputStream();
    if (!stream) return;
    publishMediaState();
    void renegotiateAllPeers();
  }, [canUseRoomSoundboard, joined, socketReady]);

  useEffect(() => {
    if (!canUseRoomSoundboard || !joined || !socketReady || !soundboardSettings.armed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isWtfLiveShortcutEventTargetEditable(event.target)) return;
      const shortcut = shortcutFromWtfLiveKeyboardEvent(event);
      if (!shortcut) return;
      const clip = soundboardSettings.clips.find((candidate) => candidate.shortcut === shortcut);
      if (!clip) return;
      event.preventDefault();
      triggerSoundboardClip(clip, "shortcut");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [canUseRoomSoundboard, joined, socketReady, soundboardSettings]);

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
	    for (const timeoutId of reactionTimeoutsRef.current.values()) window.clearTimeout(timeoutId);
	    reactionTimeoutsRef.current.clear();
	    soundboardAudioRef.current.forEach((audio) => {
	      audio.pause();
	      audio.src = "";
	    });
	    soundboardAudioRef.current = [];
	    stopStream(localStreamsRef.current.micStream);
	    stopStream(localStreamsRef.current.cameraStream);
	    stopStream(localStreamsRef.current.screenStream);
	    closeMediaDeck("");
	    closeSoundboardGraph();
	  }, []);

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
	    lastMediaStateRef.current = emptyLiveMediaState(avatarUrl);
	    stopStream(localStreamsRef.current.micStream);
	    stopStream(localStreamsRef.current.cameraStream);
	    stopStream(localStreamsRef.current.screenStream);
	    closeMediaDeck("");
	    closeSoundboardGraph();
	    setMicStream(null);
	    setCameraStream(null);
	    setScreenStream(null);
	    setActiveVideoSource(null);
	    setPushHeld(false);
	    setChatEmojiOpen(false);
	    setRoomReactions([]);
	    for (const timeoutId of reactionTimeoutsRef.current.values()) window.clearTimeout(timeoutId);
	    reactionTimeoutsRef.current.clear();
	    stopSoundboardAudio("");
	    setPopoutFrames([]);
	    setRemotePeers([]);
	    setPeerDiagnostics({});
	    setSocketReady(false);
	    setJoined(false);
	    setPeerId(null);
    setStatus(nextStatus);
  }

  function currentMediaState() {
    return mediaStateFromStreams(localStreamsRef.current);
  }

  function hasAnyMedia(state: LiveMediaState) {
    return state.mic || state.camera || state.screen || state.screenAudio || state.mediaVideo || state.mediaAudio || state.soundboard;
  }

  function upsertRemotePeer(next: {
    peerId: string;
    guestName?: string;
    userId?: number | null;
    username?: string | null;
    isWtfUser?: boolean;
    mediaState?: Partial<LiveMediaState>;
    stream?: MediaStream;
    connected?: boolean;
  }) {
    if (!next.peerId || next.peerId === selfPeerIdRef.current) return;
    const stream = next.stream ?? remoteStreamsRef.current.get(next.peerId) ?? new MediaStream();
    remoteStreamsRef.current.set(next.peerId, stream);
    setRemotePeers((current) => {
      const existing = current.find((peer) => peer.peerId === next.peerId);
      const nextUserId = normalizeLiveUserId(next.userId) ?? existing?.userId ?? null;
      const nextUsername = next.username?.trim() || existing?.username || null;
      const nextIsWtfUser = Boolean(next.isWtfUser ?? existing?.isWtfUser ?? nextUserId);
      const updated: LivePeer = {
        peerId: next.peerId,
        guestName: next.guestName?.trim() || nextUsername || existing?.guestName || "guest",
        userId: nextUserId,
        username: nextUsername,
        isWtfUser: nextIsWtfUser,
        mediaState: normalizeMediaState(next.mediaState ?? existing?.mediaState),
        stream,
        connected: next.connected ?? existing?.connected ?? false,
      };
      const others = current.filter((peer) => peer.peerId !== next.peerId);
      return [...others, updated].sort((a, b) => livePeerName(a).localeCompare(livePeerName(b), undefined, { sensitivity: "base" }));
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
    addStreamTracks(localStreamsRef.current.micStream, "audio");
    addStreamTracks(localStreamsRef.current.soundboardStream, "audio");
    addStreamTracks(localStreamsRef.current.cameraStream, "video");
    addStreamTracks(localStreamsRef.current.screenStream, "video");
    addStreamTracks(localStreamsRef.current.screenStream, "audio");
    addStreamTracks(localStreamsRef.current.mediaStream);

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

  function addRoomReaction(reaction: LiveRoomReaction) {
    setRoomReactions((current) => {
      const next = current.filter((item) => item.id !== reaction.id);
      return [...next, reaction].slice(-24);
    });
    const existingTimeout = reactionTimeoutsRef.current.get(reaction.id);
    if (existingTimeout) window.clearTimeout(existingTimeout);
    const timeoutId = window.setTimeout(() => {
      reactionTimeoutsRef.current.delete(reaction.id);
      setRoomReactions((current) => current.filter((item) => item.id !== reaction.id));
    }, 2800);
    reactionTimeoutsRef.current.set(reaction.id, timeoutId);
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
          userId: peer.userId,
          username: peer.username,
          isWtfUser: peer.isWtfUser,
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
        userId: event.peer.userId,
        username: event.peer.username,
        isWtfUser: event.peer.isWtfUser,
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
        userId: event.userId,
        username: event.username,
        isWtfUser: event.isWtfUser,
        mediaState: event.mediaState,
      });
      return;
    }

    if (event.type === "wtf_live_signal") {
      void handleSignal(event.fromPeerId, event.signal);
      return;
    }

    if (event.type === "wtf_live_chat_message" && typeof event.message === "object" && event.message) {
      const eventMessage = event.message as LiveChatMessage;
      const liveMessage = {
        ...eventMessage,
        style: eventMessage.style ? normalizeLiveChatStyle(eventMessage.style) : undefined,
      };
      setLiveMessages((current) => {
        if (current.some((message) => message.id === liveMessage.id)) return current;
        return [...current, liveMessage].slice(-120);
      });
      return;
    }

    if (event.type === "wtf_live_room_reaction") {
      const reaction = normalizeLiveRoomReaction(event.reaction);
      if (reaction) addRoomReaction(reaction);
      return;
    }

    if (event.type === "wtf_live_soundboard_clip") {
      const clip = normalizeWtfLiveSoundboardClip(event.soundboardClip);
      if (!clip) return;
      const hostName = event.triggeredByName || "Host";
      setSoundboardStatus(`${hostName}: ${clip.label}`);
      setStatus(`Soundboard: ${clip.label}`);
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
	    lastMediaStateRef.current = emptyLiveMediaState(avatarUrl);
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
	      previousMediaState.screenAudio !== nextMediaState.screenAudio ||
	      previousMediaState.mediaVideo !== nextMediaState.mediaVideo ||
	      previousMediaState.mediaAudio !== nextMediaState.mediaAudio ||
	      previousMediaState.soundboard !== nextMediaState.soundboard ||
	      previousMediaState.activeVideo !== nextMediaState.activeVideo ||
	      previousMediaState.cameraTrackId !== nextMediaState.cameraTrackId ||
	      previousMediaState.screenTrackId !== nextMediaState.screenTrackId ||
	      previousMediaState.mediaVideoTrackId !== nextMediaState.mediaVideoTrackId ||
	      previousMediaState.mediaAudioTrackId !== nextMediaState.mediaAudioTrackId;
	    if (needsRenegotiation) {
	      void renegotiateAllPeers();
	    }
	    lastMediaStateRef.current = nextMediaState;
	  }, [activeVideoSource, avatarUrl, joined, localAudioOpen, mediaDeck?.muted, mediaDeck?.name, mediaDeck?.playing, mediaDeck?.stream, socketReady, micStream, cameraStream, screenStream, soundboardOutputStream]);

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

  function addWimBuddy(peer: LivePeer) {
    const targetUserId = normalizeLiveUserId(peer.userId);
    if (!viewerUserId || !targetUserId || targetUserId === viewerUserId) return;
    const targetName = peer.username || peer.guestName || `user-${targetUserId}`;
    setWimFriendIds((current) => {
      if (current.includes(targetUserId)) return current;
      const next = [...current, targetUserId].sort((a, b) => a - b);
      writeWimFriendIds(viewerUserId, next);
      return next;
    });
    setStatus(`Added @${targetName} to WIM buddies.`);
    void api
      .post<{ ok: true }>("/api/desktop/events", {
        eventType: "wim.friend.added",
        objectId: `wim-user:${targetUserId}`,
        objectKind: "messenger_friend",
        action: "added",
        metadata: {
          userId: targetUserId,
          username: targetName,
          source: "wtf-live-attendance",
          roomId,
        },
      })
      .catch(() => {
        // Buddy shortcuts are local-first; telemetry should not block the room.
      });
  }

  function openTipTrayForPeer(peer?: LivePeer) {
    if (!viewerUserId) {
      setStatus("Sign in to send WTF LIVE tip items.");
      return;
    }
    if (peer) {
      const targetUserId = normalizeLiveUserId(peer.userId);
      if (targetUserId && targetUserId !== viewerUserId) {
        setTipTargetUserId(targetUserId);
      }
    }
    if (!ownedTipItems.length) {
      setTipStatus("Buy WTF LIVE tip items in WTFIAM before tipping.");
    } else {
      setTipStatus("");
    }
    setAttendanceOpen(true);
    setTipTrayOpen(true);
  }

  function openTipTrayFromCommand(commandText: string) {
    const [, rawTarget] = commandText.trim().split(/\s+/, 2);
    if (rawTarget) {
      const normalizedTarget = rawTarget.replace(/^@/, "").toLowerCase();
      const target = tipTargets.find(
        (candidate) =>
          candidate.label.replace(/^@/, "").toLowerCase() === normalizedTarget ||
          candidate.peer.guestName.replace(/^@/, "").toLowerCase() === normalizedTarget,
      );
      if (target) setTipTargetUserId(target.userId);
    }
    setChatText("");
    openTipTrayForPeer();
  }

  function sendSelectedTip() {
    if (!selectedTipTarget || !selectedTipItem) {
      setTipStatus("Select a WTF user and an owned tip item.");
      return;
    }
    sendTipMutation.mutate({
      receiverUserId: selectedTipTarget.userId,
      sku: selectedTipItem.sku,
    });
  }

  function joinRoom() {
    const name = signedInUsername || guestName.trim() || "guest";
    if (!signedInUsername) {
      localStorage.setItem("wtf-live:guest-name", name);
      setGuestName(name);
    }
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
    if (!canShareAudio) {
      setStatus("Only the stage owner, hosts, and speakers can use mic in this stage.");
      return;
    }
    if (micStream) {
      stopStream(micStream);
      setMicStream(null);
      setStatus("Mic off.");
      return;
    }
    const browserLabel = browserMediaLabel();
    if (!isMicSecureContext()) {
      const nextDiagnostic: MicDiagnosticState = {
        status: "unsupported",
        headline: "Microphone requires HTTPS or localhost.",
        detail: "Open WTF LIVE from the public HTTPS URL. Mobile and privacy browsers will not expose microphone capture on insecure pages.",
        browserLabel,
        permissionLabel: "Permission: not checked",
        deviceLabel: "Device: not checked",
      };
      setMicDiagnostic(nextDiagnostic);
      setStatus(nextDiagnostic.headline);
      return;
    }
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      const nextDiagnostic: MicDiagnosticState = {
        status: "unsupported",
        headline: "This browser cannot open a microphone.",
        detail: "Update the browser or try a current Chrome, Safari, Firefox, or Edge build with microphone capture enabled.",
        browserLabel,
        permissionLabel: "Permission: unavailable",
        deviceLabel: "Device: not checked",
      };
      setMicDiagnostic(nextDiagnostic);
      setStatus(nextDiagnostic.headline);
      return;
    }
    const permission = await queryMicrophonePermission();
    const deviceLabel = await describeAudioInputs(mediaDevices);
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      const nextDiagnostic: MicDiagnosticState = {
        status: "ok",
        headline: "Mic is on for this room.",
        detail: "Audio opened successfully. Use Push-to-talk if you want the mic permission ready while staying muted.",
        browserLabel,
        permissionLabel: permission.label,
        deviceLabel: await describeAudioInputs(mediaDevices),
      };
      setMicDiagnostic(nextDiagnostic);
      setStatus("Mic ready.");
    } catch (error) {
      const nextDiagnostic = micDiagnosticFromFailure(error, permission.label, deviceLabel, browserLabel);
      setMicDiagnostic(nextDiagnostic);
      setStatus(nextDiagnostic.headline);
    }
  }

  async function runMicDiagnostic() {
    const checkingDiagnostic: MicDiagnosticState = {
      status: "checking",
      headline: "Checking microphone...",
      detail: "The browser may show a microphone prompt. WTF LIVE will stop the test track immediately after the check.",
      browserLabel: browserMediaLabel(),
      permissionLabel: "Permission: checking",
      deviceLabel: "Device: checking",
    };
    setMicDiagnostic(checkingDiagnostic);
    setStatus("Checking microphone...");

    const browserLabel = browserMediaLabel();
    if (!isMicSecureContext()) {
      const nextDiagnostic: MicDiagnosticState = {
        status: "unsupported",
        headline: "Microphone requires HTTPS or localhost.",
        detail: "Use the public HTTPS room URL on mobile. Browsers hide microphone APIs on insecure pages.",
        browserLabel,
        permissionLabel: "Permission: not checked",
        deviceLabel: "Device: not checked",
      };
      setMicDiagnostic(nextDiagnostic);
      setStatus(nextDiagnostic.headline);
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      const nextDiagnostic: MicDiagnosticState = {
        status: "unsupported",
        headline: "This browser does not expose microphone capture.",
        detail: "Try a current Chrome, Safari, Firefox, or Edge browser. In privacy browsers, disable site shields that block camera and microphone APIs.",
        browserLabel,
        permissionLabel: "Permission: unavailable",
        deviceLabel: "Device: not checked",
      };
      setMicDiagnostic(nextDiagnostic);
      setStatus(nextDiagnostic.headline);
      return;
    }

    const permission = await queryMicrophonePermission();
    const deviceLabel = await describeAudioInputs(mediaDevices);
    if (permission.state === "denied") {
      const nextDiagnostic: MicDiagnosticState = {
        status: "blocked",
        headline: "Microphone is blocked in this browser.",
        detail: "Open this site's microphone permission and set it to Allow. If it still fails after that, check the operating-system microphone permission for this browser.",
        browserLabel,
        permissionLabel: permission.label,
        deviceLabel,
      };
      setMicDiagnostic(nextDiagnostic);
      setStatus(nextDiagnostic.headline);
      return;
    }

    if (micStream) {
      const nextDiagnostic: MicDiagnosticState = {
        status: "ok",
        headline: "Mic is already on.",
        detail: "The room already has an open microphone stream, so no extra test stream was created.",
        browserLabel,
        permissionLabel: permission.label,
        deviceLabel,
      };
      setMicDiagnostic(nextDiagnostic);
      setStatus(nextDiagnostic.headline);
      return;
    }

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      const hasAudioTrack = stream.getAudioTracks().length > 0;
      stopStream(stream);
      const nextDiagnostic: MicDiagnosticState = hasAudioTrack
        ? {
            status: "ok",
            headline: "Mic test passed.",
            detail: "WTF LIVE opened the microphone and stopped the test stream. You can join the room and turn on Mic when ready.",
            browserLabel,
            permissionLabel: permission.label,
            deviceLabel: await describeAudioInputs(mediaDevices),
          }
        : {
            status: "warn",
            headline: "Mic opened but returned no audio track.",
            detail: "Choose another input device in the browser or operating-system sound settings, then run Test mic again.",
            browserLabel,
            permissionLabel: permission.label,
            deviceLabel,
          };
      setMicDiagnostic(nextDiagnostic);
      setStatus(nextDiagnostic.headline);
    } catch (error) {
      const nextDiagnostic = micDiagnosticFromFailure(error, permission.label, deviceLabel, browserLabel);
      setMicDiagnostic(nextDiagnostic);
      setStatus(nextDiagnostic.headline);
    }
  }

  async function toggleCamera() {
    if (!canShareCamera) {
      setStatus("Only the stage owner, hosts, and speakers can share camera in this stage.");
      return;
    }
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
    if (!canShareScreen) {
      setStatus("Only the stage owner, hosts, and speakers can share screen in this stage.");
      return;
    }
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
    if ((source === "camera" && !canShareCamera) || (source === "screen" && !canShareScreen)) {
      setStatus("Only the stage owner, hosts, and speakers can choose a stage focus.");
      return;
    }
    const canSelect = source === "camera" ? hasLiveTrack(cameraStream, "video") : hasLiveTrack(screenStream, "video");
    if (!canSelect) {
      setStatus(source === "camera" ? "Turn camera on before sharing it." : "Start screen share before sharing it.");
      return;
    }
    setActiveVideoSource(source);
    setStatus(source === "camera" ? "Camera is the preferred stage focus." : "Screen is the preferred stage focus.");
  }

  function closeMediaDeck(nextStatus = "Media deck cleared.") {
    const element = mediaDeckElementRef.current;
    mediaDeckElementRef.current = null;
    if (element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    const current = mediaDeckRef.current;
    mediaDeckRef.current = null;
    if (current) {
      stopStream(current.stream);
      URL.revokeObjectURL(current.objectUrl);
    }
    localStreamsRef.current.mediaStream = null;
    localStreamsRef.current.mediaName = null;
    setMediaDeck(null);
    if (nextStatus) setStatus(nextStatus);
  }

  async function handleMediaDeckInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!canShareMedia) {
      setStatus("Only the stage owner, hosts, and speakers can share media in this stage.");
      return;
    }
    if (!isLiveMediaDeckFile(file)) {
      setStatus("Choose an audio or video file for the media deck.");
      return;
    }
    if (file.size > MAX_LIVE_MEDIA_DECK_BYTES) {
      setStatus("Media deck files are limited to 100 MB.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const kind: MediaDeckState["kind"] = file.type.startsWith("video/") || /\.(?:mp4|webm)$/i.test(file.name) ? "video" : "audio";
    const element = document.createElement(kind) as HTMLMediaElement;
    element.preload = "auto";
    element.loop = false;
    element.muted = false;
    element.volume = 0.82;
    element.src = objectUrl;
    if (kind === "video") {
      (element as HTMLVideoElement).playsInline = true;
    }
    const stream = mediaElementCaptureStream(element);
    if (!stream) {
      URL.revokeObjectURL(objectUrl);
      setStatus("This browser cannot share local media files.");
      return;
    }
    closeMediaDeck("");
    mediaDeckElementRef.current = element;
    const syncDeck = () => {
      setMediaDeck((current) => {
        if (!current || current.objectUrl !== objectUrl) return current;
        const next = {
          ...current,
          playing: !element.paused && !element.ended,
          duration: Number.isFinite(element.duration) ? element.duration : current.duration,
          currentTime: Number.isFinite(element.currentTime) ? element.currentTime : current.currentTime,
        };
        mediaDeckRef.current = next;
        return next;
      });
    };
    element.addEventListener("play", syncDeck);
    element.addEventListener("pause", syncDeck);
    element.addEventListener("ended", syncDeck);
    element.addEventListener("durationchange", syncDeck);
    element.addEventListener("timeupdate", syncDeck);
    stream.addEventListener("addtrack", syncDeck);
    element.load();
    const nextDeck: MediaDeckState = {
      name: sanitizeStageMediaName(file.name) || "Media file",
      kind,
      objectUrl,
      stream,
      playing: false,
      loop: false,
      muted: false,
      volume: 82,
      duration: null,
      currentTime: 0,
    };
    mediaDeckRef.current = nextDeck;
    setMediaDeck(nextDeck);
    setStatus(`${nextDeck.name} loaded into the media deck.`);
  }

  async function toggleMediaDeckPlayback() {
    if (!canShareMedia) {
      setStatus("Only the stage owner, hosts, and speakers can share media in this stage.");
      return;
    }
    const deck = mediaDeckRef.current;
    const element = mediaDeckElementRef.current;
    if (!deck || !element) {
      mediaFileInputRef.current?.click();
      return;
    }
    if (deck.playing) {
      element.pause();
      setMediaDeck((current) => current ? { ...current, playing: false } : current);
      setStatus("Media deck paused.");
      return;
    }
    try {
      await element.play();
      const nextDeck = { ...deck, playing: true };
      mediaDeckRef.current = nextDeck;
      setMediaDeck((current) => current ? { ...current, playing: true } : current);
      setStatus(`${deck.name} playing to the room.`);
    } catch {
      setStatus("Media playback was blocked. Press Play again in the room.");
    }
  }

  function setMediaDeckVolume(volume: number) {
    const nextVolume = Math.max(0, Math.min(100, Math.round(volume)));
    const element = mediaDeckElementRef.current;
    if (element) element.volume = nextVolume / 100;
    setMediaDeck((current) => {
      if (!current) return current;
      const next = { ...current, volume: nextVolume };
      mediaDeckRef.current = next;
      return next;
    });
  }

  function toggleMediaDeckLoop() {
    const element = mediaDeckElementRef.current;
    setMediaDeck((current) => {
      if (!current) return current;
      const next = { ...current, loop: !current.loop };
      if (element) element.loop = next.loop;
      mediaDeckRef.current = next;
      return next;
    });
  }

  function toggleMediaDeckMuted() {
    const element = mediaDeckElementRef.current;
    setMediaDeck((current) => {
      if (!current) return current;
      const next = { ...current, muted: !current.muted };
      if (element) element.muted = next.muted;
      next.stream.getAudioTracks().forEach((track) => {
        track.enabled = !next.muted;
      });
      mediaDeckRef.current = next;
      return next;
    });
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

  function updateChatStyle(next: Partial<LiveChatStyle>) {
    chatStyleOverriddenRef.current = true;
    setChatStyle((current) => normalizeLiveChatStyle({ ...current, ...next }));
  }

  function resetChatStyle() {
    chatStyleOverriddenRef.current = false;
    try {
      localStorage.removeItem("wtf-live:chat-style");
    } catch {
      // Preference persistence is best-effort only.
    }
    setChatStyle(defaultLiveChatStyle);
  }

  function insertChatEmoji(emoji: string) {
    const input = chatTextAreaRef.current;
    const start = input?.selectionStart ?? chatText.length;
    const end = input?.selectionEnd ?? start;
    const next = `${chatText.slice(0, start)}${emoji}${chatText.slice(end)}`.slice(0, 1200);
    const cursor = Math.min(start + emoji.length, next.length);
    setChatText(next);
    setChatEmojiOpen(false);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    });
  }

  function handleChatEmojiPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    setChatEmojiOpen(false);
  }

  function sendRoomReaction(option: (typeof LIVE_ROOM_REACTION_OPTIONS)[number]) {
    if (!joined || !socketReady) {
      setStatus("Join the room before reacting.");
      return;
    }
    if (!sendRoomSocket({ type: "wtf_live_room_reaction", emoji: option.emoji })) {
      setStatus("Room reactions are not connected.");
    }
  }

  function ensureSoundboardOutputStream(): MediaStream | null {
    if (soundboardDestinationRef.current) return soundboardDestinationRef.current.stream;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setSoundboardStatus("This browser cannot inject Show Kit audio.");
      return null;
    }
    const context = new AudioContextCtor();
    const destination = context.createMediaStreamDestination();
    soundboardAudioContextRef.current = context;
    soundboardDestinationRef.current = destination;
    localStreamsRef.current.soundboardStream = destination.stream;
    setSoundboardOutputStream(destination.stream);
    return destination.stream;
  }

  function closeSoundboardGraph() {
    stopSoundboardAudio("");
    const context = soundboardAudioContextRef.current;
    soundboardAudioContextRef.current = null;
    soundboardDestinationRef.current = null;
    localStreamsRef.current.soundboardStream = null;
    setSoundboardOutputStream(null);
    void context?.close().catch(() => undefined);
  }

  async function injectSoundboardClip(clip: WtfLiveSoundboardClip): Promise<boolean> {
    const stream = ensureSoundboardOutputStream();
    const context = soundboardAudioContextRef.current;
    const destination = soundboardDestinationRef.current;
    if (!stream || !context || !destination) return false;
    try {
      await context.resume();
      const audioBuffer = await context.decodeAudioData(soundboardDataUrlToArrayBuffer(clip.dataUrl));
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = audioBuffer;
      gain.gain.value = volumeToAudioGain(clip.volume);
      source.connect(gain);
      gain.connect(destination);
      gain.connect(context.destination);
      soundboardSourcesRef.current.add(source);
      source.onended = () => {
        soundboardSourcesRef.current.delete(source);
        source.disconnect();
        gain.disconnect();
      };
      source.start();
      return true;
    } catch {
      return false;
    }
  }

  function trackSoundboardAudio(audio: HTMLAudioElement) {
    soundboardAudioRef.current = [...soundboardAudioRef.current, audio].slice(-8);
    const remove = () => {
      soundboardAudioRef.current = soundboardAudioRef.current.filter((item) => item !== audio);
    };
    audio.addEventListener("ended", remove, { once: true });
    audio.addEventListener("error", remove, { once: true });
  }

  async function playSoundboardClip(clip: WtfLiveSoundboardClip, inject = false) {
    if (inject && await injectSoundboardClip(clip)) return;
    const audio = playWtfLiveSoundboardClip(clip, volumeToAudioGain(clip.volume));
    trackSoundboardAudio(audio);
  }

  function stopSoundboardAudio(nextStatus = "Soundboard stopped.") {
    soundboardSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source nodes can only be stopped once.
      }
    });
    soundboardSourcesRef.current.clear();
    soundboardAudioRef.current.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    soundboardAudioRef.current = [];
    if (nextStatus) setSoundboardStatus(nextStatus);
  }

  async function triggerSoundboardClip(clip: WtfLiveSoundboardClip, source: "button" | "shortcut") {
    if (!canUseRoomSoundboard) {
      setSoundboardStatus("Only the room owner can trigger Show Kit audio.");
      return;
    }
    if (!joined || !socketReady) {
      setSoundboardStatus("Join the room before triggering Show Kit audio.");
      return;
    }
    const now = Date.now();
    const readyAt = soundboardCooldownRef.current.get(clip.id) ?? 0;
    if (readyAt > now) {
      if (readyAt === Number.POSITIVE_INFINITY) {
        setSoundboardStatus(`${clip.label} is already being sent.`);
        return;
      }
      const seconds = Math.max(1, Math.ceil((readyAt - now) / 1000));
      setSoundboardStatus(`${clip.label} is cooling down for ${seconds}s.`);
      return;
    }
    const cooldownMs = Math.max(0, clip.cooldownMs);
    if (cooldownMs > 0) {
      soundboardCooldownRef.current.set(clip.id, Number.POSITIVE_INFINITY);
    }
    await playSoundboardClip(clip, true);
    const sent = sendRoomSocket({
      type: "wtf_live_soundboard_clip",
      clip,
      delivery: "webrtc",
    });
    if (!sent) {
      soundboardCooldownRef.current.delete(clip.id);
      setSoundboardStatus("Soundboard relay is not connected.");
      return;
    }
    if (cooldownMs > 0) {
      soundboardCooldownRef.current.set(clip.id, Date.now() + cooldownMs);
    }
    const suffix = source === "shortcut" && clip.shortcut ? ` via ${clip.shortcut}` : "";
    setSoundboardStatus(`${clip.label} sent${suffix}.`);
    setStatus(`Soundboard: ${clip.label} sent.`);
  }

	  function sendLiveChat() {
	    const text = chatText.trim();
	    if (!text && chatAttachments.length === 0) {
	      setStatus("Type a message or attach media first.");
      return;
    }
    if (text.toLowerCase().startsWith("/tip")) {
      openTipTrayFromCommand(text);
      return;
    }
    const payload = {
      type: "wtf_live_chat_message",
      text,
      attachments: chatAttachments,
      ...(chatStyleOverriddenRef.current ? { style: normalizeLiveChatStyle(chatStyle) } : {}),
    };
    if (!socketReady || !sendRoomSocket(payload)) {
      setStatus("Room chat is not connected.");
      return;
    }
	    setChatText("");
	    setChatAttachments([]);
	  }

  function handleChatKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendLiveChat();
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

		  function frameBasePosition(offset = popoutFrameCountRef.current) {
		    const width = Math.min(760, Math.max(360, Math.round(window.innerWidth * 0.54)));
		    const height = Math.min(520, Math.max(260, Math.round(window.innerHeight * 0.48)));
		    return {
		      x: Math.max(12, Math.min(window.innerWidth - width - 12, 72 + offset * 22)),
		      y: Math.max(12, Math.min(window.innerHeight - height - 12, 64 + offset * 18)),
		      width,
		      height,
		      maximized: false,
		      pinned: false,
		    };
		  }

		  function upsertPopoutFrame(frame: PopoutFrame) {
		    setPopoutFrames((current) => {
		      const existing = current.find((item) => item.id === frame.id);
		      const next = existing
		        ? [...current.filter((item) => item.id !== frame.id), { ...existing, title: frame.title }]
		        : [...current, frame].slice(-8);
		      return [...next.filter((item) => !item.pinned), ...next.filter((item) => item.pinned)];
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

	  function openStagePopout(entry: StageEntry) {
	    if (!entry.stream?.getVideoTracks().some((track) => track.readyState === "live")) return;
	    upsertPopoutFrame({
	      id: `${entry.isSelf ? "local" : "remote"}-${entry.peerId}-${entry.source}`,
	      title: entry.title,
	      kind: "stream",
	      streamScope: entry.isSelf ? "local" : "remote",
	      source: entry.source,
		      peerId: entry.isSelf ? undefined : entry.peerId,
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

		  function openPanelPopout(panel: BentoPanelId) {
		    const panelIndex = BENTO_PANEL_ORDER.indexOf(panel);
		    const base = frameBasePosition(panelIndex >= 0 ? panelIndex : 0);
		    const sizeByPanel: Record<BentoPanelId, { width: number; height: number }> = {
		      connection: { width: 380, height: 360 },
		      sharing: { width: 420, height: 720 },
		      screens: { width: 980, height: 680 },
		      attendance: { width: 420, height: 560 },
		      chat: { width: 520, height: 640 },
		    };
		    const preferredSize = sizeByPanel[panel];
		    upsertPopoutFrame({
		      id: `panel-${panel}`,
		      title: BENTO_PANEL_LABELS[panel],
		      kind: "panel",
		      panel,
		      ...base,
		      width: Math.min(window.innerWidth - 24, preferredSize.width),
		      height: Math.min(window.innerHeight - 24, preferredSize.height),
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

		  function togglePopoutPinned(frameId: string) {
		    setPopoutFrames((current) => {
		      const next = current.map((frame) => frame.id === frameId ? { ...frame, pinned: !frame.pinned } : frame);
		      return [...next.filter((frame) => !frame.pinned), ...next.filter((frame) => frame.pinned)];
		    });
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
		    if (frame.maximized || frame.pinned || event.button !== 0) return;
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

		  function handleBentoDragStart(event: ReactDragEvent<HTMLElement>, panel: BentoPanelId) {
		    setDraggingBentoPanel(panel);
		    event.dataTransfer.effectAllowed = "move";
		    event.dataTransfer.setData("text/plain", panel);
		  }

		  function handleBentoDragOver(event: ReactDragEvent<HTMLElement>) {
		    event.preventDefault();
		    event.dataTransfer.dropEffect = "move";
		  }

		  function handleBentoDrop(event: ReactDragEvent<HTMLElement>, targetPanel: BentoPanelId) {
		    event.preventDefault();
		    const sourcePanel = event.dataTransfer.getData("text/plain") as BentoPanelId || draggingBentoPanel;
		    if (!sourcePanel || sourcePanel === targetPanel || !BENTO_PANEL_ORDER.includes(sourcePanel)) {
		      setDraggingBentoPanel(null);
		      return;
		    }
		    setBentoOrder((current) => {
		      const next = current.filter((panel) => panel !== sourcePanel);
		      const targetIndex = Math.max(0, next.indexOf(targetPanel));
		      next.splice(targetIndex, 0, sourcePanel);
		      return next;
		    });
		    setDraggingBentoPanel(null);
		  }

  function addStageEntriesToScreenGrid(entryIds: string[]) {
    const validIds = new Set(stageEntries.map((entry) => entry.id));
    const nextIds = entryIds.filter((entryId) => validIds.has(entryId));
    if (!nextIds.length) return;
    setScreenGridEntryIds((current) => {
      const next = [...current];
      for (const entryId of nextIds) {
        if (!next.includes(entryId)) next.push(entryId);
      }
      return next;
    });
  }

  function handleStageEntryDragStart(entryId: string) {
    setDraggingStageEntryId(entryId);
  }

  function handleStageEntryDropOn(targetEntryId: string) {
    const sourceEntryId = draggingStageEntryId;
    setDraggingStageEntryId(null);
    if (!sourceEntryId || sourceEntryId === targetEntryId) return;
    addStageEntriesToScreenGrid([sourceEntryId, targetEntryId]);
  }

  function handleScreenGridDrop(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    const sourceEntryId = event.dataTransfer.getData("text/plain") || draggingStageEntryId;
    setDraggingStageEntryId(null);
    if (!sourceEntryId) return;
    addStageEntriesToScreenGrid([sourceEntryId]);
  }

  const messages = messagesQuery.data?.messages ?? [];
  const canSendChat = joined && socketReady && (Boolean(chatText.trim()) || chatAttachments.length > 0);
  const mediaDeckStream = mediaDeck?.stream ?? null;
  const stageStreamCache = stageStreamCacheRef.current;
  const localMediaState = useMemo(
    () =>
      mediaStateFromStreams({
        micStream,
        cameraStream,
        screenStream,
        mediaStream: mediaDeckStream,
        mediaName: mediaDeck?.name ?? null,
        soundboardStream: soundboardOutputStream,
        activeVideoSource,
        audioEnabled: localAudioOpen,
        avatarUrl,
      }),
    [activeVideoSource, avatarUrl, cameraStream, localAudioOpen, mediaDeck?.name, mediaDeckStream, micStream, screenStream, soundboardOutputStream],
  );
  const localStageEntries: StageEntry[] = useMemo(
    () =>
      joined
        ? ([
            localMediaState.camera
              ? {
                  id: "self-camera",
                  peerId: "self",
                  name: attendeeDisplayName,
                  source: "camera" as const,
                  title: `${attendeeDisplayName} camera`,
                  mediaState: localMediaState,
                  stream: cachedStageStream(stageStreamCache, "self-camera", cameraStream, localMediaState, "camera"),
                  connected: socketReady,
                  isSelf: true,
                }
              : null,
            localMediaState.screen
              ? {
                  id: "self-screen",
                  peerId: "self",
                  name: attendeeDisplayName,
                  source: "screen" as const,
                  title: `${attendeeDisplayName} screen`,
                  mediaState: localMediaState,
                  stream: cachedStageStream(stageStreamCache, "self-screen", screenStream, localMediaState, "screen"),
                  connected: socketReady,
                  isSelf: true,
                }
              : null,
            localMediaState.mediaVideo || localMediaState.mediaAudio
              ? {
                  id: "self-media",
                  peerId: "self",
                  name: attendeeDisplayName,
                  source: "media" as const,
                  title: `${attendeeDisplayName} media`,
                  mediaState: localMediaState,
                  stream: cachedStageStream(stageStreamCache, "self-media", mediaDeckStream, localMediaState, "media"),
                  connected: socketReady,
                  isSelf: true,
                }
              : null,
          ] as Array<StageEntry | null>).filter((entry): entry is StageEntry => Boolean(entry))
        : [],
    [attendeeDisplayName, cameraStream, joined, localMediaState, mediaDeckStream, screenStream, socketReady, stageStreamCache],
  );
  const remoteStageEntries: StageEntry[] = useMemo(
    () =>
      remotePeers.flatMap((peer) => {
        const name = livePeerName(peer);
        return ([
          peer.mediaState.camera
            ? {
                id: `${peer.peerId}-camera`,
                peerId: peer.peerId,
                name,
                source: "camera" as const,
                title: `${name} camera`,
                mediaState: peer.mediaState,
                stream: cachedStageStream(stageStreamCache, `${peer.peerId}-camera`, peer.stream, peer.mediaState, "camera"),
                connected: peer.connected,
              }
            : null,
          peer.mediaState.screen
            ? {
                id: `${peer.peerId}-screen`,
                peerId: peer.peerId,
                name,
                source: "screen" as const,
                title: `${name} screen`,
                mediaState: peer.mediaState,
                stream: cachedStageStream(stageStreamCache, `${peer.peerId}-screen`, peer.stream, peer.mediaState, "screen"),
                connected: peer.connected,
              }
            : null,
          peer.mediaState.mediaVideo || peer.mediaState.mediaAudio
            ? {
                id: `${peer.peerId}-media`,
                peerId: peer.peerId,
                name,
                source: "media" as const,
                title: `${name} media`,
                mediaState: peer.mediaState,
                stream: cachedStageStream(stageStreamCache, `${peer.peerId}-media`, peer.stream, peer.mediaState, "media"),
                connected: peer.connected,
              }
            : null,
        ] as Array<StageEntry | null>).filter((entry): entry is StageEntry => Boolean(entry));
      }),
    [remotePeers, stageStreamCache],
  );
  const stageEntries = useMemo(() => [...localStageEntries, ...remoteStageEntries], [localStageEntries, remoteStageEntries]);
  useEffect(() => {
    const validIds = new Set(stageEntries.map((entry) => entry.id));
    setScreenGridEntryIds((current) => current.filter((entryId) => validIds.has(entryId)));
  }, [stageEntries]);
  const stageCount = stageEntries.length;
	  const participantCount = remotePeers.length + (joined ? 1 : 0);
	  const openMicCount = remotePeers.filter((peer) => peer.mediaState.audioOpen).length + (localMediaState.audioOpen ? 1 : 0);
  const sourceCountLabel = labelForMediaState(localMediaState);
  const activeShareLabel = activeVideoSource === "screen"
    ? "Screen focus"
    : activeVideoSource === "camera"
      ? "Camera focus"
      : "No focus";
  const connectionDetached = popoutFrames.some((frame) => frame.kind === "panel" && frame.panel === "connection");
  const sharingDetached = popoutFrames.some((frame) => frame.kind === "panel" && frame.panel === "sharing");
  const screensDetached = popoutFrames.some((frame) => frame.kind === "panel" && frame.panel === "screens");
  const attendanceDetached = popoutFrames.some((frame) => frame.kind === "panel" && frame.panel === "attendance");
  const chatDetached = popoutFrames.some((frame) => frame.kind === "panel" && frame.panel === "chat");

  if (authLoading || roomQuery.isLoading) {
    return (
      <GuestShell>
	      <RoomFrame data-wtf-live-room-frame>
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
	      <RoomFrame data-wtf-live-room-frame="room">
          <TitleBar>WTF LIVE</TitleBar>
          <Panel style={{ margin: 10 }}>
            <strong>Room not found.</strong>
            <span>This room link is no longer available.</span>
          </Panel>
        </RoomFrame>
      </GuestShell>
    );
  }

  function renderAttendeeRow(entry: {
    id: string;
    name: string;
    userId?: number | null;
    username?: string | null;
    isWtfUser?: boolean;
    avatarUrl?: string | null;
    mediaState: LiveMediaState;
    connected?: boolean;
    diagnostic?: PeerDiagnostic;
    self?: boolean;
    peer?: LivePeer;
  }) {
    const attendeeUserId = normalizeLiveUserId(entry.userId);
    const entryName = entry.username || entry.name || "guest";
    const stateLabel = labelForMediaState(entry.mediaState, entry.connected ?? true);
    const health = entry.diagnostic?.health ?? (entry.connected ? "good" : "connecting");
    const canAddWimBuddy = Boolean(
      viewerUserId &&
        attendeeUserId &&
        attendeeUserId !== viewerUserId &&
        entry.isWtfUser &&
        entry.peer,
    );
    const canTip = Boolean(
      viewerUserId &&
        attendeeUserId &&
        attendeeUserId !== viewerUserId &&
        entry.isWtfUser &&
        entry.peer,
    );
    const alreadyBuddy = Boolean(attendeeUserId && wimFriendIds.includes(attendeeUserId));

    return (
      <AttendeeRow
        key={entry.id}
        $active={Boolean(entry.mediaState.camera || entry.mediaState.screen || entry.mediaState.mediaVideo || entry.mediaState.mediaAudio || entry.mediaState.audioOpen || entry.mediaState.soundboard)}
        data-wtf-live-attendee={entry.id}
        data-wtf-live-attendee-state={stateLabel.toLowerCase()}
        data-wtf-live-attendee-user-id={attendeeUserId ?? undefined}
        data-wtf-live-attendee-wtf-user={entry.isWtfUser ? "true" : "false"}
      >
        <AvatarMark name={entryName} avatarUrl={entry.avatarUrl} size="mini" />
        <AttendeeName title={entryName}>
          <strong>{entryName}</strong>
          {entry.self ? <AttendeeBadge>you</AttendeeBadge> : null}
          {entry.isWtfUser ? <AttendeeBadge>WTF</AttendeeBadge> : null}
        </AttendeeName>
        <MicDot $active={entry.mediaState.audioOpen} $ready={entry.mediaState.mic} title={entry.mediaState.audioOpen ? "Mic live" : entry.mediaState.mic ? "Mic ready" : "Mic off"}>
          <Mic size={12} aria-hidden />
        </MicDot>
        {entry.self ? (
          <span>{stateLabel}</span>
        ) : (
          <HealthDot $health={health} title={diagnosticSummary(entry.diagnostic)}>
            {healthLabel(health)}
          </HealthDot>
        )}
        {canTip ? (
          <TipAttendeeButton
            title={`Tip ${entryName}`}
            aria-label={`Tip ${entryName}`}
            onClick={() => entry.peer && openTipTrayForPeer(entry.peer)}
            data-wtf-live-tip-open={attendeeUserId ?? undefined}
          >
            <Gift size={12} aria-hidden />
            Tip
          </TipAttendeeButton>
        ) : null}
        {canAddWimBuddy ? (
          <WimBuddyButton
            disabled={alreadyBuddy}
            title={alreadyBuddy ? `${entryName} is in WIM buddies` : `Add ${entryName} to WIM buddies`}
            aria-label={alreadyBuddy ? `${entryName} is in WIM buddies` : `Add ${entryName} to WIM buddies`}
            onClick={() => entry.peer && addWimBuddy(entry.peer)}
            data-wtf-live-wim-add={attendeeUserId ?? undefined}
            data-wtf-live-wim-state={alreadyBuddy ? "buddy" : "available"}
          >
            {alreadyBuddy ? <Check size={12} aria-hidden /> : <UserPlus size={12} aria-hidden />}
            {alreadyBuddy ? "Buddy" : "Add"}
          </WimBuddyButton>
        ) : null}
      </AttendeeRow>
    );
  }

	  function renderAttendancePanel(floating = false) {
	    return (
	      <AttendancePanel
	        open={floating ? true : attendanceOpen}
	        onToggle={floating ? undefined : (event) => setAttendanceOpen(event.currentTarget.open)}
	        data-wtf-live-attendance-panel={floating ? "popout" : "true"}
	      >
	        <summary data-wtf-live-attendance-toggle={floating ? undefined : ""}>
	          <LiveSectionHeader>
	            <span>
	              {floating ? null : attendanceOpen ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
	              <Users size={15} aria-hidden /> Attendance
	            </span>
	            <span>{participantCount} · {openMicCount} mic</span>
	          </LiveSectionHeader>
	        </summary>
        <AttendanceList data-wtf-live-attendance-list={floating ? "popout" : undefined}>
          {joined ? (
            renderAttendeeRow({
              id: "self",
              name: attendeeDisplayName,
              userId: viewerUserId,
              username: signedInUsername || null,
              isWtfUser: Boolean(viewerUserId && signedInUsername),
              avatarUrl,
              mediaState: localMediaState,
              self: true,
            })
          ) : null}
          {remotePeers.map((peer) => {
            const diagnostic = peerDiagnostics[peer.peerId];
            return renderAttendeeRow({
              id: peer.peerId,
              name: livePeerName(peer),
              userId: peer.userId,
              username: peer.username,
              isWtfUser: peer.isWtfUser,
              avatarUrl: peer.mediaState.avatarUrl,
              mediaState: peer.mediaState,
              connected: peer.connected,
              diagnostic,
              peer,
            });
          })}
          {!joined && !remotePeers.length ? <span>Join to appear here.</span> : null}
        </AttendanceList>
      </AttendancePanel>
    );
  }

  function renderChatAttachments(attachments: LiveChatAttachment[], editable = false) {
    if (!attachments.length) return null;
    return (
      <AttachmentStrip>
        {attachments.map((attachment) => (
          <AttachmentPreview key={attachment.id} data-wtf-live-chat-attachment={attachment.id}>
            {attachment.kind === "video" ? (
              <video src={attachment.dataUrl} controls playsInline onClick={() => openAttachmentPopout(attachment)} />
            ) : (
              <img src={attachment.dataUrl} alt={attachment.name} onClick={() => openAttachmentPopout(attachment)} />
            )}
            <span>{attachment.name} {formatFileSize(attachment.sizeBytes)}</span>
            {editable ? <Button onClick={() => removeAttachment(attachment.id)}>Remove</Button> : null}
          </AttachmentPreview>
        ))}
      </AttachmentStrip>
    );
  }

  function renderLiveChatMessage(message: LiveChatMessage) {
    return (
      <MessageItem key={message.id} data-wtf-live-chat-message={message.id}>
        <strong>{message.guestName}</strong>
        <span>{formatDate(message.createdAt)}</span>
        {message.text ? (
          <ChatMessageText style={liveChatTextStyle(message.style, roomDefaultChatFontFamily)} data-wtf-live-chat-message-text>
            {message.text}
          </ChatMessageText>
        ) : null}
        {renderChatAttachments(message.attachments)}
      </MessageItem>
    );
  }

  function handleChatStylePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    setChatStyleOpen(false);
  }

  function renderChatToolbox() {
    const emojiPanelId = "wtf-live-chat-emoji-panel";
    const panelId = "wtf-live-chat-style-panel";
    return (
      <>
        <ChatToolbox role="toolbar" aria-label="Chat tools" data-wtf-live-chat-tools>
          <ChatToolIconButton
            $active={chatEmojiOpen}
            aria-label={chatEmojiOpen ? "Close chat emoji picker" : "Open chat emoji picker"}
            aria-controls={emojiPanelId}
            aria-expanded={chatEmojiOpen}
            disabled={!joined || !socketReady}
            title="Emoji"
            onClick={() => {
              setChatEmojiOpen((open) => !open);
              setChatStyleOpen(false);
            }}
            data-wtf-live-chat-emoji-toggle
          >
            <Smile size={16} aria-hidden />
          </ChatToolIconButton>
          <ChatToolIconButton
            $active={chatStyleOpen}
            aria-label={chatStyleOpen ? "Close chat text style settings" : "Open chat text style settings"}
            aria-controls={panelId}
            aria-expanded={chatStyleOpen}
            title="Text style"
            onClick={() => {
              setChatStyleOpen((open) => !open);
              setChatEmojiOpen(false);
            }}
            data-wtf-live-chat-style-toggle
          >
            <TypeIcon size={16} aria-hidden />
          </ChatToolIconButton>
        </ChatToolbox>
        {chatEmojiOpen ? (
          <ChatEmojiPanel
            id={emojiPanelId}
            role="group"
            aria-label="Chat emoji picker"
            onKeyDown={handleChatEmojiPanelKeyDown}
            data-wtf-live-chat-emoji-panel
          >
            <ChatEmojiGrid>
              {LIVE_CHAT_EMOJI_OPTIONS.map((emoji) => (
                <ChatEmojiButton
                  key={emoji}
                  type="button"
                  aria-label={`Insert ${emoji}`}
                  title={emoji}
                  onClick={() => insertChatEmoji(emoji)}
                  data-wtf-live-chat-emoji={emoji}
                >
                  {emoji}
                </ChatEmojiButton>
              ))}
            </ChatEmojiGrid>
          </ChatEmojiPanel>
        ) : null}
        {chatStyleOpen ? (
          <ChatStylePanel
            id={panelId}
            role="group"
            aria-label="Chat text style settings"
            onKeyDown={handleChatStylePanelKeyDown}
            data-wtf-live-chat-style-panel
          >
            <ChatStyleField>
              <span>Font</span>
              <ChatToolSelect
                aria-label="Chat font"
                value={chatStyle.font}
                onChange={(event) => updateChatStyle({ font: event.target.value as LiveChatFont })}
                data-wtf-live-chat-font
              >
                {LIVE_CHAT_FONT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </ChatToolSelect>
            </ChatStyleField>
            <ChatStyleField>
              <span>Size</span>
              <ChatToolSelect
                aria-label="Chat font size"
                value={chatStyle.size}
                onChange={(event) =>
                  updateChatStyle({ size: Number(event.target.value) as LiveChatStyle["size"] })
                }
                data-wtf-live-chat-font-size
              >
                {LIVE_CHAT_FONT_SIZES.map((size) => (
                  <option key={size} value={size}>{size}px</option>
                ))}
              </ChatToolSelect>
            </ChatStyleField>
            <ChatStyleActionRow>
              <ChatColorStrip aria-label="Chat text color">
                {LIVE_CHAT_COLOR_OPTIONS.map((option) => (
                  <ChatColorSwatch
                    key={option.id}
                    type="button"
                    $color={option.value}
                    $active={chatStyle.color === option.id}
                    title={`Text color ${option.label}`}
                    aria-label={`Text color ${option.label}`}
                    aria-pressed={chatStyle.color === option.id}
                    onClick={() => updateChatStyle({ color: option.id })}
                    data-wtf-live-chat-color={option.id}
                  />
                ))}
              </ChatColorStrip>
              <ChatStyleActionGroup>
                <ChatToolIconButton
                  $active={chatStyle.bold}
                  aria-label="Bold chat text"
                  aria-pressed={chatStyle.bold}
                  title="Bold"
                  onClick={() => updateChatStyle({ bold: !chatStyle.bold })}
                  data-wtf-live-chat-bold
                >
                  <Bold size={14} aria-hidden />
                </ChatToolIconButton>
                <ChatToolIconButton
                  $active={chatStyle.italic}
                  aria-label="Italic chat text"
                  aria-pressed={chatStyle.italic}
                  title="Italic"
                  onClick={() => updateChatStyle({ italic: !chatStyle.italic })}
                  data-wtf-live-chat-italic
                >
                  <Italic size={14} aria-hidden />
                </ChatToolIconButton>
                <ChatToolIconButton
                  aria-label="Reset chat style"
                  title="Reset"
                  onClick={resetChatStyle}
                  data-wtf-live-chat-style-reset
                >
                  <RotateCcw size={14} aria-hidden />
                </ChatToolIconButton>
                <ChatToolIconButton
                  aria-label="Done editing chat style"
                  title="Done"
                  onClick={() => setChatStyleOpen(false)}
                  data-wtf-live-chat-style-done
                >
                  <Check size={14} aria-hidden />
                </ChatToolIconButton>
              </ChatStyleActionGroup>
            </ChatStyleActionRow>
          </ChatStylePanel>
        ) : null}
      </>
    );
  }

  function renderSoundboardRuntime() {
    if (!canUseRoomSoundboard) return null;
    return (
      <SettingsGroup data-wtf-live-soundboard-runtime>
        <LiveSectionHeader>
          <span><Music2 size={15} aria-hidden /> {roomShowKitQuery.data?.kit?.name || "Soundboard"}</span>
          <ShareStatus>{roomShowKitQuery.isLoading ? "Loading kit" : soundboardOutputStream ? "WebRTC lane" : soundboardClips.length ? `${soundboardClips.length} clips` : "No clips"}</ShareStatus>
        </LiveSectionHeader>
        {soundboardClips.length ? (
          <SoundboardButtonGrid>
            {soundboardClips.map((clip) => (
              <SoundboardButton
                key={clip.id}
                disabled={!joined || !socketReady}
                title={clip.shortcut ? `${clip.label} (${clip.shortcut})` : clip.label}
                onClick={() => triggerSoundboardClip(clip, "button")}
                data-wtf-live-soundboard-trigger={clip.id}
              >
                <Music2 aria-hidden />
                <span>{clip.label}</span>
                <small>{clip.shortcut || `${clip.volume}%`} {clip.cooldownMs ? `· ${Math.round(clip.cooldownMs / 1000)}s` : ""}</small>
              </SoundboardButton>
            ))}
          </SoundboardButtonGrid>
        ) : (
          <StatusLine>No Show Kit clips.</StatusLine>
        )}
        <GuestGrid>
          <Button onClick={() => stopSoundboardAudio()} data-wtf-live-soundboard-stop>
            <ButtonLabel><VolumeX size={16} aria-hidden /> Stop</ButtonLabel>
          </Button>
          <Button onClick={() => window.open(presentationRouteHref("/live?tab=show-kit", presentation.host), "_blank", "noopener,noreferrer")} data-wtf-live-soundboard-open-settings>
            Show Kit
          </Button>
        </GuestGrid>
        {soundboardStatus ? (
          <StatusLine aria-live="polite" data-wtf-live-soundboard-status>
            {soundboardStatus}
          </StatusLine>
        ) : null}
      </SettingsGroup>
    );
  }

  function renderRuntimeRoomSettings() {
    if (!canManageRoom) return null;
    const kits = runtimeShowKitsQuery.data?.kits ?? [];
    return (
      <SettingsGroup data-wtf-live-runtime-room-settings={roomId}>
        <LiveSectionHeader>
          <span><Settings size={15} aria-hidden /> Room settings</span>
          <ShareStatus>{roomCapabilities?.roomRole || stageRole}</ShareStatus>
        </LiveSectionHeader>
        {!isStageRoom ? (
          <>
            <label>
              <input
                type="checkbox"
                checked={runtimeRoomSettings.allowGuestAudio}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setRuntimeRoomSettings((current) => ({ ...current, allowGuestAudio: checked }));
                }}
                data-wtf-live-runtime-allow-audio
              /> Guest mic
            </label>
            <label>
              <input
                type="checkbox"
                checked={runtimeRoomSettings.allowGuestCamera}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setRuntimeRoomSettings((current) => ({ ...current, allowGuestCamera: checked }));
                }}
                data-wtf-live-runtime-allow-camera
              /> Guest camera
            </label>
            <label>
              <input
                type="checkbox"
                checked={runtimeRoomSettings.allowGuestScreen}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setRuntimeRoomSettings((current) => ({ ...current, allowGuestScreen: checked }));
                }}
                data-wtf-live-runtime-allow-screen
              /> Guest screen
            </label>
            <label>
              <input
                type="checkbox"
                checked={runtimeRoomSettings.allowGuestMedia}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setRuntimeRoomSettings((current) => ({ ...current, allowGuestMedia: checked }));
                }}
                data-wtf-live-runtime-allow-media
              /> Guest media deck
            </label>
          </>
        ) : (
          <StatusLine>Stage publishing follows the host and speaker list.</StatusLine>
        )}
        <label>
          <input
            type="checkbox"
            checked={runtimeRoomSettings.showKitEnabled}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setRuntimeRoomSettings((current) => ({ ...current, showKitEnabled: checked }));
            }}
            data-wtf-live-runtime-show-kit-enabled
          /> Show Kit enabled
        </label>
        <ChatStyleField>
          <span>Show Kit</span>
          <ChatToolSelect
            aria-label="Room Show Kit"
            value={runtimeRoomSettings.showKitId ? String(runtimeRoomSettings.showKitId) : ""}
            onChange={(event) => {
              const value = event.target.value;
              setRuntimeRoomSettings((current) => ({
                ...current,
                showKitId: value ? Number(value) : null,
              }));
            }}
            data-wtf-live-runtime-show-kit-select
          >
            <option value="">No saved kit</option>
            {kits.map((kit) => (
              <option key={kit.id} value={kit.id}>
                {kit.name} · {kit.clipCount}
              </option>
            ))}
          </ChatToolSelect>
        </ChatStyleField>
        <GuestGrid>
          <Button
            disabled={saveRuntimeRoomSettings.isPending}
            onClick={() => saveRuntimeRoomSettings.mutate()}
            data-wtf-live-runtime-settings-save
          >
            {saveRuntimeRoomSettings.isPending ? "Saving..." : "Save"}
          </Button>
          <Button onClick={() => window.open(presentationRouteHref("/live?tab=rooms", presentation.host), "_blank", "noopener,noreferrer")}>
            Dashboard
          </Button>
        </GuestGrid>
        {runtimeRoomSettingsStatus ? <StatusLine aria-live="polite">{runtimeRoomSettingsStatus}</StatusLine> : null}
      </SettingsGroup>
    );
  }

  function renderTipTray() {
    if (!tipTrayOpen) return null;
    const targetValue = selectedTipTarget?.userId ? String(selectedTipTarget.userId) : "";
    const itemValue = selectedTipItem?.sku ?? "";
    return (
      <TipTray data-wtf-live-tip-tray>
        <TipTrayHeader>
          <span><Gift size={14} aria-hidden /> WTF LIVE tip</span>
          <Button size="sm" onClick={() => setTipTrayOpen(false)} data-wtf-live-tip-close>
            Close
          </Button>
        </TipTrayHeader>
        <TipTrayGrid>
          <TipTraySelect
            aria-label="Tip receiver"
            value={targetValue}
            onChange={(event) => setTipTargetUserId(Number(event.target.value) || null)}
            data-wtf-live-tip-target
          >
            {!tipTargets.length ? <option value="">No WTF users</option> : null}
            {tipTargets.map((target) => (
              <option key={target.userId} value={target.userId}>
                {target.label}
              </option>
            ))}
          </TipTraySelect>
          <TipTraySelect
            aria-label="Tip item"
            value={itemValue}
            onChange={(event) => setTipSku(event.target.value)}
            data-wtf-live-tip-item
          >
            {!ownedTipItems.length ? <option value="">No tip items</option> : null}
            {ownedTipItems.map((item) => (
              <option key={item.sku} value={item.sku}>
                {item.name} ({item.quantityOwned})
              </option>
            ))}
          </TipTraySelect>
        </TipTrayGrid>
        <GuestGrid>
          <Button
            disabled={sendTipMutation.isPending || !selectedTipTarget || !selectedTipItem}
            onClick={sendSelectedTip}
            data-wtf-live-tip-send
          >
            <ButtonLabel><Gift size={16} aria-hidden /> Send Tip</ButtonLabel>
          </Button>
          <Button onClick={() => window.open(presentationRouteHref("/wtfiam?category=wtf_live", presentation.host), "_blank", "noopener,noreferrer")}>
            Buy Tips
          </Button>
        </GuestGrid>
        {tipStatus ? (
          <TipStatus $tone={/failed|not|no tip|select|sign in/i.test(tipStatus) ? "warn" : "good"} data-wtf-live-tip-status>
            {tipStatus}
          </TipStatus>
        ) : null}
      </TipTray>
    );
  }

  function renderChatComposer() {
    return (
      <ChatComposer data-wtf-live-chat-composer="true">
        {renderChatToolbox()}
        {renderTipTray()}
        <ChatTextArea
          ref={chatTextAreaRef}
          aria-label="WTF LIVE room chat message"
          data-wtf-live-chat-text
          disabled={!joined || !socketReady}
          value={chatText}
          maxLength={1200}
          placeholder={socketReady ? "Type in the room" : "Join the room to chat"}
          style={liveChatTextStyle(chatStyle)}
          onChange={(event) => setChatText(event.target.value)}
          onKeyDown={handleChatKeyDown}
        />
        {renderChatAttachments(chatAttachments, true)}
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
    );
  }

	  function renderRoomReactionDock() {
	    return (
	      <RoomReactionDock role="toolbar" aria-label="Room reactions" data-wtf-live-room-reactions>
        {LIVE_ROOM_REACTION_OPTIONS.map((option) => (
          <RoomReactionButton
            key={option.emoji}
            type="button"
            aria-label={`React ${option.label}`}
            title={option.label}
            disabled={!joined || !socketReady}
            onClick={() => sendRoomReaction(option)}
            data-wtf-live-room-reaction={option.emoji}
          >
            {option.emoji}
          </RoomReactionButton>
        ))}
	      </RoomReactionDock>
	    );
	  }

	  function renderConnectionPanel(floating = false) {
	    return (
	      <ControlRail data-wtf-live-control-rail={floating ? "popout" : "true"}>
	        <SettingsGroup>
	          <LiveSectionHeader>
	            <span><Radio size={15} aria-hidden /> Room</span>
	            <ShareStatus>{participantCount} in room</ShareStatus>
	          </LiveSectionHeader>
	          {signedInUsername ? (
	            <AccountJoinIdentity data-wtf-live-account-identity>
	              <AvatarMark name={attendeeDisplayName} avatarUrl={avatarUrl} size="small" />
	              <span>
	                <strong>{signedInUsername}</strong>
	                <span>wtfOS account</span>
	              </span>
	            </AccountJoinIdentity>
	          ) : (
	            <TextField
	              aria-label="Guest display name"
	              value={guestName}
	              placeholder="Display name"
	              fullWidth
	              disabled={joined || authLoading}
	              onChange={(event: ChangeEvent<HTMLInputElement>) => setGuestName(event.target.value)}
	            />
	          )}
	          <RoomActionGrid>
	            <Button primary aria-label={isStageRoom ? "Join Stage" : "Join Room"} disabled={joined || authLoading} onClick={joinRoom} data-wtf-live-join-room>
	              {joined ? "Joined" : isStageRoom ? "Join Stage" : "Join"}
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
	      </ControlRail>
	    );
	  }

	  function renderStagePolicyPanel() {
	    if (!isStageRoom) return null;
	    const roleLabel =
	      stageRole === "owner"
	        ? "Owner"
	        : stageRole === "host"
	          ? "Host"
	          : stageRole === "speaker"
	            ? "Speaker"
	            : "Audience";
	    return (
	      <StagePolicyPanel
	        data-wtf-live-stage-room-policy
	        data-wtf-live-stage-role={stageRole}
	        data-wtf-live-stage-can-share={canShareAudio || canShareCamera || canShareScreen ? "true" : "false"}
	      >
	        <LiveSectionHeader>
	          <span><Radio size={15} aria-hidden /> Stage permissions</span>
	          <ShareStatus>{roleLabel}</ShareStatus>
	        </LiveSectionHeader>
	        <span>
	          {canShareAudio || canShareCamera || canShareScreen
	            ? "You can publish mic, camera, screen, and media in this stage."
	            : "Audience members can watch, chat, and react. Only the stage owner, hosts, and speakers can publish mic, camera, screen, or media."}
	        </span>
	        {canManageStageRoom ? (
	          <>
	            <StageRoleField>
	              Host WTF usernames
	              <StageRoleTextArea
	                value={stageHostList}
	                placeholder={"wtf-host-1\nwtf-host-2"}
	                onChange={(event) => setStageHostList(event.currentTarget.value)}
	                data-wtf-live-stage-room-host-list
	              />
	            </StageRoleField>
	            <StageRoleField>
	              Speaker WTF usernames
	              <StageRoleTextArea
	                value={stageSpeakerList}
	                placeholder={"wtf-speaker-1\nwtf-speaker-2"}
	                onChange={(event) => setStageSpeakerList(event.currentTarget.value)}
	                data-wtf-live-stage-room-speaker-list
	              />
	            </StageRoleField>
	            <Button
	              disabled={updateStageAccessMutation.isPending}
	              onClick={() => updateStageAccessMutation.mutate()}
	              data-wtf-live-stage-room-access-save
	            >
	              Save Stage Roles
	            </Button>
	          </>
	        ) : null}
	      </StagePolicyPanel>
	    );
	  }

	  function renderSharingPanel(floating = false) {
	    return (
	      <ControlRail data-wtf-live-control-rail={floating ? "popout" : "true"}>
	        <SettingsGroup>
	          <LiveSectionHeader>
	            <span>Share</span>
	            <ShareStatus>{sourceCountLabel}</ShareStatus>
	          </LiveSectionHeader>
	          <SharingTrayActions role="toolbar" aria-label="Sharing tools">
	            <Button
	              aria-label={sharingTestingOpen ? "Hide testing drawer" : "Show testing drawer"}
	              aria-expanded={sharingTestingOpen}
	              title="Testing"
	              onClick={() => setSharingTestingOpen((open) => !open)}
	              data-wtf-live-sharing-testing-toggle
	            >
	              <Gauge size={15} aria-hidden />
	            </Button>
	            <Button
	              aria-label={sharingSettingsOpen ? "Hide settings drawer" : "Show settings drawer"}
	              aria-expanded={sharingSettingsOpen}
	              title="Settings"
	              onClick={() => setSharingSettingsOpen((open) => !open)}
	              data-wtf-live-sharing-settings-toggle
	            >
	              <TypeIcon size={15} aria-hidden />
	            </Button>
	          </SharingTrayActions>
	          {renderStagePolicyPanel()}
	          <MediaButtonGrid>
	            <ControlButton
	              disabled={!joined || !socketReady || !canShareAudio}
	              $active={Boolean(micStream)}
	              onClick={toggleMic}
	              data-wtf-live-toggle-mic
	            >
	              {micStream ? <Square aria-hidden /> : <Mic aria-hidden />} Mic
	            </ControlButton>
	            <ControlButton
	              disabled={!joined || !socketReady || !micStream || !canShareAudio}
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
	              disabled={!joined || !socketReady || !canShareCamera}
	              $active={Boolean(cameraStream)}
	              onClick={toggleCamera}
	              data-wtf-live-toggle-camera
	            >
	              {cameraStream ? <Square aria-hidden /> : <Camera aria-hidden />} Camera
	            </ControlButton>
	            <ControlButton
	              disabled={!joined || !socketReady || !canShareScreen}
	              $active={Boolean(screenStream)}
	              onClick={toggleScreen}
	              data-wtf-live-toggle-screen
	            >
	              {screenStream ? <Square aria-hidden /> : <MonitorUp aria-hidden />} Screen
	            </ControlButton>
	          </MediaButtonGrid>
	          <SharingDrawer hidden={!sharingTestingOpen} data-wtf-live-sharing-testing-drawer>
	            <MicTestPanel $status={micDiagnostic.status} data-wtf-live-mic-test data-wtf-live-mic-test-state={micDiagnostic.status}>
	            <MicTestActionRow>
	              <MicTestHeader>
	                <strong>Mic test</strong>
	                <MicTestBadge $status={micDiagnostic.status} data-wtf-live-mic-test-badge>
	                  {micDiagnostic.status === "checking" ? "checking" : micDiagnostic.status}
	                </MicTestBadge>
	              </MicTestHeader>
	              <StatusLine aria-live="polite" data-wtf-live-mic-test-status>
	                {micDiagnostic.headline}
	              </StatusLine>
	              <Button
	                aria-label="Test microphone"
	                disabled={micDiagnostic.status === "checking"}
	                onClick={runMicDiagnostic}
	                data-wtf-live-mic-test-button
	              >
	                <ButtonLabel><Gauge size={15} aria-hidden /> {micDiagnostic.status === "checking" ? "Testing" : "Test mic"}</ButtonLabel>
	              </Button>
	              <Button
	                size="sm"
	                aria-label={micDiagnosticExpanded ? "Hide microphone test details" : "Show microphone test details"}
	                aria-expanded={micDiagnosticExpanded}
	                onClick={() => setMicDiagnosticExpanded((expanded) => !expanded)}
	                data-wtf-live-mic-test-details-toggle
	              >
	                Details
	              </Button>
	            </MicTestActionRow>
	            <MicTestDrawer $expanded={micDiagnosticExpanded} data-wtf-live-mic-test-details>
	              <MicTestFacts>
	                <span data-wtf-live-mic-test-browser>{micDiagnostic.browserLabel}</span>
	                <span data-wtf-live-mic-test-permission>{micDiagnostic.permissionLabel}</span>
	                <span data-wtf-live-mic-test-device>{micDiagnostic.deviceLabel}</span>
	              </MicTestFacts>
	              <MicTestGuidance aria-live="polite" data-wtf-live-mic-test-guidance>
	                {micDiagnostic.detail}
	              </MicTestGuidance>
	            </MicTestDrawer>
	            </MicTestPanel>
	          </SharingDrawer>
	          <ControlButton
	            disabled={!joined || !socketReady || !micStream || !pushToTalk || !canShareAudio}
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
	              <span>Stage focus</span>
	              <ShareStatus>{activeShareLabel}</ShareStatus>
	            </LiveSectionHeader>
	            <GuestGrid>
	              <ControlButton
	                disabled={!joined || !socketReady || !cameraStream || !canShareCamera}
	                $active={activeVideoSource === "camera"}
	                onClick={() => selectActiveVideoSource("camera")}
	                data-wtf-live-share-camera
	              >
	                <Camera aria-hidden /> Camera
	              </ControlButton>
	              <ControlButton
	                disabled={!joined || !socketReady || !screenStream || !canShareScreen}
	                $active={activeVideoSource === "screen"}
	                onClick={() => selectActiveVideoSource("screen")}
	                data-wtf-live-share-screen
	              >
	                <MonitorUp aria-hidden /> Screen
	              </ControlButton>
	            </GuestGrid>
	          </SharePicker>
	          <MediaDeckPanel data-wtf-live-media-deck>
	            <LiveSectionHeader>
	              <span><FileAudio size={15} aria-hidden /> Media deck</span>
	              <ShareStatus>{mediaDeck ? (mediaDeck.playing ? "Playing" : "Ready") : "Empty"}</ShareStatus>
	            </LiveSectionHeader>
	            <HiddenFileInput
	              ref={mediaFileInputRef}
	              data-wtf-live-media-file
	              type="file"
	              accept={LIVE_MEDIA_DECK_ACCEPT}
	              onChange={handleMediaDeckInput}
	            />
	            <GuestGrid>
	              <Button
	                disabled={!joined || !socketReady || !canShareMedia}
	                onClick={() => mediaFileInputRef.current?.click()}
	                data-wtf-live-media-load
	              >
	                <ButtonLabel><FileAudio size={16} aria-hidden /> Load</ButtonLabel>
	              </Button>
	              <Button
	                disabled={!joined || !socketReady || !mediaDeck || !canShareMedia}
	                onClick={toggleMediaDeckPlayback}
	                data-wtf-live-media-play
	              >
	                <ButtonLabel>{mediaDeck?.playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />} {mediaDeck?.playing ? "Pause" : "Play"}</ButtonLabel>
	              </Button>
	            </GuestGrid>
	            {mediaDeck ? (
	              <>
	                <MediaDeckInfo data-wtf-live-media-deck-info>
	                  <strong>{mediaDeck.name}</strong>
	                  <span>{mediaDeck.kind} · {formatMediaTime(mediaDeck.currentTime)} / {formatMediaTime(mediaDeck.duration)}</span>
	                </MediaDeckInfo>
	                <MediaDeckControls>
	                  <Button onClick={toggleMediaDeckLoop} data-wtf-live-media-loop>
	                    {mediaDeck.loop ? "Loop on" : "Loop"}
	                  </Button>
	                  <Button onClick={toggleMediaDeckMuted} data-wtf-live-media-mute>
	                    <ButtonLabel>{mediaDeck.muted ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />} {mediaDeck.muted ? "Muted" : "Audio"}</ButtonLabel>
	                  </Button>
	                  <Button onClick={() => closeMediaDeck()} data-wtf-live-media-stop>
	                    <ButtonLabel><Square size={15} aria-hidden /> Stop</ButtonLabel>
	                  </Button>
	                  <ShareStatus>{mediaDeck.volume}%</ShareStatus>
	                </MediaDeckControls>
	                <MediaDeckRange
	                  aria-label="Media deck volume"
	                  data-wtf-live-media-volume
	                  type="range"
	                  min="0"
	                  max="100"
	                  value={mediaDeck.volume}
	                  onChange={(event) => setMediaDeckVolume(Number(event.currentTarget.value))}
	                />
	              </>
	            ) : (
	              <StatusLine data-wtf-live-media-deck-status>No media loaded.</StatusLine>
	            )}
	          </MediaDeckPanel>
	        </SettingsGroup>

	        {renderSoundboardRuntime()}

	        <SharingDrawer hidden={!sharingSettingsOpen} data-wtf-live-sharing-settings-drawer>
	        {renderRuntimeRoomSettings()}
	        <SettingsGroup>
	          <LiveSectionHeader>
	            <span><ImageIcon size={15} aria-hidden /> Local</span>
	            <ShareStatus>{labelForMediaState(localMediaState)}</ShareStatus>
	          </LiveSectionHeader>
	          <ChatStyleField>
	            <span>Default chat font</span>
	            <ChatToolSelect
	              aria-label="Default room chat font"
	              value={roomDefaultFontPack}
	              onChange={(event) => setRoomDefaultFontPack(event.target.value as DesktopFontPackKey)}
	              data-wtf-live-room-default-font
	            >
              {WTF_LIVE_ROOM_FONT_PACKS.map((pack) => (
                <option key={pack.key} value={pack.key}>{pack.label}</option>
              ))}
	            </ChatToolSelect>
	          </ChatStyleField>
	          <AvatarSettings>
	            <AvatarMark name={attendeeDisplayName} avatarUrl={avatarUrl} size="small" />
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
	          {joined ? <MicLevelMeter micStream={micStream} localAudioOpen={localAudioOpen} pushToTalk={pushToTalk} /> : null}
	          <LocalPreviewDock>
	            <LiveSectionHeader>
	              <span>Preview</span>
	              <span>{sourceCountLabel}</span>
	            </LiveSectionHeader>
	            <PreviewGrid>
	              <PreviewBox
	                $active={Boolean(cameraStream)}
	                data-wtf-live-local-preview="camera"
	                onClick={() => openLocalPreview("camera")}
	              >
	                {cameraStream ? <PreviewVideo ref={cameraRef} muted autoPlay playsInline /> : <span>Camera</span>}
	              </PreviewBox>
	              <PreviewBox
	                $active={Boolean(screenStream)}
	                data-wtf-live-local-preview="screen"
	                onClick={() => openLocalPreview("screen")}
	              >
	                {screenStream ? <PreviewVideo ref={screenRef} muted autoPlay playsInline /> : <span>Screen</span>}
	              </PreviewBox>
	            </PreviewGrid>
	          </LocalPreviewDock>
	        </SettingsGroup>
	        </SharingDrawer>

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
	                  <span>{livePeerName(peer)}</span>
	                  <HealthDot $health={diagnostic?.health ?? "connecting"} title={diagnosticSummary(diagnostic)}>
	                    {healthLabel(diagnostic?.health ?? "connecting")}
	                  </HealthDot>
	                </DiagnosticRow>
	              );
	            })}
	          </DiagnosticsPanel>
	        ) : null}
	      </ControlRail>
	    );
	  }

	  function renderScreensPanel(floating = false) {
	    const requestedGridIds = new Set(screenGridEntryIds);
	    const requestedGridEntries = stageEntries.filter((entry) => requestedGridIds.has(entry.id));
	    const hasScreenGrid = requestedGridEntries.length >= 2;
	    const groupedEntryIds = new Set(hasScreenGrid ? requestedGridEntries.map((entry) => entry.id) : []);
	    const looseEntries = stageEntries.filter((entry) => !groupedEntryIds.has(entry.id));
	    const visibleStageItems = looseEntries.length + (hasScreenGrid ? 1 : 0);
	    return (
	      <StagePanel data-wtf-live-stage-area={floating ? "popout" : "true"}>
	        <StageHeader>
	          <span>{isStageRoom ? "Stage sources" : "Shared screens"}</span>
	          <span>{stageCount ? `${stageCount} source${stageCount === 1 ? "" : "s"}` : "no sources shared"}</span>
	        </StageHeader>
	        {soundboardStatus ? (
	          <SoundboardBroadcastStatus aria-live="polite" data-wtf-live-soundboard-received>
	            <Music2 size={14} aria-hidden />
	            <span>{soundboardStatus}</span>
	          </SoundboardBroadcastStatus>
	        ) : null}
	        {renderRoomReactionDock()}
	        <StageGridShell data-wtf-live-stage-grid-shell>
	          <ReactionBurstLayer aria-live="polite" data-wtf-live-reaction-layer>
	            {roomReactions.map((reaction, index) => (
	              <ReactionBurst
	                key={reaction.id}
	                style={{
	                  left: `${14 + (index % 5) * 18}%`,
	                  animationDelay: `${(index % 3) * 40}ms`,
	                }}
	                aria-label={`${reaction.guestName} reacted ${reaction.label}`}
	                data-wtf-live-reaction-burst={reaction.id}
	                data-wtf-live-reaction-emoji={reaction.emoji}
	              >
	                <span aria-hidden>{reaction.emoji}</span>
	                <small>{reaction.guestName}</small>
	              </ReactionBurst>
	            ))}
	          </ReactionBurstLayer>
	          <StageGrid $count={visibleStageItems} data-wtf-live-stage-grid>
	            {hasScreenGrid ? (
	              <ScreenGridShell
	                data-wtf-live-screen-grid
	                onDragOver={(event) => {
	                  event.preventDefault();
	                  event.dataTransfer.dropEffect = "move";
	                }}
	                onDrop={handleScreenGridDrop}
	              >
	                {requestedGridEntries.map((entry) => (
	                  <ScreenGridEntryTile
	                    key={entry.id}
	                    entry={entry}
	                    onOpen={() => openStagePopout(entry)}
	                  />
	                ))}
	              </ScreenGridShell>
	            ) : null}
	            {looseEntries.map((entry) => (
	              <StageParticipantTile
	                key={entry.id}
	                {...entry}
	                onOpen={() => openStagePopout(entry)}
	                onDragStart={handleStageEntryDragStart}
	                onDropOn={handleStageEntryDropOn}
	              />
	            ))}
	            {!stageCount ? <EmptyStage>{isStageRoom ? "No host or speaker is sharing yet" : "No camera, screen, or media shared"}</EmptyStage> : null}
	          </StageGrid>
	        </StageGridShell>
	        {remotePeers.map((peer) => (
	          <RemoteAudioSink key={`audio-${peer.peerId}`} peer={peer} />
	        ))}
	      </StagePanel>
	    );
	  }

	  function renderChatPanel(floating = false) {
	    return (
	      <ChatColumn data-wtf-live-chat-column={floating ? "popout" : "true"}>
	        <LiveSectionHeader>
	          <span><MessageSquare size={15} aria-hidden /> {isStageRoom ? "Stage chat" : "Room chat"}</span>
	          <span>{liveMessages.length + messages.length} messages</span>
	        </LiveSectionHeader>
        <MessageList
          ref={floating || !chatDetached ? chatLogRef : undefined}
          onScroll={handleChatScroll}
          aria-label="WTF LIVE room chat"
          data-wtf-live-chat-log
        >
          {messagesQuery.isLoading ? <Hourglass size={24} /> : null}
          {liveMessages.map((message) => renderLiveChatMessage(message))}
          {messages.length ? <MessageDivider>Public AT room notes</MessageDivider> : null}
          {messages.length ? (
            [...messages].reverse().map((message) => (
              <MessageItem key={message.uri}>
                <strong>{message.author?.displayName || message.author?.handle || "host"}</strong>
                {formatDate(message.createdAt) ? <span>{formatDate(message.createdAt)}</span> : null}
                <ChatMessageText>{message.text}</ChatMessageText>
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
        {renderChatComposer()}
	      </ChatColumn>
	    );
	  }

	  function renderBentoPanelIcon(panel: BentoPanelId) {
	    if (panel === "connection") return <Wifi size={15} aria-hidden />;
	    if (panel === "sharing") return <Radio size={15} aria-hidden />;
	    if (panel === "screens") return <MonitorUp size={15} aria-hidden />;
	    if (panel === "attendance") return <Users size={15} aria-hidden />;
	    return <MessageSquare size={15} aria-hidden />;
	  }

	  function isBentoPanelDetached(panel: BentoPanelId) {
	    if (panel === "connection") return connectionDetached;
	    if (panel === "sharing") return sharingDetached;
	    if (panel === "screens") return screensDetached;
	    if (panel === "attendance") return attendanceDetached;
	    return chatDetached;
	  }

	  function renderBentoPanelContent(panel: BentoPanelId, floating = false) {
	    if (panel === "connection") return renderConnectionPanel(floating);
	    if (panel === "sharing") return renderSharingPanel(floating);
	    if (panel === "screens") return renderScreensPanel(floating);
	    if (panel === "attendance") return renderAttendancePanel(floating);
	    return renderChatPanel(floating);
	  }

	  function renderBentoTile(panel: BentoPanelId) {
	    if (isBentoPanelDetached(panel)) return null;
	    const label = BENTO_PANEL_LABELS[panel];
	    return (
	      <BentoTile
	        key={panel}
	        $panel={panel}
	        $dragging={draggingBentoPanel === panel}
	        data-wtf-live-bento-tile={panel}
	        onDragOver={handleBentoDragOver}
	        onDrop={(event) => handleBentoDrop(event, panel)}
	      >
	        <BentoTileHeader
	          draggable
	          onDragStart={(event) => handleBentoDragStart(event, panel)}
	          onDragEnd={() => setDraggingBentoPanel(null)}
	          data-wtf-live-bento-drag-handle={panel}
	        >
	          <span>{renderBentoPanelIcon(panel)} {label}</span>
	          <BentoTileActions onPointerDown={(event) => event.stopPropagation()}>
	            <Button
	              aria-label={`Pop out ${label}`}
	              title={`Pop out ${label}`}
	              onClick={() => openPanelPopout(panel)}
	              data-wtf-live-popout-connection={panel === "connection" ? "" : undefined}
	              data-wtf-live-popout-sharing={panel === "sharing" ? "" : undefined}
	              data-wtf-live-popout-screens={panel === "screens" ? "" : undefined}
	              data-wtf-live-popout-attendance={panel === "attendance" ? "" : undefined}
	              data-wtf-live-popout-chat={panel === "chat" ? "" : undefined}
	            >
	              <ExternalLink size={13} aria-hidden />
	            </Button>
	          </BentoTileActions>
	        </BentoTileHeader>
	        {renderBentoPanelContent(panel)}
	      </BentoTile>
	    );
	  }

	  return (
    <GuestShell>
	      <RoomFrame data-wtf-live-room-frame={isStageRoom ? "stage" : "room"}>
        <TitleBar>
          <RoomTitleBlock>
            <h1>{room.title}</h1>
            <span>{room.description || roomUrl}</span>
          </RoomTitleBlock>
	          <HeaderStatus>
	            {socketReady ? <Wifi size={15} aria-hidden /> : <WifiOff size={15} aria-hidden />}{" "}
	            <span>{joined ? (socketReady ? "Connected" : "Connecting") : isStageRoom ? "Stage room" : joinMode === "wtf_user_private_room" ? "Private room" : "Public room"}</span>
	            <span>{joined ? attendeeDisplayName : signedInUsername ? signedInUsername : authLoading ? "Checking account" : "Guest setup"}</span>
	            <span>{peerId ? peerId.slice(0, 12) : "not joined"}</span>
	            <HeaderCloseButton aria-label="Close Window" onClick={closeRoomWindow} data-wtf-live-close-window>
	              <X size={15} aria-hidden />
	            </HeaderCloseButton>
	          </HeaderStatus>
        </TitleBar>
        <BentoWorkspace
          data-wtf-live-bento-workspace
          data-wtf-live-bento-order={bentoOrder.join(",")}
        >
          {bentoOrder.map((panel) => renderBentoTile(panel))}
        </BentoWorkspace>
	      </RoomFrame>
	      {popoutFrames.length ? (
	        <FloatingLayer data-wtf-live-popout-layer data-wtf-live-presentation-host={presentation.host}>
	          {popoutFrames.map((frame) => {
	            if (frame.kind === "panel") {
	              return (
	                <FloatingPanelWindow
	                  key={frame.id}
	                  frame={frame}
		                  onClose={closePopoutFrame}
		                  onToggleMaximize={togglePopoutMaximize}
		                  onTogglePinned={togglePopoutPinned}
		                  onCycleSize={cyclePopoutSize}
		                  onDragStart={handlePopoutDragStart}
		                >
		                  {renderBentoPanelContent(frame.panel, true)}
		                </FloatingPanelWindow>
	              );
	            }
	            if (frame.kind === "attachment") {
	              return (
	                <FloatingAttachmentWindow
	                  key={frame.id}
		                  frame={frame}
		                  onClose={closePopoutFrame}
		                  onToggleMaximize={togglePopoutMaximize}
		                  onTogglePinned={togglePopoutPinned}
		                  onCycleSize={cyclePopoutSize}
		                  onDragStart={handlePopoutDragStart}
		                />
	              );
	            }
	            const stream = frame.streamScope === "local"
	              ? frame.source === "camera"
	                ? cachedStageStream(stageStreamCache, "popout-self-camera", cameraStream, localMediaState, "camera")
	                : frame.source === "screen"
	                  ? cachedStageStream(stageStreamCache, "popout-self-screen", screenStream, localMediaState, "screen")
	                  : cachedStageStream(stageStreamCache, "popout-self-media", mediaDeckStream, localMediaState, "media")
	              : (() => {
	                  const peer = remotePeers.find((item) => item.peerId === frame.peerId);
	                  const source = frame.source === "active" ? peer?.mediaState.activeVideo ?? "camera" : frame.source;
	                  return peer ? cachedStageStream(stageStreamCache, `popout-${peer.peerId}-${source}`, peer.stream, peer.mediaState, source) : null;
	                })();
	            return (
	              <FloatingStreamWindow
	                key={frame.id}
	                frame={frame}
		                stream={stream}
		                onClose={closePopoutFrame}
		                onToggleMaximize={togglePopoutMaximize}
		                onTogglePinned={togglePopoutPinned}
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
