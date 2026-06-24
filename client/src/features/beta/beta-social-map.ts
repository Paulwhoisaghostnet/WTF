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

export type BetaPeopleProofStatus = "direct" | "routed" | "weak";

export interface BetaPeopleProofGap {
  key: BetaPeopleDiscoveryKey;
  label: string;
  status: BetaPeopleProofStatus;
  route: string;
  access: BetaAppCatalogEntry["access"];
  userQuestion: string;
  visibleProof: string;
  whyItMatters: string;
  currentWeakness: string;
  nextBetaMove: string;
  quietFallback: string;
  noWriteRule: string;
  relatedSignals: BetaNowSignalKey[];
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
    access: "session",
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
    access: "session",
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

export const BETA_PEOPLE_PROOF_GAPS: BetaPeopleProofGap[] = [
  {
    key: "active-users",
    label: "Active users",
    status: "routed",
    route: "/w",
    access: "session",
    userQuestion: "Can a new user tell there are active people before signing in?",
    visibleProof: "Profile activity, public room presence, and recent play already appear before the signed-in W Feed opens.",
    whyItMatters: "The first social promise is trust: WTFOS must feel inhabited before the user decides a session gate is worth crossing.",
    currentWeakness: "The strongest public proof is spread across separate boards, so anonymous users can read the signals as app data instead of people data.",
    nextBetaMove: "Keep active-user proof grouped inside People Discovery, then route the primary action to W only after public proof sets context.",
    quietFallback: "When W is protected or quiet, keep Leaderboard, Calendar, LIVE, and Arcade visible as lower-friction signs of motion.",
    noWriteRule: "No beta write: this matrix only reads public or protected proof and opens existing routes through their current gates.",
    relatedSignals: ["profile-activity", "live-room", "arcade-recent"],
  },
  {
    key: "newcomers",
    label: "New users",
    status: "direct",
    route: "/leaderboard",
    access: "public",
    userQuestion: "Can newcomers see that other people are learning WTFOS too?",
    visibleProof: "EXP leaders, reward earners, and public profile activity already show that early progress has a visible shape.",
    whyItMatters: "A new Tezos user needs permission to start small, and seeing other beginners progress makes the unlock game less lonely.",
    currentWeakness: "EXP proof can look like a score table without enough explanation that levels are evidence for journeys, not authority.",
    nextBetaMove: "Pair Leaderboards with Side Quests, Challenges, and Profile so a newcomer can understand the first proof they can create.",
    quietFallback: "If profile activity is quiet, route to Side Quests and the starter passport instead of wallet-heavy or admin-heavy tools.",
    noWriteRule: "No beta write: EXP and reward rows stay read-only; beta explains progression without awarding, settling, or gating anything.",
    relatedSignals: ["xp-leaders", "reward-earners", "profile-activity"],
  },
  {
    key: "creators",
    label: "Creators",
    status: "direct",
    route: "/tv",
    access: "session",
    userQuestion: "Can a creator see that making work leads to visible output?",
    visibleProof: "TV channels, Console discovery, and public listings show work becoming media, projects, and objects before editing tools open.",
    whyItMatters: "Creators return when the system shows that publishing creates social proof, not just files hidden behind tool names.",
    currentWeakness: "Creation proof still depends on the user understanding how Studio, Broot, IPFS Pinning, TV, and Market routes relate.",
    nextBetaMove: "Keep TV as the public proof route and use the creator runway to explain Studio, Broot, Pinning, Skywire, and Macaroni order.",
    quietFallback: "If creator rows are quiet, show the creator pipeline and proof requirements instead of recommending app rewrites.",
    noWriteRule: "No beta write: creator output proof is route guidance only and never uploads, pins, signs, queues, or publishes from beta.",
    relatedSignals: ["tv-channels", "console-discovery", "market-listings"],
  },
  {
    key: "collectors",
    label: "Collectors",
    status: "direct",
    route: "/gallery",
    access: "public",
    userQuestion: "Can a collector find people, objects, and market motion without a wallet step first?",
    visibleProof: "Trade-board objects, public listings, and holder rows create an object-first path into collection context.",
    whyItMatters: "Collector discovery is the clearest bridge between Tezos data, people, inventory, and tomorrow's market curiosity.",
    currentWeakness: "Market and wallet signals can feel transactional before users understand who collected, listed, held, or surfaced the object.",
    nextBetaMove: "Keep Gallery as the safe inspection route, then route to Hoard, Rat Race, Marketplace, and WTFIAM only when context is needed.",
    quietFallback: "If market rows are quiet, keep Gallery and holder proof visible so the path stays inspectable before any wallet-heavy action.",
    noWriteRule: "No beta write: collector proof never creates listings, swaps, offers, wallet links, or market-side effects.",
    relatedSignals: ["market-trade-board", "market-listings", "wtf-holders"],
  },
  {
    key: "builders",
    label: "Builders",
    status: "direct",
    route: "/console",
    access: "session",
    userQuestion: "Can a builder see that experiments reach users and feedback?",
    visibleProof: "Console discovery, Arcade discovery, and recent play make shipped work inspectable before a builder opens creation tools.",
    whyItMatters: "Builder motivation depends on seeing a path from output to players, testers, discussion, and iteration.",
    currentWeakness: "Builder proof can look like disconnected shelves unless the route group explains Console, Game Studio, Map Lab, Arcade, and W together.",
    nextBetaMove: "Use Console as the proof route and keep the Builder Output group plus command center visible before deeper tool browsing.",
    quietFallback: "If output rows are quiet, keep Game Studio and Map Lab routes visible as the safe place where builder work starts.",
    noWriteRule: "No beta write: builder proof only opens existing project routes and never creates, edits, deploys, or publishes projects.",
    relatedSignals: ["console-discovery", "arcade-discovery", "arcade-recent"],
  },
  {
    key: "curators",
    label: "Curators",
    status: "weak",
    route: "/gallery",
    access: "public",
    userQuestion: "Can a curator see how discovery becomes signal for other people?",
    visibleProof: "Profile activity, trade-board objects, and TV channels hint that taste can amplify creators and collectors.",
    whyItMatters: "Curators need a useful contribution path so browsing feels like community work instead of passive scrolling.",
    currentWeakness: "Curation proof is still the least direct human signal because nomination, Skywire, W, and gallery discovery live in separate surfaces.",
    nextBetaMove: "Strengthen copy around Gallery, CRP nomination, Skywire, W, and Side Quests before hiding or redesigning any curator-facing route.",
    quietFallback: "If nomination is gated or quiet, keep public discovery and share routes visible so curators can still find the next useful action.",
    noWriteRule: "No beta write: curator proof never nominates, posts, shares, awards, or records curation from the beta shell.",
    relatedSignals: ["profile-activity", "market-trade-board", "tv-channels"],
  },
  {
    key: "collaborators",
    label: "Collaborators",
    status: "routed",
    route: "/live",
    access: "session",
    userQuestion: "Can a community member find a person, room, or scheduled moment to join?",
    visibleProof: "Room presence, upcoming events, and the signed-in W promise make collaboration time-bound instead of abstract.",
    whyItMatters: "People return when there is a human moment to attend, reply to, or continue tomorrow.",
    currentWeakness: "The strongest collaboration surfaces are protected, so public beta must explain what the gate protects before asking for sign-in.",
    nextBetaMove: "Lead with public room and calendar proof, then route to LIVE, W Feed, WIM, Digest, and Notifications through existing gates.",
    quietFallback: "If live rooms are quiet, Calendar and Digest keep the next social moment discoverable without inventing activity.",
    noWriteRule: "No beta write: collaboration proof never joins rooms, sends messages, schedules events, or changes notification state.",
    relatedSignals: ["live-room", "calendar-events", "w-feed"],
  },
  {
    key: "interesting-wallets",
    label: "Interesting wallets",
    status: "routed",
    route: "/leaderboard",
    access: "public",
    userQuestion: "Can Tezos context point to wallets worth inspecting without forcing a transaction?",
    visibleProof: "Holder rows, marketplace listings, and trade-board objects expose wallet context as readable community signal.",
    whyItMatters: "Interesting wallets help collectors, curators, and new users understand Tezos through people and objects instead of raw addresses.",
    currentWeakness: "Wallet context can still feel advanced when the user does not know whether to open Leaderboards, Gallery, Hoard, tz2at, or Profile next.",
    nextBetaMove: "Keep Leaderboards as the public proof route and make wallet-related next steps visible through route groups and atlas filters.",
    quietFallback: "If wallet proof is quiet, keep object discovery first and avoid pushing contract-heavy or signer-heavy actions too early.",
    noWriteRule: "No beta write: wallet proof only reads existing public context and never links wallets, signs, swaps, buys, or follows.",
    relatedSignals: ["wtf-holders", "market-listings", "market-trade-board"],
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
