import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { challenges, challengeSubmissions, gameshowRoundPlans, operatorActions, rounds, seasons } from "@shared/schema";
import { GAMESHOW_ROUND_COUNT, type GameshowCreateInput, type GameshowCreateResult, type GameshowPlanConfiguration, type GameshowRoundPlan, type GameshowRoundPlanInput } from "@shared/gameshow";
import { gameshowCreateInputSchema, gameshowRoundPlanInputSchema } from "@shared/gameshow-plan-schema";
import { GameshowError } from "./policy";
import type { EventSink, GameshowEvent } from "./service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = { userId: number; ip?: string | null };

async function readPlan(tx: Transaction, roundId: number): Promise<GameshowRoundPlan> {
  const [round] = await tx.select().from(rounds).where(eq(rounds.id, roundId));
  if (!round) throw new GameshowError(404, "Round not found");
  if (round.seasonId === null) throw new GameshowError(409, "Assign this round to a season before composing it");
  const [stored] = await tx.select().from(gameshowRoundPlans).where(eq(gameshowRoundPlans.roundId, roundId));
  const challengeRows = await tx.select().from(challenges).where(eq(challenges.roundId, roundId)).orderBy(asc(challenges.id));
  const bindings = stored?.configuration.tasks ?? [];
  const order = new Map(bindings.map((binding, index) => [binding.challengeId, index]));
  // New tasks added by the existing editor remain visible after the authored sequence.
  challengeRows.sort((a, b) => (order.get(a.id) ?? bindings.length) - (order.get(b.id) ?? bindings.length) || a.id - b.id);
  return { roundId, seasonId: round.seasonId, revision: stored?.revision ?? 0, status: round.status,
    name: round.name, description: round.description, rules: round.rules,
    tasks: challengeRows.map(challenge => {
      const binding = bindings.find(candidate => candidate.challengeId === challenge.id);
      return { id: challenge.id, title: challenge.title, description: challenge.description, criteria: challenge.criteria ?? "",
        rules: challenge.rules, deadline: challenge.deadline?.toISOString() ?? null, tools: binding?.tools ?? [], tokenMonitor: binding?.tokenMonitor ?? null };
    }),
  };
}

/** The form and authorized agents share this owner; no game, winner, reward or fee is selected here. */
export function createGameshowComposer(database: typeof db, emit?: EventSink) {
  async function publish(event: GameshowEvent) {
    if (emit) await emit(event).catch(error => console.error("[gameshow] composition projection failed", { auditId: event.id, error }));
  }

  async function plan(roundId: number) {
    return database.transaction(tx => readPlan(tx, roundId), { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async function savePlan(roundId: number, rawInput: GameshowRoundPlanInput, actor: Actor) {
    const input = gameshowRoundPlanInputSchema.parse(rawInput);
    const result = await database.transaction(async tx => {
      const [identity] = await tx.select({ seasonId: rounds.seasonId }).from(rounds).where(eq(rounds.id, roundId));
      if (!identity) throw new GameshowError(404, "Round not found");
      if (identity.seasonId === null) throw new GameshowError(409, "Assign this round to a season before composing it");
      const [season] = await tx.select().from(seasons).where(eq(seasons.id, identity.seasonId)).for("update");
      const [round] = await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update");
      if (!round || round.seasonId !== identity.seasonId) throw new GameshowError(409, "Round changed seasons. Refresh before saving.");
      if (season?.status === "completed" || round.status !== "upcoming") throw new GameshowError(409, "Round plans can only change before the round starts");
      const existing = await tx.select().from(challenges).where(eq(challenges.roundId, roundId)).orderBy(asc(challenges.id)).for("update");
      const [stored] = await tx.select().from(gameshowRoundPlans).where(eq(gameshowRoundPlans.roundId, roundId));
      if ((stored?.revision ?? 0) !== input.expectedRevision) throw new GameshowError(409, "This plan changed in another session. Reload it before saving.");
      if (existing.some(challenge => challenge.status !== "draft")) throw new GameshowError(409, "Only draft challenges can be composed. Review this round in the challenge editor.");
      if (existing.length) {
        const [submission] = await tx.select({ id: challengeSubmissions.id }).from(challengeSubmissions).where(inArray(challengeSubmissions.challengeId, existing.map(row => row.id))).limit(1);
        if (submission) throw new GameshowError(409, "A task already has contestant evidence; its production plan cannot be replaced");
      }
      for (const task of input.tasks) {
        if (task.id !== undefined && !existing.some(challenge => challenge.id === task.id)) throw new GameshowError(400, "A task ID does not belong to this round");
      }
      const configuration: GameshowPlanConfiguration = { version: 1, tasks: [] };
      for (const task of input.tasks) {
        const values = { title: task.title, description: task.description, criteria: task.criteria || null,
          rules: task.rules, deadline: task.deadline ? new Date(task.deadline) : null };
        const [challenge] = task.id === undefined
          ? await tx.insert(challenges).values({ ...values, roundId, createdBy: actor.userId }).returning({ id: challenges.id })
          : await tx.update(challenges).set(values).where(eq(challenges.id, task.id)).returning({ id: challenges.id });
        configuration.tasks.push({ challengeId: challenge.id, tools: task.tools, tokenMonitor: task.tokenMonitor });
      }
      const kept = new Set(configuration.tasks.map(task => task.challengeId));
      const removed = existing.filter(challenge => !kept.has(challenge.id)).map(challenge => challenge.id);
      if (removed.length) await tx.delete(challenges).where(inArray(challenges.id, removed));
      await tx.update(rounds).set({ name: input.name, description: input.description, rules: input.rules }).where(eq(rounds.id, roundId));
      const revision = input.expectedRevision + 1;
      await tx.insert(gameshowRoundPlans).values({ roundId, revision, configuration, updatedBy: actor.userId }).onConflictDoUpdate({
        target: gameshowRoundPlans.roundId, set: { revision, configuration, updatedBy: actor.userId, updatedAt: new Date() },
      });
      const action = "gameshow.round.plan.saved" as const;
      const [audit] = await tx.insert(operatorActions).values({ actorUserId: actor.userId, actionKind: action,
        targetKind: "round", targetId: roundId, ip: actor.ip ?? null,
        payloadJson: { seasonId: round.seasonId, revision, challengeIds: [...kept], removedChallengeIds: removed },
      }).returning({ id: operatorActions.id });
      return { plan: await readPlan(tx, roundId), event: { id: audit.id, action, actorUserId: actor.userId, seasonId: round.seasonId, targetId: roundId } };
    });
    await publish(result.event);
    return result.plan;
  }

  async function create(rawInput: GameshowCreateInput, actor: Actor): Promise<GameshowCreateResult> {
    const input = gameshowCreateInputSchema.parse(rawInput);
    const result = await database.transaction(async tx => {
      // Existing seasons have no unique number constraint. Serialize this show's explicit creation intent.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('gameshow-season-number'), ${input.number})`);
      const [duplicate] = await tx.select({ id: seasons.id }).from(seasons).where(eq(seasons.number, input.number)).limit(1);
      if (duplicate) throw new GameshowError(409, "That season number already exists. Choose it in the host console or use another number.");
      const [season] = await tx.insert(seasons).values({ name: input.name, number: input.number, description: input.description ?? null, createdBy: actor.userId }).returning();
      const roundRows = await tx.insert(rounds).values(Array.from({ length: GAMESHOW_ROUND_COUNT }, (_, index) => ({
        seasonId: season.id, number: index + 1, name: `Round ${index + 1} — not configured`,
      }))).returning({ id: rounds.id });
      const action = "gameshow.season.created" as const;
      const [audit] = await tx.insert(operatorActions).values({ actorUserId: actor.userId, actionKind: action,
        targetKind: "season", targetId: season.id, ip: actor.ip ?? null, payloadJson: { seasonId: season.id, roundIds: roundRows.map(round => round.id) },
      }).returning({ id: operatorActions.id });
      return { value: { id: season.id, roundIds: roundRows.map(round => round.id) },
        event: { id: audit.id, action, actorUserId: actor.userId, seasonId: season.id, targetId: season.id } };
    });
    await publish(result.event);
    return result.value;
  }

  return { plan, savePlan, create };
}
