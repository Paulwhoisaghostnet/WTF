import type { Request, Response } from "express";
import { resolvePublicSiteOrigin } from "@shared/platform-branding";
import { privatePageAccess, PRIVATE_SITE_COOKIE, PRIVATE_SITE_CSP, PRIVATE_SITE_PREFIX, readPrivatePageTicket } from "./private-pages";
import { WtfUserSiteError } from "./service";

export async function servePrivateUserSite(req: Request, res: Response, host: string, access = privatePageAccess) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", PRIVATE_SITE_CSP);
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  try {
    if (req.path === `${PRIVATE_SITE_PREFIX}access` && req.method === "POST") {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const ticket = readPrivatePageTicket(token);
      if (!ticket) throw new WtfUserSiteError(401, "Private page sign-in expired");
      await access.read(host, ticket.slug, token);
      res.cookie(PRIVATE_SITE_COOKIE, token, { httpOnly: true, secure: req.secure || process.env.NODE_ENV === "production", sameSite: "lax", path: PRIVATE_SITE_PREFIX, expires: new Date(ticket.expiresAt) });
      return res.redirect(303, `${PRIVATE_SITE_PREFIX}${encodeURIComponent(ticket.slug)}`);
    }
    const slug = decodeURIComponent(req.path.slice(PRIVATE_SITE_PREFIX.length));
    const cookie = String(req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${PRIVATE_SITE_COOKIE}=`));
    const token = cookie ? decodeURIComponent(cookie.slice(PRIVATE_SITE_COOKIE.length + 1)) : "";
    const { page } = await access.read(host, slug, token);
    const title = String(page.privatePublishedTitle ?? page.title).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const content = page.privatePublishedHtml ?? "";
    const html = /^\s*<!doctype\s+html|^\s*<html[\s>]/i.test(content) ? content : `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body>${content}</body></html>`;
    return res.status(200).type("html").send(html);
  } catch (error) {
    if (!(error instanceof WtfUserSiteError)) throw error;
    const openUrl = `${resolvePublicSiteOrigin(process.env.PUBLIC_SITE_URL)}/wtf-subdomains?privateHost=${encodeURIComponent(host)}&privatePage=${encodeURIComponent(req.path.slice(PRIVATE_SITE_PREFIX.length))}`;
    return res.status(error.status).type("html").send(`<main><h1>Private page</h1><p>Sign in as the page owner or an administrator to open this page.</p><a href="${openUrl.replaceAll("&", "&amp;")}" rel="noreferrer">Open through WTF Domains</a></main>`);
  }
}
