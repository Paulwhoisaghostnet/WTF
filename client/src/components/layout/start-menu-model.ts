import type { UserRole } from "@shared/types";
import type { PageDef } from "../../routes/page-defs";
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
  | "social"
  | "on-chain"
  | "gaming"
  | "my-media"
  | "browse";

const CATEGORY_META: Record<StartMenuCategoryKey, { label: string; icon: string }> = {
  apps: { label: "Apps", icon: "💿" },
  gameshow: { label: "Gameshow", icon: "🎪" },
  social: { label: "Social", icon: "🐦‍⬛" },
  "on-chain": { label: "On Chain", icon: "🏴‍☠️" },
  gaming: { label: "Gaming", icon: "🎮" },
  "my-media": { label: "My Media", icon: "📂" },
  browse: { label: "Browse", icon: "🕸️" },
};

const ICONS: Record<string, string> = {
  "/mission-control": "MC",
  "/command-palette": "CP",
  "/recovery-mode": "RM",
  "/file-manager": "FM",
  "/settings": "ST",
  "/browser-boundaries": "BB",
  "/terminal": ">_",
  "/theme-builder": "TH",
  "/notification-center": "NC",
  "/notifications": "NC",
  "/backup-manager": "BK",
  "/dashboard": "🔮",
  "/rounds": "🎰",
  "/challenges": "💀",
  "/side-quests": "🐹",
  "/messages": "👻",
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
  "/my-gallery": "🖌️",
  "/collekt": "KT",
  "/tools/particle-painter": "✨",
  "/tools/industrializer": "🏭",
  "/tools/pauls-particles-v1": "PP",
  "/tools/nikshumika-paint": "🎨",
  "/tools/kandinsky-composer": "🖼️",
  "/tezamp/winamp-bootloader": "🎛️",
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
};

const LABEL_OVERRIDES: Record<string, string> = {
  "/console": "Game Console",
};

const CATEGORY_ITEMS: Record<StartMenuCategoryKey, string[]> = {
  apps: [],
  gameshow: ["/rounds", "/challenges", "/side-quests", "/wtf-recapture", "/calendar", "/mint-portal"],
  social: ["/messages", "/dear-diary", "/messageboard", "/w", "/dicksword", "/i-hate-telegram", "/wtf-subdomains"],
  "on-chain": ["/wtfiam", "/marketplace", "/trade-boards", "/dues", "/swap", "/hoard", "/tezos-intel"],
  gaming: ["/casino", "/arcade", "/console"],
  "my-media": [
    "/file-manager",
    "/console",
    "/my-videos",
    "/my-photos",
    "/my-music",
    "/my-gallery",
    "/studio",
    "/game-studio",
    "/collekt",
    "/tools/nikshumika-paint",
    "/tools/kandinsky-composer",
    "/tezamp/winamp-bootloader",
  ],
  browse: ["/leaderboard", "/gallery", "/links", "/faq"],
};

const ACCOUNT_ITEMS = [
  "/mission-control",
  "/command-palette",
  "/recovery-mode",
  "/file-manager",
  "/settings",
  "/browser-boundaries",
  "/terminal",
  "/theme-builder",
  "/notification-center",
  "/dashboard",
  "/profile",
  "/desktop-settings",
];
const ADMIN_ITEMS = ["/admin", "/control-board", "/backup-manager", "/contract-factory", "/operator-wallet"];

function hasRouteParams(pattern: string): boolean {
  return pattern.includes(":");
}

function canShowRoute(def: PageDef, role: UserRole | null): boolean {
  if (hasRouteParams(def.pattern)) return false;
  if (def.auth && !role) return false;
  if (def.roles && (!role || !def.roles.includes(role))) return false;
  return true;
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
  apps: StartMenuAppAvailability,
  options: { casinoLocked?: boolean; label?: string } = {}
): StartMenuItem | null {
  if (!isStartMenuItemEnabled(def.pattern, apps)) return null;
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
  role: UserRole | null,
  options: { casinoLocked?: boolean; labels?: Record<string, string> } = {}
): StartMenuItem[] {
  return paths.flatMap((path) => {
    const def = pages.get(path);
    if (!def || !canShowRoute(def, role)) return [];
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

export function buildStartMenuEntries(
  pageDefs: PageDef[],
  apps: StartMenuAppAvailability,
  role: UserRole | null,
  options: { casinoMembershipActive?: boolean } = {}
): StartMenuEntry[] {
  const pages = pageMap(pageDefs);
  const casinoLocked = Boolean(role) && options.casinoMembershipActive === false;
  const entries: StartMenuEntry[] = [];

  const nativeAppPaths = pageDefs
    .filter((def) => def.desktopIcon && !hasRouteParams(def.pattern))
    .map((def) => def.pattern);
  pushSection(entries, [
    groupFor("apps", itemsForPaths(nativeAppPaths, pages, apps, role, { casinoLocked })),
  ]);

  pushSection(entries, [
    groupFor("gameshow", itemsForPaths(CATEGORY_ITEMS.gameshow, pages, apps, role)),
    groupFor("social", itemsForPaths(CATEGORY_ITEMS.social, pages, apps, role)),
    groupFor("on-chain", itemsForPaths(CATEGORY_ITEMS["on-chain"], pages, apps, role)),
    groupFor("gaming", itemsForPaths(CATEGORY_ITEMS.gaming, pages, apps, role, { casinoLocked })),
    groupFor(
      "my-media",
      itemsForPaths(CATEGORY_ITEMS["my-media"], pages, apps, role, {
        labels: { "/console": "My Games" },
      })
    ),
  ]);

  pushSection(entries, [
    ...itemsForPaths(ACCOUNT_ITEMS, pages, apps, role).map(
      (item): StartMenuEntry => ({ kind: "item", item })
    ),
    ...itemsForPaths(ADMIN_ITEMS, pages, apps, role).map(
      (item): StartMenuEntry => ({ kind: "item", item })
    ),
  ]);

  pushSection(entries, [
    groupFor("browse", itemsForPaths(CATEGORY_ITEMS.browse, pages, apps, role)),
  ]);

  return entries;
}

export function buildStartMenuGroups(
  pageDefs: PageDef[],
  apps: StartMenuAppAvailability,
  role: UserRole | null,
  options: { casinoMembershipActive?: boolean } = {}
): StartMenuGroup[] {
  return buildStartMenuEntries(pageDefs, apps, role, options).flatMap((entry) =>
    entry.kind === "group" ? [entry.group] : []
  );
}
