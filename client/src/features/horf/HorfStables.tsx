import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, isApiRequestError } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { toNatString } from "../../lib/tezos/nat";
import { objktTokenUrl as tokenUrl, parseObjktToken } from "./token-input";
import { uniqueHorfThumbnailIdentities } from "./horse-media";
import { HorfEscrowArtwork } from "./HorfEscrowArtwork";
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
  token?: {
    contract: string;
    tokenId: string;
    name: string | null;
    image: string | null;
    artifactUri: string | null;
    mime: string | null;
  } | null;
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
type DepositReview = {
  address: string;
  contract: { contractAddress: string; chainId: string };
  mode: HorfStableMode;
  rows: Array<HorfSelectedDeposit & { name: string }>;
};
type TradeTarget = { listingId: string; mode: HorfStableMode; name: string };
type InspectionStatus = { status: "none" | "pending" | "approved" | "rejected" | "revoked"; reason: string | null };
type OwnedHorse = {
  contract: string;
  tokenId: string;
  balance: string;
  name: string | null;
  approvedForMarshalsMarket: boolean;
};
type OwnedHorsePage = {
  address: string;
  items: OwnedHorse[];
  pagination: { hasMore: boolean; nextOffset: number };
};
function parseOwnedHorsePage(value: unknown, address: string): OwnedHorsePage {
  const page = value as Partial<OwnedHorsePage> | null;
  if (!page || page.address !== address || !Array.isArray(page.items) ||
      page.items.some((horse) => !horse || typeof horse.contract !== "string" ||
        typeof horse.tokenId !== "string" || typeof horse.balance !== "string" ||
        (horse.name !== null && typeof horse.name !== "string") ||
        typeof horse.approvedForMarshalsMarket !== "boolean") ||
      !page.pagination || typeof page.pagination.hasMore !== "boolean" ||
      !Number.isSafeInteger(page.pagination.nextOffset) || page.pagination.nextOffset < 0) {
    throw new Error("Approved wallet horses could not be read. Refresh and try again.");
  }
  return page as OwnedHorsePage;
}
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
    rule: "Each distinct FA2 horse token earns 30 claims, however many editions you deposit. More of the same token adds horses, not credits. Claim each other token once.",
    credit: "30 claims per distinct token",
  },
];

const Board = styled.section`
  margin-top: clamp(36px, 5vw, 68px);
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--horf-ink, #f4ead6);
  font-family: var(--horf-font, "Avenir Next", "Segoe UI", sans-serif);
  h2 { margin: 8px 0 10px; font: 700 clamp(30px, 4cqw, 48px)/1.06 var(--horf-display, Georgia, serif); letter-spacing: -0.025em; text-wrap: balance; }
  h3 { margin: 0 0 10px; font-size: 21px; letter-spacing: -0.02em; }
  p { line-height: 1.55; }
  button, input, select { font: inherit; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {
    outline: 3px solid var(--horf-teal, #71b7a0);
    outline-offset: 2px;
  }
`;

const Eyebrow = styled.div`
  color: var(--horf-teal, #71b7a0);
  font: 800 12px/1.2 var(--horf-font, "Avenir Next", sans-serif);
  text-transform: uppercase;
  letter-spacing: 0.13em;
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
  > p { max-width: 62ch; margin: 0; color: var(--horf-muted, #b7b5a7); font-size: 15px; }
`;

const SmallButton = styled.button<{ $strong?: boolean }>`
  min-height: 40px;
  padding: 9px 15px;
  border: 1px solid ${(p) => p.$strong ? "var(--horf-gold, #d8a34a)" : "var(--horf-line, #3d5148)"};
  border-radius: 999px;
  color: ${(p) => p.$strong ? "#241a0f" : "var(--horf-ink, #f4ead6)"};
  background: ${(p) => p.$strong ? "var(--horf-gold, #d8a34a)" : "var(--horf-surface, #1b2723)"};
  cursor: pointer;
  font: 750 13px/1.2 var(--horf-font, "Avenir Next", sans-serif) !important;
  transition: background 160ms ease, transform 160ms ease;
  &:hover:not(:disabled) { background: ${(p) => p.$strong ? "#edbb61" : "var(--horf-field, #24332d)"}; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover:not(:disabled) { transform: none; } }
`;

const Status = styled.div<{ $warn?: boolean }>`
  margin-top: 13px;
  padding: 12px 14px;
  border: 1px solid ${(p) => p.$warn ? "#8b5c50" : "#477663"};
  border-radius: 12px;
  background: ${(p) => p.$warn ? "#3b2723" : "#1d3932"};
  color: var(--horf-ink, #f4ead6);
  font: 600 13px/1.5 var(--horf-font, "Avenir Next", sans-serif);
  overflow-wrap: anywhere;
  a { color: #f0aa88; }
`;

const StableTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 24px;
  @container (max-width: 660px) { grid-template-columns: 1fr; }
`;

const StableTab = styled.button<{ $selected: boolean }>`
  min-width: 0;
  min-height: 118px;
  padding: 17px 18px;
  border: 1px solid ${(p) => p.$selected ? "var(--horf-teal, #71b7a0)" : "var(--horf-line, #3d5148)"};
  border-radius: 14px;
  background: ${(p) => p.$selected ? "var(--horf-field, #24332d)" : "var(--horf-surface, #1b2723)"};
  color: ${(p) => p.$selected ? "#f5fffb" : "var(--horf-ink, #f4ead6)"};
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, transform 160ms ease;
  small { display: block; color: ${(p) => p.$selected ? "#83d6c8" : "var(--horf-teal, #71b7a0)"}; font: 800 11px/1.2 var(--horf-font, "Avenir Next", sans-serif); letter-spacing: .1em; }
  strong { display: block; margin: 9px 0 5px; font: 700 19px/1.12 var(--horf-display, Georgia, serif); }
  span { display: block; font-size: 13px; line-height: 1.4; }
  &:hover:not(:disabled) { transform: translateY(-2px); border-color: var(--horf-teal, #71b7a0); }
  &:disabled { cursor: wait; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover:not(:disabled) { transform: none; } }
`;

const CreditStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0 0;
  span { padding: 8px 12px; border: 1px solid var(--horf-line, #3d5148); border-radius: 999px; background: var(--horf-surface, #1b2723); font: 700 13px/1.25 var(--horf-font, "Avenir Next", sans-serif); }
`;

const Inside = styled.div<{ $single: boolean }>`
  display: grid;
  grid-template-columns: ${(props) => props.$single ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)"};
  gap: 18px;
  margin-top: 20px;
  @container (max-width: 760px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 14px;
  background: var(--horf-surface, #1b2723);
  > p { margin: 0 0 14px; color: var(--horf-muted, #b7b5a7); font-size: 14px; }
  label { display: block; margin: 0 0 6px; font: 700 13px/1.25 var(--horf-font, "Avenir Next", sans-serif); }
  input, select {
    width: 100%;
    min-height: 42px;
    min-width: 0;
    padding: 9px 11px;
    border: 1px solid var(--horf-line, #3d5148);
    border-radius: 9px;
    color: var(--horf-ink, #f4ead6);
    background: var(--horf-field, #24332d);
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
    border-top: 1px solid var(--horf-line, #3d5148);
  }
  strong, small { display: block; overflow-wrap: anywhere; }
  strong { font-size: 13px; }
  small { margin-top: 2px; color: var(--horf-muted, #b7b5a7); font: 12px/1.3 var(--horf-font, "Avenir Next", sans-serif); }
  @container (max-width: 480px) { li { grid-template-columns: minmax(0, 1fr) 72px; } li button { grid-column: 1 / -1; } }
`;

const ReviewList = styled.ul`
  list-style: none;
  margin: 12px 0;
  padding: 0;
  li { padding: 10px 0; border-top: 1px solid var(--horf-line, #3d5148); overflow-wrap: anywhere; }
  strong, small { display: block; }
  small { margin-top: 4px; color: var(--horf-muted, #b7b5a7); }
`;

const ReviewPanel = styled.section`
  margin-top: 16px;
  padding: 18px;
  border: 1px solid var(--horf-gold, #d8a34a);
  border-radius: 14px;
  background: var(--horf-field, #24332d);
  overflow-wrap: anywhere;
`;

const ListingList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
  gap: 14px;
  li { min-width: 0; overflow: hidden; border: 1px solid var(--horf-line, #3d5148); border-radius: 12px; background: var(--horf-field, #24332d); }
  strong { display: block; font-size: 14px; overflow-wrap: anywhere; }
  small { display: block; margin: 4px 0 9px; color: var(--horf-muted, #b7b5a7); font: 12px/1.4 var(--horf-font, "Avenir Next", sans-serif); overflow-wrap: anywhere; }
  p { margin: 5px 0 0; font-size: 12px; }
`;

const ListingPreview = styled.a`
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #101816;
  color: var(--horf-muted, #b7b5a7);
  text-decoration: none;
  img, video { width: 100%; height: 100%; object-fit: contain; display: block; }
  span { padding: 12px; text-align: center; font-size: 13px; }
  &:hover { box-shadow: inset 0 0 0 2px var(--horf-teal, #71b7a0); }
`;

const ListingCopy = styled.div`
  padding: 13px;
  > strong a { color: var(--horf-ink, #f4ead6); text-decoration: none; }
  > strong a:hover { color: var(--horf-teal, #71b7a0); text-decoration: underline; }
`;

const ListingActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 7px;
  label { width: 92px; margin: 0; }
`;

const TradeGuide = styled.div`
  margin: 0 0 18px;
  padding: 15px;
  border: 1px solid var(--horf-gold, #d8a34a);
  border-radius: 12px;
  background: #302d22;
  strong { display: block; margin-bottom: 6px; color: var(--horf-ink, #f4ead6); font: 700 17px/1.2 var(--horf-display, Georgia, serif); }
  p { margin: 0 0 10px; color: var(--horf-ink, #f4ead6); font-size: 13px; line-height: 1.45; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
`;

function StableHorsePreview({ listing, uniqueThumbnails }: { listing: StableListing; uniqueThumbnails: ReadonlySet<string> }) {
  const token = listing.token;
  const media = token && token.contract === listing.tokenContract && token.tokenId === listing.tokenId
    ? token : null;
  const name = media?.name?.trim() || `Horse token #${listing.tokenId}`;

  return <ListingPreview data-horf-stable-preview="" href={tokenUrl(listing.tokenContract, listing.tokenId)} target="_blank" rel="noopener noreferrer" aria-label={`View ${name} on Objkt`}>
    <HorfEscrowArtwork key={`${media?.image}:${media?.artifactUri}`} contract={listing.tokenContract} tokenId={listing.tokenId}
      name={name} media={media} uniqueThumbnails={uniqueThumbnails} />
  </ListingPreview>;
}

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
  legacyReadOnly = false,
}: {
  address: string | null;
  connectWallet: () => Promise<void>;
  isConnecting: boolean;
  /** Old Mainnet escrow remains claimable and cancellable after new deposits close. */
  legacyReadOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<HorfStableMode>(0);
  const [rows, setRows] = useState<Record<HorfStableMode, DepositRow[]>>({ 0: [], 1: [], 2: [] });
  const [nextRowId, setNextRowId] = useState(1);
  const [ownedSearchDraft, setOwnedSearchDraft] = useState("");
  const [ownedSearch, setOwnedSearch] = useState("");
  const [selectedOwned, setSelectedOwned] = useState("");
  const [objktInput, setObjktInput] = useState("");
  const [checkingObjkt, setCheckingObjkt] = useState(false);
  const [cancelAmounts, setCancelAmounts] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [permitScopeDenied, setPermitScopeDenied] = useState<"restricted" | "unverified" | null>(null);
  const [success, setSuccess] = useState<{ action: string; opHash: string } | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [depositReview, setDepositReview] = useState<DepositReview | null>(null);
  const [reviewingDeposit, setReviewingDeposit] = useState(false);
  const [tradeTarget, setTradeTarget] = useState<TradeTarget | null>(null);
  const [showManagement, setShowManagement] = useState(false);
  const depositPanelRef = useRef<HTMLDivElement>(null);

  const snapshotQuery = useQuery({
    queryKey: ["horf", legacyReadOnly ? "stables-legacy" : "stables-market", address],
    queryFn: () => api.get<StableSnapshot>(legacyReadOnly
      ? `/api/horf/stables${address ? `?address=${encodeURIComponent(address)}` : ""}`
      : `/api/horf/stables?market=1${address ? `&address=${encodeURIComponent(address)}` : ""}`),
    refetchOnWindowFocus: true,
  });
  const snapshot = snapshotQuery.data;
  const managementQuery = useQuery({
    queryKey: ["horf", "stables-management", address],
    queryFn: () => api.get<StableSnapshot>(`/api/horf/stables?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address && showManagement && !legacyReadOnly),
    refetchOnWindowFocus: true,
  });
  const configured = !snapshotQuery.isError && snapshot?.status === "ready" && snapshot.network === "mainnet" &&
    snapshot.chainId === HORF_STABLES_CHAIN_ID &&
    Boolean(snapshot.contractAddress && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(snapshot.contractAddress));
  const depositReady = !legacyReadOnly && configured && snapshot?.permitReady === true && snapshot?.custodyReady === true;
  const contract = configured ? { contractAddress: snapshot!.contractAddress!, chainId: snapshot!.chainId } : null;
  const ownedQuery = useInfiniteQuery({
    queryKey: ["horf", "trader-profile-horses", address],
    queryFn: ({ pageParam }) => api.get<unknown>(`/api/horf/traders/${encodeURIComponent(address!)}/horses?offset=${pageParam}`)
      .then((page) => parseOwnedHorsePage(page, address!)),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.pagination.hasMore ? lastPage.pagination.nextOffset : undefined,
    enabled: Boolean(address && showManagement && !legacyReadOnly),
    refetchOnWindowFocus: true,
  });
  const scannedOwnedPages = ownedQuery.data?.pages.length ?? 0;
  useEffect(() => {
    if (!address || legacyReadOnly || !showManagement || !ownedQuery.hasNextPage || ownedQuery.isFetching || ownedQuery.isError) return;
    void ownedQuery.fetchNextPage();
  }, [address, legacyReadOnly, showManagement, scannedOwnedPages, ownedQuery.hasNextPage, ownedQuery.isFetching, ownedQuery.isError]);
  const ownedTokens = useMemo(
    () => (ownedQuery.data?.pages.flatMap((page) => page.items) ?? []).filter((token) =>
      token.approvedForMarshalsMarket && isPositive(token.balance) &&
      (!ownedSearch || `${token.name ?? ""} ${token.contract} ${token.tokenId}`.toLowerCase().includes(ownedSearch.toLowerCase()))),
    [ownedQuery.data, ownedSearch],
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
  const targetListing = tradeTarget && (snapshot?.listings ?? []).find((listing) =>
    listing.id === tradeTarget.listingId && listing.mode === tradeTarget.mode && isPositive(listing.remaining));
  const targetHasCredit = tradeTarget?.mode === 0 ? creditsAboveZero(snapshot?.reciprocalCredits)
    : tradeTarget?.mode === 2 ? creditsAboveZero(snapshot?.groupCredits) : true;
  const ownListings = (managementQuery.data?.listings ?? []).filter((listing) =>
    listing.mode === mode && listing.owner === address && isPositive(listing.remaining));
  const uniqueThumbnails = useMemo(() => uniqueHorfThumbnailIdentities(
    [...(snapshot?.listings ?? []), ...(managementQuery.data?.listings ?? [])]
      .map((listing) => listing.token)
      .filter((token): token is NonNullable<StableListing["token"]> => Boolean(token)),
  ), [snapshot?.listings, managementQuery.data?.listings]);
  const busy = pending !== null;

  useEffect(() => {
    if (!tradeTarget || !showManagement || !depositPanelRef.current) return;
    depositPanelRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
    (document.getElementById("horf-owned-token") ?? depositPanelRef.current).focus({ preventScroll: true });
  }, [tradeTarget, showManagement, address]);

  useEffect(() => {
    if (!tradeTarget || tradeTarget.mode !== mode || !targetHasCredit || !targetListing || busy) return;
    const claimButton = depositPanelRef.current?.querySelector<HTMLButtonElement>("[data-horf-stable-target-claim]");
    claimButton?.scrollIntoView({ block: "center", behavior: "smooth" });
    claimButton?.focus({ preventScroll: true });
  }, [tradeTarget, mode, targetHasCredit, targetListing, busy]);

  function startTrade(listing: StableListing) {
    setMode(listing.mode);
    setTradeTarget({ listingId: listing.id, mode: listing.mode,
      name: listing.token?.name?.trim() || `Horse token #${listing.tokenId}` });
    setShowManagement(true);
    setDepositReview(null);
    setFormError(null);
    setActionError(null);
    if (!address) void connectWallet();
  }

  function addRow(contractAddress: string, tokenId: string, name: string) {
    setDepositReview(null);
    setFormError(null);
    const normalizedId = toNatString(tokenId);
    if (rows[mode].some((row) => row.tokenContract === contractAddress && row.tokenId === normalizedId)) {
      setFormError("This token is already in the deposit. Increase its edition amount on that row.");
      return;
    }
    setRows((current) => ({
      ...current,
      [mode]: [...current[mode], { id: nextRowId, tokenContract: contractAddress, tokenId: normalizedId, amount: "0", name }],
    }));
    setNextRowId((id) => id + 1);
  }

  async function addObjkt(event: FormEvent) {
    event.preventDefault();
    if (!address || !depositReady || busy || checkingObjkt) return;
    setCheckingObjkt(true);
    setFormError(null);
    try {
      const token = parseObjktToken(objktInput);
      if (rows[mode].some((row) => row.tokenContract === token.contract && row.tokenId === token.tokenId)) {
        throw new Error("This token is already in the deposit. Increase its edition amount on that row.");
      }
      const params = new URLSearchParams({ contract: token.contract, tokenId: token.tokenId });
      const inspection = await api.get<InspectionStatus>(`/api/horf/inspections/status?${params}`);
      if (inspection.status !== "approved") throw new Error("This horse needs active Marshal approval before it can enter a Stable.");
      const eligibility = await api.get<{ eligible: boolean; token?: { name?: string | null } }>(`/api/horf/token-eligibility?${params}`);
      if (eligibility.eligible !== true) throw new Error("This token does not pass Horf’s horse test.");
      addRow(token.contract, token.tokenId, eligibility.token?.name?.trim() || `Token #${token.tokenId}`);
      setObjktInput("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "That Objkt horse could not be checked.");
    } finally { setCheckingObjkt(false); }
  }

  function changeRow(id: number, amount: string) {
    setDepositReview(null);
    setFormError(null);
    setRows((current) => ({ ...current, [mode]: current[mode].map((row) => row.id === id ? { ...row, amount } : row) }));
  }

  function removeRow(id: number) {
    setDepositReview(null);
    setFormError(null);
    setRows((current) => ({ ...current, [mode]: current[mode].filter((row) => row.id !== id) }));
  }

  function progress(action: PendingAction["action"]) {
    return {
      onStage: (stage: Exclude<PendingAction["stage"], "eligibility">) => setPending((current) => ({ action, stage, opHash: current?.opHash ?? null })),
      onSubmitted: (opHash: string) => setPending((current) => ({ action, stage: "confirming", opHash: current?.opHash ?? opHash })),
    };
  }

  async function reviewDeposit(event: FormEvent) {
    event.preventDefault();
    if (!address || !contract || !depositReady || busy || reviewingDeposit) return;
    setFormError(null);
    setActionError(null);
    setPermitScopeDenied(null);
    setSuccess(null);
    setReviewingDeposit(true);
    try {
      const selected = rows[mode].map((row) => ({
        tokenContract: row.tokenContract,
        tokenId: toNatString(row.tokenId),
        amount: positiveAmount(row.amount),
        name: row.name,
      }));
      if (!selected.length) throw new Error("Add at least one eligible horse token to this stable.");
      const inspectionResults = await Promise.all(selected.map((row) => qc.fetchQuery({
        queryKey: ["horf", "inspection-status", row.tokenContract, row.tokenId],
        queryFn: () => api.get<InspectionStatus>(`/api/horf/inspections/status?contract=${encodeURIComponent(row.tokenContract)}&tokenId=${encodeURIComponent(row.tokenId)}`),
        staleTime: 0,
      })));
      if (inspectionResults.some((inspection) => inspection.status !== "approved")) {
        throw new Error("Every horse in this deposit needs active Marshal approval.");
      }
      setDepositReview({ address, contract, mode, rows: selected });
    } catch (error) {
      setDepositReview(null);
      setFormError(error instanceof Error ? error.message : "Check the horse editions before continuing.");
    } finally { setReviewingDeposit(false); }
  }

  async function deposit() {
    const review = depositReview;
    if (!review || busy) return;
    const unchanged = contract !== null && address === review.address && contract.contractAddress === review.contract.contractAddress &&
      contract.chainId === review.contract.chainId && mode === review.mode && depositReady &&
      rows[mode].length === review.rows.length && rows[mode].every((row, index) =>
        row.tokenContract === review.rows[index].tokenContract && row.tokenId === review.rows[index].tokenId &&
        row.name === review.rows[index].name && toNatString(row.amount) === review.rows[index].amount);
    if (!unchanged) {
      setDepositReview(null);
      setFormError("The wallet, stable, or horse editions changed. Review the deposit again.");
      return;
    }
    setActionError(null);
    setPermitScopeDenied(null);
    setSuccess(null);
    let submittedHash: string | null = null;
    try {
      setPending({ action: "deposit", stage: "eligibility", opHash: null });
      const authorized: HorfAuthorizedDeposit[] = [];
      for (const selection of review.rows) {
        const permit = await api.post<HorfDepositPermit>("/api/horf/stables/permit", {
          address: review.address,
          mode: review.mode,
          tokenContract: selection.tokenContract,
          tokenId: selection.tokenId,
          amount: selection.amount,
        });
        authorized.push({ selection, permit });
      }
      const handlers = progress("deposit");
      const opHash = await depositHorfHorses(review.address, review.contract, review.mode, authorized, {
        ...handlers,
        onSubmitted: (hash) => { submittedHash = hash; handlers.onSubmitted(hash); },
      });
      setRows((current) => ({ ...current, [review.mode]: [] }));
      setDepositReview(null);
      setSuccess({ action: `${STABLES[review.mode].name} deposit confirmed`, opHash });
      logClientSystemEvent({ eventType: "horf.stable.deposited", message: "Horse editions deposited in Horf Stable", metadata: { mode: STABLES[review.mode].key, tokenRows: review.rows.length, opHash } });
      void snapshotQuery.refetch();
      if (showManagement) void managementQuery.refetch();
    } catch (error) {
      if (isApiRequestError(error) && error.status === 403) {
        setPermitScopeDenied(/restricted|blacklist/i.test(error.message) ? "restricted" : "unverified");
      }
      setActionError(`${error instanceof Error ? error.message : "The horse deposit could not be completed."}${submittedHash ? " The transaction was submitted; check its explorer status before retrying." : ""}`);
      if (submittedHash) setDepositReview(null);
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
      logClientSystemEvent({ eventType: "horf.stable.claimed", message: "Horse claimed from Horf Stable", metadata: { mode: STABLES[listing.mode].key, listingId: listing.id, opHash } });
      void snapshotQuery.refetch();
      if (showManagement) void managementQuery.refetch();
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
      logClientSystemEvent({ eventType: "horf.stable.cancelled", message: "Horse listing cancelled in Horf Stable", metadata: { mode: STABLES[listing.mode].key, listingId: listing.id, amount, opHash } });
      void snapshotQuery.refetch();
      if (showManagement) void managementQuery.refetch();
    } catch (error) {
      setActionError(`${error instanceof Error ? error.message : "The listing could not be cancelled."}${submittedHash ? " The transaction was submitted; check its explorer status before retrying." : ""}`);
    } finally {
      setPending(null);
    }
  }

  if (legacyReadOnly) {
    const legacyListings = (snapshot?.listings ?? []).filter((listing) => isPositive(listing.remaining));
    return <Board id="horf-legacy-stables" data-horf-region="legacy-stables" aria-label="Legacy Horf escrow recovery">
      <Header>
        <div>
          <Eyebrow>Old escrow · Tezos Mainnet</Eyebrow>
          <h2>Legacy stable recovery</h2>
          <p>New deposits are closed. Existing claim credits and owner cancellations still work.</p>
        </div>
        <SmallButton type="button" onClick={() => void snapshotQuery.refetch()} disabled={snapshotQuery.isFetching}>Refresh old escrow</SmallButton>
      </Header>
      {snapshotQuery.isPending && <Status role="status">Reading the old stable contract…</Status>}
      {snapshotQuery.isError && <Status $warn role="alert">The old escrow ledger is unavailable. Refresh before claiming or cancelling.</Status>}
      {snapshot?.status === "unconfigured" && <Status $warn role="alert">The old Mainnet escrow contract is not configured. Existing horses cannot be recovered here until its connection is restored.</Status>}
      {snapshot?.status === "ready" && !configured && <Status $warn role="alert">The old escrow contract does not match Tezos Mainnet. Transactions are disabled.</Status>}
      {configured && <Status role="status">Old contract <a href={`https://tzkt.io/${contract!.contractAddress}`} target="_blank" rel="noopener noreferrer">{shortAddress(contract!.contractAddress)}</a> · {formatSnapshot(snapshot!.asOf)}</Status>}
      {!address && <Status $warn>Connect your wallet to use an existing claim credit or return horses you listed. <SmallButton type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet"}</SmallButton></Status>}
      {address && <CreditStrip data-horf-legacy-credits>
        <span>Unused Reciprocal claims: {snapshot?.reciprocalCredits ?? "Loading…"}</span>
        <span>Unused former Group claims: {snapshot?.groupCredits ?? "Loading…"}</span>
      </CreditStrip>}
      <Status $warn data-horf-legacy-risk-note>Historical horse listings may no longer have Marshal approval. Check the token and trader before claiming.</Status>
      <Panel data-horf-legacy-listings>
        <Eyebrow>Still in old escrow</Eyebrow>
        <h3>Remaining horses</h3>
        {legacyListings.length ? <ListingList>{legacyListings.map((listing) => {
          const own = address === listing.owner;
          const alreadyClaimed = listing.mode === 2 && listing.claimedByWallet === true;
          const hasCredit = listing.mode === 0 ? creditsAboveZero(snapshot?.reciprocalCredits)
            : listing.mode === 2 ? creditsAboveZero(snapshot?.groupCredits) : true;
          const modeLabel = listing.mode === 0 ? "Reciprocal" : listing.mode === 1 ? "Honor" : "Former Group";
          return <li key={listing.id} data-horf-legacy-listing data-horf-legacy-listing-id={listing.id}>
            <StableHorsePreview listing={listing} uniqueThumbnails={uniqueThumbnails} />
            <ListingCopy>
              <strong><a href={tokenUrl(listing.tokenContract, listing.tokenId)} target="_blank" rel="noopener noreferrer">{listing.token?.name?.trim() || `Horse token #${listing.tokenId}`}</a> · {listing.remaining} {listing.remaining === "1" ? "edition" : "editions"} left</strong>
              <small>{modeLabel} listing #{listing.id} · offered by <a href={`https://objkt.com/profile/${encodeURIComponent(listing.owner)}`} target="_blank" rel="noopener noreferrer">{own ? "you" : shortAddress(listing.owner)}</a></small>
              {own ? <>
                <ListingActions>
                  <label>Return editions<input aria-label={`Return editions from legacy listing ${listing.id}`} inputMode="numeric" pattern="[0-9]+" value={cancelAmounts[listing.id] ?? listing.remaining} onChange={(event) => setCancelAmounts((current) => ({ ...current, [listing.id]: event.target.value }))} disabled={!configured || busy} /></label>
                  <SmallButton data-horf-legacy-cancel type="button" onClick={() => void cancel(listing)} disabled={!configured || busy}>Return my editions</SmallButton>
                </ListingActions>
                {listing.mode !== 1 && <p>The old contract can return editions only while their claim credits remain unspent.</p>}
              </> : !address
                ? <SmallButton type="button" onClick={() => void connectWallet()} disabled={isConnecting}>Connect wallet to claim</SmallButton>
                : alreadyClaimed ? <p>Already claimed this token with this wallet.</p>
                : hasCredit ? <SmallButton data-horf-legacy-claim type="button" $strong onClick={() => void claim(listing)} disabled={!configured || busy}>Claim 1 horse</SmallButton>
                : <p>No unused claim credit on this old contract. New deposits are closed.</p>}
            </ListingCopy>
          </li>;
        })}</ListingList> : <p>{snapshotQuery.isPending ? "Reading old listings…" : snapshotQuery.isError ? "Old listings unavailable." : "No horse editions remain in this old escrow."}</p>}
      </Panel>
      {pending && <Status role="status" aria-live="polite">{pendingLabel(pending)} {pending.opHash && <a href={explorerUrl(pending.opHash)} target="_blank" rel="noopener noreferrer">View submitted transaction</a>}</Status>}
      {actionError && <Status $warn role="alert">{actionError}</Status>}
      {success && <Status role="status">{success.action}. <a href={explorerUrl(success.opHash)} target="_blank" rel="noopener noreferrer">View Tezos transaction</a>. The old escrow ledger may take a moment to update.</Status>}
    </Board>;
  }

  return (
    <Board id="horf-stables" data-horf-region="stables" aria-label="Horf's three horse trading stables">
      <Header>
        <div>
          <Eyebrow>Three ways to trade · Tezos Mainnet</Eyebrow>
          <h2>Horf Stables</h2>
          <p>Deposit or claim horse editions. Every Stable requires Marshal approval before deposit.</p>
        </div>
        <div><SmallButton data-horf-stable-manage-toggle type="button" onClick={() => setShowManagement((open) => !open)} aria-expanded={showManagement} aria-controls="horf-stable-management">{showManagement ? "Close my listings" : "List or manage my horses"}</SmallButton>{" "}<SmallButton type="button" onClick={() => void Promise.all([snapshotQuery.refetch(), ...(showManagement ? [managementQuery.refetch()] : [])])} disabled={snapshotQuery.isFetching}>Refresh stables</SmallButton></div>
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
            onClick={() => { setMode(stable.mode); setDepositReview(null); setFormError(null); setActionError(null); }}
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
      <Inside $single={!showManagement}>
        {showManagement && <Panel ref={depositPanelRef} tabIndex={-1} id="horf-stable-management" data-horf-stable-deposit>
          <Eyebrow>Offer a horse</Eyebrow>
          <h3>Deposit in {activeStable.name}</h3>
          <p>{activeStable.rule} Add several horses in one wallet transaction. Operator access is removed with it.</p>
          {tradeTarget?.mode === mode && <TradeGuide data-horf-stable-trade-guide data-horf-stable-trade-target={tradeTarget.listingId} role="status">
            <strong>Riding for {tradeTarget.name}</strong>
            <p>{mode === 0
              ? "Deposit a Marshal-approved horse to earn one claim per edition. Then claim this horse in a second wallet transaction. Your target is not reserved."
              : "Deposit a distinct Marshal-approved horse token to earn 30 Group claims. Then claim this horse in a second wallet transaction. Your target is not reserved."}</p>
            <p>Need an approval? <a href="/horf">Request inspection from My Stable ↗</a></p>
            <div className="actions">
              {targetHasCredit && targetListing
                ? <SmallButton data-horf-stable-target-claim type="button" $strong onClick={() => void claim(targetListing)} disabled={!configured || busy || (mode === 2 && targetListing.claimedByWallet === true)}>Claim {tradeTarget.name} now</SmallButton>
                : <SmallButton data-horf-stable-target-refresh type="button" onClick={() => void snapshotQuery.refetch()} disabled={snapshotQuery.isFetching}>Refresh credits & listing</SmallButton>}
              <SmallButton type="button" onClick={() => setTradeTarget(null)}>Choose another horse</SmallButton>
            </div>
            {!targetListing && !snapshotQuery.isPending && <p>This horse is no longer listed. Choose another from the stable.</p>}
            {targetListing?.claimedByWallet && mode === 2 && <p>You already claimed this token with this wallet.</p>}
          </TradeGuide>}
          {address ? (
            <>
              <form onSubmit={(event) => { event.preventDefault(); setOwnedSearch(ownedSearchDraft.trim()); setSelectedOwned(""); }}>
                <label htmlFor="horf-owned-search">Find an approved horse in this wallet</label>
                <InputAction>
                  <input id="horf-owned-search" value={ownedSearchDraft} onChange={(event) => setOwnedSearchDraft(event.target.value)} placeholder="Name, collection, contract…" />
                  <SmallButton type="submit">Search approved</SmallButton>
                </InputAction>
              </form>
              <label htmlFor="horf-owned-token">Marshal-approved horses you own · {shortAddress(address)}</label>
              <InputAction>
                <select id="horf-owned-token" data-horf-owned-select value={chosenOwned ? selectedOwned : ""} onChange={(event) => setSelectedOwned(event.target.value)}>
                  <option value="">{ownedQuery.isPending || ownedQuery.isFetchingNextPage ? "Checking approved horses…" : ownedTokens.length ? "Choose an approved horse" : "No approved horses found"}</option>
                  {ownedTokens.map((token) => (
                    <option key={`${token.contract}:${token.tokenId}`} value={`${token.contract}:${token.tokenId}`}>
                      {token.name || `Token #${token.tokenId}`} · {token.balance} owned
                    </option>
                  ))}
                </select>
                <SmallButton type="button" onClick={() => chosenOwned && addRow(chosenOwned.contract, chosenOwned.tokenId, chosenOwned.name || `Token #${chosenOwned.tokenId}`)} disabled={!chosenOwned || !depositReady || busy}>Add approved horse</SmallButton>
              </InputAction>
              {ownedQuery.isError && <p role="alert">Approved wallet horses could not be loaded. You can still paste an Objkt token link below.</p>}
              {ownedQuery.hasNextPage && <SmallButton type="button" onClick={() => void ownedQuery.fetchNextPage()} disabled={ownedQuery.isFetchingNextPage}>{ownedQuery.isFetchingNextPage ? "Loading…" : "Load more wallet horses"}</SmallButton>}
            </>
          ) : <p>Connect your wallet to prepare a deposit. You may still view all open stable listings.</p>}
          <form onSubmit={addObjkt}>
            <label htmlFor="horf-objkt-token">Or paste a Marshal-approved Objkt horse link</label>
            <InputAction>
              <input id="horf-objkt-token" data-horf-objkt-input value={objktInput} onChange={(event) => setObjktInput(event.target.value)} placeholder="https://objkt.com/tokens/KT1…/123" disabled={!address || !depositReady || busy || checkingObjkt} />
              <SmallButton type="submit" disabled={!address || !depositReady || busy || checkingObjkt || !objktInput.trim()}>{checkingObjkt ? "Checking approval…" : "Add approved Objkt horse"}</SmallButton>
            </InputAction>
          </form>
          <form onSubmit={reviewDeposit}>
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
            {!depositReview && <SmallButton data-horf-stable-submit type="submit" $strong disabled={!address || !depositReady || !allRowsApproved || busy || reviewingDeposit}>
              {reviewingDeposit ? "Checking approvals…" : "Review horse deposit"}
            </SmallButton>}
            <p>Set the edition count for each horse. Deposits require active inspection and enough editions. Tezos fees apply.</p>
          </form>
          {depositReview && depositReview.mode === mode && (
            <ReviewPanel data-horf-stable-review aria-label="Review horse deposit">
              <Eyebrow>Before the wallet opens</Eyebrow>
              <h3>Review horse deposit</h3>
              <p>{STABLES[depositReview.mode].name} · Tezos Mainnet · from {depositReview.address}</p>
              <ReviewList>
                {depositReview.rows.map((row) => (
                  <li key={`${row.tokenContract}:${row.tokenId}`} data-horf-stable-review-row>
                    <strong>{row.name} · {row.amount} {row.amount === "1" ? "edition" : "editions"}</strong>
                    <small>Token {row.tokenContract} / #{row.tokenId}</small>
                  </li>
                ))}
              </ReviewList>
              {depositReview.mode === 2 && <p data-horf-group-credit-rule>Each distinct FA2 token earns 30 claims, regardless of editions. More editions of a token already credited in Group Stable add no claims.</p>}
              <p>Escrow contract: {depositReview.contract.contractAddress}</p>
              <SmallButton data-horf-stable-review-confirm type="button" $strong onClick={() => void deposit()} disabled={busy || !depositReady || !allRowsApproved}>
                {busy && pending?.action === "deposit" ? "Deposit in progress…" : "Confirm and open wallet"}
              </SmallButton>{" "}
              <SmallButton data-horf-stable-review-back type="button" onClick={() => setDepositReview(null)} disabled={busy}>Back to edit</SmallButton>
            </ReviewPanel>
          )}
        </Panel>}

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
                    <StableHorsePreview key={`${listing.token?.image}:${listing.token?.artifactUri}`} listing={listing} uniqueThumbnails={uniqueThumbnails} />
                    <ListingCopy>
                    <strong><a href={tokenUrl(listing.tokenContract, listing.tokenId)} target="_blank" rel="noopener noreferrer">{listing.token?.name?.trim() || `Horse token #${listing.tokenId}`}</a> · {listing.remaining} {listing.remaining === "1" ? "edition" : "editions"} left</strong>
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
                        {!address
                          ? <SmallButton data-horf-stable-connect type="button" $strong onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet to claim"}</SmallButton>
                          : noCredit && !claimed
                            ? <SmallButton data-horf-stable-start-trade type="button" $strong onClick={() => startTrade(listing)} disabled={busy}>Trade for this horse</SmallButton>
                            : <SmallButton data-horf-stable-claim type="button" $strong onClick={() => void claim(listing)} disabled={!configured || claimed || busy}>Claim 1 horse</SmallButton>}
                        {claimed && <p>Already claimed this token ID with this wallet.</p>}
                        {!claimed && noCredit && address && <p>{mode === 0 ? "Deposit one approved edition to earn a claim." : "Deposit an approved token to earn Group claims."}</p>}
                      </>
                    )}
                    </ListingCopy>
                  </li>
                );
              })}
            </ListingList>
          ) : <p>{snapshotQuery.isPending ? "Reading stable listings…" : snapshotQuery.isError ? "Listings unavailable until the stable ledger loads." : snapshot?.status === "unconfigured" ? "Listings will appear once the Mainnet contract is deployed." : "No horse editions are listed in this stable yet."}</p>}
        </Panel>
      </Inside>
      {showManagement && address && <Panel data-horf-stable-owner-listings>
        <Eyebrow>Your saddle ledger</Eyebrow>
        <h3>Manage my stable listings</h3>
        <p>All your open escrow listings appear here, including horses a Marshal later removed from the public market. You can return unclaimed editions to your wallet.</p>
        {managementQuery.isPending && <p role="status">Reading your escrow listings…</p>}
        {managementQuery.isError && <Status $warn role="alert">Your listings could not be loaded. Refresh stables to try again.</Status>}
        {!managementQuery.isPending && !managementQuery.isError && (ownListings.length ? <ListingList>
          {ownListings.map((listing) => <li key={listing.id} data-horf-stable-owner-listing data-horf-stable-owner-listing-id={listing.id}>
            <StableHorsePreview key={`${listing.token?.image}:${listing.token?.artifactUri}`} listing={listing} uniqueThumbnails={uniqueThumbnails} />
            <ListingCopy>
            <strong><a href={tokenUrl(listing.tokenContract, listing.tokenId)} target="_blank" rel="noopener noreferrer">{listing.token?.name?.trim() || `Horse token #${listing.tokenId}`}</a> · {listing.remaining} {listing.remaining === "1" ? "edition" : "editions"} left</strong>
            <small>Listing #{listing.id} · {activeListings.some((marketListing) => marketListing.id === listing.id) ? "On Marshal’s Market" : "Off the public market"}</small>
            <ListingActions><label>Return editions<input aria-label={`Return my editions from listing ${listing.id}`} inputMode="numeric" pattern="[0-9]+" value={cancelAmounts[listing.id] ?? listing.remaining} onChange={(event) => setCancelAmounts((current) => ({ ...current, [listing.id]: event.target.value }))} disabled={!configured || busy} /></label><SmallButton data-horf-stable-owner-cancel type="button" onClick={() => void cancel(listing)} disabled={!configured || busy}>Cancel listing</SmallButton></ListingActions>
            </ListingCopy>
          </li>)}
        </ListingList> : <p>No open listings of yours in this stable.</p>)}
      </Panel>}
      {pending && <Status role="status" aria-live="polite">{pendingLabel(pending)} {pending.opHash && <a href={explorerUrl(pending.opHash)} target="_blank" rel="noopener noreferrer">View submitted transaction</a>}</Status>}
      {actionError && <Status $warn role="alert">{actionError}{permitScopeDenied === "unverified" && <> Reconnect and verify this wallet to request a deposit permit. <SmallButton type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Reconnect and verify wallet"}</SmallButton></>}{permitScopeDenied === "restricted" && " Check Trader standing by the race board for this wallet’s restriction."}</Status>}
      {success && <Status role="status">{success.action}. <a href={explorerUrl(success.opHash)} target="_blank" rel="noopener noreferrer">View Tezos transaction</a>. The indexed listing and credit totals may take a moment to catch up.</Status>}
    </Board>
  );
}
