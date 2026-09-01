import { and, eq } from "drizzle-orm";
import { platformSettings } from "@shared/schema";
import type { db as defaultDb } from "../db";

export const PLATFORM_SETTINGS_MAX_VALUE_CHARS = Math.max(
  1_024,
  Math.min(512_000, Number(process.env.PLATFORM_SETTINGS_MAX_VALUE_CHARS || 32_000))
);

export class PlatformSettingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformSettingValidationError";
  }
}

export class PlatformSettingConflictError extends Error {
  constructor(message = "platform_settings row changed since last read") {
    super(message);
    this.name = "PlatformSettingConflictError";
  }
}

export function validatePlatformSettingValue(value: unknown): string {
  const normalized = String(value ?? "");
  if (normalized.length > PLATFORM_SETTINGS_MAX_VALUE_CHARS) {
    throw new PlatformSettingValidationError(
      `platform_settings value exceeds ${PLATFORM_SETTINGS_MAX_VALUE_CHARS} characters`
    );
  }
  return normalized;
}

function parseExpectedUpdatedAt(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type DbLike = typeof defaultDb;

export async function getPlatformSettingUpdatedAt(
  db: DbLike,
  key: string
): Promise<Date | null> {
  const [row] = await db
    .select({ updatedAt: platformSettings.updatedAt })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  return row?.updatedAt ?? null;
}

export async function upsertPlatformSetting(
  db: DbLike,
  params: {
    key: string;
    value: unknown;
    updatedBy?: number | null;
    expectedUpdatedAt?: unknown;
  }
): Promise<{ key: string; value: string; updatedAt: Date; updatedBy: number | null }> {
  const boundedValue = validatePlatformSettingValue(params.value);
  const expectedUpdatedAt = parseExpectedUpdatedAt(params.expectedUpdatedAt);
  const hasExpectedRevision =
    params.expectedUpdatedAt instanceof Date ||
    (typeof params.expectedUpdatedAt === "string" && params.expectedUpdatedAt.trim().length > 0);

  if (hasExpectedRevision && !expectedUpdatedAt) {
    throw new PlatformSettingValidationError("expectedUpdatedAt must be a valid timestamp");
  }

  const now = new Date(
    expectedUpdatedAt
      ? Math.max(Date.now(), expectedUpdatedAt.getTime() + 1)
      : Date.now()
  );

  if (expectedUpdatedAt) {
    const [updated] = await db
      .update(platformSettings)
      .set({
        value: boundedValue,
        updatedBy: params.updatedBy ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(platformSettings.key, params.key),
          eq(platformSettings.updatedAt, expectedUpdatedAt)
        )
      )
      .returning({
        key: platformSettings.key,
        value: platformSettings.value,
        updatedAt: platformSettings.updatedAt,
        updatedBy: platformSettings.updatedBy,
      });

    if (!updated) {
      throw new PlatformSettingConflictError();
    }

    return {
      key: updated.key,
      value: String(updated.value ?? ""),
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy ?? null,
    };
  }

  const [row] = await db
    .insert(platformSettings)
    .values({
      key: params.key,
      value: boundedValue,
      updatedBy: params.updatedBy ?? null,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: platformSettings.key,
    })
    .returning({
      key: platformSettings.key,
      value: platformSettings.value,
      updatedAt: platformSettings.updatedAt,
      updatedBy: platformSettings.updatedBy,
    });

  if (!row) {
    throw new PlatformSettingConflictError(
      "platform_settings row already exists; read its revision before updating"
    );
  }

  return {
    key: row.key,
    value: String(row.value ?? ""),
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy ?? null,
  };
}
