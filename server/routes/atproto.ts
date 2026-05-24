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
  atprotoAccountSessionSummary,
  getAtprotoOAuthClient,
  isAtprotoEnabled,
  persistCredentialSessionForDid,
  persistOAuthSessionForDid,
  takePendingOAuthSessionForDid,
  ATPROTO_SCOPE,
} from "../features/atproto/oauth";
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

const mutationLimiter = createInMemoryRateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => `user:${(req.user as any)?.id ?? req.ip}`,
  message: { error: "Too many Skywire identity requests, please try again later" },
});

function safeReturnPath(value: unknown): string {
  const requested = typeof value === "string" ? value : "/skywire";
  const allowed = (process.env.ATPROTO_ALLOWED_RETURN_PATHS || "/profile,/skywire,/challenges,/side-quests")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  return allowed.includes(requested) ? requested : "/skywire";
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
}): string {
  const title = payload.ok ? "Bluesky connected" : "Bluesky connection failed";
  const message = payload.ok
    ? payload.handle
      ? `Bluesky identity connected: @${payload.handle}`
      : "Bluesky identity connected."
    : "Bluesky connection did not complete. Try connecting again.";
  const storageKey = payload.ok ? "skywire:atproto-linked" : "skywire:atproto-error";
  const storagePayload = JSON.stringify({
    handle: payload.handle ?? "",
    error: payload.error ?? "",
    at: Date.now(),
  });
  const returnUrl = `${publicBaseUrl()}${payload.returnTo}`;
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
    <p><a href="${returnUrl}">Return to Skywire</a></p>
    <script>
      (function () {
        var payload = ${JSON.stringify(storagePayload)};
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
    .limit(1);
  return account ?? null;
}

export function safeAtprotoAccount(account: typeof atprotoAccounts.$inferSelect | null) {
  if (!account) return null;
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
  res.json({
    enabled: isAtprotoEnabled(),
    account: safeAtprotoAccount(account),
    handleClaims: await listClaims(user.id),
    tezosAlias: tezosIdentity.preferredTezosDomain,
    walletAddress: tezosIdentity.primaryWalletAddress,
    tezosIdentity,
    oauth: {
      clientIdUrl: atprotoClientIdUrl(),
      redirectUri: atprotoRedirectUri(),
      scope: ATPROTO_SCOPE,
    },
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
  const returnTo = safeReturnPath(req.query.returnTo);
  const popup = req.query.popup === "1";
  const handle = normalizeRegistrationHandle(String(req.query.handle || ""), registrationHandleSuffix());
  if (!isValidAtHandle(handle)) {
    if (popup) {
      return res
        .type("html")
        .send(popupCompletionPage({ ok: false, error: "atproto_handle", returnTo }));
    }
    return res.redirect(`${publicBaseUrl()}${returnTo}?error=atproto_handle`);
  }
  const state = randomProofToken();
  (req.session as any).atprotoOAuth = {
    state,
    returnTo,
    popup,
    userId: (req.user as any).id,
    startedAt: Date.now(),
  };
  try {
    const client = await getAtprotoOAuthClient();
    const url = await client.authorize(handle, { scope: ATPROTO_SCOPE, state });
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "Failed to persist OAuth state" });
      res.redirect(url.toString());
    });
  } catch (err) {
    console.warn("[skywire] atproto oauth start failed:", {
      handle,
      message: err instanceof Error ? err.message : String(err),
    });
    if (popup) {
      return res
        .type("html")
        .send(popupCompletionPage({ ok: false, error: "atproto_oauth_start", returnTo }));
    }
    res.redirect(`${publicBaseUrl()}${returnTo}?error=atproto_oauth_start`);
  }
});

router.get("/api/atproto/oauth/callback", async (req, res) => {
  const sessionState = (req.session as any).atprotoOAuth;
  if (!req.isAuthenticated?.() || !sessionState?.userId) {
    return res.redirect(`${publicBaseUrl()}/skywire?error=atproto_session`);
  }
  const params = new URLSearchParams(req.originalUrl.split("?")[1] || "");
  const returnTo = safeReturnPath(sessionState.returnTo);
  const popup = sessionState.popup === true;
  const redirectWith = (query: string) => {
    if (popup) {
      const parsed = new URLSearchParams(query);
      return res
        .type("html")
        .send(
          popupCompletionPage({
            ok: parsed.get("verified") === "atproto",
            handle: parsed.get("handle"),
            error: parsed.get("error"),
            returnTo,
          })
        );
    }
    return res.redirect(`${publicBaseUrl()}${returnTo}?${query}`);
  };
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
      oauthScopes: tokenInfo?.scope ?? ATPROTO_SCOPE,
      tokenExpiresAt: tokenInfo?.expiresAt ?? null,
      disconnectedAt: null,
      updatedAt: new Date(),
    };
    const existingAccount = await linkedAccountForUser(sessionState.userId);
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
        oauthScopes: tokenInfo?.scope ?? ATPROTO_SCOPE,
        tokenExpiresAt: tokenInfo?.expiresAt ?? null,
        updatedAt: new Date(),
      })
          .returning();

    const storedSession = takePendingOAuthSessionForDid(session.did);
    if (storedSession) await persistOAuthSessionForDid(session.did, storedSession);

    await emitAtprotoSystemEvent({
      eventType: "atproto.account.linked",
      userId: sessionState.userId,
      did: session.did,
      handle: profile.data.handle,
      rawRefType: "atproto_account",
      rawRefId: account.id,
      metadata: { pdsUrl: tokenInfo?.aud ?? null },
    });

    delete (req.session as any).atprotoOAuth;
    req.session.save(() =>
      redirectWith(`verified=atproto&handle=${encodeURIComponent(profile.data.handle)}`)
    );
  } catch (err) {
    console.warn("[skywire] atproto oauth callback failed:", err);
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
