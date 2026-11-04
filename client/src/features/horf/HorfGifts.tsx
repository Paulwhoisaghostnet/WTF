import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, isApiRequestError } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { sendHorfTokenTransfer, type HorfSendProgress } from "../../lib/tezos/horf-send";
import { HORF_RECIPIENT_LIMIT } from "./recipient-input";
import { validateArtSendRecipients, type ArtSendRecipient } from "./art-send-recipients";
import type { HorfGuestSession } from "./guest-wallet";
import { objktTokenUrl, parseObjktToken } from "./token-input";
import { parseHorfOwnedTokenPage } from "./owned-tokens";
import type { HorfGift, HorfGiftsResponse, HorfPosseResponse } from "./social-types";

type TokenChoice = { contract: string; tokenId: string; name: string };
type GiftToConfirm = { recipient: string; tokenContract: string; tokenId: string; amount: string };
type RecipientRow = ArtSendRecipient & { id: number };
type SendReview = {
  sender: string;
  token: TokenChoice;
  kind: "gift" | "trade";
  recipients: Array<{ address: string; amountRaw: string }>;
  total: string;
  ownedBalance: string;
};
type PendingGift = { address: string; opHash: string; gifts: GiftToConfirm[] };
type PendingTrade = { address: string; opHash: string; trades: GiftToConfirm[] };
type ConfirmResponse = { status: "pending"; opHash: string } | { gifts: HorfGift[] };
type GiftStage = "eligibility" | "preflight" | "preparing" | "wallet" | "confirming" | "indexing";

const PENDING_KEY_PREFIX = "horf:pending-gift-confirmation:";
const PENDING_TRADE_KEY_PREFIX = "horf:pending-trade-confirmation:";

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
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 2px; }
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 14px 20px;
  align-items: start;
  small { color: var(--horf-gold, #d8a34a); font: 800 12px/1.2 var(--horf-font, "Avenir Next", sans-serif); letter-spacing: .12em; text-transform: uppercase; }
  > div { max-width: 65ch; }
`;

const Reminder = styled.div`
  margin: 14px 0;
  padding: 16px 64px 16px 18px;
  border: 1px solid #8b5c50;
  border-radius: 13px;
  background: url('/horf-art/lasso.svg') right 14px center / 38px 38px no-repeat, #3b2723;
  font: 600 14px/1.5 var(--horf-font, "Avenir Next", sans-serif);
  strong { font: 700 21px/1.2 var(--horf-display, Georgia, serif); }
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  @container (max-width: 730px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 14px;
  background: var(--horf-surface, #1b2723);
  form > div { margin-bottom: 10px; }
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
  margin: 10px 0;
  padding: 12px 14px;
  border: 1px solid ${(p) => p.$error ? "#8b5c50" : "#477663"};
  border-radius: 12px;
  background: ${(p) => p.$error ? "#3b2723" : "#1d3932"};
  font: 600 13px/1.5 var(--horf-font, "Avenir Next", sans-serif);
  overflow-wrap: anywhere;
`;

const InputAction = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  align-items: end;
  @container (max-width: 470px) { grid-template-columns: 1fr; }
`;

const RecipientRows = styled.ol`
  list-style: none;
  margin: 8px 0 11px;
  padding: 0;
  li { display: grid; grid-template-columns: 24px minmax(0, 1fr) 120px auto; gap: 8px; align-items: end; margin: 0 0 10px; }
  li > b { align-self: center; font-size: 13px; color: var(--horf-gold, #d8a34a); }
  .pickers { display: grid; gap: 6px; margin-top: 6px; }
  @container (max-width: 640px) {
    li { grid-template-columns: 24px minmax(0, 1fr) auto; }
    .amount-cell { grid-column: 2; }
    .remove-cell { grid-column: 3; }
  }
  @container (max-width: 420px) {
    li { grid-template-columns: 20px minmax(0, 1fr); }
    .amount-cell { grid-column: 2; }
    .remove-cell { grid-column: 2; }
  }
`;

const ReviewList = styled.ol`
  margin: 9px 0 12px;
  padding-left: 23px;
  li { padding: 5px 0; overflow-wrap: anywhere; }
  strong { color: var(--horf-gold, #d8a34a); }
`;

const SendKind = styled.fieldset`
  display: flex;
  flex-wrap: wrap;
  gap: 9px 16px;
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 11px;
  background: var(--horf-field, #24332d);
  color: var(--horf-ink, #f4ead6);
  legend { padding: 0 5px; font: 750 13px var(--horf-font, "Avenir Next", sans-serif); }
  label { display: inline-flex; align-items: center; gap: 6px; margin: 0; cursor: pointer; }
  input[type="radio"] { width: auto; min-height: 0; margin: 0; accent-color: var(--horf-coral, #e26a45); }
`;

const GiftList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  li { padding: 12px 0; border-top: 1px solid var(--horf-line, #3d5148); }
  li:first-child { border-top: 0; }
  strong { display: block; font-size: 14px; overflow-wrap: anywhere; }
  small { display: block; margin: 4px 0 8px; color: var(--horf-muted, #b7b5a7); font: 12px/1.4 var(--horf-font, "Avenir Next", sans-serif); overflow-wrap: anywhere; }
`;

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
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
  if (stage === "eligibility") return "Checking this horse and your latest edition balance…";
  if (stage === "preflight") return "Checking your wallet and Tezos Mainnet…";
  if (stage === "preparing") return "Preparing the horse edition transfer…";
  if (stage === "wallet") return `Approve the ${sendKind} in your Tezos wallet…`;
  if (stage === "confirming") return `Waiting for the Tezos ${sendKind} transaction to confirm…`;
  return `Checking Objkt and TzKT for the confirmed ${sendKind}…`;
}

async function readOwnedHorseBalance(address: string, token: TokenChoice, refresh = false): Promise<string> {
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({ address, q: `${token.contract} ${token.tokenId}`, offset: String(offset) });
    if (refresh) params.set("refresh", "1");
    const page = parseHorfOwnedTokenPage(await api.get<unknown>(`/api/horf/wallet/tokens?${params}`));
    const owned = page.items.find((item) => item.walletAddress === address &&
      item.contract === token.contract && item.tokenId === token.tokenId);
    if (owned) return owned.balance;
    if (!page.pagination.hasMore) return "0";
    if (page.pagination.nextOffset <= offset) throw new Error("Owned horse pages did not advance. Refresh and try again.");
    offset = page.pagination.nextOffset;
  }
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
  const [recipients, setRecipients] = useState<RecipientRow[]>([{ id: 1, address: "", amount: "1" }]);
  const nextRecipientId = useRef(2);
  const [review, setReview] = useState<SendReview | null>(null);
  const [pendingGifts, setPendingGifts] = useState<PendingGift[]>(() => readPending(address));
  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>(() => readPendingTrades(address));
  const [stage, setStage] = useState<GiftStage | null>(null);
  const [stageKind, setStageKind] = useState<"gift" | "trade" | null>(null);
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [marking, setMarking] = useState<number | null>(null);

  useEffect(() => setPendingGifts(readPending(address)), [address]);
  useEffect(() => setPendingTrades(readPendingTrades(address)), [address]);
  useEffect(() => setReview(null), [address]);

  const posseQuery = useQuery({
    queryKey: ["horf", "posse", address],
    queryFn: () => api.get<HorfPosseResponse>(`/api/horf/posse?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
  });
  const tradersQuery = useQuery({
    queryKey: ["horf", "art-send-traders", "all-time"],
    queryFn: async () => {
      const response = await api.get<{ leaderboard?: Array<{ address: string; name?: string | null; trades?: number; sent?: number; received?: number; blacklisted?: boolean }> }>("/api/horf/season?season=all-time");
      if (!Array.isArray(response.leaderboard)) throw new Error("Known horse traders are unavailable.");
      return response.leaderboard.filter((trader) =>
        typeof trader.address === "string" && trader.blacklisted !== true &&
        Number.isSafeInteger(trader.trades) && (trader.trades ?? 0) > 0);
    },
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
  const ownedBalanceQuery = useQuery({
    queryKey: ["horf", "art-send-owned-balance", address, token?.contract, token?.tokenId],
    queryFn: () => readOwnedHorseBalance(address!, token!),
    enabled: Boolean(address && token),
    refetchOnWindowFocus: true,
  });
  const partners = Array.isArray(posseQuery.data?.partners) ? posseQuery.data.partners : [];
  const knownTraders = (tradersQuery.data ?? []).filter((trader) => trader.address !== address);
  const receivedGifts = Array.isArray(giftsQuery.data?.gifts) ? giftsQuery.data.gifts : [];
  const giftScopeDenied = isApiRequestError(giftsQuery.error) && giftsQuery.error.status === 403;
  const giftRestricted = giftScopeDenied && /restricted|blacklist/i.test(giftsQuery.error?.message ?? "");
  const busy = stage !== null;

  function changeRecipient(id: number, patch: Partial<ArtSendRecipient>) {
    setRecipients((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setReview(null);
  }

  function addRecipient() {
    if (recipients.length >= HORF_RECIPIENT_LIMIT) return;
    setRecipients((current) => [...current, { id: nextRecipientId.current++, address: "", amount: "1" }]);
    setReview(null);
  }

  function chooseManual(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const parsed = parseObjktToken(manualLink);
      setToken({ ...parsed, name: `Token #${parsed.tokenId}` });
      setOwnedKey("");
      setReview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read this Objkt token link.");
    }
  }

  async function confirmGift(value: PendingGift) {
    setStageKind("gift");
    setStage("indexing");
    const response = await api.post<ConfirmResponse>("/api/horf/gifts/confirm", value);
    if ("status" in response && response.status === "pending") {
      setPendingGifts((current) => current.some((item) => item.opHash === value.opHash) ? current : [...current, value]);
      savePending(value);
      setSuccess("The horse was sent on Tezos. Gift indexing is still catching up; retry confirmation shortly. Do not send it again.");
      return;
    }
    if (!("gifts" in response) || !Array.isArray(response.gifts) || response.gifts.length !== value.gifts.length) {
      throw new Error("Horf did not return every verified gift receipt. Retry confirmation without sending again.");
    }
    clearPending(value);
    setPendingGifts((current) => current.filter((item) => item.opHash !== value.opHash));
    setSuccess(`${value.gifts.length} horse ${value.gifts.length === 1 ? "gift" : "gifts"} confirmed in Horf. Riders can mark when they return the favor.`);
    void giftsQuery.refetch();
    void qc.invalidateQueries({ queryKey: ["horf", "season"] });
    void qc.invalidateQueries({ queryKey: ["horf", "horse-rewards"] });
    logClientSystemEvent({ eventType: "horf.gift.sent", message: "Horf horse gift confirmed", metadata: { opHash: value.opHash, recipient: value.gifts[0]?.recipient, recipientCount: value.gifts.length } });
  }

  async function confirmTrade(value: PendingTrade) {
    setStageKind("trade");
    setStage("indexing");
    const response = await api.post<{ status: "pending"; opHash: string } | { trades: unknown[] }>("/api/horf/trades/confirm", value);
    if ("status" in response && response.status === "pending") {
      setPendingTrades((current) => current.some((item) => item.opHash === value.opHash) ? current : [...current, value]);
      savePendingTrade(value);
      setSuccess("The horse trade was sent on Tezos. TzKT indexing is catching up; retry confirmation shortly. Do not send it again.");
      return;
    }
    if (!("trades" in response) || !Array.isArray(response.trades) || response.trades.length !== value.trades.length) {
      throw new Error("Horf did not return every verified trade receipt. Retry confirmation without sending again.");
    }
    clearPendingTrade(value);
    setPendingTrades((current) => current.filter((item) => item.opHash !== value.opHash));
    setSuccess(`${value.trades.length} direct horse ${value.trades.length === 1 ? "trade" : "trades"} verified in Horf. They count in the season race and social return-ride ledger.`);
    void qc.invalidateQueries({ queryKey: ["horf", "season"] });
    void qc.invalidateQueries({ queryKey: ["horf", "open-range"] });
    void qc.invalidateQueries({ queryKey: ["horf", "horse-rewards"] });
    logClientSystemEvent({ eventType: "horf.trade.sent", message: "Horf direct horse trade verified", metadata: { opHash: value.opHash, recipient: value.trades[0]?.recipient, recipientCount: value.trades.length } });
  }

  function reviewHorse(event: FormEvent) {
    event.preventDefault();
    if (!address || !token || busy) return;
    setError(null);
    setSuccess(null);
    try {
      if (ownedBalanceQuery.data == null) throw new Error("This wallet’s horse edition balance is still loading. Try again shortly.");
      const allocation = validateArtSendRecipients(recipients, address, ownedBalanceQuery.data);
      setReview({ sender: address, token: { ...token }, kind: sendKind, ...allocation, ownedBalance: ownedBalanceQuery.data });
    } catch (cause) {
      setReview(null);
      setError(cause instanceof Error ? cause.message : "The horse send could not be reviewed.");
    }
  }

  async function sendHorse() {
    if (!address || !review || busy || review.sender !== address) return;
    const { token, kind, recipients: destinations } = review;
    const gifts: GiftToConfirm[] = destinations.map(({ address: recipient, amountRaw: amount }) => ({
      recipient, tokenContract: token.contract, tokenId: token.tokenId, amount,
    }));
    setError(null);
    setSuccess(null);
    setSubmittedHash(null);
    let submitted = false;
    let submittedOpHash: string | null = null;
    try {
      setStageKind(kind);
      setStage("eligibility");
      const freshBalance = await readOwnedHorseBalance(address, token, true);
      validateArtSendRecipients(destinations.map(({ address: to, amountRaw }) => ({ address: to, amount: amountRaw })), address, freshBalance);
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
      const progress: HorfSendProgress = {
        onStage: setStage,
        onSubmitted: (opHash) => {
          submittedOpHash = opHash;
          setSubmittedHash(opHash);
          if (kind === "gift") {
            const value = { address, opHash, gifts };
            submitted = true;
            setPendingGifts((current) => [...current.filter((item) => item.opHash !== opHash), value]);
            savePending(value);
          } else {
            const value = { address, opHash, trades: gifts };
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
        recipients: destinations,
      }, progress);
      if (kind === "gift") {
        await confirmGift({ address, opHash, gifts });
      } else {
        await confirmTrade({ address, opHash, trades: gifts });
      }
      setToken(null);
      setOwnedKey("");
      setManualLink("");
      setRecipients([{ id: nextRecipientId.current++, address: "", amount: "1" }]);
      setReview(null);
      void ownedQuery.refetch();
      void ownedBalanceQuery.refetch();
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
          <p>Send a horse as a trade or gift. See what came your way below.</p>
        </div>
        <Action type="button" onClick={() => void giftsQuery.refetch()} disabled={!address || giftsQuery.isFetching}>Refresh gifts</Action>
      </Header>
      <Reminder><strong>Don’t look them in the mouth.</strong><br />A gift is a gift. If you send a horse back later, mark that you returned the favor here; Horf does not count gifts as social return-ride debt.</Reminder>
      {!address && <Note $error>Connect and verify your Tezos wallet to send and review gifts. <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : isGuest ? "Connect and verify wallet" : "Connect wallet"}</Action></Note>}
      <Columns>
        <Panel data-horf-gift-send>
          <h3>Trade or give a horse</h3>
          <p>Send one horse to several riders in one Mainnet transaction. Pick familiar faces from your posse or the trader directory.</p>
          <label htmlFor="horf-gift-owned">Choose an indexed token from this wallet</label>
          <InputAction>
            <select id="horf-gift-owned" data-horf-gift-owned value={selectedOwned ? ownedKey : ""} onChange={(event) => { setOwnedKey(event.target.value); const chosen = ownedTokens.find((item) => `${item.contract}:${item.tokenId}` === event.target.value); setToken(chosen ? { contract: chosen.contract, tokenId: chosen.tokenId, name: chosen.name || `Token #${chosen.tokenId}` } : null); setReview(null); }} disabled={!address || busy}>
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
          {token && <Note>Selected: <a href={objktTokenUrl(token.contract, token.tokenId)} target="_blank" rel="noopener noreferrer">{token.name}</a> · {shortAddress(token.contract)} / #{token.tokenId} · {ownedBalanceQuery.isPending ? "checking editions…" : ownedBalanceQuery.data != null ? `${ownedBalanceQuery.data} editions owned` : "balance unavailable"}</Note>}
          {token && ownedBalanceQuery.isError && <Note $error role="alert">This wallet’s edition balance is unavailable. Refresh and try again before sending.</Note>}
          <form onSubmit={reviewHorse}>
            <SendKind data-horf-art-send-kind>
              <legend>Send this horse as</legend>
              <label><input type="radio" name="horf-art-send-kind" value="trade" checked={sendKind === "trade"} onChange={() => { setSendKind("trade"); setReview(null); }} disabled={busy} />Trade</label>
              <label><input type="radio" name="horf-art-send-kind" value="gift" checked={sendKind === "gift"} onChange={() => { setSendKind("gift"); setReview(null); }} disabled={busy} />Gift</label>
            </SendKind>
            <RecipientRows data-horf-gift-recipient-rows>
              {recipients.map((row, index) => <li key={row.id} data-horf-gift-recipient-row>
                <b>{index + 1}.</b>
                <div>
                  <label htmlFor={`horf-gift-recipient-${row.id}`}>Rider wallet</label>
                  <input id={`horf-gift-recipient-${row.id}`} data-horf-gift-recipient value={row.address} onChange={(event) => changeRecipient(row.id, { address: event.target.value })} placeholder="tz1…" disabled={!address || busy} />
                  <div className="pickers">
                    {partners.length > 0 && <select data-horf-gift-posse-picker aria-label={index === 0 ? `Choose ${sendKind} recipient from posse` : `Choose ${sendKind} recipient ${index + 1} from posse`} value="" onChange={(event) => { changeRecipient(row.id, { address: event.target.value }); logClientSystemEvent({ eventType: "horf.posse.selected", message: `Horf posse trader selected for a horse ${sendKind}`, metadata: { address: event.target.value } }); }} disabled={!address || busy}>
                      <option value="">Choose from posse…</option>
                      {partners.filter((partner) => partner.address !== address).map((partner) => <option key={partner.id} value={partner.address}>{partner.nickname || shortAddress(partner.address)} · {shortAddress(partner.address)}</option>)}
                    </select>}
                    {knownTraders.length > 0 && <select data-horf-gift-trader-picker aria-label={`Choose known trader for recipient ${index + 1}`} value="" onChange={(event) => changeRecipient(row.id, { address: event.target.value })} disabled={!address || busy}>
                      <option value="">Choose a known trader…</option>
                      {knownTraders.map((trader) => <option key={trader.address} value={trader.address}>{trader.name || shortAddress(trader.address)} · sent {trader.sent ?? 0} · received {trader.received ?? 0} · {trader.trades} trades · {shortAddress(trader.address)}</option>)}
                    </select>}
                  </div>
                </div>
                <div className="amount-cell">
                  <label htmlFor={`horf-gift-amount-${row.id}`}>Editions</label>
                  <input id={`horf-gift-amount-${row.id}`} data-horf-gift-amount inputMode="numeric" value={row.amount} onChange={(event) => changeRecipient(row.id, { amount: event.target.value })} disabled={!address || busy} />
                </div>
                <Action className="remove-cell" type="button" onClick={() => { setRecipients((current) => current.filter((item) => item.id !== row.id)); setReview(null); }} disabled={busy || recipients.length === 1} aria-label={`Remove rider ${index + 1}`}>Remove</Action>
              </li>)}
            </RecipientRows>
            <Action data-horf-gift-add-recipient type="button" onClick={addRecipient} disabled={!address || busy || recipients.length >= HORF_RECIPIENT_LIMIT}>Add another rider</Action>
            <p>{recipients.length} of {HORF_RECIPIENT_LIMIT} rider slots. Each edition goes to one wallet. Need $HORSE instead? Use Send $HORSE.</p>
            {tradersQuery.isError && <p role="status">Known traders are unavailable right now; you can still use your posse or enter a wallet.</p>}
            <Action data-horf-gift-submit type="submit" $primary disabled={!address || !token || busy || ownedBalanceQuery.data == null}>Review horse send</Action>
            <p>{sendKind === "gift"
              ? "One Mainnet wallet transaction sends every gift. Tezos gas applies. Horf verifies each recipient. Gifts count as trades without a return ride."
              : "One Mainnet wallet transaction sends every trade. Tezos gas applies. Direct trades count when the season ledger scans each transfer and create a social return ride for each recipient."}</p>
          </form>
          {review && <Note data-horf-gift-review role="region" aria-label="Review horse send">
            <strong>Check the reins before signing</strong><br />
            {review.kind === "trade" ? "Trade" : "Gift"} {review.token.name} from {shortAddress(review.sender)}:
            <ReviewList>{review.recipients.map((row) => <li key={row.address}><strong>{row.amountRaw} {row.amountRaw === "1" ? "edition" : "editions"}</strong> → {row.address}</li>)}</ReviewList>
            <p>{review.total} of {review.ownedBalance} owned editions · {review.recipients.length} {review.recipients.length === 1 ? "rider" : "riders"}. Your wallet will approve one Mainnet transfer and pay gas.</p>
            <Action data-horf-gift-confirm type="button" $primary onClick={() => void sendHorse()} disabled={busy || Boolean(submittedHash)}>Confirm {review.kind} in wallet</Action>{" "}
            <Action type="button" onClick={() => setReview(null)} disabled={busy}>Edit riders</Action>
          </Note>}
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
      {stage && <Note role="status" aria-live="polite">{giftStageLabel(stage, stageKind ?? sendKind)} {submittedHash && <a href={`https://tzkt.io/${encodeURIComponent(submittedHash)}`} target="_blank" rel="noopener noreferrer">View submitted transfer</a>}</Note>}
      {error && <Note $error role="alert">{error}</Note>}
      {success && <Note role="status">{success}</Note>}
    </Shell>
  );
}
