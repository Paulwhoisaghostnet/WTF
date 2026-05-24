import { useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink, Heart, MessageCircle, Quote, Repeat2 } from "lucide-react";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import { api } from "../../../lib/api";
import { WRichPreviewList, isMediaLink } from "../preview/WRichPreview";
import type { WAccount, WLink, WPost, WTimelineResponse } from "../types";

type WTimelinePanelProps = {
  accounts: WAccount[];
  diagnostics?: WTimelineResponse["diagnostics"];
  nightMode: boolean;
  posts: WPost[];
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
  border: 1px solid ${({ $night }) => ($night ? "#343a42" : "#d0d7de")};
  border-radius: 8px;
  background: ${({ $night }) =>
    $night
      ? "linear-gradient(180deg, #15181d 0%, #101318 100%)"
      : "linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%)"};
  margin-bottom: 14px;
  padding: 12px;
  box-shadow: ${({ $night }) =>
    $night ? "0 12px 28px rgba(0, 0, 0, 0.22)" : "0 12px 28px rgba(20, 30, 40, 0.08)"};
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
  margin: 10px 0;
  white-space: pre-wrap;
  line-height: 1.48;
  font-size: 14px;
  color: ${({ $night }) => ($night ? "#e5edf8" : "#131a22")};
`;

const Stats = styled.div<{ $night: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: ${({ $night }) => ($night ? "#a5bad7" : "#425364")};
`;

const MediaGrid = styled.div<{ $count: number }>`
  display: grid;
  gap: 8px;
  margin: 10px 0;
  grid-template-columns: ${({ $count }) =>
    $count > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"};
`;

const MediaTile = styled.a<{ $night: boolean }>`
  display: block;
  position: relative;
  border: 1px solid ${({ $night }) => ($night ? "#3f4f61" : "#cbd5df")};
  border-radius: 8px;
  background: ${({ $night }) => ($night ? "#03060a" : "#e9eef3")};
  min-height: 180px;
  overflow: hidden;
  text-decoration: none;
`;

const MediaImage = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  max-height: 440px;
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

function shortTezos(addr: string): string {
  if (!addr || addr.length < 14) return addr;
  return `${addr.slice(0, 7)}...${addr.slice(-5)}`;
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

function withoutPreviewUrls(text: string, links: WLink[]): string {
  let result = expandTcoUrls(text, links);
  for (const link of links) {
    for (const value of [link.url, link.expandedUrl, link.displayUrl]) {
      const target = String(value || "").trim();
      if (!target) continue;
      result = result.split(target).join(" ");
    }
  }
  return result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    diagnostics,
    nightMode,
    posts,
  } = props;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const accountCountLabel = `${accounts.length} connected account${accounts.length === 1 ? "" : "s"}`;

  const runTimelineAction = async (post: WPost, action: "like" | "repost" | "reply" | "quote") => {
    const actionKey = `${action}:${post.id}`;
    try {
      let body: Record<string, string> = { postId: post.id };
      if (action === "reply" || action === "quote") {
        const text = window.prompt(action === "reply" ? "Reply" : "Quote");
        if (!text?.trim()) return;
        body = { ...body, text: text.trim() };
      }
      setPendingAction(actionKey);
      await api.post(`/api/w/${action}`, body);
    } catch (err: any) {
      window.alert(String(err?.message || err?.error || `Failed to ${action}`));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <>
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
            const postBody = withoutPreviewUrls(post.displayText || post.text, post.links || []);

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

                {postBody ? <PostText $night={nightMode}>{postBody}</PostText> : null}

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
                              style={{ display: "block", width: "100%", maxHeight: 440, objectFit: "contain", background: "#000" }}
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

                <WRichPreviewList links={nonMediaLinks} nightMode={nightMode} />

                <Row>
                  <Stats $night={nightMode}>
                    <span>♥ {post.metrics.likes}</span>
                    <span>↩ {post.metrics.replies}</span>
                    <span>↻ {post.metrics.reposts}</span>
                    <span>❞ {post.metrics.quotes}</span>
                  </Stats>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button
                      size="sm"
                      disabled={pendingAction === `reply:${post.id}`}
                      onClick={() => runTimelineAction(post, "reply")}
                    >
                      <MessageCircle size={14} aria-hidden="true" /> Reply
                    </Button>
                    <Button
                      size="sm"
                      disabled={pendingAction === `like:${post.id}`}
                      onClick={() => runTimelineAction(post, "like")}
                    >
                      <Heart size={14} aria-hidden="true" /> Like
                    </Button>
                    <Button
                      size="sm"
                      disabled={pendingAction === `repost:${post.id}`}
                      onClick={() => runTimelineAction(post, "repost")}
                    >
                      <Repeat2 size={14} aria-hidden="true" /> Repost
                    </Button>
                    <Button
                      size="sm"
                      disabled={pendingAction === `quote:${post.id}`}
                      onClick={() => runTimelineAction(post, "quote")}
                    >
                      <Quote size={14} aria-hidden="true" /> Quote
                    </Button>
                    <Button size="sm" onClick={() => window.open(post.url, "_blank", "noopener,noreferrer")}>
                      <ExternalLink size={14} aria-hidden="true" /> Open
                    </Button>
                  </div>
                </Row>
              </PostCard>
            );
          })
        )}
      </GroupBox>
    </>
  );
}
