import {
  appearsInCommandPalette,
  isInstallable,
  type LifecycleState,
} from "./lifecycle";
import { COBWEBSAINTS_FULL_USER_ROLE } from "@shared/types";
import { isAppKeyValid, satisfiesKeyRequirement, type AppKeyState } from "./key-policy";
import { fingerprintMatches } from "./fingerprint";

/**
 * Availability resolution (Req2/Req3/Req4/Req5). Pure + DB-free. Combines the
 * lifecycle state, key validity, integrity fingerprint match, the master flag,
 * and the requester's alpha-cohort membership into a single availability view.
 *
 * When APP_REGISTRY_ENABLED is OFF the registry does NOT govern installability —
 * callers fall back to the legacy desktop_app_settings path — so `governed` is
 * false and `installable` reflects only `enabled` for back-compat reporting.
 */

/** Alpha cohort = test_subject / trusted_creator / special full-user publishing roles. Admin & host always qualify. */
export const ALPHA_COHORT_ROLES = ["test_subject", "trusted_creator", COBWEBSAINTS_FULL_USER_ROLE] as const;
const ALPHA_OVERRIDE_ROLES = ["admin", "host"] as const;

export function isAlphaCohortMember(roles: readonly string[]): boolean {
  return roles.some(
    (role) =>
      (ALPHA_COHORT_ROLES as readonly string[]).includes(role) ||
      (ALPHA_OVERRIDE_ROLES as readonly string[]).includes(role),
  );
}

export interface RegistrationAvailabilityInput {
  appRegistryEnabled: boolean;
  state: LifecycleState;
  enabled: boolean;
  integrityFingerprint: string | null;
  /** Freshly recomputed fingerprint (verifier / on-read). Falls back to stored when omitted. */
  currentFingerprint?: string | null;
  /** The active key for the app, if any. */
  key?: AppKeyState | null;
  /** Roles of the requesting user (for alpha cohort gating). */
  requesterRoles?: readonly string[];
}

export interface AvailabilityView {
  /** True when the registry governs this decision (flag on). */
  governed: boolean;
  installable: boolean;
  inCommandPalette: boolean;
  keyValid: boolean;
  fingerprintMatches: boolean;
  reason: AvailabilityReason;
}

export type AvailabilityReason =
  | "ok"
  | "registry_disabled"
  | "app_disabled"
  | "no_valid_key"
  | "integrity_changed"
  | "not_published"
  | "alpha_restricted";

export function resolveAvailability(input: RegistrationAvailabilityInput): AvailabilityView {
  const current =
    input.currentFingerprint !== undefined ? input.currentFingerprint : input.integrityFingerprint;
  const fpMatches = fingerprintMatches(input.integrityFingerprint, current);
  const keyValid = input.key ? isAppKeyValid(input.key, current) : false;
  const alphaMember = isAlphaCohortMember(input.requesterRoles ?? []);

  // Flag OFF: legacy passthrough. The registry does not gate installability.
  if (!input.appRegistryEnabled) {
    return {
      governed: false,
      installable: input.enabled,
      inCommandPalette: input.enabled,
      keyValid,
      fingerprintMatches: fpMatches,
      reason: "registry_disabled",
    };
  }

  const installInput = {
    state: input.state,
    appRegistryEnabled: true,
    enabled: input.enabled,
    keyValid,
    fingerprintMatches: fpMatches,
    isAlphaCohortMember: alphaMember,
  };
  const installable = isInstallable(installInput);
  const inCommandPalette = appearsInCommandPalette(installInput);

  return {
    governed: true,
    installable,
    inCommandPalette,
    keyValid,
    fingerprintMatches: fpMatches,
    reason: resolveReason(input, fpMatches, keyValid, alphaMember),
  };
}

function resolveReason(
  input: RegistrationAvailabilityInput,
  fpMatches: boolean,
  keyValid: boolean,
  alphaMember: boolean,
): AvailabilityReason {
  if (!input.enabled) return "app_disabled";
  if (!fpMatches) return "integrity_changed";
  if (!satisfiesKeyRequirement({ appRegistryEnabled: true, hasKey: Boolean(input.key), keyValid })) {
    return "no_valid_key";
  }
  if (input.state === "published") return "ok";
  if (input.state === "alpha") return alphaMember ? "ok" : "alpha_restricted";
  return "not_published";
}
