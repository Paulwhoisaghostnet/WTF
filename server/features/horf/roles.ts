import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { userRoles, users } from "@shared/schema";
import { HORF_MARSHAL_ROLE, isAdmin } from "@shared/types";

/** Always read canonical role assignments, so revocation takes effect now. */
export async function currentHorfRole(req: Request): Promise<{ userId: number; admin: boolean; marshal: boolean } | null> {
  if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated()) return null;
  const userId = Number((req.user as { id?: unknown } | undefined)?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  let roles = rows.map((row) => row.role);
  if (roles.length === 0) {
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    roles = user ? [user.role] : [];
  }
  return { userId, admin: isAdmin(roles), marshal: roles.includes(HORF_MARSHAL_ROLE) };
}
