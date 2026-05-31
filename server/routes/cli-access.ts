import { Router } from "express";
import { isAuthenticated } from "../auth/passport";
import {
  evaluateBrowserRouteAccessForUser,
  listAccessibleBrowserRoutesForUser,
} from "../lib/browser-route-access";
import { resolveCliAccessContext } from "../lib/cli-access-context";
import { toPublicCanOpenResponse } from "../lib/cli-access-response";
import { getWtfOsAccessForRoles } from "../lib/role-surface-access";

const router = Router();

router.get("/api/cli/can-open", async (req, res) => {
  try {
    const path = String(req.query.path ?? "").trim();
    if (!path) {
      return res.status(400).json({ error: "path is required" });
    }

    const signedIn = Boolean(req.user);
    const { role, accessSurfaceIds } = await resolveCliAccessContext(req);
    const state = await evaluateBrowserRouteAccessForUser(path, role, { accessSurfaceIds });
    return res.json(toPublicCanOpenResponse(state, signedIn));
  } catch (err) {
    console.error("[cli-access] can-open failed:", err);
    return res.status(500).json({ error: "Failed to evaluate browser route access" });
  }
});

router.get("/api/cli/routes", async (req, res) => {
  try {
    const { role, accessSurfaceIds } = await resolveCliAccessContext(req);
    const routes = await listAccessibleBrowserRoutesForUser(role, { accessSurfaceIds });
    return res.json({ routes, signedIn: Boolean(req.user) });
  } catch (err) {
    console.error("[cli-access] routes failed:", err);
    return res.status(500).json({ error: "Failed to list accessible browser routes" });
  }
});

router.get("/api/cli/session", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const roles = user?.roles ?? (user?.role ? [user.role] : []);
  const wtfOsAccess = user?.wtfOsAccess ?? (await getWtfOsAccessForRoles(roles));
  return res.json({
    username: user?.username ?? null,
    displayName: user?.displayName ?? user?.name ?? null,
    role: user?.role ?? null,
    roles,
    wtfOsAccess,
  });
});

export default router;
