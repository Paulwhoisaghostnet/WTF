import type { NextFunction, Request, Response } from "express";
import { logSystemEvent, type SystemLogInput } from "./system-log";

const AUDITED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isAdminMutationAuditCandidate(req: Request): boolean {
  const method = String(req.method || "").toUpperCase();
  if (!AUDITED_METHODS.has(method)) return false;

  const path = requestPath(req);
  return path === "/api/admin" || path.startsWith("/api/admin/");
}

function requestPath(req: Request): string {
  const rawUrl = String(req.originalUrl || req.url || req.path || "");
  return rawUrl.split("?", 1)[0] || rawUrl;
}

function requestUserId(req: Request): number | null {
  const parsed = Number((req.user as { id?: unknown } | undefined)?.id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildAdminMutationAuditInput(req: Request, res: Response): SystemLogInput {
  const method = String(req.method || "").toUpperCase();
  const path = requestPath(req);
  const user = req.user as { id?: unknown; role?: unknown; username?: unknown } | undefined;

  return {
    source: "admin",
    eventType: "admin_mutation",
    severity: "info",
    message: `${method} ${path} -> ${res.statusCode}`,
    userId: requestUserId(req),
    method,
    path,
    statusCode: res.statusCode,
    ip: req.ip,
    userAgent:
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : null,
    metadata: {
      phaseRule: "P6.CA2/08",
      routePath: req.route?.path ?? null,
      params: req.params ?? {},
      query: req.query ?? {},
      body: req.body ?? null,
      actor: {
        id: user?.id ?? null,
        username: user?.username ?? null,
        role: user?.role ?? null,
      },
    },
  };
}

export function createAdminMutationAuditMiddleware(
  deps: { logSystemEvent?: (input: SystemLogInput) => unknown } = {}
) {
  const writeAudit = deps.logSystemEvent ?? logSystemEvent;

  return (req: Request, res: Response, next: NextFunction) => {
    if (!isAdminMutationAuditCandidate(req)) return next();

    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 400) return;
      writeAudit(buildAdminMutationAuditInput(req, res));
    });

    next();
  };
}
