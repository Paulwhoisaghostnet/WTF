import type { Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../auth/passport";
import { fetchAppHostJson } from "../features/apphost/proxy";

const router = Router();
const DEFAULT_APPHOST_LAUNCH_TIMEOUT_MS = 390_000;
const DEFAULT_APPHOST_INTERACTIVE_TIMEOUT_MS = 30_000;
const DEFAULT_APPHOST_INPUT_TIMEOUT_MS = 2_000;

function appHostLaunchTimeoutMs(): number {
  const timeout = Number(process.env.WTFOS_APPHOST_LAUNCH_TIMEOUT_MS || DEFAULT_APPHOST_LAUNCH_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_APPHOST_LAUNCH_TIMEOUT_MS;
}

function appHostInteractiveTimeoutMs(): number {
  const timeout = Number(process.env.WTFOS_APPHOST_INTERACTIVE_TIMEOUT_MS || DEFAULT_APPHOST_INTERACTIVE_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_APPHOST_INTERACTIVE_TIMEOUT_MS;
}

function appHostInputTimeoutMs(): number {
  const timeout = Number(process.env.WTFOS_APPHOST_INPUT_TIMEOUT_MS || DEFAULT_APPHOST_INPUT_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_APPHOST_INPUT_TIMEOUT_MS;
}

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

async function proxyAppHost(
  res: Response,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  options: { timeoutMs?: number } = {},
) {
  try {
    const upstream = await fetchAppHostJson(path, {
      method,
      body: body == null ? undefined : JSON.stringify(body),
      headers: body == null ? undefined : { "Content-Type": "application/json" },
      timeoutMs: options.timeoutMs,
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
  proxyAppHost(res, "/apps", "GET", undefined, { timeoutMs: appHostInteractiveTimeoutMs() })
);

router.get("/api/apphost/apps/:id", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}`, "GET", undefined, { timeoutMs: appHostInteractiveTimeoutMs() })
);

router.get("/api/apphost/apps/:id/status", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/status`, "GET", undefined, { timeoutMs: appHostInteractiveTimeoutMs() })
);

router.get("/api/apphost/apps/:id/session", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/session`, "GET", undefined, { timeoutMs: appHostInteractiveTimeoutMs() })
);

router.get("/api/apphost/apps/:id/snapshot", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/snapshot`, "GET", undefined, { timeoutMs: appHostInteractiveTimeoutMs() })
);

router.post("/api/apphost/apps/:id/launch", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/launch`, "POST", {
    actor: appHostActor(req),
  }, { timeoutMs: appHostLaunchTimeoutMs() })
);

router.post("/api/apphost/apps/:id/stop", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/stop`, "POST", undefined, { timeoutMs: appHostInteractiveTimeoutMs() })
);

router.post("/api/apphost/apps/:id/input", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/input`, "POST", req.body, { timeoutMs: appHostInputTimeoutMs() })
);

router.post("/api/apphost/apps/:id/stream/offer", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/stream/offer`, "POST", req.body, { timeoutMs: appHostInteractiveTimeoutMs() })
);

router.get("/api/apphost/apps/:id/stream/status", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/stream/status`, "GET", undefined, { timeoutMs: appHostInteractiveTimeoutMs() })
);

router.post("/api/apphost/apps/:id/stream/stop", isAuthenticated, (req, res) =>
  proxyAppHost(res, `/apps/${encodeAppHostId(req.params.id)}/stream/stop`, "POST", req.body, { timeoutMs: appHostInteractiveTimeoutMs() })
);

export default router;
