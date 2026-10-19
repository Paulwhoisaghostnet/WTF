import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { challenges, gameshowRoundPlans, operatorActions, rounds, seasons } from "@shared/schema";
import { GameshowError } from "./policy";
import type { EventSink, GameshowEvent } from "./service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = { userId: number; ip?: string | null };

async function lockRound(tx: Transaction, roundId: number) {
  const [identity] = await tx.select({ seasonId: rounds.seasonId }).from(rounds).where(eq(rounds.id, roundId));
  if (!identity) throw new GameshowError(404, "Round not found");
  if (identity.seasonId !== null) await tx.select().from(seasons).where(eq(seasons.id, identity.seasonId)).for("update");
  const [round] = await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update");
  if (!round || round.seasonId !== identity.seasonId) throw new GameshowError(409, "Round changed seasons. Refresh before saving.");
  return round;
}

/** Existing editors retain preparation fields; live status is owned by the host cue service. */
export function createGameshowEditing(database: typeof db, emit?: EventSink) {
  async function record(tx: Transaction, actor: Actor, kind: "round" | "season" | "challenge", targetId: number, seasonId: number | null, fields: string[]) {
    const action = `gameshow.${kind}.edited` as const;
    const [entry] = await tx.insert(operatorActions).values({ actorUserId: actor.userId, actionKind: action, targetKind: kind, targetId,
      payloadJson: { seasonId, fields }, ip: actor.ip ?? null }).returning({ id: operatorActions.id });
    return { id: entry.id, action, actorUserId: actor.userId, seasonId, targetId };
  }
  async function finish<T>(result: { row: T; event: GameshowEvent | null }) {
    if (emit && result.event) await emit(result.event).catch((error) => console.error("[gameshow] edit event projection failed", { auditId: result.event!.id, error }));
    return result.row;
  }

  async function editRound(roundId: number, input: Record<string, unknown>, actor: Actor) {
    return finish(await database.transaction(async (tx) => {
      const round = await lockRound(tx, roundId);
      const updates = { ...input };
      const belongsToSeason = round.seasonId !== null || (updates.seasonId !== undefined && updates.seasonId !== null);
      if (belongsToSeason && updates.status !== undefined) {
        if (updates.status !== round.status) throw new GameshowError(409, "Use the Host Console to start, close, or finish a season round");
        delete updates.status;
      }
      if (updates.seasonId !== undefined && updates.seasonId !== round.seasonId && round.status !== "upcoming") {
        throw new GameshowError(409, "A round that has started cannot change seasons");
      }
      if (!Object.keys(updates).length) return { row: round, event: null };
      const [updated] = await tx.update(rounds).set(updates).where(eq(rounds.id, roundId)).returning();
      await tx.update(gameshowRoundPlans).set({ revision: sql`${gameshowRoundPlans.revision} + 1`, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(gameshowRoundPlans.roundId, roundId));
      const event = await record(tx, actor, "round", roundId, updated.seasonId, Object.keys(updates));
      return { row: updated, event };
    }));
  }

  async function editChallenge(challengeId: number, input: Record<string, unknown>, actor: Actor) {
    return finish(await database.transaction(async (tx) => {
      const [identity] = await tx.select({ roundId: challenges.roundId }).from(challenges).where(eq(challenges.id, challengeId));
      if (!identity) throw new GameshowError(404, "Challenge not found");
      const round = identity.roundId !== null ? await lockRound(tx, identity.roundId) : null;
      const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, challengeId)).for("update");
      if (!challenge || challenge.roundId !== identity.roundId) throw new GameshowError(409, "Challenge changed rounds. Refresh before saving.");
      const updates = { ...input };
      let targetRound = round;
      if (typeof updates.roundId === "number" && updates.roundId !== challenge.roundId) targetRound = await lockRound(tx, updates.roundId);
      if ((round?.seasonId || targetRound?.seasonId) && updates.status !== undefined) {
        if (updates.status !== challenge.status) throw new GameshowError(409, "Use the Host Console to change a season challenge's live status");
        delete updates.status;
      }
      if (updates.roundId !== undefined && updates.roundId !== challenge.roundId
        && ((round && round.status !== "upcoming") || (targetRound && targetRound.status !== "upcoming") || challenge.status !== "draft")) {
        throw new GameshowError(409, "Only draft challenges in upcoming rounds can be reassigned");
      }
      if (!Object.keys(updates).length) return { row: challenge, event: null };
      const [updated] = await tx.update(challenges).set(updates).where(eq(challenges.id, challengeId)).returning();
      for (const roundId of new Set([round?.id, targetRound?.id].filter((value): value is number => value !== undefined))) {
        await tx.update(gameshowRoundPlans).set({ revision: sql`${gameshowRoundPlans.revision} + 1`, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(gameshowRoundPlans.roundId, roundId));
      }
      const event = await record(tx, actor, "challenge", challengeId, targetRound?.seasonId ?? null, Object.keys(updates));
      return { row: updated, event };
    }));
  }

  async function editSeason(seasonId: number, input: Record<string, unknown>, actor: Actor) {
    return finish(await database.transaction(async (tx) => {
      const [season] = await tx.select().from(seasons).where(eq(seasons.id, seasonId)).for("update");
      if (!season) throw new GameshowError(404, "Season not found");
      const seasonRounds = await tx.select({ status: rounds.status }).from(rounds).where(eq(rounds.seasonId, seasonId));
      const updates = { ...input };
      if (updates.status !== undefined && updates.status !== season.status) {
        if ((updates.status === "completed" && seasonRounds.some((round) => round.status !== "completed"))
          || (updates.status === "upcoming" && seasonRounds.some((round) => round.status !== "upcoming"))
          || (updates.status === "active" && seasonRounds.length > 0 && seasonRounds.every((round) => round.status === "completed"))) {
          throw new GameshowError(409, "Season status must agree with its rounds. Use the Host Console to run the show.");
        }
      }
      if (updates.status === season.status) delete updates.status;
      if (!Object.keys(updates).length) return { row: season, event: null };
      const [updated] = await tx.update(seasons).set(updates).where(eq(seasons.id, seasonId)).returning();
      const event = await record(tx, actor, "season", seasonId, seasonId, Object.keys(updates));
      return { row: updated, event };
    }));
  }
  return { editRound, editChallenge, editSeason };
}
