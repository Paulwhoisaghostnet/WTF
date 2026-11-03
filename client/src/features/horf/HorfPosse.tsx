import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, fetchWithCsrf, isApiRequestError } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { assertTraderAddress } from "./recipient-input";
import type { HorfPosseResponse } from "./social-types";
import { HorfTradeHorseCarousel } from "./HorfTradeHorseCarousel";

const Shell = styled.section`
  min-width: 0;
  color: var(--horf-ink, #f4ead6);
  font-family: var(--horf-font, "Avenir Next", sans-serif);
  .intro { max-width: 70ch; margin-bottom: 22px; }
  .eyebrow { color: var(--horf-teal, #71b7a0); font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  h2 { margin: 6px 0 9px; font: 700 clamp(30px, 4cqw, 48px)/1.05 var(--horf-display, Georgia, serif); }
  p { margin: 0 0 12px; color: var(--horf-muted, #b7b5a7); line-height: 1.55; }
  .add-form { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto; gap: 10px; align-items: end; padding: 16px; border: 1px solid var(--horf-line, #3d5148); border-radius: 14px; background: var(--horf-surface, #1b2723); }
  label { display: block; margin-bottom: 5px; font-size: 12px; font-weight: 800; }
  input { display: block; width: 100%; min-width: 0; min-height: 40px; padding: 8px 10px; border: 1px solid var(--horf-line, #3d5148); border-radius: 9px; background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); font: 14px var(--horf-font, sans-serif); }
  button { min-height: 40px; padding: 8px 13px; border: 1px solid var(--horf-gold, #d8a34a); border-radius: 9px; background: var(--horf-gold, #d8a34a); color: #241a0f; font-weight: 800; cursor: pointer; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  button.secondary { border-color: var(--horf-line, #3d5148); background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); }
  button:focus-visible, a:focus-visible, input:focus-visible { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 2px; }
  .status { margin: 15px 0; padding: 13px 15px; border: 1px solid #477663; border-radius: 11px; background: #1d3932; }
  .status.error { border-color: #8b5c50; background: #3b2723; }
  .list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 20px 0 0; padding: 0; list-style: none; }
  .member { min-width: 0; padding: 16px; border: 1px solid var(--horf-line, #3d5148); border-radius: 16px; background: var(--horf-surface, #1b2723); }
  .member-head { display: flex; align-items: start; justify-content: space-between; gap: 10px; }
  .member-name { color: var(--horf-ink, #f4ead6); font: 700 23px/1.1 var(--horf-display, Georgia, serif); text-decoration: none; overflow-wrap: anywhere; }
  .member-name:hover { color: var(--horf-teal, #71b7a0); text-decoration: underline; }
  .member small { display: block; margin-top: 5px; color: var(--horf-muted, #b7b5a7); font-size: 11px; overflow-wrap: anywhere; }
  .member-head button { flex: none; min-height: 32px; padding: 5px 8px; font-size: 11px; }
  @container (max-width: 760px) { .list { grid-template-columns: 1fr; } .add-form { grid-template-columns: 1fr; } }
`;

function shortAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export function HorfPosse({ address, connectWallet, isConnecting }: {
  address: string | null;
  connectWallet: () => Promise<void>;
  isConnecting: boolean;
}) {
  const qc = useQueryClient();
  const [partnerAddress, setPartnerAddress] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const posseQuery = useQuery({
    queryKey: ["horf", "posse", address],
    queryFn: () => api.get<HorfPosseResponse>(`/api/horf/posse?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
  });
  const partners = Array.isArray(posseQuery.data?.partners) ? posseQuery.data.partners : [];
  const scopeDenied = isApiRequestError(posseQuery.error) && posseQuery.error.status === 403;

  async function addPartner(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    try {
      if (!address) throw new Error("Connect and verify your wallet before saving a trading partner.");
      const partner = assertTraderAddress(partnerAddress);
      if (partner === address) throw new Error("Your own wallet is already in your saddle.");
      setBusy(true);
      await api.post("/api/horf/posse", { ownerAddress: address, address: partner, nickname: nickname.trim() || undefined });
      setPartnerAddress("");
      setNickname("");
      await qc.invalidateQueries({ queryKey: ["horf", "posse", address] });
      logClientSystemEvent({ eventType: "horf.posse.added", message: "Trader added to Horf posse", metadata: { address: partner } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this trader.");
    } finally { setBusy(false); }
  }

  async function removePartner(id: number, partner: string) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const response = await fetchWithCsrf(`/api/horf/posse/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not remove this trader.");
      }
      await qc.invalidateQueries({ queryKey: ["horf", "posse", address] });
      logClientSystemEvent({ eventType: "horf.posse.removed", message: "Trader removed from Horf posse", metadata: { address: partner } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this trader.");
    } finally { setBusy(false); }
  }

  return <Shell data-horf-posse aria-label="Your horse trading posse">
    <div className="intro"><span className="eyebrow">Your regular riders 🐎</span><h2>The posse</h2><p>Find their horses, visit their stables, or send HORSE and gifts.</p></div>
    {!address && <div className="status" role="status">Connect and verify your Tezos wallet to see and manage your posse. <button type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet"}</button></div>}
    <form className="add-form" onSubmit={(event) => void addPartner(event)}>
      <div><label htmlFor="horf-posse-address">Trader wallet address</label><input id="horf-posse-address" data-horf-posse-address value={partnerAddress} onChange={(event) => setPartnerAddress(event.target.value)} placeholder="tz1…" disabled={!address || busy} /></div>
      <div><label htmlFor="horf-posse-name">Nickname (optional)</label><input id="horf-posse-name" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Sir Canter" disabled={!address || busy} /></div>
      <button data-horf-posse-add type="submit" disabled={!address || busy || !partnerAddress.trim()}>{busy ? "Saving…" : "Add to posse"}</button>
    </form>
    {error && <div className="status error" role="alert">{error}</div>}
    {posseQuery.isPending && address && <div className="status" role="status">Rounding up your posse…</div>}
    {scopeDenied ? <div className="status error" role="alert">Your Horf wallet proof is missing or this wallet is restricted. Reconnect and verify before viewing your posse. <button type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Reconnect wallet"}</button></div>
      : posseQuery.isError && <div className="status error" role="alert">The posse list is unavailable. Refresh to try again.</div>}
    {partners.length > 0 ? <ul className="list">{partners.map((partner) => <li className="member" key={partner.id} data-horf-posse-member>
      <div className="member-head"><div><a className="member-name" href={`/horf/traders/${encodeURIComponent(partner.address)}`}>{partner.nickname || shortAddress(partner.address)}</a><small>{partner.address}</small></div><button className="secondary" data-horf-posse-remove type="button" onClick={() => void removePartner(partner.id, partner.address)} disabled={busy} aria-label={`Remove ${partner.nickname || shortAddress(partner.address)} from posse`}>Remove</button></div>
      <HorfTradeHorseCarousel address={partner.address} />
    </li>)}</ul> : address && !posseQuery.isPending && !posseQuery.isError && <div className="status">No riders saved yet. Add a wallet above to start your posse.</div>}
  </Shell>;
}
