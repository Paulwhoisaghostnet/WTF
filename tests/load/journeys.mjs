import { WebSocket } from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizePath(path) {
  const clean = String(path).split("?", 1)[0];
  return clean
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return ":id";
      if (/^(tz1|tz2|tz3|KT1)[0-9A-Za-z]{20,}$/.test(seg)) return ":addr";
      if (/^[0-9a-fA-F-]{16,}$/.test(seg)) return ":uuid";
      return seg;
    })
    .join("/");
}

async function timedGet(ctx, path) {
  if (ctx.throttle) await ctx.throttle();
  const t0 = performance.now();
  let status = 0;
  try {
    const res = await ctx.request.get(path, { timeout: 20_000 });
    status = res.status();
    // Drain + release the body so sockets are reused.
    await res.body().catch(() => {});
    if (typeof res.dispose === "function") await res.dispose();
  } catch {
    status = -1;
  }
  const ms = performance.now() - t0;
  ctx.record({ label: `GET ${normalizePath(path)}`, ms, status });
  return status;
}

/**
 * Lobby journey — the identified non-linear hot path. Mirrors WtfLiveApp.tsx
 * which polls three room-list endpoints every 5s, each recomputing presence by
 * scanning the global WebSocket client set per room.
 */
const lobbyJourney = {
  name: "lobby",
  guestOk: false,
  thinkMs: 5000,
  async setup() {
    return {};
  },
  async tick(ctx) {
    await Promise.all([
      timedGet(ctx, "/api/wtf-live/rooms"),
      timedGet(ctx, "/api/wtf-live/rooms/mine"),
      timedGet(ctx, "/api/wtf-live/rooms/private"),
    ]);
  },
  async teardown() {},
};

/**
 * Browse journey — typical signed-in desktop polling across several apps.
 */
const browseJourney = {
  name: "browse",
  guestOk: false,
  thinkMs: 4000,
  async setup() {
    return {};
  },
  async tick(ctx) {
    await timedGet(ctx, "/api/desktop/settings");
    await timedGet(ctx, "/api/in-app-market?category=wtf_live");
    await timedGet(ctx, "/api/notifications");
    await timedGet(ctx, "/api/atproto/me");
  },
  async teardown() {},
};

/**
 * Public guest journey — no auth. Light unauthenticated polling that any
 * visitor produces. Safe for production baseline probing.
 */
const publicJourney = {
  name: "public",
  guestOk: true,
  thinkMs: 5000,
  async setup() {
    return {};
  },
  async tick(ctx) {
    await timedGet(ctx, "/api/health");
    if (ctx.roomId) {
      await timedGet(ctx, `/api/wtf-live/public/rooms/${ctx.roomId}`);
    }
  },
  async teardown() {},
};

/**
 * Room journey — opens a real-time WTF Live socket, joins a room as a guest,
 * and sends periodic chat messages. Exercises the WebSocket broadcast fan-out
 * path. Requires a roomId. Falls back to lobby polling if none is configured.
 */
const roomJourney = {
  name: "room",
  guestOk: true,
  thinkMs: 4000,
  async setup(ctx) {
    if (!ctx.roomId) return { socket: null };
    const peerId = `load-${Math.random().toString(36).slice(2, 10)}`;
    const guestName = `Load ${peerId.slice(-4)}`;
    let socket = null;
    const t0 = performance.now();
    try {
      socket = new WebSocket(ctx.wsUrl, {
        headers: ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : undefined,
      });
      await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error("ws open timeout")), 15_000);
        socket.on("open", () => {
          clearTimeout(to);
          resolve();
        });
        socket.on("error", (err) => {
          clearTimeout(to);
          reject(err);
        });
      });
      socket.on("message", () => {});
      socket.send(
        JSON.stringify({
          type: "wtf_live_join_room",
          roomId: ctx.roomId,
          peerId,
          guestName,
          mediaState: { audioOpen: false, camera: false, screen: false },
        }),
      );
      ctx.record({ label: "WS connect /ws/wtf-live", ms: performance.now() - t0, status: 101 });
    } catch (err) {
      ctx.record({ label: "WS connect /ws/wtf-live", ms: performance.now() - t0, status: -1 });
      socket = null;
    }
    return { socket, peerId };
  },
  async tick(ctx, state) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      // Fall back to lobby polling pressure if the socket is unavailable.
      await timedGet(ctx, "/api/wtf-live/rooms");
      return;
    }
    const t0 = performance.now();
    try {
      state.socket.send(
        JSON.stringify({
          type: "wtf_live_chat_message",
          roomId: ctx.roomId,
          peerId: state.peerId,
          text: `load tick ${Date.now()}`,
        }),
      );
      ctx.record({ label: "WS chat message", ms: performance.now() - t0, status: 200 });
    } catch {
      ctx.record({ label: "WS chat message", ms: performance.now() - t0, status: -1 });
    }
  },
  async teardown(_ctx, state) {
    try {
      state?.socket?.close();
    } catch {}
  },
};

const JOURNEYS = {
  lobby: lobbyJourney,
  browse: browseJourney,
  public: publicJourney,
  room: roomJourney,
};

export function resolveJourney(name) {
  return JOURNEYS[name] || null;
}

export function pickJourneyName(mix) {
  const total = mix.reduce((sum, m) => sum + m.weight, 0);
  let r = Math.random() * total;
  for (const m of mix) {
    r -= m.weight;
    if (r <= 0) return m.name;
  }
  return mix[mix.length - 1].name;
}

export { sleep, normalizePath };
