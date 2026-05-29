import { createHash, randomBytes } from "node:crypto";

/**
 * App key policy (Req3 / D2). Pure rules + key material minting, DB-free so it is
 * unit testable. Keys authorize an app to operate on wtfOS.
 *
 *   format : wtfapp_<appIdSlug>_<rand>
 *   storage: sha256 hash + short prefix only (never the secret)
 *   valid  : revokedAt == null AND disabledAt == null AND boundFingerprint === current
 *
 * Keys are MANDATORY only when APP_REGISTRY_ENABLED. The legacy "null key is
 * active" path (mirrors server/lib/desktop-apps.ts) stays ONLY when the flag is
 * off — see availability.ts.
 */

export const APP_KEY_PREFIX = "wtfapp";
export const KEY_DISABLED_INTEGRITY = "integrity_changed";

export interface AppKeyMaterial {
  /** The full secret. Returned ONCE on issue; never stored. */
  key: string;
  /** Short, non-secret prefix persisted for display (<= 24 chars). */
  prefix: string;
  /** sha256 hash persisted for verification. */
  hash: string;
}

/** Normalize an appId ("desktop:hoard") into a key-safe slug ("desktop-hoard"). */
export function appIdToKeySlug(appId: string): string {
  return appId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function hashAppKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function createAppKeyMaterial(
  appId: string,
  rand: () => string = () => randomBytes(24).toString("hex"),
): AppKeyMaterial {
  const secret = `${APP_KEY_PREFIX}_${appIdToKeySlug(appId)}_${rand()}`;
  return {
    key: secret,
    prefix: secret.slice(0, 24),
    hash: hashAppKey(secret),
  };
}

export interface AppKeyState {
  revokedAt: Date | null;
  disabledAt: Date | null;
  boundFingerprint: string | null;
}

/**
 * Core key-validity rule (D2). A key is valid iff it is neither revoked nor
 * disabled AND its bound fingerprint still equals the app's current integrity
 * fingerprint. A drifted fingerprint (Req4) makes the key invalid even before the
 * verifier flips disabledAt.
 */
export function isAppKeyValid(state: AppKeyState, currentFingerprint: string | null): boolean {
  if (state.revokedAt) return false;
  if (state.disabledAt) return false;
  if (!state.boundFingerprint || !currentFingerprint) return false;
  return state.boundFingerprint === currentFingerprint;
}

export interface KeyRequirementInput {
  appRegistryEnabled: boolean;
  hasKey: boolean;
  keyValid: boolean;
}

/**
 * Whether an app currently satisfies the key requirement.
 *  - flag ON  : a valid key is MANDATORY.
 *  - flag OFF : legacy behaviour — no key required (registry does not govern).
 */
export function satisfiesKeyRequirement(input: KeyRequirementInput): boolean {
  if (!input.appRegistryEnabled) return true;
  return input.hasKey && input.keyValid;
}
