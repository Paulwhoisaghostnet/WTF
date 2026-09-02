import { getFaqTutorialCatalog } from "./faq-tutorials";
import { getWtfosPromoCatalog } from "./wtfos-promos";

export const WTFOS_GUIDE_TV_CHANNEL_SLUG = "wtfos-guide-tv";
export const WTFOS_GUIDE_TV_CHANNEL_TITLE = "wtfOS Guide TV";
export const WTFOS_GUIDE_TV_CHANNEL_DESCRIPTION =
  "Official wtfOS promos and TommyTezos FAQ walkthroughs, all in one learning channel.";
export const WTFOS_GUIDE_TV_PLAYLIST_NAME = "Promos + FAQ How-Tos";

export type WtfosGuideTvCatalogEntry = {
  kind: "promo" | "tutorial";
  slug: string;
  title: string;
  summary: string;
  accountName: string;
  durationSeconds: number;
  sortOrder: number;
  sourceUri: string;
  posterUri: string;
  tokenContract: "wtfos:promo" | "wtfos:faq";
};

export function getWtfosGuideTvCatalog(): WtfosGuideTvCatalogEntry[] {
  const promos = getWtfosPromoCatalog().map((promo, index) => ({
    kind: "promo" as const,
    slug: promo.slug,
    title: promo.title,
    summary: promo.summary,
    accountName: promo.accountName,
    durationSeconds: promo.durationSeconds,
    sortOrder: index,
    sourceUri: `/api/faq/promos/${encodeURIComponent(promo.slug)}/video`,
    posterUri: `/api/faq/promos/${encodeURIComponent(promo.slug)}/poster`,
    tokenContract: "wtfos:promo" as const,
  }));
  const tutorials = getFaqTutorialCatalog().map((tutorial, index) => ({
    kind: "tutorial" as const,
    slug: tutorial.slug,
    title: tutorial.title,
    summary: tutorial.summary,
    accountName: tutorial.accountName,
    durationSeconds: tutorial.durationSeconds,
    sortOrder: promos.length + index,
    sourceUri: `/api/faq/tutorials/${encodeURIComponent(tutorial.slug)}/video`,
    posterUri: `/api/faq/tutorials/${encodeURIComponent(tutorial.slug)}/poster`,
    tokenContract: "wtfos:faq" as const,
  }));
  return [...promos, ...tutorials];
}
