import type { TimelinePayload } from "../timeline-types";
import { loadDigestTimelinePosts } from "./posts";

export async function buildDigestTimelinePayload(): Promise<TimelinePayload> {
  const rows = await loadDigestTimelinePosts();
  const timeline: TimelinePayload["timeline"] = rows.map((row) => ({
    id: row.id,
    text: "",
    displayText: "",
    createdAt: (row.postedAt ?? row.firstSeenAt).toISOString(),
    url: row.postUrl,
    media: [],
    links: [],
    author: {
      userId: 0,
      username: row.handle,
      displayName: `@${row.handle}`,
      twitterHandle: row.handle,
      name: `@${row.handle}`,
      avatarUrl: null,
    },
    metrics: { likes: 0, replies: 0, reposts: 0, quotes: 0 },
  }));

  const accounts = Array.from(
    new Map(
      timeline.map((post) => [
        post.author.twitterHandle,
        {
          userId: 0,
          username: post.author.twitterHandle,
          displayName: post.author.displayName,
          twitterHandle: post.author.twitterHandle,
          profileUrl: `https://x.com/${post.author.twitterHandle}`,
        },
      ])
    ).values()
  );

  return {
    source: "w-digest-scraper",
    refreshedAt: new Date().toISOString(),
    canReplyInline: false,
    accounts,
    timeline,
    diagnostics: {
      message:
        rows.length > 0
          ? "Read-only Tezos digest from profile URL scrapes (no X API, no native actions)."
          : "No digest posts yet. Configure W_X_SCRAPER_* credentials and enabled handles in admin.",
      fromCache: true,
      cachedAt: new Date().toISOString(),
    },
  };
}
