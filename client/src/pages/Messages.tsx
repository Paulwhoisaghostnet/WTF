import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { UserLink } from "../components/UserLink";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { ROLE_LABELS, type UserRole } from "@shared/types";
import { MOBILE } from "../global-styles";

const Layout = styled.div`
  display: flex;
  gap: 8px;
  height: 100%;
  min-height: 460px;

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
  gap: 8px;

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
  gap: 8px;

  ${MOBILE} {
    display: ${(p) => (p.$mobileHidden ? "none" : "flex")};
  }
`;

const ListPanel = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  min-height: 220px;
`;

const ItemButton = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  text-align: left;
  margin-bottom: 4px;
  ${(p) => p.$active && "font-weight: bold;"}
`;

const MessageList = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  min-height: 220px;
`;

const MessageRow = styled.div`
  margin-bottom: 10px;
`;

const Meta = styled.div`
  font-size: 11px;
  color: #555;
`;

const Body = styled.div`
  font-size: 13px;
  margin-top: 2px;
  word-break: break-word;
`;

const InputRow = styled.div`
  display: flex;
  gap: 6px;
`;

const MobileBackButton = styled(Button)`
  display: none !important;
  align-self: flex-start;
  margin-bottom: 4px;

  ${MOBILE} {
    display: inline-block !important;
  }
`;

const NotificationRow = styled.div<{ $unread?: boolean }>`
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1px solid #9a9a9a;
  background: ${(p) => (p.$unread ? "#fff8d5" : "#f3f3f3")};
`;

const NotificationTitle = styled.div`
  font-size: 12px;
  font-weight: bold;
`;

const NotificationBody = styled.div`
  margin-top: 3px;
  font-size: 12px;
`;

const NotificationMeta = styled.div`
  margin-top: 4px;
  font-size: 10px;
  color: #555;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const PreferenceRow = styled.div`
  margin-bottom: 8px;
  padding: 6px;
  border: 1px solid #9a9a9a;
  background: #efefef;
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
}

interface DmMessage {
  id: number;
  senderId: number;
  username?: string;
  displayName?: string;
  content: string;
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

export function Messages() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [inboxTab, setInboxTab] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [dmInput, setDmInput] = useState("");
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [notificationsUnreadOnly, setNotificationsUnreadOnly] = useState(false);
  const [notificationDraftPrefs, setNotificationDraftPrefs] = useState<
    Record<string, boolean>
  >({});
  const [notificationPrefsDirty, setNotificationPrefsDirty] = useState(false);

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

  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationId: number) =>
      api.put(`/api/notifications/${notificationId}/read`, { read: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllNotificationsReadMutation = useMutation({
    mutationFn: () => api.put("/api/notifications/read-all", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const saveNotificationPrefsMutation = useMutation({
    mutationFn: (preferences: Record<string, boolean>) =>
      api.put<NotificationPreferencesResponse>("/api/notifications/preferences", {
        preferences,
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["notifications", "preferences"], updated);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setNotificationDraftPrefs(updated.preferences || {});
      setNotificationPrefsDirty(false);
    },
  });

  if (dmLoading) {
    return (
      <AppWindow title="Inbox">
        <Hourglass size={32} />
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

  return (
    <AppWindow title="Inbox">
      <Tabs value={inboxTab} onChange={(v: number) => setInboxTab(v)}>
        <Tab value={0}>Direct Messages</Tab>
        <Tab value={1}>
          Notifications{unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ""}
        </Tab>
      </Tabs>

      <TabBody>
        {inboxTab === 0 && (
          <Layout>
            <Side $mobileHidden={mobileView === "chat"}>
              <GroupBox label="Start DM">
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
                    Open
                  </Button>
                </div>
              </GroupBox>

              <GroupBox label="Conversations" style={{ flex: 1 }}>
                <ListPanel>
                  {dmConversations?.map((conversation) => {
                    const peerNames =
                      conversation.peers.length > 0
                        ? conversation.peers
                            .map((peer) => peer.displayName || peer.username)
                            .join(", ")
                        : "Unknown";

                    return (
                      <ItemButton
                        key={conversation.id}
                        size="sm"
                        $active={conversation.id === activeConversationId}
                        onClick={() => selectConversation(conversation.id)}
                      >
                        {peerNames}
                        {conversation.unreadCount > 0 ? ` (${conversation.unreadCount})` : ""}
                      </ItemButton>
                    );
                  })}
                  {(!dmConversations || dmConversations.length === 0) && (
                    <Meta>No direct messages yet.</Meta>
                  )}
                </ListPanel>
              </GroupBox>
            </Side>

            <Main $mobileHidden={mobileView === "list"}>
              <MobileBackButton
                size="sm"
                onClick={() => setMobileView("list")}
              >
                ← Back
              </MobileBackButton>
              <GroupBox label="Conversation">
                <Meta>
                  {currentDm
                    ? `Talking with ${
                        currentDm.peers
                          .map((p) => p.displayName || p.username)
                          .join(", ") || "Unknown"
                      }`
                    : "Select or start a conversation"}
                </Meta>
              </GroupBox>

              <MessageList>
                {dmMessages?.map((message) => (
                  <MessageRow key={message.id}>
                    <Meta>
                      <strong>
                        <UserLink
                          username={message.username}
                          displayName={message.displayName}
                        />
                      </strong>{" "}
                      {new Date(message.createdAt).toLocaleString()}
                    </Meta>
                    <Body>{message.content}</Body>
                  </MessageRow>
                ))}
                {activeConversationId && (!dmMessages || dmMessages.length === 0) && (
                  <Meta>No messages yet.</Meta>
                )}
              </MessageList>

              <InputRow>
                <TextInput
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
                <Button
                  disabled={
                    !activeConversationId ||
                    !dmInput.trim() ||
                    sendDmMutation.isPending
                  }
                  onClick={() => sendDmMutation.mutate(dmInput.trim())}
                >
                  Send
                </Button>
              </InputRow>
            </Main>
          </Layout>
        )}

        {inboxTab === 1 && (
          <div style={{ display: "grid", gap: 8 }}>
            <GroupBox label="Notification Settings">
              {notificationPrefs?.definitions.map((def) => (
                <PreferenceRow key={def.key}>
                  <Checkbox
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

            <GroupBox label="Notifications">
              <div
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
                  onClick={() => setNotificationsUnreadOnly(false)}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  active={notificationsUnreadOnly}
                  onClick={() => setNotificationsUnreadOnly(true)}
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
                <ListPanel>
                  {(notifications?.items || []).map((item) => (
                    <NotificationRow key={item.id} $unread={!item.read}>
                      <NotificationTitle>{item.title}</NotificationTitle>
                      {item.body ? <NotificationBody>{item.body}</NotificationBody> : null}
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
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                        <span>{item.eventKey}</span>
                        {!item.read && (
                          <Button
                            size="sm"
                            disabled={markNotificationReadMutation.isPending}
                            onClick={() => markNotificationReadMutation.mutate(item.id)}
                          >
                            Mark Read
                          </Button>
                        )}
                      </NotificationMeta>
                    </NotificationRow>
                  ))}
                  {(notifications?.items.length || 0) === 0 && (
                    <Meta>No notifications to show.</Meta>
                  )}
                </ListPanel>
              )}
            </GroupBox>
          </div>
        )}
      </TabBody>
    </AppWindow>
  );
}
