import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { objectStorageUsageChecks, userMediaLibrary } from "@shared/schema";
import type { JobResult } from "../scheduler";
import { logSystemEvent } from "../system-log";
import {
  DEFAULT_OBJECT_STORAGE_LIMIT_BYTES,
  classifyObjectStorageUsage,
  objectStorageThresholds,
  parseBytesEnv,
} from "./object-storage-policy";
import {
  getObjectStorageConfig,
  listObjectStorageUsage,
  verifyObjectStorageAccess,
} from "./object-storage";

export const OBJECT_STORAGE_USAGE_JOB_NAME = "object-storage-usage-check";

export function getConfiguredObjectStorageLimitBytes(): number {
  return parseBytesEnv(
    process.env.OBJECT_STORAGE_LIMIT_BYTES,
    DEFAULT_OBJECT_STORAGE_LIMIT_BYTES
  );
}

function configuredThresholds() {
  const limitBytes = getConfiguredObjectStorageLimitBytes();
  return objectStorageThresholds(limitBytes, {
    warn80Bytes: parseBytesEnv(process.env.OBJECT_STORAGE_WARN_80_BYTES, Math.floor(limitBytes * 0.8)),
    warn90Bytes: parseBytesEnv(process.env.OBJECT_STORAGE_WARN_90_BYTES, Math.floor(limitBytes * 0.9)),
    protect95Bytes: parseBytesEnv(
      process.env.OBJECT_STORAGE_PROTECT_95_BYTES,
      Math.floor(limitBytes * 0.95)
    ),
  });
}

async function estimateUsageFromDatabase(bucket: string): Promise<{
  usedBytes: number;
  objectCount: number;
  source: "database";
}> {
  const [row] = await db
    .select({
      usedBytes: sql<number>`COALESCE(SUM(${userMediaLibrary.fileSizeBytes}), 0)::bigint`,
      objectCount: sql<number>`COUNT(*)::int`,
    })
    .from(userMediaLibrary)
    .where(eq(userMediaLibrary.objectStorageBucket, bucket));
  return {
    usedBytes: Number(row?.usedBytes ?? 0),
    objectCount: Number(row?.objectCount ?? 0),
    source: "database",
  };
}

export async function latestObjectStorageUsageStatus() {
  const config = getObjectStorageConfig();
  const bucket = config?.bucket || process.env.S3_BUCKET || "";
  const rows = bucket
    ? await db
        .select()
        .from(objectStorageUsageChecks)
        .where(eq(objectStorageUsageChecks.bucket, bucket))
        .orderBy(desc(objectStorageUsageChecks.checkedAt))
        .limit(1)
    : [];
  const latest = rows[0] ?? null;
  const thresholds = configuredThresholds();
  return {
    configured: Boolean(config),
    bucket: bucket || null,
    endpoint: config?.endpoint ?? null,
    region: config?.region ?? null,
    latest,
    thresholds,
    uploadsProtected: Boolean(latest?.uploadsProtected),
  };
}

export async function shouldProtectObjectUploads(incomingBytes = 0): Promise<{
  protected: boolean;
  reason: string;
  status: Awaited<ReturnType<typeof latestObjectStorageUsageStatus>>;
}> {
  let status = await latestObjectStorageUsageStatus();
  const latestAgeMs = status.latest?.checkedAt
    ? Date.now() - new Date(status.latest.checkedAt).getTime()
    : Number.POSITIVE_INFINITY;
  if (status.configured && (!status.latest || latestAgeMs > 25 * 60 * 60 * 1000)) {
    await runObjectStorageUsageCheck();
    status = await latestObjectStorageUsageStatus();
  }
  const latest = status.latest;
  if (!status.configured) {
    return { protected: false, reason: "object_storage_not_configured", status };
  }
  if (!latest) {
    return { protected: false, reason: "no_usage_check_yet", status };
  }
  if (latest.uploadsProtected) {
    return { protected: true, reason: `usage_${latest.level}`, status };
  }
  const projected = Number(latest.usedBytes) + Math.max(0, incomingBytes);
  if (projected >= Number(latest.limitBytes)) {
    return { protected: true, reason: "incoming_upload_would_cross_limit", status };
  }
  return { protected: false, reason: "ok", status };
}

export async function runObjectStorageUsageCheck(): Promise<JobResult> {
  const config = getObjectStorageConfig();
  if (!config) {
    logSystemEvent({
      source: "storage",
      eventType: "object_storage_usage_skipped",
      severity: "warn",
      message: "Object Storage usage check skipped; S3 env is incomplete",
    });
    return {
      itemsIn: 0,
      itemsOut: 0,
      cursorAfter: { skipped: true, reason: "missing_object_storage_env" },
    };
  }

  const thresholds = configuredThresholds();
  let usage:
    | { usedBytes: number; objectCount: number; source: "s3-list" | "database" }
    | null = null;
  let error: string | null = null;

  try {
    await verifyObjectStorageAccess();
    usage = await listObjectStorageUsage();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    usage = await estimateUsageFromDatabase(config.bucket);
  }

  const classification = classifyObjectStorageUsage({
    usedBytes: usage.usedBytes,
    limitBytes: thresholds.limitBytes,
    warn80Bytes: thresholds.warn80Bytes,
    warn90Bytes: thresholds.warn90Bytes,
    protect95Bytes: thresholds.protect95Bytes,
  });

  const [row] = await db
    .insert(objectStorageUsageChecks)
    .values({
      bucket: config.bucket,
      endpoint: config.endpoint,
      region: config.region,
      usedBytes: classification.usedBytes,
      limitBytes: classification.limitBytes,
      percentUsed: classification.percentUsed.toFixed(6),
      level: classification.level,
      uploadsProtected: classification.uploadsProtected,
      accountingSource: usage.source,
      objectCount: usage.objectCount,
      error,
    })
    .returning();

  logSystemEvent({
    source: "storage",
    eventType: "object_storage_usage_checked",
    severity:
      classification.level === "blocked" || classification.level === "protect95"
        ? "error"
        : classification.level === "warn90" || classification.level === "warn80"
          ? "warn"
          : "info",
    message: `Object Storage usage ${classification.usedBytes}/${classification.limitBytes} bytes (${(
      classification.percentUsed * 100
    ).toFixed(2)}%)`,
    metadata: {
      bucket: config.bucket,
      level: classification.level,
      source: usage.source,
      objectCount: usage.objectCount,
      usageCheckId: row?.id,
    },
    error: error ?? undefined,
  });

  return {
    itemsIn: usage.objectCount,
    itemsOut: classification.usedBytes,
    cursorAfter: {
      bucket: config.bucket,
      level: classification.level,
      uploadsProtected: classification.uploadsProtected,
      usedBytes: classification.usedBytes,
      limitBytes: classification.limitBytes,
      percentUsed: classification.percentUsed,
      accountingSource: usage.source,
      error,
    },
  };
}
