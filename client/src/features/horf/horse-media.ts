import {
  resolveArtifactUri,
  resolveTokenThumbnail,
  type ResolvedThumbnail,
} from "../../lib/media-resolve";

export type HorfHorseMedia = {
  image?: string | null;
  artifactUri?: string | null;
  mime?: string | null;
};

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/** Objkt can assign one collection thumbnail to many distinct tokens. Prefer
 * each token's own image artifact, through the same cache route as wtfOS. */
export function resolveHorfHorseArt(horse: HorfHorseMedia): ResolvedThumbnail | null {
  const thumbnail = horse.image ? resolveTokenThumbnail({ thumbnail: horse.image }) : null;
  const mime = horse.mime?.trim().toLowerCase() || "";
  if (!horse.artifactUri || mime.startsWith("video/") || mime.startsWith("audio/") ||
      mime.startsWith("text/") || mime === "application/pdf") return thumbnail;
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
