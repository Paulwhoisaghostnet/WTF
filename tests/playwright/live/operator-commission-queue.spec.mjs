import "dotenv/config";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { actorById, readPuppetCredentials } from "../../e2e/puppets/runtime.mjs";

const { Pool } = pg;

async function login(baseURL, playwright, actor) {
  const request = await playwright.request.newContext({ baseURL });
  const response = await request.post("/api/auth/login", {
    data: { username: actor.username, password: actor.password },
  });
  expect(response.ok(), `login ${actor.username}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return request;
}

async function pendingCounts(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM in_app_market_items WHERE metadata->>'source' = 'trusted_creator' AND COALESCE(metadata->>'submissionStatus', 'submitted') = 'submitted') AS store,
      (SELECT count(*)::int FROM console_games WHERE status = 'pending') AS arcade,
      (SELECT count(*)::int FROM casino_practice_games WHERE status = 'submitted') AS casino,
      (SELECT count(*)::int FROM calendar_tickets WHERE status = 'submitted') AS calendar
  `);
  return result.rows[0];
}

test("strict operator sees exact commissioned pending counts while a member is denied", async ({ playwright, baseURL }) => {
  const credentials = await readPuppetCredentials();
  const operator = actorById(credentials, "thecount");
  const creator = actorById(credentials, "cookiemonster");
  const member = actorById(credentials, "bert");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const marker = `commission-queue-${Date.now()}`;
  let operatorRequest;
  let memberRequest;
  let marketItemId;
  let arcadeGameId;
  let casinoGameId;
  let calendarTicketId;

  try {
    const before = await pendingCounts(pool);
    marketItemId = (await pool.query(
      `INSERT INTO in_app_market_items
        (sku, name, description, category, price_wtf_units, price_exp, active, stock_quantity, metadata, sort_order)
       VALUES ($1, $2, 'operator queue proof', 'desktop_fun', '0', 100, false, 1,
         jsonb_build_object('source', 'trusted_creator', 'creatorUserId', $3::int, 'creatorUsername', $4::text, 'submissionStatus', 'submitted'), 0)
       RETURNING id`,
      [`${marker}-store`, marker, creator.userId, creator.username],
    )).rows[0].id;
    arcadeGameId = (await pool.query(
      `INSERT INTO console_games (slug, title, description, category, embed_path, created_by, builder_user_id, builder_name, status, is_public)
       VALUES ($1, $2, 'operator queue proof', 'community', '/games/test/index.html', $3, $3, $4, 'pending', false)
       RETURNING id`,
      [`${marker}-arcade`, marker, creator.userId, creator.username],
    )).rows[0].id;
    casinoGameId = (await pool.query(
      `INSERT INTO casino_practice_games (slug, creator_user_id, creator_name, title, summary, instructions, outcomes, status, active)
       VALUES ($1, $2, $3, $4, 'operator queue proof', 'Choose a result', '[{"label":"One"},{"label":"Two"}]'::jsonb, 'submitted', false)
       RETURNING id`,
      [`${marker}-casino`, creator.userId, creator.username, marker],
    )).rows[0].id;
    calendarTicketId = (await pool.query(
      `INSERT INTO calendar_tickets (submitter_user_id, payload_json, status)
       VALUES ($1, jsonb_build_object('title', $2::text), 'submitted')
       RETURNING id`,
      [creator.userId, marker],
    )).rows[0].id;

    operatorRequest = await login(baseURL, playwright, operator);
    memberRequest = await login(baseURL, playwright, member);

    const response = await operatorRequest.get("/api/admin/stats");
    expect(response.status(), await response.text()).toBe(200);
    const payload = await response.json();
    const queues = Object.fromEntries(payload.commissionQueue.map((entry) => [entry.id, entry]));
    expect(queues.store).toMatchObject({ pending: before.store + 1, owner: "WTFIAM Market", destination: { kind: "admin-section", value: "in-app-market" } });
    expect(queues.arcade).toMatchObject({ pending: before.arcade + 1, owner: "Arcade moderation", destination: { kind: "admin-section", value: "arcade" } });
    expect(queues.casino).toMatchObject({ pending: before.casino + 1, owner: "Casino practice tables", destination: { kind: "route", value: "/casino" } });
    expect(queues.calendar).toMatchObject({ pending: before.calendar + 1, owner: "Control Board tickets", destination: { kind: "route", value: "/control-board" } });

    const denied = await memberRequest.get("/api/admin/stats");
    expect(denied.status()).toBe(403);
  } finally {
    await operatorRequest?.dispose();
    await memberRequest?.dispose();
    if (calendarTicketId) await pool.query("DELETE FROM calendar_tickets WHERE id = $1", [calendarTicketId]);
    if (casinoGameId) await pool.query("DELETE FROM casino_practice_games WHERE id = $1", [casinoGameId]);
    if (arcadeGameId) await pool.query("DELETE FROM console_games WHERE id = $1", [arcadeGameId]);
    if (marketItemId) await pool.query("DELETE FROM in_app_market_items WHERE id = $1", [marketItemId]);
    await pool.end();
  }
});
