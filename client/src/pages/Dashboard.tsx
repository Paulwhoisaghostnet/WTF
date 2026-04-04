import { useQuery } from "@tanstack/react-query";
import { GroupBox, Button, Hourglass, Separator } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { WalletButton } from "../components/WalletButton";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";
import { formatWtf } from "@shared/types";
import { useLocation } from "wouter";

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: bold;
  margin: 8px 0;
`;

const QuickAction = styled(Button)`
  width: 100%;
  margin-top: 4px;
`;

export function Dashboard() {
  const { user } = useAuth();
  const { address } = useWallet();
  const [, setLocation] = useLocation();

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
        `/api/wallets/${encodeURIComponent(balanceAddr)}/tokens?limit=1`
      ),
    enabled: !!balanceAddr,
  });

  const { data: seasons } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.get<any[]>("/api/seasons"),
  });

  const activeSeason = seasons?.find((s: any) => s.status === "active");

  const { data: activeChallenges } = useQuery({
    queryKey: ["challenges", "active"],
    queryFn: () => api.get<any[]>("/api/challenges"),
  });

  const openChallenges =
    activeChallenges?.filter((c: any) => c.status === "active") || [];

  return (
    <AppWindow title={`Dashboard - ${user?.displayName || user?.username}`}>
      <Grid>
        <GroupBox label="WTF Balance">
          <StatValue>
            {balance ? formatWtf(balance.balance) : "---"} WTF
          </StatValue>
          <WalletButton />
          {wallets && wallets.length > 0 && (
            <p style={{ fontSize: 11, marginTop: 4 }}>
              {wallets.length} wallet(s) linked
            </p>
          )}
          {portfolioSummary && (
            <p style={{ fontSize: 11, marginTop: 4 }}>
              {portfolioSummary.pagination.total} indexed token position(s)
            </p>
          )}
        </GroupBox>

        <GroupBox label="Current Season">
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
        </GroupBox>

        <GroupBox label="Active Challenges">
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
        </GroupBox>

        <GroupBox label="Quick Actions">
          <QuickAction onClick={() => setLocation("/messages")}>
            Message Board
          </QuickAction>
          <QuickAction onClick={() => setLocation("/marketplace")}>
            Marketplace
          </QuickAction>
          <QuickAction onClick={() => setLocation("/leaderboard")}>
            Leaderboard
          </QuickAction>
          <QuickAction onClick={() => setLocation("/side-quests")}>
            Side Quests
          </QuickAction>
          <QuickAction onClick={() => setLocation("/profile")}>
            My Profile
          </QuickAction>
        </GroupBox>
      </Grid>
    </AppWindow>
  );
}
