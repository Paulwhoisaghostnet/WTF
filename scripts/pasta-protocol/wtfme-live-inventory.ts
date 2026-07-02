#!/usr/bin/env tsx

import process from "node:process";

const DEFAULT_BASE_URL = "https://wtfos.app";

const cookieJar = new Map<string, string>();
const suppliedCookie = String(process.env.PASTA_WTFME_LIVE_COOKIE || "").trim();
const username = String(process.env.PASTA_WTFME_LIVE_USERNAME || "").trim();
const password = String(process.env.PASTA_WTFME_LIVE_PASSWORD || "");
const expectedHost = String(process.env.PASTA_WTFME_LIVE_EXPECT_HOST || "").trim().toLowerCase();

type ReadinessStatus = "pass" | "blocked";

interface ReadinessCheck {
  name: string;
  status: ReadinessStatus;
  detail: string;
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
    return { error: `expected JSON, got ${text.slice(0, 240)}` };
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
    return expectJson(await fetchWithCookies("/api/auth/user"), "cookie auth user check");
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
  return user;
}

function numericLimit(): number {
  const raw = Number(process.env.PASTA_WTFME_LIVE_INVENTORY_LIMIT || 50);
  if (!Number.isFinite(raw)) return 50;
  return Math.max(1, Math.min(250, Math.floor(raw)));
}

function hostCandidates(): string[] {
  return String(process.env.PASTA_WTFME_LIVE_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function pageSlugs(site: any): string[] {
  return Array.isArray(site?.pages)
    ? site.pages.map((page: any) => String(page.slug || "")).filter(Boolean).sort()
    : [];
}

function summarizeSite(site: any) {
  if (!site || typeof site !== "object") return null;
  return {
    id: Number.isFinite(Number(site.id)) ? Number(site.id) : null,
    host: String(site.host || "").trim() || null,
    label: String(site.label || "").trim() || null,
    status: String(site.status || "").trim() || null,
    activeDidSource: String(site.activeDidSource || "").trim() || null,
    pageCount: pageSlugs(site).length,
    pageSlugs: pageSlugs(site),
    versionCount: Array.isArray(site.versions) ? site.versions.length : 0,
  };
}

function summarizeEligibility(state: any) {
  const eligibility = state?.eligibility;
  if (!eligibility || typeof eligibility !== "object") return null;
  const reasons = Array.isArray(eligibility.reasons)
    ? eligibility.reasons.map((reason: any) => String(reason || "").trim()).filter(Boolean)
    : [];
  return {
    host: String(eligibility.host || "").trim() || null,
    label: String(eligibility.label || "").trim() || null,
    canClaim: Boolean(eligibility.canClaim),
    hasWallet: Boolean(eligibility.hasWallet),
    hasOAuthSocial: Boolean(eligibility.hasOAuthSocial),
    hasLinkedBluesky: Boolean(eligibility.hasLinkedBluesky),
    hasActiveWtfDid: Boolean(eligibility.hasActiveWtfDid),
    canIssueWtfDid: Boolean(eligibility.canIssueWtfDid),
    didTargetSource: String(eligibility.didTarget?.source || "").trim() || null,
    reasons,
  };
}

function summarizePinRegistry(state: any) {
  const home = state?.pinRegistry?.home;
  const binding = state?.pinRegistry?.binding;
  return {
    home:
      home && typeof home === "object"
        ? {
            host: String(home.host || "").trim() || null,
            status: String(home.status || "").trim() || null,
            ready: Boolean(home.ready),
            repoDid: String(home.repoDid || "").trim() || null,
            repoHandle: String(home.repoHandle || "").trim() || null,
            pdsUrl: String(home.pdsUrl || "").trim() || null,
            hasRepo: Boolean(home.hasRepo),
            siteStatus: String(home.siteStatus || "").trim() || null,
            wellKnownUrl: String(home.wellKnownUrl || "").trim() || null,
          }
        : null,
    binding:
      binding && typeof binding === "object"
        ? {
            host: String(binding.host || "").trim() || null,
            status: String(binding.status || "").trim() || null,
            repoDid: String(binding.repoDid || "").trim() || null,
            publicDiscoveryEnabled: Boolean(binding.publicDiscoveryEnabled),
            manifestUri: String(binding.manifestUri || "").trim() || null,
            wellKnownUrl: String(binding.wellKnownUrl || "").trim() || null,
          }
        : null,
  };
}

function userRoles(user: any): string[] {
  const roles = Array.isArray(user?.roles) ? user.roles : user?.role ? [user.role] : [];
  return roles.map((role: any) => String(role || "").trim()).filter(Boolean);
}

function userHasPermission(user: any, permission: string): boolean {
  const effective = user?.effectivePermissions;
  if (effective && typeof effective === "object" && !Array.isArray(effective)) {
    return Boolean(effective[permission]);
  }
  const permissions = user?.permissions;
  if (Array.isArray(permissions)) return permissions.includes(permission);
  if (permissions && typeof permissions === "object") return Boolean(permissions[permission]);
  return false;
}

function check(name: string, passed: boolean, passDetail: string, blockedDetail: string): ReadinessCheck {
  return {
    name,
    status: passed ? "pass" : "blocked",
    detail: passed ? passDetail : blockedDetail,
  };
}

function summarizeReadiness(user: any, state: any) {
  const mySite = summarizeSite(state.site);
  const eligibility = summarizeEligibility(state);
  const pinRegistry = summarizePinRegistry(state);
  const candidateHost = mySite?.host || eligibility?.host || null;
  const hostMatchesExpected = !expectedHost || candidateHost === expectedHost;
  const claimedOrClaimable = Boolean(mySite?.host || eligibility?.canClaim);
  const hasDidTarget = Boolean(eligibility?.didTargetSource || mySite?.activeDidSource);
  const canUsePinning = userHasPermission(user, "use_wtfos_pinning");
  const sitePublished = mySite?.status === "published";
  const pinHomeReady = Boolean(pinRegistry?.home?.ready && pinRegistry.home.repoDid);
  const publicPinDiscoveryReady = Boolean(
    pinRegistry?.binding?.publicDiscoveryEnabled &&
      pinRegistry.binding.repoDid &&
      pinRegistry.binding.manifestUri &&
      pinRegistry.binding.wellKnownUrl
  );

  const pagePublishChecks: ReadinessCheck[] = [
    check(
      "claimed or claimable WTF.ME host",
      claimedOrClaimable,
      mySite?.host ? `claimed ${mySite.host}` : `can claim ${eligibility?.host}`,
      eligibility?.reasons?.length
        ? eligibility.reasons.join("; ")
        : "no claimed site and authenticated account is not claimable"
    ),
    check(
      "expected host pin",
      hostMatchesExpected,
      expectedHost ? `matches ${expectedHost}` : "no expected host pin supplied for this read-only inventory",
      `candidate host ${candidateHost || "none"} does not match PASTA_WTFME_LIVE_EXPECT_HOST=${expectedHost}`
    ),
    check(
      "linked Tezos wallet",
      Boolean(eligibility?.hasWallet),
      "wallet link present",
      "link a Tezos wallet before Pasta page/pin publication"
    ),
    check(
      "OAuth/social identity",
      Boolean(eligibility?.hasOAuthSocial),
      "OAuth/social identity present",
      "link at least one OAuth social account before claiming a WTF.ME host"
    ),
    check(
      "DID publish target",
      hasDidTarget,
      `DID target source ${eligibility?.didTargetSource || mySite?.activeDidSource}`,
      "activate a WTF DID/repo or linked Bluesky DID before publishing hosted pages"
    ),
  ];

  const pinRecoveryChecks: ReadinessCheck[] = [
    ...pagePublishChecks,
    check(
      "WTF Pin Collector permission",
      canUsePinning,
      "use_wtfos_pinning permission present",
      "grant or buy WTF Pin Collector before publishing Pasta pin recovery"
    ),
    check(
      "published WTF.ME site",
      sitePublished,
      `site status ${mySite?.status}`,
      `publish the WTF.ME site first; current status is ${mySite?.status || "none"}`
    ),
    check(
      "active PDS/repo pin home",
      pinHomeReady,
      `pin home ${pinRegistry?.home?.status} for ${pinRegistry?.home?.repoDid}`,
      "set up an active wtfos.me PDS/repo before publishing Pasta pin recovery"
    ),
  ];

  return {
    candidateHost,
    expectedHost: expectedHost || null,
    pagePublishReady: pagePublishChecks.every((item) => item.status === "pass"),
    pinRecoveryPublishReady: pinRecoveryChecks.every((item) => item.status === "pass"),
    publicPinDiscoveryReady,
    pagePublishChecks,
    pinRecoveryChecks,
    currentPublicDiscovery: pinRegistry?.binding ?? null,
    note:
      "This inventory is read-only. Existing-content safety, object-storage reachability, request-token handling, and public post-publish verification are enforced by pasta:wtfme:live-publish.",
  };
}

async function getSiteState(): Promise<any> {
  return expectJson(await fetchWithCookies("/api/wtf-sites/my"), "WTF.ME site state");
}

async function getAdminSites(): Promise<{ access: boolean; status: number; sites: any[]; error?: string }> {
  const response = await fetchWithCookies(`/api/admin/wtf-sites?limit=${numericLimit()}`);
  const body = await readJson(response);
  if (response.status === 401 || response.status === 403) {
    return {
      access: false,
      status: response.status,
      sites: [],
      error: typeof body?.error === "string" ? body.error : `HTTP ${response.status}`,
    };
  }
  if (!response.ok) {
    return {
      access: false,
      status: response.status,
      sites: [],
      error: typeof body?.error === "string" ? body.error : JSON.stringify(body).slice(0, 240),
    };
  }
  return {
    access: true,
    status: response.status,
    sites: Array.isArray(body) ? body : [],
  };
}

async function probeTlsAsk(host: string) {
  const url = new URL("/internal/tls/allow", baseUrl());
  url.searchParams.set("domain", host);
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-wtfme-live-inventory" },
    redirect: "manual",
  });
  const body = await readJson(response);
  return {
    host,
    status: response.status,
    allowed: response.ok && body?.ok === true,
    reason: String(body?.reason || body?.error || "").trim() || null,
  };
}

function sanitizedUser(user: any) {
  return {
    id: Number.isFinite(Number(user?.id)) ? Number(user.id) : null,
    username: String(user?.username || username || "").trim() || null,
    role: String(user?.role || "").trim() || null,
    roles: userRoles(user),
    permissions: {
      use_wtfos_pinning: userHasPermission(user, "use_wtfos_pinning"),
      trusted_market_creator: userHasPermission(user, "trusted_market_creator"),
    },
  };
}

async function main(): Promise<void> {
  const user = await login();
  const state = await getSiteState();
  const admin = await getAdminSites();
  const hosts = new Set<string>(hostCandidates());
  const mySite = summarizeSite(state.site);
  if (mySite?.host) hosts.add(mySite.host);
  for (const site of admin.sites) {
    const summary = summarizeSite(site);
    if (summary?.host) hosts.add(summary.host);
  }

  const tls = [];
  for (const host of [...hosts].sort()) {
    tls.push(await probeTlsAsk(host));
  }

  const readiness = summarizeReadiness(user, state);

  console.log(JSON.stringify({
    ok: true,
    baseUrl: baseUrl().origin,
    user: sanitizedUser(user),
    mySite,
    eligibility: summarizeEligibility(state),
    pinRegistry: summarizePinRegistry(state),
    readiness,
    adminSites: {
      access: admin.access,
      status: admin.status,
      error: admin.error ?? null,
      count: admin.sites.length,
      sites: admin.sites.map(summarizeSite).filter(Boolean),
    },
    tlsAsk: tls,
    nextRequiredHost: mySite?.host || summarizeEligibility(state)?.host || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[pasta-wtfme-inventory] ${error.stack || error.message}`);
  process.exit(1);
});
