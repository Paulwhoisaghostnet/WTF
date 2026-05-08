import { Router, type NextFunction, type Request, type Response } from "express";
import { isAuthenticated } from "../auth/passport";
import { isAdmin, type UserRole } from "@shared/types";
import { runArcadeSourceImport } from "../features/arcade/source-import";
import { proxyArcadeSourceFile } from "../features/arcade/source-proxy";
import {
  getArcadeStats,
  getArcadeCartridgeBySlug,
  listArcadeCatalog,
  listUserSubmittedArcadeGames,
  submitArcadeGameFromMedia,
} from "../features/arcade/catalog";
import {
  listConsoleModerationQueue,
  moderateConsoleGame,
} from "../features/console/catalog";
import {
  createArcadePlayIntent,
  getArcadePaymentConfig,
  getArcadePlayStatus,
} from "../features/arcade/payment";
import { createArcadePlaySession, submitArcadeScore } from "../features/arcade/sessions";
import {
  getConsoleChampions,
  getConsoleLeaderboard,
  getConsolePlayerLeaderboard,
  getConsolePlayerProfile,
  getRecentConsoleScores,
} from "../features/console/scoring";
import { getConsoleDiscoveryShelves } from "../features/console/discovery";
import { isConsoleStockSlug } from "../features/console/surfaces";
import {
  listConsoleGameReports,
  moderateConsoleGameReport,
  reportConsoleGame,
} from "../features/console/moderation";
import { listConsoleAuditEvents } from "../features/console/audit";
import type { ConsoleAuthUser } from "../features/console/types";

const router = Router();

function authUser(req: Request): ConsoleAuthUser {
  const user = req.user as any;
  return {
    id: Number(user.id),
    username: String(user.username || `user-${user.id}`),
    displayName: user.displayName ?? null,
    role: user.role ?? null,
  };
}

function sendRouteError(res: Response, err: unknown, fallback: string) {
  const enriched = err as (Error & { statusCode?: number; intent?: unknown }) | null;
  const message = err instanceof Error ? err.message : fallback;
  const status =
    enriched?.statusCode ||
    (/not found/i.test(message)
      ? 404
      : /ticket required|payment required/i.test(message)
        ? 402
      : /missing|invalid|expired|exceed|select|validation|unsupported|zip|bundle|signature|score|report|reason/i.test(message)
        ? 400
        : 500);
  if (status >= 500) console.error("[arcade] route failed:", err);
  res.status(status).json({
    error: message || fallback,
    ...(enriched?.intent ? { intent: enriched.intent } : {}),
  });
}

function requireArcadeAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (!user || !isAdmin(String(user.role || "witness") as UserRole)) {
    return res.status(403).json({ error: "Admin Arcade access required" });
  }
  next();
}

router.get(/^\/api\/arcade\/source\/(.+)$/, proxyArcadeSourceFile);

router.get("/api/arcade/games", async (req, res) => {
  try {
    res.json(await listArcadeCatalog(Number(req.query.limit || 100)));
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade games");
  }
});

router.get("/api/arcade/stats", async (_req, res) => {
  try {
    res.json(await getArcadeStats());
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade stats");
  }
});

router.get("/api/arcade/discovery", async (req, res) => {
  try {
    res.json(
      await getConsoleDiscoveryShelves(Number(req.query.limit || 8), {
        surface: "arcade",
      })
    );
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade discovery shelves");
  }
});

router.get("/api/arcade/play-fee", (_req, res) => {
  res.json({ payment: getArcadePaymentConfig() });
});

router.get("/api/arcade/play-status", isAuthenticated, async (req, res) => {
  try {
    res.json(await getArcadePlayStatus(authUser(req)));
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade play status");
  }
});

router.get("/api/arcade/games/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "");
    const game = await getArcadeCartridgeBySlug(slug);
    if (!game) return res.status(404).json({ error: "WTF Arcade game not found" });
    const leaderboard = game.leaderboardEnabled
      ? await getConsoleLeaderboard(game.slug, 25, { surface: "arcade" }).catch(() => [])
      : [];
    res.json({ game, leaderboard, payment: getArcadePaymentConfig() });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade game");
  }
});

router.post("/api/arcade/play-intents", isAuthenticated, async (req, res) => {
  try {
    res.status(201).json({
      ok: true,
      intent: await createArcadePlayIntent({
        userId: authUser(req).id,
        walletAddress: req.body?.walletAddress,
      }),
      payment: getArcadePaymentConfig(),
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to create WTF Arcade play intent");
  }
});

router.post("/api/arcade/session", isAuthenticated, async (req, res) => {
  try {
    res.status(201).json(
      await createArcadePlaySession(authUser(req), req.body?.slug, {
        userAgent: req.get("user-agent") || undefined,
        ip: req.ip,
        walletAddress: req.body?.walletAddress,
      })
    );
  } catch (err) {
    sendRouteError(res, err, "Failed to create WTF Arcade play session");
  }
});

router.post("/api/arcade/scores", isAuthenticated, async (req, res) => {
  try {
    res.status(201).json(await submitArcadeScore(authUser(req), req.body));
  } catch (err) {
    sendRouteError(res, err, "Failed to submit WTF Arcade score");
  }
});

router.get("/api/arcade/leaderboard/:slug", async (req, res) => {
  try {
    res.json({
      slug: req.params.slug,
      leaderboard: await getConsoleLeaderboard(
        String(req.params.slug || ""),
        Number(req.query.limit || 25),
        { surface: "arcade" }
      ),
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade leaderboard");
  }
});

router.get("/api/arcade/recent", async (req, res) => {
  try {
    res.json({
      scores: await getRecentConsoleScores(Number(req.query.limit || 25), {
        surface: "arcade",
      }),
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade recent scores");
  }
});

router.get("/api/arcade/champions", async (req, res) => {
  try {
    res.json({
      champions: await getConsoleChampions(Number(req.query.limit || 50), {
        surface: "arcade",
      }),
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade champions");
  }
});

router.get("/api/arcade/players/top", async (req, res) => {
  try {
    res.json({
      players: await getConsolePlayerLeaderboard(Number(req.query.limit || 50), {
        surface: "arcade",
      }),
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade players");
  }
});

router.get("/api/arcade/player/:username", async (req, res) => {
  try {
    res.json(
      await getConsolePlayerProfile(
        String(req.params.username || ""),
        Number(req.query.limit || 50),
        { surface: "arcade" }
      )
    );
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch WTF Arcade player");
  }
});

router.post("/api/arcade/games/:slug/report", isAuthenticated, async (req, res) => {
  try {
    if (isConsoleStockSlug(req.params.slug)) {
      return res.status(404).json({ error: "WTF Arcade game not found" });
    }
    res.status(201).json(
      await reportConsoleGame({
        user: authUser(req),
        slug: String(req.params.slug || ""),
        category: req.body?.category,
        reason: req.body?.reason,
        userAgent: req.get("user-agent") || undefined,
        ip: req.ip,
      })
    );
  } catch (err) {
    sendRouteError(res, err, "Failed to report WTF Arcade game");
  }
});

router.get("/api/arcade/my-games", isAuthenticated, async (req, res) => {
  try {
    res.json({ games: await listUserSubmittedArcadeGames(authUser(req).id) });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch submitted WTF Arcade games");
  }
});

router.post("/api/arcade/submit", isAuthenticated, async (req, res) => {
  try {
    const game = await submitArcadeGameFromMedia(authUser(req), {
      mediaId: Number(req.body?.mediaId),
      updateSlug: req.body?.updateSlug,
      title: req.body?.title,
      description: req.body?.description,
      category: req.body?.category,
      coverUri: req.body?.coverUri,
      maxPossibleScore: req.body?.maxPossibleScore,
      maxScorePerSecond: req.body?.maxScorePerSecond,
    });
    res.status(201).json({
      game,
      status: game.status,
      nextStep:
        game.status === "active"
          ? "Trusted creator submission is live in WTF Arcade."
          : "An admin can approve this game from the WTF Arcade moderation queue.",
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to submit WTF Arcade game");
  }
});

router.post(
  "/api/arcade/admin/games/:slug/:action",
  isAuthenticated,
  requireArcadeAdmin,
  async (req, res) => {
    try {
      const action = String(req.params.action || "");
      if (isConsoleStockSlug(req.params.slug)) {
        return res.status(404).json({ error: "WTF Arcade game not found" });
      }
      if (
        action !== "approve" &&
        action !== "reject" &&
        action !== "remove" &&
        action !== "restore"
      ) {
        return res.status(400).json({ error: "Unsupported moderation action" });
      }
      res.json({
        game: await moderateConsoleGame({
          actorUserId: authUser(req).id,
          slug: String(req.params.slug || ""),
          action,
          reason: req.body?.reason,
        }),
      });
    } catch (err) {
      sendRouteError(res, err, "Failed to moderate WTF Arcade game");
    }
  }
);

router.get(
  "/api/arcade/admin/games",
  isAuthenticated,
  requireArcadeAdmin,
  async (req, res) => {
    try {
      res.json({
        games: await listConsoleModerationQueue({
          status: String(req.query.status || "all"),
          limit: Number(req.query.limit || 100),
          surface: "arcade",
        }),
      });
    } catch (err) {
      sendRouteError(res, err, "Failed to fetch WTF Arcade moderation queue");
    }
  }
);

router.post(
  "/api/arcade/admin/source-import",
  isAuthenticated,
  requireArcadeAdmin,
  async (_req, res) => {
    try {
      res.json(await runArcadeSourceImport());
    } catch (err) {
      sendRouteError(res, err, "Failed to run WTF Arcade source import");
    }
  }
);

router.get(
  "/api/arcade/admin/reports",
  isAuthenticated,
  requireArcadeAdmin,
  async (req, res) => {
    try {
      res.json({
        reports: await listConsoleGameReports({
          status: String(req.query.status || "open"),
          limit: Number(req.query.limit || 100),
        }),
      });
    } catch (err) {
      sendRouteError(res, err, "Failed to fetch WTF Arcade reports");
    }
  }
);

router.post(
  "/api/arcade/admin/reports/:id/:action",
  isAuthenticated,
  requireArcadeAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const action = String(req.params.action || "");
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid report id" });
      }
      if (
        action !== "review" &&
        action !== "resolve" &&
        action !== "dismiss" &&
        action !== "reopen"
      ) {
        return res.status(400).json({ error: "Unsupported report action" });
      }
      res.json(
        await moderateConsoleGameReport({
          actorUserId: authUser(req).id,
          id,
          action,
          note: req.body?.note,
        })
      );
    } catch (err) {
      sendRouteError(res, err, "Failed to moderate WTF Arcade report");
    }
  }
);

router.get(
  "/api/arcade/admin/audit",
  isAuthenticated,
  requireArcadeAdmin,
  async (req, res) => {
    try {
      res.json({
        events: await listConsoleAuditEvents({
          limit: Number(req.query.limit || 80),
          action: typeof req.query.action === "string" ? req.query.action : undefined,
          gameSlug: typeof req.query.gameSlug === "string" ? req.query.gameSlug : undefined,
          surface: "arcade",
        }),
      });
    } catch (err) {
      sendRouteError(res, err, "Failed to fetch WTF Arcade audit events");
    }
  }
);

export default router;
