import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import type { WAccount, WLink, WPost, WPostMediaAttachment, WTimelineResponse } from "../types";

type TimelinePostMutation = {
  isPending: boolean;
  mutate: (payload: { text: string; mediaIds: string[] }) => void;
};

type TimelineMediaUploadMutation = {
  isPending: boolean;
  mutate: (file: File) => void;
};

type TimelineReplyMutation = {
  isPending: boolean;
  mutate: (payload: { postId: string; text: string }) => void;
};

type TimelineEngageMutation = {
  isPending: boolean;
  mutate: (payload: { action: "like" | "repost" | "quote"; postId: string; text?: string }) => void;
};

type WTimelinePanelProps = {
  accounts: WAccount[];
  actionErrors: Record<string, string>;
  actionSuccess: Record<string, string>;
  canPostInW: boolean;
  diagnostics?: WTimelineResponse["diagnostics"];
  engageMutation: TimelineEngageMutation;
  mediaUploadMutation: TimelineMediaUploadMutation;
  nightMode: boolean;
  postDraft: string;
  postMedia: WPostMediaAttachment[];
  postMutation: TimelinePostMutation;
  postStatus: string;
  posts: WPost[];
  quoteDrafts: Record<string, string>;
  quoteOpenFor: string | null;
  replyDrafts: Record<string, string>;
  replyErrors: Record<string, string>;
  replyMutation: TimelineReplyMutation;
  replyOpenFor: string | null;
  replySuccess: Record<string, string>;
  setActionErrors: Dispatch<SetStateAction<Record<string, string>>>;
  setPostDraft: Dispatch<SetStateAction<string>>;
  setPostStatus: Dispatch<SetStateAction<string>>;
  setQuoteDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setQuoteOpenFor: Dispatch<SetStateAction<string | null>>;
  setReplyDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setReplyOpenFor: Dispatch<SetStateAction<string | null>>;
  viewerCanReply: boolean;
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

const IdentityRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
`;

const IdentityBadge = styled.a<{ $night: boolean }>`
  display: inline-flex;
  align-items: center;
  min-height: 16px;
  max-width: 160px;
  padding: 1px 5px;
  border: 1px solid ${({ $night }) => ($night ? "#4f785e" : "#5f8a66")};
  background: ${({ $night }) => ($night ? "#17291d" : "#e9f6e6")};
  color: ${({ $night }) => ($night ? "#baf0c4" : "#16551e")};
  text-decoration: none;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`;

const PostCard = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#2f425b" : "#aab5bf")};
  background: ${({ $night }) => ($night ? "#16181c" : "#ffffff")};
  margin-bottom: 10px;
  padding: 9px;
  box-shadow: ${({ $night }) =>
    $night ? "inset 0 0 0 1px #213146" : "inset 0 0 0 1px #e7eef5"};
`;

const PostHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Avatar = styled.div<{ $night: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid ${({ $night }) => ($night ? "#4b6787" : "#9cb0c4")};
  background: ${({ $night }) => ($night ? "#223650" : "#dce8f4")};
  color: ${({ $night }) => ($night ? "#d5e9ff" : "#16395f")};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
`;

const PostText = styled.p<{ $night: boolean }>`
  margin: 8px 0;
  white-space: pre-wrap;
  line-height: 1.4;
  font-size: 13px;
  color: ${({ $night }) => ($night ? "#e5edf8" : "#131a22")};
`;

const Stats = styled.div<{ $night: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: ${({ $night }) => ($night ? "#a5bad7" : "#425364")};
`;

const LinksRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 8px;
`;

const LinkChip = styled.a<{ $night: boolean }>`
  display: inline-block;
  max-width: 100%;
  border: 1px solid ${({ $night }) => ($night ? "#385074" : "#9ba8b6")};
  background: ${({ $night }) => ($night ? "#19263a" : "#f4f7fb")};
  color: ${({ $night }) => ($night ? "#a6cbff" : "#0b4ca3")};
  text-decoration: none;
  padding: 3px 6px;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    text-decoration: underline;
  }
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

const ObjktBadge = styled.span<{ $night: boolean }>`
  align-self: flex-start;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  border: 1px solid ${({ $night }) => ($night ? "#c8995c" : "#9a6828")};
  background: ${({ $night }) => ($night ? "#3d2b1a" : "#f3ddb8")};
  color: ${({ $night }) => ($night ? "#ffdcae" : "#6f420a")};
  padding: 1px 4px;
`;

const MediaGrid = styled.div<{ $count: number }>`
  display: grid;
  gap: 6px;
  margin: 6px 0 8px;
  grid-template-columns: ${({ $count }) =>
    $count > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"};
`;

const MediaTile = styled.a<{ $night: boolean }>`
  display: block;
  position: relative;
  border: 1px solid ${({ $night }) => ($night ? "#476489" : "#9fb2c6")};
  background: ${({ $night }) => ($night ? "#0d1623" : "#edf3f9")};
  min-height: 120px;
  overflow: hidden;
  text-decoration: none;
`;

const MediaImage = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  max-height: 320px;
  object-fit: cover;
`;

const MediaBadge = styled.span<{ $night: boolean }>`
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  padding: 2px 5px;
  border: 1px solid ${({ $night }) => ($night ? "#7f9bc0" : "#6f8fb0")};
  background: ${({ $night }) => ($night ? "#183357" : "#dde9f5")};
  color: ${({ $night }) => ($night ? "#dcecff" : "#153a61")};
`;

const ReplyArea = styled.div`
  margin-top: 8px;
`;

function replyIntentUrl(postId: string): string {
  const q = new URLSearchParams({ in_reply_to: postId });
  return `https://x.com/intent/tweet?${q.toString()}`;
}

function isMediaLink(link: WLink): boolean {
  const value = `${link.expandedUrl || ""} ${link.displayUrl || ""} ${link.url || ""}`.toLowerCase();
  return (
    value.includes("pic.x.com/") ||
    value.includes("pic.twitter.com/") ||
    value.includes("/photo/") ||
    value.includes("/video/")
  );
}

function displayLinkText(link: WLink): string {
  return (link.displayUrl || link.expandedUrl || link.url || "").trim();
}

function shortTezos(addr: string): string {
  if (!addr || addr.length < 14) return addr;
  return `${addr.slice(0, 7)}...${addr.slice(-5)}`;
}

function linkHref(link: WLink): string {
  return link.preview?.canonicalUrl || link.expandedUrl || link.url;
}

function expandTcoUrls(text: string, links: WLink[]): string {
  let result = text;
  for (const link of links) {
    if (!link.url || !link.url.includes("t.co/")) continue;
    const display = link.displayUrl || link.expandedUrl || link.url;
    result = result.replace(link.url, display);
  }
  return result;
}

function renderAvatarContent(post: WPost): ReactNode {
  if (post.author.avatarUrl) {
    return (
      <img
        src={post.author.avatarUrl}
        alt={`${post.author.twitterHandle} avatar`}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  return post.author.twitterHandle.slice(0, 1).toUpperCase();
}

export function WTimelinePanel(props: WTimelinePanelProps) {
  const {
    accounts,
    actionErrors,
    actionSuccess,
    canPostInW,
    diagnostics,
    engageMutation,
    mediaUploadMutation,
    nightMode,
    postDraft,
    postMedia,
    postMutation,
    postStatus,
    posts,
    quoteDrafts,
    quoteOpenFor,
    replyDrafts,
    replyErrors,
    replyMutation,
    replyOpenFor,
    replySuccess,
    setActionErrors,
    setPostDraft,
    setPostStatus,
    setQuoteDrafts,
    setQuoteOpenFor,
    setReplyDrafts,
    setReplyOpenFor,
    viewerCanReply,
  } = props;
  const accountCountLabel = `${accounts.length} connected account${accounts.length === 1 ? "" : "s"}`;

  return (
    <>
      <GroupBox label="New Post" style={{ marginBottom: 10 }}>
        <Row>
          <textarea
            rows={2}
            maxLength={280}
            value={postDraft}
            onChange={(e) => setPostDraft(e.target.value.slice(0, 280))}
            disabled={!canPostInW || postMutation.isPending}
            placeholder={canPostInW ? "Post to X from your connected account..." : "Connect Timeline actions to post"}
            style={{ flex: 1, minWidth: 240, fontFamily: "inherit", fontSize: 12 }}
          />
          <Button
            size="sm"
            disabled={!canPostInW || !postDraft.trim() || postMutation.isPending}
            onClick={() =>
              postMutation.mutate({
                text: postDraft.trim(),
                mediaIds: postMedia.map((media) => media.id),
              })
            }
          >
            {postMutation.isPending ? "Posting..." : "Post in W"}
          </Button>
        </Row>
        <Row style={{ marginTop: 6 }}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/*"
            disabled={!canPostInW || mediaUploadMutation.isPending || postMedia.length >= 4}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              if (file.size > 15 * 1024 * 1024) {
                setPostStatus("Media must be 15MB or less.");
                return;
              }
              mediaUploadMutation.mutate(file);
            }}
            style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
          />
          <Small $night={nightMode}>
            {mediaUploadMutation.isPending
              ? "Uploading media..."
              : postMedia.length
                ? `Attached: ${postMedia.map((media) => media.name).join(", ")}`
                : "Images, GIFs, and short videos up to 15MB."}
          </Small>
        </Row>
        <Small $night={nightMode}>{postDraft.length}/280</Small>
        {postStatus && <p style={{ fontSize: 11, marginBottom: 0 }}>{postStatus}</p>}
      </GroupBox>

      <GroupBox label="Timeline">
        <div style={{ marginBottom: 8, fontSize: 11, opacity: 0.7 }} title={accountCountLabel}>
          Cached for credit efficiency • Last updated:{" "}
          {diagnostics?.cachedAt
            ? new Date(diagnostics.cachedAt).toLocaleTimeString()
            : "just now"}
          {diagnostics?.fromCache && " (DB cache)"}
        </div>
        {posts.length === 0 ? (
          <Small $night={nightMode}>
            No posts to show right now.{" "}
            {diagnostics?.fromCache
              ? "DB cache empty — refresh to pull live."
              : "Try Refresh in a minute."}
          </Small>
        ) : (
          posts.map((post) => {
            const nonMediaLinks = (post.links || []).filter((link) => !isMediaLink(link));
            const previewLinks = nonMediaLinks.filter((link) => Boolean(link.preview));
            const plainLinks = nonMediaLinks.filter((link) => !link.preview);

            return (
              <PostCard $night={nightMode} key={post.id}>
                <PostHead>
                  <Avatar $night={nightMode}>{renderAvatarContent(post)}</Avatar>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>
                      {post.author.displayName || post.author.username} @{post.author.twitterHandle}
                    </div>
                    <Small $night={nightMode}>{new Date(post.createdAt).toLocaleString()}</Small>
                    {post.author.tezosIdentities?.length ? (
                      <IdentityRow>
                        {post.author.tezosIdentities.slice(0, 2).map((hint) => (
                          <IdentityBadge
                            $night={nightMode}
                            key={`${post.id}-${hint.tezosAddress}`}
                            href={`https://tzkt.io/${hint.tezosAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${hint.source}: ${hint.tezosAddress}`}
                          >
                            {hint.tzDomain || hint.alias || shortTezos(hint.tezosAddress)}
                          </IdentityBadge>
                        ))}
                      </IdentityRow>
                    ) : null}
                  </div>
                </PostHead>

                <PostText $night={nightMode}>{expandTcoUrls(post.displayText || post.text, post.links || [])}</PostText>

                {Array.isArray(post.media) && post.media.length > 0 && (
                  <MediaGrid $count={post.media.length}>
                    {post.media.map((media, idx) => {
                      const mediaHref = media.url || post.url;
                      const imageSrc = media.url || media.previewUrl;
                      const isPlayable = media.type === "animated_gif" || media.type === "video";
                      const videoSrc = media.videoUrl || (isPlayable ? media.url : null);
                      const typeLabel =
                        media.type === "animated_gif"
                          ? "GIF"
                          : media.type === "video"
                            ? "VIDEO"
                            : "";
                      return (
                        <MediaTile
                          $night={nightMode}
                          key={`${post.id}-${idx}`}
                          href={!isPlayable ? mediaHref : undefined}
                          target={!isPlayable ? "_blank" : undefined}
                          rel={!isPlayable ? "noopener noreferrer" : undefined}
                          as={isPlayable ? "div" : "a"}
                          title={media.altText || `${media.type} from @${post.author.twitterHandle}`}
                          style={isPlayable ? { cursor: "default" } : undefined}
                        >
                          {isPlayable && videoSrc ? (
                            <video
                              src={videoSrc}
                              poster={media.previewUrl || undefined}
                              autoPlay={media.type === "animated_gif"}
                              loop={media.type === "animated_gif"}
                              muted={media.type === "animated_gif"}
                              controls={media.type === "video"}
                              playsInline
                              style={{ display: "block", width: "100%", maxHeight: 320, objectFit: "contain", background: "#000" }}
                            />
                          ) : imageSrc ? (
                            <MediaImage
                              src={imageSrc}
                              alt={media.altText || `${media.type} from @${post.author.twitterHandle}`}
                              loading="lazy"
                            />
                          ) : (
                            <div
                              style={{
                                minHeight: 120,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                color: nightMode ? "#b5c7df" : "#34495f",
                              }}
                            >
                              Open media on X
                            </div>
                          )}
                          {typeLabel && <MediaBadge $night={nightMode}>{typeLabel}</MediaBadge>}
                        </MediaTile>
                      );
                    })}
                  </MediaGrid>
                )}

                {previewLinks.length > 0 && (
                  <LinkPreviewList>
                    {previewLinks.map((link, idx) => {
                      const preview = link.preview!;
                      const href = linkHref(link);
                      const siteLabel = preview.siteName || preview.domain || displayLinkText(link);
                      return (
                        <LinkPreviewCard
                          $night={nightMode}
                          $objkt={preview.isObjkt}
                          key={`${post.id}-preview-${idx}`}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={href}
                        >
                          <LinkPreviewImageWrap $night={nightMode}>
                            {preview.imageUrl ? (
                              <LinkPreviewImage src={preview.imageUrl} alt={preview.title} />
                            ) : (
                              <div
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 10,
                                  color: nightMode ? "#aac0db" : "#4a5e73",
                                }}
                              >
                                {siteLabel}
                              </div>
                            )}
                          </LinkPreviewImageWrap>
                          <LinkPreviewBody>
                            {preview.isObjkt && <ObjktBadge $night={nightMode}>OBJKT</ObjktBadge>}
                            <LinkPreviewTitle>{preview.title}</LinkPreviewTitle>
                            {preview.description && (
                              <LinkPreviewDescription $night={nightMode}>
                                {preview.description}
                              </LinkPreviewDescription>
                            )}
                            <Small $night={nightMode}>{siteLabel}</Small>
                          </LinkPreviewBody>
                        </LinkPreviewCard>
                      );
                    })}
                  </LinkPreviewList>
                )}

                {plainLinks.length > 0 && (
                  <LinksRow>
                    {plainLinks.map((link, idx) => {
                      const href = linkHref(link);
                      const label = displayLinkText(link);
                      return (
                        <LinkChip
                          $night={nightMode}
                          key={`${post.id}-link-${idx}`}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={href}
                        >
                          {label}
                        </LinkChip>
                      );
                    })}
                  </LinksRow>
                )}

                <Row>
                  <Stats $night={nightMode}>
                    <span>♥ {post.metrics.likes}</span>
                    <span>↩ {post.metrics.replies}</span>
                    <span>↻ {post.metrics.reposts}</span>
                    <span>❞ {post.metrics.quotes}</span>
                  </Stats>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button size="sm" onClick={() => window.open(post.url, "_blank", "noopener,noreferrer")}>
                      Open on X
                    </Button>
                    {viewerCanReply && (
                      <>
                        <Button
                          size="sm"
                          title="Like"
                          disabled={engageMutation.isPending}
                          onClick={() => engageMutation.mutate({ action: "like", postId: post.id })}
                        >
                          ♥
                        </Button>
                        <Button
                          size="sm"
                          title="Repost"
                          disabled={engageMutation.isPending}
                          onClick={() => engageMutation.mutate({ action: "repost", postId: post.id })}
                        >
                          ↻
                        </Button>
                        <Button
                          size="sm"
                          title="Quote"
                          disabled={engageMutation.isPending}
                          onClick={() =>
                            setQuoteOpenFor((current) =>
                              current === post.id ? null : post.id
                            )
                          }
                        >
                          ❞
                        </Button>
                      </>
                    )}
                    {viewerCanReply && (
                      <>
                        <Button
                          size="sm"
                          title="Comment"
                          onClick={() =>
                            setReplyOpenFor((current) => (current === post.id ? null : post.id))
                          }
                        >
                          💬
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            window.open(replyIntentUrl(post.id), "_blank", "noopener,noreferrer")
                          }
                        >
                          ↗
                        </Button>
                      </>
                    )}
                  </div>
                </Row>

                {replyOpenFor === post.id && (
                  <ReplyArea>
                    <textarea
                      rows={3}
                      value={replyDrafts[post.id] || ""}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({
                          ...prev,
                          [post.id]: e.target.value.slice(0, 280),
                        }))
                      }
                      style={{
                        width: "100%",
                        minHeight: 64,
                        resize: "vertical",
                        fontFamily: "MS Sans Serif, Segoe UI, Tahoma, sans-serif",
                        fontSize: 12,
                        background: nightMode ? "#0d1726" : "#fff",
                        color: nightMode ? "#e8f0fb" : "#111",
                        border: `1px solid ${nightMode ? "#4c6788" : "#9cabbb"}`,
                      }}
                      placeholder="Write your reply..."
                    />
                    <Row style={{ marginTop: 6 }}>
                      <Small $night={nightMode}>{(replyDrafts[post.id] || "").length}/280</Small>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button
                          size="sm"
                          onClick={() => setReplyOpenFor(null)}
                          disabled={replyMutation.isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={replyMutation.isPending || !(replyDrafts[post.id] || "").trim()}
                          onClick={() =>
                            replyMutation.mutate({
                              postId: post.id,
                              text: (replyDrafts[post.id] || "").trim(),
                            })
                          }
                        >
                          {replyMutation.isPending ? "Sending..." : "Send Reply"}
                        </Button>
                      </div>
                    </Row>
                  </ReplyArea>
                )}

                {quoteOpenFor === post.id && (
                  <ReplyArea>
                    <textarea
                      rows={2}
                      maxLength={280}
                      value={quoteDrafts[post.id] || ""}
                      onChange={(e) =>
                        setQuoteDrafts((prev) => ({
                          ...prev,
                          [post.id]: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        minHeight: 64,
                        resize: "vertical",
                        fontFamily: "MS Sans Serif, Segoe UI, Tahoma, sans-serif",
                        fontSize: 12,
                        background: nightMode ? "#0d1726" : "#fff",
                        color: nightMode ? "#e8f0fb" : "#111",
                        border: `1px solid ${nightMode ? "#4c6788" : "#9cabbb"}`,
                      }}
                      placeholder="Add quote text. @mentions and #hashtags work like X."
                    />
                    <Row style={{ marginTop: 8, justifyContent: "space-between" }}>
                      <Small $night={nightMode}>
                        {(quoteDrafts[post.id] || "").length}/280
                      </Small>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button
                          size="sm"
                          disabled={engageMutation.isPending}
                          onClick={() => {
                            const trimmed = (quoteDrafts[post.id] || "").trim();
                            if (!trimmed) {
                              setActionErrors((prev) => ({
                                ...prev,
                                [post.id]: "Quote text is required",
                              }));
                              return;
                            }
                            engageMutation.mutate({
                              action: "quote",
                              postId: post.id,
                              text: trimmed.slice(0, 280),
                            });
                          }}
                        >
                          Post Quote
                        </Button>
                        <Button size="sm" onClick={() => setQuoteOpenFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </Row>
                  </ReplyArea>
                )}

                {replyErrors[post.id] && (
                  <p style={{ marginTop: 6, marginBottom: 0, color: nightMode ? "#ff9f9f" : "#900", fontSize: 11 }}>
                    {replyErrors[post.id]}
                  </p>
                )}
                {actionErrors[post.id] && (
                  <p style={{ marginTop: 6, marginBottom: 0, color: nightMode ? "#ff9f9f" : "#900", fontSize: 11 }}>
                    {actionErrors[post.id]}
                  </p>
                )}
                {replySuccess[post.id] && (
                  <p style={{ marginTop: 6, marginBottom: 0, color: nightMode ? "#8ee9a7" : "#116611", fontSize: 11 }}>
                    Reply posted.{" "}
                    <a href={replySuccess[post.id]} target="_blank" rel="noopener noreferrer">
                      Open on X
                    </a>
                  </p>
                )}
                {actionSuccess[post.id] && (
                  <p style={{ marginTop: 6, marginBottom: 0, color: nightMode ? "#8ee9a7" : "#116611", fontSize: 11 }}>
                    {actionSuccess[post.id].startsWith("Quote posted: ") ? (
                      <>
                        Quote posted.{" "}
                        <a
                          href={actionSuccess[post.id].replace("Quote posted: ", "")}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open on X
                        </a>
                      </>
                    ) : (
                      actionSuccess[post.id]
                    )}
                  </p>
                )}
              </PostCard>
            );
          })
        )}
      </GroupBox>
    </>
  );
}
