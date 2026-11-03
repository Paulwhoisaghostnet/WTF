import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { advanceResolvedMediaFallback, resolveTokenThumbnail } from "../../lib/media-resolve";
import { logClientSystemEvent } from "../../lib/system-log";
import { useWindowManager } from "../../lib/window-context";
import { objktTokenUrl, parseObjktToken } from "./token-input";

type Inspection = {
  id: number;
  submitterAddress: string;
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
    ownerAddress: string;
    ownerBalance: string;
    identity: { contract: string; creatorAddress: string; codeHash: number; codeSha256: string; asOf: string; source: string };
    recentTransfers: Array<{ id: number; transactionId: number | null; from: string | null; to: string | null; amount: string | null; timestamp: string }>;
    note: string;
  };
  submittedAt: string;
  reviewedByWalletAddress: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
};

const Shell = styled.section`
  margin-top: 24px;
  padding: 18px;
  border: 3px solid #2e4b4c;
  background: #dce8d8;
  box-shadow: inset 0 0 0 2px #f2f8dc, 4px 4px 0 #6a8b70;
  min-width: 0;
  h2 { margin: 2px 0 6px; font-size: clamp(25px, 4cqw, 36px); line-height: 1.05; }
  h3 { margin: 0 0 8px; font-size: 19px; }
  h4 { margin: 14px 0 5px; font-size: 15px; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.45; }
  small { font: 11px/1.35 "Courier New", monospace; }
  label { display: block; margin: 0 0 5px; font: 700 12px/1.3 "Courier New", monospace; }
  input, textarea { width: 100%; min-width: 0; min-height: 36px; padding: 6px 8px; border: 1px solid #648477; background: #fffef5; color: #24372f; font: 13px Georgia, serif; }
  input[type="radio"] { width: auto; min-height: 0; margin: 0 5px 0 0; accent-color: #367665; }
  textarea { min-height: 72px; resize: vertical; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid #0b6874; outline-offset: 2px; }
`;

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: start;
  gap: 10px 18px;
  > div { max-width: 700px; }
  small { color: #3a7061; font-weight: 700; text-transform: uppercase; }
`;

const Action = styled.button<{ $danger?: boolean }>`
  min-height: 36px;
  padding: 6px 10px;
  border: 2px solid #2f5954;
  background: ${(p) => p.$danger ? "#f4b18b" : "#d6e5b4"};
  color: #273b32;
  box-shadow: 2px 2px 0 #82a08a;
  cursor: pointer;
  font: 700 12px/1.2 "Courier New", monospace;
  &:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
`;

const Note = styled.div<{ $error?: boolean }>`
  margin: 11px 0;
  padding: 10px 12px;
  border-left: 5px solid ${(p) => p.$error ? "#a44232" : "#4d806c"};
  background: ${(p) => p.$error ? "#fff0dd" : "#f1f8e8"};
  font: 700 12px/1.45 "Courier New", monospace;
  overflow-wrap: anywhere;
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(210px, 0.75fr) minmax(0, 1.5fr);
  gap: 14px;
  margin-top: 14px;
  @container (max-width: 720px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  min-width: 0;
  padding: 14px;
  border-top: 4px solid #4e8270;
  background: #fffdf1;
  box-shadow: inset 0 0 0 1px #a0b9a0;
`;

const Queue = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  li { padding: 9px 0; border-top: 1px solid #c7d9bd; }
  li:first-child { border-top: 0; }
  strong, span { display: block; overflow-wrap: anywhere; }
  span { font: 11px/1.35 "Courier New", monospace; }
  button { margin-top: 6px; }
`;

const Evidence = styled.dl`
  display: grid;
  grid-template-columns: minmax(125px, 0.45fr) minmax(0, 1fr);
  gap: 5px 9px;
  margin: 9px 0 13px;
  font-size: 12px;
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
  border: 3px double #668c78;
  background: #eef1e2;
`;

const TransferList = styled.ol`
  max-height: 220px;
  overflow: auto;
  margin: 6px 0 0;
  padding-left: 20px;
  li { padding: 5px 0; font: 11px/1.4 "Courier New", monospace; overflow-wrap: anywhere; }
`;

const AdminPanel = styled.div`
  margin-top: 18px;
  padding: 14px;
  border-top: 4px solid #557e6a;
  background: #f7f7e8;
  form { margin-bottom: 15px; }
  ul { list-style: none; padding: 0; margin: 5px 0 15px; }
  li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid #c8d2bd; }
  li span { min-width: 0; overflow-wrap: anywhere; }
  li small { display: block; }
`;

function shortAddress(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function formatWhen(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "unknown";
}

export function HorfInspectorDesk({ isGuest, isAdmin }: {
  isGuest: boolean;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const windowManager = useWindowManager();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reviewReason, setReviewReason] = useState("");
  const [revokeLink, setRevokeLink] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
  const detailQuery = useQuery({
    queryKey: ["horf", "inspection-detail", selectedId],
    queryFn: () => api.get<Inspection>(`/api/horf/inspections/${selectedId}`),
    enabled: Boolean(deputized && selectedId),
    refetchOnWindowFocus: true,
  });
  const detail = detailQuery.data?.id === selectedId ? detailQuery.data : null;
  const detailArt = detail?.objktMetadata.image ? resolveTokenThumbnail({ thumbnail: detail.objktMetadata.image }) : null;

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
      setSuccess("Approval revoked for new Stable permits. Already signed one-use permits may remain valid until the Stable administrator bumps the on-chain oracle epoch.");
      logClientSystemEvent({ eventType: "horf.inspection.approval_revoked", message: "Horf token inspection approval revoked", metadata: { tokenContract: token.contract, tokenId: token.tokenId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke this token approval."); }
    finally { setBusy(false); }
  }

  return <Shell id="horf-inspector-desk" data-horf-region="inspector-desk" aria-label="Horf inspector desk">
    <Header><div><small>Marshal’s badge · human review</small><h2>Inspector’s desk</h2><p>Before a horse can enter Marshal’s Market, a HORF MARSHAL documents a human trust judgment from its Objkt story, Tezos FA2 identity, full code digest, and observed transfers. This is no cryptographic proof that arbitrary FA2 code will always transfer correctly.</p></div><Action type="button" onClick={() => { void inspectorQuery.refetch(); void queueQuery.refetch(); }} disabled={inspectorQuery.isFetching || queueQuery.isFetching}>Refresh desk</Action></Header>
    {inspectorQuery.isPending && <Note role="status">Checking your WTF OS marshal badge…</Note>}
    {inspectorQuery.isError && <Note $error role="alert">The inspector role could not be checked. Refresh to try again.</Note>}
    {inspectorQuery.data && !deputized && <Note>{isGuest ? "Inspector decisions require WTF OS sign-in and the HORF MARSHAL role. A guest wallet can still save and submit its own horses for inspection." : "Your WTF OS account does not have the HORF MARSHAL role. Admins can assign it through standard role administration."}</Note>}
    {deputized && <Columns>
      <Panel data-horf-inspection-queue><h3>Horses at the gate</h3><p>Pending inspections for this deputized wallet.</p>
        {queueQuery.isPending && <p>Reading the inspection queue…</p>}
        {queueQuery.isError && <Note $error role="alert">The queue is unavailable. Refresh the desk to try again.</Note>}
        {queue.length ? <Queue>{queue.map((item) => <li key={item.id} data-horf-inspection-queue-row><strong>{item.objktMetadata?.name || `Horse token #${item.token.tokenId}`}</strong><span>#{item.id} · {shortAddress(item.submitterAddress)} · {formatWhen(item.submittedAt)}</span><Action data-horf-inspection-open type="button" onClick={() => setSelectedId(item.id)}>Review evidence</Action></li>)}</Queue> : !queueQuery.isPending && !queueQuery.isError && <p>The corral gate is quiet. No inspections await review.</p>}
      </Panel>
      <Panel data-horf-inspection-detail><h3>Evidence saddlebag</h3>
        {!selectedId && <p>Choose a horse from the queue to inspect its contract, provenance, and transfer evidence.</p>}
        {selectedId && detailQuery.isPending && <p>Reading token evidence…</p>}
        {selectedId && detailQuery.isError && <Note $error role="alert">This inspection could not be loaded. Choose another row or refresh the desk.</Note>}
        {detail && <>
          <p><strong><a href={objktTokenUrl(detail.token.contract, detail.token.tokenId)} target="_blank" rel="noopener noreferrer">{detail.objktMetadata.name || `Token #${detail.token.tokenId}`}</a></strong> · inspection #{detail.id}</p>
          {detailArt && <HorseArt src={detailArt.src} alt={`${detail.objktMetadata.name || `Horse token #${detail.token.tokenId}`} artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, detailArt)) event.currentTarget.style.display = "none"; }} />}
          {detail.objktMetadata.description && <p>{detail.objktMetadata.description}</p>}
          <Evidence>
            <dt>Token identity</dt><dd>{detail.token.contract} / #{detail.token.tokenId}</dd>
            <dt>Submitted by</dt><dd>{detail.submitterAddress} · {formatWhen(detail.submittedAt)}</dd>
            <dt>Objkt metadata</dt><dd>{detail.objktMetadata.source} · checked {formatWhen(detail.objktMetadata.checkedAt)} · {detail.objktMetadata.decimals ?? "?"} decimals</dd>
            <dt>Horse tags</dt><dd>{detail.objktMetadata.tags.map((tag) => `${tag.name || "unnamed"} (${tag.tokenCount ?? "?"})`).join(", ") || "No tags recorded"}</dd>
            <dt>On-chain owner</dt><dd>{detail.chainEvidence.ownerAddress} · {detail.chainEvidence.ownerBalance} editions at review</dd>
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
      <p>Grant or revoke HORF MARSHAL on a WTF OS user’s Passport in the standard admin role screen. A wallet alone cannot approve or reject inspections.</p>
      <Action data-horf-marshal-roles-open type="button" onClick={() => windowManager.openPage("/admin")}>Open WTF OS role administration</Action>
      <h3>Revoke a token approval</h3>
      <p>Revoking approval stops new Stable permits. A previously signed one-use permit may remain valid until the Stable administrator bumps the on-chain oracle epoch.</p>
      <form onSubmit={(event) => void revokeApproval(event)}><label htmlFor="horf-approval-link">Approved Objkt token link</label><input id="horf-approval-link" data-horf-approval-link value={revokeLink} onChange={(event) => setRevokeLink(event.target.value)} placeholder="https://objkt.com/tokens/KT1…/123" disabled={busy} /><label htmlFor="horf-approval-reason">Revocation reason</label><textarea id="horf-approval-reason" data-horf-approval-reason value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} disabled={busy} /><Action data-horf-approval-revoke type="submit" $danger disabled={busy || !revokeLink.trim() || !revokeReason.trim()}>Revoke token approval</Action></form>
    </AdminPanel>}
    {error && <Note $error role="alert">{error}</Note>}
    {success && <Note role="status">{success}</Note>}
  </Shell>;
}
