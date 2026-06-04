import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import {
  atprotoAccounts,
  atprotoHandleClaims,
  wtfSubdomainGrants,
} from "@shared/schema";
import {
  atprotoClientIdUrl,
  atprotoRedirectUri,
  atprotoAccountCapabilities,
  atprotoAccountSessionSummary,
  getAtprotoOAuthClient,
  isAtprotoEnabled,
  persistCredentialSessionForDid,
  persistOAuthSessionForDid,
  resolveAtprotoOAuthGrantState,
  takePendingOAuthSessionForDid,
  ATPROTO_SCOPE,
  ATPROTO_MAX_SCOPE,
} from "../features/atproto/oauth";
import {
  SKYWIRE_CHAT_PERMISSION_DESCRIPTION,
  SKYWIRE_CHAT_PERMISSION_WARNING,
  SKYWIRE_DEFAULT_PERMISSION_TIER,
  SKYWIRE_PERMISSION_TIER_OPTIONS,
  buildTz2atAtprotoScope,
  buildSkywireAtprotoScope,
  normalizeTz2atPermissionStep,
  normalizeSkywirePermissionTier,
  type SkywirePermissionTier,
} from "@shared/atproto-permissions";
import {
  isTezosAlias,
  isValidAtHandle,
  normalizeAtHandle,
  normalizeRegistrationHandle,
  randomProofToken,
  resolveDidViaDnsTxt,
  resolveDidViaHttpsWellKnown,
} from "../features/atproto/identity";
import { emitAtprotoSystemEvent } from "../features/atproto/events";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";
import { resolveUserTezosIdentity } from "../lib/user-tezos-identity";
import { skywireRolloutStatusForRole } from "../lib/skywire-access";
import { userEligibleForSkywireRollout } from "@shared/skywire-rollout";

const router = Router();

const handleClaimSchema = z.object({
  desiredHandle: z.string().trim().min(3).max(253),
  tezosAlias: z.string().trim().max(255).optional().nullable(),
  wtfSubdomainGrantId: z.coerce.number().int().positive().optional().nullable(),
});

const verifySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  desiredHandle: z.string().trim().min(3).max(253).optional(),
});

const registerSchema = z.object({
  pdsUrl: z.string().url().optional(),
  handle: z.string().trim().min(3).max(253),
  email: z.string().email().max(320),
  password: z.string().min(8).max(256),
  inviteCode: z.string().trim().max(255).optional().nullable(),
  verificationPhone: z.string().trim().min(7).max(32).optional().nullable(),
  verificationCode: z.string().trim().min(2).max(64).optional().nullable(),
});

const phoneVerificationSchema = z.object({
  pdsUrl: z.string().url().optional(),
  phoneNumber: z.string().trim().min(7).max(32),
});

const oauthStartSchema = z.object({
  handle: z.string().trim().min(1),
  returnTo: z.string().optional(),
  popup: z.string().optional(),
  app: z.enum(["skywire", "tz2at"]).optional(),
  step: z.string().optional(),
  tier: z.string().optional(),
  chat: z.string().optional(),
});

const mutationLimiter = createInMemoryRateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => `user:${(req.user as any)?.id ?? req.ip}`,
  message: { error: "Too many Skywire identity requests, please try again later" },
});

type AtprotoOAuthAppName = "skywire" | "tz2at";

type AtprotoOAuthPendingState = {
  state: string;
  returnTo: string;
  popup: boolean;
  userId: number;
  appName: AtprotoOAuthAppName;
  tz2atStep: string;
  permissionTier: SkywirePermissionTier;
  chatEnabled: boolean;
  requestedScope: string;
  requestedHandle: string;
  origin?: string;
  startedAt: number;
};

const ATPROTO_OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const pendingAtprotoOAuthStates = new Map<string, AtprotoOAuthPendingState>();

function prunePendingAtprotoOAuthStates(now = Date.now()): void {
  for (const [state, value] of pendingAtprotoOAuthStates.entries()) {
    if (now - Number(value.startedAt || 0) > ATPROTO_OAUTH_STATE_TTL_MS) {
      pendingAtprotoOAuthStates.delete(state);
    }
  }
}

function rememberAtprotoOAuthState(value: AtprotoOAuthPendingState): void {
  prunePendingAtprotoOAuthStates(value.startedAt);
  pendingAtprotoOAuthStates.set(value.state, value);
}

function requestAtprotoOAuthState(req: any): AtprotoOAuthPendingState | null {
  const value = req.session?.atprotoOAuth;
  if (!value || typeof value !== "object" || typeof value.state !== "string") return null;
  return value as AtprotoOAuthPendingState;
}

function atprotoOAuthStateForCallback(req: any, callbackState: string | null): AtprotoOAuthPendingState | null {
  prunePendingAtprotoOAuthStates();
  const sessionState = requestAtprotoOAuthState(req);
  if (sessionState?.state === callbackState) return sessionState;
  if (callbackState) {
    const pending = pendingAtprotoOAuthStates.get(callbackState);
    if (pending) return pending;
  }
  return sessionState;
}

function clearAtprotoOAuthState(req: any, state: string): void {
  pendingAtprotoOAuthStates.delete(state);
  if (req.session?.atprotoOAuth?.state === state) {
    delete req.session.atprotoOAuth;
  }
}

function safeReturnPath(value: unknown): string {
  const requested = typeof value === "string" ? value : "/skywire";
  const allowed = (process.env.ATPROTO_ALLOWED_RETURN_PATHS || "/profile,/skywire,/tz2at,/challenges,/side-quests")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  try {
    const parsed = new URL(requested, "http://wtf.local");
    if (parsed.origin !== "http://wtf.local" || !parsed.pathname.startsWith("/")) return "/skywire";
    if (!allowed.includes(parsed.pathname)) return "/skywire";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/skywire";
  }
}

function returnPathWithQuery(returnTo: string, query: URLSearchParams): string {
  const parsed = new URL(returnTo, "http://wtf.local");
  for (const [key, value] of query.entries()) {
    parsed.searchParams.set(key, value);
  }
  return `${parsed.pathname}${parsed.search}`;
}

function normalizedOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function allowedOAuthReturnOrigins(): Set<string> {
  return new Set(
    [
      publicBaseUrl(),
      process.env.ATPROTO_PUBLIC_BASE_URL,
      process.env.PUBLIC_SITE_URL,
      ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
      "https://wtfos.app",
      "https://www.wtfos.app",
      "https://wtfgameshow.app",
      "https://www.wtfgameshow.app",
      "http://127.0.0.1:3000",
      "http://localhost:3000",
    ]
      .map((origin) => normalizedOrigin(String(origin || "").trim()))
      .filter((origin): origin is string => Boolean(origin))
  );
}

function requestOrigin(req: any): string {
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "").split(",")[0]?.trim();
  const host = forwardedHost || String(req.headers?.host || "").trim();
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0]?.trim();
  const localHost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = forwardedProto || (localHost ? req.protocol || "http" : "https");
  const origin = normalizedOrigin(host ? `${proto}://${host}` : "");
  if (origin && allowedOAuthReturnOrigins().has(origin)) return origin;
  return normalizedOrigin(publicBaseUrl()) || "http://127.0.0.1:3000";
}

function safeOAuthReturnOrigin(value: string | null | undefined, req: any): string {
  const origin = normalizedOrigin(value || "");
  if (origin && allowedOAuthReturnOrigins().has(origin)) return origin;
  return requestOrigin(req);
}

function originUrl(origin: string, path: string): string {
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function reservedSkywirePlatformHandles(): Set<string> {
  return new Set(
    [
      process.env.SKYWIRE_WTF_ATPROTO_ACTOR,
      process.env.ATPROTO_WTF_ACTOR,
      "wtfgameshow.bsky.social",
    ]
      .map((handle) => normalizeAtHandle(handle || ""))
      .filter(Boolean)
  );
}

function isReservedSkywirePlatformHandle(handle: string | null | undefined): boolean {
  if (process.env.SKYWIRE_ALLOW_PLATFORM_ACTOR_OAUTH === "true") return false;
  return reservedSkywirePlatformHandles().has(normalizeAtHandle(handle || ""));
}

function redirectAtprotoOAuthStartError(res: any, params: {
  popup: boolean;
  error: string;
  returnTo: string;
  appName: AtprotoOAuthAppName;
  origin: string;
}) {
  if (params.popup) {
    return res
      .type("html")
      .send(popupCompletionPage({ ok: false, error: params.error, returnTo: params.returnTo, app: params.appName, origin: params.origin }));
  }
  const query = new URLSearchParams({ error: params.error });
  return res.redirect(originUrl(params.origin, returnPathWithQuery(params.returnTo, query)));
}

function publicBaseUrl(): string {
  return (
    process.env.ATPROTO_PUBLIC_BASE_URL ||
    process.env.PUBLIC_SITE_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function popupCompletionPage(payload: {
  ok: boolean;
  handle?: string | null;
  error?: string | null;
  returnTo: string;
  app?: "skywire" | "tz2at";
  permissionTier?: string | null;
  chatEnabled?: boolean;
  requestedScope?: string | null;
  grantedScope?: string | null;
  accountId?: number | null;
  origin?: string | null;
}): string {
  const appName = payload.app === "tz2at" ? "tz2at" : "skywire";
  const label = appName === "tz2at" ? "AT Protocol identity" : "Bluesky";
  const title = payload.ok ? `${label} connected` : `${label} connection failed`;
  const message = payload.ok
    ? payload.handle
      ? `${label} connected: @${payload.handle}`
      : `${label} connected.`
    : `${label} connection did not complete. Try connecting again.`;
  const completionPayload = {
    type: "atproto_oauth_complete",
    app: appName,
    ok: payload.ok,
    handle: payload.handle ?? "",
    error: payload.error ?? "",
    permissionTier: payload.permissionTier ?? "",
    chatEnabled: Boolean(payload.chatEnabled),
    requestedScope: payload.requestedScope ?? "",
    grantedScope: payload.grantedScope ?? "",
    accountId: payload.accountId ?? null,
    at: Date.now(),
  };
  const storageKey = payload.ok ? `${appName}:atproto-linked` : `${appName}:atproto-error`;
  const channelName = `${appName}:atproto-oauth`;
  const targetOrigin = normalizedOrigin(payload.origin || "") || new URL(publicBaseUrl()).origin;
  const returnUrl = `${targetOrigin}${payload.returnTo}`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
      button, a { font: inherit; }
    </style>
  </head>
  <body>
    <p>${escapeHtml(message)}</p>
    <button type="button" onclick="window.close()">Close</button>
    <p><a href="${returnUrl}">Return to ${appName === "tz2at" ? "tz2at" : "Skywire"}</a></p>
    <script>
      (function () {
        var message = ${JSON.stringify(completionPayload)};
        var payload = JSON.stringify(message);
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(message, ${JSON.stringify(targetOrigin)});
          }
        } catch (err) {}
        try {
          var channel = new BroadcastChannel(${JSON.stringify(channelName)});
          channel.postMessage(message);
          setTimeout(function () { try { channel.close(); } catch (err) {} }, 1000);
        } catch (err) {}
        try { window.localStorage.setItem(${JSON.stringify(storageKey)}, payload); } catch (err) {}
        try { window.dispatchEvent(new StorageEvent("storage", { key: ${JSON.stringify(storageKey)}, newValue: payload })); } catch (err) {}
        ${payload.ok ? "setTimeout(function () { window.close(); }, 250);" : ""}
      })();
    </script>
  </body>
</html>`;
}

function allowedRegistrationPds(): string[] {
  const configured = (process.env.ATPROTO_REGISTRATION_ALLOWED_PDS || "https://bsky.social")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return Array.from(new Set(configured));
}

function registrationHandleSuffix(): string | null {
  const suffix = normalizeAtHandle(process.env.ATPROTO_REGISTRATION_HANDLE_SUFFIX || "bsky.social");
  return isValidAtHandle(`example.${suffix}`) ? suffix : null;
}

function normalizePdsUrl(value: string | null | undefined): string {
  const requested = String(value || process.env.ATPROTO_DEFAULT_PDS || allowedRegistrationPds()[0] || "https://bsky.social")
    .trim()
    .replace(/\/$/, "");
  const url = new URL(requested);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Unsupported PDS URL");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Production registration requires an HTTPS PDS");
  }
  const normalized = url.toString().replace(/\/$/, "");
  const allowed = allowedRegistrationPds();
  if (!allowed.includes(normalized)) {
    const err = new Error("That PDS is not enabled for Skywire registration");
    (err as any).status = 400;
    throw err;
  }
  return normalized;
}

function pdsHost(pdsUrl: string | null | undefined): string | null {
  try {
    return new URL(String(pdsUrl || "")).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function externalSignupUrlForPds(pdsUrl: string | null | undefined): string | null {
  const configured = process.env.ATPROTO_REGISTRATION_EXTERNAL_SIGNUP_URL?.trim();
  if (configured) return configured;
  const host = pdsHost(pdsUrl);
  if (host === "bsky.social" || host?.endsWith(".bsky.social")) {
    return "https://bsky.app";
  }
  return null;
}

function phoneVerificationModeForPds(pdsUrl: string | null | undefined): "skywire" | "external" {
  return externalSignupUrlForPds(pdsUrl) ? "external" : "skywire";
}

function pdsErrorDetails(err: unknown): {
  pdsStatus: number | null;
  pdsError: string | null;
  pdsMessage: string;
} {
  const anyErr = err as any;
  const pdsStatus =
    Number(anyErr?.status) ||
    Number(anyErr?.statusCode) ||
    Number(anyErr?.response?.status) ||
    Number(anyErr?.cause?.status) ||
    null;
  const pdsError =
    typeof anyErr?.error === "string"
      ? anyErr.error
      : typeof anyErr?.body?.error === "string"
        ? anyErr.body.error
        : typeof anyErr?.response?.body?.error === "string"
          ? anyErr.response.body.error
          : null;
  const pdsMessage =
    typeof anyErr?.body?.message === "string"
      ? anyErr.body.message
      : typeof anyErr?.response?.body?.message === "string"
        ? anyErr.response.body.message
        : typeof anyErr?.message === "string"
          ? anyErr.message
          : "The selected PDS rejected the request";
  return { pdsStatus, pdsError, pdsMessage };
}

function pdsRegistrationErrorResponse(err: unknown, pdsUrl?: string): {
  status: number;
  error: string;
  pdsStatus: number | null;
  pdsError: string | null;
  pdsMessage: string;
  action?: "external_signup_required";
  externalSignupUrl?: string | null;
} {
  const { pdsStatus, pdsError, pdsMessage } = pdsErrorDetails(err);
  const lower = `${pdsError || ""} ${pdsMessage}`.toLowerCase();
  const externalSignupUrl = externalSignupUrlForPds(pdsUrl);
  const requiresPhone = lower.includes("invalidphoneverification") || lower.includes("phone");
  const friendly = requiresPhone && externalSignupUrl
    ? "This PDS requires phone verification through its official signup flow. Open the official PDS signup, create the account there, then connect it to Skywire with AT Protocol OAuth."
    : requiresPhone
      ? "This PDS requires phone verification. Request a phone code in Skywire, then enter the same phone number and code before registering."
    : lower.includes("invite")
    ? "This PDS requires a valid invite code."
    : lower.includes("email")
      ? pdsMessage
      : lower.includes("handle") || lower.includes("taken")
        ? pdsMessage
        : lower.includes("verification") || lower.includes("captcha")
          ? "This PDS requires additional verification. Complete the verification step required by that PDS, then try registration again."
          : pdsMessage;
  return {
    status: pdsStatus && pdsStatus >= 400 && pdsStatus < 500 ? pdsStatus : 400,
    error: `PDS registration failed: ${friendly}`,
    pdsStatus,
    pdsError,
    pdsMessage,
    ...(requiresPhone && externalSignupUrl
      ? { action: "external_signup_required" as const, externalSignupUrl }
      : {}),
  };
}

function pdsPhoneVerificationErrorResponse(err: unknown, pdsUrl?: string): {
  status: number;
  error: string;
  pdsStatus: number | null;
  pdsError: string | null;
  pdsMessage: string;
  action?: "external_signup_required";
  externalSignupUrl?: string | null;
} {
  const details = pdsErrorDetails(err);
  const lower = `${details.pdsError || ""} ${details.pdsMessage}`.toLowerCase();
  const externalSignupUrl = externalSignupUrlForPds(pdsUrl);
  if (lower.includes("phone verification not enabled")) {
    return {
      ...details,
      status: 424,
      action: "external_signup_required",
      externalSignupUrl,
      error: externalSignupUrl
        ? "PDS phone verification failed: This PDS requires phone verification, but it does not expose phone-code requests to Skywire. Open the official PDS signup, create the account there, then connect it to Skywire with AT Protocol OAuth."
        : "PDS phone verification failed: This PDS requires phone verification, but it rejected Skywire's phone-code request. Create the account through that PDS's official signup flow, then connect it to Skywire with AT Protocol OAuth.",
    };
  }
  const response = pdsRegistrationErrorResponse(err, pdsUrl);
  return {
    ...response,
    error: response.error.replace(
      "PDS registration failed:",
      "PDS phone verification failed:"
    ),
  };
}

function maskedPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
}

async function linkedAccountForUser(userId: number) {
  const [account] = await db
    .select()
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
    .orderBy(desc(atprotoAccounts.updatedAt))
    .limit(1);
  return account ?? null;
}

async function linkedAccountForUserDid(userId: number, did: string) {
  const [account] = await db
    .select()
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.userId, userId), eq(atprotoAccounts.did, did), isNull(atprotoAccounts.disconnectedAt)))
    .orderBy(desc(atprotoAccounts.updatedAt))
    .limit(1);
  return account ?? null;
}

export function safeAtprotoAccount(account: typeof atprotoAccounts.$inferSelect | null) {
  if (!account) return null;
  const capabilities = atprotoAccountCapabilities(account);
  return {
    id: account.id,
    userId: account.userId,
    did: account.did,
    handle: account.handle,
    pdsUrl: account.pdsUrl,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    description: account.description,
    indexedAt: account.indexedAt,
    lastSyncedAt: account.lastSyncedAt,
    oauthIssuer: account.oauthIssuer,
    oauthScopes: account.oauthScopes,
    oauthRequestedScopes: account.oauthRequestedScopes,
    oauthPermissionTier: capabilities.tier,
    oauthChatEnabled: capabilities.chatEnabled,
    oauthCapabilities: capabilities.capabilities,
    oauthHasBroadScope: capabilities.hasBroadScope,
    tokenExpiresAt: account.tokenExpiresAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    disconnectedAt: account.disconnectedAt,
    hasEncryptedTokens: Boolean(account.encryptedAccessToken || account.encryptedRefreshToken),
    hasDpopKey: Boolean(account.encryptedDpopKey),
    session: atprotoAccountSessionSummary(account),
  };
}

async function listClaims(userId: number) {
  return db
    .select()
    .from(atprotoHandleClaims)
    .where(eq(atprotoHandleClaims.userId, userId))
    .orderBy(desc(atprotoHandleClaims.createdAt));
}

router.get("/.well-known/oauth-client-metadata.json", async (_req, res) => {
  const client = await getAtprotoOAuthClient();
  res.json(client.clientMetadata);
});

router.get("/api/atproto/me", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const account = await linkedAccountForUser(user.id);
  const tezosIdentity = await resolveUserTezosIdentity(user.id);
  const rollout = skywireRolloutStatusForRole(user.roles ?? user.role ?? null);
  res.json({
    enabled: isAtprotoEnabled() && rollout.eligible,
    rollout,
    account: safeAtprotoAccount(account),
    handleClaims: await listClaims(user.id),
    tezosAlias: tezosIdentity.preferredTezosDomain,
    walletAddress: tezosIdentity.primaryWalletAddress,
    tezosIdentity,
    oauth: {
      clientIdUrl: atprotoClientIdUrl(),
      redirectUri: atprotoRedirectUri(),
      scope: ATPROTO_SCOPE,
      maxScope: ATPROTO_MAX_SCOPE,
    },
  });
});

router.get("/api/atproto/permissions/options", isAuthenticated, async (_req, res) => {
  res.json({
    defaultTier: SKYWIRE_DEFAULT_PERMISSION_TIER,
    tiers: SKYWIRE_PERMISSION_TIER_OPTIONS,
    chat: {
      scope: "transition:chat.bsky",
      description: SKYWIRE_CHAT_PERMISSION_DESCRIPTION,
      warning: SKYWIRE_CHAT_PERMISSION_WARNING,
    },
    maxScope: ATPROTO_MAX_SCOPE,
  });
});

router.get("/api/atproto/registration/options", isAuthenticated, async (_req, res) => {
  const allowedPds = allowedRegistrationPds();
  const defaultPds = process.env.ATPROTO_DEFAULT_PDS || allowedPds[0] || "https://bsky.social";
  const externalSignupUrl = externalSignupUrlForPds(defaultPds);
  res.json({
    enabled: isAtprotoEnabled(),
    allowedPds,
    defaultPds,
    handleSuffix: registrationHandleSuffix(),
    inviteCodeRequired: process.env.ATPROTO_REGISTRATION_INVITE_REQUIRED === "true",
    phoneVerificationMode: phoneVerificationModeForPds(defaultPds),
    externalSignupUrl,
  });
});

router.post("/api/atproto/register/phone-verification", isAuthenticated, mutationLimiter, async (req, res) => {
  if (!isAtprotoEnabled()) return res.status(503).json({ error: "AT Protocol is disabled" });
  const parsed = phoneVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path?.join(".") || "payload";
    return res.status(400).json({
      error: `${field}: ${first?.message || "Invalid AT Protocol phone verification payload"}`,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "payload",
        message: issue.message,
      })),
    });
  }

  let pdsUrl: string;
  try {
    pdsUrl = normalizePdsUrl(parsed.data.pdsUrl);
  } catch (err) {
    return res.status((err as any)?.status || 400).json({ error: (err as Error).message });
  }

  const externalSignupUrl = externalSignupUrlForPds(pdsUrl);
  if (phoneVerificationModeForPds(pdsUrl) === "external") {
    return res.status(424).json({
      status: 424,
      error: "PDS phone verification failed: This PDS requires phone verification, but it does not expose phone-code requests to Skywire. Open the official PDS signup, create the account there, then connect it to Skywire with AT Protocol OAuth.",
      action: "external_signup_required",
      externalSignupUrl,
      pdsStatus: null,
      pdsError: null,
      pdsMessage: "Skywire routes this PDS through its official signup flow because public phone-code requests are not available.",
    });
  }

  const { AtpAgent } = await import("@atproto/api");
  const agent = new AtpAgent({ service: pdsUrl });
  try {
    await agent.com.atproto.temp.requestPhoneVerification({
      phoneNumber: parsed.data.phoneNumber,
    });
  } catch (err) {
    const response = pdsPhoneVerificationErrorResponse(err, pdsUrl);
    console.warn("[skywire] PDS phone verification rejected:", {
      pdsUrl,
      phone: maskedPhone(parsed.data.phoneNumber),
      pdsStatus: response.pdsStatus,
      pdsError: response.pdsError,
      pdsMessage: response.pdsMessage,
      message: response.error,
    });
    return res.status(response.status).json(response);
  }

  res.json({ ok: true, pdsUrl, phone: maskedPhone(parsed.data.phoneNumber) });
});

router.post("/api/atproto/register", isAuthenticated, mutationLimiter, async (req, res) => {
  if (!isAtprotoEnabled()) return res.status(503).json({ error: "AT Protocol is disabled" });
  const user = req.user as any;
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path?.join(".") || "payload";
    return res.status(400).json({
      error: `${field}: ${first?.message || "Invalid AT Protocol registration payload"}`,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "payload",
        message: issue.message,
      })),
    });
  }
  const existingAccount = await linkedAccountForUser(user.id);
  if (existingAccount) return res.status(409).json({ error: "Disconnect the current AT Protocol account first" });
  const pdsUrl = normalizePdsUrl(parsed.data.pdsUrl);
  const handle = normalizeRegistrationHandle(parsed.data.handle, registrationHandleSuffix());
  if (!isValidAtHandle(handle)) {
    return res.status(400).json({
      error: "Enter an AT handle like wtfgameshow.bsky.social, or just wtfgameshow for the default bsky.social suffix",
    });
  }
  if (process.env.ATPROTO_REGISTRATION_INVITE_REQUIRED === "true" && !parsed.data.inviteCode) {
    return res.status(400).json({ error: "This PDS requires an invite code" });
  }
  const verificationPhone = parsed.data.verificationPhone?.trim() || undefined;
  const verificationCode = parsed.data.verificationCode?.trim() || undefined;
  if (Boolean(verificationPhone) !== Boolean(verificationCode)) {
    return res.status(400).json({
      error: "Enter both the phone number and verification code, or leave both blank for a PDS that does not require phone verification",
    });
  }

  const { AtpAgent } = await import("@atproto/api");
  const agent = new AtpAgent({ service: pdsUrl });
  let result;
  try {
    result = await agent.createAccount({
      handle,
      email: parsed.data.email,
      password: parsed.data.password,
      inviteCode: parsed.data.inviteCode || undefined,
      verificationPhone,
      verificationCode,
    });
  } catch (err) {
    const response = pdsRegistrationErrorResponse(err, pdsUrl);
    console.warn("[skywire] PDS registration rejected:", {
      pdsUrl,
      handle,
      pdsStatus: response.pdsStatus,
      pdsError: response.pdsError,
      pdsMessage: response.pdsMessage,
      message: response.error,
    });
    return res.status(response.status).json(response);
  }
  const session = agent.session;
  if (!session) return res.status(502).json({ error: "PDS created account but did not return a session" });

  const profile = await agent.getProfile({ actor: result.data.did }).catch(() => null);
  const [account] = await db
    .insert(atprotoAccounts)
    .values({
      userId: user.id,
      did: result.data.did,
      handle: result.data.handle,
      pdsUrl,
      displayName: profile?.data.displayName ?? null,
      avatarUrl: profile?.data.avatar ?? null,
      description: profile?.data.description ?? null,
      indexedAt: new Date(),
      lastSyncedAt: new Date(),
      oauthIssuer: "credential-session",
      oauthScopes: "atproto",
      oauthRequestedScopes: "atproto",
      oauthPermissionTier: "be-safe",
      oauthChatEnabled: false,
      updatedAt: new Date(),
    })
    .returning();
  await persistCredentialSessionForDid(result.data.did, session);
  await emitAtprotoSystemEvent({
    eventType: "atproto.account.registered",
    userId: user.id,
    did: result.data.did,
    handle: result.data.handle,
    rawRefType: "atproto_account",
    rawRefId: account.id,
    metadata: { pdsUrl },
  });
  res.status(201).json({ account: safeAtprotoAccount(account) });
});

router.get("/api/atproto/oauth/start", isAuthenticated, async (req, res) => {
  if (!isAtprotoEnabled()) return res.status(503).json({ error: "AT Protocol is disabled" });
  const parsed = oauthStartSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid AT Protocol OAuth request" });
  }
  const returnTo = safeReturnPath(parsed.data.returnTo);
  const origin = requestOrigin(req);
  const popup = parsed.data.popup === "1";
  const appName = parsed.data.app === "tz2at" ? "tz2at" : "skywire";
  if (appName === "skywire" && !userEligibleForSkywireRollout((req.user as any).roles ?? (req.user as any).role)) {
    return res.status(403).json({ error: "Skywire is not available for your account yet", code: "skywire_rollout_denied" });
  }
  const tz2atStep = normalizeTz2atPermissionStep(parsed.data.step);
  const tier = normalizeSkywirePermissionTier(parsed.data.tier);
  const chatEnabled = parsed.data.chat === "1" || parsed.data.chat === "true";
  const requestedScope =
    appName === "tz2at"
      ? buildTz2atAtprotoScope(tz2atStep)
      : buildSkywireAtprotoScope(tier, chatEnabled);
  const handle = normalizeRegistrationHandle(parsed.data.handle, registrationHandleSuffix());
  if (!isValidAtHandle(handle)) {
    return redirectAtprotoOAuthStartError(res, { popup, error: "atproto_handle", returnTo, appName, origin });
  }
  if (appName === "skywire" && isReservedSkywirePlatformHandle(handle)) {
    return redirectAtprotoOAuthStartError(res, {
      popup,
      error: "atproto_platform_account_reserved",
      returnTo,
      appName,
      origin,
    });
  }
  if (appName === "skywire" && chatEnabled) {
    const existingAccount = await linkedAccountForUser((req.user as any).id);
    if (!existingAccount) {
      return redirectAtprotoOAuthStartError(res, {
        popup,
        error: "atproto_chat_account_required",
        returnTo,
        appName,
        origin,
      });
    }
    if (normalizeAtHandle(existingAccount.handle) !== handle) {
      return redirectAtprotoOAuthStartError(res, {
        popup,
        error: "atproto_chat_account_mismatch",
        returnTo,
        appName,
        origin,
      });
    }
  }
  const state = randomProofToken();
  const oauthState: AtprotoOAuthPendingState = {
    state,
    returnTo,
    popup,
    userId: (req.user as any).id,
    appName,
    tz2atStep,
    permissionTier: tier,
    chatEnabled,
    requestedScope,
    requestedHandle: handle,
    origin,
    startedAt: Date.now(),
  };
  (req.session as any).atprotoOAuth = oauthState;
  rememberAtprotoOAuthState(oauthState);
  try {
    const client = await getAtprotoOAuthClient();
    const url = await client.authorize(handle, { scope: requestedScope, state });
    if (appName === "skywire") {
      const localDid = `did:wtf:local-user-${(req.user as any).id}`;
      await emitAtprotoSystemEvent({
        eventType: "atproto.permission_tier.selected",
        userId: (req.user as any).id,
        did: localDid,
        handle,
        rawRefType: "atproto_oauth_start",
        rawRefId: state,
        metadata: { permissionTier: tier, chatEnabled, requestedScope },
      });
      await emitAtprotoSystemEvent({
        eventType: "atproto.chat_permission.toggled",
        userId: (req.user as any).id,
        did: localDid,
        handle,
        rawRefType: "atproto_oauth_start",
        rawRefId: `${state}:chat`,
        metadata: { enabled: chatEnabled, permissionTier: tier, requestedScope },
      });
    }
    req.session.save((err) => {
      if (err) {
        clearAtprotoOAuthState(req, state);
        return res.status(500).json({ error: "Failed to persist OAuth state" });
      }
      res.redirect(url.toString());
    });
  } catch (err) {
    clearAtprotoOAuthState(req, state);
    console.warn("[skywire] atproto oauth start failed:", {
      handle,
      tier,
      chatEnabled,
      message: err instanceof Error ? err.message : String(err),
    });
    if (popup) {
      return res
        .type("html")
        .send(popupCompletionPage({ ok: false, error: "atproto_oauth_start", returnTo, app: appName, origin }));
    }
    const query = new URLSearchParams({ error: "atproto_oauth_start" });
    res.redirect(originUrl(origin, returnPathWithQuery(returnTo, query)));
  }
});

router.get("/api/atproto/oauth/callback", async (req, res) => {
  const params = new URLSearchParams(req.originalUrl.split("?")[1] || "");
  const callbackState = params.get("state");
  const sessionState = atprotoOAuthStateForCallback(req, callbackState);
  if (!sessionState?.userId) {
    return res.redirect(originUrl(requestOrigin(req), "/skywire?error=atproto_session"));
  }
  const returnTo = safeReturnPath(sessionState.returnTo);
  const popup = sessionState.popup === true;
  const appName = sessionState.appName === "tz2at" ? "tz2at" : "skywire";
  const callbackOrigin = requestOrigin(req);
  const returnOrigin = safeOAuthReturnOrigin(sessionState.origin, req);
  const redirectWith = (query: string) => {
    const parsed = new URLSearchParams(query);
    if (popup) {
      parsed.set("popup", "1");
      return res
        .type("html")
        .send(
          popupCompletionPage({
            ok: parsed.get("verified") === "atproto",
            handle: parsed.get("handle"),
            error: parsed.get("error"),
            returnTo,
            app: appName,
            permissionTier: sessionState.permissionTier || sessionState.tz2atStep || null,
            chatEnabled: Boolean(sessionState.chatEnabled),
            requestedScope: sessionState.requestedScope ?? null,
            grantedScope: parsed.get("grantedScope"),
            accountId: parsed.get("accountId") ? Number(parsed.get("accountId")) : null,
            origin: returnOrigin,
          })
        );
    }
    return res.redirect(originUrl(returnOrigin, returnPathWithQuery(returnTo, parsed)));
  };
  const authenticatedUserId = req.isAuthenticated?.() ? Number((req.user as any)?.id) : null;
  if (authenticatedUserId && authenticatedUserId !== Number(sessionState.userId) && callbackOrigin === returnOrigin) {
    return redirectWith("error=atproto_session");
  }
  try {
    const client = await getAtprotoOAuthClient();
    const { session, state } = await client.callback(params);
    if (state !== sessionState.state) {
      return redirectWith("error=atproto_state");
    }

    const { Agent } = await import("@atproto/api");
    const api = new Agent(session);
    const profile = await api.getProfile({ actor: session.did });
    const tokenInfo = await session.getTokenInfo(false).catch(() => null);
    const sessionTokenScope =
      typeof (session as any)?.tokenSet?.scope === "string" ? String((session as any).tokenSet.scope) : null;
    const grants = resolveAtprotoOAuthGrantState({
      appName,
      tokenScope: tokenInfo?.scope ?? sessionTokenScope,
      requestedScope: sessionState.requestedScope,
      chatRequested: Boolean(sessionState.chatEnabled),
      fallbackScope: ATPROTO_SCOPE,
    });
    const grantedScope = grants.grantedScope;
    const requestedScope = grants.requestedScope;
    const resolvedPermissionTier =
      appName === "tz2at"
        ? sessionState.tz2atStep === "wallet-link"
          ? "tz2at-wallet-link"
          : "tz2at-identity"
        : (normalizeSkywirePermissionTier(sessionState.permissionTier) as SkywirePermissionTier);
    const resolvedChatEnabled = grants.chatEnabled;
    const requestedHandle = normalizeAtHandle(sessionState.requestedHandle || "");
    const returnedHandle = normalizeAtHandle(profile.data.handle || "");
    if (appName === "skywire" && isReservedSkywirePlatformHandle(returnedHandle)) {
      console.warn("[skywire] refused reserved platform actor OAuth binding", {
        userId: sessionState.userId,
        requestedHandle,
        returnedHandle,
        did: session.did,
      });
      return redirectWith("error=atproto_platform_account_reserved");
    }
    if (appName === "skywire" && requestedHandle && returnedHandle && requestedHandle !== returnedHandle) {
      console.warn("[skywire] refused OAuth account mismatch", {
        userId: sessionState.userId,
        requestedHandle,
        returnedHandle,
        did: session.did,
      });
      return redirectWith("error=atproto_account_mismatch");
    }
    const existingForDid = await linkedAccountForUserDid(sessionState.userId, session.did);
    const existingForUser = await linkedAccountForUser(sessionState.userId);
    if (appName === "skywire" && sessionState.chatEnabled) {
      if (!existingForUser) {
        return redirectWith("error=atproto_chat_account_required");
      }
      if (existingForUser.did !== session.did || normalizeAtHandle(existingForUser.handle) !== returnedHandle) {
        console.warn("[skywire] refused chat OAuth upgrade for non-canonical account", {
          userId: sessionState.userId,
          existingDid: existingForUser.did,
          existingHandle: existingForUser.handle,
          returnedDid: session.did,
          returnedHandle,
        });
        return redirectWith("error=atproto_chat_account_mismatch");
      }
    }

    const accountValues = {
      userId: sessionState.userId,
      did: session.did,
      handle: profile.data.handle,
      pdsUrl: tokenInfo?.aud ?? null,
      displayName: profile.data.displayName ?? null,
      avatarUrl: profile.data.avatar ?? null,
      description: profile.data.description ?? null,
      indexedAt: new Date(),
      lastSyncedAt: new Date(),
      oauthIssuer: tokenInfo?.iss ?? null,
      oauthScopes: grantedScope,
      oauthRequestedScopes: requestedScope,
      oauthPermissionTier: resolvedPermissionTier,
      oauthChatEnabled: resolvedChatEnabled,
      tokenExpiresAt: tokenInfo?.expiresAt ?? null,
      disconnectedAt: null,
      updatedAt: new Date(),
    };
    const existingAccount = existingForDid ?? existingForUser;
    const [account] = existingAccount
      ? await db
          .update(atprotoAccounts)
          .set(accountValues)
          .where(eq(atprotoAccounts.id, existingAccount.id))
          .returning()
      : await db
          .insert(atprotoAccounts)
          .values({
        userId: sessionState.userId,
        did: session.did,
        handle: profile.data.handle,
        pdsUrl: tokenInfo?.aud ?? null,
        displayName: profile.data.displayName ?? null,
        avatarUrl: profile.data.avatar ?? null,
        description: profile.data.description ?? null,
        indexedAt: new Date(),
        lastSyncedAt: new Date(),
        oauthIssuer: tokenInfo?.iss ?? null,
        oauthScopes: grantedScope,
        oauthRequestedScopes: requestedScope,
        oauthPermissionTier: resolvedPermissionTier,
        oauthChatEnabled: resolvedChatEnabled,
        tokenExpiresAt: tokenInfo?.expiresAt ?? null,
        updatedAt: new Date(),
      })
          .returning();

    const storedSession = takePendingOAuthSessionForDid(session.did);
    await persistOAuthSessionForDid(session.did, storedSession ?? (session as any), {
      accountId: account.id,
      userId: sessionState.userId,
      oauthScopes: grantedScope,
      oauthRequestedScopes: requestedScope,
      oauthPermissionTier: resolvedPermissionTier,
      oauthChatEnabled: resolvedChatEnabled,
    });

    await emitAtprotoSystemEvent({
      eventType: "atproto.account.linked",
      userId: sessionState.userId,
      did: session.did,
      handle: profile.data.handle,
      rawRefType: "atproto_account",
      rawRefId: account.id,
      metadata: {
        pdsUrl: tokenInfo?.aud ?? null,
        permissionTier: resolvedPermissionTier,
        chatEnabled: resolvedChatEnabled,
        appName,
        requestedScope,
        grantedScope,
      },
    });

    clearAtprotoOAuthState(req, sessionState.state);
    const verifiedParams = new URLSearchParams({
      verified: "atproto",
      handle: profile.data.handle,
      accountId: String(account.id),
      permissionTier: String(sessionState.permissionTier || sessionState.tz2atStep || ""),
      chat: resolvedChatEnabled ? "1" : "0",
    });
    if (requestedScope) verifiedParams.set("requestedScope", requestedScope);
    if (grantedScope) verifiedParams.set("grantedScope", grantedScope);
    req.session.save(() => redirectWith(verifiedParams.toString()));
  } catch (err) {
    console.warn("[skywire] atproto oauth callback failed:", err);
    clearAtprotoOAuthState(req, sessionState.state);
    redirectWith("error=atproto_oauth");
  }
});

router.post("/api/atproto/unlink", isAuthenticated, mutationLimiter, async (req, res) => {
  const user = req.user as any;
  const account = await linkedAccountForUser(user.id);
  if (!account) return res.status(404).json({ error: "No linked AT Protocol account" });
  await db
    .update(atprotoAccounts)
    .set({ disconnectedAt: new Date(), updatedAt: new Date() })
    .where(eq(atprotoAccounts.id, account.id));
  await emitAtprotoSystemEvent({
    eventType: "atproto.account.unlinked",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    rawRefType: "atproto_account",
    rawRefId: account.id,
  });
  res.json({ ok: true });
});

router.post("/api/atproto/handle/claim", isAuthenticated, mutationLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = handleClaimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid handle claim payload" });
  const account = await linkedAccountForUser(user.id);
  if (!account) return res.status(400).json({ error: "Connect an AT Protocol account first" });

  const desiredHandle = normalizeAtHandle(parsed.data.desiredHandle);
  const tezosAlias = parsed.data.tezosAlias?.trim().toLowerCase() || null;
  if (tezosAlias && !isTezosAlias(tezosAlias)) {
    return res.status(400).json({ error: "Tezos alias must be a .tez name" });
  }

  let verificationMethod: "dns_txt" | "https_well_known" | "wtf_hosted_subdomain" | "tezos_alias_only";
  let status: "pending" | "verified" = "pending";
  if (desiredHandle.endsWith(".tez")) {
    verificationMethod = "tezos_alias_only";
  } else {
    if (!isValidAtHandle(desiredHandle)) {
      return res.status(400).json({ error: "AT handles must be DNS-style hostnames" });
    }
    verificationMethod = "https_well_known";
  }

  if (parsed.data.wtfSubdomainGrantId) {
    const [grant] = await db
      .select()
      .from(wtfSubdomainGrants)
      .where(
        and(
          eq(wtfSubdomainGrants.id, parsed.data.wtfSubdomainGrantId),
          eq(wtfSubdomainGrants.userId, user.id)
        )
      )
      .limit(1);
    if (!grant || grant.status === "revoked") {
      return res.status(403).json({ error: "WTF subdomain grant is not available" });
    }
    const skywireDomain = (process.env.ATPROTO_SKYWIRE_HANDLE_SUBDOMAIN || "skywire.wtfgameshow.app").toLowerCase();
    const rootDomain = (process.env.ATPROTO_WTF_HANDLE_DOMAIN || "wtfgameshow.app").toLowerCase();
    const allowed = [`${grant.label}.${skywireDomain}`, `${grant.label}.${rootDomain}`];
    if (!allowed.includes(desiredHandle)) {
      return res.status(400).json({ error: "Desired handle does not match the WTF subdomain grant" });
    }
    verificationMethod = "wtf_hosted_subdomain";
    status = "verified";
  }

  const [claim] = await db
    .insert(atprotoHandleClaims)
    .values({
      userId: user.id,
      atprotoAccountId: account.id,
      did: account.did,
      desiredHandle,
      tezosAlias,
      wtfSubdomainGrantId: parsed.data.wtfSubdomainGrantId ?? null,
      verificationMethod,
      verificationStatus: status,
      proofToken: randomProofToken(),
      verifiedAt: status === "verified" ? new Date() : null,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [atprotoHandleClaims.userId, atprotoHandleClaims.desiredHandle],
      set: {
        atprotoAccountId: account.id,
        did: account.did,
        tezosAlias,
        wtfSubdomainGrantId: parsed.data.wtfSubdomainGrantId ?? null,
        verificationMethod,
        verificationStatus: status,
        verifiedAt: status === "verified" ? new Date() : null,
        failureReason: null,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  await emitAtprotoSystemEvent({
    eventType: "atproto.handle.claimed",
    userId: user.id,
    did: account.did,
    handle: desiredHandle,
    tezosAlias,
    rawRefType: "atproto_handle_claim",
    rawRefId: claim.id,
  });
  if (status === "verified") {
    await emitAtprotoSystemEvent({
      eventType: "atproto.handle.verified",
      userId: user.id,
      did: account.did,
      handle: desiredHandle,
      tezosAlias,
      rawRefType: "atproto_handle_claim",
      rawRefId: claim.id,
    });
  }
  res.status(201).json(claim);
});

router.get("/api/atproto/handle/claims", isAuthenticated, async (req, res) => {
  res.json(await listClaims((req.user as any).id));
});

router.post("/api/atproto/handle/verify", isAuthenticated, mutationLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid verify payload" });
  const claims = await listClaims(user.id);
  const desired = parsed.data.desiredHandle ? normalizeAtHandle(parsed.data.desiredHandle) : null;
  const claim = claims.find((row) => (parsed.data.id ? row.id === parsed.data.id : row.desiredHandle === desired));
  if (!claim) return res.status(404).json({ error: "Handle claim not found" });

  let did: string | null = null;
  if (claim.verificationMethod === "wtf_hosted_subdomain") {
    did = claim.did;
  } else if (claim.verificationMethod === "dns_txt") {
    did = await resolveDidViaDnsTxt(claim.desiredHandle);
  } else if (claim.verificationMethod === "https_well_known") {
    did = await resolveDidViaHttpsWellKnown(claim.desiredHandle);
  }

  const verified = did === claim.did && claim.verificationMethod !== "tezos_alias_only";
  const [updated] = await db
    .update(atprotoHandleClaims)
    .set({
      verificationStatus: verified ? "verified" : "failed",
      verifiedAt: verified ? new Date() : claim.verifiedAt,
      lastCheckedAt: new Date(),
      failureReason: verified ? null : "Handle did not resolve to the linked DID through AT Protocol DNS/HTTPS rules",
      updatedAt: new Date(),
    })
    .where(eq(atprotoHandleClaims.id, claim.id))
    .returning();

  if (verified) {
    await emitAtprotoSystemEvent({
      eventType: "atproto.handle.verified",
      userId: user.id,
      did: claim.did,
      handle: claim.desiredHandle,
      tezosAlias: claim.tezosAlias,
      rawRefType: "atproto_handle_claim",
      rawRefId: claim.id,
    });
  }
  res.json(updated);
});

router.get("/.well-known/atproto-did", async (req, res) => {
  const host = normalizeAtHandle(req.hostname || String(req.headers.host || "").split(":")[0] || "");
  const [claim] = await db
    .select({ did: atprotoHandleClaims.did })
    .from(atprotoHandleClaims)
    .where(
      and(
        eq(atprotoHandleClaims.desiredHandle, host),
        eq(atprotoHandleClaims.verificationStatus, "verified"),
        eq(atprotoHandleClaims.verificationMethod, "wtf_hosted_subdomain")
      )
    )
    .limit(1);
  if (!claim?.did) return res.status(404).type("text/plain").send("not found");
  res.type("text/plain").send(claim.did);
});

export default router;
