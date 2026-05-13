import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { xWMediaUploads } from "@shared/schema";
import { db } from "../../db";

type WMediaOwnershipDb = typeof db;

export class WMediaOwnershipError extends Error {
  code = "W_MEDIA_OWNERSHIP";
  status = 403;

  constructor(message = "One or more media attachments are not owned by this WTF user") {
    super(message);
    this.name = "WMediaOwnershipError";
  }
}

export function ownedWMediaIdsFromRows(
  requestedMediaIds: string[],
  rows: Array<{ xMediaId: string }>
): string[] {
  const owned = new Set(rows.map((row) => String(row.xMediaId)));
  return requestedMediaIds.filter((mediaId) => owned.has(mediaId));
}

export async function recordWMediaUploadOwnership(
  input: {
    ownerUserId: number;
    xMediaId: string;
    mediaCategory: string;
    expiresAfterSecs?: number | string | null;
  },
  database: WMediaOwnershipDb = db
): Promise<void> {
  const ownerUserId = Number(input.ownerUserId);
  const xMediaId = String(input.xMediaId || "").trim();
  const mediaCategory = String(input.mediaCategory || "unknown").trim().slice(0, 40) || "unknown";
  if (!Number.isInteger(ownerUserId) || ownerUserId <= 0 || !/^\d+$/.test(xMediaId)) {
    throw new WMediaOwnershipError("Invalid W media ownership record");
  }

  const ttlSeconds = Number(input.expiresAfterSecs ?? 0);
  const expiresAt =
    Number.isFinite(ttlSeconds) && ttlSeconds > 0
      ? new Date(Date.now() + Math.trunc(ttlSeconds) * 1000)
      : null;

  await database
    .insert(xWMediaUploads)
    .values({
      ownerUserId,
      xMediaId,
      mediaCategory,
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: xWMediaUploads.xMediaId,
      set: {
        ownerUserId,
        mediaCategory,
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

export async function requireOwnedWMediaIds(
  ownerUserId: number,
  requestedMediaIds: string[],
  database: WMediaOwnershipDb = db
): Promise<string[]> {
  const uniqueRequested = Array.from(
    new Set(requestedMediaIds.map((mediaId) => String(mediaId || "").trim()).filter(Boolean))
  );
  if (uniqueRequested.length === 0) return [];
  if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) {
    throw new WMediaOwnershipError();
  }

  const rows = await database
    .select({ xMediaId: xWMediaUploads.xMediaId })
    .from(xWMediaUploads)
    .where(
      and(
        eq(xWMediaUploads.ownerUserId, ownerUserId),
        inArray(xWMediaUploads.xMediaId, uniqueRequested),
        or(isNull(xWMediaUploads.expiresAt), gt(xWMediaUploads.expiresAt, new Date()))
      )
    );

  const ownedMediaIds = ownedWMediaIdsFromRows(uniqueRequested, rows);
  if (ownedMediaIds.length !== uniqueRequested.length) {
    throw new WMediaOwnershipError();
  }
  return ownedMediaIds;
}

export async function requireOwnedWMediaId(
  ownerUserId: number,
  requestedMediaId: string | undefined,
  database: WMediaOwnershipDb = db
): Promise<string | undefined> {
  if (!requestedMediaId) return undefined;
  const [ownedMediaId] = await requireOwnedWMediaIds(ownerUserId, [requestedMediaId], database);
  return ownedMediaId;
}
