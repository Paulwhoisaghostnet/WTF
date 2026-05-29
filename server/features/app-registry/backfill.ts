import { buildRegistrationSeeds, type RegistrationSeed } from "./backfill-policy";
import { insertRegistrationIfAbsent } from "./registry-service";
import { getLatestKeyRow, issueAppKey } from "./key-service";

/**
 * Idempotent backfill (Req1 backfill). Registers EVERY current app — the 20
 * desktop apps and the static creation tools / packages / integration plugins —
 * into app_registrations with computed fingerprints in an appropriate initial
 * lifecycle state, and issues a key for each published (enabled) builtin so that
 * flipping APP_REGISTRY_ENABLED on does NOT regress installability.
 *
 * Safe to run repeatedly: existing registrations are left untouched (admin state
 * preserved) and keys are only issued when an app has no active key yet.
 */

export interface BackfillSummary {
  scanned: number;
  inserted: number;
  keysIssued: number;
  skipped: number;
  insertedAppIds: string[];
}

function shouldIssueKey(seed: RegistrationSeed): boolean {
  // Published + enabled builtins must stay installable once the flag is on.
  return seed.enabled && seed.lifecycleState === "published";
}

export async function runAppRegistryBackfill(
  seeds: RegistrationSeed[] = buildRegistrationSeeds(),
): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    scanned: seeds.length,
    inserted: 0,
    keysIssued: 0,
    skipped: 0,
    insertedAppIds: [],
  };

  for (const seed of seeds) {
    const inserted = await insertRegistrationIfAbsent({
      appId: seed.appId,
      kind: seed.kind,
      appKey: seed.appKey,
      label: seed.label,
      domainLabel: seed.domainLabel,
      lifecycleState: seed.lifecycleState,
      enabled: seed.enabled,
      sourceType: seed.sourceType,
      manifest: seed.manifest,
    });

    if (inserted) {
      summary.inserted += 1;
      summary.insertedAppIds.push(seed.appId);
    } else {
      summary.skipped += 1;
    }

    if (shouldIssueKey(seed)) {
      const existing = await getLatestKeyRow(seed.appId);
      const hasActiveKey = existing && !existing.revokedAt && !existing.disabledAt;
      if (!hasActiveKey) {
        const issued = await issueAppKey(seed.appId, { scopes: ["operate"] });
        if (issued) summary.keysIssued += 1;
      }
    }
  }

  return summary;
}
