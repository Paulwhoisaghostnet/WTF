import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../db";
import { sessions, users, wtfUserSiteAuditEvents, wtfUserSitePages, wtfUserSites } from "@shared/schema";
import { listRolesForUserSnapshot } from "../../lib/user-roles";
import { getSessionSecret } from "../../auth/session-secret";
import { normalizeUserSiteSlug } from "./policy";
import { WtfUserSiteError } from "./service";
import { ingestSystemEvent } from "../../challenges/events/ingest";

export const PRIVATE_SITE_COOKIE = "wtfos-private-page";
export const PRIVATE_SITE_PREFIX = "/_private/";
// Inline, self-contained project interaction is permitted in an opaque origin.
// No same-origin capability, external script, form submission, or network access is granted.
export const PRIVATE_SITE_CSP = "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' blob: data:; connect-src 'none'; sandbox allow-scripts allow-downloads allow-top-navigation-by-user-activation";
type Ticket = { version: 1; sid: string; userId: number; host: string; slug: string; expiresAt: number };
type PrivatePageEvent = { id: string; handle: "wtf_sites.private.published" | "wtf_sites.private.opened"; userId: number; siteId: number; slug: string };

export function signPrivatePageTicket(ticket: Ticket, secret = getSessionSecret()): string {
  const data = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(`wtfos-private-site:${data}`).digest("base64url")}`;
}

export function readPrivatePageTicket(token: string, secret = getSessionSecret(), now = Date.now()): Ticket | null {
  try {
    const [data, signature, extra] = token.split(".");
    if (!data || !signature || extra) return null;
    const expected = createHmac("sha256", secret).update(`wtfos-private-site:${data}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return null;
    const value = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (value.version !== 1 || typeof value.sid !== "string" || !value.sid || !Number.isSafeInteger(value.userId) || value.userId <= 0 || typeof value.host !== "string" || normalizeUserSiteSlug(value.slug) !== value.slug || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) return null;
    return value;
  } catch { return null; }
}

export function createPrivatePageAccess(database: typeof db, emit?: (event: PrivatePageEvent) => Promise<void>) {
  async function notify(event: PrivatePageEvent) {
    if (emit) await emit(event).catch((error) => console.error("[wtf-sites] private page event projection failed", { eventId: event.id, error }));
  }
  async function authorized(host: string, slug: string, userId: number) {
    const [site] = await database.select().from(wtfUserSites).where(eq(wtfUserSites.host, host));
    if (!site || site.status === "suspended") throw new WtfUserSiteError(404, "Private page not found");
    const [viewer] = await database.select().from(users).where(eq(users.id, userId));
    if (!viewer) throw new WtfUserSiteError(401, "Sign in to open this private page");
    const roles = await listRolesForUserSnapshot(viewer, database);
    if (viewer.id !== site.userId && !roles.includes("admin")) throw new WtfUserSiteError(403, "This private page is available only to its owner and administrators reviewing it");
    const [page] = await database.select().from(wtfUserSitePages).where(and(eq(wtfUserSitePages.siteId, site.id), eq(wtfUserSitePages.slug, slug)));
    if (!page || page.visibility !== "private" || !page.privatePublishedAt) throw new WtfUserSiteError(404, "Publish this private page before opening it");
    return { site, page };
  }

  async function sessionOwner(sid: string, userId: number) {
    const [session] = await database.select().from(sessions).where(and(eq(sessions.sid, sid), gt(sessions.expire, new Date())));
    const owner = Number((session?.sess as { passport?: { user?: unknown } } | undefined)?.passport?.user);
    if (!session || owner !== userId) throw new WtfUserSiteError(401, "Your sign-in session ended. Open this page again from WTF Domains.");
    return session;
  }

  return {
    async issue(input: { host: string; slug: string; userId: number; sid: string }) {
      const host = input.host.toLowerCase();
      const slug = normalizeUserSiteSlug(input.slug);
      if (!slug) throw new WtfUserSiteError(400, "Invalid page slug");
      const { site } = await authorized(host, slug, input.userId);
      const session = await sessionOwner(input.sid, input.userId);
      await notify({ id: randomUUID(), handle: "wtf_sites.private.opened", userId: input.userId, siteId: site.id, slug });
      return { url: `https://${host}${PRIVATE_SITE_PREFIX}access`, token: signPrivatePageTicket({ version: 1, host, slug, userId: input.userId, sid: input.sid, expiresAt: session.expire.getTime() }) };
    },
    async read(host: string, slug: string, token: string) {
      const ticket = readPrivatePageTicket(token);
      if (!ticket || ticket.host !== host || ticket.slug !== slug) throw new WtfUserSiteError(401, "Sign in through WTF Domains to open this private page");
      await sessionOwner(ticket.sid, ticket.userId);
      const result = await authorized(host, slug, ticket.userId);
      return { ...result, ticket };
    },
    async publish(userId: number, slug: string) {
      const [site] = await database.select().from(wtfUserSites).where(eq(wtfUserSites.userId, userId));
      if (!site || site.status === "suspended") throw new WtfUserSiteError(404, "Claim an active site before publishing a private page");
      const [page] = await database.select().from(wtfUserSitePages).where(and(eq(wtfUserSitePages.siteId, site.id), eq(wtfUserSitePages.slug, slug)));
      if (!page || page.visibility !== "private") throw new WtfUserSiteError(400, "Select a saved private page");
      const auditId = await database.transaction(async (tx) => {
        await tx.update(wtfUserSitePages).set({ privatePublishedHtml: page.draftHtml, privatePublishedTitle: page.title, privatePublishedAt: new Date() }).where(eq(wtfUserSitePages.id, page.id));
        const [audit] = await tx.insert(wtfUserSiteAuditEvents).values({ siteId: site.id, actorUserId: userId, eventType: "published", metadata: { visibility: "private", slug } }).returning({ id: wtfUserSiteAuditEvents.id });
        return audit.id;
      });
      await notify({ id: String(auditId), handle: "wtf_sites.private.published", userId, siteId: site.id, slug });
    },
  };
}

export const privatePageAccess = createPrivatePageAccess(db, async (event) => {
  await ingestSystemEvent({ eventId: `wtf-site-private-${event.handle}-${event.id}`, eventType: "app.interaction.tracked", userId: event.userId,
    source: "wtf-sites", sourceModule: "wtf-sites", rawRefType: "wtf_user_site", rawRefId: event.siteId,
    metadata: { handle: event.handle, siteId: event.siteId, slug: event.slug, visibility: "private", trustLevel: "server" } });
});
