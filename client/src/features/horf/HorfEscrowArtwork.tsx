import { useEffect, useRef, useState } from "react";
import { advanceResolvedMediaFallback, type ResolvedThumbnail } from "../../lib/media-resolve";
import {
  resolveHorfHorseCardArt,
  resolveHorfHorseArt,
  resolveHorfHorseVideo,
  uniqueHorfThumbnailIdentities,
  type HorfHorseMedia,
} from "./horse-media";

type EscrowArtworkProps = {
  contract: string;
  tokenId: string;
  name: string;
  media: HorfHorseMedia | null | undefined;
  uniqueThumbnails?: ReadonlySet<string>;
  preferExactArtwork?: boolean;
};

function VideoArtwork({ video, poster, name }: { video: ResolvedThumbnail; poster: ResolvedThumbnail | null; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (visible && !failed) void ref.current?.play().catch(() => { /* The poster remains visible. */ });
  }, [visible, failed, video.src]);

  if (failed) return poster ? <ImageArtwork art={poster} name={name} /> : <span data-horf-escrow-art-unavailable="">Preview unavailable</span>;
  return <video ref={ref} data-horf-escrow-video="" data-horf-stable-preview-video="" src={visible ? video.src : undefined} poster={poster?.src}
    muted autoPlay loop playsInline preload={visible ? "metadata" : "none"} aria-label={`${name} video preview`}
    onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, video)) setFailed(true); }} />;
}

function ImageArtwork({ art, name }: { art: ResolvedThumbnail; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span data-horf-escrow-art-unavailable="">Preview unavailable</span>
    : <img data-horf-escrow-image="" src={art.src} alt={`${name} artwork`} loading="lazy" decoding="async"
      onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) setFailed(true); }} />;
}

/** Exact-token art for public rooms, private escrow, and older stable cards. */
export function HorfEscrowArtwork({ contract, tokenId, name, media, uniqueThumbnails, preferExactArtwork = false }: EscrowArtworkProps) {
  if (!media) return <span data-horf-escrow-art-unavailable="">Preview unavailable</span>;
  const knownUnique = uniqueThumbnails ?? uniqueHorfThumbnailIdentities([{ ...media, contract, tokenId }]);
  const art = preferExactArtwork ? resolveHorfHorseArt(media) : resolveHorfHorseCardArt(media, knownUnique);
  const video = resolveHorfHorseVideo(media);
  if (video) return <VideoArtwork video={video} poster={art} name={name} />;
  if (art) return <ImageArtwork art={art} name={name} />;
  return <span data-horf-escrow-art-unavailable="">Preview unavailable</span>;
}
