import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import type { Request, Response } from "express";

const DEFAULT_CACHE_DIR = path.resolve(process.cwd(), "data", "console-dependencies");
const CACHE_DIR = process.env.CONSOLE_DEPENDENCY_CACHE_DIR || DEFAULT_CACHE_DIR;
const MAX_DEPENDENCY_BYTES = Number(process.env.CONSOLE_DEPENDENCY_MAX_BYTES || 80 * 1024 * 1024);
const FETCH_TIMEOUT_MS = Number(process.env.CONSOLE_DEPENDENCY_FETCH_TIMEOUT_MS || 20_000);
const EMULATORJS_BASE_URL =
  process.env.CONSOLE_EMULATORJS_BASE_URL || "https://cdn.emulatorjs.org/stable/data/";

const BUILTIN_ALLOWED_HOSTS = new Set([
  "cdn.emulatorjs.org",
  "cdn.jsdelivr.net",
  "cdn.skypack.dev",
  "cdnjs.cloudflare.com",
  "esm.sh",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "ga.jspm.io",
  "jspm.dev",
  "rawcdn.githack.com",
  "skypack.dev",
  "unpkg.com",
  "v8.js-dos.com",
]);

const EXTRA_ALLOWED_HOSTS = new Set(
  String(process.env.CONSOLE_DEPENDENCY_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);

export type CachedDependencyMeta = {
  sourceUrl: string;
  finalUrl: string;
  contentType: string;
  fetchedAt: string;
  bytes: number;
};

export type ConsoleDependencyDecision =
  | {
      status: "cacheable";
      rawUrl: string;
      url: string;
      host: string;
      proxyPath: string;
    }
  | {
      status: "ignored" | "blocked";
      rawUrl: string;
      reason: string;
      host?: string;
    };

function cacheKeyFor(url: URL): string {
  return createHash("sha256").update(url.href).digest("hex");
}

function cachePathsFor(url: URL) {
  const key = cacheKeyFor(url);
  return {
    bodyPath: path.join(CACHE_DIR, `${key}.body`),
    metaPath: path.join(CACHE_DIR, `${key}.json`),
  };
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (ipVersion === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  }
  return false;
}

function isAllowedDependencyHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BUILTIN_ALLOWED_HOSTS.has(host) || EXTRA_ALLOWED_HOSTS.has(host)) return true;
  return (
    host.endsWith(".jsdelivr.net") ||
    host.endsWith(".gstatic.com") ||
    host.endsWith(".skypack.dev")
  );
}

export function classifyConsoleDependencyUrl(
  rawUrl: string,
  baseUrl?: string
): ConsoleDependencyDecision {
  const raw = String(rawUrl || "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) {
    return { status: "ignored", rawUrl: rawUrl, reason: "non_fetch_dependency" };
  }
  try {
    const url = raw.startsWith("//")
      ? new URL(`https:${raw}`)
      : baseUrl
        ? new URL(raw, baseUrl)
        : new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { status: "ignored", rawUrl, reason: "unsupported_protocol", host: url.hostname };
    }
    if (isPrivateHostname(url.hostname)) {
      return { status: "blocked", rawUrl, reason: "private_or_local_host", host: url.hostname };
    }
    if (!isAllowedDependencyHost(url.hostname)) {
      return { status: "blocked", rawUrl, reason: "host_not_allowlisted", host: url.hostname };
    }
    url.hash = "";
    return {
      status: "cacheable",
      rawUrl,
      url: url.href,
      host: url.hostname,
      proxyPath: consoleDependencyProxyPath(url),
    };
  } catch {
    return { status: "ignored", rawUrl, reason: "invalid_url" };
  }
}

export function normalizeConsoleDependencyUrl(rawUrl: string, baseUrl?: string): URL | null {
  const decision = classifyConsoleDependencyUrl(rawUrl, baseUrl);
  if (decision.status !== "cacheable") return null;
  try {
    const url = new URL(decision.url);
    return url;
  } catch {
    return null;
  }
}

export function consoleDependencyProxyPath(url: URL): string {
  return `/api/console/dependency?url=${encodeURIComponent(url.href)}`;
}

function rewriteMatchedUrl(rawUrl: string, baseUrl?: string): string {
  const url = normalizeConsoleDependencyUrl(rawUrl, baseUrl);
  return url ? consoleDependencyProxyPath(url) : rawUrl;
}

function rewriteOriginHints(source: string): string {
  return source.replace(
    /<link\b(?=[^>]*\brel=["'](?:preconnect|dns-prefetch)["'])([^>]*?)\bhref=(["'])((?:https?:)?\/\/[^"']+)\2([^>]*)>/gi,
    (_match, before: string, quote: string, rawUrl: string, after: string) => {
      const decision = classifyConsoleDependencyUrl(rawUrl);
      if (decision.status === "cacheable" || decision.status === "blocked") {
        return `<link${before}href=${quote}/${quote}${after}>`;
      }
      return _match;
    }
  );
}

export function rewriteConsoleDependencyUrls(source: string, baseUrl?: string): string {
  return rewriteOriginHints(source)
    .replace(
      /(\b(?:src|href|poster|data|action)\s*=\s*["'])((?:https?:)?\/\/[^"']+)(["'])/gi,
      (_match, prefix: string, rawUrl: string, suffix: string) =>
        `${prefix}${rewriteMatchedUrl(rawUrl, baseUrl)}${suffix}`
    )
    .replace(
      /(@import\s+(?:url\(\s*)?["']?)((?:https?:)?\/\/[^"')\s]+)(["']?\s*\)?)/gi,
      (_match, prefix: string, rawUrl: string, suffix: string) =>
        `${prefix}${rewriteMatchedUrl(rawUrl, baseUrl)}${suffix}`
    )
    .replace(
      /(url\(\s*["']?)((?:https?:)?\/\/[^"')]+)(["']?\s*\))/gi,
      (_match, prefix: string, rawUrl: string, suffix: string) =>
        `${prefix}${rewriteMatchedUrl(rawUrl, baseUrl)}${suffix}`
    )
    .replace(
      /(["'`])((?:https?:)?\/\/[^"'`\s<>]+)(["'`])/g,
      (_match, quote: string, rawUrl: string, suffix: string) =>
        `${quote}${rewriteMatchedUrl(rawUrl, baseUrl)}${suffix}`
    );
}

function collectRawDependencyUrls(source: string): string[] {
  const urls: string[] = [];
  const scanSource = source.replace(
    /<link\b(?=[^>]*\brel=["'](?:preconnect|dns-prefetch)["'])[^>]*>/gi,
    ""
  );
  const patterns: Array<{ re: RegExp; index: number }> = [
    {
      re: /(\b(?:src|href|poster|data|action)\s*=\s*["'])((?:https?:)?\/\/[^"']+)(["'])/gi,
      index: 2,
    },
    {
      re: /(@import\s+(?:url\(\s*)?["']?)((?:https?:)?\/\/[^"')\s]+)(["']?\s*\)?)/gi,
      index: 2,
    },
    {
      re: /(url\(\s*["']?)((?:https?:)?\/\/[^"')]+)(["']?\s*\))/gi,
      index: 2,
    },
    {
      re: /(["'`])((?:https?:)?\/\/[^"'`\s<>]+)(["'`])/g,
      index: 2,
    },
  ];

  for (const pattern of patterns) {
    for (const match of scanSource.matchAll(pattern.re)) {
      const raw = match[pattern.index];
      if (raw) urls.push(raw);
    }
  }
  return urls;
}

export function collectConsoleDependencyDecisions(
  source: string,
  baseUrl?: string
): ConsoleDependencyDecision[] {
  const decisions = new Map<string, ConsoleDependencyDecision>();
  for (const rawUrl of collectRawDependencyUrls(source)) {
    const decision = classifyConsoleDependencyUrl(rawUrl, baseUrl);
    const key = decision.status === "cacheable" ? decision.url : `${decision.status}:${rawUrl}`;
    if (!decisions.has(key)) decisions.set(key, decision);
  }
  return [...decisions.values()];
}

function inferContentType(url: URL): string {
  const ext = path.extname(url.pathname).toLowerCase();
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".wasm") return "application/wasm";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".woff") return "font/woff";
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function isTextDependency(contentType: string, url: URL): boolean {
  const type = contentType.toLowerCase();
  const ext = path.extname(url.pathname).toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("javascript") ||
    type.includes("json") ||
    type.includes("xml") ||
    ext === ".css" ||
    ext === ".js" ||
    ext === ".mjs" ||
    ext === ".json" ||
    ext === ".svg"
  );
}

async function readCachedDependency(url: URL): Promise<{ body: Buffer; meta: CachedDependencyMeta } | null> {
  const paths = cachePathsFor(url);
  if (!existsSync(paths.bodyPath) || !existsSync(paths.metaPath)) return null;
  const [body, rawMeta] = await Promise.all([
    fs.readFile(paths.bodyPath),
    fs.readFile(paths.metaPath, "utf-8"),
  ]);
  const meta = JSON.parse(rawMeta) as CachedDependencyMeta;
  return { body, meta };
}

export function isConsoleDependencyCached(url: URL): boolean {
  const paths = cachePathsFor(url);
  return existsSync(paths.bodyPath) && existsSync(paths.metaPath);
}

async function fetchWithRedirects(url: URL, redirectsLeft = 5): Promise<{
  body: Buffer;
  finalUrl: URL;
  contentType: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "WTF-Console-Dependency-Resolver/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      if (redirectsLeft <= 0) throw new Error("Too many dependency redirects");
      const location = response.headers.get("location");
      if (!location) throw new Error("Dependency redirect had no Location header");
      const next = normalizeConsoleDependencyUrl(location, url.href);
      if (!next) throw new Error("Dependency redirected to an unsupported URL");
      return fetchWithRedirects(next, redirectsLeft - 1);
    }
    if (!response.ok) {
      throw new Error(`Dependency fetch failed with HTTP ${response.status}`);
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_DEPENDENCY_BYTES) {
      throw new Error(`Dependency is too large (${contentLength} bytes)`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_DEPENDENCY_BYTES) {
      throw new Error(`Dependency is too large (${body.length} bytes)`);
    }
    return {
      body,
      finalUrl: url,
      contentType: response.headers.get("content-type") || inferContentType(url),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function loadDependency(url: URL): Promise<{ body: Buffer; meta: CachedDependencyMeta }> {
  const cached = await readCachedDependency(url).catch(() => null);
  if (cached) return cached;

  const fetched = await fetchWithRedirects(url);
  const meta: CachedDependencyMeta = {
    sourceUrl: url.href,
    finalUrl: fetched.finalUrl.href,
    contentType: fetched.contentType,
    fetchedAt: new Date().toISOString(),
    bytes: fetched.body.length,
  };
  const paths = cachePathsFor(url);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(paths.bodyPath, fetched.body),
    fs.writeFile(paths.metaPath, JSON.stringify(meta, null, 2) + "\n"),
  ]);
  return { body: fetched.body, meta };
}

export async function cacheConsoleDependency(url: URL): Promise<CachedDependencyMeta> {
  const { meta } = await loadDependency(url);
  return meta;
}

export async function cacheConsoleDependencyTree(
  url: URL,
  options: { depth?: number; seen?: Set<string> } = {}
): Promise<CachedDependencyMeta[]> {
  const depth = options.depth ?? 2;
  const seen = options.seen ?? new Set<string>();
  if (seen.has(url.href)) return [];
  seen.add(url.href);

  const { body, meta } = await loadDependency(url);
  const metas = [meta];
  if (depth <= 0 || !isTextDependency(meta.contentType, url)) return metas;

  const children = collectConsoleDependencyDecisions(body.toString("utf8"), meta.finalUrl)
    .filter((decision): decision is Extract<ConsoleDependencyDecision, { status: "cacheable" }> =>
      decision.status === "cacheable"
    );
  for (const child of children) {
    metas.push(...(await cacheConsoleDependencyTree(new URL(child.url), { depth: depth - 1, seen })));
  }
  return metas;
}

export async function serveConsoleDependency(req: Request, res: Response) {
  const url = normalizeConsoleDependencyUrl(String(req.query.url || ""));
  if (!url) return res.status(400).type("text/plain").send("Unsupported console dependency URL");

  try {
    const { body, meta } = await loadDependency(url);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-WTF-Console-Dependency", meta.sourceUrl);
    res.type(meta.contentType || inferContentType(url));
    if (isTextDependency(meta.contentType, url)) {
      return res.send(rewriteConsoleDependencyUrls(body.toString("utf8"), meta.finalUrl));
    }
    return res.send(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Console dependency failed";
    return res.status(502).type("text/plain").send(message);
  }
}

export async function serveEmulatorJsDependency(req: Request, res: Response) {
  const rel = String((req.params as Record<string, string | undefined>)[0] || "");
  const safeRel = rel
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  if (!safeRel) return res.status(404).type("text/plain").send("EmulatorJS asset not found");
  const url = normalizeConsoleDependencyUrl(safeRel, EMULATORJS_BASE_URL);
  if (!url) return res.status(400).type("text/plain").send("Unsupported EmulatorJS asset URL");

  try {
    const { body, meta } = await loadDependency(url);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-WTF-Console-Dependency", meta.sourceUrl);
    res.type(meta.contentType || inferContentType(url));
    if (isTextDependency(meta.contentType, url)) {
      return res.send(rewriteConsoleDependencyUrls(body.toString("utf8"), meta.finalUrl));
    }
    return res.send(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "EmulatorJS dependency failed";
    return res.status(502).type("text/plain").send(message);
  }
}
