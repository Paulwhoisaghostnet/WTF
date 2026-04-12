import type { UserRole, PermissionKey } from "@shared/types";
import { ROLE_ORDER } from "@shared/types";
import { hasPermission } from "./permissions";

export type AuthLikeUser = {
  id: number;
  role: UserRole;
};

export const ALL_USER_ROLES: UserRole[] = [...ROLE_ORDER];

export function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && ALL_USER_ROLES.includes(value as UserRole);
}

export function normalizeRole(value: unknown): UserRole {
  if (isRole(value)) return value;
  return "witness";
}

export function hasRole(user: AuthLikeUser | null | undefined, roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export async function canAccessAdminPanel(role: UserRole): Promise<boolean> {
  return hasPermission(role, "access_admin_panel");
}

export async function canModerate(role: UserRole): Promise<boolean> {
  return hasPermission(role, "delete_any_post");
}

export async function canCreateChallenges(role: UserRole): Promise<boolean> {
  return hasPermission(role, "manage_challenges");
}

export async function canManageUserRoles(role: UserRole): Promise<boolean> {
  return hasPermission(role, "manage_roles");
}

export async function canUserParticipate(role: UserRole): Promise<boolean> {
  return hasPermission(role, "submit_challenges");
}

export async function isAdminRole(role: UserRole): Promise<boolean> {
  return hasPermission(role, "access_admin_panel");
}

export async function hasRolePermission(
  role: UserRole,
  permission: PermissionKey
): Promise<boolean> {
  return hasPermission(role, permission);
}
