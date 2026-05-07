import { Router, type NextFunction, type Request, type Response } from "express";
import { isAuthenticated } from "../auth/passport";
import { isAdmin, type UserRole } from "@shared/types";
import { listConsoleAuditEvents } from "../features/console/audit";
import {
  listConsoleCatalog,
  listConsoleModerationQueue,
  listPublishedConsoleCartridges,
  listUserConsoleCartridges,
  listUserSubmittedConsoleGames,
  moderateConsoleGame,
  submitConsoleGameFromMedia,
} from "../features/console/catalog";
import { serveConsoleBundleFile } from "../features/console/bundle-storage";
import { serveInstalledConsoleCartridge } from "../features/console/cartridge-assets";
import {
  auditInstalledConsoleCartridgeDependencies,
  warmInstalledConsoleCartridgeDependencies,
} from "../features/console/dependency-audit";
import {
  serveConsoleDependency,
  serveEmulatorJsDependency,
} from "../features/console/dependency-proxy";
import { getDemoCartridges } from "../features/console/manifest";
import { runHackcadeImport } from "../features/console/hackcade-import";
import { proxyHackcadeFile } from "../features/console/hackcade-proxy";
import {
  listConsoleGameReports,
  moderateConsoleGameReport,
  reportConsoleGame,
} from "../features/console/moderation";
import {
  createConsolePlaySession,
  getConsoleChampions,
  getConsoleLeaderboard,
  getConsolePlayerProfile,
  getRecentConsoleScores,
  submitConsoleScore,
} from "../features/console/scoring";
import { WTF_CONSOLE_SDK } from "../features/console/sdk";
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
  const message = err instanceof Error ? err.message : fallback;
  const status =
    /not found/i.test(message)
      ? 404
      : /missing|invalid|expired|exceed|select|validation|unsupported|zip|bundle|signature|ticket|score|report|reason/i.test(message)
        ? 400
        : 500;
  if (status >= 500) console.error("[console] route failed:", err);
  res.status(status).json({ error: message || fallback });
}

function requireConsoleAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (!user || !isAdmin(String(user.role || "witness") as UserRole)) {
    return res.status(403).json({ error: "Admin console access required" });
  }
  next();
}

router.get("/api/console/sdk.js", (_req, res) => {
  res
    .type("application/javascript")
    .setHeader("Cache-Control", "public, max-age=300")
    .setHeader("Access-Control-Allow-Origin", "*")
    .send(WTF_CONSOLE_SDK);
});

router.get("/api/console/dependency", serveConsoleDependency);

router.get(/^\/api\/console\/bundles\/(.+)$/, serveConsoleBundleFile);

router.get(/^\/api\/console\/hackcade\/(.+)$/, proxyHackcadeFile);

router.get(/^\/games\/installed\/(.+)$/, serveInstalledConsoleCartridge);

router.get(/^\/games\/_vendor\/emulatorjs\/data\/(.+)$/, serveEmulatorJsDependency);

router.get("/api/console/demo-cartridges", (_req, res) => {
  res.json(getDemoCartridges());
});

router.get("/api/console/cartridges", isAuthenticated, async (req, res) => {
  try {
    res.json(await listUserConsoleCartridges(authUser(req).id));
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch cartridges");
  }
});

router.get("/api/console/games", async (req, res) => {
  try {
    const userId = req.isAuthenticated?.() && req.user ? authUser(req).id : undefined;
    res.json(await listConsoleCatalog(userId));
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch console games");
  }
});

router.get("/api/console/published", async (_req, res) => {
  try {
    res.json(await listPublishedConsoleCartridges());
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch published console games");
  }
});

router.get("/api/console/games/:slug/dependencies", async (req, res) => {
  try {
    res.json(await auditInstalledConsoleCartridgeDependencies(String(req.params.slug || "")));
  } catch (err) {
    sendRouteError(res, err, "Failed to audit console game dependencies");
  }
});

router.post(
  "/api/console/games/:slug/dependencies/cache",
  isAuthenticated,
  requireConsoleAdmin,
  async (req, res) => {
    try {
      res.json(await warmInstalledConsoleCartridgeDependencies(String(req.params.slug || "")));
    } catch (err) {
      sendRouteError(res, err, "Failed to cache console game dependencies");
    }
  }
);

router.get("/api/console/games/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "");
    const catalog = await listConsoleCatalog(
      req.isAuthenticated?.() && req.user ? authUser(req).id : undefined
    );
    const game = catalog.all.find((cart) => cart.slug === slug || cart.tokenId === slug);
    if (!game) return res.status(404).json({ error: "Console game not found" });
    const leaderboard = game.leaderboardEnabled
      ? await getConsoleLeaderboard(game.slug, 25).catch(() => [])
      : [];
    res.json({ game, leaderboard });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch console game");
  }
});

router.get("/api/console/leaderboard/:slug", async (req, res) => {
  try {
    res.json({
      slug: req.params.slug,
      leaderboard: await getConsoleLeaderboard(
        String(req.params.slug || ""),
        Number(req.query.limit || 25)
      ),
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch console leaderboard");
  }
});

router.get("/api/console/recent", async (req, res) => {
  try {
    res.json({
      scores: await getRecentConsoleScores(Number(req.query.limit || 25)),
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch recent console scores");
  }
});

router.get("/api/console/champions", async (req, res) => {
  try {
    res.json({
      champions: await getConsoleChampions(Number(req.query.limit || 50)),
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch console champions");
  }
});

router.get("/api/console/player/:username", async (req, res) => {
  try {
    res.json(
      await getConsolePlayerProfile(
        String(req.params.username || ""),
        Number(req.query.limit || 50)
      )
    );
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch console player");
  }
});

router.post("/api/console/games/:slug/report", isAuthenticated, async (req, res) => {
  try {
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
    sendRouteError(res, err, "Failed to report console game");
  }
});

router.post("/api/console/session", isAuthenticated, async (req, res) => {
  try {
    const session = await createConsolePlaySession(authUser(req), req.body?.slug, {
      userAgent: req.get("user-agent") || undefined,
      ip: req.ip,
    });
    res.status(201).json(session);
  } catch (err) {
    sendRouteError(res, err, "Failed to create console play session");
  }
});

router.post("/api/console/scores", isAuthenticated, async (req, res) => {
  try {
    res.status(201).json(await submitConsoleScore(authUser(req), req.body));
  } catch (err) {
    sendRouteError(res, err, "Failed to submit console score");
  }
});

router.get("/api/console/my-games", isAuthenticated, async (req, res) => {
  try {
    res.json({ games: await listUserSubmittedConsoleGames(authUser(req).id) });
  } catch (err) {
    sendRouteError(res, err, "Failed to fetch submitted console games");
  }
});

router.post("/api/console/submit", isAuthenticated, async (req, res) => {
  try {
    const game = await submitConsoleGameFromMedia(authUser(req), {
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
          ? "Trusted creator submission is live."
          : "An admin can approve this game from the console moderation queue.",
    });
  } catch (err) {
    sendRouteError(res, err, "Failed to submit console game");
  }
});

router.post(
  "/api/console/admin/games/:slug/:action",
  isAuthenticated,
  requireConsoleAdmin,
  async (req, res) => {
    try {
      const action = String(req.params.action || "");
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
      sendRouteError(res, err, "Failed to moderate console game");
    }
  }
);

router.get(
  "/api/console/admin/games",
  isAuthenticated,
  requireConsoleAdmin,
  async (req, res) => {
    try {
      res.json({
        games: await listConsoleModerationQueue({
          status: typeof req.query.status === "string" ? req.query.status : "pending",
          limit: Number(req.query.limit || 100),
        }),
      });
    } catch (err) {
      sendRouteError(res, err, "Failed to fetch console moderation queue");
    }
  }
);

router.get(
  "/api/console/admin/reports",
  isAuthenticated,
  requireConsoleAdmin,
  async (req, res) => {
    try {
      res.json({
        reports: await listConsoleGameReports({
          status: typeof req.query.status === "string" ? req.query.status : "open",
          limit: Number(req.query.limit || 100),
        }),
      });
    } catch (err) {
      sendRouteError(res, err, "Failed to fetch console reports");
    }
  }
);

router.get(
  "/api/console/admin/audit",
  isAuthenticated,
  requireConsoleAdmin,
  async (req, res) => {
    try {
      res.json({
        events: await listConsoleAuditEvents({
          limit: Number(req.query.limit || 100),
          action: typeof req.query.action === "string" ? req.query.action : undefined,
          gameSlug:
            typeof req.query.gameSlug === "string" ? req.query.gameSlug : undefined,
        }),
      });
    } catch (err) {
      sendRouteError(res, err, "Failed to fetch console audit events");
    }
  }
);

router.post(
  "/api/console/admin/reports/:id/:action",
  isAuthenticated,
  requireConsoleAdmin,
  async (req, res) => {
    try {
      const action = String(req.params.action || "");
      if (
        action !== "review" &&
        action !== "resolve" &&
        action !== "dismiss" &&
        action !== "reopen"
      ) {
        return res.status(400).json({ error: "Unsupported report action" });
      }
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid report id" });
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
      sendRouteError(res, err, "Failed to moderate console report");
    }
  }
);

router.post(
  "/api/console/admin/hackcade/import",
  isAuthenticated,
  requireConsoleAdmin,
  async (_req, res) => {
    try {
      res.json(await runHackcadeImport());
    } catch (err) {
      sendRouteError(res, err, "Failed to import Hackcade games");
    }
  }
);

export default router;
