import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { roleSurfaceAccess } from "@shared/schema";
import {
  normalizeUserRoles,
  type RoleDefinition,
  type UserRole,
  type UserRoleInput,
} from "@shared/types";
import {
  ALL_ADMIN_SURFACES,
  findAdminSurfaceForPath,
  type AdminSurface,
} from "../../client/src/features/admin-os/admin-surface-registry";
import { listRoleCatalog } from "./role-catalog";

type DbLike = typeof db;

export type RoleSurfaceAccessMatrix = Record<UserRole, Record<string, boolean>>;

const SURFACE_IDS = new Set(ALL_ADMIN_SURFACES.map((surface) => surface.id));
const ADMIN_SURFACE_KINDS = new Set<AdminSurface["kind"]>(["admin-tool"]);
const EXPERIMENTAL_SURFACE_IDS = new Set(["ux-lab", "skywire", "wtf-live"]);

function isMissingRelationError(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

export function isKnownSurfaceId(surfaceId: string): boolean {
  return SURFACE_IDS.has(surfaceId);
}

export function defaultRoleCanAccessSurface(
  role: UserRole,
  surface: AdminSurface,
  roleDefinition?: RoleDefinition
): boolean {
  if (role === "time_out") return false;
  if (role === "admin") return true;
  if (role === "test_subject" && EXPERIMENTAL_SURFACE_IDS.has(surface.id)) {
    return true;
  }
  if (!roleDefinition?.defaultWtfOsAccess) return false;
  if (ADMIN_SURFACE_KINDS.has(surface.kind) || surface.domain === "Admin") {
    return false;
  }
  return true;
}

async function loadOverrides(database: DbLike = db) {
  try {
    return await database
      .select({
        role: roleSurfaceAccess.role,
        surfaceId: roleSurfaceAccess.surfaceId,
        granted: roleSurfaceAccess.granted,
      })
      .from(roleSurfaceAccess)
      .where(inArray(roleSurfaceAccess.surfaceId, [...SURFACE_IDS]));
  } catch (err) {
    if (isMissingRelationError(err)) return [];
    throw err;
  }
}

export async function getRoleSurfaceAccessMatrix(
  database: DbLike = db
): Promise<RoleSurfaceAccessMatrix> {
  const roleCatalog = await listRoleCatalog(database);
  const overrides = await loadOverrides(database);
  const matrix = Object.fromEntries(
    roleCatalog.map((roleDefinition) => [
      roleDefinition.slug,
      Object.fromEntries(
        ALL_ADMIN_SURFACES.map((surface) => [
          surface.id,
          defaultRoleCanAccessSurface(roleDefinition.slug, surface, roleDefinition),
        ])
      ),
    ])
  ) as RoleSurfaceAccessMatrix;

  for (const row of overrides) {
    if (matrix[row.role] && SURFACE_IDS.has(row.surfaceId)) {
      matrix[row.role][row.surfaceId] = row.granted;
    }
  }

  return matrix;
}

export async function getAccessibleSurfaceIdsForRoles(
  roles: UserRoleInput,
  database: DbLike = db
): Promise<string[]> {
  const normalizedRoles = normalizeUserRoles(roles);
  if (normalizedRoles.length === 0) return [];

  const matrix = await getRoleSurfaceAccessMatrix(database);
  const surfaceIds = new Set<string>();
  for (const role of normalizedRoles) {
    for (const [surfaceId, granted] of Object.entries(matrix[role] ?? {})) {
      if (granted) surfaceIds.add(surfaceId);
    }
  }
  return [...surfaceIds].sort();
}

export async function getWtfOsAccessForRoles(roles: UserRoleInput, database: DbLike = db) {
  const surfaceIds = await getAccessibleSurfaceIdsForRoles(roles, database);
  const allowed = new Set(surfaceIds);
  const surfaces = ALL_ADMIN_SURFACES.filter((surface) => allowed.has(surface.id));
  return {
    surfaceIds,
    routePatterns: [...new Set(surfaces.flatMap((surface) => surface.routePatterns))].sort(),
    adminPanelTabs: [...new Set(surfaces.flatMap((surface) => surface.adminPanelTabs))].sort(),
    automationHandles: [...new Set(surfaces.flatMap((surface) => surface.automationHandles))].sort(),
  };
}

export function surfaceIdForPath(path: string): string | null {
  return findAdminSurfaceForPath(path)?.id ?? null;
}

export async function setRoleSurfaceAccess(
  role: UserRole,
  surfaceId: string,
  granted: boolean,
  updatedBy: number | null,
  database: DbLike = db
) {
  await database
    .insert(roleSurfaceAccess)
    .values({
      role,
      surfaceId,
      granted,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [roleSurfaceAccess.role, roleSurfaceAccess.surfaceId],
      set: {
        granted,
        updatedBy,
        updatedAt: new Date(),
      },
    });
}

export async function resetRoleSurfaceAccess(role?: UserRole, database: DbLike = db) {
  if (role) {
    await database.delete(roleSurfaceAccess).where(eq(roleSurfaceAccess.role, role));
  } else {
    await database.delete(roleSurfaceAccess);
  }
}
