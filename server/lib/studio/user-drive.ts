/**
 * Lifecycle helpers around per-user `studio_storage_accounts` rows that
 * back each Studio member's own Google Drive connection.
 *
 * Shape C (hybrid) model — a user who has connected their own Drive is
 * preferred as the backing store for *new* projects they create.  The
 * platform pool (`studio_platform_storage`) is used as the fallback
 * when the creator has no personal connection.
 *
 * Each row keyed by (userId, 'google_drive') holds:
 *   - encrypted OAuth refresh token (sealed with `STUDIO_CRYPTO_KEY`)
 *   - cached access token + expiry for single-process reuse
 *   - the account's email (for display)
 *   - the granted scopes
 *
 * Quota is NOT persisted on the row — we pull it fresh from Drive on
 * status checks so users see accurate remaining-space numbers.  To keep
 * the hot path cheap, we cache the last-seen quota in memory.
 *
 * Projects created against a user's Drive store `gdriveOwner = <userId>`
 * in their `storage_context` — the driver reads that to pick the right
 * client (user vs platform) on every upload / stream / delete.
 *
 * Layout in the user's Drive:
 *   My Drive/
 *     p{projectId}-{safeName}/
 *       original-...
 *       preview-...
 *       thumbnail-...
 *
 * We do NOT create a shared "WTF-Studio" folder — each project folder
 * lives directly under My Drive so users can see and clean them up
 * independently.  Drive's reserved id "root" is the parent we use.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { studioStorageAccounts } from "@shared/schema";
import { openSecret, sealSecret, isStudioCryptoConfigured } from "./crypto";
import {
  GoogleDriveClient,
  STUDIO_DRIVE_SCOPES,
  buildAuthorizeUrl,
  exchangeAuthCode,
  revokeToken,
  type DriveOAuthTokens,
  type OAuthClientConfig,
} from "./drivers/google-drive-client";
import {
  isGoogleOAuthConfigured,
  getGoogleOAuthConfig,
} from "./platform-drive";

/* ── Env helpers ────────────────────────────────────────── */

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

/**
 * The user-side OAuth flow uses its own redirect URI so the callback
 * routes can be cleanly separated from the admin flow (both URIs must
 * be registered in the Google Cloud Console).  Falls back to the
 * platform redirect URI only for dev setups that have a single URL —
 * in that case the callback must be mounted at the shared path.
 */
export function getUserOAuthConfig(): OAuthClientConfig {
  const base = getGoogleOAuthConfig();
  const userRedirect = readEnv("GOOGLE_OAUTH_USER_REDIRECT_URI");
  return {
    ...base,
    redirectUri: userRedirect || base.redirectUri,
  };
}

export function isUserDriveConfigured(): boolean {
  // Same env + crypto requirements as the platform flow; the user
  // redirect URI is optional in dev (see getUserOAuthConfig).
  return isGoogleOAuthConfigured() && isStudioCryptoConfigured();
}

export function hasDedicatedUserRedirect(): boolean {
  return Boolean(readEnv("GOOGLE_OAUTH_USER_REDIRECT_URI"));
}

/* ── DB row helpers ─────────────────────────────────────── */

export interface UserDriveRow {
  id: number;
  userId: number;
  backend: "google_drive";
  accountEmail: string | null;
  scopes: string | null;
  credentialCipher: string;
  credentialNonce: string;
  expiresAt: Date | null;
  lastRefreshedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

async function loadUserRow(userId: number): Promise<UserDriveRow | null> {
  const [row] = await db
    .select()
    .from(studioStorageAccounts)
    .where(
      and(
        eq(studioStorageAccounts.userId, userId),
        eq(studioStorageAccounts.backend, "google_drive")
      )
    )
    .limit(1);
  return (row as unknown as UserDriveRow) ?? null;
}

/** Public, secret-free summary suitable for the Studio UI. */
export async function getUserDriveStatus(userId: number): Promise<{
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  scopes: string | null;
  connectedAt: Date | null;
  lastRefreshedAt: Date | null;
  quota: { limit: number | null; usage: number | null } | null;
  hasDedicatedRedirect: boolean;
}> {
  const configured = isUserDriveConfigured();
  const row = await loadUserRow(userId);
  if (!row) {
    return {
      configured,
      connected: false,
      accountEmail: null,
      scopes: null,
      connectedAt: null,
      lastRefreshedAt: null,
      quota: null,
      hasDedicatedRedirect: hasDedicatedUserRedirect(),
    };
  }
  const quota = userQuotaCache.get(userId) ?? null;
  return {
    configured,
    connected: true,
    accountEmail: row.accountEmail,
    scopes: row.scopes,
    connectedAt: row.createdAt,
    lastRefreshedAt: row.lastRefreshedAt,
    quota,
    hasDedicatedRedirect: hasDedicatedUserRedirect(),
  };
}

/* ── OAuth dance ────────────────────────────────────────── */

export function buildUserConnectUrl(state: string, loginHint?: string): string {
  return buildAuthorizeUrl(getUserOAuthConfig(), {
    scopes: STUDIO_DRIVE_SCOPES,
    state,
    loginHint,
  });
}

export async function completeUserConnect(opts: {
  userId: number;
  code: string;
}): Promise<UserDriveRow> {
  const cfg = getUserOAuthConfig();
  const tokens = await exchangeAuthCode(cfg, opts.code);

  // Probe the connection once to populate the account email + quota
  // cache.  We never block on failures here — diagnostics only.
  const probeClient = new GoogleDriveClient({ oauth: cfg, tokens });
  const [email, quota] = await Promise.all([
    probeClient.getOwnerEmail().catch(() => null),
    probeClient.getQuota().catch(() => null),
  ]);
  if (quota) {
    userQuotaCache.set(opts.userId, {
      limit: quota.limit,
      usage: quota.usage,
    });
  }

  const sealed = sealSecret(
    JSON.stringify({
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken ?? null,
      expiresAt: tokens.expiresAt ?? null,
    })
  );
  const now = new Date();

  const existing = await loadUserRow(opts.userId);
  if (existing) {
    // Revoke any older refresh token quietly so the user doesn't end
    // up with a stray delegation after re-consenting.
    try {
      const oldCred = decryptCred(existing);
      if (
        oldCred.refreshToken &&
        oldCred.refreshToken !== tokens.refreshToken
      ) {
        await revokeToken(oldCred.refreshToken);
      }
    } catch {
      /* old token might be undecryptable if the crypto key rotated */
    }
    const [updated] = await db
      .update(studioStorageAccounts)
      .set({
        accountEmail: email ?? existing.accountEmail,
        scopes: tokens.scopes ?? STUDIO_DRIVE_SCOPES.join(" "),
        credentialCipher: sealed.cipher,
        credentialNonce: sealed.nonce,
        expiresAt:
          tokens.expiresAt != null ? new Date(tokens.expiresAt) : null,
        lastRefreshedAt: now,
        updatedAt: now,
      })
      .where(eq(studioStorageAccounts.id, existing.id))
      .returning();
    invalidateUserCache(opts.userId);
    return updated as unknown as UserDriveRow;
  }

  const [inserted] = await db
    .insert(studioStorageAccounts)
    .values({
      userId: opts.userId,
      backend: "google_drive",
      accountEmail: email,
      scopes: tokens.scopes ?? STUDIO_DRIVE_SCOPES.join(" "),
      credentialCipher: sealed.cipher,
      credentialNonce: sealed.nonce,
      expiresAt: tokens.expiresAt != null ? new Date(tokens.expiresAt) : null,
      lastRefreshedAt: now,
    })
    .returning();
  invalidateUserCache(opts.userId);
  return inserted as unknown as UserDriveRow;
}

export async function disconnectUserDrive(userId: number): Promise<void> {
  const row = await loadUserRow(userId);
  if (!row) return;
  try {
    const cred = decryptCred(row);
    if (cred.refreshToken) await revokeToken(cred.refreshToken);
  } catch {
    /* revoke best-effort */
  }
  await db
    .delete(studioStorageAccounts)
    .where(eq(studioStorageAccounts.id, row.id));
  invalidateUserCache(userId);
  userQuotaCache.delete(userId);
}

export async function refreshUserQuota(userId: number): Promise<{
  limit: number | null;
  usage: number | null;
} | null> {
  const resolved = await getOrLoadUserDriveClient(userId).catch(() => null);
  if (!resolved) return null;
  const quota = await resolved.client.getQuota().catch(() => null);
  if (!quota) return null;
  userQuotaCache.set(userId, { limit: quota.limit, usage: quota.usage });
  return { limit: quota.limit, usage: quota.usage };
}

/* ── Authenticated client cache ─────────────────────────── */

/**
 * Per-user client + quota caches.  We hold one `GoogleDriveClient` per
 * userId in memory so back-to-back requests reuse the same access token
 * and only trigger a refresh when it genuinely expires.
 */
const userClientCache = new Map<
  number,
  { client: GoogleDriveClient; rootFolderId: string; loadedAt: number }
>();

const userQuotaCache = new Map<
  number,
  { limit: number | null; usage: number | null }
>();

function invalidateUserCache(userId: number): void {
  userClientCache.delete(userId);
}

/**
 * Lightweight readiness check without actually hitting Drive.  Returns
 * true iff the user has a row we can decrypt + the OAuth env is set.
 * Intended for hot-path dispatch decisions in project creation.
 */
export async function isUserDriveReady(userId: number): Promise<boolean> {
  if (!isUserDriveConfigured()) return false;
  const row = await loadUserRow(userId);
  if (!row) return false;
  try {
    decryptCred(row);
    return true;
  } catch {
    return false;
  }
}

export async function getOrLoadUserDriveClient(userId: number): Promise<{
  client: GoogleDriveClient;
  rootFolderId: string;
}> {
  const cached = userClientCache.get(userId);
  if (cached) {
    return { client: cached.client, rootFolderId: cached.rootFolderId };
  }
  const row = await loadUserRow(userId);
  if (!row) {
    throw new Error(
      `User ${userId} has not connected a personal Google Drive account.`
    );
  }
  const cred = decryptCred(row);
  const tokens: DriveOAuthTokens = {
    refreshToken: cred.refreshToken,
    accessToken: cred.accessToken ?? undefined,
    expiresAt: cred.expiresAt ?? undefined,
    scopes: row.scopes,
    email: row.accountEmail,
  };
  const client = new GoogleDriveClient({
    oauth: getUserOAuthConfig(),
    tokens,
    onTokenRefresh: async (next) => {
      // Persist the fresh access token so restarts / other workers
      // don't spend another round-trip refreshing.
      const sealed = sealSecret(
        JSON.stringify({
          refreshToken: cred.refreshToken,
          accessToken: next.accessToken,
          expiresAt: next.expiresAt,
        })
      );
      await db
        .update(studioStorageAccounts)
        .set({
          credentialCipher: sealed.cipher,
          credentialNonce: sealed.nonce,
          expiresAt: new Date(next.expiresAt),
          lastRefreshedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(studioStorageAccounts.id, row.id));
    },
  });
  // Drive's reserved id for My Drive is the literal string "root".
  // Project folders are created directly under it — no shared
  // "WTF-Studio" folder, so users can easily manage / delete each
  // project's contents independently.
  const rootFolderId = "root";
  userClientCache.set(userId, {
    client,
    rootFolderId,
    loadedAt: Date.now(),
  });
  return { client, rootFolderId };
}

/* ── Internal ───────────────────────────────────────────── */

interface StoredCredential {
  refreshToken: string;
  accessToken?: string | null;
  expiresAt?: number | null;
}

function decryptCred(row: {
  credentialCipher: string;
  credentialNonce: string;
}): StoredCredential {
  const json = openSecret({
    cipher: row.credentialCipher,
    nonce: row.credentialNonce,
  });
  const parsed = JSON.parse(json) as StoredCredential;
  if (!parsed || typeof parsed.refreshToken !== "string") {
    throw new Error("User Drive credential envelope is malformed");
  }
  return parsed;
}
