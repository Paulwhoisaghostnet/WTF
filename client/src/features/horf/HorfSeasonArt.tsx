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
  grid-template-columns: minmax(0, 1.1fr) minmax(250px, .9fr);
  min-width: 0;
  min-height: 310px;
  overflow: hidden;
  border: 1px solid #ccdbd1;
  border-radius: 18px;
  background: #132f2d;
  color: #f6f8f3;
  box-shadow: 0 16px 30px #17383114;

  .art-pane { position: relative; min-height: 310px; overflow: hidden; background: #425b52; }
  .art-pane img { display: block; position: absolute; inset: 0; width: 100%; height: 100%; }
  .photo-layer { object-fit: cover; object-position: center; }
  .token-layer { object-fit: contain; background: #e1ebe4; opacity: 0; transition: opacity 360ms ease; }
  .token-layer.is-ready { opacity: 1; }
  .art-stamp { position: absolute; left: 18px; bottom: 18px; z-index: 2; padding: 6px 9px; border-radius: 4px; background: #132f2de8; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .story { display: flex; flex-direction: column; justify-content: center; min-width: 0; padding: clamp(22px, 4vw, 42px); }
  .eyebrow { margin: 0 0 11px; color: #f5b665; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  h2 { margin: 0 0 13px; font: 700 clamp(25px, 3vw, 39px)/1.05 var(--horf-display, "Avenir Next", sans-serif); letter-spacing: -.035em; }
  .horse-name { margin: 0 0 5px; color: #f4e7c9; font-size: 17px; font-weight: 800; overflow-wrap: anywhere; }
  .horse-meta { margin: 0 0 17px; color: #b8cec5; font-size: 12px; overflow-wrap: anywhere; }
  .horse-meta a { color: inherit; }
  .objkt-link { align-self: start; color: #fff; font-size: 13px; font-weight: 800; text-decoration-color: #f5b665; text-underline-offset: 5px; }
  .controls { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: auto; padding-top: 24px; }
  .controls button { min-height: 34px; padding: 6px 11px; border: 1px solid #799188; border-radius: 999px; background: transparent; color: #f6f8f3; font-size: 12px; font-weight: 800; cursor: pointer; }
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
  return items.flatMap((candidate) => {
    const horse = candidate as Partial<MintedHorse> | null;
    if (!horse || typeof horse.contract !== "string" ||
        typeof horse.tokenId !== "string" || typeof horse.image !== "string") return [];
    const art = resolveTokenThumbnail({ thumbnail: horse.image });
    if (!art) return [];
    return [{
      kind: "token" as const,
      key: `${horse.contract}:${horse.tokenId}`,
      contract: horse.contract,
      tokenId: horse.tokenId,
      name: typeof horse.name === "string" && horse.name.trim() ? horse.name : `Horse #${horse.tokenId}`,
      image: horse.image,
      creatorAddress: typeof horse.creatorAddress === "string" ? horse.creatorAddress : null,
      art,
    }];
  });
}

export function HorfSeasonArt() {
  const query = useQuery({
    queryKey: ["horf", "season-art", "current-2026"],
    queryFn: () => api.get<unknown>("/api/horf/open-range?season=current-2026"),
    refetchOnWindowFocus: true,
  });
  const tokenSlides = useMemo(() => mintedTokenSlides(query.data), [query.data]);
  const slides: Slide[] = tokenSlides.length ? tokenSlides : PHOTO_SLIDES;
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

  const slide = slides[index % slides.length]!;
  const tokenSlide = slide.kind === "token" ? slide : null;
  const photoFallback = PHOTO_SLIDES[index % PHOTO_SLIDES.length]!;
  const photograph = slide.kind === "photo" ? slide.image : photoFallback.image;
  const tokenArtReady = slide.kind === "token" && readyKey === slide.key && failedKey !== slide.key;
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

  return <Feature data-horf-season-art aria-label="Fresh horse art from Neighvember 2026" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocusCapture={() => setHeld(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false); }}>
    <div className="art-pane">
      <img className="photo-layer" src={photograph} alt="" data-horf-season-art-image={tokenArtReady ? undefined : ""} />
      {slide.kind === "token" && failedKey !== slide.key && <img key={slide.key} className={tokenArtReady ? "token-layer is-ready" : "token-layer"} data-horf-season-art-image={tokenArtReady ? "" : undefined} src={slide.art.src} alt={`${slide.name} token artwork`} onLoad={() => setReadyKey(slide.key)} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, slide.art)) { setFailedKey(slide.key); setReadyKey(null); } }} />}
      <span className="art-stamp">{tokenArtReady ? "Actual Tezos mint" : "Horse photography"}</span>
    </div>
    <div className="story">
      <p className="eyebrow">Fresh from Neighvember 2026</p>
      <h2>Horses on the trail</h2>
      <p className="horse-name" data-horf-season-art-token>{slide.name}</p>
      <p className="horse-meta">{slide.kind === "token" ? `Minted this season${slide.creatorAddress ? ` · by ${shortCreator(slide.creatorAddress)}` : ""}${failedKey === slide.key ? ` · Preview unavailable; ${photoFallback.credit}` : ""}` : slide.credit}</p>
      {tokenSlide && objktUrl && <a className="objkt-link" data-horf-season-art-objkt href={objktUrl} target="_blank" rel="noopener noreferrer" onClick={() => logClientSystemEvent({ eventType: "horf.season_art.objkt_opened", message: "Featured Neighvember horse opened on Objkt", metadata: { contract: tokenSlide.contract, tokenId: tokenSlide.tokenId } })}>View this horse on Objkt ↗</a>}
      <div className="controls">
        <button data-horf-season-art-prev type="button" onClick={() => step(-1)} aria-label="Previous horse artwork">← Previous</button>
        <button data-horf-season-art-next type="button" onClick={() => step(1)} aria-label="Next horse artwork">Next →</button>
        <button data-horf-season-art-toggle type="button" onClick={toggleRotation} aria-label={paused ? "Resume horse art rotation" : "Pause horse art rotation"}>{paused ? "Resume" : "Pause"}</button>
        <span className="count">{index % slides.length + 1} / {slides.length}</span>
      </div>
    </div>
  </Feature>;
}
