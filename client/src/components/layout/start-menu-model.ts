import type { UserRoleInput } from "@shared/types";
import type { PageDef } from "../../routes/page-defs";
import { canOpenPageDef } from "../../routes/page-defs";
import {
  isStartMenuItemEnabled,
  type StartMenuAppAvailability,
} from "./start-menu-app-gates";

export interface StartMenuItem {
  label: string;
  path: string;
  icon: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface StartMenuGroup {
  key: string;
  label: string;
  icon: string;
  items: StartMenuItem[];
}

export type StartMenuEntry =
  | { kind: "group"; group: StartMenuGroup }
  | { kind: "item"; item: StartMenuItem }
  | { kind: "separator" };

export type StartMenuCategoryKey =
  | "apps"
  | "gameshow"
  | "create"
  | "social"
  | "on-chain"
  | "gaming"
  | "my-media"
  | "browse"
  | "account"
  | "settings"
  | "admin";

const CATEGORY_META: Record<StartMenuCategoryKey, { label: string; icon: string }> = {
  apps: { label: "Apps", icon: "💿" },
  gameshow: { label: "Gameshow", icon: "🎪" },
  create: { label: "CREATE!", icon: "✦" },
  social: { label: "Social", icon: "🐦‍⬛" },
  "on-chain": { label: "On Chain", icon: "🏴‍☠️" },
  gaming: { label: "Gaming", icon: "🎮" },
  "my-media": { label: "My Media", icon: "📂" },
  browse: { label: "Browse", icon: "🕸️" },
  account: { label: "Account", icon: "👤" },
  settings: { label: "Settings", icon: "⚙️" },
  admin: { label: "Admin", icon: "☠️" },
};

const ICONS: Record<string, string> = {
  "/mission-control": "MC",
  "/command-palette": "CP",
  "/recovery-mode": "RM",
  "/file-manager": "FM",
  "/settings": "ST",
  "/browser-boundaries": "BB",
  "/browser": "🌐",
  "/terminal": ">_",
  "/cli": "CLI",
  "/theme-builder": "TH",
  "/notification-center": "NC",
  "/notifications": "NC",
  "/backup-manager": "BK",
  "/task-manager": "TM",
  "/dashboard": "🔮",
  "/rounds": "🎰",
  "/challenges": "💀",
  "/side-quests": "🐹",
  "/messages": "👻",
  "/wim": "WIM",
  "/mail": "📧",
  "/digest": "📰",
  "/skywire": "🦋",
  "/live": "📡",
  "/tz2at": "TZ",
  "/crp-nominate": "CRP",
  "/rat-race": "RR",
  "/map-lab": "MAP",
  "/dear-diary": "DD",
  "/messageboard": "🧼",
  "/w": "W",
  "/dicksword": "💬",
  "/i-hate-telegram": "TG",
  "/wtfiam": "🛍️",
  "/marketplace": "⚓",
  "/trade-boards": "🃏",
  "/dues": "DU",
  "/swap": "🦴",
  "/hoard": "🐉",
  "/tezos-intel": "🔎",
  "/arcade": "🕹️",
  "/console": "▶",
  "/casino": "$",
  "/game-studio": "🧩",
  "/studio": "🎨",
  "/my-videos": "📼",
  "/my-photos": "🖼️",
  "/my-music": "🎵",
  "/music": "🎶",
  "/ipfs-pinning": "PIN",
  "/my-gallery": "🖌️",
  "/collekt": "KT",
  "/tools/particle-painter": "✨",
  "/tools/industrializer": "🏭",
  "/tools/pauls-particles-v1": "PP",
  "/tools/nikshumika-paint": "🎨",
  "/tools/kandinsky-composer": "🖼️",
  "/tools/pixel-patterns": "PX",
  "/tools/penrose-backgrounds": "PR",
  "/tools/macaroni": "MC",
  "/mint-portal": "🌀",
  "/wtf-subdomains": "DNS",
  "/leaderboard": "🏆",
  "/gallery": "🖼️",
  "/links": "⛓️",
  "/faq": "🐸",
  "/wtf-recapture": "RC",
  "/calendar": "📅",
  "/profile": "💅",
  "/desktop-settings": "🖥️",
  "/admin": "☠️",
  "/control-board": "CTL",
  "/contract-factory": "KT1",
  "/operator-wallet": "OP",
  "/tv": "📺",
};

const LABEL_OVERRIDES: Record<string, string> = {
  "/console": "Game Console",
  "/side-quests": "Side Quests",
};

const CATEGORY_ITEMS: Record<StartMenuCategoryKey, string[]> = {
  apps: [],
  gameshow: ["/rounds", "/challenges", "/side-quests", "/wtf-recapture", "/calendar", "/mint-portal"],
  create: ["/studio", "/game-studio", "/mint-portal", "/tools/macaroni"],
  social: ["/messages", "/wim", "/skywire", "/live", "/tz2at", "/crp-nominate", "/dear-diary", "/messageboard", "/w", "/tv", "/dicksword", "/i-hate-telegram", "/mail", "/digest", "/wtf-subdomains"],
  "on-chain": ["/wtfiam", "/marketplace", "/rat-race", "/trade-boards", "/dues", "/swap", "/hoard", "/tezos-intel"],
  gaming: ["/casino", "/arcade", "/console", "/game-studio"],
  "my-media": [
    "/file-manager",
    "/console",
    "/my-videos",
    "/my-photos",
    "/my-music",
    "/music",
    "/ipfs-pinning",
    "/my-gallery",
    "/studio",
    "/collekt",
  ],
  browse: ["/leaderboard", "/gallery", "/links", "/faq"],
  account: ["/mission-control", "/dashboard", "/profile", "/notification-center", "/file-manager", "/command-palette", "/task-manager"],
  settings: [
    "/settings",
    "/desktop-settings",
    "/theme-builder",
    "/map-lab",
    "/browser-boundaries",
    "/browser",
    "/recovery-mode",
    "/backup-manager",
    "/terminal",
    "/cli",
  ],
  admin: ["/admin", "/control-board", "/contract-factory", "/operator-wallet"],
};

function hasRouteParams(pattern: string): boolean {
  return pattern.includes(":");
}

function canShowRoute(
  def: PageDef,
  role: UserRoleInput,
  accessSurfaceIds: readonly string[] = [],
  apps: StartMenuAppAvailability = {}
): boolean {
  if (hasRouteParams(def.pattern)) return false;
  return canOpenPageDef(def, role, accessSurfaceIds, apps);
}

function pageMap(pageDefs: PageDef[]): Map<string, PageDef> {
  const map = new Map<string, PageDef>();
  for (const def of pageDefs) {
    if (!map.has(def.pattern)) map.set(def.pattern, def);
  }
  return map;
}

function itemFor(
  def: PageDef,
  _apps: StartMenuAppAvailability,
  options: { casinoLocked?: boolean; label?: string } = {}
): StartMenuItem | null {
  return {
    label: options.label ?? LABEL_OVERRIDES[def.pattern] ?? def.title ?? def.pattern,
    path: def.pattern,
    icon: ICONS[def.pattern] ?? "□",
    disabled: def.pattern === "/casino" && options.casinoLocked,
    disabledReason:
      def.pattern === "/casino" && options.casinoLocked
        ? "Casino membership card required"
        : undefined,
  };
}

function itemsForPaths(
  paths: string[],
  pages: Map<string, PageDef>,
  apps: StartMenuAppAvailability,
  role: UserRoleInput,
  options: {
    casinoLocked?: boolean;
    labels?: Record<string, string>;
    accessSurfaceIds?: readonly string[];
  } = {}
): StartMenuItem[] {
  return paths.flatMap((path) => {
    const def = pages.get(path);
    if (!def || !canShowRoute(def, role, options.accessSurfaceIds, apps)) return [];
    const item = itemFor(def, apps, {
      casinoLocked: options.casinoLocked,
      label: options.labels?.[path],
    });
    return item ? [item] : [];
  });
}

function groupFor(
  key: StartMenuCategoryKey,
  items: StartMenuItem[]
): StartMenuEntry | null {
  if (items.length === 0) return null;
  const meta = CATEGORY_META[key];
  return {
    kind: "group",
    group: {
      key,
      label: meta.label,
      icon: meta.icon,
      items,
    },
  };
}

function pushSection(entries: StartMenuEntry[], section: Array<StartMenuEntry | null>) {
  const present = section.filter((entry): entry is StartMenuEntry => Boolean(entry));
  if (present.length === 0) return;
  if (entries.length > 0) entries.push({ kind: "separator" });
  entries.push(...present);
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

function creationToolPaths(pageDefs: PageDef[]): string[] {
  return pageDefs
    .filter((def) => def.group === "create" && def.startMenu && !hasRouteParams(def.pattern))
    .map((def) => def.pattern);
}

export function buildStartMenuEntries(
  pageDefs: PageDef[],
  apps: StartMenuAppAvailability,
  role: UserRoleInput,
  options: {
    casinoMembershipActive?: boolean;
    accessSurfaceIds?: readonly string[];
  } = {}
): StartMenuEntry[] {
  const pages = pageMap(pageDefs);
  const casinoLocked = Boolean(role) && options.casinoMembershipActive === false;
  const entries: StartMenuEntry[] = [];

  const nativeAppPaths = pageDefs
    .filter((def) => def.desktopIcon && !hasRouteParams(def.pattern))
    .map((def) => def.pattern);
  pushSection(entries, [
    groupFor("apps", itemsForPaths(nativeAppPaths, pages, apps, role, {
      casinoLocked,
      accessSurfaceIds: options.accessSurfaceIds,
    })),
  ]);

  pushSection(entries, [
    groupFor("gameshow", itemsForPaths(CATEGORY_ITEMS.gameshow, pages, apps, role, { accessSurfaceIds: options.accessSurfaceIds })),
    groupFor(
      "create",
      itemsForPaths(
        uniquePaths([...CATEGORY_ITEMS.create, ...creationToolPaths(pageDefs)]),
        pages,
        apps,
        role,
        { accessSurfaceIds: options.accessSurfaceIds }
      )
    ),
    groupFor("social", itemsForPaths(CATEGORY_ITEMS.social, pages, apps, role, { accessSurfaceIds: options.accessSurfaceIds })),
    groupFor("on-chain", itemsForPaths(CATEGORY_ITEMS["on-chain"], pages, apps, role, { accessSurfaceIds: options.accessSurfaceIds })),
    groupFor("gaming", itemsForPaths(CATEGORY_ITEMS.gaming, pages, apps, role, { casinoLocked, accessSurfaceIds: options.accessSurfaceIds })),
    groupFor(
      "my-media",
      itemsForPaths(CATEGORY_ITEMS["my-media"], pages, apps, role, {
        labels: { "/console": "My Games" },
        accessSurfaceIds: options.accessSurfaceIds,
      })
    ),
  ]);

  pushSection(entries, [
    groupFor("account", itemsForPaths(CATEGORY_ITEMS.account, pages, apps, role, { accessSurfaceIds: options.accessSurfaceIds })),
    groupFor("settings", itemsForPaths(CATEGORY_ITEMS.settings, pages, apps, role, { accessSurfaceIds: options.accessSurfaceIds })),
    groupFor("admin", itemsForPaths(CATEGORY_ITEMS.admin, pages, apps, role, { accessSurfaceIds: options.accessSurfaceIds })),
  ]);

  pushSection(entries, [
    groupFor("browse", itemsForPaths(CATEGORY_ITEMS.browse, pages, apps, role, { accessSurfaceIds: options.accessSurfaceIds })),
  ]);

  return entries;
}

export function buildStartMenuGroups(
  pageDefs: PageDef[],
  apps: StartMenuAppAvailability,
  role: UserRoleInput,
  options: {
    casinoMembershipActive?: boolean;
    accessSurfaceIds?: readonly string[];
  } = {}
): StartMenuGroup[] {
  return buildStartMenuEntries(pageDefs, apps, role, options).flatMap((entry) =>
    entry.kind === "group" ? [entry.group] : []
  );
}

function searchableText(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function filterStartMenuEntriesByQuery(
  entries: StartMenuEntry[],
  query: string
): StartMenuEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;

  const filtered: StartMenuEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "separator") continue;
    if (entry.kind === "item") {
      if (searchableText(entry.item.label, entry.item.path).includes(q)) {
        filtered.push(entry);
      }
      continue;
    }

    const groupMatches = searchableText(entry.group.label, entry.group.key).includes(q);
    const items = groupMatches
      ? entry.group.items
      : entry.group.items.filter((item) =>
          searchableText(item.label, item.path, item.disabledReason).includes(q)
        );

    if (items.length > 0) {
      filtered.push({
        kind: "group",
        group: {
          ...entry.group,
          items,
        },
      });
    }
  }

  return filtered;
}
