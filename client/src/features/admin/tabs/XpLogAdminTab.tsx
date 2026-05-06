import type { Dispatch, SetStateAction } from "react";
import {
  GroupBox,
  TextInput,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
  Hourglass,
} from "react95";
import styled from "styled-components";
import { UserLink } from "../../../components/UserLink";

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

type AdminUser = {
  id: number;
  username?: string | null;
  displayName?: string | null;
};

type XpLogEvent = {
  id: number;
  userId: number;
  awardedBy?: number | null;
  createdAt: string;
  reason: string;
  amount: number;
};

type XpLogAdminTabProps = {
  xpLog: XpLogEvent[] | undefined;
  allUsers: AdminUser[] | undefined;
  xpLogUserFilter: string;
  setXpLogUserFilter: Dispatch<SetStateAction<string>>;
};

function findUserById(users: AdminUser[] | undefined, id: number) {
  return (users || []).find((u: AdminUser) => u.id === id);
}

function matchesUserFilter(
  users: AdminUser[] | undefined,
  event: XpLogEvent,
  filter: string
) {
  if (!filter) return true;
  const q = filter.toLowerCase();
  const user = findUserById(users, event.userId);
  return (
    user?.username?.toLowerCase().includes(q) ||
    user?.displayName?.toLowerCase().includes(q)
  );
}

export function XpLogAdminTab({
  xpLog,
  allUsers,
  xpLogUserFilter,
  setXpLogUserFilter,
}: XpLogAdminTabProps) {
  return (
    <>
      <GroupBox label="XP Reward Log">
        <ActionRow style={{ marginBottom: 8 }}>
          <TextInput
            placeholder="Filter by user..."
            value={xpLogUserFilter}
            onChange={(e: any) => setXpLogUserFilter(e.target.value)}
            style={{ width: 200 }}
          />
        </ActionRow>
        {!xpLog ? (
          <Hourglass size={32} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Date</TableHeadCell>
                <TableHeadCell>User</TableHeadCell>
                <TableHeadCell>Reason</TableHeadCell>
                <TableHeadCell style={{ textAlign: "right" }}>
                  Amount
                </TableHeadCell>
                <TableHeadCell>Awarded By</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {xpLog
                .filter((ev: XpLogEvent) =>
                  matchesUserFilter(allUsers, ev, xpLogUserFilter)
                )
                .map((ev: XpLogEvent) => {
                  const user = findUserById(allUsers, ev.userId);
                  const awardedByUser = ev.awardedBy
                    ? findUserById(allUsers, ev.awardedBy)
                    : null;
                  return (
                    <TableRow key={ev.id}>
                      <TableDataCell style={{ fontSize: 11 }}>
                        {new Date(ev.createdAt).toLocaleString()}
                      </TableDataCell>
                      <TableDataCell>
                        <UserLink
                          username={user?.username}
                          displayName={user?.displayName}
                          fallback={`user #${ev.userId}`}
                        />
                      </TableDataCell>
                      <TableDataCell>{ev.reason}</TableDataCell>
                      <TableDataCell
                        style={{
                          textAlign: "right",
                          color: ev.amount >= 0 ? "#008000" : "#800000",
                          fontWeight: "bold",
                        }}
                      >
                        {ev.amount >= 0 ? "+" : ""}
                        {ev.amount}
                      </TableDataCell>
                      <TableDataCell>
                        {awardedByUser ? (
                          <UserLink
                            username={awardedByUser.username}
                            displayName={awardedByUser.displayName}
                          />
                        ) : (
                          "system"
                        )}
                      </TableDataCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </GroupBox>
    </>
  );
}
