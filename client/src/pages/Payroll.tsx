import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Link2, LogOut, RefreshCw, Send, ShieldCheck } from "lucide-react";
import styled from "styled-components";
import { WTF_TOKEN, normalizeUserRoles } from "@shared/types";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiNotice, UiPanel } from "../components/wtfos-ui";
import { useAuth } from "../lib/auth-context";
import { logClientSystemEvent } from "../lib/system-log";
import {
  PAYROLL_CHAIN_ID,
  PAYROLL_NETWORK,
  assertPayrollRecipient,
  formatAtomic,
  getPayrollWalletController,
  parseDecimalToAtomic,
  type PayrollAsset,
  type PayrollBalances,
  type PayrollTransferRequest,
  type PayrollWalletController,
} from "../features/payroll/payroll-wallet";

const Shell = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
  color: var(--wtf-app-text, #111);
`;

const Header = styled.header`
  display: grid;
  gap: 6px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: var(--wtf-type-title, 22px);
  line-height: 1.2;
`;

const Copy = styled.p`
  margin: 0;
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-body, 14px);
  line-height: 1.45;
`;

const WalletBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const Address = styled.code`
  overflow-wrap: anywhere;
  font-size: var(--wtf-type-caption, 13px);
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const BalanceGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;

  div {
    padding: 10px;
    border: 1px solid var(--wtf-app-border, #808080);
    background: var(--wtf-app-surface-raised, #fff);
  }

  dt {
    color: var(--wtf-app-muted-text, #384352);
    font-size: var(--wtf-type-caption, 13px);
  }

  dd {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const Form = styled.form`
  display: grid;
  gap: 12px;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(120px, 0.35fr) minmax(180px, 0.65fr);
  gap: 10px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.label`
  display: grid;
  gap: 5px;
  min-width: 0;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

const Input = styled.input`
  min-width: 0;
  min-height: 38px;
  padding: 8px;
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-control-bg, #fff);
  border: 1px solid var(--wtf-app-control-border, #808080);
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--wtf-focus-ring, #005fcc);
    outline-offset: 2px;
  }
`;

const Select = styled.select`
  min-height: 38px;
  padding: 8px;
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-control-bg, #fff);
  border: 1px solid var(--wtf-app-control-border, #808080);
  font: inherit;
`;

const Review = styled.div`
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 2px solid #7c5b00;
  background: #fff7d6;
  color: #241900;

  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 5px 10px;
    margin: 0;
    font-size: 13px;
  }

  dt {
    font-weight: 700;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
`;

const Status = styled.div`
  min-height: 22px;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

function transferDecimals(asset: PayrollAsset) {
  return asset === "WTF" ? WTF_TOKEN.decimals : 6;
}

function assetBalance(balances: PayrollBalances | null, asset: PayrollAsset) {
  if (!balances) return "—";
  return asset === "WTF"
    ? formatAtomic(balances.wtfAtomic, WTF_TOKEN.decimals, 8)
    : formatAtomic(balances.xtzMutez, 6, 6);
}

export function Payroll() {
  const { user } = useAuth();
  const isAdmin = normalizeUserRoles(user?.roles ?? user?.role ?? null).includes("admin");
  const controllerRef = useRef<PayrollWalletController | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [balances, setBalances] = useState<PayrollBalances | null>(null);
  const [asset, setAsset] = useState<PayrollAsset>("XTZ");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<PayrollTransferRequest | null>(null);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "refresh" | "send" | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [operationHash, setOperationHash] = useState("");

  function controller() {
    if (!controllerRef.current) controllerRef.current = getPayrollWalletController();
    return controllerRef.current;
  }

  useEffect(() => {
    return () => {
      void controllerRef.current?.disconnect().catch(() => undefined);
    };
  }, []);

  const formattedReviewAmount = useMemo(
    () => review ? formatAtomic(review.atomicAmount, transferDecimals(review.asset), transferDecimals(review.asset)) : "",
    [review],
  );

  async function refreshBalances(address = walletAddress) {
    if (!address) return;
    setBusy("refresh");
    setError("");
    try {
      setBalances(await controller().getBalances(address));
      setStatus("Funding balances refreshed from Tezos mainnet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function connectFundingWallet() {
    setBusy("connect");
    setError("");
    setOperationHash("");
    try {
      const address = await controller().connect();
      setWalletAddress(address);
      setStatus(`Payroll funding wallet connected: ${address}`);
      logClientSystemEvent({
        eventType: "payroll.wallet_connected",
        metadata: { network: PAYROLL_NETWORK, chainId: PAYROLL_CHAIN_ID },
      });
      await refreshBalances(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function disconnectFundingWallet() {
    setBusy("disconnect");
    setError("");
    try {
      await controller().disconnect();
      controllerRef.current = null;
      setWalletAddress("");
      setBalances(null);
      setReview(null);
      setStatus("Payroll funding wallet disconnected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function prepareTransfer(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setOperationHash("");
    try {
      if (!walletAddress) throw new Error("Connect a Payroll funding wallet first.");
      const normalizedRecipient = assertPayrollRecipient(recipient);
      const atomicAmount = parseDecimalToAtomic(amount, transferDecimals(asset));
      const availableAtomic = asset === "WTF" ? balances?.wtfAtomic : balances?.xtzMutez;
      if (!availableAtomic) {
        throw new Error("Refresh the funding wallet balances before preparing a transfer.");
      }
      if (BigInt(atomicAmount) > BigInt(availableAtomic)) {
        throw new Error(`Amount exceeds the connected wallet's available ${asset} balance.`);
      }
      if (normalizedRecipient === walletAddress) {
        throw new Error("Recipient matches the connected funding wallet.");
      }
      setReview({
        asset,
        from: walletAddress,
        recipient: normalizedRecipient,
        atomicAmount,
      });
      logClientSystemEvent({
        eventType: "payroll.transfer_reviewed",
        metadata: { asset, network: PAYROLL_NETWORK, chainId: PAYROLL_CHAIN_ID },
      });
      setStatus("Review the exact asset, amount, source, recipient, and network before opening the wallet prompt.");
    } catch (err) {
      setReview(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function sendTransfer() {
    if (!review) return;
    setBusy("send");
    setError("");
    setOperationHash("");
    try {
      const hash = await controller().transfer(review);
      setOperationHash(hash);
      logClientSystemEvent({
        eventType: "payroll.transfer_confirmed",
        metadata: {
          asset: review.asset,
          network: PAYROLL_NETWORK,
          chainId: PAYROLL_CHAIN_ID,
          operationHash: hash,
        },
      });
      setStatus(`${review.asset} transfer confirmed on Tezos mainnet.`);
      setReview(null);
      setAmount("");
      await refreshBalances(review.from);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  if (!user || !isAdmin) {
    return (
      <AppWindow title="Payroll">
        <UiNotice tone="danger" title="Strict-admin access required">
          Payroll can move WTF and XTZ. Sign in with the admin role to use this app.
        </UiNotice>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Payroll">
      <Shell data-payroll-surface="payroll">
        <Header>
          <Title>Payroll</Title>
          <Copy>
            Fund deployment, reward, treasury, and contract addresses from a wallet connected only to this app.
            Payroll never links this signer to your wtfOS profile and never stores keys or seed phrases.
          </Copy>
        </Header>

        <UiNotice tone="warning" title="Mainnet value transfer">
          Payroll is fixed to Tezos mainnet ({PAYROLL_CHAIN_ID}). Address validation confirms syntax only; verify that a
          destination contract can receive the selected asset before sending.
        </UiNotice>

        <UiPanel title="Funding wallet" compact>
          <WalletBar>
            <div>
              <strong>{walletAddress ? "Connected for Payroll signing" : "No Payroll wallet connected"}</strong>
              <br />
              <Address data-payroll-wallet-address>{walletAddress || "Profile wallet is intentionally not used."}</Address>
            </div>
            <Actions>
              {!walletAddress ? (
                <UiButton
                  onClick={connectFundingWallet}
                  disabled={busy !== null}
                  aria-busy={busy === "connect"}
                  data-payroll-connect
                >
                  <Link2 size={16} aria-hidden /> {busy === "connect" ? "Opening wallet…" : "Connect funding wallet"}
                </UiButton>
              ) : (
                <>
                  <UiButton
                    onClick={() => void refreshBalances()}
                    disabled={busy !== null}
                    aria-label="Refresh Payroll funding balances"
                  >
                    <RefreshCw size={16} aria-hidden /> Refresh balances
                  </UiButton>
                  <UiButton onClick={disconnectFundingWallet} disabled={busy !== null} data-payroll-disconnect>
                    <LogOut size={16} aria-hidden /> Disconnect Payroll wallet
                  </UiButton>
                </>
              )}
            </Actions>
          </WalletBar>
        </UiPanel>

        <BalanceGrid aria-label="Payroll funding wallet balances">
          <div>
            <dt>XTZ available</dt>
            <dd>{assetBalance(balances, "XTZ")} XTZ</dd>
          </div>
          <div>
            <dt>WTF available</dt>
            <dd>{assetBalance(balances, "WTF")} WTF</dd>
          </div>
        </BalanceGrid>

        <UiPanel title="Prepare transfer" compact>
          <Form onSubmit={prepareTransfer}>
            <FieldGrid>
              <Field>
                Asset
                <Select
                  value={asset}
                  onChange={(event) => {
                    setAsset(event.target.value as PayrollAsset);
                    setReview(null);
                  }}
                  disabled={!walletAddress || busy !== null}
                  data-payroll-asset
                >
                  <option value="XTZ">XTZ</option>
                  <option value="WTF">WTF</option>
                </Select>
              </Field>
              <Field>
                Amount
                <Input
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setReview(null);
                  }}
                  inputMode="decimal"
                  placeholder={asset === "WTF" ? "0.00000000" : "0.000000"}
                  disabled={!walletAddress || busy !== null}
                  data-payroll-amount
                />
              </Field>
            </FieldGrid>
            <Field>
              Recipient wallet or contract
              <Input
                value={recipient}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setReview(null);
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="tz1… or KT1…"
                disabled={!walletAddress || busy !== null}
                data-payroll-recipient
              />
            </Field>
            <Actions>
              <UiButton type="submit" disabled={!walletAddress || busy !== null} data-payroll-review>
                <ShieldCheck size={16} aria-hidden /> Review transfer
              </UiButton>
            </Actions>
          </Form>
        </UiPanel>

        {review ? (
          <Review data-payroll-review-panel>
            <strong>Confirm this mainnet transfer</strong>
            <dl>
              <dt>Asset</dt><dd>{review.asset}</dd>
              <dt>Amount</dt><dd>{formattedReviewAmount} {review.asset}</dd>
              <dt>From</dt><dd>{review.from}</dd>
              <dt>Recipient</dt><dd>{review.recipient}</dd>
              <dt>Network</dt><dd>{PAYROLL_NETWORK} · {PAYROLL_CHAIN_ID}</dd>
              {review.asset === "WTF" ? <><dt>WTF contract</dt><dd>{WTF_TOKEN.contract} / token {WTF_TOKEN.tokenId}</dd></> : null}
            </dl>
            <Actions>
              <UiButton
                onClick={sendTransfer}
                disabled={busy !== null}
                aria-busy={busy === "send"}
                data-payroll-send
              >
                <Send size={16} aria-hidden /> {busy === "send" ? "Waiting for confirmation…" : `Send ${review.asset}`}
              </UiButton>
              <UiButton onClick={() => setReview(null)} disabled={busy !== null}>Cancel transfer</UiButton>
            </Actions>
          </Review>
        ) : null}

        {error ? <UiNotice tone="danger" title="Payroll blocked the action">{error}</UiNotice> : null}
        <Status role="status" aria-live="polite">{status}</Status>
        {operationHash ? (
          <UiNotice tone="success" title="Transfer confirmed">
            <a href={`https://tzkt.io/${operationHash}`} target="_blank" rel="noopener noreferrer">
              View {operationHash} on TzKT <ExternalLink size={14} aria-hidden />
            </a>
          </UiNotice>
        ) : null}
      </Shell>
    </AppWindow>
  );
}

export default Payroll;
