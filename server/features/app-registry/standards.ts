import { APP_REGISTRY_KINDS, type AppRegistryKind } from "./config";

/**
 * Universal wtfOS app standards validation (Req1 / Req5 / D5). Pure + DB-free.
 *
 * Mirrors the assertions enforced for builtin packages in
 * shared/wtf-app-packages.test.ts so that a user-published app must meet the
 * SAME contract before it can register: required manifest fields, a valid
 * doctrine domain + guide path, route evidence, provenance, permission summary,
 * rollback/uninstall, and `preservesUserData`.
 *
 * Filesystem checks (doc-path existence, asset presence) live in the wizard
 * (wizard.ts) because they touch the disk; this module validates SHAPE only so
 * it unit-tests without a DB or filesystem.
 */

/** Accepted doctrine domains → guide path. Mirrors wtf-app-packages.test.ts. */
export const ACCEPTED_DOCTRINE_DOMAINS: Record<string, string> = {
  "WTF OS": "docs/domains/wtf-os.md",
  "Identity And Social": "docs/domains/identity-and-social.md",
  "Arcade, Console, And Game Studio": "docs/domains/arcade-console-game-studio.md",
  "Commerce And Wallets": "docs/domains/commerce-and-wallets.md",
  "Media, TV, And Studio": "docs/domains/media-tv-studio.md",
  "Tezos Platform": "docs/domains/tezos-platform.md",
  Operations: "docs/domains/operations.md",
};

const DOMAIN_GUIDE_PATTERN = /^docs\/domains\/.+\.md$/;

export interface WtfAppManifest {
  id?: unknown;
  key?: unknown;
  label?: unknown;
  kind?: unknown;
  state?: unknown;
  domain?: { label?: unknown; guide?: unknown };
  routeEvidence?: unknown;
  provenance?: { owner?: unknown; source?: unknown; evidence?: unknown };
  permissionSummary?: {
    userAccess?: unknown;
    adminAccess?: unknown;
    dataTouched?: unknown;
    externalSystems?: unknown;
  };
  rollback?: { method?: unknown; evidence?: unknown };
  uninstall?: { method?: unknown; preservesUserData?: unknown; evidence?: unknown };
}

export interface StandardsValidationResult {
  ok: boolean;
  errors: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => isNonEmptyString(v));
}

/** Validate a candidate manifest against the universal standards contract. */
export function validateAppManifest(manifest: WtfAppManifest): StandardsValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(manifest.id)) errors.push("id is required");
  if (!isNonEmptyString(manifest.key)) errors.push("key is required");
  if (!isNonEmptyString(manifest.label)) errors.push("label is required");

  if (!isNonEmptyString(manifest.kind)) {
    errors.push("kind is required");
  } else if (!(APP_REGISTRY_KINDS as readonly string[]).includes(manifest.kind)) {
    errors.push(`kind must be one of: ${APP_REGISTRY_KINDS.join(", ")}`);
  }

  const domain = manifest.domain;
  if (!domain || !isNonEmptyString(domain.label) || !isNonEmptyString(domain.guide)) {
    errors.push("domain.label and domain.guide are required");
  } else {
    if (!DOMAIN_GUIDE_PATTERN.test(domain.guide)) {
      errors.push("domain.guide must match docs/domains/<name>.md");
    }
    const accepted = ACCEPTED_DOCTRINE_DOMAINS[domain.label];
    if (!accepted) {
      errors.push(`domain.label is not an accepted doctrine domain: ${domain.label}`);
    } else if (accepted !== domain.guide) {
      errors.push(`domain.guide must be ${accepted} for domain ${domain.label}`);
    }
  }

  if (!isNonEmptyStringArray(manifest.routeEvidence)) {
    errors.push("routeEvidence must be a non-empty string array");
  }

  const provenance = manifest.provenance;
  if (!provenance) {
    errors.push("provenance is required");
  } else {
    if (!isNonEmptyString(provenance.owner)) errors.push("provenance.owner is required");
    if (!isNonEmptyString(provenance.source)) errors.push("provenance.source is required");
    if (!isNonEmptyStringArray(provenance.evidence)) {
      errors.push("provenance.evidence must be a non-empty string array");
    }
  }

  const perms = manifest.permissionSummary;
  if (!perms) {
    errors.push("permissionSummary is required");
  } else {
    if (!isNonEmptyString(perms.userAccess)) errors.push("permissionSummary.userAccess is required");
    if (!isNonEmptyString(perms.adminAccess)) errors.push("permissionSummary.adminAccess is required");
  }

  const rollback = manifest.rollback;
  if (!rollback) {
    errors.push("rollback is required");
  } else {
    if (!isNonEmptyString(rollback.method)) errors.push("rollback.method is required");
    if (!isNonEmptyStringArray(rollback.evidence)) {
      errors.push("rollback.evidence must be a non-empty string array");
    }
  }

  const uninstall = manifest.uninstall;
  if (!uninstall) {
    errors.push("uninstall is required");
  } else {
    if (!isNonEmptyString(uninstall.method)) errors.push("uninstall.method is required");
    if (uninstall.preservesUserData !== true) {
      errors.push("uninstall.preservesUserData must be true");
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Resolve the canonical registry kind from a manifest, defaulting to installed-app. */
export function resolveRegistryKind(manifest: WtfAppManifest): AppRegistryKind {
  if (isNonEmptyString(manifest.kind) && (APP_REGISTRY_KINDS as readonly string[]).includes(manifest.kind)) {
    return manifest.kind as AppRegistryKind;
  }
  return "installed-app";
}
