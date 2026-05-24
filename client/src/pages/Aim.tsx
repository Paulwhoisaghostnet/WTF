import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type DmConversation = {
  id: number;
  title?: string | null;
  unreadCount: number;
  peers: Array<{ username: string; displayName?: string | null }>;
  latestMessage?: { content: string } | null;
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
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 8px;
  min-height: 500px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 8px;
  align-content: start;
`;

const ChatLog = styled(Panel).attrs({ variant: "well" })`
  min-height: 340px;
  padding: 10px;
  overflow: auto;
`;

const BuddyButton = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  text-align: left;
  font-weight: ${(p) => (p.$active ? "bold" : "normal")};
`;

const Message = styled.div<{ $mine?: boolean }>`
  margin: 0 0 8px;
  text-align: ${(p) => (p.$mine ? "right" : "left")};
`;

const Meta = styled.div`
  font-size: 11px;
  color: #444;
`;

export function Aim() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [content, setContent] = useState("");

  const conversationsQuery = useQuery({
    queryKey: ["aim", "conversations"],
    queryFn: () => api.get<DmConversation[]>("/api/messages/dms"),
  });
  const conversations = conversationsQuery.data ?? [];
  const selected = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0] ?? null;
  const messagesQuery = useQuery({
    queryKey: ["aim", "messages", selected?.id],
    enabled: !!selected?.id,
    queryFn: () =>
      api.get<DmMessage[]>(`/api/messages/dms/${selected!.id}/messages`),
  });
  const sendMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/messages/dms/${selected!.id}/messages`, { content }),
    onSuccess: () => {
      setContent("");
      qc.invalidateQueries({ queryKey: ["aim", "messages", selected?.id] });
      qc.invalidateQueries({ queryKey: ["aim", "conversations"] });
    },
  });

  return (
    <AppWindow title="AIM">
      <Shell>
        <GroupBox label="Buddy List">
          {!conversationsQuery.data ? (
            <Hourglass size={24} />
          ) : (
            <Stack>
              {conversations.map((conversation) => {
                const label =
                  conversation.title ||
                  conversation.peers
                    .map((peer) => peer.displayName || peer.username)
                    .join(", ") ||
                  `Chat ${conversation.id}`;
                return (
                  <BuddyButton
                    key={conversation.id}
                    $active={selected?.id === conversation.id}
                    onClick={() => setActiveId(conversation.id)}
                  >
                    {label}
                    {conversation.unreadCount ? ` (${conversation.unreadCount})` : ""}
                  </BuddyButton>
                );
              })}
              {conversations.length === 0 ? <Meta>No buddies yet.</Meta> : null}
            </Stack>
          )}
        </GroupBox>

        <Stack>
          <GroupBox label={selected ? `Chat ${selected.id}` : "Chat"}>
            <ChatLog>
              {(messagesQuery.data ?? []).map((message) => (
                <Message key={message.id} $mine={message.senderId === user?.id}>
                  <Meta>{message.displayName || message.username || "WTF user"}</Meta>
                  <div>{message.content}</div>
                </Message>
              ))}
              {selected && !messagesQuery.data ? <Hourglass size={20} /> : null}
              {!selected ? <Meta>Select a buddy.</Meta> : null}
            </ChatLog>
          </GroupBox>
          <div style={{ display: "flex", gap: 6 }}>
            <TextInput
              value={content}
              placeholder="Message"
              onChange={(event: any) => setContent(event.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              disabled={!selected || !content.trim() || sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
            >
              Send
            </Button>
          </div>
        </Stack>
      </Shell>
    </AppWindow>
  );
}
