import { useCallback, useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { RefreshCcw } from "lucide-react";
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
  WLink,
} from "../types";
import { WRichPreviewList } from "../preview/WRichPreview";

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
  nightMode: boolean;
  refetchGroupchat: RefetchCallback;
  selectedGroupchatId: string;
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
  line-height: 1.48;
  font-size: 14px;
  color: ${({ $night }) => ($night ? "#e5edf8" : "#131a22")};
`;

const ChatList = styled.div<{ $night: boolean }>`
  max-height: 520px;
  overflow-y: auto;
  border: 1px solid ${({ $night }) => ($night ? "#242424" : "#c9cfd4")};
  border-radius: 8px;
  background: ${({ $night }) => ($night ? "#07090c" : "#f9fbfc")};
  padding: 10px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ChatMessage = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#343a42" : "#d0d7de")};
  border-radius: 8px;
  background: ${({ $night }) =>
    $night
      ? "linear-gradient(180deg, #15181d 0%, #101318 100%)"
      : "linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%)"};
  padding: 10px;
  box-shadow: ${({ $night }) =>
    $night ? "0 10px 22px rgba(0, 0, 0, 0.20)" : "0 10px 22px rgba(20, 30, 40, 0.07)"};
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
  border-radius: 8px;
  object-fit: contain;
  cursor: pointer;
  border: 1px solid #476489;
`;

const DmVideo = styled.video`
  max-width: 260px;
  max-height: 200px;
  border-radius: 8px;
  border: 1px solid #476489;
  background: #000;
`;

const URL_RE = /(https?:\/\/[^\s]+)/g;

function renderDmText(text: string): ReactNode {
  if (!text) return null;
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  const nonUrlParts = parts
    .filter((part) => !/^https?:\/\//i.test(part))
    .map((part) => part.replace(/[ \t]{2,}/g, " "))
    .filter((part) => part.trim());
  if (nonUrlParts.length === 0) return null;
  return nonUrlParts.map((part, i) => <span key={i}>{part}</span>);
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
    .map((url): WLink => {
      const preview = previews.get(url);
      return {
        url,
        expandedUrl: preview?.finalUrl || url,
        displayUrl: preview?.domain || url,
        preview: preview
          ? {
              finalUrl: preview.finalUrl,
              canonicalUrl: (preview as CachedPreview & { canonicalUrl?: string }).canonicalUrl || preview.finalUrl,
              domain: preview.domain,
              siteName: preview.siteName,
              title: preview.title,
              description: preview.description,
              imageUrl: preview.imageUrl,
              isObjkt: Boolean(preview.isObjkt),
            }
          : null,
      };
    })
    .filter((link) => Boolean(link.url));

  if (cards.length === 0) return null;

  return <WRichPreviewList compact links={cards} nightMode={nightMode} />;
}

export function WMessagesPanel(props: WMessagesPanelProps) {
  const {
    activeGroupchat,
    activeGroupchatTitle,
    capabilities,
    groupchat,
    groupchatEndRef,
    groupchatFetching,
    nightMode,
    refetchGroupchat,
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
                  return "Set W_X_DEFAULT_ACCOUNT_HANDLE on the server and configure the platform gameshow account token for the read-only chat mirror.";
                case "no_user_with_handle":
                  return `No WTF user has @${handle} linked. Configure the platform gameshow account token or link the already-authorized gameshow account record.`;
                case "user_no_oauth2_token":
                  return `@${handle} is on the WTF account but has no platform OAuth2 token for the read-only chat mirror.`;
                case "user_missing_dm_read_scope":
                  return `@${handle} is connected but the platform token cannot read the configured gameshow chat. Normal users should not grant DM scopes.`;
                case "user_token_refresh_failed":
                  return `@${handle}'s platform OAuth2 token expired and refresh failed. Restore the platform gameshow token.`;
                default:
                  return "The read mirror needs the WTF Gameshow account OAuth2 token. Set W_X_DEFAULT_ACCOUNT_OAUTH2_ACCESS_TOKEN or X_OAUTH2_ACCESS_TOKEN on the server.";
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
                <RefreshCcw size={14} aria-hidden="true" />{" "}
                {groupchatFetching ? "Refreshing..." : "Refresh Chat"}
              </Button>
            </Row>
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
                <ChatMessage $night={nightMode} key={message.id}>
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
