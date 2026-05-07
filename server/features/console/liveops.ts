import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { awardXp } from "../../lib/xp";
import { xpEvents } from "@shared/schema";

const CONSOLE_CREATOR_XP = {
  submission: { amount: 15, dailyCap: 3, reason: "console_game_submission" },
  update: { amount: 5, dailyCap: 5, reason: "console_game_update" },
  publish: { amount: 25, dailyCap: 3, reason: "console_game_publish" },
  publish_update: { amount: 10, dailyCap: 5, reason: "console_game_update_publish" },
} as const;

const CONSOLE_PLAYER_XP = {
  first_play: { amount: 5, dailyCap: 20, reason: "console_game_first_play" },
  score_submit: { amount: 1, dailyCap: 25, reason: "console_score_submit" },
  personal_best: { amount: 3, dailyCap: 15, reason: "console_personal_best" },
  game_champion: { amount: 8, dailyCap: 5, reason: "console_game_champion" },
} as const;

export type ConsoleCreatorXpEvent = keyof typeof CONSOLE_CREATOR_XP;
export type ConsolePlayerXpEvent = keyof typeof CONSOLE_PLAYER_XP;

type ConsoleXpAwardResult = {
  awarded: boolean;
  amount: number;
  reason: string;
  eventId: number | null;
  totalXp: number | null;
  skippedReason?: "missing_user" | "duplicate" | "daily_cap";
};

export async function awardConsoleCreatorXp(input: {
  userId: number | null | undefined;
  gameId: number;
  gameSlug: string;
  version: number;
  eventType: ConsoleCreatorXpEvent;
  awardedBy?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<{
  awarded: boolean;
  amount: number;
  reason: string;
  eventId: number | null;
  totalXp: number | null;
  skippedReason?: "missing_user" | "duplicate" | "daily_cap";
}> {
  const userId = Number(input.userId);
  const config = CONSOLE_CREATOR_XP[input.eventType];
  if (!Number.isInteger(userId) || userId <= 0) {
    return {
      awarded: false,
      amount: 0,
      reason: config.reason,
      eventId: null,
      totalXp: null,
      skippedReason: "missing_user",
    };
  }

  const gameId = Math.max(1, Math.floor(Number(input.gameId) || 0));
  const version = Math.max(1, Math.floor(Number(input.version) || 1));
  const eventType = input.eventType;

  const [duplicate] = await db
    .select({ id: xpEvents.id })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, userId),
        eq(xpEvents.reason, config.reason),
        sql`${xpEvents.metadata}->>'source' = 'console'`,
        sql`${xpEvents.metadata}->>'eventType' = ${eventType}`,
        sql`${xpEvents.metadata}->>'gameId' = ${String(gameId)}`,
        sql`${xpEvents.metadata}->>'version' = ${String(version)}`
      )
    )
    .limit(1);
  if (duplicate) {
    return {
      awarded: false,
      amount: 0,
      reason: config.reason,
      eventId: null,
      totalXp: null,
      skippedReason: "duplicate",
    };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [{ count: dailyCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, userId),
        eq(xpEvents.reason, config.reason),
        sql`${xpEvents.createdAt} >= ${todayStart}`
      )
    );
  if (Number(dailyCount || 0) >= config.dailyCap) {
    return {
      awarded: false,
      amount: 0,
      reason: config.reason,
      eventId: null,
      totalXp: null,
      skippedReason: "daily_cap",
    };
  }

  const awarded = await awardXp({
    userId,
    amount: config.amount,
    reason: config.reason,
    awardedBy: input.awardedBy ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      source: "console",
      eventType,
      gameId,
      gameSlug: input.gameSlug,
      version,
    },
  });

  return {
    awarded: true,
    amount: config.amount,
    reason: config.reason,
    eventId: awarded.eventId,
    totalXp: awarded.totalXp,
  };
}

export async function awardConsolePlayerXp(input: {
  userId: number | null | undefined;
  gameId: number;
  gameSlug: string;
  eventType: ConsolePlayerXpEvent;
  runId?: string | null;
  score?: number | null;
  rank?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<ConsoleXpAwardResult> {
  const userId = Number(input.userId);
  const config = CONSOLE_PLAYER_XP[input.eventType];
  if (!Number.isInteger(userId) || userId <= 0) {
    return {
      awarded: false,
      amount: 0,
      reason: config.reason,
      eventId: null,
      totalXp: null,
      skippedReason: "missing_user",
    };
  }

  const gameId = Math.max(1, Math.floor(Number(input.gameId) || 0));
  const eventType = input.eventType;
  const dedupeKey = buildConsolePlayerXpDedupeKey({
    gameId,
    eventType,
    runId: input.runId,
    score: input.score,
    rank: input.rank,
  });

  const [duplicate] = await db
    .select({ id: xpEvents.id })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, userId),
        eq(xpEvents.reason, config.reason),
        sql`${xpEvents.metadata}->>'source' = 'console'`,
        sql`${xpEvents.metadata}->>'eventType' = ${eventType}`,
        sql`${xpEvents.metadata}->>'dedupeKey' = ${dedupeKey}`
      )
    )
    .limit(1);
  if (duplicate) {
    return {
      awarded: false,
      amount: 0,
      reason: config.reason,
      eventId: null,
      totalXp: null,
      skippedReason: "duplicate",
    };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [{ count: dailyCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, userId),
        eq(xpEvents.reason, config.reason),
        sql`${xpEvents.createdAt} >= ${todayStart}`
      )
    );
  if (Number(dailyCount || 0) >= config.dailyCap) {
    return {
      awarded: false,
      amount: 0,
      reason: config.reason,
      eventId: null,
      totalXp: null,
      skippedReason: "daily_cap",
    };
  }

  const awarded = await awardXp({
    userId,
    amount: config.amount,
    reason: config.reason,
    metadata: {
      ...(input.metadata ?? {}),
      source: "console",
      eventType,
      dedupeKey,
      gameId,
      gameSlug: input.gameSlug,
      runId: input.runId ?? null,
      score: input.score ?? null,
      rank: input.rank ?? null,
    },
  });

  return {
    awarded: true,
    amount: config.amount,
    reason: config.reason,
    eventId: awarded.eventId,
    totalXp: awarded.totalXp,
  };
}

export async function awardConsolePlayerXpSafely(
  input: Parameters<typeof awardConsolePlayerXp>[0]
): Promise<ConsoleXpAwardResult | null> {
  try {
    return await awardConsolePlayerXp(input);
  } catch (error) {
    console.warn("[console] player XP award failed:", error);
    return null;
  }
}

function buildConsolePlayerXpDedupeKey(input: {
  gameId: number;
  eventType: ConsolePlayerXpEvent;
  runId?: string | null;
  score?: number | null;
  rank?: number | null;
}): string {
  if (input.eventType === "first_play") {
    return `${input.gameId}:${input.eventType}`;
  }
  if (input.runId) {
    return `${input.gameId}:${input.eventType}:run:${input.runId}`;
  }
  return [
    input.gameId,
    input.eventType,
    input.score == null ? "score:none" : `score:${Math.floor(Number(input.score) || 0)}`,
    input.rank == null ? "rank:none" : `rank:${Math.floor(Number(input.rank) || 0)}`,
  ].join(":");
}
