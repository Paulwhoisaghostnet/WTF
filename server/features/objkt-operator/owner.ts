import type { NextFunction, Request, Response } from "express";
import { listRolesForUserSnapshot } from "../../lib/user-roles";

export const DEFAULT_OBJKT_OPERATOR_OWNER_USERNAME = "wtf-admin";

export function objktOperatorOwnerUsernames(env: NodeJS.ProcessEnv = process.env) {
  const configured = String(env.OBJKT_OPERATOR_OWNER_USERNAMES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : [DEFAULT_OBJKT_OPERATOR_OWNER_USERNAME]);
}

export function isObjktOperatorOwner(
  user: { username?: string | null },
  roles: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const username = String(user.username || "").trim().toLowerCase();
  return roles.includes("admin") && objktOperatorOwnerUsernames(env).has(username);
}

export async function requireObjktOperatorOwner(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const user = req.user as { id?: number; username?: string | null };
    const roles = await listRolesForUserSnapshot(user as any);
    if (!isObjktOperatorOwner(user, roles)) {
      return res.status(403).json({ error: "Objkt Operator is private to its owner" });
    }
    return next();
  } catch (error) {
    console.error("[objkt-operator] owner check failed:", error);
    return res.status(500).json({ error: "Objkt Operator access check failed" });
  }
}
