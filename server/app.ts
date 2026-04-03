import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { setupAuth } from "./auth/passport";
import { registerRoutes } from "./routes";

dotenv.config();

export function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  setupAuth(app);
  registerRoutes(app);

  return app;
}
