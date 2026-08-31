import { normalizeUserRoles, type UserRoleInput } from "@shared/types";

export type LegacyChannelAccessLevel =
  | "all"
  | "contestants"
  | "hosts"
  | "witnesses";

const LEGACY_CHANNEL_AUDIENCES: Record<
  Exclude<LegacyChannelAccessLevel, "all">,
  ReadonlySet<string>
> = {
  contestants: new Set(["admin", "host", "cohost", "contestant", "season_3_contestant"]),
  hosts: new Set(["admin", "host", "cohost"]),
  witnesses: new Set(["admin", "host", "cohost", "witness"]),
};

export function canAccessLegacyChannel(
  accessLevel: string,
  roles: UserRoleInput,
): boolean {
  const normalizedRoles = normalizeUserRoles(roles);
  if (normalizedRoles.length === 0) return false;
  if (accessLevel === "all") return true;
  if (!(accessLevel in LEGACY_CHANNEL_AUDIENCES)) return false;
  const audience = LEGACY_CHANNEL_AUDIENCES[
    accessLevel as Exclude<LegacyChannelAccessLevel, "all">
  ];
  return normalizedRoles.some((role) => audience.has(role));
}
