import { useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { advanceResolvedMediaFallback } from "../../lib/media-resolve";
import { logClientSystemEvent } from "../../lib/system-log";
import { useWindowManager, WindowPathContext } from "../../lib/window-context";
import { resolveHorfHorseArt, resolveHorfHorseVideo } from "./horse-media";
import { approveHorseDirectly } from "./marshal-approval";
import { objktTokenUrl, parseObjktToken } from "./token-input";

type Inspection = {
  id: number;
  source?: "owner_submission" | "open_range" | "community_report";
  submitterAddress: string | null;
  token: { contract: string; tokenId: string };
  status: "pending" | "approved" | "rejected" | "revoked";
  objktMetadata: {
    source: string;
    checkedAt: string | null;
    name: string | null;
    description: string | null;
    image: string | null;
    artifactUri?: string | null;
    mime?: string | null;
    decimals: number | null;
    tags: Array<{ name: string | null; tokenCount: number | null }>;
  };
  chainEvidence: {
    source: string;
    checkedAt: string | null;
    ownerAddress: string | null;
    ownerBalance: string | null;
    identity: { contract: string; creatorAddress: string; codeHash: number; codeSha256: string; asOf: string; source: string } | null;
    recentTransfers: Array<{ id: number; transactionId: number | null; from: string | null; to: string | null; amount: string | null; timestamp: string }>;
    note: string;
    communityReport?: unknown;
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
  artifactUri?: string | null;
  mime?: string | null;
  mintedAt: string | null;
  creatorAddress: string | null;
  approvedForMarshalsMarket: boolean;
  inspectionStatus?: "none" | "pending" | "approved" | "rejected" | "reviewed";
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

const DeskFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  button { min-height: 40px; padding: 8px 13px; border: 1px solid var(--horf-line, #3d5148); border-radius: 999px; background: var(--horf-surface, #1b2723); color: var(--horf-ink, #f4ead6); cursor: pointer; font: 750 12px/1.2 var(--horf-font, "Avenir Next", sans-serif); }
  button[aria-pressed="true"] { border-color: var(--horf-gold, #d8a34a); background: var(--horf-gold, #d8a34a); color: #241a0f; }
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
  li { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; padding: 16px 0; border-top: 1px solid var(--horf-line, #3d5148); }
  li:first-child { border-top: 0; }
  .candidate-media { display: grid; place-items: center; width: 100%; min-height: 190px; overflow: hidden; border: 1px solid var(--horf-line, #3d5148); border-radius: 10px; background: var(--horf-canvas, #101816); }
  .candidate-media img, .candidate-media video { display: block; width: 100%; max-height: 360px; object-fit: contain; }
  .candidate-media span { padding: 14px; color: var(--horf-muted, #b7b5a7); font-size: 12px; text-align: center; }
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
  width: min(100%, 560px);
  max-height: 65vh;
  object-fit: contain;
  margin: 10px 0;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 12px;
  background: var(--horf-canvas, #101816);
`;

const HorseVideo = styled.video`
  display: block;
  width: min(100%, 560px);
  max-height: 65vh;
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
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setVideoFailed(false); setImageFailed(false); }, [horse.contract, horse.tokenId, horse.image, horse.artifactUri]);
  const video = resolveHorfHorseVideo(horse);
  const art = resolveHorfHorseArt(horse);
  const name = horse.name || `Horse token #${horse.tokenId}`;
  return <div className="candidate-media" data-horf-marshal-token-preview={`${horse.contract}/${horse.tokenId}`}>
    {video && !videoFailed ? <video src={video.src} controls playsInline preload="metadata" aria-label={`${name} video artwork`} onError={(event) => {
      if (!advanceResolvedMediaFallback(event.currentTarget, video)) setVideoFailed(true);
    }} /> : art && !imageFailed ? <img src={art.src} alt={`${name} artwork`} loading="lazy" onError={(event) => {
      if (!advanceResolvedMediaFallback(event.currentTarget, art)) setImageFailed(true);
    }} /> : <span>Token preview unavailable. Open its Objkt page.</span>}
  </div>;
}

function isHorseReport(item: Inspection | undefined): boolean {
  if (!item) return false;
  const report = item.chainEvidence?.communityReport;
  const pendingReport = !!report && typeof report === "object" &&
    (report as { resolution?: unknown }).resolution === "pending";
  return item.source === "community_report" || pendingReport;
}

function inspectionOrigin(item: Inspection): string {
  if (isHorseReport(item)) return "Rider report · That’s not a horse";
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
  const [deskView, setDeskView] = useState<"reports" | "awaiting" | "approved">("awaiting");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reportDecision, setReportDecision] = useState<"hide" | "keep">("hide");
  const [reviewReason, setReviewReason] = useState("");
  const switchDeskView = (view: "reports" | "awaiting" | "approved") => {
    setDeskView(view);
    setSelectedId(null);
    setReviewReason("");
  };
  const [revokeLink, setRevokeLink] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
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
  const queue = (Array.isArray(queueQuery.data?.inspections) ? queueQuery.data.inspections : [])
    .filter((item) => !hiddenKeys.has(`${item.token.contract}/${item.token.tokenId}`));
  const reports = queue.filter(isHorseReport);
  const pendingInspections = queue.filter((item) => !isHorseReport(item));
  const openRangeQuery = useInfiniteQuery({
    queryKey: ["horf", "marshal-open-range"],
    queryFn: ({ pageParam }) => api.get<OpenRangePage>(`/api/horf/open-range?season=all-horse-search&marshal=1&cursor=${encodeURIComponent(pageParam)}${refreshHorseCache.current ? "&refresh=1" : ""}`),
    initialPageParam: "0",
    getNextPageParam: (page) => page.hasMore && page.nextCursor ? page.nextCursor : undefined,
    enabled: deputized && deskView !== "reports",
    refetchOnWindowFocus: true,
  });
  const candidates = useMemo(() => {
    const byToken = new Map<string, OpenRangeCandidate>();
    for (const page of openRangeQuery.data?.pages || []) {
      for (const item of page.items || []) {
        const key = `${item.contract}/${item.tokenId}`;
        if (!hiddenKeys.has(key)) byToken.set(key, item);
      }
    }
    return [...byToken.values()];
  }, [openRangeQuery.data, hiddenKeys]);
  const pendingByToken = new Map(queue.map((item) => [`${item.token.contract}/${item.token.tokenId}`, item]));
  const freshCandidates = candidates.filter((item) => !item.approvedForMarshalsMarket &&
    !pendingByToken.has(`${item.contract}/${item.tokenId}`));
  const approvedCandidates = candidates.filter((item) => item.approvedForMarshalsMarket);
  const visibleCandidates = deskView === "approved" ? approvedCandidates : freshCandidates;
  const visibleQueue = deskView === "reports" ? reports : pendingInspections;
  const handoffStatusQuery = useQuery({
    queryKey: ["horf", "inspection-status", handoff?.contract, handoff?.tokenId],
    queryFn: () => api.get<{ status: string }>(`/api/horf/inspections/status?contract=${encodeURIComponent(handoff!.contract)}&tokenId=${encodeURIComponent(handoff!.tokenId)}`),
    enabled: Boolean(deputized && handoff),
    refetchOnWindowFocus: true,
  });
  const handoffCandidate = handoff && !hiddenKeys.has(`${handoff.contract}/${handoff.tokenId}`) ? candidates.find((item) => item.contract === handoff.contract && item.tokenId === handoff.tokenId) || {
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
  const legacyMediaQuery = useQuery({
    queryKey: ["horf", "inspection-token-media", detail?.token.contract, detail?.token.tokenId],
    queryFn: () => api.get<{ token: { image: string | null; artifactUri: string | null; mime: string | null } }>(
      `/api/horf/token-eligibility?contract=${encodeURIComponent(detail!.token.contract)}&tokenId=${encodeURIComponent(detail!.token.tokenId)}`),
    enabled: Boolean(detail && !Object.prototype.hasOwnProperty.call(detail.objktMetadata, "artifactUri")),
    staleTime: 60_000,
  });
  const detailMedia = legacyMediaQuery.data?.token || detail?.objktMetadata;
  const detailArt = detailMedia ? resolveHorfHorseArt(detailMedia) : null;
  const detailVideo = detailMedia ? resolveHorfHorseVideo(detailMedia) : null;

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

  async function approveNow(token: { contract: string; tokenId: string }, pendingId?: number) {
    if (!deputized || busy) return;
    setError(null); setSuccess(null);
    try {
      setBusy(true);
      const inspectionId = await approveHorseDirectly(token, pendingId);
      setSelectedId(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["horf", "inspection-queue"] }),
        qc.invalidateQueries({ queryKey: ["horf", "marshal-open-range"] }),
        qc.invalidateQueries({ queryKey: ["horf", "open-range"] }),
        qc.invalidateQueries({ queryKey: ["horf", "inspection-status", token.contract, token.tokenId] }),
      ]);
      setSuccess(`Marshal approved horse #${token.tokenId}.`);
      logClientSystemEvent({ eventType: "horf.inspection.decided", message: "Horf Marshal approved a horse directly", metadata: { inspectionId, decision: "approve", mode: "direct", tokenContract: token.contract, tokenId: token.tokenId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve this horse."); }
    finally { setBusy(false); }
  }

  async function hideNow(token: { contract: string; tokenId: string }, name: string | null) {
    if (!deputized || busy) return;
    const key = `${token.contract}/${token.tokenId}`;
    setError(null); setSuccess(null);
    setBusy(true);
    setHiddenKeys((current) => new Set(current).add(key));
    try {
      const result = await api.post<{ status: string; inspectionId: number }>(
        "/api/horf/reports/not-a-horse/direct",
        { tokenContract: token.contract, tokenId: token.tokenId },
      );
      if (result.status !== "hidden") throw new Error("Marshal decision did not hide this token.");
      if (detail?.token.contract === token.contract && detail.token.tokenId === token.tokenId) setSelectedId(null);
      setSuccess(`${name || `Token #${token.tokenId}`} is hidden from Horf horse displays.`);
      void Promise.allSettled([
        qc.invalidateQueries({ queryKey: ["horf", "inspection-queue"] }),
        qc.invalidateQueries({ queryKey: ["horf", "marshal-open-range"] }),
        qc.invalidateQueries({ queryKey: ["horf", "open-range"] }),
        qc.invalidateQueries({ queryKey: ["horf", "trader-profile-horses"] }),
        qc.invalidateQueries({ queryKey: ["horf", "trader-profile-offers"] }),
        qc.invalidateQueries({ queryKey: ["horf", "directory-offers"] }),
        qc.invalidateQueries({ queryKey: ["horf", "open-range-offers"] }),
        qc.invalidateQueries({ queryKey: ["horf", "owned-tokens"] }),
        qc.invalidateQueries({ queryKey: ["horf", "owned-qualifying-horses"] }),
        qc.invalidateQueries({ queryKey: ["horf", "gift-owned-qualifying-horses"] }),
        qc.invalidateQueries({ queryKey: ["horf", "quick-send-horses"] }),
        qc.invalidateQueries({ queryKey: ["horf", "stable-selections"] }),
        qc.invalidateQueries({ queryKey: ["horf", "inspection-status", token.contract, token.tokenId] }),
        qc.invalidateQueries({ queryKey: ["horf", "token-eligibility", token.contract, token.tokenId] }),
        qc.invalidateQueries({ queryKey: ["horf", "horse-market", "listings"] }),
      ]);
      logClientSystemEvent({ eventType: "horf.inspection.decided", message: "Horf Marshal hid a non-horse from the inspection desk", metadata: { inspectionId: result.inspectionId, decision: "hide", mode: "direct", tokenContract: token.contract, tokenId: token.tokenId } });
    } catch (cause) {
      setHiddenKeys((current) => { const next = new Set(current); next.delete(key); return next; });
      setError(cause instanceof Error ? cause.message : "Could not hide this token. Try again.");
    } finally { setBusy(false); }
  }

  async function decide(event: FormEvent) {
    event.preventDefault();
    if (!deputized || !detail || detail.status !== "pending" || busy) return;
    setError(null); setSuccess(null);
    try {
      if ((!isHorseReport(detail) || reportDecision === "keep") && !reviewReason.trim()) {
        throw new Error("Record a reason for this inspection decision.");
      }
      setBusy(true);
      if (isHorseReport(detail)) {
        await api.post(`/api/horf/reports/not-a-horse/${detail.id}/decision`, {
          decision: reportDecision, reason: reviewReason.trim(),
        });
      } else {
        await api.post(`/api/horf/inspections/${detail.id}/decision`, { decision, reason: reviewReason.trim() });
      }
      setReviewReason("");
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: ["horf"] });
      const finalDecision = isHorseReport(detail) ? reportDecision : decision;
      setSuccess(isHorseReport(detail)
        ? reportDecision === "hide" ? `Token #${detail.token.tokenId} is hidden from Horf horse displays.` : `Token #${detail.token.tokenId} stays on the horse trail.`
        : `Inspection ${decision === "approve" ? "approved" : "rejected"} for token #${detail.token.tokenId}.`);
      logClientSystemEvent({ eventType: "horf.inspection.decided", message: "Horf inspector decision recorded", metadata: { inspectionId: detail.id, decision: finalDecision, tokenContract: detail.token.contract, tokenId: detail.token.tokenId } });
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
    <Header><div><small>Marshal’s badge · human review</small><h2>Inspector’s desk</h2><p>Approve a horse directly or open its evidence first. Horf rechecks eligibility and FA2 identity either way; custody still depends on trust.</p></div><Action type="button" onClick={() => { refreshHorseCache.current = true; void Promise.all([inspectorQuery.refetch(), queueQuery.refetch(), openRangeQuery.refetch()]).finally(() => { refreshHorseCache.current = false; }); }} disabled={inspectorQuery.isFetching || queueQuery.isFetching || openRangeQuery.isFetching}>Refresh desk</Action></Header>
    {inspectorQuery.isPending && <Note role="status">Checking your WTF OS marshal badge…</Note>}
    {inspectorQuery.isError && <Note $error role="alert">The inspector role could not be checked. Refresh to try again.</Note>}
    {inspectorQuery.data && !deputized && <Note>{isGuest ? "Inspector decisions require WTF OS sign-in and the HORF MARSHAL role. A guest wallet can still save and submit its own horses for inspection." : "Your WTF OS account does not have the HORF MARSHAL role. Admins can assign it through standard role administration."}</Note>}
    {deputized && <Columns>
      <QueueStack>
      <DeskFilters data-horf-marshal-filters role="group" aria-label="Marshal review lists">
        <button data-horf-marshal-filter="awaiting" type="button" aria-pressed={deskView === "awaiting"} onClick={() => switchDeskView("awaiting")}>Awaiting inspection · {pendingInspections.length + freshCandidates.length} loaded</button>
        <button data-horf-marshal-filter="reports" type="button" aria-pressed={deskView === "reports"} onClick={() => switchDeskView("reports")}>That’s not a horse · {reports.length}</button>
        <button data-horf-marshal-filter="approved" type="button" aria-pressed={deskView === "approved"} onClick={() => switchDeskView("approved")}>Approved · {approvedCandidates.length} loaded</button>
      </DeskFilters>
      {deskView !== "reports" && <Panel data-horf-inspection-open-range><h3>{deskView === "approved" ? "Approved horses" : "Unapproved horses to inspect"}</h3><p>{deskView === "approved" ? "Marshal-approved horses on loaded Open Range pages." : "Unapproved horses on loaded Open Range pages. Submitted inspections wait below."}</p>
        {handoff && handoffCandidate && <Handoff data-horf-marshal-handoff><strong>Horse brought from the Open Range: {handoffCandidate.name}</strong><small>{handoff.contract} / #{handoff.tokenId}</small>
          {handoffStatusQuery.isPending ? <span role="status">Checking this horse’s papers…</span> : handoffStatusQuery.isError ? <span role="alert">Approval status is unavailable. Refresh the desk to try again.</span> : handoffStatusQuery.data?.status === "approved" ? <span className="approved">✓ Already Marshal approved</span> : <>{!isHorseReport(pendingByToken.get(`${handoff.contract}/${handoff.tokenId}`)) && <Action data-horf-marshal-handoff-approve type="button" disabled={busy} onClick={() => void approveNow(handoffCandidate, pendingByToken.get(`${handoff.contract}/${handoff.tokenId}`)?.id)}>Approve horse now</Action>}<Action data-horf-marshal-handoff-review type="button" disabled={busy} onClick={() => void startMarshalReview(handoffCandidate)}>{pendingByToken.has(`${handoff.contract}/${handoff.tokenId}`) ? "Continue inspection" : "Open this horse’s evidence"}</Action></>}
          <Action data-horf-marshal-handoff-hide type="button" $danger disabled={busy} onClick={() => void hideNow(handoffCandidate, handoffCandidate.name)}>That’s not a horse · hide</Action>
          <p><a href={objktTokenUrl(handoff.contract, handoff.tokenId)} target="_blank" rel="noopener noreferrer">See this horse on Objkt</a></p>
        </Handoff>}
        {openRangeQuery.isPending && <p role="status">Reading the Open Range horse trail…</p>}
        {openRangeQuery.isError && <Note $error role="alert">Open Range horses are unavailable. Refresh the desk to try again.</Note>}
        {visibleCandidates.length > 0 && <CandidateList>{visibleCandidates.map((candidate) => {
          const pending = pendingByToken.get(`${candidate.contract}/${candidate.tokenId}`);
          return <li key={`${candidate.contract}/${candidate.tokenId}`} data-horf-marshal-candidate>
            <CandidateThumbnail horse={candidate} />
            <div><strong>{candidate.name || `Horse token #${candidate.tokenId}`}</strong><small>#{candidate.tokenId} · {shortAddress(candidate.contract)}{candidate.mintedAt ? ` · minted ${formatWhen(candidate.mintedAt)}` : ""}</small><small>{candidate.creatorAddress ? `Creator ${shortAddress(candidate.creatorAddress)}` : "Creator unknown"}</small>{candidate.inspectionStatus === "rejected" && <small className="approved">Marshal reviewed · rejected</small>}{candidate.inspectionStatus === "reviewed" && <small className="approved">Marshal reviewed · kept</small>}
              <div className="candidate-actions">{candidate.approvedForMarshalsMarket ? <span className="approved">✓ Marshal approved</span> : <><Action data-horf-marshal-candidate-approve type="button" disabled={busy} onClick={() => void approveNow(candidate)}>Approve horse now</Action><Action data-horf-marshal-candidate-review type="button" disabled={busy} onClick={() => void startMarshalReview(candidate)}>Open evidence</Action></>}<Action data-horf-marshal-candidate-hide type="button" $danger disabled={busy} onClick={() => void hideNow(candidate, candidate.name)}>That’s not a horse · hide</Action><a href={objktTokenUrl(candidate.contract, candidate.tokenId)} target="_blank" rel="noopener noreferrer">See horse on Objkt</a></div>
            </div>
          </li>;
        })}</CandidateList>}
        {!openRangeQuery.isPending && !openRangeQuery.isError && visibleCandidates.length === 0 && <p>{deskView === "approved" ? "No approved horses on loaded pages." : "No unapproved horses on loaded pages."} {openRangeQuery.hasNextPage ? "Load more to keep scanning." : ""}</p>}
        {openRangeQuery.hasNextPage && <Action data-horf-marshal-load-more type="button" disabled={openRangeQuery.isFetchingNextPage || busy} onClick={() => void openRangeQuery.fetchNextPage()}>{openRangeQuery.isFetchingNextPage ? "Following the trail…" : "Load more horses"}</Action>}
      </Panel>}
      {deskView !== "approved" && <Panel data-horf-inspection-queue><h3>{deskView === "reports" ? "That’s not a horse reports" : "Submitted inspections"}</h3><p>{deskView === "reports" ? "Rider reports awaiting a Marshal’s decision." : "Trader and Marshal submissions awaiting inspection."}</p>
        {queueQuery.isPending && <p>Reading the inspection queue…</p>}
        {queueQuery.isError && <Note $error role="alert">The queue is unavailable. Refresh the desk to try again.</Note>}
        {visibleQueue.length ? <Queue>{visibleQueue.map((item) => <li key={item.id} data-horf-inspection-queue-row><strong>{item.objktMetadata?.name || `Horse token #${item.token.tokenId}`}</strong><span>#{item.id} · {inspectionOrigin(item)} · {formatWhen(item.submittedAt)}</span>{!isHorseReport(item) && <Action data-horf-inspection-approve-now type="button" disabled={busy} onClick={() => void approveNow(item.token, item.id)}>Approve now</Action>}<Action data-horf-inspection-hide-now type="button" $danger disabled={busy} onClick={() => void hideNow(item.token, item.objktMetadata?.name ?? null)}>That’s not a horse · hide</Action><Action data-horf-inspection-open type="button" onClick={() => { setSelectedId(item.id); setReportDecision("hide"); setReviewReason(""); }}>{isHorseReport(item) ? "Review horse report" : "Review evidence"}</Action></li>)}</Queue> : !queueQuery.isPending && !queueQuery.isError && <p>{deskView === "reports" ? "No horse reports await review." : "No submitted inspections await review."}</p>}
      </Panel>}
      </QueueStack>
      <Panel ref={detailPanelRef} tabIndex={-1} data-horf-inspection-detail><h3>Evidence saddlebag</h3>
        {!selectedId && <p>Choose a horse to review its papers.</p>}
        {selectedId && detailQuery.isPending && <p>Reading token evidence…</p>}
        {selectedId && detailQuery.isError && <Note $error role="alert">This inspection could not be loaded. Choose another row or refresh the desk.</Note>}
        {detail && <>
          <p><strong><a href={objktTokenUrl(detail.token.contract, detail.token.tokenId)} target="_blank" rel="noopener noreferrer">{detail.objktMetadata.name || `Token #${detail.token.tokenId}`}</a></strong> · inspection #{detail.id}</p>
          {isHorseReport(detail) && <Note role="status">A rider flagged this art as “That’s not a horse.” Check its image and Objkt mint tags before deciding.</Note>}
          {detailVideo ? <HorseVideo key={`${detail.id}:${detailVideo.src}`} src={detailVideo.src} controls playsInline preload="metadata" aria-label={`${detail.objktMetadata.name || `Horse token #${detail.token.tokenId}`} video artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, detailVideo)) event.currentTarget.style.display = "none"; }} /> : detailArt ? <HorseArt key={`${detail.id}:${detailArt.src}`} src={detailArt.src} alt={`${detail.objktMetadata.name || `Horse token #${detail.token.tokenId}`} artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, detailArt)) event.currentTarget.style.display = "none"; }} /> : <Note>Token preview unavailable. Check the Objkt link above before approving.</Note>}
          {detail.objktMetadata.description && <p>{detail.objktMetadata.description}</p>}
          <Evidence>
            <dt>Token identity</dt><dd>{detail.token.contract} / #{detail.token.tokenId}</dd>
            <dt>Review origin</dt><dd>{detail.source === "open_range" || !detail.submitterAddress ? "Open Range patrol" : `Submitted by ${detail.submitterAddress}`} · {formatWhen(detail.submittedAt)}</dd>
            <dt>Objkt metadata</dt><dd>{detail.objktMetadata.source} · checked {formatWhen(detail.objktMetadata.checkedAt)} · {detail.objktMetadata.decimals ?? "?"} decimals</dd>
            <dt>Horse tags</dt><dd>{detail.objktMetadata.tags.map((tag) => `${tag.name || "unnamed"} (${tag.tokenCount ?? "?"})`).join(", ") || "No tags recorded"}</dd>
            <dt>On-chain owner</dt><dd>{detail.chainEvidence.ownerAddress && detail.chainEvidence.ownerBalance
              ? `${detail.chainEvidence.ownerAddress} · ${detail.chainEvidence.ownerBalance} editions at review`
              : "No owner assertion for Open Range patrol"}</dd>
            <dt>FA2 creator</dt><dd>{detail.chainEvidence.identity?.creatorAddress || "Not checked for direct Hide"}</dd>
            <dt>Contract code</dt><dd>{detail.chainEvidence.identity ? `Code hash ${detail.chainEvidence.identity.codeHash} · SHA-256 ${detail.chainEvidence.identity.codeSha256}` : "Not checked for direct Hide"}</dd>
            <dt>Chain source</dt><dd>{detail.chainEvidence.source} · checked {formatWhen(detail.chainEvidence.checkedAt)} · identity as of {formatWhen(detail.chainEvidence.identity?.asOf ?? null)}</dd>
          </Evidence>
          <p>{detail.chainEvidence.note}</p>
          <h4>Recent token transfers</h4>
          {detail.chainEvidence.recentTransfers.length ? <TransferList>{detail.chainEvidence.recentTransfers.map((transfer) => <li key={transfer.id}>#{transfer.id} · {shortAddress(transfer.from || "mint")} → {shortAddress(transfer.to || "burn")} · {transfer.amount || "?"} editions · {formatWhen(transfer.timestamp)}</li>)}</TransferList> : <p>No recent indexed transfers in this evidence sample.</p>}
          {detail.status === "pending" && <form onSubmit={(event) => void decide(event)}>
            <h4>Inspector’s decision</h4>
            {isHorseReport(detail) ? <>
              <label><input type="radio" name="horf-report-decision" checked={reportDecision === "hide"} onChange={() => setReportDecision("hide")} /> Hide this token from Horf</label>
              <label><input type="radio" name="horf-report-decision" checked={reportDecision === "keep"} onChange={() => setReportDecision("keep")} /> Keep this token on Horf</label>
            </> : <>
              <label><input type="radio" name="horf-inspection-decision" checked={decision === "approve"} onChange={() => setDecision("approve")} /> Approve token identity</label>
              <label><input type="radio" name="horf-inspection-decision" checked={decision === "reject"} onChange={() => setDecision("reject")} /> Reject token identity</label>
            </>}
            <label htmlFor="horf-inspection-reason">Reason {isHorseReport(detail) && reportDecision === "hide" ? "(optional)" : "(required)"}</label>
            <textarea id="horf-inspection-reason" data-horf-inspection-reason value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} disabled={busy} />
            <Action data-horf-inspection-decide type="submit" $danger={isHorseReport(detail) ? reportDecision === "hide" : decision === "reject"} disabled={busy || ((!isHorseReport(detail) || reportDecision === "keep") && !reviewReason.trim())}>{busy ? "Recording…" : isHorseReport(detail) ? reportDecision === "hide" ? "Hide from Horf" : "Keep on Horf" : decision === "approve" ? "Approve inspection" : "Reject inspection"}</Action>
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
