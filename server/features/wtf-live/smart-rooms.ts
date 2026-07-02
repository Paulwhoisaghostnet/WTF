import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import {
  gameshowEvents,
  users,
  wtfLiveRoomAccessMembers,
  wtfLiveRoomCalendarEvents,
  wtfLiveRoomInvites,
  wtfLiveRooms,
  wtfLiveRoomSettings,
  wtfLiveShowKits,
  wtfLiveSoundboardClips,
  wtfLiveStageAccessMembers,
  wtfLiveStages,
} from "@shared/schema";
import { createNotificationsForUsers } from "../../lib/notifications";
import { slugifyWtfLiveId } from "./registry";

export type WtfLiveRoomKind = "room" | "stage";
export type WtfLiveRoomRole = "owner" | "host" | "guest" | "audience";
export type WtfLiveInviteRole = "guest" | "host" | "speaker";

export type WtfLiveRoomSettingsRecord = {
  roomKind: WtfLiveRoomKind;
  roomId: string;
  ownerUserId: number | null;
  allowGuestAudio: boolean;
  allowGuestCamera: boolean;
  allowGuestScreen: boolean;
  allowGuestMedia: boolean;
  showKitEnabled: boolean;
  showKitId: number | null;
  showKitName: string | null;
  updatedAt: string | null;
};

export type WtfLiveRoomPublishPermissions = {
  audio: boolean;
  camera: boolean;
  screen: boolean;
  media: boolean;
  soundboard: boolean;
  canManageRoom: boolean;
  roomRole: WtfLiveRoomRole;
  settings: WtfLiveRoomSettingsRecord;
};

const DEFAULT_ROOM_SETTINGS = {
  allowGuestAudio: true,
  allowGuestCamera: true,
  allowGuestScreen: true,
  allowGuestMedia: true,
  showKitEnabled: true,
};

function normalizeUsernames(usernames: string[]): string[] {
  return Array.from(
    new Set(usernames.map((username) => username.replace(/^@/, "").trim()).filter(Boolean)),
  ).slice(0, 50);
}

function normalizeRoomKind(value: string): WtfLiveRoomKind {
  return value === "stage" ? "stage" : "room";
}

function normalizeRoomRole(value: string | null | undefined): "host" | "guest" {
  return value === "host" ? "host" : "guest";
}

function normalizeInviteRole(value: string | null | undefined, roomKind: WtfLiveRoomKind): WtfLiveInviteRole {
  if (roomKind === "stage") return value === "host" ? "host" : value === "speaker" ? "speaker" : "guest";
  return value === "host" ? "host" : "guest";
}

function normalizeClipIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      raw
        .map((clipId) => String(clipId || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 80))
        .filter(Boolean),
    ),
  ).slice(0, 24);
}

function settingsEnvelope(input: {
  roomKind: WtfLiveRoomKind;
  roomId: string;
  ownerUserId: number | null;
  row?: typeof wtfLiveRoomSettings.$inferSelect | null;
  showKitName?: string | null;
}): WtfLiveRoomSettingsRecord {
  return {
    roomKind: input.roomKind,
    roomId: input.roomId,
    ownerUserId: input.ownerUserId,
    allowGuestAudio: input.row?.allowGuestAudio ?? DEFAULT_ROOM_SETTINGS.allowGuestAudio,
    allowGuestCamera: input.row?.allowGuestCamera ?? DEFAULT_ROOM_SETTINGS.allowGuestCamera,
    allowGuestScreen: input.row?.allowGuestScreen ?? DEFAULT_ROOM_SETTINGS.allowGuestScreen,
    allowGuestMedia: input.row?.allowGuestMedia ?? DEFAULT_ROOM_SETTINGS.allowGuestMedia,
    showKitEnabled: input.row?.showKitEnabled ?? DEFAULT_ROOM_SETTINGS.showKitEnabled,
    showKitId: input.row?.showKitId ?? null,
    showKitName: input.showKitName ?? null,
    updatedAt: input.row?.updatedAt?.toISOString() ?? null,
  };
}

async function getRoomOwner(roomKind: WtfLiveRoomKind, roomId: string) {
  if (roomKind === "stage") {
    const [stage] = await db
      .select({
        rowId: wtfLiveStages.id,
        slug: wtfLiveStages.slug,
        title: wtfLiveStages.title,
        ownerUserId: wtfLiveStages.ownerUserId,
      })
      .from(wtfLiveStages)
      .where(and(eq(wtfLiveStages.slug, roomId), isNull(wtfLiveStages.archivedAt)))
      .limit(1);
    return stage ? { ...stage, roomKind } : null;
  }
  const [room] = await db
    .select({
      rowId: wtfLiveRooms.id,
      slug: wtfLiveRooms.slug,
      title: wtfLiveRooms.title,
      ownerUserId: wtfLiveRooms.ownerUserId,
    })
    .from(wtfLiveRooms)
    .where(and(eq(wtfLiveRooms.slug, roomId), isNull(wtfLiveRooms.archivedAt)))
    .limit(1);
  return room ? { ...room, roomKind } : null;
}

async function getRoomRole(roomKind: WtfLiveRoomKind, roomId: string, userId: number | null): Promise<WtfLiveRoomRole> {
  if (!userId) return "audience";
  const owner = await getRoomOwner(roomKind, roomId);
  if (!owner) return "audience";
  if (owner.ownerUserId === userId) return "owner";

  if (roomKind === "stage") {
    const [member] = await db
      .select({ role: wtfLiveStageAccessMembers.role })
      .from(wtfLiveStageAccessMembers)
      .where(and(eq(wtfLiveStageAccessMembers.stageId, owner.rowId), eq(wtfLiveStageAccessMembers.userId, userId)))
      .limit(1);
    return member?.role === "host" ? "host" : member?.role === "speaker" ? "guest" : "audience";
  }

  const [member] = await db
    .select({ role: wtfLiveRoomAccessMembers.role })
    .from(wtfLiveRoomAccessMembers)
    .where(and(eq(wtfLiveRoomAccessMembers.roomId, owner.rowId), eq(wtfLiveRoomAccessMembers.userId, userId)))
    .limit(1);
  return member ? normalizeRoomRole(member.role) : "audience";
}

export async function searchWtfLiveUsers(input: {
  q?: string;
  actorUserId?: number | null;
  limit?: number;
}) {
  const query = String(input.q || "").trim();
  const limit = Math.max(1, Math.min(Number(input.limit) || 30, 100));
  const clauses = [];
  if (query) {
    const pattern = `%${query}%`;
    clauses.push(or(ilike(users.username, pattern), ilike(users.displayName, pattern)));
  }
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: users.role,
    })
    .from(users)
    .where(clauses.length ? and(...clauses.filter(Boolean)) : undefined)
    .orderBy(users.username)
    .limit(limit);
  return rows;
}

export async function getWtfLiveRoomSettings(input: {
  roomKind: WtfLiveRoomKind;
  roomId: string;
}): Promise<WtfLiveRoomSettingsRecord> {
  const owner = await getRoomOwner(input.roomKind, input.roomId);
  const [row] = await db
    .select()
    .from(wtfLiveRoomSettings)
    .where(and(eq(wtfLiveRoomSettings.roomKind, input.roomKind), eq(wtfLiveRoomSettings.roomId, input.roomId)))
    .limit(1);
  let showKitName: string | null = null;
  if (row?.showKitId) {
    const [kit] = await db
      .select({ name: wtfLiveShowKits.name })
      .from(wtfLiveShowKits)
      .where(eq(wtfLiveShowKits.id, row.showKitId))
      .limit(1);
    showKitName = kit?.name ?? null;
  }
  return settingsEnvelope({
    roomKind: input.roomKind,
    roomId: input.roomId,
    ownerUserId: owner?.ownerUserId ?? null,
    row,
    showKitName,
  });
}

export async function getWtfLiveRoomPublishPermissions(input: {
  roomKind: WtfLiveRoomKind;
  roomId: string;
  userId: number | null;
}): Promise<WtfLiveRoomPublishPermissions> {
  const settings = await getWtfLiveRoomSettings(input);
  const role = await getRoomRole(input.roomKind, input.roomId, input.userId);
  const privileged = role === "owner" || role === "host";
  return {
    audio: privileged || settings.allowGuestAudio,
    camera: privileged || settings.allowGuestCamera,
    screen: privileged || settings.allowGuestScreen,
    media: privileged || settings.allowGuestMedia,
    soundboard: privileged && settings.showKitEnabled,
    canManageRoom: privileged,
    roomRole: role,
    settings,
  };
}

export async function updateWtfLiveRoomSettings(input: {
  actorUserId: number;
  roomKind: WtfLiveRoomKind;
  roomId: string;
  allowGuestAudio?: boolean;
  allowGuestCamera?: boolean;
  allowGuestScreen?: boolean;
  allowGuestMedia?: boolean;
  showKitEnabled?: boolean;
  showKitId?: number | null;
}): Promise<WtfLiveRoomSettingsRecord | null> {
  const owner = await getRoomOwner(input.roomKind, input.roomId);
  if (!owner) return null;
  const role = await getRoomRole(input.roomKind, input.roomId, input.actorUserId);
  if (role !== "owner" && role !== "host") return null;
  const current = await getWtfLiveRoomSettings({ roomKind: input.roomKind, roomId: input.roomId });

  let showKitId = input.showKitId === undefined ? current.showKitId : input.showKitId;
  if (showKitId) {
    const [kit] = await db
      .select({ id: wtfLiveShowKits.id })
      .from(wtfLiveShowKits)
      .where(and(eq(wtfLiveShowKits.id, showKitId), eq(wtfLiveShowKits.ownerUserId, owner.ownerUserId)))
      .limit(1);
    if (!kit) showKitId = null;
  }

  const now = new Date();
  await db
    .insert(wtfLiveRoomSettings)
    .values({
      ownerUserId: owner.ownerUserId,
      roomKind: input.roomKind,
      roomId: input.roomId,
      allowGuestAudio: input.allowGuestAudio ?? current.allowGuestAudio,
      allowGuestCamera: input.allowGuestCamera ?? current.allowGuestCamera,
      allowGuestScreen: input.allowGuestScreen ?? current.allowGuestScreen,
      allowGuestMedia: input.allowGuestMedia ?? current.allowGuestMedia,
      showKitEnabled: input.showKitEnabled ?? current.showKitEnabled,
      showKitId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [wtfLiveRoomSettings.roomKind, wtfLiveRoomSettings.roomId],
      set: {
        allowGuestAudio: input.allowGuestAudio ?? current.allowGuestAudio,
        allowGuestCamera: input.allowGuestCamera ?? current.allowGuestCamera,
        allowGuestScreen: input.allowGuestScreen ?? current.allowGuestScreen,
        allowGuestMedia: input.allowGuestMedia ?? current.allowGuestMedia,
        showKitEnabled: input.showKitEnabled ?? current.showKitEnabled,
        showKitId,
        updatedAt: now,
      },
    });
  return getWtfLiveRoomSettings({ roomKind: input.roomKind, roomId: input.roomId });
}

export async function replaceOwnedWtfLiveRoomRoleMembers(input: {
  ownerUserId: number;
  roomId: string;
  hostUsernames: string[];
  guestUsernames: string[];
}) {
  const normalizedHosts = normalizeUsernames(input.hostUsernames);
  const normalizedGuests = normalizeUsernames(input.guestUsernames);
  const allUsernames = normalizeUsernames([...normalizedHosts, ...normalizedGuests]);

  return db.transaction(async (tx) => {
    const [room] = await tx
      .select({
        id: wtfLiveRooms.id,
        slug: wtfLiveRooms.slug,
        ownerUserId: wtfLiveRooms.ownerUserId,
      })
      .from(wtfLiveRooms)
      .where(and(eq(wtfLiveRooms.slug, input.roomId), eq(wtfLiveRooms.ownerUserId, input.ownerUserId), isNull(wtfLiveRooms.archivedAt)))
      .limit(1);
    if (!room) return null;

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
        .filter((id): id is number => Boolean(id && id !== input.ownerUserId)),
    );
    const guestIds = new Set(
      normalizedGuests
        .map((username) => foundByUsername.get(username)?.id)
        .filter((id): id is number => Boolean(id && id !== input.ownerUserId && !hostIds.has(id))),
    );
    const rows = [
      ...Array.from(hostIds).map((userId) => ({ roomId: room.id, userId, role: "host", addedByUserId: input.ownerUserId })),
      ...Array.from(guestIds).map((userId) => ({ roomId: room.id, userId, role: "guest", addedByUserId: input.ownerUserId })),
    ];

    await tx.delete(wtfLiveRoomAccessMembers).where(eq(wtfLiveRoomAccessMembers.roomId, room.id));
    if (rows.length) await tx.insert(wtfLiveRoomAccessMembers).values(rows).onConflictDoNothing();

    const members = await tx
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        role: wtfLiveRoomAccessMembers.role,
      })
      .from(wtfLiveRoomAccessMembers)
      .innerJoin(users, eq(wtfLiveRoomAccessMembers.userId, users.id))
      .where(eq(wtfLiveRoomAccessMembers.roomId, room.id))
      .orderBy(wtfLiveRoomAccessMembers.role, users.username);

    return {
      members: members.map((member) => ({ ...member, role: normalizeRoomRole(member.role) })),
      missingUsernames: allUsernames.filter((username) => !foundByUsername.has(username)),
    };
  });
}

export async function listUserWtfLiveShowKits(ownerUserId: number) {
  const kits = await db
    .select()
    .from(wtfLiveShowKits)
    .where(eq(wtfLiveShowKits.ownerUserId, ownerUserId))
    .orderBy(wtfLiveShowKits.name);
  return kits.map((kit) => ({
    id: kit.id,
    kitId: kit.kitId,
    name: kit.name,
    description: kit.description,
    clipIds: normalizeClipIds(kit.clipIds),
    clipCount: normalizeClipIds(kit.clipIds).length,
    isDefault: kit.isDefault,
    updatedAt: kit.updatedAt.toISOString(),
  }));
}

export async function createUserWtfLiveShowKit(input: {
  ownerUserId: number;
  name: string;
  description?: string;
  clipIds?: string[];
  isDefault?: boolean;
}) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80) || "Show Kit";
  const baseKitId = slugifyWtfLiveId(name).slice(0, 64) || "show-kit";
  const clipIds = input.clipIds?.length
    ? normalizeClipIds(input.clipIds)
    : normalizeClipIds(
        (
          await db
            .select({ clipId: wtfLiveSoundboardClips.clipId })
            .from(wtfLiveSoundboardClips)
            .where(eq(wtfLiveSoundboardClips.ownerUserId, input.ownerUserId))
            .orderBy(wtfLiveSoundboardClips.sortOrder, wtfLiveSoundboardClips.id)
        ).map((clip) => clip.clipId),
      );

  let kitId = baseKitId;
  for (let suffix = 0; ; suffix += 1) {
    kitId = suffix === 0 ? baseKitId : `${baseKitId}-${suffix}`;
    const existing = await db
      .select({ id: wtfLiveShowKits.id })
      .from(wtfLiveShowKits)
      .where(and(eq(wtfLiveShowKits.ownerUserId, input.ownerUserId), eq(wtfLiveShowKits.kitId, kitId)))
      .limit(1);
    if (!existing.length) break;
  }

  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx.update(wtfLiveShowKits).set({ isDefault: false }).where(eq(wtfLiveShowKits.ownerUserId, input.ownerUserId));
    }
    const [kit] = await tx
      .insert(wtfLiveShowKits)
      .values({
        ownerUserId: input.ownerUserId,
        kitId,
        name,
        description: (input.description || "").trim().slice(0, 500),
        clipIds,
        isDefault: Boolean(input.isDefault),
      })
      .returning();
    return {
      id: kit.id,
      kitId: kit.kitId,
      name: kit.name,
      description: kit.description,
      clipIds: normalizeClipIds(kit.clipIds),
      clipCount: normalizeClipIds(kit.clipIds).length,
      isDefault: kit.isDefault,
      updatedAt: kit.updatedAt.toISOString(),
    };
  });
}

export async function getWtfLiveRoomShowKit(input: {
  roomKind: WtfLiveRoomKind;
  roomId: string;
  actorUserId: number | null;
}) {
  const permissions = await getWtfLiveRoomPublishPermissions({
    roomKind: input.roomKind,
    roomId: input.roomId,
    userId: input.actorUserId,
  });
  if (!permissions.soundboard || !permissions.settings.ownerUserId || !permissions.settings.showKitId) {
    return { settings: { clips: [], armed: false, updatedAt: null }, kit: null, roomSettings: permissions.settings };
  }

  const [kit] = await db
    .select()
    .from(wtfLiveShowKits)
    .where(and(eq(wtfLiveShowKits.id, permissions.settings.showKitId), eq(wtfLiveShowKits.ownerUserId, permissions.settings.ownerUserId)))
    .limit(1);
  if (!kit) return { settings: { clips: [], armed: false, updatedAt: null }, kit: null, roomSettings: permissions.settings };

  const clipIds = normalizeClipIds(kit.clipIds);
  const clips = clipIds.length
    ? await db
        .select()
        .from(wtfLiveSoundboardClips)
        .where(and(eq(wtfLiveSoundboardClips.ownerUserId, kit.ownerUserId), inArray(wtfLiveSoundboardClips.clipId, clipIds)))
    : [];
  const order = new Map(clipIds.map((clipId, index) => [clipId, index]));
  const normalizedClips = clips
    .sort((a, b) => (order.get(a.clipId) ?? 0) - (order.get(b.clipId) ?? 0))
    .map((clip) => ({
      id: clip.clipId,
      label: clip.label,
      category: clip.category,
      shortcut: clip.shortcut,
      mimeType: clip.mimeType,
      dataUrl: clip.dataUrl,
      sizeBytes: clip.sizeBytes,
      volume: clip.volume,
      cooldownMs: clip.cooldownMs,
      createdAt: clip.createdAt.toISOString(),
    }));
  return {
    settings: {
      clips: normalizedClips,
      armed: true,
      updatedAt: kit.updatedAt.toISOString(),
      storage: "wtf_live_show_kits",
    },
    kit: {
      id: kit.id,
      kitId: kit.kitId,
      name: kit.name,
      description: kit.description,
      clipIds,
      clipCount: clipIds.length,
      isDefault: kit.isDefault,
      updatedAt: kit.updatedAt.toISOString(),
    },
    roomSettings: permissions.settings,
  };
}

export async function inviteWtfLiveRoomUser(input: {
  actorUserId: number;
  roomKind: WtfLiveRoomKind;
  roomId: string;
  targetUserId: number;
  role: WtfLiveInviteRole;
  message?: string;
}) {
  const owner = await getRoomOwner(input.roomKind, input.roomId);
  if (!owner) return null;
  const actorRole = await getRoomRole(input.roomKind, input.roomId, input.actorUserId);
  if (actorRole !== "owner" && actorRole !== "host") return null;
  const role = normalizeInviteRole(input.role, input.roomKind);
  const now = new Date();
  const [invite] = await db
    .insert(wtfLiveRoomInvites)
    .values({
      roomKind: input.roomKind,
      roomId: input.roomId,
      targetUserId: input.targetUserId,
      role,
      invitedByUserId: input.actorUserId,
      status: "pending",
      message: (input.message || "").trim().slice(0, 500),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [wtfLiveRoomInvites.roomKind, wtfLiveRoomInvites.roomId, wtfLiveRoomInvites.targetUserId, wtfLiveRoomInvites.role],
      set: {
        status: "pending",
        message: (input.message || "").trim().slice(0, 500),
        invitedByUserId: input.actorUserId,
        updatedAt: now,
        respondedAt: null,
      },
    })
    .returning();
  await createNotificationsForUsers([input.targetUserId], {
    eventKey: "wtf_live.room_invite",
    title: `WTF LIVE invite: ${owner.title}`,
    body: `${role === "host" ? "Host" : role === "speaker" ? "Speaker" : "Guest"} invite for ${owner.title}.`,
    sourceUserId: input.actorUserId,
    metadata: {
      roomKind: input.roomKind,
      roomId: input.roomId,
      role,
      path: `/live/r/${encodeURIComponent(input.roomId)}`,
    },
  }).catch((error) => console.warn("[wtf-live] invite notification failed", error));
  return invite;
}

export function buildTtcSubmitUrl(input: {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string | null;
  roomUrl: string;
}) {
  const params = new URLSearchParams();
  params.set("title", input.title);
  params.set("description", `${input.description || ""}\n\nWTF LIVE room: ${input.roomUrl}`.trim());
  params.set("start", input.startsAt);
  if (input.endsAt) params.set("end", input.endsAt);
  params.set("url", input.roomUrl);
  return `https://thetezos.com/submit-event/?${params.toString()}`;
}

export async function scheduleWtfLiveRoomEvent(input: {
  actorUserId: number;
  roomKind: WtfLiveRoomKind;
  roomId: string;
  target: "wtf" | "ttc" | "both";
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string | null;
  visibility?: "public" | "contestants" | "hosts";
  roomUrl: string;
}) {
  const owner = await getRoomOwner(input.roomKind, input.roomId);
  if (!owner) return null;
  const actorRole = await getRoomRole(input.roomKind, input.roomId, input.actorUserId);
  if (actorRole !== "owner" && actorRole !== "host") return null;
  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (!Number.isFinite(startsAt.getTime()) || (endsAt && !Number.isFinite(endsAt.getTime()))) {
    throw new Error("Invalid event dates");
  }
  const target = input.target;
  const shouldWriteWtf = target === "wtf" || target === "both";
  const shouldSubmitTtc = target === "ttc" || target === "both";
  const ttcSubmitUrl = shouldSubmitTtc
    ? buildTtcSubmitUrl({
        title: input.title,
        description: input.description,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        roomUrl: input.roomUrl,
      })
    : null;

  let event: typeof gameshowEvents.$inferSelect | null = null;
  if (shouldWriteWtf) {
    const [row] = await db
      .insert(gameshowEvents)
      .values({
        kind: "custom",
        title: input.title.trim().slice(0, 300),
        description: (input.description || "").trim() || null,
        startsAt,
        endsAt,
        allDay: false,
        sourceKind: "wtf_live_room",
        sourceId: null,
        visibility: input.visibility ?? "public",
        status: "published",
        linksJson: [{ label: "Join WTF LIVE room", url: input.roomUrl }] as unknown as Record<string, unknown>[],
        createdBy: input.actorUserId,
        approvedBy: input.actorUserId,
        approvedAt: new Date(),
      })
      .returning();
    event = row;
  }

  const [mapping] = await db
    .insert(wtfLiveRoomCalendarEvents)
    .values({
      roomKind: input.roomKind,
      roomId: input.roomId,
      target,
      gameshowEventId: event?.id ?? null,
      ttcSubmitUrl,
      createdByUserId: input.actorUserId,
    })
    .returning();

  return { event, ttcSubmitUrl, mapping };
}
