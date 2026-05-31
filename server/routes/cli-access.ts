import { Router, type Request } from "express";
import { isAuthenticated } from "../auth/passport";
import {
  evaluateBrowserRouteAccessForUser,
  listAccessibleBrowserRoutesForUser,
} from "../lib/browser-route-access";
import {
  formatBrowserRouteAccessDenied,
  type BrowserRouteAccessState,
} from "@shared/wtf-browser-route-access";
import { getWtfOsAccessForRoles } from "../lib/role-surface-access";

const router = Router();

function roleFromRequest(req: Request) {
  if (!req.user) return null;
  const user = req.user as any;
  return user.roles ?? user.role ?? null;
}

/** Avoid leaking surface/app metadata to anonymous route probes. */
function toPublicCanOpenResponse(state: BrowserRouteAccessState, signedIn: boolean) {
  if (state.allowed) {
    return { allowed: true as const, path: state.path, title: state.title };
  }
  const message = formatBrowserRouteAccessDenied(state);
  if (!signedIn) {
    return { allowed: false as const, message };
  }
  return {
    allowed: false as const,
    path: state.path,
    title: state.title,
    reason: state.reason,
    message,
  };
}

router.get("/api/cli/can-open", async (req, res) => {
  try {
    const path = String(req.query.path ?? "").trim();
    if (!path) {
      return res.status(400).json({ error: "path is required" });
    }

    const signedIn = Boolean(req.user);
    const role = roleFromRequest(req);
    const state = await evaluateBrowserRouteAccessForUser(path, role);
    return res.json(toPublicCanOpenResponse(state, signedIn));
  } catch (err) {
    console.error("[cli-access] can-open failed:", err);
    return res.status(500).json({ error: "Failed to evaluate browser route access" });
  }
});

router.get("/api/cli/routes", async (req, res) => {
  try {
    const role = roleFromRequest(req);
    const routes = await listAccessibleBrowserRoutesForUser(role);
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
