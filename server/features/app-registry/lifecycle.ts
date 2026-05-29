/**
 * App lifecycle state machine (Req5 / D4). Pure + DB-free.
 *
 *   draft → registered → alpha → published
 *
 * plus the auto state `needs-reregister` (integrity drift, Req4) and the admin
 * states `disabled` / `revoked`. Re-registration recomputes the fingerprint and
 * restores the app to an active state.
 *
 * installable = APP_REGISTRY_ENABLED && state ∈ {alpha (cohort only), published}
 *               && enabled && keyValid && fingerprintMatches
 */

export const LIFECYCLE_STATES = [
  "draft",
  "registered",
  "alpha",
  "published",
  "needs-reregister",
  "disabled",
  "revoked",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** Allowed forward/recovery transitions. */
const TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ["registered", "disabled"],
  registered: ["alpha", "published", "needs-reregister", "disabled", "revoked"],
  alpha: ["published", "registered", "needs-reregister", "disabled", "revoked"],
  published: ["needs-reregister", "disabled", "revoked", "registered"],
  // Re-register recomputes the fingerprint and can restore any active state.
  "needs-reregister": ["registered", "alpha", "published", "disabled", "revoked"],
  disabled: ["registered", "draft", "revoked"],
  revoked: ["registered"],
};

export function isLifecycleState(value: unknown): value is LifecycleState {
  return typeof value === "string" && (LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function canTransitionLifecycle(from: LifecycleState, to: LifecycleState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** States in which the app is considered "active" (could be installable given keys/flag). */
export function isActiveLifecycleState(state: LifecycleState): boolean {
  return state === "alpha" || state === "published";
}

export interface InstallableInput {
  state: LifecycleState;
  appRegistryEnabled: boolean;
  enabled: boolean;
  keyValid: boolean;
  fingerprintMatches: boolean;
  /** True if the requesting user is in the alpha cohort (test_subject / trusted_creator). */
  isAlphaCohortMember: boolean;
}

/** Resolve whether an app is installable for a given requester. */
export function isInstallable(input: InstallableInput): boolean {
  if (!input.appRegistryEnabled) return false;
  if (!input.enabled) return false;
  if (!input.keyValid) return false;
  if (!input.fingerprintMatches) return false;
  if (input.state === "published") return true;
  if (input.state === "alpha") return input.isAlphaCohortMember;
  return false;
}

/** Published apps appear in the public command palette; alpha apps never do (D4). */
export function appearsInCommandPalette(input: InstallableInput): boolean {
  return input.state === "published" && isInstallable({ ...input, isAlphaCohortMember: true });
}

/**
 * Next state after a successful (re-)registration recompute. If the app was in an
 * active state before drift we restore it; otherwise it lands in `registered`.
 */
export function lifecycleAfterReregister(previous: LifecycleState): LifecycleState {
  if (previous === "alpha" || previous === "published") return previous;
  return "registered";
}
