import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Separator } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { WalletButton } from "../components/WalletButton";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";
import {
  deriveMissionControlCounts,
  deriveMissionControlHealth,
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

  const wallets = walletsQuery.data ?? [];
  const primaryWallet = wallets.find((wallet) => wallet.isPrimary) ?? wallets[0];
  const activeWallet = address || primaryWallet?.walletAddress || null;
  const activeChallenges = (challengesQuery.data ?? []).filter(
    (challenge) => challenge.status === "active"
  );
  const claimableRewards = (rewardsQuery.data ?? []).filter(
    (reward) => reward.claimable && !reward.claimed
  );
  const failedJobs = (syncQuery.data?.jobs ?? []).filter(
    (job) => job.latest?.status === "failed" || Boolean(job.latest?.error)
  );
  const recentChanges = notificationsQuery.data?.items ?? [];
  const counts = useMemo(
    () =>
      deriveMissionControlCounts({
        challenges: challengesQuery.data,
        rewards: rewardsQuery.data,
        notifications: notificationsQuery.data,
        sync: syncQuery.data,
      }),
    [challengesQuery.data, notificationsQuery.data, rewardsQuery.data, syncQuery.data]
  );
  const health = useMemo(
    () => deriveMissionControlHealth(healthQuery.data),
    [healthQuery.data]
  );
  const loading =
    walletsQuery.isLoading ||
    challengesQuery.isLoading ||
    rewardsQuery.isLoading ||
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
          <ActionButton onClick={() => setLocation("/dashboard")}>Dashboard</ActionButton>
          <ActionButton onClick={() => setLocation("/challenges")}>Challenges</ActionButton>
          <ActionButton onClick={() => setLocation("/side-quests")}>Side Quests</ActionButton>
          <ActionButton onClick={() => setLocation("/messages")}>Inbox</ActionButton>
          <ActionButton onClick={() => setLocation("/profile")}>Profile</ActionButton>
          <ActionButton onClick={() => setLocation("/hoard")}>Hoard</ActionButton>
        </Actions>

        <PanelGrid>
          <GroupBox label="What counts">
            {loading ? (
              <Hourglass size={24} />
            ) : (
              <Rows>
                <Row>
                  <div>
                    <RowTitle>Active challenges</RowTitle>
                    <RowMeta>{counts.openChallenges} currently open</RowMeta>
                  </div>
                  <Button size="sm" onClick={() => setLocation("/challenges")}>
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
                  <Button size="sm" onClick={() => setLocation("/dashboard")}>
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
                  <Button size="sm" onClick={() => setLocation("/challenges")}>
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
                    <Button size="sm" onClick={() => setLocation("/challenges")}>
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
                    <Button size="sm" onClick={() => setLocation("/dashboard")}>
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
                  <Button size="sm" onClick={() => setLocation("/messages")}>
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
                    <Button size="sm" onClick={() => setLocation("/messages")}>
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
                  <Button size="sm" onClick={() => setLocation("/challenges")}>
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
                  <Button size="sm" onClick={() => setLocation("/rounds")}>
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
                <Button size="sm" onClick={() => setLocation("/swap")}>
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
                <Button size="sm" onClick={() => setLocation("/profile")}>
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
