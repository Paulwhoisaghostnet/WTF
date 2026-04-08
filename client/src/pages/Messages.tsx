import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel, Select, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UserLink } from "../components/UserLink";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { ROLE_LABELS, type UserRole } from "@shared/types";

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

export function Messages() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [dmInput, setDmInput] = useState("");
  const [targetUserId, setTargetUserId] = useState<number | null>(null);

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

  useEffect(() => {
    if (!activeConversationId && dmConversations && dmConversations.length > 0) {
      setActiveConversationId(dmConversations[0].id);
    }
  }, [activeConversationId, dmConversations]);

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

  return (
    <AppWindow title="Inbox">
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
                  <strong><UserLink username={message.username} displayName={message.displayName} /></strong>{" "}
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
    </AppWindow>
  );
}
