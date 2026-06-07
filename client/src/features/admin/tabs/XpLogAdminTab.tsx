import type { Dispatch, SetStateAction } from "react";
import {
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
import { UiPanel } from "../../../components/wtfos-ui";

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const MetaText = styled.span`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
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
  const filteredEvents = (xpLog || []).filter((ev: XpLogEvent) =>
    matchesUserFilter(allUsers, ev, xpLogUserFilter)
  );

  return (
    <>
      <UiPanel title="XP reward log" compact>
        <ActionRow style={{ marginBottom: 8 }}>
          <TextInput
            aria-label="Filter XP log by user"
            placeholder="Filter by user..."
            value={xpLogUserFilter}
            onChange={(e: any) => setXpLogUserFilter(e.target.value)}
            style={{ width: 200 }}
          />
        </ActionRow>
        {!xpLog ? (
          <Hourglass size={32} />
        ) : (
          <TableWrap>
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
                {filteredEvents.map((ev: XpLogEvent) => {
                  const user = findUserById(allUsers, ev.userId);
                  const awardedByUser = ev.awardedBy
                    ? findUserById(allUsers, ev.awardedBy)
                    : null;
                  return (
                    <TableRow key={ev.id}>
                      <TableDataCell>
                        <MetaText>{new Date(ev.createdAt).toLocaleString()}</MetaText>
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
                          color: ev.amount >= 0 ? "var(--wtf-app-success, #176b38)" : "var(--wtf-app-danger, #b42318)",
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
                {filteredEvents.length === 0 && (
                  <TableRow>
                    <TableDataCell>No XP events match this filter.</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </UiPanel>
    </>
  );
}
