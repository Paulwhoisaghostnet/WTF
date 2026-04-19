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
import { AppWindow } from "../components/layout/AppWindow";
import { WalletButton } from "../components/WalletButton";
import { OwnedTokensGallery } from "../components/OwnedTokensGallery";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";
import { formatWtf } from "@shared/types";
import { useLocation } from "wouter";

const TabPanel = styled.div`
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

const PassportCard = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const Avatar = styled.div`
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

const OverviewGrid = styled.div`
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

  const { data: activeChallenges } = useQuery({
    queryKey: ["challenges", "active"],
    queryFn: () => api.get<any[]>("/api/challenges"),
  });

  const openChallenges =
    activeChallenges?.filter((c: any) => c.status === "active") || [];

  const { data: overview } = useQuery({
    queryKey: ["cockpit-overview"],
    queryFn: () => api.get<any>("/api/cockpit/overview"),
    enabled: !!user,
  });

  const { data: syncStatus } = useQuery({
    queryKey: ["cockpit-sync-status"],
    queryFn: () => api.get<any>("/api/cockpit/sync/status"),
    refetchInterval: 60_000,
  });

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
      queryClient.invalidateQueries({ queryKey: ["cockpit-sync-status"] });
    },
  });

  const walletOptions =
    wallets?.map((w) => ({
      label: w.tezDomain || `${w.walletAddress.slice(0, 6)}…${w.walletAddress.slice(-4)}`,
      value: w.walletAddress,
    })) ?? [];

  return (
    <AppWindow title={`Dashboard - ${user?.displayName || user?.username}`}>
      <Tabs value={activeTab} onChange={(v: number) => setActiveTab(v)}>
        <Tab value={0}>Overview</Tab>
        <Tab value={1}>Holdings</Tab>
        <Tab value={2}>Activity</Tab>
        <Tab value={3}>Collections</Tab>
        <Tab value={4}>Sync</Tab>
        <Tab value={5}>Wallets</Tab>
      </Tabs>
      <TabBody>
        {activeTab === 0 && (
          <TabPanel>
            <OverviewGrid>
              <GroupBox label="Passport">
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
                    <div style={{ fontSize: 11 }}>
                      @{user?.username} · {user?.role}
                    </div>
                    <div style={{ fontSize: 11 }}>
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
              </GroupBox>

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

              <GroupBox label="Cockpit summary">
                {overview ? (
                  <Fieldset label="Holdings">
                    <div style={{ fontSize: 11 }}>
                      Tokens:{" "}
                      <strong>{overview.holdings?.totalTokens ?? 0}</strong>
                      <br />
                      Contracts:{" "}
                      <strong>{overview.holdings?.totalContracts ?? 0}</strong>
                    </div>
                  </Fieldset>
                ) : (
                  <Hourglass size={24} />
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
                <QuickAction onClick={() => setLocation("/w")}>W Feed</QuickAction>
                <QuickAction onClick={() => setLocation("/tv")}>WTF TV</QuickAction>
                <QuickAction onClick={() => setLocation("/messages")}>Inbox</QuickAction>
                <QuickAction onClick={() => setLocation("/messageboard")}>
                  Message Board
                </QuickAction>
                <QuickAction onClick={() => setLocation("/marketplace")}>
                  Marketplace
                </QuickAction>
                <QuickAction onClick={() => setLocation("/trade-boards")}>
                  Trade Boards
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
            </OverviewGrid>
          </TabPanel>
        )}

        {activeTab === 1 && (
          <TabPanel>
            <GroupBox label="Indexed holdings">
              <p style={{ fontSize: 11, marginBottom: 8 }}>
                Same data as Profile / Hoard — sourced from `wallet_holdings` + shared
                metadata cache.
              </p>
              <OwnedTokensGallery
                walletOptions={walletOptions}
                userWallets={wallets?.map((w) => w.walletAddress)}
                pageSize={48}
              />
            </GroupBox>
          </TabPanel>
        )}

        {activeTab === 2 && (
          <TabPanel>
            <GroupBox label="Recent wallet events">
              {!activity ? (
                <Hourglass size={24} />
              ) : activity.items?.length === 0 ? (
                <p style={{ fontSize: 11 }}>No events indexed yet.</p>
              ) : (
                <Table>
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
                        <TableDataCell style={{ fontSize: 11 }}>
                          {String(ev.walletAddress || "").slice(0, 10)}…
                        </TableDataCell>
                        <TableDataCell>{ev.eventType}</TableDataCell>
                        <TableDataCell style={{ fontSize: 11 }}>
                          {ev.tokenContract ? `${ev.tokenContract}:${ev.tokenId}` : "—"}
                          {ev.tokenName ? ` · ${ev.tokenName}` : ""}
                        </TableDataCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </GroupBox>
          </TabPanel>
        )}

        {activeTab === 3 && (
          <TabPanel>
            <GroupBox label="Collections">
              {!cockpitCollections ? (
                <Hourglass size={24} />
              ) : cockpitCollections.collections?.length === 0 ? (
                <p style={{ fontSize: 11 }}>No collections yet.</p>
              ) : (
                <Table>
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
                        <TableDataCell style={{ fontSize: 11 }}>
                          {c.updatedAt
                            ? new Date(c.updatedAt).toLocaleDateString()
                            : "—"}
                        </TableDataCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </GroupBox>
          </TabPanel>
        )}

        {activeTab === 4 && (
          <TabPanel>
            <GroupBox label="Scheduler health">
              {!syncStatus ? (
                <Hourglass size={24} />
              ) : (
                <Table>
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
                        <TableDataCell style={{ fontSize: 11 }}>
                          {j.latest?.finishedAt
                            ? new Date(j.latest.finishedAt).toLocaleString()
                            : "—"}
                        </TableDataCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <Separator />
              <Fieldset label="Sync one wallet now">
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
              </Fieldset>
            </GroupBox>
          </TabPanel>
        )}

        {activeTab === 5 && (
          <TabPanel>
            <GroupBox label="Linked wallets">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Address</TableHeadCell>
                    <TableHeadCell>Tokens</TableHeadCell>
                    <TableHeadCell>Primary</TableHeadCell>
                    <TableHeadCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wallets?.map((w) => (
                    <TableRow key={w.id}>
                      <TableDataCell style={{ fontSize: 11 }}>
                        {w.walletAddress}
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
              </Table>
              <Separator />
              <Fieldset label="Add a wallet">
                <p style={{ fontSize: 11, marginBottom: 6 }}>
                  New wallets require a signed proof on the Profile page.
                </p>
                <Button size="sm" onClick={() => setLocation("/profile")}>
                  Open Profile → Wallets
                </Button>
              </Fieldset>
            </GroupBox>
          </TabPanel>
        )}
      </TabBody>
    </AppWindow>
  );
}
