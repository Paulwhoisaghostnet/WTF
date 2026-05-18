import { useCallback, useEffect, useState } from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { Button, Tab, TabBody, Tabs } from "react95";
import styled from "styled-components";
import { api } from "../../../lib/api";
import type {
  CachedPreview,
  WAdminDmConversation,
  WCapabilityResponse,
  WDmMedia,
  WGroupchatMessage,
  WGroupchatResponse,
} from "../types";

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

export type WMessagesPanelProps = {
  activeGroupchat: VisibleGroupchat | null;
  activeGroupchatTitle: string;
  capabilities?: WCapabilityResponse;
  groupchat?: WGroupchatResponse;
  groupchatEndRef: RefObject<HTMLDivElement | null>;
  groupchatFetching: boolean;
  isOfficialGroupchat: (conversationId: string | null | undefined) => boolean;
  nightMode: boolean;
  refetchGroupchat: RefetchCallback;
  selectedGroupchatId: string;
  setSelectedGroupchatId: Dispatch<SetStateAction<string>>;
  visibleGroupchats: VisibleGroupchat[];
};

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
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

export function WMessagesPanel(props: WMessagesPanelProps) {
  const {
    activeGroupchat,
    activeGroupchatTitle,
    capabilities,
    groupchat,
    groupchatEndRef,
    groupchatFetching,
    isOfficialGroupchat,
    nightMode,
    refetchGroupchat,
    setSelectedGroupchatId,
    visibleGroupchats,
  } = props;

  return (
    <>
      <Tabs value={0}>
        <Tab value={0}>Gameshow Chat</Tab>
      </Tabs>
      <TabBody style={{ minHeight: 200 }}>
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
                  return `No WTF user has @${handle} linked. Log in as the gameshow admin, open Settings -> Connect X, pick "Full W participation (messages)", and authorize as @${handle}.`;
                case "user_no_oauth2_token":
                  return `@${handle} is on the WTF account but has no OAuth2 token. Open Settings -> Connect X (messages tier).`;
                case "user_missing_dm_read_scope":
                  return `@${handle} is connected but the granted scopes don't include dm.read. Open Settings, switch the tier picker to "Full W participation" and reconnect.`;
                case "user_token_refresh_failed":
                  return `@${handle}'s OAuth2 token expired and the refresh failed. Open Settings -> Connect X (messages tier) again.`;
                default:
                  return "The read mirror needs the WTF Gameshow account OAuth2 token. Either set W_X_DEFAULT_ACCOUNT_OAUTH2_ACCESS_TOKEN on the server, or connect the gameshow X account through W (messages tier).";
              }
            })()}
          </Small>
        ) : (
          <>
            <Row style={{ marginBottom: 6 }}>
              <Small $night={nightMode}>
                Read-only mirror.
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
                      {isOfficial ? "* " : ""}{label}
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
                    {message.createdAt ? ` - ${new Date(message.createdAt).toLocaleString()}` : ""}
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
          </>
        )}
      </TabBody>
    </>
  );
}
