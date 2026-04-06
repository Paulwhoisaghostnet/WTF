import express from "express";
import cors from "cors";
import helmet from "helmet";
import { setupAuth } from "./auth/passport";
import { registerRoutes } from "./routes";

export async function createApp() {
  const app = express();

  // Netlify and other reverse proxies: required for correct req.ip, secure cookies, OAuth redirects
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

  await setupAuth(app);
  registerRoutes(app);

  return app;
}
