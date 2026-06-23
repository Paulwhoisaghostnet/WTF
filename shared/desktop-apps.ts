import { DESKTOP_APPS, type DesktopAppKey } from "./types";
import {
  getDesktopAppDocLinks,
  WTF_DOC_REGISTRY_GRACE_HOURS,
  type WtfDocLinkSet,
} from "./wtf-docregistry";

export type DesktopAppConfig = Record<DesktopAppKey, boolean>;

export const DESKTOP_APP_INSTALL_GRACE_HOURS = WTF_DOC_REGISTRY_GRACE_HOURS;

export type DesktopAppDocStatus = "pending" | "registered" | "stale" | "revoked";

export type DesktopAppRegistrationView = {
  key: DesktopAppKey;
  enabled: boolean;
  docStatus: DesktopAppDocStatus;
  docRegistryVersion: string;
  docsUpdatedAt: string | null;
  docsExpiresAt: string | null;
  installKeyPrefix: string | null;
  installKeyIssuedAt: string | null;
  installKeyExpiresAt: string | null;
  installKeyRevokedAt: string | null;
  registeredBy: number | null;
  registeredAt: string | null;
  updatedBy: number | null;
  updatedAt: string;
  installable: boolean;
  documentation: WtfDocLinkSet;
};

export type DesktopAppsResponse = {
  apps: DesktopAppConfig;
  list: DesktopAppRegistrationView[];
};

export const DEFAULT_DESKTOP_APP_CONFIG: DesktopAppConfig = {
  wtfiam: true,
  hoard: true,
  wim: true,
  w: true,
  tv: true,
  dicksword: true,
  "i-hate-telegram": true,
  "dear-diary": true,
  arcade: true,
  casino: true,
  "dues-manager": false,
  console: true,
  "game-studio": true,
  dedrooms: true,
  studio: true,
  "ch-ease": true,
  "pasta-protocol": true,
  gallery: true,
  "ipfs-pinning": true,
  skywire: true,
  "wtf-live": true,
  tz2at: true,
  "crp-nominations": true,
  "wtf-subdomains": true,
  "rat-race": false,
  "map-lab": true,
  mail: true,
};

export function getDesktopAppDocumentation(appKey: DesktopAppKey): WtfDocLinkSet {
  return getDesktopAppDocLinks(appKey);
}

export function isDesktopAppKey(value: unknown): value is DesktopAppKey {
  return typeof value === "string" && DESKTOP_APPS.includes(value as DesktopAppKey);
}
