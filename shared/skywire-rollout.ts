import { canOpenAppsForRole, normalizeUserRoles, type UserRole, type UserRoleInput } from "./types";

export type SkywireRolloutMode = "staff_alpha" | "all_users" | "disabled";

/** Roles that may use Skywire + WTF LIVE during staff-alpha rollout. */
export const SKYWIRE_STAFF_ALPHA_ROLES = [
  "admin",
  "host",
  "cohost",
  "resident_wizard",
  "test_subject",
] as const satisfies readonly UserRole[];

export type SkywireStaffAlphaRole = (typeof SKYWIRE_STAFF_ALPHA_ROLES)[number];

export type SkywireRolloutConfig = {
  rolloutMode: SkywireRolloutMode;
  wtfLiveEnabled: boolean;
  atprotoEnabled: boolean;
};

function truthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function rolloutMode(raw: string | undefined): SkywireRolloutMode {
  if (raw === "all_users" || raw === "disabled" || raw === "staff_alpha") {
    return raw;
  }
  return "staff_alpha";
}

export function getSkywireRolloutConfig(
  env: Partial<Pick<NodeJS.ProcessEnv, "SKYWIRE_ROLLOUT_MODE" | "SKYWIRE_WTF_LIVE_ENABLED" | "ATPROTO_ENABLED">> = process.env
): SkywireRolloutConfig {
  return {
    rolloutMode: rolloutMode(env.SKYWIRE_ROLLOUT_MODE),
    wtfLiveEnabled: env.SKYWIRE_WTF_LIVE_ENABLED !== "false",
    atprotoEnabled: env.ATPROTO_ENABLED !== "false",
  };
}

export function userEligibleForSkywireRollout(
  role: UserRoleInput,
  config: SkywireRolloutConfig = getSkywireRolloutConfig()
): boolean {
  const roles = normalizeUserRoles(role);
  if (!canOpenAppsForRole(roles)) return false;
  if (!config.atprotoEnabled) return roles.includes("admin");
  if (roles.includes("admin")) return true;
  if (config.rolloutMode === "disabled") return false;
  if (config.rolloutMode === "all_users") return roles.length > 0;
  return roles.some((candidate) =>
    SKYWIRE_STAFF_ALPHA_ROLES.includes(candidate as SkywireStaffAlphaRole)
  );
}

export function userEligibleForWtfLive(
  role: UserRoleInput,
  config: SkywireRolloutConfig = getSkywireRolloutConfig()
): boolean {
  if (!config.wtfLiveEnabled) return normalizeUserRoles(role).includes("admin");
  return userEligibleForSkywireRollout(role, config);
}
