import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

type WPost = {
  id: string;
  text: string;
  createdAt: string;
  url: string;
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

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
`;

const WBadge = styled.div`
  width: 22px;
  height: 22px;
  border: 1px solid #111;
  background: #111;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
`;

const Meta = styled.div`
  font-size: 11px;
  color: #333;
`;

const PostCard = styled.div`
  border: 1px solid #9a9a9a;
  background: #fff;
  margin-bottom: 8px;
  padding: 8px;
`;

const PostText = styled.p`
  margin: 6px 0 8px;
  white-space: pre-wrap;
  line-height: 1.35;
  font-size: 13px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const Small = styled.span`
  font-size: 11px;
  color: #444;
`;

const AccountGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 6px;
`;

const AccountChip = styled.a`
  display: inline-block;
  border: 1px solid #9a9a9a;
  background: #f3f3f3;
  padding: 4px 6px;
  font-size: 12px;
  color: #000080;
  text-decoration: none;
`;

function replyIntentUrl(postId: string): string {
  const q = new URLSearchParams({ in_reply_to: postId });
  return `https://x.com/intent/tweet?${q.toString()}`;
}

export function W() {
  const { user } = useAuth();
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [replySuccess, setReplySuccess] = useState<Record<string, string>>({});

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["w", "timeline"],
    queryFn: () => api.get<WTimelineResponse>("/api/w/timeline"),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const replyMutation = useMutation({
    mutationFn: ({
      postId,
      text,
    }: {
      postId: string;
      text: string;
    }) =>
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
      <Header>
        <WBadge>W</WBadge>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>W timeline digest</div>
            <Meta>
              Timeline of WTF users connected to X. Reply inline when your X account is connected with posting permissions.
            </Meta>
          </div>
      </Header>

      <Row style={{ marginBottom: 10 }}>
        <Small>
          Source: <strong>{data?.source || "unknown"}</strong>
          {" · "}
          Accounts: <strong>{accounts.length}</strong>
          {" · "}
          Posts: <strong>{posts.length}</strong>
          {" · "}
          Updated:{" "}
          <strong>
            {data?.refreshedAt
              ? new Date(data.refreshedAt).toLocaleTimeString()
              : "n/a"}
          </strong>
        </Small>
        <Button size="sm" disabled={isFetching} onClick={() => refetch()}>
          {isFetching ? "Refreshing..." : "Refresh"}
        </Button>
      </Row>

      {data?.diagnostics?.message && (
        <p style={{ fontSize: 11, color: "#7a2f00", marginBottom: 10 }}>
          {data.diagnostics.message}
        </p>
      )}

      <GroupBox label="Connected Accounts" style={{ marginBottom: 10 }}>
        <AccountGrid>
          {accounts.map((account) => (
            <AccountChip
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
            <Small>No verified connected X accounts available yet.</Small>
          )}
        </AccountGrid>
      </GroupBox>

      <GroupBox label="Timeline">
        {posts.length === 0 ? (
          <Small>No posts to show right now. Try Refresh in a minute.</Small>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id}>
              <Row>
                <strong>
                  {post.author.displayName || post.author.username} @{post.author.twitterHandle}
                </strong>
                <Small>{new Date(post.createdAt).toLocaleString()}</Small>
              </Row>

              <PostText>{post.text}</PostText>

              <Row>
                <Small>
                  ♥ {post.metrics.likes} · ↩ {post.metrics.replies} · ↻ {post.metrics.reposts}
                </Small>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button
                    size="sm"
                    onClick={() => window.open(post.url, "_blank", "noopener,noreferrer")}
                  >
                    Open on X
                  </Button>
                  {viewerCanReply && (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          setReplyOpenFor((current) =>
                            current === post.id ? null : post.id
                          )
                        }
                      >
                        Reply in W
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          window.open(
                            replyIntentUrl(post.id),
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                      >
                        Reply on X
                      </Button>
                    </>
                  )}
                </div>
              </Row>

              {replyOpenFor === post.id && (
                <div style={{ marginTop: 8 }}>
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
                    }}
                    placeholder="Write your reply..."
                  />
                  <Row style={{ marginTop: 6 }}>
                    <Small>{(replyDrafts[post.id] || "").length}/280</Small>
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
                        disabled={
                          replyMutation.isPending ||
                          !(replyDrafts[post.id] || "").trim()
                        }
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
                </div>
              )}

              {replyErrors[post.id] && (
                <p style={{ marginTop: 6, marginBottom: 0, color: "#900", fontSize: 11 }}>
                  {replyErrors[post.id]}
                </p>
              )}
              {replySuccess[post.id] && (
                <p style={{ marginTop: 6, marginBottom: 0, color: "#116611", fontSize: 11 }}>
                  Reply posted.{" "}
                  <a
                    href={replySuccess[post.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open on X
                  </a>
                </p>
              )}
            </PostCard>
          ))
        )}
      </GroupBox>
    </AppWindow>
  );
}
