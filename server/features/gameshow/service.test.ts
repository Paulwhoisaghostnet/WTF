import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { createGameshowService } from "./service";
import { GameshowError } from "./policy";
import { createGameshowEditing } from "./editing";

const connectionString = process.env.GAMESHOW_TEST_DATABASE_URL;
const local = connectionString && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(connectionString).hostname);

test("real PostgreSQL serializes a ten-round host lifecycle, protects submissions, and rolls back failed cues", { skip: !local && "Opt in with GAMESHOW_TEST_DATABASE_URL pointing to local PostgreSQL; run npm run test:gameshow:postgres" }, async () => {
  const namespace = `gameshow_proof_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString });
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${namespace},public` });
  try {
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    // Clone the actual installed table shapes; isolated rows never touch the app's tables.
    for (const table of ["users", "seasons", "rounds", "challenges", "challenge_submissions", "season_contestants", "round_eliminations", "operator_actions", "gameshow_round_plans"]) {
      await admin.query(`CREATE TABLE "${namespace}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    const database = drizzle(pool, { schema });
    const emitted: string[] = [];
    const service = createGameshowService(database, async (event) => { emitted.push(event.action); });
    const editing = createGameshowEditing(database);
    const [host, contestant, outsider] = await database.insert(schema.users).values([
      { username: "host", role: "host" }, { username: "player", role: "contestant" }, { username: "outsider", role: "witness" },
    ]).returning();
    const actor = { userId: host.id };
    const [season] = await database.insert(schema.seasons).values({ number: 1, name: "Ten-round lifecycle proof", anteWtfRequired: "0" }).returning();
    const roundRows = await database.insert(schema.rounds).values(Array.from({ length: 10 }, (_, index) => ({ seasonId: season.id, number: index + 1,
      name: `Round ${index + 1}`, rules: "Host-authored test fixture rules; submit the requested proof." }))).returning();
    const challenges = await database.insert(schema.challenges).values(roundRows.map((round) => ({ roundId: round.id,
      title: `Challenge ${round.number}`, description: "Submit a proof for this test fixture.", criteria: "Host verifies the proof." }))).returning();
    await assert.rejects(editing.editRound(roundRows[0].id, { status: "active" }, actor), /Host Console/);
    await assert.rejects(editing.editChallenge(challenges[0].id, { status: "active" }, actor), /Host Console/);
    assert.equal((await editing.editRound(roundRows[0].id, { status: "upcoming", description: "Edited preparation" }, actor)).status, "upcoming");
    assert.equal((await editing.editChallenge(challenges[0].id, { status: "draft", description: "Updated instructions" }, actor)).status, "draft");
    await assert.rejects(editing.editSeason(season.id, { status: "completed" }, actor), /Season status must agree/);
    await assert.rejects(service.transition(roundRows[0].id, "start", actor), /Enroll active contestants/);
    const enrollments = await Promise.all([service.enroll(season.id, contestant.username, "active", actor), service.enroll(season.id, contestant.username, "active", actor)]);
    assert.equal(enrollments[0].id, enrollments[1].id);
    assert.equal((await database.select().from(schema.seasonContestants)).length, 1);
    await assert.rejects(service.transition(roundRows[1].id, "start", actor), /Finish earlier rounds/);

    // Missing rules/criteria fail before any state or audit commits.
    await database.update(schema.rounds).set({ rules: "" }).where(eq(schema.rounds.id, roundRows[0].id));
    await assert.rejects(service.transition(roundRows[0].id, "start", actor), /Publish the round rules/);
    await database.update(schema.rounds).set({ rules: "Published rules" }).where(eq(schema.rounds.id, roundRows[0].id));
    await database.update(schema.challenges).set({ criteria: "" }).where(eq(schema.challenges.id, challenges[0].id));
    await assert.rejects(service.transition(roundRows[0].id, "start", actor), /grading criteria/);
    await database.update(schema.challenges).set({ criteria: "Published criteria" }).where(eq(schema.challenges.id, challenges[0].id));

    for (const [index, round] of roundRows.entries()) {
      const challenge = challenges[index];
      const starts = await Promise.allSettled([service.transition(round.id, "start", actor), service.transition(round.id, "start", actor)]);
      assert.equal(starts.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(starts.filter((result) => result.status === "rejected" && result.reason instanceof GameshowError && result.reason.status === 409).length, 1);
      const waiting = await service.stage(season.id, contestant.id, false);
      assert.equal(waiting.currentRoundId, round.id);
      assert.equal(waiting.me.canSubmit, true);
      await assert.rejects(editing.editRound(round.id, { status: "completed" }, actor), /Host Console/);
      await assert.rejects(editing.editRound(round.id, { seasonId: null }, actor), /cannot change seasons/);
      await assert.rejects(editing.editChallenge(challenge.id, { status: "completed" }, actor), /Host Console/);
      await assert.rejects(editing.editChallenge(challenge.id, { roundId: null }, actor), /Only draft challenges/);
      await assert.rejects(editing.editSeason(season.id, { status: "upcoming" }, actor), /Season status must agree/);
      await assert.rejects(service.submit(challenge.id, outsider.id, { contentText: "not on roster" }), /not enrolled/);
      await assert.rejects(service.submit(challenge.id, contestant.id, {}), /Add an answer/);
      const submissions = await Promise.allSettled([service.submit(challenge.id, contestant.id, { contentText: `answer ${index}`, contentUrl: null }), service.submit(challenge.id, contestant.id, { contentText: "duplicate", contentUrl: null })]);
      assert.equal(submissions.filter((result) => result.status === "fulfilled").length, 1);
      const submission = submissions.find((result) => result.status === "fulfilled")!;
      assert.equal(submission.status, "fulfilled");
      if (submission.status !== "fulfilled") throw new Error("Expected successful submission");
      const entry = submission.value.submission;
      await assert.rejects(service.grade(entry.id, "pass", null, actor), /Close the round/);
      assert.deepEqual((await service.stage(season.id, outsider.id, false)).submissions, []);
      assert.deepEqual((await service.stage(season.id, outsider.id, false)).me.submissions, []);
      assert.equal((await service.stage(season.id, host.id, true)).submissions.length, index + 1);
      await service.transition(round.id, "close", actor);
      await assert.rejects(service.submit(challenge.id, outsider.id, { contentText: "late" }), /not accepting/);
      await assert.rejects(service.transition(round.id, "advance", actor), /Grade all submitted entries/);
      await service.grade(entry.id, "pass", "Verified test entry", actor);
      assert.equal((await service.grade(entry.id, "pass", "Verified test entry", actor)).submission.grade, "pass");
      if (index === 0) {
        const [draft] = await database.insert(schema.roundEliminations).values({ roundId: round.id, userId: outsider.id }).returning();
        await assert.rejects(service.transition(round.id, "advance", actor), /Resolve draft eliminations/);
        await database.delete(schema.roundEliminations).where(eq(schema.roundEliminations.id, draft.id));
      }
      const advances = await Promise.allSettled([service.transition(round.id, "advance", actor), service.transition(round.id, "advance", actor)]);
      assert.equal(advances.filter((result) => result.status === "fulfilled").length, 1);
      await assert.rejects(service.grade(entry.id, "fail", "late correction", actor), /Completed round results/);
      const savedResult = (await service.grade(entry.id, "pass", undefined, actor)).submission;
      assert.equal(savedResult.feedback, "Verified test entry");
      assert.equal((await service.grade(entry.id, "pass", undefined, actor)).submission.gradedAt?.getTime(), savedResult.gradedAt?.getTime());
      await assert.rejects(service.grade(entry.id, "pass", "changed archived feedback", actor), /Completed round results/);
      const after = await service.stage(season.id, contestant.id, false);
      assert.equal(after.currentRoundId, null);
      assert.equal(after.rounds[index].status, "completed");
      if (index < 9) assert.equal(after.rounds[index + 1].status, "upcoming");
    }
    const complete = await service.stage(season.id, contestant.id, false);
    assert.equal(complete.season.status, "completed");
    assert.equal(complete.me.submissions.length, 10);
    assert.equal(complete.me.canSubmit, false);
    assert.equal(emitted.filter((action) => action === "gameshow.round.started").length, 10);
    assert.equal(emitted.filter((action) => action === "gameshow.round.closed").length, 10);
    assert.equal(emitted.filter((action) => action === "gameshow.round.advanced").length, 10);
    assert.equal(emitted.filter((action) => action === "gameshow.contestant.enrolled").length, 1);

    // A nonzero existing season ante remains authoritative; enrollment cannot fake payment.
    const [anteSeason] = await database.insert(schema.seasons).values({ number: 2, name: "Ante proof", anteWtfRequired: "100" }).returning();
    const [anteRound] = await database.insert(schema.rounds).values({ seasonId: anteSeason.id, number: 1, name: "Ante round", rules: "Published rules" }).returning();
    await database.insert(schema.challenges).values({ roundId: anteRound.id, title: "Ante challenge", description: "Instructions", criteria: "Criteria" });
    await service.enroll(anteSeason.id, contestant.username, "active", actor);
    await assert.rejects(service.transition(anteRound.id, "start", actor), /verified the required season ante/);
    const [unchanged] = await database.select().from(schema.rounds).where(eq(schema.rounds.id, anteRound.id));
    assert.equal(unchanged.status, "upcoming");

    // Standalone challenge workflows keep their established editing/grading semantics.
    const [standalone] = await database.insert(schema.challenges).values({ title: "Standalone proof", description: "Open participation" }).returning();
    assert.equal((await editing.editChallenge(standalone.id, { status: "active" }, actor)).status, "active");
    const standaloneEntry = await service.submit(standalone.id, outsider.id, { contentText: null, contentUrl: "https://example.com/proof" });
    assert.equal((await service.grade(standaloneEntry.submission.id, "pass", null, actor)).submission.grade, "pass");
    assert.equal((await editing.editChallenge(standalone.id, { status: "completed" }, actor)).status, "completed");
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await admin.end();
  }
});
