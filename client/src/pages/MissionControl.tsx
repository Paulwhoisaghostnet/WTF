import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { GroupBox, Hourglass, Separator } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton } from "../components/wtfos-ui";
import { WalletButton } from "../components/WalletButton";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";
import { presentationRouteHref, usePresentationShell } from "../lib/presentation-shell";
import { logClientSystemEvent } from "../lib/system-log";
import { customerChallengeTitle } from "./challenge-display";
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
  claimedToday?: boolean;
  claimableToday?: boolean;
  verifiedToday?: boolean;
  completedByCount?: number;
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
  gap: var(--wtf-space-3, 12px);
  min-width: 0;

  &[data-mission-control-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-mission-control-presentation-host="gamma"],
  &[data-mission-control-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region],
  &[data-mission-control-presentation-host="gamma"] fieldset {
    min-width: 0;
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #070706;
    background-image: none;
    color: #f2ead9;
  }

  &[data-mission-control-presentation-host="gamma"] fieldset {
    padding: 12px;
  }

  &[data-mission-control-presentation-host="gamma"] legend,
  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="label"] {
    color: rgba(242, 234, 217, 0.7);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="value"],
  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="row-title"] {
    color: #f2ead9;
  }

  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="detail"],
  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="row-meta"] {
    color: rgba(242, 234, 217, 0.68);
  }

  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="actions"] {
    border: 1px solid rgba(242, 234, 217, 0.14);
    border-radius: 6px;
    padding: 8px;
    background: #11110f;
  }

  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="metric"],
  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="row"],
  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="progress"] {
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    background: #11110f;
    background-image: none;
  }

  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="button"] {
    border: 1px solid rgba(0, 210, 255, 0.58);
    border-radius: 4px;
    background: transparent;
    color: #00d2ff;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="button"]:hover,
  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="button"]:focus-visible {
    border-color: #00d2ff;
    color: #f2ead9;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }

  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="meter"] {
    border-color: rgba(242, 234, 217, 0.22);
    background: #070706;
  }

  &[data-mission-control-presentation-host="gamma"] [data-mission-control-region="meter-fill"] {
    background: #00d2ff;
  }
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
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
`;

const Label = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: var(--wtf-app-muted-text, #384352);
  line-height: 1.25;
`;

const Value = styled.div`
  margin-top: 4px;
  font-size: 18px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const Detail = styled.div`
  margin-top: 3px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
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
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const RowTitle = styled.div`
  font-size: var(--wtf-type-body, 14px);
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const RowMeta = styled.div`
  margin-top: 2px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
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
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
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

const ActionButton = styled(UiButton)`
  width: 100%;
  min-height: 32px;
  font-size: var(--wtf-type-caption, 13px);

  @media (max-width: 768px) {
    min-height: 44px;
  }
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
  const presentation = usePresentationShell();
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
      setLocation(presentationRouteHref(path, presentation.host));
    },
    [presentation.host, setLocation]
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
    queryFn: () => api.get<HealthResponse>("/api/health/diagnostics"),
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
      <Shell
        data-testid="mission-control"
        data-mission-control-presentation-host={presentation.host}
        data-mission-control-surface="mission-control"
        data-mission-control-region="surface"
      >
        <StatusGrid data-mission-control-region="status-grid">
          <Metric data-testid="mission-control-location" data-mission-control-region="metric">
            <Label data-mission-control-region="label">Where am I?</Label>
            <Value data-mission-control-region="value">{user?.displayName || user?.username || "WTF OS"}</Value>
            <Detail data-mission-control-region="detail">{user ? `${user.role} account` : "signed out"}</Detail>
          </Metric>
          <Metric data-testid="mission-control-wallet" data-mission-control-region="metric">
            <Label data-mission-control-region="label">Active wallet</Label>
            <Value data-mission-control-region="value">{shortAddress(activeWallet)}</Value>
            <Detail data-mission-control-region="detail">{providerName || primaryWallet?.tezDomain || "wallet not connected"}</Detail>
          </Metric>
          <Metric data-testid="mission-control-system" data-mission-control-region="metric">
            <Label data-mission-control-region="label">System</Label>
            <Value data-mission-control-region="value">{healthQuery.data ? health.system : loading ? "Checking" : "Attention"}</Value>
            <Detail data-mission-control-region="detail">DB {health.db} / Chain {health.chain}</Detail>
          </Metric>
          <Metric data-testid="mission-control-next" data-mission-control-region="metric">
            <Label data-mission-control-region="label">Next</Label>
            <Value data-mission-control-region="value">
              {counts.claimableRewards > 0
                ? `${counts.claimableRewards} reward`
                : counts.openDailyLoops > 0
                  ? `${counts.openDailyLoops} side quest`
                : counts.openChallenges > 0
                  ? `${counts.openChallenges} challenge`
                  : "steady"}
            </Value>
            <Detail data-mission-control-region="detail">
              {counts.failedJobs > 0
                ? `${counts.failedJobs} job needs review`
                : `${counts.unreadNotifications} unread change(s)`}
            </Detail>
          </Metric>
        </StatusGrid>

        <Actions data-mission-control-region="actions">
          <ActionButton data-mission-control-region="button" onClick={() => openMissionRoute("/dashboard", "dashboard")}>
            Open dashboard
          </ActionButton>
          <ActionButton data-mission-control-region="button" onClick={() => openMissionRoute("/challenges", "challenges")}>
            Open challenges
          </ActionButton>
          <ActionButton data-mission-control-region="button" onClick={() => openMissionRoute("/side-quests", "side_quests")}>
            Open side quests
          </ActionButton>
          <ActionButton data-mission-control-region="button" onClick={() => openMissionRoute("/messages", "inbox")}>
            Open inbox
          </ActionButton>
          <ActionButton data-mission-control-region="button" onClick={() => openMissionRoute("/profile", "profile")}>
            Open profile
          </ActionButton>
        </Actions>

        <PanelGrid data-mission-control-region="panel-grid">
          <GroupBox label="Side Quests">
            <Rows>
              <ProgressLine data-mission-control-region="progress">
                <div>
                  <RowTitle data-mission-control-region="row-title">
                    {completedDailyLoops}/{dailyLoops.length || 10} claimed today
                  </RowTitle>
                  <RowMeta data-mission-control-region="row-meta">
                    {incompleteDailyLoops[0]
                      ? incompleteDailyLoops[0].claimableToday
                        ? `${incompleteDailyLoops[0].title}: ready to claim`
                        : `${incompleteDailyLoops[0].title}: ${incompleteDailyLoops[0].description || "open quest"}`
                      : "Daily social and creative side quests are claimed."}
                  </RowMeta>
                  <MiniMeter data-mission-control-region="meter">
                    <MiniMeterFill $pct={dailyLoopPct} data-mission-control-region="meter-fill" />
                  </MiniMeter>
                </div>
                <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/side-quests", "side_quests")}>
                  Open side quests
                </ActionButton>
              </ProgressLine>
              {previewDailyLoops.map((loop) => (
                <Row key={loop.id} data-mission-control-region="row">
                  <div>
                    <RowTitle data-mission-control-region="row-title">{loop.title}</RowTitle>
                    <RowMeta data-mission-control-region="row-meta">
                      {loop.completedToday || loop.claimedToday
                        ? `Claimed today${loop.completedByCount ? ` by ${loop.completedByCount}` : ""}`
                        : loop.claimableToday
                          ? "Ready to claim"
                          : loop.verifiedToday
                            ? "Verified by WTF OS"
                        : `${(loop.rewards?.wtf ?? 0) > 0 ? `${loop.rewards?.wtf} WTF` : "WTF"}${
                            (loop.rewards?.xp ?? 0) > 0 ? ` / ${loop.rewards?.xp} XP` : " / XP"
                          }`}
                    </RowMeta>
                  </div>
                  <ActionButton
                    data-mission-control-region="button"
                    size="sm"
                    onClick={() =>
                      openMissionRoute(
                        loop.claimableToday ? "/side-quests" : loop.route,
                        "side_quest"
                      )
                    }
                  >
                    {loop.claimableToday ? "Claim side quest" : loop.actionLabel || "Open side quest"}
                  </ActionButton>
                </Row>
              ))}
            </Rows>
          </GroupBox>

          <GroupBox label="What counts">
            {loading ? (
              <Hourglass size={24} />
            ) : (
              <Rows>
                <Row data-mission-control-region="row">
                  <div>
                    <RowTitle data-mission-control-region="row-title">Active challenges and side quests</RowTitle>
                    <RowMeta data-mission-control-region="row-meta">
                      {counts.openChallenges} challenge(s), {counts.openDailyLoops} side quest(s) waiting
                    </RowMeta>
                  </div>
                  <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/challenges", "active_challenges")}>
                    Open challenges
                  </ActionButton>
                </Row>
                <Row data-mission-control-region="row">
                  <div>
                    <RowTitle data-mission-control-region="row-title">Wallet-linked work</RowTitle>
                    <RowMeta data-mission-control-region="row-meta">
                      {wallets.length} linked wallet(s), {shortAddress(activeWallet)} active
                    </RowMeta>
                  </div>
                  <WalletButton />
                </Row>
                <Row data-mission-control-region="row">
                  <div>
                    <RowTitle data-mission-control-region="row-title">System jobs</RowTitle>
                    <RowMeta data-mission-control-region="row-meta">{health.jobs} / {counts.failedJobs} cockpit failed</RowMeta>
                  </div>
                  <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/dashboard", "sync_jobs")}>
                    Open sync jobs
                  </ActionButton>
                </Row>
              </Rows>
            )}
          </GroupBox>

          <GroupBox label="Rewards">
            <Rows>
              {claimableRewards.length === 0 ? (
                <Row data-mission-control-region="row">
                  <div>
                    <RowTitle data-mission-control-region="row-title">No claimable challenge rewards</RowTitle>
                    <RowMeta data-mission-control-region="row-meta">Reward flags will appear here when staff marks them claimable.</RowMeta>
                  </div>
                  <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/challenges", "reward_check")}>
                    Check rewards
                  </ActionButton>
                </Row>
              ) : (
                claimableRewards.slice(0, 4).map((reward) => (
                  <Row key={reward.id} data-mission-control-region="row">
                    <div>
                      <RowTitle data-mission-control-region="row-title">{reward.challengeTitle || "Challenge reward"}</RowTitle>
                      <RowMeta data-mission-control-region="row-meta">
                        {reward.rewardType || "reward"}
                        {reward.rewardAmountWtf ? ` / ${reward.rewardAmountWtf} WTF` : ""}
                      </RowMeta>
                    </div>
                    <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/challenges", "reward_claim")}>
                      Claim reward
                    </ActionButton>
                  </Row>
                ))
              )}
            </Rows>
          </GroupBox>
        </PanelGrid>

        <PanelGrid data-mission-control-region="panel-grid">
          <GroupBox label="What failed">
            <Rows>
              {failedJobs.length === 0 ? (
                <Row data-mission-control-region="row">
                  <div>
                    <RowTitle data-mission-control-region="row-title">No failed cockpit jobs</RowTitle>
                    <RowMeta data-mission-control-region="row-meta">
                      Health commit {healthQuery.data?.version?.commitRef || "unknown"}
                    </RowMeta>
                  </div>
                  <ActionButton data-mission-control-region="button" size="sm" onClick={() => healthQuery.refetch()}>
                    Refresh health
                  </ActionButton>
                </Row>
              ) : (
                failedJobs.slice(0, 4).map((job) => (
                  <Row key={job.name} data-mission-control-region="row">
                    <div>
                      <RowTitle data-mission-control-region="row-title">{job.name}</RowTitle>
                      <RowMeta data-mission-control-region="row-meta">{job.latest?.error || job.latest?.status || "failed"}</RowMeta>
                    </div>
                    <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/dashboard", "failed_job")}>
                      Inspect job
                    </ActionButton>
                  </Row>
                ))
              )}
            </Rows>
          </GroupBox>

          <GroupBox label="What changed">
            <Rows>
              {recentChanges.length === 0 ? (
                <Row data-mission-control-region="row">
                  <div>
                    <RowTitle data-mission-control-region="row-title">No recent notifications</RowTitle>
                    <RowMeta data-mission-control-region="row-meta">Inbox is clear for this account.</RowMeta>
                  </div>
                  <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/messages", "notification_inbox")}>
                    Open inbox
                  </ActionButton>
                </Row>
              ) : (
                recentChanges.slice(0, 4).map((item) => (
                  <Row key={item.id} data-mission-control-region="row">
                    <div>
                      <RowTitle data-mission-control-region="row-title">{item.title}</RowTitle>
                      <RowMeta data-mission-control-region="row-meta">
                        {relativeTime(item.createdAt)}
                        {item.read ? "" : " / unread"}
                      </RowMeta>
                    </div>
                    <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/messages", "notification_open")}>
                      Open notification
                    </ActionButton>
                  </Row>
                ))
              )}
            </Rows>
          </GroupBox>
        </PanelGrid>

        <PanelGrid data-mission-control-region="panel-grid">
          <GroupBox label="What happens next">
            <Rows>
              {activeChallenges.slice(0, 4).map((challenge) => (
                <Row key={challenge.id} data-mission-control-region="row">
                  <div>
                    <RowTitle data-mission-control-region="row-title">{customerChallengeTitle(challenge.title)}</RowTitle>
                    <RowMeta data-mission-control-region="row-meta">{challenge.rewardType || "challenge"} reward path</RowMeta>
                  </div>
                  <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/challenges", "next_challenge")}>
                    Work challenge
                  </ActionButton>
                </Row>
              ))}
              {activeChallenges.length === 0 && (
                <Row data-mission-control-region="row">
                  <div>
                    <RowTitle data-mission-control-region="row-title">No active challenge queue</RowTitle>
                    <RowMeta data-mission-control-region="row-meta">Rounds, side quests, and wallet activity are still available.</RowMeta>
                  </div>
                  <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/rounds", "rounds")}>
                    Open rounds
                  </ActionButton>
                </Row>
              )}
            </Rows>
          </GroupBox>

          <GroupBox label="Transaction costs">
            <Rows>
              <Row data-mission-control-region="row">
                <div>
                  <RowTitle data-mission-control-region="row-title">Wallet preflight</RowTitle>
                  <RowMeta data-mission-control-region="row-meta">
                    Writes stay bound to the active account before chain prompts open.
                  </RowMeta>
                </div>
                <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/swap", "wallet_preflight")}>
                  Open swap
                </ActionButton>
              </Row>
              <Row data-mission-control-region="row">
                <div>
                  <RowTitle data-mission-control-region="row-title">Primary wallet sync</RowTitle>
                  <RowMeta data-mission-control-region="row-meta">
                    {primaryWallet
                      ? `Last sync ${relativeTime(primaryWallet.lastSyncedAt)}`
                      : "No linked primary wallet"}
                  </RowMeta>
                </div>
                <ActionButton data-mission-control-region="button" size="sm" onClick={() => openMissionRoute("/profile", "wallets")}>
                  Open wallets
                </ActionButton>
              </Row>
            </Rows>
          </GroupBox>
        </PanelGrid>

        <Separator />
        <Detail data-mission-control-region="detail">
          Network {healthQuery.data?.chain?.network || "unknown"} / RPC {health.rpc} / version{" "}
          {healthQuery.data?.version?.packageVersion || "unknown"}
        </Detail>
      </Shell>
    </AppWindow>
  );
}
