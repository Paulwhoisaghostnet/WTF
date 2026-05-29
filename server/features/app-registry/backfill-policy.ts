import {
  WTF_APP_PACKAGE_ACCEPTANCE,
  type WtfAppPackageAcceptance,
} from "@shared/wtf-app-packages";
import { DEFAULT_DESKTOP_APP_CONFIG } from "@shared/desktop-apps";
import type { AppRegistryKind, AppSourceType } from "./config";
import type { LifecycleState } from "./lifecycle";

/**
 * Backfill mapping (Req1 backfill). Pure + DB-free.
 *
 * Maps EVERY current app — the 20 desktop apps AND the static creation tools /
 * packages / integration plugins — onto a registration seed so the DB backfill
 * (backfill.ts) can register them idempotently with NO behaviour regression:
 *   - currently-enabled builtins land in `published`
 *   - disabled-by-default / explicitly-off apps land in `registered` (enabled=false)
 *   - blocked integrations land in `disabled`
 */

export interface RegistrationSeed {
  appId: string;
  kind: AppRegistryKind;
  appKey: string | null;
  label: string;
  domainLabel: string;
  domainGuide: string;
  enabled: boolean;
  lifecycleState: LifecycleState;
  sourceType: AppSourceType;
  manifest: WtfAppPackageAcceptance;
}

/** Mirror of server/lib/wtfos-inventory.ts#isEnabledPackage, kept pure here. */
export function isPackageEnabledByDefault(entry: WtfAppPackageAcceptance): boolean {
  if (entry.state === "blocked") return false;
  if (entry.state === "disabled-by-default") return false;
  if (entry.appKey) return DEFAULT_DESKTOP_APP_CONFIG[entry.appKey] !== false;
  return true;
}

export function lifecycleForSeed(entry: WtfAppPackageAcceptance, enabled: boolean): LifecycleState {
  if (entry.state === "blocked") return "disabled";
  return enabled ? "published" : "registered";
}

export function seedFromPackage(entry: WtfAppPackageAcceptance): RegistrationSeed {
  const enabled = isPackageEnabledByDefault(entry);
  return {
    appId: entry.id,
    kind: entry.kind as AppRegistryKind,
    appKey: entry.appKey ?? entry.toolId ?? entry.key ?? null,
    label: entry.label,
    domainLabel: entry.domain.label,
    domainGuide: entry.domain.guide,
    enabled,
    lifecycleState: lifecycleForSeed(entry, enabled),
    sourceType: "builtin",
    manifest: entry,
  };
}

/** All builtin registration seeds (desktop apps + creation tools + packages + integrations). */
export function buildRegistrationSeeds(
  packages: readonly WtfAppPackageAcceptance[] = WTF_APP_PACKAGE_ACCEPTANCE,
): RegistrationSeed[] {
  return packages.map(seedFromPackage);
}
