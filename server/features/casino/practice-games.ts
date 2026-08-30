import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { casinoPracticeGames, casinoPracticePlays } from "@shared/schema";
import { db } from "../../db";
import type { ConsoleAuthUser } from "../console/types";

export type CasinoPracticeGameStatus = "submitted" | "approved" | "rejected";

export type CasinoPracticeGameDTO = {
  id: number;
  slug: string;
  creatorUserId: number;
  creatorName: string;
  title: string;
  summary: string;
  instructions: string;
  outcomes: string[];
  status: CasinoPracticeGameStatus;
  active: boolean;
  moderationNote: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  playCount: number;
  practiceOnly: true;
  wageringEnabled: false;
  rewardsEnabled: false;
  currency: null;
  createdAt: string;
  updatedAt: string;
};

function practiceGameSlug(title: string, userId: number) {
  const titlePart = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "table";
  return `practice-${userId}-${titlePart}-${randomUUID().slice(0, 8)}`.slice(0, 200);
}

export function normalizePracticeOutcomes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function rowToDto(row: typeof casinoPracticeGames.$inferSelect): CasinoPracticeGameDTO {
  return {
    id: row.id,
    slug: row.slug,
    creatorUserId: row.creatorUserId,
    creatorName: row.creatorName,
    title: row.title,
    summary: row.summary,
    instructions: row.instructions,
    outcomes: normalizePracticeOutcomes(row.outcomes),
    status: row.status as CasinoPracticeGameStatus,
    active: row.active,
    moderationNote: row.moderationNote ?? null,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    playCount: row.playCount,
    practiceOnly: true,
    wageringEnabled: false,
    rewardsEnabled: false,
    currency: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createCasinoPracticeGame(input: {
  creator: ConsoleAuthUser;
  title: string;
  summary: string;
  instructions: string;
  outcomes: string[];
}) {
  const [created] = await db
    .insert(casinoPracticeGames)
    .values({
      slug: practiceGameSlug(input.title, input.creator.id),
      creatorUserId: input.creator.id,
      creatorName: input.creator.displayName || input.creator.username,
      title: input.title,
      summary: input.summary,
      instructions: input.instructions,
      outcomes: input.outcomes,
      status: "submitted",
      active: false,
      updatedAt: new Date(),
    })
    .returning();
  return rowToDto(created);
}

export async function listPublishedCasinoPracticeGames() {
  const rows = await db
    .select()
    .from(casinoPracticeGames)
    .where(
      and(
        eq(casinoPracticeGames.status, "approved"),
        eq(casinoPracticeGames.active, true)
      )
    )
    .orderBy(desc(casinoPracticeGames.updatedAt));
  return rows.map(rowToDto);
}

export async function listCasinoPracticeGamesForCreator(creatorUserId: number) {
  const rows = await db
    .select()
    .from(casinoPracticeGames)
    .where(eq(casinoPracticeGames.creatorUserId, creatorUserId))
    .orderBy(desc(casinoPracticeGames.updatedAt));
  return rows.map(rowToDto);
}

export async function listCasinoPracticeModerationQueue() {
  const rows = await db
    .select()
    .from(casinoPracticeGames)
    .where(eq(casinoPracticeGames.status, "submitted"))
    .orderBy(casinoPracticeGames.createdAt);
  return rows.map(rowToDto);
}

export async function reviewCasinoPracticeGame(input: {
  gameId: number;
  reviewerUserId: number;
  action: "approve" | "reject";
  note: string;
}) {
  const status: CasinoPracticeGameStatus =
    input.action === "approve" ? "approved" : "rejected";
  const [updated] = await db
    .update(casinoPracticeGames)
    .set({
      status,
      active: status === "approved",
      moderationNote: input.note || null,
      reviewedBy: input.reviewerUserId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(casinoPracticeGames.id, input.gameId),
        eq(casinoPracticeGames.status, "submitted")
      )
    )
    .returning();
  if (!updated) throw new Error("Practice table is not awaiting review.");
  return rowToDto(updated);
}

export async function playCasinoPracticeGame(input: {
  slug: string;
  userId: number;
  outcomeIndex?: number;
}) {
  const [game] = await db
    .select()
    .from(casinoPracticeGames)
    .where(
      and(
        eq(casinoPracticeGames.slug, input.slug),
        eq(casinoPracticeGames.status, "approved"),
        eq(casinoPracticeGames.active, true)
      )
    )
    .limit(1);
  if (!game) throw new Error("Practice table is unavailable.");

  const outcomes = normalizePracticeOutcomes(game.outcomes);
  if (outcomes.length < 2) throw new Error("Practice table configuration is invalid.");
  const outcomeIndex =
    input.outcomeIndex === undefined ? randomInt(outcomes.length) : input.outcomeIndex;
  if (!Number.isInteger(outcomeIndex) || outcomeIndex < 0 || outcomeIndex >= outcomes.length) {
    throw new Error("Practice table result is invalid.");
  }
  const outcomeLabel = outcomes[outcomeIndex];

  const result = await db.transaction(async (tx) => {
    const [play] = await tx
      .insert(casinoPracticePlays)
      .values({
        gameId: game.id,
        userId: input.userId,
        outcomeIndex,
        outcomeLabel,
      })
      .returning();
    const [updatedGame] = await tx
      .update(casinoPracticeGames)
      .set({
        playCount: sql`${casinoPracticeGames.playCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(casinoPracticeGames.id, game.id))
      .returning();
    return { play, game: updatedGame };
  });

  return {
    ok: true,
    game: rowToDto(result.game),
    result: {
      playId: result.play.id,
      outcomeIndex,
      outcomeLabel,
      practiceOnly: true,
      wager: null,
      reward: null,
      createdAt: result.play.createdAt.toISOString(),
    },
  };
}
