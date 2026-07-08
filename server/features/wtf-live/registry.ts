import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { users, wtfLiveRoomAccessMembers, wtfLiveRooms, wtfLiveStageAccessMembers, wtfLiveStages } from "@shared/schema";

export type WtfLiveRoomAccessMode = "public" | "private";

export type WtfLiveRoomAccessMember = {
  userId: number;
  username: string;
  displayName: string | null;
  role: "host" | "guest";
};

export type WtfLiveStageRole = "host" | "speaker";
export type WtfLiveStageRoomRole = "owner" | WtfLiveStageRole | "audience";
export type WtfLiveRoomType = "room" | "game";

export type WtfLiveStageAccessMember = {
  userId: number;
  username: string;
  displayName: string | null;
  role: WtfLiveStageRole;
};

export type WtfLiveRoomRecord = {
  id: string;
  title: string;
  kind: WtfLiveRoomType;
  description: string;
  source: "system" | "user";
  ownerUserId: number | null;
  ownerUsername: string | null;
  accessMode: WtfLiveRoomAccessMode;
  isPublic: boolean;
  accessMembers?: WtfLiveRoomAccessMember[];
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
  isPublic: boolean;
  accessMembers?: WtfLiveStageAccessMember[];
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
    accessMode: "public",
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
    accessMode: "public",
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
    isPublic: true,
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
    isPublic: true,
  },
];

function roomRecordFromRow(row: {
  rowId?: number;
  slug: string;
  title: string;
  description: string;
  roomKind?: string | null;
  ownerUserId: number;
  accessMode: string;
  isPublic: boolean;
}): WtfLiveRoomRecord {
  return {
    id: row.slug,
    title: row.title,
    kind: row.roomKind === "game" ? "game" : "room",
    description: row.description,
    source: "user" as const,
    ownerUserId: row.ownerUserId,
    ownerUsername: null,
    accessMode: row.accessMode === "private" ? "private" : "public",
    isPublic: row.isPublic,
  };
}

function stageRecordFromRow(row: {
  rowId?: number;
  slug: string;
  title: string;
  description: string;
  liveUrl: string | null;
  ownerUserId: number;
  isPublic: boolean;
}): WtfLiveStageRecord {
  return {
    id: row.slug,
    title: row.title,
    kind: "stage" as const,
    description: row.description,
    liveUrl: row.liveUrl,
    source: "user" as const,
    ownerUserId: row.ownerUserId,
    ownerUsername: null,
    isPublic: row.isPublic,
  };
}

function normalizeAccessUsernames(usernames: string[]): string[] {
  return Array.from(
    new Set(usernames.map((username) => username.replace(/^@/, "").trim()).filter(Boolean)),
  ).slice(0, 50);
}

function normalizeStageRole(value: string | null | undefined): WtfLiveStageRole {
  return value === "host" ? "host" : "speaker";
}

function normalizeRoomRole(value: string | null | undefined): "host" | "guest" {
  return value === "host" ? "host" : "guest";
}

async function listStageAccessMembersByRowId(
  stageRowId: number,
  tx: any = db,
): Promise<WtfLiveStageAccessMember[]> {
  const members: Array<{
    userId: number;
    username: string;
    displayName: string | null;
    role: string;
  }> = await tx
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: wtfLiveStageAccessMembers.role,
    })
    .from(wtfLiveStageAccessMembers)
    .innerJoin(users, eq(wtfLiveStageAccessMembers.userId, users.id))
    .where(eq(wtfLiveStageAccessMembers.stageId, stageRowId))
    .orderBy(wtfLiveStageAccessMembers.role, users.username);
  return members.map((member) => ({
    ...member,
    role: normalizeStageRole(member.role),
  }));
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
    const existingStage = await db
      .select({ id: wtfLiveStages.id })
      .from(wtfLiveStages)
      .where(eq(wtfLiveStages.slug, candidate))
      .limit(1);
    if (
      existing.length === 0 &&
      existingStage.length === 0 &&
      !SYSTEM_WTF_LIVE_ROOMS.some((room) => room.id === candidate) &&
      !SYSTEM_WTF_LIVE_STAGES.some((stage) => stage.id === candidate)
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
    const existingRoom = await db
      .select({ id: wtfLiveRooms.id })
      .from(wtfLiveRooms)
      .where(eq(wtfLiveRooms.slug, candidate))
      .limit(1);
    if (
      existing.length === 0 &&
      existingRoom.length === 0 &&
      !SYSTEM_WTF_LIVE_STAGES.some((stage) => stage.id === candidate) &&
      !SYSTEM_WTF_LIVE_ROOMS.some((room) => room.id === candidate)
    ) {
      return candidate;
    }
    suffix += 1;
  }
}

export async function listWtfLiveRooms(): Promise<WtfLiveRoomRecord[]> {
  const rows = await db
    .select({
      rowId: wtfLiveRooms.id,
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      roomKind: wtfLiveRooms.roomKind,
      ownerUserId: wtfLiveRooms.ownerUserId,
      accessMode: wtfLiveRooms.accessMode,
      isPublic: wtfLiveRooms.isPublic,
    })
    .from(wtfLiveRooms)
    .where(and(isNull(wtfLiveRooms.archivedAt), eq(wtfLiveRooms.accessMode, "public"), eq(wtfLiveRooms.isPublic, true)))
    .orderBy(wtfLiveRooms.createdAt);

  return [
    ...SYSTEM_WTF_LIVE_ROOMS,
    ...rows.map(roomRecordFromRow),
  ];
}

export async function listOwnedWtfLiveRooms(ownerUserId: number): Promise<WtfLiveRoomRecord[]> {
  const rows = await db
    .select({
      rowId: wtfLiveRooms.id,
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      roomKind: wtfLiveRooms.roomKind,
      ownerUserId: wtfLiveRooms.ownerUserId,
      accessMode: wtfLiveRooms.accessMode,
      isPublic: wtfLiveRooms.isPublic,
    })
    .from(wtfLiveRooms)
    .where(and(eq(wtfLiveRooms.ownerUserId, ownerUserId), isNull(wtfLiveRooms.archivedAt)))
    .orderBy(wtfLiveRooms.createdAt);

  return rows.map(roomRecordFromRow);
}

export async function listAccessiblePrivateWtfLiveRooms(userId: number): Promise<WtfLiveRoomRecord[]> {
  const rows = await db
    .select({
      rowId: wtfLiveRooms.id,
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      roomKind: wtfLiveRooms.roomKind,
      ownerUserId: wtfLiveRooms.ownerUserId,
      accessMode: wtfLiveRooms.accessMode,
      isPublic: wtfLiveRooms.isPublic,
    })
    .from(wtfLiveRooms)
    .leftJoin(wtfLiveRoomAccessMembers, eq(wtfLiveRoomAccessMembers.roomId, wtfLiveRooms.id))
    .where(
      and(
        isNull(wtfLiveRooms.archivedAt),
        eq(wtfLiveRooms.accessMode, "private"),
        or(eq(wtfLiveRooms.ownerUserId, userId), eq(wtfLiveRoomAccessMembers.userId, userId)),
      ),
    )
    .orderBy(wtfLiveRooms.createdAt);
  const bySlug = new Map<string, WtfLiveRoomRecord>();
  rows.forEach((row) => bySlug.set(row.slug, roomRecordFromRow(row)));
  return Array.from(bySlug.values());
}

export async function getWtfLiveRoom(roomId: string): Promise<WtfLiveRoomRecord | null> {
  const systemRoom = SYSTEM_WTF_LIVE_ROOMS.find((room) => room.id === roomId);
  if (systemRoom) return systemRoom;
  const rows = await db
    .select({
      rowId: wtfLiveRooms.id,
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      roomKind: wtfLiveRooms.roomKind,
      ownerUserId: wtfLiveRooms.ownerUserId,
      accessMode: wtfLiveRooms.accessMode,
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
  return room?.accessMode === "public" && room.isPublic ? room : null;
}

export async function canAccessWtfLiveRoom(roomId: string, userId: number | null): Promise<WtfLiveRoomRecord | null> {
  const room = await getWtfLiveRoom(roomId);
  if (!room) return null;
  if (room.accessMode === "public") return room.isPublic || (userId != null && room.ownerUserId === userId) ? room : null;
  if (userId == null) return null;
  if (room.ownerUserId === userId) return room;
  if (!room.isPublic) return null;
  const [member] = await db
    .select({ id: wtfLiveRoomAccessMembers.id })
    .from(wtfLiveRoomAccessMembers)
    .innerJoin(wtfLiveRooms, eq(wtfLiveRoomAccessMembers.roomId, wtfLiveRooms.id))
    .where(
      and(
        eq(wtfLiveRooms.slug, roomId),
        eq(wtfLiveRooms.accessMode, "private"),
        isNull(wtfLiveRooms.archivedAt),
        eq(wtfLiveRoomAccessMembers.userId, userId),
      ),
    )
    .limit(1);
  return member ? room : null;
}

export async function listWtfLiveStages(): Promise<WtfLiveStageRecord[]> {
  const rows = await db
    .select({
      slug: wtfLiveStages.slug,
      title: wtfLiveStages.title,
      description: wtfLiveStages.description,
      liveUrl: wtfLiveStages.liveUrl,
      ownerUserId: wtfLiveStages.ownerUserId,
      isPublic: wtfLiveStages.isPublic,
    })
    .from(wtfLiveStages)
    .where(and(isNull(wtfLiveStages.archivedAt), eq(wtfLiveStages.isPublic, true)))
    .orderBy(wtfLiveStages.createdAt);

  return [
    ...SYSTEM_WTF_LIVE_STAGES,
    ...rows.map(stageRecordFromRow),
  ];
}

export async function listOwnedWtfLiveStages(ownerUserId: number): Promise<WtfLiveStageRecord[]> {
  const rows = await db
    .select({
      slug: wtfLiveStages.slug,
      title: wtfLiveStages.title,
      description: wtfLiveStages.description,
      liveUrl: wtfLiveStages.liveUrl,
      ownerUserId: wtfLiveStages.ownerUserId,
      isPublic: wtfLiveStages.isPublic,
    })
    .from(wtfLiveStages)
    .where(and(eq(wtfLiveStages.ownerUserId, ownerUserId), isNull(wtfLiveStages.archivedAt)))
    .orderBy(wtfLiveStages.createdAt);

  return rows.map(stageRecordFromRow);
}

export async function getWtfLiveStage(stageId: string): Promise<WtfLiveStageRecord | null> {
  const systemStage = SYSTEM_WTF_LIVE_STAGES.find((stage) => stage.id === stageId);
  if (systemStage) return systemStage;
  const rows = await db
    .select({
      rowId: wtfLiveStages.id,
      slug: wtfLiveStages.slug,
      title: wtfLiveStages.title,
      description: wtfLiveStages.description,
      liveUrl: wtfLiveStages.liveUrl,
      ownerUserId: wtfLiveStages.ownerUserId,
      isPublic: wtfLiveStages.isPublic,
    })
    .from(wtfLiveStages)
    .where(and(eq(wtfLiveStages.slug, stageId), isNull(wtfLiveStages.archivedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return stageRecordFromRow(row);
}

export async function getPublicWtfLiveStage(stageId: string): Promise<WtfLiveStageRecord | null> {
  const stage = await getWtfLiveStage(stageId);
  return stage?.isPublic ? stage : null;
}

export async function getWtfLiveStageRoomRole(
  stageId: string,
  userId: number | null,
): Promise<WtfLiveStageRoomRole> {
  if (userId == null) return "audience";
  const [stage] = await db
    .select({
      id: wtfLiveStages.id,
      ownerUserId: wtfLiveStages.ownerUserId,
    })
    .from(wtfLiveStages)
    .where(and(eq(wtfLiveStages.slug, stageId), isNull(wtfLiveStages.archivedAt)))
    .limit(1);
  if (!stage) return "audience";
  if (stage.ownerUserId === userId) return "owner";
  const [member] = await db
    .select({ role: wtfLiveStageAccessMembers.role })
    .from(wtfLiveStageAccessMembers)
    .where(and(eq(wtfLiveStageAccessMembers.stageId, stage.id), eq(wtfLiveStageAccessMembers.userId, userId)))
    .limit(1);
  return member ? normalizeStageRole(member.role) : "audience";
}

export async function canAccessWtfLiveStage(
  stageId: string,
  userId: number | null,
): Promise<{ stage: WtfLiveStageRecord; role: WtfLiveStageRoomRole } | null> {
  const stage = await getWtfLiveStage(stageId);
  if (!stage) return null;
  const role = await getWtfLiveStageRoomRole(stageId, userId);
  if (stage.isPublic || role !== "audience") return { stage, role };
  return null;
}

async function selectManageableStageRow(stageId: string, actorUserId: number, tx: any = db) {
  const [stage] = await tx
    .select({
      rowId: wtfLiveStages.id,
      slug: wtfLiveStages.slug,
      title: wtfLiveStages.title,
      description: wtfLiveStages.description,
      liveUrl: wtfLiveStages.liveUrl,
      ownerUserId: wtfLiveStages.ownerUserId,
      isPublic: wtfLiveStages.isPublic,
    })
    .from(wtfLiveStages)
    .where(and(eq(wtfLiveStages.slug, stageId), isNull(wtfLiveStages.archivedAt)))
    .limit(1);
  if (!stage) return null;
  if (stage.ownerUserId === actorUserId) return stage;
  const [host] = await tx
    .select({ id: wtfLiveStageAccessMembers.id })
    .from(wtfLiveStageAccessMembers)
    .where(
      and(
        eq(wtfLiveStageAccessMembers.stageId, stage.rowId),
        eq(wtfLiveStageAccessMembers.userId, actorUserId),
        eq(wtfLiveStageAccessMembers.role, "host"),
      ),
    )
    .limit(1);
  return host ? stage : null;
}

export async function listManageableWtfLiveStageAccessMembers(input: {
  actorUserId: number;
  stageId: string;
}): Promise<{ stage: WtfLiveStageRecord; members: WtfLiveStageAccessMember[] } | null> {
  const stage = await selectManageableStageRow(input.stageId, input.actorUserId);
  if (!stage) return null;
  const members = await listStageAccessMembersByRowId(stage.rowId);
  return {
    stage: { ...stageRecordFromRow(stage), accessMembers: members },
    members,
  };
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
  accessMode?: WtfLiveRoomAccessMode;
  roomKind?: WtfLiveRoomType;
}) {
  const slug = await uniqueRoomSlug(input.title);
  const accessMode = input.accessMode === "private" ? "private" : "public";
  const roomKind = input.roomKind === "game" ? "game" : "room";
  const [row] = await db
    .insert(wtfLiveRooms)
    .values({
      slug,
      title: input.title.trim(),
      description: (input.description || "").trim(),
      roomKind,
      ownerUserId: input.ownerUserId,
      accessMode,
    })
    .returning({
      rowId: wtfLiveRooms.id,
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      description: wtfLiveRooms.description,
      roomKind: wtfLiveRooms.roomKind,
      ownerUserId: wtfLiveRooms.ownerUserId,
      accessMode: wtfLiveRooms.accessMode,
      isPublic: wtfLiveRooms.isPublic,
    });
  return roomRecordFromRow(row);
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
      roomKind: wtfLiveRooms.roomKind,
      ownerUserId: wtfLiveRooms.ownerUserId,
      accessMode: wtfLiveRooms.accessMode,
      isPublic: wtfLiveRooms.isPublic,
    });
  return row ? roomRecordFromRow(row) : null;
}

export async function listOwnedWtfLiveRoomAccessMembers(input: {
  ownerUserId: number;
  roomId: string;
}): Promise<WtfLiveRoomAccessMember[] | null> {
  const [room] = await db
    .select({ id: wtfLiveRooms.id })
    .from(wtfLiveRooms)
    .where(
      and(
        eq(wtfLiveRooms.slug, input.roomId),
        eq(wtfLiveRooms.ownerUserId, input.ownerUserId),
        isNull(wtfLiveRooms.archivedAt),
      ),
    )
    .limit(1);
  if (!room) return null;
  return db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: wtfLiveRoomAccessMembers.role,
    })
    .from(wtfLiveRoomAccessMembers)
    .innerJoin(users, eq(wtfLiveRoomAccessMembers.userId, users.id))
    .where(eq(wtfLiveRoomAccessMembers.roomId, room.id))
    .orderBy(wtfLiveRoomAccessMembers.role, users.username)
    .then((members) => members.map((member) => ({ ...member, role: normalizeRoomRole(member.role) })));
}

export async function replaceOwnedWtfLiveRoomAccessMembers(input: {
  ownerUserId: number;
  roomId: string;
  usernames: string[];
}): Promise<{ room: WtfLiveRoomRecord; members: WtfLiveRoomAccessMember[]; missingUsernames: string[] } | null> {
  const normalizedUsernames = normalizeAccessUsernames(input.usernames);

  return db.transaction(async (tx) => {
    const [room] = await tx
      .select({
        id: wtfLiveRooms.id,
        slug: wtfLiveRooms.slug,
        title: wtfLiveRooms.title,
        description: wtfLiveRooms.description,
        roomKind: wtfLiveRooms.roomKind,
        ownerUserId: wtfLiveRooms.ownerUserId,
        accessMode: wtfLiveRooms.accessMode,
        isPublic: wtfLiveRooms.isPublic,
      })
      .from(wtfLiveRooms)
      .where(
        and(
          eq(wtfLiveRooms.slug, input.roomId),
          eq(wtfLiveRooms.ownerUserId, input.ownerUserId),
          eq(wtfLiveRooms.accessMode, "private"),
          isNull(wtfLiveRooms.archivedAt),
        ),
      )
      .limit(1);
    if (!room) return null;

    const foundUsers = normalizedUsernames.length
      ? await tx
          .select({ id: users.id, username: users.username, displayName: users.displayName })
          .from(users)
          .where(inArray(users.username, normalizedUsernames))
      : [];
    const foundByUsername = new Map(foundUsers.map((user) => [user.username, user]));
    const missingUsernames = normalizedUsernames.filter((username) => !foundByUsername.has(username));
    const memberRows = foundUsers
      .filter((user) => user.id !== input.ownerUserId)
      .map((user) => ({
        roomId: room.id,
        userId: user.id,
        role: "guest",
        addedByUserId: input.ownerUserId,
      }));

    await tx.delete(wtfLiveRoomAccessMembers).where(eq(wtfLiveRoomAccessMembers.roomId, room.id));
    if (memberRows.length) {
      await tx.insert(wtfLiveRoomAccessMembers).values(memberRows).onConflictDoNothing();
    }

    const members = memberRows.length
      ? await tx
          .select({
            userId: users.id,
            username: users.username,
            displayName: users.displayName,
            role: wtfLiveRoomAccessMembers.role,
          })
          .from(wtfLiveRoomAccessMembers)
          .innerJoin(users, eq(wtfLiveRoomAccessMembers.userId, users.id))
          .where(eq(wtfLiveRoomAccessMembers.roomId, room.id))
          .orderBy(wtfLiveRoomAccessMembers.role, users.username)
      : [];
    const normalizedMembers = members.map((member) => ({ ...member, role: normalizeRoomRole(member.role) }));

    return {
      room: { ...roomRecordFromRow(room), accessMembers: normalizedMembers },
      members: normalizedMembers,
      missingUsernames,
    };
  });
}

export async function replaceManageableWtfLiveStageAccessMembers(input: {
  actorUserId: number;
  stageId: string;
  hostUsernames: string[];
  speakerUsernames: string[];
}): Promise<{
  stage: WtfLiveStageRecord;
  members: WtfLiveStageAccessMember[];
  missingUsernames: string[];
} | null> {
  const normalizedHosts = normalizeAccessUsernames(input.hostUsernames);
  const normalizedSpeakers = normalizeAccessUsernames(input.speakerUsernames);
  const allUsernames = normalizeAccessUsernames([...normalizedHosts, ...normalizedSpeakers]);

  return db.transaction(async (tx) => {
    const stage = await selectManageableStageRow(input.stageId, input.actorUserId, tx);
    if (!stage) return null;

    const foundUsers = allUsernames.length
      ? await tx
          .select({ id: users.id, username: users.username, displayName: users.displayName })
          .from(users)
          .where(inArray(users.username, allUsernames))
      : [];
    const foundByUsername = new Map(foundUsers.map((user) => [user.username, user]));
    const hostIds = new Set(
      normalizedHosts
        .map((username) => foundByUsername.get(username)?.id)
        .filter((id): id is number => Boolean(id && id !== stage.ownerUserId)),
    );
    const speakerIds = new Set(
      normalizedSpeakers
        .map((username) => foundByUsername.get(username)?.id)
        .filter((id): id is number => Boolean(id && id !== stage.ownerUserId && !hostIds.has(id))),
    );
    const missingUsernames = allUsernames.filter((username) => !foundByUsername.has(username));
    const memberRows = [
      ...Array.from(hostIds).map((userId) => ({
        stageId: stage.rowId,
        userId,
        role: "host",
        addedByUserId: input.actorUserId,
      })),
      ...Array.from(speakerIds).map((userId) => ({
        stageId: stage.rowId,
        userId,
        role: "speaker",
        addedByUserId: input.actorUserId,
      })),
    ];

    await tx.delete(wtfLiveStageAccessMembers).where(eq(wtfLiveStageAccessMembers.stageId, stage.rowId));
    if (memberRows.length) {
      await tx.insert(wtfLiveStageAccessMembers).values(memberRows).onConflictDoNothing();
    }

    const members = await listStageAccessMembersByRowId(stage.rowId, tx);
    return {
      stage: { ...stageRecordFromRow(stage), accessMembers: members },
      members,
      missingUsernames,
    };
  });
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

export async function updateOwnedWtfLiveStageVisibility(input: {
  ownerUserId: number;
  stageId: string;
  isPublic: boolean;
}): Promise<WtfLiveStageRecord | null> {
  const [row] = await db
    .update(wtfLiveStages)
    .set({
      isPublic: input.isPublic,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(wtfLiveStages.slug, input.stageId),
        eq(wtfLiveStages.ownerUserId, input.ownerUserId),
        isNull(wtfLiveStages.archivedAt),
      ),
    )
    .returning({
      slug: wtfLiveStages.slug,
      title: wtfLiveStages.title,
      description: wtfLiveStages.description,
      liveUrl: wtfLiveStages.liveUrl,
      ownerUserId: wtfLiveStages.ownerUserId,
      isPublic: wtfLiveStages.isPublic,
    });
  return row ? stageRecordFromRow(row) : null;
}

export async function archiveOwnedWtfLiveStage(input: {
  ownerUserId: number;
  stageId: string;
}): Promise<boolean> {
  const [row] = await db
    .update(wtfLiveStages)
    .set({
      archivedAt: new Date(),
      isPublic: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(wtfLiveStages.slug, input.stageId),
        eq(wtfLiveStages.ownerUserId, input.ownerUserId),
        isNull(wtfLiveStages.archivedAt),
      ),
    )
    .returning({ id: wtfLiveStages.id });
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
      isPublic: wtfLiveStages.isPublic,
    });
  return stageRecordFromRow(row);
}
