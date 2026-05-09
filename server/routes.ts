import type { Express } from "express";
import { readTvCacheStats } from "./features/tv/cache-storage";
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
import crawlerEmbedRoutes from "./routes/crawler-embeds";
import boardRoutes from "./routes/board";
import wRoutes from "./routes/w";
import tvRoutes from "./routes/tv";
import tvEmbedRoutes from "./routes/tv-embed";
import galleryRoutes from "./routes/gallery";
import desktopAppRoutes from "./routes/desktop-apps";
import desktopRoutes from "./routes/desktop";
import inAppMarketRoutes from "./routes/in-app-market";
import accessRoutes from "./routes/access";
import mcpRoutes from "./routes/mcp";
import contractActivityRoutes from "./routes/contract-activity";
import notificationRoutes from "./routes/notifications";
import mediaLibraryRoutes from "./routes/media-library";
import arcadeRoutes from "./routes/arcade";
import casinoRoutes from "./routes/casino";
import clubDuesRoutes from "./routes/club-dues";
import consoleRoutes from "./routes/console";
import gameStudioRoutes from "./routes/game-studio";
import studioRoutes from "./routes/studio";
import studioFilesRoutes from "./routes/studio-files";
import studioAnnotationsRoutes from "./routes/studio-annotations";
import studioAdminRoutes from "./routes/studio-admin";
import studioDriveRoutes from "./routes/studio-drive";
import cockpitRoutes from "./routes/cockpit";
import portfolioRoutes from "./routes/portfolio";
import buybackWindowsRoutes from "./routes/buyback-windows";
import wtfAuctionsRoutes from "./routes/wtf-auctions";
import wtfRecaptureRoutes from "./routes/wtf-recapture";
import controlBoardRoutes from "./routes/control-board";
import dickswordRoutes from "./routes/dicksword";
import telegramDigestRoutes from "./routes/telegram-digest";
import systemLogRoutes from "./routes/system-logs";
import wtfSubdomainRoutes from "./routes/wtf-subdomains";
import collektRoutes from "./routes/collekt";
import { attendanceRoutes } from "./routes/attendance";
import calendarRoutes from "./routes/calendar";
import collectionFactoryRoutes from "./routes/collection-factory";
import mintPortalRoutes from "./routes/mint-portal";
import operatorWalletRoutes from "./routes/operator-wallet";
import etherlinkWalletRoutes from "./routes/etherlink-wallets";
import tokenArchiveRoutes from "./routes/token-archive";
import tezosIntelRoutes from "./features/tezos-intel/routes";
import challengeAutomationAdminRoutes from "./challenges/routes/admin";

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      ok: true,
      service: "wtf-gameshow-api",
      uptime: process.uptime(),
      commitRef: process.env.COMMIT_REF ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      timestamp: new Date().toISOString(),
    });
  });

  // Disk/cache health: ops-facing endpoint that reports current TV cache
  // consumption vs the configured budget. Alert threshold is 90% of the
  // budget ceiling. Cheap (single readdir + stat per entry) and safe to
  // poll from an external monitor.
  app.get("/api/health/disk", async (_req, res) => {
    try {
      const stats = await readTvCacheStats();
      const usage = stats.maxTotalBytes > 0
        ? stats.totalBytes / stats.maxTotalBytes
        : 0;
      const status = usage >= 1.0
        ? "crit"
        : usage >= 0.9
          ? "warn"
          : "ok";
      res.json({
        status,
        ok: status === "ok",
        tvCache: {
          dir: stats.dir,
          files: stats.fileCount,
          immutable: stats.immutableCount,
          mutable: stats.mutableCount,
          bytes: stats.totalBytes,
          budgetBytes: stats.maxTotalBytes,
          utilization: Number(usage.toFixed(4)),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        status: "error",
        ok: false,
        error: (err as Error)?.message ?? String(err),
        timestamp: new Date().toISOString(),
      });
    }
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
  app.use(systemLogRoutes);
  app.use(dexRoutes);
  app.use(profileRoutes);
  app.use(crawlerEmbedRoutes);
  app.use(boardRoutes);
  app.use(wRoutes);
  app.use(tvRoutes);
  app.use(tvEmbedRoutes);
  app.use(galleryRoutes);
  app.use(desktopAppRoutes);
  app.use(desktopRoutes);
  app.use(inAppMarketRoutes);
  app.use(accessRoutes);
  app.use(mcpRoutes);
  app.use(contractActivityRoutes);
  app.use(notificationRoutes);
  app.use(mediaLibraryRoutes);
  app.use(arcadeRoutes);
  app.use(casinoRoutes);
  app.use(clubDuesRoutes);
  app.use(consoleRoutes);
  app.use(gameStudioRoutes);
  app.use(studioRoutes);
  app.use(studioFilesRoutes);
  app.use(studioAnnotationsRoutes);
  app.use(studioAdminRoutes);
  app.use(studioDriveRoutes);
  app.use(cockpitRoutes);
  app.use(portfolioRoutes);
  app.use(buybackWindowsRoutes);
  app.use(wtfAuctionsRoutes);
  app.use(wtfRecaptureRoutes);
  app.use(controlBoardRoutes);
  app.use(dickswordRoutes);
  app.use(telegramDigestRoutes);
  app.use(wtfSubdomainRoutes);
  app.use(collektRoutes);
  app.use(attendanceRoutes);
  app.use(calendarRoutes);
  app.use(collectionFactoryRoutes);
  app.use(mintPortalRoutes);
  app.use(operatorWalletRoutes);
  app.use(etherlinkWalletRoutes);
  app.use(tokenArchiveRoutes);
  app.use(tezosIntelRoutes);
  app.use(challengeAutomationAdminRoutes);
}
