/**
 * Client model for Reggie's onboarding questline.
 *
 * Mirrors the payload of `GET /api/reggie/quest` and adds pure helpers for
 * recommending next steps, resolving on-screen anchors, and mapping routes
 * to tour checkpoints. Keep this module free of React so it stays testable
 * with node:test.
 */

export type ReggieStepStatus = "locked" | "available" | "completed";

export interface ReggieQuestStepState {
  id: number;
  seedKey: string;
  stepKey: string;
  title: string;
  description: string;
  route: string;
  actionLabel: string;
  anchorId: string;
  category: string;
  order: number;
  prereqStepKeys: string[];
  rewards: { xp: number; wtf: number };
  status: ReggieStepStatus;
  completedAt: string | null;
}

export interface ReggieQuestState {
  questComplete: boolean;
  completedCount: number;
  totalCount: number;
  steps: ReggieQuestStepState[];
  finale: ReggieQuestStepState | null;
}

export const REGGIE_SUMMON_EVENT = "wtf:reggie:summon";

export interface ReggieSummonEventDetail {
  source?: string;
  x?: number;
  y?: number;
  message?: string;
}

/**
 * Anchors Reggie can walk to. Each anchor maps to an ordered list of CSS
 * selectors; the first match wins. Desktop icons already carry
 * `data-desktop-icon-key`, and shell chrome exposes `data-reggie-anchor`.
 */
export const REGGIE_ANCHOR_SELECTORS: Record<string, string[]> = {
  "start-button": ['[data-reggie-anchor="start-button"]'],
  "pet-tray": ['[data-reggie-anchor="pet-tray"]', '[data-desktop-icon-key="recycle-bin"]'],
  profile: ['[data-reggie-anchor="start-button"]'],
  "side-quests": ['[data-desktop-icon-key="mission-control"]', '[data-reggie-anchor="start-button"]'],
  leaderboard: ['[data-desktop-icon-key="mission-control"]', '[data-reggie-anchor="start-button"]'],
  "desktop-settings": ['[data-reggie-anchor="start-button"]'],
  "wtf-subdomains": ['[data-desktop-icon-key="tz2at"]', '[data-reggie-anchor="start-button"]'],
  wim: ['[data-desktop-icon-key="wim"]'],
  "wtf-live": ['[data-desktop-icon-key="wtf-live"]'],
  skywire: ['[data-desktop-icon-key="skywire"]'],
  tz2at: ['[data-desktop-icon-key="tz2at"]'],
  broot: ['[data-desktop-icon-key="studio"]', '[data-reggie-anchor="start-button"]'],
  studio: ['[data-desktop-icon-key="studio"]'],
  macaroni: ['[data-desktop-icon-key="studio"]', '[data-reggie-anchor="start-button"]'],
  wtfiam: ['[data-desktop-icon-key="wtfiam"]'],
  arcade: ['[data-desktop-icon-key="arcade"]'],
  casino: ['[data-desktop-icon-key="casino"]'],
  calendar: ['[data-reggie-anchor="start-button"]'],
};

export function selectorsForAnchor(anchorId: string): string[] {
  return REGGIE_ANCHOR_SELECTORS[anchorId] ?? ['[data-reggie-anchor="start-button"]'];
}

/**
 * Route-based tour checkpoints. When the user lands on `routePrefix` while
 * the owning step is not yet completed, Reggie emits a
 * `reggie.checkpoint.reached` desktop event with `metadata.checkpoint`.
 * These checkpoints feed the event conditions in the server quest
 * definitions, so the two lists must stay aligned.
 */
export const REGGIE_ROUTE_CHECKPOINTS: Array<{
  checkpoint: string;
  routePrefix: string;
  stepKey: string;
}> = [
  { checkpoint: "side-quests", routePrefix: "/side-quests", stepKey: "quest_hq" },
  { checkpoint: "challenges", routePrefix: "/challenges", stepKey: "quest_hq" },
  { checkpoint: "calendar", routePrefix: "/calendar", stepKey: "calendar" },
  { checkpoint: "skywire", routePrefix: "/skywire", stepKey: "skywire" },
  { checkpoint: "tz2at", routePrefix: "/tz2at", stepKey: "tz2at" },
  { checkpoint: "broot", routePrefix: "/tools/broot", stepKey: "broot" },
  { checkpoint: "arcade", routePrefix: "/arcade", stepKey: "arcade" },
  { checkpoint: "casino", routePrefix: "/casino", stepKey: "casino" },
  { checkpoint: "roles", routePrefix: "/leaderboard", stepKey: "titles_roles" },
  { checkpoint: "navigation", routePrefix: "/dashboard", stepKey: "navigator" },
];

export function checkpointsForRoute(pathname: string): Array<{
  checkpoint: string;
  stepKey: string;
}> {
  return REGGIE_ROUTE_CHECKPOINTS.filter(
    (entry) =>
      pathname === entry.routePrefix || pathname.startsWith(`${entry.routePrefix}/`)
  ).map(({ checkpoint, stepKey }) => ({ checkpoint, stepKey }));
}

/**
 * Validate an API payload before trusting it as quest state. A proxy hiccup,
 * auth edge, or test harness can hand back JSON without `steps`; treating
 * that as "no quest data" keeps Reggie from crashing the desktop shell.
 */
export function normalizeReggieQuestState(value: unknown): ReggieQuestState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.steps)) return null;
  if (typeof candidate.questComplete !== "boolean") return null;
  return {
    questComplete: candidate.questComplete,
    completedCount: typeof candidate.completedCount === "number" ? candidate.completedCount : 0,
    totalCount: typeof candidate.totalCount === "number" ? candidate.totalCount : 0,
    steps: candidate.steps as ReggieQuestStepState[],
    finale: (candidate.finale ?? null) as ReggieQuestStepState | null,
  };
}

/** Steps the user can work on right now, in recommended order. */
export function availableSteps(state: ReggieQuestState): ReggieQuestStepState[] {
  return state.steps
    .filter((step) => step.status === "available")
    .sort((a, b) => a.order - b.order);
}

/**
 * Reggie's single best suggestion: the lowest-order available step, so the
 * intro lessons come first and deep-tree steps surface as they unlock.
 */
export function recommendedStep(state: ReggieQuestState): ReggieQuestStepState | null {
  return availableSteps(state)[0] ?? null;
}

/** Steps that unlock once `stepKey` completes. Used for "what's next" hype. */
export function stepsUnlockedBy(
  state: ReggieQuestState,
  stepKey: string
): ReggieQuestStepState[] {
  const completed = new Set(
    state.steps.filter((step) => step.status === "completed").map((step) => step.stepKey)
  );
  completed.add(stepKey);
  return state.steps.filter(
    (step) =>
      step.status === "locked" &&
      step.prereqStepKeys.includes(stepKey) &&
      step.prereqStepKeys.every((key) => completed.has(key))
  );
}

export function progressPercent(state: ReggieQuestState): number {
  if (state.totalCount === 0) return 0;
  return Math.round((state.completedCount / state.totalCount) * 100);
}

/** Reggie stays on screen for signed-in users until the finale completes. */
export function shouldShowReggie(input: {
  hasUser: boolean;
  questState: ReggieQuestState | null;
  dismissedUntil: number | null;
  now?: number;
}): boolean {
  if (!input.hasUser) return false;
  if (input.questState?.questComplete) return false;
  const now = input.now ?? Date.now();
  if (input.dismissedUntil && input.dismissedUntil > now) return false;
  return true;
}

export interface ReggieAccountSnapshot {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  pfpImageUrl: string | null;
  twitterHandle: string | null;
  twitterVerified: boolean;
  experiencePoints: number;
}

/** Compact, human-readable account-state summary Reggie can recite. */
export function describeAccountState(
  account: ReggieAccountSnapshot,
  state: ReggieQuestState | null
): string {
  const parts: string[] = [];
  parts.push(
    account.displayName
      ? `You're ${account.displayName} (@${account.username}).`
      : `You're @${account.username} — no display name yet, which is a crime I intend to solve.`
  );
  parts.push(
    account.avatarUrl || account.pfpImageUrl
      ? "PFP: set."
      : "PFP: missing. You are currently a gray silhouette of pure potential."
  );
  parts.push(
    account.twitterVerified
      ? `X: linked${account.twitterHandle ? ` as @${account.twitterHandle}` : ""}.`
      : "X: not linked."
  );
  parts.push(`EXP: ${account.experiencePoints}.`);
  if (state) {
    parts.push(
      `Quest progress: ${state.completedCount}/${state.totalCount} side quests done (${progressPercent(state)}%).`
    );
  }
  return parts.join(" ");
}
