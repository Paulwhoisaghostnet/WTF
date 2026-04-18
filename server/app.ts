import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { setupAuth } from "./auth/passport";
import { registerRoutes } from "./routes";
import { classifyDbError } from "./errors/db-errors";

interface InMemoryRateLimitOptions {
  windowMs: number;
  max: number;
  message: { error: string };
  keyGenerator?: (req: Request) => string;
}

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

function createInMemoryRateLimit(options: InMemoryRateLimitOptions) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key =
      options.keyGenerator?.(req) ||
      req.ip ||
      String(req.headers["x-forwarded-for"] || "") ||
      "anonymous";

    const recentHits = (hits.get(key) || []).filter(
      (timestamp) => now - timestamp < options.windowMs
    );

    if (recentHits.length >= options.max) {
      return res.status(429).json(options.message);
    }

    recentHits.push(now);
    hits.set(key, recentHits);
    next();
  };
}

function corsOptionsFor(allowedOrigins: Set<string>): Parameters<typeof cors>[0] {
  if (allowedOrigins.size === 0) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[cors] No allowed origins resolved. Set PUBLIC_SITE_URL for a fixed allowlist."
      );
    }
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

  if (process.env.NODE_ENV === "production" || process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production"
          ? {
              useDefaults: true,
              directives: {
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
                  "https://static.cloudflareinsights.com",
                ],
                "frame-ancestors": ["'self'"],
              },
            }
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
  app.use(cors(corsOptionsFor(allowedOrigins)));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    "/api/",
    createInMemoryRateLimit({
      windowMs: 60 * 1000,
      max: 200,
      message: { error: "Too many requests, please try again later" },
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
    ["/api/auth/google", "/api/auth/github", "/api/auth/twitter", "/api/auth/discord"],
    createInMemoryRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 15,
      message: { error: "Too many OAuth attempts, please try again later" },
    })
  );

  await setupAuth(app);
  registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[server] unhandled error:", err);
    if (typeof err?.message === "string" && err.message.startsWith("Origin not allowed by CORS")) {
      return res.status(403).json({ error: "Origin not allowed" });
    }
    const classified = classifyDbError(err);
    if (classified) {
      return res.status(classified.status).json({ error: classified.error });
    }
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : String(err?.message || err);
    res.status(500).json({ error: message });
  });

  return app;
}
