import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { atprotoAccounts } from "@shared/schema";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";
import {
  accountHasAtprotoCapability,
  getAtprotoAgentForDid,
  getPublicAtprotoAgent,
} from "../features/atproto/oauth";
import {
  SKYWIRE_ROOM_MESSAGE_COLLECTION,
  SKYWIRE_STAGE_BROADCAST_COLLECTION,
  skywirePermissionTierLabel,
  type SkywirePermissionCapability,
  type SkywirePermissionTier,
} from "@shared/atproto-permissions";
import { sourceUrlForAtUri } from "../features/atproto/identity";
import { emitAtprotoSystemEvent } from "../features/atproto/events";
import { requireWtfLiveRollout, skywireRolloutStatusForRole } from "../lib/skywire-access";
import {
  archiveOwnedWtfLiveRoom,
  archiveOwnedWtfLiveStage,
  canAccessWtfLiveRoom,
  createWtfLiveRoom,
  createWtfLiveStage,
  getPublicWtfLiveRoom,
  listAccessiblePrivateWtfLiveRooms,
  listOwnedWtfLiveRoomAccessMembers,
  listOwnedWtfLiveRooms,
  listOwnedWtfLiveStages,
  listWtfLiveRooms,
  listWtfLiveStages,
  replaceOwnedWtfLiveRoomAccessMembers,
  updateOwnedWtfLiveStageVisibility,
  updateOwnedWtfLiveRoomVisibility,
  wtfLiveStageExists,
} from "../features/wtf-live/registry";
import {
  getUserWtfLiveSoundboardSettings,
  replaceUserWtfLiveSoundboardSettings,
} from "../features/wtf-live/soundboard";
import { getWtfLiveRoomPresence } from "../websocket";

const router = Router();
const actionLimiter = createInMemoryRateLimit({
  windowMs: 60_000,
  max: 30,
  message: { error: "Too many WTF LIVE actions. Try again shortly." },
  keyGenerator: (req) =>
    `wtf-live-action:${req.ip || (req.user as { id?: number } | undefined)?.id || "anonymous"}`,
});

const roomIdSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/i);
const stageIdSchema = roomIdSchema;

const quotedPostSnapshotSchema = z
  .object({
    uri: z.string().trim().min(1).max(2000),
    cid: z.string().trim().min(1).max(255).optional().nullable(),
    sourceUrl: z.string().url().optional().nullable(),
    text: z.string().trim().max(600).optional().nullable(),
    authorHandle: z.string().trim().max(253).optional().nullable(),
    authorDid: z.string().trim().max(255).optional().nullable(),
    createdAt: z.string().trim().max(80).optional().nullable(),
  })
  .optional()
  .nullable();

const createRoomSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().default(""),
  accessMode: z.enum(["public", "private"]).optional().default("public"),
  accessUsernames: z.array(z.string().trim().min(1).max(50)).max(50).optional().default([]),
});

const updateRoomSchema = z.object({
  isPublic: z.boolean(),
});

const updateRoomAccessSchema = z.object({
  usernames: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
});

const createStageSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().default(""),
  liveUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => !value || value.startsWith("/") || /^https?:\/\//i.test(value), "Live URL must be absolute or a WTF path")
    .optional()
    .nullable(),
});

const updateStageSchema = z.object({
  isPublic: z.boolean(),
});

const roomMessageSchema = z.object({
  text: z.string().trim().min(1).max(600),
  quotedPost: quotedPostSnapshotSchema,
  audienceDids: z.array(z.string().trim().regex(/^did:[a-z0-9]+:.+/i)).max(50).default([]),
});

const roomMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const stageBroadcastSchema = z.object({
  text: z.string().trim().min(1).max(600),
  mode: z.enum(["text", "voice", "video", "link"]).default("text"),
  liveUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => value.startsWith("/") || /^https?:\/\//i.test(value), "Live URL must be absolute or a WTF path")
    .optional()
    .nullable(),
  quotedPost: quotedPostSnapshotSchema,
});

const stageBroadcastsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

async function requireLinkedAccount(userId: number) {
  const [account] = await db
    .select()
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
    .limit(1);
  if (!account) {
    const err = new Error("Connect Bluesky through Skywire before publishing WTF LIVE records.");
    (err as any).status = 400;
    (err as any).code = "skywire_account_required";
    throw err;
  }
  return account;
}

function requireAtprotoCapability(
  account: typeof atprotoAccounts.$inferSelect,
  capability: SkywirePermissionCapability,
  upgradeTier: SkywirePermissionTier,
) {
  if (accountHasAtprotoCapability(account, capability)) return;
  const err = new Error(
    `WTF LIVE needs ${skywirePermissionTierLabel(upgradeTier)} Skywire permissions. Open Skywire → Settings and reconnect with ${skywirePermissionTierLabel(upgradeTier)} or higher.`,
  );
  (err as any).status = 403;
  (err as any).code = "atproto_scope_upgrade_required";
  (err as any).action = "upgrade_atproto_permissions";
  (err as any).capability = capability;
  (err as any).requiredTier = upgradeTier;
  throw err;
}

function normalizeRoomMessageRecord(row: {
  repoDid: string;
  repoHandle: string | null;
  uri: string;
  cid: string;
  value: any;
}) {
  const value = row.value || {};
  const quotedPost = value.quotedPost?.uri
    ? {
        uri: String(value.quotedPost.uri || ""),
        cid: value.quotedPost.cid ? String(value.quotedPost.cid) : "",
        sourceUrl: value.quotedPost.sourceUrl || sourceUrlForAtUri(String(value.quotedPost.uri || "")),
        author: {
          did: String(value.quotedPost.authorDid || ""),
          handle: String(value.quotedPost.authorHandle || "unknown"),
          displayName: null,
          avatar: null,
          description: null,
        },
        text: String(value.quotedPost.text || ""),
        createdAt: value.quotedPost.createdAt || null,
        indexedAt: value.createdAt || null,
        embed: { images: [], external: null },
        state: "visible" as const,
      }
    : null;
  return {
    uri: row.uri,
    cid: row.cid,
    roomId: String(value.roomId || ""),
    text: String(value.text || ""),
    createdAt: value.createdAt || null,
    author: {
      did: String(value.authorDid || row.repoDid),
      handle: String(value.authorHandle || row.repoHandle || row.repoDid),
      displayName: value.authorDisplayName || null,
      avatar: value.authorAvatar || null,
      description: null,
    },
    audienceDids: Array.isArray(value.audienceDids) ? value.audienceDids.map(String).slice(0, 50) : [],
    quotedPost,
  };
}

function normalizeStageBroadcastRecord(row: {
  repoDid: string;
  repoHandle: string | null;
  uri: string;
  cid: string;
  value: any;
}) {
  const value = row.value || {};
  const quotedPost = value.quotedPost?.uri
    ? {
        uri: String(value.quotedPost.uri || ""),
        cid: value.quotedPost.cid ? String(value.quotedPost.cid) : "",
        sourceUrl: value.quotedPost.sourceUrl || sourceUrlForAtUri(String(value.quotedPost.uri || "")),
        author: {
          did: String(value.quotedPost.authorDid || ""),
          handle: String(value.quotedPost.authorHandle || "unknown"),
          displayName: null,
          avatar: null,
          description: null,
        },
        text: String(value.quotedPost.text || ""),
        createdAt: value.quotedPost.createdAt || null,
        indexedAt: value.createdAt || null,
        embed: { images: [], external: null },
        state: "visible" as const,
      }
    : null;
  return {
    uri: row.uri,
    cid: row.cid,
    stageId: String(value.stageId || ""),
    text: String(value.text || ""),
    mode: (value.mode || "text") as "text" | "voice" | "video" | "link",
    liveUrl: value.liveUrl || null,
    createdAt: value.createdAt || null,
    broadcaster: {
      did: String(value.authorDid || row.repoDid),
      handle: String(value.authorHandle || row.repoHandle || row.repoDid),
      displayName: value.authorDisplayName || null,
      avatar: value.authorAvatar || null,
      description: null,
    },
    quotedPost,
  };
}

function withWtfLivePresence<T extends { id: string }>(room: T): T & {
  presence: ReturnType<typeof getWtfLiveRoomPresence>;
} {
  return {
    ...room,
    presence: getWtfLiveRoomPresence(room.id),
  };
}

async function readPublicRoomMessages(roomId: string, limit: number) {
  const accounts = await db
    .select({ did: atprotoAccounts.did, handle: atprotoAccounts.handle })
    .from(atprotoAccounts)
    .where(isNull(atprotoAccounts.disconnectedAt))
    .orderBy(desc(atprotoAccounts.lastSyncedAt), desc(atprotoAccounts.updatedAt))
    .limit(50);
  const agent = getPublicAtprotoAgent();
  const reads = await Promise.allSettled(
    accounts.map(async (account) => {
      const records = await agent.com.atproto.repo.listRecords({
        repo: account.did,
        collection: SKYWIRE_ROOM_MESSAGE_COLLECTION,
        limit: 50,
        reverse: true,
      });
      return (records.data.records ?? []).map((record) =>
        normalizeRoomMessageRecord({
          repoDid: account.did,
          repoHandle: account.handle,
          uri: record.uri,
          cid: record.cid,
          value: record.value,
        }),
      );
    }),
  );
  const messages = reads
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((message) => message.roomId === roomId)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, limit);

  return {
    messages,
    upstreamAvailable: reads.some((result) => result.status === "fulfilled"),
  };
}

router.get("/api/wtf-live/status", isAuthenticated, requireWtfLiveRollout, async (req, res) => {
  const user = req.user as any;
  const rollout = skywireRolloutStatusForRole(user.roles ?? user.role ?? null);
  res.json({
    ...rollout,
    skywireSettingsPath: "/skywire?tab=account",
    publishesThrough: "Skywire AT Protocol identity",
    collection: {
      rooms: SKYWIRE_ROOM_MESSAGE_COLLECTION,
      stages: SKYWIRE_STAGE_BROADCAST_COLLECTION,
    },
  });
});

router.get("/api/wtf-live/public/rooms/:roomId", async (req, res) => {
  const roomId = roomIdSchema.safeParse(req.params.roomId);
  if (!roomId.success) return res.status(400).json({ error: "Invalid room" });
  const room = await getPublicWtfLiveRoom(roomId.data);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({
    room: withWtfLivePresence(room),
    joinMode: "guest_room_only",
    roomPath: `/live/r/${encodeURIComponent(room.id)}`,
    capabilities: {
      audio: true,
      camera: true,
      screen: true,
      media: true,
      transport: "webrtc_mesh_via_wtf_live_signaling",
    },
  });
});

router.get("/api/wtf-live/public/rooms/:roomId/messages", async (req, res) => {
  const roomId = roomIdSchema.safeParse(req.params.roomId);
  const parsed = roomMessagesQuerySchema.safeParse(req.query);
  if (!roomId.success || !parsed.success) return res.status(400).json({ error: "Invalid room query" });
  const room = await getPublicWtfLiveRoom(roomId.data);
  if (!room) return res.status(404).json({ error: "Room not found" });
  const { messages, upstreamAvailable } = await readPublicRoomMessages(roomId.data, parsed.data.limit);
  res.json({
    roomId: roomId.data,
    collection: SKYWIRE_ROOM_MESSAGE_COLLECTION,
    messages,
    cursor: null,
    source: "wtf-live.publicConnectedUserRepos",
    upstreamAvailable,
  });
});

router.use("/api/wtf-live", isAuthenticated, requireWtfLiveRollout);

router.get("/api/wtf-live/soundboard", async (req, res) => {
  const user = req.user as any;
  const settings = await getUserWtfLiveSoundboardSettings(user.id);
  res.json(settings);
});

router.put("/api/wtf-live/soundboard", actionLimiter, async (req, res) => {
  const user = req.user as any;
  try {
    const settings = await replaceUserWtfLiveSoundboardSettings(user.id, req.body);
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message || "Could not save soundboard" });
  }
});

router.get("/api/wtf-live/rooms", async (_req, res) => {
  const rooms = await listWtfLiveRooms();
  res.json({
    rooms: rooms.filter((room) => room.kind === "room").map(withWtfLivePresence),
    collection: SKYWIRE_ROOM_MESSAGE_COLLECTION,
    storage: "public_atproto_repo_records",
    skywirePath: "/skywire?tab=account",
  });
});

router.get("/api/wtf-live/rooms/mine", async (req, res) => {
  const user = req.user as any;
  const rooms = await listOwnedWtfLiveRooms(user.id);
  res.json({
    rooms: rooms.map(withWtfLivePresence),
    collection: SKYWIRE_ROOM_MESSAGE_COLLECTION,
    storage: "wtf_live_rooms",
  });
});

router.get("/api/wtf-live/rooms/private", async (req, res) => {
  const user = req.user as any;
  const rooms = await listAccessiblePrivateWtfLiveRooms(user.id);
  res.json({
    rooms: rooms.map(withWtfLivePresence),
    collection: SKYWIRE_ROOM_MESSAGE_COLLECTION,
    storage: "wtf_live_room_access_members",
    accessMode: "private",
  });
});

router.get("/api/wtf-live/rooms/:roomId/join", async (req, res) => {
  const user = req.user as any;
  const roomId = roomIdSchema.safeParse(req.params.roomId);
  if (!roomId.success) return res.status(400).json({ error: "Invalid room" });
  const room = await canAccessWtfLiveRoom(roomId.data, user.id);
  if (!room) return res.status(404).json({ error: "Room not found or not available to this WTF user" });
  res.json({
    room: withWtfLivePresence(room),
    joinMode: room.accessMode === "private" ? "wtf_user_private_room" : "guest_room_only",
    roomPath: `/live/r/${encodeURIComponent(room.id)}`,
    capabilities: {
      audio: true,
      camera: true,
      screen: true,
      media: true,
      transport: "webrtc_mesh_via_wtf_live_signaling",
      privateRoom: room.accessMode === "private",
    },
  });
});

router.post("/api/wtf-live/rooms", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid room details", details: parsed.error.flatten() });
  try {
    const room = await createWtfLiveRoom({
      ownerUserId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      accessMode: parsed.data.accessMode,
    });
    if (parsed.data.accessMode === "private") {
      const access = await replaceOwnedWtfLiveRoomAccessMembers({
        ownerUserId: user.id,
        roomId: room.id,
        usernames: parsed.data.accessUsernames,
      });
      return res.status(201).json({
        room: withWtfLivePresence(access?.room ?? room),
        members: access?.members ?? [],
        missingUsernames: access?.missingUsernames ?? [],
      });
    }
    res.status(201).json({ room: withWtfLivePresence(room), members: [], missingUsernames: [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Could not create room" });
  }
});

router.get("/api/wtf-live/rooms/:roomId/access", async (req, res) => {
  const user = req.user as any;
  const roomId = roomIdSchema.safeParse(req.params.roomId);
  if (!roomId.success) return res.status(400).json({ error: "Invalid room" });
  const members = await listOwnedWtfLiveRoomAccessMembers({
    ownerUserId: user.id,
    roomId: roomId.data,
  });
  if (!members) return res.status(404).json({ error: "Owned private room not found" });
  res.json({ roomId: roomId.data, members });
});

router.patch("/api/wtf-live/rooms/:roomId/access", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const roomId = roomIdSchema.safeParse(req.params.roomId);
  const parsed = updateRoomAccessSchema.safeParse(req.body);
  if (!roomId.success || !parsed.success) {
    return res.status(400).json({ error: "Invalid room access list", details: parsed.success ? undefined : parsed.error.flatten() });
  }
  const updated = await replaceOwnedWtfLiveRoomAccessMembers({
    ownerUserId: user.id,
    roomId: roomId.data,
    usernames: parsed.data.usernames,
  });
  if (!updated) return res.status(404).json({ error: "Owned private room not found" });
  res.json({ room: withWtfLivePresence(updated.room), members: updated.members, missingUsernames: updated.missingUsernames });
});

router.patch("/api/wtf-live/rooms/:roomId", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const roomId = roomIdSchema.safeParse(req.params.roomId);
  const parsed = updateRoomSchema.safeParse(req.body);
  if (!roomId.success || !parsed.success) {
    return res.status(400).json({ error: "Invalid room update", details: parsed.success ? undefined : parsed.error.flatten() });
  }
  try {
    const room = await updateOwnedWtfLiveRoomVisibility({
      ownerUserId: user.id,
      roomId: roomId.data,
      isPublic: parsed.data.isPublic,
    });
    if (!room) return res.status(404).json({ error: "Owned room not found" });
    res.json({ room: withWtfLivePresence(room) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Could not update room" });
  }
});

router.delete("/api/wtf-live/rooms/:roomId", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const roomId = roomIdSchema.safeParse(req.params.roomId);
  if (!roomId.success) return res.status(400).json({ error: "Invalid room" });
  try {
    const archived = await archiveOwnedWtfLiveRoom({
      ownerUserId: user.id,
      roomId: roomId.data,
    });
    if (!archived) return res.status(404).json({ error: "Owned room not found" });
    res.json({ ok: true, roomId: roomId.data });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Could not delete room" });
  }
});

router.get("/api/wtf-live/rooms/:roomId/messages", async (req, res) => {
  const user = req.user as any;
  const roomId = roomIdSchema.safeParse(req.params.roomId);
  const parsed = roomMessagesQuerySchema.safeParse(req.query);
  if (!roomId.success || !parsed.success) return res.status(400).json({ error: "Invalid room query" });
  const room = await canAccessWtfLiveRoom(roomId.data, user.id);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.accessMode === "private") {
    return res.json({
      roomId: roomId.data,
      collection: null,
      messages: [],
      cursor: null,
      source: "wtf-live.privateRealtimeOnly",
      upstreamAvailable: true,
    });
  }

  const { messages, upstreamAvailable } = await readPublicRoomMessages(roomId.data, parsed.data.limit);
  res.json({
    roomId: roomId.data,
    collection: SKYWIRE_ROOM_MESSAGE_COLLECTION,
    messages,
    cursor: null,
    source: "wtf-live.connectedUserRepos",
    upstreamAvailable,
  });
});

router.post("/api/wtf-live/rooms/:roomId/messages", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const roomId = roomIdSchema.safeParse(req.params.roomId);
  const parsed = roomMessageSchema.safeParse(req.body);
  if (!roomId.success || !parsed.success) return res.status(400).json({ error: "Invalid room message" });
  const room = await canAccessWtfLiveRoom(roomId.data, user.id);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.accessMode === "private") {
    return res.status(400).json({ error: "Private WTF LIVE rooms use realtime room chat instead of public Skywire records." });
  }
  try {
    const account = await requireLinkedAccount(user.id);
    requireAtprotoCapability(account, "rooms", "be-heard");
    const agent = await getAtprotoAgentForDid(account.did);
    const quotedPost = parsed.data.quotedPost?.uri
      ? {
          uri: parsed.data.quotedPost.uri,
          cid: parsed.data.quotedPost.cid || null,
          sourceUrl: parsed.data.quotedPost.sourceUrl || sourceUrlForAtUri(parsed.data.quotedPost.uri),
          text: parsed.data.quotedPost.text || "",
          authorHandle: parsed.data.quotedPost.authorHandle || null,
          authorDid: parsed.data.quotedPost.authorDid || null,
          createdAt: parsed.data.quotedPost.createdAt || null,
        }
      : null;
    const record = {
      $type: SKYWIRE_ROOM_MESSAGE_COLLECTION,
      roomId: roomId.data,
      text: parsed.data.text,
      quotedPost,
      audienceDids: parsed.data.audienceDids,
      authorDid: account.did,
      authorHandle: account.handle,
      authorDisplayName: account.displayName || null,
      authorAvatar: account.avatarUrl || null,
      wtfUserId: user.id,
      wtfUsername: user.username ?? null,
      source: "wtfos.wtf-live.rooms",
      createdAt: new Date().toISOString(),
    };
    const result = await agent.com.atproto.repo.createRecord(
      { repo: account.did, collection: SKYWIRE_ROOM_MESSAGE_COLLECTION, record, validate: false },
      { encoding: "application/json" },
    );
    await emitAtprotoSystemEvent({
      eventType: "atproto.room.message_sent",
      userId: user.id,
      did: account.did,
      handle: account.handle,
      uri: result.data.uri,
      cid: result.data.cid,
      text: parsed.data.text,
      rawRefType: "atproto_room_message",
      rawRefId: result.data.uri,
      metadata: {
        roomId: roomId.data,
        collection: SKYWIRE_ROOM_MESSAGE_COLLECTION,
        quotedUri: quotedPost?.uri ?? null,
        audienceDids: parsed.data.audienceDids,
        app: "wtf-live",
      },
    });
    res.status(201).json({ collection: SKYWIRE_ROOM_MESSAGE_COLLECTION, uri: result.data.uri, cid: result.data.cid, record });
  } catch (err) {
    const status = (err as any).status || 500;
    res.status(status).json({
      error: (err as Error).message,
      code: (err as any).code,
      action: (err as any).action,
      requiredTier: (err as any).requiredTier,
      skywirePath: "/skywire?tab=account",
    });
  }
});

router.get("/api/wtf-live/stages", async (_req, res) => {
  const stages = await listWtfLiveStages();
  res.json({
    stages,
    collection: SKYWIRE_STAGE_BROADCAST_COLLECTION,
    storage: "public_atproto_repo_records",
    mode: "one_way_broadcast",
    skywirePath: "/skywire?tab=account",
  });
});

router.get("/api/wtf-live/stages/mine", async (req, res) => {
  const user = req.user as any;
  const stages = await listOwnedWtfLiveStages(user.id);
  res.json({
    stages,
    collection: SKYWIRE_STAGE_BROADCAST_COLLECTION,
    storage: "wtf_live_stages",
  });
});

router.post("/api/wtf-live/stages", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = createStageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid stage details", details: parsed.error.flatten() });
  try {
    const stage = await createWtfLiveStage({
      ownerUserId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      liveUrl: parsed.data.liveUrl,
    });
    res.status(201).json({ stage });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Could not create stage" });
  }
});

router.patch("/api/wtf-live/stages/:stageId", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const stageId = stageIdSchema.safeParse(req.params.stageId);
  const parsed = updateStageSchema.safeParse(req.body);
  if (!stageId.success || !parsed.success) {
    return res.status(400).json({ error: "Invalid stage update", details: parsed.success ? undefined : parsed.error.flatten() });
  }
  try {
    const stage = await updateOwnedWtfLiveStageVisibility({
      ownerUserId: user.id,
      stageId: stageId.data,
      isPublic: parsed.data.isPublic,
    });
    if (!stage) return res.status(404).json({ error: "Owned stage not found" });
    res.json({ stage });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Could not update stage" });
  }
});

router.delete("/api/wtf-live/stages/:stageId", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const stageId = stageIdSchema.safeParse(req.params.stageId);
  if (!stageId.success) return res.status(400).json({ error: "Invalid stage" });
  try {
    const archived = await archiveOwnedWtfLiveStage({
      ownerUserId: user.id,
      stageId: stageId.data,
    });
    if (!archived) return res.status(404).json({ error: "Owned stage not found" });
    res.json({ ok: true, stageId: stageId.data });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Could not delete stage" });
  }
});

router.get("/api/wtf-live/stages/:stageId/broadcasts", async (req, res) => {
  const stageId = stageIdSchema.safeParse(req.params.stageId);
  const parsed = stageBroadcastsQuerySchema.safeParse(req.query);
  if (!stageId.success || !parsed.success) return res.status(400).json({ error: "Invalid stage query" });
  if (!(await wtfLiveStageExists(stageId.data))) return res.status(404).json({ error: "Stage not found" });

  const accounts = await db
    .select({ did: atprotoAccounts.did, handle: atprotoAccounts.handle })
    .from(atprotoAccounts)
    .where(isNull(atprotoAccounts.disconnectedAt))
    .orderBy(desc(atprotoAccounts.lastSyncedAt), desc(atprotoAccounts.updatedAt))
    .limit(50);
  const agent = getPublicAtprotoAgent();
  const reads = await Promise.allSettled(
    accounts.map(async (account) => {
      const records = await agent.com.atproto.repo.listRecords({
        repo: account.did,
        collection: SKYWIRE_STAGE_BROADCAST_COLLECTION,
        limit: 50,
        reverse: true,
      });
      return (records.data.records ?? []).map((record) =>
        normalizeStageBroadcastRecord({
          repoDid: account.did,
          repoHandle: account.handle,
          uri: record.uri,
          cid: record.cid,
          value: record.value,
        }),
      );
    }),
  );
  const broadcasts = reads
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((broadcast) => broadcast.stageId === stageId.data)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, parsed.data.limit);
  res.json({
    stageId: stageId.data,
    collection: SKYWIRE_STAGE_BROADCAST_COLLECTION,
    broadcasts,
    cursor: null,
    source: "wtf-live.connectedUserRepos",
    upstreamAvailable: reads.some((result) => result.status === "fulfilled"),
  });
});

router.post("/api/wtf-live/stages/:stageId/broadcasts", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const stageId = stageIdSchema.safeParse(req.params.stageId);
  const parsed = stageBroadcastSchema.safeParse(req.body);
  if (!stageId.success || !parsed.success) return res.status(400).json({ error: "Invalid stage broadcast" });
  if (!(await wtfLiveStageExists(stageId.data))) return res.status(404).json({ error: "Stage not found" });
  try {
    const account = await requireLinkedAccount(user.id);
    requireAtprotoCapability(account, "stages", "be-heard");
    const agent = await getAtprotoAgentForDid(account.did);
    const quotedPost = parsed.data.quotedPost?.uri
      ? {
          uri: parsed.data.quotedPost.uri,
          cid: parsed.data.quotedPost.cid || null,
          sourceUrl: parsed.data.quotedPost.sourceUrl || sourceUrlForAtUri(parsed.data.quotedPost.uri),
          text: parsed.data.quotedPost.text || "",
          authorHandle: parsed.data.quotedPost.authorHandle || null,
          authorDid: parsed.data.quotedPost.authorDid || null,
          createdAt: parsed.data.quotedPost.createdAt || null,
        }
      : null;
    const record = {
      $type: SKYWIRE_STAGE_BROADCAST_COLLECTION,
      stageId: stageId.data,
      text: parsed.data.text,
      mode: parsed.data.mode,
      liveUrl: parsed.data.liveUrl || null,
      quotedPost,
      authorDid: account.did,
      authorHandle: account.handle,
      authorDisplayName: account.displayName || null,
      authorAvatar: account.avatarUrl || null,
      wtfUserId: user.id,
      wtfUsername: user.username ?? null,
      source: "wtfos.wtf-live.stages",
      createdAt: new Date().toISOString(),
    };
    const result = await agent.com.atproto.repo.createRecord(
      { repo: account.did, collection: SKYWIRE_STAGE_BROADCAST_COLLECTION, record, validate: false },
      { encoding: "application/json" },
    );
    await emitAtprotoSystemEvent({
      eventType: "atproto.stage.broadcast_sent",
      userId: user.id,
      did: account.did,
      handle: account.handle,
      uri: result.data.uri,
      cid: result.data.cid,
      text: parsed.data.text,
      rawRefType: "atproto_stage_broadcast",
      rawRefId: result.data.uri,
      metadata: {
        stageId: stageId.data,
        collection: SKYWIRE_STAGE_BROADCAST_COLLECTION,
        mode: parsed.data.mode,
        liveUrl: parsed.data.liveUrl || null,
        quotedUri: quotedPost?.uri ?? null,
        app: "wtf-live",
      },
    });
    res.status(201).json({ collection: SKYWIRE_STAGE_BROADCAST_COLLECTION, uri: result.data.uri, cid: result.data.cid, record });
  } catch (err) {
    const status = (err as any).status || 500;
    res.status(status).json({
      error: (err as Error).message,
      code: (err as any).code,
      action: (err as any).action,
      requiredTier: (err as any).requiredTier,
      skywirePath: "/skywire?tab=account",
    });
  }
});

export default router;
