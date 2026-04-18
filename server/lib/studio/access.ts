/**
 * Studio access / membership helpers.
 *
 * The single source of truth for "what can user X do to project Y".
 * Route handlers and WebSocket handlers both call through here rather
 * than re-implementing the membership + role checks.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  studioProjectMembers,
  studioProjects,
  type studioProjects as _studioProjects,
} from "@shared/schema";
import {
  studioRoleCanAnnotate,
  studioRoleCanChat,
  studioRoleCanEditFiles,
  studioRoleCanInvite,
  studioRoleCanManageProject,
  type StudioMemberRole,
  type UserRole,
} from "@shared/types";
import { hasPermission } from "../permissions";

export type StudioProjectRow = typeof _studioProjects.$inferSelect;

export interface StudioAccess {
  project: StudioProjectRow;
  /**
   * Effective role for the caller on this project.  Admins/hosts get
   * "owner" semantics without needing to be a member.
   */
  role: StudioMemberRole;
  /** True when the caller is a platform moderator overriding membership. */
  isPlatformModerator: boolean;
  /** True when the caller is a recorded member of the project. */
  isMember: boolean;
}

export async function loadProject(
  projectId: number
): Promise<StudioProjectRow | null> {
  const [row] = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  return row ?? null;
}

export async function loadProjectMemberRole(
  projectId: number,
  userId: number
): Promise<StudioMemberRole | null> {
  const [member] = await db
    .select({ role: studioProjectMembers.role })
    .from(studioProjectMembers)
    .where(
      and(
        eq(studioProjectMembers.projectId, projectId),
        eq(studioProjectMembers.userId, userId)
      )
    )
    .limit(1);
  return (member?.role as StudioMemberRole | undefined) ?? null;
}

/**
 * Resolve whether the caller has any access to the project, and at
 * what effective role.  Platform moderators override membership.
 */
export async function resolveStudioAccess(
  projectId: number,
  user: { id: number; role: UserRole }
): Promise<StudioAccess | null> {
  const project = await loadProject(projectId);
  if (!project) return null;

  const platformMod = await hasPermission(user.role, "manage_studio");
  const memberRole = await loadProjectMemberRole(projectId, user.id);

  if (!memberRole && !platformMod) {
    return null;
  }

  const role: StudioMemberRole = platformMod
    ? "owner"
    : (memberRole as StudioMemberRole);

  return {
    project,
    role,
    isPlatformModerator: platformMod,
    isMember: Boolean(memberRole),
  };
}

/* ── Capability helpers ────────────────────────────────── */

export function canViewProject(_access: StudioAccess): boolean {
  return true; // resolveStudioAccess already gates view access.
}

export function canEditFiles(access: StudioAccess): boolean {
  return studioRoleCanEditFiles(access.role);
}

export function canAnnotate(access: StudioAccess): boolean {
  return studioRoleCanAnnotate(access.role);
}

export function canChat(access: StudioAccess): boolean {
  return studioRoleCanChat(access.role);
}

export function canInvite(access: StudioAccess): boolean {
  return studioRoleCanInvite(access.role);
}

export function canManageProject(access: StudioAccess): boolean {
  return studioRoleCanManageProject(access.role) || access.isPlatformModerator;
}

/** Shortcut: throw a 403-style error if the capability check fails. */
export class StudioAccessError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "StudioAccessError";
    this.status = status;
  }
}

export async function requireStudioAccess(
  projectId: number,
  user: { id: number; role: UserRole },
  capability: (access: StudioAccess) => boolean,
  capabilityLabel: string
): Promise<StudioAccess> {
  const access = await resolveStudioAccess(projectId, user);
  if (!access) {
    throw new StudioAccessError(404, "Project not found or access denied");
  }
  if (!capability(access)) {
    throw new StudioAccessError(
      403,
      `Not allowed to ${capabilityLabel} in this project`
    );
  }
  return access;
}
