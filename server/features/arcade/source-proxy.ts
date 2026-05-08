import type { Request, Response } from "express";
import { arcadeSourcePublicBase, normalizeArcadeSourceStorageKey } from "./source-import";

const ARCADE_SOURCE_PROXY_MAX_BYTES = Math.max(
  1024 * 1024,
  Number(
    process.env.ARCADE_SOURCE_PROXY_MAX_BYTES ||
      process.env.HACKCADE_PROXY_MAX_BYTES ||
      8 * 1024 * 1024
  )
);

export async function proxyArcadeSourceFile(req: Request, res: Response) {
  const rawKey = String((req.params as any)[0] || "");
  const key = normalizeArcadeSourceStorageKey(rawKey);
  if (!key) return res.status(400).json({ error: "Invalid WTF Arcade source file path" });

  if (key.endsWith("/hackcade-sdk.js")) {
    return res
      .type("application/javascript")
      .setHeader("Cache-Control", "public, max-age=300")
      .setHeader("Access-Control-Allow-Origin", "*")
      .send(ARCADE_SOURCE_COMPAT_SDK);
  }

  const url = `${arcadeSourcePublicBase()}/arcade-files/${encodeURI(key).replace(/%2F/gi, "/")}`;
  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: "*/*",
        "User-Agent": "WTF-Arcade-Source-Proxy/1.0",
      },
    });
    if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502).json({
        error: upstream.status === 404
          ? "WTF Arcade source file not found"
          : "WTF Arcade source file fetch failed",
      });
    }

    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (declaredLength > ARCADE_SOURCE_PROXY_MAX_BYTES) {
      return res.status(502).json({ error: "WTF Arcade source file exceeds proxy size limit" });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.byteLength > ARCADE_SOURCE_PROXY_MAX_BYTES) {
      return res.status(502).json({ error: "WTF Arcade source file exceeds proxy size limit" });
    }

    const contentType =
      upstream.headers.get("content-type") || guessContentTypeFromKey(key);
    res
      .status(200)
      .type(contentType)
      .setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600")
      .setHeader("Cross-Origin-Resource-Policy", "cross-origin")
      .setHeader("Access-Control-Allow-Origin", "*")
      .send(bytes);
  } catch (err) {
    console.warn("[arcade] WTF Arcade source proxy failed:", err);
    res.status(502).json({ error: "WTF Arcade source file fetch failed" });
  }
}

function guessContentTypeFromKey(key: string): string {
  const ext = key.toLowerCase().split(".").pop() || "";
  switch (ext) {
    case "html":
    case "htm":
      return "text/html; charset=utf-8";
    case "js":
    case "mjs":
      return "application/javascript; charset=utf-8";
    case "css":
      return "text/css; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    case "ogg":
      return "audio/ogg";
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

export const ARCADE_SOURCE_COMPAT_SDK = String.raw`
const events = new EventTarget();
let _player = null;
let _session = null;
let _ticket = null;
let _readyPromise = null;
const pendingParentRequests = new Map();
let parentRequestSeq = 0;

function inferSlug() {
  const params = new URLSearchParams(window.location.search);
  return params.get("wtfGameSlug") || params.get("game") || params.get("slug") || "";
}

function makeGuest() {
  return { domain: "", label: "guest", address: "", avatarUrl: "", hackatarUrl: "" };
}

async function postJson(path, body) {
  const bridgeResult = await requestParent("postJson", { path, body }).catch(() => null);
  if (bridgeResult) return bridgeResult;
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "WTF Arcade request failed");
  return data;
}

function requestParent(action, payload = {}) {
  if (!window.parent || window.parent === window) return Promise.reject(new Error("No parent bridge"));
  const id = "hackcade-sdk-" + (++parentRequestSeq) + "-" + Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingParentRequests.delete(id);
      reject(new Error("Parent bridge timeout"));
    }, 8000);
    pendingParentRequests.set(id, { resolve, reject, timeout });
    try {
      window.parent.postMessage({
        type: "wtf-console:request",
        source: "hackcade-compat",
        id,
        action,
        payload,
      }, "*");
    } catch (err) {
      clearTimeout(timeout);
      pendingParentRequests.delete(id);
      reject(err);
    }
  });
}

function playerFromSession(session) {
  const p = session && session.player ? session.player : null;
  if (!p) return makeGuest();
  const username = p.username || p.displayName || "player";
  return {
    domain: username,
    label: username,
    address: "",
    avatarUrl: "",
    hackatarUrl: "",
  };
}

async function ensureReady() {
  if (_readyPromise) return _readyPromise;
  _readyPromise = (async () => {
    const slug = inferSlug();
    if (!slug) {
      _player = makeGuest();
      return _player;
    }
    try {
      const session = await postJson("/api/arcade/session", { slug });
      _session = session.runId || session.sessionId || null;
      _ticket = session.ticket || null;
      _player = playerFromSession(session);
      events.dispatchEvent(new CustomEvent("init", { detail: { player: _player, session: _session } }));
      queueMicrotask(() => {
        events.dispatchEvent(new CustomEvent("start", { detail: { type: "hackcade:start" } }));
      });
      return _player;
    } catch {
      _player = makeGuest();
      events.dispatchEvent(new CustomEvent("init", { detail: { player: _player, session: null } }));
      return _player;
    }
  })();
  return _readyPromise;
}

const sdk = {
  events,
  get player() { return _player; },
  get session() { return _session; },
  get ticket() { return _ticket; },
  get isReady() { return Boolean(_player); },
  async ready() { return ensureReady(); },
  async getPlayer() { return ensureReady(); },
  isGuest() { return !_player || !_player.domain; },
  greeting() {
    if (!_player || !_player.domain) return "Hi, guest";
    return "Hi, " + _player.domain;
  },
  updateScore(score) {
    if (typeof score !== "number" || !Number.isFinite(score)) return;
    try {
      window.parent.postMessage({
        type: "wtf-console:score-preview",
        source: "hackcade-compat",
        score: Math.floor(score),
        sessionId: _session,
      }, "*");
    } catch {}
  },
  async gameOver(finalScore, options = {}) {
    await ensureReady();
    const score = Math.floor(typeof finalScore === "number" && Number.isFinite(finalScore) ? finalScore : 0);
    if (!_session) return { ok: false, guest: true, score };
    return postJson("/api/arcade/scores", {
      slug: inferSlug(),
      runId: _session,
      ticket: _ticket,
      score,
      payload: {
        source: "hackcade-compat",
        durationSeconds: options.durationSeconds,
        durationMs: options.durationMs,
        metadata: options.metadata,
      },
    });
  },
  on(event, handler) {
    const wrapped = (e) => handler(e.detail);
    events.addEventListener(event, wrapped);
    return () => events.removeEventListener(event, wrapped);
  },
};

window.WTFArcade = window.WTFArcade || sdk;
window.WTFConsole = window.WTFConsole || sdk;
window.Hackcade = window.Hackcade || sdk;

window.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (!msg || msg.type !== "wtf-console:response" || !msg.id) return;
  const pending = pendingParentRequests.get(msg.id);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingParentRequests.delete(msg.id);
  if (msg.ok) pending.resolve(msg.data);
  else pending.reject(new Error(msg.error || "Parent bridge request failed"));
});

export default sdk;
export { events };
`;
