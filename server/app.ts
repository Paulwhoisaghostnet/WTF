import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { setupAuth } from "./auth/passport";
import { registerRoutes } from "./routes";
import { classifyDbError } from "./errors/db-errors";
import {
  createSystemLogMiddleware,
  createSystemLogUserMiddleware,
  logExpressError,
} from "./lib/system-log";
import { createInMemoryRateLimit } from "./lib/in-memory-rate-limit";

function normalizeOrigin(value: string): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function allowedOriginsForRuntime(): Set<string> {
  const allowed = new Set<string>();

  const fromEnv = String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));
  fromEnv.forEach((origin) => allowed.add(origin));

  const publicSiteOrigin = normalizeOrigin(process.env.PUBLIC_SITE_URL || "");
  if (publicSiteOrigin) allowed.add(publicSiteOrigin);

  if (process.env.NODE_ENV !== "production") {
    [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ].forEach((origin) => allowed.add(origin));
  }

  return allowed;
}

/**
 * Paths exempted from the generic `/api/*` rate limiter.
 *
 * Video playback fans out into many small requests very quickly —
 * byte-range seeks, bumper polling, cache-warming prefetches, thumbnail
 * bursts during queue building.  Applying the same 200-req/min quota
 * that protects login/OAuth to these paths would kill the viewer
 * experience within seconds.  These routes have their own caching,
 * authorization, and upstream concurrency controls (see
 * `server/routes/tv.ts`, `prefetchMediaAsync`, `warmChannelAsync`),
 * so exempting them here is safe. Client log ingestion is also excluded
 * because a frontend error burst should be recorded without spending the
 * user's normal API quota and causing follow-on 429s.
 */
const MEDIA_RATE_LIMIT_BYPASS_PREFIXES: readonly string[] = [
  "/api/system/logs/client",
  "/api/tv/cache/",
  "/api/tv/channels/",
  "/api/tv/bumpers/",
  "/api/tv/stream/",
  "/api/media/",
  "/api/uploads/",
];

function isMediaStreamRequest(req: Request): boolean {
  const url = String(req.path || req.url || "");
  return MEDIA_RATE_LIMIT_BYPASS_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function corsOptionsFor(allowedOrigins: Set<string>): Parameters<typeof cors>[0] {
  if (allowedOrigins.size === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[cors] No allowed origins resolved in production. Set PUBLIC_SITE_URL or CORS_ALLOWED_ORIGINS before boot."
      );
    }
    console.warn("[cors] No allowed origins resolved; allowing all origins outside production.");
    return { origin: true, credentials: true };
  }

  return {
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
  };
}

export async function createApp() {
  const app = express();
  const allowedOrigins = allowedOriginsForRuntime();
  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "40mb";

  if (process.env.NODE_ENV === "production" || process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }

  // Base CSP directives shared by the whole app.  Game-cartridge pages get
  // a superset of this (see below) — keeping them derived from the same
  // object means the two policies can't drift out of sync.
  const baseCspDirectives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", "https:"],
    "connect-src": ["'self'", "https:", "wss:", "ws:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      // `wasm-unsafe-eval` lets the js-dos DOSBox build execute
      // its WebAssembly module without also opening the door
      // to arbitrary JS `eval()`.  Required for the Console's
      // DOS cartridges.
      "'wasm-unsafe-eval'",
      // Cloudflare auto-injects the Web Analytics beacon into HTML
      // responses at the edge; without this entry every page (including
      // game iframes) logs a noisy CSP violation for that script.
      "https://static.cloudflareinsights.com",
    ],
    "frame-ancestors": ["'self'"],
  };

  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production"
          ? { useDefaults: true, directives: baseCspDirectives }
          : false,
      crossOriginEmbedderPolicy: false,
      // `same-site` lets our own iframes (game cartridges in Console,
      // file previews in StudioProject) embed our static + API
      // responses while preventing arbitrary external pages from
      // hot-linking authenticated content.  Switch to `cross-origin`
      // only if a future feature genuinely needs to be embeddable on
      // a third-party page.
      crossOriginResourcePolicy: { policy: "same-site" },
    })
  );

  // Path-scoped CSP override for embedded creative tools and game cartridges.
  //
  // Two things differ from the app-wide policy:
  //
  //   1.  `script-src` adds `'unsafe-eval'` and `blob:`.
  //       - `'unsafe-eval'` is needed by the js-dos Emscripten DOSBox
  //         build, which uses the classic `Function("return this")`
  //         sandbox-detection shim (governed by `'unsafe-eval'`, not
  //         `'wasm-unsafe-eval'` which only covers WebAssembly
  //         instantiation).
  //       - `blob:` covers libraries that generate worker/module
  //         scripts from `URL.createObjectURL(new Blob(...))`
  //         (common in Three.js pipelines and Vite-built React games).
  //
  //   2.  `worker-src` explicitly whitelists `'self' blob:` so any
  //       cartridge that spins up a Web Worker from a same-origin
  //       script or a blob URL isn't silently blocked.
  //
  // Rather than grant these to the whole app and weaken CSP
  // everywhere, we scope them to `/games/installed/*` and
  // `/creation-tools/*` — static directories that run in sandboxed
  // iframes, so the blast radius is contained.
  //
  // This middleware runs AFTER the global helmet registration, so its
  // `res.setHeader('Content-Security-Policy', ...)` wins on matching
  // routes.  It's only mounted in production since dev skips CSP
  // entirely above.
  if (process.env.NODE_ENV === "production") {
    const gameCspDirectives: Record<string, string[]> = {
      ...baseCspDirectives,
      "script-src": [
        ...(baseCspDirectives["script-src"] ?? []),
        "'unsafe-eval'",
        "blob:",
      ],
      "connect-src": [
        ...(baseCspDirectives["connect-src"] ?? []),
        "blob:",
        "data:",
      ],
      "worker-src": ["'self'", "blob:"],
    };
    app.use(
      ["/games/installed", "/creation-tools"],
      helmet.contentSecurityPolicy({
        useDefaults: true,
        directives: gameCspDirectives,
      })
    );
  }
  app.use(cors(corsOptionsFor(allowedOrigins)));
  app.use(express.json({ limit: jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }));
  app.use(createSystemLogMiddleware());

  app.use(
    "/api/",
    createInMemoryRateLimit({
      windowMs: 60 * 1000,
      max: 200,
      message: { error: "Too many requests, please try again later" },
      skip: isMediaStreamRequest,
    })
  );

  app.use(
    ["/api/auth/login", "/api/auth/register"],
    createInMemoryRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      message: { error: "Too many authentication attempts, please try again later" },
    })
  );

  app.use(
    ["/api/auth/wallet/challenge", "/api/auth/wallet/verify", "/api/auth/wallet/register"],
    createInMemoryRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      message: { error: "Too many wallet auth attempts, please try again later" },
    })
  );

  app.use(
    [
      "/api/auth/google",
      "/api/auth/github",
      "/api/auth/twitter",
      "/api/auth/twitter-oauth2",
      "/api/auth/discord",
    ],
    createInMemoryRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 15,
      message: { error: "Too many OAuth attempts, please try again later" },
    })
  );

  await setupAuth(app);
  app.use(createSystemLogUserMiddleware());
  registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    console.error("[server] unhandled error:", err);
    if (typeof err?.message === "string" && err.message.startsWith("Origin not allowed by CORS")) {
      logExpressError(req, err, 403);
      return res.status(403).json({ error: "Origin not allowed" });
    }
    const classified = classifyDbError(err);
    if (classified) {
      logExpressError(req, err, classified.status);
      return res.status(classified.status).json({ error: classified.error });
    }
    logExpressError(req, err, 500);
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : String(err?.message || err);
    res.status(500).json({ error: message });
  });

  return app;
}
