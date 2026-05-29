import { getSpineConfig } from "./config";

/**
 * Pure repo-provisioning policy (S2.4). No DB/network. Models the three repo modes from
 * the decisions ledger and the identity state machine, so transitions are unit-testable.
 *
 *  - tracking : WTF provisions a repo for EVERY account so public activity can be mirrored
 *               even before a user opts in. WTF holds the keys.
 *  - hosted   : user-requested did:plc on the users PDS; user can later take custody.
 *  - byo      : link an externally-owned DID (via OAuth) — WTF never holds keys.
 */

export type RepoMode = "tracking" | "hosted" | "byo";
export type IdentityStatus = "offered" | "requested" | "provisioning" | "active" | "failed";

export const REPO_MODES: RepoMode[] = ["tracking", "hosted", "byo"];

/** Allowed identity status transitions. */
const TRANSITIONS: Record<IdentityStatus, IdentityStatus[]> = {
  offered: ["requested", "provisioning", "active", "failed"],
  requested: ["provisioning", "active", "failed"],
  provisioning: ["active", "failed"],
  active: ["active"],
  failed: ["requested", "provisioning", "failed"],
};

export function canTransition(from: IdentityStatus, to: IdentityStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Default handle label for an auto-provisioned tracking repo. */
export function trackingHandleLabel(userId: number): string {
  return `u-${userId}`;
}

export interface ProvisionPlan {
  mode: RepoMode;
  /** Whether WTF mints + holds repo keys (tracking/hosted) or just links (byo). */
  mintsRepo: boolean;
  /** Target PDS service URL for the mint (undefined for byo). */
  pdsUrl?: string;
  /** Whether WTF retains the repo password (tracking only). */
  wtfHoldsKeys: boolean;
}

/** Resolve where/how a repo should be provisioned for a given mode. */
export function planProvision(mode: RepoMode, env: NodeJS.ProcessEnv = process.env): ProvisionPlan {
  const config = getSpineConfig(env);
  const usersPds = config.users?.url ?? config.master.url;
  if (mode === "byo") {
    return { mode, mintsRepo: false, wtfHoldsKeys: false };
  }
  return {
    mode,
    mintsRepo: true,
    pdsUrl: usersPds,
    wtfHoldsKeys: mode === "tracking",
  };
}

/** Build the provisioning email + handle for a minted repo. */
export function repoAccountIdentity(
  userId: number,
  label: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { label: string; handle: string; email: string } {
  const config = getSpineConfig(env);
  const finalLabel = (label || trackingHandleLabel(userId)).trim().toLowerCase();
  return {
    label: finalLabel,
    handle: `${finalLabel}.${config.networkDomain}`,
    email: `${finalLabel}@users.${config.networkDomain}`,
  };
}
