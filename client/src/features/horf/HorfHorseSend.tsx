import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { useWindowManager } from "../../lib/window-context";
import { sendHorfTokenTransfer, type HorfSendProgress } from "../../lib/tezos/horf-send";
import { claimHorfRewards, HORF_CLAIM_CHAIN_ID } from "../../lib/tezos/horf-claim";
import {
  HORF_RECIPIENT_LIMIT,
  assertTraderAddress,
  formatHorseAmount,
  parseHorseRecipientCsv,
  validateHorseRecipients,
  type HorfRecipient,
} from "./recipient-input";
import type { HorfHorseActivity, HorfHorseConfig, HorfPosseResponse } from "./social-types";

type RecipientRow = HorfRecipient & { id: number };
type CommunityCrpCategory = "helping-hand" | "influencer";
type SendStage = "preflight" | "preparing" | "wallet" | "confirming";
type HorseRewards = {
  season: string;
  rateHorse: string;
  rateRaw: string;
  countedUnits: string;
  accruedRaw: string;
  claimableRaw: string;
  claimedRaw: string;
  asOf: string | null;
  status: "ready" | "syncing" | "error";
  vaultAddress: string | null;
  claimReady: boolean;
  sourceComplete: boolean;
  sourceDiscrepancies: string;
};
type ClaimPermitResponse = {
  contractAddress: string;
  chainId: string;
  totalRaw: string;
  claimedRaw: string;
  claimableRaw: string;
  oracleEpoch: string;
  signature: string;
};

const Shell = styled.section`
  margin-top: clamp(36px, 5vw, 68px);
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--horf-ink, #f4ead6);
  font-family: var(--horf-font, "Avenir Next", "Segoe UI", sans-serif);
  min-width: 0;
  h2 { margin: 8px 0 10px; font: 700 clamp(30px, 4cqw, 48px)/1.06 var(--horf-display, Georgia, serif); letter-spacing: -.025em; text-wrap: balance; }
  h3 { margin: 0 0 9px; font-size: 21px; letter-spacing: -.02em; }
  p { margin: 0 0 12px; color: var(--horf-muted, #b7b5a7); font-size: 14px; line-height: 1.55; }
  label { display: block; margin-bottom: 6px; font: 700 13px/1.3 var(--horf-font, "Avenir Next", sans-serif); }
  input, select { width: 100%; min-width: 0; min-height: 42px; padding: 9px 11px; border: 1px solid var(--horf-line, #3d5148); border-radius: 9px; background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); font: 14px var(--horf-font, "Avenir Next", sans-serif); }
  input[type="checkbox"] { width: auto; min-height: 0; margin: 0 7px 0 0; accent-color: var(--horf-teal, #71b7a0); }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 2px; }
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 14px 20px;
  align-items: start;
  small { color: var(--horf-teal, #71b7a0); font: 800 12px/1.2 var(--horf-font, "Avenir Next", sans-serif); letter-spacing: .12em; text-transform: uppercase; }
  > div { max-width: 65ch; }
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
  margin-top: 20px;
  @container (max-width: 720px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 14px;
  background: var(--horf-surface, #1b2723);
`;

const Action = styled.button<{ $primary?: boolean }>`
  min-height: 40px;
  padding: 9px 15px;
  border: 1px solid ${(p) => p.$primary ? "var(--horf-gold, #d8a34a)" : "var(--horf-line, #3d5148)"};
  border-radius: 999px;
  background: ${(p) => p.$primary ? "var(--horf-gold, #d8a34a)" : "var(--horf-surface, #1b2723)"};
  color: ${(p) => p.$primary ? "#241a0f" : "var(--horf-ink, #f4ead6)"};
  cursor: pointer;
  font: 750 13px/1.2 var(--horf-font, "Avenir Next", sans-serif);
  transition: background 160ms ease, transform 160ms ease;
  &:hover:not(:disabled) { transform: translateY(-1px); background: ${(p) => p.$primary ? "#edbb61" : "var(--horf-field, #24332d)"}; }
  &:disabled { cursor: not-allowed; opacity: 0.55; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover:not(:disabled) { transform: none; } }
`;

const Note = styled.div<{ $error?: boolean }>`
  margin: 11px 0;
  padding: 12px 14px;
  border: 1px solid ${(p) => p.$error ? "#8b5c50" : "#477663"};
  border-radius: 12px;
  background: ${(p) => p.$error ? "#3b2723" : "#1d3932"};
  font: 600 13px/1.5 var(--horf-font, "Avenir Next", sans-serif);
  overflow-wrap: anywhere;
`;

const CommunityAwards = styled.section`
  margin-top: 22px;
  padding: clamp(17px, 2.5cqw, 24px);
  border: 1px solid #477663;
  border-radius: 16px;
  background: #1d3932;
  h3 { margin: 0 0 7px; color: var(--horf-ink, #f4ead6); font: 750 clamp(22px, 2.4cqw, 30px)/1.15 var(--horf-display, Georgia, serif); }
  > p { max-width: 78ch; margin-bottom: 15px; }
  .awards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .award { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; padding: 16px; border: 1px solid var(--horf-line, #3d5148); border-radius: 12px; background: var(--horf-surface, #1b2723); }
  .award small { color: var(--horf-teal, #71b7a0); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; }
  .award h4 { margin: 5px 0 7px; color: var(--horf-ink, #f4ead6); font: 750 21px/1.15 var(--horf-display, Georgia, serif); }
  .award p { flex: 1; margin-bottom: 14px; }
  .award a { display: inline-flex; align-items: center; text-decoration: none; }
  .nominee-note { margin: 12px 0 0; color: var(--horf-muted, #b7b5a7); font-size: 12px; overflow-wrap: anywhere; }
  @container (max-width: 680px) { .awards { grid-template-columns: 1fr; } }
`;

function firstValidRecipientWallet(rows: HorfRecipient[]): string | null {
  for (const row of rows) {
    try { return assertTraderAddress(row.address); } catch { /* Keep looking for a valid recipient. */ }
  }
  return null;
}

const ReceiptStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 0;
  > div { min-width: 0; padding: 13px 15px; background: var(--horf-surface, #1b2723); border: 1px solid var(--horf-line, #3d5148); border-radius: 12px; }
  strong { display: block; font: 700 22px/1.1 var(--horf-display, Georgia, serif); overflow-wrap: anywhere; }
  span { display: block; margin-top: 5px; color: var(--horf-muted, #b7b5a7); font: 750 11px/1.25 var(--horf-font, "Avenir Next", sans-serif); text-transform: uppercase; letter-spacing: .08em; }
  @container (max-width: 470px) { grid-template-columns: 1fr; }
`;

const SharedAmount = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(130px, 0.7fr);
  gap: 8px;
  align-items: end;
  padding: 12px;
  margin: 8px 0 12px;
  background: var(--horf-field, #24332d);
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 11px;
  label { margin: 0; }
  @container (max-width: 470px) { grid-template-columns: 1fr; }
`;

const RecipientRows = styled.ol`
  list-style: none;
  margin: 8px 0 11px;
  padding: 0;
  li { display: grid; grid-template-columns: 28px minmax(0, 1fr) 120px auto; gap: 7px; align-items: end; margin-bottom: 9px; }
  b { align-self: center; font: 750 13px var(--horf-font, "Avenir Next", sans-serif); }
  @container (max-width: 540px) { li { grid-template-columns: 24px minmax(0, 1fr) 90px; } li > button { grid-column: 2 / -1; } }
`;

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function sendStatus(stage: SendStage): string {
  if (stage === "preflight") return "Checking wallet account and Tezos Mainnet…";
  if (stage === "preparing") return "Preparing one FA2 transfer for all recipients…";
  if (stage === "wallet") return "Approve the $HORSE send in your wallet…";
  return "Waiting for the $HORSE transfer to confirm…";
}

function safeHorseBalance(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  try { return formatHorseAmount(raw, 8); } catch { return null; }
}

export function HorfHorseSend({
  address,
  signedIn,
  connectWallet,
  isConnecting,
}: {
  address: string | null;
  signedIn: boolean;
  connectWallet: () => Promise<void>;
  isConnecting: boolean;
}) {
  const windowManager = useWindowManager();
  const nextRowId = useRef(2);
  const [rows, setRows] = useState<RecipientRow[]>([{ id: 1, address: "", amount: "1" }]);
  const [sameAmount, setSameAmount] = useState(true);
  const [sharedAmount, setSharedAmount] = useState("1");
  const [csvAmount, setCsvAmount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<SendStage | null>(null);
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ hash: string; count: number } | null>(null);
  const [claimStage, setClaimStage] = useState<"permit" | "preflight" | "preparing" | "wallet" | "confirming" | null>(null);
  const [claimHash, setClaimHash] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["horf", "horse-config", address],
    queryFn: () => api.get<HorfHorseConfig>(`/api/horf/horse/config${address ? `?address=${encodeURIComponent(address)}` : ""}`),
    refetchOnWindowFocus: true,
  });
  const posseQuery = useQuery({
    queryKey: ["horf", "posse", address],
    queryFn: () => api.get<HorfPosseResponse>(`/api/horf/posse?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
  });
  const config = configQuery.data;
  const ready = !configQuery.isError && config?.status === "ready" &&
    config.network === "mainnet" && config.chainId === "NetXdQprcVkpaWU" &&
    config.token?.symbol === "HORSE" && config.token.tokenId === "0" && config.token.decimals === 8 &&
    /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(config.token.contract);
  const activityQuery = useQuery({
    queryKey: ["horf", "horse-activity", address, config?.token?.contract],
    queryFn: () => api.get<HorfHorseActivity>(`/api/horf/horse/activity?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address && ready),
    refetchOnWindowFocus: true,
  });
  const rewardsQuery = useQuery({
    queryKey: ["horf", "horse-rewards", address],
    queryFn: () => api.get<HorseRewards>(`/api/horf/horse/rewards?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
    refetchOnWindowFocus: true,
  });
  const balance = ready ? safeHorseBalance(config?.balanceRaw) : null;
  const activity = activityQuery.data;
  const activityReady = ready && activity?.status === "ready" &&
    activity.network === "mainnet" && activity.chainId === "NetXdQprcVkpaWU" &&
    activity.token?.contract === config?.token?.contract;
  const partners = Array.isArray(posseQuery.data?.partners) ? posseQuery.data.partners : [];
  const reward = rewardsQuery.data;
  const canClaimReward = Boolean(address && reward?.status === "ready" && reward.asOf && reward.sourceComplete && reward.claimReady &&
    reward.vaultAddress && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(reward.vaultAddress) &&
    /^\d+$/.test(reward.claimableRaw) && BigInt(reward.claimableRaw) > 0n);
  const busy = stage !== null;
  const awardNominee = firstValidRecipientWallet(rows);

  function crpNominationHref(category: CommunityCrpCategory): string {
    const params = new URLSearchParams({ category });
    if (awardNominee) params.set("nominee", awardNominee);
    return `/crp-nominate?${params.toString()}`;
  }

  function openCrpNomination(category: CommunityCrpCategory) {
    windowManager.openPage(crpNominationHref(category));
    logClientSystemEvent({
      eventType: "horf.crp_nominations.opened",
      message: "CRP Nominations opened from Horf",
      metadata: { categoryId: category, nominee: awardNominee },
    });
  }

  function setRow(id: number, patch: Partial<HorfRecipient>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function addRow() {
    if (rows.length >= HORF_RECIPIENT_LIMIT) return;
    setRows((current) => [...current, { id: nextRowId.current++, address: "", amount: sameAmount ? sharedAmount : current[current.length - 1]?.amount ?? "1" }]);
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(null);
    try {
      const imported = parseHorseRecipientCsv(await file.text(), sameAmount ? sharedAmount : csvAmount);
      const existing = rows.filter((row) => row.address.trim());
      const combined = [...existing, ...imported];
      validateHorseRecipients(combined, address ?? "", 8);
      if (sameAmount && imported.some((row) => row.amount !== sharedAmount)) setSameAmount(false);
      setRows(combined.map((row) => ({ ...row, id: nextRowId.current++ })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The CSV could not be read.");
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!address || !ready || !config?.token || busy || claimStage) return;
    setError(null);
    setSuccess(null);
    setSubmittedHash(null);
    let hash: string | null = null;
    try {
      const recipients = validateHorseRecipients(rows, address, config.token.decimals);
      const total = recipients.reduce((sum, recipient) => sum + BigInt(recipient.amountRaw), 0n);
      const progress: HorfSendProgress = {
        onStage: setStage,
        onSubmitted: (opHash) => { hash = opHash; setSubmittedHash(opHash); },
      };
      const opHash = await sendHorfTokenTransfer({
        sender: address,
        chainId: config.chainId,
        tokenContract: config.token.contract,
        tokenId: config.token.tokenId,
        recipients,
      }, progress);
      setSuccess({ hash: opHash, count: recipients.length });
      setRows([{ id: nextRowId.current++, address: "", amount: sameAmount ? sharedAmount : "1" }]);
      void configQuery.refetch();
      void activityQuery.refetch();
      logClientSystemEvent({ eventType: "horf.horse.sent", message: "$HORSE sent to traders", metadata: { recipients: recipients.length, amountRaw: total.toString(), opHash } });
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "$HORSE send failed."}${hash ? " The transaction was submitted; inspect it before retrying." : ""}`);
    } finally {
      setStage(null);
    }
  }

  async function claimReward() {
    if (!address || !reward?.vaultAddress || !canClaimReward || claimStage || busy) return;
    setClaimError(null);
    setClaimSuccess(null);
    setClaimHash(null);
    let submittedHash: string | null = null;
    try {
      setClaimStage("permit");
      const permit = await api.post<ClaimPermitResponse>("/api/horf/horse/claim-permit", { address });
      if (permit.chainId !== HORF_CLAIM_CHAIN_ID || permit.contractAddress !== reward.vaultAddress ||
          !/^\d+$/.test(permit.claimableRaw) || BigInt(permit.claimableRaw) <= 0n) {
        throw new Error("The HORSE claim permit does not match this Mainnet vault or has no claimable reward. Refresh and try again.");
      }
      const opHash = await claimHorfRewards(address, {
        contractAddress: permit.contractAddress,
        chainId: permit.chainId,
        totalRaw: permit.totalRaw,
        permit: { totalRaw: permit.totalRaw, signature: permit.signature },
      }, {
        onStage: setClaimStage,
        onSubmitted: (hash) => { submittedHash = hash; setClaimHash(hash); },
      });
      setClaimSuccess("HORSE vault claim confirmed on Tezos. Your wallet paid the XTZ gas; the indexed reward balance may take a moment to update.");
      logClientSystemEvent({ eventType: "horf.horse.reward_claimed", message: "Horf HORSE reward claimed from Mainnet vault", metadata: { address, opHash, totalRaw: permit.totalRaw } });
      void rewardsQuery.refetch();
      void configQuery.refetch();
      void activityQuery.refetch();
    } catch (cause) {
      setClaimError(`${cause instanceof Error ? cause.message : "The HORSE claim could not be completed."}${submittedHash ? " The claim was submitted; inspect it on TzKT before retrying." : ""}`);
    } finally { setClaimStage(null); }
  }

  return (
    <Shell id="horf-horse-send" data-horf-region="horse-send" aria-label="Send HORSE">
      <Header>
        <div>
          <small>Pass the reins · Tezos Mainnet</small>
          <h2>Send $HORSE to your posse</h2>
          <p>Send HORSE to up to 50 wallets at once. Add riders, pick your posse, or upload a CSV.</p>
          <p>Send a qualifying horse to earn 10 HORSE. Return rides earn another 10. Stable claims reward the listing owner. Claimants pay Tezos gas.</p>
        </div>
        <Action type="button" onClick={() => { void configQuery.refetch(); void activityQuery.refetch(); void rewardsQuery.refetch(); }} disabled={configQuery.isFetching || activityQuery.isFetching || rewardsQuery.isFetching}>Refresh $HORSE</Action>
      </Header>
      {configQuery.isPending && <Note role="status">Checking the verified $HORSE contract and wallet balance…</Note>}
      {configQuery.isError && <Note $error role="alert">$HORSE configuration is unavailable. Sending is disabled until it loads.</Note>}
      {config?.status === "unconfigured" && <Note $error role="status">The $HORSE Mainnet contract has not been verified and configured yet. You can prepare your posse, but wallet sends are disabled.</Note>}
      {config?.status === "ready" && !ready && !configQuery.isError && <Note $error role="alert">The $HORSE contract configuration does not match its Mainnet token. Sending is disabled.</Note>}
      {ready && <Note role="status">Verified $HORSE FA2: <a href={`https://tzkt.io/${config!.token!.contract}`} target="_blank" rel="noopener noreferrer">{shortAddress(config!.token!.contract)}</a> · Token #0 · 8 decimals{balance ? ` · ${balance} HORSE indexed in this wallet` : ""}</Note>}
      {address && ready && activityQuery.isPending && <Note role="status">Reading your cumulative $HORSE receipts…</Note>}
      {address && ready && activityQuery.isError && <Note $error role="alert">$HORSE receipt history is temporarily unavailable. Your wallet balance and send controls remain available.</Note>}
      {address && activityReady && activity && <>
        <ReceiptStrip data-horf-horse-activity aria-label="HORSE transfer activity">
          <div><strong>{formatHorseAmount(activity.receivedRaw, 8)}</strong><span>All HORSE received</span></div>
          <div><strong>{formatHorseAmount(activity.awardedRaw, 8)}</strong><span>Received from wtf.tez on-chain</span></div>
          <div><strong>{formatHorseAmount(activity.sentRaw, 8)}</strong><span>HORSE sent</span></div>
        </ReceiptStrip>
        {activity.asOf && <p>HORSE receipts indexed through {new Date(activity.asOf).toLocaleString()}.</p>}
      </>}
      {address && rewardsQuery.isPending && <Note role="status">Checking this season’s earned $HORSE…</Note>}
      {address && rewardsQuery.isError && <Note $error role="alert">The participation reward ledger is unavailable. Refresh $HORSE to try again; on-chain receipts above remain separate.</Note>}
      {address && reward && !reward.asOf && <Note data-horf-horse-rewards role="status">Horf is building the current-season reward ledger. Claimable and claimed totals will appear after its first indexed snapshot; vault claims need a configured and funded Mainnet contract. <Action data-horf-horse-claim type="button" disabled>Claim HORSE · unavailable while scanning</Action></Note>}
      {address && reward?.asOf && <Note data-horf-horse-rewards role="status">
        <strong>Current-season reward ledger</strong> · {reward.rateHorse} HORSE per qualifying horse sent · {reward.countedUnits} rewardable outbound horse trades · {formatHorseAmount(reward.accruedRaw, 8)} HORSE accrued · {formatHorseAmount(reward.claimableRaw, 8)} HORSE claimable · {formatHorseAmount(reward.claimedRaw, 8)} HORSE claimed on-chain.
        {reward.status !== "ready" && <> {reward.status === "syncing" ? "Counts are provisional while Horf scans Mainnet." : "The ledger needs a refresh; shown figures are the last available snapshot."}</>}
        <> Indexed through {new Date(reward.asOf).toLocaleString()}.</>
        {!reward.claimReady && (/^0+$/.test(reward.claimableRaw) ? <> There is no HORSE to claim from this snapshot.</> : <> Vault claiming is paused until the season scan, Mainnet vault signer, and HORSE reserve are ready.</>)}
        {reward.claimReady && reward.vaultAddress && <> Vault: <a href={`https://tzkt.io/${reward.vaultAddress}`} target="_blank" rel="noopener noreferrer">{shortAddress(reward.vaultAddress)}</a>.</>}
        <div style={{ marginTop: 8 }}><Action data-horf-horse-claim type="button" onClick={() => void claimReward()} disabled={!canClaimReward || claimStage !== null || busy}>{claimStage ? "Claim in progress…" : "Claim HORSE · pay XTZ gas"}</Action></div>
      </Note>}
      {address && reward && /^\d+$/.test(reward.sourceDiscrepancies) && BigInt(reward.sourceDiscrepancies) > 0n && <Note $error role="alert">Some previously claimed reward entries no longer match their source trades. The reward ledger needs review; do not treat its accrued and claimable figures as final.</Note>}
      {claimStage && <Note role="status" aria-live="polite">{claimStage === "permit" ? "Requesting your cumulative HORSE claim permit…" : claimStage === "preflight" ? "Checking wallet and Tezos Mainnet…" : claimStage === "preparing" ? "Preparing the vault claim…" : claimStage === "wallet" ? "Approve the vault claim and XTZ gas in your wallet…" : "Waiting for Tezos confirmation…"} {claimHash && <a href={`https://tzkt.io/${encodeURIComponent(claimHash)}`} target="_blank" rel="noopener noreferrer">View submitted claim</a>}</Note>}
      {claimError && <Note $error role="alert">{claimError}</Note>}
      {claimSuccess && <Note role="status">{claimSuccess} {claimHash && <a href={`https://tzkt.io/${encodeURIComponent(claimHash)}`} target="_blank" rel="noopener noreferrer">View transaction</a>}</Note>}
      {!address && <Note $error>Connect and verify a Tezos wallet before sending HORSE. <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : signedIn ? "Connect wallet" : "Connect and verify wallet"}</Action></Note>}
      <Columns>
        <Panel data-horf-horse-form>
          <h3>Make one send</h3>
          <form onSubmit={(event) => void send(event)}>
            <SharedAmount>
              <label htmlFor="horf-horse-same-amount"><input id="horf-horse-same-amount" data-horf-horse-same-amount type="checkbox" checked={sameAmount} onChange={(event) => { const checked = event.target.checked; setSameAmount(checked); if (checked) { const amount = rows[0]?.amount ?? sharedAmount; setSharedAmount(amount); setRows((current) => current.map((row) => ({ ...row, amount }))); } }} disabled={busy} />Same amount for all recipients</label>
              <div>
                <label htmlFor="horf-horse-shared-amount">HORSE amount per recipient</label>
                <input id="horf-horse-shared-amount" data-horf-horse-shared-amount inputMode="decimal" value={sharedAmount} onChange={(event) => { const value = event.target.value; setSharedAmount(value); if (sameAmount) setRows((current) => current.map((row) => ({ ...row, amount: value }))); }} disabled={busy || !sameAmount} />
              </div>
            </SharedAmount>
            <RecipientRows data-horf-horse-rows>
              {rows.map((row, index) => (
                <li key={row.id} data-horf-horse-row>
                  <b>{index + 1}.</b>
                  <div>
                    <label htmlFor={`horf-horse-address-${row.id}`}>Trader wallet</label>
                    <input id={`horf-horse-address-${row.id}`} data-horf-horse-address value={row.address} onChange={(event) => setRow(row.id, { address: event.target.value })} placeholder="tz1…" disabled={busy} />
                    {partners.length > 0 && <select aria-label={`Choose posse trader for recipient ${index + 1}`} value="" onChange={(event) => { setRow(row.id, { address: event.target.value }); logClientSystemEvent({ eventType: "horf.posse.selected", message: "Horf posse trader selected for HORSE send", metadata: { address: event.target.value } }); }} disabled={busy}>
                      <option value="">Choose from posse…</option>
                      {partners.map((partner) => <option key={partner.id} value={partner.address}>{partner.nickname || shortAddress(partner.address)}</option>)}
                    </select>}
                  </div>
                  <div>
                    <label htmlFor={`horf-horse-amount-${row.id}`}>$HORSE</label>
                    <input id={`horf-horse-amount-${row.id}`} data-horf-horse-amount inputMode="decimal" value={row.amount} onChange={(event) => setRow(row.id, { amount: event.target.value })} disabled={busy || sameAmount} />
                  </div>
                  <Action type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} disabled={busy || rows.length === 1} aria-label={`Remove recipient ${index + 1}`}>Remove</Action>
                </li>
              ))}
            </RecipientRows>
            <Action data-horf-horse-add-row type="button" onClick={addRow} disabled={busy || rows.length >= HORF_RECIPIENT_LIMIT}>Add recipient row</Action>
            <p>{rows.length} of {HORF_RECIPIENT_LIMIT} recipient rows in this send.</p>
            <div>
              {!sameAmount && <><label htmlFor="horf-horse-csv-amount">Default $HORSE amount for address-only CSV rows</label>
              <input id="horf-horse-csv-amount" inputMode="decimal" value={csvAmount} onChange={(event) => setCsvAmount(event.target.value)} disabled={busy} /></>}
              <label htmlFor="horf-horse-csv" style={{ marginTop: 9 }}>Upload comma-separated recipients (.csv)</label>
              <input id="horf-horse-csv" data-horf-horse-csv type="file" accept=".csv,text/csv,text/plain" onChange={(event) => void importCsv(event)} disabled={busy} />
              <p>CSV: comma-separated addresses or address,amount rows. Optional header; no duplicate wallets.</p>
            </div>
            <Action data-horf-horse-send type="submit" $primary disabled={!address || !ready || busy || claimStage !== null}>Send $HORSE</Action>
            <p>Your wallet signs one Mainnet transaction. Tezos gas applies. The final token balance is checked on-chain.</p>
          </form>
        </Panel>
      </Columns>
      {stage && <Note role="status" aria-live="polite">{sendStatus(stage)} {submittedHash && <a href={`https://tzkt.io/${encodeURIComponent(submittedHash)}`} target="_blank" rel="noopener noreferrer">View transaction</a>}</Note>}
      {error && <Note $error role="alert">{error}</Note>}
      {success && <Note role="status">$HORSE confirmed for {success.count} {success.count === 1 ? "trader" : "traders"}. <a href={`https://tzkt.io/${encodeURIComponent(success.hash)}`} target="_blank" rel="noopener noreferrer">View transaction</a>.</Note>}
      <CommunityAwards data-horf-crp-awards aria-label="Nominate horse community helpers for Tezos CRP">
        <h3>Tip your hat to a good rider 🤠🐎</h3>
        <p>Reward a helpful rider with $HORSE or a Tezos CRP nomination. Helping Hand and Influencer are separate from HAHA awards.</p>
        <div className="awards">
          <div className="award"><small>For the helpful hands</small><h4>Helping Hand Award 🤝</h4><p>Know a rider who guides newcomers, shares know-how, or helps the herd find its feet?</p>
            {signedIn
              ? <Action data-horf-crp-open type="button" onClick={() => openCrpNomination("helping-hand")}>Nominate a helping hand ↗</Action>
              : <Action as="a" data-horf-crp-sign-in href={`/login?return=${encodeURIComponent(crpNominationHref("helping-hand"))}`}>Sign in to nominate a helping hand ↗</Action>}
          </div>
          <div className="award"><small>For the loud and proud</small><h4>Influencer Award 📣</h4><p>Know a voice that champions horse art and carries the Tezos story far down the trail?</p>
            {signedIn
              ? <Action data-horf-crp-influencer-open type="button" onClick={() => openCrpNomination("influencer")}>Nominate an influencer ↗</Action>
              : <Action as="a" data-horf-crp-influencer-sign-in href={`/login?return=${encodeURIComponent(crpNominationHref("influencer"))}`}>Sign in to nominate an influencer ↗</Action>}
          </div>
        </div>
        <p className="nominee-note">{awardNominee ? <>The first valid recipient wallet above, <strong>{shortAddress(awardNominee)}</strong>, will be prefilled as nominee. You can review and change it in CRP.</> : "Enter a recipient wallet above to prefill a nominee, or choose someone in CRP."}</p>
      </CommunityAwards>
    </Shell>
  );
}
