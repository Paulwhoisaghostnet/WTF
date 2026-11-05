import {
  resolveArtifactUri,
  resolveTokenThumbnail,
  type ResolvedThumbnail,
} from "../../lib/media-resolve";
import { extractIpfsPath } from "@shared/ipfs-gateways";

export type HorfHorseMedia = {
  image?: string | null;
  artifactUri?: string | null;
  mime?: string | null;
};

type HorfThumbnailCandidate = HorfHorseMedia & { contract: string; tokenId: string };

function thumbnailIdentity(uri: string): string {
  const ipfsPath = extractIpfsPath(uri);
  if (ipfsPath) return `ipfs:${ipfsPath.split("?")[0]}`;
  try {
    const url = new URL(uri, "https://wtfos.app");
    return `${url.origin}${url.pathname}`;
  } catch {
    return uri.split("?")[0].trim();
  }
}

/** A shared Objkt thumbnail may belong to a collection rather than a token. */
export function uniqueHorfThumbnailIdentities(horses: readonly HorfThumbnailCandidate[]): Set<string> {
  const tokensByImage = new Map<string, Set<string>>();
  for (const horse of horses) {
    if (!horse.image) continue;
    const image = thumbnailIdentity(horse.image);
    const tokens = tokensByImage.get(image) ?? new Set<string>();
    tokens.add(`${horse.contract}/${horse.tokenId}`);
    tokensByImage.set(image, tokens);
  }
  return new Set([...tokensByImage].filter(([, tokens]) => tokens.size === 1).map(([image]) => image));
}

/** Use a small, token-specific Objkt preview on cards, with exact art as backup. */
export function resolveHorfHorseCardArt(horse: HorfHorseMedia, uniqueThumbnails: ReadonlySet<string>): ResolvedThumbnail | null {
  const exact = resolveHorfHorseArt({ ...horse, image: null });
  if (!horse.image) return exact;
  if (!uniqueThumbnails.has(thumbnailIdentity(horse.image)) && exact) return exact;
  const thumbnail = resolveTokenThumbnail({ thumbnail: horse.image });
  if (!thumbnail) return exact;
  // Some distinct token IDs share one Objkt thumbnail, but a directory or
  // other non-image artifact leaves that thumbnail as the only image to show.
  if (!exact) return thumbnail;
  return {
    src: thumbnail.src,
    fallbackCandidates: unique([
      ...(thumbnail.fallbackCandidates || []),
      thumbnail.fallbackSrc,
      exact?.src,
      ...(exact?.fallbackCandidates || []),
      exact?.fallbackSrc,
    ]),
  };
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/** Objkt can assign one collection thumbnail to many distinct tokens. Prefer
 * each token's own image artifact, through the same cache route as wtfOS. */
export function resolveHorfHorseArt(horse: HorfHorseMedia): ResolvedThumbnail | null {
  const thumbnail = horse.image ? resolveTokenThumbnail({ thumbnail: horse.image }) : null;
  const mime = horse.mime?.trim().toLowerCase() || "";
  // Directory artifacts serve HTML at IPFS gateways. Sending one to an <img>
  // produces a cache 415, then needless failures across every gateway.
  if (!horse.artifactUri || (mime && !mime.startsWith("image/"))) return thumbnail;
  const artifact = resolveArtifactUri(horse.artifactUri);
  if (!artifact) return thumbnail;
  return {
    src: artifact.src,
    fallbackCandidates: unique([
      ...(artifact.fallbackCandidates || []),
      artifact.fallbackSrc,
      thumbnail?.src,
      ...(thumbnail?.fallbackCandidates || []),
      thumbnail?.fallbackSrc,
    ]),
  };
}

/** Playable artifacts use wtfOS's artifact proxy, not an Objkt thumbnail. */
export function resolveHorfHorseVideo(horse: HorfHorseMedia): ResolvedThumbnail | null {
  return horse.mime?.trim().toLowerCase().startsWith("video/") && horse.artifactUri
    ? resolveArtifactUri(horse.artifactUri)
    : null;
}
