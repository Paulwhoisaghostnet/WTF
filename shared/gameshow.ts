/** Gameshow transport contract. Existing seasons, rounds and challenges remain authoritative. */
export const STAGE_REFRESH_INTERVAL_MS = 15_000; // Existing Control Board audit-feed refresh policy.

export type GameshowRoundStatus = "upcoming" | "active" | "grading" | "completed";
export type GameshowContestantStatus = "active" | "reserve" | "eliminated" | "withdrew" | "non_participant";

export interface GameshowSubmission {
  id: number;
  challengeId: number;
  userId: number;
  username: string;
  contentText: string | null;
  contentUrl: string | null;
  submittedAt: string;
  grade: "pending" | "pass" | "fail" | "bonus";
  feedback: string | null;
}

export interface GameshowStageChallenge {
  id: number;
  title: string;
  description: string;
  criteria: string | null;
  rules: string | null;
  status: "draft" | "active" | "grading" | "completed";
  deadline: string | null;
  rewardXp: number;
  rewardAmountWtf: number;
  tools?: string[];
  tokenMonitor?: GameshowTokenMonitor | null;
  submissionCount: number;
  pendingCount: number;
}

export interface GameshowStageRound {
  id: number;
  number: number;
  name: string;
  description: string | null;
  status: GameshowRoundStatus;
  rules: string | null;
  startDate: string | null;
  endDate: string | null;
  challenges: GameshowStageChallenge[];
  submissionCount: number;
  pendingCount: number;
}

export interface GameshowStageSnapshot {
  season: {
    id: number;
    name: string;
    number: number;
    status: "upcoming" | "active" | "completed";
    description: string | null;
    anteWtfRequired: string;
  };
  rounds: GameshowStageRound[];
  currentRoundId: number | null;
  me: {
    contestant: { id: number; status: GameshowContestantStatus; antePaidWtf: string; anteSatisfied: boolean } | null;
    submissions: GameshowSubmission[];
    canSubmit: boolean;
    blockers: string[];
  };
  canManage: boolean;
  contestants: Array<{ id: number; userId: number; username: string; displayName: string | null; status: GameshowContestantStatus }>;
  /** Only gameshow managers receive the review queue. Other contestants' answers stay private. */
  submissions: GameshowSubmission[];
}

/** The user-requested show format. Empty slots carry no invented game or reward. */
export const GAMESHOW_ROUND_COUNT = 10;

export interface GameshowTokenMonitor {
  network: "mainnet";
  contract: string;
  /** null watches the declared collection; a string watches one exact token. */
  tokenId: string | null;
}

export interface GameshowPlanTask {
  id?: number;
  title: string;
  description: string;
  criteria: string;
  rules: string | null;
  deadline: string | null;
  tools: string[];
  tokenMonitor: GameshowTokenMonitor | null;
}

/** Canonical task content is stored in challenges, not duplicated in plan metadata. */
export interface GameshowRoundPlanInput {
  expectedRevision: number;
  name: string;
  description: string | null;
  rules: string | null;
  tasks: GameshowPlanTask[];
}

export interface GameshowRoundPlan extends Omit<GameshowRoundPlanInput, "expectedRevision"> {
  roundId: number;
  seasonId: number;
  revision: number;
  status: GameshowRoundStatus;
  tasks: Array<GameshowPlanTask & { id: number }>;
}

export interface GameshowCreateInput { name: string; number: number; description?: string | null }
export interface GameshowCreateResult { id: number; roundIds: number[] }

/** Durable associations only; judging criteria and progress keep their existing owners. */
export interface GameshowPlanConfiguration {
  version: 1;
  tasks: Array<{ challengeId: number; tools: string[]; tokenMonitor: GameshowTokenMonitor | null }>;
}

export interface GameshowProgressCounts {
  taskCount: number;
  submissionCount: number;
  pendingCount: number;
  passCount: number;
  failCount: number;
  bonusCount: number;
}

export interface GameshowProgressWallet {
  address: string;
  isPrimary: boolean;
  linkedAt: string;
  syncStatus: string | null;
  lastSyncedAt: string | null;
  backfilled: boolean;
  /** Error details are private to the host view. */
  error: string | null;
  /** Wallet-auth mainnet identity does not assert provenance of historical cached events. */
  identityNetwork: "mainnet";
  eventNetwork: "per-event";
}

export interface GameshowTokenEvidence {
  id: number;
  roundId: number;
  challengeIds: number[];
  userId: number;
  walletAddress: string;
  tokenContract: string;
  tokenId: string | null;
  type: "token_mint" | "token_burn" | "token_transfer_in" | "token_transfer_out";
  amount: string | null;
  timestamp: string;
  opHash: string | null;
  name: string | null;
  thumbnailUri: string | null;
  explorerUrl: string | null;
  tokenUrl: string | null;
  network: "mainnet" | "unverified";
  source: string | null;
}

export interface GameshowProgressSnapshot {
  seasonId: number;
  generatedAt: string;
  rounds: Array<{ id: number; number: number; name: string; status: GameshowRoundStatus; taskCount: number; tokenMonitoring: boolean }>;
  rows: Array<{
    id: number; userId: number; username: string; displayName: string | null; status: GameshowContestantStatus;
    wallets: GameshowProgressWallet[];
    totals: GameshowProgressCounts;
    rounds: Array<GameshowProgressCounts & {
      roundId: number;
      tasks: Array<{ challengeId: number; submissionId: number | null; grade: GameshowSubmission["grade"] | "not_submitted"; submittedAt: string | null }>;
      tokenActivity: { status: "not_configured" | "not_started" | "unavailable" | "incomplete" | "indexed"; observedCount: number | null; verifiedCount: number | null };
    }>;
  }>;
  tokenEvidence: GameshowTokenEvidence[];
  source: { kind: "persisted-wallet-index"; automaticGrading: false; refreshPath: "/api/cockpit/sync/:wallet" };
}
