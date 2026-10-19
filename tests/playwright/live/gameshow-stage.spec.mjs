import "dotenv/config";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { writeFile } from "node:fs/promises";
import { actorById, readPuppetCredentials } from "../../e2e/puppets/runtime.mjs";
import { gameshowActor, gameshowJson } from "../../e2e/puppets/gameshow-stage.mjs";

test("gameshow host and contestants complete a durable ten-round operational rehearsal", async ({ playwright, browser, baseURL }, testInfo) => {
  // Fixtures are rehearsal prompts, not the producer's lineup. No configured challenge or wallet rewards.
  const credentials = await readPuppetCredentials();
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL).hostname) || !["localhost", "127.0.0.1", "::1"].includes(new URL(baseURL).hostname), "Disposable show rehearsal writes only to the local app and database.");
  const host = actorById(credentials, "thecount");
  const contestant = actorById(credentials, "bert");
  const other = actorById(credentials, "ernie");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const marker = `show-rehearsal-${Date.now()}`;
  const clients = [];
  let seasonId;
  let context;
  try {
    const operator = await gameshowActor(playwright, baseURL, host); clients.push(operator);
    const player = await gameshowActor(playwright, baseURL, contestant); clients.push(player);
    const spectator = await gameshowActor(playwright, baseURL, other); clients.push(spectator);
    const [{ number }] = (await pool.query("SELECT COALESCE(MAX(number), 0) + 1 AS number FROM seasons")).rows;
    const season = await gameshowJson(await operator.write("post", "/api/gameshow/seasons", { name: marker, number, description: "Disposable operational rehearsal; no game or prize configuration." }));
    seasonId = season.id;
    expect(season.roundIds).toHaveLength(10);
    expect((await player.request.get(`/api/gameshow/seasons/${seasonId}/progress`)).status()).toBe(403);
    expect((await player.request.get(`/api/gameshow/rounds/${season.roundIds[0]}/plan`)).status()).toBe(403);
    expect((await gameshowJson(await operator.request.get("/api/gameshow/composer"))).roundPlanSchema).toHaveProperty("properties");
    const rounds = [];
    for (let number = 1; number <= 10; number++) {
      const id = season.roundIds[number - 1];
      const plan = await gameshowJson(await operator.write("put", `/api/gameshow/rounds/${id}/plan`, { expectedRevision: 0, name: `${marker} round ${number}`, description: "Rehearsal fixture", rules: "Rehearsal: submit the round number once while entries are open. The host verifies the matching number. No prizes or elimination.", tasks: [{ title: `Rehearsal entry ${number}`, description: `Submit ${number} to exercise the show lifecycle.`, criteria: `The entry contains exactly ${number}.`, rules: null, deadline: null, tools: ["studio", "paint"], tokenMonitor: null }] }));
      rounds.push({ id, number, challenge: plan.tasks[0] });
    }
    expect((await player.write("post", `/api/rounds/${rounds[0].id}/start`)).status()).toBe(403);
    const enrolment = await gameshowJson(await operator.write("post", `/api/seasons/${seasonId}/contestants`, { username: contestant.username, status: "active" }));
    const repeated = await gameshowJson(await operator.write("post", `/api/seasons/${seasonId}/contestants`, { username: contestant.username, status: "reserve" }));
    expect(repeated.id).toBe(enrolment.id); expect(repeated.status).toBe("active");
    expect((await player.write("post", `/api/challenges/${rounds[0].challenge.id}/submit`, { contentText: "early" })).status()).toBe(409);

    for (const round of rounds) {
      await gameshowJson(await operator.write("post", `/api/rounds/${round.id}/start`));
      expect((await operator.write("post", `/api/rounds/${round.id}/start`)).status()).toBe(409);
      const current = await gameshowJson(await player.request.get(`/api/gameshow/seasons/${seasonId}/stage`));
      expect(current.currentRoundId).toBe(round.id); expect(current.me.canSubmit).toBe(true);
      expect((await spectator.write("post", `/api/challenges/${round.challenge.id}/submit`, { contentText: "not enrolled" })).status()).toBe(403);
      const entry = await gameshowJson(await player.write("post", `/api/challenges/${round.challenge.id}/submit`, { contentText: String(round.number), contentUrl: null }));
      const hidden = await gameshowJson(await spectator.request.get(`/api/challenges/${round.challenge.id}`));
      expect(hidden.submissions).toEqual([]);
      const publicResponse = await playwright.request.newContext({ baseURL });
      try { expect((await gameshowJson(await publicResponse.get(`/api/challenges/${round.challenge.id}`))).submissions).toEqual([]); }
      finally { await publicResponse.dispose(); }
      await gameshowJson(await operator.write("post", `/api/rounds/${round.id}/close`));
      expect((await player.write("post", `/api/challenges/${round.challenge.id}/submit`, { contentText: "late" })).status()).toBe(409);
      expect((await operator.write("post", `/api/rounds/${round.id}/advance`)).status()).toBe(409);
      await gameshowJson(await operator.write("put", `/api/submissions/${entry.id}/grade`, { grade: "pass", feedback: `Verified rehearsal round ${round.number}.` }));
      await gameshowJson(await operator.write("post", `/api/rounds/${round.id}/advance`));
      expect((await operator.write("post", `/api/rounds/${round.id}/advance`)).status()).toBe(409);
    }
    const final = await gameshowJson(await player.request.get(`/api/gameshow/seasons/${seasonId}/stage`));
    expect(final.season.status).toBe("completed"); expect(final.currentRoundId).toBeNull();
    expect(final.rounds).toHaveLength(10); expect(final.rounds.every(round => round.status === "completed")).toBe(true);
    expect(final.me.submissions).toHaveLength(10); expect(final.me.submissions.every(entry => entry.grade === "pass")).toBe(true);
    expect(final.submissions).toEqual([]);
    const sheet = await gameshowJson(await operator.request.get(`/api/gameshow/seasons/${seasonId}/progress`));
    expect(sheet.rows.find(row => row.username === contestant.username).totals).toMatchObject({ taskCount: 10, submissionCount: 10, pendingCount: 0, passCount: 10 });
    const persisted = await pool.query("SELECT action_kind, count(*)::int AS n FROM operator_actions WHERE payload_json->>'seasonId' = $1 GROUP BY action_kind", [String(seasonId)]);
    expect(Object.fromEntries(persisted.rows.map(row => [row.action_kind, row.n]))).toMatchObject({ "gameshow.season.created": 1, "gameshow.round.plan.saved": 10, "gameshow.contestant.enrolled": 1, "gameshow.round.started": 10, "gameshow.round.closed": 10, "gameshow.round.advanced": 10, "gameshow.submission.graded": 10 });
    context = await browser.newContext({ baseURL, storageState: await player.request.storageState() });
    const page = await context.newPage();
    const diagnostics = [];
    const pendingRequests = new Map();
    page.on("request", request => pendingRequests.set(request, { path: new URL(request.url()).pathname, started: Date.now() }));
    page.on("requestfinished", request => pendingRequests.delete(request));
    page.on("pageerror", error => diagnostics.push({ kind: "pageerror", message: error.message }));
    page.on("requestfailed", request => diagnostics.push({ kind: "requestfailed", path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
    page.on("response", response => {
      const path = new URL(response.url()).pathname;
      if (response.status() >= 400 || /(?:gameshow\/|\/auth\/user|\/apps\/desktop|\/api\/seasons|\/Rounds\.tsx)/.test(path)) {
        diagnostics.push({ kind: "response", path, status: response.status() });
      }
    });
    try {
      await page.goto(`/rounds?seasonId=${seasonId}`);
      const desk = page.getByTestId("contestant-desk");
      await expect(desk).toBeVisible();
      await expect(desk.getByText(/show is complete|season is complete/i).first()).toBeVisible();
      await page.reload();
      await expect(page.getByTestId("contestant-desk")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("completed-contestant-desk.png") });
    } finally {
      const path = testInfo.outputPath("browser-diagnostics.json");
      await writeFile(path, JSON.stringify({ diagnostics, pending: [...pendingRequests.values()].map(item => ({ path: item.path, elapsedMs: Date.now() - item.started })) }, null, 2));
      await testInfo.attach("browser-diagnostics", { path, contentType: "application/json" });
    }
  } finally {
    await context?.close();
    for (const client of clients) await client.request.dispose();
    if (seasonId) {
      // Only remove this test's rows; audit evidence is checked before fixture cleanup.
      await pool.query("DELETE FROM challenge_reward_flags WHERE challenge_id IN (SELECT c.id FROM challenges c JOIN rounds r ON r.id = c.round_id WHERE r.season_id = $1)", [seasonId]);
      await pool.query("DELETE FROM gameshow_events WHERE (source_kind = 'round' AND source_id IN (SELECT id FROM rounds WHERE season_id = $1)) OR (source_kind = 'challenge' AND source_id IN (SELECT c.id FROM challenges c JOIN rounds r ON r.id = c.round_id WHERE r.season_id = $1))", [seasonId]);
      await pool.query("DELETE FROM rounds WHERE season_id = $1", [seasonId]);
      await pool.query("DELETE FROM seasons WHERE id = $1", [seasonId]);
      await pool.query("DELETE FROM operator_actions WHERE payload_json->>'seasonId' = $1", [String(seasonId)]);
    }
    await pool.end();
  }
});
