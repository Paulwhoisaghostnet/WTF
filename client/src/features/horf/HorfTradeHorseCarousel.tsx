import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { advanceResolvedMediaFallback, resolveTokenThumbnail } from "../../lib/media-resolve";
import { logClientSystemEvent } from "../../lib/system-log";
import { objktTokenUrl } from "./token-input";

export type HorfTraderOffer = {
  id: number;
  ownerAddress: string;
  tokenContract: string;
  tokenId: string;
  amount: string;
  acceptedTokenPolicy: "marshal_only" | "any_qualifying";
  createdAt: string;
  updatedAt: string;
  name: string;
  image: string | null;
};

export type HorfTraderOffersResponse = {
  address: string;
  metadataStatus: "ready" | "unavailable";
  offers: HorfTraderOffer[];
};

const Shell = styled.div`
  min-width: 0;
  margin-top: 12px;
  padding: 11px;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 13px;
  background: #2b3d34;
  color: var(--horf-ink, #f4ead6);
  container-type: inline-size;
  .carousel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .carousel-head strong { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
  .carousel-head a { color: var(--horf-teal, #71b7a0); font-size: 12px; font-weight: 800; }
  .stage { display: grid; grid-template-columns: minmax(116px, 36%) minmax(0, 1fr); gap: 11px; min-height: 128px; overflow: hidden; border-radius: 10px; background: var(--horf-surface, #1b2723); }
  .art { position: relative; display: block; width: 100%; height: 100%; min-height: 128px; overflow: hidden; background: #2b3d34; }
  .art img { display: block; width: 100%; height: 100%; min-height: 128px; object-fit: cover; }
  .photo-note { position: absolute; right: 5px; bottom: 5px; left: 5px; padding: 3px 5px; border-radius: 3px; background: #132f2ddd; color: #fff; font-size: 9px; font-weight: 800; line-height: 1.2; }
  .details { min-width: 0; display: flex; flex-direction: column; align-items: start; justify-content: center; padding: 9px 10px 9px 0; }
  .details a { color: var(--horf-ink, #f4ead6); font: 700 17px/1.15 var(--horf-display, Georgia, serif); text-decoration: none; overflow-wrap: anywhere; }
  .details a:hover { color: var(--horf-teal, #71b7a0); text-decoration: underline; }
  .details small { display: block; margin-top: 5px; color: var(--horf-muted, #b7b5a7); font-size: 11px; line-height: 1.35; }
  .controls { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .controls span { color: var(--horf-muted, #b7b5a7); font-size: 11px; font-weight: 700; }
  .controls div { display: flex; gap: 5px; }
  .controls button { width: 32px; height: 32px; border: 1px solid #b6c9bd; border-radius: 50%; background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); cursor: pointer; font-size: 16px; }
  .controls button:hover:not(:disabled) { border-color: var(--horf-teal, #71b7a0); background: #2b4b41; }
  .controls button:disabled { opacity: .4; cursor: default; }
  .empty { margin: 0; padding: 13px 6px 5px; color: var(--horf-muted, #b7b5a7); font-size: 12px; line-height: 1.4; }
  @container (max-width: 390px) { .stage { grid-template-columns: 1fr; } .art, .art img { height: 150px; min-height: 150px; } .details { padding: 0 11px 11px; } }
`;

function shortAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function traderHref(address: string) {
  const season = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("season");
  return `/horf/traders/${encodeURIComponent(address)}${season ? `?season=${encodeURIComponent(season)}` : ""}`;
}

export function HorfTradeHorseCarousel({ address }: { address: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setVisible(false);
    const element = rootRef.current;
    if (!element || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [address]);

  useEffect(() => { setIndex(0); }, [address]);

  const query = useQuery({
    queryKey: ["horf", "trader-offers", address],
    queryFn: () => api.get<HorfTraderOffersResponse>(`/api/horf/traders/${encodeURIComponent(address)}/offers`),
    enabled: visible,
  });
  const offers = query.data?.offers || [];
  const currentIndex = offers.length ? Math.min(index, offers.length - 1) : 0;
  const offer = offers[currentIndex];
  const art = useMemo(() => offer?.image ? resolveTokenThumbnail({ thumbnail: offer.image }) : null, [offer?.image]);
  const photoPlaceholder = !art || imageFailed;

  useEffect(() => { setImageFailed(false); }, [offer?.id]);

  function choose(direction: -1 | 1) {
    if (offers.length < 2) return;
    const next = (currentIndex + direction + offers.length) % offers.length;
    setIndex(next);
    logClientSystemEvent({ eventType: "horf.trader_offer.selected", message: "Trader offer artwork selected", metadata: {
      address, direction: direction < 0 ? "previous" : "next", offerId: offers[next].id,
    } });
  }

  return <Shell ref={rootRef} data-horf-trader-offer-carousel data-horf-trader-address={address} aria-label={`Horses ${shortAddress(address)} has for trade on Horf`}>
    <div className="carousel-head"><strong>Horses for trade</strong><a data-horf-trader-profile-link href={traderHref(address)}>View trader’s stable ↗</a></div>
    {query.isPending || !visible ? <p className="empty" role="status">Checking this rider’s Horf offers…</p>
      : query.isError ? <p className="empty" role="alert">Offers are unavailable right now. Open the trader’s stable to retry.</p>
      : !offer ? <p className="empty">No active Horf offers from this rider right now.</p>
      : <>
        <div className="stage" data-horf-trader-offer-card>
          <a className="art" href={objktTokenUrl(offer.tokenContract, offer.tokenId)} target="_blank" rel="noopener noreferrer" aria-label={`View ${offer.name} on Objkt`}>
            <img data-horf-trader-offer-image src={photoPlaceholder ? "/horf-art/horse-gallop-photo.jpg" : art?.src || "/horf-art/horse-gallop-photo.jpg"} alt={photoPlaceholder ? "Horse photograph placeholder; token preview unavailable" : `${offer.name} token artwork`} loading="lazy" onError={(event) => {
              if (!art || !advanceResolvedMediaFallback(event.currentTarget, art)) setImageFailed(true);
            }} />
            {photoPlaceholder && <span className="photo-note">Photo placeholder · check Objkt</span>}
          </a>
          <div className="details"><a href={objktTokenUrl(offer.tokenContract, offer.tokenId)} target="_blank" rel="noopener noreferrer">{offer.name}</a><small>#{offer.tokenId} · {offer.amount} {offer.amount === "1" ? "edition" : "editions"} offered</small><small>{offer.acceptedTokenPolicy === "marshal_only" ? "Wants a Marshal approved horse" : "Open to any qualifying horse on trust"}</small></div>
        </div>
        <div className="controls"><span>{currentIndex + 1} of {offers.length} Horf offers</span><div><button data-horf-trader-offer-prev type="button" onClick={() => choose(-1)} disabled={offers.length < 2} aria-label={`Previous horse offered by ${shortAddress(address)}`}>←</button><button data-horf-trader-offer-next type="button" onClick={() => choose(1)} disabled={offers.length < 2} aria-label={`Next horse offered by ${shortAddress(address)}`}>→</button></div></div>
      </>}
  </Shell>;
}
