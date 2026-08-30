import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Button,
  Checkbox,
  GroupBox,
  Hourglass,
  Panel,
  Select,
  Tab,
  TabBody,
  Tabs,
  TextInput,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiEmptyState } from "../components/wtfos-ui";
import { UserLink } from "../components/UserLink";
import { useAuth } from "../lib/auth-context";
import {
  presentationRouteHref,
  usePresentationShell,
} from "../lib/presentation-shell";
import { useWindowManager } from "../lib/window-context";
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";
import { ROLE_LABELS, type UserRole } from "@shared/types";
import { MOBILE } from "../global-styles";
import { HAMSTER_REACTIONS, HAMSTER_SECTION_LABEL } from "../lib/hamster-emoji";

const gammaMessagesScope = `[data-messages-presentation-host="gamma"]`;

const MessagesSurface = styled.div`
  display: grid;
  gap: 10px;
  min-width: 0;
  min-height: 0;

  &[data-messages-presentation-host="gamma"] {
    color: #f2ead9;
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
    font-size: 15px;
    line-height: 1.45;
  }

  &[data-messages-presentation-host="gamma"],
  &[data-messages-presentation-host="gamma"] * {
    box-sizing: border-box;
    letter-spacing: 0;
    text-shadow: none;
  }

  &[data-messages-presentation-host="gamma"] [data-messages-region] {
    background-image: none;
    box-shadow: none;
  }

  &[data-messages-presentation-host="gamma"]
    :where(button, input, textarea, select, p, span, strong, div, label, legend, fieldset) {
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
  }

  &[data-messages-presentation-host="gamma"] :where(code, pre, [data-wtf-caption="true"]) {
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }

  &[data-messages-presentation-host="gamma"] [data-messages-region="tabs"],
  &[data-messages-presentation-host="gamma"] [data-messages-region="tab-body"],
  &[data-messages-presentation-host="gamma"] [data-messages-region="layout"],
  &[data-messages-presentation-host="gamma"] [data-messages-region="notification-pane"] {
    background: transparent;
    border: 0;
  }

  &[data-messages-presentation-host="gamma"] fieldset {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: rgba(242, 234, 217, 0.035);
    color: #f2ead9;
  }

  &[data-messages-presentation-host="gamma"] legend {
    color: #28d7ff;
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }

  &[data-messages-presentation-host="gamma"]
    :where(button, input, select, textarea) {
    border-radius: 4px;
  }

  &[data-messages-presentation-host="gamma"] button:not(:disabled) {
    color: #f2ead9;
  }

  &[data-messages-presentation-host="gamma"] a {
    color: #28d7ff;
  }
`;

const Layout = styled.div`
  display: flex;
  gap: var(--wtf-space-3, 12px);
  height: 100%;
  min-height: 460px;
  min-width: 0;

  ${MOBILE} {
    flex-direction: column;
    min-height: 0;
  }
`;

const Side = styled.div<{ $mobileHidden?: boolean }>`
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-2, 8px);
  min-width: 0;

  ${MOBILE} {
    width: 100%;
    display: ${(p) => (p.$mobileHidden ? "none" : "flex")};
  }
`;

const Main = styled.div<{ $mobileHidden?: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-2, 8px);

  ${MOBILE} {
    display: ${(p) => (p.$mobileHidden ? "none" : "flex")};
  }
`;

const ListPanel = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  overflow-y: auto;
  padding: var(--wtf-space-3, 12px);
  min-height: 220px;
  min-width: 0;
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-surface-raised, #ffffff);
  border-color: var(--wtf-app-border, #808080);

  ${gammaMessagesScope} & {
    background: rgba(242, 234, 217, 0.045);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const ItemButton = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  min-height: 36px;
  text-align: left;
  margin-bottom: var(--wtf-space-1, 4px);
  color: var(--wtf-app-text, #111);
  ${(p) => p.$active && "font-weight: bold;"}

  ${gammaMessagesScope} & {
    min-height: 38px;
    border: 1px solid rgba(242, 234, 217, 0.16);
    background: rgba(242, 234, 217, 0.035);
    color: #f2ead9;
    font-weight: 600;
    text-align: left;
  }

  ${gammaMessagesScope} &[data-active-conversation="true"] {
    border-color: rgba(40, 215, 255, 0.65);
    background: rgba(40, 215, 255, 0.11);
  }
`;

const MessageList = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  overflow-y: auto;
  padding: var(--wtf-space-3, 12px);
  min-height: 220px;
  min-width: 0;
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-surface-raised, #ffffff);
  border-color: var(--wtf-app-border, #808080);

  ${gammaMessagesScope} & {
    background: rgba(242, 234, 217, 0.045);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const MessageRow = styled.div`
  margin-bottom: 10px;

  ${gammaMessagesScope} & {
    margin-bottom: 8px;
    padding: 8px 0 10px;
    border-bottom: 1px solid rgba(242, 234, 217, 0.1);
  }
`;

const Meta = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
  line-height: 1.35;
  overflow-wrap: anywhere;

  ${gammaMessagesScope} & {
    color: rgba(242, 234, 217, 0.67);
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
  }
`;

const Body = styled.div`
  font-size: var(--wtf-type-body, 15px);
  line-height: 1.45;
  margin-top: 2px;
  overflow-wrap: anywhere;

  ${gammaMessagesScope} & {
    color: #f2ead9;
  }
`;

const InputRow = styled.div`
  display: flex;
  gap: 6px;

  ${gammaMessagesScope} & {
    align-items: stretch;
    padding-top: 2px;
  }
`;

const MobileBackButton = styled(Button)`
  display: none !important;
  align-self: flex-start;
  margin-bottom: 4px;

  ${MOBILE} {
    display: inline-block !important;
  }
`;

const NotificationRow = styled.div<{ $unread?: boolean; $clickable?: boolean }>`
  margin-bottom: 8px;
  min-height: 44px;
  padding: var(--wtf-space-3, 12px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: ${(p) =>
    p.$unread
      ? "var(--wtf-app-warning-bg, var(--wtf-app-surface-raised, #ffffff))"
      : "var(--wtf-app-surface-raised, #ffffff)"};
  color: var(--wtf-app-text, #111);
  ${(p) =>
    p.$clickable
      ? "cursor: pointer; &:hover { background: var(--wtf-app-info-bg, var(--wtf-app-surface-raised, #ffffff)); }"
      : ""}

  ${gammaMessagesScope} & {
    background: ${(p) =>
      p.$unread ? "rgba(40, 215, 255, 0.1)" : "rgba(242, 234, 217, 0.045)"};
    border: 1px solid
      ${(p) =>
        p.$unread ? "rgba(40, 215, 255, 0.42)" : "rgba(242, 234, 217, 0.16)"};
    border-radius: 6px;
    color: #f2ead9;
  }

  ${(p) =>
    p.$clickable
      ? `${gammaMessagesScope} &:hover { background: rgba(40, 215, 255, 0.14); }`
      : ""}
`;

const StudioBadge = styled.span`
  display: inline-block;
  font-size: var(--wtf-type-caption, 13px);
  background: var(--wtf-app-primary, var(--wtf-highlight-color, #000080));
  color: var(--wtf-app-accent-text, #fff);
  padding: 2px 6px;
  margin-left: 4px;
  letter-spacing: 0;
  min-height: 22px;
  line-height: 1.2;

  ${gammaMessagesScope} & {
    background: transparent;
    border: 1px solid rgba(40, 215, 255, 0.6);
    border-radius: 4px;
    color: #28d7ff;
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 10px;
    font-weight: 700;
  }
`;

const SectionHeader = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: var(--wtf-app-muted-text, #384352);
  padding: 4px 2px 2px;
  text-transform: none;
  letter-spacing: 0;

  ${gammaMessagesScope} & {
    color: #28d7ff;
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    text-transform: uppercase;
  }
`;

const SystemMessageRow = styled.div`
  margin-bottom: 8px;
  padding: var(--wtf-space-2, 8px) var(--wtf-space-3, 12px);
  background: var(--wtf-app-info-bg, var(--wtf-app-surface-raised, #ffffff));
  border: 1px solid var(--wtf-app-border, #808080);
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-text, #111);
  font-style: italic;

  ${gammaMessagesScope} & {
    background: rgba(40, 215, 255, 0.08);
    border: 1px solid rgba(40, 215, 255, 0.26);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const SafetyPanel = styled.div`
  margin-top: 6px;
  padding: var(--wtf-space-3, 12px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-warning-bg, #fff7df);
  color: var(--wtf-app-text, #111);

  ${gammaMessagesScope} & {
    background: rgba(255, 170, 50, 0.08);
    border-color: rgba(255, 170, 50, 0.35);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const NotificationTitle = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;

  ${gammaMessagesScope} & {
    color: #f2ead9;
    font-size: 14px;
  }
`;

const NotificationBody = styled.div`
  margin-top: 3px;
  font-size: var(--wtf-type-caption, 13px);

  ${gammaMessagesScope} & {
    color: rgba(242, 234, 217, 0.84);
    font-size: 13px;
  }
`;

const NotificationMeta = styled.div`
  margin-top: 4px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  ${gammaMessagesScope} & {
    color: rgba(242, 234, 217, 0.62);
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
  }
`;

const PreferenceRow = styled.div`
  margin-bottom: 8px;
  padding: var(--wtf-space-3, 12px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);

  ${gammaMessagesScope} & {
    background: rgba(242, 234, 217, 0.045);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const DmEmojiPicker = styled.div`
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px;
  background: var(--wtf-app-surface-raised, #ffffff);
  border: 1px solid var(--wtf-app-border, #808080);
  z-index: 20;
  max-width: 260px;

  ${gammaMessagesScope} & {
    background: #10100e;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
  }

  button {
    min-width: 32px;
    min-height: 32px;
    background: var(--wtf-app-control-bg, #ffffff);
    border: 1px solid transparent;
    font-size: 18px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
    &:hover {
      border-color: var(--wtf-app-control-border, #808080);
      background: var(--wtf-app-info-bg, var(--wtf-app-surface, #f4f4f4));
    }
  }

  ${gammaMessagesScope} & button {
    background: rgba(242, 234, 217, 0.05);
    border-color: rgba(242, 234, 217, 0.14);
    color: #f2ead9;
  }

  ${gammaMessagesScope} & button:hover {
    background: rgba(40, 215, 255, 0.12);
    border-color: rgba(40, 215, 255, 0.45);
  }
`;

interface MessageUser {
  id: number;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  experiencePoints?: number;
}

interface DmConversation {
  id: number;
  lastMessageAt: string;
  unreadCount: number;
  peers: MessageUser[];
  latestMessage?: {
    content: string;
    createdAt: string;
  } | null;
  conversationType?: "direct" | "studio";
  studioProjectId?: number | null;
  title?: string | null;
}

interface DmMessage {
  id: number;
  senderId: number;
  username?: string;
  displayName?: string;
  content: string;
  createdAt: string;
  messageType?: string | null;
  metadata?: Record<string, unknown> | null;
  pinned?: boolean;
}

interface DmMessageReport {
  id: number;
  messageId: number;
  reporterUserId: number;
  conversationId: number;
  senderUserId: number;
  sender: { username: string; displayName?: string | null } | null;
  reporter: { username: string; displayName?: string | null } | null;
  messageContent: string;
  messageCreatedAt: string;
  reason: string;
  status: "open" | "reviewed" | "dismissed";
  reviewNote: string | null;
  createdAt: string;
}

interface NotificationPreferenceDefinition {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

interface NotificationPreferencesResponse {
  definitions: NotificationPreferenceDefinition[];
  preferences: Record<string, boolean>;
}

interface NotificationItem {
  id: number;
  sourceUserId: number | null;
  sourceUsername: string | null;
  sourceDisplayName: string | null;
  eventKey: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

interface NotificationListResponse {
  items: NotificationItem[];
  unreadCount: number;
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}

/**
 * Takes a DM conversation list and returns a { directs, studioRooms } split so
 * Messages can render each section separately.
 */
function splitConversations(list: DmConversation[] | undefined) {
  const directs: DmConversation[] = [];
  const studioRooms: DmConversation[] = [];
  for (const c of list ?? []) {
    if (c.conversationType === "studio") {
      studioRooms.push(c);
    } else {
      directs.push(c);
    }
  }
  return { directs, studioRooms };
}

/**
 * Humanize `eventKey` into notification-header style.  "studio.file_uploaded"
 * → "Studio · file uploaded".
 */
function eventKeyLabel(key: string): string {
  if (!key) return "";
  if (key.startsWith("studio.")) {
    const rest = key.slice("studio.".length).replace(/_/g, " ");
    return `Studio · ${rest}`;
  }
  return key.replace(/_/g, " ");
}

/**
 * Extract a studio project id from a notification's structured metadata.
 */
function studioProjectIdFromMetadata(
  metadata: Record<string, unknown> | null
): number | null {
  if (!metadata) return null;
  const raw = metadata.studioProjectId ?? metadata.projectId;
  const numeric = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

type MessagesProps = {
  initialTab?: "direct-messages" | "notifications";
};

function tabForInitialMode(initialTab: MessagesProps["initialTab"]) {
  return initialTab === "notifications" ? 1 : 0;
}

export function Messages({ initialTab = "direct-messages" }: MessagesProps) {
  const presentation = usePresentationShell();
  const { user } = useAuth();
  const qc = useQueryClient();
  const wm = useWindowManager();
  const [, setLocation] = useLocation();

  const [inboxTab, setInboxTab] = useState(() => tabForInitialMode(initialTab));
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [dmInput, setDmInput] = useState("");
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [notificationsUnreadOnly, setNotificationsUnreadOnly] = useState(false);
  const [notificationDraftPrefs, setNotificationDraftPrefs] = useState<
    Record<string, boolean>
  >({});
  const [notificationPrefsDirty, setNotificationPrefsDirty] = useState(false);
  const [showDmEmoji, setShowDmEmoji] = useState(false);
  const [reportingMessageId, setReportingMessageId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [reportReviewNotes, setReportReviewNotes] = useState<Record<number, string>>({});

  const getAdaptiveInterval = (activeMs: number, idleMs: number) =>
    typeof document !== "undefined" && document.visibilityState === "visible"
      ? activeMs
      : idleMs;

  const { data: messageUsers } = useQuery({
    queryKey: ["messages", "users"],
    queryFn: () => api.get<MessageUser[]>("/api/messages/users?limit=200"),
    enabled: !!user,
  });

  const { data: dmConversations, isLoading: dmLoading } = useQuery({
    queryKey: ["messages", "dms"],
    queryFn: () => api.get<DmConversation[]>("/api/messages/dms"),
    enabled: !!user,
    refetchInterval: () => getAdaptiveInterval(10_000, 45_000),
    refetchIntervalInBackground: false,
  });

  const { data: dmMessages } = useQuery({
    queryKey: ["messages", "dms", activeConversationId],
    queryFn: () => api.get<DmMessage[]>(`/api/messages/dms/${activeConversationId}/messages?limit=100`),
    enabled: !!activeConversationId,
    refetchInterval: () => getAdaptiveInterval(8_000, 30_000),
    refetchIntervalInBackground: false,
  });

  const { data: notificationPrefs } = useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: () =>
      api.get<NotificationPreferencesResponse>("/api/notifications/preferences"),
    enabled: !!user,
  });

  const { data: notifications, isLoading: notificationsLoading } = useQuery({
    queryKey: ["notifications", notificationsUnreadOnly],
    queryFn: () =>
      api.get<NotificationListResponse>(
        `/api/notifications?limit=200${notificationsUnreadOnly ? "&unreadOnly=true" : ""}`
      ),
    enabled: !!user,
    refetchInterval: () => getAdaptiveInterval(12_000, 45_000),
    refetchIntervalInBackground: false,
  });

  const canReviewDmReports = user?.role === "admin";
  const { data: dmReports, isLoading: dmReportsLoading } = useQuery({
    queryKey: ["messages", "dm-reports", "open"],
    queryFn: () => api.get<DmMessageReport[]>("/api/messages/dm-reports?status=open"),
    enabled: canReviewDmReports,
  });

  useEffect(() => {
    if (!activeConversationId && dmConversations && dmConversations.length > 0) {
      setActiveConversationId(dmConversations[0].id);
    }
  }, [activeConversationId, dmConversations]);

  useEffect(() => {
    if (!notificationPrefs) return;
    setNotificationDraftPrefs(notificationPrefs.preferences || {});
    setNotificationPrefsDirty(false);
  }, [notificationPrefs]);

  useEffect(() => {
    setInboxTab(tabForInitialMode(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (inboxTab !== 1) return;
    logClientSystemEvent({
      eventType: "notification_center.viewed",
      metadata: {
        unreadOnly: notificationsUnreadOnly,
        unreadCount: notifications?.unreadCount ?? 0,
        itemCount: notifications?.items?.length ?? 0,
      },
    });
  }, [
    inboxTab,
    notifications?.items?.length,
    notifications?.unreadCount,
    notificationsUnreadOnly,
  ]);

  const createDmMutation = useMutation({
    mutationFn: (peerUserId: number) =>
      api.post<{ id: number }>("/api/messages/dms", { targetUserId: peerUserId }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["messages", "dms"] });
      setActiveConversationId(data.id);
    },
  });

  const sendDmMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/api/messages/dms/${activeConversationId}/messages`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", "dms", activeConversationId] });
      qc.invalidateQueries({ queryKey: ["messages", "dms"] });
      setDmInput("");
    },
  });

  const reportDmMutation = useMutation({
    mutationFn: ({ messageId, reason }: { messageId: number; reason: string }) =>
      api.post(
        `/api/messages/dms/${activeConversationId}/messages/${messageId}/report`,
        { reason }
      ),
    onSuccess: () => {
      setReportFeedback("Report sent for moderator review.");
      setReportingMessageId(null);
      setReportReason("");
      qc.invalidateQueries({ queryKey: ["messages", "dm-reports"] });
    },
    onError: (error: Error) => setReportFeedback(error.message),
  });

  const reviewDmReportMutation = useMutation({
    mutationFn: ({
      reportId,
      status,
      note,
    }: {
      reportId: number;
      status: "reviewed" | "dismissed";
      note: string;
    }) => api.post(`/api/messages/dm-reports/${reportId}/review`, { status, note }),
    onSuccess: (_data, variables) => {
      setReportReviewNotes((notes) => {
        const next = { ...notes };
        delete next[variables.reportId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["messages", "dm-reports"] });
    },
  });

  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationId: number) => {
      logClientSystemEvent({
        eventType: "notification_center.mark_read",
        metadata: { notificationId },
      });
      return api.put(`/api/notifications/${notificationId}/read`, { read: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllNotificationsReadMutation = useMutation({
    mutationFn: () => {
      logClientSystemEvent({
        eventType: "notification_center.mark_all_read",
        metadata: { unreadCount: notifications?.unreadCount ?? 0 },
      });
      return api.put("/api/notifications/read-all", {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const saveNotificationPrefsMutation = useMutation({
    mutationFn: (preferences: Record<string, boolean>) => {
      logClientSystemEvent({
        eventType: "notification_center.preferences_saved",
        metadata: {
          enabledCount: Object.values(preferences).filter(Boolean).length,
          preferenceKeys: Object.keys(preferences).sort().slice(0, 40),
        },
      });
      return api.put<NotificationPreferencesResponse>("/api/notifications/preferences", {
        preferences,
      });
    },
    onSuccess: (updated) => {
      qc.setQueryData(["notifications", "preferences"], updated);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setNotificationDraftPrefs(updated.preferences || {});
      setNotificationPrefsDirty(false);
    },
  });

  if (dmLoading) {
    return (
      <AppWindow title={initialTab === "notifications" ? "Notification Center" : "Messages"}>
        <MessagesSurface
          data-messages-presentation-host={presentation.host}
          data-messages-surface={initialTab === "notifications" ? "notifications" : "messages"}
          data-messages-region="surface"
        >
          <Hourglass size={32} />
        </MessagesSurface>
      </AppWindow>
    );
  }

  const dmOptions =
    messageUsers
      ?.filter((candidate) => candidate.id !== user?.id)
      .map((candidate) => ({
        value: candidate.id,
        label: `${candidate.displayName || candidate.username} [${ROLE_LABELS[candidate.role]}]`,
      })) ?? [];

  const currentDm = dmConversations?.find((c) => c.id === activeConversationId);
  const unreadNotificationCount = notifications?.unreadCount ?? 0;

  const selectConversation = (id: number) => {
    setActiveConversationId(id);
    setMobileView("chat");
  };

  const { directs, studioRooms } = splitConversations(dmConversations);

  const currentStudioProjectId =
    currentDm?.conversationType === "studio"
      ? currentDm.studioProjectId ?? null
      : null;

  const openStudioProject = (projectId: number) => {
    const route = `/studio/${projectId}`;
    if (presentation.host === "gamma") {
      setLocation(presentationRouteHref(route, presentation.host));
      return;
    }
    wm.openPage(route);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.eventKey.startsWith("studio.")) return;
    const projectId = studioProjectIdFromMetadata(item.metadata);
    if (projectId == null) return;
    logClientSystemEvent({
      eventType: "notification_center.notification_opened",
      metadata: {
        notificationId: item.id,
        eventKey: item.eventKey,
        target: "studio",
        projectId,
      },
    });
    void api.put(`/api/notifications/${item.id}/opened`, {});
    if (!item.read) {
      markNotificationReadMutation.mutate(item.id);
    }
    openStudioProject(projectId);
  };

  const renderConversationButton = (conversation: DmConversation) => {
    const isStudio = conversation.conversationType === "studio";
    const peerNames =
      conversation.peers.length > 0
        ? conversation.peers
            .map((peer) => peer.displayName || peer.username)
            .join(", ")
        : "Unknown";
    const label = isStudio
      ? conversation.title || peerNames || "Studio project"
      : peerNames;
    return (
      <ItemButton
        key={conversation.id}
        size="sm"
        $active={conversation.id === activeConversationId}
        data-messages-region="conversation-button"
        data-active-conversation={conversation.id === activeConversationId ? "true" : undefined}
        onClick={() => selectConversation(conversation.id)}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "inline-block",
            maxWidth: "100%",
          }}
        >
          {isStudio ? "🎨 " : ""}
          {label}
          {conversation.unreadCount > 0 ? ` (${conversation.unreadCount})` : ""}
          {isStudio ? <StudioBadge>STUDIO</StudioBadge> : null}
        </span>
      </ItemButton>
    );
  };

  return (
    <AppWindow title={initialTab === "notifications" ? "Notification Center" : "Messages"}>
      <MessagesSurface
        data-messages-presentation-host={presentation.host}
        data-messages-surface={initialTab === "notifications" ? "notifications" : "messages"}
        data-messages-region="surface"
      >
      <Tabs
        value={inboxTab}
        onChange={(v: number) => setInboxTab(v)}
        data-messages-region="tabs"
      >
        <Tab value={0}>Direct Messages</Tab>
        <Tab value={1}>
          Notifications{unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ""}
        </Tab>
        {canReviewDmReports ? (
          <Tab value={2}>Safety reports{(dmReports?.length ?? 0) > 0 ? ` (${dmReports?.length})` : ""}</Tab>
        ) : null}
      </Tabs>

      <TabBody data-messages-region="tab-body">
        {inboxTab === 0 && (
          <Layout data-messages-region="layout">
            <Side $mobileHidden={mobileView === "chat"} data-messages-region="side">
              <GroupBox label="Start DM" data-messages-region="start-dm">
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    marginBottom: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <Select
                    aria-label="Select user to start a direct message"
                    width={190}
                    value={targetUserId ?? undefined}
                    options={dmOptions}
                    onChange={(e: any) => setTargetUserId(Number(e.value))}
                    menuMaxHeight={200}
                  />
                  <Button
                    size="sm"
                    disabled={!targetUserId || createDmMutation.isPending}
                    onClick={() => targetUserId && createDmMutation.mutate(targetUserId)}
                  >
                    Open DM
                  </Button>
                </div>
              </GroupBox>

              <GroupBox
                label="Conversations"
                style={{ flex: 1 }}
                data-messages-region="conversations"
              >
                <ListPanel data-messages-region="list-panel">
                  {directs.length > 0 ? (
                    <>
                      <SectionHeader>Direct messages</SectionHeader>
                      {directs.map(renderConversationButton)}
                    </>
                  ) : null}

                  {studioRooms.length > 0 ? (
                    <>
                      <SectionHeader
                        style={{ marginTop: directs.length ? 8 : 0 }}
                      >
                        Studio projects
                      </SectionHeader>
                      {studioRooms.map(renderConversationButton)}
                    </>
                  ) : null}

                  {(!dmConversations || dmConversations.length === 0) && (
                    <UiEmptyState title="No direct messages yet">
                      Start a DM with a WTF user. New project rooms and direct chats will appear here.
                    </UiEmptyState>
                  )}
                </ListPanel>
              </GroupBox>
            </Side>

            <Main $mobileHidden={mobileView === "list"} data-messages-region="main">
              <MobileBackButton
                size="sm"
                onClick={() => setMobileView("list")}
              >
                ← Back
              </MobileBackButton>
              <GroupBox
                data-messages-region="conversation-meta"
                label={
                  currentDm?.conversationType === "studio"
                    ? "Studio project chat"
                    : "Conversation"
                }
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <Meta>
                    {currentDm
                      ? currentDm.conversationType === "studio"
                        ? `Project chat · ${
                            currentDm.title ||
                            currentDm.peers
                              .map((p) => p.displayName || p.username)
                              .join(", ") ||
                            "Untitled"
                          }`
                        : `Talking with ${
                            currentDm.peers
                              .map((p) => p.displayName || p.username)
                              .join(", ") || "Unknown"
                          }`
                      : "Select or start a conversation"}
                  </Meta>
                  {currentStudioProjectId ? (
                    <Button
                      size="sm"
                      onClick={() => openStudioProject(currentStudioProjectId)}
                    >
                      Open in Studio
                    </Button>
                  ) : null}
                </div>
              </GroupBox>

              <MessageList data-messages-region="message-list">
                {dmMessages?.map((message) => {
                  const isSystem = message.messageType === "studio_system";
                  if (isSystem) {
                    return (
                      <SystemMessageRow key={message.id} data-messages-region="system-message-row">
                        <strong>Studio ·</strong> {message.content}
                        <div
                          data-wtf-caption="true"
                          style={{ color: "var(--wtf-app-muted-text, #384352)", marginTop: 2 }}
                        >
                          {new Date(message.createdAt).toLocaleString()}
                        </div>
                      </SystemMessageRow>
                    );
                  }
                  return (
                    <MessageRow key={message.id} data-messages-region="message-row">
                      <Meta>
                        <strong>
                          <UserLink
                            username={message.username}
                            displayName={message.displayName}
                          />
                        </strong>{" "}
                        {new Date(message.createdAt).toLocaleString()}
                        {message.pinned ? " · 📌" : ""}
                      </Meta>
                      <Body>{message.content}</Body>
                      {message.senderId !== user?.id ? (
                        <div data-messages-region="message-safety-actions" style={{ marginTop: 4 }}>
                          <Button
                            size="sm"
                            onClick={() => {
                              setReportFeedback(null);
                              setReportReason("");
                              setReportingMessageId(message.id);
                            }}
                          >
                            Report
                          </Button>
                        </div>
                      ) : null}
                      {reportingMessageId === message.id ? (
                        <SafetyPanel data-messages-region="message-report-form">
                          <strong>Report this message to WTF moderators</strong>
                          <Meta>
                            Explain the safety concern. The report is private; this screen does not notify the sender.
                          </Meta>
                          <TextInput
                            aria-label="Why are you reporting this message?"
                            multiline
                            fullWidth
                            value={reportReason}
                            onChange={(event: any) => setReportReason(event.target.value)}
                            placeholder="Describe what happened and why a moderator should review it."
                          />
                          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                            <Button
                              primary
                              disabled={reportReason.trim().length < 10 || reportDmMutation.isPending}
                              onClick={() => reportDmMutation.mutate({
                                messageId: message.id,
                                reason: reportReason.trim(),
                              })}
                            >
                              {reportDmMutation.isPending ? "Sending report..." : "Send private report"}
                            </Button>
                            <Button
                              disabled={reportDmMutation.isPending}
                              onClick={() => {
                                setReportingMessageId(null);
                                setReportReason("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </SafetyPanel>
                      ) : null}
                    </MessageRow>
                  );
                })}
                {activeConversationId && !dmMessages ? <Hourglass size={24} /> : null}
                {activeConversationId && dmMessages && dmMessages.length === 0 && (
                  <UiEmptyState title="No messages yet">
                    Send the first message to start this conversation.
                  </UiEmptyState>
                )}
                {!activeConversationId ? (
                  <UiEmptyState title="Select a conversation">
                    Pick a conversation or start a DM to read and send messages.
                  </UiEmptyState>
                ) : null}
              </MessageList>

              <InputRow data-messages-region="input-row">
                <TextInput
                  aria-label={
                    activeConversationId
                      ? "Direct message text"
                      : "Direct message text disabled until a conversation is selected"
                  }
                  fullWidth
                  value={dmInput}
                  onChange={(e: any) => setDmInput(e.target.value)}
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter" && dmInput.trim() && activeConversationId) {
                      sendDmMutation.mutate(dmInput.trim());
                    }
                  }}
                  placeholder={
                    activeConversationId
                      ? "Send a direct message..."
                      : "Select a conversation first"
                  }
                  disabled={!activeConversationId}
                />
                <div style={{ position: "relative" }}>
                  <Button
                    data-compact-control="true"
                    aria-label="Insert hamster emoji"
                    size="sm"
                    onClick={() => setShowDmEmoji((p) => !p)}
                    disabled={!activeConversationId}
                    title="Insert hamster emoji"
                    style={{ fontSize: 14, padding: "2px 6px", lineHeight: 1 }}
                  >
                    🐹
                  </Button>
                  {showDmEmoji && (
                    <DmEmojiPicker data-messages-region="emoji-picker">
                      <div
                        data-wtf-caption="true"
                        style={{ width: "100%", textAlign: "center", color: "var(--wtf-app-muted-text, #384352)", marginBottom: 2 }}
                      >
                        {HAMSTER_SECTION_LABEL}
                      </div>
                      {HAMSTER_REACTIONS.map((h) => (
                        <button
                          key={h.char}
                          aria-label={`Insert ${h.label}`}
                          title={h.label}
                          onClick={() => {
                            setDmInput((prev) => prev + h.char);
                            setShowDmEmoji(false);
                          }}
                        >
                          {h.char}
                        </button>
                      ))}
                    </DmEmojiPicker>
                  )}
                </div>
                <Button
                  disabled={
                    !activeConversationId ||
                    !dmInput.trim() ||
                    sendDmMutation.isPending
                  }
                  onClick={() => sendDmMutation.mutate(dmInput.trim())}
                >
                  Send message
                </Button>
              </InputRow>
              {reportFeedback ? (
                <Meta role="status" data-messages-region="message-report-feedback">
                  {reportFeedback}
                </Meta>
              ) : null}
            </Main>
          </Layout>
        )}

        {inboxTab === 1 && (
          <div style={{ display: "grid", gap: 8 }} data-messages-region="notification-pane">
            <GroupBox label="Notification Settings" data-messages-region="notification-settings">
              {(notificationPrefs?.definitions ?? []).map((def) => (
                <PreferenceRow key={def.key} data-messages-region="preference-row">
                  <Checkbox
                    aria-label={`Enable ${def.label} notifications`}
                    checked={Boolean(notificationDraftPrefs[def.key])}
                    label={def.label}
                    onChange={() => {
                      setNotificationDraftPrefs((prev) => ({
                        ...prev,
                        [def.key]: !Boolean(prev[def.key]),
                      }));
                      setNotificationPrefsDirty(true);
                    }}
                  />
                  <Meta>{def.description}</Meta>
                </PreferenceRow>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  disabled={!notificationPrefsDirty || saveNotificationPrefsMutation.isPending}
                  onClick={() => saveNotificationPrefsMutation.mutate(notificationDraftPrefs)}
                >
                  {saveNotificationPrefsMutation.isPending
                    ? "Saving..."
                    : "Save Notification Settings"}
                </Button>
              </div>
            </GroupBox>

            <GroupBox label="Notifications" data-messages-region="notifications">
              <div
                data-messages-region="notification-actions"
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <Button
                  size="sm"
                  active={!notificationsUnreadOnly}
                  onClick={() => {
                    logClientSystemEvent({
                      eventType: "notification_center.filter_changed",
                      metadata: { unreadOnly: false },
                    });
                    setNotificationsUnreadOnly(false);
                  }}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  active={notificationsUnreadOnly}
                  onClick={() => {
                    logClientSystemEvent({
                      eventType: "notification_center.filter_changed",
                      metadata: { unreadOnly: true },
                    });
                    setNotificationsUnreadOnly(true);
                  }}
                >
                  Unread
                </Button>
                <Button
                  size="sm"
                  disabled={
                    (notifications?.unreadCount || 0) === 0 ||
                    markAllNotificationsReadMutation.isPending
                  }
                  onClick={() => markAllNotificationsReadMutation.mutate()}
                >
                  {markAllNotificationsReadMutation.isPending
                    ? "Marking..."
                    : "Mark All Read"}
                </Button>
                <Meta>Unread: {notifications?.unreadCount ?? 0}</Meta>
              </div>

              {notificationsLoading ? (
                <Hourglass size={32} />
              ) : (
                <ListPanel data-messages-region="list-panel">
                  {(notifications?.items || []).map((item) => {
                    const isStudio = item.eventKey.startsWith("studio.");
                    const studioId = isStudio
                      ? studioProjectIdFromMetadata(item.metadata)
                      : null;
                    const clickable = studioId != null;
                    return (
                      <NotificationRow
                        key={item.id}
                        $unread={!item.read}
                        $clickable={clickable}
                        data-messages-region="notification-row"
                        data-messages-unread={!item.read ? "true" : undefined}
                        onClick={
                          clickable
                            ? () => handleNotificationClick(item)
                            : undefined
                        }
                      >
                        <NotificationTitle>
                          {item.title}
                          {isStudio ? <StudioBadge>STUDIO</StudioBadge> : null}
                        </NotificationTitle>
                        {item.body ? (
                          <NotificationBody>{item.body}</NotificationBody>
                        ) : null}
                        <NotificationMeta>
                          {item.sourceUsername ? (
                            <span>
                              From:{" "}
                              <UserLink
                                username={item.sourceUsername}
                                displayName={item.sourceDisplayName}
                              />
                            </span>
                          ) : (
                            <span>System</span>
                          )}
                          <span>
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                          <span>{eventKeyLabel(item.eventKey)}</span>
                          {clickable ? <span>· Click to open</span> : null}
                          {!item.read && (
                            <Button
                              size="sm"
                              disabled={markNotificationReadMutation.isPending}
                              onClick={(e: any) => {
                                e.stopPropagation();
                                markNotificationReadMutation.mutate(item.id);
                              }}
                            >
                              Mark read
                            </Button>
                          )}
                        </NotificationMeta>
                      </NotificationRow>
                    );
                  })}
                  {((notifications?.items ?? []).length || 0) === 0 && (
                    <UiEmptyState title="No notifications to show">
                      System, message, Studio, and reward notices will appear here.
                    </UiEmptyState>
                  )}
                </ListPanel>
              )}
            </GroupBox>
          </div>
        )}

        {inboxTab === 2 && canReviewDmReports ? (
          <div data-messages-region="safety-report-pane" style={{ display: "grid", gap: 8 }}>
            <GroupBox label="Open direct-message safety reports">
              <Meta>
                Review the reported message and recipient explanation. Add a note before recording a disposition.
              </Meta>
            </GroupBox>
            {dmReportsLoading ? (
              <Hourglass size={24} />
            ) : (dmReports ?? []).length === 0 ? (
              <UiEmptyState title="No open safety reports">
                New recipient reports will appear here for operator review.
              </UiEmptyState>
            ) : (
              (dmReports ?? []).map((report) => {
                const note = reportReviewNotes[report.id] ?? "";
                return (
                  <SafetyPanel key={report.id} data-messages-region="safety-report-card">
                    <strong>
                      Report #{report.id} · {(report.reporter?.displayName || report.reporter?.username || "WTF user")} reported {(report.sender?.displayName || report.sender?.username || "a sender")}
                    </strong>
                    <Meta>Reported message · {new Date(report.messageCreatedAt).toLocaleString()}</Meta>
                    <Body>“{report.messageContent}”</Body>
                    <Meta>Recipient explanation: {report.reason}</Meta>
                    <TextInput
                      aria-label={`Review note for report ${report.id}`}
                      multiline
                      fullWidth
                      value={note}
                      onChange={(event: any) =>
                        setReportReviewNotes((notes) => ({
                          ...notes,
                          [report.id]: event.target.value,
                        }))
                      }
                      placeholder="Record what you checked and why you chose this disposition."
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <Button
                        primary
                        disabled={note.trim().length < 3 || reviewDmReportMutation.isPending}
                        onClick={() => reviewDmReportMutation.mutate({
                          reportId: report.id,
                          status: "reviewed",
                          note: note.trim(),
                        })}
                      >
                        Mark reviewed
                      </Button>
                      <Button
                        disabled={note.trim().length < 3 || reviewDmReportMutation.isPending}
                        onClick={() => reviewDmReportMutation.mutate({
                          reportId: report.id,
                          status: "dismissed",
                          note: note.trim(),
                        })}
                      >
                        Dismiss report
                      </Button>
                    </div>
                  </SafetyPanel>
                );
              })
            )}
          </div>
        ) : null}
      </TabBody>
      </MessagesSurface>
    </AppWindow>
  );
}
