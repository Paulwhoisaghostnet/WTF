import type { BetaAppCatalogEntry } from "./beta-app-catalog";
import type { BetaNowSignalKey } from "./beta-now-signals";

export type BetaDiscoveryTrailKey = "collector" | "creator" | "builder" | "community" | "admin";

export interface BetaDiscoveryTrailStep {
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  sourceKey?: BetaNowSignalKey;
  why: string;
  lockedCopy?: string;
}

export interface BetaDiscoveryTrail {
  key: BetaDiscoveryTrailKey;
  label: string;
  persona: string;
  promise: string;
  trigger: string;
  success: string;
  returnTomorrow: string;
  steps: BetaDiscoveryTrailStep[];
}

export interface BetaTrailStateCopy {
  quiet: string;
  protected: string;
  unavailable: string;
  adminOnly: string;
}

export const BETA_TRAIL_STATE_COPY: Record<BetaDiscoveryTrailKey, BetaTrailStateCopy> = {
  collector: {
    quiet: "A quiet collector signal means browse Gallery first, then return when listings, trade-board objects, or market heat refresh.",
    protected: "Signed-in collector steps preserve identity, inventory context, and market intent before wallet or offer actions.",
    unavailable: "If a public market provider is unavailable, keep the public Gallery and Leaderboards path visible instead of dead-ending.",
    adminOnly: "Collector trails should not expose admin-only operations; admin market review belongs in The Count trail.",
  },
  creator: {
    quiet: "Quiet creator proof means start with Studio drafts and preparation tools before expecting audience or TV channel signals.",
    protected: "Signed-in creator steps protect drafts, assets, hosted pinning readiness, domains, and publish ownership.",
    unavailable: "If creator media proof is unavailable, keep the Studio-to-pinning path available so recovery is still obvious.",
    adminOnly: "Creator progression may request roles, but it never grants admin authority from EXP or tool use.",
  },
  builder: {
    quiet: "Quiet builder proof means the project shelf needs a first build, map, console test, or Arcade play signal.",
    protected: "Signed-in builder steps keep projects, maps, tests, submissions, and feedback attached to the builder identity.",
    unavailable: "If Console or Arcade proof is unavailable, route the builder to Game Studio and Map Lab without changing those apps.",
    adminOnly: "Builder tools stay user-facing; admin moderation and app-gate controls remain outside this trail.",
  },
  community: {
    quiet: "Quiet community data means start with public progress or Arcade play before expecting replies, rooms, or notifications.",
    protected: "Signed-in community steps turn public motion into posts, room attendance, personal notifications, and account-backed replies.",
    unavailable: "If social proof is unavailable, keep public progress and shared play visible so the hub does not feel empty.",
    adminOnly: "Community members should see people and return loops, not admin-only review queues.",
  },
  admin: {
    quiet: "Quiet admin data means review public progress first and avoid inventing work where no completions or reward rows exist.",
    protected: "Signed-in admin-adjacent steps preserve the actor, user outcome, reward state, and market context before review.",
    unavailable: "If public proof is unavailable, The Count should wait for owner surfaces or audit logs rather than guessing.",
    adminOnly: "Strict admin role is required for operator controls; EXP and role-readiness signals can inform review but cannot unlock admin power.",
  },
};

export const BETA_DISCOVERY_TRAILS: BetaDiscoveryTrail[] = [
  {
    key: "collector",
    label: "Collector Trail",
    persona: "Collector",
    promise: "Turn visible market and holder motion into a manageable collect-and-follow path.",
    trigger: "A listing, holder, reward, or Rat Race signal looks interesting.",
    success: "The user finds one object, understands its market context, and discovers the next collector tool.",
    returnTomorrow: "New listings, rewards, and market heat can change overnight.",
    steps: [
      { label: "See who is moving", route: "/leaderboard", access: "public", sourceKey: "wtf-holders", why: "Start with public proof that wallets and people are active." },
      { label: "Browse public art", route: "/gallery", access: "public", why: "Move from people to objects without requiring a wallet-heavy first step." },
      { label: "Inspect market context", route: "/marketplace", access: "session", sourceKey: "market-listings", why: "Listings are visible as a signal; market actions remain signed-in.", lockedCopy: "Sign in attaches market intent to your WTFOS identity before listings, offers, auctions, or trade-board actions." },
      { label: "Track urgency", route: "/rat-race", access: "session", sourceKey: "market-heat", why: "Use Rat Race when the question becomes what is moving fast.", lockedCopy: "Sign in keeps urgency checks tied to your collection context before wallet or market actions." },
      { label: "Check inventory", route: "/wtfiam", access: "session", why: "Close the loop with owned items, earned rewards, and in-app market context.", lockedCopy: "Sign in opens owned inventory, earned rewards, and spend history without guessing who you are." },
    ],
  },
  {
    key: "creator",
    label: "Creator Trail",
    persona: "Creator",
    promise: "Turn creation tools into one publishable path from draft to promotion.",
    trigger: "A creator wants to make, package, pin, publish, and show work.",
    success: "The user understands which existing creator tool comes next before opening it.",
    returnTomorrow: "Drafts, pin jobs, domain states, and audience activity create recovery prompts.",
    steps: [
      { label: "Open the workspace", route: "/studio", access: "session", why: "Start where projects and creative work can be gathered.", lockedCopy: "Sign in loads your projects, drafts, and recovery state before opening creator work." },
      { label: "Prepare the object", route: "/tools/broot", access: "session", why: "Use Broot when the next need is asset preparation.", lockedCopy: "Sign in keeps prepared assets linked to your workspace and publishing path." },
      { label: "Package the drop", route: "/tools/macaroni", access: "session", why: "Move from raw work into a drop-ready structure.", lockedCopy: "Sign in protects drafts, wallet readiness, and publishing ownership before packaging a drop." },
      { label: "Pin and publish", route: "/ipfs-pinning", access: "session", why: "Use the existing publishing backbone instead of hiding storage as magic.", lockedCopy: "Sign in checks hosted pinning, domain, and quota readiness before storage work." },
      { label: "Promote through Skywire", route: "/skywire", access: "public", sourceKey: "tv-channels", why: "Connect publishing output to the social, media, and live network." },
    ],
  },
  {
    key: "builder",
    label: "Builder Trail",
    persona: "Builder",
    promise: "Turn experiments into playable, inspectable projects with clear feedback routes.",
    trigger: "A builder sees a console or arcade signal and wants to ship something better.",
    success: "The user can move from build surface to test surface to feedback surface without guessing.",
    returnTomorrow: "Play counts, recent scores, and feedback give builders a reason to keep tuning.",
    steps: [
      { label: "Start building", route: "/game-studio", access: "session", why: "Use Game Studio as the hands-on project start.", lockedCopy: "Sign in keeps projects, templates, scores, and submissions tied to your builder identity." },
      { label: "Map the system", route: "/map-lab", access: "session", why: "Map Lab clarifies how the work relates to the wider OS.", lockedCopy: "Sign in opens editable maps and work routes while keeping public maps separate." },
      { label: "Test in Console", route: "/console", access: "session", sourceKey: "console-discovery", why: "Console makes builder output inspectable.", lockedCopy: "Sign in opens testing and project state; public play remains in Arcade." },
      { label: "Watch Arcade proof", route: "/arcade", access: "public", sourceKey: "arcade-recent", why: "Recent play proves whether users are touching the work." },
      { label: "Collect feedback", route: "/w", access: "session", sourceKey: "w-feed", why: "W turns shipped work into a conversation loop.", lockedCopy: "Sign in lets feedback, replies, and social proof attach to your account." },
    ],
  },
  {
    key: "community",
    label: "Community Trail",
    persona: "Community Member",
    promise: "Make people, rooms, replies, and shared activity feel present before the app list sprawls.",
    trigger: "The user wants to know whether anyone else is here right now.",
    success: "The user sees people, joins one social surface, and understands what to check next.",
    returnTomorrow: "Replies, rooms, scores, events, and notifications keep the social surface alive.",
    steps: [
      { label: "See active progress", route: "/leaderboard", access: "public", sourceKey: "profile-activity", why: "EXP activity shows that visible people are progressing." },
      { label: "Play where people play", route: "/arcade", access: "public", sourceKey: "arcade-discovery", why: "Arcade gives a low-friction shared activity." },
      { label: "Read the feed", route: "/w", access: "session", sourceKey: "w-feed", why: "W is the signed-in social context for current activity.", lockedCopy: "Sign in turns public motion into posts, replies, and account-backed social context." },
      { label: "Join live rooms", route: "/live", access: "session", why: "WTF LIVE turns presence into a time-bound gathering.", lockedCopy: "Sign in opens host, attendance, chat, and room controls while public room proof stays visible." },
      { label: "Check what changed", route: "/notifications", access: "session", sourceKey: "notifications", why: "Notifications are the personal return loop.", lockedCopy: "Sign in makes replies, rewards, room changes, and project recovery personal to you." },
    ],
  },
  {
    key: "admin",
    label: "The Count Trail",
    persona: "Admin",
    promise: "Make discovery, unlocks, roles, rewards, and market sinks manageable for the Count.",
    trigger: "A user, quest, challenge, role, reward, or market item needs review.",
    success: "The Count can see which admin surface owns the next action and which user outcome it protects.",
    returnTomorrow: "New completions, reward rows, abuse signals, and market inventory need daily triage.",
    steps: [
      { label: "Read public progress", route: "/leaderboard", access: "public", sourceKey: "reward-earners", why: "Start from visible EXP and reward outcomes before changing anything." },
      { label: "Tune side quests", route: "/side-quests", access: "session", why: "Side quests define the small repeatable discovery loop.", lockedCopy: "Sign in keeps quest definitions, completions, EXP, and reward review tied to the right actor." },
      { label: "Review challenges", route: "/challenges", access: "session", why: "Challenges connect submissions, roles, rewards, and community arcs.", lockedCopy: "Sign in preserves submissions, review state, rewards, and role-readiness context." },
      { label: "Inspect economy", route: "/wtfiam", access: "session", why: "Inventory and in-app market state show what users can earn and spend.", lockedCopy: "Sign in opens earned inventory, reward rows, and market sinks before admin action." },
      { label: "Open admin suite", route: "/admin", access: "admin", why: "Admin remains explicit; EXP never implies operator power.", lockedCopy: "Admin role required. EXP can signal readiness, but it never grants operator authority." },
    ],
  },
];

export function betaDiscoveryTrailRoutes(): string[] {
  return [...new Set(BETA_DISCOVERY_TRAILS.flatMap((trail) => trail.steps.map((step) => step.route)))];
}
