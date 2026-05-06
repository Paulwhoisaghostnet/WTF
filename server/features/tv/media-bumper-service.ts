import { and, eq, sql } from "drizzle-orm";
import { hasAtLeastRole } from "@shared/types";
import { db } from "../../db";
import { tvBumpers, userMediaLibrary } from "@shared/schema";
import {
  BUMPER_CATEGORIES,
  BUMPER_CATEGORY_COMMUNITY,
  BUMPER_CATEGORY_PERSONAL,
} from "./daypart";
import {
  BUMPER_ALLOWED_MIME,
  BUMPER_MAX_DURATION_MS,
} from "./bumper-upload";
import type { TvAuthUser } from "./channel-service";

export const BUMPER_MAX_PER_USER_PERSONAL = 20;
export const BUMPER_MAX_PER_USER_COMMUNITY = 3;
export const NO_AVAILABLE_BUMPER_SLOTS_MESSAGE =
  "You have no available bumper slots.";

export type BumperCategory =
  | typeof BUMPER_CATEGORY_PERSONAL
  | typeof BUMPER_CATEGORY_COMMUNITY;

export function parseBumperCategory(input: unknown): BumperCategory | null {
  const requested = String(input || "").trim().toLowerCase();
  return BUMPER_CATEGORIES.has(requested)
    ? (requested as BumperCategory)
    : null;
}

export function maxBumpersForCategory(category: BumperCategory): number {
  return category === BUMPER_CATEGORY_COMMUNITY
    ? BUMPER_MAX_PER_USER_COMMUNITY
    : BUMPER_MAX_PER_USER_PERSONAL;
}

function durationMsForMediaItem(durationSeconds: number | null): number {
  const seconds =
    Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
      ? Number(durationSeconds)
      : 10;
  return Math.max(
    1_000,
    Math.min(BUMPER_MAX_DURATION_MS, Math.round(seconds * 1_000))
  );
}

function intFileSizeForMediaItem(input: {
  fileSize?: number | null;
  fileSizeBytes?: number | null;
}): number {
  const size = Number(input.fileSize ?? input.fileSizeBytes ?? 0);
  if (!Number.isFinite(size) || size <= 0) return 0;
  return Math.min(Math.floor(size), 2_147_483_647);
}

const bumperReturnColumns = {
  id: tvBumpers.id,
  title: tvBumpers.title,
  mimeType: tvBumpers.mimeType,
  fileSize: tvBumpers.fileSize,
  durationMs: tvBumpers.durationMs,
  category: tvBumpers.category,
  mediaItemId: tvBumpers.mediaItemId,
  createdAt: tvBumpers.createdAt,
};

export async function setMediaBumperAssignment(input: {
  user: TvAuthUser;
  mediaItemId: number;
  category: BumperCategory;
  enabled: boolean;
}) {
  const { user, mediaItemId, category, enabled } = input;

  const [mediaItem] = await db
    .select({
      id: userMediaLibrary.id,
      ownerUserId: userMediaLibrary.ownerUserId,
      title: userMediaLibrary.title,
      mimeType: userMediaLibrary.mimeType,
      fileSize: userMediaLibrary.fileSize,
      fileSizeBytes: userMediaLibrary.fileSizeBytes,
      durationSeconds: userMediaLibrary.durationSeconds,
      status: userMediaLibrary.status,
    })
    .from(userMediaLibrary)
    .where(eq(userMediaLibrary.id, mediaItemId))
    .limit(1);

  if (!mediaItem) {
    return { status: 404 as const, error: "Media library item not found" };
  }
  if (mediaItem.ownerUserId !== user.id) {
    return {
      status: 403 as const,
      error: "You can only assign your own media as a bumper",
    };
  }
  if (mediaItem.status !== "ready") {
    return {
      status: 400 as const,
      error: "Media must be ready before it can be assigned as a bumper",
    };
  }
  if (!BUMPER_ALLOWED_MIME.has(mediaItem.mimeType)) {
    return {
      status: 400 as const,
      error: "Only video, GIF, and image media can be assigned as a bumper",
    };
  }
  if (category === BUMPER_CATEGORY_COMMUNITY && !hasAtLeastRole(user.role, "contestant")) {
    return {
      status: 403 as const,
      error:
        "Community bumpers are available to contestants and above. Keep this bumper personal or ask a host to promote your account.",
    };
  }

  const existingWhere = and(
    eq(tvBumpers.ownerUserId, user.id),
    eq(tvBumpers.mediaItemId, mediaItemId),
    eq(tvBumpers.category, category)
  );

  if (!enabled) {
    await db.delete(tvBumpers).where(existingWhere);
    return {
      status: 200 as const,
      data: { ok: true, mediaItemId, category, enabled: false },
    };
  }

  const [existing] = await db
    .select(bumperReturnColumns)
    .from(tvBumpers)
    .where(existingWhere)
    .limit(1);
  if (existing) {
    return { status: 200 as const, data: existing };
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tvBumpers)
    .where(
      and(eq(tvBumpers.ownerUserId, user.id), eq(tvBumpers.category, category))
    );
  if (Number(countRow?.count || 0) >= maxBumpersForCategory(category)) {
    return {
      status: 400 as const,
      error: NO_AVAILABLE_BUMPER_SLOTS_MESSAGE,
    };
  }

  const [row] = await db
    .insert(tvBumpers)
    .values({
      ownerUserId: user.id,
      title: mediaItem.title.slice(0, 100) || `Media ${mediaItem.id}`,
      mimeType: mediaItem.mimeType,
      fileSize: intFileSizeForMediaItem(mediaItem),
      durationMs: durationMsForMediaItem(mediaItem.durationSeconds),
      data: `media://${mediaItem.id}`,
      mediaItemId: mediaItem.id,
      category,
    })
    .returning(bumperReturnColumns);

  return { status: 201 as const, data: row };
}
