export const GIB = 1024 ** 3;
export const DEFAULT_OBJECT_STORAGE_LIMIT_BYTES = 969 * GIB;

export type ObjectStorageUsageLevel =
  | "ok"
  | "warn80"
  | "warn90"
  | "protect95"
  | "blocked";

export type ObjectStorageThresholds = {
  limitBytes: number;
  warn80Bytes: number;
  warn90Bytes: number;
  protect95Bytes: number;
};

export type ObjectStorageUsageClassification = {
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
  level: ObjectStorageUsageLevel;
  uploadsProtected: boolean;
};

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function objectStorageThresholds(
  limitBytes = DEFAULT_OBJECT_STORAGE_LIMIT_BYTES,
  overrides: Partial<Omit<ObjectStorageThresholds, "limitBytes">> = {}
): ObjectStorageThresholds {
  const limit = Math.floor(positiveFinite(limitBytes, DEFAULT_OBJECT_STORAGE_LIMIT_BYTES));
  return {
    limitBytes: limit,
    warn80Bytes: Math.floor(positiveFinite(overrides.warn80Bytes ?? limit * 0.8, limit * 0.8)),
    warn90Bytes: Math.floor(positiveFinite(overrides.warn90Bytes ?? limit * 0.9, limit * 0.9)),
    protect95Bytes: Math.floor(
      positiveFinite(overrides.protect95Bytes ?? limit * 0.95, limit * 0.95)
    ),
  };
}

export function classifyObjectStorageUsage(input: {
  usedBytes: number;
  limitBytes?: number;
  warn80Bytes?: number;
  warn90Bytes?: number;
  protect95Bytes?: number;
}): ObjectStorageUsageClassification {
  const thresholds = objectStorageThresholds(input.limitBytes, {
    warn80Bytes: input.warn80Bytes,
    warn90Bytes: input.warn90Bytes,
    protect95Bytes: input.protect95Bytes,
  });
  const usedBytes = Math.max(0, Math.floor(input.usedBytes || 0));
  let level: ObjectStorageUsageLevel = "ok";
  if (usedBytes >= thresholds.limitBytes) level = "blocked";
  else if (usedBytes >= thresholds.protect95Bytes) level = "protect95";
  else if (usedBytes >= thresholds.warn90Bytes) level = "warn90";
  else if (usedBytes >= thresholds.warn80Bytes) level = "warn80";

  return {
    usedBytes,
    limitBytes: thresholds.limitBytes,
    percentUsed: thresholds.limitBytes > 0 ? usedBytes / thresholds.limitBytes : 1,
    level,
    uploadsProtected: level === "protect95" || level === "blocked",
  };
}

export function parseBytesEnv(
  value: string | undefined,
  fallback: number
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

