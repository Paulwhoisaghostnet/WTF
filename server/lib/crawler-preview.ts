import type { Request, Response } from "express";
import { getPublicSiteOrigin } from "../auth/oauth-base";
import { crawlerCachePolicy } from "./crawler-detect";

export type CrawlerPreview = {
  title: string;
  description: string;
  canonicalUrl: string;
  siteName?: string;
  imageUrl?: string | null;
  label?: string;
  accent?: string;
  cta?: string;
};

export function htmlEscape(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function compactText(value: string | null | undefined, maxLength = 220): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function requestBaseUrl(req: Request): string {
  const env = getPublicSiteOrigin();
  if (env) return env;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
  return host ? `${proto}://${host}` : "";
}

export function absoluteUrl(req: Request, pathOrUrl: string): string {
  const raw = String(pathOrUrl || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = requestBaseUrl(req).replace(/\/+$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${origin}${path}`;
}

export function renderCrawlerPreviewHtml(preview: CrawlerPreview): string {
  const siteName = preview.siteName || "WTF";
  const title = compactText(preview.title, 140) || siteName;
  const description = compactText(preview.description, 280) || "Open this WTF surface.";
  const label = compactText(preview.label || siteName, 64);
  const accent = /^#[0-9a-f]{6}$/i.test(preview.accent || "")
    ? preview.accent!
    : "#4b9f6a";
  const imageUrl = preview.imageUrl || null;
  const cardType = imageUrl ? "summary_large_image" : "summary";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEscape(title)}</title>
<meta name="description" content="${htmlEscape(description)}">
<link rel="canonical" href="${htmlEscape(preview.canonicalUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${htmlEscape(siteName)}">
<meta property="og:title" content="${htmlEscape(title)}">
<meta property="og:description" content="${htmlEscape(description)}">
<meta property="og:url" content="${htmlEscape(preview.canonicalUrl)}">
${imageUrl ? `<meta property="og:image" content="${htmlEscape(imageUrl)}">` : ""}
<meta name="twitter:card" content="${cardType}">
<meta name="twitter:title" content="${htmlEscape(title)}">
<meta name="twitter:description" content="${htmlEscape(description)}">
${imageUrl ? `<meta name="twitter:image" content="${htmlEscape(imageUrl)}">` : ""}
<style>
  html,body{margin:0;min-height:100%;background:#111;color:#eee;font:14px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
  body{display:grid;place-items:center;padding:20px;box-sizing:border-box;}
  main{width:min(720px,100%);border:1px solid #2f2f2f;background:#191919;box-shadow:0 16px 50px rgba(0,0,0,.36);overflow:hidden;}
  .bar{height:7px;background:${accent};}
  .media{display:block;width:100%;max-height:380px;object-fit:cover;background:#050505;}
  .body{padding:18px 20px 20px;}
  .label{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${accent};}
  h1{font-size:24px;line-height:1.12;margin:7px 0 10px;}
  p{font-size:14px;line-height:1.48;color:#cfcfcf;margin:0 0 16px;}
  a{display:inline-flex;align-items:center;color:#fff;text-decoration:none;border:1px solid #565656;padding:7px 10px;background:#252525;font-weight:700;font-size:12px;}
  a:hover{border-color:${accent};}
</style>
</head>
<body data-preview-client="crawler">
<main>
  <div class="bar"></div>
  ${imageUrl ? `<img class="media" src="${htmlEscape(imageUrl)}" alt="">` : ""}
  <div class="body">
    <div class="label">${htmlEscape(label)}</div>
    <h1>${htmlEscape(title)}</h1>
    <p>${htmlEscape(description)}</p>
    <a href="${htmlEscape(preview.canonicalUrl)}">${htmlEscape(preview.cta || "Open in WTF")}</a>
  </div>
</main>
</body>
</html>`;
}

export function sendCrawlerPreview(res: Response, preview: CrawlerPreview): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", crawlerCachePolicy(true));
  res.setHeader("Vary", "User-Agent, Purpose, X-Purpose");
  res.send(renderCrawlerPreviewHtml(preview));
}
