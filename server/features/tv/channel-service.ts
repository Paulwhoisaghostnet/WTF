import { and, eq, sql } from "drizzle-orm";
import { type UserRole } from "@shared/types";
import {
  tvChannels,
  tvChannelVideos,
} from "@shared/schema";
import { db, pool } from "../../db";
import { hasPermission } from "../../lib/permissions";
import { canEditTvChannelPolicy } from "../../lib/tv-policy";

export type TvAuthUser = {
  id: number;
  username: string;
  role: UserRole;
};

export async function isStaffRole(role: UserRole): Promise<boolean> {
  return hasPermission(role, "manage_channels");
}

// Dials 1, 2, 3, and 69 are reserved pins (opeculiar, yoeshi, WTF TV,
// platform).  Everyone else gets a monotonically-increasing dial that
// is sticky for the lifetime of the channel.
const DIAL_RESERVED = new Set<number>([1, 2, 3, 69]);
const DIAL_AUTO_FLOOR = 4;

export async function allocateNextDialNumber(): Promise<number> {
  for (;;) {
    const result = await pool.query<{ next_dial: number }>(
      `INSERT INTO tv_dial_counter (id, next_dial, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE
          SET next_dial  = tv_dial_counter.next_dial + 1,
              updated_at = NOW()
       RETURNING next_dial - 1 AS next_dial`,
      [DIAL_AUTO_FLOOR + 1]
    );
    const candidate = Number(result.rows[0]?.next_dial ?? DIAL_AUTO_FLOOR);
    if (!DIAL_RESERVED.has(candidate)) {
      return candidate;
    }
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 100);
}

/**
 * Shared public-visibility gate for resolved channel rows.
 * Private channels require owner or staff access; disabled channels
 * never stream.
 */
export function canViewChannel(
  channel: {
    ownerUserId: number;
    isPublic?: boolean | null;
    isActive?: boolean | null;
  } | null | undefined,
  user: { id?: number | null; role?: UserRole | null } | null | undefined,
  opts?: { isStaff?: boolean }
): boolean {
  if (!channel) return false;
  if (channel.isActive === false) return false;
  if (channel.isPublic !== false) return true;
  if (!user || !user.id) return false;
  if (channel.ownerUserId === user.id) return true;
  if (opts?.isStaff) return true;
  return false;
}

export async function ensureChannelEditable(channelId: number, user: TvAuthUser) {
  const [channel] = await db
    .select({
      id: tvChannels.id,
      ownerUserId: tvChannels.ownerUserId,
      slug: tvChannels.slug,
      title: tvChannels.title,
      description: tvChannels.description,
      logoUrl: tvChannels.logoUrl,
      bannerUrl: tvChannels.bannerUrl,
      isPublic: tvChannels.isPublic,
      isActive: tvChannels.isActive,
      createdAt: tvChannels.createdAt,
      updatedAt: tvChannels.updatedAt,
    })
    .from(tvChannels)
    .where(eq(tvChannels.id, channelId));

  if (!channel) return { error: "Channel not found", status: 404 as const, channel: null };

  const canEdit = canEditTvChannelPolicy(channel, user);
  if (!canEdit) return { error: "Not authorized", status: 403 as const, channel: null };

  return { error: null, status: 200 as const, channel };
}

export function isUniqueConstraintError(err: unknown, constraint: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as any).code === "23505" &&
    (err as any).constraint === constraint
  );
}

export async function lockTvChannelRow(tx: any, channelId: number): Promise<void> {
  await tx.execute(sql`
    SELECT id
      FROM ${tvChannels}
     WHERE ${tvChannels.id} = ${channelId}
     FOR UPDATE
  `);
}

export async function findExistingChannelVideo(
  dbLike: any,
  channelId: number,
  mediaItemId: number | null,
  tokenContract: string,
  tokenId: string
): Promise<{ id: number } | undefined> {
  let existing: { id: number } | undefined;

  if (mediaItemId !== null) {
    [existing] = await dbLike
      .select({ id: tvChannelVideos.id })
      .from(tvChannelVideos)
      .where(
        and(
          eq(tvChannelVideos.channelId, channelId),
          eq(tvChannelVideos.mediaItemId, mediaItemId)
        )
      )
      .limit(1);
  }

  if (!existing) {
    [existing] = await dbLike
      .select({ id: tvChannelVideos.id })
      .from(tvChannelVideos)
      .where(
        and(
          eq(tvChannelVideos.channelId, channelId),
          eq(tvChannelVideos.tokenContract, tokenContract),
          eq(tvChannelVideos.tokenId, tokenId)
        )
      )
      .limit(1);
  }

  return existing;
}

export async function uniqueChannelSlug(base: string): Promise<string> {
  const cleanBase = slugify(base) || "channel";
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? cleanBase : `${cleanBase}-${i + 1}`;
    const [exists] = await db
      .select({ id: tvChannels.id })
      .from(tvChannels)
      .where(eq(tvChannels.slug, candidate));
    if (!exists) return candidate;
  }
  const suffix = Date.now().toString(36);
  return `${cleanBase}-${suffix}`;
}
