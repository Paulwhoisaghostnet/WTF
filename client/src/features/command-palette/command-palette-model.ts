import type { UserRole } from "@shared/types";
import type { PageDef } from "../../routes/page-defs";

export type CommandPaletteCategory =
  | "route"
  | "app"
  | "wallet"
  | "reward"
  | "media"
  | "system"
  | "admin";

export interface CommandPaletteCommand {
  id: string;
  label: string;
  path: string;
  category: CommandPaletteCategory;
  keywords: string[];
  adminOnly?: boolean;
}

const STATIC_COMMANDS: CommandPaletteCommand[] = [
  {
    id: "reward:claimable",
    label: "Find Claimable Rewards",
    path: "/mission-control",
    category: "reward",
    keywords: ["reward", "claim", "claimable", "challenge", "paid"],
  },
  {
    id: "wallet:activity",
    label: "Show Wallet Activity",
    path: "/dashboard",
    category: "wallet",
    keywords: ["wallet", "activity", "holdings", "portfolio", "sync"],
  },
  {
    id: "media:library",
    label: "Locate Media Library",
    path: "/my-gallery",
    category: "media",
    keywords: ["media", "gallery", "token", "image", "video", "music"],
  },
  {
    id: "media:ipfs",
    label: "Prepare Media for IPFS",
    path: "/my-gallery",
    category: "media",
    keywords: ["media", "ipfs", "pin", "archive", "preserve", "token", "provenance"],
  },
  {
    id: "media:videos",
    label: "Open My Videos",
    path: "/my-videos",
    category: "media",
    keywords: ["media", "video", "tv", "bumper", "channel"],
  },
  {
    id: "project:studio",
    label: "Open Studio Projects",
    path: "/studio",
    category: "media",
    keywords: ["project", "studio", "creator", "bundle", "draft"],
  },
  {
    id: "project:bundles",
    label: "Open Project Bundles",
    path: "/studio",
    category: "media",
    keywords: ["project", "bundle", "manifest", "exports", "provenance", "deploy notes"],
  },
  {
    id: "project:game-studio",
    label: "Open Game Studio Projects",
    path: "/game-studio",
    category: "media",
    keywords: ["project", "game", "arcade", "console", "sdk"],
  },
  {
    id: "system:checks",
    label: "Show System Checks",
    path: "/mission-control",
    category: "system",
    keywords: ["health", "failed", "jobs", "checks", "what failed", "next"],
  },
  {
    id: "system:run-checks",
    label: "Review Running Checks",
    path: "/mission-control",
    category: "system",
    keywords: ["run checks", "system checks", "health", "jobs", "services", "local services"],
  },
  {
    id: "system:recovery",
    label: "Open Recovery Mode",
    path: "/recovery-mode",
    category: "system",
    keywords: [
      "recovery",
      "repair",
      "wallet",
      "disconnect",
      "network",
      "health",
      "csrf",
      "shell",
      "report",
    ],
  },
  {
    id: "system:export-logs",
    label: "Export Recovery Report",
    path: "/recovery-mode",
    category: "system",
    keywords: ["export", "logs", "report", "recovery report", "incident", "evidence"],
  },
  {
    id: "system:restore-backup",
    label: "Restore or Prove Backup",
    path: "/recovery-mode",
    category: "system",
    keywords: ["restore", "backup", "rollback", "proof", "recovery", "safe mode"],
  },
  {
    id: "system:appearance",
    label: "Open System Appearance",
    path: "/desktop-settings",
    category: "system",
    keywords: ["settings", "desktop", "appearance", "cursor", "wallpaper"],
  },
];

function hasRouteParams(pattern: string): boolean {
  return pattern.includes(":");
}

function canUsePage(def: PageDef, role: UserRole | null): boolean {
  if (hasRouteParams(def.pattern)) return false;
  if (def.auth && !role) return false;
  if (def.roles && (!role || !def.roles.includes(role))) return false;
  return true;
}

function categoryForPage(def: PageDef): CommandPaletteCategory {
  if (def.roles?.includes("admin")) return "admin";
  if (def.group === "media") return "media";
  if (def.group === "market") return "wallet";
  if (def.group === "gameshow") return "reward";
  return "route";
}

function routeKeywords(def: PageDef): string[] {
  return [
    def.group ?? "",
    def.pattern,
    def.title ?? "",
    def.pattern === "/mission-control"
      ? "wallet rewards failed changed next mission control"
      : "",
    def.pattern === "/recovery-mode"
      ? "recovery repair wallet disconnect network reset health shell report"
      : "",
    def.pattern === "/notifications"
      ? "notification center unread changed alerts inbox mark read preferences"
      : "",
    def.pattern === "/dashboard" ? "wallet activity portfolio sync cockpit" : "",
    def.pattern === "/challenges" ? "reward challenge submit claim" : "",
    def.pattern === "/my-gallery" ? "media gallery token collection" : "",
  ].filter(Boolean);
}

function uniqueById(commands: CommandPaletteCommand[]): CommandPaletteCommand[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    if (seen.has(command.id)) return false;
    seen.add(command.id);
    return true;
  });
}

export function buildCommandPaletteCommands(
  pageDefs: PageDef[],
  role: UserRole | null
): CommandPaletteCommand[] {
  const routeCommands = pageDefs
    .filter((def) => canUsePage(def, role))
    .map(
      (def): CommandPaletteCommand => ({
        id: `route:${def.pattern}`,
        label: def.title ?? def.pattern,
        path: def.pattern,
        category: categoryForPage(def),
        keywords: routeKeywords(def),
        adminOnly: def.roles?.includes("admin") || undefined,
      })
    );

  const appCommands = pageDefs
    .filter((def) => def.desktopIcon && canUsePage(def, role))
    .map(
      (def): CommandPaletteCommand => ({
        id: `app:${def.pattern}`,
        label: `Open ${def.title ?? def.pattern}`,
        path: def.pattern,
        category: "app",
        keywords: ["app", "desktop", def.group ?? "", def.title ?? "", def.pattern],
        adminOnly: def.roles?.includes("admin") || undefined,
      })
    );

  const staticCommands = STATIC_COMMANDS.filter((command) => {
    const target = pageDefs.find((def) => def.pattern === command.path);
    return target ? canUsePage(target, role) : false;
  });

  return uniqueById([...staticCommands, ...routeCommands, ...appCommands]);
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ");
}

function commandSearchText(command: CommandPaletteCommand): string {
  return normalized([command.label, command.path, command.category, ...command.keywords].join(" "));
}

function scoreCommand(command: CommandPaletteCommand, terms: string[]): number {
  const label = normalized(command.label);
  const text = commandSearchText(command);
  let score = 0;
  for (const term of terms) {
    if (!text.includes(term)) return -1;
    if (label.includes(term)) score += 5;
    if (command.category === "system" && (term === "failed" || term === "health")) {
      score += 4;
    }
    if (command.category === "reward" && (term === "reward" || term === "claim")) {
      score += 4;
    }
    if (command.category === "app") score += 1;
  }
  return score;
}

export function filterCommandPaletteCommands(
  commands: CommandPaletteCommand[],
  query: string,
  limit = 12
): CommandPaletteCommand[] {
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return commands.slice(0, limit);

  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(command, terms) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.command);
}
