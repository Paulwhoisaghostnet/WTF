import { useCallback, useEffect, useState } from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { Button, GroupBox, Tab, TabBody, Tabs } from "react95";
import styled from "styled-components";
import { api } from "../../../lib/api";
import type {
  CachedPreview,
  WAccount,
  WAdminDmConversation,
  WAdminDmConversationsResponse,
  WCapabilityResponse,
  WDmMedia,
  WGroupchatMessage,
  WGroupchatResponse,
  WUserDmConversation,
  WUserDmMessagesResponse,
  WUserDmsResponse,
  WView,
} from "../types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type RefetchCallback = () => unknown;

type VisibleGroupchat = {
  configured: boolean;
  conversationId: string | null;
  conversation: WAdminDmConversation | null;
  messages: WGroupchatMessage[];
  rateLimitedUntil?: number | null;
  cachedAt?: number;
  diagnostics?: {
    message?: string;
    rateLimited?: boolean;
  } | null;
};

type GroupchatMutation = {
  isPending: boolean;
  error: unknown;
  mutate: (payload: { conversationId: string; text: string }) => void;
};

type UserDmMutation = {
  isPending: boolean;
  mutate: (payload: { conversationId: string; text: string }) => void;
};

type DirectUserDmMutation = {
  isPending: boolean;
  mutate: (payload: { targetUserId: number; text: string }) => void;
};

export type WMessagesPanelProps = {
  accounts: WAccount[];
  activeGroupchat: VisibleGroupchat | null;
  activeGroupchatTitle: string;
  activeUserGroupConversation: WUserDmConversation | null;
  adminDmConversations?: WAdminDmConversationsResponse;
  canUseWDirectMessages: boolean;
  capabilities?: WCapabilityResponse;
  currentUserId?: number;
  directDmDraft: string;
  directDmTarget: number | null;
  directUserDmMutation: DirectUserDmMutation;
  dmChatEndRef: RefObject<HTMLDivElement | null>;
  groupchat?: WGroupchatResponse;
  groupchatDraft: string;
  groupchatEndRef: RefObject<HTMLDivElement | null>;
  groupchatFetching: boolean;
  groupchatMutation: GroupchatMutation;
  isOfficialGroupchat: (conversationId: string | null | undefined) => boolean;
  messageTab: number;
  nightMode: boolean;
  refetchGroupchat: RefetchCallback;
  refetchUserDms: RefetchCallback;
  selectedDmConversation: WUserDmConversation | null;
  selectedDmConversationId: string;
  selectedGroupchatId: string;
  selectedUserGroupConversationId: string;
  setActiveView: StateSetter<WView>;
  setDirectDmDraft: StateSetter<string>;
  setDirectDmTarget: StateSetter<number | null>;
  setGroupchatDraft: StateSetter<string>;
  setMessageTab: StateSetter<number>;
  setSelectedDmConversationId: StateSetter<string>;
  setSelectedGroupchatId: StateSetter<string>;
  setSelectedOAuthTier: StateSetter<string>;
  setSelectedUserGroupConversationId: StateSetter<string>;
  setUserDmDraft: StateSetter<string>;
  setUserGroupDraft: StateSetter<string>;
  userDmConversations: WUserDmConversation[];
  userDmDraft: string;
  userDmMessageList: WUserDmMessagesResponse["messages"];
  userDmMessages?: WUserDmMessagesResponse;
  userDmMessagesErrorMessage: string;
  userDmMessagesFetching: boolean;
  userDmMutation: UserDmMutation;
  userDmStatus: string;
  userDms?: WUserDmsResponse;
  userDmsErrorMessage: string;
  userDmsFetching: boolean;
  userGroupChats: WUserDmConversation[];
  userGroupDraft: string;
  visibleGroupchats: VisibleGroupchat[];
};

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const PaneGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(160px, 220px) 1fr;
  gap: 8px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const ConversationList = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#101a28" : "#f4f7fa")};
  padding: 6px;
`;

const ConversationButton = styled.button<{ $night: boolean; $active?: boolean }>`
  width: 100%;
  text-align: left;
  margin-bottom: 5px;
  padding: 6px;
  border: 1px solid
    ${({ $night, $active }) => ($active ? ($night ? "#9ec5ff" : "#0b4da6") : $night ? "#324863" : "#9ca6b1")};
  background: ${({ $night, $active }) =>
    $active ? ($night ? "#193657" : "#dcecff") : $night ? "#182334" : "#fff"};
  color: ${({ $night }) => ($night ? "#e8f0fb" : "#111")};
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
`;

const Small = styled.span<{ $night?: boolean }>`
  font-size: 11px;
  color: ${({ $night }) => ($night ? "#b8c5da" : "#3c4956")};
`;

const PostText = styled.p<{ $night: boolean }>`
  margin: 8px 0;
  white-space: pre-wrap;
  line-height: 1.4;
  font-size: 13px;
  color: ${({ $night }) => ($night ? "#e5edf8" : "#131a22")};
`;

const LinkPreviewList = styled.div`
  display: grid;
  gap: 6px;
  margin: 6px 0 8px;
`;

const LinkPreviewCard = styled.a<{ $night: boolean; $objkt?: boolean }>`
  display: grid;
  grid-template-columns: 104px 1fr;
  gap: 8px;
  align-items: stretch;
  border: 1px solid
    ${({ $night, $objkt }) =>
      $objkt ? ($night ? "#a46f2e" : "#b37a34") : $night ? "#425c7d" : "#9eb0c1"};
  background: ${({ $night, $objkt }) =>
    $objkt
      ? $night
        ? "linear-gradient(180deg, #2d2220 0%, #201816 100%)"
        : "linear-gradient(180deg, #fff2dc 0%, #f4e3c6 100%)"
      : $night
        ? "#17253a"
        : "#f7fbff"};
  color: inherit;
  text-decoration: none;
  overflow: hidden;

  &:hover {
    filter: brightness(1.03);
  }
`;

const LinkPreviewImageWrap = styled.div<{ $night: boolean }>`
  min-height: 82px;
  max-height: 96px;
  background: ${({ $night }) => ($night ? "#0f1a2a" : "#e8eff6")};
  border-right: 1px solid ${({ $night }) => ($night ? "#3d5572" : "#b7c5d3")};
  overflow: hidden;
`;

const LinkPreviewImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const LinkPreviewBody = styled.div`
  min-width: 0;
  padding: 6px 8px 6px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
`;

const LinkPreviewTitle = styled.div`
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const LinkPreviewDescription = styled.div<{ $night: boolean }>`
  font-size: 11px;
  line-height: 1.3;
  color: ${({ $night }) => ($night ? "#b8c9e0" : "#4b5b6b")};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ChatList = styled.div<{ $night: boolean }>`
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#0d1726" : "#fff")};
  padding: 8px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
`;

const ChatMessage = styled.div`
  margin-bottom: 8px;
`;

const DmMediaGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0 2px;
`;

const DmMediaImg = styled.img`
  max-width: 260px;
  max-height: 200px;
  border-radius: 4px;
  object-fit: contain;
  cursor: pointer;
  border: 1px solid #476489;
`;

const DmVideo = styled.video`
  max-width: 260px;
  max-height: 200px;
  border-radius: 4px;
  border: 1px solid #476489;
  background: #000;
`;

const URL_RE = /(https?:\/\/[^\s]+)/g;

function renderDmText(text: string): ReactNode {
  if (!text) return null;
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    URL_RE.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        style={{ wordBreak: "break-all" }}
      >
        {part.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 60)}
        {part.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").length > 60 ? "…" : ""}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function DmMediaAttachments({ media }: { media?: WDmMedia[] }) {
  if (!media || media.length === 0) return null;
  return (
    <DmMediaGrid>
      {media.map((m, i) => {
        const isPlayable = m.type === "animated_gif" || m.type === "video";
        const videoSrc = m.videoUrl || m.url;

        if (isPlayable && videoSrc) {
          return (
            <DmVideo
              key={i}
              src={videoSrc}
              poster={m.previewUrl || undefined}
              autoPlay={m.type === "animated_gif"}
              loop={m.type === "animated_gif"}
              muted={m.type === "animated_gif"}
              controls={m.type === "video"}
              playsInline
            />
          );
        }

        const imgSrc = m.url || m.previewUrl;
        if (!imgSrc) return null;
        return (
          <a key={i} href={imgSrc} target="_blank" rel="noopener noreferrer">
            <DmMediaImg
              src={imgSrc}
              alt={m.altText || `${m.type} attachment`}
              loading="lazy"
            />
          </a>
        );
      })}
    </DmMediaGrid>
  );
}

const dmPreviewCache = new Map<string, CachedPreview | null>();

function DmLinkPreviews({ text, nightMode }: { text: string; nightMode: boolean }) {
  const urls = text.match(URL_RE) || [];
  const unique = [...new Set(urls)].slice(0, 3);
  const [previews, setPreviews] = useState<Map<string, CachedPreview | null>>(new Map());

  const fetchPreviews = useCallback(async () => {
    const toFetch = unique.filter((u) => !dmPreviewCache.has(u));
    if (toFetch.length > 0) {
      await Promise.all(
        toFetch.map(async (url) => {
          try {
            const res = await api.post("/api/w/link-preview", { url });
            const data = (res as any).data || res;
            dmPreviewCache.set(url, data.preview || null);
          } catch {
            dmPreviewCache.set(url, null);
          }
        }),
      );
    }
    const result = new Map<string, CachedPreview | null>();
    for (const u of unique) result.set(u, dmPreviewCache.get(u) ?? null);
    setPreviews(result);
  }, [text]);

  useEffect(() => { fetchPreviews(); }, [fetchPreviews]);

  const cards = unique
    .map((u) => ({ url: u, preview: previews.get(u) }))
    .filter((e): e is { url: string; preview: CachedPreview } => Boolean(e.preview?.title));

  if (cards.length === 0) return null;

  return (
    <LinkPreviewList style={{ marginTop: 4 }}>
      {cards.map(({ url, preview }) => (
        <LinkPreviewCard
          $night={nightMode}
          $objkt={preview.isObjkt}
          key={url}
          href={preview.finalUrl || url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ gridTemplateColumns: preview.imageUrl ? "80px 1fr" : "1fr" }}
        >
          {preview.imageUrl && (
            <LinkPreviewImageWrap $night={nightMode} style={{ maxHeight: 72 }}>
              <LinkPreviewImage src={preview.imageUrl} alt="" loading="lazy" />
            </LinkPreviewImageWrap>
          )}
          <LinkPreviewBody>
            <LinkPreviewTitle>{preview.title}</LinkPreviewTitle>
            {preview.description && (
              <LinkPreviewDescription $night={nightMode}>
                {preview.description}
              </LinkPreviewDescription>
            )}
            <small style={{ fontSize: 10, opacity: 0.7 }}>
              {preview.siteName || preview.domain}
            </small>
          </LinkPreviewBody>
        </LinkPreviewCard>
      ))}
    </LinkPreviewList>
  );
}

function userGroupLabel(conversation: WUserDmConversation): string {
  return (
    conversation.name ||
    conversation.peers
      ?.map((peer) =>
        peer.displayName || peer.username || peer.twitterHandle || peer.xName || peer.xUsername || null
      )
      .filter(Boolean)
      .join(", ") ||
    "Group conversation"
  );
}

function userDmLabel(conversation: WUserDmConversation): string {
  return (
    conversation.name ||
    conversation.peers
      .map((peer) =>
        peer.displayName ||
        peer.username ||
        peer.twitterHandle ||
        (peer.xName ? peer.xName : peer.xUsername ? `@${peer.xUsername}` : null)
      )
      .filter(Boolean)
      .join(", ") ||
    "W conversation"
  );
}

export function WMessagesPanel(props: WMessagesPanelProps) {
  const {
    accounts,
    activeGroupchat,
    activeGroupchatTitle,
    activeUserGroupConversation,
    canUseWDirectMessages,
    capabilities,
    currentUserId,
    directDmDraft,
    directDmTarget,
    directUserDmMutation,
    dmChatEndRef,
    groupchat,
    groupchatDraft,
    groupchatEndRef,
    groupchatFetching,
    groupchatMutation,
    isOfficialGroupchat,
    messageTab,
    nightMode,
    refetchGroupchat,
    refetchUserDms,
    selectedDmConversation,
    selectedDmConversationId,
    selectedUserGroupConversationId,
    setActiveView,
    setDirectDmDraft,
    setDirectDmTarget,
    setGroupchatDraft,
    setMessageTab,
    setSelectedDmConversationId,
    setSelectedGroupchatId,
    setSelectedOAuthTier,
    setSelectedUserGroupConversationId,
    setUserDmDraft,
    setUserGroupDraft,
    userDmConversations,
    userDmDraft,
    userDmMessageList,
    userDmMessagesErrorMessage,
    userDmMessagesFetching,
    userDmMutation,
    userDmStatus,
    userDmsErrorMessage,
    userDmsFetching,
    userGroupChats,
    userGroupDraft,
    visibleGroupchats,
  } = props;

  return (
    <>
      <Tabs value={0} onChange={() => setMessageTab(0)}>
        <Tab value={0}>Gameshow Chat</Tab>
      </Tabs>
      <TabBody style={{ minHeight: 200 }}>
        {messageTab === 0 && (
          <>
            {!capabilities?.platformAccountConfigured ? (
              <Small $night={nightMode}>
                {(() => {
                  const handle =
                    capabilities?.platformAccountHandle ||
                    capabilities?.defaultAccountHandle ||
                    "wtf_gameshow";
                  switch (capabilities?.platformAccountReason) {
                    case "no_handle_configured":
                      return "Set W_X_DEFAULT_ACCOUNT_HANDLE on the server, or have the gameshow admin connect X (messages tier) on a user with that handle.";
                    case "no_user_with_handle":
                      return `No WTF user has @${handle} linked. Log in as the gameshow admin, open Settings → Connect X, pick "Full W participation (messages)", and authorize as @${handle}.`;
                    case "user_no_oauth2_token":
                      return `@${handle} is on the WTF account but has no OAuth2 token. Open Settings → Connect X (messages tier).`;
                    case "user_missing_dm_read_scope":
                      return `@${handle} is connected but the granted scopes don't include dm.read. Open Settings, switch the tier picker to "Full W participation (messages)" and reconnect — that grants dm.read + dm.write.`;
                    case "user_token_refresh_failed":
                      return `@${handle}'s OAuth2 token expired and the refresh failed. Open Settings → Connect X (messages tier) again.`;
                    default:
                      return "The read mirror needs the WTF Gameshow account OAuth2 token. Either set W_X_DEFAULT_ACCOUNT_OAUTH2_ACCESS_TOKEN on the server, or connect the gameshow X account through W (messages tier).";
                  }
                })()}
              </Small>
            ) : (
              <>
                <Row style={{ marginBottom: 6 }}>
                  <Small $night={nightMode}>
                    {groupchat?.readonly
                      ? "Read-only. Connect the Full W participation tier to send."
                      : "Connected for participation."}
                    {activeGroupchat?.diagnostics?.message ? ` ${activeGroupchat.diagnostics.message}` : ""}
                  </Small>
                  <Button
                    size="sm"
                    disabled={groupchatFetching}
                    onClick={() => refetchGroupchat()}
                  >
                    {groupchatFetching ? "Refreshing..." : "Refresh Chat"}
                  </Button>
                </Row>
                {visibleGroupchats.length > 1 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {visibleGroupchats.map((chat) => {
                      const isOfficial = isOfficialGroupchat(chat.conversationId);
                      const label =
                        (isOfficial ? "Official WTF Gameshow Group Chat" : "") ||
                        chat.conversation?.name ||
                        chat.conversation?.participants
                          ?.map((participant) => participant.username ? `@${participant.username}` : participant.id)
                          .slice(0, 3)
                          .join(", ") ||
                        chat.conversationId ||
                        "W chat";
                      return (
                        <Button
                          key={chat.conversationId || label}
                          size="sm"
                          active={activeGroupchat?.conversationId === chat.conversationId}
                          onClick={() => chat.conversationId && setSelectedGroupchatId(chat.conversationId)}
                        >
                          {isOfficial ? "★ " : ""}{label}
                        </Button>
                      );
                    })}
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      color: nightMode ? "#f3f7ff" : "#10161e",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {activeGroupchatTitle}
                  </div>
                  <Small $night={nightMode}>
                    Public read mirror. Only the configured official gameshow chat should be visible to every W user.
                  </Small>
                </div>
                <ChatList $night={nightMode}>
                  {(activeGroupchat?.messages.length || 0) === 0 && (
                    <Small $night={nightMode}>No chat messages loaded yet.</Small>
                  )}
                  {[...(activeGroupchat?.messages || [])].reverse().map((message) => (
                    <ChatMessage key={message.id}>
                      <Small $night={nightMode}>
                        <strong>
                          {message.sender.name || message.sender.username || message.sender.id || "X user"}
                        </strong>
                        {message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString()}` : ""}
                      </Small>
                      {message.text && (
                        <PostText $night={nightMode} style={{ margin: "2px 0 0" }}>
                          {renderDmText(message.text)}
                        </PostText>
                      )}
                      <DmMediaAttachments media={message.media} />
                      {message.text && <DmLinkPreviews text={message.text} nightMode={nightMode} />}
                    </ChatMessage>
                  ))}
                  <div ref={groupchatEndRef} />
                </ChatList>
                <Row>
                  <textarea
                    rows={2}
                    value={groupchatDraft}
                    onChange={(e) => setGroupchatDraft(e.target.value.slice(0, 1000))}
                    disabled={!groupchat?.canWrite || !activeGroupchat?.conversationId || groupchatMutation.isPending}
                    placeholder={groupchat?.canWrite ? "Send to this X groupchat..." : "Read-only groupchat"}
                    style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
                  />
                  <Button
                    size="sm"
                    disabled={
                      !groupchat?.canWrite ||
                      !activeGroupchat?.conversationId ||
                      !groupchatDraft.trim() ||
                      groupchatMutation.isPending
                    }
                    onClick={() =>
                      activeGroupchat?.conversationId &&
                      groupchatMutation.mutate({
                        conversationId: activeGroupchat.conversationId,
                        text: groupchatDraft.trim(),
                      })
                    }
                  >
                    {groupchatMutation.isPending ? "Sending..." : "Send"}
                  </Button>
                </Row>
                {groupchatMutation.error && (
                  <p style={{ fontSize: 11, color: nightMode ? "#ff9f9f" : "#900" }}>
                    {groupchatMutation.error instanceof Error
                      ? groupchatMutation.error.message
                      : "Groupchat send failed"}
                  </p>
                )}
              </>
            )}
          </>
        )}

        {messageTab === 1 && (
          <>
            {!canUseWDirectMessages ? (
              <div>
                <Small $night={nightMode}>
                  {capabilities?.connected
                    ? "Reconnect X OAuth2 with the Full W participation tier to use private W-to-W DMs."
                    : "Connect X OAuth2 with the Full W participation tier to use private W-to-W DMs."}
                </Small>
                <div style={{ marginTop: 8 }}>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedOAuthTier("messages");
                      setActiveView("settings");
                    }}
                  >
                    Open Full Permissions
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Row style={{ marginBottom: 8 }}>
                  <Small $night={nightMode}>
                    Your DM inbox.
                    {userDmsErrorMessage ? ` ${userDmsErrorMessage}` : ""}
                  </Small>
                  <Button size="sm" disabled={userDmsFetching} onClick={() => refetchUserDms()}>
                    {userDmsFetching ? "Loading..." : "Refresh DMs"}
                  </Button>
                </Row>
                <PaneGrid>
                  <ConversationList $night={nightMode}>
                    {userDmConversations.map((conversation) => (
                      <ConversationButton
                        key={conversation.id}
                        type="button"
                        $night={nightMode}
                        $active={selectedDmConversationId === conversation.id}
                        onClick={() => setSelectedDmConversationId(conversation.id)}
                      >
                        <strong>{userDmLabel(conversation)}</strong>
                        <br />
                        <Small $night={nightMode}>{conversation.participantCount} participants</Small>
                      </ConversationButton>
                    ))}
                    {userDmConversations.length === 0 && (
                      <Small $night={nightMode}>No DM conversations found yet.</Small>
                    )}
                  </ConversationList>

                  <div>
                    <ChatList $night={nightMode} style={{ maxHeight: 360 }}>
                      {userDmMessagesFetching && (
                        <Small $night={nightMode}>Loading messages...</Small>
                      )}
                      {userDmMessagesErrorMessage && (
                        <p style={{ fontSize: 11, color: nightMode ? "#ff9f9f" : "#900" }}>
                          {userDmMessagesErrorMessage}
                        </p>
                      )}
                      {!userDmMessagesFetching && userDmMessageList.length === 0 && (
                        <Small $night={nightMode}>
                          {selectedDmConversation ? "No messages loaded yet." : "Choose a conversation."}
                        </Small>
                      )}
                      {[...userDmMessageList].reverse().map((message) => (
                        <ChatMessage key={message.id}>
                          <Small $night={nightMode}>
                            <strong>
                              {message.sender.wtfDisplayName ||
                                message.sender.wtfUsername ||
                                message.sender.name ||
                                message.sender.username ||
                                "W user"}
                            </strong>
                            {message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString()}` : ""}
                          </Small>
                          {message.text && (
                            <PostText $night={nightMode} style={{ margin: "2px 0 0" }}>
                              {renderDmText(message.text)}
                            </PostText>
                          )}
                          <DmMediaAttachments media={message.media} />
                          {message.text && <DmLinkPreviews text={message.text} nightMode={nightMode} />}
                        </ChatMessage>
                      ))}
                      <div ref={dmChatEndRef} />
                    </ChatList>

                    <Row>
                      <textarea
                        rows={2}
                        value={userDmDraft}
                        onChange={(e) => setUserDmDraft(e.target.value.slice(0, 1000))}
                        disabled={!selectedDmConversationId || userDmMutation.isPending}
                        placeholder={
                          selectedDmConversationId ? "Send a private W DM..." : "Choose a W conversation"
                        }
                        style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
                      />
                      <Button
                        size="sm"
                        disabled={
                          !selectedDmConversationId ||
                          !userDmDraft.trim() ||
                          userDmMutation.isPending
                        }
                        onClick={() =>
                          userDmMutation.mutate({
                            conversationId: selectedDmConversationId,
                            text: userDmDraft.trim(),
                          })
                        }
                      >
                        {userDmMutation.isPending ? "Sending..." : "Send"}
                      </Button>
                    </Row>

                    <GroupBox label="New W DM" style={{ marginTop: 10 }}>
                      <Row>
                        <select
                          value={directDmTarget ?? ""}
                          onChange={(e) =>
                            setDirectDmTarget(e.target.value ? Number(e.target.value) : null)
                          }
                          style={{ minWidth: 220 }}
                        >
                          <option value="">Select connected W user...</option>
                          {accounts
                            .filter((account) => account.userId !== currentUserId)
                            .map((account) => (
                              <option key={account.userId} value={account.userId}>
                                {(account.displayName || account.username) + " "}@{account.twitterHandle}
                              </option>
                            ))}
                        </select>
                        <textarea
                          rows={2}
                          value={directDmDraft}
                          onChange={(e) => setDirectDmDraft(e.target.value.slice(0, 1000))}
                          placeholder="Start a W-only X DM..."
                          style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
                        />
                        <Button
                          size="sm"
                          disabled={
                            !directDmTarget ||
                            !directDmDraft.trim() ||
                            directUserDmMutation.isPending
                          }
                          onClick={() =>
                            directDmTarget &&
                            directUserDmMutation.mutate({
                              targetUserId: directDmTarget,
                              text: directDmDraft.trim(),
                            })
                          }
                        >
                          {directUserDmMutation.isPending ? "Sending..." : "Start"}
                        </Button>
                      </Row>
                    </GroupBox>

                    {userDmStatus && (
                      <p style={{ fontSize: 11, marginBottom: 0 }}>{userDmStatus}</p>
                    )}
                  </div>
                </PaneGrid>
              </>
            )}
          </>
        )}
      </TabBody>
    </>
  );
}
