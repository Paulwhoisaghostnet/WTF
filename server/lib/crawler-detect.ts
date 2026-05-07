import type { Request } from "express";

const CRAWLER_PATTERNS = [
  /twitterbot/i,
  /facebookexternalhit/i,
  /discordbot/i,
  /slackbot/i,
  /telegrambot/i,
  /linkedinbot/i,
  /embedly/i,
  /googlebot/i,
  /bingbot/i,
  /duckduckbot/i,
  /baiduspider/i,
];

const HUMAN_BROWSER_HINTS = [
  /mozilla\/5\.0/i,
  /chrome\//i,
  /safari\//i,
  /firefox\//i,
  /edg\//i,
];

export function isCrawlerUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || "").trim();
  if (!ua) return false;
  return CRAWLER_PATTERNS.some((pattern) => pattern.test(ua));
}

export function requestLooksLikeCrawler(req: Pick<Request, "headers">): boolean {
  const ua = String(req.headers["user-agent"] || "");
  if (isCrawlerUserAgent(ua)) return true;

  const purpose = String(req.headers.purpose || req.headers["x-purpose"] || "").toLowerCase();
  if (purpose.includes("preview") || purpose.includes("prefetch")) {
    return !HUMAN_BROWSER_HINTS.some((pattern) => pattern.test(ua));
  }

  const accept = String(req.headers.accept || "").toLowerCase();
  return accept.includes("text/html") && accept.includes("bot");
}

export function crawlerCachePolicy(isCrawler: boolean): string {
  return isCrawler
    ? "public, max-age=300, stale-while-revalidate=600"
    : "public, max-age=30";
}
