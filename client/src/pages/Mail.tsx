import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Hourglass, TextInput } from "react95";
import {
  Bookmark,
  Flag,
  Forward,
  Reply,
  Search,
  Send,
  Star,
} from "lucide-react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import {
  UiButton,
  UiEmptyState,
  UiNotice,
  UiPanel,
  UiStatusPill,
  UiToolbar,
} from "../components/wtfos-ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  presentationRouteHref,
  usePresentationShell,
} from "../lib/presentation-shell";
import { logClientSystemEvent } from "../lib/system-log";
import { useWindowManager } from "../lib/window-context";
import type { CommunicationCard } from "@shared/comms";

type Mailbox = {
  id: number;
  address: string;
  status: string;
};

type MailStatus = {
  mailbox?: Partial<Mailbox> | null;
  eligible: boolean;
  gate?: {
    ok: boolean;
    code?: string;
    message?: string;
    requiredSteps?: string[];
  };
  config?: {
    provider: string;
    domain: string;
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    rolloutMode: string;
    resendConfigured: boolean;
    webhookSecretConfigured: boolean;
  };
};

type MailMessage = {
  id: number;
  direction: "inbound" | "outbound";
  status: string;
  fromAddress: string;
  fromName?: string | null;
  toAddresses?: string[];
  subject: string;
  textBody: string | null;
  commsItemId?: number | null;
  createdAt: string;
  receivedAt: string | null;
  sentAt: string | null;
};

type MessageUser = {
  id: number;
  username: string;
  displayName?: string | null;
  role: string;
};

type DmConversation = {
  id: number;
  lastMessageAt: string;
  unreadCount: number;
  peers: Array<{
    id?: number | null;
    userId?: number | null;
    username: string;
    displayName?: string | null;
  }>;
  latestMessage?: {
    id?: number;
    senderId?: number;
    content: string;
    createdAt?: string;
  } | null;
  conversationType?: "direct" | "studio";
  studioProjectId?: number | null;
  title?: string | null;
};

type DmMessage = {
  id: number;
  senderId: number;
  username?: string;
  displayName?: string;
  content: string;
  createdAt: string;
  messageType?: string | null;
  metadata?: Record<string, unknown> | null;
  pinned?: boolean;
};

type NotificationItem = {
  id: number;
  sourceUserId: number | null;
  sourceUsername: string | null;
  sourceDisplayName: string | null;
  eventKey: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  read: boolean;
  urgencyTier?: UrgencyTier;
  createdAt: string;
};

type NotificationListResponse = {
  items: NotificationItem[];
  unreadCount: number;
};

type InboxView = "inbox" | "sorted" | "conversations" | "drafts";
type SortMode = "newest" | "oldest" | "unread" | "urgency";
type UrgencyTier = "routine" | "attention" | "urgent" | "critical";
type InboxCategory =
  | "system"
  | "admin"
  | "user_mail"
  | "wim"
  | "invite"
  | "notification_subscription"
  | "studio"
  | "other";

type InboxCard = {
  id: string;
  source: "mail" | "dm" | "notification" | "comms";
  category: InboxCategory;
  title: string;
  preview: string;
  meta: string;
  authorLabel: string | null;
  occurredAt: string;
  sortTime: number;
  read: boolean;
  urgency: UrgencyTier;
  routePath: string | null;
  commsItemId?: number | null;
  mailMessageId?: number;
  notificationId?: number;
  conversationId?: number;
  raw?: MailMessage | DmConversation | NotificationItem | CommunicationCard;
};

type InboxMarks = {
  readFallbackIds: string[];
  flaggedIds: string[];
  starredIds: string[];
  bookmarkedIds: string[];
  emojiById: Record<string, string>;
};
type InboxArrayMarkKey = "flaggedIds" | "starredIds" | "bookmarkedIds";

type SavedDraft = {
  id: string;
  savedAs: "wip" | "template";
  mode: DraftMode;
  targetUserId: number | null;
  toEmail: string;
  subject: string;
  body: string;
  updatedAt: string;
};

type DraftMode = "dm" | "mail" | "admin";

const CATEGORY_ORDER: InboxCategory[] = [
  "system",
  "admin",
  "user_mail",
  "wim",
  "invite",
  "notification_subscription",
  "studio",
];

const CATEGORY_META: Record<InboxCategory, { label: string; color: string }> = {
  system: { label: "System", color: "#2563eb" },
  admin: { label: "Admin", color: "#be123c" },
  user_mail: { label: "User mail", color: "#0f766e" },
  wim: { label: "WIM", color: "#b45309" },
  invite: { label: "Invite", color: "#7c3aed" },
  notification_subscription: { label: "Notification subscriptions", color: "#0284c7" },
  studio: { label: "Studio", color: "#15803d" },
  other: { label: "Other", color: "#64748b" },
};

const URGENCY_META: Record<UrgencyTier, { label: string; rank: number; tone: "neutral" | "info" | "warning" | "danger" }> = {
  routine: { label: "Routine", rank: 0, tone: "neutral" },
  attention: { label: "Attention", rank: 1, tone: "info" },
  urgent: { label: "Urgent", rank: 2, tone: "warning" },
  critical: { label: "Critical", rank: 3, tone: "danger" },
};

const EMPTY_MARKS: InboxMarks = {
  readFallbackIds: [],
  flaggedIds: [],
  starredIds: [],
  bookmarkedIds: [],
  emojiById: {},
};

const MARKS_STORAGE_PREFIX = "wtf:inbox:marks:v1";
const DRAFTS_STORAGE_PREFIX = "wtf:inbox:drafts:v1";

function mailRegionAttrs(region: string): any {
  return { "data-mail-region": region };
}

function storageKey(prefix: string, userId: number | null | undefined): string {
  return `${prefix}:${userId ?? "guest"}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local interaction state should not block the app shell.
  }
}

function timestampOf(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return new Date(0).toISOString();
}

function timeValue(value: string | Date | null | undefined): number {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function peerId(peer: DmConversation["peers"][number]): number | null {
  const id = peer.userId ?? peer.id ?? null;
  return Number.isInteger(id) ? Number(id) : null;
}

function conversationLabel(conversation: DmConversation): string {
  if (conversation.conversationType === "studio") {
    return conversation.title || "Studio project";
  }
  const label = conversation.peers
    .map((peer) => peer.displayName || peer.username)
    .filter(Boolean)
    .join(", ");
  return label || conversation.title || `Conversation ${conversation.id}`;
}

function classifyNotification(item: NotificationItem): InboxCategory {
  const key = item.eventKey.toLowerCase();
  const text = `${item.title} ${item.body ?? ""}`.toLowerCase();
  if (key.startsWith("studio.")) return "studio";
  if (/\b(invite|invited|member_joined|join|added)\b/.test(`${key} ${text}`)) return "invite";
  if (/\b(preference|subscription|subscribed|mute|digest)\b/.test(`${key} ${text}`)) {
    return "notification_subscription";
  }
  if (/\b(admin|moderation|count|role|permission)\b/.test(`${key} ${text}`)) return "admin";
  if (item.sourceUserId == null) return "system";
  return "system";
}

function classifyCommsItem(item: CommunicationCard): InboxCategory {
  if (item.sourceKey === "dm") {
    return item.metadata?.conversationType === "studio" ? "studio" : "wim";
  }
  if (item.itemKind === "system" || item.sourceKind === "system") return "system";
  if (item.sourceKey === "mail") return "user_mail";
  return "other";
}

function deriveCommsUrgency(item: CommunicationCard): UrgencyTier {
  const haystack = `${item.title} ${item.summary ?? ""} ${item.body ?? ""} ${String(item.metadata?.urgency ?? "")}`.toLowerCase();
  if (/\b(critical|safety|security|locked|revoked|suspended)\b/.test(haystack)) return "critical";
  if (/\b(urgent|wallet|identity|verify|account|failed|required|problem)\b/.test(haystack)) return "urgent";
  if (/\b(invite|studio|reward|challenge|quest|deadline)\b/.test(haystack)) return "attention";
  return "routine";
}

function cardMatchesSearch(card: InboxCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${card.title} ${card.preview} ${card.meta} ${card.authorLabel ?? ""}`
    .toLowerCase()
    .includes(q);
}

function normalizeMarks(value: unknown): InboxMarks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_MARKS;
  const input = value as Partial<InboxMarks>;
  return {
    readFallbackIds: Array.isArray(input.readFallbackIds) ? input.readFallbackIds.map(String) : [],
    flaggedIds: Array.isArray(input.flaggedIds) ? input.flaggedIds.map(String) : [],
    starredIds: Array.isArray(input.starredIds) ? input.starredIds.map(String) : [],
    bookmarkedIds: Array.isArray(input.bookmarkedIds) ? input.bookmarkedIds.map(String) : [],
    emojiById:
      input.emojiById && typeof input.emojiById === "object" && !Array.isArray(input.emojiById)
        ? Object.fromEntries(
            Object.entries(input.emojiById).map(([key, value]) => [key, String(value).slice(0, 12)])
          )
        : {},
  };
}

const Shell = styled.div`
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--wtf-space-3, 12px);
  min-height: 560px;
  min-width: 0;

  &[data-mail-presentation-host="gamma"] {
    background: #070706;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-mail-presentation-host="gamma"],
  &[data-mail-presentation-host="gamma"] * {
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  &[data-mail-presentation-host="gamma"] [data-mail-region] {
    background-image: none !important;
    box-shadow: none !important;
    border-color: rgba(242, 234, 217, 0.16) !important;
    border-width: 1px !important;
    border-radius: 6px !important;
  }

  &[data-mail-presentation-host="gamma"] :where(section[data-mail-region], [data-mail-region="message-row"], [data-mail-region="reader"], [data-mail-region="compose-body"], [data-mail-region="nav-panel"]) {
    background: #11110f !important;
    color: #f2ead9 !important;
  }

  &[data-mail-presentation-host="gamma"] :where(h2, h3, strong) {
    color: #f2ead9 !important;
  }

  &[data-mail-presentation-host="gamma"] [data-mail-region="message-title"],
  &[data-mail-presentation-host="gamma"] [data-mail-region="mailbox-address"],
  &[data-mail-presentation-host="gamma"] [data-mail-region="status-pill"] {
    color: #00d2ff !important;
  }

  &[data-mail-presentation-host="gamma"] [data-mail-region="message-row"][data-mail-active="true"] {
    border-color: #00d2ff !important;
  }

  &[data-mail-presentation-host="gamma"] [data-mail-region="meta"],
  &[data-mail-presentation-host="gamma"] [data-mail-region="message-body"] {
    color: rgba(242, 234, 217, 0.68) !important;
  }

  &[data-mail-presentation-host="gamma"] :where(input, textarea, select) {
    background: #070706 !important;
    color: #f2ead9 !important;
    border: 1px solid rgba(242, 234, 217, 0.2) !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-mail-presentation-host="gamma"] :where(button) {
    background: transparent !important;
    color: #f2ead9 !important;
    border-color: rgba(0, 210, 255, 0.42) !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-mail-presentation-host="gamma"] :where(button:hover, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible) {
    border-color: #00d2ff !important;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    min-height: 0;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
  align-content: start;
  min-width: 0;
`;

const NavPanel = styled.aside.attrs(mailRegionAttrs("nav-panel"))`
  display: grid;
  gap: var(--wtf-space-2, 8px);
  align-content: start;
  min-width: 0;
`;

const NavButton = styled.button<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 40px;
  padding: 7px 9px;
  border: 1px solid ${(p) => (p.$active ? "var(--wtf-highlight-color, #000080)" : "var(--wtf-app-border, #808080)")};
  background: ${(p) => (p.$active ? "var(--wtf-app-info-bg, #dcecff)" : "var(--wtf-app-surface-raised, #ffffff)")};
  color: var(--wtf-app-text, #111);
  text-align: left;
  font: inherit;
  font-weight: ${(p) => (p.$active ? 800 : 600)};
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--wtf-highlight-color, #000080);
    outline-offset: 2px;
  }
`;

const CountBadge = styled.span`
  min-width: 24px;
  min-height: 22px;
  display: inline-grid;
  place-items: center;
  padding: 0 6px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  font-size: var(--wtf-type-caption, 12px);
  font-weight: 800;
`;

const Workspace = styled.main`
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--wtf-space-3, 12px);
`;

const SearchGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(150px, 0.35fr) minmax(150px, 0.35fr);
  gap: 8px;
  align-items: center;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const SelectInput = styled.select`
  width: 100%;
  min-height: 34px;
  padding: 5px 7px;
  font: inherit;
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-control-bg, #ffffff);
  border: 2px inset var(--wtf-app-control-border, #808080);
`;

const Feed = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
  min-width: 0;
`;

const InboxCardButton = styled.button<{ $trim: string; $unread?: boolean }>`
  width: 100%;
  min-width: 0;
  min-height: 86px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 4px;
  padding: 9px 10px 9px 14px;
  border: 1px solid var(--wtf-app-border, #808080);
  border-left: 6px solid ${(p) => p.$trim};
  background: ${(p) =>
    p.$unread
      ? "color-mix(in srgb, var(--wtf-app-warning, #fff19a) 13%, var(--wtf-app-surface-raised, #ffffff))"
      : "var(--wtf-app-surface-raised, #ffffff)"};
  color: var(--wtf-app-text, #111);
  text-align: left;
  font: inherit;
  cursor: pointer;
  overflow: hidden;

  &:focus-visible {
    outline: 2px solid var(--wtf-highlight-color, #000080);
    outline-offset: 2px;
  }
`;

const CardTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  font-size: var(--wtf-type-caption, 12px);
`;

const CardTitle = styled.h3.attrs(mailRegionAttrs("message-title"))`
  margin: 0;
  font-size: var(--wtf-type-title, 16px);
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardPreview = styled.div.attrs(mailRegionAttrs("message-body"))`
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  line-height: 1.35;
`;

const Meta = styled.div.attrs(mailRegionAttrs("meta"))`
  font-size: var(--wtf-type-caption, 12px);
  color: var(--wtf-app-muted-text, #384352);
  overflow-wrap: anywhere;
  line-height: 1.35;
`;

const CardActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 6px;
`;

const IconAction = styled(UiButton)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const Split = styled.div`
  display: grid;
  grid-template-columns: minmax(240px, 0.45fr) minmax(0, 1fr);
  gap: var(--wtf-space-3, 12px);
  min-width: 0;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const MessagePanel = styled.div.attrs(mailRegionAttrs("reader"))`
  min-height: 260px;
  max-height: min(480px, 62vh);
  overflow: auto;
  min-width: 0;
  padding: var(--wtf-space-3, 12px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
`;

const MessageTitle = styled.h3.attrs(mailRegionAttrs("message-title"))`
  margin: 0 0 var(--wtf-space-2, 8px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-title, 20px);
  line-height: 1.25;
  overflow-wrap: anywhere;
`;

const Body = styled.div.attrs(mailRegionAttrs("message-body"))`
  margin-top: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.45;
`;

const ComposeBody = styled.textarea.attrs(mailRegionAttrs("compose-body"))`
  width: 100%;
  min-height: 128px;
  resize: vertical;
  padding: 8px;
  font: inherit;
  background: var(--wtf-app-control-bg, #ffffff);
  color: var(--wtf-app-text, #111);
  border: 2px inset var(--wtf-app-control-border, #808080);
  box-sizing: border-box;
`;

const ConversationRow = styled.button<{ $active?: boolean; $trim: string }>`
  width: 100%;
  min-height: 48px;
  padding: 7px 9px;
  border: 1px solid var(--wtf-app-border, #808080);
  border-left: 5px solid ${(p) => p.$trim};
  background: ${(p) => (p.$active ? "var(--wtf-app-info-bg, #dcecff)" : "var(--wtf-app-surface-raised, #ffffff)")};
  color: var(--wtf-app-text, #111);
  text-align: left;
  font: inherit;
  cursor: pointer;
`;

const ConversationBubble = styled.div<{ $mine?: boolean; $trim: string }>`
  display: grid;
  justify-items: ${(p) => (p.$mine ? "end" : "start")};
  gap: 4px;
  margin-bottom: 10px;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  border-left: 5px solid ${(p) => p.$trim};
  background: ${(p) => (p.$mine ? "var(--wtf-app-info-bg, #dcecff)" : "var(--wtf-app-surface-raised, #ffffff)")};
`;

function usePersistentInboxState(userId: number | null | undefined) {
  const [marks, setMarks] = useState<InboxMarks>(EMPTY_MARKS);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);

  useEffect(() => {
    setMarks(normalizeMarks(readJson(storageKey(MARKS_STORAGE_PREFIX, userId), EMPTY_MARKS)));
    setSavedDrafts(
      readJson<SavedDraft[]>(storageKey(DRAFTS_STORAGE_PREFIX, userId), []).filter(
        (entry) => entry && typeof entry.id === "string"
      )
    );
  }, [userId]);

  useEffect(() => {
    writeJson(storageKey(MARKS_STORAGE_PREFIX, userId), marks);
  }, [marks, userId]);

  useEffect(() => {
    writeJson(storageKey(DRAFTS_STORAGE_PREFIX, userId), savedDrafts);
  }, [savedDrafts, userId]);

  return { marks, setMarks, savedDrafts, setSavedDrafts };
}

export function Mail() {
  const presentation = usePresentationShell();
  const { user } = useAuth();
  const wm = useWindowManager();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { marks, setMarks, savedDrafts, setSavedDrafts } = usePersistentInboxState(user?.id);

  const [view, setView] = useState<InboxView>("inbox");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<InboxCategory | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [sortedCategory, setSortedCategory] = useState<InboxCategory>("system");
  const [selectedMailId, setSelectedMailId] = useState<number | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [draftMode, setDraftMode] = useState<DraftMode>("dm");
  const [draftTargetUserId, setDraftTargetUserId] = useState<number | null>(null);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    logClientSystemEvent({
      eventType: "inbox.viewed",
      metadata: { view },
    });
  }, [view]);

  const statusQuery = useQuery({
    queryKey: ["mail", "status"],
    queryFn: () => api.get<MailStatus>("/api/mail/status"),
  });
  const messagesQuery = useQuery({
    queryKey: ["mail", "messages"],
    queryFn: () => api.get<{ messages: MailMessage[] }>("/api/mail/messages"),
  });
  const commsQuery = useQuery({
    queryKey: ["comms", "items", "inbox"],
    queryFn: () => api.get<{ items: CommunicationCard[] }>("/api/comms/items?limit=120"),
  });
  const conversationsQuery = useQuery({
    queryKey: ["messages", "dms"],
    queryFn: () => api.get<DmConversation[]>("/api/messages/dms"),
    refetchInterval: 15_000,
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications", "inbox"],
    queryFn: () => api.get<NotificationListResponse>("/api/notifications?limit=200"),
    refetchInterval: 20_000,
  });
  const usersQuery = useQuery({
    queryKey: ["messages", "users", "inbox"],
    queryFn: () => api.get<MessageUser[]>("/api/messages/users?limit=200"),
  });
  const conversationMessagesQuery = useQuery({
    queryKey: ["messages", "dms", activeConversationId],
    enabled: Boolean(activeConversationId),
    queryFn: () =>
      api.get<DmMessage[]>(`/api/messages/dms/${activeConversationId}/messages?limit=160`),
  });

  const commsReadMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/comms/items/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comms"] });
      qc.invalidateQueries({ queryKey: ["inbox", "unread-count"] });
    },
  });
  const markNotificationReadMutation = useMutation({
    mutationFn: (id: number) => api.put(`/api/notifications/${id}/read`, { read: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["inbox", "unread-count"] });
    },
  });
  const markConversationReadMutation = useMutation({
    mutationFn: (id: number) => api.put(`/api/messages/dms/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", "dms"] });
      qc.invalidateQueries({ queryKey: ["inbox", "unread-count"] });
    },
  });
  const createDmMutation = useMutation({
    mutationFn: (targetUserId: number) =>
      api.post<{ id: number }>("/api/messages/dms", { targetUserId }),
  });
  const sendDmMutation = useMutation({
    mutationFn: (input: { conversationId: number; body: string }) =>
      api.post(`/api/messages/dms/${input.conversationId}/messages`, { content: input.body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", "dms"] });
      qc.invalidateQueries({ queryKey: ["comms"] });
      qc.invalidateQueries({ queryKey: ["inbox", "unread-count"] });
    },
  });
  const pinDmMutation = useMutation({
    mutationFn: (input: { conversationId: number; messageId: number; pinned: boolean }) =>
      api.put(`/api/messages/dms/${input.conversationId}/messages/${input.messageId}/pin`, {
        pinned: input.pinned,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", "dms", activeConversationId] });
    },
  });
  const sendMailMutation = useMutation({
    mutationFn: () =>
      api.post("/api/mail/send", {
        to: draftEmail
          .split(/[,\s]+/)
          .map((entry) => entry.trim())
          .filter(Boolean),
        subject: draftSubject,
        textBody: draftBody,
      }),
    onSuccess: () => {
      setDraftEmail("");
      setDraftSubject("");
      setDraftBody("");
      qc.invalidateQueries({ queryKey: ["mail", "messages"] });
      qc.invalidateQueries({ queryKey: ["comms"] });
      qc.invalidateQueries({ queryKey: ["inbox", "unread-count"] });
      setNotice("Mail sent.");
    },
  });

  const status = statusQuery.data;
  const messages = messagesQuery.data?.messages ?? [];
  const commsItems = commsQuery.data?.items ?? [];
  const conversations = conversationsQuery.data ?? [];
  const notifications = notificationsQuery.data?.items ?? [];
  const users = Array.isArray(usersQuery.data) ? usersQuery.data : [];
  const userOptions = users.filter((candidate) => candidate.id !== user?.id);
  const adminOptions = userOptions.filter((candidate) =>
    ["admin", "host", "cohost"].includes(candidate.role)
  );
  const selectedMail =
    messages.find((message) => message.id === selectedMailId) ?? null;
  const selectedConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    conversations[0] ??
    null;

  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [activeConversationId, conversations]);

  const mailCommsByMessageId = useMemo(() => {
    const map = new Map<number, CommunicationCard>();
    for (const item of commsItems) {
      const raw = item.metadata?.mailMessageId;
      const id = typeof raw === "number" ? raw : Number(raw);
      if (Number.isInteger(id)) map.set(id, item);
    }
    return map;
  }, [commsItems]);

  const cards = useMemo<InboxCard[]>(() => {
    const readFallback = new Set(marks.readFallbackIds);
    const mailCards: InboxCard[] = messages.map((message) => {
      const comms = message.commsItemId
        ? commsItems.find((item) => item.id === message.commsItemId)
        : mailCommsByMessageId.get(message.id);
      const id = `mail:${message.id}`;
      const occurredAt = timestampOf(message.receivedAt || message.sentAt || message.createdAt);
      return {
        id,
        source: "mail",
        category: "user_mail",
        title: message.subject || "(no subject)",
        preview: message.textBody || "(empty message)",
        meta:
          message.direction === "inbound"
            ? `From ${message.fromName || message.fromAddress}`
            : `To ${(message.toAddresses ?? []).join(", ") || "none"}`,
        authorLabel: message.direction === "inbound" ? message.fromAddress : status?.mailbox?.address ?? null,
        occurredAt,
        sortTime: timeValue(occurredAt),
        read: (comms?.read ?? false) || readFallback.has(id),
        urgency: message.status === "failed" || message.status === "bounced" ? "urgent" : "routine",
        routePath: `/mail?message=${message.id}`,
        commsItemId: message.commsItemId ?? comms?.id ?? null,
        mailMessageId: message.id,
        raw: message,
      };
    });

    const dmCards: InboxCard[] = conversations.map((conversation) => {
      const isStudio = conversation.conversationType === "studio";
      const id = `dm:${conversation.id}`;
      const occurredAt = timestampOf(
        conversation.latestMessage?.createdAt || conversation.lastMessageAt
      );
      return {
        id,
        source: "dm",
        category: isStudio ? "studio" : "wim",
        title: conversationLabel(conversation),
        preview: conversation.latestMessage?.content || "No messages yet.",
        meta: isStudio ? "Studio conversation" : "WIM conversation",
        authorLabel: conversation.peers.map((peer) => peer.displayName || peer.username).join(", ") || null,
        occurredAt,
        sortTime: timeValue(occurredAt),
        read: conversation.unreadCount <= 0 || readFallback.has(id),
        urgency: conversation.unreadCount > 0 ? "attention" : "routine",
        routePath: `/messages/dms/${conversation.id}`,
        conversationId: conversation.id,
        raw: conversation,
      };
    });

    const notificationCards: InboxCard[] = notifications.map((item) => {
      const category = classifyNotification(item);
      const id = `notification:${item.id}`;
      return {
        id,
        source: "notification",
        category,
        title: item.title,
        preview: item.body || item.eventKey,
        meta: item.eventKey,
        authorLabel: item.sourceUsername ?? "System",
        occurredAt: timestampOf(item.createdAt),
        sortTime: timeValue(item.createdAt),
        read: item.read || readFallback.has(id),
        urgency: item.urgencyTier ?? (category === "system" ? "attention" : "routine"),
        routePath: null,
        notificationId: item.id,
        raw: item,
      };
    });

    const commCards: InboxCard[] = commsItems
      .filter((item) => !["mail", "dm", "board"].includes(item.sourceKey))
      .map((item) => {
        const category = classifyCommsItem(item);
        return {
          id: `comms:${item.id}`,
          source: "comms",
          category,
          title: item.title,
          preview: item.summary || item.body || "No preview.",
          meta: `${item.sourceLabel} · ${item.itemKind}`,
          authorLabel: item.authorLabel,
          occurredAt: timestampOf(item.occurredAt),
          sortTime: timeValue(item.occurredAt),
          read: item.read || readFallback.has(`comms:${item.id}`),
          urgency: deriveCommsUrgency(item),
          routePath: item.routePath,
          commsItemId: item.id,
          raw: item,
        };
      });

    return [...mailCards, ...dmCards, ...notificationCards, ...commCards];
  }, [
    commsItems,
    conversations,
    mailCommsByMessageId,
    marks.readFallbackIds,
    messages,
    notifications,
    status?.mailbox?.address,
  ]);

  const visibleCards = useMemo(() => {
    const filtered = cards.filter((card) => {
      if (filterCategory !== "all" && card.category !== filterCategory) return false;
      return cardMatchesSearch(card, search);
    });
    return [...filtered].sort((a, b) => {
      if (sortMode === "oldest") return a.sortTime - b.sortTime;
      if (sortMode === "unread") {
        if (a.read !== b.read) return a.read ? 1 : -1;
        return b.sortTime - a.sortTime;
      }
      if (sortMode === "urgency") {
        const rankDelta = URGENCY_META[b.urgency].rank - URGENCY_META[a.urgency].rank;
        return rankDelta || b.sortTime - a.sortTime;
      }
      return b.sortTime - a.sortTime;
    });
  }, [cards, filterCategory, search, sortMode]);

  const unreadCount = cards.filter((card) => !card.read).length;
  const countsByCategory = useMemo(() => {
    const counts = new Map<InboxCategory, number>();
    for (const category of CATEGORY_ORDER) counts.set(category, 0);
    for (const card of cards) {
      counts.set(card.category, (counts.get(card.category) ?? 0) + 1);
    }
    return counts;
  }, [cards]);

  const cardLogMetadata = (card: InboxCard) => ({
    cardId: card.id,
    category: card.category,
    source: card.source,
    urgency: card.urgency,
    routePath: card.routePath ?? null,
  });

  const setArrayMark = (key: InboxArrayMarkKey, card: InboxCard, eventType: string) => {
    setMarks((current) => {
      const set = new Set(current[key]);
      if (set.has(card.id)) set.delete(card.id);
      else set.add(card.id);
      return { ...current, [key]: [...set].slice(-500) };
    });
    logClientSystemEvent({
      eventType,
      metadata: cardLogMetadata(card),
    });
  };

  const setEmoji = (card: InboxCard) => {
    setMarks((current) => ({
      ...current,
      emojiById: {
        ...current.emojiById,
        [card.id]: current.emojiById[card.id] ? "" : "WTF",
      },
    }));
    logClientSystemEvent({
      eventType: "inbox.message.reacted",
      metadata: cardLogMetadata(card),
    });
  };

  const rememberFallbackRead = (id: string) => {
    setMarks((current) => ({
      ...current,
      readFallbackIds: Array.from(new Set([...current.readFallbackIds, id])).slice(-500),
    }));
  };

  const markCardRead = (card: InboxCard) => {
    rememberFallbackRead(card.id);
    logClientSystemEvent({
      eventType: "inbox.message.read",
      metadata: cardLogMetadata(card),
    });
    if (card.notificationId) {
      markNotificationReadMutation.mutate(card.notificationId);
      return;
    }
    if (card.conversationId) {
      markConversationReadMutation.mutate(card.conversationId);
      return;
    }
    if (card.commsItemId) {
      commsReadMutation.mutate(card.commsItemId);
    }
  };

  const openRoute = (route: string) => {
    if (presentation.host === "gamma") {
      setLocation(presentationRouteHref(route, presentation.host));
      return;
    }
    wm.openPage(route);
  };

  const openCard = (card: InboxCard) => {
    markCardRead(card);
    if (card.mailMessageId) {
      setSelectedMailId(card.mailMessageId);
      setView("inbox");
      return;
    }
    if (card.conversationId) {
      setActiveConversationId(card.conversationId);
      setView("conversations");
      return;
    }
    if (card.routePath) openRoute(card.routePath);
  };

  const startReply = (card: InboxCard) => {
    logClientSystemEvent({
      eventType: "inbox.message.replied",
      metadata: cardLogMetadata(card),
    });
    setView("drafts");
    if (card.source === "mail" && card.raw && "fromAddress" in card.raw) {
      const mail = card.raw as MailMessage;
      setDraftMode("mail");
      setDraftEmail(mail.direction === "inbound" ? mail.fromAddress : (mail.toAddresses ?? [])[0] ?? "");
      setDraftSubject(mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`);
      setDraftBody(`\n\nOn ${new Date(card.occurredAt).toLocaleString()}, ${card.authorLabel ?? "someone"} wrote:\n${mail.textBody ?? ""}`);
      return;
    }
    if (card.conversationId) {
      setActiveConversationId(card.conversationId);
      setView("conversations");
      return;
    }
    setDraftMode("dm");
    setDraftSubject(card.title.startsWith("Re:") ? card.title : `Re: ${card.title}`);
    setDraftBody(`\n\nRegarding: ${card.preview}`);
  };

  const startForward = (card: InboxCard) => {
    logClientSystemEvent({
      eventType: "inbox.message.forwarded",
      metadata: cardLogMetadata(card),
    });
    setView("drafts");
    setDraftMode("mail");
    setDraftSubject(card.title.startsWith("Fwd:") ? card.title : `Fwd: ${card.title}`);
    setDraftBody(`Forwarded from ${card.meta}\n\n${card.preview}`);
  };

  const saveDraft = (savedAs: "wip" | "template") => {
    const draft: SavedDraft = {
      id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
      savedAs,
      mode: draftMode,
      targetUserId: draftTargetUserId,
      toEmail: draftEmail,
      subject: draftSubject,
      body: draftBody,
      updatedAt: new Date().toISOString(),
    };
    setSavedDrafts((current) => [draft, ...current].slice(0, 60));
    setNotice(savedAs === "template" ? "Template saved." : "Draft saved.");
    logClientSystemEvent({
      eventType: "inbox.draft.saved",
      metadata: { savedAs, mode: draftMode, hasSubject: Boolean(draftSubject.trim()) },
    });
  };

  const loadDraft = (draft: SavedDraft) => {
    setDraftMode(draft.mode);
    setDraftTargetUserId(draft.targetUserId);
    setDraftEmail(draft.toEmail);
    setDraftSubject(draft.subject);
    setDraftBody(draft.body);
  };

  const sendDraft = async () => {
    setNotice("");
    if (draftMode === "mail") {
      sendMailMutation.mutate();
      return;
    }
    const targetUserId = draftTargetUserId;
    if (!targetUserId || !draftBody.trim()) return;
    try {
      const created = await createDmMutation.mutateAsync(targetUserId);
      await sendDmMutation.mutateAsync({
        conversationId: created.id,
        body: draftSubject.trim() ? `${draftSubject.trim()}\n\n${draftBody.trim()}` : draftBody.trim(),
      });
      setDraftSubject("");
      setDraftBody("");
      setNotice("Message sent.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Message failed.");
    }
  };

  const renderCard = (card: InboxCard) => {
    const category = CATEGORY_META[card.category];
    const markedFlag = marks.flaggedIds.includes(card.id);
    const markedStar = marks.starredIds.includes(card.id);
    const markedBookmark = marks.bookmarkedIds.includes(card.id);
    const emoji = marks.emojiById[card.id];
    return (
      <div key={card.id} data-mail-region="message-row" data-mail-active={!card.read ? "true" : "false"}>
        <InboxCardButton
          type="button"
          $trim={category.color}
          $unread={!card.read}
          aria-label={`Open ${category.label} message: ${card.title}`}
          onClick={() => openCard(card)}
        >
          <CardTop>
            <Meta>
              {category.label} · {URGENCY_META[card.urgency].label} ·{" "}
              {new Date(card.occurredAt).toLocaleString()}
            </Meta>
            {!card.read ? <UiStatusPill $tone="warning">Unread</UiStatusPill> : null}
          </CardTop>
          <CardTitle>{card.title}</CardTitle>
          <CardPreview>{card.preview}</CardPreview>
        </InboxCardButton>
        <CardActions>
          {!card.read ? (
            <IconAction size="sm" onClick={() => markCardRead(card)}>
              Mark read
            </IconAction>
          ) : null}
          <IconAction size="sm" onClick={() => setArrayMark("flaggedIds", card, "inbox.message.flagged")}>
            <Flag size={14} aria-hidden /> {markedFlag ? "Unflag" : "Flag"}
          </IconAction>
          <IconAction size="sm" onClick={() => setArrayMark("starredIds", card, "inbox.message.starred")}>
            <Star size={14} aria-hidden /> {markedStar ? "Unstar" : "Star"}
          </IconAction>
          <IconAction size="sm" onClick={() => setArrayMark("bookmarkedIds", card, "inbox.message.bookmarked")}>
            <Bookmark size={14} aria-hidden /> {markedBookmark ? "Unbookmark" : "Bookmark"}
          </IconAction>
          <IconAction size="sm" onClick={() => setEmoji(card)}>
            {emoji ? "Clear WTF" : "WTF"}
          </IconAction>
          <IconAction size="sm" onClick={() => startReply(card)}>
            <Reply size={14} aria-hidden /> Reply
          </IconAction>
          <IconAction size="sm" onClick={() => startForward(card)}>
            <Forward size={14} aria-hidden /> Forward
          </IconAction>
        </CardActions>
      </div>
    );
  };

  const renderInboxView = () => (
    <Split>
      <UiPanel title="Inbox" data-mail-region="messages-panel">
        <Feed>{visibleCards.map(renderCard)}</Feed>
        {visibleCards.length === 0 ? (
          <UiEmptyState title="No matching messages">
            Mail, WIM, Studio, system, admin, invite, and notification subscription messages will appear here.
          </UiEmptyState>
        ) : null}
      </UiPanel>
      <UiPanel title="Selected Message" data-mail-region="selected-panel">
        <MessagePanel>
          {selectedMail ? (
            <>
              <MessageTitle>{selectedMail.subject}</MessageTitle>
              <UiStatusPill
                $tone={selectedMail.direction === "inbound" ? "info" : "neutral"}
                data-mail-region="status-pill"
              >
                {selectedMail.direction}
              </UiStatusPill>
              <Meta>From: {selectedMail.fromName || selectedMail.fromAddress}</Meta>
              <Meta>To: {(selectedMail.toAddresses ?? []).join(", ") || "none"}</Meta>
              <Meta>
                {selectedMail.status} ·{" "}
                {new Date(selectedMail.receivedAt || selectedMail.sentAt || selectedMail.createdAt).toLocaleString()}
              </Meta>
              <Body>{selectedMail.textBody || "(empty message)"}</Body>
            </>
          ) : (
            <UiEmptyState title="Select a message">
              Choose a mail card to read the full body here.
            </UiEmptyState>
          )}
        </MessagePanel>
      </UiPanel>
    </Split>
  );

  const renderSortedView = () => {
    const sortedCards = visibleCards.filter((card) => card.category === sortedCategory);
    return (
      <Stack>
        <UiToolbar>
          {CATEGORY_ORDER.map((category) => (
            <UiButton
              key={category}
              size="sm"
              uiVariant={sortedCategory === category ? "primary" : "default"}
              onClick={() => setSortedCategory(category)}
            >
              {CATEGORY_META[category].label} ({countsByCategory.get(category) ?? 0})
            </UiButton>
          ))}
        </UiToolbar>
        <UiPanel title={`${CATEGORY_META[sortedCategory].label} Messages`}>
          <Feed>{sortedCards.map(renderCard)}</Feed>
          {sortedCards.length === 0 ? (
            <UiEmptyState title="No messages in this category">
              Choose another category or clear the current search.
            </UiEmptyState>
          ) : null}
        </UiPanel>
      </Stack>
    );
  };

  const renderConversationsView = () => {
    const active = selectedConversation;
    const messagesInConversation = conversationMessagesQuery.data ?? [];
    const trim = active?.conversationType === "studio" ? CATEGORY_META.studio.color : CATEGORY_META.wim.color;
    return (
      <Split>
        <UiPanel title="Conversations">
          <Feed>
            {conversations.map((conversation) => {
              const isStudio = conversation.conversationType === "studio";
              return (
                <ConversationRow
                  key={conversation.id}
                  type="button"
                  $active={conversation.id === activeConversationId}
                  $trim={isStudio ? CATEGORY_META.studio.color : CATEGORY_META.wim.color}
                  onClick={() => {
                    setActiveConversationId(conversation.id);
                    markConversationReadMutation.mutate(conversation.id);
                  }}
                >
                  <strong>{conversationLabel(conversation)}</strong>
                  <Meta>
                    {isStudio ? "Studio" : "WIM"} · {conversation.unreadCount} unread
                  </Meta>
                </ConversationRow>
              );
            })}
          </Feed>
        </UiPanel>
        <UiPanel title={active ? conversationLabel(active) : "Conversation History"}>
          <MessagePanel>
            {!activeConversationId ? (
              <UiEmptyState title="Select a conversation">
                WIM direct chats and Studio project conversations appear here chronologically.
              </UiEmptyState>
            ) : conversationMessagesQuery.isLoading ? (
              <Hourglass size={24} />
            ) : (
              <>
                {messagesInConversation.map((message) => (
                  <ConversationBubble
                    key={message.id}
                    $mine={message.senderId === user?.id}
                    $trim={trim}
                  >
                    <Meta>
                      <strong>{message.displayName || message.username || "WTF user"}</strong>{" "}
                      {new Date(message.createdAt).toLocaleString()}
                      {message.pinned ? " · Bookmarked" : ""}
                    </Meta>
                    <Body>{message.content}</Body>
                    <UiButton
                      size="sm"
                      onClick={() =>
                        activeConversationId &&
                        pinDmMutation.mutate({
                          conversationId: activeConversationId,
                          messageId: message.id,
                          pinned: !message.pinned,
                        })
                      }
                    >
                      {message.pinned ? "Remove bookmark" : "Bookmark message"}
                    </UiButton>
                  </ConversationBubble>
                ))}
                {messagesInConversation.length === 0 ? (
                  <UiEmptyState title="No messages yet">
                    Send the first message from WIM, Studio, or this Inbox draft surface.
                  </UiEmptyState>
                ) : null}
              </>
            )}
          </MessagePanel>
        </UiPanel>
      </Split>
    );
  };

  const renderDraftsView = () => {
    const targetOptions = draftMode === "admin" ? adminOptions : userOptions;
    const canSend =
      draftMode === "mail"
        ? draftEmail.trim() && draftSubject.trim() && draftBody.trim()
        : draftTargetUserId && draftBody.trim();
    return (
      <Split>
        <UiPanel title="Draft Message" data-mail-region="compose-panel">
          <Stack>
            <SelectInput
              aria-label="Draft destination type"
              value={draftMode}
              onChange={(event) => {
                const mode = event.target.value as DraftMode;
                setDraftMode(mode);
                setDraftTargetUserId(null);
              }}
            >
              <option value="dm">WTF user through WIM</option>
              <option value="admin">Sys admin</option>
              <option value="mail">External mail</option>
            </SelectInput>
            {draftMode === "mail" ? (
              <TextInput
                aria-label="Mail recipients"
                data-mail-region="recipient-input"
                value={draftEmail}
                placeholder="to@example.com"
                onChange={(event: any) => setDraftEmail(event.target.value)}
              />
            ) : (
              <SelectInput
                aria-label={draftMode === "admin" ? "Select sys admin recipient" : "Select WTF user recipient"}
                value={draftTargetUserId ?? ""}
                onChange={(event) => setDraftTargetUserId(Number(event.target.value) || null)}
              >
                <option value="">Choose recipient</option>
                {targetOptions.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName || candidate.username} [{candidate.role}]
                  </option>
                ))}
              </SelectInput>
            )}
            <TextInput
              aria-label="Message subject"
              data-mail-region="subject-input"
              value={draftSubject}
              placeholder="Subject"
              onChange={(event: any) => setDraftSubject(event.target.value)}
            />
            <ComposeBody
              aria-label="Message body"
              value={draftBody}
              placeholder="Message"
              rows={6}
              onChange={(event: any) => setDraftBody(event.target.value)}
            />
            {notice ? <UiNotice tone={notice.includes("failed") ? "danger" : "info"}>{notice}</UiNotice> : null}
            {sendMailMutation.error ? (
              <UiNotice tone="danger">
                {sendMailMutation.error instanceof Error
                  ? sendMailMutation.error.message
                  : String(sendMailMutation.error)}
              </UiNotice>
            ) : null}
            <UiToolbar>
              <UiButton
                uiVariant="primary"
                data-mail-region="send-button"
                disabled={!canSend || sendMailMutation.isPending || sendDmMutation.isPending}
                onClick={sendDraft}
              >
                <Send size={14} aria-hidden /> Send message
              </UiButton>
              <UiButton onClick={() => saveDraft("wip")} disabled={!draftSubject.trim() && !draftBody.trim()}>
                Save WIP
              </UiButton>
              <UiButton onClick={() => saveDraft("template")} disabled={!draftSubject.trim() && !draftBody.trim()}>
                Save template
              </UiButton>
            </UiToolbar>
          </Stack>
        </UiPanel>
        <UiPanel title="Saved Drafts and Templates">
          <Feed>
            {savedDrafts.map((draft) => (
              <ConversationRow
                key={draft.id}
                type="button"
                $trim={draft.savedAs === "template" ? CATEGORY_META.notification_subscription.color : CATEGORY_META.user_mail.color}
                onClick={() => loadDraft(draft)}
              >
                <strong>{draft.subject || "(no subject)"}</strong>
                <Meta>
                  {draft.savedAs} · {draft.mode} · {new Date(draft.updatedAt).toLocaleString()}
                </Meta>
              </ConversationRow>
            ))}
            {savedDrafts.length === 0 ? (
              <UiEmptyState title="No drafts saved">
                Save WIP for later or save reusable templates from the compose panel.
              </UiEmptyState>
            ) : null}
          </Feed>
        </UiPanel>
      </Split>
    );
  };

  const mailboxAddress = status?.mailbox?.address || "Mailbox pending";
  const mailboxStatus = status?.mailbox?.status || (status?.eligible ? "eligible" : "unavailable");
  const mailConfig = status?.config;

  return (
    <AppWindow title="Inbox">
      <Shell
        data-mail-presentation-host={presentation.host}
        data-mail-surface="inbox"
        data-mail-region="surface"
      >
        <NavPanel>
          <UiPanel title="Inbox" data-mail-region="mailbox-panel">
            {statusQuery.isLoading ? (
              <Hourglass size={24} />
            ) : statusQuery.isError ? (
              <UiNotice tone="danger">{(statusQuery.error as Error).message}</UiNotice>
            ) : (
              <Stack>
                <strong data-mail-region="mailbox-address">{mailboxAddress}</strong>
                <Meta>
                  {mailboxStatus} · {mailConfig?.rolloutMode || "unknown"} ·{" "}
                  {mailConfig?.provider || "provider pending"}
                </Meta>
                <Meta>
                  Inbound {mailConfig?.inboundEnabled ? "on" : "off"} · Outbound{" "}
                  {mailConfig?.outboundEnabled ? "on" : "off"}
                </Meta>
              </Stack>
            )}
          </UiPanel>
          {([
            ["inbox", "All messages", unreadCount],
            ["sorted", "Sorted", visibleCards.length],
            ["conversations", "Conversations", conversations.length],
            ["drafts", "Drafts", savedDrafts.length],
          ] as Array<[InboxView, string, number]>).map(([key, label, count]) => (
            <NavButton
              key={key}
              type="button"
              $active={view === key}
              onClick={() => setView(key)}
            >
              <span>{label}</span>
              <CountBadge>{count}</CountBadge>
            </NavButton>
          ))}
        </NavPanel>

        <Workspace data-mail-region="workspace">
          <UiPanel title="Message controls">
            <SearchGrid>
              <TextInput
                aria-label="Search Inbox"
                value={search}
                placeholder="Search messages"
                onChange={(event: any) => setSearch(event.target.value)}
              />
              <SelectInput
                aria-label="Filter Inbox category"
                value={filterCategory}
                onChange={(event) => setFilterCategory(event.target.value as InboxCategory | "all")}
              >
                <option value="all">All categories</option>
                {CATEGORY_ORDER.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_META[category].label}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                aria-label="Sort Inbox"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="unread">Unread first</option>
                <option value="urgency">Urgency first</option>
              </SelectInput>
            </SearchGrid>
            <Meta>
              <Search size={13} aria-hidden /> {visibleCards.length} shown · {unreadCount} unread · message boards and WTF LIVE rooms stay in their owning apps.
            </Meta>
          </UiPanel>

          {messagesQuery.isLoading || conversationsQuery.isLoading || notificationsQuery.isLoading ? (
            <UiPanel title="Loading Inbox">
              <Hourglass size={28} />
            </UiPanel>
          ) : view === "sorted" ? (
            renderSortedView()
          ) : view === "conversations" ? (
            renderConversationsView()
          ) : view === "drafts" ? (
            renderDraftsView()
          ) : (
            renderInboxView()
          )}
        </Workspace>
      </Shell>
    </AppWindow>
  );
}
