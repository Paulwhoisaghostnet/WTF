import { sql, type SQLWrapper } from "drizzle-orm";

export const ARCADE_SOURCE_STORAGE_MODE = "arcade_source_proxy";
export const LEGACY_ARCADE_SOURCE_STORAGE_MODE = "hackcade_proxy";

const ARCADE_SOURCE_STORAGE_MODES = [
  ARCADE_SOURCE_STORAGE_MODE,
  LEGACY_ARCADE_SOURCE_STORAGE_MODE,
] as const;

export const ARCADE_SOURCE_IMPORT_ACTION = "arcade_source_import";
export const ARCADE_SOURCE_UPDATE_ACTION = "arcade_source_update";
export const ARCADE_SOURCE_CHECK_ACTION = "arcade_source_import_check";
export const LEGACY_ARCADE_SOURCE_IMPORT_ACTION = "hackcade_import";
export const LEGACY_ARCADE_SOURCE_UPDATE_ACTION = "hackcade_update";

export function isArcadeSourceStorageMode(value: unknown): boolean {
  return ARCADE_SOURCE_STORAGE_MODES.includes(String(value || "") as any);
}

function storageModeListSql() {
  return sql.join(ARCADE_SOURCE_STORAGE_MODES.map((mode) => sql`${mode}`), sql`, `);
}

export function arcadeSourceStorageModeSql(column: SQLWrapper) {
  return sql`${column} IN (${storageModeListSql()})`;
}

export function nonArcadeSourceStorageModeSql(column: SQLWrapper) {
  return sql`(${column} IS NULL OR ${column} NOT IN (${storageModeListSql()}))`;
}

function auditActionListSql() {
  return sql.join(
    [
      ARCADE_SOURCE_IMPORT_ACTION,
      ARCADE_SOURCE_UPDATE_ACTION,
      ARCADE_SOURCE_CHECK_ACTION,
      LEGACY_ARCADE_SOURCE_IMPORT_ACTION,
      LEGACY_ARCADE_SOURCE_UPDATE_ACTION,
    ].map((action) => sql`${action}`),
    sql`, `
  );
}

export function arcadeSourceAuditActionSql(column: SQLWrapper) {
  return sql`${column} IN (${auditActionListSql()})`;
}

export function normalizeArcadeSourcePublicPath(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return value
    .replace(/^\/api\/console\/hackcade\//, "/api/arcade/source/")
    .replace(/([?&])hackcadeSlug=/g, "$1sourceSlug=");
}
