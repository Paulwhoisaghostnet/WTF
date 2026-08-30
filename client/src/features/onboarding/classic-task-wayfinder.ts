export interface ClassicTaskDestination {
  id: "play" | "create" | "shop" | "events" | "talk";
  label: string;
  route: string;
  icon: string;
  description: string;
}

export const CLASSIC_TASK_WAYFINDER = Object.freeze([
  {
    id: "play",
    label: "Play",
    route: "/arcade",
    icon: "🕹️",
    description: "Find community games and start playing.",
  },
  {
    id: "create",
    label: "Create",
    route: "/game-studio",
    icon: "✦",
    description: "Build, test, and publish your own games.",
  },
  {
    id: "shop",
    label: "Shop",
    route: "/wtfiam",
    icon: "🛍️",
    description: "Browse community items, apps, and upgrades.",
  },
  {
    id: "events",
    label: "Events",
    route: "/calendar",
    icon: "📅",
    description: "See gameshows, gatherings, and community dates.",
  },
  {
    id: "talk",
    label: "Talk",
    route: "/mail",
    icon: "✉️",
    description: "Read messages and reach the community.",
  },
] as const satisfies readonly ClassicTaskDestination[]);
