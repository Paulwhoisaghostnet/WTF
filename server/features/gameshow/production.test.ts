import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { gameshowRoundPlanInputSchema } from "@shared/gameshow-plan-schema";
import type { GameshowRoundPlanInput } from "@shared/gameshow";
import { createGameshowComposer } from "./composer";
import { createGameshowService } from "./service";
import { createGameshowEditing } from "./editing";
import { createGameshowProgress } from "./progress";
import { stampWalletEventProvenance } from "../../lib/wallet-event-provenance";

const connectionString = process.env.GAMESHOW_TEST_DATABASE_URL;
const local = connectionString && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(connectionString).hostname);

test("production plans persist canonical tasks atomically; progress preserves indexed evidence provenance", { skip: !local && "Opt in with GAMESHOW_TEST_DATABASE_URL pointing to local PostgreSQL; run npm run test:gameshow:postgres" }, async () => {
  const namespace = `gameshow_production_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString });
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${namespace},public` });
  try {
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    for (const table of ["users", "seasons", "rounds", "challenges", "challenge_submissions", "season_contestants", "round_eliminations", "operator_actions", "user_wallets", "wallet_sync_cursors", "wallet_events"]) {
      await admin.query(`CREATE TABLE "${namespace}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    // Execute the exact production migration against isolated table owners; prove rerun safety too.
    const migration = await readFile("drizzle/0129_gameshow_round_plans.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration);
    const database = drizzle(pool, { schema });
    const [host, contestant, noWallet] = await database.insert(schema.users).values([
      { username: "producer", role: "host" }, { username: "player", role: "contestant" }, { username: "no-wallet", role: "contestant" },
    ]).returning();
    const actor = { userId: host.id };
    const emitted: string[] = [];
    const composer = createGameshowComposer(database, async event => { emitted.push(event.action); });
    const service = createGameshowService(database);
    const editing = createGameshowEditing(database);
    const progress = createGameshowProgress(database);
    const creations = await Promise.allSettled([composer.create({ number: 17, name: "Production proof" }, actor), composer.create({ number: 17, name: "Duplicate" }, actor)]);
    assert.equal(creations.filter(result => result.status === "fulfilled").length, 1);
    const show = (creations.find(result => result.status === "fulfilled") as PromiseFulfilledResult<{ id: number; roundIds: number[] }>).value;
    assert.equal(show.roundIds.length, 10);
    const initial = await composer.plan(show.roundIds[0]);
    assert.equal(initial.revision, 0);
    assert.deepEqual(initial.tasks, []);
    await assert.rejects(service.transition(initial.roundId, "start", actor), /Attach a challenge/);
    const contract = "KT1" + "A".repeat(33);
    const input: GameshowRoundPlanInput = { expectedRevision: 0, name: "Authored game", description: "An objective", rules: "Published rules and judging instructions", tasks: [
      { title: "Authored task", description: "Instructions", criteria: "Judge the evidence", rules: null, deadline: null, tools: ["wallets", "studio"], tokenMonitor: { network: "mainnet", contract, tokenId: "7" } },
      { title: "Draft to remove", description: "", criteria: "", rules: null, deadline: null, tools: [], tokenMonitor: null },
    ] };
    assert.equal(gameshowRoundPlanInputSchema.safeParse({ ...input, tasks: [{ ...input.tasks[0], tools: ["made-up-tool"] }] }).success, false);
    assert.equal(gameshowRoundPlanInputSchema.safeParse({ ...input, rewardXp: 20 }).success, false);
    const saves = await Promise.allSettled([composer.savePlan(initial.roundId, input, actor), composer.savePlan(initial.roundId, input, actor)]);
    assert.equal(saves.filter(result => result.status === "fulfilled").length, 1);
    let saved = await composer.plan(initial.roundId);
    assert.equal(saved.revision, 1);
    assert.equal(saved.tasks.length, 2);
    const taskId = saved.tasks[0].id;
    // Reordering is persisted in associations and presented in the contestant stage.
    await database.update(schema.gameshowRoundPlans).set({ configuration: { version: 1, tasks: [...saved.tasks].reverse().map(task => ({ challengeId: task.id, tools: task.tools, tokenMonitor: task.tokenMonitor })) } }).where(eq(schema.gameshowRoundPlans.roundId, initial.roundId));
    assert.deepEqual((await service.stage(show.id, contestant.id, false)).rounds[0].challenges.map(task => task.id), [...saved.tasks].reverse().map(task => task.id));
    const savedInput = { ...input, expectedRevision: saved.revision, tasks: [saved.tasks[0]] };
    saved = await composer.savePlan(initial.roundId, savedInput, actor);
    assert.equal(saved.tasks[0].id, taskId);
    assert.equal((await database.select().from(schema.challenges)).length, 1);
    const canonical = (await database.select().from(schema.challenges))[0];
    assert.equal(canonical.rewardXp, 0);
    assert.equal(canonical.rewardAmountWtf, 0);
    assert.equal(canonical.status, "draft");
    await assert.rejects(composer.savePlan(initial.roundId, { ...savedInput, expectedRevision: saved.revision, tasks: [{ ...saved.tasks[0], id: -1 }] }, actor));
    assert.equal((await composer.plan(initial.roundId)).revision, 2);
    await editing.editChallenge(taskId, { criteria: "Reviewed criteria" }, actor);
    await assert.rejects(composer.savePlan(initial.roundId, { ...savedInput, expectedRevision: 2 }, actor), /another session/);
    await service.enroll(show.id, contestant.username, "active", actor);
    await service.enroll(show.id, noWallet.username, "reserve", actor);
    const wallet = "tz1" + "A".repeat(33);
    await database.insert(schema.userWallets).values({ userId: contestant.id, walletAddress: wallet, isPrimary: true });
    await database.insert(schema.walletSyncCursors).values({ walletAddress: wallet, lastSyncStatus: "ok", lastSyncedAt: new Date(), backfilled: true });
    assert.equal((await progress(show.id)).rows.find(row => row.userId === contestant.id)!.rounds[0].tokenActivity.status, "not_started");
    await service.transition(initial.roundId, "start", actor);
    assert.deepEqual((await progress(show.id)).rows.find(row => row.userId === contestant.id)!.rounds[0].tokenActivity,
      { status: "unavailable", observedCount: null, verifiedCount: null });
    await assert.rejects(composer.savePlan(initial.roundId, { ...savedInput, expectedRevision: 3 }, actor), /before the round starts/);
    const stage = await service.stage(show.id, contestant.id, false);
    assert.deepEqual(stage.rounds[0].challenges[0].tools, ["wallets", "studio"]);
    const submitted = await service.submit(taskId, contestant.id, { contentText: "My proof", contentUrl: null });
    const event = { walletAddress: wallet, userId: contestant.id, eventType: "token_mint" as const, level: 1, timestamp: new Date(), tzktKind: "transfer",
      tokenContract: contract, tokenId: "7", tokenAmount: "1", tokenName: "Evidence token", tokenThumbnail: "https://example.com/preview.png" };
    await database.insert(schema.walletEvents).values([
      { ...event, tzktTransferId: 1, opHash: "operation", raw: stampWalletEventProvenance({}, "https://api.tzkt.io/v1") },
      { ...event, tzktTransferId: 2, tokenThumbnail: "javascript:alert(1)", raw: {} },
      { ...event, tzktTransferId: 3, timestamp: new Date("2000-01-01T00:00:00Z"), raw: {} },
      { ...event, tzktTransferId: 4, timestamp: new Date("2100-01-01T00:00:00Z"), raw: {} },
      { ...event, tzktTransferId: 5, tokenId: "8", raw: {} },
    ]);
    await database.update(schema.walletSyncCursors).set({ lastSyncedAt: new Date() }).where(eq(schema.walletSyncCursors.walletAddress, wallet));
    await service.transition(initial.roundId, "close", actor);
    let snapshot = await progress(show.id);
    assert.equal(snapshot.tokenEvidence.length, 2);
    assert.equal(snapshot.rows.find(row => row.userId === contestant.id)!.rounds[0].pendingCount, 1);
    const player = snapshot.rows.find(row => row.userId === contestant.id)!;
    assert.deepEqual(player.rounds[0].tokenActivity, { status: "incomplete", observedCount: 2, verifiedCount: 1 });
    assert.equal(snapshot.rows.find(row => row.userId === noWallet.id)!.rounds[0].tokenActivity.observedCount, null);
    assert.equal(snapshot.tokenEvidence.find(row => row.network === "mainnet")!.tokenUrl, `https://objkt.com/tokens/${contract}/7`);
    const unverified = snapshot.tokenEvidence.find(row => row.network === "unverified")!;
    assert.equal(unverified.tokenUrl, null);
    assert.equal(unverified.thumbnailUri, null);
    // A successful cursor covering opening but not closing cannot claim complete round indexing.
    await database.delete(schema.walletEvents).where(eq(schema.walletEvents.tzktTransferId, 2));
    const closed = (await database.select().from(schema.rounds).where(eq(schema.rounds.id, initial.roundId)))[0];
    await database.update(schema.walletSyncCursors).set({ lastSyncedAt: new Date(closed.endDate!.getTime() - 1) }).where(eq(schema.walletSyncCursors.walletAddress, wallet));
    assert.equal((await progress(show.id)).rows.find(row => row.userId === contestant.id)!.rounds[0].tokenActivity.status, "incomplete");
    await database.update(schema.walletSyncCursors).set({ lastSyncedAt: closed.endDate }).where(eq(schema.walletSyncCursors.walletAddress, wallet));
    assert.equal((await progress(show.id)).rows.find(row => row.userId === contestant.id)!.rounds[0].tokenActivity.status, "indexed");
    await service.grade(submitted.submission.id, "pass", null, actor);
    snapshot = await progress(show.id);
    assert.equal(snapshot.rows.find(row => row.userId === contestant.id)!.totals.passCount, 1);
    assert.equal(snapshot.rows.find(row => row.userId === contestant.id)!.totals.pendingCount, 0);
    assert.equal(snapshot.source.automaticGrading, false);
    assert.equal(emitted.filter(action => action === "gameshow.season.created").length, 1);
    assert.equal(emitted.filter(action => action === "gameshow.round.plan.saved").length, 2);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await admin.end();
  }
});
