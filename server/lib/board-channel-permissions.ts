import { db } from "../db";
import { boardChannelPermissions, boardThreadReplies } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import type { UserRole } from "@shared/types";
import { ROLE_ORDER } from "@shared/types";
import { isRole } from "./roles";
import { hasPermission } from "./permissions";

export const ALL_ROLES: UserRole[] = [...ROLE_ORDER];

export interface PermRow {
  targetType: string;
  targetRole: string | null;
  targetUserId: number | null;
  allowView: boolean | null;
  allowPost: boolean | null;
  allowManage: boolean | null;
  allowReact: boolean | null;
  allowAttach: boolean | null;
}

export function parseRoles(input: unknown, fallback: UserRole[] = ALL_ROLES): UserRole[] {
  if (!Array.isArray(input)) return [...fallback];
  const normalized = input.filter(isRole) as UserRole[];
  return normalized.length === 0 ? [...fallback] : Array.from(new Set(normalized));
}

function resolvePermission(
  perms: PermRow[],
  userRole: UserRole,
  userId: number | null,
  field: keyof Pick<PermRow, "allowView" | "allowPost" | "allowManage" | "allowReact" | "allowAttach">
): boolean | null {
  if (userId) {
    const userPerm = perms.find(
      (p) => p.targetType === "user" && p.targetUserId === userId
    );
    if (userPerm && userPerm[field] !== null) return userPerm[field]!;
  }
  const rolePerm = perms.find(
    (p) => p.targetType === "role" && p.targetRole === userRole
  );
  if (rolePerm && rolePerm[field] !== null) return rolePerm[field]!;
  return null;
}

export async function getChannelPerms(channelId: number): Promise<PermRow[]> {
  return db
    .select()
    .from(boardChannelPermissions)
    .where(eq(boardChannelPermissions.channelId, channelId));
}

export async function checkChannelSlowMode(
  channelId: number,
  userId: number,
  seconds: number
): Promise<string | null> {
  if (seconds <= 0) return null;

  const [lastMessage] = await db
    .select({ createdAt: boardThreadReplies.createdAt })
    .from(boardThreadReplies)
    .where(
      and(
        eq(boardThreadReplies.threadId, channelId),
        eq(boardThreadReplies.userId, userId)
      )
    )
    .orderBy(desc(boardThreadReplies.createdAt))
    .limit(1);

  if (!lastMessage?.createdAt) return null;

  const diff = Date.now() - new Date(lastMessage.createdAt).getTime();
  const waitMs = seconds * 1000;
  if (diff < waitMs) {
    const remaining = Math.ceil((waitMs - diff) / 1000);
    return `Slow mode: wait ${remaining}s`;
  }
  return null;
}

export function canViewChannel(
  channel: { viewRoles: unknown },
  perms: PermRow[],
  role: UserRole,
  userId: number | null
): boolean {
  const override = resolvePermission(perms, role, userId, "allowView");
  if (override !== null) return override;
  const viewRoles = parseRoles(channel.viewRoles, ALL_ROLES);
  return viewRoles.includes(role);
}

export async function canPostInChannel(
  channel: { replyRoles: unknown; locked: boolean },
  perms: PermRow[],
  role: UserRole,
  userId: number | null
): Promise<boolean> {
  if (channel.locked) return hasPermission(role, "delete_any_post");
  const override = resolvePermission(perms, role, userId, "allowPost");
  if (override !== null) return override;
  const replyRoles = parseRoles(channel.replyRoles, []);
  return replyRoles.includes(role);
}

export function canReactInChannel(
  channel: { viewRoles: unknown },
  perms: PermRow[],
  role: UserRole,
  userId: number | null
): boolean {
  const override = resolvePermission(perms, role, userId, "allowReact");
  if (override !== null) return override;
  return canViewChannel(channel, perms, role, userId);
}

export async function canManageChannel(
  perms: PermRow[],
  role: UserRole,
  userId: number | null
): Promise<boolean> {
  const override = resolvePermission(perms, role, userId, "allowManage");
  if (override !== null) return override;
  return hasPermission(role, "delete_any_post");
}
