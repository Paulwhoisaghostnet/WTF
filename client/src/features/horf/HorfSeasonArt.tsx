import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { advanceResolvedMediaFallback, resolveTokenThumbnail, type ResolvedThumbnail } from "../../lib/media-resolve";
import { logClientSystemEvent } from "../../lib/system-log";
import { objktTokenUrl } from "./token-input";

type MintedHorse = {
  contract: string;
  tokenId: string;
  name: string;
  image: string | null;
  creatorAddress: string | null;
};

type TokenSlide = MintedHorse & {
  kind: "token";
  key: string;
  art: ResolvedThumbnail;
};

type PhotoSlide = {
  kind: "photo";
  key: string;
  image: string;
  name: string;
  credit: string;
};

type Slide = TokenSlide | PhotoSlide;

const PHOTO_SLIDES: PhotoSlide[] = [
  {
    kind: "photo",
    key: "gallop",
    image: "/horf-art/horse-gallop-photo.jpg",
    name: "A thoroughbred on the move",
    credit: "Photo: Opittman / Wikimedia Commons · CC0",
  },
  {
    kind: "photo",
    key: "beach",
    image: "/horf-art/horse-beach-photo.jpg",
    name: "The long ride home",
    credit: "Photo: Yudi Susilo / Wikimedia Commons · CC0",
  },
  {
    kind: "photo",
    key: "portrait",
    image: "/horf-art/horse-portrait-photo.jpg",
    name: "A fine face from the stable",
    credit: "Photo: MarkBuckawicki / Wikimedia Commons · CC0",
  },
];

const Feature = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(240px, .7fr);
  min-width: 0;
  min-height: 350px;
  overflow: hidden;
  border: 1px solid var(--horf-line, #3d5148);
  border-radius: 18px;
  background: #132f2d;
  color: #f6f8f3;
  box-shadow: 0 16px 30px #00000035;

  .art-pane { position: relative; min-height: 350px; overflow: hidden; background: #24332d; }
  .art-pane img { display: block; position: absolute; inset: 0; width: 100%; height: 100%; }
  .photo-layer { object-fit: cover; object-position: center; }
  .token-layer { object-fit: contain; background: var(--horf-field, #24332d); opacity: 0; transition: opacity 360ms ease; }
  .token-layer.is-ready { opacity: 1; }
  .art-pending { display: grid; place-items: center; height: 100%; color: #b8cec5; font-size: 76px; }
  .photo-credit { position: absolute; left: 12px; right: 12px; bottom: 12px; padding: 5px 8px; border-radius: 5px; background: #102421dd; color: #fff; font-size: 11px; line-height: 1.25; }
  .story { display: flex; flex-direction: column; justify-content: center; min-width: 0; padding: clamp(22px, 4vw, 42px); }
  .eyebrow { margin: 0 0 11px; color: #f5b665; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  h2 { margin: 0 0 13px; color: #f4e7c9; font: 700 clamp(25px, 3vw, 39px)/1.05 var(--horf-display, "Avenir Next", sans-serif); letter-spacing: -.035em; overflow-wrap: anywhere; }
  .horse-meta { margin: 0 0 17px; color: #b8cec5; font-size: 12px; overflow-wrap: anywhere; }
  .horse-meta a { color: inherit; }
  .objkt-link { align-self: start; color: #fff; font-size: 13px; font-weight: 800; text-decoration-color: #f5b665; text-underline-offset: 5px; }
  .controls { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: auto; padding-top: 24px; }
  .controls button { min-width: 38px; min-height: 38px; padding: 5px 9px; border: 1px solid #799188; border-radius: 999px; background: transparent; color: #f6f8f3; font-size: 18px; font-weight: 800; cursor: pointer; }
  .controls button:hover { border-color: #f5b665; background: #294a42; }
  .controls .count { margin-left: auto; color: #b8cec5; font-size: 11px; font-weight: 800; letter-spacing: .08em; }

  @container (max-width: 620px) {
    grid-template-columns: 1fr;
    .art-pane { min-height: 220px; }
    .story { min-height: 220px; }
  }
  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    .art-pane { min-height: 220px; }
    .story { min-height: 220px; }
  }
  @media (prefers-reduced-motion: reduce) { .token-layer { transition: none; } }
`;

function shortCreator(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function mintedTokenSlides(value: unknown): TokenSlide[] {
  const items = (value as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  return items.flatMap((candidate) => {
    const horse = candidate as Partial<MintedHorse> | null;
    if (!horse || typeof horse.contract !== "string" ||
        typeof horse.tokenId !== "string" || typeof horse.image !== "string") return [];
    const key = `${horse.contract}:${horse.tokenId}`;
    if (seen.has(key)) return [];
    const art = resolveTokenThumbnail({ thumbnail: horse.image });
    if (!art) return [];
    seen.add(key);
    return [{
      kind: "token" as const,
      key,
      contract: horse.contract,
      tokenId: horse.tokenId,
      name: typeof horse.name === "string" && horse.name.trim() ? horse.name : `Horse #${horse.tokenId}`,
      image: horse.image,
      creatorAddress: typeof horse.creatorAddress === "string" ? horse.creatorAddress : null,
      art,
    }];
  });
}

function useCurrentHorfMintSlides() {
  const query = useQuery({
    queryKey: ["horf", "season-art", "current-2026"],
    queryFn: () => api.get<unknown>("/api/horf/open-range?season=current-2026"),
    refetchOnWindowFocus: true,
  });
  const tokenSlides = useMemo(() => mintedTokenSlides(query.data), [query.data]);
  return { tokenSlides, loading: query.isPending };
}

export function HorfWantedArtwork() {
  const { tokenSlides, loading } = useCurrentHorfMintSlides();
  const [failedKeys, setFailedKeys] = useState<Set<string>>(() => new Set());
  const preferredMints = tokenSlides.length > 1 ? [tokenSlides[1]!, tokenSlides[0]!, ...tokenSlides.slice(2)] : tokenSlides;
  const mint = preferredMints.find((item) => !failedKeys.has(item.key)) ?? null;

  if (mint) return <a data-horf-wanted-mint href={objktTokenUrl(mint.contract, mint.tokenId)} target="_blank" rel="noopener noreferrer" aria-label={`View ${mint.name} on Objkt`} onClick={() => logClientSystemEvent({ eventType: "horf.season_art.objkt_opened", message: "Featured Neighvember horse opened on Objkt", metadata: { contract: mint.contract, tokenId: mint.tokenId, source: "wanted-poster" } })}>
    <img key={mint.key} src={mint.art.src} alt={`${mint.name} horse artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, mint.art)) setFailedKeys((current) => new Set(current).add(mint.key)); }} />
    <span className="mint-caption">{mint.name} ↗</span>
  </a>;
  if (loading) return <span className="art-pending" role="status" aria-label="Finding Neighvember horse art"><span aria-hidden="true">🐎</span></span>;
  return <><img className="photo-fallback" src="/horf-art/horse-portrait-photo.jpg" alt="Horse portrait photograph" /><span className="mint-caption">MarkBuckawicki · CC0</span></>;
}

export function HorfSeasonArt() {
  const { tokenSlides, loading } = useCurrentHorfMintSlides();
  const slides: Slide[] = tokenSlides.length ? tokenSlides : loading ? [] : PHOTO_SLIDES;
  const [index, setIndex] = useState(0);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => { setIndex(0); setReadyKey(null); setFailedKey(null); }, [tokenSlides.length]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (paused || held || reducedMotion || slides.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), 8000);
    return () => window.clearInterval(timer);
  }, [held, paused, reducedMotion, slides.length]);

  const slide = slides.length ? slides[index % slides.length]! : null;
  const tokenSlide = slide?.kind === "token" ? slide : null;
  const photoFallback = PHOTO_SLIDES[index % PHOTO_SLIDES.length]!;
  const photograph = slide?.kind === "photo" ? slide.image : photoFallback.image;
  const tokenArtReady = slide?.kind === "token" && readyKey === slide.key && failedKey !== slide.key;
  const objktUrl = tokenSlide ? objktTokenUrl(tokenSlide.contract, tokenSlide.tokenId) : null;

  function step(delta: number) {
    setIndex((current) => (current + slides.length + delta) % slides.length);
    setReadyKey(null);
    logClientSystemEvent({
      eventType: delta > 0 ? "horf.season_art.next" : "horf.season_art.previous",
      message: "Featured Neighvember horse changed",
      metadata: { direction: delta > 0 ? "next" : "previous" },
    });
  }

  function toggleRotation() {
    setPaused((current) => !current);
    logClientSystemEvent({
      eventType: "horf.season_art.rotation_toggled",
      message: "Featured Neighvember horse rotation changed",
      metadata: { paused: !paused },
    });
  }

  if (!slide) return <Feature data-horf-season-art aria-label="Horses on the trail">
    <div className="art-pane"><div className="art-pending" role="status" aria-label="Finding Neighvember horse art"><span aria-hidden="true">🐎</span></div></div>
    <div className="story"><p className="eyebrow">Neighvember 2026</p><h2>Fresh horses</h2></div>
  </Feature>;

  return <Feature data-horf-season-art aria-label="Horses on the trail" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocusCapture={() => setHeld(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false); }}>
    <div className="art-pane">
      {(slide.kind === "photo" || failedKey === slide.key) && <><img className="photo-layer" src={photograph} alt="" data-horf-season-art-image={tokenArtReady ? undefined : ""} /><span className="photo-credit">{slide.kind === "photo" ? slide.credit : `Photo shown · ${photoFallback.credit}`}</span></>}
      {slide.kind === "token" && failedKey !== slide.key && <img key={slide.key} className={tokenArtReady ? "token-layer is-ready" : "token-layer"} data-horf-season-art-image={tokenArtReady ? "" : undefined} src={slide.art.src} alt={`${slide.name} token artwork`} onLoad={() => setReadyKey(slide.key)} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, slide.art)) { setFailedKey(slide.key); setReadyKey(null); } }} />}
    </div>
    <div className="story">
      <p className="eyebrow">{slide.kind === "token" ? "Neighvember 2026" : "From the range"}</p>
      <h2 data-horf-season-art-token>{slide.name}</h2>
      {slide.kind === "token" && slide.creatorAddress && <p className="horse-meta">by <a href={`https://objkt.com/profile/${encodeURIComponent(slide.creatorAddress)}`} target="_blank" rel="noopener noreferrer">{shortCreator(slide.creatorAddress)}</a></p>}
      {tokenSlide && objktUrl && <a className="objkt-link" data-horf-season-art-objkt href={objktUrl} target="_blank" rel="noopener noreferrer" onClick={() => logClientSystemEvent({ eventType: "horf.season_art.objkt_opened", message: "Featured Neighvember horse opened on Objkt", metadata: { contract: tokenSlide.contract, tokenId: tokenSlide.tokenId } })}>View this horse on Objkt ↗</a>}
      <div className="controls">
        <button data-horf-season-art-prev data-compact-control="true" type="button" onClick={() => step(-1)} aria-label="Previous horse artwork" title="Previous horse artwork">←</button>
        <button data-horf-season-art-next data-compact-control="true" type="button" onClick={() => step(1)} aria-label="Next horse artwork" title="Next horse artwork">→</button>
        <button data-horf-season-art-toggle data-compact-control="true" type="button" onClick={toggleRotation} aria-label={paused ? "Resume horse art rotation" : "Pause horse art rotation"} title={paused ? "Resume horse art rotation" : "Pause horse art rotation"}>{paused ? "▶" : "⏸"}</button>
        <span className="count">{index % slides.length + 1} / {slides.length}</span>
      </div>
    </div>
  </Feature>;
}
