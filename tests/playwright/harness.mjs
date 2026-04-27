// Playwright local harness: serves the built W microapp client (dist/public)
// and mocks every backend endpoint W.tsx hits, so we can drive the UI in a
// headless browser without Postgres / X API credentials.
//
// State is mutable via POST /__test/state — the test sets the desired
// scenario ("normal", "rate-limited", "cold") and then hits the page.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../../dist/public");
const PORT = Number(process.env.HARNESS_PORT || 4173);

const state = {
  mode: "normal", // "normal" | "rate-limited" | "cold-rate-limited" | "ok-after-rate-limit"
  groupchatRequestCount: 0,
  groupchatLog: [],
};

function nowIso() {
  return new Date().toISOString();
}

function logRequest(req) {
  state.groupchatLog.push({ ts: Date.now(), path: req.originalUrl });
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// ── Test control ────────────────────────────────────────────────
app.post("/__test/state", (req, res) => {
  state.mode = String(req.body?.mode || "normal");
  state.groupchatRequestCount = 0;
  state.groupchatLog = [];
  res.json({ ok: true, state: { mode: state.mode } });
});

app.get("/__test/state", (_req, res) => {
  res.json({
    mode: state.mode,
    groupchatRequestCount: state.groupchatRequestCount,
    groupchatLog: state.groupchatLog,
  });
});

// ── Auth ────────────────────────────────────────────────────────
app.get("/api/auth/user", (_req, res) => {
  res.json({
    id: 1,
    username: "wtf-admin",
    displayName: "WTF Admin",
    role: "admin",
    twitterHandle: "wtf_admin",
    twitterVerified: true,
    twitterPublic: true,
    createdAt: "2026-01-01T00:00:00Z",
    effectivePermissions: { access_admin_panel: true, manage_roles: true },
  });
});

// Some pages call this; return null for unused calls.
app.get("/api/auth/twitter-oauth2/diagnostics", (_req, res) => {
  res.json({ ok: true, configured: true });
});
app.get("/api/auth/twitter-oauth2/diagnostics/self-test", (_req, res) => {
  res.json({ ok: true });
});

// ── W microapp ──────────────────────────────────────────────────
app.get("/api/w/capabilities", (_req, res) => {
  res.json({
    oauth2Configured: true,
    platformAccountConfigured: true,
    platformAccountSource: "user_record",
    platformAccountReason: null,
    platformAccountHandle: "wtf_gameshow",
    groupchatConfigured: true,
    groupchatIds: ["g1934373363226407162"],
    connected: true,
    canUseAdminControls: true,
    scopes: ["tweet.read", "users.read", "tweet.write", "dm.read", "dm.write"],
    tiers: [],
    capabilities: [
      { key: "timeline", scopes: [], available: true, enabled: true },
      { key: "engage", scopes: ["tweet.write"], available: true, enabled: true },
      { key: "messages", scopes: ["dm.read", "dm.write"], available: true, enabled: true },
      { key: "follows", scopes: ["follows.write", "users.read"], available: true, enabled: true },
    ],
    defaultAccountHandle: "wtf_gameshow",
  });
});

app.get("/api/w/timeline", (_req, res) => {
  res.json({
    posts: [],
    accounts: [],
    cachedAt: nowIso(),
  });
});

app.get("/api/w/follows/summary", (_req, res) => {
  res.json({
    profile: {
      id: "11111",
      username: "wtf_admin",
      name: "WTF Admin",
      profileImageUrl: "https://example.com/avatar.png",
      followersCount: 42,
      followingCount: 7,
    },
  });
});

app.get("/api/w/spaces", (_req, res) => {
  res.json({ spaces: [], creatorHandle: "wtf_admin" });
});

app.get("/api/w/admin/dm-conversations", (_req, res) => {
  res.json({
    currentConversationId: "g1934373363226407162",
    currentConversationIds: ["g1934373363226407162"],
    conversations: [
      {
        id: "g1934373363226407162",
        type: "group",
        name: "WTF Gameshow Group",
        createdAt: "2026-04-01T00:00:00Z",
        participantCount: 3,
        participants: [
          { id: "11111", username: "wtf_admin", name: "WTF Admin", profileImageUrl: null },
          { id: "22222", username: "wtf_gameshow", name: "WTF Gameshow", profileImageUrl: null },
          { id: "33333", username: "contestant_one", name: "Contestant", profileImageUrl: null },
        ],
      },
    ],
  });
});

app.get("/api/w/user-dms", (_req, res) => {
  res.json({
    conversations: [],
    filtered: true,
    policy: "test",
    rateLimitedUntil: null,
    cachedAt: Date.now(),
  });
});

// The endpoint we're actually testing — switchable.
app.get("/api/w/groupchat", (_req, res) => {
  state.groupchatRequestCount += 1;
  logRequest(_req);

  switch (state.mode) {
    case "rate-limited": {
      // Soft 429: server returns 200 + rateLimitedUntil + cached payload.
      const rateLimitedUntil = Date.now() + 30_000; // 30s window
      const cached = {
        configured: true,
        conversationId: "g1934373363226407162",
        conversation: {
          id: "g1934373363226407162",
          type: "group",
          name: "WTF Gameshow Group",
          createdAt: "2026-04-01T00:00:00Z",
          participantCount: 3,
          participants: [],
        },
        messages: [
          {
            id: "msg-cached-1",
            text: "Cached message from before the rate limit hit",
            createdAt: "2026-04-26T12:00:00Z",
            sender: { id: "22222", username: "wtf_gameshow", name: "WTF Gameshow", profileImageUrl: null },
          },
        ],
        diagnostics: {
          message: "X DM lookup is rate-limited; showing cached messages. Auto-resumes in ~30s.",
          rateLimited: true,
        },
        rateLimitedUntil,
        cachedAt: Date.now() - 5_000,
      };
      return res.json({
        ...cached,
        chats: [cached],
        readonly: false,
        canWrite: true,
        defaultAccountHandle: "wtf_gameshow",
        rateLimitedUntil,
      });
    }
    case "cold-rate-limited": {
      // Soft 429 with no cached data — proves the client doesn't loop.
      const rateLimitedUntil = Date.now() + 60_000;
      return res.json({
        configured: false,
        conversationId: null,
        messages: [],
        chats: [],
        readonly: true,
        canWrite: false,
        rateLimitedUntil,
        diagnostics: {
          message: "X DM lookup is rate-limited. Try again in ~1m.",
          rateLimited: true,
        },
      });
    }
    case "normal":
    default: {
      const payload = {
        configured: true,
        conversationId: "g1934373363226407162",
        conversation: {
          id: "g1934373363226407162",
          type: "group",
          name: "WTF Gameshow Group",
          createdAt: "2026-04-01T00:00:00Z",
          participantCount: 3,
          participants: [],
        },
        messages: [
          {
            id: "msg-1",
            text: "Hello world from the W harness",
            createdAt: nowIso(),
            sender: { id: "22222", username: "wtf_gameshow", name: "WTF Gameshow", profileImageUrl: null },
          },
        ],
        diagnostics: null,
        rateLimitedUntil: null,
        cachedAt: Date.now(),
      };
      return res.json({
        ...payload,
        chats: [payload],
        readonly: false,
        canWrite: true,
        defaultAccountHandle: "wtf_gameshow",
        rateLimitedUntil: null,
      });
    }
  }
});

// Catch-all for unmocked /api/* — returns empty 200 to keep the page from
// surfacing unrelated errors.
app.use("/api", (req, res) => {
  res.json({ ok: true, mocked: true, path: req.originalUrl });
});

// ── Static client + SPA fallback ────────────────────────────────
app.use(express.static(DIST_DIR, { fallthrough: true, index: false }));
// Express 5 renamed wildcard from "*" to "/*splat".
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`[harness] listening on http://127.0.0.1:${PORT} (dist: ${DIST_DIR})`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
