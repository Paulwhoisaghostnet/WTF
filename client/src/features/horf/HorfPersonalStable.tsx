import { useMemo, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, fetchWithCsrf, isApiRequestError } from "../../lib/api";
import { advanceResolvedMediaFallback, resolveTokenThumbnail } from "../../lib/media-resolve";
import { logClientSystemEvent } from "../../lib/system-log";
import { parseHorfOwnedTokenPage } from "./owned-tokens";
import { objktTokenUrl } from "./token-input";

type Selection = {
  id: number;
  ownerAddress: string;
  tokenContract: string;
  tokenId: string;
  selectedAt: string;
  inspectionStatus: "none" | "pending" | "approved" | "rejected" | "revoked";
  inspectionId: number | null;
  token: { name: string; image: string | null };
};

type InspectionStatus = {
  contract: string;
  tokenId: string;
  status: Selection["inspectionStatus"];
  inspectionId: number | null;
  reason: string | null;
};

const Shell = styled.section`
  margin-top: 24px;
  padding: 18px;
  border: 3px solid #315e57;
  background: #dce8dc;
  box-shadow: inset 0 0 0 2px #fff3cf, 4px 4px 0 #a6764b;
  min-width: 0;
  h2 { margin: 2px 0 6px; font-size: clamp(25px, 4cqw, 36px); line-height: 1.05; }
  h3 { margin: 0 0 8px; font-size: 19px; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.45; }
  label { display: block; margin: 0 0 5px; font: 700 12px/1.3 "Courier New", monospace; }
  input, select { width: 100%; min-width: 0; min-height: 36px; padding: 6px 8px; border: 1px solid #836644; background: #fffdf3; color: #312319; font: 13px Georgia, serif; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid #0b6874; outline-offset: 2px; }
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: start;
  gap: 10px 18px;
  small { color: #965237; font: 700 11px "Courier New", monospace; text-transform: uppercase; }
  > div { max-width: 700px; }
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px;
  margin-top: 16px;
  @container (max-width: 700px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 14px;
  border-top: 4px solid #8c6140;
  background: #fff9e8;
  box-shadow: inset 0 0 0 1px #c3ab80;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  margin-bottom: 10px;
  @container (max-width: 460px) { grid-template-columns: 1fr; }
`;

const Action = styled.button<{ $primary?: boolean }>`
  min-height: 36px;
  padding: 6px 10px;
  border: 2px solid #60452f;
  background: ${(p) => p.$primary ? "#f5ca71" : "#fff0d2"};
  color: #33241c;
  box-shadow: 2px 2px 0 #a6815a;
  cursor: pointer;
  font: 700 12px/1.2 "Courier New", monospace;
  &:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
`;

const Note = styled.div<{ $error?: boolean }>`
  margin: 10px 0;
  padding: 9px 11px;
  border-left: 5px solid ${(p) => p.$error ? "#a34232" : "#5b8051"};
  background: ${(p) => p.$error ? "#fff0d9" : "#edf2dc"};
  font: 700 12px/1.45 "Courier New", monospace;
  overflow-wrap: anywhere;
`;

const StableList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  li { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px; padding: 10px 0; border-top: 1px solid #d6c29f; }
  li:first-child { border-top: 0; }
  strong { display: block; overflow-wrap: anywhere; }
  small { display: block; color: #735d4c; font: 11px/1.3 "Courier New", monospace; overflow-wrap: anywhere; }
  button { margin-top: 7px; }
`;

const SavedHorseArt = styled.img`
  width: 68px;
  height: 68px;
  object-fit: contain;
  border: 2px solid #a5835d;
  background: #f4ebd8;
`;

const SavedHorseGlyph = styled.span`
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  border: 2px solid #a5835d;
  background: #f4ebd8;
  img { display: block; width: 64px; height: 58px; object-fit: contain; }
`;

const HorseArt = styled.img`
  display: block;
  width: min(100%, 220px);
  aspect-ratio: 1;
  object-fit: contain;
  margin: 8px 0;
  border: 3px double #9d7956;
  background: #f4ebd8;
`;

function positiveBalance(balance: string): boolean {
  try { return BigInt(balance) > 0n; } catch { return false; }
}

function shortAddress(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function HorfPersonalStable({ address, connectWallet, isConnecting }: {
  address: string | null;
  connectWallet: () => Promise<void>;
  isConnecting: boolean;
}) {
  const qc = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const ownedQuery = useInfiniteQuery({
    queryKey: ["horf", "owned-tokens", address, search],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ address: address!, offset: String(pageParam) });
      if (search) params.set("q", search);
      return api.get<unknown>(`/api/horf/wallet/tokens?${params}`).then(parseHorfOwnedTokenPage);
    },
    initialPageParam: 0,
    getNextPageParam: (page) => page.pagination.hasMore ? page.pagination.nextOffset : undefined,
    enabled: Boolean(address),
  });
  const owned = useMemo(() => (ownedQuery.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((token) => token.walletAddress === address && positiveBalance(token.balance)), [address, ownedQuery.data]);
  const selected = owned.find((token) => `${token.contract}:${token.tokenId}` === selectedKey) ?? null;
  const selectionsQuery = useQuery({
    queryKey: ["horf", "stable-selections", address],
    queryFn: () => api.get<{ selections: Selection[] }>(`/api/horf/stable-selections?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
    refetchOnWindowFocus: true,
  });
  const selections = Array.isArray(selectionsQuery.data?.selections) ? selectionsQuery.data.selections : [];
  const saved = selected && selections.some((item) => item.tokenContract === selected.contract && item.tokenId === selected.tokenId);
  const statusQuery = useQuery({
    queryKey: ["horf", "inspection-status", selected?.contract, selected?.tokenId],
    queryFn: () => api.get<InspectionStatus>(`/api/horf/inspections/status?contract=${encodeURIComponent(selected!.contract)}&tokenId=${encodeURIComponent(selected!.tokenId)}`),
    enabled: Boolean(selected),
    refetchOnWindowFocus: true,
  });
  const eligibilityQuery = useQuery({
    queryKey: ["horf", "token-eligibility", selected?.contract, selected?.tokenId],
    queryFn: () => api.get<{ eligible: true; token: { name: string; image: string | null } }>(`/api/horf/token-eligibility?contract=${encodeURIComponent(selected!.contract)}&tokenId=${encodeURIComponent(selected!.tokenId)}`),
    enabled: Boolean(selected),
    refetchOnWindowFocus: true,
  });
  const selectionsDenied = isApiRequestError(selectionsQuery.error) && selectionsQuery.error.status === 403;
  const restricted = selectionsDenied && /restricted|blacklist/i.test(selectionsQuery.error?.message ?? "");
  const selectedArt = eligibilityQuery.data?.token.image ? resolveTokenThumbnail({ thumbnail: eligibilityQuery.data.token.image }) : null;

  async function addSelection() {
    if (!address || !selected || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post("/api/horf/stable-selections", { address, tokenContract: selected.contract, tokenId: selected.tokenId });
      await qc.invalidateQueries({ queryKey: ["horf", "stable-selections", address] });
      setSuccess(`${selected.name || `Token #${selected.tokenId}`} is saved in your personal stable.`);
      logClientSystemEvent({ eventType: "horf.personal_stable.selected", message: "Horse saved in personal Horf Stable", metadata: { address, tokenContract: selected.contract, tokenId: selected.tokenId } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this horse.");
    } finally { setBusy(false); }
  }

  async function submitInspection() {
    if (!address || !selected || !saved || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post("/api/horf/inspections", { address, tokenContract: selected.contract, tokenId: selected.tokenId });
      await qc.invalidateQueries({ queryKey: ["horf", "stable-selections", address] });
      await qc.invalidateQueries({ queryKey: ["horf", "inspection-status", selected.contract, selected.tokenId] });
      setSuccess("Inspection requested. A deputized Horf inspector will review this token’s provenance and transfers.");
      logClientSystemEvent({ eventType: "horf.inspection.submitted", message: "Horse token submitted for Horf inspection", metadata: { address, tokenContract: selected.contract, tokenId: selected.tokenId } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request inspection.");
    } finally { setBusy(false); }
  }

  async function removeSelection(selection: Selection) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchWithCsrf(`/api/horf/stable-selections/${selection.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not remove this horse from your stable.");
      }
      await qc.invalidateQueries({ queryKey: ["horf", "stable-selections", address] });
      setSuccess("Horse removed from your personal stable. This does not revoke a token’s inspection approval.");
      logClientSystemEvent({ eventType: "horf.personal_stable.removed", message: "Horse removed from personal Horf Stable", metadata: { address, tokenContract: selection.tokenContract, tokenId: selection.tokenId } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this horse.");
    } finally { setBusy(false); }
  }

  function searchOwned(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setSelectedKey("");
  }

  return <Shell id="horf-personal-stable" data-horf-region="personal-stable" aria-label="Your personal horse stable">
    <Header>
      <div><small>Your paddock · off-chain · 🪢</small><h2>Your personal stable <span aria-hidden="true">🐎</span></h2><p>Round up horses held by your wallet and keep their papers together here. A saved selection stays off-chain: it does not move or lock an edition. Send an eligible horse to the inspector before that token can enter any Marshal’s Market Stable.</p></div>
      <Action type="button" onClick={() => { void ownedQuery.refetch(); void selectionsQuery.refetch(); }} disabled={!address || ownedQuery.isFetching || selectionsQuery.isFetching}>Refresh stable</Action>
    </Header>
    {!address && <Note $error>Connect and verify your Tezos wallet to see the horses it owns and save a personal selection. <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect and verify wallet"}</Action></Note>}
    <Columns>
      <Panel data-horf-personal-owned>
        <h3>Horses in this wallet</h3>
        <form onSubmit={searchOwned}><label htmlFor="horf-personal-search">Find a token by name, contract, or ID</label><Row><input id="horf-personal-search" data-horf-personal-search value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} disabled={!address} /><Action type="submit" disabled={!address}>Search</Action></Row></form>
        <label htmlFor="horf-personal-owned">Select an indexed token</label>
        <select id="horf-personal-owned" data-horf-personal-token value={selected ? selectedKey : ""} onChange={(event) => setSelectedKey(event.target.value)} disabled={!address || busy}>
          <option value="">{ownedQuery.isPending && address ? "Loading wallet tokens…" : "Choose a token"}</option>
          {owned.map((token) => <option key={`${token.contract}:${token.tokenId}`} value={`${token.contract}:${token.tokenId}`}>{token.name || `Token #${token.tokenId}`} · {token.balance} owned</option>)}
        </select>
        {ownedQuery.hasNextPage && <Action type="button" onClick={() => void ownedQuery.fetchNextPage()} disabled={ownedQuery.isFetchingNextPage}>{ownedQuery.isFetchingNextPage ? "Loading…" : "More wallet tokens"}</Action>}
        {ownedQuery.isError && <Note $error role="alert">Wallet tokens are unavailable right now. Refresh this section to try again.</Note>}
        {selected && <div data-horf-personal-selection>
          <Note><a href={objktTokenUrl(selected.contract, selected.tokenId)} target="_blank" rel="noopener noreferrer">{selected.name || `Token #${selected.tokenId}`}</a> · #{selected.tokenId} · {shortAddress(selected.contract)} · {selected.balance} editions indexed</Note>
          {selectedArt && <HorseArt src={selectedArt.src} alt={`${selected.name || `Horse token #${selected.tokenId}`} artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, selectedArt)) event.currentTarget.style.display = "none"; }} />}
          <p>{eligibilityQuery.isPending ? "Checking horse mint keywords and Objkt tag groups…" : eligibilityQuery.isError ? `Horse eligibility: ${eligibilityQuery.error instanceof Error ? eligibilityQuery.error.message : "unavailable"}` : "Horse eligibility: qualifying metadata found."}</p>
          <p>{statusQuery.isPending ? "Checking inspection status…" : statusQuery.isError ? "Inspection status unavailable." : `Inspection: ${statusQuery.data?.status ?? "none"}${statusQuery.data?.reason ? ` · ${statusQuery.data.reason}` : ""}`}</p>
          {!saved && <Action data-horf-personal-add type="button" $primary onClick={() => void addSelection()} disabled={!address || busy || eligibilityQuery.isPending || eligibilityQuery.isError}>Add to my stable</Action>}
          {saved && <Action data-horf-inspection-submit type="button" $primary onClick={() => void submitInspection()} disabled={busy || eligibilityQuery.isPending || eligibilityQuery.isError || statusQuery.isPending || statusQuery.isError || statusQuery.data?.status === "pending" || statusQuery.data?.status === "approved"}>Submit for inspection</Action>}
          {saved && statusQuery.data?.status === "approved" && <p>This token identity is approved for trading Stable permit checks; each deposit still rechecks ownership and eligibility.</p>}
          {saved && statusQuery.data?.status === "pending" && <p>An inspector has this token in the review queue.</p>}
        </div>}
      </Panel>
      <Panel data-horf-personal-saved>
        <h3>Saved horses</h3>
        <p>These are your saved token choices, not a live proof of ownership. Horf rechecks your Mainnet balance when you submit a token for inspection or deposit.</p>
        {selectionsQuery.isPending && address && <p>Opening your personal stable…</p>}
        {selectionsDenied ? <Note $error role="alert">{restricted ? "This wallet is restricted from Horf private features. Check Trader standing by the race board." : "Your Horf wallet proof is missing or expired. Reconnect and verify this wallet."} {!restricted && <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Reconnect and verify wallet"}</Action>}</Note> : selectionsQuery.isError && <Note $error role="alert">Saved horses are unavailable. Refresh this section to try again.</Note>}
        {selections.length ? <StableList>{selections.map((item) => {
          const name = item.token?.name || `Horse token #${item.tokenId}`;
          const art = item.token?.image ? resolveTokenThumbnail({ thumbnail: item.token.image }) : null;
          return <li key={item.id} data-horf-personal-saved-row>
            {art ? <SavedHorseArt src={art.src} alt={`${name} artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) { event.currentTarget.src = "/horf-art/galloping-horse.webp"; event.currentTarget.alt = "Illustrated horse placeholder"; } }} /> : <SavedHorseGlyph aria-hidden="true"><img src="/horf-art/galloping-horse.webp" alt="" /></SavedHorseGlyph>}
            <div><strong><a href={objktTokenUrl(item.tokenContract, item.tokenId)} target="_blank" rel="noopener noreferrer">{name}</a> · {item.inspectionStatus}</strong>
            <small>{shortAddress(item.tokenContract)} / #{item.tokenId} · saved {new Date(item.selectedAt).toLocaleDateString()}</small>
            <Action type="button" onClick={() => void removeSelection(item)} disabled={busy}>Remove selection</Action></div>
          </li>;
        })}</StableList> : address && !selectionsQuery.isPending && !selectionsQuery.isError && <p>Your stable has no saved horses yet.</p>}
      </Panel>
    </Columns>
    {error && <Note $error role="alert">{error}</Note>}
    {success && <Note role="status">{success}</Note>}
  </Shell>;
}
