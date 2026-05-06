import type { Dispatch, SetStateAction } from "react";
import {
  Button,
  GroupBox,
  Hourglass,
  Table,
  TableBody,
  TableDataCell,
  TableHead,
  TableHeadCell,
  TableRow,
  TextInput,
} from "react95";
import styled from "styled-components";
import { UserLink } from "../../../components/UserLink";
import type {
  RewardLedgerBatchPayPayload,
  RewardLedgerFilter,
  RewardLedgerPayPayload,
} from "../types";

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

export type RewardLedgerEntry = {
  id: number;
  username?: string | null;
  displayName?: string | null;
  walletAddress?: string | null;
  amountWtf?: number | null;
  reason?: string | null;
  createdAt: string;
  paid?: boolean | null;
  opHash?: string | null;
};

type RewardsAdminTabProps = {
  ledgerFilter: RewardLedgerFilter;
  setLedgerFilter: Dispatch<SetStateAction<RewardLedgerFilter>>;
  rewardLedger: RewardLedgerEntry[] | undefined;
  selectedLedgerIds: Set<number>;
  setSelectedLedgerIds: Dispatch<SetStateAction<Set<number>>>;
  batchOpHash: string;
  setBatchOpHash: Dispatch<SetStateAction<string>>;
  markPaidMutation: AdminMutation<RewardLedgerPayPayload>;
  batchPayMutation: AdminMutation<RewardLedgerBatchPayPayload>;
};

export function RewardsAdminTab({
  ledgerFilter,
  setLedgerFilter,
  rewardLedger,
  selectedLedgerIds,
  setSelectedLedgerIds,
  batchOpHash,
  setBatchOpHash,
  markPaidMutation,
  batchPayMutation,
}: RewardsAdminTabProps) {
  return (
    <>
      <h3>WTF Reward Ledger</h3>
      <p style={{ marginBottom: 8, fontSize: 12, color: "#444" }}>
        Every approved side quest and graded challenge (pass/bonus) with a WTF reward creates a ledger entry.
        Use this to track and batch-pay IOUs.
      </p>
      <ActionRow style={{ marginBottom: 12 }}>
        <Button onClick={() => setLedgerFilter("unpaid")} active={ledgerFilter === "unpaid"}>
          Unpaid
        </Button>
        <Button onClick={() => setLedgerFilter("paid")} active={ledgerFilter === "paid"}>
          Paid
        </Button>
        <Button onClick={() => setLedgerFilter("all")} active={ledgerFilter === "all"}>
          All
        </Button>
      </ActionRow>

      {!rewardLedger ? (
        <Hourglass size={32} />
      ) : (
        <>
          {ledgerFilter === "unpaid" && rewardLedger.length > 0 && (
            <GroupBox label="Batch Pay" style={{ marginBottom: 12 }}>
              <ActionRow>
                <label style={{ fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={selectedLedgerIds.size === rewardLedger.length && rewardLedger.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLedgerIds(new Set(rewardLedger.map((r) => r.id)));
                      } else {
                        setSelectedLedgerIds(new Set());
                      }
                    }}
                  />
                  {" "}Select All ({rewardLedger.length})
                </label>
                <span style={{ fontSize: 12 }}>
                  Total: <strong>{rewardLedger.filter((r) => selectedLedgerIds.has(r.id)).reduce((s, r) => s + (r.amountWtf || 0), 0)} WTF</strong>
                </span>
                <TextInput
                  placeholder="Op hash (optional)"
                  value={batchOpHash}
                  onChange={(e: any) => setBatchOpHash(e.target.value)}
                  style={{ width: 200 }}
                />
                <Button
                  size="sm"
                  disabled={selectedLedgerIds.size === 0 || batchPayMutation.isPending}
                  onClick={() =>
                    batchPayMutation.mutate({
                      ids: Array.from(selectedLedgerIds),
                      opHash: batchOpHash || undefined,
                    })
                  }
                >
                  Mark {selectedLedgerIds.size} as Paid
                </Button>
              </ActionRow>
            </GroupBox>
          )}

          <Table>
            <TableHead>
              <TableRow>
                {ledgerFilter === "unpaid" && <TableHeadCell style={{ width: 30 }}></TableHeadCell>}
                <TableHeadCell>User</TableHeadCell>
                <TableHeadCell>Wallet</TableHeadCell>
                <TableHeadCell>Amount</TableHeadCell>
                <TableHeadCell>Reason</TableHeadCell>
                <TableHeadCell>Date</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                {ledgerFilter === "unpaid" && <TableHeadCell>Actions</TableHeadCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rewardLedger.map((entry) => (
                <TableRow key={entry.id}>
                  {ledgerFilter === "unpaid" && (
                    <TableDataCell>
                      <input
                        type="checkbox"
                        checked={selectedLedgerIds.has(entry.id)}
                        onChange={(e) => {
                          const next = new Set(selectedLedgerIds);
                          if (e.target.checked) next.add(entry.id);
                          else next.delete(entry.id);
                          setSelectedLedgerIds(next);
                        }}
                      />
                    </TableDataCell>
                  )}
                  <TableDataCell>
                    <UserLink username={entry.username} displayName={entry.displayName} />
                  </TableDataCell>
                  <TableDataCell style={{ fontSize: 10, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {entry.walletAddress || "---"}
                  </TableDataCell>
                  <TableDataCell style={{ fontWeight: "bold" }}>
                    {entry.amountWtf} WTF
                  </TableDataCell>
                  <TableDataCell style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.reason}
                  </TableDataCell>
                  <TableDataCell style={{ fontSize: 11 }}>
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </TableDataCell>
                  <TableDataCell>
                    {entry.paid ? (
                      <span style={{ color: "green" }}>
                        Paid{entry.opHash ? ` (${entry.opHash.slice(0, 8)}...)` : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#a00" }}>Unpaid</span>
                    )}
                  </TableDataCell>
                  {ledgerFilter === "unpaid" && (
                    <TableDataCell>
                      <Button
                        size="sm"
                        onClick={() => markPaidMutation.mutate({ id: entry.id })}
                        disabled={markPaidMutation.isPending}
                      >
                        Pay
                      </Button>
                    </TableDataCell>
                  )}
                </TableRow>
              ))}
              {rewardLedger.length === 0 && (
                <TableRow>
                  <TableDataCell>No entries.</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </>
  );
}
