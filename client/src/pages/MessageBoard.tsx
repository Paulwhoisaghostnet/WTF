import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox, GroupBox, Hourglass, Panel, TextInput } from "react95";
import styled from "styled-components";
import { Link } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { UserLink } from "../components/UserLink";
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
  width: 280px;
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
  min-height: 260px;
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
const moderatorRoles: UserRole[] = ["admin", "host", "cohost"];

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
  active: boolean;
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

export function MessageBoard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isModerator = !!user && moderatorRoles.includes(user.role);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [threadReply, setThreadReply] = useState("");
  const [threadTitle, setThreadTitle] = useState("");
  const [threadBody, setThreadBody] = useState("");
  const [threadExpiry, setThreadExpiry] = useState("");
  const [viewRoles, setViewRoles] = useState<UserRole[]>([...roleOptions]);
  const [replyRoles, setReplyRoles] = useState<UserRole[]>([...roleOptions]);

  const { data: threadList, isLoading: threadLoading } = useQuery({
    queryKey: ["messages", "threads"],
    queryFn: () => api.get<ThreadSummary[]>("/api/messages/threads"),
    refetchInterval: 8000,
  });
  const { data: activeThread } = useQuery({
    queryKey: ["messages", "thread", activeThreadId],
    queryFn: () => api.get<ThreadDetail>(`/api/messages/threads/${activeThreadId}`),
    enabled: !!activeThreadId,
  });

  useEffect(() => {
    if (!activeThreadId && threadList && threadList.length > 0) {
      setActiveThreadId(threadList[0].id);
    }
  }, [activeThreadId, threadList]);

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

  const modUpdateMutation = useMutation({
    mutationFn: (payload: { pinned?: boolean; locked?: boolean; active?: boolean }) =>
      api.put(`/api/messages/threads/${activeThreadId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", "threads"] });
      qc.invalidateQueries({ queryKey: ["messages", "thread", activeThreadId] });
    },
  });

  if (threadLoading) {
    return (
      <AppWindow title="Message Board">
        <Hourglass size={32} />
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Message Board">
      <Layout>
        <Side>
          <GroupBox label="Board Threads" style={{ flex: 1 }}>
            <ListPanel>
              {threadList?.map((thread) => (
                <ItemButton
                  key={thread.id}
                  size="sm"
                  $active={thread.id === activeThreadId}
                  onClick={() => setActiveThreadId(thread.id)}
                  style={thread.active === false ? { opacity: 0.5, fontStyle: "italic" } : undefined}
                >
                  {thread.active === false ? "[Archived] " : ""}
                  {thread.pinned ? "[Pinned] " : ""}
                  {thread.locked ? "[Locked] " : ""}
                  {thread.title}
                  {thread.replyCount > 0 ? ` (${thread.replyCount})` : ""}
                </ItemButton>
              ))}
              {(!threadList || threadList.length === 0) && <Meta>No threads available.</Meta>}
            </ListPanel>
          </GroupBox>
        </Side>

        <Main>
          {isModerator && (
            <GroupBox label="New Bulletin">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <TextInput
                  value={threadTitle}
                  onChange={(e: any) => setThreadTitle(e.target.value)}
                  placeholder="Post title"
                  fullWidth
                />
                <TextInput
                  value={threadBody}
                  onChange={(e: any) => setThreadBody(e.target.value)}
                  placeholder="Post body"
                  multiline
                  fullWidth
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ minWidth: 90, fontSize: 11 }}>Expires</label>
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
                    Post Bulletin
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
                    by{" "}
                    <UserLink username={activeThread.creatorUsername} displayName={activeThread.creatorDisplayName} />{" "}
                    · {new Date(activeThread.createdAt).toLocaleString()}
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

                {isModerator && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button
                      size="sm"
                      onClick={() => modUpdateMutation.mutate({ pinned: !activeThread.pinned })}
                    >
                      {activeThread.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => modUpdateMutation.mutate({ locked: !activeThread.locked })}
                    >
                      {activeThread.locked ? "Unlock" : "Lock"}
                    </Button>
                    {activeThread.active === false ? (
                      <Button
                        size="sm"
                        onClick={() => modUpdateMutation.mutate({ active: true })}
                      >
                        Unarchive
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => modUpdateMutation.mutate({ active: false })}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                )}

                <ThreadBody>{activeThread.body}</ThreadBody>

                <MessageList>
                  {activeThread.replies.map((reply) => (
                    <MessageRow key={reply.id}>
                      <Meta>
                        <strong>
                          <UserLink username={reply.username} displayName={reply.displayName} />
                        </strong>{" "}
                        [{ROLE_LABELS[reply.role]}] ·{" "}
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
                      !user
                        ? "Log in to reply..."
                        : activeThread.canReply
                        ? "Reply to this thread..."
                        : "Your role cannot reply in this thread"
                    }
                    disabled={!user || !activeThread.canReply}
                  />
                  <Button
                    disabled={
                      !user ||
                      !activeThread.canReply ||
                      !threadReply.trim() ||
                      sendThreadReplyMutation.isPending
                    }
                    onClick={() => sendThreadReplyMutation.mutate(threadReply.trim())}
                  >
                    Reply
                  </Button>
                </InputRow>
                {!user && (
                  <Meta>
                    Log in to reply. Reading the board is public.
                  </Meta>
                )}
              </div>
            )}
          </GroupBox>
        </Main>
      </Layout>
    </AppWindow>
  );
}
