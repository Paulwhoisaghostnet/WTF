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
import { api } from "../lib/api";
import { formatWtf } from "@shared/types";
import type { LeaderboardEntry, TzKTTokenTransfer } from "@shared/types";

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

  const { data: transfers, isLoading: txLoading } = useQuery({
    queryKey: ["leaderboard-transfers"],
    queryFn: () =>
      api.get<TzKTTokenTransfer[]>("/api/leaderboard/transfers?limit=100"),
    enabled: activeTab === 1,
  });

  return (
    <AppWindow title="WTF Leaderboard">
      <Tabs value={activeTab} onChange={(val: number) => setActiveTab(val)}>
        <Tab value={0}>Rankings</Tab>
        <Tab value={1}>Ledger</Tab>
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
                        {entry.tezDomain ||
                          entry.alias ||
                          entry.displayName ||
                          "---"}
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
