import {
  DESKTOP_APPS,
  DESKTOP_APP_LABELS,
  EXPERIMENTAL_DESKTOP_APPS,
  getXpTierForTotal,
  type DesktopAppKey,
} from "@shared/types";
import { CREATION_TOOLS } from "../creation-tools/tool-registry";
import type { BetaNowSignalKey } from "./beta-now-signals";

export type BetaPersonaKey =
  | "new-tezos-user"
  | "collector"
  | "creator"
  | "builder"
  | "curator"
  | "community-member";
export type BetaTier = 1 | 2 | 3 | 4 | 5;
export type BetaStage = "start" | "identity" | "collect" | "create" | "connect" | "publish" | "play" | "operate" | "recover";

export interface BetaPersona {
  key: BetaPersonaKey;
  label: string;
  promise: string;
  firstRoute: string;
  nextRoute: string;
  returnReason: string;
  confusion: string;
  failure: string;
  hesitation: string;
  abandonment: string;
  delightedBy: string;
}

export interface BetaAppCatalogEntry {
  id: string;
  title: string;
  route: string;
  appKey?: DesktopAppKey;
  access: "public" | "session" | "role" | "admin";
  tier: BetaTier;
  stage: BetaStage;
  personas: BetaPersonaKey[];
  purpose: string;
  whenToUse: string;
  userBenefit: string;
  before: string[];
  after: string[];
  feedsInto: string[];
  consumes: string[];
  related: string[];
  betaAction: string;
  visibilityNote: string;
}

export interface BetaCountLiveopsCommand {
  key: string;
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  ownerSurface: string;
  trigger: string;
  adminAction: string;
  playerOutcome: string;
  auditProof: string;
  riskControl: string;
}

export type BetaCountAdminSummaryKey =
  | "user-needs"
  | "role-gates"
  | "quest-challenge-load"
  | "reward-settlement"
  | "market-operations"
  | "automation-definitions";

export interface BetaCountAdminSummarySource {
  key: BetaCountAdminSummaryKey;
  label: string;
  route: string;
  endpoint: string;
  access: "admin";
  countLabel: string;
  purpose: string;
  failureCopy: string;
}

export interface BetaCountAdminWorkbenchItem {
  key: string;
  label: string;
  question: string;
  adminJob: string;
  playerNeed: string;
  ownerSurface: string;
  adminRoute: string;
  adminAccess: "admin";
  playerRoute: string;
  playerAccess: BetaAppCatalogEntry["access"];
  sourceOfTruth: string;
  setupChecklist: string[];
  decisionGate: string;
  proofToInspect: string;
  riskControl: string;
  successSignal: string;
  relatedRoutes: string[];
}

export type BetaCountLiveopsRecipeKey =
  | "starter-witness-recipe"
  | "creator-publish-recipe"
  | "collector-market-recipe"
  | "builder-surface-recipe"
  | "curator-signal-recipe"
  | "community-return-recipe";

export type BetaCountLiveopsRecipeStageKey = "detect" | "define" | "prove" | "reward" | "gate" | "return";

export interface BetaCountLiveopsRecipeStage {
  key: BetaCountLiveopsRecipeStageKey;
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  ownerSurface: string;
  countAction: string;
  proofRequired: string;
}

export interface BetaCountLiveopsRecipe {
  key: BetaCountLiveopsRecipeKey;
  label: string;
  actor: BetaQuestlineActorKey;
  targetLevel: string;
  userNeed: string;
  expUse: string;
  sideQuest: string;
  challenge: string;
  reward: string;
  roleOrPermission: string;
  marketOrNotificationEffect: string;
  countDecision: string;
  antiFarmRule: string;
  playerReturn: string;
  noWriteRule: string;
  stages: BetaCountLiveopsRecipeStage[];
}

export type BetaNotificationGroupKey = "social" | "progress" | "live" | "creator" | "market" | "admin";
export type BetaNotificationPriority = "curiosity" | "progress" | "presence" | "discovery" | "market" | "recovery" | "admin";
export type BetaAttentionAudienceKey = BetaPersonaKey | "all-users" | "the-count";
export type BetaAttentionCadence = "now" | "next" | "tomorrow" | "admin";

export interface BetaNotificationEvent {
  label: string;
  priority: BetaNotificationPriority;
  groupKey: BetaNotificationGroupKey;
  route: string;
  access: BetaAppCatalogEntry["access"];
  retentionValue: string;
}

export interface BetaNotificationGroup {
  key: BetaNotificationGroupKey;
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  purpose: string;
  userQuestion: string;
  returnLoop: string;
}

export interface BetaNotificationControlGuide {
  key: BetaNotificationGroupKey;
  label: string;
  signal: string;
  actionRoute: string;
  actionAccess: BetaAppCatalogEntry["access"];
  preferenceRoute: string;
  preferenceAccess: BetaAppCatalogEntry["access"];
  digestRoute: string;
  digestAccess: BetaAppCatalogEntry["access"];
  sourceContract: string;
  userControl: string;
  quietRule: string;
}

export interface BetaAttentionQueueItem {
  key: string;
  label: string;
  audience: BetaAttentionAudienceKey;
  cadence: BetaAttentionCadence;
  route: string;
  access: BetaAppCatalogEntry["access"];
  question: string;
  signalKeys: BetaNowSignalKey[];
  whyItMatters: string;
  action: string;
  quietFallback: string;
  countControl: string;
  relatedRoutes: string[];
}

export type BetaDailyReturnLoopKey = "changes" | "quest" | "people" | "object" | "project" | "admin";
export type BetaQuestlineActorKey = BetaPersonaKey | "the-count";
export type BetaQuestlineStageKey = "notice" | "act" | "prove" | "unlock" | "return";
export type BetaPersonaCommandStepKey = "orient" | "act" | "prove" | "return" | "count";
export type BetaWayfinderSectionId =
  | "beta-now"
  | "beta-proof"
  | "beta-attention"
  | "beta-return"
  | "beta-paths"
  | "beta-atlas"
  | "beta-count";
export type BetaSectionCompassId =
  | "beta-now"
  | "beta-proof"
  | "beta-people"
  | "beta-attention"
  | "beta-return"
  | "beta-passports"
  | "beta-questlines"
  | "beta-governance"
  | "beta-relationships"
  | "beta-route-groups"
  | "beta-trails"
  | "beta-paths"
  | "beta-count"
  | "beta-atlas";
export type BetaSectionCompassAccess = BetaAppCatalogEntry["access"] | "mixed";
export type BetaFrictionQueuePriority = "P1" | "P2" | "P3";
export type BetaFrictionQueueStatus = "strengthen" | "watch" | "keep";
export type BetaCreatorProjectProofStatus = "visible" | "inspect" | "gated";

export interface BetaDailyReturnLoop {
  key: BetaDailyReturnLoopKey;
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  question: string;
  todayAction: string;
  tomorrowReason: string;
  progressionHook: string;
  visibleProof: string;
  countControl: string;
  relatedRoutes: string[];
}

export interface BetaCreatorProjectProofStep {
  key: string;
  label: string;
  status: BetaCreatorProjectProofStatus;
  route: string;
  access: BetaAppCatalogEntry["access"];
  ownerSurface: string;
  userQuestion: string;
  visibleProof: string;
  currentLimit: string;
  nextDependency: string;
  gateBoundary: string;
  noWriteRule: string;
  signalKeys: BetaNowSignalKey[];
}

export interface BetaUnlockQuestlineStage {
  key: BetaQuestlineStageKey;
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  action: string;
  proof: string;
}

export interface BetaUnlockQuestline {
  key: BetaQuestlineActorKey;
  label: string;
  promise: string;
  sideQuest: string;
  challenge: string;
  reward: string;
  roleOrPermission: string;
  adminSurface: string;
  adminReview: string;
  abuseGuard: string;
  stages: BetaUnlockQuestlineStage[];
}

export interface BetaPersonaCommandStep {
  key: BetaPersonaCommandStepKey;
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  action: string;
  proof: string;
}

export interface BetaPersonaCommand {
  key: BetaPersonaKey;
  label: string;
  question: string;
  promise: string;
  attentionKey: string;
  dailyLoopKey: BetaDailyReturnLoopKey;
  countReview: string;
  success: string;
  steps: BetaPersonaCommandStep[];
}

export interface BetaWayfinderAction {
  key: string;
  label: string;
  question: string;
  sectionId: BetaWayfinderSectionId;
  route: string;
  access: BetaAppCatalogEntry["access"];
  persona?: BetaPersonaKey;
  atlasPersona?: BetaPersonaKey | "all";
  atlasStage?: BetaStage | "all";
  atlasTier?: BetaTier | "all";
  atlasQuery?: string;
  proof: string;
  nextAction: string;
}

export interface BetaSectionCompassItem {
  key: string;
  label: string;
  sectionId: BetaSectionCompassId;
  stage: BetaStage;
  audience: BetaQuestlineActorKey | "all-users";
  access: BetaSectionCompassAccess;
  question: string;
  useWhen: string;
  proves: string;
  nextMove: string;
}

export interface BetaFrictionQueueItem {
  key: string;
  label: string;
  priority: BetaFrictionQueuePriority;
  status: BetaFrictionQueueStatus;
  audience: BetaQuestlineActorKey | "all-users";
  sectionId: BetaSectionCompassId;
  route: string;
  access: BetaAppCatalogEntry["access"];
  evidence: string;
  friction: string;
  nextUiMove: string;
  successMeasure: string;
  noWriteRule: string;
  relatedRoutes: string[];
}

export interface BetaUnlockGovernanceItem {
  key: BetaQuestlineActorKey;
  label: string;
  playerQuestion: string;
  evidence: string;
  expSignal: string;
  rewardOrMarketSink: string;
  roleBoundary: string;
  countDecision: string;
  abuseControl: string;
  userRoute: string;
  userAccess: BetaAppCatalogEntry["access"];
  adminRoute: "/admin";
  adminAccess: "admin";
  relatedRoutes: string[];
}

export interface BetaUnlockPassport {
  key: BetaQuestlineActorKey;
  label: string;
  identity: string;
  question: string;
  access: BetaAppCatalogEntry["access"];
  primaryRoute: string;
  primaryAccess: BetaAppCatalogEntry["access"];
  proofRoute: string;
  proofAccess: BetaAppCatalogEntry["access"];
  nextRoute: string;
  nextAccess: BetaAppCatalogEntry["access"];
  visibleNow: string;
  nextSafeAction: string;
  proofNeeded: string;
  unlocksNext: string;
  staysLocked: string;
  countReview: string;
  tomorrowReason: string;
  relatedRoutes: string[];
}

export type BetaRelationshipActorKey = BetaQuestlineActorKey | "all-users";

export interface BetaRelationshipNavigatorStep {
  key: string;
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  why: string;
  handoff: string;
}

export interface BetaRelationshipNavigatorChain {
  key: string;
  label: string;
  actor: BetaRelationshipActorKey;
  stage: BetaStage;
  question: string;
  startsWhen: string;
  userBenefit: string;
  comesBefore: string;
  consumes: string;
  feedsInto: string;
  comesAfter: string;
  countWatch: string;
  steps: BetaRelationshipNavigatorStep[];
  relatedRoutes: string[];
}

export type BetaRouteGroupGuideKey =
  | "first-win"
  | "collector-economy"
  | "creator-pipeline"
  | "builder-output"
  | "curator-signal"
  | "community-comms"
  | "count-liveops";

export interface BetaRouteGroupGuideRoute {
  label: string;
  route: string;
  access: BetaAppCatalogEntry["access"];
  purpose: string;
}

export interface BetaRouteGroupGuide {
  key: BetaRouteGroupGuideKey;
  label: string;
  actor: BetaRelationshipActorKey;
  stage: BetaStage;
  atlasPersona: BetaPersonaKey | "all";
  atlasStage: BetaStage | "all";
  atlasTier: BetaTier | "all";
  atlasQuery: string;
  userQuestion: string;
  confusionResolved: string;
  useFirst: string;
  useNext: string;
  proofToLookFor: string;
  quietRule: string;
  countWatch: string;
  routes: BetaRouteGroupGuideRoute[];
}

const allPersonas: BetaPersonaKey[] = ["new-tezos-user", "collector", "creator", "builder", "curator", "community-member"];

export const BETA_PERSONAS: BetaPersona[] = [
  {
    key: "new-tezos-user",
    label: "New Tezos User",
    firstRoute: "/side-quests",
    nextRoute: "/gallery",
    promise: "Understand WTFOS, complete a safe first quest, and find public discovery before wallet-heavy actions.",
    returnReason: "Daily quests, notifications, live activity, rewards, and digest cards show what changed.",
    confusion: "WTFOS sounds powerful, but the first safe action is not obvious.",
    failure: "Clicks wallet-heavy or market routes before understanding account identity.",
    hesitation: "Pauses when sign-in, wallet, EXP, and role words appear before a small win.",
    abandonment: "Leaves if the first screen feels like a pile of app names.",
    delightedBy: "A guided first quest with clear EXP and no wallet pressure.",
  },
  {
    key: "collector",
    label: "Collector",
    firstRoute: "/gallery",
    nextRoute: "/rat-race",
    promise: "Find the collector path through existing WTFOS apps without guessing the next tool.",
    returnReason: "Fresh art, market motion, rewards, and social signals show what changed.",
    confusion: "Collection, portfolio, gallery, and market signals are split across names.",
    failure: "Finds an object but does not discover Hoard, Rat Race, or creator context.",
    hesitation: "Pauses when deciding whether Gallery, Hoard, or WTFIAM is the right next stop.",
    abandonment: "Leaves after passive browsing if no related action appears.",
    delightedBy: "A trail from Gallery to Hoard to Rat Race to creator signals.",
  },
  {
    key: "creator",
    label: "Creator",
    firstRoute: "/studio",
    nextRoute: "/tools/broot",
    promise: "Find the creator path through existing WTFOS apps without guessing the next tool.",
    returnReason: "Drafts, pinning jobs, domains, publishing states, and promotion prompts show what changed.",
    confusion: "Studio, Broot, Macaroni, pinning, domains, and Skywire do not reveal their order.",
    failure: "Starts in a tool without knowing the required publish or promotion route.",
    hesitation: "Pauses before wallet, IPFS, or domain steps because readiness is unclear.",
    abandonment: "Leaves if a draft or publish job has no recovery prompt.",
    delightedBy: "Studio, Broot, Macaroni, IPFS Pinning, WTF Domains, and Skywire as one pipeline.",
  },
  {
    key: "builder",
    label: "Builder",
    firstRoute: "/game-studio",
    nextRoute: "/map-lab",
    promise: "Find the builder path through existing WTFOS apps without guessing the next tool.",
    returnReason: "Project progress, maps, console tests, and community feedback show what changed.",
    confusion: "Builder tools span game, map, console, and admin-adjacent metaphors.",
    failure: "Finds a prototype surface but misses the map, test, or route context.",
    hesitation: "Pauses when a route looks experimental and the expected output is not stated.",
    abandonment: "Leaves if builder tools feel disconnected from users and rewards.",
    delightedBy: "A route from Game Studio to Map Lab to Console that feels intentional.",
  },
  {
    key: "curator",
    label: "Curator",
    firstRoute: "/gallery",
    nextRoute: "/crp-nominate",
    promise: "Find the curator path through existing WTFOS apps without guessing the next tool.",
    returnReason: "New objects, nominations, leaderboards, and creator activity show what changed.",
    confusion: "Discovery, nomination, broadcast, and social proof are separated.",
    failure: "Discovers good work but does not know how to nominate, share, or follow up.",
    hesitation: "Pauses when curation looks like browsing instead of a contribution loop.",
    abandonment: "Leaves if there is no visible public impact from curating.",
    delightedBy: "A chain from discovery to nomination to broadcast.",
  },
  {
    key: "community-member",
    label: "Community Member",
    firstRoute: "/w",
    nextRoute: "/live",
    promise: "Find the community member path through existing WTFOS apps without guessing the next tool.",
    returnReason: "Replies, rooms, digest, quests, rewards, and visible people show what changed.",
    confusion: "W Feed, WIM, WTF LIVE, Skywire, Mail, and Digest compete as social entrances.",
    failure: "Reads activity but does not join a room, reply, quest, or return loop.",
    hesitation: "Pauses if the page does not prove other people are currently active.",
    abandonment: "Leaves if WTFOS feels empty or only tool-focused.",
    delightedBy: "A social front door that makes current activity obvious.",
  },
];

export const BETA_TIER_LABELS: Record<BetaTier, string> = {
  1: "Core Daily Use",
  2: "Regular Use",
  3: "Occasional Use",
  4: "Experimental",
  5: "Hidden Advanced",
};

export const BETA_STAGE_LABELS: Record<BetaStage, string> = {
  start: "Start",
  identity: "Identity",
  collect: "Collect",
  create: "Create",
  connect: "Connect",
  publish: "Publish",
  play: "Play",
  operate: "Operate",
  recover: "Recover",
};

export const BETA_SECTION_COMPASS: BetaSectionCompassItem[] = [
  {
    key: "now-signals",
    label: "Read-only now signals",
    sectionId: "beta-now",
    stage: "connect",
    audience: "all-users",
    access: "mixed",
    question: "What is happening in WTFOS right now?",
    useWhen: "Use this first when the user needs proof that activity exists before choosing a role path or opening a deeper app.",
    proves: "Existing public and protected sources can show current people, progress, market motion, live rooms, events, creator channels, play, and builder output without beta writing state.",
    nextMove: "Inspect live, quiet, and protected cards, then follow the owning route only when the signal answers the user's immediate curiosity.",
  },
  {
    key: "public-proof",
    label: "Public proof board",
    sectionId: "beta-proof",
    stage: "collect",
    audience: "all-users",
    access: "public",
    question: "What art, creator, project, or tool can I inspect safely?",
    useWhen: "Use this when anonymous or cautious users need a low-risk proof object before signing in, collecting, creating, or joining a social route.",
    proves: "Gallery, TV, Arcade, and Console already expose inspectable public value, and quiet cards explain absence without making the app feel broken.",
    nextMove: "Open the public owner route that matches the proof card, or move to people discovery if the user is asking who made or collected it.",
  },
  {
    key: "people-discovery",
    label: "People discovery",
    sectionId: "beta-people",
    stage: "connect",
    audience: "all-users",
    access: "mixed",
    question: "Who else exists here, and why should I care?",
    useWhen: "Use this when a user understands the product exists but cannot yet see active users, creators, collectors, builders, curators, collaborators, or wallets.",
    proves: "Existing social, marketplace, profile-activity, TV, Console, LIVE, and leaderboard signals can be grouped into human roles without inventing people search.",
    nextMove: "Choose the role card that matches the user's curiosity, then follow the related route or quiet fallback through the current gate.",
  },
  {
    key: "attention-triage",
    label: "Attention triage",
    sectionId: "beta-attention",
    stage: "start",
    audience: "all-users",
    access: "mixed",
    question: "What should I do next from the signals I can see?",
    useWhen: "Use this after proof is visible but the user still needs a route-owned next action instead of another passive feed or app-name scan.",
    proves: "Public, protected, and admin-only signals can become seven manageable next actions while notifications, rewards, roles, and gates stay in existing systems.",
    nextMove: "Pick the cadence that matches the moment: act now, take the next best step, return tomorrow, or send the queue to The Count.",
  },
  {
    key: "daily-return",
    label: "Daily return board",
    sectionId: "beta-return",
    stage: "recover",
    audience: "all-users",
    access: "mixed",
    question: "Why should I come back tomorrow?",
    useWhen: "Use this when the first session succeeded but the user cannot tell which existing surface will have fresh value later.",
    proves: "Changes, quests, people, objects, projects, and admin queues already support return loops through existing routes, EXP, rewards, permissions, and proof signals.",
    nextMove: "Select one today action and one tomorrow reason, then let Notifications, Digest, Mission Control, or Admin own the follow-up.",
  },
  {
    key: "unlock-passports",
    label: "Unlock passports",
    sectionId: "beta-passports",
    stage: "identity",
    audience: "all-users",
    access: "mixed",
    question: "Which progression identity am I working toward?",
    useWhen: "Use this when a user needs a compact role readout before opening the deeper questline, governance, or route relationship boards.",
    proves: "Each puppet has visible-now, next-safe-action, proof-needed, unlocks-next, stays-locked, Count-review, and return-tomorrow context without new progression state.",
    nextMove: "Start with the matching passport, inspect what remains locked, then open the proof or next-unlock route through the existing gate.",
  },
  {
    key: "unlock-questlines",
    label: "Unlock questlines",
    sectionId: "beta-questlines",
    stage: "start",
    audience: "all-users",
    access: "mixed",
    question: "How do side quests, challenges, rewards, and roles fit together?",
    useWhen: "Use this when progression feels like separate systems and the user or Count needs one route-owned arc for the selected role.",
    proves: "Existing side quests, challenges, EXP, rewards, roles, permissions, admin review, and abuse guards can be introduced as stages without changing authority.",
    nextMove: "Follow the five-stage path from notice to return, using stage buttons to open only existing routes with their current access rules.",
  },
  {
    key: "governance-matrix",
    label: "Governance matrix",
    sectionId: "beta-governance",
    stage: "operate",
    audience: "the-count",
    access: "mixed",
    question: "What evidence should The Count review before anything unlocks?",
    useWhen: "Use this when EXP, rewards, market sinks, or role-readiness could be mistaken for automatic authority or operator permission.",
    proves: "Every puppet path can name evidence, EXP interpretation, reward or market impact, role boundary, Count decision, and anti-farm guard.",
    nextMove: "Compare the user route and admin route, then keep the decision in Admin unless the existing proof and permission boundary are clear.",
  },
  {
    key: "relationship-navigator",
    label: "App relationship navigator",
    sectionId: "beta-relationships",
    stage: "connect",
    audience: "all-users",
    access: "mixed",
    question: "What comes before and after this app?",
    useWhen: "Use this when a route is understandable alone but the user cannot see what feeds it, what it feeds, or why it exists in the ecosystem.",
    proves: "Existing apps can be explained as chains with comes-before, consumes, feeds-into, comes-after, Count-watch, and route-step context.",
    nextMove: "Choose the chain that matches the role or object, then open the first or last route only after the relationship makes sense.",
  },
  {
    key: "route-group-guide",
    label: "Route group guide",
    sectionId: "beta-route-groups",
    stage: "start",
    audience: "all-users",
    access: "mixed",
    question: "Which group of similar routes should I use first?",
    useWhen: "Use this when overlapping app names or clusters make users hesitate before browsing the full catalog or asking for an assistant.",
    proves: "First win, collector economy, creator pipeline, builder output, curator signal, community comms, and Count liveops can be explained before hiding apps.",
    nextMove: "Read use-first and use-next copy, apply the matching atlas filter, then open the route that owns the current proof.",
  },
  {
    key: "discovery-trails",
    label: "Discovery trails",
    sectionId: "beta-trails",
    stage: "collect",
    audience: "all-users",
    access: "mixed",
    question: "Can I follow a guided trail without needing external help?",
    useWhen: "Use this when the user has chosen a role and needs a deeper, state-aware trail that explains quiet, protected, unavailable, and admin-only steps.",
    proves: "Collector, Creator, Builder, Community, and Count trails can embed relevant proof snippets and locked-step explanations without replacing navigation.",
    nextMove: "Follow the trail step by step, using protected-step notes to understand when sign-in, role, or admin authority is required.",
  },
  {
    key: "puppet-paths",
    label: "Puppet paths",
    sectionId: "beta-paths",
    stage: "start",
    audience: "all-users",
    access: "mixed",
    question: "Which persona path should I follow right now?",
    useWhen: "Use this when the user can answer what WTFOS is but still needs a first action, proof step, return route, and Count boundary.",
    proves: "Each requested puppet can move through orient, act, prove, return, and Count review steps using existing route ownership and gates.",
    nextMove: "Select the puppet tab, inspect the Journey Command Center, and open the first useful route when the action is clear.",
  },
  {
    key: "count-runbook",
    label: "Count runbook",
    sectionId: "beta-count",
    stage: "operate",
    audience: "the-count",
    access: "admin",
    question: "Which admin job should The Count handle before scaling a loop?",
    useWhen: "Use this when a side quest, challenge, reward, role, market item, notification, or automation decision needs admin manageability before rollout.",
    proves: "Strict-admin summaries, workbench jobs, liveops recipes, stories, and command cards can guide operators without beta writing admin state.",
    nextMove: "Start from the admin summary, choose one workbench or recipe card, and open the existing owner surface only with explicit admin authority.",
  },
  {
    key: "app-atlas",
    label: "App visibility atlas",
    sectionId: "beta-atlas",
    stage: "recover",
    audience: "all-users",
    access: "mixed",
    question: "Which existing app fits this job?",
    useWhen: "Use this after grouping and explanation attempts, or whenever a reviewer needs to inspect every desktop app and creation tool before changing visibility.",
    proves: "Every known beta route can stay searchable by tier, stage, persona, and purpose before any app is hidden, relabeled, or recommended for migration.",
    nextMove: "Filter the atlas, inspect route purpose and related apps, then open the existing route through its current gate if it matches the job.",
  },
];

export const BETA_CREATOR_PROJECT_PROOF_LADDER: BetaCreatorProjectProofStep[] = [
  {
    key: "workspace-draft",
    label: "Workspace draft",
    status: "inspect",
    route: "/studio",
    access: "session",
    ownerSurface: "Studio",
    userQuestion: "Is there a creator project or draft to recover first?",
    visibleProof: "Beta can show surrounding profile, channel, and output signals, but private draft proof belongs inside the signed-in Studio workspace.",
    currentLimit: "Anonymous beta must not read private draft state, project files, or recovery metadata from Studio.",
    nextDependency: "Open Studio first; only then should beta recommend Broot, Macaroni, IPFS Pinning, TV, or Skywire as the next dependency.",
    gateBoundary: "Sign-in step: Studio keeps private creator work behind the existing session gate.",
    noWriteRule: "No beta write: beta never creates, edits, recovers, imports, or saves Studio projects.",
    signalKeys: ["profile-activity", "tv-channels", "console-discovery"],
  },
  {
    key: "asset-prep",
    label: "Asset prep",
    status: "inspect",
    route: "/tools/broot",
    access: "session",
    ownerSurface: "Broot",
    userQuestion: "Does the creator need to turn intent into a concrete asset?",
    visibleProof: "Public creator and builder signals can suggest work is moving, but Broot owns the actual asset-prep evidence.",
    currentLimit: "Beta cannot inspect local canvases, media edits, exports, or undo history from the asset tool.",
    nextDependency: "Use Broot after Studio names the asset need, then decide whether the output should be packaged, pinned, aired, or promoted.",
    gateBoundary: "Sign-in step: Broot opens through the existing creation-tool session gate.",
    noWriteRule: "No beta write: beta never opens files, edits media, exports assets, or submits mint/publish work.",
    signalKeys: ["profile-activity", "console-discovery", "tv-channels"],
  },
  {
    key: "package-drop",
    label: "Package drop",
    status: "gated",
    route: "/tools/macaroni",
    access: "role",
    ownerSurface: "Macaroni",
    userQuestion: "Is the creator ready for a role-gated packaging or drop step?",
    visibleProof: "Marketplace and trade-board proof can show objects and collector motion, but package readiness must be reviewed in Macaroni.",
    currentLimit: "Beta must not treat public market motion as proof that a user has trusted-creator access or a publish-ready drop.",
    nextDependency: "Open Macaroni only after Studio/Broot proof exists and The Count or existing role gates say the package path is appropriate.",
    gateBoundary: "Role gated: EXP and levels are evidence for review, never automatic Macaroni authority.",
    noWriteRule: "No beta write: beta never creates drops, deploys contracts, stages sale windows, grants roles, or signs wallet actions.",
    signalKeys: ["market-listings", "market-trade-board", "notifications"],
  },
  {
    key: "durable-pin",
    label: "Durable media",
    status: "inspect",
    route: "/ipfs-pinning",
    access: "session",
    ownerSurface: "IPFS Pinning",
    userQuestion: "Does the project need durable media proof before public discovery?",
    visibleProof: "Beta can explain that durable media comes before public promotion, but pin state and hosted-publish details belong to IPFS Pinning.",
    currentLimit: "Beta does not read or mutate pin jobs, hosted publishing state, domain setup, or storage decisions from this shell.",
    nextDependency: "Use IPFS Pinning when the asset or package needs durability before Skywire, TV, Domains, or market discovery can depend on it.",
    gateBoundary: "Sign-in step: pinning and hosted-publish context stay behind the existing session and app gates.",
    noWriteRule: "No beta write: beta never pins files, changes gateways, publishes user sites, or updates domain configuration.",
    signalKeys: ["profile-activity", "tv-channels", "notifications"],
  },
  {
    key: "media-channel",
    label: "Media channel",
    status: "visible",
    route: "/tv",
    access: "session",
    ownerSurface: "WTF TV",
    userQuestion: "Is there public creator/media proof to watch before deeper tooling?",
    visibleProof: "Public WTF TV channel reads can show creator/media presence before the session-gated TV app opens.",
    currentLimit: "A public channel signal does not prove the current user owns the channel, can queue media, or has publish authority.",
    nextDependency: "Use TV as creator proof, then route back to Studio, Broot, IPFS Pinning, or Skywire when a missing dependency appears.",
    gateBoundary: "Sign-in step: public channel proof can be read, but the TV owner surface keeps its existing session gate.",
    noWriteRule: "No beta write: beta never creates channels, queues videos, changes playlists, or alters TV ownership.",
    signalKeys: ["tv-channels", "profile-activity", "notifications"],
  },
  {
    key: "project-output",
    label: "Project output",
    status: "visible",
    route: "/console",
    access: "session",
    ownerSurface: "WTF Console",
    userQuestion: "Is there builder or project output that can be inspected?",
    visibleProof: "Console discovery, Arcade discovery, and recent play can show output proof before the session-gated Console opens.",
    currentLimit: "Public output proof does not create a build, grant deploy access, or prove the user owns the project.",
    nextDependency: "Use Console when output needs inspection, then route to Arcade, Game Studio, W, or Skywire for play and feedback.",
    gateBoundary: "Sign-in step: Console keeps inspection and project context behind its existing session gate.",
    noWriteRule: "No beta write: beta never runs builds, changes project output, deploys code, or writes feedback posts.",
    signalKeys: ["console-discovery", "arcade-discovery", "arcade-recent"],
  },
  {
    key: "broadcast-signal",
    label: "Broadcast signal",
    status: "visible",
    route: "/skywire",
    access: "public",
    ownerSurface: "Skywire",
    userQuestion: "Is the creator ready to make progress visible outside the tool chain?",
    visibleProof: "Creator channels, profile activity, and market context can become shareable public proof through Skywire.",
    currentLimit: "Beta can explain the broadcast moment, but it cannot decide that a draft, pin, package, or wallet action is ready.",
    nextDependency: "Use Skywire only after the owning creator surface has proof worth broadcasting, then return to W, TV, Gallery, or Notifications.",
    gateBoundary: "Public route: Skywire remains optional guidance and never replaces the creator pipeline.",
    noWriteRule: "No beta write: beta never posts, broadcasts, follows, links AT accounts, or changes external social state.",
    signalKeys: ["tv-channels", "profile-activity", "market-listings"],
  },
];

export const BETA_FRICTION_QUEUE: BetaFrictionQueueItem[] = [
  {
    key: "people-proof-gap",
    label: "People proof gap",
    priority: "P1",
    status: "watch",
    audience: "community-member",
    sectionId: "beta-people",
    route: "/w",
    access: "session",
    evidence: "People Discovery, the People Proof Gap Matrix, Visibility Radar, and puppet memory agree that seeing active users, creators, collectors, builders, curators, and collaborators is the fastest path from app-name browsing to caring.",
    friction: "A new user can now see human-role proof, but the beta loop should keep watching whether active, curator, collaborator, and wallet signals still feel abstract when public data is quiet.",
    nextUiMove: "Keep the People Discovery Board and People Proof Gap Matrix beside route-owned next actions, then strengthen only the weak or quiet roles that puppets still hesitate on.",
    successMeasure: "New user and community puppets can discover active people, a useful social route, and one return-worthy signal in under sixty seconds without external explanation.",
    noWriteRule: "No beta write: beta may group and explain existing people/activity signals, but it must not send messages, change follows, create rooms, or modify notification preferences.",
    relatedRoutes: ["/live", "/digest", "/notifications", "/gallery"],
  },
  {
    key: "creator-project-proof",
    label: "Creator project proof",
    priority: "P1",
    status: "watch",
    audience: "creator",
    sectionId: "beta-proof",
    route: "/studio",
    access: "session",
    evidence: "Creator puppets improved when Studio, Broot, Macaroni, IPFS Pinning, TV, Console, and Skywire were treated as one runway, and the Creator Project Proof Ladder now names the proof and gate for each step.",
    friction: "The creator path now explains draft, asset, package, pin, channel, output, and broadcast states, but beta should keep watching whether private or role-gated proof is mistaken for public authority.",
    nextUiMove: "Keep the Creator Project Proof Ladder beside Public Proof and Discovery Trails, then add only safe owner-read snippets when an existing route can prove a state without writes.",
    successMeasure: "Creator puppets can identify the current project state, choose the next creator tool, and understand what remains role-gated without asking The Count for authority.",
    noWriteRule: "No beta write: beta can route to creator surfaces and explain dependencies, but it must not create projects, pin media, publish drops, grant creator roles, or change wallet/contract behavior.",
    relatedRoutes: ["/tools/macaroni", "/ipfs-pinning", "/tv", "/console"],
  },
  {
    key: "count-authority-boundary",
    label: "Count authority boundary",
    priority: "P1",
    status: "watch",
    audience: "the-count",
    sectionId: "beta-count",
    route: "/admin",
    access: "admin",
    evidence: "Count workbench, governance matrix, recipes, and stories now name users, side quests, challenges, rewards, market operations, roles, permissions, and automation as admin-managed surfaces.",
    friction: "EXP, levels, and role-readiness can still be misread as automatic authority unless every Count route keeps explicit admin role, audit proof, and no-write copy visible.",
    nextUiMove: "Keep Count recipe and governance rows beside the user-facing path so each challenge, side quest, reward, role, market, or automation suggestion names its admin owner.",
    successMeasure: "The Count puppet can create or review a loop plan while normal puppets understand that EXP is evidence only and never grants admin or contract authority.",
    noWriteRule: "No beta write: beta may describe admin runbooks and open Admin for explicit admins, but it must not create challenges, rewards, roles, market items, automation, or permission changes.",
    relatedRoutes: ["/side-quests", "/challenges", "/wtfiam", "/marketplace"],
  },
  {
    key: "route-name-cluster",
    label: "Route-name cluster",
    priority: "P2",
    status: "strengthen",
    audience: "all-users",
    sectionId: "beta-route-groups",
    route: "/mission-control",
    access: "session",
    evidence: "Route Group Guide and App Visibility Atlas reduce hesitation by grouping first win, collector economy, creator pipeline, builder output, curator signal, community comms, and Count liveops routes.",
    friction: "Similar names such as quests, challenges, gallery, hoard, marketplace, studio, tools, W, WIM, Digest, and Notifications can still make users pause before choosing the correct owner.",
    nextUiMove: "Use route-group explanation, atlas filters, and relationship chains before hiding, relabeling, or assistant-routing any existing app that appears confusing.",
    successMeasure: "Collector, creator, builder, curator, and community puppets can choose the correct route group and first owner route without scanning the full app list.",
    noWriteRule: "No beta write: beta may group, filter, and relabel navigation copy, but it must not alter route contracts, app purpose, access gates, or existing app functionality.",
    relatedRoutes: ["/side-quests", "/challenges", "/notifications", "/gallery"],
  },
  {
    key: "return-loop-clarity",
    label: "Return-loop clarity",
    priority: "P2",
    status: "strengthen",
    audience: "all-users",
    sectionId: "beta-return",
    route: "/notifications",
    access: "session",
    evidence: "Daily Return Board, Notification Review, Attention Triage, and puppet retests show that returning tomorrow becomes believable when progress, people, objects, rooms, and admin queues are visible.",
    friction: "Users can still finish a first action and miss whether Notifications, Digest, Mission Control, Calendar, or Side Quests owns the follow-up reason.",
    nextUiMove: "Tie each successful first action to one visible return surface and one quiet fallback before introducing more notification events or assistant prompts.",
    successMeasure: "New user, collector, creator, and community puppets can name one reason to return tomorrow plus the exact existing route that will show what changed.",
    noWriteRule: "No beta write: beta may explain return surfaces and open existing routes, but it must not create notifications, subscribe users, change delivery preferences, or alter SystemEvent triggers.",
    relatedRoutes: ["/digest", "/mission-control", "/calendar", "/side-quests"],
  },
  {
    key: "advanced-app-value",
    label: "Advanced app value",
    priority: "P2",
    status: "watch",
    audience: "builder",
    sectionId: "beta-atlas",
    route: "/game-studio",
    access: "session",
    evidence: "The App Visibility Atlas keeps experimental and advanced routes searchable by tier, stage, persona, purpose, and related apps before beta hides or demotes them.",
    friction: "Experimental tools can look like noise to new users and like hidden power to builders unless the beta shell explains when to use them and what proof should come first.",
    nextUiMove: "Keep advanced routes behind atlas filters, relationship chains, and builder trails until puppet tests prove which tools should be surfaced, softened, or hidden.",
    successMeasure: "Builder puppets can discover a testable project route, understand which advanced apps are optional, and reach community feedback without needing admin authority.",
    noWriteRule: "No beta write: beta may hide, group, or explain advanced navigation, but it must not change app gates, production operations, database behavior, contract behavior, or admin power.",
    relatedRoutes: ["/map-lab", "/console", "/arcade", "/w"],
  },
  {
    key: "assistant-threshold",
    label: "Assistant threshold",
    priority: "P3",
    status: "keep",
    audience: "all-users",
    sectionId: "beta-attention",
    route: "/mission-control",
    access: "session",
    evidence: "First-Minute Wayfinder, Section Compass, Attention Triage, Route Group Guide, and Puppet Memory Ledger now give route-owned guidance before a conversational assistant is required.",
    friction: "An assistant could hide navigation problems if it arrives before the beta shell proves better grouping, recommendations, feeds, route relationships, and return loops.",
    nextUiMove: "Keep improving visible navigation and recommendations first; design an assistant only if the same puppet confusion remains after these boards are strengthened and retested.",
    successMeasure: "Puppet users can answer what WTFOS is, what to do first, what to do next, why people matter, and why to return without relying on assistant chat.",
    noWriteRule: "No beta write: beta may recommend, explain, guide, teach, discover, and connect, but any assistant design must remain optional and must never replace navigation.",
    relatedRoutes: ["/side-quests", "/notifications", "/w", "/admin"],
  },
];

const desktopRoutes: Record<DesktopAppKey, string> = {
  wtfiam: "/wtfiam",
  hoard: "/hoard",
  wim: "/wim",
  w: "/w",
  tv: "/tv",
  dicksword: "/dicksword",
  "i-hate-telegram": "/i-hate-telegram",
  "dear-diary": "/dear-diary",
  arcade: "/arcade",
  casino: "/casino",
  "dues-manager": "/dues",
  console: "/console",
  "game-studio": "/game-studio",
  dedrooms: "/dedrooms",
  studio: "/studio",
  "ch-ease": "/tools/ch-ease",
  "pasta-protocol": "/tools/colander",
  gallery: "/gallery",
  "ipfs-pinning": "/ipfs-pinning",
  skywire: "/skywire",
  "wtf-live": "/live",
  tz2at: "/tz2at",
  "crp-nominations": "/crp-nominate",
  "wtf-subdomains": "/wtf-subdomains",
  "rat-race": "/rat-race",
  "map-lab": "/map-lab",
  mail: "/mail",
};

function entry(
  id: string,
  title: string,
  route: string,
  access: BetaAppCatalogEntry["access"],
  tier: BetaTier,
  stage: BetaStage,
  personas: BetaPersonaKey[],
  purpose: string,
  related: string[],
): BetaAppCatalogEntry {
  return {
    id,
    title,
    route,
    access,
    tier,
    stage,
    personas,
    purpose,
    whenToUse: `Use ${title} when the user's path reaches ${BETA_STAGE_LABELS[stage].toLowerCase()} work.`,
    userBenefit: `${title} gives this part of WTFOS a clear next step.`,
    before: ["Beta hub", "Mission Control"],
    after: ["Related route", "Notification Center"],
    feedsInto: ["Daily loop", "EXP and rewards", "App relationships"],
    consumes: ["Existing WTFOS data", "Auth state", "Role gates"],
    related,
    betaAction: `Open ${title}`,
    visibilityNote: `${BETA_TIER_LABELS[tier]} in beta because it maps to a clear user need.`,
  };
}

const manualApps: BetaAppCatalogEntry[] = [
  entry("mission-control", "Mission Control", "/mission-control", "session", 1, "start", allPersonas, "Personal cockpit for status, rewards, challenges, notifications, and next actions.", ["/side-quests", "/profile", "/notifications", "/challenges"]),
  entry("side-quests", "Side Quests", "/side-quests", "session", 1, "start", allPersonas, "Daily and persistent tasks that teach WTFOS through action instead of static help text.", ["/challenges", "/leaderboard", "/wtfiam", "/admin"]),
  entry("challenges", "Challenges", "/challenges", "session", 1, "start", allPersonas, "Bigger missions that combine side quests, submissions, show events, and reward review.", ["/side-quests", "/leaderboard", "/admin", "/mission-control"]),
  entry("leaderboard", "Leaderboards", "/leaderboard", "public", 1, "start", allPersonas, "Public proof of EXP, rewards, holders, and visible community progress.", ["/side-quests", "/challenges", "/profile", "/w"]),
  entry("calendar-events", "Calendar", "/calendar", "public", 2, "connect", allPersonas, "Public schedule surface for events, live moments, deadlines, and return-tomorrow prompts.", ["/notifications", "/live", "/side-quests", "/w"]),
  entry("profile", "Profile", "/profile", "session", 1, "identity", allPersonas, "Account identity, public profile, wallet linking, and social proof.", ["/user/wtf-admin", "/skywire", "/hoard", "/wtf-subdomains"]),
  entry("notifications", "Notification Center", "/notifications", "session", 1, "start", allPersonas, "High-signal inbox for replies, room activity, publish states, rewards, and system work.", ["/mission-control", "/digest", "/settings", "/messages"]),
  entry("digest", "Digest", "/digest", "session", 2, "connect", ["community-member", "creator", "collector"], "Recap surface for missed replies, room activity, rewards, publish states, and system work.", ["/notifications", "/w", "/mail", "/mission-control"]),
  entry("system-settings", "System Settings", "/settings", "session", 3, "recover", allPersonas, "Central OS settings hub for notification preferences, account, wallet, files, appearance, W, domains, and recovery routes.", ["/notifications", "/notification-center", "/digest", "/wtf-subdomains", "/profile"]),
  entry("on-chain-market", "On Chain Market", "/marketplace", "session", 2, "collect", ["collector", "curator", "creator"], "Authenticated market surface for listings, auctions, trade boards, and collector activity that beta can preview through read-only public signals.", ["/gallery", "/hoard", "/rat-race", "/wtfiam"]),
  entry("trade-boards", "Trade Boards", "/trade-boards", "session", 2, "collect", ["collector", "curator", "community-member"], "Collector coordination surface for trade intent and market conversation around existing WTFOS objects.", ["/marketplace", "/rat-race", "/w", "/profile"]),
  entry("admin-control-suite", "Admin Control Suite", "/admin", "admin", 5, "operate", ["builder"], "The Count's management surface for users, roles, app gates, challenges, quests, automation, rewards, and market operations.", ["/admin", "/challenges", "/side-quests", "/wtfiam"]),
];

const experimentalSet = new Set<DesktopAppKey>(EXPERIMENTAL_DESKTOP_APPS);
function tierFor(appKey: DesktopAppKey): BetaTier {
  if (experimentalSet.has(appKey)) return 4;
  if (["wtfiam", "tv", "console", "game-studio", "pasta-protocol", "tz2at", "crp-nominations"].includes(appKey)) return 2;
  if (["map-lab", "casino", "ch-ease"].includes(appKey)) return 4;
  return 3;
}
function stageFor(appKey: DesktopAppKey): BetaStage {
  if (["wtfiam", "hoard", "gallery", "rat-race"].includes(appKey)) return "collect";
  if (["studio", "game-studio", "pasta-protocol", "ch-ease"].includes(appKey)) return "create";
  if (["wim", "w", "tv", "dicksword", "i-hate-telegram", "skywire", "wtf-live", "mail"].includes(appKey)) return "connect";
  if (["arcade", "casino", "console", "dedrooms"].includes(appKey)) return "play";
  if (["ipfs-pinning", "wtf-subdomains"].includes(appKey)) return "publish";
  return "operate";
}
function personasFor(appKey: DesktopAppKey): BetaPersonaKey[] {
  if (["studio", "game-studio", "pasta-protocol", "ch-ease", "ipfs-pinning"].includes(appKey)) return ["creator", "builder", "curator"];
  if (["hoard", "gallery", "wtfiam", "rat-race"].includes(appKey)) return ["collector", "creator", "curator"];
  if (["w", "wim", "tv", "skywire", "wtf-live", "mail"].includes(appKey)) return ["community-member", "creator", "collector"];
  return allPersonas;
}

const desktopApps = DESKTOP_APPS.map((appKey) => {
  const route = desktopRoutes[appKey];
  const tier = tierFor(appKey);
  const stage = stageFor(appKey);
  const item = entry(appKey, DESKTOP_APP_LABELS[appKey], route, route === "/arcade" || route === "/dues" || route === "/gallery" || route === "/skywire" ? "public" : "session", tier, stage, personasFor(appKey), `${DESKTOP_APP_LABELS[appKey]} is the canonical WTFOS ${BETA_STAGE_LABELS[stage].toLowerCase()} surface for its domain.`, ["/mission-control", "/notifications", "/profile", route]);
  item.appKey = appKey;
  return item;
});

const creationToolApps = CREATION_TOOLS.map((tool) =>
  entry(`tool-${tool.id}`, tool.title, tool.routePath, "roles" in tool && tool.roles ? "role" : "session", 2, tool.domain === "drop-studio" || tool.domain === "pasta-protocol" ? "publish" : "create", ["creator", "builder", "curator"], tool.subtitle, ["/studio", "/ipfs-pinning", "/wtf-subdomains", "/skywire"]),
);

export const BETA_APP_CATALOG: BetaAppCatalogEntry[] = [...manualApps, ...desktopApps, ...creationToolApps];

export const BETA_XP_LEVELS = [0, 50, 200, 500, 1500, 5000].map((xp) => {
  const tier = getXpTierForTotal(xp);
  return { key: tier.key, label: tier.label, minXp: tier.minXp, nextTierMinXp: tier.nextTierMinXp };
});

export const BETA_UNLOCK_LADDER = [
  { label: "Visitor", gate: "Public routes", route: "/gallery", playerAction: "Browse Gallery, Leaderboard, Arcade, Links, FAQ, and beta before signing in.", systemBackbone: "No account write, no wallet requirement, no role unlock.", adminControl: "The Count keeps public discovery safe through Content, App Gates, and route inventory checks." },
  { label: "Witness", gate: "Signed-in session and profile setup", route: "/side-quests", playerAction: "Complete profile, social, wallet, or message-board side quests for EXP and first rewards.", systemBackbone: "Side quest definitions, auto-verify handles, EXP log, reward ledger, and profile routes.", adminControl: "The Count tunes quest criteria, max completions, EXP, WTF rewards, and manual review." },
  { label: "Regular", gate: "EXP level and community proof", route: "/challenges", playerAction: "Take on challenges that combine social participation, collecting, creation, or live attendance.", systemBackbone: "Challenge submissions, grading, reward flags, automation, and leaderboard feedback.", adminControl: "The Count creates challenge arcs, grades submissions, inspects automation, and checks abuse signals." },
  { label: "Creator Ready", gate: "Role and surface access", route: "/studio", playerAction: "Unlock creator paths through Studio, Broot, IPFS Pinning, WTF Domains, and publishing tools.", systemBackbone: "Roles, permissions, desktop app gates, trusted creator roles, and creation tool route gates.", adminControl: "The Count grants roles or surface access only after proof, then audits visibility and docs." },
  { label: "Economy Participant", gate: "Rewards, inventory, and market readiness", route: "/wtfiam", playerAction: "Spend earned rewards, inspect inventory, use in-app market items, and discover trade or collector loops.", systemBackbone: "Reward ledger, in-app market catalog, EXP/reward payment intents, inventory and purchase history.", adminControl: "The Count manages market items, pricing locks, sale windows, reward payouts, and operator ledger state." },
  { label: "Advanced Operator", gate: "Explicit admin role only", route: "/admin", playerAction: "No player should drift here through EXP alone; this is permissioned management.", systemBackbone: "Strict admin role, role permissions, admin tabs, audit logs, app gates, and contract ledger.", adminControl: "The Count reviews users, roles, challenges, side quests, automation, rewards, and market operations." },
];

export const BETA_UNLOCK_QUESTLINES: BetaUnlockQuestline[] = [
  {
    key: "new-tezos-user",
    label: "First safe win",
    promise: "Turn a confused visitor into a signed-in witness with one visible EXP step and no wallet pressure.",
    sideQuest: "Profile, social, or message-board setup side quest with a low EXP award and clear completion cap.",
    challenge: "First community proof challenge that asks the user to find a person, object, or room before deeper tools.",
    reward: "Small EXP plus optional WTF reward row that teaches the reward ledger without making earning feel farmable.",
    roleOrPermission: "Witness-level readiness only; no role or admin permission changes are implied by the first win.",
    adminSurface: "Users, Side Quests, XP Log, Rewards",
    adminReview: "The Count checks the user row, recent quest state, and reward row before nudging the next task.",
    abuseGuard: "Completion caps, auto-verify handles, and reward idempotency keep starter quests from becoming a faucet.",
    stages: [
      { key: "notice", label: "Notice", route: "/leaderboard", access: "public", action: "See public EXP and holder proof before signing in.", proof: "Leaderboards prove other users progress through WTFOS." },
      { key: "act", label: "Act", route: "/side-quests", access: "session", action: "Complete one setup side quest and watch the first EXP progress appear.", proof: "Side quest completion should create visible EXP progress." },
      { key: "prove", label: "Prove", route: "/profile", access: "session", action: "Confirm profile, social, or wallet-adjacent readiness.", proof: "Profile state explains identity without forcing a wallet-heavy first step." },
      { key: "unlock", label: "Unlock", route: "/challenges", access: "session", action: "Receive the next small challenge once the first side quest lands.", proof: "Challenge state gives the user a second concrete step." },
      { key: "return", label: "Return", route: "/notifications", access: "session", action: "Check what changed after the first completion.", proof: "Notifications and Digest explain why returning tomorrow matters." },
    ],
  },
  {
    key: "collector",
    label: "Collector path",
    promise: "Turn browsing into collection context, inventory, market motion, and reward spending without rushing wallet action.",
    sideQuest: "Find and save one object or creator signal from Gallery, trade-board proof, or public marketplace context.",
    challenge: "Collector loop challenge linking Gallery, Hoard, Rat Race, and WTFIAM into one related path.",
    reward: "EXP, optional WTF reward, and a later inventory or market-sink prompt when the user is ready.",
    roleOrPermission: "Collector readiness can inform recommendations, but market and wallet surfaces keep their existing gates.",
    adminSurface: "Rewards, In-App Market, Trade Boards, App Gates",
    adminReview: "The Count checks reward rows, market item availability, pricing locks, and unusual repeated completion patterns.",
    abuseGuard: "Market and reward loops need caps, pricing locks, and audit notes before being promoted as daily earn/spend paths.",
    stages: [
      { key: "notice", label: "Notice", route: "/gallery", access: "public", action: "Inspect one public object or creator signal.", proof: "Gallery gives collector curiosity a low-risk entry point." },
      { key: "act", label: "Act", route: "/side-quests", access: "session", action: "Complete an object-discovery side quest.", proof: "The side quest turns passive browsing into EXP progress." },
      { key: "prove", label: "Prove", route: "/hoard", access: "session", action: "Inspect personal holdings or wallet context after sign-in.", proof: "Hoard explains why collection state matters." },
      { key: "unlock", label: "Unlock", route: "/rat-race", access: "session", action: "Move from object proof to market motion.", proof: "Rat Race shows urgency and sales context without being the whole product." },
      { key: "return", label: "Return", route: "/wtfiam", access: "session", action: "Spend or inspect earned inventory when rewards arrive.", proof: "WTFIAM connects earned progress to useful in-app economy sinks." },
    ],
  },
  {
    key: "creator",
    label: "Creator runway",
    promise: "Make Studio, Broot, publishing, domains, and promotion feel like one challenge arc.",
    sideQuest: "Start or recover one Studio project and identify the next publishing dependency.",
    challenge: "Creator unlock challenge linking Studio, Broot, Macaroni, IPFS Pinning, WTF Domains, and Skywire.",
    reward: "EXP, optional WTF reward, and role-readiness evidence for creator or publishing surface access.",
    roleOrPermission: "Creator roles and tool gates remain explicit; EXP only signals readiness for review.",
    adminSurface: "Challenges, Roles, Desktop Apps, Start Menu Gates",
    adminReview: "The Count reviews project proof, challenge submission, role request, and affected app gate together.",
    abuseGuard: "Role grants require proof, audit notes, and reversible app-gate changes instead of automatic EXP unlocks.",
    stages: [
      { key: "notice", label: "Notice", route: "/studio", access: "session", action: "Open or recover the creator workspace.", proof: "Studio is the home base before specialized tools." },
      { key: "act", label: "Act", route: "/tools/broot", access: "session", action: "Prepare one asset or draft artifact.", proof: "Broot gives the creator a concrete work step." },
      { key: "prove", label: "Prove", route: "/tools/macaroni", access: "session", action: "Package or stage the work for publishing.", proof: "Macaroni shows whether the project is publish-ready." },
      { key: "unlock", label: "Unlock", route: "/ipfs-pinning", access: "session", action: "Pin or verify durable media readiness.", proof: "IPFS Pinning proves the artifact can survive beyond the editor." },
      { key: "return", label: "Return", route: "/skywire", access: "public", action: "Promote or follow up when publishing changes.", proof: "Skywire makes creator progress externally visible." },
    ],
  },
  {
    key: "builder",
    label: "Builder proving ground",
    promise: "Connect experiments to maps, console tests, playable output, and community feedback.",
    sideQuest: "Run one builder discovery task that identifies a project route and its expected user outcome.",
    challenge: "Builder challenge linking Game Studio, Map Lab, Console, Arcade, and W feedback.",
    reward: "EXP and role-readiness notes that help The Count decide which builder surfaces are appropriate.",
    roleOrPermission: "Builder tool access stays behind existing role/app gates; admin authority is never implied.",
    adminSurface: "Roles, App Gates, UX Lab, System Logs",
    adminReview: "The Count compares builder proof, abuse signals, and app-gate state before granting narrow access.",
    abuseGuard: "Experimental routes stay grouped and explained so users do not confuse prototypes with production operations.",
    stages: [
      { key: "notice", label: "Notice", route: "/game-studio", access: "session", action: "Choose a project or template to inspect.", proof: "Game Studio gives the builder path a home base." },
      { key: "act", label: "Act", route: "/map-lab", access: "session", action: "Map the project route or relationship.", proof: "Map Lab turns an idea into navigable structure." },
      { key: "prove", label: "Prove", route: "/console", access: "session", action: "Run or inspect the output path.", proof: "Console proves the build has a testable destination." },
      { key: "unlock", label: "Unlock", route: "/arcade", access: "public", action: "Surface playable output when it is ready.", proof: "Arcade makes builder work discoverable by normal users." },
      { key: "return", label: "Return", route: "/w", access: "session", action: "Bring feedback back into the community loop.", proof: "W closes the loop from build output to people." },
    ],
  },
  {
    key: "curator",
    label: "Curator signal chain",
    promise: "Turn discovery into nomination, share, and public proof instead of passive browsing.",
    sideQuest: "Find one noteworthy object, creator, or collection and record why it matters.",
    challenge: "Curation challenge linking Gallery, CRP nomination, Skywire, W, and TV proof.",
    reward: "EXP, optional WTF reward, and curator-readiness evidence when nominations need review.",
    roleOrPermission: "Curator readiness can request access, but nomination and role gates keep their existing checks.",
    adminSurface: "Challenges, Content Review, Roles, Social Signals",
    adminReview: "The Count reviews nomination proof, repeated submissions, and role need before surfacing curator tools.",
    abuseGuard: "Nomination caps, proof requirements, and review notes prevent low-effort spam from becoming rewarded curation.",
    stages: [
      { key: "notice", label: "Notice", route: "/gallery", access: "public", action: "Find one object or creator worth surfacing.", proof: "Gallery provides visible public discovery." },
      { key: "act", label: "Act", route: "/side-quests", access: "session", action: "Complete a curation side quest with the reason attached.", proof: "The quest turns taste into reviewable evidence." },
      { key: "prove", label: "Prove", route: "/crp-nominate", access: "session", action: "Nominate or prepare a nomination when the surface is available.", proof: "CRP nomination shows public curation intent." },
      { key: "unlock", label: "Unlock", route: "/skywire", access: "public", action: "Broadcast the signal or follow creator proof.", proof: "Skywire connects curation to broader discovery." },
      { key: "return", label: "Return", route: "/w", access: "session", action: "Discuss the find and gather community context.", proof: "W turns curation into shared social proof." },
    ],
  },
  {
    key: "community-member",
    label: "Community pulse",
    promise: "Make people, rooms, replies, and events feel like a loop a normal user can join.",
    sideQuest: "Find one active person, event, room, or digest item and take one low-risk social action.",
    challenge: "Community challenge linking W, WIM, WTF LIVE, Calendar, Notifications, and Digest.",
    reward: "EXP and return-loop notifications that prove participation matters without spamming the user.",
    roleOrPermission: "Community activity can unlock recommendations, not privileged tools or admin surfaces.",
    adminSurface: "Notifications, Digest, W, WTF LIVE, Abuse Review",
    adminReview: "The Count watches abuse signals and farmable participation loops without touching normal social discovery.",
    abuseGuard: "Rate limits, moderation review, and social proof requirements keep low-effort engagement from farming rewards.",
    stages: [
      { key: "notice", label: "Notice", route: "/w", access: "session", action: "See public/community motion and choose one person or post.", proof: "W proves the platform is inhabited." },
      { key: "act", label: "Act", route: "/live", access: "session", action: "Join or inspect a live room when something is active.", proof: "WTF LIVE gives community motion a time-bound place." },
      { key: "prove", label: "Prove", route: "/wim", access: "session", action: "Follow up directly when the signal becomes personal.", proof: "WIM turns ambient social proof into a relationship." },
      { key: "unlock", label: "Unlock", route: "/calendar", access: "public", action: "Find the next scheduled event or return moment.", proof: "Calendar explains when to come back." },
      { key: "return", label: "Return", route: "/digest", access: "session", action: "Catch up on missed replies, rooms, rewards, and system work.", proof: "Digest keeps quiet periods from feeling empty." },
    ],
  },
  {
    key: "the-count",
    label: "Count liveops review",
    promise: "Give admins a manageable unlock-control loop without letting EXP become authority.",
    sideQuest: "Review side quest criteria, completion caps, verifier type, EXP value, and reward policy.",
    challenge: "Review challenge arcs, automation definitions, submissions, grading, and downstream role or reward changes.",
    reward: "Settle rewards only from auditable rows and keep in-app market sinks visible before increasing payouts.",
    roleOrPermission: "Explicit admin role is required; EXP, levels, and role-readiness are evidence, never operator authority.",
    adminSurface: "Users, Roles, Side Quests, Challenges, Rewards, Market, Automation",
    adminReview: "The Count compares trigger, actor, proof, reward delta, role change, and SystemEvent handle before scaling.",
    abuseGuard: "Manual review, caps, idempotent reward rows, reversible roles, and audit notes protect the unlock economy.",
    stages: [
      { key: "notice", label: "Notice", route: "/admin", access: "admin", action: "Open the strict-admin summary and find the hottest queue.", proof: "Admin APIs gate live counts before any operator action." },
      { key: "act", label: "Act", route: "/side-quests", access: "session", action: "Inspect the side quest or challenge that created demand.", proof: "Quest definitions reveal criteria, caps, and verifier ownership." },
      { key: "prove", label: "Prove", route: "/challenges", access: "session", action: "Compare proof, submission state, grading, and automation.", proof: "Challenge state shows whether unlock evidence is trustworthy." },
      { key: "unlock", label: "Unlock", route: "/wtfiam", access: "session", action: "Review reward and inventory impact before increasing incentives.", proof: "WTFIAM and reward rows show where earned progress becomes useful." },
      { key: "return", label: "Return", route: "/admin", access: "admin", action: "Record the admin decision and keep watching abuse signals.", proof: "Admin audit context keeps liveops reversible and accountable." },
    ],
  },
];

export const BETA_UNLOCK_PASSPORTS: BetaUnlockPassport[] = [
  {
    key: "new-tezos-user",
    label: "New Tezos User Passport",
    identity: "Visitor moving toward Witness",
    question: "What can I safely do before WTFOS asks for heavier commitment?",
    access: "session",
    primaryRoute: "/side-quests",
    primaryAccess: "session",
    proofRoute: "/profile",
    proofAccess: "session",
    nextRoute: "/challenges",
    nextAccess: "session",
    visibleNow: "Public Gallery, Leaderboards, Arcade, Skywire, and beta proof explain that people, art, games, and progress already exist before sign-in.",
    nextSafeAction: "Sign in, open Side Quests, and finish one profile or discovery setup task that creates a small EXP win without pushing wallet-heavy action first.",
    proofNeeded: "A side quest completion plus profile or social readiness; a first wallet, market, or role action is not required for this passport.",
    unlocksNext: "The next progress surfaces are Mission Control, Challenges, Notifications, and a clearer daily loop that tells the user what changed after the first success.",
    staysLocked: "Creator publishing roles, admin tools, reward scaling, market authority, and contract/wallet decisions stay locked until later proof exists.",
    countReview: "The Count watches completion caps, the EXP award, reward idempotency, and whether the next recommended challenge fits the user's first success.",
    tomorrowReason: "Notifications and Digest can show the first EXP change, a fresh quest, or activity from people and objects discovered today.",
    relatedRoutes: ["/leaderboard", "/notifications", "/mission-control", "/gallery"],
  },
  {
    key: "collector",
    label: "Collector Passport",
    identity: "Witness collecting context",
    question: "How do I move from browsing art to understanding my collector path?",
    access: "public",
    primaryRoute: "/gallery",
    primaryAccess: "public",
    proofRoute: "/hoard",
    proofAccess: "session",
    nextRoute: "/rat-race",
    nextAccess: "session",
    visibleNow: "Gallery, Leaderboards, trade-board signals, and public market context show objects, creators, sales motion, and collector activity.",
    nextSafeAction: "Inspect one public object or creator signal, then use Side Quests or Hoard to turn passive discovery into route-owned collection proof.",
    proofNeeded: "An object, creator, holding, or trade signal that can be reviewed without pretending a contract purchase has already happened.",
    unlocksNext: "Rat Race, Marketplace, WTFIAM inventory, trade boards, and reward-spend prompts become understandable after collection context exists.",
    staysLocked: "Wallet sends, trade execution, market settlement, and reward-value increases stay behind the existing session, wallet, and review boundaries.",
    countReview: "The Count checks reward rows, market sinks, pricing locks, sale windows, and repeated completions before promoting collector incentives.",
    tomorrowReason: "Fresh objects, new sales, trade-board changes, and reward destinations give collectors a concrete reason to inspect the loop again.",
    relatedRoutes: ["/side-quests", "/marketplace", "/trade-boards", "/wtfiam"],
  },
  {
    key: "creator",
    label: "Creator Passport",
    identity: "Creator readying a publish path",
    question: "Which creation step should I take before asking for publishing power?",
    access: "session",
    primaryRoute: "/studio",
    primaryAccess: "session",
    proofRoute: "/tools/broot",
    proofAccess: "session",
    nextRoute: "/ipfs-pinning",
    nextAccess: "session",
    visibleNow: "Studio, Broot, Macaroni, IPFS Pinning, WTF Domains, and Skywire are grouped as one creation runway instead of isolated tool names.",
    nextSafeAction: "Open or recover a Studio project, prepare one asset in Broot, and identify the next publish dependency before requesting a role or gate change.",
    proofNeeded: "A draft, asset, package, pinning requirement, or domain-readiness artifact that shows what the creator is actually trying to publish.",
    unlocksNext: "IPFS Pinning, WTF Domains, Macaroni packaging, Skywire promotion, and creator challenge review become the next logical surfaces.",
    staysLocked: "Trusted creator role grants, platform pinning, hosted publishing, admin controls, and contract authority stay explicit and reviewable.",
    countReview: "The Count compares creator proof, challenge submission state, role request, app gate, and abuse signals before opening narrow publishing access.",
    tomorrowReason: "Draft recovery, pinning progress, domain readiness, publish states, and promotion prompts make creator work worth checking again.",
    relatedRoutes: ["/tools/macaroni", "/wtf-subdomains", "/skywire", "/challenges"],
  },
  {
    key: "builder",
    label: "Builder Passport",
    identity: "Builder proving output",
    question: "How do I show a project is testable without drifting into admin power?",
    access: "session",
    primaryRoute: "/game-studio",
    primaryAccess: "session",
    proofRoute: "/map-lab",
    proofAccess: "session",
    nextRoute: "/console",
    nextAccess: "session",
    visibleNow: "Game Studio, Map Lab, Console, Arcade, and W feedback are linked as a build path with a visible user outcome.",
    nextSafeAction: "Choose one project, map its route or relationship, and use Console or Arcade context to prove the output can be inspected.",
    proofNeeded: "A mapped route, build artifact, playable output, or console test that demonstrates user-facing value rather than operator authority.",
    unlocksNext: "Arcade discovery, W feedback, focused challenge review, and narrow builder surface access can open after proof is inspectable.",
    staysLocked: "Admin tooling, production operations, contract logic, database changes, and broad app-gate authority remain outside builder progression.",
    countReview: "The Count reviews project proof, affected app gates, abuse risk, and whether the requested builder access is reversible and narrow.",
    tomorrowReason: "Project progress, route maps, playtest feedback, and community reactions give the builder a reason to return beyond one prototype visit.",
    relatedRoutes: ["/arcade", "/w", "/challenges", "/admin"],
  },
  {
    key: "curator",
    label: "Curator Passport",
    identity: "Curator turning taste into proof",
    question: "How do I make discovery useful to other people?",
    access: "public",
    primaryRoute: "/gallery",
    primaryAccess: "public",
    proofRoute: "/crp-nominate",
    proofAccess: "session",
    nextRoute: "/skywire",
    nextAccess: "public",
    visibleNow: "Gallery, CRP nomination, Skywire, W, TV, and Leaderboards create a chain from discovery to nomination to public signal.",
    nextSafeAction: "Find one noteworthy object, creator, or collection, then record why it matters before trying to broadcast or nominate it.",
    proofNeeded: "A clear object or creator reason, nomination context, or curation side quest proof that can be reviewed without rewarding spam.",
    unlocksNext: "CRP nomination, Skywire signal, W discussion, TV/broadcast context, and curator-readiness review become easier to discover.",
    staysLocked: "Curator roles, nomination scale, reward value, and public amplification stay behind proof requirements, caps, and review notes.",
    countReview: "The Count checks repeated nominations, proof quality, reward rows, and role need before increasing curator visibility or incentives.",
    tomorrowReason: "New art, nominations, creator motion, public reactions, and leaderboard changes give curators something useful to revisit.",
    relatedRoutes: ["/w", "/tv", "/side-quests", "/leaderboard"],
  },
  {
    key: "community-member",
    label: "Community Passport",
    identity: "Community member finding people",
    question: "Where are the people, and what is safe to do with them first?",
    access: "session",
    primaryRoute: "/w",
    primaryAccess: "session",
    proofRoute: "/live",
    proofAccess: "session",
    nextRoute: "/digest",
    nextAccess: "session",
    visibleNow: "W, WIM, WTF LIVE, Calendar, Digest, Mail, and Notifications make active people, rooms, replies, and events visible.",
    nextSafeAction: "Choose one person, post, room, or event, then join, reply, follow up, or save it as a low-risk social action.",
    proofNeeded: "A real interaction, room visit, message, event interest, or digest item that shows participation without forcing noise.",
    unlocksNext: "WIM follow-up, WTF LIVE participation, event reminders, notification tuning, and community challenge progress become natural next steps.",
    staysLocked: "Admin queues, moderation power, reward farming, and high-volume notification pressure stay behind existing gates and quiet rules.",
    countReview: "The Count watches abuse signals, repeated low-effort completions, and notification pressure before rewarding or promoting social loops.",
    tomorrowReason: "Replies, rooms, digest updates, scheduled moments, and new people in motion make the community feel alive when users return.",
    relatedRoutes: ["/wim", "/notifications", "/calendar", "/mail"],
  },
  {
    key: "the-count",
    label: "Count Operator Passport",
    identity: "Admin operator, not player progression",
    question: "Which management job should be handled before changing the game loop?",
    access: "admin",
    primaryRoute: "/admin",
    primaryAccess: "admin",
    proofRoute: "/admin",
    proofAccess: "admin",
    nextRoute: "/mission-control",
    nextAccess: "session",
    visibleNow: "The Count sees admin summaries only after the current session passes existing admin API gates; everyone else sees the boundary.",
    nextSafeAction: "Pick one workbench job, inspect its source of truth, and route the player to an existing surface before changing rewards, roles, or visibility.",
    proofNeeded: "User, role, side quest, challenge, reward, market, notification, automation, and SystemEvent rows that explain the proposed change.",
    unlocksNext: "Better side quests, challenge arcs, reward destinations, role reviews, market sinks, and visibility rules can be managed without new app logic.",
    staysLocked: "Production behavior, database structure, API contracts, wallet logic, contract logic, and player app purpose stay immutable.",
    countReview: "The Count treats EXP and levels as evidence for review only; explicit admin roles, permissions, and audit notes remain the authority.",
    tomorrowReason: "Open admin queues, pending rewards, automation risk, user needs, and market changes give operators a manageable daily review loop.",
    relatedRoutes: ["/side-quests", "/challenges", "/wtfiam", "/marketplace"],
  },
];

export const BETA_RELATIONSHIP_NAVIGATOR: BetaRelationshipNavigatorChain[] = [
  {
    key: "first-safe-win-chain",
    label: "First safe win chain",
    actor: "new-tezos-user",
    stage: "start",
    question: "How does a new user move from seeing proof to earning the first useful win?",
    startsWhen: "The user understands that WTFOS has people and progress, but has not yet made a safe signed-in action.",
    userBenefit: "Turns public proof into one small side quest, then connects that success to profile, challenge, and notification loops.",
    comesBefore: "Public leaderboard and gallery proof should be visible before asking for wallet-heavy or market-heavy decisions.",
    consumes: "Public EXP rows, profile readiness, side quest definitions, challenge availability, and notification state.",
    feedsInto: "Mission Control, Challenges, Notifications, and the next persona-specific passport once the first win is understood.",
    comesAfter: "The next logical step is either a challenge, a daily return prompt, or a persona path based on what the user completed.",
    countWatch: "The Count checks completion caps, reward idempotency, and whether the recommended next challenge matches the user's first proof.",
    steps: [
      { key: "see-proof", label: "See proof", route: "/leaderboard", access: "public", why: "Leaderboard proves other users are already progressing before the new user signs in.", handoff: "Move from public proof to a small route-owned side quest." },
      { key: "take-action", label: "Take action", route: "/side-quests", access: "session", why: "Side Quests create the smallest useful signed-in action without changing wallet or contract behavior.", handoff: "Completion proof should point back to identity setup." },
      { key: "anchor-identity", label: "Anchor identity", route: "/profile", access: "session", why: "Profile explains who the user is in WTFOS before deeper role or market paths appear.", handoff: "A stable profile makes challenge proof reviewable." },
      { key: "try-challenge", label: "Try challenge", route: "/challenges", access: "session", why: "Challenges give the first win a bigger unlock arc using existing proof and review systems.", handoff: "Challenge state becomes tomorrow's follow-up and the next visible progress checkpoint." },
      { key: "return-prompt", label: "Return prompt", route: "/notifications", access: "session", why: "Notifications show what changed after the first win and why the user should come back.", handoff: "Fresh progress routes the user to the next passport." },
    ],
    relatedRoutes: ["/mission-control", "/gallery", "/digest"],
  },
  {
    key: "collector-context-chain",
    label: "Collector context chain",
    actor: "collector",
    stage: "collect",
    question: "How does browsing art become a collector path instead of a dead-end gallery visit?",
    startsWhen: "The user finds an object, creator, sale, holding, or trade signal and needs to know which collector tool owns the next move.",
    userBenefit: "Keeps collection discovery explainable by separating public inspection, signed-in collection context, market heat, trade intent, and reward inventory.",
    comesBefore: "Gallery and public proof should come before Hoard, Rat Race, Marketplace, or trade-board action.",
    consumes: "Object metadata, holder context, marketplace listings, trade-board signals, reward inventory, and user collection state.",
    feedsInto: "Hoard, Rat Race, Marketplace, Trade Boards, WTFIAM inventory, collector quests, and market-notification preferences.",
    comesAfter: "After context exists, the user can inspect heat, coordinate trades, or see where earned rewards and inventory live.",
    countWatch: "The Count watches reward rows, price locks, sale windows, repeated completions, and market pressure before promoting collector incentives.",
    steps: [
      { key: "inspect-object", label: "Inspect object", route: "/gallery", access: "public", why: "Gallery is the safest first look at art, creators, and collections.", handoff: "Public inspection can hand off to owned collection context." },
      { key: "check-holdings", label: "Check holdings", route: "/hoard", access: "session", why: "Hoard turns passive browsing into account-aware collection context.", handoff: "Holdings make urgency and market heat meaningful." },
      { key: "read-heat", label: "Read heat", route: "/rat-race", access: "session", why: "Rat Race explains what is moving before the user makes market assumptions.", handoff: "Heat can lead to market inspection or trade coordination." },
      { key: "inspect-market", label: "Inspect market", route: "/marketplace", access: "session", why: "Marketplace owns listing and auction depth while keeping wallet authority separate.", handoff: "Market context clarifies whether trade intent is useful." },
      { key: "coordinate-trade", label: "Coordinate trade", route: "/trade-boards", access: "session", why: "Trade Boards expose collector intent and conversation around existing objects.", handoff: "Trade intent and earned items should be visible in inventory." },
      { key: "check-inventory", label: "Check inventory", route: "/wtfiam", access: "session", why: "WTFIAM shows earned inventory, rewards, and useful destinations for progress.", handoff: "Inventory creates tomorrow's reward or market return loop." },
    ],
    relatedRoutes: ["/side-quests", "/leaderboard", "/notifications"],
  },
  {
    key: "creator-publish-chain",
    label: "Creator publish chain",
    actor: "creator",
    stage: "publish",
    question: "Which creation tool comes before publishing, storage, domains, and promotion?",
    startsWhen: "A creator has an idea, draft, media asset, package, pinning dependency, domain need, or promotion goal.",
    userBenefit: "Turns isolated creation-tool names into a publish runway that explains preparation, packaging, durability, identity, and distribution.",
    comesBefore: "Studio and Broot should come before hosted publishing, pinning, domain, or promotion requests.",
    consumes: "Draft state, media assets, package readiness, pinning requirements, domain readiness, creator roles, and promotion intent.",
    feedsInto: "IPFS Pinning, WTF Domains, Skywire, creator challenges, trusted-creator review, and return prompts for unfinished work.",
    comesAfter: "After assets are prepared, the creator can package, pin, claim a domain, and promote without receiving unrelated authority.",
    countWatch: "The Count compares creator proof, challenge submission state, role request, app gate, and abuse signals before expanding access.",
    steps: [
      { key: "open-workspace", label: "Open workspace", route: "/studio", access: "session", why: "Studio is the creator home base for drafts, projects, and recovery.", handoff: "A project can hand off to media preparation once the creator knows what asset is next." },
      { key: "prepare-media", label: "Prepare media", route: "/tools/broot", access: "session", why: "Broot owns visual preparation before the creator packages a release.", handoff: "Prepared media can become a packaged drop with clearer publishing requirements." },
      { key: "package-drop", label: "Package drop", route: "/tools/macaroni", access: "role", why: "Macaroni gives drop structure to creator work through existing role gates.", handoff: "Package readiness makes durability and publishing needs explicit." },
      { key: "pin-media", label: "Pin media", route: "/ipfs-pinning", access: "session", why: "IPFS Pinning is the durability checkpoint before public promotion.", handoff: "Pinned media can connect to identity and discovery routes." },
      { key: "claim-domain", label: "Claim domain", route: "/wtf-subdomains", access: "session", why: "WTF Domains gives the published work a memorable WTFOS identity.", handoff: "A public identity makes promotion clearer and easier to route back to the creator." },
      { key: "promote-signal", label: "Promote signal", route: "/skywire", access: "public", why: "Skywire broadcasts creator context without replacing the creation tools.", handoff: "Public signal feeds notifications, W, and tomorrow's creator recovery loop." },
    ],
    relatedRoutes: ["/challenges", "/notifications", "/profile"],
  },
  {
    key: "builder-output-chain",
    label: "Builder output chain",
    actor: "builder",
    stage: "play",
    question: "How does a builder prove output is usable before asking for more access?",
    startsWhen: "A builder has a project, game, map, route, console artifact, or prototype that needs inspection and feedback.",
    userBenefit: "Shows builders how to move from project intent to mapped structure, inspectable output, playable proof, and community feedback.",
    comesBefore: "Game Studio and Map Lab should come before broad app-gate requests or operator-level access.",
    consumes: "Project metadata, route maps, console output, playable builds, feedback posts, and challenge submissions.",
    feedsInto: "Arcade discovery, W feedback, builder challenges, app-gate review, and narrow reversible access grants.",
    comesAfter: "After proof exists, the next path is feedback, challenge review, or a narrowly scoped builder surface.",
    countWatch: "The Count reviews project proof, affected app gates, abuse risk, and whether requested builder access is reversible and narrow.",
    steps: [
      { key: "choose-project", label: "Choose project", route: "/game-studio", access: "session", why: "Game Studio gives builder work a route-owned home base before any access request.", handoff: "A project can hand off to structure mapping when its user path needs proof." },
      { key: "map-route", label: "Map route", route: "/map-lab", access: "session", why: "Map Lab turns experiments and systems into navigable structure.", handoff: "A map makes the output easier to inspect and explain to reviewers." },
      { key: "inspect-output", label: "Inspect output", route: "/console", access: "session", why: "Console helps the builder prove the output can be inspected before play.", handoff: "Inspectable output can become playable proof once the route is understandable." },
      { key: "play-proof", label: "Play proof", route: "/arcade", access: "public", why: "Arcade exposes playable proof and lets the builder see user value.", handoff: "Playable output should collect community feedback." },
      { key: "collect-feedback", label: "Collect feedback", route: "/w", access: "session", why: "W turns builder output into visible discussion and response from other users.", handoff: "Feedback informs the next challenge, access review, or return prompt." },
    ],
    relatedRoutes: ["/challenges", "/admin", "/notifications"],
  },
  {
    key: "curator-signal-chain",
    label: "Curator signal chain",
    actor: "curator",
    stage: "connect",
    question: "How does taste become useful public discovery without becoming spam?",
    startsWhen: "A user finds a noteworthy object, creator, collection, nomination target, or public signal that deserves context.",
    userBenefit: "Gives curators a route-owned path from inspection to proof, nomination, broadcast, and discussion.",
    comesBefore: "Gallery inspection and side quest proof should come before nomination, amplification, or curator-role review.",
    consumes: "Object context, creator signals, side quest proof, nomination rows, broadcast intent, and community responses.",
    feedsInto: "CRP nomination, Skywire signals, W discussions, TV/broadcast context, curation rewards, and curator-readiness review.",
    comesAfter: "After a useful signal exists, the user can discuss it, nominate it, or return when reactions and proof change.",
    countWatch: "The Count checks repeated nominations, proof quality, reward rows, role need, and anti-spam caps before increasing curation incentives.",
    steps: [
      { key: "find-signal", label: "Find signal", route: "/gallery", access: "public", why: "Gallery lets curators inspect objects and creators before making claims.", handoff: "Useful taste needs a small proof action before it should be amplified." },
      { key: "record-proof", label: "Record proof", route: "/side-quests", access: "session", why: "Side Quests capture why the discovery matters before reward pressure appears.", handoff: "Proof can support nomination or broadcast when the reason is reviewable." },
      { key: "nominate", label: "Nominate", route: "/crp-nominate", access: "session", why: "CRP nomination owns formal curation intent and reviewable nomination state.", handoff: "Nomination context can become a public signal once the reason is clear." },
      { key: "broadcast", label: "Broadcast", route: "/skywire", access: "public", why: "Skywire lets the curator surface a signal without changing nomination logic.", handoff: "Broadcasts can move into community discussion." },
      { key: "discuss", label: "Discuss", route: "/w", access: "session", why: "W lets other people respond, validate, or challenge the signal.", handoff: "Responses inform the next nomination or return loop." },
    ],
    relatedRoutes: ["/tv", "/leaderboard", "/notifications"],
  },
  {
    key: "community-presence-chain",
    label: "Community presence chain",
    actor: "community-member",
    stage: "connect",
    question: "Where are the people, and which social surface owns the next action?",
    startsWhen: "A user sees a person, reply, room, event, direct follow-up, or missed activity and needs a non-noisy next step.",
    userBenefit: "Makes WTFOS feel inhabited by linking public/community posts, live rooms, direct messages, calendar moments, and catch-up loops.",
    comesBefore: "W and public/live signals should come before direct follow-up, notification pressure, or digest catch-up.",
    consumes: "Posts, live-room presence, direct-message context, calendar events, missed notifications, and digest summaries.",
    feedsInto: "WIM follow-up, WTF LIVE participation, Calendar reminders, Digest catch-up, Notifications, and community challenges.",
    comesAfter: "After participation, the user should know whether to follow up directly, attend the next event, or return for the digest.",
    countWatch: "The Count watches abuse signals, repeated low-effort completions, moderation risk, and notification pressure before rewarding social loops.",
    steps: [
      { key: "see-people", label: "See people", route: "/w", access: "session", why: "W is the visible community feed where people and posts become discoverable.", handoff: "Feed activity can hand off to rooms when the moment is live." },
      { key: "join-room", label: "Join room", route: "/live", access: "session", why: "WTF LIVE gives social motion a time-bound place for rooms and shared activity.", handoff: "A live moment can become a direct follow-up when the user knows who to contact." },
      { key: "follow-up", label: "Follow up", route: "/wim", access: "session", why: "WIM owns direct conversation once ambient activity becomes personal.", handoff: "Personal context can become an event or reminder." },
      { key: "mark-event", label: "Mark event", route: "/calendar", access: "public", why: "Calendar explains when to return for the next shared moment or event.", handoff: "Scheduled context feeds catch-up and reminders." },
      { key: "catch-up", label: "Catch up", route: "/digest", access: "session", why: "Digest turns missed replies, rooms, rewards, and system work into a return loop.", handoff: "Catch-up items point back to the owning route." },
    ],
    relatedRoutes: ["/notifications", "/mail", "/mission-control"],
  },
  {
    key: "economy-spend-chain",
    label: "Economy spend chain",
    actor: "all-users",
    stage: "collect",
    question: "How does earned progress become useful without turning rewards into a faucet?",
    startsWhen: "A user has EXP, a reward, an item, a market signal, or a curiosity about where earned value goes next.",
    userBenefit: "Separates earning, evidence, inventory, market preview, trade intent, and spending so rewards stay understandable and auditable.",
    comesBefore: "Side Quests and Leaderboards should explain earned progress before WTFIAM or market sinks ask for deeper commitment.",
    consumes: "EXP rows, reward ledger rows, WTFIAM inventory, market items, listings, trade-board signals, and notification preferences.",
    feedsInto: "WTFIAM inventory, Marketplace, Trade Boards, Rat Race, reward notifications, and Count market-sink management.",
    comesAfter: "After value has a visible destination, the user can inspect market context or choose a safer return prompt.",
    countWatch: "The Count reviews reward settlement, market items, pricing locks, sale windows, caps, and idempotency before increasing repeat incentives.",
    steps: [
      { key: "earn-proof", label: "Earn proof", route: "/side-quests", access: "session", why: "Side Quests connect action to EXP or reward proof before economy prompts appear.", handoff: "Earned proof should be visible to the user and community before spend paths grow." },
      { key: "see-rank", label: "See rank", route: "/leaderboard", access: "public", why: "Leaderboard shows progress without requiring a spend or wallet action.", handoff: "Progress context can lead to inventory inspection." },
      { key: "inspect-inventory", label: "Inspect inventory", route: "/wtfiam", access: "session", why: "WTFIAM explains where earned items, rewards, and identity effects live.", handoff: "Inventory creates a reason to inspect available sinks." },
      { key: "preview-sink", label: "Preview sink", route: "/marketplace", access: "session", why: "Marketplace shows listings and item context while preserving wallet authority.", handoff: "Market context can lead to trade intent or heat checks." },
      { key: "coordinate-intent", label: "Coordinate intent", route: "/trade-boards", access: "session", why: "Trade Boards let collectors coordinate around objects before execution pressure.", handoff: "Trade signals make urgency legible before Rat Race or notifications push attention." },
      { key: "check-urgency", label: "Check urgency", route: "/rat-race", access: "session", why: "Rat Race explains what is moving quickly without pretending every signal is a mandate.", handoff: "Urgency feeds notifications and tomorrow's collector loop." },
    ],
    relatedRoutes: ["/notifications", "/admin", "/gallery"],
  },
  {
    key: "count-liveops-chain",
    label: "Count liveops chain",
    actor: "the-count",
    stage: "operate",
    question: "Which admin surface owns the next game-loop decision before anything scales?",
    startsWhen: "The Count sees a stalled user, farmable quest, role request, reward cluster, market pressure, or noisy signal.",
    userBenefit: "Keeps admin work manageable by routing player needs to existing owner surfaces while preserving explicit permissions and audit context.",
    comesBefore: "Admin review should come before scaling rewards, changing roles, increasing visibility, or promoting market pressure.",
    consumes: "Admin user rows, role matrix state, side quest and challenge definitions, reward ledger rows, market item state, and SystemEvent handles.",
    feedsInto: "Player route recommendations, side quest tuning, challenge arcs, role or app-gate review, reward settlement, and market visibility policy.",
    comesAfter: "After review, The Count either routes the user to an existing tool, records an audit decision, or keeps the loop quiet until proof improves.",
    countWatch: "The Count treats EXP and levels as review evidence only; explicit admin roles, reversible permissions, and audit notes remain the authority.",
    steps: [
      { key: "open-admin", label: "Open admin", route: "/admin", access: "admin", why: "Admin summary shows the strict-gated queues before any operator action.", handoff: "A hot queue should route to the player-facing owner surface." },
      { key: "inspect-quest", label: "Inspect quest", route: "/side-quests", access: "session", why: "Side Quests reveal criteria, EXP, completion caps, and verifier ownership.", handoff: "Quest proof can become a challenge or reward review." },
      { key: "review-challenge", label: "Review challenge", route: "/challenges", access: "session", why: "Challenges expose submissions, grading, proof, and role-readiness context.", handoff: "Challenge outcomes can require inventory, reward, or role checks." },
      { key: "check-reward", label: "Check reward", route: "/wtfiam", access: "session", why: "WTFIAM shows where earned progress and reward destinations appear to the player.", handoff: "Reward impact informs the final admin decision." },
      { key: "record-decision", label: "Record decision", route: "/admin", access: "admin", why: "Admin audit context keeps liveops decisions reversible and accountable.", handoff: "The recorded decision controls what should be surfaced tomorrow." },
    ],
    relatedRoutes: ["/marketplace", "/notifications", "/mission-control"],
  },
];

export const BETA_ROUTE_GROUP_GUIDE: BetaRouteGroupGuide[] = [
  {
    key: "first-win",
    label: "First Win Group",
    actor: "new-tezos-user",
    stage: "start",
    atlasPersona: "new-tezos-user",
    atlasStage: "start",
    atlasTier: 1,
    atlasQuery: "",
    userQuestion: "Where do I start without a wallet-heavy mistake?",
    confusionResolved: "Side Quests, Challenges, Mission Control, Leaderboards, Profile, and Notifications become one first-win loop instead of six unrelated app names.",
    useFirst: "Use Leaderboards or Gallery as public proof, then Side Quests for the first signed-in action.",
    useNext: "Use Profile, Challenges, Mission Control, and Notifications after the first completion creates identity and progress context.",
    proofToLookFor: "EXP rows, side quest completion, profile readiness, a visible next challenge, and a return prompt.",
    quietRule: "If the first quest path is quiet or gated, keep public Gallery and Leaderboards visible while explaining that signed-in progress owns the next step.",
    countWatch: "The Count watches completion caps, low-risk EXP, reward idempotency, and whether the next challenge still fits a new user.",
    routes: [
      { label: "Public progress", route: "/leaderboard", access: "public", purpose: "Proves people and EXP exist before sign-in, giving the first quest visible community context." },
      { label: "First action", route: "/side-quests", access: "session", purpose: "Turns orientation into one small route-owned task." },
      { label: "Identity anchor", route: "/profile", access: "session", purpose: "Explains who the user is before deeper routes ask for commitment." },
      { label: "Next challenge", route: "/challenges", access: "session", purpose: "Extends the first win into a larger unlock path." },
      { label: "Return prompt", route: "/notifications", access: "session", purpose: "Shows what changed after the first completion." },
    ],
  },
  {
    key: "collector-economy",
    label: "Collector Economy Group",
    actor: "collector",
    stage: "collect",
    atlasPersona: "collector",
    atlasStage: "collect",
    atlasTier: "all",
    atlasQuery: "",
    userQuestion: "Which collector route should I open after I find an object?",
    confusionResolved: "Gallery, Hoard, Marketplace, Rat Race, Trade Boards, and WTFIAM are separated into inspection, ownership context, market depth, urgency, trade intent, and inventory.",
    useFirst: "Use Gallery first because it lets collectors inspect objects and creators without wallet pressure.",
    useNext: "Use Hoard for owned context, Rat Race for urgency, Marketplace for listing depth, Trade Boards for coordination, and WTFIAM for earned inventory.",
    proofToLookFor: "Fresh objects, holder rows, trade-board objects, market listings, owned items, reward destinations, and collector return prompts.",
    quietRule: "If market or trade proof is quiet, keep Gallery and Leaderboards as the safe discovery path before suggesting wallet-heavy action.",
    countWatch: "The Count watches reward rows, sale windows, pricing locks, repeated completions, and market pressure before promoting collector incentives.",
    routes: [
      { label: "Inspect art", route: "/gallery", access: "public", purpose: "Safest collector entry for public objects and creators." },
      { label: "Owned context", route: "/hoard", access: "session", purpose: "Connects browsing to personal collection state." },
      { label: "Market depth", route: "/marketplace", access: "session", purpose: "Owns listings, auctions, and market inspection." },
      { label: "Market urgency", route: "/rat-race", access: "session", purpose: "Shows what appears to be moving quickly after the collector has object and market context." },
      { label: "Trade intent", route: "/trade-boards", access: "session", purpose: "Reveals collector coordination around existing objects." },
      { label: "Inventory", route: "/wtfiam", access: "session", purpose: "Shows earned items, rewards, and in-app market destinations." },
    ],
  },
  {
    key: "creator-pipeline",
    label: "Creator Pipeline Group",
    actor: "creator",
    stage: "publish",
    atlasPersona: "creator",
    atlasStage: "create",
    atlasTier: "all",
    atlasQuery: "Studio",
    userQuestion: "What comes before publishing, pinning, domains, or promotion?",
    confusionResolved: "Studio, Broot, Macaroni, IPFS Pinning, WTF Domains, Skywire, and TV become a runway: workspace, prepare, package, persist, identify, promote, and watch proof.",
    useFirst: "Use Studio first because creator work needs a project home before specialized tools create publish pressure.",
    useNext: "Use Broot for asset prep, Macaroni for package shape, IPFS Pinning for durability, WTF Domains for identity, Skywire for promotion, and TV for public media proof.",
    proofToLookFor: "Draft recovery, prepared asset, package readiness, pinning requirement, domain readiness, promotion signal, and creator-channel proof.",
    quietRule: "If creator proof is quiet, keep the runway visible and route to Studio recovery before recommending new tools or role changes.",
    countWatch: "The Count compares creator proof, challenge submissions, role requests, app gates, and abuse signals before opening narrow creator access.",
    routes: [
      { label: "Workspace", route: "/studio", access: "session", purpose: "Home base for projects, drafts, recovery, and the creator's next publish dependency." },
      { label: "Prepare asset", route: "/tools/broot", access: "session", purpose: "Turns raw media into a usable artifact before packaging, pinning, or promotion starts." },
      { label: "Package drop", route: "/tools/macaroni", access: "role", purpose: "Shapes a creator-owned drop behind the existing role gate before publish dependencies." },
      { label: "Persist media", route: "/ipfs-pinning", access: "session", purpose: "Checks durable storage and pinning readiness before public discovery depends on the artifact." },
      { label: "Claim identity", route: "/wtf-subdomains", access: "session", purpose: "Gives work a WTFOS identity and domain path so promotion can point back to the creator." },
      { label: "Promote signal", route: "/skywire", access: "public", purpose: "Broadcasts creator context without replacing creation tools." },
      { label: "Watch proof", route: "/tv", access: "session", purpose: "Shows creator/media channel proof inside the existing TV route gate." },
    ],
  },
  {
    key: "builder-output",
    label: "Builder Output Group",
    actor: "builder",
    stage: "play",
    atlasPersona: "builder",
    atlasStage: "play",
    atlasTier: "all",
    atlasQuery: "",
    userQuestion: "How do I prove a project is inspectable, playable, and worth feedback?",
    confusionResolved: "Game Studio, Map Lab, Console, Arcade, and W become a build-output loop instead of an experimental drawer.",
    useFirst: "Use Game Studio first when the builder needs a project or template home.",
    useNext: "Use Map Lab for structure, Console for inspectable output, Arcade for playable proof, and W for feedback.",
    proofToLookFor: "A project route, map relationship, console artifact, playable surface, recent play, and feedback context.",
    quietRule: "If Console or Arcade proof is quiet, keep Game Studio and Map Lab visible as the route where builder output starts.",
    countWatch: "The Count reviews project proof, affected app gates, abuse risk, and whether any requested builder access is narrow and reversible.",
    routes: [
      { label: "Project home", route: "/game-studio", access: "session", purpose: "Starts the builder path with a concrete project." },
      { label: "System map", route: "/map-lab", access: "session", purpose: "Explains route and system relationships before the builder asks users or admins to inspect output." },
      { label: "Inspectable output", route: "/console", access: "session", purpose: "Makes builder work testable before public play." },
      { label: "Playable proof", route: "/arcade", access: "public", purpose: "Shows whether normal users can touch the work." },
      { label: "Feedback loop", route: "/w", access: "session", purpose: "Turns builder output into community response that can guide the next route or challenge review." },
    ],
  },
  {
    key: "curator-signal",
    label: "Curator Signal Group",
    actor: "curator",
    stage: "connect",
    atlasPersona: "curator",
    atlasStage: "connect",
    atlasTier: "all",
    atlasQuery: "",
    userQuestion: "How does taste become useful public discovery instead of passive browsing?",
    confusionResolved: "Gallery, Side Quests, CRP nomination, Skywire, W, TV, and Leaderboards become a route-owned curation contribution loop.",
    useFirst: "Use Gallery first because the curator needs a public object, creator, or collection signal before making a claim.",
    useNext: "Use Side Quests to record proof, CRP nomination for formal intent, Skywire for broadcast, W for discussion, TV and Leaderboards for public proof.",
    proofToLookFor: "Object context, creator signal, reasoned side quest proof, nomination readiness, broadcast context, and community response.",
    quietRule: "If nomination is gated, disabled, or quiet, keep Gallery, Skywire, W, TV, and Leaderboards available as alternate curation impact routes.",
    countWatch: "The Count reviews nomination proof, repeated submissions, role need, reward rows, and anti-spam caps before scaling curation incentives.",
    routes: [
      { label: "Find signal", route: "/gallery", access: "public", purpose: "Public inspection before curation claims, nominations, rewards, or broadcast pressure appear." },
      { label: "Record proof", route: "/side-quests", access: "session", purpose: "Turns taste into reviewable evidence before the user asks for nomination or curator impact." },
      { label: "Nominate", route: "/crp-nominate", access: "session", purpose: "Owns formal curation intent when available and keeps the nomination path reviewable." },
      { label: "Broadcast", route: "/skywire", access: "public", purpose: "Surfaces the signal beyond the app list while leaving curation and nomination logic unchanged." },
      { label: "Discuss signal", route: "/w", access: "session", purpose: "Lets other users respond to the signal so curation becomes shared context instead of private browsing." },
      { label: "Watch proof", route: "/tv", access: "session", purpose: "Shows media/creator proof inside the existing TV route gate." },
      { label: "Compare progress", route: "/leaderboard", access: "public", purpose: "Shows visible community proof and ranking context." },
    ],
  },
  {
    key: "community-comms",
    label: "Community Comms Group",
    actor: "community-member",
    stage: "connect",
    atlasPersona: "community-member",
    atlasStage: "connect",
    atlasTier: "all",
    atlasQuery: "",
    userQuestion: "Which social route owns feed, direct follow-up, live presence, and catch-up?",
    confusionResolved: "W, WIM, WTF LIVE, Calendar, Digest, Mail, Notifications, and Skywire become one communication chain with different jobs.",
    useFirst: "Use W or public people proof first when the user needs to know other people exist.",
    useNext: "Use WTF LIVE for time-bound presence, WIM for direct follow-up, Calendar for return timing, Digest for catch-up, Mail for slower private work, and Notifications for personal changes.",
    proofToLookFor: "Feed activity, room presence, direct-message context, scheduled event, digest item, unread personal change, or external broadcast signal.",
    quietRule: "If live rooms or feeds are quiet, keep Calendar, Digest, Leaderboards, and Arcade visible so the community still has a return path.",
    countWatch: "The Count watches abuse signals, moderation pressure, low-effort completions, and notification fatigue before rewarding social loops.",
    routes: [
      { label: "Shared feed", route: "/w", access: "session", purpose: "Community posts and ambient social motion before the user chooses a direct or live response." },
      { label: "Direct follow-up", route: "/wim", access: "session", purpose: "Smaller conversation once a person matters enough to leave the public feed context." },
      { label: "Live presence", route: "/live", access: "session", purpose: "Time-bound rooms, stages, and shared moments when the social signal is happening now." },
      { label: "Return timing", route: "/calendar", access: "public", purpose: "Shows when to come back for events, live moments, deadlines, and community timing." },
      { label: "Catch up", route: "/digest", access: "session", purpose: "Recaps what changed while the user was away and routes catch-up items back to owners." },
      { label: "Slower private work", route: "/mail", access: "session", purpose: "Durable inbox-style coordination when chat or live-room follow-up is too ephemeral." },
      { label: "Personal changes", route: "/notifications", access: "session", purpose: "Owned replies, rewards, rooms, and recovery prompts." },
      { label: "External broadcast", route: "/skywire", access: "public", purpose: "Public AT Protocol bridge and promotion layer." },
    ],
  },
  {
    key: "count-liveops",
    label: "Count Liveops Group",
    actor: "the-count",
    stage: "operate",
    atlasPersona: "all",
    atlasStage: "operate",
    atlasTier: 5,
    atlasQuery: "admin",
    userQuestion: "Which admin surface owns the next liveops decision?",
    confusionResolved: "Admin, Side Quests, Challenges, WTFIAM, Marketplace, Settings, and Mission Control become a review path instead of scattered power tools.",
    useFirst: "Use Admin first because strict-admin authority, user context, role gates, and audit posture must be explicit.",
    useNext: "Use Side Quests for criteria and caps, Challenges for submissions and proof, WTFIAM for reward impact, Marketplace for sinks, Settings for system policy, and Mission Control for user-facing context.",
    proofToLookFor: "User row, role matrix, quest criteria, challenge submission, reward ledger row, market item state, audit note, and SystemEvent handle.",
    quietRule: "If admin queues are quiet, do not invent work; review public progress and keep advanced controls hidden until proof improves.",
    countWatch: "The Count treats EXP and levels as evidence only; explicit admin role, reversible permissions, and audit notes remain the authority.",
    routes: [
      { label: "Strict admin", route: "/admin", access: "admin", purpose: "Owns operator review and role-gated management." },
      { label: "Quest criteria", route: "/side-quests", access: "session", purpose: "Defines repeatable discovery loops, criteria, EXP, rewards, and completion caps for review." },
      { label: "Challenge proof", route: "/challenges", access: "session", purpose: "Owns submissions, grading, and unlock context." },
      { label: "Reward impact", route: "/wtfiam", access: "session", purpose: "Shows earned inventory and reward destinations." },
      { label: "Market sinks", route: "/marketplace", access: "session", purpose: "Shows listings, pricing pressure, and market context." },
      { label: "System policy", route: "/settings", access: "session", purpose: "Keeps preference and system-management paths discoverable." },
      { label: "User cockpit", route: "/mission-control", access: "session", purpose: "Shows how admin choices appear to normal users." },
    ],
  },
];

export const BETA_COUNT_ADMIN_PUPPET = {
  key: "the-count",
  label: "The Count",
  route: "/admin",
  role: "admin",
  promise: "Manage WTFOS discovery as a fair liveops game: count progress, count abuse risk, count rewards, and count which users need help next.",
  confusion: "Admin surfaces are powerful but scattered across users, roles, quests, rewards, automation, app gates, and market tabs.",
  failure: "Creates quests, challenges, rewards, or market items without enough audit context to verify outcomes.",
  hesitation: "Pauses when EXP suggests readiness but roles, permissions, app gates, and abuse signals disagree.",
  abandonment: "Stops liveops tuning if admin routes do not show who needs help, what changed, and which system owns the next action.",
  delightedBy: "A single beta runbook that tells which admin tab to open, which existing handle powers the unlock, and which audit surface proves it worked.",
};

export const BETA_COUNT_ADMIN_STORIES = [
  { title: "Triage a new user into the right first quest", adminSurface: "Users, XP Log, Side Quests", playerNeed: "New Tezos users need a safe first win.", story: "As The Count, I want to inspect a user's role, EXP tier, wallet/social setup, and recent quest state so I can recommend a manageable next step.", acceptance: "The Count can route the user to a matching quest." },
  { title: "Create a daily discovery side quest", adminSurface: "Side Quests, Automation, Rewards", playerNeed: "Community members need a reason to return tomorrow.", story: "As The Count, I want to create a side quest with criteria, EXP, optional WTF reward, max completions, and auto-verify type.", acceptance: "Completions are auditable, EXP appears in the XP log, and reward rows remain idempotent." },
  { title: "Build a creator unlock challenge", adminSurface: "Challenges, Roles, Desktop and Start Menu Apps", playerNeed: "Creators need tool order, not just tool names.", story: "As The Count, I want to link Profile, Studio, Broot, IPFS Pinning, WTF Domains, and Skywire in one challenge.", acceptance: "A creator can submit proof, receive feedback, and be reviewed for the correct unlock." },
  { title: "Manage roles and permissions without leaking admin power", adminSurface: "Roles, OS Admin, App Gates", playerNeed: "Builders and creators need advanced tools, but not production operations.", story: "As The Count, I want EXP to signal readiness while admin authority remains explicit.", acceptance: "Direct route access still respects role and surface gates." },
  { title: "Tune rewards and in-app market sinks", adminSurface: "Rewards, In-App Market, Contract Ledger", playerNeed: "Users need useful things to earn and spend.", story: "As The Count, I want to review reward ledger rows, inventory, pricing locks, sale windows, and payment paths.", acceptance: "Market and reward states are visible and auditable." },
  { title: "Audit abuse before a loop becomes farmable", adminSurface: "Automation, XP Log, Rewards, System Logs", playerNeed: "Honest users need trust that unlocks are earned.", story: "As The Count, I want to compare completions, EXP spikes, repeated proofs, reward rows, and handles.", acceptance: "The Count can see trigger, user, reward action, completion state, and audit trail." },
];

export const BETA_COUNT_ADMIN_SUMMARY_SOURCES: BetaCountAdminSummarySource[] = [
  {
    key: "user-needs",
    label: "User needs",
    route: "/admin",
    endpoint: "/api/admin/users",
    access: "admin",
    countLabel: "tracked users",
    purpose: "Shows whether The Count has enough user context to triage stalled, new, creator, collector, builder, curator, and community journeys.",
    failureCopy: "Only an existing admin session with user-management access may inspect user rows.",
  },
  {
    key: "role-gates",
    label: "Role gates",
    route: "/admin",
    endpoint: "/api/admin/role-access",
    access: "admin",
    countLabel: "role surfaces",
    purpose: "Connects EXP readiness to explicit roles, permissions, app gates, and admin surface grants without letting EXP become authority.",
    failureCopy: "Only an existing admin session with role-management access may inspect the role access matrix.",
  },
  {
    key: "quest-challenge-load",
    label: "Quest and challenge load",
    route: "/admin",
    endpoint: "/api/admin/stats",
    access: "admin",
    countLabel: "quest/challenge definitions",
    purpose: "Counts the existing side quest and challenge load before The Count decides what discovery path to promote next.",
    failureCopy: "Only an existing admin session with admin-panel access may inspect platform stats.",
  },
  {
    key: "reward-settlement",
    label: "Reward settlement",
    route: "/admin",
    endpoint: "/api/admin/reward-ledger?paid=false",
    access: "admin",
    countLabel: "unpaid reward rows",
    purpose: "Surfaces unresolved rewards so the game loop stays fair, auditable, and worth returning to tomorrow.",
    failureCopy: "Only an existing admin session with reward-management access may inspect reward ledger rows.",
  },
  {
    key: "market-operations",
    label: "Market operations",
    route: "/admin",
    endpoint: "/api/admin/in-app-market/items",
    access: "admin",
    countLabel: "items and sale windows",
    purpose: "Shows market items, pricing locks, and sale windows that turn earned progress into manageable in-app economy sinks.",
    failureCopy: "Only an existing admin session with reward or settings management may inspect in-app market operations.",
  },
  {
    key: "automation-definitions",
    label: "Automation definitions",
    route: "/admin",
    endpoint: "/api/admin/challenge-automation/challenges",
    access: "admin",
    countLabel: "automation definitions",
    purpose: "Keeps challenge automation visible before a quest, reward, or role loop becomes too farmable to trust.",
    failureCopy: "Only an existing admin session with challenge or reward management may inspect automation definitions.",
  },
];

export const BETA_COUNT_ADMIN_WORKBENCH: BetaCountAdminWorkbenchItem[] = [
  {
    key: "user-need-triage",
    label: "Triage user need",
    question: "Which user needs help, recovery, or a clearer first quest?",
    adminJob: "Review user state, EXP tier, profile setup, wallet or social proof, and recent quest activity before recommending a next step.",
    playerNeed: "New and stalled users need one safe action that explains WTFOS before wallet-heavy or market-heavy loops appear.",
    ownerSurface: "Users + XP Log + Side Quests",
    adminRoute: "/admin",
    adminAccess: "admin",
    playerRoute: "/side-quests",
    playerAccess: "session",
    sourceOfTruth: "/api/admin/users, /api/admin/stats, side quest completion rows, and public profile activity.",
    setupChecklist: [
      "Confirm the user has a stable account identity and no obvious session or wallet mismatch.",
      "Check whether EXP, profile setup, and recent quest state point to a missing first win.",
      "Recommend a side quest or profile route instead of granting authority directly.",
    ],
    decisionGate: "The Count may recommend or message a route, but cannot treat EXP as role authority.",
    proofToInspect: "User row, XP tier, recent completion, profile/social proof, and the route that will create the next visible success.",
    riskControl: "Use manual review notes and capped quest recommendations before increasing reward value or unlocking surfaces.",
    successSignal: "The user completes one safe side quest, understands the next route, and does not need external explanation.",
    relatedRoutes: ["/profile", "/leaderboard", "/notifications", "/mission-control"],
  },
  {
    key: "sidequest-definition",
    label: "Create side quest",
    question: "What small repeatable action should become tomorrow's reason to return?",
    adminJob: "Define criteria, EXP value, optional reward, verifier handle, max completions, and visible recovery copy from the existing admin surface.",
    playerNeed: "Community members need daily actions that are understandable, finite, and connected to another useful route.",
    ownerSurface: "Side Quests + Automation + Rewards",
    adminRoute: "/admin",
    adminAccess: "admin",
    playerRoute: "/side-quests",
    playerAccess: "session",
    sourceOfTruth: "/api/admin/stats, side quest definitions, challenge automation definitions, XP log, and reward ledger rows.",
    setupChecklist: [
      "Name the user-facing action and the existing route that proves it.",
      "Set completion caps, verifier ownership, EXP value, and optional reward state before surfacing it.",
      "Check the quiet fallback so the quest still teaches the next step when data is unavailable.",
    ],
    decisionGate: "The Count can create or promote a side quest only from the existing admin owner surface.",
    proofToInspect: "Definition row, verifier handle, SystemEvent handle, completion cap, EXP delta, reward row, and route handoff.",
    riskControl: "Keep max completions, idempotent reward rows, cooldowns, and manual-review flags visible before repeat incentives scale.",
    successSignal: "A user can complete the side quest, see EXP/reward proof, and discover a related tool without support.",
    relatedRoutes: ["/challenges", "/wtfiam", "/notifications", "/digest"],
  },
  {
    key: "challenge-arc-creation",
    label: "Create challenge arc",
    question: "Which multi-step unlock should connect a role path to real proof?",
    adminJob: "Link existing proof routes, submission expectations, review state, EXP, optional reward, and target role or app gate into one challenge arc.",
    playerNeed: "Creators, builders, collectors, and curators need tool order and proof expectations, not a wall of unrelated app names.",
    ownerSurface: "Challenges + Roles + App Gates",
    adminRoute: "/admin",
    adminAccess: "admin",
    playerRoute: "/challenges",
    playerAccess: "session",
    sourceOfTruth: "/api/admin/challenge-automation/challenges, challenge submissions, role-access matrix, and desktop app gates.",
    setupChecklist: [
      "Choose the puppet path and the existing proof route for each stage.",
      "Define review criteria, EXP, optional rewards, and the role or surface being considered.",
      "Keep the final gate explicit so the challenge cannot grant operator power by accident.",
    ],
    decisionGate: "The Count reviews submissions and grants only the narrow role or route access proven by the challenge.",
    proofToInspect: "Submission state, reviewer note, automation definition, role-access surface, affected app gate, and audit handle.",
    riskControl: "Use proof variety, manual review, reversible role grants, and app-gate audit notes before expanding access.",
    successSignal: "The user understands what was unlocked, why it was earned, and which related tool comes next.",
    relatedRoutes: ["/studio", "/game-studio", "/gallery", "/admin"],
  },
  {
    key: "reward-configuration",
    label: "Configure reward",
    question: "Which reward makes progress useful without turning the loop into a faucet?",
    adminJob: "Inspect payout state, inventory effect, WTFIAM destination, pending settlement, and reward visibility before changing value.",
    playerNeed: "Users need earned progress to become useful, visible, and trustworthy without encouraging farmed behavior.",
    ownerSurface: "Rewards + WTFIAM + Reward Ledger",
    adminRoute: "/admin",
    adminAccess: "admin",
    playerRoute: "/wtfiam",
    playerAccess: "session",
    sourceOfTruth: "/api/admin/reward-ledger?paid=false, WTFIAM inventory rows, reward definitions, and XP/reward logs.",
    setupChecklist: [
      "Confirm the action deserves a reward and has proof beyond a page visit.",
      "Check unpaid rows, inventory impact, and whether the item or WTF sink is understandable.",
      "Set caps and idempotency before increasing payout or repeating the reward.",
    ],
    decisionGate: "The Count may tune reward visibility or settlement only through existing reward/admin controls.",
    proofToInspect: "Reward ledger row, completion source, inventory delta, paid/unpaid state, and user-facing destination.",
    riskControl: "Use caps, idempotent reward keys, audit notes, manual review, and cooldowns before repeat payouts increase.",
    successSignal: "The user sees what they earned, where it lives, and what useful route it unlocks next.",
    relatedRoutes: ["/side-quests", "/challenges", "/marketplace", "/notifications"],
  },
  {
    key: "role-permission-gate",
    label: "Review role or app gate",
    question: "Which role or permission is justified by proof, and which authority must stay locked?",
    adminJob: "Compare EXP, challenge proof, user intent, affected app gate, and abuse signals before granting the narrowest access.",
    playerNeed: "Advanced users need creator, builder, or curator surfaces to open predictably without receiving unrelated admin power.",
    ownerSurface: "Roles + OS Admin + Desktop App Gates",
    adminRoute: "/admin",
    adminAccess: "admin",
    playerRoute: "/mission-control",
    playerAccess: "session",
    sourceOfTruth: "/api/admin/role-access, app gate state, user roles, route access policy, and role-change audit notes.",
    setupChecklist: [
      "Identify the exact surface or role requested and the existing route it controls.",
      "Confirm proof, EXP, and abuse state support the grant without implying admin authority.",
      "Prefer reversible, narrow access over broad roles or hidden privilege bundles.",
    ],
    decisionGate: "Only explicit role/app-gate changes grant access; EXP and levels remain evidence only.",
    proofToInspect: "Role-access matrix, current user roles, affected desktop app gate, proof route, and admin actor.",
    riskControl: "Keep reversible roles, manual review, audit notes, and app-gate checks visible before granting power.",
    successSignal: "The user can open the intended route and still cannot reach unrelated admin or operator surfaces.",
    relatedRoutes: ["/studio", "/game-studio", "/ipfs-pinning", "/settings"],
  },
  {
    key: "market-sink-management",
    label: "Manage market sink",
    question: "Which item, listing, sale window, or spend path should become visible now?",
    adminJob: "Review market item state, sale window, pricing lock, visible supply, related public signal, and promotion route.",
    playerNeed: "Collectors and earners need to understand what exists, why it matters, and when to use rewards or wallet authority.",
    ownerSurface: "In-App Market + Marketplace + Contract Ledger",
    adminRoute: "/admin",
    adminAccess: "admin",
    playerRoute: "/marketplace",
    playerAccess: "session",
    sourceOfTruth: "/api/admin/in-app-market/items, market listings, trade-board signals, contract ledger state, and WTFIAM inventory.",
    setupChecklist: [
      "Separate public preview, signed-in action, wallet authority, and admin configuration.",
      "Check item status, price state, supply, sale timing, and whether the sink matches a real reward loop.",
      "Route public curiosity to Gallery or Marketplace before deeper WTFIAM or contract actions.",
    ],
    decisionGate: "The Count can manage item visibility and sale context, but wallet/contract actions keep their own authority.",
    proofToInspect: "Market item row, listing or trade-board object, sale window, price lock, inventory effect, and promotion event.",
    riskControl: "Use sale windows, caps, audit notes, price locks, and uncertainty copy before increasing market pressure.",
    successSignal: "A user can discover the item, understand the sink, and choose the correct related route without confusion.",
    relatedRoutes: ["/gallery", "/rat-race", "/trade-boards", "/wtfiam"],
  },
  {
    key: "automation-verifier-audit",
    label: "Audit automation",
    question: "Which verifier, trigger, or completion cluster needs review before scaling?",
    adminJob: "Inspect automation definitions, SystemEvent handles, verifier ownership, cooldown, cap, reward delta, and suspicious repeat patterns.",
    playerNeed: "Honest users need trust that automated progress is earned, not farmed or silently broken.",
    ownerSurface: "Automation + System Logs + XP Log",
    adminRoute: "/admin",
    adminAccess: "admin",
    playerRoute: "/challenges",
    playerAccess: "session",
    sourceOfTruth: "/api/admin/challenge-automation/challenges, SystemEvent handles, completion rows, and reward deltas.",
    setupChecklist: [
      "Confirm the verifier has a bounded trigger and clear owner surface.",
      "Inspect completion clusters, repeated proofs, reward rows, and cooldown behavior.",
      "Keep failure and quiet states visible so broken automation does not look like user failure.",
    ],
    decisionGate: "The Count pauses promotion or routes to manual review until automation proof is trustworthy.",
    proofToInspect: "Automation definition, SystemEvent handle, completion cluster, reward delta, cooldown state, and admin review note.",
    riskControl: "Add rate limits, cooldowns, per-user caps, proof variety, or manual review before visibility increases.",
    successSignal: "The automated loop can run repeatedly without confusing users or creating obvious farm paths.",
    relatedRoutes: ["/side-quests", "/notifications", "/digest", "/admin"],
  },
  {
    key: "visibility-communication-review",
    label: "Review visibility",
    question: "Which signal should be surfaced, notified, or hidden until context is clearer?",
    adminJob: "Compare public proof, notification groups, app visibility tier, communication route, and Count-only risk before changing surfacing.",
    playerNeed: "Users need to feel other people are active without being pushed into noisy, risky, or admin-only loops.",
    ownerSurface: "Notifications + App Gates + Communication Surfaces",
    adminRoute: "/admin",
    adminAccess: "admin",
    playerRoute: "/notifications",
    playerAccess: "session",
    sourceOfTruth: "Notification groups, App Visibility Atlas tiers, communication map, public now signals, and admin-only queues.",
    setupChecklist: [
      "Confirm whether the signal is public, protected, unavailable, or admin-only.",
      "Choose the action route, preference route, digest fallback, and quiet copy before surfacing it.",
      "Validate grouping and explanation in the App Visibility Atlas before hiding an existing route.",
    ],
    decisionGate: "The Count can change surfacing policy only through existing gates and never replaces user notification preferences.",
    proofToInspect: "Now signal state, notification group, preference route, digest catch-up path, app tier, and quiet fallback.",
    riskControl: "Use rate limits, quiet rules, role gates, admin-only boundaries, and manual review before increasing attention pressure.",
    successSignal: "The user sees active people, projects, objects, or queues and knows exactly which existing route owns the next step.",
    relatedRoutes: ["/settings", "/digest", "/w", "/mission-control"],
  },
];

export const BETA_COUNT_LIVEOPS_RECIPES: BetaCountLiveopsRecipe[] = [
  {
    key: "starter-witness-recipe",
    label: "Starter witness recipe",
    actor: "new-tezos-user",
    targetLevel: "Visitor to Witness",
    userNeed: "A new user understands that WTFOS exists but needs one safe, low-stakes win before wallet, market, or role pressure appears.",
    expUse: "Use EXP as first-progress evidence only; the level change can recommend Mission Control or Challenges but cannot grant authority.",
    sideQuest: "Create or promote a profile, social, gallery, or message-board setup side quest with capped completions and clear recovery copy.",
    challenge: "Follow with a first community proof challenge that asks the user to find one person, object, room, or route relationship.",
    reward: "Attach a small EXP award and optional WTF reward row only when completion proof is visible and idempotent.",
    roleOrPermission: "Keep the user in witness-level readiness; no creator, market, wallet, or admin permission changes should happen from this recipe.",
    marketOrNotificationEffect: "Use Notifications or Digest as the return cue; do not introduce market pressure until the user has collection or reward context.",
    countDecision: "The Count decides whether the user receives a recommendation, a new side quest, or a recovery route, not a role grant.",
    antiFarmRule: "Completion caps, verifier ownership, cooldowns, and manual-review flags must be visible before repeating the starter reward.",
    playerReturn: "The user should return tomorrow to see the first EXP change, a fresh safe quest, and activity from the people or objects they discovered.",
    noWriteRule: "No beta write: this recipe only opens existing owner surfaces and describes the admin checklist.",
    stages: [
      { key: "detect", label: "Detect need", route: "/leaderboard", access: "public", ownerSurface: "Leaderboard + public EXP proof", countAction: "Confirm public progress exists before asking the user to sign in.", proofRequired: "Leaderboard or profile activity shows other users earning progress without exposing private admin data." },
      { key: "define", label: "Define quest", route: "/side-quests", access: "session", ownerSurface: "Side Quests", countAction: "Shape the starter task around one safe existing route and one clear completion proof.", proofRequired: "Side quest definition has criteria, verifier, completion cap, EXP value, and visible route handoff." },
      { key: "prove", label: "Prove identity", route: "/profile", access: "session", ownerSurface: "Profile readiness", countAction: "Check profile or social readiness before making the next recommendation feel personal.", proofRequired: "Profile state or activity proves the user can receive a follow-up without forcing wallet-heavy action." },
      { key: "reward", label: "Set reward", route: "/wtfiam", access: "session", ownerSurface: "WTFIAM + reward ledger", countAction: "Keep the reward small and explain where earned progress becomes visible.", proofRequired: "Reward or inventory destination is understandable and does not depend on hidden settlement state." },
      { key: "gate", label: "Keep gates", route: "/mission-control", access: "session", ownerSurface: "Mission Control", countAction: "Show the user what opened next while keeping roles, wallets, and admin authority locked.", proofRequired: "Mission Control or route state explains the next safe action without implying permission elevation." },
      { key: "return", label: "Return cue", route: "/notifications", access: "session", ownerSurface: "Notifications + Digest", countAction: "Route the user back to the exact EXP, quest, profile, or activity change created by completion.", proofRequired: "Notification or digest context can explain EXP, quest, profile, or activity changes from existing state." },
    ],
  },
  {
    key: "creator-publish-recipe",
    label: "Creator publish recipe",
    actor: "creator",
    targetLevel: "Regular to Creator Ready",
    userNeed: "A creator has a draft or asset but needs an ordered publishing runway before role or hosted-publishing access expands.",
    expUse: "EXP and levels show sustained creation effort, but proof artifacts and review notes decide whether a creator route should open.",
    sideQuest: "Use a Studio recovery or asset-prep side quest to identify the work, dependency, and intended publishing destination.",
    challenge: "Create a multi-step creator challenge that connects Studio, Broot, Macaroni, IPFS Pinning, WTF Domains, and Skywire proof.",
    reward: "Reward the verified preparation milestone, not every editor visit; optional rewards should point back to WTFIAM or publishing readiness.",
    roleOrPermission: "Trusted creator, Macaroni, pinning, or domain access stays explicit, narrow, reversible, and reviewed by The Count.",
    marketOrNotificationEffect: "Notify or digest creator progress after proof exists; market promotion waits until packaging, pinning, and domain readiness are understandable.",
    countDecision: "The Count decides whether the creator receives feedback, a challenge review, or a narrow route gate change.",
    antiFarmRule: "Require artifact proof, proof variety, reviewer notes, and app-gate audit state before increasing rewards or visibility.",
    playerReturn: "The creator should return to recover the project, finish the next dependency, and see whether review changed the publish path.",
    noWriteRule: "No beta write: beta describes the recipe and opens existing creator/admin surfaces only.",
    stages: [
      { key: "detect", label: "Detect draft", route: "/studio", access: "session", ownerSurface: "Studio workspace", countAction: "Locate the project, draft, or blocked dependency before recommending a specialized tool.", proofRequired: "A Studio project or creator intent exists and can be described without inventing publish state." },
      { key: "define", label: "Define asset task", route: "/tools/broot", access: "session", ownerSurface: "Broot asset prep", countAction: "Turn the draft into a concrete asset-prep side quest with a visible output.", proofRequired: "Asset or canvas output can be inspected as preparation evidence before publishing or role review." },
      { key: "prove", label: "Prove package", route: "/tools/macaroni", access: "role", ownerSurface: "Macaroni packaging", countAction: "Review whether packaging is appropriate before expanding publishing access.", proofRequired: "Macaroni role gate, project package state, or trusted-creator proof explains the next decision." },
      { key: "reward", label: "Reward prep", route: "/wtfiam", access: "session", ownerSurface: "WTFIAM + Rewards", countAction: "Reward verified creator preparation and keep raw tool-opening activity out of the payout loop.", proofRequired: "Reward row references the creator milestone and keeps payout capped or manually reviewed." },
      { key: "gate", label: "Gate publish path", route: "/ipfs-pinning", access: "session", ownerSurface: "IPFS Pinning + Domains", countAction: "Check durable media and domain readiness before surfacing publishing routes.", proofRequired: "Pinning, domain, or hosted-publishing prerequisite is clear enough for review." },
      { key: "return", label: "Return signal", route: "/skywire", access: "public", ownerSurface: "Skywire broadcast", countAction: "Use public promotion only after the creator path has proof and context.", proofRequired: "Skywire can broadcast or follow up on real publish progress instead of placeholder hype." },
    ],
  },
  {
    key: "collector-market-recipe",
    label: "Collector market recipe",
    actor: "collector",
    targetLevel: "Witness to Economy Participant",
    userNeed: "A collector sees objects or market motion but needs context before spending rewards, using wallet authority, or chasing urgency.",
    expUse: "EXP shows collection learning and discovery effort; it should not imply that purchases, trades, or contract actions are safe.",
    sideQuest: "Use an object-discovery side quest that asks the collector to inspect one object, creator, holder, or trade-board signal.",
    challenge: "Create a collector challenge linking Gallery, Hoard, Rat Race, Marketplace, and WTFIAM so urgency has context.",
    reward: "Reward object understanding or curation proof; sink value through visible WTFIAM or market items only after caps are set.",
    roleOrPermission: "Collector readiness can guide recommendations, but wallet, contract, marketplace, and role gates keep their existing authority.",
    marketOrNotificationEffect: "Market rows, sale windows, trade-board objects, and reward sinks become visible only with quiet-state copy and price uncertainty intact.",
    countDecision: "The Count decides whether to promote a listing, tune a market sink, or route the collector back to object proof.",
    antiFarmRule: "Use pricing locks, sale windows, per-user caps, idempotent rewards, and uncertainty copy before increasing collector pressure.",
    playerReturn: "The collector should return for fresh objects, listings, sales, reward destinations, and context from related collector routes.",
    noWriteRule: "No beta write: beta routes The Count to existing market, reward, and collector surfaces without changing market state.",
    stages: [
      { key: "detect", label: "Detect object", route: "/gallery", access: "public", ownerSurface: "Gallery discovery", countAction: "Start with public object or creator context before any spend loop.", proofRequired: "Gallery or public proof explains why the collector should care about the object." },
      { key: "define", label: "Define discovery", route: "/side-quests", access: "session", ownerSurface: "Side Quests", countAction: "Turn object discovery into a capped learning task instead of market pressure.", proofRequired: "Quest criteria ask for object understanding, not a forced purchase or wallet action." },
      { key: "prove", label: "Prove holding", route: "/hoard", access: "session", ownerSurface: "Hoard collection state", countAction: "Check whether the collector has holding, save, or identity context after sign-in.", proofRequired: "Personal collection state or wallet-adjacent context exists without pretending a purchase happened." },
      { key: "reward", label: "Reward context", route: "/wtfiam", access: "session", ownerSurface: "WTFIAM inventory", countAction: "Show where collection progress, rewards, and inventory can be inspected.", proofRequired: "Inventory or reward destination is visible and capped before a spend prompt appears." },
      { key: "gate", label: "Gate market", route: "/marketplace", access: "session", ownerSurface: "Marketplace", countAction: "Separate public preview, signed-in action, wallet authority, and admin market configuration.", proofRequired: "Listing, item, price, or sale window state is clear enough for the collector to choose responsibly." },
      { key: "return", label: "Return urgency", route: "/rat-race", access: "session", ownerSurface: "Rat Race market heat", countAction: "Use heat and sales context as a follow-up, not the first explanation.", proofRequired: "Market motion exists and quiet rows are explained as quiet instead of broken." },
    ],
  },
  {
    key: "builder-surface-recipe",
    label: "Builder surface recipe",
    actor: "builder",
    targetLevel: "Regular to Builder Surface Access",
    userNeed: "A builder has a project idea but needs to prove testable output before app gates or advanced tools expand.",
    expUse: "EXP shows repeated builder participation; output proof and reversible app gates decide access.",
    sideQuest: "Use a project-mapping side quest that asks the builder to identify route purpose, expected user outcome, and test path.",
    challenge: "Create a builder challenge linking Game Studio, Map Lab, Console, Arcade, and W feedback into a proof arc.",
    reward: "Reward testable output, route mapping, or playable proof; do not reward raw prototype creation without an inspectable result.",
    roleOrPermission: "Builder surface access stays narrow and reversible; production operations, contracts, database, and admin power stay locked.",
    marketOrNotificationEffect: "Notify followers or Digest only after output can be inspected; market pressure is not part of the builder unlock recipe.",
    countDecision: "The Count decides whether the requested builder surface matches the proof and whether the app gate should change.",
    antiFarmRule: "Require output proof, route ownership, focused feedback, manual review, and admin notes before EXP turns into access recommendations.",
    playerReturn: "The builder should return for map updates, playtest proof, feedback, and the next narrow tool route.",
    noWriteRule: "No beta write: beta explains route order and opens existing builder/admin surfaces without changing app gates.",
    stages: [
      { key: "detect", label: "Detect project", route: "/game-studio", access: "session", ownerSurface: "Game Studio", countAction: "Confirm the builder has a concrete project or template to evaluate.", proofRequired: "Project intent, template, or build target exists and can be named." },
      { key: "define", label: "Define route map", route: "/map-lab", access: "session", ownerSurface: "Map Lab route map", countAction: "Ask the builder to map the route, dependency, or user journey before deeper access.", proofRequired: "Map output explains where the project sits in WTFOS and which user-facing route should carry the next test." },
      { key: "prove", label: "Prove output", route: "/console", access: "session", ownerSurface: "Console output proof", countAction: "Inspect whether the output can be run, tested, or demonstrated.", proofRequired: "Console or test proof shows a visible result rather than only intent." },
      { key: "reward", label: "Reward proof", route: "/challenges", access: "session", ownerSurface: "Challenges review", countAction: "Attach EXP or review only to the demonstrated builder milestone.", proofRequired: "Challenge submission, proof route, and reviewer note connect reward to output." },
      { key: "gate", label: "Gate surface", route: "/admin", access: "admin", ownerSurface: "Admin app gates", countAction: "Grant only the narrow builder surface proven by the project and keep the change reversible.", proofRequired: "Role-access row, affected app gate, admin actor, and reversible audit note are visible." },
      { key: "return", label: "Return feedback", route: "/w", access: "session", ownerSurface: "W community feedback", countAction: "Route feedback to the community surface after proof exists so the builder loop keeps a user audience.", proofRequired: "Discussion or feedback path exists so builder work does not become isolated." },
    ],
  },
  {
    key: "curator-signal-recipe",
    label: "Curator signal recipe",
    actor: "curator",
    targetLevel: "Witness to Curator Readiness",
    userNeed: "A curator finds valuable work but needs a proof trail before nominations, rewards, or amplification scale.",
    expUse: "EXP reflects repeated useful discovery; nomination quality and review notes decide visibility or role readiness.",
    sideQuest: "Use a curation side quest that asks for the object, creator, why it matters, and the route where others can verify it.",
    challenge: "Create a curator challenge linking Gallery, CRP nomination, Skywire, W discussion, and TV or leaderboard proof.",
    reward: "Reward useful signal only when the proof is reviewable and capped; avoid rewarding repeated low-effort nominations.",
    roleOrPermission: "Curator roles and nomination scale require explicit review; public amplification is not automatic.",
    marketOrNotificationEffect: "Notify or broadcast curated signal only when context is clear and quiet fallback copy prevents spam pressure.",
    countDecision: "The Count decides whether the signal should be nominated, discussed, broadcast, rewarded, or kept quiet.",
    antiFarmRule: "Use nomination caps, proof quality checks, duplicate review, manual notes, and cooldowns before scaling rewards.",
    playerReturn: "The curator should return for new art, nomination feedback, public reactions, and discussion from related surfaces.",
    noWriteRule: "No beta write: beta explains the curation loop and opens existing curation, social, and admin routes only.",
    stages: [
      { key: "detect", label: "Detect signal", route: "/gallery", access: "public", ownerSurface: "Gallery signal", countAction: "Start with the public object or creator that makes the signal worth reviewing.", proofRequired: "Object, creator, collection, or public proof can be inspected by another user." },
      { key: "define", label: "Define reason", route: "/side-quests", access: "session", ownerSurface: "Side Quests", countAction: "Ask for the curation reason and verification route before reward or amplification.", proofRequired: "Quest proof names what matters and where someone else can verify it." },
      { key: "prove", label: "Prove nomination", route: "/crp-nominate", access: "session", ownerSurface: "CRP Nomination", countAction: "Check whether nomination context exists before increasing visibility.", proofRequired: "Nomination draft or submission explains the public value and review criteria." },
      { key: "reward", label: "Reward signal", route: "/wtfiam", access: "session", ownerSurface: "WTFIAM + Rewards", countAction: "Reward useful discovery only after duplicate and quality checks.", proofRequired: "Reward row references reviewable signal proof and keeps payout capped." },
      { key: "gate", label: "Gate amplification", route: "/admin", access: "admin", ownerSurface: "Admin visibility controls", countAction: "Decide whether this signal deserves more visibility, a role note, or quiet handling.", proofRequired: "Admin review note, duplicate check, and route visibility decision are explicit." },
      { key: "return", label: "Return discussion", route: "/w", access: "session", ownerSurface: "W + Skywire", countAction: "Route public context to social discussion or Skywire only after proof exists.", proofRequired: "Discussion, broadcast, or quiet fallback is tied to the same source object." },
    ],
  },
  {
    key: "community-return-recipe",
    label: "Community return recipe",
    actor: "community-member",
    targetLevel: "Witness to Regular",
    userNeed: "A community member sees signs of people but needs one healthy social action and a reason to come back without notification noise.",
    expUse: "EXP can reward meaningful participation, but social proof, rate limits, and moderation context decide whether the loop scales.",
    sideQuest: "Use a people-now side quest that asks the user to find a post, room, event, or digest item and take one low-risk action.",
    challenge: "Create a community challenge linking W, WTF LIVE, WIM, Calendar, Notifications, Digest, and moderation review.",
    reward: "Reward participation only when the action is meaningful, capped, and connected to an existing social route.",
    roleOrPermission: "Community activity may unlock recommendations or challenge progress, not moderation power or admin authority.",
    marketOrNotificationEffect: "Use notifications and digest as recovery surfaces; tune attention pressure before adding more delivery or assistant behavior.",
    countDecision: "The Count decides whether the social loop is surfaced, digested, rate-limited, or kept quiet for review.",
    antiFarmRule: "Use rate limits, proof variety, moderation review, per-user caps, and quiet rules before rewarding repeat participation.",
    playerReturn: "The user should return for replies, rooms, scheduled moments, digest catch-up, and people they can recognize.",
    noWriteRule: "No beta write: beta opens existing social, notification, and admin surfaces without sending messages or changing preferences.",
    stages: [
      { key: "detect", label: "Detect people", route: "/w", access: "session", ownerSurface: "W Feed people proof", countAction: "Confirm the user can see people, posts, or shared motion before recommending a social action.", proofRequired: "Feed or people-discovery proof shows other users exist and are doing something current." },
      { key: "define", label: "Define action", route: "/side-quests", access: "session", ownerSurface: "Side Quests", countAction: "Make the task one healthy social action, not a vague engagement target.", proofRequired: "Quest criteria identify the post, room, event, or digest item and the allowed action." },
      { key: "prove", label: "Prove presence", route: "/live", access: "session", ownerSurface: "WTF LIVE presence", countAction: "Use room or event presence only when it is current and understandable.", proofRequired: "Room, participant, event, or presence proof exists and quiet state is not treated as failure." },
      { key: "reward", label: "Reward action", route: "/challenges", access: "session", ownerSurface: "Challenges + Rewards", countAction: "Reward social participation after proof quality and moderation risk are checked.", proofRequired: "Challenge submission or completion shows meaningful interaction rather than repeated low-effort activity." },
      { key: "gate", label: "Gate attention", route: "/settings", access: "session", ownerSurface: "Settings + Notifications", countAction: "Keep preference control in existing settings before increasing notification pressure.", proofRequired: "Settings and notification routes explain how the user can tune or mute the loop." },
      { key: "return", label: "Return catch-up", route: "/digest", access: "session", ownerSurface: "Digest catch-up", countAction: "Give the user a recovery surface when they miss rooms, replies, or activity.", proofRequired: "Digest can summarize missed social, progress, and notification context without creating a second notification system." },
    ],
  },
];

export const BETA_COUNT_LIVEOPS_COMMANDS: BetaCountLiveopsCommand[] = [
  {
    key: "first-quest-triage",
    label: "Route a user to the first useful quest",
    route: "/side-quests",
    access: "session",
    ownerSurface: "Side Quests + Users + XP Log",
    trigger: "A new or stalled user has no clear next step after public discovery.",
    adminAction: "Select a low-risk quest, confirm the criteria, EXP award, and completion cap, then point the user to that route.",
    playerOutcome: "The user gets one safe win before wallet-heavy or market-heavy loops.",
    auditProof: "Quest completion row, XP log entry, and notification or mission-control state.",
    riskControl: "Keep max completions, auto-verify handles, and manual-review flags visible before reward value is attached.",
  },
  {
    key: "challenge-arc",
    label: "Build a multi-step unlock challenge",
    route: "/challenges",
    access: "session",
    ownerSurface: "Challenges + Roles + App Gates",
    trigger: "A creator, builder, collector, or curator has proven enough activity to deserve a guided unlock arc.",
    adminAction: "Chain the existing apps, proof requirement, review state, EXP value, optional reward, and target role into one challenge.",
    playerOutcome: "Advanced tools feel earned and understandable instead of randomly gated.",
    auditProof: "Submission state, reviewer decision, challenge reward row, and role or app-gate change.",
    riskControl: "EXP can suggest readiness, but explicit roles and permissions remain the authority boundary.",
  },
  {
    key: "reward-economy",
    label: "Tune rewards and market sinks",
    route: "/wtfiam",
    access: "session",
    ownerSurface: "Rewards + WTFIAM + In-App Market",
    trigger: "Users are earning WTF or items but do not have a meaningful spend, redeem, or inventory path.",
    adminAction: "Review reward rows, item inventory, pricing locks, sale windows, and market availability before changing payouts.",
    playerOutcome: "Progress has a useful destination, and earned value feeds collection identity.",
    auditProof: "Reward ledger row, inventory row, market item state, and payment or redemption history.",
    riskControl: "Use caps, idempotency keys, and sale windows before increasing repeatable reward value.",
  },
  {
    key: "role-permission-review",
    label: "Grant role or app access from proof",
    route: "/admin",
    access: "admin",
    ownerSurface: "Admin Roles + Desktop Apps + Start Menu Gates",
    trigger: "A user reaches a readiness threshold but should not receive operator power by accident.",
    adminAction: "Compare EXP, challenge proof, abuse signals, and app-gate state before granting the narrowest role or surface access.",
    playerOutcome: "The user unlocks the right tool without inheriting unrelated authority.",
    auditProof: "Role change audit entry, affected app gate, admin actor, and user-visible route availability.",
    riskControl: "Admin authority is explicit and reversible; EXP never becomes a permission grant by itself.",
  },
  {
    key: "market-management",
    label: "Manage in-app market availability",
    route: "/marketplace",
    access: "session",
    ownerSurface: "Marketplace + Contract Ledger + Skywire Market Feed",
    trigger: "A listing, trade-board object, sale window, or reward sink needs public context.",
    adminAction: "Check item status, price state, visible supply, related public signal, and promotion path before surfacing it.",
    playerOutcome: "Collectors understand what exists, why it matters, and where to go next.",
    auditProof: "Market item row, listing or trade-board signal, contract ledger state, and promotion event.",
    riskControl: "Do not hide uncertainty; separate public preview, signed-in action, and wallet/contract authority.",
  },
  {
    key: "abuse-loop-audit",
    label: "Audit a farmable loop before scaling it",
    route: "/admin",
    access: "admin",
    ownerSurface: "Automation + XP Log + Rewards + System Logs",
    trigger: "Completions, EXP spikes, repeated proofs, or reward rows cluster around one task.",
    adminAction: "Inspect trigger source, verifier, cooldown, cap, actor, reward row, and downstream role or item change.",
    playerOutcome: "Honest users keep trusting progression and unlocks.",
    auditProof: "SystemEvent handle, completion row, reward delta, and admin review note.",
    riskControl: "Add cooldowns, per-user caps, proof variety, or manual review before increasing visibility.",
  },
];

export const BETA_NOTIFICATION_GROUPS: BetaNotificationGroup[] = [
  {
    key: "social",
    label: "Social attention",
    route: "/notifications",
    access: "session",
    purpose: "Replies, mentions, follows, DMs, and buddy actions prove other people noticed the user.",
    userQuestion: "Who noticed me?",
    returnLoop: "Open Notifications, then choose W, WIM, Mail, or Digest as the right reply surface.",
  },
  {
    key: "progress",
    label: "Progress and unlocks",
    route: "/side-quests",
    access: "session",
    purpose: "Quest, challenge, EXP, reward, and role-readiness changes make discovery feel like a manageable game.",
    userQuestion: "What did I earn or unlock?",
    returnLoop: "Open Side Quests or Challenges before deeper creator, collector, or economy steps.",
  },
  {
    key: "live",
    label: "Live and scheduled moments",
    route: "/live",
    access: "session",
    purpose: "Rooms, stages, events, and attendance create time-bound collaboration.",
    userQuestion: "Is something happening now?",
    returnLoop: "Open WTF LIVE or Calendar when a room, stage, or event is active soon.",
  },
  {
    key: "creator",
    label: "Creator recovery",
    route: "/studio",
    access: "session",
    purpose: "Drafts, pin jobs, domain readiness, publishing states, and creator updates stop work from going silent.",
    userQuestion: "What project needs me?",
    returnLoop: "Open Studio, IPFS Pinning, or Skywire when a project needs recovery or promotion.",
  },
  {
    key: "market",
    label: "Collector and market motion",
    route: "/rat-race",
    access: "session",
    purpose: "Listings, sales, trade-board objects, and market signals create collector curiosity without making speculation the whole product.",
    userQuestion: "What moved in the market?",
    returnLoop: "Open Rat Race, Marketplace, Trade Boards, or WTFIAM depending on the signal.",
  },
  {
    key: "admin",
    label: "Count admin attention",
    route: "/admin",
    access: "admin",
    purpose: "Quest review, challenge review, reward audit, role changes, app gates, and market operations stay explicit for The Count.",
    userQuestion: "What needs operator review?",
    returnLoop: "Open Admin only through the strict admin gate; EXP never grants this authority.",
  },
];

export const BETA_NOTIFICATION_EVENTS: BetaNotificationEvent[] = [
  { label: "Someone replied, mentioned, followed, or messaged you", priority: "curiosity", groupKey: "social", route: "/notifications", access: "session", retentionValue: "Proves other people noticed the user." },
  { label: "A side quest, challenge, EXP level, or reward state changed", priority: "progress", groupKey: "progress", route: "/side-quests", access: "session", retentionValue: "Makes unlock progress feel alive and manageable." },
  { label: "A live room, stage, or scheduled event is active soon", priority: "presence", groupKey: "live", route: "/live", access: "session", retentionValue: "Creates time-bound collaboration and attendance." },
  { label: "A creator you follow published, pinned, or promoted work", priority: "discovery", groupKey: "creator", route: "/gallery", access: "public", retentionValue: "Turns other people's progress into a browseable reason to return." },
  { label: "A token, listing, sale, or market signal changed", priority: "market", groupKey: "market", route: "/rat-race", access: "session", retentionValue: "Creates collector urgency without making speculation the whole product." },
  { label: "A draft, pin, domain, or publish job needs action", priority: "recovery", groupKey: "creator", route: "/studio", access: "session", retentionValue: "Stops creator work from disappearing into silent background state." },
  { label: "A quest, challenge, reward, role, or market operation needs review", priority: "admin", groupKey: "admin", route: "/admin", access: "admin", retentionValue: "Keeps liveops fair without exposing admin authority to normal users." },
];

export const BETA_NOTIFICATION_CONTROL_GUIDE: BetaNotificationControlGuide[] = [
  {
    key: "social",
    label: "Social attention controls",
    signal: "Replies, mentions, follows, DMs, and buddy actions should create curiosity without becoming noise.",
    actionRoute: "/notifications",
    actionAccess: "session",
    preferenceRoute: "/settings",
    preferenceAccess: "session",
    digestRoute: "/digest",
    digestAccess: "session",
    sourceContract: "/api/notifications/preferences",
    userControl: "Users act from Notification Center, tune channels from System Settings, and can fall back to Digest when they missed a social burst.",
    quietRule: "If social attention is quiet, keep the group visible and route to W Feed, WIM, or Digest instead of pretending the community is empty.",
  },
  {
    key: "progress",
    label: "Progress control loop",
    signal: "Side quest completions, challenge states, EXP tiers, rewards, and role-readiness changes should tell users what unlocked.",
    actionRoute: "/side-quests",
    actionAccess: "session",
    preferenceRoute: "/settings",
    preferenceAccess: "session",
    digestRoute: "/digest",
    digestAccess: "session",
    sourceContract: "/api/notifications/preferences",
    userControl: "Users act from Side Quests or Challenges, adjust notification preferences from System Settings, and review missed progress from Digest.",
    quietRule: "If progress is quiet, guide the user toward one small quest or challenge before surfacing advanced creator, collector, or economy routes.",
  },
  {
    key: "live",
    label: "Live moment controls",
    signal: "Rooms, stages, events, and attendance reminders should make time-bound collaboration easy to notice.",
    actionRoute: "/live",
    actionAccess: "session",
    preferenceRoute: "/settings",
    preferenceAccess: "session",
    digestRoute: "/digest",
    digestAccess: "session",
    sourceContract: "/api/notifications/preferences",
    userControl: "Users act from WTF LIVE or Calendar, tune notification delivery from System Settings, and catch missed live context in Digest.",
    quietRule: "If no live moment is active, keep Calendar and scheduled rooms visible so users know when to return instead of abandoning the route.",
  },
  {
    key: "creator",
    label: "Creator recovery controls",
    signal: "Drafts, pin jobs, domain readiness, publish states, and creator updates should pull stalled work back into view.",
    actionRoute: "/studio",
    actionAccess: "session",
    preferenceRoute: "/settings",
    preferenceAccess: "session",
    digestRoute: "/digest",
    digestAccess: "session",
    sourceContract: "/api/notifications/preferences",
    userControl: "Users act from Studio, IPFS Pinning, WTF Domains, or Skywire, then adjust notification preferences from System Settings.",
    quietRule: "If creator recovery is quiet, route to the creator trail and explain the next publish step rather than inventing a new assistant.",
  },
  {
    key: "market",
    label: "Market motion controls",
    signal: "Listings, sales, trade-board objects, market moves, and reward-spend prompts should create collector curiosity.",
    actionRoute: "/rat-race",
    actionAccess: "session",
    preferenceRoute: "/settings",
    preferenceAccess: "session",
    digestRoute: "/digest",
    digestAccess: "session",
    sourceContract: "/api/notifications/preferences",
    userControl: "Users act from Rat Race, Marketplace, Trade Boards, or WTFIAM and tune market notifications from System Settings.",
    quietRule: "If market motion is quiet, show public object proof and collection context before pushing wallet-heavy or speculative action.",
  },
  {
    key: "admin",
    label: "Count operator controls",
    signal: "Quest review, challenge review, rewards, roles, app gates, and market operations should stay visible only to explicit admins.",
    actionRoute: "/admin",
    actionAccess: "admin",
    preferenceRoute: "/settings",
    preferenceAccess: "session",
    digestRoute: "/digest",
    digestAccess: "session",
    sourceContract: "/api/notifications/preferences",
    userControl: "The Count acts from Admin after the strict admin gate, while normal users only see their own notification preferences and digest.",
    quietRule: "If operator alerts are quiet, keep admin attention hidden from normal users and rely on strict-admin Count summary cards for review.",
  },
];

export const BETA_ATTENTION_QUEUE: BetaAttentionQueueItem[] = [
  {
    key: "first-safe-action",
    label: "First safe action",
    audience: "new-tezos-user",
    cadence: "now",
    route: "/side-quests",
    access: "session",
    question: "I just arrived. What can I safely do first?",
    signalKeys: ["xp-leaders", "reward-earners", "notifications"],
    whyItMatters: "New users need a small visible win before wallet-heavy, market-heavy, or role-heavy routes feel trustworthy.",
    action: "Start with one setup side quest, then check Profile and Challenges only after the first EXP proof appears.",
    quietFallback: "If personal notifications are locked or quiet, keep public EXP and reward proof visible and send the user to sign in for Side Quests.",
    countControl: "The Count manages first-quest criteria, completion caps, EXP value, reward flags, and abuse review from existing admin surfaces.",
    relatedRoutes: ["/profile", "/challenges", "/leaderboard"],
  },
  {
    key: "people-moving",
    label: "People moving now",
    audience: "community-member",
    cadence: "now",
    route: "/w",
    access: "session",
    question: "Where are the people?",
    signalKeys: ["profile-activity", "live-room", "calendar-events"],
    whyItMatters: "Visible people, rooms, and scheduled moments keep WTFOS from feeling like a private tool pile.",
    action: "Open W when activity is social, WTF LIVE when presence is time-bound, or Calendar when the next reason to return is scheduled.",
    quietFallback: "If live presence is quiet, route to Calendar or Digest so the user knows when activity is expected instead of assuming nobody exists.",
    countControl: "The Count only steps in for abuse, farmable social loops, or role escalation; normal social discovery remains user-owned.",
    relatedRoutes: ["/live", "/calendar", "/digest"],
  },
  {
    key: "collector-heat",
    label: "Collector heat check",
    audience: "collector",
    cadence: "next",
    route: "/gallery",
    access: "public",
    question: "What object, listing, or trade signal deserves a look?",
    signalKeys: ["market-trade-board", "market-listings", "market-heat"],
    whyItMatters: "Collectors need market motion and object context, but the first inspection step should stay low-risk and understandable.",
    action: "Start from Gallery or Trade Boards, then use Rat Race, Hoard, Marketplace, or WTFIAM when the user wants depth.",
    quietFallback: "If market heat is protected or quiet, keep the public object proof visible and explain that wallet or session routes own deeper action.",
    countControl: "The Count manages market item availability, pricing locks, sale windows, reward sinks, and suspicious repeated market loops.",
    relatedRoutes: ["/trade-boards", "/rat-race", "/wtfiam"],
  },
  {
    key: "creator-recovery",
    label: "Creator recovery",
    audience: "creator",
    cadence: "next",
    route: "/studio",
    access: "session",
    question: "What project needs one next step?",
    signalKeys: ["tv-channels", "console-discovery", "notifications"],
    whyItMatters: "Creator and builder work loses momentum when drafts, pinning, domains, publishing, and promotion are separated by app names.",
    action: "Open Studio, then follow the existing route to Broot, Macaroni, IPFS Pinning, WTF Domains, or Skywire based on the blocked step.",
    quietFallback: "If creator notifications are quiet, use public channel or console proof to show that publishing and project output still have a visible destination.",
    countControl: "The Count reviews proof, creator roles, app gates, and challenge submissions before granting or expanding creator access.",
    relatedRoutes: ["/tools/broot", "/ipfs-pinning", "/skywire"],
  },
  {
    key: "play-builder-output",
    label: "Play or inspect output",
    audience: "builder",
    cadence: "next",
    route: "/arcade",
    access: "public",
    question: "What can I play, test, or inspect?",
    signalKeys: ["arcade-discovery", "arcade-recent", "console-discovery"],
    whyItMatters: "Builder work becomes meaningful when normal users can reach playable output and recent activity proves it is not abandoned.",
    action: "Open Arcade for playable proof, Console for builder output, or Game Studio when the user needs to move the project forward.",
    quietFallback: "If recent play is quiet, keep Console discovery visible and route builders to Game Studio or Map Lab rather than hiding experimental work.",
    countControl: "The Count keeps experimental builder routes clearly gated and reviews abuse or app-gate changes before expanding access.",
    relatedRoutes: ["/console", "/game-studio", "/map-lab"],
  },
  {
    key: "tomorrow-catchup",
    label: "Tomorrow catch-up",
    audience: "all-users",
    cadence: "tomorrow",
    route: "/digest",
    access: "session",
    question: "What should bring me back tomorrow?",
    signalKeys: ["notifications", "w-feed", "calendar-events"],
    whyItMatters: "A digestable return ritual turns scattered replies, rewards, rooms, events, and system work into one manageable daily check.",
    action: "Open Digest after Notifications when the user has been away, then choose the owning route for replies, quests, rooms, or creator work.",
    quietFallback: "If the inbox is quiet, keep Calendar and public activity proof visible so tomorrow still has a scheduled reason to exist.",
    countControl: "The Count should not replace personal digests; admin review stays in Admin and only affects policy or abuse queues.",
    relatedRoutes: ["/notifications", "/mission-control", "/calendar"],
  },
  {
    key: "count-hot-queue",
    label: "Count hot queue",
    audience: "the-count",
    cadence: "admin",
    route: "/admin",
    access: "admin",
    question: "What needs operator review before it becomes a farmable loop?",
    signalKeys: ["notifications", "xp-leaders", "reward-earners"],
    whyItMatters: "Progression only feels fair when rewards, roles, market sinks, and challenge automation remain auditable and reversible.",
    action: "Open Admin as The Count, compare user state, quest or challenge proof, reward rows, role gates, market operations, and automation definitions.",
    quietFallback: "If the admin queue is quiet, leave admin attention hidden from normal users and continue watching public EXP and reward proof.",
    countControl: "Explicit admin role is required; EXP and levels are review evidence, never permission grants or operator authority.",
    relatedRoutes: ["/side-quests", "/challenges", "/wtfiam"],
  },
];

export const BETA_PERSONA_COMMAND_CENTER: BetaPersonaCommand[] = [
  {
    key: "new-tezos-user",
    label: "New user command",
    question: "Can I get one safe win without understanding every app?",
    promise: "One public proof route, one side quest, one identity check, one return surface, and one Count review boundary.",
    attentionKey: "first-safe-action",
    dailyLoopKey: "quest",
    countReview: "The Count watches first-quest criteria, EXP value, reward rows, and abuse caps without turning EXP into authority.",
    success: "The user can explain WTFOS, complete or choose one manageable quest, and knows where to return tomorrow.",
    steps: [
      { key: "orient", label: "See proof", route: "/leaderboard", access: "public", action: "Start with visible EXP, holders, and reward proof before any wallet-heavy path.", proof: "Leaderboards prove other users are already progressing." },
      { key: "act", label: "Take one quest", route: "/side-quests", access: "session", action: "Open Side Quests and pick a low-risk setup action.", proof: "Side quest state is the first playable discovery layer." },
      { key: "prove", label: "Make identity legible", route: "/profile", access: "session", action: "Confirm profile or social readiness after the first action.", proof: "Profile turns the account from anonymous visitor into a recognizable WTFOS user." },
      { key: "return", label: "Check what changed", route: "/notifications", access: "session", action: "Use Notifications or Digest as the recovery surface after completion.", proof: "Return signals explain why tomorrow is not a blank slate." },
      { key: "count", label: "Count review", route: "/admin", access: "admin", action: "Review starter quest health only from existing admin surfaces.", proof: "Admin gates keep operator review separate from player progress." },
    ],
  },
  {
    key: "collector",
    label: "Collector command",
    question: "What is worth collecting, and what should I inspect next?",
    promise: "Object proof flows into collection context, market motion, inventory, and reward-spend surfaces without forcing speculation first.",
    attentionKey: "collector-heat",
    dailyLoopKey: "object",
    countReview: "The Count watches market availability, pricing locks, reward sinks, and repeated collector-loop completions.",
    success: "The collector can find an object, understand why it matters, and discover Gallery, Hoard, Rat Race, Marketplace, or WTFIAM as related tools.",
    steps: [
      { key: "orient", label: "Inspect object", route: "/gallery", access: "public", action: "Start from Gallery or public object proof.", proof: "Gallery is the low-risk inspection route before deeper collection state." },
      { key: "act", label: "Earn context", route: "/side-quests", access: "session", action: "Turn object discovery into a quest or challenge action.", proof: "Quest completion connects browsing to EXP and return loops." },
      { key: "prove", label: "Check holdings", route: "/hoard", access: "session", action: "Inspect owned or wallet-linked collection context.", proof: "Hoard explains why objects and wallets matter after sign-in." },
      { key: "return", label: "Follow motion", route: "/rat-race", access: "session", action: "Use Rat Race or Marketplace when market motion becomes the next question.", proof: "Market routes own urgency, listings, and deeper collector context." },
      { key: "count", label: "Count review", route: "/admin", access: "admin", action: "Review market loops only through existing admin controls.", proof: "Admin review keeps collector rewards and sinks auditable." },
    ],
  },
  {
    key: "creator",
    label: "Creator command",
    question: "Which creator tool comes next, and how do I avoid losing momentum?",
    promise: "Studio, Broot, Macaroni, IPFS Pinning, and promotion become one route-owned pipeline.",
    attentionKey: "creator-recovery",
    dailyLoopKey: "project",
    countReview: "The Count watches creator proof, challenge submissions, role readiness, and affected app gates before granting access.",
    success: "The creator can open Studio, discover the next creation tool, understand publishing readiness, and find the promotion route.",
    steps: [
      { key: "orient", label: "Open workspace", route: "/studio", access: "session", action: "Start or recover a project inside Studio before choosing specialized creation tools.", proof: "Studio is the creator home base for drafts, assets, and project recovery." },
      { key: "act", label: "Prepare asset", route: "/tools/broot", access: "session", action: "Move the project through a concrete creation step.", proof: "Broot turns intent into an editable artifact." },
      { key: "prove", label: "Package work", route: "/tools/macaroni", access: "session", action: "Stage or package work when publishing is the next dependency.", proof: "Macaroni shows whether a drop or packaged output is ready." },
      { key: "return", label: "Publish and promote", route: "/ipfs-pinning", access: "session", action: "Pin or verify durable media, then route to domains or Skywire.", proof: "IPFS Pinning is the durability checkpoint before promotion." },
      { key: "count", label: "Count review", route: "/admin", access: "admin", action: "Review creator roles and app-gate changes in Admin.", proof: "Explicit roles and permissions remain the unlock authority." },
    ],
  },
  {
    key: "builder",
    label: "Builder command",
    question: "Where does this experiment become testable or playable?",
    promise: "Builder work moves from project surface to map, console proof, playable output, and feedback.",
    attentionKey: "play-builder-output",
    dailyLoopKey: "project",
    countReview: "The Count watches experimental app gates, role changes, and abuse risk before expanding builder access.",
    success: "The builder can find Game Studio, map relationships, inspect output, and discover Arcade or W as the downstream feedback path.",
    steps: [
      { key: "orient", label: "Choose project", route: "/game-studio", access: "session", action: "Open a builder project or template before mapping the downstream output.", proof: "Game Studio gives builder intent a home base." },
      { key: "act", label: "Map route", route: "/map-lab", access: "session", action: "Map the project, system, or workflow relationship.", proof: "Map Lab turns experiments into navigable structure." },
      { key: "prove", label: "Inspect output", route: "/console", access: "session", action: "Use Console to inspect or test surfaced output.", proof: "Console proves there is something to run, inspect, or connect." },
      { key: "return", label: "Make playable", route: "/arcade", access: "public", action: "Send playable output toward Arcade or feedback loops.", proof: "Arcade lets normal users discover builder work." },
      { key: "count", label: "Count review", route: "/admin", access: "admin", action: "Review builder roles and experimental gates in Admin.", proof: "Experimental power stays permissioned and reversible." },
    ],
  },
  {
    key: "curator",
    label: "Curator command",
    question: "How does discovery become public contribution?",
    promise: "A found object becomes curation proof, nomination or share intent, and social impact.",
    attentionKey: "collector-heat",
    dailyLoopKey: "object",
    countReview: "The Count watches nomination caps, repeated proofs, curator role readiness, and review notes before surfacing more power.",
    success: "The curator can discover work, understand how to nominate or share it, and see where community proof lives.",
    steps: [
      { key: "orient", label: "Find work", route: "/gallery", access: "public", action: "Start from a public object, creator, or collection.", proof: "Gallery provides inspectable proof without requiring a role first." },
      { key: "act", label: "Record reason", route: "/side-quests", access: "session", action: "Use a curation quest to capture why the work matters.", proof: "Side Quests turn taste into reviewable evidence." },
      { key: "prove", label: "Nominate", route: "/crp-nominate", access: "session", action: "Use CRP nomination when the route and gate are available.", proof: "Nomination turns discovery into contribution." },
      { key: "return", label: "Share signal", route: "/skywire", access: "public", action: "Broadcast or follow the signal through Skywire and W.", proof: "Social proof shows curation had public impact." },
      { key: "count", label: "Count review", route: "/admin", access: "admin", action: "Review curator readiness and nomination quality in Admin.", proof: "Admin review prevents rewarded curation from becoming spam." },
    ],
  },
  {
    key: "community-member",
    label: "Community command",
    question: "Where are the people, and what can I do with them?",
    promise: "Visible people, live rooms, direct follow-up, events, and digest recovery become one community loop.",
    attentionKey: "people-moving",
    dailyLoopKey: "people",
    countReview: "The Count watches abuse, farmable social loops, and role escalation while normal social discovery stays user-owned.",
    success: "The community member can find people, join or inspect activity, follow up directly, and know where to catch up later.",
    steps: [
      { key: "orient", label: "See people", route: "/w", access: "session", action: "Open W Feed when social motion is the question.", proof: "W makes WTFOS feel inhabited by showing posts, people, and social proof." },
      { key: "act", label: "Join live", route: "/live", access: "session", action: "Use WTF LIVE when the signal is time-bound.", proof: "Rooms and stages make presence concrete." },
      { key: "prove", label: "Follow up", route: "/wim", access: "session", action: "Use WIM when activity becomes a personal follow-up.", proof: "Direct follow-up turns ambient activity into relationship." },
      { key: "return", label: "Catch up", route: "/digest", access: "session", action: "Use Digest when the user missed replies, rooms, rewards, or system work.", proof: "Digest keeps quiet periods from feeling empty." },
      { key: "count", label: "Count review", route: "/admin", access: "admin", action: "Review only abuse or operator-owned social loops in Admin.", proof: "Admin attention stays hidden from normal users unless they have the explicit gate." },
    ],
  },
];

export const BETA_WAYFINDER_ACTIONS: BetaWayfinderAction[] = [
  {
    key: "safe-first-win",
    label: "Safe first win",
    question: "I just arrived. What should I do first?",
    sectionId: "beta-paths",
    route: "/side-quests",
    access: "session",
    persona: "new-tezos-user",
    atlasPersona: "new-tezos-user",
    atlasStage: "start",
    atlasTier: 1,
    proof: "The new-user command path starts with public proof, then one low-risk Side Quests action before wallet-heavy or market-heavy routes.",
    nextAction: "Show the New Tezos User command stack and keep the first useful tool tied to existing Side Quests and Profile gates.",
  },
  {
    key: "people-now",
    label: "People now",
    question: "Where are the active people?",
    sectionId: "beta-now",
    route: "/w",
    access: "session",
    persona: "community-member",
    atlasPersona: "community-member",
    atlasStage: "connect",
    proof: "Read-only now signals and the community command route make profile activity, rooms, events, and W visible before the user hunts through app names.",
    nextAction: "Jump to current people/activity proof, then route to W, WTF LIVE, Calendar, Digest, or WIM through existing gates.",
  },
  {
    key: "object-hunt",
    label: "Object hunt",
    question: "What art, collection, or market signal is worth inspecting?",
    sectionId: "beta-proof",
    route: "/gallery",
    access: "public",
    persona: "collector",
    atlasPersona: "collector",
    atlasStage: "collect",
    proof: "The public proof board composes trade-board objects and market listings into a safe Gallery-first inspection path.",
    nextAction: "Show collector proof, then route to Gallery, Hoard, Rat Race, Marketplace, or WTFIAM when the user wants depth.",
  },
  {
    key: "creator-runway",
    label: "Creator runway",
    question: "Which creator tool comes next?",
    sectionId: "beta-paths",
    route: "/studio",
    access: "session",
    persona: "creator",
    atlasPersona: "creator",
    atlasStage: "create",
    atlasQuery: "Studio",
    proof: "The creator command connects Studio, Broot, Macaroni, IPFS Pinning, WTF Domains, and Skywire as one route-owned pipeline.",
    nextAction: "Select the Creator command stack and filter the atlas toward existing creator surfaces without changing any tool behavior.",
  },
  {
    key: "builder-output",
    label: "Builder output",
    question: "What can I play, test, or inspect?",
    sectionId: "beta-proof",
    route: "/arcade",
    access: "public",
    persona: "builder",
    atlasPersona: "builder",
    atlasStage: "play",
    proof: "Arcade and Console public proof show playable or inspectable output before the builder path moves through Game Studio and Map Lab.",
    nextAction: "Show play/project proof, then route builders through Arcade, Console, Game Studio, Map Lab, or W feedback.",
  },
  {
    key: "choose-path",
    label: "Choose my path",
    question: "Which role path should I follow?",
    sectionId: "beta-paths",
    route: "/mission-control",
    access: "session",
    atlasPersona: "all",
    proof: "Puppet paths and the Journey Command Center compress each role into orient, act, prove, return, and Count review steps.",
    nextAction: "Jump to the selected puppet controls so the user can choose a path before opening deeper app details.",
  },
  {
    key: "find-tool",
    label: "Find a tool",
    question: "Which existing app fits this job?",
    sectionId: "beta-atlas",
    route: "/mission-control",
    access: "session",
    atlasPersona: "all",
    atlasStage: "all",
    atlasTier: "all",
    atlasQuery: "",
    proof: "The App Visibility Atlas classifies every known beta route by tier, stage, and puppet path before any app is hidden.",
    nextAction: "Jump to atlas filters and search the existing route catalog without changing app gates or feature availability.",
  },
  {
    key: "count-review",
    label: "Count review",
    question: "What needs admin review before it becomes farmable?",
    sectionId: "beta-count",
    route: "/admin",
    access: "admin",
    atlasPersona: "all",
    atlasStage: "operate",
    atlasTier: 5,
    proof: "The Count summary and liveops command deck keep users, roles, quests, rewards, market items, and automation behind existing strict-admin gates.",
    nextAction: "Jump to The Count runbook, then open Admin only when the current session already has explicit admin authority.",
  },
];

export const BETA_UNLOCK_GOVERNANCE_MATRIX: BetaUnlockGovernanceItem[] = [
  {
    key: "new-tezos-user",
    label: "Starter witness",
    playerQuestion: "Has the user earned one safe win without wallet pressure?",
    evidence: "Profile, social, or message-board setup proof from Side Quests plus visible leaderboard or profile activity context.",
    expSignal: "Low EXP award and first tier movement should prove orientation, not readiness for privileged tools.",
    rewardOrMarketSink: "Small reward rows may teach WTFIAM later, but starter rewards should stay capped and non-essential.",
    roleBoundary: "No role or permission change follows automatically from this path; the user stays in normal signed-in surfaces.",
    countDecision: "The Count checks completion caps, failed verifiers, duplicate proofs, and whether the next challenge should be recommended.",
    abuseControl: "Use max completions, idempotent reward rows, manual review flags for suspicious repeats, and no automatic role grants.",
    userRoute: "/side-quests",
    userAccess: "session",
    adminRoute: "/admin",
    adminAccess: "admin",
    relatedRoutes: ["/profile", "/leaderboard", "/challenges", "/notifications"],
  },
  {
    key: "collector",
    label: "Collector readiness",
    playerQuestion: "Has the collector found an object and understood why it matters?",
    evidence: "Gallery inspection, object-discovery side quest proof, Hoard context, or Rat Race market-motion follow-up.",
    expSignal: "EXP should indicate repeated discovery quality, not speculative wallet behavior or high-value market action.",
    rewardOrMarketSink: "WTFIAM inventory, reward rows, and in-app market sinks become useful only after collector context is clear.",
    roleBoundary: "Collector recommendations may improve discovery, but market, wallet, and role-gated actions keep their existing gates.",
    countDecision: "The Count reviews market availability, reward-spend prompts, pricing locks, and repeated collector-loop completions.",
    abuseControl: "Keep reward caps, listing uncertainty, sale windows, and audit notes visible before increasing repeatable incentives.",
    userRoute: "/gallery",
    userAccess: "public",
    adminRoute: "/admin",
    adminAccess: "admin",
    relatedRoutes: ["/hoard", "/rat-race", "/marketplace", "/wtfiam"],
  },
  {
    key: "creator",
    label: "Creator unlock review",
    playerQuestion: "Has the creator proven a project can move from draft to durable promotion?",
    evidence: "Studio project proof, Broot asset step, Macaroni package or drop staging, IPFS Pinning readiness, and Skywire promotion context.",
    expSignal: "EXP and challenge proof can signal creator readiness, but they do not grant publishing or trusted creator roles by themselves.",
    rewardOrMarketSink: "Rewards should reinforce completion and recovery, while market or publishing sinks stay behind existing creator gates.",
    roleBoundary: "Creator roles, trusted creator access, hosted pinning, and app-gate changes remain explicit admin decisions.",
    countDecision: "The Count compares project proof, challenge submission, role request, affected app gate, and publish-risk notes before granting access.",
    abuseControl: "Require proof variety, manual review for role grants, reversible app gates, and audit notes before expanding creator power.",
    userRoute: "/studio",
    userAccess: "session",
    adminRoute: "/admin",
    adminAccess: "admin",
    relatedRoutes: ["/tools/broot", "/tools/macaroni", "/ipfs-pinning", "/skywire"],
  },
  {
    key: "builder",
    label: "Builder surface access",
    playerQuestion: "Has the builder shown a project can become mapped, testable, playable, or discussable?",
    evidence: "Game Studio project context, Map Lab workflow, Console proof, Arcade output, or W feedback from real users.",
    expSignal: "EXP should show project follow-through and community feedback, not authority over experimental or admin-adjacent tools.",
    rewardOrMarketSink: "Builder rewards should point back to playable output or feedback loops before any economy sink is promoted.",
    roleBoundary: "Builder tool access stays narrow, reversible, and separate from operator power or production app administration.",
    countDecision: "The Count reviews project proof, app-gate scope, route visibility, abuse risk, and whether the output is ready for public surfacing.",
    abuseControl: "Use experimental-tier labeling, role-scoped grants, review notes, and cooldowns before promoting repeatable builder rewards.",
    userRoute: "/game-studio",
    userAccess: "session",
    adminRoute: "/admin",
    adminAccess: "admin",
    relatedRoutes: ["/map-lab", "/console", "/arcade", "/w"],
  },
  {
    key: "curator",
    label: "Curator signal review",
    playerQuestion: "Has the curator turned discovery into useful public signal?",
    evidence: "Gallery discovery, curation side quest reason, CRP nomination readiness, Skywire broadcast, or W discussion context.",
    expSignal: "EXP should reward useful curation evidence and public contribution, not low-effort repeat browsing.",
    rewardOrMarketSink: "Curator rewards should stay modest until nomination quality, social impact, and repeat patterns are reviewable.",
    roleBoundary: "Curator readiness may request access, but nomination routes, review surfaces, and role gates keep current checks.",
    countDecision: "The Count reviews nomination proof, repeated submissions, curator role need, and whether public impact exists.",
    abuseControl: "Use nomination caps, proof requirements, manual review notes, and anti-spam checks before rewarded curation scales.",
    userRoute: "/gallery",
    userAccess: "public",
    adminRoute: "/admin",
    adminAccess: "admin",
    relatedRoutes: ["/side-quests", "/crp-nominate", "/skywire", "/w"],
  },
  {
    key: "community-member",
    label: "Community participation",
    playerQuestion: "Has the user found people and taken one healthy social action?",
    evidence: "W Feed participation, WTF LIVE room attendance, WIM follow-up, Calendar return intent, or Digest recovery.",
    expSignal: "EXP can acknowledge participation and return loops, but social activity must not become an authority shortcut.",
    rewardOrMarketSink: "Community rewards should reinforce presence, replies, and events without turning social loops into a faucet.",
    roleBoundary: "Community activity can unlock recommendations and quests, not admin access, moderation power, or unrelated app gates.",
    countDecision: "The Count watches abuse, spam, role escalation, and farmable social loops while normal discovery remains user-owned.",
    abuseControl: "Keep rate limits, moderation review, proof variety, and cooldowns visible before repeat social rewards increase.",
    userRoute: "/w",
    userAccess: "session",
    adminRoute: "/admin",
    adminAccess: "admin",
    relatedRoutes: ["/live", "/wim", "/calendar", "/digest"],
  },
  {
    key: "the-count",
    label: "Operator governance",
    playerQuestion: "Is this loop safe to scale before it changes rewards, roles, or market pressure?",
    evidence: "Admin summary counts, quest or challenge definitions, reward rows, role gates, market operations, and automation definitions.",
    expSignal: "EXP and levels are evidence for review only; they never become admin authority or automatic permission grants.",
    rewardOrMarketSink: "Reward settlement, WTFIAM inventory impact, in-app market items, pricing locks, and sale windows must be auditable.",
    roleBoundary: "Only explicit admin role grants operator access; all user-facing unlocks stay separate from strict-admin controls.",
    countDecision: "The Count compares trigger, actor, proof, reward delta, role change, market impact, and SystemEvent handle before scaling.",
    abuseControl: "Use manual review, caps, cooldowns, idempotency, reversible roles, sale windows, and audit notes before increasing visibility.",
    userRoute: "/admin",
    userAccess: "admin",
    adminRoute: "/admin",
    adminAccess: "admin",
    relatedRoutes: ["/side-quests", "/challenges", "/wtfiam", "/marketplace"],
  },
];

export const BETA_DAILY_RETURN_LOOPS: BetaDailyReturnLoop[] = [
  {
    key: "changes",
    label: "Check what changed",
    route: "/notifications",
    access: "session",
    question: "What changed since I left?",
    todayAction: "Open Notifications, then fall back to Digest or Mission Control when the user missed a burst.",
    tomorrowReason: "Replies, mentions, room activity, publish states, rewards, and system work can all create a new reason to care.",
    progressionHook: "Notifications should explain EXP, reward, challenge, and role-readiness changes without granting access by themselves.",
    visibleProof: "Social Pulse and read-only now signals show whether people, events, objects, or project routes have fresh context.",
    countControl: "The Count reviews only admin-owned notification pressure through Admin and keeps normal delivery preferences user-controlled.",
    relatedRoutes: ["/digest", "/mission-control", "/settings"],
  },
  {
    key: "quest",
    label: "Complete one quest",
    route: "/side-quests",
    access: "session",
    question: "What can I finish in one sitting?",
    todayAction: "Start one side quest or challenge before pushing the user into wallet-heavy, creator-heavy, or admin-heavy tools.",
    tomorrowReason: "EXP, level progress, visible completions, challenge feedback, and reward rows turn discovery into a manageable game.",
    progressionHook: "Side quests and challenges are the existing backbone for EXP, rewards, role-readiness, and unlock explanation.",
    visibleProof: "Leaderboards and profile activity prove other users are earning, completing, and returning.",
    countControl: "The Count tunes criteria, EXP, max completions, reward flags, and manual review from existing admin surfaces.",
    relatedRoutes: ["/challenges", "/leaderboard", "/wtfiam"],
  },
  {
    key: "people",
    label: "See people moving",
    route: "/w",
    access: "session",
    question: "Who is active right now?",
    todayAction: "Open W Feed, WTF LIVE, or WIM depending on whether the signal is public motion, live presence, or direct follow-up.",
    tomorrowReason: "Active people, live rooms, follows, replies, and buddy actions make WTFOS feel inhabited instead of empty.",
    progressionHook: "Community proof can point users toward quests and roles, but social activity never bypasses route permissions.",
    visibleProof: "WTF LIVE room presence, W Feed motion, leaderboards, and profile activity supply the presence layer.",
    countControl: "The Count uses admin review only for abuse, role escalation, and farmable-loop checks, not normal social discovery.",
    relatedRoutes: ["/live", "/wim", "/skywire"],
  },
  {
    key: "object",
    label: "Find one object",
    route: "/gallery",
    access: "public",
    question: "What new art, collection, or market object is worth a look?",
    todayAction: "Start from Gallery or public proof, then route collectors toward Rat Race, Hoard, Marketplace, or Trade Boards when they need depth.",
    tomorrowReason: "Fresh art, listings, trade-board objects, mints, and sales create a changing collector and curator loop.",
    progressionHook: "Collector curiosity can feed quests, rewards, WTFIAM inventory, and marketplace paths without making speculation the whole product.",
    visibleProof: "Public Proof Board combines object, trade-board, market, and channel snippets when safe public reads exist.",
    countControl: "The Count manages market availability, pricing locks, reward sinks, and abusive market loops from admin-only surfaces.",
    relatedRoutes: ["/rat-race", "/hoard", "/marketplace"],
  },
  {
    key: "project",
    label: "Move one project forward",
    route: "/studio",
    access: "session",
    question: "What creator or builder work needs one next step?",
    todayAction: "Open Studio or the right creation tool, then continue through Broot, IPFS Pinning, WTF Domains, or Skywire when needed.",
    tomorrowReason: "Drafts, pin jobs, domains, publish states, creator channels, and promotion prompts make progress recoverable.",
    progressionHook: "Creator readiness should be explained through EXP, challenge proof, roles, and app gates, not by hiding tools.",
    visibleProof: "Creator channels, console discovery, project shelves, and builder output show what work is moving.",
    countControl: "The Count grants creator/builder roles only after proof, then audits the affected app gate and user-visible route state.",
    relatedRoutes: ["/tools/broot", "/ipfs-pinning", "/wtf-subdomains"],
  },
  {
    key: "admin",
    label: "Review one liveops queue",
    route: "/admin",
    access: "admin",
    question: "What needs operator review before the loop scales?",
    todayAction: "Open Admin only as The Count, inspect the owning queue, and act from the existing users, roles, rewards, market, or automation surface.",
    tomorrowReason: "Admin fairness, reward settlement, role reviews, challenge definitions, market state, and abuse checks keep the game trustworthy.",
    progressionHook: "EXP can signal readiness for review, but explicit admin permission remains the only path to operator authority.",
    visibleProof: "Strict-admin Count summary cards show live counts only after the current session passes existing admin API gates.",
    countControl: "The Count owns user triage, challenge arcs, side quest tuning, reward settlement, role grants, market operations, and farmable-loop audits.",
    relatedRoutes: ["/challenges", "/side-quests", "/wtfiam"],
  },
];

export const BETA_DESKTOP_MODEL_REVIEW = [
  { model: "Desktop", verdict: "Keep as the underlying app execution model.", risk: "As a first screen it hides meaning behind icons and names." },
  { model: "Town", verdict: "Useful for lore and events, not precise enough for creator workflows.", risk: "Can become novelty navigation instead of task clarity." },
  { model: "Operating System", verdict: "Correct for app ownership, gates, windows, and recovery.", risk: "Too abstract for visitors who need an immediate reason to act." },
  { model: "Community Hub", verdict: "Recommended as the beta first screen.", risk: "Must still preserve direct app routes and not become a marketing page." },
  { model: "Creator Workspace", verdict: "Strong mode for creators inside the hub.", risk: "Collectors and community members may feel secondary." },
  { model: "Tezos Command Center", verdict: "Strong expert layer for wallet, market, and builder workflows.", risk: "Can over-index on chain mechanics before users understand community value." },
];

export const BETA_RECOMMENDED_MODEL = "Community Hub first, Creator Workspace second, Operating System underneath, with The Count managing unlock loops from Admin.";
export function appsForPersona(persona: BetaPersonaKey): BetaAppCatalogEntry[] {
  return BETA_APP_CATALOG.filter((item) => item.personas.includes(persona));
}
export function appsForTier(tier: BetaTier): BetaAppCatalogEntry[] {
  return BETA_APP_CATALOG.filter((item) => item.tier === tier);
}
export function findBetaAppByRoute(route: string): BetaAppCatalogEntry | undefined {
  return BETA_APP_CATALOG.find((item) => item.route === route || item.related.includes(route));
}
