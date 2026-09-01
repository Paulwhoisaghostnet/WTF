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
 * App usage (wtfOS's footprint in the user's Drive) is NOT persisted
 * on the row — we pull it fresh from Drive on demand and cache the
 * last-seen value in memory so repeat status checks stay cheap.  We
 * intentionally do NOT ask for `drive.metadata.readonly`, so the user's
 * *total* Drive quota is unavailable; `appUsage` covers files wtfOS created.
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
import { readFile } from "node:fs/promises";
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
  appUsage: { bytes: number; fileCount: number } | null;
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
      appUsage: null,
      hasDedicatedRedirect: hasDedicatedUserRedirect(),
    };
  }
  const appUsage = getUserAppUsageCache(userId);
  return {
    configured,
    connected: true,
    accountEmail: row.accountEmail,
    scopes: row.scopes,
    connectedAt: row.createdAt,
    lastRefreshedAt: row.lastRefreshedAt,
    appUsage,
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

  // Probe the connection once to populate the account email + app
  // usage cache.  Usage is diagnostic-only on connect — if it fails we
  // just skip priming the cache; the Refresh button recovers the value
  // on demand.  We deliberately skip `getQuota()` because the
  // `drive.file` scope doesn't grant access to `about.storageQuota`.
  const probeClient = new GoogleDriveClient({ oauth: cfg, tokens });
  const [email, appUsage] = await Promise.all([
    probeClient.getOwnerEmail().catch(() => null),
    probeClient.getAppStorageUsage().catch(() => null),
  ]);
  if (appUsage) {
    setUserAppUsageCache(opts.userId, {
      bytes: appUsage.bytes,
      fileCount: appUsage.fileCount,
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
  userAppUsageCache.delete(userId);
}

/**
 * Recompute Studio's footprint in this user's Drive.
 *
 * Returns:
 *   - `null` when the user has NOT connected a personal Drive (no row).
 *     This is a non-error condition the caller can turn into a "not
 *     connected" response.
 *   - `{ bytes, fileCount }` on success.
 *
 * Throws on every other failure (decrypt, OAuth refresh, Drive API) so
 * the endpoint can inspect the error and map it to a proper HTTP code
 * / message.  Callers that used to `.catch(() => null)` were eating
 * `invalid_grant` / 5xx distinctions and surfacing a useless generic
 * "Drive not connected" — don't do that; always log `err` at least.
 */
export async function refreshUserAppUsage(userId: number): Promise<{
  bytes: number;
  fileCount: number;
} | null> {
  const row = await loadUserRow(userId);
  if (!row) return null;

  const { client } = await getOrLoadUserDriveClient(userId);
  const usage = await client.getAppStorageUsage();
  setUserAppUsageCache(userId, {
    bytes: usage.bytes,
    fileCount: usage.fileCount,
  });
  return { bytes: usage.bytes, fileCount: usage.fileCount };
}

/* ── Authenticated client cache ─────────────────────────── */

/**
 * Per-user client + app-usage caches.  We hold one `GoogleDriveClient`
 * per userId in memory so back-to-back requests reuse the same access
 * token and only trigger a refresh when it genuinely expires.
 */
const userClientCache = new Map<
  number,
  { client: GoogleDriveClient; rootFolderId: string; touchedAt: number }
>();

const userAppUsageCache = new Map<
  number,
  { bytes: number; fileCount: number; touchedAt: number }
>();

const USER_DRIVE_CLIENT_CACHE_MAX = Math.max(
  10,
  Number(process.env.STUDIO_USER_DRIVE_CLIENT_CACHE_MAX || 200)
);
const USER_DRIVE_CLIENT_CACHE_TTL_MS = Math.max(
  60_000,
  Number(process.env.STUDIO_USER_DRIVE_CLIENT_CACHE_TTL_MS || 30 * 60_000)
);
const USER_DRIVE_APP_USAGE_CACHE_MAX = Math.max(
  10,
  Number(process.env.STUDIO_USER_DRIVE_APP_USAGE_CACHE_MAX || 200)
);
const USER_DRIVE_APP_USAGE_CACHE_TTL_MS = Math.max(
  60_000,
  Number(process.env.STUDIO_USER_DRIVE_APP_USAGE_CACHE_TTL_MS || 10 * 60_000)
);

function evictOldestEntries<K, V>(cache: Map<K, V>, maxEntries: number): void {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function pruneUserClientCache(now = Date.now()): void {
  for (const [userId, entry] of userClientCache.entries()) {
    if (now - entry.touchedAt > USER_DRIVE_CLIENT_CACHE_TTL_MS) {
      userClientCache.delete(userId);
    }
  }
  evictOldestEntries(userClientCache, USER_DRIVE_CLIENT_CACHE_MAX);
}

function pruneUserAppUsageCache(now = Date.now()): void {
  for (const [userId, entry] of userAppUsageCache.entries()) {
    if (now - entry.touchedAt > USER_DRIVE_APP_USAGE_CACHE_TTL_MS) {
      userAppUsageCache.delete(userId);
    }
  }
  evictOldestEntries(userAppUsageCache, USER_DRIVE_APP_USAGE_CACHE_MAX);
}

function setUserClientCache(
  userId: number,
  value: { client: GoogleDriveClient; rootFolderId: string }
): void {
  pruneUserClientCache();
  userClientCache.delete(userId);
  userClientCache.set(userId, { ...value, touchedAt: Date.now() });
  evictOldestEntries(userClientCache, USER_DRIVE_CLIENT_CACHE_MAX);
}

function getUserClientCache(userId: number): {
  client: GoogleDriveClient;
  rootFolderId: string;
} | null {
  pruneUserClientCache();
  const cached = userClientCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.touchedAt > USER_DRIVE_CLIENT_CACHE_TTL_MS) {
    userClientCache.delete(userId);
    return null;
  }
  setUserClientCache(userId, cached);
  const fresh = userClientCache.get(userId);
  return fresh ? { client: fresh.client, rootFolderId: fresh.rootFolderId } : null;
}

function setUserAppUsageCache(
  userId: number,
  value: { bytes: number; fileCount: number }
): void {
  pruneUserAppUsageCache();
  userAppUsageCache.delete(userId);
  userAppUsageCache.set(userId, { ...value, touchedAt: Date.now() });
  evictOldestEntries(userAppUsageCache, USER_DRIVE_APP_USAGE_CACHE_MAX);
}

function getUserAppUsageCache(userId: number): { bytes: number; fileCount: number } | null {
  pruneUserAppUsageCache();
  const cached = userAppUsageCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.touchedAt > USER_DRIVE_APP_USAGE_CACHE_TTL_MS) {
    userAppUsageCache.delete(userId);
    return null;
  }
  setUserAppUsageCache(userId, cached);
  const fresh = userAppUsageCache.get(userId);
  return fresh ? { bytes: fresh.bytes, fileCount: fresh.fileCount } : null;
}

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
  const cached = getUserClientCache(userId);
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
  setUserClientCache(userId, {
    client,
    rootFolderId,
  });
  return { client, rootFolderId };
}

export type UserMediaDriveBackup = {
  provider: "google_drive";
  status: "ready";
  fileId: string;
  fileName: string;
  webViewLink: string | null;
  checksumSha256: string | null;
  syncedAt: string;
};

/**
 * Copy one My Media upload into the user's connected Google Drive.
 * The platform object-storage object remains the playback source; this
 * Drive object is an account-owned backup created under the narrow
 * `drive.file` grant.
 *
 * Returns `null` when the user has no ready Drive connection so ordinary
 * media uploads remain available without requiring Google.
 */
export async function backupUserMediaFileToDrive(input: {
  userId: number;
  mediaId: number;
  filePath: string;
  fileName: string;
  mimeType: string;
  checksumSha256?: string | null;
}): Promise<UserMediaDriveBackup | null> {
  if (!(await isUserDriveReady(input.userId))) return null;
  const { client, rootFolderId } = await getOrLoadUserDriveClient(input.userId);
  const parentId = await client.ensureFolderPath(rootFolderId, ["wtfOS My Media"]);
  const buffer = await readFile(input.filePath);
  const fileName = `${Math.max(0, Math.floor(input.mediaId))}-${input.fileName}`;
  const uploaded = await client.uploadBuffer({
    buffer,
    mimeType: input.mimeType,
    name: fileName,
    parentId,
  });
  if (!uploaded.id) throw new Error("Google Drive media backup returned no file id");
  return {
    provider: "google_drive",
    status: "ready",
    fileId: uploaded.id,
    fileName,
    webViewLink: uploaded.webViewLink ?? null,
    checksumSha256: input.checksumSha256 ?? null,
    syncedAt: new Date().toISOString(),
  };
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
