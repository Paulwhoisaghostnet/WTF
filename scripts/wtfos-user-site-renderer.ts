import http, { type IncomingMessage, type ServerResponse } from "node:http";

const SITE_INDEX_COLLECTION = "app.wtfos.identity.siteIndex";
const SITE_SNAPSHOT_COLLECTION = "app.wtfos.identity.siteSnapshot";
const NETWORK_DOMAIN = (process.env.WTFOS_ATPROTO_NETWORK_DOMAIN || "wtfos.me").toLowerCase();
const INDEX_PDS_URL = (
  process.env.WTFOS_USER_SITE_INDEX_PDS_URL ||
  process.env.WTFOS_USER_SITE_RENDERER_PDS_URL ||
  process.env.WTFOS_PDS_PUBLIC_URL ||
  "https://pds.wtfos.me"
).replace(/\/$/, "");
const SNAPSHOT_PDS_URL = (
  process.env.WTFOS_USER_SITE_SNAPSHOT_PDS_URL ||
  process.env.WTFOS_PDS_USERS_PUBLIC_URL ||
  "https://users.wtfos.me"
).replace(/\/$/, "");
const INDEX_REPO_DID = (
  process.env.WTFOS_USER_SITE_INDEX_REPO_DID ||
  process.env.WTFOS_PRIMARY_ATPROTO_DID ||
  process.env.WTFOS_PRIMARY_DID ||
  ""
).trim();
const PORT = Number(process.env.WTFOS_USER_SITE_RENDERER_PORT || process.env.PORT || 3009);
const CACHE_TTL_MS = Number(process.env.WTFOS_USER_SITE_RENDERER_CACHE_TTL_MS || 30_000);

type SiteIndex = {
  host: string;
  repoDid: string;
  snapshotCollection: string;
  snapshotRkey: string;
  versionDigest: string;
};

type SiteSnapshot = {
  host: string;
  versionDigest: string;
  payload?: {
    pages?: Array<{ slug: string; title: string; html: string }>;
    truncated?: boolean;
  };
};

const cache = new Map<string, { expiresAt: number; snapshot: SiteSnapshot; index: SiteIndex }>();

function hostFromRequest(req: IncomingMessage): string {
  return String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function classifyHost(host: string): { ok: true; host: string; label: string } | { ok: false } {
  const suffix = `.${NETWORK_DOMAIN}`;
  if (!host.endsWith(suffix)) return { ok: false };
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes(".") || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
    return { ok: false };
  }
  return { ok: true, host, label };
}

function pageSlug(pathname: string): string | null {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  if (!clean) return "home";
  if (clean.includes("/")) return null;
  const slug = clean
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

function normalizeRkey(rkey: string): string {
  const cleaned = rkey.replace(/[^a-zA-Z0-9.-]/g, "").slice(0, 512);
  return cleaned.length > 0 ? cleaned : "self";
}

function blockedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/xrpc/") ||
    pathname === "/sw.js"
  );
}

function htmlShell(input: { title: string; html: string; digest: string }): string {
  const body = String(input.html || "");
  if (/^\s*<!doctype\s+html/i.test(body) || /^\s*<html[\s>]/i.test(body)) return body;
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

async function getRecord<T>(input: { service: string; repo: string; collection: string; rkey: string }): Promise<T | null> {
  const url = new URL("/xrpc/com.atproto.repo.getRecord", input.service);
  url.searchParams.set("repo", input.repo);
  url.searchParams.set("collection", input.collection);
  url.searchParams.set("rkey", input.rkey);
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`PDS getRecord failed ${response.status}`);
  const data = (await response.json()) as { value?: T };
  return data.value ?? null;
}

async function loadSite(host: string, label: string) {
  const cached = cache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (!INDEX_REPO_DID) throw new Error("WTFOS_USER_SITE_INDEX_REPO_DID is not configured");

  const index = await getRecord<SiteIndex>({
    service: INDEX_PDS_URL,
    repo: INDEX_REPO_DID,
    collection: SITE_INDEX_COLLECTION,
    rkey: normalizeRkey(label),
  });
  if (!index || index.host !== host || index.snapshotCollection !== SITE_SNAPSHOT_COLLECTION) {
    return null;
  }
  const snapshot = await getRecord<SiteSnapshot>({
    service: SNAPSHOT_PDS_URL,
    repo: index.repoDid,
    collection: index.snapshotCollection,
    rkey: index.snapshotRkey,
  });
  if (!snapshot || snapshot.host !== host || snapshot.versionDigest !== index.versionDigest) return null;
  const entry = { expiresAt: Date.now() + CACHE_TTL_MS, index, snapshot };
  cache.set(host, entry);
  return entry;
}

function setHeaders(res: ServerResponse) {
  res.setHeader("content-security-policy", [
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
    "connect-src 'self' https:",
    "worker-src 'none'",
    "child-src 'none'",
  ].join("; "));
  res.setHeader("cross-origin-resource-policy", "cross-origin");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-wtfos-surface", "pds-user-site");
}

function send(res: ServerResponse, status: number, body: string, type = "text/plain") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  setHeaders(res);
  const classified = classifyHost(hostFromRequest(req));
  if (!classified.ok) return send(res, 404, "Not found");
  const url = new URL(req.url || "/", `https://${classified.host}`);

  try {
    const site = await loadSite(classified.host, classified.label);
    if (!site) return send(res, 404, "Site not found");

    if (url.pathname === "/.well-known/atproto-did") {
      return send(res, 200, `${site.index.repoDid}\n`);
    }
    if (blockedPath(url.pathname)) return send(res, 404, "Not found");
    if (site.snapshot.payload?.truncated) return send(res, 503, "Site snapshot is too large to render");

    const slug = pageSlug(url.pathname);
    if (!slug) return send(res, 404, "Not found");
    const page = site.snapshot.payload?.pages?.find((item) => item.slug === slug);
    if (!page) return send(res, 404, "Not found");

    res.setHeader("cache-control", "public, max-age=30, must-revalidate");
    return send(
      res,
      200,
      htmlShell({ title: page.title, html: page.html, digest: site.snapshot.versionDigest }),
      "text/html; charset=utf-8"
    );
  } catch (err) {
    console.error("[wtfos-user-site-renderer] request failed", err);
    return send(res, 502, "User-site renderer unavailable");
  }
}

http.createServer((req, res) => {
  void handle(req, res);
}).listen(PORT, () => {
  console.log(`[wtfos-user-site-renderer] listening on :${PORT}, indexPds=${INDEX_PDS_URL}, snapshotPds=${SNAPSHOT_PDS_URL}`);
});
