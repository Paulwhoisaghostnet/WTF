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

export type MissionControlHealthSnapshot = {
  ok?: boolean;
  db?: { ok?: boolean } | null;
  chain?: {
    ok?: boolean;
    network?: string | null;
    rpcBase?: string | null;
    tezosRpcUrl?: string | null;
  } | null;
  jobs?: {
    ok?: boolean;
    registered?: number | null;
    running?: number | null;
    recentErrors?: number | null;
  } | null;
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

export function deriveMissionControlHealth(input?: MissionControlHealthSnapshot | null) {
  const rpc = input?.chain?.rpcBase || input?.chain?.tezosRpcUrl || null;
  const recentErrors = Math.max(0, input?.jobs?.recentErrors ?? 0);
  const registeredJobs = Math.max(0, input?.jobs?.registered ?? 0);
  const runningJobs = Math.max(0, input?.jobs?.running ?? 0);
  const chainNetwork = input?.chain?.network || "unknown";
  const chainStatus = input?.chain?.ok === false ? "attention" : "ready";

  return {
    system: input?.ok ? "OK" : "Attention",
    db: input?.db?.ok ? "OK" : "unknown",
    chain: `${chainNetwork} ${chainStatus}`,
    rpc: rpc || "unknown",
    jobs:
      registeredJobs > 0
        ? `${registeredJobs} job(s), ${runningJobs} running, ${recentErrors} recent error(s)`
        : recentErrors > 0
          ? `${recentErrors} recent job error(s)`
          : "job registry unknown",
    recentErrors,
  };
}
