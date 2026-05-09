import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Response } from "express";
import type { NormalizedSystemEventInput } from "../challenges/events/types";
import { assertInsideRoot } from "../lib/storage/paths";

export const AUTH_GM_WELCOME_EVENT_TYPE = "auth.gm_welcome.event";
export const AUTH_GM_WELCOME_COMPLETED_EVENT_TYPE =
  "auth.gm_welcome.completed";

export const GM_WELCOME_PROJECT_ID = 24858;
export const GM_WELCOME_PROJECT_NAME = "GM!";
export const GM_WELCOME_AUTHOR_NAME = "Paulwhoisaghost#3465";
export const GM_WELCOME_AUTHOR_ADDRESS =
  "tz1cgZ6PWKoER3gvW3jGKPHgBkRnpj8XzLm2";
export const GM_WELCOME_COLLECTION_URL =
  "https://objkt.com/collections/fxhash/projects/24858";
export const DEFAULT_GM_NFT_CACHE_DIR = "/app/cache/gm-nfts";

type GmWelcomeUser = {
  id?: number | null;
  username?: string | null;
  gmWelcomeUtcDay?: string | null;
};

export type GmNftManifestAsset = {
  id: string;
  onChainId: number | null;
  iteration: number | null;
  name: string;
  generationHash?: string | null;
  displayUri?: string | null;
  thumbnailUri?: string | null;
  metadataUri?: string | null;
  captureCid?: string | null;
  sourceUri: string;
  filename: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
};

export type GmNftManifest = {
  projectId: number;
  projectName: string;
  collectionUrl: string;
  authorName: string;
  authorAddress: string;
  generatedAt: string;
  assets: GmNftManifestAsset[];
};

export type DailyGmWelcomePayload = {
  shouldShow: true;
  utcDay: string;
  projectId: number;
  projectName: string;
  collectionUrl: string;
  authorName: string;
  authorAddress: string;
  asset: {
    id: string;
    name: string;
    onChainId: number | null;
    iteration: number | null;
    imageUrl: string;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
  };
};

export function currentGmWelcomeUtcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function shouldShowDailyGmWelcome(
  user: GmWelcomeUser | null | undefined,
  utcDay = currentGmWelcomeUtcDay()
): boolean {
  return Boolean(user?.id && user.gmWelcomeUtcDay !== utcDay);
}

export function gmNftCacheDir(): string {
  return process.env.GM_NFT_CACHE_DIR?.trim() || DEFAULT_GM_NFT_CACHE_DIR;
}

export function gmNftManifestPath(cacheDir = gmNftCacheDir()): string {
  return path.join(cacheDir, "manifest.json");
}

export async function readGmNftManifest(
  cacheDir = gmNftCacheDir()
): Promise<GmNftManifest | null> {
  try {
    const raw = await fs.readFile(gmNftManifestPath(cacheDir), "utf8");
    const parsed = JSON.parse(raw) as GmNftManifest;
    if (!Array.isArray(parsed.assets) || parsed.assets.length === 0) {
      return null;
    }
    return parsed;
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      console.warn("[auth] failed to read GM NFT manifest:", err);
    }
    return null;
  }
}

export function selectGmNftForUtcDay(
  manifest: GmNftManifest,
  utcDay: string
): GmNftManifestAsset | null {
  if (!manifest.assets.length) return null;
  const digest = createHash("sha256")
    .update(`${manifest.projectId}:${utcDay}`)
    .digest();
  const index = digest.readUInt32BE(0) % manifest.assets.length;
  return manifest.assets[index] ?? null;
}

export async function getDailyGmWelcomePayload(
  user: GmWelcomeUser | null | undefined,
  now = new Date()
): Promise<DailyGmWelcomePayload | null> {
  const utcDay = currentGmWelcomeUtcDay(now);
  if (!shouldShowDailyGmWelcome(user, utcDay)) return null;

  const manifest = await readGmNftManifest();
  if (!manifest) return null;

  const asset = selectGmNftForUtcDay(manifest, utcDay);
  if (!asset) return null;

  return {
    shouldShow: true,
    utcDay,
    projectId: manifest.projectId,
    projectName: manifest.projectName,
    collectionUrl: manifest.collectionUrl,
    authorName: manifest.authorName,
    authorAddress: manifest.authorAddress,
    asset: {
      id: asset.id,
      name: asset.name,
      onChainId: asset.onChainId ?? null,
      iteration: asset.iteration ?? null,
      imageUrl: `/api/auth/gm-welcome/assets/${encodeURIComponent(
        asset.filename
      )}`,
      mimeType: asset.mimeType ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
    },
  };
}

export function buildGmWelcomeEventInput(
  user: GmWelcomeUser,
  sourceModule: string,
  utcDay = currentGmWelcomeUtcDay()
): NormalizedSystemEventInput {
  if (!user.id) throw new Error("GM welcome event requires a user id");
  return {
    eventId: `${AUTH_GM_WELCOME_EVENT_TYPE}:${user.id}:${utcDay}`,
    eventType: AUTH_GM_WELCOME_EVENT_TYPE,
    userId: user.id,
    source: "auth",
    sourceModule,
    rawRefType: "user",
    rawRefId: user.id,
    metadata: {
      eventName: "daily GM welcome event",
      method: sourceModule,
      username: user.username ?? null,
      utcDay,
      gmFlagAlreadySet: user.gmWelcomeUtcDay === utcDay,
      projectId: GM_WELCOME_PROJECT_ID,
      collectionUrl: GM_WELCOME_COLLECTION_URL,
      authorName: GM_WELCOME_AUTHOR_NAME,
      authorAddress: GM_WELCOME_AUTHOR_ADDRESS,
    },
  };
}

export async function emitGmWelcomeEventIfNeeded(
  user: GmWelcomeUser | null | undefined,
  sourceModule: string
) {
  if (!shouldShowDailyGmWelcome(user)) return;
  if (!user) return;
  try {
    const { ingestSystemEvent } = await import("../challenges/events/ingest");
    await ingestSystemEvent(buildGmWelcomeEventInput(user, sourceModule));
  } catch (err) {
    console.warn("[auth] failed to emit GM welcome event:", err);
  }
}

export async function serveGmWelcomeAsset(
  filename: string,
  res: Response
): Promise<void> {
  const cacheDir = gmNftCacheDir();
  const manifest = await readGmNftManifest(cacheDir);
  const asset = manifest?.assets.find((entry) => entry.filename === filename);
  if (!asset) {
    res.status(404).json({ error: "GM NFT asset not found" });
    return;
  }

  const assetPath = path.join(cacheDir, asset.filename);
  assertInsideRoot(assetPath, cacheDir);

  try {
    await fs.access(assetPath);
  } catch {
    res.status(404).json({ error: "GM NFT asset missing from cache" });
    return;
  }

  res.setHeader("Content-Type", asset.mimeType || "image/png");
  res.setHeader("Cache-Control", "private, max-age=86400");
  createReadStream(assetPath).pipe(res);
}
