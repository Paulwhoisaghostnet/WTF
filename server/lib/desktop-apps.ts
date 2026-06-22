import { createHash, randomBytes } from "crypto";
import { DESKTOP_APPS } from "@shared/types";
import {
  DEFAULT_DESKTOP_APP_CONFIG,
  DESKTOP_APP_INSTALL_GRACE_HOURS,
  type DesktopAppDocStatus,
  type DesktopAppRegistrationView,
  type DesktopAppsResponse,
  isDesktopAppKey,
  type DesktopAppConfig,
} from "@shared/desktop-apps";
import { getDesktopAppDocumentation } from "@shared/desktop-apps";
import { db } from "../db";
import { desktopAppSettings } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { isDesktopAppRuntimeAvailable } from "./desktop-app-runtime";

export {
  DEFAULT_DESKTOP_APP_CONFIG,
  DESKTOP_APP_INSTALL_GRACE_HOURS,
  isDesktopAppKey,
  type DesktopAppConfig,
  type DesktopAppDocStatus,
  type DesktopAppRegistrationView,
  type DesktopAppsResponse,
};

const DESKTOP_APP_INSTALL_GRACE_MS = DESKTOP_APP_INSTALL_GRACE_HOURS * 60 * 60 * 1000;

function isMissingRelationError(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function normalizeDocStatus(value: unknown): DesktopAppDocStatus {
  return value === "registered" || value === "stale" || value === "revoked"
    ? value
    : "pending";
}

function isInstallKeyActive(row: {
  installKeyHash: string | null;
  installKeyRevokedAt: Date | null;
  installKeyExpiresAt: Date | null;
}, now: Date): boolean {
  if (!row.installKeyHash) return true;
  if (row.installKeyRevokedAt) return false;
  if (row.installKeyExpiresAt && row.installKeyExpiresAt.getTime() < now.getTime()) return false;
  return true;
}

function isDocsFresh(row: {
  docStatus: DesktopAppDocStatus;
  docsUpdatedAt: Date | null;
  docsExpiresAt: Date | null;
}, now: Date): boolean {
  if (row.docStatus === "revoked") return false;
  if (row.docStatus === "stale") return false;
  if (!row.docsUpdatedAt) return row.docStatus === "registered";
  const expiresAt = row.docsExpiresAt ?? addHours(row.docsUpdatedAt, DESKTOP_APP_INSTALL_GRACE_HOURS);
  return expiresAt.getTime() >= now.getTime();
}

function isDesktopAppInstallable(row: {
  enabled: boolean;
  docStatus: DesktopAppDocStatus;
  docsUpdatedAt: Date | null;
  docsExpiresAt: Date | null;
  installKeyHash: string | null;
  installKeyRevokedAt: Date | null;
  installKeyExpiresAt: Date | null;
}, now: Date): boolean {
  return (
    row.enabled &&
    isDocsFresh(row, now) &&
    isInstallKeyActive(row, now)
  );
}

function buildDefaultRegistrationView(
  appKey: (typeof DESKTOP_APPS)[number],
  now: Date
): DesktopAppRegistrationView {
  return {
    key: appKey,
    enabled: DEFAULT_DESKTOP_APP_CONFIG[appKey],
    docStatus: "registered",
    docRegistryVersion: "1",
    docsUpdatedAt: null,
    docsExpiresAt: null,
    installKeyPrefix: null,
    installKeyIssuedAt: null,
    installKeyExpiresAt: null,
    installKeyRevokedAt: null,
    registeredBy: null,
    registeredAt: null,
    updatedBy: null,
    updatedAt: now.toISOString(),
    installable: DEFAULT_DESKTOP_APP_CONFIG[appKey],
    documentation: getDesktopAppDocumentation(appKey),
  };
}

function buildRegistrationView(
  appKey: (typeof DESKTOP_APPS)[number],
  row: {
    enabled: boolean;
    docStatus: unknown;
    docRegistryVersion: string;
    docsUpdatedAt: Date | null;
    docsExpiresAt: Date | null;
    installKeyHash: string | null;
    installKeyPrefix: string | null;
    installKeyIssuedAt: Date | null;
    installKeyExpiresAt: Date | null;
    installKeyRevokedAt: Date | null;
    registeredBy: number | null;
    registeredAt: Date | null;
    updatedBy: number | null;
    updatedAt: Date;
  } | null,
  now: Date
): DesktopAppRegistrationView {
  if (!row) return buildDefaultRegistrationView(appKey, now);
  const docStatus = normalizeDocStatus(row.docStatus);
  const docsExpiresAt = row.docsExpiresAt ?? (row.docsUpdatedAt ? addHours(row.docsUpdatedAt, DESKTOP_APP_INSTALL_GRACE_HOURS) : null);
  const installKeyActive = isInstallKeyActive(row, now);
  const docsFresh = isDocsFresh(
    {
      docStatus,
      docsUpdatedAt: row.docsUpdatedAt,
      docsExpiresAt,
    },
    now
  );
  return {
    key: appKey,
    enabled: row.enabled,
    docStatus: docsFresh ? docStatus : docStatus === "registered" ? "stale" : docStatus,
    docRegistryVersion: row.docRegistryVersion,
    docsUpdatedAt: toIso(row.docsUpdatedAt),
    docsExpiresAt: toIso(docsExpiresAt),
    installKeyPrefix: row.installKeyPrefix,
    installKeyIssuedAt: toIso(row.installKeyIssuedAt),
    installKeyExpiresAt: toIso(row.installKeyExpiresAt),
    installKeyRevokedAt: toIso(row.installKeyRevokedAt),
    registeredBy: row.registeredBy,
    registeredAt: toIso(row.registeredAt),
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
    installable: isDesktopAppInstallable(
      {
        enabled: row.enabled,
        docStatus,
        docsUpdatedAt: row.docsUpdatedAt,
        docsExpiresAt,
        installKeyHash: row.installKeyHash,
        installKeyRevokedAt: row.installKeyRevokedAt,
        installKeyExpiresAt: row.installKeyExpiresAt,
      },
      now
    ) && installKeyActive,
    documentation: getDesktopAppDocumentation(appKey),
  };
}

function registrationRowsToMap(
  rows: Array<{
    appKey: string;
    enabled: boolean;
    docStatus: unknown;
    docRegistryVersion: string;
    docsUpdatedAt: Date | null;
    docsExpiresAt: Date | null;
    installKeyHash: string | null;
    installKeyPrefix: string | null;
    installKeyIssuedAt: Date | null;
    installKeyExpiresAt: Date | null;
    installKeyRevokedAt: Date | null;
    registeredBy: number | null;
    registeredAt: Date | null;
    updatedBy: number | null;
    updatedAt: Date;
  }>,
  now: Date
): Map<(typeof DESKTOP_APPS)[number], DesktopAppRegistrationView> {
  const map = new Map<(typeof DESKTOP_APPS)[number], DesktopAppRegistrationView>();
  for (const row of rows) {
    if (!isDesktopAppKey(row.appKey)) continue;
    map.set(row.appKey, buildRegistrationView(row.appKey, row, now));
  }
  return map;
}

export function createInstallKeyMaterial(appKey: (typeof DESKTOP_APPS)[number]) {
  const secret = `wtf_app_${appKey}_${randomBytes(16).toString("hex")}`;
  return {
    key: secret,
    prefix: secret.slice(0, 20),
    hash: createHash("sha256").update(secret).digest("hex"),
  };
}

export async function getDesktopAppConfig(): Promise<DesktopAppConfig> {
  let rows: Array<{
    appKey: string;
    enabled: boolean;
    docStatus: unknown;
    docRegistryVersion: string;
    docsUpdatedAt: Date | null;
    docsExpiresAt: Date | null;
    installKeyHash: string | null;
    installKeyPrefix: string | null;
    installKeyIssuedAt: Date | null;
    installKeyExpiresAt: Date | null;
    installKeyRevokedAt: Date | null;
    registeredBy: number | null;
    registeredAt: Date | null;
    updatedBy: number | null;
    updatedAt: Date;
  }> = [];
  try {
    rows = await db
      .select({
        appKey: desktopAppSettings.appKey,
        enabled: desktopAppSettings.enabled,
        docStatus: desktopAppSettings.docStatus,
        docRegistryVersion: desktopAppSettings.docRegistryVersion,
        docsUpdatedAt: desktopAppSettings.docsUpdatedAt,
        docsExpiresAt: desktopAppSettings.docsExpiresAt,
        installKeyHash: desktopAppSettings.installKeyHash,
        installKeyPrefix: desktopAppSettings.installKeyPrefix,
        installKeyIssuedAt: desktopAppSettings.installKeyIssuedAt,
        installKeyExpiresAt: desktopAppSettings.installKeyExpiresAt,
        installKeyRevokedAt: desktopAppSettings.installKeyRevokedAt,
        registeredBy: desktopAppSettings.registeredBy,
        registeredAt: desktopAppSettings.registeredAt,
        updatedBy: desktopAppSettings.updatedBy,
        updatedAt: desktopAppSettings.updatedAt,
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
  const now = new Date();
  for (const row of rows) {
    if (!isDesktopAppKey(row.appKey)) continue;
    const registration = buildRegistrationView(row.appKey, row, now);
    merged[row.appKey] = isDesktopAppRuntimeAvailable(registration);
  }
  return merged;
}

export async function getDesktopAppRegistrations(): Promise<DesktopAppsResponse> {
  let rows: Array<{
    appKey: string;
    enabled: boolean;
    docStatus: unknown;
    docRegistryVersion: string;
    docsUpdatedAt: Date | null;
    docsExpiresAt: Date | null;
    installKeyHash: string | null;
    installKeyPrefix: string | null;
    installKeyIssuedAt: Date | null;
    installKeyExpiresAt: Date | null;
    installKeyRevokedAt: Date | null;
    registeredBy: number | null;
    registeredAt: Date | null;
    updatedBy: number | null;
    updatedAt: Date;
  }> = [];
  try {
    rows = await db
      .select({
        appKey: desktopAppSettings.appKey,
        enabled: desktopAppSettings.enabled,
        docStatus: desktopAppSettings.docStatus,
        docRegistryVersion: desktopAppSettings.docRegistryVersion,
        docsUpdatedAt: desktopAppSettings.docsUpdatedAt,
        docsExpiresAt: desktopAppSettings.docsExpiresAt,
        installKeyHash: desktopAppSettings.installKeyHash,
        installKeyPrefix: desktopAppSettings.installKeyPrefix,
        installKeyIssuedAt: desktopAppSettings.installKeyIssuedAt,
        installKeyExpiresAt: desktopAppSettings.installKeyExpiresAt,
        installKeyRevokedAt: desktopAppSettings.installKeyRevokedAt,
        registeredBy: desktopAppSettings.registeredBy,
        registeredAt: desktopAppSettings.registeredAt,
        updatedBy: desktopAppSettings.updatedBy,
        updatedAt: desktopAppSettings.updatedAt,
      })
      .from(desktopAppSettings)
      .where(inArray(desktopAppSettings.appKey, [...DESKTOP_APPS]));
  } catch (err) {
    if (isMissingRelationError(err)) {
      const now = new Date();
      return {
        apps: { ...DEFAULT_DESKTOP_APP_CONFIG },
        list: DESKTOP_APPS.map((appKey) => buildDefaultRegistrationView(appKey, now)),
      };
    }
    throw err;
  }

  const now = new Date();
  const registrationMap = registrationRowsToMap(rows, now);
  const apps: DesktopAppConfig = { ...DEFAULT_DESKTOP_APP_CONFIG };
  const list = DESKTOP_APPS.map((appKey) => {
    const registration = registrationMap.get(appKey) ?? buildDefaultRegistrationView(appKey, now);
    apps[appKey] = isDesktopAppRuntimeAvailable(registration);
    return registration;
  });
  return { apps, list };
}
