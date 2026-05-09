import { DESKTOP_APPS, type DesktopAppKey } from "@shared/types";
import { db } from "../db";
import { desktopAppSettings } from "@shared/schema";
import { inArray } from "drizzle-orm";

export type DesktopAppConfig = Record<DesktopAppKey, boolean>;

export const DEFAULT_DESKTOP_APP_CONFIG: DesktopAppConfig = {
  wtfiam: true,
  hoard: true,
  w: true,
  tv: true,
  dicksword: true,
  "i-hate-telegram": true,
  arcade: true,
  casino: true,
  "dues-manager": false,
  console: true,
  "game-studio": true,
  studio: true,
  gallery: true,
};

export function isDesktopAppKey(value: unknown): value is DesktopAppKey {
  return typeof value === "string" && DESKTOP_APPS.includes(value as DesktopAppKey);
}

function isMissingRelationError(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

export async function getDesktopAppConfig(): Promise<DesktopAppConfig> {
  let rows: Array<{ appKey: string; enabled: boolean }> = [];
  try {
    rows = await db
      .select({
        appKey: desktopAppSettings.appKey,
        enabled: desktopAppSettings.enabled,
      })
      .from(desktopAppSettings)
      .where(inArray(desktopAppSettings.appKey, [...DESKTOP_APPS]));
  } catch (err) {
    if (isMissingRelationError(err)) {
      return { ...DEFAULT_DESKTOP_APP_CONFIG };
    }
    throw err;
  }

  const merged: DesktopAppConfig = { ...DEFAULT_DESKTOP_APP_CONFIG };
  for (const row of rows) {
    if (isDesktopAppKey(row.appKey)) {
      merged[row.appKey] = Boolean(row.enabled);
    }
  }
  return merged;
}
