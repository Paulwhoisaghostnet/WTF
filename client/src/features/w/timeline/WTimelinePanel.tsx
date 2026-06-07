import { ExternalLink, MessageCircle, Repeat2 } from "lucide-react";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import type { WAccount, WPost, WTimelineResponse } from "../types";

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
  font-size: var(--wtf-type-caption, 13px);
  color: ${({ $night }) => ($night ? "#b8c5da" : "#3c4956")};
`;

const SummaryText = styled.div`
  margin-bottom: 8px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #374151);
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
`;

const PostHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
`;

const EmbedFrame = styled.iframe<{ $night: boolean }>`
  width: 100%;
  min-height: 280px;
  border: 1px solid ${({ $night }) => ($night ? "#3f4f61" : "#cbd5df")};
  border-radius: 8px;
  background: ${({ $night }) => ($night ? "#03060a" : "#fff")};
`;

function xIntentRepost(tweetId: string): string {
  return `https://twitter.com/intent/retweet?tweet_id=${encodeURIComponent(tweetId)}`;
}

function xIntentReply(tweetId: string): string {
  return `https://twitter.com/intent/tweet?in_reply_to=${encodeURIComponent(tweetId)}`;
}

export function WTimelinePanel(props: WTimelinePanelProps) {
  const { accounts, diagnostics, nightMode, posts } = props;
  const handleCount = accounts.length;

  return (
    <GroupBox label="Tezos digest">
      <SummaryText>
        Chronological feed from {handleCount} curated handle{handleCount === 1 ? "" : "s"}. Read-only in
        WTF, open X to reply or repost.
        {diagnostics?.cachedAt
          ? ` · Updated ${new Date(diagnostics.cachedAt).toLocaleTimeString()}`
          : null}
      </SummaryText>
      {posts.length === 0 ? (
        <Small $night={nightMode}>
          {diagnostics?.message ||
            "No posts yet. An admin must configure digest handles and scraper credentials."}
        </Small>
      ) : (
        posts.map((post) => (
          <PostCard $night={nightMode} key={post.id}>
            <PostHead>
              <Small $night={nightMode}>
                <strong>@{post.author.twitterHandle}</strong>
                {" · "}
                {new Date(post.createdAt).toLocaleString()}
              </Small>
              <ActionRow>
                <Button
                  size="sm"
                  onClick={() => window.open(post.url, "_blank", "noopener,noreferrer")}
                  title="View on X"
                >
                  <ExternalLink size={14} aria-hidden="true" /> View post on X
                </Button>
                <Button
                  size="sm"
                  onClick={() => window.open(xIntentRepost(post.id), "_blank", "noopener,noreferrer")}
                  title="Open X repost composer"
                >
                  <Repeat2 size={14} aria-hidden="true" /> Repost on X
                </Button>
                <Button
                  size="sm"
                  onClick={() => window.open(xIntentReply(post.id), "_blank", "noopener,noreferrer")}
                  title="Open X reply composer"
                >
                  <MessageCircle size={14} aria-hidden="true" /> Reply on X
                </Button>
              </ActionRow>
            </PostHead>
            <EmbedFrame
              $night={nightMode}
              src={`https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(post.id)}&theme=${nightMode ? "dark" : "light"}&dnt=true`}
              title={`Post ${post.id} by @${post.author.twitterHandle}`}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            />
          </PostCard>
        ))
      )}
    </GroupBox>
  );
}
