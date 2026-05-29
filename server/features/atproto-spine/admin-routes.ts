import type { Router } from "express";
import { requirePermission } from "../../auth/passport";
import { getSpineObservability } from "./observability";

/**
 * Admin observability routes (S5.1). Read-only; admin-gated via the existing permission
 * system. Additive — registered onto the admin router alongside the other admin surfaces.
 */
export function registerSpineAdminRoutes(router: Router): void {
  router.get(
    "/api/admin/atproto/observability",
    requirePermission("access_admin_panel"),
    async (_req, res) => {
      try {
        const data = await getSpineObservability();
        res.json(data);
      } catch (err) {
        console.error("[atproto-spine] observability failed:", err);
        res.status(500).json({ error: "Failed to load AT Protocol spine observability" });
      }
    },
  );
}
