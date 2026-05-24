import { db } from "../../db";
import { eq } from "drizzle-orm";
import { mastodonAccounts, mastodonCachedToots, mastodonPreferences } from "@shared/schema";
import { getHomeTimeline, type MastodonToot } from "./mastodon-client";
import { decryptToken } from "./mastodon-auth";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getTimelineForUser(
  userId: number,
  limit = 20
): Promise<{ toots: MastodonToot[]; fromCache: boolean; linkedAt: string | null }> {
  const [account] = await db
    .select()
    .from(mastodonAccounts)
    .where(eq(mastodonAccounts.userId, userId))
    .limit(1);

  if (!account || !account.accessTokenEnc) {
    return { toots: [], fromCache: false, linkedAt: null };
  }

  const now = Date.now();
  const lastCached = await db
    .select()
    .from(mastodonCachedToots)
    .where(eq(mastodonCachedToots.userId, userId))
    .limit(1);

  const cacheAge = lastCached[0]
    ? now - lastCached[0].cachedAt.getTime()
    : Infinity;

  if (cacheAge < CACHE_TTL_MS && lastCached.length > 0) {
    const cached = await db
      .select()
      .from(mastodonCachedToots)
      .where(eq(mastodonCachedToots.userId, userId))
      .limit(limit)
      .orderBy(mastodonCachedToots.createdAt);

    const toots = cached.map((row) => ({
      id: row.tootId,
      content: row.content,
      created_at: row.createdAt.toISOString(),
      url: "",
      account: { id: "", username: account.handle ?? "", display_name: account.displayName ?? "", avatar: "" },
      media_attachments: row.media ? JSON.parse(row.media) : [],
      reblog: null,
      replies_count: 0,
      reblogs_count: 0,
      favourites_count: 0,
    })) as MastodonToot[];

    return { toots, fromCache: true, linkedAt: account.linkedAt.toISOString() };
  }

  const token = decryptToken(account.accessTokenEnc);
  const toots = await getHomeTimeline(account.instanceUrl, token, limit);

  // Re-cache
  if (toots.length > 0) {
    await db.delete(mastodonCachedToots).where(eq(mastodonCachedToots.userId, userId));
    await db.insert(mastodonCachedToots).values(
      toots.map((t) => ({
        userId,
        tootId: t.id,
        content: t.content,
        media: t.media_attachments.length > 0 ? JSON.stringify(t.media_attachments) : null,
        createdAt: new Date(t.created_at),
      }))
    );
  }

  return { toots, fromCache: false, linkedAt: account.linkedAt.toISOString() };
}
