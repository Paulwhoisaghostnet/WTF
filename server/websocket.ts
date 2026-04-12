import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { pool } from "./db";

interface WsClient {
  ws: WebSocket;
  userId: number;
  channelId?: number;
  username: string;
}

const clients = new Set<WsClient>();
const SESSION_COOKIE_NAME = "connect.sid";
const SESSION_SECRET = process.env.SESSION_SECRET || "wtf-gameshow-dev-secret";

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
} | null> {
  const cookieHeader = typeof req.headers.cookie === "string" ? req.headers.cookie : undefined;
  const cookies = parseCookieHeader(cookieHeader);
  const signedSid = cookies.get(SESSION_COOKIE_NAME);
  if (!signedSid) return null;

  const sid = unsignSessionValue(signedSid, SESSION_SECRET);
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

  const userResult = await pool.query("SELECT id, username FROM users WHERE id = $1 LIMIT 1", [
    userId,
  ]);
  if (userResult.rows.length === 0) return null;

  const user = userResult.rows[0] as { id: number; username: string };
  return {
    userId: Number(user.id),
    username: String(user.username || "user"),
  };
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

    const client: WsClient = { ws, userId: auth.userId, username: auth.username };
    clients.add(client);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleMessage(client, msg);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      }
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
    });

    ws.send(
      JSON.stringify({
        type: "connected",
        userId: client.userId,
        username: client.username,
      })
    );
  });
}

function handleMessage(client: WsClient, msg: any) {
  switch (msg.type) {
    case "join_channel":
      if (!Number.isInteger(msg.channelId) || msg.channelId <= 0) {
        client.ws.send(JSON.stringify({ type: "error", message: "Invalid channel id" }));
        return;
      }
      client.channelId = msg.channelId;
      broadcastToChannel(msg.channelId, {
        type: "user_joined",
        userId: client.userId,
        username: client.username,
      });
      break;

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

    case "chat_message":
      if (client.channelId) {
        broadcastToChannel(client.channelId, {
          type: "new_message",
          channelId: client.channelId,
          userId: client.userId,
          username: client.username,
          content: msg.content,
          messageType: msg.messageType || "text",
          timestamp: new Date().toISOString(),
        });
      }
      break;

    case "typing":
      if (client.channelId) {
        broadcastToChannel(
          client.channelId,
          {
            type: "user_typing",
            userId: client.userId,
            username: client.username,
          },
          client
        );
      }
      break;
  }
}

function broadcastToChannel(
  channelId: number,
  message: any,
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

export function broadcastGlobal(message: any) {
  const payload = JSON.stringify(message);
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}
