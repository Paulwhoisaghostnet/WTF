import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Tabs,
  Tab,
  TabBody,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
  Hourglass,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UserLink } from "../components/UserLink";
import { api } from "../lib/api";
import { formatWtf, ROLE_LABELS } from "@shared/types";
import type {
  LeaderboardEntry,
  RewardOtherLeaderboardEntry,
  RewardWtfLeaderboardEntry,
  TzKTTokenTransfer,
  XpRewardLeaderboardEntry,
} from "@shared/types";

const TabContent = styled.div`
  padding: 8px 0;
`;

const Address = styled.span`
  font-family: monospace;
  font-size: 11px;
`;

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState(0);

  const { data: leaderboard, isLoading: lbLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => api.get<LeaderboardEntry[]>("/api/leaderboard?limit=100"),
  });

  const { data: xpBoard, isLoading: xpLoading } = useQuery({
    queryKey: ["leaderboard-rewards-exp"],
    queryFn: () => api.get<XpRewardLeaderboardEntry[]>("/api/leaderboard/rewards/exp?limit=100"),
    enabled: activeTab === 2,
  });

  const { data: rewardWtfBoard, isLoading: rewardWtfLoading } = useQuery({
    queryKey: ["leaderboard-rewards-wtf"],
    queryFn: () => api.get<RewardWtfLeaderboardEntry[]>("/api/leaderboard/rewards/wtf?limit=100"),
    enabled: activeTab === 1,
  });

  const { data: otherRewardsBoard, isLoading: otherRewardsLoading } = useQuery({
    queryKey: ["leaderboard-rewards-other"],
    queryFn: () => api.get<RewardOtherLeaderboardEntry[]>("/api/leaderboard/rewards/other?limit=100"),
    enabled: activeTab === 3,
  });

  const { data: transfers, isLoading: txLoading } = useQuery({
    queryKey: ["leaderboard-transfers"],
    queryFn: () =>
      api.get<TzKTTokenTransfer[]>("/api/leaderboard/transfers?limit=100"),
    enabled: activeTab === 4,
  });

  return (
    <AppWindow title="WTF Leaderboard">
      <Tabs value={activeTab} onChange={(val: number) => setActiveTab(val)}>
        <Tab value={0}>WTF token</Tab>
        <Tab value={1}>WTF rewards</Tab>
        <Tab value={2}>EXP</Tab>
        <Tab value={3}>Other rewards</Tab>
        <Tab value={4}>Ledger</Tab>
      </Tabs>

      <TabBody>
        {activeTab === 0 && (
          <TabContent>
            {lbLoading ? (
              <Hourglass size={32} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell style={{ width: 50 }}>#</TableHeadCell>
                    <TableHeadCell>Address</TableHeadCell>
                    <TableHeadCell>Name</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>
                      Balance
                    </TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>
                      Txns
                    </TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {leaderboard?.map((entry) => (
                    <TableRow key={entry.address}>
                      <TableDataCell style={{ fontWeight: "bold" }}>
                        {entry.rank}
                      </TableDataCell>
                      <TableDataCell>
                        <Address>
                          {entry.address.slice(0, 8)}...
                          {entry.address.slice(-6)}
                        </Address>
                      </TableDataCell>
                      <TableDataCell>
                        {entry.username ? (
                          <UserLink
                            username={entry.username}
                            displayName={entry.tezDomain || entry.alias || entry.displayName}
                          />
                        ) : (
                          entry.tezDomain || entry.alias || "---"
                        )}
                      </TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>
                        {entry.balanceFormatted} WTF
                      </TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>
                        {entry.transfersCount}
                      </TableDataCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabContent>
        )}

        {activeTab === 1 && (
          <TabContent>
            {rewardWtfLoading ? (
              <Hourglass size={32} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell style={{ width: 50 }}>#</TableHeadCell>
                    <TableHeadCell>Player</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>Total earned</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>Current owed</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>Available</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>Paid</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>Market spent</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rewardWtfBoard?.map((row) => (
                    <TableRow key={row.userId}>
                      <TableDataCell style={{ fontWeight: "bold" }}>{row.rank}</TableDataCell>
                      <TableDataCell>
                        <UserLink
                          username={row.username}
                          displayName={row.displayName || row.username}
                        />
                      </TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>{row.totalEarnedWtf} WTF</TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>{row.currentOwedWtf} WTF</TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>{row.availableWtf} WTF</TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>{row.alreadyPaidWtf} WTF</TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>{row.marketSpentWtf} WTF</TableDataCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabContent>
        )}

        {activeTab === 2 && (
          <TabContent>
            {xpLoading ? (
              <Hourglass size={32} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell style={{ width: 50 }}>#</TableHeadCell>
                    <TableHeadCell>Player</TableHeadCell>
                    <TableHeadCell>Role</TableHeadCell>
                    <TableHeadCell>Tier</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>Current XP</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>Earned</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>Spent</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {xpBoard?.map((row) => (
                    <TableRow key={row.userId}>
                      <TableDataCell style={{ fontWeight: "bold" }}>{row.rank}</TableDataCell>
                      <TableDataCell>
                        <UserLink
                          username={row.username}
                          displayName={row.displayName || row.username}
                        />
                      </TableDataCell>
                      <TableDataCell style={{ fontSize: 11 }}>
                        {ROLE_LABELS[row.role as keyof typeof ROLE_LABELS] ?? row.role}
                      </TableDataCell>
                      <TableDataCell style={{ fontSize: 11 }}>{row.xpTierLabel}</TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>
                        {(row.experiencePoints ?? 0).toLocaleString()}
                      </TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>
                        {(row.totalEarnedXp ?? 0).toLocaleString()}
                      </TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>
                        {(row.totalSpentXp ?? 0).toLocaleString()}
                      </TableDataCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabContent>
        )}

        {activeTab === 3 && (
          <TabContent>
            {otherRewardsLoading ? (
              <Hourglass size={32} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell style={{ width: 50 }}>#</TableHeadCell>
                    <TableHeadCell>Player</TableHeadCell>
                    <TableHeadCell>Reward kinds</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>Count</TableHeadCell>
                    <TableHeadCell>Latest</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {otherRewardsBoard?.map((row) => (
                    <TableRow key={row.userId}>
                      <TableDataCell style={{ fontWeight: "bold" }}>{row.rank}</TableDataCell>
                      <TableDataCell>
                        <UserLink
                          username={row.username}
                          displayName={row.displayName || row.username}
                        />
                      </TableDataCell>
                      <TableDataCell>{row.rewardKinds.join(", ") || "---"}</TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>{row.rewardCount}</TableDataCell>
                      <TableDataCell style={{ fontSize: 11 }}>
                        {row.latestRewardAt ? new Date(row.latestRewardAt).toLocaleString() : "---"}
                      </TableDataCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabContent>
        )}

        {activeTab === 4 && (
          <TabContent>
            {txLoading ? (
              <Hourglass size={32} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Time</TableHeadCell>
                    <TableHeadCell>From</TableHeadCell>
                    <TableHeadCell>To</TableHeadCell>
                    <TableHeadCell style={{ textAlign: "right" }}>
                      Amount
                    </TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transfers?.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableDataCell style={{ fontSize: 11 }}>
                        {new Date(tx.timestamp).toLocaleString()}
                      </TableDataCell>
                      <TableDataCell>
                        <Address>
                          {tx.from
                            ? tx.from.alias ||
                              `${tx.from.address.slice(0, 8)}...`
                            : "Mint"}
                        </Address>
                      </TableDataCell>
                      <TableDataCell>
                        <Address>
                          {tx.to
                            ? tx.to.alias ||
                              `${tx.to.address.slice(0, 8)}...`
                            : "Burn"}
                        </Address>
                      </TableDataCell>
                      <TableDataCell style={{ textAlign: "right" }}>
                        {formatWtf(tx.amount)} WTF
                      </TableDataCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabContent>
        )}
      </TabBody>
    </AppWindow>
  );
}
