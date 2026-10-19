import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";

const connectionString = process.env.GAMESHOW_TEST_DATABASE_URL;
const local = connectionString && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(connectionString).hostname);

test("site management responses preserve owner/admin privacy and private slugs consult all public history", { skip: !local && "Opt in with GAMESHOW_TEST_DATABASE_URL pointing to local PostgreSQL; run npm run test:gameshow:postgres" }, async () => {
  const namespace = `private_boundary_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString });
  const proof = new pg.Pool({ connectionString, options: `-c search_path=${namespace},public` });
  const previousUrl = process.env.DATABASE_URL;
  let applicationPool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    for (const table of ["users", "user_roles", "wtf_user_sites", "wtf_user_site_pages", "wtf_user_site_versions", "wtf_user_site_asset_refs", "wtf_user_site_audit_events", "user_media_library"]) {
      await admin.query(`CREATE TABLE "${namespace}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await proof.query("ALTER TABLE wtf_user_site_pages ADD COLUMN IF NOT EXISTS visibility varchar(16) NOT NULL DEFAULT 'public', ADD COLUMN IF NOT EXISTS private_published_html text, ADD COLUMN IF NOT EXISTS private_published_title text, ADD COLUMN IF NOT EXISTS private_published_at timestamp");
    const database = drizzle(proof, { schema });
    const [owner, host, cohost, custom, strictAdmin] = await database.insert(schema.users).values([
      { username: "private-boundary-owner", role: "contestant" },
      { username: "private-boundary-host", role: "host" },
      { username: "private-boundary-cohost", role: "cohost" },
      { username: "private-boundary-custom", role: "witness" },
      { username: "private-boundary-admin", role: "witness" },
    ]).returning();
    await database.insert(schema.userRoles).values([{ userId: strictAdmin.id, role: "admin" }, { userId: custom.id, role: "site_manager" }]);
    const [site] = await database.insert(schema.wtfUserSites).values({ userId: owner.id, label: "private-boundary-owner", host: "private-boundary-owner.wtfos.me" }).returning();
    await database.insert(schema.wtfUserSitePages).values([
      { siteId: site.id, slug: "home", title: "Public home", draftHtml: "public-visible", visibility: "public" },
      { siteId: site.id, slug: "secret-private-slug", title: "Secret private title", draftHtml: "private-draft-marker", visibility: "private" },
    ]);
    // 21 versions deliberately put the old public slug outside the existing 20-row display page.
    await database.insert(schema.wtfUserSiteVersions).values(Array.from({ length: 21 }, (_, index) => ({
      siteId: site.id, versionNumber: index + 1, did: "did:plc:private-boundary", didSource: "bsky" as const, digest: `digest-${index}`,
      pages: [{ slug: index === 0 ? "old-public-slug" : "home", title: "Previously public", html: "public-history" }],
    })));
    const scoped = new URL(connectionString!);
    scoped.searchParams.set("options", `-c search_path=${namespace},public`);
    process.env.DATABASE_URL = scoped.toString();
    const service = await import("./service");
    applicationPool = (await import("../../db")).pool;
    const safeManagementResponse = (value: unknown) => {
      assert.doesNotMatch(JSON.stringify(value), /secret-private-slug|Secret private title|private-draft-marker/);
      assert.match(JSON.stringify(value), /public-visible/);
    };
    safeManagementResponse(await service.listAdminUserSites());
    for (const viewer of [host, cohost, custom]) {
      safeManagementResponse(await service.listAdminUserSites(100, viewer.id));
      const suspended = await service.suspendUserSite(site.id, viewer.id, "Private boundary test");
      assert.equal(suspended.status, "suspended");
      safeManagementResponse(suspended);
      const restored = await service.restoreUserSite(site.id, viewer.id);
      assert.equal(restored.status, "draft");
      safeManagementResponse(restored);
    }
    for (const viewer of [owner, strictAdmin]) {
      const result = await service.listAdminUserSites(100, viewer.id);
      assert.equal(result[0].pages.find((page) => page.slug === "secret-private-slug")?.draftHtml, "private-draft-marker");
    }
    await database.delete(schema.userRoles).where(eq(schema.userRoles.userId, strictAdmin.id));
    safeManagementResponse(await service.listAdminUserSites(100, strictAdmin.id));
    await assert.rejects(service.saveUserSitePage({ userId: owner.id, slug: "old-public-slug", title: "New private draft", html: "keep-secret", visibility: "private" }), /already published publicly/);
    assert.equal((await database.select().from(schema.wtfUserSitePages)).length, 2, "Rejected historical public slug creates no private page");
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await applicationPool?.end();
    await proof.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await admin.end();
  }
});
