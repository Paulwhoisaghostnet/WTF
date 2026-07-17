import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { userDesktopSettings } from "@shared/schema";
import {
  DEFAULT_DESKTOP_APPEARANCE,
  DESKTOP_ICON_LAYOUT_KEYS,
  normalizeDesktopAppearance,
  normalizeIconLayout,
  type DesktopAppearance,
  type DesktopIconLayout,
} from "@shared/desktop";
import {
  normalizeLocalizationSettings,
  type LocalizationSettings,
} from "@shared/localization";

type DbLike = typeof db;

export type UserDesktopSettingsSnapshot = {
  appearance: DesktopAppearance;
  iconLayout: DesktopIconLayout;
  localization: LocalizationSettings;
  updatedAt: string | null;
};

export type UserDesktopSettingsUpdateResult =
  | { ok: true; settings: UserDesktopSettingsSnapshot }
  | {
      ok: false;
      code: "desktop_settings_bad_concurrency_token" | "desktop_settings_conflict";
      current?: UserDesktopSettingsSnapshot;
    };

function normalizeExpectedUpdatedAt(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export async function getUserDesktopSettings(
  userId: number,
  database: DbLike = db
): Promise<UserDesktopSettingsSnapshot> {
  const [row] = await database
    .select()
    .from(userDesktopSettings)
    .where(eq(userDesktopSettings.userId, userId));

  return {
    appearance: normalizeDesktopAppearance({
      ...DEFAULT_DESKTOP_APPEARANCE,
      ...(row?.appearance ?? {}),
    }),
    iconLayout: normalizeIconLayout(row?.iconLayout ?? {}, DESKTOP_ICON_LAYOUT_KEYS),
    localization: normalizeLocalizationSettings(row?.localization ?? {}),
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export async function updateUserDesktopSettings(
  userId: number,
  bodyValue: unknown,
  database: DbLike = db
): Promise<UserDesktopSettingsUpdateResult> {
  const body =
    bodyValue && typeof bodyValue === "object" && !Array.isArray(bodyValue)
      ? (bodyValue as Record<string, unknown>)
      : {};
  const current = await getUserDesktopSettings(userId, database);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(
    body.updatedAt !== undefined ? body.updatedAt : body.ifUnmodifiedSince
  );
  const clientProvidedConcurrencyToken =
    body.updatedAt !== undefined || body.ifUnmodifiedSince !== undefined;

  if (clientProvidedConcurrencyToken && expectedUpdatedAt === undefined) {
    return { ok: false, code: "desktop_settings_bad_concurrency_token" };
  }

  if (
    clientProvidedConcurrencyToken &&
    expectedUpdatedAt !== current.updatedAt
  ) {
    return {
      ok: false,
      code: "desktop_settings_conflict",
      current,
    };
  }

  const appearancePatch =
    body.appearance && typeof body.appearance === "object" && !Array.isArray(body.appearance)
      ? (body.appearance as Record<string, unknown>)
      : {};
  const nextAppearance = normalizeDesktopAppearance({
    ...current.appearance,
    ...appearancePatch,
  });
  const nextIconLayout =
    body.iconLayout === undefined
      ? current.iconLayout
      : normalizeIconLayout(body.iconLayout, DESKTOP_ICON_LAYOUT_KEYS);
  const nextLocalization =
    body.localization === undefined
      ? current.localization
      : normalizeLocalizationSettings(body.localization, current.localization);
  const now = new Date();
  let row: typeof userDesktopSettings.$inferSelect | undefined;

  if (!clientProvidedConcurrencyToken) {
    [row] = await database
      .insert(userDesktopSettings)
      .values({
        userId,
        appearance: nextAppearance,
        iconLayout: nextIconLayout,
        localization: nextLocalization,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userDesktopSettings.userId,
        set: {
          appearance: nextAppearance,
          iconLayout: nextIconLayout,
          localization: nextLocalization,
          updatedAt: now,
        },
      })
      .returning();
  } else if (expectedUpdatedAt === null) {
    [row] = await database
      .insert(userDesktopSettings)
      .values({
        userId,
        appearance: nextAppearance,
        iconLayout: nextIconLayout,
        localization: nextLocalization,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
  } else {
    const expectedUpdatedAtDate = new Date(String(expectedUpdatedAt));
    [row] = await database
      .update(userDesktopSettings)
      .set({
        appearance: nextAppearance,
        iconLayout: nextIconLayout,
        localization: nextLocalization,
        updatedAt: now,
      })
      .where(
        and(
          eq(userDesktopSettings.userId, userId),
          eq(userDesktopSettings.updatedAt, expectedUpdatedAtDate)
        )
      )
      .returning();
  }

  if (!row) {
    return {
      ok: false,
      code: "desktop_settings_conflict",
      current: await getUserDesktopSettings(userId, database),
    };
  }

  return {
    ok: true,
    settings: {
      appearance: normalizeDesktopAppearance(row.appearance),
      iconLayout: normalizeIconLayout(row.iconLayout, DESKTOP_ICON_LAYOUT_KEYS),
      localization: normalizeLocalizationSettings(row.localization ?? {}),
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}
