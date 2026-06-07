import type { Dispatch, SetStateAction } from "react";
import {
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
import { UiButton, UiPanel, UiStatusPill } from "../../../components/wtfos-ui";
import type {
  RewardLedgerBatchPayPayload,
  RewardLedgerFilter,
  RewardLedgerPayPayload,
} from "../types";

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const Intro = styled.p`
  margin: 0 0 var(--wtf-space-2, 8px);
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const ControlLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: var(--wtf-space-1, 4px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const MetaText = styled.span`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const TruncateText = styled.span`
  display: block;
  max-width: 180px;
  overflow: hidden;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
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
      <Intro>
        Every approved side quest and graded challenge (pass/bonus) with a WTF reward creates a ledger entry.
        Use this to track and batch-pay IOUs.
      </Intro>
      <ActionRow style={{ marginBottom: 12 }}>
        <UiButton
          compact
          onClick={() => setLedgerFilter("unpaid")}
          active={ledgerFilter === "unpaid"}
          uiVariant={ledgerFilter === "unpaid" ? "primary" : "quiet"}
        >
          Show unpaid rewards
        </UiButton>
        <UiButton
          compact
          onClick={() => setLedgerFilter("paid")}
          active={ledgerFilter === "paid"}
          uiVariant={ledgerFilter === "paid" ? "primary" : "quiet"}
        >
          Show paid rewards
        </UiButton>
        <UiButton
          compact
          onClick={() => setLedgerFilter("all")}
          active={ledgerFilter === "all"}
          uiVariant={ledgerFilter === "all" ? "primary" : "quiet"}
        >
          Show all rewards
        </UiButton>
      </ActionRow>

      {!rewardLedger ? (
        <Hourglass size={32} />
      ) : (
        <>
          {ledgerFilter === "unpaid" && rewardLedger.length > 0 && (
            <UiPanel title="Batch pay unpaid rewards" compact style={{ marginBottom: 12 }}>
              <ActionRow>
                <ControlLabel>
                  <input
                    type="checkbox"
                    aria-label="Select all unpaid rewards"
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
                </ControlLabel>
                <MetaText>
                  Total: <strong>{rewardLedger.filter((r) => selectedLedgerIds.has(r.id)).reduce((s, r) => s + (r.amountWtf || 0), 0)} WTF</strong>
                </MetaText>
                <TextInput
                  aria-label="Batch payment operation hash"
                  placeholder="Op hash (optional)"
                  value={batchOpHash}
                  onChange={(e: any) => setBatchOpHash(e.target.value)}
                  style={{ width: 200 }}
                />
                <UiButton
                  compact
                  disabled={selectedLedgerIds.size === 0 || batchPayMutation.isPending}
                  onClick={() =>
                    batchPayMutation.mutate({
                      ids: Array.from(selectedLedgerIds),
                      opHash: batchOpHash || undefined,
                    })
                  }
                >
                  Mark selected rewards paid ({selectedLedgerIds.size})
                </UiButton>
              </ActionRow>
            </UiPanel>
          )}

          <TableWrap>
            <Table>
              <TableHead>
                <TableRow>
                  {ledgerFilter === "unpaid" && <TableHeadCell style={{ width: 40 }}>Select</TableHeadCell>}
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
                          aria-label={`Select reward ledger entry ${entry.id}`}
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
                    <TableDataCell>
                      <TruncateText>{entry.walletAddress || "---"}</TruncateText>
                    </TableDataCell>
                    <TableDataCell style={{ fontWeight: "bold" }}>
                      {entry.amountWtf} WTF
                    </TableDataCell>
                    <TableDataCell>
                      <TruncateText>{entry.reason || "---"}</TruncateText>
                    </TableDataCell>
                    <TableDataCell>
                      <MetaText>{new Date(entry.createdAt).toLocaleDateString()}</MetaText>
                    </TableDataCell>
                    <TableDataCell>
                      {entry.paid ? (
                        <UiStatusPill $tone="success">
                          Paid{entry.opHash ? ` (${entry.opHash.slice(0, 8)}...)` : ""}
                        </UiStatusPill>
                      ) : (
                        <UiStatusPill $tone="danger">Unpaid</UiStatusPill>
                      )}
                    </TableDataCell>
                    {ledgerFilter === "unpaid" && (
                      <TableDataCell>
                        <UiButton
                          compact
                          onClick={() => markPaidMutation.mutate({ id: entry.id })}
                          disabled={markPaidMutation.isPending}
                        >
                          Mark reward paid
                        </UiButton>
                      </TableDataCell>
                    )}
                  </TableRow>
                ))}
                {rewardLedger.length === 0 && (
                  <TableRow>
                    {ledgerFilter === "unpaid" && <TableDataCell>---</TableDataCell>}
                    <TableDataCell>No reward entries match this filter.</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    {ledgerFilter === "unpaid" && <TableDataCell>---</TableDataCell>}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableWrap>
        </>
      )}
    </>
  );
}
