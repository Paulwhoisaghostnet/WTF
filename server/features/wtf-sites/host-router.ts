import type { NextFunction, Request, Response } from "express";
import { createTlsAllowHandler } from "@wtfos/atproto-spine";
import { getSpineConfig, infraHosts, RESERVED_HANDLES } from "../atproto-spine/config";
import { wellKnownPinsForHost } from "../ipfs-pinning/service";
import { serveStoredMediaFile } from "../../lib/storage/media-file-serve";
import {
  classifyUserSiteHost,
  isBlockedUserSitePath,
} from "./policy";
import {
  isHostRegisteredForTls,
  redirectUrlForUnpublishedHost,
  resolveDidForHost,
  resolvePublishedAsset,
  resolvePublishedPage,
} from "./service";

const USER_SITE_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "img-src 'self' https: data: blob:",
  "media-src 'self' https: data: blob:",
  "font-src 'self' https: data:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self' 'unsafe-inline' https: data: blob:",
  "connect-src 'self' https: wss://relay.walletconnect.org",
  "frame-src https://verify.walletconnect.org",
  "worker-src 'none'",
  "child-src 'none'",
].join("; ");

function requestHost(req: Request): string {
  return String(req.headers["x-forwarded-host"] || req.headers.host || req.hostname || "");
}

function setUserSiteHeaders(res: Response) {
  res.removeHeader("Set-Cookie");
  res.setHeader("Content-Security-Policy", USER_SITE_CSP);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-WTFOS-Surface", "user-site");
}

function htmlShell(input: { title: string; html: string; digest: string }): string {
  const body = String(input.html || "");
  if (/^\s*<!doctype\s+html/i.test(body) || /^\s*<html[\s>]/i.test(body)) {
    return body;
  }
  const title = String(input.title || "wtfOS site")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="wtfos-site-digest" content="${input.digest}">
  <title>${title}</title>
</head>
<body>
${body}
</body>
</html>`;
}

async function serveMedia(req: Request, res: Response, host: string): Promise<boolean> {
  const match = req.path.match(/^\/_media\/(\d+)$/);
  if (!match) return false;
  const mediaId = Number(match[1]);
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    res.status(404).type("text/plain").send("Not found");
    return true;
  }
  const media = await resolvePublishedAsset({ host, mediaId });
  if (!media) {
    res.status(404).type("text/plain").send("Not found");
    return true;
  }
  setUserSiteHeaders(res);
  const served = await serveStoredMediaFile(req, res, media);
  if (served) return true;
  const fallback = media.playbackUrl || media.sourceUrl || media.posterUrl;
  if (fallback && /^https?:\/\//i.test(fallback)) {
    res.redirect(302, fallback);
    return true;
  }
  res.status(404).type("text/plain").send("Not found");
  return true;
}

export async function userSiteHostRouter(req: Request, res: Response, next: NextFunction) {
  const config = getSpineConfig();
  const classified = classifyUserSiteHost(requestHost(req), config.networkDomain);
  if (!classified.isUserSiteHost) return next();

  const host = classified.host;
  setUserSiteHeaders(res);

  try {
    if (req.path === "/.well-known/atproto-did") {
      const resolved = await resolveDidForHost(host);
      if (!resolved) return res.status(404).type("text/plain").send("DID not found");
      if (resolved.status === "suspended") {
        return res.status(410).type("text/plain").send("Site suspended");
      }
      return res.status(200).type("text/plain").send(`${resolved.did}\n`);
    }

    if (req.path === "/.well-known/wtfos-pins") {
      const result = await wellKnownPinsForHost(host);
      res.setHeader("Cache-Control", "public, max-age=30, must-revalidate");
      return res.status(result.status).type("json").send(result.body);
    }

    if (await serveMedia(req, res, host)) return;

    if (isBlockedUserSitePath(req.path)) {
      return res.status(404).type("text/plain").send("Not found");
    }

    const result = await resolvePublishedPage({ host, pathname: req.path });
    if (result.kind === "missing") {
      return res.status(404).type("text/plain").send("Site not found");
    }
    if (result.kind === "suspended") {
      return res.status(410).type("text/plain").send("Site suspended");
    }
    if (result.kind === "redirect") {
      return res.redirect(302, result.url);
    }
    if (result.kind === "not_found") {
      const redirect = await redirectUrlForUnpublishedHost(host);
      return redirect
        ? res.redirect(302, redirect)
        : res.status(404).type("text/plain").send("Not found");
    }

    res.setHeader("Cache-Control", "public, max-age=30, must-revalidate");
    return res.status(200).type("html").send(
      htmlShell({
        title: result.title,
        html: result.html,
        digest: result.digest,
      })
    );
  } catch (err) {
    return next(err);
  }
}

export const tlsAllowHandler = createTlsAllowHandler({
  networkDomain: getSpineConfig().networkDomain,
  infraHosts: infraHosts(),
  reservedHandles: [...RESERVED_HANDLES],
  isHandleRegistered: isHostRegisteredForTls,
});
