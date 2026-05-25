import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel, TextInput } from "react95";
import { ChevronDown, ChevronRight, MessageCircle, UserPlus, Users } from "lucide-react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
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
};

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
  latestMessage?: { content: string; createdAt?: string } | null;
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
  --wim-paper: #f7f3dd;
  --wim-ink: #060b24;

  display: grid;
  grid-template-columns: minmax(230px, 310px) minmax(0, 1fr);
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
    linear-gradient(180deg, #ffffff 0%, #d7edff 52%, #93bdf5 100%),
    repeating-linear-gradient(0deg, rgba(6, 19, 95, 0.08) 0 1px, transparent 1px 4px);
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

const ScreenNamePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 7px 8px;
  background: #fffdf2;
  display: grid;
  gap: 3px;
`;

const ScreenName = styled.div`
  font-size: 13px;
  font-weight: 900;
  overflow-wrap: anywhere;
`;

const StatStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

const SectionToggle = styled(Button)`
  width: 100%;
  min-height: 25px;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 6px;
  font-weight: 900;
  color: #ffffff;
  background: linear-gradient(180deg, #264fc4 0%, #07156f 100%);
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
  font-size: 10px;
  font-weight: 900;
`;

const DirectoryPanel = styled(Panel).attrs({ variant: "well" })`
  padding: 6px;
  max-height: 310px;
  overflow: auto;
  background:
    linear-gradient(180deg, rgba(255, 253, 242, 0.96), rgba(234, 245, 255, 0.96)),
    repeating-linear-gradient(0deg, rgba(7, 21, 111, 0.06) 0 1px, transparent 1px 18px);
`;

const UserRow = styled.div<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  min-height: 36px;
  padding: 4px 5px;
  margin-bottom: 3px;
  border: 1px solid ${(p) => (p.$active ? "#07156f" : "transparent")};
  background: ${(p) => (p.$active ? "#dcecff" : "rgba(255, 255, 255, 0.58)")};
  cursor: default;

  &:hover {
    border-color: #8a8a8a;
    background: #fff8c9;
  }
`;

const OnlineDot = styled.span<{ $online?: boolean }>`
  width: 10px;
  height: 10px;
  border: 1px solid #050b24;
  background: ${(p) => (p.$online ? "#20e45a" : "#9b9b9b")};
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.7);
`;

const UserName = styled.div`
  font-size: 12px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const UserHandle = styled.div`
  font-size: 10px;
  color: #4b557b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const UserActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 3px;
`;

const IconButton = styled.button`
  width: 24px;
  min-width: 24px;
  height: 23px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px outset #ffffff;
  background: #d6d6d6;
  color: #050b24;
  box-shadow: 1px 1px 0 #000000;
  cursor: pointer;

  &:active {
    border-style: inset;
    box-shadow: inset 1px 1px 0 #808080;
  }

  &:disabled {
    color: #808080;
    cursor: default;
    opacity: 0.7;
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

export function Aim() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activePeerId, setActivePeerId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [friendIds, setFriendIds] = useState<number[]>([]);
  const [friendsReady, setFriendsReady] = useState(false);
  const [sections, setSections] = useState({
    friends: true,
    online: true,
    all: true,
    recent: false,
  });

  const conversationsQuery = useQuery({
    queryKey: ["aim", "conversations", "direct"],
    queryFn: () => api.get<DmConversation[]>("/api/messages/dms?type=direct"),
    refetchInterval: 15_000,
  });

  const usersQuery = useQuery({
    queryKey: ["aim", "users"],
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
  const wtfUsers = usersQuery.data ?? [];
  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);
  const friends = wtfUsers.filter((item) => friendIdSet.has(item.id));
  const onlineUsers = wtfUsers.filter(
    (item) => item.online && !friendIdSet.has(item.id)
  );
  const filteredUsers = wtfUsers.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${item.username} ${item.displayName ?? ""}`.toLowerCase().includes(q);
  });
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
  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations]
  );

  const messagesQuery = useQuery({
    queryKey: ["aim", "messages", activeConversationId],
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
      qc.invalidateQueries({ queryKey: ["aim", "messages", activeConversationId] });
      qc.invalidateQueries({ queryKey: ["aim", "conversations", "direct"] });
    },
  });

  const openChatMutation = useMutation({
    mutationFn: (targetUserId: number) =>
      api.post<{ id: number }>("/api/messages/dms", { targetUserId }),
    onSuccess: (conversation, targetUserId) => {
      setActivePeerId(targetUserId);
      setActiveId(conversation.id);
      qc.invalidateQueries({ queryKey: ["aim", "conversations", "direct"] });
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
    if (!activeConversationId) return;
    reportWimEvent("wim.chat.opened", activeConversationId, {
      peerCount: selected?.peers.length ?? (activePeerId ? 1 : 0),
      unreadCount: selected?.unreadCount ?? 0,
    });
  }, [activeConversationId, activePeerId, selected?.peers.length, selected?.unreadCount]);

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

  const openDirectChat = (target: MessageUser) => {
    setActivePeerId(target.id);
    const existing = conversations.find((conversation) =>
      conversation.peers.some((peer) => peerId(peer) === target.id)
    );
    if (existing) {
      setActiveId(existing.id);
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
    return (
      <UserRow
        key={item.id}
        $active={active}
        tabIndex={0}
        onDoubleClickCapture={() => openDirectChat(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter") openDirectChat(item);
        }}
      >
        <OnlineDot $online={item.online} title={item.online ? "Online" : "Offline"} />
        <div>
          <UserName>{userLabel(item)}</UserName>
          <UserHandle>@{item.username}</UserHandle>
        </div>
        <UserActions>
          {!isFriend ? (
            <IconButton
              type="button"
              title="Add friend"
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
            title="Open chat"
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
              <StatLabel>Online</StatLabel>
              <StatValue>{wtfUsers.filter((item) => item.online).length}</StatValue>
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
              <Meta>Buddy list failed to load.</Meta>
            ) : (
              <Stack>
                {renderSectionToggle("friends", "My Friends", friends.length)}
                {sections.friends ? (
                  <DirectoryPanel>
                    {friends.length ? friends.map(renderUserRow) : <Meta>No friends saved.</Meta>}
                  </DirectoryPanel>
                ) : null}

                {renderSectionToggle("online", "Online WTF Users", onlineUsers.length)}
                {sections.online ? (
                  <DirectoryPanel>
                    {onlineUsers.length ? onlineUsers.map(renderUserRow) : <Meta>No one else is online.</Meta>}
                  </DirectoryPanel>
                ) : null}

                {renderSectionToggle("all", "All WTF Users", filteredUsers.length)}
                {sections.all ? (
                  <DirectoryPanel>
                    <MiniInput
                      value={search}
                      placeholder="Find user"
                      onChange={(event: any) => setSearch(event.target.value)}
                    />
                    {filteredUsers.length ? filteredUsers.map(renderUserRow) : <Meta>No matching users.</Meta>}
                  </DirectoryPanel>
                ) : null}

                {renderSectionToggle("recent", "Recent Direct Chats", conversations.length)}
                {sections.recent ? (
                  <DirectoryPanel>
                    {conversations.map((conversation) => {
                      const label = conversationLabel(conversation);
                      const peer = conversation.peers[0];
                      return (
                        <RecentButton
                          key={conversation.id}
                          $active={selected?.id === conversation.id}
                          onClick={() => {
                            setActiveId(conversation.id);
                            setActivePeerId(peer ? peerId(peer) : null);
                          }}
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
                    {conversations.length === 0 ? <Meta>No direct chats yet.</Meta> : null}
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
                  ? "Direct message"
                  : activeConversationId
                    ? "Direct message"
                    : "Pick a WTF user"}
              </Meta>
            </div>
            <Users size={26} aria-hidden />
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
              {activeConversationId && messagesQuery.isLoading ? <Hourglass size={20} /> : null}
              {activeConversationId && messagesQuery.isError ? <Meta>Messages failed to load.</Meta> : null}
              {activeConversationId && messagesQuery.data?.length === 0 ? <Meta>No messages in this chat yet.</Meta> : null}
              {!activeConversationId ? <Meta>Select a buddy.</Meta> : null}
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
              disabled={!activeConversationId || sendMutation.isPending}
              style={{ width: "100%" }}
            />
            <Button
              disabled={!activeConversationId || !content.trim() || sendMutation.isPending}
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
