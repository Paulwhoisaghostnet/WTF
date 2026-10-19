import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import { STAGE_REFRESH_INTERVAL_MS, type GameshowProgressSnapshot, type GameshowTokenEvidence } from "@shared/gameshow";
import { api } from "../../lib/api";
import { RecoverableIpfsImage } from "../../components/RecoverableIpfsImage";
import { ProductionActions, ProductionCard, ProductionColumns, ProductionPanel, ProductionStack, downloadProductionFile } from "./production-ui";
import { ShowHelp } from "./show-desk-ui";

const Sheet = styled.div`
  overflow: auto; min-width: 0; max-width: 100%; border: 1px solid var(--wtf-app-border, #808080);
  table { border-collapse: separate; border-spacing: 0; width: 100%; font-variant-numeric: tabular-nums; }
  caption { text-align: left; padding: 10px; }
  th, td { padding: 10px; text-align: left; vertical-align: top; border-right: 1px solid var(--wtf-app-border, #808080); border-bottom: 1px solid var(--wtf-app-border, #808080); min-width: 120px; }
  th:first-child, td:first-child { position: sticky; left: 0; z-index: 1; background: var(--wtf-app-surface, #fff); min-width: 160px; }
  td button { width: 100%; }
`;
const Bars = styled.div`
  display: grid; gap: 10px;
  .bar { height: 12px; background: var(--wtf-app-info, #175cd3); min-width: 0; }
  .track { background: var(--wtf-app-border, #808080); height: 12px; }
`;

const countLabel = (value: { submissionCount: number; taskCount: number; pendingCount: number; passCount: number; failCount: number; bonusCount: number }) => `${value.submissionCount}/${value.taskCount} entries · ${value.pendingCount} pending · ${value.passCount} pass · ${value.bonusCount} bonus · ${value.failCount} fail`;
const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  return `"${(/^[=+@\-\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};
const safeHttp = (value: string | null) => !!value && /^https?:\/\//i.test(value);

function TokenCard({ event }: { event: GameshowTokenEvidence }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageAllowed = event.thumbnailUri && /^(?:https?:\/\/|ipfs:\/\/)/i.test(event.thumbnailUri);
  return <ProductionCard><ProductionStack>
    {imageAllowed && !imageFailed ? <RecoverableIpfsImage src={event.thumbnailUri!} alt={event.name || `Token ${event.tokenId || ""}`} loading="lazy" width={96} height={96} style={{ objectFit: "contain" }} onError={() => setImageFailed(true)} /> : <span>Preview unavailable</span>}
    <strong>{event.name || `Token ${event.tokenId ?? "unknown"}`}</strong>
    <p>{event.type.replaceAll("_", " ")} · {event.amount ?? "amount unavailable"} raw units</p>
    <p>{new Date(event.timestamp).toLocaleString()} · {event.network === "mainnet" ? "Tezos mainnet" : "Network provenance unverified"}</p>
    <small>{event.tokenContract} / {event.tokenId ?? "token ID unavailable"}<br />Wallet: {event.walletAddress}</small>
    <ProductionActions>
      {safeHttp(event.tokenUrl) && <a href={event.tokenUrl!} target="_blank" rel="noopener noreferrer">View token</a>}
      {safeHttp(event.explorerUrl) && <a href={event.explorerUrl!} target="_blank" rel="noopener noreferrer">View operation</a>}
    </ProductionActions>
    {event.network === "unverified" && <small>This cached observation cannot verify a mainnet game outcome.</small>}
  </ProductionStack></ProductionCard>;
}

export function HostProgressSheet({ seasonId, visible = true }: { seasonId: number | null; visible?: boolean }) {
  const progress = useQuery({ queryKey: ["gameshow-progress", seasonId], queryFn: () => api.get<GameshowProgressSnapshot>(`/api/gameshow/seasons/${seasonId}/progress`), enabled: seasonId !== null && visible,
    refetchInterval: visible ? STAGE_REFRESH_INTERVAL_MS : false, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "entries">("name");
  const [roundId, setRoundId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const show = progress.data;
  const rows = useMemo(() => (show?.rows ?? []).filter(row => `${row.username} ${row.displayName || ""}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "entries" ? b.totals.submissionCount - a.totals.submissionCount || a.username.localeCompare(b.username) : a.username.localeCompare(b.username)), [show, search, sort]);
  if (seasonId === null) return <p>Create or select a show in Build Rounds to open its progress sheet.</p>;
  if (!show) return <ProductionStack><p role={progress.isError ? "alert" : "status"}>{progress.error?.message || "Loading contestant progress…"}</p>{progress.isError && <Button onClick={() => progress.refetch()}>Retry progress sheet</Button>}</ProductionStack>;
  const selectedRoundId = roundId ?? show.rounds.find(round => round.status === "active" || round.status === "grading")?.id ?? show.rounds[0]?.id;
  const selectedRound = show.rounds.find(round => round.id === selectedRoundId);
  const selectedUser = show.rows.find(row => row.userId === userId);
  const counts = rows.map(row => ({ row, counts: row.rounds.find(round => round.roundId === selectedRoundId) }));
  const largestEntryCount = Math.max(0, ...counts.map(({ counts }) => counts?.submissionCount ?? 0));
  const evidence = show.tokenEvidence.filter(event => event.roundId === selectedRoundId && (userId === null || event.userId === userId));
  function exportSheet() {
    const records: unknown[][] = [["Contestant", "Roster status", "Round", "Game", "Tasks", "Entries", "Pending", "Pass", "Fail", "Bonus", "Wallets", "Token observation status", "Observed token events", "Verified mainnet events"]];
    for (const row of rows) for (const round of show!.rounds) {
      const value = row.rounds.find(item => item.roundId === round.id);
      if (value) records.push([row.username, row.status, round.number, round.name, value.taskCount, value.submissionCount, value.pendingCount, value.passCount, value.failCount, value.bonusCount, row.wallets.map(wallet => wallet.address).join(" "), value.tokenActivity.status, value.tokenActivity.observedCount, value.tokenActivity.verifiedCount]);
    }
    downloadProductionFile(`show-${seasonId}-progress.csv`, records.map(record => record.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }
  return <ProductionPanel aria-label="Contestant progress sheet">
    <ProductionActions><h2>Progress sheet</h2><ShowHelp label="How the progress sheet works">Rows are contestants and columns are rounds. Cells count stored evidence and host grades. Select a cell for the round chart, wallet state, and token observations. Counts are not a scoring or winner rule.</ShowHelp><Button disabled={progress.isFetching} onClick={() => progress.refetch()}>{progress.isFetching ? "Refreshing…" : "Refresh progress"}</Button><Button onClick={exportSheet}>Export progress CSV</Button></ProductionActions>
    <p>Saved entries, host judgments, and indexed wallet evidence. Updated {new Date(show.generatedAt).toLocaleTimeString()}; refreshes while this sheet is open.</p>
    {progress.isError && <p role="alert">Updates failed: {progress.error.message}. The displayed sheet may be old.</p>}
    <ProductionColumns>
      <label>Find contestant<input value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Sort rows<select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="name">Contestant name</option><option value="entries">Recorded entries</option></select></label>
    </ProductionColumns>
    <Sheet tabIndex={0} role="region" aria-label="Scrollable round progress table"><table>
      <caption>{show.rows.length} contestants · {show.rounds.length} rounds. Scroll across to compare rounds.</caption>
      <thead><tr><th scope="col">Contestant</th><th scope="col">Whole show</th>{show.rounds.map(round => <th key={round.id} scope="col">R{round.number}<br />{round.name}<br /><small>{round.status}</small></th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.userId}><th scope="row">{row.displayName || row.username}<br /><small>@{row.username} · {row.status}<br />{row.wallets.length} linked wallets</small></th><td>{countLabel(row.totals)}</td>
        {show.rounds.map(round => { const value = row.rounds.find(item => item.roundId === round.id); return <td key={round.id}><Button aria-label={`Inspect ${row.username} round ${round.number}`} onClick={() => { setRoundId(round.id); setUserId(row.userId); }}>{value ? countLabel(value) : "No progress available"}</Button>{value && value.tokenActivity.status !== "not_configured" && <small>Token evidence: {value.tokenActivity.status}</small>}</td>; })}
      </tr>)}</tbody>
    </table></Sheet>
    {rows.length === 0 && <p>{show.rows.length ? "No contestants match your search." : "Enroll contestants in Run Show to populate this sheet."}</p>}
    <ProductionActions><label>Round to inspect<select value={selectedRoundId || ""} onChange={event => setRoundId(Number(event.target.value))}>{show.rounds.map(round => <option key={round.id} value={round.id}>Round {round.number}: {round.name}</option>)}</select></label>
      {selectedUser && <Button onClick={() => setUserId(null)}>Show all contestants</Button>}
    </ProductionActions>
    <ProductionColumns>
      <GroupBox label={`Round ${selectedRound?.number ?? "—"} · recorded entries`}><Bars>
        {counts.map(({ row, counts }) => <div key={row.userId}><strong>{row.username}</strong> · {counts?.submissionCount ?? 0} recorded · {counts?.pendingCount ?? 0} pending review
          {largestEntryCount > 0 && <div className="track" aria-hidden="true"><div className="bar" style={{ width: `${((counts?.submissionCount ?? 0) / largestEntryCount) * 100}%` }} /></div>}
        </div>)}
        <small>Chart scale follows the largest recorded count. Entries and review grades do not declare a winner.</small>
      </Bars></GroupBox>
      <GroupBox label="Wallet readiness"><ProductionStack>
        {(selectedUser ? [selectedUser] : rows).map(row => <div key={row.userId}><strong>{row.username}</strong>
          {row.wallets.length ? row.wallets.map(wallet => <ProductionCard key={wallet.address}><p style={{ overflowWrap: "anywhere" }}>{wallet.address}{wallet.isPrimary ? " · primary" : ""}</p><small>Linked identity: Tezos mainnet<br />Index: {wallet.syncStatus || "not synced"} · {wallet.lastSyncedAt ? new Date(wallet.lastSyncedAt).toLocaleString() : "no successful sync recorded"}<br />History: {wallet.backfilled ? "backfill recorded" : "backfill incomplete"}</small>{wallet.error && <p role="status">{wallet.error}</p>}</ProductionCard>) : <p>No linked wallet. Ask this contestant to connect and verify their wallet in Profile.</p>}
        </div>)}
        <small>Wallet indexing can lag behind the chain. Contestants can request a wallet refresh in Dashboard’s Indexer tab. A missing or incomplete index is not proof that no action occurred.</small>
      </ProductionStack></GroupBox>
    </ProductionColumns>
    <section aria-label="Round token evidence"><ProductionStack><h3>Token activity {selectedUser ? `· ${selectedUser.username}` : ""}</h3>
      <p>Observed mints, burns, and transfers for configured tokens during this round. Raw quantities preserve token precision. The host judges whether an observation satisfies the published rule.</p>
      {evidence.length ? <ProductionColumns>{evidence.map(event => <TokenCard key={event.id} event={event} />)}</ProductionColumns> : <p>{selectedRound?.tokenMonitoring ? "No matching indexed observations are available. Inspect wallet sync and round status before drawing a conclusion." : "No token observation is configured for this round. Add it to a step in Build Rounds when the game needs it."}</p>}
    </ProductionStack></section>
  </ProductionPanel>;
}
