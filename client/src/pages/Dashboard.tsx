import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GroupBox,
  Button,
  Hourglass,
  Separator,
  Tabs,
  Tab,
  TabBody,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableBody,
  TableDataCell,
  Fieldset,
} from "react95";
import styled from "styled-components";
import type { LucideIcon } from "lucide-react";
import { Inbox, Store, Trophy, UserRound, UsersRound, Zap } from "lucide-react";
import { AppWindow } from "../components/layout/AppWindow";
import { YearProgressWidget } from "../features/desktop/widgets/YearProgressWidget";
import { WalletButton } from "../components/WalletButton";
import { OwnedTokensGallery } from "../components/OwnedTokensGallery";
import {
  cockpitQueryKeys,
  useCockpitChallengesQuery,
  useCockpitSyncStatusQuery,
} from "../features/cockpit/cockpit-queries";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";
import { usePresentationShell } from "../lib/presentation-shell";
import { formatWtf } from "@shared/types";
import { useLocation } from "wouter";
import { DiscoveryCard } from "../features/discovery/DiscoveryCard";
import { RecoverableIpfsImage } from "../components/RecoverableIpfsImage";

const DASHBOARD_CAPTION_TYPE = "var(--wtf-type-caption, 13px)";

type GammaDashboardAction = {
  key: string;
  label: string;
  detail: string;
  route: string;
  icon: LucideIcon;
};

const GAMMA_DASHBOARD_ACTIONS: GammaDashboardAction[] = [
  {
    key: "daily",
    label: "Daily proof",
    detail: "Side quests open today's XP path.",
    route: "/side-quests",
    icon: Zap,
  },
  {
    key: "challenges",
    label: "Challenges",
    detail: "See active game loops and rewards.",
    route: "/challenges",
    icon: Trophy,
  },
  {
    key: "people",
    label: "People",
    detail: "Find active creators and collectors.",
    route: "/w",
    icon: UsersRound,
  },
  {
    key: "apps",
    label: "Apps",
    detail: "Unlock tools and app passes.",
    route: "/wtfiam?category=apps",
    icon: Store,
  },
  {
    key: "inbox",
    label: "Inbox",
    detail: "Messages, alerts, and replies.",
    route: "/messages",
    icon: Inbox,
  },
  {
    key: "profile",
    label: "Profile",
    detail: "Identity, wallet, and public card.",
    route: "/profile",
    icon: UserRound,
  },
];

// ── Formatting helpers for the new analytics cards ─────────────────
//
// Mutez → XTZ with a compact decimal count that keeps big numbers
// readable (1.2M ꜩ) while preserving precision for small positions.

function formatXtzFromMutez(mutez: string | null | undefined): string {
  if (mutez === null || mutez === undefined || mutez === "") return "—";
  const n = Number(mutez) / 1e6;
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 10_000) return Math.round(n).toLocaleString();
  if (abs >= 1) return n.toFixed(1);
  return n.toFixed(3);
}

function formatUsd(usd: string | null | undefined): string {
  if (usd === null || usd === undefined || usd === "") return "—";
  const n = Number(usd);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs).toLocaleString()}`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(4)}`;
}

function safeBigInt(value: string | number | bigint | null | undefined): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (value === null || value === undefined || value === "") return 0n;
    return BigInt(String(value));
  } catch {
    return 0n;
  }
}

function addrLabel(addr: string, domain?: string | null): string {
  if (domain) return domain;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  if (delta < 60_000) return "just now";
  if (delta < 3600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3600_000)}h ago`;
  const days = Math.round(delta / 86_400_000);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

const dashboardRegionAttrs = (region: string): any => ({
  "data-dashboard-region": region,
});

const DashboardSurface = styled.div.attrs(dashboardRegionAttrs("surface"))`
  display: grid;
  gap: 8px;

  &[data-dashboard-presentation-host="gamma"] {
    background: #070706;
    background-image: none;
    color: #f2ead9;
  }

  &[data-dashboard-presentation-host="gamma"],
  &[data-dashboard-presentation-host="gamma"] * {
    box-shadow: none !important;
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  &[data-dashboard-presentation-host="gamma"] * {
    background-image: none !important;
  }

  &[data-dashboard-presentation-host="gamma"] :where(button, input, textarea, select, p, span, strong, div, section, article, nav, h1, h2, h3, h4, label, legend, fieldset, table, th, td) {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-dashboard-presentation-host="gamma"] :where(p, span, div, td, th, label, legend) {
    color: #f2ead9 !important;
  }

  &[data-dashboard-presentation-host="gamma"] :where(code, pre) {
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace !important;
  }

  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region] {
    border-color: rgba(242, 234, 217, 0.2) !important;
    border-radius: 6px !important;
  }

  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="panel"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="metric"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="wallet-row"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="activity-row"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="passport-card"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="avatar"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="thumb"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="fieldset"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="table"] {
    background: #0b0b0a !important;
    border: 1px solid rgba(242, 234, 217, 0.2) !important;
    color: #f2ead9 !important;
  }

  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="tabs"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="tab-panel"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="overview-grid"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="portfolio-metric-grid"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="quick-actions"],
  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="discovery"] {
    background: transparent !important;
    border-color: transparent !important;
  }

  &[data-dashboard-presentation-host="gamma"] [data-dashboard-region="pnl"] {
    background: #11110f !important;
    border: 1px solid #00d2ff !important;
    color: #f2ead9 !important;
  }

  &[data-dashboard-presentation-host="gamma"] button:not(:disabled),
  &[data-dashboard-presentation-host="gamma"] input:not([type="checkbox"]):not([type="radio"]),
  &[data-dashboard-presentation-host="gamma"] select,
  &[data-dashboard-presentation-host="gamma"] textarea {
    background: #11110f !important;
    border-color: rgba(242, 234, 217, 0.28) !important;
    border-radius: 6px !important;
    color: #f2ead9 !important;
  }

  &[data-dashboard-presentation-host="gamma"] button[aria-selected="true"],
  &[data-dashboard-presentation-host="gamma"] button[aria-pressed="true"] {
    border-color: #00d2ff !important;
  }

  &[data-dashboard-presentation-host="gamma"] table {
    width: 100%;
    border-collapse: collapse;
  }

  &[data-dashboard-presentation-host="gamma"] th,
  &[data-dashboard-presentation-host="gamma"] td {
    background: #0b0b0a !important;
    border-color: rgba(242, 234, 217, 0.18) !important;
  }

  &[data-dashboard-presentation-host="gamma"] a {
    color: #00d2ff !important;
  }
`;

const DashboardGroupBox = styled(GroupBox).attrs(dashboardRegionAttrs("panel"))``;
const DashboardFieldset = styled(Fieldset).attrs(dashboardRegionAttrs("fieldset"))``;
const DashboardTable = styled(Table).attrs(dashboardRegionAttrs("table"))``;

const TabPanel = styled.div.attrs(dashboardRegionAttrs("tab-panel"))`
  padding: 8px 0;
  min-height: 200px;
`;

const StatValue = styled.div`
  font-size: 22px;
  font-weight: bold;
  margin: 6px 0;
`;

const QuickAction = styled(Button)`
  width: 100%;
  margin-top: 4px;
`;

// Compact 3-column grid for the Quick Actions menu — cuts the vertical
// footprint of the dashboard in ~1/3 vs the original stacked full-width
// buttons.  Falls back to 2 columns on narrow viewports.
const QuickActionGrid = styled.div.attrs(dashboardRegionAttrs("quick-actions"))`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  @media (max-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const CompactAction = styled(Button)`
  width: 100%;
  font-size: var(--wtf-type-caption, 13px);
  padding: 2px 4px;
  min-height: var(--wtf-control-min-height, 32px);
`;

const GammaDailyActionRail = styled.section.attrs(dashboardRegionAttrs("gamma-daily-actions"))`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 440px) {
    grid-template-columns: 1fr;
  }
`;

const GammaDailyActionButton = styled.button.attrs(dashboardRegionAttrs("gamma-daily-action"))`
  min-height: 68px;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(242, 234, 217, 0.2);
  text-align: left;

  svg {
    margin-top: 2px;
    color: #00d2ff;
  }

  b,
  span {
    display: block;
  }

  b {
    margin-bottom: 2px;
    font-size: 13px;
  }

  span {
    font-size: ${DASHBOARD_CAPTION_TYPE};
    line-height: 1.35;
  }
`;

// ── Portfolio analytics card styling ───────────────────────────────

const PortfolioMetricGrid = styled.div.attrs(dashboardRegionAttrs("portfolio-metric-grid"))`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  @media (max-width: 540px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const PortfolioMetric = styled.div.attrs(dashboardRegionAttrs("metric"))`
  border: 1px solid #808080;
  background: #dfdfdf;
  padding: 4px 6px;
  min-width: 0;
`;

const MetricLabel = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  text-transform: none;
  letter-spacing: 0;
  color: #404040;
`;

const MetricValue = styled.div`
  font-size: 13px;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MetricSub = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: #404040;
`;

const PnlBadge = styled.span.attrs(dashboardRegionAttrs("pnl"))<{ $positive?: boolean; $negative?: boolean }>`
  display: inline-block;
  padding: 1px 6px;
  border: 1px solid
    ${(p) =>
      p.$positive ? "#0d7b0d" : p.$negative ? "#a00" : "#606060"};
  background: ${(p) =>
    p.$positive ? "#d7f7d7" : p.$negative ? "#f7d7d7" : "#e0e0e0"};
  color: ${(p) =>
    p.$positive ? "#0d7b0d" : p.$negative ? "#a00" : "#404040"};
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
`;

const WalletRow = styled.div.attrs(dashboardRegionAttrs("wallet-row"))`
  display: grid;
  grid-template-columns: minmax(0, 2fr) 1fr 1fr 1fr 1fr;
  gap: 6px;
  padding: 4px 0;
  border-top: 1px dashed #a0a0a0;
  font-size: var(--wtf-type-caption, 13px);
  align-items: center;
  &:first-of-type {
    border-top: none;
  }
`;

const WalletRowHead = styled(WalletRow)`
  border-top: none;
  font-weight: bold;
  font-size: var(--wtf-type-caption, 13px);
  text-transform: none;
  color: #404040;
`;

const ActivityRow = styled.div.attrs(dashboardRegionAttrs("activity-row"))`
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) minmax(0, 0.9fr) auto;
  gap: 6px;
  padding: 4px 0;
  border-top: 1px dashed #a0a0a0;
  font-size: var(--wtf-type-caption, 13px);
  align-items: center;
  &:first-of-type {
    border-top: none;
  }
`;

const Thumb = styled.div.attrs(dashboardRegionAttrs("thumb"))`
  width: 36px;
  height: 36px;
  border: 1px solid #808080;
  background: #000;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const PassportCard = styled.div.attrs(dashboardRegionAttrs("passport-card"))`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const Avatar = styled.div.attrs(dashboardRegionAttrs("avatar"))`
  width: 54px;
  height: 54px;
  border: 2px solid #808080;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #c0c0c0;
  overflow: hidden;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const OverviewGrid = styled.div.attrs(dashboardRegionAttrs("overview-grid"))`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

export function Dashboard() {
  const { user } = useAuth();
  const { address } = useWallet();
  const presentation = usePresentationShell();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const { data: wallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => api.get<any[]>("/api/wallets"),
  });

  const primaryWallet = wallets?.find((w) => w.isPrimary) || wallets?.[0];
  const balanceAddr = address || primaryWallet?.walletAddress;

  const { data: balance } = useQuery({
    queryKey: ["wtf-balance", balanceAddr],
    queryFn: () =>
      api.get<{ balance: string }>(`/api/wallets/${balanceAddr}/balance`),
    enabled: !!balanceAddr,
  });

  const { data: portfolioSummary } = useQuery({
    queryKey: ["wallet-portfolio-summary", balanceAddr],
    queryFn: () =>
      api.get<{ items: any[]; pagination: { total: number } }>(
        `/api/wallets/${encodeURIComponent(balanceAddr!)}/tokens?limit=1`
      ),
    enabled: !!balanceAddr,
  });

  const { data: seasons } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.get<any[]>("/api/seasons"),
  });

  const activeSeason = seasons?.find((s: any) => s.status === "active");

  const { data: activeChallenges } = useCockpitChallengesQuery();

  const openChallenges =
    activeChallenges?.filter((c: any) => c.status === "active") || [];

  const { data: overview } = useQuery({
    queryKey: ["cockpit-overview"],
    queryFn: () => api.get<any>("/api/cockpit/overview"),
    enabled: !!user,
  });

  const { data: syncStatus } = useCockpitSyncStatusQuery();

  const { data: activity } = useQuery({
    queryKey: ["cockpit-activity"],
    queryFn: () => api.get<any>("/api/cockpit/activity?limit=100"),
    enabled: activeTab === 2,
  });

  const { data: cockpitCollections } = useQuery({
    queryKey: ["cockpit-collections"],
    queryFn: () => api.get<any>("/api/cockpit/collections"),
    enabled: activeTab === 3,
  });

  // Portfolio analytics — new in phase 4.  Totals + per-wallet slice
  // + two activity feeds.  Cheap enough to refetch every 5 min so the
  // cockpit mirrors new backfill data promptly.
  const { data: portfolio } = useQuery<any>({
    queryKey: ["portfolio-summary"],
    queryFn: () => api.get<any>("/api/portfolio/summary"),
    enabled: !!user && activeTab === 0,
    refetchInterval: 5 * 60_000,
  });

  const { data: recentAcq } = useQuery<any>({
    queryKey: ["portfolio-acquisitions"],
    queryFn: () => api.get<any>("/api/portfolio/activity/acquisitions?limit=6"),
    enabled: !!user && activeTab === 0,
    refetchInterval: 5 * 60_000,
  });

  const { data: recentSales } = useQuery<any>({
    queryKey: ["portfolio-sales"],
    queryFn: () => api.get<any>("/api/portfolio/activity/sales?limit=6"),
    enabled: !!user && activeTab === 0,
    refetchInterval: 5 * 60_000,
  });

  const setPrimary = useMutation({
    mutationFn: (id: number) => api.put(`/api/wallets/${id}/primary`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
  });

  const unlinkWallet = useMutation({
    mutationFn: (id: number) => api.delete(`/api/wallets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["cockpit-overview"] });
    },
  });

  const enqueueSync = useMutation({
    mutationFn: (wallet: string) =>
      api.post(`/api/cockpit/sync/${encodeURIComponent(wallet)}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cockpitQueryKeys.syncStatus });
    },
  });

  const walletOptions =
    wallets?.map((w) => ({
      label: w.preferredTezosDomain || w.tezDomain || `${w.walletAddress.slice(0, 6)}...${w.walletAddress.slice(-4)}`,
      value: w.walletAddress,
    })) ?? [];

  const walletDomainByAddr = new Map<string, string | null>();
  for (const w of wallets ?? []) {
    walletDomainByAddr.set(w.walletAddress, w.preferredTezosDomain ?? w.tezDomain ?? null);
  }

  return (
    <AppWindow title={`Dashboard - ${user?.displayName || user?.username}`}>
      <DashboardSurface
        data-dashboard-surface="cockpit"
        data-dashboard-presentation-host={presentation.host}
      >
      {presentation.host === "gamma" ? (
        <GammaDailyActionRail aria-label="Gamma dashboard next actions" data-dashboard-gamma-next-actions>
          {GAMMA_DASHBOARD_ACTIONS.map((action) => (
            <GammaDailyActionButton
              key={action.key}
              type="button"
              onClick={() => setLocation(action.route)}
              aria-label={`Open ${action.label}: ${action.detail}`}
              data-dashboard-gamma-action={action.key}
              data-dashboard-launch={action.route}
            >
              <action.icon size={18} aria-hidden="true" />
              <span>
                <b>{action.label}</b>
                <span>{action.detail}</span>
              </span>
            </GammaDailyActionButton>
          ))}
        </GammaDailyActionRail>
      ) : null}
      <div data-dashboard-region="tabs">
        <Tabs value={activeTab} onChange={(v: number) => setActiveTab(v)}>
          <Tab value={0}>Overview</Tab>
          <Tab value={1}>Holdings</Tab>
          <Tab value={2}>Activity</Tab>
          <Tab value={3}>Collections</Tab>
          <Tab value={4}>Sync</Tab>
          <Tab value={5}>Wallets</Tab>
        </Tabs>
      </div>
      <TabBody data-dashboard-region="tab-body">
        {activeTab === 0 && (
          <TabPanel>
            <OverviewGrid>
              <DashboardGroupBox label="Passport">
                <PassportCard>
                  <Avatar>
                    {user?.pfpImageUrl || user?.avatarUrl ? (
                      <img src={user?.pfpImageUrl || user?.avatarUrl} alt="pfp" />
                    ) : (
                      <span style={{ fontSize: 20 }}>👤</span>
                    )}
                  </Avatar>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: "bold" }}>
                      {user?.displayName || user?.username}
                    </div>
                    <div style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                      @{user?.username} · {user?.role}
                    </div>
                    <div style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                      Joined{" "}
                      {user?.createdAt
                        ? new Date(user.createdAt).toLocaleDateString()
                        : "---"}
                    </div>
                  </div>
                </PassportCard>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <Button size="sm" onClick={() => setLocation("/profile")}>
                    Edit Profile
                  </Button>
                  {user?.username && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setLocation(`/user/${encodeURIComponent(user.username)}`)
                      }
                    >
                      Public View
                    </Button>
                  )}
                </div>
              </DashboardGroupBox>

              <DashboardGroupBox label="WTF Balance">
                <StatValue>
                  {balance ? formatWtf(balance.balance) : "---"} WTF
                </StatValue>
                <WalletButton />
                {wallets && wallets.length > 0 && (
                  <p style={{ fontSize: DASHBOARD_CAPTION_TYPE, marginTop: 4 }}>
                    {wallets.length} wallet(s) linked
                  </p>
                )}
                {portfolioSummary && (
                  <p style={{ fontSize: DASHBOARD_CAPTION_TYPE, marginTop: 4 }}>
                    {portfolioSummary.pagination.total} indexed token position(s)
                  </p>
                )}
              </DashboardGroupBox>

              <DashboardGroupBox label="Cockpit summary">
                {overview ? (
                  <DashboardFieldset label="Holdings">
                    <div style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                      Tokens:{" "}
                      <strong>{overview.holdings?.totalTokens ?? 0}</strong>
                      <br />
                      Contracts:{" "}
                      <strong>{overview.holdings?.totalContracts ?? 0}</strong>
                    </div>
                  </DashboardFieldset>
                ) : (
                  <Hourglass size={24} />
                )}
              </DashboardGroupBox>

              <DashboardGroupBox label="Current Season">
                {activeSeason ? (
                  <>
                    <StatValue>{activeSeason.name}</StatValue>
                    <p>Season {activeSeason.number}</p>
                    <QuickAction onClick={() => setLocation("/rounds")}>
                      View Rounds
                    </QuickAction>
                  </>
                ) : (
                  <p>No active season</p>
                )}
              </DashboardGroupBox>

              <DashboardGroupBox label="Active Challenges">
                <StatValue>{openChallenges.length}</StatValue>
                {openChallenges.slice(0, 3).map((c: any) => (
                  <div key={c.id} style={{ marginBottom: 4 }}>
                    <Button
                      size="sm"
                      onClick={() => setLocation(`/challenges`)}
                      fullWidth
                    >
                      {c.title}
                    </Button>
                  </div>
                ))}
                <QuickAction onClick={() => setLocation("/challenges")}>
                  All Challenges
                </QuickAction>
              </DashboardGroupBox>

              <DashboardGroupBox label="Portfolio overview">
                {!portfolio ? (
                  <Hourglass size={24} />
                ) : portfolio.totals.wallets === 0 ? (
                  <p style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                    Link a wallet to see portfolio analytics.
                  </p>
                ) : (
                  <>
                    <PortfolioMetricGrid>
                      <PortfolioMetric>
                        <MetricLabel>Tokens</MetricLabel>
                        <MetricValue>
                          {portfolio.totals.tokensHeld.toLocaleString()}
                        </MetricValue>
                        <MetricSub>
                          {portfolio.totals.contractsHeld.toLocaleString()}{" "}
                          contracts
                        </MetricSub>
                      </PortfolioMetric>
                      <PortfolioMetric>
                        <MetricLabel>Cost basis</MetricLabel>
                        <MetricValue>
                          {formatXtzFromMutez(
                            portfolio.totals.costBasisMutez
                          )}{" "}
                          ꜩ
                        </MetricValue>
                        <MetricSub>
                          {formatUsd(portfolio.totals.costBasisUsd)} USD
                        </MetricSub>
                      </PortfolioMetric>
                      <PortfolioMetric>
                        <MetricLabel>Est. value</MetricLabel>
                        <MetricValue>
                          {formatXtzFromMutez(
                            portfolio.totals.estimatedValueMutez
                          )}{" "}
                          ꜩ
                        </MetricValue>
                        <MetricSub>
                          {formatUsd(portfolio.totals.estimatedValueUsd)} USD
                        </MetricSub>
                      </PortfolioMetric>
                      <PortfolioMetric>
                        <MetricLabel>Unrealised P&amp;L</MetricLabel>
                        <MetricValue>
                          <PnlBadge
                            $positive={
                              safeBigInt(portfolio.totals.unrealizedPnlMutez) > 0n
                            }
                            $negative={
                              safeBigInt(portfolio.totals.unrealizedPnlMutez) < 0n
                            }
                          >
                            {formatXtzFromMutez(
                              portfolio.totals.unrealizedPnlMutez
                            )}{" "}
                            ꜩ
                          </PnlBadge>
                        </MetricValue>
                        <MetricSub>
                          {formatUsd(portfolio.totals.unrealizedPnlUsd)} USD
                        </MetricSub>
                      </PortfolioMetric>
                      <PortfolioMetric>
                        <MetricLabel>Realised P&amp;L</MetricLabel>
                        <MetricValue>
                          <PnlBadge
                            $positive={safeBigInt(portfolio.totals.realizedPnlMutez) > 0n}
                            $negative={safeBigInt(portfolio.totals.realizedPnlMutez) < 0n}
                          >
                            {formatXtzFromMutez(
                              portfolio.totals.realizedPnlMutez ??
                                portfolio.totals.realizedProceedsMutez
                            )}{" "}
                            ꜩ
                          </PnlBadge>
                        </MetricValue>
                        <MetricSub>
                          proceeds{" "}
                          {formatXtzFromMutez(
                            portfolio.totals.realizedProceedsMutez
                          )}{" "}
                          ꜩ
                        </MetricSub>
                      </PortfolioMetric>
                      <PortfolioMetric>
                        <MetricLabel>Cost coverage</MetricLabel>
                        <MetricValue>
                          {(
                            portfolio.totals.pricedPositions ??
                            portfolio.totals.tokensHeld -
                              portfolio.totals.tokensWithUnknownCost
                          ).toLocaleString()}{" "}
                          / {portfolio.totals.tokensHeld.toLocaleString()}
                        </MetricValue>
                        <MetricSub>
                          {portfolio.totals.tokensWithUnknownCost > 0
                            ? `${portfolio.totals.tokensWithUnknownCost.toLocaleString()} unknown/free`
                            : "fully priced"}
                        </MetricSub>
                      </PortfolioMetric>
                    </PortfolioMetricGrid>
                    <p
                      style={{
                        fontSize: DASHBOARD_CAPTION_TYPE,
                        marginTop: 6,
                        color: "#404040",
                      }}
                    >
                      {portfolio.pnlMethod === "lot_fifo"
                        ? "P&L uses FIFO lot costing from purchase/mint evidence. "
                        : "P&L is using the legacy latest-buy fallback. "}
                      Totals include all {portfolio.totals.wallets} linked
                      wallet{portfolio.totals.wallets === 1 ? "" : "s"}.
                      Gift/free-transfer unknowns and BIN-trap floors are
                      visible but excluded from priced totals
                      {portfolio.totals.binTrapPositions
                        ? ` (${portfolio.totals.binTrapPositions} floor outlier${portfolio.totals.binTrapPositions === 1 ? "" : "s"})`
                        : ""}
                      .
                      {portfolio.totals.acquisitionConfidence && (
                        <>
                          {" "}
                          Evidence:{" "}
                          {portfolio.totals.acquisitionConfidence.purchase ?? 0} buys,{" "}
                          {portfolio.totals.acquisitionConfidence.mint ?? 0} mints,{" "}
                          {portfolio.totals.acquisitionConfidence.free_transfer ?? 0} free transfers.
                        </>
                      )}
                    </p>
                  </>
                )}
              </DashboardGroupBox>

              <DashboardGroupBox label="By wallet">
                {!portfolio ? (
                  <Hourglass size={24} />
                ) : portfolio.perWallet.length === 0 ? (
                  <p style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>No linked wallets yet.</p>
                ) : (
                  <div>
                    <WalletRowHead>
                      <span>Wallet</span>
                      <span style={{ textAlign: "right" }}>Tokens</span>
                      <span style={{ textAlign: "right" }}>Cost</span>
                      <span style={{ textAlign: "right" }}>Value</span>
                      <span style={{ textAlign: "right" }}>P&amp;L</span>
                    </WalletRowHead>
                    {portfolio.perWallet.map((w: any) => {
                      const pnlMutez =
                        safeBigInt(w.estimatedValueMutez) -
                        safeBigInt(w.costBasisMutez);
                      return (
                        <WalletRow key={w.walletAddress}>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={w.walletAddress}
                          >
                            {addrLabel(
                              w.walletAddress,
                              walletDomainByAddr.get(w.walletAddress)
                            )}
                          </span>
                          <span style={{ textAlign: "right" }}>
                            {w.tokensHeld.toLocaleString()}
                          </span>
                          <span style={{ textAlign: "right" }}>
                            {formatXtzFromMutez(w.costBasisMutez)} ꜩ
                          </span>
                          <span style={{ textAlign: "right" }}>
                            {formatXtzFromMutez(w.estimatedValueMutez)} ꜩ
                          </span>
                          <span style={{ textAlign: "right" }}>
                            <PnlBadge
                              $positive={pnlMutez > 0n}
                              $negative={pnlMutez < 0n}
                            >
                              {formatXtzFromMutez(pnlMutez.toString())} ꜩ
                            </PnlBadge>
                          </span>
                        </WalletRow>
                      );
                    })}
                  </div>
                )}
              </DashboardGroupBox>

              <DashboardGroupBox label="Recent acquisitions">
                {!recentAcq ? (
                  <Hourglass size={24} />
                ) : recentAcq.rows.length === 0 ? (
                  <p style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                    No acquisitions indexed yet.
                  </p>
                ) : (
                  <div>
                    {recentAcq.rows.slice(0, 6).map((r: any, idx: number) => (
                      <ActivityRow key={`${r.opHash ?? "noop"}-${idx}`}>
                        <Thumb>
                          {r.thumbnailUri ? (
                            <RecoverableIpfsImage src={r.thumbnailUri} alt="" />
                          ) : null}
                        </Thumb>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={r.tokenName || `${r.tokenContract}:${r.tokenId}`}
                        >
                          {r.tokenName ||
                            `${r.tokenContract.slice(0, 6)}…:${r.tokenId}`}
                          <div style={{ fontSize: DASHBOARD_CAPTION_TYPE, color: "#404040" }}>
                            {r.acquisitionType === "mint" ? "Minted" : "Bought"} ·{" "}
                            {relTime(r.acquiredAt)}
                          </div>
                        </span>
                        <span
                          style={{ fontSize: DASHBOARD_CAPTION_TYPE, color: "#404040" }}
                          title={r.walletAddress}
                        >
                          {addrLabel(
                            r.walletAddress,
                            walletDomainByAddr.get(r.walletAddress)
                          )}
                          {r.marketplace ? ` · ${r.marketplace}` : ""}
                        </span>
                        <span style={{ textAlign: "right" }}>
                          {formatXtzFromMutez(r.priceMutez)} ꜩ
                        </span>
                      </ActivityRow>
                    ))}
                  </div>
                )}
              </DashboardGroupBox>

              <DashboardGroupBox label="Recent sales (realised P&amp;L)">
                {!recentSales ? (
                  <Hourglass size={24} />
                ) : recentSales.rows.length === 0 ? (
                  <p style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>No sales indexed yet.</p>
                ) : (
                  <div>
                    {recentSales.rows.slice(0, 6).map((r: any, idx: number) => {
                      const pnlMutez = r.realizedPnlMutez
                        ? BigInt(r.realizedPnlMutez)
                        : null;
                      return (
                        <ActivityRow key={`${r.opHash}-${idx}`}>
                          <Thumb>
                            {r.thumbnailUri ? (
                              <RecoverableIpfsImage src={r.thumbnailUri} alt="" />
                            ) : null}
                          </Thumb>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={
                              r.tokenName ||
                              `${r.tokenContract}:${r.tokenId}`
                            }
                          >
                            {r.tokenName ||
                              `${r.tokenContract.slice(0, 6)}…:${r.tokenId}`}
                            <div style={{ fontSize: DASHBOARD_CAPTION_TYPE, color: "#404040" }}>
                              Sold · {relTime(r.soldAt)}
                            </div>
                          </span>
                          <span
                            style={{ fontSize: DASHBOARD_CAPTION_TYPE, color: "#404040" }}
                            title={r.walletAddress}
                          >
                            {addrLabel(
                              r.walletAddress,
                              walletDomainByAddr.get(r.walletAddress)
                            )}
                            {r.marketplace ? ` · ${r.marketplace}` : ""}
                          </span>
                          <span style={{ textAlign: "right" }}>
                            <div>{formatXtzFromMutez(r.priceMutez)} ꜩ</div>
                            {pnlMutez !== null && (
                              <PnlBadge
                                $positive={pnlMutez > 0n}
                                $negative={pnlMutez < 0n}
                              >
                                {formatXtzFromMutez(pnlMutez.toString())} ꜩ
                              </PnlBadge>
                            )}
                          </span>
                        </ActivityRow>
                      );
                    })}
                  </div>
                )}
              </DashboardGroupBox>

              <YearProgressWidget />

              <DashboardGroupBox label="Quick Actions">
                <QuickActionGrid>
                  <CompactAction onClick={() => setLocation("/w")}>
                    W Feed
                  </CompactAction>
                  <CompactAction onClick={() => setLocation("/tv")}>
                    WTF TV
                  </CompactAction>
                  <CompactAction onClick={() => setLocation("/messages")}>
                    Inbox
                  </CompactAction>
                  <CompactAction onClick={() => setLocation("/messageboard")}>
                    Board
                  </CompactAction>
                  <CompactAction onClick={() => setLocation("/marketplace")}>
                    Market
                  </CompactAction>
                  <CompactAction onClick={() => setLocation("/trade-boards")}>
                    Trades
                  </CompactAction>
                  <CompactAction onClick={() => setLocation("/leaderboard")}>
                    Ladder
                  </CompactAction>
                  <CompactAction onClick={() => setLocation("/side-quests")}>
                    Quests
                  </CompactAction>
                  <CompactAction onClick={() => setLocation("/profile")}>
                    Profile
                  </CompactAction>
                </QuickActionGrid>
              </DashboardGroupBox>
            </OverviewGrid>

            <div data-dashboard-region="discovery" style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <DiscoveryCard />
            </div>
          </TabPanel>
        )}

        {activeTab === 1 && (
          <TabPanel>
            <DashboardGroupBox label="Indexed holdings">
              <p style={{ fontSize: DASHBOARD_CAPTION_TYPE, marginBottom: 8 }}>
                Same data as Profile — sourced from `wallet_holdings` + shared
                metadata cache.
              </p>
              <OwnedTokensGallery
                walletOptions={walletOptions}
                userWallets={wallets?.map((w) => w.walletAddress)}
                pageSize={48}
              />
            </DashboardGroupBox>
          </TabPanel>
        )}

        {activeTab === 2 && (
          <TabPanel>
            <DashboardGroupBox label="Recent wallet events">
              {!activity ? (
                <Hourglass size={24} />
              ) : activity.items?.length === 0 ? (
                <p style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>No events indexed yet.</p>
              ) : (
                <DashboardTable>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>Time</TableHeadCell>
                      <TableHeadCell>Wallet</TableHeadCell>
                      <TableHeadCell>Type</TableHeadCell>
                      <TableHeadCell>Token</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activity.items.map((ev: any) => (
                      <TableRow key={ev.id}>
                        <TableDataCell style={{ whiteSpace: "nowrap" }}>
                          {ev.timestamp
                            ? new Date(ev.timestamp).toLocaleString()
                            : "—"}
                        </TableDataCell>
                        <TableDataCell style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                          {String(ev.walletAddress || "").slice(0, 10)}…
                        </TableDataCell>
                        <TableDataCell>{ev.eventType}</TableDataCell>
                        <TableDataCell style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                          {ev.tokenContract ? `${ev.tokenContract}:${ev.tokenId}` : "—"}
                          {ev.tokenName ? ` · ${ev.tokenName}` : ""}
                        </TableDataCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DashboardTable>
              )}
            </DashboardGroupBox>
          </TabPanel>
        )}

        {activeTab === 3 && (
          <TabPanel>
            <DashboardGroupBox label="Collections">
              {!cockpitCollections ? (
                <Hourglass size={24} />
              ) : cockpitCollections.collections?.length === 0 ? (
                <p style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>No collections yet.</p>
              ) : (
                <DashboardTable>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>Title</TableHeadCell>
                      <TableHeadCell>Type</TableHeadCell>
                      <TableHeadCell>Items</TableHeadCell>
                      <TableHeadCell>Updated</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cockpitCollections.collections.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableDataCell>{c.title}</TableDataCell>
                        <TableDataCell>{c.type}</TableDataCell>
                        <TableDataCell>{c.itemCount}</TableDataCell>
                        <TableDataCell style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                          {c.updatedAt
                            ? new Date(c.updatedAt).toLocaleDateString()
                            : "—"}
                        </TableDataCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DashboardTable>
              )}
            </DashboardGroupBox>
          </TabPanel>
        )}

        {activeTab === 4 && (
          <TabPanel>
            <DashboardGroupBox label="Scheduler health">
              {!syncStatus ? (
                <Hourglass size={24} />
              ) : (
                <DashboardTable>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>Job</TableHeadCell>
                      <TableHeadCell>Interval</TableHeadCell>
                      <TableHeadCell>Last status</TableHeadCell>
                      <TableHeadCell>Finished</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {syncStatus.jobs?.map((j: any) => (
                      <TableRow key={j.name}>
                        <TableDataCell>{j.name}</TableDataCell>
                        <TableDataCell>{j.intervalMs} ms</TableDataCell>
                        <TableDataCell>
                          {j.latest?.status ?? "—"}
                          {j.latest?.error ? ` (${j.latest.error})` : ""}
                        </TableDataCell>
                        <TableDataCell style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                          {j.latest?.finishedAt
                            ? new Date(j.latest.finishedAt).toLocaleString()
                            : "—"}
                        </TableDataCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DashboardTable>
              )}
              <Separator />
              <DashboardFieldset label="Sync one wallet now">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {wallets?.map((w) => (
                    <Button
                      key={w.id}
                      size="sm"
                      onClick={() => enqueueSync.mutate(w.walletAddress)}
                      disabled={enqueueSync.isPending}
                    >
                      Sync {w.walletAddress.slice(0, 5)}…
                    </Button>
                  ))}
                </div>
              </DashboardFieldset>
            </DashboardGroupBox>
          </TabPanel>
        )}

        {activeTab === 5 && (
          <TabPanel>
            <DashboardGroupBox label="Linked wallets">
              <DashboardTable>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Address</TableHeadCell>
                    <TableHeadCell>Tezos identity</TableHeadCell>
                    <TableHeadCell>Tokens</TableHeadCell>
                    <TableHeadCell>Primary</TableHeadCell>
                    <TableHeadCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wallets?.map((w) => (
                    <TableRow key={w.id}>
                      <TableDataCell style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                        {w.walletAddress}
                      </TableDataCell>
                      <TableDataCell style={{ fontSize: DASHBOARD_CAPTION_TYPE }}>
                        {w.preferredTezosDomain || w.tezDomain || "---"}
                        {w.ownedTezosDomains?.length ? (
                          <div style={{ fontSize: DASHBOARD_CAPTION_TYPE, color: "#555" }}>
                            {w.ownedTezosDomains.length} detected
                          </div>
                        ) : null}
                      </TableDataCell>
                      <TableDataCell>{w.tokenCount ?? 0}</TableDataCell>
                      <TableDataCell>{w.isPrimary ? "Yes" : ""}</TableDataCell>
                      <TableDataCell>
                        {!w.isPrimary && (
                          <Button
                            size="sm"
                            onClick={() => setPrimary.mutate(w.id)}
                            disabled={setPrimary.isPending}
                          >
                            Set primary
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => {
                            if (confirm("Unlink this wallet?")) unlinkWallet.mutate(w.id);
                          }}
                          disabled={unlinkWallet.isPending}
                        >
                          Remove
                        </Button>
                      </TableDataCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DashboardTable>
              <Separator />
              <DashboardFieldset label="Add a wallet">
                <p style={{ fontSize: DASHBOARD_CAPTION_TYPE, marginBottom: 6 }}>
                  New wallets require a signed proof on the Profile page.
                </p>
                <Button size="sm" onClick={() => setLocation("/profile")}>
                  Open Profile → Wallets
                </Button>
              </DashboardFieldset>
            </DashboardGroupBox>
          </TabPanel>
        )}
      </TabBody>
      </DashboardSurface>
    </AppWindow>
  );
}
