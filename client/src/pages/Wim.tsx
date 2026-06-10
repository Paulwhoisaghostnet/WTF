import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Hourglass, Panel, TextInput } from "react95";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  Plus,
  Search,
  Send,
  Settings,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import styled from "styled-components";
import { UiEmptyState, UiNotice } from "../components/wtfos-ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWindowManager, WindowPathContext } from "../lib/window-context";

type MessageUser = {
  id: number;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: string;
  experiencePoints?: number;
  online?: boolean;
  presenceStatus?: PresenceStatus;
  lastActiveAt?: string | null;
  sessionExpiresAt?: string | null;
};

type PresenceStatus = "active" | "inactive" | "offline";

type DmConversation = {
  id: number;
  title?: string | null;
  unreadCount: number;
  peers: Array<{
    id?: number | null;
    userId?: number | null;
    username: string;
    displayName?: string | null;
    online?: boolean;
  }>;
  latestMessage?: {
    id?: number;
    senderId?: number;
    content: string;
    createdAt?: string;
  } | null;
  conversationType?: "direct" | "studio";
};

type DmMessage = {
  id: number;
  senderId: number;
  username?: string;
  displayName?: string;
  content: string;
  createdAt: string;
};

type WimCustomList = {
  id: string;
  name: string;
  userIds: number[];
};

type WimWindowState = {
  id: string;
  kind: "buddy" | "chat";
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  closed: boolean;
  conversationIds?: number[];
  activeConversationId?: number | null;
};

type DragState = {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type ResizeState = {
  id: string;
  startX: number;
  startY: number;
  originWidth: number;
  originHeight: number;
};

const WIM_CONVERSATION_DRAG_TYPE = "application/x-wim-conversation-id";
const WIM_SOURCE_WINDOW_DRAG_TYPE = "application/x-wim-source-window-id";

const INITIAL_WINDOWS: WimWindowState[] = [
  {
    id: "buddy-list",
    kind: "buddy",
    title: "Buddy List",
    x: 18,
    y: 16,
    width: 312,
    height: 520,
    z: 2,
    minimized: false,
    maximized: false,
    closed: false,
  },
];

const Shell = styled.div<{ $hidden: boolean }>`
  --wim-navy: #07156f;
  --wim-blue: #1237a7;
  --wim-cyan: #85f2ff;
  --wim-mint: #baf77a;
  --wim-yellow: #fff19a;
  --wim-silver: #d8d8d8;
  --wim-smoke: #f5f5f0;
  --wim-ink: var(--wtf-app-text, #060b24);
  --wim-panel: var(--wtf-app-surface-raised, #fffdf2);
  --wim-row: var(--wtf-app-surface-raised, #ffffff);
  --wim-row-active: var(--wtf-app-info-bg, #dcecff);
  --wim-divider: var(--wtf-app-border, #050b24);
  --wim-soft-shadow: 2px 2px 0 rgba(6, 19, 95, 0.18);
  --wim-titlebar: linear-gradient(180deg, #fafafa 0%, #c9c9c9 52%, #a8a8a8 100%);
  --wim-titlebar-active: linear-gradient(180deg, #ffffff 0%, #d8ecff 42%, #9fbfdc 100%);

  position: absolute;
  inset: 0;
  display: ${(p) => (p.$hidden ? "none" : "block")};
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: visible;
  pointer-events: none !important;
  color: var(--wim-ink);
  background: transparent;
  border: 0;
  isolation: isolate;

  html[data-wtf-appearance-style="wtf-xp"] & {
    --wim-panel: #f5fbff;
    --wim-row: rgba(255, 255, 255, 0.86);
    --wim-row-active: #cfe5ff;
    --wim-soft-shadow: 0 3px 7px rgba(20, 52, 116, 0.18);
    --wim-titlebar: linear-gradient(180deg, #eff8ff 0%, #b6cde8 48%, #7fa6ce 100%);
    --wim-titlebar-active: linear-gradient(180deg, #ffffff 0%, #6aa2db 48%, #245edb 100%);
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    --wim-panel: rgba(255, 255, 255, 0.9);
    --wim-row: rgba(255, 255, 255, 0.76);
    --wim-row-active: #e4f7ff;
    --wim-soft-shadow: 0 6px 14px rgba(23, 83, 112, 0.18);
    --wim-titlebar: radial-gradient(circle at 50% 12%, rgba(255, 255, 255, 0.95), transparent 40%),
      linear-gradient(180deg, #f8fbff 0%, #a4c3dc 100%);
    --wim-titlebar-active: radial-gradient(circle at 50% 12%, rgba(255, 255, 255, 0.95), transparent 40%),
      linear-gradient(180deg, #dff7ff 0%, #66a9d5 100%);
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    --wim-panel: #fff8a8;
    --wim-row: #ffffff;
    --wim-row-active: #ffef61;
    --wim-divider: #000000;
    --wim-soft-shadow: 4px 4px 0 #000000;
    --wim-titlebar: #dedede;
    --wim-titlebar-active: #8ff5ff;
    background: transparent;
  }

  @media (max-width: 760px) {
    min-height: 0;
  }
`;

const WimWindowFrame = styled.div<{ $maximized: boolean; $kind: WimWindowState["kind"] }>`
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: ${(p) => (p.$kind === "buddy" ? "258px" : "356px")};
  min-height: ${(p) => (p.$kind === "buddy" ? "330px" : "328px")};
  color: var(--wim-ink);
  background: var(--wim-silver);
  border: 1px solid #4b4b4b;
  border-radius: ${(p) => (p.$kind === "buddy" ? "7px" : "6px")};
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.9),
    inset -1px -1px 0 rgba(0, 0, 0, 0.26),
    6px 10px 22px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  isolation: isolate;
  pointer-events: auto;

  ${(p) =>
    p.$maximized
      ? `
    inset: 8px;
    width: auto !important;
    height: auto !important;
  `
      : ""}

  html[data-wtf-appearance-style="wtf-xp"] &,
  html[data-wtf-appearance-style="wtf-aqua"] & {
    border-radius: var(--wtf-panel-radius, 8px);
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 3px solid #000000;
    border-radius: 0;
    box-shadow: 6px 6px 0 #000000;
  }
`;

const WindowTitlebar = styled.div<{ $focused?: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 28px;
  padding: 3px 5px;
  user-select: none;
  cursor: grab;
  color: #07112d;
  background: ${(p) => (p.$focused ? "var(--wim-titlebar-active)" : "var(--wim-titlebar)")};
  border-bottom: 1px solid rgba(0, 0, 0, 0.32);

  &:active {
    cursor: grabbing;
  }
`;

const TrafficLights = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

const TrafficLight = styled.span<{ $tone: "close" | "min" | "max" }>`
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.58);
  background: ${(p) =>
    p.$tone === "close"
      ? "linear-gradient(180deg, #ff897c, #e23b31)"
      : p.$tone === "min"
        ? "linear-gradient(180deg, #ffe98d, #d9a51e)"
        : "linear-gradient(180deg, #9df29c, #24a53d)"};
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.7);
`;

const WindowTitle = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 900;
  text-align: center;
`;

const WindowControls = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
`;

const WindowControlButton = styled.button`
  width: 24px;
  min-width: 24px;
  height: 22px;
  border: 1px solid rgba(0, 0, 0, 0.55);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.72);
  color: #06135f;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;

  &:hover {
    background: #ffffff;
  }

  &:active {
    transform: translateY(1px);
  }
`;

const WindowBody = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: var(--wim-panel);
`;

const ResizeHandle = styled.div`
  position: absolute;
  right: 0;
  bottom: 0;
  width: 22px;
  height: 22px;
  cursor: nwse-resize;
  background:
    linear-gradient(135deg, transparent 0 44%, rgba(0, 0, 0, 0.32) 45% 52%, transparent 53%),
    linear-gradient(135deg, transparent 0 62%, rgba(0, 0, 0, 0.32) 63% 70%, transparent 71%);
`;

const BuddyPane = styled.div`
  position: relative;
  height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-height: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(236, 244, 251, 0.8)),
    var(--wim-panel);
`;

const IdentityPlate = styled.div`
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.18);
`;

const WimMark = styled.div`
  width: 38px;
  height: 38px;
  position: relative;
  border: 2px solid #03091e;
  border-radius: 4px;
  background: linear-gradient(180deg, #fff7b4 0%, #ffc03a 48%, #ff6a3d 100%);
  box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.72), 2px 2px 0 rgba(0, 0, 0, 0.2);
  overflow: hidden;

  &::before {
    content: "W";
    position: absolute;
    left: 11px;
    top: 5px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--wim-navy);
    color: #ffffff;
    font-size: 11px;
    line-height: 13px;
    text-align: center;
    font-weight: 900;
    box-shadow:
      -5px 15px 0 1px var(--wim-navy),
      9px 18px 0 -1px var(--wim-navy);
  }

  &::after {
    content: "";
    position: absolute;
    right: 4px;
    top: 7px;
    width: 14px;
    height: 10px;
    background: #ffffff;
    border: 2px solid #03091e;
    box-shadow: -17px 22px 0 -4px var(--wim-cyan);
  }
`;

const ScreenName = styled.div`
  min-width: 0;
  font-size: var(--wtf-type-body-strong, 16px);
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StatusLine = styled.div`
  margin-top: 2px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #4b557b);
`;

const BuddyToolbar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  padding: 7px 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(218, 226, 235, 0.9));
  border-bottom: 1px solid rgba(0, 0, 0, 0.18);
`;

const SearchWrap = styled.label`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 4px;
  align-items: center;
  min-width: 0;
  padding: 2px 8px;
  border: 1px solid #9da7b0;
  border-radius: 999px;
  background: #ffffff;
`;

const SearchInput = styled.input`
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--wim-ink);
  font: inherit;
`;

const IconButton = styled.button`
  width: 32px;
  min-width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px outset #ffffff;
  background: var(--wtf-app-control-bg, #ffffff);
  color: var(--wtf-app-text, #050b24);
  box-shadow: 1px 1px 0 #000000;
  cursor: pointer;

  &:active {
    border-style: inset;
    box-shadow: inset 1px 1px 0 #808080;
  }

  &:disabled {
    color: var(--wtf-app-disabled-text, #808080);
    background: var(--wtf-app-disabled-bg, #d8d8d8);
    cursor: default;
    opacity: 1;
  }
`;

const RosterScroll = styled.div`
  min-height: 0;
  overflow: auto;
  padding: 7px;
`;

const SectionToggle = styled(Button)`
  width: 100%;
  min-height: 28px;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 7px;
  margin: 0 0 4px;
  font-weight: 900;
  color: #ffffff;
  background: linear-gradient(180deg, #7fa4d0 0%, #516f94 100%);

  html[data-wtf-appearance-style="wtf-zine"] & {
    color: #000000;
    background: #ffef61;
  }
`;

const SectionTitle = styled.span`
  display: inline-flex;
  gap: 5px;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CountBadge = styled.span`
  min-width: 20px;
  padding: 1px 4px;
  background: #fff19a;
  color: #06135f;
  border: 1px solid #050b24;
  text-align: center;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 900;
`;

const DirectoryPanel = styled(Panel).attrs({ variant: "well" })`
  padding: 4px;
  margin-bottom: 8px;
  max-height: 260px;
  overflow: auto;
  min-width: 0;
  color: var(--wim-ink);
  background: rgba(255, 255, 255, 0.82);
  border-color: var(--wtf-app-border, #808080);

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 2px solid #000000;
    background: #ffffff;
  }
`;

const UserRow = styled.div<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
  min-height: 40px;
  padding: 5px 6px;
  margin-bottom: 3px;
  border: 1px solid ${(p) => (p.$active ? "var(--wim-navy)" : "transparent")};
  background: ${(p) => (p.$active ? "var(--wim-row-active)" : "var(--wim-row)")};
  box-shadow: ${(p) => (p.$active ? "var(--wim-soft-shadow)" : "none")};
  cursor: default;

  &:hover {
    border-color: #8a8a8a;
    background: #fff8c9;
  }

  &:focus-visible {
    outline: 2px solid var(--wtf-highlight-color, #000080);
    outline-offset: 1px;
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border-color: ${(p) => (p.$active ? "#000000" : "transparent")};
  }
`;

const PresenceDot = styled.span<{ $status: PresenceStatus }>`
  width: 12px;
  height: 12px;
  border: 1px solid var(--wim-divider);
  border-radius: 50%;
  background: ${(p) =>
    p.$status === "active"
      ? "#20e45a"
      : p.$status === "inactive"
        ? "#ffd044"
        : "#8f8f8f"};
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.7);
`;

const UserName = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const UserHandle = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #4b557b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const UserPresence = styled.div<{ $status: PresenceStatus }>`
  margin-top: 1px;
  font-size: var(--wtf-type-caption, 13px);
  color: ${(p) =>
    p.$status === "active"
      ? "#0c6e27"
      : p.$status === "inactive"
        ? "#745100"
        : "#606060"};
`;

const UserActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 3px;
`;

const RecentButton = styled.button<{ $active?: boolean }>`
  width: 100%;
  min-height: 36px;
  height: auto;
  padding: 5px 7px;
  margin-bottom: 4px;
  border: 1px solid ${(p) => (p.$active ? "var(--wim-navy)" : "transparent")};
  background: ${(p) =>
    p.$active
      ? "linear-gradient(180deg, #0b42c4 0%, #06135f 100%)"
      : "var(--wim-row)"};
  color: ${(p) => (p.$active ? "#ffffff" : "#050b24")};
  text-align: left;
  font: inherit;
  font-weight: ${(p) => (p.$active ? 900 : 700)};
  cursor: default;
`;

const BuddyName = styled.div`
  overflow-wrap: anywhere;
`;

const BuddyPreview = styled.div`
  margin-top: 2px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 400;
  opacity: 0.78;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const BuddyFooter = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 6px 7px;
  border-top: 1px solid rgba(0, 0, 0, 0.18);
  background: linear-gradient(180deg, #d8d8d8, #bcbcbc);
`;

const FooterStat = styled.div`
  min-width: 0;
  padding: 3px;
  border: 1px inset #ffffff;
  background: rgba(255, 255, 255, 0.6);
  text-align: center;
`;

const FooterLabel = styled.div`
  font-size: 11px;
  color: #4b557b;
`;

const FooterValue = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 900;
`;

const SettingsPopover = styled(Panel).attrs({ variant: "well" })`
  position: absolute;
  z-index: 30;
  top: 56px;
  right: 8px;
  width: min(292px, calc(100% - 16px));
  max-height: min(560px, calc(100% - 74px));
  overflow: auto;
  padding: 9px;
  color: var(--wim-ink);
  background: #fffef2;
  box-shadow: 4px 6px 18px rgba(0, 0, 0, 0.28);

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 3px solid #000000;
    background: #fff8a8;
    box-shadow: 6px 6px 0 #000000;
  }
`;

const SettingsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 900;
`;

const InlineForm = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  margin-bottom: 9px;
`;

const SettingsListBlock = styled.div`
  display: grid;
  gap: 6px;
  padding: 7px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.16);
`;

const SettingsListHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const Select = styled.select`
  width: 100%;
  min-height: 32px;
  font: inherit;
  color: var(--wim-ink);
  background: #ffffff;
  border: 2px inset #ffffff;
`;

const ChipGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 2px 4px 2px 7px;
  background: #dff7ff;
  border: 1px solid #7498ae;
  font-size: var(--wtf-type-caption, 13px);
`;

const ChatChrome = styled.div`
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  background: #ececec;
`;

const TabStrip = styled.div`
  display: flex;
  align-items: end;
  gap: 2px;
  min-height: 34px;
  padding: 5px 7px 0;
  overflow-x: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(205, 210, 216, 0.92)),
    var(--wim-silver);
  border-bottom: 1px solid rgba(0, 0, 0, 0.32);
`;

const ChatTab = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 118px;
  max-width: 210px;
  height: 29px;
  padding: 4px 7px;
  border: 1px solid #6e6e6e;
  border-bottom-color: ${(p) => (p.$active ? "#fffef2" : "#6e6e6e")};
  border-radius: 5px 5px 0 0;
  background: ${(p) => (p.$active ? "#fffef2" : "linear-gradient(180deg, #f9f9f9, #c8c8c8)")};
  color: #06135f;
  font: inherit;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: ${(p) => (p.$active ? 900 : 700)};
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`;

const TabLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TabClose = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: #4b557b;
`;

const ChatPane = styled.div`
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0;
  min-height: 0;
  background: #fffef2;
`;

const ChatHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 7px 9px;
  background: linear-gradient(180deg, #ffffff, #edf6ff);
  border-bottom: 1px solid rgba(0, 0, 0, 0.18);
`;

const ChatTitle = styled.div`
  font-size: var(--wtf-type-body-strong, 16px);
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meta = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #4b557b);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const ChatLog = styled(Panel).attrs({ variant: "well" })`
  min-height: 0;
  margin: 8px;
  padding: var(--wtf-space-3, 12px);
  overflow: auto;
  color: var(--wim-ink);
  background:
    radial-gradient(circle at 0 0, rgba(255, 241, 154, 0.58) 0 10px, transparent 11px),
    radial-gradient(circle at 28px 24px, rgba(132, 240, 255, 0.5) 0 8px, transparent 9px),
    #ffffff;
  background-size: 56px 48px;
  border-color: var(--wtf-app-border, #808080);

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 3px solid #000000;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(255, 248, 168, 0.9)),
      #ffffff;
  }
`;

const Message = styled.div<{ $mine?: boolean }>`
  display: grid;
  justify-items: ${(p) => (p.$mine ? "end" : "start")};
  margin: 0 0 10px;
  text-align: ${(p) => (p.$mine ? "right" : "left")};
`;

const Bubble = styled.div<{ $mine?: boolean }>`
  max-width: min(82%, 560px);
  padding: 7px 9px;
  border: 2px solid #0a0a0a;
  background: ${(p) => (p.$mine ? "#dff7ff" : "#fffdf2")};
  box-shadow: ${(p) =>
    p.$mine ? "-2px 2px 0 rgba(6, 19, 95, 0.18)" : "2px 2px 0 rgba(6, 19, 95, 0.18)"};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Composer = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  padding: 0 8px 8px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const Dock = styled.div`
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  z-index: 2000;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 38px;
  padding: 6px;
  border: 1px solid rgba(0, 0, 0, 0.28);
  background: rgba(216, 216, 216, 0.84);
  backdrop-filter: blur(4px);
  pointer-events: auto;
`;

const DesktopConversationDropLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: auto;
`;

const DockButton = styled(Button)`
  min-height: 30px;
  height: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const PopupStack = styled.div`
  --wim-blue: #2687ff;
  --wim-navy: #07156f;
  --wim-ink: #060b24;

  position: fixed;
  right: 14px;
  bottom: 48px;
  z-index: 5000;
  display: grid;
  gap: 8px;
  pointer-events: none;

  @media (max-width: 520px) {
    right: 8px;
    left: 8px;
    bottom: 42px;
  }
`;

const PopupCard = styled(Panel).attrs({ variant: "well" })`
  width: min(338px, calc(100vw - 16px));
  padding: 8px;
  pointer-events: auto;
  color: var(--wim-ink, #060b24);
  background: linear-gradient(180deg, #fffef2 0%, #dff7ff 100%);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.36);

  html[data-wtf-appearance-style="wtf-xp"] &,
  html[data-wtf-appearance-style="wtf-aqua"] & {
    border-radius: var(--wtf-panel-radius, 8px);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 3px solid #000000;
    background: #fff8a8;
    box-shadow: 6px 6px 0 #000000;
    transform: rotate(-0.35deg);
  }
`;

const PopupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  color: #ffffff;
  background: linear-gradient(90deg, var(--wim-navy, #07156f), var(--wim-blue, #2687ff));
  font-weight: 900;

  html[data-wtf-appearance-style="wtf-zine"] & {
    color: #000000;
    background: #ffef61;
    border: 2px solid #000000;
  }
`;

const PopupTitle = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PopupCloseButton = styled(IconButton)`
  width: 22px;
  min-width: 22px;
  height: 22px;
  box-shadow: none;
`;

const PopupBody = styled.button`
  width: 100%;
  padding: 8px 6px 3px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
`;

const PopupSnippet = styled.div`
  margin-top: 4px;
  max-height: 42px;
  overflow: hidden;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

function userLabel(user: MessageUser): string {
  return user.displayName || user.username || `User ${user.id}`;
}

function peerId(peer: DmConversation["peers"][number]): number | null {
  const raw = peer.id ?? peer.userId;
  return Number.isInteger(raw) ? Number(raw) : null;
}

function conversationLabel(conversation: DmConversation): string {
  return (
    conversation.title ||
    conversation.peers
      .map((peer) => peer.displayName || peer.username)
      .filter(Boolean)
      .join(", ") ||
    `Chat ${conversation.id}`
  );
}

function friendStorageKey(userId: number | undefined): string | null {
  return userId ? `wtf:wim:friends:${userId}` : null;
}

function customListsStorageKey(userId: number | undefined): string | null {
  return userId ? `wtf:wim:custom-lists:${userId}` : null;
}

function popupDismissalStorageKey(userId: number | undefined): string | null {
  return userId ? `wtf:wim:popup-dismissals:${userId}` : null;
}

function presenceStatusFor(user: MessageUser | null | undefined): PresenceStatus {
  return user?.presenceStatus ?? (user?.online ? "active" : "offline");
}

function presenceLabel(status: PresenceStatus): string {
  if (status === "active") return "Active now";
  if (status === "inactive") return "Inactive";
  return "Offline";
}

function presenceSortValue(status: PresenceStatus): number {
  if (status === "active") return 0;
  if (status === "inactive") return 1;
  return 2;
}

function sortUsersForRoster(users: MessageUser[]): MessageUser[] {
  return [...users].sort((a, b) => {
    const byStatus =
      presenceSortValue(presenceStatusFor(a)) - presenceSortValue(presenceStatusFor(b));
    if (byStatus !== 0) return byStatus;
    return userLabel(a).localeCompare(userLabel(b), undefined, { sensitivity: "base" });
  });
}

function shortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function popupKeyForConversation(conversation: DmConversation): string {
  const latest = conversation.latestMessage;
  return `${conversation.id}:${latest?.id ?? latest?.createdAt ?? latest?.content ?? "unread"}`;
}

function normalizeCustomLists(raw: unknown): WimCustomList[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const id = String(source.id || "").trim();
      const name = String(source.name || "").trim().slice(0, 40);
      const userIds = Array.isArray(source.userIds)
        ? source.userIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        : [];
      return id && name ? { id, name, userIds: Array.from(new Set(userIds)) } : null;
    })
    .filter((item): item is WimCustomList => Boolean(item))
    .slice(0, 12);
}

function reportWimEvent(
  eventType:
    | "wim.chat.opened"
    | "wim.message.sent"
    | "wim.offline_popup.opened"
    | "wim.offline_popup.dismissed",
  conversationId: number,
  metadata: Record<string, unknown> = {}
) {
  const action =
    eventType === "wim.message.sent"
      ? "sent"
      : eventType === "wim.offline_popup.dismissed"
        ? "dismissed"
        : "opened";
  void api
    .post<{ ok: true }>("/api/desktop/events", {
      eventType,
      objectId: `wim:${conversationId}`,
      objectKind: "messenger",
      action,
      metadata,
    })
    .catch(() => {
      // Telemetry is useful, but messaging must stay usable when logging is not.
    });
}

function reportWimFriendAdded(userId: number) {
  void api
    .post<{ ok: true }>("/api/desktop/events", {
      eventType: "wim.friend.added",
      objectId: `wim-user:${userId}`,
      objectKind: "messenger_friend",
      action: "added",
      metadata: { userId },
    })
    .catch(() => {
      // Telemetry is useful, but friendship shortcuts must stay local-first.
    });
}

function conversationPeerId(conversation: DmConversation | null | undefined): number | null {
  const peer = conversation?.peers[0] ?? null;
  return peer ? peerId(peer) : null;
}

function chatWindowTitle(
  windowState: WimWindowState,
  labelForConversation: (conversationId: number) => string
): string {
  const activeId = windowState.activeConversationId ?? windowState.conversationIds?.[0] ?? null;
  if (!activeId) return windowState.title;
  return `IM with ${labelForConversation(activeId)}`;
}

function hasDraggedConversation(event: ReactDragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes(WIM_CONVERSATION_DRAG_TYPE);
}

function readDraggedConversation(event: ReactDragEvent<HTMLElement>): {
  conversationId: number | null;
  sourceWindowId: string | null;
} {
  const rawConversationId = event.dataTransfer.getData(WIM_CONVERSATION_DRAG_TYPE);
  const conversationId = Number(rawConversationId);
  return {
    conversationId: Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null,
    sourceWindowId: event.dataTransfer.getData(WIM_SOURCE_WINDOW_DRAG_TYPE) || null,
  };
}

type ChatWindowPaneProps = {
  conversationId: number;
  conversation: DmConversation | null;
  peerUser: MessageUser | null;
  currentUserId?: number;
};

function ChatWindowPane({
  conversationId,
  conversation,
  peerUser,
  currentUserId,
}: ChatWindowPaneProps) {
  const qc = useQueryClient();
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const [content, setContent] = useState("");
  const messagesQuery = useQuery({
    queryKey: ["wim", "messages", conversationId],
    enabled: !!conversationId,
    queryFn: () => api.get<DmMessage[]>(`/api/messages/dms/${conversationId}/messages?limit=100`),
  });
  const sendMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/messages/dms/${conversationId}/messages`, { content: content.trim() }),
    onSuccess: () => {
      reportWimEvent("wim.message.sent", conversationId, { messageLength: content.trim().length });
      setContent("");
      qc.invalidateQueries({ queryKey: ["wim", "messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["wim", "conversations", "direct"] });
    },
  });

  useEffect(() => {
    if (!chatLogRef.current) return;
    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [conversationId, messagesQuery.data?.length]);

  useEffect(() => {
    if (!messagesQuery.data) return;
    qc.invalidateQueries({ queryKey: ["wim", "conversations", "direct"] });
  }, [conversationId, messagesQuery.dataUpdatedAt, messagesQuery.data, qc]);

  const label = conversation
    ? conversationLabel(conversation)
    : peerUser
      ? userLabel(peerUser)
      : `Chat ${conversationId}`;
  const presence = peerUser ? presenceLabel(presenceStatusFor(peerUser)) : null;
  const submitMessage = () => {
    if (!content.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
  };

  return (
    <ChatPane>
      <ChatHeader>
        <div>
          <ChatTitle>{label}</ChatTitle>
          <Meta>Direct message{presence ? ` - ${presence}` : ""}</Meta>
        </div>
        <MessageCircle size={24} aria-hidden />
      </ChatHeader>
      <ChatLog ref={chatLogRef}>
        {(messagesQuery.data ?? []).map((message) => {
          const mine = message.senderId === currentUserId;
          return (
            <Message key={message.id} $mine={mine}>
              <Meta>
                {message.displayName || message.username || "WTF user"}
                {shortTime(message.createdAt) ? ` at ${shortTime(message.createdAt)}` : ""}
              </Meta>
              <Bubble $mine={mine}>{message.content}</Bubble>
            </Message>
          );
        })}
        {messagesQuery.isLoading ? <Hourglass size={20} /> : null}
        {messagesQuery.isError ? (
          <UiNotice tone="danger">Messages failed to load. Try this chat again.</UiNotice>
        ) : null}
        {messagesQuery.data?.length === 0 ? (
          <UiEmptyState title="No messages in this chat yet">Ready for the first WIM message.</UiEmptyState>
        ) : null}
      </ChatLog>
      <Composer
        onSubmit={(event) => {
          event.preventDefault();
          submitMessage();
        }}
      >
        <TextInput
          aria-label="WIM message text"
          value={content}
          placeholder="Message"
          onChange={(event: any) => setContent(event.target.value)}
          disabled={sendMutation.isPending}
          style={{ width: "100%" }}
        />
        <Button disabled={!content.trim() || sendMutation.isPending} type="submit">
          <Send size={14} aria-hidden />
          {sendMutation.isPending ? "Sending" : "Send WIM"}
        </Button>
      </Composer>
      {sendMutation.isError ? (
        <UiNotice tone="danger">Message failed to send. Check the chat and try again.</UiNotice>
      ) : null}
    </ChatPane>
  );
}

export function Wim() {
  const { user } = useAuth();
  const wm = useWindowManager();
  const routePath = useContext(WindowPathContext) || "/wim";
  const routeWindowState = wm.getWindow(routePath);
  const routeMinimized = wm.isMinimized(routePath);
  const qc = useQueryClient();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const nextZRef = useRef(8);
  const nextWindowRef = useRef(1);
  const [windows, setWindows] = useState<WimWindowState[]>(INITIAL_WINDOWS);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [conversationDragActive, setConversationDragActive] = useState(false);
  const [selectedBuddyId, setSelectedBuddyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [friendIds, setFriendIds] = useState<number[]>([]);
  const [friendsReady, setFriendsReady] = useState(false);
  const [customLists, setCustomLists] = useState<WimCustomList[]>([]);
  const [customListsReady, setCustomListsReady] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listUserSelections, setListUserSelections] = useState<Record<string, string>>({});
  const [collapsedCustomLists, setCollapsedCustomLists] = useState<Record<string, boolean>>({});
  const [dismissedPopupKeys, setDismissedPopupKeys] = useState<string[]>([]);
  const [dismissedPopupsReady, setDismissedPopupsReady] = useState(false);
  const [conversationPeerHints, setConversationPeerHints] = useState<Record<number, number>>({});
  const [sections, setSections] = useState({
    friends: true,
    active: true,
    inactive: true,
    offline: false,
    all: true,
    recent: false,
  });

  const conversationsQuery = useQuery({
    queryKey: ["wim", "conversations", "direct"],
    queryFn: () => api.get<DmConversation[]>("/api/messages/dms?type=direct"),
    refetchInterval: 15_000,
  });

  const usersQuery = useQuery({
    queryKey: ["wim", "users"],
    queryFn: () => api.get<MessageUser[]>("/api/messages/users?limit=100&excludeSelf=1"),
    refetchInterval: 30_000,
  });

  const conversations = useMemo(
    () =>
      (conversationsQuery.data ?? []).filter(
        (conversation) =>
          (conversation.conversationType ?? "direct") === "direct" &&
          conversation.peers.length === 1
      ),
    [conversationsQuery.data]
  );
  const conversationById = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation])),
    [conversations]
  );
  const wtfUsers = Array.isArray(usersQuery.data) ? usersQuery.data : [];
  const userById = useMemo(() => new Map(wtfUsers.map((item) => [item.id, item])), [wtfUsers]);
  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);
  const dismissedPopupSet = useMemo(() => new Set(dismissedPopupKeys), [dismissedPopupKeys]);
  const openConversationIds = useMemo(() => {
    const ids = new Set<number>();
    windows.forEach((windowState) => {
      if (windowState.kind !== "chat" || windowState.closed) return;
      (windowState.conversationIds ?? []).forEach((conversationId) => ids.add(conversationId));
    });
    return ids;
  }, [windows]);
  const openPeerIds = useMemo(() => {
    const ids = new Set<number>();
    openConversationIds.forEach((conversationId) => {
      const peerIdForConversation =
        conversationPeerId(conversationById.get(conversationId)) ?? conversationPeerHints[conversationId];
      if (peerIdForConversation) ids.add(peerIdForConversation);
    });
    return ids;
  }, [conversationById, conversationPeerHints, openConversationIds]);
  const friends = sortUsersForRoster(wtfUsers.filter((item) => friendIdSet.has(item.id)));
  const activeUsers = sortUsersForRoster(
    wtfUsers.filter(
      (item) => presenceStatusFor(item) === "active" && !friendIdSet.has(item.id)
    )
  );
  const inactiveUsers = sortUsersForRoster(
    wtfUsers.filter(
      (item) => presenceStatusFor(item) === "inactive" && !friendIdSet.has(item.id)
    )
  );
  const offlineUsers = sortUsersForRoster(
    wtfUsers.filter(
      (item) => presenceStatusFor(item) === "offline" && !friendIdSet.has(item.id)
    )
  );
  const filteredUsers = sortUsersForRoster(
    wtfUsers.filter((item) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${item.username} ${item.displayName ?? ""}`.toLowerCase().includes(q);
    })
  );
  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations]
  );
  const unreadPopups = useMemo(
    () =>
      conversations
        .filter((conversation) => {
          if (!conversation.unreadCount || !conversation.latestMessage) return false;
          if (openConversationIds.has(conversation.id)) return false;
          if (conversation.latestMessage.senderId === user?.id) return false;
          return !dismissedPopupSet.has(popupKeyForConversation(conversation));
        })
        .slice(0, 3)
        .map((conversation) => {
          const peer = conversation.peers[0] ?? null;
          return {
            key: popupKeyForConversation(conversation),
            conversationId: conversation.id,
            peerId: peer ? peerId(peer) : null,
            title: conversationLabel(conversation),
            snippet: conversation.latestMessage?.content ?? "",
            createdAt: conversation.latestMessage?.createdAt ?? "",
            unreadCount: conversation.unreadCount,
          };
        }),
    [conversations, dismissedPopupSet, openConversationIds, user?.id]
  );

  const openChatMutation = useMutation({
    mutationFn: (targetUserId: number) =>
      api.post<{ id: number }>("/api/messages/dms", { targetUserId }),
    onSuccess: (conversation, targetUserId) => {
      setConversationPeerHints((current) => ({ ...current, [conversation.id]: targetUserId }));
      showConversation(conversation.id, targetUserId);
      qc.invalidateQueries({ queryKey: ["wim", "conversations", "direct"] });
    },
  });

  const nextZ = () => {
    nextZRef.current += 1;
    return nextZRef.current;
  };

  const focusWimRoute = () => {
    if (wm.focusedPath !== routePath || routeMinimized) {
      wm.focus(routePath);
    }
  };

  const bringToFront = (windowId: string) => {
    focusWimRoute();
    const z = nextZ();
    setWindows((current) =>
      current.map((windowState) => (windowState.id === windowId ? { ...windowState, z } : windowState))
    );
  };

  useEffect(() => {
    wm.setTitle(routePath, "WIM");
  }, [routePath, wm.setTitle]);

  const labelForConversation = (conversationId: number): string => {
    const conversation = conversationById.get(conversationId);
    if (conversation) return conversationLabel(conversation);
    const hintedPeerId = conversationPeerHints[conversationId];
    const hintedUser = hintedPeerId ? userById.get(hintedPeerId) : null;
    return hintedUser ? userLabel(hintedUser) : `Chat ${conversationId}`;
  };

  const peerForConversation = (conversationId: number): MessageUser | null => {
    const directPeerId =
      conversationPeerId(conversationById.get(conversationId)) ?? conversationPeerHints[conversationId];
    return directPeerId ? userById.get(directPeerId) ?? null : null;
  };

  const showConversation = (conversationId: number, targetPeerId?: number | null) => {
    focusWimRoute();
    if (targetPeerId) {
      setConversationPeerHints((current) => ({ ...current, [conversationId]: targetPeerId }));
    }
    reportWimEvent("wim.chat.opened", conversationId, {
      tabbed: true,
      peerId: targetPeerId ?? conversationPeerHints[conversationId] ?? conversationPeerId(conversationById.get(conversationId)),
    });
    const z = nextZ();
    setWindows((current) => {
      const existing = current.find(
        (windowState) =>
          windowState.kind === "chat" &&
          !windowState.closed &&
          (windowState.conversationIds ?? []).includes(conversationId)
      );
      if (existing) {
        return current.map((windowState) =>
          windowState.id === existing.id
            ? {
                ...windowState,
                activeConversationId: conversationId,
                minimized: false,
                closed: false,
                z,
              }
            : windowState
        );
      }

      const target = current
        .filter((windowState) => windowState.kind === "chat" && !windowState.closed)
        .sort((a, b) => b.z - a.z)[0];
      if (target) {
        return current.map((windowState) =>
          windowState.id === target.id
            ? {
                ...windowState,
                conversationIds: Array.from(
                  new Set([...(windowState.conversationIds ?? []), conversationId])
                ),
                activeConversationId: conversationId,
                minimized: false,
                z,
              }
            : windowState
        );
      }

      const surfaceBounds = surfaceRef.current?.getBoundingClientRect();
      const surfaceWidth = surfaceBounds?.width ?? 960;
      const surfaceHeight = surfaceBounds?.height ?? 640;
      const preferredWidth = Math.min(560, Math.max(356, surfaceWidth - 24));
      const preferredHeight = Math.min(470, Math.max(328, surfaceHeight - 56));
      const buddyWindow = current.find((windowState) => windowState.id === "buddy-list");
      const preferredX = buddyWindow ? buddyWindow.x + buddyWindow.width + 12 : 342;
      const maxX = Math.max(8, surfaceWidth - preferredWidth - 10);
      const maxY = Math.max(8, surfaceHeight - preferredHeight - 10);
      const newWindow: WimWindowState = {
        id: `chat-${nextWindowRef.current++}`,
        kind: "chat",
        title: "Conversation",
        x: Math.min(Math.max(8, preferredX), maxX),
        y: Math.min(46, maxY),
        width: preferredWidth,
        height: preferredHeight,
        z,
        minimized: false,
        maximized: false,
        closed: false,
        conversationIds: [conversationId],
        activeConversationId: conversationId,
      };
      return [...current, newWindow];
    });
  };

  useEffect(() => {
    const key = friendStorageKey(user?.id);
    setFriendsReady(false);
    if (!key) {
      setFriendIds([]);
      setFriendsReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
      setFriendIds(
        Array.isArray(parsed)
          ? parsed
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value) && value > 0)
          : []
      );
    } catch {
      setFriendIds([]);
    } finally {
      setFriendsReady(true);
    }
  }, [user?.id]);

  useEffect(() => {
    const key = friendStorageKey(user?.id);
    if (!key || !friendsReady) return;
    window.localStorage.setItem(key, JSON.stringify(friendIds));
  }, [friendIds, friendsReady, user?.id]);

  useEffect(() => {
    const key = customListsStorageKey(user?.id);
    setCustomListsReady(false);
    if (!key) {
      setCustomLists([]);
      setCustomListsReady(true);
      return;
    }
    try {
      setCustomLists(normalizeCustomLists(JSON.parse(window.localStorage.getItem(key) || "[]")));
    } catch {
      setCustomLists([]);
    } finally {
      setCustomListsReady(true);
    }
  }, [user?.id]);

  useEffect(() => {
    const key = customListsStorageKey(user?.id);
    if (!key || !customListsReady) return;
    window.localStorage.setItem(key, JSON.stringify(customLists));
  }, [customLists, customListsReady, user?.id]);

  useEffect(() => {
    const key = popupDismissalStorageKey(user?.id);
    setDismissedPopupsReady(false);
    if (!key) {
      setDismissedPopupKeys([]);
      setDismissedPopupsReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
      setDismissedPopupKeys(
        Array.isArray(parsed)
          ? parsed
              .map((value) => String(value))
              .filter(Boolean)
              .slice(-80)
          : []
      );
    } catch {
      setDismissedPopupKeys([]);
    } finally {
      setDismissedPopupsReady(true);
    }
  }, [user?.id]);

  useEffect(() => {
    const key = popupDismissalStorageKey(user?.id);
    if (!key || !dismissedPopupsReady) return;
    window.localStorage.setItem(key, JSON.stringify(dismissedPopupKeys.slice(-80)));
  }, [dismissedPopupKeys, dismissedPopupsReady, user?.id]);

  useEffect(() => {
    if (!dragState && !resizeState) return;
    const onPointerMove = (event: PointerEvent) => {
      if (dragState) {
        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        const bounds = surfaceRef.current?.getBoundingClientRect();
        setWindows((current) =>
          current.map((windowState) => {
            if (windowState.id !== dragState.id || windowState.maximized) return windowState;
            const maxX = bounds ? Math.max(0, bounds.width - 72) : Number.POSITIVE_INFINITY;
            const maxY = bounds ? Math.max(0, bounds.height - 42) : Number.POSITIVE_INFINITY;
            return {
              ...windowState,
              x: Math.min(Math.max(0, dragState.originX + dx), maxX),
              y: Math.min(Math.max(0, dragState.originY + dy), maxY),
            };
          })
        );
      }
      if (resizeState) {
        const dx = event.clientX - resizeState.startX;
        const dy = event.clientY - resizeState.startY;
        const bounds = surfaceRef.current?.getBoundingClientRect();
        setWindows((current) =>
          current.map((windowState) =>
            windowState.id === resizeState.id
              ? (() => {
                  const minWidth = windowState.kind === "buddy" ? 258 : 356;
                  const minHeight = windowState.kind === "buddy" ? 330 : 328;
                  const maxWidth = bounds
                    ? Math.max(minWidth, bounds.width - windowState.x - 8)
                    : Number.POSITIVE_INFINITY;
                  const maxHeight = bounds
                    ? Math.max(minHeight, bounds.height - windowState.y - 8)
                    : Number.POSITIVE_INFINITY;
                  return {
                    ...windowState,
                    width: Math.min(maxWidth, Math.max(minWidth, resizeState.originWidth + dx)),
                    height: Math.min(maxHeight, Math.max(minHeight, resizeState.originHeight + dy)),
                  };
                })()
              : windowState
          )
        );
      }
    };
    const onPointerUp = () => {
      setDragState(null);
      setResizeState(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragState, resizeState]);

  const toggleSection = (key: keyof typeof sections) => {
    setSections((current) => ({ ...current, [key]: !current[key] }));
  };

  const addFriend = (userId: number) => {
    setFriendIds((current) => {
      if (current.includes(userId)) return current;
      reportWimFriendAdded(userId);
      return [...current, userId].sort((a, b) => a - b);
    });
  };

  const createCustomList = () => {
    const name = newListName.trim().slice(0, 40);
    if (!name) return;
    setCustomLists((current) => [
      ...current,
      {
        id: `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        userIds: [],
      },
    ]);
    setNewListName("");
  };

  const deleteCustomList = (listId: string) => {
    setCustomLists((current) => current.filter((list) => list.id !== listId));
    setListUserSelections((current) => {
      const next = { ...current };
      delete next[listId];
      return next;
    });
  };

  const addUserToCustomList = (listId: string) => {
    const userId = Number(listUserSelections[listId]);
    if (!Number.isInteger(userId) || userId <= 0) return;
    setCustomLists((current) =>
      current.map((list) =>
        list.id === listId
          ? { ...list, userIds: Array.from(new Set([...list.userIds, userId])) }
          : list
      )
    );
    setListUserSelections((current) => ({ ...current, [listId]: "" }));
  };

  const removeUserFromCustomList = (listId: string, userId: number) => {
    setCustomLists((current) =>
      current.map((list) =>
        list.id === listId
          ? { ...list, userIds: list.userIds.filter((item) => item !== userId) }
          : list
      )
    );
  };

  const rememberPopupDismissal = (key: string) => {
    setDismissedPopupKeys((current) =>
      current.includes(key) ? current : [...current, key].slice(-80)
    );
  };

  const openPopupConversation = (popup: (typeof unreadPopups)[number]) => {
    rememberPopupDismissal(popup.key);
    const popupPeerId = popup.peerId;
    if (popupPeerId) {
      setConversationPeerHints((current) => ({ ...current, [popup.conversationId]: popupPeerId }));
    }
    showConversation(popup.conversationId, popupPeerId);
    reportWimEvent("wim.offline_popup.opened", popup.conversationId, {
      unreadCount: popup.unreadCount,
    });
  };

  const dismissPopup = (popup: (typeof unreadPopups)[number]) => {
    rememberPopupDismissal(popup.key);
    reportWimEvent("wim.offline_popup.dismissed", popup.conversationId, {
      unreadCount: popup.unreadCount,
    });
  };

  const openDirectChat = (target: MessageUser) => {
    setSelectedBuddyId(target.id);
    const existing = conversations.find((conversation) =>
      conversation.peers.some((peer) => peerId(peer) === target.id)
    );
    if (existing) {
      showConversation(existing.id, target.id);
      return;
    }
    openChatMutation.mutate(target.id);
  };

  const openConversation = (conversation: DmConversation) => {
    const peer = conversation.peers[0] ?? null;
    showConversation(conversation.id, peer ? peerId(peer) : null);
  };

  const startWindowDrag = (event: ReactPointerEvent<HTMLElement>, windowState: WimWindowState) => {
    if (event.button !== 0 || windowState.maximized) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-window-control='true']")) return;
    bringToFront(windowState.id);
    setDragState({
      id: windowState.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: windowState.x,
      originY: windowState.y,
    });
  };

  const startWindowResize = (event: ReactPointerEvent<HTMLElement>, windowState: WimWindowState) => {
    if (event.button !== 0 || windowState.maximized) return;
    event.preventDefault();
    event.stopPropagation();
    bringToFront(windowState.id);
    setResizeState({
      id: windowState.id,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: windowState.width,
      originHeight: windowState.height,
    });
  };

  const minimizeWindow = (windowId: string) => {
    setWindows((current) =>
      current.map((windowState) =>
        windowState.id === windowId ? { ...windowState, minimized: true } : windowState
      )
    );
  };

  const restoreWindow = (windowId: string) => {
    focusWimRoute();
    const z = nextZ();
    setWindows((current) =>
      current.map((windowState) =>
        windowState.id === windowId
          ? { ...windowState, minimized: false, closed: false, z }
          : windowState
      )
    );
  };

  const toggleMaximizeWindow = (windowId: string) => {
    focusWimRoute();
    const z = nextZ();
    setWindows((current) =>
      current.map((windowState) =>
        windowState.id === windowId
          ? { ...windowState, minimized: false, maximized: !windowState.maximized, z }
          : windowState
      )
    );
  };

  const closeWindow = (windowId: string) => {
    setWindows((current) =>
      current.map((windowState) =>
        windowState.id === windowId
          ? {
              ...windowState,
              closed: true,
              minimized: false,
              conversationIds: windowState.kind === "chat" ? [] : windowState.conversationIds,
              activeConversationId: null,
            }
          : windowState
      )
    );
  };

  const activateConversationTab = (windowId: string, conversationId: number) => {
    reportWimEvent("wim.chat.opened", conversationId, {
      tabActivated: true,
      peerId: conversationPeerId(conversationById.get(conversationId)) ?? conversationPeerHints[conversationId],
    });
    const z = nextZ();
    setWindows((current) =>
      current.map((windowState) =>
        windowState.id === windowId
          ? { ...windowState, activeConversationId: conversationId, minimized: false, z }
          : windowState
      )
    );
  };

  const closeConversationTab = (windowId: string, conversationId: number) => {
    setWindows((current) =>
      current.map((windowState) => {
        if (windowState.id !== windowId || windowState.kind !== "chat") return windowState;
        const remaining = (windowState.conversationIds ?? []).filter((item) => item !== conversationId);
        if (!remaining.length) {
          return {
            ...windowState,
            closed: true,
            minimized: false,
            conversationIds: [],
            activeConversationId: null,
          };
        }
        return {
          ...windowState,
          conversationIds: remaining,
          activeConversationId:
            windowState.activeConversationId === conversationId
              ? remaining[0]
              : windowState.activeConversationId,
        };
      })
    );
  };

  const moveConversationToWindow = (
    conversationId: number,
    sourceWindowId: string | null,
    targetWindowId: string
  ) => {
    if (!conversationId) return;
    reportWimEvent("wim.chat.opened", conversationId, { tabDropped: true });
    const z = nextZ();
    setWindows((current) =>
      current.map((windowState) => {
        if (windowState.kind !== "chat") return windowState;
        if (windowState.id === targetWindowId) {
          return {
            ...windowState,
            conversationIds: Array.from(new Set([...(windowState.conversationIds ?? []), conversationId])),
            activeConversationId: conversationId,
            minimized: false,
            closed: false,
            z,
          };
        }
        if (windowState.id === sourceWindowId) {
          const remaining = (windowState.conversationIds ?? []).filter((item) => item !== conversationId);
          return {
            ...windowState,
            conversationIds: remaining,
            activeConversationId:
              windowState.activeConversationId === conversationId
                ? remaining[0] ?? null
                : windowState.activeConversationId,
            closed: remaining.length ? windowState.closed : true,
          };
        }
        return {
          ...windowState,
          conversationIds: (windowState.conversationIds ?? []).filter((item) => item !== conversationId),
        };
      })
    );
  };

  const detachConversationToWindow = (
    conversationId: number,
    sourceWindowId: string | null,
    x: number,
    y: number
  ) => {
    if (!conversationId) return;
    reportWimEvent("wim.chat.opened", conversationId, { tabDetached: true });
    const z = nextZ();
    const surfaceBounds = surfaceRef.current?.getBoundingClientRect();
    const surfaceWidth = surfaceBounds?.width ?? 960;
    const surfaceHeight = surfaceBounds?.height ?? 640;
    const width = Math.min(540, Math.max(356, surfaceWidth - 16));
    const height = Math.min(460, Math.max(328, surfaceHeight - 48));
    const maxX = Math.max(8, surfaceWidth - width - 8);
    const maxY = Math.max(8, surfaceHeight - height - 8);
    const newWindow: WimWindowState = {
      id: `chat-${nextWindowRef.current++}`,
      kind: "chat",
      title: "Conversation",
      x: Math.min(maxX, Math.max(8, x - 170)),
      y: Math.min(maxY, Math.max(8, y - 18)),
      width,
      height,
      z,
      minimized: false,
      maximized: false,
      closed: false,
      conversationIds: [conversationId],
      activeConversationId: conversationId,
    };
    setWindows((current) => [
      ...current.map((windowState) => {
        if (windowState.kind !== "chat" || windowState.id !== sourceWindowId) return windowState;
        const remaining = (windowState.conversationIds ?? []).filter((item) => item !== conversationId);
        return {
          ...windowState,
          conversationIds: remaining,
          activeConversationId:
            windowState.activeConversationId === conversationId
              ? remaining[0] ?? null
              : windowState.activeConversationId,
          closed: remaining.length ? windowState.closed : true,
        };
      }),
      newWindow,
    ]);
  };

  const renderSectionToggle = (
    key: keyof typeof sections,
    label: string,
    count: number
  ) => (
    <SectionToggle type="button" onClick={() => toggleSection(key)}>
      <SectionTitle>
        {sections[key] ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        {label}
      </SectionTitle>
      <CountBadge>{count}</CountBadge>
    </SectionToggle>
  );

  const renderUserRow = (item: MessageUser) => {
    const active = selectedBuddyId === item.id || openPeerIds.has(item.id);
    const isFriend = friendIdSet.has(item.id);
    const status = presenceStatusFor(item);
    return (
      <UserRow
        key={item.id}
        $active={active}
        role="button"
        aria-label={`Open WIM chat with ${userLabel(item)}`}
        tabIndex={0}
        onClick={() => setSelectedBuddyId(item.id)}
        onDoubleClickCapture={() => openDirectChat(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            openDirectChat(item);
          }
        }}
      >
        <PresenceDot $status={status} title={presenceLabel(status)} />
        <div>
          <UserName>{userLabel(item)}</UserName>
          <UserHandle>@{item.username}</UserHandle>
          <UserPresence $status={status}>{presenceLabel(status)}</UserPresence>
        </div>
        <UserActions>
          {!isFriend ? (
            <IconButton
              type="button"
              aria-label={`Add ${userLabel(item)} as a WIM friend`}
              title="Add friend"
              data-compact-control="true"
              onClickCapture={(event) => {
                event.stopPropagation();
                addFriend(item.id);
              }}
            >
              <UserPlus size={14} aria-hidden />
            </IconButton>
          ) : (
            <Check size={14} aria-label="Saved friend" />
          )}
        </UserActions>
      </UserRow>
    );
  };

  const renderCustomListSection = (list: WimCustomList) => {
    const listUsers = sortUsersForRoster(
      list.userIds.map((userId) => userById.get(userId)).filter((item): item is MessageUser => Boolean(item))
    );
    const collapsed = collapsedCustomLists[list.id] ?? false;
    return (
      <div key={list.id}>
        <SectionToggle
          type="button"
          onClick={() =>
            setCollapsedCustomLists((current) => ({ ...current, [list.id]: !collapsed }))
          }
        >
          <SectionTitle>
            {collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            <Folder size={14} aria-hidden />
            {list.name}
          </SectionTitle>
          <CountBadge>{listUsers.length}</CountBadge>
        </SectionToggle>
        {!collapsed ? (
          <DirectoryPanel>
            {listUsers.length ? (
              listUsers.map(renderUserRow)
            ) : (
              <UiEmptyState title="Empty list">No buddies placed here yet.</UiEmptyState>
            )}
          </DirectoryPanel>
        ) : null}
      </div>
    );
  };

  const renderRecentChats = () => (
    <DirectoryPanel>
      {conversations.map((conversation) => {
        const label = conversationLabel(conversation);
        const peer = conversationPeerId(conversation);
        const active =
          openConversationIds.has(conversation.id) ||
          (peer ? selectedBuddyId === peer : false);
        return (
          <RecentButton
            key={conversation.id}
            $active={active}
            type="button"
            onClick={() => peer && setSelectedBuddyId(peer)}
            onDoubleClickCapture={() => openConversation(conversation)}
          >
            <BuddyName>
              {label}
              {conversation.unreadCount ? ` (${conversation.unreadCount})` : ""}
            </BuddyName>
            {conversation.latestMessage?.content ? (
              <BuddyPreview>{conversation.latestMessage.content}</BuddyPreview>
            ) : null}
          </RecentButton>
        );
      })}
      {conversations.length === 0 ? (
        <UiEmptyState title="No direct chats yet">No WIM history is waiting.</UiEmptyState>
      ) : null}
    </DirectoryPanel>
  );

  const renderBuddyWindow = () => (
    <BuddyPane>
      <IdentityPlate>
        <WimMark aria-hidden />
        <div>
          <ScreenName>{user?.displayName || user?.username || "WTF User"}</ScreenName>
          <StatusLine>Available</StatusLine>
        </div>
        <IconButton
          type="button"
          aria-label="Open WIM settings"
          title="Settings"
          data-compact-control="true"
          onClick={() => setSettingsOpen((current) => !current)}
        >
          <Settings size={15} aria-hidden />
        </IconButton>
      </IdentityPlate>
      <BuddyToolbar>
        <SearchWrap>
          <Search size={14} aria-hidden />
          <SearchInput
            aria-label="Find WIM user"
            value={search}
            placeholder="Find in Buddy List"
            onChange={(event) => setSearch(event.target.value)}
          />
        </SearchWrap>
        <IconButton
          type="button"
          aria-label="Refresh WIM buddies"
          title="Refresh buddies"
          data-compact-control="true"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["wim", "users"] });
            qc.invalidateQueries({ queryKey: ["wim", "conversations", "direct"] });
          }}
        >
          <Users size={15} aria-hidden />
        </IconButton>
      </BuddyToolbar>
      {settingsOpen ? (
        <SettingsPopover role="dialog" aria-label="WIM settings">
          <SettingsHeader>
            <span>Buddy list settings</span>
            <IconButton
              type="button"
              aria-label="Close WIM settings"
              title="Close settings"
              data-compact-control="true"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={13} aria-hidden />
            </IconButton>
          </SettingsHeader>
          <InlineForm
            onSubmit={(event) => {
              event.preventDefault();
              createCustomList();
            }}
          >
            <TextInput
              aria-label="New WIM list name"
              value={newListName}
              placeholder="New list name"
              onChange={(event: any) => setNewListName(event.target.value)}
              style={{ width: "100%" }}
            />
            <IconButton
              type="submit"
              aria-label="Create WIM list"
              title="Create list"
              data-compact-control="true"
              disabled={!newListName.trim()}
            >
              <Plus size={14} aria-hidden />
            </IconButton>
          </InlineForm>
          {customLists.length ? (
            customLists.map((list) => (
              <SettingsListBlock key={list.id}>
                <SettingsListHeader>
                  <strong>{list.name}</strong>
                  <IconButton
                    type="button"
                    aria-label={`Delete WIM list ${list.name}`}
                    title="Delete list"
                    data-compact-control="true"
                    onClick={() => deleteCustomList(list.id)}
                  >
                    <Trash2 size={13} aria-hidden />
                  </IconButton>
                </SettingsListHeader>
                <Select
                  aria-label={`Choose user for WIM list ${list.name}`}
                  value={listUserSelections[list.id] ?? ""}
                  onChange={(event) =>
                    setListUserSelections((current) => ({
                      ...current,
                      [list.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">Choose WTF user</option>
                  {sortUsersForRoster(wtfUsers).map((item) => (
                    <option key={item.id} value={item.id}>
                      {userLabel(item)} (@{item.username})
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  disabled={!listUserSelections[list.id]}
                  onClick={() => addUserToCustomList(list.id)}
                >
                  Place User
                </Button>
                <ChipGrid>
                  {list.userIds.map((listUserId) => {
                    const listUser = userById.get(listUserId);
                    return (
                      <Chip key={listUserId}>
                        {listUser ? userLabel(listUser) : `User ${listUserId}`}
                        <WindowControlButton
                          type="button"
                          aria-label={`Remove ${listUser ? userLabel(listUser) : `User ${listUserId}`} from ${list.name}`}
                          title="Remove from list"
                          data-window-control="true"
                          onClick={() => removeUserFromCustomList(list.id, listUserId)}
                        >
                          <X size={11} aria-hidden />
                        </WindowControlButton>
                      </Chip>
                    );
                  })}
                </ChipGrid>
              </SettingsListBlock>
            ))
          ) : (
            <UiEmptyState title="No custom lists">Create one from here.</UiEmptyState>
          )}
        </SettingsPopover>
      ) : null}
      <RosterScroll>
        {!usersQuery.data ? (
          <Hourglass size={24} />
        ) : usersQuery.isError ? (
          <UiNotice tone="danger">Buddy list failed to load. Try refreshing WIM.</UiNotice>
        ) : (
          <>
            {renderSectionToggle("friends", "My Friends", friends.length)}
            {sections.friends ? (
              <DirectoryPanel>
                {friends.length ? (
                  friends.map(renderUserRow)
                ) : (
                  <UiEmptyState title="No friends saved">No pinned buddies yet.</UiEmptyState>
                )}
              </DirectoryPanel>
            ) : null}

            {customLists.map(renderCustomListSection)}

            {renderSectionToggle("active", "Active Now", activeUsers.length)}
            {sections.active ? (
              <DirectoryPanel>
                {activeUsers.length ? (
                  activeUsers.map(renderUserRow)
                ) : (
                  <UiEmptyState title="No one else is active">No active buddies in view.</UiEmptyState>
                )}
              </DirectoryPanel>
            ) : null}

            {renderSectionToggle("inactive", "Inactive / Away", inactiveUsers.length)}
            {sections.inactive ? (
              <DirectoryPanel>
                {inactiveUsers.length ? (
                  inactiveUsers.map(renderUserRow)
                ) : (
                  <UiEmptyState title="No idle sessions">No away buddies in view.</UiEmptyState>
                )}
              </DirectoryPanel>
            ) : null}

            {renderSectionToggle("offline", "Offline", offlineUsers.length)}
            {sections.offline ? (
              <DirectoryPanel>
                {offlineUsers.length ? (
                  offlineUsers.map(renderUserRow)
                ) : (
                  <UiEmptyState title="No offline users in this slice">No offline buddies in view.</UiEmptyState>
                )}
              </DirectoryPanel>
            ) : null}

            {renderSectionToggle("all", "All WTF Users", filteredUsers.length)}
            {sections.all ? (
              <DirectoryPanel>
                {filteredUsers.length ? (
                  filteredUsers.map(renderUserRow)
                ) : (
                  <UiEmptyState title="No matching users">No matching WTF users.</UiEmptyState>
                )}
              </DirectoryPanel>
            ) : null}

            {renderSectionToggle("recent", "Recent Direct Chats", conversations.length)}
            {sections.recent ? renderRecentChats() : null}
          </>
        )}
      </RosterScroll>
      <BuddyFooter>
        <FooterStat>
          <FooterLabel>Friends</FooterLabel>
          <FooterValue>{friends.length}</FooterValue>
        </FooterStat>
        <FooterStat>
          <FooterLabel>Active</FooterLabel>
          <FooterValue>{wtfUsers.filter((item) => presenceStatusFor(item) === "active").length}</FooterValue>
        </FooterStat>
        <FooterStat>
          <FooterLabel>Unread</FooterLabel>
          <FooterValue>{unreadTotal}</FooterValue>
        </FooterStat>
      </BuddyFooter>
    </BuddyPane>
  );

  const renderChatWindow = (windowState: WimWindowState) => {
    const conversationIds = windowState.conversationIds ?? [];
    const activeConversationId = windowState.activeConversationId ?? conversationIds[0] ?? null;
    if (!activeConversationId) return null;
    const activeConversation = conversationById.get(activeConversationId) ?? null;
    const activePeer = peerForConversation(activeConversationId);
    return (
      <ChatChrome>
        <TabStrip
          role="tablist"
          aria-label="WIM conversations"
          onDragOver={(event) => {
            if (!hasDraggedConversation(event)) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            if (!hasDraggedConversation(event)) return;
            event.preventDefault();
            event.stopPropagation();
            setConversationDragActive(false);
            const dropped = readDraggedConversation(event);
            if (!dropped.conversationId) return;
            moveConversationToWindow(dropped.conversationId, dropped.sourceWindowId, windowState.id);
          }}
        >
          {conversationIds.map((conversationId) => (
            <ChatTab
              key={conversationId}
              type="button"
              role="tab"
              aria-selected={activeConversationId === conversationId}
              $active={activeConversationId === conversationId}
              draggable
              onClick={() => activateConversationTab(windowState.id, conversationId)}
              onDragStart={(event) => {
                setConversationDragActive(true);
                event.dataTransfer.setData(WIM_CONVERSATION_DRAG_TYPE, String(conversationId));
                event.dataTransfer.setData(WIM_SOURCE_WINDOW_DRAG_TYPE, windowState.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setConversationDragActive(false)}
            >
              <MessageCircle size={13} aria-hidden />
              <TabLabel>{labelForConversation(conversationId)}</TabLabel>
              <TabClose
                role="button"
                aria-label={`Close WIM tab ${labelForConversation(conversationId)}`}
                title="Close tab"
                data-window-control="true"
                onClick={(event) => {
                  event.stopPropagation();
                  closeConversationTab(windowState.id, conversationId);
                }}
              >
                <X size={12} aria-hidden />
              </TabClose>
            </ChatTab>
          ))}
        </TabStrip>
        <ChatWindowPane
          key={activeConversationId}
          conversationId={activeConversationId}
          conversation={activeConversation}
          peerUser={activePeer}
          currentUserId={user?.id}
        />
      </ChatChrome>
    );
  };

  const renderWindow = (windowState: WimWindowState) => {
    if (windowState.closed || windowState.minimized) return null;
    const frameStyle: CSSProperties = windowState.maximized
      ? { zIndex: windowState.z }
      : {
          left: windowState.x,
          top: windowState.y,
          width: windowState.width,
          height: windowState.height,
          zIndex: windowState.z,
        };
    const title =
      windowState.kind === "chat" ? chatWindowTitle(windowState, labelForConversation) : windowState.title;
    const visibleTopZ = Math.max(
      0,
      ...windows.filter((item) => !item.closed && !item.minimized).map((item) => item.z)
    );
    return (
      <WimWindowFrame
        key={windowState.id}
        $kind={windowState.kind}
        $maximized={windowState.maximized}
        style={frameStyle}
        role="dialog"
        aria-label={`WIM ${title}`}
        data-wim-window-kind={windowState.kind}
        onPointerDown={() => bringToFront(windowState.id)}
      >
        <WindowTitlebar
          $focused={windowState.z === visibleTopZ}
          onPointerDown={(event) => startWindowDrag(event, windowState)}
        >
          <TrafficLights aria-hidden>
            <TrafficLight $tone="close" />
            <TrafficLight $tone="min" />
            <TrafficLight $tone="max" />
          </TrafficLights>
          <WindowTitle>{title}</WindowTitle>
          <WindowControls>
            <WindowControlButton
              type="button"
              aria-label={`Minimize WIM ${title}`}
              title="Minimize"
              data-window-control="true"
              onClick={() => minimizeWindow(windowState.id)}
            >
              <Minus size={13} aria-hidden />
            </WindowControlButton>
            <WindowControlButton
              type="button"
              aria-label={`${windowState.maximized ? "Restore" : "Maximize"} WIM ${title}`}
              title={windowState.maximized ? "Restore" : "Maximize"}
              data-window-control="true"
              onClick={() => toggleMaximizeWindow(windowState.id)}
            >
              {windowState.maximized ? <Minimize2 size={13} aria-hidden /> : <Maximize2 size={13} aria-hidden />}
            </WindowControlButton>
            <WindowControlButton
              type="button"
              aria-label={`Close WIM ${title}`}
              title="Close"
              data-window-control="true"
              onClick={() => closeWindow(windowState.id)}
            >
              <X size={13} aria-hidden />
            </WindowControlButton>
          </WindowControls>
        </WindowTitlebar>
        <WindowBody>
          {windowState.kind === "buddy" ? renderBuddyWindow() : renderChatWindow(windowState)}
        </WindowBody>
        {!windowState.maximized ? (
          <ResizeHandle
            role="separator"
            aria-label={`Resize WIM ${title}`}
            onPointerDown={(event) => startWindowResize(event, windowState)}
          />
        ) : null}
      </WimWindowFrame>
    );
  };

  const dockWindows = windows.filter((windowState) => windowState.minimized || windowState.closed);
  const showBuddyLauncher = windows.some((windowState) => windowState.id === "buddy-list" && windowState.closed);
  const routeZ = routeWindowState.zIndex || 1;

  return (
    <>
      <Shell
        ref={surfaceRef}
        $hidden={routeMinimized}
        data-wim-desktop-surface="true"
        style={{ zIndex: routeZ }}
      >
        {conversationDragActive ? (
          <DesktopConversationDropLayer
            aria-hidden="true"
            data-wim-drop-layer="conversation"
            onDragOver={(event) => {
              if (!hasDraggedConversation(event)) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!hasDraggedConversation(event)) return;
              event.preventDefault();
              setConversationDragActive(false);
              const dropped = readDraggedConversation(event);
              if (!dropped.conversationId) return;
              const bounds = surfaceRef.current?.getBoundingClientRect();
              detachConversationToWindow(
                dropped.conversationId,
                dropped.sourceWindowId,
                bounds ? event.clientX - bounds.left : event.clientX,
                bounds ? event.clientY - bounds.top : event.clientY
              );
            }}
          />
        ) : null}
        {windows.map(renderWindow)}
        {dockWindows.length ? (
          <Dock aria-label="WIM minimized windows">
            {showBuddyLauncher ? (
              <DockButton type="button" onClick={() => restoreWindow("buddy-list")}>
                <Users size={14} aria-hidden />
                Buddy List
              </DockButton>
            ) : null}
            {dockWindows
              .filter((windowState) => windowState.minimized)
              .map((windowState) => (
                <DockButton
                  key={windowState.id}
                  type="button"
                  onClick={() => restoreWindow(windowState.id)}
                >
                  {windowState.kind === "buddy" ? (
                    <Users size={14} aria-hidden />
                  ) : (
                    <MessageCircle size={14} aria-hidden />
                  )}
                  {windowState.kind === "chat"
                    ? chatWindowTitle(windowState, labelForConversation)
                    : windowState.title}
                </DockButton>
              ))}
          </Dock>
        ) : null}
      </Shell>
      {typeof document !== "undefined" && unreadPopups.length
        ? createPortal(
            <PopupStack aria-live="polite">
              {unreadPopups.map((popup) => (
                <PopupCard key={popup.key} data-wim-offline-popup="true">
                  <PopupHeader>
                    <PopupTitle>Instant Message from {popup.title}</PopupTitle>
                    <PopupCloseButton
                      type="button"
                      aria-label={`Dismiss WIM message from ${popup.title}`}
                      title="Dismiss"
                      data-compact-control="true"
                      onClick={() => dismissPopup(popup)}
                    >
                      <X size={13} aria-hidden />
                    </PopupCloseButton>
                  </PopupHeader>
                  <PopupBody
                    type="button"
                    aria-label={`Open WIM message from ${popup.title}`}
                    data-compact-control="true"
                    onClick={() => openPopupConversation(popup)}
                  >
                    <Meta>
                      {popup.unreadCount} unread
                      {shortTime(popup.createdAt) ? ` at ${shortTime(popup.createdAt)}` : ""}
                    </Meta>
                    <PopupSnippet>{popup.snippet}</PopupSnippet>
                  </PopupBody>
                </PopupCard>
              ))}
            </PopupStack>,
            document.body
          )
        : null}
    </>
  );
}
