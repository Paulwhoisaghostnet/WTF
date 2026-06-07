import type { ChangeEvent, Dispatch, SetStateAction } from "react";
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
import { UiButton } from "../../../components/wtfos-ui";
import type { ContractLogStatus } from "../types";

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

const LedgerText = styled.span`
  display: block;
  min-width: 0;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const MutedLedgerText = styled(LedgerText)`
  color: var(--wtf-app-muted-text, #444);
`;

const DetailStack = styled.div`
  display: grid;
  gap: var(--wtf-space-1, 4px);
  max-width: 340px;
`;

const ParamsBlock = styled.pre`
  margin: var(--wtf-space-1, 4px) 0 0;
  max-height: 120px;
  overflow: auto;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  white-space: pre-wrap;
`;

type ContractActivityLogRow = {
  id: number | string;
  createdAt: string | Date;
  status: ContractLogStatus;
  username?: string | null;
  displayName?: string | null;
  userId?: number | string | null;
  walletAddress?: string | null;
  module: string;
  action: string;
  entrypoint?: string | null;
  contractAddress?: string | null;
  opHash?: string | null;
  interactionId?: string | null;
  network?: string | null;
  error?: string | null;
  params?: unknown;
};

type ContractLedgerAdminTabProps = {
  contractActivityLog: ContractActivityLogRow[] | undefined;
  loadingContractActivityLog: boolean;
  contractLogStatus: ContractLogStatus;
  setContractLogStatus: Dispatch<SetStateAction<ContractLogStatus>>;
  contractLogSearch: string;
  setContractLogSearch: Dispatch<SetStateAction<string>>;
};

function contractStatusColor(status: ContractLogStatus): string {
  if (status === "success") return "var(--wtf-app-success, #176b38)";
  if (status === "failure") return "var(--wtf-app-danger, #b42318)";
  return "var(--wtf-app-muted-text, #444)";
}

function formatUtcTimestamp(value: string | Date): string {
  return new Date(value).toISOString();
}

function formatAction(row: ContractActivityLogRow): string {
  return `${row.module}.${row.action}${row.entrypoint ? ` (${row.entrypoint})` : ""}`;
}

function formatOpHash(opHash: string | null | undefined): string {
  return opHash ? `${opHash.slice(0, 12)}...` : "---";
}

export function ContractLedgerAdminTab({
  contractActivityLog,
  loadingContractActivityLog,
  contractLogStatus,
  setContractLogStatus,
  contractLogSearch,
  setContractLogSearch,
}: ContractLedgerAdminTabProps) {
  const rows = contractActivityLog || [];

  return (
    <>
      <h3>Contract Activity Ledger (UTC)</h3>
      <Intro>
        Includes both attempted and completed contract interactions from the UX.
      </Intro>
      <ActionRow style={{ marginBottom: 12 }}>
        <UiButton
          compact
          active={contractLogStatus === "all"}
          uiVariant={contractLogStatus === "all" ? "primary" : "quiet"}
          onClick={() => setContractLogStatus("all")}
        >
          Show all activity
        </UiButton>
        <UiButton
          compact
          active={contractLogStatus === "attempt"}
          uiVariant={contractLogStatus === "attempt" ? "primary" : "quiet"}
          onClick={() => setContractLogStatus("attempt")}
        >
          Show attempts
        </UiButton>
        <UiButton
          compact
          active={contractLogStatus === "success"}
          uiVariant={contractLogStatus === "success" ? "primary" : "quiet"}
          onClick={() => setContractLogStatus("success")}
        >
          Show successes
        </UiButton>
        <UiButton
          compact
          active={contractLogStatus === "failure"}
          uiVariant={contractLogStatus === "failure" ? "primary" : "quiet"}
          onClick={() => setContractLogStatus("failure")}
        >
          Show failures
        </UiButton>
        <TextInput
          aria-label="Search contract activity"
          placeholder="Search action, wallet, contract, op hash..."
          value={contractLogSearch}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setContractLogSearch(e.target.value)
          }
          style={{ width: 280 }}
        />
      </ActionRow>

      {loadingContractActivityLog ? (
        <Hourglass size={32} />
      ) : (
        <TableWrap>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>UTC Time</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell>User</TableHeadCell>
                <TableHeadCell>Wallet</TableHeadCell>
                <TableHeadCell>Action</TableHeadCell>
                <TableHeadCell>Contract</TableHeadCell>
                <TableHeadCell>Op Hash</TableHeadCell>
                <TableHeadCell>Details</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableDataCell>
                    <MutedLedgerText>{formatUtcTimestamp(row.createdAt)}</MutedLedgerText>
                  </TableDataCell>
                  <TableDataCell
                    style={{
                      color: contractStatusColor(row.status),
                      fontWeight: "bold",
                    }}
                  >
                    {row.status}
                  </TableDataCell>
                  <TableDataCell>
                    <UserLink
                      username={row.username}
                      displayName={row.displayName}
                      fallback={row.userId ? `user #${row.userId}` : "anon"}
                    />
                  </TableDataCell>
                  <TableDataCell>
                    <LedgerText>{row.walletAddress || "---"}</LedgerText>
                  </TableDataCell>
                  <TableDataCell>
                    <LedgerText>{formatAction(row)}</LedgerText>
                  </TableDataCell>
                  <TableDataCell>
                    <LedgerText>{row.contractAddress || "---"}</LedgerText>
                  </TableDataCell>
                  <TableDataCell>
                    <LedgerText>{formatOpHash(row.opHash)}</LedgerText>
                  </TableDataCell>
                  <TableDataCell>
                    <DetailStack>
                      <MutedLedgerText>interaction: {row.interactionId || "---"}</MutedLedgerText>
                      <MutedLedgerText>network: {row.network || "---"}</MutedLedgerText>
                      {row.error ? (
                        <LedgerText style={{ color: "var(--wtf-app-danger, #b42318)" }}>
                          error: {row.error}
                        </LedgerText>
                      ) : null}
                      {row.params ? (
                        <ParamsBlock>{JSON.stringify(row.params, null, 2)}</ParamsBlock>
                      ) : null}
                    </DetailStack>
                  </TableDataCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableDataCell>No contract activity found for this filter.</TableDataCell>
                  <TableDataCell>---</TableDataCell>
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
        </TableWrap>
      )}
    </>
  );
}
