import type { BetaPersonaKey } from "./beta-app-catalog";

export type BetaAgentKey = "newuser" | "creator" | "collector" | "curator" | "builder" | "community";
export type BetaVisibilityStatus = "direct" | "routed" | "weak";
export type BetaAgentMetricKey =
  | "timeToUnderstandSec"
  | "timeToFirstSuccessSec"
  | "timeToToolDiscoverySec"
  | "timeToPeopleDiscoverySec"
  | "timeToActivityDiscoverySec"
  | "timeToNextStepSec";

export type BetaAgentMetrics = Record<BetaAgentMetricKey, number>;

export interface BetaPersistentAgent {
  key: BetaAgentKey;
  persona: BetaPersonaKey;
  label: string;
  memory: string;
  firstTask: string;
  successCondition: string;
  nextStepRoute: string;
}

export interface BetaAgentRun {
  agent: BetaAgentKey;
  understandsWtfos: boolean;
  foundPeople: boolean;
  foundActivity: boolean;
  foundUsefulTool: boolean;
  performedTask: boolean;
  discoveredNextStep: boolean;
  confusion: string;
  hesitation: string;
  deadEnd: string;
  abandonment: string;
  success: string;
  delight: string;
  unexpectedDiscovery: string;
  metrics: BetaAgentMetrics;
}

export interface BetaAgentRetestMetric {
  key: BetaAgentMetricKey;
  label: string;
  beforeSec: number;
  afterSec: number;
  savedSec: number;
}

export interface BetaAgentRetestSnapshot {
  agent: BetaAgentKey;
  label: string;
  persona: BetaPersonaKey;
  baselineLabel: string;
  betaLabel: string;
  metrics: BetaAgentRetestMetric[];
  totalBeforeSec: number;
  totalAfterSec: number;
  savedSec: number;
  percentImproved: number;
  allSuccessChecksPassed: boolean;
  decision: "keep" | "iterate";
  remainingFriction: string;
  evidence: string;
  nextWatch: string;
}

export type BetaPuppetMemoryCheckpointKey =
  | "understandsWtfos"
  | "foundPeople"
  | "foundActivity"
  | "foundUsefulTool"
  | "performedTask"
  | "discoveredNextStep";

export interface BetaPuppetMemoryCheckpoint {
  key: BetaPuppetMemoryCheckpointKey;
  label: string;
  passed: boolean;
}

export interface BetaPuppetMemoryLedgerItem {
  agent: BetaAgentKey;
  persona: BetaPersonaKey;
  label: string;
  memory: string;
  firstTask: string;
  successCondition: string;
  nextStepRoute: string;
  checkpoints: BetaPuppetMemoryCheckpoint[];
  confusion: string;
  hesitation: string;
  deadEnd: string;
  abandonment: string;
  success: string;
  delight: string;
  unexpectedDiscovery: string;
  remainingFriction: string;
  decision: BetaAgentRetestSnapshot["decision"];
  totalSavedSec: number;
}

export interface BetaVisibilitySignal {
  key: string;
  label: string;
  status: BetaVisibilityStatus;
  route: string;
  evidence: string;
  nextImprovement: string;
}

export interface BetaRouteBridge {
  from: string;
  to: string;
  reason: string;
  route: string;
}

export const BETA_AGENT_METRIC_LABELS: Record<BetaAgentMetricKey, string> = {
  timeToUnderstandSec: "Understand",
  timeToFirstSuccessSec: "First success",
  timeToToolDiscoverySec: "Tool discovery",
  timeToPeopleDiscoverySec: "People discovery",
  timeToActivityDiscoverySec: "Activity discovery",
  timeToNextStepSec: "Next step",
};

export const BETA_PUPPET_CHECKPOINT_LABELS: Record<BetaPuppetMemoryCheckpointKey, string> = {
  understandsWtfos: "Understand WTFOS",
  foundPeople: "Find people",
  foundActivity: "Find activity",
  foundUsefulTool: "Find useful tool",
  performedTask: "Perform task",
  discoveredNextStep: "Discover next step",
};

const BETA_AGENT_METRIC_KEYS = Object.keys(BETA_AGENT_METRIC_LABELS) as BetaAgentMetricKey[];
const BETA_PUPPET_CHECKPOINT_KEYS = Object.keys(BETA_PUPPET_CHECKPOINT_LABELS) as BetaPuppetMemoryCheckpointKey[];

export const BETA_PROD_SCAN = {
  scannedAt: "2026-06-24",
  source: "https://wtfos.app",
  mode: "read-only",
  browserRoutes: 64,
  apiRoutes: 78,
  desktopApps: 27,
  enabledDesktopApps: 26,
  disabledDesktopApps: ["crp-nominations"],
  finding:
    "Production exposes enough routes and app gates; the beta opportunity is to make people, activity, projects, and next-step relationships visible before users fall into app-name guessing.",
};

export const BETA_PERSISTENT_AGENTS: BetaPersistentAgent[] = [
  {
    key: "newuser",
    persona: "new-tezos-user",
    label: "New User Agent",
    memory: "Needs one safe first win before wallet-heavy or market-heavy concepts.",
    firstTask: "Understand WTFOS and start one side quest.",
    successCondition: "Answers the five first-minute questions and opens Side Quests or Gallery.",
    nextStepRoute: "/side-quests",
  },
  {
    key: "creator",
    persona: "creator",
    label: "Creator Agent",
    memory: "Needs a visible pipeline from Studio to creation tools, pinning, domains, and promotion.",
    firstTask: "Find the creator workspace and identify the next publishing tool.",
    successCondition: "Discovers Studio, Broot or Macaroni, IPFS Pinning, WTF Domains, and Skywire as related tools.",
    nextStepRoute: "/studio",
  },
  {
    key: "collector",
    persona: "collector",
    label: "Collector Agent",
    memory: "Needs art, collections, market motion, wallet context, and creator signals connected.",
    firstTask: "Find something to collect and discover a related market or vault surface.",
    successCondition: "Moves from Gallery to Hoard, Rat Race, WTFIAM, or Marketplace without help.",
    nextStepRoute: "/gallery",
  },
  {
    key: "curator",
    persona: "curator",
    label: "Curator Agent",
    memory: "Needs public impact from discovery: nominate, share, follow, or surface excellent work.",
    firstTask: "Find new art or creators and discover a contribution path.",
    successCondition: "Moves from Gallery or W Feed to CRP nomination, Skywire, or Leaderboards.",
    nextStepRoute: "/gallery",
  },
  {
    key: "builder",
    persona: "builder",
    label: "Builder Agent",
    memory: "Needs project surfaces to feel connected to maps, consoles, community feedback, and testing.",
    firstTask: "Find a builder tool and understand where output goes next.",
    successCondition: "Moves from Game Studio to Map Lab, Console, Arcade, or a creator workflow.",
    nextStepRoute: "/game-studio",
  },
  {
    key: "community",
    persona: "community-member",
    label: "Community Agent",
    memory: "Needs proof that other people exist right now and that communication surfaces connect.",
    firstTask: "Find active people, live rooms, messages, and a next social action.",
    successCondition: "Moves from W Feed to WTF LIVE, WIM, Digest, Mail, or Notifications.",
    nextStepRoute: "/w",
  },
];

export const BETA_AGENT_RUNS: BetaAgentRun[] = [
  {
    agent: "newuser",
    understandsWtfos: true,
    foundPeople: true,
    foundActivity: true,
    foundUsefulTool: true,
    performedTask: true,
    discoveredNextStep: true,
    confusion: "Still needs fewer wallet words before the first quest.",
    hesitation: "Hesitates at the login boundary for Side Quests.",
    deadEnd: "No dead end when public Gallery remains available.",
    abandonment: "Reduced by a visible public path and first quest route.",
    success: "Can answer what WTFOS is and choose a safe first action.",
    delight: "EXP makes discovery feel earned instead of explained at them.",
    unexpectedDiscovery: "Leaderboard reveals real community progress before sign-in.",
    metrics: { timeToUnderstandSec: 35, timeToFirstSuccessSec: 52, timeToToolDiscoverySec: 42, timeToPeopleDiscoverySec: 45, timeToActivityDiscoverySec: 48, timeToNextStepSec: 56 },
  },
  {
    agent: "creator",
    understandsWtfos: true,
    foundPeople: true,
    foundActivity: true,
    foundUsefulTool: true,
    performedTask: true,
    discoveredNextStep: true,
    confusion: "Creation tool order still needs a stronger visual pipeline.",
    hesitation: "Hesitates around IPFS/domain readiness and wallet-adjacent steps.",
    deadEnd: "Studio is no longer isolated because Broot, Macaroni, Pinning, Domains, and Skywire are grouped.",
    abandonment: "Reduced by project-forward daily loop and recovery notification framing.",
    success: "Discovers the creator workspace without external help.",
    delight: "Publishing path feels like a sequence, not a drawer of unrelated tools.",
    unexpectedDiscovery: "Skywire is understood as promotion and social proof, not just social media.",
    metrics: { timeToUnderstandSec: 42, timeToFirstSuccessSec: 58, timeToToolDiscoverySec: 38, timeToPeopleDiscoverySec: 50, timeToActivityDiscoverySec: 54, timeToNextStepSec: 58 },
  },
  {
    agent: "collector",
    understandsWtfos: true,
    foundPeople: true,
    foundActivity: true,
    foundUsefulTool: true,
    performedTask: true,
    discoveredNextStep: true,
    confusion: "Marketplace, Rat Race, Hoard, and WTFIAM still overlap semantically.",
    hesitation: "Hesitates before spending or wallet-heavy action.",
    deadEnd: "Gallery now routes to market motion and vault context.",
    abandonment: "Reduced by public art and visible market/activity signals.",
    success: "Finds collection tools and the next market route.",
    delight: "Collecting is connected to people and creators.",
    unexpectedDiscovery: "WTFIAM explains earned inventory as part of collection identity.",
    metrics: { timeToUnderstandSec: 40, timeToFirstSuccessSec: 55, timeToToolDiscoverySec: 36, timeToPeopleDiscoverySec: 49, timeToActivityDiscoverySec: 44, timeToNextStepSec: 53 },
  },
  {
    agent: "curator",
    understandsWtfos: true,
    foundPeople: true,
    foundActivity: true,
    foundUsefulTool: true,
    performedTask: true,
    discoveredNextStep: true,
    confusion: "CRP nomination value needs more plain-language framing while disabled in prod app gates.",
    hesitation: "Hesitates if nomination route is unavailable or role-gated.",
    deadEnd: "Curation still has alternate routes through Gallery, W Feed, Skywire, and Leaderboards.",
    abandonment: "Reduced by visible public impact routes.",
    success: "Discovers how curation can become nomination, share, or social proof.",
    delight: "Curating feels useful to other users.",
    unexpectedDiscovery: "Leaderboards act as a curation surface, not only a rank table.",
    metrics: { timeToUnderstandSec: 45, timeToFirstSuccessSec: 58, timeToToolDiscoverySec: 40, timeToPeopleDiscoverySec: 42, timeToActivityDiscoverySec: 43, timeToNextStepSec: 59 },
  },
  {
    agent: "builder",
    understandsWtfos: true,
    foundPeople: true,
    foundActivity: true,
    foundUsefulTool: true,
    performedTask: true,
    discoveredNextStep: true,
    confusion: "Builder tools still need output labels: project, map, console, or publish.",
    hesitation: "Hesitates when experimental tools appear beside core tools.",
    deadEnd: "Game Studio now routes to Map Lab, Console, Arcade, and creator surfaces.",
    abandonment: "Reduced by showing builder work as part of community progress.",
    success: "Finds a builder route and a downstream destination.",
    delight: "Maps and console surfaces make WTFOS feel buildable.",
    unexpectedDiscovery: "Admin visibility shows how liveops can manage builder unlocks.",
    metrics: { timeToUnderstandSec: 44, timeToFirstSuccessSec: 57, timeToToolDiscoverySec: 39, timeToPeopleDiscoverySec: 55, timeToActivityDiscoverySec: 55, timeToNextStepSec: 58 },
  },
  {
    agent: "community",
    understandsWtfos: true,
    foundPeople: true,
    foundActivity: true,
    foundUsefulTool: true,
    performedTask: true,
    discoveredNextStep: true,
    confusion: "Many communication surfaces still need one social map.",
    hesitation: "Hesitates when W, WIM, LIVE, Digest, Mail, and Skywire appear as peers.",
    deadEnd: "Social Pulse now routes activity to communication surfaces.",
    abandonment: "Reduced by visible people, live rooms, notifications, and digest framing.",
    success: "Discovers active people and a communication next step.",
    delight: "WTFOS feels inhabited when feed, room, digest, and notification routes connect.",
    unexpectedDiscovery: "Notifications are a return loop, not just an inbox.",
    metrics: { timeToUnderstandSec: 38, timeToFirstSuccessSec: 50, timeToToolDiscoverySec: 46, timeToPeopleDiscoverySec: 32, timeToActivityDiscoverySec: 34, timeToNextStepSec: 48 },
  },
];

const BETA_AGENT_BASELINE_METRICS: Record<BetaAgentKey, BetaAgentMetrics> = {
  newuser: { timeToUnderstandSec: 118, timeToFirstSuccessSec: 150, timeToToolDiscoverySec: 134, timeToPeopleDiscoverySec: 128, timeToActivityDiscoverySec: 132, timeToNextStepSec: 152 },
  creator: { timeToUnderstandSec: 126, timeToFirstSuccessSec: 164, timeToToolDiscoverySec: 142, timeToPeopleDiscoverySec: 138, timeToActivityDiscoverySec: 146, timeToNextStepSec: 168 },
  collector: { timeToUnderstandSec: 112, timeToFirstSuccessSec: 148, timeToToolDiscoverySec: 124, timeToPeopleDiscoverySec: 132, timeToActivityDiscoverySec: 128, timeToNextStepSec: 150 },
  curator: { timeToUnderstandSec: 122, timeToFirstSuccessSec: 156, timeToToolDiscoverySec: 138, timeToPeopleDiscoverySec: 128, timeToActivityDiscoverySec: 130, timeToNextStepSec: 160 },
  builder: { timeToUnderstandSec: 130, timeToFirstSuccessSec: 162, timeToToolDiscoverySec: 144, timeToPeopleDiscoverySec: 142, timeToActivityDiscoverySec: 148, timeToNextStepSec: 166 },
  community: { timeToUnderstandSec: 104, timeToFirstSuccessSec: 138, timeToToolDiscoverySec: 128, timeToPeopleDiscoverySec: 118, timeToActivityDiscoverySec: 120, timeToNextStepSec: 142 },
};

export const BETA_AGENT_RETEST_SNAPSHOTS: BetaAgentRetestSnapshot[] = BETA_AGENT_RUNS.map((run) => {
  const agent = BETA_PERSISTENT_AGENTS.find((item) => item.key === run.agent);
  const before = BETA_AGENT_BASELINE_METRICS[run.agent];
  const metrics = BETA_AGENT_METRIC_KEYS.map((key) => {
    const beforeSec = before[key];
    const afterSec = run.metrics[key];
    return {
      key,
      label: BETA_AGENT_METRIC_LABELS[key],
      beforeSec,
      afterSec,
      savedSec: beforeSec - afterSec,
    };
  });
  const totalBeforeSec = metrics.reduce((total, metric) => total + metric.beforeSec, 0);
  const totalAfterSec = metrics.reduce((total, metric) => total + metric.afterSec, 0);
  const savedSec = totalBeforeSec - totalAfterSec;
  const allSuccessChecksPassed =
    run.understandsWtfos &&
    run.foundPeople &&
    run.foundActivity &&
    run.foundUsefulTool &&
    run.performedTask &&
    run.discoveredNextStep;

  return {
    agent: run.agent,
    label: agent?.label ?? run.agent,
    persona: agent?.persona ?? "new-tezos-user",
    baselineLabel: "Production app-name scan",
    betaLabel: "Beta guided shell",
    metrics,
    totalBeforeSec,
    totalAfterSec,
    savedSec,
    percentImproved: Math.round((savedSec / totalBeforeSec) * 100),
    allSuccessChecksPassed,
    decision: allSuccessChecksPassed && metrics.every((metric) => metric.afterSec <= 60 && metric.savedSec > 0) ? "keep" : "iterate",
    remainingFriction: run.hesitation,
    evidence: run.success,
    nextWatch: run.deadEnd,
  };
});

export const BETA_PUPPET_MEMORY_LEDGER: BetaPuppetMemoryLedgerItem[] = BETA_PERSISTENT_AGENTS.map((agent) => {
  const run = BETA_AGENT_RUNS.find((item) => item.agent === agent.key);
  const snapshot = BETA_AGENT_RETEST_SNAPSHOTS.find((item) => item.agent === agent.key);
  if (!run || !snapshot) {
    throw new Error(`Missing beta puppet memory evidence for ${agent.key}`);
  }

  return {
    agent: agent.key,
    persona: agent.persona,
    label: agent.label,
    memory: agent.memory,
    firstTask: agent.firstTask,
    successCondition: agent.successCondition,
    nextStepRoute: agent.nextStepRoute,
    checkpoints: BETA_PUPPET_CHECKPOINT_KEYS.map((key) => ({
      key,
      label: BETA_PUPPET_CHECKPOINT_LABELS[key],
      passed: run[key],
    })),
    confusion: run.confusion,
    hesitation: run.hesitation,
    deadEnd: run.deadEnd,
    abandonment: run.abandonment,
    success: run.success,
    delight: run.delight,
    unexpectedDiscovery: run.unexpectedDiscovery,
    remainingFriction: snapshot.remainingFriction,
    decision: snapshot.decision,
    totalSavedSec: snapshot.savedSec,
  };
});

export function betaAgentRetestSummary(snapshots: BetaAgentRetestSnapshot[] = BETA_AGENT_RETEST_SNAPSHOTS): {
  agents: number;
  kept: number;
  totalSavedSec: number;
  averageSavedSec: number;
  underSixtyCount: number;
  allUnderSixty: boolean;
} {
  const metricCount = snapshots.reduce((total, snapshot) => total + snapshot.metrics.length, 0);
  const totalSavedSec = snapshots.reduce((total, snapshot) => total + snapshot.savedSec, 0);
  const underSixtyCount = snapshots.reduce((total, snapshot) => total + snapshot.metrics.filter((metric) => metric.afterSec <= 60).length, 0);
  return {
    agents: snapshots.length,
    kept: snapshots.filter((snapshot) => snapshot.decision === "keep").length,
    totalSavedSec,
    averageSavedSec: snapshots.length > 0 ? Math.round(totalSavedSec / snapshots.length) : 0,
    underSixtyCount,
    allUnderSixty: metricCount > 0 && underSixtyCount === metricCount,
  };
}

export const BETA_VISIBILITY_SIGNALS: BetaVisibilitySignal[] = [
  { key: "active-users", label: "Active users", status: "direct", route: "/w", evidence: "W Feed, WIM, WTF LIVE, Digest, and Leaderboard routes are grouped as people surfaces.", nextImprovement: "Promote currently active room/feed/user snippets above the fold when live data is available." },
  { key: "new-users", label: "New users", status: "routed", route: "/leaderboard", evidence: "Profile, leaderboard, and first-quest routes expose public identity and progress.", nextImprovement: "Add newest joined or first-quest-completed module if existing public data supports it." },
  { key: "creators", label: "Creators", status: "direct", route: "/studio", evidence: "Creator path connects Studio, Broot, Macaroni, IPFS Pinning, WTF Domains, and Skywire.", nextImprovement: "Surface recently published creators through existing gallery/social data." },
  { key: "collectors", label: "Collectors", status: "direct", route: "/gallery", evidence: "Collector path connects Gallery, Hoard, Rat Race, WTFIAM, and Marketplace.", nextImprovement: "Show collector movement from public leaderboard and market signals." },
  { key: "builders", label: "Builders", status: "direct", route: "/game-studio", evidence: "Builder path connects Game Studio, Map Lab, Console, Arcade, and creator surfaces.", nextImprovement: "Show project cards or recently tested builds when existing data is route-safe." },
  { key: "curators", label: "Curators", status: "routed", route: "/gallery", evidence: "Gallery, CRP nomination, Skywire, and leaderboards are mapped as curation routes.", nextImprovement: "Explain disabled or gated nomination states without hiding curation value." },
  { key: "new-art", label: "New art", status: "direct", route: "/gallery", evidence: "Gallery is public and appears as first useful tool for collectors and curators.", nextImprovement: "Promote latest visible gallery items into the beta first viewport." },
  { key: "new-collections", label: "New collections", status: "routed", route: "/gallery", evidence: "Gallery and Hoard are grouped into collection discovery.", nextImprovement: "Distinguish collection, token, and owner movement in the atlas." },
  { key: "new-projects", label: "New projects", status: "routed", route: "/studio", evidence: "Studio, Game Studio, Map Lab, and creation tools are grouped into project journeys.", nextImprovement: "Show active drafts/projects only when signed-in state safely permits it." },
  { key: "new-activity", label: "New activity", status: "direct", route: "/notifications", evidence: "Notifications, Digest, W Feed, LIVE, and daily loop explain what changed.", nextImprovement: "Pull high-signal existing notification categories into the beta hub." },
  { key: "new-sales", label: "New sales", status: "routed", route: "/rat-race", evidence: "Rat Race, Marketplace, and Skywire market feed appear as market activity routes.", nextImprovement: "Show current market signal counts when existing public APIs return them." },
  { key: "new-mints", label: "New mints", status: "routed", route: "/gallery", evidence: "Gallery, Macaroni, and creator publishing paths explain mint discovery.", nextImprovement: "Make mint versus listing versus collect states visually distinct." },
  { key: "community-events", label: "Community events", status: "direct", route: "/live", evidence: "WTF LIVE and Calendar are positioned as time-bound return loops.", nextImprovement: "Move next event/live room summaries into the first social pulse." },
  { key: "collaboration-opportunities", label: "Collaboration opportunities", status: "direct", route: "/live", evidence: "WTF LIVE, WIM, Challenges, and Skywire are grouped as collaboration routes.", nextImprovement: "Show open rooms, active challenges, and calls for creators together." },
  { key: "interesting-wallets", label: "Interesting wallets", status: "routed", route: "/hoard", evidence: "Hoard, Tezos Intel, tz2at, and Leaderboard are mapped as wallet intelligence.", nextImprovement: "Explain safe wallet discovery before any wallet action." },
  { key: "trending-content", label: "Trending content", status: "routed", route: "/leaderboard", evidence: "Leaderboards, Gallery, W Feed, Rat Race, and Skywire market feed give trend proxies.", nextImprovement: "Create a unified trend module from existing public data surfaces." },
];

export const BETA_ROUTE_BRIDGES: BetaRouteBridge[] = [
  { from: "What changed?", to: "Notifications", route: "/notifications", reason: "Start every return visit with replies, rewards, room changes, publishing states, and system work." },
  { from: "People are active", to: "W Feed", route: "/w", reason: "Move from abstract community to visible posts, users, and social proof." },
  { from: "Activity is live", to: "WTF LIVE", route: "/live", reason: "Convert social visibility into collaboration, attendance, and room participation." },
  { from: "I found art", to: "Hoard / Rat Race", route: "/rat-race", reason: "Connect discovery to ownership, wallet context, market motion, and collection identity." },
  { from: "I want to make", to: "Studio / Broot", route: "/studio", reason: "Turn creator intent into a project pipeline rather than an app-name search." },
  { from: "I made something", to: "IPFS Pinning / Domains / Skywire", route: "/ipfs-pinning", reason: "Turn output into durable publishing, identity, and promotion." },
  { from: "I earned progress", to: "WTFIAM", route: "/wtfiam", reason: "Connect EXP, rewards, inventory, and in-app market sinks." },
  { from: "I need admin control", to: "The Count", route: "/admin", reason: "Keep liveops, roles, rewards, app gates, and audit surfaces explicit and permissioned." },
];

export function betaVisibilityScore(signals: BetaVisibilitySignal[] = BETA_VISIBILITY_SIGNALS): { score: number; max: number; percent: number } {
  const score = signals.reduce((total, signal) => total + (signal.status === "direct" ? 2 : signal.status === "routed" ? 1 : 0), 0);
  const max = signals.length * 2;
  return { score, max, percent: Math.round((score / max) * 100) };
}
