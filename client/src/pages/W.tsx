import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type WAccount = {
  userId: number;
  username: string;
  displayName: string | null;
  twitterHandle: string;
  profileUrl: string;
};

type WMedia = {
  type: string;
  url: string | null;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
};

type WLink = {
  url: string;
  expandedUrl: string | null;
  displayUrl: string | null;
  preview: {
    finalUrl: string;
    canonicalUrl: string;
    domain: string;
    siteName: string | null;
    title: string;
    description: string | null;
    imageUrl: string | null;
    isObjkt: boolean;
  } | null;
};

type WPost = {
  id: string;
  text: string;
  displayText: string;
  createdAt: string;
  url: string;
  media: WMedia[];
  links: WLink[];
  author: {
    userId: number;
    username: string;
    displayName: string | null;
    twitterHandle: string;
    name: string | null;
    avatarUrl: string | null;
  };
  metrics: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  };
};

type WTimelineResponse = {
  source: "x-api-v2" | "links-only";
  refreshedAt: string;
  canReplyInline: boolean;
  accounts: WAccount[];
  timeline: WPost[];
  diagnostics?: {
    message?: string;
    skippedAccounts?: number;
  };
};

const Shell = styled.div<{ $night: boolean }>`
  background: ${({ $night }) =>
    $night
      ? "repeating-linear-gradient(0deg, #111722 0px, #111722 16px, #0c1118 16px, #0c1118 32px)"
      : "repeating-linear-gradient(0deg, #f7f9fb 0px, #f7f9fb 16px, #edf1f5 16px, #edf1f5 32px)"};
  border: 1px solid ${({ $night }) => ($night ? "#2c3e50" : "#a6adb5")};
  color: ${({ $night }) => ($night ? "#e7edf7" : "#10161e")};
  padding: 10px;
`;

const HeaderBar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const WBadge = styled.div<{ $night: boolean }>`
  width: 24px;
  height: 24px;
  border: 1px solid ${({ $night }) => ($night ? "#c7d3e5" : "#111")};
  background: ${({ $night }) => ($night ? "#141b26" : "#111")};
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  line-height: 22px;
  text-align: center;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  box-shadow: inset 0 0 0 1px ${({ $night }) => ($night ? "#2d3c50" : "#444")};
`;

const TitleWrap = styled.div`
  min-width: 0;
`;

const Title = styled.div`
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.2px;
`;

const Subtitle = styled.div<{ $night: boolean }>`
  font-size: 11px;
  margin-top: 2px;
  color: ${({ $night }) => ($night ? "#aebfd8" : "#3f4b57")};
`;

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

const AccountGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 6px;
`;

const AccountChip = styled.a<{ $night: boolean }>`
  display: inline-block;
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#182334" : "#f4f7fa")};
  padding: 5px 6px;
  font-size: 12px;
  color: ${({ $night }) => ($night ? "#9ec5ff" : "#0b4da6")};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const PostCard = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#2f425b" : "#aab5bf")};
  background: ${({ $night }) => ($night ? "#131f2f" : "#ffffff")};
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

function linkHref(link: WLink): string {
  return link.preview?.canonicalUrl || link.expandedUrl || link.url;
}

function renderAvatarContent(post: WPost) {
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

export function W() {
  const { user } = useAuth();
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [replySuccess, setReplySuccess] = useState<Record<string, string>>({});
  const [nightMode, setNightMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("w:night-mode") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("w:night-mode", nightMode ? "1" : "0");
  }, [nightMode]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["w", "timeline"],
    queryFn: () => api.get<WTimelineResponse>("/api/w/timeline"),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const replyMutation = useMutation({
    mutationFn: ({ postId, text }: { postId: string; text: string }) =>
      api.post<{ ok: boolean; id: string; url: string }>("/api/w/reply", {
        postId,
        text,
      }),
    onSuccess: (result, vars) => {
      setReplyErrors((prev) => ({ ...prev, [vars.postId]: "" }));
      setReplySuccess((prev) => ({ ...prev, [vars.postId]: result.url }));
      setReplyDrafts((prev) => ({ ...prev, [vars.postId]: "" }));
      setReplyOpenFor(null);
    },
    onError: (err, vars) => {
      const message = err instanceof Error ? err.message : "Reply failed";
      setReplyErrors((prev) => ({ ...prev, [vars.postId]: message }));
      setReplySuccess((prev) => ({ ...prev, [vars.postId]: "" }));
    },
  });

  if (isLoading) {
    return (
      <AppWindow title="W">
        <Hourglass size={32} />
      </AppWindow>
    );
  }

  const posts = data?.timeline || [];
  const accounts = data?.accounts || [];
  const viewerCanReply = Boolean(data?.canReplyInline && user?.twitterVerified);

  return (
    <AppWindow title="W">
      <Shell $night={nightMode}>
        <HeaderBar>
          <HeaderLeft>
            <WBadge $night={nightMode}>W</WBadge>
              <TitleWrap>
                <Title>W timeline (1996 mode)</Title>
                <Subtitle $night={nightMode}>
                  Like X, but with the bloat stripped out.
                </Subtitle>
              </TitleWrap>
          </HeaderLeft>
          <Button size="sm" onClick={() => setNightMode((v) => !v)}>
            {nightMode ? "Day mode" : "Night mode"}
          </Button>
        </HeaderBar>

        <Row style={{ marginBottom: 10 }}>
          <Small $night={nightMode}>
            Source: <strong>{data?.source || "unknown"}</strong>
            {" · "}
            Accounts: <strong>{accounts.length}</strong>
            {" · "}
            Posts: <strong>{posts.length}</strong>
            {" · "}
            Updated:{" "}
            <strong>
              {data?.refreshedAt ? new Date(data.refreshedAt).toLocaleTimeString() : "n/a"}
            </strong>
          </Small>
          <Button size="sm" disabled={isFetching} onClick={() => refetch()}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </Row>

        {data?.diagnostics?.message && (
          <p style={{ fontSize: 11, color: nightMode ? "#f5bc7b" : "#7a2f00", marginBottom: 10 }}>
            {data.diagnostics.message}
          </p>
        )}

        <GroupBox label="Connected Accounts" style={{ marginBottom: 10 }}>
          <AccountGrid>
            {accounts.map((account) => (
              <AccountChip
                $night={nightMode}
                key={`${account.userId}-${account.twitterHandle}`}
                href={account.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open @${account.twitterHandle} on X`}
              >
                {(account.displayName || account.username) + " "}@{account.twitterHandle}
              </AccountChip>
            ))}
            {accounts.length === 0 && (
              <Small $night={nightMode}>No verified connected X accounts available yet.</Small>
            )}
          </AccountGrid>
        </GroupBox>

        <GroupBox label="Timeline">
          {posts.length === 0 ? (
            <Small $night={nightMode}>No posts to show right now. Try Refresh in a minute.</Small>
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
                    </div>
                  </PostHead>

                  <PostText $night={nightMode}>{post.displayText || post.text}</PostText>

                  {Array.isArray(post.media) && post.media.length > 0 && (
                    <MediaGrid $count={post.media.length}>
                      {post.media.map((media, idx) => {
                        const mediaHref = media.url || post.url;
                        const imageSrc = media.url || media.previewUrl;
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
                            href={mediaHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={media.altText || `Open media on X (${media.type})`}
                          >
                            {imageSrc ? (
                              <MediaImage
                                src={imageSrc}
                                alt={media.altText || `${media.type} from @${post.author.twitterHandle}`}
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
                            onClick={() =>
                              setReplyOpenFor((current) => (current === post.id ? null : post.id))
                            }
                          >
                            Reply in W
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              window.open(replyIntentUrl(post.id), "_blank", "noopener,noreferrer")
                            }
                          >
                            Reply on X
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

                  {replyErrors[post.id] && (
                    <p style={{ marginTop: 6, marginBottom: 0, color: nightMode ? "#ff9f9f" : "#900", fontSize: 11 }}>
                      {replyErrors[post.id]}
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
                </PostCard>
              );
            })
          )}
        </GroupBox>
      </Shell>
    </AppWindow>
  );
}
