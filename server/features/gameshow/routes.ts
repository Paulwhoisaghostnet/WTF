import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticated, requirePermission } from "../../auth/passport";
import { hasPermission } from "../../lib/permissions";
import { listRolesForUserSnapshot } from "../../lib/user-roles";
import { gameshowComposer, gameshowProgress, gameshowService } from "./index";
import { gameshowCreateInputSchema, gameshowRoundPlanInputSchema } from "@shared/gameshow-plan-schema";
import { GAMESHOW_TOOLS } from "@shared/gameshow-tools";
import { GameshowError } from "./policy";
import provisioningRoutes from "./provisioning-routes";

const router = Router();
router.use(provisioningRoutes);
const id = z.coerce.number().int().positive();
const enrollment = z.object({ username: z.string().trim().min(1), status: z.enum(["active", "reserve"]).default("active") }).strict();

export function respondGameshowError(res: Response, error: unknown) {
  if (error instanceof GameshowError) return res.status(error.status).json({ error: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(issue => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; ") });
  console.error("[gameshow] request failed", error);
  return res.status(500).json({ error: "The gameshow action failed. Refresh to check its current state." });
}

function actor(req: Request) {
  return { userId: (req.user as { id: number }).id, ip: req.ip ?? null };
}

router.get("/api/gameshow/seasons/:id/stage", isAuthenticated, async (req, res) => {
  try {
    const roles = await listRolesForUserSnapshot(req.user as any);
    const canManage = await hasPermission(roles, "manage_gameshow");
    const canSubmit = await hasPermission(roles, "submit_challenges");
    res.set("Cache-Control", "private, no-store");
    res.json(await gameshowService.stage(id.parse(req.params.id), actor(req).userId, canManage, canSubmit));
  } catch (error) { respondGameshowError(res, error); }
});

router.post("/api/seasons/:id/contestants", isAuthenticated, requirePermission("manage_gameshow"), async (req, res) => {
  try {
    const input = enrollment.parse(req.body);
    res.json(await gameshowService.enroll(id.parse(req.params.id), input.username, input.status, actor(req)));
  } catch (error) { respondGameshowError(res, error); }
});

function transition(action: "start" | "close") {
  return async (req: Request, res: Response) => {
    try { res.json(await gameshowService.transition(id.parse(req.params.id), action, actor(req))); }
    catch (error) { respondGameshowError(res, error); }
  };
}
router.post("/api/rounds/:id/start", isAuthenticated, requirePermission("manage_gameshow"), transition("start"));
router.post("/api/rounds/:id/close", isAuthenticated, requirePermission("manage_gameshow"), transition("close"));

router.get("/api/gameshow/composer", isAuthenticated, requirePermission("manage_gameshow"), (_req, res) => {
  res.json({ version: 1, tools: GAMESHOW_TOOLS, roundPlanSchema: z.toJSONSchema(gameshowRoundPlanInputSchema),
    createSeasonSchema: z.toJSONSchema(gameshowCreateInputSchema), endpoints: { create: "/api/v1/gameshow/seasons", plan: "/api/v1/gameshow/rounds/:id/plan" } });
});

router.post("/api/gameshow/seasons", isAuthenticated, requirePermission("manage_gameshow"), async (req, res) => {
  try { res.status(201).json(await gameshowComposer.create(req.body, actor(req))); }
  catch (error) { respondGameshowError(res, error); }
});

router.get("/api/gameshow/rounds/:id/plan", isAuthenticated, requirePermission("manage_gameshow"), async (req, res) => {
  try { res.set("Cache-Control", "private, no-store").json(await gameshowComposer.plan(id.parse(req.params.id))); }
  catch (error) { respondGameshowError(res, error); }
});

router.put("/api/gameshow/rounds/:id/plan", isAuthenticated, requirePermission("manage_gameshow"), async (req, res) => {
  try { res.json(await gameshowComposer.savePlan(id.parse(req.params.id), req.body, actor(req))); }
  catch (error) { respondGameshowError(res, error); }
});

router.get("/api/gameshow/seasons/:id/progress", isAuthenticated, requirePermission("manage_gameshow"), async (req, res) => {
  try { res.set("Cache-Control", "private, no-store").json(await gameshowProgress(id.parse(req.params.id))); }
  catch (error) { respondGameshowError(res, error); }
});

export default router;
