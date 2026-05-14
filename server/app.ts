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
import {
  allowedOriginsForRuntime,
  shouldAllowNullOriginArcadeSource,
} from "./lib/cors-origins";
import { csrfProtection } from "./lib/csrf";
import { createAdminMutationAuditMiddleware } from "./lib/admin-mutation-audit";

/**
 * Read-heavy playback routes exempted from the generic `/api/*` rate
 * limiter.
 *
 * Video playback fans out into many small requests very quickly —
 * byte-range seeks, bumper polling, cache-warming prefetches, thumbnail
 * bursts during queue building. Applying the same 200-req/min quota
 * that protects login/OAuth to those byte-range and cache-proxy reads
 * would kill the viewer experience within seconds. The old prefix-based
 * bypass was too broad and also exempted write-heavy routes like upload
 * and prefetch mutations. Keep the bypass narrow and read-only.
 */
const MEDIA_RATE_LIMIT_BYPASS_PREFIXES: readonly string[] = [];

const MEDIA_RATE_LIMIT_BYPASS_PATTERNS: readonly RegExp[] = [
  /^\/api\/console\/dependency$/,
  /^\/api\/tv\/cache\/media$/,
  /^\/api\/cache\/media$/,
  /^\/api\/tv\/channels\/\d+\/stream$/,
  /^\/api\/tv\/channels\/\d+\/now$/,
  /^\/api\/tv\/channels\/\d+\/media\/\d+\/file$/,
  /^\/api\/tv\/channels\/by-slug\/[^/]+\/current$/,
  /^\/api\/tv\/bumpers\/pool$/,
  /^\/api\/tv\/bumpers\/community$/,
  /^\/api\/tv\/bumpers\/\d+\/media$/,
  /^\/api\/media\/\d+\/file$/,
];

function isMediaStreamRequest(req: Request): boolean {
  const method = String(req.method || "GET").toUpperCase();
  const rawUrl = String(req.originalUrl || req.url || req.path || "");
  const url = rawUrl.split("?", 1)[0] || rawUrl;
  if (MEDIA_RATE_LIMIT_BYPASS_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return true;
  }
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }
  return MEDIA_RATE_LIMIT_BYPASS_PATTERNS.some((pattern) => pattern.test(url));
}

function isLocalE2eRateLimitBypass(req: Request): boolean {
  if (process.env.WTF_E2E_RATE_LIMIT_BYPASS !== "1") return false;
  if (process.env.NODE_ENV === "production") return false;
  const ip = String(req.ip || req.socket.remoteAddress || "");
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function shouldSkipApiRateLimit(req: Request): boolean {
  return isMediaStreamRequest(req) || isLocalE2eRateLimitBypass(req);
}

function sessionOrIpRateLimitKey(req: Request): string {
  const userId = (req as Request & { user?: { id?: unknown } }).user?.id;
  if (Number.isInteger(Number(userId)) && Number(userId) > 0) {
    return `user:${Number(userId)}`;
  }
  return req.ip || String(req.headers["x-forwarded-for"] || "") || "anonymous";
}

function requestPath(req: any): string {
  const rawUrl = String(req.originalUrl || req.url || req.path || "");
  return rawUrl.split("?", 1)[0] || rawUrl;
}

function corsOptionsFor(allowedOrigins: Set<string>): Parameters<typeof cors>[0] {
  const arcadeSourceNullOriginOptions: Parameters<typeof cors>[0] = {
    origin: "*",
    credentials: false,
  };

  if (allowedOrigins.size === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[cors] No allowed origins resolved in production. Set PUBLIC_SITE_URL or CORS_ALLOWED_ORIGINS before boot."
      );
    }
    console.warn("[cors] No allowed origins resolved; allowing all origins outside production.");
    const permissiveOptions: Parameters<typeof cors>[0] = { origin: true, credentials: true };
    return (req, callback) => {
      if (shouldAllowNullOriginArcadeSource(req.headers.origin, requestPath(req))) {
        return callback(null, arcadeSourceNullOriginOptions);
      }
      callback(null, permissiveOptions);
    };
  }

  const protectedOptions: Parameters<typeof cors>[0] = {
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

  return (req, callback) => {
    if (shouldAllowNullOriginArcadeSource(req.headers.origin, requestPath(req))) {
      return callback(null, arcadeSourceNullOriginOptions);
    }
    callback(null, protectedOptions);
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
  const walletConnectFrameSources = [
    "https://walletconnect.com",
    "https://walletconnect.org",
    "https://reown.com",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "https://*.reown.com",
  ];
  const walletConnectNetworkSources = [
    "https://walletconnect.com",
    "https://walletconnect.org",
    "https://reown.com",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "https://*.reown.com",
    "wss://walletconnect.com",
    "wss://walletconnect.org",
    "wss://reown.com",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
    "wss://*.reown.com",
  ];
  const walletFrameSources = [
    "https://walletbeacon.io",
    "https://*.walletbeacon.io",
    ...walletConnectFrameSources,
  ];
  const baseCspDirectives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", "https:"],
    "connect-src": ["'self'", "https:", "wss:", "ws:", ...walletConnectNetworkSources],
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
    "frame-src": ["'self'", ...walletFrameSources],
    "child-src": ["'self'", ...walletFrameSources],
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
  // everywhere, we scope them to `/games/installed/*`,
  // `/creation-tools/*`, and the Tezamp bootloader bundle — static
  // directories that run in sandboxed iframes, so the blast radius is
  // contained.
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
      ["/games/installed", "/creation-tools", "/tezamp/winamp-bootloader"],
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
    "/api/system/logs/client",
    createInMemoryRateLimit({
      windowMs: 60 * 1000,
      max: 30,
      maxEntries: 2_000,
      message: { error: "Too many client log events, please try again later" },
      skip: isLocalE2eRateLimitBypass,
    })
  );

  app.use(
    "/api/",
    createInMemoryRateLimit({
      windowMs: 60 * 1000,
      max: 200,
      message: { error: "Too many requests, please try again later" },
      skip: shouldSkipApiRateLimit,
    })
  );

  app.use(
    ["/api/auth/login", "/api/auth/register"],
    createInMemoryRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      message: { error: "Too many authentication attempts, please try again later" },
      skip: isLocalE2eRateLimitBypass,
    })
  );

  app.use(
    ["/api/auth/wallet/challenge", "/api/auth/wallet/verify", "/api/auth/wallet/register"],
    createInMemoryRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      message: { error: "Too many wallet auth attempts, please try again later" },
      skip: isLocalE2eRateLimitBypass,
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
  app.use(csrfProtection);
  app.use(
    "/api/tv/cache/prefetch",
    createInMemoryRateLimit({
      windowMs: 60 * 1000,
      max: 12,
      message: { error: "Too many TV cache warm requests, please try again later" },
    })
  );
  app.use(
    /^\/api\/media\/\d+\/file$/,
    createInMemoryRateLimit({
      windowMs: 60 * 1000,
      max: 600,
      keyGenerator: sessionOrIpRateLimitKey,
      message: { error: "Too many private media file requests, please try again later" },
    })
  );
  app.use(
    "/api/media/import-token",
    createInMemoryRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 60,
      keyGenerator: sessionOrIpRateLimitKey,
      message: { error: "Too many media imports, please try again later" },
    })
  );
  app.use(
    "/api/media/upload",
    createInMemoryRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      keyGenerator: sessionOrIpRateLimitKey,
      message: { error: "Too many media uploads, please try again later" },
    })
  );
  app.use(createSystemLogUserMiddleware());
  app.use(createAdminMutationAuditMiddleware());
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
