import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  Separator,
  TextInput,
  Checkbox,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

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
  gap: 12px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Muted = styled.span`
  color: #555;
  font-size: 12px;
`;

const Alert = styled.div`
  background: #fff2d9;
  border: 2px solid #cc7a00;
  padding: 8px 10px;
  font-size: 12px;
`;

const Error = styled.div`
  background: #ffdddd;
  border: 2px solid #aa0000;
  padding: 8px 10px;
  font-size: 12px;
`;

const Pre = styled.pre`
  background: #0b0b0b;
  color: #d6d6d6;
  padding: 8px 10px;
  font-size: 11px;
  max-height: 220px;
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  th,
  td {
    padding: 4px 6px;
    border-bottom: 1px solid #b0b0b0;
    text-align: left;
    vertical-align: top;
  }
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
        <Muted>Sign in as an operator to use the Operator Wallet.</Muted>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Operator Wallet">
      <Stack>
        {errorMsg ? <Error>{errorMsg}</Error> : null}
        {summary && !summary.signerConfigured ? (
          <Alert>
            The wtf-operator-signer service is not configured on this host.
            Set <code>WTF_OPERATOR_SIGNER_AUTH_TOKEN</code> and restart. Until
            then, every signing action will return a 503.
          </Alert>
        ) : null}
        {hasLow ? (
          <Alert>
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
          </Alert>
        ) : null}

        <GroupBox label="1. Balances">
          <Stack>
            <Row>
              <strong>Operator wallet:</strong>{" "}
              <code>{summary?.operatorWallet ?? "not configured"}</code>
              <Button
                size="sm"
                onClick={() => refreshBalancesMutation.mutate()}
                disabled={refreshBalancesMutation.isPending}
              >
                Refresh via TzKT
              </Button>
            </Row>
            <Table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Balance</th>
                  <th>Low-balance threshold</th>
                  <th>Checked at</th>
                </tr>
              </thead>
              <tbody>
                {summary?.balances.map((b, i) => (
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
                ))}
              </tbody>
            </Table>
            <Muted>
              XTZ balance: {xtzBalance ? formatAmount(xtzBalance.balance, 6) : "—"} ·
              WTF balance: {wtfBalance ? formatAmount(wtfBalance.balance, 8) : "—"}
            </Muted>
          </Stack>
        </GroupBox>

        <GroupBox label="2. Pending reward ledger">
          <Stack>
            <Row>
              <strong>{unpaidQuery.data?.uniqueUsers ?? 0}</strong> unique users ·{" "}
              <strong>{unpaidQuery.data?.rows.length ?? 0}</strong> rows ·{" "}
              <strong>
                {formatAmount(unpaidQuery.data?.totalWtf ?? "0", 8)}
              </strong>{" "}
              WTF outstanding
            </Row>
            <Row>
              <Button
                onClick={() =>
                  previewMutation.mutate({ scope: "pending_ledger" })
                }
                disabled={previewMutation.isPending}
              >
                Preview all pending rewards
              </Button>
              <Button
                onClick={() =>
                  previewMutation.mutate({
                    scope: "ledger_ids",
                    ledgerIds: [...selectedLedgerIds],
                  })
                }
                disabled={selectedLedgerIds.size === 0 || previewMutation.isPending}
              >
                Preview selected ({selectedLedgerIds.size})
              </Button>
              <Muted>
                Selected total: {formatAmount(selectedLedgerTotal.toString(), 8)} WTF
              </Muted>
            </Row>
            <div style={{ maxHeight: 260, overflow: "auto" }}>
              <Table>
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
                  {unpaidQuery.data?.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Checkbox
                          checked={selectedLedgerIds.has(r.id)}
                          onChange={() => toggleLedgerId(r.id)}
                          label=""
                        />
                      </td>
                      <td>{r.username ?? `#${r.userId}`}</td>
                      <td>
                        {r.walletAddress ? (
                          <code>{r.walletAddress.slice(0, 10)}…</code>
                        ) : (
                          <Muted>no wallet linked</Muted>
                        )}
                      </td>
                      <td>{formatAmount(String(r.amountWtf), 8)}</td>
                      <td>{r.reason}</td>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Stack>
        </GroupBox>

        {preview ? (
          <GroupBox label="3. Review & sign">
            <Stack>
              <Row>
                <strong>{preview.deliverableCount}</strong> recipients ·{" "}
                <strong>{formatAmount(preview.totalWtf, 8)}</strong> WTF total
                {preview.missingWallets.length ? (
                  <Muted>
                    · {preview.missingWallets.length} users skipped (no wallet
                    linked)
                  </Muted>
                ) : null}
              </Row>
              <Table>
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
                          <code>{r.walletAddress.slice(0, 10)}…</code>
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
              <Row>
                <Button
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
                    : `Sign & broadcast (${preview.deliverableCount})`}
                </Button>
                <Button onClick={() => setPreview(null)}>Cancel</Button>
              </Row>
            </Stack>
          </GroupBox>
        ) : null}

        <Separator />

        <GroupBox label="4. Buyback controls">
          <Stack>
            <Row>
              <span>Buyback contract:</span>
              <TextInput
                value={buybackContract}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setBuybackContract(e.target.value.trim())
                }
                placeholder="KT1…"
                style={{ width: 360 }}
              />
            </Row>
            <Row>
              <span>Fund with (mutez):</span>
              <TextInput
                value={buybackFundMutez}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setBuybackFundMutez(e.target.value.replace(/\D/g, ""))
                }
                placeholder="e.g. 100000000 = 100 XTZ"
                style={{ width: 220 }}
              />
              <Button
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
              </Button>
            </Row>
            <Row>
              <span>Withdraw WTF (nat):</span>
              <TextInput
                value={buybackWithdrawWtf}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setBuybackWithdrawWtf(e.target.value.replace(/\D/g, ""))
                }
                placeholder="amount in nat"
                style={{ width: 220 }}
              />
              <Button
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
              </Button>
              <Button
                onClick={() =>
                  buybackMutation.mutate({
                    action: "withdraw-xtz",
                    body: { contract: buybackContract },
                  })
                }
                disabled={!buybackContract || buybackMutation.isPending}
              >
                Withdraw leftover XTZ
              </Button>
            </Row>
            <Row>
              <Button
                onClick={() =>
                  buybackMutation.mutate({
                    action: "pause",
                    body: { contract: buybackContract },
                  })
                }
                disabled={!buybackContract || buybackMutation.isPending}
              >
                Pause
              </Button>
              <Button
                onClick={() =>
                  buybackMutation.mutate({
                    action: "unpause",
                    body: { contract: buybackContract },
                  })
                }
                disabled={!buybackContract || buybackMutation.isPending}
              >
                Unpause
              </Button>
            </Row>
            <Muted>
              Fund = XTZ sent from operator wallet to the buyback contract.
              Withdraw XTZ = rescue leftover after the window. Withdraw WTF =
              sweep accumulated WTF back to the operator wallet for
              redistribution.
            </Muted>
          </Stack>
        </GroupBox>

        <GroupBox label="5. Recent runs">
          <Table>
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
              {summary?.recentRuns.map((r) => (
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
                        rel="noreferrer"
                      >
                        {r.opHash.slice(0, 10)}…
                      </a>
                    ) : (
                      <Muted>—</Muted>
                    )}
                  </td>
                  <td>{new Date(r.startedAt).toLocaleString()}</td>
                  <td>
                    <Button
                      size="sm"
                      onClick={() => reconcileMutation.mutate(r.id)}
                      disabled={reconcileMutation.isPending || !r.opHash}
                    >
                      Reconcile
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </GroupBox>

        {runOutput ? (
          <GroupBox label="Last signer response">
            <Pre>{JSON.stringify(runOutput, null, 2)}</Pre>
          </GroupBox>
        ) : null}
      </Stack>
    </AppWindow>
  );
}

export default OperatorWallet;
