import type { DesktopAppKey } from "@shared/types";

export type StartMenuAppAvailability = Partial<Record<DesktopAppKey, boolean>>;

export type GateableStartMenuItem = {
  path: string;
};

export type GateableStartMenuGroup<TItem extends GateableStartMenuItem> = {
  items: TItem[];
};

export const START_MENU_APP_GATES: Record<string, DesktopAppKey> = {
  "/wtfiam": "wtfiam",
  "/hoard": "hoard",
  "/wim": "wim",
  "/w": "w",
  "/tv": "tv",
  "/dicksword": "dicksword",
  "/i-hate-telegram": "i-hate-telegram",
  "/dear-diary": "dear-diary",
  "/arcade": "arcade",
  "/casino": "casino",
  "/dues": "dues-manager",
  "/console": "console",
  "/game-studio": "game-studio",
  "/studio": "studio",
  "/tools/ch-ease": "ch-ease",
  "/tools/macaroni-packager": "ch-ease",
  "/tools/colander": "pasta-protocol",
  "/tools/spaghetti": "pasta-protocol",
  "/tools/gnocchi": "pasta-protocol",
  "/tools/ravioli": "pasta-protocol",
  "/tools/rotini": "pasta-protocol",
  "/tools/penne": "pasta-protocol",
  "/tools/lasagna": "pasta-protocol",
  "/my-gallery": "gallery",
  "/gallery": "gallery",
  "/my-videos": "gallery",
  "/my-photos": "gallery",
  "/my-music": "gallery",
  "/ipfs-pinning": "ipfs-pinning",
  "/skywire": "skywire",
  "/live": "wtf-live",
  "/tz2at": "tz2at",
  "/crp-nominate": "crp-nominations",
  "/wtf-subdomains": "wtf-subdomains",
  "/rat-race": "rat-race",
  "/map-lab": "map-lab",
  "/mail": "mail",
};

export function isStartMenuItemEnabled(
  path: string,
  apps: StartMenuAppAvailability
): boolean {
  const gate = START_MENU_APP_GATES[path];
  return gate ? apps[gate] !== false : true;
}

export function filterStartMenuItems<TItem extends GateableStartMenuItem>(
  items: TItem[],
  apps: StartMenuAppAvailability
): TItem[] {
  return items.filter((item) => isStartMenuItemEnabled(item.path, apps));
}

export function filterStartMenuGroup<
  TGroup extends GateableStartMenuGroup<TItem>,
  TItem extends GateableStartMenuItem,
>(
  group: TGroup,
  apps: StartMenuAppAvailability
): TGroup | null {
  const items = filterStartMenuItems(group.items, apps);
  if (items.length === 0) return null;
  return { ...group, items };
}
