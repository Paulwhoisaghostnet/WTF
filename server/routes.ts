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

  // TEMPORARY: diagnose deployed DB connectivity — remove after fix
  app.get("/api/db-debug", async (_req, res) => {
    const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
    const hasUrl = !!dbUrl;
    const hasProtocol = /^postgres(ql)?:\/\//i.test(dbUrl);
    let parsed: { host: string; port: string; user: string; db: string } | null = null;
    try {
      const u = new URL(dbUrl);
      parsed = {
        host: u.hostname,
        port: u.port || "5432",
        user: u.username ? u.username.slice(0, 12) + "..." : "(empty)",
        db: u.pathname.replace(/^\//, "") || "postgres",
      };
    } catch { /* invalid URL */ }

    let queryResult: string | null = null;
    let queryError: string | null = null;
    try {
      const { pool } = await import("./db");
      const client = await pool.connect();
      try {
        const r = await client.query("SELECT current_database() AS db, current_user AS usr, now() AS ts");
        queryResult = JSON.stringify(r.rows[0]);
      } finally {
        client.release();
      }
    } catch (err: any) {
      queryError = `${err?.code || ""} ${err?.message || String(err)}`.trim();
    }

    res.json({
      hasUrl,
      hasProtocol,
      parsed,
      sessionSecret: !!process.env.SESSION_SECRET,
      queryResult,
      queryError,
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
}
