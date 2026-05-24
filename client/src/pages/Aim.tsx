import { useEffect, useMemo, useState } from "react";
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
  --wim-navy: #06135f;
  --wim-blue: #0b42c4;
  --wim-cyan: #73ecff;
  --wim-paper: #f4f1df;
  --wim-ink: #060b24;

  display: grid;
  grid-template-columns: minmax(190px, 260px) minmax(0, 1fr);
  gap: 10px;
  min-height: 520px;
  color: var(--wim-ink);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    min-height: auto;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 8px;
  align-content: start;
`;

const BrandPanel = styled(Panel).attrs({ variant: "well" })`
  padding: 10px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(186, 228, 255, 0.8)),
    repeating-linear-gradient(0deg, rgba(6, 19, 95, 0.06) 0 1px, transparent 1px 4px);
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
    font-size: 8px;
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
  font-size: 11px;
  color: #26315f;
`;

const StatStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
`;

const Stat = styled(Panel).attrs({ variant: "well" })`
  padding: 6px;
  min-height: 42px;
  background: #fffdf2;
`;

const StatLabel = styled.div`
  font-size: 10px;
  color: #4b557b;
  text-transform: uppercase;
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
  padding: 12px;
  overflow: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 241, 223, 0.95)),
    repeating-linear-gradient(90deg, rgba(6, 19, 95, 0.05) 0 1px, transparent 1px 16px);
`;

const BuddyButton = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  text-align: left;
  min-height: 42px;
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
  font-size: 11px;
  color: #4b557b;
`;

const BuddyName = styled.div`
  overflow-wrap: anywhere;
`;

const BuddyPreview = styled.div`
  margin-top: 2px;
  font-size: 11px;
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
  background: linear-gradient(90deg, #fffdf2, #dff7ff);
`;

const ChatTitle = styled.div`
  font-size: 16px;
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

function shortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function reportWimEvent(
  eventType: "wim.chat.opened" | "wim.message.sent",
  conversationId: number,
  metadata: Record<string, unknown> = {}
) {
  void api
    .post<{ ok: true }>("/api/desktop/events", {
      eventType,
      objectId: `wim:${conversationId}`,
      objectKind: "messenger",
      action: eventType === "wim.chat.opened" ? "opened" : "sent",
      metadata,
    })
    .catch(() => {
      // Telemetry is useful, but messaging must stay usable when logging is not.
    });
}

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
  const selected =
    conversations.find((conversation) => conversation.id === activeId) ??
    conversations[0] ??
    null;
  const selectedLabel = selected ? conversationLabel(selected) : "No chat selected";
  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations]
  );
  const messagesQuery = useQuery({
    queryKey: ["aim", "messages", selected?.id],
    enabled: !!selected?.id,
    queryFn: () =>
      api.get<DmMessage[]>(`/api/messages/dms/${selected!.id}/messages?limit=100`),
  });
  const sendMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/messages/dms/${selected!.id}/messages`, { content: content.trim() }),
    onSuccess: () => {
      if (selected?.id) {
        reportWimEvent("wim.message.sent", selected.id, { messageLength: content.trim().length });
      }
      setContent("");
      qc.invalidateQueries({ queryKey: ["aim", "messages", selected?.id] });
      qc.invalidateQueries({ queryKey: ["aim", "conversations"] });
    },
  });

  useEffect(() => {
    if (!selected?.id) return;
    reportWimEvent("wim.chat.opened", selected.id, {
      peerCount: selected.peers.length,
      unreadCount: selected.unreadCount,
    });
  }, [selected?.id]);

  const submitMessage = () => {
    if (!selected || !content.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
  };

  return (
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
              <StatLabel>Chats</StatLabel>
              <StatValue>{conversations.length}</StatValue>
            </Stat>
            <Stat>
              <StatLabel>Unread</StatLabel>
              <StatValue>{unreadTotal}</StatValue>
            </Stat>
          </StatStrip>
          <GroupBox label="Buddy List">
            {!conversationsQuery.data ? (
              <Hourglass size={24} />
            ) : conversationsQuery.isError ? (
              <Meta>Buddy list failed to load.</Meta>
            ) : (
              <Stack>
                {conversations.map((conversation) => {
                  const label = conversationLabel(conversation);
                  return (
                    <BuddyButton
                      key={conversation.id}
                      $active={selected?.id === conversation.id}
                      onClick={() => setActiveId(conversation.id)}
                    >
                      <BuddyName>
                        {label}
                        {conversation.unreadCount ? ` (${conversation.unreadCount})` : ""}
                      </BuddyName>
                      {conversation.latestMessage?.content ? (
                        <BuddyPreview>{conversation.latestMessage.content}</BuddyPreview>
                      ) : null}
                    </BuddyButton>
                  );
                })}
                {conversations.length === 0 ? <Meta>No buddies yet.</Meta> : null}
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
                  ? `${selected.peers.length || 1} participant${selected.peers.length === 1 ? "" : "s"}`
                  : "Pick a conversation"}
              </Meta>
            </div>
            <WimMark aria-hidden />
          </ChatHeader>
          <GroupBox label="Messages">
            <ChatLog>
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
              {selected && messagesQuery.isLoading ? <Hourglass size={20} /> : null}
              {selected && messagesQuery.isError ? <Meta>Messages failed to load.</Meta> : null}
              {selected && messagesQuery.data?.length === 0 ? <Meta>No messages in this chat yet.</Meta> : null}
              {!selected ? <Meta>Select a buddy.</Meta> : null}
            </ChatLog>
          </GroupBox>
          <Composer
            onSubmit={(event) => {
              event.preventDefault();
              submitMessage();
            }}
          >
            <TextInput
              value={content}
              placeholder="Message"
              onChange={(event: any) => setContent(event.target.value)}
              disabled={!selected || sendMutation.isPending}
              style={{ width: "100%" }}
            />
            <Button
              disabled={!selected || !content.trim() || sendMutation.isPending}
              type="submit"
            >
              {sendMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </Composer>
          {sendMutation.isError ? <Meta>Message failed to send.</Meta> : null}
        </Stack>
      </Shell>
    </AppWindow>
  );
}
