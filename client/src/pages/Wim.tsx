import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel, TextInput } from "react95";
import { ChevronDown, ChevronRight, MessageCircle, UserPlus, Users, X } from "lucide-react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiEmptyState, UiNotice } from "../components/wtfos-ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

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

const Shell = styled.div`
  --wim-navy: #07156f;
  --wim-blue: #1237a7;
  --wim-cyan: #84f0ff;
  --wim-yellow: #fff19a;
  --wim-ink: var(--wtf-app-text, #060b24);
  --wim-panel: var(--wtf-app-surface-raised, #fffdf2);
  --wim-row: var(--wtf-app-surface-raised, #ffffff);
  --wim-row-active: var(--wtf-app-info-bg, #dcecff);
  --wim-divider: var(--wtf-app-border, #050b24);
  --wim-soft-shadow: 2px 2px 0 rgba(6, 19, 95, 0.18);

  display: grid;
  grid-template-columns: minmax(230px, 310px) minmax(0, 1fr);
  gap: 10px;
  min-height: 520px;
  min-width: 0;
  color: var(--wim-ink);

  html[data-wtf-appearance-style="wtf-xp"] & {
    --wim-panel: #f5fbff;
    --wim-row: rgba(255, 255, 255, 0.82);
    --wim-row-active: #cfe5ff;
    --wim-soft-shadow: 0 3px 7px rgba(20, 52, 116, 0.18);
    gap: 12px;
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    --wim-panel: rgba(255, 255, 255, 0.9);
    --wim-row: rgba(255, 255, 255, 0.72);
    --wim-row-active: #e4f7ff;
    --wim-soft-shadow: 0 6px 14px rgba(23, 83, 112, 0.18);
    gap: 12px;
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    --wim-panel: #fff8a8;
    --wim-row: #ffffff;
    --wim-row-active: #ffef61;
    --wim-divider: #000000;
    --wim-soft-shadow: 4px 4px 0 #000000;
    text-transform: none;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    min-height: auto;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 8px;
  align-content: start;
  min-width: 0;
`;

const BrandPanel = styled(Panel).attrs({ variant: "well" })`
  padding: var(--wtf-space-3, 12px);
  color: var(--wim-ink);
  background: linear-gradient(180deg, var(--wtf-app-surface-raised, #ffffff), var(--wtf-app-info-bg, #d7edff));
  border-color: var(--wtf-app-border, #808080);

  html[data-wtf-appearance-style="wtf-xp"] &,
  html[data-wtf-appearance-style="wtf-aqua"] & {
    border-radius: var(--wtf-panel-radius, 8px);
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 3px solid #000000;
    background: linear-gradient(135deg, #fff36d 0 34%, #ffffff 34% 68%, #8ff5ff 68%);
    box-shadow: 4px 4px 0 #000000;
  }
`;

const BrandRow = styled.div`
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
`;

const WimMark = styled.div`
  width: 48px;
  height: 48px;
  position: relative;
  border: 2px solid #03091e;
  background: linear-gradient(180deg, #fff7b4 0%, #ffc03a 50%, #ff6a3d 100%);
  box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.72), 2px 2px 0 rgba(0, 0, 0, 0.2);
  overflow: hidden;

  &::before {
    content: "W";
    position: absolute;
    left: 15px;
    top: 6px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--wim-navy);
    color: #ffffff;
    font-size: var(--wtf-type-caption, 13px);
    line-height: 15px;
    text-align: center;
    font-weight: 900;
    box-shadow:
      -5px 17px 0 1px var(--wim-navy),
      10px 20px 0 -1px var(--wim-navy);
  }

  &::after {
    content: "";
    position: absolute;
    right: 5px;
    top: 8px;
    width: 17px;
    height: 12px;
    background: #ffffff;
    border: 2px solid #03091e;
    box-shadow: -20px 26px 0 -4px var(--wim-cyan);
  }
`;

const BrandTitle = styled.div`
  font-size: 20px;
  line-height: 1;
  font-weight: 900;
  color: var(--wim-navy);
  letter-spacing: 0;
`;

const BrandSub = styled.div`
  margin-top: 3px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #26315f);
`;

const ScreenNamePanel = styled(Panel).attrs({ variant: "well" })`
  padding: var(--wtf-space-3, 12px);
  background: var(--wim-panel);
  color: var(--wim-ink);
  border-color: var(--wtf-app-border, #808080);
  display: grid;
  gap: 3px;
`;

const ScreenName = styled.div`
  font-size: var(--wtf-type-body-strong, 16px);
  font-weight: 900;
  overflow-wrap: anywhere;
`;

const StatStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
`;

const Stat = styled(Panel).attrs({ variant: "well" })`
  padding: var(--wtf-space-2, 8px);
  min-height: 48px;
  background: var(--wim-panel);
  color: var(--wim-ink);
  border-color: var(--wtf-app-border, #808080);
`;

const StatLabel = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #4b557b);
  text-transform: none;
`;

const StatValue = styled.div`
  margin-top: 2px;
  font-size: 17px;
  font-weight: 900;
`;

const ChatLog = styled(Panel).attrs({ variant: "well" })`
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 364px;
  max-height: 52vh;
  padding: var(--wtf-space-3, 12px);
  overflow: auto;
  color: var(--wim-ink);
  background: var(--wtf-app-surface-raised, #ffffff);
  border-color: var(--wtf-app-border, #808080);

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 3px solid #000000;
    background: linear-gradient(180deg, #ffffff 0%, #fff8a8 100%);
  }
`;

const SectionToggle = styled(Button)`
  width: 100%;
  min-height: 34px;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 8px;
  font-weight: 900;
  color: #ffffff;
  background: linear-gradient(180deg, #264fc4 0%, #07156f 100%);

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
  padding: var(--wtf-space-2, 8px);
  max-height: 310px;
  overflow: auto;
  min-width: 0;
  color: var(--wim-ink);
  background: var(--wtf-app-surface-raised, #ffffff);
  border-color: var(--wtf-app-border, #808080);

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 2px solid #000000;
    background: #ffffff;
  }
`;

const UserRow = styled.div<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  padding: var(--wtf-space-2, 8px);
  margin-bottom: 4px;
  border: 1px solid ${(p) => (p.$active ? "var(--wim-navy)" : "transparent")};
  background: ${(p) => (p.$active ? "var(--wim-row-active)" : "var(--wim-row)")};
  box-shadow: ${(p) => (p.$active ? "var(--wim-soft-shadow)" : "none")};
  cursor: pointer;

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

const MiniInput = styled(TextInput)`
  width: 100%;
  margin-bottom: 6px;
`;

const RecentButton = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  text-align: left;
  min-height: 36px;
  height: auto;
  padding: 5px 7px;
  font-weight: ${(p) => (p.$active ? 900 : 700)};
  color: ${(p) => (p.$active ? "#ffffff" : "#050b24")};
  background: ${(p) =>
    p.$active
      ? "linear-gradient(180deg, #0b42c4 0%, #06135f 100%)"
      : undefined};
`;

const Message = styled.div<{ $mine?: boolean }>`
  display: grid;
  justify-items: ${(p) => (p.$mine ? "end" : "start")};
  margin: 0 0 10px;
  text-align: ${(p) => (p.$mine ? "right" : "left")};
`;

const Bubble = styled.div<{ $mine?: boolean }>`
  max-width: min(78%, 560px);
  padding: 7px 9px;
  border: 2px solid #0a0a0a;
  background: ${(p) => (p.$mine ? "#dff7ff" : "#fffdf2")};
  box-shadow: ${(p) =>
    p.$mine ? "-2px 2px 0 rgba(6, 19, 95, 0.18)" : "2px 2px 0 rgba(6, 19, 95, 0.18)"};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Meta = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #4b557b);
  line-height: 1.35;
  overflow-wrap: anywhere;
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
`;

const ChatHeader = styled(Panel).attrs({ variant: "well" })`
  padding: 8px 10px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  color: var(--wim-ink);
  background: var(--wtf-app-surface-raised, #ffffff);
  border-color: var(--wtf-app-border, #808080);
`;

const ChatTitle = styled.div`
  font-size: var(--wtf-type-title, 20px);
  font-weight: 900;
  overflow-wrap: anywhere;
`;

const Composer = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
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

export function Wim() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activePeerId, setActivePeerId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [friendIds, setFriendIds] = useState<number[]>([]);
  const [friendsReady, setFriendsReady] = useState(false);
  const [dismissedPopupKeys, setDismissedPopupKeys] = useState<string[]>([]);
  const [dismissedPopupsReady, setDismissedPopupsReady] = useState(false);
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
    queryFn: () =>
      api.get<MessageUser[]>("/api/messages/users?limit=100&excludeSelf=1"),
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
  const wtfUsers = Array.isArray(usersQuery.data) ? usersQuery.data : [];
  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);
  const dismissedPopupSet = useMemo(
    () => new Set(dismissedPopupKeys),
    [dismissedPopupKeys]
  );
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
  const selected =
    conversations.find((conversation) => conversation.id === activeId) ??
    null;
  const activeConversationId = selected?.id ?? activeId;
  const activeUser = wtfUsers.find((item) => item.id === activePeerId) ?? null;
  const selectedPeer =
    (selected?.peers ?? []).find((peer) => peerId(peer) === activePeerId) ??
    selected?.peers[0] ??
    null;
  const selectedLabel = selectedPeer
    ? selectedPeer.displayName || selectedPeer.username
    : activeUser
      ? userLabel(activeUser)
    : selected
      ? conversationLabel(selected)
      : "No chat selected";
  const selectedPresence = activeUser ? presenceLabel(presenceStatusFor(activeUser)) : null;
  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations]
  );
  const unreadPopups = useMemo(
    () =>
      conversations
        .filter((conversation) => {
          if (!conversation.unreadCount || !conversation.latestMessage) return false;
          if (conversation.id === activeConversationId) return false;
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
    [activeConversationId, conversations, dismissedPopupSet, user?.id]
  );

  const messagesQuery = useQuery({
    queryKey: ["wim", "messages", activeConversationId],
    enabled: !!activeConversationId,
    queryFn: () =>
      api.get<DmMessage[]>(`/api/messages/dms/${activeConversationId}/messages?limit=100`),
  });
  const sendMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/messages/dms/${activeConversationId}/messages`, { content: content.trim() }),
    onSuccess: () => {
      if (activeConversationId) {
        reportWimEvent("wim.message.sent", activeConversationId, { messageLength: content.trim().length });
      }
      setContent("");
      qc.invalidateQueries({ queryKey: ["wim", "messages", activeConversationId] });
      qc.invalidateQueries({ queryKey: ["wim", "conversations", "direct"] });
    },
  });

  const openChatMutation = useMutation({
    mutationFn: (targetUserId: number) =>
      api.post<{ id: number }>("/api/messages/dms", { targetUserId }),
    onSuccess: (conversation, targetUserId) => {
      setActivePeerId(targetUserId);
      setActiveId(conversation.id);
      qc.invalidateQueries({ queryKey: ["wim", "conversations", "direct"] });
    },
  });

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
    if (!activeConversationId) return;
    reportWimEvent("wim.chat.opened", activeConversationId, {
      peerCount: selected?.peers.length ?? (activePeerId ? 1 : 0),
      unreadCount: selected?.unreadCount ?? 0,
    });
  }, [activeConversationId, activePeerId, selected?.peers.length, selected?.unreadCount]);

  useEffect(() => {
    if (!chatLogRef.current) return;
    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [activeConversationId, messagesQuery.data?.length]);

  useEffect(() => {
    if (!activeConversationId || !messagesQuery.data) return;
    qc.invalidateQueries({ queryKey: ["wim", "conversations", "direct"] });
  }, [activeConversationId, messagesQuery.dataUpdatedAt, qc]);

  const submitMessage = () => {
    if (!activeConversationId || !content.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
  };

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

  const rememberPopupDismissal = (key: string) => {
    setDismissedPopupKeys((current) =>
      current.includes(key) ? current : [...current, key].slice(-80)
    );
  };

  const openConversation = (conversation: DmConversation) => {
    const peer = conversation.peers[0] ?? null;
    setActiveId(conversation.id);
    setActivePeerId(peer ? peerId(peer) : null);
  };

  const openPopupConversation = (popup: (typeof unreadPopups)[number]) => {
    rememberPopupDismissal(popup.key);
    setActiveId(popup.conversationId);
    setActivePeerId(popup.peerId);
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
    setActivePeerId(target.id);
    const existing = conversations.find((conversation) =>
      conversation.peers.some((peer) => peerId(peer) === target.id)
    );
    if (existing) {
      openConversation(existing);
      return;
    }
    openChatMutation.mutate(target.id);
  };

  const renderSectionToggle = (
    key: keyof typeof sections,
    label: string,
    count: number
  ) => (
    <SectionToggle type="button" onClick={() => toggleSection(key)}>
      <SectionTitle>
        {sections[key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {label}
      </SectionTitle>
      <CountBadge>{count}</CountBadge>
    </SectionToggle>
  );

  const renderUserRow = (item: MessageUser) => {
    const active = activePeerId === item.id;
    const isFriend = friendIdSet.has(item.id);
    const status = presenceStatusFor(item);
    return (
      <UserRow
        key={item.id}
        $active={active}
        role="button"
        aria-label={`Open WIM chat with ${userLabel(item)}`}
        tabIndex={0}
        onClick={() => openDirectChat(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
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
              <UserPlus size={14} />
            </IconButton>
          ) : null}
          <IconButton
            type="button"
            aria-label={`Open WIM chat with ${userLabel(item)}`}
            title="Open chat"
            data-compact-control="true"
            disabled={openChatMutation.isPending && active}
            onClickCapture={(event) => {
              event.stopPropagation();
              openDirectChat(item);
            }}
          >
            <MessageCircle size={14} />
          </IconButton>
        </UserActions>
      </UserRow>
    );
  };

  return (
    <>
      <AppWindow title="WIM">
        <Shell>
          <Stack>
            <BrandPanel>
              <BrandRow>
                <WimMark aria-hidden />
                <div>
                  <BrandTitle>WIM</BrandTitle>
                  <BrandSub>WTF Instant Messenger</BrandSub>
                </div>
              </BrandRow>
            </BrandPanel>
            <StatStrip>
              <Stat>
                <StatLabel>Friends</StatLabel>
                <StatValue>{friends.length}</StatValue>
              </Stat>
              <Stat>
                <StatLabel>Active</StatLabel>
                <StatValue>
                  {wtfUsers.filter((item) => presenceStatusFor(item) === "active").length}
                </StatValue>
              </Stat>
              <Stat>
                <StatLabel>Unread</StatLabel>
                <StatValue>{unreadTotal}</StatValue>
              </Stat>
            </StatStrip>
            <ScreenNamePanel>
              <StatLabel>Screen name</StatLabel>
              <ScreenName>{user?.displayName || user?.username || "WTF User"}</ScreenName>
            </ScreenNamePanel>
            <GroupBox label="Buddy List">
              {!usersQuery.data ? (
                <Hourglass size={24} />
              ) : usersQuery.isError ? (
                <UiNotice tone="danger">Buddy list failed to load. Try refreshing WIM.</UiNotice>
              ) : (
                <Stack>
                  {renderSectionToggle("friends", "My Friends", friends.length)}
                  {sections.friends ? (
                    <DirectoryPanel>
                      {friends.length ? (
                        friends.map(renderUserRow)
                      ) : (
                        <UiEmptyState title="No friends saved">
                          Add people from Active Now or All WTF Users to keep them pinned here.
                        </UiEmptyState>
                      )}
                    </DirectoryPanel>
                  ) : null}

                  {renderSectionToggle("active", "Active Now", activeUsers.length)}
                  {sections.active ? (
                    <DirectoryPanel>
                      {activeUsers.length ? (
                        activeUsers.map(renderUserRow)
                      ) : (
                        <UiEmptyState title="No one else is active">
                          Online WTF users will appear here when their sessions are active.
                        </UiEmptyState>
                      )}
                    </DirectoryPanel>
                  ) : null}

                  {renderSectionToggle("inactive", "Inactive / Away", inactiveUsers.length)}
                  {sections.inactive ? (
                    <DirectoryPanel>
                      {inactiveUsers.length ? (
                        inactiveUsers.map(renderUserRow)
                      ) : (
                        <UiEmptyState title="No idle sessions">
                          Away WTF users will appear here after WIM sees recent inactive presence.
                        </UiEmptyState>
                      )}
                    </DirectoryPanel>
                  ) : null}

                  {renderSectionToggle("offline", "Offline", offlineUsers.length)}
                  {sections.offline ? (
                    <DirectoryPanel>
                      {offlineUsers.length ? (
                        offlineUsers.map(renderUserRow)
                      ) : (
                        <UiEmptyState title="No offline users in this slice">
                          Offline WTF users will appear here when WIM has recent presence data.
                        </UiEmptyState>
                      )}
                    </DirectoryPanel>
                  ) : null}

                  {renderSectionToggle("all", "All WTF Users", filteredUsers.length)}
                  {sections.all ? (
                    <DirectoryPanel>
                      <MiniInput
                        aria-label="Find WIM user"
                        value={search}
                        placeholder="Find user"
                        onChange={(event: any) => setSearch(event.target.value)}
                      />
                      {filteredUsers.length ? (
                        filteredUsers.map(renderUserRow)
                      ) : (
                        <UiEmptyState title="No matching users">
                          Try a different username or display name.
                        </UiEmptyState>
                      )}
                    </DirectoryPanel>
                  ) : null}

                  {renderSectionToggle("recent", "Recent Direct Chats", conversations.length)}
                  {sections.recent ? (
                    <DirectoryPanel>
                      {conversations.map((conversation) => {
                        const label = conversationLabel(conversation);
                        return (
                          <RecentButton
                            key={conversation.id}
                            $active={selected?.id === conversation.id}
                            onClick={() => openConversation(conversation)}
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
                        <UiEmptyState title="No direct chats yet">
                          Open a buddy from the list to start a WIM conversation.
                        </UiEmptyState>
                      ) : null}
                    </DirectoryPanel>
                  ) : null}
                </Stack>
              )}
            </GroupBox>
          </Stack>

          <Stack>
            <ChatHeader>
              <div>
                <ChatTitle>{selectedLabel}</ChatTitle>
                <Meta>
                  {selected
                    ? `Direct message${selectedPresence ? ` · ${selectedPresence}` : ""}`
                    : activeConversationId
                      ? `Direct message${selectedPresence ? ` · ${selectedPresence}` : ""}`
                      : "Pick a WTF user"}
                </Meta>
              </div>
              <Users size={26} aria-hidden />
            </ChatHeader>
            <GroupBox label="Messages">
              <ChatLog ref={chatLogRef}>
                {(messagesQuery.data ?? []).map((message) => {
                  const mine = message.senderId === user?.id;
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
                {activeConversationId && messagesQuery.isLoading ? <Hourglass size={20} /> : null}
                {activeConversationId && messagesQuery.isError ? (
                  <UiNotice tone="danger">Messages failed to load. Try this chat again.</UiNotice>
                ) : null}
                {activeConversationId && messagesQuery.data?.length === 0 ? (
                  <UiEmptyState title="No messages in this chat yet">
                    Send the first WIM message when you are ready.
                  </UiEmptyState>
                ) : null}
                {!activeConversationId ? (
                  <UiEmptyState title="Select a buddy">
                    Pick a WTF user or recent chat to open the conversation.
                  </UiEmptyState>
                ) : null}
              </ChatLog>
            </GroupBox>
            <Composer
              onSubmit={(event) => {
                event.preventDefault();
                submitMessage();
              }}
            >
              <TextInput
                aria-label={
                  activeConversationId
                    ? "WIM message text"
                    : "WIM message text disabled until a chat is selected"
                }
                value={content}
                placeholder="Message"
                onChange={(event: any) => setContent(event.target.value)}
                disabled={!activeConversationId || sendMutation.isPending}
                style={{ width: "100%" }}
              />
              <Button
                disabled={!activeConversationId || !content.trim() || sendMutation.isPending}
                type="submit"
              >
                {sendMutation.isPending ? "Sending..." : "Send WIM"}
              </Button>
            </Composer>
            {sendMutation.isError ? (
              <UiNotice tone="danger">Message failed to send. Check the chat and try again.</UiNotice>
            ) : null}
          </Stack>
        </Shell>
      </AppWindow>
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
                      <X size={13} />
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
