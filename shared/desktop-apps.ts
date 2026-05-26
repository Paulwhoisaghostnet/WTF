import { DESKTOP_APPS, type DesktopAppKey } from "./types";

export type DesktopAppConfig = Record<DesktopAppKey, boolean>;

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
  studio: true,
  gallery: true,
  skywire: true,
  tz2at: true,
  "rat-race": false,
  mail: true,
};

export function isDesktopAppKey(value: unknown): value is DesktopAppKey {
  return typeof value === "string" && DESKTOP_APPS.includes(value as DesktopAppKey);
}
