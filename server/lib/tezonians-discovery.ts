/**
 * Tezonians Discovery — passive harvesting of Tezos community members
 * who mention @wtf_gameshow on X.
 *
 * Runs as a scheduler job. Searches recent tweets mentioning the show
 * account, extracts unique authors, upserts them into the `tezonians`
 * table, and optionally auto-likes the mention tweet from the service
 * account.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { platformSettings, tezonians, users } from "@shared/schema";
import {
  getPlatformXOAuth2AccessToken,
  xOAuth2Request,
} from "./x-oauth2";
import { register, type JobResult } from "./scheduler";
import { canUseXFeature, recordXFeatureUsage } from "./x-usage-budget";

const SETTINGS_KEY = "w.tezonians_discovery_cursor";
const HANDLE = (process.env.W_X_DEFAULT_ACCOUNT_HANDLE || "wtf_gameshow").trim();

const AUTO_LIKE = process.env.W_TEZONIANS_AUTO_LIKE !== "false";
const DISCOVERY_INTERVAL_MS = 30 * 60_000;

async function getDiscoveryCursor(): Promise<string | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, SETTINGS_KEY));
  return row?.value ?? null;
}

async function setDiscoveryCursor(sinceId: string): Promise<void> {
  const value = sinceId;
  await db
    .insert(platformSettings)
    .values({ key: SETTINGS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

function staleSinceIdReplacement(err: any): string | null {
  if (Number(err?.status || 0) !== 400) return null;
  const body = `${err?.bodyText || ""} ${JSON.stringify(err?.payload || {})}`;
  if (!body.includes("since_id") || !body.includes("must be a tweet id created after")) return null;
  const match = body.match(/larger than\s+(\d{5,})/i);
  if (!match?.[1]) return null;
  try {
    return (BigInt(match[1]) + 1n).toString();
  } catch {
    return null;
  }
}

export async function runTezoniansDiscovery() {
  const accessToken = await getPlatformXOAuth2AccessToken();
  if (!accessToken) {
    console.warn("[tezonians] no platform token — skipping discovery");
    return;
  }

  const sinceId = await getDiscoveryCursor();
  const budget = await canUseXFeature("search_recovery_posts", 1);
  if (!budget.allowed) {
    console.warn("[tezonians] search skipped — monthly X search budget exhausted");
    return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: budget.reason } } satisfies JobResult;
  }

  const qs = new URLSearchParams({
    query: `@${HANDLE} -is:retweet`,
    max_results: "25",
    "tweet.fields": "author_id,created_at,id",
    expansions: "author_id",
    "user.fields": "id,username,name,profile_image_url",
  });
  if (sinceId) qs.set("since_id", sinceId);

  let result: any;
  try {
    result = await xOAuth2Request({
      method: "GET",
      path: `/tweets/search/recent?${qs.toString()}`,
      accessToken,
    });
  } catch (err: any) {
    if (err?.status === 402) {
      console.warn("[tezonians] search skipped — X API credits exhausted");
      return {
        itemsIn: 0,
        itemsOut: 0,
        cursorAfter: { skipped: "x_api_402_credits_exhausted" },
      } satisfies JobResult;
    }
    if (err?.status === 429) {
      console.warn("[tezonians] rate-limited — will retry next cycle");
      return;
    }
    const replacement = staleSinceIdReplacement(err);
    if (replacement) {
      await setDiscoveryCursor(replacement);
      console.warn(`[tezonians] stale since_id reset to ${replacement}`);
      return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: "stale_since_id", resetTo: replacement } } satisfies JobResult;
    }
    throw err;
  }

  const tweets = result?.data || [];
  await recordXFeatureUsage("search_recovery_posts", Array.isArray(tweets) ? tweets.length : 0);
  const includes = result?.includes?.users || [];

  if (tweets.length === 0) {
    return { itemsIn: 0, itemsOut: 0 };
  }

  const newestId = tweets[0]?.id;
  if (newestId) await setDiscoveryCursor(newestId);

  const userMap = new Map<string, any>();
  for (const u of includes) userMap.set(u.id, u);

  let found = 0;
  let liked = 0;
  let skipped = 0;

  for (const tweet of tweets) {
    const authorId = tweet.author_id;
    if (!authorId) continue;

    const xUser = userMap.get(authorId);
    const handle = xUser?.username || null;
    const name = xUser?.name || null;
    const pfp = xUser?.profile_image_url || null;

    const linkedUser = handle
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.twitterId, authorId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null;

    try {
      await db
        .insert(tezonians)
        .values({
          twitterId: authorId,
          twitterHandle: handle,
          twitterName: name,
          profileImageUrl: pfp,
          discoveredVia: "mention",
          sourceTweetId: tweet.id,
          autoLiked: false,
          userId: linkedUser?.id ?? null,
        })
        .onConflictDoUpdate({
          target: tezonians.twitterId,
          set: {
            twitterHandle: handle ?? sql`tezonians.twitter_handle`,
            twitterName: name ?? sql`tezonians.twitter_name`,
            profileImageUrl: pfp ?? sql`tezonians.profile_image_url`,
            userId: linkedUser?.id ?? sql`tezonians.user_id`,
            updatedAt: new Date(),
          },
        });
      found++;
    } catch {
      skipped++;
      continue;
    }

    if (AUTO_LIKE && tweet.id) {
      try {
        await xOAuth2Request({
          method: "POST",
          path: `/users/me/likes`,
          accessToken,
          body: { tweet_id: tweet.id },
        });
        await db
          .update(tezonians)
          .set({ autoLiked: true })
          .where(eq(tezonians.twitterId, authorId));
        liked++;
      } catch {
        // non-fatal — the like may already exist or be rate-limited
      }
    }
  }

  console.log(`[tezonians] discovery: found=${found} liked=${liked} skipped=${skipped}`);
  return { itemsIn: tweets.length, itemsOut: found } satisfies JobResult;
}

export function registerTezoniansDiscovery(): void {
  register({
    name: "tezonians-discovery",
    fn: runTezoniansDiscovery,
    intervalMs: DISCOVERY_INTERVAL_MS,
    initialDelayMs: 60_000,
  });
}
