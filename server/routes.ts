import type { Express } from "express";
import authRoutes from "./auth/routes";
import seasonsRoutes from "./routes/seasons";
import challengesRoutes from "./routes/challenges";
import messagesRoutes from "./routes/messages";
import marketplaceRoutes from "./routes/marketplace";
import leaderboardRoutes from "./routes/leaderboard";
import walletsRoutes from "./routes/wallets";
import sideQuestsRoutes from "./routes/side-quests";
import linksRoutes from "./routes/links";
import faqRoutes from "./routes/faq";
import adminRoutes from "./routes/admin";

export function registerRoutes(app: Express) {
  app.use(authRoutes);
  app.use(seasonsRoutes);
  app.use(challengesRoutes);
  app.use(messagesRoutes);
  app.use(marketplaceRoutes);
  app.use(leaderboardRoutes);
  app.use(walletsRoutes);
  app.use(sideQuestsRoutes);
  app.use(linksRoutes);
  app.use(faqRoutes);
  app.use(adminRoutes);
}
