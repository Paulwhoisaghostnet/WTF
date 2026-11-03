import { useMemo, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, isApiRequestError } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { toNatString } from "../../lib/tezos/nat";
import { objktTokenUrl as tokenUrl, parseObjktToken } from "./token-input";
import { parseHorfOwnedTokenPage } from "./owned-tokens";
import {
  HORF_STABLES_CHAIN_ID,
  cancelHorfListing,
  claimHorfHorse,
  depositHorfHorses,
  type HorfAuthorizedDeposit,
  type HorfDepositPermit,
  type HorfSelectedDeposit,
  type HorfStableMode,
} from "../../lib/tezos/horf-stables";

type StableListing = {
  id: string;
  mode: HorfStableMode;
  owner: string;
  tokenContract: string;
  tokenId: string;
  submitted: string;
  remaining: string;
  claimedByWallet: boolean | null;
};

type StableSnapshot = {
  network: "mainnet";
  chainId: string;
  contractAddress: string | null;
  status: "ready" | "unconfigured";
  permitReady: boolean;
  custodyReady: boolean;
  depositBlockReason: string | null;
  asOf: string | null;
  reciprocalCredits: string;
  groupCredits: string;
  listings: StableListing[];
};

type DepositRow = HorfSelectedDeposit & { id: number; name: string };
type InspectionStatus = { status: "none" | "pending" | "approved" | "rejected" | "revoked"; reason: string | null };
type PendingAction = {
  action: "deposit" | "claim" | "cancel";
  stage: "eligibility" | "preflight" | "preparing" | "wallet" | "confirming";
  opHash: string | null;
};

const STABLES = [
  {
    mode: 0 as const,
    key: "reciprocal",
    name: "Reciprocal Stable",
    marker: "01 / EXCHANGE",
    rule: "Deposit one eligible horse edition to earn one claim of another trader’s horse.",
    credit: "1 claim per deposited edition",
  },
  {
    mode: 1 as const,
    key: "honor",
    name: "Honor Stable",
    marker: "02 / GIFT",
    rule: "No horse deposit required to claim. Give any number of eligible horse editions for other traders to take.",
    credit: "Free claim · Tezos gas still applies",
  },
  {
    mode: 2 as const,
    key: "group",
    name: "Group Stable",
    marker: "03 / COMMUNITY",
    rule: "Each deposited edition earns 30 claims. Each wallet may claim a given FA2 token ID only once.",
    credit: "30 claims per deposited edition",
  },
];

const Board = styled.section`
  margin-top: 24px;
  min-width: 0;
  padding: 16px;
  border: 3px solid #4e2520;
  background: #f0d9b3;
  box-shadow: inset 0 0 0 2px #ffedcc, 4px 4px 0 #bf7348;
  h2 { margin: 3px 0 5px; font-size: clamp(26px, 4cqw, 38px); line-height: 1; }
  h3 { margin: 0 0 6px; font-size: 20px; }
  p { line-height: 1.45; }
  button, input, select { font: inherit; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {
    outline: 3px solid #0b6874;
    outline-offset: 2px;
  }
`;

const Eyebrow = styled.div`
  color: #8a3a2a;
  font: 700 12px/1.2 "Courier New", monospace;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
  > p { max-width: 600px; margin: 0; font-size: 14px; }
`;

const SmallButton = styled.button<{ $strong?: boolean }>`
  min-height: 36px;
  padding: 6px 10px;
  border: 2px solid #643729;
  color: #39231c;
  background: ${(p) => p.$strong ? "#f4c761" : "#fff5df"};
  box-shadow: 2px 2px 0 #a96b45;
  cursor: pointer;
  font: 700 12px/1.2 "Courier New", monospace !important;
  &:hover:not(:disabled) { background: #ffe4a5; }
  &:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
`;

const Status = styled.div<{ $warn?: boolean }>`
  margin-top: 13px;
  padding: 9px 11px;
  border-left: 5px solid ${(p) => p.$warn ? "#a43c2e" : "#487347"};
  background: ${(p) => p.$warn ? "#fff0d2" : "#edf4d9"};
  font: 700 12px/1.45 "Courier New", monospace;
  overflow-wrap: anywhere;
  a { color: #723022; }
`;

const StableTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin-top: 18px;
  @container (max-width: 660px) { grid-template-columns: 1fr; }
`;

const StableTab = styled.button<{ $selected: boolean }>`
  min-width: 0;
  min-height: 106px;
  padding: 11px 12px;
  border: 2px solid #5b3027;
  background: ${(p) => p.$selected ? "#4d2326" : "#fff6e5"};
  color: ${(p) => p.$selected ? "#fff1ca" : "#452920"};
  text-align: left;
  cursor: pointer;
  box-shadow: ${(p) => p.$selected ? "inset 0 0 0 2px #d19d59" : "2px 2px 0 #bc8760"};
  small { display: block; color: ${(p) => p.$selected ? "#f9cf77" : "#9c4832"}; font: 700 11px/1.2 "Courier New", monospace; }
  strong { display: block; margin: 5px 0; font-size: 18px; line-height: 1.1; }
  span { display: block; font-size: 12px; line-height: 1.35; }
  &:disabled { cursor: wait; }
`;

const CreditStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 13px 0 0;
  span { padding: 7px 10px; border: 1px solid #9f6e49; background: #fff8e7; font: 700 12px/1.25 "Courier New", monospace; }
`;

const Inside = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin-top: 17px;
  @container (max-width: 760px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 14px;
  border-top: 4px solid #aa4b33;
  background: #fff8e9;
  box-shadow: inset 0 0 0 1px #c9a77d;
  > p { margin: 0 0 12px; font-size: 13px; }
  label { display: block; margin: 0 0 5px; font: 700 12px/1.25 "Courier New", monospace; }
  input, select {
    width: 100%;
    min-height: 36px;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid #886044;
    border-radius: 0;
    color: #321d1a;
    background: #fffdf6;
  }
`;

const InputAction = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  align-items: end;
  margin: 10px 0;
  @container (max-width: 480px) { grid-template-columns: 1fr; }
`;

const DraftList = styled.ul`
  list-style: none;
  margin: 12px 0;
  padding: 0;
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 76px auto;
    gap: 7px;
    align-items: end;
    padding: 9px 0;
    border-top: 1px solid #d5b58d;
  }
  strong, small { display: block; overflow-wrap: anywhere; }
  strong { font-size: 13px; }
  small { margin-top: 2px; color: #78594a; font: 11px/1.3 "Courier New", monospace; }
  @container (max-width: 480px) { li { grid-template-columns: minmax(0, 1fr) 72px; } li button { grid-column: 1 / -1; } }
`;

const ListingList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  li { padding: 12px 0; border-top: 1px solid #d3b189; }
  li:first-child { border-top: 0; }
  strong { display: block; font-size: 14px; overflow-wrap: anywhere; }
  small { display: block; margin: 3px 0 8px; color: #735146; font: 11px/1.35 "Courier New", monospace; overflow-wrap: anywhere; }
  p { margin: 5px 0 0; font-size: 12px; }
`;

const ListingActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 7px;
  label { width: 92px; margin: 0; }
`;

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function explorerUrl(opHash: string): string {
  return `https://tzkt.io/${encodeURIComponent(opHash)}`;
}

function positiveAmount(value: string): string {
  const normalized = toNatString(value);
  if (normalized === "0") throw new Error("Edition amount must be greater than zero.");
  return normalized;
}

function creditsAboveZero(value: string | undefined): boolean {
  try { return BigInt(value ?? "0") > 0n; } catch { return false; }
}

function isPositive(value: string): boolean {
  try { return BigInt(value) > 0n; } catch { return false; }
}

function formatSnapshot(value: string | null): string {
  if (!value) return "Waiting for an indexed snapshot";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `Indexed ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
}

function pendingLabel(pending: PendingAction): string {
  const action = pending.action === "deposit" ? "deposit" : pending.action === "claim" ? "claim" : "cancellation";
  if (pending.stage === "eligibility") return "Checking each horse and requesting one-use eligibility permits…";
  if (pending.stage === "preflight") return "Checking your wallet address and Tezos Mainnet…";
  if (pending.stage === "preparing") return `Preparing your ${action}…`;
  if (pending.stage === "wallet") return "Approve the Tezos transaction in your wallet…";
  return `Waiting for your ${action} to confirm on Tezos…`;
}

export function HorfStables({
  address,
  connectWallet,
  isConnecting,
}: {
  address: string | null;
  connectWallet: () => Promise<void>;
  isConnecting: boolean;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<HorfStableMode>(0);
  const [rows, setRows] = useState<Record<HorfStableMode, DepositRow[]>>({ 0: [], 1: [], 2: [] });
  const [nextRowId, setNextRowId] = useState(1);
  const [ownedSearchDraft, setOwnedSearchDraft] = useState("");
  const [ownedSearch, setOwnedSearch] = useState("");
  const [selectedOwned, setSelectedOwned] = useState("");
  const [objktInput, setObjktInput] = useState("");
  const [cancelAmounts, setCancelAmounts] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [permitScopeDenied, setPermitScopeDenied] = useState<"restricted" | "unverified" | null>(null);
  const [success, setSuccess] = useState<{ action: string; opHash: string } | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const snapshotQuery = useQuery({
    queryKey: ["horf", "stables", address],
    queryFn: () => api.get<StableSnapshot>(`/api/horf/stables${address ? `?address=${encodeURIComponent(address)}` : ""}`),
    refetchOnWindowFocus: true,
  });
  const snapshot = snapshotQuery.data;
  const configured = !snapshotQuery.isError && snapshot?.status === "ready" && snapshot.network === "mainnet" &&
    snapshot.chainId === HORF_STABLES_CHAIN_ID &&
    Boolean(snapshot.contractAddress && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(snapshot.contractAddress));
  const depositReady = configured && snapshot?.permitReady === true && snapshot?.custodyReady === true;
  const contract = configured ? { contractAddress: snapshot!.contractAddress!, chainId: snapshot!.chainId } : null;
  const ownedQuery = useInfiniteQuery({
    queryKey: ["horf", "owned-tokens", address, ownedSearch],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ address: address!, offset: String(pageParam) });
      if (ownedSearch) params.set("q", ownedSearch);
      return api.get<unknown>(`/api/horf/wallet/tokens?${params}`).then(parseHorfOwnedTokenPage);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.pagination.hasMore ? lastPage.pagination.nextOffset : undefined,
    enabled: Boolean(address),
  });
  const ownedTokens = useMemo(
    () => (ownedQuery.data?.pages.flatMap((page) => page.items) ?? []).filter((token) => token.walletAddress === address && isPositive(token.balance)),
    [address, ownedQuery.data],
  );
  const chosenOwned = ownedTokens.find((token) => `${token.contract}:${token.tokenId}` === selectedOwned);
  const activeStable = STABLES[mode];
  const inspectionQueries = useQueries({ queries: rows[mode].map((row) => ({
    queryKey: ["horf", "inspection-status", row.tokenContract, row.tokenId],
    queryFn: () => api.get<InspectionStatus>(`/api/horf/inspections/status?contract=${encodeURIComponent(row.tokenContract)}&tokenId=${encodeURIComponent(row.tokenId)}`),
    refetchOnWindowFocus: true,
  })) });
  const allRowsApproved = rows[mode].length > 0 && inspectionQueries.every((query) => query.data?.status === "approved");
  const activeListings = (snapshot?.listings ?? []).filter((listing) => listing.mode === mode && isPositive(listing.remaining));
  const busy = pending !== null;

  function addRow(contractAddress: string, tokenId: string, name: string) {
    setFormError(null);
    const normalizedId = toNatString(tokenId);
    if (rows[mode].some((row) => row.tokenContract === contractAddress && row.tokenId === normalizedId)) {
      setFormError("This token is already in the deposit. Increase its edition amount on that row.");
      return;
    }
    setRows((current) => ({
      ...current,
      [mode]: [...current[mode], { id: nextRowId, tokenContract: contractAddress, tokenId: normalizedId, amount: "1", name }],
    }));
    setNextRowId((id) => id + 1);
  }

  function addObjkt(event: FormEvent) {
    event.preventDefault();
    try {
      const token = parseObjktToken(objktInput);
      addRow(token.contract, token.tokenId, `Token #${token.tokenId}`);
      setObjktInput("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "That Objkt token link could not be read.");
    }
  }

  function changeRow(id: number, amount: string) {
    setRows((current) => ({ ...current, [mode]: current[mode].map((row) => row.id === id ? { ...row, amount } : row) }));
  }

  function removeRow(id: number) {
    setRows((current) => ({ ...current, [mode]: current[mode].filter((row) => row.id !== id) }));
  }

  function progress(action: PendingAction["action"]) {
    return {
      onStage: (stage: Exclude<PendingAction["stage"], "eligibility">) => setPending((current) => ({ action, stage, opHash: current?.opHash ?? null })),
      onSubmitted: (opHash: string) => setPending((current) => ({ action, stage: "confirming", opHash: current?.opHash ?? opHash })),
    };
  }

  async function deposit(event: FormEvent) {
    event.preventDefault();
    if (!address || !contract || !depositReady || busy) return;
    setFormError(null);
    setActionError(null);
    setPermitScopeDenied(null);
    setSuccess(null);
    let submittedHash: string | null = null;
    try {
      const selected: HorfSelectedDeposit[] = rows[mode].map((row) => ({
        tokenContract: row.tokenContract,
        tokenId: toNatString(row.tokenId),
        amount: positiveAmount(row.amount),
      }));
      if (!selected.length) throw new Error("Add at least one eligible horse token to this stable.");
      setPending({ action: "deposit", stage: "eligibility", opHash: null });
      const authorized: HorfAuthorizedDeposit[] = [];
      for (const selection of selected) {
        const permit = await api.post<HorfDepositPermit>("/api/horf/stables/permit", {
          address,
          mode,
          tokenContract: selection.tokenContract,
          tokenId: selection.tokenId,
          amount: selection.amount,
        });
        authorized.push({ selection, permit });
      }
      const handlers = progress("deposit");
      const opHash = await depositHorfHorses(address, contract, mode, authorized, {
        ...handlers,
        onSubmitted: (hash) => { submittedHash = hash; handlers.onSubmitted(hash); },
      });
      setRows((current) => ({ ...current, [mode]: [] }));
      setSuccess({ action: `${activeStable.name} deposit confirmed`, opHash });
      logClientSystemEvent({ eventType: "horf.stable.deposited", message: "Horse editions deposited in Horf Stable", metadata: { mode: activeStable.key, tokenRows: selected.length, opHash } });
      void snapshotQuery.refetch();
    } catch (error) {
      if (isApiRequestError(error) && error.status === 403) {
        setPermitScopeDenied(/restricted|blacklist/i.test(error.message) ? "restricted" : "unverified");
      }
      setActionError(`${error instanceof Error ? error.message : "The horse deposit could not be completed."}${submittedHash ? " The transaction was submitted; check its explorer status before retrying." : ""}`);
    } finally {
      setPending(null);
    }
  }

  async function claim(listing: StableListing) {
    if (!address || !contract || busy) return;
    setActionError(null);
    setSuccess(null);
    setPending({ action: "claim", stage: "preflight", opHash: null });
    let submittedHash: string | null = null;
    try {
      const handlers = progress("claim");
      const opHash = await claimHorfHorse(address, contract, listing.id, {
        ...handlers,
        onSubmitted: (hash) => { submittedHash = hash; handlers.onSubmitted(hash); },
      });
      setSuccess({ action: "Horse claim confirmed", opHash });
      logClientSystemEvent({ eventType: "horf.stable.claimed", message: "Horse claimed from Horf Stable", metadata: { mode: activeStable.key, listingId: listing.id, opHash } });
      void snapshotQuery.refetch();
      void qc.invalidateQueries({ queryKey: ["horf", "horse-rewards"] });
    } catch (error) {
      setActionError(`${error instanceof Error ? error.message : "The horse claim could not be completed."}${submittedHash ? " The transaction was submitted; check its explorer status before retrying." : ""}`);
    } finally {
      setPending(null);
    }
  }

  async function cancel(listing: StableListing) {
    if (!address || !contract || busy) return;
    setActionError(null);
    setSuccess(null);
    let submittedHash: string | null = null;
    try {
      const amount = positiveAmount(cancelAmounts[listing.id] ?? listing.remaining);
      if (BigInt(amount) > BigInt(listing.remaining)) throw new Error("Cancel amount exceeds the editions still listed.");
      setPending({ action: "cancel", stage: "preflight", opHash: null });
      const handlers = progress("cancel");
      const opHash = await cancelHorfListing(address, contract, listing.id, amount, {
        ...handlers,
        onSubmitted: (hash) => { submittedHash = hash; handlers.onSubmitted(hash); },
      });
      setSuccess({ action: `${amount} ${amount === "1" ? "edition" : "editions"} returned to your wallet`, opHash });
      logClientSystemEvent({ eventType: "horf.stable.cancelled", message: "Horse listing cancelled in Horf Stable", metadata: { mode: activeStable.key, listingId: listing.id, amount, opHash } });
      void snapshotQuery.refetch();
    } catch (error) {
      setActionError(`${error instanceof Error ? error.message : "The listing could not be cancelled."}${submittedHash ? " The transaction was submitted; check its explorer status before retrying." : ""}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <Board id="horf-stables" data-horf-region="stables" aria-label="Horf's three horse trading stables">
      <Header>
        <div>
          <Eyebrow>Three ways to trade · Tezos Mainnet</Eyebrow>
          <h2>Horf Stables</h2>
          <p>Deposit eligible horse editions or claim a horse another trader has shared. Every token identity needs active inspector approval before a deposit permit can be issued, including Honor Stable. The wallet still proves ownership and eligibility before signing.</p>
        </div>
        <SmallButton type="button" onClick={() => void snapshotQuery.refetch()} disabled={snapshotQuery.isFetching}>Refresh stables</SmallButton>
      </Header>

      {snapshotQuery.isPending && <Status role="status">Reading the stable contract and listings…</Status>}
      {snapshotQuery.isError && <Status $warn role="alert">The stable ledger is unavailable. Refresh to try again; transactions are disabled until it loads.</Status>}
      {snapshot?.status === "unconfigured" && <Status $warn role="status">The three stable rules are ready, but no Mainnet stable contract is deployed or configured yet. Deposits, claims, and cancellations are unavailable.</Status>}
      {snapshot?.status === "ready" && !configured && !snapshotQuery.isError && <Status $warn role="alert">The stable contract configuration does not match Tezos Mainnet. Transactions are disabled until it is corrected.</Status>}
      {configured && snapshot?.permitReady !== true && <Status $warn role="status">Deposits are paused while the eligibility signer is unavailable. Claims and listing cancellations remain available.</Status>}
      {configured && snapshot?.custodyReady !== true && <Status $warn role="status">{snapshot?.depositBlockReason || "Inspector approval checks are unavailable."} Deposits in all three Stables are paused until those checks are ready.</Status>}
      {configured && <Status role="status">Mainnet contract <a href={`https://tzkt.io/${contract!.contractAddress}`} target="_blank" rel="noopener noreferrer">{shortAddress(contract!.contractAddress)}</a> · {formatSnapshot(snapshot!.asOf)}</Status>}
      {!address && <Status $warn>Connect your Tezos wallet to see credits, prepare a deposit, or claim a horse. The pool can still be browsed below. <SmallButton type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet"}</SmallButton></Status>}

      <StableTabs aria-label="Choose a horse stable">
        {STABLES.map((stable) => (
          <StableTab
            key={stable.key}
            data-horf-stable-mode={stable.key}
            type="button"
            $selected={mode === stable.mode}
            aria-pressed={mode === stable.mode}
            disabled={busy}
            onClick={() => { setMode(stable.mode); setFormError(null); setActionError(null); }}
          >
            <small>{stable.marker}</small>
            <strong>{stable.name}</strong>
            <span>{stable.credit}</span>
          </StableTab>
        ))}
      </StableTabs>

      <CreditStrip data-horf-stable-credits>
        <span>Reciprocal claims: {address && snapshot ? snapshot.reciprocalCredits : "Connect wallet"}</span>
        <span>Group claims: {address && snapshot ? snapshot.groupCredits : "Connect wallet"}</span>
      </CreditStrip>
      <Status $warn data-horf-stable-trust-note>Marshal approval is a documented human review, not proof that an arbitrary FA2 transfers honestly. Check the token contract and trader before depositing or claiming.</Status>
      <Inside>
        <Panel data-horf-stable-deposit>
          <Eyebrow>Offer a horse</Eyebrow>
          <h3>Deposit in {activeStable.name}</h3>
          <p>{activeStable.rule} Add several token rows to one wallet transaction. FA2 operator access is removed in the same transaction group.</p>
          {address ? (
            <>
              <form onSubmit={(event) => { event.preventDefault(); setOwnedSearch(ownedSearchDraft.trim()); setSelectedOwned(""); }}>
                <label htmlFor="horf-owned-search">Find a token in this wallet</label>
                <InputAction>
                  <input id="horf-owned-search" value={ownedSearchDraft} onChange={(event) => setOwnedSearchDraft(event.target.value)} placeholder="Name, collection, contract…" />
                  <SmallButton type="submit">Search owned</SmallButton>
                </InputAction>
              </form>
              <label htmlFor="horf-owned-token">Indexed owned tokens · {shortAddress(address)}</label>
              <InputAction>
                <select id="horf-owned-token" data-horf-owned-select value={chosenOwned ? selectedOwned : ""} onChange={(event) => setSelectedOwned(event.target.value)}>
                  <option value="">{ownedQuery.isPending ? "Loading owned tokens…" : "Choose an owned token"}</option>
                  {ownedTokens.map((token) => (
                    <option key={`${token.contract}:${token.tokenId}`} value={`${token.contract}:${token.tokenId}`}>
                      {token.name || `Token #${token.tokenId}`} · {token.balance} owned
                    </option>
                  ))}
                </select>
                <SmallButton type="button" onClick={() => chosenOwned && addRow(chosenOwned.contract, chosenOwned.tokenId, chosenOwned.name || `Token #${chosenOwned.tokenId}`)} disabled={!chosenOwned || !depositReady || busy}>Add owned horse</SmallButton>
              </InputAction>
              {ownedQuery.isError && <p role="alert">Owned tokens could not be loaded. You can still paste an Objkt token link below.</p>}
              {ownedQuery.hasNextPage && <SmallButton type="button" onClick={() => void ownedQuery.fetchNextPage()} disabled={ownedQuery.isFetchingNextPage}>{ownedQuery.isFetchingNextPage ? "Loading…" : "Load more owned tokens"}</SmallButton>}
            </>
          ) : <p>Connect your wallet to prepare a deposit. You may still view all open stable listings.</p>}
          <form onSubmit={addObjkt}>
            <label htmlFor="horf-objkt-token">Or paste an Objkt token link</label>
            <InputAction>
              <input id="horf-objkt-token" data-horf-objkt-input value={objktInput} onChange={(event) => setObjktInput(event.target.value)} placeholder="https://objkt.com/tokens/KT1…/123" disabled={!address || !depositReady || busy} />
              <SmallButton type="submit" disabled={!address || !depositReady || busy || !objktInput.trim()}>Add Objkt token</SmallButton>
            </InputAction>
          </form>
          <form onSubmit={(event) => void deposit(event)}>
            {rows[mode].length > 0 ? (
              <DraftList data-horf-stable-deposit-rows>
                {rows[mode].map((row, index) => (
                  <li key={row.id} data-horf-stable-deposit-row>
                    <div>
                      <strong><a href={tokenUrl(row.tokenContract, row.tokenId)} target="_blank" rel="noopener noreferrer">{row.name}</a></strong>
                      <small>{shortAddress(row.tokenContract)} / #{row.tokenId}</small>
                      <small>{inspectionQueries[index]?.isPending ? "Checking inspection approval…" : inspectionQueries[index]?.isError ? "Inspection status unavailable" : inspectionQueries[index]?.data?.status === "approved" ? "Inspector approved" : `Inspection required · ${inspectionQueries[index]?.data?.status ?? "none"}`}</small>
                    </div>
                    <label>Ed.<input aria-label={`Editions of ${row.name}`} inputMode="numeric" pattern="[0-9]+" value={row.amount} onChange={(event) => changeRow(row.id, event.target.value)} disabled={!depositReady || busy} /></label>
                    <SmallButton type="button" onClick={() => removeRow(row.id)} disabled={!depositReady || busy}>Remove</SmallButton>
                  </li>
                ))}
              </DraftList>
            ) : <p>No horse editions added to this deposit yet.</p>}
            {formError && <Status $warn role="alert">{formError}</Status>}
            <SmallButton data-horf-stable-submit type="submit" $strong disabled={!address || !depositReady || !allRowsApproved || busy}>
              {busy && pending?.action === "deposit" ? "Deposit in progress…" : `Deposit in ${activeStable.name}`}
            </SmallButton>
            <p>Only actively inspected token identities can be deposited into any Stable. Eligibility and your edition balance are checked again at permit request. Tezos transaction fees apply.</p>
          </form>
        </Panel>

        <Panel data-horf-stable-listings>
          <Eyebrow>Inside the stable</Eyebrow>
          <h3>{activeStable.name} listings</h3>
          <p>{mode === 1 ? "Honor claims need no horse deposit or claim credits, but your wallet still signs a Tezos transaction and pays gas." : mode === 2 ? "A wallet can claim each FA2 token ID only once across group listings. Another trader’s horse requires one group credit." : "Claim one edition from another trader with one reciprocal credit."}</p>
          {activeListings.length ? (
            <ListingList>
              {activeListings.map((listing) => {
                const own = address === listing.owner;
                const noCredit = mode === 0 ? !creditsAboveZero(snapshot?.reciprocalCredits) : mode === 2 ? !creditsAboveZero(snapshot?.groupCredits) : false;
                const claimed = mode === 2 && listing.claimedByWallet === true;
                return (
                  <li key={listing.id} data-horf-stable-listing data-horf-stable-listing-id={listing.id}>
                    <strong><a href={tokenUrl(listing.tokenContract, listing.tokenId)} target="_blank" rel="noopener noreferrer">Horse token #{listing.tokenId}</a> · {listing.remaining} {listing.remaining === "1" ? "edition" : "editions"} left</strong>
                    <small>Listing #{listing.id} · {shortAddress(listing.tokenContract)} · offered by <a href={`https://objkt.com/profile/${encodeURIComponent(listing.owner)}`} target="_blank" rel="noopener noreferrer">{own ? "you" : shortAddress(listing.owner)}</a></small>
                    {own ? (
                      <>
                        <ListingActions>
                          <label>Return editions
                            <input aria-label={`Return editions from listing ${listing.id}`} inputMode="numeric" pattern="[0-9]+" value={cancelAmounts[listing.id] ?? listing.remaining} onChange={(event) => setCancelAmounts((current) => ({ ...current, [listing.id]: event.target.value }))} disabled={!configured || busy} />
                          </label>
                          <SmallButton data-horf-stable-cancel type="button" onClick={() => void cancel(listing)} disabled={!configured || busy}>Cancel listing</SmallButton>
                        </ListingActions>
                        {mode !== 1 && <p>You can return editions only while the corresponding claim credits remain unspent.</p>}
                      </>
                    ) : (
                      <>
                        <SmallButton data-horf-stable-claim type="button" $strong onClick={() => void claim(listing)} disabled={!address || !configured || noCredit || claimed || busy}>Claim 1 horse</SmallButton>
                        {claimed && <p>Already claimed this token ID with this wallet.</p>}
                        {!claimed && noCredit && address && <p>{mode === 0 ? "Deposit in the Reciprocal Stable to earn a claim." : "Deposit in the Group Stable to earn claims."}</p>}
                      </>
                    )}
                  </li>
                );
              })}
            </ListingList>
          ) : <p>{snapshotQuery.isPending ? "Reading stable listings…" : snapshotQuery.isError ? "Listings unavailable until the stable ledger loads." : snapshot?.status === "unconfigured" ? "Listings will appear once the Mainnet contract is deployed." : "No horse editions are listed in this stable yet."}</p>}
        </Panel>
      </Inside>
      {pending && <Status role="status" aria-live="polite">{pendingLabel(pending)} {pending.opHash && <a href={explorerUrl(pending.opHash)} target="_blank" rel="noopener noreferrer">View submitted transaction</a>}</Status>}
      {actionError && <Status $warn role="alert">{actionError}{permitScopeDenied === "unverified" && <> Reconnect and verify this wallet to request a deposit permit. <SmallButton type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Reconnect and verify wallet"}</SmallButton></>}{permitScopeDenied === "restricted" && " Check Trader standing by the race board for this wallet’s restriction."}</Status>}
      {success && <Status role="status">{success.action}. <a href={explorerUrl(success.opHash)} target="_blank" rel="noopener noreferrer">View Tezos transaction</a>. The indexed listing and credit totals may take a moment to catch up.</Status>}
    </Board>
  );
}
