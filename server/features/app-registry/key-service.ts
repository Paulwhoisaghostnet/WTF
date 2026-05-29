import { and, desc, eq, isNull } from "drizzle-orm";
import { appKeys, appRegistrations, type AppKeyRow } from "@shared/schema";
import { db } from "../../db";
import { logSystemEvent } from "../../lib/system-log";
import {
  createAppKeyMaterial,
  hashAppKey,
  isAppKeyValid,
  KEY_DISABLED_INTEGRITY,
  type AppKeyMaterial,
} from "./key-policy";
import {
  getRegistrationRow,
  isMissingRelationError,
  markNeedsReregister,
  recomputeFingerprintForRow,
} from "./registry-service";

/**
 * App key DB service (Req3/Req4 / D2). Issues, disables, revokes, and verifies
 * keys. Only sha256 hash + prefix are stored. On verification the app's current
 * integrity fingerprint is recomputed; a drift auto-disables the key
 * (disabledReason=integrity_changed) and flips the app to needs-reregister.
 */

export interface IssuedKey {
  key: string;
  prefix: string;
  appId: string;
  boundFingerprint: string | null;
}

/** Most-recent key row for an app (active or not). */
export async function getLatestKeyRow(appId: string): Promise<AppKeyRow | null> {
  try {
    const [row] = await db
      .select()
      .from(appKeys)
      .where(eq(appKeys.appId, appId))
      .orderBy(desc(appKeys.createdAt))
      .limit(1);
    return row ?? null;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    throw err;
  }
}

/**
 * Issue a fresh key for an app, binding it to the app's current integrity
 * fingerprint. Any prior non-revoked keys are superseded (disabled) so a single
 * key is active at a time. Returns the one-time secret.
 */
export async function issueAppKey(
  appId: string,
  opts: {
    scopes?: string[];
    issuedBy?: number | null;
    did?: string | null;
    rand?: () => string;
  } = {},
): Promise<IssuedKey | null> {
  const registration = await getRegistrationRow(appId);
  if (!registration) return null;
  const fp = recomputeFingerprintForRow(registration);
  const now = new Date();

  // Supersede prior active keys.
  await db
    .update(appKeys)
    .set({ disabledAt: now, disabledReason: "superseded", updatedAt: now })
    .where(and(eq(appKeys.appId, appId), isNull(appKeys.revokedAt), isNull(appKeys.disabledAt)));

  const material: AppKeyMaterial = createAppKeyMaterial(appId, opts.rand);
  await db.insert(appKeys).values({
    registrationId: registration.id,
    appId,
    keyHash: material.hash,
    keyPrefix: material.prefix,
    scopes: opts.scopes ?? [],
    boundFingerprint: fp.integrityFingerprint,
    did: opts.did ?? null,
    issuedBy: opts.issuedBy ?? null,
    createdAt: now,
    updatedAt: now,
  });

  // Keep the registration fingerprint in sync with what the key is bound to.
  await db
    .update(appRegistrations)
    .set({ integrityFingerprint: fp.integrityFingerprint, updatedAt: now })
    .where(eq(appRegistrations.appId, appId));

  return {
    key: material.key,
    prefix: material.prefix,
    appId,
    boundFingerprint: fp.integrityFingerprint,
  };
}

export async function disableAppKey(
  appId: string,
  reason = "admin_disabled",
  actorUserId: number | null = null,
): Promise<number> {
  const now = new Date();
  const updated = await db
    .update(appKeys)
    .set({ disabledAt: now, disabledReason: reason, updatedAt: now })
    .where(and(eq(appKeys.appId, appId), isNull(appKeys.revokedAt), isNull(appKeys.disabledAt)))
    .returning({ id: appKeys.id });
  logSystemEvent({
    source: "app-registry",
    eventType: "app_key.disabled",
    severity: "warn",
    message: `App key disabled for ${appId} (${reason})`,
    userId: actorUserId,
    metadata: { appId, reason, count: updated.length },
  });
  return updated.length;
}

export async function revokeAppKey(
  appId: string,
  actorUserId: number | null = null,
): Promise<number> {
  const now = new Date();
  const updated = await db
    .update(appKeys)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(appKeys.appId, appId), isNull(appKeys.revokedAt)))
    .returning({ id: appKeys.id });
  logSystemEvent({
    source: "app-registry",
    eventType: "app_key.revoked",
    severity: "warn",
    message: `App key revoked for ${appId}`,
    userId: actorUserId,
    metadata: { appId, count: updated.length },
  });
  return updated.length;
}

export interface VerifyResult {
  valid: boolean;
  appId: string | null;
  reason: "ok" | "unknown_key" | "revoked" | "disabled" | "integrity_changed" | "tables_missing";
}

/**
 * Verify a presented secret. Recomputes the app's fingerprint; on drift it
 * auto-disables the key and flips the app to needs-reregister (Req4), then
 * reports integrity_changed. Updates lastUsedAt on a valid hit.
 */
export async function verifyAppKey(secret: string): Promise<VerifyResult> {
  const keyHash = hashAppKey(secret);
  let keyRow: AppKeyRow | null = null;
  try {
    const [row] = await db.select().from(appKeys).where(eq(appKeys.keyHash, keyHash)).limit(1);
    keyRow = row ?? null;
  } catch (err) {
    if (isMissingRelationError(err)) return { valid: false, appId: null, reason: "tables_missing" };
    throw err;
  }
  if (!keyRow) return { valid: false, appId: null, reason: "unknown_key" };
  if (keyRow.revokedAt) return { valid: false, appId: keyRow.appId, reason: "revoked" };

  const registration = await getRegistrationRow(keyRow.appId);
  const current = registration
    ? recomputeFingerprintForRow(registration).integrityFingerprint
    : keyRow.boundFingerprint;

  const valid = isAppKeyValid(
    {
      revokedAt: keyRow.revokedAt,
      disabledAt: keyRow.disabledAt,
      boundFingerprint: keyRow.boundFingerprint,
    },
    current,
  );

  if (valid) {
    await db
      .update(appKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(appKeys.id, keyRow.id));
    return { valid: true, appId: keyRow.appId, reason: "ok" };
  }

  if (keyRow.disabledAt) {
    return { valid: false, appId: keyRow.appId, reason: keyRow.disabledReason === KEY_DISABLED_INTEGRITY ? "integrity_changed" : "disabled" };
  }

  // Active key but fingerprint drifted → auto-disable + needs-reregister.
  if (keyRow.boundFingerprint && current && keyRow.boundFingerprint !== current) {
    await autoDisableForIntegrity(keyRow.appId, current);
    return { valid: false, appId: keyRow.appId, reason: "integrity_changed" };
  }
  return { valid: false, appId: keyRow.appId, reason: "disabled" };
}

/** Disable an app's key for integrity drift and flip lifecycle to needs-reregister. */
export async function autoDisableForIntegrity(appId: string, currentFingerprint: string): Promise<void> {
  const now = new Date();
  await db
    .update(appKeys)
    .set({ disabledAt: now, disabledReason: KEY_DISABLED_INTEGRITY, updatedAt: now })
    .where(and(eq(appKeys.appId, appId), isNull(appKeys.revokedAt), isNull(appKeys.disabledAt)));
  await markNeedsReregister(appId, currentFingerprint);
  logSystemEvent({
    source: "app-registry",
    eventType: "app_registry.integrity_changed",
    severity: "warn",
    message: `Integrity fingerprint changed for ${appId}; key disabled and re-registration required`,
    metadata: { appId, currentFingerprint },
  });
}
