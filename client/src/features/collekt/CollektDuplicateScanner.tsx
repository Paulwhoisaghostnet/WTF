import { useMemo, useState } from "react";
import { Button, Hourglass, TextInput } from "react95";
import {
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
  Layers3,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import styled from "styled-components";

import type {
  CollektDuplicateScanResponse,
  CollektDuplicateToken,
} from "@shared/collekt";
import { WTF_TOKEN } from "@shared/types";
import { api } from "../../lib/api";
import { RecoverableIpfsImage } from "../../components/RecoverableIpfsImage";
import { useWallet } from "../../lib/wallet-context";
import {
  approveMarketplaceForWtf,
  placeMarketplaceOffer,
} from "../../lib/tezos/marketplace";
import { parseWtfInputToRaw } from "../marketplace/utils";
import type { MarketplaceContractVersion } from "../marketplace/types";

const Shell = styled.section`
  --dt-ink: #171713;
  --dt-muted: #5f625b;
  --dt-paper: #f5f1e7;
  --dt-panel: #fffdf7;
  --dt-line: #c8c5b9;
  --dt-accent: #126a55;
  --dt-accent-2: #dd5f34;
  display: grid;
  gap: 14px;
  min-height: 100%;
  color: var(--dt-ink);

  &[data-presentation-host="gamma"] {
    --dt-ink: #f3ecdc;
    --dt-muted: rgba(243, 236, 220, 0.7);
    --dt-paper: #080807;
    --dt-panel: #11110f;
    --dt-line: rgba(243, 236, 220, 0.2);
    --dt-accent: #2bd8a7;
    --dt-accent-2: #ff7a4d;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }

  button, input, select { font: inherit; }
  button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--dt-accent) 55%, transparent);
    outline-offset: 2px;
  }
`;

const Intro = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: end;
  padding: clamp(16px, 3vw, 28px);
  background: var(--dt-paper);
  border: 1px solid var(--dt-line);

  h1 { margin: 0; font-size: clamp(1.6rem, 4vw, 2.8rem); line-height: 0.95; letter-spacing: -0.04em; }
  p { margin: 10px 0 0; max-width: 68ch; color: var(--dt-muted); line-height: 1.5; }
  @media (max-width: 700px) { grid-template-columns: 1fr; align-items: start; }
`;

const FilterStamp = styled.div`
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 1px;
  background: var(--dt-line);
  border: 1px solid var(--dt-line);
  white-space: nowrap;
  > span { padding: 8px 10px; background: var(--dt-panel); font-size: 0.78rem; }
  strong { display: block; font-size: 1rem; color: var(--dt-accent); }
`;

const SearchPanel = styled.form`
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 8px;
  align-items: end;
  padding: 12px;
  border: 1px solid var(--dt-line);
  background: var(--dt-panel);
  label { display: grid; gap: 6px; font-size: 0.82rem; font-weight: 700; }
  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;

const ActionButton = styled(Button)`
  min-height: 40px;
  display: inline-flex !important;
  gap: 7px;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
`;

const StatusLine = styled.div<{ $error?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid ${p => p.$error ? "#bd3c2d" : "var(--dt-line)"};
  background: var(--dt-panel);
  color: ${p => p.$error ? "#bd3c2d" : "var(--dt-muted)"};
  font-size: 0.85rem;
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--dt-line);
  background: var(--dt-line);
  gap: 1px;
  > div { padding: 12px; background: var(--dt-panel); min-width: 0; }
  strong { display: block; font-size: clamp(1.25rem, 3vw, 2rem); color: var(--dt-accent); }
  span { color: var(--dt-muted); font-size: 0.76rem; }
  @media (max-width: 680px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 8px 0;
`;

const SearchWithin = styled.label`
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: min(100%, 280px);
  padding: 7px 9px;
  border: 1px solid var(--dt-line);
  background: var(--dt-panel);
  input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--dt-ink); }
`;

const SortSelect = styled.label`
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--dt-muted);
  font-size: 0.78rem;
  select { min-height: 34px; border: 1px solid var(--dt-line); background: var(--dt-panel); color: var(--dt-ink); padding: 0 8px; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr));
  gap: 12px;
`;

const Card = styled.article`
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  border: 1px solid var(--dt-line);
  background: var(--dt-panel);
`;

const Media = styled.div`
  position: relative;
  aspect-ratio: 16 / 10;
  background: color-mix(in srgb, var(--dt-paper) 82%, var(--dt-accent));
  overflow: hidden;
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  > span { position: absolute; top: 9px; left: 9px; padding: 5px 7px; background: rgba(8,8,7,.84); color: #fff; font-size: .72rem; }
`;

const CardBody = styled.div`
  display: grid;
  gap: 11px;
  padding: 13px;
  h2 { margin: 0; font-size: 1.08rem; line-height: 1.15; }
  .byline { margin: 3px 0 0; color: var(--dt-muted); font-size: .76rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

const EditionMeter = styled.div`
  display: grid;
  gap: 5px;
  font-size: .74rem;
  color: var(--dt-muted);
  > div { height: 6px; background: color-mix(in srgb, var(--dt-line) 70%, transparent); }
  i { display: block; height: 100%; min-width: 4px; background: var(--dt-accent); }
`;

const PriceGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  background: var(--dt-line);
  border: 1px solid var(--dt-line);
  > div { min-width: 0; padding: 8px; background: var(--dt-paper); }
  dt { color: var(--dt-muted); font-size: .66rem; }
  dd { margin: 4px 0 0; font-size: .88rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
`;

const MetadataRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--dt-muted);
  font-size: .72rem;
`;

const OfferDrawer = styled.aside`
  position: fixed;
  z-index: 9200;
  right: 18px;
  bottom: 18px;
  width: min(420px, calc(100vw - 36px));
  max-height: calc(100vh - 36px);
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--dt-line);
  background: var(--dt-panel);
  color: var(--dt-ink);
  box-shadow: 0 18px 48px rgba(0,0,0,.28);
  h2 { margin: 0; font-size: 1.25rem; }
  p { color: var(--dt-muted); line-height: 1.45; }
  label { display: grid; gap: 6px; font-size: .78rem; font-weight: 700; }
`;

const DrawerHead = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
  button { border: 0; background: transparent; color: inherit; min-width: 34px; min-height: 34px; }
`;

const Terms = styled.dl`
  display: grid;
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--dt-line);
  dt { color: var(--dt-muted); font-size: .68rem; }
  dd { margin: 1px 0 0; font-size: .78rem; overflow-wrap: anywhere; }
`;

type SortMode = "balance" | "delta" | "recent";

function shortAddress(value: string) {
  return `${value.slice(0, 7)}…${value.slice(-5)}`;
}

function formatXtz(mutez: string | null, signed = false) {
  if (mutez === null) return "Unknown";
  try {
    const value = Number(BigInt(mutez)) / 1_000_000;
    const sign = signed && value > 0 ? "+" : "";
    return `${sign}${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ꜩ`;
  } catch { return "Unknown"; }
}

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function tokenUrl(item: CollektDuplicateToken) {
  return `https://objkt.com/tokens/${item.contract}/${item.tokenId}`;
}

function recordCollektEvent(
  eventType: "collekt.duplicates.scanned" | "collekt.offer.terms_previewed" | "collekt.offer.placed",
  tokenRef: string,
  metadata: Record<string, unknown>
) {
  void api.post("/api/collekt/events", { eventType, tokenRef, metadata }).catch(() => undefined);
}

export function CollektDuplicateScanner({ presentationHost }: { presentationHost: string }) {
  const initialWallet = new URLSearchParams(window.location.search).get("wallet") ?? "";
  const [wallet, setWallet] = useState(initialWallet);
  const [data, setData] = useState<CollektDuplicateScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("balance");
  const [offerToken, setOfferToken] = useState<CollektDuplicateToken | null>(null);
  const [offerWtf, setOfferWtf] = useState("");
  const [offerStatus, setOfferStatus] = useState<"idle" | "approving" | "placing" | "success">("idle");
  const [offerError, setOfferError] = useState("");
  const [offerHash, setOfferHash] = useState("");
  const { address, connect, isConnecting, providerName } = useWallet();

  const scan = async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get<CollektDuplicateScanResponse>(
        `/api/collekt/duplicates?wallet=${encodeURIComponent(wallet.trim())}${refresh ? "&refresh=1" : ""}`
      );
      setData(response);
      recordCollektEvent("collekt.duplicates.scanned", response.walletAddress, {
        duplicateArtTokens: response.summary.duplicateArtTokens,
        duplicateEditions: response.summary.duplicateEditions,
        refresh,
      });
      const url = new URL(window.location.href);
      url.searchParams.set("wallet", response.walletAddress);
      window.history.replaceState({}, "", url);
    } catch (err: any) {
      setError(err?.message || "Unable to scan this wallet right now.");
    } finally { setLoading(false); }
  };

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = (data?.items ?? []).filter((item) =>
      !needle || [item.name, item.collectionName, item.creatorName, item.contract, item.tokenId]
        .some((value) => String(value ?? "").toLowerCase().includes(needle))
    );
    return [...filtered].sort((a, b) => {
      if (sort === "recent") return Date.parse(b.acquiredAt ?? "0") - Date.parse(a.acquiredAt ?? "0");
      if (sort === "delta") return Number(b.deltaPercent ?? -Infinity) - Number(a.deltaPercent ?? -Infinity);
      return b.balance - a.balance || a.name.localeCompare(b.name);
    });
  }, [data, query, sort]);

  const openOffer = (item: CollektDuplicateToken) => {
    setOfferToken(item);
    setOfferWtf("");
    setOfferStatus("idle");
    setOfferError("");
    setOfferHash("");
    recordCollektEvent("collekt.offer.terms_previewed", item.key, {
      ownerAddress: item.ownerAddress,
      quantity: 1,
    });
  };

  const submitOffer = async () => {
    if (!offerToken) return;
    if (!address) {
      try { await connect(); } catch (err: any) { setOfferError(err?.message || "Wallet connection failed."); }
      return;
    }
    const raw = parseWtfInputToRaw(offerWtf);
    if (!raw) {
      setOfferError(`Enter a positive WTF amount with up to ${WTF_TOKEN.decimals} decimals.`);
      return;
    }
    setOfferError("");
    try {
      const market = await api.get<{ contractVersion: MarketplaceContractVersion; paused: boolean }>(
        "/api/marketplace/onchain?limit=1"
      );
      if (market.paused) throw new Error("The wtfOS marketplace is currently paused.");
      setOfferStatus("approving");
      await approveMarketplaceForWtf(address);
      setOfferStatus("placing");
      const opHash = await placeMarketplaceOffer({
        walletAddress: address,
        tokenContract: offerToken.contract,
        tokenId: offerToken.tokenId,
        tokenAmount: 1,
        quantity: 1,
        amountWtf: raw,
        unitPriceWtf: raw,
        targetOwner: offerToken.ownerAddress,
        contractVersion: market.contractVersion,
      });
      setOfferHash(opHash);
      setOfferStatus("success");
      recordCollektEvent("collekt.offer.placed", offerToken.key, {
        ownerAddress: offerToken.ownerAddress,
        quantity: 1,
        unitPriceWtf: String(raw),
        opHash,
      });
    } catch (err: any) {
      setOfferStatus("idle");
      setOfferError(err?.message || "The offer was not placed.");
    }
  };

  return (
    <Shell data-presentation-host={presentationHost} data-collekt-region="duplicate-scanner">
      <Intro>
        <div>
          <h1>Double Take</h1>
          <p>Scan any Tezos wallet for art editions it holds more than once. Currency-like tokens are removed automatically; pricing stays honest about what the index can and cannot prove.</p>
        </div>
        <FilterStamp aria-label="Art token filters">
          <span><strong>2+</strong>held</span>
          <span><strong>≤5K</strong>supply</span>
          <span><strong>0</strong>decimals</span>
        </FilterStamp>
      </Intro>

      <SearchPanel onSubmit={(event) => { event.preventDefault(); void scan(false); }}>
        <label htmlFor="duplicate-wallet">
          Wallet address
          <TextInput id="duplicate-wallet" value={wallet} onChange={(event) => setWallet(event.currentTarget.value)} placeholder="tz1… or KT1…" fullWidth aria-describedby="duplicate-wallet-help" />
          <span id="duplicate-wallet-help" style={{ color: "var(--dt-muted)", fontWeight: 400 }}>Read-only scan. No wallet connection is needed to look.</span>
        </label>
        <ActionButton type="submit" disabled={loading || !wallet.trim()}>
          {loading ? <Hourglass size={18} /> : <Search size={17} />} {loading ? "Scanning chain…" : "Scan duplicates"}
        </ActionButton>
      </SearchPanel>

      {error && <StatusLine $error role="alert">{error}</StatusLine>}
      {data && (
        <>
          <Summary aria-label="Scan summary">
            <div><strong>{data.summary.duplicateArtTokens}</strong><span>duplicate art tokens</span></div>
            <div><strong>{data.summary.duplicateEditions}</strong><span>editions held</span></div>
            <div><strong>{data.summary.knownAcquisitionPrices}/{data.summary.duplicateArtTokens}</strong><span>known acquisition prices</span></div>
            <div><strong>{data.summary.knownLastSales}/{data.summary.duplicateArtTokens}</strong><span>known last sales</span></div>
          </Summary>

          <StatusLine>
            <ShieldCheck size={17} /> Live holdings from TzKT · indexed pricing from wtfOS · scanned {formatDate(data.source.fetchedAt)}
            <ActionButton onClick={() => void scan(true)} disabled={loading} style={{ marginLeft: "auto", minHeight: 30 }}><RefreshCw size={14} /> Refresh</ActionButton>
          </StatusLine>

          {data.items.length ? (
            <>
              <Toolbar>
                <SearchWithin><Search size={15} /><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Filter name, creator, collection…" aria-label="Filter duplicate results" /></SearchWithin>
                <SortSelect><ArrowDownUp size={15} /> Sort <select value={sort} onChange={(event) => setSort(event.currentTarget.value as SortMode)} aria-label="Sort duplicate results"><option value="balance">Most held</option><option value="delta">Best price delta</option><option value="recent">Recently acquired</option></select></SortSelect>
              </Toolbar>
              <Grid>
                {visibleItems.map((item) => {
                  const pct = Math.max(0, Math.min(100, (item.balance / item.totalSupply) * 100));
                  return (
                    <Card key={item.key}>
                      <Media>
                        {item.thumbnailUri ? <RecoverableIpfsImage src={item.thumbnailUri} alt="" loading="lazy" /> : <Layers3 size={54} aria-hidden="true" style={{ position: "absolute", inset: "50% auto auto 50%", transform: "translate(-50%,-50%)", opacity: .45 }} />}
                        <span>{item.balance} of {item.totalSupply} editions</span>
                      </Media>
                      <CardBody>
                        <div><h2>{item.name}</h2><p className="byline">{item.collectionName || item.creatorName || shortAddress(item.contract)} · #{item.tokenId}</p></div>
                        <EditionMeter><span>Wallet owns {(pct).toLocaleString(undefined, { maximumFractionDigits: 2 })}% of supply</span><div><i style={{ width: `${pct}%` }} /></div></EditionMeter>
                        <PriceGrid>
                          <div><dt>Paid / edition</dt><dd>{formatXtz(item.acquisitionUnitCostMutez)}</dd></div>
                          <div><dt>Last sale</dt><dd>{formatXtz(item.lastSaleMutez)}</dd></div>
                          <div><dt>Delta</dt><dd style={{ color: item.deltaMutez?.startsWith("-") ? "#bd3c2d" : "var(--dt-accent)" }}>{formatXtz(item.deltaMutez, true)}</dd></div>
                        </PriceGrid>
                        <MetadataRow><span>Acquired {formatDate(item.acquiredAt)}</span><span>{item.saleCount} sale{item.saleCount === 1 ? "" : "s"}</span></MetadataRow>
                        <MetadataRow>
                          <a href={tokenUrl(item)} target="_blank" rel="noopener noreferrer">View token <ExternalLink size={12} /></a>
                          <ActionButton onClick={() => openOffer(item)} disabled={address === item.ownerAddress} style={{ minHeight: 32 }}><WalletCards size={15} /> Make offer</ActionButton>
                        </MetadataRow>
                      </CardBody>
                    </Card>
                  );
                })}
              </Grid>
            </>
          ) : (
            <StatusLine><Layers3 size={18} /> No qualifying duplicate art tokens were found. Tokens with decimals, unknown supply, or supply above 5,000 are intentionally excluded.</StatusLine>
          )}
        </>
      )}

      {offerToken && (
        <OfferDrawer role="dialog" aria-modal="true" aria-labelledby="duplicate-offer-title">
          <DrawerHead><div><h2 id="duplicate-offer-title">Offer on {offerToken.name}</h2><p>One edition from {shortAddress(offerToken.ownerAddress)}</p></div><button onClick={() => setOfferToken(null)} aria-label="Close offer panel"><X size={20} /></button></DrawerHead>
          {offerStatus === "success" ? (
            <StatusLine><CheckCircle2 size={18} /> Offer confirmed. <a href={`https://tzkt.io/${offerHash}`} target="_blank" rel="noopener noreferrer">View operation</a></StatusLine>
          ) : (
            <>
              <Terms>
                <div><dt>Token</dt><dd>{offerToken.contract} / #{offerToken.tokenId}</dd></div>
                <div><dt>Target owner</dt><dd>{offerToken.ownerAddress}</dd></div>
                <div><dt>Quantity</dt><dd>1 edition</dd></div>
                <div><dt>Signing wallet</dt><dd>{address ? `${shortAddress(address)} via ${providerName || "Tezos wallet"}` : "Not connected"}</dd></div>
              </Terms>
              <label htmlFor="duplicate-offer-wtf">Offer per edition (WTF)<TextInput id="duplicate-offer-wtf" value={offerWtf} onChange={(event) => setOfferWtf(event.currentTarget.value)} placeholder="0.00" fullWidth disabled={!address || offerStatus !== "idle"} /></label>
              <p><ShieldCheck size={14} /> Placing an offer requires two wallet confirmations: approve the marketplace to escrow WTF, then sign the exact offer terms.</p>
              {offerError && <StatusLine $error role="alert">{offerError}</StatusLine>}
              <ActionButton onClick={() => void submitOffer()} disabled={isConnecting || offerStatus !== "idle"} fullWidth>
                {!address ? <><WalletCards size={16} /> {isConnecting ? "Connecting…" : "Connect wallet"}</> : offerStatus === "approving" ? <><Hourglass size={16} /> Approving WTF…</> : offerStatus === "placing" ? <><Hourglass size={16} /> Signing offer…</> : <><WalletCards size={16} /> Approve WTF & place offer</>}
              </ActionButton>
            </>
          )}
        </OfferDrawer>
      )}
    </Shell>
  );
}
