import type { BetaAppCatalogEntry } from "./beta-app-catalog";
import type { BetaNowSignalKey } from "./beta-now-signals";

export type BetaCommunicationSurfaceKey = "w-feed" | "wim" | "wtf-live" | "digest" | "mail" | "skywire";
export type BetaPeopleDiscoveryKey =
  | "active-users"
  | "newcomers"
  | "creators"
  | "collectors"
  | "builders"
  | "curators"
  | "collaborators"
  | "interesting-wallets";

export interface BetaCommunicationSurface {
  key: BetaCommunicationSurfaceKey;
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  role: string;
  useWhen: string;
  feeds: string;
  returnReason: string;
  before: string;
  after: string;
}

export interface BetaPeopleDiscoveryCard {
  key: BetaPeopleDiscoveryKey;
  label: string;
  role: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  sourceKeys: BetaNowSignalKey[];
  userQuestion: string;
  visibleProof: string;
  whyCare: string;
  nextAction: string;
  quietFallback: string;
  relatedRoutes: string[];
}

export const BETA_PEOPLE_DISCOVERY_BOARD: BetaPeopleDiscoveryCard[] = [
  {
    key: "active-users",
    label: "Active users",
    role: "People moving now",
    route: "/w",
    access: "session",
    sourceKeys: ["profile-activity", "live-room", "arcade-recent"],
    userQuestion: "Who is doing something right now?",
    visibleProof: "Profile activity, live-room presence, and recent play make the community feel current before the signed-in feed opens.",
    whyCare: "New users need proof that WTFOS is inhabited, not only a grid of tools.",
    nextAction: "Open W Feed after seeing public activity proof, then follow the right conversation into WIM, LIVE, Digest, or Notifications.",
    quietFallback: "If public activity is quiet, keep Leaderboard, Calendar, and Arcade visible so the next social route still has context.",
    relatedRoutes: ["/leaderboard", "/live", "/arcade", "/digest"],
  },
  {
    key: "newcomers",
    label: "New users",
    role: "First progress signals",
    route: "/leaderboard",
    access: "public",
    sourceKeys: ["xp-leaders", "reward-earners", "profile-activity"],
    userQuestion: "Are other people learning this too?",
    visibleProof: "EXP leaders, reward earners, and profile activity show that onboarding progress has public shape.",
    whyCare: "A newcomer is less likely to abandon when they can see other users progressing through the same unlock game.",
    nextAction: "Open Leaderboards, then choose Side Quests or Profile when the user wants their own first proof.",
    quietFallback: "If profile activity is quiet, route to the safe first quest instead of pushing wallet-heavy surfaces.",
    relatedRoutes: ["/side-quests", "/profile", "/challenges", "/notifications"],
  },
  {
    key: "creators",
    label: "Creators",
    role: "People making things",
    route: "/tv",
    access: "public",
    sourceKeys: ["tv-channels", "console-discovery", "market-listings"],
    userQuestion: "Who is creating or publishing here?",
    visibleProof: "TV channels, Console discovery, and marketplace listings reveal creator output before Studio or publishing tools are opened.",
    whyCare: "Creators need to see that work can become media, objects, projects, and social proof.",
    nextAction: "Open TV for public creator proof, then move to Studio, Broot, IPFS Pinning, or Skywire when the user wants to create.",
    quietFallback: "If creator proof is quiet, keep the creator runway visible and explain the publish pipeline instead of hiding tools.",
    relatedRoutes: ["/studio", "/tools/broot", "/ipfs-pinning", "/skywire"],
  },
  {
    key: "collectors",
    label: "Collectors",
    role: "People finding objects",
    route: "/gallery",
    access: "public",
    sourceKeys: ["market-trade-board", "market-listings", "wtf-holders"],
    userQuestion: "Who is collecting, listing, or surfacing objects?",
    visibleProof: "Trade-board objects, market listings, and holder proof connect collectors to objects without forcing a wallet action first.",
    whyCare: "Collectors should understand that people, art, inventory, and market motion are connected.",
    nextAction: "Open Gallery first, then Hoard, Rat Race, Marketplace, or WTFIAM when the user wants deeper collection context.",
    quietFallback: "If market rows are quiet, Gallery remains the safe inspection route before signed-in or wallet-heavy actions.",
    relatedRoutes: ["/hoard", "/rat-race", "/marketplace", "/wtfiam"],
  },
  {
    key: "builders",
    label: "Builders",
    role: "People shipping projects",
    route: "/console",
    access: "public",
    sourceKeys: ["console-discovery", "arcade-discovery", "arcade-recent"],
    userQuestion: "Who is building or testing output?",
    visibleProof: "Console discovery, Arcade discovery, and recent play turn builder work into something inspectable or playable.",
    whyCare: "Builders need to see that experiments can reach users and feedback loops, not just sit in tools.",
    nextAction: "Open Console for public output, then Game Studio, Map Lab, Arcade, or W when the user wants to build or discuss.",
    quietFallback: "If project proof is quiet, keep Game Studio and Map Lab visible as the route where output starts.",
    relatedRoutes: ["/game-studio", "/map-lab", "/arcade", "/w"],
  },
  {
    key: "curators",
    label: "Curators",
    role: "People turning taste into signal",
    route: "/gallery",
    access: "public",
    sourceKeys: ["profile-activity", "market-trade-board", "tv-channels"],
    userQuestion: "Who is discovering and amplifying work?",
    visibleProof: "Profile activity, trade-board objects, and creator channels show discovery moments that can become curation.",
    whyCare: "Curators need a visible contribution path so browsing feels useful to other people.",
    nextAction: "Open Gallery, then move to Side Quests, CRP nomination, Skywire, or W when the user wants public impact.",
    quietFallback: "If nomination is gated or quiet, keep discovery and social signal routes visible before recommending app redesign.",
    relatedRoutes: ["/side-quests", "/crp-nominate", "/skywire", "/w"],
  },
  {
    key: "collaborators",
    label: "Collaborators",
    role: "People to join or respond to",
    route: "/live",
    access: "session",
    sourceKeys: ["live-room", "calendar-events", "w-feed"],
    userQuestion: "Where can I meet or respond to people?",
    visibleProof: "Room presence, upcoming events, and the signed-in W Feed promise make collaboration time-bound.",
    whyCare: "Community members return when there is a person, room, or scheduled moment to meet.",
    nextAction: "Open WTF LIVE or Calendar for time-bound context, then WIM, W Feed, or Digest for follow-up.",
    quietFallback: "If live rooms are quiet, Calendar and Digest keep the next social moment discoverable.",
    relatedRoutes: ["/calendar", "/wim", "/w", "/digest"],
  },
  {
    key: "interesting-wallets",
    label: "Interesting wallets",
    role: "People with visible on-chain context",
    route: "/leaderboard",
    access: "public",
    sourceKeys: ["wtf-holders", "market-listings", "market-trade-board"],
    userQuestion: "Which wallets or collectors are worth inspecting?",
    visibleProof: "Holder rows, marketplace listings, and trade-board objects expose wallet context without adding new wallet logic.",
    whyCare: "Interesting wallets make Tezos context approachable for collectors, curators, and new users.",
    nextAction: "Open Leaderboards first, then Gallery, Hoard, tz2at, or Profile when the user wants more context.",
    quietFallback: "If wallet proof is quiet, keep public object discovery first and avoid pushing contract-heavy actions.",
    relatedRoutes: ["/gallery", "/hoard", "/tz2at", "/profile"],
  },
];

export const BETA_COMMUNICATION_MAP: BetaCommunicationSurface[] = [
  {
    key: "w-feed",
    label: "W Feed",
    route: "/w",
    access: "session",
    role: "Public-square timeline",
    useWhen: "Use when the user wants to see current posts, replies, links, and social motion.",
    feeds: "Profiles, Skywire shares, marketplace chatter, quests, and live-room context.",
    returnReason: "Replies, mentions, and visible activity make tomorrow different.",
    before: "Public profile activity or leaderboard proof",
    after: "WIM, WTF LIVE, Digest, or Notifications",
  },
  {
    key: "wim",
    label: "WIM",
    route: "/wim",
    access: "session",
    role: "Direct conversation layer",
    useWhen: "Use when public activity should become a smaller conversation or buddy action.",
    feeds: "Profiles, room attendance, W social context, and buddy presence.",
    returnReason: "Unread chats and buddy actions create a personal daily loop.",
    before: "W Feed, WTF LIVE attendance, or public profile discovery",
    after: "Mail, live rooms, or Notifications",
  },
  {
    key: "wtf-live",
    label: "WTF LIVE",
    route: "/live",
    access: "session",
    role: "Time-bound gathering surface",
    useWhen: "Use when presence, voice, rooms, stages, or live collaboration matter now.",
    feeds: "Calendar moments, W Feed discussion, attendance, tips, and room chat.",
    returnReason: "Rooms, stages, guests, attendance, and tips give users a reason to check the schedule.",
    before: "Calendar event, public room signal, or W Feed conversation",
    after: "Notifications, Digest, WIM, or WTFIAM tips",
  },
  {
    key: "digest",
    label: "Digest",
    route: "/digest",
    access: "session",
    role: "What changed recap",
    useWhen: "Use when the user has been away and needs the highest-signal summary.",
    feeds: "Notifications, W Feed, rooms, rewards, publishing states, and system work.",
    returnReason: "A digest turns scattered activity into a short return ritual.",
    before: "Missed notifications or a daily check-in",
    after: "W Feed, Side Quests, Mail, or Mission Control",
  },
  {
    key: "mail",
    label: "Mail",
    route: "/mail",
    access: "session",
    role: "Slower private communication",
    useWhen: "Use when a message needs more durable inbox handling than a chat or feed reply.",
    feeds: "Profile identity, direct messages, creator/admin coordination, and reminders.",
    returnReason: "Unread mail and replies make the user feel personally addressed.",
    before: "WIM, admin need, creator handoff, or profile lookup",
    after: "Notifications, WIM, or Mission Control",
  },
  {
    key: "skywire",
    label: "Skywire",
    route: "/skywire",
    access: "public",
    role: "External social broadcast bridge",
    useWhen: "Use when WTFOS activity should become public promotion, AT Protocol identity, or cross-network proof.",
    feeds: "Creator work, marketplace moments, live status, TV queues, and profile identity.",
    returnReason: "New social proof, shared drops, and live status make the wider network feel connected.",
    before: "Profile setup, published object, market signal, or live moment",
    after: "W Feed, TV, Gallery, or external AT Protocol profile",
  },
];
