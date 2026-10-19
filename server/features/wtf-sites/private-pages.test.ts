import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import pg from "pg";
import express from "express";
import { chromium } from "@playwright/test";
import { servePrivateUserSite } from "./private-page-http";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { createPrivatePageAccess, readPrivatePageTicket, signPrivatePageTicket } from "./private-pages";
import { publicUserSitePages } from "./policy";

test("private page tickets are signed, scoped, expire with the source session, and reject tampering", () => {
  const value = { version: 1 as const, sid: "test-session", userId: 5, host: "player.wtfos.me", slug: "work", expiresAt: 1000 };
  const token = signPrivatePageTicket(value, "test-secret");
  assert.deepEqual(readPrivatePageTicket(token, "test-secret", 999), value);
  assert.equal(readPrivatePageTicket(token, "test-secret", 1000), null);
  assert.equal(readPrivatePageTicket(token, "another-secret", 999), null);
  assert.equal(readPrivatePageTicket(`${token}.extra`, "test-secret", 999), null);
});

test("public site/PDS snapshots never include private page contents, titles, or slugs", () => {
  const pages = publicUserSitePages([{ slug: "home", title: "Public", draftHtml: "hello", visibility: "public" },
    { slug: "secret-round", title: "Secret title", draftHtml: "Secret answer", visibility: "private" }]);
  assert.deepEqual(pages, [{ slug: "home", title: "Public", html: "hello" }]);
  const service = readFileSync("server/features/wtf-sites/service.ts", "utf8");
  assert.match(service, /const pageSnapshots: ManifestPageSnapshot\[\] = publicUserSitePages\(refreshedPages\)/);
  assert.match(service, /currentPage\?\.visibility === "private"\) return \{ kind: "not_found" \}/);
  const router = readFileSync("server/features/wtf-sites/private-page-http.ts", "utf8");
  assert.match(router, /Cache-Control", "private, no-store"/);
  assert.match(router, /httpOnly: true/);
  assert.doesNotMatch(router, /res\.cookie\([^;]+domain:/s);
  assert.match(readFileSync("server/app.ts", "utf8"), /"form-action": \["'self'", `https:\/\/\*\.\$\{getSpineConfig\(\)\.networkDomain\}`\]/);
});

const connectionString = process.env.GAMESHOW_TEST_DATABASE_URL;
const local = connectionString && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(connectionString).hostname);

test("private page publishing persists only privately; owner/admin reads require a live scoped session", { skip: !local && "Opt in with GAMESHOW_TEST_DATABASE_URL pointing to local PostgreSQL; run npm run test:gameshow:postgres" }, async () => {
  const namespace = `private_pages_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString });
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${namespace},public` });
  try {
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    for (const table of ["users", "user_roles", "session", "wtf_user_sites", "wtf_user_site_pages", "wtf_user_site_audit_events"]) {
      await admin.query(`CREATE TABLE "${namespace}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    // Apply the new page columns only to this proof schema if the local app migration is pending.
    await pool.query("ALTER TABLE wtf_user_site_pages ADD COLUMN IF NOT EXISTS visibility varchar(16) NOT NULL DEFAULT 'public', ADD COLUMN IF NOT EXISTS private_published_html text, ADD COLUMN IF NOT EXISTS private_published_title text, ADD COLUMN IF NOT EXISTS private_published_at timestamp");
    const database = drizzle(pool, { schema });
    const access = createPrivatePageAccess(database);
    const [owner, staff, outsider] = await database.insert(schema.users).values([{ username: "private-owner", role: "contestant" }, { username: "private-admin", role: "admin" }, { username: "private-outsider", role: "witness" }]).returning();
    const [site] = await database.insert(schema.wtfUserSites).values({ userId: owner.id, label: "private-owner", host: "private-owner.wtfos.me" }).returning();
    const privateHtml = `<p>saved-secret</p><button id="paint">Paint</button><canvas id="canvas" width="2" height="2"></canvas><output id="result">Waiting</output><script>
      document.querySelector('#paint').onclick = () => {
        const context = document.querySelector('#canvas').getContext('2d'); context.fillStyle = '#ff0000'; context.fillRect(0,0,2,2);
        document.querySelector('#result').textContent = 'Painted';
        try { document.cookie; document.body.dataset.cookies = 'readable'; } catch { document.body.dataset.cookies = 'blocked'; }
        try { localStorage.getItem('private-test'); document.body.dataset.storage = 'readable'; } catch { document.body.dataset.storage = 'blocked'; }
        fetch('https://example.invalid/private-page-network-test').then(() => document.body.dataset.network = 'allowed').catch(() => document.body.dataset.network = 'blocked');
      };
    </script>`;
    await database.insert(schema.wtfUserSitePages).values([{ siteId: site.id, slug: "work", title: "Private work", draftHtml: privateHtml, visibility: "private" }, { siteId: site.id, slug: "home", title: "Public home", draftHtml: "public", visibility: "public" }]);
    // No arbitrary ticket TTL: use the existing session-cookie policy's expiry.
    const expire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    for (const user of [owner, staff, outsider]) await database.insert(schema.sessions).values({ sid: `session-${user.id}`, sess: { passport: { user: user.id } }, expire });
    const issue = (userId: number) => access.issue({ host: site.host, slug: "work", userId, sid: `session-${userId}` });
    await assert.rejects(issue(owner.id), /Publish this private page/);
    await access.publish(owner.id, "work");
    await assert.rejects(access.publish(outsider.id, "work"), /Claim an active site/);
    await assert.rejects(access.publish(owner.id, "home"), /saved private page/);
    const handoff = await issue(owner.id);
    const publication = await access.read(site.host, "work", handoff.token);
    assert.equal(publication.page.privatePublishedHtml, privateHtml);
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => { void servePrivateUserSite(req, res, String(req.headers["x-forwarded-host"] || req.hostname), access).catch(next); });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const address = server.address() as { port: number };
      const origin = `http://127.0.0.1:${address.port}`;
      const denied = await fetch(`${origin}/_private/work`, { headers: { "X-Forwarded-Host": site.host } });
      assert.equal(denied.status, 401);
      assert.doesNotMatch(await denied.text(), /saved-secret/);
      const accepted = await fetch(`${origin}/_private/access`, { method: "POST", redirect: "manual", headers: { "X-Forwarded-Host": site.host, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: handoff.token }).toString() });
      assert.equal(accepted.status, 303);
      assert.equal(accepted.headers.get("location"), "/_private/work");
      const cookie = accepted.headers.get("set-cookie")!;
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /Path=\/_private\//);
      assert.doesNotMatch(cookie, /Domain=/);
      const allowed = await fetch(`${origin}/_private/work`, { headers: { "X-Forwarded-Host": site.host, Cookie: cookie.split(";")[0] } });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get("cache-control"), "private, no-store");
      assert.match(allowed.headers.get("content-security-policy")!, /sandbox allow-scripts/);
      assert.doesNotMatch(allowed.headers.get("content-security-policy")!, /allow-same-origin/);
      assert.match(await allowed.text(), /saved-secret/);
      const browser = await chromium.launch();
      try {
        const context = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-Host": site.host } });
        let externalRequests = 0;
        await context.route("https://example.invalid/**", async (route) => { externalRequests += 1; await route.abort(); });
        await context.request.post(`${origin}/_private/access`, { form: { token: handoff.token }, maxRedirects: 0 });
        const page = await context.newPage();
        await page.goto(`${origin}/_private/work`);
        await page.getByRole("button", { name: "Paint", exact: true }).click();
        await page.waitForFunction(() => document.body.dataset.network === "blocked");
        assert.equal(await page.locator("#result").textContent(), "Painted");
        assert.deepEqual(await page.locator("#canvas").evaluate((element) => [...(element as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data]), [255, 0, 0, 255]);
        assert.equal(await page.locator("body").getAttribute("data-cookies"), "blocked");
        assert.equal(await page.locator("body").getAttribute("data-storage"), "blocked");
        assert.equal(externalRequests, 0);
      } finally { await browser.close(); }
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    await database.update(schema.wtfUserSitePages).set({ draftHtml: "unsaved-to-host" }).where(eq(schema.wtfUserSitePages.id, publication.page.id));
    assert.equal((await access.read(site.host, "work", handoff.token)).page.privatePublishedHtml, privateHtml);
    assert.equal((await access.read(site.host, "work", (await issue(staff.id)).token)).page.privatePublishedTitle, "Private work");
    await assert.rejects(issue(outsider.id), /only to its owner/);
    await assert.rejects(access.read(site.host, "work", ""), /Sign in/);
    await assert.rejects(access.read("another.wtfos.me", "work", handoff.token), /Sign in/);
    await assert.rejects(access.read(site.host, "home", handoff.token), /Sign in/);
    await database.delete(schema.sessions).where(eq(schema.sessions.sid, `session-${owner.id}`));
    await assert.rejects(access.read(site.host, "work", handoff.token), /session ended/);
    await database.update(schema.users).set({ role: "witness" }).where(eq(schema.users.id, staff.id));
    await assert.rejects(issue(staff.id), /only to its owner/);
    const audit = await database.select().from(schema.wtfUserSiteAuditEvents);
    assert.deepEqual(audit.map((row) => row.metadata), [{ visibility: "private", slug: "work" }]);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await admin.end();
  }
});
