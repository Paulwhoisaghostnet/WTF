import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Separator } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { WalletButton } from "../components/WalletButton";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";
import {
  asMissionArray,
  deriveMissionControlCounts,
  deriveMissionControlHealth,
  isMissionJobFailed,
  selectMissionControlDailyLoopRows,
} from "./mission-control-model";

type WalletRow = {
  id: number;
  walletAddress: string;
  tezDomain?: string | null;
  isPrimary?: boolean;
  lastSyncedAt?: string | null;
};

type ChallengeRow = {
  id: number;
  title: string;
  status?: string | null;
  rewardType?: string | null;
};

type RewardFlagRow = {
  id: number;
  challengeTitle?: string | null;
  claimable?: boolean;
  claimed?: boolean;
  rewardType?: string | null;
  rewardAmountWtf?: string | null;
};

type DailyLoopRow = {
  id: number;
  title: string;
  description?: string | null;
  route: string;
  actionLabel: string;
  completedToday?: boolean;
  rewards?: { xp?: number; wtf?: number };
};

type NotificationResponse = {
  unreadCount: number;
  items: Array<{
    id: number;
    title: string;
    body?: string | null;
    read: boolean;
    createdAt: string;
  }>;
};

type HealthResponse = {
  ok: boolean;
  status?: string;
  version?: { commitRef?: string | null; packageVersion?: string | null };
  db?: { ok: boolean };
  chain?: {
    ok?: boolean;
    rpcBase?: string | null;
    tezosRpcUrl?: string | null;
    network?: string | null;
  };
  jobs?: {
    ok?: boolean;
    registered?: number | null;
    running?: number | null;
    recentErrors?: number | null;
  };
};

type SyncStatusResponse = {
  jobs: Array<{
    name: string;
    latest?: {
      status?: string | null;
      startedAt?: string | null;
      finishedAt?: string | null;
      error?: string | null;
    } | null;
  }>;
};

const Shell = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const PanelGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 8px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Metric = styled.div`
  min-height: 76px;
  padding: 8px;
  border: 1px solid #808080;
  background: #dfdfdf;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const Label = styled.div`
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: #404040;
`;

const Value = styled.div`
  margin-top: 4px;
  font-size: 18px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const Detail = styled.div`
  margin-top: 3px;
  font-size: 11px;
  color: #303030;
  overflow-wrap: anywhere;
`;

const Rows = styled.div`
  display: grid;
  gap: 6px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px;
  border: 1px solid #9a9a9a;
  background: #eeeeee;
`;

const RowTitle = styled.div`
  font-size: 12px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const RowMeta = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: #404040;
  overflow-wrap: anywhere;
`;

const Actions = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 620px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const ProgressLine = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px;
  border: 1px solid #9a9a9a;
  background: #eeeeee;
`;

const MiniMeter = styled.div`
  height: 10px;
  border: 1px solid #808080;
  background: #ffffff;
  box-shadow: inset 1px 1px 0 #bdbdbd;
`;

const MiniMeterFill = styled.div<{ $pct: number }>`
  width: ${(p) => Math.max(0, Math.min(100, p.$pct))}%;
  height: 100%;
  background: #008000;
`;

const ActionButton = styled(Button)`
  width: 100%;
  min-height: 28px;
  font-size: 11px;
`;

function shortAddress(address: string | null | undefined) {
  if (!address) return "No wallet";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function relativeTime(iso: string | null | undefined) {
  if (!iso) return "never";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "unknown";
  const delta = Date.now() - time;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
}

export function MissionControl() {
  const { user } = useAuth();
  const { address, providerName } = useWallet();
  const [, setLocation] = useLocation();

  useEffect(() => {
    logClientSystemEvent({
      eventType: "mission_control.viewed",
      metadata: {
        userId: user?.id ?? null,
        role: user?.role ?? null,
      },
    });
  }, [user?.id, user?.role]);

  const openMissionRoute = useCallback(
    (path: string, intent: string) => {
      logClientSystemEvent({
        eventType: "mission_control.action_opened",
        metadata: { path, intent },
      });
      setLocation(path);
    },
    [setLocation]
  );

  const walletsQuery = useQuery({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletRow[]>("/api/wallets"),
  });
  const challengesQuery = useQuery({
    queryKey: ["mission-control", "challenges"],
    queryFn: () => api.get<ChallengeRow[]>("/api/challenges"),
  });
  const rewardsQuery = useQuery({
    queryKey: ["mission-control", "reward-flags"],
    queryFn: () => api.get<RewardFlagRow[]>("/api/reward-flags/challenges"),
  });
  const dailyLoopsQuery = useQuery({
    queryKey: ["mission-control", "daily-loops"],
    queryFn: () => api.get<{ completionKey: string; loops: DailyLoopRow[] }>("/api/challenge-automation/daily-loops"),
    enabled: !!user,
  });
  const notificationsQuery = useQuery({
    queryKey: ["mission-control", "notifications"],
    queryFn: () => api.get<NotificationResponse>("/api/notifications?limit=6"),
  });
  const healthQuery = useQuery({
    queryKey: ["mission-control", "health"],
    queryFn: () => api.get<HealthResponse>("/api/health"),
    refetchInterval: 60_000,
  });
  const syncQuery = useQuery({
    queryKey: ["mission-control", "sync-status"],
    queryFn: () => api.get<SyncStatusResponse>("/api/cockpit/sync/status"),
    refetchInterval: 60_000,
  });

  const wallets = asMissionArray<WalletRow>(walletsQuery.data);
  const primaryWallet = wallets.find((wallet) => wallet.isPrimary) ?? wallets[0];
  const activeWallet = address || primaryWallet?.walletAddress || null;
  const challenges = asMissionArray<ChallengeRow>(challengesQuery.data);
  const rewards = asMissionArray<RewardFlagRow>(rewardsQuery.data);
  const dailyLoops = asMissionArray<DailyLoopRow>(dailyLoopsQuery.data?.loops);
  const incompleteDailyLoops = dailyLoops.filter((loop) => !loop.completedToday);
  const previewDailyLoops = selectMissionControlDailyLoopRows<DailyLoopRow>(dailyLoops);
  const completedDailyLoops = dailyLoops.length - incompleteDailyLoops.length;
  const dailyLoopPct = dailyLoops.length > 0 ? (completedDailyLoops / dailyLoops.length) * 100 : 0;
  const syncJobs = asMissionArray<SyncStatusResponse["jobs"][number]>(
    syncQuery.data?.jobs
  );
  const activeChallenges = challenges.filter(
    (challenge) => challenge.status === "active"
  );
  const claimableRewards = rewards.filter(
    (reward) => reward.claimable && !reward.claimed
  );
  const failedJobs = syncJobs.filter(isMissionJobFailed);
  const recentChanges = asMissionArray<NotificationResponse["items"][number]>(
    notificationsQuery.data?.items
  );
  const counts = useMemo(
    () =>
      deriveMissionControlCounts({
        challenges,
        rewards,
        dailyLoops,
        notifications: notificationsQuery.data,
        sync: syncQuery.data
          ? {
              ...syncQuery.data,
              jobs: syncJobs,
            }
          : null,
      }),
    [challenges, dailyLoops, notificationsQuery.data, rewards, syncJobs, syncQuery.data]
  );
  const health = useMemo(
    () => deriveMissionControlHealth(healthQuery.data),
    [healthQuery.data]
  );
  const loading =
    walletsQuery.isLoading ||
    challengesQuery.isLoading ||
    rewardsQuery.isLoading ||
    dailyLoopsQuery.isLoading ||
    notificationsQuery.isLoading ||
    healthQuery.isLoading ||
    syncQuery.isLoading;

  return (
    <AppWindow title="Mission Control">
      <Shell data-testid="mission-control">
        <StatusGrid>
          <Metric data-testid="mission-control-location">
            <Label>Where am I?</Label>
            <Value>{user?.displayName || user?.username || "WTF OS"}</Value>
            <Detail>{user ? `${user.role} account` : "signed out"}</Detail>
          </Metric>
          <Metric data-testid="mission-control-wallet">
            <Label>Active wallet</Label>
            <Value>{shortAddress(activeWallet)}</Value>
            <Detail>{providerName || primaryWallet?.tezDomain || "wallet not connected"}</Detail>
          </Metric>
          <Metric data-testid="mission-control-system">
            <Label>System</Label>
            <Value>{healthQuery.data ? health.system : loading ? "Checking" : "Attention"}</Value>
            <Detail>DB {health.db} / Chain {health.chain}</Detail>
          </Metric>
          <Metric data-testid="mission-control-next">
            <Label>Next</Label>
            <Value>
              {counts.claimableRewards > 0
                ? `${counts.claimableRewards} reward`
                : counts.openDailyLoops > 0
                  ? `${counts.openDailyLoops} daily`
                : counts.openChallenges > 0
                  ? `${counts.openChallenges} challenge`
                  : "steady"}
            </Value>
            <Detail>
              {counts.failedJobs > 0
                ? `${counts.failedJobs} job needs review`
                : `${counts.unreadNotifications} unread change(s)`}
            </Detail>
          </Metric>
        </StatusGrid>

        <Actions>
          <ActionButton onClick={() => openMissionRoute("/dashboard", "dashboard")}>
            Dashboard
          </ActionButton>
          <ActionButton onClick={() => openMissionRoute("/challenges", "challenges")}>
            Challenges
          </ActionButton>
          <ActionButton onClick={() => openMissionRoute("/side-quests", "side_quests")}>
            Daily Loops
          </ActionButton>
          <ActionButton onClick={() => openMissionRoute("/messages", "inbox")}>
            Inbox
          </ActionButton>
          <ActionButton onClick={() => openMissionRoute("/profile", "profile")}>
            Profile
          </ActionButton>
          <ActionButton onClick={() => openMissionRoute("/hoard", "hoard")}>
            Hoard
          </ActionButton>
        </Actions>

        <PanelGrid>
          <GroupBox label="Daily loops">
            <Rows>
              <ProgressLine>
                <div>
                  <RowTitle>
                    {completedDailyLoops}/{dailyLoops.length || 10} complete today
                  </RowTitle>
                  <RowMeta>
                    {incompleteDailyLoops[0]
                      ? `${incompleteDailyLoops[0].title}: ${incompleteDailyLoops[0].description || "open loop"}`
                      : "Daily social and creative loops are complete."}
                  </RowMeta>
                  <MiniMeter>
                    <MiniMeterFill $pct={dailyLoopPct} />
                  </MiniMeter>
                </div>
                <Button size="sm" onClick={() => openMissionRoute("/side-quests", "daily_loops")}>
                  Open
                </Button>
              </ProgressLine>
              {previewDailyLoops.map((loop) => (
                <Row key={loop.id}>
                  <div>
                    <RowTitle>{loop.title}</RowTitle>
                    <RowMeta>
                      {loop.completedToday
                        ? "Done today"
                        : `${(loop.rewards?.wtf ?? 0) > 0 ? `${loop.rewards?.wtf} WTF` : "WTF"}${
                            (loop.rewards?.xp ?? 0) > 0 ? ` / ${loop.rewards?.xp} XP` : " / XP"
                          }`}
                    </RowMeta>
                  </div>
                  <Button size="sm" onClick={() => openMissionRoute(loop.route, "daily_loop")}>
                    {loop.actionLabel || "Work"}
                  </Button>
                </Row>
              ))}
            </Rows>
          </GroupBox>

          <GroupBox label="What counts">
            {loading ? (
              <Hourglass size={24} />
            ) : (
              <Rows>
                <Row>
                  <div>
                    <RowTitle>Active challenges and daily loops</RowTitle>
                    <RowMeta>
                      {counts.openChallenges} challenge(s), {counts.openDailyLoops} daily loop(s) open
                    </RowMeta>
                  </div>
                  <Button size="sm" onClick={() => openMissionRoute("/challenges", "active_challenges")}>
                    Open
                  </Button>
                </Row>
                <Row>
                  <div>
                    <RowTitle>Wallet-linked work</RowTitle>
                    <RowMeta>
                      {wallets.length} linked wallet(s), {shortAddress(activeWallet)} active
                    </RowMeta>
                  </div>
                  <WalletButton />
                </Row>
                <Row>
                  <div>
                    <RowTitle>System jobs</RowTitle>
                    <RowMeta>{health.jobs} / {counts.failedJobs} cockpit failed</RowMeta>
                  </div>
                  <Button size="sm" onClick={() => openMissionRoute("/dashboard", "sync_jobs")}>
                    Sync
                  </Button>
                </Row>
              </Rows>
            )}
          </GroupBox>

          <GroupBox label="Rewards">
            <Rows>
              {claimableRewards.length === 0 ? (
                <Row>
                  <div>
                    <RowTitle>No claimable challenge rewards</RowTitle>
                    <RowMeta>Reward flags will appear here when staff marks them claimable.</RowMeta>
                  </div>
                  <Button size="sm" onClick={() => openMissionRoute("/challenges", "reward_check")}>
                    Check
                  </Button>
                </Row>
              ) : (
                claimableRewards.slice(0, 4).map((reward) => (
                  <Row key={reward.id}>
                    <div>
                      <RowTitle>{reward.challengeTitle || "Challenge reward"}</RowTitle>
                      <RowMeta>
                        {reward.rewardType || "reward"}
                        {reward.rewardAmountWtf ? ` / ${reward.rewardAmountWtf} WTF` : ""}
                      </RowMeta>
                    </div>
                    <Button size="sm" onClick={() => openMissionRoute("/challenges", "reward_claim")}>
                      Claim
                    </Button>
                  </Row>
                ))
              )}
            </Rows>
          </GroupBox>
        </PanelGrid>

        <PanelGrid>
          <GroupBox label="What failed">
            <Rows>
              {failedJobs.length === 0 ? (
                <Row>
                  <div>
                    <RowTitle>No failed cockpit jobs</RowTitle>
                    <RowMeta>
                      Health commit {healthQuery.data?.version?.commitRef || "unknown"}
                    </RowMeta>
                  </div>
                  <Button size="sm" onClick={() => healthQuery.refetch()}>
                    Refresh
                  </Button>
                </Row>
              ) : (
                failedJobs.slice(0, 4).map((job) => (
                  <Row key={job.name}>
                    <div>
                      <RowTitle>{job.name}</RowTitle>
                      <RowMeta>{job.latest?.error || job.latest?.status || "failed"}</RowMeta>
                    </div>
                    <Button size="sm" onClick={() => openMissionRoute("/dashboard", "failed_job")}>
                      Inspect
                    </Button>
                  </Row>
                ))
              )}
            </Rows>
          </GroupBox>

          <GroupBox label="What changed">
            <Rows>
              {recentChanges.length === 0 ? (
                <Row>
                  <div>
                    <RowTitle>No recent notifications</RowTitle>
                    <RowMeta>Inbox is clear for this account.</RowMeta>
                  </div>
                  <Button size="sm" onClick={() => openMissionRoute("/messages", "notification_inbox")}>
                    Inbox
                  </Button>
                </Row>
              ) : (
                recentChanges.slice(0, 4).map((item) => (
                  <Row key={item.id}>
                    <div>
                      <RowTitle>{item.title}</RowTitle>
                      <RowMeta>
                        {relativeTime(item.createdAt)}
                        {item.read ? "" : " / unread"}
                      </RowMeta>
                    </div>
                    <Button size="sm" onClick={() => openMissionRoute("/messages", "notification_open")}>
                      Open
                    </Button>
                  </Row>
                ))
              )}
            </Rows>
          </GroupBox>
        </PanelGrid>

        <PanelGrid>
          <GroupBox label="What happens next">
            <Rows>
              {activeChallenges.slice(0, 4).map((challenge) => (
                <Row key={challenge.id}>
                  <div>
                    <RowTitle>{challenge.title}</RowTitle>
                    <RowMeta>{challenge.rewardType || "challenge"} reward path</RowMeta>
                  </div>
                  <Button size="sm" onClick={() => openMissionRoute("/challenges", "next_challenge")}>
                    Work
                  </Button>
                </Row>
              ))}
              {activeChallenges.length === 0 && (
                <Row>
                  <div>
                    <RowTitle>No active challenge queue</RowTitle>
                    <RowMeta>Rounds, side quests, and wallet activity are still available.</RowMeta>
                  </div>
                  <Button size="sm" onClick={() => openMissionRoute("/rounds", "rounds")}>
                    Rounds
                  </Button>
                </Row>
              )}
            </Rows>
          </GroupBox>

          <GroupBox label="Transaction costs">
            <Rows>
              <Row>
                <div>
                  <RowTitle>Wallet preflight</RowTitle>
                  <RowMeta>
                    Writes stay bound to the active account before chain prompts open.
                  </RowMeta>
                </div>
                <Button size="sm" onClick={() => openMissionRoute("/swap", "wallet_preflight")}>
                  Swap
                </Button>
              </Row>
              <Row>
                <div>
                  <RowTitle>Primary wallet sync</RowTitle>
                  <RowMeta>
                    {primaryWallet
                      ? `Last sync ${relativeTime(primaryWallet.lastSyncedAt)}`
                      : "No linked primary wallet"}
                  </RowMeta>
                </div>
                <Button size="sm" onClick={() => openMissionRoute("/profile", "wallets")}>
                  Wallets
                </Button>
              </Row>
            </Rows>
          </GroupBox>
        </PanelGrid>

        <Separator />
        <Detail>
          Network {healthQuery.data?.chain?.network || "unknown"} / RPC {health.rpc} / version{" "}
          {healthQuery.data?.version?.packageVersion || "unknown"}
        </Detail>
      </Shell>
    </AppWindow>
  );
}
