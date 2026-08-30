import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackupTargetResult } from "./targets/base";

export const BACKUP_RESTORE_PROOF_REQUIREMENTS = [
  "backup_created",
  "upload_recorded",
  "restore_drill_passed",
  "row_counts_match",
  "media_manifest_checked",
] as const;

export type BackupRestoreProofRequirementKey =
  (typeof BACKUP_RESTORE_PROOF_REQUIREMENTS)[number];

export type BackupRestoreDrillRowCount = {
  table: string;
  backupRows: number;
  restoredRows: number;
};

export type BackupRestoreMediaManifestProof = {
  status: "passed" | "failed" | "missing";
  expectedRows: number;
  restoredRows: number;
  checksumSha256: string | null;
  checkedObjects: number;
  missingObjects: number;
};

export type BackupRestoreDrillProof = {
  status: "passed" | "failed" | "missing";
  restoredAt?: string;
  source?: string;
  rowCounts?: BackupRestoreDrillRowCount[];
  mediaManifest?: BackupRestoreMediaManifestProof;
  error?: string;
};

export type BackupRestoreProofInput = {
  backup?: {
    filename?: string | null;
    bytes?: number | null;
    sha256?: string | null;
    createdAt?: string | null;
  } | null;
  targets?: Array<Pick<BackupTargetResult, "name" | "status" | "bytes" | "sha256Match" | "metadata">>;
  restoreDrill?: BackupRestoreDrillProof | null;
};

export type BackupRestoreProof = {
  status: "safe_to_claim" | "not_proven";
  canClaimSafety: boolean;
  generatedAt: string;
  requirements: Array<{
    key: BackupRestoreProofRequirementKey;
    ok: boolean;
    detail: string;
  }>;
  backup: BackupRestoreProofInput["backup"] | null;
  targets: BackupRestoreProofInput["targets"];
  restoreDrill: BackupRestoreDrillProof;
};

const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || "/app/backups";

export function defaultBackupRestoreProofPath(): string {
  return (
    process.env.BACKUP_RESTORE_PROOF_PATH ||
    path.join(DEFAULT_BACKUP_DIR, "restore-drill-proof.json")
  );
}

function positiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasSha256(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function rowCountsMatch(rowCounts: BackupRestoreDrillRowCount[] | undefined): boolean {
  return Boolean(
    rowCounts?.length &&
      rowCounts.every(
        (row) =>
          row.table.trim().length > 0 &&
          Number.isFinite(row.backupRows) &&
          Number.isFinite(row.restoredRows) &&
          row.backupRows === row.restoredRows
      )
  );
}

function mediaManifestChecked(mediaManifest: BackupRestoreMediaManifestProof | undefined): boolean {
  return Boolean(
    mediaManifest &&
      mediaManifest.status === "passed" &&
      mediaManifest.expectedRows === mediaManifest.restoredRows &&
      mediaManifest.missingObjects === 0 &&
      hasSha256(mediaManifest.checksumSha256)
  );
}

export function buildBackupRestoreProof(input: BackupRestoreProofInput): BackupRestoreProof {
  const backup = input.backup ?? null;
  const targets = input.targets ?? [];
  const restoreDrill: BackupRestoreDrillProof = input.restoreDrill ?? { status: "missing" };

  const backupCreated = Boolean(
    backup?.filename &&
      positiveNumber(backup.bytes) &&
      hasSha256(backup.sha256) &&
      backup.createdAt
  );
  const uploadRecorded = targets.some(
    (target) =>
      target.status === "ok" &&
      positiveNumber(target.bytes) &&
      target.sha256Match === true &&
      target.metadata?.durableDump === true &&
      target.metadata?.immutable === true
  );
  const restoreDrillPassed = restoreDrill.status === "passed";
  const countsMatch = rowCountsMatch(restoreDrill.rowCounts);
  const manifestChecked = mediaManifestChecked(restoreDrill.mediaManifest);

  const requirements: BackupRestoreProof["requirements"] = [
    {
      key: "backup_created",
      ok: backupCreated,
      detail: backupCreated
        ? `Backup artifact ${backup?.filename} has size and SHA-256.`
        : "Backup artifact filename, byte size, createdAt, and SHA-256 are required.",
    },
    {
      key: "upload_recorded",
      ok: uploadRecorded,
      detail: uploadRecorded
        ? "At least one off-host backup target recorded exact dump bytes, checksum proof, and immutable retention."
        : "No off-host immutable dump with exact bytes and matching checksum was recorded.",
    },
    {
      key: "restore_drill_passed",
      ok: restoreDrillPassed,
      detail: restoreDrillPassed
        ? `Restore drill passed${restoreDrill.restoredAt ? ` at ${restoreDrill.restoredAt}` : ""}.`
        : "A restore drill must pass before the backup can be called safe.",
    },
    {
      key: "row_counts_match",
      ok: countsMatch,
      detail: countsMatch
        ? "Restore drill row counts match the backup baseline."
        : "Restore drill row counts are missing or mismatched.",
    },
    {
      key: "media_manifest_checked",
      ok: manifestChecked,
      detail: manifestChecked
        ? "Media manifest checksum, row count, and object checks passed."
        : "Media manifest proof is missing, failed, mismatched, or lacks a checksum.",
    },
  ];

  const canClaimSafety = requirements.every((requirement) => requirement.ok);
  return {
    status: canClaimSafety ? "safe_to_claim" : "not_proven",
    canClaimSafety,
    generatedAt: new Date().toISOString(),
    requirements,
    backup,
    targets,
    restoreDrill,
  };
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeBackupRestoreProof(input: unknown): BackupRestoreProof | null {
  const proof = objectOrNull(input);
  if (!proof) return null;
  const backup = objectOrNull(proof.backup);
  const restoreDrill = objectOrNull(proof.restoreDrill);
  const mediaManifest = restoreDrill ? objectOrNull(restoreDrill.mediaManifest) : null;
  return buildBackupRestoreProof({
    backup: backup
      ? {
          filename: typeof backup.filename === "string" ? backup.filename : null,
          bytes: typeof backup.bytes === "number" ? backup.bytes : null,
          sha256: typeof backup.sha256 === "string" ? backup.sha256 : null,
          createdAt: typeof backup.createdAt === "string" ? backup.createdAt : null,
        }
      : null,
    targets: Array.isArray(proof.targets)
      ? proof.targets.map((target) => {
          const row = objectOrNull(target);
          return {
            name: typeof row?.name === "string" ? row.name : "unknown",
            status: row?.status === "ok" ? "ok" : "error",
            bytes: typeof row?.bytes === "number" ? row.bytes : 0,
            sha256Match: row?.sha256Match === false ? false : row?.sha256Match === true ? true : undefined,
            metadata: objectOrNull(row?.metadata) ?? undefined,
          };
        })
      : [],
    restoreDrill: restoreDrill
      ? {
          status:
            restoreDrill.status === "passed" || restoreDrill.status === "failed"
              ? restoreDrill.status
              : "missing",
          restoredAt:
            typeof restoreDrill.restoredAt === "string" ? restoreDrill.restoredAt : undefined,
          source: typeof restoreDrill.source === "string" ? restoreDrill.source : undefined,
          rowCounts: Array.isArray(restoreDrill.rowCounts)
            ? restoreDrill.rowCounts.map((row) => {
                const count = objectOrNull(row);
                return {
                  table: typeof count?.table === "string" ? count.table : "",
                  backupRows: typeof count?.backupRows === "number" ? count.backupRows : 0,
                  restoredRows: typeof count?.restoredRows === "number" ? count.restoredRows : 0,
                };
              })
            : undefined,
          mediaManifest: mediaManifest
            ? {
                status:
                  mediaManifest.status === "passed" || mediaManifest.status === "failed"
                    ? mediaManifest.status
                    : "missing",
                expectedRows:
                  typeof mediaManifest.expectedRows === "number"
                    ? mediaManifest.expectedRows
                    : 0,
                restoredRows:
                  typeof mediaManifest.restoredRows === "number"
                    ? mediaManifest.restoredRows
                    : 0,
                checksumSha256:
                  typeof mediaManifest.checksumSha256 === "string"
                    ? mediaManifest.checksumSha256
                    : null,
                checkedObjects:
                  typeof mediaManifest.checkedObjects === "number"
                    ? mediaManifest.checkedObjects
                    : 0,
                missingObjects:
                  typeof mediaManifest.missingObjects === "number"
                    ? mediaManifest.missingObjects
                    : 0,
              }
            : undefined,
          error: typeof restoreDrill.error === "string" ? restoreDrill.error : undefined,
        }
      : null,
  });
}

function normalizeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function readBackupRestoreDrillProof(
  filepath = defaultBackupRestoreProofPath()
): Promise<BackupRestoreDrillProof> {
  try {
    const raw = await fs.readFile(filepath, "utf8");
    const parsed = JSON.parse(raw) as BackupRestoreDrillProof;
    return {
      status: parsed.status === "passed" || parsed.status === "failed" ? parsed.status : "missing",
      restoredAt: typeof parsed.restoredAt === "string" ? parsed.restoredAt : undefined,
      source: typeof parsed.source === "string" ? parsed.source : filepath,
      rowCounts: Array.isArray(parsed.rowCounts)
        ? parsed.rowCounts.map((row) => ({
            table: String(row.table ?? ""),
            backupRows: normalizeNumber(row.backupRows),
            restoredRows: normalizeNumber(row.restoredRows),
          }))
        : undefined,
      mediaManifest: parsed.mediaManifest
        ? {
            status:
              parsed.mediaManifest.status === "passed" ||
              parsed.mediaManifest.status === "failed"
                ? parsed.mediaManifest.status
                : "missing",
            expectedRows: normalizeNumber(parsed.mediaManifest.expectedRows),
            restoredRows: normalizeNumber(parsed.mediaManifest.restoredRows),
            checksumSha256:
              typeof parsed.mediaManifest.checksumSha256 === "string"
                ? parsed.mediaManifest.checksumSha256
                : null,
            checkedObjects: normalizeNumber(parsed.mediaManifest.checkedObjects),
            missingObjects: normalizeNumber(parsed.mediaManifest.missingObjects),
          }
        : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return { status: "missing", source: filepath };
    return {
      status: "failed",
      source: filepath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
