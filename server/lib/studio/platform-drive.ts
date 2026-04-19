/**
 * Lifecycle helpers around the single `studio_platform_storage` row that
 * backs the shared-pool Google Drive storage for Studio.
 *
 * One row keyed by `backend = 'google_drive'` holds:
 *   - the encrypted OAuth refresh token (+ cached access token)
 *   - the id of the root folder on Drive where projects are created
 *   - cached app-usage bytes (`quotaBytesUsage` column, legacy name —
 *     semantically this is "bytes used by Studio", not the service
 *     account's total Drive quota; see note in `refreshPlatformAppUsage`)
 *
 * Everything the driver needs comes through `getOrLoadPlatformDriveClient`
 * — it reads the row, decrypts the credential envelope, and returns a
 * ready-to-use `GoogleDriveClient` that will persist fresh access tokens
 * back to the DB whenever it refreshes.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { studioPlatformStorage } from "@shared/schema";
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

/* ── Env helpers ────────────────────────────────────────── */

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

/**
 * True when the operator has provided the minimum env for Google OAuth.
 * We still need the DB row (refresh token) before the driver is truly
 * usable — that happens when admin completes the OAuth flow.
 */
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    readEnv("GOOGLE_CLIENT_ID") &&
      readEnv("GOOGLE_CLIENT_SECRET") &&
      readEnv("GOOGLE_OAUTH_REDIRECT_URI")
  );
}

export function isPlatformDriveConfigured(): boolean {
  return isGoogleOAuthConfigured() && isStudioCryptoConfigured();
}

export function getGoogleOAuthConfig(): OAuthClientConfig {
  return {
    clientId: readEnv("GOOGLE_CLIENT_ID"),
    clientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: readEnv("GOOGLE_OAUTH_REDIRECT_URI"),
  };
}

/**
 * Optional — when set, Studio will create project folders inside this
 * Drive folder instead of the user's Drive root.  Recommended so everything
 * lives under a single "WTF-Studio" folder you own.
 */
export function getConfiguredRootFolderId(): string | null {
  const id = readEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID");
  return id ? id : null;
}

/* ── DB row helpers ─────────────────────────────────────── */

export interface PlatformDriveRow {
  id: number;
  backend: "google_drive";
  accountEmail: string | null;
  scopes: string | null;
  rootFolderId: string | null;
  quotaBytesLimit: number | null;
  quotaBytesUsage: number | null;
  quotaRefreshedAt: Date | null;
  lastRefreshedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

async function loadPlatformRow(): Promise<
  | (PlatformDriveRow & {
      credentialCipher: string;
      credentialNonce: string;
    })
  | null
> {
  const [row] = await db
    .select()
    .from(studioPlatformStorage)
    .where(eq(studioPlatformStorage.backend, "google_drive"))
    .limit(1);
  if (!row) return null;
  return row as unknown as PlatformDriveRow & {
    credentialCipher: string;
    credentialNonce: string;
  };
}

/** Public, secret-free summary suitable for admin UI. */
export async function getPlatformDriveStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  scopes: string | null;
  rootFolderId: string | null;
  appUsage: {
    bytes: number | null;
    fileCount: number | null;
    refreshedAt: Date | null;
  } | null;
  connectedAt: Date | null;
  lastRefreshedAt: Date | null;
}> {
  const configured = isPlatformDriveConfigured();
  const row = await loadPlatformRow();
  if (!row) {
    return {
      configured,
      connected: false,
      accountEmail: null,
      scopes: null,
      rootFolderId: null,
      appUsage: null,
      connectedAt: null,
      lastRefreshedAt: null,
    };
  }
  return {
    configured,
    connected: true,
    accountEmail: row.accountEmail,
    scopes: row.scopes,
    rootFolderId: row.rootFolderId,
    // Legacy columns — quotaBytesUsage now carries "bytes used by
    // Studio", quotaBytesLimit is the stashed file count.  Kept without
    // a migration to minimize churn; renaming schema columns is a
    // separate PR.
    appUsage: {
      bytes: row.quotaBytesUsage,
      fileCount: row.quotaBytesLimit,
      refreshedAt: row.quotaRefreshedAt,
    },
    connectedAt: row.createdAt,
    lastRefreshedAt: row.lastRefreshedAt,
  };
}

/* ── OAuth dance ────────────────────────────────────────── */

/**
 * Build the URL an admin visits to grant access to the platform Drive
 * account.  `state` should be a CSRF-style token the caller persists in
 * the session.
 */
export function buildConnectUrl(state: string, loginHint?: string): string {
  return buildAuthorizeUrl(getGoogleOAuthConfig(), {
    scopes: STUDIO_DRIVE_SCOPES,
    state,
    loginHint,
  });
}

/**
 * Finalize the OAuth flow: exchange the code for tokens, fetch the owning
 * email + quota for display, seal the refresh token, and upsert the row.
 */
export async function completePlatformConnect(opts: {
  code: string;
  connectedByUserId: number;
}): Promise<PlatformDriveRow> {
  const tokens = await exchangeAuthCode(getGoogleOAuthConfig(), opts.code);
  const client = buildClientFromTokens(tokens);
  // Probe: owner email + Studio footprint.  Neither is critical to the
  // flow — any failure here just leaves the respective field blank for
  // the operator to refresh on demand.  We do NOT call `getQuota()`
  // here: `about.storageQuota` requires `drive.metadata.readonly`, a
  // scope we deliberately don't hold.
  const [email, appUsage] = await Promise.all([
    client.getOwnerEmail().catch(() => null),
    client.getAppStorageUsage().catch(() => ({ bytes: 0, fileCount: 0 })),
  ]);

  // Default root folder: env override if set, else null (uploads go into
  // "My Drive" root under the owning account).  Admin can later adjust via
  // /api/studio/admin/drive/root-folder.
  const rootFolderId = getConfiguredRootFolderId();

  const sealed = sealSecret(
    JSON.stringify({
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken ?? null,
      expiresAt: tokens.expiresAt ?? null,
    })
  );
  const now = new Date();

  const existing = await loadPlatformRow();
  if (existing) {
    // Revoke any older refresh token quietly.
    try {
      const oldCred = decryptCred({
        credentialCipher: existing.credentialCipher,
        credentialNonce: existing.credentialNonce,
      });
      if (oldCred.refreshToken && oldCred.refreshToken !== tokens.refreshToken) {
        await revokeToken(oldCred.refreshToken);
      }
    } catch {
      /* rotate quietly — old token may be undecryptable if key changed */
    }
    const [updated] = await db
      .update(studioPlatformStorage)
      .set({
        accountEmail: email ?? existing.accountEmail,
        scopes: tokens.scopes ?? STUDIO_DRIVE_SCOPES.join(" "),
        credentialCipher: sealed.cipher,
        credentialNonce: sealed.nonce,
        rootFolderId: rootFolderId ?? existing.rootFolderId,
        quotaBytesLimit: appUsage.fileCount,
        quotaBytesUsage: appUsage.bytes,
        quotaRefreshedAt: now,
        connectedByUserId: opts.connectedByUserId,
        lastRefreshedAt: now,
        updatedAt: now,
      })
      .where(eq(studioPlatformStorage.id, existing.id))
      .returning();
    invalidateCache();
    return updated as unknown as PlatformDriveRow;
  }

  const [inserted] = await db
    .insert(studioPlatformStorage)
    .values({
      backend: "google_drive",
      accountEmail: email,
      scopes: tokens.scopes ?? STUDIO_DRIVE_SCOPES.join(" "),
      credentialCipher: sealed.cipher,
      credentialNonce: sealed.nonce,
      rootFolderId,
      quotaBytesLimit: appUsage.fileCount,
      quotaBytesUsage: appUsage.bytes,
      quotaRefreshedAt: now,
      connectedByUserId: opts.connectedByUserId,
      lastRefreshedAt: now,
    })
    .returning();
  invalidateCache();
  return inserted as unknown as PlatformDriveRow;
}

/** Tear down the connection and revoke the refresh token. */
export async function disconnectPlatformDrive(): Promise<void> {
  const row = await loadPlatformRow();
  if (!row) return;
  try {
    const cred = decryptCred(row);
    if (cred.refreshToken) await revokeToken(cred.refreshToken);
  } catch {
    /* revoke best-effort */
  }
  await db
    .delete(studioPlatformStorage)
    .where(eq(studioPlatformStorage.id, row.id));
  invalidateCache();
}

export async function setPlatformRootFolder(rootFolderId: string | null): Promise<void> {
  await db
    .update(studioPlatformStorage)
    .set({
      rootFolderId: rootFolderId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(studioPlatformStorage.backend, "google_drive"));
  invalidateCache();
}

/**
 * Recompute Studio's footprint in the platform Drive and persist it.
 *
 * Mirrors the per-user flow: lists + sums sizes of files the app
 * created, under `drive.file`.  Deliberately does NOT call `about.get`
 * (that needs `drive.metadata.readonly` and we don't hold it).
 *
 * Returns:
 *   - `null` when the platform Drive has never been connected.
 *   - `{ bytes, fileCount }` on success.
 *
 * Throws on every other failure so the caller can return a specific
 * error to the operator (revoked token, 5xx, etc.).  Legacy callers
 * that wrapped the old `refreshPlatformQuota` in `.catch(() => null)`
 * were swallowing all diagnostic signal — don't re-introduce that.
 */
export async function refreshPlatformAppUsage(): Promise<{
  bytes: number;
  fileCount: number;
} | null> {
  const row = await loadPlatformRow();
  if (!row) return null;
  const resolved = await getOrLoadPlatformDriveClient();
  if (!resolved) return null;
  const usage = await resolved.client.getAppStorageUsage();
  await db
    .update(studioPlatformStorage)
    .set({
      quotaBytesLimit: usage.fileCount,
      quotaBytesUsage: usage.bytes,
      quotaRefreshedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(studioPlatformStorage.backend, "google_drive"));
  return { bytes: usage.bytes, fileCount: usage.fileCount };
}

/* ── Authenticated client cache ─────────────────────────── */

/**
 * We keep a single live `GoogleDriveClient` per process — it holds an
 * in-memory access token that we refresh on demand.  The cache is
 * invalidated on connect/disconnect/quota rotation.
 */
let cached: {
  client: GoogleDriveClient;
  rootFolderId: string | null;
  loadedAt: number;
} | null = null;

function invalidateCache(): void {
  cached = null;
}

export async function getOrLoadPlatformDriveClient(): Promise<{
  client: GoogleDriveClient;
  rootFolderId: string | null;
}> {
  if (cached) {
    return { client: cached.client, rootFolderId: cached.rootFolderId };
  }
  const row = await loadPlatformRow();
  if (!row) {
    throw new Error(
      "Platform Drive is not connected. An admin must run the OAuth setup first."
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
    oauth: getGoogleOAuthConfig(),
    tokens,
    onTokenRefresh: async (next) => {
      // Persist the fresh access token so other processes / restarts
      // don't waste refresh calls.
      const sealed = sealSecret(
        JSON.stringify({
          refreshToken: cred.refreshToken,
          accessToken: next.accessToken,
          expiresAt: next.expiresAt,
        })
      );
      await db
        .update(studioPlatformStorage)
        .set({
          credentialCipher: sealed.cipher,
          credentialNonce: sealed.nonce,
          lastRefreshedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(studioPlatformStorage.backend, "google_drive"));
    },
  });
  cached = {
    client,
    rootFolderId: row.rootFolderId,
    loadedAt: Date.now(),
  };
  return { client, rootFolderId: row.rootFolderId };
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
    throw new Error("Platform Drive credential envelope is malformed");
  }
  return parsed;
}

function buildClientFromTokens(tokens: DriveOAuthTokens): GoogleDriveClient {
  return new GoogleDriveClient({
    oauth: getGoogleOAuthConfig(),
    tokens,
  });
}
