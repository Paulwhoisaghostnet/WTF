import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, fetchWithCsrf, isApiRequestError } from "../../lib/api";
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
  margin-top: 24px;
  padding: 17px;
  border: 3px solid #4b2622;
  background: #e9d4a7;
  box-shadow: inset 0 0 0 2px #fff0c9, 4px 4px 0 #bd794d;
  min-width: 0;
  h2 { margin: 3px 0 5px; font-size: clamp(25px, 4cqw, 38px); line-height: 1; }
  h3 { margin: 0 0 7px; font-size: 19px; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.45; }
  label { display: block; margin-bottom: 5px; font: 700 12px/1.25 "Courier New", monospace; }
  input, select { width: 100%; min-width: 0; min-height: 36px; padding: 6px 8px; border: 1px solid #845b43; border-radius: 0; background: #fffdf3; color: #321d1a; font: 13px Georgia, serif; }
  input[type="checkbox"] { width: auto; min-height: 0; margin: 0 6px 0 0; accent-color: #7b412d; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid #0b6874; outline-offset: 2px; }
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 14px;
  align-items: start;
  small { color: #91402f; font: 700 11px/1.2 "Courier New", monospace; text-transform: uppercase; }
  > div { max-width: 610px; }
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(220px, 0.8fr);
  gap: 16px;
  margin-top: 15px;
  @container (max-width: 720px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 13px;
  border-top: 4px solid #ad4b34;
  background: #fff8e8;
  box-shadow: inset 0 0 0 1px #caab84;
`;

const Action = styled.button<{ $primary?: boolean }>`
  min-height: 36px;
  padding: 6px 10px;
  border: 2px solid #62392c;
  background: ${(p) => p.$primary ? "#f4ca67" : "#fff3d9"};
  color: #39241b;
  box-shadow: 2px 2px 0 #ab7452;
  cursor: pointer;
  font: 700 12px/1.2 "Courier New", monospace;
  &:disabled { cursor: not-allowed; opacity: 0.55; box-shadow: none; }
`;

const Note = styled.div<{ $error?: boolean }>`
  margin: 11px 0;
  padding: 9px 11px;
  border-left: 5px solid ${(p) => p.$error ? "#a43c2e" : "#41704c"};
  background: ${(p) => p.$error ? "#fff0d6" : "#edf3db"};
  font: 700 12px/1.45 "Courier New", monospace;
  overflow-wrap: anywhere;
`;

const ReceiptStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 0;
  > div { min-width: 0; padding: 9px 10px; background: #fff8e8; border: 1px solid #bb9771; }
  strong { display: block; font: 700 18px/1.1 Georgia, serif; overflow-wrap: anywhere; }
  span { display: block; margin-top: 3px; font: 700 10px/1.25 "Courier New", monospace; text-transform: uppercase; }
  @container (max-width: 470px) { grid-template-columns: 1fr; }
`;

const SharedAmount = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(130px, 0.7fr);
  gap: 8px;
  align-items: end;
  padding: 10px;
  margin: 8px 0 12px;
  background: #f4e4c8;
  border: 1px solid #b38a67;
  label { margin: 0; }
  @container (max-width: 470px) { grid-template-columns: 1fr; }
`;

const RecipientRows = styled.ol`
  list-style: none;
  margin: 8px 0 11px;
  padding: 0;
  li { display: grid; grid-template-columns: 28px minmax(0, 1fr) 120px auto; gap: 7px; align-items: end; margin-bottom: 9px; }
  b { align-self: center; font: 700 12px "Courier New", monospace; }
  @container (max-width: 540px) { li { grid-template-columns: 24px minmax(0, 1fr) 90px; } li > button { grid-column: 2 / -1; } }
`;

const Compact = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  align-items: end;
  margin: 8px 0;
  @container (max-width: 470px) { grid-template-columns: 1fr; }
`;

const PosseList = styled.ul`
  list-style: none;
  margin: 11px 0 0;
  padding: 0;
  li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-top: 1px solid #dec4a3; font-size: 13px; }
  span { overflow-wrap: anywhere; }
  small { display: block; color: #806055; font: 11px/1.3 "Courier New", monospace; }
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
  const qc = useQueryClient();
  const nextRowId = useRef(2);
  const [rows, setRows] = useState<RecipientRow[]>([{ id: 1, address: "", amount: "1" }]);
  const [sameAmount, setSameAmount] = useState(true);
  const [sharedAmount, setSharedAmount] = useState("1");
  const [csvAmount, setCsvAmount] = useState("1");
  const [posseAddress, setPosseAddress] = useState("");
  const [posseNickname, setPosseNickname] = useState("");
  const [posseBusy, setPosseBusy] = useState(false);
  const [posseError, setPosseError] = useState<string | null>(null);
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
  const posseScopeDenied = isApiRequestError(posseQuery.error) && posseQuery.error.status === 403;
  const posseRestricted = posseScopeDenied && /restricted|blacklist/i.test(posseQuery.error?.message ?? "");
  const busy = stage !== null;

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

  async function addPosse(event: FormEvent) {
    event.preventDefault();
    if (posseBusy) return;
    setPosseError(null);
    try {
      if (!address) throw new Error("Connect and verify a wallet before saving your posse.");
      const partner = assertTraderAddress(posseAddress);
      if (partner === address) throw new Error("Your own wallet is not a trading partner.");
      setPosseBusy(true);
      await api.post("/api/horf/posse", { ownerAddress: address, address: partner, nickname: posseNickname.trim() || undefined });
      setPosseAddress("");
      setPosseNickname("");
      await qc.invalidateQueries({ queryKey: ["horf", "posse"] });
      logClientSystemEvent({ eventType: "horf.posse.added", message: "Trader added to Horf posse", metadata: { address: partner } });
    } catch (cause) {
      setPosseError(cause instanceof Error ? cause.message : "Could not save this trader.");
    } finally {
      setPosseBusy(false);
    }
  }

  async function removePosse(id: number, partner: string) {
    if (posseBusy) return;
    setPosseError(null);
    try {
      setPosseBusy(true);
      const response = await fetchWithCsrf(`/api/horf/posse/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not remove this trader.");
      }
      await qc.invalidateQueries({ queryKey: ["horf", "posse"] });
      logClientSystemEvent({ eventType: "horf.posse.removed", message: "Trader removed from Horf posse", metadata: { address: partner } });
    } catch (cause) {
      setPosseError(cause instanceof Error ? cause.message : "Could not remove this trader.");
    } finally {
      setPosseBusy(false);
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
    <Shell id="horf-horse-send" data-horf-region="horse-send" aria-label="Send HORSE and manage your posse">
      <Header>
        <div>
          <small>Pass the reins · Tezos Mainnet</small>
          <h2>Send $HORSE to your posse</h2>
          <p>Send to as many as 50 trader wallets in one FA2 transaction. Add recipients one by one, pick them from your posse, or upload a comma-separated CSV.</p>
          <p>Send a qualifying art horse and earn 10 HORSE. Receiving a horse earns no HORSE; sending one back as your own outbound trade earns 10. A horse claimed from a Stable rewards the listing owner who sent it. This is a little nudge to return a ride. Vault claims are Tezos wallet transactions, and claimants pay XTZ gas.</p>
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
      {!address && <Note $error>Connect and verify a Tezos wallet before sending or managing a posse. <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : signedIn ? "Connect wallet" : "Connect and verify wallet"}</Action></Note>}
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
              <p>CSV may contain comma-separated addresses or address,amount rows. A header is optional. Explicit CSV amounts switch to individual amounts when they differ from the shared amount. Duplicate wallets are rejected.</p>
            </div>
            <Action data-horf-horse-send type="submit" $primary disabled={!address || !ready || busy || claimStage !== null}>Send $HORSE</Action>
            <p>Your wallet signs one Mainnet transaction. Tezos gas applies. The final token balance is checked on-chain.</p>
          </form>
        </Panel>
        <Panel data-horf-posse>
          <h3>Your posse</h3>
          <p>Round up your regular riders once, then choose them for $HORSE sends or direct horse art trades and gifts.</p>
          <form onSubmit={(event) => void addPosse(event)}>
            <label htmlFor="horf-posse-address">Trader wallet address</label>
            <input id="horf-posse-address" data-horf-posse-address value={posseAddress} onChange={(event) => setPosseAddress(event.target.value)} placeholder="tz1…" disabled={posseBusy} />
            <label htmlFor="horf-posse-name" style={{ marginTop: 9 }}>Nickname (optional)</label>
            <Compact>
              <input id="horf-posse-name" value={posseNickname} onChange={(event) => setPosseNickname(event.target.value)} placeholder="Sir Canter" disabled={posseBusy} />
              <Action data-horf-posse-add type="submit" disabled={!address || posseBusy || !posseAddress.trim()}>Add to posse</Action>
            </Compact>
          </form>
          {posseError && <Note $error role="alert">{posseError}</Note>}
          {posseQuery.isPending && address && <p>Finding your posse…</p>}
          {posseScopeDenied ? <Note $error role="alert">
            {posseRestricted ? "This wallet is restricted from Horf private features. Check Trader standing by the race board." : "Your Horf wallet proof is missing or expired. Reconnect and verify this wallet to open your posse."}
            {!posseRestricted && <> <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Reconnect and verify wallet"}</Action></>}
          </Note> : posseQuery.isError && <p role="alert">Posse list unavailable. Refresh this app to try again.</p>}
          {partners.length ? <PosseList>{partners.map((partner) => (
            <li key={partner.id} data-horf-posse-member>
              <span><a href={`https://objkt.com/profile/${encodeURIComponent(partner.address)}`} target="_blank" rel="noopener noreferrer">{partner.nickname || shortAddress(partner.address)}</a><small>{partner.address}</small></span>
              <Action type="button" onClick={() => void removePosse(partner.id, partner.address)} disabled={posseBusy}>Remove</Action>
            </li>
          ))}</PosseList> : address && !posseQuery.isPending && !posseQuery.isError && <p>No traders saved yet. Add a wallet above.</p>}
          {!address && <p>Verify your wallet to see and manage its saved traders.</p>}
        </Panel>
      </Columns>
      {stage && <Note role="status" aria-live="polite">{sendStatus(stage)} {submittedHash && <a href={`https://tzkt.io/${encodeURIComponent(submittedHash)}`} target="_blank" rel="noopener noreferrer">View transaction</a>}</Note>}
      {error && <Note $error role="alert">{error}</Note>}
      {success && <Note role="status">$HORSE confirmed for {success.count} {success.count === 1 ? "trader" : "traders"}. <a href={`https://tzkt.io/${encodeURIComponent(success.hash)}`} target="_blank" rel="noopener noreferrer">View transaction</a>.</Note>}
      <Note>Community helpers keep the horse scene moving even when they do not trade. Send them $HORSE, or nominate them for a Helping Hand Award in the existing CRP Nominations app. {signedIn
        ? <Action data-horf-crp-open type="button" onClick={() => { windowManager.openPage("/crp-nominate"); logClientSystemEvent({ eventType: "horf.crp_nominations.opened", message: "CRP Nominations opened from Horf" }); }}>Nominate a helping hand</Action>
        : <a data-horf-crp-sign-in href="/login">Sign in to use CRP Nominations</a>}</Note>
    </Shell>
  );
}
