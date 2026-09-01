import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import faqTutorialSource from "@shared/faq-tutorials.json";
import { downloadObjectToFile, getObjectStorageConfig } from "./storage/object-storage";
import { MEDIA_HOT_CACHE_DIR, assertInsideRoot } from "./storage/paths";

export const FAQ_TUTORIAL_ACCOUNT_NAME = "TommyTezos";

export type FaqTutorial = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  sortOrder: number;
  accountName: string;
  route: string;
  durationSeconds: number;
  videoObjectKey: string;
  captionsObjectKey: string;
  posterObjectKey: string;
  steps: string[];
  narration: string;
};

export type PublicFaqTutorial = Omit<
  FaqTutorial,
  "videoObjectKey" | "captionsObjectKey" | "posterObjectKey" | "narration"
> & {
  videoUrl: string;
  captionsUrl: string;
  posterUrl: string;
  transcript: string;
  aiNarration: true;
};

export type FaqTutorialAssetKind = "video" | "captions" | "poster";

const tutorialCatalog = (faqTutorialSource as FaqTutorial[])
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder);

const tutorialBySlug = new Map(tutorialCatalog.map((tutorial) => [tutorial.slug, tutorial]));
const assetDownloads = new Map<string, Promise<string>>();

function assetRoute(slug: string, kind: FaqTutorialAssetKind): string {
  return `/api/faq/tutorials/${encodeURIComponent(slug)}/${kind}`;
}

export function getFaqTutorialCatalog(): FaqTutorial[] {
  return tutorialCatalog.map((tutorial) => ({
    ...tutorial,
    steps: [...tutorial.steps],
  }));
}

export function getPublicFaqTutorialCatalog(): PublicFaqTutorial[] {
  return tutorialCatalog.map((tutorial) => ({
    slug: tutorial.slug,
    title: tutorial.title,
    summary: tutorial.summary,
    category: tutorial.category,
    sortOrder: tutorial.sortOrder,
    accountName: tutorial.accountName,
    route: tutorial.route,
    durationSeconds: tutorial.durationSeconds,
    steps: [...tutorial.steps],
    transcript: tutorial.narration,
    aiNarration: true,
    videoUrl: assetRoute(tutorial.slug, "video"),
    captionsUrl: assetRoute(tutorial.slug, "captions"),
    posterUrl: assetRoute(tutorial.slug, "poster"),
  }));
}

export function findFaqTutorial(slug: string): FaqTutorial | null {
  return tutorialBySlug.get(slug) ?? null;
}

function objectKeyForAsset(tutorial: FaqTutorial, kind: FaqTutorialAssetKind): string {
  if (kind === "captions") return tutorial.captionsObjectKey;
  if (kind === "poster") return tutorial.posterObjectKey;
  return tutorial.videoObjectKey;
}

function assetMetadata(kind: FaqTutorialAssetKind): {
  contentType: string;
  extension: string;
  cacheControl: string;
} {
  if (kind === "captions") {
    return {
      contentType: "text/vtt; charset=utf-8",
      extension: ".vtt",
      cacheControl: "public, max-age=3600",
    };
  }
  if (kind === "poster") {
    return {
      contentType: "image/jpeg",
      extension: ".jpg",
      cacheControl: "public, max-age=86400",
    };
  }
  return {
    contentType: "video/mp4",
    extension: ".mp4",
    cacheControl: "public, max-age=3600",
  };
}

function parseSingleRange(value: string | undefined, size: number): {
  start: number;
  end: number;
} | null {
  const raw = String(value || "").trim();
  if (!raw.startsWith("bytes=") || raw.includes(",")) return null;
  const [startRaw, endRaw] = raw.slice(6).split("-", 2);
  let start: number;
  let end: number;

  if (!startRaw && endRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - Math.min(size, Math.floor(suffixLength)));
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    start = Math.floor(start);
    end = Math.min(size - 1, Math.floor(end));
  }

  if (start < 0 || end < start || start >= size) return null;
  return { start, end };
}

async function resolveCachedAsset(
  tutorial: FaqTutorial,
  kind: FaqTutorialAssetKind
): Promise<string> {
  if (!getObjectStorageConfig()) {
    throw new Error("faq_tutorial_storage_unconfigured");
  }
  const metadata = assetMetadata(kind);
  const cacheRoot = path.join(MEDIA_HOT_CACHE_DIR, "faq-tutorials");
  const destinationPath = path.join(cacheRoot, `${tutorial.slug}${metadata.extension}`);
  assertInsideRoot(destinationPath, cacheRoot);

  const existing = await fs.stat(destinationPath).catch(() => null);
  if (existing?.isFile() && existing.size > 0) return destinationPath;

  const objectKey = objectKeyForAsset(tutorial, kind);
  const inflightKey = `${tutorial.slug}:${kind}`;
  const existingDownload = assetDownloads.get(inflightKey);
  if (existingDownload) return existingDownload;

  const download = (async () => {
    await fs.mkdir(cacheRoot, { recursive: true });
    const temporaryPath = `${destinationPath}.${process.pid}.partial`;
    assertInsideRoot(temporaryPath, cacheRoot);
    try {
      await downloadObjectToFile({
        key: objectKey,
        destinationPath: temporaryPath,
      });
      const stat = await fs.stat(temporaryPath);
      if (!stat.isFile() || stat.size <= 0) {
        throw new Error(`FAQ tutorial asset is empty: ${objectKey}`);
      }
      await fs.rename(temporaryPath, destinationPath);
      return destinationPath;
    } finally {
      await fs.unlink(temporaryPath).catch(() => undefined);
    }
  })();

  assetDownloads.set(inflightKey, download);
  try {
    return await download;
  } finally {
    assetDownloads.delete(inflightKey);
  }
}

export async function serveFaqTutorialAsset(input: {
  req: any;
  res: any;
  tutorial: FaqTutorial;
  kind: FaqTutorialAssetKind;
}): Promise<void> {
  const filePath = await resolveCachedAsset(input.tutorial, input.kind);
  const stat = await fs.stat(filePath);
  const metadata = assetMetadata(input.kind);
  const requestedRange = String(input.req.headers?.range || "").trim();
  const range = input.kind === "video"
    ? parseSingleRange(requestedRange || undefined, stat.size)
    : null;

  input.res.setHeader("Content-Type", metadata.contentType);
  input.res.setHeader("Cache-Control", metadata.cacheControl);
  input.res.setHeader("X-Content-Type-Options", "nosniff");
  input.res.setHeader("X-WTF-Tutorial-Account", FAQ_TUTORIAL_ACCOUNT_NAME);

  if (input.kind === "video") {
    input.res.setHeader("Accept-Ranges", "bytes");
    if (requestedRange && !range) {
      input.res.status(416);
      input.res.setHeader("Content-Range", `bytes */${stat.size}`);
      input.res.end();
      return;
    }
    if (range) {
      input.res.status(206);
      input.res.setHeader("Content-Length", String(range.end - range.start + 1));
      input.res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
      createReadStream(filePath, range).pipe(input.res);
      return;
    }
  }

  input.res.setHeader("Content-Length", String(stat.size));
  createReadStream(filePath).pipe(input.res);
}
