import type { Express } from "express";
import authRoutes from "./auth/routes";
import seasonsRoutes from "./routes/seasons";
import challengesRoutes from "./routes/challenges";
import messagesRoutes from "./routes/messages";
import marketplaceRoutes from "./routes/marketplace";
import barterRoutes from "./routes/barter";
import leaderboardRoutes from "./routes/leaderboard";
import walletsRoutes from "./routes/wallets";
import sideQuestsRoutes from "./routes/side-quests";
import linksRoutes from "./routes/links";
import faqRoutes from "./routes/faq";
import adminRoutes from "./routes/admin";
import dexRoutes from "./routes/dex";
import profileRoutes from "./routes/profile";
import boardRoutes from "./routes/board";
import wRoutes from "./routes/w";
import tvRoutes from "./routes/tv";
import desktopAppRoutes from "./routes/desktop-apps";

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "wtf-gameshow-api",
      commitRef: process.env.COMMIT_REF ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      timestamp: new Date().toISOString(),
    });
  });

  app.use(authRoutes);
  app.use(seasonsRoutes);
  app.use(challengesRoutes);
  app.use(messagesRoutes);
  app.use(marketplaceRoutes);
  app.use(barterRoutes);
  app.use(leaderboardRoutes);
  app.use(walletsRoutes);
  app.use(sideQuestsRoutes);
  app.use(linksRoutes);
  app.use(faqRoutes);
  app.use(adminRoutes);
  app.use(dexRoutes);
  app.use(profileRoutes);
  app.use(boardRoutes);
  app.use(wRoutes);
  app.use(tvRoutes);
  app.use(desktopAppRoutes);
}
