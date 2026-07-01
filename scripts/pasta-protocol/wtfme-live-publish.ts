#!/usr/bin/env tsx

import assert from "node:assert/strict";
import process from "node:process";

import { WTF_USER_SITE_HOME_SLUG } from "../../shared/wtf-user-sites";
import { buildPastaHostedPageSnapshots } from "../../server/features/wtf-sites/pasta-hosting";

const DEFAULT_BASE_URL = "https://wtfos.app";

const cookieJar = new Map<string, string>();
const suppliedCookie = String(process.env.PASTA_WTFME_LIVE_COOKIE || "").trim();
const username = String(process.env.PASTA_WTFME_LIVE_USERNAME || "").trim();
const password = String(process.env.PASTA_WTFME_LIVE_PASSWORD || "");
const expectedHost = String(process.env.PASTA_WTFME_LIVE_EXPECT_HOST || "").trim().toLowerCase();

function flag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(value);
}

const execute = flag("PASTA_WTFME_LIVE_PUBLISH", false);
const publishPins = flag("PASTA_WTFME_LIVE_PUBLISH_PINS", true);
const overwriteExisting = flag("PASTA_WTFME_LIVE_OVERWRITE_EXISTING", false);
const DEFAULT_HOME_HTML = "<main><h1>wtfOS site</h1></main>";

function ok(message: string): void {
  console.log(`[pasta-wtfme-publish] ok: ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function baseUrl(): URL {
  const raw = String(process.env.PASTA_WTFME_LIVE_BASE_URL || process.env.WTFOS_BASE_URL || DEFAULT_BASE_URL).trim();
  const url = new URL(raw);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function setCookiesFrom(response: Response): void {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie") as string]
        : [];
  for (const value of setCookies) {
    const pair = String(value || "").split(";")[0];
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader(): string {
  if (suppliedCookie) return suppliedCookie;
  return [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function fetchWithCookies(pathname: string, options: RequestInit = {}): Promise<Response> {
  const url = new URL(pathname, baseUrl());
  const headers = new Headers(options.headers);
  const cookie = cookieHeader();
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(url, { ...options, headers });
  setCookiesFrom(response);
  return response;
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`expected JSON response from ${response.url}, got HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
}

async function expectJson(response: Response, label: string): Promise<any> {
  const body = await readJson(response);
  if (!response.ok) {
    const detail = typeof body?.error === "string" ? body.error : JSON.stringify(body).slice(0, 240);
    fail(`${label} returned HTTP ${response.status}: ${detail}`);
  }
  return body;
}

async function login(): Promise<any> {
  if (suppliedCookie) {
    const user = await expectJson(await fetchWithCookies("/api/auth/user"), "cookie auth user check");
    ok(`authenticated with supplied cookie as ${user.username || `user ${user.id}`}`);
    return user;
  }
  if (!username || !password) {
    fail("Set PASTA_WTFME_LIVE_COOKIE or both PASTA_WTFME_LIVE_USERNAME and PASTA_WTFME_LIVE_PASSWORD");
  }
  const user = await expectJson(
    await fetchWithCookies("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
    "password login"
  );
  if (!cookieHeader()) fail("password login succeeded but no session cookie was captured");
  ok(`authenticated as ${user.username || username}`);
  return user;
}

async function csrfHeaders(): Promise<Record<string, string>> {
  const payload = await expectJson(await fetchWithCookies("/api/auth/csrf-token"), "CSRF token");
  if (!payload.csrfToken) fail("CSRF token response was empty");
  return {
    "content-type": "application/json",
    "x-csrf-token": String(payload.csrfToken),
  };
}

function pageSlugs(state: any): string[] {
  return Array.isArray(state?.site?.pages)
    ? state.site.pages.map((page: any) => String(page.slug || "")).filter(Boolean).sort()
    : [];
}

function existingPageHtml(page: any): string {
  return String(page?.draftHtml ?? page?.html ?? "").trim();
}

function pastaPageMarkers(): Map<string, string> {
  const markers = new Map<string, string>();
  for (const page of buildPastaHostedPageSnapshots()) {
    const marker = page.html.match(/data-pasta-hosted-page="([^"]+)"/)?.[1];
    markers.set(page.slug, marker ? `data-pasta-hosted-page="${marker}"` : "data-pasta-hosted-page=");
  }
  return markers;
}

function assertSafeExistingContent(state: any): void {
  const site = state?.site;
  const pages = Array.isArray(site?.pages) ? site.pages : [];
  if (!site || pages.length === 0) return;

  const targetMarkers = pastaPageMarkers();
  const extraSlugs: string[] = [];
  const overwriteSlugs: string[] = [];
  const siteIsPublished = site.status === "published" || Boolean(site.publishedAt);

  for (const page of pages) {
    const slug = String(page?.slug || "").trim();
    if (!slug) continue;
    const html = existingPageHtml(page);
    if (!targetMarkers.has(slug)) {
      extraSlugs.push(slug);
      continue;
    }
    const marker = targetMarkers.get(slug) as string;
    if (html.includes(marker)) continue;

    const replaceableDefaultDraft = slug === WTF_USER_SITE_HOME_SLUG && html === DEFAULT_HOME_HTML && !siteIsPublished;
    if (html && !replaceableDefaultDraft) overwriteSlugs.push(slug);
  }

  if (extraSlugs.length) {
    fail(
      `Refusing to publish Pasta pages over ${site.host}: existing non-target WTF.ME page(s) ` +
        `${extraSlugs.join(", ")} would remain published; use a dedicated proof host or remove them first`
    );
  }
  if (overwriteSlugs.length && !overwriteExisting) {
    fail(
      `Refusing to overwrite existing non-Pasta WTF.ME page(s) ${overwriteSlugs.join(", ")} on ${site.host}; ` +
        "set PASTA_WTFME_LIVE_OVERWRITE_EXISTING=1 only for a dedicated Pasta proof host"
    );
  }
  if (overwriteSlugs.length) {
    ok(`explicit overwrite enabled for existing WTF.ME page(s): ${overwriteSlugs.join(", ")}`);
  }
}

function eligibilitySummary(state: any): string {
  const siteHost = String(state?.site?.host || "").trim();
  const siteStatus = String(state?.site?.status || "").trim();
  const eligibility = state?.eligibility;
  if (!eligibility || typeof eligibility !== "object") {
    return `${siteHost ? `site=${siteHost}` : "site=none"}; eligibility=missing`;
  }

  const reasons = Array.isArray(eligibility.reasons)
    ? eligibility.reasons.map((reason: any) => String(reason || "").trim()).filter(Boolean)
    : [];
  const host = String(eligibility.host || "").trim();
  const flags = [
    `site=${siteHost || "none"}`,
    `siteStatus=${siteStatus || "none"}`,
    `claimableHost=${host || "none"}`,
    `canClaim=${Boolean(eligibility.canClaim)}`,
    `hasWallet=${Boolean(eligibility.hasWallet)}`,
    `hasOAuthSocial=${Boolean(eligibility.hasOAuthSocial)}`,
    `hasLinkedBluesky=${Boolean(eligibility.hasLinkedBluesky)}`,
    `hasActiveWtfDid=${Boolean(eligibility.hasActiveWtfDid)}`,
    `canIssueWtfDid=${Boolean(eligibility.canIssueWtfDid)}`,
  ];
  if (reasons.length) flags.push(`reasons=${reasons.join("; ")}`);
  return flags.join("; ");
}

function assertExpectedHost(host: string): void {
  if (expectedHost && host !== expectedHost) {
    fail(`authenticated user resolves to ${host}, expected PASTA_WTFME_LIVE_EXPECT_HOST=${expectedHost}`);
  }
}

function assertProductionHostPinned(): void {
  if (execute && !expectedHost) {
    fail("Set PASTA_WTFME_LIVE_EXPECT_HOST=<dedicated-host.wtfos.me> before enabling PASTA_WTFME_LIVE_PUBLISH=1");
  }
}

async function getSiteState(): Promise<any> {
  return expectJson(await fetchWithCookies("/api/wtf-sites/my"), "WTF.ME site state");
}

async function claimIfNeeded(state: any, headers: Record<string, string>): Promise<any> {
  if (state.site?.host) {
    ok(`site already claimed as ${state.site.host} with status ${state.site.status}`);
    return state;
  }
  if (!state.eligibility?.canClaim) {
    fail(`authenticated user is not eligible to claim a WTF.ME host: ${eligibilitySummary(state)}`);
  }
  if (!execute) {
    ok(`dry-run: authenticated user can claim ${state.eligibility.host}`);
    return state;
  }
  const claimed = await expectJson(
    await fetchWithCookies("/api/wtf-sites/claim", {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    }),
    "claim WTF.ME site"
  );
  ok(`claimed ${claimed.site?.host}`);
  return claimed;
}

async function savePastaPages(headers: Record<string, string>): Promise<any> {
  let latest: any = null;
  for (const page of buildPastaHostedPageSnapshots()) {
    const response = await fetchWithCookies(`/api/wtf-sites/pages/${encodeURIComponent(page.slug)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: page.title, html: page.html }),
    });
    latest = await expectJson(response, `save ${page.slug} page`);
    ok(`saved ${page.slug === WTF_USER_SITE_HOME_SLUG ? "home" : page.slug} page`);
  }
  return latest;
}

async function publish(headers: Record<string, string>): Promise<any> {
  const state = await expectJson(
    await fetchWithCookies("/api/wtf-sites/publish", {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    }),
    "publish WTF.ME site"
  );
  assert.equal(state.site?.status, "published", "published site must return status=published");
  const slugs = pageSlugs(state);
  assert.deepEqual(slugs, ["collection", "home", "mint"], "published Pasta site should contain home, mint, and collection pages");
  ok(`published ${state.site.host} version ${state.site.versions?.[0]?.versionNumber ?? "unknown"}`);
  return state;
}

async function publishPastaPins(headers: Record<string, string>): Promise<any> {
  const state = await expectJson(
    await fetchWithCookies("/api/ipfs-pinning/pasta-protocol/publish", {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    }),
    "publish Pasta pin recovery"
  );
  if (!state.manifestUri || !state.wellKnownUrl) {
    fail("Pasta pin recovery publish did not return a manifestUri and wellKnownUrl");
  }
  ok(`published Pasta pin recovery manifest ${state.manifestUri}`);
  return state;
}

async function probeTlsAsk(host: string): Promise<void> {
  const url = new URL("/internal/tls/allow", baseUrl());
  url.searchParams.set("domain", host);
  const response = await fetch(url, { headers: { "user-agent": "wtfos-pasta-wtfme-live-publish" } });
  const body = await readJson(response).catch(() => ({}));
  if (!response.ok || body.ok !== true) {
    const reason = String(body.reason || body.error || `HTTP ${response.status}`);
    fail(`published host ${host} is still denied by the production TLS gate: ${reason}`);
  }
  ok(`production TLS gate allows ${host}`);
}

async function main(): Promise<void> {
  console.log(`[pasta-wtfme-publish] target ${baseUrl().origin}`);
  if (!execute) {
    console.log("[pasta-wtfme-publish] dry-run mode; set PASTA_WTFME_LIVE_PUBLISH=1 to claim/save/publish pages");
  }
  assertProductionHostPinned();
  await login();
  let state = await getSiteState();
  const plannedHost = state.site?.host || state.eligibility?.host;
  if (!plannedHost) {
    fail(`authenticated user did not expose a WTF.ME host or claimable host: ${eligibilitySummary(state)}`);
  }
  assertExpectedHost(String(plannedHost).toLowerCase());
  state = await claimIfNeeded(state, execute ? await csrfHeaders() : {});

  const host = String(state.site?.host || state.eligibility?.host || plannedHost).toLowerCase();
  assertExpectedHost(host);
  assertSafeExistingContent(state);
  if (!execute) {
    ok(`dry-run: would publish Pasta landing/mint/collection pages to ${host}`);
    if (publishPins) ok(`dry-run: would publish Pasta pin recovery manifest for ${host}`);
    console.log(`[pasta-wtfme-publish] after publishing, verify with: PASTA_WTFME_LIVE_HOST=${host} npm run pasta:wtfme:live-check`);
    return;
  }

  const headers = await csrfHeaders();
  await savePastaPages(headers);
  const published = await publish(headers);
  await probeTlsAsk(host);
  const pinning = publishPins ? await publishPastaPins(headers) : null;
  if (pinning?.wellKnownUrl) {
    console.log(`[pasta-wtfme-publish] pin discovery URL: ${pinning.wellKnownUrl}`);
  }
  console.log(`[pasta-wtfme-publish] verify with: PASTA_WTFME_LIVE_HOST=${published.site.host} npm run pasta:wtfme:live-check`);
}

main().catch((error) => {
  console.error(`[pasta-wtfme-publish] ${error.stack || error.message}`);
  process.exit(1);
});
