export type MissionControlChallenge = {
  status?: string | null;
  [key: string]: unknown;
};

export type MissionControlReward = {
  claimable?: boolean;
  claimed?: boolean;
  [key: string]: unknown;
};

export type MissionControlNotificationSummary = {
  unreadCount: number;
  [key: string]: unknown;
};

export type MissionControlSyncSummary = {
  jobs: Array<{
    latest?: {
      status?: string | null;
      error?: string | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  }>;
};

export function deriveMissionControlCounts(input: {
  challenges?: MissionControlChallenge[];
  rewards?: MissionControlReward[];
  notifications?: MissionControlNotificationSummary;
  sync?: MissionControlSyncSummary;
}) {
  const openChallenges = (input.challenges ?? []).filter((row) => row.status === "active");
  const claimableRewards = (input.rewards ?? []).filter(
    (row) => row.claimable && !row.claimed
  );
  const failedJobs = (input.sync?.jobs ?? []).filter(
    (job) => job.latest?.status === "failed" || Boolean(job.latest?.error)
  );
  return {
    openChallenges: openChallenges.length,
    claimableRewards: claimableRewards.length,
    unreadNotifications: input.notifications?.unreadCount ?? 0,
    failedJobs: failedJobs.length,
  };
}
