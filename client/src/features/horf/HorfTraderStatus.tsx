import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { HORF_STABLES_CHAIN_ID, setHorfStableBlacklist } from "../../lib/tezos/horf-stables";
import { assertTraderAddress } from "./recipient-input";
import { parseHorfTraderStatus, safeHorfEvidenceUrl } from "./trader-status-model";

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
  margin-top: 20px;
  padding: 17px;
  border: 3px solid #542923;
  background: #f1dfbb;
  box-shadow: inset 0 0 0 2px #fff2d5, 4px 4px 0 #b7754c;
  min-width: 0;
  h2 { margin: 0 0 5px; font-size: clamp(24px, 4cqw, 33px); }
  h3 { margin: 0 0 8px; font-size: 18px; }
  p { margin: 5px 0 11px; font-size: 13px; line-height: 1.45; }
  label { display: block; margin-bottom: 4px; font: 700 12px/1.3 "Courier New", monospace; }
  input, textarea { width: 100%; min-width: 0; padding: 7px 8px; border: 1px solid #926f50; border-radius: 0; background: #fffdf5; color: #33221b; font: 13px Georgia, serif; }
  input { min-height: 36px; }
  textarea { min-height: 70px; resize: vertical; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid #086d77; outline-offset: 2px; }
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
  min-height: 36px;
  padding: 6px 10px;
  border: 2px solid #5a3026;
  background: ${(props) => props.$danger ? "#f0a27d" : "#f5cc75"};
  color: #38221d;
  box-shadow: 2px 2px 0 #af7955;
  cursor: pointer;
  font: 700 12px/1.25 "Courier New", monospace;
  &:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
`;

const Report = styled.div<{ $listed?: boolean }>`
  margin: 13px 0;
  padding: 12px 14px;
  border-left: 5px solid ${(props) => props.$listed ? "#a83d2e" : "#507c53"};
  background: ${(props) => props.$listed ? "#fff0d7" : "#eef3db"};
  overflow-wrap: anywhere;
  strong { display: block; margin-bottom: 4px; font: 700 16px/1.25 Georgia, serif; }
  small { display: block; margin-top: 7px; font: 11px/1.35 "Courier New", monospace; }
`;

const AdminPanel = styled.div`
  margin-top: 18px;
  padding: 13px;
  border-top: 4px solid #78392b;
  background: #fff9e9;
  > form { display: grid; gap: 8px; }
  ul { list-style: none; margin: 10px 0 0; padding: 0; }
  li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 0; border-top: 1px solid #d5b391; }
  li span { min-width: 0; overflow-wrap: anywhere; }
  li small { display: block; color: #795c4a; font: 11px/1.35 "Courier New", monospace; }
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
      <p>Review a wallet before trading. Horf shows historical activity even if a wallet is later blacklisted. This status restricts Horf private API features; direct Stable claims require a separate admin-signed on-chain restriction. No status can undo Tezos transfers.</p>
      <form onSubmit={search}>
        <label htmlFor="horf-status-wallet">Trader wallet address</label>
        <Row>
          <input id="horf-status-wallet" data-horf-status-address value={lookupAddress} onChange={(event) => setLookupAddress(event.target.value)} placeholder="tz1…" />
          <Action data-horf-status-search type="submit">Check standing</Action>
        </Row>
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
        <p>Record a public reason before restricting a wallet from Horf private API features. This form does not set a Stable contract blacklist; an admin must sign that on-chain restriction separately before direct claims are blocked. Public trade history stays visible.</p>
        <form onSubmit={(event) => void addBlacklist(event)}>
          <div><label htmlFor="horf-admin-blacklist-address">Wallet to blacklist</label><input id="horf-admin-blacklist-address" data-horf-admin-blacklist-address value={adminAddress} onChange={(event) => setAdminAddress(event.target.value)} placeholder="tz1…" disabled={adminBusy} /></div>
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
