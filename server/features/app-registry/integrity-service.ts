import { and, desc, eq, isNull } from "drizzle-orm";
import { appKeys } from "@shared/schema";
import { db } from "../../db";
import { isAppRegistryEnabled } from "./config";
import {
  isMissingRelationError,
  listRegistrationRows,
  recomputeFingerprintForRow,
} from "./registry-service";
import { autoDisableForIntegrity } from "./key-service";

/**
 * Integrity verifier (Req4 / D3). Recomputes each app's fingerprint and compares
 * it to the fingerprint its active key is bound to. On drift it auto-disables the
 * key and flips the app to needs-reregister (via key-service). Runs at startup
 * and on a background cadence (server/lib/background-jobs.ts). No-op (and never
 * touches the DB destructively) when APP_REGISTRY_ENABLED is off.
 */

export interface IntegrityVerificationResult {
  enabled: boolean;
  scanned: number;
  drifted: number;
  driftedAppIds: string[];
}

export async function runIntegrityVerification(
  env: NodeJS.ProcessEnv = process.env,
): Promise<IntegrityVerificationResult> {
  if (!isAppRegistryEnabled(env)) {
    return { enabled: false, scanned: 0, drifted: 0, driftedAppIds: [] };
  }

  let rows;
  try {
    rows = await listRegistrationRows();
  } catch (err) {
    if (isMissingRelationError(err)) {
      return { enabled: true, scanned: 0, drifted: 0, driftedAppIds: [] };
    }
    throw err;
  }

  const driftedAppIds: string[] = [];
  for (const row of rows) {
    const current = recomputeFingerprintForRow(row).integrityFingerprint;

    // Only act on apps that have an active (non-revoked, non-disabled) key.
    let activeKey;
    try {
      const [key] = await db
        .select()
        .from(appKeys)
        .where(
          and(
            eq(appKeys.appId, row.appId),
            isNull(appKeys.revokedAt),
            isNull(appKeys.disabledAt),
          ),
        )
        .orderBy(desc(appKeys.createdAt))
        .limit(1);
      activeKey = key ?? null;
    } catch (err) {
      if (isMissingRelationError(err)) return { enabled: true, scanned: rows.length, drifted: driftedAppIds.length, driftedAppIds };
      throw err;
    }

    if (!activeKey) continue;
    if (activeKey.boundFingerprint && activeKey.boundFingerprint !== current) {
      await autoDisableForIntegrity(row.appId, current);
      driftedAppIds.push(row.appId);
    }
  }

  return {
    enabled: true,
    scanned: rows.length,
    drifted: driftedAppIds.length,
    driftedAppIds,
  };
}

/** Fire-and-forget startup verification; never throws into boot. */
export async function verifyIntegrityOnStartup(): Promise<void> {
  if (!isAppRegistryEnabled()) return;
  try {
    const result = await runIntegrityVerification();
    if (result.drifted > 0) {
      console.warn(
        `[app-registry] startup integrity check disabled ${result.drifted} key(s):`,
        result.driftedAppIds.join(", "),
      );
    }
  } catch (err) {
    console.error("[app-registry] startup integrity check failed:", err);
  }
}
