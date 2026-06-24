export type BetaNowSignalAccess = "public" | "session";

export type BetaNowSignalKey =
  | "wtf-holders"
  | "xp-leaders"
  | "reward-earners"
  | "market-listings"
  | "market-trade-board"
  | "profile-activity"
  | "live-room"
  | "calendar-events"
  | "tv-channels"
  | "arcade-discovery"
  | "arcade-recent"
  | "console-discovery"
  | "notifications"
  | "w-feed"
  | "market-heat";

export interface BetaNowSignalSource {
  key: BetaNowSignalKey;
  label: string;
  route: string;
  endpoint: string;
  access: BetaNowSignalAccess;
  userQuestion: string;
  betaUse: string;
}

export type BetaPublicProofKey = "fresh-object" | "creator-channel" | "playable-project" | "builder-output";

export interface BetaPublicProofSource {
  key: BetaPublicProofKey;
  label: string;
  route: string;
  sourceKeys: BetaNowSignalKey[];
  userQuestion: string;
  betaUse: string;
}

export const BETA_NOW_SIGNAL_SOURCES: BetaNowSignalSource[] = [
  {
    key: "wtf-holders",
    label: "WTF holders",
    route: "/leaderboard",
    endpoint: "/api/leaderboard?limit=5",
    access: "public",
    userQuestion: "Who has visible WTF activity?",
    betaUse: "Shows that wallets, profiles, and token ownership are part of the social graph.",
  },
  {
    key: "xp-leaders",
    label: "EXP leaders",
    route: "/leaderboard",
    endpoint: "/api/leaderboard/rewards/exp?limit=5",
    access: "public",
    userQuestion: "Who is progressing through WTFOS?",
    betaUse: "Turns EXP, levels, roles, and return loops into visible community proof.",
  },
  {
    key: "reward-earners",
    label: "Reward earners",
    route: "/leaderboard",
    endpoint: "/api/leaderboard/rewards/wtf?limit=5",
    access: "public",
    userQuestion: "Are people earning anything here?",
    betaUse: "Connects side quests, challenges, rewards, and in-app market value.",
  },
  {
    key: "market-listings",
    label: "Market listings",
    route: "/marketplace",
    endpoint: "/api/marketplace?limit=4",
    access: "public",
    userQuestion: "Is there collector motion?",
    betaUse: "Lets collectors see live commerce before choosing Hoard, Rat Race, or WTFIAM.",
  },
  {
    key: "market-trade-board",
    label: "Trade-board objects",
    route: "/trade-boards",
    endpoint: "/api/marketplace/trade-board?limit=4&q=",
    access: "public",
    userQuestion: "What are collectors making available?",
    betaUse: "Turns the existing public trade-board cache into a collector/gallery bridge without changing trade-board actions.",
  },
  {
    key: "profile-activity",
    label: "Profile activity",
    route: "/user/:username",
    endpoint: "/api/users/:username/activity",
    access: "public",
    userQuestion: "What did a visible person do recently?",
    betaUse: "Uses public XP activity to prove people are progressing while avoiding the event-writing profile view endpoint.",
  },
  {
    key: "live-room",
    label: "WTF LIVE room",
    route: "/live/r/wtf-live",
    endpoint: "/api/wtf-live/public/rooms/wtf-live",
    access: "public",
    userQuestion: "Can I see people gathering live?",
    betaUse: "Shows public room presence without requiring beta to bypass WTF LIVE session or owner controls.",
  },
  {
    key: "calendar-events",
    label: "Upcoming events",
    route: "/calendar",
    endpoint: "/api/calendar/events",
    access: "public",
    userQuestion: "What is coming up soon?",
    betaUse: "Turns the daily loop into a time-based reason to return instead of only a static app list.",
  },
  {
    key: "tv-channels",
    label: "WTF TV channels",
    route: "/tv",
    endpoint: "/api/tv/channels?limit=4",
    access: "public",
    userQuestion: "What can I watch or follow?",
    betaUse: "Shows public creator/media channels while the full TV app keeps its existing session behavior.",
  },
  {
    key: "arcade-discovery",
    label: "Arcade discovery",
    route: "/arcade",
    endpoint: "/api/arcade/discovery?limit=4",
    access: "public",
    userQuestion: "What can I play right now?",
    betaUse: "Makes play a first-class return loop instead of an app name in a launcher.",
  },
  {
    key: "arcade-recent",
    label: "Recent play",
    route: "/arcade",
    endpoint: "/api/arcade/recent?limit=4",
    access: "public",
    userQuestion: "Are people playing?",
    betaUse: "Shows user activity, scores, and social proof for daily return.",
  },
  {
    key: "console-discovery",
    label: "Console discovery",
    route: "/console",
    endpoint: "/api/console/discovery?limit=4",
    access: "public",
    userQuestion: "What are builders shipping?",
    betaUse: "Connects builder output to Console, Arcade, Game Studio, and feedback loops.",
  },
  {
    key: "notifications",
    label: "Notification Center",
    route: "/notifications",
    endpoint: "/api/notifications?limit=4",
    access: "session",
    userQuestion: "What changed for me?",
    betaUse: "This is the personal return loop, so beta presents it as a signed-in promise.",
  },
  {
    key: "w-feed",
    label: "W Feed",
    route: "/w",
    endpoint: "/api/w/timeline",
    access: "session",
    userQuestion: "Who is active socially?",
    betaUse: "This is the people surface, but beta should respect the existing auth gate.",
  },
  {
    key: "market-heat",
    label: "Rat Race market heat",
    route: "/rat-race",
    endpoint: "/api/rat-race/hot-tokens?limit=3&windowHours=48&mintedWithinDays=7&minSoldPercent=25&minRecentSales=1",
    access: "session",
    userQuestion: "What is moving fast?",
    betaUse: "This is collector urgency, so beta routes to it without bypassing auth or wallet context.",
  },
];

export const BETA_PUBLIC_PROOF_SOURCES: BetaPublicProofSource[] = [
  {
    key: "fresh-object",
    label: "Fresh object",
    route: "/gallery",
    sourceKeys: ["market-trade-board", "market-listings"],
    userQuestion: "What should I inspect first?",
    betaUse: "Turns existing public trade-board and marketplace signals into a safe Gallery-first discovery step.",
  },
  {
    key: "creator-channel",
    label: "Creator channel",
    route: "/tv",
    sourceKeys: ["tv-channels"],
    userQuestion: "Which creator or media surface is active?",
    betaUse: "Shows creator/media presence without changing WTF TV ownership, queue, or session behavior.",
  },
  {
    key: "playable-project",
    label: "Playable project",
    route: "/arcade",
    sourceKeys: ["arcade-discovery", "arcade-recent"],
    userQuestion: "What can I play right now?",
    betaUse: "Connects public play discovery and recent scores to a clear Arcade next step.",
  },
  {
    key: "builder-output",
    label: "Builder output",
    route: "/console",
    sourceKeys: ["console-discovery"],
    userQuestion: "What are builders shipping?",
    betaUse: "Routes builder proof into Console while keeping Game Studio, Map Lab, and Arcade logic unchanged.",
  },
];

export function betaPublicNowSignalSources(): BetaNowSignalSource[] {
  return BETA_NOW_SIGNAL_SOURCES.filter((source) => source.access === "public");
}

export function betaSessionNowSignalSources(): BetaNowSignalSource[] {
  return BETA_NOW_SIGNAL_SOURCES.filter((source) => source.access === "session");
}

export function findBetaNowSignalSource(key: BetaNowSignalKey): BetaNowSignalSource {
  const source = BETA_NOW_SIGNAL_SOURCES.find((item) => item.key === key);
  if (!source) throw new Error(`Unknown beta now signal source: ${key}`);
  return source;
}

export function findBetaPublicProofSource(key: BetaPublicProofKey): BetaPublicProofSource {
  const source = BETA_PUBLIC_PROOF_SOURCES.find((item) => item.key === key);
  if (!source) throw new Error(`Unknown beta public proof source: ${key}`);
  return source;
}
