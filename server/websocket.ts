import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { pool, db } from "./db";
import { boardThreads, studioFiles } from "@shared/schema";
import type { UserRole } from "@shared/types";
import { normalizeRole } from "./lib/roles";
import { hasPermission } from "./lib/permissions";
import {
  getChannelPerms,
  canViewChannel,
  canPostInChannel,
  checkChannelSlowMode,
} from "./lib/board-channel-permissions";
import { resolveStudioAccess } from "./lib/studio/access";
import { getSessionSecret } from "./auth/session-secret";
import { canAccessWtfLiveRoom, canAccessWtfLiveStage } from "./features/wtf-live/registry";
import { GREEN_ROOM_ROOM_BY_ID } from "./features/green-room/world";

const MAX_CHAT_CONTENT_LENGTH = 10_000;
const MAX_WTF_LIVE_CHAT_TEXT_LENGTH = 1_200;
const MAX_WTF_LIVE_CHAT_ATTACHMENTS = 4;
const MAX_WTF_LIVE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_WTF_LIVE_ATTACHMENT_DATA_URL_LENGTH = Math.ceil(MAX_WTF_LIVE_ATTACHMENT_BYTES * 1.4);
const MAX_WTF_LIVE_AVATAR_BYTES = 512 * 1024;
const MAX_WTF_LIVE_AVATAR_DATA_URL_LENGTH = Math.ceil(MAX_WTF_LIVE_AVATAR_BYTES * 1.4);
const MAX_WTF_LIVE_SIGNAL_LENGTH = 256 * 1024;
const MAX_WTF_LIVE_SOUNDBOARD_BYTES = 1_200_000;
const MAX_WTF_LIVE_SOUNDBOARD_DATA_URL_LENGTH = Math.ceil(MAX_WTF_LIVE_SOUNDBOARD_BYTES * 1.4);
const WTF_LIVE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "video/mp4"]);
const WTF_LIVE_SOUNDBOARD_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"]);
const WTF_LIVE_CHAT_FONTS = new Set(["wtfos-soft-system", "classic-95", "terminal", "serif-press"]);
const WTF_LIVE_LEGACY_CHAT_FONT_MAP: Record<string, string> = {
  system: "wtfos-soft-system",
  "mek-mono": "terminal",
  "grout-display": "classic-95",
  mono: "terminal",
  serif: "serif-press",
  pixel: "classic-95",
};
const WTF_LIVE_CHAT_COLORS = new Set(["ink", "blue", "green", "red", "purple", "amber"]);
const WTF_LIVE_ROOM_REACTION_LABELS: Record<string, string> = {
  "👏": "Applause",
  "🔥": "Fire",
  "😂": "Laugh",
  "😮": "Wow",
  "❤️": "Love",
  "👀": "Watching",
};
const WTF_LIVE_ROOM_REACTION_EMOJIS = new Set(Object.keys(WTF_LIVE_ROOM_REACTION_LABELS));

type WtfLiveChatStyle = {
  font: string;
  color: string;
  size: number;
  bold: boolean;
  italic: boolean;
};

const DEFAULT_WTF_LIVE_CHAT_STYLE: WtfLiveChatStyle = {
  font: "wtfos-soft-system",
  color: "ink",
  size: 12,
  bold: false,
  italic: false,
};

type WtfLiveMediaState = {
  mic: boolean;
  audioOpen: boolean;
  camera: boolean;
  screen: boolean;
  screenAudio: boolean;
  mediaVideo: boolean;
  mediaAudio: boolean;
  mediaName: string | null;
  soundboard: boolean;
  activeVideo: "camera" | "screen" | null;
  cameraTrackId: string | null;
  screenTrackId: string | null;
  mediaVideoTrackId: string | null;
  mediaAudioTrackId: string | null;
  avatarUrl: string | null;
};

type WtfLivePeerPayload = {
  peerId: string | undefined;
  guestName: string;
  userId: number | null;
  username: string | null;
  isWtfUser: boolean;
  mediaState: WtfLiveMediaState;
};

export type WtfLiveRoomPresence = {
  active: boolean;
  participantCount: number;
  audioOpenCount: number;
  videoShareCount: number;
  cameraShareCount: number;
  screenShareCount: number;
};

interface WsClient {
  ws: WebSocket;
  userId: number;
  channelId?: number;
  studioProjectId?: number;
  studioFileId?: number;
  username: string;
  role: UserRole;
  publicSocket?: "wtf-live" | "dedrooms";
  wtfLiveRoomId?: string;
  wtfLivePeerId?: string;
  wtfLiveGuestName?: string;
  wtfLiveMediaState?: WtfLiveMediaState;
  wtfLiveCanShareStage?: boolean;
  greenRoomLocationId?: string;
}

const clients = new Set<WsClient>();
const SESSION_COOKIE_NAME = "connect.sid";

export function getWtfLiveRoomPresence(roomId: string): WtfLiveRoomPresence {
  const peers = [...clients].filter(
    (client) =>
      client.publicSocket === "wtf-live" &&
      client.wtfLiveRoomId === roomId &&
      client.wtfLivePeerId &&
      client.ws.readyState === WebSocket.OPEN,
  );
  const audioOpenCount = peers.filter((client) => client.wtfLiveMediaState?.audioOpen).length;
  const cameraShareCount = peers.filter((client) => client.wtfLiveMediaState?.camera).length;
  const screenShareCount = peers.filter((client) => client.wtfLiveMediaState?.screen).length;
  const mediaVideoShareCount = peers.filter((client) => client.wtfLiveMediaState?.mediaVideo).length;
  const videoShareCount = cameraShareCount + screenShareCount + mediaVideoShareCount;
  return {
    active: peers.length > 0,
    participantCount: peers.length,
    audioOpenCount,
    videoShareCount,
    cameraShareCount,
    screenShareCount,
  };
}

export type WebSocketStats = {
  total: number;
  wtfLive: number;
  greenRoom: number;
  board: number;
  studio: number;
  authenticated: number;
  activeWtfLiveRooms: number;
  activeGreenRoomLocations: number;
};

/**
 * Live counts of open WebSocket connections by surface. Used by the runtime
 * metrics endpoint so load tests can see how realtime concurrency tracks with
 * event-loop lag and broadcast fan-out cost.
 */
export function getWebSocketStats(): WebSocketStats {
  let total = 0;
  let wtfLive = 0;
  let greenRoom = 0;
  let board = 0;
  let studio = 0;
  let authenticated = 0;
  const rooms = new Set<string>();
  const greenRoomLocations = new Set<string>();
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    total += 1;
    if (client.userId > 0) authenticated += 1;
    if (client.publicSocket === "wtf-live") {
      wtfLive += 1;
      if (client.wtfLiveRoomId) rooms.add(client.wtfLiveRoomId);
    } else if (client.publicSocket === "dedrooms") {
      greenRoom += 1;
      if (client.greenRoomLocationId) greenRoomLocations.add(client.greenRoomLocationId);
    } else if (client.studioProjectId || client.studioFileId) {
      studio += 1;
    } else if (client.channelId) {
      board += 1;
    }
  }
  return {
    total,
    wtfLive,
    greenRoom,
    board,
    studio,
    authenticated,
    activeWtfLiveRooms: rooms.size,
    activeGreenRoomLocations: greenRoomLocations.size,
  };
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const parsed = new Map<string, string>();
  if (!header) return parsed;

  const cookies = header.split(";");
  for (const part of cookies) {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey.trim();
    if (!key) continue;
    parsed.set(key, rawValue.join("=").trim());
  }
  return parsed;
}

function base64Signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
}

function unsignSessionValue(signedValue: string, secret: string): string | null {
  const decoded = decodeURIComponent(signedValue || "");
  if (!decoded.startsWith("s:")) return null;

  const remainder = decoded.slice(2);
  const dot = remainder.lastIndexOf(".");
  if (dot <= 0) return null;

  const value = remainder.slice(0, dot);
  const providedSig = remainder.slice(dot + 1);
  const expectedSig = base64Signature(value, secret);

  const providedBuffer = Buffer.from(providedSig);
  const expectedBuffer = Buffer.from(expectedSig);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  return value;
}

async function resolveSessionUser(req: IncomingMessage): Promise<{
  userId: number;
  username: string;
  role: UserRole;
} | null> {
  const cookieHeader = typeof req.headers.cookie === "string" ? req.headers.cookie : undefined;
  const cookies = parseCookieHeader(cookieHeader);
  const signedSid = cookies.get(SESSION_COOKIE_NAME);
  if (!signedSid) return null;

  const sid = unsignSessionValue(signedSid, getSessionSecret());
  if (!sid) return null;

  const sessionResult = await pool.query(
    "SELECT sess, expire FROM session WHERE sid = $1 LIMIT 1",
    [sid]
  );
  if (sessionResult.rows.length === 0) return null;

  const row = sessionResult.rows[0] as {
    sess: unknown;
    expire: Date | string;
  };

  const expiresAt = new Date(row.expire);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const sessionObject =
    typeof row.sess === "string"
      ? (() => {
          try {
            return JSON.parse(row.sess) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : ((row.sess as Record<string, unknown>) ?? null);

  const passport = sessionObject?.passport as { user?: unknown } | undefined;
  const userId = Number(passport?.user);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  const userResult = await pool.query(
    "SELECT id, username, role FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  if (userResult.rows.length === 0) return null;

  const user = userResult.rows[0] as { id: number; username: string; role: string };
  return {
    userId: Number(user.id),
    username: String(user.username || "user"),
    role: normalizeRole(user.role),
  };
}

type BoardChannel = typeof boardThreads.$inferSelect;

async function loadChannelViewAccess(
  channelId: number,
  role: UserRole,
  userId: number
): Promise<{ channel: BoardChannel; perms: Awaited<ReturnType<typeof getChannelPerms>> } | null> {
  const [channel] = await db
    .select()
    .from(boardThreads)
    .where(eq(boardThreads.id, channelId))
    .limit(1);
  if (!channel) return null;
  const perms = await getChannelPerms(channelId);
  if (!canViewChannel(channel, perms, role, userId)) return null;
  return { channel, perms };
}

/**
 * Heartbeat configuration.
 *
 * Idle TCP connections behind Caddy / Cloudflare / NATs get torn
 * down without a clean WebSocket close frame, leaving zombie
 * `WebSocket` instances on the server that never broadcast (and
 * never `close`).  We send a `ping` every interval and require a
 * `pong` before the next tick — sockets that stop responding are
 * `terminate()`'d, which fires the `close` handler and prunes the
 * client from the broadcast set.
 *
 * 30 s is well under the typical 60-90s NAT idle timeout and well
 * under the 100 s Cloudflare WebSocket inactivity limit.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

interface HeartbeatSocket extends WebSocket {
  isAlive?: boolean;
}

function pathnameForRequest(req: IncomingMessage): string {
  try {
    return new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return "";
  }
}

function installHeartbeat(ws: WebSocket) {
  const heartbeatWs = ws as HeartbeatSocket;
  heartbeatWs.isAlive = true;
  ws.on("pong", () => {
    heartbeatWs.isAlive = true;
  });
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function normalizeGreenRoomLocationId(value: unknown): string | null {
  const locationId = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9_:-]{0,119}$/i.test(locationId)) return null;
  if (!GREEN_ROOM_ROOM_BY_ID.has(locationId)) return null;
  return locationId;
}

function snapshotGreenRoomPresence(locationId: string, exclude?: WsClient) {
  return [...clients]
    .filter((client) =>
      client.publicSocket === "dedrooms" &&
      client.greenRoomLocationId === locationId &&
      client !== exclude &&
      client.ws.readyState === WebSocket.OPEN
    )
    .map((client) => ({
      userId: client.userId,
      username: client.username,
      role: client.role,
    }));
}

function normalizeWtfLiveRoomId(value: unknown): string | null {
  const roomId = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(roomId)) return null;
  return roomId;
}

function normalizeWtfLiveGuestName(value: unknown): string {
  return String(value || "guest")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48) || "guest";
}

function normalizeWtfLiveAvatarUrl(value: unknown): string | null {
  const avatarUrl = typeof value === "string" ? value : "";
  if (!avatarUrl) return null;
  if (!/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(avatarUrl)) return null;
  if (avatarUrl.length > MAX_WTF_LIVE_AVATAR_DATA_URL_LENGTH) return null;
  return avatarUrl;
}

function emptyWtfLiveMediaState(): WtfLiveMediaState {
  return {
    mic: false,
    audioOpen: false,
    camera: false,
    screen: false,
    screenAudio: false,
    mediaVideo: false,
    mediaAudio: false,
    mediaName: null,
    soundboard: false,
    activeVideo: null,
    cameraTrackId: null,
    screenTrackId: null,
    mediaVideoTrackId: null,
    mediaAudioTrackId: null,
    avatarUrl: null,
  };
}

function normalizeWtfLiveTrackId(value: unknown): string | null {
  const trackId = String(value || "").trim();
  return trackId ? trackId.slice(0, 160) : null;
}

function normalizeWtfLiveMediaName(value: unknown): string | null {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  return name || null;
}

function normalizeWtfLiveMediaState(value: unknown): WtfLiveMediaState {
  const state = typeof value === "object" && value ? value as Record<string, unknown> : {};
  const camera = Boolean(state.camera);
  const screen = Boolean(state.screen);
  const requestedActiveVideo = state.activeVideo === "camera" || state.activeVideo === "screen" ? state.activeVideo : null;
  return {
    mic: Boolean(state.mic),
    audioOpen: Boolean(state.audioOpen ?? state.mic),
    camera,
    screen,
    screenAudio: Boolean(state.screenAudio),
    mediaVideo: Boolean(state.mediaVideo),
    mediaAudio: Boolean(state.mediaAudio),
    mediaName: normalizeWtfLiveMediaName(state.mediaName),
    soundboard: Boolean(state.soundboard),
    activeVideo: requestedActiveVideo === "camera" && camera ? "camera" : requestedActiveVideo === "screen" && screen ? "screen" : null,
    cameraTrackId: normalizeWtfLiveTrackId(state.cameraTrackId),
    screenTrackId: normalizeWtfLiveTrackId(state.screenTrackId),
    mediaVideoTrackId: normalizeWtfLiveTrackId(state.mediaVideoTrackId),
    mediaAudioTrackId: normalizeWtfLiveTrackId(state.mediaAudioTrackId),
    avatarUrl: normalizeWtfLiveAvatarUrl(state.avatarUrl),
  };
}

function restrictWtfLiveMediaStateForClient(client: WsClient, mediaState: WtfLiveMediaState): WtfLiveMediaState {
  if (client.wtfLiveCanShareStage !== false) return mediaState;
  return {
    ...mediaState,
    mic: false,
    audioOpen: false,
    camera: false,
    screen: false,
    screenAudio: false,
    mediaVideo: false,
    mediaAudio: false,
    mediaName: null,
    soundboard: false,
    activeVideo: null,
    cameraTrackId: null,
    screenTrackId: null,
    mediaVideoTrackId: null,
    mediaAudioTrackId: null,
  };
}

function normalizeWtfLiveChatAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_WTF_LIVE_CHAT_ATTACHMENTS).flatMap((attachment) => {
    const item = typeof attachment === "object" && attachment ? attachment as Record<string, unknown> : null;
    if (!item) return [];
    const mimeType = String(item.mimeType || "");
    const dataUrl = String(item.dataUrl || "");
    if (!WTF_LIVE_MEDIA_TYPES.has(mimeType)) return [];
    if (!dataUrl.startsWith(`data:${mimeType};base64,`)) return [];
    if (dataUrl.length > MAX_WTF_LIVE_ATTACHMENT_DATA_URL_LENGTH) return [];
    const sizeBytes = Number(item.sizeBytes);
    if (Number.isFinite(sizeBytes) && sizeBytes > MAX_WTF_LIVE_ATTACHMENT_BYTES) return [];
    return [{
      id: String(item.id || `att_${randomUUID()}`).slice(0, 80),
      name: String(item.name || "media").replace(/[^\w.\- ()]/g, "").slice(0, 120) || "media",
      mimeType,
      sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? Math.min(sizeBytes, MAX_WTF_LIVE_ATTACHMENT_BYTES) : 0,
      kind: mimeType.startsWith("video/") ? "video" : "image",
      dataUrl,
    }];
  });
}

function normalizeWtfLiveChatStyle(value: unknown): WtfLiveChatStyle | undefined {
  if (typeof value !== "object" || !value) return undefined;
  const style = value as Record<string, unknown>;
  const rawSize = Number(style.size);
  const size = Number.isFinite(rawSize)
    ? Math.min(14, Math.max(8, Math.round(rawSize)))
    : DEFAULT_WTF_LIVE_CHAT_STYLE.size;
  const font = String(style.font || "");
  const color = String(style.color || "");
  return {
    font: WTF_LIVE_CHAT_FONTS.has(font)
      ? font
      : WTF_LIVE_LEGACY_CHAT_FONT_MAP[font] ?? DEFAULT_WTF_LIVE_CHAT_STYLE.font,
    color: WTF_LIVE_CHAT_COLORS.has(color) ? color : DEFAULT_WTF_LIVE_CHAT_STYLE.color,
    size,
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
  };
}

function normalizeWtfLiveRoomReactionEmoji(value: unknown): string | null {
  const emoji = String(value || "");
  return WTF_LIVE_ROOM_REACTION_EMOJIS.has(emoji) ? emoji : null;
}

function normalizeWtfLiveSoundboardClip(value: unknown) {
  const clip = typeof value === "object" && value ? value as Record<string, unknown> : null;
  if (!clip) return null;
  const mimeType = String(clip.mimeType || "");
  const dataUrl = String(clip.dataUrl || "");
  if (!WTF_LIVE_SOUNDBOARD_TYPES.has(mimeType)) return null;
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) return null;
  if (dataUrl.length > MAX_WTF_LIVE_SOUNDBOARD_DATA_URL_LENGTH) return null;
  const sizeBytes = Number(clip.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_WTF_LIVE_SOUNDBOARD_BYTES) return null;
  return {
    id: String(clip.id || `clip_${randomUUID()}`).replace(/[^a-z0-9_-]/gi, "").slice(0, 80) || `clip_${randomUUID()}`,
    label: String(clip.label || "Sound").trim().replace(/\s+/g, " ").slice(0, 36) || "Sound",
    category: String(clip.category || "General").trim().replace(/\s+/g, " ").slice(0, 32) || "General",
    shortcut: String(clip.shortcut || "").trim().slice(0, 32),
    mimeType,
    dataUrl,
    sizeBytes: Math.round(sizeBytes),
    volume: Math.min(100, Math.max(0, Math.round(Number.isFinite(Number(clip.volume)) ? Number(clip.volume) : 90))),
    cooldownMs: Math.min(30_000, Math.max(0, Math.round(Number.isFinite(Number(clip.cooldownMs)) ? Number(clip.cooldownMs) : 1500))),
  };
}

function wtfLivePeerDisplayName(client: WsClient): string {
  return client.wtfLiveGuestName || (client.userId > 0 ? client.username : "guest") || "guest";
}

function wtfLivePeerPayload(client: WsClient): WtfLivePeerPayload {
  const isWtfUser = client.userId > 0;
  return {
    peerId: client.wtfLivePeerId,
    guestName: wtfLivePeerDisplayName(client),
    userId: isWtfUser ? client.userId : null,
    username: isWtfUser ? client.username : null,
    isWtfUser,
    mediaState: client.wtfLiveMediaState || emptyWtfLiveMediaState(),
  };
}

function snapshotWtfLivePeers(roomId: string, exclude?: WsClient) {
  return [...clients]
    .filter((client) => client.wtfLiveRoomId === roomId && client !== exclude && client.wtfLivePeerId)
    .map((client) => wtfLivePeerPayload(client));
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const pathname = pathnameForRequest(req);
    if (pathname !== "/ws" && pathname !== "/ws/wtf-live" && pathname !== "/ws/dedrooms") return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const pathname = pathnameForRequest(req);
    if (pathname === "/ws/wtf-live") {
      const auth = await resolveSessionUser(req).catch(() => null);
      const client: WsClient = {
        ws,
        userId: auth?.userId ?? 0,
        username: auth?.username ?? "guest",
        role: auth?.role ?? "public",
        publicSocket: "wtf-live",
        wtfLivePeerId: `peer_${randomUUID().replace(/-/g, "").slice(0, 18)}`,
        wtfLiveGuestName: auth?.username ?? "guest",
        wtfLiveMediaState: emptyWtfLiveMediaState(),
      };
      clients.add(client);
      installHeartbeat(ws);

      ws.on("message", (raw) => {
        void (async () => {
          try {
            const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
            await handleMessage(client, msg);
          } catch {
            sendJson(ws, { type: "error", message: "Invalid message" });
          }
        })();
      });
      ws.on("close", () => cleanupClient(client));
      sendJson(ws, { type: "wtf_live_connected", peerId: client.wtfLivePeerId });
      return;
    }

    if (pathname === "/ws/dedrooms") {
      const auth = await resolveSessionUser(req).catch(() => null);
      if (!auth) {
        sendJson(ws, { type: "error", message: "Unauthorized DedRooms websocket session" });
        ws.close(1008, "unauthorized");
        return;
      }
      const client: WsClient = {
        ws,
        userId: auth.userId,
        username: auth.username,
        role: auth.role,
        publicSocket: "dedrooms",
      };
      clients.add(client);
      installHeartbeat(ws);

      ws.on("message", (raw) => {
        void (async () => {
          try {
            const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
            await handleMessage(client, msg);
          } catch {
            sendJson(ws, { type: "error", message: "Invalid message" });
          }
        })();
      });
      ws.on("close", () => cleanupClient(client));
      sendJson(ws, { type: "ded_rooms_connected", userId: client.userId, username: client.username });
      return;
    }

    const auth = await resolveSessionUser(req);
    if (!auth) {
      ws.send(JSON.stringify({ type: "error", message: "Unauthorized websocket session" }));
      ws.close(1008, "unauthorized");
      return;
    }

    installHeartbeat(ws);

    const client: WsClient = {
      ws,
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
    };
    clients.add(client);

    ws.on("message", (raw) => {
      void (async () => {
        try {
          const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
          await handleMessage(client, msg);
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
        }
      })();
    });

    ws.on("close", () => cleanupClient(client));

    ws.send(
      JSON.stringify({
        type: "connected",
        userId: client.userId,
        username: client.username,
      })
    );
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((rawWs) => {
      const ws = rawWs as HeartbeatSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });
}

async function handleMessage(client: WsClient, msg: Record<string, unknown>) {
  switch (msg.type) {
    case "ded_rooms_join": {
      if (client.publicSocket !== "dedrooms") {
        sendJson(client.ws, { type: "error", message: "Use the DedRooms socket." });
        return;
      }
      const locationId = normalizeGreenRoomLocationId(msg.locationId);
      if (!locationId) {
        sendJson(client.ws, { type: "error", message: "Invalid DedRooms location" });
        return;
      }
      if (client.greenRoomLocationId && client.greenRoomLocationId !== locationId) {
        leaveGreenRoomLocation(client);
      }
      client.greenRoomLocationId = locationId;
      sendJson(client.ws, {
        type: "ded_rooms_presence_snapshot",
        locationId,
        peers: snapshotGreenRoomPresence(locationId, client),
      });
      broadcastToGreenRoomLocation(
        locationId,
        {
          type: "ded_rooms_peer_joined",
          locationId,
          peer: {
            userId: client.userId,
            username: client.username,
            role: client.role,
          },
        },
        client,
      );
      break;
    }

    case "ded_rooms_leave": {
      leaveGreenRoomLocation(client);
      break;
    }

    case "wtf_live_join_room": {
      if (client.publicSocket !== "wtf-live") {
        sendJson(client.ws, { type: "error", message: "Use the public WTF LIVE room socket." });
        return;
      }
      const roomId = normalizeWtfLiveRoomId(msg.roomId);
      if (!roomId) {
        sendJson(client.ws, { type: "error", message: "Invalid WTF LIVE room id" });
        return;
      }
      const actorUserId = client.userId > 0 ? client.userId : null;
      const room = await canAccessWtfLiveRoom(roomId, actorUserId);
      const stageAccess = room ? null : await canAccessWtfLiveStage(roomId, actorUserId);
      if (!room && !stageAccess) {
        sendJson(client.ws, { type: "error", message: "WTF LIVE room is not open to this session" });
        return;
      }
      if (client.wtfLiveRoomId && client.wtfLiveRoomId !== roomId) {
        leaveWtfLiveRoom(client);
      }
      const guestName = client.userId > 0
        ? client.username
        : normalizeWtfLiveGuestName(msg.guestName);
      client.wtfLiveGuestName = guestName;
      client.wtfLiveRoomId = roomId;
      client.wtfLiveCanShareStage = stageAccess ? stageAccess.role !== "audience" : true;
      client.wtfLiveMediaState = restrictWtfLiveMediaStateForClient(client, normalizeWtfLiveMediaState(msg.mediaState));

      sendJson(client.ws, {
        type: "wtf_live_room_snapshot",
        roomId,
        peerId: client.wtfLivePeerId,
        peers: snapshotWtfLivePeers(roomId, client),
      });
      broadcastToWtfLiveRoom(
        roomId,
        {
          type: "wtf_live_peer_joined",
          roomId,
          peer: wtfLivePeerPayload(client),
        },
        client
      );
      break;
    }

    case "wtf_live_leave_room": {
      leaveWtfLiveRoom(client);
      break;
    }

    case "wtf_live_media_state": {
      if (!client.wtfLiveRoomId || !client.wtfLivePeerId) return;
      client.wtfLiveMediaState = restrictWtfLiveMediaStateForClient(client, normalizeWtfLiveMediaState(msg.mediaState));
      broadcastToWtfLiveRoom(client.wtfLiveRoomId, {
        type: "wtf_live_media_state",
        roomId: client.wtfLiveRoomId,
        peerId: client.wtfLivePeerId,
        guestName: wtfLivePeerDisplayName(client),
        userId: client.userId > 0 ? client.userId : null,
        username: client.userId > 0 ? client.username : null,
        isWtfUser: client.userId > 0,
        mediaState: client.wtfLiveMediaState,
      });
      break;
    }

    case "wtf_live_signal": {
      if (!client.wtfLiveRoomId || !client.wtfLivePeerId) return;
      const toPeerId = String(msg.toPeerId || "").trim();
      const signal = typeof msg.signal === "object" && msg.signal ? msg.signal as Record<string, unknown> : null;
      if (!/^peer_[a-f0-9]{18}$/i.test(toPeerId) || !signal) return;
      const encoded = JSON.stringify(signal);
      if (encoded.length > MAX_WTF_LIVE_SIGNAL_LENGTH) return;
      const target = [...clients].find((candidate) =>
        candidate.wtfLiveRoomId === client.wtfLiveRoomId &&
        candidate.wtfLivePeerId === toPeerId &&
        candidate.ws.readyState === WebSocket.OPEN
      );
      if (!target) return;
      sendJson(target.ws, {
        type: "wtf_live_signal",
        roomId: client.wtfLiveRoomId,
        fromPeerId: client.wtfLivePeerId,
        signal,
      });
      break;
    }

    case "wtf_live_chat_message": {
      if (!client.wtfLiveRoomId || !client.wtfLivePeerId) return;
      const text = String(msg.text || "").trim().slice(0, MAX_WTF_LIVE_CHAT_TEXT_LENGTH);
      const attachments = normalizeWtfLiveChatAttachments(msg.attachments);
      const style = normalizeWtfLiveChatStyle(msg.style);
      if (!text && attachments.length === 0) {
        sendJson(client.ws, { type: "error", message: "Message text or media is required" });
        return;
      }
      broadcastToWtfLiveRoom(client.wtfLiveRoomId, {
        type: "wtf_live_chat_message",
        roomId: client.wtfLiveRoomId,
        message: {
          id: `live_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
          peerId: client.wtfLivePeerId,
          guestName: wtfLivePeerDisplayName(client),
          text,
          ...(style ? { style } : {}),
          attachments,
          createdAt: new Date().toISOString(),
        },
      });
      break;
    }

    case "wtf_live_soundboard_clip": {
      if (!client.wtfLiveRoomId || !client.wtfLivePeerId) return;
      const room = await canAccessWtfLiveRoom(client.wtfLiveRoomId, client.userId > 0 ? client.userId : null);
      if (!room || !room.ownerUserId || room.ownerUserId !== client.userId) {
        sendJson(client.ws, { type: "error", message: "Only the room owner can trigger soundboard audio" });
        return;
      }
      const clip = normalizeWtfLiveSoundboardClip(msg.clip ?? msg.soundboardClip);
      if (!clip) {
        sendJson(client.ws, { type: "error", message: "Unsupported soundboard clip" });
        return;
      }
      broadcastToWtfLiveRoom(
        client.wtfLiveRoomId,
        {
          type: "wtf_live_soundboard_clip",
          roomId: client.wtfLiveRoomId,
          triggeredByPeerId: client.wtfLivePeerId,
          triggeredByName: wtfLivePeerDisplayName(client),
          soundboardClip: clip,
          delivery: "webrtc",
          createdAt: new Date().toISOString(),
        },
        client,
      );
      break;
    }

    case "wtf_live_room_reaction": {
      if (!client.wtfLiveRoomId || !client.wtfLivePeerId) return;
      const emoji = normalizeWtfLiveRoomReactionEmoji(msg.emoji);
      if (!emoji) {
        sendJson(client.ws, { type: "error", message: "Unsupported WTF LIVE room reaction" });
        return;
      }
      broadcastToWtfLiveRoom(client.wtfLiveRoomId, {
        type: "wtf_live_room_reaction",
        roomId: client.wtfLiveRoomId,
        reaction: {
          id: `reaction_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
          peerId: client.wtfLivePeerId,
          guestName: wtfLivePeerDisplayName(client),
          emoji,
          label: WTF_LIVE_ROOM_REACTION_LABELS[emoji],
          createdAt: new Date().toISOString(),
        },
      });
      break;
    }

    case "join_channel": {
      const channelId = Number(msg.channelId);
      if (!Number.isInteger(channelId) || channelId <= 0) {
        client.ws.send(JSON.stringify({ type: "error", message: "Invalid channel id" }));
        return;
      }
      const access = await loadChannelViewAccess(channelId, client.role, client.userId);
      if (!access) {
        client.ws.send(JSON.stringify({ type: "error", message: "Cannot join channel" }));
        return;
      }
      const prev = client.channelId;
      if (prev && prev !== channelId) {
        broadcastToChannel(prev, {
          type: "user_left",
          userId: client.userId,
          username: client.username,
        });
      }
      client.channelId = channelId;
      broadcastToChannel(channelId, {
        type: "user_joined",
        userId: client.userId,
        username: client.username,
      });
      break;
    }

    case "leave_channel":
      if (client.channelId) {
        broadcastToChannel(client.channelId, {
          type: "user_left",
          userId: client.userId,
          username: client.username,
        });
      }
      client.channelId = undefined;
      break;

    case "chat_message": {
      if (!client.channelId) return;
      const access = await loadChannelViewAccess(client.channelId, client.role, client.userId);
      if (!access) {
        client.ws.send(JSON.stringify({ type: "error", message: "Not allowed in this channel" }));
        return;
      }
      const { channel, perms } = access;
      if (!channel.active) {
        client.ws.send(JSON.stringify({ type: "error", message: "Channel not available" }));
        return;
      }
      if (!(await canPostInChannel(channel, perms, client.role, client.userId))) {
        client.ws.send(JSON.stringify({ type: "error", message: "Not allowed to post" }));
        return;
      }
      if (!(await hasPermission(client.role, "delete_any_post"))) {
        const slowErr = await checkChannelSlowMode(
          client.channelId,
          client.userId,
          channel.slowModeSeconds
        );
        if (slowErr) {
          client.ws.send(JSON.stringify({ type: "error", message: slowErr }));
          return;
        }
      }
      const content = String(msg.content ?? "").trim();
      if (content.length > MAX_CHAT_CONTENT_LENGTH) {
        client.ws.send(JSON.stringify({ type: "error", message: "Message exceeds maximum length" }));
        return;
      }
      if (!content) {
        client.ws.send(JSON.stringify({ type: "error", message: "Message content required" }));
        return;
      }
      broadcastToChannel(client.channelId, {
        type: "new_message",
        channelId: client.channelId,
        userId: client.userId,
        username: client.username,
        content,
        messageType: typeof msg.messageType === "string" ? msg.messageType : "text",
        timestamp: new Date().toISOString(),
      });
      break;
    }

    case "typing": {
      if (!client.channelId) return;
      const access = await loadChannelViewAccess(client.channelId, client.role, client.userId);
      if (!access) {
        client.ws.send(JSON.stringify({ type: "error", message: "Not allowed in this channel" }));
        return;
      }
      broadcastToChannel(
        client.channelId,
        {
          type: "user_typing",
          userId: client.userId,
          username: client.username,
        },
        client
      );
      break;
    }

    case "studio_join_project": {
      const projectId = Number(msg.projectId);
      if (!Number.isInteger(projectId) || projectId <= 0) {
        client.ws.send(JSON.stringify({ type: "error", message: "Invalid Studio project id" }));
        return;
      }
      const access = await resolveStudioAccess(projectId, {
        id: client.userId,
        role: client.role,
      });
      if (!access) {
        client.ws.send(JSON.stringify({ type: "error", message: "Cannot join Studio project" }));
        return;
      }
      if (client.studioProjectId && client.studioProjectId !== projectId) {
        broadcastToStudioProject(
          client.studioProjectId,
          {
            type: "studio_presence_left",
            projectId: client.studioProjectId,
            userId: client.userId,
            username: client.username,
          },
          client
        );
      }
      client.studioProjectId = projectId;
      client.studioFileId = undefined;

      const presence = snapshotStudioPresence(projectId).filter(
        (p) => p.userId !== client.userId
      );
      client.ws.send(
        JSON.stringify({
          type: "studio_presence_snapshot",
          projectId,
          presence,
        })
      );

      broadcastToStudioProject(
        projectId,
        {
          type: "studio_presence_joined",
          projectId,
          userId: client.userId,
          username: client.username,
          role: access.role,
        },
        client
      );
      break;
    }

    case "studio_leave_project": {
      if (!client.studioProjectId) return;
      broadcastToStudioProject(
        client.studioProjectId,
        {
          type: "studio_presence_left",
          projectId: client.studioProjectId,
          userId: client.userId,
          username: client.username,
        },
        client
      );
      client.studioProjectId = undefined;
      client.studioFileId = undefined;
      break;
    }

    case "studio_open_file": {
      if (!client.studioProjectId) return;
      const fileId = Number(msg.fileId);
      if (!Number.isInteger(fileId) || fileId <= 0) {
        client.ws.send(JSON.stringify({ type: "error", message: "Invalid Studio file id" }));
        return;
      }
      const [file] = await db
        .select({
          id: studioFiles.id,
          projectId: studioFiles.projectId,
          deletedAt: studioFiles.deletedAt,
        })
        .from(studioFiles)
        .where(eq(studioFiles.id, fileId))
        .limit(1);
      if (!file || file.deletedAt || file.projectId !== client.studioProjectId) {
        client.ws.send(JSON.stringify({ type: "error", message: "File not in current project" }));
        return;
      }
      client.studioFileId = fileId;
      broadcastToStudioProject(
        client.studioProjectId,
        {
          type: "studio_presence_updated",
          projectId: client.studioProjectId,
          userId: client.userId,
          username: client.username,
          viewingFileId: fileId,
        },
        client
      );
      break;
    }

    case "studio_close_file": {
      if (!client.studioProjectId) return;
      client.studioFileId = undefined;
      broadcastToStudioProject(
        client.studioProjectId,
        {
          type: "studio_presence_updated",
          projectId: client.studioProjectId,
          userId: client.userId,
          username: client.username,
          viewingFileId: null,
        },
        client
      );
      break;
    }

    case "studio_cursor": {
      if (!client.studioProjectId || !client.studioFileId) return;
      const fileId = Number(msg.fileId);
      if (fileId !== client.studioFileId) return;
      const x = Number(msg.x);
      const y = Number(msg.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      broadcastToStudioFile(
        client.studioProjectId,
        client.studioFileId,
        {
          type: "studio_cursor",
          projectId: client.studioProjectId,
          fileId: client.studioFileId,
          userId: client.userId,
          username: client.username,
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
        },
        client
      );
      break;
    }

    case "studio_typing": {
      if (!client.studioProjectId) return;
      broadcastToStudioProject(
        client.studioProjectId,
        {
          type: "studio_typing",
          projectId: client.studioProjectId,
          userId: client.userId,
          username: client.username,
        },
        client
      );
      break;
    }

    case "studio_annotation_preview": {
      if (!client.studioProjectId || !client.studioFileId) return;
      const fileId = Number(msg.fileId);
      if (fileId !== client.studioFileId) return;
      broadcastToStudioFile(
        client.studioProjectId,
        client.studioFileId,
        {
          type: "studio_annotation_preview",
          projectId: client.studioProjectId,
          fileId,
          userId: client.userId,
          username: client.username,
          kind: typeof msg.kind === "string" ? msg.kind : null,
          data: typeof msg.data === "object" && msg.data ? msg.data : null,
        },
        client
      );
      break;
    }
  }
}

function broadcastToChannel(
  channelId: number,
  message: Record<string, unknown>,
  exclude?: WsClient
) {
  const payload = JSON.stringify(message);
  for (const c of clients) {
    if (
      c.channelId === channelId &&
      c !== exclude &&
      c.ws.readyState === WebSocket.OPEN
    ) {
      c.ws.send(payload);
    }
  }
}

function broadcastToWtfLiveRoom(
  roomId: string,
  message: Record<string, unknown>,
  exclude?: WsClient
) {
  const payload = JSON.stringify(message);
  for (const c of clients) {
    if (
      c.wtfLiveRoomId === roomId &&
      c !== exclude &&
      c.ws.readyState === WebSocket.OPEN
    ) {
      c.ws.send(payload);
    }
  }
}

function broadcastToGreenRoomLocation(
  locationId: string,
  message: Record<string, unknown>,
  exclude?: WsClient
) {
  const payload = JSON.stringify(message);
  for (const c of clients) {
    if (
      c.publicSocket === "dedrooms" &&
      c.greenRoomLocationId === locationId &&
      c !== exclude &&
      c.ws.readyState === WebSocket.OPEN
    ) {
      c.ws.send(payload);
    }
  }
}

function leaveGreenRoomLocation(client: WsClient) {
  if (!client.greenRoomLocationId) return;
  const locationId = client.greenRoomLocationId;
  client.greenRoomLocationId = undefined;
  broadcastToGreenRoomLocation(
    locationId,
    {
      type: "ded_rooms_peer_left",
      locationId,
      peer: {
        userId: client.userId,
        username: client.username,
      },
    },
    client
  );
}

function leaveWtfLiveRoom(client: WsClient) {
  if (!client.wtfLiveRoomId || !client.wtfLivePeerId) return;
  const roomId = client.wtfLiveRoomId;
  const peerId = client.wtfLivePeerId;
  const guestName = wtfLivePeerDisplayName(client);
  client.wtfLiveRoomId = undefined;
  client.wtfLiveCanShareStage = undefined;
  client.wtfLiveMediaState = emptyWtfLiveMediaState();
  broadcastToWtfLiveRoom(
    roomId,
    {
      type: "wtf_live_peer_left",
      roomId,
      peerId,
      guestName,
    },
    client
  );
}

function cleanupClient(client: WsClient) {
  clients.delete(client);
  if (client.channelId) {
    broadcastToChannel(client.channelId, {
      type: "user_left",
      userId: client.userId,
      username: client.username,
    });
  }
  if (client.studioProjectId) {
    broadcastToStudioProject(
      client.studioProjectId,
      {
        type: "studio_presence_left",
        projectId: client.studioProjectId,
        userId: client.userId,
        username: client.username,
      },
      client
    );
  }
  if (client.wtfLiveRoomId) {
    leaveWtfLiveRoom(client);
  }
  if (client.greenRoomLocationId) {
    leaveGreenRoomLocation(client);
  }
}

export function broadcastGlobal(message: Record<string, unknown>) {
  const payload = JSON.stringify(message);
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}

/* ── Studio realtime helpers ──────────────────────────── */

export function broadcastToStudioProject(
  projectId: number,
  message: Record<string, unknown>,
  exclude?: WsClient
) {
  const payload = JSON.stringify(message);
  for (const c of clients) {
    if (
      c.studioProjectId === projectId &&
      c !== exclude &&
      c.ws.readyState === WebSocket.OPEN
    ) {
      c.ws.send(payload);
    }
  }
}

export function broadcastToStudioFile(
  projectId: number,
  fileId: number,
  message: Record<string, unknown>,
  exclude?: WsClient
) {
  const payload = JSON.stringify(message);
  for (const c of clients) {
    if (
      c.studioProjectId === projectId &&
      c.studioFileId === fileId &&
      c !== exclude &&
      c.ws.readyState === WebSocket.OPEN
    ) {
      c.ws.send(payload);
    }
  }
}

export function broadcastStudioEvent(
  projectId: number,
  eventType: string,
  payload: Record<string, unknown>
) {
  broadcastToStudioProject(projectId, { type: eventType, projectId, ...payload });
}

export function broadcastDedRoomsEvent(locationId: string, payload: Record<string, unknown>) {
  if (!GREEN_ROOM_ROOM_BY_ID.has(locationId)) return;
  broadcastToGreenRoomLocation(locationId, payload);
}

/** Who is currently present in a Studio project and what they're viewing. */
export function snapshotStudioPresence(projectId: number): Array<{
  userId: number;
  username: string;
  role: UserRole;
  viewingFileId: number | null;
}> {
  const out: Array<{
    userId: number;
    username: string;
    role: UserRole;
    viewingFileId: number | null;
  }> = [];
  const seen = new Set<number>();
  for (const c of clients) {
    if (c.studioProjectId === projectId && !seen.has(c.userId)) {
      seen.add(c.userId);
      out.push({
        userId: c.userId,
        username: c.username,
        role: c.role,
        viewingFileId: c.studioFileId ?? null,
      });
    }
  }
  return out;
}
