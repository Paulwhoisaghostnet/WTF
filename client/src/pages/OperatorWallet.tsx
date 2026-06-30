import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Checkbox, Separator, TextInput } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import {
  UiButton,
  UiEmptyState,
  UiNotice,
  UiPanel,
} from "../components/wtfos-ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { usePresentationShell } from "../lib/presentation-shell";

// WTF Operator Wallet — Phase 9.
//
// Scope (server routes: /api/operator-wallet/*):
//   • Live balances (WTF + XTZ), low-balance alerts.
//   • Unpaid reward ledger preview + batched signer disbursement.
//   • Buyback controls: fund / withdraw xtz / withdraw wtf / pause / unpause.
//   • Run history + one-click TzKT reconcile when the signer lost contact.
//
// The UI never holds a private key and doesn't try to pretend it does:
// every signed action is a POST that hands the intent off to the
// wtf-operator-signer systemd service via a unix socket on the host.

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;

  &[data-operator-wallet-presentation-host="gamma"] {
    padding: 16px;
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-operator-wallet-presentation-host="gamma"],
  &[data-operator-wallet-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-operator-wallet-presentation-host="gamma"] [data-operator-wallet-region] {
    background-image: none;
    border-radius: 6px;
  }

  &[data-operator-wallet-presentation-host="gamma"] :where(fieldset, table, pre, [data-operator-wallet-region="panel"]) {
    color: #f2ead9;
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
  }

  &[data-operator-wallet-presentation-host="gamma"] :where(input, select) {
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 6px;
  }

  &[data-operator-wallet-presentation-host="gamma"] :where(button) {
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(0, 210, 255, 0.54);
    border-radius: 6px;
  }

  &[data-operator-wallet-presentation-host="gamma"] :where(button:hover, button:focus-visible, input:focus-visible, select:focus-visible) {
    color: #070706;
    background: #00d2ff;
    outline: 2px solid #00d2ff;
    outline-offset: 2px;
  }

  &[data-operator-wallet-presentation-host="gamma"] a {
    color: #00d2ff;
  }
`;

const Row = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
`;

const Muted = styled.span`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const Pre = styled.pre`
  background: #0b0b0b;
  color: #d6d6d6;
  padding: var(--wtf-space-3, 12px);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  max-height: 220px;
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  th,
  td {
    padding: var(--wtf-space-2, 8px);
    border-bottom: 1px solid var(--wtf-app-border, #808080);
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
`;

const TableWrap = styled.div`
  overflow: auto;
  min-width: 0;
`;

const ScrollArea = styled.div`
  max-height: 260px;
  overflow: auto;
  min-width: 0;
`;

const ControlLabel = styled.span`
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

const InlineCode = styled.code`
  font-size: var(--wtf-type-caption, 13px);
  overflow-wrap: anywhere;
`;

interface BalanceRow {
  assetKind: "fa2" | "xtz";
  assetContract: string | null;
  assetTokenId: string | null;
  balance: string;
  lowThreshold: string | null;
  checkedAt: string;
}

interface SummaryResponse {
  operatorWallet: string | null;
  signerConfigured: boolean;
  balances: BalanceRow[];
  lowBalances: Array<{
    assetKind: "fa2" | "xtz";
    balance: string;
    lowThreshold: string;
  }>;
  pendingRewards: { count: number; totalWtf: string };
  recentRuns: Array<{
    id: number;
    intent: string;
    assetKind: string;
    status: string;
    totalRecipients: number;
    totalAmount: string;
    opHash: string | null;
    startedAt: string;
    finishedAt: string | null;
    errorMessage: string | null;
  }>;
}

interface UnpaidLedgerRow {
  id: number;
  userId: number;
  amountWtf: number;
  reason: string;
  sourceType: string;
  sourceId: number | null;
  createdAt: string;
  username: string | null;
  walletAddress: string | null;
}

interface UnpaidLedgerResponse {
  rows: UnpaidLedgerRow[];
  uniqueUsers: number;
  totalWtf: string;
}

interface PreviewResponse {
  scope: "pending_ledger" | "ledger_ids" | "manual";
  recipients: Array<{
    userId: number;
    username: string | null;
    walletAddress: string | null;
    amount: string;
    reason: string;
  }>;
  deliverableCount: number;
  missingWallets: number[];
  totalWtf: string;
  unpaidLedgerIds: number[];
}

function formatAmount(raw: string, decimals: number): string {
  if (!raw) return "0";
  const bi = BigInt(raw);
  if (decimals === 0) return bi.toString();
  const base = BigInt(10) ** BigInt(decimals);
  const whole = bi / base;
  const frac = bi % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

function assetLabel(row: { assetKind: string; assetContract?: string | null; assetTokenId?: string | null }): string {
  if (row.assetKind === "xtz") return "XTZ";
  if (row.assetContract && row.assetTokenId != null) {
    return `${row.assetContract.slice(0, 8)}…/#${row.assetTokenId}`;
  }
  return row.assetKind;
}

export function OperatorWallet() {
  const presentation = usePresentationShell();
  const { user } = useAuth();
  const qc = useQueryClient();

  const summaryQuery = useQuery<SummaryResponse>({
    queryKey: ["operator-wallet-summary"],
    queryFn: () => api.get<SummaryResponse>("/api/operator-wallet/summary"),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });

  const unpaidQuery = useQuery<UnpaidLedgerResponse>({
    queryKey: ["operator-wallet-unpaid"],
    queryFn: () =>
      api.get<UnpaidLedgerResponse>("/api/operator-wallet/ledger/unpaid"),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const [selectedLedgerIds, setSelectedLedgerIds] = useState<Set<number>>(
    new Set()
  );
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runOutput, setRunOutput] = useState<unknown>(null);

  const [buybackContract, setBuybackContract] = useState<string>("");
  const [buybackFundMutez, setBuybackFundMutez] = useState<string>("");
  const [buybackWithdrawWtf, setBuybackWithdrawWtf] = useState<string>("");

  const refreshBalancesMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean }>("/api/operator-wallet/balances/refresh", {}),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["operator-wallet-summary"] }),
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const previewMutation = useMutation({
    mutationFn: (body: {
      scope: "pending_ledger" | "ledger_ids";
      ledgerIds?: number[];
    }) => api.post<PreviewResponse>("/api/operator-wallet/disburse/preview", body),
    onSuccess: (res) => {
      setPreview(res);
      setErrorMsg(null);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const runDisburseMutation = useMutation({
    mutationFn: (body: {
      scope: "pending_ledger" | "ledger_ids";
      ledgerIds?: number[];
    }) => api.post<unknown>("/api/operator-wallet/disburse/run", body),
    onSuccess: (res) => {
      setRunOutput(res);
      setPreview(null);
      setSelectedLedgerIds(new Set());
      qc.invalidateQueries({ queryKey: ["operator-wallet-summary"] });
      qc.invalidateQueries({ queryKey: ["operator-wallet-unpaid"] });
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const buybackMutation = useMutation({
    mutationFn: ({
      action,
      body,
    }: {
      action:
        | "fund"
        | "withdraw-xtz"
        | "withdraw-wtf"
        | "pause"
        | "unpause";
      body: Record<string, unknown>;
    }) =>
      api.post<unknown>(`/api/operator-wallet/buyback/${action}`, body),
    onSuccess: (res) => {
      setRunOutput(res);
      qc.invalidateQueries({ queryKey: ["operator-wallet-summary"] });
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const reconcileMutation = useMutation({
    mutationFn: (id: number) =>
      api.post<unknown>(`/api/operator-wallet/runs/${id}/reconcile`, {}),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["operator-wallet-summary"] }),
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const toggleLedgerId = (id: number) => {
    setSelectedLedgerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const summary = summaryQuery.data;
  const hasLow = (summary?.lowBalances?.length ?? 0) > 0;
  const xtzBalance = summary?.balances.find((b) => b.assetKind === "xtz");
  const wtfBalance = summary?.balances.find((b) => b.assetKind === "fa2");

  const selectedLedgerTotal = useMemo(() => {
    if (!unpaidQuery.data) return BigInt(0);
    let sum = BigInt(0);
    for (const r of unpaidQuery.data.rows) {
      if (selectedLedgerIds.has(r.id)) sum += BigInt(r.amountWtf);
    }
    return sum;
  }, [unpaidQuery.data, selectedLedgerIds]);

  if (!user) {
    return (
      <AppWindow title="Operator Wallet">
        <Stack
          data-operator-wallet-surface="operator-wallet"
          data-operator-wallet-presentation-host={presentation.host}
          data-operator-wallet-region="surface"
        >
          <UiPanel title="Operator Wallet" compact data-operator-wallet-region="panel">
            <Muted>Sign in as an operator to use the Operator Wallet.</Muted>
          </UiPanel>
        </Stack>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Operator Wallet">
      <Stack
        data-operator-wallet-surface="operator-wallet"
        data-operator-wallet-presentation-host={presentation.host}
        data-operator-wallet-region="surface"
      >
        {errorMsg ? <UiNotice tone="danger">{errorMsg}</UiNotice> : null}
        {summary && !summary.signerConfigured ? (
          <UiNotice tone="warning">
            The wtf-operator-signer service is not configured on this host.
            Set <InlineCode>WTF_OPERATOR_SIGNER_AUTH_TOKEN</InlineCode> and restart. Until
            then, every signing action will return a 503.
          </UiNotice>
        ) : null}
        {hasLow ? (
          <UiNotice tone="warning">
            <strong>Low balance:</strong>{" "}
            {summary?.lowBalances
              .map(
                (b) =>
                  `${assetLabel(b)} at ${formatAmount(
                    b.balance,
                    b.assetKind === "xtz" ? 6 : 8
                  )} (threshold ${formatAmount(
                    b.lowThreshold,
                    b.assetKind === "xtz" ? 6 : 8
                  )})`
              )
              .join(" · ")}
            <br />
            Top up from the treasury wallet before running any more
            disbursements.
          </UiNotice>
        ) : null}

        <UiPanel title="Balances" compact data-operator-wallet-region="panel">
          <Stack>
            <Row data-operator-wallet-region="row">
              <strong>Operator wallet:</strong>{" "}
              <InlineCode>{summary?.operatorWallet ?? "not configured"}</InlineCode>
              <UiButton
                compact
                onClick={() => refreshBalancesMutation.mutate()}
                disabled={refreshBalancesMutation.isPending}
              >
                Refresh balances via TzKT
              </UiButton>
            </Row>
            <TableWrap data-operator-wallet-region="table-wrap">
              <Table data-operator-wallet-region="table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Balance</th>
                  <th>Low-balance threshold</th>
                  <th>Checked at</th>
                </tr>
              </thead>
              <tbody>
                {summary?.balances.length ? (
                  summary.balances.map((b, i) => (
                  <tr key={i}>
                    <td>{assetLabel(b)}</td>
                    <td>
                      {formatAmount(b.balance, b.assetKind === "xtz" ? 6 : 8)}
                    </td>
                    <td>
                      {b.lowThreshold
                        ? formatAmount(
                            b.lowThreshold,
                            b.assetKind === "xtz" ? 6 : 8
                          )
                        : "—"}
                    </td>
                    <td>{new Date(b.checkedAt).toLocaleString()}</td>
                  </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      <UiEmptyState title="No balance rows">
                        Refresh balances to pull the latest operator-wallet state from TzKT.
                      </UiEmptyState>
                    </td>
                  </tr>
                )}
              </tbody>
              </Table>
            </TableWrap>
            <Muted>
              XTZ balance: {xtzBalance ? formatAmount(xtzBalance.balance, 6) : "—"} ·
              WTF balance: {wtfBalance ? formatAmount(wtfBalance.balance, 8) : "—"}
            </Muted>
          </Stack>
        </UiPanel>

        <UiPanel title="Pending reward ledger" compact data-operator-wallet-region="panel">
          <Stack>
            <Row data-operator-wallet-region="row">
              <strong>{unpaidQuery.data?.uniqueUsers ?? 0}</strong> unique users ·{" "}
              <strong>{unpaidQuery.data?.rows.length ?? 0}</strong> rows ·{" "}
              <strong>
                {formatAmount(unpaidQuery.data?.totalWtf ?? "0", 8)}
              </strong>{" "}
              WTF outstanding
            </Row>
            <Row data-operator-wallet-region="actions">
              <UiButton
                onClick={() =>
                  previewMutation.mutate({ scope: "pending_ledger" })
                }
                disabled={previewMutation.isPending}
              >
                Preview all pending rewards
              </UiButton>
              <UiButton
                onClick={() =>
                  previewMutation.mutate({
                    scope: "ledger_ids",
                    ledgerIds: [...selectedLedgerIds],
                  })
                }
                disabled={selectedLedgerIds.size === 0 || previewMutation.isPending}
              >
                Preview selected rewards ({selectedLedgerIds.size})
              </UiButton>
              <Muted>
                Selected total: {formatAmount(selectedLedgerTotal.toString(), 8)} WTF
              </Muted>
            </Row>
            <ScrollArea data-operator-wallet-region="scroll-area">
              <Table data-operator-wallet-region="table">
                <thead>
                  <tr>
                    <th></th>
                    <th>User</th>
                    <th>Wallet</th>
                    <th>Amount (WTF)</th>
                    <th>Reason</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {unpaidQuery.data?.rows.length ? (
                    unpaidQuery.data.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Checkbox
                          checked={selectedLedgerIds.has(r.id)}
                          onChange={() => toggleLedgerId(r.id)}
                          label=""
                          aria-label={`Select reward ledger row ${r.id}`}
                        />
                      </td>
                      <td>{r.username ?? `#${r.userId}`}</td>
                      <td>
                        {r.walletAddress ? (
                          <InlineCode>{r.walletAddress.slice(0, 10)}…</InlineCode>
                        ) : (
                          <Muted>no wallet linked</Muted>
                        )}
                      </td>
                      <td>{formatAmount(String(r.amountWtf), 8)}</td>
                      <td>{r.reason}</td>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <UiEmptyState title="No pending rewards">
                          Reward ledger rows will appear here when there are unpaid recipients.
                        </UiEmptyState>
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </UiPanel>

        {preview ? (
          <UiPanel title="Review and sign" compact tone="warning" data-operator-wallet-region="panel">
            <Stack>
              <Row data-operator-wallet-region="row">
                <strong>{preview.deliverableCount}</strong> recipients ·{" "}
                <strong>{formatAmount(preview.totalWtf, 8)}</strong> WTF total
                {preview.missingWallets.length ? (
                  <Muted>
                    · {preview.missingWallets.length} users skipped (no wallet
                    linked)
                  </Muted>
                ) : null}
              </Row>
              <TableWrap data-operator-wallet-region="table-wrap">
                <Table data-operator-wallet-region="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Wallet</th>
                    <th>Amount</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.recipients.map((r, i) => (
                    <tr key={i}>
                      <td>{r.username ?? `#${r.userId}`}</td>
                      <td>
                        {r.walletAddress ? (
                          <InlineCode>{r.walletAddress.slice(0, 10)}…</InlineCode>
                        ) : (
                          <Muted>—</Muted>
                        )}
                      </td>
                      <td>{formatAmount(r.amount, 8)}</td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
                </Table>
              </TableWrap>
              <Row data-operator-wallet-region="actions">
                <UiButton
                  uiVariant="primary"
                  onClick={() =>
                    runDisburseMutation.mutate({
                      scope: preview.scope === "manual" ? "pending_ledger" : preview.scope,
                      ledgerIds:
                        preview.scope === "ledger_ids"
                          ? preview.unpaidLedgerIds
                          : undefined,
                    })
                  }
                  disabled={
                    runDisburseMutation.isPending ||
                    preview.deliverableCount === 0
                  }
                >
                  {runDisburseMutation.isPending
                    ? "Broadcasting…"
                    : `Sign and broadcast rewards (${preview.deliverableCount})`}
                </UiButton>
                <UiButton onClick={() => setPreview(null)}>Cancel review</UiButton>
              </Row>
            </Stack>
          </UiPanel>
        ) : null}

        <div data-operator-wallet-region="separator">
          <Separator />
        </div>

        <UiPanel title="Buyback controls" compact data-operator-wallet-region="panel">
          <Stack>
            <Row data-operator-wallet-region="row">
              <ControlLabel>Buyback contract</ControlLabel>
              <TextInput
                value={buybackContract}
                aria-label="Buyback contract address"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setBuybackContract(e.target.value.trim())
                }
                placeholder="KT1…"
                style={{ width: 360 }}
              />
            </Row>
            <Row data-operator-wallet-region="row">
              <ControlLabel>Fund with mutez</ControlLabel>
              <TextInput
                value={buybackFundMutez}
                aria-label="Buyback funding amount in mutez"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setBuybackFundMutez(e.target.value.replace(/\D/g, ""))
                }
                placeholder="e.g. 100000000 = 100 XTZ"
                style={{ width: 220 }}
              />
              <UiButton
                onClick={() =>
                  buybackMutation.mutate({
                    action: "fund",
                    body: {
                      contract: buybackContract,
                      amountMutez: buybackFundMutez,
                    },
                  })
                }
                disabled={
                  !buybackContract ||
                  !buybackFundMutez ||
                  buybackMutation.isPending
                }
              >
                Fund buyback
              </UiButton>
            </Row>
            <Row data-operator-wallet-region="row">
              <ControlLabel>Withdraw WTF nat</ControlLabel>
              <TextInput
                value={buybackWithdrawWtf}
                aria-label="Buyback WTF withdrawal amount in nat"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setBuybackWithdrawWtf(e.target.value.replace(/\D/g, ""))
                }
                placeholder="amount in nat"
                style={{ width: 220 }}
              />
              <UiButton
                onClick={() =>
                  buybackMutation.mutate({
                    action: "withdraw-wtf",
                    body: {
                      contract: buybackContract,
                      amount: buybackWithdrawWtf,
                    },
                  })
                }
                disabled={
                  !buybackContract ||
                  !buybackWithdrawWtf ||
                  buybackMutation.isPending
                }
              >
                Withdraw accumulated WTF
              </UiButton>
              <UiButton
                onClick={() =>
                  buybackMutation.mutate({
                    action: "withdraw-xtz",
                    body: { contract: buybackContract },
                  })
                }
                disabled={!buybackContract || buybackMutation.isPending}
              >
                Withdraw leftover XTZ
              </UiButton>
            </Row>
            <Row data-operator-wallet-region="actions">
              <UiButton
                onClick={() =>
                  buybackMutation.mutate({
                    action: "pause",
                    body: { contract: buybackContract },
                  })
                }
                disabled={!buybackContract || buybackMutation.isPending}
              >
                Pause buyback
              </UiButton>
              <UiButton
                onClick={() =>
                  buybackMutation.mutate({
                    action: "unpause",
                    body: { contract: buybackContract },
                  })
                }
                disabled={!buybackContract || buybackMutation.isPending}
              >
                Unpause buyback
              </UiButton>
            </Row>
            <Muted>
              Fund = XTZ sent from operator wallet to the buyback contract.
              Withdraw XTZ = rescue leftover after the window. Withdraw WTF =
              sweep accumulated WTF back to the operator wallet for
              redistribution.
            </Muted>
          </Stack>
        </UiPanel>

        <UiPanel title="Recent signer runs" compact data-operator-wallet-region="panel">
          <TableWrap data-operator-wallet-region="table-wrap">
            <Table data-operator-wallet-region="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Intent</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Total</th>
                <th>Op hash</th>
                <th>Started</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {summary?.recentRuns.length ? (
                summary.recentRuns.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.intent}</td>
                  <td>{r.status}</td>
                  <td>{r.totalRecipients}</td>
                  <td>
                    {r.assetKind === "xtz"
                      ? `${formatAmount(r.totalAmount, 6)} XTZ`
                      : `${formatAmount(r.totalAmount, 8)} WTF`}
                  </td>
                  <td>
                    {r.opHash ? (
                      <a
                        href={`https://tzkt.io/${r.opHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.opHash.slice(0, 10)}…
                      </a>
                    ) : (
                      <Muted>—</Muted>
                    )}
                  </td>
                  <td>{new Date(r.startedAt).toLocaleString()}</td>
                  <td>
                    <UiButton
                      compact
                      onClick={() => reconcileMutation.mutate(r.id)}
                      disabled={reconcileMutation.isPending || !r.opHash}
                    >
                      Reconcile run
                    </UiButton>
                  </td>
                </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <UiEmptyState title="No signer runs">
                      Broadcasted reward and buyback actions will appear here after the signer accepts a run.
                    </UiEmptyState>
                  </td>
                </tr>
              )}
            </tbody>
            </Table>
          </TableWrap>
        </UiPanel>

        {runOutput ? (
          <UiPanel title="Last signer response" compact data-operator-wallet-region="panel">
            <Pre data-operator-wallet-region="output">{JSON.stringify(runOutput, null, 2)}</Pre>
          </UiPanel>
        ) : null}
      </Stack>
    </AppWindow>
  );
}

export default OperatorWallet;
