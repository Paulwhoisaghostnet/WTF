export type SkywireTab =
  | "account"
  | "home"
  | "thread"
  | "actor"
  | "pipelines"
  | "discover"
  | "wtf"
  | "tezos"
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
  "thread",
  "actor",
  "pipelines",
  "discover",
  "wtf",
  "tezos",
  "mentions",
  "chat",
  "signals",
  "challenges",
  "composer",
  "debug",
];

export const SKYWIRE_CONTEXT_TABS: SkywireTab[] = ["thread", "actor", "pipelines"];

export function isSkywireTab(value: string | null | undefined): value is SkywireTab {
  return Boolean(value && SKYWIRE_TAB_IDS.includes(value as SkywireTab));
}

export function skywireNavGroups(isAdmin: boolean): SkywireNavGroup[] {
  const groups: SkywireNavGroup[] = [
    {
      id: "bluesky",
      label: "Bluesky",
      items: [
        { id: "home", label: "Home", hint: "Your timeline", icon: "🏠" },
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
        { id: "signals", label: "Signals", hint: "Cross-app signals", icon: "📶" },
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
