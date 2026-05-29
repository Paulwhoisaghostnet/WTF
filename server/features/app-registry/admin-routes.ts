import { Router, type NextFunction, type Request, type Response } from "express";
import { requirePermission } from "../../auth/passport";
import { listRolesForUserSnapshot } from "../../lib/user-roles";
import { isAppRegistryEnabled } from "./config";
import {
  getRegistration,
  listRegistrations,
  summarizeRegistrations,
  transitionLifecycle,
} from "./registry-service";
import { disableAppKey, issueAppKey, revokeAppKey } from "./key-service";
import { runIntegrityVerification } from "./integrity-service";
import { previewInstall, runInstallWizard, type WizardSource } from "./wizard";
import { isLifecycleState } from "./lifecycle";
import { ALPHA_COHORT_ROLES } from "./availability";

/**
 * App Registry routes (Req2/Req3/Req4/Req5 / D5). All routes self-gate to 404
 * when APP_REGISTRY_ENABLED is off (mirrors the appview router idiom), so when
 * the flag is off the registry is fully inert and legacy behaviour is unchanged.
 *
 * Admin endpoints require manage_desktop_apps. The Install-New-App wizard is
 * additionally open to trusted_creator (the creator publishing surface).
 */

function disabled(res: Response): boolean {
  if (!isAppRegistryEnabled()) {
    res.status(404).json({ error: "app_registry_disabled" });
    return true;
  }
  return false;
}

/** Wizard guard: admins (manage_desktop_apps) OR trusted_creator. */
function requireAppPublisher() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    try {
      const user = req.user as { id?: number; role?: string; roles?: string[] };
      const roles = await listRolesForUserSnapshot(user);
      const isPublisher =
        roles.includes("admin") ||
        roles.includes("host") ||
        roles.some((role) => (ALPHA_COHORT_ROLES as readonly string[]).includes(role));
      if (isPublisher) return next();
      return res.status(403).json({ error: "Insufficient permissions" });
    } catch (err) {
      console.error("[app-registry] publisher check failed:", err);
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}

export function registerAppRegistryRoutes(router: Router): void {
  router.get(
    "/api/admin/app-registry/registrations",
    requirePermission("manage_desktop_apps"),
    async (_req, res) => {
      if (disabled(res)) return;
      try {
        const [registrations, summary] = await Promise.all([
          listRegistrations(),
          summarizeRegistrations(),
        ]);
        res.json({ registrations, summary });
      } catch (err) {
        console.error("[app-registry] list failed:", err);
        res.status(500).json({ error: "Failed to list app registrations" });
      }
    },
  );

  router.get(
    "/api/admin/app-registry/registrations/:appId",
    requirePermission("manage_desktop_apps"),
    async (req, res) => {
      if (disabled(res)) return;
      try {
        const registration = await getRegistration(String(req.params.appId));
        if (!registration) return res.status(404).json({ error: "registration_not_found" });
        res.json({ registration });
      } catch (err) {
        console.error("[app-registry] get failed:", err);
        res.status(500).json({ error: "Failed to load app registration" });
      }
    },
  );

  // Issue (or rotate) a key for an app, binding it to the current fingerprint.
  router.post(
    "/api/admin/app-registry/registrations/:appId/issue-key",
    requirePermission("manage_desktop_apps"),
    async (req, res) => {
      if (disabled(res)) return;
      try {
        const appId = String(req.params.appId);
        const user = req.user as { id?: number };
        const scopes = Array.isArray(req.body?.scopes) ? (req.body.scopes as string[]) : undefined;
        const issued = await issueAppKey(appId, { scopes, issuedBy: user?.id ?? null });
        if (!issued) return res.status(404).json({ error: "registration_not_found" });
        res.json({ ok: true, key: issued.key, prefix: issued.prefix, appId });
      } catch (err) {
        console.error("[app-registry] issue-key failed:", err);
        res.status(500).json({ error: "Failed to issue app key" });
      }
    },
  );

  router.post(
    "/api/admin/app-registry/registrations/:appId/disable-key",
    requirePermission("manage_desktop_apps"),
    async (req, res) => {
      if (disabled(res)) return;
      try {
        const appId = String(req.params.appId);
        const user = req.user as { id?: number };
        const reason = typeof req.body?.reason === "string" ? req.body.reason : "admin_disabled";
        const count = await disableAppKey(appId, reason, user?.id ?? null);
        res.json({ ok: true, disabled: count });
      } catch (err) {
        console.error("[app-registry] disable-key failed:", err);
        res.status(500).json({ error: "Failed to disable app key" });
      }
    },
  );

  router.post(
    "/api/admin/app-registry/registrations/:appId/revoke-key",
    requirePermission("manage_desktop_apps"),
    async (req, res) => {
      if (disabled(res)) return;
      try {
        const appId = String(req.params.appId);
        const user = req.user as { id?: number };
        const count = await revokeAppKey(appId, user?.id ?? null);
        res.json({ ok: true, revoked: count });
      } catch (err) {
        console.error("[app-registry] revoke-key failed:", err);
        res.status(500).json({ error: "Failed to revoke app key" });
      }
    },
  );

  // Generic lifecycle transition (e.g. alpha → published promote, disable, etc.).
  router.post(
    "/api/admin/app-registry/registrations/:appId/transition",
    requirePermission("manage_desktop_apps"),
    async (req, res) => {
      if (disabled(res)) return;
      try {
        const appId = String(req.params.appId);
        const to = req.body?.to;
        if (!isLifecycleState(to)) {
          return res.status(400).json({ error: "invalid_lifecycle_state" });
        }
        const user = req.user as { id?: number };
        const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : undefined;
        const result = await transitionLifecycle(appId, to, { actorUserId: user?.id ?? null, enabled });
        if (!result.ok) return res.status(400).json({ error: result.error });
        res.json({ ok: true, registration: result.registration });
      } catch (err) {
        console.error("[app-registry] transition failed:", err);
        res.status(500).json({ error: "Failed to transition app lifecycle" });
      }
    },
  );

  // Re-register: recompute fingerprint, rebind/reissue key, restore lifecycle.
  router.post(
    "/api/admin/app-registry/registrations/:appId/reregister",
    requirePermission("manage_desktop_apps"),
    async (req, res) => {
      if (disabled(res)) return;
      try {
        const appId = String(req.params.appId);
        const user = req.user as { id?: number };
        const current = await getRegistration(appId);
        if (!current) return res.status(404).json({ error: "registration_not_found" });
        const issued = await issueAppKey(appId, { issuedBy: user?.id ?? null, scopes: ["operate"] });
        const { lifecycleAfterReregister } = await import("./lifecycle");
        const restored = lifecycleAfterReregister(
          isLifecycleState(current.lifecycleState) ? current.lifecycleState : "registered",
        );
        const result = await transitionLifecycle(appId, restored, {
          actorUserId: user?.id ?? null,
        });
        res.json({ ok: true, key: issued?.key ?? null, registration: result.registration ?? current });
      } catch (err) {
        console.error("[app-registry] reregister failed:", err);
        res.status(500).json({ error: "Failed to re-register app" });
      }
    },
  );

  // Manual integrity sweep (also runs on a background cadence + at startup).
  router.post(
    "/api/admin/app-registry/verify-integrity",
    requirePermission("manage_desktop_apps"),
    async (_req, res) => {
      if (disabled(res)) return;
      try {
        const result = await runIntegrityVerification();
        res.json({ ok: true, ...result });
      } catch (err) {
        console.error("[app-registry] verify-integrity failed:", err);
        res.status(500).json({ error: "Failed to verify app integrity" });
      }
    },
  );

  // ── Install-New-App wizard (admins + trusted_creator) ──
  router.post(
    "/api/admin/app-registry/wizard/preview",
    requireAppPublisher(),
    async (req, res) => {
      if (disabled(res)) return;
      try {
        const source = parseWizardSource(req.body);
        if (!source) return res.status(400).json({ error: "invalid_source" });
        const result = await previewInstall(source);
        res.json(result);
      } catch (err) {
        console.error("[app-registry] wizard preview failed:", err);
        res.status(500).json({ error: "Failed to preview app install" });
      }
    },
  );

  router.post(
    "/api/admin/app-registry/wizard/install",
    requireAppPublisher(),
    async (req, res) => {
      if (disabled(res)) return;
      try {
        const source = parseWizardSource(req.body);
        if (!source) return res.status(400).json({ error: "invalid_source" });
        const user = req.user as { id?: number };
        const result = await runInstallWizard(source, { actorUserId: user?.id ?? null });
        if (!result.ok) return res.status(422).json({ ok: false, errors: result.errors });
        res.json(result);
      } catch (err) {
        console.error("[app-registry] wizard install failed:", err);
        res.status(500).json({ error: "Failed to install app" });
      }
    },
  );
}

function parseWizardSource(body: unknown): WizardSource | null {
  const input = body as Record<string, unknown> | null;
  if (!input || typeof input !== "object") return null;
  if (input.sourceType === "repo") {
    if (typeof input.owner !== "string" || typeof input.repo !== "string") return null;
    return {
      sourceType: "repo",
      owner: input.owner,
      repo: input.repo,
      ref: typeof input.ref === "string" ? input.ref : undefined,
      manifestPath: typeof input.manifestPath === "string" ? input.manifestPath : undefined,
      authToken: typeof input.authToken === "string" ? input.authToken : undefined,
    };
  }
  if (input.sourceType === "upload") {
    const rawFiles = Array.isArray(input.bundleFiles) ? input.bundleFiles : [];
    const bundleFiles = rawFiles
      .filter(
        (entry): entry is { path: string; sha256: string } =>
          Boolean(entry) &&
          typeof (entry as { path?: unknown }).path === "string" &&
          typeof (entry as { sha256?: unknown }).sha256 === "string",
      )
      .map((entry) => ({ path: entry.path, sha256: entry.sha256 }));
    return {
      sourceType: "upload",
      manifest: input.manifest,
      bundleFiles,
      buildHash: typeof input.buildHash === "string" ? input.buildHash : undefined,
      sourceRef: typeof input.sourceRef === "string" ? input.sourceRef : undefined,
    };
  }
  return null;
}
