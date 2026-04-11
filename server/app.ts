import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { setupAuth } from "./auth/passport";
import { registerRoutes } from "./routes";
import { classifyDbError } from "./errors/db-errors";

export async function createApp() {
  const app = express();

  if (process.env.NODE_ENV === "production" || process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Global API rate limit — 200 requests per minute per IP
  app.use(
    "/api/",
    rateLimit({
      windowMs: 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests, please try again later" },
    })
  );

  // Stricter limit for authentication endpoints
  app.use(
    ["/api/auth/login", "/api/auth/register"],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many authentication attempts, please try again later" },
    })
  );

  await setupAuth(app);
  registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[server] unhandled error:", err);
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
