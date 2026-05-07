import { Router } from "express";
import { isAuthenticated } from "../auth/passport";
import {
  buildGameStudioScaffold,
  buildGameStudioStockAssetFile,
  findGameStudioTemplate,
  GAME_STUDIO_STOCK_ASSETS,
  GAME_STUDIO_TEMPLATES,
  listGameStudioStockAssetDescriptors,
} from "../features/game-studio/catalog";
import {
  buildGameStudioProjectBundle,
  createGameStudioProject,
  getGameStudioProject,
  listGameStudioProjectBuilds,
  listGameStudioProjects,
  submitGameStudioProjectToConsole,
  updateGameStudioProject,
} from "../features/game-studio/projects";
import type { ConsoleAuthUser } from "../features/console/types";

const router = Router();

function routeUserId(req: any): number {
  return Number(req.user?.id);
}

function routeConsoleUser(req: any): ConsoleAuthUser {
  const user = req.user || {};
  return {
    id: Number(user.id),
    username: String(user.username || `user-${user.id}`),
    displayName: user.displayName ?? null,
    role: user.role ?? null,
  };
}

function sendGameStudioError(res: any, err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  const status =
    /not found/i.test(message)
      ? 404
      : /required|invalid|unsupported|limit|exceed|asset|bundle|pending|review|creator|authorized/i.test(message)
        ? 400
        : 500;
  if (status >= 500) console.error("[game-studio] route failed:", err);
  res.status(status).json({ error: message || fallback });
}

router.get("/api/game-studio/templates", (_req, res) => {
  res.json({ templates: GAME_STUDIO_TEMPLATES });
});

router.get("/api/game-studio/assets", (req, res) => {
  const kind = typeof req.query.kind === "string" ? req.query.kind : "";
  const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : "";
  const assets = GAME_STUDIO_STOCK_ASSETS.filter((asset) => {
    const kindOk = !kind || asset.kind === kind;
    const qOk =
      !q ||
      asset.title.toLowerCase().includes(q) ||
      asset.tags.some((tag) => tag.toLowerCase().includes(q));
    return kindOk && qOk;
  });
  res.json({ assets: listGameStudioStockAssetDescriptors(assets) });
});

router.get("/api/game-studio/templates/:id/scaffold", (req, res) => {
  const template = findGameStudioTemplate(String(req.params.id || ""));
  if (!template) return res.status(404).json({ error: "Game studio template not found" });
  res.json(buildGameStudioScaffold(template.id));
});

router.post("/api/game-studio/scaffold", (req, res) => {
  res.json(buildGameStudioScaffold(String(req.body?.templateId || "")));
});

router.get("/api/game-studio/projects", isAuthenticated, async (req, res) => {
  try {
    res.json({ projects: await listGameStudioProjects(routeUserId(req)) });
  } catch (err) {
    sendGameStudioError(res, err, "Failed to list Game Studio projects");
  }
});

router.post("/api/game-studio/projects", isAuthenticated, async (req, res) => {
  try {
    const project = await createGameStudioProject({
      ownerUserId: routeUserId(req),
      title: req.body?.title,
      description: req.body?.description,
      templateId: req.body?.templateId,
      selectedAssetIds: req.body?.selectedAssetIds,
      localAssets: req.body?.localAssets,
      files: req.body?.files,
    });
    res.status(201).json({ project });
  } catch (err) {
    sendGameStudioError(res, err, "Failed to create Game Studio project");
  }
});

router.get("/api/game-studio/projects/:id", isAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid project id" });
    const project = await getGameStudioProject(routeUserId(req), id);
    if (!project) return res.status(404).json({ error: "Game Studio project not found" });
    res.json({ project });
  } catch (err) {
    sendGameStudioError(res, err, "Failed to load Game Studio project");
  }
});

router.patch("/api/game-studio/projects/:id", isAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid project id" });
    const project = await updateGameStudioProject({
      ownerUserId: routeUserId(req),
      id,
      title: req.body?.title,
      description: req.body?.description,
      templateId: req.body?.templateId,
      selectedAssetIds: req.body?.selectedAssetIds,
      localAssets: req.body?.localAssets,
      files: req.body?.files,
    });
    res.json({ project });
  } catch (err) {
    sendGameStudioError(res, err, "Failed to save Game Studio project");
  }
});

router.get("/api/game-studio/projects/:id/builds", isAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid project id" });
    res.json({
      builds: await listGameStudioProjectBuilds({
        ownerUserId: routeUserId(req),
        projectId: id,
        limit: Number(req.query.limit || 10),
      }),
    });
  } catch (err) {
    sendGameStudioError(res, err, "Failed to list Game Studio builds");
  }
});

router.post("/api/game-studio/projects/:id/build", isAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid project id" });
    res.json(await buildGameStudioProjectBundle({ ownerUserId: routeUserId(req), id }));
  } catch (err) {
    sendGameStudioError(res, err, "Failed to build Game Studio project");
  }
});

router.post("/api/game-studio/projects/:id/submit", isAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid project id" });
    res.status(201).json(
      await submitGameStudioProjectToConsole({
        ownerUserId: routeUserId(req),
        id,
        user: routeConsoleUser(req),
        title: req.body?.title,
        description: req.body?.description,
        category: req.body?.category,
        coverUri: req.body?.coverUri,
        updateSlug: req.body?.updateSlug,
        maxPossibleScore: req.body?.maxPossibleScore,
        maxScorePerSecond: req.body?.maxScorePerSecond,
      })
    );
  } catch (err) {
    sendGameStudioError(res, err, "Failed to submit Game Studio project");
  }
});

router.get("/api/game-studio/upload-target", (_req, res) => {
  res.json({
    endpoint: "/api/media/upload",
    method: "POST",
    fields: {
      mediaCategory: "game",
      title: "Required",
      mimeType: "application/zip",
      file: "multipart file or base64 fileData",
    },
    publishEndpoint: "/api/console/submit",
  });
});

router.get("/api/game-studio/assets/:id/raw", (req, res) => {
  const file = buildGameStudioStockAssetFile(String(req.params.id || ""));
  if (!file) return res.status(404).json({ error: "Stock asset not found" });
  res.type(file.contentType).send(file.bytes);
});

export default router;
