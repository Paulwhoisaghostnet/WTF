import { and, eq } from "drizzle-orm";
import { tokenMetadata } from "@shared/schema";
import { resolveArtifactMimeType, resourceUrisLikelySame } from "@shared/token-media";
import {
  guessMimeTypeFromUri,
  isPlayableMimeType,
  parseFormatsFromMetadata,
  type PlayableAsset,
} from "../../lib/media-utils";
import {
  readTvOverlayOverride,
  resolveTvOverlayMetadata,
  writeTvOverlayOverride,
} from "../../lib/tv-overlay-metadata";
import { db } from "../../db";
import { normalizeMediaUri } from "./media-urls";

export function extractTokenMetaFields(
  metadata: any,
  _tokenName?: string | null,
  options?: {
    tokenContract?: string | null;
    tokenId?: string | null;
    uploaderUsername?: string | null;
  }
): {
  creatorName: string | null;
  creatorAddress: string | null;
  collectionName: string | null;
  mintedAt: Date | null;
} {
  const resolved = resolveTvOverlayMetadata({
    metadata,
    tokenContract: options?.tokenContract,
    tokenId: options?.tokenId,
    uploaderUsername: options?.uploaderUsername,
  });
  return {
    creatorName: resolved.creatorName,
    creatorAddress: resolved.creatorAddress,
    collectionName: resolved.collectionName,
    mintedAt: resolved.mintedAt,
  };
}

export async function hydrateChannelVideoMetadata(input: {
  tokenContract?: string | null;
  tokenId?: string | null;
  metadata: unknown;
}): Promise<Record<string, unknown> | null> {
  const tokenContract = String(input.tokenContract || "").trim();
  const tokenId = String(input.tokenId || "").trim();
  if (!tokenContract || !tokenId) {
    return input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : null;
  }

  const [tokenRow] = await db
    .select({ raw: tokenMetadata.raw })
    .from(tokenMetadata)
    .where(
      and(
        eq(tokenMetadata.tokenContract, tokenContract),
        eq(tokenMetadata.tokenId, tokenId)
      )
    )
    .limit(1);

  if (!tokenRow?.raw) {
    return input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : null;
  }

  const overlay = readTvOverlayOverride(input.metadata);
  return writeTvOverlayOverride(tokenRow.raw, overlay);
}

export function compareTokenIds(a: string, b: string): number {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function decodeStoredBumperData(input: unknown): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  const value = String(input || "");
  if (!value) return Buffer.alloc(0);
  if (value.startsWith("\\x")) {
    return Buffer.from(value.slice(2), "hex");
  }
  return Buffer.from(value, "base64");
}

export function extractPlayableAssetFromTokenMetadata(
  metadata: Record<string, any> | null | undefined,
  fallbackTitle?: string | null
): PlayableAsset | null {
  const meta = metadata || {};
  const artifactUri = String(meta?.artifactUri || "").trim();
  let formats = parseFormatsFromMetadata(meta);
  if (artifactUri && formats.length > 1) {
    formats = [...formats].sort((a, b) => {
      const ra = resourceUrisLikelySame(a.uri, artifactUri) ? 0 : 1;
      const rb = resourceUrisLikelySame(b.uri, artifactUri) ? 0 : 1;
      return ra - rb;
    });
  }

  for (const format of formats) {
    if (!isPlayableMimeType(format.mimeType)) continue;
    const sourceUri = normalizeMediaUri(format.uri);
    if (!sourceUri) continue;
    return {
      sourceUri,
      mimeType: String(format.mimeType).toLowerCase(),
      title: String(meta?.name || fallbackTitle || "").trim() || null,
      thumbnailUri:
        normalizeMediaUri(String(meta?.thumbnailUri || meta?.displayUri || "")) || null,
    };
  }

  if (artifactUri) {
    const normalized = normalizeMediaUri(artifactUri);
    if (normalized) {
      const mimeType = String(
        resolveArtifactMimeType(meta as Record<string, unknown>) ||
          String(meta?.mimeType || meta?.mime_type || "").trim() ||
          guessMimeTypeFromUri(normalized)
      ).toLowerCase();
      if (isPlayableMimeType(mimeType)) {
        return {
          sourceUri: normalized,
          mimeType,
          title: String(meta?.name || fallbackTitle || "").trim() || null,
          thumbnailUri:
            normalizeMediaUri(String(meta?.thumbnailUri || meta?.displayUri || "")) || null,
        };
      }
    }
  }

  return null;
}
