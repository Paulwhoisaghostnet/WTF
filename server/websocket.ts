import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";

interface WsClient {
  ws: WebSocket;
  userId?: number;
  channelId?: number;
  username?: string;
}

const clients = new Set<WsClient>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const client: WsClient = { ws };
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

    ws.send(JSON.stringify({ type: "connected" }));
  });
}

function handleMessage(client: WsClient, msg: any) {
  switch (msg.type) {
    case "auth":
      client.userId = msg.userId;
      client.username = msg.username;
      break;

    case "join_channel":
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
      if (client.channelId && client.userId) {
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
