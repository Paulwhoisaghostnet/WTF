import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { createHash, randomBytes } from "crypto";
import { hashPassword, comparePasswords, isAuthenticated } from "./passport";
import {
  createUser,
  getUserById,
  getUserByUsername,
  getUserByEmail,
  getUserByWalletAddress,
  createWalletAuthNonce,
  consumeWalletAuthNonce,
  updateUserPassword,
  clearUserTempPassword,
  markUserWelcomedToWtfOs,
  markUserGmWelcomeForUtcDay,
} from "./storage";
import { classifyDbError } from "../errors/db-errors";
import { getPublicSiteOrigin, oauthCallbackUrl } from "./oauth-base";
import {
  buildChallengeMessage,
  verifyWalletSignature,
  verifyPublicKeyOwnership,
  publicKeyToAddress,
} from "./wallet-verify";
import { getEffectivePermissionsForRoles, hasPermission } from "../lib/permissions";
import { getXpTierForTotal } from "@shared/types";
import { pool } from "../db";
import { backfillUserWallets } from "../lib/wallet-events";
import { enqueue as enqueueIndex } from "../lib/indexing-queue";
import { db } from "../db";
import { userWallets, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { encryptOAuthSecret } from "./oauth-crypto";
import { ensureSessionCsrfToken } from "../lib/csrf";
import { legacyTwitterOAuthEnabled } from "./twitter-legacy";
import { ingestSystemEvent } from "../challenges/events/ingest";
import {
  AUTH_WELCOME_COMPLETED_EVENT_TYPE,
  emitWelcomeEventIfNeeded,
} from "./welcome-event";
import {
  AUTH_GM_WELCOME_COMPLETED_EVENT_TYPE,
  currentGmWelcomeUtcDay,
  emitGmWelcomeEventIfNeeded,
  getDailyGmWelcomePayload,
  serveGmWelcomeAsset,
} from "./gm-welcome";
import { runXConnectOnboardingSoon } from "../lib/w-x-onboarding";
import { listRolesForUserSnapshot } from "../lib/user-roles";
import { listActiveUserCurses } from "../lib/user-curses";
import { getWtfOsAccessForRoles } from "../lib/role-surface-access";

const router = Router();

router.get("/api/auth/csrf-token", (req, res) => {
  const csrfToken = ensureSessionCsrfToken(req);
  req.session.save((err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to persist CSRF token" });
    }
    return res.json({ csrfToken });
  });
});

function toSafeUser(user: any) {
  if (!user) return user;
  const {
    passwordHash,
    tempPasswordHash,
    tempPasswordExpiresAt,
    twitterOauthToken: _twitterOauthToken,
    twitterOauthTokenSecret: _twitterOauthTokenSecret,
    twitterOauth2AccessToken: _twitterOauth2AccessToken,
    twitterOauth2RefreshToken: _twitterOauth2RefreshToken,
    ...rest
  } = user;
  const tempExpiresAt = tempPasswordExpiresAt
    ? new Date(tempPasswordExpiresAt)
    : null;
  const hasActiveTempPassword =
    Boolean(tempPasswordHash) &&
    tempExpiresAt !== null &&
    tempExpiresAt > new Date();
  return { ...rest, hasPassword: Boolean(passwordHash) || hasActiveTempPassword };
}

/**
 * Kick off a background wallet-event backfill for every wallet this user
 * has linked, AND enqueue each wallet in `indexing_queue` with
 * priority=1 so the cockpit scheduler retries on failure.  Never
 * blocks the request.
 */
function refreshDossierInBackground(userId: number, reason: string) {
  if (!userId) return;
  if (process.env.WTF_E2E_DISABLE_LOGIN_BACKFILL === "1") return;
  (async () => {
    try {
      const wallets = await db
        .select({ addr: userWallets.walletAddress })
        .from(userWallets)
        .where(eq(userWallets.userId, userId));
      for (const w of wallets) {
        try {
          await enqueueIndex({
            target: w.addr,
            targetKind: "wallet",
            reason,
            priority: 1,
            userId,
          });
        } catch (queueErr) {
          console.warn(
            `[wallet-events] enqueue failed for ${w.addr}:`,
            queueErr
          );
        }
      }
    } catch (err) {
      console.warn("[wallet-events] login enqueue failed:", err);
    }
  })();
  backfillUserWallets(userId, reason).catch((err) => {
    console.error(
      `[wallet-events] login-triggered backfill failed for user ${userId}:`,
      err
    );
  });
}

/**
 * Local password policy.  Kept consistent across `/register`,
 * `/change-password`, and `/wallet/register` so a user cannot pick a
 * password through one endpoint that they could not later set through
 * another.  The lower bound is dictated by `change-password`; the upper
 * bound is a defence-in-depth check against scrypt CPU/memory abuse via
 * a giant input.
 */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < PASSWORD_MIN)
    return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return "Password too long";
  return null;
}

/**
 * Wrap `req.login` in `req.session.regenerate` so the session id we
 * issue after a successful authentication is *not* the one the client
 * may have been using anonymously beforehand.  This kills the
 * classic session-fixation chain where an attacker plants their own
 * session cookie on a victim and waits for them to authenticate.
 *
 * Used on every code-path that establishes a new authenticated
 * identity: local login, OAuth callbacks, wallet verify (existing
 * user), and wallet register / local register (newly created user).
 */
function loginWithSessionRegen(
  req: Request,
  user: any,
  done: (err: any) => void
) {
  req.session.regenerate((regenErr) => {
    if (regenErr) return done(regenErr);
    req.login(user, (loginErr) => {
      if (loginErr) return done(loginErr);
      req.session.save(done);
    });
  });
}

async function toSafeUserWithPermissions(user: any) {
  const safe = toSafeUser(user);
  if (!safe) return safe;
  safe.roles = await listRolesForUserSnapshot(safe);
  safe.role = safe.roles[0] ?? safe.role;
  safe.curses = await listActiveUserCurses(Number(safe.id));
  safe.gmWelcome = await getDailyGmWelcomePayload(safe);
  try {
    safe.effectivePermissions = await getEffectivePermissionsForRoles(safe.roles);
  } catch {
    safe.effectivePermissions = {};
  }
  try {
    safe.wtfOsAccess = await getWtfOsAccessForRoles(safe.roles);
  } catch {
    safe.wtfOsAccess = {
      surfaceIds: [],
      routePatterns: [],
      adminPanelTabs: [],
      automationHandles: [],
    };
  }
  safe.xpTier = getXpTierForTotal(safe.experiencePoints ?? 0);
  return safe;
}

async function emitAuthEvent(
  eventType: string,
  user: any,
  sourceModule: string,
  metadata: Record<string, unknown> = {}
) {
  if (!user?.id) return;
  try {
    await ingestSystemEvent({
      eventType,
      userId: user.id,
      source: "auth",
      sourceModule,
      rawRefType: "user",
      rawRefId: user.id,
      metadata: {
        username: user.username ?? null,
        ...metadata,
      },
    });
  } catch (err) {
    console.warn(`[auth] failed to emit ${eventType} SystemEvent:`, err);
  }
}

function profileRedirect(query: string): string {
  const base = getPublicSiteOrigin();
  return base ? `${base}/profile?${query}` : `/profile?${query}`;
}

const TWITTER_OAUTH2_RETURN_TARGETS: Record<string, string> = {
  profile: "/profile",
  w: "/w",
};

function twitterOAuth2Redirect(target: string | undefined, query: string): string {
  const base = getPublicSiteOrigin();
  const targetKey = typeof target === "string" ? target.toLowerCase() : "profile";
  const path = TWITTER_OAUTH2_RETURN_TARGETS[targetKey] || "/profile";
  const fullPath = `${path}?${query}`;
  return base ? `${base}${fullPath}` : fullPath;
}

const X_OAUTH2_AUTH_URL = "https://x.com/i/oauth2/authorize";
const X_OAUTH2_TOKEN_URL = "https://api.x.com/2/oauth2/token";
// /2/users/me specifically requires BOTH tweet.read AND users.read per
// X API v2 auth docs (https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping).
// Omitting tweet.read still produces a valid access token but /users/me
// then returns the generic 403 {"title":"Forbidden","type":"about:blank","detail":"Forbidden"}.
// We intentionally do NOT include offline.access — identity-only linking
// only needs a single /users/me call, no refresh tokens, so the consent
// screen stays minimal ("See Posts from your timeline" + "Any account you can view").
const X_PROFILE_LINK_SCOPES = ["tweet.read", "users.read"];
const X_OAUTH2_TIERS: Record<string, { scopes: string[] }> = {
  read: { scopes: ["tweet.read", "users.read"] },
  engage: {
    scopes: [
      "tweet.read",
      "tweet.write",
      "users.read",
      "like.write",
      "offline.access",
    ],
  },
};

function twitterOAuth2CallbackUrl(): string {
  const configured = process.env.TWITTER_OAUTH2_REDIRECT_URI?.trim();
  if (configured) return configured;
  return oauthCallbackUrl("/api/auth/twitter-oauth2/callback");
}

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

function getTwitterOAuth2ClientId(): string {
  return process.env.TWITTER_CLIENT_ID?.trim() || "";
}

function getTwitterOAuth2ClientSecret(): string {
  return process.env.TWITTER_CLIENT_SECRET?.trim() || "";
}

function selectedTwitterScopes(rawTier: unknown, rawScopes: unknown): string[] {
  if (rawTier === "profile" || rawTier === "identity") {
    return X_PROFILE_LINK_SCOPES;
  }
  const tier = typeof rawTier === "string" && rawTier in X_OAUTH2_TIERS ? rawTier : "read";
  const allowed = new Set(Object.values(X_OAUTH2_TIERS).flatMap((tierDef) => tierDef.scopes));
  const defaults = X_OAUTH2_TIERS[tier].scopes;
  const requested =
    typeof rawScopes === "string" && rawScopes.trim()
      ? rawScopes
          .split(/[,\s]+/)
          .map((scope) => scope.trim())
          .filter((scope) => allowed.has(scope))
      : defaults;
  const scopes = Array.from(new Set(requested.length > 0 ? requested : defaults));
  if (!scopes.includes("users.read")) scopes.push("users.read");
  if (tier !== "read" && !scopes.includes("offline.access")) scopes.push("offline.access");
  return scopes;
}

function normalizeTwitterOAuth2Handle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/@?/i, "")
    .split(/[/?#]/, 1)[0]
    .trim();
  if (!cleaned) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) return null;
  return cleaned.toLowerCase();
}

async function exchangeTwitterOAuth2Code(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const clientId = getTwitterOAuth2ClientId();
  const clientSecret = getTwitterOAuth2ClientSecret();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
    client_id: clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const response = await fetch(X_OAUTH2_TOKEN_URL, {
    method: "POST",
    headers,
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || response.statusText);
  }
  return payload as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
}

class TwitterOAuth2MeError extends Error {
  status: number;
  bodyText: string;
  payload: any;
  constructor(status: number, bodyText: string, payload: any) {
    super(
      payload?.detail ||
        payload?.title ||
        payload?.error_description ||
        payload?.error ||
        `HTTP ${status}`
    );
    this.name = "TwitterOAuth2MeError";
    this.status = status;
    this.bodyText = bodyText;
    this.payload = payload;
  }
}

async function fetchTwitterOAuth2Me(accessToken: string) {
  const base = process.env.X_API_BASE_URL?.trim() || "https://api.x.com/2";
  const response = await fetch(`${base}/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  // Read as text first so we can log the raw body even when X returns HTML
  // (happens for 5xx or when an upstream CDN intercepts the request).
  const bodyText = await response.text().catch(() => "");
  let payload: any = {};
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new TwitterOAuth2MeError(response.status, bodyText, payload);
  }
  return payload?.data as { id?: string; username?: string; name?: string } | undefined;
}

function oauthVerifyCallback(
  strategy: string,
  successQuery: string,
  failureQuery: string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(strategy, (err: Error | null, user: any) => {
      if (err) {
        console.error(`[auth] ${strategy} callback error:`, err);
        return res.redirect(profileRedirect(failureQuery));
      }
      if (!user) {
        return res.redirect(profileRedirect(failureQuery));
      }
      loginWithSessionRegen(req, user, async (loginErr) => {
        if (loginErr) {
          console.error(`[auth] ${strategy} callback login error:`, loginErr);
          return res.redirect(profileRedirect(failureQuery));
        }
        await emitAuthEvent("auth.login.succeeded", user, strategy, {
          method: strategy,
        });
        await emitWelcomeEventIfNeeded(user, strategy);
        await emitGmWelcomeEventIfNeeded(user, strategy);
        refreshDossierInBackground(user?.id, `social-${strategy}`);
        return res.redirect(profileRedirect(successQuery));
      });
    })(req, res, next);
  };
}

/**
 * Variant of `oauthVerifyCallback` for *primary login* flows
 * (Google/GitHub sign-in).  Same session-regeneration guarantee, but
 * routes the user to a configured success path rather than the
 * profile-link UI.
 */
function oauthLoginCallback(
  strategy: string,
  successPath: string,
  failurePath: string
) {
  const base = getPublicSiteOrigin();
  const buildRedirect = (p: string) => (base ? `${base}${p}` : p);
  return (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(strategy, (err: Error | null, user: any) => {
      if (err) {
        console.error(`[auth] ${strategy} login error:`, err);
        return res.redirect(buildRedirect(failurePath));
      }
      if (!user) return res.redirect(buildRedirect(failurePath));
      loginWithSessionRegen(req, user, async (loginErr) => {
        if (loginErr) {
          console.error(`[auth] ${strategy} login session error:`, loginErr);
          return res.redirect(buildRedirect(failurePath));
        }
        await emitAuthEvent("auth.login.succeeded", user, strategy, {
          method: strategy,
        });
        await emitWelcomeEventIfNeeded(user, strategy);
        await emitGmWelcomeEventIfNeeded(user, strategy);
        refreshDossierInBackground(user?.id, `social-${strategy}`);
        return res.redirect(buildRedirect(successPath));
      });
    })(req, res, next);
  };
}

/** Public: which social link flows are available (for Profile UI). */
router.get("/api/auth/social/config", (_req, res) => {
  res.json({
    github: Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() &&
        process.env.GITHUB_CLIENT_SECRET?.trim()
    ),
    twitter: legacyTwitterOAuthEnabled(),
    twitterOauth2: Boolean(process.env.TWITTER_CLIENT_ID?.trim()),
    discord: Boolean(
      process.env.DISCORD_CLIENT_ID?.trim() &&
        process.env.DISCORD_CLIENT_SECRET?.trim()
    ),
    publicSiteUrl: getPublicSiteOrigin() || null,
  });
});

/**
 * Admin diagnostic: expose the exact redirect URI and scopes the server will
 * send to X so operators can compare them against the X Developer Portal app
 * settings. Twitter OAuth2 fails silently (or redirects to a generic error
 * page) when the registered callback URL doesn't match byte-for-byte, so this
 * endpoint removes the guesswork.
 *
 * Requires `manage_roles` (the admin panel key) to avoid leaking client IDs.
 */
router.get("/api/auth/twitter-oauth2/diagnostics", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  try {
    const allowed = await hasPermission(user?.roles ?? user?.role, "manage_roles");
    if (!allowed) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
  } catch (err) {
    console.error("[auth] twitter oauth2 diagnostics permission check failed:", err);
    return res.status(500).json({ error: "Permission check failed" });
  }

  const clientId = getTwitterOAuth2ClientId();
  const hasClientSecret = Boolean(getTwitterOAuth2ClientSecret());
  const redirectUri = twitterOAuth2CallbackUrl();
  const publicSiteUrl = getPublicSiteOrigin();
  const configuredRedirectOverride = process.env.TWITTER_OAUTH2_REDIRECT_URI?.trim() || null;

  // Decode the `:ci` / `:na` suffix that X base64-encodes into the client_id.
  // Confidential clients (`:ci`) require HTTP Basic auth at the token endpoint,
  // which our /callback handler already does. Native clients (`:na`) must NOT
  // send Basic auth, so expose the detected kind to flag misconfig early.
  let clientKind: "confidential" | "public" | "unknown" = "unknown";
  if (clientId) {
    try {
      const decoded = Buffer.from(clientId, "base64").toString("utf8");
      if (decoded.endsWith(":ci")) clientKind = "confidential";
      else if (decoded.endsWith(":na")) clientKind = "public";
    } catch {
      // Ignore — leave as "unknown" if decode fails.
    }
  }

  res.json({
    clientIdConfigured: Boolean(clientId),
    clientIdLast4: clientId ? clientId.slice(-4) : null,
    clientSecretConfigured: hasClientSecret,
    clientKind,
    redirectUri,
    configuredRedirectOverride,
    publicSiteUrl: publicSiteUrl || null,
    profileScopes: X_PROFILE_LINK_SCOPES,
    tiers: Object.fromEntries(
      Object.entries(X_OAUTH2_TIERS).map(([key, value]) => [key, value.scopes])
    ),
    authorizeEndpoint: X_OAUTH2_AUTH_URL,
    tokenEndpoint: X_OAUTH2_TOKEN_URL,
    // X launched Pay-Per-Use on 2026-02-06 and migrated legacy Free-tier apps
    // onto the new plan with a one-time $10 voucher. The redesigned Console
    // lives at https://console.x.com (the old `developer.x.com/en/portal`
    // Projects & Apps nav no longer exists for Pay-Per-Use accounts — apps
    // are now a flat list and the concept of attaching a "Standalone App" to
    // a "Project" is gone). A 403 from /2/users/me with a valid
    // OAuth 2.0 user-context token almost always means one of:
    //   1. App User authentication settings were edited AFTER the current
    //      Client ID/Secret were issued → regenerate Client ID + Secret.
    //   2. App permissions in the Console don't cover the scope being used
    //      (e.g. tweet.write without "Read and write").
    //   3. The authorising X account is suspended / locked / in an age gate.
    //   4. The app is a pre-2026 Standalone App that never got v2 access
    //      provisioned → resave User authentication settings to force it.
    apiPlan: {
      notice:
        "X API moved to Pay-Per-Use on Feb 6, 2026. The redesigned Console " +
        "is at https://console.x.com — 'Projects & Apps' no longer exists; " +
        "apps are now a flat list. A 400 from /i/oauth2/authorize before " +
        "the consent screen usually means the redirect URI doesn't match " +
        "byte-for-byte or a requested scope isn't enabled on the app. A " +
        "403 from /2/users/me with a valid token usually means User auth " +
        "settings were edited after the Client ID/Secret were issued — " +
        "resave them and regenerate the OAuth 2.0 Client ID + Secret.",
      consoleUrl: "https://console.x.com/",
      legacyPortalUrl: "https://developer.x.com/en/portal/dashboard",
      pricingUrl: "https://docs.x.com/x-api/getting-started/pricing",
      scopesUrl: "https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code",
      permissionsNote:
        "App User authentication settings must be set to 'Read and write " +
        "'Read and write' for the W 'engage' timeline actions tier, and at least 'Read' for " +
        "users.read-only profile linking. After changing permissions you " +
        "MUST regenerate the OAuth 2.0 Client ID and Client Secret in " +
        "Keys and tokens — existing credentials do NOT inherit new " +
        "permissions and will keep returning 403 from /2/users/me until " +
        "they are rotated.",
      fixOrder: [
        "Open https://console.x.com and select the app whose Client ID ends in " +
          (clientId ? clientId.slice(-4) : "????") +
          ".",
        "Open User authentication settings → confirm App permissions (Read " +
          "and write for the engage timeline actions tier), Type of App " +
          "= Web App, and Callback URL exactly matches " +
          (redirectUri || "<redirect URI>") +
          ". Click Save even if nothing changed — it re-provisions v2 access.",
        "Open Keys and tokens → under OAuth 2.0 Client ID and Client Secret, " +
          "click Regenerate. Copy the new values into the server env " +
          "(TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET) and redeploy.",
        "Confirm the X account being linked is not suspended, locked, or " +
          "under an age-restriction gate — /2/users/me returns 403 for " +
          "those accounts even with a valid token.",
        "Retry the connect flow and watch the /auth self-test panel below " +
          "to confirm the app has v2 access before trying the user flow.",
      ],
    },
  });
});

/**
 * Admin self-test: make a real call to the v2 API using the configured
 * app-only Bearer token (X_BEARER_TOKEN / TWITTER_BEARER_TOKEN). This
 * isolates app-level v2 access from OAuth 2.0 user-context problems:
 *
 *   - 200 OK here + 403 on /users/me during login ⇒ app HAS v2 access, the
 *     OAuth 2.0 Client ID/Secret are stale (regenerate them) OR the linked
 *     X account is suspended/locked.
 *   - 403 here too ⇒ the whole app has no v2 access (not on Pay-Per-Use,
 *     not activated, or suspended). Fix in the Console first.
 *   - No bearer configured ⇒ we can't self-test; still a useful signal.
 */
router.get("/api/auth/twitter-oauth2/diagnostics/self-test", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  try {
    const allowed = await hasPermission(user?.roles ?? user?.role, "manage_roles");
    if (!allowed) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
  } catch (err) {
    console.error("[auth] twitter oauth2 self-test permission check failed:", err);
    return res.status(500).json({ error: "Permission check failed" });
  }

  const bearer = (
    process.env.X_BEARER_TOKEN ||
    process.env.TWITTER_BEARER_TOKEN ||
    ""
  ).trim();
  if (!bearer) {
    return res.json({
      ok: false,
      configured: false,
      message:
        "No X_BEARER_TOKEN / TWITTER_BEARER_TOKEN configured on the server. " +
        "Set one of these to your app's OAuth 2.0 App-only Bearer Token " +
        "(Keys and tokens → Bearer Token) so this endpoint can verify v2 " +
        "access independent of any user.",
    });
  }

  const base = process.env.X_API_BASE_URL?.trim() || "https://api.x.com/2";
  // /2/users/by/username/X is app-only-auth-capable and effectively free
  // under Pay-Per-Use deduplication (same resource inside 24h = 1 charge).
  const probeUrl = `${base}/users/by/username/X`;
  try {
    const response = await fetch(probeUrl, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const bodyText = await response.text().catch(() => "");
    let payload: any = {};
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      payload = {};
    }
    return res.json({
      ok: response.ok,
      configured: true,
      status: response.status,
      probeUrl,
      body: payload,
      bodyRaw: response.ok ? undefined : bodyText.slice(0, 1000),
      interpretation: response.ok
        ? "App has v2 read access. If /users/me is still 403, the OAuth 2.0 " +
          "Client ID/Secret are stale — regenerate them, or the user's X " +
          "account is locked/suspended."
        : response.status === 401
          ? "Bearer token is invalid. Regenerate the App-only Bearer Token " +
            "in Keys and tokens and update X_BEARER_TOKEN / TWITTER_BEARER_TOKEN."
          : response.status === 402
            ? "Pay-Per-Use credits missing or plan not active. Open console.x.com " +
              "→ Billing and confirm the app is on the active plan."
            : response.status === 403
              ? "App has no v2 access at all. Resave User authentication " +
                "settings in console.x.com → your app, regenerate credentials, " +
                "and confirm the app is not suspended."
              : response.status === 429
                ? "Rate-limited, retry in a minute."
                : `Unexpected status ${response.status} — see bodyRaw for X's error.`,
    });
  } catch (err: any) {
    console.error("[auth] twitter oauth2 self-test request failed:", err);
    return res.status(502).json({
      ok: false,
      configured: true,
      error: "request_failed",
      message: String(err?.message || err),
    });
  }
});

router.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    const username = typeof req.body.username === "string"
      ? req.body.username.trim().toLowerCase()
      : "";

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    if (username.length < 3 || username.length > 50) {
      return res
        .status(400)
        .json({ error: "Username must be 3-50 characters" });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: "Username already taken" });
    }

    if (email) {
      const existingEmail = await getUserByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      username,
      email: email || undefined,
      passwordHash,
      displayName: displayName || username,
      role: "witness",
    });
    if (!user) return res.status(500).json({ error: "Failed to create user" });

    loginWithSessionRegen(req, user, async (err) => {
      if (err) return res.status(500).json({ error: "Login failed" });
      await emitAuthEvent("auth.register.succeeded", user, "local-register", {
        method: "local",
      });
      await emitWelcomeEventIfNeeded(user, "local-register");
      await emitGmWelcomeEventIfNeeded(user, "local-register");
      refreshDossierInBackground(user.id, "register");
      res.status(201).json(await toSafeUserWithPermissions(user));
    });
  } catch (err) {
    console.error("Registration error:", err);
    const classified = classifyDbError(err);
    if (classified) {
      return res.status(classified.status).json({ error: classified.error });
    }
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/api/auth/login", (req, res, next) => {
  passport.authenticate(
    "local",
    (err: Error | null, user: any, _info: any) => {
      if (err) {
        console.error("[auth] login strategy error:", err);
        const classified = classifyDbError(err);
        if (classified) {
          return res.status(classified.status).json({ error: classified.error });
        }
        return res.status(500).json({ error: "Login failed" });
      }
      if (!user)
        return res.status(401).json({ error: "Invalid credentials" });
      loginWithSessionRegen(req, user, async (loginErr) => {
        if (loginErr) {
          console.error("[auth] session login error:", loginErr);
          const classified = classifyDbError(loginErr);
          if (classified) {
            return res.status(classified.status).json({ error: classified.error });
          }
          return res.status(500).json({ error: "Session creation failed" });
        }
        await emitAuthEvent("auth.login.succeeded", user, "local-login", {
          method: "local",
        });
        await emitWelcomeEventIfNeeded(user, "local-login");
        await emitGmWelcomeEventIfNeeded(user, "local-login");
        refreshDossierInBackground(user?.id, "login");
        res.json(await toSafeUserWithPermissions(user));
      });
    }
  )(req, res, next);
});

router.post("/api/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }

    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        return res.status(500).json({ error: "Failed to end session" });
      }

      res.clearCookie("connect.sid");
      return res.json({ ok: true });
    });
  });
});

router.get("/api/auth/user", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  res.json(await toSafeUserWithPermissions(user));
});

router.post("/api/auth/welcome/complete", isAuthenticated, async (req, res) => {
  try {
    const reqUser = req.user as any;
    if (!reqUser?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const fresh = await getUserById(reqUser.id);
    if (!fresh) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = fresh.welcomedToWtfOs
      ? fresh
      : await markUserWelcomedToWtfOs(fresh.id);

    if (!fresh.welcomedToWtfOs) {
      await emitAuthEvent(AUTH_WELCOME_COMPLETED_EVENT_TYPE, user, "welcome", {
        method: "acknowledge",
      });
    }

    res.json(await toSafeUserWithPermissions(user));
  } catch (err) {
    console.error("[auth] welcome completion error:", err);
    const classified = classifyDbError(err);
    if (classified) {
      return res.status(classified.status).json({ error: classified.error });
    }
    res.status(500).json({ error: "Failed to complete welcome" });
  }
});

router.post("/api/auth/gm-welcome/complete", isAuthenticated, async (req, res) => {
  try {
    const reqUser = req.user as any;
    if (!reqUser?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const utcDay = currentGmWelcomeUtcDay();
    const fresh = await getUserById(reqUser.id);
    if (!fresh) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = fresh.gmWelcomeUtcDay === utcDay
      ? fresh
      : await markUserGmWelcomeForUtcDay(fresh.id, utcDay);

    if (fresh.gmWelcomeUtcDay !== utcDay) {
      await emitAuthEvent(
        AUTH_GM_WELCOME_COMPLETED_EVENT_TYPE,
        user,
        "gm-welcome",
        {
          method: "acknowledge",
          utcDay,
        }
      );
    }

    res.json(await toSafeUserWithPermissions(user));
  } catch (err) {
    console.error("[auth] GM welcome completion error:", err);
    const classified = classifyDbError(err);
    if (classified) {
      return res.status(classified.status).json({ error: classified.error });
    }
    res.status(500).json({ error: "Failed to complete GM welcome" });
  }
});

router.get(
  "/api/auth/gm-welcome/assets/:filename",
  isAuthenticated,
  async (req, res) => {
    try {
      const filename = Array.isArray(req.params.filename)
        ? req.params.filename[0]
        : req.params.filename;
      if (!filename) {
        return res.status(404).json({ error: "GM NFT asset not found" });
      }
      await serveGmWelcomeAsset(filename, res);
    } catch (err) {
      console.error("[auth] GM NFT asset error:", err);
      res.status(500).json({ error: "Failed to serve GM NFT asset" });
    }
  }
);

/**
 * Change (or set, for wallet-only accounts) the local login password.
 *
 * Required body:
 *   • newPassword       — min 8 characters.
 *   • currentPassword   — required *only* if the account already has
 *                         a password hash on file.  Accounts created
 *                         via wallet or social login without a
 *                         password may use this endpoint to set one
 *                         for the first time.
 *
 * On success, other active sessions belonging to this user are
 * best-effort invalidated so a stolen password stops working
 * immediately.  The current session is preserved.
 */
router.post("/api/auth/change-password", isAuthenticated, async (req, res) => {
  try {
    const reqUser = req.user as any;
    if (!reqUser?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const currentPassword =
      typeof req.body?.currentPassword === "string"
        ? req.body.currentPassword
        : "";

    if (!newPassword) {
      return res.status(400).json({ error: "New password is required" });
    }
    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError) {
      return res.status(400).json({ error: newPasswordError });
    }

    // Re-fetch the user so we see the current passwordHash (req.user
    // can be stale after earlier updates in the same session).
    const fresh = await getUserById(reqUser.id);
    if (!fresh) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const tempPasswordHash = fresh.tempPasswordHash;
    const tempPasswordExpiresAt = fresh.tempPasswordExpiresAt;
    const hasActiveTempPassword =
      Boolean(tempPasswordHash) &&
      tempPasswordExpiresAt !== null &&
      tempPasswordExpiresAt > new Date();

    if (fresh.passwordHash || hasActiveTempPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ error: "Current password is required" });
      }
      const matchesStoredPassword = fresh.passwordHash
        ? await comparePasswords(currentPassword, fresh.passwordHash)
        : false;
      const matchesTempPassword =
        !matchesStoredPassword && hasActiveTempPassword && tempPasswordHash
          ? await comparePasswords(currentPassword, tempPasswordHash)
          : false;
      const matches = matchesStoredPassword || matchesTempPassword;
      if (!matches) {
        return res
          .status(401)
          .json({ error: "Current password is incorrect" });
      }
      if (newPassword === currentPassword) {
        return res
          .status(400)
          .json({ error: "New password must be different from the current one" });
      }
    }

    const newHash = await hashPassword(newPassword);
    await updateUserPassword(fresh.id, newHash);
    if (fresh.tempPasswordHash) {
      await clearUserTempPassword(fresh.id);
    }

    // Best-effort: kill every session that belongs to this user except
    // the one we're currently using.  connect-pg-simple stores the
    // Passport user id at sess.passport.user.  Failures here are
    // logged but do not block the password change.
    const currentSid = (req.session as any)?.id || req.sessionID || null;
    try {
      if (currentSid) {
        await pool.query(
          `DELETE FROM session
             WHERE sess->'passport'->>'user' = $1
               AND sid <> $2`,
          [String(fresh.id), currentSid]
        );
      } else {
        await pool.query(
          `DELETE FROM session
             WHERE sess->'passport'->>'user' = $1`,
          [String(fresh.id)]
        );
      }
    } catch (sessionErr) {
      console.warn(
        "[auth] could not invalidate other sessions after password change:",
        sessionErr
      );
    }

    res.json({ ok: true, hasPassword: true });
  } catch (err) {
    console.error("[auth] change-password error:", err);
    const classified = classifyDbError(err);
    if (classified) {
      return res.status(classified.status).json({ error: classified.error });
    }
    res.status(500).json({ error: "Password change failed" });
  }
});

// ─── Wallet Auth (challenge-response) ────────────────────

router.post("/api/auth/wallet/challenge", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || typeof walletAddress !== "string" || !walletAddress.startsWith("tz")) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const nonce = await createWalletAuthNonce(walletAddress);
    const message = buildChallengeMessage(nonce);

    res.json({ nonce, message });
  } catch (err) {
    console.error("[auth] wallet challenge error:", err);
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

router.post("/api/auth/wallet/verify", async (req, res) => {
  try {
    const { walletAddress, publicKey, signature, nonce } = req.body;

    console.log("[auth] wallet verify attempt:", {
      walletAddress: walletAddress?.slice(0, 10),
      publicKey: publicKey ? `${publicKey.slice(0, 8)}...(${publicKey.length}c)` : "<empty>",
      signature: signature ? `${signature.slice(0, 8)}...(${signature.length}c)` : "<empty>",
      nonce: nonce?.slice(0, 8),
    });

    if (!walletAddress || !signature || !nonce) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!publicKey) {
      return res.status(400).json({ error: "Wallet did not provide a public key. Please try reconnecting your wallet." });
    }

    const derivedAddress = publicKeyToAddress(publicKey);
    const resolvedAddress = derivedAddress || walletAddress;

    console.log("[auth] resolved address:", resolvedAddress, "derived:", derivedAddress, "client:", walletAddress);

    const valid = await consumeWalletAuthNonce(walletAddress, nonce);
    if (!valid) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }

    const message = buildChallengeMessage(nonce);
    const sigValid = verifyWalletSignature(message, signature, publicKey);
    if (!sigValid) {
      console.error("[auth] signature verification failed for", walletAddress, "pk:", publicKey.slice(0, 10));
      return res.status(401).json({ error: "Signature verification failed" });
    }

    let existingUser = await getUserByWalletAddress(resolvedAddress);
    if (!existingUser && resolvedAddress !== walletAddress) {
      existingUser = await getUserByWalletAddress(walletAddress);
    }

    if (existingUser) {
      loginWithSessionRegen(req, existingUser, async (err) => {
        if (err) {
          console.error("[auth] wallet login session error:", err);
          return res.status(500).json({ error: "Session creation failed" });
        }
        await emitAuthEvent("auth.login.succeeded", existingUser, "wallet-login", {
          method: "wallet",
        });
        await emitWelcomeEventIfNeeded(existingUser, "wallet-login");
        await emitGmWelcomeEventIfNeeded(existingUser, "wallet-login");
        refreshDossierInBackground(existingUser!.id, "wallet-login");
        res.json({
          action: "login",
          user: await toSafeUserWithPermissions(existingUser!),
        });
      });
    } else {
      res.json({
        action: "register",
        walletAddress: resolvedAddress,
        publicKey,
      });
    }
  } catch (err) {
    console.error("[auth] wallet verify error:", err);
    const classified = classifyDbError(err);
    if (classified) return res.status(classified.status).json({ error: classified.error });
    res.status(500).json({ error: "Wallet verification failed" });
  }
});

router.post("/api/auth/wallet/register", async (req, res) => {
  try {
    const { walletAddress, publicKey, signature, nonce, username, password } = req.body;

    if (!walletAddress || !publicKey || !signature || !nonce || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedUsername = typeof username === "string" ? username.trim().toLowerCase() : "";
    if (!normalizedUsername || normalizedUsername.length < 3 || normalizedUsername.length > 50) {
      return res.status(400).json({ error: "Username must be 3-50 characters" });
    }

    if (password !== undefined && password !== null && password !== "") {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
    }

    const derivedAddr = publicKeyToAddress(publicKey);
    const resolvedAddr = derivedAddr || walletAddress;

    const valid = await consumeWalletAuthNonce(walletAddress, nonce);
    if (!valid) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }

    const message = buildChallengeMessage(nonce);
    const sigValid = verifyWalletSignature(message, signature, publicKey);
    if (!sigValid) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    const existingWalletUser = await getUserByWalletAddress(resolvedAddr) || await getUserByWalletAddress(walletAddress);
    if (existingWalletUser) {
      return res.status(409).json({ error: "Wallet is already linked to an account" });
    }

    const existingName = await getUserByUsername(normalizedUsername);
    if (existingName) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = password ? await hashPassword(password) : undefined;
    const user = await createUser({
      username: normalizedUsername,
      passwordHash,
      displayName: normalizedUsername,
      role: "witness",
    });
    if (!user) return res.status(500).json({ error: "Failed to create user" });

    const { db: dbRef } = await import("../db");
    const { userWallets } = await import("@shared/schema");
    await dbRef.insert(userWallets).values({
      userId: user.id,
      walletAddress: resolvedAddr,
      isPrimary: true,
    });

    loginWithSessionRegen(req, user, async (err) => {
      if (err) {
        console.error("[auth] wallet register session error:", err);
        return res.status(500).json({ error: "Session creation failed" });
      }
      await emitAuthEvent("auth.register.succeeded", user, "wallet-register", {
        method: "wallet",
      });
      await emitWelcomeEventIfNeeded(user, "wallet-register");
      await emitGmWelcomeEventIfNeeded(user, "wallet-register");
      refreshDossierInBackground(user.id, "wallet-register");
      res.status(201).json({
        action: "registered",
        user: await toSafeUserWithPermissions(user),
      });
    });
  } catch (err) {
    console.error("[auth] wallet register error:", err);
    const classified = classifyDbError(err);
    if (classified) return res.status(classified.status).json({ error: classified.error });
    res.status(500).json({ error: "Registration failed" });
  }
});

if (process.env.GITHUB_CLIENT_ID) {
  router.get(
    "/api/auth/github",
    passport.authenticate("github", { scope: ["user:email"] })
  );
  router.get(
    "/api/auth/github/callback",
    oauthLoginCallback("github", "/dashboard", "/login")
  );
}

if (legacyTwitterOAuthEnabled()) {
  router.get(
    "/api/auth/twitter",
    isAuthenticated,
    passport.authenticate("twitter-verify"),
  );
  router.get(
    "/api/auth/twitter/callback",
    oauthVerifyCallback("twitter-verify", "verified=twitter", "error=twitter"),
  );
} else {
  router.get("/api/auth/twitter", isAuthenticated, (_req, res) => {
    res.redirect(profileRedirect("error=twitter_not_configured"));
  });
  router.get("/api/auth/twitter/callback", (_req, res) => {
    res.redirect(profileRedirect("error=twitter_not_configured"));
  });
}

router.get("/api/auth/twitter-oauth2", isAuthenticated, (req, res) => {
  try {
    const clientId = getTwitterOAuth2ClientId();
    if (!clientId) {
      return res.redirect(profileRedirect("error=twitter_oauth2_not_configured"));
    }

    const scopes = selectedTwitterScopes(req.query.tier, req.query.scopes);
    const state = base64Url(randomBytes(24));
    const codeVerifier = base64Url(randomBytes(48));
    const challenge = base64Url(createHash("sha256").update(codeVerifier).digest());
    const redirectUri = twitterOAuth2CallbackUrl();
    const returnTo =
      typeof req.query.returnTo === "string" && req.query.returnTo in TWITTER_OAUTH2_RETURN_TARGETS
        ? req.query.returnTo
        : "profile";
    const expectedHandle = normalizeTwitterOAuth2Handle(req.query.expectedHandle);

    (req.session as any).twitterOauth2 = {
      state,
      codeVerifier,
      scopes,
      createdAt: Date.now(),
      returnTo,
      redirectUri,
      expectedHandle,
    };

    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    const authorizeUrl = `${X_OAUTH2_AUTH_URL}?${query.toString()}`;

    // Persist session before redirecting. With connect-pg-simple the INSERT is
    // asynchronous; relying on the implicit end-of-response save was racy when
    // the browser (or an over-eager SW) followed the 302 before Postgres
    // committed. An explicit save guarantees the state + verifier are durable
    // by the time Twitter hands control back to our callback.
    return req.session.save((saveErr) => {
      if (saveErr) {
        console.error("[auth] twitter oauth2 session save failed:", saveErr);
        return res.redirect(profileRedirect("error=twitter_oauth2_session"));
      }
      return res.redirect(authorizeUrl);
    });
  } catch (err) {
    console.error("[auth] twitter oauth2 start failed:", err);
    return res.redirect(profileRedirect("error=twitter_oauth2"));
  }
});

router.get("/api/auth/twitter-oauth2/callback", isAuthenticated, async (req, res) => {
  const sessionState = (req.session as any).twitterOauth2;
  const returnTo =
    (typeof sessionState?.returnTo === "string" && sessionState.returnTo) || "profile";
  const fail = (errCode: string) => twitterOAuth2Redirect(returnTo, `error=${errCode}`);

  try {
    const expectedState = String(sessionState?.state || "");
    const providedState = String(req.query.state || "");
    const code = String(req.query.code || "");
    const createdAt = Number(sessionState?.createdAt || 0);
    const storedRedirectUri = String(sessionState?.redirectUri || twitterOAuth2CallbackUrl());
    const expectedHandle = normalizeTwitterOAuth2Handle(sessionState?.expectedHandle);

    delete (req.session as any).twitterOauth2;

    // Twitter returns ?error=... when the user declines or the app is
    // misconfigured (for example redirect_uri mismatch, missing OAuth2 creds,
    // or an unsupported scope). Preserve that error on the fail redirect so
    // the operator sees which step failed without having to decode logs.
    const twitterError =
      typeof req.query.error === "string" ? req.query.error.trim() : "";
    if (twitterError) {
      console.warn(
        `[auth] twitter oauth2 callback returned from X with error=${twitterError} description=${String(
          req.query.error_description || ""
        )}`
      );
      return res.redirect(fail(`twitter_oauth2_x_${twitterError}`));
    }

    if (!expectedState) {
      console.warn(
        "[auth] twitter oauth2 callback missing session state (session lost or never saved)"
      );
      return res.redirect(fail("twitter_oauth2_session"));
    }
    if (expectedState !== providedState || !code) {
      console.warn("[auth] twitter oauth2 callback state/code mismatch");
      return res.redirect(fail("twitter_oauth2_state"));
    }
    if (!createdAt || Date.now() - createdAt > 10 * 60 * 1000) {
      return res.redirect(fail("twitter_oauth2_expired"));
    }

    let token: Awaited<ReturnType<typeof exchangeTwitterOAuth2Code>>;
    try {
      token = await exchangeTwitterOAuth2Code({
        code,
        codeVerifier: String(sessionState.codeVerifier || ""),
        redirectUri: storedRedirectUri,
      });
    } catch (exchangeErr) {
      console.error("[auth] twitter oauth2 token exchange failed:", exchangeErr);
      return res.redirect(fail("twitter_oauth2_token"));
    }
    if (!token.access_token) {
      return res.redirect(fail("twitter_oauth2_token"));
    }

    // Log exactly which scopes X granted. If we requested `users.read` but
    // the token response comes back with only `tweet.read`, X silently
    // dropped users.read (usually because the app's User-auth scope list
    // in the Developer Portal doesn't include it). Matters because a 403
    // on /users/me with "users.read granted" implies a v2 Project issue;
    // a 403 with users.read MISSING implies a portal scope-enablement
    // issue. Surface both in the log so the operator knows which to fix.
    console.log(
      `[auth] twitter oauth2 token received: requested_scopes=${(sessionState.scopes || []).join(" ")} granted_scope=${String(token.scope || "")} expires_in=${token.expires_in ?? "?"}`
    );

    const requestedScopeList = Array.isArray(sessionState.scopes)
      ? sessionState.scopes.map((scope: unknown) => String(scope || "").trim()).filter(Boolean)
      : [];
    const grantedScopeList = String(token.scope || "")
      .split(/[\s,]+/)
      .map((scope: string) => scope.trim())
      .filter(Boolean);
    if (grantedScopeList.length > 0) {
      const granted = new Set(grantedScopeList);
      const missingScopes = requestedScopeList
        .filter((scope: string) => scope !== "offline.access")
        .filter((scope: string) => !granted.has(scope));
      if (missingScopes.length > 0) {
        console.error(
          `[auth] twitter oauth2 scope mismatch: requested_scopes=${requestedScopeList.join(" ")} granted_scope=${grantedScopeList.join(" ")} missing_scopes=${missingScopes.join(" ")}`
        );
        return res.redirect(
          twitterOAuth2Redirect(
            returnTo,
            `error=twitter_oauth2_scope_missing&missing=${encodeURIComponent(missingScopes.join(" "))}`
          )
        );
      }
    }

    let me: Awaited<ReturnType<typeof fetchTwitterOAuth2Me>>;
    try {
      me = await fetchTwitterOAuth2Me(token.access_token);
    } catch (meErr) {
      if (meErr instanceof TwitterOAuth2MeError) {
        // Log the full status + body so operators can see whether X sent
        // 401 (bad token / missing users.read), 402 (Pay-Per-Use credits
        // exhausted or app not activated on new plan), 403 (app lacks the
        // users.read permission or app not in a v2 Project), 429 (rate
        // limit), or a 5xx.
        console.error(
          `[auth] twitter oauth2 /users/me failed status=${meErr.status} granted_scope=${String(token.scope || "")} body=${meErr.bodyText.slice(0, 500)}`
        );
        const bucket =
          meErr.status === 401
            ? "401"
            : meErr.status === 402
              ? "402"
              : meErr.status === 403
                ? "403"
                : meErr.status === 429
                  ? "429"
                  : meErr.status >= 500
                    ? "5xx"
                    : String(meErr.status);
        return res.redirect(fail(`twitter_oauth2_me_${bucket}`));
      }
      console.error("[auth] twitter oauth2 /users/me failed:", meErr);
      return res.redirect(fail("twitter_oauth2_me"));
    }

    const user = req.user as any;
    const scopes = token.scope || (sessionState.scopes || []).join(" ");
    const expiresAt = token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000)
      : null;
    const actualHandle = normalizeTwitterOAuth2Handle(me?.username || "");
    if (expectedHandle && expectedHandle !== actualHandle) {
      const actualLabel = actualHandle || "unknown";
      console.warn(
        `[auth] twitter oauth2 wrong account: user=${user?.id} expected=@${expectedHandle} actual=@${actualLabel}`
      );
      return res.redirect(
        twitterOAuth2Redirect(
          returnTo,
          `error=twitter_oauth2_wrong_account&expected=${encodeURIComponent(expectedHandle)}&actual=${encodeURIComponent(actualLabel)}`
        )
      );
    }

    // Profile and W store tokens in the same columns. Without this guard,
    // a Profile re-link (narrow scopes: tweet.read users.read) would
    // overwrite an existing W timeline-actions token (broad: tweet.write
    // like.write offline.access ...), silently revoking the user's ability
    // to reply, like, quote, or repost from W. We preserve the
    // existing token whenever the new one is the same X identity AND a
    // strict subset of what's already stored.
    const newScopesList = String(scopes)
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
    const existingScopes = new Set(
      String(user.twitterOauth2Scopes || "")
        .split(/[\s,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean)
    );
    const sameTwitterUser = Boolean(
      user.twitterId && me?.id && String(user.twitterId) === String(me.id)
    );
    const existingCoversNew =
      newScopesList.length > 0 && newScopesList.every((scope) => existingScopes.has(scope));
    const existingIsBroader = Array.from(existingScopes).some(
      (scope) => !newScopesList.includes(scope)
    );
    const keepExistingToken = Boolean(
      user.twitterOauth2AccessToken &&
        sameTwitterUser &&
        existingCoversNew &&
        existingIsBroader
    );

    const updateSet: Record<string, unknown> = {
      twitterId: me?.id || user.twitterId || null,
      twitterHandle: me?.username || user.twitterHandle || null,
      twitterVerified: true,
      updatedAt: new Date(),
    };
    if (!keepExistingToken) {
      updateSet.twitterOauth2AccessToken = encryptOAuthSecret(token.access_token);
      updateSet.twitterOauth2RefreshToken = token.refresh_token
        ? encryptOAuthSecret(token.refresh_token)
        : user.twitterOauth2RefreshToken || null;
      updateSet.twitterOauth2Scopes = scopes;
      updateSet.twitterOauth2ExpiresAt = expiresAt;
    } else {
      console.log(
        `[auth] twitter oauth2 callback: keeping existing broader token for user=${user.id} ` +
          `existing_scopes="${user.twitterOauth2Scopes}" new_scopes="${scopes}"`
      );
    }

    const [updated] = await db
      .update(users)
      .set(updateSet)
      .where(eq(users.id, user.id))
      .returning();

    await new Promise<void>((resolve, reject) => {
      req.login(updated, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    runXConnectOnboardingSoon({
      id: updated.id,
      twitterId: updated.twitterId,
      twitterHandle: updated.twitterHandle,
    });

    return res.redirect(twitterOAuth2Redirect(returnTo, "verified=twitter_oauth2"));
  } catch (err) {
    console.error("[auth] twitter oauth2 callback failed:", err);
    return res.redirect(fail("twitter_oauth2"));
  }
});

if (
  process.env.DISCORD_CLIENT_ID?.trim() &&
  process.env.DISCORD_CLIENT_SECRET?.trim()
) {
  router.get(
    "/api/auth/discord",
    isAuthenticated,
    passport.authenticate("discord-verify"),
  );
  router.get(
    "/api/auth/discord/callback",
    oauthVerifyCallback("discord-verify", "verified=discord", "error=discord"),
  );
} else {
  router.get("/api/auth/discord", isAuthenticated, (_req, res) => {
    res.redirect(profileRedirect("error=discord_not_configured"));
  });
  router.get("/api/auth/discord/callback", (_req, res) => {
    res.redirect(profileRedirect("error=discord_not_configured"));
  });
}

export default router;
