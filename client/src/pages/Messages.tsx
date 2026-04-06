import { useState, useEffect } from "react";
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
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { ROLE_LABELS, ROLE_ORDER, type UserRole } from "@shared/types";

const Layout = styled.div`
  display: flex;
  gap: 8px;
  height: 100%;
  min-height: 460px;
`;

const Side = styled.div`
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Main = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

const RoleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 4px 8px;
`;

const ThreadBody = styled(Panel).attrs({ variant: "well" })`
  padding: 8px;
  white-space: pre-wrap;
  font-size: 13px;
`;

const roleOptions = [...ROLE_ORDER];

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

interface ThreadSummary {
  id: number;
  title: string;
  body: string;
  creatorUsername?: string | null;
  creatorDisplayName?: string | null;
  viewRoles: UserRole[];
  replyRoles: UserRole[];
  replyCount: number;
  pinned: boolean;
  locked: boolean;
  expired: boolean;
  canReply: boolean;
  createdAt: string;
}

interface ThreadDetail extends ThreadSummary {
  replies: Array<{
    id: number;
    userId: number;
    username?: string;
    displayName?: string;
    role: UserRole;
    content: string;
    createdAt: string;
  }>;
}

function toggleRole(list: UserRole[], role: UserRole): UserRole[] {
  if (list.includes(role)) return list.filter((r) => r !== role);
  return [...list, role];
}

export function Messages() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState(0);

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);

  const [dmInput, setDmInput] = useState("");
  const [threadReply, setThreadReply] = useState("");

  const [targetUserId, setTargetUserId] = useState<number | null>(null);

  const [threadTitle, setThreadTitle] = useState("");
  const [threadBody, setThreadBody] = useState("");
  const [threadExpiry, setThreadExpiry] = useState("");
  const [viewRoles, setViewRoles] = useState<UserRole[]>([...roleOptions]);
  const [replyRoles, setReplyRoles] = useState<UserRole[]>([...roleOptions]);

  const { data: messageUsers } = useQuery({
    queryKey: ["messages", "users"],
    queryFn: () => api.get<MessageUser[]>("/api/messages/users?limit=200"),
    enabled: !!user,
  });

  const { data: dmConversations, isLoading: dmLoading } = useQuery({
    queryKey: ["messages", "dms"],
    queryFn: () => api.get<DmConversation[]>("/api/messages/dms"),
    enabled: !!user,
    refetchInterval: 6000,
  });

  const { data: dmMessages } = useQuery({
    queryKey: ["messages", "dms", activeConversationId],
    queryFn: () => api.get<DmMessage[]>(`/api/messages/dms/${activeConversationId}/messages?limit=100`),
    enabled: !!activeConversationId,
    refetchInterval: 4000,
  });

  const { data: threadList, isLoading: threadLoading } = useQuery({
    queryKey: ["messages", "threads"],
    queryFn: () => api.get<ThreadSummary[]>("/api/messages/threads"),
    enabled: !!user,
    refetchInterval: 8000,
  });

  const { data: activeThread } = useQuery({
    queryKey: ["messages", "thread", activeThreadId],
    queryFn: () => api.get<ThreadDetail>(`/api/messages/threads/${activeThreadId}`),
    enabled: !!activeThreadId,
  });

  useEffect(() => {
    if (!activeConversationId && dmConversations && dmConversations.length > 0) {
      setActiveConversationId(dmConversations[0].id);
    }
  }, [activeConversationId, dmConversations]);

  useEffect(() => {
    if (!activeThreadId && threadList && threadList.length > 0) {
      setActiveThreadId(threadList[0].id);
    }
  }, [activeThreadId, threadList]);

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

  const createThreadMutation = useMutation({
    mutationFn: () =>
      api.post<ThreadSummary>("/api/messages/threads", {
        title: threadTitle,
        body: threadBody,
        viewRoles,
        replyRoles,
        expiresAt: threadExpiry ? new Date(threadExpiry).toISOString() : null,
      }),
    onSuccess: (thread) => {
      qc.invalidateQueries({ queryKey: ["messages", "threads"] });
      setActiveThreadId(thread.id);
      setThreadTitle("");
      setThreadBody("");
      setThreadExpiry("");
      setViewRoles([...roleOptions]);
      setReplyRoles([...roleOptions]);
    },
  });

  const sendThreadReplyMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/api/messages/threads/${activeThreadId}/replies`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", "threads"] });
      qc.invalidateQueries({ queryKey: ["messages", "thread", activeThreadId] });
      setThreadReply("");
    },
  });

  if (dmLoading && threadLoading) {
    return (
      <AppWindow title="Messages">
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

  return (
    <AppWindow title="Messages">
      <Tabs value={tab} onChange={(value: number) => setTab(value)}>
        <Tab value={0}>Direct Messages</Tab>
        <Tab value={1}>Role Threads</Tab>
      </Tabs>

      <TabBody style={{ height: "100%" }}>
        {tab === 0 && (
          <Layout>
            <Side>
              <GroupBox label="Start DM">
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <Select
                    width={190}
                    value={targetUserId ?? undefined}
                    options={dmOptions}
                    onChange={(e: any) => setTargetUserId(Number(e.value))}
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
                        onClick={() => setActiveConversationId(conversation.id)}
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

            <Main>
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
                      <strong>{message.displayName || message.username || "Unknown"}</strong>{" "}
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
                  placeholder={activeConversationId ? "Send a direct message..." : "Select a conversation first"}
                  disabled={!activeConversationId}
                />
                <Button
                  disabled={!activeConversationId || !dmInput.trim() || sendDmMutation.isPending}
                  onClick={() => sendDmMutation.mutate(dmInput.trim())}
                >
                  Send
                </Button>
              </InputRow>
            </Main>
          </Layout>
        )}

        {tab === 1 && (
          <Layout>
            <Side>
              <GroupBox label="Threads" style={{ flex: 1 }}>
                <ListPanel>
                  {threadList?.map((thread) => (
                    <ItemButton
                      key={thread.id}
                      size="sm"
                      $active={thread.id === activeThreadId}
                      onClick={() => setActiveThreadId(thread.id)}
                    >
                      {thread.pinned ? "[Pinned] " : ""}
                      {thread.title}
                      {thread.replyCount > 0 ? ` (${thread.replyCount})` : ""}
                    </ItemButton>
                  ))}
                  {(!threadList || threadList.length === 0) && <Meta>No threads available.</Meta>}
                </ListPanel>
              </GroupBox>
            </Side>

            <Main>
              {isAdmin && (
                <GroupBox label="Create Thread">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <TextInput
                      value={threadTitle}
                      onChange={(e: any) => setThreadTitle(e.target.value)}
                      placeholder="Thread title"
                      fullWidth
                    />
                    <TextInput
                      value={threadBody}
                      onChange={(e: any) => setThreadBody(e.target.value)}
                      placeholder="Thread body"
                      multiline
                      fullWidth
                    />
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <label style={{ minWidth: 90, fontSize: 11 }}>Expires (optional)</label>
                      <TextInput
                        type="datetime-local"
                        value={threadExpiry}
                        onChange={(e: any) => setThreadExpiry(e.target.value)}
                      />
                    </div>
                    <Meta>Who can view:</Meta>
                    <RoleGrid>
                      {roleOptions.map((role) => (
                        <Checkbox
                          key={`view-${role}`}
                          label={ROLE_LABELS[role]}
                          checked={viewRoles.includes(role)}
                          onChange={() => setViewRoles((prev) => toggleRole(prev, role))}
                        />
                      ))}
                    </RoleGrid>
                    <Meta>Who can reply:</Meta>
                    <RoleGrid>
                      {roleOptions.map((role) => (
                        <Checkbox
                          key={`reply-${role}`}
                          label={ROLE_LABELS[role]}
                          checked={replyRoles.includes(role)}
                          onChange={() => setReplyRoles((prev) => toggleRole(prev, role))}
                        />
                      ))}
                    </RoleGrid>
                    <div>
                      <Button
                        disabled={
                          !threadTitle.trim() ||
                          !threadBody.trim() ||
                          viewRoles.length === 0 ||
                          replyRoles.length === 0 ||
                          createThreadMutation.isPending
                        }
                        onClick={() => createThreadMutation.mutate()}
                      >
                        Post Thread
                      </Button>
                    </div>
                  </div>
                </GroupBox>
              )}

              <GroupBox label="Thread">
                {!activeThread && <Meta>Select a thread.</Meta>}

                {activeThread && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: "bold", fontSize: 14 }}>{activeThread.title}</div>
                      <Meta>
                        by {activeThread.creatorDisplayName || activeThread.creatorUsername || "Unknown"} ·{" "}
                        {new Date(activeThread.createdAt).toLocaleString()}
                      </Meta>
                      <Meta>
                        View: {activeThread.viewRoles.map((r) => ROLE_LABELS[r]).join(", ")}
                      </Meta>
                      <Meta>
                        Reply: {activeThread.replyRoles.map((r) => ROLE_LABELS[r]).join(", ")}
                      </Meta>
                      {activeThread.expired && <Meta>This thread is expired.</Meta>}
                      {activeThread.locked && <Meta>This thread is locked.</Meta>}
                    </div>

                    <ThreadBody>{activeThread.body}</ThreadBody>

                    <MessageList>
                      {activeThread.replies.map((reply) => (
                        <MessageRow key={reply.id}>
                          <Meta>
                            <strong>{reply.displayName || reply.username || "Unknown"}</strong> [{ROLE_LABELS[reply.role]}] ·{" "}
                            {new Date(reply.createdAt).toLocaleString()}
                          </Meta>
                          <Body>{reply.content}</Body>
                        </MessageRow>
                      ))}
                      {activeThread.replies.length === 0 && <Meta>No replies yet.</Meta>}
                    </MessageList>

                    <InputRow>
                      <TextInput
                        fullWidth
                        value={threadReply}
                        onChange={(e: any) => setThreadReply(e.target.value)}
                        onKeyDown={(e: any) => {
                          if (e.key === "Enter" && threadReply.trim() && activeThread.canReply) {
                            sendThreadReplyMutation.mutate(threadReply.trim());
                          }
                        }}
                        placeholder={
                          activeThread.canReply
                            ? "Reply to this thread..."
                            : "Your role cannot reply in this thread"
                        }
                        disabled={!activeThread.canReply}
                      />
                      <Button
                        disabled={
                          !activeThread.canReply ||
                          !threadReply.trim() ||
                          sendThreadReplyMutation.isPending
                        }
                        onClick={() => sendThreadReplyMutation.mutate(threadReply.trim())}
                      >
                        Reply
                      </Button>
                    </InputRow>
                  </div>
                )}
              </GroupBox>
            </Main>
          </Layout>
        )}
      </TabBody>
    </AppWindow>
  );
}
