import {
  enrichTimelineRowsWithOembed,
  loadTimelinePostsFromDb,
  type WTimelineAuthorAccount,
} from "../../lib/timeline-db";
import type { TimelinePayload } from "./timeline-types";
export type { TimelinePayload } from "./timeline-types";

/** Map `x_timeline_posts` rows + optional oEmbed snippets into API timeline items. */
export async function buildTimelineFromDbCache(
  accounts: WTimelineAuthorAccount[],
  limitedHandlesLower: string[]
): Promise<TimelinePayload["timeline"] | null> {
  const dbRows = await loadTimelinePostsFromDb(limitedHandlesLower);
  if (dbRows.length === 0) return null;

  const byHandle = new Map(accounts.map((a) => [a.twitterHandle.toLowerCase(), a]));
  const oembedSnippets = await enrichTimelineRowsWithOembed(dbRows);
  const out: TimelinePayload["timeline"] = [];

  for (const row of dbRows) {
    const acc = byHandle.get(String(row.authorHandle || "").toLowerCase());
    if (!acc) continue;
    const snip = oembedSnippets.get(row.id);
    const text = String(row.text || "").trim() || snip?.text || "New post - open on X";
    const displayText = String(row.displayText || "").trim() || snip?.displayText || text;
    const media = Array.isArray(row.media)
      ? (row.media as TimelinePayload["timeline"][0]["media"])
      : [];
    const links = Array.isArray(row.links)
      ? (row.links as TimelinePayload["timeline"][0]["links"])
      : [];
    const m = row.metrics as Record<string, number> | null;

    out.push({
      id: row.id,
      text,
      displayText,
      createdAt: row.createdAt.toISOString(),
      url: `https://x.com/${acc.twitterHandle}/status/${row.id}`,
      media,
      links,
      author: {
        userId: acc.userId,
        username: acc.username,
        displayName: acc.displayName,
        twitterHandle: acc.twitterHandle,
        name: null,
        avatarUrl: null,
      },
      metrics: {
        likes: Number(m?.likes ?? 0),
        replies: Number(m?.replies ?? 0),
        reposts: Number(m?.reposts ?? 0),
        quotes: Number(m?.quotes ?? 0),
      },
    });
  }

  out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return out.length > 0 ? out : null;
}
