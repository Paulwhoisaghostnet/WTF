import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { HORF_STABLES_CHAIN_ID, setHorfStableBlacklist } from "../../lib/tezos/horf-stables";
import { assertTraderAddress } from "./recipient-input";
import { parseHorfTraderStatus, safeHorfEvidenceUrl } from "./trader-status-model";
import { HorfKnownTraderPicker, useHorfTraderChoices } from "./HorfKnownTraderPicker";

type AdminEntry = {
  address: string;
  active: boolean;
  reason: string;
  evidenceUrl: string | null;
  listedAt: string;
  listedByUserId: number;
  clearedAt: string | null;
  clearedByUserId: number | null;
};

type ChainBlacklistSnapshot = {
  status: "ready" | "unconfigured";
  contractAddress: string | null;
  chainId: string;
  adminAddress: string | null;
  onChainBlacklisted: boolean | null;
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
  p { margin: 5px 0 12px; color: var(--horf-muted, #b7b5a7); font-size: 14px; line-height: 1.55; }
  label { display: block; margin-bottom: 6px; font: 700 13px/1.3 var(--horf-font, "Avenir Next", sans-serif); }
  input, textarea { width: 100%; min-width: 0; padding: 9px 11px; border: 1px solid var(--horf-line, #3d5148); border-radius: 9px; background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); font: 14px var(--horf-font, "Avenir Next", sans-serif); }
  input { min-height: 42px; }
  textarea { min-height: 70px; resize: vertical; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 2px; }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  margin: 11px 0;
  @container (max-width: 470px) { grid-template-columns: 1fr; }
`;

const Action = styled.button<{ $danger?: boolean }>`
  min-height: 40px;
  padding: 9px 15px;
  border: 1px solid ${(props) => props.$danger ? "#b74931" : "var(--horf-deep, #101816)"};
  border-radius: 999px;
  background: ${(props) => props.$danger ? "#b74931" : "var(--horf-deep, #101816)"};
  color: #fff;
  cursor: pointer;
  font: 750 13px/1.2 var(--horf-font, "Avenir Next", sans-serif);
  transition: background 160ms ease, transform 160ms ease;
  &:hover:not(:disabled) { transform: translateY(-1px); background: ${(props) => props.$danger ? "#963620" : "#294448"}; }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover:not(:disabled) { transform: none; } }
`;

const Report = styled.div<{ $listed?: boolean }>`
  margin: 13px 0;
  padding: 15px 17px;
  border: 1px solid ${(props) => props.$listed ? "#8b5c50" : "#477663"};
  border-radius: 12px;
  background: ${(props) => props.$listed ? "#3b2723" : "#1d3932"};
  overflow-wrap: anywhere;
  strong { display: block; margin-bottom: 4px; font: 700 17px/1.25 var(--horf-display, Georgia, serif); }
  small { display: block; margin-top: 7px; font: 12px/1.4 var(--horf-font, "Avenir Next", sans-serif); }
`;

const AdminPanel = styled.div`
  margin-top: 18px;
  padding: 20px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 14px;
  background: var(--horf-surface, #1b2723);
  > form { display: grid; gap: 8px; }
  ul { list-style: none; margin: 10px 0 0; padding: 0; }
  li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 0; border-top: 1px solid var(--horf-line, #3d5148); }
  li span { min-width: 0; overflow-wrap: anywhere; }
  li small { display: block; color: var(--horf-muted, #b7b5a7); font: 12px/1.4 var(--horf-font, "Avenir Next", sans-serif); }
`;

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export function HorfTraderStatus({
  selectedAddress,
  walletAddress,
  onSelect,
  isAdmin,
  onChange,
}: {
  selectedAddress: string | null;
  walletAddress: string | null;
  onSelect: (address: string) => void;
  isAdmin: boolean;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const logged = useRef(new Set<string>());
  const [lookupAddress, setLookupAddress] = useState(selectedAddress ?? "");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [adminAddress, setAdminAddress] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [chainBusy, setChainBusy] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainHash, setChainHash] = useState<string | null>(null);
  const traderChoices = useHorfTraderChoices(walletAddress);

  useEffect(() => setLookupAddress(selectedAddress ?? ""), [selectedAddress]);

  const statusQuery = useQuery({
    queryKey: ["horf", "trader-status", selectedAddress],
    queryFn: () => api.get<unknown>(`/api/horf/trader-status?address=${encodeURIComponent(selectedAddress!)}`).then(parseHorfTraderStatus),
    enabled: Boolean(selectedAddress),
    refetchOnWindowFocus: true,
  });
  const status = statusQuery.data?.address === selectedAddress ? statusQuery.data : null;
  const adminQuery = useQuery({
    queryKey: ["horf", "admin", "blacklist"],
    queryFn: () => api.get<{ entries: AdminEntry[] }>("/api/horf/admin/blacklist"),
    enabled: isAdmin,
    refetchOnWindowFocus: true,
  });
  const activeEntries = Array.isArray(adminQuery.data?.entries) ? adminQuery.data.entries.filter((entry) => entry.active) : [];
  const chainQuery = useQuery({
    queryKey: ["horf", "stables", "blacklist", selectedAddress],
    queryFn: () => api.get<ChainBlacklistSnapshot>(`/api/horf/stables?address=${encodeURIComponent(selectedAddress!)}`),
    enabled: isAdmin && Boolean(selectedAddress),
    refetchOnWindowFocus: true,
  });
  const chainSnapshot = chainQuery.data;
  const chainReady = chainSnapshot?.status === "ready" && chainSnapshot.chainId === HORF_STABLES_CHAIN_ID &&
    Boolean(chainSnapshot.contractAddress && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(chainSnapshot.contractAddress));
  const isChainAdmin = chainReady && Boolean(walletAddress && chainSnapshot?.adminAddress === walletAddress);

  useEffect(() => {
    if (!status || logged.current.has(status.address)) return;
    logged.current.add(status.address);
    logClientSystemEvent({ eventType: "horf.trader_status.viewed", message: "Horf trader standing viewed", metadata: { address: status.address, blacklisted: status.blacklisted } });
  }, [status]);

  function search(event: FormEvent) {
    event.preventDefault();
    setLookupError(null);
    try {
      const address = assertTraderAddress(lookupAddress);
      if (address === selectedAddress) void statusQuery.refetch();
      else onSelect(address);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Enter a valid trader wallet.");
    }
  }

  async function addBlacklist(event: FormEvent) {
    event.preventDefault();
    if (adminBusy) return;
    setAdminError(null);
    setAdminSuccess(null);
    try {
      const address = assertTraderAddress(adminAddress);
      const explanation = reason.trim();
      if (!explanation) throw new Error("Explain why this wallet is being blacklisted.");
      const evidence = evidenceUrl.trim();
      const safeEvidence = evidence ? safeHorfEvidenceUrl(evidence) : null;
      if (evidence && !safeEvidence) throw new Error("Evidence must be an http or https link without embedded credentials.");
      setAdminBusy(true);
      await api.post("/api/horf/admin/blacklist", { address, reason: explanation, evidenceUrl: safeEvidence });
      setAdminAddress("");
      setReason("");
      setEvidenceUrl("");
      setAdminSuccess(`Blacklisted ${shortAddress(address)} for Horf private features.`);
      await qc.invalidateQueries({ queryKey: ["horf", "admin", "blacklist"] });
      await qc.invalidateQueries({ queryKey: ["horf", "trader-status", address] });
      onChange();
      onSelect(address);
      logClientSystemEvent({ eventType: "horf.blacklist.added", message: "Horf trader wallet blacklisted", metadata: { address } });
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Could not blacklist this wallet.");
    } finally {
      setAdminBusy(false);
    }
  }

  async function removeBlacklist(address: string) {
    if (adminBusy) return;
    setAdminError(null);
    setAdminSuccess(null);
    try {
      setAdminBusy(true);
      await api.delete(`/api/horf/admin/blacklist/${encodeURIComponent(address)}`);
      setAdminSuccess(`Removed the Horf blacklist entry for ${shortAddress(address)}.`);
      await qc.invalidateQueries({ queryKey: ["horf", "admin", "blacklist"] });
      await qc.invalidateQueries({ queryKey: ["horf", "trader-status", address] });
      onChange();
      logClientSystemEvent({ eventType: "horf.blacklist.removed", message: "Horf trader wallet restriction removed", metadata: { address } });
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Could not remove this blacklist entry.");
    } finally {
      setAdminBusy(false);
    }
  }

  async function changeChainBlacklist(blocked: boolean) {
    if (!isAdmin || !selectedAddress || !walletAddress || !isChainAdmin || !chainSnapshot?.contractAddress || chainBusy) return;
    setChainBusy(true);
    setChainError(null);
    setChainHash(null);
    try {
      const opHash = await setHorfStableBlacklist(walletAddress, {
        contractAddress: chainSnapshot.contractAddress,
        chainId: chainSnapshot.chainId,
      }, selectedAddress, blocked);
      setChainHash(opHash);
      await chainQuery.refetch();
      logClientSystemEvent({ eventType: "horf.blacklist.chain_updated", message: "Horf Stable on-chain trader restriction confirmed", metadata: { address: selectedAddress, blocked, opHash } });
    } catch (error) {
      setChainError(error instanceof Error ? error.message : "The on-chain restriction could not be changed.");
    } finally { setChainBusy(false); }
  }

  return (
    <Shell id="horf-trader-status" data-horf-region="trader-status" aria-label="Horf trader standing">
      <h2>Trader standing</h2>
      <p>Check a rider before trading. A Horf blacklist restricts app actions; Stable claims need a separate on-chain block. Past trades stay visible, and transfers cannot be undone.</p>
      <form onSubmit={search}>
        <label htmlFor="horf-status-wallet">Trader wallet address</label>
        <Row>
          <input id="horf-status-wallet" data-horf-status-address value={lookupAddress} onChange={(event) => setLookupAddress(event.target.value)} placeholder="tz1…" />
          <Action data-horf-status-search type="submit">Check standing</Action>
        </Row>
        <HorfKnownTraderPicker choices={traderChoices} onSelect={(wallet) => { setLookupAddress(wallet); setLookupError(null); onSelect(wallet); }} label="trader to check" includeBlacklisted posseDataAttribute="data-horf-status-posse-picker" knownDataAttribute="data-horf-status-trader-picker" />
      </form>
      {lookupError && <Report $listed role="alert">{lookupError}</Report>}
      {!selectedAddress && <p>Choose a rider on the race board or enter a Tezos wallet address above.</p>}
      {selectedAddress && statusQuery.isPending && <p role="status">Checking Horf trader standing…</p>}
      {selectedAddress && statusQuery.isError && <Report $listed role="alert">Trader standing is unavailable. Try the lookup again.</Report>}
      {status && <Report $listed={status.blacklisted} data-horf-status-result role={status.blacklisted ? "alert" : "status"}>
        <strong>{status.blacklisted ? "Blacklisted by Horf moderation" : "No active Horf blacklist entry"}</strong>
        <span>{status.address}</span>
        {status.blacklisted && <>
          {status.reason && <p>{status.reason}</p>}
          {safeHorfEvidenceUrl(status.evidenceUrl) && <a href={safeHorfEvidenceUrl(status.evidenceUrl)!} target="_blank" rel="noopener noreferrer">Review supporting evidence</a>}
          {status.listedAt && <small>Listed {new Date(status.listedAt).toLocaleDateString()}</small>}
        </>}
        {!status.blacklisted && <small>This is a Horf status check, not a guarantee about a trader or a Tezos transfer.</small>}
      </Report>}

      {isAdmin && <AdminPanel data-horf-admin-blacklist aria-label="Horf wallet blacklist administration">
        <h3>Admin · wallet blacklist</h3>
        <p>Add a public reason. This blocks private Horf actions; Stable claims need a separate on-chain block. Past trades stay visible.</p>
        <form onSubmit={(event) => void addBlacklist(event)}>
          <div><label htmlFor="horf-admin-blacklist-address">Wallet to blacklist</label><input id="horf-admin-blacklist-address" data-horf-admin-blacklist-address value={adminAddress} onChange={(event) => setAdminAddress(event.target.value)} placeholder="tz1…" disabled={adminBusy} /><HorfKnownTraderPicker choices={traderChoices} onSelect={(wallet) => setAdminAddress(wallet)} disabled={adminBusy} label="wallet to blacklist" includeBlacklisted posseDataAttribute="data-horf-admin-blacklist-posse-picker" knownDataAttribute="data-horf-admin-blacklist-trader-picker" /></div>
          <div><label htmlFor="horf-admin-blacklist-reason">Reason shown publicly</label><textarea id="horf-admin-blacklist-reason" data-horf-admin-blacklist-reason value={reason} onChange={(event) => setReason(event.target.value)} disabled={adminBusy} /></div>
          <div><label htmlFor="horf-admin-blacklist-evidence">Evidence link (optional)</label><input id="horf-admin-blacklist-evidence" data-horf-admin-blacklist-evidence value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://…" disabled={adminBusy} /></div>
          <Action data-horf-admin-blacklist-submit type="submit" $danger disabled={adminBusy || !adminAddress.trim() || !reason.trim()}>{adminBusy ? "Saving…" : "Blacklist wallet"}</Action>
        </form>
        {adminError && <Report $listed role="alert">{adminError}</Report>}
        {adminSuccess && <Report role="status">{adminSuccess}</Report>}
        {adminQuery.isPending && <p>Loading Horf blacklist…</p>}
        {adminQuery.isError && <p role="alert">Admin blacklist unavailable. Refresh the app to retry.</p>}
        {activeEntries.length ? <ul>{activeEntries.map((entry) => <li key={entry.address} data-horf-admin-blacklist-entry>
          <span><b>{entry.address}</b><small>{entry.reason}</small></span>
          <Action data-horf-admin-blacklist-remove type="button" onClick={() => void removeBlacklist(entry.address)} disabled={adminBusy}>Remove restriction</Action>
        </li>)}</ul> : !adminQuery.isPending && !adminQuery.isError && <p>No active Horf blacklist entries.</p>}
        {selectedAddress && <div data-horf-chain-blacklist>
          <h3>Separate Stable contract restriction</h3>
          <p>The database restriction above does not block a direct contract claim. The Stable administrator must sign this separate Tezos Mainnet action. It cannot reverse a transfer.</p>
          {chainQuery.isPending && <p>Reading on-chain Stable status…</p>}
          {chainQuery.isError && <p role="alert">The Stable contract status is unavailable. Refresh this panel before signing.</p>}
          {chainSnapshot?.status === "unconfigured" && <p>The Stable contract is not deployed yet. On-chain restriction controls will become available after configuration.</p>}
          {chainReady && <>
            <p data-horf-chain-blacklist-status>Stable contract: <a href={`https://tzkt.io/${chainSnapshot!.contractAddress}`} target="_blank" rel="noopener noreferrer">{shortAddress(chainSnapshot!.contractAddress!)}</a> · {chainSnapshot!.onChainBlacklisted === null ? "status unavailable" : chainSnapshot!.onChainBlacklisted ? "wallet blocked on-chain" : "wallet not blocked on-chain"}</p>
            {!isChainAdmin && <p>Connect the Stable administrator wallet {chainSnapshot!.adminAddress ? shortAddress(chainSnapshot!.adminAddress) : "shown by the deployed contract"} to sign this action.</p>}
            <Action data-horf-chain-blacklist-submit type="button" $danger={!chainSnapshot!.onChainBlacklisted} onClick={() => void changeChainBlacklist(!chainSnapshot!.onChainBlacklisted)} disabled={!isChainAdmin || chainBusy || chainSnapshot!.onChainBlacklisted === null}>{chainBusy ? "Waiting for Tezos confirmation…" : chainSnapshot!.onChainBlacklisted ? "Allow direct Stable claims" : "Block direct Stable claims"}</Action>
          </>}
          {chainError && <Report $listed role="alert">{chainError}</Report>}
          {chainHash && <Report role="status">Tezos operation confirmed. <a href={`https://tzkt.io/${encodeURIComponent(chainHash)}`} target="_blank" rel="noopener noreferrer">View transaction</a>. The indexed contract status may take a moment to update.</Report>}
        </div>}
      </AdminPanel>}
    </Shell>
  );
}
