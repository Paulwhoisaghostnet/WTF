import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, fetchWithCsrf, isApiRequestError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { advanceResolvedMediaFallback, resolveTokenThumbnail } from "../../lib/media-resolve";
import { logClientSystemEvent } from "../../lib/system-log";
import { resolveHorfHorseArt, resolveHorfHorseCardArt, resolveHorfHorseVideo, uniqueHorfThumbnailIdentities } from "./horse-media";
import { parseHorfOwnedTokenPage } from "./owned-tokens";
import { HorfProfileEditor } from "./HorfTraderProfile";
import { findHorfMintSeason, type HorfMintSeason } from "./mint-season";
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

type HeldHorse = {
  contract: string;
  tokenId: string;
  balance: string;
  name: string | null;
  image: string | null;
  artifactUri?: string | null;
  mime?: string | null;
  mintedAt?: string | null;
};
type HeldHorsePage = {
  address: string;
  items: HeldHorse[];
  pagination: { hasMore: boolean; nextOffset: number };
};

function parseHeldHorsePage(value: unknown): HeldHorsePage {
  const page = value as Partial<HeldHorsePage> | null;
  if (!page || typeof page.address !== "string" || !Array.isArray(page.items) ||
      page.items.some((item) => !item || typeof item.contract !== "string" ||
        typeof item.tokenId !== "string" || typeof item.balance !== "string" ||
        (item.name !== null && typeof item.name !== "string") ||
        (item.image !== null && typeof item.image !== "string") ||
        (item.artifactUri !== undefined && item.artifactUri !== null && typeof item.artifactUri !== "string") ||
        (item.mime !== undefined && item.mime !== null && typeof item.mime !== "string") ||
        (item.mintedAt !== undefined && item.mintedAt !== null && typeof item.mintedAt !== "string")) ||
      !page.pagination || typeof page.pagination.hasMore !== "boolean" ||
      !Number.isSafeInteger(page.pagination.nextOffset)) {
    throw new Error("Qualifying horse balances are unavailable.");
  }
  return page as HeldHorsePage;
}

const Shell = styled.section`
  margin-top: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--horf-ink, #f4ead6);
  font-family: var(--horf-font, "Avenir Next", "Segoe UI", sans-serif);
  min-width: 0;
  h2 { margin: 8px 0 10px; font: 700 clamp(26px, 3cqw, 40px)/1.06 var(--horf-display, Georgia, serif); letter-spacing: -.025em; text-wrap: balance; }
  h3 { margin: 0 0 9px; font-size: 21px; letter-spacing: -.02em; }
  p { margin: 0 0 12px; color: var(--horf-muted, #b7b5a7); font-size: 14px; line-height: 1.55; }
  label { display: block; margin: 0 0 6px; font: 700 13px/1.3 var(--horf-font, "Avenir Next", sans-serif); }
  input, select { width: 100%; min-width: 0; min-height: 42px; padding: 9px 11px; border: 1px solid var(--horf-line, #3d5148); border-radius: 9px; background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); font: 14px var(--horf-font, "Avenir Next", sans-serif); }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 2px; }
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: start;
  gap: 14px 20px;
  small { color: var(--horf-teal, #71b7a0); font: 800 12px var(--horf-font, "Avenir Next", sans-serif); letter-spacing: .12em; text-transform: uppercase; }
  > div { max-width: 65ch; }
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 22px;
  @container (max-width: 700px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 14px;
  background: var(--horf-surface, #1b2723);
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
  &:disabled { opacity: 0.55; cursor: not-allowed; }
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

const WalletGuide = styled(Note)`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-height: 42px;
  margin: 0 0 12px;
  padding: 7px 11px;
  code { color: var(--horf-ink); }
  button { min-height: 32px; padding: 5px 10px; }
`;

const MintFilter = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 8px 16px;
  margin: 12px 0 14px;
  label { min-width: 190px; margin: 0; }
  select { display: block; width: min(100%, 300px); margin-top: 5px; }
  small { color: var(--horf-muted); font-size: 12px; line-height: 1.45; }
`;

const StableList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  li { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; padding: 13px 0; border-top: 1px solid var(--horf-line, #3d5148); }
  li:first-child { border-top: 0; }
  strong { display: block; overflow-wrap: anywhere; }
  small { display: block; color: var(--horf-muted, #b7b5a7); font: 12px/1.4 var(--horf-font, "Avenir Next", sans-serif); overflow-wrap: anywhere; }
  button { margin-top: 7px; }
`;

const SavedHorseArt = styled.img`
  width: 68px;
  height: 68px;
  object-fit: contain;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 10px;
  background: var(--horf-canvas, #101816);
`;

const SavedHorseGlyph = styled.span`
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 10px;
  background: var(--horf-canvas, #101816);
  img { display: block; width: 100%; height: 100%; border-radius: 9px; object-fit: cover; }
`;

const HorseArt = styled.img`
  display: block;
  width: min(100%, 220px);
  aspect-ratio: 1;
  object-fit: contain;
  margin: 10px 0;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 12px;
  background: var(--horf-canvas, #101816);
`;

const HorseGallery = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
  margin: 16px 0;
  article { min-width: 0; overflow: hidden; border: 1px solid var(--horf-line); border-radius: 13px; background: var(--horf-elevated); }
  .art { display: grid; place-items: center; height: 190px; background: var(--horf-field); }
  img, video { display: block; width: 100%; height: 100%; object-fit: contain; }
  .copy { padding: 13px; }
  h4 { margin: 0 0 5px; color: var(--horf-ink); font: 700 18px/1.2 var(--horf-display); overflow-wrap: anywhere; }
  p { margin: 0 0 9px; font-size: 12px; }
  a { color: var(--horf-teal); font-size: 12px; font-weight: 800; }
  button { display: block; min-height: 38px; margin-top: 10px; padding: 7px 12px; border: 1px solid var(--horf-gold); border-radius: 9px; background: var(--horf-gold); color: var(--horf-deep); cursor: pointer; font: 800 12px var(--horf-font); }
  .art-open { width: 100%; height: 100%; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; }
  .title-open { width: auto; min-height: 0; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; }
`;

function StableVideoPreview({ src }: { src: string }) {
  const elementRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <video ref={elementRef} src={visible ? src : undefined} muted playsInline preload={visible ? "metadata" : "none"} aria-hidden="true" />;
}

const StableHorseDetail = styled.dialog`
  width: min(860px, calc(100vw - 28px));
  max-height: min(850px, calc(100vh - 28px));
  overflow: auto;
  padding: 22px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 15px;
  background: var(--horf-surface, #1b2723);
  color: var(--horf-ink, #f4ead6);
  box-shadow: 0 28px 80px #000a;
  &::backdrop { background: #050908ca; }
  .detail-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; }
  h3 { margin: 0 0 8px; font: 700 clamp(24px, 4vw, 36px)/1.1 var(--horf-display, Georgia, serif); }
  .detail-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 20px; margin-top: 16px; }
  .detail-art { display: grid; place-items: center; min-height: 250px; border-radius: 11px; background: var(--horf-canvas, #101816); }
  .detail-art img, .detail-art video { display: block; width: 100%; max-height: 65vh; object-fit: contain; }
  p { overflow-wrap: anywhere; }
  a { color: var(--horf-teal, #71b7a0); }
  @media (max-width: 650px) { .detail-grid { grid-template-columns: 1fr; } .detail-art { min-height: 180px; } }
`;

const MintBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  margin: 0 0 9px;
  padding: 3px 8px 3px 5px;
  border: 1px solid #856838;
  border-radius: 999px;
  background: #392f20;
  color: #f0d39a;
  font: 750 11px/1.25 var(--horf-font);
  img { width: 15px; height: 15px; flex: 0 0 15px; object-fit: contain; }
`;

function positiveBalance(balance: string): boolean {
  try { return BigInt(balance) > 0n; } catch { return false; }
}

function shortAddress(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function HorfPersonalStable({ address, connectWallet, isConnecting, seasonKey, seasonLabel, seasons }: {
  address: string | null;
  connectWallet: () => Promise<void>;
  isConnecting: boolean;
  seasonKey: string;
  seasonLabel: string;
  seasons: HorfMintSeason[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [mintSeasonKey, setMintSeasonKey] = useState("all");
  const [detailHorse, setDetailHorse] = useState<HeldHorse | null>(null);
  const detailRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const refreshHoldings = useRef(false);
  const linkedWalletsQuery = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const rows = await api.get<unknown>("/api/wallets");
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.walletAddress !== "string")) {
        throw new Error("WTF OS linked wallets returned an invalid list.");
      }
      return rows as Array<{ walletAddress: string }>;
    },
    enabled: Boolean(user),
    refetchOnWindowFocus: true,
  });
  const linkedWallets = Array.isArray(linkedWalletsQuery.data)
    ? linkedWalletsQuery.data.filter((wallet) => typeof wallet?.walletAddress === "string").map((wallet) => wallet.walletAddress)
    : [];
  const linkedHere = Boolean(address && linkedWallets.includes(address));

  const ownedQuery = useInfiniteQuery({
    queryKey: ["horf", "owned-tokens", address, search],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ address: address!, offset: String(pageParam) });
      if (search) params.set("q", search);
      if (refreshHoldings.current) params.set("refresh", "1");
      return api.get<unknown>(`/api/horf/wallet/tokens?${params}`).then(parseHorfOwnedTokenPage);
    },
    initialPageParam: 0,
    getNextPageParam: (page) => page.pagination.hasMore ? page.pagination.nextOffset : undefined,
    enabled: Boolean(address),
  });
  const owned = useMemo(() => (ownedQuery.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((token) => token.walletAddress === address && positiveBalance(token.balance)), [address, ownedQuery.data]);
  const qualifyingQuery = useInfiniteQuery({
    queryKey: ["horf", "trader-profile-horses", address],
    queryFn: async ({ pageParam }) => {
      const page = parseHeldHorsePage(await api.get<unknown>(`/api/horf/traders/${encodeURIComponent(address!)}/horses?offset=${pageParam}${refreshHoldings.current ? "&refresh=1" : ""}`));
      if (page.pagination.hasMore && page.pagination.nextOffset <= pageParam) {
        throw new Error("The wallet horse index stopped advancing. Retry the scan.");
      }
      return page;
    },
    initialPageParam: 0,
    getNextPageParam: (page) => page.pagination.hasMore ? page.pagination.nextOffset : undefined,
    enabled: Boolean(address),
    refetchOnWindowFocus: true,
  });
  const qualifyingHorses = useMemo(() => qualifyingQuery.data?.pages.flatMap((page) => page.items) ?? [], [qualifyingQuery.data]);
  const mintSeasons = useMemo(() => seasons.filter((season) =>
    season.key !== "all-time" && Number.isFinite(Date.parse(season.startsAt))), [seasons]);
  const selectedMintSeason = mintSeasons.find((season) => season.key === mintSeasonKey);
  const visibleHorses = useMemo(() => {
    if (!selectedMintSeason) return qualifyingHorses;
    return qualifyingHorses.filter((horse) => findHorfMintSeason(horse, mintSeasons)?.key === selectedMintSeason.key);
  }, [qualifyingHorses, selectedMintSeason, mintSeasons]);
  const uniqueThumbnails = useMemo(() => uniqueHorfThumbnailIdentities(qualifyingHorses), [qualifyingHorses]);
  useEffect(() => {
    const dialog = detailRef.current;
    if (!dialog) return;
    if (detailHorse && !dialog.open) dialog.showModal();
    if (!detailHorse && dialog.open) dialog.close();
  }, [detailHorse]);
  useEffect(() => { setDetailHorse(null); }, [address]);
  useEffect(() => {
    if (mintSeasonKey !== "all" && !selectedMintSeason) setMintSeasonKey("all");
  }, [mintSeasonKey, selectedMintSeason]);
  const scannedPages = qualifyingQuery.data?.pages.length ?? 0;
  const scanComplete = Boolean(address && scannedPages > 0 && !qualifyingQuery.hasNextPage &&
    !qualifyingQuery.isFetching && !qualifyingQuery.isError);
  useEffect(() => {
    if (!address || !qualifyingQuery.hasNextPage || qualifyingQuery.isFetching || qualifyingQuery.isError) return;
    void qualifyingQuery.fetchNextPage();
  }, [address, scannedPages, qualifyingQuery.hasNextPage, qualifyingQuery.isFetching, qualifyingQuery.isError]);
  const selectedHorse = qualifyingHorses.find((horse) => `${horse.contract}:${horse.tokenId}` === selectedKey);
  const selected = owned.find((token) => `${token.contract}:${token.tokenId}` === selectedKey) ??
    (selectedHorse && address ? { contract: selectedHorse.contract, tokenId: selectedHorse.tokenId,
      name: selectedHorse.name ?? undefined, balance: selectedHorse.balance, walletAddress: address } : null);
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

  async function withFreshHoldings(operation: () => Promise<unknown>) {
    refreshHoldings.current = true;
    try { await operation(); } finally { refreshHoldings.current = false; }
  }

  function refreshStable() {
    if (!address) return;
    void withFreshHoldings(() => Promise.allSettled([
      ownedQuery.refetch(), qualifyingQuery.refetch(), selectionsQuery.refetch(),
    ]));
  }

  function retryHorseScan() {
    void withFreshHoldings(() => qualifyingQuery.isFetchNextPageError
      ? qualifyingQuery.fetchNextPage() : qualifyingQuery.refetch());
  }

  return <Shell id="horf-personal-stable" data-horf-region="personal-stable" aria-label="Your horse stable and rider profile">
    <WalletGuide data-horf-stable-wallet-status>
      {address ? <><strong>{user ? linkedWalletsQuery.isPending ? "Checking WTF OS wallet link" : linkedWalletsQuery.isError ? "WTF OS link status unavailable" : linkedHere ? "WTF OS linked · browser wallet selected" : "Browser wallet selected · not linked to WTF OS" : "Verified Horf wallet selected"}</strong><code title={address}>{shortAddress(address)}</code>{user && !linkedWalletsQuery.isPending && !linkedWalletsQuery.isError && !linkedHere && <span>Reconnect to verify and link.</span>} <Action data-horf-stable-reconnect type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Switch wallet"}</Action>{linkedWalletsQuery.isError && <Action type="button" onClick={() => void linkedWalletsQuery.refetch()}>Retry link check</Action>}</>
        : <><strong>No wallet selected.</strong> {user && linkedWallets.length ? `Your WTF OS account has ${linkedWallets.length} linked ${linkedWallets.length === 1 ? "wallet" : "wallets"}, but none is selected in this browser. ` : ""}Connect your Tezos wallet to see its horses and profile. <Action data-horf-profile-connect type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : user ? "Connect a linked wallet" : "Connect and verify wallet"}</Action></>}
    </WalletGuide>
    {address && <HorfProfileEditor address={address} seasonKey={seasonKey} seasonLabel={seasonLabel} />}
    <Header>
      <div><small>Your paddock · 🪢</small><h2>{address ? "Wallet horses" : "Your stable & profile"} <span aria-hidden="true">🐎</span></h2><p>{address ? "Current holdings that pass Horf’s horse test." : "Connect a wallet above to open your stable."}</p></div>
      <Action data-horf-stable-refresh type="button" onClick={refreshStable} disabled={!address || ownedQuery.isFetching || qualifyingQuery.isFetching || selectionsQuery.isFetching}>Refresh stable</Action>
    </Header>
    {address && <Panel data-horf-qualifying-horses>
      <MintFilter data-horf-mint-season-filter>
        <label htmlFor="horf-mint-season">Mint season
          <select id="horf-mint-season" data-horf-mint-season value={mintSeasonKey} onChange={(event) => {
            setMintSeasonKey(event.currentTarget.value);
            logClientSystemEvent({ eventType: "horf.stable.mint_season_selected", message: "Horf Stable mint season selected", metadata: { mintSeasonKey: event.currentTarget.value, address } });
          }}>
            <option value="all">All horses</option>
            {mintSeasons.map((season) => <option key={season.key} value={season.key}>{season.label}</option>)}
          </select>
        </label>
        <small>Mint date sets the season. Unknown dates appear under All horses.</small>
      </MintFilter>
      {!qualifyingQuery.isError && !scanComplete && <p data-horf-stable-scan-progress role="status">Scanning wallet holdings… {scannedPages} {scannedPages === 1 ? "page" : "pages"} checked · {qualifyingHorses.length} {qualifyingHorses.length === 1 ? "horse" : "horses"} found.</p>}
      {qualifyingQuery.isError && <Note $error role="alert">Horse scan paused after {scannedPages} {scannedPages === 1 ? "page" : "pages"}. {qualifyingQuery.error instanceof Error ? qualifyingQuery.error.message : "The Mainnet horse index is unavailable."} Horses already found remain below. <Action data-horf-stable-scan-retry type="button" onClick={retryHorseScan}>Retry horse scan</Action> <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Switch wallet"}</Action></Note>}
      {visibleHorses.length > 0 && <HorseGallery>{visibleHorses.map((horse, index) => {
        const art = resolveHorfHorseCardArt(horse, uniqueThumbnails);
        const video = resolveHorfHorseVideo(horse);
        const name = horse.name || `Horse token #${horse.tokenId}`;
        const mintedSeason = findHorfMintSeason(horse, mintSeasons);
        return <article key={`${horse.contract}:${horse.tokenId}`} data-horf-stable-horse>
          <div className="art"><button className="art-open" type="button" aria-label={`View ${name} horse card`} onClick={() => setDetailHorse(horse)}>{video ? <StableVideoPreview src={video.src} /> : art ? <img src={art.src} alt={`${name} artwork`} loading={index === 0 ? "eager" : "lazy"} decoding="async" fetchPriority={index === 0 ? "high" : "auto"} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) event.currentTarget.style.display = "none"; }} /> : <img src="/horf-art/horse-gallop-photo.jpg" alt="Horse photograph placeholder; exact token preview unavailable" loading={index === 0 ? "eager" : "lazy"} decoding="async" />}</button></div>
          <div className="copy"><h4><button className="title-open" type="button" onClick={() => setDetailHorse(horse)}>{name}</button></h4>{mintedSeason && <MintBadge data-horf-mint-badge><img src="/horf-art/horseshoe.svg" alt="" aria-hidden="true" />{mintedSeason.label}</MintBadge>}<p data-horf-edition-holdings>You own {horse.balance} {horse.balance === "1" ? "edition" : "editions"} · {shortAddress(horse.contract)} / #{horse.tokenId}</p>
            <a href={objktTokenUrl(horse.contract, horse.tokenId)} target="_blank" rel="noopener noreferrer">View horse on Objkt ↗</a>
            <button data-horf-stable-view-horse type="button" onClick={() => setDetailHorse(horse)}>View horse card</button>
            <button type="button" onClick={() => setSelectedKey(`${horse.contract}:${horse.tokenId}`)}>Select for inspection</button>
          </div>
        </article>;
      })}</HorseGallery>}
      <StableHorseDetail ref={detailRef} data-horf-stable-horse-detail aria-label="Horse card" onClose={() => setDetailHorse(null)} onClick={(event) => { if (event.target === event.currentTarget) setDetailHorse(null); }}>
        {detailHorse && <><div className="detail-head"><div><small>🐎 Your horse card</small><h3>{detailHorse.name || `Horse token #${detailHorse.tokenId}`}</h3></div><Action type="button" onClick={() => setDetailHorse(null)}>Close horse card</Action></div>
          <div className="detail-grid"><div className="detail-art">{resolveHorfHorseVideo(detailHorse) ? <video key={`${detailHorse.contract}/${detailHorse.tokenId}`} src={resolveHorfHorseVideo(detailHorse)!.src} controls playsInline preload="metadata" aria-label={`${detailHorse.name || `Horse token #${detailHorse.tokenId}`} video artwork`} /> : resolveHorfHorseArt(detailHorse) ? <img key={`${detailHorse.contract}/${detailHorse.tokenId}`} src={resolveHorfHorseArt(detailHorse)!.src} alt={`${detailHorse.name || `Horse token #${detailHorse.tokenId}`} artwork`} onError={(event) => { const resolved = resolveHorfHorseArt(detailHorse); if (!resolved || !advanceResolvedMediaFallback(event.currentTarget, resolved)) event.currentTarget.style.display = "none"; }} /> : <span>Token preview unavailable</span>}</div><div><p><strong>You own:</strong> {detailHorse.balance} {detailHorse.balance === "1" ? "edition" : "editions"}</p><p><strong>Token:</strong> {detailHorse.contract} / #{detailHorse.tokenId}</p>{detailHorse.mintedAt && <p><strong>Minted:</strong> {new Date(detailHorse.mintedAt).toLocaleDateString()}</p>}<p><a href={objktTokenUrl(detailHorse.contract, detailHorse.tokenId)} target="_blank" rel="noopener noreferrer">View exact token on Objkt ↗</a></p></div></div>
        </>}
      </StableHorseDetail>
      {scanComplete && <p data-horf-stable-scan-complete role="status">{visibleHorses.length ? `Showing ${visibleHorses.length} ${visibleHorses.length === 1 ? "horse" : "horses"} · scan complete.` : mintSeasonKey === "all" ? "Scan complete. No qualifying horses found in this wallet." : `Scan complete. No held horses minted in ${selectedMintSeason?.label ?? "this season"}.`}</p>}
    </Panel>}
    <Columns>
      <Panel data-horf-personal-owned>
        <h3>Inspection lineup</h3>
        <form onSubmit={searchOwned}><label htmlFor="horf-personal-search">Find a token by name, contract, or ID</label><Row><input id="horf-personal-search" data-horf-personal-search value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} disabled={!address} /><Action type="submit" disabled={!address}>Search</Action></Row></form>
        <label htmlFor="horf-personal-owned">Select an indexed token</label>
        <select id="horf-personal-owned" data-horf-personal-token value={selected ? selectedKey : ""} onChange={(event) => setSelectedKey(event.target.value)} disabled={!address || busy}>
          <option value="">{ownedQuery.isPending && address ? "Loading wallet tokens…" : "Choose a token"}</option>
          {selected && !owned.some((token) => token.contract === selected.contract && token.tokenId === selected.tokenId) && <option value={selectedKey}>{selected.name || `Token #${selected.tokenId}`} · {selected.balance} owned</option>}
          {owned.map((token) => <option key={`${token.contract}:${token.tokenId}`} value={`${token.contract}:${token.tokenId}`}>{token.name || `Token #${token.tokenId}`} · {token.balance} owned</option>)}
        </select>
        {ownedQuery.hasNextPage && <Action type="button" onClick={() => void ownedQuery.fetchNextPage()} disabled={ownedQuery.isFetchingNextPage}>{ownedQuery.isFetchingNextPage ? "Loading…" : "More wallet tokens"}</Action>}
        {ownedQuery.isError && <Note $error role="alert">The extra token picker is unavailable. Horses found above can still be selected for inspection. <Action type="button" onClick={() => void withFreshHoldings(() => ownedQuery.refetch())}>Retry token picker</Action></Note>}
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
            {art ? <SavedHorseArt src={art.src} alt={`${name} artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) { event.currentTarget.src = "/horf-art/horse-portrait-photo.jpg"; event.currentTarget.style.objectFit = "cover"; event.currentTarget.alt = "Horse photograph placeholder"; } }} /> : <SavedHorseGlyph aria-hidden="true"><img src="/horf-art/horse-portrait-photo.jpg" alt="" /></SavedHorseGlyph>}
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
