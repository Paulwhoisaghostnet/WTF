export const WTF_DWELLING_KEYS = [
  "desktop",
  "projects",
  "media",
  "documents",
  "downloads",
  "vault",
  "apps",
  "chain",
  "archives",
  "shared",
] as const;

export type WtfDwellingKey = (typeof WTF_DWELLING_KEYS)[number];

export interface WtfDwelling {
  key: WtfDwellingKey;
  label: string;
  path: `WTF/${string}`;
  route: string;
  owner: string;
  doctrineRole: string;
  bundleDomains: string[];
  access: "user" | "admin";
}

export const WTF_DWELLINGS: readonly WtfDwelling[] = [
  {
    key: "desktop",
    label: "Desktop",
    path: "WTF/Desktop",
    route: "/desktop-settings",
    owner: "Shell",
    doctrineRole: "Appearance, wallpaper, cursor, taskbar, window, and launcher state.",
    bundleDomains: ["desktop-state", "theme", "window-layout"],
    access: "user",
  },
  {
    key: "projects",
    label: "Projects",
    path: "WTF/Projects",
    route: "/studio",
    owner: "Studio / Agent",
    doctrineRole: "Creator and Agent project roots, bundle manifests, drafts, AI workspace snapshots, exports, and deploy notes.",
    bundleDomains: ["studio", "game-studio", "agent-workspaces", "exports", "deploy-notes"],
    access: "user",
  },
  {
    key: "media",
    label: "Media",
    path: "WTF/Media",
    route: "/my-gallery",
    owner: "Media Temple",
    doctrineRole: "Uploaded media, token media, previews, thumbnails, playback state, and provenance.",
    bundleDomains: ["gallery", "tv", "audio", "video", "token-media", "previews"],
    access: "user",
  },
  {
    key: "documents",
    label: "Documents",
    path: "WTF/Documents",
    route: "/dear-diary",
    owner: "Dear Diary",
    doctrineRole: "Private notes, diary memory, written references, and searchable context.",
    bundleDomains: ["notes", "diary", "references"],
    access: "user",
  },
  {
    key: "downloads",
    label: "Downloads",
    path: "WTF/Downloads",
    route: "/my-videos",
    owner: "Media Library",
    doctrineRole: "Imported files, captured media, downloaded source assets, and staging outputs.",
    bundleDomains: ["uploads", "imports", "captures", "staging"],
    access: "user",
  },
  {
    key: "vault",
    label: "Vault",
    path: "WTF/Vault",
    route: "/hoard",
    owner: "Wallet",
    doctrineRole: "Wallet-backed inventory, owned tokens, rewards, and user-value assets.",
    bundleDomains: ["wallet", "tokens", "rewards", "inventory"],
    access: "user",
  },
  {
    key: "apps",
    label: "Apps",
    path: "WTF/Apps",
    route: "/game-studio",
    owner: "Creator Tools",
    doctrineRole: "Launchable apps, tools, games, creation surfaces, and app affordance records.",
    bundleDomains: ["apps", "tools", "games", "affordances"],
    access: "user",
  },
  {
    key: "chain",
    label: "Chain",
    path: "WTF/Chain",
    route: "/tezos-intel",
    owner: "Tezos Platform",
    doctrineRole: "Wallet activity, contracts, TzKT, Objkt, Tezos Domains, RPC, and sync state.",
    bundleDomains: ["wallet-activity", "contracts", "tzkt", "objkt", "domains", "rpc"],
    access: "user",
  },
  {
    key: "archives",
    label: "Archives",
    path: "WTF/Archives",
    route: "/recovery-mode",
    owner: "Recovery",
    doctrineRole: "Restore proof, incident reports, backup status, exported logs, and rollback records.",
    bundleDomains: ["backup", "restore-proof", "incidents", "exports", "rollback"],
    access: "user",
  },
  {
    key: "shared",
    label: "Shared",
    path: "WTF/Shared",
    route: "/w",
    owner: "Social",
    doctrineRole: "Public posts, groupchat mirrors, shared discovery, public galleries, and social provenance.",
    bundleDomains: ["w", "groupchat", "public-gallery", "social-provenance"],
    access: "user",
  },
] as const;

export function getWtfDwelling(key: WtfDwellingKey): WtfDwelling {
  return WTF_DWELLINGS.find((dwelling) => dwelling.key === key)!;
}
