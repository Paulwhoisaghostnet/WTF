import { asc } from "drizzle-orm";
import { db } from "../db";
import { roles as rolesTable } from "@shared/schema";
import {
  DEFAULT_ROLE_CATALOG,
  ROLE_LABELS,
  type RoleDefinition,
  type UserRole,
} from "@shared/types";

type DbLike = typeof db;

const ROLE_SLUG_RE = /^[a-z][a-z0-9_:-]{1,63}$/;

function isMissingRelationError(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

function normalizeRoleRow(row: typeof rolesTable.$inferSelect): RoleDefinition {
  return {
    slug: row.slug,
    label: row.label,
    category: row.category,
    purpose: row.purpose,
    description: row.description,
    accessLevel: row.accessLevel,
    sortOrder: row.sortOrder,
    color: row.color,
    icon: row.icon,
    defaultWtfOsAccess: row.defaultWtfOsAccess,
    isSystem: row.isSystem,
    isAssignable: row.isAssignable,
  };
}

function fallbackRoleCatalog(): RoleDefinition[] {
  return DEFAULT_ROLE_CATALOG.map((role) => ({ ...role }));
}

export function isValidRoleSlug(slug: unknown): slug is UserRole {
  return typeof slug === "string" && ROLE_SLUG_RE.test(slug);
}

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export async function listRoleCatalog(database: DbLike = db): Promise<RoleDefinition[]> {
  try {
    const rows = await database
      .select()
      .from(rolesTable)
      .orderBy(asc(rolesTable.sortOrder), asc(rolesTable.label), asc(rolesTable.slug));
    return rows.length > 0 ? rows.map(normalizeRoleRow) : fallbackRoleCatalog();
  } catch (err) {
    if (isMissingRelationError(err)) return fallbackRoleCatalog();
    throw err;
  }
}

export async function roleExists(role: UserRole, database: DbLike = db): Promise<boolean> {
  if (!isValidRoleSlug(role)) return false;
  const catalog = await listRoleCatalog(database);
  return catalog.some((entry) => entry.slug === role);
}

export async function assignableRoleExists(role: UserRole, database: DbLike = db): Promise<boolean> {
  if (!isValidRoleSlug(role)) return false;
  const catalog = await listRoleCatalog(database);
  return catalog.some((entry) => entry.slug === role && entry.isAssignable);
}

export async function upsertRoleDefinition(
  input: {
    slug: string;
    label: string;
    category: string;
    purpose: string;
    description?: string | null;
    accessLevel?: number;
    sortOrder?: number;
    color?: string | null;
    icon?: string | null;
    defaultWtfOsAccess?: boolean;
    isAssignable?: boolean;
  },
  database: DbLike = db
): Promise<RoleDefinition> {
  const slug = input.slug.trim().toLowerCase();
  if (!isValidRoleSlug(slug)) {
    throw new Error("Role slug must start with a letter and use lowercase letters, numbers, _, :, or -.");
  }
  const label = input.label.trim();
  if (!label) throw new Error("Role label is required.");
  const category = input.category.trim().toLowerCase() || "access";
  const purpose = input.purpose.trim();
  if (!purpose) throw new Error("Role purpose is required.");

  const [row] = await database
    .insert(rolesTable)
    .values({
      slug,
      label,
      category,
      purpose,
      description: input.description?.trim() || null,
      accessLevel: Number.isFinite(input.accessLevel) ? Number(input.accessLevel) : 0,
      sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 1000,
      color: input.color?.trim() || null,
      icon: input.icon?.trim() || null,
      defaultWtfOsAccess: Boolean(input.defaultWtfOsAccess),
      isAssignable: input.isAssignable ?? true,
      isSystem: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: rolesTable.slug,
      set: {
        label,
        category,
        purpose,
        description: input.description?.trim() || null,
        accessLevel: Number.isFinite(input.accessLevel) ? Number(input.accessLevel) : 0,
        sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 1000,
        color: input.color?.trim() || null,
        icon: input.icon?.trim() || null,
        defaultWtfOsAccess: Boolean(input.defaultWtfOsAccess),
        isAssignable: input.isAssignable ?? true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return normalizeRoleRow(row);
}
