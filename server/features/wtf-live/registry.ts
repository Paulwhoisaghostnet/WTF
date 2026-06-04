import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { wtfLiveRooms, wtfLiveStages } from "@shared/schema";

export type WtfLiveRoomRecord = {
  id: string;
  title: string;
  kind: "room";
  description: string;
  source: "system" | "user";
  ownerUserId: number | null;
  ownerUsername: string | null;
  isPublic: boolean;
};

export type WtfLiveStageRecord = {
  id: string;
  title: string;
  kind: "stage";
  description: string;
  liveUrl: string | null;
  source: "system" | "user";
  ownerUserId: number | null;
  ownerUsername: string | null;
};

export const SYSTEM_WTF_LIVE_ROOMS: WtfLiveRoomRecord[] = [
  {
    id: "wtf-live",
    title: "WTF LIVE",
    kind: "room",
    description: "Official show room for public AT room messages.",
    source: "system",
    ownerUserId: null,
    ownerUsername: null,
    isPublic: true,
  },
  {
    id: "tezos-wire",
    title: "Tezos Wire",
    kind: "room",
    description: "Tezos and tz2at room messages with quoted post context.",
    source: "system",
    ownerUserId: null,
    ownerUsername: null,
    isPublic: true,
  },
];

export const SYSTEM_WTF_LIVE_STAGES: WtfLiveStageRecord[] = [
  {
    id: "wtf-stage",
    title: "WTF Stage",
    kind: "stage",
    description: "Official one-way WTF LIVE stage broadcasts.",
    liveUrl: "/live",
    source: "system",
    ownerUserId: null,
    ownerUsername: null,
  },
  {
    id: "tezos-stage",
    title: "Tezos Stage",
    kind: "stage",
    description: "Tezos, tz2at, and OBJKT broadcast lane.",
    liveUrl: "/tz2at",
    source: "system",
    ownerUserId: null,
    ownerUsername: null,
  },
];

function roomRecordFromRow(row: {
  slug: string;
  title: string;
  description: string;
  ownerUserId: number;
  isPublic: boolean;
}): WtfLiveRoomRecord {
  return {
    id: row.slug,
    title: row.title,
    kind: "room" as const,
    description: row.description,
    source: "user" as const,
    ownerUserId: row.ownerUserId,
    ownerUsername: null,
    isPublic: row.isPublic,
  };
}

export function slugifyWtfLiveId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "live-space";
}

async function uniqueRoomSlug(base: string): Promise<string> {
  let slug = slugifyWtfLiveId(base);
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
    const existing = await db
      .select({ id: wtfLiveRooms.id })
      .from(wtfLiveRooms)
      .where(eq(wtfLiveRooms.slug, candidate))
      .limit(1);
    if (
      existing.length === 0 &&
      !SYSTEM_WTF_LIVE_ROOMS.some((room) => room.id === candidate)
    ) {
      return candidate;
    }
    suffix += 1;
  }
}

async function uniqueStageSlug(base: string): Promise<string> {
  let slug = slugifyWtfLiveId(base);
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
    const existing = await db
      .select({ id: wtfLiveStages.id })
      .from(wtfLiveStages)
      .where(eq(wtfLiveStages.slug, candidate))
      .limit(1);
    if (
      existing.length === 0 &&
      !SYSTEM_WTF_LIVE_STAGES.some((stage) => stage.id === candidate)
    ) {
      return candidate;
    }
    suffix += 1;
  }
}

export async function listWtfLiveRooms(): Promise<WtfLiveRoomRecord[]> {
  const rows = await db
    .select({
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      ownerUserId: wtfLiveRooms.ownerUserId,
      isPublic: wtfLiveRooms.isPublic,
    })
    .from(wtfLiveRooms)
    .where(and(isNull(wtfLiveRooms.archivedAt), eq(wtfLiveRooms.isPublic, true)))
    .orderBy(wtfLiveRooms.createdAt);

  return [
    ...SYSTEM_WTF_LIVE_ROOMS,
    ...rows.map(roomRecordFromRow),
  ];
}

export async function listOwnedWtfLiveRooms(ownerUserId: number): Promise<WtfLiveRoomRecord[]> {
  const rows = await db
    .select({
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      ownerUserId: wtfLiveRooms.ownerUserId,
      isPublic: wtfLiveRooms.isPublic,
    })
    .from(wtfLiveRooms)
    .where(and(eq(wtfLiveRooms.ownerUserId, ownerUserId), isNull(wtfLiveRooms.archivedAt)))
    .orderBy(wtfLiveRooms.createdAt);

  return rows.map(roomRecordFromRow);
}

export async function getWtfLiveRoom(roomId: string): Promise<WtfLiveRoomRecord | null> {
  const systemRoom = SYSTEM_WTF_LIVE_ROOMS.find((room) => room.id === roomId);
  if (systemRoom) return systemRoom;
  const rows = await db
    .select({
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      ownerUserId: wtfLiveRooms.ownerUserId,
      isPublic: wtfLiveRooms.isPublic,
    })
    .from(wtfLiveRooms)
    .where(and(eq(wtfLiveRooms.slug, roomId), isNull(wtfLiveRooms.archivedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return roomRecordFromRow(row);
}

export async function getPublicWtfLiveRoom(roomId: string): Promise<WtfLiveRoomRecord | null> {
  const room = await getWtfLiveRoom(roomId);
  return room?.isPublic ? room : null;
}

export async function listWtfLiveStages(): Promise<WtfLiveStageRecord[]> {
  const rows = await db
    .select({
      slug: wtfLiveStages.slug,
      title: wtfLiveStages.title,
      description: wtfLiveStages.description,
      liveUrl: wtfLiveStages.liveUrl,
      ownerUserId: wtfLiveStages.ownerUserId,
    })
    .from(wtfLiveStages)
    .where(isNull(wtfLiveStages.archivedAt))
    .orderBy(wtfLiveStages.createdAt);

  return [
    ...SYSTEM_WTF_LIVE_STAGES,
    ...rows.map((row) => ({
      id: row.slug,
      title: row.title,
      kind: "stage" as const,
      description: row.description,
      liveUrl: row.liveUrl,
      source: "user" as const,
      ownerUserId: row.ownerUserId,
      ownerUsername: null,
    })),
  ];
}

export async function wtfLiveRoomExists(roomId: string): Promise<boolean> {
  if (SYSTEM_WTF_LIVE_ROOMS.some((room) => room.id === roomId)) return true;
  const rows = await db
    .select({ id: wtfLiveRooms.id })
    .from(wtfLiveRooms)
    .where(and(eq(wtfLiveRooms.slug, roomId), isNull(wtfLiveRooms.archivedAt)))
    .limit(1);
  return rows.length > 0;
}

export async function wtfLiveStageExists(stageId: string): Promise<boolean> {
  if (SYSTEM_WTF_LIVE_STAGES.some((stage) => stage.id === stageId)) return true;
  const rows = await db
    .select({ id: wtfLiveStages.id })
    .from(wtfLiveStages)
    .where(and(eq(wtfLiveStages.slug, stageId), isNull(wtfLiveStages.archivedAt)))
    .limit(1);
  return rows.length > 0;
}

export async function createWtfLiveRoom(input: {
  ownerUserId: number;
  title: string;
  description?: string;
}) {
  const slug = await uniqueRoomSlug(input.title);
  const [row] = await db
    .insert(wtfLiveRooms)
    .values({
      slug,
      title: input.title.trim(),
      description: (input.description || "").trim(),
      ownerUserId: input.ownerUserId,
    })
    .returning({
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      ownerUserId: wtfLiveRooms.ownerUserId,
    });
  return {
    id: row.slug,
    title: row.title,
    kind: "room" as const,
    description: row.description,
    source: "user" as const,
    ownerUserId: row.ownerUserId,
    ownerUsername: null,
    isPublic: true,
  } satisfies WtfLiveRoomRecord;
}

export async function updateOwnedWtfLiveRoomVisibility(input: {
  ownerUserId: number;
  roomId: string;
  isPublic: boolean;
}): Promise<WtfLiveRoomRecord | null> {
  const [row] = await db
    .update(wtfLiveRooms)
    .set({
      isPublic: input.isPublic,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(wtfLiveRooms.slug, input.roomId),
        eq(wtfLiveRooms.ownerUserId, input.ownerUserId),
        isNull(wtfLiveRooms.archivedAt),
      ),
    )
    .returning({
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      ownerUserId: wtfLiveRooms.ownerUserId,
      isPublic: wtfLiveRooms.isPublic,
    });
  return row ? roomRecordFromRow(row) : null;
}

export async function archiveOwnedWtfLiveRoom(input: {
  ownerUserId: number;
  roomId: string;
}): Promise<boolean> {
  const [row] = await db
    .update(wtfLiveRooms)
    .set({
      archivedAt: new Date(),
      isPublic: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(wtfLiveRooms.slug, input.roomId),
        eq(wtfLiveRooms.ownerUserId, input.ownerUserId),
        isNull(wtfLiveRooms.archivedAt),
      ),
    )
    .returning({ id: wtfLiveRooms.id });
  return Boolean(row);
}

export async function createWtfLiveStage(input: {
  ownerUserId: number;
  title: string;
  description?: string;
  liveUrl?: string | null;
}) {
  const slug = await uniqueStageSlug(input.title);
  const [row] = await db
    .insert(wtfLiveStages)
    .values({
      slug,
      title: input.title.trim(),
      description: (input.description || "").trim(),
      liveUrl: input.liveUrl?.trim() || null,
      ownerUserId: input.ownerUserId,
    })
    .returning({
      slug: wtfLiveStages.slug,
      title: wtfLiveStages.title,
      description: wtfLiveStages.description,
      liveUrl: wtfLiveStages.liveUrl,
      ownerUserId: wtfLiveStages.ownerUserId,
    });
  return {
    id: row.slug,
    title: row.title,
    kind: "stage" as const,
    description: row.description,
    liveUrl: row.liveUrl,
    source: "user" as const,
    ownerUserId: row.ownerUserId,
    ownerUsername: null,
  } satisfies WtfLiveStageRecord;
}
