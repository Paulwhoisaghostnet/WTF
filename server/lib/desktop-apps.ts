import { DESKTOP_APPS } from "@shared/types";
import {
  DEFAULT_DESKTOP_APP_CONFIG,
  isDesktopAppKey,
  type DesktopAppConfig,
} from "@shared/desktop-apps";
import { db } from "../db";
import { desktopAppSettings } from "@shared/schema";
import { inArray } from "drizzle-orm";

export { DEFAULT_DESKTOP_APP_CONFIG, isDesktopAppKey, type DesktopAppConfig };

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
