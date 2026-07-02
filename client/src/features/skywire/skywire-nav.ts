export type SkywireTab =
  | "account"
  | "home"
  | "hot"
  | "thread"
  | "actor"
  | "pipelines"
  | "discover"
  | "wtf"
  | "tezos"
  | "market"
  | "vault"
  | "mentions"
  | "chat"
  | "signals"
  | "challenges"
  | "composer"
  | "debug";

export type SkywireNavItem = {
  id: SkywireTab;
  label: string;
  hint: string;
  icon: string;
};

export type SkywireNavGroup = {
  id: string;
  label: string;
  items: SkywireNavItem[];
};

export const SKYWIRE_TAB_IDS: SkywireTab[] = [
  "account",
  "home",
  "hot",
  "thread",
  "actor",
  "pipelines",
  "discover",
  "wtf",
  "tezos",
  "market",
  "vault",
  "mentions",
  "chat",
  "signals",
  "challenges",
  "composer",
  "debug",
];

export const SKYWIRE_CONTEXT_TABS: SkywireTab[] = ["thread", "actor", "pipelines"];
export const SKYWIRE_USER_HIDDEN_TABS: SkywireTab[] = ["signals"];

export function isSkywireTab(value: string | null | undefined): value is SkywireTab {
  return Boolean(value && SKYWIRE_TAB_IDS.includes(value as SkywireTab));
}

export function isSkywireUserVisibleTab(value: string | null | undefined): value is SkywireTab {
  return isSkywireTab(value) && !SKYWIRE_USER_HIDDEN_TABS.includes(value);
}

export function skywireUserVisibleTab(tab: SkywireTab): SkywireTab {
  return SKYWIRE_USER_HIDDEN_TABS.includes(tab) ? "home" : tab;
}

export function skywireNavGroups(isAdmin: boolean): SkywireNavGroup[] {
  const groups: SkywireNavGroup[] = [
    {
      id: "bluesky",
      label: "Bluesky",
      items: [
        { id: "home", label: "Home", hint: "Your timeline", icon: "🏠" },
        { id: "hot", label: "Hot", hint: "Trending topics", icon: "🔥" },
        { id: "discover", label: "Search", hint: "Find people and posts", icon: "🔍" },
        { id: "mentions", label: "Notifications", hint: "Mentions and replies", icon: "🔔" },
        { id: "chat", label: "Messages", hint: "Private Bluesky chat", icon: "✉" },
        { id: "composer", label: "New Post", hint: "Compose a skeet", icon: "✎" },
        { id: "account", label: "Settings", hint: "Login, permissions, profile", icon: "⚙" },
      ],
    },
    {
      id: "wtf",
      label: "WTF OS",
      items: [
        { id: "wtf", label: "WTF Feed", hint: "Show-native posts", icon: "🎬" },
        { id: "tezos", label: "Tezos Feed", hint: "Tezos-linked posts", icon: "⛓" },
        { id: "market", label: "Market Feed", hint: "Objkt/Teia links", icon: "☰" },
        { id: "vault", label: "Vault", hint: "Owned and created tokens", icon: "▣" },
        { id: "challenges", label: "Challenges", hint: "Claim challenge posts", icon: "🏆" },
      ],
    },
  ];

  if (isAdmin) {
    groups.push({
      id: "admin",
      label: "Admin",
      items: [{ id: "debug", label: "Diagnostics", hint: "OAuth and session debug", icon: "🛠" }],
    });
  }

  return groups;
}

export function skywireContextTitle(
  tab: SkywireTab,
  selectedActor: { handle?: string; displayName?: string | null } | null,
  selectedThreadPost: { author?: { handle?: string } | null } | null,
  selectedPipelinePost: { author?: { handle?: string } | null } | null,
): string {
  if (tab === "thread") {
    const handle = selectedThreadPost?.author?.handle;
    return handle ? `Thread · @${handle}` : "Thread";
  }
  if (tab === "actor") {
    const label = selectedActor?.displayName || selectedActor?.handle;
    return label ? `Profile · ${label}` : "Profile";
  }
  if (tab === "pipelines") {
    const handle = selectedPipelinePost?.author?.handle;
    return handle ? `Pipelines · @${handle}` : "Pipelines";
  }
  return "";
}
