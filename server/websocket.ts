import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { createHmac, timingSafeEqual } from "crypto";
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

const MAX_CHAT_CONTENT_LENGTH = 10_000;

interface WsClient {
  ws: WebSocket;
  userId: number;
  channelId?: number;
  studioProjectId?: number;
  studioFileId?: number;
  username: string;
  role: UserRole;
}

const clients = new Set<WsClient>();
const SESSION_COOKIE_NAME = "connect.sid";

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

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const auth = await resolveSessionUser(req);
    if (!auth) {
      ws.send(JSON.stringify({ type: "error", message: "Unauthorized websocket session" }));
      ws.close(1008, "unauthorized");
      return;
    }

    const heartbeatWs = ws as HeartbeatSocket;
    heartbeatWs.isAlive = true;
    ws.on("pong", () => {
      heartbeatWs.isAlive = true;
    });

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

    ws.on("close", () => {
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
    });

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
