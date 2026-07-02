import type { Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../auth/passport";
import { fetchAppHostJson } from "../features/apphost/proxy";

const router = Router();

function encodeAppHostId(value: string | string[] | undefined): string {
  return encodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "");
}

function appHostActor(req: Request) {
  const user = req.user as { id?: unknown; username?: unknown; displayName?: unknown } | undefined;
  return {
    userId: user?.id != null ? String(user.id) : null,
    username: typeof user?.username === "string" ? user.username : null,
    displayName: typeof user?.displayName === "string" ? user.displayName : null,
  };
}

async function proxyAppHost(res: Response, path: string, method: "GET" | "POST", body?: unknown) {
  try {
    const upstream = await fetchAppHostJson(path, {
      method,
      body: body == null ? undefined : JSON.stringify(body),
      headers: body == null ? undefined : { "Content-Type": "application/json" },
    });
    res.status(upstream.status).json(upstream.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      ok: false,
      error: "Application host is unavailable",
      detail: process.env.NODE_ENV === "production" ? undefined : message,
    });
  }
}

router.get("/api/apphost/health", isAuthenticated, (_req, res) =>
  proxyAppHost(res, "/health", "GET")
);

router.get("/api/apphost/apps", isAuthenticated, (_req, res) =>
  proxyAppHost(res, "/apps", "GET")
);

router.get("/api/apphost/apps/:id", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}`, "GET")
);

router.get("/api/apphost/apps/:id/status", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/status`, "GET")
);

router.get("/api/apphost/apps/:id/session", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/session`, "GET")
);

router.get("/api/apphost/apps/:id/snapshot", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/snapshot`, "GET")
);

router.post("/api/apphost/apps/:id/launch", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/launch`, "POST", {
    actor: appHostActor(req),
  })
);

router.post("/api/apphost/apps/:id/stop", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/stop`, "POST")
);

router.post("/api/apphost/apps/:id/input", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/input`, "POST", req.body)
);

router.post("/api/apphost/apps/:id/stream/offer", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/stream/offer`, "POST", req.body)
);

router.get("/api/apphost/apps/:id/stream/status", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/stream/status`, "GET")
);

router.post("/api/apphost/apps/:id/stream/stop", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/stream/stop`, "POST", req.body)
);

export default router;
