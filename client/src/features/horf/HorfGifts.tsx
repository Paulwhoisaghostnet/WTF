import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, isApiRequestError } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { sendHorfTokenTransfer, type HorfSendProgress } from "../../lib/tezos/horf-send";
import { toNatString } from "../../lib/tezos/nat";
import { assertTraderAddress } from "./recipient-input";
import type { HorfGuestSession } from "./guest-wallet";
import { objktTokenUrl, parseObjktToken } from "./token-input";
import { parseHorfOwnedTokenPage } from "./owned-tokens";
import type { HorfGift, HorfGiftsResponse, HorfPosseResponse } from "./social-types";

type TokenChoice = { contract: string; tokenId: string; name: string };
type GiftToConfirm = { recipient: string; tokenContract: string; tokenId: string; amount: string };
type PendingGift = { address: string; opHash: string; gifts: GiftToConfirm[] };
type PendingTrade = { address: string; opHash: string; trades: GiftToConfirm[] };
type ConfirmResponse = { status: "pending"; opHash: string } | { gifts: HorfGift[] };
type GiftStage = "eligibility" | "preflight" | "preparing" | "wallet" | "confirming" | "indexing";

const PENDING_KEY_PREFIX = "horf:pending-gift-confirmation:";
const PENDING_TRADE_KEY_PREFIX = "horf:pending-trade-confirmation:";

const Shell = styled.section`
  margin-top: 24px;
  padding: 17px;
  border: 3px solid #4a2526;
  background: #e8d0c0;
  box-shadow: inset 0 0 0 2px #fff0dd, 4px 4px 0 #b56f58;
  min-width: 0;
  h2 { margin: 3px 0 5px; font-size: clamp(25px, 4cqw, 38px); line-height: 1; }
  h3 { margin: 0 0 7px; font-size: 19px; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.45; }
  label { display: block; margin-bottom: 5px; font: 700 12px/1.25 "Courier New", monospace; }
  input, select { width: 100%; min-width: 0; min-height: 36px; padding: 6px 8px; border: 1px solid #855a49; border-radius: 0; background: #fffdf5; color: #321d1a; font: 13px Georgia, serif; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid #0b6874; outline-offset: 2px; }
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 14px;
  align-items: start;
  small { color: #903d31; font: 700 11px/1.2 "Courier New", monospace; text-transform: uppercase; }
  > div { max-width: 600px; }
`;

const Reminder = styled.div`
  margin: 14px 0;
  padding: 12px 62px 12px 14px;
  border: 3px double #6b3430;
  background: url('/horf-art/lasso.svg') right 12px center / 42px 42px no-repeat, #fff0d2;
  font: 700 14px/1.4 Georgia, serif;
  strong { font-size: 20px; }
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  @container (max-width: 730px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 14px;
  border-top: 4px solid #a74736;
  background: #fff9ed;
  box-shadow: inset 0 0 0 1px #cba98d;
  form > div { margin-bottom: 10px; }
`;

const Action = styled.button<{ $primary?: boolean }>`
  min-height: 36px;
  padding: 6px 10px;
  border: 2px solid #64382b;
  background: ${(p) => p.$primary ? "#f6c767" : "#fff1d9"};
  color: #39241b;
  box-shadow: 2px 2px 0 #ad7354;
  cursor: pointer;
  font: 700 12px/1.2 "Courier New", monospace;
  &:disabled { cursor: not-allowed; opacity: 0.55; box-shadow: none; }
`;

const Note = styled.div<{ $error?: boolean }>`
  margin: 10px 0;
  padding: 9px 11px;
  border-left: 5px solid ${(p) => p.$error ? "#a43c2e" : "#42724e"};
  background: ${(p) => p.$error ? "#fff0d6" : "#eaf3db"};
  font: 700 12px/1.45 "Courier New", monospace;
  overflow-wrap: anywhere;
`;

const InputAction = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  align-items: end;
  @container (max-width: 470px) { grid-template-columns: 1fr; }
`;

const SendKind = styled.fieldset`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 15px;
  margin: 0 0 14px;
  padding: 9px 11px;
  border: 1px solid #bd9475;
  background: #f8ecd9;
  legend { padding: 0 5px; font: 700 12px "Courier New", monospace; }
  label { display: inline-flex; align-items: center; gap: 6px; margin: 0; cursor: pointer; }
  input[type="radio"] { width: auto; min-height: 0; margin: 0; accent-color: #8c442e; }
`;

const GiftList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  li { padding: 11px 0; border-top: 1px solid #dec4aa; }
  li:first-child { border-top: 0; }
  strong { display: block; font-size: 14px; overflow-wrap: anywhere; }
  small { display: block; margin: 3px 0 7px; color: #7b5b50; font: 11px/1.35 "Courier New", monospace; overflow-wrap: anywhere; }
`;

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function positiveEdition(value: string): string {
  const amount = toNatString(value);
  if (amount === "0") throw new Error("Send at least one horse edition.");
  return amount;
}

function isPositive(value: string): boolean {
  try { return BigInt(value) > 0n; } catch { return false; }
}

function pendingKey(address: string): string {
  return `${PENDING_KEY_PREFIX}${address}`;
}

function savePending(value: PendingGift): void {
  try {
    const existing = readPending(value.address);
    window.localStorage.setItem(pendingKey(value.address), JSON.stringify([...existing.filter((item) => item.opHash !== value.opHash), value]));
  } catch { /* Private browsing may disable local storage. */ }
}

function clearPending(value: PendingGift): void {
  try {
    const remaining = readPending(value.address).filter((item) => item.opHash !== value.opHash);
    if (remaining.length) window.localStorage.setItem(pendingKey(value.address), JSON.stringify(remaining));
    else window.localStorage.removeItem(pendingKey(value.address));
  } catch { /* Keep the in-memory state usable. */ }
}

function readPending(address: string | null): PendingGift[] {
  if (!address || typeof window === "undefined") return [];
  try {
    const data = JSON.parse(window.localStorage.getItem(pendingKey(address)) || "[]") as PendingGift[];
    return Array.isArray(data) ? data.filter((item) => item?.address === address && typeof item.opHash === "string" && Array.isArray(item.gifts)) : [];
  } catch { return []; }
}

function tradePendingKey(address: string): string {
  return `${PENDING_TRADE_KEY_PREFIX}${address}`;
}

function readPendingTrades(address: string | null): PendingTrade[] {
  if (!address || typeof window === "undefined") return [];
  try {
    const data = JSON.parse(window.localStorage.getItem(tradePendingKey(address)) || "[]") as PendingTrade[];
    return Array.isArray(data) ? data.filter((item) => item?.address === address && typeof item.opHash === "string" && Array.isArray(item.trades)) : [];
  } catch { return []; }
}

function savePendingTrade(value: PendingTrade): void {
  try {
    const existing = readPendingTrades(value.address);
    window.localStorage.setItem(tradePendingKey(value.address), JSON.stringify([...existing.filter((item) => item.opHash !== value.opHash), value]));
  } catch { /* Private browsing may disable local storage. */ }
}

function clearPendingTrade(value: PendingTrade): void {
  try {
    const remaining = readPendingTrades(value.address).filter((item) => item.opHash !== value.opHash);
    if (remaining.length) window.localStorage.setItem(tradePendingKey(value.address), JSON.stringify(remaining));
    else window.localStorage.removeItem(tradePendingKey(value.address));
  } catch { /* Keep the in-memory state usable. */ }
}

function giftStageLabel(stage: GiftStage, sendKind: "trade" | "gift"): string {
  if (stage === "eligibility") return "Checking this token’s horse eligibility…";
  if (stage === "preflight") return "Checking your wallet and Tezos Mainnet…";
  if (stage === "preparing") return "Preparing the horse edition transfer…";
  if (stage === "wallet") return `Approve the ${sendKind} in your Tezos wallet…`;
  if (stage === "confirming") return `Waiting for the Tezos ${sendKind} transaction to confirm…`;
  return `Checking Objkt and TzKT for the confirmed ${sendKind}…`;
}

export function HorfGifts({
  address,
  isGuest,
  connectWallet,
  isConnecting,
}: {
  address: string | null;
  isGuest: boolean;
  connectWallet: () => Promise<void>;
  isConnecting: boolean;
}) {
  const qc = useQueryClient();
  const [ownedKey, setOwnedKey] = useState("");
  const [manualLink, setManualLink] = useState("");
  const [token, setToken] = useState<TokenChoice | null>(null);
  const [sendKind, setSendKind] = useState<"gift" | "trade">("gift");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1");
  const [pendingGifts, setPendingGifts] = useState<PendingGift[]>(() => readPending(address));
  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>(() => readPendingTrades(address));
  const [stage, setStage] = useState<GiftStage | null>(null);
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [marking, setMarking] = useState<number | null>(null);

  useEffect(() => setPendingGifts(readPending(address)), [address]);
  useEffect(() => setPendingTrades(readPendingTrades(address)), [address]);

  const posseQuery = useQuery({
    queryKey: ["horf", "posse", address],
    queryFn: () => api.get<HorfPosseResponse>(`/api/horf/posse?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
  });
  const giftsQuery = useQuery({
    queryKey: ["horf", "gifts", address],
    queryFn: () => api.get<HorfGiftsResponse>(`/api/horf/gifts?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
    refetchOnWindowFocus: true,
  });
  const ownedQuery = useInfiniteQuery({
    queryKey: ["horf", "owned-tokens", address, ""],
    queryFn: ({ pageParam }) => api.get<unknown>(`/api/horf/wallet/tokens?address=${encodeURIComponent(address!)}&offset=${pageParam}`).then(parseHorfOwnedTokenPage),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.pagination.hasMore ? lastPage.pagination.nextOffset : undefined,
    enabled: Boolean(address),
  });
  const ownedTokens = useMemo(
    () => (ownedQuery.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => item.walletAddress === address && isPositive(item.balance)),
    [address, ownedQuery.data],
  );
  const selectedOwned = ownedTokens.find((item) => `${item.contract}:${item.tokenId}` === ownedKey);
  const partners = Array.isArray(posseQuery.data?.partners) ? posseQuery.data.partners : [];
  const receivedGifts = Array.isArray(giftsQuery.data?.gifts) ? giftsQuery.data.gifts : [];
  const giftScopeDenied = isApiRequestError(giftsQuery.error) && giftsQuery.error.status === 403;
  const giftRestricted = giftScopeDenied && /restricted|blacklist/i.test(giftsQuery.error?.message ?? "");
  const busy = stage !== null;

  function chooseManual(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const parsed = parseObjktToken(manualLink);
      setToken({ ...parsed, name: `Token #${parsed.tokenId}` });
      setOwnedKey("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read this Objkt token link.");
    }
  }

  async function confirmGift(value: PendingGift) {
    setStage("indexing");
    const response = await api.post<ConfirmResponse>("/api/horf/gifts/confirm", value);
    if ("status" in response && response.status === "pending") {
      setPendingGifts((current) => current.some((item) => item.opHash === value.opHash) ? current : [...current, value]);
      savePending(value);
      setSuccess("The horse was sent on Tezos. Gift indexing is still catching up; retry confirmation shortly. Do not send it again.");
      return;
    }
    if (!("gifts" in response) || !Array.isArray(response.gifts) || !response.gifts.length) {
      throw new Error("Horf did not return a verified gift receipt. Retry confirmation without sending again.");
    }
    clearPending(value);
    setPendingGifts((current) => current.filter((item) => item.opHash !== value.opHash));
    setSuccess("Gift confirmed in Horf. The recipient can now mark when they return the favor.");
    void giftsQuery.refetch();
    void qc.invalidateQueries({ queryKey: ["horf", "season"] });
    void qc.invalidateQueries({ queryKey: ["horf", "horse-rewards"] });
    logClientSystemEvent({ eventType: "horf.gift.sent", message: "Horf horse gift confirmed", metadata: { opHash: value.opHash, recipient: value.gifts[0]?.recipient } });
  }

  async function confirmTrade(value: PendingTrade) {
    setStage("indexing");
    const response = await api.post<{ status: "pending"; opHash: string } | { trades: unknown[] }>("/api/horf/trades/confirm", value);
    if ("status" in response && response.status === "pending") {
      setPendingTrades((current) => current.some((item) => item.opHash === value.opHash) ? current : [...current, value]);
      savePendingTrade(value);
      setSuccess("The horse trade was sent on Tezos. TzKT indexing is catching up; retry confirmation shortly. Do not send it again.");
      return;
    }
    if (!("trades" in response) || !Array.isArray(response.trades) || !response.trades.length) {
      throw new Error("Horf did not return a verified trade receipt. Retry confirmation without sending again.");
    }
    clearPendingTrade(value);
    setPendingTrades((current) => current.filter((item) => item.opHash !== value.opHash));
    setSuccess("Direct horse trade verified in Horf. It counts in the season race and the social return-ride ledger.");
    void qc.invalidateQueries({ queryKey: ["horf", "season"] });
    void qc.invalidateQueries({ queryKey: ["horf", "open-range"] });
    void qc.invalidateQueries({ queryKey: ["horf", "horse-rewards"] });
    logClientSystemEvent({ eventType: "horf.trade.sent", message: "Horf direct horse trade verified", metadata: { opHash: value.opHash, recipient: value.trades[0]?.recipient } });
  }

  async function sendHorse(event: FormEvent) {
    event.preventDefault();
    if (!address || !token || busy) return;
    const kind = sendKind;
    setError(null);
    setSuccess(null);
    setSubmittedHash(null);
    let submitted = false;
    let submittedOpHash: string | null = null;
    try {
      const to = assertTraderAddress(recipient);
      if (to === address) throw new Error("Choose another trader’s wallet for this horse.");
      const editions = positiveEdition(amount);
      setStage("eligibility");
      if (isGuest) {
        const session = await api.get<HorfGuestSession>("/api/horf/wallet/session");
        if (!session.verified || session.walletAddress !== address) {
          throw new Error(`Your Horf wallet proof has expired. Connect and verify again before sending this ${kind}.`);
        }
      } else {
        const linked = await api.get<Array<{ walletAddress: string }>>("/api/wallets");
        if (!linked.some((wallet) => wallet.walletAddress === address)) {
          throw new Error(`Connect and verify this wallet with your WTF OS account before sending this ${kind}.`);
        }
      }
      const params = new URLSearchParams({ contract: token.contract, tokenId: token.tokenId });
      const eligibility = await api.get<{ eligible: true; token: { contract: string; tokenId: string; name: string; image: string | null } }>(`/api/horf/token-eligibility?${params}`);
      if (!eligibility.eligible || eligibility.token.contract !== token.contract || eligibility.token.tokenId !== token.tokenId) {
        throw new Error("Horf could not verify this horse token. Refresh and try again.");
      }
      const gift: GiftToConfirm = { recipient: to, tokenContract: token.contract, tokenId: token.tokenId, amount: editions };
      const progress: HorfSendProgress = {
        onStage: setStage,
        onSubmitted: (opHash) => {
          submittedOpHash = opHash;
          setSubmittedHash(opHash);
          if (kind === "gift") {
            const value = { address, opHash, gifts: [gift] };
            submitted = true;
            setPendingGifts((current) => [...current.filter((item) => item.opHash !== opHash), value]);
            savePending(value);
          } else {
            const value = { address, opHash, trades: [gift] };
            submitted = true;
            setPendingTrades((current) => [...current.filter((item) => item.opHash !== opHash), value]);
            savePendingTrade(value);
          }
        },
      };
      const opHash = await sendHorfTokenTransfer({
        sender: address,
        chainId: "NetXdQprcVkpaWU",
        tokenContract: token.contract,
        tokenId: token.tokenId,
        recipients: [{ address: to, amountRaw: editions }],
      }, progress);
      if (kind === "gift") {
        await confirmGift({ address, opHash, gifts: [gift] });
      } else {
        await confirmTrade({ address, opHash, trades: [gift] });
      }
      setToken(null);
      setManualLink("");
      setAmount("1");
    } catch (cause) {
      const submittedNote = submitted
        ? ` The transfer was submitted; retry ${kind} confirmation after checking its explorer status. Do not resend it.`
        : submittedOpHash ? " The transfer was submitted; inspect it on TzKT before retrying." : "";
      setError(`${cause instanceof Error ? cause.message : "The horse send could not be completed."}${submittedNote}`);
    } finally {
      setStage(null);
    }
  }

  async function retryConfirmation(value: PendingGift) {
    if (busy) return;
    setError(null);
    try { await confirmGift(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Gift confirmation is unavailable. Try again later."); }
    finally { setStage(null); }
  }

  async function retryTradeConfirmation(value: PendingTrade) {
    if (busy) return;
    setError(null);
    try { await confirmTrade(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Trade confirmation is unavailable. Try again later."); }
    finally { setStage(null); }
  }

  async function markFavor(gift: HorfGift) {
    if (marking !== null) return;
    setError(null);
    try {
      setMarking(gift.id);
      await api.post(`/api/horf/gifts/${gift.id}/returned`, { returnedFavor: !gift.returnedFavor });
      await giftsQuery.refetch();
      logClientSystemEvent({ eventType: gift.returnedFavor ? "horf.gift.return_unmarked" : "horf.gift.return_marked", message: gift.returnedFavor ? "Horf gift favor mark cleared" : "Horf gift favor marked returned", metadata: { giftId: gift.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this gift.");
    } finally {
      setMarking(null);
    }
  }

  return (
    <Shell id="horf-gifts" data-horf-region="gifts" aria-label="Gift horses">
      <Header>
        <div>
          <small>Horse trader’s gift book</small>
          <h2>Gift horses</h2>
          <p>Ride an eligible art horse straight to another wallet as a trade or gift, then check the gift book for horses that wandered your way.</p>
        </div>
        <Action type="button" onClick={() => void giftsQuery.refetch()} disabled={!address || giftsQuery.isFetching}>Refresh gifts</Action>
      </Header>
      <Reminder><strong>Don’t look them in the mouth.</strong><br />A gift is a gift. If you send a horse back later, mark that you returned the favor here; Horf does not count gifts as social return-ride debt.</Reminder>
      {!address && <Note $error>Connect and verify your Tezos wallet to send and review gifts. <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : isGuest ? "Connect and verify wallet" : "Connect wallet"}</Action></Note>}
      <Columns>
        <Panel data-horf-gift-send>
          <h3>Trade or give a horse</h3>
          <p>Only Objkt-verified horse-art tokens can be sent here. $HORSE currency belongs in the separate send panel.</p>
          <label htmlFor="horf-gift-owned">Choose an indexed token from this wallet</label>
          <InputAction>
            <select id="horf-gift-owned" data-horf-gift-owned value={selectedOwned ? ownedKey : ""} onChange={(event) => { setOwnedKey(event.target.value); const chosen = ownedTokens.find((item) => `${item.contract}:${item.tokenId}` === event.target.value); setToken(chosen ? { contract: chosen.contract, tokenId: chosen.tokenId, name: chosen.name || `Token #${chosen.tokenId}` } : null); }} disabled={!address || busy}>
              <option value="">{ownedQuery.isPending && address ? "Loading owned tokens…" : "Choose a token"}</option>
              {ownedTokens.map((item) => <option key={`${item.contract}:${item.tokenId}`} value={`${item.contract}:${item.tokenId}`}>{item.name || `Token #${item.tokenId}`} · {item.balance} owned</option>)}
            </select>
            {ownedQuery.hasNextPage && <Action type="button" onClick={() => void ownedQuery.fetchNextPage()} disabled={ownedQuery.isFetchingNextPage}>{ownedQuery.isFetchingNextPage ? "Loading…" : "More tokens"}</Action>}
          </InputAction>
          {ownedQuery.isError && <p role="alert">Indexed owned tokens are unavailable. You can still paste an Objkt link.</p>}
          <form onSubmit={chooseManual}>
            <label htmlFor="horf-gift-link">Or paste an Objkt token link</label>
            <InputAction>
              <input id="horf-gift-link" data-horf-gift-link value={manualLink} onChange={(event) => setManualLink(event.target.value)} placeholder="https://objkt.com/tokens/KT1…/123" disabled={!address || busy} />
              <Action type="submit" disabled={!address || !manualLink.trim() || busy}>Use token</Action>
            </InputAction>
          </form>
          {token && <Note>Selected: <a href={objktTokenUrl(token.contract, token.tokenId)} target="_blank" rel="noopener noreferrer">{token.name}</a> · {shortAddress(token.contract)} / #{token.tokenId}</Note>}
          <form onSubmit={(event) => void sendHorse(event)}>
            <SendKind data-horf-art-send-kind>
              <legend>Send this horse as</legend>
              <label><input type="radio" name="horf-art-send-kind" value="trade" checked={sendKind === "trade"} onChange={() => setSendKind("trade")} disabled={busy} />Trade</label>
              <label><input type="radio" name="horf-art-send-kind" value="gift" checked={sendKind === "gift"} onChange={() => setSendKind("gift")} disabled={busy} />Gift</label>
            </SendKind>
            <div>
              <label htmlFor="horf-gift-recipient">Recipient trader wallet</label>
              <input id="horf-gift-recipient" data-horf-gift-recipient value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="tz1…" disabled={!address || busy} />
              {partners.length > 0 && <select aria-label={`Choose ${sendKind} recipient from posse`} value="" onChange={(event) => { setRecipient(event.target.value); logClientSystemEvent({ eventType: "horf.posse.selected", message: `Horf posse trader selected for a horse ${sendKind}`, metadata: { address: event.target.value } }); }} disabled={!address || busy}>
                <option value="">Choose from posse…</option>
                {partners.map((partner) => <option key={partner.id} value={partner.address}>{partner.nickname || shortAddress(partner.address)}</option>)}
              </select>}
            </div>
            <div>
              <label htmlFor="horf-gift-amount">Horse editions to {sendKind}</label>
              <input id="horf-gift-amount" data-horf-gift-amount inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!address || busy} />
            </div>
            <Action data-horf-gift-submit type="submit" $primary disabled={!address || !token || busy}>{sendKind === "gift" ? "Gift this horse" : "Trade this horse"}</Action>
            <p>{sendKind === "gift"
              ? "Your wallet signs a Mainnet FA2 transfer and pays Tezos gas. Horf verifies the confirmed transfer before recording it as a gift. Gifts count as trades without a return ride."
              : "Your wallet signs a Mainnet FA2 transfer and pays Tezos gas. Direct trades count when the season ledger scans the transfer and create a social return ride for the recipient."}</p>
          </form>
        </Panel>
        <Panel data-horf-gift-received>
          <h3>Horses gifted to you</h3>
          <p>These are verified gifts received by {address ? shortAddress(address) : "your connected wallet"}. Marking a returned favor is your own note, not a blockchain debt.</p>
          {giftsQuery.isPending && address && <p>Reading your gift book…</p>}
          {giftScopeDenied ? <Note $error role="alert">
            {giftRestricted ? "This wallet is restricted from Horf private features. Check Trader standing by the race board." : "Your Horf wallet proof is missing or expired. Reconnect and verify this wallet to read its gift book."}
            {!giftRestricted && <> <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Reconnect and verify wallet"}</Action></>}
          </Note> : giftsQuery.isError && <p role="alert">Gift book unavailable. Refresh to try again.</p>}
          {receivedGifts.length ? <GiftList>{receivedGifts.map((gift) => (
            <li key={gift.id} data-horf-gift-row>
              <strong><a href={objktTokenUrl(gift.token.contract, gift.token.tokenId)} target="_blank" rel="noopener noreferrer">{gift.token.name || `Token #${gift.token.tokenId}`}</a> · {gift.amount} {gift.amount === 1 ? "edition" : "editions"}</strong>
              <small>Gifted by <a href={`https://objkt.com/profile/${encodeURIComponent(gift.from)}`} target="_blank" rel="noopener noreferrer">{shortAddress(gift.from)}</a> · {new Date(gift.timestamp).toLocaleDateString()} · <a href={`https://tzkt.io/${encodeURIComponent(gift.opHash)}`} target="_blank" rel="noopener noreferrer">Tezos receipt</a></small>
              <Action data-horf-gift-returned type="button" onClick={() => void markFavor(gift)} disabled={marking !== null}>{marking === gift.id ? "Saving…" : gift.returnedFavor ? "Returned the favor ✓ · undo" : "Mark returned the favor"}</Action>
            </li>
          ))}</GiftList> : address && !giftsQuery.isPending && !giftsQuery.isError && <p>No verified horse gifts have arrived for this wallet yet.</p>}
        </Panel>
      </Columns>
      {pendingGifts.map((pendingGift) => <Note key={pendingGift.opHash} role="status">A horse transfer was submitted at <a href={`https://tzkt.io/${encodeURIComponent(pendingGift.opHash)}`} target="_blank" rel="noopener noreferrer">{shortAddress(pendingGift.opHash)}</a>. Gift classification is pending. <Action data-horf-gift-retry type="button" onClick={() => void retryConfirmation(pendingGift)} disabled={busy}>Retry confirmation</Action> <Action type="button" onClick={() => { clearPending(pendingGift); setPendingGifts((current) => current.filter((item) => item.opHash !== pendingGift.opHash)); }} disabled={busy}>Clear if transfer failed</Action></Note>)}
      {pendingTrades.map((pendingTrade) => <Note key={pendingTrade.opHash} role="status">A direct horse trade was submitted at <a href={`https://tzkt.io/${encodeURIComponent(pendingTrade.opHash)}`} target="_blank" rel="noopener noreferrer">{shortAddress(pendingTrade.opHash)}</a>. Horf trade verification is pending. <Action data-horf-trade-retry type="button" onClick={() => void retryTradeConfirmation(pendingTrade)} disabled={busy}>Retry trade confirmation</Action> <Action type="button" onClick={() => { clearPendingTrade(pendingTrade); setPendingTrades((current) => current.filter((item) => item.opHash !== pendingTrade.opHash)); }} disabled={busy}>Clear if transfer failed</Action></Note>)}
      {stage && <Note role="status" aria-live="polite">{giftStageLabel(stage, sendKind)} {submittedHash && <a href={`https://tzkt.io/${encodeURIComponent(submittedHash)}`} target="_blank" rel="noopener noreferrer">View submitted transfer</a>}</Note>}
      {error && <Note $error role="alert">{error}</Note>}
      {success && <Note role="status">{success}</Note>}
    </Shell>
  );
}
