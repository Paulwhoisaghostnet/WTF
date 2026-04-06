import type { UserRole } from "@shared/types";
import {
  ADMIN_PANEL_ROLES,
  ROLE_ORDER,
  canManageRoles,
  canParticipate,
  isAdmin,
} from "@shared/types";

export type AuthLikeUser = {
  id: number;
  role: UserRole;
};

export const ALL_USER_ROLES: UserRole[] = [...ROLE_ORDER];

export const STAFF_ROLES: UserRole[] = ["admin", "host", "cohost"];

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

export function canAccessAdminPanel(role: UserRole): boolean {
  return ADMIN_PANEL_ROLES.includes(role);
}

export function canModerate(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

export function canCreateChallenges(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

export function canManageUserRoles(role: UserRole): boolean {
  return canManageRoles(role);
}

export function canUserParticipate(role: UserRole): boolean {
  return canParticipate(role);
}

export function isAdminRole(role: UserRole): boolean {
  return isAdmin(role);
}
