import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { users, userRoles } from "@shared/schema";
import {
  isSystemUserRole,
  normalizeUserRoles,
  type UserRole,
  type UserRoleInput,
} from "@shared/types";

type DbLike = typeof db;
type UserLike = {
  id?: number | null;
  role?: UserRole | string | null;
  roles?: readonly UserRole[] | readonly string[] | null;
};

function isMissingRelationError(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

function isValidRole(role: unknown): role is UserRole {
  return typeof role === "string" && role.trim().length > 0;
}

function legacyRoleShadow(roles: readonly UserRole[]): (typeof users.$inferSelect)["role"] {
  const systemRole = roles.find(isSystemUserRole);
  return (systemRole ?? "witness") as (typeof users.$inferSelect)["role"];
}

export function normalizeRoleSet(roles: UserRoleInput): UserRole[] {
  const normalized = normalizeUserRoles(roles);
  return normalized.length > 0 ? normalized : ["witness"];
}

export function rolesFromUserSnapshot(user: UserLike | null | undefined): UserRole[] {
  const snapshotRoles = Array.isArray(user?.roles)
    ? user.roles.filter(isValidRole)
    : [];
  if (snapshotRoles.length > 0) return normalizeRoleSet(snapshotRoles);
  return normalizeRoleSet(isValidRole(user?.role) ? user.role : "witness");
}

export async function listUserRoles(
  userId: number,
  fallbackRole: UserRole = "witness",
  database: DbLike = db
): Promise<UserRole[]> {
  try {
    const rows = await database
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    const roles = rows.map((row) => row.role).filter(isValidRole);
    return normalizeRoleSet(roles.length > 0 ? roles : fallbackRole);
  } catch (err) {
    if (isMissingRelationError(err)) return normalizeRoleSet(fallbackRole);
    throw err;
  }
}

export async function listRolesForUserSnapshot(
  user: UserLike | null | undefined,
  database: DbLike = db
): Promise<UserRole[]> {
  const fallback = rolesFromUserSnapshot(user)[0] ?? "witness";
  if (!user?.id) return normalizeRoleSet(fallback);
  return listUserRoles(Number(user.id), fallback, database);
}

export async function ensureUserRole(
  userId: number,
  role: UserRole,
  assignedBy: number | null = null,
  database: DbLike = db
) {
  try {
    await database
      .insert(userRoles)
      .values({
        userId,
        role,
        assignedBy,
        assignedAt: new Date(),
      })
      .onConflictDoNothing();
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
  }
}

export async function removeUserRole(
  userId: number,
  role: UserRole,
  database: DbLike = db
) {
  try {
    await database
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
  }
}

export async function replacePrimaryUserRole(
  userId: number,
  role: UserRole,
  assignedBy: number | null = null,
  database: DbLike = db
) {
  const legacyRole = legacyRoleShadow([role]);
  const [updated] = await database
    .update(users)
    .set({ role: legacyRole, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (updated) await ensureUserRole(userId, role, assignedBy, database);
  return updated;
}

export async function setUserRoles(
  userId: number,
  roles: UserRoleInput,
  assignedBy: number | null = null,
  database: DbLike = db
) {
  const normalized = normalizeRoleSet(roles);
  const legacyRole = legacyRoleShadow(normalized);
  try {
    await database.delete(userRoles).where(eq(userRoles.userId, userId));
    await database.insert(userRoles).values(
      normalized.map((role) => ({
        userId,
        role,
        assignedBy,
        assignedAt: new Date(),
      }))
    );
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
  }

  const [updated] = await database
    .update(users)
    .set({ role: legacyRole, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  return updated ? { ...updated, role: legacyRole, roles: normalized } : null;
}
