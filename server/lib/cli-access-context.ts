import type { Request } from "express";
import type { UserRoleInput } from "@shared/types";
import { getWtfOsAccessForRoles } from "./role-surface-access";

export type CliAccessContext = {
  role: UserRoleInput;
  accessSurfaceIds: string[];
};

export function roleFromCliRequest(req: Request): UserRoleInput {
  if (!req.user) return null;
  const user = req.user as { roles?: UserRoleInput; role?: UserRoleInput };
  return user.roles ?? user.role ?? null;
}

/** Match browser gate inputs: session wtfOsAccess when present, else role matrix. */
export async function resolveCliAccessContext(req: Request): Promise<CliAccessContext> {
  const role = roleFromCliRequest(req);
  const user = req.user as { wtfOsAccess?: { surfaceIds?: string[] } } | undefined;
  if (user?.wtfOsAccess && Array.isArray(user.wtfOsAccess.surfaceIds)) {
    return { role, accessSurfaceIds: [...user.wtfOsAccess.surfaceIds] };
  }
  const access = await getWtfOsAccessForRoles(role);
  return { role, accessSurfaceIds: access.surfaceIds };
}
