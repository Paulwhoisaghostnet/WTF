import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { createGameshowProvisioning } from "./provisioning";
import { wtfosAppMarketSku } from "@shared/wtfos-app-catalog";
import { DEFAULT_ROLE_PERMISSIONS } from "@shared/types";
import { BROWSER_ROUTE_META } from "@shared/wtf-browser-routes";
import { evaluateBrowserRouteAccess } from "@shared/wtf-browser-route-access";
import { WTF_STANDARD_BROWSER_ROUTES } from "../../lib/wtf-access";
import { findAdminSurfaceForPath } from "../../../client/src/features/admin-os/admin-surface-registry";

test("scoped Pasta preparation permits Macaroni but never admin or other creator-only tools", () => {
  assert.deepEqual(DEFAULT_ROLE_PERMISSIONS.gameshow_creator, ["use_managed_macaroni"]);
  assert.equal(WTF_STANDARD_BROWSER_ROUTES.find((route) => route.path === "/tools/macaroni")?.appGate, "pasta-protocol");
  const access = (path: string, role: string[] | null, enabled = true) => evaluateBrowserRouteAccess(path, BROWSER_ROUTE_META, {
    role, apps: { "pasta-protocol": enabled }, accessSurfaceIds: ["creation-tools", "pasta-protocol"], findSurfaceForPath: findAdminSurfaceForPath,
  });
  assert.equal(access("/tools/macaroni", null).allowed, false);
  assert.equal(access("/tools/macaroni", ["witness"]).allowed, false);
  assert.equal(access("/tools/macaroni", ["contestant"]).allowed, false);
  assert.equal(access("/tools/macaroni", ["contestant", "gameshow_creator"]).allowed, true);
  assert.equal(access("/tools/macaroni", ["contestant", "gameshow_creator"], false).allowed, false);
  assert.equal(access("/tools/macaroni-packager", ["contestant", "gameshow_creator"]).allowed, false);
  assert.equal(access("/admin", ["contestant", "gameshow_creator"]).allowed, false);
});

test("stable Macaroni creator services accept scoped access without granting trusted-creator powers", () => {
  const routes = readFileSync("server/routes/macaroni.ts", "utf8");
  for (const path of ["/api/macaroni/ipfs/upload-ticket", "/api/macaroni/ipfs/pin", "/api/macaroni/publish"]) {
    assert.ok(routes.includes(`"${path}",\n  requirePermission("trusted_market_creator", "use_managed_macaroni")`), path);
  }
  assert.equal((routes.match(/use_managed_macaroni/g) ?? []).length, 3);
  const studio = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const source = studio.slice(studio.indexOf("function hasWtfosPinningAccess("), studio.indexOf("function pinKindAllowed("));
  const permitted = runInNewContext(`${source}; hasWtfosPinningAccess`);
  assert.equal(permitted(null), false);
  assert.equal(permitted({ roles: ["contestant"], effectivePermissions: {} }), false);
  assert.equal(permitted({ roles: ["contestant", "gameshow_creator"], effectivePermissions: { use_managed_macaroni: true } }), true);
  assert.equal(permitted({ roles: ["contestant", "gameshow_creator"], effectivePermissions: { use_managed_macaroni: false } }), false);
  assert.equal(permitted({ roles: ["trusted_creator"], effectivePermissions: { trusted_market_creator: true } }), true);
  assert.ok(!DEFAULT_ROLE_PERMISSIONS.gameshow_creator.includes("trusted_market_creator"));
});

const connectionString = process.env.GAMESHOW_TEST_DATABASE_URL;
const local = connectionString && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(connectionString).hostname);

test("contestant tool preparation preserves roles and purchased passes, is idempotent, and fails closed outside the roster", { skip: !local && "Opt in with GAMESHOW_TEST_DATABASE_URL pointing to local PostgreSQL; run npm run test:gameshow:postgres" }, async () => {
  const namespace = `gameshow_tools_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString });
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${namespace},public` });
  try {
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    for (const table of ["users", "roles", "user_roles", "seasons", "season_contestants", "operator_actions", "in_app_inventory_items"]) {
      await admin.query(`CREATE TABLE "${namespace}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    const database = drizzle(pool, { schema });
    const events: number[] = [];
    const provision = createGameshowProvisioning(database, async (event) => { events.push(event.id); });
    const [host, player, reserve, outsider, blocked] = await database.insert(schema.users).values([
      { username: "setup-host", role: "admin" }, { username: "setup-player", role: "resident_wizard" },
      { username: "setup-reserve", role: "witness" }, { username: "setup-outsider", role: "witness" }, { username: "setup-timeout", role: "witness" },
    ]).returning();
    await database.insert(schema.userRoles).values({ userId: blocked.id, role: "time_out" });
    const [season] = await database.insert(schema.seasons).values({ number: 1, name: "Tool setup proof" }).returning();
    await database.insert(schema.seasonContestants).values([
      { seasonId: season.id, userId: player.id, status: "active" }, { seasonId: season.id, userId: reserve.id, status: "reserve" }, { seasonId: season.id, userId: blocked.id, status: "active" },
    ]);
    await database.insert(schema.inAppInventoryItems).values({ userId: player.id, sku: wtfosAppMarketSku("pasta-protocol"), quantity: 2, metadata: { purchaseProof: "keep" } });
    const request = { seasonId: season.id, userId: player.id, actorUserId: host.id, appKeys: ["studio", "wtf-subdomains", "pasta-protocol"] as const };
    const results = await Promise.all([provision({ ...request, appKeys: [...request.appKeys] }, { studio: true }), provision({ ...request, appKeys: [...request.appKeys] }, { studio: true })]);
    assert.equal(results.filter((result) => result.grantedRole).length, 1);
    assert.deepEqual(results[0].roles, ["resident_wizard", "contestant", "gameshow_creator"]);
    assert.equal(results[0].tools.find((tool) => tool.appKey === "wtf-subdomains")?.globallyAvailable, false);
    assert.equal((await database.select().from(schema.users).where(eq(schema.users.id, player.id)))[0].role, "resident_wizard");
    const assigned = await database.select().from(schema.userRoles).where(eq(schema.userRoles.userId, player.id));
    assert.deepEqual(assigned.map((row) => row.role).sort(), ["contestant", "gameshow_creator", "resident_wizard"]);
    const inventory = await database.select().from(schema.inAppInventoryItems).where(eq(schema.inAppInventoryItems.userId, player.id));
    assert.equal(inventory.length, 2);
    const purchased = inventory.find((row) => row.sku === wtfosAppMarketSku("pasta-protocol"))!;
    assert.equal(purchased.quantity, 2);
    assert.deepEqual(purchased.metadata, { purchaseProof: "keep" });
    assert.equal(inventory.find((row) => row.sku === wtfosAppMarketSku("studio")), undefined, "Core Studio needs no invented pass");
    await provision({ ...request, userId: reserve.id, appKeys: [] });
    await assert.rejects(provision({ ...request, userId: outsider.id, appKeys: [] }), /active or reserve/);
    await assert.rejects(provision({ ...request, userId: blocked.id, appKeys: [] }), /time out/);
    await assert.rejects(provision({ ...request, appKeys: ["payroll"] as any }), /supported contestant tool/);
    assert.equal(events.length, 3);
    const audits = await database.select().from(schema.operatorActions);
    assert.equal(audits.length, 3);
    assert.ok(audits.every((row) => row.actionKind === "gameshow.contestant.provisioned"));
    assert.equal((await database.select().from(schema.userRoles).where(eq(schema.userRoles.userId, outsider.id))).length, 0);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await admin.end();
  }
});
