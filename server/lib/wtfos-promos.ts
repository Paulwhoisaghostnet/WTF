import promoSource from "@shared/wtfos-promos.json";
import {
  serveStoredGuideAsset,
  type FaqTutorialAssetKind,
} from "./faq-tutorials";

export const WTFOS_PROMO_ACCOUNT_NAME = "TommyTezos";

export type WtfosPromoScene = {
  route: string;
  label: string;
  copy: string;
  highlight?: string;
};

export type WtfosPromo = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  sortOrder: number;
  accountName: string;
  durationSeconds: number;
  videoObjectKey: string;
  captionsObjectKey: string;
  posterObjectKey: string;
  narration: string;
  spokenSteps: string[];
  scenes: WtfosPromoScene[];
};

export type PublicWtfosPromo = Omit<
  WtfosPromo,
  "videoObjectKey" | "captionsObjectKey" | "posterObjectKey" | "narration" | "spokenSteps"
> & {
  videoUrl: string;
  captionsUrl: string;
  posterUrl: string;
  transcript: string;
  aiNarration: true;
};

const promoCatalog = (promoSource as WtfosPromo[])
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder);
const promoBySlug = new Map(promoCatalog.map((promo) => [promo.slug, promo]));

function assetRoute(slug: string, kind: FaqTutorialAssetKind): string {
  return `/api/faq/promos/${encodeURIComponent(slug)}/${kind}`;
}

function objectKeyForAsset(promo: WtfosPromo, kind: FaqTutorialAssetKind): string {
  if (kind === "captions") return promo.captionsObjectKey;
  if (kind === "poster") return promo.posterObjectKey;
  return promo.videoObjectKey;
}

export function getWtfosPromoCatalog(): WtfosPromo[] {
  return promoCatalog.map((promo) => ({
    ...promo,
    spokenSteps: [...promo.spokenSteps],
    scenes: promo.scenes.map((scene) => ({ ...scene })),
  }));
}

export function getPublicWtfosPromoCatalog(): PublicWtfosPromo[] {
  return promoCatalog.map((promo) => ({
    slug: promo.slug,
    title: promo.title,
    summary: promo.summary,
    category: promo.category,
    sortOrder: promo.sortOrder,
    accountName: promo.accountName,
    durationSeconds: promo.durationSeconds,
    scenes: promo.scenes.map((scene) => ({ ...scene })),
    transcript: promo.narration,
    aiNarration: true,
    videoUrl: assetRoute(promo.slug, "video"),
    captionsUrl: assetRoute(promo.slug, "captions"),
    posterUrl: assetRoute(promo.slug, "poster"),
  }));
}

export function findWtfosPromo(slug: string): WtfosPromo | null {
  return promoBySlug.get(slug) ?? null;
}

export async function serveWtfosPromoAsset(input: {
  req: any;
  res: any;
  promo: WtfosPromo;
  kind: FaqTutorialAssetKind;
}): Promise<void> {
  await serveStoredGuideAsset({
    req: input.req,
    res: input.res,
    slug: input.promo.slug,
    cacheNamespace: "wtfos-promos",
    objectKey: objectKeyForAsset(input.promo, input.kind),
    kind: input.kind,
    accountName: WTFOS_PROMO_ACCOUNT_NAME,
    accountHeaderName: "X-WTF-Promo-Account",
  });
}
