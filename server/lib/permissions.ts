import { db } from "../db";
import { rolePermissions } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { UserRole, PermissionKey } from "@shared/types";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLE_ORDER } from "@shared/types";

type OverrideRow = { role: string; permissionKey: string; granted: boolean };

let overrideCache: OverrideRow[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 30_000;

async function loadOverrides(): Promise<OverrideRow[]> {
  const now = Date.now();
  if (overrideCache && now < cacheExpiry) return overrideCache;

  const rows = await db
    .select({
      role: rolePermissions.role,
      permissionKey: rolePermissions.permissionKey,
      granted: rolePermissions.granted,
    })
    .from(rolePermissions);

  overrideCache = rows;
  cacheExpiry = now + CACHE_TTL;
  return rows;
}

export function invalidatePermissionCache() {
  overrideCache = null;
  cacheExpiry = 0;
}

export async function getEffectivePermissions(
  role: UserRole
): Promise<Record<PermissionKey, boolean>> {
  const result: Record<string, boolean> = {};

  if (role === "admin" || role === "host") {
    for (const key of PERMISSION_KEYS) result[key] = true;
    return result as Record<PermissionKey, boolean>;
  }

  const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];
  for (const key of PERMISSION_KEYS) {
    result[key] = defaults.includes(key);
  }

  const overrides = await loadOverrides();
  for (const row of overrides) {
    if (row.role === role && PERMISSION_KEYS.includes(row.permissionKey)) {
      result[row.permissionKey] = row.granted;
    }
  }

  return result as Record<PermissionKey, boolean>;
}

export async function getAllRolePermissions(): Promise<
  Record<UserRole, Record<PermissionKey, boolean>>
> {
  const roles: UserRole[] = [...ROLE_ORDER];

  const result: Record<string, Record<string, boolean>> = {};
  const overrides = await loadOverrides();

  for (const role of roles) {
    const perms: Record<string, boolean> = {};

    if (role === "admin" || role === "host") {
      for (const key of PERMISSION_KEYS) perms[key] = true;
      result[role] = perms;
      continue;
    }

    const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];
    for (const key of PERMISSION_KEYS) {
      perms[key] = defaults.includes(key);
    }

    for (const row of overrides) {
      if (row.role === role && PERMISSION_KEYS.includes(row.permissionKey)) {
        perms[row.permissionKey] = row.granted;
      }
    }

    result[role] = perms;
  }

  return result as Record<UserRole, Record<PermissionKey, boolean>>;
}

export async function hasPermission(
  role: UserRole,
  permission: PermissionKey
): Promise<boolean> {
  const perms = await getEffectivePermissions(role);
  return perms[permission] ?? false;
}
