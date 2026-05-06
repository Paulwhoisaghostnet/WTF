import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import {
  Button,
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
import type { ContractLogStatus } from "../types";

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
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
  if (status === "success") return "#0a6f0a";
  if (status === "failure") return "#8a1f1f";
  return "#444";
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
      <p style={{ marginBottom: 8, fontSize: 12, color: "#444" }}>
        Includes both attempted and completed contract interactions from the UX.
      </p>
      <ActionRow style={{ marginBottom: 12 }}>
        <Button
          active={contractLogStatus === "all"}
          onClick={() => setContractLogStatus("all")}
        >
          All
        </Button>
        <Button
          active={contractLogStatus === "attempt"}
          onClick={() => setContractLogStatus("attempt")}
        >
          Attempts
        </Button>
        <Button
          active={contractLogStatus === "success"}
          onClick={() => setContractLogStatus("success")}
        >
          Success
        </Button>
        <Button
          active={contractLogStatus === "failure"}
          onClick={() => setContractLogStatus("failure")}
        >
          Failure
        </Button>
        <TextInput
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
                <TableDataCell style={{ fontSize: 11 }}>
                  {formatUtcTimestamp(row.createdAt)}
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
                <TableDataCell style={{ fontSize: 10 }}>
                  {row.walletAddress || "---"}
                </TableDataCell>
                <TableDataCell style={{ fontSize: 11 }}>
                  {formatAction(row)}
                </TableDataCell>
                <TableDataCell style={{ fontSize: 10 }}>
                  {row.contractAddress || "---"}
                </TableDataCell>
                <TableDataCell style={{ fontSize: 10 }}>
                  {formatOpHash(row.opHash)}
                </TableDataCell>
                <TableDataCell style={{ fontSize: 10, maxWidth: 320 }}>
                  <div>interaction: {row.interactionId}</div>
                  <div>network: {row.network || "---"}</div>
                  {row.error ? (
                    <div style={{ color: "#8a1f1f" }}>error: {row.error}</div>
                  ) : null}
                  {row.params ? (
                    <pre
                      style={{
                        marginTop: 4,
                        maxHeight: 120,
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {JSON.stringify(row.params, null, 2)}
                    </pre>
                  ) : null}
                </TableDataCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableDataCell>No contract activity found.</TableDataCell>
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
      )}
    </>
  );
}
