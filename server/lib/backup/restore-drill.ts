import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackupRestoreDrillProof, BackupRestoreMediaManifestProof } from "./restore-proof";
import { defaultBackupRestoreProofPath } from "./restore-proof";

export const RESTORE_DRILL_ROW_COUNT_TABLES = [
  "users",
  "user_wallets",
  "user_media_library",
  "studio_projects",
  "studio_project_files",
  "tv_channels",
  "tv_playlists",
  "tv_playlist_items",
  "challenges",
  "challenge_reward_flags",
] as const;

export type RestoreDrillDb = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
};

export function normalizedDatabaseIdentity(rawUrl: string): string {
  const url = new URL(rawUrl);
  return [
    url.protocol,
    url.hostname.toLowerCase(),
    url.port || defaultPort(url.protocol),
    url.pathname.replace(/\/+$/, ""),
  ].join("//");
}

function defaultPort(protocol: string): string {
  return protocol === "postgres:" || protocol === "postgresql:" ? "5432" : "";
}

export function assertRestoreTargetIsNotSource(sourceUrl: string, restoreUrl: string): void {
  if (normalizedDatabaseIdentity(sourceUrl) === normalizedDatabaseIdentity(restoreUrl)) {
    throw new Error("Restore drill target database must be different from DATABASE_URL");
  }
}

export function buildPgRestoreArgs(dumpPath: string, restoreDatabaseUrl: string): string[] {
  return [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--dbname",
    restoreDatabaseUrl,
    dumpPath,
  ];
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function countTable(db: RestoreDrillDb, table: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${quoteIdentifier(table)}`
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function buildRestoreDrillRowCounts(
  sourceDb: RestoreDrillDb,
  restoredDb: RestoreDrillDb,
  tables: readonly string[] = RESTORE_DRILL_ROW_COUNT_TABLES
): Promise<BackupRestoreDrillProof["rowCounts"]> {
  const rows = [];
  for (const table of tables) {
    const [backupRows, restoredRows] = await Promise.all([
      countTable(sourceDb, table),
      countTable(restoredDb, table),
    ]);
    rows.push({ table, backupRows, restoredRows });
  }
  return rows;
}

type MediaManifestRow = {
  id: number;
  owner_user_id: number;
  source_type: string;
  source_url: string;
  playback_url: string | null;
  object_storage_bucket: string | null;
  object_storage_key: string | null;
  checksum_sha256: string | null;
  status: string;
  media_category: string;
  file_size_bytes: number | null;
};

const MEDIA_MANIFEST_SQL = `
  SELECT
    id,
    owner_user_id,
    source_type,
    source_url,
    playback_url,
    object_storage_bucket,
    object_storage_key,
    checksum_sha256,
    status,
    media_category,
    file_size_bytes
  FROM user_media_library
  WHERE deleted_at IS NULL
  ORDER BY id ASC
`;

function mediaManifestChecksum(rows: MediaManifestRow[]): string {
  return createHash("sha256")
    .update(JSON.stringify(rows))
    .digest("hex");
}

function storageObjectKeys(rows: MediaManifestRow[]): Set<string> {
  return new Set(
    rows
      .map((row) =>
        row.object_storage_bucket && row.object_storage_key
          ? `${row.object_storage_bucket}/${row.object_storage_key}`
          : null
      )
      .filter((value): value is string => Boolean(value))
  );
}

export async function buildRestoreDrillMediaManifestProof(
  sourceDb: RestoreDrillDb,
  restoredDb: RestoreDrillDb
): Promise<BackupRestoreMediaManifestProof> {
  const [source, restored] = await Promise.all([
    sourceDb.query<MediaManifestRow>(MEDIA_MANIFEST_SQL),
    restoredDb.query<MediaManifestRow>(MEDIA_MANIFEST_SQL),
  ]);
  const sourceRows = source.rows;
  const restoredRows = restored.rows;
  const expectedChecksum = mediaManifestChecksum(sourceRows);
  const restoredChecksum = mediaManifestChecksum(restoredRows);
  const restoredObjectKeys = storageObjectKeys(restoredRows);
  const missingObjects = Array.from(storageObjectKeys(sourceRows)).filter(
    (key) => !restoredObjectKeys.has(key)
  ).length;

  return {
    status:
      sourceRows.length === restoredRows.length &&
      expectedChecksum === restoredChecksum &&
      missingObjects === 0
        ? "passed"
        : "failed",
    expectedRows: sourceRows.length,
    restoredRows: restoredRows.length,
    checksumSha256: restoredChecksum,
    checkedObjects: restoredObjectKeys.size,
    missingObjects,
  };
}

export async function buildRestoreDrillProof(
  sourceDb: RestoreDrillDb,
  restoredDb: RestoreDrillDb
): Promise<BackupRestoreDrillProof> {
  const [rowCounts, mediaManifest] = await Promise.all([
    buildRestoreDrillRowCounts(sourceDb, restoredDb),
    buildRestoreDrillMediaManifestProof(sourceDb, restoredDb),
  ]);
  const rowCountProof = rowCounts ?? [];
  const rowsMatch = rowCountProof.every((row) => row.backupRows === row.restoredRows);
  return {
    status: rowsMatch && mediaManifest.status === "passed" ? "passed" : "failed",
    restoredAt: new Date().toISOString(),
    source: "run-backup-restore-drill",
    rowCounts: rowCountProof,
    mediaManifest,
  };
}

export async function writeRestoreDrillProof(
  proof: BackupRestoreDrillProof,
  filepath = defaultBackupRestoreProofPath()
): Promise<string> {
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  return filepath;
}
