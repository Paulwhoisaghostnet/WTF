import { useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { advanceResolvedMediaFallback, resolveTokenThumbnail } from "../../lib/media-resolve";
import { logClientSystemEvent } from "../../lib/system-log";
import { useWindowManager, WindowPathContext } from "../../lib/window-context";
import { objktTokenUrl, parseObjktToken } from "./token-input";

type Inspection = {
  id: number;
  source?: "owner_submission" | "open_range";
  submitterAddress: string | null;
  token: { contract: string; tokenId: string };
  status: "pending" | "approved" | "rejected" | "revoked";
  objktMetadata: {
    source: string;
    checkedAt: string;
    name: string | null;
    description: string | null;
    image: string | null;
    decimals: number | null;
    tags: Array<{ name: string | null; tokenCount: number | null }>;
  };
  chainEvidence: {
    source: string;
    checkedAt: string;
    ownerAddress: string | null;
    ownerBalance: string | null;
    identity: { contract: string; creatorAddress: string; codeHash: number; codeSha256: string; asOf: string; source: string };
    recentTransfers: Array<{ id: number; transactionId: number | null; from: string | null; to: string | null; amount: string | null; timestamp: string }>;
    note: string;
  };
  submittedAt: string;
  reviewedByWalletAddress: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
};

type OpenRangeCandidate = {
  contract: string;
  tokenId: string;
  name: string;
  description: string | null;
  image: string | null;
  mintedAt: string | null;
  creatorAddress: string | null;
  approvedForMarshalsMarket: boolean;
};
type OpenRangePage = {
  items: OpenRangeCandidate[];
  nextCursor: string | null;
  hasMore: boolean;
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
  h4 { margin: 16px 0 7px; font-size: 16px; }
  p { margin: 0 0 12px; color: var(--horf-muted, #b7b5a7); font-size: 14px; line-height: 1.55; }
  small { font: 12px/1.4 var(--horf-font, "Avenir Next", sans-serif); }
  label { display: block; margin: 0 0 6px; font: 700 13px/1.3 var(--horf-font, "Avenir Next", sans-serif); }
  input, textarea { width: 100%; min-width: 0; min-height: 42px; padding: 9px 11px; border: 1px solid var(--horf-line, #3d5148); border-radius: 9px; background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); font: 14px var(--horf-font, "Avenir Next", sans-serif); }
  input[type="radio"] { width: auto; min-height: 0; margin: 0 6px 0 0; accent-color: var(--horf-teal, #71b7a0); }
  textarea { min-height: 72px; resize: vertical; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 2px; }
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: start;
  gap: 14px 20px;
  > div { max-width: 65ch; }
  small { color: var(--horf-teal, #71b7a0); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
`;

const Action = styled.button<{ $danger?: boolean }>`
  min-height: 40px;
  padding: 9px 15px;
  border: 1px solid ${(p) => p.$danger ? "#9d5443" : "var(--horf-gold, #d8a34a)"};
  border-radius: 999px;
  background: ${(p) => p.$danger ? "#7e382d" : "var(--horf-gold, #d8a34a)"};
  color: ${(p) => p.$danger ? "#f4ead6" : "#241a0f"};
  cursor: pointer;
  font: 750 13px/1.2 var(--horf-font, "Avenir Next", sans-serif);
  transition: background 160ms ease, transform 160ms ease;
  &:hover:not(:disabled) { transform: translateY(-1px); background: ${(p) => p.$danger ? "#a94c3b" : "#edbb61"}; }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
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

const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(210px, 0.75fr) minmax(0, 1.5fr);
  gap: 18px;
  margin-top: 20px;
  @container (max-width: 720px) { grid-template-columns: 1fr; }
`;

const QueueStack = styled.div`
  display: grid;
  align-content: start;
  gap: 18px;
  min-width: 0;
`;

const Handoff = styled.div`
  margin: 12px 0 16px;
  padding: 14px;
  border: 1px solid #a37542;
  border-radius: 12px;
  background: #382d20;
  strong, small { display: block; overflow-wrap: anywhere; }
  small { margin: 5px 0 10px; color: var(--horf-muted, #b7b5a7); font-size: 11px; }
  a { color: var(--horf-teal, #71b7a0); }
`;

const CandidateList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  li { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 11px; align-items: start; padding: 12px 0; border-top: 1px solid var(--horf-line, #3d5148); }
  li:first-child { border-top: 0; }
  img { width: 54px; height: 54px; object-fit: cover; border: 1px solid var(--horf-line, #3d5148); border-radius: 9px; background: var(--horf-field, #24332d); }
  strong, small { display: block; overflow-wrap: anywhere; }
  strong { font: 700 17px/1.2 var(--horf-display, Georgia, serif); }
  small { margin-top: 4px; color: var(--horf-muted, #b7b5a7); font-size: 11px; line-height: 1.35; }
  .candidate-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; margin-top: 8px; }
  .candidate-actions a { color: var(--horf-teal, #71b7a0); font-size: 12px; font-weight: 700; }
  .approved { color: var(--horf-teal, #71b7a0); font-size: 12px; font-weight: 800; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 20px;
  scroll-margin-top: 72px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 14px;
  background: var(--horf-surface, #1b2723);
`;

const Queue = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  li { padding: 11px 0; border-top: 1px solid var(--horf-line, #3d5148); }
  li:first-child { border-top: 0; }
  strong, span { display: block; overflow-wrap: anywhere; }
  span { font: 12px/1.4 var(--horf-font, "Avenir Next", sans-serif); }
  button { margin-top: 6px; }
`;

const Evidence = styled.dl`
  display: grid;
  grid-template-columns: minmax(125px, 0.45fr) minmax(0, 1fr);
  gap: 5px 9px;
  margin: 9px 0 13px;
  font-size: 13px;
  dt { font-weight: 700; }
  dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  @container (max-width: 430px) { grid-template-columns: 1fr; dt { margin-top: 6px; } }
`;

const HorseArt = styled.img`
  display: block;
  width: min(100%, 260px);
  aspect-ratio: 1;
  object-fit: contain;
  margin: 10px 0;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 12px;
  background: var(--horf-canvas, #101816);
`;

const TransferList = styled.ol`
  max-height: 220px;
  overflow: auto;
  margin: 6px 0 0;
  padding-left: 20px;
  li { padding: 6px 0; font: 12px/1.45 var(--horf-font, "Avenir Next", sans-serif); overflow-wrap: anywhere; }
`;

const AdminPanel = styled.div`
  margin-top: 18px;
  padding: 20px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 14px;
  background: var(--horf-surface, #1b2723);
  form { margin-bottom: 15px; }
  ul { list-style: none; padding: 0; margin: 5px 0 15px; }
  li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 0; border-top: 1px solid var(--horf-line, #3d5148); }
  li span { min-width: 0; overflow-wrap: anywhere; }
  li small { display: block; }
`;

function shortAddress(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function formatWhen(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "unknown";
}

function CandidateThumbnail({ horse }: { horse: OpenRangeCandidate }) {
  const art = horse.image ? resolveTokenThumbnail({ thumbnail: horse.image }) : null;
  return <img src={art?.src || "/horf-art/horse-gallop-photo.jpg"} alt={`${horse.name || `Horse token #${horse.tokenId}`} artwork`} onError={(event) => {
    if (art && advanceResolvedMediaFallback(event.currentTarget, art)) return;
    if (!event.currentTarget.src.endsWith("/horf-art/horse-gallop-photo.jpg")) event.currentTarget.src = "/horf-art/horse-gallop-photo.jpg";
  }} />;
}

function inspectionOrigin(item: Inspection): string {
  return item.source === "open_range" || !item.submitterAddress
    ? "Open Range review"
    : shortAddress(item.submitterAddress);
}

function inspectHandoff(path: string): { contract: string; tokenId: string } | null {
  const query = path.split("?")[1]?.split("#")[0] || "";
  const value = new URLSearchParams(query).get("inspect") || "";
  const match = /^(KT1[1-9A-HJ-NP-Za-km-z]{33})\/(\d+)$/.exec(value);
  return match ? { contract: match[1], tokenId: BigInt(match[2]).toString() } : null;
}

export function HorfInspectorDesk({ isGuest, isAdmin }: {
  isGuest: boolean;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const windowManager = useWindowManager();
  const windowPath = useContext(WindowPathContext);
  const path = windowPath || (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "");
  const handoff = useMemo(() => inspectHandoff(path), [path]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reviewReason, setReviewReason] = useState("");
  const [revokeLink, setRevokeLink] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const refreshHorseCache = useRef(false);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  const inspectorQuery = useQuery({
    queryKey: ["horf", "inspector-status", isGuest],
    queryFn: () => api.get<{ active: boolean; role: "horf_marshal" | "admin" | null }>("/api/horf/inspectors/status"),
    refetchOnWindowFocus: true,
  });
  const deputized = inspectorQuery.data?.active === true;
  const queueQuery = useQuery({
    queryKey: ["horf", "inspection-queue"],
    queryFn: () => api.get<{ inspections: Inspection[] }>("/api/horf/inspections/pending"),
    enabled: deputized,
    refetchOnWindowFocus: true,
  });
  const queue = Array.isArray(queueQuery.data?.inspections) ? queueQuery.data.inspections : [];
  const openRangeQuery = useInfiniteQuery({
    queryKey: ["horf", "marshal-open-range"],
    queryFn: ({ pageParam }) => api.get<OpenRangePage>(`/api/horf/open-range?season=all-horse-search&cursor=${encodeURIComponent(pageParam)}${refreshHorseCache.current ? "&refresh=1" : ""}`),
    initialPageParam: "0",
    getNextPageParam: (page) => page.hasMore && page.nextCursor ? page.nextCursor : undefined,
    enabled: deputized,
    refetchOnWindowFocus: true,
  });
  const candidates = useMemo(() => {
    const byToken = new Map<string, OpenRangeCandidate>();
    for (const page of openRangeQuery.data?.pages || []) {
      for (const item of page.items || []) byToken.set(`${item.contract}/${item.tokenId}`, item);
    }
    return [...byToken.values()];
  }, [openRangeQuery.data]);
  const pendingByToken = new Map(queue.map((item) => [`${item.token.contract}/${item.token.tokenId}`, item]));
  const handoffStatusQuery = useQuery({
    queryKey: ["horf", "inspection-status", handoff?.contract, handoff?.tokenId],
    queryFn: () => api.get<{ status: string }>(`/api/horf/inspections/status?contract=${encodeURIComponent(handoff!.contract)}&tokenId=${encodeURIComponent(handoff!.tokenId)}`),
    enabled: Boolean(deputized && handoff),
    refetchOnWindowFocus: true,
  });
  const handoffCandidate = handoff ? candidates.find((item) => item.contract === handoff.contract && item.tokenId === handoff.tokenId) || {
    ...handoff, name: `Horse token #${handoff.tokenId}`, description: null, image: null,
    mintedAt: null, creatorAddress: null, approvedForMarshalsMarket: handoffStatusQuery.data?.status === "approved",
  } : null;
  const detailQuery = useQuery({
    queryKey: ["horf", "inspection-detail", selectedId],
    queryFn: () => api.get<Inspection>(`/api/horf/inspections/${selectedId}`),
    enabled: Boolean(deputized && selectedId),
    refetchOnWindowFocus: true,
  });
  const detail = detailQuery.data?.id === selectedId ? detailQuery.data : null;
  const detailArt = detail?.objktMetadata.image ? resolveTokenThumbnail({ thumbnail: detail.objktMetadata.image }) : null;

  useEffect(() => {
    if (!detail) return;
    detailPanelRef.current?.focus({ preventScroll: true });
    detailPanelRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [detail?.id]);

  async function startMarshalReview(candidate: OpenRangeCandidate) {
    if (!deputized || busy || candidate.approvedForMarshalsMarket) return;
    const pending = pendingByToken.get(`${candidate.contract}/${candidate.tokenId}`);
    if (pending) { setSelectedId(pending.id); setError(null); setSuccess(null); return; }
    setError(null); setSuccess(null);
    try {
      setBusy(true);
      const inspection = await api.post<Inspection>("/api/horf/inspections/marshal", {
        tokenContract: candidate.contract, tokenId: candidate.tokenId,
      });
      setSelectedId(inspection.id);
      setDecision("approve");
      setReviewReason("");
      await qc.invalidateQueries({ queryKey: ["horf", "inspection-queue"] });
      setSuccess(`Fresh evidence is ready for ${candidate.name || `token #${candidate.tokenId}`}. Record a separate approval or rejection below.`);
      logClientSystemEvent({ eventType: "horf.inspection.marshal_review_started", message: "Marshal opened an Open Range horse review", metadata: { inspectionId: inspection.id, tokenContract: candidate.contract, tokenId: candidate.tokenId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare this Open Range horse for inspection."); }
    finally { setBusy(false); }
  }

  async function decide(event: FormEvent) {
    event.preventDefault();
    if (!deputized || !detail || detail.status !== "pending" || busy) return;
    setError(null); setSuccess(null);
    try {
      if (!reviewReason.trim()) throw new Error("Record a reason for this inspection decision.");
      setBusy(true);
      await api.post(`/api/horf/inspections/${detail.id}/decision`, { decision, reason: reviewReason.trim() });
      setReviewReason("");
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: ["horf", "inspection-queue"] });
      await qc.invalidateQueries({ queryKey: ["horf", "marshal-open-range"] });
      await qc.invalidateQueries({ queryKey: ["horf", "inspection-status", detail.token.contract, detail.token.tokenId] });
      setSuccess(`Inspection ${decision === "approve" ? "approved" : "rejected"} for token #${detail.token.tokenId}.`);
      logClientSystemEvent({ eventType: "horf.inspection.decided", message: "Horf inspector decision recorded", metadata: { inspectionId: detail.id, decision, tokenContract: detail.token.contract, tokenId: detail.token.tokenId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the inspection decision."); }
    finally { setBusy(false); }
  }

  async function revokeApproval(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || busy) return;
    setError(null); setSuccess(null);
    try {
      const token = parseObjktToken(revokeLink);
      if (!revokeReason.trim()) throw new Error("Record why this token approval is being revoked.");
      setBusy(true);
      await api.post(`/api/horf/admin/inspection-approvals/${encodeURIComponent(token.contract)}/${encodeURIComponent(token.tokenId)}/revoke`, { reason: revokeReason.trim() });
      setRevokeLink(""); setRevokeReason("");
      await qc.invalidateQueries({ queryKey: ["horf", "inspection-status", token.contract, token.tokenId] });
      setSuccess("Approval revoked for new Stable and HORSE Market listings. Existing signed Stable permits may remain valid until the Stable admin bumps the oracle epoch. Existing HORSE Market listings stay buyable by direct contract calls until the Market admin signs set_token_blocked for this horse.");
      logClientSystemEvent({ eventType: "horf.inspection.approval_revoked", message: "Horf token inspection approval revoked", metadata: { tokenContract: token.contract, tokenId: token.tokenId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke this token approval."); }
    finally { setBusy(false); }
  }

  return <Shell id="horf-inspector-desk" data-horf-region="inspector-desk" aria-label="Horf inspector desk">
    <Header><div><small>Marshal’s badge · human review</small><h2>Inspector’s desk</h2><p>Patrol Open Range or review stable submissions. Check each horse’s evidence, then approve or reject it with a reason. FA2 history cannot guarantee custody.</p></div><Action type="button" onClick={() => { refreshHorseCache.current = true; void Promise.all([inspectorQuery.refetch(), queueQuery.refetch(), openRangeQuery.refetch()]).finally(() => { refreshHorseCache.current = false; }); }} disabled={inspectorQuery.isFetching || queueQuery.isFetching || openRangeQuery.isFetching}>Refresh desk</Action></Header>
    {inspectorQuery.isPending && <Note role="status">Checking your WTF OS marshal badge…</Note>}
    {inspectorQuery.isError && <Note $error role="alert">The inspector role could not be checked. Refresh to try again.</Note>}
    {inspectorQuery.data && !deputized && <Note>{isGuest ? "Inspector decisions require WTF OS sign-in and the HORF MARSHAL role. A guest wallet can still save and submit its own horses for inspection." : "Your WTF OS account does not have the HORF MARSHAL role. Admins can assign it through standard role administration."}</Note>}
    {deputized && <Columns>
      <QueueStack>
      <Panel data-horf-inspection-open-range><h3>Open Range patrol</h3><p>All known horse mints. Open evidence before deciding.</p>
        {handoff && handoffCandidate && <Handoff data-horf-marshal-handoff><strong>Horse brought from the Open Range: {handoffCandidate.name}</strong><small>{handoff.contract} / #{handoff.tokenId}</small>
          {handoffStatusQuery.isPending ? <span role="status">Checking this horse’s papers…</span> : handoffStatusQuery.isError ? <span role="alert">Approval status is unavailable. Refresh the desk to try again.</span> : handoffStatusQuery.data?.status === "approved" ? <span className="approved">✓ Already Marshal approved</span> : <Action data-horf-marshal-handoff-review type="button" disabled={busy} onClick={() => void startMarshalReview(handoffCandidate)}>{pendingByToken.has(`${handoff.contract}/${handoff.tokenId}`) ? "Continue inspection" : "Open this horse’s evidence"}</Action>}
          <p><a href={objktTokenUrl(handoff.contract, handoff.tokenId)} target="_blank" rel="noopener noreferrer">See this horse on Objkt</a></p>
        </Handoff>}
        {openRangeQuery.isPending && <p role="status">Reading the Open Range horse trail…</p>}
        {openRangeQuery.isError && <Note $error role="alert">Open Range horses are unavailable. Refresh the desk to try again.</Note>}
        {candidates.length > 0 && <CandidateList>{candidates.map((candidate) => {
          const pending = pendingByToken.get(`${candidate.contract}/${candidate.tokenId}`);
          return <li key={`${candidate.contract}/${candidate.tokenId}`} data-horf-marshal-candidate>
            <CandidateThumbnail horse={candidate} />
            <div><strong>{candidate.name || `Horse token #${candidate.tokenId}`}</strong><small>#{candidate.tokenId} · {shortAddress(candidate.contract)}{candidate.mintedAt ? ` · minted ${formatWhen(candidate.mintedAt)}` : ""}</small><small>{candidate.creatorAddress ? `Creator ${shortAddress(candidate.creatorAddress)}` : "Creator unknown"}</small>
              <div className="candidate-actions">{candidate.approvedForMarshalsMarket ? <span className="approved">✓ Marshal approved</span> : <Action data-horf-marshal-candidate-review type="button" disabled={busy} onClick={() => void startMarshalReview(candidate)}>{pending ? "Continue inspection" : "Open evidence"}</Action>}<a href={objktTokenUrl(candidate.contract, candidate.tokenId)} target="_blank" rel="noopener noreferrer">See horse on Objkt</a></div>
            </div>
          </li>;
        })}</CandidateList>}
        {!openRangeQuery.isPending && !openRangeQuery.isError && candidates.length === 0 && <p>No horses on these pages. Keep scanning.</p>}
        {openRangeQuery.hasNextPage && <Action data-horf-marshal-load-more type="button" disabled={openRangeQuery.isFetchingNextPage || busy} onClick={() => void openRangeQuery.fetchNextPage()}>{openRangeQuery.isFetchingNextPage ? "Following the trail…" : "Load more horses"}</Action>}
      </Panel>
      <Panel data-horf-inspection-queue><h3>Horses at the gate</h3><p>Pending Marshal and trader reviews.</p>
        {queueQuery.isPending && <p>Reading the inspection queue…</p>}
        {queueQuery.isError && <Note $error role="alert">The queue is unavailable. Refresh the desk to try again.</Note>}
        {queue.length ? <Queue>{queue.map((item) => <li key={item.id} data-horf-inspection-queue-row><strong>{item.objktMetadata?.name || `Horse token #${item.token.tokenId}`}</strong><span>#{item.id} · {inspectionOrigin(item)} · {formatWhen(item.submittedAt)}</span><Action data-horf-inspection-open type="button" onClick={() => setSelectedId(item.id)}>Review evidence</Action></li>)}</Queue> : !queueQuery.isPending && !queueQuery.isError && <p>The corral gate is quiet. No inspections await review.</p>}
      </Panel>
      </QueueStack>
      <Panel ref={detailPanelRef} tabIndex={-1} data-horf-inspection-detail><h3>Evidence saddlebag</h3>
        {!selectedId && <p>Choose a horse to review its papers.</p>}
        {selectedId && detailQuery.isPending && <p>Reading token evidence…</p>}
        {selectedId && detailQuery.isError && <Note $error role="alert">This inspection could not be loaded. Choose another row or refresh the desk.</Note>}
        {detail && <>
          <p><strong><a href={objktTokenUrl(detail.token.contract, detail.token.tokenId)} target="_blank" rel="noopener noreferrer">{detail.objktMetadata.name || `Token #${detail.token.tokenId}`}</a></strong> · inspection #{detail.id}</p>
          {detailArt && <HorseArt src={detailArt.src} alt={`${detail.objktMetadata.name || `Horse token #${detail.token.tokenId}`} artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, detailArt)) event.currentTarget.style.display = "none"; }} />}
          {detail.objktMetadata.description && <p>{detail.objktMetadata.description}</p>}
          <Evidence>
            <dt>Token identity</dt><dd>{detail.token.contract} / #{detail.token.tokenId}</dd>
            <dt>Review origin</dt><dd>{detail.source === "open_range" || !detail.submitterAddress ? "Open Range patrol" : `Submitted by ${detail.submitterAddress}`} · {formatWhen(detail.submittedAt)}</dd>
            <dt>Objkt metadata</dt><dd>{detail.objktMetadata.source} · checked {formatWhen(detail.objktMetadata.checkedAt)} · {detail.objktMetadata.decimals ?? "?"} decimals</dd>
            <dt>Horse tags</dt><dd>{detail.objktMetadata.tags.map((tag) => `${tag.name || "unnamed"} (${tag.tokenCount ?? "?"})`).join(", ") || "No tags recorded"}</dd>
            <dt>On-chain owner</dt><dd>{detail.chainEvidence.ownerAddress && detail.chainEvidence.ownerBalance
              ? `${detail.chainEvidence.ownerAddress} · ${detail.chainEvidence.ownerBalance} editions at review`
              : "No owner assertion for Open Range patrol"}</dd>
            <dt>FA2 creator</dt><dd>{detail.chainEvidence.identity.creatorAddress}</dd>
            <dt>Contract code</dt><dd>Code hash {detail.chainEvidence.identity.codeHash} · SHA-256 {detail.chainEvidence.identity.codeSha256}</dd>
            <dt>Chain source</dt><dd>{detail.chainEvidence.source} · checked {formatWhen(detail.chainEvidence.checkedAt)} · identity as of {formatWhen(detail.chainEvidence.identity.asOf)}</dd>
          </Evidence>
          <p>{detail.chainEvidence.note}</p>
          <h4>Recent token transfers</h4>
          {detail.chainEvidence.recentTransfers.length ? <TransferList>{detail.chainEvidence.recentTransfers.map((transfer) => <li key={transfer.id}>#{transfer.id} · {shortAddress(transfer.from || "mint")} → {shortAddress(transfer.to || "burn")} · {transfer.amount || "?"} editions · {formatWhen(transfer.timestamp)}</li>)}</TransferList> : <p>No recent indexed transfers in this evidence sample.</p>}
          {detail.status === "pending" && <form onSubmit={(event) => void decide(event)}>
            <h4>Inspector’s decision</h4>
            <label><input type="radio" name="horf-inspection-decision" checked={decision === "approve"} onChange={() => setDecision("approve")} /> Approve token identity</label>
            <label><input type="radio" name="horf-inspection-decision" checked={decision === "reject"} onChange={() => setDecision("reject")} /> Reject token identity</label>
            <label htmlFor="horf-inspection-reason">Reason recorded for this decision</label>
            <textarea id="horf-inspection-reason" data-horf-inspection-reason value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} disabled={busy} />
            <Action data-horf-inspection-decide type="submit" $danger={decision === "reject"} disabled={busy || !reviewReason.trim()}>{busy ? "Recording…" : decision === "approve" ? "Approve inspection" : "Reject inspection"}</Action>
          </form>}
        </>}
      </Panel>
    </Columns>}
    {isAdmin && <AdminPanel data-horf-inspector-admin aria-label="Horf inspector administration">
      <h3>Marshal’s office · assign the role</h3>
      <p>Assign HORF MARSHAL in WTF OS roles. A wallet alone cannot inspect.</p>
      <Action data-horf-marshal-roles-open type="button" onClick={() => windowManager.openPage("/admin")}>Open WTF OS role administration</Action>
      <h3>Revoke a token approval</h3>
      <p>Revocation stops new permits and listings. Existing signed permits need an oracle epoch bump; existing Market listings need an on-chain <code>set_token_blocked</code> call.</p>
      <form onSubmit={(event) => void revokeApproval(event)}><label htmlFor="horf-approval-link">Approved Objkt token link</label><input id="horf-approval-link" data-horf-approval-link value={revokeLink} onChange={(event) => setRevokeLink(event.target.value)} placeholder="https://objkt.com/tokens/KT1…/123" disabled={busy} /><label htmlFor="horf-approval-reason">Revocation reason</label><textarea id="horf-approval-reason" data-horf-approval-reason value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} disabled={busy} /><Action data-horf-approval-revoke type="submit" $danger disabled={busy || !revokeLink.trim() || !revokeReason.trim()}>Revoke token approval</Action></form>
    </AdminPanel>}
    {error && <Note $error role="alert">{error}</Note>}
    {success && <Note role="status">{success}</Note>}
  </Shell>;
}
