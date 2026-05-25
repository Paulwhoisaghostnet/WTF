/**
 * Phase 5 — CRP nomination verifier.
 *
 * Polls the own-timeline of every user who has linked X write access and
 * looks for posts carrying the hashtag configured on each active
 * `x_hashtag_post` side quest. For each matching post we:
 *
 *   1. Parse `@`-mentions from `entities.mentions`.
 *   2. Drop the poster's handle and anything in `EXCLUDED_CRP_HANDLES`
 *      (plus any per-quest extra exclusions).
 *   3. Dedupe mentions per post (unique nominee count).
 *   4. Upsert a `crp_nominations` row keyed on `(side_quest_id, post_id)`.
 *   5. If the post meets `minMentions`, create (or update) a
 *      `side_quest_completion` row tied to the nominator, and mirror the
 *      reward into `reward_ledger` scaled by unique nominee count up to
 *      `maxMentions`.
 *
 * The `reward_count` cached on `crp_nominations` reflects what we've
 * already paid for — a subsequent poll that increases the nominee count
 * tops up the delta without double-paying the earlier portion.
 */

import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  crpNominations,
  rewardLedger,
  sideQuestCompletions,
  sideQuests,
  users,
} from "@shared/schema";
import { getExcludedCrpHandles } from "../constants";
import {
  getTwitterReadAuthForUser,
  X_API_BASE_URL,
  XApiError,
  xRequestAsUser,
} from "../../routes/w";
import { awardXp } from "../xp";
import { hasActiveUserCurse } from "../user-curses";

const HASHTAG_REGEX_CACHE = new Map<string, RegExp>();
const MAX_POSTS_PER_USER = Math.max(
  5,
  Math.min(100, Number(process.env.WTF_CRP_POSTS_PER_USER || 20))
);
const MAX_USERS_PER_CYCLE = Math.max(
  1,
  Math.min(200, Number(process.env.WTF_CRP_MAX_USERS || 50))
);
const WINDOW_DAYS_BACK = Math.max(
  1,
  Math.min(14, Number(process.env.WTF_CRP_WINDOW_DAYS || 7))
);

function hashtagRegex(tag: string): RegExp {
  const clean = tag.replace(/^#/, "").trim();
  const cached = HASHTAG_REGEX_CACHE.get(clean.toLowerCase());
  if (cached) return cached;
  const r = new RegExp(`#${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  HASHTAG_REGEX_CACHE.set(clean.toLowerCase(), r);
  return r;
}

interface QuestConfig {
  hashtag: string;
  minMentions: number;
  maxMentions: number;
  excludeHandles?: string[];
  rewardPerNominee?: number;
  campaignStartsAt?: string;
  campaignEndsAt?: string;
}

interface ActiveQuest {
  id: number;
  title: string;
  rewardAmountWtf: number;
  rewardXp: number;
  maxCompletions: number | null;
  autoVerifyConfig: QuestConfig;
}

interface XTimelineTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  entities?: {
    mentions?: Array<{ username: string; id?: string }>;
    hashtags?: Array<{ tag: string }>;
  };
}

async function fetchActiveQuests(): Promise<ActiveQuest[]> {
  const rows = await db
    .select({
      id: sideQuests.id,
      title: sideQuests.title,
      rewardAmountWtf: sideQuests.rewardAmountWtf,
      rewardXp: sideQuests.rewardXp,
      maxCompletions: sideQuests.maxCompletions,
      autoVerifyType: sideQuests.autoVerifyType,
      autoVerifyConfig: sideQuests.autoVerifyConfig,
      status: sideQuests.status,
    })
    .from(sideQuests)
    .where(
      and(
        eq(sideQuests.autoVerifyType, "x_hashtag_post"),
        eq(sideQuests.status, "active")
      )
    );
  const out: ActiveQuest[] = [];
  for (const r of rows) {
    const cfg = (r.autoVerifyConfig ?? {}) as Partial<QuestConfig>;
    if (!cfg?.hashtag || typeof cfg.hashtag !== "string") continue;
    out.push({
      id: r.id,
      title: r.title,
      rewardAmountWtf: Number(r.rewardAmountWtf ?? 0),
      rewardXp: Number(r.rewardXp ?? 0),
      maxCompletions: r.maxCompletions ?? null,
      autoVerifyConfig: {
        hashtag: cfg.hashtag,
        minMentions:
          typeof cfg.minMentions === "number" && cfg.minMentions > 0
            ? cfg.minMentions
            : 1,
        maxMentions:
          typeof cfg.maxMentions === "number" && cfg.maxMentions > 0
            ? cfg.maxMentions
            : 10,
        excludeHandles: Array.isArray(cfg.excludeHandles)
          ? (cfg.excludeHandles as string[])
          : [],
        rewardPerNominee:
          typeof cfg.rewardPerNominee === "number" && cfg.rewardPerNominee >= 0
            ? cfg.rewardPerNominee
            : undefined,
        campaignStartsAt: cfg.campaignStartsAt,
        campaignEndsAt: cfg.campaignEndsAt,
      },
    });
  }
  return out;
}

async function fetchLinkedUsers(): Promise<
  Array<{
    id: number;
    username: string;
    twitterId: string | null;
    twitterHandle: string | null;
    twitterOauthToken: string | null;
    twitterOauthTokenSecret: string | null;
  }>
> {
  return db
    .select({
      id: users.id,
      username: users.username,
      twitterId: users.twitterId,
      twitterHandle: users.twitterHandle,
      twitterOauthToken: users.twitterOauthToken,
      twitterOauthTokenSecret: users.twitterOauthTokenSecret,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.twitterOauthToken),
        isNotNull(users.twitterOauthTokenSecret),
        isNotNull(users.twitterId)
      )
    )
    .limit(MAX_USERS_PER_CYCLE);
}

async function fetchTimeline(
  user: {
    id: number;
    twitterId: string | null;
    twitterOauthToken: string | null;
    twitterOauthTokenSecret: string | null;
  }
): Promise<XTimelineTweet[]> {
  if (!user.twitterId) return [];
  const auth = getTwitterReadAuthForUser(user);
  if (!auth) return [];

  const since = new Date(
    Date.now() - WINDOW_DAYS_BACK * 24 * 60 * 60 * 1000
  ).toISOString();
  const url = new URL(
    `${X_API_BASE_URL}/users/${encodeURIComponent(user.twitterId)}/tweets`
  );
  url.searchParams.set("max_results", String(MAX_POSTS_PER_USER));
  url.searchParams.set(
    "tweet.fields",
    "created_at,entities,text,author_id"
  );
  url.searchParams.set("start_time", since);
  url.searchParams.set("exclude", "retweets,replies");

  try {
    const payload = await xRequestAsUser({
      method: "GET",
      url: url.toString(),
      auth,
    });
    return Array.isArray(payload?.data) ? (payload.data as XTimelineTweet[]) : [];
  } catch (err) {
    if (err instanceof XApiError && err.status === 429) {
      console.warn(
        "[crp-watcher] rate-limited by X API, skipping user",
        user.id
      );
      return [];
    }
    console.warn(
      `[crp-watcher] timeline fetch failed for user ${user.id}:`,
      (err as Error)?.message || err
    );
    return [];
  }
}

function parseNominees(
  tweet: XTimelineTweet,
  nominatorHandle: string | null,
  excludeSet: Set<string>
): string[] {
  const mentions = tweet.entities?.mentions ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of mentions) {
    const raw = (m.username || "").toLowerCase();
    if (!raw) continue;
    if (nominatorHandle && raw === nominatorHandle.toLowerCase()) continue;
    if (excludeSet.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

async function ensureCompletion(
  quest: ActiveQuest,
  nominatorUserId: number,
  postId: string,
  uniqueCount: number
): Promise<number | null> {
  const rewardCount = Math.min(uniqueCount, quest.autoVerifyConfig.maxMentions);
  if (rewardCount < quest.autoVerifyConfig.minMentions) return null;

  const existing = await db
    .select({ id: sideQuestCompletions.id })
    .from(sideQuestCompletions)
    .where(
      and(
        eq(sideQuestCompletions.sideQuestId, quest.id),
        eq(sideQuestCompletions.userId, nominatorUserId)
      )
    )
    .orderBy(desc(sideQuestCompletions.completedAt))
    .limit(1);

  if (existing[0]?.id) return existing[0].id;

  const [row] = await db
    .insert(sideQuestCompletions)
    .values({
      sideQuestId: quest.id,
      userId: nominatorUserId,
      proofText: `CRP nomination post ${postId} — ${uniqueCount} unique nominee(s)`,
      proofUrl: `https://x.com/i/status/${postId}`,
      approved: true,
    })
    .returning({ id: sideQuestCompletions.id });
  return row?.id ?? null;
}

async function topUpReward(params: {
  quest: ActiveQuest;
  nominatorUserId: number;
  postId: string;
  previousCount: number;
  currentCount: number;
}): Promise<void> {
  const { quest, nominatorUserId, postId, previousCount, currentCount } = params;
  const delta = Math.max(
    0,
    Math.min(quest.autoVerifyConfig.maxMentions, currentCount) -
      Math.min(quest.autoVerifyConfig.maxMentions, previousCount)
  );
  if (delta <= 0) return;

  const perNomineeWtf =
    quest.autoVerifyConfig.rewardPerNominee ??
    (quest.rewardAmountWtf > 0
      ? Math.floor(quest.rewardAmountWtf / quest.autoVerifyConfig.maxMentions)
      : 0);

  const deltaWtf = perNomineeWtf * delta;
  if (deltaWtf > 0) {
    if (await hasActiveUserCurse(nominatorUserId, "wtf_reward_embargo")) {
      console.warn(
        `[crp] skipped ${deltaWtf} WTF for cursed user ${nominatorUserId} on quest ${quest.id}`
      );
    } else {
      await db.insert(rewardLedger).values({
        userId: nominatorUserId,
        amountWtf: deltaWtf,
        reason: `${quest.title} — CRP post ${postId} (+${delta} nominees)`,
        sourceType: "side_quest",
        sourceId: quest.id,
      });
    }
  }

  if (quest.rewardXp > 0 && previousCount === 0) {
    try {
      await awardXp({
        userId: nominatorUserId,
        amount: quest.rewardXp,
        reason: "side_quest_reward",
        metadata: {
          sideQuestId: quest.id,
          postId,
        },
      });
    } catch (err) {
      console.warn(
        "[crp-watcher] XP award failed:",
        (err as Error)?.message || err
      );
    }
  }
}

export async function runCrpNominationWatcher(): Promise<{
  quests: number;
  usersPolled: number;
  postsObserved: number;
  nominationsUpserted: number;
  rewardsIssued: number;
}> {
  const quests = await fetchActiveQuests();
  if (quests.length === 0) {
    return {
      quests: 0,
      usersPolled: 0,
      postsObserved: 0,
      nominationsUpserted: 0,
      rewardsIssued: 0,
    };
  }

  const baseExclude = getExcludedCrpHandles();
  const linkedUsers = await fetchLinkedUsers();

  let postsObserved = 0;
  let nominationsUpserted = 0;
  let rewardsIssued = 0;

  for (const user of linkedUsers) {
    const timeline = await fetchTimeline(user);
    if (timeline.length === 0) continue;
    postsObserved += timeline.length;

    for (const quest of quests) {
      const regex = hashtagRegex(quest.autoVerifyConfig.hashtag);
      const extra = (quest.autoVerifyConfig.excludeHandles ?? []).map((h) =>
        h.replace(/^@/, "").toLowerCase()
      );
      const excludeSet = new Set<string>([...baseExclude, ...extra]);

      for (const tweet of timeline) {
        if (!regex.test(tweet.text || "")) continue;
        const nominees = parseNominees(tweet, user.twitterHandle, excludeSet);
        const uniqueCount = nominees.length;

        const existingRows = await db
          .select({
            id: crpNominations.id,
            uniqueCount: crpNominations.uniqueNomineeCount,
            rewardCount: crpNominations.rewardCount,
          })
          .from(crpNominations)
          .where(
            and(
              eq(crpNominations.sideQuestId, quest.id),
              eq(crpNominations.postId, tweet.id)
            )
          )
          .limit(1);
        const prev = existingRows[0];

        if (!prev) {
          await db.insert(crpNominations).values({
            sideQuestId: quest.id,
            nominatorUserId: user.id,
            nominatorXId: user.twitterId ?? "",
            postId: tweet.id,
            postUrl: `https://x.com/i/status/${tweet.id}`,
            nomineeHandles: nominees as any,
            uniqueNomineeCount: uniqueCount,
            rewardCount: 0,
            observedAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
          });
          nominationsUpserted += 1;
        } else if (uniqueCount !== prev.uniqueCount) {
          await db
            .update(crpNominations)
            .set({
              uniqueNomineeCount: uniqueCount,
              nomineeHandles: nominees as any,
              observedAt: tweet.created_at
                ? new Date(tweet.created_at)
                : new Date(),
            })
            .where(eq(crpNominations.id, prev.id));
          nominationsUpserted += 1;
        }

        if (uniqueCount >= quest.autoVerifyConfig.minMentions) {
          const completionId = await ensureCompletion(
            quest,
            user.id,
            tweet.id,
            uniqueCount
          );
          if (completionId !== null) {
            const previousRewardCount = prev?.rewardCount ?? 0;
            await topUpReward({
              quest,
              nominatorUserId: user.id,
              postId: tweet.id,
              previousCount: previousRewardCount,
              currentCount: uniqueCount,
            });
            await db
              .update(crpNominations)
              .set({
                rewardCount: Math.min(
                  uniqueCount,
                  quest.autoVerifyConfig.maxMentions
                ),
              })
              .where(
                and(
                  eq(crpNominations.sideQuestId, quest.id),
                  eq(crpNominations.postId, tweet.id)
                )
              );
            if (previousRewardCount === 0) rewardsIssued += 1;
          }
        }
      }
    }
  }

  return {
    quests: quests.length,
    usersPolled: linkedUsers.length,
    postsObserved,
    nominationsUpserted,
    rewardsIssued,
  };
}
