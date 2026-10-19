import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { seasons, rounds, challenges, challengeSubmissions, seasonContestants, roundEliminations, operatorActions, users, gameshowRoundPlans } from "@shared/schema";
import type { GameshowStageSnapshot, GameshowSubmission } from "@shared/gameshow";
import { anteSatisfied, assertTransition, GameshowError, participationBlockers } from "./policy";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = { userId: number; ip?: string | null };
export type GameshowAction = "gameshow.contestant.enrolled" | "gameshow.round.started" | "gameshow.round.closed" | "gameshow.round.advanced" | "gameshow.submission.graded" | "gameshow.round.edited" | "gameshow.season.edited" | "gameshow.challenge.edited" | "gameshow.round.plan.saved" | "gameshow.season.created";
export type GameshowEvent = { id: number; action: GameshowAction; actorUserId: number; seasonId: number | null; targetId: number };
export type EventSink = (event: GameshowEvent) => Promise<void>;

const iso = (value: Date | null) => value?.toISOString() ?? null;

/** One owner for show state. Dependencies permit isolated PostgreSQL lifecycle proofs. */
export function createGameshowService(database: typeof db, emit?: EventSink) {
  async function audit(tx: Transaction, actor: Actor, action: GameshowAction, seasonId: number, targetKind: string, targetId: number, metadata: Record<string, unknown> = {}) {
    const [record] = await tx.insert(operatorActions).values({
      actorUserId: actor.userId, actionKind: action, targetKind, targetId,
      payloadJson: { seasonId, ...metadata }, ip: actor.ip ?? null,
    }).returning({ id: operatorActions.id });
    return { id: record.id, action, actorUserId: actor.userId, seasonId, targetId };
  }

  async function publish(event: Parameters<EventSink>[0]) {
    // The operator audit is committed with state. An integration failure must not disguise a committed host action.
    if (emit) await emit(event).catch((error) => console.error("[gameshow] normalized event failed", { auditId: event.id, action: event.action, error }));
  }

  async function stage(seasonId: number, userId: number, canManage: boolean, canSubmitPermission = true): Promise<GameshowStageSnapshot> {
    return database.transaction(async (tx) => {
      const [season] = await tx.select().from(seasons).where(eq(seasons.id, seasonId));
      if (!season) throw new GameshowError(404, "Season not found");
      const roundRows = await tx.select().from(rounds).where(eq(rounds.seasonId, seasonId)).orderBy(asc(rounds.number), asc(rounds.id));
      const roundIds = roundRows.map((round) => round.id);
      const plans = roundIds.length ? await tx.select().from(gameshowRoundPlans).where(inArray(gameshowRoundPlans.roundId, roundIds)) : [];
      const challengeRows = roundIds.length ? await tx.select().from(challenges).where(inArray(challenges.roundId, roundIds)).orderBy(asc(challenges.id)) : [];
      const challengeIds = challengeRows.map((challenge) => challenge.id);
      const submissionRows = challengeIds.length ? await tx.select({
        id: challengeSubmissions.id, challengeId: challengeSubmissions.challengeId, userId: challengeSubmissions.userId,
        username: users.username, contentText: challengeSubmissions.contentText, contentUrl: challengeSubmissions.contentUrl,
        submittedAt: challengeSubmissions.submittedAt, grade: challengeSubmissions.grade, feedback: challengeSubmissions.feedback,
      }).from(challengeSubmissions).innerJoin(users, eq(users.id, challengeSubmissions.userId)).where(inArray(challengeSubmissions.challengeId, challengeIds)) : [];
      const roster = await tx.select({ id: seasonContestants.id, userId: seasonContestants.userId, username: users.username,
        displayName: users.displayName, status: seasonContestants.status, antePaidWtf: seasonContestants.antePaidWtf,
      }).from(seasonContestants).innerJoin(users, eq(users.id, seasonContestants.userId)).where(eq(seasonContestants.seasonId, seasonId)).orderBy(asc(users.username));
      const own = roster.find((person) => person.userId === userId);
      const current = roundRows.find((round) => round.status === "active" || round.status === "grading");
      const blockers = participationBlockers({ seasonStatus: season.status, roundStatus: current?.status,
        contestantStatus: own?.status, anteWtfRequired: season.anteWtfRequired, antePaidWtf: own?.antePaidWtf });
      if (!canSubmitPermission) blockers.push("Your account does not have permission to submit challenges.");
      const ownSubmissions = submissionRows.filter((submission) => submission.userId === userId);
      const hasOpenChallenge = challengeRows.some((challenge) => challenge.roundId === current?.id && challenge.status === "active"
        && (!challenge.deadline || challenge.deadline > new Date()) && !ownSubmissions.some((submission) => submission.challengeId === challenge.id));
      if (blockers.length === 0 && !hasOpenChallenge) blockers.push("You have submitted every open challenge, or its deadline has passed.");
      const toSubmission = (row: typeof submissionRows[number]): GameshowSubmission => ({ ...row, submittedAt: row.submittedAt.toISOString() });
      return {
        season: { id: season.id, name: season.name, number: season.number, status: season.status, description: season.description, anteWtfRequired: season.anteWtfRequired },
        currentRoundId: current?.id ?? null, canManage,
        rounds: roundRows.map((round) => {
          const bindings = plans.find(plan => plan.roundId === round.id)?.configuration.tasks ?? [];
          const order = new Map(bindings.map((binding, index) => [binding.challengeId, index]));
          const ownedChallenges = challengeRows.filter((challenge) => challenge.roundId === round.id)
            .sort((a, b) => (order.get(a.id) ?? bindings.length) - (order.get(b.id) ?? bindings.length) || a.id - b.id).map((challenge) => {
            const submissions = submissionRows.filter((submission) => submission.challengeId === challenge.id);
            const binding = bindings.find(task => task.challengeId === challenge.id);
            return { id: challenge.id, title: challenge.title, description: challenge.description, criteria: challenge.criteria,
              rules: challenge.rules, status: challenge.status, deadline: iso(challenge.deadline), rewardXp: challenge.rewardXp,
              tools: binding?.tools ?? [], tokenMonitor: binding?.tokenMonitor ?? null,
              rewardAmountWtf: challenge.rewardAmountWtf ?? 0, submissionCount: submissions.length, pendingCount: submissions.filter((submission) => submission.grade === "pending").length };
          });
          return { id: round.id, number: round.number, name: round.name, description: round.description, status: round.status,
            rules: round.rules, startDate: iso(round.startDate), endDate: iso(round.endDate), challenges: ownedChallenges,
            submissionCount: ownedChallenges.reduce((sum, challenge) => sum + challenge.submissionCount, 0),
            pendingCount: ownedChallenges.reduce((sum, challenge) => sum + challenge.pendingCount, 0) };
        }),
        me: { contestant: own ? { id: own.id, status: own.status, antePaidWtf: own.antePaidWtf, anteSatisfied: anteSatisfied(season.anteWtfRequired, own.antePaidWtf) } : null,
          submissions: ownSubmissions.map(toSubmission), canSubmit: blockers.length === 0 && hasOpenChallenge, blockers },
        contestants: roster.map(({ antePaidWtf: _ante, ...person }) => person),
        submissions: canManage ? submissionRows.map(toSubmission) : [],
      };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async function enroll(seasonId: number, username: string, status: "active" | "reserve", actor: Actor) {
    const result = await database.transaction(async (tx) => {
      const [season] = await tx.select().from(seasons).where(eq(seasons.id, seasonId)).for("update");
      if (!season) throw new GameshowError(404, "Season not found");
      if (season.status === "completed") throw new GameshowError(409, "A completed season cannot enroll contestants");
      const [user] = await tx.select({ id: users.id, username: users.username }).from(users).where(eq(users.username, username));
      if (!user) throw new GameshowError(404, "No account has that username. Ask the contestant to register first.");
      const [existing] = await tx.select().from(seasonContestants).where(and(eq(seasonContestants.seasonId, seasonId), eq(seasonContestants.userId, user.id)));
      if (existing) return { contestant: existing, event: null };
      const [contestant] = await tx.insert(seasonContestants).values({ seasonId, userId: user.id, status }).returning();
      const event = await audit(tx, actor, "gameshow.contestant.enrolled", seasonId, "contestant", contestant.id, { userId: user.id, username: user.username, status });
      return { contestant, event };
    });
    if (result.event) await publish(result.event);
    return result.contestant;
  }

  async function transition(roundId: number, action: "start" | "close" | "advance", actor: Actor) {
    const result = await database.transaction(async (tx) => {
      // Read identity first, then lock season before rounds/challenges everywhere to serialize host cues.
      const [identity] = await tx.select({ seasonId: rounds.seasonId }).from(rounds).where(eq(rounds.id, roundId));
      if (!identity) throw new GameshowError(404, "Round not found");
      if (identity.seasonId === null) throw new GameshowError(409, "Assign this round to a season before running it");
      const [season] = await tx.select().from(seasons).where(eq(seasons.id, identity.seasonId)).for("update");
      if (!season) throw new GameshowError(404, "Season not found");
      const seasonRounds = await tx.select().from(rounds).where(eq(rounds.seasonId, season.id)).orderBy(asc(rounds.number), asc(rounds.id)).for("update");
      const round = seasonRounds.find((candidate) => candidate.id === roundId);
      if (!round) throw new GameshowError(409, "Round changed seasons. Refresh before continuing.");
      assertTransition(round.status, action);
      if (season.status === "completed") throw new GameshowError(409, "This season is already complete");
      const roundChallenges = await tx.select().from(challenges).where(eq(challenges.roundId, roundId)).orderBy(asc(challenges.id)).for("update");
      const now = new Date();
      if (action === "start") {
        if (seasonRounds.some((candidate) => candidate.id !== roundId && (candidate.status === "active" || candidate.status === "grading"))) throw new GameshowError(409, "Close and finish the current round before starting another");
        if (seasonRounds.some((candidate) => candidate.number < round.number && candidate.status !== "completed")) throw new GameshowError(409, "Finish earlier rounds before starting this round");
        if (new Set(seasonRounds.map((candidate) => candidate.number)).size !== seasonRounds.length) throw new GameshowError(409, "Round numbers must be unique within this season");
        if (!roundChallenges.length) throw new GameshowError(409, "Attach a challenge with contestant instructions before starting this round");
        if (!round.rules?.trim()) throw new GameshowError(409, "Publish the round rules before starting");
        if (roundChallenges.some((challenge) => !challenge.description.trim() || !challenge.criteria?.trim())) throw new GameshowError(409, "Publish instructions and grading criteria for every challenge before starting");
        if (roundChallenges.some((challenge) => challenge.status === "completed" || (challenge.deadline && challenge.deadline <= now))) throw new GameshowError(409, "A challenge is complete or past its deadline. Review the round before opening it.");
        const roster = await tx.select().from(seasonContestants).where(and(eq(seasonContestants.seasonId, season.id), eq(seasonContestants.status, "active")));
        if (!roster.length) throw new GameshowError(409, "Enroll active contestants before starting the round");
        if (roster.some((contestant) => !anteSatisfied(season.anteWtfRequired, contestant.antePaidWtf))) throw new GameshowError(409, "An active contestant has not verified the required season ante");
        await tx.update(seasons).set({ status: "active" }).where(eq(seasons.id, season.id));
        await tx.update(challenges).set({ status: "active" }).where(eq(challenges.roundId, roundId));
      } else if (action === "close") {
        await tx.update(challenges).set({ status: "grading" }).where(and(eq(challenges.roundId, roundId), inArray(challenges.status, ["draft", "active"])));
      } else {
        const challengeIds = roundChallenges.map((challenge) => challenge.id);
        const [pending] = challengeIds.length ? await tx.select({ id: challengeSubmissions.id }).from(challengeSubmissions).where(and(inArray(challengeSubmissions.challengeId, challengeIds), eq(challengeSubmissions.grade, "pending"))).limit(1) : [];
        if (pending) throw new GameshowError(409, "Grade all submitted entries before finishing the round");
        const [elimination] = await tx.select({ id: roundEliminations.id }).from(roundEliminations).where(and(eq(roundEliminations.roundId, roundId), sql`${roundEliminations.decidedAt} IS NULL`)).limit(1);
        if (elimination) throw new GameshowError(409, "Resolve draft eliminations before finishing the round");
        await tx.update(challenges).set({ status: "completed" }).where(eq(challenges.roundId, roundId));
        if (seasonRounds.every((candidate) => candidate.id === roundId || candidate.status === "completed")) await tx.update(seasons).set({ status: "completed", endDate: now }).where(eq(seasons.id, season.id));
      }
      const status = { start: "active", close: "grading", advance: "completed" } as const;
      const [updated] = await tx.update(rounds).set({ status: status[action], ...(action === "start" ? { startDate: now } : action === "close" ? { endDate: now } : {}) }).where(eq(rounds.id, roundId)).returning();
      const event = await audit(tx, actor, { start: "gameshow.round.started", close: "gameshow.round.closed", advance: "gameshow.round.advanced" }[action] as GameshowAction,
        season.id, "round", roundId, { fromStatus: round.status, toStatus: status[action] });
      return { round: updated, event };
    });
    await publish(result.event);
    return result.round;
  }

  /** Existing submission route delegates here; a challenge row lock serializes duplicates and the host's close cue. */
  async function submit(challengeId: number, userId: number, input: { contentText?: string | null; contentUrl?: string | null }) {
    if (!input.contentText?.trim() && !input.contentUrl?.trim()) throw new GameshowError(400, "Add an answer or a proof link before submitting");
    return database.transaction(async (tx) => {
      const [identity] = await tx.select({ roundId: challenges.roundId, seasonId: rounds.seasonId }).from(challenges).leftJoin(rounds, eq(rounds.id, challenges.roundId)).where(eq(challenges.id, challengeId));
      if (!identity) throw new GameshowError(404, "Challenge not found");
      let season: typeof seasons.$inferSelect | undefined;
      let round: typeof rounds.$inferSelect | undefined;
      if (identity.seasonId !== null) {
        [season] = await tx.select().from(seasons).where(eq(seasons.id, identity.seasonId)).for("update");
        if (identity.roundId !== null) [round] = await tx.select().from(rounds).where(eq(rounds.id, identity.roundId)).for("update");
      }
      const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, challengeId)).for("update");
      if (!challenge) throw new GameshowError(404, "Challenge not found");
      if (challenge.roundId !== identity.roundId) throw new GameshowError(409, "Challenge changed rounds. Refresh before submitting.");
      if (challenge.status !== "active") throw new GameshowError(409, "Challenge is not accepting submissions");
      if (challenge.deadline && challenge.deadline <= new Date()) throw new GameshowError(409, "The challenge deadline has passed");
      if (season && round) {
        if (round.seasonId !== season.id) throw new GameshowError(409, "Round changed seasons. Refresh before submitting.");
        const [contestant] = await tx.select().from(seasonContestants).where(and(eq(seasonContestants.seasonId, season.id), eq(seasonContestants.userId, userId)));
        const blockers = participationBlockers({ seasonStatus: season.status, roundStatus: round.status, contestantStatus: contestant?.status,
          anteWtfRequired: season.anteWtfRequired, antePaidWtf: contestant?.antePaidWtf });
        if (blockers.length) throw new GameshowError(403, blockers[0]);
      }
      const [existing] = await tx.select({ id: challengeSubmissions.id }).from(challengeSubmissions).where(and(eq(challengeSubmissions.challengeId, challengeId), eq(challengeSubmissions.userId, userId)));
      if (existing) throw new GameshowError(409, "Already submitted");
      const [submission] = await tx.insert(challengeSubmissions).values({ challengeId, userId, contentText: input.contentText?.trim() || null, contentUrl: input.contentUrl?.trim() || null }).returning();
      return { submission, challenge };
    });
  }

  async function grade(submissionId: number, grade: typeof challengeSubmissions.$inferSelect["grade"], feedback: string | null | undefined, actor: Actor) {
    const result = await database.transaction(async (tx) => {
      const [identity] = await tx.select({ challengeId: challenges.id, roundId: rounds.id, seasonId: rounds.seasonId }).from(challengeSubmissions)
        .innerJoin(challenges, eq(challenges.id, challengeSubmissions.challengeId)).leftJoin(rounds, eq(rounds.id, challenges.roundId))
        .where(eq(challengeSubmissions.id, submissionId));
      if (!identity) throw new GameshowError(404, "Submission not found");
      let completed = false;
      if (identity.seasonId !== null && identity.roundId !== null) {
        await tx.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, identity.seasonId)).for("update");
        const [round] = await tx.select().from(rounds).where(eq(rounds.id, identity.roundId)).for("update");
        if (round?.seasonId !== identity.seasonId) throw new GameshowError(409, "Round changed seasons. Refresh before grading.");
        completed = round.status === "completed";
        if (round.status !== "grading" && !completed) throw new GameshowError(409, "Close the round before grading. Completed round results cannot be changed.");
      }
      const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, identity.challengeId)).for("update");
      if (!challenge || challenge.roundId !== identity.roundId) throw new GameshowError(409, "Challenge changed rounds. Refresh before grading.");
      if (identity.seasonId !== null && challenge.status !== (completed ? "completed" : "grading")) throw new GameshowError(409, "This round challenge is not open for grading");
      const [previous] = await tx.select().from(challengeSubmissions).where(eq(challengeSubmissions.id, submissionId)).for("update");
      const effectiveFeedback = feedback === undefined ? previous.feedback : feedback;
      if (completed && (grade !== previous.grade || effectiveFeedback !== previous.feedback)) {
        throw new GameshowError(409, "Completed round results cannot be changed. Replay the saved grade without changing feedback to retry its rewards.");
      }
      const submission = completed ? previous : (await tx.update(challengeSubmissions).set({ grade, feedback: effectiveFeedback, gradedBy: actor.userId, gradedAt: new Date() })
        .where(eq(challengeSubmissions.id, submissionId)).returning())[0];
      const [record] = await tx.insert(operatorActions).values({ actorUserId: actor.userId, actionKind: "gameshow.submission.graded",
        targetKind: "submission", targetId: submissionId, ip: actor.ip ?? null,
        payloadJson: { seasonId: identity.seasonId, roundId: identity.roundId, challengeId: identity.challengeId, fromGrade: previous.grade, grade, rewardRecovery: completed },
      }).returning({ id: operatorActions.id });
      return { submission,
        event: { id: record.id, action: "gameshow.submission.graded" as const, actorUserId: actor.userId, seasonId: identity.seasonId, targetId: submissionId } };
    });
    await publish(result.event);
    return result;
  }

  return { stage, enroll, transition, submit, grade };
}
